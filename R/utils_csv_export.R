# CSV downloads are opened directly by spreadsheet software. Keep this
# presentation-only transformation away from prepared matrices and session ZIPs.
spreadsheet_csv_escape <- function(values) {
  signed_number <- !is.na(values) & grepl("^[[:space:]]*[-+]([0-9]+(\\.[0-9]*)?|\\.[0-9]+)([eE][-+]?[0-9]+)?[[:space:]]*$", values)
  unsafe <- !is.na(values) & grepl("^[[:space:]]*[=+@-]", values) & !signed_number
  values[unsafe] <- paste0("'", values[unsafe])
  values
}

spreadsheet_csv_safe <- function(df, row.names = FALSE) {
  if (!is.data.frame(df)) df <- as.data.frame(df, check.names = FALSE)
  out <- df
  for (index in seq_along(out)) {
    values <- out[[index]]
    # write.csv() unlists AsIs/list cells and can emit bare formulas from them.
    # These exports have tabular atomic columns; reject nested data explicitly.
    if (is.list(values)) stop("Spreadsheet CSV export does not support list columns.", call. = FALSE)
    if (is.factor(values)) values <- as.character(values)
    if (is.character(values)) out[[index]] <- spreadsheet_csv_escape(values)
  }
  names(out) <- make.unique(spreadsheet_csv_escape(names(out)), sep = "_")
  if (isTRUE(row.names)) {
    row.names(out) <- make.unique(spreadsheet_csv_escape(row.names(out)), sep = "_")
  }
  out
}

write_spreadsheet_csv <- function(df, file, row.names = FALSE, ...) {
  safe <- spreadsheet_csv_safe(df, row.names = isTRUE(row.names))
  safe_rows <- if (is.character(row.names)) {
    if (length(row.names) != nrow(safe)) {
      stop("Explicit CSV row names must match the number of rows.", call. = FALSE)
    }
    make.unique(spreadsheet_csv_escape(row.names), sep = "_")
  } else if (isTRUE(row.names) || identical(row.names, FALSE)) {
    row.names
  } else {
    stop("CSV row.names must be TRUE, FALSE, or a character vector.", call. = FALSE)
  }
  utils::write.csv(safe, file, row.names = safe_rows, ...)
}
