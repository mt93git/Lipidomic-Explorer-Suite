# Team upload formats: .txt/.tsv abundance and metadata tables.
#
# The shared data module (R/modules/1_shared_data_module.R) reads abundance files as .csv
# (read.csv) or Excel. Team adds formats by converting them, in Team code, into a file that
# reader already accepts, before the file reaches it. A conversion is a re-encoding, never a
# transformation: every cell is read as text and written back unchanged, so the shared reader
# parses the converted file exactly as it would parse the same table saved as .csv.
#
# Browser side: www/team/js/upload_formats.js intercepts the abundance "Choose files" input,
# sends only the files that need converting to the hidden Team input below, and hands the
# converted files back to the same input, so the shared module sees an ordinary .csv upload.

team_upload_delimited_ext <- c("txt", "tsv")
team_upload_delimiter_names <- c("\t" = "tab", "," = "comma", ";" = "semicolon")

team_upload_max_text_bytes <- 50 * 1024^2

# Field count of every record of the WHOLE file under one delimiter, with the quoting rules of
# team_upload_read_cells() (same scan engine: double quotes, doubled quotes inside quoted fields,
# no comment character, blank lines skipped). count.fields() reports a record that spans several
# physical lines (a quoted line break) as NA on its first lines and the count on its last one.
# Returns the record counts, or NULL when the file cannot be split into complete records
# (an unterminated quote at the end of the file).
team_upload_record_fields <- function(path, delimiter) {
  fields <- tryCatch(suppressWarnings(utils::count.fields(path, sep = delimiter, quote = "\"", comment.char = "",
                                                          blank.lines.skip = TRUE)),
                     error = function(e) NULL)
  if (is.null(fields) || !length(fields) || is.na(fields[length(fields)])) return(NULL)
  fields[!is.na(fields)]
}

# A delimiter is valid for a file only when the header has at least two fields and EVERY record
# of the file has exactly the header's number of fields. No tolerance, no prefix: one row with
# a different count invalidates the delimiter.
team_upload_delimiter_valid <- function(path, delimiter) {
  fields <- team_upload_record_fields(path, delimiter)
  !is.null(fields) && fields[1] >= 2L && all(fields == fields[1])
}

# Candidate delimiters that are valid for the file (strict rule above).
# - .tsv is tab-separated by definition: tab is the only candidate.
# - .txt: tab, comma and semicolon are all tried, with no preference. Tie rule: tab is used when
#   comma and semicolon are invalid (e.g. one field per row because the file has no commas); if
#   another candidate is also valid (>= 2 fields on every row), the file is ambiguous and refused.
team_upload_valid_delimiters <- function(path, ext = "txt") {
  candidates <- if (identical(ext, "tsv")) "\t" else names(team_upload_delimiter_names)
  unlist(Filter(function(d) team_upload_delimiter_valid(path, d), candidates), use.names = FALSE)
}

# Reads a delimited table as a grid of text cells, with the quoting rules of read.csv
# (double quotes, doubled quotes inside quoted fields, no comment character, blank lines skipped).
team_upload_read_cells <- function(path, delimiter) {
  cells <- utils::read.table(path, sep = delimiter, quote = "\"", header = FALSE,
                             colClasses = "character", na.strings = character(),
                             comment.char = "", fill = TRUE, blank.lines.skip = TRUE,
                             strip.white = FALSE, check.names = FALSE, allowEscapes = FALSE,
                             stringsAsFactors = FALSE, encoding = "unknown")
  cells[] <- lapply(cells, function(x) { x[is.na(x)] <- ""; x })
  # fill = TRUE would pad short rows: callers accept the grid only when every record has the
  # header's field count (team_upload_delimiter_valid) and the grid has that shape.
  records <- team_upload_record_fields(path, delimiter)
  header_fields <- if (length(records)) records[1] else NA_integer_
  list(cells = unname(as.list(cells)), header_fields = header_fields, n_records = length(records))
}

team_upload_csv_field <- function(x) {
  needs <- grepl("[\",\r\n]", x, useBytes = TRUE)
  x[needs] <- paste0("\"", gsub("\"", "\"\"", x[needs], fixed = TRUE, useBytes = TRUE), "\"")
  x
}

# Writes a grid of text cells as CSV. Fields are quoted only when they contain a comma, a
# double quote or a line break, so every value keeps its original characters.
team_upload_write_cells_csv <- function(columns, path, header_fields = NA_integer_) {
  columns <- lapply(columns, team_upload_csv_field)
  rows <- do.call(paste, c(columns, sep = ","))
  if (length(rows) && is.finite(header_fields) && header_fields < length(columns)) {
    rows[1] <- paste(vapply(columns[seq_len(header_fields)], `[`, character(1), 1L), collapse = ",")
  }
  con <- file(path, open = "wb"); on.exit(close(con))
  writeLines(rows, con, sep = "\n", useBytes = TRUE)
  invisible(path)
}

# Abundance tables: every non-empty data cell (data rows, every column but the first) must read
# as a number, as the shared module's as.numeric will read it. "NA" is read.csv's own missing
# marker and is allowed. Anything else (decimal commas such as 1,5 or 1.234,56, "N/A", "<LOD")
# would silently become a missing value, so the file is refused with the first such cell.
team_upload_first_non_number <- function(columns) {
  if (length(columns) < 2L) return(NULL)
  for (j in seq_along(columns)[-1]) {
    x <- columns[[j]][-1]
    bad <- which(nzchar(trimws(x)) & x != "NA" & is.na(suppressWarnings(as.numeric(x))))
    if (length(bad)) return(list(row = bad[1] + 1L, column = columns[[j]][1], value = x[bad[1]],
                                 count = length(bad), n_columns = sum(vapply(columns[-1], function(y) {
                                   y <- y[-1]; any(nzchar(trimws(y)) & y != "NA" & is.na(suppressWarnings(as.numeric(y))))
                                 }, logical(1)))))
  }
  NULL
}
team_upload_check_numbers <- function(columns, filename) {
  bad <- team_upload_first_non_number(columns)
  if (is.null(bad)) return(invisible(TRUE))
  comma <- grepl(",", bad$value, fixed = TRUE)
  stop(sprintf(
    "%s: the value \"%s\" in row %d, column \"%s\" is not a number%s. Lipidomic Explorer would read it as a missing value, so the file was not loaded. %s",
    filename, bad$value, bad$row, bad$column,
    if (bad$count > 1L || bad$n_columns > 1L) sprintf(" (%d such values in that column, %d column%s affected)", bad$count, bad$n_columns, if (bad$n_columns == 1L) "" else "s") else "",
    if (comma) "It looks like a decimal comma: export the file again with a decimal point." else "Leave missing values empty or write NA."))
}

team_upload_csv_name <- function(filename) paste0(filename, ".csv")

team_upload_has_nul <- function(path) {
  con <- file(path, open = "rb"); on.exit(close(con))
  repeat {
    chunk <- readBin(con, "raw", 4L * 1024^2)
    if (!length(chunk)) return(FALSE)
    if (any(chunk == as.raw(0))) return(TRUE)
  }
}

# Picks the delimiter of a .txt/.tsv and parses it, or refuses. Exactly one delimiter must be
# valid (team_upload_valid_delimiters); zero or several valid readings refuse the file, and so
# does a single-column file (no abundance or metadata table has only one column). Team never
# guesses. Abundance files (numbers = TRUE) are then refused if a data cell is not a number.
team_upload_choose_delimiter <- function(path, filename, numbers) {
  ext <- tolower(tools::file_ext(filename))
  valid <- team_upload_valid_delimiters(path, ext)
  if (length(valid) != 1L) {
    stop(sprintf("%s: couldn't determine the column separator. Every row must have the same number (at least two) of %s columns. Save it as .csv and upload again.",
                 filename, if (identical(ext, "tsv")) "tab-separated" else "tab-, comma- or semicolon-separated"), call. = FALSE)
  }
  parsed <- team_upload_read_cells(path, valid)
  # Defensive: the grid must have exactly the validated shape.
  if (!identical(parsed$header_fields, length(parsed$cells)) ||
      !identical(parsed$n_records, length(parsed$cells[[1]]))) {
    stop(sprintf("%s: couldn't determine the column separator. Save it as .csv and upload again.", filename), call. = FALSE)
  }
  if (numbers) team_upload_check_numbers(parsed$cells, filename)
  c(parsed, list(delimiter = valid))
}

# Converts one .txt/.tsv table into a .csv the shared reader accepts. numbers = TRUE (abundance)
# refuses data cells that would not read as numbers. Returns the delimiter and the grid of cells.
team_upload_delimited_to_csv <- function(path, filename, out, numbers = FALSE) {
  if (!file.exists(path) || file.info(path)$size > team_upload_max_text_bytes) {
    stop(sprintf("%s is larger than %d MB. Save it as .csv or .xlsx and upload that file instead.", filename, team_upload_max_text_bytes / 1024^2))
  }
  # NUL bytes: count.fields() and read.table() disagree on them (read.table cuts the cell at the
  # first NUL), so a file holding any is refused before separator detection.
  if (team_upload_has_nul(path)) {
    stop(sprintf("%s contains NUL bytes (it may be a binary or UTF-16 file). Save it as UTF-8 .csv and upload again.", filename), call. = FALSE)
  }
  chosen <- team_upload_choose_delimiter(path, filename, numbers)
  team_upload_write_cells_csv(chosen$cells, out, chosen$header_fields)
  list(path = out, delimiter = team_upload_delimiter_names[[chosen$delimiter]], columns = chosen$cells)
}

# Sample metadata (Team module): .txt/.tsv are converted to .csv and then read by the
# existing metadata reader, unchanged.
team_read_sample_metadata_file <- function(path, filename) {
  ext <- tolower(tools::file_ext(filename))
  if (ext %in% team_upload_delimited_ext) {
    if (!file.exists(path) || file.info(path)$size > 20 * 1024 * 1024) stop("The metadata file is missing or exceeds the 20 MB limit.")
    out <- tempfile("team-metadata-", fileext = ".csv")
    on.exit(unlink(out))
    team_upload_delimited_to_csv(path, filename, out)
    return(read_sample_metadata_file(out, team_upload_csv_name(filename)))
  }
  read_sample_metadata_file(path, filename)
}

# One file sent to the hidden inbox. Returns list(name, path, type, note) for a converted file.
team_upload_convert_one <- function(path, filename, request = list()) {
  ext <- tolower(tools::file_ext(filename))
  if (ext %in% team_upload_delimited_ext) {
    out <- tempfile("team-upload-", fileext = ".csv")
    res <- tryCatch(team_upload_delimited_to_csv(path, filename, out, numbers = TRUE),
                    error = function(e) { unlink(out); stop(conditionMessage(e), call. = FALSE) })
    return(list(name = team_upload_csv_name(filename), path = out, type = "text/csv",
                note = sprintf("%s read as %s-separated text and passed on as CSV with every value unchanged.", filename, res$delimiter)))
  }
  stop(sprintf("%s: Team does not convert .%s files.", filename, ext))
}

team_upload_formats_ui <- function() {
  tags$div(class = "team-upload-inbox", `aria-hidden` = "true", style = "display:none",
           fileInput("team_upload_inbox", NULL, multiple = TRUE))
}

team_upload_formats_server <- function(input, session) {
  served <- 0L
  # Converted files live in tempdir until the browser fetches them once; the response streams
  # the file from disk and deletes it (owned = TRUE). Unfetched files go when the session ends.
  made <- character(0)
  if (!is.null(session)) session$onSessionEnded(function() unlink(made))
  serve <- function(res) {
    served <<- served + 1L
    session$registerDataObj(sprintf("team_upload_%d", served), res, function(data, req) {
      if (!file.exists(data$path)) return(shiny::httpResponse(404L, "text/plain", "Already delivered."))
      shiny::httpResponse(200L, data$type, list(file = data$path, owned = TRUE))
    })
  }
  observeEvent(input$team_upload_inbox, {
    f <- input$team_upload_inbox
    plan <- isolate(input$team_upload_plan)
    batch <- as.character(plan$batch %||% "")
    # Files are matched to their requests by position and id, never by name: two selected
    # files may share a name.
    requests <- plan$files %||% list()
    if (length(requests) != nrow(f)) {
      session$sendCustomMessage("team-upload-converted", list(batch = batch, files = list(),
        errors = list(list(source = "", message = "The upload did not match the selection. Choose the files again."))))
      unlink(f$datapath); return()
    }
    results <- list(); errors <- list()
    for (i in seq_len(nrow(f))) {
      name <- f$name[i]; request <- requests[[i]]
      if (!identical(request$name, name)) { errors[[length(errors) + 1L]] <- list(source = name, message = "The upload did not match the selection. Choose the files again."); next }
      res <- tryCatch(team_upload_convert_one(f$datapath[i], name, request),
                      error = function(e) list(error = conditionMessage(e)))
      if (!is.null(res$error)) errors[[length(errors) + 1L]] <- list(source = name, message = res$error)
      else { results[[length(results) + 1L]] <- c(res, list(source = name, id = as.character(request$id %||% ""))); made <<- c(made, res$path) }
    }
    # A batch loads completely or not at all: on any error nothing is served.
    if (length(errors)) {
      unlink(vapply(results, `[[`, character(1), "path"))
      results <- list()
    }
    out <- lapply(results, function(res) list(source = res$source, id = res$id, name = res$name, type = res$type, note = res$note, url = serve(res)))
    unlink(f$datapath)
    session$sendCustomMessage("team-upload-converted", list(batch = batch, files = out, errors = errors))
  }, ignoreInit = TRUE)
}
