# A checkpoint saved by Team holds its cards as Team instances (tcinstance_<time>_<random>)
# and, for older canvases, fixed family nodes with no instance. Reopened in Nexo, every
# saved card must draw on its first request, with its saved inputs, without dirtying.
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_restore_cards: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_restore_cards")
source("R/frontends/api/engine.R")
is_drawn <- function(rendered) if (identical(rendered$render, "png"))
  length(rendered$png) > 8L && identical(rendered$png[1:8], as.raw(c(137, 80, 78, 71, 13, 10, 26, 10))) else
  length(rendered$figure$data) > 0L
# Team keeps a canvas plot setting up to 100000 characters (plot_instances.R); a long
# saved lipid selection must restore, not be refused.
text <- list(list(id = "heat_lipid_selection", type = "text"))
stopifnot(identical(nchar(api_validate_inputs(text, list(heat_lipid_selection = strrep("PC 34:1,", 1250L)))$heat_lipid_selection), 10000L))
refused <- tryCatch(api_validate_inputs(text, list(heat_lipid_selection = strrep("a", 100001L))), error = identity)
stopifnot(inherits(refused, "api_bad_request"))
cat("PASS restore text settings follow Team's 100000-character limit\n")
local({
  root <- tempfile()
  previous <- Sys.getenv(c("LIPIDOMIC_STORAGE_DIR", "LIPIDOMIC_API_WORKSPACE"), unset = NA_character_)
  on.exit({
    unlink(root, recursive = TRUE)
    for (key in names(previous)) if (is.na(previous[[key]])) Sys.unsetenv(key) else
      do.call(Sys.setenv, stats::setNames(list(previous[[key]]), key))
  })
  Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_API_WORKSPACE = "restore-cards")
  s <- api_session_for_checkpoint("tests/dual-ui/fixtures/classic-seed7-synthetic.zip")
  on.exit(api_session_close(s), add = TRUE)
  source <- "qc_pca_tab-pca2dPlot"
  entry <- api_catalog_entry(source)
  # A saved, non-default choice: the first select control with a second option.
  pick <- Filter(function(c) identical(c$type, "select") && length(c$options) >= 2L &&
    as.character(c$id) %in% entry$allowedInputs, entry$inputs)[[1L]]
  values <- vapply(pick$options, function(o) as.character(o$value %||% o), character(1))
  chosen <- setdiff(values, as.character(pick$default %||% ""))[[1L]]
  team_id <- "tcinstance_mw45phge_6gwfo69f"
  saved_inputs <- stats::setNames(list(chosen), pick$id)
  nodes <- list(
    list(kind = "plot", id = paste0(team_id, "-pca2dPlot"), label = "PCA scores", x = 0, y = 0,
      width = 620, height = 720, visual = list(background = "#ffffff"),
      instance = list(id = team_id, source = source, inputs = saved_inputs)),
    list(kind = "plot", id = "qc_pca_tab-load2dPlot", label = "PCA loadings", x = 650, y = 0,
      width = 620, height = 720, visual = list(background = "#ffffff")))
  state <- list(version = "1", libraryHidden = FALSE, nodes = nodes)
  record <- api_checkpoint_save(s, "restore-cards", list(token = "restore-save", state = state))
  path <- api_checkpoint_path(record$id)
  api_session_close(s)
  restored <- api_session_open(path)
  on.exit(api_session_close(restored), add = TRUE)
  stopifnot(length(restored$canvas$nodes) == 2L, !isTRUE(restored$dirty))

  stopifnot(is_drawn(api_card_render(restored, team_id)))
  card <- api_card_get(restored, team_id)
  stopifnot(identical(card$source, source), identical(as.character(card$inputs[[pick$id]]), chosen))
  cat("PASS restore a Team instance draws with its saved inputs\n")

  fixed <- "tcinstance_fixed_qc_pca_tab_load2dplot"
  stopifnot(is_drawn(api_card_render(restored, fixed)),
    identical(api_card_get(restored, fixed)$source, "qc_pca_tab-load2dPlot"))
  cat("PASS restore a fixed family node draws through its fixed instance\n")
  # A fixed node is the family's own view: Team shows it with every archived input of that
  # family, including the ones its module builds at run time (logratio's sel_<class group>).
  restored$archived_inputs[["logratio_tab-sel_Fatty Acyls"]] <- "Acylcarnitine"
  restored$archived_inputs[["logratio_tab-panelColumns"]] <- "2"
  restored$canvas$nodes[[3L]] <- list(kind = "plot", id = "logratio_tab-logratioPlot", label = "Log ratios",
    x = 0, y = 800, width = 620, height = 720, visual = list(background = "#ffffff"))
  lr <- "tcinstance_fixed_logratio_tab_logratioplot"
  api_card_get(restored, lr)
  live <- function(key) api_read(restored, restored$mock$input[[paste0(lr, "-", key)]])
  stopifnot(identical(live("sel_Fatty Acyls"), "Acylcarnitine"), identical(as.character(live("panelColumns")), "2"))
  cat("PASS restore a fixed family node keeps the family's run-time inputs\n")

  stopifnot(!isTRUE(restored$dirty))
  cat("PASS restore does not dirty the session\n")
  missing <- tryCatch(api_card_render(restored, "tcinstance_mw45zzzz_00000000"), error = identity)
  stopifnot(inherits(missing, "api_not_found"))
  cat("PASS restore an id the checkpoint does not hold is still unknown\n")
})
