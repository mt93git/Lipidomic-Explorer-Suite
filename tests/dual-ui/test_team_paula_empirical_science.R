# PRIVATE_HUB_RDS points to the prepared fixture; never print sample identifiers.
suppressPackageStartupMessages(library(shiny))
`%||%`<-function(a,b)if(is.null(a))b else a
lipidomic_plotly_event<-function(...)NULL
source('R/sample_metadata_import.R');source('R/results_dashboard.R')
d<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'))$team
mat<-as.matrix(d$matrix[-1]);storage.mode(mat)<-'double';rownames(mat)<-make.unique(as.character(d$matrix[[1]]))
stopifnot(identical(dim(mat),c(2031L,67L)))
g<-as.character(d$metadata$Group1[match(colnames(mat),d$metadata$FullName)]);g[is.na(g)|!nzchar(g)]<-'Unassigned'
stopifnot(identical(sort(as.integer(table(g))),c(16L,17L,34L)))
lipid <- 'CE(16:0)+NH4';stopifnot(lipid %in% rownames(mat))
value<-function(x){force(x);function(...)x}
hub<-list(data_processed=value(d$matrix),all_metadata=value(d$metadata),preparation_audit=value(list(normalization='median',imputation='QRILC')),preparation_dirty=value(FALSE),color_maps=value(d$color_maps),class_color_map=value(d$class_colors),team_compact_distribution=TRUE)
server<-function(input,output,session){dashboard<-results_dashboard_module_server(input,output,session,hub)}
shiny::testServer(server,{
 session$setInputs(color_by='Group1',violin_lipid=lipid,top_n=50L,heat_group_selection='__ALL__',heat_lipid_selection='__ALL__');session$flushReact()
 raw<-as.numeric(mat[lipid,]);keep<-is.finite(raw)&raw>0
 v<-dashboard$violin_data();stopifnot(nrow(v)==sum(keep),identical(v$Sample,colnames(mat)[keep]),identical(v$Group,g[keep]),isTRUE(all.equal(v$Prepared_abundance,raw[keep],tolerance=1e-12)),isTRUE(all.equal(v$Log10_abundance,log10(raw[keep]),tolerance=1e-12)))
 csv<-read.csv(output$dl_violin,check.names=FALSE,stringsAsFactors=FALSE);stopifnot(nrow(csv)==sum(keep),identical(csv$Sample,v$Sample),isTRUE(all.equal(csv$Prepared_abundance,v$Prepared_abundance,tolerance=1e-12)),isTRUE(all.equal(csv$Log10_abundance,v$Log10_abundance,tolerance=1e-12)))
 plots<-jsonlite::fromJSON(output$plot_violin,simplifyVector=FALSE)$x$data
 rendered<-sort(unlist(lapply(plots,function(t)unlist(t$y)),use.names=FALSE));stopifnot(length(rendered)==sum(keep),isTRUE(all.equal(rendered,sort(log10(raw[keep])),tolerance=1e-7)))
 full<-mat;full[!is.finite(full)|full<=0]<-NA_real_;logs<-log10(full);complete<-rowSums(is.na(logs))==0;sdv<-apply(logs[complete,,drop=FALSE],1,sd);eligible<-names(sdv)[sdv>0];z<-t(scale(t(logs[eligible,,drop=FALSE])))
 h<-dashboard$heatmap();stopifnot(setequal(h$lipids,eligible),h$n_incomplete==sum(!complete),h$n_constant==sum(sdv==0))
 expected<-sapply(h$groups,function(group)rowMeans(z[,g==group,drop=FALSE]));rownames(expected)<-eligible
 stopifnot(isTRUE(all.equal(unname(h$full_z),unname(expected[h$lipids,h$groups,drop=FALSE]),tolerance=1e-10)))
 hc<-read.csv(output$dl_heat,check.names=FALSE,stringsAsFactors=FALSE);for(group in h$groups){r<-hc[hc$Group==group,];stopifnot(all(r$Group_n==sum(g==group)),isTRUE(all.equal(r$mean_z,as.numeric(expected[r$Lipid_Name,group]),tolerance=1e-10)))}
 heat<-jsonlite::fromJSON(output$plot_heat,simplifyVector=FALSE)$x$data[[1]];rendered_z<-do.call(rbind,lapply(heat$z,unlist));stopifnot(isTRUE(all.equal(unname(rendered_z),unname(h$z),tolerance=1e-7)))
 before<-h$full_z;lim<-h$lim;session$setInputs(heat_group_selection=jsonlite::toJSON(h$groups[1],auto_unbox=FALSE));selected<-dashboard$heatmap();stopifnot(identical(before,selected$full_z),identical(lim,selected$lim),isTRUE(all.equal(unname(selected$z),unname(before[selected$lipids_visible,h$groups[1],drop=FALSE]),tolerance=1e-12)))
 dist<-dashboard$distribution();expected_count<-sum(is.finite(mat)&mat>0);stopifnot(nrow(dist)==expected_count,all(is.finite(dist$log10_abundance)))
 dc<-read.csv(output$dl_dist,check.names=FALSE,stringsAsFactors=FALSE);stopifnot(nrow(dc)==expected_count,isTRUE(all.equal(dc$log10_abundance,dist$log10_abundance,tolerance=1e-12)))
 dt<-jsonlite::fromJSON(output$plot_dist,simplifyVector=FALSE)$x$data;ploty<-sort(unlist(lapply(dt,function(t)unlist(t$y)),use.names=FALSE));stopifnot(length(ploty)==expected_count,isTRUE(all.equal(ploty,sort(log10(mat[is.finite(mat)&mat>0])),tolerance=1e-7)))
 cat('PASS CE(16:0)+NH4 prepared values, grouping, log10 render and CSV; counts 16/17/34; omitted',sum(!keep),'\n')
 cat('PASS heatmap all eligible cohort z-score means, rendered matrix, CSV and group-filter invariance; incomplete',sum(!complete),'constant',sum(sdv==0),'\n')
 cat('PASS distribution positive finite values, rendered values and CSV; omitted',sum(!is.finite(mat)|mat<=0),'\n')
})
# Controlled perturbation checks exclusions because this prepared fixture has no missing/nonpositive values.
perturbed<-d$matrix;row<-match(lipid,as.character(perturbed[[1]]));perturbed[row,2]<-NA_real_;perturbed[row,3]<-0;perturbed[row,4]<--1
hub_missing<-hub;hub_missing$data_processed<-value(perturbed)
shiny::testServer(function(input,output,session){dashboard<-results_dashboard_module_server(input,output,session,hub_missing)},{
 session$setInputs(color_by='Group1',violin_lipid=lipid,top_n=50L,heat_group_selection='__ALL__',heat_lipid_selection='__ALL__');session$flushReact()
 v<-dashboard$violin_data();stopifnot(nrow(v)==64L,nrow(read.csv(output$dl_violin))==64L)
 h<-dashboard$heatmap();stopifnot(h$n_incomplete==1L,!lipid %in% h$lipids)
 dist<-dashboard$distribution();stopifnot(nrow(dist)==length(mat)-3L,nrow(read.csv(output$dl_dist))==length(mat)-3L)
 cat('PASS controlled NA/zero/negative: violin and distribution omit all three; heatmap excludes affected lipid\n')
})
