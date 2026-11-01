suppressPackageStartupMessages(library(shiny))
`%||%`<-function(a,b)if(is.null(a))b else a
lipidomic_plotly_event<-function(...)NULL
source('R/sample_metadata_import.R');source('R/results_dashboard.R')
p<-Sys.getenv('PRIVATE_HUB_RDS');stopifnot(nzchar(p));d<-readRDS(p)$team
mat<-as.matrix(d$matrix[-1]);rownames(mat)<-d$matrix$Lipid_Name;stopifnot(identical(dim(mat),c(2031L,67L)))
value<-function(x){force(x);function(...)x};hub<-list(data_processed=value(d$matrix),all_metadata=value(d$metadata),preparation_audit=value(list(normalization='median',imputation='QRILC')),preparation_dirty=value(FALSE),color_maps=value(d$color_maps),class_color_map=value(d$class_colors))
server<-function(input,output,session){dashboard<-results_dashboard_module_server(input,output,session,hub)}
testServer(server,{
 session$setInputs(color_by='Group1',top_n=50,heat_group_selection='__ALL__',comp_class_selection='__ALL__');session$flushReact()
 h<-dashboard$heatmap();g<-d$metadata$Group1[match(colnames(mat),d$metadata$FullName)];g[is.na(g)|!nzchar(g)]<-'Unassigned';z<-t(scale(t(log10(mat))))
 for(group in h$groups)stopifnot(max(abs(h$full_z[,group]-rowMeans(z[rownames(h$full_z),g==group,drop=FALSE])))<1e-10)
 stopifnot(sum(unique(h$df[c('Group','Group_n')])$Group_n)==67)
 before<-h$full_z;lim<-h$lim;session$setInputs(heat_group_selection=jsonlite::toJSON(h$groups[1],auto_unbox=FALSE));after<-dashboard$heatmap();stopifnot(identical(before,after$full_z),identical(lim,after$lim),ncol(after$z)==1)
 catalog<-dashboard$heatmap();other<-setdiff(catalog$lipids,catalog$default_lipids)[1]
 session$setInputs(heat_lipid_selection=jsonlite::toJSON(other,auto_unbox=FALSE));chosen<-dashboard$heatmap();stopifnot(identical(rownames(chosen$z),other),identical(chosen$full_z,before),identical(chosen$lim,lim))
 session$setInputs(heat_lipid_selection='__EVERY__');every<-dashboard$heatmap();stopifnot(nrow(every$z)==2031,length(unique(every$classes))>=21)
 cat(sprintf('PASS full real catalog: %d eligible species, %d exact class prefixes, explicit non-top species; __EVERY__ returns all rows\n',nrow(every$z),length(unique(every$classes))))
 c<-dashboard$composition();classes<-rd_class(rownames(mat));totals<-rowsum(mat,classes);for(s in colnames(mat)){p<-c[as.character(c$Sample)==s,];stopifnot(max(abs(p$Signal_sum-totals[as.character(p$Class),s])/pmax(1,abs(p$Signal_sum)))<1e-12,abs(sum(p$Share_pct)-100)<1e-8)}
 cat(sprintf('PASS real prepared cohort: %d samples, %d classes, %d heatmap groups, 50 lipid rows; no identifiers emitted\n',ncol(mat),nrow(totals),length(h$groups)))
})
