# Incluvo — Implementation status

Generated after the multi-agent build (orchestrator + per-epic subagents). All epics were built
on a shared foundation, registered via the domain-router pattern, and verified (typecheck + curl +
headless-browser) per epic and across roles. Stack/ports: web :3200, server :3210, Postgres :5435.

Demo logins (password `incluvo123`): `superadmin@`, `keyuser@`, `coach@`, `leerling@`, `ontwikkelaar@incluvo.local`.
Seed: `bun run --cwd apps/server seed:demo && … seed:coachplan && … seed:courses`.

## Backlog coverage

| # | Item | Epic | Status |
|---|------|------|--------|
| 1 | WCAG AA (+ AI-vertaling) | 0B / 7 | ✅ AA design system + a11y panel; AI translate (mock) |
| 2 | EU/NL hosting & soevereiniteit | 0C | ✅ EU-hostable stack; AI EU-provider abstraction; self-host fonts noted |
| 3 | Notificaties | 8 | ✅ bell + panel + SSE; ⚠️ `notify()` wiring into events = wiring step |
| 4 | Leerling landingspagina | 0B/1 | ✅ calm shell + role nav (welkom landing can be enriched) |
| 5–6 | Chat 1:1 + groep/forum + supervisie | 5 | ✅ |
| 7 | Coachtaak vanuit chat (Wens) | 5 | ⏸ post-MVP |
| 8–10 | Formulieren templates/manager/koppelen | 2 | ✅ |
| 11–14 | Leerling wizard (autosave, bespreken, overslaan, overzicht) | 2 | ✅ |
| 15–17 | Coach: antwoorden, mapping, vragenlijst | 2 | ✅ |
| 18 | Transcriptie → conceptantwoorden | 7 | ✅ (mock); ⚠️ "Overnemen" into coachplan = wiring step |
| 19 | Leervoorkeur-labels | 2 | ✅ |
| 20 | PDF coachplan | 2 | ✅ (Playwright; ship Chromium in Docker) |
| 21 | Afgestemd met ouders | 2 | ✅ |
| 22 | AI-assistent advies (Wens) | 7 | ✅ streaming (mock); RAG/pgvector = follow-up |
| 23–32 | Cursussen: 3 types+overerving, secties, CbS opdracht/pagina/bestand/youtube/forum | 4 | ✅ |
| 24/28 | Voortgangsbalk + beoordelen | 4 | ✅ |
| 33 | LTI 1.3 (Wens) | 4 | ⏸ stub (NOT_IMPLEMENTED) |
| 34 | Ondivera-contentadvies (Wens) | 4 | ⏸ stub |
| 35–36 | Aanbevolen content o.b.v. leervoorkeuren | 4 | ✅ |
| 37–41 | Takenlijst | 3 | ✅ |
| 42–44 | Dashboard / quickpanel / profiel | 6 | ✅ |
| 60 | Admin omgeving | 9 | ✅ (tabbed beheer); retention persist = schema follow-up |
| 61 | Eigen opdracht voorstellen (Wens) | 4 | ✅ |

## Remaining wiring (cross-domain polish — features exist, connect them)
1. **`notify()` into real events** (#3): call `notify()` from coachplan submit/share, task create/today, course activity, chat message. Helper: `apps/server/src/notifications/notify.ts`.
2. **Transcriptie "Overnemen"** (#18→#16/#17): wire the AI proposals into coachplan `upsertMapping`/`saveCoachAnswer`.
3. **Chat deep-link** from dashboard/quickpanel snelactie (add `?conversationId=`/`?otherUserId=` to `/chat`).

## Schema follow-ups (need a Drizzle migration — deliberately deferred by agents)
- **Retention/settings table** (#4 AVG bewaartermijnen) — admin UI + typed shape exist; persistence stubbed (`NOT_IMPLEMENTED`).
- **`user.active`** deactivate/reactivate flag (#60) — not present, so deactivation not built.
- **pgvector + `kennisdocument`/embeddings** table for RAG-grounded AI advies (#22).
- **`readAudit` policy** — relax to formalise keyuser tenant-scoped audit (currently enforced in-handler).

## Production config (before go-live)
- AI: set `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`/`AI_TRANSCRIBE_MODEL` to an EU-resident endpoint (Azure OpenAI Data Zone EUR / Mistral EU); verify residency contractually. Wire `ai.deleteAudio` to actually delete the EU object.
- Uploads: set `S3_*` to an EU/NL MinIO/S3; without them the local-dev fallback writes to `apps/server/uploads/`.
- PDF: ship Chromium in the server Docker image (Playwright).
- Fonts: self-host Bricolage Grotesque / Inter / Atkinson Hyperlegible WOFF2 (no Google Fonts — EU sovereignty #2).

See `docs/QUESTIONS-FOR-MARK.md` for the product decisions that would replace current werkaannames.
