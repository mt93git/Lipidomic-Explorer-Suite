# 02_DIAGNOSTIC_REPORT.R
# --------------------------------------------------------
# SYSTEM CONFIGURATION AUDIT & DIAGNOSTIC PROTOCOL
# --------------------------------------------------------
# This script generates a comprehensive report of the R environment,
# library paths, and installed package versions to facilitate 
# troubleshooting of runtime anomalies.

# --- 1. SYSTEM ENVIRONMENT PARAMETERS ---
cat("==============================================================\n")
cat("   LIPIDOMIC EXPLORER - CONFIGURATION AUDIT REPORT\n")
cat("==============================================================\n")
cat("Timestamp: ", as.character(Sys.time()), "\n\n")

cat("[1] OPERATING SYSTEM & ARCHITECTURE\n")
info <- Sys.info()
cat("    OS Name:       ", info["sysname"], "\n")
cat("    OS Release:    ", info["release"], "\n")
cat("    User Identity: ", info["user"], "\n")
cat("    R Version:     ", R.version.string, "\n\n")

# --- 2. LIBRARY PATH CONFIGURATION ---
cat("[2] LIBRARY PATH CONFIGURATION (User & System)\n")
# Check R_LIBS_USER Environment Variable
r_libs_user <- Sys.getenv("R_LIBS_USER")
cat("    R_LIBS_USER Env Var: ", r_libs_user, "\n")
# Check Actual Active LibPaths
cat("    Active .libPaths():\n")
lib_paths <- .libPaths()
for(i in seq_along(lib_paths)) {
    cat(sprintf("    [%d] %s\n", i, lib_paths[i]))
}
# Check for Lockfile Artifacts
locks <- list.files(lib_paths, pattern="00LOCK", full.names=TRUE, recursive=TRUE)
if(length(locks) > 0) {
    cat("\n    [!] WARNING: Stale Lockfiles Detected:\n")
    cat(paste("        -", locks, collapse="\n"))
} else {
    cat("    [OK] No Lockfile Artifacts Detected.\n")
}
cat("\n")

# --- 3. DEPENDENCY INTEGRITY VERIFICATION ---
cat("[3] RUNTIME DEPENDENCY STATUS\n")
# List of Critical Packages defined in the pipeline
critical_packages <- c(
    "shiny", "shinyjqui", "htmltools", "tidytext", "readxl", 
    "ggpubr", "dplyr", "remotes", "BiocManager", "BiocParallel",
    "ggplot2", "tidyr", "data.table", "DT"
)

cat(sprintf("%-20s | %-15s | %-10s\n", "PACKAGE", "VERSION", "STATUS"))
cat("--------------------------------------------------------------\n")

for (pkg in critical_packages) {
    status <- "MISSING"
    ver <- "NA"
    
    if (requireNamespace(pkg, quietly = TRUE)) {
        status <- "INSTALLED"
        ver <- as.character(packageVersion(pkg))
    }
    
    cat(sprintf("%-20s | %-15s | %-10s\n", pkg, ver, status))
}
cat("--------------------------------------------------------------\n")
cat("\n[END OF REPORT]\n")

# Pause to allow user to read if run from console
Sys.sleep(1)
