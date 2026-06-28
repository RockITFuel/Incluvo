# Locked tooling decisions (from research, 2026-06-06)

Full reports: `docs/research/ai-layer.md`, `docs/research/content-stack.md`. Feature agents must follow these.

## AI layer (Epic 7)
- **Run AI server-side** in oRPC procedures on Bun; **stream to Solid via the oRPC Event Iterator** (stable, sovereign). No `@ai-sdk/solid` (deprecated).
- **UI:** `@tanstack/ai-solid` (`useChat`) — ALPHA (v0.13.x). Wrap behind a thin local hook so we can swap to a hand-rolled Event-Iterator client. Pin versions.
- **RAG/embeddings:** Postgres + **pgvector** via Drizzle.
- **Provider (EU residency is a HARD requirement, #2/#4.4):** primary Azure OpenAI Data Zone (EUR, Sweden Central); sovereignty-max fallback Mistral (EU). Residency must be verified at infra/contract level — never assume defaults are EU.
- **Transcription (#18):** OpenAI-compatible transcription model via the EU endpoint; store transcript, allow deleting source audio after transcription (privacy 4.3).

## Content / UI stack
- **Forms (Coachplan #8–#21):** `@modular-forms/solid@^0.25.1`. Form *templates* stored as `jsonb` validated by a shared Zod schema; render via a per-question-type component registry; build a runtime Zod schema for the wizard (autosave + validation). Conditional logic = derived signal; coach mapping declarative in template.
- **WYSIWYG (Course pagina #29):** `solid-tiptap@^0.8.0` + `@tiptap/core@^3.26` + `@tiptap/extension-youtube`. Custom CbS blocks = Tiptap atom `Node.create` storing reference ids. Persist ProseMirror JSON.
- **PDF (#20):** HTML→PDF via `playwright` headless Chromium (reuse Tailwind); `pdf-lib` for post-processing. (Docker must ship Chromium.)
- **Uploads (#27/#30):** native **`Bun.S3Client`** (MinIO-compatible, EU self-host) — presigned direct PUT, server-side type/size allow-list, `s3.stat()` re-verify. No AWS SDK.
- **Drag-and-drop (#25/#26 ordering):** `@thisbeyond/solid-dnd@0.7.5` (maintenance mode — pin; vendor if needed).
- **YouTube embed (#31):** `youtube-nocookie.com` with a server-validated 11-char id.
- **LTI 1.3 (#33, Post):** defer; `ltijs` as an isolated service when needed.

## Existing foundation (already in repo)
- oRPC + better-auth + Drizzle/Postgres + SolidStart SPA + Tailwind + Kobalte/Ark, RBAC in `@incluvo/permissions`, audit via Postgres trigger, SSE realtime. Ports: web 3200, server 3210, Postgres 5435.
