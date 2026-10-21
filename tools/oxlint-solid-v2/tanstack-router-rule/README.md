# TanStack Router route-property-order Oxlint port

This local JavaScript rule is adapted from TanStack Router's
`@tanstack/router/create-route-property-order` ESLint rule at commit
`ac223be01377f09fa8fd70ff52c9ba4b5dbcddfc`.

It is loaded only through `apps/web/.oxlintrc.json`. The implementation retains
the upstream inference-sensitive property groups and autofix behavior while
tracking aliases imported from any `@tanstack/*-router` package.

Upstream source:
https://github.com/TanStack/router/tree/ac223be01377f09fa8fd70ff52c9ba4b5dbcddfc/packages/eslint-plugin-router/src/rules/create-route-property-order
