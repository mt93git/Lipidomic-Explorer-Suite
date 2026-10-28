# Small state bridge for the Team companion adapter. It reports only whether
# this session has data and whether preparation is current; no scientific values
# or sample labels are sent to the browser.
team_companion_workspace_server <- function(session, shared_data) {
  safe <- function(f, fallback = NULL) tryCatch(f(), error = function(e) fallback)
  observe({
    raw <- safe(shared_data$rawData)
    loaded_files <- safe(shared_data$loaded_files)
    processed <- safe(shared_data$data_processed)
    prep <- safe(shared_data$preparation_state, list())
    loaded <- !is.null(raw) || length(unlist(loaded_files, use.names = FALSE)) > 0L
    session$sendCustomMessage("team-preparation-state", list(
      ready = isTRUE(prep$data_available) && identical(prep$status, "ready") && !is.null(processed),
      pending = isTRUE(prep$dirty), running = FALSE,
      revision = prep$revision %||% 0L
    ))
    session$sendCustomMessage("team_companion_workspace_state", list(
      loaded = isTRUE(loaded),
      ready = !is.null(processed),
      dirty = isTRUE(safe(shared_data$preparation_dirty, FALSE))
    ))
  })
}
