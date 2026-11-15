# Data-dependent selectors (baseline, groups, classes, lipids) get their choices from the
# module at run time (updateSelectInput / updateCheckboxGroupInput): the browser receives
# them as input messages. The Inspector must offer those same choices.
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_schema_choices: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_schema_choices")
source("frontends/nexo-api/engine.R")
# Parsing what Team's update* functions send: <option>s and checkbox/radio markup.
opts <- api_option_values('<option value="a">Alpha</option><option value="b" selected>Beta</option>')
stopifnot(identical(opts$values, c("a", "b")), identical(opts$labels, c("Alpha", "Beta")), identical(opts$selected, "b"))
boxes <- api_option_values('<div class="checkbox"><label><input type="checkbox" name="x" value="PC"/><span>Phosphatidylcholine</span></label></div><div class="checkbox"><label><input type="checkbox" name="x" value="PE" checked="checked"/><span>PE</span></label></div>')
stopifnot(identical(boxes$values, c("PC", "PE")), identical(boxes$labels, c("Phosphatidylcholine", "PE")))
cat("PASS schema choices parse option and checkbox markup\n")
s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
check <- function(source, ids) {
  card <- api_card_create(s, source)
  controls <- api_card_schema(s, card$instanceId)$controls
  for (id in ids) {
    control <- Filter(function(x) identical(x$id, id), controls)
    if (!length(control)) stop(source, ": no control ", id)
    n <- length(control[[1L]]$options)
    if (n < 1L) stop(source, ": control ", id, " has no choices")
    cat(sprintf("  %s %s: %d choices\n", source, id, n))
  }
}
check("logratio_tab-logratioPlot", c("selectedBaseline"))
check("heatmap_barchart_tab-heatmapPlot", c("heatmap_violin_class_select", "violin_baseline_group"))
check("cell_lipid_plot", c("cell_group_column"))
cat("PASS schema data-dependent selectors carry the module's choices\n")
# Team also narrows a radio's static choices at run time: on a donut, Barchart's Value Mode keeps only the two %
# modes (updateRadioButtons, R/modules/5_barchart_module.R:309-321). The browser shows those two, so the Inspector
# offers those two and refuses an intensity mode with a message (before: all four were offered, and an intensity
# choice was accepted and then silently put back to a % mode by the module).
radio_values <- function(instanceId, id) {
  control <- Filter(function(x) identical(x$id, id), api_card_schema(s, instanceId)$controls)
  if (!length(control)) stop("no control ", id)
  vapply(control[[1L]]$options, function(o) as.character(o$value), character(1))
}
donut <- api_card_create(s, "barchart-donutPlotUnfiltered")
got <- radio_values(donut$instanceId, "barValueMode")
if (!identical(got, c("Absolute (%)", "Normalized (%)"))) stop("donut barValueMode offers: ", paste(got, collapse = " | "))
refused <- tryCatch({ api_card_update(s, donut$instanceId, list(barValueMode = "Absolute (intensity)")); NULL },
  api_bad_request = function(e) conditionMessage(e))
if (is.null(refused) || !grepl("barValueMode", refused)) stop("donut accepted barValueMode = Absolute (intensity)")
bar <- api_card_create(s, "barchart-barPlotUnfiltered")
got <- radio_values(bar$instanceId, "barValueMode")
if (length(got) != 4L) stop("bar barValueMode offers: ", paste(got, collapse = " | "))
cat("PASS schema radio choices narrowed by the module at run time replace the markup's\n")
