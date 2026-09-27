# tests/test_targeted_fallback_simulation.R
# Unit test simulation for targeted lipid mode fallback behavior

suppressPackageStartupMessages(library(shiny))
source("R/modules/utils_targeted_lipids.R")

cat("Checking TARGETED_FALLBACK_MESSAGE:\n")
cat(TARGETED_FALLBACK_MESSAGE, "\n\n")

stopifnot(grepl("Couldn't display the plot with selected lipid", TARGETED_FALLBACK_MESSAGE))
stopifnot(grepl("All Matrix has been used", TARGETED_FALLBACK_MESSAGE))
stopifnot(grepl("Lipid Class Filters", TARGETED_FALLBACK_MESSAGE))
stopifnot(grepl("Cohort and Filter", TARGETED_FALLBACK_MESSAGE))

cat("TARGETED_FALLBACK_MESSAGE text verified.\n")

# Test UI generator
banner <- targeted_fallback_banner_ui(TRUE)
stopifnot(!is.null(banner))
banner_null <- targeted_fallback_banner_ui(FALSE)
stopifnot(is.null(banner_null))

cat("targeted_fallback_banner_ui verified.\n")

# Verify fallback trigger simulation on mock PCA
mock_full_matrix <- matrix(rnorm(100), nrow = 10, ncol = 10)
rownames(mock_full_matrix) <- paste0("Lipid_", 1:10)

# Simulate targeted list of only 1 lipid
targeted_lipids <- c("Lipid_1")
targeted_mode_active <- TRUE

compute_pca_mock <- function(mat, targeted_active, targeted_list, full_list) {
  fallback_used <- FALSE
  use_lipids <- if (targeted_active) targeted_list else full_list
  
  if (targeted_active && length(use_lipids) < 2) {
    fallback_used <- TRUE
    use_lipids <- full_list
  }
  
  sub_mat <- mat[use_lipids, , drop = FALSE]
  pca <- prcomp(t(sub_mat), scale. = FALSE)
  list(pca = pca, fallback_used = fallback_used, n_lipids = length(use_lipids))
}

res <- compute_pca_mock(mock_full_matrix, targeted_mode_active, targeted_lipids, rownames(mock_full_matrix))
stopifnot(isTRUE(res$fallback_used))
stopifnot(res$n_lipids == 10)
cat("PCA fallback simulation verified.\n")

# Verify sample correlation simulation
compute_corr_mock <- function(mat, targeted_active, targeted_list, full_list) {
  fallback_used <- FALSE
  use_lipids <- if (targeted_active) targeted_list else full_list
  if (targeted_active && length(use_lipids) < 3) {
    fallback_used <- TRUE
    use_lipids <- full_list
  }
  sub_mat <- mat[use_lipids, , drop = FALSE]
  c_mat <- cor(sub_mat, use = "pairwise.complete.obs")
  list(cor = c_mat, fallback_used = fallback_used, n_features = nrow(sub_mat))
}

res_corr <- compute_corr_mock(mock_full_matrix, targeted_mode_active, targeted_lipids, rownames(mock_full_matrix))
stopifnot(isTRUE(res_corr$fallback_used))
stopifnot(res_corr$n_features == 10)
cat("Correlation fallback simulation verified.\n")

cat("\nALL TARGETED FALLBACK UNIT TESTS PASSED SUCCESSFULLY!\n")
