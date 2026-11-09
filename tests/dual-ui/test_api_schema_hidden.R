# b11 chart audit (pathway map): Team keeps state in labelless text inputs inside a display:none div
# (R/modules/13_pathway_module.R l.71-77: active_classes_json, custom_nodes_json, added_edges_json,
# removed_edges_json, position_overrides_json). The schema marks such controls `hidden` so Nexo does not draw
# them as fields; a labelled control, or one outside display:none, is not hidden, and a dashboard selection bar
# (hidden text input with data-choices) keeps being shown. R test not run on M1 (no R there).
for (pkg in c("shiny", "jsonlite", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_schema_hidden: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_schema_hidden")
source("R/frontends/api/engine.R")
doc <- xml2::read_html(as.character(shiny::tags$div(
  shiny::tags$div(style = "display: none;",
    shiny::textInput("p-active_classes_json", "", value = "[\"TG\"]"),
    shiny::textInput("p-custom_nodes_json", "", value = "{}")),
  shiny::radioButtons("p-classLabelFormat", "Class/Origin Name Format:", c("full", "abbr")),
  shiny::textInput("p-add_node_name", "Class Abbreviation:", value = ""),
  shiny::tags$div(style = "display:none", shiny::textInput("p-shown_later", "Shown later:", value = "")))))
parsed <- api_schema_from_doc(doc, "p-")
by_id <- stats::setNames(parsed, vapply(parsed, `[[`, character(1), "id"))
stopifnot(isTRUE(by_id$active_classes_json$hidden), isTRUE(by_id$custom_nodes_json$hidden))
cat("PASS labelless text inputs inside display:none are hidden\n")
stopifnot(is.null(by_id$classLabelFormat$hidden), is.null(by_id$add_node_name$hidden), is.null(by_id$shown_later$hidden))
cat("PASS labelled controls and visible text inputs are not hidden\n")
bar <- xml2::read_html(as.character(shiny::tags$div(style = "display:none",
  shiny::tags$input(id = "p-sel", type = "text", value = "__ALL__", `data-selection-input` = "p-sel",
    `data-choices` = "[\"A\",\"B\"]", `aria-label` = "Lipid classes"))))
sel <- api_schema_from_doc(bar, "p-")[[1L]]
stopifnot(identical(sel$id, "sel"), is.null(sel$hidden))
cat("PASS dashboard selection bars stay shown\n")
