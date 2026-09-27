# R/modules/5_barchart_module.R
# Composition Bar Charts.

barchart_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        accordion(
          open = c("0. Sample Grouping & Nomenclature", "1. Bar Settings", "2. Error Bars"), multiple = TRUE,
          accordion_panel("0. Sample Grouping & Nomenclature", icon = icon("layer-group"),
            radioButtons(ns("repMode"), "Grouping Mode (Single/Merged Samples):",
                         choices = c("Merged Samples (Group Average)" = "aggregate_class", 
                                     "Single Replicates (Group Order)" = "replicate_fixed_class",
                                     "Single Replicates (Class Clustered)" = "replicate_resort_class"),
                         selected = "aggregate_class"),
            hr(),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Bar Settings", icon = icon("chart-bar"),
            uiOutput(ns("barGroupModeUI")),
            radioButtons(ns("barValueMode"), tags$span("Value Mode:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Calculates cumulative abundance either as absolute values or standardized/normalized values, expressed as raw intensity or percentage composition.")), 
                         choices = c("Absolute (intensity)", "Absolute (%)", 
                                     "Normalized (intensity)", "Normalized (%)"), 
                         selected = "Absolute (intensity)"),
            radioButtons(ns("barOrientation"), tags$span("Orientation:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Determines whether samples or lipid classes/features are aligned on the X-axis (or represent individual donuts).")), 
                         choices = c("Samples on X" = "sample_x", "Classes on X" = "class_x"), 
                         selected = "sample_x"),
            hr(),
            uiOutput(ns("barDisplayColumnSelectorUI"))
          ),
          accordion_panel("2. Error Bars", icon = icon("chart-column"),
            conditionalPanel(
              condition = "input.repMode == 'aggregate_class'", ns = ns,
              checkboxInput(ns("showErrorBars"), "Show Error Bars", value = TRUE),
              conditionalPanel(
                condition = "input.showErrorBars == true", ns = ns,
                radioButtons(ns("errorBarType"), tags$span("Error Bar Type:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Total Bar displays a single error bar representing cumulative variance for the stacked class total; Individual Segments displays separate error bar segments representing variance for each individual species.")),
                             choices = c("Total Bar" = "total", "Individual Segments" = "individual"),
                             selected = "total"),
                conditionalPanel(
                  condition = "input.errorBarType == 'individual'", ns = ns,
                  checkboxInput(ns("colorErrorBarsByClass"), tags$span("Color error bars by class color?", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Colors the error bars using the color of the corresponding lipid class instead of black.")), value = FALSE)
                ),
                radioButtons(ns("errorBarStatsMode"), tags$span("Statistical Mode Choice:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Standard Deviation (SD) measures the dispersion or variability of replicates within groups; Standard Error of the Mean (SEM) measures the precision of the estimated group mean.")),
                             choices = c("Standard Deviation (SD)" = "sd", "Standard Error of the Mean (SEM)" = "sem"),
                             selected = "sem")
              )
            ),
            conditionalPanel(
              condition = "input.repMode != 'aggregate_class'", ns = ns,
              tags$div(
                class = "text-muted small py-2",
                icon("info-circle", class = "me-1 text-secondary"),
                "Error bars are available when Grouping Mode is set to Merged Samples (Group Average)."
              )
            )
          )
        ),
        hr(),
        conditionalPanel(
          condition = paste0(
            "(input['", ns("barchart_tabs"), "'] == 'Unfiltered (All)' && input['", ns("unfiltered_subtabs"), "'] == 'Donutplot') || ",
            "(input['", ns("barchart_tabs"), "'] == 'Filtered' && input['", ns("filtered_subtabs"), "'] == 'Donutplot')"
          ),
          checkboxInput(ns("showDonutStats"), "Show Donut Proportion", FALSE),
          sliderInput(ns("donutZoom"), "Viewport Zoom %:", min=10, max=200, value=70, step=10),
          hr()
        ),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Composition",
          subtitle = "This module visualizes the absolute and relative composition of the lipidome across different categories:",
          bullets = list(
            tags$li(tags$strong("Unfiltered (All):"), " Visualize composition profiles across all measured lipid species using stacked barcharts, grid plots, or donut charts."),
            tags$li(tags$strong("Filtered:"), " Restrict compositional profiling exclusively to statistically significant differentially abundant lipids to identify structural shifts.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        tabsetPanel(
          id = ns("barchart_tabs"),
          tabPanel("Unfiltered (All)",
            div(
              class = "quick-access-strip mb-2.5 mt-2",
              tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#barchart_tab-barValueMode', 'plot_controls', '1. Bar Settings', event);",
                title = "Toggle cumulative abundance between Absolute intensity and Normalized %",
                icon("chart-pie"), tags$strong("Absolute vs Normalized (%)")
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#barchart_tab-repMode', 'plot_controls', '0. Sample Grouping & Nomenclature', event);",
                title = "Switch between Merged Samples (Group Average) and Single Replicates",
                icon("users-viewfinder"), "Merged Samples / Replicates"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#barchart_tab-showErrorBars', 'plot_controls', '2. Error Bars', event);",
                title = "Configure Error Bars (SEM vs SD, Total vs Individual Segments)",
                icon("chart-column"), "Error Bars (SEM / SD)"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#barchart_tab-donutZoom', 'plot_controls', 'Viewport Zoom', event);",
                title = "Adjust Donut proportion zoom % and display proportions",
                icon("circle-notch"), "Donut Zoom & Proportions"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
                title = "Bottom Menu: Configure class ordering and custom aesthetics below plot",
                icon("layer-group"), "Bottom Menu: Advanced Aesthetics"
              )
            ),
            tabsetPanel(
              id = ns("unfiltered_subtabs"),
              tabPanel("Barplot",
                br(),
                card(
                  card_header(
                    class = "d-flex justify-content-between align-items-center",
                    "Unfiltered Composition - Barplot",
                    tags$div(
                      downloadButton(ns("downloadBarCSV_Unfiltered"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                      downloadButton(ns("downloadBarPDF_Unfiltered"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                    )
                  ),
                  card_body(
                    uiOutput(ns("barchart_fallback_alert")),
                    plotOutput(ns("barPlotUnfiltered"), height="600px"),
                    uiOutput(ns("composition_caption"))
                  )
                )
              ),
              tabPanel("Donutplot",
                br(),
                card(
                  card_header(
                    class = "d-flex justify-content-between align-items-center",
                    "Unfiltered Composition - Donutplot",
                    tags$div(
                      downloadButton(ns("downloadDonutCSV_Unfiltered"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                      downloadButton(ns("downloadDonutPDF_Unfiltered"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                    )
                  ),
                  card_body(
                    uiOutput(ns("barchart_donut_fallback_alert")),
                    uiOutput(ns("donutPlotUnfilteredUI")),
                    uiOutput(ns("composition_caption_donut"))
                  )
                )
              )
            )
          ),
          tabPanel("Filtered",
            div(
              class = "quick-access-strip mb-2.5 mt-2",
              tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
              tags$button(
                type = "button",
                class = "btn-quick-access btn-quick-l2fc",
                onclick = "window.pointToLog2FCFilter(event);",
                title = "Jump to |Log2FC| cutoff threshold in sidebar and highlight",
                icon("filter"), tags$strong("|Log2FC| Cutoff Filter")
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#data_hub-deReferenceGroups', 'cohorts', 'Differential Expression', event);",
                title = "Configure Differential Expression comparison and reference cohorts in left dock",
                icon("scale-balanced"), "DE Cohorts & Settings"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#barchart_tab-barValueMode', 'plot_controls', '1. Bar Settings', event);",
                title = "Switch to Normalized (%) mode to analyze proportional remodeling among DE species",
                icon("chart-pie"), "Normalized (%) Remodeling"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#barchart_tab-showErrorBars', 'plot_controls', '2. Error Bars', event);",
                title = "Configure Error Bars (SEM vs SD, Total vs Individual Segments)",
                icon("chart-column"), "Error Bars (SEM / SD)"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
                title = "Bottom Menu: Configure class ordering and custom aesthetics below plot",
                icon("layer-group"), "Bottom Menu: Advanced Aesthetics"
              )
            ),
            tabsetPanel(
              id = ns("filtered_subtabs"),
              tabPanel("Barplot",
                br(),
                card(
                  card_header(
                    class = "d-flex justify-content-between align-items-center",
                    "Filtered Composition - Barplot",
                    tags$div(
                      downloadButton(ns("downloadBarCSV_Filtered"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                      downloadButton(ns("downloadBarPDF_Filtered"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                    )
                  ),
                  card_body(
                    uiOutput(ns("filtered_barchart_fallback_alert")),
                    uiOutput(ns("de_not_run_banner_filtered")),
                    plotOutput(ns("barPlotFiltered"), height="600px"),
                    uiOutput(ns("composition_caption_filtered"))
                  )
                )
              ),
              tabPanel("Donutplot",
                br(),
                card(
                  card_header(
                    class = "d-flex justify-content-between align-items-center",
                    "Filtered Composition - Donutplot",
                    tags$div(
                      downloadButton(ns("downloadDonutCSV_Filtered"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                      downloadButton(ns("downloadDonutPDF_Filtered"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                    )
                  ),
                  card_body(
                    uiOutput(ns("filtered_donut_fallback_alert")),
                    uiOutput(ns("de_not_run_banner_filtered_donut")),
                    uiOutput(ns("donutPlotFilteredUI")),
                    uiOutput(ns("composition_caption_filtered_donut"))
                  )
                )
              )
            )
          )
        )
      ), options = list(handles = "s, se")),
      accordion(
        open = FALSE,
        accordion_panel("Advanced Aesthetics & Ordering", icon = icon("layer-group"),
          uiOutput(ns("dragDropOrderingUI"))
        )
      )
    )
  )
}

barchart_server <- function(id, shared_data, global_color_map) {
  moduleServer(id, function(input, output, session) {
    barchart_fallback_active <- reactiveVal(FALSE)
    filtered_barchart_fallback_active <- reactiveVal(FALSE)
    
  # --- Restrict Value Mode Selection Reactively for Donut Plot ---
    observe({
      req(input$barchart_tabs)
      is_donut <- FALSE
      if (input$barchart_tabs == "Unfiltered (All)") {
        if (!is.null(input$unfiltered_subtabs) && input$unfiltered_subtabs == "Donutplot") {
          is_donut <- TRUE
        }
      } else if (input$barchart_tabs == "Filtered") {
        if (!is.null(input$filtered_subtabs) && input$filtered_subtabs == "Donutplot") {
          is_donut <- TRUE
        }
      }
      
      current_val <- input$barValueMode
      
      if (is_donut) {
        choices <- c("Absolute (%)", "Normalized (%)")
        new_sel <- current_val
        if (!(current_val %in% choices)) {
          if (grepl("Normalized", current_val)) {
            new_sel <- "Normalized (%)"
          } else {
            new_sel <- "Absolute (%)"
          }
        }
        updateRadioButtons(session, "barValueMode",
                           choices = choices,
                           selected = new_sel)
      } else {
        choices <- c("Absolute (intensity)", "Absolute (%)", 
                     "Normalized (intensity)", "Normalized (%)")
        updateRadioButtons(session, "barValueMode",
                           choices = choices,
                           selected = current_val)
      }
    })

  # --- Dynamic UI ---
    output$barGroupModeUI <- renderUI({
       choices <- c("Lipid Main Class" = "Sub-class", "Lipid Category" = "Hyperclass")
       default_sel <- "Sub-class"
       
       # Recover previous selection if valid
       curr_sel <- isolate(input$barGroupMode)
       if (!is.null(curr_sel) && curr_sel %in% choices) {
           default_sel <- curr_sel
       }
       
       radioButtons(session$ns("barGroupMode"), "Group By:", 
                    choices = choices, selected = default_sel, inline = TRUE)
    })
    
  # --- Grouping Mode Helper ---
    is_agg <- reactive({
      identical(input$repMode %||% "aggregate_class", "aggregate_class")
    })

  # --- Dynamic Metadata (Drag & Drop Logic) ---
    dynamic_metadata <- reactive({
       df <- shared_data$data_processed()
       req(df)
       meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% setdiff(names(df), "Lipid_Name"))
       
       available_cols <- intersect(names(meta), c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint"))
       h_order <- input$hierarchy_order %||% available_cols
       
       if (is_agg()) h_order <- setdiff(h_order, c("Replicate", "PatientNumber"))
       if (length(h_order) == 0) h_order <- available_cols[1] # fallback
       
       for (col in h_order) {
          manual_val_order <- input[[paste0("order_", col)]]
          if (!is.null(manual_val_order) && length(manual_val_order) == length(unique(meta[[col]]))) {
             meta[[col]] <- factor(meta[[col]], levels = manual_val_order)
          } else {
             meta[[col]] <- factor(meta[[col]], levels = unique(meta[[col]]))
          }
       }
       
       meta <- meta %>% dplyr::arrange(!!!rlang::syms(h_order))
       
       build_custom_display_name <- function(row, h_order) {
         res <- ""
         for (col in h_order) {
           val <- row[[col]]
           val_str <- if (!is.na(val)) as.character(val) else ""
           if (nzchar(val_str)) {
             if (col == "PatientNumber") {
               res <- if (nzchar(res)) paste0(res, "/", val_str) else val_str
             } else {
               res <- if (nzchar(res)) paste0(res, "_", val_str) else val_str
             }
           }
         }
         res
       }

       if (is_agg()) {
           meta$Group <- apply(meta[, h_order, drop=FALSE], 1, paste, collapse="_")
           custom_labels <- sapply(seq_len(nrow(meta)), function(i) {
             build_custom_display_name(meta[i, ], h_order)
           })
           meta$Display_Name <- ifelse(nzchar(custom_labels), custom_labels, meta$Group)
       } else {
           group_cols <- setdiff(h_order, c("Replicate", "PatientNumber"))
           if(length(group_cols)==0) group_cols <- h_order
           meta$Group <- apply(meta[, group_cols, drop=FALSE], 1, paste, collapse="_")
           
           custom_labels <- sapply(seq_len(nrow(meta)), function(i) {
             build_custom_display_name(meta[i, ], h_order)
           })
           meta$Display_Name <- make.unique(ifelse(nzchar(custom_labels), custom_labels, as.character(meta$FullName)))
       }
       
       meta
    })

    output$dragDropOrderingUI <- renderUI({
       df <- shared_data$data_processed()
       req(df)
       meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% setdiff(names(df), "Lipid_Name"))
       available_cols <- intersect(names(meta), c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint"))
       if (is_agg()) available_cols <- setdiff(available_cols, c("Replicate", "PatientNumber"))
       
       saved_hierarchy <- shared_data$get_restored_input(session$ns("hierarchy_order"), available_cols)
       
       tagList(
         h6("1. Define Naming Hierarchy"),
         p("Drag to build the sample/group naming structure.", class="text-muted small"),
         sortable::rank_list(
           text = "",
           labels = saved_hierarchy,
           input_id = session$ns("hierarchy_order")
         ),
         hr(),
         h6("2. Order Specific Groups"),
         uiOutput(session$ns("groupSpecificOrderingUI"))
       )
    })
    
    output$groupSpecificOrderingUI <- renderUI({
       h_order <- input$hierarchy_order
       req(h_order)
       meta <- shared_data$all_metadata()
       
       lapply(h_order, function(h_col) {
         unique_vals <- unique(meta[[h_col]])
         unique_vals <- unique_vals[!is.na(unique_vals)]
         saved_vals <- shared_data$get_restored_input(session$ns(paste0("order_", h_col)), unique_vals)
         sortable::rank_list(
           text = paste("Order:", get_metadata_group_label(h_col, meta)),
           labels = saved_vals,
           input_id = session$ns(paste0("order_", h_col))
         )
       })
    })

  # --- Helper Reactives for consistent grouping/coloring ---
    barGroupingMap <- reactive({
      if (!is_agg()) return(NULL)
      meta <- dynamic_metadata()
      setNames(meta$Display_Name, meta$FullName)
    })
    
    barSampleColors <- reactive({
       is_agg_val <- is_agg()
       cond_map <- global_color_map()$Group1
       
       meta <- dynamic_metadata()
       if (is_agg_val) {
          df_lookup <- meta %>% dplyr::distinct(Display_Name, Group1)
          lookup <- setNames(df_lookup$Group1, df_lookup$Display_Name)
          groups <- unique(meta$Display_Name)
          stats::setNames(cond_map[lookup[groups]], groups)
       } else {
          stats::setNames(cond_map[meta$Group1], meta$Display_Name)
       }
    })
    
  # --- Column Hidden State Tracker ---
    rv_barchart_cols <- reactiveValues(hidden = c())
    
    observeEvent(input$barDisplayColumns, {
       meta <- dynamic_metadata()
       if (is_agg()) {
           all_cols <- unique(meta$Display_Name)
       } else {
           all_cols <- meta$FullName
       }
       rv_barchart_cols$hidden <- setdiff(all_cols, input$barDisplayColumns)
    }, ignoreNULL = FALSE)
    
  # --- 0. Column Selector ---
    output$barDisplayColumnSelectorUI <- renderUI({
      meta <- dynamic_metadata()
      if (is_agg()) {
          choice_names <- unique(meta$Display_Name)
          cols <- choice_names
      } else {
          cols <- meta$FullName
          choice_names <- meta$Display_Name
      }
      
      selected_cols <- setdiff(cols, rv_barchart_cols$hidden)
      saved_cols <- shared_data$get_restored_input(session$ns("barDisplayColumns"), selected_cols)
      
      tags$div(
        style = "max-height: 200px; overflow-y: auto; border: 1px solid #e9ecef; padding: 10px; border-radius: 5px;",
        checkboxGroupInput(session$ns("barDisplayColumns"), "Display Columns (Subset):", 
                    choiceNames = choice_names, choiceValues = cols, selected = saved_cols)
      )
    })
    
  # --- Unfiltered Data ---
    unfilteredData <- reactive({
      req(shared_data$data_processed())
      df <- shared_data$data_processed()
      
   # Apply Global Filters (Panels 4-7)
      filtered_ids <- shared_data$global_filtered_lipids()
      if (isTRUE(shared_data$targeted_mode_active())) {
        targeted_df <- if (!is.null(filtered_ids)) df %>% dplyr::filter(Lipid_Name %in% filtered_ids) else df
        if (nrow(targeted_df) == 0) {
          barchart_fallback_active(TRUE)
          notify_targeted_fallback(session, id = "targeted_fallback_barchart")
          all_filtered_ids <- if (!is.null(shared_data$global_filtered_lipids_all)) shared_data$global_filtered_lipids_all() else NULL
          if (!is.null(all_filtered_ids)) {
            df <- df %>% dplyr::filter(Lipid_Name %in% all_filtered_ids)
          }
        } else {
          barchart_fallback_active(FALSE)
          df <- targeted_df
        }
      } else {
        barchart_fallback_active(FALSE)
        if(!is.null(filtered_ids)) {
          df <- df %>% dplyr::filter(Lipid_Name %in% filtered_ids)
        }
      }
      
      meta <- dynamic_metadata()
      ordered_cols <- c("Lipid_Name", intersect(meta$FullName, names(df)))
      df <- df %>% dplyr::select(all_of(ordered_cols))
      
   # Apply Column Subset
      if (length(rv_barchart_cols$hidden) > 0) {
         if (is_agg()) {
             hidden_fullnames <- meta$FullName[meta$Display_Name %in% rv_barchart_cols$hidden]
             use_cols <- setdiff(ordered_cols, hidden_fullnames)
         } else {
             use_cols <- setdiff(ordered_cols, rv_barchart_cols$hidden)
         }
         if (length(use_cols) > 1) { 
            df <- df %>% dplyr::select(all_of(use_cols))
         }
      }

      mat <- df %>% dplyr::select(-Lipid_Name) %>% as.matrix()
      rownames(mat) <- df$Lipid_Name
      if (!is_agg()) {
          colnames(mat) <- meta$Display_Name[match(colnames(mat), meta$FullName)]
          if (identical(input$repMode, "replicate_resort_class") && ncol(mat) >= 2) {
            tryCatch({
              anno <- shared_data$annotationData()
              m_lipids <- intersect(rownames(mat), anno$Lipid_Name)
              if (length(m_lipids) >= 2) {
                sub_mat <- mat[m_lipids, , drop = FALSE]
                cls_vec <- anno$subclass[match(m_lipids, anno$Lipid_Name)]
                cls_sums <- rowsum(sub_mat, group = cls_vec, na.rm = TRUE)
                scaled_mat <- scale(cls_sums)
                scaled_mat[is.na(scaled_mat)] <- 0
                col_dist <- stats::dist(t(scaled_mat))
                if (all(is.finite(col_dist))) {
                  hc <- stats::hclust(col_dist, method = "ward.D2")
                  mat <- mat[, hc$order, drop = FALSE]
                }
              }
            }, error = function(e) NULL)
          }
      }
      mat
    })
    
    output$barchart_fallback_alert <- renderUI({
      targeted_fallback_banner_ui(isTRUE(barchart_fallback_active()))
    })
    output$barchart_donut_fallback_alert <- renderUI({
      targeted_fallback_banner_ui(isTRUE(barchart_fallback_active()))
    })
    
    output$barPlotUnfiltered <- renderPlot({
      mat <- unfilteredData()
      req(mat, input$barGroupMode)
      
      is_agg_val <- is_agg()
      
      # Translate annotation_data
      anno_bar <- shared_data$annotationData()
      if (input$classLabelFormat == "full") {
        anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
        anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
      } else {
        anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
        anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
      }
      
      # Translate class colors
      class_cols <- switch(input$barGroupMode, "Lipid_Name" = shared_data$species_color_map(), "Hyperclass" = shared_data$origin_color_map(), shared_data$class_color_map())
      if (input$classLabelFormat == "full") {
        names(class_cols) <- get_full_class_name(names(class_cols))
      } else {
        names(class_cols) <- get_short_class_name(names(class_cols))
      }
      
      title <- paste0("Unfiltered Composition (", input$barValueMode, ")")
      buildBarPlot(mat, title,
                              annotation_data = anno_bar,
                              group_mode = input$barGroupMode,
                              value_mode = input$barValueMode,
                              orientation = input$barOrientation,
                              sample_grouping = barGroupingMap(),
                              aggregate_by_group = is_agg_val,
                              compute_error_bars = isTRUE(input$showErrorBars),
                              sample_colors = barSampleColors(),
                              class_colors = class_cols,
                              error_bar_type = input$errorBarType %||% "total",
                              error_bar_stats_mode = input$errorBarStatsMode %||% "sem",
                              color_error_bars_by_class = isTRUE(input$colorErrorBarsByClass))
    })
    
    output$donutPlotUnfilteredUI <- renderUI({
      zoom <- (input$donutZoom %||% 70) / 100
      mat <- unfilteredData()
      req(mat)
      
      if (input$barOrientation == "class_x") {
        anno_bar <- shared_data$annotationData()
        active_lipids <- intersect(rownames(mat), anno_bar$Lipid_Name)
        group_by <- input$barGroupMode %||% "Sub-class"
        groupVar <- if (group_by == "Hyperclass") "hyperclass" else "subclass"
        n <- length(unique(anno_bar[[groupVar]][anno_bar$Lipid_Name %in% active_lipids]))
      } else {
        n <- if (is_agg() && !is.null(barGroupingMap())) {
          length(unique(barGroupingMap()))
        } else {
          ncol(mat)
        }
      }
      if (is.na(n) || n <= 0) n <- 1
      
      ncols <- min(4, n)
      nrows <- ceiling(n / ncols)
      
      base_w <- max(800, ncols * 250)
      base_h <- max(400, nrows * 250)
      
      total_w <- base_w * zoom
      total_h <- base_h * zoom
      
      div(style = "width: 100%; height: 600px; overflow: auto;",
        plotOutput(session$ns("donutPlotUnfiltered"), width = paste0(total_w, "px"), height = paste0(total_h, "px"))
      )
    })
    
    output$donutPlotUnfiltered <- renderPlot({
      mat <- unfilteredData()
      req(mat, input$barGroupMode)
      
      is_agg_val <- is_agg()
      
      # Translate annotation_data
      anno_bar <- shared_data$annotationData()
      if (input$classLabelFormat == "full") {
        anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
        anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
      } else {
        anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
        anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
      }
      
      # Translate class colors
      class_cols <- switch(input$barGroupMode, "Lipid_Name" = shared_data$species_color_map(), "Hyperclass" = shared_data$origin_color_map(), shared_data$class_color_map())
      if (input$classLabelFormat == "full") {
        names(class_cols) <- get_full_class_name(names(class_cols))
      } else {
        names(class_cols) <- get_short_class_name(names(class_cols))
      }
      
      # Calculate dynamic ncols
      if (input$barOrientation == "class_x") {
        active_lipids <- intersect(rownames(mat), anno_bar$Lipid_Name)
        group_by <- input$barGroupMode %||% "Sub-class"
        groupVar <- if (group_by == "Hyperclass") "hyperclass" else "subclass"
        n <- length(unique(anno_bar[[groupVar]][anno_bar$Lipid_Name %in% active_lipids]))
      } else {
        n <- if (is_agg_val && !is.null(barGroupingMap())) {
          length(unique(barGroupingMap()))
        } else {
          ncol(mat)
        }
      }
      if (is.na(n) || n <= 0) n <- 1
      ncols <- min(4, n)
      
      title <- paste0("Unfiltered Composition (Donut Plot)")
      buildDonutPlot(mat, title,
                     annotation_data = anno_bar,
                     group_mode = input$barGroupMode,
                     value_mode = input$barValueMode,
                     sample_grouping = barGroupingMap(),
                     aggregate_by_group = is_agg_val,
                     class_colors = class_cols,
                     show_stats = isTRUE(input$showDonutStats),
                     orientation = input$barOrientation,
                     sample_colors = barSampleColors(),
                     ncols = ncols)
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
        NULL 
      }
      
      validate(need(!is.null(sl), "No differential expression results available. Run DE first."))
      
      if (isTRUE(shared_data$targeted_mode_active()) && (is.null(final_lipids) || length(final_lipids) == 0)) {
        all_gl <- if (!is.null(shared_data$global_filtered_lipids_all)) shared_data$global_filtered_lipids_all() else NULL
        fallback_lipids <- if (!is.null(all_gl)) intersect(all_gl, sl) else sl
        if (length(fallback_lipids) > 0) {
          filtered_barchart_fallback_active(TRUE)
          notify_targeted_fallback(session, id = "targeted_fallback_filtered_barchart")
          final_lipids <- fallback_lipids
        } else {
          filtered_barchart_fallback_active(FALSE)
        }
      } else {
        filtered_barchart_fallback_active(FALSE)
      }
      
      validate(need(length(final_lipids) > 0, "No lipids passed filters (Significant & Global Filters)."))
      
   # Correct Logic: Filter first, then remove column, then matrix
      df_sub <- shared_data$data_processed() %>% dplyr::filter(Lipid_Name %in% final_lipids)
      
      meta <- dynamic_metadata()
      ordered_cols <- c("Lipid_Name", intersect(meta$FullName, names(df_sub)))
      df_sub <- df_sub %>% dplyr::select(all_of(ordered_cols))
      
      if (length(rv_barchart_cols$hidden) > 0) {
         if (is_agg()) {
             hidden_fullnames <- meta$FullName[meta$Display_Name %in% rv_barchart_cols$hidden]
             use_cols <- setdiff(ordered_cols, hidden_fullnames)
         } else {
             use_cols <- setdiff(ordered_cols, rv_barchart_cols$hidden)
         }
         if (length(use_cols) > 1) { 
            df_sub <- df_sub %>% dplyr::select(all_of(use_cols))
         }
      }
      
      mat <- df_sub %>% dplyr::select(-Lipid_Name) %>% as.matrix()
      rownames(mat) <- df_sub$Lipid_Name
      if (!is_agg()) {
          colnames(mat) <- meta$Display_Name[match(colnames(mat), meta$FullName)]
          if (identical(input$repMode, "replicate_resort_class") && ncol(mat) >= 2) {
            tryCatch({
              anno <- shared_data$annotationData()
              m_lipids <- intersect(rownames(mat), anno$Lipid_Name)
              if (length(m_lipids) >= 2) {
                sub_mat <- mat[m_lipids, , drop = FALSE]
                cls_vec <- anno$subclass[match(m_lipids, anno$Lipid_Name)]
                cls_sums <- rowsum(sub_mat, group = cls_vec, na.rm = TRUE)
                scaled_mat <- scale(cls_sums)
                scaled_mat[is.na(scaled_mat)] <- 0
                col_dist <- stats::dist(t(scaled_mat))
                if (all(is.finite(col_dist))) {
                  hc <- stats::hclust(col_dist, method = "ward.D2")
                  mat <- mat[, hc$order, drop = FALSE]
                }
              }
            }, error = function(e) NULL)
          }
      }
      mat
    })
    
    output$filtered_barchart_fallback_alert <- renderUI({
      targeted_fallback_banner_ui(isTRUE(filtered_barchart_fallback_active()))
    })
    output$filtered_donut_fallback_alert <- renderUI({
      targeted_fallback_banner_ui(isTRUE(filtered_barchart_fallback_active()))
    })
    output$de_not_run_banner_filtered <- renderUI({ render_de_not_run_banner(shared_data) })
    output$de_not_run_banner_filtered_donut <- renderUI({ render_de_not_run_banner(shared_data) })
    
    output$barPlotFiltered <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      mat <- filteredBarData()
      req(mat, input$barGroupMode)
      
      is_agg_val <- is_agg()
      
      # Translate annotation_data
      anno_bar <- shared_data$annotationData()
      if (input$classLabelFormat == "full") {
        anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
        anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
      } else {
        anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
        anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
      }
      
      # Translate class colors
      class_cols <- switch(input$barGroupMode, "Lipid_Name" = shared_data$species_color_map(), "Hyperclass" = shared_data$origin_color_map(), shared_data$class_color_map())
      if (input$classLabelFormat == "full") {
        names(class_cols) <- get_full_class_name(names(class_cols))
      } else {
        names(class_cols) <- get_short_class_name(names(class_cols))
      }
      
      title <- paste0("Filtered Composition (", input$barValueMode, ")")
      buildBarPlot(mat, title, 
                              annotation_data = anno_bar,
                              group_mode = input$barGroupMode,
                              value_mode = input$barValueMode,
                              orientation = input$barOrientation,
                              sample_grouping = barGroupingMap(),
                              aggregate_by_group = is_agg_val,
                              compute_error_bars = isTRUE(input$showErrorBars),
                              sample_colors = barSampleColors(),
                              class_colors = class_cols,
                              error_bar_type = input$errorBarType %||% "total",
                              error_bar_stats_mode = input$errorBarStatsMode %||% "sem",
                              color_error_bars_by_class = isTRUE(input$colorErrorBarsByClass))
    })
    
    output$donutPlotFilteredUI <- renderUI({
      zoom <- (input$donutZoom %||% 70) / 100
      mat <- tryCatch(filteredBarData(), error = function(e) NULL)
      req(mat)
      
      if (input$barOrientation == "class_x") {
        anno_bar <- shared_data$annotationData()
        active_lipids <- intersect(rownames(mat), anno_bar$Lipid_Name)
        group_by <- input$barGroupMode %||% "Sub-class"
        groupVar <- if (group_by == "Hyperclass") "hyperclass" else "subclass"
        n <- length(unique(anno_bar[[groupVar]][anno_bar$Lipid_Name %in% active_lipids]))
      } else {
        n <- if (is_agg() && !is.null(barGroupingMap())) {
          length(unique(barGroupingMap()))
        } else {
          ncol(mat)
        }
      }
      if (is.na(n) || n <= 0) n <- 1
      
      ncols <- min(4, n)
      nrows <- ceiling(n / ncols)
      
      base_w <- max(800, ncols * 250)
      base_h <- max(400, nrows * 250)
      
      total_w <- base_w * zoom
      total_h <- base_h * zoom
      
      div(style = "width: 100%; height: 600px; overflow: auto;",
        plotOutput(session$ns("donutPlotFiltered"), width = paste0(total_w, "px"), height = paste0(total_h, "px"))
      )
    })
    
    output$donutPlotFiltered <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      mat <- filteredBarData()
      req(mat, input$barGroupMode)
      
      is_agg_val <- is_agg()
      
      # Translate annotation_data
      anno_bar <- shared_data$annotationData()
      if (input$classLabelFormat == "full") {
        anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
        anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
      } else {
        anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
        anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
      }
      
      # Translate class colors
      class_cols <- switch(input$barGroupMode, "Lipid_Name" = shared_data$species_color_map(), "Hyperclass" = shared_data$origin_color_map(), shared_data$class_color_map())
      if (input$classLabelFormat == "full") {
        names(class_cols) <- get_full_class_name(names(class_cols))
      } else {
        names(class_cols) <- get_short_class_name(names(class_cols))
      }
      
      # Calculate dynamic ncols
      if (input$barOrientation == "class_x") {
        active_lipids <- intersect(rownames(mat), anno_bar$Lipid_Name)
        group_by <- input$barGroupMode %% "Sub-class"
        groupVar <- if (group_by == "Hyperclass") "hyperclass" else "subclass"
        n <- length(unique(anno_bar[[groupVar]][anno_bar$Lipid_Name %in% active_lipids]))
      } else {
        n <- if (is_agg && !is.null(barGroupingMap())) {
          length(unique(barGroupingMap()))
        } else {
          ncol(mat)
        }
      }
      if (is.na(n) || n <= 0) n <- 1
      ncols <- min(4, n)
      
      title <- paste0("Filtered Composition (Donut Plot)")
      buildDonutPlot(mat, title,
                     annotation_data = anno_bar,
                     group_mode = input$barGroupMode,
                     value_mode = input$barValueMode,
                     sample_grouping = barGroupingMap(),
                     aggregate_by_group = is_agg,
                     class_colors = class_cols,
                     show_stats = isTRUE(input$showDonutStats),
                     orientation = input$barOrientation,
                     sample_colors = barSampleColors(),
                     ncols = ncols,
                     min_pct = 0)
    })
    
    output$downloadDonutPDF_Unfiltered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Donut_Unfiltered", extension = "pdf", repMode = "Agg") },
      content = function(file) {
        tryCatch({
          mat <- unfilteredData()
          is_agg_val <- is_agg()
          
          # Dynamic Color Selection
          current_color_map <- switch(input$barGroupMode,
               "Lipid_Name" = shared_data$species_color_map(),
               "Hyperclass" = shared_data$origin_color_map(),
               shared_data$class_color_map()
          )
          if (input$classLabelFormat == "full") {
            names(current_color_map) <- get_full_class_name(names(current_color_map))
          } else {
            names(current_color_map) <- get_short_class_name(names(current_color_map))
          }
          
          # Translate annotation_data
          anno_bar <- shared_data$annotationData()
          if (input$classLabelFormat == "full") {
            anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
            anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
          } else {
            anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
            anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
          }
          
          # Calculate dynamic ncols
          if (input$barOrientation == "class_x") {
            active_lipids <- intersect(rownames(mat), anno_bar$Lipid_Name)
            group_by <- input$barGroupMode %% "Sub-class"
            groupVar <- if (group_by == "Hyperclass") "hyperclass" else "subclass"
            n <- length(unique(anno_bar[[groupVar]][anno_bar$Lipid_Name %in% active_lipids]))
          } else {
            n <- if (is_agg_val && !is.null(barGroupingMap())) {
              length(unique(barGroupingMap()))
            } else {
              ncol(mat)
            }
          }
          if (is.na(n) || n <= 0) n <- 1
          ncols <- min(4, n)
          
          p <- buildDonutPlot(mat, "Unfiltered Composition (Donut Plot)",
                              annotation_data = anno_bar,
                              group_mode = input$barGroupMode,
                              value_mode = input$barValueMode,
                              sample_grouping = barGroupingMap(),
                              aggregate_by_group = is_agg_val,
                              class_colors = current_color_map,
                              show_stats = isTRUE(input$showDonutStats),
                              orientation = input$barOrientation,
                              sample_colors = barSampleColors(),
                              ncols = ncols)
                              
          w <- session$clientData[[paste0("output_", session$ns("donutPlotUnfiltered"), "_width")]] %||% 1000
          h <- session$clientData[[paste0("output_", session$ns("donutPlotUnfiltered"), "_height")]] %||% 800
          
          ggplot2::ggsave(file, plot=p, device="pdf", width=w/72, height=h/72, limitsize=FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in Donut PDF generation:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
    output$downloadDonutCSV_Unfiltered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Donut_Unfiltered_Data", extension = "csv", repMode = "Agg") },
      content = function(file) {
        tryCatch({
          mat <- unfilteredData()
          anno_bar <- shared_data$annotationData()
          is_agg <- is_agg()
          
          dfm <- as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name") %>%
            dplyr::left_join(dplyr::select(anno_bar, Lipid_Name, subclass, hyperclass), by = "Lipid_Name") %>%
            tidyr::pivot_longer(cols = dplyr::all_of(colnames(mat)), names_to = "SampleCol", values_to = "Intensity")
          
          if (grepl("^Normalized", input$barValueMode)) {
            dfm <- dfm %>% dplyr::group_by(Lipid_Name) %>% 
              dplyr::mutate(rowSum = sum(Intensity, na.rm = TRUE), 
                            Intensity = dplyr::if_else(rowSum > 0, Intensity / rowSum, 0)) %>% 
              dplyr::ungroup()
          }
          
          groupVar <- if (input$barGroupMode == "Hyperclass") "hyperclass" else "subclass"
          dfm <- dfm %>% dplyr::rename(ClassGroup = dplyr::all_of(groupVar))
          
          df_class_sample <- dfm %>% 
            dplyr::group_by(SampleCol, ClassGroup) %>% 
            dplyr::summarize(Value = sum(Intensity, na.rm = TRUE), .groups = "drop")
            
          if (is_agg && !is.null(barGroupingMap())) {
            g_map <- barGroupingMap()
            df_class_sample$Group <- g_map[as.character(df_class_sample$SampleCol)]
            df_class_sample <- df_class_sample %>% dplyr::filter(!is.na(Group))
          }
          
          if (input$barOrientation == "class_x") {
            if (is_agg && !is.null(barGroupingMap())) {
              ledger <- df_class_sample %>%
                dplyr::group_by(Group, ClassGroup) %>%
                dplyr::summarize(Value = mean(Value, na.rm = TRUE), .groups = "drop") %>%
                dplyr::group_by(ClassGroup) %>%
                dplyr::mutate(Total = sum(Value, na.rm = TRUE),
                              Pct = dplyr::if_else(Total > 0, Value / Total * 100, 0)) %>%
                dplyr::ungroup() %>%
                dplyr::rename(Slice = Group, Donut = ClassGroup)
            } else {
              ledger <- df_class_sample %>%
                dplyr::group_by(ClassGroup) %>%
                dplyr::mutate(Total = sum(Value, na.rm = TRUE),
                              Pct = dplyr::if_else(Total > 0, Value / Total * 100, 0)) %>%
                dplyr::ungroup() %>%
                dplyr::rename(Slice = SampleCol, Donut = ClassGroup)
            }
          } else {
            if (is_agg && !is.null(barGroupingMap())) {
              ledger <- df_class_sample %>%
                dplyr::group_by(Group, ClassGroup) %>%
                dplyr::summarize(Value = mean(Value, na.rm = TRUE), .groups = "drop") %>%
                dplyr::group_by(Group) %>%
                dplyr::mutate(Total = sum(Value, na.rm = TRUE),
                              Pct = dplyr::if_else(Total > 0, Value / Total * 100, 0)) %>%
                dplyr::ungroup() %>%
                dplyr::rename(Slice = ClassGroup, Donut = Group)
            } else {
              ledger <- df_class_sample %>%
                dplyr::group_by(SampleCol) %>%
                dplyr::mutate(Total = sum(Value, na.rm = TRUE),
                              Pct = dplyr::if_else(Total > 0, Value / Total * 100, 0)) %>%
                dplyr::ungroup() %>%
                dplyr::rename(Slice = ClassGroup, Donut = SampleCol)
            }
          }
          
          write.csv(ledger %>% dplyr::distinct(), file, row.names = FALSE)
        }, error = function(e) {
          write.csv(data.frame(Error = e$message), file, row.names = FALSE)
        })
      }
    )
    
  # --- Downloads (Unfiltered) ---
    output$downloadBarPDF_Unfiltered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Barchart_Unfiltered", extension = "pdf", repMode = "Agg") },
      content = function(file) {
        tryCatch({
          mat <- unfilteredData()
          
          is_agg <- is_agg()
          
     # Dynamic Color Selection
          current_color_map <- switch(input$barGroupMode,
               "Lipid_Name" = shared_data$species_color_map(),
               "Hyperclass" = shared_data$origin_color_map(),
               shared_data$class_color_map()
          )
          if (input$classLabelFormat == "full") {
            names(current_color_map) <- get_full_class_name(names(current_color_map))
          } else {
            names(current_color_map) <- get_short_class_name(names(current_color_map))
          }
          
          # Translate annotation_data
          anno_bar <- shared_data$annotationData()
          if (input$classLabelFormat == "full") {
            anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
            anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
          } else {
            anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
            anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
          }
          
          p <- buildBarPlot(mat, paste0("Unfiltered Composition"), 
                                       annotation_data = anno_bar,
                                       group_mode = input$barGroupMode,
                                       value_mode = input$barValueMode,
                                       orientation = input$barOrientation,
                                       sample_grouping = barGroupingMap(),
                                       aggregate_by_group = is_agg,
                                       compute_error_bars = isTRUE(input$showErrorBars),
                                       sample_colors = barSampleColors(),
                                       class_colors = current_color_map,
                                       error_bar_type = input$errorBarType %||% "total",
                                       error_bar_stats_mode = input$errorBarStatsMode %||% "sem",
                                       color_error_bars_by_class = isTRUE(input$colorErrorBarsByClass))
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
          
          is_agg <- is_agg()
          
     # Dynamic Color Selection
          current_color_map <- switch(input$barGroupMode,
               "Lipid_Name" = shared_data$species_color_map(),
               "Hyperclass" = shared_data$origin_color_map(),
               shared_data$class_color_map()
          )
          if (input$classLabelFormat == "full") {
            names(current_color_map) <- get_full_class_name(names(current_color_map))
          } else {
            names(current_color_map) <- get_short_class_name(names(current_color_map))
          }
          
          # Translate annotation_data
          anno_bar <- shared_data$annotationData()
          if (input$classLabelFormat == "full") {
            anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
            anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
          } else {
            anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
            anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
          }
          
          p <- buildBarPlot(mat, paste0("Filtered Composition"), 
                                       annotation_data = anno_bar,
                                       group_mode = input$barGroupMode,
                                       value_mode = input$barValueMode,
                                       orientation = input$barOrientation,
                                       sample_grouping = barGroupingMap(),
                                       aggregate_by_group = is_agg,
                                       compute_error_bars = isTRUE(input$showErrorBars),
                                       sample_colors = barSampleColors(),
                                       class_colors = current_color_map,
                                       error_bar_type = input$errorBarType %||% "total",
                                       error_bar_stats_mode = input$errorBarStatsMode %||% "sem",
                                       color_error_bars_by_class = isTRUE(input$colorErrorBarsByClass))
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
    
    output$downloadDonutPDF_Filtered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Donut_Filtered", extension = "pdf", repMode = "Agg") },
      content = function(file) {
        tryCatch({
          mat <- filteredBarData()
          is_agg <- is_agg()
          
          # Dynamic Color Selection
          current_color_map <- switch(input$barGroupMode,
               "Lipid_Name" = shared_data$species_color_map(),
               "Hyperclass" = shared_data$origin_color_map(),
               shared_data$class_color_map()
          )
          if (input$classLabelFormat == "full") {
            names(current_color_map) <- get_full_class_name(names(current_color_map))
          } else {
            names(current_color_map) <- get_short_class_name(names(current_color_map))
          }
          
          # Translate annotation_data
          anno_bar <- shared_data$annotationData()
          if (input$classLabelFormat == "full") {
            anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
            anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
          } else {
            anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
            anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
          }
          
          # Calculate dynamic ncols
          if (input$barOrientation == "class_x") {
            active_lipids <- intersect(rownames(mat), anno_bar$Lipid_Name)
            group_by <- input$barGroupMode %% "Sub-class"
            groupVar <- if (group_by == "Hyperclass") "hyperclass" else "subclass"
            n <- length(unique(anno_bar[[groupVar]][anno_bar$Lipid_Name %in% active_lipids]))
          } else {
            n <- if (is_agg && !is.null(barGroupingMap())) {
              length(unique(barGroupingMap()))
            } else {
              ncol(mat)
            }
          }
          if (is.na(n) || n <= 0) n <- 1
          ncols <- min(4, n)
          
          p <- buildDonutPlot(mat, "Filtered Composition (Donut Plot)",
                              annotation_data = anno_bar,
                              group_mode = input$barGroupMode,
                              value_mode = input$barValueMode,
                              sample_grouping = barGroupingMap(),
                              aggregate_by_group = is_agg,
                              class_colors = current_color_map,
                              show_stats = isTRUE(input$showDonutStats),
                              orientation = input$barOrientation,
                              sample_colors = barSampleColors(),
                              ncols = ncols,
                              min_pct = 0)
                              
          w <- session$clientData[[paste0("output_", session$ns("donutPlotFiltered"), "_width")]] %||% 1000
          h <- session$clientData[[paste0("output_", session$ns("donutPlotFiltered"), "_height")]] %||% 800
          
          ggplot2::ggsave(file, plot=p, device="pdf", width=w/72, height=h/72, limitsize=FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in Donut PDF generation:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
    output$downloadDonutCSV_Filtered <- downloadHandler(
      filename = function() { getDownloadFilename(tabName = "Donut_Filtered_Data", extension = "csv", repMode = "Agg") },
      content = function(file) {
        tryCatch({
          mat <- filteredBarData()
          anno_bar <- shared_data$annotationData()
          is_agg <- is_agg()
          
          dfm <- as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name") %>%
            dplyr::left_join(dplyr::select(anno_bar, Lipid_Name, subclass, hyperclass), by = "Lipid_Name") %>%
            tidyr::pivot_longer(cols = dplyr::all_of(colnames(mat)), names_to = "SampleCol", values_to = "Intensity")
          
          if (grepl("^Normalized", input$barValueMode)) {
            dfm <- dfm %>% dplyr::group_by(Lipid_Name) %>% 
              dplyr::mutate(rowSum = sum(Intensity, na.rm = TRUE), 
                            Intensity = dplyr::if_else(rowSum > 0, Intensity / rowSum, 0)) %>% 
              dplyr::ungroup()
          }
          
          groupVar <- if (input$barGroupMode == "Hyperclass") "hyperclass" else "subclass"
          dfm <- dfm %>% dplyr::rename(ClassGroup = dplyr::all_of(groupVar))
          
          df_class_sample <- dfm %>% 
            dplyr::group_by(SampleCol, ClassGroup) %>% 
            dplyr::summarize(Value = sum(Intensity, na.rm = TRUE), .groups = "drop")
            
          if (is_agg && !is.null(barGroupingMap())) {
            g_map <- barGroupingMap()
            df_class_sample$Group <- g_map[as.character(df_class_sample$SampleCol)]
            df_class_sample <- df_class_sample %>% dplyr::filter(!is.na(Group))
          }
          
          if (input$barOrientation == "class_x") {
            if (is_agg && !is.null(barGroupingMap())) {
              ledger <- df_class_sample %>%
                dplyr::group_by(Group, ClassGroup) %>%
                dplyr::summarize(Value = mean(Value, na.rm = TRUE), .groups = "drop") %>%
                dplyr::group_by(ClassGroup) %>%
                dplyr::mutate(Total = sum(Value, na.rm = TRUE),
                              Pct = dplyr::if_else(Total > 0, Value / Total * 100, 0)) %>%
                dplyr::ungroup() %>%
                dplyr::rename(Slice = Group, Donut = ClassGroup)
            } else {
              ledger <- df_class_sample %>%
                dplyr::group_by(ClassGroup) %>%
                dplyr::mutate(Total = sum(Value, na.rm = TRUE),
                              Pct = dplyr::if_else(Total > 0, Value / Total * 100, 0)) %>%
                dplyr::ungroup() %>%
                dplyr::rename(Slice = SampleCol, Donut = ClassGroup)
            }
          } else {
            if (is_agg && !is.null(barGroupingMap())) {
              ledger <- df_class_sample %>%
                dplyr::group_by(Group, ClassGroup) %>%
                dplyr::summarize(Value = mean(Value, na.rm = TRUE), .groups = "drop") %>%
                dplyr::group_by(Group) %>%
                dplyr::mutate(Total = sum(Value, na.rm = TRUE),
                              Pct = dplyr::if_else(Total > 0, Value / Total * 100, 0)) %>%
                dplyr::ungroup() %>%
                dplyr::rename(Slice = ClassGroup, Donut = Group)
            } else {
              ledger <- df_class_sample %>%
                dplyr::group_by(SampleCol) %>%
                dplyr::mutate(Total = sum(Value, na.rm = TRUE),
                              Pct = dplyr::if_else(Total > 0, Value / Total * 100, 0)) %>%
                dplyr::ungroup() %>%
                dplyr::rename(Slice = ClassGroup, Donut = SampleCol)
            }
          }
          
          write.csv(ledger %>% dplyr::distinct(), file, row.names = FALSE)
        }, error = function(e) {
          write.csv(data.frame(Error = e$message), file, row.names = FALSE)
        })
      }
    )

    output$composition_caption <- renderUI({
      group_by <- input$barGroupMode %||% "Sub-class"
      value_mode <- input$barValueMode %||% "Absolute (intensity)"
      data_level <- if (is_agg()) "average" else "individual"
      show_error_bars <- isTRUE(input$showErrorBars)
      error_bar_mode <- input$errorBarStatsMode %||% "sem"
      error_bar_type <- input$errorBarType %||% "total"
      orientation <- input$barOrientation %||% "sample_x"
      am <- tryCatch(shared_data$analysisMode(), error = function(e) NULL)
      
      # Translate Group By
      group_label <- switch(group_by,
        "Sub-class" = "Main Class",
        "Hyperclass" = "Lipid Category",
        "Lipid_Name" = "Single Lipid",
        group_by
      )
      
      # Translate Value Mode formula
      val_desc <- switch(value_mode,
        "Absolute (intensity)" = "Absolute Intensity: Sum of absolute species abundances: S<sub>cj</sub> = &#8721; x<sub>ij</sub>",
        "Absolute (%)" = "Absolute Percentage Composition: C<sub>cj</sub> = ( S<sub>cj</sub> / &#8721; S<sub>kj</sub> ) &#215; 100",
        "Normalized (intensity)" = "Normalized Intensity: Sum of row-normalized species abundances n<sub>ij</sub> = x<sub>ij</sub> / &#8721; x<sub>im</sub> (species sum to 1 across all samples): S<sub>cj</sub> = &#8721; n<sub>ij</sub>",
        "Normalized (%)" = "Normalized Percentage Composition: normalized sums expressed as percentage composition: C<sub>cj</sub> = ( S<sub>cj</sub> / &#8721; S<sub>kj</sub> ) &#215; 100, where S<sub>cj</sub> = &#8721; n<sub>ij</sub>",
        paste0(value_mode, " mode.")
      )
      
      # Translate Orientation
      orient_desc <- if (orientation == "sample_x") {
        "Profiles are oriented with individual samples mapped on the X-axis."
      } else {
        "Profiles are oriented with lipid classes/features mapped on the X-axis."
      }
      
      # Error Bars description
      error_desc <- ""
      if (data_level == "average" && show_error_bars) {
        stat_desc <- switch(error_bar_mode,
          "sd" = "Standard Deviation: SD = &#8730;( (1 / (N<sub>G</sub> - 1)) &#8721; (C<sub>cj</sub> - &#956;)<sup>2</sup> )",
          "sem" = "Standard Error of the Mean: SEM = SD / &#8730;N<sub>G</sub>",
          ""
        )
        type_desc <- if (error_bar_type == "total") {
          "Total Bar (cumulative variance for the stacked class total)"
        } else {
          "Individual Segments (variance segments for each constituent species)"
        }
        error_desc <- paste0("; Error bars display ", type_desc, " based on ", stat_desc)
      }
      
      caption <- paste0(
        "Compositional profiles display the cumulative abundance of lipids grouped by <b>", group_label, 
        "</b>. Values are calculated in <b>", value_mode, "</b> mode: ", val_desc, ". ", 
        orient_desc, error_desc, "."
      )
      
      shiny::HTML(paste0(
        "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; border-radius: 0 4px 4px 0;'>",
        caption,
        "</div>"
      ))
    })

    output$composition_caption_filtered <- renderUI({
      group_by <- input$barGroupMode %||% "Sub-class"
      value_mode <- input$barValueMode %||% "Absolute (intensity)"
      data_level <- if (is_agg()) "average" else "individual"
      show_error_bars <- isTRUE(input$showErrorBars)
      error_bar_mode <- input$errorBarStatsMode %||% "sem"
      error_bar_type <- input$errorBarType %||% "total"
      orientation <- input$barOrientation %||% "sample_x"
      am <- tryCatch(shared_data$analysisMode(), error = function(e) NULL)
      
      # Translate Group By
      group_label <- switch(group_by,
        "Sub-class" = "Main Class",
        "Hyperclass" = "Lipid Category",
        "Lipid_Name" = "Single Lipid",
        group_by
      )
      
      # Translate Value Mode formula
      val_desc <- switch(value_mode,
        "Absolute (intensity)" = "Absolute Intensity: Sum of absolute species abundances: S<sub>cj</sub> = &#8721; x<sub>ij</sub>",
        "Absolute (%)" = "Absolute Percentage Composition: C<sub>cj</sub> = ( S<sub>cj</sub> / &#8721; S<sub>kj</sub> ) &#215; 100",
        "Normalized (intensity)" = "Normalized Intensity: Sum of row-normalized species abundances n<sub>ij</sub> = x<sub>ij</sub> / &#8721; x<sub>im</sub> (species sum to 1 across all samples): S<sub>cj</sub> = &#8721; n<sub>ij</sub>",
        "Normalized (%)" = "Normalized Percentage Composition: normalized sums expressed as percentage composition: C<sub>cj</sub> = ( S<sub>cj</sub> / &#8721; S<sub>kj</sub> ) &#215; 100, where S<sub>cj</sub> = &#8721; n<sub>ij</sub>",
        paste0(value_mode, " mode.")
      )
      
      # Translate Orientation
      orient_desc <- if (orientation == "sample_x") {
        "Profiles are oriented with individual samples mapped on the X-axis."
      } else {
        "Profiles are oriented with lipid classes/features mapped on the X-axis."
      }
      
      # Error Bars description
      error_desc <- ""
      if (data_level == "average" && show_error_bars) {
        stat_desc <- switch(error_bar_mode,
          "sd" = "Standard Deviation: SD = &#8730;( (1 / (N<sub>G</sub> - 1)) &#8721; (C<sub>cj</sub> - &#956;)<sup>2</sup> )",
          "sem" = "Standard Error of the Mean: SEM = SD / &#8730;N<sub>G</sub>",
          ""
        )
        type_desc <- if (error_bar_type == "total") {
          "Total Bar (cumulative variance for the stacked class total)"
        } else {
          "Individual Segments (variance segments for each constituent species)"
        }
        error_desc <- paste0("; Error bars display ", type_desc, " based on ", stat_desc)
      }
      
      # Filtered contrast info
      contrast <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      contrast_desc <- if (!is.null(contrast)) {
        paste0(" Profiles are filtered by statistical significance for the comparison contrast <b>", contrast$str, "</b> (", paste(contrast$comp, collapse = "+"), " vs ", paste(contrast$ref, collapse = "+"), ").")
      } else {
        " (No active comparison selected; please select comparison groups in 3. Differential Expression sidebar)."
      }
      
      caption <- paste0(
        "Compositional profiles display the cumulative abundance of lipids grouped by <b>", group_label, 
        "</b>. Values are calculated in <b>", value_mode, "</b> mode: ", val_desc, ". ", 
        orient_desc, error_desc, ".", contrast_desc
      )
      
      shiny::HTML(paste0(
        "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; border-radius: 0 4px 4px 0;'>",
        caption,
        "</div>"
      ))
    })
    
    output$composition_caption_donut <- renderUI({
      group_by <- input$barGroupMode %||% "Sub-class"
      value_mode <- input$barValueMode %||% "Absolute (%)"
      orientation <- input$barOrientation %||% "sample_x"
      am <- tryCatch(shared_data$analysisMode(), error = function(e) NULL)
      
      group_label <- switch(group_by,
        "Sub-class" = "Main Class",
        "Hyperclass" = "Lipid Category",
        "Lipid_Name" = "Single Lipid",
        group_by
      )
      
      val_desc <- switch(value_mode,
        "Absolute (%)" = "Absolute Percentage Composition: C<sub>cj</sub> = ( S<sub>cj</sub> / &#8721; S<sub>kj</sub> ) &#215; 100",
        "Normalized (%)" = "Normalized Percentage Composition: normalized sums expressed as percentage composition: C<sub>cj</sub> = ( S<sub>cj</sub> / &#8721; S<sub>kj</sub> ) &#215; 100, where S<sub>cj</sub> = &#8721; n<sub>ij</sub>",
        paste0(value_mode, " mode.")
      )
      
      orient_desc <- if (orientation == "sample_x") {
        "Donut plots are oriented by sample/group (each donut is a sample/group, and slices represent classes)."
      } else {
        "Donut plots are oriented by class (each donut is a class, and slices represent samples/groups)."
      }
      
      caption <- paste0(
        "Donut plot visualization displays the relative percentage composition of lipids grouped by <b>", group_label, 
        "</b>. Calculations are performed in <b>", value_mode, "</b> mode: ", val_desc, ". ", orient_desc
      )
      
      shiny::HTML(paste0(
        "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; border-radius: 0 4px 4px 0;'>",
        caption,
        "</div>"
      ))
    })

    output$composition_caption_filtered_donut <- renderUI({
      group_by <- input$barGroupMode %||% "Sub-class"
      value_mode <- input$barValueMode %||% "Absolute (%)"
      orientation <- input$barOrientation %||% "sample_x"
      am <- tryCatch(shared_data$analysisMode(), error = function(e) NULL)
      
      group_label <- switch(group_by,
        "Sub-class" = "Main Class",
        "Hyperclass" = "Lipid Category",
        "Lipid_Name" = "Single Lipid",
        group_by
      )
      
      val_desc <- switch(value_mode,
        "Absolute (%)" = "Absolute Percentage Composition: C<sub>cj</sub> = ( S<sub>cj</sub> / &#8721; S<sub>kj</sub> ) &#215; 100",
        "Normalized (%)" = "Normalized Percentage Composition: normalized sums expressed as percentage composition: C<sub>cj</sub> = ( S<sub>cj</sub> / &#8721; S<sub>kj</sub> ) &#215; 100, where S<sub>cj</sub> = &#8721; n<sub>ij</sub>",
        paste0(value_mode, " mode.")
      )
      
      orient_desc <- if (orientation == "sample_x") {
        "Donut plots are oriented by sample/group (each donut is a sample/group, and slices represent classes)."
      } else {
        "Donut plots are oriented by class (each donut is a class, and slices represent samples/groups)."
      }
      
      contrast <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      contrast_desc <- if (!is.null(contrast)) {
        paste0(" Profiles are filtered by statistical significance for the comparison contrast <b>", contrast$str, "</b> (", paste(contrast$comp, collapse = "+"), " vs ", paste(contrast$ref, collapse = "+"), ").")
      } else {
        " (No active comparison selected; please select comparison groups in 3. Differential Expression sidebar)."
      }
      
      caption <- paste0(
        "Donut plot visualization displays the relative percentage composition of significantly changing lipids grouped by <b>", group_label, 
        "</b>. Calculations are performed in <b>", value_mode, "</b> mode: ", val_desc, ". ", orient_desc, contrast_desc
      )
      
      shiny::HTML(paste0(
        "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; border-radius: 0 4px 4px 0;'>",
        caption,
        "</div>"
      ))
    })
    
    observeEvent(input$show_stats_detail, {
      # Determine active sub-tab
      active_tab <- input$barchart_tabs %||% "Unfiltered (All)"
      
      mat <- NULL
      if (active_tab == "Filtered") {
        mat <- tryCatch(filteredBarData(), error = function(e) NULL)
      } else {
        mat <- tryCatch(unfilteredData(), error = function(e) NULL)
      }
      
      # Determine display label for Group By
      group_mode <- input$barGroupMode %||% "Sub-class"
      group_label <- switch(group_mode,
        "Sub-class" = "Lipid Main Class",
        "Hyperclass" = "Lipid Category",
        group_mode
      )
      
      contrast <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      comparison_text <- if (!is.null(contrast)) {
        paste0("Active Comparison: ", contrast$str, " (", paste(contrast$comp, collapse = "+"), " vs ", paste(contrast$ref, collapse = "+"), ")")
      } else {
        "Active Comparison: No comparison groups selected"
      }
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: COMPOSITION / BARCHART\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. VISUALIZATION SETTINGS\n",
        "   - Composition Tab:      ", active_tab, "\n",
        "   - Grouping Mode:        ", switch(input$repMode %||% "aggregate_class",
                                          "aggregate_class" = "Merged Samples (Group Average)",
                                          "replicate_fixed_class" = "Single Replicates (Group Order)",
                                          "replicate_resort_class" = "Single Replicates (Class Clustered)",
                                          "Merged Samples (Group Average)"), "\n",
        "   - Group By (Feature):   ", group_label, "\n",
        "   - Value Mode:           ", input$barValueMode %||% "Absolute (intensity)", "\n",
        "   - Orientation (X-axis): ", if (input$barOrientation == "sample_x") "Samples on X-axis" else "Classes/Features on X-axis", "\n"
      )
      
      if (active_tab == "Filtered") {
        msg <- paste0(
          msg,
          "   - Filtering Scope:      Filtered to significantly changed lipids\n",
          "   - ", comparison_text, "\n"
        )
      }
      
      if (is_agg()) {
        msg <- paste0(
          msg,
          "   - Error Bars Enabled:   ", if (isTRUE(input$showErrorBars)) "Yes" else "No", "\n"
        )
        if (isTRUE(input$showErrorBars)) {
          msg <- paste0(
            msg,
            "   - Error Bar Type:       ", input$errorBarType %||% "total", "\n",
            "   - Statistical Mode:     ", if (input$errorBarStatsMode == "sem") "Standard Error of the Mean (SEM)" else "Standard Deviation (SD)", "\n"
          )
        }
      }
      
      if (!is.null(mat) && nrow(mat) > 0 && ncol(mat) > 0) {
        anno_bar <- shared_data$annotationData()
        if (input$classLabelFormat == "full") {
          anno_bar$subclass <- get_full_class_name(anno_bar$subclass)
          anno_bar$hyperclass <- get_full_class_name(anno_bar$hyperclass)
        } else {
          anno_bar$subclass <- get_short_class_name(anno_bar$subclass)
          anno_bar$hyperclass <- get_short_class_name(anno_bar$hyperclass)
        }
        
        dfm <- as.data.frame(mat) %>% tibble::rownames_to_column("Lipid_Name") %>%
          dplyr::left_join(dplyr::select(anno_bar, Lipid_Name, subclass, hyperclass), by = "Lipid_Name") %>%
          tidyr::pivot_longer(cols = dplyr::all_of(colnames(mat)), names_to = "SampleCol", values_to = "Intensity")
        
        groupVar <- if (group_mode == "Hyperclass") "hyperclass" else "subclass"
        dfm <- dfm %>% dplyr::rename(ClassGroup = dplyr::all_of(groupVar))
        
        df_class_sample <- dfm %>% 
          dplyr::group_by(SampleCol, ClassGroup) %>% 
          dplyr::summarize(Value = sum(Intensity, na.rm = TRUE), .groups = "drop")
        
        n_lipids <- length(unique(dfm$Lipid_Name))
        n_classes <- length(unique(df_class_sample$ClassGroup))
        n_samples <- length(unique(df_class_sample$SampleCol))
        
        # Build mathematical calculus description dynamically based on Value Mode
        value_mode_selected <- input$barValueMode %||% "Absolute (intensity)"
        calculus_desc <- switch(value_mode_selected,
          "Absolute (intensity)" = paste0(
            "   - Value Aggregation (Absolute Intensity Mode):\n",
            "     For each sample 'j' and class 'c':\n",
            "          S_cj = sum_{i in class c} x_ij\n",
            "        where x_ij represents the absolute abundance of lipid 'i' in sample 'j'.\n"
          ),
          "Absolute (%)" = paste0(
            "   - Value Aggregation (Absolute % Mode):\n",
            "     For each sample 'j' and class 'c':\n",
            "          S_cj = sum_{i in class c} x_ij\n",
            "          C_cj = ( S_cj / sum_{all k} S_kj ) * 100\n",
            "        where C_cj is the percentage composition of class 'c' in sample 'j'.\n"
          ),
          "Normalized (intensity)" = paste0(
            "   - Value Aggregation (Normalized Intensity Mode):\n",
            "     For each lipid species 'i', abundance is normalized across all samples to sum to 1:\n",
            "          n_ij = x_ij / sum_{m} x_im\n",
            "     The normalized class abundance sum for class 'c' in sample 'j' is:\n",
            "          S_cj = sum_{i in class c} n_ij\n"
          ),
          "Normalized (%)" = paste0(
            "   - Value Aggregation (Normalized % Mode):\n",
            "     For each lipid species 'i', abundance is normalized across all samples to sum to 1:\n",
            "          n_ij = x_ij / sum_{m} x_im\n",
            "     The normalized class abundance sum is:\n",
            "          S_cj = sum_{i in class c} n_ij\n",
            "     The normalized percentage composition of class 'c' in sample 'j' is:\n",
            "          C_cj = ( S_cj / sum_{all k} S_kj ) * 100\n"
          ),
          paste0("   - Value Aggregation: Standard summation per class.\n")
        )
        
        # Build error bar description dynamically based on Stats Mode
        error_bar_desc <- ""
        if (is_agg() && isTRUE(input$showErrorBars)) {
          stats_mode_selected <- input$errorBarStatsMode %||% "sem"
          error_bar_desc <- if (stats_mode_selected == "sem") {
            paste0(
              "   - Standard Error of the Mean (SEM):\n",
              "        SEM_cG = SD_cG / sqrt(N_G)\n",
              "      where N_G is the replicate size of group G, and SD_cG is the standard deviation.\n"
            )
          } else {
            paste0(
              "   - Standard Deviation (SD):\n",
              "        SD_cG = sqrt( (1 / (N_G - 1)) * sum_{j in G} (C_cj - Mean_cG)^2 )\n",
              "      which estimates the dispersion of individual sample composition values around the mean.\n"
            )
          }
        }
        
        msg <- paste0(
          msg,
          "\n2. DATASET DIMENSIONS\n",
          "   - Features in Analysis: ", n_lipids, " lipids\n",
          "   - Classes / Groups:     ", n_classes, " unique values\n",
          "   - Samples / Replicates: ", n_samples, " samples\n\n",
          "3. MATHEMATICAL FORMULATION & CALCULUS EXAMPLE\n",
          calculus_desc, "\n",
          "   - Merged Group Averages:\n",
          "     For average group representation, samples are aggregated by Group 1.\n",
          "     For a group G with N_G replicates:\n",
          "          Mean_cG = (1 / N_G) * sum_{j in G} C_cj\n\n",
          error_bar_desc, "\n",
          "4. GROUP REPLICATE SIZES (N_G)\n"
        )
        
        if (is_agg()) {
          group_map <- barGroupingMap()
          df_class_sample$Group <- group_map[as.character(df_class_sample$SampleCol)]
          df_class_sample <- df_class_sample %>% dplyr::filter(!is.na(Group))
          
          # Count replicates per group
          g_counts <- df_class_sample %>% 
            dplyr::group_by(Group) %>% 
            dplyr::summarize(N = length(unique(SampleCol)), .groups = "drop")
          
          for (i in seq_len(nrow(g_counts))) {
            msg <- paste0(msg, "   - Group '", g_counts$Group[i], "': N = ", g_counts$N[i], " replicates\n")
          }
        } else {
          msg <- paste0(msg, "   - Individual Mode: N = 1 replicate per sample plotted directly.\n")
        }
      } else {
        msg <- paste0(msg, "\n2. Composition results are not available or matrix is empty.\n")
      }
      
      msg <- paste0(msg, "\n==================================================\n")
      
      # Append methodology routing summary
      msg <- paste0(msg, "\n", get_stats_console_method_summary(shared_data))
      
      # Write to stats_detail_text and display modal overlay
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Composition Barchart")
    })
  })
}
