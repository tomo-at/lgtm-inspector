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
  if [ ! -f "icons/icon16.png" ]; then
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
  {
    sed "s/__BUILD_TARGET__/$target/g" src/config.js
    cat src/core/inspector.js
    cat src/core/overlay.js
    cat src/core/card.js
    cat "$adapter"
    cat src/content.js
  } > "$out/content.js"

  # Copy remaining files
  cp src/background.js "$out/background.js"
  cp manifest.json     "$out/manifest.json"
  cp -r icons/         "$out/icons/"

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

echo ""
echo "Load extension in Chrome:"
echo "  chrome://extensions → Enable 'Developer mode' → 'Load unpacked' → select builds/<variant>/"
echo "  Customize shortcut:  chrome://extensions/shortcuts"
