# Real67 descriptive mathematical QA only: cellular class-derived indices and
# Export Studio PCA preview. Neither validates biological phenotypes or inference.
source('R/global.R')
hubs<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'));value<-function(x){force(x);function(...)x}
find_ast<-function(node,p){if(p(node))return(node);if(is.recursive(node))for(i in seq_along(node)){x<-tryCatch(find_ast(node[[i]],p),error=function(e)NULL);if(!is.null(x))return(x)};NULL}
assigned<-function(ast,name)find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name)))
body_for<-function(ast,name){x<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],substitute(output$NAME,list(NAME=as.name(name)))));stopifnot(!is.null(x));x[[3]][[2]]}
render<-function(p){built<-ggplot2::ggplot_build(p);tmp<-tempfile(fileext='.png');grDevices::png(tmp,width=1100,height=850);tryCatch(print(p),finally=grDevices::dev.off());stopifnot(file.info(tmp)$size>0);unlink(tmp);built$data}
results<-list();polar_ast<-parse('R/modules/14_cellular_org_module.R');export_ast<-parse('R/modules/99_export_studio_module.R')
for(policy in c('classic','team')){
 d<-hubs[[policy]];common<-hubs$classic;stopifnot(ncol(d$matrix)==68L)
 meta<-d$metadata;meta$Group<-meta$Group1;meta$Dynamic_DE_Group<-meta$Group1
 h<-list(data_processed=value(d$matrix),annotationData=value(d$annotation),all_metadata=value(meta),grouped_metadata=value(meta),pca_results=value(d$pca),color_maps=value(common$color_maps),preparation_dirty=value(FALSE))
 e<-new.env(parent=globalenv());e$shared_data<-h;e$input<-list(colorGrouping='Group1',groupingMetadata='Group1',useShapes=FALSE,showLabels=FALSE,pointSize=4,textSize=14,target_figure='pca_2d',base_font_pt=7.5,font_family='sans',hybrid_mode=FALSE);e$level_prefs<-list();e$polar_active_color_map<-value(common$color_maps$Group1)
 eval(assigned(polar_ast,'computed_metrics'),e);eval(assigned(polar_ast,'buildPolarPlot'),e)
 metrics<-shiny::isolate(e$computed_metrics());mat<-as.matrix(d$matrix[-1]);classes<-d$annotation$subclass[match(d$matrix$Lipid_Name,d$annotation$Lipid_Name)];total<-colSums(mat)
 sum_cls<-function(cls)colSums(mat[classes%in%cls,,drop=FALSE]);m1<-sum_cls(c('GL_TAG','GL_DAG','ST_CE'))/(total+1e-9)*100;m2<-sum_cls(c('GP_PE_P','GP_PE_E','GP_PC_P','GP_PC_E','SP_SM','SP_Cer'))/(total+1e-9)*100
 ix<-match(metrics$Sample,colnames(mat));stopifnot(nrow(metrics)==67,!anyNA(ix),max(abs(metrics$m1_scaled-m1[ix]))<1e-10,max(abs(metrics$m2_scaled-m2[ix]))<1e-10)
 fn<-eval(call('function',pairlist(),body_for(polar_ast,'polarPlot')),e);layers<-render(shiny::isolate(fn()));stopifnot(any(vapply(layers,nrow,integer(1))==67L))
 results[['cellular_org_tab-polarPlot']][[policy]]<-list(status='PASS',measurements=nrow(metrics),independent_class_indices=TRUE,layers_sha256=digest::digest(layers,algo='sha256'))
 eval(assigned(export_ast,'current_artifacts'),e);art<-shiny::isolate(e$current_artifacts());stopifnot(nrow(art$data)==67L,max(abs(art$data$PC1-d$pca$score_df$PC1))<1e-12,max(abs(art$data$PC2-d$pca$score_df$PC2))<1e-12)
 fn<-eval(call('function',pairlist(),body_for(export_ast,'studio_preview_plot')),e);layers<-render(shiny::isolate(fn()));stopifnot(any(vapply(layers,nrow,integer(1))==67L))
 results[['export_studio-studio_preview_plot']][[policy]]<-list(status='PASS',measurements=nrow(art$data),original_pca_coordinates=TRUE,layers_sha256=digest::digest(layers,algo='sha256'))
}
for(id in names(results))stopifnot(identical(results[[id]]$classic,results[[id]]$team))
out<-Sys.getenv('POLAR_EXPORT_CASES_JSON');if(nzchar(out))jsonlite::write_json(results,out,pretty=TRUE,auto_unbox=TRUE)
cat('PASS: polar class-derived indices independently match67 measurements; actual polar output body and Export Studio PCA preview render PNG; policy layer hashes agree. No cell phenotype, trajectory, or inference validity claimed.\n')
