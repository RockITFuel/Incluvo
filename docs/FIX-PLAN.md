# Fix plan (review 2026-09-23)

Follows the critical review of 2026-09-23 (domain, backend security, frontend/a11y).
Ordered by risk: nothing in phase 1 depends on a product decision; phases 2+ have
a few questions for Mark, listed up front so they can be asked now.

Rough sizing: S ≈ ½ day, M ≈ 1–2 days, L ≈ 3–5 days.

---

## Product decisions (answered 2026-09-23)

| # | Question | Decision | Affects |
|---|----------|----------|---------|
| D1 | What may a **keyuser** do with leerlingen in their own school? | **Read and write** — a keyuser can act as any coach in their school (read everything, grade, share plans, edit tasks). | 1.1 |
| D2 | How does a coachplan live over time? | **One living plan + versions** — one current plan per leerling; each share keeps a read-only version; the leerling can start a revision. | 2.1 |
| D3 | Courses per klas or per leerling? | **Per leerling** — keep one private copy per leerling; drop course forums and group assignments inside courses (general chat stays). | 2.4 |
| D4 | The **ontwikkelaar**'s job? | **Build courses only** — templates + course builder, no access to any leerling's data. | 1.1, 5 |
| D5 | Template changes vs. school copies? | **Versions, school picks** — a template change creates a new version; a school copy stays on its version, sees that a newer one exists and upgrades when it chooses; filled-in plans keep the version they were made with. | 2.2 |

---

## Phase 0 — Safety net (M) — do first ✅ done 2026-09-23

Nothing here changes behaviour; it makes the later phases verifiable.

- **0.1 Test harness.** `bun test` in `apps/server`, against a separate DB
  `incluvo_test` on the existing Postgres (5435). Helper that pushes schema +
  audit trigger, seeds the demo users, and returns a signed-in oRPC client per
  role (`asRole("coach")`). Add `"test"` scripts + a `turbo test` task.
- **0.2 Second tenant in the seed.** `seed-demo.ts` gets a second school with its
  own coach + leerling, and a second (unassigned) coach in Demo School. Every
  cross-tenant/unassigned finding below needs this to be testable.
- **0.3 CI.** Extend `.github/workflows` with `check-types`, `lint`, `test`
  (Postgres service container).
- **0.4 Migrations, not push.** Switch the documented flow from `db:push` to
  `db:generate` + `db:migrate` (migrations 0000–0004 already exist). Phase 3 adds
  constraints that need data clean-up steps; `push` can't express those.

**Done when:** `bun run test` runs green in CI with one trivial test per role.

---

## Phase 1 — Security & tenant isolation (L) — blocker for any real data

### 1.1 One central "who may touch this leerling" rule ✅ done 2026-09-23 (except the items marked *open*)
Root cause of most findings: policies in `packages/permissions/src/policies.ts`
check tenant + role only; the coach↔leerling link is checked ad hoc.

- Add `packages/permissions/src/leerling-access.ts`:
  `canAccessLeerling(actor, leerling, { assignedCoachIds }, mode: "read"|"write")`
  - self (leerling acting on own data) → yes
  - superadmin → yes
  - keyuser, same tenant → read + write (D1)
  - coach → only with a `coach_assignment`
  - ontwikkelaar → no (D4)
- Server: replace `assertLeerlingReachable` (`courses/index.ts:195`) and the
  hand-written checks in tasks/dashboard/mood/coachplan with one
  `requireLeerlingAccess(context, leerlingId, mode)` in `procedures/base.ts`.
  Callers that load a row (submission, course execution, assignment submission,
  task, conversation) pass the row's `leerlingId`, never the client's.
- Apply to every endpoint the review flagged:
  - courses: `create`, `derive`, `tree` (also when `leerlingId` is omitted),
    `listSubmissions` (filter to reachable leerlingen for non-leerlingen),
    `gradeSubmission`, `respondProposal`, `setProgressBarHidden`,
    `submitAssignment`, `setProgress`
  - `getFile` / `authorizeFileAccess`: resolve the key to its owning row
    (submission / feedback / block) and check access on *that*; plain
    `readCourse` is not enough for pupil files
  - `chat.messages` for forum conversations: require membership (or
    `requireLeerlingAccess` for the course's leerling), not "coach-or-higher"
  - coachplan `saveCoachAnswer`: also verify the question belongs to the
    submission's template and is in the coach section
  - coachplan `getSubmission` for a leerling: hide coach-section answers until
    status is `shared`
- `addBlock` / `updateBlock`: reject a `fileStorageKey` that wasn't uploaded by
  the actor for this course. Done as a scope check (block/grade/submission keys
  must carry their own prefix; submission keys can't be reused across
  leerlingen). *open:* tie keys to the uploader (small `upload` table).
- *open:* `confirmUpload` still reports the size of any key.
- ✅ (in 2.4) the course "afleiden" dialog now only lists reachable leerlingen.
- Remove the `items` entity: router entry (`router.ts:36`), procedures, policies,
  schema, `/items` route, seed. It's readable across tenants today.

### 1.2 Accounts ✅ done 2026-09-23 (except the items marked *open*)
- `auth.ts`: `emailAndPassword: { enabled: true, disableSignUp: true }`; remove
  the sign-up toggle in `login.tsx`. Accounts are created only via invite.
- `users.invite` (`account/index.ts:396`): never attach a pre-existing
  self-registered account. Invite creates the user (or sends a set-password link
  through Mailpit/SMTP); existing accounts without an org are refused.
- *open:* delete any existing tenant-less `member` accounts in production, after
  checking them: `SELECT id, email, created_at FROM "user" WHERE organization_id IS NULL AND role = 'member';`
- ✅ Production (2026-09-24): `AUTH_IP_HEADER=cf-connecting-ip` (incluvo.d2d-hosting.dev
  is proxied by Cloudflare) and SMTP via Cloudflare Email Sending
  (`smtp.mx.cloudflare.net:465`, sender `no-reply@mail.d2d.cloud`, token in
  1Password `incluvo-smtp`). Takes effect on the next deploy.
- *open:* the origin (server2.d2d-hosting.dev) is reachable without Cloudflare,
  where `cf-connecting-ip` can be forged. Restrict the origin to Cloudflare IPs
  (or use Cloudflare Tunnel) to make the per-IP limit airtight.
- Rate limit: split — keep strict limits on `sign-in`/`reset`, exempt
  `get-session` (`auth.ts:42`), key by IP+email so one school NAT isn't locked
  out.
- *open:* gate `ai.translate` and `uploadLocal` behind a tenant + per-user rate
  limit (less urgent now that only invited users can sign in).

### 1.3 Streaming handler DB connection ✅ done 2026-09-24
- `ai.assistant` (async generator) runs queries after `requireAuth` released its
  pinned connection (`base.ts:53-57`). Either do all DB work before the first
  `yield` and pass plain data into the generator, or acquire/release a
  connection inside the generator (`try/finally`). Add a test that runs two
  assistant streams concurrently with a write in between.

### 1.4 Pool pressure ✅ done 2026-09-24
- Don't hold the pinned connection across slow external work: transcribe, AI
  calls, PDF rendering release it first (same pattern as 1.3).
- Set a pool acquire timeout (`connectionTimeoutMillis`) so overload returns
  503 instead of hanging.
- Done as: the request connection is taken on first query (`createRequestDb`),
  handlers call `context.suspendDb()` before transcribe, the assistant stream
  and PDF rendering, and the auth middleware releases a stream's connection
  when the stream ends (`releaseAfterStream`).

**Tests (all in phase 0 harness):** one test per flagged endpoint: unassigned
coach → 403, other-tenant coach → 403, ontwikkelaar → 403 on pupil data,
assigned coach → 200, leerling on own data → 200, leerling on other leerling →
403. Sign-up returns 4xx. Invite of an existing account is refused.

**Done when:** every finding in the backend review's High + "other authz gaps"
list has a failing-then-passing test.

---

## Phase 2 — Coachplan lifecycle & core domain (L)

### 2.1 A real plan lifecycle ✅ done 2026-09-24
Today "the plan" = newest submission; a new draft appears after every submit.

- Schema (per D2 default): `coachplan` (one per leerling per tenant, holds
  `currentVersionId`, `approvedWithParents`, `leervoorkeurLabels`) → versions =
  existing `form_submission` rows with `coachplanId`.
- Explicit state machine in one module (`apps/server/src/coachplan/lifecycle.ts`):
  `draft → submitted → in_review → shared → (revise) → draft(new version)`.
  Every mutation goes through `transition(from, to)` with a guarded
  `UPDATE … WHERE status = :from` (0 rows → 409).
  - `shareWithLeerling`, `saveCoachAnswer`: only from `submitted`/`in_review`.
  - `startMine`: returns the current plan; only creates a new draft when the
    leerling explicitly clicks "Plan bijwerken" on a shared plan.
  - Drop never-set states (`completed`) or give them a transition.
- One reader `getCurrentPlan(leerlingId)` used by dashboard `latestPlan`,
  `readLeervoorkeuren`, PDF and AI — delete the per-feature guessing.
- Data migration: per leerling, pick the current plan with today's
  `latestPlan` rule, attach older submissions as versions, delete empty drafts.
- Done as: `coachplan` table + `form_submission.coachplanId/version` (migration
  0008), `apps/server/src/coachplan/lifecycle.ts` (guarded `transition`,
  `createVersion`, `currentVersion`, `versionForCoach`,
  `currentLeervoorkeuren`), new `coachplan.mine` and `coachplan.revise`, and a
  leerling `/plan` page with three states (fill / with coach / shared + PDF +
  "Plan bijwerken"). Coach review page is read-only outside submitted /
  coach_review. Also fixed: "Sla over" and "bespreken" in the wizard threw on a
  question without a saved answer, so skipping didn't advance.

### 2.2 Answer mapping (#18) — finish it or cut it ✅ done 2026-09-24 (except the items marked *open*)
- `templatesCopyToSchool` (`coachplan/index.ts:319`): remap `mapsToQuestionId`
  inside the copy (reuse the logic from `seed-coachplan.ts:387-429`), in one
  transaction with the template insert.
- Coach form really pre-fills: initial value = override ?? mapped leerling
  answer (`plan/$submissionId.tsx:127`).
- Single source of truth for coach answers: `form_answer` only;
  `answer_coach_mapping.overrideValue` goes (migrate existing overrides into
  `form_answer`).
- PDF + AI read coach answers through one `resolveCoachAnswers(submission)` so
  mapped answers are included.
- Lock question type/options/section once a template has answers
  (`questionsUpdate`, `coachplan/index.ts:410`): editing → create a new template
  version instead.
- Done as: `submit` copies a mapped leerling answer into the coach answer
  (`form_answer` is the one place; `overrideValue` and `upsertMapping` are
  gone; the mapping row only drives the "Gemapt vanuit leerling" hint).
  Template copies keep the mapping. Versions per D5
  (`apps/server/src/coachplan/templates.ts`, migration 0011): `familyId` +
  `version` on templates, a stable `key` on questions; a form in use is
  read-only, "Nieuwe versie maken" starts the next version; a school copy sees
  a newer Ondivera version and upgrades when it chooses (new version becomes
  default and takes over assignments; plans keep their version); a revision
  moves to the school's current form with answers carried over by key.
- *open:* a new Ondivera version is offered to schools as soon as it exists,
  also while the superadmin is still editing it. Add a "publiceren" step if
  that matters.
- *open (2.2c):* courses — show a school copy when its source course changed
  since it was copied.

### 2.3 Course completion ✅ done 2026-09-24
- One source of truth for "done": `assignment_submission.status` drives the task
  (`task.done` becomes derived, or updated in the same transaction) and
  `content_progress`. Remove unused statuses or implement `returned`
  (coach sends back) — the grading UI already implies it.
- Done as: an opdracht is done once handed in. `submitAssignment` sets the
  submission, the takenlijst task and the block's progress in one
  transaction; ticking an opdracht task or block by hand is refused
  (BAD_REQUEST), and the takenlijst shows "Naar de opdracht" instead of a
  checkbox. Migration 0010 aligns existing data. *open:* `draft`/`returned`
  submission statuses stay unused until "coach stuurt terug" is wanted.

### 2.4 Forums & group work (D3: per leerling) ✅ done 2026-09-24
- Courses stay one private copy per leerling, so course forums and group
  assignments can never have classmates. Remove them: the `forum` block type
  and `isGroup` from the builder, `copyStructure` and the seed; migrate existing
  forum blocks away (their conversations stay readable in chat, or are archived).
- General chat (1:1 coach↔leerling) is unaffected.
- Done as: migration 0009 (forum blocks deleted after unlinking their chats,
  `forum` removed from the block-type enum, `assignment.is_group` dropped),
  builder/course view/seed cleaned up. Legacy forum chats stay readable for
  their members. Also: the "afleiden" dialog only offers giving a course to a
  leerling to coach+ and lists only reachable leerlingen (was: every user in
  the school, and a 403 for an ontwikkelaar).

### 2.5 Role model clean-up ✅ done 2026-09-24
- `user.role` → pg enum without legacy `member`/`admin`; migrate existing rows.
- Decide on `membership`: either read it (multi-org users) or drop it. Default:
  drop — `user.organizationId` is what's used everywhere (`base.ts:42`).
- `hasAtLeast("ontwikkelaar")` for the builder tab → explicit capability
  `canBuildCourses(role)` so coaches don't inherit builder rights by rank.
- Done as: `ROLES` = the five Incluvo roles; `user.role` is the `user_role`
  enum (migration 0012: admin → superadmin, member → leerling); `membership`
  dropped. `canBuildCourses` (ontwikkelaar, keyuser, superadmin) for
  templates, coach+ for a leerling's own copy. The ontwikkelaar has their own
  nav and lands on /cursussen; coachplan `mine`/`startMine`/`revise` are
  leerling-only. The web's `useMe().role()` is null while loading.

**Done when:** a leerling can submit, get a shared plan, revise it, and the
dashboard/PDF/AI/course labels all show the same version; tests cover each
illegal transition returning 409.

---

## Phase 3 — Data integrity (M) ✅ done 2026-09-24 (except the items marked *open*)

Each constraint = migration that first de-duplicates, then adds the index.

- Unique: `form_answer(submission_id, question_id)`,
  `answer_coach_mapping(submission_id, question_id)` (if kept),
  `form_assignment(leerling_id)` (or per template — per D2),
  `coach_assignment(coach_id, leerling_id)`,
  `task(assignment_id, leerling_id)`,
  `assignment_submission(assignment_id, leerling_id, attempt)`,
  partial unique `form_template(organization_id) WHERE is_default`.
- Autosave `saveAnswer` → `INSERT … ON CONFLICT DO UPDATE` (`coachplan:720`).
- `maxAttempts`: compute attempt number inside the insert transaction; the
  unique index makes concurrent over-submission fail.
- Wrap in transactions: `submit`, `templatesCopyToSchool`, `setSchoolDefault`,
  `updateBlock` label replace, `setRole`, `invite`, `chat.send`.
- Audit (`audit-trigger.sql`):
  - add the `user` table (role/org changes), excluding password/secret columns;
  - store only changed column names + ids for `message` / `form_answer`, not
    full content (GDPR erasure must not leave copies);
  - implement retention (`admin/index.ts:621`): scheduled purge of audit rows
    and deleted-leerling data after N months (N = decision, default 24).

**Done when:** a concurrency test (20 parallel autosaves / submissions) produces
no duplicates and no over-limit attempts.

Done as: migration 0006 (dedupe + nine unique indexes, submissions renumbered
rather than deleted), upserts for answers/assignments/memberships, attempt
numbers under a unique index with retry, guarded `submit`, transactions for
template copy, school default, block labels, role/invite and chat send.
Audit: `keys_only` snapshots for pupil free text (migration 0007 scrubs old
rows), `user` audited (role + organization only), daily purge after
`AUDIT_RETENTION_DAYS` (default 730).
- *open (phase 2):* `answer_coach_mapping` uniqueness — the mapping is being
  reworked in 2.2.
- *open, needs decisions:* retention of pupil data itself (plans, chats,
  recordings, transcripts) per school. The admin settings screen is still a
  stub; which data is deleted when, and whether schools may change the terms,
  is a policy question.
- *open (new finding):* nothing in the app creates or removes coach
  assignments; only the seed does. A keyuser needs a screen for it.

---

## Phase 4 — Accessibility (WCAG AA) (M–L)

- **4.1 Font scaling.** Type tokens in `app.css:61` → `rem`; replace the 167
  inline `"font-size": "Npx"` and px sizes in `design-system.css` with tokens.
  Add a lint rule (grep in CI) forbidding px font sizes.
- **4.2 Reflow (1.4.10).** Replace inline `2fr 1fr` grids
  (`welkom/index.tsx:326`, `dashboard/$leerlingId.tsx:258`) and `.ds-grid` with
  responsive classes that stack below ~768px. Test at 320px wide.
- **4.3 Page titles & route announcements (2.4.2, 4.1.3).** Per-route `head`
  title ("Mijn plan – Incluvo"); on navigation move focus to `<h1>` (tabindex
  -1) and announce via a polite live region. Add missing `<h1>` on `/chat`,
  fix h1→h3 jumps.
- **4.4 Coach dashboard semantics.** Filter: real `role="tab"`/`aria-selected`
  or plain toggle buttons (no tablist). Pupil list: real `<table>` or list;
  row = link to the detail, with Chat/Profiel as separate controls (no nested
  interactive). Mood emoji: `role="img"` + `aria-label`, full weekday names.
- **4.5 Unused a11y settings.** Hide "Voorlezen" and "Taal" until implemented.
- **4.6 Automated checks.** axe-core via Playwright on each role's main pages in
  CI (the review's scratch scripts can be the starting point); fail on serious
  violations.
- Colour: remove hard-coded `#fff` / `rgb(255 255 255/.18)` (`welkom:455-490`)
  in favour of tokens so high-contrast mode works.

**Done when:** axe clean on all main pages per role; M→L visibly scales text;
no horizontal scroll at 320px.

---

## Phase 5 — Flow & UI clean-up (M)

- **Dead buttons:** implement or remove — "Taak voor klas", "AI-overzicht week"
  (`dashboard/index.tsx:182`), PDF/AI-advies on leerling detail
  (`$leerlingId.tsx:295` → link to `/plan/$id` of the current plan), topbar
  search, chat phone/video/paperclip. Default: remove; add back when built.
- **One AI-advice entry point:** the `/plan/$id` sidebar. `/assistent` becomes a
  thin picker that links there, or goes.
- **One "Formulieren":** drop the read-only Beheer tab, keep `/plan/beheer`
  (linked from Beheer). Same for Beheer→Cursussen.
- **Coach task management:** link `/taken/$leerlingId` from the leerling detail
  page; back link returns to where you came from.
- ✅ (in 2.5) **Ontwikkelaar home:** own nav and landing on `/cursussen`;
  `startMine` rejects non-leerlingen server-side.
- Nav: remove the duplicate "Mijn successen"; remove unused breadcrumb code or
  pass `crumbs`.
- Error states: every query shows an error state distinct from "empty"; map
  server errors to friendly Dutch messages (`plan/index.tsx:136`, `login.tsx:67`).
- Remove ticket numbers from UI copy (`cursussen/$courseId.tsx:299,526,585`,
  `templates-panel.tsx`).
- Confirm dialog (or undo) on deleting a builder section.
- `todayKey()` (`welkom:112`) → Europe/Amsterdam date.
- Successen toggle persisted per leerling (server-side), per decision doc.
- "Volgende afspraak": hide until it has a backend.

---

## Phase 6 — Code health & docs (ongoing, S each)

- Split `dashboard/$leerlingId.tsx`, `course-builder.tsx`, `welkom/index.tsx`,
  `courses/index.ts` (2k lines), `coachplan/index.ts` into per-feature modules.
- Shared utils: one `initials()`, one `relativeTime()`, use `ProgressBar`.
- Pick one styling system: migrate the ported prototype CSS / inline styles to
  Tailwind + `components/ui` page by page as they're touched.
- Data fetching: plan wizard to solid-query like the rest.
- AI prompts: pupil answers and `coachplanContext` in the *user* message with
  delimiters, not the system prompt; server builds the context (ignore the
  client-supplied one); reject client `assistant` turns; cap `messages` length;
  pseudonymise the pupil name before sending.
- AI residency: `AI_ALLOWED_HOSTS` override only honoured when
  `NODE_ENV !== "production"`; log a loud warning at boot when it's set.
- Rewrite `docs/IMPLEMENTATION-STATUS.md` from the code (it's wrong in both
  directions), and link this plan from `ROADMAP.md`.

---

## Order & milestones

1. **Week 1:** Phase 0 + 1.2 (sign-up/invite) + 1.1 started. → no more open doors.
2. **Week 2:** 1.1 complete, 1.3, 1.4. → **gate: OK for real minors' data**
   (together with the EU AI endpoint).
3. **Week 3:** Phase 3 + 4.1–4.3.
4. **Weeks 4–5:** Phase 2 (lifecycle, mapping, completion, forums).
5. **Week 6:** 4.4–4.6, Phase 5. Phase 6 alongside, as files are touched.
