# Focused CI bootstrap: evaluate production definitions, never substitute calculations.
# The complete application bootstrap is separately exercised on the RTX runtime.
suppressPackageStartupMessages({
  library(shiny);library(bslib);library(dplyr);library(tidyr);library(readxl)
  library(zip);library(purrr);library(stringr);library(limma);library(imputeLCMD)
})
for (expr in parse('R/global.R')) {
  if(is.call(expr) && identical(expr[[1]],as.name('<-'))) eval(expr,.GlobalEnv)
}
for (path in c('R/utils_data.R','R/utils_preparation.R','R/utils_sample_metadata.R',
 'R/utils_session_archive.R','R/utils_colors.R','R/utils_vis.R','R/modules/utils_stats.R',
 'R/modules/utils_targeted_lipids.R','R/utils_memento.R','R/modules/1_shared_data_module.R')) source(path)
