# R/modules/9_logratio_module.R
# Violin Plots Module

logratio_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 300,
        h5("Violin Plots", class="mt-2 text-primary"),
        p(class="text-muted small", "Computes Log2FC of structural proportions relative to a selected Baseline Group."),
        accordion(
          open = "0. Nomenclature", multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          )
        ),
        hr(),
        selectizeInput(ns("groupingMetadata"), 
                       tags$span("Primary Grouping (Order matters):", 
                                 bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                                "Order defines the grouping hierarchy: the first variable splits the violin charts (x-axis), while subsequent variables define sub-groupings/facets. Drag and drop to rearrange.")), 
                     choices = c("Group1", "Group2"), 
                     selected = NULL, 
                     multiple = TRUE, 
                     options = list(plugins = list('drag_drop'))),
        
        radioButtons(ns("comparisonStrategy"), tags$span("Comparison Strategy:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Determines if values are plotted raw, compared directly, or normalized against a baseline group.")), 
                     choices = c("Global (Combined Reference)", "Faceted (Intra-group Reference)"), 
                     selected = "Faceted (Intra-group Reference)"),
        
    # 2. Baseline Group Picker
        uiOutput(ns("baselineSelectorUI")),
        
        hr(),
        
    # 3. Aggregation/Feature Level
        
        radioButtons(ns("additiveFiltering"), tags$span("Additive Filtering:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Filters out lipids with low variance or low abundance to focus on responsive species.")), 
                     choices = c("None" = "none",
                                 "Advanced Filters (Length & Sat)" = "advanced", 
                                 "Granular Chain Filters (Carbons:Bonds)" = "granular"), 
                     selected = "none"),
        
        conditionalPanel(
           condition = paste0("input['", ns("additiveFiltering"), "'] == 'advanced'"),
           checkboxGroupInput(ns("adv_sat"), "Saturation:", choices = c("SFA", "MUFA", "PUFA"), selected = character(0), inline = TRUE),
           checkboxGroupInput(ns("adv_len"), "Length:", choices = c("SCFA", "MCFA", "LCFA", "VLCFA"), selected = character(0), inline = TRUE)
         ),
        
        conditionalPanel(
           condition = paste0("input['", ns("additiveFiltering"), "'] == 'granular'"),
           checkboxInput(ns("gran_activate"), "Activate", FALSE),
           conditionalPanel(
               condition = paste0("input['", ns("gran_activate"), "'] == true"),
               checkboxInput(ns("gran_use1"), "Combo 1", TRUE),
               conditionalPanel(
                   condition = paste0("input['", ns("gran_use1"), "'] == true"),
                   sliderInput(ns("gran_nC1"), "Chain Length Range:", min=0, max=60, value=c(16, 18), step=1),
                   sliderInput(ns("gran_DB1"), "Double Bond Range:", min=0, max=12, value=c(0, 1), step=1)
               ),
               checkboxInput(ns("gran_use2"), "Combo 2", FALSE),
               conditionalPanel(
                   condition = paste0("input['", ns("gran_use2"), "'] == true"),
                   sliderInput(ns("gran_nC2"), "Chain Length Range:", min=0, max=60, value=c(16, 22), step=1),
                   sliderInput(ns("gran_DB2"), "Double Bond Range:", min=0, max=12, value=c(2, 6), step=1)
               ),
               radioButtons(ns("gran_order"), "Logic:", choices = c("Ignore Order" = "ignore", "Respect Order" = "respect"), selected="ignore")
           )
        ),
        
        hr(),
        radioButtons(ns("localStatMethod"), "Statistical Mode Choice:",
                     choices = c("Automatic mode" = "auto", 
                                 "Parametric (t-test)" = "parametric", 
                                 "Non-Parametric (Wilcoxon)" = "non_parametric"),
                     selected = "auto"),
        hr(),
        sliderInput(ns("plotZoom"), "Viewport Zoom %:", min=10, max=200, value=30, step=1),
        radioButtons(ns("scaleMode"), tags$span("Measurement Scale:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Toggles between Log2 values (useful for relative fold changes) and linear values (useful for absolute abundances).")), 
                     choices = c("Log2 Fold Change" = "log2fc", 
                                 "Fold Change (Linear)" = "fc", 
                                 "Proportion Difference" = "delta"), 
                     selected = "log2fc"),
        checkboxInput(ns("showBaseline"), "Show Baseline (Y=0) Line", value = FALSE),
        
    # 4. View options
        checkboxInput(ns("showSignificantOnly"), "Show only significant features", value = FALSE),
        checkboxInput(ns("shortYAxis"), "Use Short Y-axis Title", value = TRUE),
        radioButtons(ns("sigDisplayType"), "Significance Label Format:",
                     choices = c("Star" = "star", "P-value" = "pvalue"),
                     selected = "star"),
        uiOutput(ns("featureLevelUI")),
        uiOutput(ns("featurePickerUI")),
        
        hr(),
        hr(),
        h6("Batch Exports: Lipid Category"),
        downloadButton(ns("downloadAllMacroZip"), "Download All PDFs (ZIP)", class="btn-info w-100 mb-1"),
        downloadButton(ns("downloadAllMacroCsv"), "Download Dataset (CSV)", class="btn-info w-100 mb-2"),
        
        h6("Batch Exports: Lipid Main Class"),
        downloadButton(ns("downloadAllSubclassZip"), "Download All PDFs (ZIP)", class="btn-warning w-100 mb-1"),
        downloadButton(ns("downloadAllSubclassCsv"), "Download Dataset (CSV)", class="btn-warning w-100"),
        hr(),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      
   # MAIN PLOT AREA
      jqui_resizable(div(style = "min-height: 40vh; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Violin Plots",
          subtitle = "This module visualizes the probability density and distribution of individual lipid species across different conditions:",
          bullets = list(
            tags$li(tags$strong("Distribution Probability:"), " Inspect abundance variation, dispersion, and medians for selected lipid species across sample groups."),
            tags$li(tags$strong("Baseline Comparison:"), " Calculate and plot log2 fold changes relative to a selected control or reference group.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        div(
          class = "quick-access-strip mb-2.5",
          tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
            title = "Bottom Menu: Configure Factor Level Ordering and Custom Plot Colors below plot",
            icon("layer-group"), tags$strong("Bottom Menu: Advanced Aesthetics")
          )
        ),
        card(
          style = "height: 100%; min-height: 40vh;",
          card_header(
            class = "d-flex justify-content-between align-items-center",
            uiOutput(ns("dynamicPlotTitle"), inline=TRUE),
            tags$div(
              downloadButton(ns("downloadCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
              downloadButton(ns("downloadPlot"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
            )
          ),
          card_body(
             uiOutput(ns("baseline_status_banner")),
             tags$div(
                style = "width: 100%; height: 100%; overflow: auto; border: 1px solid #e9ecef; background: #fff; padding: 10px;",
                uiOutput(ns("scrollable_plot_ui"))
             ),
             uiOutput(ns("violin_stat_note"))
          )
        )
      ), options = list(handles = "s, se")),
      
   # ADVANCED AESTHETICS RIBBON
      accordion(
         open = FALSE,
         accordion_panel(
            title = "Advanced Aesthetics & Ordering",
            icon = icon("sliders"),
            layout_columns(
               col_widths = c(6, 6),
               
        # Left: Ordering
               card(
                  card_header(icon("sort"), " Factor Level Ordering"),
                  card_body(
                     p(class="text-muted small", HTML("Select a metadata variable to manually order its levels from left-to-right on the plots.<br><b>TIP:</b> To avoid overload, finetune the plot on a small amount of violins (Changes on a high number of plots will process longer than on a small number).")),
                     selectInput(ns("order_target_var"), "Target Variable:", choices=NULL, width="100%"),
                     uiOutput(ns("level_order_ui"))
                  )
               ),
               
        # Right: Colors
               card(
                  card_header(icon("palette"), " Custom Plot Colors"),
                  card_body(
                     p(class="text-muted small", "Target a specific dimension to define the Violin fill colors mapping override."),
                      selectInput(ns("color_target_var"), "Target Variable (Fill By):", choices=NULL, width="100%"),
                      uiOutput(ns("dynamic_colors_ui")),
                      actionButton(ns("btn_apply_violin_colors"), "Apply Colors to Violins", icon = icon("palette"), class = "btn-success btn-apply-colors w-100 mt-2")
                   )
                )
            )
         )
      )
    )
  )
}

logratio_server <- function(id, shared_data, global_color_map) {
  moduleServer(id, function(input, output, session) {
    
  # --- 1. Reactives for Metadata & Grouping ---
    
    current_meta <- reactive({
      req(shared_data$all_metadata())
      shared_data$all_metadata()
    })
    
    output$featureLevelUI <- renderUI({
       am <- shared_data$analysisMode()
              if (!is.null(am) && am == "Global Lipidomics") {
            choices <- c("Lipid Category" = "macro", "Lipid Main Class" = "subclass")
        } else {
            choices <- c("Immune Role" = "macro", "Lipid Main Class" = "subclass")
        }
       
       curr_sel <- isolate(input$featureLevel)
       default_sel <- "macro"
       if (!is.null(curr_sel) && curr_sel %in% choices) {
           default_sel <- curr_sel
       }
       
       radioButtons(session$ns("featureLevel"), "Analyze Features At:", 
                    choices = choices, 
                    selected = default_sel)
    })
    
  # Memory Cache for Level Ordering & Grouping Tracking
    level_prefs <- reactiveValues()
    prev_grouping <- reactiveVal(NULL)
    
  # Dynamically update groupingMetadata choices with informative condition labels
    observe({
      meta <- shared_data$all_metadata()
      req(meta)
      valid_cols <- c("Group1")
      if ("Group2" %in% names(meta)) {
        g2_clean <- meta$Group2[!is.na(meta$Group2) & nzchar(meta$Group2) & meta$Group2 != "Unspecified"]
        if (length(unique(g2_clean)) > 0) valid_cols <- c(valid_cols, "Group2")
      }
      choices <- get_metadata_group_named_choices(valid_cols, meta)
      curr_sel <- isolate(input$groupingMetadata)
      selected <- determine_active_grouping_selection(meta, valid_cols, curr_sel)
      updateSelectizeInput(session, "groupingMetadata", choices = choices, selected = selected)
    })
    
  # Dynamically expose the currently active grouping columns to both Order and Color Ribbons
    observe({
      if (isolate(shared_data$is_restoring())) return()
      val <- input$groupingMetadata
      req(length(val) > 0)
      strat <- input$comparisonStrategy
      meta <- shared_data$all_metadata()
      req(meta)
      
      choices <- val
      if (length(val) > 1) {
        choices <- c(choices, "Combined_Grouping")
      }
      labels <- sapply(choices, function(c) {
        if (c == "Combined_Grouping") get_metadata_group_label("Group1_Group2", meta)
        else get_metadata_group_label(c, meta)
      })
      named_choices <- setNames(choices, labels)
      
      # Determine default active color and order based on Primary Grouping and strategy
      default_color <- if (length(val) > 1) {
        if (!is.null(strat) && strat == "Faceted (Intra-group Reference)") val[length(val)] else "Combined_Grouping"
      } else {
        val[1]
      }
      
      default_order <- if (length(val) > 1 && !is.null(strat) && strat == "Faceted (Intra-group Reference)") val[length(val)] else val[1]
      
      curr_order <- isolate(input$order_target_var)
      curr_color <- isolate(input$color_target_var)
      last_val <- isolate(prev_grouping())
      
      # When grouping changes, adapt color and order to the active Primary Grouping and flush stale custom palette
      grouping_changed <- is.null(last_val) || !identical(val, last_val)
      if (grouping_changed) {
        sel_order <- default_order
        sel_color <- default_color
        applied_violin_colors(NULL)
        prev_grouping(val)
      } else {
        sel_order <- if (!is.null(curr_order) && curr_order %in% choices) curr_order else default_order
        sel_color <- if (!is.null(curr_color) && curr_color %in% choices) curr_color else default_color
      }
      
      updateSelectInput(session, "order_target_var", choices = named_choices, selected = sel_order)
      updateSelectInput(session, "color_target_var", choices = named_choices, selected = sel_color)
    })
    
  # 1. Level Sequencer (sortable rank_list)
    output$level_order_ui <- renderUI({
       target <- input$order_target_var
       req(target)
       meta <- shared_data$all_metadata()
       req(meta)
       
       if (target == "Combined_Grouping") {
           grp_cols <- input$groupingMetadata
           req(length(grp_cols) > 1)
           comb_vals <- apply(meta[, grp_cols, drop=FALSE], 1, paste, collapse = "_")
           default_levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != ""]))
       } else if (target %in% colnames(meta)) {
           default_levels <- sort(unique(meta[[target]]))
       } else {
           return(NULL)
       }
       
       pref <- isolate(level_prefs[[target]])
       if (is.null(pref)) {
           pref <- shared_data$saved_level_prefs()[[target]]
       }
       if(!is.null(pref)) {
           if(all(default_levels %in% pref)) {
               existing_ordered <- intersect(pref, default_levels)
               new_items <- setdiff(default_levels, pref)
               final_levels <- c(existing_ordered, new_items)
           } else {
               final_levels <- default_levels
           }
       } else {
           final_levels <- default_levels
       }
       
       sortable::rank_list(
           text = NULL,
           labels = final_levels,
           input_id = session$ns("manual_level_order")
       )
    })
    
    observeEvent(input$manual_level_order, {
       req(input$order_target_var)
       level_prefs[[input$order_target_var]] <- input$manual_level_order
    })
    
  # 2. Dynamic Plot Colors (colourpicker loop)
    output$dynamic_colors_ui <- renderUI({
       target <- input$color_target_var
       req(target)
       meta <- shared_data$all_metadata()
       req(meta)
       
       if (target == "Combined_Grouping") {
           grp_cols <- input$groupingMetadata
           req(length(grp_cols) > 1)
           comb_vals <- apply(meta[, grp_cols, drop=FALSE], 1, paste, collapse = "_")
           levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != ""]))
       } else if (target %in% colnames(meta)) {
           levels <- sort(unique(meta[[target]]))
       } else {
           return(NULL)
       }
       
    # Use global maps natively assigned or algorithmically bridge
       base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[target]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[target]], error = function(e) NULL)
       if (is.null(base_map)) {
          pal <- RColorBrewer::brewer.pal(min(9, max(3, length(levels))), "Set1")
          if(length(levels) > length(pal)) pal <- colorRampPalette(pal)(length(levels))
          base_map <- stats::setNames(pal[1:length(levels)], levels)
       }
       
       ns <- session$ns
       lapply(levels, function(lvl) {
          safe_col <- gsub("[^A-Za-z0-9]", "", target)
          safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
          id <- paste0("cp_", safe_col, "_", safe_lvl)
          
          cur_val <- input[[id]]
          saved_val <- shared_data$get_restored_input(ns(id), base_map[lvl])
          def_val <- if(!is.null(cur_val)) cur_val else saved_val
          
          div(style="display:inline-block; margin-right:5px; margin-bottom: 5px;",
              colourpicker::colourInput(ns(id), lvl, value = def_val, showColour="both", width="100px")
          )
       }) %>% div(class="d-flex flex-wrap", .)
    })
    
    output$baselineSelectorUI <- renderUI({
      selectizeInput(session$ns("selectedBaseline"), 
                     tags$span("Reference Baseline:", 
                               bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                              "Select one or more group levels to serve as the baseline. Violin plots will represent the Log2 Fold Change of each group relative to this baseline's average.")), 
                     choices = NULL, 
                     selected = NULL,
                     multiple = TRUE)
    })
    outputOptions(output, "baselineSelectorUI", suspendWhenHidden = FALSE)
    
    observe({
        meta <- shared_data$all_metadata()
        val <- input$groupingMetadata
        req(length(val) > 0)
        
        if (input$comparisonStrategy == "Global (Combined Reference)" || length(val) == 1) {
           if (length(val) == 1) {
              choices <- unique(meta[[val]])
           } else {
              choices <- apply(meta[, val, drop=FALSE], 1, paste, collapse="_")
              choices <- unique(choices)
           }
        } else {
           x_col <- val[length(val)]
           choices <- unique(meta[[x_col]])
        }
        
        choices <- sort(choices[!is.na(choices) & choices != ""])
        
        curr_sel <- input$selectedBaseline
        valid_sel <- intersect(curr_sel, choices)
        sel <- if (length(valid_sel) > 0) valid_sel else (if (length(choices) > 0) choices[1] else NULL)
        
        updateSelectizeInput(session, "selectedBaseline", choices = choices, selected = sel)
    })
    
  # --- 2. Data Transformation (Proportions & L2FC) ---
    
    build_db_for_level <- function(feat_level, add_filter = "none") {
      req(shared_data$data_processed(), shared_data$annotationData())
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0) return(NULL)
      req(input$scaleMode)
      req(length(input$groupingMetadata) > 0)
      
      local_method <- input$localStatMethod %||% "auto"
      resolved_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      
      df_processed <- shared_data$data_processed()
      anno <- shared_data$annotationData()
      meta_df <- shared_data$all_metadata()
      
   # Filter samples that are in the metadata and numeric columns
      samp_cols <- setdiff(colnames(df_processed), "Lipid_Name")
      samp_cols <- intersect(samp_cols, meta_df$FullName)
      req(length(samp_cols) >= 2)
      
   # Join processed data with metadata to create combined grouping values
      df_anno <- df_processed %>%
        dplyr::select(Lipid_Name, dplyr::all_of(samp_cols)) %>%
        dplyr::left_join(anno, by = "Lipid_Name")
      
   # 2. Determine macroscopic groups function (similar to script 69)
      str_to_macro <- function(class_token, analysisMode, immune_role) {
        if (analysisMode == "Global Lipidomics") {
           hyper <- REVERSE_HYPERCLASS_MAP[[class_token]]
           if (!is.null(hyper)) {
               return(switch(hyper,
                 "GP" = "Glycerophospholipids",
                 "SP" = "Sphingolipids",
                 "GL" = "Glycerolipids",
                 "ST" = "Sterol Lipids",
                 "FA" = "Fatty Acyls",
                 "Other"
               ))
           }
        } else {
      # Lipid Mediator macroscopic grouping based on origin or immune role
           if (!is.na(immune_role) && immune_role != "None" && immune_role != "Unknown") return(immune_role)
        }
        return("Other")
      }
      
      analysisMode <- shared_data$analysisMode() %||% "Global Lipidomics"
      
      filter_tags <- c()
      if (add_filter == "advanced") {
          sat_tags <- input$adv_sat
          len_tags <- input$adv_len
          if (!is.null(sat_tags) && length(sat_tags) > 0) {
             req_cols <- paste0("Has_", sat_tags)
             valid_cols <- intersect(req_cols, names(df_anno))
             if(length(valid_cols) > 0) {
                sat_mat <- as.matrix(df_anno[, valid_cols, drop=FALSE])
                df_anno <- df_anno[rowSums(sat_mat, na.rm=TRUE) > 0, ]
             }
             filter_tags <- c(filter_tags, sat_tags)
          }
          if (!is.null(len_tags) && length(len_tags) > 0) {
             req_cols <- paste0("Has_", len_tags)
             valid_cols <- intersect(req_cols, names(df_anno))
             if(length(valid_cols) > 0) {
                len_mat <- as.matrix(df_anno[, valid_cols, drop=FALSE])
                df_anno <- df_anno[rowSums(len_mat, na.rm=TRUE) > 0, ]
             }
             filter_tags <- c(filter_tags, len_tags)
          }
      } else if (add_filter == "granular" && isTRUE(input$gran_activate)) {
          cond1A <- FALSE; cond1B <- FALSE; cond2A <- FALSE; cond2B <- FALSE
          if (isTRUE(input$gran_use1)) {
              cond1A <- tidyr::replace_na(dplyr::between(df_anno$nCchain1, input$gran_nC1[1], input$gran_nC1[2]) & dplyr::between(df_anno$DBchain1, input$gran_DB1[1], input$gran_DB1[2]), FALSE)
              cond1B <- tidyr::replace_na(dplyr::between(df_anno$nCchain2, input$gran_nC1[1], input$gran_nC1[2]) & dplyr::between(df_anno$DBchain2, input$gran_DB1[1], input$gran_DB1[2]), FALSE)
              filter_tags <- c(filter_tags, paste0("C1:", paste(input$gran_nC1, collapse="-"), "_DB:", paste(input$gran_DB1, collapse="-")))
          }
          if (isTRUE(input$gran_use2)) {
              cond2A <- tidyr::replace_na(dplyr::between(df_anno$nCchain1, input$gran_nC2[1], input$gran_nC2[2]) & dplyr::between(df_anno$DBchain1, input$gran_DB2[1], input$gran_DB2[2]), FALSE)
              cond2B <- tidyr::replace_na(dplyr::between(df_anno$nCchain2, input$gran_nC2[1], input$gran_nC2[2]) & dplyr::between(df_anno$DBchain2, input$gran_DB2[1], input$gran_DB2[2]), FALSE)
              filter_tags <- c(filter_tags, paste0("C2:", paste(input$gran_nC2, collapse="-"), "_DB:", paste(input$gran_DB2, collapse="-")))
          }
          passing_indices <- if (isTRUE(input$gran_use1) && isTRUE(input$gran_use2)) {
             if (input$gran_order == "respect") cond1A & cond2B else (cond1A & cond2B) | (cond2A & cond1B)
          } else if (isTRUE(input$gran_use1)) {
             if (input$gran_order == "respect") cond1A else cond1A | cond1B
          } else if (isTRUE(input$gran_use2)) {
             if (input$gran_order == "respect") cond2B else cond2A | cond2B
          } else { rep(TRUE, nrow(df_anno)) }
          df_anno <- df_anno[passing_indices, ]
      }
      
   # Terminate downstream crashes explicitly if additive subsets are fully empty!
      req(nrow(df_anno) > 0)
      
   # Build dynamic structural aggregations
      df_anno <- df_anno %>%
        dplyr::rowwise() %>%
        dplyr::mutate(
           Macro_Group = str_to_macro(subclass, analysisMode, if("Immune_Role" %in% names(.)) Immune_Role else NA),
           Base_Feature = if(feat_level == "macro") Macro_Group else if(feat_level == "origin") Biosynthetic_Origin else if(feat_level == "individual") Lipid_Name else subclass
        ) %>%
        dplyr::ungroup()
        
      if (input$classLabelFormat == "full") {
        df_anno$Base_Feature <- get_full_class_name(df_anno$Base_Feature)
      } else {
        df_anno$Base_Feature <- get_short_class_name(df_anno$Base_Feature)
      }
      
      df_anno <- df_anno %>%
        dplyr::mutate(
           Final_Feature = if(length(filter_tags) > 0) paste0(Base_Feature, " (", paste(filter_tags, collapse=", "), ")") else Base_Feature
        )
      
      feat_col <- "Final_Feature"
      
   # Pivot to long format preserving specific aggregation dependencies
      df_long <- df_anno %>%
        dplyr::select(Lipid_Name, subclass, Final_Feature, dplyr::all_of(samp_cols)) %>%
        tidyr::pivot_longer(cols = dplyr::all_of(samp_cols), names_to = "Sample", values_to = "Intensity")
      
   # Global Sums per sample (excluding "Misc" and "Other")
      global_sums <- df_long %>%
        dplyr::filter(subclass != "Misc") %>%
        dplyr::group_by(Sample) %>%
        dplyr::summarise(Global_Total = sum(Intensity, na.rm=TRUE), .groups="drop")
      
      df_agg <- df_long %>%
        dplyr::filter(!!rlang::sym(feat_col) != "Other", !!rlang::sym(feat_col) != "Misc") %>%
        dplyr::group_by(Sample, Feature = !!rlang::sym(feat_col)) %>%
        dplyr::summarise(Class_Total = sum(Intensity, na.rm=TRUE), .groups="drop")
      
   # Construct metadata mapping for GroupingVal dynamically
      meta_mapped <- meta_df %>% dplyr::select(FullName, dplyr::all_of(input$groupingMetadata))
      meta_mapped$GroupingVal <- apply(meta_mapped[, input$groupingMetadata, drop=FALSE], 1, paste, collapse = "_")
      meta_mapped$Combined_Grouping <- meta_mapped$GroupingVal
      
      if (length(input$groupingMetadata) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") {
         meta_mapped$Facet_Grp <- apply(meta_mapped[, input$groupingMetadata[-length(input$groupingMetadata)], drop=FALSE], 1, paste, collapse = "_")
         meta_mapped$X_Grp <- meta_mapped[[ input$groupingMetadata[length(input$groupingMetadata)] ]]
      } else {
         meta_mapped$Facet_Grp <- "All"
         meta_mapped$X_Grp <- meta_mapped$GroupingVal
      }
      
   # Join global AND metadata
      df_prop <- df_agg %>%
        dplyr::left_join(global_sums, by="Sample") %>%
        dplyr::mutate(Proportion = (Class_Total + 1) / (Global_Total + 1)) %>%
        dplyr::left_join(meta_mapped, by=c("Sample"="FullName"))
      
   # Generate ordered groups based on column appearance
      ordered_samples <- setdiff(colnames(df_processed), "Lipid_Name")
      meta_ordered <- meta_df %>% 
        dplyr::filter(FullName %in% ordered_samples)
        
   # Intercept Factor Level Ordering based on user UI Preferences
      for (col in input$groupingMetadata) {
         if (!is.null(level_prefs[[col]])) {
             valid_pref <- intersect(level_prefs[[col]], unique(meta_ordered[[col]]))
             remainder <- setdiff(unique(meta_ordered[[col]]), valid_pref)
             meta_ordered[[col]] <- factor(meta_ordered[[col]], levels = c(valid_pref, remainder))
         } else {
             meta_ordered[[col]] <- factor(meta_ordered[[col]])
         }
      }
      
      meta_ordered <- meta_ordered %>% dplyr::arrange(dplyr::across(dplyr::all_of(input$groupingMetadata)))
      
      meta_ordered$GroupingVal <- apply(meta_ordered[, input$groupingMetadata, drop=FALSE], 1, paste, collapse="_")
      meta_ordered$Combined_Grouping <- meta_ordered$GroupingVal
      if (!is.null(level_prefs[["Combined_Grouping"]])) {
         valid_pref <- intersect(level_prefs[["Combined_Grouping"]], unique(meta_ordered$Combined_Grouping))
         remainder <- setdiff(unique(meta_ordered$Combined_Grouping), valid_pref)
         meta_ordered$Combined_Grouping <- factor(meta_ordered$Combined_Grouping, levels = c(valid_pref, remainder))
         if (input$comparisonStrategy != "Faceted (Intra-group Reference)" && length(input$groupingMetadata) > 1) {
            ordered_groups <- levels(meta_ordered$Combined_Grouping)
            ordered_xs <- ordered_groups
         }
      }
      
      # CRITICAL UPDATE: Extract GroupingVal taking advantage of arrange(), 
      # but for isolated variables, we MUST rely exclusively on their factor levels!
      ordered_groups <- unique(meta_ordered$GroupingVal)
      
      if (length(input$groupingMetadata) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") {
         meta_ordered$Facet_Grp <- apply(meta_ordered[, input$groupingMetadata[-length(input$groupingMetadata)], drop=FALSE], 1, paste, collapse="_")
         
         x_col_name <- input$groupingMetadata[length(input$groupingMetadata)]
         meta_ordered$X_Grp <- meta_ordered[[ x_col_name ]]
         
         ordered_facets <- unique(meta_ordered$Facet_Grp)
         
         # CRITICAL UPDATE: Do not use unique() because the dataframe is primarily sorted by Facet_Grp!
         # unique() will find X_Grp out of order if Facet 1 is missing some X_Grp geometries natively!
         ordered_xs <- levels(meta_ordered[[ x_col_name ]])
      } else {
         ordered_facets <- "All"
         meta_ordered$Facet_Grp <- "All"
         
         if (length(input$groupingMetadata) == 1) {
            # Single grouping: enforce strict Factor Level isolation
            ordered_xs <- levels(meta_ordered[[ input$groupingMetadata[1] ]])
            ordered_groups <- intersect(ordered_xs, ordered_groups) # Preserve factor hierarchy, drop NAs
         } else {
            ordered_xs <- ordered_groups
         }
         
         # CRITICAL UPDATE: Propagate the explicitly defined X_Grp to meta_ordered for mapping
         meta_ordered$X_Grp <- factor(meta_ordered$GroupingVal, levels = ordered_xs)
      }
      
   # Calculate Baseline Means
      baseline_grp <- input$selectedBaseline
      if (is.null(baseline_grp) || length(baseline_grp) == 0 || all(!nzchar(trimws(baseline_grp)))) return(NULL)
      
      if (input$comparisonStrategy == "Faceted (Intra-group Reference)" && length(input$groupingMetadata) > 1) {
          baseline_means <- df_prop %>%
            dplyr::filter(X_Grp %in% baseline_grp) %>%
            dplyr::group_by(Feature, Facet_Grp) %>%
            dplyr::summarise(Baseline_Mean_Prop = mean(Proportion, na.rm=TRUE), .groups="drop")
            
          req(nrow(baseline_means) > 0)
          scale_mode <- input$scaleMode %||% "log2fc"
          
          plot_db_all <- df_prop %>%
            dplyr::left_join(baseline_means, by=c("Feature", "Facet_Grp")) %>%
            dplyr::mutate(Log2FC = log2(Proportion / Baseline_Mean_Prop),
                          FC = Proportion / Baseline_Mean_Prop,
                          Delta = Proportion - Baseline_Mean_Prop,
                          Is_Baseline = (X_Grp %in% baseline_grp)) %>%
            dplyr::mutate(Plot_Value = if(scale_mode == "log2fc") Log2FC else if(scale_mode == "fc") FC else Delta)
      } else {
          baseline_means <- df_prop %>%
            dplyr::filter(GroupingVal %in% baseline_grp) %>%
            dplyr::group_by(Feature) %>%
            dplyr::summarise(Baseline_Mean_Prop = mean(Proportion, na.rm=TRUE), .groups="drop")
            
          req(nrow(baseline_means) > 0)
          scale_mode <- input$scaleMode %||% "log2fc"
          
          plot_db_all <- df_prop %>%
            dplyr::left_join(baseline_means, by="Feature") %>%
            dplyr::mutate(Log2FC = log2(Proportion / Baseline_Mean_Prop),
                          FC = Proportion / Baseline_Mean_Prop,
                          Delta = Proportion - Baseline_Mean_Prop,
                          Is_Baseline = (GroupingVal %in% baseline_grp)) %>%
            dplyr::mutate(Plot_Value = if(scale_mode == "log2fc") Log2FC else if(scale_mode == "fc") FC else Delta)
      }
      

        

      
   # Calculate T-test Statistics manually here to export to CSV
      stats_df <- data.frame()
      
      if (input$comparisonStrategy == "Faceted (Intra-group Reference)" && length(input$groupingMetadata) > 1) {
     # Extract local reference 'X_Grp' from the explicitly selected Baseline
         ref_x <- baseline_grp[1]
         
         for(feat in unique(plot_db_all$Feature)) {
            sub_f <- plot_db_all %>% dplyr::filter(Feature == feat)
            
            for(fac in unique(sub_f$Facet_Grp)) {
               f_facet_df <- sub_f %>% dplyr::filter(Facet_Grp == fac)
               
               base_vals <- f_facet_df %>% dplyr::filter(X_Grp == ref_x) %>% dplyr::pull(Plot_Value)
               
               for(g in setdiff(unique(f_facet_df$X_Grp), ref_x)) {
                  comp_vals <- f_facet_df %>% dplyr::filter(X_Grp == g) %>% dplyr::pull(Plot_Value)
                  p_val <- NA
                  stars <- "ns"
                  if(length(base_vals)>=2 && length(comp_vals)>=2) {
                     v_base <- var(base_vals,na.rm=T)
                     v_comp <- var(comp_vals,na.rm=T)
                     if(!is.na(v_base) && !is.na(v_comp) && !(v_base == 0 && v_comp == 0)) {
                        tt <- tryCatch(compute_local_p_val(base_vals, comp_vals, method = resolved_method, paired = FALSE), error=function(e) NA)
                        if(!is.na(tt)) {
                           p_val <- tt
                           if(p_val < 0.001) stars <- "***"
                           else if(p_val < 0.01) stars <- "**"
                           else if(p_val < 0.05) stars <- "*"
                        }
                     }
                  }
                  
         # Recover the actual underlying GroupingVal token accurately for plotting maps
                  grp_val_actual <- unique(f_facet_df$GroupingVal[f_facet_df$X_Grp == g])[1]
                  if(!is.na(grp_val_actual)) {
                      stats_df <- rbind(stats_df, data.frame(Feature=feat, GroupingVal=grp_val_actual, P_Value=p_val, Significance=stars))
                  }
               }
            }
         }
      } else {
     # Global / Linear statistical mapping
         for(feat in unique(plot_db_all$Feature)) {
            sub_f <- plot_db_all %>% dplyr::filter(Feature == feat)
            base_vals <- sub_f %>% dplyr::filter(GroupingVal %in% baseline_grp) %>% dplyr::pull(Plot_Value)
            
            for(g in setdiff(ordered_groups, baseline_grp)) {
               comp_vals <- sub_f %>% dplyr::filter(GroupingVal == g) %>% dplyr::pull(Plot_Value)
               p_val <- NA
               stars <- "ns"
               if(length(base_vals)>=2 && length(comp_vals)>=2) {
                  v_base <- var(base_vals,na.rm=T)
                  v_comp <- var(comp_vals,na.rm=T)
                  if(!is.na(v_base) && !is.na(v_comp) && !(v_base == 0 && v_comp == 0)) {
                     tt <- tryCatch(compute_local_p_val(base_vals, comp_vals, method = resolved_method, paired = FALSE), error=function(e) NA)
                     if(!is.na(tt)) {
                        p_val <- tt
                        if(p_val < 0.001) stars <- "***"
                        else if(p_val < 0.01) stars <- "**"
                        else if(p_val < 0.05) stars <- "*"
                     }
                  }
               }
               stats_df <- rbind(stats_df, data.frame(Feature=feat, GroupingVal=g, P_Value=p_val, Significance=stars))
            }
         }
      }
      
      if(nrow(stats_df) > 0) {
         plot_db_all <- plot_db_all %>% dplyr::left_join(stats_df, by=c("Feature", "GroupingVal"))
         
     # Explicitly tag the reference arrays to avoid arbitrary NA strings mathematically
         plot_db_all$Significance[is.na(plot_db_all$Significance) & plot_db_all$Is_Baseline == TRUE] <- "Reference"
      } else {
         plot_db_all$P_Value <- NA
         plot_db_all$Significance <- "ns"
         plot_db_all$Significance[plot_db_all$Is_Baseline == TRUE] <- "Reference"
      }
      
   # Enforce Factor levels POST left_join to completely immunize from dplyr dropping strings!
      plot_db_all$GroupingVal <- factor(plot_db_all$GroupingVal, levels = ordered_groups)
      
      for(col in input$groupingMetadata) {
         if(col %in% colnames(plot_db_all) && col %in% colnames(meta_ordered)) {
             plot_db_all[[col]] <- factor(plot_db_all[[col]], levels = levels(meta_ordered[[col]]))
         }
      }
      
      if ("X_Grp" %in% colnames(plot_db_all) && "X_Grp" %in% colnames(meta_ordered)) {
          if (is.factor(meta_ordered$X_Grp)) {
              plot_db_all$X_Grp <- factor(plot_db_all$X_Grp, levels = levels(meta_ordered$X_Grp))
          } else {
              plot_db_all$X_Grp <- factor(plot_db_all$X_Grp, levels = unique(meta_ordered$X_Grp))
          }
      }
      
      if ("Facet_Grp" %in% colnames(plot_db_all) && "Facet_Grp" %in% colnames(meta_ordered)) {
          if (is.factor(meta_ordered$Facet_Grp)) {
              plot_db_all$Facet_Grp <- factor(plot_db_all$Facet_Grp, levels = levels(meta_ordered$Facet_Grp))
          } else {
              plot_db_all$Facet_Grp <- factor(plot_db_all$Facet_Grp, levels = unique(meta_ordered$Facet_Grp))
          }
      }
      
      list(plot_db = plot_db_all, baseline_grp = baseline_grp, ordered_groups = ordered_groups)
    }
    
  # Processed DB for the reactive UI interactions
    processed_db <- reactive({
       req(input$featureLevel)
   # Force explicit reactive registration for drag-and-drop sortable lists
      invisible(reactiveValuesToList(level_prefs))
      
      build_db_for_level(input$featureLevel, input$additiveFiltering)
    })
    
    # Observe transferred lipid selection from Heatmap module
    observeEvent(shared_data$selected_violin_lipids(), {
       target_lipids <- shared_data$selected_violin_lipids()
       req(length(target_lipids) > 0)
       
       # Force featureLevel to subclass (individual lipid species)
       updateSelectInput(session, "featureLevel", selected = "subclass")
       
       # Pre-select target lipids across flat and grouped checkbox inputs
       updateCheckboxGroupInput(session, "selectedFeatures_flat", selected = target_lipids)
       updateCheckboxGroupInput(session, "sel_Glycerophospholipids", selected = target_lipids)
       updateCheckboxGroupInput(session, "sel_Sphingolipids", selected = target_lipids)
       updateCheckboxGroupInput(session, "sel_Glycerolipids", selected = target_lipids)
       updateCheckboxGroupInput(session, "sel_Sterol Lipids", selected = target_lipids)
       updateCheckboxGroupInput(session, "sel_Fatty Acyls", selected = target_lipids)
    }, ignoreInit = TRUE)
    
  # --- 3. Feature UI ---
    
    output$featureLevelUI <- renderUI({
        selectInput(session$ns("featureLevel"), "Analyze Features At:", 
                    choices = c("Lipid Category" = "macro", "Lipid Main Class" = "subclass"),
                    selected = "subclass")
    })
    
    output$featurePickerUI <- renderUI({
      req(input$featureLevel)
      req(processed_db())
      df <- processed_db()$plot_db
      
      if(isTRUE(input$showSignificantOnly)) {
     # A feature is significant if ANY comparison has Significance != "ns"
         sig_feats <- df %>% dplyr::filter(Significance != "ns", !is.na(Significance)) %>% dplyr::pull(Feature) %>% unique()
         df <- df %>% dplyr::filter(Feature %in% sig_feats)
      }
      
      feats <- sort(unique(df$Feature))
      
      # Determine default selection
      # If macro, select all. If subclass, select only first by default (unless user already has a selection)
      curr_sel <- isolate(unifiedSelectedFeatures())
      
      if (input$featureLevel == "subclass") {
          if (is.null(curr_sel)) {
              sel_feats <- feats[1] # Only first one selected by default
          } else {
              sel_feats <- intersect(curr_sel, feats)
              if (length(sel_feats) == 0) sel_feats <- feats[1]
          }
      } else {
          sel_feats <- if (!is.null(curr_sel) && length(intersect(curr_sel, feats)) > 0) intersect(curr_sel, feats) else feats
      }
      
      ns <- session$ns
      
      # Master All | None JS
      master_all_js <- paste0("$('#", ns("master_feature_container"), " input[type=checkbox]').prop('checked', true).trigger('change'); return false;")
      master_none_js <- paste0("$('#", ns("master_feature_container"), " input[type=checkbox]').prop('checked', false).trigger('change'); return false;")
      
      master_header <- tags$div(
          class = "d-flex justify-content-between align-items-center mb-2",
          tags$strong("Features to Plot:"),
          tags$div(
             tags$a(href="#", onclick=master_all_js, "All"),
             " | ",
             tags$a(href="#", onclick=master_none_js, "None")
          )
      )
      
      # Grouping logic
      if (input$featureLevel == "subclass" && shared_data$analysisMode() == "Global Lipidomics") {
          # Group by hyperclass
          hyperclasses <- list(
              "Glycerophospholipids" = c("GP_PC", "GP_PE", "GP_PG", "GP_PI", "GP_PS", "GP_PA", "GP_LPC", "GP_LPE", "GP_LPG", "GP_LPI", "GP_LPS", "GP_LPA", "GP_CL", "GP_PE_P", "GP_PE_E"),
              "Sphingolipids" = c("SP_Cer", "SP_SM", "SP_GlcCer", "SP_LacCer", "SP_Cer_dh", "SP_SM_dh"),
              "Glycerolipids" = c("GL_TAG", "GL_DAG"),
              "Sterol Lipids" = c("ST_CE"),
              "Fatty Acyls" = c("FA_ACar")
          )
          
          ui_groups <- lapply(names(hyperclasses), function(hc) {
              hc_feats <- c()
              label_format <- input$classLabelFormat %||% "short"
              for (cls in hyperclasses[[hc]]) {
                  fmt_cls <- if (label_format == "full") get_full_class_name(cls) else get_short_class_name(cls)
                  escaped_cls <- gsub("([\\+\\-\\*\\?\\^\\$\\(\\)\\[\\]\\{\\}\\.\\|\\\\])", "\\\\\\1", fmt_cls)
                  matches <- feats[feats == fmt_cls | grepl(paste0("^", escaped_cls, " \\("), feats)]
                  hc_feats <- c(hc_feats, matches)
              }
              hc_feats <- sort(unique(hc_feats))
              if (length(hc_feats) > 0) {
                  group_all_js <- "$(this).closest('.hyperclass-group').find('input[type=checkbox]').prop('checked', true).trigger('change'); return false;"
                  group_none_js <- "$(this).closest('.hyperclass-group').find('input[type=checkbox]').prop('checked', false).trigger('change'); return false;"
                  
                  tags$div(
                      class = "hyperclass-group mb-2",
                      style = "border-left: 3px solid #007bff; padding-left: 10px; margin-left: 5px;",
                      tags$div(
                          class = "d-flex justify-content-between align-items-center",
                          tags$span(class="text-primary fw-bold", hc),
                          tags$div(
                             tags$a(href="#", onclick=group_all_js, "All"),
                             " | ",
                             tags$a(href="#", onclick=group_none_js, "None")
                          )
                      ),
                      checkboxGroupInput(ns(paste0("sel_", hc)), label = NULL, choices = hc_feats, 
                                         selected = shared_data$get_restored_input(ns(paste0("sel_", hc)), intersect(hc_feats, sel_feats)))
                  )
              }
          })
          
          return(tags$div(id = ns("master_feature_container"), master_header, ui_groups))
          
      } else if (input$featureLevel == "individual" && shared_data$analysisMode() != "Global Lipidomics") {
          # Group Single Lipids by Biosynthetic Origin
          anno <- shared_data$annotationData()
          if (!is.null(anno) && "Biosynthetic_Origin" %in% names(anno)) {
              pathways <- unique(anno$Biosynthetic_Origin)
              pathways <- pathways[!is.na(pathways) & pathways != "Misc" & pathways != "Other" & pathways != "Unknown"]
              
              ui_groups <- lapply(sort(pathways), function(pw) {
                  pw_lipids <- anno$Lipid_Name[anno$Biosynthetic_Origin == pw]
                  hc_feats <- intersect(feats, pw_lipids)
                  if (length(hc_feats) > 0) {
                      group_all_js <- "$(this).closest('.hyperclass-group').find('input[type=checkbox]').prop('checked', true).trigger('change'); return false;"
                      group_none_js <- "$(this).closest('.hyperclass-group').find('input[type=checkbox]').prop('checked', false).trigger('change'); return false;"
                      
                      raw_id <- paste0("sel_lm_", gsub("[^A-Za-z0-9]", "_", pw))
                      tags$div(
                          class = "hyperclass-group mb-2",
                          style = "border-left: 3px solid #28a745; padding-left: 10px; margin-left: 5px;",
                          tags$div(
                              class = "d-flex justify-content-between align-items-center",
                              tags$span(class="text-success fw-bold", pw),
                              tags$div(
                                 tags$a(href="#", onclick=group_all_js, "All"),
                                 " | ",
                                 tags$a(href="#", onclick=group_none_js, "None")
                              )
                          ),
                          checkboxGroupInput(ns(raw_id), label = NULL, choices = hc_feats, 
                                             selected = shared_data$get_restored_input(ns(raw_id), intersect(hc_feats, sel_feats)))
                      )
                  }
              })
              
              return(tags$div(id = ns("master_feature_container"), master_header, ui_groups))
          } else {
              return(tags$div(
                  id = ns("master_feature_container"),
                  master_header,
                  checkboxGroupInput(ns("selectedFeatures_flat"), label = NULL, choices = feats, 
                                     selected = shared_data$get_restored_input(ns("selectedFeatures_flat"), sel_feats))
              ))
          }
      } else {
          # Flat list for Macro or Biosynthetic Pathway level
          return(tags$div(
              id = ns("master_feature_container"),
              master_header,
              checkboxGroupInput(ns("selectedFeatures_flat"), label = NULL, choices = feats, 
                                 selected = shared_data$get_restored_input(ns("selectedFeatures_flat"), sel_feats))
          ))
      }
    })
    
    # Unified selected features reactive
    unifiedSelectedFeatures <- reactive({
       req(input$featureLevel)
       if (input$featureLevel == "subclass") {
           c(input$sel_Glycerophospholipids, input$sel_Sphingolipids, input$sel_Glycerolipids, input$`sel_Sterol Lipids`, input$`sel_Fatty Acyls`)
       } else {
           input$selectedFeatures_flat
       }
    })
    
  # --- 4. Plot Rendering ---
    output$dynamicPlotTitle <- renderUI({
       scale_map <- c("log2fc" = "Log2 Fold Change Violins", 
                      "fc" = "Fold Change (Linear) Violins", 
                      "delta" = "Proportion Difference Violins")
       selected <- input$scaleMode %||% "log2fc"
       tags$span(icon("scale-unbalanced"), paste0(" ", scale_map[[selected]]))
    })
    
    output$scrollable_plot_ui <- renderUI({
      feats <- unifiedSelectedFeatures()
      n <- if (!is.null(feats)) length(feats) else 0
      
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline))) || n == 0) {
        return(plotOutput(session$ns("logratioPlot"), width = "100%", height = "500px"))
      }
      
      ncols <- min(3, n)
      nrows <- ceiling(n / 3)
      
      zoom <- input$plotZoom %||% 100
      zoom <- zoom / 100
      
   # 6x5 inches -> approx 600x500 pixels per facet
      total_w <- max(800, ncols * 600) * zoom
      total_h <- max(500, nrows * 500) * zoom
      plotOutput(session$ns("logratioPlot"), width = paste0(total_w, "px"), height = paste0(total_h, "px"))
    })
    
    applied_violin_colors <- reactiveVal(NULL)
    
    observeEvent(input$btn_apply_violin_colors, {
      db_info <- processed_db()
      if (is.null(db_info)) return()
      df_log <- db_info$plot_db
      val <- input$groupingMetadata
      strat <- input$comparisonStrategy
      default_c_var <- if (length(val) > 1) {
        if (!is.null(strat) && strat == "Faceted (Intra-group Reference)") val[length(val)] else "Combined_Grouping"
      } else {
        val[1]
      }
      c_var <- input$color_target_var
      if (is.null(c_var) || (c_var != "Combined_Grouping" && !c_var %in% names(df_log))) {
        c_var <- default_c_var
      }
      if (c_var == "Combined_Grouping" && !("Combined_Grouping" %in% names(df_log))) {
        df_log$Combined_Grouping <- df_log$GroupingVal
      }
      req(c_var)
      c_levels <- sort(unique(df_log[[c_var]]))
      
      cols <- sapply(c_levels, function(lvl) {
         safe_col <- gsub("[^A-Za-z0-9]", "", c_var)
         safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
         val <- input[[paste0("cp_", safe_col, "_", safe_lvl)]]
          if (is.null(val)) {
             base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[c_var]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[c_var]], error = function(e) NULL)
            if (is.null(base_map)) {
               pal <- RColorBrewer::brewer.pal(min(9, max(3, length(c_levels))), "Set1")
               if(length(c_levels) > length(pal)) pal <- colorRampPalette(pal)(length(c_levels))
               base_map <- stats::setNames(pal[1:length(c_levels)], c_levels)
            }
            return(as.character(base_map[lvl]))
         } else {
            return(as.character(val))
         }
      })
      applied_violin_colors(cols)
      showNotification("Violin plot colors applied successfully!", type = "message", duration = 2)
    })
    
    current_plot <- reactive({
      req(processed_db(), unifiedSelectedFeatures())
      
      db_info <- processed_db()
      df_log <- db_info$plot_db %>% dplyr::filter(Feature %in% unifiedSelectedFeatures())
      req(nrow(df_log) > 0)
      
      val <- input$groupingMetadata
      strat <- input$comparisonStrategy
      default_c_var <- if (length(val) > 1) {
        if (!is.null(strat) && strat == "Faceted (Intra-group Reference)") val[length(val)] else "Combined_Grouping"
      } else {
        val[1]
      }
      c_var <- input$color_target_var
      if (is.null(c_var) || (c_var != "Combined_Grouping" && !c_var %in% names(df_log))) {
        c_var <- default_c_var
      }
      if (c_var == "Combined_Grouping" && !("Combined_Grouping" %in% names(df_log))) {
        df_log$Combined_Grouping <- df_log$GroupingVal
      }
      c_levels <- sort(unique(df_log[[c_var]]))
      
      base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[c_var]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[c_var]], error = function(e) NULL)
      applied <- applied_violin_colors()
      
      safe_colors <- if (!is.null(applied) && all(c_levels %in% names(applied))) {
         applied[c_levels]
      } else if (!is.null(base_map) && all(c_levels %in% names(base_map))) {
         base_map[c_levels]
      } else {
         sapply(c_levels, function(lvl) {
            safe_col <- gsub("[^A-Za-z0-9]", "", c_var)
            safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
            val <- isolate(input[[paste0("cp_", safe_col, "_", safe_lvl)]])
            if (is.null(val)) {
               b_col <- if(!is.null(base_map)) base_map[lvl] else NA
               if (is.na(b_col)) "#4E79A7" else b_col
            } else {
               val
            }
         })
      }
      
      # source("R/utils_vis.R", local=TRUE)
      
      if (isTRUE(input$shortYAxis)) {
         y_lab <- switch(input$scaleMode %||% "log2fc",
                         "log2fc" = "Log2FC",
                         "fc"     = "FC",
                         "delta"  = "Delta")
      } else {
         y_lab <- switch(input$scaleMode %||% "log2fc",
                         "log2fc" = "Log2(Proportion / Mean Baseline Proportion)",
                         "fc"     = "Fold Change (Proportion / Mean Baseline Proportion)",
                         "delta"  = "Difference (Proportion - Mean Baseline Proportion)")
      }
      
      plot_logratio_violin(df_log, 
                           target_features = unifiedSelectedFeatures(), 
                           baseline_groups = db_info$baseline_grp,
                           color_mapping = safe_colors,
                           y_label = y_lab,
                           show_baseline = input$showBaseline %||% FALSE,
                           color_var = c_var,
                           sig_display_type = input$sigDisplayType %||% "star")
    })
    
    output$baseline_status_banner <- renderUI({
      if (is.null(shared_data$data_processed())) return(NULL)
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        div(
          class = "baseline-warning-banner alert alert-warning d-flex flex-wrap justify-content-between align-items-center mb-3 shadow-sm",
          style = "border-left: 5px solid #d97706; background: #fffbeb; border-radius: 9px; padding: 12px 18px; border-top: 1px solid #fde68a; border-right: 1px solid #fde68a; border-bottom: 1px solid #fde68a;",
          div(class = "d-flex align-items-center gap-3",
            div(style = "width: 40px; height: 40px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;",
              icon("arrow-pointer")
            ),
            div(
              tags$h6(style = "font-weight: 700; color: #92400e; margin: 0 0 2px 0; font-size: 0.95rem;", 
                     "Reference Baseline Selection Required"),
              tags$span(style = "color: #b45309; font-size: 13px;", 
                        "Select an item in 'Reference Baseline:' in the left sidebar to calculate and display violin distributions.")
            )
          ),
          div(class = "d-flex flex-wrap gap-2 align-items-center mt-2 mt-sm-0",
            tags$button(
              type = "button",
              class = "btn btn-sm btn-warning text-dark btn-point-baseline",
              `data-target-baseline` = session$ns("selectedBaseline"),
              onclick = sprintf("window.pointToBaselineSelector && window.pointToBaselineSelector('%s', event); return false;", session$ns("selectedBaseline")),
              style = "font-weight: 600; padding: 7px 16px; border-radius: 8px; white-space: nowrap;",
              icon("crosshairs"), " Point to Reference Baseline"
            )
          )
        )
      } else {
        NULL
      }
    })

    output$logratioPlot <- renderPlot({
      if (is.null(shared_data$data_processed())) {
        return(generate_empty_plot_message("Please upload a dataset and click 'Run Analysis' in the left sidebar"))
      }
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        return(generate_empty_plot_message("Please select an item in 'Reference Baseline:' in the left sidebar to generate violin plots"))
      }
      feats <- unifiedSelectedFeatures()
      if (is.null(feats) || length(feats) == 0) {
        return(generate_empty_plot_message("Please select at least one feature or lipid class in the sidebar to display violin plots"))
      }
      p <- current_plot()
      if (is.null(p)) {
        return(generate_empty_plot_message("Please select an item in 'Reference Baseline:' in the left sidebar to generate violin plots"))
      }
      p
    })
    
  # --- 5. Download Handlers ---
    
    output$downloadPlot <- downloadHandler(
      filename = function() {
        paste0("Violin_Plots_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".pdf")
      },
      content = function(file) {
        tryCatch({
          p <- current_plot()
          req(p)
          
          # Exact on-screen dimensions for What-You-See-Is-What-You-Get (WYSIWYG) export
          w <- session$clientData[[paste0("output_", session$ns("logratioPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("logratioPlot"), "_height")]]
          
          feats <- unifiedSelectedFeatures()
          n <- if (!is.null(feats)) length(feats) else 1
          ncols <- min(3, n)
          nrows <- ceiling(n / 3)
          zoom <- (input$plotZoom %||% 100) / 100
          fallback_w <- max(800, ncols * 600) * zoom
          fallback_h <- max(500, nrows * 500) * zoom
          
          w_px <- if (!is.null(w) && is.numeric(w) && w > 10) w else fallback_w
          h_px <- if (!is.null(h) && is.numeric(h) && h > 10) h else fallback_h
          
          w_in <- w_px / 72
          h_in <- h_px / 72
          
          ggplot2::ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
        }, error = function(e) {
          pdf(file, width = 8, height = 6)
          plot(0, 0, type = "n", axes = FALSE, xlab = "", ylab = "")
          text(0, 0, paste("ERROR in ggsave/current_plot:\n", e$message), col = "red", cex = 0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
    output$downloadCSV <- downloadHandler(
      filename = function() {
        paste0("Violin_Plots_Data_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".csv")
      },
      content = function(file) {
        db_info <- processed_db()
        req(db_info)
        df_log <- db_info$plot_db
        if (!is.null(unifiedSelectedFeatures()) && length(unifiedSelectedFeatures()) > 0) {
           df_log <- df_log %>% dplyr::filter(Feature %in% unifiedSelectedFeatures())
        }
        export_df <- df_log %>% 
           dplyr::select(Sample, GroupingVal, Feature, Class_Total, Global_Total, Proportion, Baseline_Mean_Prop, Log2FC, P_Value, Significance, Is_Baseline)
        write.csv(export_df, file, row.names = FALSE)
      },
      contentType = "text/csv"
    )
    
  # --- 6. Batch ZIP Generators ---
    
    generate_zip_for_level <- function(file, feat_level) {
       db_info <- build_db_for_level(feat_level)
       req(db_info)
       
       
       date_str <- format(Sys.time(), "%Y-%m-%d-%H-%M")
       val <- input$groupingMetadata
       strat <- input$comparisonStrategy
       default_c_var <- if (length(val) > 1) {
         if (!is.null(strat) && strat == "Faceted (Intra-group Reference)") val[length(val)] else "Combined_Grouping"
       } else {
         val[1]
       }
       c_var <- input$color_target_var
       if (is.null(c_var) || (c_var != "Combined_Grouping" && !c_var %in% names(db_info$plot_db))) {
         c_var <- default_c_var
       }
       if (c_var == "Combined_Grouping" && !("Combined_Grouping" %in% names(db_info$plot_db))) {
         db_info$plot_db$Combined_Grouping <- db_info$plot_db$GroupingVal
       }
       c_levels <- sort(unique(db_info$plot_db[[c_var]]))
       
       safe_colors <- sapply(c_levels, function(lvl) {
          safe_col <- gsub("[^A-Za-z0-9]", "", c_var)
          safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
          val <- input[[paste0("cp_", safe_col, "_", safe_lvl)]]
          if(is.null(val)) {
             base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[c_var]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[c_var]], error = function(e) NULL)
             if (is.null(base_map)) {
                pal <- RColorBrewer::brewer.pal(min(9, max(3, length(c_levels))), "Set1")
                if(length(c_levels) > length(pal)) pal <- colorRampPalette(pal)(length(c_levels))
                base_map <- stats::setNames(pal[1:length(c_levels)], c_levels)
             }
             return(base_map[lvl])
          } else {
             return(val)
          }
       })
       
    # Safely grab custom color map locally
       base_colors <- isolate(shared_data$color_maps())
       
       if (is.null(safe_colors) || length(intersect(names(safe_colors), c_levels)) == 0) {
          safe_colors <- base_colors[["group_colors"]]
       }
       
       # source("R/utils_vis.R", local=TRUE)
       
       tmpdir <- tempfile("zipdir")
       dir.create(tmpdir)
       owd <- setwd(tmpdir)
       on.exit(setwd(owd))
       
       fs <- c()
       
       all_features <- unique(db_info$plot_db$Feature)
       
       if (isTRUE(input$shortYAxis)) {
          y_lab <- switch(input$scaleMode %||% "log2fc",
                          "log2fc" = "Log2FC",
                          "fc"     = "FC",
                          "delta"  = "Delta")
       } else {
          y_lab <- switch(input$scaleMode %||% "log2fc",
                          "log2fc" = "Log2(Proportion / Mean Baseline Proportion)",
                          "fc"     = "Fold Change (Proportion / Mean Baseline Proportion)",
                          "delta"  = "Difference (Proportion - Mean Baseline Proportion)")
       }
       
       for(feat in all_features) {
          feat_df <- db_info$plot_db %>% dplyr::filter(Feature == feat)
     # A feature is significant if AT LEAST ONE comparison is significant.
          is_sig <- any(!is.na(feat_df$Significance) & feat_df$Significance != "ns")
          sig_str <- if(is_sig) "Sig_true" else "Sig_fake"
          
     # Clean feature name for file system
          safe_feat <- gsub("[^A-Za-z0-9]", "_", feat)
          
          fname <- paste0(date_str, "_", safe_feat, "_", sig_str, ".pdf")
          
     # pass only one target_feature
          p <- plot_logratio_violin(feat_df, target_features = feat, baseline_groups = db_info$baseline_grp, color_mapping = safe_colors, y_label = y_lab, show_baseline = input$showBaseline %||% FALSE, color_var = c_var, sig_display_type = input$sigDisplayType %||% "star")
          
          if(!is.null(p)) {
             ggplot2::ggsave(fname, plot = p, width = 6, height = 5, units = "in", device = "pdf")
             fs <- c(fs, fname)
          }
       }
       
       zip::zipr(file, fs)
    }
    
    generate_csv_for_level <- function(file, feat_level, add_filter) {
       db_info <- build_db_for_level(feat_level, add_filter)
       req(db_info)
       export_df <- db_info$plot_db %>% 
           dplyr::select(Sample, GroupingVal, Feature, Class_Total, Global_Total, Proportion, Baseline_Mean_Prop, Log2FC, P_Value, Significance, Is_Baseline)
       write.csv(export_df, file, row.names = FALSE)
    }
    
    output$downloadAllMacroZip <- downloadHandler(
      filename = function() {
        paste0("Violin_Batch_Macro_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".zip")
      },
      content = function(file) {
        generate_zip_for_level(file, "macro", input$additiveFiltering)
      },
      contentType = "application/zip"
    )
    
    output$downloadAllMacroCsv <- downloadHandler(
      filename = function() {
        paste0("Violin_Batch_Macro_Dataset_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".csv")
      },
      content = function(file) {
        generate_csv_for_level(file, "macro", input$additiveFiltering)
      },
      contentType = "text/csv"
    )
    
    output$downloadAllSubclassZip <- downloadHandler(
      filename = function() {
        paste0("Violin_Batch_Subclass_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".zip")
      },
      content = function(file) {
        generate_zip_for_level(file, "subclass", input$additiveFiltering)
      },
      contentType = "application/zip"
    )
    
    output$downloadAllSubclassCsv <- downloadHandler(
      filename = function() {
        paste0("Violin_Batch_Subclass_Dataset_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".csv")
      },
      content = function(file) {
        generate_csv_for_level(file, "subclass", input$additiveFiltering)
      },
      contentType = "text/csv"
    )
    

    output$violin_stat_note <- renderUI({
       local_method <- input$localStatMethod %||% "auto"
       resolved_method <- if (local_method == "auto") {
          shared_data$actual_de_method()
       } else if (local_method == "parametric") {
          "limma"
       } else {
          "non_parametric"
       }
       get_journal_caption("violin", resolved_method, shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info(), selected_features = unifiedSelectedFeatures())
    })
    
    observeEvent(input$show_stats_detail, {
      # Build detailed mathematical report for Violin Plots & Pairwise Ratios
      local_method <- input$localStatMethod %||% "auto"
      actual_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      base_method <- gsub("^auto_", "", actual_method)
      
      meta <- tryCatch(shared_data$grouped_metadata(), error = function(e) NULL)
      contrast <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      n_ref <- 0
      n_comp <- 0
      if (!is.null(meta) && !is.null(contrast)) {
        n_ref <- sum(meta$Dynamic_DE_Group %in% contrast$ref, na.rm = TRUE)
        n_comp <- sum(meta$Dynamic_DE_Group %in% contrast$comp, na.rm = TRUE)
      }
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: VIOLIN PLOTS & PAIRWISE RATIOS\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. ANALYSIS CONFIGURATION\n",
        "   - Feature Level:        ", input$featureLevel %||% "Lipid Species", "\n",
        "   - Measurement Scale:    ", input$scaleMode, "\n",
        "   - Comparison Strategy:  ", input$comparisonStrategy, "\n",
        "   - Underlying Method:    ", actual_method, "\n",
        "   - Comparison Groups:    Comp = ", paste(contrast$comp, collapse=", "), " vs Ref = ", paste(contrast$ref, collapse=", "), "\n",
        "   - Replicate Sizes:      N_comp = ", n_comp, ", N_ref = ", n_ref, "\n\n",
        "2. MATHEMATICAL FORMULATION & CALCULUS EXAMPLE\n",
        "   For each selected lipid feature, the abundance values in the comparison group (X_comp, size ", n_comp, ")\n",
        "   are compared against the values in the reference group (X_ref, size ", n_ref, ").\n\n"
      )
      
      if (base_method == "non_parametric") {
        msg <- paste0(
          msg,
          "   - Non-Parametric Test: Wilcoxon Rank-Sum Test (Mann-Whitney U)\n",
          "     1. Pool all ", (n_ref + n_comp), " observations and rank them from 1 to ", (n_ref + n_comp), ".\n",
          "     2. Sum the ranks of the comparison group: R_comp.\n",
          "     3. Compute the Mann-Whitney U statistic:\n",
          "          U1 = R_comp - [", n_comp, " * (", n_comp, " + 1)] / 2\n",
          "          U = min(U1, ", (n_comp * n_ref), " - U1)\n",
          "     4. Compute normal approximation:\n",
          "          Expected Mean (mu_U) = ", (n_comp * n_ref) / 2, "\n",
          "          Expected Variance (sigma_U^2) = ", round((n_comp * n_ref * (n_comp + n_ref + 1)) / 12, 4), "\n",
          "          Z = (U - mu_U) / sqrt(Expected Variance)\n",
          "     5. Compute two-tailed p-value from standard normal distribution.\n"
        )
      } else {
        msg <- paste0(
          msg,
          "   - Parametric Test: Two-tailed Student's t-test (equal variance)\n",
          "     1. Compute Group Means:\n",
          "          Mean_comp = (1 / ", n_comp, ") * sum(X_comp),  Mean_ref = (1 / ", n_ref, ") * sum(X_ref)\n",
          "     2. Compute Sample Variances (s_comp^2 and s_ref^2).\n",
          "     3. Compute Pooled Standard Deviation (s_p):\n",
          "          s_p = sqrt( ( (", n_comp, " - 1)*s_comp^2 + (", n_ref, " - 1)*s_ref^2 ) / ", (n_comp + n_ref - 2), " )\n",
          "     4. Compute t-statistic:\n",
          "          t = (Mean_comp - Mean_ref) / ( s_p * sqrt( 1/", n_comp, " + 1/", n_ref, " ) )\n",
          "     5. Compute two-tailed p-value from Student's t-distribution with df = ", (n_comp + n_ref - 2), " degrees of freedom.\n"
        )
      }
      
      msg <- paste0(
        msg,
        "\n   - Multiple Testing Adjustment:\n",
        "     None (Raw, unadjusted P-values are plotted for local pairwise comparisons).\n",
        "==================================================\n"
      )
      
      msg <- paste0(msg, "\n", get_stats_console_method_summary(shared_data))
      
      # Write to stats_detail_text and display modal overlay
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Violin Plots")
    })
    
  })
}
