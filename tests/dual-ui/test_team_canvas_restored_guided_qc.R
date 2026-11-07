# A restored checkpoint's guided QC copy is created progressively, after the PCA it
# reads is ready (the eager restore created it before). Its host's controls report
# their first values before the saved ones are applied; classLabelFormat first
# reports NULL. The copy must still compute from its saved settings, as the eager
# restore's copy did, and not stop on `if (input$classLabelFormat == "full")`
# (R/modules/2_qc_boxplot_module.R, plot_data), which failed the restore.
# Saved inputs: the guided QC instance of a real checkpoint (staging livecheck shape).
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/global.R")
source("R/frontends/team/plot_instances.R")
source("R/frontends/team/canvas_state.R")

controls <- list(normalizationMethod = "none", pcaMode = "omics", maxPCs = 3,
  useImputation = FALSE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = TRUE,
  minDetectionPct = 0, dropNonDetected = FALSE, detectionScope = "global",
  mergeReplicatesMode = "single", dropMisc = FALSE, imputationSeed = 42,
  classLabelFormat = "short", colorGrouping = "Group1", labelParts = "Group1",
  outlierScope = "global", outlierThreshold = 2.5)
names(controls) <- paste0("qc_pca_tab-", names(controls))
saved <- list(main_tabs = "PCA Score Plots", bqc_display_tabs = "CoV Density", outlierScope = "global",
  corrMethod = "pearson", outlierNumShow = 30, bqcCovThreshold = 20, scoreMarkerSize2D = 8,
  scoreTextSize2D = 4, scoreMarkerSize3D = 8, loadMarkerSize2D = 8, loadTextSize2D = 4,
  loadMarkerSize3D = 14, repelForcePCA2D = 30, repelBoxPadPCA2D = 0.35, repelPointPadPCA2D = 0.35,
  repelForceLoad2D = 20, repelBoxPadLoad2D = 0.35, repelPointPadLoad2D = 0.35, corrLabelSize = 8,
  mergeReplicatesMode = "single", classLabelFormat = "short", shapeGrouping = "Group2",
  colorGrouping = list("Group1"), labelParts = list("Group1"), team_pca2dPlot_vector = FALSE,
  team_load2dPlot_vector = FALSE, filterBqcOutliers = FALSE, useCustomColors = FALSE, useShapes = FALSE,
  showSingleLipidNames = TRUE, addFrame2D = FALSE, showLabels3D = TRUE, smartLabelPCA2D = TRUE,
  smartLabelLoad2D = TRUE, corrCluster = TRUE, corrShowLabels = TRUE, outlierThreshold = 2.5,
  bqcPattern = "BQC")
id <- "tcinstance_guidedqc_restore"
instance <- list(id = id, source = "qc_pca_tab-guided_qc_plot", inputs = saved)
node <- list(id = paste0(id, "-guided_qc_plot"), label = "Guided quality check", x = 10, y = 10,
  width = 620, height = 720, visual = list(), instance = instance)

# Each copy's module sees its inputs through the instance's fallback view; record
# that view so the test reads exactly what the module reads.
probe <- new.env()
real_qc_boxplot_server <- qc_boxplot_server
qc_boxplot_server <- function(id, ...) {
  if (startsWith(id, "tcinstance_")) shiny::moduleServer(id, function(input, output, session) assign(id, input, probe))
  real_qc_boxplot_server(id, ...)
}
app_server <- function(input, output, session) {
  bridge <- shiny::reactiveVal(NULL)
  shared <- shared_data_server("data_hub", external_settings = bridge,
    preparation_policy = "team", design_check = function() TRUE, root_session = session)
  qc <- qc_boxplot_server("qc_pca_tab", shared, shiny::reactive(list()))
  shiny::observe({ shiny::req(qc()); bridge(qc()) })
  team_canvas_server(input, output, session, shared)
  team_plot_instances_server(input, output, session, shared, shared)
  session$userData$shared <- shared
}

messages <- list()
shiny::testServer(app_server, {
  session$sendCustomMessage <- function(type, message) messages[[length(messages) + 1L]] <<- list(type = type, message = message)
  do.call(session$setInputs, controls)
  matrix_path <- normalizePath("tests/guided-shared/fixtures/abundance.csv")
  metadata <- read_sample_metadata_file("tests/guided-shared/fixtures/metadata.csv", "metadata.csv")
  matrix <- read.csv(matrix_path, check.names = FALSE)
  session$setInputs(`data_hub-files` = data.frame(name = "abundance.csv",
    size = file.info(matrix_path)$size, type = "text/csv", datapath = matrix_path),
    `data_hub-selectedColumns` = names(matrix)[-1])
  session$userData$shared$set_external_sample_metadata(stage_metadata_v01(metadata,
    names(matrix)[-1], c(Group1 = "Condition", Group2 = "Tissue",
      PatientNumber = "SubjectID", Replicate = "ReplicateID", TimePoint = "TimePoint")), TRUE)
  session$setInputs(`data_hub-runAnalysis` = 1L)
  for (i in seq_len(12)) session$flushReact()
  stopifnot(identical(session$userData$shared$preparation_state()$status, "ready"),
    nrow(session$userData$shared$pca_results()$replicate_score_df) > 0L)

  # Restore a checkpoint holding the guided QC copy; it waits for its request.
  session$userData$team_canvas_import(list(version = "1", libraryHidden = FALSE, nodes = list(node)))
  session$flushReact()
  stopifnot(identical(session$userData$team_canvas_restored_pending(), id))

  # The host's controls report their first values (classLabelFormat: NULL) before
  # the saved values are applied, then the browser requests the copy.
  first <- lapply(saved, function(v) if (is.list(v)) unlist(v) else v)
  first["classLabelFormat"] <- list(NULL)
  names(first) <- paste0(id, "-", names(first))
  do.call(session$setInputs, c(first, list(`tcinstance_guidedqc_restore-openOutlierManager` = 0L)))
  session$setInputs(team_canvas_instance_create = list(id = id, source = instance$source, inputs = saved, request = "r1"))
  for (i in seq_len(4)) session$flushReact()
  errors <- Filter(function(m) identical(m$type, "team-canvas-instance-error"), messages)
  if (length(errors)) stop("restored guided QC copy failed: ", errors[[1]]$message$message)
  ready <- Filter(function(m) identical(m$type, "team-canvas-instance-ready") && identical(m$message$id, id), messages)
  stopifnot(length(ready) == 1L, identical(ready[[1]]$message$request, "r1"),
    identical(ready[[1]]$message$inputs$classLabelFormat, "short"))
  plot <- jsonlite::fromJSON(output[[paste0(id, "-guided_qc_plot")]], simplifyVector = FALSE)
  stopifnot(length(plot$x$data) > 0L)

  # The browser then applies the saved value; the copy settles and keeps working.
  session$setInputs(`tcinstance_guidedqc_restore-classLabelFormat` = "short")
  for (i in seq_len(3)) session$flushReact()
  stopifnot(any(vapply(messages, function(m) identical(m$type, "team-canvas-instance-settled") && identical(m$message$id, id), logical(1))),
    !length(Filter(function(m) identical(m$type, "team-canvas-instance-error"), messages)))

  # Cancel a restored copy before it settles (labelParts has reported only NULL),
  # restore the same checkpoint again, let it settle, then clear the labels: the
  # module must read the analyst's NULL, not the first restore's saved labels.
  id2 <- "tcinstance_guidedqc_again"
  instance2 <- list(id = id2, source = instance$source, inputs = saved)
  node2 <- node; node2$id <- paste0(id2, "-guided_qc_plot"); node2$instance <- instance2
  checkpoint2 <- list(version = "1", libraryHidden = FALSE, nodes = list(node2))
  report <- function(values) { names(values) <- paste0(id2, "-", names(values)); do.call(session$setInputs, values) }
  settled2 <- function() sum(vapply(messages, function(m) identical(m$type, "team-canvas-instance-settled") && identical(m$message$id, id2), logical(1)))
  first2 <- lapply(saved, function(v) if (is.list(v)) unlist(v) else v)
  first2["labelParts"] <- list(NULL)
  session$userData$team_canvas_import(checkpoint2); session$flushReact()
  report(first2)
  session$setInputs(team_canvas_instance_create = list(id = id2, source = instance$source, inputs = saved, request = "r2"))
  for (i in seq_len(3)) session$flushReact()
  view <- get(id2, probe)
  stopifnot(identical(shiny::isolate(view$labelParts), "Group1"), settled2() == 0L)
  session$setInputs(team_canvas_instance_park = id2); session$flushReact()
  session$userData$team_canvas_import(checkpoint2); session$flushReact()
  session$setInputs(team_canvas_instance_create = list(id = id2, source = instance$source, inputs = saved, request = "r3"))
  for (i in seq_len(3)) session$flushReact()
  stopifnot(identical(shiny::isolate(view$labelParts), "Group1"))
  report(list(labelParts = "Group1")); for (i in seq_len(3)) session$flushReact()
  stopifnot(settled2() == 1L)
  report(list(labelParts = NULL)); for (i in seq_len(3)) session$flushReact()
  if (!is.null(shiny::isolate(view$labelParts))) stop("after a second restore settled, cleared labels still read ", paste(shiny::isolate(view$labelParts), collapse = ","))
  # An analyst copy of the namespace never masks a NULL.
  session$setInputs(team_canvas_instance_create = list(id = id2, source = instance$source, inputs = list(labelParts = "Group1"), request = "r4"))
  session$flushReact()
  stopifnot(is.null(shiny::isolate(view$labelParts)))
})

# After a control has reported a value (or the copy has settled), a NULL it reports
# is the analyst's (e.g. every checkbox cleared) and is kept, as before.
values <- shiny::reactiveValues()
impl <- .subset2(values, "impl")
impl$set("c-labelParts", NULL)
view <- function(pending) structure(list(impl = impl, ns = function(name) paste0("c-", name),
  team_fallback = list(labelParts = "Group1"), team_pending = pending), class = "team_plot_instance_input")
stopifnot(identical(team_plot_instance_fallback_value(view(function(name) TRUE), "labelParts", NULL), "Group1"),
  is.null(team_plot_instance_fallback_value(view(function(name) FALSE), "labelParts", NULL)),
  is.null(team_plot_instance_fallback_value(view(NULL), "labelParts", NULL)))
cat("PASS: a progressively restored guided QC copy computes from its saved settings while its controls first report NULL, settles, and keeps later NULL reports, also after a cancelled restore is restored again\n")
