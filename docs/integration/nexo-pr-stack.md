# Nexo hand-off: PRs #18, #19 and #20

Nexo reaches Max as three PRs in the stack open on `mt93git/Lipidomic-Explorer-Suite`, on top of the Admin PRs
(#16 `candidate/admin-db-20261108`, #17 `candidate/admin-app-20261108`), all stacked on
`integration/libreros-guided-workflow` (`60cd4538`):

| PR | Branch | Content |
|---|---|---|
| #18 | `candidate/nexo-api-20261108` (on #17) | the headless R API in `frontends/nexo-api/`, its 52 tests `tests/dual-ui/test_api_*.R` and the synthetic fixtures they use |
| #19 | `candidate/nexo-frontend-20261108` (on #18) | the TypeScript canvas in `frontends/nexo/` (with vitest), 34 browser suites `tests/dual-ui/test_nexo_*.cjs`, the chart-audit harness and the Figure 1 pilot |
| #20 | `candidate/nexo-docs-20261109` (on #19) | design, plan and close notes, chart audit reports, Team inventory, text evidence, this hand-off and the Team proposals |

Nexo is a headless R API that runs Team's own Shiny modules under `shiny::MockShinySession`, plus a TypeScript
canvas. The API is a separate process, not part of the Shiny app, so it lives in `frontends/nexo-api/` next to
`frontends/nexo/`, outside Team's `R/` tree. The Nexo PRs add files only: they change no upstream file, nothing in
Classic, Team, the science modules or `DESCRIPTION`. For each PR and for the whole stack these print nothing:

```sh
git diff --name-only --diff-filter=MDRT integration/libreros-guided-workflow <tip>
git diff --name-only integration/libreros-guided-workflow <tip> -- R app.R www DESCRIPTION
```

Left out: binary captures (listed in `docs/integration/nexo-phase1-evidence/captures-not-included.txt`) and the
server deploy kit with its hard-coded server paths. Text kept in has local paths and host names replaced by
`<repo>`, `<home>`, `<server-home>`, `<server>` or `<tmp>`. Team and module behaviours found along the way are in
`nexo-team-bug-proposals.md`, for Max to decide; the stack does not change them.

## Checks and results

All on synthetic data; per-test results are in `docs/integration/nexo-phase1-evidence/max-port/`.

| Check | Result | Evidence |
|---|---|---|
| Max's `run_acceptance.R`, his branch alone | 152 PASS / 1 FAIL (`test_c3_qc_team.R`, already failing without Nexo), 582 s | `acceptance-base-manifest.csv` |
| Max's `run_acceptance.R` on the #20 tree (#16 to #20) | 204 PASS / 1 FAIL (the same `test_c3_qc_team.R`), 1369 s; all 52 `test_api_*.R` pass, his storage-isolation test passes unchanged | `acceptance-stack-manifest.csv` |
| Nexo R suite (`test_api_*.R`, 52 files) on his branch | 50 PASS / 2 SKIP / 0 FAIL | `r-suite-max-tree.txt` |
| Nexo R suite on production (`ebee653`) | 50 PASS / 2 SKIP / 0 FAIL | `r-suite-production-tree.txt` |
| Before the port, on his branch | 9 PASS / 39 FAIL / 1 SKIP: the catalog could not find `qc_pca_tab-guided_qc_plot` (defined in `R/frontends/team/qc-server.R` there) and almost every test fell with it | `baseline-red-r-suite-max-tree.txt` |
| All 58 catalog plots, complete fixture, his branch | 58 drawn / 0 gated / 0 silent / 0 failed | `render-all-complete-max-tree.txt` |
| All 58 plots, classic fixture, his branch | 44 / 9 / 5 / 0 (production: 44 / 7 / 7 / 0; his Team gates the two editable-vector PCA views with its own smart-label message) | `render-all-classic-max-tree.txt` |
| Figure 1 pilot against a live API on his branch | Chromium 25/25, WebKit 25/25 | `pilot/<engine>/pilot-output.txt` |
| Checkpoint saved by Nexo, opened by his Team | 8/8 in both engines | `pilot/<engine>/team-roundtrip-max.txt` |
| New R files of #18 and #19 parse | 76 of 76 | `r-parse.txt` |

The two SKIPs are the disk-cache test, which needs git metadata (his CI checks out with git, so there it runs), and
`test_api_stress.R`, which runs only with `NEXO_API_PERF=1`. `tests/dual-ui/test_c3_qc_team.R` fails the same way on his branch without Nexo in this environment; it is
not caused by the stack.

**What his CI runs.** `run_acceptance.R` picks up the 52 new `tests/dual-ui/test_api_*.R`. Tests that need a
package outside `DESCRIPTION` (`plumber`, `callr`, `png`, `svglite`) print SKIP and exit 0;
`tests/dual-ui/test_api_dependency_guards.R` checks that every such use is guarded. Wall-clock budgets
(`test_api_stress.R`, the p95/RSS part of `test_api_cache.R`) SKIP unless `NEXO_API_PERF=1`, so a slower runner does
not fail them. Measured on the server, the new tests add about 13 minutes to the run. Without `plumber`,
`test_api_checkpoint_scope.R` (the Admin store scope) and the HTTP tests SKIP in his CI, so that logic is covered
only where `plumber` is installed. Vitest and the `.cjs` browser suites need Node and Playwright; they run on the
server or a Mac, not in his CI. His workflow triggers on PRs to the integration branches, so the stacked PRs get no
CI run of their own until they reach the integration branch.

**Proposal, Max decides:** add `plumber` and `callr` to `Suggests` (`httr` is already there) so the HTTP and
store-scope tests run in CI. Not included in the stack.

**Admin identity.** #18 includes the server-side store scope for Admin accounts. It is off by default and turns on
with `LIPIDOMIC_ADMIN_REQUIRE_USER=1`; `admin-identity.md` and `nexo-store-scope.md` give the contract and its
limits.

**Proposed agreement: one reference tree.** Production (the server) still runs Team in the adapter architecture;
his branch runs the hooks architecture, and 15 science files differ between the two. Nexo now passes on both, but
every new divergence means porting it again. The ask: agree that his integration branch is the single reference,
and that production is redeployed from it once his port is complete. In return Nexo is developed and tested against
that branch only, and keeps its parity tests comparing with Team of the same tree. Timing is his call.

## How to test

- **#18:** run the two scope commands; `Rscript --vanilla tests/dual-ui/run_acceptance.R <baseline> <output>` as in
  CI, or one test with `Rscript --vanilla tests/dual-ui/test_api_<name>.R` (with `plumber` and `callr` installed the
  HTTP tests run too). Start the API with `Rscript --vanilla frontends/nexo-api/run.R`.
- **#19:** in `frontends/nexo`, `npm ci`, `npm test` and `npm run build`. With Node, Playwright and the API running,
  `node tests/dual-ui/test_nexo_canvas_edit.cjs` or the pilot `node tests/dual-ui/pilot/pilot_figure1.cjs`, then open
  the checkpoint it saved in Team with `Rscript --vanilla tests/dual-ui/pilot/pilot_team_roundtrip.R <zip>`.
- **#20:** documentation only; the scope commands print nothing.

Further Nexo changes for Max go on top of #18, #19 or #20.
