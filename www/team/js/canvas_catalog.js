(function () {
  'use strict';
  // Stable IDs are the Shiny output IDs emitted by both Classic and Team modules.
  // Keep the human copy here so output IDs never leak into the user-facing palette.
  var groups = [
    {category:'Dashboard', icon:'grid', entries:[
      ['results_dashboard-plot_pca','Principal components','Compare sample structure across the prepared data.','Quality Check',null,'scatter'],
      ['results_dashboard-plot_violin','Feature distributions','Review the distribution of selected features.','Violin Plots',null,'violin'],
      ['results_dashboard-plot_dist','Signal distribution','Inspect the distribution of measured signal.','Composition',null,'density'],
      ['results_dashboard-plot_comp','Composition overview','Compare signal shares across groups.','Composition',null,'bars'],
      ['results_dashboard-plot_heat','Abundance heatmap','Compare lipid patterns across groups.','Heatmap',null,'heat']
    ]},
    {category:'Quality check', icon:'pulse', entries:[
      ['qc_pca_tab-boxplotAfterNorm','Normalized signal boxplots','Compare sample distributions after normalization.','Quality Check'],
      ['qc_pca_tab-outlierPlot','Outlier screening','Review samples flagged by outlier checks.','Quality Check'],
      ['qc_pca_tab-pca2dPlot','PCA scores · 2D','Explore sample separation in two dimensions.','Quality Check'],
      ['qc_pca_tab-pca2dVectorPlot','PCA scores · editable 2D','Enable Editable vector view in Quality Check; original plot and downloads remain available.','Quality Check'],
      ['qc_pca_tab-pca3dPlot','PCA scores · 3D','Rotate sample scores in three dimensions.','Quality Check'],
      ['qc_pca_tab-load2dPlot','PCA loadings · 2D','Inspect feature contributions to the PCA axes.','Quality Check'],
      ['qc_pca_tab-load2dVectorPlot','PCA loadings · editable 2D','Enable Editable vector view in Quality Check; unsupported label layouts retain the original view.','Quality Check'],
      ['qc_pca_tab-load3dPlot','PCA loadings · 3D','Explore feature contributions in three dimensions.','Quality Check'],
      ['qc_pca_tab-sampleCorrPlot','Sample correlation','Compare pairwise sample similarity.','Quality Check'],
      ['qc_pca_tab-bqcPlot','Batch quality check','Review batch-level quality metrics.','Quality Check'],
      ['qc_pca_tab-bqcDeviationPlot','Batch deviation','Inspect deviations across batches.','Quality Check'],
      ['qc_pca_tab-bqcAbundancePlot','Batch abundance','Compare abundance across batches.','Quality Check'],
      ['qc_pca_tab-outlierPcaPlot','Outlier PCA','PCA scores with samples marked by outlier flag and staged treatment.','Quality Check'],
      ['qc_pca_tab-guided_qc_plot','Guided quality check','Inspect the plot for the current guided QC step.','Quality Check']
    ]},
    {category:'Composition', icon:'bars', entries:[
      ['barchart-barPlotUnfiltered','Composition · unfiltered','Compare sample composition before differential filtering.','Composition'],
      ['barchart-barPlotFiltered','Composition · filtered','Compare composition for the active contrast.','Composition'],
      ['barchart-donutPlotUnfiltered','Composition share · unfiltered','Review the unfiltered composition as a share.','Composition'],
      ['barchart-donutPlotFiltered','Composition share · filtered','Review filtered composition as a share.','Composition']
    ]},
    {category:'Differential analysis', icon:'scatter', entries:[
      ['volcano_tab-volcanoPlot','Differential volcano','Explore fold change and statistical significance.','Volcano Plot'],
      ['lsea_tab-lseaPlot','Lipid set enrichment','Review enrichment across lipid sets.','LSEA'],
      ['fla_tab-plotVolcano','Functional ratio volcano','Inspect differential functional ratios.','Functional Ratios'],
      ['structural_tab-diffAcylPlot','Acyl chain remodeling','Review differential acyl-chain changes.','Main Class & Acyl Chain Proportions']
    ]},
    {category:'Heatmaps', icon:'heat', entries:[
      ['heatmap_barchart_tab-heatmapPlot','Average signal heatmap','Compare average signal across selected groups.','Heatmap'],
      ['heatmap_barchart_tab-heatmapSDPlot','Signal variability heatmap','Compare signal variability across groups.','Heatmap'],
      ['heatmap_barchart_tab-filteredHeatmapPlot','Filtered average heatmap','Review average signal for the active contrast.','Heatmap'],
      ['heatmap_barchart_tab-filteredHeatmapSDPlot','Filtered variability heatmap','Review signal variability for the active contrast.','Heatmap'],
      ['heatmap_barchart_tab-violin_plot_render','Selected-feature distributions','Review selected features on a log2 or linear prepared-abundance scale.','Heatmap']
    ]},
    {category:'Structure', icon:'molecule', entries:[
      ['structural_tab-summaryPlot','Structural remodeling shifts','Per class, the difference in chain length, double bonds or positions between comparison- and reference-enriched lipid species.','Structural'],
      ['structural_tab-speciesPlotPlot','Species structural features','For one class, a structural feature of each lipid species (each point is a species), split by enrichment direction.','Structural'],
      ['structural_tab-networkPlot','Correlation network','Classes, chain lengths, double bonds or species joined by strong abundance correlations across samples.','Structural'],
      ['structural_tab-propPlotPlot','Acyl chain proportions','Compare acyl-chain composition by class.','Main Class & Acyl Chain Proportions'],
      ['structural_grid_tab-heatmapPlot','Structural grid · selected class heatmap','Map differential lipid changes across carbon length and unsaturation.','Structural Grid'],
      ['structural_grid_tab-dotplotPlot','Structural grid · selected class dotplot','Compare differential lipid measurements across structural coordinates.','Structural Grid'],
      ['structural_grid_tab-mergedPlot','Structural grid · all classes','Compare structural changes across lipid classes.','Structural Grid'],
      ['structural_grid_tab-diffAllPlot','Structural grid · differential overview','Review the all-class differential structural overview.','Structural Grid']
    ]},
    {category:'Group comparison', icon:'violin', entries:[
      ['group_comparison_tab-comparisonPlot','Lipid class comparison','Compare lipid classes across conditions with local statistics.','Violin Plots']
    ]},
    {category:'Distributions & ratios', icon:'violin', entries:[
      ['logratio_tab-logratioPlot','Violin distributions','Compare distributions across selected groups.','Violin Plots'],
      ['fla_tab-logratioPlot','Functional ratio distributions','Compare functional ratios across groups.','Functional Ratios'],
      ['fla_tab-plotCircos','Functional correlation circos','Explore correlations among functional indices.','Functional Ratios']
    ]},
    {category:'Longitudinal', icon:'trend', entries:[
      ['longitudinal_tab-macroclass_plot','Time course · main class','Track main-class signal across time points.','Longitudinal'],
      ['longitudinal_tab-subclass_plot','Time course · subclass','Track subclass signal across time points.','Longitudinal'],
      ['longitudinal_tab-index_plot','Time course · functional index','Track functional indices over time.','Longitudinal'],
      ['longitudinal_tab-struct_plot','Time course · structure','Track structural measures over time.','Longitudinal'],
      ['longitudinal_tab-allmetrics_plot','Time course · all metrics','Compare available metrics over time.','Longitudinal']
    ]},
    {category:'Pathways', icon:'network', entries:[
      ['pathway_tab-pathwayPlot','Lipid pathway map','Explore the selected pathway comparison.','Lipid Pathways'],
      ['pathway_tab-pathwayVisNetwork','Interactive pathway network','Explore the live network. Frozen figure capture is not available for this output.','Lipid Pathways']
    ]},
    {category:'Cellular organization', icon:'cell', entries:[
      ['cellular_org_tab-stressPlot','Organelle stress proxies','Per-sample composition ratios (for example PE/PC, Cer/SM) by group, one panel per index. Compositional proxies.','Cellular Organization'],
      ['cellular_org_tab-cpiPlot','Peroxidation index (CPI)','Per-sample weighted share of polyunsaturated lipid signal by group, against a reference baseline. A compositional proxy.','Cellular Organization'],
      ['cellular_org_tab-polarPlot','Storage vs structural map','Each sample placed by its neutral-storage share (x) and membrane structural/ether share (y). Quadrants are a hypothesis aid.','Cellular Organization']
    ]},
    {category:'Cell comparisons', icon:'cell', entries:[
      ['cell_lipid_plot','Selected feature profile','Inspect measurements for the selected lipid feature.','step:6'],
      ['cell_profile_plot','Class profile','Compare the selected lipid class profile.','step:6'],
      ['cell_class_plot','Class totals · two cohorts','Median per-sample class total for the reference and comparison cohorts. Descriptive.','step:6'],
      ['cell_comparison_plot','Cohort comparison','Compare prepared feature values between cohorts.','step:6']
    ]},
    {category:'Export studio', icon:'page', entries:[
      ['export_studio-studio_preview_plot','Publication preview','Set publication size and download the current figure in Export studio.','input:guide_export_studio',null,null,{action:'Open export studio',status:'Dedicated export view'}]
    ]}
  ];
  // What a plot needs before it can draw, shown in the catalog tooltip, on the
  // card's status chip and in place of the generic "Awaiting" overlay.
  // de: a differential comparison (shared Reference/Comparison cohorts).
  // time: TimePoint values in the sample metadata.
  var requirements = {
    de: {status:'Needs a comparison', reason:'Choose Reference and Comparison cohorts (Data & settings, or Differential in the Data step) to draw this plot.'},
    time: {status:'Needs time points', reason:'Time courses need at least two TimePoint values in the sample metadata. Without them nothing can be drawn; with them, check the time-course settings in Data & settings.'}
  };
  var needsById = {
    'barchart-barPlotFiltered':'de','barchart-donutPlotFiltered':'de','volcano_tab-volcanoPlot':'de','lsea_tab-lseaPlot':'de',
    'structural_tab-diffAcylPlot':'de','heatmap_barchart_tab-filteredHeatmapPlot':'de','heatmap_barchart_tab-filteredHeatmapSDPlot':'de',
    'structural_tab-summaryPlot':'de','structural_tab-speciesPlotPlot':'de',
    'structural_grid_tab-heatmapPlot':'de','structural_grid_tab-dotplotPlot':'de','structural_grid_tab-mergedPlot':'de','structural_grid_tab-diffAllPlot':'de',
    'longitudinal_tab-macroclass_plot':'time','longitudinal_tab-subclass_plot':'time','longitudinal_tab-index_plot':'time','longitudinal_tab-struct_plot':'time','longitudinal_tab-allmetrics_plot':'time'
  };
  // A comparison-based plot can wait on different things, so its hint follows what
  // is actually missing (R: shared_data$inference_allowed, de_results, the module's
  // own req()s): first a confirmed study design, then the comparison, then what the
  // view needs from that comparison.
  var design = {status:'Needs a confirmed study design', reason:'No comparison can run until the study design is confirmed. In Review › Study design, set the experimental unit and the sample relationship; the default comparison then runs on its own.'};
  // Why the comparison cannot run (R: team_canvas_inference_gate). Only 'design' and
  // 'uncertain' send the user to the study design; the others name their own cause.
  var gates = {
    design: design,
    uncertain: {status:'Design is mixed or uncertain', reason:'The study design is confirmed as “Mixed or uncertain”, so no group comparison is run. If the samples are independent, change the sample relationship in Review › Study design.', button:'Study design'},
    paired: {status:'Not available for a paired design', reason:'The confirmed design is “Matched or repeated”. This view uses an independent (unpaired) comparison, which is not valid for paired samples, so it is not run. The design itself is fine; use the paired views (Longitudinal) instead.'},
    preparation: {status:'Data preparation not ready', reason:'The prepared data are missing or out of date with the current selection, so no comparison is run. Prepare the data again in Review; the comparison then runs on its own.', button:'Prepare data'},
    measured: {status:'Prepared samples are not all measured', reason:'The prepared data include samples that were not measured (for example averaged or substituted ones). Comparisons use measured samples only, so none is run. Check the samples and outlier treatment in Review.', button:'Review samples'}
  };
  var afterComparison = {
    'barchart-barPlotFiltered':{kind:'de-empty', when:/No lipids passed filters/, status:'No significant lipids', reason:'The comparison ran, but no lipid passes the current significance and |log2 fold change| thresholds, so the filtered view is empty. The thresholds are in the Differential settings of the Data step.'},
    'barchart-donutPlotFiltered':{kind:'de-empty', when:/No lipids passed filters/, status:'No significant lipids', reason:'The comparison ran, but no lipid passes the current significance and |log2 fold change| thresholds, so the filtered view is empty. The thresholds are in the Differential settings of the Data step.'},
    'structural_tab-summaryPlot':{kind:'run', button:'runAnalysis', action:'Run structural analysis', empty:/No structural shifts detected/, emptyStatus:'No structural shifts found', emptyReason:'The structural analysis ran for this card but found no shifts for the current comparison and thresholds (or too few species to compare). This is a result, not a missing setting.', status:'Needs structural analysis', reason:'Structural shifts are computed only on request. Choose “Run structural analysis” on this card (the module’s “Initiate Structural Analysis”, also in Data & settings). Team has no left sidebar.'},
    'structural_tab-speciesPlotPlot':{kind:'run', button:'runAnalysis', then:{button:'updateSpecies', action:'Load species plot', status:'Choose shifts, then load the plot', reason:'The structural analysis is done. In Data & settings, check the list Select Shifts to Visualize (the first four are preselected), then choose Load species plot on this card to draw the species.'}, action:'Run structural analysis', empty:/No structural shifts detected/, emptyStatus:'No structural shifts found', emptyReason:'The structural analysis ran for this card but found no shifts for the current comparison and thresholds (or too few species to compare). This is a result, not a missing setting.', status:'Needs structural analysis', reason:'Structural shifts are computed only on request. Choose “Run structural analysis” on this card (the module’s “Initiate Structural Analysis”, also in Data & settings). Team has no left sidebar.'},
    'structural_grid_tab-heatmapPlot':{kind:'grid-empty', status:'Nothing to place on the grid', reason:'The grid uses species of the selected lipid class whose chains are resolved (carbons and double bonds per chain). The current class and chain position give none. Choose another class or Position in Data & settings. There is no “Generate Grid Plots” button; the grid updates on its own.'},
    'structural_grid_tab-dotplotPlot':{kind:'grid-empty', status:'Nothing to place on the grid', reason:'The grid uses species of the selected lipid class whose chains are resolved (carbons and double bonds per chain). The current class and chain position give none. Choose another class or Position in Data & settings. There is no “Generate Grid Plots” button; the grid updates on its own.'}
  };
  function shinyValue(key) { var all = window.Shiny && window.Shiny.shinyapp && window.Shiny.shinyapp.$inputValues; if (!all) return undefined; if (key in all) return all[key]; var hit = Object.keys(all).find(function (k) { return k.indexOf(key + ':') === 0; }); return hit ? all[hit] : undefined; }
  function needs(id, plotId) {
    var kind = needsById[id]; if (!kind) return null;
    if (kind === 'time') {
      // The selectors exist only once the data have time points; the plots are then built
      // only after the module's "Generate Analysis" (its height reads longitudinal_design(),
      // an eventReactive on that button, 11_longitudinal_module.R:1341 and :3283).
      // Time points come from the metadata (R: team_canvas_timepoints_available), not from
      // the selectors: some exist only after a run (all metrics, significant-only).
      // A built selector also counts: the module accepts other time variables (Timepoint,
      // Group2; 11_longitudinal_module.R:795-829) that the metadata check does not read.
      var prefix = String(plotId || id).split('-')[0], all = window.Shiny && window.Shiny.shinyapp && window.Shiny.shinyapp.$inputValues || {};
      var tp = window.TeamCanvas && typeof window.TeamCanvas.timePointsReady === 'function' ? window.TeamCanvas.timePointsReady() : null;
      var hasSelection = tp === true || (Object.keys(all).some(function (k) { var v = all[k]; return k.indexOf(prefix + '-selected') === 0 && v != null && v !== '' && !(Array.isArray(v) && !v.length); }));
      if (hasSelection) return shinyValue(prefix + '-submit_longitudinal_btn') ? null : {kind:'run', button:'submit_longitudinal_btn', action:'Generate analysis', status:'Needs Generate Analysis', reason:'The time points are there. Time courses are built only on request: choose “Generate analysis” on this card (the module’s “Generate Analysis”, also in Data & settings).'};
      return Object.assign({kind:kind}, requirements[kind]);
    }
    if (kind !== 'de' || !window.TeamCanvas) return Object.assign({kind:kind}, requirements[kind]);
    var tc = window.TeamCanvas, designOk = typeof tc.designReady === 'function' ? tc.designReady() : null;
    var deOk = typeof tc.deReady === 'function' ? tc.deReady() : false;
    var gate = typeof tc.inferenceGate === 'function' ? tc.inferenceGate() : null;
    if (!deOk && gate && gate !== 'ok' && gates[gate]) return Object.assign({kind:'design', gate:gate}, gates[gate]);
    if (designOk === false && !deOk) return Object.assign({kind:'design', gate:'design'}, design);
    if (!deOk) return Object.assign({kind:kind}, requirements[kind]);
    var after = afterComparison[id]; if (!after) return null;
    // Only when the module itself reports that state (its validate() message on the output).
    if (after.when) { var el = plotId && document.getElementById(plotId); if (!el || !after.when.test(el.textContent || '')) return null; }
    if (after.kind === 'run') {
      var runs = shinyValue(String(plotId || id).split('-')[0] + '-' + after.button); if (!runs) return Object.assign({}, after);
      var drawn = plotId && document.getElementById(plotId);
      if (after.empty && drawn && after.empty.test(drawn.textContent || '')) return {kind:'de-empty', status:after.emptyStatus, reason:after.emptyReason};
      // A second manual step (Species): the analysis ran, but the plot is drawn only after "Load species plot".
      if (after.then && !shinyValue(String(plotId || id).split('-')[0] + '-' + after.then.button)) return Object.assign({kind:'run'}, after.then);
      return null;
    }
    return Object.assign({}, after);
  }
  var iconPaths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    pulse:'<path d="M3 12h4l3-8 4 16 3-8h4"/>', bars:'<path d="M4 20V11h4v9M10 20V4h4v16M16 20v-7h4v7"/>',
    scatter:'<circle cx="6" cy="17" r="2"/><circle cx="10" cy="11" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="18" cy="16" r="2"/>',
    heat:'<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><path d="M4 4h4v4H4zM10 10h4v4h-4zM16 16h4v4h-4z" fill="currentColor" stroke="none"/>',
    molecule:'<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.9 7.5-3.8M8.2 13.1l7.5 3.8"/>',
    violin:'<path d="M12 3c-4 3-4 5-1 9-3 4-3 6 1 9 4-3 4-5 1-9 3-4 3-6-1-9Z"/><path d="M5 12h14"/>',
    trend:'<path d="m3 17 5-5 4 3 8-9M14 6h6v6"/>', network:'<circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="m7 6.5 3.3 4M17 6.5l-3.3 4m-6.7 7 3.3-4m6.7 4-3.3-4"/>',
    cell:'<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r="1.4"/><circle cx="15" cy="14" r="2.3"/><path d="M4 12h2m12 0h2M12 4v2m0 12v2"/>',
    page:'<path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6m-6 4h6"/>',
    density:'<path d="M3 19h18M4 17c2 0 2-10 5-10s3 12 6 12 3-9 5-9"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (iconPaths[name] || iconPaths.grid) + '</g></svg>'; }
  function flatten() { return groups.reduce(function (all, group) { return all.concat(group.entries.map(function (e) { return {id:e[0],title:e[1],description:e[2],route:e[3],blocked:e[4] || null,routeOnly:e[6] || null,category:group.category,icon:e[5] || group.icon}; })); }, []); }
  function get(id) { return flatten().find(function (entry) { return entry.id === id; }) || null; }
  // Views the module builds only after a comparison has been run: until then the
  // plot does not exist, so a copy cannot be placed (it timed out without a card).
  var builtAfterComparison = {'barchart-donutPlotFiltered':1};
  function blocked(id) {
    var entry=get(id); if (entry && entry.blocked) return entry.blocked;
    if (builtAfterComparison[id] && window.TeamCanvas && typeof TeamCanvas.deReady === 'function' && !TeamCanvas.deReady()) return {status:'Needs a comparison', reason:'This view is built only after a differential comparison has been run. Run the comparison in the data step, then add it.'};
    return null;
  }
  var renderStates = new WeakMap();
  var shortCategories = {'Differential analysis':'Differential','Distributions & ratios':'Distributions','Cellular organization':'Cellular','Other discovered plots':'Other plots'};
  var openGroups = new Map();
  function render(args) {
    var list = args.list, filter = String(args.filter || '').toLowerCase().trim(), records = args.records, pending = args.pending || new Set(), known = flatten(), knownIds = new Set(known.map(function (e) { return e.id; }));
    var active = document.activeElement, hadActionFocus = !!(active && list.contains(active)), focusedId = hadActionFocus && (active.dataset.catalogActionId || active.closest('[data-catalog-id]') && active.closest('[data-catalog-id]').dataset.catalogId);
    var discovered = Array.from(records.values()).filter(function (r) { return !r.instance && !knownIds.has(r.el.id); }).map(function (r) { return {id:r.el.id,title:r.label,description:'Additional plot discovered in the open analysis.',route:null,category:'Other discovered plots',icon:'grid',unknown:true}; });
    var all = known.concat(discovered);
    function countFor(id) { return Array.from(records.values()).filter(function (record) { return record.node && (record.instance ? record.instance.source === id : record.el.id === id); }).length; }
    // Discovery may run continuously while other views update. Keep unchanged
    // actions mounted, while refreshing callbacks even when no repaint is needed.
    var renderState = renderStates.get(list) || {};
    renderState.args = args; renderStates.set(list, renderState);
    function routeOf(entry, r) { return entry.route ? (entry.route.indexOf('step:') === 0 ? {step:Number(entry.route.slice(5))} : entry.route.indexOf('input:') === 0 ? {input:entry.route.slice(6)} : {tool:entry.route}) : (r && args.routeFor ? args.routeFor(r.el) : null); }
    var fingerprint = JSON.stringify([filter, all.map(function (entry) {
      var r = records.get(entry.id), waiting = pending.has(entry.id), queued = waiting && pending.get ? pending.get(entry.id) : null;
      var rendered = !!(r && (r.el.querySelector('img[src],svg,canvas') || r.el.matches('.js-plotly-plot') && r.el.data && r.el.data.length));
      return [entry, countFor(entry.id), r && r.label || '', !!(r && r.el.isConnected), !!(r && r.node), !!(r && r.dynamic), !!(r && r.wrapper), rendered, waiting, queued && queued.label || '', routeOf(entry,r)];
    })]);
    if (renderState.fingerprint === fingerprint && list.childNodes.length) return;
    renderState.fingerprint = fingerprint;
    list.replaceChildren();
    groups.forEach(function (group) {
      var entries = all.filter(function (e) { return e.category === group.category; });
      appendGroup(group.category, group.icon, entries);
    });
    var extras = discovered.filter(function (e) { return e.category === 'Other discovered plots'; });
    if (extras.length) appendGroup('Other discovered plots','grid',extras);
    function appendGroup(category, groupIcon, entries) {
      var filtered = entries.filter(function (e) {
        if (!filter) return true;
        var r = records.get(e.id); return (e.title + ' ' + e.description + ' ' + (e.blocked && e.blocked.status || '') + ' ' + e.category + ' ' + e.id + ' ' + (r && r.label || '')).toLowerCase().includes(filter);
      });
      if (!filtered.length) return;
      var section = document.createElement('details'); section.className = 'tc-catalog-group';
      section.open = !!filter || (openGroups.has(category) ? openGroups.get(category) : category === 'Dashboard');
      section.addEventListener('toggle', function () { if (!filter) openGroups.set(category, section.open); });
      var heading = document.createElement('summary'); heading.title = category; var headingLabel = document.createElement('span'); headingLabel.textContent = shortCategories[category] || category; var headingCount = document.createElement('span'); headingCount.className = 'tc-catalog-group-count'; headingCount.textContent = String(filtered.length); headingCount.setAttribute('aria-label', filtered.length + ' plots'); heading.append(headingLabel, headingCount); section.appendChild(heading);
      var grid = document.createElement('div'); grid.className = 'tc-catalog-grid'; section.appendChild(grid);
      filtered.forEach(function (entry) {
        var r = records.get(entry.id), waiting = pending.has(entry.id), queued = waiting && pending.get ? pending.get(entry.id) : null, canAdd = !!r && r.el.isConnected && (!r.dynamic || !!r.wrapper);
        var route = routeOf(entry,r);
        var article = document.createElement('article'); article.className = 'tc-catalog-item' + (waiting ? ' is-queued' : ''); article.dataset.catalogId = entry.id; article.tabIndex = -1;
        var glyph = document.createElement('span'); glyph.className = 'tc-catalog-icon'; glyph.innerHTML = icon(entry.icon || groupIcon); article.appendChild(glyph);
        var copy = document.createElement('span'); copy.className = 'tc-catalog-copy';
        var title = document.createElement('strong'); title.textContent = entry.title; copy.appendChild(title);
        var detail = document.createElement('small'); detail.textContent = entry.description; copy.appendChild(detail);
        var state = document.createElement('span'); state.className = 'tc-catalog-state';
        var tooltipDetail = '';
        var button = document.createElement('button'); button.type = 'button'; button.className = 'tc-catalog-action'; button.dataset.catalogActionId = entry.id;
        var block = blocked(entry.id);
        if (block) { state.textContent = block.status; button.textContent = 'Unavailable'; tooltipDetail = block.reason; button.setAttribute('aria-disabled','true'); button.setAttribute('aria-label',block.status + ': ' + entry.title); }
        else if (entry.routeOnly && route) { state.textContent = entry.routeOnly.status; button.textContent = entry.routeOnly.action; button.setAttribute('aria-label',entry.routeOnly.action); button.addEventListener('click',function(){renderState.args.onRoute(route,'Opened Export studio. Choose a figure and publication size there.');}); }
        else if (args.repeatable && args.repeatable(entry.id)) {state.textContent='Independent copy';button.textContent='Add';button.setAttribute('aria-label','Add independent '+entry.title);button.addEventListener('click',function(){renderState.args.onAdd(entry.id);});}
        else if (r && r.node) { state.textContent = 'Added'; button.textContent = 'Added'; button.disabled = true; button.setAttribute('aria-label','Added: ' + entry.title); }
        else if (waiting) { state.textContent = 'Queued: ' + ((queued && queued.label) || entry.title); button.textContent = 'Cancel'; button.setAttribute('aria-label','Cancel queued add: ' + entry.title); tooltipDetail = 'Remove this queued add from the canvas.'; button.addEventListener('click', function () { renderState.args.onCancel(entry.id); }); }
        else if (canAdd) {
          var rendered = !!(r.el.querySelector('img[src],svg,canvas') || r.el.matches('.js-plotly-plot') && r.el.data && r.el.data.length);
          state.textContent = rendered ? 'Ready to add' : 'Add to check';
          button.textContent = 'Add';
          if (!rendered) tooltipDetail = 'The plot is not visible yet. Add it to the canvas to check whether its analysis has produced a figure.';
          button.addEventListener('click', function () { renderState.args.onAdd(entry.id); });
        }
        else if (route && r && r.dynamic && !r.wrapper) { state.textContent = 'Requires configuration'; button.textContent = 'Open analysis'; tooltipDetail = 'This plot shares a dynamic panel with other outputs and cannot be moved safely.'; button.addEventListener('click', function () { renderState.args.onRoute(route); }); }
        else if (route) { state.textContent = 'Requires configuration'; button.textContent = 'Add'; tooltipDetail = 'Open the analysis; the canvas will add the plot when its output is ready.'; button.addEventListener('click', function () { renderState.args.onQueue(entry.id, route); }); }
        else { state.textContent = 'Requires configuration'; button.textContent = 'Unavailable'; tooltipDetail = 'Open the analysis and wait for this plot to render before adding it.'; button.setAttribute('aria-disabled','true'); }
        var requirement = needsById[entry.id] && requirements[needsById[entry.id]]; if (requirement && !block && !entry.routeOnly) tooltipDetail = (tooltipDetail ? tooltipDetail + ' · ' : '') + requirement.reason;
        var actionLabel = button.getAttribute('aria-label') || (button.textContent + ' ' + entry.title);
        button.innerHTML = icon(entry.icon || groupIcon);
        // The visible tooltip and accessible description carry the same meaningful context.
        var tooltip = document.createElement('span'); tooltip.className = 'tc-catalog-tooltip'; tooltip.setAttribute('role', 'tooltip');
        tooltip.id = 'tc-tip-' + entry.id.replace(/[^a-zA-Z0-9_-]/g, '-');
        var count = countFor(entry.id);
        tooltip.textContent = entry.title + ' · ' + category + ' — ' + entry.description + ' ' + state.textContent + ' · ' + count + ' on canvas' + (tooltipDetail ? ' · ' + tooltipDetail : '');
        button.setAttribute('aria-label', actionLabel); button.setAttribute('aria-describedby', tooltip.id);
        function showTip() { var rect = button.getBoundingClientRect(); tooltip.style.left = Math.min(rect.right + 10, Math.max(8, window.innerWidth - 250)) + 'px'; tooltip.style.top = Math.min(rect.top, Math.max(8, window.innerHeight - 110)) + 'px'; tooltip.classList.add('is-visible'); }
        function hideTip() { tooltip.classList.remove('is-visible'); }
        button.addEventListener('mouseenter', showTip); button.addEventListener('mouseleave', hideTip); button.addEventListener('focus', showTip); button.addEventListener('blur', hideTip);
        button.addEventListener('keydown', function (event) { if (event.key === 'Escape') { hideTip(); event.stopPropagation(); } });
        button.addEventListener('click', function (event) { if (button.getAttribute('aria-disabled') === 'true') { event.preventDefault(); event.stopImmediatePropagation(); } });
        article.append(copy, state, button, tooltip); grid.appendChild(article);
      });
      list.appendChild(section);
    }
    if (!list.children.length) { var empty = document.createElement('p'); empty.className = 'tc-catalog-empty'; empty.textContent = 'No plots match this search. Clear the search to browse every available plot.'; list.appendChild(empty); }
    if (hadActionFocus && focusedId) {
      var card = Array.from(list.querySelectorAll('[data-catalog-id]')).find(function (el) { return el.dataset.catalogId === focusedId; });
      if (card) { var action = card.querySelector('button:not(:disabled)'); (action || card).focus(); }
    }
  }
  window.TeamCanvasCatalog = {list:flatten(), get:get, blocked:blocked, needs:needs, render:render};
})();
