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
#' @param reference_groups Character vector of reference group names (for validation)
#' @param comparison_groups Character vector of comparison group names (for validation)
#'
#' @return A list containing the fit object and topTable results
perform_limma_analysis <- function(data_matrix, metadata, group_col, contrast_str) {
  # 1. Validate Inputs
    if (is.null(data_matrix) || ncol(data_matrix) < 2) stop("Not enough data for DE analysis.")
    if (!group_col %in% names(metadata)) stop(paste("Grouping column", group_col, "not found in metadata."))

  # 2. Prepare Design Matrix
    groups <- factor(metadata[[group_col]])
    if (nlevels(groups) < 2) stop("At least 2 groups are required for DE analysis.")

    design <- stats::model.matrix(~ 0 + groups)
    colnames(design) <- make.names(levels(groups))

  # 3. Prepare Contrast
  # Ensure contrast string uses valid R names
  # Note: The caller is responsible for constructing a valid contrast string matching these names

    contrast_matrix <- tryCatch(
        {
            limma::makeContrasts(contrasts = contrast_str, levels = design)
        },
        error = function(e) {
            stop(paste("Invalid contrast:", contrast_str, "\nError:", e$message))
        }
    )

  # 4. Run Limma
    fit <- limma::lmFit(data_matrix, design)
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
    # Fallback: Return LogFC but P=1
    # Extract coefficients (LogFC)
        logFC <- fit2$coefficients[, 1] # Assuming coef=1
        
    # fallback table
        top_table <- data.frame(
           Lipid_Name = rownames(fit2$coefficients),
           log2FC = logFC,
           p_raw = 1,
           p_adj_bh = 1,
           t_stat = 0
        )
        return(list(fit = fit2, results = top_table))
    }

  # 5. Extract Results
    top_table <- limma::topTable(eb_fit, coef = 1, number = Inf, sort.by = "none") %>%
        tibble::rownames_to_column("Lipid_Name") %>%
        dplyr::rename(log2FC = logFC, p_raw = P.Value, p_adj_bh = adj.P.Val, t_stat = t)

    return(list(fit = eb_fit, results = top_table))
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
