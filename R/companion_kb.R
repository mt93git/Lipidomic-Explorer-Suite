# R/companion_kb.R
# Grounded knowledge base for the companion.
#
# Rule: the companion answers ONLY with passages stored in this knowledge base,
# quoted verbatim together with their source. Nothing is generated, nothing is
# looked up elsewhere and no text leaves the server. When the base does not hold
# enough evidence for a question, the answer is COMPANION_KB_NO_INFO.
#
# Storage (no database server and no extra R packages):
#   knowledge_base/seed/*.md                 reviewed application guidance (tracked in git)
#   <library>/sources/<id>-<file>            the files that were fed, kept as they came
#   <library>/index/sources.json             manifest: one record per fed file
#   <library>/index/chunks.jsonl             one JSON record per passage (diff-friendly)
# <library> is knowledge_base/library, or the folder in LIPIDOMIC_KB_DIR.
#
# Text in a source is data. It is never executed or treated as an instruction.

COMPANION_KB_NO_INFO <- "I have no information about this."
COMPANION_KB_LIMITS <- list(file_bytes = 50 * 1024^2, table_rows = 20000L, chunks_per_file = 8000L,
                            chunk_target = 900L, chunk_max = 1400L)
COMPANION_KB_TYPES <- c("md", "txt", "csv", "tsv", "xlsx", "docx", "pdf")

`%||%` <- function(x, y) if (is.null(x) || length(x) == 0L) y else x

companion_kb_enabled <- function() !identical(Sys.getenv("LIPIDOMIC_COMPANION_KB", unset = "1"), "0")
companion_kb_audience <- function() if (identical(Sys.getenv("LIPIDOMIC_TEAM_WORKSPACE", unset = "0"), "1")) "team" else "classic"
companion_kb_dir <- function() {
  d <- Sys.getenv("LIPIDOMIC_KB_DIR", unset = "")
  if (nzchar(d)) d else file.path("knowledge_base", "library")
}
companion_kb_seed_dir <- function() file.path("knowledge_base", "seed")

# ---- Text helpers ------------------------------------------------------------
kb_stop <- c(
  "a","an","the","and","or","but","if","of","to","in","on","at","by","for","with","from","as","into","than","then",
  "is","are","was","were","be","been","being","am","do","does","did","done","have","has","had","having","will","would","can","could",
  "should","may","might","must","shall","this","that","these","those","it","its","i","me","my","mine","you","your","we","our","they",
  "their","he","she","his","her","what","which","who","whom","whose","when","where","why","how","there","here","not","no","yes",
  "so","such","too","very","just","also","any","some","all","each","every","both","about","over","under","between","after","before",
  "up","down","out","off","again","once","only","own","same","other","more","most","much","many","few","less","least",
  "explain","tell","mean","means","meaning","show","give","please","describe","know","understand","help","need","want","use","used","using",
  "work","works","thing","things","one","two","get","got","make","made","like","say","said","let","see","go","going",
  "el","la","los","las","un","una","unos","unas","de","del","al","y","o","u","e","en","con","por","para","que","qué","como","cómo",
  "es","son","ser","esta","este","esto","estos","estas","se","su","sus","mi","mis","tu","tus","lo","le","les","no","si","sí",
  "cual","cuál","cuales","cuáles","donde","dónde","cuando","cuándo","porque","por qué","hay","puede","pueden","me","te","nos"
)
kb_stop <- unique(tolower(stringi::stri_trans_general(kb_stop, "Latin-ASCII")))

kb_stem <- function(w) {
  w <- sub("(ization|isation)s?$", "iz", w)
  w <- sub("(ized|ised|izing|ising|izes|ises|ize|ise)$", "iz", w)
  if (nchar(w) > 4 && grepl("ies$", w)) w <- sub("ies$", "y", w)
  else if (nchar(w) > 5 && grepl("(x|z|ch|sh|ss)es$", w)) w <- sub("es$", "", w)
  else if (nchar(w) > 4 && grepl("[^su]s$", w)) w <- sub("s$", "", w)
  if (nchar(w) > 6 && grepl("ing$", w)) w <- sub("ing$", "", w)
  else if (nchar(w) > 5 && grepl("ed$", w)) w <- sub("ed$", "", w)
  w <- sub("ations?$", "at", w)
  if (nchar(w) > 5 && grepl("e$", w)) w <- sub("e$", "", w)
  w
}

# Terms for matching: ASCII-folded words (stop words removed, lightly stemmed) plus lipid
# species such as "PC 34:1" or "TG(52:2)", kept whole as "pc34:1".
kb_tokens <- function(x) {
  x <- paste(x, collapse = " ")
  x <- tolower(stringi::stri_trans_general(x, "Latin-ASCII"))
  species <- unlist(regmatches(x, gregexpr("\\b[a-z]{1,6} ?\\(?[0-9]{1,2}:[0-9]{1,2}\\)?", x)))
  species <- gsub("[^a-z0-9:]", "", species)
  words <- unlist(strsplit(gsub("[^a-z0-9]+", " ", x), " +"))
  words <- words[nchar(words) >= 2L & !words %in% kb_stop]
  words <- if (length(words)) unname(vapply(words, kb_stem, character(1))) else character(0)
  c(words, species)
}

kb_strip_md <- function(x) {
  x <- gsub("\\*\\*|__|`", "", x)
  gsub("\\[([^]]+)\\]\\(([^)]+)\\)", "\\1 (\\2)", x)
}
kb_clean <- function(x) trimws(gsub("[ \t ]+", " ", gsub("[[:cntrl:]]", " ", x)))

kb_split_paragraph <- function(p, max_chars) {
  if (nchar(p) <= max_chars) return(p)
  sents <- unlist(strsplit(p, "(?<=[.!?;])\\s+", perl = TRUE))
  out <- character(); cur <- ""
  for (s in sents) {
    if (nchar(s) > max_chars) {
      if (nzchar(cur)) { out <- c(out, cur); cur <- "" }
      starts <- seq(1L, nchar(s), by = max_chars)
      out <- c(out, substring(s, starts, starts + max_chars - 1L))
      next
    }
    if (nzchar(cur) && nchar(cur) + 1L + nchar(s) > max_chars) { out <- c(out, cur); cur <- s }
    else cur <- if (nzchar(cur)) paste(cur, s) else s
  }
  if (nzchar(cur)) out <- c(out, cur)
  out
}

kb_chunk_paragraphs <- function(paras, target = COMPANION_KB_LIMITS$chunk_target, max_chars = COMPANION_KB_LIMITS$chunk_max) {
  paras <- unlist(lapply(paras[nzchar(paras)], kb_split_paragraph, max_chars = max_chars))
  out <- character(); cur <- ""
  for (p in paras) {
    if (nzchar(cur) && nchar(cur) + 2L + nchar(p) > target) { out <- c(out, cur); cur <- p }
    else cur <- if (nzchar(cur)) paste(cur, p, sep = "\n\n") else p
  }
  if (nzchar(cur)) out <- c(out, cur)
  out
}

kb_section <- function(section = "", page = NA_integer_, rowwise = FALSE) {
  list(section = section, paras = character(), tags = character(), audience = NA_character_, page = page, rowwise = rowwise)
}

# ---- Extractors: a file becomes list(title, sections) ---------------------------
kb_parse_md <- function(lines, default_title) {
  title <- NULL; stack <- character(); sections <- list(); buf <- character()
  cur <- kb_section()
  endpara <- function() {
    if (length(buf)) cur$paras <<- c(cur$paras, kb_clean(kb_strip_md(paste(buf, collapse = " "))))
    buf <<- character()
  }
  flush <- function() { endpara(); if (length(cur$paras)) sections[[length(sections) + 1L]] <<- cur }
  for (ln in lines) {
    if (grepl("^\\s*```", ln)) next
    h <- regmatches(ln, regexec("^(#{1,4})\\s+(.*?)\\s*#*\\s*$", ln))[[1L]]
    if (length(h) == 3L) {
      flush()
      level <- nchar(h[2L]); text <- kb_clean(kb_strip_md(h[3L]))
      stack <- c(stack[seq_len(min(length(stack), level - 1L))], text)
      if (is.null(title) && level == 1L) title <- text
      cur <- kb_section(paste(stack, collapse = " › "))
      next
    }
    d <- regmatches(ln, regexec("^\\s*<!--\\s*(tags|audience)\\s*:\\s*(.*?)\\s*-->\\s*$", ln))[[1L]]
    if (length(d) == 3L) {
      if (d[2L] == "tags") cur$tags <- c(cur$tags, trimws(tolower(strsplit(d[3L], ",")[[1L]])))
      else if (tolower(trimws(d[3L])) %in% c("all", "team", "classic")) cur$audience <- tolower(trimws(d[3L]))
      next
    }
    if (grepl("^\\s*<!--.*-->\\s*$", ln)) next
    if (!nzchar(trimws(ln))) { endpara(); next }
    if (grepl("^\\s*([-*+]|[0-9]+[.)])\\s+", ln)) endpara()
    buf <- c(buf, trimws(ln))
  }
  flush()
  list(title = title %||% default_title, sections = sections)
}

kb_parse_txt <- function(lines, default_title) {
  s <- kb_section()
  paras <- character(); buf <- character()
  for (ln in c(lines, "")) {
    if (nzchar(trimws(ln))) buf <- c(buf, trimws(ln))
    else if (length(buf)) { paras <- c(paras, kb_clean(paste(buf, collapse = " "))); buf <- character() }
  }
  s$paras <- paras
  list(title = default_title, sections = if (length(paras)) list(s) else list())
}

kb_table_section <- function(df, label) {
  names(df) <- kb_clean(as.character(names(df)))
  cap <- COMPANION_KB_LIMITS$table_rows
  truncated <- nrow(df) > cap
  if (truncated) df <- df[seq_len(cap), , drop = FALSE]
  s <- kb_section(label, rowwise = TRUE)
  header <- sprintf("Table %s with %d row%s. Columns: %s.", label, nrow(df), if (nrow(df) == 1L) "" else "s", paste(names(df), collapse = ", "))
  rows <- vapply(seq_len(nrow(df)), function(i) {
    v <- kb_clean(as.character(unlist(df[i, , drop = TRUE], use.names = FALSE)))
    keep <- !is.na(v) & nzchar(v) & v != "NA"
    txt <- paste0(names(df)[keep], ": ", v[keep], collapse = "; ")
    if (nchar(txt) > COMPANION_KB_LIMITS$chunk_max) paste0(substr(txt, 1L, COMPANION_KB_LIMITS$chunk_max), "…") else txt
  }, character(1))
  s$paras <- c(header, rows[nzchar(rows)])
  list(section = s, truncated = truncated)
}

kb_parse_delim <- function(path, default_title, sep) {
  df <- utils::read.delim(path, sep = sep, header = TRUE, quote = "\"", fill = TRUE, check.names = FALSE,
                          stringsAsFactors = FALSE, colClasses = "character", na.strings = character(0),
                          fileEncoding = "UTF-8-BOM", comment.char = "")
  t <- kb_table_section(df, default_title)
  list(title = default_title, sections = list(t$section), truncated = t$truncated)
}

kb_parse_xlsx <- function(path, default_title) {
  if (!requireNamespace("readxl", quietly = TRUE)) stop("Reading .xlsx needs the 'readxl' package.", call. = FALSE)
  secs <- list(); trunc <- FALSE
  for (sh in readxl::excel_sheets(path)) {
    df <- as.data.frame(readxl::read_excel(path, sheet = sh, col_types = "text"), stringsAsFactors = FALSE)
    if (!nrow(df)) next
    t <- kb_table_section(df, sh); secs[[length(secs) + 1L]] <- t$section; trunc <- trunc || t$truncated
  }
  list(title = default_title, sections = secs, truncated = trunc)
}

kb_xml_text <- function(x) {
  x <- gsub("&lt;", "<", x, fixed = TRUE); x <- gsub("&gt;", ">", x, fixed = TRUE)
  x <- gsub("&quot;", "\"", x, fixed = TRUE); x <- gsub("&apos;", "'", x, fixed = TRUE)
  m <- gregexpr("&#[0-9]+;", x)
  regmatches(x, m) <- lapply(regmatches(x, m), function(e) vapply(e, function(z) intToUtf8(as.integer(gsub("[^0-9]", "", z))), ""))
  gsub("&amp;", "&", x, fixed = TRUE)
}

kb_parse_docx <- function(path, default_title) {
  info <- utils::unzip(path, list = TRUE)
  row <- info[info$Name == "word/document.xml", , drop = FALSE]
  if (!nrow(row)) stop("This .docx has no readable document body.", call. = FALSE)
  if (row$Length > COMPANION_KB_LIMITS$file_bytes) stop("The .docx body is too large.", call. = FALSE)
  tmp <- tempfile("kbdocx"); dir.create(tmp); on.exit(unlink(tmp, recursive = TRUE), add = TRUE)
  utils::unzip(path, files = "word/document.xml", exdir = tmp)
  xml <- paste(readLines(file.path(tmp, "word", "document.xml"), warn = FALSE, encoding = "UTF-8"), collapse = "")
  xml <- gsub("<w:tab/>", " ", xml, fixed = TRUE); xml <- gsub("<w:br[^>]*/>", " ", xml)
  paras <- strsplit(xml, "</w:p>", fixed = TRUE)[[1L]]
  title <- NULL; stack <- character(); sections <- list(); cur <- kb_section()
  for (p in paras) {
    runs <- regmatches(p, gregexpr("<w:t(?: [^>]*)?>[^<]*</w:t>", p, perl = TRUE))[[1L]]
    text <- kb_clean(kb_xml_text(paste(gsub("<[^>]+>", "", runs), collapse = "")))
    if (!nzchar(text)) next
    style <- regmatches(p, regexec("<w:pStyle w:val=\"([^\"]*)\"", p))[[1L]]
    st <- if (length(style) == 2L) style[2L] else ""
    level <- if (grepl("^Title$", st)) 1L else if (grepl("^Heading[1-4]$", st)) as.integer(sub("Heading", "", st)) else NA_integer_
    if (!is.na(level)) {
      if (length(cur$paras)) sections[[length(sections) + 1L]] <- cur
      stack <- c(stack[seq_len(min(length(stack), level - 1L))], text)
      if (is.null(title) && level == 1L) title <- text
      cur <- kb_section(paste(stack, collapse = " › "))
    } else cur$paras <- c(cur$paras, text)
  }
  if (length(cur$paras)) sections[[length(sections) + 1L]] <- cur
  list(title = title %||% default_title, sections = sections)
}

kb_parse_pdf <- function(path, default_title) {
  if (!requireNamespace("pdftools", quietly = TRUE))
    stop("Reading .pdf needs the 'pdftools' package: install.packages(\"pdftools\").", call. = FALSE)
  pages <- pdftools::pdf_text(path)
  sections <- list()
  for (i in seq_along(pages)) {
    blocks <- strsplit(pages[[i]], "\n[ \t]*\n+")[[1L]]
    paras <- kb_clean(vapply(blocks, function(b) paste(trimws(strsplit(b, "\n")[[1L]]), collapse = " "), ""))
    paras <- paras[nzchar(paras)]
    if (length(paras)) { s <- kb_section(paste("Page", i), page = i); s$paras <- paras; sections[[length(sections) + 1L]] <- s }
  }
  list(title = default_title, sections = sections)
}

kb_extract_file <- function(path, title = NULL) {
  ext <- tolower(tools::file_ext(path))
  if (!ext %in% COMPANION_KB_TYPES)
    stop(sprintf("Unsupported file type '.%s'. Supported: %s.", ext, paste0(".", COMPANION_KB_TYPES, collapse = " ")), call. = FALSE)
  default_title <- title %||% tools::file_path_sans_ext(basename(path))
  parsed <- switch(ext,
    md = kb_parse_md(readLines(path, warn = FALSE, encoding = "UTF-8"), default_title),
    txt = kb_parse_txt(readLines(path, warn = FALSE, encoding = "UTF-8"), default_title),
    csv = kb_parse_delim(path, default_title, ","),
    tsv = kb_parse_delim(path, default_title, "\t"),
    xlsx = kb_parse_xlsx(path, default_title),
    docx = kb_parse_docx(path, default_title),
    pdf = kb_parse_pdf(path, default_title))
  if (!is.null(title)) parsed$title <- title
  parsed
}

# ---- Passages ------------------------------------------------------------------
kb_empty_chunks <- function() data.frame(id = character(), source_id = character(), source = character(), title = character(),
  section = character(), page = integer(), audience = character(), tags = character(), origin = character(), text = character(),
  stringsAsFactors = FALSE)

kb_build_chunks <- function(parsed, source_id, source_file, audience, tags, origin) {
  cols <- list(section = character(), page = integer(), audience = character(), tags = character(), text = character())
  for (s in parsed$sections) {
    texts <- if (isTRUE(s$rowwise)) s$paras else kb_chunk_paragraphs(s$paras)
    if (!length(texts)) next
    n <- length(texts)
    cols$section <- c(cols$section, rep(s$section, n))
    cols$page <- c(cols$page, rep(as.integer(s$page), n))
    cols$audience <- c(cols$audience, rep(if (is.na(s$audience)) audience else s$audience, n))
    cols$tags <- c(cols$tags, rep(paste(unique(c(tags, s$tags)), collapse = ";"), n))
    cols$text <- c(cols$text, texts)
  }
  n <- length(cols$text)
  if (!n) return(kb_empty_chunks())
  if (n > COMPANION_KB_LIMITS$chunks_per_file)
    stop(sprintf("This file makes %d passages; the limit is %d per file.", n, COMPANION_KB_LIMITS$chunks_per_file), call. = FALSE)
  data.frame(id = sprintf("%s#%04d", source_id, seq_len(n)), source_id = source_id, source = source_file, title = parsed$title,
             section = cols$section, page = cols$page, audience = cols$audience, tags = cols$tags, origin = origin, text = cols$text,
             stringsAsFactors = FALSE)
}

# ---- Library: feeding, listing, removing ---------------------------------------
kb_paths <- function(dir) list(sources = file.path(dir, "sources"), index = file.path(dir, "index"),
                               manifest = file.path(dir, "index", "sources.json"), chunks = file.path(dir, "index", "chunks.jsonl"))

kb_read_chunks <- function(path) {
  if (!file.exists(path) || file.size(path) == 0L) return(kb_empty_chunks())
  lines <- readLines(path, warn = FALSE, encoding = "UTF-8")
  lines <- lines[nzchar(lines)]
  recs <- lapply(lines, jsonlite::fromJSON, simplifyVector = TRUE)
  out <- data.frame(
    id = vapply(recs, function(r) as.character(r$id), ""), source_id = vapply(recs, function(r) as.character(r$source_id), ""),
    source = vapply(recs, function(r) as.character(r$source), ""), title = vapply(recs, function(r) as.character(r$title), ""),
    section = vapply(recs, function(r) as.character(r$section %||% ""), ""), page = vapply(recs, function(r) as.integer(r$page %||% NA_integer_), 1L),
    audience = vapply(recs, function(r) as.character(r$audience %||% "all"), ""), tags = vapply(recs, function(r) as.character(r$tags %||% ""), ""),
    origin = "library", text = vapply(recs, function(r) as.character(r$text), ""), stringsAsFactors = FALSE)
  out
}

kb_write_chunks <- function(chunks, path) {
  lines <- vapply(seq_len(nrow(chunks)), function(i) as.character(jsonlite::toJSON(
    as.list(chunks[i, setdiff(names(chunks), "origin"), drop = FALSE]), auto_unbox = TRUE, na = "null", null = "null")), "")
  tmp <- paste0(path, ".tmp")
  con <- file(tmp, open = "wb"); writeLines(enc2utf8(lines), con, useBytes = TRUE); close(con)
  if (!file.rename(tmp, path)) { file.copy(tmp, path, overwrite = TRUE); unlink(tmp) }
  invisible(path)
}

companion_kb_sources <- function(dir = companion_kb_dir()) {
  p <- kb_paths(dir)
  empty <- data.frame(id = character(), file = character(), type = character(), sha256 = character(), bytes = numeric(),
                      added_at = character(), title = character(), audience = character(), tags = character(),
                      n_chunks = integer(), stringsAsFactors = FALSE)
  if (!file.exists(p$manifest)) return(empty)
  m <- tryCatch(jsonlite::fromJSON(p$manifest, simplifyVector = TRUE), error = function(e) NULL)
  if (is.null(m) || !length(m)) return(empty)
  as.data.frame(m, stringsAsFactors = FALSE)[, names(empty), drop = FALSE]
}

kb_write_manifest <- function(m, path) {
  tmp <- paste0(path, ".tmp")
  jsonlite::write_json(m, tmp, pretty = TRUE, auto_unbox = TRUE, na = "null")
  if (!file.rename(tmp, path)) { file.copy(tmp, path, overwrite = TRUE); unlink(tmp) }
}

# Feed one file into the library. Re-feeding the same content replaces its passages.
companion_kb_add <- function(path, dir = companion_kb_dir(), audience = "all", tags = character(), title = NULL, quiet = FALSE) {
  if (!is.character(path) || length(path) != 1L || !file.exists(path) || dir.exists(path)) stop("File not found: ", path, call. = FALSE)
  audience <- tolower(audience)
  if (!audience %in% c("all", "team", "classic")) stop("audience must be 'all', 'team' or 'classic'.", call. = FALSE)
  size <- file.size(path)
  if (is.na(size) || size == 0) stop("The file is empty: ", basename(path), call. = FALSE)
  if (size > COMPANION_KB_LIMITS$file_bytes) stop(sprintf("The file is larger than %d MB.", COMPANION_KB_LIMITS$file_bytes %/% 1024^2), call. = FALSE)
  sha <- digest::digest(file = path, algo = "sha256")
  id <- substr(sha, 1L, 12L)
  tags <- trimws(tolower(tags[nzchar(tags)]))
  parsed <- kb_extract_file(path, title)
  new <- kb_build_chunks(parsed, id, basename(path), audience, tags, "library")
  if (!nrow(new)) stop("No readable text was found in ", basename(path), ".", call. = FALSE)
  p <- kb_paths(dir)
  dir.create(p$sources, recursive = TRUE, showWarnings = FALSE); dir.create(p$index, recursive = TRUE, showWarnings = FALSE)
  safe <- gsub("[^A-Za-z0-9._-]+", "_", basename(path))
  stored <- file.path(p$sources, paste0(id, "-", safe))
  if (!file.exists(stored)) file.copy(path, stored)
  chunks <- kb_read_chunks(p$chunks)
  chunks <- rbind(chunks[chunks$source_id != id, , drop = FALSE], new)
  kb_write_chunks(chunks, p$chunks)
  m <- companion_kb_sources(dir); m <- m[m$id != id, , drop = FALSE]
  rec <- data.frame(id = id, file = basename(path), type = tolower(tools::file_ext(path)), sha256 = sha, bytes = size,
                    added_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"), title = parsed$title, audience = audience,
                    tags = paste(tags, collapse = ";"), n_chunks = nrow(new), stringsAsFactors = FALSE)
  kb_write_manifest(rbind(m, rec), p$manifest)
  if (!quiet) message(sprintf("Added %s: %d passages (id %s).%s", basename(path), nrow(new), id,
                              if (isTRUE(parsed$truncated)) sprintf(" Only the first %d rows were read.", COMPANION_KB_LIMITS$table_rows) else ""))
  invisible(as.list(rec))
}

companion_kb_remove <- function(which, dir = companion_kb_dir(), quiet = FALSE) {
  m <- companion_kb_sources(dir)
  hit <- m[m$id == which | m$file == which, , drop = FALSE]
  if (!nrow(hit)) stop("No source with that id or file name: ", which, call. = FALSE)
  p <- kb_paths(dir)
  chunks <- kb_read_chunks(p$chunks)
  kb_write_chunks(chunks[!chunks$source_id %in% hit$id, , drop = FALSE], p$chunks)
  kb_write_manifest(m[!m$id %in% hit$id, , drop = FALSE], p$manifest)
  unlink(list.files(p$sources, pattern = paste0("^(", paste(hit$id, collapse = "|"), ")-"), full.names = TRUE))
  if (!quiet) message(sprintf("Removed %d source%s (%d passages).", nrow(hit), if (nrow(hit) == 1L) "" else "s", sum(hit$n_chunks)))
  invisible(hit$id)
}

# Re-read every stored source (for example after the extractor improved).
companion_kb_rebuild <- function(dir = companion_kb_dir(), quiet = FALSE) {
  m <- companion_kb_sources(dir); p <- kb_paths(dir)
  if (!nrow(m)) return(invisible(0L))
  files <- list.files(p$sources, full.names = TRUE)
  rebuilt <- kb_empty_chunks()
  for (i in seq_len(nrow(m))) {
    f <- files[startsWith(basename(files), paste0(m$id[i], "-"))]
    if (!length(f)) { warning("Stored file missing for ", m$file[i]); next }
    parsed <- kb_extract_file(f[[1L]], if (identical(m$title[i], tools::file_path_sans_ext(m$file[i]))) NULL else m$title[i])
    tags <- strsplit(m$tags[i], ";", fixed = TRUE)[[1L]]
    new <- kb_build_chunks(parsed, m$id[i], m$file[i], m$audience[i], tags, "library")
    m$n_chunks[i] <- nrow(new); rebuilt <- rbind(rebuilt, new)
  }
  kb_write_chunks(rebuilt, p$chunks); kb_write_manifest(m, p$manifest)
  if (!quiet) message(sprintf("Rebuilt %d passages from %d sources.", nrow(rebuilt), nrow(m)))
  invisible(nrow(rebuilt))
}

# ---- Loading and index ----------------------------------------------------------
.kb_cache <- new.env(parent = emptyenv())

kb_signature <- function(files) {
  info <- file.info(files)
  paste(files, info$mtime, info$size, collapse = "|")
}

kb_build_index <- function(chunks) {
  n <- nrow(chunks)
  toks <- lapply(seq_len(n), function(i) kb_tokens(c(chunks$title[i], chunks$section[i], chunks$section[i], chunks$text[i])))
  lens <- lengths(toks)
  ids <- rep(seq_len(n), lens)
  list(chunks = chunks, N = n, len = lens, avglen = if (n) mean(lens) else 0,
       postings = split(ids, unlist(toks)), sets = lapply(toks, unique))
}

# Seed + library, indexed. Cached until a file changes.
companion_kb_load <- function(dir = companion_kb_dir(), seed_dir = companion_kb_seed_dir(), force = FALSE) {
  seed_files <- if (dir.exists(seed_dir)) list.files(seed_dir, pattern = "\\.md$", full.names = TRUE) else character()
  p <- kb_paths(dir)
  sig <- kb_signature(c(seed_files, if (file.exists(p$chunks)) p$chunks))
  key <- paste(normalizePath(dir, mustWork = FALSE), normalizePath(seed_dir, mustWork = FALSE))
  if (!force && identical(.kb_cache$key, key) && identical(.kb_cache$sig, sig) && !is.null(.kb_cache$kb)) return(.kb_cache$kb)
  seed <- kb_empty_chunks()
  for (f in seed_files) {
    parsed <- kb_extract_file(f)
    stem <- tools::file_path_sans_ext(basename(f))
    seed <- rbind(seed, kb_build_chunks(parsed, paste0("seed-", stem), basename(f), "all", character(), "seed"))
  }
  chunks <- rbind(seed, kb_read_chunks(p$chunks))
  kb <- kb_build_index(chunks)
  .kb_cache$key <- key; .kb_cache$sig <- sig; .kb_cache$kb <- kb
  kb
}

# ---- Search: BM25 with strict abstention --------------------------------------
# A passage is eligible only when it holds at least `min_coverage` of the question's content
# terms (terms the base has never seen count against it) and one of the matched terms is
# specific rather than everywhere. Anything weaker is "no information".
companion_kb_search <- function(question, kb = companion_kb_load(), audience = companion_kb_audience(), k = 3L,
                                min_coverage = as.numeric(Sys.getenv("LIPIDOMIC_KB_MIN_COVERAGE", unset = "0.5")),
                                min_weighted = as.numeric(Sys.getenv("LIPIDOMIC_KB_MIN_WEIGHTED", unset = "0.6")),
                                k1 = 1.5, b = 0.75) {
  none <- list(hits = data.frame(index = integer(), score = numeric(), coverage = numeric(), weighted = numeric()), terms = character(), unknown = character())
  q <- unique(kb_tokens(question))
  allowed <- which(kb$chunks$audience %in% c("all", audience))
  if (!length(q) || !length(allowed)) return(c(none, list(terms = q)))
  Na <- length(allowed); N <- kb$N
  mask <- logical(N); mask[allowed] <- TRUE
  score <- numeric(N); matched <- integer(N); specific <- logical(N); unknown <- character()
  idf_hit <- numeric(N); idf_all <- 0
  for (t in q) {
    ids <- kb$postings[[t]]
    ids <- if (is.null(ids)) integer() else ids[mask[ids]]
    df <- length(unique(ids))
    if (df == 0L) { unknown <- c(unknown, t); idf_all <- idf_all + 0.5 * log(1 + (Na + 0.5) / 0.5); next }
    idf <- log(1 + (Na - df + 0.5) / (df + 0.5))
    idf_all <- idf_all + idf
    tf <- tabulate(ids, nbins = N)
    hit <- tf > 0L
    score <- score + ifelse(hit, idf * tf * (k1 + 1) / (tf + k1 * (1 - b + b * kb$len / max(kb$avglen, 1))), 0)
    matched <- matched + as.integer(hit)
    idf_hit <- idf_hit + ifelse(hit, idf, 0)
    if (Na < 10L || df / Na <= 0.6) specific <- specific | hit
  }
  # Two tests, both must pass: enough of the question's terms are present, and the terms that
  # are present carry enough of the question's weight (rare words count more than common ones;
  # a word the base has never seen counts as the rarest).
  coverage <- matched / length(q)
  weighted <- idf_hit / idf_all
  ok <- mask & coverage >= min_coverage & weighted >= min_weighted & specific & score > 0
  # A question that asks for a quantity ("how many", "what is the p-value") can only be answered by
  # a passage that holds a number; general prose about the topic does not answer it.
  if (grepl("^(how (many|much|large|big|long|often)|what (is|are) the (number|count|total|value|values|p.?value|mean|median|average|percentage|percent|size|rate))\\b",
            tolower(trimws(question)))) {
    has_number <- grepl("(^|[^A-Za-z0-9.])[0-9]+([.,][0-9]+)?([^A-Za-z0-9]|$)", kb$chunks$text) |
      grepl("\\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\\b", tolower(kb$chunks$text))
    ok <- ok & has_number
  }
  if (!any(ok)) return(c(none, list(terms = q, unknown = unknown)))
  cand <- which(ok); cand <- cand[order(-score[cand], -coverage[cand], cand)]
  keep <- integer()
  for (i in cand) {
    if (score[i] < 0.4 * score[cand[1L]]) break
    dup <- any(vapply(keep, function(j) { a <- kb$sets[[i]]; c2 <- kb$sets[[j]]; length(intersect(a, c2)) / max(1L, length(union(a, c2))) >= 0.5 }, logical(1)))
    if (!dup) keep <- c(keep, i)
    if (length(keep) >= k) break
  }
  list(hits = data.frame(index = keep, score = score[keep], coverage = coverage[keep], weighted = weighted[keep]), terms = q, unknown = unknown)
}

kb_citation <- function(row) {
  paste0("— Source: ", row$source,
         if (nzchar(row$section) && !identical(row$section, row$title)) paste0(" · ", row$section) else "",
         if (!is.na(row$page)) paste0(" · p. ", row$page) else "")
}

kb_compose <- function(rows) {
  paste(vapply(seq_len(nrow(rows)), function(i) paste0(rows$text[i], "\n", kb_citation(rows[i, , drop = FALSE])), ""), collapse = "\n\n")
}

kb_no_info <- function() list(found = FALSE, text = COMPANION_KB_NO_INFO, source = "Knowledge base · no matching source",
                              passages = kb_empty_chunks())

# The answer: verbatim passages with their sources, or COMPANION_KB_NO_INFO. Never anything else.
companion_kb_answer <- function(question, kb = companion_kb_load(), audience = companion_kb_audience(), k = 3L) {
  if (!is.character(question) || length(question) != 1L || is.na(question) || !nzchar(trimws(question)) || nchar(question) > 600L) return(kb_no_info())
  s <- companion_kb_search(question, kb, audience, k)
  if (!nrow(s$hits)) return(kb_no_info())
  rows <- kb$chunks[s$hits$index, , drop = FALSE]
  list(found = TRUE, text = kb_compose(rows),
       source = sprintf("Knowledge base · %d passage%s", nrow(rows), if (nrow(rows) == 1L) "" else "s"), passages = rows)
}

# Exact lookup by tag, for fixed contexts such as "step-3". Same output format.
companion_kb_by_tag <- function(tag, kb = companion_kb_load(), audience = companion_kb_audience()) {
  tag <- tolower(tag)
  has <- vapply(strsplit(kb$chunks$tags, ";", fixed = TRUE), function(x) tag %in% x, logical(1))
  rows <- kb$chunks[has & kb$chunks$audience %in% c("all", audience), , drop = FALSE]
  if (!nrow(rows)) return(kb_no_info())
  list(found = TRUE, text = kb_compose(rows), source = sprintf("Knowledge base · %s", tag), passages = rows)
}
