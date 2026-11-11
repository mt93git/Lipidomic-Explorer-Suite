for (pkg in c("digest", "jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_storage: package", pkg, "not installed\n"); quit(status = 0)
}
# No Shiny/application startup required for the standalone files backend.
api_abort <- function(class, message) stop(structure(list(message = message, call = NULL),
  class = c(class, "error", "condition")))
source("frontends/nexo-api/storage_files.R")
source("frontends/nexo-api/storage.R")
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

# Exercise save/prune with deterministic synthetic exports, without starting Shiny.
local({
  root <- tempfile(); on.exit(unlink(root, recursive = TRUE))
  Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_API_WORKSPACE = "lineage-test")
  on.exit(Sys.unsetenv(c("LIPIDOMIC_STORAGE_DIR", "LIPIDOMIC_API_WORKSPACE")), add = TRUE)
  `%||%` <- function(x, y) if (is.null(x)) y else x
  api_scope_allow <- function(caller, workspace) workspace
  api_canvas_validate <- function(...) list(ok = TRUE)
  api_nexo_check <- function(x) x
  api_read <- function(s, expr) expr
  api_project_records_append <- api_cohort_append <- api_nexo_append <- function(...) NULL
  api_checkpoint_save <- api_checkpoint_save
  environment(api_checkpoint_save) <- environment()
  serial <- 0L
  session <- function(lineage = NULL) {
    s <- new.env(); s$lineage <- lineage
    s$shared <- list(export_session_path = function(path) {
      serial <<- serial + 1L; writeBin(charToRaw(paste("synthetic", serial)), path)
    }); s
  }
  store <- api_store(root)
  old <- store$save("legacy", "tests/dual-ui/fixtures/classic-seed7-synthetic.zip", "autosave")
  restarted <- api_store_files(root)
  stopifnot(is.null(restarted$list("legacy")[[1L]]$lineage), file.exists(restarted$load("legacy", old$id)))
  cat("PASS old record without lineage still loads after restart\n")
  promoted <- store$save("legacy", "tests/dual-ui/fixtures/classic-seed7-synthetic.zip", "autosave", collab = TRUE)
  stopifnot(isTRUE(promoted$collab), isTRUE(api_store_files(root)$list("legacy")[[1L]]$collab))
  cat("PASS collab mark survives saving identical bytes and restart\n")
  a <- session("opened-a"); b <- session("opened-b")
  for (i in 1:7) for (s in list(a, b)) api_checkpoint_save(s, "autosave", list())
  records <- api_store_files(root)$list("lineage-test")
  stopifnot(sum(vapply(records, function(x) identical(x$lineage, "opened-a"), logical(1))) == 5L,
    sum(vapply(records, function(x) identical(x$lineage, "opened-b"), logical(1))) == 5L)
  cat("PASS two lineages in one workspace keep five autosaves each\n")
  # Exercise the dataset session constructor; keep the existing synthetic export seam.
  source("frontends/nexo-api/datasets.R", local = TRUE)
  api_sessions <- new.env(parent = emptyenv())
  api_dataset_read <- function(...) list(abundance = tempfile())
  api_dataset_choices <- function(...) list(key = "synthetic-dataset")
  api_dataset_session_open <- function(...) session()
  api_session_make_room <- function() NULL
  api_session_id <- local({ n <- 0L; function() { n <<- n + 1L; paste0("dataset-", n) } })
  api_session_bind <- function(s, collab) s
  first <- api_dataset_session("synthetic", list())
  first$dirty <- TRUE
  second <- api_dataset_session("synthetic", list())
  for (i in 1:7) for (s in list(first, second)) api_checkpoint_save(s, "autosave", list())
  records <- store$list("lineage-test")
  stopifnot(!is.null(first$lineage), !is.null(second$lineage),
    !identical(first$lineage, second$lineage),
    sum(vapply(records, function(x) identical(x$lineage, first$lineage), logical(1))) == 5L,
    sum(vapply(records, function(x) identical(x$lineage, second$lineage), logical(1))) == 5L)
  cat("PASS two dataset sessions in one project keep five autosaves each\n")
  kept <- api_checkpoint_save(a, "autosave", list(), collab = TRUE)
  for (i in 1:7) api_checkpoint_save(a, "autosave", list())
  records <- api_store_files(root)$list("lineage-test")
  stopifnot(any(vapply(records, function(x) identical(x$id, kept$id) && isTRUE(x$collab), logical(1))))
  cat("PASS collab-marked autosave is never pruned\n")
  for (i in 1:7) api_checkpoint_save(session(), "autosave", list())
  records <- store$list("lineage-test")
  stopifnot(sum(vapply(records, function(x) is.null(x$lineage), logical(1))) == 5L)
  cat("PASS autosaves without lineage retain per-workspace limit\n")
})
# FIX-PROD-G: a version (a save the collab sidecar made) is marked so Start can leave it out; marking an existing
# checkpoint as collab (same bytes) keeps it a plain checkpoint.
local({
  root <- tempfile(); on.exit(unlink(root, recursive = TRUE))
  store <- api_store_files(root)
  fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
  version <- store$save("versions", fixture, "v1 synthetic", collab = TRUE)
  stopifnot(isTRUE(version$version), isTRUE(api_store_files(root)$list("versions")[[1L]]$version))
  cat("PASS a collab save creates a version record\n")
  own <- store$save("own", fixture, "synthetic save")
  marked <- store$save("own", fixture, "v1 synthetic", collab = TRUE)
  stopifnot(isTRUE(marked$collab), is.null(marked$version), is.null(api_store_files(root)$list("own")[[1L]]$version))
  cat("PASS a collab save of existing bytes does not make it a version\n")
  stopifnot(isTRUE(api_checkpoint_record(version)$version), !"version" %in% names(api_checkpoint_record(own)))
  cat("PASS the checkpoint record passes version through\n")
})
