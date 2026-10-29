# Dependency-free runtime policy and logging regression tests.
source("R/frontends/interface.R")
vars <- c("LIPIDOMIC_INTERFACE", "LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL",
  "LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL", "LIPIDOMIC_UI_TRACE_DEBUG", "CI",
  "CONTINUOUS_INTEGRATION", "GITHUB_ACTIONS", "LIPIDOMIC_HOSTED", "SHINY_SERVER",
  "SHINY_SERVER_VERSION", "RSCONNECT", "RSCONNECT_SERVER", "CONNECT_SERVER",
  "SHINYAPPS_INSTANCE_ID", "SHINY_SERVER_LICENSE")
old <- Sys.getenv(vars, unset = NA_character_)
tryCatch({
  reset <- function(...) {
    Sys.unsetenv(vars)
    values <- list(...)
    if (length(values)) do.call(Sys.setenv, values)
  }
  reset()
  stopifnot(lipidomic_allow_dependency_install(), lipidomic_full_diagnostics())
  reset(LIPIDOMIC_INTERFACE = "team")
  stopifnot(!lipidomic_allow_dependency_install(), !lipidomic_full_diagnostics())
  reset(LIPIDOMIC_INTERFACE = "guided", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "1",
    LIPIDOMIC_UI_TRACE_DEBUG = "1")
  stopifnot(lipidomic_allow_dependency_install(), lipidomic_full_diagnostics())
  reset(LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "1", LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL = "1")
  stopifnot(!lipidomic_allow_dependency_install())
  reset(LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0", LIPIDOMIC_UI_TRACE_DEBUG = "0")
  stopifnot(!lipidomic_allow_dependency_install(), !lipidomic_full_diagnostics())
  for (flag in vars[5:length(vars)]) {
    reset()
    do.call(Sys.setenv, setNames(list("1"), flag))
    stopifnot(!lipidomic_allow_dependency_install(), !lipidomic_full_diagnostics())
    Sys.setenv(LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "1", LIPIDOMIC_UI_TRACE_DEBUG = "1")
    stopifnot(lipidomic_allow_dependency_install(), !lipidomic_full_diagnostics())
  }
  for (truth in c("1", "true", "TRUE", " yes ", "on")) {
    reset(LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL = truth, LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "true")
    stopifnot(!lipidomic_allow_dependency_install())
    reset(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = truth,
      LIPIDOMIC_UI_TRACE_DEBUG = truth)
    stopifnot(lipidomic_allow_dependency_install(), lipidomic_full_diagnostics())
  }
  for (falsehood in c("0", "false", "FALSE", " no ", "off")) {
    reset(LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = falsehood, LIPIDOMIC_UI_TRACE_DEBUG = falsehood)
    stopifnot(!lipidomic_allow_dependency_install(), !lipidomic_full_diagnostics())
    reset(LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL = falsehood)
    stopifnot(lipidomic_allow_dependency_install())
  }
  reset(LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL = "typo")
  stopifnot(inherits(tryCatch(lipidomic_allow_dependency_install(), error = identity), "error"))
  reset(CI = "false")
  stopifnot(lipidomic_allow_dependency_install(), lipidomic_full_diagnostics())
  evt <- list(type = "JS_ERROR", payload = list(message = "secret.xlsx", lineno = 123))
  stopifnot(grepl("secret.xlsx", lipidomic_ui_trace_suffix(evt), fixed = TRUE))
  large_evt <- list(payload = list(message = paste(rep("x", 50000L), collapse = "")))
  stopifnot(nchar(lipidomic_ui_trace_suffix(large_evt)) <= 12003L)
  reset(LIPIDOMIC_HOSTED = "1", LIPIDOMIC_UI_TRACE_DEBUG = "1")
  stopifnot(identical(lipidomic_ui_trace_suffix(evt), ""))

  # Exercise the production logger without loading the app or its dependencies.
  exprs <- parse("R/global.R")
  logger <- exprs[vapply(exprs, function(e) is.call(e) && identical(e[[1]], as.name("<-")) &&
    identical(e[[2]], as.name("log_ingestion_event")), logical(1))]
  stopifnot(length(logger) == 1L)
  eval(logger[[1]])
  INGESTION_LOG_FILE <- tempfile()
  reset()
  invisible(capture.output(log_ingestion_event("UPLOAD", "INFO", "secret.xlsx", list(path = "/private/study"))))
  stopifnot(any(grepl("secret.xlsx", readLines(INGESTION_LOG_FILE), fixed = TRUE)))
  unlink(INGESTION_LOG_FILE)
  reset(CI = "1", LIPIDOMIC_UI_TRACE_DEBUG = "1")
  invisible(capture.output(log_ingestion_event("UPLOAD", "INFO", "secret.xlsx", list(path = "/private/study", row_count = 3))))
  logs <- readLines(INGESTION_LOG_FILE)
  stopifnot(!any(grepl("secret|private", logs)), any(grepl("row_count: 3", logs)))
  unlink(INGESTION_LOG_FILE)
  # Bootstrap must load the dependency-free policy before evaluating preflight.
  app <- readLines("app.R")
  stopifnot(which(grepl('source(file.path("R", "frontends", "interface.R"))', app, fixed = TRUE)) <
    which(grepl('if (length(pkgs_missing)', app, fixed = TRUE)))
  cat("Classic runtime policy and diagnostics tests passed.\n")
}, finally = {
  Sys.unsetenv(vars)
  existing <- !is.na(old)
  if (any(existing)) do.call(Sys.setenv, as.list(old[existing]))
})
