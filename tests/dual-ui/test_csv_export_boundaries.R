# Spreadsheet CSV protection is applied only to exported copies, including
# row names and the real handler content functions. Session source files remain raw.
source("R/utils_csv_export.R")

fixture <- data.frame(Lipid_Name = c("=1+1", "PC(34:1)"),
  Signal = c(1.25, 2.5), Group = factor(c("@group", "Control")),
  check.names = FALSE)
names(fixture)[[2L]] <- "=sample"
original <- fixture
safe <- spreadsheet_csv_safe(fixture)
stopifnot(identical(fixture, original),
  identical(names(safe), c("Lipid_Name", "'=sample", "Group")),
  identical(safe$Lipid_Name, c("'=1+1", "PC(34:1)")),
  identical(safe$Group, c("'@group", "Control")),
  identical(safe[[2L]], c(1.25, 2.5)))

csv <- tempfile(fileext = ".csv")
write_spreadsheet_csv(fixture, csv, row.names = FALSE, na = "")
roundtrip <- read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(names(roundtrip), names(safe)),
  identical(roundtrip$Lipid_Name, safe$Lipid_Name),
  identical(roundtrip$Group, safe$Group),
  identical(roundtrip[[2L]], c("1.25", "2.5")),
  identical(fixture, original))

collision <- data.frame(a = c(1, 2), b = c(3, 4), check.names = FALSE)
names(collision) <- c("=name", "'=name")
row.names(collision) <- c("=row", "'=row")
write_spreadsheet_csv(collision, csv, row.names = TRUE)
rows <- read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(names(rows), c("", "'=name", "'=name_1")),
  identical(rows[[1L]], c("'=row", "'=row_1")),
  identical(names(collision), c("=name", "'=name")),
  identical(row.names(collision), c("=row", "'=row")))

write_spreadsheet_csv(collision, csv, row.names = c("=explicit", "'=explicit"))
explicit_rows <- read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(explicit_rows[[1L]], c("'=explicit", "'=explicit_1")),
  identical(row.names(collision), c("=row", "'=row")))

nested <- data.frame(Lipid_Name = c("PC(34:1)", "PE(36:2)"))
nested$untrusted <- I(list("=1+1", "@SUM(1)"))
nested_path <- tempfile(fileext = ".csv")
nested_error <- tryCatch(write_spreadsheet_csv(nested, nested_path), error = identity)
stopifnot(inherits(nested_error, "error"),
  grepl("does not support list columns", conditionMessage(nested_error), fixed = TRUE),
  !file.exists(nested_path),
  identical(nested$untrusted, I(list("=1+1", "@SUM(1)"))))

find_download <- function(node, target) {
  if (!is.call(node) && !is.expression(node) && !is.pairlist(node)) return(NULL)
  if (is.call(node) && identical(node[[1L]], as.name("<-")) &&
      is.call(node[[2L]]) && identical(node[[2L]][[1L]], as.name("$")) &&
      identical(node[[2L]][[2L]], as.name("output")) &&
      identical(node[[2L]][[3L]], as.name(target))) return(node[[3L]])
  for (i in seq_along(node)) {
    result <- tryCatch(find_download(node[[i]], target), error = function(e) NULL)
    if (!is.null(result)) return(result)
  }
  NULL
}
handler_content <- function(path, name, env) {
  call <- find_download(parse(path), name)
  stopifnot(!is.null(call))
  eval(call[["content"]], envir = env)
}

hub_env <- new.env(parent = globalenv())
hub_env$data_processed_allow_missing <- function() fixture
hub_handler <- handler_content("R/modules/1_shared_data_module.R", "downloadPostNADataDirect", hub_env)
hub_handler(csv)
hub_csv <- read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(names(hub_csv), names(safe)),
  identical(hub_csv$Lipid_Name, safe$Lipid_Name), identical(fixture, original))

studio_env <- new.env(parent = globalenv())
studio_env$current_artifacts <- function() list(data = fixture)
studio_handler <- handler_content("R/modules/99_export_studio_module.R", "download_single_csv", studio_env)
studio_handler(csv)
studio_csv <- read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(names(studio_csv), names(safe)),
  identical(studio_csv$Group, safe$Group), identical(fixture, original))

studio_env$`%||%` <- function(x, y) if (is.null(x)) y else x
studio_env$input <- list(width_mm = 89, height_mm = 89, dpi_setting = 72,
  base_font_pt = 7.5, journal_preset = "nature", font_family = "sans",
  hybrid_mode = FALSE, inc_pdf = FALSE, inc_svg = FALSE, inc_png = FALSE,
  inc_tiff = FALSE, inc_csv = TRUE, inc_rscript = FALSE)
studio_env$EXPORT_JOURNAL_PRESETS <- list(nature = list(
  name = "Nature", publisher = "Test"))
studio_env$current_artifacts <- function() list(data = fixture,
  filename_base = "synthetic", title = "Synthetic")
bundle_handler <- handler_content("R/modules/99_export_studio_module.R", "download_bundle_zip", studio_env)
bundle <- tempfile(fileext = ".zip")
bundle_handler(bundle)
unpacked <- tempfile("studio_csv_")
dir.create(unpacked)
zip::unzip(bundle, exdir = unpacked)
bundle_csv_paths <- list.files(unpacked, pattern = "_data\\.csv$",
  recursive = TRUE, full.names = TRUE)
stopifnot(length(bundle_csv_paths) == 1L)
bundle_csv <- read.csv(bundle_csv_paths, check.names = FALSE, colClasses = "character")
stopifnot(identical(names(bundle_csv), names(safe)),
  identical(bundle_csv$Lipid_Name, safe$Lipid_Name),
  identical(bundle_csv$Group, safe$Group), identical(fixture, original))
unlink(c(bundle, unpacked), recursive = TRUE)

qc_env <- new.env(parent = globalenv())
qc_env$req <- shiny::req
qc_env$buildSampleCorrMatrix <- function() {
  matrix(c(1, 0.5, 0.5, 1), nrow = 2,
    dimnames = list(c("=row", "'=row"), c("sample_a", "sample_b")))
}
qc_handler <- handler_content("R/modules/2_qc_boxplot_module.R", "downloadSampleCorrCSV", qc_env)
qc_handler(csv)
qc_csv <- read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(qc_csv[[1L]], c("'=row", "'=row_1")),
  identical(qc_csv$sample_a, c("1", "0.5")))

unlink(csv)
cat("PASS: safe CSV copies and actual shared-hub, export-studio direct/bundle and QC handlers\n")
