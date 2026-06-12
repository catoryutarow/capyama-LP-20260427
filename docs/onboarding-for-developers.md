# 引き継ぎガイド (人間の開発者向け)

> このドキュメントは、加藤 (ryutaro@motechoro.jp) 以外の開発者が
> 本サイト `https://spollup.jp/cap-yamamoto/` の運用・更新を引き継ぐ際の
> **オンボーディング手順**です。
>
> AI エージェント向けの運用手順は `docs/deploy-guide-for-agents.md` を参照。
> アーキテクチャ全体像は `docs/spollup-cap-yamamoto-explainer.md` を参照。

---

## 0. このサイトの位置付け (前提)

- **公開 URL**: `https://spollup.jp/cap-yamamoto/`
- **正体**: 株式会社スポルアップ「キャプテン山本 (山本慎二郎)」紹介LP (Vite + Vanilla JS)
- **ホスト**: spollup.jp 本体 (WordPress) と **同じ EC2 インスタンス**の `/cap-yamamoto/` サブパス配信
- **同居リスク**: 操作を誤ると spollup.jp 本体まで巻き込んで落ちる
- **リポジトリ**: GitHub `catoryutarow/capyama-LP-20260427` (private)

---

## 1. 引き継ぎ前に受け渡してもらう必要があるもの

加藤さん (前任) から **別経路 (1Password 共有 / 暗号化メール等)** で受け取るもの:

| 項目 | 用途 | 受け渡し経路 |
|---|---|---|
| SSH 秘密鍵 `spollup.pem` | EC2 への SSH 接続用 | **絶対に Git/Slack/メール本文に貼らない**。1Password の共有 vault か、暗号化 zip + 別経路パスワード |
| AWS Console のアクセス権 | Security Group に自分の IP を追加するため | IAM ユーザの新規発行 or 既存ユーザへの権限付与 (EC2 SG 編集権限) |
| GitHub リポジトリ `catoryutarow/capyama-LP-20260427` の Collaborator 権限 | コードの clone / push | GitHub 招待 |
| (任意) Google Analytics プロパティ `G-25HYJ9EDT3` のアクセス権 | 計測データ閲覧 | GA4 管理画面から招待 |
| (任意) Google Search Console の所有権 | SEO/インデックス確認 | GSC から所有権共有 |

**鍵ファイルは Git で管理されていません** (`.gitignore` 対象外でもそもそも `dist/` 同様コミットしていない)。
受け取った `.pem` は `chmod 600 spollup.pem` で権限を絞ってから保管。

---

## 2. ローカル環境構築

### 必要なツール

| ツール | 推奨バージョン | 用途 |
|---|---|---|
| Node.js | 20.x 以上 | Vite ビルド |
| npm | 10.x 以上 | パッケージ管理 |
| Git | 2.x | バージョン管理 |
| rsync | 3.x | デプロイ (macOS / Linux 標準同梱) |
| OpenSSH (`ssh`) | 標準 | 同上 |

```bash
# Node の例 (Homebrew)
brew install node
node -v   # v20+

# あるいは nvm
nvm install 20 && nvm use 20
```

### clone とセットアップ

```bash
# 1. clone (作業ディレクトリは任意)
git clone git@github.com:catoryutarow/capyama-LP-20260427.git yamamoto-LP
cd yamamoto-LP

# 2. 依存インストール
npm install

# 3. SSH 鍵を任意の場所に配置 (例: ~/.ssh/spollup.pem)
mv ~/Downloads/spollup.pem ~/.ssh/spollup.pem
chmod 600 ~/.ssh/spollup.pem

# 4. デプロイスクリプトに鍵パスを伝える方法は 2 つ
#    (A) 環境変数で都度指定 (推奨。リポジトリを汚さない)
export SSH_KEY=~/.ssh/spollup.pem
#    (B) シェルの ~/.zshrc / ~/.bashrc に export を書いて永続化
```

### ローカル開発サーバ起動

```bash
npm run dev
# → http://localhost:5173/cap-yamamoto/ で確認 (base path 注意)
```

`vite.config.js` で `base: '/cap-yamamoto/'` が指定されているので、
ローカルでも URL に `/cap-yamamoto/` が付く。本番と同じ挙動になる。

---

## 3. デプロイに必要な事前準備

### 3-1. 自分のグローバル IP を Security Group に追加してもらう

本番 EC2 は SSH (port 22) を **特定 IP からのみ許可**しています。
自分の IP が許可されていないと SSH 接続できません。

```bash
# 自分の現在のグローバル IP を確認
curl -s https://api.ipify.org
# → 例: 60.34.218.54
```

**この IP を Security Group に追加する作業は、AWS Console アクセス権を持つ
人間オペレータが実施します**。エージェントや CLI で勝手に変更しない (禁止操作)。

#### 自分でやる場合 (AWS Console アクセス権がある前提)

1. AWS Console → EC2 → Security Groups
2. 名前に `claude-deploy` を含むグループを探す (例: `ryutaro-claude-deploy-temp`, `ryutaro-claude-deploy-temp-2`)
3. **新しい SG を作るのではなく、既存のいずれかに `<自分の名前>-deploy` というルールを追加**するか、
   自分専用の新規 SG `<名前>-deploy` を作って EC2 インスタンスにアタッチ
4. インバウンドルール: **SSH (port 22) を `<自分のIP>/32` のみ**で許可
5. (重要) `0.0.0.0/0` で開けない。固定 IP 環境がない場合は IP が変わるたび更新

#### IP が変わったときの再現症状

```bash
./scripts/deploy.sh apply
# → [ERROR] SSH 接続失敗。鍵 (...)・ホスト・SG (port 22) を確認してください。
```

サイト自体は生きている (`curl -sI https://spollup.jp/cap-yamamoto/` で 200 が返る) のに
SSH だけ通らない場合は **ほぼ確実に IP の SG 不一致**。サーバ障害ではない。

### 3-2. SSH 疎通確認

```bash
ssh -i $SSH_KEY ec2-user@spollup.jp 'echo OK && hostname'
# → OK / ip-10-x-x-x が返れば成功
```

---

## 4. 初回デプロイ (動作確認込み)

```bash
# 1. 差分のみ確認 (dry-run)
./scripts/deploy.sh plan

# 2. 本番反映
npm run build && ./scripts/deploy.sh apply

# 3. 健全性確認
curl -sI https://spollup.jp/cap-yamamoto/ | head -1   # HTTP/2 200
curl -sI https://spollup.jp/ | head -1                 # 本体も 200
```

ブラウザでビジュアル確認するときは **キャッシュバイパス**のために URL に
`?v=<日付>` を付ける:

```
https://spollup.jp/cap-yamamoto/?v=2026-06-14
```

詳細は `docs/deploy-guide-for-agents.md` の「健全性チェック」セクション参照。

---

## 5. 日常運用フロー (コンテンツ更新時)

```bash
# 1. ブランチを切らずに main で作業して直接 push しても OK (個人運用)
git checkout main && git pull origin main

# 2. 変更 → ローカル確認
npm run dev                                            # http://localhost:5173/cap-yamamoto/

# 3. ビルド + デプロイ
npm run build && ./scripts/deploy.sh apply

# 4. commit/push
git add -A && git commit -m "<変更内容>" && git push origin main
```

---

## 6. 引き継ぎ時のチェックリスト

新しい開発者が **これだけ通せば独り立ちできる**最小セット:

- [ ] GitHub の Collaborator 招待を受諾し、clone できた
- [ ] `npm install && npm run dev` でローカルが立ち上がる
- [ ] `.pem` を受け取り、`~/.ssh/spollup.pem` (700) に配置、`chmod 600` した
- [ ] `export SSH_KEY=~/.ssh/spollup.pem` を `.zshrc` 等に書いた
- [ ] 自分の IP を Security Group に登録してもらった
- [ ] `ssh -i $SSH_KEY ec2-user@spollup.jp 'hostname'` が成功した
- [ ] `./scripts/deploy.sh plan` が差分表示まで成功した
- [ ] `docs/deploy-guide-for-agents.md` の **禁止操作一覧**を読み、理解した
- [ ] `docs/spollup-cap-yamamoto-explainer.md` でアーキテクチャ全体像を把握した
- [ ] AWS Console にログインでき、SG ルールが編集できる (緊急時の IP 変更用)
- [ ] (任意) GA4 / GSC のアクセス権をもらった

---

## 7. 既存ドキュメントとの関係

| ファイル | 主な読者 | 内容 |
|---|---|---|
| `docs/onboarding-for-developers.md` (本ファイル) | **人間の開発者** (引き継ぎ) | 環境構築〜権限受け渡しの onboarding |
| `docs/deploy-guide-for-agents.md` | **AI エージェント** | 安全運用のための禁止操作・標準フロー |
| `docs/spollup-cap-yamamoto-explainer.md` | 両方 | アーキテクチャ全体像 (DNS → EC2 → nginx → 配信) |
| `scripts/deploy.sh` | 全員 | plan / apply / rollback の標準デプロイスクリプト |
| `scripts/setup-nginx.sh` | (通常触らない) | 初回の nginx 設定 (冪等) |
| `scripts/fetch-youtube.js` | 全員 | YouTube RSS から長編動画を取得 |

---

## 8. 緊急時の連絡先 / エスカレーション

| 状況 | 対応 |
|---|---|
| `./scripts/deploy.sh apply` が失敗し rollback も効かない | 加藤 (ryutaro@motechoro.jp) に連絡 |
| `https://spollup.jp/` (本体) が 5xx を返すようになった | **最優先**で加藤 + スポルアップ運営に連絡 (本体停止 = 売上影響) |
| SSH が突然できなくなった (SG/鍵/インスタンス停止のいずれか) | まず SG (IP) を確認、それでもダメなら AWS Console でインスタンス状態確認 |
| `.pem` を紛失した / 漏洩した | **即座に**加藤 + AWS 管理者に連絡し、鍵をローテートする |
| GitHub リポジトリへのアクセスを失った | リポジトリオーナー (catoryutarow) に再招待依頼 |

---

## 9. やってはいけないこと (再掲)

`docs/deploy-guide-for-agents.md` の **禁止操作一覧**は、人間にも全て適用されます。
特に致命的なものを抜粋:

- `rsync --delete` の宛先を `/usr/share/nginx/corp/cap-yamamoto/` 以外に向ける
- `/etc/nginx/conf.d/*.conf` を直接 `sed` / `vi` で書き換える
- Security Group ルールを `0.0.0.0/0` で開ける
- `.pem` を Git commit / Slack / メール本文に貼る
- `git push --force` を `main` ブランチに対して
- `sudo rm -rf` を任意のパスに対して実行

詳細は `docs/deploy-guide-for-agents.md` の「禁止操作一覧」表を参照。

---

## 10. 参考: なぜこの構成なのか (歴史的経緯)

- **なぜサブパス配信 (`/cap-yamamoto/`) なのか**: スポルアップ本体 (WordPress) と同じドメインで配信したいが、WP のルートとは分離したかったため。`nginx` の `location ^~ /cap-yamamoto/` で静的配信に振り分けている。
- **なぜ GitHub Actions で自動デプロイしていないのか**: 本番 SG が IP 制限なので、GitHub Actions の動的 IP では SSH 接続できない。Tailscale / Session Manager 等への切り替えが将来課題 (タスク #17)。
- **なぜ Vite + Vanilla JS なのか**: 単一 LP で SPA フレームワークの利点が薄く、ビルド速度と保守性を優先したため。

---

最終更新: 2026-06-13
