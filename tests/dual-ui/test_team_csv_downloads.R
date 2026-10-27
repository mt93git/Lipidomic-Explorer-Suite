# Real Team download handlers must guard user-supplied labels in exported CSVs.
# These synthetic labels never change the prepared matrix or module inputs.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a, b) if (is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R')
source('R/results_dashboard.R')
source('R/cell_show.R')

ids <- c('=S01', 'S02', 'S03', 'S04')
prepared <- data.frame(Lipid_Name=c('=1+1','PC(34:1)','PE(36:2)','LPC(18:1)'),
  c(10,20,30,40), c(11,21,31,41), c(12,22,32,42), c(13,23,33,43),
  check.names=FALSE, stringsAsFactors=FALSE)
names(prepared)[-1L] <- ids
metadata <- data.frame(FullName=ids,
  Group1=c('=Control','=Control','Control','Control'),
  Group2=rep('bone',4), stringsAsFactors=FALSE)
hub <- list(data_processed=function() prepared, all_metadata=function() metadata,
  grouped_metadata=function() metadata,
  preparation_audit=function() list(normalization='none',imputation='none'),
  preparation_dirty=function() FALSE, color_maps=function() list())
check_csv <- function(path, columns, values) {
  stopifnot(is.character(path), length(path)==1L, file.exists(path))
  exported <- utils::read.csv(path, check.names=FALSE, stringsAsFactors=FALSE)
  stopifnot(all(columns %in% names(exported)))
  for (field in names(values)) stopifnot(all(values[[field]] %in% exported[[field]]))
  exported
}

dashboard_server <- function(input, output, session) results_dashboard_module_server(input,output,session,hub)
shiny::testServer(dashboard_server, {
  session$setInputs(color_by='Group1', violin_lipid='=1+1', pca_transform='linear',
    pca_scale='uv', top_n=4L)
  session$flushReact()
  for (key in c('dl_violin','dl_pca','dl_comp','dl_dist','dl_heat')) {
    csv <- check_csv(output[[key]], c('Normalization','Imputation'), list())
    stopifnot(!any(grepl('^[[:space:]]*[=+@-]',names(csv))),
      all(vapply(csv, function(col) !is.character(col) ||
        !any(grepl('^[[:space:]]*[=+@-]',col)), logical(1))))
    if (key == 'dl_violin') stopifnot("'=S01" %in% csv$Sample,
      "'=Control" %in% csv$Group, "'=1+1" %in% csv$Lipid,
      identical(as.numeric(csv$Prepared_abundance),c(10,11,12,13)))
  }
})

cell_server <- function(input, output, session) cell_show_server(input,output,session,hub)
shiny::testServer(cell_server, {
  session$setInputs(cell_lipid='=1+1', cell_sample='=S01', cell_class='=1+1',
    cell_group_column='Group1', cell_reference_group='=Control',
    cell_comparison_group='Control', cell_explore_level='feature')
  session$flushReact()
  feature <- check_csv(output$cell_lipid_csv,
    c('Measurement','Lipid','Prepared_signal'),
    list(Measurement="'=S01", Lipid="'=1+1"))
  stopifnot(identical(as.numeric(feature$Prepared_signal),c(10,11,12,13)))
  for (key in c('cell_profile_csv','cell_comparison_csv','cell_class_profile_csv')) {
    csv <- check_csv(output[[key]], character(), list())
    stopifnot(!any(grepl('^[[:space:]]*[=+@-]',names(csv))),
      all(vapply(csv, function(col) !is.character(col) ||
        !any(grepl('^[[:space:]]*[=+@-]',col)), logical(1))))
    if (key == 'cell_profile_csv') stopifnot("'=S01" %in% csv$Sample,
      "'=1+1" %in% csv$Class)
    if (key == 'cell_comparison_csv') stopifnot("'=S01" %in% csv$Measurement,
      "'=Control" %in% csv$Group, "'=1+1" %in% csv$Lipid)
    if (key == 'cell_class_profile_csv') stopifnot("'=S01" %in% csv$Sample,
      "'=Control" %in% csv$Group, "'=1+1" %in% csv$Class)
  }
})
stopifnot(identical(names(prepared)[2L], '=S01'),
  identical(prepared$Lipid_Name[[1L]], '=1+1'),
  identical(metadata$Group1[[1L]], '=Control'))
cat('PASS: actual Team dashboard and cell CSV downloads escape formula-like sample, group and lipid labels without changing source data\n')
