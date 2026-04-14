#!/usr/bin/env bash
# Build LGTM Inspector Chrome Extension
# Usage:
#   BUILD_TARGET=lgtm ./build.sh         → builds/lgtm/
#   BUILD_TARGET=standalone ./build.sh   → builds/standalone/
#   ./build.sh                           → builds both variants

set -euo pipefail

TARGET="${BUILD_TARGET:-}"

build_variant() {
  local target="$1"
  local out="builds/$target"

  echo "▶ Building $target variant → $out/"
  mkdir -p "$out/icons"

  # Generate icons if they don't exist
  if [ ! -f "icons/icon16.png" ] || [ ! -f "icons-standalone/icon16.png" ]; then
    echo "  Generating icons..."
    python3 tools/create_icons.py
  fi

  # Select adapter based on target
  local adapter
  if [ "$target" = "lgtm" ]; then
    adapter="src/adapters/lgtm.js"
  else
    adapter="src/adapters/clipboard.js"
  fi

  # Concatenate content script: config (with BUILD_TARGET injected) + core modules + adapter + main
  # Wrapped in a guard IIFE so that re-injection (executeScript called multiple times) is a no-op:
  # the outer IIFE returns early when __lgtmContentLoaded is already set, preventing "already declared" errors.
  {
    printf '(function(){\nif(window.__lgtmContentLoaded)return;\nwindow.__lgtmContentLoaded=true;\n\n'
    sed "s/__BUILD_TARGET__/$target/g" src/config.js
    cat src/core/inspector.js
    cat src/core/overlay.js
    cat src/core/card.js
    cat "$adapter"
    cat src/content.js
    printf '\n})();\n'
  } > "$out/content.js"

  # Copy remaining files
  sed "s/__BUILD_TARGET__/$target/g" src/background.js > "$out/background.js"

  local manifest="manifest.json"
  [ -f "src/manifest.${target}.json" ] && manifest="src/manifest.${target}.json"
  cp "$manifest" "$out/manifest.json"

  local icons_src="icons"
  [ -d "icons-${target}" ] && icons_src="icons-${target}"
  cp -r "${icons_src}/" "$out/icons/"

  echo "  ✓ $out/content.js   ($(wc -c < "$out/content.js") bytes)"
  echo "  ✓ Done"
}

if [ -z "$TARGET" ]; then
  build_variant lgtm
  echo ""
  build_variant standalone
else
  build_variant "$TARGET"
fi

# Sync version in docs/index.html from manifest.standalone.json
if [ -f "src/manifest.standalone.json" ] && [ -f "docs/index.html" ]; then
  VERSION=$(python3 -c "import json; print(json.load(open('src/manifest.standalone.json'))['version'])")
  sed -i '' "s/Download Latest (v[0-9][0-9.]*)/Download Latest (v${VERSION})/g" docs/index.html
  sed -i '' "s/>v[0-9][0-9.]*<\/strong>/>v${VERSION}<\/strong>/g" docs/index.html
  echo "  ✓ docs/index.html version synced → v${VERSION}"
fi

echo ""
echo "Load extension in Chrome:"
echo "  chrome://extensions → Enable 'Developer mode' → 'Load unpacked' → select builds/<variant>/"
echo "  Customize shortcut:  chrome://extensions/shortcuts"
