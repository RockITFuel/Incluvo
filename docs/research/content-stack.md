# Incluvo Content Stack Research

Research date: 2026-06-06. Stack context: Bun monorepo, SolidJS + TanStack Solid
Router/Query, oRPC + `Bun.serve` backend, Drizzle/Postgres, better-auth, Zod,
Tailwind v3, Kobalte/Ark UI.

All versions and APIs below were verified against official sources (npm registry,
the library's own docs/GitHub) on the research date — not from memory. URLs are
cited per section.

---

## 1. Dynamic form builder / wizard (formulierenmanager)

### Library: `@modular-forms/solid`

- Latest version: **0.25.1** — https://www.npmjs.com/package/@modular-forms/solid
- Docs: https://modularforms.dev/solid
- Solid compat: **First-class, Solid-native.** Peer dep `solid-js ^1.3.1`. This is
  the de-facto form library for SolidJS (built by Fabian Hiller, the author of
  Valibot). Uses Solid stores/signals, no virtual DOM shim.
- Validation: Supports **both Valibot and Zod** via official adapters
  (`valiForm`, `zodForm`). Valibot is the lighter recommendation (~700 bytes), but
  since Incluvo already standardizes on **Zod**, use `zodForm` to share one schema
  language across oRPC contracts and forms.
  Cite: https://modularforms.dev/solid/guides/validate-your-fields
- Validation timing is configurable via `validateOn` / `revalidateOn` (e.g.
  `'blur'`, `'input'`, `'submit'`) — important for a low-friction autosaving wizard.

> Note on version `0.x`: Modular Forms is at 0.25.1 and has been API-stable for a
> long time; the 0.x is the author's versioning convention, not an alpha warning.
> It is widely used in production.

### Architecture recommendation

The "formulierenmanager" has two distinct concerns. **Do not try to make
`@modular-forms/solid` drive the builder dynamically** — it is designed for
statically-typed forms known at compile time. Instead split into:

**A. The renderer (student wizard) — JSON-schema-driven, NOT static modular-forms**

Store each form template as a **JSON document** (a Drizzle/Postgres `jsonb`
column) describing an ordered list of questions:

```ts
// shared Zod schema for a stored form template (also the oRPC contract type)
const QuestionType = z.enum(['text', 'choice', 'scale', 'file', 'info']);

const Question = z.object({
  id: z.string().uuid(),
  type: QuestionType,
  label: z.string(),
  required: z.boolean().default(false),
  // per-type config
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(), // choice
  scale: z.object({ min: z.number(), max: z.number(), step: z.number() }).optional(),
  accept: z.string().optional(), // file mime filter
  // cross-cutting flags from the backlog
  discussWithCoach: z.boolean().default(false),
  skippable: z.boolean().default(false),
  // conditional logic
  visibleWhen: z.object({ questionId: z.string(), equals: z.unknown() }).optional(),
  // mapping onto the coach form
  mapsToCoachField: z.string().optional(),
});

const FormTemplate = z.object({
  id: z.string().uuid(),
  title: z.string(),
  version: z.number().int(),
  questions: z.array(Question),
});
```

Render this with a `<For>` over `questions`, a `<Switch>/<Match>` on `type`, and a
per-question component registry. Conditional logic (`visibleWhen`) is a derived
signal off the current answers store — Solid's fine-grained reactivity makes
show/hide essentially free.

You can still wrap the whole wizard in a single `@modular-forms/solid` form whose
field set is the union of all possible question ids, validated by a Zod schema you
**generate at runtime from the template** (build a `z.object` from the questions).
This gives you autosave + validation + dirty-tracking without hand-rolling state.

**B. Autosave**: debounce a Solid `createEffect` on the form values and push to an
oRPC `saveDraft` mutation (TanStack Query mutation with optimistic state). Persist
partial answers as `jsonb` keyed by question id so the schema can evolve.

**C. The builder (superadmin/keyuser)**: this is itself just another form/editor UI
that produces the `FormTemplate` JSON above — a list editor with add/remove/reorder
(reuse the DnD lib from section 5) and a per-question-type config panel. Version
templates (`version` field) so in-flight student submissions aren't broken by edits.

**D. Coach-form mapping**: the `mapsToCoachField` per question is a pure data
transform applied server-side when generating the coach view/coachplan — keep the
mapping declarative in the template, not in code.

---

## 2. Rich text / WYSIWYG editor (course "pagina" content)

### Library: `solid-tiptap` + `@tiptap/*` v3

- `solid-tiptap` latest: **0.8.0** — https://www.npmjs.com/package/solid-tiptap
  - Peer deps: `solid-js ^1.7`, `@tiptap/core ^3` (so it explicitly targets Tiptap v3).
  - Repo: https://github.com/LXSMNSYC/solid-tiptap
- `@tiptap/core` latest: **3.26.0** — https://www.npmjs.com/package/@tiptap/core
- `@tiptap/extension-youtube` latest: **3.26.0** (official YouTube embed extension)
- Docs: https://tiptap.dev/docs

### Solid compat note (honest assessment)

`solid-tiptap` is a **thin binding** (`createTiptapEditor`, `createEditorTransaction`,
plus helpers like `useEditorHTML`, `useEditorIsActive`). It wraps the
framework-agnostic Tiptap/ProseMirror core, which does all the heavy lifting in
plain DOM — so it is robust. **Caveat:** `solid-tiptap` is a small,
single-maintainer community library (not maintained by the Tiptap team). The risk
is low because the real engine is `@tiptap/core`; the Solid layer is small enough to
fork/vendor if it ever lags a Tiptap major. There is an alternative,
`tiptap-solid` (vrite/andi23rosca forks), which additionally supports **Solid
component node views** — worth evaluating if you want custom blocks rendered as
Solid components rather than imperative DOM.

### Custom block nodes (assignment, file, youtube, forum)

Custom blocks are **Tiptap Node extensions** (`Node.create`), independent of the
Solid binding. The pattern (docs:
https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node and
https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views):

```ts
import { Node, mergeAttributes } from '@tiptap/core';

export const AssignmentBlock = Node.create({
  name: 'assignmentBlock',
  group: 'block',
  atom: true,          // single, indivisible unit (no editable children)
  selectable: true,
  draggable: true,

  addAttributes() {
    return { assignmentId: { default: null } };
  },

  // how it is recognized when pasting/loading stored HTML
  parseHTML() {
    return [{ tag: 'div[data-assignment-id]' }];
  },

  // how it is serialized to the HTML you persist in Postgres
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'assignment' })];
  },

  // interactive in-editor rendering (imperative DOM for solid-tiptap)
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.dataset.assignmentId = node.attrs.assignmentId;
      // ...mount preview UI...
      return { dom };
    };
  },
});
```

- `youtube` block: use the official `@tiptap/extension-youtube` (don't hand-roll;
  it handles URL parsing + safe iframe). See section 5 for the embed safety note.
- `assignment` / `file` / `forum`: custom atom nodes as above, each storing a
  reference id (`assignmentId`, `fileKey`, `forumThreadId`) — never the content
  itself. Render real data at view-time from oRPC.
- Persist `editor.getJSON()` (ProseMirror JSON) in Postgres rather than HTML — it is
  the safer, lossless source of truth and avoids HTML-sanitization pitfalls. Render
  to HTML for display via Tiptap's static renderer
  (https://tiptap.dev/docs/editor/api/utilities/static-renderer) or a read-only
  editor instance.

---

## 3. Server-side PDF generation (coachplan, backlog #20)

Constraint: runs in the Bun/oRPC backend; templated documents with **Dutch text**
(diacritics like ë, ï, accented names) — font/Unicode handling matters.

### Options compared (all checked for Bun viability)

| Option | Bun-safe? | Templating | Dutch/Unicode | Verdict |
|---|---|---|---|---|
| **Headless Chromium (Playwright)** | Yes (binary, not Bun-internal) | Excellent — HTML+CSS, reuse Tailwind | Perfect (full browser text engine) | **Recommended** |
| `pdf-lib` 1.17.1 | Yes (pure JS) | Manual coordinate drawing | OK but needs custom font embed; no layout engine | Good for stamping/merging only |
| `@react-pdf/renderer` 4.5.1 | "Works but unofficial" | React-component layout | OK with embedded fonts | React-only — wrong framework |
| Typst | Yes (CLI binary) | Excellent, great typography | Excellent | Strong, but new templating language to learn |

### Recommendation: HTML → PDF via headless Chromium (Playwright)

- `playwright` latest: **1.60.0** — https://www.npmjs.com/package/playwright
- Why: you can build the coachplan as a normal Solid/HTML + Tailwind template,
  render it to a string server-side, load it in a headless page, and `page.pdf()`.
  Full CSS layout, web fonts, page breaks (`@page`), headers/footers, and flawless
  Dutch text rendering. Maximizes reuse of existing styling.

```ts
import { chromium } from 'playwright';

export async function renderCoachplanPdf(html: string): Promise<Uint8Array> {
  const browser = await chromium.launch();          // run once + reuse in prod
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
  });
  await browser.close();
  return pdf;
}
```

Operational notes:
- Reuse a single long-lived `browser` instance (launching per request is slow);
  `newPage()` per request.
- In Docker you must install Chromium + its system deps (or use the official
  `mcr.microsoft.com/playwright` base image). This is the main cost vs pure-JS libs.
- `@react-pdf/renderer` is explicitly **not recommended** here: it is React-only and
  this is a Solid project; using it would pull in React purely for PDF.
- Keep `pdf-lib` (1.17.1, https://www.npmjs.com/package/pdf-lib) in your back pocket
  for post-processing (merge cover page, stamp watermark/signature) — note it was
  last published 2021, but it's stable and pure-JS, so it runs fine on Bun.
- **Typst** is a credible alternative if PDF volume is high and you want to avoid
  shipping a browser; it produces beautiful typography and handles Dutch perfectly,
  at the cost of authoring templates in Typst's markup. Reasonable future migration.

---

## 4. File uploads + object storage (backlog #27/#30)

### Key finding: **Bun has a native, built-in S3 client — no AWS SDK needed.**

- Docs: https://bun.com/docs/api/s3
- `Bun.S3Client` / `Bun.s3` works with any S3-compatible store: **MinIO**
  (self-host / EU), AWS S3, Cloudflare R2, DigitalOcean Spaces, Supabase Storage.
- It supports **synchronous presigned URL generation** (`.presign()`, no network
  round-trip), multipart uploads for large files, streaming, `stat`, `list`,
  `exists`, `delete`. This is the fastest and lowest-dependency path on Bun.

```ts
import { S3Client } from 'bun';

const s3 = new S3Client({
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  bucket: 'incluvo-uploads',
  endpoint: 'http://minio:9000', // MinIO self-host (EU). Omit for AWS.
});

// oRPC procedure: hand the browser a presigned PUT URL (direct-to-store upload)
export async function createUploadUrl(input: { key: string; contentType: string }) {
  const url = s3.presign(input.key, {
    method: 'PUT',
    expiresIn: 60 * 5,            // 5 min
    type: input.contentType,
  });
  return { url };
}
```

### Recommended architecture (presigned direct upload)

1. Client requests an upload slot from an oRPC procedure, sending intended filename,
   **size**, and **content-type**.
2. **Validate server-side before issuing the URL**: enforce an allow-list of MIME
   types (PDF/PPT/PPTX/DOC/DOCX/images) and a max size. Generate a namespaced,
   non-guessable key (e.g. `courses/{courseId}/{uuid}-{safeName}`). Persist a
   pending file row (Drizzle) with owner, key, declared size/type.
3. Client `PUT`s the file directly to MinIO/S3 using the presigned URL — bytes never
   transit your Bun server (saves memory/bandwidth; Bun docs explicitly recommend
   this pattern).
4. Client confirms completion → server `s3.stat(key)` to verify the **actual** size
   and content-type match what was declared (don't trust the client); mark the file
   row active. Reject/garbage-collect mismatches.
5. For downloads, issue short-lived presigned `GET` URLs (private bucket) or, for
   simple cases, return an `S3File` as a `Response` body to 302-redirect to a
   presigned URL (Bun built-in).

### Validation specifics
- **Type**: validate by declared MIME at slot time AND verify via `s3.stat()` after
  upload. For stronger guarantees, also magic-byte sniff on first read.
- **Size**: enforce max in step 2 and re-check via `stat` in step 4 (presigned PUT
  itself can't hard-cap size on plain S3; MinIO/S3 bucket policies or a size check
  post-upload close the gap).
- Keep the bucket **private**; never use `public-read` ACLs for student submissions.

### If you ever need the AWS SDK instead (e.g. advanced policy/conditions)
- `@aws-sdk/client-s3` **3.1063.0** + `@aws-sdk/s3-request-presigner` **3.1063.0**
  (https://www.npmjs.com/package/@aws-sdk/client-s3). But for this stack, **prefer
  the native `Bun.S3Client`** — fewer deps, faster, presigning built in.

---

## 5. YouTube embed + drag-and-drop ordering (backlog #25/#26/#31)

### Drag-and-drop: `@thisbeyond/solid-dnd`

- Latest version: **0.7.5** — https://www.npmjs.com/package/@thisbeyond/solid-dnd
- Repo/docs: https://github.com/thisbeyond/solid-dnd · https://solid-dnd.com
- Peer dep: `solid-js ^1.5`. Zero dependencies; uses CSS transforms, no re-render.
- **Honest maintenance note:** last npm publish was **Nov 2023** (~2.5 years ago).
  It is effectively in **maintenance/low-activity mode** — there are open 2025
  issues but no recent releases. It still works with current Solid 1.x and is the
  only mature, purpose-built Solid DnD toolkit (it's the Solid analog of dnd-kit).
  **Recommendation:** use it for section/content reordering (sortable lists), but
  pin the version and budget for vendoring/forking if a Solid major breaks it. For a
  simple ordered list, a lightweight HTML5 `draggable` + a small custom handler is a
  viable fallback that avoids the dependency entirely.

```tsx
import { DragDropProvider, DragDropSensors, SortableProvider, createSortable } from '@thisbeyond/solid-dnd';

const Item = (props: { id: string }) => {
  const sortable = createSortable(props.id);
  return <div use:sortable classList={{ 'opacity-50': sortable.isActiveDraggable }}>{props.id}</div>;
};

// wrap a <For> of items in <DragDropProvider><DragDropSensors><SortableProvider ids={ids}>
// onDragEnd: reorder ids, persist new order via oRPC.
```

Persist order as an explicit integer `sortIndex` (or fractional ranking) column per
section/content row so reordering is a cheap server update.

### YouTube embed (safe approach)

- In the rich-text editor: use the official **`@tiptap/extension-youtube` 3.26.0**
  (https://tiptap.dev/docs) — it parses the URL and renders a sandboxed `iframe`,
  so you don't construct embed markup by hand.
- Outside the editor (e.g. a course video block): embed via
  `https://www.youtube-nocookie.com/embed/{videoId}` in an `<iframe>` with
  `loading="lazy"`, an explicit `allow` (`accelerometer; encrypted-media;
  picture-in-picture`) and `referrerpolicy="strict-origin-when-cross-origin"`.
  **Extract and validate the `videoId` server-side** (regex to a known 11-char id)
  rather than storing/echoing a raw user-supplied URL — this prevents injection of
  arbitrary iframe `src`. The `-nocookie` domain is the privacy-friendly choice for
  an EU education context.

---

## 6. LTI 1.3 (backlog #33 — "Wens" / future scope)

Brief, since it's a nice-to-have.

Implementing an **LTI 1.3 tool** (Incluvo as the *tool*, an external LMS like Moodle/
Canvas/Brightspace as the *platform/consumer*) entails:

- **OIDC third-party-initiated login** + **OAuth2 / JWT** message flow. Launches are
  signed JWTs (id_token) you must validate against the platform's published **JWKS**.
- Implementing the relevant **LTI Advantage services**: Names and Role Provisioning
  Services (roster), Assignment and Grade Services (pass grades back), Deep Linking
  (content selection). Each is a separate OAuth2-scoped REST API.
- A **registration/handshake** with each platform (client id, deployment id,
  auth/token/jwks endpoints) stored per-tenant.

Maintained Node libraries:
- **`ltijs`** — latest **5.9.9** (https://www.npmjs.com/package/ltijs). The most
  established Node LTI 1.3 tool framework ("Easily turn your web application into a
  LTI 1.3 Learning Tool"). It is Express-oriented and brings its own server/DB
  assumptions, so on a Bun/oRPC stack it would need an adapter or to run as a small
  isolated Express-on-Bun service rather than being embedded directly in oRPC.
- Note the certified spec lives at https://www.imsglobal.org/spec/lti/v1p3/ (1EdTech).

**Recommendation for now:** defer. When picked up, prototype with `ltijs` in a
standalone service and integrate via internal API, rather than reimplementing the
JWT/JWKS/grade-service plumbing by hand.

---

## Consolidated recommended dependencies

Frontend (SolidJS):
- `@modular-forms/solid@0.25.1` — form state/validation (use `zodForm`)
- `zod` (already in stack) — shared schemas for templates + oRPC contracts
- `solid-tiptap@0.8.0` — Solid binding for the editor
- `@tiptap/core@3.26.0` — editor engine (+ `@tiptap/starter-kit@3.26.0`)
- `@tiptap/extension-youtube@3.26.0` — official YouTube block
- `@thisbeyond/solid-dnd@0.7.5` — drag-and-drop reordering (maintenance-mode; pin)

Backend (Bun / oRPC):
- `Bun.S3Client` — **built in**, no dependency; file storage + presigned uploads
  (MinIO/S3-compatible)
- `playwright@1.60.0` — HTML→PDF coachplan generation (headless Chromium)
- `pdf-lib@1.17.1` — optional PDF post-processing (merge/stamp), pure-JS
- *(optional)* `@aws-sdk/client-s3@3.1063.0` + `@aws-sdk/s3-request-presigner@3.1063.0`
  — only if you outgrow `Bun.S3Client`

Future scope:
- `ltijs@5.9.9` — LTI 1.3 tool (backlog #33, run as isolated service)

### Compatibility risk summary
- `@thisbeyond/solid-dnd` — last release Nov 2023; works today but low maintenance.
  Pin and be ready to vendor.
- `solid-tiptap` — small single-maintainer binding over a robust core; low risk,
  but consider `tiptap-solid` if you want Solid-component node views.
- `@modular-forms/solid` — 0.x but production-stable; not meant to drive a *dynamic*
  builder, hence the JSON-schema renderer split.
- `playwright` — requires shipping a Chromium binary + system deps in Docker (the
  main operational cost; Typst is the binary-light alternative).
- `@react-pdf/renderer` — rejected: React-only, wrong framework for this Solid stack.
