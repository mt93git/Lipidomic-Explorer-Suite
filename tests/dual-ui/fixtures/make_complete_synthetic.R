# Builds tests/dual-ui/fixtures/nexo-complete-synthetic.zip: a fully synthetic Team
# checkpoint rich enough for every Nexo catalog plot (docs/integration/nexo-complete-fixture.md).
# No real data: every value comes from set.seed(20261106).
#
# The checkpoint is written by Team's own code. shared_data_server receives the abundance
# CSV, the Team metadata snapshot and runAnalysis, then output$export_session_btn
# (export_session_path) writes the ZIP. This is the recipe of tests/dual-ui/test_cross_zip.R
# (make_archive("team")). No archive JSON is written by hand.
#
# Run from the repository root:
#   Rscript tests/dual-ui/fixtures/make_complete_synthetic.R [out.zip] [--verify]
# --verify opens the ZIP through the headless API (frontends/nexo-api) and renders the 14
# outputs that the classic-seed7 checkpoint leaves gated or silent, with the per-card
# inputs and actions listed in the doc. It never contacts a running server.

args <- commandArgs(trailingOnly = TRUE)
verify <- "--verify" %in% args
args <- setdiff(args, "--verify")
out <- if (length(args)) args[[1L]] else "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"

Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
set.seed(20261106)

# ---- Design: 2 conditions x 3 time points x 4 subjects = 24 samples -------------------
# One sample per subject (P01-P24): the design is honestly "independent", so Team's
# unpaired DE runs and no participant repeats withhold p-values (group_comparison.R:139-181).
conditions <- c("Control", "Treatment")
times <- c("T1", "T2", "T3")
design <- expand.grid(rep = 1:4, TimePoint = times, Condition = conditions, stringsAsFactors = FALSE)
design$SampleID <- sprintf("S%02d", seq_len(nrow(design)))
design$SubjectID <- sprintf("P%02d", seq_len(nrow(design)))
metadata <- data.frame(SampleID = design$SampleID, Condition = design$Condition,
  Tissue = "Synthetic plasma", SubjectID = design$SubjectID, ReplicateID = "1",
  TimePoint = design$TimePoint, Batch = "Run A", SampleType = "study", stringsAsFactors = FALSE)

# ---- Lipids: chain-resolved names so the parser fills nCchain1/2 (R/global.R:1013-1028) --
# Per diacyl class, 6 "down" species (short, saturated) and 6 "up" species (long,
# polyunsaturated): structural_tab needs >= 3 species enriched on each side per class
# (minClassSize = 3, 8_structural_module.R:1978-1992) and a chain-length difference
# between the two sets for its feature tests.
down_chains <- c("16:0/16:0", "16:0/16:1", "16:0/18:0", "18:0/16:0", "16:0/18:1", "18:0/16:1")
up_chains <- c("18:1/20:4", "18:0/22:6", "20:4/20:4", "18:2/20:4", "18:1/22:6", "20:5/22:6")
diacyl <- c("PC", "PE", "PI", "PS")
lipids <- list()
for (cls in diacyl) {
  lipids[[length(lipids) + 1L]] <- data.frame(name = sprintf("%s(%s)", cls, down_chains), effect = -1.5)
  lipids[[length(lipids) + 1L]] <- data.frame(name = sprintf("%s(%s)", cls, up_chains), effect = 1.5)
}
# TG sorts first among subclasses (GL_TAG), so it is structural_grid's default lipid_class
# (12_structural_grid_module.R:283-299). Three chains; Team parses the first two (R/global.R:1022-1028).
lipids[[length(lipids) + 1L]] <- data.frame(name = sprintf("TG(%s_18:1)", sub("/", "_", down_chains)), effect = -1.5)
lipids[[length(lipids) + 1L]] <- data.frame(name = sprintf("TG(%s_18:1)", sub("/", "_", up_chains)), effect = 1.5)
# Unchanged classes keep sphingolipid and lyso views populated.
lipids[[length(lipids) + 1L]] <- data.frame(effect = 0, name = c(
  "SM(d18:1/16:0)", "SM(d18:1/18:0)", "SM(d18:1/24:0)", "SM(d18:1/24:1)",
  "Cer(d18:1/16:0)", "Cer(d18:1/22:0)", "Cer(d18:1/24:0)", "Cer(d18:1/24:1)",
  "LPC(16:0)", "LPC(18:0)", "LPC(18:1)", "LPC(20:4)",
  "LPE(16:0)", "LPE(18:0)", "LPE(18:1)", "LPE(22:6)"))
lipids <- do.call(rbind, lipids)
stopifnot(!anyDuplicated(lipids$name), nrow(lipids) == 76L)

# ---- Abundances: log2 scale, no zeros or missing values -------------------------------
# Treatment shifts each changed species by +/-1.5 log2 (|log2FC| >= 1 at BH p <= 0.05,
# the data_hub defaults, 1_shared_data_module.R:4479-4489). A mild time trend
# (0 / 0.3 / 0.6 log2 on "up" species) gives the longitudinal views a visible slope.
treat <- as.numeric(design$Condition == "Treatment")
time_step <- match(design$TimePoint, times) - 1
base <- runif(nrow(lipids), 10, 16)
log2_values <- t(vapply(seq_len(nrow(lipids)), function(i) {
  base[[i]] + lipids$effect[[i]] * treat + 0.3 * time_step * (lipids$effect[[i]] > 0) +
    rnorm(nrow(design), 0, 0.25)
}, numeric(nrow(design))))
abundance <- data.frame(Lipid_Name = lipids$name, round(2^log2_values, 4), check.names = FALSE)
names(abundance)[-1L] <- design$SampleID

work <- tempfile("nexo-complete-"); dir.create(work)
abundance_path <- file.path(work, "abundance.csv")
metadata_path <- file.path(work, "metadata.csv")
utils::write.csv(abundance, abundance_path, row.names = FALSE)
utils::write.csv(metadata, metadata_path, row.names = FALSE)

# ---- Team preparation and export (test_cross_zip.R:11-23, 35-69) ----------------------
ids <- design$SampleID
md <- read_sample_metadata_file(metadata_path, basename(metadata_path))
team_snapshot <- list(
  data = data.frame(FullName = md$SampleID, md[setdiff(names(md), "SampleID")],
    check.names = FALSE, stringsAsFactors = FALSE),
  mappings = c(Group1 = "Condition", Group2 = "Tissue", PatientNumber = "SubjectID",
    Replicate = "ReplicateID", TimePoint = "TimePoint"),
  id_column = "SampleID")
settings <- list(minDetectionPct = 0, dropNonDetected = TRUE, detectionScope = "global",
  useImputation = FALSE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = FALSE,
  normalizationMethod = "none", imputationSeed = 7L, outlierTreatments = list())

exported <- NULL
shiny::testServer(shared_data_server, args = list(
  external_settings = shiny::reactive(settings), design_check = function() TRUE,
  preparation_policy = "team"), {
    session$flushReact()
    session$setInputs(files = data.frame(name = "abundance.csv", size = file.info(abundance_path)$size,
      type = "text/csv", datapath = abundance_path, stringsAsFactors = FALSE), selectedColumns = ids)
    session$flushReact()
    api <- session$returned
    api$set_external_sample_metadata(team_snapshot)
    session$flushReact()
    # With time points present Team turns on "Group by Time Point" (again on every restore,
    # 1_shared_data_module.R:1886-1888) and the default contrast becomes Control_T1 vs
    # Control_T2 (4411-4418). The archived DE groups pin the condition contrast the filtered
    # and structural views are built on: every Treatment time point against every Control one.
    session$setInputs(deOrientGroup1 = TRUE, deOrientGroup2 = FALSE, deOrientTimePoint = TRUE,
      deComparisonMode = "direct", deReferenceGroups = paste0("Control_", times),
      deComparisonGroups = paste0("Treatment_", times))
    session$flushReact()
    session$setInputs(runAnalysis = 1L)
    session$flushReact()
    prepared <- api$data_processed_unfiltered()
    applied <- api$preparation_state()$applied
    stopifnot(is.data.frame(prepared), nrow(prepared) == nrow(lipids),
      !is.null(applied$spec$settings), !is.null(applied$spec$selected))
    meta <- api$all_metadata()
    stopifnot(length(unique(meta$TimePoint[meta$TimePoint != "Unspecified"])) == 3L)
    path <- output$export_session_btn
    exported <<- tempfile(fileext = ".zip")
    stopifnot(file.copy(path, exported, overwrite = TRUE))
  })
dir.create(dirname(out), showWarnings = FALSE, recursive = TRUE)
stopifnot(file.copy(exported, out, overwrite = TRUE))
archive <- read_session_archive(out, metadata_decoder = team_metadata_sidecar_decode)
stopifnot(identical(archive$shared$version, "1"), !is.null(archive$shared$applied$spec$settings))
unlink(archive$directory, recursive = TRUE)
unlink(c(work, exported), recursive = TRUE)
cat(sprintf("WROTE %s (%d lipids x %d samples, sha256 %s)\n", out, nrow(lipids), length(ids),
  digest::digest(file = out, algo = "sha256")))

# ---- Optional: render the 14 previously gated/silent outputs through the headless API --
if (verify) {
  source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("make_complete_synthetic")
  source("frontends/nexo-api/engine.R")
  s <- api_session_for_checkpoint(out)
  api_design(s, "Animal", "independent", TRUE)
  # inputs = per-card values at creation; steps = api_card_update calls afterwards.
  # reseed = re-run the API's renderUI seeding after an action (the selectors that the
  # action creates are filled only at creation, cards.R:79 / cards.R:219-241).
  plans <- list(
    `qc_pca_tab-pca2dVectorPlot` = list(inputs = list(smartLabelPCA2D = FALSE)),
    # The pcaMode observer turns the labels back on while the card is created
    # (2_qc_boxplot_module.R:733-743); switching them off afterwards sticks.
    `qc_pca_tab-load2dVectorPlot` = list(update = list(smartLabelLoad2D = FALSE, showSingleLipidNames = FALSE)),
    # Team bug, not data: the filtered donut passes `ncols`, which that block never defines
    # (5_barchart_module.R donutPlotFiltered; the unfiltered donut defines it). Expected to fail.
    `barchart-barPlotFiltered` = list(), `barchart-donutPlotFiltered` = list(team_bug = TRUE),
    `heatmap_barchart_tab-filteredHeatmapPlot` = list(), `heatmap_barchart_tab-filteredHeatmapSDPlot` = list(),
    `structural_tab-summaryPlot` = list(steps = list("runAnalysis")),
    `structural_tab-speciesPlotPlot` = list(steps = list("runAnalysis", "updateSpecies"), reseed = TRUE),
    `structural_grid_tab-heatmapPlot` = list(), `structural_grid_tab-dotplotPlot` = list(),
    `longitudinal_tab-macroclass_plot` = list(steps = list("submit_longitudinal_btn"), reseed = TRUE),
    `longitudinal_tab-subclass_plot` = list(steps = list("submit_longitudinal_btn"), reseed = TRUE),
    `longitudinal_tab-index_plot` = list(steps = list("submit_longitudinal_btn"), reseed = TRUE),
    `longitudinal_tab-struct_plot` = list(steps = list("submit_longitudinal_btn"), reseed = TRUE))
  failures <- 0L
  for (id in names(plans)) {
    plan <- plans[[id]]
    result <- tryCatch({
      card <- api_card_create(s, id, inputs = plan$inputs %||% list())
      if (length(plan$update)) api_card_update(s, card$instanceId, inputs = plan$update)
      for (action in plan$steps %||% list()) {
        api_card_update(s, card$instanceId, actions = action)
        if (isTRUE(plan$reseed)) api_seed_rendered_inputs(s, card$instanceId)
      }
      api_card_render(s, card$instanceId, 800, 600)
      "render"
    }, error = function(e) paste("NOT RENDERED:", conditionMessage(e)))
    if (isTRUE(plan$team_bug)) result <- paste("TEAM BUG (expected):", result)
    else if (!identical(result, "render")) failures <- failures + 1L
    cat(sprintf("%s %s\n", id, result))
  }
  api_session_close(s)
  cat(sprintf("VERIFY %d of %d rendered (the Team-bug donut excluded)\n", length(plans) - 1L - failures, length(plans) - 1L))
  if (failures) quit(status = 1L)
}
