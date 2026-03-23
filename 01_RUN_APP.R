# 01_RUN_APP.R
# Launches the Lipidomic Explorer Application
# -------------------------------------------

message("Starting Lipidomic Explorer...")

# -------------------------------------------
# Auto-Install Missing Local Dependencies
# -------------------------------------------
required_pkgs <- c("shiny", "bslib", "shinyjqui", "readxl", "dplyr", "tidyr", "ggplot2", 
  "ggrepel", "DT", "scales", "colourpicker", "RColorBrewer", "stringr", 
  "purrr", "zip", "nipals", "htmlwidgets", "webshot2", 
  "plotly", "viridisLite", "pheatmap", "tibble", "ggpubr", "tidytext", 
  "patchwork", "data.table", "shinyjs", "remotes", "sortable", "BiocManager")

missing <- required_pkgs[!(required_pkgs %in% installed.packages()[,"Package"])]
if (length(missing) > 0) {
  message("Installing missing packages: ", paste(missing, collapse = ", "))
  install.packages(missing, repos = "https://cloud.r-project.org")
}

# Bioconductor dependencies
bioc_pkgs <- c("BiocParallel", "limma", "fgsea", "qvalue")
missing_bioc <- bioc_pkgs[!(bioc_pkgs %in% installed.packages()[,"Package"])]
if (length(missing_bioc) > 0) {
  message("Installing missing Bioconductor packages: ", paste(missing_bioc, collapse = ", "))
  BiocManager::install(missing_bioc, update = FALSE, ask = FALSE)
}

shiny::runApp(appDir = getwd())
