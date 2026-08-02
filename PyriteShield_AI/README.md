# PyriteShield AI v2.5.2

An AI reading companion: highlight text for instant actions, or summarize an entire page or YouTube video.

## Features
- **Selection mini-toolbar** — highlight any text, a small toolbar appears right above it (Explain / Summarize / Rewrite / Translate)
- **Streaming answers** — responses appear as they're generated, with a Cancel button
- **Markdown-formatted output** — headers, bold, lists, and code render properly, not raw asterisks
- **YouTube video summaries from real captions/transcript** — not just the title
- **History** — every past result is saved locally and browsable from the panel
- **Multiple provider profiles** — save several API configs (e.g. "Groq fast" + "GPT-4o quality") and switch between them
- **Keyboard shortcuts** — Alt+Shift+E (explain), Alt+Shift+S (summarize), Alt+Shift+P (page), Alt+Shift+A (toggle panel); reassignable at `chrome://extensions/shortcuts`
- **Test connection** button in Settings to verify an API key works before relying on it
- Copy or save any result as a `.md` file

## API keys

Bring **your own** key. Supports:
- OpenAI-compatible base URL (Groq, OpenRouter, OpenAI, local, …)
- Google Gemini

No built-in shared key (would be extracted and abused).

## Install

Load unpacked from this folder in `chrome://extensions` (enable Developer Mode first).

## Privacy

Your API key and history are stored only in this browser's local extension storage (`chrome.storage.local`) — never sent anywhere except directly to the AI provider you configure.
