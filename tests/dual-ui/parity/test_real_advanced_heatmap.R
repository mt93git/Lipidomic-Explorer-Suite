# Exercise production heatmap generator on actual Classic and Team matrices.
# Captures the numerical matrix passed to pheatmap, not a pixel comparison.
source('R/global.R')
p <- Sys.getenv('PRIVATE_HUB_RDS'); if(!nzchar(p)) stop('Set PRIVATE_HUB_RDS')
r <- readRDS(p); results <- list(); captured <- NULL
trace('pheatmap',where=asNamespace('pheatmap'),tracer=quote(captured <<- mat),print=FALSE)
for(policy in c('classic','team')) {
 d<-r[[policy]]; mat<-as.matrix(d$matrix[-1]);rownames(mat)<-d$matrix$Lipid_Name
 stopifnot(nrow(mat)==352L,ncol(mat)==67L,all(is.finite(mat)),all(mat>0))
 captured<-NULL
 heat<-generateHeatmapObject(mat,'Real data',sort_mode='none',scale_mode='global_zscore',
                            annotation_data=d$annotation,annotation_cols='subclass',class_colors=d$class_colors)
 stopifnot(!is.null(heat),!is.null(heat$ht$gtable),identical(heat$data,mat))
 expected<-t(scale(t(log2(mat))));limit<-min(4,max(1,ceiling(max(abs(expected)))))
 expected[expected>limit]<-limit;expected[expected< -limit]<- -limit
 stopifnot(identical(dim(captured),dim(expected)),max(abs(captured-expected))<1e-10)
 results[[policy]]<-captured
 cat(sprintf('%s: heatmap generator rendered %d x %d; log2 row-z values match independent calculation\n',policy,nrow(mat),ncol(mat)))
}
stopifnot(isTRUE(all.equal(results$classic,results$team,tolerance=1e-12)))
untrace('pheatmap',where=asNamespace('pheatmap'))
cat('PASS: production heatmap generator values agree across policies; unscaled exported data equal prepared input\n')
