# R/utils_data.R
# Data Utilities.

# Required libraries (assumed loaded in global.R or per project standards, 
# but calling specific package functions for safety)

#' Load a single Excel file and handle duplicates
#' @param file_path Path to the excel file
#' @param file_name Name of the file for reporting
load_one_file <- function(file_path, file_name) {
  req(file_path)
  tryCatch({
    sheets <- lapply(readxl::excel_sheets(file_path), function(s) readxl::read_excel(file_path, s, na=c("N/A","NA","")))
    combined <- dplyr::bind_rows(sheets)
    validate(need(ncol(combined) > 1, "File or sheet seems empty."))
    colnames(combined)[1] <- "Lipid_Name"
    if (any(duplicated(combined$Lipid_Name))) {
      showNotification(paste("Warning:", file_name, "has duplicates. Averaging values."), type="warning")
      combined <- combined %>% 
        dplyr::group_by(Lipid_Name) %>% 
        dplyr::summarise(dplyr::across(where(is.numeric), ~mean(., na.rm=TRUE)), .groups='drop')
    }
    return(combined)
  }, error = function(e) {
    showNotification(paste("Error reading", file_name, ":", e$message), type="error")
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

#' Generate a safe RColorBrewer palette
#' @param n Number of colors needed
#' @param name Palette name (e.g., "Set1")
safe_brewer_pal <- function(n, name) { 
  colorRampPalette(RColorBrewer::brewer.pal(max(3, n), name))(n) 
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
