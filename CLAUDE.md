# LGTM Inspector — Chrome Extension

## 概要

UI要素をクリックしてアノテーションを付けるChrome拡張機能。全サイトで動作し、アノテーション（メモ・CSS差分・スクリーンショット）をクリップボードにコピーする。UIは英語。

> 以前は localhost専用でLGTMアプリ（`http://127.0.0.1:41234`）へPOSTする `lgtm` バリアントも併存していたが、standalone版のみに統合した。

## ビルド

```bash
./build.sh    # builds/ に出力
```

成果物は `builds/` 直下に出力される。

## ディレクトリ構成

```
src/
  background.js          # Service Worker。content script の注入 + スクショ取得/保存の中継
  content.js             # メインエントリポイント（ビルド時に最後に連結される）
  core/
    inspector.js         # コンポーネントパス検出ロジック
    overlay.js           # ホバー時のハイライトオーバーレイ
    styler.js            # CSS編集パネル（即時プレビュー・差分抽出・トークン参照・差分整形）
    card.js              # アノテーションカードUI（メモ/スタイルタブ・DOMナビ・コピー/ためる）
    tray.js              # バッチトレイ（編集をバッジで蓄積し、まとめてコピー）
  adapters/
    clipboard.js         # スクショをディスク保存し、テキスト＋パスをクリップボードへコピー
  manifest.standalone.json  # manifest（host_permissions: <all_urls>）
```

## ビルドの仕組み

`build.sh` が以下を行う:

1. `content.js` を以下の順で連結してバンドル:
   `inspector.js` → `overlay.js` → `styler.js` → `card.js` → `tray.js` → `clipboard.js` → `content.js`
   （再注入を no-op にするガードIIFEで全体をラップ）
2. `src/background.js` をコピー
3. `src/manifest.standalone.json` を `builds/manifest.json` としてコピー
4. `icons-standalone/` を `builds/icons/` へコピー
5. `docs/index.html` のバージョン表記を manifest のバージョンに同期

**ソースは `src/` のみ編集する。`builds/` は生成物なので直接編集しない。**

## Git 運用ルール

- **「コミットして」という指示にはプッシュまで含む。** コミット後は自動的に `git push` する。
- `builds/` は `.gitignore` 対象。`git add` の対象に含めない。

## Chrome拡張機能のロード

```
chrome://extensions → デベロッパーモード ON → パッケージ化されていない拡張機能を読み込む
→ builds/ を選択
```

ショートカットの競合は `chrome://extensions/shortcuts` で解消する。
