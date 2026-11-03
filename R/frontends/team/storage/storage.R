# Team-only checkpoint storage API. Sourced exclusively by
# R/frontends/team/bootstrap.R; Classic never loads this directory.
#
# One contract, two backends selected by LIPIDOMIC_STORAGE:
#   files    (default) local per-project directories, see storage_files.R
#   database the Supabase project library used by the Team pilot, see
#            storage_database.R
#
# A store is a list of four operations plus its kind:
#   store$list(project)                 -> list of checkpoint records, newest first
#   store$save(project, path, label)    -> record (idempotent for identical bytes)
#   store$load(project, id, dest=NULL)  -> path of a verified local ZIP copy
#   store$delete(project, id)           -> invisible(TRUE)
# A record is list(id, project, name, sha256, size_bytes, created_at).
# Every operation validates identifiers before any path or URL is built, and
# load always verifies sha256 before returning bytes to the caller.

team_storage_backends <- c("files", "database")

team_storage_backend <- function(value = Sys.getenv("LIPIDOMIC_STORAGE", unset = "")) {
  if (!is.character(value) || length(value) != 1L || is.na(value))
    stop("LIPIDOMIC_STORAGE must be 'files' (default) or 'database' (alias 'db').", call. = FALSE)
  normalized <- tolower(trimws(value))
  if (!nzchar(normalized)) normalized <- "files"
  if (identical(normalized, "db")) normalized <- "database" # accepted alias
  if (!normalized %in% team_storage_backends)
    stop(sprintf("LIPIDOMIC_STORAGE must be 'files' (default) or 'database' (alias 'db'); got '%s'.",
      substr(value, 1L, 40L)), call. = FALSE)
  normalized
}

# Startup check for the Team process: fail before any session opens.
# `has_package` is injectable so tests can simulate missing httr/filelock.
team_storage_validate_config <- function(backend = team_storage_backend(),
                                         has_package = function(pkg) requireNamespace(pkg, quietly = TRUE)) {
  backend <- team_storage_backend(backend)
  if (identical(backend, "database")) {
    if (!isTRUE(has_package("httr")))
      stop("LIPIDOMIC_STORAGE=database needs the httr package. Install it or use LIPIDOMIC_STORAGE=files.", call. = FALSE)
    vars <- paste0("LIPIDOMIC_", c("AUTH", "REST", "STORAGE"), "_URL")
    missing <- vars[!nzchar(Sys.getenv(vars, unset = ""))]
    if (length(missing))
      stop("LIPIDOMIC_STORAGE=database requires ", paste(missing, collapse = ", "),
        ". Set them in the launch environment or use LIPIDOMIC_STORAGE=files.", call. = FALSE)
  } else {
    root <- team_storage_files_root()
    if (file.exists(root) && !dir.exists(root))
      stop("LIPIDOMIC_STORAGE_DIR must name a directory: ", root, call. = FALSE)
  }
  # The durable checkpoint queue (team_library_queue) is enabled by
  # LIPIDOMIC_UPLOAD_QUEUE, for either backend, and locks with filelock.
  if (nzchar(Sys.getenv("LIPIDOMIC_UPLOAD_QUEUE", unset = "")) && !isTRUE(has_package("filelock")))
    stop("The Team checkpoint queue (LIPIDOMIC_UPLOAD_QUEUE) needs the filelock package. ",
      "Install it or unset LIPIDOMIC_UPLOAD_QUEUE.", call. = FALSE)
  invisible(backend)
}

team_storage_scalar <- function(x) is.character(x) && length(x) == 1L && !is.na(x)

# Identifiers never contain '.', '/' or '\\', so they cannot traverse paths or
# alter URLs. The database requires canonical lowercase UUIDs.
team_storage_uuid_pattern <- "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
team_storage_sha256_pattern <- "^[0-9a-f]{64}$"

team_storage_check_project <- function(project, kind) {
  pattern <- if (identical(kind, "database")) team_storage_uuid_pattern else "^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"
  if (!team_storage_scalar(project) || !grepl(pattern, project)) stop("Invalid project.", call. = FALSE)
  project
}

team_storage_check_id <- function(id, kind) {
  pattern <- if (identical(kind, "database")) team_storage_uuid_pattern else team_storage_sha256_pattern
  if (!team_storage_scalar(id) || !grepl(pattern, id)) stop("Invalid checkpoint.", call. = FALSE)
  id
}

team_storage_check_label <- function(label) {
  if (!team_storage_scalar(label)) stop("Use a checkpoint name between 1 and 80 characters.", call. = FALSE)
  label <- trimws(label)
  if (!nzchar(label) || nchar(label) > 80L || grepl("[[:cntrl:]]", label))
    stop("Use a checkpoint name between 1 and 80 characters.", call. = FALSE)
  label
}

team_storage_sha256_file <- function(path) digest::digest(file = path, algo = "sha256")
team_storage_sha256_raw <- function(bytes) digest::digest(bytes, algo = "sha256", serialize = FALSE)

team_storage_record <- function(id, project, name, sha256, size_bytes, created_at) {
  list(id = id, project = project, name = name, sha256 = sha256,
    size_bytes = as.numeric(size_bytes), created_at = created_at)
}

# Write raw bytes or a copy of a file next to `dest`, then rename into place,
# so readers never observe a partially written file.
team_storage_write_atomic <- function(dest, bytes = NULL, from = NULL) {
  dir <- dirname(dest)
  if (!dir.exists(dir)) dir.create(dir, recursive = TRUE, mode = "0700", showWarnings = FALSE)
  tmp <- tempfile(pattern = ".tmp-", tmpdir = dir)
  on.exit(if (file.exists(tmp)) unlink(tmp), add = TRUE)
  ok <- if (!is.null(from)) file.copy(from, tmp, overwrite = FALSE) else {
    writeBin(bytes, tmp); TRUE
  }
  if (!isTRUE(ok)) stop("Could not write checkpoint storage.", call. = FALSE)
  Sys.chmod(tmp, "0600")
  # POSIX rename replaces atomically; Windows refuses an existing target.
  renamed <- suppressWarnings(file.rename(tmp, dest))
  if (!renamed && file.exists(dest)) { unlink(dest); renamed <- file.rename(tmp, dest) }
  if (!renamed) stop("Could not write checkpoint storage.", call. = FALSE)
  invisible(dest)
}

# Wrap a backend implementation with the shared validation so both backends
# reject the same inputs before touching disk or network.
team_storage_store <- function(kind, impl) {
  stopifnot(all(c("list", "save", "load", "delete") %in% names(impl)))
  structure(list(
    kind = kind,
    # Validate eagerly: R arguments are lazy, so never pass an unchecked promise.
    list = function(project) {
      project <- team_storage_check_project(project, kind)
      impl$list(project)
    },
    save = function(project, path, label) {
      project <- team_storage_check_project(project, kind)
      label <- team_storage_check_label(label)
      if (!team_storage_scalar(path) || !file.exists(path) || dir.exists(path) || !isTRUE(file.info(path)$size > 0))
        stop("Checkpoint file is missing or empty.", call. = FALSE)
      impl$save(project, path, label)
    },
    load = function(project, id, dest = NULL) {
      project <- team_storage_check_project(project, kind)
      id <- team_storage_check_id(id, kind)
      if (is.null(dest)) dest <- tempfile(fileext = ".zip")
      if (!team_storage_scalar(dest)) stop("Invalid destination.", call. = FALSE)
      impl$load(project, id, dest)
    },
    delete = function(project, id) {
      project <- team_storage_check_project(project, kind)
      id <- team_storage_check_id(id, kind)
      impl$delete(project, id)
      invisible(TRUE)
    }
  ), class = "team_storage")
}

team_storage_open <- function(backend = team_storage_backend(), ...) {
  switch(team_storage_backend(backend),
    files = team_storage_files(...),
    database = team_storage_database(...))
}

# One store per Shiny session. Database credentials stay inside the session:
# pass `token` as a function (e.g. the session's refreshing access()) so the
# store never caches or exposes it beyond the closure.
team_storage_session <- function(session, token = NULL, backend = team_storage_backend(), ...) {
  store <- if (identical(team_storage_backend(backend), "database")) {
    team_storage_open(backend, token = token, ...)
  } else team_storage_open(backend, ...)
  session$userData$team_storage <- store
  store
}
