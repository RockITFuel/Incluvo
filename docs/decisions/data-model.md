# Data model & permissions — assumptions (Foundation 0A, 2026-06-06)

Owned by the FOUNDATION-DATA agent. Scope: `packages/drizzle/**` (schema) and
`packages/permissions/**` (RBAC). Other agents build UI/features on top of this.

These are product assumptions ("werkaannames") made so the build can proceed
while open questions in `docs/QUESTIONS-FOR-MARK.md` are still pending. Each is
also marked with an `// ASSUMPTION:` comment at the relevant place in code.

## Multi-tenant & roles (QUESTIONS 3.x)
- **One user = one tenant for now** (QUESTIONS 3.2 open). `user.organizationId`
  is the single tenant. An explicit `membership` table records the role link and
  leaves room to relax to many-to-many later without a breaking change.
- **Role hierarchy** (least→most privileged):
  `leerling < ontwikkelaar < coach < keyuser < superadmin`, where superadmin =
  Ondivera (platform owner), keyuser = school/klant beheerder, coach = coach/docent,
  leerling = pupil. **`ontwikkelaar` = the course-builder right** (#25–#36),
  modelled as its own role (it sits below coach so a coach can also build).
- **Legacy roles kept:** the demo's `member` (lowest) and `admin` (highest)
  remain valid `UserRole` values so existing `apps/server` + `apps/web` code
  keeps compiling/working. New code should use the Incluvo roles. `user.role`
  default stays `"member"` (better-auth owns that column).
- **Single Ondivera root org**; schools reference it via `organization.parentId`.
- **Coach↔leerling assignment** is an explicit `coach_assignment` table (drives
  dashboard #42–#44, notification routing, group-chat supervision #6). The
  per-pupil "hide task list" toggle (#39) lives on this row.

## Coachplan / formulieren (#8–#21)
- Templates carry a `scope` (ondivera | school) and derive via
  `parentTemplateId` (Ondivera template → school copy, #8→#9).
- Each question has a `section` (leerling | coach) — one template holds both the
  leerling-gedeelte and coach-gedeelte.
- Question `type` includes a `leervoorkeur` trigger type that feeds the
  leeromgeving (#19/#35/#36). Question `options` stored as `jsonb`.
- Per-leerling form choice (#10) is a `form_assignment` row overriding the
  school default (`form_template.isSchoolDefault`).
- Flags live on `form_answer`: `discussWithCoach` (#12), `deliberatelySkipped`
  (#13). "Afgestemd met ouders" (#21) is a boolean on `form_submission`.
- Answer→coach-question mapping (#16) is `answer_coach_mapping` with an editable
  `overrideValue`.
- Leervoorkeur labels (#19) are `learning_preference_label` rows on a submission;
  the same label strings tag course content (`content_block_label`, #36).
- **Transcription (#18):** `transcription` row stores `audioStorageKey` (nullable
  so the recording can be deleted after transcription, QUESTIONS 4.3) +
  `transcriptText`.

## Online cursus (#23–#36, #61)
- Three `course.kind`s (ondivera_template | school_template | student_execution)
  with a `parentCourseId` derivation chain (#23). **Inheritance-on-update is left
  to the feature layer** (QUESTIONS 6.1 open: overerven vs. loskoppelen); the
  schema only records the source link.
- `content_block.type` discriminates opdracht/pagina/bestand/youtube/forum/lti
  (#26–#33); type-specific columns (`body`, `fileStorageKey`, `youtubeUrl`,
  `ltiConfig`) are nullable on the single table.
- Files are referenced by an opaque `*StorageKey` string; **blob storage backend
  is out of scope here** (feature/infra layer).
- **Grade (#28) stored as free `text`** because the scale/rubric is undecided
  (QUESTIONS 6.4). Feedback supports text + a media storage key (spraak/video).
- Progress (#24) tracked per (content_block, leerling) in `content_progress`;
  `content_block.countsForProgress` controls inclusion; coach can hide the bar via
  `course.progressBarHidden`.
- Student-proposed assignment (#61) is `proposed_assignment` with a status flow.

## Takenlijst (#37–#41)
- `task.source` = assignment | manual. Assignment-sourced tasks link to
  `assignment`; `pinnedForToday` (#38) and `done` (#40) are booleans. The "hide
  task list" toggle (#39) is on `coach_assignment` (see above).
- **A manual task may carry its own `dueAt`** (QUESTIONS 8.1 leaves open whether a
  leerling sets it); enforcement of who may set it is left to policy/feature.

## Chat (#5–#7)
- `conversation.kind` = direct (1:1, #5) | forum (group within a course, #6/#32);
  a forum links to its `content_block`. Membership is explicit; a coach can be a
  `supervisor` member to always read along (#6).
- A message may link a `task` created from the chat window (#7).

## Notifications (#3)
- In-app only for MVP (QUESTIONS 10.1). `notification` carries a `type` enum +
  `read` flag and a loose `entityType`/`entityId` link (no hard FK per type) for
  deep-linking.

## Permissions (`@incluvo/permissions`)
- Kept the existing `definePolicy`/`checkPermission`/`can` API and `./solid`
  export. Added `sameTenant(actor, resource)` tenant-scoping helper,
  `isSuperadmin`, and `atLeast` is exported. `PolicySubject.organizationId` is
  **optional** so existing `{ userId, role }` construction in apps still compiles;
  `sameTenant` denies cross-tenant access when a tenant is absent (superadmin is
  exempt). Resource-scoped policies are expected to be re-checked in handlers
  once the row is loaded (mirrors the existing `item` pattern).

## Audit
- New domain tables are added to `drizzle/audit-trigger.sql` (one `record_audit`
  trigger per table) so all tenant/coachplan/grading/chat/notification changes are
  attributable. The trigger SQL is applied manually after push/migrate (not run by
  this agent — a live dev DB must not be disrupted).
