# The explicit root form also supports isolated tests; no-argument stores are cached.
api_store <- local({
  stores <- new.env(parent = emptyenv())
  function(root = Sys.getenv("LIPIDOMIC_STORAGE_DIR", Sys.getenv("LIPIDOMIC_API_CHECKPOINT_DIR"))) {
    if (!nzchar(root)) api_abort("api_unavailable", "Checkpoint storage directory is not configured.")
    key <- normalizePath(path.expand(root), mustWork = FALSE)
    if (!exists(key, stores, inherits = FALSE)) stores[[key]] <- api_store_files(key)
    stores[[key]]
  }
})
api_workspace <- function() api_storage_project(Sys.getenv("LIPIDOMIC_API_WORKSPACE", "nexo-pilot"))
# Store per client (docs/integration/nexo-store-scope.md). `caller` is api_admin_caller(): NULL while the switch is off
# (the shared workspace and the legacy folder, as before), else list(staff, clients). Staff keep today's workspace;
# a client member reads the workspaces of its clients and never the folder.
api_client_workspace <- function(client_id) api_storage_project(paste0("nexo-client-", tolower(client_id)))
api_caller_member <- function(caller) !is.null(caller) && !isTRUE(caller$staff)
api_caller_workspaces <- function(caller) if (isTRUE(caller$service)) caller$workspaces else if (api_caller_member(caller))
  vapply(caller$clients, api_client_workspace, character(1), USE.NAMES = FALSE) else api_workspace()
# A session saves where it came from: a member's dataset or a checkpoint of a client workspace keep that workspace.
api_session_workspace <- function(s, caller) if (is.null(caller)) api_workspace() else s$workspace %||% api_workspace()
api_scope_allow <- function(caller, workspace) {
  if (api_caller_member(caller) && !workspace %in% api_caller_workspaces(caller))
    api_abort("api_forbidden_scope", "This session belongs to a workspace you cannot save into.")
  invisible(workspace)
}
api_checkpoint_record <- function(x, source = "store") c(list(id = x$id, name = x$name,
  sizeBytes = x$size_bytes, sha256 = x$sha256, createdAt = x$created_at, source = source), if (isTRUE(x$version)) list(version = TRUE))
# A member's records name their client.
api_checkpoint_scoped_record <- function(x, workspace) {
  record <- api_checkpoint_record(x)
  if (startsWith(workspace, "nexo-client-")) record$clientId <- sub("^nexo-client-", "", workspace)
  record
}
api_checkpoint_folder <- function() {
  dir <- Sys.getenv("LIPIDOMIC_API_CHECKPOINT_DIR")
  if (!nzchar(dir)) return(character())
  paths <- list.files(dir, pattern = "[.]zip$", full.names = TRUE)
  paths[!dir.exists(paths)]
}
api_checkpoint_stored <- function(workspace = api_workspace()) {
  root <- Sys.getenv("LIPIDOMIC_STORAGE_DIR", Sys.getenv("LIPIDOMIC_API_CHECKPOINT_DIR"))
  if (!nzchar(root)) return(list())
  api_store()$list(workspace)
}
api_checkpoint_list <- function(caller = NULL) {
  if (api_caller_member(caller)) {
    records <- unlist(lapply(api_caller_workspaces(caller), function(workspace)
      lapply(api_checkpoint_stored(workspace), api_checkpoint_scoped_record, workspace)), recursive = FALSE)
    if (!length(records)) return(list())
    return(records[order(vapply(records, `[[`, character(1), "createdAt"), decreasing = TRUE)])
  }
  records <- lapply(api_checkpoint_stored(), api_checkpoint_record)
  hashes <- vapply(records, `[[`, character(1), "sha256")
  for (path in api_checkpoint_folder()) {
    sha <- digest::digest(file = path, algo = "sha256")
    if (sha %in% hashes) next
    info <- file.info(path)
    records[[length(records) + 1L]] <- list(id = sub("[.]zip$", "", basename(path)),
      name = sub("[.]zip$", "", basename(path)), sizeBytes = unname(info$size), sha256 = sha,
      createdAt = format(info$mtime, "%Y-%m-%dT%H:%M:%OS6Z", tz = "UTC"), source = "folder")
  }
  records
}
# Outside the caller's scope is "Unknown checkpoint." (404), the same answer as an id that does not exist.
api_checkpoint_resolve <- function(id, caller = NULL, workspace = NULL) {
  if (!is.character(id) || length(id) != 1L || is.na(id) || !nzchar(id) ||
      grepl("[/\\\\]", id) || grepl("..", id, fixed = TRUE) || grepl("[[:cntrl:]]", id))
    api_abort("api_bad_request", "Invalid checkpointId.")
  workspaces <- if (is.null(workspace)) api_caller_workspaces(caller) else
    api_scope_allow(caller, api_storage_project(workspace))
  for (workspace in workspaces) {
    matches <- Filter(function(x) identical(x$id, id), api_checkpoint_stored(workspace))
    if (length(matches)) return(list(path = api_store()$load(workspace, id),
      record = api_checkpoint_scoped_record(matches[[1L]], workspace), workspace = workspace))
  }
  # The folder belongs to the staff workspace: staff and a collab service for that workspace see it, members never.
  folder <- !api_caller_member(caller) || isTRUE(caller$service)
  paths <- if (!folder || !api_workspace() %in% workspaces) character() else api_checkpoint_folder()
  found <- paths[sub("[.]zip$", "", basename(paths)) == id]
  if (length(found)) return(list(path = found[[1L]], record = list(id = id, name = id, source = "folder"),
    workspace = api_workspace()))
  api_abort("api_not_found", "Unknown checkpoint.")
}
api_checkpoint_path <- function(id, caller = NULL) api_checkpoint_resolve(id, caller)$path
api_checkpoint_delete <- function(id, caller = NULL, workspace = NULL) {
  x <- api_checkpoint_resolve(id, caller, workspace)
  if (identical(x$record$source, "folder")) api_abort("api_method_not_allowed", "Folder checkpoints are read-only.")
  api_store()$delete(x$workspace, id)
  list(ok = TRUE)
}
# POST /sessions with checkpointId. Switch on, the session keeps the workspace it came from; a clean session of
# another workspace with the same bytes is left to its tab (marked dirty, so the open below starts a fresh one).
api_checkpoint_session <- function(id, caller = NULL, workspace = NULL, collab = NULL) {
  x <- api_checkpoint_resolve(id, caller, workspace)
  if (!is.null(collab) || is.null(caller)) {
    s <- if (is.null(collab)) api_session_for_checkpoint(x$path) else api_session_for_checkpoint(x$path, collab)
    s$lineage <- id
    return(s)
  }
  sha <- digest::digest(file = x$path, algo = "sha256")
  for (sid in ls(api_sessions)) {
    other <- api_sessions[[sid]]
    if (identical(other$sha256, sha) && !identical(other$workspace %||% api_workspace(), x$workspace)) other$dirty <- TRUE
  }
  s <- api_session_for_checkpoint(x$path)
  s$workspace <- x$workspace
  s$lineage <- id
  s
}
api_canvas_current <- function(s) api_read(s, s$domain$userData$team_canvas_export())
api_canvas_validate <- function(s, token, state) {
  if (!is.character(token) || length(token) != 1L || is.na(token) ||
      !grepl("^[A-Za-z0-9_.:-]{1,160}$", token)) api_abort("api_bad_request", "Invalid canvas checkpoint token.")
  started <- Sys.time()
  # Remove old acknowledgements for this token: retries must receive a fresh ACK,
  # even when the bounded bus log rolls over during the flush.
  s$bus$log <- Filter(function(x) !(identical(x$type, "team-canvas-state-ack") &&
    identical(x$message$token, token)), s$bus$log)
  api_inputs(s, team_canvas_state = list(token = token, state = state))
  api_flush(s)
  replies <- Filter(function(x) identical(x$token, token), s$bus$messages("team-canvas-state-ack"))
  reply <- if (length(replies)) tail(replies, 1L)[[1L]] else
    list(ok = FALSE, message = "No fresh canvas acknowledgement received.")
  accepted <- api_read(s, s$domain$userData$team_canvas_acked_token())
  ok <- isTRUE(reply$ok) && identical(accepted, token) &&
    as.numeric(difftime(Sys.time(), started, units = "secs")) < 120
  current <- api_canvas_current(s)
  if (ok) s$canvas <- current
  list(ok = ok, message = if (ok || !isTRUE(reply$ok)) reply$message else
    "Canvas acknowledgement expired or no longer matches.", state = current)
}
# Team appends team-project-records-v1.json after export_session_path
# (project_library.R); Nexo carries the opened checkpoint's records unchanged.
api_project_records_append <- function(path, bytes) {
  if (is.null(bytes)) return(invisible(FALSE))
  member <- "team-project-records-v1.json"
  stage <- tempfile("nexo-records-"); dir.create(stage); on.exit(unlink(stage, recursive = TRUE))
  writeBin(bytes, file.path(stage, member))
  zip::zip_append(path, files = member, root = stage)
  invisible(TRUE)
}
# Team's exporter can only collect mounted inputs. Nexo does not mount every Team
# panel; carry untouched archived inputs, including explicit NULLs, through save.
api_checkpoint_preserve_inputs <- function(path, s) {
  if (!length(s$archived_inputs) && is.null(s$archived_qc_decisions)) return(invisible(path))
  stage <- tempfile("nexo-state-"); dir.create(stage)
  on.exit(unlink(stage, recursive = TRUE))
  zip::unzip(path, files = "state.json", exdir = stage)
  member <- file.path(stage, "state.json")
  state <- jsonlite::read_json(member, simplifyVector = FALSE)
  archived <- s$archived_inputs %||% list()
  untouched <- setdiff(names(archived), s$changed_inputs %||% character())
  state$inputs[untouched] <- archived[untouched]
  # Explicit edits must also survive Team's filtering of UI-only inputs.
  for (id in intersect(names(archived), s$changed_inputs %||% character()))
    state$inputs[id] <- list(api_read(s, s$mock$input[[id]]))
  # Nexo has no QC decision editor/bridge. Team rebuilds outliers from external
  # settings, which need not contain the separately archived decision history.
  if (!is.null(s$archived_qc_decisions)) state$outliers$qc_decisions <- s$archived_qc_decisions
  jsonlite::write_json(state, member, auto_unbox = TRUE, digits = 17, null = "null")
  zip::zip_append(path, "state.json", root = stage)
  invisible(path)
}
api_checkpoint_save <- function(s, label, canvas, nexo = s$nexo, caller = NULL, collab = FALSE) {
  project <- api_scope_allow(caller, api_session_workspace(s, caller))
  api_storage_label(label)
  if (!is.list(canvas)) api_abort("api_bad_request", "Expected canvas with token and state.")
  validated <- api_canvas_validate(s, canvas$token, canvas$state)
  if (!isTRUE(validated$ok)) api_abort("api_conflict", validated$message)
  nexo <- api_nexo_check(nexo)
  tmp <- tempfile(fileext = ".zip"); on.exit(unlink(tmp))
  tryCatch(api_read(s, s$shared$export_session_path(tmp)), error = function(e) {
    if (inherits(e, "session_lost")) stop(e)
    api_abort("api_unprocessable", conditionMessage(e))
  })
  api_checkpoint_preserve_inputs(tmp, s)
  api_project_records_append(tmp, s$project_records)
  api_cohort_append(tmp, s)
  previous <- s$nexo; s$nexo <- nexo
  tryCatch(api_nexo_append(tmp, s), error = function(e) { s$nexo <- previous; stop(e) })
  store <- api_store()
  record <- store$save(project, tmp, label,
    lineage = if (identical(label, "autosave")) s$lineage else NULL, collab = collab)
  # The live session now equals the checkpoint just written: reopening it may reuse
  # this session, reopening the one it came from opens that file fresh.
  s$sha256 <- record$sha256; s$dirty <- FALSE
  if (identical(label, "autosave") && !isTRUE(record$collab)) {
    autosaves <- Filter(function(x) identical(x$name, "autosave") && !isTRUE(x$collab) &&
      identical(x$lineage, record$lineage), store$list(project))
    if (length(autosaves) > 5L) for (x in autosaves[-seq_len(5L)]) store$delete(project, x$id)
  }
  c(if (is.null(caller)) api_checkpoint_record(record) else api_checkpoint_scoped_record(record, project), list(near_limit = api_project_records_near_limit(s$project_records)))
}
api_checkpoint_upload <- function(req) {
  parts <- req$body
  part <- function(name) {
    found <- Filter(function(x) is.list(x) && identical(x$name, name), parts)
    if (length(found) > 1L) api_abort("api_bad_request", paste("Duplicate multipart field:", name))
    if (length(found)) found[[1L]] else NULL
  }
  file <- part("file")
  if (is.null(file) || !is.raw(file$value)) api_abort("api_bad_request", "Expected multipart file field.")
  if (length(file$value) > 90 * 1024^2) api_abort("api_too_large", "Checkpoint exceeds 90 MiB.")
  label_part <- part("label")
  label <- if (is.null(label_part)) sub("[.]zip$", "", basename(file$filename %||% "upload")) else
    rawToChar(label_part$value)
  api_storage_label(label)
  tmp <- tempfile(fileext = ".zip"); on.exit(unlink(tmp))
  writeBin(file$value, tmp)
  archive <- tryCatch(read_session_archive(tmp, include_team_canvas = TRUE),
    error = function(e) api_abort("api_unprocessable", conditionMessage(e)))
  on.exit(unlink(archive$directory, recursive = TRUE), add = TRUE)
  api_checkpoint_record(api_store()$save(api_workspace(), tmp, label))
}

# Top-bar parity with Team autosave: records are retained verbatim by Nexo.
# Count the same JSON nodes as team_project_records_nodes, rather than ZIP bytes.
api_project_records_near_limit <- function(bytes) {
  if (is.null(bytes) || !length(bytes)) return(FALSE)
  record <- tryCatch(jsonlite::fromJSON(rawToChar(bytes), simplifyVector = FALSE), error = function(e) NULL)
  if (is.null(record)) return(FALSE)
  nodes <- 0L
  walk <- function(x) { nodes <<- nodes + length(x); if (is.list(x)) for (v in x) walk(v) }
  walk(record)
  nodes > 80000L
}
