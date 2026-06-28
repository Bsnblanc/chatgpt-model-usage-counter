# ChatGPT Model Usage Counter

A Chrome extension (Manifest V3) for **local** ChatGPT model-usage statistics, ChatGPT web service-status display, current-plan display, and user-initiated conversation export.

The extension counts prompt submissions observed in the current Chrome profile. These are **local usage records** — they do **not** represent OpenAI billing, official quota, rate limits, or token usage.

## Features

- Counts ChatGPT prompt submissions by detected model and date.
- Saved start/end date range; per-day line chart with multi-select legend to compare models.
- Expand a model to see request metadata, parameter statistics, feature statistics, and a conversation index.
- Recognizes feature signals: agent mode, deep research, image generation, web search, realtime, audio/voice, canvas — kept separate from model names.
- Recognizes parameters such as `reasoning.effort`, `text.verbosity`, `temperature`, `top_p`, `max_tokens`, `tools`, `tool_choice`, `response_format`, and `image_generation_options.*`.
- Shows ChatGPT-web-related OpenAI public service status from `status.openai.com`.
- Exports selected logged-in ChatGPT conversations as JSON, Markdown, PDF, DOCX, or PNG. PDF / DOCX / PNG are rendered with system CJK fonts and Markdown formatting (headings, bold, code blocks, tables) — ChatGPT-style reading layout.
- Single-select, multi-select, and cross-page retained selections during export.
- Stores statistics and settings in `chrome.storage.local`. No publisher server; nothing is uploaded.

## Install (unpacked)

1. Download or clone this repository.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder (the one containing `manifest.json`).
4. Open a logged-in `https://chatgpt.com/` page in the same Chrome profile and refresh any already-open ChatGPT tabs.
5. Open the in-page statistics entry, or click the toolbar extension icon.

Supports `https://chatgpt.com/*` and keeps compatibility with `https://chat.openai.com/*`.

## Privacy

- Statistics and settings are stored locally in `chrome.storage.local` (current Chrome profile).
- Statistics may include model names, request metadata, parameter combinations, feature tags, timestamps, page URL/title, conversation ID, prompt length, and a prompt hash.
- Statistics do **not** store raw prompts, raw responses, passwords, cookies, authorization headers, or access tokens.
- Conversation content is read only for conversations you select in the export view; export files are generated locally and saved through Chrome downloads.
- The status view requests public data from `status.openai.com` only.

See [USAGE.md](./USAGE.md) for the full user guide and [PRIVACY.md](./PRIVACY.md) for the privacy policy.

## Development

```bash
node --test
```

## License

[MIT](./LICENSE)
