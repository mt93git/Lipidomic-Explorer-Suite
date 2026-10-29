# Team -> Classic -> Team ZIP regression for Team metadata extensions, QC
# history and palettes. The separate seed-restore acceptance test covers
# production updateNumericInput delivery; this test does not claim browser UI
# hydration or settings parity from serialized applied settings.
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/global.R")

matrix_path <- normalizePath("tests/guided-shared/fixtures/abundance.csv")
metadata_path <- normalizePath("tests/guided-shared/fixtures/metadata.csv")
matrix <- read.csv(matrix_path, check.names = FALSE, stringsAsFactors = FALSE)
matrix[1, 2] <- NA_real_; matrix[2, 3] <- NA_real_
matrix_path_na <- tempfile(fileext = ".csv")
write.csv(matrix, matrix_path_na, row.names = FALSE, na = "")
on.exit(unlink(matrix_path_na), add = TRUE)
metadata <- read_sample_metadata_file(metadata_path, basename(metadata_path))
ids <- names(matrix)[-1L]
mapping <- c(Group1 = "Condition", Group2 = "Tissue", PatientNumber = "SubjectID",
             Replicate = "ReplicateID", TimePoint = "TimePoint")
snapshot_data <- data.frame(FullName = metadata$SampleID,
  metadata[setdiff(names(metadata), "SampleID")],
  Note = paste("fixture", metadata$SampleID), check.names = FALSE,
  stringsAsFactors = FALSE)
snapshot <- list(data = snapshot_data, mappings = mapping, id_column = "SampleID")
palette <- list("Study palette" = list(name = "Study palette",
  colors = c("Group1::Control" = "#123456", "Group1::Treatment" = "#654321")))
team_settings <- list(minDetectionPct = 0, dropNonDetected = FALSE, detectionScope = "global",
  useImputation = TRUE, imputationMethod = "QRILC", imputeZerosPerFile = TRUE,
  imputeRemainingNAtoZero = TRUE, normalizationMethod = "none", imputationSeed = 7L,
  outlierTreatments = list(S01 = "remove"),
  guidedQcDecisions = data.frame(time = "2026-10-27 12:00:00 UTC", sample = "S01",
    action = "Exclude", reason = "synthetic fixture review", pca_settings = "synthetic", stringsAsFactors = FALSE),
  colorGrouping = "Group1", useCustomColors = TRUE, custom_colors = list(Control = "#123456"),
  active_palette = "Study palette", color_palettes = palette)

export_team <- tempfile(fileext = ".zip")
team_live <- shiny::reactiveVal(team_settings)
shiny::testServer(shared_data_server, args = list(
  external_settings = shiny::reactive(team_live()), preparation_policy = "team",
  design_check = function() TRUE), {
    session$setInputs(files = data.frame(name = basename(matrix_path_na),
      size = file.info(matrix_path_na)$size, type = "text/csv", datapath = matrix_path_na),
      selectedColumns = ids, `qc_pca_tab-useImputation` = TRUE,
      `qc_pca_tab-imputationMethod` = "QRILC", `qc_pca_tab-imputationSeed` = 7,
      `qc_pca_tab-normalizationMethod` = "none", `qc_pca_tab-imputeZerosPerFile` = TRUE,
      `qc_pca_tab-imputeRemainingNAtoZero` = TRUE)
    session$flushReact(); api <- session$returned
    api$set_external_sample_metadata(snapshot)
    api$set_palette_settings(list(colorGrouping = "Group1", useCustomColors = TRUE,
      custom_colors = list(Control = "#123456"), color_palettes = palette,
      active_palette = "Study palette"))
    session$setInputs(runAnalysis = 1L); session$flushReact()
    stopifnot(!is.null(api$data_processed_unfiltered()))
    exported <- output$export_session_btn
    stopifnot(is.character(exported), length(exported) == 1L, file.exists(exported),
      file.copy(exported, export_team, overwrite = TRUE))
  })

classic_live <- shiny::reactiveVal(list(useImputation = FALSE, imputationSeed = 42L,
  imputationMethod = "none", normalizationMethod = "none", outlierTreatments = list(),
  guidedQcDecisions = NULL, colorGrouping = "Group1", useCustomColors = FALSE,
  custom_colors = list()))
classic_export <- tempfile(fileext = ".zip")
Sys.setenv(LIPIDOMIC_INTERFACE = "classic")
shiny::testServer(shared_data_server, args = list(
  external_settings = shiny::reactive(classic_live()), preparation_policy = "classic"), {
    session$flushReact(); api <- session$returned
    session$setInputs(import_session_file = data.frame(name = basename(export_team),
      size = file.info(export_team)$size, type = "application/zip", datapath = export_team))
    for (i in seq_len(12L)) session$flushReact()
    stopifnot(isTRUE(api$session_restored()), !is.null(api$data_processed_unfiltered()),
      !is.null(api$restored_qc_decisions()))
    live <- api$preparation_state()$applied$spec$settings
    session$setInputs(selectedColumns = api$preparation_state()$applied$spec$selected)
    live$outlierTreatments <- api$restored_outlier_treatments()
    live$guidedQcDecisions <- api$restored_qc_decisions()
    classic_live(live)
    path <- output$export_session_btn
    stopifnot(is.character(path), length(path) == 1L, file.exists(path),
      file.copy(path, classic_export, overwrite = TRUE))
    inspect <- tempfile("classic-zip-"); dir.create(inspect)
    utils::unzip(classic_export, exdir = inspect)
    on.exit(unlink(inspect, recursive = TRUE), add = TRUE)
    saved <- jsonlite::read_json(file.path(inspect, "state.json"), simplifyVector = FALSE)
    extra <- saved$metadata$external_sample_metadata$data
    stopifnot(is.list(extra), identical(vapply(extra, function(row) as.character(row$Note %||% ""), character(1)),
      snapshot_data$Note), identical(vapply(extra, function(row) as.character(row$Batch %||% ""), character(1)),
      as.character(snapshot_data$Batch)))
    palette_state <- saved$color_shape
    stopifnot(identical(palette_state$active_palette, "Study palette"),
      identical(unlist(palette_state$color_palettes[["Study palette"]]$colors), palette[["Study palette"]]$colors))
  })

Sys.setenv(LIPIDOMIC_INTERFACE = "team")
design_allowed <- shiny::reactiveVal(TRUE)
shiny::testServer(shared_data_server, args = list(
  external_settings = shiny::reactive(team_live()), preparation_policy = "team",
  design_check = function() isTRUE(design_allowed())), {
    # Import into an already prepared Team session, the browser case that can
    # otherwise leave its previous Quality summary and PCA on screen.
    session$setInputs(files = data.frame(name = basename(matrix_path_na),
      size = file.info(matrix_path_na)$size, type = "text/csv", datapath = matrix_path_na),
      selectedColumns = ids, `qc_pca_tab-useImputation` = TRUE,
      `qc_pca_tab-imputationMethod` = "QRILC", `qc_pca_tab-imputationSeed` = 7,
      `qc_pca_tab-normalizationMethod` = "none", `qc_pca_tab-imputeZerosPerFile` = TRUE,
      `qc_pca_tab-imputeRemainingNAtoZero` = TRUE)
    session$flushReact()
    session$setInputs(runAnalysis = 1L); session$flushReact()
    api <- session$returned
    stopifnot(!is.null(api$data_processed_unfiltered()),
      !is.null(api$preparation_state()$applied),
      grepl("APPLIED PREPARATION", output$preparationSummary$html, fixed = TRUE))
    design_allowed(FALSE)
    session$setInputs(import_session_file = data.frame(name = basename(classic_export),
      size = file.info(classic_export)$size, type = "application/zip", datapath = classic_export))
    for (i in seq_len(12L)) session$flushReact()
    stopifnot(isTRUE(api$session_restored()), is.null(api$data_processed_unfiltered()),
      is.null(api$preparation_state()$applied), !isTRUE(api$preparation_state()$data_available),
      !grepl("APPLIED PREPARATION", output$preparationSummary$html, fixed = TRUE),
      grepl("Review sample groups", output$preparationSummary$html, fixed = TRUE),
      identical(api$external_sample_metadata()$team_snapshot$data$Note, snapshot_data$Note),
      identical(api$external_sample_metadata()$team_snapshot$data$Batch, snapshot_data$Batch),
      identical(api$palette_settings()$active_palette, "Study palette"),
      identical(unlist(api$palette_settings()$color_palettes[["Study palette"]]$colors),
        palette[["Study palette"]]$colors), !is.null(api$restored_qc_decisions()))
    # Restore alone must not execute. Approval/run remains a separate action.
    session$setInputs(selectedColumns = ids, runAnalysis = 2L); session$flushReact()
    stopifnot(is.null(api$data_processed_unfiltered()))
  })

unlink(c(export_team, classic_export), force = TRUE)
cat("PASS: real hub Team -> Classic -> Team ZIP preserves Batch/Note metadata, Team palette and QC history; Team restore did not autorun\n")
