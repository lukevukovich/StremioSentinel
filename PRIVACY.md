# Stremio Sentinel — Privacy Policy

Last updated: 2025-12-26

## Overview

Stremio Sentinel is a browser extension that scans the Stremio Web addons page to compare the installed addon version with the version from the addon’s manifest. It adds a small UI panel on `web.stremio.com` to show results.

## Data Collection

- We do not collect, store, or sell personal information.
- We do not track your browsing history.
- We do not use analytics, advertising, or fingerprinting.

## Permissions and How They Are Used

- **`scripting`**: Injects the extension’s own `content.js` on `web.stremio.com` to render the panel and read addon entries.
- **`activeTab`**: Allows interaction with the current Stremio tab only when you click the extension icon.
- **`tabs`**: Reads the current tab URL to determine whether to open `https://web.stremio.com/#/addons` or interact with the existing Stremio tab. We do not enumerate tabs or track navigation.
- **`host_permissions` (`*://*/*`)**: Performs `GET` requests to third‑party addon manifest URLs shown in Stremio’s UI to read a version field. We do not inject code or modify content on those hosts.

## Network Requests

The extension makes network requests only to fetch addon manifest JSON files referenced on the Stremio addons page. These requests are read‑only and are used solely to determine the latest addon version.

## Remote Code

- The extension does not execute remote scripts.
- All executable code ships with the extension package.

## Data Sharing and Retention

- No personal data is collected or retained.
- No data is shared with third parties.

## Changes to This Policy

If the extension’s behavior changes, we will update this policy and the extension listing accordingly.

## Contact

For questions or concerns, please open an issue in the project’s repository.
