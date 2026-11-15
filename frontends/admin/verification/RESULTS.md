# Admin scaffold verification · 2026-11-07

All commands ran in `frontends/admin/`, except the Git checkpoint attempts at the worktree root.
Fixtures contain invented order metadata only. No lab files were read. No Playwright, push, `gh`,
or PR commands were used.

## Red → green checkpoints

| Command | Observed result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run --reporter=dot` (before implementation) | `Test Files 6 failed (6)`; missing auth, configuration, shell, pipeline, and stepper modules; security assertions also failed. |
| `node node_modules/vitest/vitest.mjs run tests/config.test.ts --reporter=dot` | `Test Files 1 passed (1)` / `Tests 3 passed (3)` |
| `npm test -- tests/auth.test.ts tests/security.test.ts tests/config.test.ts --reporter=dot` | `Test Files 3 passed (3)` / `Tests 11 passed (11)` |
| `npm test -- tests/shell.test.tsx tests/pipeline.test.tsx tests/stepper.test.tsx --reporter=dot` | `Test Files 3 passed (3)` / `Tests 10 passed (10)` |
| `npm test -- tests/sign-in.test.tsx --reporter=dot` (before form implementation) | `Test Files 1 failed (1)`; missing sign-in form module. |
| `npm test -- --reporter=dot` (after sign-in implementation) | `Test Files 8 passed (8)` / `Tests 27 passed (27)` |
| `npm test -- tests/choose-client.test.tsx --reporter=dot` | Before redirect fix: `Tests 2 failed \| 2 passed (4)`; after: `Tests 4 passed (4)`. |
| `npm test -- tests/server-client.test.ts --reporter=dot` | Node-runtime regression: `Tests 1 failed \| 4 passed (5)`; after runtime fix: `Tests 5 passed (5)`. |
| `npm test -- tests/action-redirect.test.ts tests/page-redirect.test.ts tests/choose-client.test.tsx --reporter=dot` | Before basePath fix: `Test Files 3 failed (3)`. The first retry passed the redirect assertions but one chooser render exceeded the original 5-second timeout under heavy host load. The suite now allows 30 seconds per test and uses two workers. |
| `npm test -- tests/middleware-routing.test.ts --reporter=dot` | Before adding the root matcher: `Tests 1 failed (1)`. The final full suite passes this test using Next's real matcher compiler. |

The TypeScript check initially reported two schema-generic mismatches in the auth helper and an
environment-input mismatch. Narrowing the helper to the auth interface and explicitly constructing
the environment input resolved all three; `npm run typecheck` then exited 0. `npm run lint` exited 0.

The first build failed because the offline font alias was resolved after Next's font loader.
Replacing the font module before resolution fixed that failure. `npm run build` then exited 0 and
generated `/`, `/[...path]`, `/choose-client`, `/orders/[code]`, `/pipeline`, and `/sign-in`, under the
configured `/admin` base path. The catch-all resolves every registered placeholder and rejects unknown
paths. A later build validates the Node middleware and redirect fixes.

## Environment limits

- Git branch switch and every checkpoint staging/commit attempt were denied with:

  ```text
  fatal: Unable to create '.../.git/worktrees/router-20261107-172722-183aaf/index.lock': Operation not permitted
  ```

  Work remains in the provided `router/20261107-172722-183aaf` worktree for Fabric to commit onto
  `admin/phase1`. No commit was created by this run.

- `npm start -- --hostname 127.0.0.1 --port 3107` could not bind a local port:

  ```text
  Error: listen EPERM: operation not permitted 127.0.0.1:3107
  ```

  Consequently HTTP sign-in and a rendered 390 px browser check could not run. Responsive rules and
  independent horizontal scroll containers are implemented, but that visual check remains necessary.

- Registry and Google Fonts DNS are unavailable. Dependencies were installed from authentic cached
  npm archives; the launcher reports and selects system fonts for offline builds. Online brand-font
  fetching remains unverified. Use `ADMIN_FONT_MODE=google` on a network-enabled machine.
- Next's automatic repair of missing non-macOS optional SWC lockfile entries also requires registry
  access. The local build passes with that warning. Follow the README's lockfile refresh step before
  verifying other platforms.
- Real Supabase credentials were not available or used. Auth behavior is tested with mocked SDK calls;
  real cookie refresh, password/TOTP sign-in, and independent suite-session sign-out need integration
  verification. Membership/order database adapters and phase-labelled workflows remain future work.

## Final checks

`npm test -- --reporter=dot` exited 0 on the final source:

```text
Test Files  13 passed (13)
     Tests  43 passed (43)
  Duration  26.91s
```

`npm run typecheck` exited 0:

```text
> @lipidomic-explorer/admin@0.1.0 typecheck
> tsc --noEmit
```

`npm run lint` exited 0:

```text
> @lipidomic-explorer/admin@0.1.0 lint
> eslint . --max-warnings=0
```

`npm run build` exited 0 on the final source, including the root matcher:

```text
[admin] Google Fonts unavailable or system mode selected; using system font fallbacks.
▲ Next.js 15.5.28
✓ Compiled successfully in 12.1s
  Linting and checking validity of types ...
  Collecting page data ...
✓ Generating static pages (3/3)
  Finalizing page optimization ...
  Collecting build traces ...

Route (app)             Size   First Load JS
ƒ /                    132 B   103 kB
○ /_not-found           132 B   103 kB
ƒ /[...path]            166 B   106 kB
ƒ /choose-client       132 B   103 kB
ƒ /orders/[code]       667 B   107 kB
ƒ /pipeline          1.82 kB   108 kB
ƒ /sign-in           1.11 kB   107 kB
```

The build also prints the registry/DNS warning about optional SWC lockfile repair described above.
That warning is not suppressed. The final build checks lint and types again after the final matcher
change. The generated middleware manifest declares the Node runtime and covers both `/admin` and its
pages. The generated HTML/CSS contain the explicit system-font class and variables. A scan of browser
JavaScript found no Admin auth-cookie name or Supabase credential-variable identifiers.

---

# Global all-clients overview · 2026-11-07 (second run, branch `router/20261107-192943-786fa9`)

All commands ran in `frontends/admin/`. Fixtures are invented; no lab files were read. No push, `gh`, or PR.
Design note: `docs/admin/global-overview-design.md`.

## Setup

`npm ci` refused the committed lockfile (`Missing: @next/swc-darwin-x64@15.5.28 from lock file`, plus the
other optional SWC/rollup/esbuild platform entries, as the README predicted). `npm install --include=optional`
repaired it; no dependency version changed (checked with `git diff package-lock.json`). Committed separately.

## Red → green, honestly

| Step | Observed |
| --- | --- |
| `tests/pipeline-filters.test.ts` written before `src/lib/pipeline-filters.ts` | The first run could not reach the assertions: `vitest` was missing because `npm ci` had failed. After the install the module was already written, so the suite went straight to `Tests 14 passed (14)`. The red state for this module is therefore a tooling failure, not an assertion failure. |
| `tests/demo-data.test.ts` + widened `demo.ts` | Written together; `Tests 16 passed (16)` with the filter tests. |
| Overview components + rewritten `tests/pipeline.test.tsx`, new `tests/pipeline-overview.test.tsx`, updated shell/chooser/action tests | First full run: `Test Files 2 failed \| 14 passed (16)`, `Tests 2 failed \| 70 passed (72)`. Both failures were ambiguous test queries (`/Sequence exported/` matched the checkbox and the kanban column; `/^Example Cedar/` matched the scope summary and its menu link). Queries narrowed; second run `Tests 72 passed (72)`. |

## Final checks (final source)

`npm test` exited 0:

```text
 Test Files  16 passed (16)
      Tests  72 passed (72)
   Duration  5.10s
```

`npm run typecheck` exited 0 (`tsc --noEmit`, no output). `npm run lint` exited 0 (`eslint . --max-warnings=0`, no output).

`npm run build` exited 0 (Google Fonts reachable this time, so the brand fonts were self-hosted):

```text
Route (app)                                 Size  First Load JS
┌ ƒ /                                      132 B         103 kB
├ ○ /_not-found                            132 B         103 kB
├ ƒ /[...path]                             165 B         106 kB
├ ƒ /choose-client                         132 B         103 kB
├ ƒ /orders/[code]                         663 B         107 kB
├ ƒ /pipeline                            5.14 kB         111 kB
└ ƒ /sign-in                             1.12 kB         107 kB
```

## Browser check

`next start -p 3107 -H 127.0.0.1` served the production build. Screenshots were taken with
`playwright-core` 1.58.2 installed in a temporary folder outside the repo, driving the Chromium headless
shell already cached in `~/Library/Caches/ms-playwright` (Playwright is not a dependency of this app).
The script measured `document.documentElement.scrollWidth` against `clientWidth` on every page: **no
horizontal page scroll at 390 px** (390 = 390) or at 1440 px. The interaction case clicked the
`Blocked at a gate` tile and the `Example Atlas` row in the real browser; the URL became
`/admin/pipeline?client=example-atlas&focus=blocked` and the top-bar scope read `Example Atlas`.

| File | Viewport | URL |
| --- | --- | --- |
| `overview-all-clients-1440.png` | 1440×900 | `/pipeline` |
| `overview-two-clients-ready-1440.png` | 1440×900 | `/pipeline?client=example-cedar,example-harbor&focus=ready` |
| `overview-by-client-1440.png` | 1440×900 | `/pipeline?group=client&client=example-atlas,example-meridian` |
| `overview-released-week-1440.png` | 1440×900 | `/pipeline?focus=released` |
| `overview-empty-1440.png` | 1440×900 | `/pipeline?q=nonexistent` |
| `overview-scope-menu-1440.png` | 1440×900 | `/pipeline?client=example-cedar`, scope menu open |
| `overview-tile-click-1440.png` | 1440×900 | after clicking the tile and a client row |
| `overview-all-clients-390.png` | 390×844, full page | `/pipeline` |
| `overview-atlas-390.png` | 390×844, full page | `/pipeline?client=example-atlas&focus=blocked` |
| `overview-by-client-390.png` | 390×844, full page | `/pipeline?group=client` |
| `client-view-choose-client-1440.png` | 1440×900 | client view cookie, `/choose-client` (portal unchanged) |
| `client-view-390.png` | 390×844, full page | same, phone |

Not verified here: live Supabase sign-in (mock mode only), and the top-bar search form still submits
only `q` (documented follow-up in the design note).

---

# Review fixes · 2026-11-07 (third run, branch `router/20261107-203147-2db9c5`)

Astra's review of the global overview (P1-1..P1-4, P2-5..P2-10) plus the top-bar search leftover.
All commands ran in `frontends/admin/`. `npm ci` installed 417 packages from the lockfile without
changes. No lab files, no push, no `gh`.

## Red → green

| Step | Observed |
| --- | --- |
| `tests/pipeline-filters.test.ts` rewritten first (repeated keys, commas, spaces, caps, 168 h window, DST, `scopeToAudience`, new `batchNote`) | `Tests 11 failed \| 10 passed (21)` against the old module; `Tests 21 passed (21)` after `pipeline-filters.ts`, `models.ts` (`releasedAt`) and `demo.ts`. |
| Component tests (`pipeline.test.tsx`, `pipeline-overview.test.tsx`, new `overview-integration.test.tsx`, `shell`, `demo-data`) written against the new components | First full run `Tests 5 failed \| 87 passed (92)`: four wrong expectations in the new tests (cards are listed column by column, so compared as sorted sets; `panel a` matches every Panel A order, so the typing test uses `shared run`; the 60 s tick also advances the faked clock) and one query that matched a split text node. Second run `Tests 92 passed (92)`. |
| `npm run typecheck` | One `HTMLElement` vs `HTMLFormElement` cast in the integration test; fixed, exit 0. |

## Browser check (`scripts/browser-check.mjs`, playwright-core 1.58.2 + Chromium headless shell 1248)

`npm run build` (system fonts) exit 0, `next start --hostname 127.0.0.1 --port 3107`, then the script:

* **History**: scope link `Example Cedar` (push) → `?client=example-cedar`, cards `ORD042 ORD044 ORD047 ORD057`;
  tile `Blocked at a gate` (replace) → `?client=example-cedar&focus=blocked`; top-bar search `pilot run` (push)
  → `?client=example-cedar&focus=blocked&q=pilot+run` with the search chip; **back** → search chip gone, tile
  still pressed, scope `Example Cedar`; **forward** → chip back, overview search box reads `pilot run`;
  **reload** → same URL, chip, pressed tile, scope label and eyebrow; back twice → `/pipeline`, `All clients`,
  18 cards. All assertions passed.
* **Typing** `shared run ` key by key in the overview → `?q=shared+run+`, input keeps the trailing space,
  one card (`ORD053`).
* **Owner menu at 390 px**: bounding box `x 16, width 358` (right edge 374 ≤ 390).
* No page scrolls sideways at 1440 or 390 (`scrollWidth == clientWidth` on every capture).

Captures (re-shot) in this folder: `overview-*-1440.png`, `overview-*-390.png`; new:
`overview-search-typing-1440.png`, `overview-commas-1440.png` (`panel=PC, PE`, `owner=Doe, Jane`, `q=a, b` as
chips), `overview-owner-menu-end-1440.png`, `overview-owner-menu-390.png` (full-width sheet),
`overview-long-chip-390.png` (truncated chips with `×`, wrapped empty state), `overview-released-week-1440.png`
now with the Panel menu open (counts 1 / 0 / 1 / 0 with the Released tile pressed).

Script output ended with `BROWSER_CHECK_OK`.
