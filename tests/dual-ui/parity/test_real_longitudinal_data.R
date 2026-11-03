# Descriptive data preparation only: no time ordering or paired inference.
source('R/global.R')
p<-Sys.getenv('PRIVATE_HUB_RDS');if(!nzchar(p))stop('Set PRIVATE_HUB_RDS')
r<-readRDS(p);ast<-parse('R/modules/11_longitudinal_module.R')
find_ast<-function(x,pred){if(pred(x))return(x);if(is.recursive(x))for(i in seq_along(x)){v<-tryCatch(find_ast(x[[i]],pred),error=function(e)NULL);if(!is.null(v))return(v)};NULL}
named<-function(name)find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name)))
res<-list()
for(policy in c('classic','team')){
 d<-r[[policy]];val<-function(x){force(x);function(...)x}; e<-new.env(parent=globalenv())
 e$input<-list(order_target_var=NULL);e$shared_data<-list(data_processed=val(d$matrix),annotationData=val(d$annotation),all_metadata=val(d$metadata))
 for(name in c('clean_unspecified_labels','resolve_longitudinal_cohort','longData','subclassSumsData','macroclassSumsData')) { x<-named(name);stopifnot(!is.null(x));eval(x,e) }
 long<-shiny::isolate(e$longData());sub<-shiny::isolate(e$subclassSumsData());macro<-shiny::isolate(e$macroclassSumsData())
 stopifnot(nrow(long)==nrow(d$matrix)*(ncol(d$matrix)-1),n_distinct(long$Sample_ID)==67,!anyNA(long$Patient_ID))
 sums<-long %>% dplyr::group_by(Sample_ID,Patient_ID,subclass) %>% dplyr::summarise(expected=log2(sum(Value)+1),.groups='drop')
 comparison<-dplyr::left_join(sub,sums,by=c('Sample_ID','Patient_ID','Metric_Name'='subclass'))
 stopifnot(nrow(comparison)==nrow(sub),!anyNA(comparison$expected),max(abs(comparison$Value-comparison$expected))<1e-10)
 nrep<-sum(table(unique(d$metadata[c('FullName','PatientNumber')])$PatientNumber)>1)
 stopifnot(nrep==12L)
 res[[policy]]<-list(long=long,sub=sub,macro=macro)
 cat(sprintf('%s: %d longitudinal sample/lipid records, %d subclass and %d macroclass records; repeated subjects=%d; descriptive sums verified\n',policy,nrow(long),nrow(sub),nrow(macro),nrep))
}
stopifnot(isTRUE(all.equal(res$classic,res$team,tolerance=1e-12)))
cat('PASS: longitudinal descriptive reactives agree; no order, timeline, paired contrast or authorization has been inferred\n')
