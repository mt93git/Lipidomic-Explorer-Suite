# The Team checkpoint save is gated on a fresh Canvas handshake. The legacy
# library path continues to export immediately when the workspace is disabled.
library(shiny)
source("R/frontends/team/workspace.R")
source("R/frontends/team/project_library.R")

project_a <- "11111111-1111-4111-8111-111111111111"
project_b <- "22222222-2222-4222-8222-222222222222"
test_state <- new.env(parent = emptyenv())
reset_test_state <- function() {
  test_state$exports <- 0L
  test_state$commits <- list()
  test_state$queue_writes <- list()
  test_state$api <- list()
}
reset_test_state()

team_library_call <- function(service, path, token = NULL, body = NULL,
                              method = "GET", raw = FALSE) {
  test_state$api[[length(test_state$api) + 1L]] <- list(service = service, path = path)
  if (identical(service, "auth") && grepl("grant_type=password", path))
    return(list(access_token = "access-token", refresh_token = "refresh-token",
                expires_in = 3600, user = list(id = "33333333-3333-4333-8333-333333333333", email = "user@example.test")))
  if (identical(service, "auth") && identical(path, "/user")) return(list())
  if (identical(service, "rest") && identical(path, "/pilot_projects?order=name"))
    return(list(list(id = project_a, name = "Project A"), list(id = project_b, name = "Project B")))
  if (identical(service, "rest") && identical(path, "/pilot_members"))
    return(list(list(project_id = project_a, role = "owner"), list(project_id = project_b, role = "editor")))
  if (identical(service, "rest") && grepl("/pilot_files\\?", path)) return(list())
  if (identical(service, "auth") && identical(path, "/logout")) return(NULL)
  stop("Unexpected stub API request: ", service, " ", path)
}
team_library_queue <- function(user, pending = NULL, clear = FALSE, expected = NULL) {
  if (!is.null(pending)) {
    test_state$queue_writes[[length(test_state$queue_writes) + 1L]] <- pending
    return(list(path = pending$path, project = pending$project, label = pending$label, sha256 = "sha"))
  }
  NULL
}
team_library_commit <- function(path, project, label, token, call = team_library_call) {
  test_state$commits[[length(test_state$commits) + 1L]] <<- list(project = project, label = label)
  invisible("saved")
}

make_shared_data <- function() list(
  loaded_files = function() list("samples.csv"),
  export_session_path = function(path) {
    test_state$exports <- test_state$exports + 1L
    writeBin(charToRaw("checkpoint bytes"), path)
    invisible(path)
  },
  import_session_path = function(path) invisible(path),
  session_restored = reactiveVal(FALSE)
)

run_workspace_server <- function(body) {
  host <- function(input, output, session) {
    team_library_server(input, output, session, shared_data = make_shared_data())
  }
  testServer(host, {
    saved_messages <- new.env(parent = emptyenv())
    saved_messages$items <- list()
    send_message <- session$sendCustomMessage
    session$sendCustomMessage <- function(type, message) {
      saved_messages$items[[length(saved_messages$items) + 1L]] <- list(type = type, message = message)
      send_message(type, message)
    }
    session$setInputs(team_library_email = "user@example.test",
                      team_library_password = "test-password",
                      team_library_login = 1L)
    session$flushReact()
    session$setInputs(team_library_project = project_a,
                      team_library_label = "Canvas checkpoint")
    session$flushReact()
    body(session, output, saved_messages)
  })
}
canvas_request <- function(messages) {
  found <- Filter(function(x) identical(x$type, "team-canvas-save-request"), messages)
  stopifnot(length(found) == 1L)
  found[[1L]]$message$requestId
}

Sys.setenv(LIPIDOMIC_PROJECT_LIBRARY = "1", LIPIDOMIC_TEAM_WORKSPACE = "1")
reset_test_state()
run_workspace_server(function(session, output, saved_messages) {
  session$setInputs(team_library_save = 1L)
  session$flushReact()
  request_id <- canvas_request(saved_messages$items)
  stopifnot(test_state$exports == 0L, length(test_state$commits) == 0L,
            length(test_state$queue_writes) == 0L)

  session$userData$team_canvas_acked_token <- function() "new-server-token"
  session$setInputs(team_canvas_save_ready = list(requestId = request_id, ok = TRUE, token = "old-server-token"))
  session$flushReact()
  stopifnot(test_state$exports == 0L, length(test_state$commits) == 0L,
            grepl("latest canvas changes have not been confirmed", output$team_library_status))

  # A fresh request with the matching current server token is the only path to export.
  session$setInputs(team_library_save = 2L)
  session$flushReact()
  request_id <- Filter(function(x) identical(x$type, "team-canvas-save-request"), saved_messages$items)
  request_id <- request_id[[length(request_id)]]$message$requestId
  session$setInputs(team_canvas_save_ready = list(requestId = request_id, ok = TRUE, token = "new-server-token"))
  session$flushReact()
  stopifnot(test_state$exports == 1L, length(test_state$commits) == 1L,
            identical(test_state$commits[[1L]]$project, project_a),
            identical(test_state$commits[[1L]]$label, "Canvas checkpoint"))
})

reset_test_state()
run_workspace_server(function(session, output, saved_messages) {
  session$setInputs(team_library_save = 1L)
  session$flushReact()
  request_id <- canvas_request(saved_messages$items)
  session$userData$team_canvas_acked_token <- function() "current-token"
  session$setInputs(team_library_project = project_b)
  session$flushReact()
  session$setInputs(team_canvas_save_ready = list(requestId = request_id, ok = TRUE, token = "current-token"))
  session$flushReact()
  stopifnot(test_state$exports == 0L, length(test_state$commits) == 0L,
            grepl("project or checkpoint name changed", output$team_library_status))
})

Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = "0")
reset_test_state()
run_workspace_server(function(session, output, saved_messages) {
  session$setInputs(team_library_save = 1L)
  session$flushReact()
  stopifnot(test_state$exports == 1L, length(test_state$commits) == 1L,
            identical(test_state$commits[[1L]]$project, project_a),
            !any(vapply(saved_messages$items, function(x) identical(x$type, "team-canvas-save-request"), logical(1))))
})

cat("PASS: Team checkpoint waits for a current Canvas ACK and project binding; legacy save remains direct\n")
