# Structural-grid current production calculations and CSV for the independent
# 42-subject first-visit fixture. No inference is run over the repeated cohort.
source('R/global.R')
p<-Sys.getenv('PRIVATE_HUB_RDS');if(!nzchar(p))stop('Set PRIVATE_HUB_RDS')
r<-readRDS(p); ast<-parse('R/modules/12_structural_grid_module.R')
find_ast<-function(x,pred){if(pred(x))return(x);if(is.recursive(x))for(i in seq_along(x)){v<-tryCatch(find_ast(x[[i]],pred),error=function(e)NULL);if(!is.null(v))return(v)};NULL}
named<-function(name)find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name)))
out<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&is.call(x[[2]])&&identical(x[[2]][[1]],as.name('$'))&&identical(x[[2]][[2]],as.name('output'))&&identical(x[[2]][[3]],as.name('downloadHeatmapCSV')))
stopifnot(!is.null(out))
res<-list()
for(policy in c('classic','team')){
 d<-r[[policy]]; val<-function(x){force(x);function(...)x}
 joined<-dplyr::left_join(d$de,d$annotation,by='Lipid_Name')
 joined<-joined[joined$Lipid_Name %in% d$filtered_ids,,drop=FALSE]
 eligible<-joined[!is.na(joined$subclass) & !is.na(joined$nCchain1) & !is.na(joined$DBchain1),]
 cls<-names(sort(table(eligible$subclass),decreasing=TRUE))[1];stopifnot(length(cls)==1)
 e<-new.env(parent=globalenv());e$shared_data<-list(de_results=val(d$de),annotationData=val(d$annotation),global_filtered_lipids=val(d$filtered_ids),de_settings=val(d$de_settings))
 e$input<-list(lipid_class=cls,use_hyperclass=FALSE,gridLog2fcThresh=0,position='both',label_type='stars',label_visibility='sig_only')
 eval(named('gridFilteredData'),e);eval(named('gridResults'),e)
 observed<-shiny::isolate(e$gridResults());stopifnot(nrow(observed)>0)
 subset<-joined[joined$subclass==cls,,drop=FALSE]
 one<-subset[!is.na(subset$nCchain1)&!is.na(subset$DBchain1),];two<-subset[!is.na(subset$nCchain2)&!is.na(subset$DBchain2),]
 coords<-rbind(data.frame(Carbon=one$nCchain1,DB=one$DBchain1,log2FC=one$log2FC),data.frame(Carbon=two$nCchain2,DB=two$DBchain2,log2FC=two$log2FC))
 expected<-aggregate(coords$log2FC,list(Carbon=coords$Carbon,DB=coords$DB),function(v)c(n=length(v),mean=mean(v)))
 expected<-expected[order(expected$Carbon,expected$DB),]; actual<-observed[order(observed$Carbon,observed$DB),]
 stopifnot(nrow(actual)==nrow(expected),identical(actual$Carbon,expected$Carbon),identical(actual$DB,expected$DB),
  identical(as.integer(actual$n_lipids),as.integer(expected$x[,'n'])),max(abs(actual$Mean_LFC-expected$x[,'mean']))<1e-12)
 handler<-eval(out[[3]][['content']],e);path<-tempfile(fileext='.csv');shiny::isolate(handler(path));csv<-read.csv(path,check.names=FALSE);unlink(path)
 stopifnot(nrow(csv)==nrow(observed),max(abs(csv$Mean_LFC-observed$Mean_LFC))<1e-12)
 res[[policy]]<-csv
 cat(sprintf('%s: structural grid %d coordinate cells, %d chain observations; production CSV and independent counts/means agree\n',policy,nrow(csv),nrow(coords)))
}
stopifnot(isTRUE(all.equal(res$classic,res$team,tolerance=1e-12)))
cat('PASS: first-visit fixture structural grid CSV and calculation agree between policies; no repeated-sample inference\n')
