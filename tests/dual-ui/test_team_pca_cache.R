# Team PCA cache (R/frontends/team/prep_cache.R, team_prep_cache_pca; its hook in
# R/modules/1_shared_data_module.R, pca_results' run_pca_calc). A reopened project
# reads the stored PCA instead of recomputing it. The restored result must be
# identical() (and serialize to the same bytes) to a fresh compute, in omics and
# class mode; a changed setting is a miss; a corrupted object is discarded and the
# PCA computed live; with the cache off nothing is read or written.
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_COMPANION_AI = "0", LIPIDOMIC_JIT_WARMUP = "0")
work <- tempfile("pca-cache-test-"); dir.create(work, mode = "0700")
cache_root <- file.path(work, "cache")
Sys.setenv(LIPIDOMIC_PREP_CACHE_DIR = cache_root, LIPIDOMIC_PREP_CACHE_KEY_FILE = file.path(work, "keys", "team-prep-cache.key"))
Sys.unsetenv("LIPIDOMIC_PREP_CACHE_SECRET")
suppressPackageStartupMessages(source("R/global.R"))
stopifnot(is.function(team_prep_cache_pca), is.character(team_prep_cache_state$code))

project <- "33333333-3333-4333-8333-333333333333"
objects <- function() list.files(file.path(cache_root, project), pattern = "^[0-9a-f]{64}$", full.names = TRUE)
kind_of <- function(f) { b <- readBin(f, "raw", 1024L); nl <- which(b == as.raw(10L)); jsonlite::fromJSON(rawToChar(b[(nl[1] + 1L):(nl[2] - 1L)]))$kind }
pca_objects <- function() Filter(function(f) identical(kind_of(f), "pca"), objects())
same <- function(a, b) identical(a, b) && identical(serialize(a, NULL), serialize(b, NULL))

app_server <- function(input, output, session) {
  session$userData$team_library_bound_project <- function() project
  bridge <- shiny::reactiveVal(NULL)
  shared <- shared_data_server("data_hub", external_settings = bridge,
    preparation_policy = "team", design_check = function() TRUE, root_session = session)
  qc <- qc_boxplot_server("qc_pca_tab", shared, shiny::reactive(list()))
  shiny::observe({ shiny::req(qc()); bridge(qc()) })
  session$userData$shared <- shared
}

# One session, as a reopen: load the fixture, prepare, read the PCA. Returns the
# PCA and the cache's log lines.
open_once <- function(mode = "omics", max_pcs = 3) {
  controls <- list(normalizationMethod = "median", pcaMode = mode, maxPCs = max_pcs,
    useImputation = FALSE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = TRUE,
    minDetectionPct = 0, dropNonDetected = FALSE, detectionScope = "global",
    mergeReplicatesMode = "single", dropMisc = FALSE, imputationSeed = 42,
    classLabelFormat = "short", colorGrouping = "Group1", labelParts = "Group1",
    outlierScope = "global", outlierThreshold = 2.5)
  names(controls) <- paste0("qc_pca_tab-", names(controls))
  result <- NULL; log <- character()
  withCallingHandlers(shiny::testServer(app_server, {
    session$sendCustomMessage <- function(type, message) NULL
    do.call(session$setInputs, controls)
    matrix_path <- normalizePath("tests/guided-shared/fixtures/abundance.csv")
    metadata <- read_sample_metadata_file("tests/guided-shared/fixtures/metadata.csv", "metadata.csv")
    matrix <- read.csv(matrix_path, check.names = FALSE)
    session$setInputs(`data_hub-files` = data.frame(name = "abundance.csv",
      size = file.info(matrix_path)$size, type = "text/csv", datapath = matrix_path),
      `data_hub-selectedColumns` = names(matrix)[-1])
    session$userData$shared$set_external_sample_metadata(stage_metadata_v01(metadata,
      names(matrix)[-1], c(Group1 = "Condition", Group2 = "Tissue",
        PatientNumber = "SubjectID", Replicate = "ReplicateID", TimePoint = "TimePoint")), TRUE)
    session$setInputs(`data_hub-runAnalysis` = 1L)
    for (i in seq_len(12)) session$flushReact()
    stopifnot(identical(session$userData$shared$preparation_state()$status, "ready"))
    result <<- session$userData$shared$pca_results()
  }), message = function(m) {
    if (startsWith(conditionMessage(m), "[prep-cache]")) log <<- c(log, trimws(conditionMessage(m)))
    invokeRestart("muffleMessage")
  })
  stopifnot(is.list(result), nrow(result$score_df) > 0L)
  list(pca = result, log = log)
}
hits <- function(run) sum(grepl("hit pca", run$log, fixed = TRUE))
misses <- function(run) sum(grepl("miss pca", run$log, fixed = TRUE))

for (mode in c("omics", "class")) {
  # Fresh compute with the cache off: the reference. Nothing is read or written.
  Sys.setenv(LIPIDOMIC_PREP_CACHE = "0"); fresh <- open_once(mode); Sys.unsetenv("LIPIDOMIC_PREP_CACHE")
  stopifnot(hits(fresh) == 0L, misses(fresh) == 0L, !length(pca_objects()))
  # First open: miss, computed, stored.
  first <- open_once(mode)
  stopifnot(misses(first) >= 1L, length(pca_objects()) >= 1L, same(first$pca, fresh$pca))
  # Reopen (a new session; the process memo plays no part in the PCA): read from disk.
  second <- open_once(mode)
  stopifnot(hits(second) >= 1L, misses(second) == 0L)
  stopifnot(identical(second$pca, fresh$pca), same(second$pca, fresh$pca), same(second$pca, first$pca))
  # A different PCA setting is another key: a miss, computed live, still exact.
  other <- open_once(mode, max_pcs = 2)
  stopifnot(misses(other) >= 1L)
  Sys.setenv(LIPIDOMIC_PREP_CACHE = "0"); other_fresh <- open_once(mode, max_pcs = 2); Sys.unsetenv("LIPIDOMIC_PREP_CACHE")
  stopifnot(same(other$pca, other_fresh$pca))
  # Fail-open: every stored PCA corrupted -> discarded, computed live, identical.
  for (f in pca_objects()) { b <- readBin(f, "raw", file.size(f)); b[length(b)] <- xor(b[length(b)], as.raw(1L)); writeBin(b, f) }
  broken <- open_once(mode)
  stopifnot(any(grepl("discarded pca", broken$log, fixed = TRUE)), same(broken$pca, fresh$pca))
  # ...and the live result was stored again: the next open hits.
  again <- open_once(mode)
  stopifnot(hits(again) >= 1L, same(again$pca, fresh$pca))
  cat(sprintf("PASS %s: fresh == stored-then-restored (identical, same bytes); setting change misses; corrupted object discarded and recomputed\n", mode))
  unlink(file.path(cache_root, project), recursive = TRUE)
}
unlink(work, recursive = TRUE)
cat("PASS: Team PCA cache restores byte-identical results and fails open\n")
