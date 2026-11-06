suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
rd_class <- function(x) sub('\\(.*','',x)
sample_metadata_csv_safe <- identity
lipidomic_plotly_event <- function(...) NULL
source('R/frontends/team/cell_show.R');source('R/frontends/team/plot_instances.R')
df <- data.frame(Lipid=c('PC(34:1)','PE(36:2)'),S1=c(10,50),S2=c(20,60),S3=c(30,70),S4=c(40,80),check.names=FALSE)
meta <- data.frame(FullName=names(df)[-1],Group1=c('A','A','B','B'))
value <- function(x){force(x);function(...)x}
hub <- list(data_processed=value(df),all_metadata=value(meta),preparation_audit=value(list(normalization='none',imputation='none')),preparation_dirty=value(FALSE))
server <- function(input,output,session){team_cell_instance_server('tcinstance_a',hub);team_cell_instance_server('tcinstance_b',hub)}
testServer(server,{
 for(id in c('tcinstance_a','tcinstance_b')) {
   x<-list('Group1','A','B','PC','feature','PC(34:1)','S1','share');names(x)<-paste0(id,'-',c('cell_group_column','cell_reference_group','cell_comparison_group','cell_class','cell_explore_level','cell_lipid','cell_sample','cell_profile_view'));do.call(session$setInputs,x)
 }
 session$flushReact()
 for(key in team_cell_instance_outputs) stopifnot(nzchar(output[[paste0('tcinstance_a-',key)]]))
 for(key in c('cell_class_plot','cell_comparison_plot')) {a_source<-jsonlite::fromJSON(output[[paste0('tcinstance_a-',key)]])$x$source;b_source<-jsonlite::fromJSON(output[[paste0('tcinstance_b-',key)]])$x$source;stopifnot(startsWith(a_source,'tcinstance_a-'),startsWith(b_source,'tcinstance_b-'),!identical(a_source,b_source))}
 a<-read.csv(output[['tcinstance_a-cell_lipid_csv']]);stopifnot(identical(a$Prepared_signal,c(10L,20L,30L,40L)))
 session$setInputs(`tcinstance_b-cell_class`='PE',`tcinstance_b-cell_lipid`='PE(36:2)',`tcinstance_b-cell_sample`='S2',`tcinstance_b-cell_profile_view`='log');session$flushReact()
 b<-read.csv(output[['tcinstance_b-cell_lipid_csv']]);stopifnot(identical(b$Prepared_signal,c(50L,60L,70L,80L)),identical(read.csv(output[['tcinstance_a-cell_lipid_csv']])$Prepared_signal,a$Prepared_signal))
 stopifnot(all(read.csv(output[['tcinstance_b-cell_profile_csv']])$Sample=='S2'))
})
for(key in team_cell_instance_outputs){x<-list(id='tcinstance_a',source=key,inputs=list(cell_sample='S1'));stopifnot(identical(team_plot_instance_validate(x,paste0('tcinstance_a-',key))$source,key))}
bad<-list(id='tcinstance_a',source='cell_other_plot',inputs=list());stopifnot(inherits(try(team_plot_instance_validate(bad),silent=TRUE),'try-error'))
cat('PASS cell plots, independent CSV, profile, source validation\n')
