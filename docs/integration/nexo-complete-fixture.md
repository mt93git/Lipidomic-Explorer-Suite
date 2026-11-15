# Nexo complete synthetic fixture

Status: run and verified on the Linux box (see "Verified run" at the end). The analysis below was written statically; the run corrected two points.
Script: `tests/dual-ui/fixtures/make_complete_synthetic.R`. Output: `tests/dual-ui/fixtures/nexo-complete-synthetic.zip`.

## 1. How Team builds a checkpoint

Inputs are relative to the `data_hub` namespace.

1. **`files`.** The abundance CSV (`R/modules/1_shared_data_module.R:58`, observer 845-870). Column 1 becomes `Lipid_Name` (1005) and every other column is a numeric sample (1057, 1079-1082).
2. **Metadata.** Team calls `set_external_sample_metadata(list(data, mappings, id_column))`, which the module returns at 6276-6289. `data$FullName` must match the matrix columns in order (5634-5675). Mappings may target `Group1/Group2/Replicate/PatientNumber/TimePoint` (`R/utils_sample_metadata.R:58`). The UI route is `R/frontends/team/sample_metadata_import_module.R:126-130`.
3. **Preparation.** Normalisation and imputation are not module inputs; they come from `external_settings` (`R/utils_preparation.R:4-8`). `selectedColumns` and **`runAnalysis`** (588-612) apply them. Applying needs `design_check()` to be TRUE (589) and `authorized` (1602-1603).
4. **Study design.** The root inputs `guide_unit`, `guide_design_type` and `guide_design_confirm` (`R/guided_workflow.R:207-211`) are never archived; Nexo sets them after opening (`api_design`, `R/frontends/api/session.R:340-350`).
5. **Time and subject.** There is no separate step: these are the mapped `TimePoint` and `PatientNumber` fields.
6. **Archive writer.** `export_session_path(file)` (5236) is also exposed as `output$export_session_btn` (5289-5293). It writes `state.json`, `shared-state-v1.json` (metadata plus `applied`) and `data_files/`. It is a closure over module reactives, so it needs a reactive domain.

It can be driven headlessly. `tests/dual-ui/test_cross_zip.R:35-69` (`make_archive("team")`) runs exactly files → `set_external_sample_metadata` → `runAnalysis` → `output$export_session_btn` under `shiny::testServer`. The API's MockShinySession runs the same module (`session.R:219-276`), but it only imports ZIPs. The API refuses a ZIP whose `shared.applied$spec$settings/selected` is missing (`session.R:230-233`), so the fixture must be exported after `runAnalysis`. The existing `classic-seed7-synthetic.zip` has no generator: it was exported by hand from Classic (its `client_ui_trace`).

## 2. Why the 14 outputs do not draw, and what fixes them

| Output | Cause (evidence) | Fix |
|---|---|---|
| `qc_pca_tab-pca2dVectorPlot` | Any `GeomTextRepel` layer → validate (`R/frontends/team/legacy_vector_adapter.R:10`). `smartLabelPCA2D` defaults TRUE (`qc-ui.R:64`). | Card input `smartLabelPCA2D=FALSE` |
| `qc_pca_tab-load2dVectorPlot` | Same check. `smartLabelLoad2D` defaults TRUE (`qc-ui.R:71`). The `pcaMode` observer turns labels on (`2_qc_boxplot_module.R:733-755`). | `smartLabelLoad2D=FALSE`, `showSingleLipidNames=FALSE` |
| barchart `barPlotFiltered`/`donutPlotFiltered`, heatmap `filteredHeatmapPlot`/`filteredHeatmapSDPlot` | Significant = BH p ≤ 0.05 **and** \|log2FC\| ≥ 1 (`1_shared_data_module.R:4479-4489`). In seed7, PC(34:1) is about 108 vs 190, so log2FC ≈ 0.8. Messages: `4_heatmap_module.R:2054`, `5_barchart_module.R:818`. | Data: ±1.5 log2 effects, 12 vs 12 |
| `structural_tab-summaryPlot` | A class counts only with ≥ `minClassSize`=3 species enriched on **each** side (`8_structural_module.R:35, 1978-1992`). Features are tested between the up and down species sets and BH-filtered (1995-2035, 2051-2078). Message at 2049. | Data: 6 up and 6 down per class, with the up set longer and more unsaturated. Action `runAnalysis`. |
| `structural_tab-speciesPlotPlot` | `eventReactive(input$updateSpecies)` plus `req(isolate(input$selectedDetails))` (2345-2348). The selector exists only after `runAnalysis` (2308-2342), but the API seeds renderUI inputs only at card creation (`R/frontends/api/cards.R:79, 219-241`). | `runAnalysis`, then re-seed or set `selectedDetails` (e.g. `"GP_PC | Total Carbons"`), then `updateSpecies` |
| `structural_grid_tab-heatmapPlot`/`dotplotPlot` | The default `lipid_class` is the first sorted subclass (`12_structural_grid_module.R:283-299`). In seed7 that is GL_TAG, and `TG(52:2)` has no chains, so `req(nrow(grid_df)>0)` fails silently (431). | Data: every species chain-resolved, so `TG(a_b_c)` → GL_TAG has sn1/sn2 (`R/global.R:1022-1028`) |
| `longitudinal_tab-{macroclass,subclass,index,struct}_plot` | `longitudinal_design` is `eventReactive(input$submit_longitudinal_btn)` with `ignoreNULL` left at TRUE (`11_longitudinal_module.R:1341-1355`). A designer case also needs ≥ 2 cohorts, i.e. time points (2855-2870). The plots `req()` their renderUI selectors (3316-3361). | Data: 3 time points. Action `submit_longitudinal_btn`, then re-seed the selectors. |

DE "auto" picks limma (n < 5) or routes by skewness (`1_shared_data_module.R:4446-4463`, `utils_stats.R:591-616`); either test separates 12 vs 12.

## 3. The fixture

`set.seed(20261106)`; nothing comes from real data.

- **Samples.** 24 samples S01-S24: Control/Treatment × T1/T2/T3 × 4. Each sample has its own subject, P01-P24.
- **Lipids.** 76 in total:
  - PC, PE, PI and PS each have 6 down species (16-18 carbons, saturated) and 6 up species (18-22 carbons, polyunsaturated), all written `X(a:b/c:d)`.
  - TG has 12 species written `TG(a:b_c:d_18:1)`.
  - There are 16 unchanged SM, Cer, LPC and LPE species.
- **Abundances.** On the log2 scale: base 10-16, ±1.5 for Treatment, +0.3 per time step on up species, and N(0, 0.25) noise. There are no zeros and no missing values.
- **Settings.** As seed7, but without imputation: normalisation `none`, seed 7, `dropNonDetected`.
- **Metadata mapping.** Same as `test_cross_zip.R:11-16`.

The script asserts an applied preparation with 3 time points before copying `output$export_session_btn`. `--verify` opens the ZIP via `api_session_for_checkpoint`, confirms Animal/independent, and renders the 14 outputs.

**Per-card steps after opening** (needed by the render-all test as well):

- `smartLabelPCA2D=FALSE`
- `smartLabelLoad2D=FALSE`
- `runAnalysis` on both structural cards
- `updateSpecies` after a `selectedDetails` value
- `submit_longitudinal_btn` on all four longitudinal cards

`--verify` re-seeds with the internal `api_seed_rendered_inputs`; passing the input explicitly also works.

## Decisions and uncertainty

- **One sample per subject.** Repeating subjects under an independent design makes Team withhold unpaired p-values (`R/frontends/team/group_comparison.R:139-181`). A paired design turns off the unpaired DE (`guided_workflow.R:209`), and with it the filtered views. So longitudinal plots draw dots per cohort (default `all_dots`, `11_longitudinal_module.R:2867-2905`), but no subject lines and no paired p-values.
- **TG chain parsing.** Team parses only the first two TG chains, so TG Total_Carbons is wrong (34-44 rather than 50-62). That is acceptable for a draw test.
- **No hand-written JSON.** No `team-canvas-v1.json`: Nexo opens an empty canvas.
- **Unverified, needs a run on the Linux box:**
  - whether `api_validate_inputs` accepts `selectedDetails` before its selector exists;
  - whether the longitudinal significance ledger (paired-only, 1915-1916) affects the four plots beyond `showSignificantOnly`;
  - whether the 44 outputs that already draw still do with 24 samples and 76 lipids.

  Run the script with `--verify`, then `test_api_render_all.R` on the new fixture with the per-card steps added.

## Verified run (coordinator, Linux box, nexo/phase1)

`Rscript tests/dual-ui/fixtures/make_complete_synthetic.R <out.zip> --verify` → `VERIFY 13 of 13 rendered`
(evidence `docs/integration/nexo-phase1-evidence/h8/complete-fixture/`). The ZIP is committed as
`tests/dual-ui/fixtures/nexo-complete-synthetic.zip` and sits in the API checkpoint folder as `nexo-complete-synthetic`.
Two corrections to the static analysis:

- **DE contrast.** With time points mapped, Team turns on "Group by Time Point" on every load
  (`1_shared_data_module.R:1886-1888`), and the default contrast becomes `Control_T1` vs `Control_T2`, so every
  filtered/structural view failed with "Invalid contrast". The generator archives `deReferenceGroups =
  Control_T1..T3`, `deComparisonGroups = Treatment_T1..T3` (orientation Group1 + TimePoint).
- **Loadings 2D vector view.** The `pcaMode` observer turns the smart labels back on while the card is created
  (`2_qc_boxplot_module.R:733-743`); switching them off with a card update afterwards sticks.

**Team bug found:** `barchart-donutPlotFiltered` never draws in production. Its `renderPlot` passes
`ncols = ncols`, but that block never defines `ncols` (the unfiltered donut does, `5_barchart_module.R:765`), so R
finds a function and fails with "invalid 'type' (closure) of argument". Not fixable from Nexo (science files are
off limits); to report to Team.
