/* Reviewed companion guidance (data only; no code paths, no network).
 * Source of truth for the Team companion's tips, "Explain this chart",
 * "Suggest improvements" and offline Q&A. Every chart text was checked against
 * the code that renders it; `src` lists the file:line references used for that
 * review. tools/companion/export_guidance.cjs exports this file as JSON and CSV.
 * Edit the text here, never generate it with a model at runtime.
 *
 * Suggestion actions are presentation or navigation only:
 *   style:<section>  open the card's Style tab at that section
 *   publication      apply the editor's Publication style (fonts/background only)
 *   palette          apply the palette the other canvas cards use
 *   data:<suffix>    open the card's Data tab and highlight that control
 *   datasettings     open the source analysis settings for this card
 *   stats            open the card's Statistics tab
 *   figure           open the figure page
 * Scientific settings are never changed from here: suggestions that touch them
 * only open the control so the person decides.
 */
(function () {
  'use strict';
  var C = {};
  function chart(id, o) { C[id] = o; }

  // ---------------------------------------------------------------- Dashboard
  chart('results_dashboard-plot_pca', {cat: 'dashboard', kind: 'descriptive',
    what: 'Each point is one sample placed by its scores on the first two principal components of the prepared data. The axis titles give the share of variance each component explains.',
    read: 'Samples that sit close together have similar overall lipid profiles; distance along PC1 matters more than along PC2 because PC1 explains more variance. Colour shows the grouping chosen in Colour by.',
    caveats: ['Exploratory only: PCA does not test group differences, and separation is not significance.',
      'By default values are log2(x + 1), centred and scaled to unit variance; only lipids measured in every sample and with non-zero variance are used. The note under the plot says how many were excluded.',
      'Change the scale in the Data tab and the picture can change; compare plots only when scale, samples and lipids match.'],
    tips: [{text: 'Colour by the grouping that matches your question.', action: 'data:-color_by'},
      {text: 'Review the abundance scale and scaling (log2 and unit variance by default) before comparing with another PCA.', action: 'data:-pca_transform'}],
    src: ['R/results_dashboard.R:542-590', 'R/results_dashboard.R:236-237', 'R/results_dashboard.R:265']});
  chart('results_dashboard-plot_violin', {cat: 'dashboard', kind: 'descriptive',
    what: 'The distribution of one lipid in each group. Values are log10 prepared abundances; each dot is a sample and the inner box shows the median and quartiles.',
    read: 'Compare where the bulk of each violin sits and how spread out it is. Width shows how many samples fall at that level; with few samples the shape is mostly smoothing.',
    caveats: ['Descriptive: no test is run on this card.',
      'Only positive values are drawn. Prepared values can include imputed estimates, and violin tails are estimates, not measurements.',
      'Tests are available on independent copies of this plot (Statistics tab: Welch t-test or Wilcoxon rank-sum, Holm correction by default). They are blocked when participant IDs repeat or the design is paired.'],
    tips: [{text: 'Choose the lipid to show in the Data tab.', action: 'data:-violin_lipid'},
      {text: 'For a test, use the Statistics tab of an independent copy, and report the test and correction in the legend.', action: 'stats'}],
    src: ['R/results_dashboard.R:502-538', 'R/results_dashboard.R:250', 'R/frontends/team/violin_statistics.R:2-10,82,147-187,276-280', 'www/team/js/canvas_statistics.js:550']});
  chart('results_dashboard-plot_dist', {cat: 'dashboard', kind: 'descriptive',
    what: 'One box per sample showing the spread of log10 abundances across all lipids, ordered and coloured by group.',
    read: 'Boxes at similar heights suggest comparable overall signal after preparation; a sample whose box is clearly shifted or much wider deserves a quality check.',
    caveats: ['Missing and non-positive values are left out; the note under the plot gives how many.', 'A shifted box is a prompt to check the sample, not proof that it is an outlier.'],
    tips: [{text: 'Colour by the grouping you will discuss so shifted samples are easy to place.', action: 'data:-color_by'}],
    src: ['R/results_dashboard.R:712-760', 'R/results_dashboard.R:257']});
  chart('results_dashboard-plot_comp', {cat: 'dashboard', kind: 'descriptive',
    what: 'The share of each sample\'s summed prepared signal that comes from each lipid class. By group, each bar is the average of the per-sample percentages.',
    read: 'Compare the size of each class segment between groups. Hover shows the standard deviation and the number of samples behind a group bar.',
    caveats: ['These are signal shares, not molar proportions.', 'Only the classes you select are shown, and they are rescaled to 100%, so adding or removing a class changes every share.'],
    tips: [{text: 'Choose By group or By sample on the X axis.', action: 'data:-comp_axis_mode'},
      {text: 'If you hide classes, say in the legend that shares are of the selected classes.', action: 'data:-comp_class_selection'}],
    src: ['R/results_dashboard.R:619-709', 'R/results_dashboard.R:256', 'R/results_dashboard.R:266']});
  chart('results_dashboard-plot_heat', {cat: 'dashboard', kind: 'descriptive',
    what: 'Rows are lipids and columns are groups. Each cell is the group mean of per-sample z-scores computed on log10 values across the whole cohort.',
    read: 'Red cells are above that lipid\'s cohort average and blue cells below. The default view keeps the most variable lipids, clustered by pattern.',
    caveats: ['Colours are relative within each lipid; they do not compare abundance between lipids.', 'Only lipids that are positive in every sample are shown.',
      'Significant only runs no test of its own: it reuses the Differential analysis result and its thresholds, and it is unavailable when the design does not allow independent-sample inference.'],
    tips: [{text: 'With many lipids, keep the most variable ones or, where available, show Significant only.', action: 'data:-heat_significance'},
      {text: 'Adjust how many of the most variable lipids are shown.', action: 'data:-top_n'}],
    src: ['R/results_dashboard.R:765-905', 'R/results_dashboard.R:238', 'R/results_dashboard.R:276-303', 'R/results_dashboard.R:267', 'R/modules/1_shared_data_module.R:4479-4488']});

  // ------------------------------------------------------------ Quality check
  chart('qc_pca_tab-boxplotAfterNorm', {cat: 'qc', kind: 'descriptive',
    what: 'One box per sample of log2(intensity + 1) after preparation and normalization.',
    read: 'After normalization the boxes should sit at similar levels; a sample far off the others is worth checking.',
    caveats: ['The y axis is clipped to the 1st-99th percentiles and outlier points are hidden.', 'In merged mode each lipid is averaged within its group first.'],
    tips: [{text: 'Colour samples by batch or group in the Quality check settings.', action: 'datasettings'}],
    src: ['R/modules/2_qc_boxplot_module.R:900-973', 'R/frontends/team/qc-ui.R:21-36']});
  chart('qc_pca_tab-outlierPlot', {cat: 'qc', kind: 'descriptive',
    what: 'For each sample, its distance from the centre of the PCA (PC1-PC2), turned into a robust z-score with the median and MAD.',
    read: 'Bars past the red dashed line (median + threshold x MAD, 2.5 by default) are flagged as outlier risk.',
    caveats: ['A heuristic screen with no p-value.', 'A flag is a reason to check technical and biological context, not a reason to exclude a sample by itself.'],
    tips: [{text: 'Review the threshold and scope (overall or within group) in the Quality check settings.', action: 'datasettings'}],
    src: ['R/modules/2_qc_boxplot_module.R:975-1141', 'R/frontends/team/qc-ui.R:187-189']});
  chart('qc_pca_tab-pca2dPlot', {cat: 'qc', kind: 'descriptive',
    what: 'Sample scores on PC1 and PC2 of the prepared data (log2(x + 1), centred and scaled), with the variance explained on each axis.',
    read: 'Nearby samples have similar overall profiles. In merged mode each point is a group centroid.',
    caveats: ['Exploratory only: no group test.', 'If the targeted lipids cannot support PCA, the plot falls back to the full matrix and says so in a banner.'],
    tips: [{text: 'Adjust label and marker size for print in the Quality check settings.', action: 'datasettings'}],
    src: ['R/modules/2_qc_boxplot_module.R:2227-2300', 'R/modules/1_shared_data_module.R:4523-4606,4690-4720', 'R/modules/utils_stats.R:704']});
  chart('qc_pca_tab-pca2dVectorPlot', {cat: 'qc', kind: 'descriptive',
    what: 'An editable copy of the 2D PCA scores plot, with the same points, colours and labels.',
    read: 'Read it like the PCA scores plot; the editable version only allows presentation changes.',
    caveats: ['It is unavailable while smart (repelled) labels are on, which is the default; turn them off to use it.'],
    tips: [{text: 'Turn off smart labels in Quality check to enable the editable view.', action: 'datasettings'}],
    src: ['R/frontends/team/legacy_vector_adapter.R:3-48', 'R/frontends/team/qc-ui.R:64,260-261']});
  chart('qc_pca_tab-pca3dPlot', {cat: 'qc', kind: 'descriptive',
    what: 'Sample scores on the first three principal components, in a rotatable 3D view.',
    read: 'Rotate to see whether structure seen in PC1-PC2 holds on PC3. Axis titles give the variance explained.',
    caveats: ['Exploratory only. 3D views are hard to read on paper; prefer a 2D plot for the figure.'],
    tips: [],
    src: ['R/modules/2_qc_boxplot_module.R:2302-2345']});
  chart('qc_pca_tab-load2dPlot', {cat: 'qc', kind: 'descriptive',
    what: 'Each point is a lipid placed by its loadings (weights) on PC1 and PC2, coloured by class.',
    read: 'Lipids far from the origin in a direction contribute most to that component; compare with the scores plot to see which lipids align with which samples.',
    caveats: ['Loadings describe the PCA, not group differences.'],
    tips: [{text: 'Show single lipid names or change label size in Quality check.', action: 'datasettings'}],
    src: ['R/modules/2_qc_boxplot_module.R:2347-2377', 'R/modules/1_shared_data_module.R:4597-4601']});
  chart('qc_pca_tab-load2dVectorPlot', {cat: 'qc', kind: 'descriptive',
    what: 'An editable copy of the 2D loadings plot.',
    read: 'Read it like the loadings plot; only presentation can be edited.',
    caveats: ['Unavailable while repelled labels are drawn.'],
    tips: [{text: 'Turn off smart labels in Quality check to enable it.', action: 'datasettings'}],
    src: ['R/frontends/team/legacy_vector_adapter.R:9,53-72']});
  chart('qc_pca_tab-load3dPlot', {cat: 'qc', kind: 'descriptive',
    what: 'Lipid loadings on the first three principal components, coloured by class, in 3D.',
    read: 'Lipids far from the origin drive the corresponding components.',
    caveats: ['Exploratory only; prefer a 2D view for print.'],
    tips: [],
    src: ['R/modules/2_qc_boxplot_module.R:2379-2391']});
  chart('qc_pca_tab-sampleCorrPlot', {cat: 'qc', kind: 'descriptive',
    what: 'A sample-by-sample matrix of correlation coefficients (Pearson by default, or Spearman) on prepared values, from -1 (blue) to 1 (red).',
    read: 'Blocks of high correlation show samples with similar profiles; with clustering on, similar samples are placed next to each other.',
    caveats: ['Descriptive; no test. Correlations are computed on prepared values without a log transform.'],
    tips: [{text: 'Choose Pearson or Spearman and label size in Quality check.', action: 'datasettings'}],
    src: ['R/modules/2_qc_boxplot_module.R:2396-2531', 'R/frontends/team/qc-ui.R:79-82']});
  chart('qc_pca_tab-bqcPlot', {cat: 'qc', kind: 'descriptive',
    what: 'The distribution of each lipid\'s coefficient of variation (SD / mean x 100) across the selected quality-control (BQC) samples.',
    read: 'Most lipids should fall left of the dashed threshold (20% by default). A long right tail means many lipids vary a lot between QC injections.',
    caveats: ['Needs at least two BQC samples.', 'If you choose to filter by this threshold, lipids above it are removed from every downstream analysis.'],
    tips: [{text: 'Review which samples are BQC and the CoV threshold in Quality check.', action: 'datasettings'}],
    src: ['R/modules/2_qc_boxplot_module.R:2876-3015', 'R/frontends/team/qc-ui.R:463-469']});
  chart('qc_pca_tab-bqcDeviationPlot', {cat: 'qc', kind: 'descriptive',
    what: 'One bar per BQC sample: the average absolute deviation of its lipids from their mean across the BQC samples.',
    read: 'Bars above 1.5 times the median are marked as high deviation and may be anomalous runs.',
    caveats: ['This is a mean absolute deviation from the mean, not a median absolute deviation.'],
    tips: [],
    src: ['R/modules/2_qc_boxplot_module.R:3018-3053']});
  chart('qc_pca_tab-bqcAbundancePlot', {cat: 'qc', kind: 'descriptive',
    what: 'The total summed intensity of each BQC sample, with a dashed line at the median.',
    read: 'Similar totals suggest consistent injections; a clear drop or rise is worth checking.',
    caveats: ['Descriptive monitoring only.'],
    tips: [],
    src: ['R/modules/2_qc_boxplot_module.R:3056-3086']});
  chart('qc_pca_tab-outlierPcaPlot', {cat: 'qc', kind: 'descriptive',
    what: 'The PCA scores plot with samples marked by their outlier flag and the treatment you staged for them (keep, average or remove).',
    read: 'Use it to see where flagged samples sit before deciding what to do with them.',
    caveats: ['Position alone does not prove a sample is an outlier. Any exclusion needs a reason and your confirmation.'],
    tips: [],
    src: ['R/modules/2_qc_boxplot_module.R:1612-1682']});
  chart('qc_pca_tab-guided_qc_plot', {cat: 'qc', kind: 'descriptive',
    what: 'PC1 against PC2 of the prepared data, one point per sample, used to inspect samples in Review.',
    read: 'Click a point to inspect that sample. Excluding it requires your confirmation and can be undone.',
    caveats: ['Investigate technical and biological context before excluding a sample; a point\'s position alone is not enough.'],
    tips: [],
    src: ['R/modules/2_qc_boxplot_module.R:1194-1255']});

  // ------------------------------------------------------------ Composition
  chart('barchart-barPlotUnfiltered', {cat: 'composition', kind: 'descriptive',
    what: 'Lipid signal summed by class (or category) for each sample or group, as intensities or as percentages depending on the value mode.',
    read: 'In merged mode each bar is the group mean with SD or SEM error bars. Percent modes make each bar add to 100%.',
    caveats: ['Signal, not molar amounts.', 'Normalized modes first scale each lipid by its sum across samples; say which mode you used.'],
    tips: [{text: 'Choose the value mode, grouping and error bars (SD or SEM) in the Composition settings, and name them in the legend.', action: 'datasettings'}],
    src: ['R/modules/5_barchart_module.R:649-689', 'R/utils_vis.R:738-871', 'R/frontends/team/modules-ui.R:221-258']});
  chart('barchart-barPlotFiltered', {cat: 'composition', kind: 'mixed',
    what: 'The same composition bars, restricted to lipids that passed the Differential analysis thresholds for the active comparison.',
    read: 'It shows how the significant lipids are distributed across classes. The title names the comparison.',
    caveats: ['No new test is run here; it reuses Differential analysis and needs it to have run.', 'If participant IDs repeat, a pseudoreplication warning appears above the plot.'],
    tips: [{text: 'Check the comparison and thresholds in the Differential analysis settings.', action: 'datasettings'}],
    src: ['R/modules/5_barchart_module.R:782-965', 'R/frontends/team/da_participant_warning.R:45-52']});
  chart('barchart-donutPlotUnfiltered', {cat: 'composition', kind: 'descriptive',
    what: 'Class shares of summed signal shown as donuts, one donut per sample or group (or per class, depending on orientation).',
    read: 'Each slice is that class\'s percentage of the donut\'s total.',
    caveats: ['Signal shares, not molar proportions. Small slices are hard to compare; bars are easier to read.'],
    tips: [{text: 'Turn on slice percentages (Show donut proportion) in the Composition settings.', action: 'datasettings'}],
    src: ['R/modules/5_barchart_module.R:725-779', 'R/utils_vis.R:1089-1218']});
  chart('barchart-donutPlotFiltered', {cat: 'composition', kind: 'mixed',
    what: 'Donut shares for the lipids that passed the Differential analysis thresholds.',
    read: 'Read it like the unfiltered donut, limited to significant lipids.',
    caveats: ['Reuses Differential analysis; no new test.'],
    tips: [],
    src: ['R/modules/5_barchart_module.R:1001-1063']});

  // --------------------------------------------------- Differential analysis
  chart('volcano_tab-volcanoPlot', {cat: 'differential', kind: 'inferential',
    what: 'Each point is a lipid: x is log2 fold change (comparison vs reference) and y is -log10 of the p-value (BH-adjusted or raw, as set in Differential analysis).',
    read: 'Points beyond the dotted lines on both axes pass the fold-change and p-value thresholds and are coloured up or down.',
    caveats: ['The test is the limma moderated t-test or the Wilcoxon rank-sum test, chosen in Differential analysis (Auto picks one from group size and skewness).',
      'p-values assume independent samples; if participant IDs repeat, the figure carries a pseudoreplication warning.', 'Check the direction of the comparison before describing up and down.'],
    tips: [{text: 'Label the top significant lipids and set the label size in the Volcano settings.', action: 'datasettings'},
      {text: 'State the comparison, test and correction in the legend.', action: 'style:Title and fonts'}],
    src: ['R/modules/6_volcano_module.R:192-241,427-456', 'R/modules/utils_stats.R:53-91,546-617', 'R/frontends/team/hub-ui.R:108-219', 'R/frontends/team/da_participant_warning.R:94-182']});
  chart('lsea_tab-lseaPlot', {cat: 'differential', kind: 'inferential',
    what: 'Each row is a lipid set (by default a main class). x is its log2 fold change; dot size is -log10 p; colour follows the fold change.',
    read: 'Sets far from zero with large dots differ most between the groups.',
    caveats: ['For classes, the per-sample mean of log2 intensities is compared with a t-test or Wilcoxon test and BH-adjusted across sets.',
      'The fold-change cut-off here is set separately from Differential analysis (default 0).'],
    tips: [{text: 'Set the minimum set size and how many sets to show in the LSEA settings.', action: 'datasettings'}],
    src: ['R/modules/7_lsea_module.R:144-157,301-318,384-527,584-636', 'R/modules/utils_stats.R:806-838']});
  chart('fla_tab-plotVolcano', {cat: 'differential', kind: 'inferential',
    what: 'A volcano for functional lipid indices: x is the mean change of each index versus the baseline group, y is -log10 of the raw p-value.',
    read: 'Indices above the dashed line (p = 0.05) are labelled.',
    caveats: ['p-values are raw (unadjusted) and come from a t-test or Wilcoxon test per index.', 'Indices summarize composition; they do not measure membrane properties directly.'],
    tips: [{text: 'Choose the target group and scale in the Functional ratios settings.', action: 'datasettings'}],
    src: ['R/modules/10_fla_module.R:170-183,793-858,1369-1469', 'R/modules/utils_stats.R:676-678,766-767']});
  chart('structural_tab-diffAcylPlot', {cat: 'differential', kind: 'inferential',
    what: 'Differences in acyl-chain composition between the comparison and reference groups, as log2 fold change per chain (forest view by default, or a volcano).',
    read: 'Bars or points away from zero are chains whose share differs; error bars are an approximate 95% interval.',
    caveats: ['Stars and up/down counts use raw p-values; FDR-adjusted values are in the table.', 'The interval is an approximation, not an exact confidence interval for the log ratio.'],
    tips: [{text: 'Choose the plot style and ranking in the structural settings.', action: 'datasettings'}],
    src: ['R/modules/8_structural_module.R:599-638,868-919,1048-1060,5874-6062']});

  // ---------------------------------------------------------------- Heatmaps
  chart('heatmap_barchart_tab-heatmapPlot', {cat: 'heatmaps', kind: 'descriptive',
    what: 'Prepared abundance per lipid (rows) for each group mean or sample (columns). By default colours are row z-scores of log2 values.',
    read: 'Within a row, warm cells are above that lipid\'s average and cool cells below. Rows are ordered by class (or staircase order), not clustered.',
    caveats: ['No statistical filtering or testing.', 'Z-score colours compare columns within a lipid, not lipids with each other.'],
    tips: [{text: 'With many rows, condense to classes or hide row names in the Heatmap settings.', action: 'datasettings'}],
    src: ['R/modules/4_heatmap_module.R:21-79,1743-1862', 'R/utils_vis.R:370-475,620-625', 'R/frontends/team/heatmap_scale_adapter.R:1']});
  chart('heatmap_barchart_tab-heatmapSDPlot', {cat: 'heatmaps', kind: 'descriptive',
    what: 'For each lipid class, the standard deviation among its species in each column, shown on the same colour scales.',
    read: 'High values mean the species within a class behave differently from each other.',
    caveats: ['Classes with a single species show 0.', 'Descriptive only.'],
    tips: [],
    src: ['R/modules/4_heatmap_module.R:2298-2362', 'R/utils_vis.R:432,450']});
  chart('heatmap_barchart_tab-filteredHeatmapPlot', {cat: 'heatmaps', kind: 'mixed',
    what: 'The abundance heatmap restricted to lipids that passed the Differential analysis thresholds; the title shows the thresholds.',
    read: 'Read it like the abundance heatmap. Selection used the test; the colours themselves are descriptive.',
    caveats: ['If no lipid passes, the plot says so. If participant IDs repeat, a pseudoreplication warning appears.'],
    tips: [{text: 'Check the comparison and thresholds in the Differential analysis settings.', action: 'datasettings'}],
    src: ['R/modules/4_heatmap_module.R:2036-2273,2783-2865']});
  chart('heatmap_barchart_tab-filteredHeatmapSDPlot', {cat: 'heatmaps', kind: 'mixed',
    what: 'The within-class variability heatmap for significant lipids only.',
    read: 'High values mean the significant species within a class differ from each other.',
    caveats: ['Requires condensed rows; reuses Differential analysis.'],
    tips: [],
    src: ['R/modules/4_heatmap_module.R:2471-2632']});
  chart('heatmap_barchart_tab-violin_plot_render', {cat: 'heatmaps', kind: 'mixed',
    what: 'Violins with boxes and sample dots for the selected lipids, on a log2 (default) or linear scale, grouped by Group1.',
    read: 'Compare the distribution of each lipid between groups; brackets mark comparisons with the chosen baseline group.',
    caveats: ['Brackets use Welch t-tests against the baseline with raw (unadjusted) p-values.', 'Up to 60 species can be shown; many panels get small quickly.'],
    tips: [{text: 'Limit the selection or adjust zoom in the Heatmap violin settings.', action: 'datasettings'}],
    src: ['R/modules/4_heatmap_module.R:90-94,157-165,715-835,1008-1036', 'R/frontends/team/heatmap_scale_adapter.R:3-32']});

  // --------------------------------------------------------------- Structure
  chart('structural_tab-summaryPlot', {cat: 'structure', kind: 'inferential',
    what: 'For each class and structural feature (carbons, double bonds, chain positions), the difference in that feature between lipids enriched in the comparison group and lipids enriched in the reference group.',
    read: 'Dots right of zero mean comparison-enriched lipids have longer or more unsaturated chains; dot size is the size of the difference.',
    caveats: ['Lipid species, not samples, are compared here (t-test or Wilcoxon), with BH correction across class-feature tests.', 'The difference is in carbons or double bonds, not a fold change.'],
    tips: [{text: 'Set sorting and how many classes to show in the structural settings.', action: 'datasettings'}],
    src: ['R/modules/8_structural_module.R:1940-2077,2191-2228', 'R/modules/utils_stats.R:793-830']});
  chart('structural_tab-speciesPlotPlot', {cat: 'structure', kind: 'inferential',
    what: 'For a selected class and feature, the feature value of each lipid species, split into species enriched in the reference group and in the comparison group.',
    read: 'Each point is a lipid species, not a sample. A bracket appears when the two sets differ at p < 0.05.',
    caveats: ['Welch t-test or Wilcoxon test with no multiple-testing correction.'],
    tips: [],
    src: ['R/modules/8_structural_module.R:2342,2406-2524']});
  chart('structural_tab-networkPlot', {cat: 'structure', kind: 'descriptive',
    what: 'A network of lipid classes, chain lengths, double-bond counts or species. Edges join pairs whose abundances correlate across samples (Pearson |r| at or above the threshold, 0.85 by default).',
    read: 'Blue edges are positive and orange edges negative correlations. At most the strongest 100 edges are drawn.',
    caveats: ['Only edges with p < 0.05 are kept, without multiple-testing correction.', 'Correlation is not a pathway or a causal link.'],
    tips: [{text: 'Change the network level, threshold or layout in the structural settings.', action: 'datasettings'}],
    src: ['R/modules/8_structural_module.R:268-292,2554-2659']});
  chart('structural_tab-propPlotPlot', {cat: 'structure', kind: 'descriptive',
    what: 'Stacked bars of acyl-chain composition per group: each segment is a chain\'s average share (default) or normalized value.',
    read: 'Compare segment sizes between groups; error bars (SEM by default) show variation between samples.',
    caveats: ['Uncommon chains are grouped as Other.', 'Descriptive only.'],
    tips: [{text: 'Choose chain position and value mode in the structural settings.', action: 'datasettings'}],
    src: ['R/modules/8_structural_module.R:418-487,4316-4436,4858-4866']});
  chart('structural_grid_tab-heatmapPlot', {cat: 'structure', kind: 'mixed',
    what: 'A grid of carbon length (x) by double bonds (y) for the selected class. Each tile is the average log2 fold change of the lipids in that cell.',
    read: 'Clusters of red or blue tiles show structural regions that change together.',
    caveats: ['Labels show the smallest Differential analysis p-value in the tile, reused and not adjusted again.'],
    tips: [{text: 'Choose the class and label rules in the Structural grid settings.', action: 'datasettings'}],
    src: ['R/modules/12_structural_grid_module.R:302-313,420-451,655-708,1018-1019']});
  chart('structural_grid_tab-dotplotPlot', {cat: 'structure', kind: 'mixed',
    what: 'The same carbon-by-double-bond grid as dots: colour is the average log2 fold change and size its magnitude.',
    read: 'Large, strongly coloured dots mark the structural cells that change most.',
    caveats: ['Labels reuse Differential analysis p-values.'],
    tips: [],
    src: ['R/modules/12_structural_grid_module.R:719-769,1050-1051']});
  chart('structural_grid_tab-mergedPlot', {cat: 'structure', kind: 'descriptive',
    what: 'All classes on one carbon-by-double-bond grid; each point marks a class that has at least one lipid in that cell.',
    read: 'Use it to see which structural space each class occupies.',
    caveats: ['It shows coverage, not change; no statistics.'],
    tips: [],
    src: ['R/modules/12_structural_grid_module.R:562-569,782-822']});
  chart('structural_grid_tab-diffAllPlot', {cat: 'structure', kind: 'mixed',
    what: 'All classes on the structural grid, with size, fill and transparency showing each class\'s average log2 fold change at that carbon length or double-bond count.',
    read: 'Look for classes whose changes concentrate at particular chain lengths or unsaturation.',
    caveats: ['By default, cells that do not reach the p-value cut-off are hidden.'],
    tips: [],
    src: ['R/modules/12_structural_grid_module.R:328-343,576-641,849-974']});

  // -------------------------------------------------------- Group comparison
  chart('group_comparison_tab-comparisonPlot', {cat: 'groupcomp', kind: 'inferential',
    what: 'One panel per lipid class: each sample\'s class share, expressed relative to the baseline group mean (log2 fold change by default).',
    read: 'Points above zero have a larger class share than the baseline average. Stars compare each group with the baseline.',
    caveats: ['t-test or Wilcoxon test per class, with unadjusted p-values.', 'You must confirm the baseline first. If participant IDs repeat, p-values are withheld and the reason is shown.'],
    tips: [{text: 'Open the full statistical report from the figure\'s statistics panel.', action: 'stats'}],
    src: ['R/frontends/team/group_comparison.R:22-32,88-139,172-187', 'www/team/js/group_comparison.js:40,118-166', 'R/modules/9_logratio_module.R:558,626-708']});

  // -------------------------------------------------- Distributions & ratios
  chart('logratio_tab-logratioPlot', {cat: 'distributions', kind: 'inferential',
    what: 'Violins with boxes and points for each class or category, showing its share of the sample total relative to the baseline group (log2 fold change by default).',
    read: 'Values above zero mean a larger share than the baseline mean.',
    caveats: ['Each group is tested against the baseline on the plotted scale (t-test or Wilcoxon), with unadjusted p-values.', 'A baseline is required; repeated participant IDs withhold the p-values.'],
    tips: [{text: 'Choose the baseline and scale in the Log-ratio settings.', action: 'datasettings'}],
    src: ['R/modules/9_logratio_module.R:21-143,531-746,1240-1268', 'R/frontends/team/group_comparison.R:192-200']});
  chart('fla_tab-logratioPlot', {cat: 'distributions', kind: 'inferential',
    what: 'Violins of each functional lipid index by group, one panel per index.',
    read: 'Brackets compare groups with the first baseline group where a difference is marked.',
    caveats: ['Raw (unadjusted) p-values from t-tests or Wilcoxon tests.', 'Indices summarize composition; they do not measure membrane structure directly.'],
    tips: [{text: 'Choose indices and scale in the Functional ratios settings.', action: 'datasettings'}],
    src: ['R/modules/10_fla_module.R:840-858,1013,1076-1206', 'R/modules/utils_stats.R:766']});
  chart('fla_tab-plotCircos', {cat: 'distributions', kind: 'descriptive',
    what: 'A chord diagram of Pearson correlations between the selected functional indices across all samples, with groups pooled.',
    read: 'Wider links are stronger correlations; blue is positive and orange-red negative. Only the strongest links above the threshold are drawn.',
    caveats: ['Pooling groups can create correlations that reflect group differences.', 'In Team it needs a confirmed independent study design.'],
    tips: [],
    src: ['R/modules/10_fla_module.R:316,383-385,1589-1720', 'R/frontends/team/inferential_network_adapter.R:9-20']});

  // -------------------------------------------------------------- Longitudinal
  var longCaveats = ['Each line is one participant. The test is a paired t-test or paired Wilcoxon test between the first and last time points, without multiple-testing correction.',
    'Statistics run only when the design is confirmed as matched or repeated.'];
  chart('longitudinal_tab-macroclass_plot', {cat: 'longitudinal', kind: 'inferential',
    what: 'Per-participant trajectories of a main class over the designed time points (log2 of the summed class signal + 1).',
    read: 'Lines are coloured by whether the value went up or down from first to last time point; the p-value is in the subtitle.',
    caveats: longCaveats, tips: [{text: 'Choose the class and participant filter in the Longitudinal settings.', action: 'datasettings'}],
    src: ['R/modules/11_longitudinal_module.R:1685-1710,1915-1916,2933-3071', 'R/modules/utils_stats.R:805-830']});
  chart('longitudinal_tab-subclass_plot', {cat: 'longitudinal', kind: 'inferential',
    what: 'Per-participant trajectories of a lipid subclass over time (log2 of the summed subclass signal + 1).',
    read: 'Read it like the main-class time course.',
    caveats: longCaveats, tips: [],
    src: ['R/modules/11_longitudinal_module.R:1685-1710,2323']});
  chart('longitudinal_tab-index_plot', {cat: 'longitudinal', kind: 'inferential',
    what: 'Per-participant trajectories of a functional index (such as PE/PC or PUFA/SFA) over time.',
    read: 'Read it like the class time courses; the y axis is the index value.',
    caveats: longCaveats, tips: [],
    src: ['R/modules/11_longitudinal_module.R:1765-1818,1925-1927,2376,3062']});
  chart('longitudinal_tab-struct_plot', {cat: 'longitudinal', kind: 'inferential',
    what: 'Per-participant trajectories of an abundance-weighted structural measure (such as mean chain length or double bonds) for a subclass.',
    read: 'Read it like the class time courses; the y axis is the weighted index.',
    caveats: longCaveats, tips: [],
    src: ['R/modules/11_longitudinal_module.R:1860-1890,2424,3063-3064']});
  chart('longitudinal_tab-allmetrics_plot', {cat: 'longitudinal', kind: 'inferential',
    what: 'Per-participant trajectories for individual lipids; by default those with a paired p < 0.05 (raw) are shown.',
    read: 'Use it to scan which individual lipids change consistently within participants.',
    caveats: ['Selection by raw p-value across many lipids gives false positives; treat it as exploratory.', 'Values are the prepared values of each lipid.'],
    tips: [],
    src: ['R/modules/11_longitudinal_module.R:1899-1908,3387-3394,3572-3617']});

  // ---------------------------------------------------------------- Pathways
  chart('pathway_tab-pathwayPlot', {cat: 'pathways', kind: 'mixed',
    what: 'A fixed map of lipid classes joined by known biosynthetic links. Node colour shows a chosen metric for comparison vs reference (saturation z-score by default); node size shows mean class abundance.',
    read: 'A red outline means the class is higher in the comparison group and blue lower; grey dashed circles are classes not detected.',
    caveats: ['The map layout is a reference diagram, not something measured.', 'Significance markers are off by default; when on, they use per-class Welch tests (raw p by default, BH optional).'],
    tips: [{text: 'Choose the colour metric and significance markers in the Pathway settings.', action: 'datasettings'}],
    src: ['R/modules/13_pathway_module.R:5-49,131-169,715-1045,1300-1370,1832-1867']});
  chart('pathway_tab-pathwayVisNetwork', {cat: 'pathways', kind: 'mixed',
    what: 'An interactive version of the pathway map with arrows along the same biosynthetic links.',
    read: 'Hover a node for its p-value and BH-adjusted FDR. Node positions come from the physics layout and carry no meaning.',
    caveats: ['A frozen figure cannot be captured from this view; use the pathway map for a figure.'],
    tips: [],
    src: ['R/modules/13_pathway_module.R:1580-1781', 'www/team/js/canvas_catalog.js:75']});

  // -------------------------------------------------- Cellular organization
  chart('cellular_org_tab-stressPlot', {cat: 'cellular', kind: 'inferential',
    what: 'Seven per-sample composition indices (for example PE/PC and Cer/SM) by group, one panel per index.',
    read: 'Stars compare each group with the selected reference baseline.',
    caveats: ['Student t-test (equal variances) against the baseline, without multiple-testing correction.', 'These ratios do not measure organelle function or stress directly.'],
    tips: [{text: 'Select the reference baseline in the Cellular organization settings.', action: 'datasettings'}],
    src: ['R/modules/14_cellular_org_module.R:481-519,753-856', 'R/modules/utils_stats.R:746,828', 'R/frontends/team/modules-ui.R:2476']});
  chart('cellular_org_tab-cpiPlot', {cat: 'cellular', kind: 'inferential',
    what: 'A per-sample peroxidation index: a weighted sum of the share of lipids with 1 to 6 or more double bonds.',
    read: 'Higher values mean a larger share of highly unsaturated lipids. Stars compare groups with the baseline.',
    caveats: ['An exploratory composition proxy; it does not measure peroxidation or susceptibility.', 'Student t-test against the baseline, uncorrected.'],
    tips: [],
    src: ['R/modules/14_cellular_org_module.R:7-20,522-524,939-1043', 'R/modules/utils_stats.R:747', 'R/frontends/team/modules-ui.R:2502']});
  chart('cellular_org_tab-polarPlot', {cat: 'cellular', kind: 'descriptive',
    what: 'Each sample placed by its neutral-storage share (TG + DG + CE, x) and its membrane structural/ether share (y), with dashed lines at the dataset means.',
    read: 'Quadrants separate samples above or below average on each axis.',
    caveats: ['No statistics. Quadrant labels are a hypothesis aid only; they do not identify cell phenotypes without an independent assay.'],
    tips: [],
    src: ['R/modules/14_cellular_org_module.R:528-536,1128-1177', 'R/frontends/team/modules-ui.R:2519-2524']});

  // ---------------------------------------------------------- Cell comparisons
  chart('cell_lipid_plot', {cat: 'cellcomp', kind: 'descriptive',
    what: 'The prepared signal of the selected lipid feature in every measurement, in matrix order; the selected measurement is highlighted.',
    read: 'Use it to see where one measurement sits among the others.',
    caveats: ['Descriptive; values can include imputed estimates.'],
    tips: [],
    src: ['R/cell_show.R:18,81-82']});
  chart('cell_profile_plot', {cat: 'cellcomp', kind: 'descriptive',
    what: 'For one measurement, each lipid class\'s share of summed prepared signal (or log10 of the class sum).',
    read: 'Bars compare classes within that one measurement.',
    caveats: ['Shares of signal, not molecular proportions.'],
    tips: [],
    src: ['R/cell_show.R:2-6,19,85-86']});
  chart('cell_class_plot', {cat: 'cellcomp', kind: 'descriptive',
    what: 'For each class, the median per-sample class total in the reference and comparison groups.',
    read: 'Compare the paired bars per class. Clicking a bar selects that class.',
    caveats: ['Descriptive comparison; no test and no spatial inference.'],
    tips: [],
    src: ['R/cell_show.R:44,101-104']});
  chart('cell_comparison_plot', {cat: 'cellcomp', kind: 'descriptive',
    what: 'Prepared signal of the selected feature (or class total) in the reference and comparison groups.',
    read: 'With fewer than 8 values in a group you see boxes and points; otherwise violins with points, a box and a mean line.',
    caveats: ['No significance test is calculated here. Violin tails are smoothed and can extend below zero.'],
    tips: [],
    src: ['R/cell_show.R:44-61,88,95,105-106']});

  // ------------------------------------------------------------ Export studio
  chart('export_studio-studio_preview_plot', {cat: 'export', kind: 'navigation',
    what: 'A publication preview of a chosen figure (PCA, volcano, class abundance or heatmap) at a set physical size, font size and resolution.',
    read: 'It is set up in Export studio, not on the canvas.',
    caveats: ['It is blocked while preparation changes are pending. The volcano preview needs independent-sample inference.'],
    tips: [{text: 'Open Export studio to set width, height, font size and DPI.', action: 'datasettings'}],
    src: ['R/modules/99_export_studio_module.R:119-259,480-590,784-788']});

  // ---------------------------------------------------------- Category text
  var categories = {
    dashboard: {label: 'Dashboard', explain: 'Dashboard plots summarize the prepared data. They are descriptive unless a card says otherwise.',
      tips: [{text: 'Use Publication style for print-ready fonts.', action: 'publication'}]},
    qc: {label: 'Quality check', explain: 'Quality-check plots help you judge whether samples and measurements behave consistently. Treat flags as prompts to investigate.', tips: []},
    composition: {label: 'Composition', explain: 'Composition plots show how summed signal is split across lipid classes. Shares are of signal, not molar amounts.', tips: []},
    differential: {label: 'Differential analysis', explain: 'Differential plots combine an effect size with a test. Check the comparison direction, the test and the multiple-testing correction before reporting.', tips: []},
    heatmaps: {label: 'Heatmaps', explain: 'Heatmaps colour a matrix of values. Check what the colour encodes (z-score or raw value) and how rows are ordered.', tips: []},
    structure: {label: 'Structure', explain: 'Structural plots summarize chain length, unsaturation and class membership of lipids.', tips: []},
    groupcomp: {label: 'Group comparison', explain: 'Group comparison tests each group against a confirmed baseline per class.', tips: []},
    distributions: {label: 'Distributions & ratios', explain: 'These plots show distributions of class shares or functional ratios relative to a baseline.', tips: []},
    longitudinal: {label: 'Longitudinal', explain: 'Longitudinal plots follow participants across time points and need a confirmed matched or repeated design.', tips: []},
    pathways: {label: 'Pathways', explain: 'Pathway plots place lipid classes on a reference map of biosynthetic links; the map itself is not measured.', tips: []},
    cellular: {label: 'Cellular organization', explain: 'These indices summarize composition; they do not directly measure organelle function.', tips: []},
    cellcomp: {label: 'Cell comparisons', explain: 'Cell comparison plots support the 3D reference view. Bulk lipidomics does not locate lipids inside a cell.', tips: []},
    export: {label: 'Export studio', explain: 'Export studio prepares a single publication figure at a fixed physical size.', tips: []}
  };
  // Applies to any plot card; state-based checks add their own suggestions at runtime.
  var common = [
    {text: 'For the final figure, finish the plot and lay it out in the figure page, where you can add panel letters, text and shapes.', action: 'figure'},
    {text: 'Check that labels stay legible at the final print size; Publication style sets Arial text at size 12 on a white background.', action: 'publication'}
  ];

  // ------------------------------------------------------------- Step tips
  // Shown proactively, once each, unless the person chose Fewer tips.
  var tips = {
    'data-choice': [{id: 'data-choice-1', title: 'Choose how to begin', text: 'Open latest resumes your most recent checkpoint. To start fresh, choose a new abundance matrix; your source files stay unchanged.'}],
    'data-matrix': [{id: 'data-matrix-1', title: 'Add your abundance matrix', text: 'Upload an Excel or CSV matrix of lipid abundances, not raw instrument files. You can add sample metadata next.'}],
    'data-metadata': [{id: 'data-metadata-1', title: 'Add sample labels', text: 'Check that each sample has the right group. If the same participant appears more than once, record it: repeated participants change which tests are valid.'}],
    'review': [{id: 'review-1', title: 'Review your data', text: 'Move the detection slider to keep lipids measured in enough samples; the PCA updates. Click a point to inspect a sample before excluding it.'}],
    'canvas-empty': [{id: 'canvas-empty-1', title: 'Build a figure', text: 'Add plots from the library on the left. Each card stays live until you finish it.'}],
    'canvas': [{id: 'canvas-1', title: 'Arrange your plots', text: 'Select a card to style it, read its data, or ask me to explain it. Finished plots go into the figure page.'},
      {id: 'canvas-tabs-1', title: 'Organize with tabs', text: 'Use Canvas tabs to group many charts: rename a tab, and move or copy a card to another tab. The figure page picks charts from any tab.', requires: 'canvas-tabs'}],
    'card': [{id: 'card-1', title: 'Tip', text: 'I can explain how to read this chart and suggest improvements.'}],
    'figure': [{id: 'figure-1', title: 'Figure page', text: 'This is the page you export. Pick which finished charts go in, then add text, panel letters and shapes. Edit the plots themselves back on the canvas.'}],
    'save': [{id: 'save-1', title: 'Save a checkpoint', text: 'Name the checkpoint so you can find it later; it keeps the data, canvas, colours and finished figures.'}],
    'cell': [{id: 'cell-1', title: 'Cell view', text: 'The cell is an illustrative reference. Bulk lipidomics does not show where lipids are inside a cell.'}]
  };

  // ------------------------------------------------- Searchable help topics
  // `k` are search keywords; `go` names a stage or action shown as a button.
  var topics = [
    {id: 'step-data', title: 'Data step', k: 'data upload start begin matrix excel csv checkpoint resume open latest file import', go: 'data',
      text: 'In Data you open a saved checkpoint (Open latest, or choose one under All checkpoints) or upload a new abundance matrix (Excel or CSV) with optional sample metadata. Source files are never changed.'},
    {id: 'step-metadata', title: 'Sample labels and metadata', k: 'metadata labels groups sample names participant patient group1 group2 timepoint design', go: 'data',
      text: 'Sample metadata gives each sample its group and, when relevant, its participant and time point. Check groups before analysis: repeated participants or matched samples change which tests are valid.'},
    {id: 'step-review', title: 'Review step', k: 'review step slider pca prepared data summary inspect', go: 'review',
      text: 'Review shows the prepared data. The detection slider keeps lipids with at least that percentage of positive measurements; the data table and PCA update automatically. Click a PCA point to inspect a sample; exclusions need a reason and can be undone.'},
    {id: 'detection', title: 'Detection threshold', k: 'detection threshold minimum detection filter percent positive measured lipids kept removed', go: 'review',
      text: 'Detection counts positive measured values before imputation. A lipid is kept when it is detected in at least the chosen percentage of samples. A global threshold can remove signals present in only one group.'},
    {id: 'exclude', title: 'Excluding a sample', k: 'exclude remove drop outlier sample undo', go: 'review',
      text: 'Inspect the sample\'s metadata and QC plots first; a PCA position alone does not make it an outlier. To exclude it, select it, give a reason and confirm. Undo restores it, and the original data stay unchanged.'},
    {id: 'imputation', title: 'Missing values and imputation', k: 'missing imputation impute qrilc na zero left censored', go: 'review',
      text: 'QRILC estimates missing values assuming they are low (left-censored). Imputed values are estimates, not measurements. A high missing-value share makes results less certain.'},
    {id: 'normalization', title: 'Normalization', k: 'normalization normalize median pqn scale', go: 'review',
      text: 'Median normalization centres log2 values and returns linear abundances; PQN works on the linear scale. Neither is automatically best: check controls and distributions. Ask me to propose a change; nothing changes until you confirm.'},
    {id: 'step-canvas', title: 'Canvas step', k: 'canvas board arrange cards add plot library layout figure build', go: 'canvas',
      text: 'Canvas is your draft board. Add plots from the library, move and resize cards, and style them. A card stays live until you finish it; finished plots are what the figure page uses.'},
    {id: 'add-plot', title: 'Adding a plot', k: 'add plot library catalog search requires configuration unavailable queued add to check', go: 'canvas',
      text: 'Pick a plot in the library. Ready to add plots appear at once. Add to check adds a plot that has not drawn yet. Requires configuration means its analysis needs settings first: the card is added when the plot is ready. Unavailable plots explain why in their tooltip.'},
    {id: 'select-card', title: 'Selected card', k: 'select card inspector properties style data statistics tab', go: 'canvas',
      text: 'Selecting a card opens its properties: Data holds the analysis controls and downloads, Style the presentation, and Statistics the tests available for that plot.'},
    {id: 'finish', title: 'Finish and Edit', k: 'finish finished snapshot edit stale outdated archived regenerate', go: 'canvas',
      text: 'Finish freezes the plot as a snapshot for the figure page. If the analysis later changes, the snapshot is marked as needing review; choose Edit to regenerate the live plot, then finish it again.'},
    {id: 'figure-page', title: 'Draft canvas and figure page', k: 'figure page preview print pdf svg export compose draft panel letters layout page', go: 'figure',
      text: 'The canvas is the draft; the figure page is what you export. In the figure page you pick which finished charts (from any tab) go into the figure, arrange them on the page, and add text, panel letters and shapes. Then download PDF or SVG.'},
    {id: 'canvas-tabs', title: 'Canvas tabs', k: 'tab tabs organize rename move copy card another tab many charts', go: 'canvas',
      text: 'When your Canvas has tabs, use them to organize many charts: rename a tab, and move or copy a card to another tab. Tabs are for organizing the draft; the figure page can take charts from any tab.'},
    {id: 'panel-letters', title: 'Panel letters and text', k: 'panel letter label a b c text shape arrow annotation caption', go: 'figure',
      text: 'Add panel letters, text and shapes in the figure page. A publication layout can place panel labels for you; you can also add text objects and move them.'},
    {id: 'title-fonts', title: 'Titles and font size', k: 'title font size larger bigger small text label axis legend print', action: 'style:Title and fonts',
      text: 'Select the card, open Style, then Title and fonts to set the plot title and font sizes. Publication style applies Arial text at size 12 on a white background in one click; Undo reverts it.'},
    {id: 'palette', title: 'Colours and palettes', k: 'color colour palette colors same repeated legend inherited theme', action: 'style:Color palette',
      text: 'Style > Color palette applies a palette to a card\'s groups. A new card inherits the palette of the cards already on the canvas. Colours change presentation only.'},
    {id: 'export', title: 'Downloads and export size', k: 'download export png svg pdf csv size dpi resolution width height', go: 'figure',
      text: 'Each card\'s Data tab offers its plot and data downloads where the analysis provides them. For the final figure, set the page layout in the figure page and export PDF or SVG; Export studio sets an exact physical size, font size and DPI for single figures.'},
    {id: 'autosave', title: 'Autosave and checkpoints', k: 'save autosave checkpoint saved unsaved restore project library', go: 'data',
      text: 'With a private project, the workspace autosaves. Save & export creates named checkpoints that keep the data, canvas, colours and finished figures. Resume a checkpoint from Data.'},
    {id: 'pca', title: 'PCA', k: 'pca principal component pc1 pc2 scores loadings variance explained separation',
      text: 'PCA places samples by the main directions of variation in the prepared data. It is exploratory: separation is not significance. The dashboard PCA uses log2(x + 1), centred and scaled to unit variance by default.'},
    {id: 'volcano', title: 'Volcano plots', k: 'volcano fold change log2fc p value significance up down regulated',
      text: 'A volcano plot shows log2 fold change against -log10 p for each lipid. The test (limma moderated t or Wilcoxon), the p-value type (BH-adjusted by default) and the thresholds come from Differential analysis.'},
    {id: 'violin', title: 'Violin plots', k: 'violin distribution box dots shape',
      text: 'A violin shows the distribution of values in each group; dots are samples. The shape alone is not a test. On the dashboard, tests run on independent copies of the violin card (Statistics tab).'},
    {id: 'heatmap', title: 'Heatmaps and z-scores', k: 'heatmap z score zscore colour scale red blue rows columns cluster most variable',
      text: 'Dashboard heatmap cells are group means of per-sample z-scores (log10 values, whole cohort), so colours compare groups within a lipid. The most variable lipids are shown and clustered by default.'},
    {id: 'significant-only', title: 'Significant only', k: 'significant only filter show significant unavailable differential',
      text: 'Significant only reuses the Differential analysis result and its thresholds; it does not run a new test. It is unavailable when the design does not allow independent-sample inference, for example with repeated participants, synthetic samples or an unconfirmed design.'},
    {id: 'correction', title: 'Multiple-testing correction', k: 'bh fdr benjamini hochberg holm bonferroni adjusted raw unadjusted correction multiple testing',
      text: 'Testing many lipids gives false positives by chance. BH controls the false discovery rate; Holm and Bonferroni control the family-wise error. Some plots report raw (unadjusted) p-values; their explanation says so.'},
    {id: 'pseudoreplication', title: 'Pseudoreplication warning', k: 'pseudoreplication participant repeated paired independent samples warning same patient',
      text: 'The warning appears when the same participant contributes more than one sample. Tests that assume independent samples then overstate the evidence. Use a paired or repeated-measures analysis; the app withholds or flags those p-values.'},
    {id: 'paired', title: 'Paired designs', k: 'paired matched repeated measures before after time',
      text: 'Replicate numbers do not establish pairing. Matched or repeated samples need a paired or repeated-measures analysis; a design label does not change the test.'},
    {id: 'composition-share', title: 'Composition shares', k: 'composition share percent proportion molar class signal',
      text: 'Composition plots show shares of summed signal, not molar proportions. When only some classes are selected, shares are of the selected classes.'},
    {id: 'statistics-tab', title: 'Statistics on canvas', k: 'statistics test t-test wilcoxon welch effect size hedges cliff holm',
      text: 'Independent copies of the dashboard violin can add Welch t-tests or Wilcoxon rank-sum tests, with Holm (default), BH, Bonferroni or no correction, and optional Hedges\' g or Cliff\'s delta.'},
    {id: 'insight', title: 'Scientific insight', k: 'scientific insight literature pubmed abstract background',
      text: 'Scientific insight, available below some live plots, summarizes public literature about the lipid classes shown. It does not interpret your data.'},
    {id: 'cell-view', title: '3D cell view', k: '3d cell membrane nucleus organelle localization',
      text: 'The 3D cell is an illustrative reference. Bulk lipidomics does not locate lipids inside a cell, and prepared values may include imputed estimates.'},
    {id: 'companion-privacy', title: 'What the companion uses', k: 'ai openai privacy data sent model chat companion offline local',
      text: 'This help is local and reviewed: tips, chart explanations and answers come from text stored in the app, with no network call. Settings changes are only proposed; nothing changes until you confirm.'},
    // Common errors and messages
    {id: 'err-sig-unavailable', title: 'Message: Significant only is unavailable', k: 'error significant only unavailable statistics need confirmed independent design synthetic',
      text: 'Statistics need a confirmed independent study design, current prepared data and no synthetic samples. Review the design in Review, then try again.', go: 'review'},
    {id: 'err-requires-config', title: 'Message: Requires configuration', k: 'error requires configuration open analysis not visible yet',
      text: 'The plot\'s analysis needs settings (for example groups or a baseline) before it can draw. Use Add or Open analysis; the card is added once the plot is ready.'},
    {id: 'err-no-lipids', title: 'Message: No lipids passed significance filters', k: 'error no lipids passed significance filters empty',
      text: 'No lipid met the Differential analysis thresholds for this comparison. This is a result, not an error; check the comparison and thresholds rather than loosening them to obtain hits.'},
    {id: 'err-de-not-run', title: 'Message: Differential analysis not run', k: 'error differential analysis not run select comparison groups',
      text: 'Plots that reuse Differential analysis need its comparison groups to be set. Choose the reference and comparison groups in Differential analysis.'},
    {id: 'err-baseline', title: 'Message: Baseline required', k: 'error baseline required reference baseline selection',
      text: 'Group comparisons and ratio plots compare every group with a baseline. Choose and confirm the baseline group in the plot\'s settings.'},
    {id: 'err-stale', title: 'Message: needs review / outdated figure', k: 'error stale outdated needs review analysis changed export warning not up to date',
      text: 'A finished figure predates an analysis change. Choose Edit to regenerate it from current data, check it, and finish it again before exporting.'},
    {id: 'err-proposal', title: 'Message: proposal stale or expired', k: 'error proposal stale expired token invalid confirm',
      text: 'A setting proposal expires after five minutes or when the workspace changes. Nothing was changed; ask again for a fresh proposal.'},
    {id: 'err-fallback', title: 'Message: PCA uses the full matrix', k: 'error fallback full matrix targeted lipids could not support pca',
      text: 'The targeted lipid scope could not support PCA, so the plot uses the full prepared matrix. The banner records this; mention it if you use the plot.'},
    {id: 'err-disconnected', title: 'Message: Disconnected', k: 'error disconnected offline reconnect',
      text: 'The connection to the server was lost. Reload the page; with a private project your autosaved workspace can be resumed from Data.'},
    {id: 'err-updating', title: 'Message: Updating', k: 'error updating busy waiting slow preparation',
      text: 'The analysis is recomputing after a change. Wait for it to finish; plots and exports use the new data once it is done.'}
  ];

  // Where to look when the help has no answer.
  var fallback = 'I don\'t have reviewed guidance for that question. Try the topics below, the Help button for this step, or the About panel and methods note of the analysis that made the plot.';

  window.LipidomicCompanionGuidance = {version: '2026-11-02', charts: C, categories: categories, common: common, tips: tips, topics: topics, fallback: fallback};
})();
