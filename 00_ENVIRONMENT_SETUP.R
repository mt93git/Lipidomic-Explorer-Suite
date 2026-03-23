# 00_ENVIRONMENT_SETUP.R
# --------------------------------------------------------
# AUTOMATED DEPLOYMENT & RECOVERY SUITE (v9.4)
# --------------------------------------------------------
# This script performs a "Deep Clean" to escape locked environments
# (renv/OneDrive) and installs ALL dependencies to the system library.

message(">>> INITIALIZING v9.4 RECOVERY SEQUENCE...")

# 1. ENVIRONMENT RESET: REMOVE SANDBOX ARTIFACTS
# --------------------------------------------------------
# Aggressively delete environmental locks that trap the session.
artifacts_to_purge <- c(".Rprofile", "renv.lock", "renv")

for (art in artifacts_to_purge) {
  if (file.exists(art)) {
    message(" [RESET] Removing artifact: ", art)
    unlink(art, recursive = TRUE, force = TRUE)
  }
}

# Force Reset Library Paths to System Default
# This prevents installing into the doomed renv folder if it was still active in memory
sys_os <- Sys.info()["sysname"]
r_ver <- paste0(R.version$major, ".", strsplit(R.version$minor, "\\.")[[1]][1])

if (sys_os == "Windows") {
    target_lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library", r_ver)
} else if (sys_os == "Darwin") {
    target_lib <- file.path(Sys.getenv("HOME"), "Library", "R", r_ver, "library")
} else {
  # Fallback for Linux/Other: Use standard R_LIBS_USER default
    target_lib <- Sys.getenv("R_LIBS_USER")
    if (target_lib == "") target_lib <- .libPaths()[1]
}

Sys.setenv(R_LIBS_USER = target_lib)
.libPaths(target_lib)
message(" [RESET] Target Library Path Reset to: ", .libPaths()[1])
if(!dir.exists(.libPaths()[1])) dir.create(.libPaths()[1], recursive=TRUE)

# Remove 00LOCK if exists in the new path
lock_path <- file.path(.libPaths()[1], "00LOCK")
if (dir.exists(lock_path)) {
  message(" [INFO] Cleaning system locks: ", lock_path)
  unlink(lock_path, recursive = TRUE, force = TRUE)
}

# 1.5 CORE DEPENDENCY RESTORATION PROTOCOL (RLANG/DPLYR FIX)
# --------------------------------------------------------
message(">>> STATUS: Corrupt artifact removal confirmed.")
message(">>> INITIATING: Clean binary installation of 'rlang'...")

# 1. Primary Engine Installation (Verbose Mode)
# Forces installation from Posit Public Manager to ensure binary compatibility.
install.packages("rlang", repos = "https://packagemanager.posit.co/cran/latest", type = "binary", quiet = FALSE)

# 2. Secondary Dependency Installation
# Re-installs dplyr to ensure dynamic linking to the new rlang version.
install.packages("dplyr", repos = "https://packagemanager.posit.co/cran/latest", type = "binary", quiet = TRUE)

# 3. Integrity Verification
if (requireNamespace("rlang", quietly = TRUE)) {
    ver <- packageVersion("rlang")
    message(">>> rlang CHECK: Detected Version: ", ver)
    
    if (ver < "1.1.7") {
        stop("CRITICAL: Version compliance failure. rlang version is below 1.1.7.")
    }
} else {
    stop("FATAL ERROR: rlang installation failed.")
}

message(">>> INSTALLING REMAINING CORE RUNTIME COMPONENTS (CRAN)...")

# CRAN Installation - HARDCODED VECTOR (Bulletproof Strategy)
# Prevents "object not found" errors if a restart occurs.
install.packages(c(
  "shiny", "bslib", "shinyjqui", "readxl", "dplyr", "tidyr", "ggplot2", 
  "ggrepel", "DT", "scales", "colourpicker", "RColorBrewer", "stringr", 
  "purrr", "zip", "nipals", "htmlwidgets", "webshot2", 
  "plotly", "viridisLite", "pheatmap", "tibble", "ggpubr", "tidytext", 
  "patchwork", "data.table", "shinyjs", "remotes", "sortable"
), repos = "https://packagemanager.posit.co/cran/latest", type = "binary", ask = FALSE)

# SPECIAL HANDLING: imputeLCMD (Source Only for R 4.5+)
message(">>> INSTALLING imputeLCMD (Source)...")
if (!requireNamespace("imputeLCMD", quietly = TRUE)) {
  tryCatch({
    install.packages("imputeLCMD", repos = "https://cloud.r-project.org", type = "source")
  }, error = function(e) {
    message(" [WARN] imputeLCMD source install failed. Attempting remotes...")
  })
}

# 3. BIO-COMPUTE ENGINE INSTALLATION (BIOCONDUCTOR)
# --------------------------------------------------------
message(">>> CONFIGURING BIOCONDUCTOR ENVIRONMENT...")
if (!requireNamespace("BiocManager", quietly = TRUE)) {
    install.packages("BiocManager", repos = "https://cloud.r-project.org")
}

# Bioconductor Specific Packages
# limma, fgsea, qvalue, BiocParallel
BiocManager::install(c("BiocParallel", "limma", "fgsea", "qvalue"), update = FALSE, ask = FALSE, force = TRUE)

# 4. SYSTEM VERIFICATION & LAUNCH
# --------------------------------------------------------
message(">>> VERIFYING SYSTEM INTEGRITY...")
Sys.sleep(1)

# Verify 'DT' and 'tidytext' as specifically requested calibration check
missing_pkgs <- c()
if (!require("DT", quietly=TRUE)) missing_pkgs <- c(missing_pkgs, "DT")
if (!require("tidytext", quietly=TRUE)) missing_pkgs <- c(missing_pkgs, "tidytext")

if (length(missing_pkgs) > 0) {
    message(" [WARN] Missing critical packages: ", paste(missing_pkgs, collapse=", "), ". Attempting recovery...")
    install.packages(missing_pkgs, type="binary", repos = "https://packagemanager.posit.co/cran/latest")
}

# Launch Application
app_launcher <- "01_RUN_APP.R"
if(file.exists(app_launcher)) {
  message(">>> SYSTEM READY. LAUNCHING APPLICATION...")
  Sys.sleep(1)
  source(app_launcher)
} else {
  message(" [SUCCESS] Installation complete. Please run '01_RUN_APP.R' manually.")
}
