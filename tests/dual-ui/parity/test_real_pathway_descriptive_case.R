# Actual pathway output construction with an explicit QA comparison of observed
# Healthy vs SC-SteadyState. Inference gate remains FALSE: all p-values must be NA.
source('R/global.R');hubs<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'));results<-list();value<-function(x){force(x);function(...)x}
find_ast<-function(node,p){if(p(node))return(node);if(is.recursive(node))for(i in seq_along(node)){x<-tryCatch(find_ast(node[[i]],p),error=function(e)NULL);if(!is.null(x))return(x)};NULL}
ast<-parse('R/modules/13_pathway_module.R')
for(policy in c('classic','team')){
 d<-hubs[[policy]];meta<-d$metadata;meta$Dynamic_DE_Group<-meta$Group1;stopifnot(all(c('Healthy','SC-SteadyState')%in%meta$Group1))
 e<-new.env(parent=globalenv());e$session<-shiny::MockShinySession$new();e$shared_data<-list(data_processed=value(d$matrix),annotationData=value(d$annotation),all_metadata=value(meta),grouped_metadata=value(meta),de_contrast_info=value(list(ref='Healthy',comp='SC-SteadyState')),inference_allowed=function(...)FALSE)
 e$input<-list(filter_consolidated=FALSE,node_color_map='fc',node_size_map='fc_mag',classLabelFormat='short',enable_physics=FALSE)
 e$active_classes<-value(DEFAULT_PATHWAY_CLASSES);for(n in c('removed_edges','added_edges','position_overrides','custom_nodes'))e[[n]]<-value(list())
 for(name in c('is_consolidated','count_saturated_unsaturated','map_species_to_pathway_class','get_current_pos','get_current_label_pos','auto_label_pos','compute_current_edges','get_plasma_color','get_divergent_color','scale_fold_change','pathway_metrics','buildPathwayPlot')){
  expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name)));stopifnot(!is.null(expr));eval(expr,e)
 }
 metrics<-shiny::isolate(e$pathway_metrics());stopifnot(nrow(metrics)>0L,all(is.na(metrics$P_Value)),all(is.na(metrics$P_Adj)))
 classes<-mapply(e$map_species_to_pathway_class,d$annotation$subclass,d$annotation$modification);mat<-as.matrix(d$matrix[-1]);rownames(mat)<-d$matrix$Lipid_Name
 for(i in seq_len(nrow(metrics))){lipids<-d$annotation$Lipid_Name[!is.na(classes)&classes==metrics$Class[i]];signal<-colSums(mat[intersect(lipids,rownames(mat)),,drop=FALSE]);g<-meta$Group1[match(names(signal),meta$FullName)];ref<-mean(signal[g=='Healthy']);cmp<-mean(signal[g=='SC-SteadyState']);stopifnot(abs(metrics$Ref_Abundance[i]-ref)/max(1,abs(ref))<1e-12,abs(metrics$Comp_Abundance[i]-cmp)/max(1,abs(cmp))<1e-12,abs(metrics$Abundance_FC[i]-cmp/ref)<1e-12)}
 plot<-shiny::isolate(e$buildPathwayPlot());built<-plotly::plotly_build(plot);stopifnot(length(built$x$data)>0)
 results[['pathway_tab-pathwayPlot']][[policy]]<-list(status='PASS',measured_classes=nrow(metrics),inference_suppressed=TRUE,metrics_sha256=digest::digest(metrics,algo='sha256'),traces_sha256=digest::digest(built$x$data,algo='sha256'))
 expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],quote(output$pathwayVisNetwork)));fn<-eval(call('function',pairlist(),expr[[3]][[2]]),e);widget<-shiny::isolate(fn());stopifnot(inherits(widget,'visNetwork'),nrow(widget$x$nodes)>0L)
 results[['pathway_tab-pathwayVisNetwork']][[policy]]<-list(status='PASS',nodes=nrow(widget$x$nodes),edges=nrow(widget$x$edges),inference_suppressed=TRUE,widget_graph_sha256=digest::digest(widget$x[c('nodes','edges')],algo='sha256'))
}
for(id in names(results))stopifnot(identical(results[[id]]$classic,results[[id]]$team))
out<-Sys.getenv('PATHWAY_CASE_JSON');if(nzchar(out))jsonlite::write_json(results,out,pretty=TRUE,auto_unbox=TRUE)
cat('PASS: actual pathway Plotly and visNetwork objects build with independent linear class means/abundance FC, observed Healthy-vs-SC-SteadyState QA contrast, and all p-values suppressed; graph payloads agree. No mechanism, biological pathway flux, browser interaction or frozen capture validated.\n')
