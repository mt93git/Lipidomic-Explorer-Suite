# Produce synthetic 67-sample payloads through the real Team dashboard server.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R'); source('R/results_dashboard.R')
output_dir <- commandArgs(TRUE)[1]; stopifnot(dir.exists(output_dir))
samples <- sprintf('sample%02d',1:67)
mat <- outer(1:20,1:67,function(i,j) 1+i+j/100)
df <- data.frame(Lipid_Name=paste0('PC(',1:20,':0)'),mat,check.names=FALSE)
colnames(df)[-1] <- samples
meta <- data.frame(FullName=samples,Group1=rep(c('A','B'),length.out=67),Group2=rep(c('C','D','E'),length.out=67))
value <- function(x) { force(x); function(...) x }
hub <- list(data_processed=value(df), all_metadata=value(meta), preparation_audit=value(list(normalization='none',imputation='none')), preparation_dirty=value(FALSE), color_maps=value(list(Group1=c(A='#336699',B='#994433'),Group2=c(C='#336699',D='#994433',E='#119999'))), class_color_map=value(c(PC='#336699')))
old_client <- getS3method('[[','mockclientdata'); test_width <- 500
assignInNamespace('[[.mockclientdata',function(x,name) { if(grepl('plot_(dist|comp|heat)_width$',name)) return(test_width); old_client(x,name) },ns='shiny')
server <- function(input,output,session) results_dashboard_module_server(input,output,session,hub)
testServer(server,{
  session$setInputs(color_by='Group1',n_class=7L,top_n=10L); session$flushReact()
  for (name in c('dist','comp','heat')) writeLines(output[[paste0('plot_',name)]],file.path(output_dir,paste0(name,'-500.json')),useBytes=TRUE)
  test_width <<- 900;session$setInputs(color_by='Group2');session$flushReact()
  for (name in c('dist','comp','heat')) invisible(output[[paste0('plot_',name)]])
  session$setInputs(color_by='Group1');session$flushReact()
  for (name in c('dist','comp','heat')) writeLines(output[[paste0('plot_',name)]],file.path(output_dir,paste0(name,'-900.json')),useBytes=TRUE)
})
