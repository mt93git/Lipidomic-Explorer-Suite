# R/modules/5_barchart_module.R
# Composition Bar Charts.

barchart_ui <- function(id) {
  ns <- NS(id)
  tagList(
    sidebarLayout(
      sidebarPanel(
        width = 3,
        accordion(
          open = "1. Bar Settings",
          accordion_panel("1. Bar Settings", icon = icon("chart-bar"),
            radioButtons(ns("barGroupMode"), "Group By:", 
                         choices = c("Class" = "Sub-class", "Biosynthetic Origin" = "Hyperclass", "Lipid Mediator Single Species" = "Lipid_Name"), 
                         selected = "Sub-class"),
            radioButtons(ns("barValueMode"), "Value Mode:", 
                         choices = c("Absolute (intensity)", "Absolute (%)", 
                                     "Normalized (intensity)", "Normalized (%)"), 
                         selected = "Absolute (intensity)"),
            radioButtons(ns("barOrientation"), "Orientation:", 
                         choices = c("Samples on X" = "sample_x", "Classes on X" = "class_x"), 
                         selected = "sample_x"),
            hr(),
            radioButtons(ns("dataLevel"), "Data Level:",
                         choices = c("Individual Samples" = "individual", "Group Average" = "average"),
                         selected = "individual"),
            conditionalPanel(
              condition = "input.dataLevel == 'average'", ns = ns,
              checkboxInput(ns("showErrorBars"), "Show Error Bars (Total)", value = TRUE)
            ),
            hr(),
            uiOutput(ns("barDisplayColumnSelectorUI"))
          )
        )
      ),
      mainPanel(
        width = 9,
        tabsetPanel(
          tabPanel("Unfiltered (All)",
            card(
              card_header("Unfiltered Composition"),
              card_body(jqui_resizable(plotOutput(ns("barPlotUnfiltered"), height = "70vh"))),
              card_footer(
                layout_columns(
                  col_widths = c(2, 2),
                  downloadButton(ns("downloadBarPDF_Unfiltered"), "PDF"),
                  downloadButton(ns("downloadBarCSV_Unfiltered"), "CSV")
                )
              )
            )
          ),
          tabPanel("Filtered",
            card(
              card_header("Filtered Composition"),
              card_body(jqui_resizable(plotOutput(ns("barPlotFiltered"), height = "70vh"))),
              card_footer(
                layout_columns(
                  col_widths = c(2, 2),
                  downloadButton(ns("downloadBarPDF_Filtered"), "PDF"),
                  downloadButton(ns("downloadBarCSV_Filtered"), "CSV")
                )
              )
            )
          )
        )
      )
    )
  )
}

barchart_server <- function(id, shared_data, global_color_map) {
  moduleServer(id, function(input, output, session) {
    
  # --- Helper Reactives for consistent grouping/coloring ---
    barGroupingMap <- reactive({
      if (input$dataLevel != "average") return(NULL)
      
   # Use metadata for all samples in processed data
      df <- shared_data$data_processed()
      req(df)
      cols <- setdiff(names(df), "Lipid_Name")
      
      meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% cols)
      
   # Robust Grouping: Check for "Population"
      groups <- if ("Population" %in% names(meta)) {
         paste(meta$Condition, meta$Population, sep="_")
      } else {
         meta$Condition
      }
      setNames(groups, meta$FullName)
    })
    
    barSampleColors <- reactive({
       is_agg <- input$dataLevel == "average"
       cond_map <- global_color_map()$Condition
       
       if (is_agg) {
     # Map Group -> Color (via Condition)
          g_map <- barGroupingMap()
          req(g_map)
          groups <- unique(g_map)
          
          meta <- shared_data$all_metadata()
     # Lookup: GroupName -> ConditionName
     # reconstruct the G column to build lookup
          df_lookup <- meta %>% 
            dplyr::mutate(G = if("Population" %in% names(meta)) paste(Condition, Population, sep="_") else Condition) %>%
            dplyr::distinct(G, Condition)
          
          lookup <- setNames(df_lookup$Condition, df_lookup$G)
          stats::setNames(cond_map[lookup[groups]], groups)
       } else {
     # Map Sample -> Color
          meta <- shared_data$all_metadata()
          stats::setNames(cond_map[meta$Condition], meta$FullName)
       }
    })
    
  # --- 0. Column Selector ---
    output$barDisplayColumnSelectorUI <- renderUI({
      df <- shared_data$data_processed()
      req(df)
      cols <- setdiff(names(df), "Lipid_Name")
      
      tags$div(
        style = "max-height: 200px; overflow-y: auto; border: 1px solid #e9ecef; padding: 10px; border-radius: 5px;",
        checkboxGroupInput(session$ns("barDisplayColumns"), "Display Columns (Subset):", 
                    choices = cols, selected = cols)
      )
    })
    
  # --- Unfiltered Data ---
    unfilteredData <- reactive({
      req(shared_data$data_processed())
      df <- shared_data$data_processed()
      
   # Apply Global Filters (Panels 4-7)
      filtered_ids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_ids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      
   # Apply Column Subset
      if (!is.null(input$barDisplayColumns)) {
         use_cols <- intersect(names(df), c("Lipid_Name", input$barDisplayColumns))
     # Validate at least one sample column remains
         if (length(use_cols) > 1) { 
            df <- df %>% dplyr::select(all_of(use_cols))
             df <- df %>% dplyr::select(all_of(use_cols))
         }
      }

      mat <- df %>% dplyr::select(-Lipid_Name) %>% as.matrix()
      rownames(mat) <- df$Lipid_Name
      mat
    })
    
    output$barPlotUnfiltered <- renderPlot({
      mat <- unfilteredData()
      req(mat)
      
      is_agg <- input$dataLevel == "average"
      
      title <- paste0("Unfiltered Composition (", input$barValueMode, ")")
      buildBarPlot(mat, title,
                              annotation_data = shared_data$annotationData(),
                              group_mode = input$barGroupMode,
                              value_mode = input$barValueMode,
                              orientation = input$barOrientation,
                              sample_grouping = barGroupingMap(),
                              aggregate_by_group = is_agg,
                              compute_error_bars = isTRUE(input$showErrorBars),
                              sample_colors = barSampleColors(),
                              class_colors = switch(input$barGroupMode, "Lipid_Name" = shared_data$species_color_map(), "Hyperclass" = shared_data$origin_color_map(), shared_data$class_color_map()))
    })
    
  # --- Filtered Data ---
    filteredBarData <- reactive({
      req(shared_data$data_processed())
      
   # Retrieve Global Filters
      gl <- shared_data$global_filtered_lipids()
      sl <- shared_data$significant_lipids()
      
   # Logic: Intersection of Global Filter + Significant Lipids
   # If NO DE has been run (sl is NULL), should show just Global Filter?
   # The users expectation for "Filtered" usually implies "Significant" in this pipeline context.
   # If DE is active, intersect. If not, might fall back to just global or empty?
   # Given the prompt "Filtered View uses lipids selected in the Heatmap modules",
   # and Heatmap Filtered view is (Global \intersect Significant), must match that.
      
      final_lipids <- if (!is.null(sl)) {
        if (!is.null(gl)) intersect(gl, sl) else sl
      } else {
    # If no significant lipids (DE not run), return NULL or empty to indicate 
    # that "Filtered" view requires DE results (or could show just class filtered, 
    # but differentiation from Unfiltered tab is usually DE).
    # Let's check shared_data_module de_results existence.
    # Use strict validation to guide user.
        NULL 
      }
      
      validate(need(!is.null(sl), "No differential expression results available. Run DE first."))
      validate(need(length(final_lipids) > 0, "No lipids passed filters (Significant & Global Filters)."))
      
   # Correct Logic: Filter first, then remove column, then matrix
      df_sub <- shared_data$data_processed() %>% dplyr::filter(Lipid_Name %in% final_lipids)
      
   # Apply Column Subset
      if (!is.null(input$barDisplayColumns)) {
         use_cols <- intersect(names(df_sub), c("Lipid_Name", input$barDisplayColumns))
         if (length(use_cols) > 1) {
            df_sub <- df_sub %>% dplyr::select(all_of(use_cols))
         }
      }
      
      mat <- df_sub %>% 
        dplyr::select(-Lipid_Name) %>% 
        as.matrix()
      
      rownames(mat) <- df_sub$Lipid_Name
      
      mat
    })
    
    output$barPlotFiltered <- renderPlot({
      mat <- filteredBarData()
      req(mat)
      
      is_agg <- input$dataLevel == "average"
      
      title <- paste0("Filtered Composition (", input$barValueMode, ")")
      buildBarPlot(mat, title, 
                              annotation_data = shared_data$annotationData(),
                              group_mode = input$barGroupMode,
                              value_mode = input$barValueMode,
                              orientation = input$barOrientation,
                              sample_grouping = barGroupingMap(),
                              aggregate_by_group = is_agg,
                              compute_error_bars = isTRUE(input$showErrorBars),
                              sample_colors = barSampleColors(),
                              class_colors = switch(input$barGroupMode, "Lipid_Name" = shared_data$species_color_map(), "Hyperclass" = shared_data$origin_color_map(), shared_data$class_color_map()))
    })
    
  # --- Downloads (Unfiltered) ---
    output$downloadBarPDF_Unfiltered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Barchart_Unfiltered", extension = "pdf", repMode = "Agg") },
      content = function(file) {
        tryCatch({
          mat <- unfilteredData()
          
          is_agg <- input$dataLevel == "average"
          
     # Dynamic Color Selection
          current_color_map <- switch(input$barGroupMode,
               "Lipid_Name" = shared_data$species_color_map(),
               "Hyperclass" = shared_data$origin_color_map(),
               shared_data$class_color_map()
          )
          
          p <- buildBarPlot(mat, paste0("Unfiltered Composition"), 
                                       annotation_data = shared_data$annotationData(),
                                       group_mode = input$barGroupMode,
                                       value_mode = input$barValueMode,
                                       orientation = input$barOrientation,
                                       sample_grouping = barGroupingMap(),
                                       aggregate_by_group = is_agg,
                                       compute_error_bars = isTRUE(input$showErrorBars),
                                       sample_colors = barSampleColors(),
                                       class_colors = current_color_map)
          w <- session$clientData[[paste0("output_", session$ns("barPlotUnfiltered"), "_width")]] %||% 1000
          h <- session$clientData[[paste0("output_", session$ns("barPlotUnfiltered"), "_height")]] %||% 800
          
     # Override with exact shinyjqui resize dimensions if available
          if(!is.null(input$barPlotUnfiltered_size)) {
              w <- input$barPlotUnfiltered_size$width
              h <- input$barPlotUnfiltered_size$height
          }
          
          ggplot2::ggsave(file, plot=p, device="pdf", width=w/72, height=h/72, limitsize=FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in Barchart PDF generation:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
     output$downloadBarCSV_Unfiltered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Barchart_Unfiltered_Data", extension = "csv", repMode = "Agg") },
      content = function(file) {
        mat <- unfilteredData()
        df <- as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name")
        write.csv(df, file, row.names = FALSE)
      }
    )

  # --- Downloads (Filtered) ---
    output$downloadBarPDF_Filtered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Barchart_Filtered", extension = "pdf", repMode = "Agg") },
      content = function(file) {
        tryCatch({
          mat <- filteredBarData()
          
          is_agg <- input$dataLevel == "average"
          
     # Dynamic Color Selection
          current_color_map <- switch(input$barGroupMode,
               "Lipid_Name" = shared_data$species_color_map(),
               "Hyperclass" = shared_data$origin_color_map(),
               shared_data$class_color_map()
          )
          
          p <- buildBarPlot(mat, paste0("Filtered Composition"), 
                                       annotation_data = shared_data$annotationData(),
                                       group_mode = input$barGroupMode,
                                       value_mode = input$barValueMode,
                                       orientation = input$barOrientation,
                                       sample_grouping = barGroupingMap(),
                                       aggregate_by_group = is_agg,
                                       compute_error_bars = isTRUE(input$showErrorBars),
                                       sample_colors = barSampleColors(),
                                       class_colors = current_color_map)
          w <- session$clientData[[paste0("output_", session$ns("barPlotFiltered"), "_width")]] %||% 1000
          h <- session$clientData[[paste0("output_", session$ns("barPlotFiltered"), "_height")]] %||% 800
          
     # Override with exact shinyjqui resize dimensions if available
          if(!is.null(input$barPlotFiltered_size)) {
              w <- input$barPlotFiltered_size$width
              h <- input$barPlotFiltered_size$height
          }
          
          ggplot2::ggsave(file, plot=p, device="pdf", width=w/72, height=h/72, limitsize=FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in Barchart PDF generation:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
     output$downloadBarCSV_Filtered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Barchart_Filtered_Data", extension = "csv", repMode = "Agg") },
      content = function(file) {
        mat <- filteredBarData()
        df <- as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name")
        write.csv(df, file, row.names = FALSE)
      }
    )
    
  })
}
