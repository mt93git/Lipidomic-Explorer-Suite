# Human-facing strings copied verbatim from www/team/js/canvas_catalog.js.
# Output membership and control schemas remain owned by Team.
api_catalog_copy <- list(
  "results_dashboard-plot_pca" = list(label = "Principal components", description = "Compare sample structure across the prepared data.", group = "Dashboard", needs = NULL),
  "results_dashboard-plot_violin" = list(label = "Feature distributions", description = "Review the distribution of selected features.", group = "Dashboard", needs = NULL),
  "results_dashboard-plot_dist" = list(label = "Signal distribution", description = "Inspect the distribution of measured signal.", group = "Dashboard", needs = NULL),
  "results_dashboard-plot_comp" = list(label = "Composition overview", description = "Compare signal shares across groups.", group = "Dashboard", needs = NULL),
  "results_dashboard-plot_heat" = list(label = "Abundance heatmap", description = "Compare lipid patterns across groups.", group = "Dashboard", needs = NULL),
  "qc_pca_tab-boxplotAfterNorm" = list(label = "Normalized signal boxplots", description = "Compare sample distributions after normalization.", group = "Quality check", needs = NULL),
  "qc_pca_tab-outlierPlot" = list(label = "Outlier screening", description = "Review samples flagged by outlier checks.", group = "Quality check", needs = NULL),
  "qc_pca_tab-pca2dPlot" = list(label = "PCA scores · 2D", description = "Explore sample separation in two dimensions.", group = "Quality check", needs = NULL),
  "qc_pca_tab-pca2dVectorPlot" = list(label = "PCA scores · editable 2D", description = "Enable Editable vector view in Quality Check; original plot and downloads remain available.", group = "Quality check", needs = NULL),
  "qc_pca_tab-pca3dPlot" = list(label = "PCA scores · 3D", description = "Rotate sample scores in three dimensions.", group = "Quality check", needs = NULL),
  "qc_pca_tab-load2dPlot" = list(label = "PCA loadings · 2D", description = "Inspect feature contributions to the PCA axes.", group = "Quality check", needs = NULL),
  "qc_pca_tab-load2dVectorPlot" = list(label = "PCA loadings · editable 2D", description = "Enable Editable vector view in Quality Check; unsupported label layouts retain the original view.", group = "Quality check", needs = NULL),
  "qc_pca_tab-load3dPlot" = list(label = "PCA loadings · 3D", description = "Explore feature contributions in three dimensions.", group = "Quality check", needs = NULL),
  "qc_pca_tab-sampleCorrPlot" = list(label = "Sample correlation", description = "Compare pairwise sample similarity.", group = "Quality check", needs = NULL),
  "qc_pca_tab-bqcPlot" = list(label = "Batch quality check", description = "Review batch-level quality metrics.", group = "Quality check", needs = NULL),
  "qc_pca_tab-bqcDeviationPlot" = list(label = "Batch deviation", description = "Inspect deviations across batches.", group = "Quality check", needs = NULL),
  "qc_pca_tab-bqcAbundancePlot" = list(label = "Batch abundance", description = "Compare abundance across batches.", group = "Quality check", needs = NULL),
  "qc_pca_tab-outlierPcaPlot" = list(label = "Outlier PCA", description = "PCA scores with samples marked by outlier flag and staged treatment.", group = "Quality check", needs = NULL),
  "qc_pca_tab-guided_qc_plot" = list(label = "Guided quality check", description = "Inspect the plot for the current guided QC step.", group = "Quality check", needs = NULL),
  "barchart-barPlotUnfiltered" = list(label = "Composition · unfiltered", description = "Compare sample composition before differential filtering.", group = "Composition", needs = NULL),
  "barchart-barPlotFiltered" = list(label = "Composition · filtered", description = "Compare composition for the active contrast.", group = "Composition", needs = "de"),
  "barchart-donutPlotUnfiltered" = list(label = "Composition share · unfiltered", description = "Review the unfiltered composition as a share.", group = "Composition", needs = NULL),
  "barchart-donutPlotFiltered" = list(label = "Composition share · filtered", description = "Review filtered composition as a share.", group = "Composition", needs = "de"),
  "volcano_tab-volcanoPlot" = list(label = "Differential volcano", description = "Explore fold change and statistical significance.", group = "Differential analysis", needs = "de"),
  "lsea_tab-lseaPlot" = list(label = "Lipid set enrichment", description = "Review enrichment across lipid sets.", group = "Differential analysis", needs = "de"),
  "fla_tab-plotVolcano" = list(label = "Functional ratio volcano", description = "Inspect differential functional ratios.", group = "Differential analysis", needs = "de"),
  "structural_tab-diffAcylPlot" = list(label = "Acyl chain remodeling", description = "Review differential acyl-chain changes.", group = "Differential analysis", needs = "de"),
  "heatmap_barchart_tab-heatmapPlot" = list(label = "Average signal heatmap", description = "Compare average signal across selected groups.", group = "Heatmaps", needs = NULL),
  "heatmap_barchart_tab-heatmapSDPlot" = list(label = "Signal variability heatmap", description = "Compare signal variability across groups.", group = "Heatmaps", needs = NULL),
  "heatmap_barchart_tab-filteredHeatmapPlot" = list(label = "Filtered average heatmap", description = "Review average signal for the active contrast.", group = "Heatmaps", needs = "de"),
  "heatmap_barchart_tab-filteredHeatmapSDPlot" = list(label = "Filtered variability heatmap", description = "Review signal variability for the active contrast.", group = "Heatmaps", needs = "de"),
  "heatmap_barchart_tab-violin_plot_render" = list(label = "Selected-feature distributions", description = "Review selected features on a log2 or linear prepared-abundance scale.", group = "Heatmaps", needs = NULL),
  "structural_tab-summaryPlot" = list(label = "Structural remodeling shifts", description = "Per class, the difference in chain length, double bonds or positions between comparison- and reference-enriched lipid species.", group = "Structure", needs = "de"),
  "structural_tab-speciesPlotPlot" = list(label = "Species structural features", description = "For one class, a structural feature of each lipid species (each point is a species), split by enrichment direction.", group = "Structure", needs = "de"),
  "structural_tab-networkPlot" = list(label = "Correlation network", description = "Classes, chain lengths, double bonds or species joined by strong abundance correlations across samples.", group = "Structure", needs = "de"),
  "structural_tab-propPlotPlot" = list(label = "Acyl chain proportions", description = "Compare acyl-chain composition by class.", group = "Structure", needs = NULL),
  "structural_grid_tab-heatmapPlot" = list(label = "Structural grid · selected class heatmap", description = "Map differential lipid changes across carbon length and unsaturation.", group = "Structure", needs = "de"),
  "structural_grid_tab-dotplotPlot" = list(label = "Structural grid · selected class dotplot", description = "Compare differential lipid measurements across structural coordinates.", group = "Structure", needs = "de"),
  "structural_grid_tab-mergedPlot" = list(label = "Structural grid · all classes", description = "Compare structural changes across lipid classes.", group = "Structure", needs = "de"),
  "structural_grid_tab-diffAllPlot" = list(label = "Structural grid · differential overview", description = "Review the all-class differential structural overview.", group = "Structure", needs = "de"),
  "group_comparison_tab-comparisonPlot" = list(label = "Lipid class comparison", description = "Compare lipid classes across conditions with local statistics.", group = "Group comparison", needs = NULL),
  "logratio_tab-logratioPlot" = list(label = "Violin distributions", description = "Compare distributions across selected groups.", group = "Distributions & ratios", needs = NULL),
  "fla_tab-logratioPlot" = list(label = "Functional ratio distributions", description = "Compare functional ratios across groups.", group = "Distributions & ratios", needs = NULL),
  "fla_tab-plotCircos" = list(label = "Functional correlation circos", description = "Explore correlations among functional indices.", group = "Distributions & ratios", needs = "de"),
  "longitudinal_tab-macroclass_plot" = list(label = "Time course · main class", description = "Track main-class signal across time points.", group = "Longitudinal", needs = "time"),
  "longitudinal_tab-subclass_plot" = list(label = "Time course · subclass", description = "Track subclass signal across time points.", group = "Longitudinal", needs = "time"),
  "longitudinal_tab-index_plot" = list(label = "Time course · functional index", description = "Track functional indices over time.", group = "Longitudinal", needs = "time"),
  "longitudinal_tab-struct_plot" = list(label = "Time course · structure", description = "Track structural measures over time.", group = "Longitudinal", needs = "time"),
  "longitudinal_tab-allmetrics_plot" = list(label = "Time course · all metrics", description = "Compare available metrics over time.", group = "Longitudinal", needs = "time"),
  "pathway_tab-pathwayPlot" = list(label = "Lipid pathway map", description = "Explore the selected pathway comparison.", group = "Pathways", needs = NULL),
  "pathway_tab-pathwayVisNetwork" = list(label = "Interactive pathway network", description = "Explore the live network. Finish keeps it as an image.", group = "Pathways", needs = NULL),
  "cellular_org_tab-stressPlot" = list(label = "Organelle stress proxies", description = "Per-sample composition ratios (for example PE/PC, Cer/SM) by group, one panel per index. Compositional proxies.", group = "Cellular organization", needs = NULL),
  "cellular_org_tab-cpiPlot" = list(label = "Peroxidation index (CPI)", description = "Per-sample weighted share of polyunsaturated lipid signal by group, against a reference baseline. A compositional proxy.", group = "Cellular organization", needs = NULL),
  "cellular_org_tab-polarPlot" = list(label = "Storage vs structural map", description = "Each sample placed by its neutral-storage share (x) and membrane structural/ether share (y). Quadrants are a hypothesis aid.", group = "Cellular organization", needs = NULL),
  "cell_lipid_plot" = list(label = "Selected feature profile", description = "Inspect measurements for the selected lipid feature.", group = "Cell comparisons", needs = NULL),
  "cell_profile_plot" = list(label = "Class profile", description = "Compare the selected lipid class profile.", group = "Cell comparisons", needs = NULL),
  "cell_class_plot" = list(label = "Class totals · two cohorts", description = "Median per-sample class total for the reference and comparison cohorts. Descriptive.", group = "Cell comparisons", needs = NULL),
  "cell_comparison_plot" = list(label = "Cohort comparison", description = "Compare prepared feature values between cohorts.", group = "Cell comparisons", needs = NULL)
)

api_catalog_render_kinds <- c(renderPlotly = "plotly", renderPlot = "png", renderImage = "png",
  renderVisNetwork = "visnetwork", renderUI = "html")
# The Team frontend files, read once. A tree may define an output outside its family's module file
# (Max's hooks tree: qc_pca_tab-guided_qc_plot in R/frontends/team/qc-server.R).
api_catalog_team_texts <- local({
  cache <- list()
  function(dir) {
    if (is.null(cache[[dir]])) {
      files <- sort(list.files(dir, pattern = "\\.R$", recursive = TRUE, full.names = TRUE))
      cache[[dir]] <<- vapply(files, function(f) paste(readLines(f, warn = FALSE), collapse = "\n"), character(1))
    }
    cache[[dir]]
  }
})
# How Team renders output$<output>: the family file's definition, else the one render kind the Team
# frontend files agree on; NULL when none or when they disagree.
api_catalog_render_kind <- function(output, family_file, team_dir = "R/frontends/team") {
  pattern <- paste0("output\\$", output,
    "\\s*<-\\s*(?:[A-Za-z0-9.]+::)?(renderPlotly|renderPlot|renderImage|renderVisNetwork|renderUI)\\s*\\(")
  renderers <- function(texts) unique(unlist(lapply(texts, function(text) {
    hit <- regmatches(text, regexec(pattern, text, perl = TRUE))[[1L]]
    if (length(hit) >= 2L) hit[[2L]]
  })))
  found <- renderers(paste(readLines(family_file, warn = FALSE), collapse = "\n"))
  if (!length(found)) found <- renderers(api_catalog_team_texts(team_dir))
  if (length(found) != 1L) return(NULL)
  unname(api_catalog_render_kinds[[found]])
}
api_catalog_render <- function(id, family, output) {
  if (family %in% c("results_dashboard", "team_cell")) return("plotly")
  # Team adds these two next to the 2D plots under a generated name (legacy_vector_adapter.R on
  # production, the qc_plot_outputs hook on the hooks tree), always as renderPlotly.
  if (id %in% c("qc_pca_tab-pca2dVectorPlot", "qc_pca_tab-load2dVectorPlot")) return("plotly")
  path <- if (family == "group_comparison_tab") "R/frontends/team/group_comparison.R" else
    team_plot_instance_family_files[[family]]
  kind <- api_catalog_render_kind(output, path)
  if (is.null(kind)) stop("Cannot classify Team output: ", id, call. = FALSE)
  kind
}
# Cards whose module sets its own plot height through an input (chart audit b05 F5): the card
# reports that input's settled value as plotHeight (cards.R). Only the violin view for now.
api_catalog_height_inputs <- list("heatmap_barchart_tab-violin_plot_render" = "violin_zoom_pct")
api_catalog <- local({
  cached <- NULL
  function() {
    if (!is.null(cached)) return(cached)
    ids <- unlist(lapply(names(team_plot_instance_families), function(family)
      paste0(family, "-", team_plot_instance_families[[family]]$outputs)), use.names = FALSE)
    if (exists("team_cell_instance_outputs", inherits = TRUE)) ids <- c(ids, team_cell_instance_outputs)
    cached <<- lapply(ids, function(id) {
      resolved <- team_plot_instance_source(id)
      family <- resolved$family; output <- resolved$output
      copy <- api_catalog_copy[[id]]
      if (is.null(copy)) stop("Missing Team catalog text: ", id, call. = FALSE)
      allowed <- team_plot_instance_input_ids(id)
      defaults <- team_plot_instance_input_defaults(family)
      # Match canvas.js newCardSize(), with the compact composition shell enabled.
      roomy <- (family == "heatmap_barchart_tab" && output != "violin_plot_render") ||
        id == "results_dashboard-plot_heat"
      compact <- family == "barchart" || id %in% c("results_dashboard-plot_comp", "results_dashboard-plot_dist")
      size <- list(width = if (roomy) 1000L else if (id == "cellular_org_tab-stressPlot") 900L else 620L,
        height = if (roomy) 1100L else if (compact) 380L else 720L)
      entry <- c(list(id = id, family = family, output = output,
        render = api_catalog_render(id, family, output), allowedInputs = allowed,
        defaults = defaults[intersect(names(defaults), allowed)],
        inputs = Filter(function(x) x$id %in% allowed, api_family_schema(family)),
        tabs = team_plot_instance_layout(id)$tabs,
        shownBy = team_plot_instance_shown_by[[id]], defaultSize = size), copy)
      if (!is.null(api_catalog_height_inputs[[id]])) entry$heightInput <- api_catalog_height_inputs[[id]]
      # Chart audit b12: the Plotly event source whose clicks Nexo forwards to Team (cards.R api_card_click_sources).
      if (exists("api_card_click_sources") && !is.null(api_card_click_sources[[id]])) entry$clickSource <- api_card_click_sources[[id]]
      entry
    })
    cached
  }
})
api_catalog_entry <- function(id) {
  entries <- Filter(function(x) identical(x$id, id), api_catalog())
  if (!length(entries)) api_abort("api_bad_request", paste("Unknown plot source:", id))
  entries[[1L]]
}
