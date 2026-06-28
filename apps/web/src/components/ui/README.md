# Incluvo UI kit & foundation

The shared design system for Incluvo: calm, spacious, WCAG-AA, built for pupils
aged 8–20. Feature pages should build on these primitives rather than hand-rolling
styles, so the accessibility settings (contrast / font-size / density / motion)
keep working everywhere.

## Theming & design tokens

All visual values are **CSS variables** defined in `src/app.css` on `:root`.
`tailwind.config.ts` maps Tailwind utilities onto those variables, so you style
with normal Tailwind classes and everything stays themeable:

| Token group | Tailwind utilities | Examples |
| --- | --- | --- |
| Brand/neutral colours | `bg-*`, `text-*`, `border-*` | `bg-primary`, `text-ink`, `border-line`, `bg-bg-2`, `text-muted` |
| Status colours | same | `bg-success-100 text-success`, `text-danger`, `bg-accent-100` |
| Radii | `rounded-*` | `rounded-2`, `rounded-3`, `rounded-pill` |
| Type scale | `text-*` | `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-small`, `text-micro` |
| Fonts | `font-*` | `font-head` (display), `font-body` |
| Shadows | `shadow-*` | `shadow-1`, `shadow-2`, `shadow-3` |
| Density padding | `px-ctl-x py-ctl-y` | density-aware control padding |
| Motion | `duration-*`, `animate-*` | `duration-fast`, `animate-scale-in`, `animate-fade-in` |

Colours are stored as `R G B` triplets, so alpha works: `bg-ink/40`, `bg-primary/20`.

Use `cn()` (`src/lib/cn.ts`, clsx + tailwind-merge) to compose classes:

```tsx
import { cn } from "../lib/cn";
class={cn("rounded-2 p-4", isActive && "bg-primary text-primary-fg")}
```

Fonts: the token stack requests `Bricolage Grotesque` (headings) / `Inter` (body) /
`Atkinson Hyperlegible` (dyslexia mode) but **gracefully falls back to system-ui**.
Self-hosting the WOFF2 files is a follow-up so we don't depend on Google Fonts
(EU digital-sovereignty, backlog #2).

## Accessibility system

A single persisted store (`src/lib/a11y/store.ts`) is the source of truth. A
reactive effect mirrors every setting onto `<html data-*>`; `app.css` reads those
attributes and flips the relevant CSS variables, restyling the whole UI at runtime.

| Setting | `<html>` attribute | Effect |
| --- | --- | --- |
| Contrast | `data-contrast="normal\|high"` | high-contrast borders/text/surfaces (WCAG 1.4.11) |
| Font size | `data-size="s\|m\|l"` | scales root `font-size`; all rem sizing follows |
| Density | `data-density="compact\|cozy\|comfortable"` | control padding (`--density-*`) |
| Font family | `data-font="default\|dyslexic"` | dyslexia-friendly font |
| Reduce motion | `data-reduce-motion="true"` | kills animations/transitions (also honours OS pref) |
| Language | `<html lang>` | set for AT; AI translation is Epic 7 (stub) |

Read it reactively anywhere:

```tsx
import { a11y } from "../lib/a11y/store";
a11y.settings.contrast;            // read
a11y.set("contrast", "high");      // write (persisted)
a11y.reset();                       // back to defaults
```

The store is imported once in `__root.tsx` to start the effect; the
`<A11yPanel/>` (`src/components/a11y-panel.tsx`) is the user-facing control and is
already mounted in the topbar and the public header. **Read-aloud** and
**translation** are present as stubs (TODOs) for Epic 7 (AI-laag).

WCAG notes baked in: visible `:focus-visible` ring on every interactive element,
skip-to-content link in the shell, labelled controls, `prefers-reduced-motion`
support, and a high-contrast mode.

## App shell

- `src/components/shell/app-shell.tsx` — `<AppShell user nav crumbs>`
  sticky sidebar + topbar (breadcrumbs, search, notifications, a11y panel, user
  menu) with a mobile slide-in drawer. Rendered by `routes/_protected.tsx` for all
  authed routes.
- `src/components/shell/public-layout.tsx` — `<PublicLayout>` slim header (brand +
  a11y) for public pages (home, login).
- `src/components/shell/user-menu.tsx` — avatar dropdown with sign-out.

`NavItem` icons are `lucide-solid` components.

## Components

Import from the barrel: `import { Button, Card, toast } from "../components/ui";`

| Component | File | Notes |
| --- | --- | --- |
| `Button` | `button.tsx` | variants: primary/accent/ink/subtle/ghost/danger · sizes: sm/md/lg/icon. `buttonVariants` exported for cva reuse. Kobalte Button. |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription` | `card.tsx` | padding none/sm/md/lg · elevation flat/low/lift |
| `Badge` | `badge.tsx` | variants neutral/primary/accent/success/warning/danger/outline |
| `Input`, `Textarea` | `text-field.tsx` | Kobalte TextField — accessible label/description/error wiring + `validationState` |
| `Select` | `select.tsx` | Kobalte Select — keyboard typeahead, portal, `{ value, label }[]` options |
| `Dialog` | `dialog.tsx` | Kobalte Dialog — focus trap, Esc, scroll-lock; controlled (`open`/`onOpenChange`) or `trigger` |
| `Tabs` | `tabs.tsx` | Kobalte Tabs — `{ value, label, content }[]`, animated indicator |
| `Switch` | `switch.tsx` | Kobalte Switch — `role=switch` toggle |
| `SegmentedControl` | `segmented-control.tsx` | Kobalte ToggleGroup — single-select pill group |
| `Avatar` | `avatar.tsx` | image with initials fallback; tone leerling/coach |
| `Toaster`, `toast()` | `toast.tsx` | Kobalte Toast live-region. Mount `<Toaster/>` once (done in `__root.tsx`); call `toast({ title, description?, tone?, duration? })` from anywhere |

Most are built on **Kobalte** for keyboard/ARIA behaviour and styled with
`class-variance-authority` + the tokens above. Everything responds to the a11y
settings automatically because it uses the token utilities.
