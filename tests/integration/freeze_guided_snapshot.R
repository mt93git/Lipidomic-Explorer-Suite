# Run from repository root. Argument: path to the guided app source checkout.
# Only explicitly selected scientific functions are copied; no data/config files.
source('tests/integration/helpers.R')
args <- commandArgs(TRUE); stopifnot(length(args)==1L)
selected <- list(
  'R/modules/1_shared_data_module.R'=c('preparation_sample_ids','compute_imputed_matrix'),
  'R/ux_preparation.R'=c('ux_detection_preview','ux_filter_detected'),
  'R/modules/utils_stats.R'=c('compute_local_p_val','perform_limma_analysis','perform_non_parametric_analysis','construct_contrast_string'))
lines <- c('# Frozen scientific functions from the guided application, 2026-10-26.',
           '# Test fixture only; never sourced by the application. See guided-source-manifest.csv.',
           '# Original project: Maxence Tricaud, MIT. Guided adaptations: Gerardo Barcia.', '')
manifest <- list()
for (path in names(selected)) {
  src <- file.path(args[1],path); ast <- parse(src)
  for (name in selected[[path]]) {
    node <- find_assignment(ast,name); stopifnot(!is.null(node))
    lines <- c(lines,paste0('# Source: ',path),deparse(node,width.cutoff=100L),'')
    manifest[[length(manifest)+1]] <- data.frame(source_file=path, function_name=name,
      source_sha256=digest::digest(file=src,algo='sha256'),
      function_sha256=digest::digest(paste(deparse(node,width.cutoff=100L),collapse='\n'),algo='sha256',serialize=FALSE))
  }
}
writeLines(sub('[[:space:]]+$', '', lines[-length(lines)]),'tests/integration/guided_snapshot.R')
write.csv(do.call(rbind,manifest),'docs/integration/guided-source-manifest.csv',row.names=FALSE)
