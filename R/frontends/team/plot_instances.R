# Team canvas copies are real scientific modules with a private input namespace.
# The shared prepared matrix remains authoritative; only view controls are local.
team_plot_instance_families <- list(
  results_dashboard = list(ui = 'results_dashboard_ui', server = 'results_dashboard_module_server', outputs = c('plot_pca','plot_violin','plot_dist','plot_comp','plot_heat')),
  qc_pca_tab = list(ui='qc_boxplot_ui',server='qc_boxplot_server',colors=TRUE,outputs=c('boxplotAfterNorm','outlierPlot','pca2dPlot','pca2dVectorPlot','pca3dPlot','load2dPlot','load2dVectorPlot','load3dPlot','sampleCorrPlot','bqcPlot','bqcDeviationPlot','bqcAbundancePlot','outlierPcaPlot','guided_qc_plot')),
  barchart = list(ui='barchart_ui',server='barchart_server',colors=TRUE,outputs=c('barPlotUnfiltered','barPlotFiltered','donutPlotUnfiltered','donutPlotFiltered')),
  heatmap_barchart_tab = list(ui='heatmap_ui',server='heatmap_server',outputs=c('heatmapPlot','heatmapSDPlot','filteredHeatmapPlot','filteredHeatmapSDPlot','violin_plot_render')),
  volcano_tab=list(ui='volcano_ui',server='volcano_server',outputs='volcanoPlot'),
  lsea_tab=list(ui='lsea_ui',server='lsea_server',outputs='lseaPlot'),
  structural_tab=list(ui='structural_ui',server='structural_server',colors=TRUE,outputs=c('summaryPlot','speciesPlotPlot','networkPlot','propPlotPlot','diffAcylPlot')),
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
team_plot_instance_dynamic_ids <- function(family) {
  files <- c(results_dashboard='R/results_dashboard.R',qc_pca_tab='R/modules/2_qc_boxplot_module.R',barchart='R/modules/5_barchart_module.R',heatmap_barchart_tab='R/modules/4_heatmap_module.R',volcano_tab='R/modules/6_volcano_module.R',lsea_tab='R/modules/7_lsea_module.R',structural_tab='R/modules/8_structural_module.R',structural_grid_tab='R/modules/12_structural_grid_module.R',logratio_tab='R/modules/9_logratio_module.R',fla_tab='R/modules/10_fla_module.R',longitudinal_tab='R/modules/11_longitudinal_module.R',pathway_tab='R/modules/13_pathway_module.R',cellular_org_tab='R/modules/14_cellular_org_module.R')
  controls <- c('selectInput','selectizeInput','numericInput','textInput','textAreaInput','sliderInput','radioButtons','checkboxInput','checkboxGroupInput','dateInput','dateRangeInput','colourInput')
  paths <- if (identical(family,'group_comparison_tab')) c(files[['logratio_tab']],'R/frontends/team/group_comparison.R') else files[[family]]
  text <- paste(unlist(lapply(paths,readLines,warn=FALSE),use.names=FALSE),collapse='\n')
  pattern <- paste0('(?:',paste(controls,collapse='|'),')\\s*\\(\\s*(?:inputId\\s*=\\s*)?(?:session\\$)?ns\\(\\s*[\"\']([A-Za-z][A-Za-z0-9_]{0,99})[\"\']')
  matches <- regmatches(text,gregexpr(pattern,text,perl=TRUE))[[1L]]
  unique(sub('.*ns\\(\\s*[\"\']([^\"\']+)[\"\']$','\\1',matches,perl=TRUE))
}
team_plot_instance_input_ids <- local({
  cache <- new.env(parent=emptyenv())
  function(source) {
    family <- team_plot_instance_source(source)$family
    if (exists(family,cache,inherits=FALSE)) return(get(family,cache))
    spec <- if (identical(family,'team_cell')) list(ui='team_cell_instance_ui') else team_plot_instance_families[[family]]
    ui <- get(spec$ui,mode='function')('tcinstance_schema')
    if (identical(family,'structural_tab')) ui <- shiny::tagList(ui,structural_proportions_ui('tcinstance_schema'))
    doc <- xml2::read_html(htmltools::renderTags(ui)$html)
    fields <- xml2::xml_find_all(doc,"//select[@id] | //textarea[@id] | //input[@id and not(@type='file') and not(@type='button') and not(@type='submit')] | //*[@id and (contains(concat(' ',@class,' '),' shiny-input-radiogroup ') or contains(concat(' ',@class,' '),' shiny-input-checkboxgroup ') or contains(concat(' ',@class,' '),' shiny-tab-input '))]")
    ids <- xml2::xml_attr(fields,'id');ids <- substring(ids[startsWith(ids,'tcinstance_schema-')],19L)
    ids <- unique(c(ids,if (!identical(family,'team_cell')) team_plot_instance_dynamic_ids(family) else character()))
    ids <- unique(ids[grepl('^[A-Za-z][A-Za-z0-9_]{0,99}$',ids)])
    assign(family,ids,cache);ids
  }
})
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
team_dashboard_instance_input <- function(input) structure(list(input=input,defaults=team_dashboard_input_defaults()),class='team_dashboard_instance_input')
`$.team_dashboard_instance_input` <- function(x, name) {
  value <- .subset2(x,'input')[[name]]
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
team_plot_instances_server <- function(input, output, session, shared_data, dashboard_data) {
  active <- new.env(parent=emptyenv())
  settling <- new.env(parent=emptyenv())
  stop_settling <- function(id) {
    if (!exists(id,settling,inherits=FALSE)) return(invisible())
    entry <- get(id,settling);if (!is.null(entry$watcher)) entry$watcher$destroy()
    entry$watcher <- NULL;assign(id,entry,settling);invisible()
  }
  insert_host <- function(id, resolved, spec) {
    ui <- get(spec$ui,mode='function')(id)
    if (identical(resolved$family,'structural_tab')) ui <- shiny::tagList(ui,structural_proportions_ui(id))
    shiny::insertUI(selector='body',where='beforeEnd',ui=shiny::tags$div(id=paste0(id,'_host'),class='tc-instance-host',`data-instance-id`=id,`aria-hidden`='true',inert='',style='position:absolute;left:-100000px;top:0;width:900px',ui),immediate=TRUE,session=session)
  }
  create <- function(value) {
    value <- team_plot_instance_validate(value)
    resolved <- team_plot_instance_source(value$source); spec <- resolved$spec; id <- value$id
    if (!exists(id,active,inherits=FALSE)) {
      if(length(ls(active))>=160L)stop('This session has created 160 independent plots. Save the workspace and reopen it to continue.',call.=FALSE)
      insert_host(id, resolved, spec)
      result <- NULL
      if (identical(resolved$family,'results_dashboard')) {
        dashboard <- shiny::moduleServer(id,function(input,output,session) results_dashboard_module_server(team_dashboard_instance_input(input),output,session,dashboard_data))
      } else {
        args <- list(id=id,shared_data=shared_data)
        if (isTRUE(spec$colors)) args$global_color_map <- shiny::reactive(shared_data$color_maps())
        result <- do.call(get(spec$server,mode='function'),args)
      }
      assign(id,list(source=value$source,dashboard=if(identical(resolved$family,'results_dashboard'))dashboard else NULL,result=result,parked=FALSE),active)
    } else if (!identical(get(id,active)$source,value$source)) stop('Canvas instance namespace already belongs to another plot.',call.=FALSE)
    else if (isTRUE(get(id,active)$parked)) { entry <- get(id,active); insert_host(id,resolved,spec); entry$parked <- FALSE; assign(id,entry,active) }
    # A restored workspace can be hidden while preparation completes. Keep only
    # this instance's selected output active, so its pending render is delivered
    # even when the browser last reported the parked source as hidden. Sibling
    # family outputs retain Shiny's normal suspension policy.
    shiny::outputOptions(output,paste0(id,'-',resolved$output),suspendWhenHidden=FALSE)
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
        ok <- all(vapply(names(expected),function(key)same(input[[paste0(id,'-',key)]],expected[[key]]),logical(1)))
        if (ok) { session$sendCustomMessage('team-canvas-instance-settled',list(id=id,generation=generation));stop_settling(id) }
      },priority=-100)
      assign(id,list(generation=generation,watcher=watcher),settling)
    } else {
      assign(id,list(generation=generation,watcher=NULL),settling)
      session$sendCustomMessage('team-canvas-instance-settled',list(id=id,generation=generation))
    }
    # Send within the current reactive flush. A message enqueued from onFlushed
    # can otherwise wait indefinitely for an unrelated subsequent flush.
    session$sendCustomMessage('team-canvas-instance-ready',c(value,list(allowedInputs=team_plot_instance_input_ids(value$source),generation=generation)))
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
    shiny::removeUI(selector=paste0('#',id,'_host'),immediate=TRUE,session=session)
    entry$parked <- TRUE; assign(id,entry,active); stop_settling(id)
  },ignoreInit=TRUE)
  session$userData$team_canvas_instances_create <- create
  shiny::observeEvent(input$team_canvas_instance_create,{
    request <- input$team_canvas_instance_create
    tryCatch({
      allowed <- team_plot_instance_input_ids(request$source)
      request$inputs <- request$inputs[names(request$inputs) %in% allowed]
      create(request)
    },error=function(e)session$sendCustomMessage('team-canvas-instance-error',list(id=if(is.list(request))request$id else NULL,message=conditionMessage(e))))
  },ignoreInit=TRUE)
  # Violin statistics read only this session's registered independent copies.
  if (exists('team_violin_stats_server',mode='function'))
    team_violin_stats_server(input,session,dashboard_data,function(id) if (exists(id,active,inherits=FALSE)) get(id,active) else NULL)
  invisible(create)
}
