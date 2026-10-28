# Exercise the actual shared-data/QC bridge, including visible pending errors.
# An optional archive argument also exercises the browser's saved-control replay.
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/global.R")

capture <- function(compute) tryCatch(compute(), error = identity)
pending <- capture(function() qc_guided_pca_value(function() shiny::req(FALSE)))
stopifnot(inherits(pending, "shiny.silent.error"),
  grepl("PCA is waiting", conditionMessage(pending), fixed = TRUE))
scientific <- capture(function() shiny::validate(shiny::need(FALSE, "Complete finite measurements are required.")))
preserved <- capture(function() qc_guided_pca_value(function() stop(scientific)))
stopifnot(identical(preserved, scientific))
failure <- simpleError("PCA engine failed")
stopifnot(identical(capture(function() qc_guided_pca_value(function() stop(failure))), failure))

arguments <- commandArgs(trailingOnly = TRUE)
archive_path <- if (length(arguments)) normalizePath(arguments[[1]], mustWork = TRUE) else NULL
controls <- list(normalizationMethod = "none", pcaMode = "omics", maxPCs = 3,
  useImputation = FALSE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = TRUE,
  minDetectionPct = 0, dropNonDetected = FALSE, detectionScope = "global",
  mergeReplicatesMode = "single", dropMisc = FALSE, imputationSeed = 42,
  classLabelFormat = "short", colorGrouping = "Group1", labelParts = "Group1",
  outlierScope = "global", outlierThreshold = 2.5)
names(controls) <- paste0("qc_pca_tab-", names(controls))
if (!is.null(archive_path)) {
  archive <- read_session_archive(archive_path)
  controls <- modifyList(controls, archive$state$inputs[grep("^qc_pca_tab-", names(archive$state$inputs))])
  unlink(archive$directory, recursive = TRUE)
}

pending_pca <- shiny::reactiveVal(FALSE)
app_server <- function(input, output, session) {
  bridge <- shiny::reactiveVal(NULL)
  shared <- shared_data_server("data_hub", external_settings = bridge,
    preparation_policy = "team", design_check = function() TRUE, root_session = session)
  real_pca <- shared$pca_results
  shared$pca_results <- shiny::reactive({
    shiny::req(!pending_pca())
    real_pca()
  })
  qc <- qc_boxplot_server("qc_pca_tab", shared, shiny::reactive(list()))
  shiny::observe({ shiny::req(qc()); bridge(qc()) })
  session$userData$shared <- shared
}

shiny::testServer(app_server, {
  do.call(session$setInputs, controls)
  if (is.null(archive_path)) {
    matrix_path <- normalizePath("tests/guided-shared/fixtures/abundance.csv")
    metadata <- read_sample_metadata_file("tests/guided-shared/fixtures/metadata.csv", "metadata.csv")
    matrix <- read.csv(matrix_path, check.names = FALSE)
    session$setInputs(`data_hub-files` = data.frame(name = "abundance.csv",
      size = file.info(matrix_path)$size, type = "text/csv", datapath = matrix_path),
      `data_hub-selectedColumns` = names(matrix)[-1])
    session$userData$shared$set_external_sample_metadata(stage_metadata_v01(metadata,
      names(matrix)[-1], c(Group1 = "Condition", Group2 = "Tissue",
        PatientNumber = "SubjectID", Replicate = "ReplicateID", TimePoint = "TimePoint")), TRUE)
  } else {
    session$setInputs(`data_hub-import_session_file` = data.frame(name = "session.zip",
      size = file.info(archive_path)$size, type = "application/zip", datapath = archive_path))
    for (i in seq_len(15)) session$flushReact()
    stopifnot(isTRUE(session$userData$shared$session_restored()))
  }
  session$setInputs(`data_hub-runAnalysis` = 1L)
  for (i in seq_len(12)) session$flushReact()
  shared <- session$userData$shared
  stopifnot(identical(shared$preparation_state()$status, "ready"))
  prepared <- shared$data_processed()
  expected <- length(shared$applied_sample_ids())
  scores <- shared$pca_results()$replicate_score_df
  stopifnot(nrow(scores) == expected, all(is.finite(scores$PC1)), all(is.finite(scores$PC2)))
  stopifnot(grepl("PCA summarizes variation", output[["qc_pca_tab-guided_qc_status"]]$html, fixed = TRUE))
  plot <- jsonlite::fromJSON(output[["qc_pca_tab-guided_qc_plot"]], simplifyVector = FALSE)
  stopifnot(sum(vapply(plot$x$data, function(trace) length(trace$x), integer(1))) == expected)

  # Real ShinySession$freezeValue invalidates input values; MockShinySession's
  # implementation omits that flag. Reproduce the real restore semantics here.
  shared$is_restoring(TRUE); session$flushReact()
  input_impl <- .subset2(input, "impl")
  input_impl$freeze("data_hub-activeModifications", invalidate = TRUE)
  frozen <- capture(function() shared$global_filtered_lipids())
  stopifnot(inherits(frozen, "shiny.silent.error"), !nzchar(conditionMessage(frozen)))
  input_impl$thaw("data_hub-activeModifications")
  still_cached <- capture(function() shared$global_filtered_lipids())
  stopifnot(inherits(still_cached, "shiny.silent.error"))
  shared$is_restoring(FALSE); session$flushReact()
  stopifnot(nrow(shared$pca_results()$replicate_score_df) == expected,
    identical(shared$data_processed(), prepared))

  pending_pca(TRUE); session$flushReact()
  for (id in c("qc_pca_tab-guided_qc_status", "qc_pca_tab-guided_qc_plot")) {
    message <- capture(function() output[[id]])
    stopifnot(inherits(message, "shiny.silent.error"),
      grepl("PCA is waiting", conditionMessage(message), fixed = TRUE))
  }
  stopifnot(identical(shared$data_processed(), prepared))
  pending_pca(FALSE); session$flushReact()
  stopifnot(nrow(shared$pca_results()$replicate_score_df) == expected,
    grepl("PCA summarizes variation", output[["qc_pca_tab-guided_qc_status"]]$html, fixed = TRUE))
})
cat("PASS: Team shared/QC bridge renders prepared samples, explains empty pending PCA, and recovers without changing data\n")
