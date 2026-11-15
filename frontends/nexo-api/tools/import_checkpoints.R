# Offline operator tool: use Team's engine, never start plumber or workers.
args <- commandArgs(trailingOnly = TRUE)
verify_only <- "--verify-only" %in% args
args <- args[args != "--verify-only"]
if (length(args) != 8L || !setequal(args[seq(1L, 8L, 2L)], c("--manifest", "--storage", "--workspace", "--report")))
  stop("Expected --manifest <file.tsv> --storage <dir> --workspace <name> --report <out.tsv> [--verify-only]")
opts <- setNames(as.list(args[seq(2L, 8L, 2L)]), args[seq(1L, 8L, 2L)])
Sys.setenv(LIPIDOMIC_API_CHECKPOINT_DIR = opts[["--storage"]], LIPIDOMIC_STORAGE_DIR = opts[["--storage"]],
  LIPIDOMIC_API_WORKSPACE = opts[["--workspace"]], LIPIDOMIC_API_WORKERS = "0",
  LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
api_dir <- normalizePath(file.path(dirname(sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE)[1L])), ".."))
api_root <- Sys.getenv("LIPIDOMIC_API_ROOT", ".")
if (nzchar(api_root) && api_root != ".") setwd(api_root)
suppressPackageStartupMessages(source("R/global.R", local = globalenv()))
source(file.path(api_dir, "requirements.R"), local = globalenv())
missing <- api_missing_team_symbols()
if (length(missing)) stop("Nexo API requires these Team symbols: ", paste(missing, collapse = ", "))
for (file in c("health.R", "session.R", "schema.R", "catalog.R", "cards.R", "export.R", "storage_files.R",
  "storage.R", "analysis.R", "palette.R", "cohort.R", "nexo_store.R", "render_disk.R", "pool.R", "revision.R"))
  source(file.path(api_dir, file), local = globalenv())
source(file.path(api_dir, "tools", "checkpoint_comparison.R"), local = globalenv())
invisible(api_catalog())
workspace <- api_workspace()
manifest <- read.delim(opts[["--manifest"]], colClasses = "character", check.names = FALSE,
  quote = "", comment.char = "", na.strings = NULL)
if (!identical(names(manifest), c("path", "label"))) stop("Manifest must have path and label columns.")

# Team materializes default inputs on open and regenerates receipt bookkeeping.
# Compare every original input by name, plus all scientific state (including design
# metadata), without treating those new defaults as edits to the checkpoint.
science <- function(archive, path, input_names) {
  analysis <- archive$shared
  analysis$applied$request_id <- NULL
  analysis$applied$completed_at <- NULL
  analysis$applied$revision <- NULL
  state <- archive$state
  state$inputs <- state$inputs[intersect(input_names, names(state$inputs))]
  state$uploads <- lapply(state$uploads, function(member)
    digest::digest(file = file.path(archive$directory, member), algo = "sha256"))
  list(state = state, analysis = analysis, cohort = api_cohort_read(path),
    cards = archive$canvas$nodes %||% list())
}

import_row <- function(path, label) {
  row <- list(label = label, sha256 = "", size_bytes = NA_real_, imported = "no",
    cards = 0L, cards_rendered = 0L, equal = "no", differences = "",
    metadata_id_policy = "must match: hash of scientific metadata; changes require review", error = "")
  stage <- tempfile("import-verify-"); dir.create(stage)
  on.exit(unlink(stage, recursive = TRUE))
  s <- NULL; original <- NULL; restored <- NULL
  on.exit({
    if (!is.null(s)) api_session_close(s)
    if (!is.null(original)) unlink(original$directory, recursive = TRUE)
    if (!is.null(restored)) unlink(restored$directory, recursive = TRUE)
  }, add = TRUE)
  destination <- Sys.getenv("LIPIDOMIC_STORAGE_DIR")
  on.exit(Sys.setenv(LIPIDOMIC_STORAGE_DIR = destination), add = TRUE)
  tryCatch({
    row$size_bytes <- unname(file.info(path)$size)
    if (is.na(row$size_bytes)) stop("Checkpoint file is unavailable.")
    row$sha256 <- digest::digest(file = path, algo = "sha256")
    if (row$size_bytes > 90 * 1024^2) stop("Checkpoint exceeds 90 MiB.")
    api_storage_label(label)
    original <- read_session_archive(path, include_team_canvas = TRUE)
    if (!verify_only) {
      store <- api_store()
      exists <- any(vapply(store$list(workspace), function(x) identical(x$sha256, row$sha256), logical(1)))
      store$save(workspace, path, label)
      row$imported <- if (exists) "already" else "yes"
    }
    # A scratch copy uses the real checkpointId open path even in verify-only mode.
    Sys.setenv(LIPIDOMIC_STORAGE_DIR = stage)
    record <- api_store()$save(workspace, path, label)
    s <- api_checkpoint_session(record$id)
    nodes <- Filter(function(n) identical(n$kind %||% "plot", "plot"), s$canvas$nodes %||% list())
    row$cards <- length(nodes)
    for (node in nodes) {
      instance <- node$instance$id %||% node$instance$instanceId %||% api_card_fixed_id(node$id)
      api_card_render(s, instance, 800, 600, "auto", dpr = 1L)
      row$cards_rendered <- row$cards_rendered + 1L
    }
    saved <- api_checkpoint_save(s, label, list(token = "import-verification", state = s$canvas))
    saved_path <- api_store()$load(workspace, saved$id)
    restored <- read_session_archive(saved_path, include_team_canvas = TRUE)
    input_names <- sort(names(original$state$inputs))
    comparison <- api_checkpoint_comparison(science(original, path, input_names),
      science(restored, saved_path, input_names))
    row$differences <- comparison$differences
    row$equal <- comparison$equal
  }, error = function(e) row$error <<- conditionMessage(e))
  as.data.frame(row, stringsAsFactors = FALSE)
}
report <- data.frame(label = character(), sha256 = character(), size_bytes = numeric(), imported = character(),
  cards = integer(), cards_rendered = integer(), equal = character(),
  differences = character(), metadata_id_policy = character(), error = character())
for (i in seq_len(nrow(manifest))) report <- rbind(report, import_row(manifest$path[i], manifest$label[i]))
write.table(report, opts[["--report"]], sep = "\t", quote = TRUE, row.names = FALSE, na = "")
ok <- report$error == "" & report$equal == "yes" & report$cards == report$cards_rendered &
  (verify_only | report$imported %in% c("yes", "already"))
quit(status = if (all(ok)) 0L else 1L)
