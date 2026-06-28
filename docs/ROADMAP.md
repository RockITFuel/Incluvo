# Incluvo — Build Roadmap

Maps every backlog item (`docs/backlog/BACKLOG.md`) to an epic and a build order.
We are the orchestrator; each epic/feature is built by a dedicated subagent on top of a
shared foundation. Open product questions are tracked in `docs/QUESTIONS-FOR-MARK.md`
(we proceed on a documented werkaanname rather than blocking).

Legend: **MVP** = needed for first live version · **Post** = post-MVP/"Wens".

## Epic 0 — Foundation (no backlog #, enables everything)
- **0A Data model & permissions** — Drizzle schema for tenants/schools, users+roles+membership,
  coachplan forms, courses, tasks, chat, notifications, audit; extend `@incluvo/permissions`
  with real roles (superadmin, keyuser, coach, leerling, ontwikkelaar) + tenant scoping. → backlog #3 (notif infra), multi-tenant from #8–#10/#23/#60.
- **0B Design system, app shell & accessibility** — port the demo's calm visual language to
  Tailwind theme + Solid layout (sidebar/topbar), the a11y panel (contrast/font/density),
  base UI components. → backlog **#1 (WCAG AA)**, #4 (landingspagina shell).
- **0C Hosting/sovereignty** — keep stack EU/NL-hostable (Bun, Postgres, SolidJS, self-hostable AI). → **#2**.

## Epic 1 — Auth, rollen & multi-tenant  (MVP)  → #2, roles
Tenants, memberships, role-gated routes, school/Ondivera separation. Builds on 0A.

## Epic 2 — Coachplan  (MVP, the core flow)  → #8–#21 (+ #22 Post)
Formulierenmanager (templates, kopiëren naar klant), wizard voor leerling (autosave, "bespreken
met coach", "overslaan", overzicht/bewerken), coach-vragenlijst + mapping (#16), leervoorkeur-labels
(#19), PDF (#20), "afgestemd met ouders" (#21). Transcriptie (#18) + AI-assistent (#22) → Epic 7.

## Epic 3 — Takenlijst  (MVP)  → #37–#41
Vandaag/toekomst, extra taken voor vandaag, afvinken, toevoegen (coach+leerling), tijdelijk uitzetten.
Taken voeden uit cursusopdrachten (Epic 4) en handmatig.

## Epic 4 — Online cursus  (MVP core, some Post)  → #23–#36, #61
3 cursustypen + overerving (#23), secties (#25), content-blokken CbS: opdracht (#27), pagina/WYSIWYG (#29),
bestanden (#30), youtube (#31), forum/groepschat (#32). Voortgangsbalk (#24), beoordelen (#28),
aanbevolen content o.b.v. leervoorkeuren (#35/#36). Post: LTI (#33), Ondivera-contentadvies (#34), eigen opdracht (#61).

## Epic 5 — Chat  (MVP)  → #5, #6 (+ #7 Post)
1:1 coach–leerling, groepschat/forum binnen cursus met coach-supervisie (#6). Coachtaak vanuit chat (#7) = Post.

## Epic 6 — Dashboard coach  (MVP)  → #42–#44
Dashboard (overzicht leerlingen, status, activiteit, aandacht), quickpanel, volledig profiel.

## Epic 7 — AI-laag  (mix)  → #18 (MVP-ish), #22 (Post), #1 vertaling (TBD)
Transcriptie → conceptantwoorden coachplan (#18), AI-assistent/advies (#22, Post), AI-vertaling (#1).
Stack keuze: zie `docs/research/ai-layer.md`. EU-data is harde eis (#2/#4.4).

## Epic 8 — Notificaties  (MVP, thin)  → #3
In-app notificaties (verzenden/ontvangen coachplan, taken vandaag, nieuwe taken, activiteit). E-mail/push = TBD.

## Epic 9 — Admin omgeving  (MVP-ish)  → #60
Beheer voor school (keyuser) en Ondivera (superadmin): gebruikers/klanten, formulier- en cursustemplates,
rechten, bewaartermijnen, audit-inzage.

---

### Build order
0A+0B (parallel) → 1 → (2, 3, 5, 8 parallel) → 4 → 6 → 9 → 7. AI research + content-stack research run up front.

### Acceptance tracking
Each item's `Acceptatiecriteria` from the backlog becomes a checkable item in the epic's PR description / a
`docs/acceptance/epic-N.md` checklist. "Definition of done" per item = criteria met + WCAG AA + role-gated + audited.
