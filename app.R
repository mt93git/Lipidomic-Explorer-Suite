# app.R
# App entry point.

# Ensure working directory is project root
if (!dir.exists("R") || !file.exists(file.path("R", "global.R"))) {
  candidates <- c(
    tryCatch(rstudioapi::getActiveProject(), error = function(e) NULL),
    tryCatch(dirname(rstudioapi::getSourceEditorContext()$path), error = function(e) NULL),
    getwd()
  )
  for (cand in candidates) {
    if (!is.null(cand) && dir.exists(file.path(cand, "R")) && file.exists(file.path(cand, "R", "global.R"))) {
      tryCatch(setwd(cand), error = function(e) NULL)
      break
    }
  }
}

# Ensure isolated sandbox library paths are loaded into .libPaths()
r_ver <- paste0(R.version$major, ".", strsplit(R.version$minor, "\\.")[[1]][1])
sys_os <- Sys.info()["sysname"]

if (sys_os == "Darwin") {
  for (arch in unique(c(Sys.info()["machine"], "arm64", "x86_64"))) {
    lib_dir <- file.path(Sys.getenv("HOME"), "Library", "R", "LipidomicExplorer_Library", paste0(r_ver, "_", arch))
    if (dir.exists(lib_dir) && !(lib_dir %in% .libPaths())) {
      .libPaths(c(lib_dir, .libPaths()))
    }
  }
} else if (sys_os == "Windows") {
  lib_dir <- file.path(Sys.getenv("LOCALAPPDATA"), "LipidomicExplorer_R_Library", r_ver)
  if (dir.exists(lib_dir) && !(lib_dir %in% .libPaths())) {
    .libPaths(c(lib_dir, .libPaths()))
  }
} else {
  lib_dir <- file.path(Sys.getenv("HOME"), ".R", "LipidomicExplorer_Library", r_ver)
  if (dir.exists(lib_dir) && !(lib_dir %in% .libPaths())) {
    .libPaths(c(lib_dir, .libPaths()))
  }
}

# Self-healing pre-flight check: If critical packages (e.g. visNetwork, shiny) are missing, auto-run 00_ENVIRONMENT_SETUP.R
critical_core_pkgs <- c("shiny", "bslib", "DT", "dplyr", "visNetwork")
pkgs_missing <- critical_core_pkgs[!vapply(critical_core_pkgs, function(p) requireNamespace(p, quietly = TRUE), logical(1))]

if (length(pkgs_missing) > 0 && file.exists("00_ENVIRONMENT_SETUP.R")) {
  message(sprintf("\n[PRE-FLIGHT] Missing %d required package(s): %s.", length(pkgs_missing), paste(pkgs_missing, collapse = ", ")))
  message("[PRE-FLIGHT] Auto-triggering 00_ENVIRONMENT_SETUP.R to initialize environment and install packages...")
  assign("..launching_from_run_app", TRUE, envir = .GlobalEnv)
  tryCatch({
    source("00_ENVIRONMENT_SETUP.R")
  }, error = function(e) {
    warning("[PRE-FLIGHT] Auto-setup encountered an error: ", e$message)
  })
}

source(file.path("R", "global.R"))
source(file.path("R", "ui.R"))
source(file.path("R", "server.R"))

shiny::shinyApp(
  ui = ui,
  server = server
)
