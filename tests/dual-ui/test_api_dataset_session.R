# A Nexo session opened from an Admin dataset v1 workbook prepares exactly what Team prepares
# from the same abundance matrix, metadata and explicit settings (docs/integration/admin-dataset-session.md).
for (pkg in c("jsonlite", "readxl", "writexl", "openxlsx")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_dataset_session")
source("frontends/nexo-api/engine.R")
source("frontends/nexo-api/datasets.R")
fixture <- "tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx"
stopifnot(file.exists(fixture))
samples <- c("Control_1", "Control_2", "Control_3", "Treated_1", "Treated_2", "Treated_3")
settings <- list(samples = samples, minDetectionPct = 50, detectionScope = "global", dropNonDetected = TRUE,
  normalizationMethod = "median", useImputation = TRUE, imputeZerosPerFile = TRUE,
  imputeRemainingNAtoZero = FALSE, outlierTreatments = list(Treated_3 = "remove"))
expect_condition <- function(expr, class) {
  got <- tryCatch({ expr; NULL }, error = function(e) if (inherits(e, class)) e else stop(e))
  if (is.null(got)) stop("Expected condition of class ", class)
  got
}

# --- Team's own path: upload the abundance matrix, confirm the metadata table, select, prepare. ---
team <- local({
  abundance_only <- tempfile(fileext = ".xlsx")
  writexl::write_xlsx(list(Abundance = readxl::read_excel(fixture, sheet = "Abundance", na = c("", "N/A", "NA"))), abundance_only)
  meta <- as.data.frame(readxl::read_excel(fixture, sheet = "Metadata", col_types = "text"), stringsAsFactors = FALSE)
  meta[is.na(meta)] <- ""
  # What sample_metadata_import_server hands to on_confirm: list(data, mappings, id_column).
  snapshot <- list(data = meta, mappings = c(Group1 = "Group1Term", Group2 = "Group2Term",
    Replicate = "ReplicateTerm", PatientNumber = "PatientTerm"), id_column = "FullName")
  cfg <- preparation_settings(settings[setdiff(names(settings), "samples")], "team")
  mock <- shiny::MockShinySession$new(); on.exit(mock$close())
  shared <- shiny::withReactiveDomain(mock, shared_data_server("data_hub",
    external_settings = shiny::reactive(cfg), root_session = mock, design_check = function() TRUE,
    preparation_policy = "team"))
  run <- function(expr) shiny::withReactiveDomain(mock, shiny::isolate(expr))
  mock$flushReact()
  mock$setInputs(`data_hub-files` = data.frame(name = "abundance.xlsx", size = file.info(abundance_only)$size,
    type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", datapath = abundance_only, stringsAsFactors = FALSE))
  mock$flushReact()
  run(shared$set_external_sample_metadata(snapshot)); mock$flushReact()
  mock$setInputs(`data_hub-selectedColumns` = samples)
  mock$setInputs(`data_hub-runAnalysis` = 1L)
  mock$flushReact()
  list(data = run(shared$data_processed_allow_missing()), applied = run(shared$preparation_state()$applied),
    metadata = run(shared$allParsedMetadata()))
})
stopifnot(is.data.frame(team$data), nrow(team$data) > 2L, !is.null(team$applied))
cat("PASS Team reference path prepares the synthetic dataset\n")

# --- Why the API reads only the Abundance sheet: Team's reader binds every sheet of a workbook. ---
local({
  mock <- shiny::MockShinySession$new(); on.exit(mock$close())
  all_sheets <- shiny::withReactiveDomain(mock, suppressWarnings(load_one_file(fixture, basename(fixture))))
  stopifnot("Cer(d18:1/17:0) (IS)" %in% all_sheets$Lipid_Name, "PooledQC_1" %in% names(all_sheets))
  cat("PASS documented gap: load_one_file on a whole v1 workbook pulls Internal_Standards rows and QC columns in\n")
})

# --- Missing choices: a typed 422 listing exactly what Nexo must ask for. ---
local({
  e <- expect_condition(api_dataset_session(fixture, list(samples = samples, minDetectionPct = 0)), "api_dataset_choices")
  missing <- vapply(e$payload$missing, `[[`, character(1), "name")
  stopifnot(identical(e$payload$reason, "preparation_choices_required"),
    setequal(missing, c("detectionScope", "dropNonDetected", "normalizationMethod", "useImputation",
      "imputeZerosPerFile", "imputeRemainingNAtoZero")),
    identical(as.character(unlist(e$payload$availableSamples)), samples))
  e <- expect_condition(api_dataset_session(fixture, list()), "api_dataset_choices")
  stopifnot("samples" %in% vapply(e$payload$missing, `[[`, character(1), "name"))
  # Values Team would refuse are refused with Team's own message, never corrected.
  bad <- settings; bad$normalizationMethod <- "tic"
  expect_condition(api_dataset_session(fixture, bad), "api_unprocessable")
  bad <- settings; bad$samples <- c(samples, "Nope")
  expect_condition(api_dataset_session(fixture, bad), "api_unprocessable")
  cat("PASS missing or invalid preparation choices are refused (422)\n")
})

# --- Not a dataset v1 workbook. ---
local({
  e <- expect_condition(api_dataset_session("tests/dual-ui/fixtures/classic-seed7-synthetic.zip", settings), "api_dataset_choices")
  stopifnot(identical(e$payload$reason, "dataset_invalid"))
  wrong <- tempfile(fileext = ".xlsx")
  writexl::write_xlsx(list(Abundance = readxl::read_excel(fixture, sheet = "Abundance")), wrong)
  e <- expect_condition(api_dataset_session(wrong, settings), "api_dataset_choices")
  stopifnot(identical(e$payload$reason, "dataset_invalid"))
  cat("PASS non-v1 files are refused as dataset_invalid\n")
})

# --- Parity: the dataset session prepares what Team prepared. ---
local({
  s <- api_dataset_session(fixture, settings)
  on.exit(api_session_close(s))
  df <- api_read(s, s$shared$data_processed_allow_missing())
  applied <- api_read(s, s$shared$preparation_state()$applied)
  stopifnot(identical(df, team$data), identical(applied$spec$settings, team$applied$spec$settings),
    identical(applied$spec$selected, team$applied$spec$selected),
    identical(applied$spec$data_id, team$applied$spec$data_id),
    identical(applied$spec$metadata_id, team$applied$spec$metadata_id),
    identical(applied$output_lipids, team$applied$output_lipids),
    identical(applied$output_samples, team$applied$output_samples),
    identical(api_read(s, s$shared$allParsedMetadata()), team$metadata),
    !"Treated_3" %in% names(df), !"Cer(d18:1/17:0) (IS)" %in% df$Lipid_Name)
  # The comparison is not vacuous: Metadata design columns were mapped, detection and the QC decision applied.
  meta <- api_read(s, s$shared$allParsedMetadata())
  stopifnot(identical(unique(meta$Group1), c("Control", "Treated")), identical(unique(meta$Group2), "Plasma"),
    !any(c("FFA 18:2 -H", "PC(O-34:1)+AcO") %in% df$Lipid_Name), identical(applied$filter$threshold, 50),
    identical(names(df), c("Lipid_Name", samples[-6L])))
  cat("PASS dataset session prepared data identical to Team's path\n")
  # Saved as a Team checkpoint, it reopens through the checkpoint path with the archived receipt.
  zip <- tempfile(fileext = ".zip")
  api_read(s, s$shared$export_session_path(zip))
  reopened <- api_session_for_checkpoint(zip)
  stopifnot(identical(reopened$receipt, "matches archived receipt"),
    identical(api_read(reopened, reopened$shared$data_processed_allow_missing()), df))
  api_session_close(reopened)
  cat("PASS dataset session saves a checkpoint that reopens with the same prepared data\n")
  # Same response shape as POST /api/v1/sessions, empty canvas.
  body <- api_dataset_session_response(s)
  stopifnot(all(c("sessionId", "checkpointSha256", "near_limit", "preparation", "samples", "lipids", "inputs",
      "canvas", "nexo", "design", "deState", "renderWorkers", "dataset") %in% names(body)),
    identical(body$canvas$version, "1"), length(body$canvas$nodes) == 0L,
    identical(body$samples, ncol(df) - 1L), identical(body$lipids, nrow(df)),
    identical(body$dataset$sha256, digest::digest(file = fixture, algo = "sha256")))
  jsonlite::toJSON(body, auto_unbox = TRUE, null = "null")
  cat("PASS response has the checkpoint session shape with an empty canvas\n")
  # The same workbook and settings reuse the clean session; other settings open a separate one.
  stopifnot(identical(api_dataset_session(fixture, settings)$sessionId, s$sessionId))
  other <- settings; other$minDetectionPct <- 0
  o <- api_dataset_session(fixture, other)
  stopifnot(!identical(o$sessionId, s$sessionId), !identical(o$sha256, s$sha256))
  api_session_close(o)
  cat("PASS sessions are keyed by workbook and settings\n")
  # A dataset session has no archived inputs (an empty, unnamed list); adding a plot must still work.
  card <- api_card_create(s, "qc_pca_tab-pca2dPlot")
  stopifnot(is.character(card$instanceId), exists(card$instanceId, envir = s$cards, inherits = FALSE))
  cat("PASS a plot can be added to a dataset session\n")
})
