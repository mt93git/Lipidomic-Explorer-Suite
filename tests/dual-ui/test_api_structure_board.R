for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_structure_board")
source("frontends/nexo-api/engine.R")
# NEXO-P7: a synthetic two-canvas Structure board saved by Team (design: Animal, independent).
fixture <- "tests/dual-ui/fixtures/team-structure-board-synthetic.zip"
figure_text <- function(rendered) as.character(jsonlite::toJSON(rendered$figure$data, auto_unbox = TRUE))
render <- function(s, id) {
  card <- api_card_create(s, id)
  api_card_render(s, card$instanceId, 800, 600)
}
# Team draws this board on resume: its workspace takes the restored unit and relationship as the reviewed design
# (R/guided_workflow.R design_issues, R/server.R inference_check), so Nexo opens it confirmed too.
local({
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  design <- api_design_state(s)
  stopifnot(isTRUE(design$allowed), isTRUE(design$confirmed), identical(design$unit, "Animal"), identical(design$type, "independent"))
  cat("PASS open of Team's board: inference allowed with the design Team saved\n")
  rendered <- render(s, "structural_grid_tab-diffAllPlot")
  stopifnot(identical(rendered$render, "plotly"), !grepl("Select Cohorts to Compare", figure_text(rendered), fixed = TRUE))
  cat("PASS open of Team's board: the Structural grid differential overview draws without a design step\n")
})
local({
  s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
  on.exit(api_session_close(s))
  design <- api_design_state(s)
  stopifnot(!isTRUE(design$allowed), !isTRUE(design$confirmed))
  cat("PASS a checkpoint saved without a design still asks for one\n")
})
local({
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  # R/modules/8_structural_module.R asks lipidomic_hook("inference_allowed") (Team: R/frontends/team/hooks/networks.R).
  api_design(s, "Animal", "independent", FALSE)
  rendered <- render(s, "structural_tab-moduleTraitPlot")
  stopifnot(identical(rendered$render, "plotly"),
    grepl("Module-trait relationships require a confirmed<br />independent study design.", figure_text(rendered), fixed = TRUE))
  cat("PASS module-trait card shows Team's message without a confirmed design\n")
  api_design(s, "Animal", "independent", TRUE)
  rendered <- render(s, "structural_tab-moduleTraitPlot")
  types <- vapply(rendered$figure$data, function(t) t$type %||% "", character(1))
  stopifnot(identical(rendered$render, "plotly"), "heatmap" %in% types,
    !grepl("require a confirmed", figure_text(rendered), fixed = TRUE))
  cat("PASS module-trait card draws its Plotly heatmap once the design is confirmed\n")
})
# NEXO-P9 1: a correlation network with nothing to draw leaves module-trait without inputs (a silent req() in Team, which
# shows no plot). The 422 is a note, not a failure Nexo would retry and show as "Couldn't bring back".
local({
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  card <- api_card_create(s, "structural_tab-moduleTraitPlot", list(networkThresh = 0.99))
  e <- tryCatch({ api_card_render(s, card$instanceId, 800, 600); NULL }, api_unprocessable = function(e) e)
  if (is.null(e)) stop("module-trait drew although the network has no edges at |r| >= 0.99")
  if (!isTRUE(e$note)) stop("module-trait without network inputs is answered as an error, not a note: ", conditionMessage(e))
  cat("PASS module-trait without network inputs answers a note:", conditionMessage(e), "\n")
})
