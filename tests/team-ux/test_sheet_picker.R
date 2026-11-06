# Team Excel sheet picker (R/frontends/team/sheet_picker.R): server-side checks.
# Rscript tests/team-ux/test_sheet_picker.R   (from the repository root; needs shiny, readxl,
# dplyr, writexl). Optional real data: TEAM_PAULA_CKPT=/path/to/ckpt16.zip (its data_files/*.xlsx
# abundance workbook); without it that case is skipped.
suppressPackageStartupMessages({ library(shiny); library(readxl); library(dplyr) })
source("R/utils_data.R")
showNotification <- function(...) invisible(NULL) # load_one_file notifies about repeated names; no session here
source("R/frontends/team/sheet_picker.R")

passed <- 0L
check <- function(label, ok) {
  if (!isTRUE(ok)) stop("FAILED: ", label, call. = FALSE)
  passed <<- passed + 1L
  cat("ok  ", label, "\n")
}
refused <- function(expr) tryCatch({ force(expr); NA_character_ }, error = function(e) conditionMessage(e))
tmp <- tempfile("sheet-picker-"); dir.create(tmp)
xlsx <- function(sheets, name) { p <- file.path(tmp, name); writexl::write_xlsx(sheets, p); p }

# What the shared module makes of one abundance file before files are merged
# (R/modules/1_shared_data_module.R, rawData, ftype "global"): .csv -> read.csv + Lipid_Name,
# Excel -> load_one_file (R/utils_data.R); then every non-Lipid_Name column as.numeric.
app_read <- function(fp) {
  df <- if (grepl("\\.csv$", fp, ignore.case = TRUE)) {
    d <- read.csv(fp, check.names = FALSE); if (!"Lipid_Name" %in% names(d)) names(d)[1] <- "Lipid_Name"; d
  } else load_one_file(fp, basename(fp))
  df <- as.data.frame(df, check.names = FALSE, stringsAsFactors = FALSE)
  df[-1] <- suppressWarnings(lapply(df[-1], as.numeric))
  df
}

set.seed(20261105)
data_sheet <- data.frame(`Lipid Name` = c("PC(16:0/18:1)", "TG(52:2)", "CE(18:2)", "SM(d18:1/16:0)", "LPC(18:0)"),
                         `Ctrl-1` = c(1.5, 1e-9, 123456.789012345, 0.1 + 0.2, 1/3),
                         `Ctrl-2` = c(NA, 2, 3.25, 4, 5), `KO 1` = c("7", "N/A", "8.5", "NA", "9"),
                         check.names = FALSE, stringsAsFactors = FALSE)
notes_sheet <- data.frame(Note = c("Run 2026-10-01", "Instrument QTOF"), Value = c("x", "y"))
other_sheet <- data.frame(`Lipid Name` = c("PE(36:2)", "PC(16:0/18:1)"), `Ctrl-1` = c(99, 98), check.names = FALSE)

multi <- xlsx(list(Notes = notes_sheet, Data = data_sheet, Other = other_sheet), "multi.xlsx")
single <- xlsx(list(Data = data_sheet), "single.xlsx")

# 1. Sheet names are listed; nothing else is read.
check("multi-sheet workbook: three sheet names, in order", identical(team_sheet_list(multi, "multi.xlsx"), c("Notes", "Data", "Other")))
check("single-sheet workbook: one sheet name", identical(team_sheet_list(single, "single.xlsx"), "Data"))

# 2. Only the chosen sheet is loaded, read exactly as the same sheet saved alone.
out <- file.path(tmp, "chosen.csv")
invisible(team_sheet_extract(multi, "multi.xlsx", "Data", out))
chosen <- app_read(out)
check("chosen sheet: identical() to the shared reader on that sheet saved as its own workbook", identical(chosen, app_read(single)))
check("chosen sheet: no rows from the other sheets", !any(c("PE(36:2)", "Run 2026-10-01") %in% chosen$Lipid_Name) && nrow(chosen) == 5L)
check("chosen sheet: every double exactly as stored in the workbook", identical(chosen$`Ctrl-1`, readxl::read_excel(multi, sheet = "Data")$`Ctrl-1`))
stacked <- app_read(multi)
check("today's reader on the whole workbook differs (the sheets are combined)", !identical(stacked, chosen))

# 3. Single-sheet workbook: handed on as the user's own file. The shared reader's result on the
#    file Team hands on is identical() to its result on the file chosen today.
handed <- file.path(tmp, "handed.xlsx"); invisible(file.copy(single, handed))
check("single-sheet workbook: bytes handed on unchanged", unname(tools::md5sum(handed)) == unname(tools::md5sum(single)))
check("single-sheet workbook: identical() before vs after", identical(load_one_file(single, "single.xlsx"), load_one_file(handed, "single.xlsx")) &&
        identical(app_read(single), app_read(handed)))

# 4. Oversized workbook: refused with a message, before any reading.
big <- file.path(tmp, "big.xlsx")
con <- file(big, "wb"); invisible(seek(con, team_sheet_max_bytes)); writeBin(as.raw(0), con); close(con)
msg <- refused(team_sheet_list(big, "big.xlsx"))
check("oversized workbook: refused", !is.na(msg))
check("oversized workbook: message names the 50 MB limit", grepl("big.xlsx is 50.0 MB. Excel workbooks up to 50 MB can be loaded", msg, fixed = TRUE))
check("exactly 50 MB is not refused for size", !grepl("up to 50 MB", refused(team_sheet_list({ p <- file.path(tmp, "edge.xlsx"); writeBin(raw(team_sheet_max_bytes), p); p }, "edge.xlsx"))))
check("not a workbook: refused with a message", grepl("could not be opened as an Excel workbook", refused(team_sheet_list(out, "chosen.xlsx")), fixed = TRUE))

# 5. Row cap: a sheet over the cap is refused, never cut; at the cap it loads.
rows <- function(n) data.frame(`Lipid Name` = sprintf("PC(%d:0)", seq_len(n)), S1 = seq_len(n) / 7, check.names = FALSE)
capped <- xlsx(list(Info = notes_sheet, Long = rows(team_sheet_max_rows + 1L), Fits = rows(team_sheet_max_rows)), "rows.xlsx")
msg <- refused(team_sheet_extract(capped, "rows.xlsx", "Long", file.path(tmp, "long.csv")))
check("row cap: 200,001 rows refused", grepl("more than 200,000 rows", msg, fixed = TRUE))
check("row cap: nothing written for the refused sheet", !file.exists(file.path(tmp, "long.csv")))
invisible(team_sheet_extract(capped, "rows.xlsx", "Fits", file.path(tmp, "fits.csv")))
check("row cap: exactly 200,000 rows load, identical to the sheet saved alone",
      identical(app_read(file.path(tmp, "fits.csv")), app_read(xlsx(list(Fits = rows(team_sheet_max_rows)), "fits.xlsx"))))
check("row cap: a lower cap applies (n_max = cap + 1)", grepl("more than 4 rows", refused(team_sheet_extract(multi, "multi.xlsx", "Data", file.path(tmp, "c4.csv"), max_rows = 4L)), fixed = TRUE))

old <- team_sheet_max_cells; team_sheet_max_cells <- 14
check("cell cap: a sheet over the cell cap is refused", grepl("more than 14 cells", refused(team_sheet_extract(multi, "multi.xlsx", "Data", file.path(tmp, "cells.csv"))), fixed = TRUE))
wide2 <- xlsx(list(A = data.frame(L = c("PC(1)", "PC(2)"), a = 1:2, b = 3:4, c = 5:6, d = 7:8, e = 9:10, f = 11:12, g = 13:14), B = notes_sheet), "wide.xlsx")
check("cell cap: the row limit comes from the width (8 columns, 14 cells: refused)", grepl("more than 14 cells", refused(team_sheet_extract(wide2, "wide.xlsx", "A", file.path(tmp, "w2.csv"))), fixed = TRUE))
team_sheet_max_cells <- old
old <- team_sheet_max_csv_bytes; team_sheet_max_csv_bytes <- 50
msg <- refused(team_sheet_extract(multi, "multi.xlsx", "Data", file.path(tmp, "bytes.csv")))
check("csv size cap: refused before anything is written", grepl("as a table it is larger than", msg, fixed = TRUE) && !file.exists(file.path(tmp, "bytes.csv")))
team_sheet_max_csv_bytes <- old
# The estimate is an upper bound of the bytes write.csv produces, and close to them, also with quotes in names and cells.
q <- data.frame(`Lipid "Name"` = c('PC("a")', 'TG(52:2)', NA), `S "1"` = c(1/3, NA, 2), T = c('x""y', NA, "z"), check.names = FALSE)
qx <- xlsx(list(A = q, B = notes_sheet), "quotes.xlsx")
old <- team_sheet_max_csv_bytes; team_sheet_max_csv_bytes <- 1e9
qout <- file.path(tmp, "q.csv"); invisible(team_sheet_extract(qx, "quotes.xlsx", "A", qout))
qd <- readxl::read_excel(qx, sheet = "A", na = c("N/A", "NA", ""))
est <- local({ x <- c(names(qd), na.omit(unlist(qd[c(1, 3)]))); sum(nchar(x, type = "bytes")) + sum(nchar(gsub('[^"]', "", x))) + 3 * ncol(qd) + 3 * 2 * nrow(qd) + 26 * nrow(qd) })
check("csv estimate: quotes counted once each (doubled by write.csv), estimate >= written size", file.size(qout) <= est && est - file.size(qout) < 120)
team_sheet_max_csv_bytes <- old
check("gate script: the Excel test reaches the page as /\\.(xlsx|xls)$/i", grepl("/\\.(xlsx|xls)$/i", team_sheet_gate_js, fixed = TRUE))

# 6. Sheets the .csv route cannot pass on unchanged are refused, not altered.
med <- xlsx(list(A = data.frame(Sample_Name = c("S1", "S2"), PGD2 = c(1, 2), PGE2 = c(3, 4)), B = notes_sheet), "mediator.xlsx")
check("mediator-layout sheet: refused with the All-sheets hint", grepl("lipid-mediator layout", refused(team_sheet_extract(med, "mediator.xlsx", "A", file.path(tmp, "m.csv"))), fixed = TRUE))
dup <- xlsx(list(A = data.frame(L = c("PC(1)", "PC(1)"), S = c(1, 2)), B = notes_sheet), "dup.xlsx")
check("repeated lipid names: refused", grepl("repeats lipid names", refused(team_sheet_extract(dup, "dup.xlsx", "A", file.path(tmp, "d.csv"))), fixed = TRUE))
dated <- xlsx(list(A = data.frame(L = c("PC(1)", "PC(2)"), When = as.POSIXct(c("2026-01-01", "2026-01-02"), tz = "UTC")), B = notes_sheet), "dated.xlsx")
msg <- refused(team_sheet_extract(dated, "dated.xlsx", "A", file.path(tmp, "w.csv")))
check("date column: refused (values would change), nothing left behind", grepl("could not be passed on unchanged", msg, fixed = TRUE) && !file.exists(file.path(tmp, "w.csv")))

# 7. File names for the chosen sheet.
check("csv name: workbook and sheet", identical(team_sheet_csv_name("Lipids 2026.xlsx", "Data"), "Lipids 2026 [Data].csv"))
check("csv name: unique within a selection", identical(team_sheet_csv_name("a.xlsx", "S", "a [S].csv"), "a [S] (2).csv"))
check("csv name: unsafe characters replaced", identical(team_sheet_csv_name("a.xlsx", "x/y:z"), "a [x_y_z].csv"))

# 8. Precision: random doubles over 16 orders of magnitude survive the .csv route exactly.
x <- runif(5000) * 10^runif(5000, -8, 8)
wide <- xlsx(list(A = data.frame(L = sprintf("PC(%d)", seq_along(x)), V = x), B = notes_sheet), "precision.xlsx")
invisible(team_sheet_extract(wide, "precision.xlsx", "A", file.path(tmp, "p.csv")))
check("5,000 random doubles: identical() after the .csv route", identical(app_read(file.path(tmp, "p.csv")), app_read(xlsx(list(A = data.frame(L = sprintf("PC(%d)", seq_along(x)), V = x)), "precision-alone.xlsx"))))

# 9. Optional: Paula's real abundance sheet, inside a workbook with an extra notes sheet.
ckpt <- Sys.getenv("TEAM_PAULA_CKPT")
if (nzchar(ckpt) && file.exists(ckpt)) {
  d <- file.path(tmp, "ckpt"); dir.create(d)
  members <- utils::unzip(ckpt, list = TRUE)$Name
  wb <- grep("^data_files/.*\\.xlsx$", members, value = TRUE)[1]
  utils::unzip(ckpt, files = wb, exdir = d)
  real <- file.path(d, wb)
  sheet1 <- readxl::excel_sheets(real)[1]
  real_df <- readxl::read_excel(real, sheet = sheet1, na = c("N/A", "NA", ""))
  real_multi <- xlsx(setNames(list(notes_sheet, real_df), c("Notes", sheet1)), "real-multi.xlsx")
  real_alone <- xlsx(setNames(list(real_df), sheet1), "real-alone.xlsx")
  invisible(team_sheet_extract(real_multi, "real-multi.xlsx", sheet1, file.path(tmp, "real.csv")))
  r <- app_read(file.path(tmp, "real.csv"))
  check(sprintf("real data (%d lipids x %d columns): identical() to the sheet saved alone", nrow(r), ncol(r)), identical(r, app_read(real_alone)))
} else cat("skip real data (TEAM_PAULA_CKPT not set)\n")

cat(sprintf("\n%d checks passed\n", passed))
