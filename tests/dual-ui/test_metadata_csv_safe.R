source("R/sample_metadata_import.R")

metadata <- data.frame(
  SampleID = c("S01", "S02"),
  ordinary = c("control", "=1+1"),
  numeric = c(1, 2),
  check.names = FALSE, stringsAsFactors = FALSE
)
names(metadata)[[2L]] <- "=SUM(1,1)"
metadata[[" +unsafe"]] <- c("@cmd", "normal")
original <- metadata

safe <- sample_metadata_csv_safe(metadata)
stopifnot(identical(metadata, original),
  identical(names(safe), c("SampleID", "'=SUM(1,1)", "numeric", "' +unsafe")),
  identical(safe[["'=SUM(1,1)"]], c("control", "'=1+1")),
  identical(safe[["' +unsafe"]], c("'@cmd", "normal")),
  identical(safe$numeric, c(1, 2)))

csv <- tempfile(fileext = ".csv")
utils::write.csv(safe, csv, row.names = FALSE)
roundtrip <- utils::read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(names(roundtrip), names(safe)),
  identical(roundtrip[["'=SUM(1,1)"]], c("control", "'=1+1")),
  identical(roundtrip[["' +unsafe"]], c("'@cmd", "normal")),
  identical(roundtrip$SampleID, metadata$SampleID),
  identical(roundtrip$numeric, c("1", "2")))

collision <- data.frame(first = "=2+2", second = "@cmd", check.names = FALSE)
names(collision) <- c("=1+1", "'=1+1")
safe_collision <- sample_metadata_csv_safe(collision)
stopifnot(identical(names(safe_collision), c("'=1+1", "'=1+1_1")),
  identical(safe_collision[[1L]], "'=2+2"),
  identical(safe_collision[[2L]], "'@cmd"),
  identical(names(collision), c("=1+1", "'=1+1")))
utils::write.csv(safe_collision, csv, row.names = FALSE)
collision_roundtrip <- utils::read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(names(collision_roundtrip), names(safe_collision)),
  identical(collision_roundtrip[[1L]], "'=2+2"),
  identical(collision_roundtrip[[2L]], "'@cmd"))

factor_data <- data.frame(Lipid = factor(c("=malicious", "PC(34:1)")),
  Group = factor(c("@bad", "Control")), Prepared_signal = c(1.5, 2.5))
original_factor <- factor_data
safe_factor <- sample_metadata_csv_safe(factor_data)
stopifnot(identical(factor_data, original_factor),
  identical(safe_factor$Lipid, c("'=malicious", "PC(34:1)")),
  identical(safe_factor$Group, c("'@bad", "Control")),
  identical(safe_factor$Prepared_signal, c(1.5, 2.5)))
utils::write.csv(safe_factor, csv, row.names = FALSE)
factor_roundtrip <- utils::read.csv(csv, check.names = FALSE, colClasses = "character")
stopifnot(identical(factor_roundtrip$Lipid, safe_factor$Lipid),
  identical(factor_roundtrip$Group, safe_factor$Group),
  identical(factor_roundtrip$Prepared_signal, c("1.5", "2.5")))
unlink(csv)

nested <- data.frame(SampleID = c("S01", "S02"))
nested$Label <- I(list("=1+1", "@SUM(1)"))
nested_original <- nested
nested_error <- tryCatch(sample_metadata_csv_safe(nested), error = identity)
stopifnot(inherits(nested_error, "error"),
  grepl("does not support list columns", conditionMessage(nested_error), fixed = TRUE),
  identical(nested, nested_original))

find_download <- function(node, target) {
  if (!is.call(node) && !is.expression(node) && !is.pairlist(node)) return(NULL)
  if (is.call(node) && identical(node[[1L]], as.name("<-")) &&
      is.call(node[[2L]]) && identical(node[[2L]][[1L]], as.name("$")) &&
      identical(node[[2L]][[2L]], as.name("output")) &&
      identical(node[[2L]][[3L]], as.name(target))) return(node[[3L]])
  for (i in seq_along(node)) {
    found <- tryCatch(find_download(node[[i]], target), error = function(e) NULL)
    if (!is.null(found)) return(found)
  }
  NULL
}
guided_download <- find_download(parse("R/guided_workflow.R"), "guide_metadata_csv")
stopifnot(!is.null(guided_download))
guided_env <- new.env(parent = globalenv())
guided_env$req <- shiny::req
guided_env$metadata <- function() data.frame(FullName = c("=S01", "S02"),
  Label = c("@study", "control"), check.names = FALSE)
guided_env$applied_samples <- function() c("=S01", "S02")
guided_env$selected_samples <- function() c("=S01")
guided_content <- eval(guided_download[["content"]], envir = guided_env)
guided_path <- tempfile(fileext = ".csv")
guided_content(guided_path)
guided_csv <- read.csv(guided_path, check.names = FALSE, colClasses = "character")
stopifnot(identical(guided_csv$FullName, c("'=S01", "S02")),
  identical(guided_csv$Label, c("'@study", "control")))
unlink(guided_path)
guided_env$metadata <- function() data.frame(FullName = c("=S01", "S02"),
  Label = I(list("=1+1", "@SUM(1)")), check.names = FALSE)
guided_error <- tryCatch(guided_content(guided_path), error = identity)
stopifnot(inherits(guided_error, "error"), !file.exists(guided_path))

cat("PASS: metadata CSV safety, nested rejection, and actual guided download handler\n")
