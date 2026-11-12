# Admin wave 2 · samples flow (receive shipment, sample registry) · verification · 2026-11-07

All commands ran in `frontends/admin/` on macOS ARM64, Node 26.12.1, npm 11.20.0, in demo mode (no Supabase
env vars). Fixtures are synthetic. No push, `gh`, PR or merge was made.

## Test first

| Step | Command | Observed |
| --- | --- | --- |
| Baseline before any change | `npm test -- --reporter=dot` | `Test Files 17 passed (17)` · `Tests 92 passed (92)` |
| Red: six new test files written against modules that did not exist yet | `npm test -- tests/samples-paste.test.ts tests/samples-validation.test.ts tests/samples-demo.test.ts tests/data-seam.test.ts tests/sample-registry.test.tsx tests/receive-shipment.test.tsx` | `Test Files 6 failed (6)` · `Failed to resolve import "@/lib/samples"`, `"@/lib/samples-demo"`, `"@/lib/data/samples"`, `"@/components/sample-registry-grid"`, `"@/components/receive-shipment-form"` |
| Green: pure logic (`src/lib/samples.ts`, `src/lib/samples-demo.ts`) | `npm test -- tests/samples-paste.test.ts tests/samples-validation.test.ts tests/samples-demo.test.ts` | `Test Files 3 passed (3)` · `Tests 21 passed (21)` |
| Green: data seam (`src/lib/data/`) | `npm test -- tests/data-seam.test.ts` | `Test Files 1 passed (1)` · `Tests 7 passed (7)` |
| Green: client components + server actions | `npm test -- tests/sample-registry.test.tsx tests/receive-shipment.test.tsx` | `Test Files 2 passed (2)` · `Tests 8 passed (8)` |
| Whole suite | `npm test -- --reporter=dot` | `Test Files 23 passed (23)` · `Tests 128 passed (128)` |

`npm run typecheck` and `npm run lint` exit 0. `npm run build` exits 0 and lists `ƒ /receive-shipment` and
`ƒ /sample-registry` among the dynamic routes.

## End-to-end

`npx playwright test --list` finds `e2e/samples.spec.ts` (1 test). `npx playwright test` against
`npm run dev -- --port 3110`: the first run failed because `baseURL` ends in `/admin` without a trailing
slash, so `page.goto("/sign-in")` resolves to `/sign-in` (standard URL resolution drops the base path) and
lands on the app's not-found page; the spec now navigates to `/admin/sign-in` and the config stays as the
brief words it. Second run: `1 passed (15.7s)`.

Installing the browser needed a workaround on this machine: `npx playwright install chromium` fails under
Node 26 with `TypeError [ERR_INVALID_ARG_VALUE]: The property 'options.recursive' is no longer supported`
(Playwright 1.55's `browserFetcher` calls `fs.promises.rmdir(..., { recursive: true })`, removed in Node 26)
and leaves a `__dirlock` behind, so later attempts wait on it. The two zips were downloaded with `curl` from
`playwright.download.prss.microsoft.com` (build 1187, Chromium 140.0.7339.16) and extracted into
`~/Library/Caches/ms-playwright/{chromium,chromium_headless_shell}-1187` with the `INSTALLATION_COMPLETE`
marker the installer writes. Node 22, the app's declared engine, does not have this problem.

## Screens

`node scripts/samples-screens.mjs verification/samples` (dev server at 3110) wrote the PNGs in this folder,
at 1440x900 and 390x844: receive shipment empty and filled, registry after arrival, registry with inline
errors (duplicate FullName, empty row, non-numeric volume), registry with a clean grid, registry after
saving (codes `ORD042-S001..S003`), the order detail, the pipeline filtered to the client (ORD042 in
**Registered**, gate blocked because the shipment arrived thawed) and the order picker. The script also
checks that no page scrolls sideways at 390 px (`horizontal page scroll: false` for all three pages).
A console listener over sign-in, receive shipment, both registry views and the order detail recorded no
browser errors or warnings; the Next dev overlay's "Issues" badge counts dev-server notices (the
`allowedDevOrigins` cross-origin warning), not page errors.

Design fixes made from the first set of screenshots: radio cards were stretched by the global
`.field input { width: 100% }` rule (fixed in `samples.css`, which also removed a 13 px sideways overflow at
390 px); the nine-column grid did not fit the 1.8fr column, so the registry page now puts the order and
shipment facts in a strip on top and gives the tables the full width, with the column help as a
"Which columns?" disclosure next to the paste box; the empty grid button reads "Register samples" instead
of "Register 0 samples"; the board's progress counts registered samples (`3 / 12`) once there are some;
the order's received day follows the lab clock rather than UTC.
