# Nexo API port onto upstream integration — notes

Branch `candidate/nexo-api-20261108` = `candidate/admin-app-20261108` (upstream/integration 60cd4538 + the two
Admin commits) + the Nexo API. Source: `nexo/phase1` at b6163701 (97c431f4 plus four test-only commits that make the
API suites SKIP, never fail, when an optional package such as plumber, callr or httpuv is missing; upstream's
`run_acceptance.R` runs every `tests/dual-ui/test_*.R`, so that matters here).

## What was brought

- `R/frontends/api/**` (Plumber router, run/engine entry points, session engine, catalog, schema, cards, export,
  storage, datasets, palette, cohort, pool, render cache, statistics, health, README). `spike/engine_spike.R` is the
  Model B feasibility harness of the spike; nothing sources it, kept because it is part of `R/frontends/api/**`.
- `tests/dual-ui/test_api_*.R` (all 51) and the fixtures they read that upstream lacks:
  `tests/dual-ui/fixtures/nexo-complete-synthetic.zip` (+ `make_complete_synthetic.R`),
  `tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx` (+ `make_admin_dataset_v1_synthetic.R`). Both synthetic.
  `classic-seed7-synthetic.zip` is already upstream.
- Docs the API README and tests cite: `docs/integration/admin-dataset-session.md`,
  `docs/integration/nexo-complete-fixture.md`. `nexo-store-scope.md`, `admin-identity.md` and `admin-nexo-open.md`
  are already on the base (the base copy of `nexo-store-scope.md` is newer: it has the staging run).

## Changes made for upstream (all API-only; no shared, Team or Classic file changed)

Three edits: two inside the brought files and one line in an upstream test. Nothing in `R/frontends/team`,
`R/core/hooks.R`, `R/modules` or other shared code was needed or changed. Every Team symbol the API binds to (`R/frontends/api/requirements.R`) already
exists upstream after PRs 8 and 9.

1. `R/frontends/api/catalog.R`, `api_catalog_render()`: when a card's module file has no `output$<id> <- render*(`,
   look through `R/frontends/team/**/*.R` too. Reason: upstream keeps Team-only renderers outside the module (the
   Guided QC plot `qc_pca_tab-guided_qc_plot` is in `R/frontends/team/qc-server.R`, wired through the hooks
   registry), whereas nexo/phase1 has it inline in `R/modules/2_qc_boxplot_module.R`. Without it the catalog stops
   with "Cannot classify Team output" and every session/catalog test fails.
2. `tests/dual-ui/test_api_plotly_click.R`: read `R/frontends/team/cell_show.R` (upstream path) instead of
   `R/cell_show.R` (nexo/phase1 path).
3. `tests/dual-ui/test_team_storage_classic_isolation.R` (upstream test): `R/frontends/api` joins `R/frontends/team`
   in the files that are not "shared/Classic". Reason: the test fails on any file outside `R/frontends/team` that
   mentions `LIPIDOMIC_STORAGE`, and `run.R`/`pool.R` set `LIPIDOMIC_STORAGE=files` because the API process is Team
   (`LIPIDOMIC_INTERFACE=team`). Classic still never names Team storage; the dynamic half of the test is unchanged.

Not changed: comments in the API that cite nexo/phase1 paths (e.g. `R/results_dashboard.R`, `legacy_vector_adapter.R`)
still describe the same functions, which live under `R/frontends/team/` (and `hooks/qc.R`) upstream.

The systemd unit for the API (`OS/Linux/lipidomic-api.service`) is under `OS/`, left out as asked; `run.R` is the
entry point it starts (`Rscript --vanilla R/frontends/api/run.R` from the repository root).

## Classic

No Classic file changes. `git diff --name-only upstream/integration..HEAD` lists only `R/frontends/api/`,
`tests/dual-ui/test_api_*`, `tests/dual-ui/fixtures/` (new files), `tests/dual-ui/test_team_storage_classic_isolation.R`,
`docs/` and the Admin trees of the base.
Nothing the API needs required a Classic change.

## Left out (differences `nexo/phase1` has that the API does not need)

Comparison is `upstream/integration` vs `nexo/phase1` (`+a/-r` from upstream's point of view, i.e. `+` = lines only
nexo/phase1 has). Files where only upstream moved since the fork (06baf3a9) are not listed one by one: upstream is
ahead there and nothing is lost (63 files: the hooks registry `R/core/hooks.R` + `R/frontends/team/hooks/*`,
`R/frontends/team/storage/*`, `qc-server.R`, `bootstrap.R`, `palette_distinct.R`, `utils_restored_inputs.R` and
their tests).

### Product code (R, app.R, www)

| path | +a/-r | what it is (nexo/phase1 vs upstream) | upstream equivalent? |
|---|---|---|---|
| `R/cell_show.R` | +114/-0 | Team 3D cell comparison page. Nexo additionally relabels group "Exp" as "Sickle cell" for one known study (sample-name heuristic) | partial: `R/frontends/team/cell_show.R` (same file without the study relabel; shows metadata labels unchanged) |
| `R/companion_ai_provider.R` | +171/-0 | Companion external-AI provider (GPT model call), stored at top-level R/ | yes: `R/frontends/team/companion_ai_provider.R` (upstream also adds `companion_read_env` allow-listed env import) |
| `R/companion_assistant.R` | +247/-0 | Companion assistant (grounded KB, fail-closed AI rule); only source paths differ | yes: `R/frontends/team/companion_assistant.R` |
| `R/companion_kb.R` | +897/-0 | Companion grounded knowledge-base retrieval/citations; identical apart from header path | yes: `R/frontends/team/companion_kb.R` |
| `R/frontends/README.md` | +3/-5 | Nexo's older doc text: diagnostics always redacted, no install by default; lacks upstream's local-diagnostics/runtime-marker policy | upstream-only change |
| `R/frontends/classic/ui.R` | +1/-1 | Classic "Dot Plots" tab icon `braille` instead of upstream's `chart-scatter` (upstream changed it in Block A) | upstream-only change |
| `R/frontends/interface.R` | +0/-56 | Nexo lacks upstream's runtime policy helpers (env flags, restricted-runtime detection, install/diagnostics gates, UI trace suffix) | upstream-only change |
| `R/frontends/team/da_participant_warning.R` | +185/-0 | Team pseudoreplication warning on Differential analysis banners/volcano/structural/export, applied as AST adapters | yes: `R/frontends/team/hooks/participant_warning.R` (hooks de_banner, volcano_caption, export_artifacts) |
| `R/frontends/team/descriptive_inference_labels_adapter.R` | +29/-0 | Adapter: violin CSV exports distinguish "test unavailable" from nonsignificant | yes: `R/frontends/team/hooks/logratio.R` (hook violin_export_table) |
| `R/frontends/team/export_studio_adapter.R` | +314/-0 | Adapter: Team Export Studio hardening (wrapped titles, heatmap padding, repro script) and Team bundle server | yes: `R/frontends/team/export_studio.R` + `hooks/export.R` (hook export_artifacts) |
| `R/frontends/team/fla_palette_adapter.R` | +28/-0 | Adapter: re-keys FLA violin palette by group (sapply name-suffix bug), Team only | yes: fixed inline in `R/modules/10_fla_module.R:1044` for both frontends (commit df7ac7dc) |
| `R/frontends/team/group_comparison.R` | +107/-18 | Group comparison card via AST adapter on logratio_server; participant-guard helpers defined here | yes: `hooks/group_comparison.R` (logratio_result) + `hooks/logratio.R` (logratio_shared_data, participant helpers) |
| `R/frontends/team/heatmap_canvas_boundaries_adapter.R` | +67/-0 | Adapter: splits heatmap container into separate Canvas-movable outputs | yes: `R/frontends/team/hooks/heatmap.R` (heatmap_container_outputs) |
| `R/frontends/team/heatmap_scale_adapter.R` | +54/-0 | Adapter: selected-feature heatmap violin/CSV take log2 of Team's linear matrix | yes: `R/frontends/team/hooks/heatmap.R` (heatmap_violin_values) |
| `R/frontends/team/inferential_network_adapter.R` | +30/-0 | Adapter: structural/FLA correlation networks fail closed without independent design | yes: `R/frontends/team/hooks/networks.R` (inference_allowed) |
| `R/frontends/team/legacy_vector_adapter.R` | +78/-0 | Adapter: optional editable vector view of QC 2D ggplots | yes: `R/frontends/team/hooks/qc.R` (qc_plot_outputs) |
| `R/frontends/team/login-validation.R` | +1/-4 | Nexo login alert lacks the "Too many attempts. Try again in N s." passthrough | upstream-only change (sign-in limiter) |
| `R/frontends/team/parallel_pool.R` | +5/-11 | Nexo lacks worker cap by BLAS threads per worker and cancellable boot timer | upstream-only change (3f8e3ddc, fcec2501) |
| `R/frontends/team/plot_instances.R` | +1/-1 | results_dashboard family file path `R/results_dashboard.R` (nexo layout) | yes: same file, path `R/frontends/team/results_dashboard.R` |
| `R/frontends/team/project_library.R` | +114/-210 | Nexo keeps direct Supabase calls/commit and a no-op login limiter; lacks storage API and sign-in throttle | upstream-only change (storage/ API, files backend, throttle) |
| `R/frontends/team/project_records.R` | +12/-29 | Nexo uses key-based dedupe of restored runs; lacks restore_rebuild marking by content | upstream-only change |
| `R/frontends/team/qc_3d_labels_adapter.R` | +39/-0 | Adapter: QC 3D Plotly textfont only when labels enabled | yes: `R/frontends/team/hooks/qc.R` (qc_3d_textfont) |
| `R/frontends/team/sciex_import.R` | +0/-4 | Nexo lacks refusal of non-UTF-16 SCIEX files containing NUL bytes | upstream-only change (2c6c6edd) |
| `R/frontends/team/server.R` | +14/-3 | Nexo sources Team files here, calls `ux_comparison_server`; canvas server started from R/server.R | partial: sourcing via `R/frontends/team/bootstrap.R`; "Run comparison" study server has no equivalent |
| `R/frontends/team/ui.R` | +4/-3 | Nexo adds "Run comparison" nav panel, logo path `team/img/`; lacks card_tip_passthrough.css | partial: logo served from `www/img/`; Run comparison page no; CSS line upstream-only |
| `R/frontends/team/violin_statistics.R` | +63/-3 | Nexo defines participant/base helpers and session-input filter adapter in this file | yes: `hooks/logratio.R` (helpers) + `hooks/persistent_inputs.R` |
| `R/frontends/team/workspace.R` | +72/-11 | Opt-in `LIPIDOMIC_TEAM_LOCAL_SESSION=1`: Team workspace without sign-in, loopback-only host/request checks | no (upstream comment: "not ported"; files backend is the local mode) |
| `R/global.R` | +85/-27 | Hard-coded Team adapter wiring and inline parse memo; lacks runtime flag validation/frontend-file loading | yes: `R/frontends/team/bootstrap.R` + `R/core/hooks.R` + `hooks/prep_cache.R` (runtime flags upstream-only) |
| `R/guided_preparation_controls.R` | +29/-0 | Guided preparation controls; byte-identical content | yes: `R/frontends/team/guided_preparation_controls.R` |
| `R/guided_shared.R` | +169/-0 | Seven-step "guided" Classic presentation (`LIPIDOMIC_INTERFACE=guided`); not sourced anywhere in nexo | no (only its input IDs remain in upstream's session-exclude list) |
| `R/guided_workflow.R` | +839/-0 | Guided workflow; nexo adds "Run comparison" tool, bone-only sample shortcut, study-specific workbook labels | partial: `R/frontends/team/guided_workflow.R` (lacks those; has restore-rebuild marking nexo lacks) |
| `R/modules/10_fla_module.R` | +1/-6 | Nexo lacks inline palette re-key and inference_allowed hook calls | upstream-only change |
| `R/modules/12_structural_grid_module.R` | +7/-7 | Nexo lacks "No species with resolved sn-chains" messages and tryCatch guard | upstream-only change (4255aa0d) |
| `R/modules/13_pathway_module.R` | +37/-57 | Nexo lacks pathway label anchor/layout fixes | upstream-only change (4255aa0d) |
| `R/modules/14_cellular_org_module.R` | +4/-12 | Nexo lacks patchwork-aware stress-profile title | upstream-only change (4255aa0d) |
| `R/modules/1_shared_data_module.R` | +64/-140 | Nexo lacks Classic restore reader/initial-spec, Classic embedded-TP control, persistent_inputs/pca_cache hooks | upstream-only change |
| `R/modules/2_qc_boxplot_module.R` | +258/-53 | Guided QC server inline; duplicate correlation labels get "(sample id)"; lacks Classic preparation notice | partial: guided QC in `R/frontends/team/qc-server.R`/`hooks/qc.R`; labels deduped differently (`make.unique(" #")`) |
| `R/modules/4_heatmap_module.R` | +21/-46 | Nexo lacks heatmap_violin_values / heatmap_container_outputs hook call sites | upstream-only change |
| `R/modules/5_barchart_module.R` | +0/-1 | Nexo lacks one `ncols <- min(4, n)` line | upstream-only change (4255aa0d) |
| `R/modules/6_volcano_module.R` | +1/-8 | Nexo lacks volcano_caption hook wrapper | upstream-only change |
| `R/modules/8_structural_module.R` | +1/-7 | Nexo lacks de_banner and inference_allowed hook calls | upstream-only change |
| `R/modules/99_export_studio_module.R` | +1/-10 | Nexo lacks export_artifacts hook wrapper | upstream-only change |
| `R/modules/9_logratio_module.R` | +2/-7 | Nexo lacks logratio_shared_data / violin_export_table / logratio_result hook calls | upstream-only change |
| `R/modules/utils_stats.R` | +8/-14 | Team-worded captions apply to all frontends; lacks de_banner hook wrapper | upstream-only change (upstream gates Team captions to Team) |
| `R/results_dashboard.R` | +950/-0 | Team results dashboard; palette helpers sourced from `R/utils_colors.R` | yes: `R/frontends/team/results_dashboard.R` |
| `R/server.R` | +71/-12 | Inline Team wiring: sign-in gate wrapper, DA participant reason, canvas/export servers; stricter UI trace redaction | yes: `hooks/server_wiring.R` + `hooks/shared_data.R` (trace policy differs: upstream `lipidomic_ui_trace_suffix`) |
| `R/utils_colors.R` | +74/-1 | `palette_distinct`/`palette_extend` in shared colours; presets extended without repeats (Classic too) | partial: `R/frontends/team/palette_distinct.R` (Team dashboard only; Classic presets still repeat) |
| `R/utils_csv_export.R` | +1/-2 | Nexo escapes signed numbers like "-1.5" as formula-unsafe | upstream-only change |
| `R/utils_session_archive.R` | +1/-2 | Nexo uses its archive member reader for Classic too | upstream-only change (Classic keeps `unz()`) |
| `R/ux_preparation.R` | +103/-0 | Preparation UX plus saved bone "Run comparison" sensitivity study page (`ux_comparison_*`, reads `www/study/`) | partial: `R/frontends/team/ux_preparation.R` (no sensitivity study) |
| `app.R` | +1/-4 | Nexo checks install flag inline; lacks interface.R runtime-flag validation | upstream-only change |
| `www/css/cell_show.css` | +269/-0 | 3D cell page CSS, older colours/12 px fonts | yes: `www/team/css/cell_show.css` (tokens, 13 px floor) |
| `www/css/custom.css` | +26/-0 | Classic mobile (≤767 px) navbar containment and scope-caption stacking | no |
| `www/css/guided_shared.css` | +3/-0 | CSS for the unwired guided_shared Classic presentation | no |
| `www/js/app.js` | +9/-1 | Classic: re-entrancy guard on shown.bs.tab/collapse resize handler | no |
| `www/js/cell_viewer.js` | +4230/-0 | Three.js 3D cell viewer bundle; asset paths `models/` | yes: `www/team/js/cell_viewer.js` (paths `team/models/`) |
| `www/js/guided_shared.js` | +35/-0 | JS for unwired guided_shared presentation (moves bound controls into step slots) | no |
| `www/models/README.md` | +5/-0 | Provenance note for the neutrophil Blender assets | yes: `www/team/models/README.md` (+LICENSE.txt) |
| `www/models/neutrophil-cinematic.jpg` | binary | Neutrophil cinematic still image | yes: `www/team/models/` (identical blob) |
| `www/models/neutrophil-cinematic.mp4` | binary | Neutrophil cinematic video | yes: `www/team/models/` (identical blob) |
| `www/models/neutrophil-preview.png` | binary | Neutrophil fallback preview image | yes: `www/team/models/` (identical blob) |
| `www/models/neutrophil.glb` | binary | Neutrophil 3D model (GLB) | yes: `www/team/models/` (identical blob) |
| `www/team/img/app_logo.jpg` | binary | App logo copy for Team | yes: `www/img/app_logo.jpg` (identical blob) |
| `www/team/img/app_logo_ribbon.png` | binary | Ribbon logo copy for Team | yes: `www/img/app_logo_ribbon.png` (identical blob) |
| `www/team/img/app_logo_transparent.png` | binary | Transparent logo copy for Team | yes: `www/img/app_logo_transparent.png` (identical blob) |
| `www/team/js/app.js` | +2/-1 | Adds "Run comparison" entry to Team navigation list | no |
| `www/team/js/canvas.js` | +7/-26 | Nexo lacks pendingCopyNodes (save still-Generating copies), blocks save instead; older pointerdown rule | upstream-only change |
| `www/team/js/canvas_viewport.js` | +5/-10 | Nexo lacks gesture prime, Plotly re-hook after purge, empty-queue capture guard | upstream-only change |
| `www/team/js/card_figure.js` | +5/-18 | Nexo lacks footer shift around navigation box and minimap toggle re-place; skeleton handling | upstream-only change |
| `www/team/js/card_frame.js` | +0/-13 | Nexo lacks "Data & settings" opening the inspector Data tab | upstream-only change |
| `www/team/js/card_status.js` | +3/-5 | Nexo finds skeleton by selector; lacks by-reference removal | upstream-only change |
| `www/team/js/guided.js` | +1/-1 | Excludes "Run comparison" from plot-controls tools | no |
| `www/team/js/help_content.js` | +1/-0 | Help text for "Run comparison" saved study | no |
| `www/team/js/pending_changes_bar.js` | +1/-1 | Comment path `R/guided_workflow.R` only | yes: same file (comment path differs) |
| `www/team/js/tour_guide.js` | +1/-1 | Tour copy: "Existing bone workbooks can be opened directly on the RTX" | no (upstream wording is generic, admin-configured) |

Nexo-only product changes with **no** upstream equivalent (the ones the coordinator may want to decide on):
- The saved bone sensitivity study "Run comparison" page: `R/ux_preparation.R` `ux_comparison_*`, the Team server/ui/nav/help/guided entries, and its `www/study/` data.
- The unwired "guided" Classic presentation (`R/guided_shared.R`, `www/js/guided_shared.js`, `www/css/guided_shared.css`).
- The Team local session without sign-in (`LIPIDOMIC_TEAM_LOCAL_SESSION`, loopback checks in `workspace.R`).
- Classic mobile navigation CSS and the `www/js/app.js` resize re-entrancy guard.
- Study-specific details: the bone-only shortcut and labels, the "Sickle cell" relabel, and the RTX tour text.

Everything else is either the same feature under the hooks registry or moved paths, or an area where upstream is ahead. The partial cases are the shared `palette_extend` for Classic presets and the "(sample id)" correlation-label scheme.

### Tests and tooling left out

Same comparison, files under `tests/` other than `test_api_*` and the API fixtures (226 files):

- 79 R tests/fixtures changed on both lines (`test_team_*`, `test_companion_*`, `test_cross_zip.R`,
  `fixture_team_*_app.R`, ...): the same suites adapted to each line's layout (nexo: `R/results_dashboard.R`,
  `*_adapter.R`; upstream: `R/frontends/team/...`, hooks). Upstream's versions are the ones that match its code.
- 17 R tests only nexo has. Each tests a nexo-only mechanism or the equivalent of an upstream hook test:
  `test_team_adapter_ast_contract.R`, `test_team_da_participant_warning.R` (+ `fixture_team_da_participant_capture.R`),
  `test_team_fla_palette_adapter.R`, `test_team_group_comparison_adapter.R`, `test_team_legacy_vector_adapter.R`,
  `test_team_violin_export_labels.R` (adapters; upstream has `test_hooks_*`); `test_guided_qc_readiness.R`,
  `test_sample_corr_duplicate_labels.R`, `test_team_canvas_editor_state.R`, `test_team_composition_distinct_colors.R`,
  `test_team_dashboard_groups_real.R`, `test_team_distribution_compact.R`, `test_team_restore_saved_inputs.R`,
  `test_team_review_science.R` (possible extra coverage, would need adapting to the hooks layout);
  `test_optional_comparison.R` (Run comparison page), `tests/guided-shared/test_guided_server.R` (unwired guided
  presentation).
- 38 Nexo browser tests (`tests/dual-ui/test_nexo_*.cjs`, `capture_nexo_*.cjs`, `probe_webkit_lose_context.cjs`,
  `perf/`): they drive `frontends/nexo` against a mock or live API and need Playwright from a local install; candidates
  for a later PR with the frontend.
- 17 Paula QA replays (`test_team_paula_*`, `test_paula_*`), 17 other Team browser `.cjs` tests changed on both
  lines, 35 `tests/dual-ui/parity/`, 21 `tests/dual-ui/chart-audit/`, 2 `tests/dual-ui/pilot/`, `WORKERS.md`:
  evidence and audit tooling, left out.

### Trees left out on purpose

`pilot/`, `ux-redesign-evidence/`, `docs/integration/*-evidence/`, `docs/integration/chart-audit/` and the other
report folders, `REPORT_*.md`, `NOTES_FOR_MAX.md`, `OS/`, `www/models/` (3D assets).

## Verification (2026-11-09, M1, Docker R image with the Team packages + plumber/callr/httr; no R on the host)

- 51 `test_api_*` suites: 50 pass. `test_api_dataset_http.R` stops at `written > 0` (real httpuv transport, Unix
  fork) after its first PASS; it fails the same way on `nexo/phase1` b6163701 in the same image, so it is the
  container, not the port: run it on the RTX. `test_api_render_disk_cache.R` needs a git commit for its cache key
  (SKIP without one); it passes in a copy with a commit. Suites that start child R processes (`http`, `pool`,
  `export`, `plotly_click`) were run alone: under parallel load they were OOM-killed or missed the 60 s health wait.
- Upstream tests that read `R/frontends` or the R tree (architecture, hooks, consolidation boundaries, asset
  references, storage isolation, library, workspace auth, plot instances, defer chain, modules UI contract, recursive
  syntax, team-ux R tests) pass. `test_team_prep_cache.R` fails at `!file.exists(p)` both here and on the base
  (`candidate/admin-app-20261108`) in the same container (it runs as root), so not caused by the port.
