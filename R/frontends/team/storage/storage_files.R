# Local directory backend (LIPIDOMIC_STORAGE=files, the default).
# For a single local user only: no accounts and no access control. Anyone who
# can reach the app can list, load and delete every project. A shared server
# must use LIPIDOMIC_STORAGE=database.
# Layout: <root>/projects/<project>/<sha256>.zip  checkpoint bytes
#         <root>/projects/<project>/<sha256>.json metadata (written last)
# Checkpoints are content addressed like the database backend's object paths,
# so saving identical bytes twice is idempotent. A checkpoint is listed only
# once its metadata exists; interrupted saves leave nothing visible.

team_storage_files_root <- function(dir = Sys.getenv("LIPIDOMIC_STORAGE_DIR", unset = "")) {
  if (!nzchar(dir)) dir <- file.path(tools::R_user_dir("LipidomicExplorer", which = "data"), "team-projects")
  path.expand(dir)
}

team_storage_files <- function(root = team_storage_files_root()) {
  if (!team_storage_scalar(root) || !nzchar(root)) stop("Invalid storage directory.", call. = FALSE)
  project_dir <- function(project) file.path(root, "projects", project)
  paths <- function(project, id) {
    d <- project_dir(project)
    list(zip = file.path(d, paste0(id, ".zip")), meta = file.path(d, paste0(id, ".json")))
  }
  ensure_dir <- function(project) {
    d <- project_dir(project)
    if (!dir.exists(d)) {
      dir.create(root, recursive = TRUE, mode = "0700", showWarnings = FALSE)
      dir.create(file.path(root, "projects"), mode = "0700", showWarnings = FALSE)
      dir.create(d, mode = "0700", showWarnings = FALSE)
    }
    if (!dir.exists(d)) stop("Could not create project storage.", call. = FALSE)
    d
  }
  read_meta <- function(project, id) {
    p <- paths(project, id)
    if (!file.exists(p$meta) || !file.exists(p$zip)) return(NULL)
    m <- tryCatch(jsonlite::read_json(p$meta, simplifyVector = TRUE), error = function(e) NULL)
    ok <- is.list(m) && identical(m$sha256, id) && identical(m$project, project) &&
      team_storage_scalar(m$name) && team_storage_scalar(m$created_at) &&
      is.numeric(m$size_bytes) && length(m$size_bytes) == 1L
    if (!ok) stop("Checkpoint metadata is invalid.", call. = FALSE)
    team_storage_record(id, project, m$name, m$sha256, m$size_bytes, m$created_at)
  }
  verified_bytes <- function(project, id) {
    p <- paths(project, id)
    size <- file.info(p$zip)$size
    bytes <- readBin(p$zip, "raw", n = size)
    if (!identical(team_storage_sha256_raw(bytes), id)) stop("Checkpoint integrity check failed.", call. = FALSE)
    bytes
  }
  team_storage_store("files", list(
    list = function(project) {
      d <- project_dir(project)
      if (!dir.exists(d)) return(list())
      ids <- sub("\\.json$", "", list.files(d, pattern = "^[0-9a-f]{64}\\.json$"))
      records <- Filter(Negate(is.null), lapply(ids, function(id) tryCatch(read_meta(project, id),
        error = function(e) { warning("Skipping unreadable checkpoint metadata ", id, call. = FALSE); NULL })))
      if (!length(records)) return(list())
      created <- vapply(records, `[[`, "", "created_at")
      ids <- vapply(records, `[[`, "", "id")
      records[order(created, ids, decreasing = TRUE)]
    },
    save = function(project, path, label) {
      hash <- team_storage_sha256_file(path)
      ensure_dir(project)
      p <- paths(project, hash)
      existing <- tryCatch(read_meta(project, hash), error = function(e) NULL)
      if (!is.null(existing)) {
        # Same bytes already stored: verify rather than trust, then reuse.
        ok <- tryCatch({ verified_bytes(project, hash); TRUE }, error = function(e) FALSE)
        if (ok) return(existing)
      }
      bytes <- readBin(path, "raw", n = file.info(path)$size)
      if (!identical(team_storage_sha256_raw(bytes), hash))
        stop("Checkpoint changed while saving. Retry.", call. = FALSE)
      team_storage_write_atomic(p$zip, bytes = bytes)
      verified_bytes(project, hash)
      record <- team_storage_record(hash, project, paste0(label, ".zip"), hash, length(bytes),
        format(Sys.time(), "%Y-%m-%dT%H:%M:%OS3Z", tz = "UTC"))
      json <- jsonlite::toJSON(record, auto_unbox = TRUE, digits = NA)
      team_storage_write_atomic(p$meta, bytes = charToRaw(enc2utf8(as.character(json))))
      record
    },
    load = function(project, id, dest) {
      if (is.null(read_meta(project, id))) stop("Checkpoint not found.", call. = FALSE)
      team_storage_write_atomic(dest, bytes = verified_bytes(project, id))
      dest
    },
    delete = function(project, id) {
      p <- paths(project, id)
      if (!file.exists(p$meta)) stop("Checkpoint not found.", call. = FALSE)
      # Remove the listing entry first; an orphan ZIP is invisible and reused.
      unlink(p$meta)
      unlink(p$zip)
      if (file.exists(p$meta) || file.exists(p$zip)) stop("Checkpoint could not be deleted.", call. = FALSE)
      invisible(TRUE)
    }
  ))
}
