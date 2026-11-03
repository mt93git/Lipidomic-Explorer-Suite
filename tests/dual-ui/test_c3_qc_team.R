# Block C3: production's Team QC review lives in R/frontends/team/qc-server.R and
# qc-ui.R. The shared QC module keeps Block B's Classic code, reaching Team only
# through its Team-only sys.source entry point. Synthetic fixtures only.

# 1. Classic QC module is byte-identical to the C2 baseline (4b45a8b).
module_path <- "R/modules/2_qc_boxplot_module.R"
baseline <- suppressWarnings(system2("git", c("show", paste0("4b45a8b:", module_path)), stdout = TRUE, stderr = FALSE))
stopifnot("git baseline 4b45a8b must be readable" = is.null(attr(baseline, "status")) && length(baseline) > 0L)
module <- readLines(module_path, warn = FALSE)
stopifnot("QC module must be unchanged from 4b45a8b" = identical(module, baseline))
module_text <- paste(module, collapse = "\n")
team_entry <- 'if (identical(lipidomic_interface(), "team")) {\n      sys.source("R/frontends/team/qc-server.R", envir = environment())\n    }'
stopifnot(grepl(team_entry, module_text, fixed = TRUE),
  lengths(regmatches(module_text, gregexpr("R/frontends/team/", module_text, fixed = TRUE))) == 1L,
  # Block B Classic fixes that production reverted remain in the module.
  grepl("output$classicPreparationNotice", module_text, fixed = TRUE),
  grepl("input$applyClassicPreparation", module_text, fixed = TRUE),
  grepl("outlierTreatments(treats)\n        tempOutlierTreatments(treats)", module_text, fixed = TRUE),
  !grepl('input$classLabelFormat == "full"', module_text, fixed = TRUE),
  # C2 hooks stay in place.
  grepl('lipidomic_hook("qc_3d_textfont")', module_text, fixed = TRUE),
  grepl('lipidomic_hook("qc_plot_outputs")', module_text, fixed = TRUE),
  # Team review code is not in the module.
  !grepl("guided_qc_", module_text, fixed = TRUE),
  !grepl("team_workspace_enabled", module_text, fixed = TRUE))
team_server_text <- paste(readLines("R/frontends/team/qc-server.R", warn = FALSE), collapse = "\n")
stopifnot(!grepl("classicPreparationNotice|applyClassicPreparation", team_server_text),
  grepl("shared_data$request_team_review_preparation", team_server_text, fixed = TRUE))
cat("PASS: Classic QC module unchanged from 4b45a8b; Team review reached only through qc-server.R\n")

# 2. Pending-PCA message helper (production qc_guided_pca_value semantics).
find_assignment <- function(node, target) {
  if (is.call(node) && identical(node[[1]], as.name("<-")) && is.symbol(node[[2]]) &&
      identical(as.character(node[[2]]), target)) return(node)
  if (is.recursive(node)) for (child in as.list(node)) {
    if (missing(child) || is.null(child)) next
    found <- find_assignment(child, target)
    if (!is.null(found)) return(found)
  }
  NULL
}
helper_env <- new.env()
for (expr in parse("R/frontends/team/qc-server.R")) {
  found <- find_assignment(expr, "qc_guided_pca_value")
  if (!is.null(found)) { eval(found, helper_env); break }
}
qc_guided_pca_value <- helper_env$qc_guided_pca_value
stopifnot(is.function(qc_guided_pca_value))
capture <- function(compute) tryCatch(compute(), error = identity)
pending <- capture(function() qc_guided_pca_value(function() shiny::req(FALSE)))
stopifnot(inherits(pending, "shiny.silent.error"),
  grepl("PCA is waiting", conditionMessage(pending), fixed = TRUE))
scientific <- capture(function() shiny::validate(shiny::need(FALSE, "Complete finite measurements are required.")))
stopifnot(identical(capture(function() qc_guided_pca_value(function() stop(scientific))), scientific))
failure <- simpleError("PCA engine failed")
stopifnot(identical(capture(function() qc_guided_pca_value(function() stop(failure))), failure))
cat("PASS: pending PCA gets a visible message; scientific validation and real errors pass through\n")

# 3. Team runtime on synthetic fixtures (production test_guided_qc_readiness flow).
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_TEAM_WORKSPACE = "")
source("R/global.R")
# Production defines this in R/frontends/team/workspace.R (imported separately).
if (!exists("team_workspace_enabled", mode = "function"))
  team_workspace_enabled <- function() identical(Sys.getenv("LIPIDOMIC_TEAM_WORKSPACE"), "1")

controls <- list(normalizationMethod = "none", pcaMode = "omics", maxPCs = 3,
  useImputation = FALSE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = TRUE,
  minDetectionPct = 0, dropNonDetected = TRUE, detectionScope = "global",
  mergeReplicatesMode = "single", dropMisc = FALSE, imputationSeed = 42,
  classLabelFormat = "short", colorGrouping = "Group1", labelParts = "Group1",
  outlierScope = "global", outlierThreshold = 2.5)
names(controls) <- paste0("qc-", names(controls))
matrix_path <- normalizePath("tests/guided-shared/fixtures/abundance.csv")
matrix <- read.csv(matrix_path, check.names = FALSE)
load_fixture <- function(session, hub) {
  do.call(session$setInputs, controls)
  session$setInputs(`hub-files` = data.frame(name = "abundance.csv",
    size = file.info(matrix_path)$size, type = "text/csv", datapath = matrix_path),
    `hub-selectedColumns` = names(matrix)[-1])
  metadata <- read_sample_metadata_file("tests/guided-shared/fixtures/metadata.csv", "metadata.csv")
  hub$set_external_sample_metadata(stage_metadata_v01(metadata, names(matrix)[-1],
    c(Group1 = "Condition", Group2 = "Tissue", PatientNumber = "SubjectID",
      Replicate = "ReplicateID", TimePoint = "TimePoint")), TRUE)
}

pending_pca <- shiny::reactiveVal(FALSE)
review_requests <- character()
app_server <- function(input, output, session) {
  bridge <- shiny::reactiveVal(NULL)
  hub <- shared_data_server("hub", external_settings = bridge,
    preparation_policy = "team", design_check = function() TRUE, root_session = session)
  real_pca <- hub$pca_results
  hub$pca_results <- shiny::reactive({ shiny::req(!pending_pca()); real_pca() })
  # Synthetic stand-in for the shared-data Team review hook (ported separately):
  # it records the intent and runs the ordinary explicit preparation.
  hub$request_team_review_preparation <- function(kind = "entry", ...) {
    review_requests <<- c(review_requests, kind)
    hub$request_preparation_run()
    TRUE
  }
  qc <- qc_boxplot_server("qc", hub, shiny::reactive(list()))
  shiny::observe({ shiny::req(qc()); bridge(qc()) })
  session$userData$hub <- hub
}

shiny::testServer(app_server, {
  hub <- session$userData$hub
  load_fixture(session, hub)
  session$setInputs(`hub-runAnalysis` = 1L)
  for (i in seq_len(12)) session$flushReact()
  stopifnot(identical(hub$preparation_state()$status, "ready"))
  prepared <- hub$data_processed()
  expected <- length(hub$applied_sample_ids())
  stopifnot(grepl("PCA summarizes variation", output[["qc-guided_qc_status"]]$html, fixed = TRUE))
  plot <- jsonlite::fromJSON(output[["qc-guided_qc_plot"]], simplifyVector = FALSE)
  stopifnot(sum(vapply(plot$x$data, function(trace) length(trace$x), integer(1))) == expected)
  # Without the Team workspace, detection keeps the Block B preview card.
  stopifnot(grepl("Preview:", output[["qc-detectionPreview"]]$html, fixed = TRUE))
  pending_pca(TRUE); session$flushReact()
  for (id in c("qc-guided_qc_status", "qc-guided_qc_plot")) {
    message <- capture(function() output[[id]])
    stopifnot(inherits(message, "shiny.silent.error"),
      grepl("PCA is waiting", conditionMessage(message), fixed = TRUE))
  }
  stopifnot(identical(hub$data_processed(), prepared))
  pending_pca(FALSE); session$flushReact()
  stopifnot(grepl("PCA summarizes variation", output[["qc-guided_qc_status"]]$html, fixed = TRUE))
  # Legacy Team review still requires a reason and a confirmation modal.
  id <- names(matrix)[2]
  session$setInputs(`qc-guided_qc_sample` = id); session$flushReact()
  stopifnot(grepl("Review exclusion", output[["qc-guided_qc_selection"]]$html, fixed = TRUE))
  session$setInputs(`qc-guided_qc_propose` = 1L); session$flushReact()
  stopifnot(length(review_requests) == 0L, id %in% names(hub$data_processed()))
})
cat("PASS: Team QC review renders prepared samples, explains pending PCA, and keeps the reasoned legacy flow\n")

# 4. Team workspace single-screen review: explicit Exclude and Undo with run tokens.
Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = "1")
review_requests <- character()
shiny::testServer(app_server, {
  hub <- session$userData$hub
  load_fixture(session, hub)
  session$setInputs(`hub-runAnalysis` = 1L)
  for (i in seq_len(12)) session$flushReact()
  stopifnot(identical(hub$preparation_state()$status, "ready"))
  detection <- output[["qc-detectionPreview"]]$html
  stopifnot(grepl("tw-detection-counts", detection, fixed = TRUE),
    grepl("lipids retained", detection, fixed = TRUE), !grepl("Preview:", detection, fixed = TRUE))
  stopifnot(grepl("PCA summarizes variation", output[["qc-guided_qc_status"]]$html, fixed = TRUE))
  original <- hub$data_processed_unfiltered(); trigger <- hub$run_analysis_trigger()
  id <- names(matrix)[2]
  session$setInputs(`qc-guided_qc_sample` = id); session$flushReact()
  stopifnot(grepl("tw-review-popover", output[["qc-guided_qc_selection"]]$html, fixed = TRUE),
    identical(original, hub$data_processed_unfiltered()), identical(trigger, hub$run_analysis_trigger()))
  session$setInputs(`qc-guided_qc_propose` = 1L)
  for (i in seq_len(8)) session$flushReact()
  stopifnot(identical(review_requests, "exclusion"),
    identical(hub$preparation_state()$status, "ready"), !id %in% names(hub$data_processed_unfiltered()))
  token <- hub$preparation_state()$applied$request_id
  session$setInputs(`qc-guided_qc_undo` = list(sample = id, request_id = "stale-view")); session$flushReact()
  stopifnot(identical(review_requests, "exclusion"), !id %in% names(hub$data_processed_unfiltered()))
  session$setInputs(`qc-guided_qc_undo` = list(sample = id, request_id = token))
  for (i in seq_len(8)) session$flushReact()
  stopifnot(identical(review_requests, c("exclusion", "undo")),
    identical(hub$preparation_state()$status, "ready"), identical(original, hub$data_processed_unfiltered()))
})
cat("PASS: Team workspace review never excludes on selection; Exclude and Undo request preparation and restore exactly\n")
