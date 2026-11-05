# ビジネス力スキルツリー

確認項目をチェックした回数でスキルが解放されていく、自分用のスキルツリーです。
サーバーは使いません。アプリは GitHub Pages、データは GitHub Gist（非公開）に置き、Claude Code からは MCP で操作できます。

```
スマホ / Mac のブラウザ ──┐
                          ├── GitHub Gist（skilltree.json）
Claude Code（MCP サーバー）┘
```

## ファイル

| ファイル | 役割 |
| --- | --- |
| `index.html` | アプリ本体（GitHub Pages で開くページ） |
| `core.js` | ルール（解放の条件・1年ペースの回数など）。アプリと MCP の両方が使う |
| `app.js` | 画面と操作 |
| `mcp/server.mjs` | Claude Code から操作するための MCP サーバー |
| `src/`・`build.py` | `index.html` を作り直すときの元ファイル |

## 1. アプリを公開する（GitHub Pages）

1. GitHub で新しいリポジトリ（例：`skill-tree`）を作り、このフォルダの中身を push する
2. Settings → Pages → Branch を `main` / `/ (root)` にして Save
3. 数分後に `https://<ユーザー名>.github.io/skill-tree/` で開ける

## 2. Gist と同期する

1. GitHub の Settings → Developer settings → Personal access tokens → **Tokens (classic)** で、
   権限を **`gist` だけ**にしたトークンを作る
2. アプリの「データ」→「GitHub Gist と同期」にトークンを入れ、Gist ID は空のまま「同期を始める」
   → 非公開の Gist が作られ、Gist ID が表示される
3. 別の端末では、同じトークンと Gist ID を入れる

アプリは開いたとき・画面に戻ったとき・2分ごとに Gist の最新を読みます。

## 3. Claude Code から操作する（MCP）

```bash
cd skill-tree/mcp
npm install
claude mcp add skilltree \
  -e GITHUB_TOKEN=ghp_xxxxxxxx \
  -e SKILLTREE_GIST_ID=xxxxxxxxxxxxxxxx \
  -- node "$(pwd)/server.mjs"
```

Gist を使わずに試すときは、`GITHUB_TOKEN` と `SKILLTREE_GIST_ID` を外し、
`-e SKILLTREE_FILE=$HOME/skilltree.json` を付けるとローカルのファイルに保存します。

### 使えるツール

| ツール | できること |
| --- | --- |
| `get_overview` | ツリー全体（系統・スキルID・頻度・状態・回数） |
| `list_checks` | その日の確認項目とチェック状況 |
| `check` | 確認項目をチェック（`done:false` で外す）。回数が届くと自動で解放 |
| `record_goal` | 達成目標に記録を入れる（目標に届けば達成） |
| `set_day_off` | 休みの日にする（連続記録が途切れない） |
| `get_history` | 日ごとのチェック数（草グラフの中身） |
| `new_tree` | 空のツリー／見本のツリーで作り直す（`confirm:true` が必要） |
| `add_branch` | 系統を追加（6つのスキルをまとめて渡せる） |
| `update_branch` / `update_skill` | 系統・スキルの中身を変える |
| `delete_branch` | 系統を削除（`confirm:true` が必要） |
| `set_title` | タイトルを変える |

### 頼み方の例

- 「スキルツリーを空にして、英語・設計力・筋トレの3系統をゼロから作って。筋トレの最終はベンチ100kgの達成目標で」
- 「今日の確認項目を見せて。傾聴と単語はできた」
- 「ベンチで85kg挙がった」

## ツリーのきまり

- 系統は最大6つ。各系統は6スキル：1段目 → 2段目A・B → 3段目A・B → 最終
- スキルIDは「系統key＋段」（例：`kin4`、`judge2a`）
- 頻度：毎日／週1〜3回／月1回／達成目標
- 必要回数の初期値は、8割のペースで続けると約1年で最終スキルに届く回数
- 週・月の項目は、その週・その月の中ならいつチェックしてもよい

## 中身を変えたあと

`src/` や `core.js`・`app.js` を変えたら `python3 build.py` で `index.html` を作り直します。
