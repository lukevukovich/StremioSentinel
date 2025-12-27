# Stremio Sentinel (Chrome MV3 Extension)

Stremio Sentinel scans the Stremio Web Addons page and reports whether each addon has an update available by comparing the installed version with the version in its manifest JSON.

## Install

### From GitHub Release (Recommended)

1. Go to the GitHub Releases page of this repository and download the ZIP named `stremio-sentinel-<version>.zip`.
2. Extract the ZIP. You should get a folder like `stremio-sentinel-<version>` that contains `manifest.json` and the extension files inside.
3. Open Chrome and go to `chrome://extensions/`.
4. Toggle on **Developer mode** (top right).
5. Click **Load unpacked** and select the extracted `stremio-sentinel-<version>` folder (the folder that has `manifest.json`).
6. Visit `https://web.stremio.com/#/addons`. The panel appears only on the Addons route.

### From Source (Local Folder)

If you cloned or downloaded the repository directly:

1. Open Chrome and go to `chrome://extensions/`.
2. Toggle on **Developer mode**.
3. Click **Load unpacked** and select the project root folder (the folder that includes `manifest.json`).
4. Visit `https://web.stremio.com/#/addons`.

## Update

When a new version is released:

- Download the latest `stremio-sentinel-<version>.zip` from Releases and extract it.
- Either replace the contents of your previously loaded folder with the new files and click **Reload** on the extension card in `chrome://extensions/`,
  or remove the old unpacked extension and **Load unpacked** again pointing to the new `stremio-sentinel-<version>` folder.

## Usage

- Panel location: Bottom-right. Shows only on `#/addons`.
- Buttons:
  - **Scan Addons**: Performs a refresh-before-scan so each run starts on a fresh Addons page for speed and reliability.
  - **Cancel**: Stops an in-progress scan immediately.
  - **Clear**: Clears results and removes list highlights.
  - **Minimize/Expand**: Collapses/expands the panel.
- Empty state: When no results are present, the list is hidden and an inline message prompts you to scan.
- Details per addon:
  - Installed version (from the list item, not the modal).
  - Manifest version (parsed from fetched manifest JSON).
  - Status (Up-to-date / Update available).
  - Toggle **Details** and use **Copy manifest URL**.

## Behavior & Selectors

- Addons list: `[class*="addons-list-container"]`, iterating direct children.
- Installed version: `[class*="version-container"]` within each list item.
- Manifest URL: Resolved from the addon modal using resilient selectors (e.g., `[class*="transport-url-label"]`, "URL:" rows).
- Modal handling: Robust detection with fallbacks after route changes; optimized timeouts for faster opens/closes.
- Route-aware UI: Panel is shown only on `#/addons`; removed on other routes.

## Icons

- Header icon is sourced from `icons/icon.svg` via `chrome.runtime.getURL()`.
- Extension/toolbar icons are PNGs mapped in `manifest.json` under `icons` and `action.default_icon`.
- Generate PNGs from the SVG (examples using Inkscape):

```powershell
inkscape icons/icon.svg -o icons/icon-16.png -w 16 -h 16
inkscape icons/icon.svg -o icons/icon-24.png -w 24 -h 24
inkscape icons/icon.svg -o icons/icon-32.png -w 32 -h 32
inkscape icons/icon.svg -o icons/icon-48.png -w 48 -h 48
inkscape icons/icon.svg -o icons/icon-128.png -w 128 -h 128
```

## Permissions

- `host_permissions: ["*://*/*"]` to fetch manifest JSON from addon hosts.
- `scripting`, `activeTab`, and `tabs` for MV3 content script messaging and activation.
- `web_accessible_resources` exposes `icons/*` so header SVG/PNGs can be loaded by the page when inserted by the content script.

## Troubleshooting

- Panel not visible: Ensure you are on `https://web.stremio.com/#/addons`.
- Slow scans after navigation: Use the built-in refresh-before-scan (triggered by Scan Addons).
- Manifest URL shows `n/a`: The addon details may not expose a transport URL; try opening the modal manually to confirm.
- Cancel unresponsive: Reload the extension in `chrome://extensions` to ensure the latest script is active.
- Header icon missing: Confirm `manifest.json` includes `web_accessible_resources` and the file exists at `icons/icon.svg`.

## Project Files

- `manifest.json`: MV3 config, icons, permissions.
- `background.js`: Fetches manifest JSON and extracts version.
- `content.js`: Injects the panel, scans addons, handles UI, and messaging.
- `icons/icon.svg`: Source artwork; export PNGs for the manifest.

## Notes

- Selectors are intentionally resilient to tolerate Stremio’s hashed class names.
- Version comparison normalizes leading `v` and compares dot-separated numeric segments.
- The panel auto-scrolls within the extension pane to keep the latest result visible; the main Stremio page itself does not scroll.
