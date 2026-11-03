# Real Paula67 must not enter independent correlation inference when denied.
# Approved-branch check uses an exception sentinel, never a fabricated analysis.
suppressPackageStartupMessages({library(shiny);library(ggplot2)})
`%||%`<-function(x,y)if(is.null(x))y else x
source('R/modules/utils_stats.R');source('R/frontends/team/inferential_network_adapter.R')
hub<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'))$team;stopifnot(ncol(hub$matrix)==68L)
find_ast<-function(node,p){if(p(node))return(node);if(is.recursive(node))for(i in seq_along(node)){x<-tryCatch(find_ast(node[[i]],p),error=function(e)NULL);if(!is.null(x))return(x)};NULL}
generator<-find_ast(parse('R/global.R'),function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name('generate_empty_plot_message')));stopifnot(!is.null(generator));eval(generator)
results<-list()
for(kind in c('structural','fla')){
 file<-if(kind=='structural')'R/modules/8_structural_module.R'else'R/modules/10_fla_module.R';symbol<-if(kind=='structural')'structural_server'else'fla_server';reactive_name<-if(kind=='structural')'networkData'else'correlation_data';output_name<-if(kind=='structural')'networkPlot'else'plotCircos'
 original_env<-new.env(parent=globalenv());sys.source(file,original_env);original<-original_env[[symbol]];before<-serialize(body(original),NULL);adapted<-team_inferential_network_adapter(original,kind);stopifnot(identical(before,serialize(body(original),NULL)))
 drift<-original;body(drift)<-quote(NULL);stopifnot(inherits(try(team_inferential_network_adapter(drift,kind),silent=TRUE),'try-error'))
 ast<-body(adapted);data_expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(reactive_name)))
 target<-substitute(output$NAME,list(NAME=as.name(output_name)));out_expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],target))
 e<-new.env(parent=globalenv());e$session<-shiny::MockShinySession$new();policy<-shiny::reactiveVal(FALSE);touches<-0L;e$input<-list();e$shared_data<-list(inference_allowed=function(...)policy(),data_processed=function(){touches<<-touches+1L;stop('ORIGINAL_PATH_SENTINEL')},annotationData=function()hub$annotation)
 e$processed_db<-function(){touches<<-touches+1L;stop('ORIGINAL_PATH_SENTINEL')}
 eval(data_expr,e);stopifnot(is.null(shiny::isolate(e[[reactive_name]]())),touches==0L)
 fn<-eval(call('function',pairlist(),out_expr[[3]][[2]]),e);p<-shiny::isolate(fn());layers<-ggplot2::ggplot_build(p)$data;labels<-unlist(lapply(layers,function(x)x$label));stopifnot(any(grepl('confirmed independent study design',gsub('[[:space:]]+',' ',labels))),touches==0L)
 tmp<-tempfile(fileext='.png');grDevices::png(tmp,width=1100,height=650);tryCatch(print(p),finally=grDevices::dev.off());stopifnot(file.info(tmp)$size>0);unlink(tmp)
 if(kind=='fla'){
  assignment<-function(name)find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name)))
  output_assignment<-function(name)find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],substitute(output$NAME,list(NAME=as.name(name)))))
  eval(assignment('circos_plot_logic'),e)
  direct<-shiny::isolate(e$circos_plot_logic());stopifnot(is.function(direct),'include_title'%in%names(formals(direct)),touches==0L)
  pdf_file<-tempfile(fileext='.pdf');pdf_handler<-eval(output_assignment('downloadCircosPDF')[[3]][['content']],e);shiny::isolate(pdf_handler(pdf_file));stopifnot(file.exists(pdf_file),file.info(pdf_file)$size>0,touches==0L);unlink(pdf_file)
  csv_file<-tempfile(fileext='.csv');csv_handler<-eval(output_assignment('downloadCorrCSV')[[3]][['content']],e);blocked_csv<-tryCatch(shiny::isolate(csv_handler(csv_file)),error=identity);stopifnot(inherits(blocked_csv,'shiny.silent.error'),!file.exists(csv_file),touches==0L)
  title_fn<-eval(call('function',pairlist(),output_assignment('circos_dynamic_title')[[3]][[2]]),e);stopifnot(is.null(shiny::isolate(title_fn())))
  table_fn<-eval(call('function',pairlist(),output_assignment('corrTable')[[3]][[2]]),e);blocked_table<-tryCatch(shiny::isolate(table_fn()),error=identity);stopifnot(inherits(blocked_table,'shiny.silent.error'),touches==0L)
 }
 policy(TRUE);forward<-try(shiny::isolate(e[[reactive_name]]()),silent=TRUE);stopifnot(inherits(forward,'try-error'),grepl('ORIGINAL_PATH_SENTINEL',as.character(forward)),touches>0L)
 policy(FALSE);before_denied<-touches;stopifnot(is.null(shiny::isolate(e[[reactive_name]]())),touches==before_denied)
 id<-paste0(if(kind=='structural')'structural_tab-'else'fla_tab-',output_name)
 results[[id]]<-list(status='SCIENCE_GATE_PASS',denied_data_touches=0L,denied_correlation_data=NULL,message=labels,approved_branch_forwarded_to_original=TRUE,classic_body_unchanged=TRUE,structural_drift_rejected=TRUE,reactive_false_true_false=TRUE,denied_downstream_consumers=if(kind=='fla')c('plot','title','table','CSV','PDF','direct_logic')else'plot_only_consumer')
}
out<-Sys.getenv('NETWORK_GATE_JSON');if(nzchar(out))jsonlite::write_json(results,out,auto_unbox=TRUE,pretty=TRUE,null='null')
cat('PASS: Team independent-network gates render informative PNG, return no correlation data and never touch denied analysis; approved branch forwards to original sentinel only; Classic bodies unchanged. No sample independence was assumed.\n')
