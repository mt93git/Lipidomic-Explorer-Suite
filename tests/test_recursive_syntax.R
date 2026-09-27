# Ensure UTF-8 locale for parsing Unicode characters across platforms
tryCatch(Sys.setlocale("LC_ALL", "en_US.UTF-8"), error = function(e) NULL)

r_files <- list.files(
  path = ".",
  pattern = "\\.[rR]$",
  recursive = TRUE,
  full.names = TRUE
)

# Exclude scratch directory files to only test codebase files
r_files <- r_files[!grepl("^\\./scratch/", r_files)]

cat("Found", length(r_files), "R files to audit:\n")

all_ok <- TRUE
for (f in r_files) {
  res <- tryCatch({
    parse(file = f, encoding = "UTF-8")
    "OK"
  }, error = function(e) {
    all_ok <<- FALSE
    e$message
  })
  cat(sprintf("  %-60s : %s\n", f, res))
}

cat("\n--------------------------------------------------\n")
if (all_ok) {
  cat("=== RECURSIVE SYNTAX AUDIT SUCCESSFUL (ALL OK) ===\n")
} else {
  cat("=== SYNTAX ERRORS DETECTED IN AUDIT ===\n")
  quit(status = 1)
}
