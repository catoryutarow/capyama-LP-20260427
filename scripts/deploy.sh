#!/bin/bash
set -euo pipefail

# ============================================================
#  yamamoto-LP デプロイスクリプト
#  用途: ローカル dist/ を spollup.jp/cap-yamamoto/ に同期
# ============================================================

# --- 設定 (★ TBD: エンジニアさん回答待ち) -----------------
SSH_KEY="${SSH_KEY:-/Users/ryutaro/Downloads/spollup.pem}"
SSH_USER="${SSH_USER:-ec2-user}"
SSH_HOST="${SSH_HOST:-spollup.jp}"                                # 3.113.139.207 (formbase)
REMOTE_PATH="${REMOTE_PATH:-/usr/share/nginx/corp/cap-yamamoto}"  # WP DocumentRoot 配下
FILE_OWNER="${FILE_OWNER:-ec2-user:webgroup}"                     # 既存WPファイルと同じ所有
LOCAL_DIST="${LOCAL_DIST:-$(cd "$(dirname "$0")/.." && pwd)/dist}"
SITE_URL="${SITE_URL:-https://spollup.jp/cap-yamamoto/}"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/home/ec2-user/backups/cap-yamamoto}"
# -------------------------------------------------------------

SSH_CMD="ssh -i ${SSH_KEY} ${SSH_USER}@${SSH_HOST}"
RSYNC_SSH="ssh -i ${SSH_KEY}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

MODE="${1:-}"
if [ "$MODE" != "plan" ] && [ "$MODE" != "apply" ] && [ "$MODE" != "rollback" ]; then
  echo "使い方:"
  echo "  ./scripts/deploy.sh plan      # 差分確認 (dry-run)"
  echo "  ./scripts/deploy.sh apply     # デプロイ実行"
  echo "  ./scripts/deploy.sh rollback  # 直前バックアップに戻す"
  exit 1
fi

# Step 0: ローカル dist/ 存在チェック
if [ ! -d "${LOCAL_DIST}" ]; then
  err "${LOCAL_DIST} が見つかりません。先に 'npm run build' を実行してください。"
  exit 1
fi

# Step 1: SSH 疎通
log "SSH 接続テスト → ${SSH_USER}@${SSH_HOST}"
if ! $SSH_CMD -o ConnectTimeout=10 -o BatchMode=yes "echo ok" > /dev/null 2>&1; then
  err "SSH 接続失敗。鍵 (${SSH_KEY})・ホスト・SG (port 22) を確認してください。"
  exit 1
fi
log "SSH OK"

# Step 2: リモートパスの存在 (apply/plan 共通で確認)
REMOTE_PARENT="$(dirname "${REMOTE_PATH}")"
if ! $SSH_CMD "test -d ${REMOTE_PARENT}" 2>/dev/null; then
  err "リモート親ディレクトリ ${REMOTE_PARENT} がありません。エンジニアさんに DocumentRoot を再確認してください。"
  exit 1
fi

# ============================================================
#  plan: dry-run
# ============================================================
if [ "$MODE" = "plan" ]; then
  log "===== PLAN (dry-run) ====="
  log "rsync で同期される差分:"
  $SSH_CMD "sudo mkdir -p ${REMOTE_PATH}" 2>/dev/null || true
  rsync -rlczvn --delete --omit-dir-times \
    --exclude='.DS_Store' \
    --exclude='*.log' \
    -e "${RSYNC_SSH}" \
    "${LOCAL_DIST}/" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"
  echo
  log "plan 完了。問題なければ './scripts/deploy.sh apply' で実行してください。"
  exit 0
fi

# ============================================================
#  rollback: 直前バックアップ復元
# ============================================================
if [ "$MODE" = "rollback" ]; then
  log "===== ROLLBACK ====="
  LATEST=$($SSH_CMD "ls -t ${REMOTE_BACKUP_DIR}/cap-yamamoto_*.tar.gz 2>/dev/null | head -1" || true)
  if [ -z "$LATEST" ]; then
    err "バックアップがありません (${REMOTE_BACKUP_DIR})"
    exit 1
  fi
  log "復元元: ${LATEST}"
  read -p "本当にロールバックしますか？ (y/N): " confirm
  [ "$confirm" = "y" ] || { log "キャンセル"; exit 0; }
  $SSH_CMD "sudo rm -rf ${REMOTE_PATH} && sudo mkdir -p ${REMOTE_PATH} && sudo tar xzf ${LATEST} -C ${REMOTE_PATH} --strip-components=1 && sudo chown -R ${FILE_OWNER} ${REMOTE_PATH}"
  log "ロールバック完了。URL: ${SITE_URL}"
  exit 0
fi

# ============================================================
#  apply: デプロイ実行
# ============================================================
log "===== DEPLOY START ====="
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="cap-yamamoto_${TIMESTAMP}.tar.gz"

# Step 3: 既存ディレクトリのバックアップ (初回はスキップ)
log "Step 1/4: バックアップ ${REMOTE_BACKUP_DIR}/${BACKUP_FILE}"
if $SSH_CMD "test -d ${REMOTE_PATH} && [ \"\$(ls -A ${REMOTE_PATH} 2>/dev/null)\" ]" 2>/dev/null; then
  $SSH_CMD "mkdir -p ${REMOTE_BACKUP_DIR} && sudo tar czf ${REMOTE_BACKUP_DIR}/${BACKUP_FILE} -C $(dirname ${REMOTE_PATH}) $(basename ${REMOTE_PATH})"
  log "バックアップ完了"
else
  warn "既存ディレクトリ空 or 未作成 → 初回デプロイとしてバックアップスキップ"
  $SSH_CMD "sudo mkdir -p ${REMOTE_PATH}"
fi

# Step 4: rsync 同期
log "Step 2/4: rsync 同期..."
rsync -rlczv --delete --omit-dir-times \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  -e "${RSYNC_SSH}" \
  "${LOCAL_DIST}/" "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}/"

# Step 5: 所有者調整
log "Step 3/4: 所有者を ${FILE_OWNER} に設定"
$SSH_CMD "sudo chown -R ${FILE_OWNER} ${REMOTE_PATH}"

# Step 6: ヘルスチェック
log "Step 4/4: ヘルスチェック → ${SITE_URL}"
sleep 2
HTTP_AFTER=$(curl -sL -o /dev/null -w "%{http_code}" "${SITE_URL}")
if [ "$HTTP_AFTER" = "200" ]; then
  log "デプロイ成功 (HTTP ${HTTP_AFTER})"
  echo
  log "===== DEPLOY COMPLETE ====="
  log "確認: ${SITE_URL}"
  log "ロールバック: ./scripts/deploy.sh rollback"
else
  err "デプロイ後ヘルスチェック異常 (HTTP ${HTTP_AFTER})"
  err "自動ロールバックを試みます..."
  if [ -n "${BACKUP_FILE:-}" ] && $SSH_CMD "test -f ${REMOTE_BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null; then
    $SSH_CMD "sudo rm -rf ${REMOTE_PATH} && sudo mkdir -p ${REMOTE_PATH} && sudo tar xzf ${REMOTE_BACKUP_DIR}/${BACKUP_FILE} -C $(dirname ${REMOTE_PATH}) && sudo chown -R ${FILE_OWNER} ${REMOTE_PATH}"
    HTTP_RB=$(curl -sL -o /dev/null -w "%{http_code}" "${SITE_URL}")
    if [ "$HTTP_RB" = "200" ]; then
      log "自動ロールバック成功 (HTTP ${HTTP_RB})"
    else
      err "ロールバック後も異常 (HTTP ${HTTP_RB})。手動対応が必要です。"
    fi
  else
    warn "バックアップなし (初回) → ロールバック対象なし。nginx 側で /cap-yamamoto/ の location 設定が必要かもしれません。"
  fi
  exit 1
fi
