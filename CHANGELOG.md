# Changelog

## 1.5.0 — 2026-08-25

- Count Chat and Work through one submission-bound event chain, keeping public selection, exact request model, final response model, reasoning effort, features, and conversation linkage separate.
- Preserve new and unmapped internal slugs exactly; missing request or response evidence remains `Unknown`.
- Add shared Basic/Advanced statistics, independently combinable line, two-level donut, and text sections, stable model colors, direct in-chart labels, and shared page/popup settings.
- Make reasoning-effort activation expand only the matching conversation index while keeping the current chart and statistics context intact.
- Rebuild conversation export so the current open chat is read locally from the rendered page, while full history comes from a user-selected ChatGPT official data export ZIP or `conversations.json`.
- Cache imported official conversation data locally, preserve explicit per-chat and project-folder selection, and export JSON, Markdown, PDF, DOCX, or PNG; one selection downloads one file and multiple selections download one ZIP.
- Remove direct account-history indexing from the export flow: it does not read ChatGPT session tokens, cookies, or authorization headers and does not crawl conversation history in the background.
- Add compact status layouts, English first-run UI, System/Light/Dark themes, aligned icon controls, transitions, and a redesigned brand icon.
- Keep hover-open settings and the active submenu available after language, theme, source, mode, or display changes until the pointer leaves the whole menu tree; keep Advanced response-model and reasoning-effort headings aligned on one row.
- Add width-matched toolbar artwork for one-character, two-character, and `99+` native badges so badge text does not cover the identity-bearing mark.
- Keep the default interface in English and preserve exact Chat/Work request-model and actual-response-model statistics, reasoning effort, feature signals, and linked conversations.
- Keep raw prompts and answers out of model-usage statistics, logs, and pending retry memory; conversation content is handled only for the rendered current chat or a user-imported official export when the user exports explicitly selected conversations.
