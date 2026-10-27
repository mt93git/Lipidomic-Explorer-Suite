# Frozen scientific functions from the guided application, 2026-10-26.
# Test fixture only; never sourced by the application. See guided-source-manifest.csv.
# Original project: Maxence Tricaud, MIT. Guided adaptations: Gerardo Barcia.

# Source: R/modules/1_shared_data_module.R
preparation_sample_ids <- function(df_info, selected, outlier_treatments, apply_outliers = TRUE) {
    use_cols <- selected
    if (is.null(use_cols)) {
        use_cols <- names(df_info$data)[vapply(df_info$data, is.numeric, logical(1))]
        use_cols <- setdiff(use_cols, "Lipid_Name")
    }
    if (isTRUE(apply_outliers)) {
        for (name in names(outlier_treatments)) {
            if (outlier_treatments[[name]] %in% c("remove", "average"))
                use_cols <- setdiff(use_cols, name)
        }
    }
    use_cols
}

# Source: R/modules/1_shared_data_module.R
compute_imputed_matrix <- function(apply_outliers = TRUE) {
    df_info <- rawData()
    if (is.null(df_info) || is.null(df_info$data) || nrow(df_info$data) == 0) {
        return(NULL)
    }
    outlier_treatments <- get_setting("outlierTreatments", list())
    useCols <- preparation_sample_ids(df_info, input$selectedColumns, outlier_treatments, apply_outliers)
    if (length(useCols) == 0)
        return(NULL)
    data_subset <- df_info$data %>% dplyr::select(Lipid_Name, all_of(useCols))
    prep <- ux_filter_detected(data_subset, useCols, threshold = get_setting("minDetectionPct", 0), drop_absent = isTRUE(get_setting("dropNonDetected",
        TRUE)), scope = get_setting("detectionScope", "global"), metadata = allParsedMetadata())
    data_subset <- prep$data
    prep$audit$seed <- get_setting("imputationSeed", 42)
    prep$audit$imputation <- if (isTRUE(get_setting("useImputation", TRUE)))
        "QRILC"
    else "No imputation"
    prep$audit$normalization <- get_setting("normalizationMethod", "median")
    if (isTRUE(get_setting("imputeZerosPerFile", TRUE))) {
        for (cols_in_file in df_info$file_cols) {
            data_subset <- impute_zeros_per_file(data_subset, cols_in_file)
        }
    }
    mat_subset <- data_subset %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
    t_imp_start <- Sys.time()
    log_ingestion_event(stage = "6_IMPUTATION_NORMALIZATION_START", status = "START", message_text = sprintf("Starting Imputation & Normalization for %d samples across %d lipids.",
        ncol(mat_subset), nrow(mat_subset)), details = list(sample_count = ncol(mat_subset), lipid_count = nrow(mat_subset),
        samples = head(colnames(mat_subset), 6), useImputation = isTRUE(get_setting("useImputation",
            TRUE)), normalizationMethod = get_setting("normalizationMethod", "median")))
    mat_for_log <- mat_subset
    mat_for_log[mat_for_log <= 0] <- NA
    mat_log <- log2(mat_for_log)
    qr_objs <- NULL
    if (isTRUE(get_setting("useImputation", TRUE))) {
        if (sum(is.na(mat_log)) > 0) {
            log_ingestion_event(stage = "6a_QRILC_IMPUTATION_RUNNING", status = "INFO", message_text = sprintf("Running QRILC imputation on %d missing values (%.1f%% of matrix)...",
                sum(is.na(mat_log)), 100 * sum(is.na(mat_log))/length(mat_log)))
            mat_log_imputed <- tryCatch({
                set.seed(get_setting("imputationSeed", 42))
                if (system.file(package = "imputeLCMD") == "") {
                  stop("Package 'imputeLCMD' is not installed. Please install it to use QRILC imputation.")
                }
                invisible(capture.output(res_raw <- imputeLCMD::impute.QRILC(mat_log)))
                qr_objs <- res_raw[[2]]
                as.matrix(res_raw[[1]])
            }, error = function(e) {
                log_ingestion_event("6a_QRILC_IMPUTATION_ERROR", "WARNING", paste("QRILC Imputation failed:",
                  e$message), list(error = e$message))
                stop(paste("QRILC failed; no result was substituted:", e$message))
            })
        }
        else {
            mat_log_imputed <- mat_log
        }
    }
    else {
        mat_log_imputed <- mat_log
    }
    qrilc_params_df <- data.frame(Sample = colnames(mat_log), pNAs = sapply(seq_len(ncol(mat_log)), function(j) sum(is.na(mat_log[,
        j]))/nrow(mat_log)), Mean_CDD = sapply(seq_len(ncol(mat_log)), function(j) {
        if (!is.null(qr_objs) && length(qr_objs) >= j && !is.null(qr_objs[[j]]$coefficients)) {
            unname(qr_objs[[j]]$coefficients[1])
        }
        else NA_real_
    }), SD_CDD = sapply(seq_len(ncol(mat_log)), function(j) {
        if (!is.null(qr_objs) && length(qr_objs) >= j && !is.null(qr_objs[[j]]$coefficients)) {
            unname(qr_objs[[j]]$coefficients[2])
        }
        else NA_real_
    }), stringsAsFactors = FALSE)
    qrilc_params_df$Upper_Cutoff_Log2 <- qnorm(pmin(0.999, qrilc_params_df$pNAs + 0.001), mean = qrilc_params_df$Mean_CDD,
        sd = qrilc_params_df$SD_CDD)
    qrilc_params_df$Upper_Cutoff_Linear <- 2^(qrilc_params_df$Upper_Cutoff_Log2)
    norm_method <- get_setting("normalizationMethod", "median")
    sample_medians <- apply(mat_log_imputed, 2, median, na.rm = TRUE)
    grand_median <- median(sample_medians, na.rm = TRUE)
    if (norm_method == "pqn") {
        mat_linear_imputed <- 2^mat_log_imputed
        presence_mask <- rowSums(!is.na(mat_linear_imputed) & mat_linear_imputed > 0)/ncol(mat_linear_imputed) >=
            0.5
        data_subset_pqn <- if (sum(presence_mask) < 10)
            mat_linear_imputed
        else mat_linear_imputed[presence_mask, , drop = FALSE]
        ref_spectrum <- apply(data_subset_pqn, 1, median, na.rm = TRUE)
        ref_spectrum[ref_spectrum == 0 | is.na(ref_spectrum)] <- 1
        quotients <- sweep(data_subset_pqn, 1, ref_spectrum, "/")
        pqn_factors <- apply(quotients, 2, median, na.rm = TRUE)
        pqn_factors[is.na(pqn_factors) | pqn_factors == 0] <- 1
        mat_norm_linear <- sweep(mat_linear_imputed, 2, pqn_factors, "/")
        mat_final_log <- log2(mat_norm_linear)
        norm_offsets <- log2(pqn_factors)
        scaling_factors <- 1/pqn_factors
    }
    else if (norm_method == "median") {
        norm_offsets <- sample_medians - grand_median
        scaling_factors <- 2^(-norm_offsets)
        mat_final_log <- sweep(mat_log_imputed, 2, norm_offsets, "-")
    }
    else {
        norm_offsets <- rep(0, ncol(mat_log_imputed))
        names(norm_offsets) <- colnames(mat_log_imputed)
        scaling_factors <- rep(1, ncol(mat_log_imputed))
        names(scaling_factors) <- colnames(mat_log_imputed)
        mat_final_log <- mat_log_imputed
    }
    mat_final_log[!is.finite(mat_final_log)] <- NA
    mat_final_linear <- 2^mat_final_log
    if (isTRUE(apply_outliers)) {
        audit_trace_data(list(mat_raw = mat_subset, mat_for_log = mat_for_log, mat_log = mat_log, mat_log_imputed = mat_log_imputed,
            qrilc_params = qrilc_params_df, norm_method = norm_method, sample_medians = sample_medians,
            grand_median = grand_median, norm_offsets = norm_offsets, scaling_factors = scaling_factors,
            mat_final_log = mat_final_log, mat_final_linear = mat_final_linear, timestamp = Sys.time()))
    }
    data_processed_final <- as.data.frame(mat_final_linear) %>% tibble::rownames_to_column("Lipid_Name")
    keep_cols <- useCols
    synthetic_ids <- character()
    all_cols <- names(df_info$data)[sapply(df_info$data, is.numeric)]
    all_cols <- setdiff(all_cols, "Lipid_Name")
    unchecked_cols <- setdiff(all_cols, useCols)
    if (length(unchecked_cols) > 0) {
        cols_to_parse <- c(useCols, unchecked_cols)
        parsed_meta <- tryCatch(allParsedMetadata(), error = function(e) NULL)
        if (!is.null(parsed_meta) && "FullName" %in% names(parsed_meta) && all(cols_to_parse %in% parsed_meta$FullName)) {
            full_meta <- parsed_meta %>% dplyr::filter(FullName %in% cols_to_parse)
        }
        else {
            full_meta <- bind_rows(lapply(cols_to_parse, parse_col_info_v2))
        }
        full_meta$Group <- if ("Group1" %in% names(full_meta) && "Group2" %in% names(full_meta)) {
            paste(full_meta$Group1, full_meta$Group2, sep = "_")
        }
        else if ("Group1" %in% names(full_meta)) {
            full_meta$Group1
        }
        else {
            "All"
        }
        group_defs <- full_meta %>% dplyr::group_by(Group) %>% dplyr::summarize(groupCols = list(FullName),
            .groups = "drop")
        for (i in seq_len(nrow(group_defs))) {
            theseCols <- group_defs$groupCols[[i]]
            c_checked <- intersect(theseCols, useCols)
            c_unchecked <- intersect(theseCols, unchecked_cols)
            for (uc in c_unchecked) {
                is_avg_outlier <- (uc %in% names(outlier_treatments) && outlier_treatments[[uc]] == "average")
                is_removed_outlier <- isTRUE(apply_outliers) && identical(outlier_treatments[[uc]], "remove")
                should_average <- !is_removed_outlier && (isTRUE(input$useAveragedSubstitution) || (isTRUE(apply_outliers) &&
                  is_avg_outlier))
                if (should_average && length(c_checked) >= 1) {
                  if (length(c_checked) == 1) {
                    subVals <- data_processed_final[[c_checked]]
                  }
                  else {
                    subVals <- rowMeans(data_processed_final[, c_checked, drop = FALSE], na.rm = TRUE)
                  }
                  data_processed_final[[uc]] <- subVals
                  keep_cols <- c(keep_cols, uc)
                  synthetic_ids <- c(synthetic_ids, uc)
                }
            }
        }
    }
    final_cols_ordered <- c("Lipid_Name", intersect(all_cols, keep_cols))
    data_processed_final <- data_processed_final %>% dplyr::select(dplyr::all_of(final_cols_ordered))
    if (isTRUE(apply_outliers)) {
        synthetic_ids <- intersect(final_cols_ordered, unique(synthetic_ids))
        synthetic_sample_ids(synthetic_ids)
        prep$audit$synthetic_samples <- synthetic_ids
    }
    if (isTRUE(get_setting("imputeRemainingNAtoZero", FALSE))) {
        na_count <- sum(is.na(data_processed_final))
        if (na_count > 0) {
            data_processed_final <- data_processed_final %>% dplyr::mutate(across(where(is.numeric),
                ~replace_na(., 0)))
        }
    }
    t_imp_end <- Sys.time()
    elapsed_sec <- as.numeric(difftime(t_imp_end, t_imp_start, units = "secs"))
    log_ingestion_event(stage = "6_IMPUTATION_NORMALIZATION_SUCCESS", status = "SUCCESS", message_text = sprintf("Imputation & Normalization finished successfully in %.3fs.",
        elapsed_sec), details = list(final_dimensions = sprintf("%d lipids x %d columns", nrow(data_processed_final),
        ncol(data_processed_final)), retained_samples = ncol(data_processed_final) - 1))
    if (isTRUE(get_setting("useImputation", TRUE)) && anyNA(data_processed_final))
        stop("QRILC left missing values. Review detection settings before continuing.")
    if (isTRUE(apply_outliers)) {
        preparation_audit(prep$audit)
        applied_preparation(preparation_settings_snapshot())
        applied_samples(names(data_processed_final)[-1])
        applied_selected_samples(isolate(input$selectedColumns) %||% useCols)
    }
    return(data_processed_final)
}

# Source: R/ux_preparation.R
ux_detection_preview <- function(df, samples, threshold = 0, drop_absent = TRUE, scope = "global", metadata = NULL) {
    stopifnot(is.numeric(threshold), length(threshold) == 1L, is.finite(threshold), threshold >= 0, threshold <=
        100)
    stopifnot(length(samples) > 0L)
    m <- as.matrix(df[, samples, drop = FALSE])
    observed <- is.finite(m) & m > 0
    keep <- rep(TRUE, nrow(df))
    if (drop_absent)
        keep <- rowSums(observed) > 0
    if (threshold > 0) {
        if (scope == "group") {
            if (is.null(metadata) || !all(c("FullName", "Group1", "Group2") %in% names(metadata)) ||
                !all(samples %in% metadata$FullName))
                stop("Group-based detection needs confirmed condition and tissue metadata for all selected samples.")
            md <- metadata[match(samples, metadata$FullName), , drop = FALSE]
            groups <- interaction(md$Group1, md$Group2, drop = TRUE)
            fractions <- vapply(split(seq_along(samples), groups), function(j) rowMeans(observed[, j,
                drop = FALSE]), numeric(nrow(df)))
            keep <- keep & apply(fractions, 1, max) >= threshold/100
        }
        else keep <- keep & rowMeans(observed) >= threshold/100
    }
    list(keep = keep, observed = observed, input = nrow(df), retained = sum(keep), excluded = sum(!keep),
        samples = length(samples), all_absent = sum(rowSums(observed) == 0), threshold = threshold, scope = scope,
        retained_missing = if (any(keep)) mean(!observed[keep, , drop = FALSE]) else NA_real_)
}

# Source: R/ux_preparation.R
ux_filter_detected <- function(df, samples, threshold = 0, drop_absent = TRUE, scope = "global", metadata = NULL) {
    preview <- ux_detection_preview(df, samples, threshold, drop_absent, scope, metadata)
    keep <- preview$keep
    observed <- preview$observed
    if (preview$retained < 2L)
        stop("Fewer than two lipids pass the detection filter. Lower the threshold or review the samples.")
    retained <- df[keep, , drop = FALSE]
    rownames(retained) <- NULL
    list(data = retained, audit = list(input = preview$input, retained = preview$retained, excluded = preview$excluded,
        samples = preview$samples, all_absent = preview$all_absent, threshold = threshold, scope = scope,
        raw_missing = mean(!observed), retained_missing = preview$retained_missing))
}

# Source: R/modules/utils_stats.R
compute_local_p_val <- function(base_vals, comp_vals, method = "limma", paired = FALSE) {
    if (isTRUE(paired)) {
        if (length(base_vals) != length(comp_vals))
            return(NA_real_)
        complete <- stats::complete.cases(base_vals, comp_vals)
        base_vals <- base_vals[complete]
        comp_vals <- comp_vals[complete]
    }
    else {
        base_vals <- base_vals[!is.na(base_vals)]
        comp_vals <- comp_vals[!is.na(comp_vals)]
    }
    if (length(base_vals) < 2 || length(comp_vals) < 2)
        return(NA_real_)
    v_base <- var(base_vals, na.rm = TRUE)
    v_comp <- var(comp_vals, na.rm = TRUE)
    if (is.na(v_base) || is.na(v_comp) || (v_base == 0 && v_comp == 0))
        return(NA_real_)
    method <- as.character(method)
    if (length(method) == 0)
        method <- "limma"
    method <- gsub("^auto_", "", method)
    if (method == "non_parametric") {
        p_val <- tryCatch(wilcox.test(base_vals, comp_vals, exact = FALSE, paired = paired)$p.value,
            error = function(e) NA_real_)
        return(p_val)
    }
    p_val <- tryCatch(t.test(base_vals, comp_vals, var.equal = TRUE, paired = paired)$p.value, error = function(e) NA_real_)
    return(p_val)
}

# Source: R/modules/utils_stats.R
perform_limma_analysis <- function(data_matrix, metadata, group_col, contrast_str, block_col = NULL) {
    if (is.null(data_matrix) || ncol(data_matrix) < 2)
        stop("Not enough data for DE analysis.")
    if (!group_col %in% names(metadata))
        stop(paste("Grouping column", group_col, "not found in metadata."))
    groups <- factor(metadata[[group_col]])
    if (nlevels(groups) < 2)
        stop("At least 2 groups are required for DE analysis.")
    design <- stats::model.matrix(~0 + groups)
    colnames(design) <- make.names(levels(groups))
    if (!limma::is.fullrank(design)) {
        warning("Warning: Limma design matrix is not full rank. Confounded groups detected: ", paste(limma::nonEstimable(design),
            collapse = ", "))
    }
    contrast_matrix <- tryCatch({
        limma::makeContrasts(contrasts = contrast_str, levels = design)
    }, error = function(e) {
        stop(paste("Invalid contrast:", contrast_str, "\nError:", e$message))
    })
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
            }
            else {
                fit <- limma::lmFit(data_matrix, design)
            }
        }
        else {
            fit <- limma::lmFit(data_matrix, design)
        }
    }
    else {
        fit <- limma::lmFit(data_matrix, design)
    }
    fit2 <- limma::contrasts.fit(fit, contrast_matrix)
    fallback_mode <- FALSE
    if (all(fit2$df.residual == 0)) {
        warning("Limma Analysis: No residual degrees of freedom. Using fallback P=1.")
        fallback_mode <- TRUE
    }
    eb_fit <- if (!fallback_mode) {
        tryCatch({
            limma::eBayes(fit2, robust = TRUE)
        }, error = function(e) {
            warning(paste("Limma eBayes failed:", e$message))
            return(NULL)
        })
    }
    else {
        NULL
    }
    if (is.null(eb_fit)) {
        logFC <- fit2$coefficients[, 1]
        top_table <- data.frame(Lipid_Name = rownames(fit2$coefficients), log2FC = logFC, p_raw = 1,
            p_adj_bh = 1, t_stat = 0)
        return(list(fit = fit2, results = top_table, design = design, contrast_matrix = contrast_matrix,
            consensus_correlation = consensus_corr))
    }
    top_table <- limma::topTable(eb_fit, coef = 1, number = Inf, sort.by = "none") %>% tibble::rownames_to_column("Lipid_Name") %>%
        dplyr::rename(log2FC = logFC, p_raw = P.Value, p_adj_bh = adj.P.Val, t_stat = t)
    return(list(fit = eb_fit, results = top_table, design = design, contrast_matrix = contrast_matrix,
        consensus_correlation = consensus_corr))
}

# Source: R/modules/utils_stats.R
perform_non_parametric_analysis <- function(data_matrix, metadata, group_col, contrast_str) {
    if (is.null(data_matrix) || ncol(data_matrix) < 2)
        stop("Not enough data for non-parametric analysis.")
    groups <- factor(metadata[[group_col]])
    unique_groups <- levels(groups)
    parts <- strsplit(contrast_str, "\\s*-\\s*")[[1]]
    comp_part <- if (length(parts) >= 1)
        parts[1]
    else ""
    ref_part <- if (length(parts) >= 2)
        parts[2]
    else ""
    comp_tokens <- strsplit(comp_part, "[^a-zA-Z0-9\\.]+")[[1]]
    ref_tokens <- strsplit(ref_part, "[^a-zA-Z0-9\\.]+")[[1]]
    comp_tokens <- comp_tokens[comp_tokens != "" & !grepl("^\\d+$", comp_tokens)]
    ref_tokens <- ref_tokens[ref_tokens != "" & !grepl("^\\d+$", ref_tokens)]
    comp_orig <- unique_groups[make.names(unique_groups) %in% comp_tokens]
    ref_orig <- unique_groups[make.names(unique_groups) %in% ref_tokens]
    num_lipids <- nrow(data_matrix)
    results <- data.frame(Lipid_Name = rownames(data_matrix), log2FC = NA_real_, p_raw = NA_real_, t_stat = NA_real_,
        stringsAsFactors = FALSE)
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
        }
        else {
            results$p_raw[i] <- 1
            results$t_stat[i] <- 0
        }
    }
    results$p_adj_bh <- p.adjust(results$p_raw, method = "BH")
    return(list(fit = NULL, results = results))
}

# Source: R/modules/utils_stats.R
construct_contrast_string <- function(ref_groups, comp_groups) {
    ref_clean <- make.names(ref_groups)
    comp_clean <- make.names(comp_groups)
    ref_part <- paste0("(", paste(ref_clean, collapse = "+"), ")/", length(ref_clean))
    comp_part <- paste0("(", paste(comp_clean, collapse = "+"), ")/", length(comp_clean))
    paste(comp_part, "-", ref_part)
}
