# Team SCIEX import (R/frontends/team/sciex_import.R): golden tests.
# Rscript tests/team-ux/test_sciex_import.R   (from the repository root)
#
# Fixtures (tests/team-ux/fixtures/sciex/) follow the documented layouts; no real SCIEX file is
# in the repository:
# - sciex7500_wide_example.txt: SCIEX 7500 results export (line 1 Sample Name + sample IDs,
#   line 2 Sample Type, then one row per component with adduct suffix; N/A for missing; internal
#   standards end in "_Ultimate_SPLASH_ONE.IS").
# - sciex_long_results_example.txt: Results Table (one row per sample x component).
# Optional real data: TEAM_PAULA_XLSX=/path/to/"2026_6-2-2026_UB_Ruth M Sickle Cell ... SL LAB.xlsx"
# (Paula's 67-sample matrix). It is turned into a SCIEX 7500-style wide export and a long
# Results Table, and both must load identical() to the matrix. Without it those cases are skipped.
# Optional: TEAM_SCIEX_REAL=/path/to/a real SCIEX export (byte-identity and parse counts only).
suppressPackageStartupMessages({ library(shiny); library(readxl); library(dplyr) })
source("R/frontends/team/upload_formats.R") # team_upload_has_nul (bootstrap sources it before sciex_import.R)
source("R/frontends/team/sciex_import.R")

passed <- 0L
check <- function(label, ok) {
  if (!isTRUE(ok)) stop("FAILED: ", label, call. = FALSE)
  passed <<- passed + 1L
  cat("ok  ", label, "\n")
}
tmp <- tempfile("sciex-"); dir.create(tmp)
fx <- "tests/team-ux/fixtures/sciex"
wide_fx <- file.path(fx, "sciex7500_wide_example.txt")
long_fx <- file.path(fx, "sciex_long_results_example.txt")

# The shared module's CSV abundance reader, as in R/modules/1_shared_data_module.R (rawData,
# ftype "global" and .csv: read.csv + Lipid_Name, then every sample column as.numeric).
app_csv_reader <- function(fp) {
  df <- read.csv(fp, check.names = FALSE)
  if (!"Lipid_Name" %in% names(df)) names(df)[1] <- "Lipid_Name"
  df[setdiff(names(df), "Lipid_Name")] <- suppressWarnings(lapply(df[setdiff(names(df), "Lipid_Name")], as.numeric))
  df
}
app_matrix <- function(fp) { d <- app_csv_reader(fp); m <- as.matrix(d[-1]); rownames(m) <- d$Lipid_Name; m }
# The shared type detector's mediator signature (detect_file_type): must not fire on our output.
mediator_signature <- function(fp) any(c("PGD2", "PGE2", "LXA4", "RvD1", "Maresin", "TXB2") %in% names(read.csv(fp, nrows = 5, check.names = FALSE)))
csv_cells <- function(fp) unname(as.list(read.csv(fp, header = FALSE, colClasses = "character", na.strings = character(), check.names = FALSE)))
tsv_cells <- function(fp) unname(as.list(read.table(fp, sep = "\t", header = FALSE, colClasses = "character", na.strings = character(), quote = "\"", comment.char = "", check.names = FALSE)))
write_tsv <- function(columns, path, sep = "\t", eol = "\r\n") {
  rows <- do.call(paste, c(columns, sep = sep))
  con <- file(path, "wb"); on.exit(close(con)); writeBin(charToRaw(enc2utf8(paste0(paste(rows, collapse = eol), eol))), con)
  path
}
convert <- function(path, ...) { out <- tempfile(tmpdir = tmp, fileext = ".csv"); r <- team_sciex_convert(path, basename(path), out, ...); r$path }
refused <- function(path, ...) tryCatch({ convert(path, ...); "" }, error = conditionMessage)
missing_text <- function(x) toupper(trimws(x)) %in% c("", "NA", "N/A", "NO PEAK")

# Byte identity: every cell of the converted .csv is the export's text, N/A written empty.
wide_byte_identical <- function(src, out, keep_samples = NULL, keep_components = NULL) {
  a <- tsv_cells(src); b <- csv_cells(out)
  samples <- vapply(a[-1], `[`, character(1), 1L); comps <- a[[1]][-(1:2)]
  ks <- if (is.null(keep_samples)) seq_along(samples) else match(keep_samples, samples)
  kc <- if (is.null(keep_components)) seq_along(comps) else match(keep_components, comps)
  expect <- c(list(c("Lipid_Name", comps[kc])), lapply(ks, function(k) {
    v <- a[[k + 1L]][-(1:2)][kc]; v[missing_text(v)] <- ""; c(samples[k], v)
  }))
  identical(b, expect)
}

# Lipid names: the shared parser (R/global.R parse_lipid_names_bulk), loaded read-only.
# global.R's parse_lipid_names_bulk calls the shared hook point (identity unless Team registers one).
source("R/core/hooks.R")
parser_env <- local({
  env <- new.env(parent = globalenv())
  exprs <- parse("R/global.R", keep.source = FALSE)
  # Top-level assignments only (functions and lookup tables); no source(), library() or options().
  for (e in exprs) if (is.call(e) && identical(e[[1]], as.name("<-")) && is.name(e[[2]])) try(eval(e, env), silent = TRUE)
  env
})
parse_counts <- function(names) {
  p <- suppressWarnings(parser_env$parse_lipid_names_bulk(names))
  list(n = nrow(p), parsed = sum(p$parsing_status != "unparsed"), unparsed = sum(p$parsing_status == "unparsed"),
       is = sum(p$is_internal_standard), adduct = sum(!is.na(p$adduct)), status = table(p$parsing_status),
       unparsed_names = p$Lipid_Name[p$parsing_status == "unparsed"], is_names = p$Lipid_Name[p$is_internal_standard])
}

# 1. Wide SCIEX 7500 layout (primary).
how <- team_sciex_detect(wide_fx)
check("wide: detected (Sample Name / Sample Type rows, tab)", identical(how$layout, "wide") && identical(how$sep, "\t"))
ins <- team_sciex_inspect(wide_fx)
check("wide: 5 samples x 7 components", ins$samples == 5L && ins$components == 7L)
check("wide: the Blank is listed, with its type", length(ins$other_samples) == 1L && identical(ins$other_samples[[1]]$sample, "SCD037_C1") && identical(ins$other_samples[[1]]$type, "Blank"))
check("wide: sample type counts shown", identical(vapply(ins$sample_types, `[[`, character(1), "type"), c("Unknown", "Blank")) && identical(vapply(ins$sample_types, `[[`, integer(1), "samples"), c(4L, 1L)))
check("wide: 2 internal standards flagged", ins$standards == 2L && all(grepl("SPLASH_ONE\\.IS$", ins$standard_examples)))
check("wide: N/A cells counted", ins$missing == 10L)
check("wide: no value column choice", is.null(ins$value_columns) && is.null(ins$value))
out <- convert(wide_fx)
check("wide: default keeps everything (blank and standards)", identical(dim(app_matrix(out)), c(7L, 5L)))
check("wide: values byte-identical to the export, N/A written empty", wide_byte_identical(wide_fx, out))
m <- app_matrix(out)
check("wide: N/A reads as NA, numbers as the exact doubles", is.na(m["CE(14:0)+NH4", "SCD021_C1"]) && identical(m["CE(16:1)+NH4", "SCDC018_S1"], 1.5e5) &&
        identical(m["PC(16:0_18:1)+H", "SCDC022_S2"], as.numeric("1234567.89012345")) && all(is.na(m["CL(72:8_18:1)-2H", ])))
check("wide: adduct suffixes kept in the lipid names", identical(rownames(m)[1:3], c("CE(14:0)+NH4", "CE(16:1)+NH4", "PC(16:0_18:1)+H")))
expected_csv <- file.path(tmp, "expected.csv")
writeLines(c("Lipid_Name,SCDC018_S1,SCD021_C1,SCD037_C1,SCD040_P2,SCDC022_S2",
             "CE(14:0)+NH4,12345.6,,,9876.54321,0.000123", "CE(16:1)+NH4,1.5E+05,23456,,34567.8,45678",
             "PC(16:0_18:1)+H,2.5e-3,7,,,1234567.89012345", "TG(16:0_18:1_18:2)+NH4,100,200,3,400,500",
             "CL(72:8_18:1)-2H,,,,,", "PC(15:0-18:1(d7))_Ultimate_SPLASH_ONE.IS,50000,51000,49000,50500,50250",
             "CE(18:1(d7))_Ultimate_SPLASH_ONE.IS,8000,8100,7900,8050,8020"), expected_csv)
check("wide: loads identical() to the same matrix typed as a wide .csv", identical(app_csv_reader(out), app_csv_reader(expected_csv)))
check("wide: output is not mistaken for a mediator file", !mediator_signature(out))
out_b <- convert(wide_fx, exclude_other_types = TRUE)
check("wide: excluding non-Unknown drops only the Blank", identical(colnames(app_matrix(out_b)), c("SCDC018_S1", "SCD021_C1", "SCD040_P2", "SCDC022_S2")) &&
        wide_byte_identical(wide_fx, out_b, keep_samples = c("SCDC018_S1", "SCD021_C1", "SCD040_P2", "SCDC022_S2")))
out_s <- convert(wide_fx, exclude_standards = TRUE)
check("wide: excluding internal standards drops the 2 .IS rows only", identical(rownames(app_matrix(out_s)), rownames(m)[1:5]))
check("wide: a value column cannot be chosen", grepl("no value column to choose", refused(wide_fx, value = "Area")))
# A NUL byte inside a measurement cell would be cut there by read.table(): the file is refused instead.
nul_fx <- file.path(tmp, "nul.txt"); lines <- readLines(wide_fx); bytes <- charToRaw(paste0(paste(lines, collapse = "\n"), "\n"))
last_tab <- max(which(bytes == as.raw(9))); writeBin(c(bytes[seq_len(last_tab + 1L)], as.raw(0), charToRaw("9"), bytes[-seq_len(last_tab + 1L)]), nul_fx)
check("wide: a NUL byte inside a cell refuses the file", grepl("NUL bytes", refused(nul_fx)))
pc <- parse_counts(rownames(m))
cat(sprintf("     fixture lipid names: %d parsed, %d unparsed; parser flags %d as internal standard, %d with adduct\n", pc$parsed, pc$unparsed, pc$is, pc$adduct))
check("wide: shared parser reads the adduct suffixes", pc$adduct >= 5L)

# Same layout, other encodings/line ends/delimiter.
cells_w <- tsv_cells(wide_fx)
lf <- write_tsv(cells_w, file.path(tmp, "lf.txt"), eol = "\n")
check("wide: LF line ends load identical()", identical(app_csv_reader(convert(lf)), app_csv_reader(out)))
u16 <- file.path(tmp, "u16.txt"); txt <- paste0(paste(do.call(paste, c(cells_w, sep = "\t")), collapse = "\r\n"), "\r\n")
con <- file(u16, "wb"); writeBin(as.raw(c(0xFF, 0xFE)), con); writeBin(iconv(txt, "UTF-8", "UTF-16LE", toRaw = TRUE)[[1]], con); close(con)
check("wide: UTF-16LE export (BOM) loads identical()", identical(app_csv_reader(convert(u16)), app_csv_reader(out)))
bom <- file.path(tmp, "bom.txt"); con <- file(bom, "wb"); writeBin(as.raw(c(0xEF, 0xBB, 0xBF)), con); writeBin(charToRaw(txt), con); close(con)
check("wide: UTF-8 BOM loads identical()", identical(app_csv_reader(convert(bom)), app_csv_reader(out)))
trail <- write_tsv(lapply(c(cells_w, list(rep("", length(cells_w[[1]])))), identity), file.path(tmp, "trail.txt"))
check("wide: a trailing empty column (trailing tabs) is ignored", identical(app_csv_reader(convert(trail)), app_csv_reader(out)))
commas <- write_tsv(cells_w, file.path(tmp, "comma.csv"), sep = ",")
check("wide: comma-separated copy loads identical()", identical(team_sciex_detect(commas)$sep, ",") && identical(app_csv_reader(convert(commas)), app_csv_reader(out)))

# 2. Wide refusals: no silent NA, no silent duplicates.
edit_w <- function(name, f) { x <- cells_w; x <- f(x); write_tsv(x, file.path(tmp, name)) }
msg <- refused(edit_w("dc.txt", function(x) { x[[2]][3] <- "12345,6"; x }))
check("wide: decimal comma refused, naming sample, component and line", grepl("\"12345,6\" for sample \"SCDC018_S1\", component \"CE(14:0)+NH4\" (line 3)", msg, fixed = TRUE) && grepl("decimal comma", msg))
check("wide: \"<LOQ\" refused", grepl("is not a number", refused(edit_w("loq.txt", function(x) { x[[3]][4] <- "<LOQ"; x }))))
check("wide: \"No Peak\" and \"NA\" read as missing", { p <- edit_w("np.txt", function(x) { x[[2]][3] <- "No Peak"; x[[3]][4] <- "NA"; x }); mm <- app_matrix(convert(p)); is.na(mm[1, 1]) && is.na(mm[2, 2]) })
check("wide: duplicate sample name refused", grepl("\"SCD021_C1\" appears more than once", refused(edit_w("ds.txt", function(x) { x[[4]][1] <- "SCD021_C1"; x })), fixed = TRUE))
check("wide: duplicate component refused (two values for one sample x component)", grepl("component \"CE(14:0)+NH4\" appears more than once", refused(edit_w("dcmp.txt", function(x) { x[[1]][4] <- "CE(14:0)+NH4"; x })), fixed = TRUE))
check("wide: empty component name refused", grepl("has no name", refused(edit_w("ec.txt", function(x) { x[[1]][5] <- ""; x }))))
check("wide: empty sample name refused", grepl("has no Sample Name", refused(edit_w("es.txt", function(x) { x[[3]][1] <- ""; x }))))
check("wide: mediator-like sample name refused", grepl("sample named \"PGE2\"", refused(edit_w("med.txt", function(x) { x[[3]][1] <- "PGE2"; x })), fixed = TRUE))
short <- file.path(tmp, "short.txt"); writeLines(c(readLines(wide_fx)[1:4], "PC(16:0_18:1)+H\t1\t2"), short)
check("wide: a cut row (fewer cells than the header) refused", grepl("export looks cut", refused(short)))
long_row <- file.path(tmp, "longrow.txt"); writeLines(c(readLines(wide_fx)[1:3], "CE(16:1)+NH4\t1\t2\t3\t4\t5\t6"), long_row)
check("wide: a row with an extra value refused", grepl("more cells than the header", refused(long_row)))
check("wide: only Blank samples left refused", grepl("no Unknown samples", refused(edit_w("allblank.txt", function(x) { for (k in 2:6) x[[k]][2] <- "Blank"; x }), exclude_other_types = TRUE)))
big <- file.path(tmp, "big.txt"); con <- file(big, "wb"); writeBin(charToRaw(paste0(readLines(wide_fx)[1:2], collapse = "\n")), con); writeBin(raw(team_sciex_max_bytes), con); close(con)
check("size cap: over 50 MB refused", grepl("larger than 50 MB", refused(big)))
old_raw <- team_sciex_max_raw_cells; team_sciex_max_raw_cells <- 20
check("raw cell cap: refused before the table is read", grepl("more than 20 cells", refused(wide_fx)))
team_sciex_max_raw_cells <- old_raw
old_cols <- team_sciex_max_columns; team_sciex_max_columns <- 4
check("column cap: refused before the table is read", grepl("more than 4 columns", refused(wide_fx)))
team_sciex_max_columns <- old_cols
plain <- file.path(tmp, "plain.txt"); writeLines(c("Lipid\tS1", "PC(1)\t1"), plain)
check("not SCIEX: plain table not detected", is.null(team_sciex_detect(plain)))
check("not SCIEX: refused with a clear message", grepl("is not a SCIEX results export", refused(plain)))
xlsx_like <- file.path(tmp, "paula_like.txt"); writeLines(c("Sample Name\tA\tB", "CE(14:0)+NH4\t1\t2"), xlsx_like)
check("not SCIEX: a wide matrix without a Sample Type row is left alone", is.null(team_sciex_detect(xlsx_like)))

# 3. Long Results Table (secondary).
how <- team_sciex_detect(long_fx)
check("long: detected", identical(how$layout, "long"))
li <- team_sciex_inspect(long_fx)
check("long: 4 samples x 3 components", li$samples == 4L && li$components == 3L)
check("long: value columns offered, default Calculated Concentration (units in header)", identical(li$value, "Calculated Concentration (ng/mL)") &&
        identical(vapply(li$value_columns, `[[`, character(1), "column"), c("Area", "Height", "Calculated Concentration (ng/mL)")))
check("long: sample types counted", identical(vapply(li$sample_types, `[[`, integer(1), "samples"), c(2L, 1L, 1L)) && length(li$other_samples) == 2L)
check("long: internal standard flagged", li$standards == 1L)
la <- app_matrix(convert(long_fx, value = "Area"))
check("long: Area pivots to components x samples", identical(dimnames(la), list(c("PC(16:0_18:1)+H", "CE(14:0)+NH4", "PC(15:0-18:1(d7))_Ultimate_SPLASH_ONE.IS"), c("S01", "S02", "Blank 1", "QC 1"))))
check("long: No Peak / N/A and absent rows read as NA", is.na(la["CE(14:0)+NH4", "S01"]) && is.na(la["PC(16:0_18:1)+H", "Blank 1"]) && is.na(la[3, "QC 1"]))
check("long: values exact", identical(la["PC(16:0_18:1)+H", "S02"], 25000) && identical(la["CE(14:0)+NH4", "Blank 1"], 12))
lc <- app_matrix(convert(long_fx))
check("long: default value column used when none chosen", identical(lc["PC(16:0_18:1)+H", "S02"], 6.5))
check("long: Unknown only", identical(colnames(app_matrix(convert(long_fx, value = "Area", exclude_other_types = TRUE))), c("S01", "S02")))
check("long: unknown value column refused", grepl("no value column \"Volume\"", refused(long_fx, value = "Volume"), fixed = TRUE))
lcells <- tsv_cells(long_fx)
edit_l <- function(name, f) write_tsv(f(lcells), file.path(tmp, name))
check("long: duplicate sample x component refused", grepl("sample \"S01\" has more than one row for component \"PC(16:0_18:1)+H\"", refused(edit_l("ldup.txt", function(x) { x[[4]][3] <- "PC(16:0_18:1)+H"; x }), value = "Area"), fixed = TRUE))
check("long: decimal comma refused", grepl("decimal comma", refused(edit_l("ldc.txt", function(x) { x[[6]][2] <- "12345,6"; x }), value = "Area")))
check("long: one sample with two Sample Types refused", grepl("more than one Sample Type", refused(edit_l("ltype.txt", function(x) { x[[3]][3] <- "Blank"; x }), value = "Area")))
check("long: comma-delimited .csv copy loads identical()", identical(app_csv_reader(convert(write_tsv(lcells, file.path(tmp, "long.csv"), sep = ","), value = "Area")), app_csv_reader(convert(long_fx, value = "Area"))))
pre <- file.path(tmp, "preamble.txt"); writeLines(c("Results exported by SCIEX OS", "", readLines(long_fx)), pre)
check("long: preamble lines before the header skipped", identical(app_csv_reader(convert(pre, value = "Area")), app_csv_reader(convert(long_fx, value = "Area"))))
old_cap <- team_sciex_max_cells; team_sciex_max_cells <- 5
check("cell cap: a pivot over the cap refused", grepl("would make a matrix", refused(long_fx, value = "Area")))
team_sciex_max_cells <- old_cap
check("csv name", identical(team_sciex_csv_name("run 7.txt", "Calculated Concentration (ng/mL)"), "run 7 (SCIEX Calculated Concentration).csv") && identical(team_sciex_csv_name("x.txt"), "x (SCIEX).csv"))

# Server flow (hidden inbox): inspect, then convert with the user's choices; files served once.
sent <- list(); objs <- list()
shiny::testServer(function(input, output, session) {
  session$sendCustomMessage <- function(type, message) sent[[length(sent) + 1L]] <<- list(type = type, message = message)
  session$registerDataObj <- function(name, data, filter) { objs[[name]] <<- list(data = data, filter = filter); paste0("session/x/dataobj/", name) }
  team_sciex_server(input, session)
}, {
  up <- file.path(tmp, "upload-1.txt"); file.copy(wide_fx, up)
  session$setInputs(team_sciex_test_start = TRUE) # first flush: observers initialised (ignoreInit), as at session start
  session$setInputs(team_sciex_inbox = data.frame(name = "sciex-1-1__run.txt", size = file.size(up), type = "text/plain", datapath = up, stringsAsFactors = FALSE))
  m1 <- sent[[length(sent)]]$message
  check("server: inspect answers with the summary", identical(m1$stage, "inspect") && identical(m1$batch, "sciex-1-1") && length(m1$errors) == 0L && m1$files[[1]]$samples == 5L)
  session$setInputs(team_sciex_convert = list(batch = "sciex-1-1", files = list(list(name = "run.txt", value = "", excludeOtherTypes = TRUE, excludeStandards = FALSE)), n = 1))
  m2 <- sent[[length(sent)]]$message
  check("server: convert answers with one served .csv", identical(m2$stage, "convert") && length(m2$errors) == 0L && identical(m2$files[[1]]$name, "run (SCIEX).csv") && m2$files[[1]]$excludedSamples == 1L && nzchar(m2$files[[1]]$url))
  check("server: the uploaded export is removed after conversion", !file.exists(up))
  o <- objs[[sub(".*/", "", m2$files[[1]]$url)]]; served <- o$data$path
  check("server: the served .csv is the conversion (Blank left out)", identical(colnames(app_matrix(served)), c("SCDC018_S1", "SCD021_C1", "SCD040_P2", "SCDC022_S2")))
  r1 <- o$filter(o$data, NULL)
  check("server: the .csv is served once, then gone", r1$status == 200L && identical(r1$content$owned, TRUE) && { unlink(served); o$filter(o$data, NULL)$status == 404L })
  session$setInputs(team_sciex_convert = list(batch = "sciex-1-1", files = list(list(name = "run.txt")), n = 2))
  check("server: a batch converts once", grepl("no longer on the server", sent[[length(sent)]]$message$errors[[1]]$message))
  bad <- file.path(tmp, "upload-2.txt"); writeLines(c(readLines(wide_fx)[1:2], "CE(14:0)+NH4	1,5	2	3	4	5"), bad)
  session$setInputs(team_sciex_inbox = data.frame(name = "sciex-2-1__bad.txt", size = file.size(bad), type = "text/plain", datapath = bad, stringsAsFactors = FALSE))
  check("server: inspect accepts the file; the decimal comma is refused at convert", length(sent[[length(sent)]]$message$errors) == 0L)
  session$setInputs(team_sciex_convert = list(batch = "sciex-2-1", files = list(list(name = "bad.txt")), n = 3))
  m3 <- sent[[length(sent)]]$message
  check("server: refusal reported, nothing served", length(m3$errors) == 1L && grepl("decimal comma", m3$errors[[1]]$message) && is.null(m3$files))
  up3 <- file.path(tmp, "upload-3.txt"); file.copy(wide_fx, up3)
  session$setInputs(team_sciex_inbox = data.frame(name = "sciex-3-1__run.txt", size = file.size(up3), type = "text/plain", datapath = up3, stringsAsFactors = FALSE))
  session$setInputs(team_sciex_convert = list(batch = "sciex-3-1", cancel = TRUE, n = 4))
  check("server: cancel removes the held upload", !file.exists(up3))
  up4 <- file.path(tmp, "upload-4.txt"); file.copy(wide_fx, up4); n_sent <- length(sent)
  session$setInputs(team_sciex_convert = list(batch = "sciex-4-1", cancel = TRUE, n = 5))
  session$setInputs(team_sciex_inbox = data.frame(name = "sciex-4-1__run.txt", size = file.size(up4), type = "text/plain", datapath = up4, stringsAsFactors = FALSE))
  check("server: an upload arriving after its batch was cancelled is discarded, no answer", !file.exists(up4) && length(sent) == n_sent)
  # A times out (cancelled), B starts, then A's upload arrives: A is discarded, B unaffected.
  upa <- file.path(tmp, "upload-a.txt"); file.copy(wide_fx, upa); upb <- file.path(tmp, "upload-b.txt"); file.copy(long_fx, upb)
  session$setInputs(team_sciex_convert = list(batch = "sciex-6-1", cancel = TRUE, n = 8))
  session$setInputs(team_sciex_inbox = data.frame(name = "sciex-7-1__run.txt", size = file.size(upb), type = "text/plain", datapath = upb, stringsAsFactors = FALSE))
  mb <- sent[[length(sent)]]$message; n_b <- length(sent)
  session$setInputs(team_sciex_inbox = data.frame(name = "sciex-6-1__run.txt", size = file.size(upa), type = "text/plain", datapath = upa, stringsAsFactors = FALSE))
  check("server: late upload of a cancelled batch is not taken for the newer batch", identical(mb$batch, "sciex-7-1") && identical(mb$files[[1]]$layout, "long") && length(sent) == n_b && !file.exists(upa) && file.exists(upb))
  session$setInputs(team_sciex_convert = list(batch = "sciex-7-1", cancel = TRUE, n = 9))
  check("server: an upload without a batch tag is discarded", { upx <- file.path(tmp, "upload-x.txt"); file.copy(wide_fx, upx); n0 <- length(sent)
    session$setInputs(team_sciex_inbox = data.frame(name = "run.txt", size = 1, type = "text/plain", datapath = upx, stringsAsFactors = FALSE)); !file.exists(upx) && length(sent) == n0 })
  up5 <- file.path(tmp, "upload-5.txt"); file.copy(wide_fx, up5)
  session$setInputs(team_sciex_inbox = data.frame(name = "sciex-5-1__run.txt", size = file.size(up5), type = "text/plain", datapath = up5, stringsAsFactors = FALSE))
  session$setInputs(team_sciex_convert = list(batch = "sciex-5-1", files = list(list(name = "run.txt")), n = 6))
  made5 <- objs[[sub(".*/", "", sent[[length(sent)]]$message$files[[1]]$url)]]$data$path
  session$setInputs(team_sciex_convert = list(batch = "sciex-5-1", cancel = TRUE, n = 7))
  check("server: cancel after conversion (fetch failed) removes the unfetched .csv", !file.exists(made5))
})

# 4. Real matrix: Paula's 67 samples, as a SCIEX 7500 export and as a long Results Table.
#    Round trip: the converted .csv and the original wide .csv load identical() through the app reader.
xlsx <- Sys.getenv("TEAM_PAULA_XLSX")
if (nzchar(xlsx) && file.exists(xlsx)) {
  mat <- as.data.frame(read_excel(xlsx, na = c("", "N/A")), check.names = FALSE); names(mat)[1] <- "Lipid_Name"
  wide_csv <- file.path(tmp, "abundance_all.csv"); write.csv(mat, wide_csv, row.names = FALSE, na = "")
  cells <- csv_cells(wide_csv)
  samples <- vapply(cells[-1], `[`, character(1), 1L); comps <- cells[[1]][-1]
  cat(sprintf("     Paula matrix: %d lipids x %d samples\n", length(comps), length(samples)))
  # SCIEX 7500 export: Sample Name row, Sample Type row (one sample marked Blank), N/A for
  # missing, plus internal-standard rows at the end.
  types <- rep("Unknown", length(samples)); types[37] <- "Blank"
  is_rows <- c("PC(15:0-18:1(d7))_Ultimate_SPLASH_ONE.IS", "CE(18:1(d7))_Ultimate_SPLASH_ONE.IS", "TG(15:0-18:1(d7)-15:0)_Ultimate_SPLASH_ONE.IS")
  sciex <- c(list(c("Sample Name", "Sample Type", comps, is_rows)),
             lapply(seq_along(samples), function(k) { v <- cells[[k + 1L]][-1]; v[v == ""] <- "N/A"; c(samples[k], types[k], v, as.character(50000 + k + 0:2)) }))
  sx <- write_tsv(sciex, file.path(tmp, "paula_sciex7500.txt"))
  cat(sprintf("     SCIEX-style file: %d lines, %d N/A cells\n", length(readLines(sx)), sum(unlist(sciex) == "N/A")))
  pi <- team_sciex_inspect(sx)
  check("Paula SCIEX: 67 samples, the Blank listed, 3 internal standards", pi$samples == 67L && length(pi$other_samples) == 1L && identical(pi$other_samples[[1]]$sample, samples[37]) && pi$standards == 3L)
  conv <- convert(sx, exclude_standards = TRUE)
  check("Paula SCIEX round trip: identical() to the original wide .csv (app reader)", identical(app_csv_reader(conv), app_csv_reader(wide_csv)))
  check("Paula SCIEX round trip: matrix identical()", identical(app_matrix(conv), app_matrix(wide_csv)))
  check("Paula SCIEX: values byte-identical, N/A empty", wide_byte_identical(sx, conv, keep_components = comps))
  # The workbook's doubles: the export text (write.csv, 15 significant digits) is what the
  # shared reader would read from any .csv, so the match is to 15 digits, not bit for bit.
  num <- as.matrix(mat[-1]); rownames(num) <- mat$Lipid_Name; got <- app_matrix(conv)
  check("Paula SCIEX: same NA pattern as the workbook, values equal to 15 significant digits",
        identical(is.na(got), is.na(num)) && max(abs(got - num) / pmax(abs(num), 1e-300), na.rm = TRUE) < 1e-14)
  check("Paula SCIEX: keeping standards adds exactly the 3 IS rows", identical(app_matrix(convert(sx))[seq_along(comps), , drop = FALSE], app_matrix(wide_csv)) && nrow(app_matrix(convert(sx))) == length(comps) + 3L)
  check("Paula SCIEX: excluding the Blank drops that one column", identical(app_matrix(convert(sx, exclude_other_types = TRUE, exclude_standards = TRUE)), app_matrix(wide_csv)[, -37]))
  # Long Results Table melted from the same matrix (sample-major, as SCIEX writes it).
  long <- list(rep(samples, each = length(comps)), rep(types, each = length(comps)), rep(comps, length(samples)),
               unlist(lapply(cells[-1], function(v) { v <- v[-1]; v[v == ""] <- "N/A"; v }), use.names = FALSE))
  long <- lapply(seq_along(long), function(i) c(c("Sample Name", "Sample Type", "Component Name", "Area")[i], long[[i]]))
  lp <- write_tsv(long, file.path(tmp, "paula_long.txt"))
  lconv <- convert(lp, value = "Area")
  check("Paula long round trip: pivot(long) identical() to the original wide .csv (app reader)", identical(app_csv_reader(lconv), app_csv_reader(wide_csv)))
  check("Paula long round trip: matrix identical()", identical(app_matrix(lconv), app_matrix(wide_csv)))
  pc <- parse_counts(c(comps, is_rows))
  cat(sprintf("     Paula lipid names (%d): %d parsed, %d unparsed; parser flags %d internal standards, %d with adduct\n", pc$n, pc$parsed, pc$unparsed, pc$is, pc$adduct))
  print(pc$status)
  if (pc$unparsed) cat("     unparsed:", utils::head(pc$unparsed_names, 15), sep = "\n       ")
  cat("     parser IS flags on the .IS rows:", sum(is_rows %in% pc$is_names), "of", length(is_rows), "\n")
} else cat("skip: TEAM_PAULA_XLSX not set (real-matrix round trips)\n")

real <- Sys.getenv("TEAM_SCIEX_REAL")
if (nzchar(real) && file.exists(real)) {
  ri <- team_sciex_inspect(real)
  cat(sprintf("     real export: %s layout, %d samples x %d components, %d non-Unknown, %d standards, %d missing cells\n", ri$layout, ri$samples, ri$components, length(ri$other_samples), ri$standards, ri$missing))
  rc <- convert(real)
  if (identical(ri$layout, "wide")) check("real export: values byte-identical, N/A empty", wide_byte_identical(real, rc))
  comps <- rownames(app_matrix(rc)); pc <- parse_counts(comps)
  cat(sprintf("     real lipid names (%d): %d parsed, %d unparsed\n", pc$n, pc$parsed, pc$unparsed))
} else cat("skip: TEAM_SCIEX_REAL not set\n")

cat(sprintf("\n%d checks passed\n", passed))
