# Compare an actual browser CSV with separately executed shared-hub PCA.
# Outputs aggregates only; sample IDs and individual values stay private.
paths <- Sys.getenv(c('PRIVATE_HUB_RDS','BROWSER_PCA_CSV'))
if(any(!nzchar(paths))) stop('Set PRIVATE_HUB_RDS and BROWSER_PCA_CSV')
hub <- readRDS(paths[1])$team
csv <- read.csv(paths[2],check.names=FALSE,stringsAsFactors=FALSE)
expected <- hub$pca$score_df
stopifnot(nrow(csv)==67L,nrow(expected)==67L,!anyDuplicated(csv$Sample),!anyDuplicated(expected$FullName),
          setequal(csv$Sample,expected$FullName),
          all(csv$Lipids_used==2031L),all(csv$Scaling=='uv'),all(csv$Transformation=='log2_pmax_plus_1'))
expected <- expected[match(csv$Sample,expected$FullName),,drop=FALSE]
stopifnot(identical(csv$Sample,expected$FullName))
metadata <- hub$metadata[match(csv$Sample,hub$metadata$FullName),,drop=FALSE]
groups_match <- identical(as.character(csv$Group),as.character(metadata$Group1))
score_diff <- sapply(1:2,function(j){a<-csv[[paste0('PC',j)]];b<-expected[[paste0('PC',j)]];min(max(abs(a-b)),max(abs(a+b)))})
mat<-as.matrix(hub$matrix[-1]);mat<-log2(pmax(mat,0)+1);v<-apply(mat,1,var);mat<-mat[is.finite(v)&v>=1e-10,,drop=FALSE]
pc<-prcomp(t(mat),center=TRUE,scale.=TRUE);pct<-100*pc$sdev^2/sum(pc$sdev^2)
variance_diff<-c(max(abs(csv$PC1_variance_pct-pct[1])),max(abs(csv$PC2_variance_pct-pct[2])))
cat(sprintf('Browser PCA rows: %d; features %d; group mapping exact: %s\n',nrow(csv),nrow(mat),groups_match))
cat(sprintf('Sign-invariant maximum absolute score difference PC1 %.12g; PC2 %.12g\n',score_diff[1],score_diff[2]))
cat(sprintf('Variance PC1 %.8f%%; PC2 %.8f%%; maximum percentage-point differences %.12g, %.12g\n',pct[1],pct[2],variance_diff[1],variance_diff[2]))
cat(sprintf('Browser normalization labels: %s; imputation labels: %s\n',paste(unique(csv$Normalization),collapse=','),paste(unique(csv$Imputation),collapse=',')))
if(!groups_match || any(!is.finite(score_diff)) || any(score_diff>1e-9) || any(variance_diff>1e-9)) stop('Browser PCA does not match independently run hub')
cat('PASS: browser PCA matches separately run Team hub scores, variances and groups, up to component signs\n')
