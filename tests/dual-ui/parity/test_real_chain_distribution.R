# Production raw chain extraction, descriptively on the 67-sample real dataset.
source('R/global.R')
p<-Sys.getenv('PRIVATE_HUB_RDS');if(!nzchar(p))stop('Set PRIVATE_HUB_RDS')
r<-readRDS(p); ast<-parse('R/modules/8_structural_module.R')
find_ast<-function(x,pred){if(pred(x))return(x);if(is.recursive(x))for(i in seq_along(x)){v<-tryCatch(find_ast(x[[i]],pred),error=function(e)NULL);if(!is.null(v))return(v)};NULL}
expr<-find_ast(ast,function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name('extract_filtered_raw_chain_data')))
stopifnot(!is.null(expr));e<-new.env(parent=globalenv());eval(expr,e)
res<-list()
for(policy in c('classic','team')) {
 d<-r[[policy]]; raw<-e$extract_filtered_raw_chain_data(d$matrix,d$metadata,d$annotation,
  grp_var='Group1',grp_level='Lipid Main Class',class_mode='major',cls_targets='all',val_mode='Absolute (%)',pos_mode='both')
 stopifnot(!is.null(raw),nrow(raw$df_long)>0)
 out<-raw$df_long; sums<-out %>% dplyr::group_by(Lipid_Name,FullName) %>% dplyr::summarise(total=sum(Intensity),.groups='drop')
 mat<-as.matrix(d$matrix[-1]);rownames(mat)<-d$matrix$Lipid_Name
 ix<-cbind(match(sums$Lipid_Name,rownames(mat)),match(sums$FullName,colnames(mat)));original<-mat[ix]
 stopifnot(!anyNA(ix),nrow(sums)==length(mat),max(abs(sums$total-original)/pmax(1,abs(original)))<1e-12,
  length(unique(out$FullName))==67L)
 res[[policy]]<-out
 cat(sprintf('%s: %d acyl-chain/sample observations; %d lipid/sample totals across 67 samples preserve prepared intensity\n',policy,nrow(out),nrow(sums)))
}
stopifnot(isTRUE(all.equal(res$classic,res$team,tolerance=1e-12)))
cat('PASS: actual raw chain extractor matches across policies and conserves total signal, with position=both and all classes; descriptive only\n')
