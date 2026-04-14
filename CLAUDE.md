# LGTM Inspector — Chrome Extension

## 概要

UI要素をクリックしてアノテーションを付けるChrome拡張機能。2つのビルドバリアントがある。

- **lgtm** — localhostのみ動作。アノテーションをLGTMアプリ（`http://127.0.0.1:41234`）に送信する
- **standalone** — 全サイトで動作。アノテーションをクリップボードにコピーする

## ビルド

```bash
./build.sh                        # 両バリアントをビルド
BUILD_TARGET=lgtm ./build.sh      # lgtmのみ
BUILD_TARGET=standalone ./build.sh # standaloneのみ
```

成果物は `builds/lgtm/` と `builds/standalone/` に出力される。

## ディレクトリ構成

```
src/
  config.js              # LGTM_CONFIG定義。BUILD_TARGETはビルド時に置換される
  background.js          # Service Worker。BUILD_TARGETでlocalhost制限を切り替え
  content.js             # メインエントリポイント（ビルド時に最後に連結される）
  core/
    inspector.js         # コンポーネントパス検出ロジック
    overlay.js           # ホバー時のハイライトオーバーレイ
    card.js              # アノテーションカードUI（テキスト入力・送信ボタン等）
  adapters/
    lgtm.js              # lgtmバリアント用：APIへPOST
    clipboard.js         # standaloneバリアント用：クリップボードへコピー
  manifest.standalone.json  # standaloneバリアント用のmanifest（host_permissions: <all_urls>）
manifest.json            # lgtmバリアント用のmanifest（host_permissions: localhostのみ）
```

## ビルドの仕組み

`build.sh` が以下を行う:

1. `src/config.js` の `__BUILD_TARGET__` をターゲット名に置換
2. `src/background.js` の `__BUILD_TARGET__` をターゲット名に置換
3. `content.js` を以下の順で連結してバンドル:
   `config.js` → `inspector.js` → `overlay.js` → `card.js` → `adapter.js` → `content.js`
4. lgtmは `manifest.json`、standaloneは `src/manifest.standalone.json` を使用

**ソースは `src/` のみ編集する。`builds/` は生成物なので直接編集しない。**

## バリアント分岐のパターン

ソース内でバリアントを分岐するには `LGTM_CONFIG.BUILD_TARGET` を使う:

```js
const isLGTM = LGTM_CONFIG.BUILD_TARGET === 'lgtm';
```

- UIテキスト（日本語/英語）の切り替え
- localhost制限の有効/無効
- LGTMアダプタの呼び出し（プロジェクト一覧取得等）

## UIテキストの言語

- **lgtm版**: 日本語（作業指示を入力…、キャンセル、送信中… 等）
- **standalone版**: 英語（Enter notes…、Cancel、Copying… 等）

`card.js` と `content.js` で `isLGTM` を使って分岐している。

## Git 運用ルール

- **「コミットして」という指示にはプッシュまで含む。** コミット後は自動的に `git push` する。
- `builds/` は `.gitignore` 対象。`git add` の対象に含めない。

## Chrome拡張機能のロード

```
chrome://extensions → デベロッパーモード ON → パッケージ化されていない拡張機能を読み込む
→ builds/lgtm/ または builds/standalone/ を選択
```

両バリアントを同時にロードしてテスト可能。ショートカットの競合は `chrome://extensions/shortcuts` で解消する。
