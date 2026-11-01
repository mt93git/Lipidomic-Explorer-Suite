suppressPackageStartupMessages(library(ggplot2))
suppressPackageStartupMessages(library(plotly))
`%||%` <- function(x,y) if(is.null(x)) y else x
source('R/frontends/team/legacy_vector_adapter.R')
source('R/modules/2_qc_boxplot_module.R')
original <- qc_boxplot_server
original_body <- body(original)
adapted <- team_qc_vector_adapter(original)
stopifnot(identical(body(original),original_body))
# Original expressions, including PDF/CSV builders, survive literally in adapted body.
old <- deparse(original_body);new <- deparse(body(adapted))
stopifnot(sum(grepl('team_qc_editable_vector',new,fixed=TRUE))==2L)
removed <- function(node) {
 if(is.call(node)&&identical(node[[1]],as.name('{'))&&length(node)==3L&&
    is.call(node[[3]])&&any(grepl('team_qc_editable_vector',deparse(node[[3]]),fixed=TRUE))) return(node[[2]])
 if(is.call(node))for(i in seq_along(node))if(!is.null(node[[i]]))node[[i]]<-removed(node[[i]])
 node
}
stopifnot(identical(removed(body(adapted)),original_body))
bad<-original;body(bad)<-quote({output$pca2dPlot <- renderPlot({buildPCA2D_ggplot()})})
stopifnot(inherits(try(team_qc_vector_adapter(bad),silent=TRUE),'try-error'))
# More than ten groups, explicit shapes, labels, zero reference lines and legend.
d <- data.frame(x=seq(-5,5,length.out=12),y=seq(8,-3,length.out=12),g=factor(letters[1:12]),label=paste0('Feature ',1:12))
p <- ggplot(d,aes(x,y,color=g,shape=g))+geom_point(size=3)+
 scale_shape_manual(values=rep(c(16,15,17,18,3,4),2))+geom_hline(yintercept=0)+geom_vline(xintercept=0)+
 geom_text(aes(label=label),vjust=-.8,color='black')+labs(x='PC1 (35%)',y='PC2 (12%)',title='2D PCA')+theme_bw()
q <- team_qc_editable_vector(p)
stopifnot(inherits(q,'plotly'))
tr<-q$x$data;stopifnot(sum(vapply(tr,function(t)grepl('markers',t$mode %||% '',fixed=TRUE),logical(1)))>=12L)
stopifnot(length(unique(unlist(lapply(tr,function(t)t$marker$symbol))))>=6L)
stopifnot(sum(vapply(tr,function(t)isTRUE(t$showlegend),logical(1)))>=12L)
stopifnot(identical(q$x$layout$xaxis$title$text,'PC1 (35%)'))
# Empty factor levels preserve the original palette without inventing points.
empty<-d;empty$g<-factor(empty$g,levels=c(levels(d$g),'unused'))
p_empty<-ggplot(empty,aes(x,y,color=g))+geom_point()+scale_color_manual(values=setNames(grDevices::rainbow(13),levels(empty$g)),drop=FALSE)
empty_q<-team_qc_editable_vector(p_empty)
stopifnot(sum(vapply(empty_q$x$data,function(t)length(t$x),integer(1)))==nrow(d))
# Reject unsupported labels/axes rather than silently dropping them.
for(z in list(p+ggrepel::geom_text_repel(aes(label=label)),p+scale_x_log10(),p+coord_polar(),p+facet_wrap(~g))) {
 e<-try(team_qc_editable_vector(z),silent=TRUE);stopifnot(inherits(e,'try-error'))
}
# Mathematical labels remain represented; no suppression of conversion warnings.
math<-ggplot(d,aes(x,y))+geom_point()+labs(x=expression(PC[1]),y=expression(PC[2]))
m<-try(team_qc_editable_vector(math),silent=TRUE)
stopifnot(inherits(m,'try-error'),grepl('mathematical expression',as.character(m),fixed=TRUE))
cat('PASS optional QC vector: original server/download AST unchanged, strict matcher,12 groups/shapes/legend, exact points/text, unsupported labels/axes fail closed\n')
