for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
# Keep one readable result per output; module chatter is retained in a log.
diagnostics <- tempfile("api-render-all-", fileext = ".log")
cat("Diagnostics:", diagnostics, "\n")
sink(diagnostics)
status <- tryCatch({
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_render_all")
source("R/frontends/api/engine.R")
# NEXO_RENDER_FIXTURE=complete uses the complete synthetic fixture (docs/integration/nexo-complete-fixture.md),
# where every catalog plot draws once its per-card steps run; the only expected failure is Team's own
# filtered-donut bug.
complete <- identical(Sys.getenv("NEXO_RENDER_FIXTURE"), "complete")
fixture <- if (complete) "tests/dual-ui/fixtures/nexo-complete-synthetic.zip" else "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
plans <- if (complete) list(
  `qc_pca_tab-pca2dVectorPlot` = list(inputs = list(smartLabelPCA2D = FALSE)),
  `qc_pca_tab-load2dVectorPlot` = list(update = list(smartLabelLoad2D = FALSE, showSingleLipidNames = FALSE)),
  `structural_tab-speciesPlotPlot` = list(steps = c("runAnalysis", "updateSpecies"), reseed = TRUE),
  `longitudinal_tab-macroclass_plot` = list(steps = "submit_longitudinal_btn", reseed = TRUE),
  `longitudinal_tab-subclass_plot` = list(steps = "submit_longitudinal_btn", reseed = TRUE),
  `longitudinal_tab-index_plot` = list(steps = "submit_longitudinal_btn", reseed = TRUE),
  `longitudinal_tab-struct_plot` = list(steps = "submit_longitudinal_btn", reseed = TRUE)) else list()
team_bugs <- if (complete) "barchart-donutPlotFiltered" else character()
  s <- api_session_for_checkpoint(fixture)
  api_design(s, "Animal", "independent", TRUE)
  entries <- api_catalog()
  expected <- sum(vapply(team_plot_instance_families, function(x) length(x$outputs), integer(1))) +
    if (exists("team_cell_instance_outputs")) length(team_cell_instance_outputs) else 0L
  stopifnot(length(entries) == expected)
  counts <- list(render = 0L, gate = 0L, silent = 0L, fail = 0L)
  for (entry in entries) {
    result <- tryCatch({
      plan <- plans[[entry$id]] %||% list()
      card <- api_card_create(s, entry$id, inputs = plan$inputs %||% list())
      if (length(plan$update)) api_card_update(s, card$instanceId, inputs = plan$update)
      # Structural shifts are explicitly action-triggered in the Team catalog.
      if (entry$id %in% c("structural_tab-summaryPlot", "structural_tab-speciesPlotPlot") && !length(plan$steps))
        api_card_update(s, card$instanceId, actions = "runAnalysis")
      for (action in plan$steps %||% character()) {
        api_card_update(s, card$instanceId, actions = action)
        if (isTRUE(plan$reseed)) api_seed_rendered_inputs(s, card$instanceId)
      }
      rendered <- api_card_render(s, card$instanceId, 800, 600)
      if (entry$render == "plotly") stopifnot(length(rendered$figure$data) > 0L)
      if (entry$render == "png") stopifnot(is.raw(rendered$png), length(rendered$png) >= 8L,
        identical(rendered$png[1:8], as.raw(c(137, 80, 78, 71, 13, 10, 26, 10))))
      if (entry$render == "visnetwork") stopifnot(length(rendered$figure$nodes) > 0L)
      if (entry$render == "html") stopifnot(is.list(rendered$figure))
      list(kind = "render", message = "")
    }, error = function(e) {
      message <- if (nzchar(conditionMessage(e))) conditionMessage(e) else paste(class(e), collapse = "/")
      # A module's own validate()/req() message is Team behaviour (the same text
      # Team shows on the card); only unexpected errors fail the run.
      kind <- if (entry$id %in% team_bugs) "gate" else if (!inherits(e, "api_unprocessable")) "fail"
        else if (identical(message, "The plot inputs are unavailable for this session.")) "silent" else "gate"
      list(kind = kind, message = message)
    })
    counts[[result$kind]] <- counts[[result$kind]] + 1L
    sink()
    cat(sprintf("%s %s %s%s\n", if (result$kind == "fail") "FAIL" else "PASS", result$kind, entry$id,
      if (nzchar(result$message)) paste0(" ", gsub("[\r\n]+", " ", result$message)) else ""))
    sink(diagnostics, append = TRUE)
  }
  api_session_close(s)
  sink(); cat(sprintf("SUMMARY rendered=%d gated=%d silent=%d failed=%d of %d\n", counts$render, counts$gate,
    counts$silent, counts$fail, length(entries))); sink(diagnostics, append = TRUE)
  # Regression floor: H1 measured 40 rendered on the RTX; a render -> silent regression must not pass green.
  floor <- if (complete) length(entries) - length(team_bugs) else 40L
  if (counts$render < floor) { cat(sprintf("FAIL rendered count below the floor of %d\n", floor)) }
  if (counts$fail == 0L && counts$render >= floor) 0L else 1L
}, error = function(e) {
  sink(); cat("FAIL render setup", conditionMessage(e), "\n"); sink(diagnostics, append = TRUE)
  1L
})
sink()
quit(status = status)
