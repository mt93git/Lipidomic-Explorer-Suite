# Real 67-sample Team dashboard CSV numerical checks; descriptive only.
# The RDS is a private, separately prepared Classic/Team hub replay, not a
# capture of the live browser matrix. Output reports aggregate counts only.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R')
source('R/results_dashboard.R')
p<-Sys.getenv('PRIVATE_HUB_RDS');if(!nzchar(p))stop('Set PRIVATE_HUB_RDS')
d<-readRDS(p)$team; value<-function(x){force(x);function(...)x}
mat<-as.matrix(d$matrix[-1]);rownames(mat)<-d$matrix$Lipid_Name
stopifnot(identical(dim(mat),c(2031L,67L)),all(is.finite(mat)),all(mat>0),
  !anyDuplicated(rownames(mat)),!anyDuplicated(colnames(mat)))
meta<-d$metadata[match(colnames(mat),d$metadata$FullName),,drop=FALSE]
stopifnot(identical(meta$FullName,colnames(mat)),!anyNA(meta$Group1))
hub<-list(data_processed=value(d$matrix),all_metadata=value(meta),preparation_audit=value(list(normalization='median',imputation='QRILC')),
 preparation_dirty=value(FALSE),color_maps=value(d$color_maps),class_color_map=value(d$class_colors))
server<-function(input,output,session)results_dashboard_module_server(input,output,session,hub)
shiny::testServer(server,{
 session$setInputs(color_by='Group1',n_class=7L,top_n=50L)
 targets<-unique(c('PC(16:0_20:4)+AcO',rownames(mat)[1:2]));stopifnot(all(targets %in% rownames(mat)))
 for(lipid in targets){
   session$setInputs(violin_lipid=lipid);session$flushReact()
   x<-read.csv(output$dl_violin,check.names=FALSE,stringsAsFactors=FALSE)
   v<-mat[lipid,match(x$Sample,colnames(mat))]
   stopifnot(nrow(x)==67L,all(is.finite(v)),max(abs(x$Prepared_abundance-v)/pmax(1,abs(v)))<1e-12,
     max(abs(x$Log10_abundance-log10(v)))<1e-12,
     identical(x$Group,as.character(meta$Group1[match(x$Sample,meta$FullName)])))
 }
 cat(sprintf('PASS violin: %d lipids x 67 values, prepared and log10 and group match\n',length(targets)))
 distribution<-read.csv(output$dl_dist,check.names=FALSE,stringsAsFactors=FALSE)
 ix<-cbind(match(distribution$Lipid_Name,rownames(mat)),match(distribution$Sample,colnames(mat)))
 stopifnot(nrow(distribution)==length(mat),!anyNA(ix),!anyDuplicated(paste(distribution$Lipid_Name,distribution$Sample)),
  max(abs(distribution$log10_abundance-log10(mat[ix])))<1e-12,
  identical(distribution$Group,as.character(meta$Group1[match(distribution$Sample,meta$FullName)])))
 cat(sprintf('PASS distribution: %d lipid/sample log10 values and groups\n',nrow(distribution)))
 comp<-read.csv(output$dl_comp,check.names=FALSE,stringsAsFactors=FALSE)
 # Build independent sample × class totals from source names and values.
 classes<-toupper(sub('[( /_\\-].*','',trimws(rownames(mat))))
 cls_mat<-rowsum(mat,classes,reorder=TRUE); tot<-colSums(cls_mat)
 for(i in seq_len(nrow(comp))){
   sample<-match(comp$Sample[i],colnames(mat));cl<-as.character(comp$Class[i]);expected<-cls_mat[cl,sample]
   stopifnot(comp$Selected[i],abs(comp$Signal_sum[i]-expected)/pmax(1,abs(expected))<1e-12,
     abs(comp$Share_pct[i]-100*expected/tot[sample])<1e-10)
 }
 stopifnot(nrow(comp)==67L*nrow(cls_mat),!'Other classes'%in%comp$Class)
 cat(sprintf('PASS composition: %d separately named class/sample sums and shares; no Other\n',nrow(comp)))
 heat<-read.csv(output$dl_heat,check.names=FALSE,stringsAsFactors=FALSE)
 lm<-log10(mat);variances<-apply(lm,1,var);z<-t(scale(t(lm)))
 top50<-names(sort(variances,decreasing=TRUE))[1:50]
 groups<-unique(meta$Group1)
 stopifnot(nrow(heat)==50L*length(groups),setequal(unique(heat$Lipid_Name),top50),all(heat$Visible))
 for(i in seq_len(nrow(heat))){sel<-meta$Group1==heat$Group[i];lip<-heat$Lipid_Name[i]
   stopifnot(heat$Group_n[i]==sum(sel),abs(heat$mean_z[i]-mean(z[lip,sel]))<1e-12,
     abs(heat$mean_log10[i]-mean(lm[lip,sel]))<1e-12,
     abs(heat$log10_variance[i]-variances[lip])<1e-12)
 }
 cat(sprintf('PASS heatmap: %d group cells; top50 cohort variance, mean log10 and mean sample z-score\n',nrow(heat)))
})
cat('PASS: 67-sample, 2031-lipid, 0% detection Team dashboard CSVs; no inferential tests or pixel comparison\n')
