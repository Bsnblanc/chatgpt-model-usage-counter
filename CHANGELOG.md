# Changelog

## 1.5.0 — 2026-08-24

- Count Chat and Work through one submission-bound event chain, keeping public selection, exact request model, final response model, reasoning effort, features, and conversation linkage separate.
- Preserve new and unmapped internal slugs exactly; missing request or response evidence remains `Unknown`.
- Add shared Basic/Advanced statistics, independently combinable line, two-level donut, and text sections, stable model colors, reasoning-effort drill-down, and shared page/popup settings.
- Rebuild conversation export around explicit per-chat and project-folder selection, complete paginated indexing, JSON/Markdown/PDF/DOCX/PNG output, multi-chat ZIP reports, statistics backup/CSV export, and JSON restore.
- Add compact status layouts, English first-run UI, System/Light/Dark themes, aligned icon controls, transitions, and a redesigned brand icon.
- Add width-matched toolbar artwork for one-character, two-character, and `99+` native badges so badge text does not cover the identity-bearing mark.
- Enforce user-triggered, read-only, same-origin account access with one global request worker, one-second request-start spacing, global 429 backoff, and per-operation limits of 50 conversations, 60 requests, and 90 seconds.
- Keep raw prompts out of statistics, storage, exports, logs, and pending retry memory; pending linkage retains only a prompt hash and length.
