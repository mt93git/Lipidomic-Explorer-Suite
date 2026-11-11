# Quality summary uses Team's prepared PCA and normalized matrix.
`%||%` <- function(x, y) if (is.null(x)) y else x
source("frontends/nexo-api/datasets.R")
api_read <- function(s, expr) expr
samples <- paste0("Sample_", 1:10)
scores <- data.frame(FullName = samples, Group1 = "Synthetic", PC1 = c(-.4, -.3, -.2, -.1, 0, .1, .2, .3, .4, 20),
  PC2 = c(.1, -.1, .2, -.2, .3, -.3, .4, -.4, 0, 15))
prepared <- data.frame(Lipid_Name = paste0("L", 1:4))
for (id in samples) prepared[[id]] <- c(1, 3, 7, 15)
s <- list(shared = list(pca_results = function() list(score_df = scores, var_PC = c(70, 20)),
  data_processed_allow_missing = function() prepared), dataset_missing = lapply(samples, function(id) list(sample = id, missing = 1, of = 4)))
q <- api_dataset_quality(s)
stopifnot(q$limit == 2.5, identical(as.numeric(q$variance), c(70, 20)), length(q$pca) == 10,
  identical(vapply(q$pca, function(x) x$flagged, logical(1)), c(rep(FALSE, 9), TRUE)),
  q$spread[[1]]$median == 2.5, q$missing[[1]]$missing == 1)
cat("PASS quality flags only planted outlier and summarizes normalized spread and pre-imputation missing\n")
scores$PC2 <- NULL
q <- api_dataset_quality(s)
stopifnot(!any(vapply(q$pca, function(x) x$flagged, logical(1))))
cat("PASS quality follows Team single-component outlier guard\n")

# Run the same check on an actual prepared synthetic workbook, not hand-authored PCA.
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_dataset_quality")
source("frontends/nexo-api/engine.R")
source("frontends/nexo-api/datasets.R")
local({
  wb <- openxlsx::loadWorkbook("tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx")
  base <- as.data.frame(readxl::read_excel("tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx", sheet = "Abundance"))
  df <- data.frame(Lipid = base$Lipid)
  set.seed(123)
  for (i in seq_along(samples)) df[[samples[[i]]]] <- 2^(seq(10, 15, length.out = nrow(df)) + rnorm(nrow(df), 0, .3))
  df[[samples[[10]]]] <- df[[samples[[10]]]] * 2^rep(c(-6, 6), length.out = nrow(df))
  df[[samples[[1]]]][1L] <- NA_real_
  meta <- data.frame(FullName = samples, Group1Term = "Synthetic", Group2Term = "Plasma",
    ReplicateTerm = as.character(seq_along(samples)), PatientTerm = paste0("Unit_", seq_along(samples)), TimePointTerm = "")
  for (sheet in c("Abundance", "Metadata")) { openxlsx::removeWorksheet(wb, sheet); openxlsx::addWorksheet(wb, sheet) }
  openxlsx::writeData(wb, "Abundance", df); openxlsx::writeData(wb, "Metadata", meta)
  openxlsx::worksheetOrder(wb) <- match(api_dataset_sheets, names(wb))
  path <- tempfile(fileext = ".xlsx"); on.exit(unlink(path))
  openxlsx::saveWorkbook(wb, path)
  settings <- list(samples = samples, minDetectionPct = 0, detectionScope = "global", dropNonDetected = TRUE,
    normalizationMethod = "median", useImputation = TRUE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = FALSE)
  live <- api_dataset_session(path, settings); on.exit(api_session_close(live), add = TRUE)
  summary <- api_dataset_quality(live)
  stopifnot(identical(vapply(summary$pca, function(x) x$flagged, logical(1)), c(rep(FALSE, 9), TRUE)),
    summary$missing[[1]]$missing == 1, all(vapply(summary$missing[-1], function(x) x$missing == 0, logical(1))))
  cat("PASS actual Team preparation PCA flags planted workbook outlier only\n")
})
