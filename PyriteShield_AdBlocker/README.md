# Pyrite Shield

Pyrite Shield is a lightweight, privacy-first adblocking project that gives you control over which domains are blocked and which are allowed. Designed to be simple, transparent, and completely free — Pyrite Shield helps you browse with fewer distractions and fewer trackers while keeping the sites you trust working via a built-in whitelist.

## Features

- Blocks common ads and trackers
- Easy whitelist management so sites you trust remain unaffected
- Local-first: runs in your browser or locally (no cloud processing)
- No tracking, no telemetry
- Simple configuration and contribution-friendly rule format

## Quick demo

- Open the project in a browser (see Installation below) and test blocking on ad-heavy pages.
- Add a site to the whitelist to allow its content and ads to load again.

## Installation / Quickstart

There are a few common ways to run Pyrite Shield depending on how you want to use it. Choose the one that matches your setup:

Option A — Run as a local web UI
1. Clone the repo:
   git clone https://github.com/TheCuriousBuilder/Pyrite-Shield.git
2. Open `index.html` in your browser, or serve the directory:
   - Python: `python3 -m http.server 8000`
   - Node (http-server): `npx http-server ./ -p 8000`
3. Visit `http://localhost:8000` and follow the UI to enable blocking and manage whitelist entries.

Option B — Load as an unpacked browser extension (if the repo contains a browser extension manifest)
1. Chrome / Edge (Chromium):
   - Go to chrome://extensions
   - Enable "Developer mode"
   - Click "Load unpacked" and select the repo folder
2. Firefox:
   - Go to about:debugging#/runtime/this-firefox
   - Click "Load Temporary Add-on..." and choose the `manifest.json` file from the repo

Option C — Scripted / system installation (Windows PowerShell)
- If the repo includes PowerShell scripts for host-file modifications or installer routines, run them only after reviewing their contents and backing up your system host file. Example:
  - Open PowerShell as Administrator
  - Review the script: `Get-Content .\scripts\install.ps1`
  - Run with caution: `.\scripts\install.ps1`

Note: If you're unsure which option applies to this repo, open the repository's top-level files (e.g., `index.html`, `manifest.json`, or `scripts/`) and I can adapt these instructions precisely.

## Usage

- Block lists: The project ships with built-in blocking rules. You can edit or extend these lists to fine-tune blocking.
- Whitelist: Add domains you trust to the whitelist to bypass blocking for those sites. Whitelist entries are persistent and can be edited via the UI or the configuration file.
- Developer mode: Use the developer tools (Console / Network tab) to inspect which resources are being blocked and to debug custom rules.

## Configuration

- Rules are stored in a plain, human-readable format (check `rules/` or `data/` directories).
- Whitelist entries may be stored in a `whitelist.txt` or inside a JSON config file — check the repo for the exact path.
- To contribute new blocking rules, follow the repository's format and open a pull request.

## Troubleshooting

- If a site breaks after enabling Pyrite Shield, add it to the whitelist and refresh.
- If the extension or UI doesn't load, confirm you have the correct files (e.g., `manifest.json` for browser extensions or `index.html` for the web UI) and that any required dependencies are installed.
- Always back up system files (like hosts) before running installation scripts.

## Contributing

Contributions are welcome! Suggested ways to help:
- Improve or expand the blocking rules
- Fix bugs and improve the UI
- Add documentation, tests, and examples
- Open issues or pull requests with clear descriptions and steps to reproduce

Please follow the repository's coding and commit conventions. If there's no CONTRIBUTING.md yet, open an issue to propose one and I can draft it.

## Privacy & Safety

- Pyrite Shield is intentionally privacy-focused: it does not collect telemetry or user data.
- The project blocks third-party ad & tracking domains by default, but site functionality may be affected for some websites — use the whitelist to restore functionality.

## License

Specify a license (e.g., MIT, GPL-3.0) here. If you haven't chosen one yet, consider adding an `LICENSE` file. Example:
- MIT License — see `LICENSE` for details.

## Credits

Built by TheCuriousBuilder and contributors.

## Support

If you need help, open an issue on the GitHub repo with the "bug" or "help wanted" labels and include:
- Browser and version
- Platform (Windows/macOS/Linux)
- Steps to reproduce the problem
- Any error messages or console logs

---
