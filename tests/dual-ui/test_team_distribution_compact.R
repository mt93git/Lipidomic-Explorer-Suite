suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R'); source('R/results_dashboard.R')
value <- function(x) {force(x); function(...)x}
set.seed(123)
df <- data.frame(Lipid=paste0('PC(',seq_len(120),':1)'),matrix(runif(120*67,1,100),ncol=67),check.names=FALSE)
names(df)[-1] <- paste0('S',seq_len(67))
meta <- data.frame(FullName=names(df)[-1],Group1=rep(c('A','B','C'),length.out=67),Group2='X')
hub <- list(data_processed=value(df),all_metadata=value(meta),color_maps=value(list()),class_color_map=value(list()),preparation_dirty=value(FALSE))
real_path <- Sys.getenv('TEAM_COMPACT_PRIVATE_RDS')
if(nzchar(real_path)) {
  private <- readRDS(real_path)$team
  df <- private$matrix; meta <- private$metadata
  hub <- list(data_processed=value(df),all_metadata=value(meta),color_maps=value(private$color_maps),class_color_map=value(private$class_colors),preparation_dirty=value(FALSE))
}
render <- function(compact) {
 h <- hub; if(compact) h$team_compact_distribution <- TRUE
 result <- NULL
 shiny::testServer(function(input,output,session) results_dashboard_module_server(input,output,session,h),{
  session$setInputs(color_by='Group1',n_class=7L,top_n=10L);session$flushReact()
  result <<- output$plot_dist
 })
 result
}
classic <- render(FALSE); team <- render(TRUE)
if(nzchar(Sys.getenv('TEAM_DIST_TEST_PAYLOAD'))) writeLines(team,Sys.getenv('TEAM_DIST_TEST_PAYLOAD'),useBytes=TRUE)
a <- jsonlite::fromJSON(classic,simplifyVector=FALSE)$x$data
b <- jsonlite::fromJSON(team,simplifyVector=FALSE)$x$data
stopifnot(length(a)==length(b),length(a)==ncol(df)-1L)
for(i in seq_along(a)) {
 stopifnot(identical(a[[i]]$x,b[[i]]$x),identical(a[[i]]$y,b[[i]]$y))
 ah <- unlist(a[[i]]$hovertemplate,use.names=FALSE); bh <- unlist(b[[i]]$hovertemplate,use.names=FALSE)
 stopifnot(length(ah)>1L,length(bh)==1L,identical(ah,rep(bh,length(ah))))
 aa <- a[[i]];bb <- b[[i]];stopifnot(identical(bb$fillcolor,bb$line$color),identical(bb$name,aa$name),identical(bb$showlegend,aa$showlegend));aa$hovertemplate <- bb$hovertemplate <- NULL;aa$fillcolor <- bb$fillcolor <- NULL;stopifnot(identical(aa,bb))
}
stopifnot(all(vapply(split(b,vapply(b,function(x)x$name,character(1))),function(traces)length(unique(vapply(traces,function(x)x$fillcolor,character(1))))==1L && sum(vapply(traces,function(x)isTRUE(x$showlegend),logical(1)))==1L,logical(1))))
stopifnot(nchar(team,type='bytes') < nchar(classic,type='bytes')*.8)
cat('PASS Team 67 sample boxes use group fill and one legend per group; values and hover preserved; Classic unchanged; bytes',nchar(classic,type='bytes'),'->',nchar(team,type='bytes'),'\n')
