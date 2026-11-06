# Team Canvas "Group comparison" card (production R/frontends/team/group_comparison.R).
# Its participant-independence helpers (team_group_comparison_participants,
# team_group_comparison_participant_reason, team_group_comparison_guarded_data,
# team_pseudoreplication_recommendation) are in hooks/logratio.R and
# hooks/participant_warning.R.
#
# Production read the log-ratio module's internal processed_db by rewriting the
# body of logratio_server (team_group_comparison_adapter, AST) and guarded the
# shared data twice through team_logratio_unguarded(). Here the module returns
# those values through the named hook "logratio_result" (its last expression;
# Classic keeps the default, which returns NULL and is never used;
# hooks/group_comparison.R), and the guard
# is applied once, inside logratio_server, by the "logratio_shared_data" hook.

# Class labels are presentation metadata; an unmapped subclass remains Other.
team_group_comparison_families <- function(anno, level, label_format, reverse_map, full_name, short_name) {
  families <- list()
  if (!is.data.frame(anno) || !'subclass' %in% names(anno) || !identical(level, 'subclass')) return(families)
  subclasses <- unique(stats::na.omit(as.character(anno$subclass)))
  labels <- if (identical(label_format, 'full')) full_name(subclasses) else short_name(subclasses)
  family_names <- c(GP='Glycerophospholipids', SP='Sphingolipids', GL='Glycerolipids', ST='Sterol Lipids', FA='Fatty Acyls')
  for (i in seq_along(subclasses)) {
    family <- reverse_map[[subclasses[[i]]]]
    if (length(family) == 1L && !is.na(family) && family %in% names(family_names)) families[[labels[[i]]]] <- unname(family_names[[family]])
  }
  families
}

# Bind explicit reference approval to the grouping and comparison strategy.
team_group_comparison_confirmation_token <- function(settings) {
  baseline <- as.character(settings$baseline)
  grouping <- as.character(settings$grouping)
  strategy <- as.character(settings$comparison)
  if(length(baseline)!=1L || is.na(baseline) || !nzchar(baseline) || !length(grouping) || length(strategy)!=1L || is.na(strategy) || !nzchar(strategy)) return(NULL)
  digest::digest(list(baseline=baseline,grouping=grouping,strategy=strategy),algo='sha256')
}
team_group_comparison_palette_context <- function(grouping, strategy) {
  if (!length(grouping)) return('Group1')
  if (length(grouping)==1L) return(grouping[[1L]])
  if (identical(strategy,'Faceted (Intra-group Reference)')) return(tail(grouping,1L))
  paste(grouping,collapse=' & ')
}

# A separate module namespace keeps scientific settings and results independent
# for every Canvas card. The legacy UI is retained in a disclosure so its
# metadata and filtering inputs remain fully available.
team_group_comparison_ui <- function(id) {
  ns <- shiny::NS(id)
  shiny::tagList(
    shiny::tags$div(style='display:none', shiny::textInput(ns('gc_baseline_confirmation'),NULL,value='')),
    shiny::tags$details(class='gc-analysis-settings', shiny::tags$summary('Analysis settings'), logratio_ui(id)),
    plotly::plotlyOutput(ns('comparison_dependency'), height='1px'),
    shiny::uiOutput(ns('comparisonPlot'))
  )
}
team_group_comparison_server <- function(id, shared_data, global_color_map) {
  # logratio_server applies the Team participant guard itself (hook
  # "logratio_shared_data", hooks/logratio.R) and, through the "logratio_result"
  # hook below, returns its prepared data, settings and the guard's reason.
  result <- logratio_server(id, shared_data, global_color_map)
  shiny::moduleServer(id, function(input, output, session) {
    output$comparison_dependency <- plotly::renderPlotly(plotly::plot_ly())
    shiny::observe({
      if (!is.null(input$featureLevel) && !identical(input$featureLevel, 'subclass'))
        shiny::updateSelectInput(session, 'featureLevel', selected='subclass')
    })
    output$comparisonPlot <- shiny::renderUI(shiny::tags$div(class='gc-root', `data-gc-instance`=id,
      shiny::tags$div(class='gc-status',role='status'), shiny::tags$div(class='gc-plot'), shiny::tags$div(class='gc-controls')))
    shiny::observe({
      settings <- result$settings()
      token <- team_group_comparison_confirmation_token(settings)
      confirmed <- !is.null(token) && identical(input$gc_baseline_confirmation,token)
      if (!confirmed) {
        meta <- shared_data$all_metadata(); grouping <- settings$grouping
        if (is.null(meta) || !length(grouping) || !all(grouping %in% names(meta))) return()
        vals <- if (identical(settings$comparison,'Faceted (Intra-group Reference)') && length(grouping)>1L) as.character(meta[[tail(grouping,1L)]]) else apply(meta[,grouping,drop=FALSE],1,paste,collapse='_')
        vals <- unique(vals[!is.na(vals) & nzchar(vals)])
        session$sendCustomMessage('team-group-comparison-data',list(id=id,rows=list(),groups=vals,
          baseline=as.character(settings$baseline),settings=settings,requiresConfirmation=TRUE,confirmationToken=token))
        return()
      }
      inference_allowed <- tryCatch({
        if (!is.function(shared_data$inference_allowed)) NA else isTRUE(shared_data$inference_allowed(FALSE))
      }, error=function(e) NA)
      # The module computed its p-values through the guarded policy, so when the
      # participant check blocks, every p-value it produced (plot, CSV, PDF, ZIP) is NA.
      inference_reason <- if (isTRUE(inference_allowed)) result$participant_reason() else NULL
      if (!is.null(inference_reason)) inference_allowed <- FALSE
      db <- result$processed_db()
      shiny::req(db, db$plot_db)
      d <- db$plot_db
      cols <- intersect(c('Sample','GroupingVal','Feature','Plot_Value','P_Value','Significance','Is_Baseline','X_Grp','Facet_Grp'), names(d))
      d <- as.data.frame(d[,cols,drop=FALSE], stringsAsFactors=FALSE)
      for (nm in names(d)) if (is.factor(d[[nm]])) d[[nm]] <- as.character(d[[nm]])
      for (nm in names(d)) if (is.numeric(d[[nm]])) d[[nm]][!is.finite(d[[nm]])] <- NA_real_
      families <- team_group_comparison_families(shared_data$annotationData(), input$featureLevel,
        input$classLabelFormat, REVERSE_HYPERCLASS_MAP, get_full_class_name, get_short_class_name)
      groups <- as.character(db$ordered_groups)
      context <- team_group_comparison_palette_context(settings$grouping,settings$comparison)
      colors <- rd_team_resolved_condition_colors(groups, rd_value(shared_data$palette_settings), context)
      signature <- digest::digest(list(data=d,settings=settings,inference_allowed=inference_allowed,inference_reason=inference_reason),algo='sha256')
      session$sendCustomMessage('team-group-comparison-data', list(id=id, rows=d,
        groups=groups, baseline=as.character(db$baseline_grp), settings=settings, families=families,
        conditionColors=as.list(colors),requiresConfirmation=FALSE,scienceSignature=signature,
        inferenceAllowed=inference_allowed,inferenceReason=inference_reason))
    })

  })
  invisible(result)
}
