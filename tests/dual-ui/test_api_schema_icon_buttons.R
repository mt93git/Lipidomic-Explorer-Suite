# Chart audit b10-longitudinal #4: Team's time-course designer has icon-only buttons (an × beside "Timecourse 1",
# R/modules/11_longitudinal_module.R:1305, actionButton(ns(paste0("btn_del_case_", c$id)), "", icon = icon("times"))).
# The schema named them by their input id, so Nexo's Data tab showed "btn_del_case_case_127072". An icon-only button
# is named as a sighted user reads it: the icon's action and the text beside it. R test not run on M1 (no R there).
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_schema_icon_buttons: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_schema_icon_buttons")
source("frontends/nexo-api/engine.R")
row <- function(i, id, icon) shiny::tags$div(class = "card-header d-flex",
  shiny::tags$span(paste0("Timecourse ", i)), shiny::actionButton(paste0("p-", id), "", icon = shiny::icon(icon)))
doc <- xml2::read_html(as.character(shiny::tags$div(class = "tab-pane", `data-value` = "Design",
  row(1, "btn_del_case_case_1", "times"), row(2, "btn_del_case_case_2", "trash"),
  shiny::actionButton("p-btn_add_case", "Add Timecourse", icon = shiny::icon("plus")),
  shiny::actionButton("p-lonely", "", icon = shiny::icon("gear")))))
parsed <- api_schema_from_doc(doc, "p-")
label <- function(id) { hit <- Filter(function(x) identical(x$id, id), parsed); if (length(hit)) hit[[1L]]$label else "<missing>" }
stopifnot(identical(label("btn_del_case_case_1"), "Remove Timecourse 1"))
stopifnot(identical(label("btn_del_case_case_2"), "Remove Timecourse 2"))
# Buttons with their own text keep it (the icon adds nothing); an icon Nexo cannot name keeps the old fallback.
stopifnot(identical(label("btn_add_case"), "Add Timecourse"))
stopifnot(is.null(label("lonely")) || identical(label("lonely"), "lonely") || !grepl("^Remove", label("lonely")))
cat("PASS icon-only buttons are named by their icon's action and the text beside them\n")
