# Nexo session from an Admin dataset v1 Excel

Status: implemented in `R/frontends/api/datasets.R`, route in `R/frontends/api/plumber.R`.
Tests: `tests/dual-ui/test_api_dataset_session.R` (parity with Team's path, typed 422s, checkpoint round
trip) and `tests/dual-ui/test_api_dataset_route.R` (the route through plumber's router, in process).
Fixture: `tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx`, built by
`make_admin_dataset_v1_synthetic.R` next to it (synthetic values only).

## 1. The path Team takes today (read from the code)

Team's server (`R/server.R:31-85`) creates `qc_settings_bridge <- reactiveVal(NULL)` and calls

```r
shared_data_server("data_hub", external_settings = qc_settings_bridge, root_session = session,
  design_check = <guide_workflow$design_ok()>, preparation_policy = "team", inference_check = ...)
```

then fills the bridge from `qc_boxplot_server("qc_pca_tab", ...)`, whose `settings_out`
(`R/modules/2_qc_boxplot_module.R:594`) returns the QC widgets' values.

A fresh Excel enters `shared_data_server` (`R/modules/1_shared_data_module.R`) like this:

1. **Upload** `input$files` (fileInput, line 851). The file is copied into the session's private
   upload storage and recorded in `rv$uploads`; preparation, external metadata and freshness are reset.
   (`load_local_workbook(path)`, line 6229, is the same step for a workbook on the lab server.)
2. **Read** `rawData()` (line 980): `detect_file_type()` classifies the workbook ("global" when column A
   holds lipid names) and `load_one_file()` (`R/utils_data.R:10`) reads **every sheet** with
   `na = c("N/A","NA","")`, `bind_rows()` them, names column A `Lipid_Name`, and averages duplicated
   lipid names. Then every non-`Lipid_Name` column is coerced with `as.numeric`.
3. **Sample metadata**: in Team the person uploads a metadata table (guided workflow,
   `sample_metadata_import_server`, `R/frontends/team/sample_metadata_import_module.R`), chooses which
   column maps to which design field (Group1, Group2, Replicate, PatientNumber, TimePoint) and confirms.
   The module hands a snapshot `list(data, mappings, id_column)` to
   `shared$set_external_sample_metadata(snapshot)`, which under policy "team" runs
   `canonical_team_metadata()` (line 5634): `stage_metadata_v01()` validation (every matrix sample has a
   row, mapped columns have no blanks), `confirm_metadata_v01()`, `merge_confirmed_sample_metadata()`.
4. **Sample selection** `input$selectedColumns` (checkbox group, line 1087; Team requires an explicit,
   non-empty selection: `empty_means_all = FALSE` for policy "team").
5. **Preparation settings** come only from `external_settings()` (the QC bridge), normalised by
   `preparation_settings(settings, "team")` (`R/utils_preparation.R:2`). The keys that change science:

   | key | Team QC widget | widget default | `preparation_settings` team default |
   |---|---|---|---|
   | `minDetectionPct` | slider 0-100, step 5 | 0 | 0 |
   | `detectionScope` | `global` / `group` | `global` | `global` |
   | `dropNonDetected` | checkbox | FALSE | **TRUE** |
   | `normalizationMethod` | `median` / `pqn` / `none` | `median` | `median` |
   | `useImputation` (QRILC) | checkbox | TRUE | TRUE |
   | `imputeZerosPerFile` | checkbox | TRUE | TRUE |
   | `imputeRemainingNAtoZero` | checkbox | TRUE | **FALSE** |
   | `imputationSeed` | none (no widget; `input$imputationSeed` is NULL) | - | 42 |
   | `outlierTreatments` | QC sample decisions | none | none |

   plus `useAveragedSubstitution` (a data_hub checkbox, default FALSE) read into the request as
   `use_average`. The widget defaults and the function defaults **disagree** on two keys; the API must
   therefore never fill these in itself.
6. **Prepare**: `pending_preparation()` builds `preparation_request(rawData(), selected, metadata,
   settings, use_average, data_id, "team")`; `shared_preparation_controller` commits it only on an
   explicit trigger (`input$runAnalysis`, or `request_team_review_preparation("entry")` from Review)
   while `design_check()` passes. The result is `data_processed_allow_missing()` and
   `preparation_state()$applied` (spec, filter audit, output lipids/samples, revision).

**User decisions** in that path: the file; the metadata column → design field mapping and its
confirmation; the selected samples; each preparation setting in the table; sample decisions
(remove/average); averaged substitution; the study design confirmation (only gates inference, not
preparation). Everything else is computed by Team code.

## 2. What a dataset v1 workbook changes

- The Admin workbook has five sheets (`Abundance`, `Metadata`, `Internal_Standards`, `QC_Injections`,
  `Provenance`). **Team's `load_one_file()` binds every sheet**: opened directly in Team, the IS rows
  would be appended to the lipid matrix, the QC/blank injections would become sample columns, and the
  Metadata/Provenance text would become all-NA columns. The API therefore hands Team **only the
  `Abundance` sheet** (the workbook with the other sheets removed, cells untouched, via openxlsx).
  This is transport, not science: the same upload observer and `rawData()` then read it.
  *Team gap (not changed here, R/modules is off limits):* Team itself should recognise dataset v1
  (`Provenance` `dataset_format = 1`) and read only `Abundance`; until then people must not upload a
  v1 workbook to Team as-is. Recommended hook: in `load_one_file()`, when sheet names start with
  `Abundance, Metadata, Internal_Standards, QC_Injections, Provenance`, read `Abundance` only.
- The `Metadata` sheet is the metadata table, with the mapping fixed by the format
  (`docs/01_input_data_specification.md`): `Group1Term → Group1`, `Group2Term → Group2`,
  `ReplicateTerm → Replicate`, `PatientTerm → PatientNumber`, `TimePointTerm → TimePoint`. A column that
  is empty for every sample is left unmapped (Team's "Unspecified"), exactly as an unmapped column in
  Team. The API passes the snapshot to the same `set_external_sample_metadata()`; Team's validators
  decide whether it is acceptable.

## 3. The endpoint

`POST /api/v1/datasets/sessions`

- `multipart/form-data`: `file` = the dataset v1 `.xlsx` (≤ 90 MiB), `settings` = JSON text (below); or
- `application/json`: `{ "datasetId": "<sha256>", "settings": {...} }`, resolved through the existing
  storage layer (`api_store()$load()`) in the project `<LIPIDOMIC_API_WORKSPACE>-datasets`, where Admin's
  release step will store released workbooks.

`settings` (all of these are **required**, no defaults):
`samples` (non-empty array of Abundance column names), `minDetectionPct`, `detectionScope`,
`dropNonDetected`, `normalizationMethod`, `useImputation`, `imputeZerosPerFile`,
`imputeRemainingNAtoZero` (every setting Team shows as a QC widget). Optional, each absent value being
exactly what Team does when the person never touches it: `imputationSeed` (Team has no widget, so
`preparation_settings` uses 42), `outlierTreatments` (`{sampleId: "remove" | "average" | "keep"}`,
absent = no sample decisions) and `useAveragedSubstitution` (absent = FALSE, the unticked checkbox).

Responses:

- **200**: exactly the shape of `POST /api/v1/sessions` (`sessionId`, `checkpointSha256`, `preparation`,
  `samples`, `lipids`, `inputs`, `canvas` = empty v1 canvas, `nexo` = null, `design`, `deState`, ...)
  plus `dataset = {sha256, format, settings}`. `checkpointSha256` is a digest of the workbook and the
  settings, so caches (memory, disk, render pool) never mix two preparations of one workbook. The
  session saves to a normal checkpoint with `POST /api/v1/sessions/<id>/checkpoints`.
- **422 `preparation_choices_required`**: one or more required choices are missing. Body:
  `{error, reason, message, missing: [{name, label, kind, choices | min/max, teamControlDefault}],
  availableSamples: [...]}` so Nexo can ask the person, prefilled with Team's QC widget defaults.
- **422 `dataset_invalid`**: not a dataset v1 workbook (sheet order, `dataset_format`, Metadata columns,
  Metadata rows that do not match the Abundance columns, a design column partly blank).
- **422 `unprocessable`**: Team refused (invalid setting value via `preparation_settings`, metadata
  rejected by `canonical_team_metadata`, or the preparation controller failed, e.g. fewer than two
  lipids pass detection), with Team's message.
- 400 malformed body, 404 unknown `datasetId`, 413 too large, 503 busy (same as other engine routes).

Wiring: the same calls as `api_session_open()` (`shared_data_server(..., preparation_policy = "team")`
with `design_check = TRUE`, the explicit `guide_design_confirm` inference bridge, the DA participant
bridge, `team_canvas_server`, `results_dashboard_server`, `team_plot_instances_server`), then the
Team steps above in order: `data_hub-files` upload, `set_external_sample_metadata(snapshot)`,
`data_hub-selectedColumns`, `data_hub-useAveragedSubstitution`, `data_hub-runAnalysis`. The settings
object given to `external_settings` is `preparation_settings(settings, "team")` of the explicit
values (the same 9-key object a checkpoint session restores from `spec$settings`).

Evidence for §2 is in the parity test: `load_one_file()` on the whole synthetic v1 workbook returns the
`Cer(d18:1/17:0) (IS)` row and a `PooledQC_1` column, and reports 38 duplicated lipid names, which it averages
(the 24 QC_Injections rows repeat the Abundance lipids; the Metadata and Provenance rows have no lipid name).

Settings arrive as JSON and are passed unchanged to `preparation_settings()` (an integer-valued
`minDetectionPct` stays an integer, as Shiny's own JSON decoding of the slider would give).

## 4. Left for later

- `session.R` and `datasets.R` duplicate ~25 lines of module wiring; factor an `api_session_wire()`
  out of `api_session_open()` in a follow-up (kept separate here to leave the checkpoint path
  byte-identical).
- A storage write path for released datasets (`<workspace>-datasets`) belongs to Admin's release step.
- Team should learn to read dataset v1 itself (see §2).
