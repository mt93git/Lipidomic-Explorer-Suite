# Runs the real shared hub's Differential analysis on the synthetic browser
# fixture and saves what every DA consumer reads. Run from a source tree root:
#   Rscript fixture_team_da_participant_capture.R <mode> <case> <out.rds> <fixture.csv>
# mode "production": the Team design policy as R/server.R passes it (any tree).
# mode "warning": the same, plus the R/server.R participant-warning wiring.
# case: unique | repeated | absent (no participant column mapped).
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 4L, args[[1L]] %in% c("production", "warning"), args[[2L]] %in% c("unique", "repeated", "absent"))
mode <- args[[1L]]; case <- args[[2L]]; out_path <- args[[3L]]; fixture_path <- args[[4L]]
suppressPackageStartupMessages({
  source("R/global.R"); source("R/sample_metadata_import.R"); source("R/frontends/team/server.R")
  source("R/frontends/team/violin_statistics.R")
  if (mode == "warning") source("R/frontends/team/da_participant_warning.R")
})
fixture <- utils::read.csv(fixture_path, check.names = FALSE)
ids <- names(fixture)[-1]
path <- tempfile(fileext = ".csv"); utils::write.csv(fixture, path, row.names = FALSE)
md <- data.frame(SampleID = ids, Condition = rep(c("Control", "Treatment"), each = 4), Tissue = "Reference tissue",
                 Patient = if (case == "repeated") rep(sprintf("P%02d", 1:4), 2) else sprintf("P%02d", 1:8), stringsAsFactors = FALSE)
mappings <- c(Group1 = "Condition", Group2 = "Tissue")
if (case != "absent") mappings <- c(mappings, PatientNumber = "Patient") else md$Patient <- NULL
base <- list(useImputation = FALSE, normalizationMethod = "none", imputeZerosPerFile = FALSE, imputeRemainingNAtoZero = TRUE,
             minDetectionPct = 0, dropNonDetected = FALSE, detectionScope = "global", outlierTreatments = list(),
             outlier_trigger = 0, imputationSeed = 42L)
design_policy <- function(paired = FALSE) !isTRUE(paired)
captured <- list()
shiny::testServer(shared_data_server, args = list(external_settings = shiny::reactive(base), preparation_policy = "team",
    design_check = function() TRUE, inference_check = design_policy), {
  session$setInputs(files = data.frame(name = "synthetic.csv", size = file.info(path)$size, type = "text/csv", datapath = path),
                    selectedColumns = ids, useAveragedSubstitution = FALSE)
  session$flushReact(); api <- session$returned
  if (mode == "warning") {
    # Exactly the R/server.R wiring after shared_data_server().
    team_da_reason <- team_group_comparison_participant_reason(api)
    api$team_da_participant_reason <- function() if (isTRUE(api$inference_allowed(FALSE))) team_da_reason() else NULL
  }
  api$set_external_sample_metadata(stage_metadata_v01(md, ids, mappings), TRUE)
  session$flushReact(); session$setInputs(runAnalysis = 1); session$flushReact()
  stopifnot(preparation$state()$status == "ready")
  for (fc in c(1, 0.5)) {
    session$setInputs(deReferenceGroups = "Control", deComparisonGroups = "Treatment", deOrientGroup1 = TRUE, deOrientGroup2 = FALSE,
                      deMethod = "auto", pValueType = "adjusted", pFilterThreshold = 0.05, log2fcThreshold = fc)
    session$flushReact()
    captured[[as.character(fc)]] <<- list(
      de_results = api$de_results(), significant_lipids = api$significant_lipids(), de_settings = api$de_settings(),
      de_contrast_info = api$de_contrast_info(), actual_de_method = api$actual_de_method(),
      inference_unpaired = api$inference_allowed(FALSE), inference_paired = api$inference_allowed(TRUE),
      data_processed = api$data_processed())
  }
  if (mode == "warning") captured$team <<- list(reason = api$team_da_participant_reason(),
    hub = list(annotationData = api$annotationData(), global_filtered_lipids = api$global_filtered_lipids(),
      class_color_map = tryCatch(api$class_color_map(), error = function(e) NULL), origin_color_map = tryCatch(api$origin_color_map(), error = function(e) NULL)),
    banner = as.character(htmltools::renderTags(team_de_banner_participant_warning_adapter(function(sd) "original banner")(api))$html))
})
saveRDS(captured, out_path)
cat("captured", mode, case, "\n")
