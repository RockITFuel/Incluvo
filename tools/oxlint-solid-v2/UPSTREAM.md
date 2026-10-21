# Vendored oxlint-plugin-solidjs

- Package: `oxlint-plugin-solidjs`
- Version: `0.1.1`
- Registry: <https://www.npmjs.com/package/oxlint-plugin-solidjs/v/0.1.1>
- Tarball integrity: `sha512-d1rttwfdvquIhErLsWhumXElAmlBWITegVam2YJRzwoMaGeaJJggWpNunWYsH/C7W+W6sn3x4dQyqS+Yu7d7rg==`
- `upstream/index.js` SHA-256: `5a9fbffe244b8d220aeaf0facdfd51fd212e78fe7e31e34424bfb9a8251d8898`
- Declared license: MIT

`upstream/index.js` is the unmodified published `dist/index.js`. The package's
declared GitHub repository was unavailable when vendored, and the npm tarball
did not contain a license file. `LICENSE` records the declared MIT terms.

The sibling `index.js` is Project Alpha's Solid 2 compatibility entrypoint. It
exposes only reviewed upstream rules and adds rules for Solid 2 migrations.

## In Incluvo

Copied from project-alpha (`apps/web/vendor/oxlint-plugin-solidjs`,
`apps/web/vendor/tanstack-router-rule`, `scripts/oxlint/solid-untracked-read.mjs`)
for its Solid 2 rules. Changes: imports point at the sibling files, the
project-alpha rule set is not included, and `<Dynamic>` is not reported as
removed (it is deprecated but still exported in 2.0.0-rc.9).
