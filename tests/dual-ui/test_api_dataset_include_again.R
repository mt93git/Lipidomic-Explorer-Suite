# FIX-PROD-C 3: a project saved before sample decisions became Team's outlierTreatments (C3 until 2026-11-10) holds an
# excluded sample by leaving it out of `samples`. Including it again (CheckScreen excluding, projects.mjs decided) puts
# it back in `samples`, after the others: the board must then prepare exactly what a never-excluded project prepares,
# with the samples in the workbook's column order as Team's own sample checkbox group gives them.
for (pkg in c("jsonlite", "readxl", "writexl", "openxlsx")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_dataset_include_again: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_dataset_include_again")
source("frontends/nexo-api/engine.R")
source("frontends/nexo-api/datasets.R")
fixture <- "tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx"
samples <- c("Control_1", "Control_2", "Control_3", "Treated_1", "Treated_2", "Treated_3")
base <- list(minDetectionPct = 50, detectionScope = "global", dropNonDetected = TRUE, normalizationMethod = "median",
  useImputation = TRUE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = FALSE)
prepared <- function(settings) {
  s <- api_dataset_session(fixture, settings); on.exit(api_session_close(s))
  api_read(s, s$shared$data_processed_allow_missing())
}
row <- function(choice) list(list(sample = "Control_2", choice = choice, by = "synthetic-user"))
others <- setdiff(samples, "Control_2")

old <- prepared(c(base, list(samples = others, outlierDecisions = row("exclude"))))
stopifnot(!"Control_2" %in% names(old))
cat("PASS the old form (Control_2 left out of samples) prepares without Control_2\n")

never <- prepared(c(base, list(samples = samples)))
again <- prepared(c(base, list(samples = c(others, "Control_2"), outlierDecisions = row("keep"))))
if (!identical(names(again), names(never))) stop("included again, the columns are ", paste(names(again), collapse = ", "))
# Team's selection order reaches its preparation (QRILC imputes in that order): the same samples in another order are
# not the same prepared data.
if (!identical(again, never)) stop("included again, the prepared values differ from a never-excluded project: ",
  paste(all.equal(again, never), collapse = "; "))
cat("PASS included again, Control_2 is prepared as in a project that never excluded it\n")

excluded <- prepared(c(base, list(samples = c(others, "Control_2"), outlierTreatments = list(Control_2 = "remove"),
  outlierDecisions = row("exclude"))))
stopifnot(identical(excluded, old))
cat("PASS the old exclusion as Team's outlierTreatments prepares the same data as the old form\n")
cat("PASS test_api_dataset_include_again\n")
