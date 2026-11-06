# Team's distribution payload drops Plotly's unevaluated trace specs (x$attrs), which
# repeat every value and are never read by the browser. The plotted traces and layout
# must be exactly what Plotly builds from the same specs.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R'); source('R/frontends/team/results_dashboard.R')
value <- function(x) {force(x); function(...)x}
set.seed(123)
df <- data.frame(Lipid=paste0('PC(',seq_len(120),':1)'),matrix(runif(120*67,1,100),ncol=67),check.names=FALSE)
names(df)[-1] <- paste0('S',seq_len(67))
meta <- data.frame(FullName=names(df)[-1],Group1=rep(c('A','B','C'),length.out=67),Group2='X')
hub <- list(data_processed=value(df),all_metadata=value(meta),color_maps=value(list()),class_color_map=value(list()),preparation_dirty=value(FALSE),team_compact_distribution=TRUE)
render <- function(drop) {
  if (!drop) { built <- plotly_build.team_compact_distribution; body(built) <- quote({ class(p) <- setdiff(class(p), 'team_compact_distribution'); p <- plotly::plotly_build(p, ...); p$x$data <- lapply(p$x$data, function(trace) { h <- trace$hovertemplate; if (is.character(h) && length(h) > 1L && !anyNA(h) && all(h == h[[1L]])) trace$hovertemplate <- h[[1L]]; trace }); p }); assign('plotly_build.team_compact_distribution', built, envir = globalenv()); on.exit(source('R/frontends/team/results_dashboard.R')) }
  result <- NULL
  shiny::testServer(function(input,output,session) results_dashboard_module_server(input,output,session,hub),{
    session$setInputs(color_by='Group1',n_class=7L,top_n=10L);session$flushReact(); result <<- output$plot_dist })
  result
}
old <- render(FALSE); new <- render(TRUE)
a <- jsonlite::fromJSON(old,simplifyVector=FALSE); b <- jsonlite::fromJSON(new,simplifyVector=FALSE)
# W7b2: Team also packs x/y for transport (www/team/js/plot_payload.js restores them; see
# test_team_distribution_compact.R) and drops visdat/cur_data. Unpack as the browser does.
stopifnot(identical(b$x$teamPacked,1L)); b$x$teamPacked <- NULL; a$x[c('visdat','cur_data')] <- NULL
b$x$data <- lapply(b$x$data,function(tr){
  if (is.list(tr$x) && !is.null(tr$x$teamRepeat)) tr$x <- as.list(rep(tr$x$teamRepeat,tr$x$n))
  if (is.list(tr$y) && !is.null(tr$y$teamFloat64)) { r <- jsonlite::base64_dec(tr$y$teamFloat64); tr$y <- as.list(readBin(r,'double',length(r)/8L,size=8L,endian='little')) }
  tr })
stopifnot(length(a$x$attrs) > 0L, length(b$x$attrs) == 0L, length(b$x$data) == 67L)
for (n in c('data','layout','config','source','shinyEvents','highlight')) if (!identical(a$x[[n]], b$x[[n]])) stop('payload part changed: ', n)
stopifnot(identical(a[setdiff(names(a),'x')], b[setdiff(names(b),'x')]), nchar(new,type='bytes') < nchar(old,type='bytes')*.3)
cat('PASS Team distribution traces/layout identical without x$attrs; bytes',nchar(old,type='bytes'),'->',nchar(new,type='bytes'),'\n')
