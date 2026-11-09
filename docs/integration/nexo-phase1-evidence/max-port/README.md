# Nexo on Max's integration tree (2026-11-09)

Tree: `max/integration-60cd4538` (Max's `integration/libreros-guided-workflow`, hooks architecture) plus the Nexo
files from `nexo/phase1`. R ran on the Linux server (conda env `nexo-api`); browsers ran on the Mac.

| File | What it shows |
|---|---|
| `baseline-red-r-suite-max-tree.txt` | before the port: 25 PASS / 23 FAIL / 1 SKIP; the catalog could not classify `qc_pca_tab-guided_qc_plot` (defined in `R/frontends/team/qc-server.R` there) |
| `t1-77cf1d82-r-suite-max-tree.txt` | after the catalog fix: 49 PASS / 1 SKIP / 0 FAIL (the SKIP is the disk-cache test, which needs a git checkout) |
| `render-all-complete-max-tree.txt` | complete synthetic fixture: 58 rendered, 0 gated, 0 silent, 0 failed |
| `render-all-classic-max-tree.txt` | classic synthetic fixture: 44 rendered, 9 gated, 5 silent, 0 failed (production: 44/7/7/0; Max's Team gates the two editable-vector PCA views with its own smart-label message) |
| `pilot/<engine>/` | Figure 1 pilot live against an API running Max's tree: 25/25 in Chromium and WebKit; `team-roundtrip-max.txt` = the saved checkpoint opened by Max's Team, 8/8 PASS |

The API on this tree reports `scienceMatchesProduction: false` over 15 files, as expected: those science modules
differ between production and Max's branch. Nexo changes none of them.
