suppressPackageStartupMessages(source('R/modules/99_export_studio_module.R'))
source('R/modules/2_qc_boxplot_module.R')

missing <- list(
  inference_allowed = function(paired = FALSE) TRUE,
  de_results = function() NULL,
  pca_results = function() NULL,
  data_processed = function() NULL,
  annotationData = function() NULL
)
for (key in c('volcano', 'pca_2d', 'class_abundance', 'heatmap')) {
  result <- try(generate_export_artifacts(key, missing), silent = TRUE)
  stopifnot(inherits(result, 'try-error'))
}
real_de <- missing
real_de$de_results <- function() data.frame(
  Lipid_Name = c('PC(34:1)', 'PE(36:2)'), log2FC = c(1.5, -1.1),
  p_raw = c(0.01, 0.03))
real_de$de_contrast_info <- function() list(ref = 'control', comp = 'treated')
figure <- generate_export_artifacts('volcano', real_de)
stopifnot(nrow(figure$data) == 2L,
          identical(as.character(figure$data$Lipid_Name), c('PC(34:1)', 'PE(36:2)')))
zero_p <- real_de
zero_p$de_results <- function() data.frame(
  Lipid_Name = c('Underflow', 'Invalid', 'Negative'),
  log2FC = c(2, 1, 1), p_raw = c(0, NA_real_, -0.1))
zero_figure <- generate_export_artifacts('volcano', zero_p)
stopifnot(nrow(zero_figure$data) == 1L,
          identical(zero_figure$data$Lipid_Name, 'Underflow'),
          identical(zero_figure$data$p_raw, 0),
          identical(zero_figure$data$negLog10P, 12),
          identical(as.character(zero_figure$data$Regulation), 'Up'))
stale <- real_de
stale$preparation_dirty <- function() TRUE
stopifnot(inherits(try(generate_export_artifacts('volcano', stale), silent = TRUE), 'try-error'))
blocked <- real_de
blocked$inference_allowed <- function(paired = FALSE) FALSE
stopifnot(inherits(try(generate_export_artifacts('volcano', blocked), silent = TRUE), 'try-error'))

real_pca <- missing
real_pca$pca_results <- function() list(
  score_df = data.frame(FullName = c('S1', 'S2'), PC1 = c(-1, 1),
                        PC2 = c(0.5, -0.5), Group1 = c('A', 'B')),
  var_PC = c(60, 25))
real_pca$grouped_metadata <- function() NULL
pca_figure <- generate_export_artifacts('pca_2d', real_pca)
stopifnot(nrow(pca_figure$data) == 2L,
          identical(as.character(pca_figure$data$FullName), c('S1', 'S2')))

many_groups <- missing
labels <- paste0('Group ', seq_len(10))
many_groups$pca_results <- function() list(
  score_df = data.frame(FullName = paste0('S', seq_len(10)),
    PC1 = seq_len(10), PC2 = rev(seq_len(10)), Group1 = labels),
  var_PC = c(60, 25))
many_groups$grouped_metadata <- function() data.frame(
  FullName = paste0('S', seq_len(10)), Group1 = labels,
  Group2 = rep('Population', 10))
many_figure <- generate_export_artifacts('pca_2d', many_groups)
many_plot <- ggplot2::ggplot_build(many_figure$plot)
stopifnot(nrow(many_figure$data) == 10L,
          identical(as.character(many_figure$data$Group1), labels),
          !any(c('Group1.x', 'Group1.y') %in% names(many_figure$data)),
          'Group2' %in% names(many_figure$data),
          length(unique(many_plot$data[[3]]$colour)) == 10L,
          !anyNA(many_plot$data[[3]]$colour))
custom <- many_groups
custom_palette <- stats::setNames(grDevices::rainbow(10), labels)
custom$color_maps <- function() list(Group1 = custom_palette)
custom_figure <- generate_export_artifacts('pca_2d', custom)
stopifnot(setequal(ggplot2::ggplot_build(custom_figure$plot)$data[[3]]$colour,
                   unname(custom_palette)))

metadata_only <- many_groups
metadata_only$pca_results <- function() list(
  score_df = data.frame(FullName = paste0('S', seq_len(10)),
    PC1 = seq_len(10), PC2 = rev(seq_len(10))), var_PC = c(60, 25))
metadata_figure <- generate_export_artifacts('pca_2d', metadata_only)
stopifnot(identical(as.character(metadata_figure$data$Group1), labels))

numeric_labels <- many_groups
numeric_labels$pca_results <- function() list(
  score_df = data.frame(FullName = paste0('S', seq_len(4)), PC1 = c(-2, -1, 1, 2),
    PC2 = c(2, 1, -1, -2), Group1 = c('', NA_character_, '', '')),
  var_PC = c(60, 25))
numeric_labels$grouped_metadata <- function() data.frame(
  FullName = paste0('S', seq_len(4)), Group1 = c('01', '1.0', 'T', 'NA'))
numeric_figure <- generate_export_artifacts('pca_2d', numeric_labels)
stopifnot(identical(numeric_figure$data$Group1, c('01', '1.0', 'T', 'NA')),
          !any(c('Group1.x', 'Group1.y') %in% names(numeric_figure$data)))
local({
  output_dir <- tempfile('pca-export-script-')
  dir.create(output_dir)
  old_wd <- getwd()
  on.exit({ setwd(old_wd); unlink(output_dir, recursive = TRUE) })
  setwd(output_dir)
  write.csv(numeric_figure$data, 'figure_pca_2d_data.csv', row.names = FALSE)
  script_env <- new.env(parent = globalenv())
  eval(parse(text = numeric_figure$r_script), envir = script_env)
  stopifnot(identical(script_env$data$Group1, c('01', '1.0', 'T', 'NA')),
            length(unique(ggplot2::ggplot_build(script_env$p)$data[[3]]$colour)) == 4L,
            !anyNA(ggplot2::ggplot_build(script_env$p)$data[[3]]$colour),
            file.exists('figure_pca_2d_reproduced.pdf'))
})

heatmap_data <- missing
heatmap_data$data_processed <- function() data.frame(
  Lipid_Name = c('constant', 'varying-1', 'varying-2'),
  S1 = c(1, 1, 3), S2 = c(1, 2, 2), S3 = c(1, 3, 1))
heatmap_figure <- generate_export_artifacts('heatmap', heatmap_data)
stopifnot(!'constant' %in% heatmap_figure$data$Lipid_Name,
          all(is.finite(as.matrix(heatmap_figure$data[c('S1', 'S2', 'S3')]))))

old <- list(S1 = 'remove', S2 = 'average', S3 = 'keep')
stopifnot(identical(qc_reconcile_treatments(old, c('S1', 'S3'), 'classic'), old[c('S1', 'S3')]),
          identical(qc_reconcile_treatments(old, c('S1', 'S3'), 'team'), list()),
          identical(qc_reconcile_treatments(old, character(), 'classic'), list()))
cat('PASS: no synthetic publication figures and QC revision policy\n')
