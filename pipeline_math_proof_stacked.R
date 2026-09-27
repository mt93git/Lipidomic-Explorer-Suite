#!/usr/bin/env Rscript
# ==============================================================================
# GLOBAL LIPIDOMICS EXPLORER: STACKED MATHEMATICAL & BIOSTATISTICAL PIPELINE
# Version: 12.0.0 (Proof & Audit Verification Suite)
# ==============================================================================
#
# PURPOSE:
# This self-contained, stacked script consolidates every mathematical formula,
# algorithmic transformation, data normalization step, imputation procedure,
# and statistical test executed within the Global Lipidomics Explorer.
#
# DESIGNED FOR:
# Rigorous peer review, biostatistical audit, mathematical proof verification,
# and reproducible comparison of data transformations (Before vs. After).
#
# LITERATURE GROUNDING:
# 1. Lazar, C., et al. (2016). Accounting for the Multiple Natures of Missing
#    Values in Label-Free Quantitative Proteomics Data Sets to Compare Imputation Strategies.
#    J. Proteome Res., 15(4):1116-1125.
#    [Quantile Regression for Left-Censored Data - QRILC; benchmarked for metabolomics in Wei et al. (2018)]
# 2. Smyth, G. K. (2004). Linear models and empirical bayes methods for
#    assessing differential expression in microarray experiments. Stat. Appl.
#    Genet. Mol. Biol., 3(1). [limma empirical Bayes shrinkage]
# 3. Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate:
#    a practical and powerful approach to multiple testing. J. R. Stat. Soc. B, 57(1).
# 4. Dieterle, F., et al. (2006). Probabilistic Quotient Normalization as Robust
#    Method to Account for Dilution of Complex Biological Mixtures. Anal. Chem., 78(13).
# 5. Kagan, V. E., et al. (2017). Oxidized arachidonic and adrenic PEs navigate
#    cells to ferroptosis. Nat. Chem. Biol., 13(1). [Cellular Peroxidation Index - CPI]
# 6. Ecker, J., et al. (2012) & Volmer, D. A. (2014). Endoplasmic Reticulum stress,
#    PE/PC membrane curvature dynamics, and organelle lipid stoichiometry.
# ==============================================================================

# Ensure sandbox library paths are loaded
r_ver <- paste0(R.version$major, ".", strsplit(R.version$minor, "\\.")[[1]][1])
sys_os <- Sys.info()["sysname"]
if (sys_os == "Darwin") {
  for (arch in unique(c(Sys.info()["machine"], "arm64", "x86_64"))) {
    lib_dir <- file.path(Sys.getenv("HOME"), "Library", "R", "LipidomicExplorer_Library", paste0(r_ver, "_", arch))
    if (dir.exists(lib_dir) && !(lib_dir %in% .libPaths())) .libPaths(c(lib_dir, .libPaths()))
  }
} else if (sys_os == "Windows") {
  lib_dir <- file.path(Sys.getenv("LOCALAPPDATA"), "LipidomicExplorer_R_Library", r_ver)
  if (dir.exists(lib_dir) && !(lib_dir %in% .libPaths())) .libPaths(c(lib_dir, .libPaths()))
} else {
  lib_dir <- file.path(Sys.getenv("HOME"), ".R", "LipidomicExplorer_Library", r_ver)
  if (dir.exists(lib_dir) && !(lib_dir %in% .libPaths())) .libPaths(c(lib_dir, .libPaths()))
}

suppressPackageStartupMessages({
  library(stats)
  library(utils)
})

cat("==============================================================================\n")
cat(" GLOBAL LIPIDOMICS EXPLORER - STACKED MATHEMATICAL & STATISTICAL PIPELINE\n")
cat("==============================================================================\n\n")

# ==============================================================================
# SECTION 1: INGESTION, MISSING VALUE DETECTION & PREPROCESSING
# ==============================================================================

#' 1.1 Zero-to-Missing Value Detection (Left-Censored Detection Limits)
#' Mass spectrometry non-detects or zero intensities indicate signals falling below
#' the instrument's limit of detection (LOD). Under logarithmic transformation,
#' log2(0) is undefined (-Inf). These are properly flagged as left-censored NA.
#'
#' Equation:
#'   x_ij = NA  if  x_ij <= 0
detect_zero_and_missing <- function(abundance_matrix) {
  mat <- as.matrix(abundance_matrix)
  mode(mat) <- "numeric"
  mat[mat <= 0] <- NA_real_
  return(mat)
}

#' 1.2 Batch Quality Control (BQC) Precision Coefficient of Variation (CoV)
#' Quantifies analytical reproducibility across technical QC replicates.
#'
#' Equations:
#'   mu_i_BQC = (1 / K) * sum_{k=1}^K x_{ik}
#'   sigma_i_BQC = sqrt( (1 / (K-1)) * sum_{k=1}^K (x_{ik} - mu_i_BQC)^2 )
#'   CoV_i_BQC = (sigma_i_BQC / mu_i_BQC) * 100 %
calculate_bqc_cov <- function(data_matrix_linear, bqc_cols) {
  if (length(bqc_cols) < 2) return(NULL)
  bqc_mat <- data_matrix_linear[, bqc_cols, drop = FALSE]
  
  means <- rowMeans(bqc_mat, na.rm = TRUE)
  sds <- apply(bqc_mat, 1, sd, na.rm = TRUE)
  cov_pct <- ifelse(means > 0, (sds / means) * 100, 0)
  
  data.frame(
    Lipid_Name = rownames(data_matrix_linear),
    BQC_Mean = means,
    BQC_SD = sds,
    BQC_CoV_Percent = cov_pct,
    High_Variance_Flag = cov_pct > 20.0, # Regulatory 20% threshold
    stringsAsFactors = FALSE
  )
}

# ==============================================================================
# SECTION 2: LOG TRANSFORMATION, QRILC IMPUTATION & NORMALIZATION
# ==============================================================================

#' 2.1 Variance-Stabilizing Log2 Transformation
#' Maps highly skewed log-normal abundance intensities into symmetric space:
#'   y_ij = log2(x_ij)
transform_log2 <- function(mat_cleaned) {
  log2(mat_cleaned)
}

#' 2.2 Quantile Regression for Left-Censored Data (QRILC) Imputation
#' Imputes missing values below the limit of detection (MNAR: Missing Not At Random).
#' Fits a quantile regression model on observed low percentiles of log2 intensities
#' to parameterize a truncated normal distribution, drawing realistic low values.
#'
#' Reference: Lazar et al. (2016) J. Proteome Res.
impute_qrilc_log <- function(mat_log) {
  if (sum(is.na(mat_log)) == 0) return(mat_log)
  
  set.seed(42)
  if (requireNamespace("imputeLCMD", quietly = TRUE)) {
    invisible(capture.output(res <- imputeLCMD::impute.QRILC(mat_log)[[1]]))
    return(as.matrix(res))
  }
  
  # Deterministic Fallback if imputeLCMD package is absent:
  # Impute using Gaussian quantile-shifted distribution (1.8 SD below observed minimum)
  warning("[QRILC] imputeLCMD namespace not found. Executing deterministic left-censored fallback.")
  mat_imp <- mat_log
  for (j in seq_len(ncol(mat_imp))) {
    vals <- mat_imp[, j]
    nas <- is.na(vals)
    if (any(nas)) {
      obs <- vals[!nas]
      mu <- mean(obs)
      sigma <- sd(obs)
      imputed_val <- min(obs) - (1.8 * sigma) # Censored distribution shift
      mat_imp[nas, j] <- rnorm(sum(nas), mean = imputed_val, sd = 0.3 * sigma)
    }
  }
  return(mat_imp)
}

#' 2.3 Sample-Wise Median Normalization
#' Corrects for global sample loading variations by centering sample medians
#' around the grand median across cohorts.
#'
#' Equations:
#'   m_j = median_i( y_ij )
#'   M = median_j( m_j )
#'   factor_j = m_j - M
#'   y_norm_ij = y_ij - factor_j
normalize_median_log <- function(log_data_matrix) {
  sample_medians <- apply(log_data_matrix, 2, median, na.rm = TRUE)
  grand_median <- median(sample_medians, na.rm = TRUE)
  norm_factors <- sample_medians - grand_median
  sweep(log_data_matrix, 2, norm_factors, "-")
}

#' 2.4 Probabilistic Quotient Normalization (PQN)
#' Linear-scale normalization robust to asymmetric biological changes.
#'
#' Equations:
#'   ref_i = median_j( x_ij )
#'   quotient_ij = x_ij / ref_i
#'   scale_j = median_i( quotient_ij )
#'   x_norm_ij = x_ij / scale_j
normalize_pqn_linear <- function(data_matrix_linear) {
  presence_mask <- rowSums(!is.na(data_matrix_linear) & data_matrix_linear > 0) / ncol(data_matrix_linear) >= 0.5
  data_subset <- if (sum(presence_mask) < 10) data_matrix_linear else data_matrix_linear[presence_mask, , drop = FALSE]
  ref_spectrum <- apply(data_subset, 1, median, na.rm = TRUE)
  ref_spectrum[ref_spectrum == 0 | is.na(ref_spectrum)] <- 1
  quotients <- sweep(data_subset, 1, ref_spectrum, "/")
  norm_factors <- apply(quotients, 2, median, na.rm = TRUE)
  norm_factors[is.na(norm_factors) | norm_factors == 0] <- 1
  sweep(data_matrix_linear, 2, norm_factors, "/")
}

#' 2.5 Restitution to the Linear Scale
#' Maps normalized log2 intensities back to the linear abundance scale:
#'   A_ij = 2^( y_norm_ij )
restitute_linear <- function(mat_final_log) {
  mat_final_log[!is.finite(mat_final_log)] <- NA_real_
  2^mat_final_log
}

# ==============================================================================
# SECTION 3: STATISTICAL ROUTING & DIFFERENTIAL EXPRESSION ENGINE
# ==============================================================================

#' 3.1 Skewness & Dataset Asymmetry Assessment
#' Evaluates Fisher-Pearson third standardized moment:
#'   Skewness_i = ( (1/N) * sum_{j=1}^N (y_ij - mu_i)^3 ) / sigma_i^3
#'   Mean Absolute Skewness = (1/M) * sum_{i=1}^M |Skewness_i|
compute_skewness <- function(data_matrix_log) {
  apply(data_matrix_log, 1, function(y) {
    y <- y[is.finite(y)]
    if (length(y) < 3) return(0)
    mu <- mean(y)
    s <- sd(y)
    if (is.na(s) || s == 0) return(0)
    mean((y - mu)^3) / (s^3)
  })
}

#' 3.2 Dynamic Dual-Gate Statistical Routing Engine
#' Evaluates cohort size and distribution asymmetry:
#' Gate 1: If min(n_cohort) < 5 -> Forces parametric moderated linear modeling (limma).
#'         Reason: Wilcoxon rank-sum minimum possible p-value for n1=3, n2=3 is 0.10,
#'         making BH-FDR significance mathematically impossible.
#' Gate 2: If min(n_cohort) >= 5 AND Mean Absolute Skewness > 1.5 -> Non-parametric test.
#'         Otherwise -> Moderated parametric test (limma).
auto_route_statistical_method <- function(data_matrix_log, metadata, group_col) {
  if (!is.null(metadata) && group_col %in% names(metadata)) {
    group_counts <- table(metadata[[group_col]])
    min_n <- if (length(group_counts) > 0) min(group_counts) else 0
    if (min_n < 5) {
      return("limma")
    }
  }
  
  sk <- compute_skewness(data_matrix_log)
  avg_abs_skew <- mean(abs(sk), na.rm = TRUE)
  if (avg_abs_skew > 1.5) {
    return("non_parametric")
  }
  return("limma")
}

#' 3.3 Empirical Bayes Moderated Linear Modeling (limma)
#' Moderates feature variances toward a pooled prior across the lipidome:
#'   s_tilde_i^2 = ( d_0 * s_0^2 + d_i * s_i^2 ) / ( d_0 + d_i )
#'   t_tilde_i = beta_hat_i / ( s_tilde_i * sqrt(v_i) )
#' Reference: Smyth, G. K. (2004)
perform_limma_analysis <- function(data_matrix_log, metadata, group_col, ref_group, comp_group) {
  if (!requireNamespace("limma", quietly = TRUE)) {
    stop("Package 'limma' is required for parametric differential expression.")
  }
  
  groups <- factor(metadata[[group_col]])
  design <- stats::model.matrix(~ 0 + groups)
  colnames(design) <- make.names(levels(groups))
  
  contrast_str <- paste0(make.names(comp_group), " - ", make.names(ref_group))
  contrast_matrix <- limma::makeContrasts(contrasts = contrast_str, levels = design)
  
  fit <- limma::lmFit(data_matrix_log, design)
  fit2 <- limma::contrasts.fit(fit, contrast_matrix)
  eb_fit <- limma::eBayes(fit2, robust = TRUE)
  
  top_tbl <- limma::topTable(eb_fit, coef = 1, number = Inf, sort.by = "none")
  
  data.frame(
    Lipid_Name = rownames(top_tbl),
    log2FC = top_tbl$logFC,
    Average_Expression = top_tbl$AveExpr,
    t_statistic = top_tbl$t,
    p_raw = top_tbl$P.Value,
    p_adj_bh = top_tbl$adj.P.Val,
    B_statistic = top_tbl$B,
    stringsAsFactors = FALSE
  )
}

#' 3.4 Non-Parametric Rank-Sum Differential Abundance
#' Evaluates shifts via Wilcoxon Rank-Sum test (Mann-Whitney U) with median log2FC:
#'   log2FC = median(y_comp) - median(y_ref)
perform_non_parametric_analysis <- function(data_matrix_log, metadata, group_col, ref_group, comp_group) {
  groups <- as.character(metadata[[group_col]])
  idx_comp <- which(groups == comp_group)
  idx_ref  <- which(groups == ref_group)
  
  num_lipids <- nrow(data_matrix_log)
  res <- data.frame(
    Lipid_Name = rownames(data_matrix_log),
    log2FC = numeric(num_lipids),
    t_statistic = numeric(num_lipids),
    p_raw = numeric(num_lipids),
    stringsAsFactors = FALSE
  )
  
  for (i in seq_len(num_lipids)) {
    y <- data_matrix_log[i, ]
    y_comp <- y[idx_comp]
    y_ref  <- y[idx_ref]
    
    res$log2FC[i] <- median(y_comp, na.rm = TRUE) - median(y_ref, na.rm = TRUE)
    
    wt <- tryCatch(wilcox.test(y_comp, y_ref, exact = FALSE), error = function(e) NULL)
    if (!is.null(wt)) {
      res$p_raw[i] <- wt$p.value
      res$t_statistic[i] <- wt$statistic
    } else {
      res$p_raw[i] <- 1.0
      res$t_statistic[i] <- 0.0
    }
  }
  
  # Benjamini-Hochberg False Discovery Rate Correction
  res$p_adj_bh <- p.adjust(res$p_raw, method = "BH")
  return(res)
}

# ==============================================================================
# SECTION 4: MATHEMATICAL DERIVATIONS FOR VISUALIZATIONS & CELLULAR INDICES
# ==============================================================================

#' 4.1 Principal Component Analysis (SVD & Variance Decomposition)
#' Center and scale unit-variance decomposition:
#'   X = U %*% Sigma %*% V^T
#'   PC Scores: T = U %*% Sigma
#'   Loadings: V
#'   Variance Explained: (Sigma_k^2) / sum(Sigma_j^2) * 100 %
compute_pca <- function(data_matrix_log) {
  mat_t <- t(data_matrix_log)
  # Remove zero-variance features
  vars <- apply(mat_t, 2, var, na.rm = TRUE)
  mat_t <- mat_t[, vars > 1e-9, drop = FALSE]
  
  pca_res <- stats::prcomp(mat_t, center = TRUE, scale. = TRUE)
  var_explained <- (pca_res$sdev^2) / sum(pca_res$sdev^2) * 100
  
  list(
    scores = pca_res$x,
    loadings = pca_res$rotation,
    variance_explained = var_explained
  )
}

#' 4.2 Cellular Peroxidation Index (CPI)
#' Kinetic rate-weighted susceptibility of bis-allylic carbons to radical propagation:
#'   CPI = 0.014*%mono + 1.0*%di + 2.0*%tri + 3.2*%tetra + 4.0*%penta + 5.4*%hexa
#' References: Kagan et al. (2017) Nat. Chem. Biol.; Dixon et al. (2012) Cell.
calculate_cpi <- function(values_linear, double_bonds) {
  total_val <- sum(values_linear, na.rm = TRUE)
  if (total_val == 0) return(0)
  
  p_mono  <- sum(values_linear[double_bonds == 1], na.rm = TRUE) / total_val * 100
  p_di    <- sum(values_linear[double_bonds == 2], na.rm = TRUE) / total_val * 100
  p_tri   <- sum(values_linear[double_bonds == 3], na.rm = TRUE) / total_val * 100
  p_tetra <- sum(values_linear[double_bonds == 4], na.rm = TRUE) / total_val * 100
  p_penta <- sum(values_linear[double_bonds == 5], na.rm = TRUE) / total_val * 100
  p_hexa  <- sum(values_linear[double_bonds >= 6], na.rm = TRUE) / total_val * 100
  
  (0.014 * p_mono) + (1.0 * p_di) + (2.0 * p_tri) + (3.2 * p_tetra) + (4.0 * p_penta) + (5.4 * p_hexa)
}

#' 4.3 Subcellular Organelle Stress & Phenotypic Transition Indices
#' Computes biophysical organelle membrane ratios:
#'   1. ER Curvature Stress: PE / PC
#'   2. ER Saturation (Symmetric log2 ratio): log2( (SFA_PC + 1e-9) / (UFA_PC + 1e-9) )
#'   3. Mitochondrial PG/CL Ratio: PG / CL
#'   4. FAO Stress (permille): (Acylcarnitines / Total_Lipids) * 1000
#'   5. Lysosomal BMP Mass (%): (BMP / Total_Lipids) * 100
#'   6. Golgi Secretory Arrest: Ceramide / Sphingomyelin
#'   7. M1 Storage vs M2 Structural Polarization (%)
calculate_organelle_stress_indices <- function(abundance_linear, lipid_annotations) {
  # abundance_linear: matrix of linear intensities (Lipids x Samples)
  # lipid_annotations: data.frame with Lipid_Name, Subclass, Total_DB
  
  samples <- colnames(abundance_linear)
  results <- data.frame(Sample = samples, stringsAsFactors = FALSE)
  
  get_sub_sum <- function(subclass_name) {
    lipids <- lipid_annotations$Lipid_Name[lipid_annotations$Subclass == subclass_name]
    idx <- which(rownames(abundance_linear) %in% lipids)
    if (length(idx) == 0) return(rep(0, length(samples)))
    colSums(abundance_linear[idx, , drop = FALSE], na.rm = TRUE)
  }
  
  total_abundance <- colSums(abundance_linear, na.rm = TRUE)
  
  pe_sum <- get_sub_sum("GP_PE")
  pc_sum <- get_sub_sum("GP_PC")
  results$ER_Curvature_PE_PC <- pe_sum / (pc_sum + 1e-9)
  
  # ER Saturation symmetric ratio
  pc_lipids_sfa <- lipid_annotations$Lipid_Name[lipid_annotations$Subclass == "GP_PC" & lipid_annotations$Total_DB == 0]
  pc_lipids_ufa <- lipid_annotations$Lipid_Name[lipid_annotations$Subclass == "GP_PC" & lipid_annotations$Total_DB > 0]
  sfa_pc <- colSums(abundance_linear[rownames(abundance_linear) %in% pc_lipids_sfa, , drop = FALSE], na.rm = TRUE)
  ufa_pc <- colSums(abundance_linear[rownames(abundance_linear) %in% pc_lipids_ufa, , drop = FALSE], na.rm = TRUE)
  results$ER_Saturation_Symmetric_Log2 <- log2((sfa_pc + 1e-9) / (ufa_pc + 1e-9))
  
  # Mitochondrial PG/CL
  results$Mito_PG_CL_Ratio <- get_sub_sum("GP_PG") / (get_sub_sum("GP_CL") + 1e-9)
  
  # FAO Acylcarnitine Stress permille
  results$FAO_Stress_Permille <- (get_sub_sum("FA_ACar") / (total_abundance + 1e-9)) * 1000
  
  # Lysosomal BMP Mass %
  bmp_sum <- get_sub_sum("GP_BMP")
  results$Lysosomal_BMP_Percent <- (bmp_sum / (total_abundance + 1e-9)) * 100
  
  # Golgi Secretory Arrest
  results$Golgi_Arrest_Cer_SM <- get_sub_sum("SP_Cer") / (get_sub_sum("SP_SM") + 1e-9)
  
  # M1 Storage vs M2 Structural Index
  m1_sum <- get_sub_sum("GL_TAG") + get_sub_sum("GL_DAG") + get_sub_sum("ST_CE")
  ether_sum <- get_sub_sum("GP_PE_P") + get_sub_sum("GP_PE_E") + get_sub_sum("GP_PC_P") + get_sub_sum("GP_PC_E")
  m2_sum <- ether_sum + get_sub_sum("SP_SM") + get_sub_sum("SP_Cer")
  
  results$M1_Storage_Percent <- (m1_sum / (total_abundance + 1e-9)) * 100
  results$M2_Structural_Percent <- (m2_sum / (total_abundance + 1e-9)) * 100
  
  return(results)
}

#' 4.4 Condensed Heatmap Mathematical Formulas
#' Scenario 1: Class Standard Deviation (SD):
#'   SD_{C,j} = sqrt( (1 / (K-1)) * sum_{k=1}^K (y_{k,j} - y_bar_{C,j})^2 )
#' Scenario 2: Class Mean:
#'   y_bar_{C,j} = (1 / K) * sum_{k=1}^K y_{k,j}
#' Scenario 3: Z-Score Transformation:
#'   Z_{ij} = ( y_ij - mu_i ) / sigma_i
compute_condensed_class_means <- function(data_matrix_log, class_factor) {
  classes <- levels(class_factor)
  res <- matrix(NA_real_, nrow = length(classes), ncol = ncol(data_matrix_log))
  rownames(res) <- classes
  colnames(res) <- colnames(data_matrix_log)
  for (cls in classes) {
    idx <- which(class_factor == cls)
    if (length(idx) == 1) {
      res[cls, ] <- data_matrix_log[idx, ]
    } else if (length(idx) > 1) {
      res[cls, ] <- colMeans(data_matrix_log[idx, , drop = FALSE], na.rm = TRUE)
    }
  }
  return(res)
}

compute_condensed_class_sds <- function(data_matrix_log, class_factor) {
  classes <- levels(class_factor)
  res <- matrix(0, nrow = length(classes), ncol = ncol(data_matrix_log))
  rownames(res) <- classes
  colnames(res) <- colnames(data_matrix_log)
  for (cls in classes) {
    idx <- which(class_factor == cls)
    if (length(idx) > 1) {
      res[cls, ] <- apply(data_matrix_log[idx, , drop = FALSE], 2, sd, na.rm = TRUE)
    }
  }
  return(res)
}

compute_z_score_matrix <- function(data_matrix_log) {
  means <- rowMeans(data_matrix_log, na.rm = TRUE)
  sds <- apply(data_matrix_log, 1, sd, na.rm = TRUE)
  sds[sds == 0 | is.na(sds)] <- 1
  sweep(sweep(data_matrix_log, 1, means, "-"), 1, sds, "/")
}

# ==============================================================================
# SECTION 5: AUTOMATED PROOF EXECUTION & VERIFICATION GENERATOR
# ==============================================================================

execute_audit_proof <- function(raw_excel_path = "demo_data/demo_global_lipidomics.xlsx",
                                output_dir = "docs/proof_artifacts") {
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
  
  cat("--- STEP 1: Ingesting Raw Dataset ---\n")
  if (requireNamespace("readxl", quietly = TRUE) && file.exists(raw_excel_path)) {
    raw_df <- readxl::read_excel(raw_excel_path, sheet = 1)
    lipid_col_name <- names(raw_df)[1]
    raw_mat <- as.data.frame(raw_df)
    rownames(raw_mat) <- raw_mat[[lipid_col_name]]
    raw_mat[[lipid_col_name]] <- NULL
    
    # Coerce to numeric
    for (cn in colnames(raw_mat)) {
      raw_mat[[cn]] <- as.numeric(raw_mat[[cn]])
    }
    raw_mat <- as.matrix(raw_mat)
  } else {
    cat("[WARN] Raw Excel not found. Generating synthetic controlled lipidome matrix.\n")
    set.seed(42)
    lipids <- c(paste0("PC(16:0/", c("16:0", "18:1", "18:2", "20:4", "22:6"), ")"),
                paste0("PE(18:0/", c("18:1", "20:4"), ")"),
                paste0("TAG(16:0/18:1/", c("18:1", "18:2"), ")"),
                "Cer(d18:1/16:0)", "SM(d18:1/16:0)", "BMP(18:1/18:1)", "ACar(16:0)")
    samples <- c(paste0("WT_Rep", 1:3), paste0("KO_Rep", 1:3))
    raw_mat <- matrix(rlnorm(length(lipids) * length(samples), meanlog = 12, sdlog = 1.5),
                      nrow = length(lipids), ncol = length(samples),
                      dimnames = list(lipids, samples))
    raw_mat[sample(length(raw_mat), 5)] <- 0 # Inject zero-values
  }
  
  cat("Loaded Raw Matrix Dimensions:", nrow(raw_mat), "lipids x", ncol(raw_mat), "samples\n")
  
  # Export BEFORE file
  raw_before_path <- file.path(output_dir, "raw_abundance_before.csv")
  write.csv(raw_mat, raw_before_path, row.names = TRUE)
  cat("[SAVED] Raw Matrix (BEFORE):", raw_before_path, "\n")
  
  cat("\n--- STEP 2: Executing 6-Stage Mathematical Pipeline ---\n")
  # 1. Zero & Missing Detection
  mat_na <- detect_zero_and_missing(raw_mat)
  missing_before <- sum(is.na(mat_na))
  cat("  [1] Zero-to-NA: Detected", missing_before, "left-censored missing values.\n")
  
  # 2. Log2 Transformation
  mat_log <- transform_log2(mat_na)
  cat("  [2] Log2 Transformation: Linear intensities mapped to log2 scale.\n")
  
  # 3. QRILC Imputation
  mat_imputed <- impute_qrilc_log(mat_log)
  missing_after <- sum(is.na(mat_imputed))
  cat("  [3] QRILC Imputation: Missing values remaining:", missing_after, "\n")
  
  # 4. Median Normalization
  mat_normalized_log <- normalize_median_log(mat_imputed)
  cat("  [4] Median Normalization: Aligned sample medians across cohorts.\n")
  
  # 5. Restitution to Linear Scale
  mat_linear_after <- restitute_linear(mat_normalized_log)
  cat("  [5] Restitution: Transformed back to bounded linear abundance scale.\n")
  
  # Export AFTER file
  after_path <- file.path(output_dir, "transformed_abundance_after.csv")
  write.csv(mat_linear_after, after_path, row.names = TRUE)
  cat("[SAVED] Transformed Matrix (AFTER):", after_path, "\n")
  
  # Calculate transformation audit metrics
  audit_summary <- data.frame(
    Sample = colnames(raw_mat),
    Raw_Median = apply(raw_mat, 2, median, na.rm = TRUE),
    Raw_Zero_Count = colSums(raw_mat <= 0 | is.na(raw_mat)),
    Log2_Normalized_Median = apply(mat_normalized_log, 2, median),
    Log2_Normalized_SD = apply(mat_normalized_log, 2, sd),
    Restituted_Linear_Median = apply(mat_linear_after, 2, median),
    stringsAsFactors = FALSE
  )
  audit_path <- file.path(output_dir, "transformation_audit_summary.csv")
  write.csv(audit_summary, audit_path, row.names = FALSE)
  cat("[SAVED] Transformation Audit Summary:", audit_path, "\n")
  
  cat("\n--- STEP 3: Auto-Routing & Differential Expression Audit ---\n")
  # Derive synthetic metadata from column names
  sample_names <- colnames(raw_mat)
  groups <- ifelse(grepl("WT|Vehicle|Control|Ctrl", sample_names, ignore.case = TRUE), "Control", "Treated")
  if (length(unique(groups)) < 2) {
    groups <- rep(c("Control", "Treated"), length.out = length(sample_names))
  }
  meta_df <- data.frame(FullName = sample_names, Group = groups, stringsAsFactors = FALSE)
  
  route <- auto_route_statistical_method(mat_normalized_log, meta_df, "Group")
  cat("  Auto-Route Decision:", route, "\n")
  
  de_results <- if (route == "limma" && requireNamespace("limma", quietly = TRUE)) {
    perform_limma_analysis(mat_normalized_log, meta_df, "Group", "Control", "Treated")
  } else {
    perform_non_parametric_analysis(mat_normalized_log, meta_df, "Group", "Control", "Treated")
  }
  
  de_path <- file.path(output_dir, "differential_expression_audit_results.csv")
  write.csv(de_results, de_path, row.names = FALSE)
  cat("[SAVED] Differential Expression Results:", de_path, "\n")
  
  cat("\n--- STEP 4: Cellular Peroxidation Index (CPI) & Organelle Stress ---\n")
  # Synthetic annotation parser
  lipid_names <- rownames(raw_mat)
  extract_db <- function(nm) {
    m <- regmatches(nm, regexpr("(?<=:)\\d+", nm, perl = TRUE))
    if (length(m) > 0 && nzchar(m)) as.numeric(m[1]) else 1
  }
  extract_sub <- function(nm) {
    if (grepl("^PC", nm)) "GP_PC"
    else if (grepl("^PE", nm)) "GP_PE"
    else if (grepl("^TAG", nm)) "GL_TAG"
    else if (grepl("^DAG", nm)) "GL_DAG"
    else if (grepl("^Cer", nm)) "SP_Cer"
    else if (grepl("^SM", nm)) "SP_SM"
    else if (grepl("^BMP", nm)) "GP_BMP"
    else if (grepl("^ACar", nm)) "FA_ACar"
    else "Other"
  }
  annot_df <- data.frame(
    Lipid_Name = lipid_names,
    Subclass = sapply(lipid_names, extract_sub),
    Total_DB = sapply(lipid_names, extract_db),
    stringsAsFactors = FALSE
  )
  
  # Compute CPI per sample
  cpi_scores <- sapply(colnames(mat_linear_after), function(s) {
    calculate_cpi(mat_linear_after[, s], annot_df$Total_DB)
  })
  
  stress_df <- calculate_organelle_stress_indices(mat_linear_after, annot_df)
  stress_df$CPI <- cpi_scores[stress_df$Sample]
  
  stress_path <- file.path(output_dir, "organelle_stress_and_cpi_audit.csv")
  write.csv(stress_df, stress_path, row.names = FALSE)
  cat("[SAVED] Organelle Stress & CPI Audit:", stress_path, "\n")
  
  cat("\n==============================================================================\n")
  cat(" PROOF VERIFICATION & AUDIT ARTIFACTS GENERATED SUCCESSFULLY\n")
  cat(" Location: ", normalizePath(output_dir), "\n")
  cat("==============================================================================\n")
}

# Auto-execute proof on script run
if (!interactive()) {
  execute_audit_proof()
}
