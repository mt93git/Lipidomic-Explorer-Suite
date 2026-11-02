# Lipid heatmap "Show: All lipids / Significant only".
# 1. The real shared hub (Team policy) prepares the synthetic browser fixture and
#    runs its own Differential analysis; significant_lipids() is captured.
# 2. The dashboard heatmap is driven by exactly those captured values:
#    - All lipids (and an older checkpoint without the input) is unchanged;
#    - Significant only shows exactly the lipids passing the app's criterion;
#    - the option is unavailable, with the app's own reason, when inference is
#      blocked by the design policy or by repeated participant IDs.
# Optional: LIPIDOMIC_BASELINE_DASHBOARD=<path to a previous R/results_dashboard.R>
# also proves All lipids renders byte-identically to that version.
suppressPackageStartupMessages({
  source('R/global.R'); source('R/sample_metadata_import.R'); source('R/frontends/team/server.R')
  source('R/frontends/team/violin_statistics.R'); source('R/results_dashboard.R')
})
checks <- character()
check <- function(label, condition) { if (!isTRUE(condition)) stop(paste('FAIL:', label), call. = FALSE); checks <<- c(checks, label) }

fixture <- utils::read.csv('tests/browser/ci/fixtures/abundance.csv', check.names = FALSE)
ids <- names(fixture)[-1]
path <- tempfile(fileext = '.csv'); utils::write.csv(fixture, path, row.names = FALSE)
md <- data.frame(SampleID = ids, Condition = rep(c('Control', 'Treatment'), each = 4), Tissue = 'Reference tissue',
                 Patient = sprintf('P%02d', 1:8), stringsAsFactors = FALSE)
base <- list(useImputation = FALSE, normalizationMethod = 'none', imputeZerosPerFile = FALSE, imputeRemainingNAtoZero = TRUE,
             minDetectionPct = 0, dropNonDetected = FALSE, detectionScope = 'global', outlierTreatments = list(),
             outlier_trigger = 0, imputationSeed = 42L)

# ---- 1. The app's own Differential analysis on the fixture -------------------
captured <- list()
approval <- shiny::reactiveVal('independent')
shiny::testServer(shared_data_server, args = list(external_settings = shiny::reactive(base), preparation_policy = 'team',
    design_check = function() TRUE, inference_check = function(paired) identical(approval(), 'independent') && !paired), {
  session$setInputs(files = data.frame(name = 'synthetic.csv', size = file.info(path)$size, type = 'text/csv', datapath = path),
                    selectedColumns = ids, useAveragedSubstitution = FALSE)
  session$flushReact(); api <- session$returned
  api$set_external_sample_metadata(stage_metadata_v01(md, ids, c(Group1 = 'Condition', Group2 = 'Tissue', PatientNumber = 'Patient')), TRUE)
  session$flushReact(); session$setInputs(runAnalysis = 1); session$flushReact()
  check('fixture prepares under the Team policy', preparation$state()$status == 'ready')
  # The fixture checkpoint's own DE settings (state.json): auto method, adjusted p <= 0.05, |log2FC| >= 1.
  for (fc in c(1, 0.5)) {
    session$setInputs(deReferenceGroups = 'Control', deComparisonGroups = 'Treatment', deOrientGroup1 = TRUE, deOrientGroup2 = FALSE,
                      deMethod = 'auto', pValueType = 'adjusted', pFilterThreshold = 0.05, log2fcThreshold = fc)
    session$flushReact()
    view <- team_missingness_data_adapter(api)
    captured[[as.character(fc)]] <<- list(data = view$data_processed(), metadata = api$all_metadata(), de_results = api$de_results(),
      significant = api$significant_lipids(), de_settings = api$de_settings(), contrast = api$de_contrast_info(), method = api$actual_de_method())
  }
  approval('uncertain'); session$flushReact()
  check('blocked design leaves the app with no significance result', !api$inference_allowed(FALSE) && is.null(api$significant_lipids()))
})
for (fc in names(captured)) {
  x <- captured[[fc]]; r <- x$de_results
  # Independent statement of significantLipids (R/modules/1_shared_data_module.R): BH-adjusted p <= 0.05 and |log2FC| >= threshold.
  expected <- r$Lipid_Name[r$p_adj_bh <= 0.05 & abs(r$log2FC) >= as.numeric(fc)]
  check(paste('captured significant_lipids matches its criterion at |log2FC| >=', fc), setequal(x$significant, expected))
  check(paste('DE used the limma route at |log2FC| >=', fc), identical(x$method, 'auto_limma'))
}
check('fixture defaults (|log2FC| >= 1) pass no lipid', length(captured[['1']]$significant) == 0L)
check('|log2FC| >= 0.5 passes five lipids', setequal(captured[['0.5']]$significant, c('PC(34:1)', 'PC(36:2)', 'PE(34:1)', 'PE(36:2)', 'SM(d18:1/16:0)')))

# ---- 2. The dashboard heatmap driven by those values -------------------------
value <- function(x) { force(x); function(...) x }
hub_for <- function(x, allowed = TRUE, metadata = x$metadata) list(
  data_processed = value(x$data), all_metadata = value(metadata), preparation_audit = value(list()), preparation_dirty = value(FALSE),
  color_maps = value(list()), class_color_map = value(NULL), team_compact_distribution = TRUE,
  inference_allowed = function(paired = FALSE) allowed && !paired,
  de_results = value(if (allowed) x$de_results), significant_lipids = value(if (allowed) x$significant),
  de_settings = value(x$de_settings), de_contrast_info = value(x$contrast), actual_de_method = value(x$method))
strip <- function(json) { p <- jsonlite::fromJSON(json, simplifyVector = FALSE); p$x$cur_data <- NULL; p$x$visdat <- NULL; p$x$attrs <- NULL
  jsonlite::toJSON(p, auto_unbox = TRUE, digits = NA, null = 'null') }
render <- function(server_fn, hub, inputs) {
  out <- NULL
  shiny::testServer(function(input, output, session) { dashboard <- server_fn(input, output, session, hub) }, {
    do.call(session$setInputs, inputs); session$flushReact()
    csv <- utils::read.csv(output$dl_heat, check.names = FALSE)
    out <<- list(plot = tryCatch(strip(output$plot_heat), error = function(e) paste('ERROR:', conditionMessage(e))),
      note = tryCatch(as.character(output$note_heat$html), error = function(e) paste('ERROR:', conditionMessage(e))),
      summary = output$heat_selection_summary, csv = csv, h = dashboard$heatmap(),
      status = tryCatch(as.character(output$heat_significance_status$html), error = function(e) ''),
      allowed = if (is.function(dashboard$heatmap_significance_allowed)) dashboard$heatmap_significance_allowed())
  })
  out
}
common <- list(color_by = 'Group1', top_n = 30L, heat_group_selection = '__ALL__', heat_lipid_selection = '__ALL__')
x <- captured[['0.5']]

# All lipids: identical to the view without the input (an older checkpoint).
legacy <- render(results_dashboard_module_server, hub_for(x), common)
all <- render(results_dashboard_module_server, hub_for(x), c(common, heat_significance = 'all'))
check('All lipids plot equals the pre-feature view', identical(all$plot, legacy$plot) && !grepl('^ERROR', all$plot))
check('All lipids note, summary and CSV equal the pre-feature view',
  identical(all$note, legacy$note) && identical(all$summary, legacy$summary) && identical(all$csv, legacy$csv) &&
  !any(c('DE_significant', 'Significance_filter') %in% names(all$csv)))
check('All lipids shows the existing default selection (every eligible fixture lipid; LPC(16:0) has a zero)',
  setequal(all$h$lipids_visible, setdiff(fixture$Lipid_Name, 'LPC(16:0)')) && length(all$h$lipids_visible) == 11L)
baseline <- Sys.getenv('LIPIDOMIC_BASELINE_DASHBOARD')
if (nzchar(baseline)) {
  old <- new.env(parent = globalenv()); sys.source(baseline, envir = old)
  before <- render(old$results_dashboard_module_server, hub_for(x), common)
  check('All lipids is byte-identical to the baseline dashboard (plot JSON, note, summary, CSV)',
    identical(all$plot, before$plot) && identical(all$note, before$note) && identical(all$summary, before$summary) && identical(all$csv, before$csv))
  # A different lipid selection too, so the comparison is not only the default.
  sel <- modifyList(common, list(heat_lipid_selection = '["PC(34:1)","TG(52:2)","LPC(16:0)"]', heat_group_selection = '["Treatment"]'))
  check('All lipids with a custom selection is byte-identical to the baseline',
    identical(render(results_dashboard_module_server, hub_for(x), c(sel, heat_significance = 'all'))$plot, render(old$results_dashboard_module_server, hub_for(x), sel)$plot))
}

# Significant only: exactly the lipids passing the criterion, in the heatmap's row order.
sig <- render(results_dashboard_module_server, hub_for(x), c(common, heat_significance = 'significant'))
shown <- sig$h$lipids_visible
check('Significant only shows exactly the significant lipids', setequal(shown, x$significant) && length(shown) == length(x$significant))
check('Significant only keeps heatmap row order and full-cohort values',
  identical(shown, all$h$lipids[all$h$lipids %in% x$significant]) && identical(sig$h$full_z, all$h$full_z) && identical(sig$h$lim, all$h$lim))
plotted <- jsonlite::fromJSON(sig$plot, simplifyVector = FALSE)
check('plotted heatmap lipid IDs are the significant set', setequal(unlist(plotted$x$layout$meta$teamHeatmap$lipidIds), x$significant))
check('CSV marks exactly the significant lipids visible and states the criterion',
  setequal(unique(sig$csv$Lipid_Name[sig$csv$Visible]), x$significant) &&
  all(sig$csv$DE_significant == (sig$csv$Lipid_Name %in% x$significant)) &&
  all(grepl('Treatment vs Control; Benjamini-Hochberg adjusted p ≤ 0.05 and |log2FC| ≥ 0.5 (limma moderated t-test', sig$csv$Significance_filter, fixed = TRUE)))
check('status under Show states the count and criterion', grepl('Showing 5 significant lipids: Treatment vs Control;', sig$status, fixed = TRUE))
check('All lipids status is empty', !grepl('Showing|unavailable', all$status))
check('note states the count and criterion', grepl('Significant only: 5 lipids pass', sig$note, fixed = TRUE) && grepl('|log2FC| ≥ 0.5', sig$note, fixed = TRUE))
check('summary counts the shown lipids', identical(sig$summary, 'Groups & lipids · 5 selected'))
check('the option is enabled when inference is allowed', isTRUE(sig$allowed$allowed) && grepl('data-allowed="true"', sig$status, fixed = TRUE))
# The lipid picker applies to All lipids only; the group picker still applies.
narrowed <- render(results_dashboard_module_server, hub_for(x), modifyList(c(common, heat_significance = 'significant'),
  list(heat_lipid_selection = '["TG(52:2)"]', heat_group_selection = '["Treatment"]')))
check('group selection still applies under Significant only', setequal(narrowed$h$lipids_visible, x$significant) && identical(colnames(narrowed$h$z), 'Treatment'))

# Fixture defaults: nothing passes, so the plot says so instead of drawing all lipids.
none <- render(results_dashboard_module_server, hub_for(captured[['1']]), c(common, heat_significance = 'significant'))
check('no significant lipid: empty view with the criterion, never all lipids',
  length(none$h$lipids_visible) == 0L && grepl('No lipid in this heatmap passes the Differential analysis criterion', none$plot, fixed = TRUE) &&
  grepl('|log2FC| ≥ 1', none$plot, fixed = TRUE) && !any(none$csv$Visible))
check('no significant lipid: the status under Show explains it', grepl('No lipid in this heatmap passes', none$status, fixed = TRUE))

# Inference blocked by the study design: option disabled with the app's reason.
blocked <- render(results_dashboard_module_server, hub_for(x, allowed = FALSE), c(common, heat_significance = 'significant'))
design_reason <- team_violin_stats_design(list(inference_allowed = function(paired = FALSE) FALSE), NULL)$reason
check('blocked design disables the option with the existing reason',
  !isTRUE(blocked$allowed$allowed) && identical(blocked$allowed$reason, design_reason) &&
  grepl('data-allowed="false"', blocked$status, fixed = TRUE) && grepl(design_reason, blocked$status, fixed = TRUE))
check('a saved Significant only view under a blocked design shows the reason, not all lipids',
  length(blocked$h$lipids_visible) == 0L && grepl('Significant only is unavailable', blocked$plot, fixed = TRUE) && !any(blocked$csv$Visible))
blocked_all <- render(results_dashboard_module_server, hub_for(x, allowed = FALSE), c(common, heat_significance = 'all'))
check('All lipids stays available and unchanged when inference is blocked', identical(blocked_all$plot, all$plot))
guard <- rd_heat_significance_guard(list(inference_allowed = function(paired = FALSE) FALSE))
check('guard reuses the design-specific wording (uncertain, paired)',
  identical(guard('uncertain')$reason, team_violin_stats_design(list(), 'uncertain')$reason) &&
  identical(guard('paired')$reason, team_violin_stats_design(list(), 'paired')$reason))

# Pseudoreplication: two samples from one participant block the option, even
# though the design policy and the DE result would allow it.
repeated <- x$metadata; repeated$PatientNumber[repeated$FullName == 'S02'] <- repeated$PatientNumber[repeated$FullName == 'S01']
pseudo <- render(results_dashboard_module_server, hub_for(x, metadata = repeated), c(common, heat_significance = 'significant'))
check('repeated participant IDs disable Significant only with the pseudoreplication reason',
  !isTRUE(pseudo$allowed$allowed) && grepl('pseudoreplication', pseudo$allowed$reason, fixed = TRUE) &&
  grepl('data-allowed="false"', pseudo$status, fixed = TRUE) && length(pseudo$h$lipids_visible) == 0L &&
  grepl('pseudoreplication', pseudo$plot, fixed = TRUE))

# Checkpoint round trip: the input is a declared, restorable dashboard copy input.
allowed_ids <- team_plot_instance_input_ids('results_dashboard-plot_heat')
check('heat_significance is a restorable canvas-copy input', 'heat_significance' %in% allowed_ids)
for (v in c('all', 'significant')) {
  ok <- team_plot_instance_validate(list(id = 'tcinstance_sig1', source = 'results_dashboard-plot_heat', inputs = list(heat_significance = v)))
  check(paste('checkpoint value', v, 'validates'), identical(ok$inputs$heat_significance, v))
}
cat(sprintf('PASS: %d heatmap significance checks\n', length(checks)))
cat(paste0(' - ', checks, collapse = '\n'), '\n')
