# team_library_server over the storage API, both backends. No network: the
# database transport is an in-memory fake, the files backend a temp directory.
suppressWarnings(suppressPackageStartupMessages(library(shiny)))
scope <- new.env(parent = globalenv())
for (f in c("storage/storage.R", "storage/storage_files.R", "storage/storage_database.R",
            "project_records.R", "project_library.R"))
  sys.source(file.path("R/frontends/team", f), envir = scope)
scope$team_workspace_enabled <- function() identical(Sys.getenv("LIPIDOMIC_TEAM_WORKSPACE"), "1")
# A fixed clock and a private failure table keep the throttle deterministic.
clock <- 1000
scope$team_library_login_limiter <- local({
  make <- scope$team_library_login_limiter
  function() make(now = function() clock, state = new.env(parent = emptyenv()))
})
source_text <- paste(readLines("R/frontends/team/project_library.R"), collapse = "\n")
stopifnot(!grepl("Sys.sleep", source_text, fixed = TRUE), !grepl("TODO", source_text, fixed = TRUE),
  !grepl("TODO", paste(readLines("R/frontends/team/project_records.R"), collapse = "\n"), fixed = TRUE))

make_zip <- function(path, text) {
  d <- tempfile(); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  writeLines(text, file.path(d, "state.json")); zip::zipr(path, "state.json", root = d)
}
read_state <- function(path) {
  con <- unz(path, "state.json"); on.exit(close(con)); readLines(con)
}
hub <- function(state) list(
  loaded_files = function() state$loaded,
  session_restored = function() FALSE,
  is_restoring = function() FALSE,
  export_session_path = function(path) { state$exports <- state$exports + 1L; make_zip(path, state$text) },
  import_session_path = function(path) { state$imported <- c(state$imported, read_state(path)); state$loaded <- "restored.csv" })
new_state <- function() {
  s <- new.env(); s$loaded <- "samples.csv"; s$exports <- 0L; s$imported <- character(); s$science <- 0L
  s$text <- '{"inputs":{"imputationSeed":42}}'; s$messages <- list(); s
}
host <- function(state) function(input, output, session) {
  session$sendCustomMessage <- function(type, message)
    state$messages[[length(state$messages) + 1L]] <- list(type = type, message = message)
  scope$team_library_server(input, output, session, hub(state),
    on_authenticated = function() state$science <- state$science + 1L)
}
auth_states <- function(state) vapply(Filter(function(x) identical(x$type, "team-auth-state"), state$messages),
  function(x) isTRUE(x$message$authenticated), logical(1))

# ---- files: single local user, no sign-in, no transport ----------------------
transport_calls <- 0L
scope$team_library_call <- function(...) { transport_calls <<- transport_calls + 1L; stop("no network in files mode") }
root <- tempfile("team-files-")
Sys.setenv(LIPIDOMIC_STORAGE = "files", LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_TEAM_WORKSPACE = "0",
  LIPIDOMIC_PROJECT_LIBRARY = "1")
stopifnot(!scope$team_library_uses_identity())
ui <- htmltools::renderTags(scope$team_library_ui())$html
stopifnot(!grepl("team-library-login-placeholder", ui, fixed = TRUE), grepl("on this computer", ui, fixed = TRUE))
state <- new_state()
testServer(host(state), {
  session$flushReact()
  stopifnot(state$science == 1L, isTRUE(session$userData$team_library_authenticated()),
    identical(session$userData$team_storage$kind, "files"), any(auth_states(state)))
  stopifnot(!grepl("team_library_password", output$team_library_account$html, fixed = TRUE),
    grepl("no sign-in", output$team_library_account$html, fixed = TRUE))
  session$setInputs(team_library_project = "local", team_library_label = "First local"); session$flushReact()
  stopifnot(length(session$userData$team_storage$list("local")) == 0L)
  session$setInputs(team_library_save = 1L); session$flushReact()
  stopifnot(state$exports == 1L, grepl("Checkpoint saved privately", output$team_library_status, fixed = TRUE))
  listed <- session$userData$team_storage$list("local")
  stopifnot(length(listed) == 1L, identical(listed[[1]]$name, "First local.zip"),
    file.exists(file.path(root, "projects", "local", paste0(listed[[1]]$id, ".zip"))),
    grepl(listed[[1]]$id, output$team_library_projects$html, fixed = TRUE))
  # Resume refuses to replace loaded work, then round-trips the saved bytes.
  session$setInputs(team_library_checkpoint = listed[[1]]$id, team_library_resume = 1L); session$flushReact()
  stopifnot(grepl("Open a fresh session", output$team_library_status, fixed = TRUE), !length(state$imported))
  state$loaded <- character()
  session$setInputs(team_library_resume = 2L); session$flushReact()
  stopifnot(identical(state$imported, state$text), identical(output$team_library_status, "Loading the saved checkpoint…"))
  # A tampered checkpoint is refused before import.
  writeBin(charToRaw("tampered"), file.path(root, "projects", "local", paste0(listed[[1]]$id, ".zip")))
  state$loaded <- character(); state$imported <- character()
  session$setInputs(team_library_resume = 3L); session$flushReact()
  stopifnot(!length(state$imported), grepl("integrity check failed", output$team_library_status, fixed = TRUE))
})
stopifnot(transport_calls == 0L)
# Workspace mode in files: still no sign-in, science starts once, writable project.
Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = "1")
ui <- htmltools::renderTags(scope$team_library_ui())$html
stopifnot(!grepl("team-library-login-placeholder", ui, fixed = TRUE))
state <- new_state()
testServer(host(state), {
  session$setInputs(team_library_project = "local"); session$flushReact()
  ctx <- Filter(function(x) identical(x$type, "team-autosave-context"), state$messages)
  stopifnot(state$science == 1L, isTRUE(tail(ctx, 1)[[1]]$message$writable))
})
stopifnot(transport_calls == 0L)
cat("PASS files: no sign-in, science starts once, save -> list -> resume round-trip, tamper refused, zero transport calls\n")

# ---- database: fake Supabase transport --------------------------------------
Sys.setenv(LIPIDOMIC_STORAGE = "database", LIPIDOMIC_TEAM_WORKSPACE = "0",
  LIPIDOMIC_UPLOAD_QUEUE = tempfile("team-queue-"))
stopifnot(scope$team_library_uses_identity())
Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = "1")
stopifnot(grepl("team-library-login-placeholder", htmltools::renderTags(scope$team_library_ui())$html, fixed = TRUE))
Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = "0")
project <- "10000000-0000-4000-8000-000000000001"
user <- "20000000-0000-4000-8000-000000000002"
fake <- new.env(); fake$rows <- list(); fake$objects <- list(); fake$log <- list(); fake$n <- 0L
query <- function(path) {
  q <- sub("^[^?]*\\??", "", path); if (!nzchar(q)) return(list())
  parts <- strsplit(strsplit(q, "&", fixed = TRUE)[[1]], "=", fixed = TRUE)
  setNames(lapply(parts, function(x) paste(x[-1], collapse = "=")), vapply(parts, `[[`, "", 1L))
}
matching <- function(q) Filter(function(r) all(vapply(setdiff(names(q), "order"), function(k)
  identical(paste0("eq.", r[[k]]), q[[k]]), logical(1))), fake$rows)
scope$team_library_call <- function(service, path, token = NULL, body = NULL, method = "GET", raw = FALSE) {
  fake$log[[length(fake$log) + 1L]] <- list(service = service, path = path, token = token, method = method)
  if (service == "auth" && grepl("grant_type=password", path)) {
    if (!identical(body$password, "right")) stop("invalid credentials")
    return(list(access_token = "token-1", refresh_token = "refresh-1", expires_in = 3600,
      user = list(id = user, email = body$email)))
  }
  if (!identical(token, "token-1")) stop("Request denied or service unavailable.")
  if (service == "auth" && path %in% c("/user", "/logout")) return(list())
  if (service == "rest" && path == "/pilot_projects?order=name") return(list(list(id = project, name = "Synthetic")))
  if (service == "rest" && path == "/pilot_members") return(list(list(project_id = project, user_id = user, role = "owner")))
  if (service == "rest" && startsWith(path, "/pilot_files")) {
    if (method == "GET") return(matching(query(path)))
    if (method == "POST") {
      fake$n <- fake$n + 1L
      fake$rows[[length(fake$rows) + 1L]] <- c(list(id = sprintf("30000000-0000-4000-8000-%012d", fake$n)), body,
        list(created_at = sprintf("2026-11-03T10:00:%02dZ", fake$n)))
      return(NULL)
    }
  }
  if (service == "storage" && method == "GET") return(fake$objects[[sub("^/object/authenticated/case-files/", "", path)]])
  if (service == "storage" && method == "POST") { fake$objects[[sub("^/object/case-files/", "", path)]] <- body; return(NULL) }
  stop("Unexpected fake request: ", service, " ", method, " ", path)
}
password_calls <- function() sum(vapply(fake$log, function(x) grepl("grant_type=password", x$path), logical(1)))

state <- new_state()
testServer(host(state), {
  session$flushReact()
  stopifnot(state$science == 0L, !isTRUE(session$userData$team_library_authenticated()),
    grepl("team_library_password", output$team_library_account$html, fixed = TRUE))
  # Refusals go to the sign-in card's alert strip (team-login-feedback), not the status line.
  alerts <- character()
  session$sendCustomMessage <- function(type, message)
    if (identical(type, "team-login-feedback") && !is.null(message$alert)) alerts <<- c(alerts, message$alert)
  # Throttle: 5 failures are free; the 6th attempt is refused without any request.
  for (i in 1:5) {
    session$setInputs(team_library_email = "who@example.test", team_library_password = "wrong", team_library_login = i)
    stopifnot(identical(alerts[[i]], scope$team_login_rejected_message()), identical(output$team_library_status, ""))
  }
  stopifnot(password_calls() == 5L)
  before <- length(fake$log)
  session$setInputs(team_library_password = "right", team_library_login = 6L)
  stopifnot(identical(alerts[[6]], "Too many attempts. Try again in 1 s."),
    length(fake$log) == before, state$science == 0L)
  clock <<- clock + 1
  session$setInputs(team_library_password = "right", team_library_login = 7L); session$flushReact()
  stopifnot(state$science == 1L, password_calls() == 6L, isTRUE(session$userData$team_library_authenticated()),
    identical(session$userData$team_storage$kind, "database"),
    identical(output$team_library_status, "Signed in. Choose a project and a saved checkpoint."))
  # A second sign-in in the same session is refused; science never starts twice.
  session$setInputs(team_library_login = 8L)
  stopifnot(state$science == 1L, identical(alerts[[length(alerts)]], "Sign out before switching accounts."))
  session$setInputs(team_library_project = project, team_library_label = "DB checkpoint"); session$flushReact()
  session$setInputs(team_library_save = 1L); session$flushReact()
  stopifnot(grepl("Checkpoint saved privately", output$team_library_status, fixed = TRUE), length(fake$rows) == 1L,
    identical(fake$rows[[1]]$original_name, "DB checkpoint.zip"), length(fake$objects) == 1L,
    !length(list.files(Sys.getenv("LIPIDOMIC_UPLOAD_QUEUE"), pattern = "^[0-9a-f-]{36}$")))
  listed <- session$userData$team_storage$list(project)
  stopifnot(length(listed) == 1L, identical(listed[[1]]$id, fake$rows[[1]]$id))
  state$loaded <- character()
  session$setInputs(team_library_checkpoint = listed[[1]]$id, team_library_resume = 1L); session$flushReact()
  stopifnot(identical(state$imported, state$text))
  # Every database request after sign-in carried this session's token.
  stopifnot(all(vapply(Filter(function(x) x$service != "auth" || x$path != "/token?grant_type=password", fake$log),
    function(x) identical(x$token, "token-1"), logical(1))))
})
cat("PASS database: throttled sign-in shows the wait message with zero transport calls; sign-in starts science once; save/list/resume via fake transport\n")
