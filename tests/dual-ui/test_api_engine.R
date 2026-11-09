for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_engine")
source("frontends/nexo-api/engine.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
local({
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  df <- api_read(s, s$shared$data_processed_allow_missing())
  stopifnot(nrow(df) == 12L, ncol(df) == 9L, identical(s$receipt, "matches archived receipt"))
  cat("PASS U1 synthetic 12x9, matches archived receipt\n")
  directory <- tempfile(); dir.create(directory)
  legacy <- tempfile(fileext = ".zip")
  on.exit(unlink(c(directory, legacy), recursive = TRUE), add = TRUE)
  utils::unzip(fixture, exdir = directory)
  unlink(file.path(directory, "shared-state-v1.json"))
  state_path <- file.path(directory, "state.json")
  state <- jsonlite::read_json(state_path)
  state$preparation_contract <- NULL
  jsonlite::write_json(state, state_path, auto_unbox = TRUE)
  zip::zipr(legacy, list.files(directory, full.names = TRUE))
  # Team would rebuild this preparation from its QC inputs; the API has no QC
  # module, so it refuses instead of preparing with defaults Team would not use.
  refused <- tryCatch(api_session_open(legacy), error = identity)
  stopifnot(inherits(refused, "api_unprocessable"), grepl("open it in Team", conditionMessage(refused)))
  cat("PASS U1 legacy refused\n")
  for (id in c("pca", "violin", "dist", "comp", "heat")) {
    card <- api_card_create(s, paste0("results_dashboard-plot_", id), s$inputs)
    rendered <- api_card_render(s, card$instanceId, width = 900)
    stopifnot(length(rendered$figure$data) > 0L, is.character(rendered$figure$data[[1L]]$type),
      is.list(rendered$figure$layout))
  }
  cat("PASS U2 plots 5/5\n")
  card <- api_card_create(s, "results_dashboard-plot_violin", s$inputs)
  # JSON actions: [] must be a harmless empty action list.
  api_card_update(s, card$instanceId, actions = list())
  bad <- tryCatch({ api_card_update(s, card$instanceId, list(violin_lipid = "not-a-lipid")); api_card_render(s, card$instanceId) }, error = identity)
  # Since H3 an option outside the schema is refused up front (400); a module validate() failure stays 422.
  stopifnot(inherits(bad, "api_bad_request") || inherits(bad, "api_unprocessable"), nzchar(conditionMessage(bad)))
  bad <- tryCatch(api_card_create(s, "unknown"), error = identity)
  stopifnot(inherits(bad, "api_bad_request"))
  bad <- tryCatch(api_card_update(s, card$instanceId, list(unknown_control = TRUE)), error = identity)
  stopifnot(inherits(bad, "api_bad_request"), grepl("unknown_control", conditionMessage(bad)))
  bad <- tryCatch(api_card_create(s, "results_dashboard-plot_pca", instanceId = card$instanceId), error = identity)
  stopifnot(inherits(bad, "api_conflict"))
  cat("PASS U2 typed errors\n")
})
