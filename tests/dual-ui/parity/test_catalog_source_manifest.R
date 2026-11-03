# Source-level UI coverage only: does not claim live Canvas addability or scale correctness.
catalog <- paste(readLines('www/team/js/canvas_catalog.js',warn=FALSE),collapse='\n')
ids <- regmatches(catalog,gregexpr("\\['[^']+'",catalog))[[1]]
ids <- unique(sub("^\\['([^']+)'$",'\\1',ids))
modules <- c('2_qc_boxplot_module.R'='qc_pca_tab','4_heatmap_module.R'='heatmap_barchart_tab',
 '5_barchart_module.R'='barchart','6_volcano_module.R'='volcano_tab','7_lsea_module.R'='lsea_tab',
 '8_structural_module.R'='structural_tab','9_logratio_module.R'='logratio_tab',
 '10_fla_module.R'='fla_tab','11_longitudinal_module.R'='longitudinal_tab',
 '12_structural_grid_module.R'='structural_grid_tab','13_pathway_module.R'='pathway_tab',
 '14_cellular_org_module.R'='cellular_org_tab','99_export_studio_module.R'='export_studio')
plot_fns <- c('plotOutput','plotlyOutput','visNetworkOutput')
leaf <- function(x) if(is.symbol(x)) as.character(x) else if(is.call(x)&&is.symbol(x[[1]])&&as.character(x[[1]]) %in% c('::',':::')) as.character(x[[3]]) else ''
collect <- function(node) {
 out <- character()
 if(is.call(node) && identical(node[[1]],as.name('rd_card')) && length(node)>=3L && is.character(node[[3]])) out <- paste0('plot_',node[[3]])
 if(is.call(node) && leaf(node[[1]]) %in% plot_fns && length(node)>=2L) {
  arg <- node[[2]]
  if(is.character(arg)) out <- arg
  if(is.call(arg)&&(identical(arg[[1]],as.name('ns')) || identical(arg[[1]],quote(session$ns)))&&length(arg)==2L&&is.character(arg[[2]])) out <- arg[[2]]
 }
 if(is.recursive(node)) for(i in seq_along(node)) out <- c(out,collect(node[[i]]))
 unique(out)
}
checked <- character()
for(file in names(modules)) {
 outputs <- collect(parse(file.path('R/modules',file)))
 namespaced <- if(length(outputs)) paste0(modules[[file]],'-',outputs) else character()
 missing <- setdiff(namespaced,ids)
 if(length(missing)) stop('UI plot missing from catalog: ',paste(missing,collapse=', '))
 checked <- c(checked,namespaced)
 cat(sprintf('%s: %d distinct plot outputs covered\n',modules[[file]],length(outputs)))
}
for(file in c('R/frontends/team/modules-ui.R','R/frontends/team/qc-ui.R','R/guided_workflow.R','R/results_dashboard.R','R/cell_show.R')) {
 outputs <- collect(parse(file))
 # Frontend override files contain multiple module namespaces. Match stable
 # suffixes here; the browser fixture independently asserts all complete IDs.
 matched <- ids[ids %in% outputs | sub('^[^-]+-','',ids) %in% outputs]
 missing <- outputs[!outputs %in% matched & !outputs %in% sub('^[^-]+-','',matched)]
 if(length(missing)) stop('Frontend UI plot absent from catalog suffixes: ',paste(missing,collapse=', '))
 checked <- c(checked,matched)
 cat(sprintf('%s: %d declared plot suffixes covered\n',file,length(outputs)))
}
stopifnot(length(ids)==56L, setequal(unique(checked),ids))
cat(sprintf('PASS: %d distinct catalog entries linked to literal UI plot declarations; 56-entry browser manifest checked separately. Browser mounting, computed IDs and scientific scales require separate checks.\n',length(unique(checked))))
