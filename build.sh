#!/usr/bin/env bash
# Build LGTM Inspector Chrome Extension (standalone)
# Usage: ./build.sh   → builds/

set -euo pipefail

OUT="builds"

echo "▶ Building LGTM Inspector → $OUT/"
mkdir -p "$OUT/icons"

# Generate icons if they don't exist
if [ ! -f "icons-standalone/icon16.png" ]; then
  echo "  Generating icons..."
  python3 tools/create_icons.py
fi

# Concatenate content script: core modules + adapter + main.
# Wrapped in a guard IIFE so that re-injection (executeScript called multiple times) is a no-op:
# the outer IIFE returns early when __lgtmContentLoaded is already set, preventing "already declared" errors.
{
  printf '(function(){\nif(window.__lgtmContentLoaded)return;\nwindow.__lgtmContentLoaded=true;\n\n'
  cat src/core/inspector.js
  cat src/core/overlay.js
  cat src/core/styler.js
  cat src/core/card.js
  cat src/core/tray.js
  cat src/adapters/clipboard.js
  cat src/content.js
  printf '\n})();\n'
} > "$OUT/content.js"

# Copy remaining files
cp src/background.js "$OUT/background.js"
cp src/manifest.standalone.json "$OUT/manifest.json"
cp -r icons-standalone/ "$OUT/icons/"

echo "  ✓ $OUT/content.js   ($(wc -c < "$OUT/content.js") bytes)"
echo "  ✓ Done"

# Sync version in docs/index.html from manifest.standalone.json
if [ -f "docs/index.html" ]; then
  VERSION=$(python3 -c "import json; print(json.load(open('src/manifest.standalone.json'))['version'])")
  sed -i '' "s/Download Latest (v[0-9][0-9.]*)/Download Latest (v${VERSION})/g" docs/index.html
  sed -i '' "s/>v[0-9][0-9.]*<\/strong>/>v${VERSION}<\/strong>/g" docs/index.html
  echo "  ✓ docs/index.html version synced → v${VERSION}"
fi

echo ""
echo "Load extension in Chrome:"
echo "  chrome://extensions → Enable 'Developer mode' → 'Load unpacked' → select builds/"
echo "  Customize shortcut:  chrome://extensions/shortcuts"
