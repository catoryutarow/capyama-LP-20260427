#!/bin/bash
set -euo pipefail

# ============================================================
#  一度きりの nginx 設定追加スクリプト
#  spollup.jp/cap-yamamoto/ を静的配信するための location 追加
#  idempotent: 既に追加済みなら何もしない
# ============================================================

SSH_KEY="${SSH_KEY:-/Users/ryutaro/Downloads/spollup.pem}"
SSH_USER="${SSH_USER:-ec2-user}"
SSH_HOST="${SSH_HOST:-spollup.jp}"
REMOTE_CONF="${REMOTE_CONF:-/etc/nginx/conf.d/spollupjp.conf}"
REMOTE_DIR="${REMOTE_DIR:-/usr/share/nginx/corp/cap-yamamoto}"

SSH_CMD="ssh -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[SETUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# ----------------------------------------------------------
# Step 1: 既に追加済みかチェック (idempotent)
# ----------------------------------------------------------
if $SSH_CMD "sudo grep -q 'cap-yamamoto' ${REMOTE_CONF}" 2>/dev/null; then
  log "${REMOTE_CONF} には既に cap-yamamoto ブロックがあります。スキップ。"
  exit 0
fi

# ----------------------------------------------------------
# Step 2: ターゲットディレクトリを先に作る (空でも nginx は 404 で耐える)
# ----------------------------------------------------------
log "Step 1/6: ${REMOTE_DIR} を作成 (空ディレクトリ)"
$SSH_CMD "sudo mkdir -p ${REMOTE_DIR} && sudo chown ec2-user:webgroup ${REMOTE_DIR} && sudo chmod 2775 ${REMOTE_DIR}"

# ----------------------------------------------------------
# Step 3: 現在の nginx 設定をローカルに取得
# ----------------------------------------------------------
log "Step 2/6: 現在の ${REMOTE_CONF} を取得"
$SSH_CMD "sudo cat ${REMOTE_CONF}" > /tmp/spollupjp.conf.current

# ----------------------------------------------------------
# Step 4: ローカルで location ブロックを挿入
#   location / { ... } の直前に追加。WP の try_files より優先される。
# ----------------------------------------------------------
log "Step 3/6: location ブロックを挿入 (ローカル処理)"
python3 <<'PY' > /tmp/spollupjp.conf.new
with open('/tmp/spollupjp.conf.current') as f:
    content = f.read()

new_block = """    # キャプテン山本LP (静的サイト) — WP の try_files より優先
    location ^~ /cap-yamamoto/ {
        alias /usr/share/nginx/corp/cap-yamamoto/;
        try_files $uri $uri/ /cap-yamamoto/index.html =404;
        index index.html;

        location ~* \\.(?:ico|css|js|gif|jpe?g|png|woff2?|eot|ttf|otf|svg|mp4|webp|avif)$ {
            expires 7d;
            log_not_found off;
            access_log off;
        }
    }

"""

marker = '    # WordPress 用の基本的な設定\n    location /'
if marker not in content:
    raise SystemExit("ERROR: insertion marker not found in spollupjp.conf — config may have drifted")

import sys
sys.stdout.write(content.replace(marker, new_block + marker, 1))
PY

# ----------------------------------------------------------
# Step 5: サーバ側でバックアップを取り、新設定を配置
# ----------------------------------------------------------
TS=$(date +%Y%m%d_%H%M%S)
BACKUP="${REMOTE_CONF}.bak.${TS}"

log "Step 4/6: バックアップ ${BACKUP}"
$SSH_CMD "sudo cp ${REMOTE_CONF} ${BACKUP}"

log "Step 5/6: 新設定を /tmp 経由で配置"
scp -i "${SSH_KEY}" /tmp/spollupjp.conf.new "${SSH_USER}@${SSH_HOST}:/tmp/spollupjp.conf.new"
$SSH_CMD "sudo mv /tmp/spollupjp.conf.new ${REMOTE_CONF} && sudo chown root:root ${REMOTE_CONF} && sudo chmod 644 ${REMOTE_CONF}"

# ----------------------------------------------------------
# Step 6: nginx -t で構文チェック → 成功なら reload、失敗なら自動ロールバック
# ----------------------------------------------------------
log "Step 6/6: nginx -t (構文チェック)"
if $SSH_CMD "sudo nginx -t" 2>&1; then
  $SSH_CMD "sudo nginx -s reload"
  log "nginx reload 完了。バックアップ: ${BACKUP}"
  log "次のステップ: ./scripts/deploy.sh apply で dist/ を rsync"
else
  err "nginx -t 失敗。自動ロールバック中..."
  $SSH_CMD "sudo cp ${BACKUP} ${REMOTE_CONF}"
  err "ロールバック完了。${REMOTE_CONF} は元の状態に戻りました。"
  exit 1
fi
