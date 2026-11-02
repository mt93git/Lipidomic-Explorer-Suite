# Team-only access to the existing log-ratio computation.  The adapter returns
# the module's own reactive result; it never duplicates its statistical formulae.
# Fail closed if the shared module's shape changes.
team_group_comparison_adapter <- function(original) {
  stopifnot(is.function(original))
  adapted <- original
  b <- body(adapted)
  if (!is.call(b) || !identical(b[[1L]], as.name('{')) || length(b) != 2L ||
      !is.call(b[[2L]]) || !identical(b[[2L]][[1L]], as.name('moduleServer')) ||
      length(b[[2L]]) != 3L || !is.call(b[[2L]][[3L]]) ||
      !identical(b[[2L]][[3L]][[1L]], as.name('function'))) {
    stop('Group comparison adapter requires review: logratio server shape changed.', call. = FALSE)
  }
  module <- b[[2L]][[3L]]
  inner <- module[[3L]]
  if (!is.call(inner) || !identical(inner[[1L]], as.name('{'))) stop('Invalid logratio module body.', call. = FALSE)
  assignments <- Filter(function(x) is.call(x) && identical(x[[1L]], as.name('<-')) &&
                          is.symbol(x[[2L]]) && identical(as.character(x[[2L]]), 'processed_db'), as.list(inner))
  if (length(assignments) != 1L) stop('Group comparison adapter requires exactly one processed_db.', call. = FALSE)
  inner[[length(inner) + 1L]] <- quote(list(processed_db = processed_db,
    settings = shiny::reactive({
      method <- input$localStatMethod %||% 'auto'
      resolved <- if (identical(method, 'auto')) shared_data$actual_de_method() else if (identical(method, 'parametric')) 'limma' else 'non_parametric'
      actual <- sub('^auto_', '', as.character(resolved)[1L])
      list(method = method, resolved_method = resolved,
        comparison = input$comparisonStrategy, baseline = input$selectedBaseline,
        scale = input$scaleMode, significance = input$sigDisplayType,
        grouping = input$groupingMetadata, feature_level = input$featureLevel,
        classLabelFormat = input$classLabelFormat, additiveFiltering = input$additiveFiltering,
        adv_sat = input$adv_sat, adv_len = input$adv_len, gran_activate = input$gran_activate,
        gran_use1 = input$gran_use1, gran_use2 = input$gran_use2, gran_nC1 = input$gran_nC1,
        gran_nC2 = input$gran_nC2, gran_DB1 = input$gran_DB1, gran_DB2 = input$gran_DB2, gran_order = input$gran_order,
        test = if (identical(actual, 'non_parametric')) 'Wilcoxon rank-sum' else "Student's t-test (equal variance)",
        correction = 'none')
    })))
  module[[3L]] <- inner
  b[[2L]][[3L]] <- module
  body(adapted) <- b
  adapted
}

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
  guarded <- team_group_comparison_guarded_data(shared_data)
  result <- team_group_comparison_adapter(team_logratio_unguarded(logratio_server))(id, guarded, global_color_map)
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
      inference_reason <- if (isTRUE(inference_allowed)) guarded$participant_reason() else NULL
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

# Participant independence over the compared samples, reusing Violin statistics'
# rules (PatientNumber, else Patient_ID; repeated, incomplete or ambiguous IDs block).
team_group_comparison_participants <- function(shared_data, samples) {
  df <- tryCatch(shared_data$data_processed(), error = function(e) NULL)
  meta <- tryCatch(shared_data$all_metadata(), error = function(e) NULL)
  # Participants do not depend on lipids; a one-lipid selection must still be checked.
  if (is.data.frame(df) && nrow(df) == 1L) df <- df[c(1L, 1L), , drop = FALSE]
  base <- tryCatch(team_violin_stats_base(df, meta, "Group1"), error = function(e) NULL)
  if (is.null(base) || !length(samples)) return(list(status = "unknown", reason = NULL))
  base$group <- ifelse(base$samples %in% samples, "compared", "other")
  team_violin_stats_participants(base, "compared")
}

# The log-ratio module compares every prepared sample that has metadata and gets
# each p-value from shared_data$inference_allowed. Giving it a copy whose unpaired
# policy also requires participant independence withholds p-values in every output
# it produces (plot data, CSV, PDF and ZIP exports), not only on the Canvas card.
team_group_comparison_guarded_data <- function(shared_data) {
  policy <- shared_data$inference_allowed
  if (!is.function(policy)) return(shared_data)
  compared <- function() {
    df <- shared_data$data_processed(); meta <- shared_data$all_metadata()
    if (!is.data.frame(df) || !is.data.frame(meta) || !'FullName' %in% names(meta)) return(character())
    intersect(setdiff(colnames(df), 'Lipid_Name'), as.character(meta$FullName))
  }
  reason <- shiny::reactive(tryCatch(team_group_comparison_participants(shared_data, compared())$reason, error = function(e) NULL))
  guarded <- shared_data
  guarded$participant_reason <- function() reason()
  guarded$inference_allowed <- function(paired = FALSE) {
    if (!isTRUE(policy(paired = paired))) return(FALSE)
    isTRUE(paired) || is.null(reason())
  }
  guarded
}

# The original log-ratio card ("Violin Plots · Logratio", restored from older
# checkpoints and created from the catalog) runs the same module, so in Team it
# receives the same guarded policy. Group comparison rewrites the module body and
# therefore starts from the unguarded function, which it guards itself.
team_logratio_participant_guard_adapter <- function(original) {
  stopifnot(is.function(original))
  guarded <- function(id, shared_data, global_color_map) {
    original(id, team_group_comparison_guarded_data(shared_data), global_color_map)
  }
  attr(guarded, 'team_unguarded') <- original
  guarded
}
team_logratio_unguarded <- function(server) attr(server, 'team_unguarded') %||% server
