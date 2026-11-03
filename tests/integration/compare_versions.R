# Usage from candidate root: Rscript --vanilla tests/integration/compare_versions.R BASELINE_ROOT OUTPUT_DIR
source('tests/integration/helpers.R')
args <- commandArgs(TRUE); stopifnot(length(args)==2L)
stopifnot(requireNamespace('imputeLCMD',quietly=TRUE),requireNamespace('limma',quietly=TRUE),requireNamespace('statmod',quietly=TRUE))
manifest <- read.csv('docs/integration/guided-source-manifest.csv')
snapshot <- parse('tests/integration/guided_snapshot.R')
for (i in seq_len(nrow(manifest))) {
  node <- find_assignment(snapshot, manifest$function_name[i])
  actual <- digest::digest(paste(deparse(node,width.cutoff=100L),collapse='\n'),algo='sha256',serialize=FALSE)
  stopifnot(identical(actual,manifest$function_sha256[i]))
}
out <- args[2]; dir.create(out,recursive=TRUE,showWarnings=FALSE)
f <- synthetic_fixture()
write.csv(f$data,file.path(out,'synthetic-abundance.csv'),row.names=FALSE,na='NA')
write.csv(f$metadata,file.path(out,'synthetic-metadata.csv'),row.names=FALSE)
envs <- list(upstream=preparation_env(args[1]),candidate=preparation_env('.'),guided=preparation_env('.',TRUE))
rows <- list()
compare <- function(a,b,label) {
  stopifnot(identical(dim(a),dim(b)),identical(dimnames(a),dimnames(b)),identical(is.na(a),is.na(b)))
  ok <- is.finite(a) & is.finite(b)
  delta <- if(any(ok)) max(abs(a[ok]-b[ok])) else 0
  stopifnot(isTRUE(all.equal(a,b,tolerance=1e-10)))
  rows[[length(rows)+1]] <<- data.frame(check=label,max_absolute_difference=delta,status='PASS')
}
for (norm in c('none','median','pqn')) for (impute in c(FALSE,TRUE)) {
  scenario <- paste(norm,if(impute) 'qrilc' else 'no_imputation',sep='_')
  matrices <- list(); stats <- list(); rank_stats <- list()
  for (name in names(envs)) {
    e <- envs[[name]]; e$settings$normalizationMethod <- norm; e$settings$useImputation <- impute
    x <- e$compute_imputed_matrix(TRUE)
    m <- as.matrix(x[,-1]); rownames(m) <- x$Lipid_Name
    matrices[[name]] <- m
    # Deterministic repeated preparation, including QRILC seed 42.
    repeat_x <- e$compute_imputed_matrix(TRUE)
    stopifnot(identical(x,repeat_x))
    write.csv(x,file.path(out,paste(scenario,name,'prepared.csv',sep='-')),row.names=FALSE)
    meta <- data.frame(Sample=f$metadata$FullName,Group=f$metadata$Group1)
    contrast <- e$construct_contrast_string('Control','Comparison')
    result <- e$perform_limma_analysis(log2(m),meta,'Group',contrast)$results
    stopifnot(any(result$p_raw < 1), all(is.finite(result$log2FC)))
    stats[[name]] <- as.matrix(result[,c('log2FC','p_raw','p_adj_bh','t_stat')])
    rownames(stats[[name]]) <- result$Lipid_Name
    write.csv(result,file.path(out,paste(scenario,name,'limma.csv',sep='-')),row.names=FALSE)
    ranked <- e$perform_non_parametric_analysis(log2(m),meta,'Group',contrast)$results
    rank_stats[[name]] <- as.matrix(ranked[,c('log2FC','p_raw','p_adj_bh')])
    rownames(rank_stats[[name]]) <- ranked$Lipid_Name
    write.csv(ranked,file.path(out,paste(scenario,name,'wilcoxon.csv',sep='-')),row.names=FALSE)
    reverse <- e$perform_limma_analysis(log2(m),meta,'Group',e$construct_contrast_string('Comparison','Control'))$results
    stopifnot(isTRUE(all.equal(result$log2FC,-reverse$log2FC,tolerance=1e-10)),
      isTRUE(all.equal(result$p_raw,reverse$p_raw,tolerance=1e-10)),
      isTRUE(all.equal(result$p_adj_bh,reverse$p_adj_bh,tolerance=1e-10)))
  }
  for (name in c('candidate','guided')) {
    compare(matrices$upstream,matrices[[name]],paste(scenario,name,'preparation',sep='/'))
    compare(stats$upstream,stats[[name]],paste(scenario,name,'limma',sep='/'))
    compare(rank_stats$upstream,rank_stats[[name]],paste(scenario,name,'wilcoxon',sep='/'))
  }
}
# Explicitly demonstrate the intended differences rather than hiding them as mismatches.
a <- c(1,NA,4,8,10,13); b <- c(3,5,NA,9,14,14); keep <- complete.cases(a,b)
pairs <- do.call(rbind,lapply(c('limma','non_parametric'),function(method) {
  oracle <- if(method=='limma') t.test(a[keep],b[keep],paired=TRUE)$p.value else wilcox.test(a[keep],b[keep],paired=TRUE,exact=FALSE)$p.value
  vals <- vapply(envs,function(e)e$compute_local_p_val(a,b,method,TRUE),numeric(1))
  stopifnot(abs(vals['candidate']-oracle)<1e-12,abs(vals['guided']-oracle)<1e-12,abs(vals['upstream']-oracle)>1e-6)
  data.frame(method,upstream=vals['upstream'],candidate=vals['candidate'],guided=vals['guided'],oracle,row.names=NULL)
}))
write.csv(pairs,file.path(out,'paired-missingness-difference.csv'),row.names=FALSE)
removed <- vapply(envs,function(e) {
  e$settings$useImputation <- FALSE; e$settings$normalizationMethod <- 'none'
  e$settings$outlierTreatments <- list(S02='remove'); e$input$useAveragedSubstitution <- TRUE
  'S02' %in% names(e$compute_imputed_matrix(TRUE))
},logical(1))
stopifnot(identical(unname(removed),c(TRUE,FALSE,FALSE)))
write.csv(data.frame(version=names(removed),explicitly_removed_sample_reappears=removed),file.path(out,'removal-difference.csv'),row.names=FALSE)
write.csv(do.call(rbind,rows),file.path(out,'comparison-summary.csv'),row.names=FALSE)
writeLines(capture.output(sessionInfo()),file.path(out,'sessionInfo.txt'))
print(do.call(rbind,rows)); print(pairs); print(removed)
cat('PASS: 36 parity comparisons, 18 repeat preparations, 18 contrast reversals, and intentional safeguard differences.\n')
