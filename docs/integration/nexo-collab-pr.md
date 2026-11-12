# Nexo Phase 1B: collaboration and entry screens (PR draft)

This PR brings Nexo Phase 1B onto the integration branch, on top of #18-#20: everything `nexo/collab` added to Nexo
since those PRs were cut (`nexo/phase1` 44b1ae9b, whose Nexo code and tests are byte-identical to the base), applied
as a three-way patch on the Nexo paths only. It adds `frontends/nexo-collab/`, a small Node sidecar (Hocuspocus/Yjs
on SQLite, with migrations and a backup script) that holds the shared board: projects with Owner/Editor/Commenter/Viewer roles
and sharing by giving project members a role, saved versions with restore, comment threads, presence and follow, and science changes
sent as intents to the R API with a service token. On the client side, `frontends/nexo/` gets the live board (collab
client, presence pills, version history, comments, share dialog, offline and leave handling) and the entry screens:
sign-in with the Admin account, Start (projects and datasets), Prepare/Check (quality warnings that never block) and
Data, with their illustrations. `frontends/nexo-api/` gets the service-token route, board revisions, dataset upload
and a checkpoint import tool. It uses the Admin functions merged in #21/#22 (`nexo_people`, `nexo_access`, `members_prepare`, and the
session-token `displayName`/`clientNames`); the unit suites use fakes and do not need them. No
file outside the Nexo paths changes (`git diff --name-only <base> <tip> -- R app.R www DESCRIPTION .github` prints
nothing): no Classic, Team, science module or `R/` change; binary captures and the server deploy kit are left out.
**How to test:** `Rscript --vanilla tests/dual-ui/test_api_<name>.R` for each R suite; in `frontends/nexo`
`npm ci && npx vitest run && npm run build`; in `frontends/nexo-collab` `npm ci && npm test`; the browser suites
`tests/dual-ui/test_nexo_collab_*.cjs` and `test_nexo_entry_*.cjs` need Node, Playwright and a live API and sidecar
(`tests/dual-ui/collab-real.cjs`). **Results (2026-11-11, synthetic data, R 4.4.3 with plumber/callr/httr, on this branch's tree):** Nexo R suite,
63 files: 63 PASS (the wall-clock budgets behind `NEXO_API_PERF=1` print SKIP for their timing part only).
`test_api_dataset_http.R` can fail under heavy parallel load (`written > 0`); run alone it passes on this tree, on
`nexo/collab` and on the base. Vitest: 190 files, 1188 tests passed, and the build succeeds. Sidecar: 238 tests, 238
pass. The same code runs in the lab's production since 2026-11-11, where the fixes in the last commit were found and
checked; the golden Admin → Nexo journey (18 steps, through the real web server) passes on staging.
