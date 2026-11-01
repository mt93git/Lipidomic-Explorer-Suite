# All67 real observations, descriptive acyl proportions; no significance or
# differential contrast. Explicit QA settings: all classes, both positions,
# merged classes, observed Group1, all chains, percentage bars, no error bars.
source('R/global.R');hubs<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'));results<-list()
value<-function(x){force(x);function(...)x}
find_ast<-function(node,p){if(p(node))return(node);if(is.recursive(node))for(i in seq_along(node)){x<-tryCatch(find_ast(node[[i]],p),error=function(e)NULL);if(!is.null(x))return(x)};NULL}
ast<-parse('R/modules/8_structural_module.R')
for(policy in c('classic','team')){
 d<-hubs[[policy]];e<-new.env(parent=globalenv());e$shared_data<-list(data_processed=value(d$matrix),all_metadata=value(d$metadata),annotationData=value(d$annotation));e$level_prefs<-list();e$prop_selected_chains<-value(NULL);e$prop_color_map<-value(character())
 e$input<-list(prop_group_var='Group1',prop_group_level='Lipid Main Class',prop_class_mode='major',prop_target_classes='all',prop_value_mode='Absolute (%)',prop_position='both',prop_multiclass_mode='merged',prop_expand_other=TRUE,prop_show_error_bars=FALSE,prop_enable_donut=FALSE)
 for(name in c('extract_filtered_raw_chain_data','prop_raw_chain_data','available_prop_chains_info','buildPropPlotData','propPlotReactive')){
  expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name)));stopifnot(!is.null(expr));eval(expr,e)
 }
 raw<-shiny::isolate(e$prop_raw_chain_data());res<-shiny::isolate(e$buildPropPlotData());stopifnot(nrow(res$data)>0L,!isTRUE(res$is_empty))
 weights<-tapply(raw$df_long$Intensity,list(raw$df_long$AcylChain,raw$df_long$FullName),sum);weights[is.na(weights)]<-0;sample_totals<-colSums(as.matrix(d$matrix[-1]));pct<-sweep(weights,2,sample_totals[colnames(weights)],'/')*100
 groups<-d$metadata$Group1[match(colnames(weights),d$metadata$FullName)]
 expected<-vapply(seq_len(nrow(res$data)),function(i)mean(pct[as.character(res$data$AcylChain[i]),groups==as.character(res$data$GroupingVal[i])]),numeric(1));stopifnot(max(abs(expected-res$data$Mean_Value))<1e-10)
 totals<-tapply(res$data$Mean_Value,res$data$GroupingVal,sum);stopifnot(max(abs(totals-100))<1e-10)
 p<-shiny::isolate(e$propPlotReactive());layers<-ggplot2::ggplot_build(p)$data;tmp<-tempfile(fileext='.png');grDevices::png(tmp,width=1100,height=750);tryCatch(print(p),finally=grDevices::dev.off());stopifnot(file.info(tmp)$size>0);unlink(tmp)
 results[[policy]]<-list(status='PASS',samples=length(unique(raw$df_long$FullName)),plotted_segments=nrow(res$data),group_percent_totals=unname(totals),matrix_sha256=digest::digest(res$data,algo='sha256'),layers_sha256=digest::digest(layers,algo='sha256'))
}
stopifnot(identical(results$classic,results$team))
out<-Sys.getenv('PROP_CASE_JSON');if(nzchar(out))jsonlite::write_json(list('structural_tab-propPlotPlot'=results),out,pretty=TRUE,auto_unbox=TRUE)
cat('PASS: actual acyl proportion reactive renders PNG; every observed group/chain mean agrees with independent raw-chain percentage aggregation, groups sum100%; shared policies agree; descriptive only.\n')
