#!/usr/bin/env Rscript
# Run the focused dual-frontend suite, regression suites, and both parity
# references without installing packages or mutating committed evidence.
# Usage from repository root:
#   Rscript --vanilla tests/dual-ui/run_acceptance.R BASELINE_ROOT OUTPUT_DIR

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2L || !nzchar(args[[1L]]) || !nzchar(args[[2L]])) {
  stop("Usage: Rscript --vanilla tests/dual-ui/run_acceptance.R BASELINE_ROOT OUTPUT_DIR",
       call. = FALSE)
}

repo <- normalizePath(".", winslash = "/", mustWork = TRUE)
baseline <- normalizePath(args[[1L]], winslash = "/", mustWork = TRUE)
if (!dir.exists(baseline) || !file.exists(file.path(baseline, "R", "modules", "1_shared_data_module.R"))) {
  stop("BASELINE_ROOT must be a checkout containing R/modules/1_shared_data_module.R", call. = FALSE)
}
output_arg <- path.expand(args[[2L]])
if (!dir.exists(dirname(output_arg))) dir.create(dirname(output_arg), recursive = TRUE)
output_parent <- normalizePath(dirname(output_arg), winslash = "/", mustWork = TRUE)
output_dir <- file.path(output_parent, basename(output_arg))
protected <- normalizePath(file.path(repo, "docs", "proof_artifacts"),
                           winslash = "/", mustWork = FALSE)
if (identical(output_dir, protected) || startsWith(output_dir, paste0(protected, "/"))) {
  stop("OUTPUT_DIR must not be inside docs/proof_artifacts", call. = FALSE)
}
if (identical(output_dir, repo) || startsWith(output_dir, paste0(repo, "/")))
  stop("OUTPUT_DIR must be outside the candidate checkout", call. = FALSE)
if (dir.exists(output_dir) && length(list.files(output_dir, all.files = TRUE, no.. = TRUE))) {
  stop("OUTPUT_DIR must be new or empty; refusing to overwrite prior evidence", call. = FALSE)
}
if (!dir.create(output_dir, recursive = TRUE, showWarnings = FALSE) && !dir.exists(output_dir)) {
  stop("Could not create OUTPUT_DIR: ", output_dir, call. = FALSE)
}
output_dir <- normalizePath(output_dir, winslash = "/", mustWork = TRUE)

git_value <- function(path) {
  git <- Sys.which("git")
  if (!nzchar(git)) return("unavailable: git not found")
  value <- tryCatch(system2(git, c("-C", shQuote(path), "rev-parse", "--verify", "HEAD"),
                            stdout = TRUE, stderr = FALSE), error = function(e) character())
  if (!length(value) || !nzchar(value[[1L]]) || !is.null(attr(value, "status"))) {
    "unavailable"
  } else value[[1L]]
}

info <- c(
  paste("candidate_root:", repo),
  paste("candidate_commit:", git_value(repo)),
  paste("baseline_root:", baseline),
  paste("baseline_commit:", git_value(baseline)),
  paste("started_at:", format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z")),
  paste("R:", R.version.string),
  paste("platform:", R.version$platform),
  paste("system:", paste(Sys.info()[c("sysname", "release", "machine")], collapse = " / ")),
  paste("interface_selector:", Sys.getenv("LIPIDOMIC_INTERFACE", unset = "unset")),
  "No dependencies are installed by this runner.",
  ""
)
writeLines(info, file.path(output_dir, "run-info.txt"))
writeLines(capture.output(sessionInfo()), file.path(output_dir, "sessionInfo.txt"))

dual_ui_tests <- sort(list.files("tests/dual-ui", pattern = "^test_.*\\.R$",
                                 full.names = TRUE))
regression_tests <- unlist(lapply(c("tests", "tests/block2", "tests/guided-shared"), function(dir) {
  if (!dir.exists(dir)) return(character())
  list.files(dir, pattern = "^test_.*\\.R$", full.names = TRUE)
}), use.names = FALSE)
jobs <- unique(c(
  regression_tests,
  dual_ui_tests,
  "tests/integration/compare_versions.R",
  "tests/block2/compare_references.R"
))
jobs <- jobs[file.exists(jobs)]

rscript <- file.path(R.home("bin"), "Rscript")
if (!file.exists(rscript)) stop("Rscript executable was not found", call. = FALSE)

manifest <- vector("list", length(jobs))
for (i in seq_along(jobs)) {
  job <- jobs[[i]]
  stem <- sprintf("%03d-%s", i, gsub("[^A-Za-z0-9_.-]", "_", job))
  stdout_path <- file.path(output_dir, paste0(stem, ".stdout.log"))
  stderr_path <- file.path(output_dir, paste0(stem, ".stderr.log"))
  combined_path <- file.path(output_dir, paste0(stem, ".log"))
  extra <- if (identical(job, "tests/integration/compare_versions.R")) {
    c(baseline, file.path(output_dir, "version-parity"))
  } else if (identical(job, "tests/block2/compare_references.R")) {
    file.path(output_dir, "reference-parity")
  } else character()
  command_args <- c("--vanilla", shQuote(job), shQuote(extra))
  started <- Sys.time()
  status <- tryCatch({
    rc <- system2(rscript, command_args, stdout = stdout_path, stderr = stderr_path)
    if (is.null(rc)) 0L else as.integer(rc)
  }, error = function(e) {
    writeLines(conditionMessage(e), stderr_path)
    127L
  })
  stdout_lines <- if (file.exists(stdout_path)) readLines(stdout_path, warn = FALSE) else character()
  stderr_lines <- if (file.exists(stderr_path)) readLines(stderr_path, warn = FALSE) else character()
  con <- file(combined_path, open = "wt")
  writeLines("----- stdout -----", con)
  writeLines(stdout_lines, con)
  writeLines("----- stderr -----", con)
  writeLines(stderr_lines, con)
  close(con)
  elapsed <- as.numeric(difftime(Sys.time(), started, units = "secs"))
  manifest[[i]] <- data.frame(
    sequence = i,
    test = job,
    status = if (identical(status, 0L)) "PASS" else "FAIL",
    exit_code = status,
    seconds = round(elapsed, 3),
    log = basename(combined_path),
    stdout_log = basename(stdout_path),
    stderr_log = basename(stderr_path),
    stringsAsFactors = FALSE
  )
  cat(sprintf("[%s] %s (exit %d, %.1fs)\n", manifest[[i]]$status, job, status, elapsed))
}

results <- if (length(manifest)) do.call(rbind, manifest) else data.frame()
write.csv(results, file.path(output_dir, "manifest.csv"), row.names = FALSE, na = "")
failed <- if (nrow(results)) results[results$status != "PASS", , drop = FALSE] else results
cat("Evidence directory:", output_dir, "\n")
cat(sprintf("Acceptance jobs: %d passed, %d failed\n",
            sum(results$status == "PASS"), nrow(failed)))
if (nrow(failed)) quit(save = "no", status = 1L)
