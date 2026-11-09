# Static, base-R-only dependency check: parse source text, never source the app.
# Check every test_api_*.R: optional packages need a guard before their first use.
# Package vectors mean vectors iterated by dependency guards (not render formats).
# Missing packages must print SKIP and quit(status = 0). Also accept optional
# sections gated by a positive requireNamespace, and helpers returning NA on a
# missing package: these omit only optional assertions, without stopping the test.
# plumber imports httpuv, so a prior plumber guard also protects httpuv uses.
optional <- c("plumber", "callr", "httr", "curl", "png", "svglite", "httpuv")
failures <- character()
name_is <- function(x, name) is.call(x) && identical(x[[1L]], as.name(name))
text_of <- function(x) paste(deparse(x, width.cutoff = 500L), collapse = " ")
packages <- function(x, bindings) {
  if (is.character(x)) return(x)
  if (is.symbol(x)) return(bindings[[as.character(x)]])
  if (name_is(x, "c")) return(unlist(lapply(as.list(x)[-1L], packages, bindings = bindings)))
  character()
}
requirements <- function(x, bindings) {
  if (!is.call(x)) return(character())
  if (name_is(x, "requireNamespace")) return(packages(x[[2L]], bindings))
  unique(unlist(lapply(as.list(x)[-1L], requirements, bindings = bindings)))
}
safe_absence <- function(x) {
  code <- text_of(x)
  (grepl('cat\\("SKIP', code) && grepl('quit\\([^)]*status = 0', code)) ||
    grepl('return\\(NA\\)', code)
}
walk <- function(x, guarded = character(), bindings = list()) {
  if (is.expression(x) || name_is(x, "{")) {
    parts <- if (is.expression(x)) as.list(x) else as.list(x)[-1L]
    for (part in parts) guarded <- walk(part, guarded, bindings)
    return(guarded)
  }
  if (!is.call(x)) return(guarded)
  if (name_is(x, "for")) {
    values <- packages(x[[3L]], bindings)
    bindings[[as.character(x[[2L]])]] <- values
    return(walk(x[[4L]], guarded, bindings))
  }
  if (name_is(x, "if")) {
    condition <- x[[2L]]
    needed <- requirements(condition, bindings)
    negative <- name_is(condition, "!")
    if (length(needed) && negative) {
      if (safe_absence(x[[3L]])) {
        guarded <- union(guarded, needed)
      } else {
        for (pkg in intersect(needed, optional))
          failures <<- union(failures, paste0("FAIL ", basename(file), ": ", pkg))
      }
    }
    # A positive availability check gates only its own section.
    inside <- if (length(needed) && !negative) union(guarded, needed) else guarded
    walk(x[[3L]], inside, bindings)
    if (length(x) >= 4L) walk(x[[4L]], guarded, bindings)
    return(guarded)
  }
  if (name_is(x, "::") || name_is(x, ":::")) {
    pkg <- as.character(x[[2L]])
    protected <- union(guarded, if ("plumber" %in% guarded) "httpuv")
    if (pkg %in% optional && !pkg %in% protected)
      failures <<- union(failures, paste0("FAIL ", basename(file), ": ", pkg))
    return(guarded)
  }
  if (is.call(x[[1L]])) walk(x[[1L]], guarded, bindings)
  parts <- as.list(x)[-1L]
  for (i in seq_along(parts)) {
    if (identical(parts[i], list(quote(expr = )))) next
    walk(parts[[i]], guarded, bindings)
  }
  guarded
}
files <- sort(list.files("tests/dual-ui", "^test_api_.*\\.R$", full.names = TRUE))
for (file in files) {
  if (basename(file) == "test_api_dependency_guards.R") next
  walk(parse(text = readLines(file, warn = FALSE), keep.source = FALSE))
}
if (length(failures)) {
  cat(paste(failures, collapse = "\n"), "\n", sep = "")
  quit(status = 1)
}
cat("PASS test_api_dependency_guards\n")
