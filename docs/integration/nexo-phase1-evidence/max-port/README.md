# Nexo on Max's integration branch (2026-11-09)

Max's branch: `integration/libreros-guided-workflow` at `60cd4538` (hooks architecture). Production: `ebee653`
(adapter architecture). R ran on the Linux server (R 4.4.3, conda env `nexo-api`); browsers ran on the Mac.

| File | What it shows |
|---|---|
| `baseline-red-r-suite-max-tree.txt` | before the port, Nexo's API tests on his branch: 9 PASS / 39 FAIL / 1 SKIP; the catalog could not classify `qc_pca_tab-guided_qc_plot` (defined in `R/frontends/team/qc-server.R` there) |
| `r-suite-max-tree.txt` | after the port (API in `frontends/nexo-api/`), 52 tests on his branch: 50 PASS / 2 SKIP / 0 FAIL, with seconds per test |
| `r-suite-production-tree.txt` | the same 52 tests on production: 50 PASS / 2 SKIP / 0 FAIL |
| `render-all-complete-max-tree.txt` | complete synthetic fixture on his branch: 58 rendered, 0 gated, 0 silent, 0 failed |
| `render-all-complete-production-tree.txt` | the same on production: 57 rendered, 1 gated (the filtered donut, Team's `ncols` bug that his branch has fixed) |
| `render-all-classic-max-tree.txt` | classic synthetic fixture on his branch: 44 / 9 / 5 / 0 (production: 44 / 7 / 7 / 0) |
| `acceptance-base-manifest.csv` | Max's `tests/dual-ui/run_acceptance.R` on his branch alone: 152 PASS / 1 FAIL (`test_c3_qc_team.R`) |
| `acceptance-stack-manifest.csv` | the same runner on the tree of PR #20 (Admin #16-#17 + Nexo #18-#20): 204 PASS / 1 FAIL (the same test) |
| `r-parse.txt` | `parse()` of the 76 new R files in #18 and #19: all OK |
| `pilot/<engine>/` | Figure 1 pilot live against an API running his branch: 25/25 in Chromium and WebKit; `team-roundtrip-max.txt` = the saved checkpoint opened by his Team, 8/8 PASS |

The two SKIPs: the disk-cache test needs git metadata (absent in the server's test copy), and `test_api_stress.R`
runs only with `NEXO_API_PERF=1`. The API on his branch reports `scienceMatchesProduction: false` over 15 files, as
expected: those science modules differ between production and his branch. Nexo changes none of them.
