#
# R/modules/utils_stats.R
# Shared statistical utility functions (Limma, etc.)
#

#' Perform Limma Differential Expression Analysis
#'
#' @param data_matrix Numeric matrix (log2 transformed)
#' @param metadata Data frame containing sample metadata
#' @param group_col Name of the column in metadata to use for grouping
#' @param contrast_str String defining the contrast (e.g., "GroupB-GroupA")
#' @param block_col Optional name of blocking factor for paired donor repeated measures (e.g., "PatientNumber")
#'
#' @return A list containing the fit object, topTable results, design matrix, and consensus correlation
perform_limma_analysis <- function(data_matrix, metadata, group_col, contrast_str, block_col = NULL) {
  # 1. Validate Inputs
    if (is.null(data_matrix) || ncol(data_matrix) < 2) stop("Not enough data for DE analysis.")
    if (!group_col %in% names(metadata)) stop(paste("Grouping column", group_col, "not found in metadata."))

  # 2. Prepare Design Matrix
    groups <- factor(metadata[[group_col]])
    if (nlevels(groups) < 2) stop("At least 2 groups are required for DE analysis.")

    design <- stats::model.matrix(~ 0 + groups)
    colnames(design) <- make.names(levels(groups))
    if (!limma::is.fullrank(design)) {
      warning("Warning: Limma design matrix is not full rank. Confounded groups detected: ", paste(limma::nonEstimable(design), collapse = ", "))
    }

  # 3. Prepare Contrast
    contrast_matrix <- tryCatch(
        {
            limma::makeContrasts(contrasts = contrast_str, levels = design)
        },
        error = function(e) {
            stop(paste("Invalid contrast:", contrast_str, "\nError:", e$message))
        }
    )

  # 4. Check for Paired Donor Repeated Measures
    consensus_corr <- NULL
    if (!is.null(block_col) && nzchar(block_col) && block_col %in% names(metadata)) {
      block_vec <- metadata[[block_col]]
      if (any(duplicated(block_vec)) && length(unique(block_vec)) > 1) {
        dup_corr <- tryCatch({
          limma::duplicateCorrelation(data_matrix, design, block = block_vec)
        }, error = function(e) {
          warning(paste("duplicateCorrelation calculation failed:", e$message))
          NULL
        })
        if (!is.null(dup_corr) && is.finite(dup_corr$consensus.correlation)) {
          consensus_corr <- dup_corr$consensus.correlation
          fit <- limma::lmFit(data_matrix, design, block = block_vec, correlation = consensus_corr)
        } else {
          fit <- limma::lmFit(data_matrix, design)
        }
      } else {
        fit <- limma::lmFit(data_matrix, design)
      }
    } else {
      fit <- limma::lmFit(data_matrix, design)
    }
    
    fit2 <- limma::contrasts.fit(fit, contrast_matrix)
    
  # SAFETY CHECK: If residual degrees of freedom is 0, cannot compute p-values.
    fallback_mode <- FALSE
    if (all(fit2$df.residual == 0)) {
        warning("Limma Analysis: No residual degrees of freedom. Using fallback P=1.")
        fallback_mode <- TRUE
    }
    
    eb_fit <- if(!fallback_mode) {
        tryCatch({
            limma::eBayes(fit2, robust = TRUE)
        }, error = function(e) {
            warning(paste("Limma eBayes failed:", e$message))
            return(NULL)
        })
    } else {
        NULL
    }
    
    if (is.null(eb_fit)) {
        logFC <- fit2$coefficients[, 1]
        top_table <- data.frame(
           Lipid_Name = rownames(fit2$coefficients),
           log2FC = logFC,
           p_raw = 1,
           p_adj_bh = 1,
           t_stat = 0
        )
        return(list(fit = fit2, results = top_table, design = design, contrast_matrix = contrast_matrix, consensus_correlation = consensus_corr))
    }

  # 5. Extract Results
    top_table <- limma::topTable(eb_fit, coef = 1, number = Inf, sort.by = "none") %>%
        tibble::rownames_to_column("Lipid_Name") %>%
        dplyr::rename(log2FC = logFC, p_raw = P.Value, p_adj_bh = adj.P.Val, t_stat = t)

    return(list(
      fit = eb_fit, 
      results = top_table, 
      design = design, 
      contrast_matrix = contrast_matrix, 
      consensus_correlation = consensus_corr
    ))
}

#' Validate Design Matrix Rank and Contrast Feasibility
#'
#' Performs real-time pre-flight diagnostic on experimental metadata, cell-means design, and contrast strings.
#'
#' @param metadata Data frame containing sample metadata
#' @param group_col Name of the grouping column in metadata
#' @param contrast_str Character string defining the contrast (e.g., "(Comp) - (Ref)")
#' @param block_col Optional name of blocking factor (e.g. PatientNumber)
#' @return A list with validation diagnostics: valid, rank, p, df_residual, is_full_rank, non_estimable, message
validate_design_and_contrasts <- function(metadata, group_col, contrast_str = NULL, block_col = NULL) {
  if (is.null(metadata) || nrow(metadata) < 2) {
    return(list(valid = FALSE, rank = 0, p = 0, df_residual = 0, is_full_rank = FALSE, 
                non_estimable = character(0), message = "Insufficient samples in metadata (N < 2)."))
  }
  if (!group_col %in% names(metadata)) {
    return(list(valid = FALSE, rank = 0, p = 0, df_residual = 0, is_full_rank = FALSE, 
                non_estimable = character(0), message = paste("Grouping variable", group_col, "not found.")))
  }
  
  groups <- factor(metadata[[group_col]])
  if (nlevels(groups) < 2) {
    return(list(valid = FALSE, rank = 1, p = 1, df_residual = nrow(metadata) - 1, is_full_rank = TRUE, 
                non_estimable = character(0), message = "At least 2 distinct groups are required for differential comparison."))
  }
  
  design <- stats::model.matrix(~ 0 + groups)
  colnames(design) <- make.names(levels(groups))
  
  qr_d <- qr(design)
  r <- qr_d$rank
  p <- ncol(design)
  n <- nrow(design)
  df_resid <- n - r
  is_full <- (r == p)
  non_est <- if (!is_full) limma::nonEstimable(design) else character(0)
  
  # Check blocking factor if provided
  block_msg <- NULL
  if (!is.null(block_col) && nzchar(block_col) && block_col %in% names(metadata)) {
    block_vec <- metadata[[block_col]]
    n_blocks <- length(unique(block_vec))
    if (n_blocks == n) {
      block_msg <- "Notice: Each sample has a unique Subject ID (no repeated measurements)."
    } else if (n_blocks < 2) {
      block_msg <- "Warning: All samples share the same Subject ID. Blocking cannot be estimated."
    }
  }
  
  # Check contrast estimability if provided
  contrast_valid <- TRUE
  contrast_err <- NULL
  if (!is.null(contrast_str) && nzchar(contrast_str)) {
    tryCatch({
      c_mat <- limma::makeContrasts(contrasts = contrast_str, levels = design)
    }, error = function(e) {
      contrast_valid <<- FALSE
      contrast_err <<- e$message
    })
  }
  
  overall_valid <- is_full && (df_resid > 0) && contrast_valid
  
  msg <- if (!is_full) {
    paste0("Design matrix is rank-deficient (Rank ", r, " < ", p, " parameters). Confounded: ", paste(non_est, collapse = ", "))
  } else if (df_resid == 0) {
    "Zero residual degrees of freedom (N samples == parameters). No within-group variance can be estimated."
  } else if (!contrast_valid) {
    paste0("Contrast formula error: ", contrast_err)
  } else {
    paste0("Full rank verified (Rank ", r, "/", p, ", df_residual = ", df_resid, ").")
  }
  if (!is.null(block_msg)) msg <- paste0(msg, " ", block_msg)
  
  list(
    valid = overall_valid,
    rank = r,
    p = p,
    n = n,
    df_residual = df_resid,
    is_full_rank = is_full,
    non_estimable = non_est,
    contrast_valid = contrast_valid,
    message = msg
  )
}

#' Generate Natural Language Hypothesis Statement
#'
#' Generates an unambiguous, human-readable English statement describing the statistical hypothesis being tested.
#'
#' @param mode Comparison mode ("direct" or "interaction")
#' @param ref_groups Character vector of reference groups
#' @param comp_groups Character vector of comparison groups
#' @param int_groups List of interaction groups (comp_t2, comp_t1, ref_t2, ref_t1)
#' @param block_col Optional blocking factor name
#' @return A character string formatted as a concise narrative hypothesis
generate_contrast_hypothesis_statement <- function(mode = "direct", ref_groups = NULL, comp_groups = NULL, int_groups = NULL, block_col = NULL) {
  paired_suffix <- if (!is.null(block_col) && nzchar(block_col)) {
    paste0(" [Paired donor design: intra-individual covariance modeled via limma::duplicateCorrelation on '", block_col, "']")
  } else ""
  
  if (identical(mode, "interaction")) {
    if (is.null(int_groups) || any(sapply(int_groups, function(x) is.null(x) || !nzchar(x)))) {
      return("Select all 4 interaction coordinates to define the difference-in-differences hypothesis.")
    }
    c2 <- int_groups$comp_t2; c1 <- int_groups$comp_t1
    r2 <- int_groups$ref_t2; r1 <- int_groups$ref_t1
    
    return(paste0(
      "Testing the Difference-in-Differences (Kinetic Interaction): ",
      "Is the temporal or treatment response in [", c2, " - ", c1, "] significantly different from baseline response in [", r2, " - ", r1, "]? ",
      "A non-zero result indicates condition-specific kinetic divergence.",
      paired_suffix
    ))
  } else {
    if (length(ref_groups) == 0 || length(comp_groups) == 0) {
      return("Select target (Group A) and reference (Group B) cohorts to define the statistical hypothesis.")
    }
    comp_str <- paste(comp_groups, collapse = " + ")
    ref_str <- paste(ref_groups, collapse = " + ")
    if (length(comp_groups) > 1) comp_str <- paste0("Mean(", comp_str, ")")
    if (length(ref_groups) > 1) ref_str <- paste0("Mean(", ref_str, ")")
    
    return(paste0(
      "Testing whether lipid abundances in Target [", comp_str, "] differ significantly from Reference [", ref_str, "]. ",
      "Log\u2082FC > 0 indicates enrichment in Target; Log\u2082FC < 0 indicates depletion relative to Reference.",
      paired_suffix
    ))
  }
}

#' Construct Contrast String
#'
#' Helper to build the limma contrast string from selected groups.
#'
#' @param ref_groups Vector of reference group names
#' @param comp_groups Vector of comparison group names
#' @return A string compatible with makeContrasts
construct_contrast_string <- function(ref_groups, comp_groups) {
  # Clean names to match make.names used in design matrix
    ref_clean <- make.names(ref_groups)
    comp_clean <- make.names(comp_groups)

    ref_part <- paste0("(", paste(ref_clean, collapse = "+"), ")/", length(ref_clean))
    comp_part <- paste0("(", paste(comp_clean, collapse = "+"), ")/", length(comp_clean))

    paste(comp_part, "-", ref_part)
}

#' Perform Longitudinal Spline Trajectory dream analysis
#'
#' @param data_matrix Numeric matrix (log2 transformed)
#' @param metadata Data frame containing sample metadata
#' @param group_col Name of the column in metadata to use for grouping
#' @param contrast_str String defining the contrast (e.g., "GroupB-GroupA")
#' @param spline_df Spline degrees of freedom
#'
#' @return A list containing the fit object and topTable results
perform_spline_dream_analysis <- function(data_matrix, metadata, group_col, contrast_str, spline_df = 3) {
  # 1. Validate inputs
  if (is.null(data_matrix) || ncol(data_matrix) < 2) stop("Not enough data for analysis.")
  if (!group_col %in% names(metadata)) stop(paste("Grouping column", group_col, "not found in metadata."))
  
  # 2. Check if TimePoint and Replicate columns are present
  if (!"TimePoint" %in% names(metadata)) stop("TimePoint column is required for longitudinal modeling.")
  if (!"Replicate" %in% names(metadata)) stop("Replicate column is required for repeated measures modeling.")
  
  # Realign metadata to match the column order of the data matrix
  metadata <- as.data.frame(metadata)
  metadata <- metadata[match(colnames(data_matrix), metadata$FullName), ]
  rownames(metadata) <- metadata$FullName
  
  # 3. Process TimePoint as continuous numeric variable
  metadata$TimePoint_num <- as.numeric(gsub("[^0-9\\.]", "", as.character(metadata$TimePoint)))
  if (any(is.na(metadata$TimePoint_num))) {
    metadata$TimePoint_num[is.na(metadata$TimePoint_num)] <- 0
  }
  
  unique_tps <- unique(metadata$TimePoint_num)
  if (length(unique_tps) < 2) {
    stop("Longitudinal spline modeling requires at least 2 distinct numeric timepoints (e.g., T1, T2). Please verify your nomenclature settings.")
  }
  
  # 4. Generate natural cubic splines basis matrix
  basis <- splines::ns(metadata$TimePoint_num, df = spline_df)
  basis_cols <- c()
  for (i in 1:ncol(basis)) {
    col_name <- paste0("spline_basis_", i)
    metadata[[col_name]] <- basis[, i]
    basis_cols <- c(basis_cols, col_name)
  }
  
  # 5. Define Subject for repeated measures random effect
  if ("PatientNumber" %in% names(metadata)) {
    metadata$Subject <- factor(paste(metadata[[group_col]], metadata$PatientNumber, metadata$Replicate, sep = "_"))
  } else {
    pop_part <- if ("Group2" %in% names(metadata)) metadata$Group2 else "Pop"
    metadata$Subject <- factor(paste(metadata[[group_col]], pop_part, metadata$Replicate, sep = "_"))
  }
  
  # Check if we have repeated measures (multiple timepoints per subject)
  num_subjects <- length(unique(metadata$Subject))
  num_samples <- nrow(metadata)
  has_repeated <- num_subjects < num_samples && num_subjects > 1
  
  # 6. Fit modeling using dream or limma (fallback if no repeated measures)
  if (has_repeated) {
    # Formula: ~ 0 + Group1 + Group1:spline_basis_i + (1|Subject)
    formula_str <- paste0("~ 0 + ", group_col, " + ", paste0(group_col, ":", basis_cols, collapse = " + "), " + (1|Subject)")
    formula <- as.formula(formula_str)
    
    # Programmatically prefix levels in the contrast string to match fixed effects names
    clean_contrast_str <- contrast_str
    levels_val <- unique(as.character(metadata[[group_col]]))
    sorted_levels <- levels_val[order(nchar(levels_val), decreasing = TRUE)]
    for (lvl in sorted_levels) {
      clean_contrast_str <- gsub(lvl, paste0(group_col, lvl), clean_contrast_str, fixed = TRUE)
    }
    
    # Generate contrast matrix L
    L <- tryCatch({
      variancePartition::makeContrastsDream(formula, metadata, contrasts = c(Contrast = clean_contrast_str))
    }, error = function(e) {
      stop(paste("makeContrastsDream failed:", e$message))
    })
    
    # Configure BiocParallel to run serially to avoid parallel conflicts in Shiny thread
    param <- BiocParallel::SerialParam()
    
    fit <- tryCatch({
      variancePartition::dream(data_matrix, formula, metadata, L = L, BPPARAM = param)
    }, error = function(e) {
      stop(paste("dream mixed model fit failed:", e$message))
    })
    
    # 8. eBayes moderation
    eb_fit <- tryCatch({
      limma::eBayes(fit, robust = TRUE)
    }, error = function(e) {
      warning("eBayes failed for spline model: ", e$message)
      NULL
    })
    
    if (is.null(eb_fit)) {
      top_table <- data.frame(
        Lipid_Name = rownames(data_matrix),
        log2FC = 0,
        p_raw = 1,
        p_adj_bh = 1,
        t_stat = 0
      )
      return(list(fit = fit, results = top_table))
    }
    
    # 9. Extract results
    top_table <- limma::topTable(eb_fit, coef = "Contrast", number = Inf, sort.by = "none") %>%
      tibble::rownames_to_column("Lipid_Name") %>%
      dplyr::rename(log2FC = logFC, p_raw = P.Value, p_adj_bh = adj.P.Val, t_stat = t)
    
    return(list(fit = eb_fit, results = top_table))
    
  } else {
    # Fallback to standard limma since there are no repeated measures
    warning("No repeated measures detected (one sample per subject). Falling back to fixed effects limma.")
    design <- model.matrix(as.formula(paste0("~ 0 + ", group_col, " + ", paste0(group_col, ":", basis_cols, collapse = " + "))), data = metadata)
    
    # Clean colnames of design
    colnames(design) <- gsub(paste0("^", group_col), "", colnames(design))
    colnames(design) <- gsub(":", ".", colnames(design))
    colnames(design) <- make.names(colnames(design))
    
    if (!limma::is.fullrank(design)) {
      warning("Warning: Fallback spline design matrix is not full rank. Confounded variables: ", paste(limma::nonEstimable(design), collapse = ", "))
    }
    
    fit <- limma::lmFit(data_matrix, design)
    
    # Clean contrast string for standard limma
    clean_contrast_str <- gsub(":", ".", contrast_str)
    
    contrast_matrix <- tryCatch({
      limma::makeContrasts(contrasts = clean_contrast_str, levels = colnames(fit))
    }, error = function(e) {
      stop(paste("Invalid contrast for fallback spline model:", contrast_str, "\nLevels:", paste(colnames(fit), collapse=", "), "\nError:", e$message))
    })
    
    fit2 <- limma::contrasts.fit(fit, contrast_matrix)
    
    eb_fit <- tryCatch({
      limma::eBayes(fit2, robust = TRUE)
    }, error = function(e) {
      warning("eBayes failed for fallback spline model: ", e$message)
      NULL
    })
    
    if (is.null(eb_fit)) {
      logFC <- fit2$coefficients[, 1]
      top_table <- data.frame(
        Lipid_Name = rownames(fit2$coefficients),
        log2FC = logFC,
        p_raw = 1,
        p_adj_bh = 1,
        t_stat = 0
      )
      return(list(fit = fit2, results = top_table))
    }
    
    top_table <- limma::topTable(eb_fit, coef = 1, number = Inf, sort.by = "none") %>%
      tibble::rownames_to_column("Lipid_Name") %>%
      dplyr::rename(log2FC = logFC, p_raw = P.Value, p_adj_bh = adj.P.Val, t_stat = t)
    
    return(list(fit = eb_fit, results = top_table))
  }
}

#' Perform Generalized Least Squares (GLS) Analysis
perform_gls_analysis <- function(data_matrix, metadata, group_col, contrast_str) {
  if (is.null(data_matrix) || ncol(data_matrix) < 2) stop("Not enough data for GLS analysis.")
  
  groups <- factor(metadata[[group_col]])
  unique_groups <- levels(groups)
  
  parts <- strsplit(contrast_str, "\\s*-\\s*")[[1]]
  comp_part <- if (length(parts) >= 1) parts[1] else ""
  ref_part <- if (length(parts) >= 2) parts[2] else ""
  
  # Split by non-alphanumeric characters to get clean tokens
  comp_tokens <- strsplit(comp_part, "[^a-zA-Z0-9\\.]+")[[1]]
  ref_tokens <- strsplit(ref_part, "[^a-zA-Z0-9\\.]+")[[1]]
  
  comp_tokens <- comp_tokens[comp_tokens != "" & !grepl("^\\d+$", comp_tokens)]
  ref_tokens <- ref_tokens[ref_tokens != "" & !grepl("^\\d+$", ref_tokens)]
  
  comp_orig <- unique_groups[make.names(unique_groups) %in% comp_tokens]
  ref_orig <- unique_groups[make.names(unique_groups) %in% ref_tokens]
  
  num_lipids <- nrow(data_matrix)
  results <- data.frame(
    Lipid_Name = rownames(data_matrix),
    log2FC = NA_real_,
    p_raw = NA_real_,
    t_stat = NA_real_,
    stringsAsFactors = FALSE
  )
  
  for (i in 1:num_lipids) {
    y <- data_matrix[i, ]
    df <- data.frame(y = y, Group = groups)
    
    fit <- tryCatch({
      nlme::gls(y ~ 0 + Group, data = df, weights = nlme::varIdent(form = ~ 1 | Group), na.action = na.omit)
    }, error = function(e) {
      tryCatch({
        lm(y ~ 0 + Group, data = df)
      }, error = function(e2) NULL)
    })
    
    if (is.null(fit)) {
      results$log2FC[i] <- 0
      results$p_raw[i] <- 1
      results$t_stat[i] <- 0
      next
    }
    
    mean_comp <- mean(y[groups %in% comp_orig], na.rm = TRUE)
    mean_ref <- mean(y[groups %in% ref_orig], na.rm = TRUE)
    log2FC_val <- mean_comp - mean_ref
    results$log2FC[i] <- if (is.finite(log2FC_val)) log2FC_val else 0
    
    coefs <- coef(fit)
    vcov_mat <- vcov(fit)
    
    c_vec <- rep(0, length(coefs))
    names(c_vec) <- names(coefs)
    
    matched_comp <- names(coefs)[make.names(names(coefs)) %in% paste0("Group", make.names(comp_orig))]
    matched_ref <- names(coefs)[make.names(names(coefs)) %in% paste0("Group", make.names(ref_orig))]
    
    if (length(matched_comp) > 0 && length(matched_ref) > 0) {
      c_vec[matched_comp] <- 1 / length(matched_comp)
      c_vec[matched_ref] <- -1 / length(matched_ref)
      
      est <- sum(c_vec * coefs)
      se <- tryCatch(sqrt(t(c_vec) %*% vcov_mat %*% c_vec)[1,1], error = function(e) NA_real_)
      
      if (!is.na(se) && se > 0) {
        t_val <- est / se
        df_residual <- length(y) - length(coefs)
        p_val <- 2 * (1 - pt(abs(t_val), df = df_residual))
        
        results$p_raw[i] <- p_val
        results$t_stat[i] <- t_val
      } else {
        results$p_raw[i] <- 1
        results$t_stat[i] <- 0
      }
    } else {
      results$p_raw[i] <- 1
      results$t_stat[i] <- 0
    }
  }
  
  results$p_adj_bh <- p.adjust(results$p_raw, method = "BH")
  return(list(fit = NULL, results = results))
}

#' Perform Non-Parametric (Wilcoxon Rank-Sum) Analysis
perform_non_parametric_analysis <- function(data_matrix, metadata, group_col, contrast_str) {
  if (is.null(data_matrix) || ncol(data_matrix) < 2) stop("Not enough data for non-parametric analysis.")
  
  groups <- factor(metadata[[group_col]])
  unique_groups <- levels(groups)
  
  parts <- strsplit(contrast_str, "\\s*-\\s*")[[1]]
  comp_part <- if (length(parts) >= 1) parts[1] else ""
  ref_part <- if (length(parts) >= 2) parts[2] else ""
  
  comp_tokens <- strsplit(comp_part, "[^a-zA-Z0-9\\.]+")[[1]]
  ref_tokens <- strsplit(ref_part, "[^a-zA-Z0-9\\.]+")[[1]]
  
  comp_tokens <- comp_tokens[comp_tokens != "" & !grepl("^\\d+$", comp_tokens)]
  ref_tokens <- ref_tokens[ref_tokens != "" & !grepl("^\\d+$", ref_tokens)]
  
  comp_orig <- unique_groups[make.names(unique_groups) %in% comp_tokens]
  ref_orig <- unique_groups[make.names(unique_groups) %in% ref_tokens]
  
  num_lipids <- nrow(data_matrix)
  results <- data.frame(
    Lipid_Name = rownames(data_matrix),
    log2FC = NA_real_,
    p_raw = NA_real_,
    t_stat = NA_real_,
    stringsAsFactors = FALSE
  )
  
  for (i in 1:num_lipids) {
    y <- data_matrix[i, ]
    y_comp <- y[groups %in% comp_orig]
    y_ref <- y[groups %in% ref_orig]
    
    med_comp <- median(y_comp, na.rm = TRUE)
    med_ref <- median(y_ref, na.rm = TRUE)
    results$log2FC[i] <- med_comp - med_ref
    
    wt <- tryCatch({
      wilcox.test(y_comp, y_ref, exact = FALSE)
    }, error = function(e) NULL)
    
    if (!is.null(wt)) {
      results$p_raw[i] <- wt$p.value
      results$t_stat[i] <- wt$statistic
    } else {
      results$p_raw[i] <- 1
      results$t_stat[i] <- 0
    }
  }
  
  results$p_adj_bh <- p.adjust(results$p_raw, method = "BH")
  return(list(fit = NULL, results = results))
}

#' Perform Differential Variability (varFit/diffVar) Analysis
perform_diff_var_analysis <- function(data_matrix, metadata, group_col, contrast_str) {
  if (is.null(data_matrix) || ncol(data_matrix) < 2) stop("Not enough data for differential variability analysis.")
  
  groups <- factor(metadata[[group_col]])
  
  res_matrix <- matrix(NA, nrow = nrow(data_matrix), ncol = ncol(data_matrix))
  rownames(res_matrix) <- rownames(data_matrix)
  colnames(res_matrix) <- colnames(data_matrix)
  
  for (i in 1:nrow(data_matrix)) {
    y <- data_matrix[i, ]
    medians <- tapply(y, groups, median, na.rm = TRUE)
    res_matrix[i, ] <- abs(y - medians[as.character(groups)])
  }
  
  perform_limma_analysis(res_matrix, metadata, group_col, contrast_str)
}

#' Auto-Route Statistical Methods based on Data Diagnostics
auto_route_statistical_method <- function(data_matrix, metadata, group_col) {
  # 1. Check Sample Size per Group
  # Non-parametric rank tests (Wilcoxon/Kruskal-Wallis) require n >= 5 per group to achieve adequate power under BH-FDR correction
  if (!is.null(metadata) && group_col %in% names(metadata)) {
    group_counts <- table(metadata[[group_col]])
    min_n <- if (length(group_counts) > 0) min(group_counts) else 0
    if (min_n < 5) {
      cat("[DE AUTO-ROUTE] Small sample size detected (min cohort n =", min_n, "< 5). Non-parametric rank tests suffer severe power loss under multiple testing. Preserving empirical Bayes moderated limma.\n", file = stderr())
      return("limma")
    }
  }

  # 2. Check Skewness for parametric vs non-parametric routing
  skewness <- apply(data_matrix, 1, function(y) {
    mu <- mean(y, na.rm = TRUE)
    s <- sd(y, na.rm = TRUE)
    if (is.na(s) || s == 0) return(0)
    mean((y - mu)^3, na.rm = TRUE) / s^3
  })
  avg_abs_skew <- mean(abs(skewness), na.rm = TRUE)
  if (avg_abs_skew > 1.5) {
    cat("[DE AUTO-ROUTE] Skewed distributions (skewness =", avg_abs_skew, ") with sufficient sample size (n >= 5). Routing to non_parametric.\n", file = stderr())
    return("non_parametric")
  }
  
  cat("[DE AUTO-ROUTE] Symmetric distributions. Routing to standard limma.\n", file = stderr())
  return("limma")
}

#' Generate S-Tier Journal Style Caption for Plots
#'
#' @param type Type of plot ("qc", "pca", "heatmap_unfiltered", "heatmap_filtered", "volcano", "lsea", "structural", "violin", "fla", "longitudinal", "composition")
#' @param method The current differential expression method ("limma", "spline_dream", "gls", "non_parametric", "diff_var", "auto")
#' @param p_value_type The active P-value type ("adjusted" or "raw")
#' @return HTML character string
get_journal_caption <- function(type, method = "limma", p_value_type = "adjusted", contrast_info = NULL, selected_features = NULL) {
  # Clean arguments
  method <- as.character(method)
  if (length(method) == 0) method <- "limma"
  p_value_type <- as.character(p_value_type)
  if (length(p_value_type) == 0) p_value_type <- "adjusted"
  
  # Determine if it is a two-group comparison
  is_two_group <- TRUE
  if (!is.null(contrast_info) && (length(contrast_info$ref) > 1 || length(contrast_info$comp) > 1)) {
    is_two_group <- FALSE
  }
  
  # Check if selection was automatic
  selection_mode <- if (grepl("^auto_", method)) "Automatic mode" else "Manual selection"
  base_method <- gsub("^auto_", "", method)
  
  # Determine statistical test name
  test_name <- if (type == "longitudinal") {
    if (base_method == "non_parametric") {
      "Paired Wilcoxon signed-rank test (non-parametric)"
    } else {
      "Paired Student's t-test (parametric)"
    }
  } else if (type %in% c("violin", "fla", "fla_volcano", "cellular_org_stress", "cellular_org_cpi", "cellular_org_polar")) {
    if (base_method == "non_parametric") {
      if (is_two_group) {
        "Wilcoxon rank-sum test (non-parametric, two-group comparison)"
      } else {
        "Kruskal-Wallis test (non-parametric, multi-group comparison)"
      }
    } else {
      if (is_two_group) {
        "Student's two-tailed t-test (parametric, two-group comparison)"
      } else {
        "One-way ANOVA (parametric, multi-group comparison)"
      }
    }
  } else { # Global DE tests (volcano, heatmap_filtered, lsea, structural)
    if (base_method == "non_parametric") {
      if (is_two_group) {
        "Wilcoxon rank-sum test (non-parametric, two-group comparison)"
      } else {
        "Kruskal-Wallis test (non-parametric, multi-group comparison)"
      }
    } else {
      if (is_two_group) {
        "Empirical Bayes moderated two-tailed t-test (parametric, limma package)"
      } else {
        "Empirical Bayes moderated one-way ANOVA (parametric, limma package)"
      }
    }
  }
  
  # Determine P-value details
  p_val_detail <- if (type %in% c("violin", "fla", "longitudinal", "fla_volcano", "cellular_org_stress", "cellular_org_cpi", "cellular_org_polar")) {
    "Raw, unadjusted P-values"
  } else {
    if (p_value_type == "adjusted") {
      "Adjusted P-values (Benjamini-Hochberg FDR correction)"
    } else {
      "Raw, unadjusted P-values"
    }
  }
  
  # Determine Contrast comparison
  contrast_detail <- if (!is.null(contrast_info) && !is.null(contrast_info$comp) && !is.null(contrast_info$ref)) {
    paste0(paste(contrast_info$comp, collapse = " + "), " vs ", paste(contrast_info$ref, collapse = " + "))
  } else {
    "All groups"
  }
  
  has_stats <- type %in% c("heatmap_filtered", "volcano", "lsea", "structural", "structural_grid", "violin", "fla", "fla_volcano", "longitudinal", "cellular_org_stress", "cellular_org_cpi", "cellular_org_polar")
  
  base_desc <- switch(type,
    "bqc" = "Batch Quality Control (BQC) measurement precision is evaluated by calculating the Coefficient of Variation (CoV % = SD / Mean * 100) for each lipid species across all selected BQC replicates. A dashed vertical line indicates the user-defined threshold, above which lipids are flagged as imprecise.",
    "qc" = "Boxplots represent the distribution of lipid abundance values across samples. Sample intensities were normalized using median centering to align global distribution scaling.",
    "pca" = "Principal Component Analysis (PCA) was performed on log<sub>2</sub>-transformed, median-centered lipid abundance data using the NIPALS algorithm to accommodate missing values.",
    "composition" = "Compositional profiles display the cumulative abundance of lipid categories or species.",
    "heatmap_unfiltered" = "Hierarchical clustering of lipid abundance profiles. Color scale indicates Z-score values (standard deviations from the row mean). No statistical filtering or significance testing is applied to this plot.",
    "heatmap_filtered" = "Hierarchical clustering of differentially abundant lipids. Color scale indicates Z-score values (standard deviations from the row mean).",
    "volcano" = {
      comp_str <- if (!is.null(contrast_info) && !is.null(contrast_info$comp)) paste(contrast_info$comp, collapse = " + ") else "Comparison Group"
      ref_str <- if (!is.null(contrast_info) && !is.null(contrast_info$ref)) paste(contrast_info$ref, collapse = " + ") else "Reference Group"
      paste0(
        "Volcano plot illustrating the relationship between effect size and statistical significance for all analyzed lipids. ",
        "Right side (positive log2 fold change) shows lipids upregulated in <strong>", comp_str, "</strong>, while left side (negative log2 fold change) shows lipids upregulated in <strong>", ref_str, "</strong>."
      )
    },
    "lsea" = {
      comp_str <- if (!is.null(contrast_info) && !is.null(contrast_info$comp)) paste(contrast_info$comp, collapse = " + ") else "Comparison Group"
      ref_str <- if (!is.null(contrast_info) && !is.null(contrast_info$ref)) paste(contrast_info$ref, collapse = " + ") else "Reference Group"
      paste0(
        "Lipid Set Enrichment Analysis (LSEA) dot plot illustrating ranked differential abundance effect sizes across lipid categories or subclasses. ",
        "Right side (+X axis, positive log2 fold change) shows lipid sets enriched / upregulated in <b>", comp_str, "</b>, while left side (-X axis, negative log2 fold change) shows lipid sets enriched / upregulated in <b>", ref_str, "</b>. ",
        "Dot size indicates statistical significance (-log10 P-value)."
      )
    },
    "structural" = {
      comp_str <- if (!is.null(contrast_info) && !is.null(contrast_info$comp)) paste(contrast_info$comp, collapse = " + ") else "Comparison Group"
      ref_str <- if (!is.null(contrast_info) && !is.null(contrast_info$ref)) paste(contrast_info$ref, collapse = " + ") else "Reference Group"
      paste0(
        "Structural Analysis dot plot illustrating differential abundance shifts mapped across lipid structural attributes (carbon chain length and double bond unsaturation). ",
        "Right side (+X axis, positive difference) shows structural features increased in <b>", comp_str, "</b>, while left side (-X axis, negative difference) shows structural features increased in <b>", ref_str, "</b>. ",
        "Dot size indicates magnitude of structural difference (|\u0394|)."
      )
    },
    "structural_grid" = {
      comp_str <- if (!is.null(contrast_info) && !is.null(contrast_info$comp)) paste(contrast_info$comp, collapse = " + ") else "Comparison Group"
      ref_str <- if (!is.null(contrast_info) && !is.null(contrast_info$ref)) paste(contrast_info$ref, collapse = " + ") else "Reference Group"
      paste0(
        "Structural grid visualization displays the differential abundance patterns mapped by Carbon Chain Length (X-axis) and Double Bond Count (Y-axis) for individual lipid species within the selected class. ",
        "Red color shows structural features upregulated in <strong>", comp_str, "</strong>, while blue color shows structural features upregulated in <strong>", ref_str, "</strong>."
      )
    },
    "violin" = "Violin plots illustrating the distribution probability density of individual lipid species across groups.",
    "fla" = "Functional lipid indices and ratios representing key biochemical properties, including membrane structural architecture, fluidity, lipid signaling intermediates, and energy storage dynamics.",
    "fla_volcano" = "Volcano plot illustrating the relationship between effect size and statistical significance for calculated functional lipid class indices and ratios (representing membrane structure, fluidity, signaling intermediates, and energy storage dynamics).",
    "longitudinal" = "Longitudinal trajectory plots display the mean abundance profiles across sequential timepoints.",
    "cellular_org_stress" = "Organelle stress profiles display computed biochemical markers across essential subcellular compartments (Endoplasmic Reticulum, Mitochondria, Lysosomes, Peroxisomes, and the Golgi apparatus). It assesses curvature, saturation, maturation blocks, degradative capacity, and transport stall.",
    "cellular_org_cpi" = "The Cellular Peroxidation Index (CPI) quantifies sample-level susceptibility to lipid peroxidation and ferroptosis by applying weighted coefficients to the abundance of monoenoic, dienoic, tetraenoic, pentaenoic, and hexaenoic lipid species.",
    "cellular_org_polar" = "The Lipidomic Phenotypic State Map illustrates sample-level trajectories along two functional axes: neutral lipid storage (M1-like inflammatory state) and membrane structural/ether complexity (M2-like resolving state).",
    "Statistical methodology note"
  )
  
  # Format selected features
  features_html <- ""
  if (!is.null(selected_features) && length(selected_features) > 0) {
    max_show <- 8
    shown_features <- selected_features[1:min(max_show, length(selected_features))]
    features_str <- paste(shown_features, collapse = ", ")
    if (length(selected_features) > max_show) {
      features_str <- paste0(features_str, " (+", length(selected_features) - max_show, " more)")
    }
    features_html <- paste0("<strong>Selected Features:</strong> <b>", features_str, "</b><br/>")
  }
  
  caption <- if (has_stats) {
    paste0(
      base_desc,
      "<div style='margin-top: 6px; padding-top: 6px; border-top: 1px solid #e0e0e0; font-size: 10.5px; line-height: 1.4;'>",
      "<strong>Test Applied:</strong> <b>", test_name, "</b><br/>",
      "<strong>Significance Evaluation:</strong> <b>", p_val_detail, "</b><br/>",
      features_html,
      "<strong>Comparison:</strong> <b>", contrast_detail, "</b>",
      "</div>"
    )
  } else {
    base_desc
  }
  
  # Return formatted HTML box
  return(shiny::HTML(paste0(
    "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; border-radius: 0 4px 4px 0;'>",
    caption,
    "</div>"
  )))
}

#' Compute Local P-Value for Two-Group Comparison using selected Method
#'
#' @param base_vals Numeric vector of reference values
#' @param comp_vals Numeric vector of comparison values
#' @param method String, one of "limma", "gls", "non_parametric", "diff_var", "spline_dream", "auto"
#' @param paired Logical, whether the comparison is paired (e.g. longitudinal)
#' @return Numeric p-value or NA
compute_local_p_val <- function(base_vals, comp_vals, method = "limma", paired = FALSE) {
  base_vals <- base_vals[!is.na(base_vals)]
  comp_vals <- comp_vals[!is.na(comp_vals)]
  if (length(base_vals) < 2 || length(comp_vals) < 2) return(NA_real_)
  
  # Check if variance is zero in both
  v_base <- var(base_vals, na.rm = TRUE)
  v_comp <- var(comp_vals, na.rm = TRUE)
  if (is.na(v_base) || is.na(v_comp) || (v_base == 0 && v_comp == 0)) return(NA_real_)
  
  method <- as.character(method)
  if (length(method) == 0) method <- "limma"
  method <- gsub("^auto_", "", method)
  
  if (method == "non_parametric") {
    p_val <- tryCatch(wilcox.test(base_vals, comp_vals, exact = FALSE, paired = paired)$p.value, error = function(e) NA_real_)
    return(p_val)
  }
  
  # Default: Standard parametric t-test (handles limma, spline_dream, gls, diff_var fallbacks)
  p_val <- tryCatch(t.test(base_vals, comp_vals, var.equal = TRUE, paired = paired)$p.value, error = function(e) NA_real_)
  return(p_val)
}

#' Generate statistical methodology summary for the console report
#'
#' @param shared_data The shared data bridge object
#' @return A character string
get_stats_console_method_summary <- function(shared_data) {
  actual_method <- tryCatch(shared_data$actual_de_method(), error = function(e) "limma")
  contrast <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
  p_value_type <- tryCatch(shared_data$de_settings()$p_value_type, error = function(e) "adjusted")
  
  # Calculate skewness on the loaded dataset dynamically
  df <- tryCatch(shared_data$data_processed(), error = function(e) NULL)
  avg_abs_skew <- NA_real_
  if (!is.null(df) && nrow(df) > 0) {
    mat_num <- tryCatch({
      df %>% dplyr::select(-Lipid_Name) %>% as.matrix()
    }, error = function(e) NULL)
    
    if (!is.null(mat_num) && ncol(mat_num) >= 2) {
      # Use log2(x) for skewness check to match actual DE analysis input routing
      mat_log <- log2(mat_num)
      mat_log[!is.finite(mat_log)] <- NA
      
      skewness <- apply(mat_log, 1, function(y) {
        mu <- mean(y, na.rm = TRUE)
        s <- sd(y, na.rm = TRUE)
        if (is.na(s) || s == 0) return(0)
        mean((y - mu)^3, na.rm = TRUE) / s^3
      })
      avg_abs_skew <- mean(abs(skewness), na.rm = TRUE)
    }
  }
  
  is_two_group <- TRUE
  ref_len <- 0
  comp_len <- 0
  if (!is.null(contrast)) {
    ref_len <- length(contrast$ref)
    comp_len <- length(contrast$comp)
    if (ref_len > 1 || comp_len > 1) {
      is_two_group <- FALSE
    }
  }
  
  # 1. Selection Method
  selection_method <- "Manual Selection"
  auto_explanation <- ""
  if (grepl("^auto_", actual_method)) {
    selection_method <- "Automatic mode"
    skew_val_str <- if (is.na(avg_abs_skew)) "N/A" else round(avg_abs_skew, 4)
    skew_decision <- if (!is.na(avg_abs_skew) && avg_abs_skew > 1.5) {
      paste0(skew_val_str, " > 1.5 (routed to non_parametric)")
    } else {
      paste0(skew_val_str, " <= 1.5 (routed to limma)")
    }
    
    auto_explanation <- paste0(
      "To ensure statistical assumptions were met, the data distribution was evaluated:\n",
      "     * Skewness Formula:                      Skewness_i = mean((x_ij - mu_i)^3) / sigma_i^3\n",
      "     * Global Assembly:                       Mean Absolute Skewness = (1/M) * sum(|Skewness_i|)\n",
      "     * Computed Dataset Skewness:             ", skew_val_str, "\n",
      "     * Routing Decision Threshold Criterion:  Mean Absolute Skewness > 1.5 ? Yes -> Non-Parametric : No -> Parametric (limma)\n",
      "     * Evaluation Results:                    ", skew_decision, "\n"
    )
  }
  
  # 2. Resolved Test & Hypothesis Testing explanation
  base_method <- gsub("^auto_", "", actual_method)
  if (base_method == "non_parametric") {
    resolved_test <- "Non-Parametric Testing (Wilcoxon/Kruskal-Wallis)"
    if (is_two_group) {
      hypothesis_testing <- paste0(
        "Wilcoxon rank-sum tests (for two-group comparisons)\n",
        "     * Design Complexity Analysis:            Count(ref_groups) = ", ref_len, ", Count(comp_groups) = ", comp_len, " (Two-group comparison)\n",
        "     * Test Choice Logic:                     Two-group design + Non-Parametric routing -> Wilcoxon rank-sum test chosen."
      )
    } else {
      hypothesis_testing <- paste0(
        "Kruskal-Wallis tests (for multi-group comparisons)\n",
        "     * Design Complexity Analysis:            Count(ref_groups) = ", ref_len, ", Count(comp_groups) = ", comp_len, " (Multi-group contrast)\n",
        "     * Test Choice Logic:                     Multi-group design + Non-Parametric routing -> Kruskal-Wallis test chosen."
      )
    }
  } else {
    resolved_test <- "Parametric Moderated Linear Modeling (limma)"
    if (is_two_group) {
      hypothesis_testing <- paste0(
        "moderated two-tailed t-tests (for two-group comparisons)\n",
        "     * Design Complexity Analysis:            Count(ref_groups) = ", ref_len, ", Count(comp_groups) = ", comp_len, " (Two-group comparison)\n",
        "     * Test Choice Logic:                     Two-group design + Parametric routing -> Moderated two-tailed t-test chosen."
      )
    } else {
      hypothesis_testing <- paste0(
        "moderated one-way ANOVA (for multi-group designs)\n",
        "     * Design Complexity Analysis:            Count(ref_groups) = ", ref_len, ", Count(comp_groups) = ", comp_len, " (Multi-group contrast)\n",
        "     * Test Choice Logic:                     Multi-group design + Parametric routing -> Moderated one-way ANOVA chosen."
      )
    }
  }
  
  # 3. Significance Evaluation
  p_val_desc <- if (p_value_type == "adjusted") {
    "Benjamini-Hochberg False Discovery Rate (FDR) adjusted P-values (BH FDR)"
  } else {
    "Raw, unadjusted P-values"
  }
  
  summary_text <- paste0(
    "==================================================\n",
    "STATISTICAL METHODOLOGY & ROUTING SUMMARY\n",
    "==================================================\n",
    "   - Selection Method:        ", selection_method, "\n"
  )
  if (nzchar(auto_explanation)) {
    summary_text <- paste0(summary_text, "     * Routing Logic:\n       ", auto_explanation)
  }
  # 4. Experimental Design & Diagnostics
  contrast_details <- ""
  if (!is.null(contrast)) {
    contrast_details <- paste0(
      "   - Contrast Formula:        ", contrast$str %||% "N/A", "\n"
    )
    if (!is.null(contrast$hypothesis) && nzchar(contrast$hypothesis)) {
      contrast_details <- paste0(
        contrast_details,
        "   - Hypothesis Narrative:    ", contrast$hypothesis, "\n"
      )
    }
    if (!is.null(contrast$block_col) && nzchar(contrast$block_col)) {
      corr_str <- if (!is.null(contrast$consensus_correlation) && is.finite(contrast$consensus_correlation)) {
        paste0(" (Consensus correlation rho = ", round(contrast$consensus_correlation, 4), ")")
      } else " (Model estimated)"
      contrast_details <- paste0(
        contrast_details,
        "   - Repeated Measures Block: ", contrast$block_col, corr_str, "\n"
      )
    }
  }

  summary_text <- paste0(
    summary_text,
    "   - Resolved Test Category:  ", resolved_test, "\n",
    "   - Hypothesis Testing:      ", hypothesis_testing, "\n",
    "   - Significance Criterion:  ", p_val_desc, "\n",
    contrast_details,
    "==================================================\n"
  )
  
  return(summary_text)
}

#' Render Differential Expression Not Run Callout Banner
#'
#' Displays a clean publication-grade empty-state banner with an interactive
#' 'Point to the Differential Expression Menu' button whenever differential expression
#' has not been configured in the main sidebar.
#'
#' @param shared_data Reactive shared data object
#' @return Shiny tagList or NULL
render_de_not_run_banner <- function(shared_data) {
  # Case 1: Differential Expression has not been run or comparison groups not chosen
  if (is.null(shared_data$de_results()) || is.null(shared_data$de_contrast_info())) {
    choices <- tryCatch(
      if (!is.null(shared_data$de_group_choices)) shared_data$de_group_choices() else NULL, 
      shiny.silent.error = function(e) NULL, 
      error = function(e) NULL
    )
    if (is.null(choices) || length(choices) == 0) {
      meta <- tryCatch(shared_data$grouped_metadata(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
      if (is.null(meta)) meta <- tryCatch(shared_data$all_metadata(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
      if (!is.null(meta) && "Dynamic_DE_Group" %in% names(meta)) {
        choices <- unique(meta$Dynamic_DE_Group)
      } else if (!is.null(meta) && "Group1" %in% names(meta)) {
        choices <- unique(meta$Group1)
      }
    }
    if (is.null(choices) || length(choices) == 0) {
      choices <- c("Kidney_WT", "Kidney_Ctns", "Plasma_WT", "Plasma_Ctns")
    }
    
    current_mode <- tryCatch(shared_data$de_comparison_mode(), shiny.silent.error = function(e) "direct", error = function(e) "direct") %||% "direct"
    current_ref  <- tryCatch(shared_data$de_ref_selected(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
    current_comp <- tryCatch(shared_data$de_comp_selected(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
    # Never auto-fill groups with defaults; keep unselected until user chooses
    
    return(
      div(
        class = "de-not-run-banner alert alert-warning mb-3 shadow-sm",
        style = "border-left: 5px solid #d97706; background: #fffdf5; border-radius: 10px; padding: 14px 18px; border-top: 1px solid #fde68a; border-right: 1px solid #fde68a; border-bottom: 1px solid #fde68a;",
        
        # Header Row
        div(
          class = "d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 pb-2",
          style = "border-bottom: 1px solid rgba(217, 119, 6, 0.15);",
          div(
            class = "d-flex align-items-center gap-3",
            div(
              style = "width: 38px; height: 38px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0;",
              icon("code-compare")
            ),
            div(
              tags$h6(
                style = "font-weight: 700; color: #92400e; margin: 0 0 2px 0; font-size: 0.96rem;", 
                "Differential Expression: Select Cohorts to Compare"
              ),
              tags$span(
                style = "color: #b45309; font-size: 12.5px;", 
                "Base dataset is processed & active. Select your Reference and Comparison cohorts below or in the left dock to compute log2FC and statistical significance."
              )
            )
          ),
          tags$button(
            type = "button",
            class = "btn btn-sm btn-open-de-menu btn-point-de-menu mt-1 mt-sm-0",
            onclick = "window.pointToDifferentialExpressionMenu && window.pointToDifferentialExpressionMenu(event); return false;",
            `data-action` = "point-de-menu",
            style = "background: #ffffff; border: 1px solid #cbd5e1; color: #1d4ed8; font-weight: 600; padding: 6px 15px; border-radius: 7px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); white-space: nowrap;",
            icon("sliders"), " Configure in Left Dock"
          )
        ),
        
        # Interactive Inline Controls Card
        div(
          class = "de-inline-setup-card p-2 p-sm-3 bg-white rounded border",
          style = "border-color: #fde68a !important; box-shadow: 0 1px 2px rgba(0,0,0,0.03);",
          
          # Mode Switcher Row
          div(
            class = "d-flex align-items-center gap-2 mb-2",
            tags$span(
              style = "font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;",
              "Mode:"
            ),
            div(
              class = "btn-group btn-group-sm de-inline-mode-toggle",
              role = "group",
              tags$button(
                type = "button",
                class = paste0("btn btn-sm de-inline-mode-btn ", if (current_mode == "direct") "btn-primary active" else "btn-outline-primary"),
                `data-mode` = "direct",
                onclick = "window.syncInlineDEMode && window.syncInlineDEMode('direct'); return false;",
                "Direct"
              ),
              tags$button(
                type = "button",
                class = paste0("btn btn-sm de-inline-mode-btn ", if (current_mode == "interaction") "btn-primary active" else "btn-outline-primary"),
                `data-mode` = "interaction",
                onclick = "window.syncInlineDEMode && window.syncInlineDEMode('interaction'); return false;",
                "Interaction"
              )
            )
          ),
          
          # Direct Mode Selectors
          div(
            class = "de-inline-direct-panel row g-2 align-items-center",
            style = if (current_mode == "direct") "display: flex;" else "display: none;",
            
            # Reference
            div(
              class = "col-12 col-md-6",
              div(
                class = "d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1",
                tags$label(class = "form-label small fw-bold text-secondary mb-0", "Reference Cohort(s):"),
                tags$span(class = "badge bg-light text-secondary border", style = "font-size: 10px; font-weight: 500;", "Selected groups (multi)")
              ),
              tags$select(
                class = "form-select form-select-sm de-inline-select de-inline-ref-select",
                multiple = "multiple",
                `data-placeholder` = "Select reference groups (multiple allowed)...",
                onchange = "window.syncInlineDEToSidebar && window.syncInlineDEToSidebar('ref', this);",
                lapply(choices, function(ch) {
                  tags$option(value = ch, selected = if (ch %in% current_ref) "selected" else NULL, ch)
                })
              )
            ),
            
            # Comparison
            div(
              class = "col-12 col-md-6",
              div(
                class = "d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1",
                tags$label(class = "form-label small fw-bold text-secondary mb-0", "Comparison Cohort(s):"),
                tags$span(class = "badge bg-light text-secondary border", style = "font-size: 10px; font-weight: 500;", "Selected groups (multi)")
              ),
              tags$select(
                class = "form-select form-select-sm de-inline-select de-inline-comp-select",
                multiple = "multiple",
                `data-placeholder` = "Select comparison groups (multiple allowed)...",
                onchange = "window.syncInlineDEToSidebar && window.syncInlineDEToSidebar('comp', this);",
                lapply(choices, function(ch) {
                  tags$option(value = ch, selected = if (ch %in% current_comp) "selected" else NULL, ch)
                })
              )
            )
          ),
          
          # Interaction Mode Selectors (Reference first, then Comparison)
          div(
            class = "de-inline-interaction-panel row g-2 align-items-center",
            style = if (current_mode == "interaction") "display: flex;" else "display: none;",
            div(
              class = "col-12 small text-muted mb-1",
              "Formula: (Comp_T2 - Comp_T1) - (Ref_T2 - Ref_T1)"
            ),
            div(
              class = "col-6 col-md-3",
              tags$label(class = "form-label small text-secondary mb-0", "Ref T1 (Baseline):"),
              tags$select(
                class = "form-select form-select-sm de-inline-int-select",
                onchange = "window.syncInlineDEInteraction && window.syncInlineDEInteraction('int_ref_t1', this.value);",
                tags$option(value = "", "Select group..."),
                lapply(choices, function(ch) tags$option(value = ch, ch))
              )
            ),
            div(
              class = "col-6 col-md-3",
              tags$label(class = "form-label small text-secondary mb-0", "Ref T2 (Response):"),
              tags$select(
                class = "form-select form-select-sm de-inline-int-select",
                onchange = "window.syncInlineDEInteraction && window.syncInlineDEInteraction('int_ref_t2', this.value);",
                tags$option(value = "", "Select group..."),
                lapply(choices, function(ch) tags$option(value = ch, ch))
              )
            ),
            div(
              class = "col-6 col-md-3",
              tags$label(class = "form-label small text-secondary mb-0", "Comp T1 (Baseline):"),
              tags$select(
                class = "form-select form-select-sm de-inline-int-select",
                onchange = "window.syncInlineDEInteraction && window.syncInlineDEInteraction('int_comp_t1', this.value);",
                tags$option(value = "", "Select group..."),
                lapply(choices, function(ch) tags$option(value = ch, ch))
              )
            ),
            div(
              class = "col-6 col-md-3",
              tags$label(class = "form-label small text-secondary mb-0", "Comp T2 (Response):"),
              tags$select(
                class = "form-select form-select-sm de-inline-int-select",
                onchange = "window.syncInlineDEInteraction && window.syncInlineDEInteraction('int_comp_t2', this.value);",
                tags$option(value = "", "Select group..."),
                lapply(choices, function(ch) tags$option(value = ch, ch))
              )
            )
          )
        ),
        
        # Educational Guidance & Fast-Link to Full Menu
        div(
          class = "d-flex justify-content-between align-items-center flex-wrap gap-2 mt-2 pt-1",
          tags$span(
            style = "font-size: 12px; color: #92400e;",
            icon("circle-info", class = "me-1 text-warning"),
            "Detailed options (Log2FC threshold, P-value cutoffs, statistical method, etc.) are available in the full menu."
          ),
          tags$a(
            href = "#",
            onclick = "window.pointToDifferentialExpressionMenu && window.pointToDifferentialExpressionMenu(event); return false;",
            `data-action` = "point-de-menu",
            style = "color: #1d4ed8; font-weight: 600; font-size: 12px; text-decoration: none;",
            "Configure in left dock ", icon("arrow-right", class = "ms-1")
          )
        )
      )
    )
  }
  
  # Case 2: DE has run, but no significant features were found under current thresholds
  sig_lipids <- tryCatch(shared_data$significant_lipids(), error = function(e) NULL)
  if (!is.null(sig_lipids) && length(sig_lipids) == 0) {
    de_sett <- tryCatch(shared_data$de_settings(), error = function(e) list())
    p_thresh <- de_sett$p_threshold %||% 0.05
    lfc_thresh <- de_sett$log2fc_threshold %||% 1.0
    p_type <- de_sett$p_value_type %||% "adjusted"
    is_adj <- (p_type == "adjusted" || p_type == "p_adj_bh")
    p_label <- if (is_adj) "FDR adjusted p-value" else "raw p-value"
    
    return(
      div(
        class = "de-no-sig-banner alert alert-warning mb-3 shadow-sm",
        style = "border-left: 5px solid #d97706; background: #fffdf5; border-radius: 9px; padding: 14px 18px; border-top: 1px solid #fed7aa; border-right: 1px solid #fed7aa; border-bottom: 1px solid #fed7aa;",
        div(
          class = "d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2",
          div(
            class = "d-flex align-items-center gap-3",
            div(
              style = "width: 40px; height: 40px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;",
              icon("filter-circle-xmark")
            ),
            div(
              tags$h6(
                style = "font-weight: 700; color: #92400e; margin: 0 0 2px 0; font-size: 0.98rem;", 
                "No Statistically Significant Features Found"
              ),
              tags$span(
                style = "color: #b45309; font-size: 13px; font-weight: 500;", 
                paste0("Current cutoffs: ", p_label, " < ", p_thresh, ", |Log2FC| >= ", lfc_thresh)
              )
            )
          ),
          div(
            class = "d-flex flex-wrap gap-2 align-items-center mt-2 mt-sm-0",
            if (is_adj) {
              tags$button(
                type = "button",
                class = "btn btn-sm",
                onclick = "switchToRawPValue()",
                style = "background: #fef08a; border: 1px solid #eab308; color: #713f12; font-weight: 600; padding: 6px 14px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); white-space: nowrap;",
                icon("bolt"), " Shift to Raw P-Value"
              )
            },
            tags$button(
              type = "button",
              class = "btn btn-sm btn-outline-primary",
              onclick = "openOutliersDetectionTab()",
              style = "font-weight: 600; padding: 6px 14px; border-radius: 6px; white-space: nowrap;",
              icon("microscope"), " Outliers Detection"
            ),
            tags$button(
              type = "button",
              class = "btn btn-sm btn-outline-secondary btn-open-de-menu btn-point-de-menu",
              onclick = "window.pointToDifferentialExpressionMenu && window.pointToDifferentialExpressionMenu(event); return false;",
              `data-action` = "point-de-menu",
              style = "font-weight: 600; padding: 6px 14px; border-radius: 6px; white-space: nowrap;",
              icon("sliders"), " Modify Cutoffs"
            )
          )
        ),
        tags$div(
          style = "font-size: 13px; color: #78350f; line-height: 1.55; padding-left: 52px;",
          tags$p(
            style = "margin-bottom: 4px;",
            tags$strong("Possible causes & actions: "),
            "Unidentified sample outliers can inflate replicate variance and reduce statistical power; anomalous replicates can be diagnosed and processed in ",
            tags$a(href = "#", onclick = "openOutliersDetectionTab(); return false;", style = "color: #2563eb; font-weight: 600; text-decoration: underline;", "Outliers Detection"),
            "."
          ),
          tags$p(
            style = "margin-bottom: 0;",
            "Alternatively, you may explore shifting to ",
            tags$a(href = "#", onclick = "switchToRawPValue(); return false;", style = "color: #b45309; font-weight: 600; text-decoration: underline;", "Raw (uncorrected) p-values"),
            " or relaxing thresholds in ",
            tags$a(href = "#", onclick = "window.pointToDifferentialExpressionMenu && window.pointToDifferentialExpressionMenu(event); return false;", `data-action` = "point-de-menu", style = "color: #b45309; font-weight: 600; text-decoration: underline;", "3. Differential Expression sidebar"),
            ". Please note that a lack of significance may also simply reflect authentic biological uniformity between the selected cohorts."
          )
        )
      )
    )
  }
  
  return(NULL)
}



