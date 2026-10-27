# Web app on Solid 2

`apps/web` runs on Solid 2 (release candidate) with TanStack Router 2, as a
plain client-rendered SPA. The architecture follows project-alpha, which runs
the same stack in production. This file is the rulebook for writing code in it.

## Stack and versions

Every Solid 2 package is pinned exactly; release candidates change between
versions and the libraries pin each other. Upgrade them together, never one.

| Package | Version | Note |
|---|---|---|
| `solid-js`, `@solidjs/web` | 2.0.0-rc.9 | root `overrides` keeps one copy |
| `@solidjs/signals`, `@solidjs/compiler`, `@solidjs/babel-plugin` | 2.0.0-rc.9 | root `overrides`: released together with `solid-js` rc.9 |
| `@tanstack/solid-router` | 2.0.0-rc.8 | file routes via `@tanstack/router-plugin` |
| `@kobalte/core` | 2.0.0-alpha.2 | patched, see `patches/` |
| `@solidjs/vite-plugin` | 3.0.0-next.44 | needs Vite 8 |
| `@solid-primitives/storage` | 5.0.0-next.4 | a11y settings |
| `lucide` | 1.49.0 | vanilla geometry, drawn by `lib/icons.tsx` |

`solid-js` and `@solidjs/vite-plugin` ask for `^2.0.0-rc.9` of signals and the
compiler, which on a fresh install resolves to the newest RC. Those don't fit:
signals rc.10+ dropped `DEV.setConsoleFooter` (dev build throws on load, a
blank page), and compiler rc.10+ rejects the plugin's dev-only
`componentNames` option. Production builds hid both. So they are pinned to the
rc.9 set in `overrides`; bump them together with `solid-js`.

`patches/` holds upstream fixes (from project-alpha), applied by Bun's
`patchedDependencies`. Each patch explains itself in a comment.

No TanStack Start, no SSR, no prerender: `index.html` loads
`src/entry-spa.tsx`, and `serve.ts` serves `dist/` with an `index.html`
fallback. So there is no hydration, and `beforeLoad` always runs in the browser.

## Data: route loaders, not a query cache

- **A page's data comes from its route `loader`.** The loader wraps each
  request in `loadRouteData(signal, (s) => client.x.y(input, { signal: s }))`,
  which returns `RouteData<T>`: `granted` with the value, `denied`, or `error`.
  It retries transient failures and never throws for a failed request, except a
  lost session (redirect to /login) and an abort.
- The page reads `Route.useLoaderData()` (an accessor) and renders each result
  with `<RouteDataView data={...} what="de taken" onRetry={...}>`.
- Loader input from the URL: search params with `validateSearch` +
  `loaderDeps`. Path params come in as `params`.
- Option order on a route: `validateSearch`, `loaderDeps`, `beforeLoad`,
  `loader`, `component`.
- **Writes are plain oRPC calls** (`client.tasks.add(input)`), usually wrapped
  in `createAction` (lib/action.ts) for `pending()` and an error toast, then
  `await refresh(router, "tasks")`.
- **`refresh(router, ...entities)`** (lib/refresh.ts) reloads only the
  loaders that read those entities. When a loader starts reading an entity,
  add its route id to `AFFECTS` there.
- **SSE events** refresh too: `useServerEvent("task.changed", () => void refresh(router, "tasks"))`.
- **Component-local data** (a dialog that loads options when it opens):
  `createLoad(source, fetcher)` from lib/load.ts. Not for page data.
- Sign in/out and role switch drop everything: `clearMe()` +
  `router.clearCache()` (lib/auth/sign-out.ts, routes/_protected.tsx).

## Identity and roles

- `routes/_protected.tsx` `beforeLoad` loads `account.me` (cached 30 s,
  lib/auth/me.ts) into the route context. Its loader loads the shell's own data
  (menu badges, recent notifications).
- In components: `useMe()` (lib/auth/use-me.ts), never "still loading".
- In loaders: `context.me`.
- Role gates are route `beforeLoad`s:
  `beforeLoad: ({ context }) => requireRole(context.me, { min: "coach", coaching: true })`.
  There is no render-time gate component any more.

## Solid 2 rules

The cheatsheet that ships with the package is the reference:
`node_modules/solid-js/CHEATSHEET.md`. The rules this codebase relies on:

- Imports: `solid-js` (stores too), `@solidjs/web` (`render`, `Dynamic`,
  `Portal`, and the `JSX` type). Icons from `lib/icons.tsx`.
- `createEffect(compute, apply)`: two functions. `compute` tracks, `apply`
  does the side effect and may return a cleanup. No `on()`; the compute
  function names the dependencies. `{ defer: true }` skips the first run.
- **Don't write signals in an effect to derive state.** Use `createMemo`, or a
  writable memo: `const [page, setPage] = createSignal(() => (filter(), 1))`
  resets to 1 whenever `filter()` changes and can still be set by hand.
- Seeding a form from props: a writable memo
  (`createSignal(() => props.task.title)`), or copy the values in the handler
  that opens the dialog.
- Writing a signal inside an owned scope (component body, memo, effect
  compute) throws. Write from event handlers, `onSettled`, or after an `await`.
- `onSettled(() => { ...; return cleanup })` replaces `onMount` + `onCleanup`.
  It must not be `async`: start the async work inside it.
- Writes show up after a microtask (`flush()` forces it). A handler that reads
  its own write right away keeps a plain variable alongside.
- Stores: draft setters, `setStore((s) => { s.a.b = v })`. No path setters.
  `snapshot()` replaces `unwrap()`. `reconcile(next, "id")(s.list)` inside a
  draft setter.
- `<For each>` passes the item and an index accessor; `<For keyed={false}>`
  (replaces `<Index>`) passes an item accessor and a number. Read accessors in
  JSX, not at the top of the callback.
- `<Show when={x()}>{(v) => ...v()...}</Show>`: the child gets an accessor.
- `omit(props, "a", "b")` replaces `splitProps`; `lib/solid-props.ts` keeps a
  `splitProps` with the old shape for wrappers. `merge` replaces `mergeProps`
  (`undefined` overrides there).
- `class={["base", props.class, { active: on() }]}` replaces `classList`.
- Attributes are lowercase (`maxlength`, `tabindex`); `aria-*` values are
  strings (`aria-pressed={on() ? "true" : "false"}`).
- Event handler bindings are not reactive: put the condition inside the handler.
- Context: `<Ctx value={...}>` is the provider.
- `<Loading>` replaces `<Suspense>`, `<Errored>` replaces `<ErrorBoundary>`.

## UI primitives

`components/ui` wraps Kobalte 2. Pages import the wrappers, not
`@kobalte/core`. Known Kobalte 2 alpha issues (from project-alpha): Escape
does not close overlays through `@solid-primitives/keyboard`, so dialogs and
menus handle Escape themselves; the select and collection fixes are in the
patch.
