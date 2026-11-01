# Synthetic sensitivity fixture: rescale actual prepared linear measurements by
# one constant (values remain proportional) and test the production extractor.
source('R/global.R');p<-Sys.getenv('PRIVATE_HUB_RDS');if(!nzchar(p))stop('Set PRIVATE_HUB_RDS')
d<-readRDS(p)$team;ast<-parse('R/modules/8_structural_module.R')
find_ast<-function(x){if(is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name('extract_filtered_raw_chain_data')))return(x);if(is.recursive(x))for(i in seq_along(x)){v<-tryCatch(find_ast(x[[i]]),error=function(e)NULL);if(!is.null(v))return(v)};NULL}
e<-new.env(parent=globalenv());eval(find_ast(ast),e)
m<-d$matrix;m[-1]<-lapply(m[-1],function(v)v/max(as.matrix(d$matrix[-1]))*20)
raw<-e$extract_filtered_raw_chain_data(m,d$metadata,d$annotation,grp_var='Group1',cls_targets='all',val_mode='Absolute (%)',pos_mode='both')
sums<-raw$df_long %>% dplyr::group_by(Lipid_Name,FullName) %>% dplyr::summarise(total=sum(Intensity),.groups='drop')
mat<-as.matrix(m[-1]);rownames(mat)<-m$Lipid_Name;ix<-cbind(match(sums$Lipid_Name,rownames(mat)),match(sums$FullName,colnames(mat)));expected<-mat[ix]
relative_error<-max(abs(sums$total-expected)/pmax(1,abs(expected)))
cat(sprintf('Low-intensity synthetic rescaling: %d lipid/sample observations; signal preservation correct=%s; max normalized error=%.6g\n',length(expected),relative_error<1e-12,relative_error))
if(relative_error>=1e-12)stop('Low-intensity linear values were not preserved')
