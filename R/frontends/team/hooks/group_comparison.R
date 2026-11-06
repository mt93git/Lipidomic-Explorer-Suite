# Team implementation of the "logratio_result" hook (R/modules/9_logratio_module.R,
# last expression of the module). Replaces production's AST adapter
# team_group_comparison_adapter (R/frontends/team/group_comparison.R).
# Team access to the existing log-ratio computation: the module's own reactive
# result plus the settings Group comparison reports. No statistical formula is
# duplicated. `shared_data` is the guarded copy the module computed with.
team_logratio_result <- function(result, input, shared_data, processed_db, ...) {
  list(processed_db = processed_db,
    participant_reason = function() if (is.function(shared_data$participant_reason)) shared_data$participant_reason() else NULL,
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
    }))
}
lipidomic_hook_register("logratio_result", team_logratio_result)
