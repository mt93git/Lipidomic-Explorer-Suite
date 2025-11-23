# Script to install all dependencies for the Lipidomic Explorer Suite
# Run this once before launching the apps.

required_packages <- c(
  # Core Shiny & UI
  "shiny", "bslib", "shinyjqui", "htmlwidgets", "DT",
  
  # Data Manipulation
  "dplyr", "tidyr", "readxl", "stringr", "tibble", "purrr", "zip",
  
  # Visualization
  "ggplot2", "ggrepel", "plotly", "pheatmap", "colourpicker", 
  "RColorBrewer", "viridisLite", "ggpubr", "scales", "grid", "webshot2",
  
  # Statistics & Bioinformatics
  "limma", "fgsea", "qvalue", "nipals", "imputeLCMD", "stats"
)

# Function to check and install
install_missing <- function(pkgs) {
  new_pkgs <- pkgs[!(pkgs %in% installed.packages()[,"Package"])]
  if(length(new_pkgs)) {
    message("Installing missing packages: ", paste(new_pkgs, collapse = ", "))
    install.packages(new_pkgs)
  } else {
    message("All core packages are already installed.")
  }
}

install_missing(required_packages)

# Bioconductor Check (for limma, fgsea, imputeLCMD)
if (!require("BiocManager", quietly = TRUE))
  install.packages("BiocManager")

bioc_packages <- c("limma", "fgsea", "imputeLCMD", "qvalue")
BiocManager::install(bioc_packages, update = FALSE)

message("Environment setup complete. You can now run the apps in the /apps folder.")