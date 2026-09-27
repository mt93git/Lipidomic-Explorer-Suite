# Ensure UTF-8 locale
tryCatch(Sys.setlocale("LC_ALL", "en_US.UTF-8"), error = function(e) NULL)

cat(">>> Running Statistical & Mathematical Engine Unit Tests...\n\n")

# Ensure TEST_LIB_PATH or isolated library is in .libPaths() if running under CI or custom env
test_lib <- Sys.getenv("TEST_LIB_PATH")
if (nzchar(test_lib) && dir.exists(test_lib) && !(test_lib %in% .libPaths())) {
  .libPaths(c(test_lib, .libPaths()))
}

# Load dependencies
source("R/modules/utils_stats.R")
source("R/modules/14_cellular_org_module.R")
source("R/global.R")

# -----------------------------------------------------------------------------
# 1. TEST: Cellular Peroxidation Index (CPI) with Trienoic Fatty Acids (db = 3)
# -----------------------------------------------------------------------------
cat("[TEST 1] Auditing Cellular Peroxidation Index (calculate_cpi)...\n")

# A. Empty / Zero inputs
stopifnot(calculate_cpi(numeric(0), numeric(0)) == 0)
stopifnot(calculate_cpi(c(0, 0), c(1, 2)) == 0)

# B. Saturated fatty acids only (db = 0)
val_sat <- c(100, 200)
db_sat  <- c(0, 0)
stopifnot(calculate_cpi(val_sat, db_sat) == 0)

# C. Pure Tri-unsaturated fatty acid (db = 3, e.g., ALA 18:3 or DGLA 20:3)
# With 100% trienoic fatty acids, CPI must equal exactly 2.0 * 100 = 200.0
val_tri <- c(50, 50)
db_tri  <- c(3, 3)
cpi_tri <- calculate_cpi(val_tri, db_tri)
cat(sprintf("  - Pure trienoic (db=3) CPI: %.4f (expected: 200.0000)\n", cpi_tri))
stopifnot(abs(cpi_tri - 200.0) < 1e-6)

# D. Multi-unsaturated mixed profile
# 1 mono (18:1), 1 di (18:2), 1 tri (18:3), 1 tetra (20:4), 1 penta (20:5), 1 hexa (22:6)
# Each with abundance = 10 (Total = 60). Each is 100/6% of the pool.
values_mix <- c(10, 10, 10, 10, 10, 10)
db_mix     <- c(1,  2,  3,  4,  5,  6)
cpi_mix <- calculate_cpi(values_mix, db_mix)
expected_cpi <- (0.014 * 100/6) + (1.0 * 100/6) + (2.0 * 100/6) + (3.2 * 100/6) + (4.0 * 100/6) + (5.4 * 100/6)
cat(sprintf("  - Mixed lipidome CPI: %.4f (expected: %.4f)\n", cpi_mix, expected_cpi))
stopifnot(abs(cpi_mix - expected_cpi) < 1e-6)
cat("  [PASS] calculate_cpi correctly includes tri-unsaturated fatty acids (db = 3, weight 2.0).\n\n")

# -----------------------------------------------------------------------------
# 2. TEST: Auto-Routing Engine & Sample Size Guard (n >= 5)
# -----------------------------------------------------------------------------
cat("[TEST 2] Auditing Auto-Route Statistical Engine (auto_route_statistical_method)...\n")

# A. Small Sample Size (n = 3 per group, e.g., typical triplicate experiment)
# Highly skewed data matrix (e.g. log-normal tail)
set.seed(42)
mat_skewed_small <- matrix(rlnorm(30 * 6, meanlog = 2, sdlog = 2), nrow = 30, ncol = 6)
meta_small <- data.frame(
  Sample = paste0("S", 1:6),
  Group = factor(c("Ctrl", "Ctrl", "Ctrl", "Treat", "Treat", "Treat"))
)

# Even though skewness is high, small sample size (n = 3 < 5) must preserve limma!
route_small <- auto_route_statistical_method(mat_skewed_small, meta_small, "Group")
cat(sprintf("  - Small sample size (n=3) with high skewness route: '%s' (expected: 'limma')\n", route_small))
stopifnot(route_small == "limma")

# B. Large Sample Size (n = 10 per group) with Symmetric Data
mat_symmetric_large <- matrix(rnorm(30 * 20, mean = 10, sd = 1), nrow = 30, ncol = 20)
meta_large <- data.frame(
  Sample = paste0("S", 1:20),
  Group = factor(rep(c("Ctrl", "Treat"), each = 10))
)
route_sym_large <- auto_route_statistical_method(mat_symmetric_large, meta_large, "Group")
cat(sprintf("  - Large sample size (n=10) with symmetric data route: '%s' (expected: 'limma')\n", route_sym_large))
stopifnot(route_sym_large == "limma")

# C. Large Sample Size (n = 10 per group) with Highly Skewed Data (skewness > 1.5)
mat_skewed_large <- matrix(rlnorm(30 * 20, meanlog = 1, sdlog = 2), nrow = 30, ncol = 20)
route_skew_large <- auto_route_statistical_method(mat_skewed_large, meta_large, "Group")
cat(sprintf("  - Large sample size (n=10) with skewed data route: '%s' (expected: 'non_parametric')\n", route_skew_large))
stopifnot(route_skew_large == "non_parametric")
cat("  [PASS] auto_route_statistical_method correctly guards statistical power for n < 5.\n\n")

# -----------------------------------------------------------------------------
# 3. TEST: Contrast String Construction
# -----------------------------------------------------------------------------
cat("[TEST 3] Auditing Limma Contrast Construction (construct_contrast_string)...\n")

c_str1 <- construct_contrast_string(c("WT"), c("KO"))
cat(sprintf("  - 1 vs 1 contrast: '%s'\n", c_str1))
stopifnot(c_str1 == "(KO)/1 - (WT)/1")

c_str2 <- construct_contrast_string(c("WT_0h", "WT_2h"), c("KO_0h", "KO_2h"))
cat(sprintf("  - 2 vs 2 contrast: '%s'\n", c_str2))
stopifnot(c_str2 == "(KO_0h+KO_2h)/2 - (WT_0h+WT_2h)/2")
cat("  [PASS] construct_contrast_string produces valid mathematical syntax.\n\n")

# -----------------------------------------------------------------------------
# 4. TEST: Nomenclature Shielding & Delimiter Restoration
# -----------------------------------------------------------------------------
cat("[TEST 4] Auditing Nomenclature Shielding (mask_clinical_classifications)...\n")

# Default protected term
sample_default <- "Septic_Shock_R1_0h"
shielded_default <- mask_clinical_classifications(sample_default)
stopifnot(shielded_default == "SepticSHIELDShock_R1_0h")
restored_default <- restore_delimiters(shielded_default)
stopifnot(restored_default == sample_default)

# Custom protected term
sample_custom <- "Acute_Pancreatitis_R2_24h"
shielded_custom <- mask_clinical_classifications(sample_custom, additional_terms = "Acute_Pancreatitis")
stopifnot(shielded_custom == "AcuteSHIELDPancreatitis_R2_24h")
restored_custom <- restore_delimiters(shielded_custom)
stopifnot(restored_custom == sample_custom)
cat("  [PASS] mask_clinical_classifications reliably protects compound clinical terms.\n\n")

# -----------------------------------------------------------------------------
# 5. TEST: Primary Grouping Routing & Synchronization Engine
# -----------------------------------------------------------------------------
cat("[TEST 5] Auditing Primary Grouping Selection Engine (determine_default_grouping_metadata & determine_active_grouping_selection)...\n")

# Scenario A: Asymmetric groups - Group1 has 1 component ("Neu"), Group2 has 4 components ("Femur", "Lumbar", "Sternum", "Skull")
meta_asym <- data.frame(
  FullName = paste0("Sample_", 1:8),
  Group1 = rep("Neu", 8),
  Group2 = rep(c("Femur", "Lumbar", "Sternum", "Skull"), each = 2),
  stringsAsFactors = FALSE
)

def_asym <- determine_default_grouping_metadata(meta_asym, c("Group1", "Group2"))
stopifnot(identical(def_asym, "Group2"))
cat("  - Asymmetric cohort (Group1 [1 level] vs Group2 [4 levels]) default:", def_asym, "(expected: 'Group2')\n")

# Active selection redirects initial/stale Group1 to Group2
act_asym_redirect <- determine_active_grouping_selection(meta_asym, c("Group1", "Group2"), curr_sel = "Group1")
stopifnot(identical(act_asym_redirect, "Group2"))
cat("  - Stale Group1 input redirection:", act_asym_redirect, "(expected: 'Group2')\n")

# Scenario B: Reverse asymmetry - Group1 has 3 components, Group2 has 1 component
meta_rev <- data.frame(
  FullName = paste0("Sample_", 1:6),
  Group1 = rep(c("Control", "Mild", "Severe"), each = 2),
  Group2 = rep("Plasma", 6),
  stringsAsFactors = FALSE
)

def_rev <- determine_default_grouping_metadata(meta_rev, c("Group1", "Group2"))
stopifnot(identical(def_rev, "Group1"))
cat("  - Reverse asymmetric cohort (Group1 [3 levels] vs Group2 [1 level]) default:", def_rev, "(expected: 'Group1')\n")

# Scenario C: Both groups multi-level - standard priority to Group1
meta_both_multi <- data.frame(
  FullName = paste0("Sample_", 1:4),
  Group1 = c("WT", "WT", "KO", "KO"),
  Group2 = c("Male", "Female", "Male", "Female"),
  stringsAsFactors = FALSE
)

def_both_multi <- determine_default_grouping_metadata(meta_both_multi, c("Group1", "Group2"))
stopifnot(identical(def_both_multi, "Group1"))
cat("  - Dual multi-level cohort default:", def_both_multi, "(expected: 'Group1')\n")

# Scenario D: Exception case - BOTH groups have only 1 component (selects both to avoid critical error)
meta_exception <- data.frame(
  FullName = paste0("Sample_", 1:3),
  Group1 = rep("Basal", 3),
  Group2 = rep("Vehicle", 3),
  stringsAsFactors = FALSE
)

def_exception <- determine_default_grouping_metadata(meta_exception, c("Group1", "Group2"))
stopifnot(identical(def_exception, c("Group1", "Group2")))
cat("  - Exception dual single-level cohort default:", paste(def_exception, collapse = ", "), "(expected: 'Group1, Group2')\n")

# Active selection expands single selection to both in exception scenario
act_exc_expand <- determine_active_grouping_selection(meta_exception, c("Group1", "Group2"), curr_sel = "Group1")
stopifnot(identical(act_exc_expand, c("Group1", "Group2")))
cat("  - Exception active expansion:", paste(act_exc_expand, collapse = ", "), "(expected: 'Group1, Group2')\n")

cat("  [PASS] determine_default_grouping_metadata & determine_active_grouping_selection passed all edge-case tests.\n\n")

cat("===================================================================\n")
cat("=== ALL STATISTICAL & MATHEMATICAL ENGINE TESTS PASSED (5/5)    ===\n")
cat("===================================================================\n")

