# R/utils_data.R
# Data Utilities.

# Required libraries (assumed loaded in global.R or per project standards, 
# but calling specific package functions for safety)

#' Load a single Excel file and handle duplicates
#' @param file_path Path to the excel file
#' @param file_name Name of the file for reporting
load_one_file <- function(file_path, file_name) {
  req(file_path)
  t0 <- Sys.time()
  if (exists("log_ingestion_event")) {
    log_ingestion_event("2a_READ_EXCEL_START", "START",
      sprintf("Reading Excel file '%s'...", file_name),
      list(path = file_path, file_size_mb = round(file.size(file_path) / (1024^2), 2))
    )
  }
  tryCatch({
    sheet_names <- readxl::excel_sheets(file_path)
    if (exists("log_ingestion_event")) {
      log_ingestion_event("2a_SHEETS_DETECTED", "INFO",
        sprintf("Found %d sheet(s) in '%s': %s", length(sheet_names), file_name, paste(sheet_names, collapse = ", ")),
        list(sheet_count = length(sheet_names), sheets = sheet_names)
      )
    }
    sheets <- lapply(sheet_names, function(s) readxl::read_excel(file_path, s, na=c("N/A","NA","")))
    combined <- dplyr::bind_rows(sheets)
    validate(need(ncol(combined) > 1, "File or sheet seems empty."))
    
    orig_first_col <- colnames(combined)[1]
    colnames(combined)[1] <- "Lipid_Name"
    
    dup_count <- sum(duplicated(combined$Lipid_Name))
    if (dup_count > 0) {
      if (exists("log_ingestion_event")) {
        log_ingestion_event("2a_DUPLICATES_DETECTED", "WARNING",
          sprintf("File '%s' contains %d duplicated lipid names. Averaging numeric values across duplicates...", file_name, dup_count),
          list(duplicates_count = dup_count)
        )
      }
      showNotification(paste("Warning:", file_name, "has duplicates. Averaging values."), type="warning")
      combined <- combined %>% 
        dplyr::group_by(Lipid_Name) %>% 
        dplyr::summarise(dplyr::across(where(is.numeric), ~mean(., na.rm=TRUE)), .groups='drop')
    }
    
    elapsed <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
    sample_cols <- setdiff(names(combined), "Lipid_Name")
    if (exists("log_ingestion_event")) {
      log_ingestion_event("2a_READ_EXCEL_SUCCESS", "SUCCESS",
        sprintf("Successfully read '%s' in %.3f sec", file_name, elapsed),
        list(
          lipid_count = nrow(combined),
          sample_column_count = length(sample_cols),
          original_id_column = orig_first_col,
          first_sample_cols = head(sample_cols, 5)
        )
      )
    }
    return(combined)
  }, error = function(e) {
    if (exists("log_ingestion_event")) {
      log_ingestion_event("2a_READ_EXCEL_ERROR", "ERROR",
        sprintf("Failed to read Excel file '%s': %s", file_name, e$message),
        list(error = e$message)
      )
    }
    showNotification(paste("Error reading", file_name, ":", e$message), type="error", duration = NULL)
    return(NULL)
  })
}

#' Impute zeros for specific columns in a dataframe
#' @param df Dataframe to modify
#' @param cols_to_check Columns to check for all-NA rows
impute_zeros_per_file <- function(df, cols_to_check) {
  if (is.null(cols_to_check)) return(df)
  cols_present <- intersect(names(df), cols_to_check)
  if (length(cols_present) > 0) {
    rows_all_na <- rowSums(is.na(df[, cols_present, drop = FALSE])) == length(cols_present)
    df[rows_all_na, cols_present] <- 0
  }
  return(df)
}

safe_brewer_pal <- function(n, name) {
  max_colors <- 8 # Default fallback
  if (name %in% rownames(RColorBrewer::brewer.pal.info)) {
    max_colors <- RColorBrewer::brewer.pal.info[name, "maxcolors"]
  }
  
  if (n <= max_colors) {
    colorRampPalette(RColorBrewer::brewer.pal(max(3, n), name))(n)
  } else {
    colorRampPalette(RColorBrewer::brewer.pal(max_colors, name))(n)
  }
}

#' Create a shape map for a set of groups
#' @param groups Vector of group names
#' @param shape_choices Named vector of shape choices
make_shape_map <- function(groups, shape_choices) {
  unique_groups <- sort(unique(groups)) %>% na.omit()
  if (length(unique_groups) == 0) return(character(0))
  shapes <- rep(unname(shape_choices), length.out = length(unique_groups))
  names(shapes) <- unique_groups
  shapes
}

#' Robust Multi-Tier Acyl Chain Extractor
#'
#' Extracts fatty acyl chain tokens (C:DB) from parsed columns or raw lipid names,
#' guaranteeing 100% detection coverage across complex real-world lipid notations
#' (sphingoid bases, plasmalogens, ethers, TAG explicit FAs, single chain LPC/LPA/ACar, adducts).
#'
#' @param lipid_name Character string of raw lipid species name
#' @param nCchain1 Numeric carbons for sn-1 (can be NA)
#' @param DBchain1 Numeric double bonds for sn-1 (can be NA)
#' @param nCchain2 Numeric carbons for sn-2 (can be NA)
#' @param DBchain2 Numeric double bonds for sn-2 (can be NA)
#' @param pos_mode Position mode: "both", "sn1", "sn2", or "side_by_side"
#' @param cls_name Optional target class name for fallback labeling
#' @return A data.frame with columns: AcylChain, Position, Weight
extract_robust_acyl_chains <- function(lipid_name, nCchain1 = NA, DBchain1 = NA, nCchain2 = NA, DBchain2 = NA, pos_mode = "both", cls_name = "Lipid") {
  records <- list()
  
  # Guard against multi-chain precursor or fragment sums (> 34 carbons)
  ch1_tok <- if (!is.na(nCchain1) && !is.na(DBchain1) && nCchain1 > 0 && nCchain1 <= 34) paste0(nCchain1, ":", DBchain1) else NA_character_
  ch2_tok <- if (!is.na(nCchain2) && !is.na(DBchain2) && nCchain2 > 0 && nCchain2 <= 34) paste0(nCchain2, ":", DBchain2) else NA_character_
  
  # Fallback to regex extraction from raw lipid_name if columns are NA or contained sum compositions
  if (is.na(ch1_tok) && is.na(ch2_tok)) {
    # 1. Clean adducts & trailing annotations (+NH4, +AcO, -H, -2H, +H, +HCOO, +Na, ' b', etc.)
    clean <- gsub("(\\+|\\-)\\s*[A-Za-z0-9\\.]+$", "", lipid_name, perl = TRUE)
    clean <- gsub("\\s+[a-z]$", "", clean, perl = TRUE)
    clean <- trimws(clean)
    
    # 2. Extract block within parentheses or work on clean string
    block_match <- stringr::str_extract(clean, "\\((.*?)\\)")
    block <- if (!is.na(block_match)) gsub("^\\(|\\)$", "", block_match) else clean
    
    # 3. Tokenize by slash or underscore
    tokens <- unlist(strsplit(block, "[/_]"))
    
    # Priority A: Check for explicit FA prefix (e.g. TAG(40:0_FA14:0)+NH4)
    fa_match <- grep("^FA", tokens, value = TRUE)
    if (length(fa_match) > 0) {
      m <- stringr::str_match(fa_match[1], "FA(\\d{1,2}):(\\d{1,2})")
      if (!is.na(m[1, 1])) {
        c_n <- as.integer(m[1, 2]); db_n <- as.integer(m[1, 3])
        if (c_n <= 34) ch1_tok <- paste0(c_n, ":", db_n)
      }
    } else {
      # Priority B: Extract valid acyl chains (only tokens with <= 34 carbons)
      found_chains <- character(0)
      for (tok in tokens) {
        m <- stringr::str_match(tok, "(?:d|t|m|O-|P-|FA)?(\\d{1,2}):(\\d{1,2})")
        if (!is.na(m[1, 1])) {
          c_n <- as.integer(m[1, 2]); db_n <- as.integer(m[1, 3])
          if (c_n <= 34) {
            found_chains <- c(found_chains, paste0(c_n, ":", db_n))
          }
        }
      }
      
      if (length(found_chains) == 0) {
        # Fallback scan anywhere in clean string
        m_all <- stringr::str_match_all(clean, "(\\d{1,2}):(\\d{1,2})")[[1]]
        if (nrow(m_all) > 0) {
          for (r in seq_len(nrow(m_all))) {
            c_n <- as.integer(m_all[r, 2])
            if (c_n <= 34) found_chains <- c(found_chains, paste0(c_n, ":", m_all[r, 3]))
          }
        }
      }
      
      if (length(found_chains) >= 1) ch1_tok <- found_chains[1]
      if (length(found_chains) >= 2) ch2_tok <- found_chains[2]
    }
  }
  
  # Build position records
  if (pos_mode == "sn1") {
    if (!is.na(ch1_tok)) {
      records[[1]] <- data.frame(AcylChain = ch1_tok, Position = "sn-1", Weight = 1, stringsAsFactors = FALSE)
    }
  } else if (pos_mode == "sn2") {
    tok_use <- if (!is.na(ch2_tok)) ch2_tok else ch1_tok
    if (!is.na(tok_use)) {
      records[[1]] <- data.frame(AcylChain = tok_use, Position = "sn-2", Weight = 1, stringsAsFactors = FALSE)
    }
  } else if (pos_mode == "side_by_side") {
    if (!is.na(ch1_tok)) records[[length(records) + 1]] <- data.frame(AcylChain = ch1_tok, Position = "sn-1", Weight = 1, stringsAsFactors = FALSE)
    if (!is.na(ch2_tok)) records[[length(records) + 1]] <- data.frame(AcylChain = ch2_tok, Position = "sn-2", Weight = 1, stringsAsFactors = FALSE)
  } else {
    # Both Merged
    valid_toks <- c(na.omit(c(ch1_tok, ch2_tok)))
    if (length(valid_toks) > 0) {
      w <- 1 / length(valid_toks)
      for (v in valid_toks) {
        records[[length(records) + 1]] <- data.frame(AcylChain = v, Position = "Merged", Weight = w, stringsAsFactors = FALSE)
      }
    }
  }
  
  # Spotted / Unassigned Fallback (Guarantees 0% dropped species)
  if (length(records) == 0) {
    fallback_label <- paste0("Spotted/Unassigned (", cls_name, ")")
    records[[1]] <- data.frame(AcylChain = fallback_label, Position = if (pos_mode == "side_by_side") "sn-1" else "Merged", Weight = 1, stringsAsFactors = FALSE)
  }
  
  return(dplyr::bind_rows(records))
}

#' Generate Context-Aware Descriptive Label for Metadata Group Columns
#'
#' Converts internal schema column names ("Group1", "Group2", "Group1_Group2", "TimePoint")
#' into user-friendly descriptive labels enriched with actual experimental levels (e.g. "Group 1 (WT, KO)").
#'
#' @param col_name Internal metadata column name
#' @param meta Data frame of sample metadata
#' @param max_show Maximum number of unique levels to list before abbreviating (default: 4)
#' @param ellipsis If TRUE, appends "..." when truncated; if FALSE, appends "+N more"
#' @return Formatted character string
get_metadata_group_label <- function(col_name, meta, max_show = 4, ellipsis = FALSE) {
  if (is.null(meta) || !is.data.frame(meta)) return(col_name)
  
  format_levels <- function(vec, max_show = 4, ellipsis = FALSE) {
    clean_vals <- unique(as.character(vec))
    clean_vals <- clean_vals[!is.na(clean_vals) & clean_vals != "" & clean_vals != "Unspecified"]
    if (length(clean_vals) == 0) return("")
    if (length(clean_vals) <= max_show) {
      paste(clean_vals, collapse = ", ")
    } else {
      if (ellipsis) {
        paste0(paste(clean_vals[1:max_show], collapse = ", "), "...")
      } else {
        paste0(paste(clean_vals[1:max_show], collapse = ", "), ", +", length(clean_vals) - max_show, " more")
      }
    }
  }
  
  if (col_name == "Group1") {
    g1_str <- if ("Group1" %in% names(meta)) format_levels(meta$Group1, max_show = max_show, ellipsis = ellipsis) else ""
    if (nzchar(g1_str)) paste0("Group 1 (", g1_str, ")") else "Group 1"
  } else if (col_name == "Group2") {
    g2_str <- if ("Group2" %in% names(meta)) format_levels(meta$Group2, max_show = max_show, ellipsis = ellipsis) else ""
    if (nzchar(g2_str)) paste0("Group 2 (", g2_str, ")") else "Group 2"
  } else if (col_name %in% c("Group1_Group2", "Group1 & Group2")) {
    g1_comp <- if ("Group1" %in% names(meta)) format_levels(meta$Group1, max_show = 2, ellipsis = TRUE) else ""
    g2_comp <- if ("Group2" %in% names(meta)) format_levels(meta$Group2, max_show = 2, ellipsis = TRUE) else ""
    if (nzchar(g1_comp) && nzchar(g2_comp)) {
      paste0("Group 1 & Group 2 (", g1_comp, " & ", g2_comp, ")")
    } else {
      "Group 1 & Group 2 (Composite)"
    }
  } else if (col_name == "TimePoint") {
    tp_str <- if ("TimePoint" %in% names(meta)) format_levels(meta$TimePoint, max_show = max_show, ellipsis = ellipsis) else ""
    if (nzchar(tp_str)) paste0("Time Point (", tp_str, ")") else "Time Point"
  } else if (col_name %in% c("PatientNumber", "Patient")) {
    "Patient / Subject Number"
  } else if (col_name %in% c("FullName", "Sample")) {
    "Patient / Sample Replicate"
  } else if (col_name == "Replicate") {
    "Sample Replicate"
  } else if (col_name == "None") {
    "None"
  } else {
    col_name
  }
}

#' Generate Named Choice Vector for Shiny Selectors
#'
#' @param choices Vector of internal column values
#' @param meta Data frame of sample metadata
#' @param max_show Maximum levels to show
#' @param ellipsis Ellipsis formatting flag
#' @return Named character vector where names are UI labels and values are internal schema keys
get_metadata_group_named_choices <- function(choices, meta, max_show = 4, ellipsis = FALSE) {
  if (is.null(choices) || length(choices) == 0) return(choices)
  raw_vals <- unname(as.character(choices))
  labels <- sapply(raw_vals, function(c) get_metadata_group_label(c, meta, max_show = max_show, ellipsis = ellipsis))
  setNames(raw_vals, labels)
}

#' Determine Default Primary Grouping Metadata Column(s)
#'
#' Evaluates candidate grouping columns (e.g. Group1, Group2) against metadata.
#' If one group column has only 1 unique component (e.g. "Neu") and another group
#' column has multiple components (e.g. "Femur", "Lumbar", "Sternum", "Skull"),
#' the default selected feature automatically routes to the multi-level group.
#' If both groups have only 1 component (the exception), both columns are selected
#' (e.g. c("Group1", "Group2")) to avoid single-level 0-degree-of-freedom errors.
#'
#' @param meta Data frame containing sample metadata
#' @param valid_cols Character vector of candidate grouping columns
#' @return Character vector of default selected column name(s)
determine_default_grouping_metadata <- function(meta, valid_cols) {
  if (is.null(valid_cols) || length(valid_cols) == 0) return(character(0))
  if (is.null(meta) || nrow(meta) == 0) return(valid_cols[1])
  
  # Calculate number of non-trivial unique levels per column
  lev_counts <- sapply(valid_cols, function(col) {
    if (!col %in% names(meta)) return(0)
    vals <- as.character(meta[[col]])
    vals <- vals[!is.na(vals) & nzchar(trimws(vals)) & vals != "Unspecified"]
    length(unique(vals))
  })
  
  multi_cols <- valid_cols[lev_counts > 1]
  
  if (length(multi_cols) > 0) {
    # If any columns have >1 levels, pick the first multi-level column
    return(multi_cols[1])
  } else {
    # Exception: all available columns have <= 1 level.
    # Select both (or all available up to 2) to avoid single-level critical errors.
    return(valid_cols[1:min(2, length(valid_cols))])
  }
}

#' Determine Active Grouping Selection for Selectize Inputs
#'
#' Ensures that user selections are preserved when valid, but dynamically redirects
#' to the informative multi-level group if the current selection is empty or points
#' exclusively to a degenerate single-component group while an informative multi-level group exists.
#'
#' @param meta Data frame containing sample metadata
#' @param valid_cols Character vector of candidate grouping columns
#' @param curr_sel Currently selected column(s) from input$groupingMetadata
#' @return Character vector of column name(s) to select in updateSelectizeInput
determine_active_grouping_selection <- function(meta, valid_cols, curr_sel = NULL) {
  default_sel <- determine_default_grouping_metadata(meta, valid_cols)
  
  if (is.null(curr_sel) || length(curr_sel) == 0) {
    return(default_sel)
  }
  
  valid_curr <- intersect(curr_sel, valid_cols)
  if (length(valid_curr) == 0) {
    return(default_sel)
  }
  
  if (is.null(meta) || nrow(meta) == 0) {
    return(valid_curr)
  }
  
  # Check level counts for all valid cols
  lev_counts <- sapply(valid_cols, function(col) {
    if (!col %in% names(meta)) return(0)
    vals <- as.character(meta[[col]])
    vals <- vals[!is.na(vals) & nzchar(trimws(vals)) & vals != "Unspecified"]
    length(unique(vals))
  })
  
  has_multi <- any(lev_counts > 1)
  curr_counts <- lev_counts[valid_curr]
  
  # If there is an informative multi-level column available, but curr_sel points ONLY
  # to single-level column(s) (e.g. initial UI default of Group1 when Group2 has 4 levels)
  if (has_multi && all(curr_counts <= 1)) {
    return(default_sel)
  }
  
  # In exception case where all groups have <= 1 level, ensure at least 2 are selected if available
  if (!has_multi && length(valid_curr) < 2 && length(valid_cols) >= 2) {
    return(default_sel)
  }
  
  return(valid_curr)
}


