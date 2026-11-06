# Team: SCIEX results exports (SCIEX OS / MultiQuant / Analyst, tab-delimited .txt).
#
# Two layouts are recognised by their header:
# - "wide" (primary; SCIEX 7500 / SCIEX OS results export):
#     line 1: Sample Name <TAB> sample 1 <TAB> sample 2 ...
#     line 2: Sample Type <TAB> Unknown  <TAB> Blank ...
#     line 3+: component (e.g. "CE(14:0)+NH4") <TAB> value <TAB> value ...   values are numbers or N/A
# - "long" (Results Table): one row per sample x component, with columns Sample Name,
#   Sample Type, Component Name, Area, Height, Calculated Concentration, ...
#
# The shared data module (R/modules/1_shared_data_module.R) reads a wide abundance .csv: lipid
# rows x sample columns, first column the lipid name. Team turns either layout into exactly that
# .csv, in Team code, before the file reaches the shared module; the shared reader is never
# changed or wrapped. The conversion only re-arranges cells: every value is written as the text
# the export holds, byte for byte, so the shared reader parses it as it would parse the same
# table saved as .csv. Cells SCIEX writes for a missing peak (N/A, No Peak, NA, empty) are written
# empty, which read.csv reads as NA (the same as a blank cell of a wide .csv). Any other text that
# would not read as a number (a decimal comma, "<LOQ", ...) refuses the file: no silent NA.
# Component names are kept as written, adduct suffix included ("CE(14:0)+NH4"): the shared lipid
# name parser already reads adducts. Nothing is left out unless the user asks for it: samples whose
# Sample Type is not Unknown (blanks, standards, QCs) and internal standards (".IS", "SPLASH")
# are listed in the dialog and kept by default.
#
# Browser side: www/team/js/sciex_import.js recognises the export by its first lines, sends it to
# the hidden input below, shows the summary and the choices, then hands the converted .csv to the
# same "Choose files" input.

team_sciex_max_bytes <- 50 * 1024^2
team_sciex_max_rows <- 2e6
team_sciex_max_cells <- 2e7
# Raw table limits, checked from field counts before the table is read into memory.
team_sciex_max_raw_cells <- 2e7
team_sciex_max_columns <- 1e5

# Long layout: value columns offered in the dialog (header base names, case-insensitive, units removed).
team_sciex_value_columns <- c("Area", "Height", "Calculated Concentration", "Area Ratio", "Height Ratio",
                              "Analyte Peak Area", "Analyte Peak Height", "Analyte Concentration",
                              "Calculated Conc", "Concentration")
team_sciex_default_order <- c("calculated concentration", "area", "analyte concentration", "analyte peak area")
# Cells that mean "no value"; they become empty (NA) cells.
team_sciex_missing_cells <- c("", "na", "n/a", "no peak")
# Internal standards, as SCIEX lipid panels name them ("..._Ultimate_SPLASH_ONE.IS").
team_sciex_is_pattern <- "(?i)(\\.IS$|SPLASH|\\(IS\\)$|\\[IS\\]$)"
# The shared type detector (detect_file_type) routes a .csv whose columns include one of these to
# the mediator reader; a sample of that name is refused instead of being misread.
team_sciex_mediator_names <- c("PGD2", "PGE2", "LXA4", "RvD1", "Maresin", "TXB2")

# Header name without units: "Calculated Concentration (ng/mL)" -> "calculated concentration".
team_sciex_base_name <- function(x) {
  x <- sub("^﻿", "", x)
  x <- gsub("\\s*[\\(\\[][^\\)\\]]*[\\)\\]]\\s*$", "", x, perl = TRUE)
  tolower(gsub("\\s+", " ", trimws(gsub("\"", "", x, fixed = TRUE))))
}
team_sciex_base_label <- function(value) trimws(sub("\\s*[\\(\\[][^\\)\\]]*[\\)\\]]\\s*$", "", value, perl = TRUE))

team_sciex_file_encoding <- function(path) {
  con <- file(path, open = "rb"); on.exit(close(con))
  bom <- readBin(con, "raw", 3L)
  if (length(bom) >= 2L && identical(bom[1:2], as.raw(c(0xFF, 0xFE)))) return("UTF-16LE")
  if (length(bom) >= 2L && identical(bom[1:2], as.raw(c(0xFE, 0xFF)))) return("UTF-16BE")
  if (length(bom) == 3L && identical(bom, as.raw(c(0xEF, 0xBB, 0xBF)))) return("UTF-8-BOM")
  ""
}

# The first lines of the file as text.
team_sciex_head_lines <- function(path, n = 50L) {
  enc <- team_sciex_file_encoding(path)
  con <- if (nzchar(enc)) file(path, open = "r", encoding = enc) else file(path, open = "r")
  on.exit(close(con))
  lines <- tryCatch(suppressWarnings(readLines(con, n = n, warn = FALSE)), error = function(e) character(0))
  sub("^﻿", "", lines)
}

# Layout and delimiter from the first lines: list(layout = "wide"|"long", sep, header_at), or NULL.
team_sciex_detect_lines <- function(lines) {
  fields <- function(l, sep) team_sciex_base_name(strsplit(l, sep, fixed = TRUE)[[1]])
  sep_of <- function(l) if (grepl("\t", l, fixed = TRUE)) "\t" else ","
  for (i in seq_along(lines)) {
    l <- lines[i]
    if (!nzchar(trimws(l))) next
    sep <- sep_of(l); f <- fields(l, sep)
    if (all(c("sample name", "component name") %in% f)) return(list(layout = "long", sep = sep, header_at = i))
    if (length(f) >= 2L && identical(f[1], "sample name") && i < length(lines)) {
      nxt <- fields(lines[i + 1L], sep)
      if (length(nxt) >= 1L && identical(nxt[1], "sample type")) return(list(layout = "wide", sep = sep, header_at = i))
    }
    # The wide header is the first non-empty line; a long header may follow a few preamble lines.
  }
  NULL
}
team_sciex_detect <- function(path) if (file.exists(path)) team_sciex_detect_lines(team_sciex_head_lines(path)) else NULL

# Reads the table as text cells (no type conversion), from the header line on.
team_sciex_count_fields <- function(path, how, enc) {
  con <- if (nzchar(enc)) file(path, open = "r", encoding = enc) else file(path, open = "r")
  tryCatch(utils::count.fields(con, sep = how$sep, quote = "\"", skip = how$header_at - 1L, comment.char = "", blank.lines.skip = TRUE),
           finally = close(con))
}

team_sciex_read_cells <- function(path, filename, how) {
  enc <- team_sciex_file_encoding(path)
  # Preflight: rows, columns and cells from the field counts, before anything is allocated.
  counts <- team_sciex_count_fields(path, how, enc)
  too_big <- function(what) stop(sprintf("%s has %s. Export fewer components or samples per file.", filename, what), call. = FALSE)
  if (length(counts) > team_sciex_max_rows + 2L) too_big(sprintf("more than %s rows", format(team_sciex_max_rows, big.mark = ",", scientific = FALSE)))
  if (length(counts) && max(counts, na.rm = TRUE) > team_sciex_max_columns) too_big(sprintf("more than %s columns", format(team_sciex_max_columns, big.mark = ",", scientific = FALSE)))
  if (length(counts) && as.numeric(length(counts)) * max(counts, na.rm = TRUE) > team_sciex_max_raw_cells) too_big(sprintf("more than %s cells", format(team_sciex_max_raw_cells, big.mark = ",", scientific = FALSE)))
  args <- list(file = path, sep = how$sep, quote = "\"", header = FALSE, skip = how$header_at - 1L,
               colClasses = "character", na.strings = character(), comment.char = "", fill = TRUE,
               blank.lines.skip = TRUE, strip.white = FALSE, check.names = FALSE, allowEscapes = FALSE,
               stringsAsFactors = FALSE, nrows = team_sciex_max_rows + 3L)
  if (nzchar(enc)) args$fileEncoding <- enc
  cells <- do.call(utils::read.table, args)
  if (nrow(cells) > team_sciex_max_rows + 2L) {
    stop(sprintf("%s has more than %s rows. Export fewer components or samples per file.", filename, format(team_sciex_max_rows, big.mark = ",", scientific = FALSE)), call. = FALSE)
  }
  cells[] <- lapply(cells, function(x) { x[is.na(x)] <- ""; x })
  cells[[1]][1] <- sub("^﻿", "", cells[[1]][1])
  # Rows longer than the header are accepted only when the extra cells are empty (trailing tabs).
  header_n <- sum(cumsum(rev(nzchar(as.character(cells[1, ])))) > 0L)
  if (header_n < ncol(cells)) {
    extra <- cells[-1, (header_n + 1L):ncol(cells), drop = FALSE]
    if (any(extra != "")) {
      i <- which(rowSums(extra != "") > 0L)[1]
      stop(sprintf("%s: table line %d has more cells than the header.", filename, i + 1L), call. = FALSE)
    }
    cells <- cells[, seq_len(header_n), drop = FALSE]
  }
  # Rows shorter than the header would be padded with empty cells (silent NA): refused.
  short <- which(!is.na(counts) & counts < header_n)
  if (length(short)) stop(sprintf("%s: a row has %d cells where the header has %d (row %d of the table). The export looks cut; export it again.", filename, counts[short[1]], header_n, short[1]), call. = FALSE)
  # Fully empty lines carry nothing.
  keep <- c(TRUE, rowSums(cells[-1, , drop = FALSE] != "") > 0L)
  structure(cells[keep, , drop = FALSE], line = which(keep))
}

team_sciex_check_size <- function(path, filename) {
  if (!file.exists(path)) stop(sprintf("%s could not be read.", filename), call. = FALSE)
  if (file.info(path)$size > team_sciex_max_bytes) {
    stop(sprintf("%s is larger than %d MB. Export fewer components or samples per file.", filename, team_sciex_max_bytes / 1024^2), call. = FALSE)
  }
}

team_sciex_is_missing <- function(x) tolower(trimws(x)) %in% team_sciex_missing_cells
team_sciex_is_number <- function(x) !is.na(suppressWarnings(as.numeric(x)))
team_sciex_is_unknown <- function(type) tolower(trimws(type)) == "unknown"
team_sciex_is_standard <- function(name) grepl(team_sciex_is_pattern, trimws(name), perl = TRUE)

# Reads either layout into one shape: list(layout, samples, types, components, values (text matrix,
# components x samples, NA where the long table has no row), line (table line of each value cell),
# value_columns (long only), file). For the long layout, value picks the value column.
team_sciex_read <- function(path, filename = basename(path), value = NULL) {
  team_sciex_check_size(path, filename)
  how <- team_sciex_detect(path)
  if (is.null(how)) stop(sprintf("%s is not a SCIEX results export: the first lines are neither \"Sample Name\" and \"Sample Type\" rows nor a table with \"Sample Name\" and \"Component Name\" columns.", filename), call. = FALSE)
  cells <- team_sciex_read_cells(path, filename, how)
  lines <- attr(cells, "line") + how$header_at - 1L
  if (identical(how$layout, "wide")) return(team_sciex_read_wide(cells, lines, filename))
  team_sciex_read_long(cells, lines, filename, value)
}

team_sciex_read_wide <- function(cells, lines, filename) {
  if (ncol(cells) < 2L) stop(sprintf("%s has no sample columns.", filename), call. = FALSE)
  samples <- as.character(cells[1, -1]); types <- as.character(cells[2, -1])
  body <- cells[-(1:2), , drop = FALSE]
  if (!nrow(body)) stop(sprintf("%s has no component rows.", filename), call. = FALSE)
  values <- as.matrix(body[, -1, drop = FALSE]); dimnames(values) <- NULL
  list(layout = "wide", samples = samples, types = types, components = body[[1]], values = values,
       line = lines[-(1:2)], value_name = NULL, value_columns = NULL)
}

team_sciex_read_long <- function(cells, lines, filename, value = NULL) {
  header <- as.character(cells[1, ]); base <- team_sciex_base_name(header)
  body <- cells[-1, , drop = FALSE]; body_line <- lines[-1]
  first <- function(name) { i <- which(base == name); if (length(i)) i[1] else NA_integer_ }
  s <- first("sample name"); comp <- first("component name"); ty <- first("sample type")
  vcols <- which(base %in% tolower(team_sciex_value_columns)); vcols <- vcols[!duplicated(base[vcols])]
  if (!length(vcols)) stop(sprintf("%s has no value column Lipidomic Explorer can use (for example Area, Height or Calculated Concentration).", filename), call. = FALSE)
  if (is.null(value)) {
    usable <- vapply(vcols, function(j) any(team_sciex_is_number(body[[j]])), logical(1))
    pick <- intersect(team_sciex_default_order, base[vcols][usable])
    j <- if (length(pick)) vcols[match(pick[1], base[vcols])] else vcols[which(usable)[1] %|NA|% 1L]
  } else {
    j <- vcols[match(value, header[vcols])]
    if (is.na(j)) stop(sprintf("%s has no value column \"%s\".", filename, value), call. = FALSE)
  }
  sample <- body[[s]]; component <- body[[comp]]
  blank_s <- which(!nzchar(trimws(sample)))
  if (length(blank_s)) stop(sprintf("%s: the row on line %d has no Sample Name.", filename, body_line[blank_s[1]]), call. = FALSE)
  blank_c <- which(!nzchar(trimws(component)))
  if (length(blank_c)) stop(sprintf("%s: the row on line %d has no Component Name.", filename, body_line[blank_c[1]]), call. = FALSE)
  dup <- which(duplicated(paste(sample, component, sep = "\r")))
  if (length(dup)) {
    i <- dup[1]
    stop(sprintf("%s: sample \"%s\" has more than one row for component \"%s\" (line %d; %d repeated sample x component pair%s). Each injection needs its own Sample Name.",
                 filename, sample[i], component[i], body_line[i], length(dup), if (length(dup) == 1L) "" else "s"), call. = FALSE)
  }
  samples <- unique(sample); components <- unique(component)
  if (as.numeric(length(samples)) * length(components) > team_sciex_max_cells) {
    stop(sprintf("%s would make a matrix of %d components x %d samples, more than Lipidomic Explorer loads from one file.", filename, length(components), length(samples)), call. = FALSE)
  }
  types <- if (is.na(ty)) rep("", length(samples)) else {
    t <- body[[ty]]; by_sample <- tapply(t, factor(sample, levels = samples), function(x) unique(x))
    mixed <- which(lengths(by_sample) > 1L)
    if (length(mixed)) stop(sprintf("%s: sample \"%s\" has more than one Sample Type.", filename, samples[mixed[1]]), call. = FALSE)
    vapply(by_sample, `[`, character(1), 1L, USE.NAMES = FALSE)
  }
  idx <- cbind(match(component, components), match(sample, samples))
  values <- matrix(NA_character_, length(components), length(samples)); values[idx] <- body[[j]]
  line <- matrix(NA_integer_, length(components), length(samples)); line[idx] <- body_line
  list(layout = "long", samples = samples, types = types, components = components, values = values,
       line = line, value_name = header[j], value_columns = header[vcols], has_types = !is.na(ty))
}
`%|NA|%` <- function(a, b) if (length(a) && !is.na(a)) a else b

# Common checks on names; values are checked in team_sciex_convert (after the user's choices).
team_sciex_check_names <- function(x, filename) {
  if (any(!nzchar(trimws(x$samples)))) stop(sprintf("%s: sample column %d has no Sample Name.", filename, which(!nzchar(trimws(x$samples)))[1] + 1L), call. = FALSE)
  d <- which(duplicated(x$samples))
  if (length(d)) stop(sprintf("%s: the Sample Name \"%s\" appears more than once. Each sample needs its own name.", filename, x$samples[d[1]]), call. = FALSE)
  if (any(!nzchar(trimws(x$components)))) stop(sprintf("%s: a component row has no name (line %d).", filename, x$line[which(!nzchar(trimws(x$components)))[1]]), call. = FALSE)
  d <- which(duplicated(x$components))
  if (length(d)) stop(sprintf("%s: the component \"%s\" appears more than once (line %d). Each sample x component pair must have one value.", filename, x$components[d[1]], x$line[d[1]]), call. = FALSE)
  clash <- intersect(x$samples, c("Lipid_Name", team_sciex_mediator_names))
  if (length(clash)) stop(sprintf("%s: a sample named \"%s\" cannot be a column of the abundance matrix. Rename the sample in the export.", filename, clash[1]), call. = FALSE)
  invisible(TRUE)
}

# What the dialog needs.
team_sciex_inspect <- function(path, filename = basename(path)) {
  x <- team_sciex_read(path, filename)
  team_sciex_check_names(x, filename)
  value_columns <- if (identical(x$layout, "long")) lapply(x$value_columns, function(v) {
    col <- if (identical(v, x$value_name)) x$values else team_sciex_read(path, filename, v)$values
    list(column = v, numeric = sum(team_sciex_is_number(col), na.rm = TRUE), missing = sum(team_sciex_is_missing(col[!is.na(col)])))
  })
  type_label <- ifelse(nzchar(trimws(x$types)), trimws(x$types), "(no type)")
  other <- !team_sciex_is_unknown(x$types)
  if (identical(x$layout, "long") && !isTRUE(x$has_types)) other[] <- FALSE
  levels <- unique(type_label)
  standards <- x$components[team_sciex_is_standard(x$components)]
  n_preview <- min(4L, length(x$components)); s_preview <- min(5L, length(x$samples))
  list(file = filename, layout = x$layout, samples = length(x$samples), components = length(x$components),
       value = x$value_name, value_columns = value_columns,
       sample_types = lapply(levels, function(t) list(type = t, samples = sum(type_label == t))),
       other_samples = lapply(which(other), function(k) list(sample = x$samples[k], type = type_label[k])),
       standards = length(standards), standard_examples = I(utils::head(standards, 3L)),
       missing = sum(team_sciex_is_missing(x$values[!is.na(x$values)])),
       # I(): always JSON arrays, also with one element.
       preview = list(samples = I(x$samples[seq_len(s_preview)]), types = I(x$types[seq_len(s_preview)]),
                      components = I(x$components[seq_len(n_preview)]),
                      values = lapply(seq_len(n_preview), function(i) I(unname(x$values[i, seq_len(s_preview)])))))
}

team_sciex_csv_field <- function(x) {
  needs <- grepl("[\",\r\n]", x, useBytes = TRUE)
  x[needs] <- paste0("\"", gsub("\"", "\"\"", x[needs], fixed = TRUE, useBytes = TRUE), "\"")
  x
}

# Writes the wide abundance .csv. choices: value (long layout), exclude_other_types (drop samples
# whose Sample Type is not Unknown), exclude_standards (drop internal-standard rows).
team_sciex_convert <- function(path, filename, out, value = NULL, exclude_other_types = FALSE, exclude_standards = FALSE) {
  x <- team_sciex_read(path, filename, if (is.null(value) || !nzchar(value)) NULL else value)
  if (identical(x$layout, "wide") && !is.null(value) && nzchar(value)) stop(sprintf("%s has one value per cell; there is no value column to choose.", filename), call. = FALSE)
  team_sciex_check_names(x, filename)
  keep_s <- rep(TRUE, length(x$samples)); keep_c <- rep(TRUE, length(x$components))
  if (isTRUE(exclude_other_types)) {
    if (identical(x$layout, "long") && !isTRUE(x$has_types)) stop(sprintf("%s has no Sample Type column, so samples cannot be left out by type.", filename), call. = FALSE)
    keep_s <- team_sciex_is_unknown(x$types)
  }
  if (isTRUE(exclude_standards)) keep_c <- !team_sciex_is_standard(x$components)
  if (!any(keep_s)) stop(sprintf("%s has no Unknown samples left to load.", filename), call. = FALSE)
  if (!any(keep_c)) stop(sprintf("%s has no components left to load.", filename), call. = FALSE)
  v <- x$values[keep_c, keep_s, drop = FALSE]; line <- if (is.matrix(x$line)) x$line[keep_c, keep_s, drop = FALSE] else matrix(x$line[keep_c], nrow(v), ncol(v))
  samples <- x$samples[keep_s]; components <- x$components[keep_c]
  absent <- is.na(v); v[absent] <- ""
  missing <- team_sciex_is_missing(v)
  bad <- which(!missing & !team_sciex_is_number(v))
  if (length(bad)) {
    k <- bad[1]; r <- (k - 1L) %% nrow(v) + 1L; s <- (k - 1L) %/% nrow(v) + 1L; comma <- grepl(",", v[k], fixed = TRUE)
    stop(sprintf("%s: the value \"%s\" for sample \"%s\", component \"%s\" (line %d) is not a number (%d such value%s). Lipidomic Explorer would read it as a missing value, so the file was not loaded. %s",
                 filename, v[k], samples[s], components[r], line[k], length(bad), if (length(bad) == 1L) "" else "s",
                 if (comma) "It looks like a decimal comma: export the results again with a decimal point." else "Only empty cells, N/A, NA and No Peak are read as missing."), call. = FALSE)
  }
  n_missing <- sum(missing & !absent)
  v[missing] <- ""
  columns <- c(list(c("Lipid_Name", components)), lapply(seq_along(samples), function(k) c(samples[k], v[, k])))
  rows <- do.call(paste, c(lapply(columns, team_sciex_csv_field), sep = ","))
  con <- file(out, open = "wb"); on.exit(close(con))
  writeLines(enc2utf8(rows), con, sep = "\n", useBytes = TRUE)
  list(path = out, layout = x$layout, value = x$value_name, samples = length(samples), components = length(components),
       excluded_samples = sum(!keep_s), excluded_standards = sum(!keep_c), missing = n_missing, not_measured = sum(absent))
}

team_sciex_csv_name <- function(filename, value = NULL) {
  stem <- sub("\\.[^.]*$", "", filename)
  label <- if (is.null(value) || !nzchar(value)) "SCIEX" else paste("SCIEX", gsub("[/\\\\:*?\"<>|]", "_", team_sciex_base_label(value)))
  paste0(stem, " (", label, ").csv")
}

team_sciex_batch_pattern <- "^(sciex-[0-9]+-[0-9]+)__(.+)$"

team_sciex_ui <- function() {
  tags$div(class = "team-sciex-inbox", `aria-hidden` = "true", style = "display:none",
           fileInput("team_sciex_inbox", NULL, multiple = TRUE))
}

# Hidden inbox. The upload answers with each file's summary ("inspect"); the user's choices
# arrive as input$team_sciex_convert (no second upload) and each converted .csv is served once.
# Uploaded files are kept only until their batch is converted or cancelled, or the session ends.
team_sciex_server <- function(input, session) {
  served <- 0L; held <- list(); made <- list(); cancelled <- character(0)
  drop_batch <- function(batch) { if (!is.null(held[[batch]])) unlink(held[[batch]]$path); held[[batch]] <<- NULL }
  # Cancel (from the dialog, a browser timeout or a failed fetch): drop the upload and any
  # converted files not yet fetched; an upload that arrives later for that batch is discarded.
  cancel_batch <- function(batch) {
    drop_batch(batch); unlink(made[[batch]]); made[[batch]] <<- NULL
    cancelled <<- utils::tail(unique(c(cancelled, batch)), 100L)
  }
  if (!is.null(session)) session$onSessionEnded(function() { for (b in names(held)) unlink(held[[b]]$path); unlink(unlist(made)) })
  serve <- function(path) {
    served <<- served + 1L
    session$registerDataObj(sprintf("team_sciex_%d", served), list(path = path), function(data, req) {
      if (!file.exists(data$path)) return(shiny::httpResponse(404L, "text/plain", "Already delivered."))
      shiny::httpResponse(200L, "text/csv", list(file = data$path, owned = TRUE))
    })
  }
  reply <- function(batch, ...) session$sendCustomMessage("team-sciex", c(list(batch = batch), list(...)))
  observeEvent(input$team_sciex_inbox, {
    f <- input$team_sciex_inbox
    # Each uploaded file carries its batch in its name ("<batch>__<file name>"), so a late upload
    # can never be taken for a newer batch.
    tagged <- regmatches(f$name, regexec(team_sciex_batch_pattern, f$name))
    batches <- vapply(tagged, function(m) if (length(m) == 3L) m[2] else "", character(1))
    batch <- batches[1]
    if (!nzchar(batch) || any(batches != batch) || batch %in% cancelled) { unlink(f$datapath); return() }
    f$name <- vapply(tagged, `[`, character(1), 3L)
    for (b in names(held)) drop_batch(b) # one batch at a time per session
    for (b in names(made)) { unlink(made[[b]]); made[[b]] <<- NULL } # earlier conversions not fetched
    errors <- list(); summaries <- list()
    for (i in seq_len(nrow(f))) {
      s <- tryCatch(team_sciex_inspect(f$datapath[i], f$name[i]), error = function(e) list(error = conditionMessage(e)))
      if (!is.null(s$error)) errors[[length(errors) + 1L]] <- list(source = f$name[i], message = s$error)
      else summaries[[length(summaries) + 1L]] <- s
    }
    if (length(errors)) { unlink(f$datapath); reply(batch, stage = "inspect", errors = errors); return() }
    held[[batch]] <<- list(name = f$name, path = f$datapath)
    reply(batch, stage = "inspect", files = summaries, errors = list())
  }, ignoreInit = TRUE)
  observeEvent(input$team_sciex_convert, {
    req <- input$team_sciex_convert
    batch <- as.character(req$batch %||% "")
    if (isTRUE(req$cancel)) { cancel_batch(batch); return() }
    h <- held[[batch]]
    if (is.null(h)) { reply(batch, stage = "convert", errors = list(list(source = "", message = "The file is no longer on the server. Choose it again."))); return() }
    results <- list(); errors <- list()
    for (choice in req$files %||% list()) {
      k <- match(as.character(choice$name %||% ""), h$name)
      if (is.na(k)) { errors[[length(errors) + 1L]] <- list(source = as.character(choice$name %||% ""), message = "Unknown file."); next }
      out <- tempfile("team-sciex-", fileext = ".csv")
      r <- tryCatch(team_sciex_convert(h$path[k], h$name[k], out, as.character(choice$value %||% ""),
                                       isTRUE(choice$excludeOtherTypes), isTRUE(choice$excludeStandards)),
                    error = function(e) { unlink(out); list(error = conditionMessage(e)) })
      if (!is.null(r$error)) errors[[length(errors) + 1L]] <- list(source = h$name[k], message = r$error)
      else results[[length(results) + 1L]] <- c(r, list(source = h$name[k], name = team_sciex_csv_name(h$name[k], r$value)))
    }
    drop_batch(batch)
    # A selection loads completely or not at all.
    if (length(errors) || !length(results)) {
      unlink(vapply(results, `[[`, character(1), "path"))
      reply(batch, stage = "convert", errors = if (length(errors)) errors else list(list(source = "", message = "Nothing to convert.")))
      return()
    }
    made[[batch]] <<- vapply(results, `[[`, character(1), "path")
    reply(batch, stage = "convert", errors = list(), files = lapply(results, function(r) list(
      source = r$source, name = r$name, url = serve(r$path), samples = r$samples, components = r$components,
      excludedSamples = r$excluded_samples, excludedStandards = r$excluded_standards, missing = r$missing)))
  }, ignoreInit = TRUE)
}
