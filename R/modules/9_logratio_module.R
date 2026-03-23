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
        
    # 1. Selection of grouping metadata
        selectizeInput(ns("groupingMetadata"), "Primary Grouping (Order matters):", 
                     choices = c("Condition", "Population"), 
                     selected = "Condition", 
                     multiple = TRUE, 
                     options = list(plugins = list('drag_drop'))),
        
        radioButtons(ns("comparisonStrategy"), "Comparison Strategy:", 
                     choices = c("Global (Combined Reference)", "Faceted (Intra-group Reference)"), 
                     selected = "Faceted (Intra-group Reference)"),
        
    # 2. Baseline Group Picker
        uiOutput(ns("baselineSelectorUI")),
        
        hr(),
        
    # 3. Aggregation/Feature Level
        radioButtons(ns("featureLevel"), "Analyze Features At:", 
                     choices = c("Macroscopic / (Class)" = "macro", 
                                 "Subclass" = "subclass"), 
                     selected = "macro"),
        
        radioButtons(ns("additiveFiltering"), "Additive Filtering:", 
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
        
        hr(),
        sliderInput(ns("plotZoom"), "Viewport Zoom %:", min=10, max=200, value=30, step=1),
        radioButtons(ns("scaleMode"), "Measurement Scale:", 
                     choices = c("Log2 Fold Change" = "log2fc", 
                                 "Fold Change (Linear)" = "fc", 
                                 "Proportion Difference" = "delta"), 
                     selected = "log2fc"),
        checkboxInput(ns("showBaseline"), "Show Baseline (Y=0) Line", value = FALSE),
        
    # 4. View options
        checkboxInput(ns("showSignificantOnly"), "Show only significant features", value = FALSE),
        checkboxInput(ns("shortYAxis"), "Use Short Y-axis Title", value = TRUE),
        uiOutput(ns("featurePickerUI")),
        
        hr(),
        layout_columns(
          col_widths = c(6, 6),
          downloadButton(ns("downloadPlot"), "PDF", class = "btn-secondary w-100"),
          downloadButton(ns("downloadCSV"), "CSV", class = "btn-secondary w-100")
        ),
        
        hr(),
        hr(),
        h6("Batch Exports: Macroscopic / (Class)"),
        downloadButton(ns("downloadAllMacroZip"), "Download All PDFs (ZIP)", class="btn-info w-100 mb-1"),
        downloadButton(ns("downloadAllMacroCsv"), "Download Dataset (CSV)", class="btn-info w-100 mb-2"),
        
        h6("Batch Exports: Subclass"),
        downloadButton(ns("downloadAllSubclassZip"), "Download All PDFs (ZIP)", class="btn-warning w-100 mb-1"),
        downloadButton(ns("downloadAllSubclassCsv"), "Download Dataset (CSV)", class="btn-warning w-100")
      ),
      
   # MAIN PLOT AREA
      shinyjqui::jqui_resizable(card(
        style = "min-height: 40vh; height: 70vh;",
        card_header(
          class = "d-flex justify-content-between align-items-center",
          uiOutput(ns("dynamicPlotTitle"), inline=TRUE)
        ),
        card_body(
           tags$div(
              style = "width: 100%; height: 100%; overflow: auto; border: 1px solid #e9ecef; background: #fff; padding: 10px;",
              uiOutput(ns("scrollable_plot_ui"))
           )
        )
      ), options = list(handles = "s", minHeight = 300)),
      
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
                     uiOutput(ns("dynamic_colors_ui"))
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
    
  # Memory Cache for Level Ordering
    level_prefs <- reactiveValues()
    
  # Dynamically expose the currently active grouping columns to both Order and Color Ribbons
    observe({
      val <- input$groupingMetadata
      req(length(val) > 0)
      updateSelectInput(session, "order_target_var", choices = val, selected = val[1])
      updateSelectInput(session, "color_target_var", choices = val, selected = val[1])
    })
    
  # 1. Level Sequencer (sortable rank_list)
    output$level_order_ui <- renderUI({
       target <- input$order_target_var
       req(target)
       meta <- shared_data$all_metadata()
       if(!(target %in% colnames(meta))) return(NULL)
       
       default_levels <- sort(unique(meta[[target]]))
       
       pref <- isolate(level_prefs[[target]])
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
       if(!(target %in% colnames(meta))) return(NULL)
       
       levels <- sort(unique(meta[[target]]))
       
    # Use global maps natively assigned or algorithmically bridge
       base_map <- shared_data$color_maps()[[target]]
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
          def_val <- if(!is.null(cur_val)) cur_val else base_map[lvl]
          
          div(style="display:inline-block; margin-right:5px; margin-bottom: 5px;",
              colourpicker::colourInput(ns(id), lvl, value = def_val, showColour="both", width="100px")
          )
       }) %>% div(class="d-flex flex-wrap", .)
    })
    
    output$baselineSelectorUI <- renderUI({
      selectizeInput(session$ns("selectedBaseline"), "Reference Baseline:", 
                     choices = NULL, 
                     selected = NULL,
                     multiple = TRUE)
    })
    
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
        
        updateSelectizeInput(session, "selectedBaseline", choices = choices, selected = input$selectedBaseline)
    })
    
  # --- 2. Data Transformation (Proportions & L2FC) ---
    
    build_db_for_level <- function(feat_level, add_filter = "none") {
      req(shared_data$data_processed(), shared_data$annotationData())
      req(input$selectedBaseline, input$scaleMode)
      req(length(input$groupingMetadata) > 0)
      
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
          if (class_token %in% c("GP_PC", "GP_PE", "GP_PG", "GP_PI", "GP_PS", "GP_PA", "GP_LPC", "GP_LPE", "GP_LPG", "GP_LPI", "GP_LPS", "GP_LPA", "GP_CL", "GP_PE_P", "GP_PE_E")) return("Total_Phospholipids")
          if (class_token %in% c("SP_Cer", "SP_SM", "SP_GlcCer", "SP_LacCer", "SP_Cer_dh", "SP_SM_dh")) return("Total_Sphingolipids")
          if (class_token %in% c("GL_TAG", "GL_DAG", "ST_CE")) return("Total_Neutral_Lipids")
          if (class_token == "FA_ACar") return("Total_ACar")
        } else {
      # Lipid Mediator macroscopic grouping based on origin or immune role
           if (!is.na(immune_role) && immune_role != "None" && immune_role != "Unknown") return(immune_role)
        }
        return("Other")
      }
      
      is_mediator <- "Immune_Role" %in% names(anno)
      analysisMode <- if(is_mediator) "Lipid Mediators" else "Global Lipidomics"
      
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
           Base_Feature = if(feat_level == "macro") Macro_Group else subclass,
           Final_Feature = if(length(filter_tags) > 0) paste0(Base_Feature, " (", paste(filter_tags, collapse=", "), ")") else Base_Feature
        ) %>%
        dplyr::ungroup()
      
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
      req(length(baseline_grp) > 0)
      
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
      

        
   # Make feature naming cleaner
      plot_db_all$Feature <- stringr::str_replace_all(plot_db_all$Feature, "Total_Phospholipids", "Total Phospholipids")
      plot_db_all$Feature <- stringr::str_replace_all(plot_db_all$Feature, "Total_Sphingolipids", "Total Sphingolipids")
      plot_db_all$Feature <- stringr::str_replace_all(plot_db_all$Feature, "Total_Neutral_Lipids", "Total Neutral Lipids")
      
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
                     if(is.numeric(v_base) && is.numeric(v_comp) && !(v_base == 0 && v_comp == 0)) {
                        tt <- tryCatch(t.test(base_vals, comp_vals)$p.value, error=function(e) NA)
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
                  if(is.numeric(v_base) && is.numeric(v_comp) && !(v_base == 0 && v_comp == 0)) {
                     tt <- tryCatch(t.test(base_vals, comp_vals)$p.value, error=function(e) NA)
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
   # Force explicit reactive registration for drag-and-drop sortable lists
      invisible(reactiveValuesToList(level_prefs))
      
      build_db_for_level(input$featureLevel, input$additiveFiltering)
    })
    
  # --- 3. Feature UI ---
    
    output$featurePickerUI <- renderUI({
      req(processed_db())
      df <- processed_db()$plot_db
      
      if(isTRUE(input$showSignificantOnly)) {
     # A feature is significant if ANY comparison has Significance != "ns"
         sig_feats <- df %>% dplyr::filter(Significance != "ns", !is.na(Significance)) %>% dplyr::pull(Feature) %>% unique()
         df <- df %>% dplyr::filter(Feature %in% sig_feats)
      }
      
      feats <- sort(unique(df$Feature))
      
      checkboxGroupInput(session$ns("selectedFeatures"), "Features to Plot:",
                         choices = feats, selected = feats)
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
      req(input$selectedFeatures)
      n <- length(input$selectedFeatures)
      req(n > 0)
      
      ncols <- min(3, n)
      nrows <- ceiling(n / 3)
      
      zoom <- input$plotZoom %||% 100
      zoom <- zoom / 100
      
   # 6x5 inches -> approx 600x500 pixels per facet
      total_w <- max(800, ncols * 600) * zoom
      total_h <- max(500, nrows * 500) * zoom
      
      jqui_resizable(plotOutput(session$ns("logratioPlot"), width = paste0(total_w, "px"), height = paste0(total_h, "px")))
    })
    
    current_plot <- reactive({
      req(processed_db(), input$selectedFeatures)
      
      db_info <- processed_db()
      df_log <- db_info$plot_db %>% dplyr::filter(Feature %in% input$selectedFeatures)
      req(nrow(df_log) > 0)
      
      c_var <- input$color_target_var %||% input$groupingMetadata[1]
      c_levels <- sort(unique(df_log[[c_var]]))
      
      safe_colors <- sapply(c_levels, function(lvl) {
         safe_col <- gsub("[^A-Za-z0-9]", "", c_var)
         safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
         val <- input[[paste0("cp_", safe_col, "_", safe_lvl)]]
         
         if(is.null(val)) {
            base_map <- global_color_map()[[c_var]]
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
      
      source("R/utils_vis.R", local=TRUE)
      
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
                           target_features = input$selectedFeatures, 
                           baseline_groups = db_info$baseline_grp,
                           color_mapping = safe_colors,
                           y_label = y_lab,
                           show_baseline = input$showBaseline %||% FALSE,
                           color_var = c_var)
    })
    
    output$logratioPlot <- renderPlot({
      current_plot()
    })
    
  # --- 5. Download Handlers ---
    
    output$downloadPlot <- downloadHandler(
      filename = function() {
        paste0("Violin_Plots_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".pdf")
      },
      content = function(file) {
        db_info <- processed_db()
        req(db_info)
        df_log <- db_info$plot_db
        c_var <- input$color_target_var %||% input$groupingMetadata[1]
        c_levels <- sort(unique(df_log[[c_var]]))
        
        safe_colors <- sapply(c_levels, function(lvl) {
           safe_col <- gsub("[^A-Za-z0-9]", "", c_var)
           safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
           val <- input[[paste0("cp_", safe_col, "_", safe_lvl)]]
           if(is.null(val)) {
              base_map <- shared_data$color_maps()[[c_var]]
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
        
        if (isTRUE(input$shortYAxis)) {
           y_lab <- switch(input$scaleMode %||% "log2fc", "log2fc" = "Log2FC", "fc" = "FC", "delta" = "Delta")
        } else {
           y_lab <- switch(input$scaleMode %||% "log2fc",
                           "log2fc" = "Log2(Proportion / Mean Baseline Proportion)",
                           "fc"     = "Fold Change (Proportion / Mean Baseline Proportion)",
                           "delta"  = "Difference (Proportion - Mean Baseline Proportion)")
        }
        
        source("R/utils_vis.R", local=TRUE)
        
        plts <- plot_logratio_violin(df_log, 
                                     target_features = input$selectedFeatures, 
                                     baseline_groups = db_info$baseline_grp, 
                                     color_mapping = safe_colors, 
                                     y_label = y_lab, 
                                     show_baseline = input$showBaseline %||% FALSE, 
                                     return_list = TRUE,
                                     color_var = c_var)
        
        req(length(plts) > 0)
        
        pdf(file, width = 6, height = 5)
        for(p in plts) {
           print(p)
        }
        dev.off()
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
        if (!is.null(input$selectedFeatures) && length(input$selectedFeatures) > 0) {
           df_log <- df_log %>% dplyr::filter(Feature %in% input$selectedFeatures)
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
       c_var <- input$color_target_var %||% input$groupingMetadata[1]
       c_levels <- sort(unique(db_info$plot_db[[c_var]]))
       
       safe_colors <- sapply(c_levels, function(lvl) {
          safe_col <- gsub("[^A-Za-z0-9]", "", c_var)
          safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
          val <- input[[paste0("cp_", safe_col, "_", safe_lvl)]]
          if(is.null(val)) {
             base_map <- shared_data$color_maps()[[c_var]]
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
       
       source("R/utils_vis.R", local=TRUE)
       
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
          p <- plot_logratio_violin(feat_df, target_features = feat, baseline_groups = db_info$baseline_grp, color_mapping = safe_colors, y_label = y_lab, show_baseline = input$showBaseline %||% FALSE, color_var = c_var)
          
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
    

    
  })
}
