# Real shared_data_server ZIP export/import across Classic and Team policies.
# Uses only the repository's synthetic 12x8 abundance and metadata fixtures.
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/global.R")

matrix_path <- normalizePath("tests/guided-shared/fixtures/abundance.csv")
metadata_path <- normalizePath("tests/guided-shared/fixtures/metadata.csv")
matrix <- read.csv(matrix_path, check.names = FALSE, stringsAsFactors = FALSE)
metadata <- read_sample_metadata_file(metadata_path, basename(metadata_path))
ids <- names(matrix)[-1L]
mapping <- c(Group1 = "Condition", Group2 = "Tissue", PatientNumber = "SubjectID",
             Replicate = "ReplicateID", TimePoint = "TimePoint")
team_snapshot <- data.frame(FullName = metadata$SampleID,
  metadata[setdiff(names(metadata), "SampleID")], check.names = FALSE,
  stringsAsFactors = FALSE)
team_snapshot <- list(data = team_snapshot, mappings = mapping, id_column = "SampleID")

settings_for <- function(policy) list(
  minDetectionPct = 0, dropNonDetected = identical(policy, "team"), detectionScope = "global",
  useImputation = FALSE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = TRUE,
  normalizationMethod = "none", imputationSeed = 7L, outlierTreatments = list(),
  guidedQcDecisions = list(S01 = list(action = "keep", reason = "synthetic fixture review")),
  colorGrouping = "Group1", useCustomColors = TRUE, custom_colors = list(Control = "#123456"))

make_archive <- function(policy) {
  cfg <- settings_for(policy)
  live_settings <- shiny::reactiveVal(cfg)
  approved <- shiny::reactiveVal(TRUE)
  archive_path <- NULL
  source_applied <- NULL
  source_metadata <- NULL
  source_matrix <- NULL
  palette_before <- NULL

  shiny::testServer(shared_data_server, args = list(
    external_settings = shiny::reactive(live_settings()),
    design_check = if (identical(policy, "team")) function() isTRUE(approved()) else NULL,
    preparation_policy = policy), {
      session$flushReact()
      session$setInputs(files = data.frame(name = basename(matrix_path),
        size = file.info(matrix_path)$size, type = "text/csv", datapath = matrix_path),
        selectedColumns = ids)
      session$flushReact()
      api <- session$returned
      if (identical(policy, "team")) {
        api$set_external_sample_metadata(team_snapshot)
        api$set_palette_settings(list(colorGrouping = "Group1", useCustomColors = TRUE,
          custom_colors = list(Control = "#123456"), color_palettes = list(), active_palette = "Default"))
        palette_before <<- api$palette_settings()
      } else {
        stage <- stage_metadata_v01(metadata, ids, mapping)
        api$set_external_sample_metadata(stage, TRUE)
      }
      session$setInputs(runAnalysis = 1L)
      session$flushReact()
      source_applied <<- api$preparation_state()$applied
      source_metadata <<- api$all_metadata()
      source_matrix <<- api$data_processed_unfiltered()
      if (is.null(source_matrix)) {
        cat("SOURCE PREPARATION STATE:\n")
        print(api$preparation_state())
        cat("SOURCE UPLOADS:\n")
        print(api$loaded_files())
      }
      stopifnot(!is.null(source_matrix))
      path <- output$export_session_btn
      stopifnot(is.character(path), length(path) == 1L, file.exists(path))
      archive_path <<- tempfile(fileext = ".zip")
      stopifnot(file.copy(path, archive_path, overwrite = TRUE))
    })

  stopifnot(!is.null(source_applied), file.exists(archive_path))
  list(path = archive_path, applied = source_applied, metadata = source_metadata,
       matrix = source_matrix, palette = palette_before)
}

make_legacy_team_archive <- function(path) {
  extracted <- tempfile("legacy-team-"); dir.create(extracted)
  utils::unzip(path, exdir = extracted)
  unlink(file.path(extracted, "shared-state-v1.json"))
  state_path <- file.path(extracted, "state.json")
  state <- jsonlite::read_json(state_path, simplifyVector = FALSE)
  state$preparation_contract <- NULL
  jsonlite::write_json(state, state_path, auto_unbox = TRUE, pretty = TRUE)
  legacy <- tempfile(fileext = ".zip")
  old <- getwd(); on.exit({setwd(old); unlink(extracted, recursive = TRUE)}, add = TRUE)
  setwd(extracted)
  zip::zip(legacy, files = c("state.json", "data_files"), recurse = TRUE)
  setwd(old)
  legacy
}

restore_archive <- function(path, source, destination, legacy = FALSE) {
  diagnostic_archive <- read_session_archive(path)
  unlink(diagnostic_archive$directory, recursive = TRUE)
  cfg <- settings_for(destination)
  live_settings <- shiny::reactiveVal(cfg)
  approved <- shiny::reactiveVal(FALSE)
  result <- NULL
  checks <- character()
  check <- function(label, value) {stopifnot(isTRUE(value)); checks <<- c(checks, label)}

  shiny::testServer(shared_data_server, args = list(
    external_settings = shiny::reactive(live_settings()),
    design_check = if (identical(destination, "team")) function() isTRUE(approved()) else NULL,
    preparation_policy = destination), {
      session$flushReact()
      api <- session$returned
      session$setInputs(import_session_file = data.frame(name = basename(path),
        size = file.info(path)$size, type = "application/zip", datapath = path))
      for (i in seq_len(8L)) session$flushReact()
      if (!isTRUE(api$session_restored())) {
        cat("RESTORE STATUS HTML:\n")
        print(output$import_status_display$html)
        cat("RESTORE FLAGS:\n")
        print(list(restored = api$session_restored(), restoring = api$is_restoring(),
          metadata = api$external_sample_metadata(), files = api$loaded_files()))
      }
      check("archive hydrated", isTRUE(api$session_restored()) && !isTRUE(api$is_restoring()))
      check("restore review barrier clears prepared output", is.null(api$data_processed_unfiltered()))
      if (identical(destination, "team")) {
        session$setInputs(runAnalysis = 1L); session$flushReact()
        check("restore cannot prepare before confirmation", is.null(api$data_processed_unfiltered()))
      }
      restored_meta <- api$external_sample_metadata()
      if (legacy && identical(source, "team")) {
        check("legacy Team snapshot restored", !is.null(restored_meta) &&
          identical(restored_meta$team_snapshot$mappings, mapping))
      } else {
        check("metadata restored", !is.null(restored_meta) &&
          identical(as.character(api$all_metadata()$FullName), ids))
      }
      if (!is.null(restored_meta)) {
        check("mapped condition labels restored", identical(as.character(api$all_metadata()$Group1),
          as.character(metadata$Condition)))
        check("mapped subject IDs restored", identical(as.character(api$all_metadata()$PatientNumber),
          as.character(metadata$SubjectID)))
      }
      check("QC decisions restored", !is.null(api$restored_qc_decisions()))
      if (identical(destination, "team")) {
        check("Team palette restored", identical(api$palette_settings()$custom_colors$Control, "#123456"))
        approved(TRUE)
      }
      # An explicit Run is required after restore. In testServer, QC controls
      # are represented by external_settings; set the serialized applied
      # settings into that bridge to model the restored Team/Classic controls.
      archive <- read_session_archive(path)
      on.exit(unlink(archive$directory, recursive = TRUE), add = TRUE)
      saved <- archive$shared$applied$spec$settings
      if (is.null(saved)) saved <- cfg
      live_settings(saved)
      session$setInputs(selectedColumns = ids)
      session$setInputs(runAnalysis = 2L)
      session$flushReact()
      check("explicit run prepares restored matrix", !is.null(api$data_processed_unfiltered()))
      result <<- list(matrix = api$data_processed_unfiltered(), metadata = api$all_metadata(),
        applied = api$preparation_state()$applied, checks = checks,
        qc_decisions = api$restored_qc_decisions())
    })
  result
}

assert_roundtrip <- function(source, destination, legacy = FALSE) {
  exported <- make_archive(source)
  path <- if (legacy) make_legacy_team_archive(exported$path) else exported$path
  restored <- restore_archive(path, source, destination, legacy)
  keys <- c("minDetectionPct", "dropNonDetected", "useImputation", "normalizationMethod",
    "imputeZerosPerFile", "imputeRemainingNAtoZero", "imputationSeed", "outlierTreatments")
  same_setting <- vapply(keys, function(key) isTRUE(all.equal(
      restored$applied$spec$settings[[key]], exported$applied$spec$settings[[key]],
      check.attributes = FALSE)), logical(1))
  if (!all(same_setting)) {
    mismatched <- keys[!same_setting]
    for (key in mismatched) {
      cat("SETTING MISMATCH", source, "->", destination, key, "source:")
      str(exported$applied$spec$settings[[key]])
      cat("restored:")
      str(restored$applied$spec$settings[[key]])
    }
  }
  stopifnot(all(same_setting),
    identical(restored$applied$spec$settings$imputationSeed, 7L),
    identical(restored$applied$spec$settings$normalizationMethod, "none"),
    identical(restored$applied$spec$settings$useImputation, FALSE),
    isTRUE(all.equal(restored$matrix, exported$matrix, tolerance = 1e-12)))
  unlink(c(exported$path, if (legacy) path), force = TRUE)
  TRUE
}

# Each edge is a real export-handler ZIP followed by the real import callback.
edges <- list(c("classic", "classic"), c("classic", "team"),
              c("team", "classic"), c("team", "team"))
for (edge in edges) {
  assert_roundtrip(edge[[1L]], edge[[2L]])
  cat(sprintf("PASS: %s -> %s ZIP restore\n", edge[[1L]], edge[[2L]]))
}
assert_roundtrip("team", "team", legacy = TRUE)
cat("PASS: legacy Team state.json restore\n")
