# Import only explicit sample metadata. The abundance matrix's sample names are
# identifiers, never values to be inferred or rewritten from this file.
sample_metadata_active_ids <- function(raw_data) {
  # Session onFlushed callbacks are not reactive consumers. Isolate the read
  # when validating a restored ZIP's metadata against its restored matrix.
  current <- shiny::isolate(raw_data())
  if (is.null(current) || is.null(current$data)) stop("The abundance matrix is not ready for metadata restoration.")
  setdiff(names(current$data), "Lipid_Name")
}

read_sample_metadata_file <- function(path, filename) {
  ext <- tolower(tools::file_ext(filename))
  if (!ext %in% c("csv", "xlsx")) stop("Choose a CSV or XLSX metadata file.")
  if (!file.exists(path) || file.info(path)$size > 20 * 1024 * 1024) {
    stop("The metadata file is missing or exceeds the 20 MB limit.")
  }
  out <- if (ext == "csv") {
    utils::read.csv(path, colClasses = "character", check.names = FALSE,
                    stringsAsFactors = FALSE, na.strings = character(),
                    fileEncoding = "UTF-8-BOM")
  } else {
    if (!requireNamespace("readxl", quietly = TRUE)) stop("XLSX import requires readxl.")
    as.data.frame(readxl::read_excel(path, col_types = "text", .name_repair = "minimal"),
                  check.names = FALSE, stringsAsFactors = FALSE)
  }
  if (!nrow(out) || !ncol(out)) stop("The metadata file has no data rows or columns.")
  if (nrow(out) > 100000L || ncol(out) > 200L) stop("The metadata file is too large to preview safely.")
  if (anyNA(names(out)) || any(!nzchar(trimws(names(out)))) || anyDuplicated(names(out))) {
    stop("Metadata column names must be nonempty and unique.")
  }
  out[] <- lapply(out, as.character)
  out
}

preview_sample_metadata_match <- function(metadata, id_column, sample_ids) {
  if (!is.data.frame(metadata) || !id_column %in% names(metadata)) {
    stop("Choose the metadata column containing exact sample identifiers.")
  }
  sample_ids <- as.character(sample_ids)
  if (!length(sample_ids) || anyNA(sample_ids) || any(!nzchar(trimws(sample_ids))) || anyDuplicated(sample_ids)) {
    stop("Matrix sample identifiers must be nonempty and unique.")
  }
  ids <- as.character(metadata[[id_column]])
  blank_rows <- which(is.na(ids) | !nzchar(trimws(ids)))
  duplicates <- unique(ids[duplicated(ids) & !is.na(ids) & nzchar(trimws(ids))])
  missing_samples <- sample_ids[!sample_ids %in% ids]
  unused_rows <- which(!is.na(ids) & nzchar(trimws(ids)) & !ids %in% sample_ids)
  matched_rows <- match(sample_ids, ids)
  fields <- setdiff(names(metadata), id_column)
  missing_values <- if (length(fields)) {
    sum(vapply(metadata[matched_rows[!is.na(matched_rows)], fields, drop = FALSE],
               function(x) sum(is.na(x) | !nzchar(trimws(x))), integer(1)))
  } else 0L
  list(
    valid = !length(blank_rows) && !length(duplicates) && !length(missing_samples),
    sample_count = length(sample_ids), matched_count = sum(!is.na(matched_rows)),
    blank_rows = blank_rows, duplicate_ids = duplicates,
    missing_samples = missing_samples, unused_ids = ids[unused_rows],
    missing_values = missing_values,
    matched = if (all(!is.na(matched_rows))) {
      result <- metadata[matched_rows, fields, drop = FALSE]
      data.frame(FullName = sample_ids, result, check.names = FALSE, stringsAsFactors = FALSE)
    } else NULL
  )
}

merge_confirmed_sample_metadata <- function(canonical, imported, mappings = character()) {
  if (is.null(imported)) return(canonical)
  if (!is.data.frame(canonical) || !"FullName" %in% names(canonical) ||
      anyDuplicated(canonical$FullName)) stop("Canonical sample metadata is invalid.")
  if (!is.data.frame(imported) || !"FullName" %in% names(imported) ||
      anyDuplicated(imported$FullName)) stop("Imported sample metadata is invalid.")
  if (!identical(as.character(canonical$FullName), as.character(imported$FullName))) {
    stop("Imported metadata no longer matches the active matrix sample order. Reconfirm the file.")
  }
  core_fields <- c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint")
  if (length(mappings)) {
    if (is.null(names(mappings)) || anyDuplicated(names(mappings)) ||
        !all(names(mappings) %in% core_fields) ||
        !all(unname(mappings) %in% names(imported)) ||
        anyDuplicated(unname(mappings))) {
      stop("Design field mappings are invalid or ambiguous.")
    }
    for (target in names(mappings)) {
      values <- imported[[mappings[[target]]]]
      if (anyNA(values) || any(!nzchar(trimws(values)))) {
        stop(sprintf("Mapped design field %s contains missing values.", target))
      }
      canonical[[target]] <- values
    }
    if ("TimePoint_Group1" %in% names(canonical) &&
        any(c("Group1", "TimePoint") %in% names(mappings))) {
      canonical$TimePoint_Group1 <- canonical$Group1
    }
  }
  extra <- imported[setdiff(names(imported), c("FullName", unname(mappings)))]
  collisions <- names(extra) %in% names(canonical)
  names(extra)[collisions] <- paste0("Imported: ", names(extra)[collisions])
  names(extra) <- make.unique(names(extra), sep = "_")
  cbind(canonical, extra)
}

# Spreadsheet programs may evaluate formula-looking strings when opening CSV.
# Escape only the exported copy; the in-app metadata remains byte-for-byte intact.
sample_metadata_csv_safe <- function(df) {
  escape_formula <- function(values) {
    unsafe <- !is.na(values) & grepl("^[[:space:]]*[=+@-]", values)
    values[unsafe] <- paste0("'", values[unsafe])
    values
  }
  out <- df
  for (index in seq_along(out)) {
    values <- out[[index]]
    if (is.list(values)) stop("Spreadsheet CSV export does not support list columns.", call. = FALSE)
    if (is.factor(values)) values <- as.character(values)
    if (!is.character(values)) next
    out[[index]] <- escape_formula(values)
  }
  # Escaping can make two distinct source names equal (e.g. =x and '=x).
  names(out) <- make.unique(escape_formula(names(out)), sep = "_")
  out
}
