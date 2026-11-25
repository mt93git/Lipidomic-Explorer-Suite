# The Team violin style helper is shared by the Feature distributions card (results_dashboard.R)
# and the Cohort comparison card (cell_show.R). Each file must work when it is loaded on its own.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a, b) if (is.null(a)) b else a
for (file in c('R/frontends/team/cell_show.R', 'R/frontends/team/results_dashboard.R')) {
  env <- new.env(parent = globalenv())
  sys.source(file, envir = env)
  if (!exists('team_violin_style', envir = env, mode = 'function'))
    stop('FAIL ', file, ' loaded alone has no team_violin_style()')
  if (!exists('plotly_build.team_violin_style', envir = env, mode = 'function'))
    stop('FAIL ', file, ' loaded alone has no plotly_build.team_violin_style()')
  cat('PASS', file, 'loads the Team violin style helper on its own\n')
}
