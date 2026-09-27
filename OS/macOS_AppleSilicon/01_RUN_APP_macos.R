# OS/macOS_AppleSilicon/01_RUN_APP_macos.R
# Launches the Lipidomic Explorer Application on macOS (Apple Silicon)
# -----------------------------------------------------

script_path <- tryCatch({
  normalizePath(sys.frame(1)$ofile, winslash = "/", mustWork = FALSE)
}, error = function(e) {
  tryCatch({
    normalizePath(rstudioapi::getSourceEditorContext()$path, winslash = "/", mustWork = FALSE)
  }, error = function(e2) {
    file.path(getwd(), "OS/macOS_AppleSilicon/01_RUN_APP_macos.R")
  })
})

# If the script is run directly from the OS-specific directory, reset the working directory to the project root
if (script_path != "") {
  norm_path <- normalizePath(script_path, winslash = "/", mustWork = FALSE)
  if (grepl("/OS/(macOS_AppleSilicon|macOS_Intel|Windows|Linux)/01_RUN_APP_.*\\.R$", norm_path)) {
    proj_dir <- dirname(dirname(dirname(norm_path)))
    if (dir.exists(proj_dir)) {
      setwd(proj_dir)
      message(paste("[LIPIDOMIC EXPLORER] Adjusted working directory to project root:", proj_dir))
    }
  }
}

# Configure isolated library path unconditionally on startup
sys_os <- Sys.info()["sysname"]
arch <- Sys.info()["machine"]
r_ver <- paste0(R.version$major, ".", strsplit(R.version$minor, "\\.")[[1]][1])
if (Sys.getenv("TEST_LIB_PATH") != "") {
  lib_path <- Sys.getenv("TEST_LIB_PATH")
} else {
  lib_path <- file.path(Sys.getenv("HOME"), "Library", "R", "LipidomicExplorer_Library", paste0(r_ver, "_", arch))
}
if (!dir.exists(lib_path)) {
  dir.create(lib_path, recursive = TRUE, showWarnings = FALSE)
}
.libPaths(c(lib_path, .Library))
Sys.setenv(R_LIBS_USER = lib_path)

# Namespace conflict guard: checks if critical dependencies are loaded from outside the sandbox
check_loaded_namespaces <- function() {
  sys_os <- Sys.info()["sysname"]
  arch <- Sys.info()["machine"]
  r_ver <- paste0(R.version$major, ".", strsplit(R.version$minor, "\\.")[[1]][1])
  if (Sys.getenv("TEST_LIB_PATH") != "") {
    lib_path <- Sys.getenv("TEST_LIB_PATH")
  } else {
    lib_path <- file.path(Sys.getenv("HOME"), "Library", "R", "LipidomicExplorer_Library", paste0(r_ver, "_", arch))
  }
  
  loaded <- loadedNamespaces()
  conflicts <- c()
  norm_lib <- normalizePath(lib_path, winslash = "/", mustWork = FALSE)
  critical_deps <- c("rlang", "shiny", "dplyr", "htmltools", "bslib", "lifecycle", "vctrs", "cli", "glue")
  
  for (pkg in loaded) {
    if (pkg %in% c("base", "stats", "graphics", "grDevices", "utils", "datasets", "methods", "grid", "tools", "parallel", "compiler", "splines", "stats4", "tcltk")) {
      next
    }
    pkg_path <- tryCatch(getNamespaceInfo(pkg, "path"), error = function(e) "")
    if (pkg_path != "") {
      norm_pkg_path <- normalizePath(pkg_path, winslash = "/", mustWork = FALSE)
      if (!startsWith(norm_pkg_path, norm_lib)) {
        if (pkg %in% critical_deps) {
          # Only flag conflict if package is actually installed in the sandbox library
          if (dir.exists(file.path(lib_path, pkg))) {
            conflicts <- c(conflicts, pkg)
          }
        }
      }
    }
  }
  
  if (length(conflicts) > 0) {
    msg <- paste0(
      "\n[WARNING CONFLICT] Package namespace conflict detected in your R session.\n",
      "The following package(s) are already loaded in memory from a system-wide or user library:\n",
      paste(paste("  -", conflicts), collapse = "\n"), "\n",
      "R will use these loaded versions instead of the versions in the isolated sandbox.\n",
      "If you experience unexpected behavior or errors, please:\n",
      "1. Restart your R session: In RStudio, press Command+Shift+F10 (or click Session -> Restart R).\n",
      "2. Open '01_RUN_APP.R' in the project root directory and click the 'Source' button in RStudio.\n",
      "   (Do NOT click 'Run App' or load 'library(shiny)' manually before running the script).\n"
    )
    warning(msg, call. = FALSE, immediate. = TRUE)
  }
}
check_loaded_namespaces()

message("Starting Lipidomic Explorer on macOS (Apple Silicon)...")
message(paste("Running script from path:", script_path))

if (!exists("..env_setup_completed", envir = .GlobalEnv) || !get("..env_setup_completed", envir = .GlobalEnv)) {
  assign("..launching_from_run_app", TRUE, envir = .GlobalEnv)
  source("OS/macOS_AppleSilicon/00_ENVIRONMENT_SETUP_macos.R")
  assign("..launching_from_run_app", FALSE, envir = .GlobalEnv)
}

shiny::runApp(appDir = getwd(), launch.browser = getOption("shiny.launch.browser", TRUE))
