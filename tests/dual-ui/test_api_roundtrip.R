for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_roundtrip: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_roundtrip")
source("R/frontends/api/engine.R")
local({
  root <- tempfile()
  previous <- Sys.getenv(c("LIPIDOMIC_STORAGE_DIR", "LIPIDOMIC_API_WORKSPACE"), unset = NA_character_)
  on.exit({
    unlink(root, recursive = TRUE)
    for (key in names(previous)) if (is.na(previous[[key]])) Sys.unsetenv(key) else
      do.call(Sys.setenv, stats::setNames(list(previous[[key]]), key))
  })
  Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_API_WORKSPACE = "roundtrip")
  fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s), add = TRUE)
  stopifnot(identical(s, api_session_for_checkpoint(fixture)))
  cards <- lapply(c("qc_pca_tab-pca2dPlot", "results_dashboard-plot_violin"), function(source)
    api_card_create(s, source))
  nodes <- lapply(seq_along(cards), function(i) {
    card <- cards[[i]]
    list(kind = "plot", id = card$nodeId, label = card$source, x = (i - 1) * 650, y = 0,
      width = 620, height = 720, visual = list(background = "#ffffff"),
      instance = list(id = card$instanceId, source = card$source, inputs = card$inputs))
  })
  nodes[[3L]] <- list(kind = "illustration", id = "illustration_lcms", label = "LC-MS",
    assetId = "lc-ms", assetVersion = "1", color = "#2d5f8a", x = 0, y = 750,
    width = 620, height = 720, visual = list(background = "#ffffff"))
  state <- list(version = "1", libraryHidden = FALSE, nodes = nodes,
    tabs = list(version = "1", active = "tab-plots", tabs = list(
      list(id = "tab-plots", name = "Plots", nodes = list(nodes[[1L]]$id, nodes[[2L]]$id)),
      list(id = "tab-method", name = "Method", nodes = list(nodes[[3L]]$id)))))
  ack <- api_canvas_validate(s, "roundtrip-validate", state)
  stopifnot(isTRUE(ack$ok), length(ack$state$nodes) == 3L, length(ack$state$tabs$tabs) == 2L)
  # A negative acknowledgement must not inherit the earlier success for this token.
  bad <- api_canvas_validate(s, "roundtrip-validate", list(version = "invalid"))
  stopifnot(!bad$ok)
  refused <- tryCatch(api_checkpoint_save(s, "bad", list(token = "bad-save", state = list())), error = identity)
  stopifnot(inherits(refused, "api_conflict"), length(api_store()$list(api_workspace())) == 0L)
  record <- api_checkpoint_save(s, "roundtrip", list(token = "roundtrip-save", state = state))
  path <- api_checkpoint_path(record$id)
  stopifnot(identical(record$sha256, digest::digest(file = path, algo = "sha256")))
  # Reopening a checkpoint returns what it holds. The live session now equals the
  # saved checkpoint (reuse is fine) but no longer the fixture it was opened from.
  stopifnot(identical(api_session_for_checkpoint(path)$sessionId, s$sessionId))
  original <- api_session_for_checkpoint(fixture)
  stopifnot(!identical(original$sessionId, s$sessionId), length(original$canvas$nodes) == 0L)
  api_session_close(original)
  api_card_create(s, "results_dashboard-plot_pca")
  edited <- api_session_for_checkpoint(path)
  stopifnot(!identical(edited$sessionId, s$sessionId), length(edited$canvas$nodes) == 3L)
  api_session_close(edited)
  cat("PASS roundtrip reopen returns the checkpoint, not later edits\n")
  api_session_close(s)
  restored <- api_session_open(path)
  on.exit(api_session_close(restored), add = TRUE)
  stopifnot(identical(api_canonical_json(restored$canvas), api_canonical_json(ack$state)))
  for (node in restored$canvas$nodes) if (identical(node$kind, "plot")) {
    card <- api_card_create(restored, node$instance$source, node$instance$inputs, node$instance$id)
    rendered <- api_card_render(restored, card$instanceId)
    if (identical(rendered$render, "png")) stopifnot(length(rendered$png) > 8L,
      identical(rendered$png[1:8], as.raw(c(137, 80, 78, 71, 13, 10, 26, 10)))) else
      stopifnot(length(rendered$figure$data) > 0L)
  }
  cat("PASS roundtrip nexo->zip->nexo\n")
  # The allowed headless Team compatibility check: its archive reader and validator.
  archive <- read_session_archive(path, include_team_canvas = TRUE)
  on.exit(unlink(archive$directory, recursive = TRUE), add = TRUE)
  stopifnot(identical(api_canonical_json(team_canvas_validate(archive$canvas)), api_canonical_json(ack$state)))
  cat("PASS roundtrip zip->team-validate\n")
  # Team appends team-project-records-v1.json to every save; a checkpoint opened in
  # Nexo and saved again must still carry it (Team otherwise reopens it as "older").
  records <- list(version = "1", kind = "archived-project-records", created_at = "2026-11-06T00:00:00Z",
    design = list(unit = "participant", relationship = "independent", notes = "kept by Nexo"),
    question = "Does Nexo keep project records?", run_history = list(), companion_actions = list(),
    methods = list(status = "not_prepared", lines = list()), applied_preparation = list(), quality_decisions = list())
  with_records <- tempfile(fileext = ".zip"); on.exit(unlink(with_records), add = TRUE)
  stopifnot(file.copy(path, with_records))
  stage <- tempfile(); dir.create(stage); on.exit(unlink(stage, recursive = TRUE), add = TRUE)
  writeLines(as.character(jsonlite::toJSON(records, auto_unbox = TRUE, null = "null", digits = NA)),
    file.path(stage, "team-project-records-v1.json"), useBytes = TRUE)
  zip::zip_append(with_records, files = "team-project-records-v1.json", root = stage)
  stopifnot(!is.null(team_project_records_read(with_records)))
  api_session_close(restored)
  keeper <- api_session_open(with_records)
  on.exit(api_session_close(keeper), add = TRUE)
  stopifnot(!is.null(keeper$project_records))
  again <- api_checkpoint_save(keeper, "records", list(token = "records-save", state = ack$state))
  kept <- team_project_records_read(api_checkpoint_path(again$id))
  stopifnot(identical(team_project_records_json(kept), team_project_records_json(records)))
  cat("PASS roundtrip keeps project records\n")
  cached <- api_session_for_checkpoint(path)
  on.exit(api_session_close(cached), add = TRUE)
  stopifnot(identical(cached, api_session_for_checkpoint(path)), identical(cached$sha256, record$sha256))
  # Retention applies only to exact autosave labels, never named checkpoints.
  for (i in seq_len(6L)) {
    changed <- state; changed$nodes[[1L]]$x <- i
    api_checkpoint_save(cached, "autosave", list(token = paste0("autosave-", i), state = changed))
  }
  records <- api_store()$list(api_workspace())
  stopifnot(sum(vapply(records, function(x) identical(x$name, "autosave"), logical(1))) == 5L,
    any(vapply(records, function(x) identical(x$id, record$id), logical(1))))
})
