# Nexo Feature 1: a card's module buttons (Team's "Data & settings" dialog shows the whole module UI,
# so they are live there) are listed with their visible label and tab, and a dialog the module opens
# with showModal comes back from PATCH as {title, html}. R test not run on M1 (no R there).
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_schema_actions: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_schema_actions")
source("frontends/nexo-api/engine.R")
# The label is the button's own text: never its tooltip (bslib::tooltip text sits inside the button).
doc <- xml2::read_html(as.character(shiny::tags$div(class = "tab-pane", `data-value` = "Plot",
  shiny::actionButton("p-go", shiny::tags$span("Show Statistic Detail",
    bslib::tooltip(shiny::icon("circle-info"), "Calculates the statistical details."))))))
parsed <- api_schema_from_doc(doc, "p-")
stopifnot(length(parsed) == 1L, identical(parsed[[1L]]$type, "action"),
  identical(parsed[[1L]]$label, "Show Statistic Detail"), identical(parsed[[1L]]$group, "Plot"))
cat("PASS action label is the button text without its tooltip\n")
s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
action_of <- function(schema, label) {
  hit <- Filter(function(a) identical(a$label, label), schema$actionControls)
  if (!length(hit)) stop("no action labelled ", label, "; have: ",
    paste(vapply(schema$actionControls, function(a) a$label %||% "<null>", character(1)), collapse = " | "))
  hit[[1L]]
}
check_actions <- function(schema) {
  ids <- vapply(schema$actionControls, `[[`, character(1), "id")
  # `actions` (ids only) stays for older clients and lists the same buttons.
  stopifnot(length(ids) > 0L, !anyDuplicated(ids), setequal(ids, unlist(schema$actions)),
    all(vapply(schema$actionControls, function(a) is.character(a$label) && nzchar(a$label), logical(1))),
    all(vapply(schema$actionControls, function(a) is.null(a$tab) || is.character(a$tab), logical(1))))
  json <- jsonlite::toJSON(schema$actionControls, auto_unbox = TRUE, null = "null")
  stopifnot(grepl('"tab"', json, fixed = TRUE))
}
qc <- api_card_create(s, "qc_pca_tab-pca2dPlot")
qc_schema <- api_card_schema(s, qc$instanceId)
check_actions(qc_schema)
detail <- action_of(qc_schema, "Show Statistic Detail")
stopifnot(identical(detail$id, "show_stats_detail"))
cat("PASS QC lists Show Statistic Detail with its label\n")
structural <- api_card_create(s, "structural_tab-summaryPlot")
structural_schema <- api_card_schema(s, structural$instanceId)
check_actions(structural_schema)
run <- action_of(structural_schema, "Initiate Structural Analysis")
stopifnot(identical(run$id, "runAnalysis"))
cat("PASS structural lists Initiate Structural Analysis\n")
# A click that opens a Shiny modal returns it; a click that does not returns no modal.
reply <- api_card_update(s, qc$instanceId, list(), detail$id)
stopifnot(is.list(reply$modal), is.character(reply$modal$title), nzchar(reply$modal$title),
  is.character(reply$modal$html), length(reply$modal$html) == 1L)
cat(sprintf("PASS QC Show Statistic Detail returns a modal titled '%s' (%d chars of body)\n",
  reply$modal$title, nchar(reply$modal$html)))
again <- api_card_update(s, qc$instanceId, list(), character())
stopifnot(is.null(again$modal))
cat("PASS an update without a dialog returns no modal\n")
