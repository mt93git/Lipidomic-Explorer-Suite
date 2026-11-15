suppressPackageStartupMessages({library(shiny); library(bslib); library(htmltools); library(xml2); library(plotly); library(visNetwork); library(colourpicker); library(DT)})
`%||%` <- function(a, b) if (is.null(a)) b else a
jqui_resizable <- function(ui, ...) ui
jqui_sortable <- function(ui, ...) ui
rank_list <- function(...) div(); bucket_list <- function(...) div(); add_rank_list <- function(...) div()
for (f in c("R/utils_vis.R", "R/modules/utils_stats.R")) tryCatch(source(f), error = function(e) cat("WARN source", f, conditionMessage(e), "\n"))
source("R/frontends/team/plot_instances.R")
for (f in c(team_plot_instance_family_files, "R/frontends/team/group_comparison.R")) tryCatch(source(f), error = function(e) cat("WARN source", f, conditionMessage(e), "\n"))
