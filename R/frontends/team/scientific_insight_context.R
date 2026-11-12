# Privacy-preserving context for the Team scientific-insight bridge.
# This file deliberately returns summaries only; the browser never receives a
# prepared matrix, metadata, identifiers, filenames, or original group labels.

team_insight_class_queries <- function(x) {
  cls <- c(PC="phosphatidylcholine", PE="phosphatidylethanolamine", PG="phosphatidylglycerol",
           PI="phosphatidylinositol", PS="phosphatidylserine", SM="sphingomyelin",
           Cer="ceramide", CE="cholesteryl ester", TG="triacylglycerol",
           DG="diacylglycerol", MG="monoacylglycerol", FA="fatty acid",
           LPC="lysophosphatidylcholine", LPE="lysophosphatidylethanolamine",
           CL="cardiolipin", Chol="cholesterol", CAR="acylcarnitine")
  unname(cls[match(sub("^([A-Za-z]+).*", "\\1", as.character(x)), names(cls))])
}
team_insight_safe_lipids <- function(x) {
  classes <- "PC|PE|PG|PI|PS|SM|Cer|CE|TG|DG|MG|FA|LPC|LPE|CL|Chol|CAR"
  x <- as.character(x)
  ok <- !is.na(x) & nchar(x) <= 80L & grepl(paste0("^(?:", classes, ")(?:\\([0-9:_;/-]+\\))?(?:\\+(?:H|NH4|Na|K|H-H2O)|-(?:H|H2O))?$"), x, perl = TRUE)
  ifelse(ok, x, NA_character_)
}

team_insight_context <- function(plot_id, input = list(), shared_data = list(), dashboard = list()) {
  ids <- c("results_dashboard-plot_pca",
    "results_dashboard-plot_violin",
    "results_dashboard-plot_dist",
    "results_dashboard-plot_comp",
    "results_dashboard-plot_heat",
    "qc_pca_tab-boxplotAfterNorm",
    "qc_pca_tab-outlierPlot",
    "qc_pca_tab-pca2dPlot",
    "qc_pca_tab-pca3dPlot",
    "qc_pca_tab-load2dPlot",
    "qc_pca_tab-load3dPlot",
    "qc_pca_tab-sampleCorrPlot",
    "qc_pca_tab-bqcPlot",
    "qc_pca_tab-bqcDeviationPlot",
    "qc_pca_tab-bqcAbundancePlot",
    "qc_pca_tab-outlierPcaPlot",
    "qc_pca_tab-guided_qc_plot",
    "barchart-barPlotUnfiltered",
    "barchart-barPlotFiltered",
    "barchart-donutPlotUnfiltered",
    "barchart-donutPlotFiltered",
    "volcano_tab-volcanoPlot",
    "lsea_tab-lseaPlot",
    "fla_tab-plotVolcano",
    "structural_tab-diffAcylPlot",
    "heatmap_barchart_tab-heatmapPlot",
    "heatmap_barchart_tab-heatmapSDPlot",
    "heatmap_barchart_tab-filteredHeatmapPlot",
    "heatmap_barchart_tab-filteredHeatmapSDPlot",
    "heatmap_barchart_tab-violin_plot_render",
    "structural_tab-summaryPlot",
    "structural_tab-speciesPlotPlot",
    "structural_tab-networkPlot",
    "structural_tab-moduleTraitPlot",
    "structural_tab-propPlotPlot",
    "structural_grid_tab-heatmapPlot",
    "structural_grid_tab-dotplotPlot",
    "structural_grid_tab-mergedPlot",
    "structural_grid_tab-diffAllPlot",
    "logratio_tab-logratioPlot",
    "fla_tab-logratioPlot",
    "fla_tab-plotCircos",
    "longitudinal_tab-macroclass_plot",
    "longitudinal_tab-subclass_plot",
    "longitudinal_tab-index_plot",
    "longitudinal_tab-struct_plot",
    "longitudinal_tab-allmetrics_plot",
    "pathway_tab-pathwayPlot",
    "pathway_tab-pathwayVisNetwork",
    "cellular_org_tab-stressPlot",
    "cellular_org_tab-cpiPlot",
    "cellular_org_tab-polarPlot",
    "cell_lipid_plot",
    "cell_profile_plot",
    "cell_class_plot",
    "cell_comparison_plot",
    "export_studio-studio_preview_plot")
  if (length(plot_id) != 1L || is.na(plot_id) || !plot_id %in% ids)
    stop("Unknown or unsupported plot_id", call. = FALSE)
  getv <- function(x) if (is.function(x)) tryCatch(x(), error = function(e) NULL) else x
  prep <- getv(shared_data$preparation_audit)
  state <- getv(shared_data$preparation_state)
  revision <- getv(shared_data$preparation_revision) %||% getv(shared_data$dataset_revision) %||%
    state$dataset_revision %||% state$restore_generation %||% prep$revision %||% prep$run %||% NA_character_
  if (length(revision) != 1L || is.null(revision)) revision <- NA_character_
  revision <- as.character(revision)
  safe_lipid <- function(x) team_insight_safe_lipids(as.character(x)[1L])
  fn <- function(name) if (!is.null(dashboard[[name]])) getv(dashboard[[name]]) else NULL
  context_label <- "Dataset literature context · not a plot-specific result"
  kind <- "dataset"
  lipids <- character()
  summary <- list()
  if (identical(plot_id, "results_dashboard-plot_violin")) {
    d <- fn("violin_data")
    if (is.data.frame(d) && nrow(d) && "Lipid" %in% names(d)) {
      l <- safe_lipid(unique(d$Lipid)[1L]); if (!is.na(l)) lipids <- l
      y <- if ("Log10_abundance" %in% names(d)) d$Log10_abundance else numeric()
      y <- y[is.finite(y)]
      summary <- list(measurements = length(y), median_log10_abundance = if (length(y)) unname(stats::median(y)) else NA_real_)
      context_label <- "Selected feature distribution · descriptive aggregate"
      kind <- "violin"
    }
  }
  if (identical(plot_id, "results_dashboard-plot_heat")) {
    d <- fn("heatmap"); d <- if (is.list(d)) d$df else d
    if (is.data.frame(d) && "Visible" %in% names(d)) d <- d[!is.na(d$Visible) & d$Visible %in% TRUE, , drop = FALSE]
    if (is.data.frame(d) && "Lipid_Name" %in% names(d)) lipids <- head(unique(Filter(function(x) !is.na(x), vapply(d$Lipid_Name, safe_lipid, character(1)))), 3L)
    context_label <- "Displayed lipid features · descriptive aggregate"; kind <- "heatmap"
  }
  if (identical(plot_id, "results_dashboard-plot_comp")) {
    d <- fn("composition")
    if (is.data.frame(d) && "Selected" %in% names(d)) d <- d[!is.na(d$Selected) & d$Selected %in% TRUE, , drop = FALSE]
    if (is.data.frame(d) && "Class" %in% names(d)) {
      lipids <- head(unique(na.omit(team_insight_safe_lipids(as.character(d$Class)))),3L)
      summary <- list(note="Prepared signal shares are descriptive, not molar concentrations or a test of group differences.")
    }
    context_label <- "Displayed lipid-class composition · descriptive aggregate"; kind <- "composition"
  }
  if (identical(plot_id, "results_dashboard-plot_pca")) {
    p <- fn("pca"); rot <- if (is.list(p)) p$pc$rotation else NULL
    if (is.matrix(rot) && "PC1" %in% colnames(rot)) {
      lipids <- head(names(sort(abs(rot[, "PC1"]), decreasing = TRUE)), 3L)
      lipids <- Filter(function(x) !is.na(safe_lipid(x)), lipids)
    }
    summary <- list(note="At most three largest absolute PC1 loadings; these are contributions to variation, not group differences.", variance_pct=if(is.list(p)) unname(head(p$ve,2)) else numeric())
    context_label <- "PCA score view · variation summary"; kind <- "pca"
  }
  # General plots expose dataset class background only, never an inferred result.
  if (!length(lipids) && kind == "dataset") {
    active <- getv(shared_data$data_processed)
    species <- if (is.data.frame(active) && ncol(active)) na.omit(team_insight_safe_lipids(active[[1L]])) else character()
    classes <- sub("^([A-Za-z]+).*", "\\1", species)
    lipids <- head(names(sort(table(classes),decreasing=TRUE)),3L)
    summary <- list(note="Background for the most frequent annotated lipid classes in the active dataset. Not a description of this plot's filtered subset, values or biological conclusions.")
  }
  if (!length(summary)) summary <- list(note = "No plot-specific aggregate was available; this is bounded dataset context.")
  scientific_inputs <- list(plot_id = plot_id, kind = kind, lipids = lipids,
                            transform = as.character(input[["results_dashboard-pca_transform"]] %||% NA),
                            scale = as.character(input[["results_dashboard-pca_scale"]] %||% NA),
                            heat_group_selection = as.character(input[["results_dashboard-heat_group_selection"]] %||% NA),
                            heat_lipid_selection = as.character(input[["results_dashboard-heat_lipid_selection"]] %||% NA),
                            comp_class_selection = as.character(input[["results_dashboard-comp_class_selection"]] %||% NA),
                            color_by = as.character(input[["results_dashboard-color_by"]] %||% NA),
                            top_n = as.character(input[["results_dashboard-top_n"]] %||% NA))
  active <- getv(shared_data$data_processed)
  digest <- NA_character_
  if (is.data.frame(active)) {
    tf <- tempfile("team-insight-"); on.exit(unlink(tf), add = TRUE)
    writeBin(serialize(active, NULL, version = 2L), tf)
    digest <- unname(tools::md5sum(tf))
  }
  fingerprint <- list(scope = "local prepared dataset", preparation_revision = revision,
                      dataset_digest = digest,
                      persisted_dataset_digest = if(is.data.frame(active)) digest::digest(jsonlite::toJSON(active,dataframe="columns",digits=NA,na="null",null="null"),algo="sha256",serialize=FALSE) else NA_character_,
                      scientific_inputs = scientific_inputs, summary = summary, preparation_state=state, restore_generation=getv(shared_data$restore_generation))
  list(context_label = context_label, kind = kind, lipids = unname(head(lipids, 3L)),
       summary = summary, fingerprint = fingerprint)
}

# Consume only the live result reactives of the validated independent Cell plot.
# Raw rows and private selections are used locally for invalidation only.
team_insight_cell_context <- function(source, inputs, shared_data, results) {
  keys <- c(cell_lipid_plot='feature_values',cell_profile_plot='profile',
            cell_class_plot='class_comparison',cell_comparison_plot='selected_values')
  if(!is.character(source)||length(source)!=1L||is.na(source)||!source %in% names(keys)||!is.list(inputs)||!is.list(results)) return(NULL)
  getv <- function(x) if(is.function(x))tryCatch(x(),error=function(e)NULL) else x
  data <- getv(shared_data$data_processed)
  if(!is.data.frame(data)||!nrow(data)||ncol(data)<2L)return(NULL)
  rows <- getv(results[[keys[[source]]]])
  if(!is.data.frame(rows)||!nrow(rows))return(NULL)
  scalar <- function(x) is.character(x)&&length(x)==1L&&!is.na(x)&&nzchar(x)
  valid_groups <- function(value_column) {
    ref <- inputs$cell_reference_group; comp <- inputs$cell_comparison_group
    if(!scalar(ref)||!scalar(comp)||identical(ref,comp)||!all(c('Group',value_column)%in%names(rows))) return(FALSE)
    ok <- is.finite(rows[[value_column]]) & !is.na(rows$Group)
    all(c(ref,comp)%in%as.character(rows$Group[ok]))
  }
  kind <- switch(source,cell_lipid_plot='cell_feature',cell_profile_plot='cell_profile',cell_class_plot='cell_class',cell_comparison_plot='cell_comparison')
  if(source=='cell_lipid_plot') {
    if(!all(c('Lipid','Prepared_signal')%in%names(rows))||!scalar(inputs$cell_lipid)||!all(as.character(rows$Lipid)==inputs$cell_lipid)||!any(is.finite(rows$Prepared_signal)))return(NULL)
    lipids <- team_insight_safe_lipids(inputs$cell_lipid)
    label <- 'Selected feature · prepared signal'
  } else if(source=='cell_profile_plot') {
    if(!all(c('Class','Sample','Signal_percent')%in%names(rows))||!scalar(inputs$cell_sample)||!all(as.character(rows$Sample)==inputs$cell_sample))return(NULL)
    visible <- rows[is.finite(rows$Signal_percent),,drop=FALSE]
    lipids <- team_insight_safe_lipids(as.character(visible$Class))
    label <- 'Selected measurement · descriptive class profile'
  } else if(source=='cell_class_plot') {
    if(!'Class'%in%names(rows)||!valid_groups('Abundance'))return(NULL)
    visible <- rows[is.finite(rows$Abundance),,drop=FALSE]
    lipids <- team_insight_safe_lipids(as.character(visible$Class))
    label <- 'Selected groups · descriptive class totals'
  } else {
    if(!all(c('Class','Lipid')%in%names(rows))||!valid_groups('Prepared_signal')||!scalar(inputs$cell_class)||!scalar(inputs$cell_explore_level)||!inputs$cell_explore_level%in%c('class','feature'))return(NULL)
    if(!all(as.character(rows$Class)==inputs$cell_class))return(NULL)
    expected <- if(inputs$cell_explore_level=='class') paste0(inputs$cell_class,' class total') else inputs$cell_lipid
    if(!scalar(expected)||!all(as.character(rows$Lipid)==expected))return(NULL)
    lipids <- team_insight_safe_lipids(if(inputs$cell_explore_level=='class')inputs$cell_class else expected)
    label <- 'Selected groups · descriptive prepared signal'
  }
  lipids <- head(unique(stats::na.omit(lipids)),3L)
  if(!length(lipids))return(NULL)
  base <- team_insight_context(source,list(),shared_data,list())
  # Names, groups, measurement identifiers and values are hashed locally, never
  # sent in the provider payload or exposed in the stored note.
  relevant <- switch(source,cell_lipid_plot=c('cell_lipid','cell_sample'),
    cell_profile_plot=c('cell_sample','cell_profile_view'),
    cell_class_plot=c('cell_group_column','cell_reference_group','cell_comparison_group'),
    cell_comparison_plot=c('cell_group_column','cell_reference_group','cell_comparison_group','cell_class','cell_explore_level','cell_lipid'))
  base$context_label <- label; base$kind <- kind; base$lipids <- unname(lipids)
  base$summary <- list(note='Descriptive prepared signal only; no statistical or spatial inference.')
  base$fingerprint$scientific_inputs <- list(source=source,settings=inputs[relevant],result_digest=digest::digest(rows,algo='sha256'))
  base$fingerprint$summary <- base$summary
  base
}
