# OS/macOS_AppleSilicon/00_ENVIRONMENT_SETUP_macos.R
# --------------------------------------------------------
# SELF-HEALING AUTOMATED ENVIRONMENT & DEPLOYMENT SUITE (MACOS - APPLE SILICON)
# --------------------------------------------------------

# Prevent recursive execution if bootstrapping is already complete
if (!exists("..env_setup_completed", envir = .GlobalEnv) || !get("..env_setup_completed", envir = .GlobalEnv)) {

# 0. OPERATING SYSTEM VERIFICATION
# --------------------------------------------------------
sys_os <- Sys.info()["sysname"]
if (sys_os != "Darwin") {
  stop("[ERROR] This script is specifically configured for macOS (Darwin).")
}

# 1. ISOLATED LIBRARY PATH CONFIGURATION
# --------------------------------------------------------
r_ver <- paste0(R.version$major, ".", strsplit(R.version$minor, "\\.")[[1]][1])
arch <- Sys.info()["machine"]

if (Sys.getenv("TEST_LIB_PATH") != "") {
  lib_path <- Sys.getenv("TEST_LIB_PATH")
} else {
  lib_path <- file.path(Sys.getenv("HOME"), "Library", "R", "LipidomicExplorer_Library", paste0(r_ver, "_", arch))
}

if (!dir.exists(lib_path)) {
  dir.create(lib_path, recursive = TRUE, showWarnings = FALSE)
}

# Force the R session to use this clean local library path as primary, completely isolated from user-installed libs
.libPaths(c(lib_path, .Library))
Sys.setenv(R_LIBS_USER = lib_path)

# Namespace conflict guard: checks if critical dependencies are loaded from outside the sandbox
check_loaded_namespaces <- function(lib_path) {
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
check_loaded_namespaces(lib_path)

# Initialize localized log file in the project folder
log_file <- "install_log.txt"
log_message <- function(msg) {
  timestamp <- format(Sys.time(), "%Y-%m-%d %H:%M:%S")
  formatted_msg <- paste0("[", timestamp, "] ", msg)
  cat(formatted_msg, "\n", file = log_file, append = TRUE)
  message(formatted_msg)
}

log_message(">>> INITIALIZING ENVIRONMENT SETUP & RECOVERY SEQUENCE (MACOS - APPLE SILICON)...")
setup_script_path <- tryCatch({
  normalizePath(sys.frame(1)$ofile, winslash = "/", mustWork = FALSE)
}, error = function(e) {
  tryCatch({
    normalizePath(rstudioapi::getSourceEditorContext()$path, winslash = "/", mustWork = FALSE)
  }, error = function(e2) {
    file.path(getwd(), "OS/macOS_AppleSilicon/00_ENVIRONMENT_SETUP_macos.R")
  })
})
log_message(paste(">>> Executing environment setup from path:", setup_script_path))
log_message(paste(">>> Operating System detected:", sys_os))
log_message(paste(">>> Isolated Library Path configured at:", lib_path))

# 2. ENVIRONMENT RESET: PURGE CLOUD LOCKS & SANDBOX ARTIFACTS
# --------------------------------------------------------
if (file.exists("renv.lock")) {
  log_message(" [RESET] Purging sandboxed renv.lock")
  unlink("renv.lock", force = TRUE)
}
if (dir.exists("renv")) {
  log_message(" [RESET] Purging sandboxed renv folder")
  unlink("renv", recursive = TRUE, force = TRUE)
}
if (file.exists(".Rprofile")) {
  lines <- readLines(".Rprofile", warn = FALSE)
  if (any(grepl("renv/activate\\.R", lines))) {
    log_message(" [RESET] Purging legacy renv .Rprofile")
    unlink(".Rprofile", force = TRUE)
  }
}

# Remove R installation locks if they exist in the target library
purge_lock <- function() {
  lock_path <- file.path(lib_path, "00LOCK")
  if (dir.exists(lock_path)) {
    log_message(paste(" [RESET] Purging installation lock:", lock_path))
    unlink(lock_path, recursive = TRUE, force = TRUE)
  }
}
purge_lock()

# 3. REPOSITORY & COMPILER ENFORCEMENT
# --------------------------------------------------------
ppm_repo <- "https://packagemanager.posit.co/cran/latest"
cloud_cran <- "https://cloud.r-project.org"
cloud_cran_http <- "http://cloud.r-project.org"

is_url_reachable <- function(test_url) {
  tmp <- tempfile()
  on.exit(unlink(tmp))
  tryCatch({
    old_timeout <- getOption("timeout")
    options(timeout = 3)
    on.exit(options(timeout = old_timeout), add = TRUE)
    
    # Use download.file which respects getOption("download.file.method") and getOption("download.file.extra")
    suppressWarnings(
      download.file(test_url, destfile = tmp, mode = "wb", quiet = TRUE)
    )
    
    if (!file.exists(tmp) || file.info(tmp)$size == 0) return(FALSE)
    
    # Read first line to verify it is NOT HTML (indicates a proxy block/redirect page or 404 page)
    first_line <- readLines(tmp, n = 1, warn = FALSE)
    if (length(first_line) == 0) return(FALSE)
    if (grepl("^\\s*<", first_line) || grepl("<html|<DOCTYPE|<!doctype|<HTML", first_line, ignore.case = TRUE)) {
      return(FALSE)
    }
    TRUE
  }, error = function(e) {
    FALSE
  })
}

log_message(">>> CHECKING REPOSITORY CONNECTIVITY...")

# 1. Test default HTTPS connection
ppm_ok <- is_url_reachable(paste0(ppm_repo, "/src/contrib/PACKAGES"))
cran_ok <- is_url_reachable(paste0(cloud_cran, "/src/contrib/PACKAGES"))

# If default HTTPS connection fails, attempt to configure insecure curl fallback (common on macOS behind decrypting proxies)
if (!ppm_ok && !cran_ok) {
  log_message(" [CONNECT] Default HTTPS connection failed. Attempting to enable insecure curl fallback (-k)...")
  options(download.file.method = "curl")
  options(download.file.extra = "-k")
  
  # Re-test with curl -k
  ppm_ok <- is_url_reachable(paste0(ppm_repo, "/src/contrib/PACKAGES"))
  cran_ok <- is_url_reachable(paste0(cloud_cran, "/src/contrib/PACKAGES"))
  
  if (ppm_ok || cran_ok) {
    log_message(" [CONNECT] Connectivity restored via insecure curl bypass (-k).")
  } else {
    log_message(" [CONNECT] Insecure curl bypass failed. Restoring default download settings.")
    options(download.file.method = NULL)
    options(download.file.extra = NULL)
  }
}

# Now configure repository options based on verified connectivity
if (cran_ok) {
  log_message(" [CONNECT] Cloud CRAN (HTTPS) is reachable. Setting as primary CRAN (recommended for macOS).")
  options(repos = c(CRAN = cloud_cran))
} else if (ppm_ok) {
  log_message(" [CONNECT] Cloud CRAN is unreachable. PPM is reachable. Setting as primary CRAN.")
  options(repos = c(CRAN = ppm_repo))
} else {
  log_message(" [CONNECT] SSL HTTPS repositories are unreachable. Falling back to HTTP Cloud CRAN.")
  options(repos = c(CRAN = cloud_cran_http))
}

has_compiler <- (nzchar(Sys.which("clang")) || nzchar(Sys.which("gcc"))) && nzchar(Sys.which("make"))
force_binary <- Sys.getenv("R_FORCE_BINARY", unset = if (has_compiler) "FALSE" else "TRUE")

if (force_binary == "TRUE" || !has_compiler) {
  log_message(">>> STRICT BINARY PACKAGE ENFORCEMENT ENABLED (MACOS ARM64 OPTIMIZATION)...")
  options(pkgType = "binary")
  options(install.packages.compile.from.source = "never")
  options(install.packages.check.source = "no")
} else {
  log_message(">>> COMPILER CONFIRMED. SUPPORTING BINARY + SOURCE WORKFLOWS...")
  options(pkgType = "both")
  options(install.packages.compile.from.source = "interactive")
}

# 4. DEPENDENCY RESOLUTION LOOP (CRAN)
# --------------------------------------------------------
is_package_installed <- function(pkg, min_ver = NULL) {
  path <- system.file(package = pkg, lib.loc = lib_path)
  if (path == "") return(FALSE)
  if (!is.null(min_ver)) {
    ver <- packageVersion(pkg, lib.loc = lib_path)
    if (ver < min_ver) {
      log_message(paste(" [UPDATE] Package", pkg, "is outdated in sandbox:", ver, "(requires >=", min_ver, ")"))
      return(FALSE)
    }
  }
  return(TRUE)
}

cran_packages <- list(
  list(name = "rlang", min_ver = "1.1.7"),
  list(name = "shiny", min_ver = "1.8.0"),
  list(name = "bslib", min_ver = "0.7.0"),
  list(name = "shinyjqui"),
  list(name = "readxl"),
  list(name = "readr"),
  list(name = "writexl"),
  list(name = "openxlsx"),
  list(name = "dplyr"),
  list(name = "tidyr"),
  list(name = "ggplot2"),
  list(name = "ggrepel"),
  list(name = "DT"),
  list(name = "scales"),
  list(name = "colourpicker"),
  list(name = "RColorBrewer"),
  list(name = "stringr"),
  list(name = "purrr"),
  list(name = "zip"),
  list(name = "jsonlite"),
  list(name = "nipals"),
  list(name = "htmltools"),
  list(name = "htmlwidgets"),
  list(name = "webshot2"),
  list(name = "plotly"),
  list(name = "viridisLite"),
  list(name = "pheatmap"),
  list(name = "tibble"),
  list(name = "ggpubr"),
  list(name = "tidytext"),
  list(name = "patchwork"),
  list(name = "data.table"),
  list(name = "shinyjs"),
  list(name = "remotes"),
  list(name = "sortable"),
  list(name = "circlize"),
  list(name = "ggraph"),
  list(name = "igraph"),
  list(name = "tidygraph"),
  list(name = "ggh4x"),
  list(name = "stringdist"),
  list(name = "tmvtnorm"),
  list(name = "norm"),
  list(name = "visNetwork"),
  list(name = "digest"),
  list(name = "R6"),
  list(name = "gtable"),
  list(name = "lme4"),
  list(name = "nlme"),
  list(name = "rstudioapi")
)

install_single_cran_package <- function(pkg, min_ver = NULL) {
  if (is_package_installed(pkg, min_ver)) return(TRUE)
  
  purge_lock()
  old_warn <- getOption("warn")
  options(warn = 1)
  on.exit(options(warn = old_warn), add = TRUE)
  
  # Tier 1: Binary installation from active repositories with explicit lib path
  log_message(paste(" [INSTALL:Tier-1] Attempting primary binary install for: '", pkg, "'...", sep=""))
  tryCatch({
    install.packages(pkg, lib = lib_path, type = "binary", dependencies = c("Depends", "Imports", "LinkingTo"), quiet = TRUE)
  }, error = function(e) {
    log_message(paste(" [WARN] Tier-1 binary error for '", pkg, "': ", e$message, sep=""))
  })
  if (is_package_installed(pkg, min_ver)) {
    log_message(paste(" [INSTALL] Successfully installed package: '", pkg, "' (Tier-1 Binary).", sep=""))
    return(TRUE)
  }
  
  # Tier 2: Cloud CRAN HTTPS binary install with explicit lib
  purge_lock()
  log_message(paste(" [INSTALL:Tier-2] Retrying via Cloud CRAN binary for: '", pkg, "'...", sep=""))
  tryCatch({
    install.packages(pkg, lib = lib_path, repos = "https://cloud.r-project.org", type = "binary", dependencies = c("Depends", "Imports", "LinkingTo"), quiet = TRUE)
  }, error = function(e) NULL)
  if (is_package_installed(pkg, min_ver)) {
    log_message(paste(" [INSTALL] Successfully installed package: '", pkg, "' (Tier-2 Cloud CRAN Binary).", sep=""))
    return(TRUE)
  }
  
  # Tier 3: Standard configured pkgType install
  purge_lock()
  log_message(paste(" [INSTALL:Tier-3] Retrying standard repository install for: '", pkg, "'...", sep=""))
  tryCatch({
    install.packages(pkg, lib = lib_path, dependencies = c("Depends", "Imports", "LinkingTo"), quiet = TRUE)
  }, error = function(e) NULL)
  if (is_package_installed(pkg, min_ver)) {
    log_message(paste(" [INSTALL] Successfully installed package: '", pkg, "' (Tier-3 Standard).", sep=""))
    return(TRUE)
  }
  
  # Tier 4: HTTP Cloud CRAN fallback
  purge_lock()
  log_message(paste(" [INSTALL:Tier-4] Retrying via HTTP Cloud CRAN for: '", pkg, "'...", sep=""))
  tryCatch({
    install.packages(pkg, lib = lib_path, repos = "http://cloud.r-project.org", dependencies = c("Depends", "Imports", "LinkingTo"), quiet = TRUE)
  }, error = function(e) NULL)
  if (is_package_installed(pkg, min_ver)) {
    log_message(paste(" [INSTALL] Successfully installed package: '", pkg, "' (Tier-4 HTTP CRAN).", sep=""))
    return(TRUE)
  }

  # Tier 5: Direct GitHub installation for visNetwork via remotes
  if (pkg == "visNetwork") {
    purge_lock()
    log_message(" [INSTALL:Tier-5] Attempting direct GitHub install for 'visNetwork' via remotes...")
    if (system.file(package = "remotes", lib.loc = lib_path) == "") {
      tryCatch(install.packages("remotes", lib = lib_path, type = "binary", quiet = TRUE), error = function(e) NULL)
    }
    if (system.file(package = "remotes", lib.loc = lib_path) != "") {
      tryCatch({
        remotes::install_github("datastorm-open/visNetwork", lib = lib_path, upgrade = "never", quiet = TRUE)
      }, error = function(e) {
        log_message(paste(" [WARN] GitHub install failed for visNetwork: ", e$message, sep=""))
      })
    }
    if (is_package_installed(pkg, min_ver)) {
      log_message(paste(" [INSTALL] Successfully installed package: '", pkg, "' (Tier-5 GitHub).", sep=""))
      return(TRUE)
    }
  }
  
  return(is_package_installed(pkg, min_ver))
}

log_message(">>> CHECKING AND RESOLVING CRAN DEPENDENCIES...")

for (pkg_info in cran_packages) {
  pkg <- pkg_info$name
  min_ver <- pkg_info$min_ver
  
  log_message(paste(" [CHECK] Checking CRAN package:", pkg, ifelse(is.null(min_ver), "", paste("(requires >=", min_ver, ")"))))
  
  if (!is_package_installed(pkg, min_ver)) {
    log_message(paste(" [INSTALL] Package '", pkg, "' is missing or outdated. Initiating installation..."))
    res <- install_single_cran_package(pkg, min_ver)
    if (!res) {
      log_message(paste(" [WARNING] Automated install could not verify package '", pkg, "' in sandbox library.", sep=""))
    }
  } else {
    log_message(paste(" [CHECK] Package '", pkg, "' is already installed and up-to-date."))
  }
}

# 5. BIO-COMPUTE ENGINE (BIOCONDUCTOR DEPENDENCIES)
# --------------------------------------------------------
log_message(">>> CONFIGURING BIOCONDUCTOR ENGINE...")

bioc_ver <- tryCatch({
  if (system.file(package = "BiocManager", lib.loc = lib_path) != "") {
    as.character(BiocManager::version())
  } else {
    r_ver_numeric <- getRversion()
    if (r_ver_numeric >= "4.5.0") {
      "3.21"
    } else if (r_ver_numeric >= "4.4.0") {
      "3.19"
    } else if (r_ver_numeric >= "4.3.0") {
      "3.18"
    } else {
      "3.16"
    }
  }
}, error = function(e) {
  "3.21"
})
log_message(paste(" [BIOC] Targeted Bioconductor version:", bioc_ver))

# Prioritize the official bioconductor.org mirrors on macOS as they host compiled macOS binaries.
# Include HTTP fallbacks to bypass SSL certificate handshake failures.
bioc_mirrors <- c(
  official_https = "https://bioconductor.org",
  official_http = "http://bioconductor.org",
  posit = "https://bioconductor.posit.co",
  dortmund = "https://bioconductor.statistik.tu-dortmund.de"
)

best_bioc_mirror <- NULL
for (name in names(bioc_mirrors)) {
  mirror_url <- bioc_mirrors[[name]]
  test_url <- paste0(mirror_url, "/packages/", bioc_ver, "/bioc/src/contrib/PACKAGES")
  
  log_message(paste(" [BIOC] Testing Bioconductor mirror:", name, "(", mirror_url, ")"))
  if (is_url_reachable(test_url)) {
    log_message(paste(" [BIOC] Bioconductor mirror", name, "is reachable and valid."))
    best_bioc_mirror <- mirror_url
    break
  }
}

if (is.null(best_bioc_mirror)) {
  log_message(" [WARNING] No configured Bioconductor mirrors are reachable. Defaulting to official bioconductor.org.")
  best_bioc_mirror <- "https://bioconductor.org"
}

options(BioC_mirror = best_bioc_mirror)
log_message(paste(">>> SELECTED BIOCONDUCTOR MIRROR:", getOption("BioC_mirror")))

if (system.file(package = "BiocManager", lib.loc = lib_path) == "") {
  log_message(" [BIOC] BiocManager is missing. Installing...")
  purge_lock()
  
  # Try HTTPS install first with binary preference
  success <- tryCatch({
    install.packages("BiocManager", lib = lib_path, type = "binary", quiet = TRUE)
    system.file(package = "BiocManager", lib.loc = lib_path) != ""
  }, error = function(e) {
    FALSE
  })
  
  # Try HTTP fallback if HTTPS fails
  if (!success) {
    log_message(" [BIOC] HTTPS install for BiocManager failed. Retrying via HTTP Cloud CRAN...")
    purge_lock()
    tryCatch({
      install.packages("BiocManager", lib = lib_path, repos = "http://cloud.r-project.org", quiet = TRUE)
      if (system.file(package = "BiocManager", lib.loc = lib_path) != "") {
        log_message(" [BIOC] Successfully installed BiocManager via HTTP CRAN.")
      }
    }, error = function(e) {
      log_message(paste(" [ERROR] Failed to install BiocManager via HTTP | Details:", e$message))
    })
  } else {
    log_message(" [BIOC] Successfully installed BiocManager.")
  }
} else {
  log_message(" [BIOC] BiocManager is already installed.")
}

# Force options(repos) to include BiocManager repositories
options(repos = BiocManager::repositories())

# Define helper to install Bioconductor packages with mirror fallback
install_bioc_package <- function(pkg) {
  old_warn <- getOption("warn")
  options(warn = 1)
  on.exit(options(warn = old_warn), add = TRUE)
  
  success <- tryCatch({
    BiocManager::install(pkg, lib = lib_path, update = FALSE, ask = FALSE, quiet = TRUE, force = TRUE)
    system.file(package = pkg, lib.loc = lib_path) != ""
  }, error = function(e) {
    FALSE
  })
  
  if (!success) {
    current_mirror <- getOption("BioC_mirror")
    other_mirrors <- bioc_mirrors[bioc_mirrors != current_mirror]
    
    for (alt_mirror in other_mirrors) {
      log_message(paste(" [BIOC-FALLBACK] Retrying Bioconductor install via mirror:", alt_mirror, "for package:", pkg))
      purge_lock()
      options(BioC_mirror = alt_mirror)
      options(repos = BiocManager::repositories()) # Re-generate repositories with new mirror
      
      success <- tryCatch({
        BiocManager::install(pkg, lib = lib_path, update = FALSE, ask = FALSE, quiet = TRUE, force = TRUE)
        system.file(package = pkg, lib.loc = lib_path) != ""
      }, error = function(e) {
        FALSE
      })
      if (success) break
    }
    options(BioC_mirror = current_mirror) # Restore selected mirror
    options(repos = BiocManager::repositories())
  }
  return(success)
}

bioc_packages <- c("impute", "pcaMethods", "BiocParallel", "limma", "variancePartition")
if (system.file(package = "BiocManager", lib.loc = lib_path) != "") {
  for (pkg in bioc_packages) {
    log_message(paste(" [CHECK] Checking Bioconductor package:", pkg))
    if (system.file(package = pkg, lib.loc = lib_path) == "") {
      log_message(paste(" [INSTALL] Bioconductor package '", pkg, "' is missing. Installing..."))
      purge_lock()
      
      success <- install_bioc_package(pkg)
      if (success) {
        log_message(paste(" [BIOC] Successfully installed Bioconductor package: '", pkg, "'"))
      } else {
        log_message(paste(" [ERROR] Failed to install Bioconductor package: '", pkg, "'"))
      }
    } else {
      log_message(paste(" [CHECK] Bioconductor package '", pkg, "' is already installed."))
    }
  }
}

# 6. SPECIAL COMPILING PACKAGES (e.g. imputeLCMD)
# --------------------------------------------------------
log_message(" [CHECK] Checking special package: imputeLCMD")
if (system.file(package = "imputeLCMD", lib.loc = lib_path) == "") {
  log_message(" [INSTALL] Package 'imputeLCMD' is missing. Initiating installation...")
  purge_lock()
  
  success <- tryCatch({
    install.packages("imputeLCMD", quiet = TRUE)
    system.file(package = "imputeLCMD", lib.loc = lib_path) != ""
  }, error = function(e) {
    FALSE
  })
  
  if (!success) {
    log_message(" [FALLBACK] Binary package 'imputeLCMD' not available. Attempting source install (pure R package, compiler not required)...")
    purge_lock()
    success <- tryCatch({
      install.packages("imputeLCMD", type = "source", quiet = TRUE)
      system.file(package = "imputeLCMD", lib.loc = lib_path) != ""
    }, error = function(e) {
      FALSE
    })
  }
  
  if (!success) {
    log_message(" [FALLBACK] Retrying source installation of 'imputeLCMD' via HTTP Cloud CRAN...")
    purge_lock()
    tryCatch({
      install.packages("imputeLCMD", type = "source", repos = "http://cloud.r-project.org", quiet = TRUE)
      if (system.file(package = "imputeLCMD", lib.loc = lib_path) != "") {
        log_message(" [INSTALL] Successfully installed package: 'imputeLCMD' from source (HTTP Cloud CRAN).")
      } else {
        log_message(" [FATAL] Source installation completed but 'imputeLCMD' is still missing.")
      }
    }, error = function(e) {
      log_message(paste(" [FATAL] Fallback failed for 'imputeLCMD' | Details: ", e$message))
    })
  } else {
    log_message(" [INSTALL] Successfully installed package: 'imputeLCMD'.")
  }
} else {
  log_message(" [CHECK] Package 'imputeLCMD' is already installed.")
}

# 7. INTEGRITY CHECK & LAUNCH
# --------------------------------------------------------
log_message(">>> PERFORMING RUNTIME INTEGRITY CHECKS (FULL SUITE AUDIT)...")

all_required_packages <- unique(c(
  vapply(cran_packages, function(x) x$name, character(1)),
  bioc_packages,
  "BiocManager"
))

missing_critical <- c()
for (pkg in all_required_packages) {
  if (system.file(package = pkg, lib.loc = lib_path) == "") {
    missing_critical <- c(missing_critical, pkg)
  }
}

if (length(missing_critical) > 0) {
  log_message(paste(" [RECOVERY] Detected missing package(s) during integrity check:", paste(missing_critical, collapse = ", ")))
  log_message(">>> Attempting targeted emergency installation pass for missing package(s)...")
  for (mp in missing_critical) {
    if (mp %in% bioc_packages) {
      install_bioc_package(mp)
    } else {
      install_single_cran_package(mp)
    }
  }
  
  # Re-evaluate
  still_missing <- c()
  for (pkg in missing_critical) {
    if (system.file(package = pkg, lib.loc = lib_path) == "") {
      still_missing <- c(still_missing, pkg)
    }
  }
  
  if (length(still_missing) > 0) {
    log_message(paste(" [CRITICAL] Package installation failed for:", paste(still_missing, collapse = ", ")))
    log_message(">>> Please examine install_log.txt and verify internet connectivity or proxy configurations.")
    stop(paste("Environment bootstrapping incomplete. Missing core dependencies:", paste(still_missing, collapse = ", ")))
  }
}

log_message(">>> ENVIRONMENT INTEGRITY CONFIRMED (ALL PACKAGES VERIFIED).")

# Write Rprofile to automate path configuration on project startup
log_message(" [INFO] Generating startup configuration (.Rprofile)...")
rprofile_content <- c(
  "# .Rprofile",
  "# Auto-generated by Lipidomic Explorer Setup",
  "# Establishes library path isolation on R session startup",
  "",
  "local({",
  "  sys_os <- Sys.info()[\"sysname\"]",
  "  r_ver <- paste0(R.version$major, \".\", strsplit(R.version$minor, \"\\\\.\")[[1]][1])",
  "  ",
  "  if (Sys.getenv(\"TEST_LIB_PATH\") != \"\") {",
  "    lib_path <- Sys.getenv(\"TEST_LIB_PATH\")",
  "  } else {",
  "    if (sys_os == \"Windows\") {",
  "      lib_path <- file.path(Sys.getenv(\"LOCALAPPDATA\"), \"LipidomicExplorer_R_Library\", r_ver)",
  "    } else if (sys_os == \"Darwin\") {",
  "      arch <- Sys.info()[\"machine\"]",
  "      lib_path <- file.path(Sys.getenv(\"HOME\"), \"Library\", \"R\", \"LipidomicExplorer_Library\", paste0(r_ver, \"_\", arch))",
  "    } else {",
  "      lib_path <- file.path(Sys.getenv(\"HOME\"), \".R\", \"LipidomicExplorer_Library\", r_ver)",
  "    }",
  "  }",
  "  ",
  "  if (!dir.exists(lib_path)) {",
  "    dir.create(lib_path, recursive = TRUE, showWarnings = FALSE)",
  "  }",
  "  ",
  "  .libPaths(c(lib_path, .Library))",
  "  Sys.setenv(R_LIBS_USER = lib_path)",
  "  message(paste(\"[LIPIDOMIC EXPLORER] Sandbox library path configured at:\", lib_path))",
  "})"
)
writeLines(rprofile_content, ".Rprofile")

assign("..env_setup_completed", TRUE, envir = .GlobalEnv)

# Only forward session to OS/macOS_AppleSilicon/01_RUN_APP_macos.R if we did NOT start from it
if (!exists("..launching_from_run_app", envir = .GlobalEnv) || !get("..launching_from_run_app", envir = .GlobalEnv)) {
  app_launcher <- "OS/macOS_AppleSilicon/01_RUN_APP_macos.R"
  if (file.exists(app_launcher)) {
    log_message(">>> READY. FORWARDING SESSION TO RUN_APP SEQUENCE...")
    source(app_launcher)
  } else {
    log_message(" [INFO] Ready! Setup complete. Please execute 'OS/macOS_AppleSilicon/01_RUN_APP_macos.R' to start the application.")
  }
}

} # end of !..env_setup_completed check
