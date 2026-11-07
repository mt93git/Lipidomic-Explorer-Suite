# Ported from production tests/dual-ui/test_team_library_canvas_save.R, now
# over the database storage backend (stubbed transport and commit, no network).
# The Team checkpoint save is gated on a fresh Canvas handshake. The legacy
# library path continues to export immediately when the workspace is disabled.
library(shiny)
Sys.setenv(LIPIDOMIC_STORAGE = "database")
source("R/frontends/team/workspace.R")
for (f in c("storage/storage.R", "storage/storage_files.R", "storage/storage_database.R", "project_records.R", "project_library.R"))
  source(file.path("R/frontends/team", f))
# This handshake fixture uses synthetic non-ZIP bytes; sidecar behavior has
# separate ZIP and database tests. Keep this test scoped to the save barrier.
team_project_records_attach <- function(path,session) invisible(TRUE)

project_a <- "11111111-1111-4111-8111-111111111111"
project_b <- "22222222-2222-4222-8222-222222222222"
test_state <- new.env(parent = emptyenv())
reset_test_state <- function() {
  test_state$exports <- 0L
  test_state$commits <- list()
  test_state$queue_writes <- list()
  test_state$api <- list()
  test_state$rows <- list()
}
rows_for <- function(rows, path) {
  q <- strsplit(strsplit(sub("^[^?]*\\?", "", path), "&", fixed = TRUE)[[1]], "=", fixed = TRUE)
  Filter(function(r) all(vapply(q, function(x) x[1] == "order" || identical(paste0("eq.", r[[x[1]]]), paste(x[-1], collapse = "=")), logical(1))), rows)
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
  if (identical(service, "rest") && grepl("/pilot_files\\?", path)) return(rows_for(test_state$rows, path))
  if (identical(service, "auth") && path %in% c("/logout", "/logout?scope=local")) return(NULL)
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
  test_state$commits[[length(test_state$commits) + 1L]] <- list(project = project, label = label)
  # The storage API verifies the registration row after the commit.
  hash <- digest::digest(file = path, algo = "sha256")
  if (!length(rows_for(test_state$rows, paste0("/pilot_files?project_id=eq.", project, "&sha256=eq.", hash))))
    test_state$rows[[length(test_state$rows) + 1L]] <- list(id = sprintf("40000000-0000-4000-8000-%012d", length(test_state$rows) + 1L),
      project_id = project, sha256 = hash, object_path = paste0(project, "/", hash),
      original_name = paste0(label, ".zip"), created_at = "2026-11-03T10:00:00Z")
  invisible(hash)
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

# Autosave binds the revision and project, uses the same fresh Canvas ACK, and
# emits a result that the client can use to show Saved/Retrying state.
reset_test_state()
run_workspace_server(function(session, output, saved_messages) {
  session$userData$team_canvas_acked_token <- function() "autosave-token"
  session$setInputs(team_library_autosave_request = list(revision = "canvas-rev-17", reason = "canvas-edit"))
  session$flushReact()
  requests <- Filter(function(x) identical(x$type, "team-canvas-save-request"), saved_messages$items)
  stopifnot(length(requests) == 1L, identical(requests[[1L]]$message$kind, "autosave"),
            grepl("^autosave-", requests[[1L]]$message$requestId))
  request_id <- requests[[1L]]$message$requestId
  session$setInputs(team_library_autosave_request = list(revision = "canvas-rev-18", reason = "second-edit"))
  session$flushReact()
  busy <- Filter(function(x) identical(x$type, "team-autosave-result") && !isTRUE(x$message$ok), saved_messages$items)
  stopifnot(length(busy) == 1L, grepl("already in progress", busy[[1L]]$message$message))
  session$setInputs(team_canvas_save_ready = list(requestId = request_id, ok = TRUE, token = "autosave-token"))
  session$flushReact()
  results <- Filter(function(x) identical(x$type, "team-autosave-result") && isTRUE(x$message$ok), saved_messages$items)
  stopifnot(length(results) == 1L, isTRUE(results[[1L]]$message$ok),
            identical(results[[1L]]$message$revision, "canvas-rev-17"),
            length(test_state$commits) == 1L,
            grepl("^Autosave ", test_state$commits[[1L]]$label))
})

# Invalid revisions and stale acknowledgements never create a checkpoint.
reset_test_state()
run_workspace_server(function(session, output, saved_messages) {
  session$userData$team_canvas_acked_token <- function() "stale-token"
  session$setInputs(team_library_autosave_request = list(revision = "contains spaces", reason = "bad"))
  session$flushReact()
  invalid <- Filter(function(x) identical(x$type, "team-autosave-result"), saved_messages$items)
  stopifnot(length(invalid) == 1L, !isTRUE(invalid[[1L]]$message$ok),
            grepl("Invalid autosave revision", invalid[[1L]]$message$message),
            length(test_state$commits) == 0L)

  session$setInputs(team_library_autosave_request = list(revision = "canvas-rev-stale", reason = "edit"))
  session$flushReact()
  request <- Filter(function(x) identical(x$type, "team-canvas-save-request"), saved_messages$items)
  request <- request[[length(request)]]$message$requestId
  session$setInputs(team_canvas_save_ready = list(requestId = "wrong-request", ok = TRUE, token = "stale-token"))
  session$flushReact()
  stopifnot(length(test_state$commits) == 0L)
  session$setInputs(team_canvas_save_ready = list(requestId = request, ok = TRUE, token = "stale-token"))
  session$flushReact()
  stopifnot(length(test_state$commits) == 1L)
})

# Once data are bound to a project, a later project switch is rejected.
reset_test_state()
run_workspace_server(function(session, output, saved_messages) {
  session$userData$team_canvas_acked_token <- function() "bound-token"
  session$setInputs(team_library_autosave_request = list(revision = "bound-1", reason = "edit"))
  session$flushReact()
  req1 <- Filter(function(x) identical(x$type, "team-canvas-save-request"), saved_messages$items)
  req1 <- req1[[length(req1)]]$message$requestId
  session$setInputs(team_canvas_save_ready = list(requestId = req1, ok = TRUE, token = "bound-token"))
  session$flushReact()
  stopifnot(length(test_state$commits) == 1L)
  session$setInputs(team_library_project = project_b)
  session$flushReact()
  session$setInputs(team_library_autosave_request = list(revision = "bound-2", reason = "edit"))
  session$flushReact()
  denied <- Filter(function(x) identical(x$type, "team-autosave-result") && !isTRUE(x$message$ok), saved_messages$items)
  stopifnot(length(denied) >= 1L, grepl("already bound", tail(denied, 1L)[[1L]]$message$message),
            length(test_state$commits) == 1L)
})

# Revoke write membership after the browser capture was requested. The server
# must refresh authorization at commit, not trust the role from sign-in.
original_call <- team_library_call
permission_revoked <- FALSE
team_library_call <- function(service, path, token=NULL, body=NULL, method="GET", raw=FALSE) {
  if (permission_revoked && identical(service,"rest") && identical(path,"/pilot_members"))
    return(list(list(project_id=project_a,role="viewer")))
  original_call(service,path,token,body,method,raw)
}
reset_test_state()
run_workspace_server(function(session, output, saved_messages) {
  session$userData$team_canvas_acked_token <- function() "permission-token"
  session$setInputs(team_library_autosave_request=list(revision="permission-1"))
  request_id <- canvas_request(saved_messages$items)
  permission_revoked <<- TRUE
  session$setInputs(team_canvas_save_ready=list(requestId=request_id,ok=TRUE,token="permission-token")); session$flushReact()
  stopifnot(test_state$exports==0L,length(test_state$commits)==0L)
  results <- Filter(function(x) identical(x$type,"team-autosave-result"), saved_messages$items)
  stopifnot(length(results)==1L,identical(results[[1L]]$message$ok,FALSE),grepl("owner or editor",results[[1L]]$message$message))
})
team_library_call <- original_call
permission_revoked <- FALSE

# The direct "legacy" save of the old seven-step Team shell (LIPIDOMIC_TEAM_WORKSPACE=0) no longer exists:
# Team is always the workspace, so LIPIDOMIC_TEAM_WORKSPACE=0 must not bypass the Canvas acknowledgement.
Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = "0")
reset_test_state()
run_workspace_server(function(session, output, saved_messages) {
  session$setInputs(team_library_save = 1L)
  session$flushReact()
  stopifnot(test_state$exports == 0L, length(test_state$commits) == 0L,
            any(vapply(saved_messages$items, function(x) identical(x$type, "team-canvas-save-request"), logical(1))))
})

cat("PASS: Team checkpoint waits for a current Canvas ACK and project binding, whatever LIPIDOMIC_TEAM_WORKSPACE says\n")
