# Incluvo — Code Review (2026-06-06)

Adversarial review by 4 parallel reviewers (security/multi-tenant, backend/data/SSE, frontend/WCAG,
privacy-AVG/uploads/AI), with the orchestrator independently verifying the top findings against the
code. Severity = release-impact for a platform handling **minors'** data under AVG/GDPR + a contractual
**WCAG 2.1 AA** requirement. `file:line` references are to the current tree.

## Resolution status (fixed 2026-06-06, post-review)
Fixed in 4 parallel fix-waves + orchestrator verification:
- **C1 SSE leak** ✅ `/sse/events` now 401 without a session; hub rewritten to per-user `publishTo` (no global broadcast). *Verified: no-cookie→401, non-member gets no chat body.*
- **C2 file traversal + IDOR** ✅ strict key validation + `resolve().startsWith` guard + ownership/tenant authz on `getFile`; presigned GET in prod. *Verified: `../../../.env`→400.*
- **H1 XSS/CSP** ✅ magic-byte sniffing + server-derived type + `nosniff` + baseline CSP.
- **H2 transactions** ✅ wrapped `setLearningPreferences`/`submit`/`derive`/`addBlock`/`gradeSubmission`/etc; side-effects post-commit.
- **H3 rate limiting** ✅ better-auth (5/min sign-in) + per-user limits on AI/PDF. *Verified: translate 30×200→429.*
- **H4 erasure** ⚠️ `deleteAudio` now actually deletes the object; **retention TTLs + parental-consent gating remain product-pending** (need the settings table + `QUESTIONS-FOR-MARK §4`).
- **H5 contrast** ✅ all failing pairs recomputed to ≥4.5:1 (text)/≥3:1 in **both** normal + high-contrast modes.
- **H6 route guard** ✅ `requireRole("coach")` on coach-review. **H7** ✅ single shared EventSource.
- **Mediums** ✅ `leerlingId` tenant validation, `.uuid()` hygiene, EU AI host allow-list (fail-closed), API-docs default off, PDF browser pooling, Docker (Chromium+non-root), 12 DB indexes, generic transcription errors, a11y (aria-live, reorder announce, nested-button, Tiptap, Tabs `<For>`), nav link.
- Repo **green** (4/4); cross-role browser sweep **0 errors**.

## Verdict
The **synchronous RPC surface is genuinely strong**: per-procedure RBAC + `sameTenant` re-checks on
loaded rows, audit-actor pinning on every authed mutation, role-gated routes (mostly), validated env,
gitignored secrets, coach-gated AI, Kobalte a11y primitives + a real preferences store. **But it is NOT
production-ready for real pupil data.** The weaknesses cluster in the *out-of-band channels* (SSE, file
access), missing *hardening* (transactions, rate limiting, retention/erasure), and *measurable WCAG AA
contrast failures*. All are well-scoped to fix.

---

## CRITICAL (ship-blockers)

### C1 — SSE broadcasts all events to all clients; `/sse/events` is unauthenticated
`apps/server/src/sse.ts:15-26` (`publish` → global `clients` set) · `apps/server/src/index.ts:42-44` (no auth).
Every published frame goes to **every** connected socket, and the endpoint requires no session. Payloads
carry real content: `chat.message` includes the full message **body** + senderName (`chat/index.ts:465-477`);
`notification.new` carries recipient `userId`+title (`notify.ts:77-85`); coachplan/task/course events carry
leerling/submission ids. **Exploit:** any browser (even anonymous, or a leerling in another tenant) opening
`GET /sse/events` receives every user's private chat + activity in real time — a continuous cross-tenant
breach of minors' data. *Verified by orchestrator.* **Fix:** authenticate the endpoint (resolve session like
`createContext`); key `clients` by `userId` (`Map<userId, Set<controller>>`); have `publish` take an explicit
recipient set (chat already computes `recipientIds`, notify has `userId`); never fan bodies globally.

### C2 — `courses.getFile`: path traversal + zero authorization (IDOR)
`apps/server/src/procedures/courses/index.ts:1013-1027` (`void context`) → `apps/server/src/courses/storage.ts:138-141`.
`getFile` takes a client-controlled `storageKey: z.string()` (no constraint) and: (a) reads
`join(LOCAL_UPLOAD_DIR, storageKey)` with **no sanitization** → `storageKey="../../../.env"` reads arbitrary
server files incl. `BETTER_AUTH_SECRET` (local-dev); (b) performs **no ownership/tenant check**, so any
authenticated user can fetch any pupil's assignment uploads or coach feedback media by replaying a key (keys
leak in `tree`/`listSubmissions` responses). In prod, `publicUrl` (storage.ts:175-180) returns a **permanent
unsigned** S3 URL. *Verified by orchestrator.* **Fix:** strict key regex + `resolve().startsWith(DIR)` guard;
resolve the key to its owning row and enforce `readCourse`/submission ownership; issue short-lived presigned
GETs in prod (never public URLs for pupil data).

---

## HIGH

### H1 — Stored XSS via client-trusted content-type served as data: URL; no CSP
`storage.ts:25-42` allow-list is checked against the **client-sent** `contentType` string, never the bytes;
`getFile` returns `data:${guessContentType(key)};base64,...` (ext-derived MIME, never sniffed); no
`Content-Disposition`/`X-Content-Type-Options`, and **no CSP** anywhere (`index.ts`). A crafted upload renders
in the victim's origin. **Fix:** magic-byte sniff + server-derived immutable type; `Content-Disposition:
attachment` + `nosniff`; add a strict CSP.

### H2 — No transactions on any multi-write operation (data-loss / corruption)
Zero `db.transaction(` in the server. Worst cases: `courses.derive`/`copyStructure` deep-copy
(`courses/index.ts:367-520`) — partial copy leaves orphaned sections/blocks; `gradeSubmission`
(`:1508-1578`) — grade written but status not flipped; `addBlock` (`:688-784`); and
**`coachplan.setLearningPreferences` (`coachplan/index.ts:1149-1166`) delete-then-insert wipes a leerling's
leervoorkeuren if the insert fails.** **Fix:** wrap each in `db.transaction` (audit pinning works fine inside).

### H3 — No rate limiting anywhere (auth brute-force; AI/PDF DoS)
No `rateLimit` in `auth.ts` or `index.ts`. `/api/auth/*` is open to credential stuffing against minors'
accounts; AI + PDF endpoints are unthrottled, and `coachplan` PDF launches a **fresh headless Chromium per
request** (`coachplan/pdf.ts:121-138`). (PDF HTML *is* escaped via `esc()` — no injection found.) **Fix:**
enable better-auth `rateLimit`; throttle auth/AI/upload/PDF; pool/reuse one browser.

### H4 — Right-to-erasure broken; no retention/consent for minors (AVG)
`ai.deleteAudio` (`ai/index.ts:234-255`) only NULLs `audioStorageKey` — the object is **never deleted**
(no S3 delete/unlink), orphaning minors' recordings. No retention TTLs (settings table stubbed); no
parental-consent gate before recording/transcribing. **Fix:** delete the object in-handler; retention TTLs;
consent check (parental for <16) before `transcribe`.

### H5 — WCAG 2.1 AA contrast failures on load-bearing text (measured)
Against `app.css` tokens: `text-muted-2` (#8A9AA0) = **2.59:1** — used for input **placeholders**
(app-wide), notification timestamps, nav labels, breadcrumbs. `text-warning` on `bg-warning-100` = **2.72:1**
— the chat **"coach kijkt mee"** transparency banner + AI **MOCK** banner. White on `bg-accent` = **2.93:1**
— the bell unread-count. These **persist in high-contrast mode** (warning/accent not overridden,
app.css:89-99). Fails the hard #1 requirement. **Fix:** darken `--muted-2` (→ ~`--muted` 4.75:1), use
`accent-700`/darker warning for text-on-tint + badge fills; override them in high-contrast mode.

### H6 — Missing `requireRole` guard on the coach-review route (defense-in-depth)
`routes/_protected/plan/$submissionId.tsx:24` has only `component:` (no `beforeLoad: requireRole("coach")`),
contradicting its docstring; queries fire for any authenticated user. Server `getSubmission`/`listMappings`
remain owner/tenant-scoped (so not a cross-pupil leak today), but the guard must exist and match siblings.
*Verified.* **Fix:** add `beforeLoad: () => requireRole("coach")`.

### H7 — SSE client opens one `EventSource` per `useServerEvent` call (connection starvation)
`lib/sse/use-events.ts:12-13` — `items.tsx` alone opens 3; with bell+chat+courses+tasks ≈ 5-7 sockets/page,
near the ~6/origin HTTP/1.1 cap → data fetches can starve. **Fix:** a single shared `EventSource` singleton
that fans out to subscribers with ref-counted cleanup.

---

## MEDIUM
- **Courses trust client `leerlingId`** (`tree:1089`, `setProgress:1289`, `submitAssignment:1381`): the course
  is tenant-gated but the supplied leerlingId isn't validated → cross-tenant read of progress/leervoorkeuren
  and write of progress rows. Validate the leerling's tenant/assignment first.
- **N+1 / serial loops:** `chat.list` per-conversation last-message query (`chat/index.ts:189-196`);
  `dashboard.overview` serial per-leerling loop ~6-9 queries × N (`dashboard/index.ts:512-600`). Batch with
  `DISTINCT ON` / window functions + `inArray`+`GROUP BY`.
- **No DB indexes** on hot FK/filter columns (notification(user_id,read), task.leerlingId,
  message(conversation_id,created_at), conversation_member, membership, coach_assignment, content_progress).
- **`.uuid()` validation inconsistent** (chat/tasks/courses/dashboard use bare `z.string()`) → 500s instead of 400s.
- **AI EU-residency not enforced:** `AI_BASE_URL` passed to the SDK with no allow-list (`ai/provider.ts:80-83`);
  switch fails *closed* to mock (good), but a misconfig sends minors' audio/special-category data anywhere.
  Validate against approved EU hosts at startup; fail closed.
- **`ENABLE_API_DOCS` defaults `true`** (`env.ts:29`) → full OpenAPI surface unauthenticated in prod if unset.
  Default `false`.
- **Docker:** server image never installs Chromium (PDF crashes at runtime), runs as **root**, and `.env*`
  isn't in `.dockerignore` (secret in the pruner layer). Add Chromium, a non-root `USER`, `.env*` ignore.
- **a11y:** chat thread lacks `aria-live` (SSE messages silent to SR, `chat-panel.tsx:311`); course reorder has
  no announcement (`course-builder.tsx`); dashboard row is `role="button"` with nested `<Link>`s (invalid ARIA,
  `dashboard/index.tsx:109`); Tiptap toolbar `aria-pressed` goes stale on selection (`page-editor.tsx:105`);
  `ui/tabs.tsx:44,54` uses `.map` not `<For>` (stale tabs when role-derived `items()` changes).
- **transcription error leaks provider detail** to client (`ai/index.ts:194-196`).
- **Broken coach nav link:** "Leerlingen" → `/beheer` is keyuser-only (`nav.ts:30`) → coaches bounce to `/`.

## LOW
- `BETTER_AUTH_SECRET.min(1)` → `min(32)`. · `user.role` bare `text` not enum-constrained (`better-auth.ts:26`).
- `coachplan.saveAnswer` questionId not bound to `sub.templateId` (`:651`, self-scoped). · `accessChat` coach
  forum read-along is tenant-wide, not supervision-scoped — confirm intent. · CORS returns first allowed origin
  on a non-match (cosmetic; browser still blocks). · leftover `/items` demo route is shippable. · RTL only for
  Arabic. · `hasNotifications` is dead/hardcoded `true` (`_protected.tsx:57`).

## Corrected (false positive)
- "AppShell nav/user props are non-reactive, role never updates" — **incorrect**. AppShell uses `props.nav`
  inside `<For>` (app-shell.tsx:52) and Solid compiles `nav={navForRole(role())}` to a reactive getter, so it
  updates when `account.me` resolves. Only a brief pre-resolve flash → add a loading state (Low).

## Confirmed sound (no action)
Per-procedure RBAC + `sameTenant` re-checks; audit-actor pinning on all authed mutations; role can't be
injected at signup (`input:false`); keyuser can't grant superadmin / act cross-tenant; admin list/audit
tenant-scoping; `.env` gitignored + never committed; coach-gated AI; AI mock fails closed; PDF HTML escaped;
skip-link + global focus-visible.

---

## Suggested fix order
1. **C1 SSE** (auth + per-recipient fan-out) — biggest breach, small change (recipients already computed).
2. **C2 file access** (key validation + authorization + presigned GET) + **H1** (sniff + CSP + nosniff).
3. **H3 rate limiting** (auth first) + **H2 transactions** (start with `setLearningPreferences`, `derive`, `grade`).
4. **H5 contrast** (token tweak, high impact for #1) + **H6 route guard** + **H7 single EventSource**.
5. **H4 erasure/retention/consent** — needs the deferred settings/retention table + product decisions (Q&A §4).
6. Medium hardening (leerlingId validation, indexes, `.uuid()`, EU allow-list, API-docs default, Docker).
