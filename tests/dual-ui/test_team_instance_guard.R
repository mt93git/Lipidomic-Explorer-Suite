# Regression for the Quality check canvas-copy crash: a copy's module read its
# controls before the browser had bound them (QC: `if (input$classLabelFormat ==
# "full")` on NULL) and the observer error ended the whole Shiny session.
# 1. A copy reads its own pending value, else its module's UI default, until the
#    control reports; a control that reports NULL stays NULL.
# 2. An observer error inside a copy is reported for that copy and the session
#    stays open.
# Usage: R_PROFILE_USER=/dev/null Rscript --vanilla tests/dual-ui/test_team_instance_guard.R
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a))b else a
check <- function(label, ok) if (!isTRUE(ok)) stop(label, call. = FALSE) else cat("ok -", label, "\n")
source('R/frontends/team/plot_instances.R')
seen <- list(); errors <- character(); closed <- FALSE
server <- function(input, output, session) {
  session$onSessionEnded(function() closed <<- TRUE)
  team_plot_instance_guarded(session,'tcinstance_guard',list(classLabelFormat='short',labelParts=c('Group1')),function(e) errors <<- c(errors,conditionMessage(e)),
    moduleServer('tcinstance_guard',function(input,output,session) {
      observe({ seen$format <<- input$classLabelFormat; seen$parts <<- input[['labelParts']] })
      observe({ if (identical(input$explode,TRUE)) stop('copy failure') })
      observe({ seen$nested <<- input$explode })
    }))
}
testServer(server,{
  session$flushReact()
  check("an unbound control reads its UI default", identical(seen$format,'short'))
  check("an unbound checkbox group reads its default selection", identical(seen$parts,'Group1'))
  check("a control without a known default stays NULL", is.null(seen$nested))
  session$setInputs(`tcinstance_guard-classLabelFormat`='full'); session$flushReact()
  check("a reported value replaces the default", identical(seen$format,'full'))
  session$setInputs(`tcinstance_guard-labelParts`=NULL); session$flushReact()
  check("a group the user cleared stays empty (no default resurrected)", is.null(seen$parts))
  session$setInputs(`tcinstance_guard-explode`=TRUE); session$flushReact()
  check("an observer error inside the copy is reported for that copy", identical(errors,'copy failure'))
  check("the session is not closed by the copy's error", !closed && !isTRUE(session$isClosed()))
  session$setInputs(`tcinstance_guard-classLabelFormat`='short'); session$flushReact()
  check("the session keeps running reactives after the error", identical(seen$format,'short'))
})
cat("PASS: a failing canvas copy cannot end the session, and copies read their defaults until bound\n")
