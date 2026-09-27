# 00_ENVIRONMENT_SETUP.R
# --------------------------------------------------------
# PLATFORM ROUTER ENTRY POINT FOR ENVIRONMENT SETUP
# --------------------------------------------------------

# Robust Working Directory Auto-Resolution
resolve_proj_dir <- function() {
  if (file.exists("00_ENVIRONMENT_SETUP.R") && dir.exists("R")) {
    return(getwd())
  }
  p <- tryCatch(normalizePath(sys.frame(1)$ofile, winslash = "/", mustWork = FALSE), error = function(e) "")
  if (nzchar(p) && file.exists(p)) {
    d <- dirname(p)
    if (file.exists(file.path(d, "00_ENVIRONMENT_SETUP.R"))) return(d)
    if (file.exists(file.path(dirname(d), "00_ENVIRONMENT_SETUP.R"))) return(dirname(d))
  }
  p_rstudio <- tryCatch(normalizePath(rstudioapi::getSourceEditorContext()$path, winslash = "/", mustWork = FALSE), error = function(e) "")
  if (nzchar(p_rstudio) && file.exists(p_rstudio)) {
    d <- dirname(p_rstudio)
    if (file.exists(file.path(d, "00_ENVIRONMENT_SETUP.R"))) return(d)
    if (file.exists(file.path(dirname(d), "00_ENVIRONMENT_SETUP.R"))) return(dirname(d))
  }
  p_proj <- tryCatch(rstudioapi::getActiveProject(), error = function(e) NULL)
  if (!is.null(p_proj) && file.exists(file.path(p_proj, "00_ENVIRONMENT_SETUP.R"))) {
    return(p_proj)
  }
  cur <- getwd()
  for (i in 1:4) {
    if (file.exists(file.path(cur, "00_ENVIRONMENT_SETUP.R"))) return(cur)
    parent <- dirname(cur)
    if (parent == cur) break
    cur <- parent
  }
  return(getwd())
}

target_dir <- resolve_proj_dir()
if (target_dir != getwd() && dir.exists(target_dir)) {
  tryCatch(setwd(target_dir), error = function(e) NULL)
}

sys_os <- Sys.info()["sysname"]

if (sys_os == "Windows") {
  source("OS/Windows/00_ENVIRONMENT_SETUP_windows.R")
} else if (sys_os == "Darwin") {
  arch <- Sys.info()["machine"]
  if (arch == "arm64") {
    source("OS/macOS_AppleSilicon/00_ENVIRONMENT_SETUP_macos.R")
  } else {
    source("OS/macOS_Intel/00_ENVIRONMENT_SETUP_macos.R")
  }
} else {
  # Default to Linux setup
  source("OS/Linux/00_ENVIRONMENT_SETUP_linux.R")
}


