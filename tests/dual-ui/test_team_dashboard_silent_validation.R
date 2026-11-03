# Before data are prepared, dashboard outputs must stop with Shiny's silent validation.
# With BiocGenerics attached (as in the app), format()/nrow() are S4 generics: a validate()
# raised while evaluating their argument is re-raised as a plain error, which Shiny logs as
# "Warning: Error in h: ... Prepare data to see results". Synthetic, empty hub only.
suppressPackageStartupMessages({library(shiny); library(BiocGenerics)})
`%||%` <- function(a, b) if (is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R')
source('R/frontends/team/results_dashboard.R')

hub <- list(data_processed=function() NULL, all_metadata=function() NULL,
  grouped_metadata=function() NULL,
  preparation_audit=function() list(normalization='none',imputation='none'),
  preparation_dirty=function() FALSE, color_maps=function() list())
dashboard_server <- function(input, output, session) results_dashboard_module_server(input,output,session,hub)
shiny::testServer(dashboard_server, {
  session$flushReact()
  cls <- tryCatch({output$note_dist; 'no error'}, error=function(e) class(e))
  if (!'shiny.silent.error' %in% cls)
    stop('note_dist before preparation raised ', paste(cls, collapse='/'), ', not a silent validation', call.=FALSE)
})
cat('PASS dashboard notes stay silent validations before data are prepared\n')
