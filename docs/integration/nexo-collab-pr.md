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
and a checkpoint import tool. It depends on the Admin PRs #21/#22 for `nexo_people`, `nexo_access` and `members_prepare`: the sidecar
and the entry screens call `rpc/nexo_people` and `rpc/nexo_datasets_for_caller` and read the client's
`members_prepare` flag, none of which the base's `db/admin` has yet; the unit suites use fakes and do not need them. No
file outside the Nexo paths changes (`git diff --name-only <base> <tip> -- R app.R www DESCRIPTION .github` prints
nothing): no Classic, Team, science module or `R/` change; binary captures and the server deploy kit are left out.
**How to test:** `Rscript --vanilla tests/dual-ui/test_api_<name>.R` for each R suite; in `frontends/nexo`
`npm ci && npx vitest run && npm run build`; in `frontends/nexo-collab` `npm ci && npm test`; the browser suites
`tests/dual-ui/test_nexo_collab_*.cjs` and `test_nexo_entry_*.cjs` need Node, Playwright and a live API and sidecar
(`tests/dual-ui/collab-real.cjs`). **Results (2026-11-11, synthetic data, R 4.4.3 with plumber/callr/httr):** Nexo R
suite, 61 files: 57 PASS / 3 SKIP / 1 FAIL on this tree and the same per file on `nexo/collab`. The FAIL is
`test_api_dataset_http.R` (`written > 0`). It happened only because both suites ran at the same time; run alone, it
passes 2/2 on this tree, on `nexo/collab` and on the base. That gives 58 PASS / 3 SKIP / 0 FAIL. The SKIPs are
the wall-clock budgets behind `NEXO_API_PERF=1` (`test_api_stress.R`, `test_api_violin_speed.R` and the p95/RSS
part of `test_api_cache.R`, whose functional checks pass). Vitest: 189 files, 1173 tests passed, and the build
succeeds. Sidecar: 230 tests, 230 pass.
