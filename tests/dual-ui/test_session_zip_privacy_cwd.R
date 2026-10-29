source("R/global.R")
source("R/sample_metadata_import.R")

fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
stopifnot(file.exists(fixture))
secret <- "PRIVATE_ASSISTANT_CHAT_SENTINEL_70931"
event_ids <- c("assistant_request", "assistant_action", "assistant_confirm",
               "assistant_cancel", "client_ui_trace", "guide_review_receipt",
               "guide_design_confirm", "shared_apply_receipt")

for (policy in c("classic", "team")) {
  settings <- shiny::reactiveVal(list(imputationSeed = 42L, useImputation = FALSE,
                                      normalizationMethod = "none"))
  shiny::testServer(shared_data_server, args = list(
    external_settings = shiny::reactive(settings()),
    preparation_policy = policy,
    design_check = if (policy == "team") function() FALSE else NULL
  ), {
    extracted_dirs <- function() {
      dirs <- list.dirs(tempdir(), recursive = FALSE, full.names = TRUE)
      dirs[startsWith(basename(dirs), "lipidomic-session-")]
    }
    before_import_dirs <- extracted_dirs()
    session$setInputs(import_session_file = data.frame(
      name = "session.zip", size = file.info(fixture)$size,
      type = "application/zip", datapath = fixture))
    for (i in seq_len(10L)) session$flushReact()
    stopifnot(isTRUE(session_restored()),
              !length(setdiff(extracted_dirs(), before_import_dirs)))
    if (policy == "classic") {
      applied <- preparation$state()$applied$spec
      settings(applied$settings)
      session$setInputs(selectedColumns = applied$selected)
      session$flushReact()
    }
    session$setInputs(assistant_request = list(text = secret, nonce = 1L),
                      assistant_action = list(id = secret),
                      assistant_confirm = list(token = secret),
                      assistant_cancel = list(token = secret),
                      client_ui_trace = list(message = secret),
                      guide_review_receipt = list(token = secret),
                      guide_design_confirm = TRUE,
                      shared_apply_receipt = list(token = secret),
                      guide_design_notes = "Keep these study notes",
                      pFilterThreshold = 0.0123456789012345)
    cwd <- getwd()
    zip_path <- output$export_session_btn
    stopifnot(identical(getwd(), cwd), file.exists(zip_path))
    archive <- read_session_archive(zip_path)
    stopifnot(identical(getwd(), cwd),
              !any(event_ids %in% names(archive$state$inputs)),
              !any(grepl(secret, readLines(file.path(archive$directory, "state.json"), warn = FALSE), fixed = TRUE)),
              identical(archive$state$inputs$guide_design_notes, "Keep these study notes"),
              isTRUE(all.equal(archive$state$inputs$pFilterThreshold,
                               0.0123456789012345, tolerance = 0)))
    entries <- utils::unzip(zip_path, list = TRUE)$Name
    stopifnot(all(c("state.json", "shared-state-v1.json") %in% entries),
              any(startsWith(entries, "data_files/")))
    unlink(archive$directory, recursive = TRUE)

    # A previously created ZIP may contain transient inputs. They must not
    # be replayed into a new session or carried into its next export.
    modified <- tempfile("legacy-events-"); dir.create(modified)
    utils::unzip(zip_path, exdir = modified)
    state_path <- file.path(modified, "state.json")
    state <- jsonlite::read_json(state_path, simplifyVector = FALSE)
    state$inputs$assistant_request <- list(text = secret)
    state$inputs$guide_review_receipt <- list(token = secret)
    jsonlite::write_json(state, state_path, auto_unbox = TRUE, pretty = TRUE, digits = NA)
    legacy <- tempfile(fileext = ".zip")
    zip::zipr(legacy, c("state.json", "shared-state-v1.json", "data_files"), root = modified)
    session$setInputs(import_session_file = data.frame(
      name = "legacy.zip", size = file.info(legacy)$size,
      type = "application/zip", datapath = legacy))
    for (i in seq_len(10L)) session$flushReact()
    stopifnot(isTRUE(session_restored()),
              !any(event_ids %in% names(restored_inputs())),
              !length(setdiff(extracted_dirs(), before_import_dirs)),
              identical(getwd(), cwd))
    unlink(c(modified, legacy), recursive = TRUE)
  })
}

# Before the first Prepare, a Team-selected seed must not fall back to 42.
team_settings <- shiny::reactiveVal(list(imputationSeed = 11L,
                                         useImputation = TRUE,
                                         normalizationMethod = "none"))
shiny::testServer(shared_data_server, args = list(
  external_settings = shiny::reactive(team_settings()),
  preparation_policy = "team", design_check = function() FALSE
), {
  session$setInputs(files = data.frame(
    name = "synthetic.csv", size = file.info("tests/guided-shared/fixtures/abundance.csv")$size,
    type = "text/csv", datapath = "tests/guided-shared/fixtures/abundance.csv"))
  session$flushReact()
  sample_metadata <- read_sample_metadata_file("tests/guided-shared/fixtures/metadata.csv", "metadata.csv")
  session$returned$set_external_sample_metadata(stage_metadata_v01(
    sample_metadata, all_numeric_columns(),
    c(Group1 = "Condition", Group2 = "Tissue", PatientNumber = "SubjectID",
      Replicate = "ReplicateID", TimePoint = "TimePoint")), TRUE)
  session$flushReact()
  stopifnot(is.null(preparation$state()$applied))
  archive <- read_session_archive(output$export_session_btn)
  stopifnot(identical(as.integer(archive$state$preparation_contract$imputation_seed), 11L))
  unlink(archive$directory, recursive = TRUE)
})

# Exercise the second real download handler on a prepared synthetic matrix.
settings <- shiny::reactiveVal(list(imputationSeed = 7L, useImputation = FALSE,
                                    normalizationMethod = "none", minDetectionPct = 0,
                                    dropNonDetected = FALSE, detectionScope = "global",
                                    imputeZerosPerFile = TRUE,
                                    imputeRemainingNAtoZero = TRUE,
                                    outlierTreatments = list()))
shiny::testServer(shared_data_server, args = list(
  external_settings = shiny::reactive(settings()), preparation_policy = "classic"
), {
  session$setInputs(import_session_file = data.frame(
    name = "session.zip", size = file.info(fixture)$size,
    type = "application/zip", datapath = fixture))
  for (i in seq_len(10L)) session$flushReact()
  session$setInputs(selectedColumns = all_numeric_columns(), runAnalysis = 1L)
  session$flushReact()
  stopifnot(!is.null(data_processed()), nrow(data_processed()) > 0)
  cwd <- getwd()
  both_path <- output$downloadImputedBoth
  stopifnot(file.exists(both_path), identical(getwd(), cwd))
  entries <- utils::unzip(both_path, list = TRUE)$Name
  stopifnot(length(entries) == 3L,
            any(grepl("^LipidomicExplorer_Imputed_Before_Outliers_.*[.]csv$", entries)),
            any(grepl("^LipidomicExplorer_Imputed_After_Outliers_.*[.]csv$", entries)),
            "Outliers_Treatment_Ledger.txt" %in% entries)
})

# The ZIP writer itself must fail without changing the R process directory.
cwd <- getwd()
failed <- try(zip::zipr(file.path(tempfile("missing-parent-"), "bad.zip"),
                       "state.json", root = tempdir()), silent = TRUE)
stopifnot(inherits(failed, "try-error"), identical(getwd(), cwd))

# Archive validation itself also cleans extraction bytes if a late sidecar
# check fails after files have already been streamed to disk.
archive_stage <- tempfile("bad-sidecar-"); dir.create(archive_stage)
utils::unzip(fixture, exdir = archive_stage)
sidecar_path <- file.path(archive_stage, "shared-state-v1.json")
sidecar <- jsonlite::read_json(sidecar_path, simplifyVector = FALSE)
sidecar$version <- "unsupported"
jsonlite::write_json(sidecar, sidecar_path, auto_unbox = TRUE)
bad_archive <- tempfile(fileext = ".zip")
zip::zipr(bad_archive, c("state.json", "shared-state-v1.json", "data_files"), root = archive_stage)
session_dirs <- function() {
  dirs <- list.dirs(tempdir(), recursive = FALSE, full.names = TRUE)
  dirs[startsWith(basename(dirs), "lipidomic-session-")]
}
before_failed_read <- session_dirs()
bad_read <- try(read_session_archive(bad_archive), silent = TRUE)
stopifnot(inherits(bad_read, "try-error"),
          !length(setdiff(session_dirs(), before_failed_read)),
          identical(getwd(), cwd))
unlink(c(archive_stage, bad_archive), recursive = TRUE)
cat("PASS: ZIP exports omit browser events, preserve study inputs and archive layout, and never change cwd\n")
