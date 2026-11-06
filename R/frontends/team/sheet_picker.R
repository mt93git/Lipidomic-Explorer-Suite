# Team Excel sheet picker for the abundance "Choose files" input (data_hub-files).
#
# The shared reader (load_one_file in R/utils_data.R, and the mediator branch of rawData in
# R/modules/1_shared_data_module.R) reads every sheet of a workbook and combines them. Team asks
# first, on the server, before the shared input sees the file:
#   * www/team/js/sheet_picker.js holds back any .xlsx/.xls chosen or dropped on data_hub-files
#     and sends those workbooks to the hidden Team input "team_sheet_inbox". If the browser cannot
#     do that, the workbook is refused; it is never handed on unchecked.
#   * Here: workbooks over 50 MB are refused; sheet names are listed with readxl::excel_sheets
#     (no cells read). A workbook with one sheet is handed on as the user's own file, unchanged.
#   * With several sheets the browser shows the names and the user picks one (or, explicitly,
#     all sheets combined as before). Only the chosen sheet is read (readxl::read_excel(sheet=),
#     at most team_sheet_max_rows rows; a longer sheet is refused, never cut). It is handed on as
#     a .csv, and only if the shared .csv reader gives exactly what the shared Excel reader gives
#     for that sheet saved alone (checked with identical(); otherwise the sheet is refused).
# No ZIP parsing, no workbook is written; the one output is that .csv, deleted once delivered.

team_sheet_max_bytes <- 50 * 1024^2
team_sheet_max_rows <- 200000L
# The .csv handed on must stay well below the app's 250 MB upload limit.
team_sheet_max_cells <- 10e6
team_sheet_max_csv_bytes <- 200 * 1024^2
team_sheet_excel_ext <- c("xlsx", "xls")

team_sheet_is_excel <- function(name) tolower(tools::file_ext(name)) %in% team_sheet_excel_ext

team_sheet_mb <- function(bytes) format(round(bytes / 1024^2, 1), nsmall = 1)

# Sheet names of one uploaded workbook; stops with a message for the user.
team_sheet_list <- function(path, name) {
  size <- file.size(path)
  if (is.na(size)) stop(sprintf("%s was not received. Choose it again.", name), call. = FALSE)
  if (size > team_sheet_max_bytes) {
    stop(sprintf("%s is %s MB. Excel workbooks up to %s MB can be loaded. Save the sheet you need as its own .xlsx or .csv file and upload that.",
                 name, team_sheet_mb(size), format(team_sheet_max_bytes / 1024^2)), call. = FALSE)
  }
  sheets <- tryCatch(readxl::excel_sheets(path), error = function(e) NULL)
  if (is.null(sheets)) stop(sprintf("%s could not be opened as an Excel workbook.", name), call. = FALSE)
  if (!length(sheets)) stop(sprintf("%s has no worksheets.", name), call. = FALSE)
  sheets
}

# detect_file_type() of the shared module, on an already-read header (first rows).
team_sheet_is_mediator <- function(header) {
  cols <- colnames(header)
  if (!length(cols)) return(FALSE)
  if (any(c("PGD2", "PGE2", "LXA4", "RvD1", "Maresin", "TXB2") %in% cols)) return(TRUE)
  if (any(grepl("^(CE|PC|PE|SM|LPC)\\(", as.character(header[[1]])))) return(FALSE)
  isTRUE(grepl("Sample_Name", cols[1]))
}

# What the shared module makes of one global-layout table before the files are merged:
# Lipid_Name first, every other column as.numeric (rawData: mutate(across(-Lipid_Name, as.numeric))).
team_sheet_numeric_view <- function(df) {
  df <- as.data.frame(df, check.names = FALSE, stringsAsFactors = FALSE)
  df[-1] <- suppressWarnings(lapply(df[-1], as.numeric))
  df
}

# Writes a data frame as .csv so that read.csv gives back the same values: numbers with 17
# significant digits (exact for doubles), text quoted, missing values as NA.
team_sheet_write_csv <- function(df, path) {
  out <- as.data.frame(df, check.names = FALSE, stringsAsFactors = FALSE)
  is_num <- vapply(out, is.numeric, logical(1))
  out[is_num] <- lapply(out[is_num], function(x) ifelse(is.na(x), NA_character_, sprintf("%.17g", x)))
  utils::write.csv(out, path, row.names = FALSE, na = "NA", fileEncoding = "UTF-8",
                   quote = which(!is_num))
  invisible(path)
}

team_sheet_refuse <- function(sheet, name, why) {
  stop(sprintf("Sheet \"%s\" of %s was not loaded: %s", sheet, name, why), call. = FALSE)
}

# Reads only `sheet` of the workbook at `path` and writes it to `out` as .csv. Returns `out`.
team_sheet_extract <- function(path, name, sheet, out, max_rows = team_sheet_max_rows) {
  cells_text <- format(team_sheet_max_cells, big.mark = ",", scientific = FALSE)
  too_many_cells <- function() team_sheet_refuse(sheet, name, sprintf("it has more than %s cells, the most Team loads from one sheet. Save a smaller table as its own file.", cells_text))
  # Rows read are bounded before the full read: the width of the first rows sets how many rows
  # fit in the cell cap (the full read is checked again below, in case later rows are wider).
  # Known limit: a sheet whose rows after the first 100 are much wider is read up to the row
  # limit before that check refuses it. readxl cannot report a sheet's size without reading it,
  # and its `range` pads the result to the whole requested box (so a bounding box would itself
  # allocate rows x columns). This is no wider than today's path, which reads every sheet of any
  # upload without a cap.
  width <- max(1L, ncol(readxl::read_excel(path, sheet = sheet, n_max = 100L, .name_repair = "minimal")))
  row_limit <- as.integer(min(max_rows, floor(team_sheet_max_cells / width)))
  # Exactly what load_one_file reads for one sheet (same na), stopping one row past the limit.
  df <- readxl::read_excel(path, sheet = sheet, na = c("N/A", "NA", ""), n_max = row_limit + 1L)
  if (nrow(df) > row_limit) {
    if (row_limit < max_rows) too_many_cells()
    team_sheet_refuse(sheet, name, sprintf("it has more than %s rows, the most Team loads from one sheet. Save a smaller table as its own file.",
                                           format(max_rows, big.mark = ",")))
  }
  if (ncol(df) < 2L || !nrow(df)) team_sheet_refuse(sheet, name, "it is empty or has only one column.")
  if (as.numeric(nrow(df)) * ncol(df) > team_sheet_max_cells) too_many_cells()
  head_xlsx <- readxl::read_excel(path, sheet = sheet, n_max = 5, .name_repair = "minimal")
  if (team_sheet_is_mediator(head_xlsx)) {
    team_sheet_refuse(sheet, name, "it is in the lipid-mediator layout (one row per sample), which loads from the workbook itself. Choose \"All sheets combined\", or save this sheet as its own .xlsx file.")
  }
  if (anyDuplicated(df[[1]])) {
    team_sheet_refuse(sheet, name, "it repeats lipid names in its first column. Save this sheet as its own .xlsx file and upload that.")
  }
  # The .csv size is bounded before anything is written: text (cells and column names) by its
  # byte length plus one byte per quote character (write.csv doubles them) plus quotes and
  # separator; other cells by the longest form they can take (26 bytes).
  text_bytes <- function(x) {
    x <- x[!is.na(x)]
    sum(as.numeric(nchar(x, type = "bytes"))) + sum(as.numeric(nchar(gsub("[^\"]", "", x, useBytes = TRUE), type = "bytes")))
  }
  csv_bytes <- text_bytes(names(df)) + 3 * ncol(df) + sum(vapply(df, function(x) {
    if (!is.character(x)) return(26 * length(x))
    text_bytes(x) + 3 * length(x)
  }, numeric(1)))
  if (csv_bytes > team_sheet_max_csv_bytes) {
    team_sheet_refuse(sheet, name, sprintf("as a table it is larger than %s MB. Save a smaller table as its own file.", format(team_sheet_max_csv_bytes / 1024^2)))
  }
  team_sheet_write_csv(df, out)
  ok <- tryCatch({
    head_csv <- utils::read.csv(out, nrows = 5, check.names = FALSE)
    back <- utils::read.csv(out, check.names = FALSE)
    if (!"Lipid_Name" %in% names(back)) names(back)[1] <- "Lipid_Name"
    want <- df; names(want)[1] <- "Lipid_Name"
    !team_sheet_is_mediator(head_csv) && identical(team_sheet_numeric_view(back), team_sheet_numeric_view(want))
  }, error = function(e) FALSE)
  if (!ok) {
    unlink(out)
    team_sheet_refuse(sheet, name, "its values could not be passed on unchanged (for example dates, or text inside number columns). Save this sheet as its own .xlsx file and upload that.")
  }
  out
}

# "Data [Sheet 1].csv": a file name for the chosen sheet, unique within `used`.
team_sheet_csv_name <- function(name, sheet, used = character(0)) {
  base <- gsub("[/\\\\:*?\"<>|[:cntrl:]]", "_", paste0(tools::file_path_sans_ext(name), " [", sheet, "]"))
  candidate <- paste0(base, ".csv"); i <- 1L
  while (candidate %in% used) { i <- i + 1L; candidate <- sprintf("%s (%d).csv", base, i) }
  candidate
}

# Inline gate, registered before sheet_picker.js: if the picker did not start (window.TeamSheetPicker
# missing), a selection or drop on data_hub-files that contains an .xlsx/.xls is stopped here and
# the user told why, so a workbook never reaches the shared input unchecked.
team_sheet_gate_js <- "(function(){function x(fs){for(var i=0;fs&&i<fs.length;i++)if(/\\.(xlsx|xls)$/i.test(fs[i].name||''))return true;return false}function stop(e,fs){if(window.TeamSheetPicker||!x(fs))return false;e.stopImmediatePropagation();e.preventDefault();window.alert('Excel workbooks cannot be checked on this page right now, so nothing was loaded. Reload the page and try again, or save the sheet you need as .csv.');return true}window.addEventListener('change',function(e){var t=e.target;if(t&&t.id==='data_hub-files'&&stop(e,t.files))t.value=''},true);window.addEventListener('drop',function(e){var z=e.target&&e.target.closest&&e.target.closest('.shiny-input-container'),t=z&&z.querySelector('input[type=file]');if(t&&t.id==='data_hub-files')stop(e,e.dataTransfer&&e.dataTransfer.files)},true)})();"

team_sheet_picker_ui <- function() {
  tags$div(class = "team-sheet-inbox", `aria-hidden` = "true", style = "display:none",
           fileInput("team_sheet_inbox", NULL, multiple = TRUE, accept = c(".xlsx", ".xls")))
}

team_sheet_picker_server <- function(input, session, out_dir = tempdir()) {
  if (is.null(session)) return(invisible(NULL))
  pending <- NULL   # list(batch, paths, names, sheets): the workbooks waiting for a choice
  made <- character(0); served <- 0L
  drop_pending <- function() { if (!is.null(pending)) unlink(pending$paths); pending <<- NULL }
  session$onSessionEnded(function() { drop_pending(); unlink(made) })
  send <- function(type, batch, ...) session$sendCustomMessage(type, c(list(batch = batch), list(...)))
  serve <- function(path) {
    served <<- served + 1L
    session$registerDataObj(sprintf("team_sheet_%d", served), list(path = path), function(data, req) {
      if (!file.exists(data$path)) return(shiny::httpResponse(404L, "text/plain", "Already delivered."))
      shiny::httpResponse(200L, "text/csv", list(file = data$path, owned = TRUE))
    })
  }

  # Step 1: the workbooks of one selection arrive; answer with their sheet names.
  observeEvent(input$team_sheet_inbox, {
    f <- input$team_sheet_inbox
    drop_pending()
    batch <- as.character(isolate(input$team_sheet_batch) %||% "")
    errors <- list(); sheets <- vector("list", nrow(f))
    for (i in seq_len(nrow(f))) {
      res <- tryCatch(team_sheet_list(f$datapath[i], f$name[i]), error = function(e) structure(conditionMessage(e), class = "team_sheet_error"))
      if (inherits(res, "team_sheet_error")) errors[[length(errors) + 1L]] <- unclass(res) else sheets[[i]] <- res
    }
    if (length(errors) || !nzchar(batch)) {
      unlink(f$datapath)
      send("team-sheet-list", batch, files = list(), errors = if (length(errors)) errors else list("The upload did not match the selection. Choose the files again."))
      return()
    }
    pending <<- list(batch = batch, paths = f$datapath, names = f$name, sheets = sheets)
    send("team-sheet-list", batch, errors = list(),
         files = lapply(seq_len(nrow(f)), function(i) list(index = i - 1L, name = f$name[i], sheets = as.list(sheets[[i]]))))
  }, ignoreInit = TRUE)

  # Step 2: the user's choice for every workbook with several sheets: {batch, choices: [{index, sheet}]}.
  # A chosen sheet is read and served as .csv; nothing is served unless every choice succeeds.
  observeEvent(input$team_sheet_choice, {
    msg <- input$team_sheet_choice
    batch <- as.character(msg$batch %||% "")
    p <- pending
    if (is.null(p) || !identical(batch, p$batch)) {
      send("team-sheet-ready", batch, files = list(), errors = list("The workbook is no longer available. Choose it again."))
      return()
    }
    pending <<- NULL
    errors <- list(); results <- list(); used <- character(0)
    for (choice in msg$choices %||% list()) {
      i <- suppressWarnings(as.integer(choice$index)) + 1L
      sheet <- choice$sheet
      if (length(i) != 1L || is.na(i) || i < 1L || i > length(p$paths) || !is.character(sheet) || length(sheet) != 1L || !sheet %in% p$sheets[[i]]) {
        errors[[length(errors) + 1L]] <- "The sheet choice did not match the workbook. Choose the file again."; break
      }
      name <- team_sheet_csv_name(p$names[i], sheet, used); used <- c(used, name)
      out <- tempfile("team-sheet-", tmpdir = out_dir, fileext = ".csv")
      res <- tryCatch(team_sheet_extract(p$paths[i], p$names[i], sheet, out), error = function(e) { unlink(out); structure(conditionMessage(e), class = "team_sheet_error") })
      if (inherits(res, "team_sheet_error")) { errors[[length(errors) + 1L]] <- unclass(res); break }
      results[[length(results) + 1L]] <- list(index = i - 1L, name = name, path = out)
    }
    unlink(p$paths)
    if (length(errors)) {
      unlink(vapply(results, `[[`, character(1), "path"))
      send("team-sheet-ready", batch, files = list(), errors = errors)
      return()
    }
    made <<- c(made, vapply(results, `[[`, character(1), "path"))
    send("team-sheet-ready", batch, errors = list(),
         files = lapply(results, function(r) list(index = r$index, name = r$name, url = serve(r$path))))
  }, ignoreInit = TRUE)

  # Backstop: a workbook with several sheets that reaches the shared input (the user chose
  # "All sheets combined", or the page script did not run; the inline gate in ui.R refuses
  # workbooks when the picker is not running) is never combined silently.
  observeEvent(input[["data_hub-files"]], {
    f <- input[["data_hub-files"]]
    for (i in seq_len(nrow(f))) {
      if (!team_sheet_is_excel(f$name[i])) next
      n <- tryCatch(length(readxl::excel_sheets(f$datapath[i])), error = function(e) 0L)
      if (n > 1L) shiny::showNotification(sprintf("%s: all %d sheets of this workbook are combined into one table.", f$name[i], n),
                                         type = "warning", duration = NULL, session = session)
    }
  }, ignoreInit = TRUE)
}
