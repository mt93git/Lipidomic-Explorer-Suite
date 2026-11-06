Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/engine.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
local({
  loaded <- api_load_session(fixture)
  df <- shiny::isolate(loaded$hub$data_processed())
  # Inspected the archived CSV: 12 lipid rows, Lipid_Name + 8 samples.
  stopifnot(nrow(df) == 12L, ncol(df) == 9L)
  stopifnot(identical(loaded$preparation_check, "matches archived receipt"))
  cat("PASS U1 synthetic 12x9, matches archived receipt\n")
  directory <- tempfile(); dir.create(directory)
  legacy <- tempfile(fileext = ".zip")
  on.exit(unlink(c(directory, legacy), recursive = TRUE))
  utils::unzip(fixture, exdir = directory)
  unlink(file.path(directory, "shared-state-v1.json"))
  state_path <- file.path(directory, "state.json")
  state <- jsonlite::read_json(state_path)
  state$preparation_contract <- NULL
  jsonlite::write_json(state, state_path, auto_unbox = TRUE)
  zip::zipr(legacy, list.files(directory, full.names = TRUE))
  old <- api_load_session(legacy)
  stopifnot(identical(old$applied$spec$settings, preparation_settings(list(), "team")))
  stopifnot(grepl("legacy", old$preparation_check))
  cat("PASS U1 legacy defaults\n")
  for (id in c("pca", "violin", "dist", "comp", "heat")) {
    figure <- api_render_plot(loaded$hub, id, loaded$inputs)
    stopifnot(length(figure$data) > 0L, is.character(figure$data[[1]]$type), is.list(figure$layout))
  }
  cat("PASS U2 plots 5/5\n")
  bad <- tryCatch(api_render_plot(loaded$hub, "violin", modifyList(loaded$inputs,
    list(violin_lipid = "not-a-lipid"))), error = identity)
  stopifnot(inherits(bad, "api_unprocessable"), nzchar(conditionMessage(bad)))
  bad_id <- tryCatch(api_render_plot(loaded$hub, "unknown", loaded$inputs), error = identity)
  stopifnot(inherits(bad_id, "api_bad_request"))
  cat("PASS U2 typed errors\n")
})
