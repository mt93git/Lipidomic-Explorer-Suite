# R/modules/4_heatmap_module.R
# Heatmap display.

# --- Helper Functions (Internal to Module) ---
# See R/utils_vis.R


# --- Module UI ---

heatmap_ui <- function(id) {
  ns <- NS(id)
  tagList(
  # Use bslib::layout_sidebar for collapsible native sidebar
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
           open = "2. Heatmap Settings", multiple = TRUE,
           accordion_panel("1. Column Annotation", icon = icon("pen-to-square"),
              checkboxInput(ns("activateCellAnnotation"), "Activate Column Annotation", FALSE),
              conditionalPanel("input.activateCellAnnotation == true", ns = ns,
                p("Define a cell type/name and color for each sample group.", class="text-muted small"),
                uiOutput(ns("cellAnnotationUI"))
              )
           ),
           accordion_panel("2. Heatmap Settings", icon = icon("sliders"),
             radioButtons(ns("repMode"), "Display Mode:",
                          choices = c("Aggregate (Class)" = "aggregate_class", 
                                      "Replicates (by Aggregate Class Order)" = "replicate_fixed_class",
                                      "Replicates (class clustered)" = "replicate_resort_class"),
                          selected = "aggregate_class"),
             radioButtons(ns("staircaseGroup"), "Row Grouping & Annotation:", 
                          choices = c("Class" = "subclass", "Biosynthetic Origin" = "hyperclass"), 
                          selected = "subclass"),
             hr(),
             radioButtons(ns("heatmapScaleMode"), "Scaling:",
                          choices = c("Global Z" = "global_zscore", "Pattern Z" = "pattern_zscore", "Relative" = "relative"),
                          selected = "global_zscore"),
             checkboxInput(ns("fineTuneColors"), "Custom Colors", FALSE),
             conditionalPanel("input.fineTuneColors == true && input.heatmapScaleMode == 'global_zscore'", ns = ns,
                colourInput(ns("gz_low"), "Low (-Z)", "#2166AC"),
                colourInput(ns("gz_mid"), "Mid (0)", "#F7F7F7"),
                colourInput(ns("gz_high"), "High (+Z)", "#B2182B")
             ),
             conditionalPanel("input.fineTuneColors == true && input.heatmapScaleMode != 'global_zscore'", ns = ns,
                colourInput(ns("seq_low"), "Low (0)", "#FFFFCC"),
                colourInput(ns("seq_high"), "High (100)", "#800026")
             ),
             checkboxInput(ns("showHeatmapNumbers"), "Show Numbers", FALSE),
             colourInput(ns("heatmapGridColor"), "Grid Color", "white"),
             checkboxInput(ns("hideHeatmapRowNames"), "Hide Row Names", FALSE),
             checkboxInput(ns("showHeatmapGrid"), "Show Grid", FALSE),
             hr(),
             uiOutput(ns("heatmapDisplayColumnSelectorUI"))
           )
         )
       ),
       navset_card_tab(
          nav_panel("Unfiltered Heatmap",
            card(
              card_header(textOutput(ns("unfiltered_summary_text"))),
              card_body(
                 div(style = "overflow: auto; width: 100%; height: 80vh;",
                   plotOutput(ns("heatmapPlot"), height = "800px")
                 )
              ),
              card_footer(
                downloadButton(ns("downloadHeatmapPDF"), "Download PDF"),
                downloadButton(ns("downloadHeatmapCSV"), "Download Data (CSV)", class="btn-secondary")
              )
            )
          ),
          nav_panel("Filtered Heatmap",
            card(
              card_header(textOutput(ns("filtered_summary_text"))),
              card_body(
                 div(style = "overflow: auto; width: 100%; height: 80vh;",
                   plotOutput(ns("filteredHeatmapPlot"), height = "800px")
                 )
              ),
              card_footer(
                downloadButton(ns("downloadFilteredHeatmapPDF"), "Download PDF"),
                downloadButton(ns("downloadFilteredHeatmapCSV"), "Download Data (CSV)", class="btn-secondary")
              )
            )
          ),
       )
    )
  )
}

# --- Module Server ---

heatmap_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    
  # --- 0. Persistence State ---
    rv_cols <- reactiveValues(hidden = character(0))
    
  # --- 1. Data Selection (Visual Subset Only) ---
    
  # output$heatmapDisplayColumnSelectorUI allows users to HIDE columns from the heatmap
  # WITHOUT affecting the global statistics or filtering.
    output$heatmapDisplayColumnSelectorUI <- renderUI({
      req(input$repMode)
   # Does not use isolate on input$repMode because intended to rebuild checkboxes on mode switch
      
      mat <- if(grepl("aggregate", input$repMode)) aggregatedMatrixData() else replicateMatrixData()
      req(mat)
      cols <- colnames(mat)
      
   # Persistence Logic:
   # Calculate what should be selected based on the persistent hidden set
   # CRITICAL: Isolate this read to prevent re-rendering when user clicks a box (which updates rv_cols)
   # ONLY want to re-render when repMode changes (switching context).
      current_selected <- setdiff(cols, isolate(rv_cols$hidden))
      
      tags$div(
        style = "max-height: 200px; overflow-y: auto; border: 1px solid #e9ecef; padding: 10px; border-radius: 5px;",
        checkboxGroupInput(session$ns("heatmapDisplayColumns"), "Display Columns (Subset):", 
                    choices = cols, selected = current_selected)
      )
    })
    
  # Observer to Update Persistence State
    observeEvent(input$heatmapDisplayColumns, {
    # This runs when user changes selection OR when mode switches (triggering UI rebuild)
       
    # 1. Identify Context
       mat <- if(grepl("aggregate", input$repMode)) aggregatedMatrixData() else replicateMatrixData()
       req(mat)
       all_cols_in_context <- colnames(mat)
       current_selection <- input$heatmapDisplayColumns
       
    # 2. Determine what is explicitly hidden/shown in this context
       hidden_in_context <- setdiff(all_cols_in_context, current_selection)
       visible_in_context <- current_selection
       
    # 3. Get Metadata for Mapping
       meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% colnames(shared_data$data_processed()))
       
    # Reconstruct Grouping (Must match aggregatedMatrixData logic)
       if("Condition" %in% names(meta) && "Population" %in% names(meta)) {
          meta$Group <- paste(meta$Condition, meta$Population, sep="_")
       } else if ("Condition" %in% names(meta)) {
          meta$Group <- meta$Condition
       } else {
          meta$Group <- "All"
       }
       
    # 4. Smart Update Logic
       new_hidden <- rv_cols$hidden
       
       if(grepl("aggregate", input$repMode)) {
     # Context: GROUPS
     # Cascade: Hide Group -> Hide Group + All its Samples
     # Cascade: Show Group -> Show Group + All its Samples
          
     # Handle Hidden
          if(length(hidden_in_context) > 0) {
             samples_to_hide <- meta %>% dplyr::filter(Group %in% hidden_in_context) %>% dplyr::pull(FullName)
             new_hidden <- union(new_hidden, c(hidden_in_context, samples_to_hide))
          }
          
     # Handle Visible (Unhide)
          if(length(visible_in_context) > 0) {
             samples_to_show <- meta %>% dplyr::filter(Group %in% visible_in_context) %>% dplyr::pull(FullName)
             new_hidden <- setdiff(new_hidden, c(visible_in_context, samples_to_show))
          }
          
       } else {
     # Context: SAMPLES
     # Cascade: Hide Sample -> Hide Sample
     # Cascade: Show Sample -> Show Sample + Show its Group
     # Logic: If ALL samples of a group are hidden, Hide Group? (Optional, but keeps Aggregate view clean)
          
     # Handle Hidden
          if(length(hidden_in_context) > 0) {
             new_hidden <- union(new_hidden, hidden_in_context)
          }
          
     # Handle Visible (Unhide Sample -> Unhide Group)
          if(length(visible_in_context) > 0) {
             groups_to_unhide <- meta %>% dplyr::filter(FullName %in% visible_in_context) %>% dplyr::pull(Group) %>% unique()
             new_hidden <- setdiff(new_hidden, c(visible_in_context, groups_to_unhide))
          }
          
     # Consistency Check: If ALL samples of a group are currently hidden, ensure Group is hidden
          all_groups <- unique(meta$Group)
          for(g in all_groups) {
             g_samples <- meta$FullName[meta$Group == g]
       # If all samples are in the hidden set, add Group to hidden set
             if(length(g_samples) > 0 && all(g_samples %in% new_hidden)) {
                new_hidden <- union(new_hidden, g)
             }
          }
       }
       
    # Apply Update
       rv_cols$hidden <- new_hidden
       
    }, ignoreNULL = FALSE) # Run even if selection is empty (hide all)
    outputOptions(output, "heatmapDisplayColumnSelectorUI", suspendWhenHidden = FALSE)
    
  # --- 1c. Cell Annotation UI ---
    output$cellAnnotationUI <- renderUI({
      req(input$activateCellAnnotation, replicateMatrixData())
      meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% colnames(replicateMatrixData()))
      
   # Grouping Logic for Annotation (Fallback to Condition if DE not set?)
   # checking the global setting if available, or infer from metadata
   # The shared_data doesn't explicitly export "DeOrientCondition" inputs, but capable to look at dynamic Logic.
   # For simplicty, let's group by "Condition" and "Population" if available.
      
      meta_groups <- if("Condition" %in% names(meta) && "Population" %in% names(meta)) {
         paste(meta$Condition, meta$Population, sep="_")
      } else if ("Condition" %in% names(meta)) {
         meta$Condition
      } else {
         "All"
      }
      unique_groups <- sort(unique(meta_groups))
      
      default_colors <- viridisLite::viridis(length(unique_groups), alpha = 0.9)
      
      lapply(seq_along(unique_groups), function(i) {
        g_name <- unique_groups[i]
        safe_id <- gsub("[^A-Za-z0-9_]", "", g_name)
        layout_columns(col_widths = c(8, 4),
           textInput(session$ns(paste0("cell_name_", safe_id)), label=strong(g_name), value=g_name),
           colourInput(session$ns(paste0("cell_color_", safe_id)), label=NULL, value=default_colors[i])
        )
      })
    })
    
    cellAnnotationMapping <- reactive({
      req(input$activateCellAnnotation, replicateMatrixData())
      meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% colnames(replicateMatrixData()))
      
      meta$Group <- if("Condition" %in% names(meta) && "Population" %in% names(meta)) {
         paste(meta$Condition, meta$Population, sep="_")
      } else if ("Condition" %in% names(meta)) {
         meta$Condition
      } else {
         "All"
      }
      unique_groups <- sort(unique(meta$Group))
      
   # Ensure inputs exist
      safe_first <- gsub("[^A-Za-z0-9_]", "", unique_groups[1])
      req(input[[paste0("cell_color_", safe_first)]])
      
      group_map <- purrr::map_dfr(unique_groups, function(g_name) {
        safe_id <- gsub("[^A-Za-z0-9_]", "", g_name)
        tibble::tibble(
          Group = g_name,
          Cell = input[[paste0("cell_name_", safe_id)]] %||% g_name,
          Color = input[[paste0("cell_color_", safe_id)]] %||% "#808080"
        )
      })
      
      if(grepl("aggregate", input$repMode, ignore.case = TRUE)) {
         df <- group_map %>% dplyr::select(Group, Cell) %>% tibble::column_to_rownames("Group")
         colors <- stats::setNames(group_map$Color, group_map$Cell)
         list(df = df, colors = colors)
      } else {
         df_long <- meta %>% dplyr::left_join(group_map, by="Group") %>% dplyr::select(FullName, Cell)
         df <- df_long %>% tibble::column_to_rownames("FullName")
         colors <- stats::setNames(group_map$Color, group_map$Cell)
         list(df = df, colors = colors)
      }
    })
    
  # --- 2. Data Processing (Consuming Global Data) ---
    
  # --- CRITICAL ARCHITECTURAL FIX: REPLICATE COLUMN ORDERING ---
    replicateMatrixData <- reactive({
   # Global Data Processed already contains only the 'Input & Run' selected samples
   # AND has imputed/normalized values.
      df <- shared_data$data_processed() 
      req(df)
      
   # Apply Global Filters (Panels 4-7)
   # This ensures even 'unfiltered' heatmap respects the user's class/chain selections.
      filtered_ids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_ids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      
   # extracting numbers using shared_data selected cols
   # (Note: data_processed usually returns Lipid_Name + numerics)
      mat <- df %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      
   # Prevent 'Block Dislocation' by physically grouping columns by Condition
      meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% colnames(mat))
      meta$Group <- if("Condition" %in% names(meta) && "Population" %in% names(meta)) {
         paste(meta$Condition, meta$Population, sep="_")
      } else if ("Condition" %in% names(meta)) {
         meta$Condition
      } else { "All" }
      
   # Strictly arrange metadata by Group to force replicates together left-to-right
   # removed: meta <- meta %>% dplyr::arrange(Group, FullName)
   # mat <- mat[, meta$FullName, drop=FALSE]
      
   # Use the order from shared_data (which reflects CSV input order)
   # Ensure only use columns that are present in Mat
      valid_cols <- intersect(colnames(df), meta$FullName)
      mat <- mat[, valid_cols, drop=FALSE]
      mat
    })
    
  # --- SYNCHRONIZED AGGREGATE LOGIC ---
    aggregatedMatrixData <- reactive({
      mat <- replicateMatrixData()
      req(mat)
      
      meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% colnames(mat))
      meta$Group <- if("Condition" %in% names(meta) && "Population" %in% names(meta)) {
         paste(meta$Condition, meta$Population, sep="_")
      } else if ("Condition" %in% names(meta)) {
         meta$Condition
      } else { "All" }
      
   # Re-apply strict alignment to prevent Aggregate/Replicate mismatch
   # removed: meta <- meta %>% dplyr::arrange(Group, FullName)
      
   # Use appearance order for groups
   # meta is already filtered to columns in mat.
   # mat is now ordered by CSV (from replicateMatrixData change above).
   # However, aggregatedMatrixData calls replicateMatrixData().
   # So 'mat' here is ALREADY ordered by CSV.
      
   # just need to extract unique groups in appearance order.
   # But accessing meta$Group directly might not be sorted by appearance if meta wasn't sorted?
   # Required to map mat columns to groups in order.
      
      meta_ordered <- meta[match(colnames(mat), meta$FullName), ]
      
   # Explicit Aggregation using base R to ensure Matrix output
   # tapply returns array if simplified=TRUE
   # Explicit Aggregation using base R to ensure Matrix output
   # tapply returns array if simplified=TRUE
      groups <- unique(meta_ordered$Group)
      if(length(groups) == 0) return(mat)
      
   # Helper to get mean of a group for a row
   # This is safer than tapply over entire matrix if NAs are present
      res_list <- lapply(groups, function(g) {
         cols <- meta$FullName[meta$Group == g]
         if(length(cols) == 0) return(rep(NA, nrow(mat)))
         if(length(cols) == 1) return(mat[, cols])
         rowMeans(mat[, cols], na.rm=TRUE)
      })
      res <- do.call(cbind, res_list)
      colnames(res) <- groups
      rownames(res) <- rownames(mat)
      res
    })
    
  # --- 5. Plotting ---
    unfilteredHeatmapObj <- reactive({
      req(input$repMode, input$heatmapScaleMode)
      if(isTRUE(input$fineTuneColors)) {
        if(input$heatmapScaleMode == 'global_zscore') {
           req(input$gz_low, input$gz_mid, input$gz_high)
        } else {
           req(input$seq_low, input$seq_high)
        }
      }
      
      mat <- if(grepl("aggregate", input$repMode)) aggregatedMatrixData() else replicateMatrixData()
      req(mat)
      
   # CONSUMER: Use Global Filtered Lipids
      lipids <- shared_data$global_filtered_lipids()
      req(lipids)
      
   # Determine sorting matrix (Strict Logic)
   # --- COLUMN SUBSETTING FIRST ---
   # Crucial: Sorting must depend ONLY on what is VISIBLE.
      req(input$heatmapDisplayColumns)
      valid_cols <- intersect(colnames(mat), input$heatmapDisplayColumns) # Preserves grouped order
      if(length(valid_cols) == 0) return(NULL)
      
      mat_display <- mat[rownames(mat) %in% lipids, valid_cols, drop=FALSE]
      validate(need(nrow(mat_display) >= 2 && ncol(mat_display) >= 2, "Insufficient data matrix dimensions to render Unfiltered Heatmap. Verify selections."))
      
   # --- MAT_SORT REDEFINITION ---
      mat_sort <- NULL
      actual_sort_mode <- "class"
      
      if (input$repMode == "replicate_fixed_class") {
     # Mode B: Strictly project Aggregate on visible Replicates ONLY (1:1 Mapping)
         agg <- aggregatedMatrixData()
         meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% valid_cols)
         meta$Group <- if("Condition" %in% names(meta) && "Population" %in% names(meta)) {
            paste(meta$Condition, meta$Population, sep="_")
         } else if ("Condition" %in% names(meta)) {
            meta$Condition
         } else { "All" }
         
         active_groups <- intersect(colnames(agg), unique(meta$Group))
         agg_subset <- agg[rownames(mat_display), active_groups, drop=FALSE]
         
         canonical_class_order <- names(shared_data$class_color_map())
         if(is.null(canonical_class_order) && exists("CLASS_MAP_COLORS")) canonical_class_order <- names(CLASS_MAP_COLORS)
         canonical_origin_order <- names(shared_data$origin_color_map())
         if(is.null(canonical_origin_order) && exists("HYPERCLASS_MAP_COLORS")) canonical_origin_order <- names(HYPERCLASS_MAP_COLORS)
         
         sort_cols_param <- input$staircaseGroup %||% "subclass"
         
     # Calculate exact Aggregate projection
         sres <- staircase_sort(shared_data$annotationData(), agg_subset, secondary_sort_mode = "class", 
                                sort_cols = c(sort_cols_param, "Total_Carbons", "Total_DB"),
                                fixed_class_order = canonical_class_order,
                                fixed_origin_order = canonical_origin_order)
         
     # Apply 1:1 Projection to visible replicates and bypass any further sort
         target_row_order <- intersect(rownames(sres$mat_ordered), rownames(mat_display))
         mat_display <- mat_display[target_row_order, , drop=FALSE]
         actual_sort_mode <- "none"
         mat_sort <- mat_display
         
      } else {
     # Modes A and C natively sort the visible matrix
         mat_sort <- mat_display
      }
      
      cell_anno <- if(isTRUE(input$activateCellAnnotation)) cellAnnotationMapping() else NULL
      sort_cols_param <- input$staircaseGroup %||% "subclass"

      heatmap_res <- generateHeatmapObject(mat_display, "Unfiltered Heatmap", 
                            mat_for_sorting = mat_sort,
                            sort_mode = actual_sort_mode, 
                            annotation_data = shared_data$annotationData(),
                            cell_annotation = cell_anno,
                            show_grid = isTRUE(input$showHeatmapGrid), grid_color = input$heatmapGridColor,
                            hide_row_names = isTRUE(input$hideHeatmapRowNames),
                            display_mat = if(isTRUE(input$showHeatmapNumbers)) mat_display else NULL,
                            scale_mode = input$heatmapScaleMode, fine_tune = isTRUE(input$fineTuneColors),
                            colors_diverging = c(input$gz_low, input$gz_mid, input$gz_high),
                            colors_sequential = c(input$seq_low, input$seq_high),
                            class_colors = shared_data$class_color_map(),
                            origin_colors = shared_data$origin_color_map(), # Pass dynamic origin colors
                            annotation_cols = sort_cols_param) # Pass grouping variable vector
                            
      validate(need(!is.null(heatmap_res), "Heatmap rendering failed internally. Check R console for logs."))
      
      return(heatmap_res)
    })
    
    filteredHeatmapObj <- reactive({
      req(input$repMode, input$heatmapScaleMode)
      if(isTRUE(input$fineTuneColors)) {
        if(input$heatmapScaleMode == 'global_zscore') {
           req(input$gz_low, input$gz_mid, input$gz_high)
        } else {
           req(input$seq_low, input$seq_high)
        }
      }
      mat <- if(grepl("aggregate", input$repMode)) aggregatedMatrixData() else replicateMatrixData()
      req(mat)
      
   # CONSUMER: Global Signals
      sig_lipids <- shared_data$significant_lipids()
      class_lipids <- shared_data$global_filtered_lipids()
      
   # VALIDATION
      validate(need(!is.null(sig_lipids), "Please configure Differential Expression (Panel 3) in the Global Sidebar."))
      validate(need(length(sig_lipids) > 0, "No lipids passed significance filters."))
      final_lipids <- intersect(sig_lipids, class_lipids)
      validate(need(length(final_lipids) > 0, "No lipids passed BOTH significance and current class/chain filters."))
      
   # Determine sorting matrix (Strict Logic)
   # --- COLUMN SUBSETTING FIRST ---
   # Crucial: Sorting must depend ONLY on what is VISIBLE.
      req(input$heatmapDisplayColumns)
      valid_cols <- intersect(colnames(mat), input$heatmapDisplayColumns)
      if(length(valid_cols) == 0) return(NULL)
      
   # Subset the source matrix (mat corresponds to repMode: Aggregate or Replicate)
      mat_display <- mat[rownames(mat) %in% final_lipids, valid_cols , drop=FALSE]
      
      validate(need(nrow(mat_display) >= 2 && ncol(mat_display) >= 2, "Insufficient data matrix dimensions to render Filtered Heatmap. Verify selections."))
      
   # --- MAT_SORT REDEFINITION ---
      mat_sort <- NULL
      actual_sort_mode <- "class"
      
      if (input$repMode == "replicate_fixed_class") {
     # Mode B Redefinition
         agg <- aggregatedMatrixData()
         meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% valid_cols)
         meta$Group <- if("Condition" %in% names(meta) && "Population" %in% names(meta)) {
            paste(meta$Condition, meta$Population, sep="_")
         } else if ("Condition" %in% names(meta)) {
            meta$Condition
         } else { "All" }
         
         active_groups <- intersect(colnames(agg), unique(meta$Group))
         agg_subset <- agg[rownames(mat_display), active_groups, drop=FALSE]
         
         canonical_class_order <- names(shared_data$class_color_map())
         if(is.null(canonical_class_order) && exists("CLASS_MAP_COLORS")) canonical_class_order <- names(CLASS_MAP_COLORS)
         canonical_origin_order <- names(shared_data$origin_color_map())
         if(is.null(canonical_origin_order) && exists("HYPERCLASS_MAP_COLORS")) canonical_origin_order <- names(HYPERCLASS_MAP_COLORS)
         
         sort_cols_param <- input$staircaseGroup %||% "subclass"
         
         sres <- staircase_sort(shared_data$annotationData(), agg_subset, secondary_sort_mode = "class", 
                                sort_cols = c(sort_cols_param, "Total_Carbons", "Total_DB"),
                                fixed_class_order = canonical_class_order,
                                fixed_origin_order = canonical_origin_order)
         
         target_row_order <- intersect(rownames(sres$mat_ordered), rownames(mat_display))
         mat_display <- mat_display[target_row_order, , drop=FALSE]
         actual_sort_mode <- "none"
         mat_sort <- mat_display
         
      } else {
         mat_sort <- mat_display
      }
      
      cell_anno <- if(isTRUE(input$activateCellAnnotation)) cellAnnotationMapping() else NULL
      sort_cols_param <- input$staircaseGroup %||% "subclass"

      heatmap_res <- generateHeatmapObject(mat_display, "Filtered Heatmap", 
                            mat_for_sorting = mat_sort,
                            sort_mode = actual_sort_mode,
                            annotation_data = shared_data$annotationData(),
                            cell_annotation = cell_anno,
                            show_grid = isTRUE(input$showHeatmapGrid), grid_color = input$heatmapGridColor,
                            hide_row_names = isTRUE(input$hideHeatmapRowNames),
                            display_mat = if(isTRUE(input$showHeatmapNumbers)) mat_display else NULL,
                            scale_mode = input$heatmapScaleMode, fine_tune = isTRUE(input$fineTuneColors),
                            colors_diverging = c(input$gz_low, input$gz_mid, input$gz_high),
                            colors_sequential = c(input$seq_low, input$seq_high),
                            class_colors = shared_data$class_color_map(),
                            origin_colors = shared_data$origin_color_map(),
                            annotation_cols = sort_cols_param)
                            
      validate(need(!is.null(heatmap_res), "Heatmap rendering failed internally. Check R console for logs."))
      
      return(heatmap_res)
    })
    
    output$heatmapPlot <- renderPlot({ 
      obj <- unfilteredHeatmapObj(); req(obj)
      grid::grid.newpage(); grid::grid.draw(obj$ht$gtable) 
    })
    
    output$filteredHeatmapPlot <- renderPlot({ 
      obj <- filteredHeatmapObj(); req(obj)
      grid::grid.newpage(); grid::grid.draw(obj$ht$gtable) 
    })
    
  # --- DE Debug Output (Data Consumer) ---
    output$deDebugInfo <- renderPrint({
   # Consumes global DE contrast info
      contrast <- shared_data$de_contrast_info()
      req(contrast)
      
      cat("Reference Groups:", paste(contrast$ref, collapse=", "), "\n")
      cat("Comparison Groups:", paste(contrast$comp, collapse=", "), "\n")
      cat("Contrast String:", contrast$str, "\n")
      
      res <- shared_data$de_results()
      if(is.null(res)) {
        cat("Result: NULL (Limma failed or returned nothing)\n")
      } else {
        cat("Result Rows:", nrow(res), "\n")
    # Note: don't have direct access to pFilterThreshold here unless pass it, 
    # but capable to show summary stats.
        cat("Significant (Raw P < 0.05):", sum(res$p_raw < 0.05), "\n")
        cat("Significant (Adj P < 0.05):", sum(res$p_adj_bh < 0.05), "\n")
      }
    })
    
    output$deResultsTable <- DT::renderDataTable({
      res <- shared_data$de_results()
      req(res)
      DT::datatable(res, options = list(pageLength = 10, scrollX = TRUE)) %>%
        DT::formatRound(columns = c("log2FC", "t_stat", "p_raw", "p_adj_bh"), digits = 4)
    })
    
    output$unfiltered_summary_text <- renderText({
       l <- shared_data$global_filtered_lipids()
       if(is.null(l)) "No Lipids Selected" else paste("Displaying", length(l), "Lipids (Unfiltered)")
    })
    
    output$filtered_summary_text <- renderText({
       l <- shared_data$global_filtered_lipids()
       sig <- shared_data$significant_lipids()
       if(is.null(sig)) return("DE Analysis Not Run")
       final <- intersect(l, sig)
       paste("Displaying", length(final), "Lipids (DE Filtered)")
    })
    output$downloadHeatmapPDF <- downloadHandler(
      filename = function() { paste0("Unfiltered_Heatmap_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          obj <- unfilteredHeatmapObj()
          req(obj)
          
     # WYSIWYG Logic: Extract dimensions from clientData or fallback
          w <- session$clientData[[paste0("output_", session$ns("heatmapPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("heatmapPlot"), "_height")]]
          
          if (!is.null(w) && !is.null(h)) {
              w_in <- w / 72
              h_in <- h / 72
          } else {
              n_rows <- nrow(obj$data)
              h_in <- max(10, n_rows * 0.015)
              w_in <- 12
          }
          
          pdf(file, width = w_in, height = h_in)
          grid::grid.draw(obj$ht$gtable)
          dev.off()
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in Heatmap PDF generation:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )

    output$downloadHeatmapCSV <- downloadHandler(
      filename = function() { paste0("Unfiltered_Heatmap_Data_", format(Sys.Date(), "%Y%m%d"), ".csv") },
      content = function(file) {
        obj <- unfilteredHeatmapObj()
        req(obj)
    # obj$data is the matrix used for plotting (ordered, subsetted)
    # It is linear scale (before Z-score).
        out_df <- as.data.frame(obj$data) %>% tibble::rownames_to_column("Lipid_Name")
        write.csv(out_df, file, row.names = FALSE)
      }
    )
    
    output$downloadFilteredHeatmapPDF <- downloadHandler(
      filename = function() { paste0("Filtered_Heatmap_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          obj <- filteredHeatmapObj()
          req(obj)
     # Check if obj is valid
          if(is.null(obj$ht$gtable)) return(NULL)
          
     # WYSIWYG Logic: Extract dimensions from clientData or fallback
          w <- session$clientData[[paste0("output_", session$ns("filteredHeatmapPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("filteredHeatmapPlot"), "_height")]]
          
          if (!is.null(w) && !is.null(h)) {
              w_in <- w / 72
              h_in <- h / 72
          } else {
              n_rows <- nrow(obj$data)
              h_in <- max(10, n_rows * 0.015)
              w_in <- 12
          }
          
          pdf(file, width = w_in, height = h_in)
          grid::grid.draw(obj$ht$gtable)
          dev.off()
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in Heatmap PDF generation:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )

    output$downloadFilteredHeatmapCSV <- downloadHandler(
      filename = function() { paste0("Filtered_Heatmap_Data_", format(Sys.Date(), "%Y%m%d"), ".csv") },
      content = function(file) {
        obj <- filteredHeatmapObj()
        req(obj)
        if(is.null(obj$data)) return(NULL)
        
        out_df <- as.data.frame(obj$data) %>% tibble::rownames_to_column("Lipid_Name")
        write.csv(out_df, file, row.names = FALSE)
      }
    )
    
  # --- Debug Export ---
    return(reactive({
      u_obj <- unfilteredHeatmapObj()
      f_obj <- filteredHeatmapObj() # May be NULL if no DE
      
      list(
        replicate_matrix = replicateMatrixData(),
        aggregated_matrix = aggregatedMatrixData(),
        sort_mode = input$repMode,
        scale_mode = input$heatmapScaleMode,
        
    # Unfiltered State
        unfiltered_rows = if(!is.null(u_obj)) rownames(u_obj$data) else NULL,
        unfiltered_preview = if(!is.null(u_obj)) head(u_obj$data) else NULL,
        
    # Filtered State
        filtered_rows = if(!is.null(f_obj)) rownames(f_obj$data) else NULL,
        filtered_preview = if(!is.null(f_obj)) head(f_obj$data) else NULL,
        filtered_annotation = if(!is.null(f_obj)) {
           shared_data$annotationData() %>% 
             dplyr::filter(Lipid_Name %in% rownames(f_obj$data)) %>%
             dplyr::select(any_of(c("Lipid_Name", "subclass", "Total_Carbons", "Total_DB")))
        } else NULL,
        
        class_map = shared_data$class_color_map()
      )
    }))
  })
}
