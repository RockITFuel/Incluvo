# Incluvo

Toegankelijke (WCAG AA), in Nederland/EU gehoste coaching- en leerplatform.

This repository is a **Turborepo skeleton** whose architecture mirrors the `clp`
stack: an oRPC backend with OpenAPI docs, better-auth, Drizzle/PostgreSQL,
role-based access control, audit logging, and realtime updates over SSE, with a
SolidStart (Solid + TanStack Router) frontend. Everything runs on **Bun**.

## Stack

| Concern        | Choice                                                            |
| -------------- | ---------------------------------------------------------------- |
| Monorepo       | Turborepo + Bun workspaces (with catalog)                        |
| Language       | TypeScript (strict), shared `tsconfig.base.json`                 |
| Lint / format  | oxlint + oxfmt                                                    |
| Backend        | oRPC on `Bun.serve()` — RPC at `/rpc`, REST + Scalar at `/api`   |
| API docs       | OpenAPI 3.1 via `@orpc/openapi`, Scalar UI at `/api/docs`        |
| Auth           | better-auth (email/password + bearer), Drizzle adapter           |
| Database       | PostgreSQL + Drizzle ORM                                          |
| AuthZ          | `@incluvo/permissions` — RBAC policies, server + UI guards       |
| Audit          | Postgres trigger + per-request `app.actor_id` connection pinning |
| Realtime       | Server-Sent Events at `/sse/events`                              |
| Validation     | Zod                                                              |
| Env            | `@t3-oss/env-core` (lazy, validated)                             |
| Frontend       | Solid + TanStack Start (SPA) + TanStack Query + Tailwind         |

## Layout

```
apps/
  server/        oRPC backend (Bun.serve): auth, RPC, OpenAPI, SSE
  web/           SolidStart SPA (file-based routes, oRPC client)
packages/
  drizzle/       DB client, schema, audit trigger, seed
  permissions/   RBAC roles + policies (shared by server & web)
```

The end-to-end **vertical slice** to copy from is the generic `item` entity:
`packages/drizzle/src/schema/items.ts` → `apps/server/src/procedures/items.ts`
→ `apps/web/src/routes/_protected/items.tsx`. Rename it to a real Incluvo
domain (coachplannen, cursussen, taken …).

## Getting started

```sh
# 1. Install
bun install

# 2. Configure env (a dev .env with a generated secret may already exist)
cp .env.example .env   # then edit if needed

# 3. Start infrastructure (Postgres on :5435, Mailpit on :8025)
docker compose up -d

# 4. Create the schema, the audit trigger, and seed data
bun run db:push
psql "$DATABASE_URL" -f packages/drizzle/drizzle/audit-trigger.sql
bun run db:seed

# 5. Run everything (server :3210, web :3200)
bun run dev
```

Then open:

- Web app — http://localhost:3200
- API docs (Scalar) — http://localhost:3210/api/docs
- Mailpit (dev email) — http://localhost:8025

> Ports (3200/3210, Postgres 5435) are deliberately offset from `clp` so both
> repos can run side by side.

## Scripts

| Command               | Description                                  |
| --------------------- | -------------------------------------------- |
| `bun run dev`         | Run all apps via Turbo                       |
| `bun run dev:server`  | Backend only                                 |
| `bun run dev:web`     | Frontend only                                |
| `bun run build`       | Build all apps                               |
| `bun run check-types` | Typecheck every package                      |
| `bun run lint`        | oxlint                                        |
| `bun run format`      | oxfmt --write                                |
| `bun run db:push`     | Push Drizzle schema to the database          |
| `bun run db:generate` | Generate a SQL migration                     |
| `bun run db:migrate`  | Apply migrations                             |
| `bun run db:studio`   | Drizzle Studio                               |
| `bun run db:seed`     | Seed sample data                             |

## How the pieces connect

- **Typed client**: `apps/web/src/lib/orpc` imports the `Router` *type* from the
  server and calls procedures with full type-safety over `/rpc` (cookies
  included). TanStack Query utils: `orpc.items.list.queryOptions()`.
- **Auth**: better-auth is mounted at `/api/auth`; the Vite dev server proxies
  `/rpc`, `/api`, and `/sse` to the backend so the browser sees one origin.
- **AuthZ**: procedures compose `protectedProcedure` with `withPolicy(...)`;
  the same policies drive UI guards via `@incluvo/permissions/solid`.
- **Audit**: `requireAuth` pins a DB connection with `app.actor_id=user:<id>`;
  the Postgres trigger writes every change to `audit_log` attributed to that
  actor (writes outside a request are attributed to `system`).
- **Realtime**: mutating procedures `publish()` an event; the browser subscribes
  with `useServerEvent(...)` and invalidates queries.

## Static demo (prototype)

The original approved Claude Design prototype lives in `demo/`. Build/serve it
standalone:

```sh
docker build -t incluvo-demo .
docker run --rm -p 8080:80 incluvo-demo   # http://localhost:8080
```
