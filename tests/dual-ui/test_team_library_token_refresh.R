# Expiring credentials must not reconstruct the project/name form during the
# asynchronous Canvas acknowledgement. Keep actual project/name guards intact.
library(shiny)
scope <- new.env(parent = globalenv())
sys.source("R/frontends/team/project_library.R", envir = scope)
state <- new.env(parent = emptyenv())
state$now <- as.POSIXct("2026-10-28 12:00:00", tz = "UTC")
state$label_renders <- 0L; state$refreshes <- 0L; state$commits <- list(); state$messages <- list(); state$files <- list()
project <- "11111111-1111-4111-8111-111111111111"
scope$Sys.time <- function() state$now
scope$team_workspace_enabled <- function() TRUE
scope$textInput <- function(inputId, ...) {
  if (identical(inputId, "team_library_label")) state$label_renders <- state$label_renders + 1L
  shiny::textInput(inputId, ...)
}
scope$team_library_call <- function(service, path, token = NULL, body = NULL, method = "GET", raw = FALSE) {
  if (identical(service, "auth") && grepl("grant_type=password", path))
    return(list(access_token = "original-token", refresh_token = "refresh-token", expires_in = 60,
      user = list(id = "22222222-2222-4222-8222-222222222222", email = "test@example.test")))
  if (identical(service, "auth") && grepl("grant_type=refresh_token", path)) {
    state$refreshes <- state$refreshes + 1L
    return(list(access_token = "renewed-token", refresh_token = "renewed-refresh", expires_in = 60))
  }
  if (identical(service, "auth") && path %in% c("/user", "/logout")) return(list())
  if (identical(service, "rest") && identical(path, "/pilot_projects?order=name")) return(list(list(id = project, name = "Synthetic project")))
  if (identical(service, "rest") && identical(path, "/pilot_members")) return(list(list(project_id = project, role = "owner")))
  if (identical(service, "rest") && grepl("^/pilot_files\\?", path)) return(state$files)
  stop("Unexpected stub request: ", service, " ", path)
}
scope$team_library_queue <- function(user, pending = NULL, clear = FALSE, expected = NULL) {
  if (!is.null(pending)) return(c(pending, list(sha256 = "synthetic-hash")))
  NULL
}
scope$team_library_commit <- function(path, project, label, token, ...) {
  state$commits[[length(state$commits) + 1L]] <- list(project = project, label = label, token = token)
  state$files <- list(list(id = "33333333-3333-4333-8333-333333333333", original_name = paste0(label, ".zip"), created_at = "2026-10-28T12:01:00Z"))
  invisible(TRUE)
}
shared <- list(loaded_files = function() "synthetic.csv", session_restored = reactiveVal(FALSE),
  export_session_path = function(path) writeBin(charToRaw("synthetic checkpoint"), path))
host <- function(input, output, session) {
  session$sendCustomMessage <- function(type, message)
    state$messages[[length(state$messages) + 1L]] <- list(type = type, message = message)
  scope$team_library_server(input, output, session, shared)
}
label_from_html <- function(html) {
  line <- gsub("\n", " ", html, fixed = TRUE)
  match <- regmatches(line, regexec('id="team_library_label"[^>]*value="([^"]*)"', line))[[1L]]
  stopifnot(length(match) == 2L)
  match[[2L]]
}
testServer(host, {
  session$setInputs(team_library_email = "test@example.test", team_library_password = "synthetic", team_library_login = 1L)
  session$setInputs(team_library_project = project, team_library_label = "Reviewed figure checkpoint")
  session$flushReact()
  before <- state$label_renders
  # Advance only the library's clock; no sleeps or modifications of Shiny time.
  state$now <- state$now + 60
  session$setInputs(team_library_save = 1L)
  session$flushReact()
  requests <- Filter(function(x) identical(x$type, "team-canvas-save-request"), state$messages)
  stopifnot(length(requests) == 1L, state$refreshes == 1L)
  renders_during_refresh <- state$label_renders
  if (renders_during_refresh > before) {
    # Browser input bindings return the newly reconstructed form's value.
    session$setInputs(team_library_label = label_from_html(output$team_library_projects$html))
  }
  session$userData$team_canvas_acked_token <- function() "current-canvas-token"
  session$setInputs(team_canvas_save_ready = list(requestId = requests[[1]]$message$requestId,
    token = "current-canvas-token", ok = TRUE))
  session$flushReact()
  if (length(state$commits) != 1L) stop("Expired-token save failed: ", output$team_library_status)
  stopifnot(renders_during_refresh == before,
    identical(state$commits[[1]]$label, "Reviewed figure checkpoint"),
    identical(state$commits[[1]]$token, "renewed-token"),
    identical(label_from_html(output$team_library_projects$html), "Reviewed figure checkpoint"))

  # A real edit while awaiting the acknowledgement remains a rejected save.
  session$setInputs(team_library_save = 2L)
  session$flushReact()
  requests <- Filter(function(x) identical(x$type, "team-canvas-save-request"), state$messages)
  session$setInputs(team_library_label = "Changed during save")
  session$setInputs(team_canvas_save_ready = list(requestId = requests[[2]]$message$requestId,
    token = "current-canvas-token", ok = TRUE))
  session$flushReact()
  stopifnot(length(state$commits) == 1L,
    grepl("checkpoint name changed", output$team_library_status, fixed = TRUE))
})
cat("PASS: credential refresh preserves the draft form and completes Canvas save; real name changes remain rejected\n")
