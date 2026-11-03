# Real-project numerical checks for current Team dashboard data exports and
# previously captured Max Classic comparisons. This does not exercise a browser
# or assert that Canvas can discover/render every output.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if (is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R')
source('R/results_dashboard.R')
root <- Sys.getenv('SICKLE_PROJECT')
if (!nzchar(root)) stop('Set SICKLE_PROJECT to the sickle-cell-2026-10-25 directory')
read <- function(path) read.csv(file.path(root,path), check.names=FALSE, stringsAsFactors=FALSE)
raw <- read('analysis/primary_abundance.csv')
prepared <- read('comparison-ui/max_prepared.csv')
restored <- read('comparison-ui/restored_prepared.csv')
metadata <- read('analysis/primary_metadata.csv')
stopifnot(identical(dim(raw),c(2280L,43L)), identical(names(raw),names(prepared)),
          identical(dim(prepared),c(352L,43L)), identical(prepared,restored),
          !anyDuplicated(metadata$sample), all(names(prepared)[-1] %in% metadata$sample))
meta <- metadata[match(names(prepared)[-1],metadata$sample),]
stopifnot(identical(meta$sample,names(prepared)[-1]), all(meta$visit==1),
          length(unique(meta$subject))==42L, identical(sort(as.integer(table(meta$group))),c(17L,25L)))
hub <- list(data_processed=function() prepared,
  all_metadata=function() data.frame(FullName=meta$sample,Group1=meta$group),
  preparation_audit=function() list(normalization='median',imputation='QRILC'),
  preparation_dirty=function() FALSE, color_maps=function() list(),class_color_map=function() NULL)
mat <- as.matrix(prepared[-1]); storage.mode(mat) <- 'double'; rownames(mat) <- prepared[[1]]
stopifnot(all(is.finite(mat)), all(mat>0))
server <- function(input,output,session) results_dashboard_module_server(input,output,session,hub)
shiny::testServer(server, {
  session$setInputs(color_by='Group1',violin_lipid=rownames(mat)[1],pca_transform='linear',pca_scale='uv',n_class=7,top_n=50)
  session$flushReact()
  csv <- function(key) read.csv(output[[paste0('dl_',key)]],check.names=FALSE,stringsAsFactors=FALSE)
  violin <- csv('violin'); pca <- csv('pca'); comp <- csv('comp'); dist <- csv('dist'); heat <- csv('heat')
  stopifnot(nrow(violin)==42L, identical(violin$Sample,colnames(mat)),
    max(abs(violin$Prepared_abundance-mat[1,]))<1e-7,
    max(abs(violin$Log10_abundance-log10(mat[1,])))<1e-12,
    identical(violin$Group,meta$group))
  expected <- prcomp(t(mat),center=TRUE,scale.=TRUE)
  for (j in 1:2) stopifnot(min(max(abs(pca[[paste0('PC',j)]]-expected$x[,j])),
                                  max(abs(pca[[paste0('PC',j)]]+expected$x[,j])))<1e-10)
  old <- read('comparison-ui/matched-dashboard-live.csv')
  stopifnot(identical(pca$Sample,old$Sample), max(abs(pca$PC1-old$PC1))<1e-10,
    max(abs(pca$PC2-old$PC2))<1e-10)
  stopifnot(nrow(dist)==length(mat),
    max(abs(dist$log10_abundance-log10(mat[cbind(match(dist$Lipid_Name,rownames(mat)),match(dist$Sample,colnames(mat)))])))<1e-12)
  sums <- tapply(comp$Signal_sum,comp$Sample,sum)
  shares <- tapply(comp$Share_pct,comp$Sample,sum)
  stopifnot(max(abs(sums[colnames(mat)]-colSums(mat)))<1e-5,max(abs(shares-100))<1e-10)
  indices <- cbind(match(heat$Lipid_Name,rownames(mat)),match(heat$Sample,colnames(mat)))
  lm <- log10(mat); z <- t(scale(t(lm)))
  stopifnot(nrow(heat)==50L*42L, length(unique(heat$Lipid_Name))==50L,
    max(abs(heat$log10_abundance-lm[indices]))<1e-12,
    max(abs(heat$z_score-z[indices]))<1e-12,
    setequal(unique(heat$Lipid_Name), names(sort(apply(lm,1,var),decreasing=TRUE))[1:50]))
  cat(sprintf('CURRENT DASHBOARD: violin %d; PCA %d; composition %d; distribution %d; heatmap %d rows; all checks PASS\n',nrow(violin),nrow(pca),nrow(comp),nrow(dist),nrow(heat)))
})
# Historical Classic and comparison UI CSVs: compare raw saved outputs, not labels.
for (kind in c('classes352','volcano352')) {
  a <- read(paste0('comparison-ui/max_',kind,'.csv'))
  b <- read(paste0('comparison-ui/ours_',kind,'.csv'))
  stopifnot(identical(a,b))
  cat(sprintf('HISTORICAL CAPTURE: %s %d rows, all fields identical PASS\n',kind,nrow(a)))
}
cat('PASS: real project 42 independent subjects, 352 prepared lipids; current dashboard checks and historical CSV comparisons\n')
