# Team upload formats (R/frontends/team/upload_formats.R): golden tests.
# Rscript tests/team-ux/test_upload_formats.R   (from the repository root)
# Optional real data: TEAM_PAULA_CKPT=/path/to/ckpt16.zip (Paula 67-sample checkpoint; its
# data_files/*.xlsx is the abundance workbook). Without it the real-data cases are skipped.
suppressPackageStartupMessages({ library(shiny); library(readxl); library(dplyr) })
source("R/sample_metadata_import.R")
source("R/utils_data.R")
source("R/frontends/team/upload_formats.R")

passed <- 0L
check <- function(label, ok) {
  if (!isTRUE(ok)) stop("FAILED: ", label, call. = FALSE)
  passed <<- passed + 1L
  cat("ok  ", label, "\n")
}
tmp <- tempfile("upload-formats-"); dir.create(tmp)

# The shared module's CSV abundance reader, as in R/modules/1_shared_data_module.R
# (rawData, ftype == "global" and .csv: read.csv + Lipid_Name, then every sample column as.numeric).
app_csv_reader <- function(fp) {
  df <- read.csv(fp, check.names = FALSE)
  if (!"Lipid_Name" %in% names(df)) names(df)[1] <- "Lipid_Name"
  df[setdiff(names(df), "Lipid_Name")] <- suppressWarnings(lapply(df[setdiff(names(df), "Lipid_Name")], as.numeric))
  df
}
app_csv_reader_raw <- function(fp) read.csv(fp, check.names = FALSE)

# Text cells of a CSV (no type conversion), to build .tsv/.txt versions of a fixture.
csv_cells <- function(fp) {
  x <- read.csv(fp, header = FALSE, colClasses = "character", na.strings = character(), check.names = FALSE)
  unname(as.list(x))
}
write_delimited <- function(columns, path, sep, quote_all = FALSE, eol = "\n", bom = FALSE) {
  q <- function(v) {
    needs <- quote_all | grepl(paste0("[\"\r\n", if (sep == "\t") "\t" else sep, "]"), v)
    v[needs] <- paste0("\"", gsub("\"", "\"\"", v[needs], fixed = TRUE), "\"")
    v
  }
  rows <- do.call(paste, c(lapply(columns, q), sep = sep))
  con <- file(path, "wb"); on.exit(close(con))
  if (bom) writeBin(as.raw(c(0xEF, 0xBB, 0xBF)), con)
  writeBin(charToRaw(paste0(paste(rows, collapse = eol), eol)), con)
}
convert <- function(path, name) team_upload_convert_one(path, name)$path

golden_delimited <- function(label, csv) {
  cells <- csv_cells(csv)
  reference <- app_csv_reader(csv); reference_raw <- app_csv_reader_raw(csv)
  variants <- list(
    list("tab .tsv", "x.tsv", "\t", FALSE, "\n", FALSE),
    list("tab .txt, CRLF", "x.txt", "\t", FALSE, "\r\n", FALSE),
    list("tab .tsv, every field quoted", "x.tsv", "\t", TRUE, "\n", FALSE),
    list("semicolon .txt", "x.txt", ";", FALSE, "\n", FALSE),
    list("comma .txt", "x.txt", ",", FALSE, "\n", FALSE))
  for (v in variants) {
    src <- file.path(tmp, paste0(make.names(label), "-", make.names(v[[1]]), "-", v[[2]]))
    write_delimited(cells, src, v[[3]], quote_all = v[[4]], eol = v[[5]], bom = v[[6]])
    out <- convert(src, v[[2]])
    check(sprintf("%s: %s parses identical() to the .csv (app reader)", label, v[[1]]), identical(app_csv_reader(out), reference))
    check(sprintf("%s: %s identical() before numeric coercion", label, v[[1]]), identical(app_csv_reader_raw(out), reference_raw))
  }
}

# 1. Synthetic abundance fixture in the repository.
golden_delimited("synthetic-abundance.csv", "docs/integration/evidence/synthetic-abundance.csv")

# 2. Edge cells: commas, quotes, line breaks, NA text, blanks, spaces, non-ASCII, BOM.
edge <- list(c("Lipid_Name", "PC 16:0/18:1 (α)", "TG(16:0_18:1_18:2), \"ox\"", "SM d18:1/16:0", "Cer;x", "multi\nline"),
             c("S 1", "1.5", "NA", "", " 2.50 ", "1e-3"),
             c("S,2", "-0.000123456789012345678", "NA", "3", "Inf", "007"))
edge_csv <- file.path(tmp, "edge.csv"); write_delimited(edge, edge_csv, ",")
golden_delimited("edge cells", edge_csv)
bom_tsv <- file.path(tmp, "bom.tsv"); write_delimited(edge, bom_tsv, "\t", bom = TRUE)
bom_csv <- file.path(tmp, "bom.csv"); write_delimited(edge, bom_csv, ",", bom = TRUE)
check("UTF-8 BOM: .tsv parses identical() to the same .csv with BOM", identical(app_csv_reader_raw(convert(bom_tsv, "bom.tsv")), app_csv_reader_raw(bom_csv)))

# Values are passed through as text: the converted CSV holds the same cell strings.
src <- file.path(tmp, "bytes.tsv"); write_delimited(edge, src, "\t")
check("cell text unchanged in the converted CSV", identical(csv_cells(convert(src, "bytes.tsv")), lapply(edge, identity)))

refusal <- function(expr) tryCatch({ force(expr); "" }, error = conditionMessage)
separator_refused <- function(msg) grepl("couldn't determine the column separator", msg, fixed = TRUE)

# Header one field shorter than the rows (write.table with row names): read.csv would turn the
# lipid names into row names and the shared reader would relabel the first sample column as
# Lipid_Name, so the strict rule refuses it (the header must have every row's field count).
short <- file.path(tmp, "short.tsv"); writeLines(c("S1\tS2", "PC(1)\t1\t2", "PC(2)\t3\t4"), short)
check("short header (row names) .tsv refused", separator_refused(refusal(convert(short, "short.tsv"))))

# 3. Delimiter detection: strict, whole file, fail closed.
# A delimiter is valid only when the header has >= 2 fields and EVERY record has exactly that
# many fields (quoting as read.csv). .tsv: tab only. .txt: tab, comma, semicolon.
# Tie rule (.txt): exactly one of tab/comma/semicolon must be valid. A tab table whose rows have no
# commas/semicolons (1 field under them: invalid) is read as tab; if comma or semicolon is ALSO
# valid with >= 2 fields on every row, the .txt is ambiguous and refused (.tsv: tab only).
txt <- function(lines, ext = "txt") { p <- tempfile(fileext = paste0(".", ext)); writeLines(lines, p); p }
detect <- function(lines, ext = "txt") team_upload_valid_delimiters(txt(lines, ext), ext)
check("detect tab", identical(detect(c("a\tb\tc", "1\t2\t3")), "\t"))
check("detect comma", identical(detect(c("a,b,c", "1,2,3")), ","))
check("detect semicolon", identical(detect(c("a;b;c", "1;2;3")), ";"))
check("detect tab over commas inside names", identical(detect(c("Lipid\tS1", "TG(16:0,18:1)\t1", "TG(18:0,18:1)\t2")), "\t"))
check("detect ignores delimiters inside quotes", identical(detect(c("\"a;b\",c", "\"1;2\",3")), ","))
check("tie rule: tab valid and comma valid (2 vs 3 fields) -> both, .txt refused", length(detect(c("a,b\tc,d", "x,1\t2,y", "z,3\t4,w"))) == 2L)
check("tie rule: same lines as .tsv -> tab", identical(detect(c("a,b\tc,d", "x,1\t2,y", "z,3\t4,w"), "tsv"), "\t"))
# Codex sol4 (round 4) P1: comma metadata whose Note column holds tabs must not be split at tabs.
cx4 <- c("SampleID,Note\tGroup", "S1,alpha\tA", "S2,beta\tB")
check("sol4 P1: metadata .txt valid as comma AND tab refused", separator_refused(refusal(team_read_sample_metadata_file(txt(cx4), "cx4.txt"))))
check("sol4 P1: same as abundance .txt refused", separator_refused(refusal(convert(txt(cx4), "cx4.txt"))))
check("comma and semicolon both valid -> none chosen", length(detect(c("a;b,c", "1;2,3"))) == 2L)
check("detect: very long single line (whole file read)", {
  p <- file.path(tmp, "long.txt"); writeLines(paste(rep("1.5", 400000), collapse = "\t"), p)
  identical(team_upload_valid_delimiters(p), "\t")
})
# Plain tab-separated .txt and .tsv with uniform column counts are accepted, identical() to the .csv.
plain <- c("Lipid_Name\tS1\tS2", "PC(16:0/18:1)\t1.5\t2", "TG(16:0_18:1_18:2)\t3\tNA")
plain_csv <- file.path(tmp, "plain.csv"); writeLines(gsub("\t", ",", plain), plain_csv)
for (e in c("txt", "tsv")) {
  check(sprintf("plain tab-separated .%s accepted identical() to the .csv", e),
        identical(app_csv_reader_raw(convert(txt(plain, e), paste0("plain.", e))), app_csv_reader_raw(plain_csv)))
}
check(".tsv with commas only (no tabs) refused, not read as comma", separator_refused(refusal(convert(txt(c("a,b", "PC,1"), "tsv"), "c.tsv"))))
# Short header with commas in a tab table: refused (row-names layout, see above).
short_comma <- c("Control, day 1\tTreatment, day 1", "PC(16:0)\t1.00\t2.00", "PE(18:0)\t3.00\t4.00")
for (nm in c("short_comma.tsv", "short_comma.txt")) {
  q <- file.path(tmp, paste0("sc-", nm)); writeLines(short_comma, q)
  check(sprintf("short header with commas: %s refused", nm), separator_refused(refusal(convert(q, nm))))
}
# Codex round 2: lipid names with semicolons in a comma file, and the mirror.
cer <- file.path(tmp, "cer.txt"); writeLines(c("Lipid,S1", "Cer;O,1", "HexCer;O,2"), cer)
cer_csv <- file.path(tmp, "cer.csv"); writeLines(c("Lipid,S1", "Cer;O,1", "HexCer;O,2"), cer_csv)
check("comma .txt with \"Cer;O\" names parses identical() to the .csv", identical(app_csv_reader_raw(convert(cer, "cer.txt")), app_csv_reader_raw(cer_csv)))
tg <- file.path(tmp, "tg.txt"); writeLines(c("Lipid;S1", "TG(16:0,18:1);1.5", "TG(18:0,18:2);2"), tg)
tg_csv <- file.path(tmp, "tg.csv"); writeLines(c("Lipid,S1", "\"TG(16:0,18:1)\",1.5", "\"TG(18:0,18:2)\",2"), tg_csv)
check("semicolon .txt with \"TG(16:0,18:1)\" names parses identical() to the .csv", identical(app_csv_reader_raw(convert(tg, "tg.txt")), app_csv_reader_raw(tg_csv)))
cer2 <- file.path(tmp, "cer2.txt"); writeLines(c("Lipid,S1,S2", "Cer;O,1,2", "HexCer;O,3,4"), cer2)
check("comma .txt with \"Cer;O\" names, two samples", identical(app_csv_reader_raw(convert(cer2, "cer2.txt"))$S2, c(2L, 4L)))
ambiguous <- file.path(tmp, "amb.txt"); writeLines(c("S1", "Cer;O,1", "HexCer;O,2"), ambiguous)
check("header without delimiters (one field) refused", separator_refused(refusal(convert(ambiguous, "amb.txt"))))
# Codex round 3 / sol4: several valid readings are refused, never guessed; a header that looks
# comma-heavy does not hide a valid semicolon reading.
meta_amb <- file.path(tmp, "meta_amb.txt"); writeLines(c("SampleID;Note,extra", "S1;alpha,beta", "S2;gamma,delta"), meta_amb)
check("metadata .txt readable with either separator is refused", separator_refused(refusal(team_read_sample_metadata_file(meta_amb, "m.txt"))))
meta_semi <- file.path(tmp, "meta_semi.txt"); writeLines(c("SampleID;Group", "S1;A", "S2;B"), meta_semi)
meta_semi_csv <- file.path(tmp, "meta_semi.csv"); writeLines(c("SampleID,Group", "S1,A", "S2,B"), meta_semi_csv)
check("plain semicolon metadata .txt still read identical() to the .csv", identical(team_read_sample_metadata_file(meta_semi, "m.txt"), read_sample_metadata_file(meta_semi_csv, "m.csv")))
header_conflict <- file.path(tmp, "hc.txt"); writeLines(c("Lipid;Sample, one, replicate", "TG(16:0,18:1);1"), header_conflict)
hc_csv <- file.path(tmp, "hc.csv"); writeLines(c("Lipid,\"Sample, one, replicate\"", "\"TG(16:0,18:1)\",1"), hc_csv)
check("sol4 P2: comma-heavy header, only semicolon valid -> parsed identical() to the .csv", identical(app_csv_reader_raw(convert(header_conflict, "hc.txt")), app_csv_reader_raw(hc_csv)))

# Codex round 3 counterexamples: refused, never silently corrupted.
cx1 <- c("Lipid\tS1", "A\t1", "B\t2", "C\t3", "D\t4", "E;5")
check("round 3 P1.1: tab table with one malformed row (E;5) refused (.txt)", separator_refused(refusal(convert(txt(cx1), "cx1.txt"))))
check("round 3 P1.1: same as .tsv refused", separator_refused(refusal(convert(txt(cx1, "tsv"), "cx1.tsv"))))
check("round 3 P1.1: same as metadata .txt refused", separator_refused(refusal(team_read_sample_metadata_file(txt(cx1), "cx1.txt"))))
cx2 <- c("SampleID", sprintf("S%02d", 1:49), "S50,control")
check("round 3 P1.2: single column with a comma on line 51 refused (metadata)", separator_refused(refusal(team_read_sample_metadata_file(txt(cx2), "cx2.txt"))))
check("round 3 P1.2: same as abundance refused", separator_refused(refusal(convert(txt(cx2), "cx2.txt"))))
cx2b <- c("SampleID", sprintf("S%02d", 1:200), "S201\tcontrol")
check("round 3 P1.2: malformed row far beyond any prefix refused", separator_refused(refusal(convert(txt(cx2b), "cx2b.txt"))))
cx3 <- c("Lipid,S1", "A,1", "B,2", "C,3", "D,4", "E;5")
check("round 3 P1.3: comma table with one semicolon row refused", separator_refused(refusal(convert(txt(cx3), "cx3.txt"))))
check("round 3 P1.3: same as metadata refused", separator_refused(refusal(team_read_sample_metadata_file(txt(cx3), "cx3.txt"))))
cx3b <- c("Lipid;S1", "A;1", "B;2", "C;3", "D;4", "E,5")
check("round 3 P1.3 mirror: semicolon table with one comma row refused", separator_refused(refusal(convert(txt(cx3b), "cx3b.txt"))))
check("round 3 P1.1 late row: tab table malformed at row 1000 refused", separator_refused(refusal(convert(txt(c("Lipid\tS1", sprintf("L%d\t%d", 1:998, 1:998), "L999\t1\t2")), "late.txt"))))
check("unterminated quote at end of file refused", separator_refused(refusal(convert(txt(c("Lipid\tS1", "A\t1", "\"B\t2")), "uq.txt"))))
nul <- file.path(tmp, "nul.tsv"); writeBin(as.raw(c(0x4c,0x69,0x70,0x69,0x64,0x5f,0x4e,0x61,0x6d,0x65,0x09,0x53,0x31,0x0a,0x50,0x43,0x28,0x31,0x29,0x09,0x31,0x00,0x65,0x76,0x69,0x6c,0x00,0x0a)), nul)
check("sol5 P1: NUL bytes in a cell refused (abundance)", grepl("NUL bytes", refusal(convert(nul, "nul.tsv")), fixed = TRUE))
check("sol5 P1: NUL bytes refused (metadata)", grepl("NUL bytes", refusal(team_read_sample_metadata_file(nul, "nul.tsv")), fixed = TRUE))
check("refusal message names the separators", grepl("tab-, comma- or semicolon-separated", refusal(convert(txt(cx3), "cx3.txt")), fixed = TRUE))

# 4. Abundance cells that would not read as numbers are refused (no silent NA), naming the cell.
refused <- function(lines, name = "dc.txt") { p <- file.path(tmp, paste0("r-", name)); writeLines(lines, p); tryCatch({ convert(p, name); "" }, error = conditionMessage) }
msg <- refused(c("Lipid;S1;S2", "PC(1);1,5;2", "PC(2);3;0,25"))
check("decimal comma refused, naming value, row and column", grepl("\"1,5\" in row 2, column \"S1\"", msg, fixed = TRUE) && grepl("decimal comma", msg))
for (v in c("1.234,56", ",5", "1,", "N/A", "<LOD")) {
  check(sprintf("non-number %s refused", v), grepl("is not a number", refused(c("Lipid\tS1\tS2", paste0("PC(1)\t", v, "\t2")), "v.tsv")))
}
check("comma-delimited .txt with a quoted \"1,5\" refused", grepl("\"1,5\"", refused(c("Lipid,S1", "PC(1),\"1,5\""), "q.txt"), fixed = TRUE))
check("NA and empty cells accepted (read.csv's own missing values)", is.character(convert({ p <- file.path(tmp, "na.tsv"); writeLines(c("Lipid\tS1\tS2", "PC(1)\tNA\t", "PC(2)\t1\t2"), p); p }, "na.tsv")))
one <- file.path(tmp, "one.txt"); writeLines(c("Lipid", "PC(1)"), one)
check("single-column abundance file refused (no sample columns)", separator_refused(refusal(convert(one, "one.txt"))))
rowname <- file.path(tmp, "rn.tsv"); writeLines(c("S1", "PC(1)\t1", "PC(2)\t2"), rowname)
check("one-sample short-header table refused", separator_refused(refusal(convert(rowname, "rn.tsv"))))
big <- file.path(tmp, "big.tsv"); con <- file(big, "wb"); writeBin(raw(team_upload_max_text_bytes + 1), con); close(con)
check("text files over 50 MB refused with a clear message", grepl("larger than 50 MB", tryCatch({ convert(big, "big.tsv"); "" }, error = conditionMessage)))
meta_one <- file.path(tmp, "meta_one.txt"); writeLines(c("SampleID", "S01", "S02"), meta_one)
check("single-column metadata .txt refused (strict rule: at least two columns)", separator_refused(refusal(team_read_sample_metadata_file(meta_one, "m.txt"))))

# 5. Sample metadata: .tsv/.txt read identical() to the .csv through the existing metadata reader.
meta_csv <- "tests/fixtures/proof_reference_metadata.csv"
meta_ref <- read_sample_metadata_file(meta_csv, "m.csv")
for (v in list(c("m.tsv", "\t"), c("m.txt", ";"), c("m.txt", "\t"))) {
  p <- file.path(tmp, paste0("meta-", v[2] == "\t", "-", v[1])); write_delimited(csv_cells(meta_csv), p, v[2])
  check(sprintf("metadata %s (%s) identical() to the .csv", v[1], team_upload_delimiter_names[[v[2]]]), identical(team_read_sample_metadata_file(p, v[1]), meta_ref))
}
check("metadata .csv path unchanged", identical(team_read_sample_metadata_file(meta_csv, "m.csv"), meta_ref))

# 6. Real data: Paula 67-sample abundance (ckpt16), as abundance_all.csv is derived in
#    tests/dual-ui/parity/prepare_ana_paula_data.R, then .tsv/.txt versions.
ckpt <- Sys.getenv("TEAM_PAULA_CKPT")
paula_csv <- NULL
if (nzchar(ckpt) && file.exists(ckpt)) {
  dir <- file.path(tmp, "ckpt"); utils::unzip(ckpt, exdir = dir)
  xlsx <- list.files(file.path(dir, "data_files"), pattern = "\\.xlsx$", full.names = TRUE)[1]
  mat <- as.data.frame(read_excel(xlsx, na = c("", "N/A")), check.names = FALSE); names(mat)[1] <- "Lipid_Name"
  cat(sprintf("Paula matrix: %d lipids x %d samples\n", nrow(mat), ncol(mat) - 1L))
  paula_csv <- file.path(tmp, "abundance_all.csv"); write.csv(mat, paula_csv, row.names = FALSE, na = "")
  golden_delimited("Paula ckpt16 abundance", paula_csv)
} else cat("skip: TEAM_PAULA_CKPT not set (real-data golden cases)\n")

cat(sprintf("\n%d checks passed\n", passed))
