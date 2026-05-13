# spollup.jp に「キャプテン山本LP」を載せるしくみ

## 1. 今、`spollup.jp` を開くと何が起きてる？

ブラウザで `https://spollup.jp` を開いた時、裏では4ステップが進んでいます。

### ステップ1: ドメイン名から「住所」を引く (DNS)

```
あなた:「spollup.jp ってどこにあるの？」
   ↓
DNSサーバ:「3.113.139.207 だよ」
   ↓
ブラウザがその住所のサーバに接続
```

`spollup.jp` は **人間用の名前**、`3.113.139.207` は **コンピュータ用の番地** (IPアドレス)。
DNS はその両者を変換する電話帳のような仕組みです。

### ステップ2: サーバに到達

その IP `3.113.139.207` が指している先は、AWS で動いているサーバ (= EC2インスタンス) で、名前は **「formbase」** といいます。
(昔フォーム機能用に作ったので名前が "form" 始まり。今はサイト本体も同居しています。)

### ステップ3: サーバの中の「受付」が判断する (nginx)

サーバの中では **nginx (エンジンエックス)** というソフトが受付役をしていて、来たリクエストを担当に振り分けます。

```
リクエスト:「/ (トップページ) ください」
   ↓
nginx:「これはWordPressの仕事だな」
   ↓
WordPress に転送
```

### ステップ4: WordPress がページを作る

**WordPress** は PHP で動くシステムで、リクエストごとにデータベースから記事を取り、テンプレートに当てはめて HTML を作って返します。

### まとめ図

```
[あなたのブラウザ]
      │  "spollup.jp"
      ▼
[DNS]──→ 3.113.139.207
      │
      ▼
[AWS EC2: formbase インスタンス]
      │  port 443 (HTTPS)
      ▼
[nginx (受付)]
      │  「全部 / に来たやつは WP に投げる」
      ▼
[WordPress (PHP)]
      │  DB から記事取って HTML を作る
      ▼
  ブラウザに返却
```

---

## 2. でも、キャプテン山本LP は WordPress じゃない

私たちが作った LP は **WordPress ではなく、ただのファイル群**です。

|  | WordPress | キャプテン山本LP (静的サイト) |
|---|---|---|
| 何でできてる | PHP + データベース | HTML / CSS / JS / 画像 |
| ページの作り方 | リクエストごとに動的生成 | あらかじめ完成済み |
| 必要なもの | サーバで PHP と DB が動く | ファイルを置くだけ |
| 速さ | 中 (毎回 PHP が動く) | 速い (ファイルそのまま返す) |
| たとえると | 注文ごとに料理を作るレストラン | できあいの弁当 |

つまり「LP を公開する」とは:
**サーバの所定の場所にファイルを置いて、URL からアクセスできるようにする** だけ。

---

## 3. 目指す形

```
今:                                追加:
spollup.jp/      → WordPress       spollup.jp/cap-yamamoto/  → LP (静的サイト)
spollup.jp/blog  → WordPress
spollup.jp/wp-admin → WordPress    ← WP系は今まで通り
```

両者が「**同じドメインに同居**」する形です。

---

## 4. サーバ内のファイル配置はこうなる

WordPress 本体は `/usr/share/nginx/corp/` というフォルダにあります。
そこに **`cap-yamamoto/` フォルダを新しく作って** LP のファイルを置きます。

```
/usr/share/nginx/corp/              ← WordPress のルートフォルダ
├── index.php                       ← WPのエントリーポイント
├── wp-admin/                       ← WPの管理画面
├── wp-content/                     ← WPのテーマや画像
├── wp-includes/
├── (...WPの他のファイル)
└── cap-yamamoto/                   ← 【新規追加】 ここにLPを置く
    ├── index.html                  ← LPのトップ
    ├── assets/
    │   ├── index-rr3ESaXA.css      ← LPのスタイル
    │   └── index-Dn2mtIAe.js       ← LPのJavaScript
    ├── captain-logo.png            ← 画像
    ├── yamamoto_fv.png
    ├── kaimono-banner.jpg
    └── (...LPの他のファイル)
```

WP のファイルには **一切触りません**。新しいフォルダを横に並べるだけです。

---

## 5. でも置くだけでは見えない (重要)

ここがハマりポイント。今の nginx の設定はこうなっています:

```nginx
location / {
    try_files $uri $uri/ /index.php?$args;
}
```

これは「**届いたリクエストに対応するファイルがあれば返す。無ければ全部 WordPress (`/index.php`) に渡す**」という設定です。

問題:

| URL | 何が起こる | 結果 |
|---|---|---|
| `/cap-yamamoto/index.html` | ファイル存在 → 返す | ✅ 表示される |
| `/cap-yamamoto/` (末尾スラッシュだけ) | ファイル無 → WP へ | ❌ WPの404 |
| `/cap-yamamoto/存在しないやつ` | ファイル無 → WP へ | ❌ WPの404 |

LP の中で JavaScript が動的に URL を組み立てたりするので、いつ「WP に吸われる」事故が起きてもおかしくありません。

---

## 6. 解決策: nginx に「振り分けルール」を追加

nginx の設定ファイル (`spollupjp.conf`) に、**5行のルール** を追加します:

```nginx
# 既存の location / { ... } の【前】に追記
location ^~ /cap-yamamoto/ {
    alias /usr/share/nginx/corp/cap-yamamoto/;
    try_files $uri $uri/ /cap-yamamoto/index.html =404;
    index index.html;
}
```

意味:

- `location ^~ /cap-yamamoto/`
  → 「`/cap-yamamoto/` で始まる URL はここで処理。WordPress には渡さない。**最優先**で評価。」
  (`^~` は「他の正規表現ルールより優先する」というマーク)
- `alias /usr/share/nginx/corp/cap-yamamoto/`
  → 「実体ファイルはこのフォルダの中にあるよ」
- `try_files $uri $uri/ /cap-yamamoto/index.html =404`
  → 「ファイルがあれば返す。フォルダ末尾なら index.html を返す。どちらも無ければ 404」

これで振り分けが完成:

```
URL                            行き先
─────────────────────────────  ──────────────────────────
/                              → WordPress
/blog/                         → WordPress
/wp-admin/                     → WordPress
/cap-yamamoto/                 → 静的ファイル (新規!)
/cap-yamamoto/index.html       → 静的ファイル (新規!)
/cap-yamamoto/assets/main.css  → 静的ファイル (新規!)
```

棲み分け OK。

---

## 7. 作業手順 (実際にやること)

```
① EBSスナップショット取得 (済)
       ↓ 最悪壊しても、ここに戻せる保険
② nginx 設定ファイルのバックアップ
       ↓ cp spollupjp.conf spollupjp.conf.bak.20260513
③ cap-yamamoto/ フォルダを作って、LPファイルを配信
       ↓ rsync コマンドで一括コピー
④ nginx 設定に location ブロックを追記
       ↓ 5行追加するだけ
⑤ 構文チェック
       ↓ sudo nginx -t  (OK が出ないと⑥に進まない)
⑥ nginx リロード (無停止)
       ↓ sudo nginx -s reload
⑦ ブラウザで確認
       ↓ https://spollup.jp/cap-yamamoto/ → LPが表示されればゴール
```

各ステップは独立に巻き戻せます。

---

## 8. なぜ安全か

- WordPress のファイルや DB は **触らない** (新規フォルダを並べるだけ)
- nginx 設定変更は **既存ブロックを書き換えず、新規追加のみ** (5行)
- `nginx -t` で構文チェック → 文法エラーなら **リロード自体しない** (= 既存設定のまま動き続ける)
- nginx の `reload` は **無停止** (実行中の接続は捌き切ってから新設定に切替)
- 万一の場合は `cp spollupjp.conf.bak spollupjp.conf && sudo nginx -s reload` で 5秒で元通り
- 最悪の最悪はEBSスナップショットから復元 (数分)

リスクの層が4重になっています。

---

## 9. 用語ミニ辞典

| 用語 | 意味 | 今回での役割 |
|---|---|---|
| **DNS** | ドメイン名と IP アドレスを変換するしくみ (電話帳) | `spollup.jp` → `3.113.139.207` |
| **EC2インスタンス** | AWS 上で動かす仮想サーバ | "formbase" がそれ |
| **nginx** | リクエストを受けて担当に振り分けるソフト (受付) | / は WP に、/cap-yamamoto/ は静的ファイルに |
| **WordPress** | DB を使ってページを動的に作る CMS | spollup.jp のメインサイト |
| **静的サイト** | あらかじめ HTML/CSS/JS として完成しているサイト | キャプテン山本LP |
| **DocumentRoot** | nginx がファイルを探す出発点のフォルダ | `/usr/share/nginx/corp/` |
| **location ブロック** | 「この URL にはこの処理」を nginx に教える設定単位 | `/cap-yamamoto/` 用に1個追加する |
| **rsync** | ローカル↔サーバ間でファイルを差分同期するコマンド | LPファイルをサーバに送る |
| **EBSスナップショット** | EC2 のディスク全体の瞬間コピー | 万一の復元用に取得済 |
| **nginx reload** | 設定を読み直す動作 (再起動と違って無停止) | 反映に使う |
