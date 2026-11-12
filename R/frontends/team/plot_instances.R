# Team canvas copies are real scientific modules with a private input namespace.
# The shared prepared matrix remains authoritative; only view controls are local.
team_plot_instance_families <- list(
  results_dashboard = list(ui = 'results_dashboard_ui', server = 'results_dashboard_module_server', outputs = c('plot_pca','plot_violin','plot_dist','plot_comp','plot_heat')),
  qc_pca_tab = list(ui='qc_boxplot_ui',server='qc_boxplot_server',colors=TRUE,outputs=c('boxplotAfterNorm','outlierPlot','pca2dPlot','pca2dVectorPlot','pca3dPlot','load2dPlot','load2dVectorPlot','load3dPlot','sampleCorrPlot','bqcPlot','bqcDeviationPlot','bqcAbundancePlot','outlierPcaPlot','guided_qc_plot')),
  barchart = list(ui='barchart_ui',server='barchart_server',colors=TRUE,outputs=c('barPlotUnfiltered','barPlotFiltered','donutPlotUnfiltered','donutPlotFiltered')),
  heatmap_barchart_tab = list(ui='heatmap_ui',server='heatmap_server',outputs=c('heatmapPlot','heatmapSDPlot','filteredHeatmapPlot','filteredHeatmapSDPlot','violin_plot_render')),
  volcano_tab=list(ui='volcano_ui',server='volcano_server',outputs='volcanoPlot'),
  lsea_tab=list(ui='lsea_ui',server='lsea_server',outputs='lseaPlot'),
  structural_tab=list(ui='structural_ui',server='structural_server',colors=TRUE,outputs=c('summaryPlot','speciesPlotPlot','networkPlot','moduleTraitPlot','propPlotPlot','diffAcylPlot')),
  structural_grid_tab=list(ui='structural_grid_ui',server='structural_grid_server',outputs=c('heatmapPlot','dotplotPlot','mergedPlot','diffAllPlot')),
  logratio_tab=list(ui='logratio_ui',server='logratio_server',colors=TRUE,outputs='logratioPlot'),
  group_comparison_tab=list(ui='team_group_comparison_ui',server='team_group_comparison_server',colors=TRUE,outputs='comparisonPlot'),
  fla_tab=list(ui='fla_ui',server='fla_server',colors=TRUE,outputs=c('logratioPlot','plotVolcano','plotCircos')),
  longitudinal_tab=list(ui='longitudinal_ui',server='longitudinal_server',outputs=c('macroclass_plot','subclass_plot','index_plot','struct_plot','allmetrics_plot')),
  pathway_tab=list(ui='pathway_ui',server='pathway_server',outputs=c('pathwayPlot','pathwayVisNetwork')),
  cellular_org_tab=list(ui='cellular_org_ui',server='cellular_org_server',colors=TRUE,outputs=c('stressPlot','cpiPlot','polarPlot'))
)
# Cell plots are root-level views, so wrap the original computation and render
# expressions in a Shiny module. The adapter owns selectors only; the scientific
# calculations and CSV handlers remain sourced from cell_show_server.
team_cell_instance_outputs <- c('cell_lipid_plot','cell_profile_plot','cell_class_plot','cell_comparison_plot')
team_cell_instance_ui <- function(id) {
  ns <- shiny::NS(id)
  shiny::tags$div(class='tc-cell-instance',
    shiny::selectInput(ns('cell_group_column'),'Metadata grouping',choices=character(),selectize=FALSE),
    shiny::selectInput(ns('cell_reference_group'),'Reference',choices=character(),selectize=FALSE),
    shiny::selectInput(ns('cell_comparison_group'),'Comparison',choices=character(),selectize=FALSE),
    shiny::selectInput(ns('cell_class'),'Lipid class',choices=character()),
    shiny::radioButtons(ns('cell_explore_level'),'Plot',c('Class total'='class','Feature'='feature'),selected='feature',inline=TRUE),
    shiny::selectInput(ns('cell_lipid'),'Feature within class',choices=character()),
    shiny::selectInput(ns('cell_sample'),'Measurement',choices=character(),selectize=FALSE),
    shiny::radioButtons(ns('cell_profile_view'),'Profile scale',c('Signal share (%)'='share','Log10 class signal'='log'),inline=TRUE),
    lapply(team_cell_instance_outputs,function(key) plotly::plotlyOutput(ns(key),height='420px')),
    lapply(c('cell_lipid_csv','cell_profile_csv','cell_class_profile_csv','cell_comparison_csv'),function(key) shiny::downloadButton(ns(key),'Download CSV'))
  )
}
team_cell_instance_server <- function(id,shared_data) {
  shiny::moduleServer(id,function(input,output,session) {
    # Select assignments by their exact left-hand sides; unexpected upstream
    # changes fail loudly instead of silently substituting a different formula.
    wanted <- c('d','metadata','group_frame','display_group','feature_values','profile','values','selected_values','class_comparison',paste0('output$',c(team_cell_instance_outputs,'cell_lipid_csv','cell_profile_csv','cell_class_profile_csv','cell_comparison_csv')))
    expressions <- as.list(body(cell_show_server))[-1L]
    assignments <- Filter(function(x) is.call(x) && identical(x[[1L]],as.name('<-')),expressions)
    names(assignments) <- vapply(assignments,function(x)paste(deparse(x[[2L]]),collapse=''),character(1))
    if(any(!wanted %in% names(assignments)) || anyDuplicated(names(assignments)[names(assignments) %in% wanted])) stop('Cell Canvas adapter no longer matches the cell server.',call.=FALSE)
    # Plotly event sources must be private too: a cell click in Canvas must
    # never update the original view or another independent copy.
    privatize_sources <- function(x) {
      if (is.character(x) && length(x)==1L && x %in% c('cell_class_profile','cell_comparison_points')) return(session$ns(x))
      if (is.call(x)) for(i in seq_along(x)) if (!is.null(x[[i]])) x[[i]] <- privatize_sources(x[[i]])
      x
    }
    for(key in wanted) eval(privatize_sources(assignments[[key]]),envir=environment())
    shiny::observeEvent(lipidomic_plotly_event('plotly_click',source=session$ns('cell_class_profile'),session=session),{
      hit<-lipidomic_plotly_event('plotly_click',source=session$ns('cell_class_profile'),session=session)
      if(!is.null(hit$y) && as.character(hit$y) %in% unique(rd_class(as.character(d()[[1L]])))) shiny::updateSelectInput(session,'cell_class',selected=as.character(hit$y))
    },ignoreInit=TRUE)
    shiny::observeEvent(lipidomic_plotly_event('plotly_click',source=session$ns('cell_comparison_points'),session=session),{
      shown<-selected_values();hit<-lipidomic_plotly_event('plotly_click',source=session$ns('cell_comparison_points'),session=session)
      sample<-cell_clicked_sample(hit,shown,names(d())[-1L]);if(!is.na(sample)) shiny::updateSelectInput(session,'cell_sample',selected=sample)
    },ignoreInit=TRUE)
    keep <- function(current,choices,default=1L) if(length(current)==1L && !is.na(current) && current %in% choices) current else if(length(choices)>=default) choices[[default]] else character()
    shiny::observeEvent(d(),{
      x<-d(); samples<-if(is.null(x))character() else names(x)[-1L]
      shiny::updateSelectInput(session,'cell_sample',choices=samples,selected=keep(shiny::isolate(input$cell_sample),samples))
    },ignoreNULL=FALSE)
    shiny::observeEvent(list(d(),metadata()),{
      x<-d();m<-metadata();g<-cell_metadata_groups(x,m)
      choices<-if(is.null(m))character() else names(m)[vapply(m,function(z)is.atomic(z)&&length(unique(stats::na.omit(z)))>=2&&length(unique(stats::na.omit(z)))<sum(!is.na(z)),logical(1))]
      choices<-setdiff(choices,c('FullName','Sample','Measurement','DisplayLabel','Replicate','ReplicateID','DonorID'))
      defaults<-unique(stats::na.omit(g$Group_column)); default<-if(length(defaults))match(defaults[[1L]],choices) else 1L; if(is.na(default))default<-1L
      shiny::updateSelectInput(session,'cell_group_column',choices=choices,selected=keep(shiny::isolate(input$cell_group_column),choices,default))
      classes<-if(is.null(x)||!nrow(x))character() else sort(unique(rd_class(as.character(x[[1L]]))))
      shiny::updateSelectInput(session,'cell_class',choices=classes,selected=keep(shiny::isolate(input$cell_class),classes))
    },ignoreNULL=FALSE)
    shiny::observeEvent(group_frame(),{
      groups<-sort(unique(stats::na.omit(group_frame()$Group)))
      shiny::updateSelectInput(session,'cell_reference_group',choices=stats::setNames(groups,display_group(groups)),selected=keep(shiny::isolate(input$cell_reference_group),groups))
      shiny::updateSelectInput(session,'cell_comparison_group',choices=stats::setNames(groups,display_group(groups)),selected=keep(shiny::isolate(input$cell_comparison_group),groups,if(length(groups)>1L)2L else 1L))
    },ignoreNULL=FALSE)
    shiny::observeEvent(list(d(),input$cell_class),{
      x<-d(); shiny::req(x); labels<-as.character(x[[1L]]); unique_label<-!(duplicated(labels)|duplicated(labels,fromLast=TRUE))
      choices<-labels[rd_class(labels)==input$cell_class & unique_label]
      shiny::updateSelectInput(session,'cell_lipid',choices=choices,selected=keep(shiny::isolate(input$cell_lipid),choices))
    },ignoreNULL=FALSE)
    list(feature_values=feature_values,profile=profile,selected_values=selected_values,class_comparison=class_comparison)
  })
}
team_plot_instance_source <- function(source) {
  if (!is.character(source) || length(source)!=1L || is.na(source)) stop('Invalid plot source.',call.=FALSE)
  if (source %in% team_cell_instance_outputs) return(list(family='team_cell',output=source,spec=list(ui='team_cell_instance_ui',server='team_cell_instance_server')))
  for (family in names(team_plot_instance_families)) {
    spec <- team_plot_instance_families[[family]]
    if (source %in% paste0(family,'-',spec$outputs)) return(list(family=family,output=substring(source,nchar(family)+2L),spec=spec))
  }
  stop('This view does not yet support independent canvas instances.',call.=FALSE)
}
# Read literal IDs from server-owned view-control constructors too: legacy
# modules build selectors inside renderUI after seeing the data. Action buttons,
# file inputs, arbitrary event names and computed user identifiers are excluded.
team_plot_instance_family_files <- c(results_dashboard='R/frontends/team/results_dashboard.R',qc_pca_tab='R/modules/2_qc_boxplot_module.R',barchart='R/modules/5_barchart_module.R',heatmap_barchart_tab='R/modules/4_heatmap_module.R',volcano_tab='R/modules/6_volcano_module.R',lsea_tab='R/modules/7_lsea_module.R',structural_tab='R/modules/8_structural_module.R',structural_grid_tab='R/modules/12_structural_grid_module.R',logratio_tab='R/modules/9_logratio_module.R',fla_tab='R/modules/10_fla_module.R',longitudinal_tab='R/modules/11_longitudinal_module.R',pathway_tab='R/modules/13_pathway_module.R',cellular_org_tab='R/modules/14_cellular_org_module.R')
# Opt-in server log for creating and restoring independent copies (LIPIDOMIC_CANVAS_DEBUG=1). It prints one line per
# step to the R console and nothing else; off by default. Pair it with ?canvasdebug=1 in the browser address.
team_canvas_debug <- function(fmt, ...) {
  if (!identical(Sys.getenv("LIPIDOMIC_CANVAS_DEBUG"), "1")) return(invisible())
  message(sprintf("[canvas] %s", tryCatch(sprintf(fmt, ...), error = function(e) fmt)))
  invisible()
}
team_plot_instance_dynamic_ids <- function(family) {
  files <- team_plot_instance_family_files
  controls <- c('selectInput','selectizeInput','numericInput','textInput','textAreaInput','sliderInput','radioButtons','checkboxInput','checkboxGroupInput','dateInput','dateRangeInput','colourInput')
  paths <- if (identical(family,'group_comparison_tab')) c(files[['logratio_tab']],'R/frontends/team/group_comparison.R') else files[[family]]
  text <- paste(unlist(lapply(paths,readLines,warn=FALSE),use.names=FALSE),collapse='\n')
  pattern <- paste0('(?:',paste(controls,collapse='|'),')\\s*\\(\\s*(?:inputId\\s*=\\s*)?(?:session\\$)?ns\\(\\s*[\"\']([A-Za-z][A-Za-z0-9_]{0,99})[\"\']')
  matches <- regmatches(text,gregexpr(pattern,text,perl=TRUE))[[1L]]
  unique(sub('.*ns\\(\\s*[\"\']([^\"\']+)[\"\']$','\\1',matches,perl=TRUE))
}
# A copy's host holds its module's own UI. Quality check shows two of its plots
# outside that UI (the outlier dialog and the Review step), so their copies get a
# plain output slot for the module's existing renderers.
team_plot_instance_host_ui <- function(family, spec, id) {
  ui <- get(spec$ui,mode='function')(id)
  if (identical(family,'structural_tab')) ui <- shiny::tagList(ui,structural_proportions_ui(id))
  if (identical(family,'qc_pca_tab')) ui <- shiny::tagList(ui,shiny::tags$div(class='tc-instance-extra-outputs',shiny::plotOutput(shiny::NS(id,'outlierPcaPlot'),height='480px'),plotly::plotlyOutput(shiny::NS(id,'guided_qc_plot'),height='380px')))
  ui
}
# The static markup of a family's controls, rendered once under a fixed schema
# namespace. Shiny generates fresh tab ids per render, so relations between tabs
# and panes are only read within one rendering.
team_plot_instance_schema_doc <- local({
  cache <- new.env(parent=emptyenv())
  function(family) {
    if (exists(family,cache,inherits=FALSE)) return(get(family,cache))
    spec <- if (identical(family,'team_cell')) list(ui='team_cell_instance_ui') else team_plot_instance_families[[family]]
    doc <- xml2::read_html(htmltools::renderTags(team_plot_instance_host_ui(family,spec,'tcinstance_schema'))$html)
    assign(family,doc,cache);doc
  }
})
team_plot_instance_input_ids <- local({
  cache <- new.env(parent=emptyenv())
  function(source) {
    family <- team_plot_instance_source(source)$family
    if (exists(family,cache,inherits=FALSE)) return(get(family,cache))
    doc <- team_plot_instance_schema_doc(family)
    fields <- xml2::xml_find_all(doc,"//select[@id] | //textarea[@id] | //input[@id and not(@type='file') and not(@type='button') and not(@type='submit')] | //*[@id and (contains(concat(' ',@class,' '),' shiny-input-radiogroup ') or contains(concat(' ',@class,' '),' shiny-input-checkboxgroup ') or contains(concat(' ',@class,' '),' shiny-tab-input '))]")
    ids <- xml2::xml_attr(fields,'id');ids <- substring(ids[startsWith(ids,'tcinstance_schema-')],19L)
    ids <- unique(c(ids,if (!identical(family,'team_cell')) team_plot_instance_dynamic_ids(family) else character()))
    ids <- unique(ids[grepl('^[A-Za-z][A-Za-z0-9_]{0,99}$',ids)])
    assign(family,ids,cache);ids
  }
})
# A copy's module server starts in the same flush that inserts its controls, so
# its first reactive pass reads every static control as NULL until the browser
# binds it. Some modules branch on those values without a guard (QC's PCA
# `plot_data` reads `if (input$classLabelFormat == "full")`), and an error in an
# observer ends the whole Shiny session. Until a control reports its own value,
# the copy reads the value it is about to receive: its saved/copied setting, or
# else the default written in the module's own UI markup (never restated here).
# Controls that the module builds on the server (renderUI) are left alone.
# The module's own (Classic) UI, rendered from its definition in the module file.
# Team replaces some module UIs, and a copy reads inputs that only the Classic UI
# declares (QC pcaMode); their Classic defaults are the values the module expects.
team_plot_instance_classic_doc <- function(family) {
  path <- team_plot_instance_family_files[family]; spec <- team_plot_instance_families[[family]]
  if (is.na(path) || !file.exists(path) || is.null(spec$ui)) return(NULL)
  for (e in parse(path,keep.source=FALSE)) {
    if (is.call(e) && length(e)==3L && paste(deparse(e[[1L]]),collapse='') %in% c('<-','=') && identical(e[[2L]],as.name(spec$ui))) {
      ui <- eval(e[[3L]],new.env(parent=globalenv()))
      return(xml2::read_html(htmltools::renderTags(ui('tcinstance_schema'))$html))
    }
  }
  NULL
}
# Classic-only inputs whose NULL breaks a module observer a copy runs (QC: the
# loading-plot tab observer compares input$pcaMode). Only these take the Classic
# default; every other unhosted input stays as the Team source has it (NULL when the
# Team UI has no control), so copies draw exactly like the Team view. A generic
# Classic default would give copies settings the Team view never uses.
team_plot_instance_classic_inputs <- list(qc_pca_tab='pcaMode')
team_plot_instance_input_defaults <- local({
  cache <- new.env(parent=emptyenv())
  function(family) {
    if (exists(family,cache,inherits=FALSE)) return(get(family,cache))
    out <- team_plot_instance_doc_defaults(team_plot_instance_schema_doc(family))
    if (!family %in% c('team_cell','results_dashboard')) {
      classic <- tryCatch(team_plot_instance_doc_defaults(team_plot_instance_classic_doc(family)),error=function(e)list())
      keys <- intersect(team_plot_instance_classic_inputs[[family]],team_plot_instance_unhosted_ids(family))
      for (key in intersect(setdiff(names(classic),names(out)),keys)) out[[key]] <- classic[[key]]
    }
    assign(family,out,cache);out
  }
})
team_plot_instance_doc_defaults <- function(doc) {
    if (is.null(doc)) return(list())
    prefix <- 'tcinstance_schema-'
    attr_of <- function(node,name) xml2::xml_attr(node,name)
    has_class <- function(node,cls) { value <- attr_of(node,'class'); !is.na(value) && grepl(paste0('(^|\\s)',cls,'(\\s|$)'),value) }
    out <- list()
    put <- function(id,value) { if (is.na(id) || !startsWith(id,prefix) || is.null(value) || !length(value) || anyNA(value)) return(); key <- substring(id,nchar(prefix)+1L); if (is.null(out[[key]])) out[[key]] <<- value }
    for (node in xml2::xml_find_all(doc,'//select[@id]')) {
      options <- xml2::xml_find_all(node,'.//option'); if (!length(options)) next
      values <- xml2::xml_attr(options,'value'); values[is.na(values)] <- xml2::xml_text(options)[is.na(values)]
      chosen <- values[!is.na(xml2::xml_attr(options,'selected'))]
      multiple <- !is.na(attr_of(node,'multiple'))
      put(attr_of(node,'id'),if (length(chosen)) (if (multiple) chosen else chosen[[1L]]) else if (multiple) NULL else values[[1L]])
    }
    for (node in xml2::xml_find_all(doc,"//input[@id and @type='checkbox']")) put(attr_of(node,'id'),!is.na(attr_of(node,'checked')))
    for (node in xml2::xml_find_all(doc,"//input[@id and @type='number']")) { v <- suppressWarnings(as.numeric(attr_of(node,'value'))); if (length(v)==1L && is.finite(v)) put(attr_of(node,'id'),v) }
    for (node in xml2::xml_find_all(doc,"//input[@id and contains(concat(' ',@class,' '),' js-range-slider ')]")) {
      type <- attr_of(node,'data-data-type'); if (!is.na(type) && !identical(type,'number')) next
      from <- suppressWarnings(as.numeric(attr_of(node,'data-from'))); to <- suppressWarnings(as.numeric(attr_of(node,'data-to')))
      put(attr_of(node,'id'),if (length(to)==1L && is.finite(to)) c(from,to) else from)
    }
    for (node in xml2::xml_find_all(doc,"//input[@id and @type='text' and not(contains(concat(' ',@class,' '),' js-range-slider '))]")) {
      v <- if (has_class(node,'shiny-colour-input')) attr_of(node,'data-init-value') else attr_of(node,'value')
      put(attr_of(node,'id'),if (is.na(v)) '' else v)
    }
    for (node in xml2::xml_find_all(doc,'//textarea[@id]')) put(attr_of(node,'id'),xml2::xml_text(node))
    for (node in xml2::xml_find_all(doc,"//*[@id and contains(concat(' ',@class,' '),' shiny-input-radiogroup ')]")) {
      v <- xml2::xml_attr(xml2::xml_find_all(node,".//input[@type='radio' and @checked]"),'value'); if (length(v)) put(attr_of(node,'id'),v[[1L]])
    }
    for (node in xml2::xml_find_all(doc,"//*[@id and contains(concat(' ',@class,' '),' shiny-input-checkboxgroup ')]")) {
      v <- xml2::xml_attr(xml2::xml_find_all(node,".//input[@type='checkbox' and @checked]"),'value'); if (length(v)) put(attr_of(node,'id'),v)
    }
    for (node in xml2::xml_find_all(doc,"//*[@id and contains(concat(' ',@class,' '),' shiny-tab-input ')]")) {
      links <- xml2::xml_find_all(node,'.//*[@data-value]'); if (!length(links)) next
      classes <- xml2::xml_attr(links,'class'); classes[is.na(classes)] <- ''
      active <- links[grepl('(^|\\s)active(\\s|$)',classes)]
      put(attr_of(node,'id'),xml2::xml_attr(if (length(active)) active[[1L]] else links[[1L]],'data-value'))
    }
    out
}
# Arm (restored creation: its saved keys read their saved values until each reports
# a value or the copy settles) or end (any other creation) a copy's NULL tracking.
team_plot_instance_track <- function(seen, value, restored) {
  if (!is.environment(seen)) return(NULL)
  rm(list=ls(seen,all.names=TRUE),envir=seen)
  assign('.keys',if (isTRUE(restored)) names(value$inputs) else character(),seen)
  if (!isTRUE(restored)) assign('.settled',TRUE,seen)
  seen
}
# Read-only view of a copy's inputs that falls back until a control has reported.
team_plot_instance_fallback_input <- function(input, fallback, pending = NULL) {
  x <- unclass(input); x$team_fallback <- fallback; x$team_pending <- pending
  structure(x,class=c('team_plot_instance_input',class(input)))
}
team_plot_instance_fallback_value <- function(x, name, value) {
  if (!is.null(value) || !is.character(name) || length(name)!=1L) return(value)
  fallback <- .subset2(x,'team_fallback')[[name]]
  if (is.null(fallback)) return(NULL)
  # A control that reported NULL (e.g. every checkbox cleared) keeps NULL, except
  # the first NULL a restored copy's control reports before taking its saved value.
  reported <- tryCatch(isTRUE(.subset2(x,'impl')$.values$containsKey(.subset2(x,'ns')(name))),error=function(e)TRUE)
  pending <- .subset2(x,'team_pending')
  if (reported && !(is.function(pending) && isTRUE(pending(name)))) NULL else fallback
}
`$.team_plot_instance_input` <- function(x, name) team_plot_instance_fallback_value(x,name,NextMethod())
`[[.team_plot_instance_input` <- function(x, i, ...) team_plot_instance_fallback_value(x,i,NextMethod())
# Literal ids passed to ns()/session$ns() anywhere inside an expression.
team_plot_instance_present <- function(x) !vapply(x,function(e) missing(e) || identical(e,quote(expr=)),logical(1))
team_plot_instance_ns_targets <- function(x) {
  found <- character()
  walk <- function(e) {
    if (!is.call(e)) return()
    head <- paste(deparse(e[[1L]]),collapse='')
    if (head %in% c('ns','session$ns') && length(e)>=2L && team_plot_instance_present(list(e[[2L]])) && is.character(e[[2L]])) found <<- c(found,e[[2L]])
    parts <- as.list(e)[-1L]; for (part in parts[team_plot_instance_present(parts)]) walk(part)
  }
  walk(x); unique(found)
}
# Saved or copied settings for controls that a copy can never show. A new copy
# starts from every input its source namespace ever reported. That includes the
# controls of the module's own (Classic) UI that the Team UI replaces, such as
# Quality check's shared preparation settings, and controls the module builds in
# a renderUI whose slot exists only elsewhere in Team (QC's guided sample picker
# lives in the Review step). No control for them exists in the copy, so the
# browser waited for them forever and the card never came. Dropped: ids that
# appear only in that replaced UI function or only inside renderUI outputs that
# have no slot in the copy's markup. Ids used anywhere else are kept.
team_plot_instance_after_run_ids <- list(structural_tab = c("selectedDetails", "topClassesCount"))
team_plot_instance_unhosted_ids <- local({
  cache <- new.env(parent=emptyenv())
  function(family) {
    if (exists(family,cache,inherits=FALSE)) return(get(family,cache))
    out <- character()
    path <- team_plot_instance_family_files[family]; spec <- team_plot_instance_families[[family]]
    if (!is.na(path) && file.exists(path) && !is.null(spec$ui)) {
      classic <- character(); other <- character()
      present <- team_plot_instance_present
      # ns() ids outside every renderUI body (their own wrappers excluded).
      outside <- function(e) {
        if (!is.call(e) || team_plot_instance_is_render_ui(e)) return()
        head <- paste(deparse(e[[1L]]),collapse='')
        if (head %in% c('ns','session$ns') && length(e)>=2L && present(list(e[[2L]])) && is.character(e[[2L]])) other <<- c(other,e[[2L]])
        parts <- as.list(e)[-1L]; for (part in parts[present(parts)]) outside(part)
      }
      for (e in parse(path,keep.source=FALSE)) {
        own_ui <- is.call(e) && length(e)==3L && paste(deparse(e[[1L]]),collapse='') %in% c('<-','=') && identical(e[[2L]],as.name(spec$ui))
        if (own_ui) classic <- c(classic,team_plot_instance_ns_targets(e)) else outside(e)
      }
      doc <- team_plot_instance_schema_doc(family)
      ids <- xml2::xml_attr(xml2::xml_find_all(doc,'//*[@id]'),'id'); reachable <- substring(ids[startsWith(ids,'tcinstance_schema-')],19L)
      edges <- team_plot_instance_wrappers(family)
      repeat {
        grown <- unique(c(reachable,names(edges)[vapply(edges,function(w)any(w %in% reachable),logical(1))]))
        if (length(grown)==length(reachable)) break
        reachable <- grown
      }
      out <- setdiff(unique(c(classic,names(edges))),c(reachable,other))
    }
    # Controls a module draws only after an analysis that a checkpoint does not keep (the run button's click count is
    # not saved), or only late while the module settles. A restored copy must not wait for them: it would never
    # settle (found with ?canvasdebug=1: Species waited for "selectedDetails" and "topClassesCount" until it timed out).
    out <- union(out,team_plot_instance_after_run_ids[[family]])
    assign(family,out,cache);out
  }
})
# Plots that their module draws only while a display switch is on. The class
# standard-deviation heatmaps exist only with "Condense Rows (Class Standard
# Deviation)" checked (`show_sd <- isTRUE(input$condenseRowsSD)` in the heatmap
# container renderUI); a copy of one of them is that view, so it starts with it.
team_plot_instance_shown_by <- list(
  'heatmap_barchart_tab-heatmapSDPlot'=list(condenseRowsSD=TRUE),
  'heatmap_barchart_tab-filteredHeatmapSDPlot'=list(condenseRowsSD=TRUE),
  # Team's editable vector views exist only with their "Editable vector view" box
  # checked (legacy_vector_adapter.R: req(isTRUE(input$team_<plot>_vector))).
  'qc_pca_tab-pca2dVectorPlot'=list(team_pca2dPlot_vector=TRUE),
  'qc_pca_tab-load2dVectorPlot'=list(team_load2dPlot_vector=TRUE)
)
# Each plot lives in its module's markup, often inside tabs and sometimes inside a
# renderUI built on the server. Locate it: the renderUI outputs that create it
# (read from the module source) and the tab panes around it (read from the UI).
team_plot_instance_is_render_ui <- function(e) is.call(e) && length(e)==3L && paste(deparse(e[[1L]]),collapse='') %in% c('<-','=') && is.call(e[[2L]]) && identical(e[[2L]][[1L]],as.name('$')) && identical(e[[2L]][[2L]],as.name('output')) && is.call(e[[3L]]) && paste(deparse(e[[3L]][[1L]]),collapse='') %in% c('renderUI','shiny::renderUI')
team_plot_instance_wrappers <- local({
  cache <- new.env(parent=emptyenv())
  function(family) {
    if (exists(family,cache,inherits=FALSE)) return(get(family,cache))
    edges <- list()
    visit <- function(e) {
      if (!is.call(e)) return()
      if (team_plot_instance_is_render_ui(e)) {
        wrapper <- as.character(e[[2L]][[3L]])
        for (target in team_plot_instance_ns_targets(e[[3L]])) edges[[target]] <<- unique(c(edges[[target]],wrapper))
      }
      parts <- as.list(e)[-1L]; for (part in parts[team_plot_instance_present(parts)]) visit(part)
    }
    path <- team_plot_instance_family_files[family]
    if (!is.na(path) && file.exists(path)) for (e in parse(path,keep.source=FALSE)) visit(e)
    # Team adapters rewrite some servers at startup (the heatmap renderUI is split
    # into per-plot boundaries), so the live server body is read as well.
    server <- team_plot_instance_families[[family]]$server
    if (!is.null(server) && exists(server,mode='function')) visit(body(get(server,mode='function')))
    assign(family,edges,cache);edges
  }
})
# A plot can also wait on a control that a renderUI of its module builds
# (longitudinal: macroclass_plot req()s input$selectedMacroclass, created by
# output$macroclass_selector_ui in another, hidden tab). That renderUI must run
# for the copy to draw. Read from the module source: the inputs the plot's render
# expression reads, directly or through the module's reactive()s, and the
# renderUI outputs whose markup creates any of those inputs.
team_plot_instance_input_providers <- local({
  cache <- new.env(parent=emptyenv())
  function(source) {
    if (exists(source,cache,inherits=FALSE)) return(get(source,cache))
    resolved <- team_plot_instance_source(source); family <- resolved$family
    renders <- list(); reactives <- list(); creates <- list()
    lhs_output <- function(e) is.call(e) && length(e)==3L && paste(deparse(e[[1L]]),collapse='') %in% c('<-','=') && is.call(e[[2L]]) && identical(e[[2L]][[1L]],as.name('$')) && identical(e[[2L]][[2L]],as.name('output'))
    visit <- function(e) {
      if (!is.call(e)) return()
      if (lhs_output(e)) {
        key <- as.character(e[[2L]][[3L]]); renders[[key]] <<- e[[3L]]
        if (team_plot_instance_is_render_ui(e)) creates[[key]] <<- team_plot_instance_ns_targets(e[[3L]])
      } else if (length(e)==3L && paste(deparse(e[[1L]]),collapse='') %in% c('<-','=') && is.name(e[[2L]]) && is.call(e[[3L]]) &&
                 sub('^shiny::','',paste(deparse(e[[3L]][[1L]]),collapse='')) %in% c('reactive','eventReactive')) reactives[[as.character(e[[2L]])]] <<- e[[3L]]
      parts <- as.list(e)[-1L]; for (part in parts[team_plot_instance_present(parts)]) visit(part)
    }
    path <- team_plot_instance_family_files[family]
    if (!is.na(path) && file.exists(path)) for (e in parse(path,keep.source=FALSE)) visit(e)
    inputs <- character(); seen <- character()
    walk <- function(e) {
      if (is.name(e)) { n <- as.character(e); if (n %in% names(reactives) && !n %in% seen) { seen <<- c(seen,n); walk(reactives[[n]]) }; return() }
      if (!is.call(e)) return()
      if (identical(e[[1L]],as.name('$')) && identical(e[[2L]],as.name('input')) && length(e)==3L) { inputs <<- c(inputs,as.character(e[[3L]])); return() }
      if (identical(e[[1L]],as.name('[[')) && identical(e[[2L]],as.name('input')) && length(e)==3L && is.character(e[[3L]])) { inputs <<- c(inputs,e[[3L]]); return() }
      parts <- as.list(e); for (part in parts[team_plot_instance_present(parts)]) walk(part)
    }
    if (!is.null(renders[[resolved$output]])) walk(renders[[resolved$output]])
    out <- names(Filter(function(ids) any(ids %in% inputs),creates))
    out <- setdiff(out,resolved$output)
    assign(source,out,cache);out
  }
})
team_plot_instance_layout <- local({
  cache <- new.env(parent=emptyenv())
  function(source) {
    if (exists(source,cache,inherits=FALSE)) return(get(source,cache))
    resolved <- team_plot_instance_source(source); family <- resolved$family
    doc <- team_plot_instance_schema_doc(family); prefix <- 'tcinstance_schema-'
    find <- function(key) xml2::xml_find_first(doc,sprintf("//*[@id='%s%s']",prefix,key))
    edges <- if (identical(family,'team_cell')) list() else team_plot_instance_wrappers(family)
    # Walk outwards from the plot through the renderUI outputs that build it
    # until one of them is part of the static markup.
    wrappers <- character(); frontier <- resolved$output; anchor <- NULL
    for (depth in seq_len(5L)) {
      hits <- Filter(function(key) !inherits(find(key),'xml_missing'),frontier)
      if (length(hits)) { anchor <- find(hits[[1L]]); break }
      frontier <- setdiff(unique(unlist(edges[frontier],use.names=FALSE)),c(wrappers,resolved$output))
      if (!length(frontier)) break
      wrappers <- c(wrappers,frontier)
    }
    if (is.null(anchor)) wrappers <- character()
    tabs <- list()
    if (!is.null(anchor)) for (pane in rev(xml2::xml_find_all(anchor,"ancestor::*[contains(concat(' ',@class,' '),' tab-pane ')]"))) {
      pane_id <- xml2::xml_attr(pane,'id'); if (is.na(pane_id)) next
      link <- xml2::xml_find_first(doc,sprintf("//*[@data-value and (@data-bs-target='#%1$s' or @href='#%1$s' or @data-target='#%1$s')]",pane_id))
      if (inherits(link,'xml_missing')) next
      set <- xml2::xml_find_first(link,"ancestor::*[@id and contains(concat(' ',@class,' '),' shiny-tab-input ')][1]")
      if (inherits(set,'xml_missing')) next
      set_id <- xml2::xml_attr(set,'id'); if (!startsWith(set_id,prefix)) next
      tabs[[substring(set_id,nchar(prefix)+1L)]] <- xml2::xml_attr(link,'data-value')
    }
    out <- list(wrappers=wrappers,tabs=tabs)
    assign(source,out,cache);out
  }
})
# Run a copy's server in a domain whose errors stay inside that copy. Shiny ends
# the session on any observer error; inside this domain an error is printed and
# reported for this copy only, and the rest of the session keeps working.
team_plot_instance_guarded <- function(session, id, fallback, on_error, expr, pending = NULL) {
  proxy <- tryCatch(get('createSessionProxy',envir=asNamespace('shiny'),inherits=FALSE),error=function(e)NULL)
  if (!is.function(proxy)) return(shiny::withReactiveDomain(session,expr))
  report <- function(e, close = TRUE) on_error(e)
  guard <- function(scope, namespace) {
    if (!is.environment(scope) || !inherits(scope,'session_proxy') || !exists('overrides',envir=scope,inherits=FALSE)) return(scope)
    overrides <- get('overrides',envir=scope,inherits=FALSE)
    make <- overrides$makeScope
    overrides$unhandledError <- report
    if (is.function(make)) overrides$makeScope <- function(inner) guard(make(inner),NULL)
    if (identical(namespace,id) && length(fallback) && inherits(overrides$input,'reactivevalues')) overrides$input <- team_plot_instance_fallback_input(overrides$input,fallback,pending)
    assign('overrides',overrides,envir=scope);scope
  }
  domain <- proxy(session,unhandledError=report,makeScope=function(namespace) guard(session$makeScope(namespace),namespace))
  shiny::withReactiveDomain(domain,expr)
}
# A new dashboard copy's server starts in the same flush that inserts its
# controls, so its first PCA render reads `pca_scale` before the browser has
# bound that select (NULL: `Scaling = NULL` breaks the result data.frame and
# `identical(NULL, "uv")` would silently mean centered-only). Until the control
# reports a value, the copy reads the dashboard's own UI default — the selected
# option of `pca_scale` in results_dashboard_ui() (R/results_dashboard.R,
# "Unit variance" = "uv") — read from that markup, never restated here.
team_dashboard_input_defaults <- local({
  cache <- NULL
  function() {
    if (is.null(cache)) {
      doc <- xml2::read_html(htmltools::renderTags(results_dashboard_ui('tcinstance_defaults'))$html)
      select <- xml2::xml_find_first(doc,"//select[@id='tcinstance_defaults-pca_scale']")
      options <- xml2::xml_find_all(select,'./option')
      selected <- options[!is.na(xml2::xml_attr(options,'selected'))]
      value <- xml2::xml_attr(if (length(selected)) selected[[1L]] else options[[1L]],'value')
      if (!is.character(value) || length(value)!=1L || is.na(value) || !nzchar(value)) stop('Dashboard PCA scaling default could not be read.',call.=FALSE)
      cache <<- list(pca_scale=value)
    }
    cache
  }
})
# A copy's server code can run before the browser has sent the copy's saved settings (its
# data arrives first). While a key is still empty in the browser, it reads as its saved value,
# so "keep the selection if it is still a choice, else take the first" keeps the saved
# selection (or falls back if the saved one no longer exists) instead of pushing the first
# choice. Once the browser has any value for that key (or after 60 s), the live value wins:
# a valid fallback chosen by the server or an analyst's edit is never overridden.
team_dashboard_instance_input <- function(input, saved = list()) {
  state <- new.env(parent = emptyenv()); state$caught <- character(); state$until <- Sys.time() + 60
  structure(list(input=input,defaults=team_dashboard_input_defaults(),saved=saved,state=state),class='team_dashboard_instance_input')
}
team_instance_input_empty <- function(x) is.null(x) || !length(x) || all(is.na(x) | as.character(x) == "")
# The keys the Signal distribution reads (sample_info, R/results_dashboard.R). In a session
# they are watched through a reactiveVal fed by an observer: the saved value read while the
# control was empty and the same value arriving from the browser are equal, so that arrival
# no longer re-renders the copy. The value itself is read as before, at the time of the read.
team_dashboard_echo_keys <- 'color_by'
`$.team_dashboard_instance_input` <- function(x, name) {
  state <- .subset2(x,'state')
  if (!is.character(name) || length(name)!=1L || !name %in% team_dashboard_echo_keys || is.null(shiny::getDefaultReactiveDomain())) return(team_dashboard_instance_read(x,name))
  if (is.null(state$memo)) state$memo <- new.env(parent=emptyenv())
  if (!exists(name,state$memo,inherits=FALSE)) {
    rv <- shiny::reactiveVal(shiny::isolate(team_dashboard_instance_read(x,name)))
    shiny::observe({
      value <- team_dashboard_instance_read(x,name)
      # Readers last got another value (the 60 s grace ended on their read): notify them.
      if (!identical(value,state$returned[[name]])) rv(structure(list(),class='team_echo_stale'))
      rv(value)
    },priority=100)
    assign(name,rv,state$memo)
  }
  get(name,state$memo,inherits=FALSE)()
  # The 60 s grace takes effect only on a read that happens anyway, as before.
  value <- shiny::isolate(team_dashboard_instance_read(x,name))
  state$returned[name] <- list(value)
  value
}
team_dashboard_instance_read <- function(x, name) {
  value <- .subset2(x,'input')[[name]]
  saved <- .subset2(x,'saved')[[name]]; state <- .subset2(x,'state')
  if (!team_instance_input_empty(saved) && !name %in% state$caught) {
    if (!team_instance_input_empty(value) || Sys.time() > state$until) state$caught <- c(state$caught,name)
    else return(saved)
  }
  if (is.null(value)) .subset2(x,'defaults')[[name]] else value
}
`[[.team_dashboard_instance_input` <- function(x, i, ...) `$.team_dashboard_instance_input`(x,i)
team_plot_instance_validate <- function(value, output_id = NULL) {
  if (!is.list(value) || is.null(names(value)) || anyDuplicated(names(value)) ||
      !setequal(names(value),c('id','source','inputs'))) stop('Invalid canvas plot instance.',call.=FALSE)
  id <- value$id
  if (!is.character(id)||length(id)!=1L||is.na(id)||!grepl('^tcinstance_[a-z0-9_]{1,80}$',id)) stop('Invalid canvas instance namespace.',call.=FALSE)
  source <- team_plot_instance_source(value$source)
  if (!is.null(output_id) && !identical(output_id,paste0(id,'-',source$output))) stop('Canvas instance output does not match its source.',call.=FALSE)
  values <- value$inputs
  if (!is.list(values)||length(values)>250L||(length(values)&&(is.null(names(values))||anyDuplicated(names(values))||any(!grepl('^[A-Za-z][A-Za-z0-9_]{0,99}$',names(values)))))) stop('Invalid canvas instance inputs.',call.=FALSE)
  if (nchar(jsonlite::toJSON(values,auto_unbox=TRUE,null='null'),type='bytes')>512*1024) stop('Canvas plot settings exceed 512 KiB.',call.=FALSE)
  if (any(!names(values) %in% team_plot_instance_input_ids(value$source))) stop('Unknown or unsafe restored plot input.',call.=FALSE)
  for (key in names(values)) {
    x <- values[[key]]
    if (is.null(x)) next
    if (is.list(x)) {
      if (!is.null(names(x)) || any(vapply(x,function(item)is.list(item)||length(item)!=1L,logical(1)))) stop('Nested canvas plot settings are not allowed.',call.=FALSE)
      # JSON [] arrives as an empty list. Preserve it for the input binding;
      # unlist(list()) becomes NULL and would fail the atomic type check below.
      if (!length(x)) next
      x <- unlist(x,recursive=FALSE,use.names=FALSE)
    }
    if (length(x)>10000L || !(is.character(x)||is.numeric(x)||is.logical(x)) || anyNA(x) ||
        (is.numeric(x)&&any(!is.finite(x))) || (is.character(x)&&any(nchar(x)>100000L))) stop('Invalid canvas plot setting.',call.=FALSE)
  }
  list(id=id,source=value$source,inputs=values)
}
# Why shared_data$inference_allowed(FALSE) refuses the unpaired comparison, read from the
# same states it checks (1_shared_data_module.R inference_allowed; guided_workflow.R
# guide_allows_inference): 'ok', 'preparation' (missing, out of date or unavailable),
# 'measured' (prepared samples include non-measured ones), 'paired' (the confirmed
# design is matched/repeated, which this comparison does not fit), 'uncertain' (mixed
# or uncertain design), or 'design' (not confirmed). NA when the policy is unknown.
team_canvas_inference_gate <- function(unpaired, paired=NULL, unit=NULL, type=NULL, preparation=NULL, synthetic_ids=NULL) {
  if (is.null(unpaired)) return(NA_character_)
  if (isTRUE(unpaired)) return('ok')
  if (!nzchar(trimws(unit %||% '')) || !isTRUE(type %in% c('independent','paired','uncertain'))) return('design')
  if (is.list(preparation) && (!identical(preparation$status,'ready') || isTRUE(preparation$dirty) || !isTRUE(preparation$data_available))) return('preparation')
  if (length(synthetic_ids)) return('measured')
  if (identical(type,'paired') && isTRUE(paired)) return('paired')
  if (identical(type,'uncertain')) return('uncertain')
  'design'
}
# Time points as the guided Longitudinal gate counts them (guide_longitudinal_block_reasons):
# at least two real TimePoint values in the metadata. NA when no metadata is loaded.
team_canvas_timepoints_available <- function(md) {
  if (is.null(md) || !is.data.frame(md) || !nrow(md)) return(NA)
  if (!'TimePoint' %in% names(md)) return(FALSE)
  times <- unique(as.character(md$TimePoint)); times <- times[!is.na(times) & nzchar(times) & times != 'Unspecified']
  length(times) >= 2L
}
team_plot_instances_server <- function(input, output, session, shared_data, dashboard_data) {
  active <- new.env(parent=emptyenv())
  settling <- new.env(parent=emptyenv())
  stop_settling <- function(id) {
    if (!exists(id,settling,inherits=FALSE)) return(invisible())
    entry <- get(id,settling);if (!is.null(entry$watcher)) entry$watcher$destroy()
    entry$watcher <- NULL;assign(id,entry,settling);invisible()
  }
  insert_host <- function(id, resolved, spec) {
    ui <- team_plot_instance_host_ui(resolved$family,spec,id)
    shiny::insertUI(selector='body',where='beforeEnd',ui=shiny::tags$div(id=paste0(id,'_host'),class='tc-instance-host',`data-instance-id`=id,`data-instance-output`=resolved$output,`aria-hidden`='true',inert='',style='position:absolute;left:-100000px;top:0;width:900px',ui),immediate=TRUE,session=session)
  }
  create <- function(value, request_token = NULL, restored = FALSE) {
    value <- team_plot_instance_validate(value)
    resolved <- team_plot_instance_source(value$source); spec <- resolved$spec; id <- value$id
    team_canvas_debug('create id=%s source=%s restored=%s saved inputs=[%s]',id,value$source,restored,paste(names(value$inputs),collapse=','))
    # Show the tab that holds this plot. A copy starts from its source view's
    # settings, whose open tab is usually another one; modules render only the
    # open tab, so the copy's own plot (or the renderUI that builds it) never came.
    layout <- tryCatch(team_plot_instance_layout(value$source),error=function(e)list(wrappers=character(),tabs=list()))
    for (key in names(layout$tabs)) value$inputs[[key]] <- layout$tabs[[key]]
    for (key in names(team_plot_instance_shown_by[[value$source]])) value$inputs[[key]] <- team_plot_instance_shown_by[[value$source]][[key]]
    # Composition donuts accept only percentage value modes: the module rewrites
    # an intensity mode on its Donutplot tab (R/modules/5_barchart_module.R, the
    # barValueMode observer: Normalized* -> "Normalized (%)", else "Absolute (%)").
    # A copy started from the bar view carried the intensity mode, which its
    # control can never take, so it never settled. Apply the module's own rule.
    if (identical(resolved$family,'barchart') && startsWith(resolved$output,'donutPlot')) {
      mode <- value$inputs$barValueMode; if (is.list(mode)) mode <- unlist(mode,use.names=FALSE)
      if (is.character(mode) && length(mode)==1L && !mode %in% c('Absolute (%)','Normalized (%)')) value$inputs$barValueMode <- if (grepl('Normalized',mode)) 'Normalized (%)' else 'Absolute (%)'
    }
    seen <- NULL
    unhosted_values <- list()
    if (!resolved$family %in% c('team_cell','results_dashboard')) {
      unhosted <- tryCatch(team_plot_instance_unhosted_ids(resolved$family),error=function(e)character())
      # No control of the copy can report these, so they are not seeded or awaited;
      # the module still reads them, so the copy keeps the source's values.
      unhosted_values <- value$inputs[names(value$inputs) %in% unhosted]
      value$inputs <- value$inputs[!names(value$inputs) %in% unhosted]
    }
    if (!exists(id,active,inherits=FALSE)) {
      # A restored checkpoint's copies are created progressively (canvas.js), not at
      # restore time: their saved namespaces still waiting for creation keep their
      # places, so a new copy cannot take the last one (the eager restore created
      # them first, and the new copy was the one refused).
      reserved <- if (isTRUE(restored) || !is.function(session$userData$team_canvas_restored_pending)) character() else setdiff(session$userData$team_canvas_restored_pending(), c(ls(active), id))
      if(length(ls(active))+length(reserved)>=160L)stop('This session has created 160 independent plots. Save the workspace and reopen it to continue.',call.=FALSE)
      insert_host(id, resolved, spec)
      result <- NULL
      fallback <- list()
      if (!identical(resolved$family,'results_dashboard')) {
        fallback <- tryCatch(team_plot_instance_input_defaults(resolved$family),error=function(e)list())
        for (key in names(unhosted_values)) { saved <- unhosted_values[[key]]; if (is.list(saved)) saved <- unlist(saved,use.names=FALSE); if (length(saved)) fallback[[key]] <- saved }
        for (key in intersect(names(value$inputs),names(fallback))) {
          saved <- value$inputs[[key]]; if (is.list(saved)) saved <- unlist(saved,use.names=FALSE)
          fallback[[key]] <- if (length(saved)) saved else NULL
        }
      }
      # A restored copy is created once the analysis it reads is ready (canvas.js
      # requests it progressively); the eager restore created it before, so it never
      # computed from the NULL a control reports while it is still taking its saved
      # value (QC's classLabelFormat: `if (input$classLabelFormat == "full")` in
      # plot_data). Until the copy settles, a saved key that has reported only NULL
      # reads its saved value; a NULL reported after a value is kept. The tracking
      # state lives with the instance: every later creation of this namespace (a
      # parked copy placed again, a second restore) re-arms or ends it, and its
      # settle watcher records into it, so the module's view never goes stale.
      seen <- team_plot_instance_track(new.env(parent=emptyenv()),value,restored)
      pending <- function(name) !exists('.settled',seen,inherits=FALSE) && name %in% get('.keys',seen,inherits=FALSE) && !exists(name,seen,inherits=FALSE)
      # One message per error burst: a failing observer can rerun many times. A
      # parked copy that is placed again reports anew (see `rearm` below).
      reported <- FALSE
      rearm <- function() reported <<- FALSE
      on_error <- function(e) {
        if (reported) return(invisible())
        reported <<- TRUE
        # The token of this copy's latest creation request (see `request_token` below),
        # so the browser matches the error to the request it belongs to.
        latest <- if (exists(id,active,inherits=FALSE)) get(id,active)$request_token else request_token
        session$sendCustomMessage('team-canvas-instance-error',c(list(id=id,message=paste0('An independent plot stopped after an error in its analysis (',conditionMessage(e),'). Other plots and the session keep working; remove it or add it again.')),if(!is.null(latest))list(request=latest)))
      }
      team_plot_instance_guarded(session,id,fallback,on_error,{
      if (identical(resolved$family,'results_dashboard')) {
        dashboard <- shiny::moduleServer(id,function(input,output,session) results_dashboard_module_server(team_dashboard_instance_input(input,value$inputs),output,session,dashboard_data))
      } else {
        args <- list(id=id,shared_data=shared_data)
        if (isTRUE(spec$colors)) args$global_color_map <- shiny::reactive(shared_data$color_maps())
        result <- do.call(get(spec$server,mode='function'),args)
      }
      },pending=pending)
      assign(id,list(source=value$source,dashboard=if(identical(resolved$family,'results_dashboard'))dashboard else NULL,result=result,parked=FALSE,rearm=rearm,request_token=request_token,seen=seen),active)
    } else if (!identical(get(id,active)$source,value$source)) stop('Canvas instance namespace already belongs to another plot.',call.=FALSE)
    else if (isTRUE(get(id,active)$parked)) { entry <- get(id,active); insert_host(id,resolved,spec); entry$parked <- FALSE; if (is.function(entry$rearm)) entry$rearm(); entry$request_token <- request_token; seen <- team_plot_instance_track(entry$seen,value,restored); assign(id,entry,active) }
    else { entry <- get(id,active); entry$request_token <- request_token; seen <- team_plot_instance_track(entry$seen,value,restored); assign(id,entry,active) }
    # A restored workspace can be hidden while preparation completes. Keep only
    # this instance's selected output active, so its pending render is delivered
    # even when the browser last reported the parked source as hidden. Sibling
    # family outputs retain Shiny's normal suspension policy.
    shiny::outputOptions(output,paste0(id,'-',resolved$output),suspendWhenHidden=FALSE)
    # The renderUI outputs that build this plot sit in panes the settings drawer
    # keeps hidden; they must run for the plot to exist at all.
    for (wrapper in unique(c(layout$wrappers,tryCatch(team_plot_instance_input_providers(value$source),error=function(e)character())))) tryCatch(shiny::outputOptions(output,paste0(id,'-',wrapper),suspendWhenHidden=FALSE),error=function(e)NULL)
    # Seed the saved settings into the new host's controls in this same flush, so
    # the browser's first values for the copy are its own (never the UI defaults)
    # and each output is computed once from them. The browser still checks and
    # re-sends any value a control could not take (e.g. server-side selectize).
    for (key in names(value$inputs)) session$sendInputMessage(paste0(id,'-',key),list(value=value$inputs[[key]]))
    # Tell the browser when the server holds every saved value. Output values of
    # that flush follow this message, so the next render of the copy is the
    # restored one; the browser uses it to reveal a restored card.
    # Each creation has its own generation, so a signal from an earlier restore of
    # the same copy can never reveal this one; a pending watcher is replaced.
    generation <- (if (exists(id,settling,inherits=FALSE)) get(id,settling)$generation else 0L)+1L
    stop_settling(id)
    if (length(value$inputs)) {
      expected <- value$inputs
      # Numbers compare as numbers only when the saved value is a number; text is exact.
      same <- function(actual,saved) {
        if (is.null(saved)||!length(saved)) return(is.null(actual)||!length(actual))
        if (is.numeric(saved)) { a <- suppressWarnings(as.numeric(unlist(actual,use.names=FALSE)));return(length(a)==length(saved)&&!anyNA(a)&&all(a==saved)) }
        identical(as.character(unlist(actual,use.names=FALSE)),as.character(unlist(saved,use.names=FALSE)))
      }
      watcher <- shiny::observe({
        actual <- lapply(stats::setNames(names(expected),names(expected)),function(key)input[[paste0(id,'-',key)]])
        if (is.environment(seen)) for (key in names(actual)) if (!is.null(actual[[key]])) assign(key,TRUE,seen)
        ok <- all(vapply(names(expected),function(key)same(actual[[key]],expected[[key]]),logical(1)))
        if (ok) { if (is.environment(seen)) assign('.settled',TRUE,seen); session$sendCustomMessage('team-canvas-instance-settled',list(id=id,generation=generation));stop_settling(id) }
      },priority=-100)
      assign(id,list(generation=generation,watcher=watcher),settling)
    } else {
      if (is.environment(seen)) assign('.settled',TRUE,seen)
      assign(id,list(generation=generation,watcher=NULL),settling)
      session$sendCustomMessage('team-canvas-instance-settled',list(id=id,generation=generation))
    }
    # Send within the current reactive flush. A message enqueued from onFlushed
    # can otherwise wait indefinitely for an unrelated subsequent flush.
    reply <- list(allowedInputs=team_plot_instance_input_ids(value$source),generation=generation)
    if (!is.null(request_token)) reply$request <- request_token
    team_canvas_debug('ready id=%s source=%s restored=%s inputs=[%s]',id,value$source,restored,paste(names(value$inputs),collapse=','))
    session$sendCustomMessage('team-canvas-instance-ready',c(value,reply))
    invisible(value)
  }
  session$userData$team_canvas_instance_context <- function(output_id) {
    ids <- ls(active);matches <- ids[vapply(ids,function(id)startsWith(output_id,paste0(id,'-')),logical(1))]
    if(length(matches)!=1L)return(NULL)
    id <- matches[[1L]];entry <- get(id,active);source <- team_plot_instance_source(entry$source)
    if(!identical(output_id,paste0(id,'-',source$output)))return(NULL)
    if(identical(source$family,'team_cell')) {
      if(!exists('team_insight_cell_context',mode='function'))return(NULL)
      local_inputs <- list()
      for(key in team_plot_instance_input_ids(entry$source))local_inputs[key] <- list(input[[paste0(id,'-',key)]])
      return(team_insight_cell_context(entry$source,local_inputs,shared_data,entry$result))
    }
    if(!identical(source$family,'results_dashboard'))return(NULL)
    local_inputs <- list()
    for(key in team_plot_instance_input_ids(entry$source))local_inputs[[paste0('results_dashboard-',key)]] <- input[[paste0(id,'-',key)]]
    # Describe the PCA the copy computed: its scaling default applies until bound.
    for(key in names(team_dashboard_input_defaults()))if(is.null(local_inputs[[paste0('results_dashboard-',key)]]))local_inputs[[paste0('results_dashboard-',key)]] <- team_dashboard_input_defaults()[[key]]
    team_insight_context(entry$source,local_inputs,dashboard_data,entry$dashboard)
  }
  # Park removed/failed instances: Shiny versions without module teardown cannot
  # destroy observers, but a hidden output need not keep rendering. Keep the
  # namespace registered so a checkpoint can safely recreate the same instance.
  shiny::observeEvent(input$team_canvas_instance_park, {
    id <- input$team_canvas_instance_park
    if (!is.character(id) || length(id)!=1L || is.na(id) ||
        !grepl('^tcinstance_[a-z0-9_]{1,80}$',id) || !exists(id,active,inherits=FALSE)) return()
    entry <- get(id,active,inherits=FALSE); resolved <- team_plot_instance_source(entry$source)
    shiny::outputOptions(output,paste0(id,'-',resolved$output),suspendWhenHidden=TRUE)
    for (wrapper in unique(c(tryCatch(team_plot_instance_layout(entry$source)$wrappers,error=function(e)character()),tryCatch(team_plot_instance_input_providers(entry$source),error=function(e)character())))) tryCatch(shiny::outputOptions(output,paste0(id,'-',wrapper),suspendWhenHidden=TRUE),error=function(e)NULL)
    shiny::removeUI(selector=paste0('#',id,'_host'),immediate=TRUE,session=session)
    entry$parked <- TRUE; assign(id,entry,active); stop_settling(id)
  },ignoreInit=TRUE)
  session$userData$team_canvas_instances_create <- create
  # Differential plots draw a "select cohorts" placeholder until the shared
  # differential analysis has results; the canvas chip reports that state.
  if (is.function(shared_data$de_results)) shiny::observe({
    ready <- tryCatch(!is.null(shared_data$de_results()),error=function(e)FALSE)
    # No comparison runs until shared_data$inference_allowed(FALSE) holds. That is FALSE
    # for several different reasons, so the card is told which one applies.
    safe <- function(f, ...) if (is.function(f)) tryCatch(f(...),error=function(e)NULL) else NULL
    gate <- team_canvas_inference_gate(
      unpaired=safe(shared_data$inference_allowed,FALSE), paired=safe(shared_data$inference_allowed,TRUE),
      unit=input$guide_unit, type=input$guide_design_type,
      preparation=safe(shared_data$preparation_state), synthetic_ids=safe(shared_data$synthetic_sample_ids))
    session$sendCustomMessage('team-canvas-de-state',list(ready=isTRUE(ready),design=identical(gate,'ok'),gate=gate,
      timepoints=team_canvas_timepoints_available(safe(shared_data$all_metadata))))
  })
  shiny::observeEvent(input$team_canvas_instance_create,{
    request <- input$team_canvas_instance_create
    # The browser's request token is echoed in the reply (ready or error), so a
    # reply to an earlier request for the same id never initializes a newer one.
    token <- if (is.list(request) && is.character(request$request) && length(request$request)==1L && grepl('^[A-Za-z0-9_]{1,40}$',request$request)) request$request else NULL
    if (is.list(request)) request$request <- NULL
    tryCatch({
      # A card of a restored checkpoint is created from the server's validated
      # copy of its saved instance (what the restore itself used to create), not
      # from the browser's echo of it.
      restored <- session$userData$team_canvas_restored_instance
      saved <- if (is.function(restored) && is.list(request)) restored(request$id, request$source) else NULL
      if (!is.null(saved)) create(saved, token, restored=TRUE) else {
        allowed <- team_plot_instance_input_ids(request$source)
        request$inputs <- request$inputs[names(request$inputs) %in% allowed]
        create(request, token)
      }
    },error=function(e){team_canvas_debug('create FAILED id=%s: %s',if(is.list(request))request$id else '?',conditionMessage(e));session$sendCustomMessage('team-canvas-instance-error',c(list(id=if(is.list(request))request$id else NULL,message=conditionMessage(e)),if(!is.null(token))list(request=token)))})
  },ignoreInit=TRUE)
  # Violin statistics read only this session's registered independent copies.
  if (exists('team_violin_stats_server',mode='function'))
    team_violin_stats_server(input,session,dashboard_data,function(id) if (exists(id,active,inherits=FALSE)) get(id,active) else NULL)
  invisible(create)
}
# The allow-list of a family's restorable inputs (and the defaults its copies read)
# depend only on code: the family table, its UI functions and its module file. Both
# are memoized per process above; the first resume after start paid ~1.8 s to build
# them inside the restore. Build them once the app is serving, one family per event
# loop turn so requests interleave. The memoized functions are called exactly as a
# restore would call them (same keys, same code), so a warm entry is the value a
# cold call computes; a family that fails is left uncached and retried on demand.
team_plot_instance_prewarm_sources <- function() {
  c(team_cell=team_cell_instance_outputs[[1L]],vapply(names(team_plot_instance_families),function(f)paste0(f,'-',team_plot_instance_families[[f]]$outputs[[1L]]),character(1)))
}
# R compiles a function the first time it runs; a resume paid ~0.4 s compiling the
# canvas and figure validators. Run them once on a constant, code-owned canvas (one
# copy with a tiny SVG figure) and discard the result: they are pure, and the image
# cache used here is a throwaway one with the plain checker (never a session's cache,
# never the on-disk preparation cache).
team_plot_instance_prewarm_validator <- function() {
  if (!exists('team_canvas_validate',mode='function') || !exists('team_canvas_image_cache',mode='function')) return(invisible())
  svg <- '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><rect width="8" height="8" fill="#ffffff"/></svg>'
  node <- list(id='tcinstance_prewarm-plot_violin',label='Prewarm',x=0,y=0,width=600,height=400,visual=list(),
    finished=list(url=paste0('data:image/svg+xml;charset=utf-8,',utils::URLencode(svg,reserved=TRUE)),createdAt='2026-01-01T00:00:00Z',stale=FALSE),
    instance=list(id='tcinstance_prewarm',source='results_dashboard-plot_violin',inputs=list()))
  cache <- team_canvas_image_cache(); cache$validate <- team_canvas_image
  team_canvas_validate(list(version='1',libraryHidden=FALSE,nodes=list(node)),image_cache=cache)
  invisible()
}
team_plot_instance_prewarm <- function(delay=0.05, defaults=TRUE) {
  sources <- team_plot_instance_prewarm_sources()
  steps <- c(lapply(unname(sources),function(s)function()team_plot_instance_input_ids(s)),
    if (isTRUE(defaults)) lapply(setdiff(names(sources),c('team_cell','results_dashboard')),function(f)function()team_plot_instance_input_defaults(f)),
    function()team_plot_instance_prewarm_validator())
  i <- 0L
  step <- function() {
    i <<- i+1L; if (i>length(steps)) return(invisible())
    tryCatch(steps[[i]](),error=function(e)NULL)
    later::later(step,delay)
  }
  later::later(step,delay)
  invisible(length(steps))
}
# Armed by the Team server when its first session starts (team_frontend_server), never
# while the app is sourced: sourcing leaves the later loop empty, and Classic or tests
# that source the Team files get no timer. Once per process; the steps start `delay`
# seconds later. LIPIDOMIC_TEAM_PREWARM=0 turns it off. Returns whether it scheduled.
team_plot_instance_arm_prewarm <- local({
  armed <- FALSE
  function(delay=1) {
    if (armed || identical(Sys.getenv('LIPIDOMIC_TEAM_PREWARM'),'0') || !requireNamespace('later',quietly=TRUE)) return(invisible(FALSE))
    if (!identical(tryCatch(lipidomic_interface(),error=function(e)''),'team')) return(invisible(FALSE))
    armed <<- TRUE
    later::later(function() team_plot_instance_prewarm(),delay)
    invisible(TRUE)
  }
})
