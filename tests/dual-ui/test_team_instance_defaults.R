# A canvas copy reads inputs the Team UI does not host (QC pcaMode is declared only
# by the Classic QC UI). Such inputs are not awaited, but the copy's fallback must
# still give the module a value: the source's value, else the Classic UI default.
# Usage: R_PROFILE_USER=/dev/null Rscript --vanilla tests/dual-ui/test_team_instance_defaults.R
Sys.setenv(LIPIDOMIC_INTERFACE='team',LIPIDOMIC_TEAM_WORKSPACE='1')
suppressWarnings(suppressPackageStartupMessages(source('R/global.R')))
check <- function(label, ok) if (!isTRUE(ok)) stop(label, call. = FALSE) else cat("ok -", label, "\n")
unhosted <- team_plot_instance_unhosted_ids('qc_pca_tab')
defaults <- team_plot_instance_input_defaults('qc_pca_tab')
check('pcaMode is not hosted by a QC copy', 'pcaMode' %in% unhosted)
check('pcaMode falls back to its Classic default', identical(defaults$pcaMode, 'omics'))
check('a hosted control keeps its Team default', identical(defaults$classLabelFormat, 'short'))
copy_input <- team_plot_instance_fallback_input(shiny::reactiveValues(), defaults)
check('a copy reads the Classic default before any control reports', identical(shiny::isolate(copy_input$pcaMode), 'omics'))
