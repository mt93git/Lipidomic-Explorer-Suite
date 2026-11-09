for (pkg in c("digest", "jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_storage: package", pkg, "not installed\n"); quit(status = 0)
}
# No Shiny/application startup required for the standalone files backend.
api_abort <- function(class, message) stop(structure(list(message = message, call = NULL),
  class = c(class, "error", "condition")))
source("R/frontends/api/storage_files.R")
source("R/frontends/api/storage.R")
local({
  root <- tempfile(); on.exit(unlink(root, recursive = TRUE))
  store <- api_store(root)
  fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
  record <- store$save("pilot", fixture, "roundtrip")
  again <- store$save("pilot", fixture, "duplicate label")
  stopifnot(identical(record, again), length(store$list("pilot")) == 1L,
    identical(store$list("pilot")[[1L]], record))
  dest <- file.path(root, "copy.zip")
  stopifnot(identical(store$load("pilot", record$id, dest), dest),
    identical(digest::digest(file = dest, algo = "sha256"), record$sha256))
  object <- store$load("pilot", record$id)
  if (.Platform$OS.type == "unix") stopifnot(
    bitwAnd(as.integer(file.info(object)$mode), 511L) == 384L,
    bitwAnd(as.integer(file.info(dirname(object))$mode), 511L) == 448L)
  for (project in c("../escape", "", "bad/project", paste(rep("a", 65), collapse = "")))
    stopifnot(inherits(tryCatch(store$list(project), error = identity), "api_bad_request"))
  for (label in c("", "bad\nlabel", paste(rep("a", 81), collapse = "")))
    stopifnot(inherits(tryCatch(store$save("pilot", fixture, label), error = identity), "api_bad_request"))
  # Detect content corruption even when the recorded byte count still matches.
  original <- readBin(object, "raw", n = file.info(object)$size)
  damaged <- original; damaged[1L] <- as.raw(0); writeBin(damaged, object)
  stopifnot(inherits(tryCatch(store$load("pilot", record$id), error = identity), "api_unavailable"))
  writeBin(original, object)
  # Store-first listing deduplicates the legacy folder by bytes, while its old
  # filename remains a valid resolver alias.
  previous <- Sys.getenv(c("LIPIDOMIC_STORAGE_DIR", "LIPIDOMIC_API_CHECKPOINT_DIR", "LIPIDOMIC_API_WORKSPACE"), unset = NA_character_)
  on.exit(for (key in names(previous)) if (is.na(previous[[key]])) Sys.unsetenv(key) else
    do.call(Sys.setenv, stats::setNames(list(previous[[key]]), key)), add = TRUE)
  folder <- file.path(root, "legacy"); dir.create(folder)
  stopifnot(file.copy(fixture, file.path(folder, "synthetic.zip")))
  Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_API_CHECKPOINT_DIR = folder,
    LIPIDOMIC_API_WORKSPACE = "pilot")
  listing <- api_checkpoint_list()
  stopifnot(length(listing) == 1L, listing[[1L]]$source == "store",
    identical(api_checkpoint_path("synthetic"), file.path(folder, "synthetic.zip")),
    inherits(tryCatch(api_checkpoint_delete("synthetic"), error = identity), "api_method_not_allowed"))
  store$delete("pilot", record$id)
  stopifnot(api_checkpoint_list()[[1L]]$source == "folder")
  stopifnot(length(store$list("pilot")) == 0L, !file.exists(object),
    inherits(tryCatch(store$load("pilot", record$id), error = identity), "api_not_found"))
  cat("PASS storage save/list/load/delete\n")
  # A record Team wrote with "<label>.zip" (up to 84 chars) or a damaged .json is
  # skipped with a warning; the rest of the project still lists.
  record <- store$save("pilot", fixture, "kept")
  dir <- file.path(root, "projects", "pilot")
  foreign <- paste(rep("f", 64), collapse = "")
  stopifnot(file.copy(file.path(dir, paste0(record$id, ".zip")), file.path(dir, paste0(foreign, ".zip"))))
  meta <- jsonlite::read_json(file.path(dir, paste0(record$id, ".json")))
  meta$id <- meta$sha256 <- foreign; meta$name <- paste0(paste(rep("n", 80), collapse = ""), ".zip")
  jsonlite::write_json(meta, file.path(dir, paste0(foreign, ".json")), auto_unbox = TRUE)
  writeLines("{not json", file.path(dir, paste0(paste(rep("0", 64), collapse = ""), ".json")))
  listed <- withCallingHandlers(store$list("pilot"), warning = function(w) invokeRestart("muffleWarning"))
  stopifnot(length(listed) == 1L, identical(listed[[1L]]$id, record$id))
  cat("PASS storage list skips bad records\n")
})
