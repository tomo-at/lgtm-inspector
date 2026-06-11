# LGTM Inspector

A Chrome extension for component-level UI feedback. Click any element on a page to capture it, leave a **Note** or tweak its **Style** with a live preview, then **Copy** the change to your clipboard — formatted to paste straight into [Claude Code](https://claude.com/claude-code).

It turns "this button should be a bit bigger" into a precise, paste-ready instruction with the component's source location, a screenshot, and an exact CSS diff.

---

## What it does

Click an element and the extension captures:

- **Component path** — detected from React, Vue, CSS class names, or test IDs
- **Source location** — `file:line` when the framework exposes it
- **A screenshot** — full-viewport shot with the target highlighted in a red box, saved locally

From there you can:

- **📝 Notes** — write free-text instructions for the change
- **🎨 Style** — tweak common CSS properties (color, spacing, typography, radius, shadow, …) with a **live preview** on the actual page. Design tokens are first-class:
  - Properties already using a `var(--token)` show as a **token chip** you can swap or **detach** (hardcode the value)
  - Properties whose value matches a token get a **suggestion** so you can link them
- **🖱️ Drag to capture** — instead of clicking, drag a rectangle to grab a cropped screenshot of any region
- **🗂️ Stack & copy** — accumulate several edits in the tray and copy them all at once

Hit **Copy** and everything lands on your clipboard in a Claude Code-ready format.

> **Local-only:** the extension makes no network requests. Your notes, screenshots, and diffs stay on your machine (clipboard + a local file in `~/Downloads/lgtm-inspector/`).

## Example output

A style tweak with a note produces something like:

```
Make this button more prominent

CSS changes (previewed):
- padding: var(--spacing-md) → var(--spacing-lg)
- border-radius: 8px → var(--radius-md)

Component: button-secondary
Source: src/components/Button.tsx:42
URL: https://example.com/
Screenshot: ~/Downloads/lgtm-inspector/screenshot-2026-06-12T10-30-00.png
```

Paste that into Claude Code and it has the full context — what to change, where, and what it looks like.

---

## Installation

### Option A — Build from source (recommended)

Requires `bash` (macOS).

```bash
git clone https://github.com/tomo-at/lgtm-inspector.git
cd lgtm-inspector
./build.sh
```

This produces the unpacked extension in `builds/`. Then:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the **`builds/`** folder
4. (Optional) Click the puzzle icon in Chrome's toolbar and **pin** LGTM Inspector

### Option B — From a release ZIP

1. Download the ZIP from the [latest release](https://github.com/tomo-at/lgtm-inspector/releases/latest)
2. Unzip it somewhere stable (don't delete the folder afterward)
3. `chrome://extensions` → **Developer mode** on → **Load unpacked** → select the unzipped folder

## Usage

1. **Toggle the inspector** with `Ctrl + Shift + I` (the suggested shortcut — reassign at `chrome://extensions/shortcuts`), or by clicking the toolbar icon
2. **Click** an element (or **drag** to select a region)
3. Add a **Note** and/or adjust **Style** — Style changes preview live on the page
4. **Copy** to put the change on your clipboard, or **Stack for later** to batch several edits and **Copy all** from the tray

> If the keyboard shortcut doesn't fire, another app may be using `Ctrl+Shift+I`. Reassign it at `chrome://extensions/shortcuts`.

## Updating

**From source:**

```bash
git pull
./build.sh
```

Then go to `chrome://extensions` and click the **reload (↺)** icon on the LGTM Inspector card.

**From a release ZIP:** download the new ZIP, unzip it over the old folder, and reload in Chrome.

---

## Permissions

| Permission | Why |
|---|---|
| `<all_urls>` | Run the inspector on any page you activate it on |
| `activeTab`, `scripting` | Inject the inspector into the current tab on demand |
| `downloads` | Save the highlighted screenshot to `~/Downloads/lgtm-inspector/` |
| `storage`, `tabs` | Remember small UI state |

No data is sent anywhere — see the local-only note above.

## Development

- Edit **`src/` only**. `builds/` is generated output — never edit it directly.
- `build.sh` concatenates the core modules (`inspector.js → overlay.js → styler.js → card.js → tray.js → clipboard.js → content.js`) into `builds/content.js`, copies the manifest and icons, and syncs the version in `docs/index.html`.
- After changing source, re-run `./build.sh` and click **reload (↺)** in `chrome://extensions` — no need to remove and re-add the extension.

```
src/
  background.js          # service worker: content-script injection + screenshot relay
  content.js             # main entry point
  core/
    inspector.js         # component-path detection
    overlay.js           # hover highlight overlay
    styler.js            # live CSS editor + design-token linking
    card.js              # annotation card UI (Notes / Style tabs, DOM nav)
    tray.js              # batch tray (stack edits, copy all)
  adapters/
    clipboard.js         # save screenshot + copy to clipboard
  manifest.standalone.json
```
