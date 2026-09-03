# Changelog

## 1.5.0 — 2026-08-25

- Count Chat and Work through one submission-bound event chain, keeping public selection, exact request model, final response model, reasoning effort, features, and conversation linkage separate.
- Preserve new and unmapped internal slugs exactly; missing request or response evidence remains `Unknown`.
- Add shared Basic/Advanced statistics, independently combinable line, two-level donut, and text sections, stable model colors, direct in-chart labels, and shared page/popup settings.
- Make reasoning-effort activation expand only the matching conversation index while keeping the current chart and statistics context intact.
- Keep the current open chat first, restore the user-triggered signed-in account conversation index, reuse the loaded list until Refresh, and preserve explicit per-chat and project-folder selection.
- Read only the selected conversation bodies after a format click and export JSON, Markdown, PDF, DOCX, or PNG; one selection downloads one file and multiple selections download one ZIP.
- Route account reads through one extension-wide scheduler with single concurrency, a one-second real-start gap, 45-second abort timeouts, bounded operations, and global Retry-After backoff; credentials remain memory-only.
- Add compact status layouts, English first-run UI, System/Light/Dark themes, aligned icon controls, transitions, and the letter-free Model Processor brand mark.
- Keep hover-open settings and the active submenu available after language, theme, source, mode, or display changes until the pointer leaves the whole menu tree; keep Advanced response-model and reasoning-effort headings aligned on one row.
- Keep the Model Processor toolbar mark at its normal proportions. Chrome draws its native badge over the icon at a browser-controlled position; the extension does not claim to move that badge, and the processor body and three-core die remain recognizable when lower-right pins are partially covered.
- Keep the default interface in English and preserve exact Chat/Work request-model and actual-response-model statistics, reasoning effort, feature signals, and linked conversations.
- Keep raw prompts and answers out of model-usage statistics, logs, and pending retry memory; conversation content is read only for conversations explicitly selected for export.
