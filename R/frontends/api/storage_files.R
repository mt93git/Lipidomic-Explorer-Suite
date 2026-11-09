# Standalone files backend for production trees without Team's storage hooks.
api_storage_project <- function(project) {
  if (!is.character(project) || length(project) != 1L || is.na(project) ||
      !grepl("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$", project))
    api_abort("api_bad_request", "Invalid workspace id.")
  project
}
api_storage_label <- function(label) {
  if (!is.character(label) || length(label) != 1L || is.na(label) ||
      nchar(label) < 1L || nchar(label) > 80L || grepl("[[:cntrl:]]", label))
    api_abort("api_bad_request", "Use a label of 1-80 characters without control characters.")
  label
}
api_storage_id <- function(id) is.character(id) && length(id) == 1L &&
  !is.na(id) && grepl("^[0-9a-f]{64}$", id)
api_storage_io <- function(expr) tryCatch(expr, error = function(e) {
  if (any(grepl("^api_", class(e)))) stop(e)
  api_abort("api_unavailable", conditionMessage(e))
})
api_storage_dir <- function(path) {
  if (!dir.exists(path)) {
    parent <- dirname(path)
    if (!dir.exists(parent)) api_storage_dir(parent)
    if (!dir.create(path, mode = "0700") && !dir.exists(path)) stop("Cannot create checkpoint directory.")
  }
  if (!Sys.chmod(path, "0700")) stop("Cannot secure checkpoint directory.")
  path
}
api_storage_atomic <- function(path, writer) {
  tmp <- tempfile(".checkpoint-", tmpdir = dirname(path))
  on.exit(unlink(tmp))
  old <- Sys.umask("0077"); on.exit(Sys.umask(old), add = TRUE)
  writer(tmp)
  if (!Sys.chmod(tmp, "0600") || !file.rename(tmp, path)) stop("Cannot commit checkpoint file.")
  invisible(path)
}
api_store_files <- function(root) {
  if (!is.character(root) || length(root) != 1L || is.na(root) || !nzchar(root))
    api_abort("api_unavailable", "Checkpoint storage directory is not configured.")
  root <- api_storage_io(api_storage_dir(root))
  project_dir <- function(project) file.path(root, "projects", api_storage_project(project))
  record <- function(project, id) {
    dir <- project_dir(project)
    if (!api_storage_id(id)) return(NULL)
    meta <- file.path(dir, paste0(id, ".json")); zip <- file.path(dir, paste0(id, ".zip"))
    if (!file.exists(meta) || !file.exists(zip)) return(NULL)
    x <- jsonlite::read_json(meta, simplifyVector = TRUE)
    if (!identical(x$id, id) || !identical(x$sha256, id) || !identical(x$project, project) ||
        !identical(as.numeric(x$size_bytes), as.numeric(file.info(zip)$size))) stop("Invalid checkpoint metadata.")
    api_storage_label(x$name)
    x$size_bytes <- as.numeric(x$size_bytes)
    x
  }
  list_records <- function(project) api_storage_io({
    dir <- project_dir(project)
    ids <- sub("[.]json$", "", list.files(dir, pattern = "^[0-9a-f]{64}[.]json$"))
    # One damaged or foreign record (Team names its files "<label>.zip") must not
    # hide the rest of the project: skip it with a warning, as Team's backend does.
    records <- Filter(Negate(is.null), lapply(ids, function(id) tryCatch(record(project, id),
      error = function(e) { warning("Skipping checkpoint ", id, ": ", conditionMessage(e), call. = FALSE); NULL })))
    if (length(records)) records <- records[order(vapply(records, `[[`, character(1), "created_at"), decreasing = TRUE)]
    unname(records)
  })
  load_record <- function(project, id, dest = NULL) api_storage_io({
    x <- record(project, id)
    if (is.null(x)) api_abort("api_not_found", "Unknown checkpoint.")
    path <- file.path(project_dir(project), paste0(id, ".zip"))
    if (!identical(digest::digest(file = path, algo = "sha256"), x$sha256)) stop("Checkpoint integrity check failed.")
    if (!is.null(dest)) {
      api_storage_atomic(dest, function(tmp) if (!file.copy(path, tmp)) stop("Cannot copy checkpoint."))
      path <- dest
    }
    path
  })
  list(list = list_records,
    save = function(project, path, label) api_storage_io({
      dir <- project_dir(project); api_storage_label(label)
      api_storage_dir(file.path(root, "projects")); api_storage_dir(dir)
      id <- digest::digest(file = path, algo = "sha256")
      existing <- record(project, id)
      if (!is.null(existing)) { load_record(project, id); return(existing) }
      zip <- file.path(dir, paste0(id, ".zip"))
      api_storage_atomic(zip, function(tmp) {
        if (!file.copy(path, tmp) || !identical(digest::digest(file = tmp, algo = "sha256"), id))
          stop("Cannot copy checkpoint or source changed during save.")
      })
      x <- list(id = id, project = project, name = label, sha256 = id,
        size_bytes = unname(file.info(zip)$size),
        created_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%OS6Z", tz = "UTC"))
      # Metadata is the commit marker and is always published last.
      api_storage_atomic(file.path(dir, paste0(id, ".json")), function(tmp)
        jsonlite::write_json(x, tmp, auto_unbox = TRUE, digits = NA))
      x
    }), load = load_record,
    delete = function(project, id) api_storage_io({
      if (is.null(record(project, id))) api_abort("api_not_found", "Unknown checkpoint.")
      dir <- project_dir(project)
      # Withdraw the commit marker before removing the object.
      if (unlink(file.path(dir, paste0(id, ".json"))) != 0L ||
          unlink(file.path(dir, paste0(id, ".zip"))) != 0L) stop("Cannot delete checkpoint.")
      invisible(TRUE)
    }))
}
