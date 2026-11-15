# Team's shared analysis settings (Run comparison: differential method, contrast, cutoffs,
# class/chain filters, pathway substrates) are live inputs of the shared data module. Nexo
# offers them on the canvas: the API lists them from Team's own sidebar markup and sets them
# as Team's sidebar would. Preparation controls (sample selection) stay out (phase 2).
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_analysis_settings: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_analysis_settings")
source("frontends/nexo-api/engine.R")
s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
schema <- api_analysis_schema(s)
sections <- vapply(schema$sections, `[[`, character(1), "title")
for (title in c("Differential Expression", "Lipid Class Filters", "Pathway Substrates"))
  if (!title %in% sections) stop("missing section ", title, " (got: ", paste(sections, collapse = ", "), ")")
if ("Sample Selection" %in% sections) stop("sample selection is preparation (phase 2) and must stay out")
controls <- unlist(lapply(schema$sections, `[[`, "controls"), recursive = FALSE)
ids <- vapply(controls, `[[`, character(1), "id")
for (id in c("deMethod", "pValueType", "pFilterThreshold", "log2fcThreshold", "deReferenceGroups", "n6_substrates"))
  if (!id %in% ids) stop("missing control ", id)
if (any(c("selectedColumns", "runAnalysis", "selectAll") %in% ids)) stop("preparation or action control listed")
by_id <- stats::setNames(controls, ids)
if (length(by_id$deMethod$options) < 2L) stop("deMethod has no options")
if (length(by_id$deReferenceGroups$options) < 1L) stop("deReferenceGroups (built by renderUI) has no choices")
if (!identical(as.numeric(by_id$log2fcThreshold$value), as.numeric(api_read(s, s$mock$input$`data_hub-log2fcThreshold`))))
  stop("value is not the live input")
cat("PASS analysis settings list Team's sidebar controls with live values and choices\n")

# The differential cutoffs drive the volcano through Team's own code: draw it before and after.
stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
volcano <- api_card_create(s, "volcano_tab-volcanoPlot")
draw <- function() digest::digest(api_card_render(s, volcano$instanceId, 620, 600))
before <- draw()

epoch <- s$epoch %||% 0
s$dirty <- FALSE
result <- api_analysis_update(s, list(log2fcThreshold = 2))
if (!identical(as.numeric(api_read(s, s$mock$input$`data_hub-log2fcThreshold`)), 2)) stop("log2fcThreshold not set")
if (!isTRUE(s$dirty)) stop("session not marked changed")
if (!((s$epoch %||% 0) > epoch)) stop("render epoch not bumped: every card must redraw")
changed <- Filter(function(x) identical(x$id, "log2fcThreshold"), unlist(lapply(result$sections, `[[`, "controls"), recursive = FALSE))
if (!identical(as.numeric(changed[[1L]]$value), 2)) stop("response does not carry the new value")
method <- Filter(function(x) identical(x$id, "deMethod"), unlist(lapply(result$sections, `[[`, "controls"), recursive = FALSE))[[1L]]
if (!identical(as.character(method$value), as.character(by_id$deMethod$default %||% by_id$deMethod$value)))
  stop("untouched settings must carry the value Team's browser sends (the markup default)")
unlabelled <- Filter(function(x) !nzchar(x$label %||% ""), unlist(lapply(result$sections, `[[`, "controls"), recursive = FALSE))
if (length(unlabelled)) stop("controls without a label: ", paste(vapply(unlabelled, `[[`, "", "id"), collapse = ", "))
cat("PASS analysis settings update sets the shared input and redraws every card\n")
if (identical(draw(), before)) stop("volcano did not change with the log2FC cutoff")
cat("PASS the volcano redraws from Team's code with the new cutoff\n")

refused <- function(inputs) tryCatch({ api_analysis_update(s, inputs); FALSE },
  error = function(e) inherits(e, "api_bad_request"))
if (!refused(list(log2fcThreshold = "x"))) stop("bad number accepted")
if (!refused(list(selectedColumns = "S1"))) stop("preparation control accepted")
if (!refused(list(runAnalysis = 1))) stop("action accepted")
if (!refused(list(deMethod = "not-a-method"))) stop("unknown option accepted")
cat("PASS analysis settings refuse bad values, preparation controls and actions\n")

# The changed setting is saved in the checkpoint (Team's own export) and comes back on reopen.
zip <- tempfile(fileext = ".zip"); on.exit(unlink(zip), add = TRUE)
api_read(s, s$shared$export_session_path(zip))
saved <- read_session_archive(zip, include_team_canvas = TRUE)$state$inputs$`data_hub-log2fcThreshold`
if (!identical(as.numeric(saved), 2)) stop("saved checkpoint does not carry the new cutoff")
again <- api_session_open(zip); on.exit(api_session_close(again), add = TRUE)
if (!identical(as.numeric(api_read(again, again$mock$input$`data_hub-log2fcThreshold`)), 2)) stop("reopened session lost the cutoff")
cat("PASS the setting is saved in the checkpoint and restored on reopen\n")
