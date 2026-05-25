# spollup.jp/cap-yamamoto デプロイガイド (AI エージェント向け)

> このドキュメントは、本サイト `https://spollup.jp/cap-yamamoto/` の
> 更新作業を担当する **AI エージェントが安全にデプロイを実施するための運用リファレンス**です。
> アーキテクチャの全体像は別ファイル `docs/spollup-cap-yamamoto-explainer.md` を参照。

---

## ⚠️ 最初に読むこと: 致命的な前提

このサイトは **spollup.jp 本体 (WordPress) と同じ EC2 インスタンス上**にホストされています。
誤操作で本体まで巻き込んで停止させる可能性があります。

**いかなる場合も以下を守ること:**

1. **rsync の `--delete` を `/usr/share/nginx/corp/cap-yamamoto/` 以外に向けない**
   親ディレクトリ `/usr/share/nginx/corp/` には WP 本体ファイルがあり、消すと spollup.jp が停止する。
2. **nginx 設定ファイル (`/etc/nginx/conf.d/*.conf`) を直接 `sed` や `vi` や `echo >>` で書き換えない**
   構文エラー発生時に spollup.jp 全体が落ちる。必要なら `scripts/setup-nginx.sh` 経由のみ。
3. **既存スクリプト (`scripts/deploy.sh`, `scripts/setup-nginx.sh`) を必ず使う**
   ad-hoc な `scp` / `ssh` ワンライナーは禁止。スクリプトは自動バックアップ・自動検証・自動ロールバックを内蔵。
4. **後述「禁止操作一覧」のいずれも実行しない**
   不明な場合は人間オペレータに確認するまで停止すること。

---

## サイト基本情報

| 項目 | 値 |
|---|---|
| 公開 URL | `https://spollup.jp/cap-yamamoto/` |
| ホスト | `spollup.jp` (AWS EC2 `formbase` インスタンス) |
| OS | Amazon Linux 2 |
| Web サーバ | nginx 1.22.1 |
| 配信パス (サーバ) | `/usr/share/nginx/corp/cap-yamamoto/` |
| 所有者 / mode | `ec2-user:webgroup` / `2775` |
| 同居サービス | spollup.jp 本体 (WordPress + PHP-FPM on `/usr/share/nginx/corp/`) |
| nginx config | `/etc/nginx/conf.d/spollupjp.conf` (本サイト用 `location ^~ /cap-yamamoto/` を含む) |
| ローカル build 出力 | `dist/` (Vite, base path `/cap-yamamoto/`) |

## SSH 接続情報

| 項目 | 値 |
|---|---|
| ユーザ | `ec2-user` |
| 鍵 | `/Users/ryutaro/Downloads/spollup.pem` (オペレータ所有, **絶対に複製・送信・コミットしない**) |
| 接続元 IP 許可 | `125.103.103.22/32` を SG `ryutaro-claude-deploy-temp` で許可 |

接続元 IP が違う環境から実行する場合は SG の追加が必要。
**SG 変更は AWS Console で人間オペレータが実施する。エージェントは指示で待つこと。**

---

## 標準デプロイフロー

```bash
# 1. ビルド (Vite が dist/ に /cap-yamamoto/ base path 付きで出力)
npm run build

# 2. デプロイ (バックアップ + rsync + 健全性チェック + 必要なら自動ロールバック)
./scripts/deploy.sh apply
```

これだけ。**個別の `scp` や `ssh "rm ..."` を打つ必要はない**。

### `scripts/deploy.sh` がやること

1. **SSH 疎通テスト** (失敗時 exit、何も書き換えない)
2. **リモートで tar.gz バックアップ作成** → `/home/ec2-user/backups/cap-yamamoto/cap-yamamoto_<TS>.tar.gz`
3. **`rsync -av --delete dist/ → /usr/share/nginx/corp/cap-yamamoto/`** (delete は cap-yamamoto/ 配下のみ)
4. **所有者再設定** `chown -R ec2-user:webgroup`
5. **健全性チェック** `curl https://spollup.jp/cap-yamamoto/` で HTTP 200 を確認
6. **失敗時の自動ロールバック** (バックアップが存在する場合のみ)

### モード

| コマンド | 用途 |
|---|---|
| `./scripts/deploy.sh plan` | dry-run。差分のみ表示。サーバには書き込まない。 |
| `./scripts/deploy.sh apply` | 本番反映。 |
| `./scripts/deploy.sh rollback` | 最新バックアップを書き戻す。 |

---

## 初回セットアップ (通常は不要、参考)

サーバ側の nginx 設定 (`/cap-yamamoto/` を本サイト配下に向ける location ブロック) は
**既に追加済み**。再実行しても冪等 (idempotent) なので安全だが、通常エージェントが触る必要はない。

```bash
./scripts/setup-nginx.sh
```

- 既に `cap-yamamoto` ブロックが含まれていればスキップ
- 新規追加時は `${REMOTE_CONF}.bak.<TS>` バックアップを作成
- `nginx -t` で構文検証 → 通れば `nginx -s reload`
- 検証失敗時はバックアップから自動復元

---

## 健全性チェック (デプロイ後の確認手順)

```bash
# (1) 本サイトが HTTP 200 を返すか
curl -sI https://spollup.jp/cap-yamamoto/ | head -1

# (2) 期待するアセット (CSS/JS) がリンクされているか (ハッシュ名はビルドごとに変わる)
curl -s https://spollup.jp/cap-yamamoto/ | grep -oE 'assets/index-[^.]+\.(css|js)'

# (3) spollup.jp 本体も生きているか (落ちていたら本サイト側起因の可能性が高い)
curl -sI https://spollup.jp/ | head -1
```

ブラウザでビジュアル確認する場合は **キャッシュバイパス**のために URL に
`?v=<日付>` を付けるのが確実 (Vite はアセットのハッシュは更新するが `index.html` 自体は
キャッシュされる場合がある):

```
https://spollup.jp/cap-yamamoto/?v=2026-05-26
```

---

## 緊急ロールバック

直前のバックアップに戻したいとき:

```bash
./scripts/deploy.sh rollback
```

任意の世代に戻したいとき: バックアップは `/home/ec2-user/backups/cap-yamamoto/` に
日付付きで保管されている。**手動展開は禁止**。必要なら人間オペレータに依頼。

---

## 禁止操作一覧 (実行禁止)

| 操作 | 起きること |
|---|---|
| `rsync --delete` の宛先を `/usr/share/nginx/corp/` 以外に変える | WP 本体ファイル消失 → spollup.jp 全停止 |
| `sudo rm -rf` を任意のパスに対して実行 | 不可逆破壊 |
| `/etc/nginx/conf.d/*.conf` を直接 `sed` / `vi` / `echo >>` で書き換える | 構文エラーで spollup.jp 全停止 |
| `sudo nginx -s reload` を `sudo nginx -t` の成功確認なしに実行 | 同上 |
| `sudo systemctl stop nginx` / `php-fpm` / `mysql` 等 | spollup.jp 停止 |
| WordPress DB (MySQL) に `wp-cli` や `mysql` で書き込み | DB 破壊 → 本体停止 |
| `aws ec2 terminate-instances` / `aws iam *` 等 | (説明不要) |
| EBS volume の detach / snapshot の delete | 本番ボリューム消失 |
| Security Group ルールの追加・削除 (CLI/Console 両方) | 接続喪失リスク。人間オペレータの責任範囲 |
| `.pem` ファイルを Git commit / コピー / 外部送信 | 鍵漏洩。**絶対不可** |
| 本ドキュメントに記載のないパス (`/etc/`, `/home/` の他人ディレクトリ, `/var/log/` 等) への書き込み | サーバ全体への影響不明 |
| `git push --force` を `main` ブランチに対して | リモートの履歴破壊 |
| GitHub Actions の Workflow 追加 (デプロイ自動化) | 現状 IP 制限 SG では動かない。人間オペレータと方針相談が必須 |

「禁止操作一覧」に該当しないが**判断に迷うコマンド**を実行する前に、必ず人間オペレータに
確認すること。沈黙して停止 (no-op) する方が、誤実行より常に安全。

---

## よくある作業の最小手順

### コンテンツ更新 (HTML/CSS/JS の変更)

```bash
npm run build && ./scripts/deploy.sh apply
git add -A && git commit -m "<変更内容>" && git push origin main
```

### YouTube カルーセル動画の再取得

```bash
npm run fetch:videos   # src/data/videos.json を更新 (Shorts 除外、長編のみ)
# ↑ 失敗しても build を止めないよう exit 0 設計。長編 0 本になる場合は既存値を維持。
npm run build && ./scripts/deploy.sh apply
```

### 画像・favicon の追加・差し替え

`public/` 配下に置く → `npm run build` で `dist/` に自動コピー → `./scripts/deploy.sh apply`。
**サーバ側で直接 `vi` / `cp` するのは禁止** (差分管理ができない)。

---

## ファイル所有権の注意

- WP の Apache/Nginx 実行ユーザは `nginx` (グループ `webgroup`)
- 本サイトファイルは `ec2-user:webgroup` mode `2775` で運用
- `2775` の先頭 `2` (setgid) により、新規ファイルもグループ `webgroup` を継承
- `scripts/deploy.sh` の Step 3 で chown を毎回再設定 (rsync 後の owner ずれ防止)

これらを変更する必要が出た場合は、設計に関わるため人間オペレータに必ず相談。

---

## トラブル時のエスカレーション

以下のいずれかに当てはまる場合は **作業を停止し、人間オペレータに報告**:

- `./scripts/deploy.sh apply` が rollback まで成功して動作復旧したが、原因が不明
- `curl https://spollup.jp/cap-yamamoto/` が 200 以外を返し、rollback してもなお
- `curl https://spollup.jp/` (本体) が 5xx を返すようになった
- SSH 接続が突然できなくなった (SG / 鍵 / インスタンス停止のいずれか)
- nginx config の編集後に `nginx -t` が失敗

エスカレーション時の連絡先 / 体制は本ドキュメント外で管理。

---

## 参考ファイル

| パス | 内容 |
|---|---|
| `docs/spollup-cap-yamamoto-explainer.md` | アーキテクチャ全体像 (DNS → EC2 → nginx → 配信) を初学者向けに解説 |
| `scripts/deploy.sh` | 標準デプロイスクリプト (plan / apply / rollback) |
| `scripts/setup-nginx.sh` | 初回 nginx 設定 (冪等) |
| `scripts/fetch-youtube.js` | YouTube RSS から長編動画を取得して `src/data/videos.json` 更新 |
| `vite.config.js` | `base: '/cap-yamamoto/'` を設定 |
| `public/robots.txt` | 公開設定 (`User-agent: * / Allow: /`) |
