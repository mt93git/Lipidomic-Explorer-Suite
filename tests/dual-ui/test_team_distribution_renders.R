# Regression (2026-11-04, W7b2): a restored Signal distribution copy rendered up to four times
# (~11.7 MB each): the saved color_by read while the control was empty and then the same value
# arriving from the browser (identical render), and width reports that left its tick budget
# unchanged. Both guards apply to the Team distribution only; Classic and every other card keep
# f053e56's dependencies. Counts are behavioural (renders per output), with a reactive clientData.
# Usage: R_PROFILE_USER=/dev/null Rscript --vanilla tests/dual-ui/test_team_distribution_renders.R
check <- function(label, ok) if (!isTRUE(ok)) stop(label, call. = FALSE) else cat("ok -", label, "\n")
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R'); source('R/results_dashboard.R'); source('R/frontends/team/plot_instances.R')
value <- function(x) {force(x); function(...)x}
set.seed(7)
df <- data.frame(Lipid=paste0('PC(',seq_len(40),':1)'),matrix(runif(40*12,1,100),ncol=12),check.names=FALSE)
names(df)[-1] <- paste0('S',seq_len(12))
meta <- data.frame(FullName=names(df)[-1],Group1=rep(c('A','B'),6),Group2=rep(c('X','Y','Z'),4))
classic_hub <- list(data_processed=value(df),all_metadata=value(meta),color_maps=value(list()),class_color_map=value(list()),preparation_dirty=value(FALSE))
team_hub <- c(classic_hub,list(team_compact_distribution=TRUE))
# Renders per card: every dashboard plot ends in rd_layout(); tell the cards apart by their axes.
renders <- new.env(); count <- function(k) renders[[k]] %||% 0L
rd_layout_original <- rd_layout
rd_layout <- function(p, ...) { a <- list(...)
  k <- if (identical(a$yaxis$title,'log10(abundance)')) 'dist' else if (identical(a$barmode,'stack')) 'comp' else 'other'
  renders[[k]] <- count(k) + 1L; rd_layout_original(p, ...) }
run <- function(hub, wrap, inputs, body) {
  rm(list=ls(renders),envir=renders)
  shiny::testServer(function(input,output,session) {
    cd <- shiny::reactiveValues(); for (id in c('dist','comp')) cd[[paste0('output_',session$ns(paste0('plot_',id)),'_width')]] <- 600
    session$clientData <- cd; session$userData$cd <- cd
    results_dashboard_module_server(wrap(input),output,session,hub)
  }, { do.call(session$setInputs,inputs); session$flushReact(); output$plot_dist; output$plot_comp; body(session,output) })
}
width <- function(session,output,id,w) { session$userData$cd[[paste0('output_',session$ns(paste0('plot_',id)),'_width')]] <- w; session$flushReact(); output$plot_dist; output$plot_comp }
plain <- function(input) input
base_inputs <- list(color_by='Group1',n_class=7L,top_n=10L,comp_axis_mode='sample')

run(classic_hub, plain, base_inputs, function(session,output) {
  d <- count('dist'); c <- count('comp')
  width(session,output,'dist',610); check("Classic dist re-renders on 600 -> 610, as in f053e56", count('dist') == d + 1L)
  width(session,output,'comp',610); check("Classic comp re-renders on 600 -> 610, as in f053e56", count('comp') == c + 1L)
})
run(team_hub, plain, base_inputs, function(session,output) {
  c <- count('comp')
  width(session,output,'comp',610); check("Team comp (sample mode) re-renders on 600 -> 610, as in f053e56", count('comp') == c + 1L)
  d <- count('dist'); first <- output$plot_dist
  width(session,output,'dist',610); check("Team dist skips a width report within its tick budget (600 -> 610)", count('dist') == d && identical(output$plot_dist,first))
  width(session,output,'dist',700); check("Team dist re-renders when the width crosses into another budget (610 -> 700)", count('dist') == d + 1L)
  width(session,output,'dist',600); check("and back, with the first figure again", count('dist') == d + 2L && identical(output$plot_dist,first))
})

# Saved-value echo in a restored copy (color_by is the only key the distribution reads).
saved <- list(color_by='Group2', pca_scale='none')
copy <- function(input) team_dashboard_instance_input(input, saved)
run(team_hub, copy, list(n_class=7L,top_n=10L,comp_axis_mode='sample'), function(session,output) {
  d <- count('dist'); first <- output$plot_dist; comp <- output$plot_comp
  check("the copy computes from its saved grouping while the control is empty", grepl('"name":"Z"',first,fixed=TRUE))
  session$setInputs(color_by='Group2'); session$flushReact(); output$plot_dist; output$plot_comp
  check("the saved value arriving from the browser does not render the distribution again", count('dist') == d && identical(output$plot_dist,first))
  check("other cards reading the same grouping keep the same figure", identical(output$plot_comp,comp))
  session$setInputs(color_by='Group1'); session$flushReact(); changed <- output$plot_dist
  check("a different value still renders it, with the new grouping", count('dist') == d + 1L && grepl('"name":"A"',changed,fixed=TRUE) && !grepl('"name":"Z"',changed,fixed=TRUE))
})
# The 60 s grace never fires by itself (f053e56 applies it only on a read that happens anyway).
holder <- new.env(); held <- function(input) holder$x <- team_dashboard_instance_input(input, saved)
run(team_hub, held, list(n_class=7L,top_n=10L,comp_axis_mode='sample'), function(session,output) {
  d <- count('dist'); o <- count('other'); first <- output$plot_dist
  assign('until', Sys.time() - 1, envir=.subset2(holder$x,'state')); session$elapse(61000); session$flushReact(); output$plot_dist
  check("past 60 s with an empty control nothing re-renders by itself (no autonomous expiry)", count('dist') == d && count('other') == o && identical(output$plot_dist,first))
})
# Wall-clock expiry: force the grace end, then a read that happens anyway sees the live value.
x <- team_dashboard_instance_input(shiny::reactiveValues(color_by=NULL), saved)
assign('until', Sys.time() - 1, envir=.subset2(x,'state'))
check("after the grace, a read that happens gives the live value (dashboard default), as before", identical(shiny::isolate(x$color_by), team_dashboard_input_defaults()$color_by))
check("other keys keep f053e56's read path (pca_scale 'none' while the control is empty)",
  identical(shiny::isolate(team_dashboard_instance_input(shiny::reactiveValues(pca_scale=NULL), saved)$pca_scale), 'none') && identical(team_dashboard_echo_keys, 'color_by'))
cat("PASS Team distribution renders once per distinct figure input; Classic and other cards unchanged\n")
