# Ported from production tests/dual-ui/test_team_library_restore_status.R, now
# over the database storage backend (fake transport, no network).
# Match the production authentication boundary: the library receives a deferred
# backend that returns a plain FALSE until scientific modules start after login.
library(shiny)
Sys.setenv(LIPIDOMIC_STORAGE = "database")
scope <- new.env(parent = globalenv())
for (f in c("storage/storage.R", "storage/storage_files.R", "storage/storage_database.R", "project_records.R", "project_library.R"))
  sys.source(file.path("R/frontends/team", f), envir = scope)
# The restore-status fixture intentionally uses non-ZIP bytes; sidecar parsing
# and import are exercised by the dedicated records round-trip tests.
scope$team_project_records_read <- function(path) NULL
# The Team-only authentication bridge (server_entry hook) exposes the same lifecycle.
bridge <- paste(readLines("R/frontends/team/hooks/server_wiring.R"),collapse="\n")
stopifnot(grepl("is_restoring = function()",bridge,fixed=TRUE),
          grepl("data$is_restoring()",bridge,fixed=TRUE))
scope$team_workspace_enabled <- function() TRUE
scope$team_library_queue <- function(...) NULL
project <- "11111111-1111-4111-8111-111111111111"
checkpoint <- "22222222-2222-4222-8222-222222222222"
bytes <- charToRaw("synthetic checkpoint")
hash <- digest::digest(bytes, algo = "sha256", serialize = FALSE)
scope$team_library_call <- function(service, path, token = NULL, body = NULL, method = "GET", raw = FALSE) {
  if (identical(service, "auth") && grepl("grant_type=password", path)) return(list(access_token = "token",
    refresh_token = "refresh", expires_in = 3600,
    user = list(id = "33333333-3333-4333-8333-333333333333", email = "synthetic@example.test")))
  if (identical(service, "auth") && path %in% c("/user", "/logout", "/logout?scope=local")) return(NULL)
  if (identical(service, "rest") && identical(path, "/pilot_projects?order=name")) return(list(list(id = project, name = "Synthetic")))
  if (identical(service, "rest") && identical(path, "/pilot_members")) return(list(list(project_id = project, role = "owner")))
  if (identical(service, "rest") && grepl("^/pilot_files\\?", path)) return(list(list(id = checkpoint, project_id = project,
    original_name = "Synthetic.zip", created_at = "2026-10-28T12:00:00Z", object_path = paste0(project, "/", hash), sha256 = hash)))
  if (identical(service, "storage") && isTRUE(raw)) return(bytes)
  stop("Unexpected stub request")
}
host <- function(input, output, session) {
  session$userData$team_project_records_import <- function(x) invisible(NULL)
  session$userData$backend <- NULL
  session$userData$restored <- reactiveVal(FALSE)
  session$userData$restoring <- reactiveVal(FALSE)
  session$userData$loaded <- character()
  session$userData$fail_import <- FALSE
  real <- list(loaded_files = function() session$userData$loaded,
    session_restored = session$userData$restored,
    import_session_path = function(path) {
      if (session$userData$fail_import) stop("Synthetic restore failed.")
      session$userData$loaded <- "synthetic.csv"
      session$userData$restoring(TRUE)
    })
  deferred <- list(
    is_restoring = session$userData$restoring,
    loaded_files = function() if (is.null(session$userData$backend)) character() else real$loaded_files(),
    session_restored = function() if (is.null(session$userData$backend)) FALSE else real$session_restored(),
    import_session_path = function(path) real$import_session_path(path))
  scope$team_library_server(input, output, session, deferred,
    on_authenticated = function() session$userData$backend <- real)
}
testServer(host, {
  messages <- list()
  session$sendCustomMessage <- function(type, message) { messages[[length(messages)+1L]] <<- list(type=type,message=message) }
  receipt <- function(id) Filter(function(x) identical(x$type,"team-foreground-result") && identical(x$message$id,id),messages)
  session$flushReact()
  stopifnot(is.null(session$userData$backend))
  session$setInputs(team_library_email = "synthetic@example.test", team_library_password = "synthetic", team_library_login = 1L)
  session$setInputs(team_library_project = project, team_library_checkpoint = checkpoint)
  session$setInputs(team_foreground_team_library_resume = "foreground-1", team_library_resume = 1L)
  session$flushReact()
  stopifnot(identical(output$team_library_status, "Loading the saved checkpoint…"))
  stopifnot(length(receipt("foreground-1")) == 0L)
  session$userData$restored(TRUE); session$flushReact()
  stopifnot(length(receipt("foreground-1")) == 0L)
  session$userData$restoring(FALSE); session$flushReact()
  stopifnot(length(receipt("foreground-1")) == 1L, isTRUE(receipt("foreground-1")[[1]]$message$ok))
  if (!grepl("Checkpoint restored", output$team_library_status, fixed = TRUE))
    stop("Completed restore status did not update: ", output$team_library_status)
  stopifnot(grepl("data table and PCA update automatically", output$team_library_status, fixed = TRUE))

  session$userData$loaded <- character()
  session$userData$restored(FALSE)
  session$userData$fail_import <- TRUE
  session$setInputs(team_foreground_team_library_resume = "foreground-2", team_library_resume = 2L)
  stopifnot(length(receipt("foreground-2")) == 1L, identical(receipt("foreground-2")[[1]]$message$ok,FALSE))
  session$flushReact()
  stopifnot(identical(output$team_library_status, "Synthetic restore failed."),
    !grepl("Checkpoint restored", output$team_library_status, fixed = TRUE))
  session$userData$restored(FALSE); session$flushReact()
  stopifnot(identical(output$team_library_status, "Synthetic restore failed."))
  session$userData$fail_import <- FALSE
  session$setInputs(team_foreground_team_library_resume = "foreground-3", team_library_resume = 3L)
  stopifnot(length(receipt("foreground-3")) == 0L)
  session$userData$restoring(FALSE); session$flushReact()
  stopifnot(length(receipt("foreground-3")) == 1L, identical(receipt("foreground-3")[[1]]$message$ok,FALSE))
})
cat("PASS: deferred authenticated restore stays loading until completion and preserves failure status\n")
