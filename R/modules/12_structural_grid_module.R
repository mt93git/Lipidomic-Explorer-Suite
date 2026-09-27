# R/modules/12_structural_grid_module.R
# Carbon vs Double Bond Grid Visualizations (Heatmap & Dotplot)

# Helper function to format numeric p-values vectorially
format_p_value_vec <- function(p_vec) {
  sapply(p_vec, function(p) {
    if (is.na(p)) return("")
    if (p >= 0.001) {
      sprintf("%.3f", p)
    } else if (p >= 0.0001) {
      sprintf("%.4f", p)
    } else {
      sprintf("%.2e", p)
    }
  })
}

# --- Module UI ---

structural_grid_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = c("0. Nomenclature", "1. Selection Settings"), multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Selection Settings", icon = icon("filter"),
            checkboxInput(ns("use_hyperclass"), "Use Lipid Category", FALSE),
            uiOutput(ns("classSelectorUI")),
            radioButtons(ns("position"), "Position:",
                         choices = c("sn-1" = "sn1", "sn-2" = "sn2", "Both Chains" = "both"),
                         selected = "both"),
            uiOutput(ns("gridLog2fcThreshUI"))
          ),
          accordion_panel("2. Visual Aesthetics", icon = icon("paintbrush"),
            numericInput(ns("pointSize"), "Base Dot Size (Dotplot):", 6, min = 2, step = 1),
            numericInput(ns("textSize"), "Plot Base Text Size:", 12, min = 6, step = 1),
            tags$div(style = "display: none;",
              numericInput(ns("gridLabelSize"), "Legacy Label Size", 3.5)
            ),
            conditionalPanel("input.label_type == 'stars'", ns = ns,
              sliderInput(ns("gridStarsSize"), "Stars Size:", min = 1, max = 15, value = 10.0, step = 0.5)
            ),
            conditionalPanel("input.label_type == 'pvalue'", ns = ns,
              sliderInput(ns("gridPvalSize"), "P-Value Size:", min = 1, max = 10, value = 3.5, step = 0.5)
            ),
            checkboxInput(ns("boldLabels"), "Bold Grid Annotations", FALSE),
            checkboxInput(ns("customScaleColors"), "Custom Grid Colors", FALSE),
            conditionalPanel("input.customScaleColors == true", ns = ns,
              colourpicker::colourInput(ns("lowColor"), "Low (-FC):", "#2166AC"),
              colourpicker::colourInput(ns("midColor"), "Mid (0):", "#F7F7F7"),
              colourpicker::colourInput(ns("highColor"), "High (+FC):", "#B2182B")
            ),
            colourpicker::colourInput(ns("gridColor"), "Heatmap Grid Border:", "black"),
            hr(),
            radioButtons(ns("label_type"), "Grid Annotation Label:",
                         choices = c("Stars (*, **, ***)" = "stars", "Numeric P-Value" = "pvalue"),
                         selected = "stars"),
            radioButtons(ns("label_visibility"), "Label Visibility Cutoff:",
                         choices = c("Significant Only (Global P-Thresh)" = "sig_only", "Custom P-Value Threshold" = "custom_cutoff"),
                         selected = "sig_only"),
            conditionalPanel("input.label_visibility == 'custom_cutoff'", ns = ns,
              sliderInput(
                ns("label_p_cutoff"),
                tags$span(
                  "P-value Cutoff Slider:",
                  bslib::tooltip(
                    icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
                    "Applies a custom significance filter cutoff threshold below which grid annotations (p-values or significance stars) will be rendered on the structural heatmap."
                  )
                ),
                min = 0.001, max = 1.000, value = 0.050, step = 0.001
              )
            )
          )
        ),
        # Group1al Panel for Multi-Class Aesthetics (visible only on Filtered All Classes tab)
        conditionalPanel(
          condition = "input.grid_tabs == 'All Classes View' && input.all_classes_tabs == 'Filtered All Classes'",
          ns = ns,
          hr(),
          tags$h5("Multi-Class Aesthetics:"),
          uiOutput(ns("multiClassControlsUI"))
        ),
        hr(),
        helpText("Visualizes individual lipid fatty acid chain distributions by Carbon Length (X-axis) and Double Bond Count (Y-axis). Significance markings indicate lipids that are significantly different in the compared group."),
        hr(),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Structural Grid",
          subtitle = "This module maps lipid abundance shifts across Carbon Chain Length (X-axis) and Double Bond Count (Y-axis) coordinates:",
          bullets = list(
            tags$li(tags$strong("Single Class View:"), " Visualize log2 fold changes for individual lipid species within a selected class as a heatmap grid or dotplot grid."),
            tags$li(tags$strong("All Classes View:"), " Compare structural shift patterns across all lipid classes simultaneously in integrated grid alignments.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        navset_card_tab(
          id = ns("grid_tabs"),
          nav_panel("Single Class View", 
            div(
              class = "quick-access-strip mb-2.5 mt-2",
              tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#structural_grid_tab-classSelectorUI', 'plot_controls', '1. Selection Settings', event);",
                title = "Select lipid class to map onto Carbon vs Double Bond coordinates",
                icon("dna"), tags$strong("Select Lipid Class")
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#structural_grid_tab-position', 'plot_controls', '1. Selection Settings', event);",
                title = "Filter by acyl chain stereospecific position (sn-1, sn-2, or Both Chains)",
                icon("arrows-split-up-and-left"), "Chain Position (sn1/sn2/Both)"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access btn-quick-l2fc",
                onclick = "window.pointToElement('#structural_grid_tab-gridLog2fcThreshUI', 'plot_controls', '1. Selection Settings', event);",
                title = "Adjust |Log2FC| cutoff threshold for grid coloring",
                icon("filter"), "|Log2FC| Cutoff"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#structural_grid_tab-label_type', 'plot_controls', '2. Visual Aesthetics', event);",
                title = "Toggle grid annotations between Stars (*, **, ***) and Numeric P-values",
                icon("star"), "Grid Labels (Stars / P-val)"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#structural_grid_tab-lowColor', 'plot_controls', '2. Visual Aesthetics', event);",
                title = "Customize heatmap grid low/mid/high scale gradient colors in left dock",
                icon("palette"), "Grid Palette"
              )
            ),
            navset_card_tab(
              id = ns("single_class_tabs"),
              nav_panel("Heatmap Grid", 
                card_header(
                  class = "d-flex justify-content-between align-items-center",
                  "Heatmap of Mean Log2FC",
                  tags$div(
                    downloadButton(ns("downloadHeatmapCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                    downloadButton(ns("downloadHeatmapPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                  )
                ),
                card_body(
                  uiOutput(ns("de_not_run_banner_heatmap")),
                  plotOutput(ns("heatmapPlot"), height = "600px"),
                  uiOutput(ns("heatmap_stat_note"))
                )
              ),
              nav_panel("Dotplot Grid", 
                card_header(
                  class = "d-flex justify-content-between align-items-center",
                  "Dotplot of Mean Log2FC & Significance",
                  tags$div(
                    downloadButton(ns("downloadDotplotCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                    downloadButton(ns("downloadDotplotPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                  )
                ),
                card_body(
                  uiOutput(ns("de_not_run_banner_dotplot")),
                  plotOutput(ns("dotplotPlot"), height = "600px"),
                  uiOutput(ns("dotplot_stat_note"))
                )
              )
            )
          ),
          nav_panel("All Classes View", 
            div(
              class = "quick-access-strip mb-2.5 mt-2",
              tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#structural_grid_tab-all_classes_tabs', 'plot_controls', 'Selection Settings', event);",
                title = "Toggle between Merged Classes Grid (All Species) and Filtered All Classes",
                icon("layer-group"), tags$strong("Merged vs Filtered View")
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access btn-quick-l2fc",
                onclick = "window.pointToLog2FCFilter(event);",
                title = "Jump to global |Log2FC| cutoff in sidebar",
                icon("filter"), "|Log2FC| Filter Cutoff"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#structural_grid_tab-classLabelFormat', 'plot_controls', '0. Nomenclature', event);",
                title = "Toggle between complete class names and standard abbreviations",
                icon("font"), "Nomenclature (Full / Abbrev)"
              ),
              tags$button(
                type = "button",
                class = "btn-quick-access",
                onclick = "window.pointToElement('#structural_grid_tab-pointSize', 'plot_controls', '2. Visual Aesthetics', event);",
                title = "Adjust base dot size and plot text size across all class grids",
                icon("ruler-combined"), "Dot & Text Sizing"
              )
            ),
            navset_card_tab(
              id = ns("all_classes_tabs"),
              nav_panel("Merged Classes Grid", 
                card_header(
                  class = "d-flex justify-content-between align-items-center",
                  "Merged Classes Grid (All Species)",
                  tags$div(
                    downloadButton(ns("downloadMergedCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                    downloadButton(ns("downloadMergedPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                  )
                ),
                card_body(
                  uiOutput(ns("de_not_run_banner_merged")),
                  plotOutput(ns("mergedPlot"), height = "600px"),
                  uiOutput(ns("merged_stat_note"))
                )
              ),
              nav_panel("Filtered All Classes", 
                card_header(
                  class = "d-flex justify-content-between align-items-center",
                  "Differential Expression of All Classes",
                  tags$div(
                    downloadButton(ns("downloadDiffAllCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                    downloadButton(ns("downloadDiffAllPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                  )
                ),
                card_body(
                  uiOutput(ns("de_not_run_banner_diffall")),
                  plotOutput(ns("diffAllPlot"), height = "600px"),
                  uiOutput(ns("diffAll_stat_note"))
                )
              )
            )
          )
        )
      ), options = list(handles = "s, se"))
    )
  )
}

# --- Module Server ---

structural_grid_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    
    # --- 1. Dynamic Controls & Ingestion ---
    
    format_class_name <- function(cls) {
      if (is.null(cls) || length(cls) == 0) return(cls)
      if (identical(input$classLabelFormat %||% "full", "short")) {
        sapply(cls, get_short_class_name)
      } else {
        sapply(cls, get_full_class_name)
      }
    }
    
    output$classSelectorUI <- renderUI({
      req(shared_data$annotationData())
      
      # Inform user if class selector is bypassed
      if (identical(input$grid_tabs, "All Classes View")) {
        return(helpText(tags$em("Note: Individual class selection is bypassed when viewing all classes merged.")))
      }
      
      anno <- shared_data$annotationData()
      use_hyper <- isTRUE(input$use_hyperclass)
      raw_choices <- if (use_hyper) {
        sort(unique(anno$hyperclass))
      } else {
        sort(unique(anno$subclass))
      }
      raw_choices <- raw_choices[!is.na(raw_choices) & raw_choices != "Misc" & raw_choices != "Unknown"]
      
      # Clean names for user display based on classLabelFormat
      display_names <- format_class_name(raw_choices)
      choices_list <- as.list(raw_choices)
      names(choices_list) <- display_names
      
      curr_sel <- isolate(input$lipid_class)
      default_sel <- if (!is.null(curr_sel) && curr_sel %in% raw_choices) {
        curr_sel
      } else {
        shared_data$get_restored_input(session$ns("lipid_class"), raw_choices[1])
      }
      
      selectInput(session$ns("lipid_class"), "Lipid Class:", choices = choices_list, selected = default_sel)
    })
    
    output$gridLog2fcThreshUI <- renderUI({
      curr_val <- isolate(input$gridLog2fcThresh)
      saved_val <- if (!is.null(curr_val)) {
        curr_val
      } else {
        shared_data$get_restored_input(session$ns("gridLog2fcThresh"), 0.0)
      }
      numericInput(
        session$ns("gridLog2fcThresh"),
        tags$span(
          "Log2FC Threshold (abs):",
          bslib::tooltip(
            icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
            "Applies an effect size filter to restrict structural grid dotplots and heatmaps to lipid species whose absolute log2 fold change (|Log2FC|) meets or exceeds this cutoff threshold."
          )
        ), 
        value = saved_val, min = 0.0, step = 0.1
      )
    })
    
    output$multiClassControlsUI <- renderUI({
      ns <- session$ns
      
      size_sel <- shared_data$get_restored_input(ns("all_size_map"), "carbon_lfc")
      color_sel <- shared_data$get_restored_input(ns("all_color_map"), "db_lfc")
      alpha_sel <- shared_data$get_restored_input(ns("all_alpha_map"), "db_lfc")
      hide_non_sig <- shared_data$get_restored_input(ns("hide_non_sig_all_classes"), TRUE)
      
      tagList(
        selectInput(ns("all_size_map"), "Map Dot Size to:", 
                    choices = c("Carbon Length L2FC" = "carbon_lfc", "Double Bond L2FC" = "db_lfc"), 
                    selected = size_sel),
        selectInput(ns("all_color_map"), "Map Dot Color to:", 
                    choices = c("Double Bond L2FC" = "db_lfc", "Carbon Length L2FC" = "carbon_lfc"), 
                    selected = color_sel),
        selectInput(ns("all_alpha_map"), "Map Dot Transparency to:", 
                    choices = c("Double Bond L2FC" = "db_lfc", "Carbon Length L2FC" = "carbon_lfc", "Constant" = "constant"), 
                    selected = alpha_sel),
        checkboxInput(ns("hide_non_sig_all_classes"), "Hide Non-Significant Intersections", 
                      value = hide_non_sig)
      )
    })
    
    # Plot size dimensions listener
    plot_dims <- reactiveValues(
      heatmap = list(width = 800, height = 600),
      dotplot = list(width = 800, height = 600),
      merged = list(width = 800, height = 600),
      diff_all = list(width = 800, height = 600)
    )
    
    observeEvent(input$heatmapPlot_size, {
      plot_dims$heatmap <- input$heatmapPlot_size
    })
    observeEvent(input$dotplotPlot_size, {
      plot_dims$dotplot <- input$dotplotPlot_size
    })
    observeEvent(input$mergedPlot_size, {
      plot_dims$merged <- input$mergedPlot_size
    })
    observeEvent(input$diffAllPlot_size, {
      plot_dims$diff_all <- input$diffAllPlot_size
    })
    
    # --- Single Class Filtered Data Source ---
    gridFilteredData <- reactive({
      req(shared_data$de_results(), shared_data$annotationData(), input$lipid_class)
      
      de_res <- shared_data$de_results()
      anno <- shared_data$annotationData()
      
      # Join DE results and structural annotations
      df <- de_res %>%
        dplyr::left_join(anno, by = "Lipid_Name")
      
      # Apply global filters
      filtered_ids <- shared_data$global_filtered_lipids()
      if (!is.null(filtered_ids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      
      # Filter class/hyperclass using raw values
      target_cls <- input$lipid_class
      use_hyper <- isTRUE(input$use_hyperclass)
      
      df_class <- if (use_hyper) {
        df %>% dplyr::filter(hyperclass == target_cls)
      } else {
        df %>% dplyr::filter(subclass == target_cls)
      }
      
      # Filter local Log2FC Threshold
      lfc_thresh <- if (!is.null(input$gridLog2fcThresh)) input$gridLog2fcThresh else 0.0
      df_class <- df_class %>%
        dplyr::filter(abs(log2FC) >= lfc_thresh)
      
      df_class
    })
    
    # Grid calculation logic for Single Class
    gridResults <- reactive({
      df <- gridFilteredData()
      req(nrow(df) > 0)
      
      # Determine position coordinates mapping
      pos <- input$position %||% "both"
      
      if (pos == "sn1") {
        grid_df <- df %>%
          dplyr::filter(!is.na(nCchain1), !is.na(DBchain1)) %>%
          dplyr::mutate(Carbon = nCchain1, DB = DBchain1)
      } else if (pos == "sn2") {
        grid_df <- df %>%
          dplyr::filter(!is.na(nCchain2), !is.na(DBchain2)) %>%
          dplyr::mutate(Carbon = nCchain2, DB = DBchain2)
      } else { # "both"
        # Duplicate for sn1 and sn2 chains
        df_sn1 <- df %>%
          dplyr::filter(!is.na(nCchain1), !is.na(DBchain1)) %>%
          dplyr::mutate(Carbon = nCchain1, DB = DBchain1, Chain_Pos = "sn-1")
        df_sn2 <- df %>%
          dplyr::filter(!is.na(nCchain2), !is.na(DBchain2)) %>%
          dplyr::mutate(Carbon = nCchain2, DB = DBchain2, Chain_Pos = "sn-2")
        grid_df <- dplyr::bind_rows(df_sn1, df_sn2)
      }
      
      req(nrow(grid_df) > 0)
      
      # Retrieve p-value configuration
      de_sett <- shared_data$de_settings()
      p_thresh <- de_sett$p_threshold %||% 0.05
      p_type <- de_sett$p_value_type %||% "raw"
      use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
      
      # Group by Carbon and DB to aggregate mean Log2FC and significance
      aggregated <- grid_df %>%
        dplyr::group_by(Carbon, DB) %>%
        dplyr::summarise(
          Mean_LFC = mean(log2FC, na.rm = TRUE),
          Min_P = min(p_raw, na.rm = TRUE),
          Min_P_Adj = min(p_adj_bh, na.rm = TRUE),
          n_lipids = dplyr::n(),
          Lipid_List = paste(Lipid_Name, collapse = ", "),
          .groups = "drop"
        ) %>%
        dplyr::mutate(
          Active_P = if (use_adj) Min_P_Adj else Min_P,
          Stars = dplyr::case_when(
            Active_P < 0.001 ~ "***",
            Active_P < 0.01  ~ "**",
            Active_P < 0.05  ~ "*",
            TRUE ~ ""
          ),
          Dots = dplyr::case_when(
            Active_P < 0.001 ~ "\u25CF\u25CF\u25CF",
            Active_P < 0.01  ~ "\u25CF\u25CF",
            Active_P < 0.05  ~ "\u25CF",
            TRUE ~ ""
          )
        )
      
      # Determine dynamic label cutoff and formatting
      lbl_type <- input$label_type %||% "stars"
      lbl_vis <- input$label_visibility %||% "sig_only"
      lbl_cutoff <- if (lbl_vis == "sig_only") p_thresh else (input$label_p_cutoff %||% 0.05)
      
      if (lbl_type == "stars") {
        aggregated <- aggregated %>%
          dplyr::mutate(
            Label = dplyr::case_when(
              Active_P < lbl_cutoff & Active_P < 0.001 ~ "***",
              Active_P < lbl_cutoff & Active_P < 0.01  ~ "**",
              Active_P < lbl_cutoff & Active_P < 0.05  ~ "*",
              TRUE ~ ""
            )
          )
      } else {
        aggregated <- aggregated %>%
          dplyr::mutate(
            Label = dplyr::case_when(
              Active_P < lbl_cutoff ~ format_p_value_vec(Active_P),
              TRUE ~ ""
            )
          )
      }
      
      aggregated
    })
    
    # --- All Classes Filters and Calculations ---
    
    allClassesData <- reactive({
      req(shared_data$de_results(), shared_data$annotationData())
      
      de_res <- shared_data$de_results()
      anno <- shared_data$annotationData()
      
      # Join DE results and structural annotations
      df <- de_res %>%
        dplyr::left_join(anno, by = "Lipid_Name")
      
      # Apply global filters
      filtered_ids <- shared_data$global_filtered_lipids()
      if (!is.null(filtered_ids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      
      # Filter local Log2FC Threshold
      lfc_thresh <- if (!is.null(input$gridLog2fcThresh)) input$gridLog2fcThresh else 0.0
      df <- df %>%
        dplyr::filter(abs(log2FC) >= lfc_thresh)
      
      df
    })
    
    allClassesProcessed <- reactive({
      df <- allClassesData()
      req(nrow(df) > 0)
      
      # Determine position coordinates mapping
      pos <- input$position %||% "both"
      
      if (pos == "sn1") {
        grid_df <- df %>%
          dplyr::filter(!is.na(nCchain1), !is.na(DBchain1)) %>%
          dplyr::mutate(Carbon = nCchain1, DB = DBchain1)
      } else if (pos == "sn2") {
        grid_df <- df %>%
          dplyr::filter(!is.na(nCchain2), !is.na(DBchain2)) %>%
          dplyr::mutate(Carbon = nCchain2, DB = DBchain2)
      } else { # "both"
        # Duplicate for sn1 and sn2 chains
        df_sn1 <- df %>%
          dplyr::filter(!is.na(nCchain1), !is.na(DBchain1)) %>%
          dplyr::mutate(Carbon = nCchain1, DB = DBchain1, Chain_Pos = "sn-1")
        df_sn2 <- df %>%
          dplyr::filter(!is.na(nCchain2), !is.na(DBchain2)) %>%
          dplyr::mutate(Carbon = nCchain2, DB = DBchain2, Chain_Pos = "sn-2")
        grid_df <- dplyr::bind_rows(df_sn1, df_sn2)
      }
      
      req(nrow(grid_df) > 0)
      
      use_hyper <- isTRUE(input$use_hyperclass)
      grid_df <- grid_df %>%
        dplyr::mutate(
          Class_Var = if (use_hyper) hyperclass else subclass
        ) %>%
        dplyr::filter(!is.na(Class_Var), Class_Var != "Misc", Class_Var != "Unknown")
      
      grid_df
    })
    
    mergedClassesResults <- reactive({
      df <- allClassesProcessed()
      req(nrow(df) > 0)
      
      df %>%
        dplyr::group_by(Class_Var, Carbon, DB) %>%
        dplyr::summarise(
          Mean_LFC = mean(log2FC, na.rm = TRUE),
          n_lipids = dplyr::n(),
          Lipid_List = paste(Lipid_Name, collapse = ", "),
          .groups = "drop"
        )
    })
    
    filteredAllClassesResults <- reactive({
      df <- allClassesProcessed()
      req(nrow(df) > 0)
      
      # Class-specific mean Log2FC grouped by Carbon Length
      class_carbon_summary <- df %>%
        dplyr::group_by(Class_Var, Carbon) %>%
        dplyr::summarise(Carbon_LFC = mean(log2FC, na.rm = TRUE), .groups = "drop")
      
      # Class-specific mean Log2FC grouped by Double Bond Count
      class_db_summary <- df %>%
        dplyr::group_by(Class_Var, DB) %>%
        dplyr::summarise(DB_LFC = mean(log2FC, na.rm = TRUE), .groups = "drop")
      
      # Combined Grid mapping
      base_grid <- df %>%
        dplyr::group_by(Class_Var, Carbon, DB) %>%
        dplyr::summarise(
          Cell_Mean_LFC = mean(log2FC, na.rm = TRUE),
          Min_P = min(p_raw, na.rm = TRUE),
          Min_P_Adj = min(p_adj_bh, na.rm = TRUE),
          n_lipids = dplyr::n(),
          Lipid_List = paste(Lipid_Name, collapse = ", "),
          .groups = "drop"
        ) %>%
        dplyr::left_join(class_carbon_summary, by = c("Class_Var", "Carbon")) %>%
        dplyr::left_join(class_db_summary, by = c("Class_Var", "DB"))
      
      # Retrieve p-value configuration
      de_sett <- shared_data$de_settings()
      p_thresh <- de_sett$p_threshold %||% 0.05
      p_type <- de_sett$p_value_type %||% "raw"
      use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
      
      base_grid <- base_grid %>%
        dplyr::mutate(
          Active_P = if (use_adj) Min_P_Adj else Min_P
        )
      
      # Filter non-significant points if checkbox is checked
      lbl_vis <- input$label_visibility %||% "sig_only"
      lbl_cutoff <- if (lbl_vis == "sig_only") p_thresh else (input$label_p_cutoff %||% 0.05)
      
      if (isTRUE(input$hide_non_sig_all_classes)) {
        base_grid <- base_grid %>%
          dplyr::filter(Active_P < lbl_cutoff)
      }
      
      # Dynamic label cutoff and formatting for significance tags
      lbl_type <- input$label_type %||% "stars"
      
      if (lbl_type == "stars") {
        base_grid <- base_grid %>%
          dplyr::mutate(
            Label = dplyr::case_when(
              Active_P < lbl_cutoff & Active_P < 0.001 ~ "***",
              Active_P < lbl_cutoff & Active_P < 0.01  ~ "**",
              Active_P < lbl_cutoff & Active_P < 0.05  ~ "*",
              TRUE ~ ""
            )
          )
      } else {
        base_grid <- base_grid %>%
          dplyr::mutate(
            Label = dplyr::case_when(
              Active_P < lbl_cutoff ~ format_p_value_vec(Active_P),
              TRUE ~ ""
            )
          )
      }
      
      base_grid
    })
    
    output$de_not_run_banner_heatmap <- renderUI({ render_de_not_run_banner(shared_data) })
    output$de_not_run_banner_dotplot <- renderUI({ render_de_not_run_banner(shared_data) })
    output$de_not_run_banner_merged <- renderUI({ render_de_not_run_banner(shared_data) })
    output$de_not_run_banner_diffall <- renderUI({ render_de_not_run_banner(shared_data) })
    
    # --- 2. Heatmap Render (Single Class) ---
    
    output$heatmapPlot <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      res <- gridResults()
      validate(need(!is.null(res) && nrow(res) > 0, "No data available. Adjust options and click 'Generate Grid Plots'."))
      
      n_cols <- length(unique(res$Carbon))
      n_rows <- length(unique(res$DB))
      lbl_type <- input$label_type %||% "stars"
      base_label_size <- if (lbl_type == "stars") {
        input$gridStarsSize %||% 10.0
      } else {
        input$gridPvalSize %||% 3.5
      }
      scale_factor <- 1
      if (n_cols > 10) scale_factor <- scale_factor * (10 / n_cols)
      if (n_rows > 8) scale_factor <- scale_factor * (8 / n_rows)
      if (isTRUE(input$label_type == "pvalue")) scale_factor <- scale_factor * 0.85
      final_label_size <- max(base_label_size * scale_factor, 1.8)
      lbl_fontface <- if (isTRUE(input$boldLabels)) "bold" else "plain"
      
      low_val <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#2166AC"
      mid_val <- if (isTRUE(input$customScaleColors) && !is.null(input$midColor)) input$midColor else "#F7F7F7"
      high_val <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#B2182B"
      grid_border <- input$gridColor %||% "black"
      
      scale_x_breaks <- if (min(res$Carbon, na.rm=T) == max(res$Carbon, na.rm=T)) {
        min(res$Carbon, na.rm=T)
      } else {
        seq(min(res$Carbon, na.rm=T), max(res$Carbon, na.rm=T), by = 2)
      }
      scale_y_breaks <- if (min(res$DB, na.rm=T) == max(res$DB, na.rm=T)) {
        min(res$DB, na.rm=T)
      } else {
        seq(min(res$DB, na.rm=T), max(res$DB, na.rm=T), by = 1)
      }
      
      p <- ggplot(res, aes(x = Carbon, y = DB, fill = Mean_LFC)) +
        geom_tile(color = grid_border, size = 0.3) +
        geom_text(aes(label = Label), color = "black", size = final_label_size, fontface = lbl_fontface, vjust = 0.5, hjust = 0.5) +
        scale_fill_gradient2(low = low_val, mid = mid_val, high = high_val, midpoint = 0, name = "Mean Log2FC") +
        scale_x_continuous(breaks = scale_x_breaks) +
        scale_y_continuous(breaks = scale_y_breaks) +
        theme_minimal(base_size = input$textSize) +
        theme(
          panel.grid.major = element_blank(),
          panel.grid.minor = element_blank(),
          axis.text = element_text(color = "black", face = "bold")
        ) +
        labs(
          x = "Carbon Length",
          y = "Double Bond Count",
          title = paste("Heatmap Grid:", format_class_name(input$lipid_class)),
          subtitle = paste("Position:", toupper(input$position), "| Mean Log2FC per Cell")
        )
      
      p
    })
    
    # --- 3. Dotplot Render (Single Class) ---
    
    output$dotplotPlot <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      res <- gridResults()
      validate(need(!is.null(res) && nrow(res) > 0, "No data available. Adjust options and click 'Generate Grid Plots'."))
      
      n_cols <- length(unique(res$Carbon))
      n_rows <- length(unique(res$DB))
      lbl_type <- input$label_type %||% "stars"
      base_label_size <- if (lbl_type == "stars") {
        input$gridStarsSize %||% 10.0
      } else {
        input$gridPvalSize %||% 3.5
      }
      scale_factor <- 1
      if (n_cols > 10) scale_factor <- scale_factor * (10 / n_cols)
      if (n_rows > 8) scale_factor <- scale_factor * (8 / n_rows)
      if (isTRUE(input$label_type == "pvalue")) scale_factor <- scale_factor * 0.85
      final_label_size <- max(base_label_size * scale_factor, 1.8)
      lbl_fontface <- if (isTRUE(input$boldLabels)) "bold" else "plain"
      
      low_val <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#2166AC"
      mid_val <- if (isTRUE(input$customScaleColors) && !is.null(input$midColor)) input$midColor else "#F7F7F7"
      high_val <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#B2182B"
      
      scale_x_breaks <- if (min(res$Carbon, na.rm=T) == max(res$Carbon, na.rm=T)) {
        min(res$Carbon, na.rm=T)
      } else {
        seq(min(res$Carbon, na.rm=T), max(res$Carbon, na.rm=T), by = 2)
      }
      scale_y_breaks <- if (min(res$DB, na.rm=T) == max(res$DB, na.rm=T)) {
        min(res$DB, na.rm=T)
      } else {
        seq(min(res$DB, na.rm=T), max(res$DB, na.rm=T), by = 1)
      }
      
      p <- ggplot(res, aes(x = Carbon, y = DB)) +
        geom_point(aes(fill = Mean_LFC, size = abs(Mean_LFC)), shape = 21, color = "black", stroke = 0.5) +
        geom_text(aes(label = Label), color = "black", size = final_label_size, fontface = lbl_fontface, vjust = 0.5, hjust = 0.5) +
        scale_fill_gradient2(low = low_val, mid = mid_val, high = high_val, midpoint = 0, name = "Mean Log2FC") +
        scale_x_continuous(breaks = scale_x_breaks) +
        scale_y_continuous(breaks = scale_y_breaks) +
        scale_size_continuous(range = c(input$pointSize, input$pointSize * 2.2), name = "abs(LFC)") +
        theme_minimal(base_size = input$textSize) +
        theme(
          panel.grid.major = element_line(color = "grey90", size = 0.2),
          panel.grid.minor = element_blank(),
          axis.text = element_text(color = "black", face = "bold")
        ) +
        labs(
          x = "Carbon Length",
          y = "Double Bond Count",
          title = paste("Dotplot Grid:", format_class_name(input$lipid_class)),
          subtitle = paste("Position:", toupper(input$position), "| Size = abs(Mean LFC)")
        )
      
      p
    })
    
    # --- 4. Merged Classes Plot Render ---
    
    output$mergedPlot <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      res <- mergedClassesResults()
      validate(need(!is.null(res) && nrow(res) > 0, "No data available for merged classes. Verify filtering configurations."))
      
      use_hyper <- isTRUE(input$use_hyperclass)
      color_map <- if (use_hyper) HYPERCLASS_MAP_COLORS else CLASS_MAP_COLORS
      
      # Inject missing classes to prevent ggplot map warnings
      all_unique_classes <- unique(res$Class_Var)
      missing_classes <- setdiff(all_unique_classes, names(color_map))
      if (length(missing_classes) > 0) {
        fallback_colors <- setNames(rep("#B0B0B0", length(missing_classes)), missing_classes)
        color_map <- c(color_map, fallback_colors)
      }
      
      scale_x_breaks <- if (min(res$Carbon, na.rm=T) == max(res$Carbon, na.rm=T)) {
        min(res$Carbon, na.rm=T)
      } else {
        seq(min(res$Carbon, na.rm=T), max(res$Carbon, na.rm=T), by = 2)
      }
      scale_y_breaks <- if (min(res$DB, na.rm=T) == max(res$DB, na.rm=T)) {
        min(res$DB, na.rm=T)
      } else {
        seq(min(res$DB, na.rm=T), max(res$DB, na.rm=T), by = 1)
      }
      
      p <- ggplot(res, aes(x = Carbon, y = DB, color = Class_Var, fill = Class_Var)) +
        geom_point(position = position_jitter(width = 0.18, height = 0.18), size = input$pointSize %||% 6, alpha = 0.85) +
        scale_color_manual(values = color_map, labels = format_class_name, name = "Lipid Class") +
        scale_fill_manual(values = color_map, labels = format_class_name, name = "Lipid Class") +
        scale_x_continuous(breaks = scale_x_breaks) +
        scale_y_continuous(breaks = scale_y_breaks) +
        theme_minimal(base_size = input$textSize) +
        theme(
          panel.grid.major = element_line(color = "grey90", size = 0.2),
          panel.grid.minor = element_blank(),
          axis.text = element_text(color = "black", face = "bold")
        ) +
        labs(
          x = "Carbon Length",
          y = "Double Bond Count",
          title = "Merged Classes Grid",
          subtitle = paste("Position:", toupper(input$position), "| Colored by Class")
        )
      
      p
    })
    
    # --- 5. Filtered All Classes Plot Render (Differential Expression Grid) ---
    
    output$diffAllPlot <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      res <- filteredAllClassesResults()
      validate(need(!is.null(res) && nrow(res) > 0, "No data available for filtered all classes."))
      
      use_hyper <- isTRUE(input$use_hyperclass)
      color_map <- if (use_hyper) HYPERCLASS_MAP_COLORS else CLASS_MAP_COLORS
      
      # Inject missing classes to prevent ggplot map warnings
      all_unique_classes <- unique(res$Class_Var)
      missing_classes <- setdiff(all_unique_classes, names(color_map))
      if (length(missing_classes) > 0) {
        fallback_colors <- setNames(rep("#B0B0B0", length(missing_classes)), missing_classes)
        color_map <- c(color_map, fallback_colors)
      }
      
      # Parse dynamic size, fill color, and transparency mappings
      size_var <- input$all_size_map %||% "carbon_lfc"
      color_var <- input$all_color_map %||% "db_lfc"
      alpha_var <- input$all_alpha_map %||% "db_lfc"
      
      if (size_var == "carbon_lfc") {
        res$Size_Val <- abs(res$Carbon_LFC)
      } else {
        res$Size_Val <- abs(res$DB_LFC)
      }
      
      if (color_var == "carbon_lfc") {
        res$Color_Val <- res$Carbon_LFC
      } else {
        res$Color_Val <- res$DB_LFC
      }
      
      res$Size_Val[is.na(res$Size_Val)] <- 0
      res$Color_Val[is.na(res$Color_Val)] <- 0
      
      if (alpha_var == "carbon_lfc") {
        res$Alpha_Val <- abs(res$Carbon_LFC)
      } else if (alpha_var == "db_lfc") {
        res$Alpha_Val <- abs(res$DB_LFC)
      } else {
        res$Alpha_Val <- 0.9 # constant value
      }
      res$Alpha_Val[is.na(res$Alpha_Val)] <- 0
      
      low_val <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#2166AC"
      mid_val <- if (isTRUE(input$customScaleColors) && !is.null(input$midColor)) input$midColor else "#F7F7F7"
      high_val <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#B2182B"
      
      scale_x_breaks <- if (min(res$Carbon, na.rm=T) == max(res$Carbon, na.rm=T)) {
        min(res$Carbon, na.rm=T)
      } else {
        seq(min(res$Carbon, na.rm=T), max(res$Carbon, na.rm=T), by = 2)
      }
      scale_y_breaks <- if (min(res$DB, na.rm=T) == max(res$DB, na.rm=T)) {
        min(res$DB, na.rm=T)
      } else {
        seq(min(res$DB, na.rm=T), max(res$DB, na.rm=T), by = 1)
      }
      
      # Determine dynamic label size and fontface
      lbl_type <- input$label_type %||% "stars"
      base_label_size <- if (lbl_type == "stars") {
        input$gridStarsSize %||% 10.0
      } else {
        input$gridPvalSize %||% 3.5
      }
      
      n_cols <- length(unique(res$Carbon))
      n_rows <- length(unique(res$DB))
      scale_factor <- 1
      if (n_cols > 10) scale_factor <- scale_factor * (10 / n_cols)
      if (n_rows > 8) scale_factor <- scale_factor * (8 / n_rows)
      if (isTRUE(input$label_type == "pvalue")) scale_factor <- scale_factor * 0.85
      final_label_size <- max(base_label_size * scale_factor, 1.8)
      lbl_fontface <- if (isTRUE(input$boldLabels)) "bold" else "plain"
      
      # Use constant seed so dot and text label are jittered together perfectly
      jitter_pos <- position_jitter(width = 0.18, height = 0.18, seed = 42)
      
      p <- ggplot(res, aes(x = Carbon, y = DB))
      
      if (alpha_var == "constant") {
        p <- p + geom_point(
          aes(
            color = Class_Var,
            fill = Color_Val,
            size = Size_Val
          ),
          shape = 21,
          stroke = 1.5,
          alpha = 0.9,
          position = jitter_pos
        )
      } else {
        p <- p + geom_point(
          aes(
            color = Class_Var,
            fill = Color_Val,
            size = Size_Val,
            alpha = Alpha_Val
          ),
          shape = 21,
          stroke = 1.5,
          position = jitter_pos
        ) +
        scale_alpha_continuous(range = c(0.3, 1.0), name = "abs(LFC) Alpha")
      }
      
      # Render text labels on top of the circles
      p <- p +
        geom_text(
          aes(label = Label),
          color = "black",
          size = final_label_size,
          fontface = lbl_fontface,
          vjust = 0.5,
          hjust = 0.5,
          position = jitter_pos
        )
      
      p <- p +
        scale_color_manual(values = color_map, labels = format_class_name, name = "Class Contour") +
        scale_fill_gradient2(low = low_val, mid = mid_val, high = high_val, midpoint = 0, name = "Mapped L2FC") +
        scale_size_continuous(range = c(input$pointSize, input$pointSize * 2.5), name = "abs(LFC) Size") +
        scale_x_continuous(breaks = scale_x_breaks) +
        scale_y_continuous(breaks = scale_y_breaks) +
        theme_minimal(base_size = input$textSize) +
        theme(
          panel.grid.major = element_line(color = "grey90", size = 0.2),
          panel.grid.minor = element_blank(),
          axis.text = element_text(color = "black", face = "bold")
        ) +
        labs(
          x = "Carbon Length",
          y = "Double Bond Count",
          title = "Differential Expression of All Classes",
          subtitle = paste0(
            "Position: ", toupper(input$position),
            " | Size: ", ifelse(size_var == "carbon_lfc", "Carbon Length L2FC", "Double Bond L2FC"),
            " | Color: ", ifelse(color_var == "carbon_lfc", "Carbon Length L2FC", "Double Bond L2FC")
          )
        )
      
      p
    })
    
    # --- 6. Statistic Dynamic Note Captions ---
    
    captionReactive <- reactive({
      req(shared_data$de_settings())
      de_sett <- shared_data$de_settings()
      p_thresh <- de_sett$p_threshold %||% 0.05
      p_type <- de_sett$p_value_type %||% "raw"
      use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
      p_label <- if (use_adj) "FDR adjusted p-value" else "raw p-value"
      
      # Call general caption builder
      get_journal_caption(
        "structural_grid", 
        shared_data$actual_de_method(), 
        shared_data$de_settings()$p_value_type, 
        contrast_info = shared_data$de_contrast_info()
      )
    })
    
    output$heatmap_stat_note <- renderUI({
      de_sett <- shared_data$de_settings()
      p_thresh <- de_sett$p_threshold %||% 0.05
      p_type <- de_sett$p_value_type %||% "raw"
      use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
      p_label <- if (use_adj) "FDR adjusted p-value" else "raw p-value"
      
      lbl_type <- input$label_type %||% "stars"
      lbl_vis <- input$label_visibility %||% "sig_only"
      lbl_cutoff <- if (lbl_vis == "sig_only") p_thresh else (input$label_p_cutoff %||% 0.05)
      
      if (lbl_type == "stars") {
        sig_text <- paste0("Stars inside cells denote significant fold-change intersections (*: ", p_label, " < 0.05, **: < 0.01, ***: < 0.001)")
        if (lbl_vis == "custom_cutoff") {
          sig_text <- paste0(sig_text, " with cutoff ", p_label, " < ", lbl_cutoff)
        }
      } else {
        sig_text <- paste0("Numbers inside cells show the minimum ", p_label, " (filtered for ", p_label, " < ", lbl_cutoff, ")")
      }
      
      note_text <- paste0(
        "<b>Figure Note:</b> Grid illustration of fatty acid chain profiles. Each cell shows the average Log2 fold change. ",
        sig_text, "."
      )
      
      shiny::HTML(paste0(
        "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333;'>",
        note_text, "<br/><span style='color: #666; font-style: italic;'>", captionReactive(), "</span></div>"
      ))
    })
    
    output$dotplot_stat_note <- renderUI({
      de_sett <- shared_data$de_settings()
      p_thresh <- de_sett$p_threshold %||% 0.05
      p_type <- de_sett$p_value_type %||% "raw"
      use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
      p_label <- if (use_adj) "FDR adjusted p-value" else "raw p-value"
      
      lbl_type <- input$label_type %||% "stars"
      lbl_vis <- input$label_visibility %||% "sig_only"
      lbl_cutoff <- if (lbl_vis == "sig_only") p_thresh else (input$label_p_cutoff %||% 0.05)
      
      if (lbl_type == "stars") {
        sig_text <- paste0("Stars indicate significant fold-change enrichments (*: ", p_label, " < 0.05, **: < 0.01, ***: < 0.001)")
        if (lbl_vis == "custom_cutoff") {
          sig_text <- paste0(sig_text, " with cutoff ", p_label, " < ", lbl_cutoff)
        }
      } else {
        sig_text <- paste0("Numbers indicate the minimum ", p_label, " (filtered for ", p_label, " < ", lbl_cutoff, ")")
      }
      
      note_text <- paste0(
        "<b>Figure Note:</b> Dot plot representation of fatty acid chain profiles. Circle size shows the magnitude of average fold change, and color denotes mean Log2FC. ",
        sig_text, "."
      )
      
      shiny::HTML(paste0(
        "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333;'>",
        note_text, "<br/><span style='color: #666; font-style: italic;'>", captionReactive(), "</span></div>"
      ))
    })
    
    output$merged_stat_note <- renderUI({
      note_text <- paste0(
        "<b>Figure Note:</b> Merged Grid representation of all lipid classes. Each point represents the presence of a lipid species at that Carbon and Double Bond intersection, color-coded by class."
      )
      
      shiny::HTML(paste0(
        "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333;'>",
        note_text, "</div>"
      ))
    })
    
    output$diffAll_stat_note <- renderUI({
      size_var <- input$all_size_map %||% "carbon_lfc"
      color_var <- input$all_color_map %||% "db_lfc"
      
      note_text <- paste0(
        "<b>Figure Note:</b> Multi-class differential expression grid. ",
        "Circle border (contour) denotes the lipid class. ",
        "Circle fill is mapped to the average ", color_var, " (Double Bond or Carbon Length Log2FC). ",
        "Circle size is mapped to the absolute value of ", size_var, "."
      )
      
      shiny::HTML(paste0(
        "<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333;'>",
        note_text, "<br/><span style='color: #666; font-style: italic;'>", captionReactive(), "</span></div>"
      ))
    })
    
    # --- 7. Download Handlers ---
    
    output$downloadHeatmapPDF <- downloadHandler(
      filename = function() {
        paste0("HeatmapGrid_", gsub("\\s", "_", input$lipid_class), "_", format(Sys.time(), "%Y%m%d_%H%M"), ".pdf")
      },
      content = function(file) {
        res <- gridResults()
        req(res)
        
        n_cols <- length(unique(res$Carbon))
        n_rows <- length(unique(res$DB))
        lbl_type <- input$label_type %||% "stars"
        base_label_size <- if (lbl_type == "stars") {
          input$gridStarsSize %||% 10.0
        } else {
          input$gridPvalSize %||% 3.5
        }
        scale_factor <- 1
        if (n_cols > 10) scale_factor <- scale_factor * (10 / n_cols)
        if (n_rows > 8) scale_factor <- scale_factor * (8 / n_rows)
        if (isTRUE(input$label_type == "pvalue")) scale_factor <- scale_factor * 0.85
        final_label_size <- max(base_label_size * scale_factor, 1.8)
        lbl_fontface <- if (isTRUE(input$boldLabels)) "bold" else "plain"
        
        low_val <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#2166AC"
        mid_val <- if (isTRUE(input$customScaleColors) && !is.null(input$midColor)) input$midColor else "#F7F7F7"
        high_val <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#B2182B"
        grid_border <- input$gridColor %||% "black"
        
        scale_x_breaks <- if (min(res$Carbon, na.rm=T) == max(res$Carbon, na.rm=T)) {
          min(res$Carbon, na.rm=T)
        } else {
          seq(min(res$Carbon, na.rm=T), max(res$Carbon, na.rm=T), by = 2)
        }
        scale_y_breaks <- if (min(res$DB, na.rm=T) == max(res$DB, na.rm=T)) {
          min(res$DB, na.rm=T)
        } else {
          seq(min(res$DB, na.rm=T), max(res$DB, na.rm=T), by = 1)
        }
        
        p <- ggplot(res, aes(x = Carbon, y = DB, fill = Mean_LFC)) +
          geom_tile(color = grid_border, size = 0.3) +
          geom_text(aes(label = Label), color = "black", size = final_label_size, fontface = lbl_fontface, vjust = 0.5, hjust = 0.5) +
          scale_fill_gradient2(low = low_val, mid = mid_val, high = high_val, midpoint = 0, name = "Mean Log2FC") +
          scale_x_continuous(breaks = scale_x_breaks) +
          scale_y_continuous(breaks = scale_y_breaks) +
          theme_minimal(base_size = input$textSize) +
          theme(
            panel.grid.major = element_blank(),
            panel.grid.minor = element_blank(),
            axis.text = element_text(color = "black", face = "bold")
          ) +
          labs(
            x = "Carbon Length",
            y = "Double Bond Count",
            title = paste("Heatmap Grid:", format_class_name(input$lipid_class)),
            subtitle = paste("Position:", toupper(input$position), "| Mean Log2FC per Cell")
          )
        
        w <- session$clientData[[paste0("output_", session$ns("heatmapPlot"), "_width")]]
        h <- session$clientData[[paste0("output_", session$ns("heatmapPlot"), "_height")]]
        if (!is.null(input$heatmapPlot_size)) {
          w <- input$heatmapPlot_size$width
          h <- input$heatmapPlot_size$height
        }
        w_in <- if (!is.null(w) && w > 10) w / 72 else 11.1
        h_in <- if (!is.null(h) && h > 10) h / 72 else 8.33
        ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
      },
      contentType = "application/pdf"
    )
    
    output$downloadDotplotPDF <- downloadHandler(
      filename = function() {
        paste0("DotplotGrid_", gsub("\\s", "_", input$lipid_class), "_", format(Sys.time(), "%Y%m%d_%H%M"), ".pdf")
      },
      content = function(file) {
        res <- gridResults()
        req(res)
        
        n_cols <- length(unique(res$Carbon))
        n_rows <- length(unique(res$DB))
        lbl_type <- input$label_type %||% "stars"
        base_label_size <- if (lbl_type == "stars") {
          input$gridStarsSize %||% 10.0
        } else {
          input$gridPvalSize %||% 3.5
        }
        scale_factor <- 1
        if (n_cols > 10) scale_factor <- scale_factor * (10 / n_cols)
        if (n_rows > 8) scale_factor <- scale_factor * (8 / n_rows)
        if (isTRUE(input$label_type == "pvalue")) scale_factor <- scale_factor * 0.85
        final_label_size <- max(base_label_size * scale_factor, 1.8)
        lbl_fontface <- if (isTRUE(input$boldLabels)) "bold" else "plain"
        
        low_val <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#2166AC"
        mid_val <- if (isTRUE(input$customScaleColors) && !is.null(input$midColor)) input$midColor else "#F7F7F7"
        high_val <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#B2182B"
        
        scale_x_breaks <- if (min(res$Carbon, na.rm=T) == max(res$Carbon, na.rm=T)) {
          min(res$Carbon, na.rm=T)
        } else {
          seq(min(res$Carbon, na.rm=T), max(res$Carbon, na.rm=T), by = 2)
        }
        scale_y_breaks <- if (min(res$DB, na.rm=T) == max(res$DB, na.rm=T)) {
          min(res$DB, na.rm=T)
        } else {
          seq(min(res$DB, na.rm=T), max(res$DB, na.rm=T), by = 1)
        }
        
        p <- ggplot(res, aes(x = Carbon, y = DB)) +
          geom_point(aes(fill = Mean_LFC, size = abs(Mean_LFC)), shape = 21, color = "black", stroke = 0.5) +
          geom_text(aes(label = Label), color = "black", size = final_label_size, fontface = lbl_fontface, vjust = 0.5, hjust = 0.5) +
          scale_fill_gradient2(low = low_val, mid = mid_val, high = high_val, midpoint = 0, name = "Mean Log2FC") +
          scale_x_continuous(breaks = scale_x_breaks) +
          scale_y_continuous(breaks = scale_y_breaks) +
          scale_size_continuous(range = c(input$pointSize, input$pointSize * 2.2), name = "abs(LFC)") +
          theme_minimal(base_size = input$textSize) +
          theme(
            panel.grid.major = element_line(color = "grey90", size = 0.2),
            panel.grid.minor = element_blank(),
            axis.text = element_text(color = "black", face = "bold")
          ) +
          labs(
            x = "Carbon Length",
            y = "Double Bond Count",
            title = paste("Dotplot Grid:", format_class_name(input$lipid_class)),
            subtitle = paste("Position:", toupper(input$position), "| Size = abs(Mean LFC)")
          )
        
        w <- session$clientData[[paste0("output_", session$ns("dotplotPlot"), "_width")]]
        h <- session$clientData[[paste0("output_", session$ns("dotplotPlot"), "_height")]]
        if (!is.null(input$dotplotPlot_size)) {
          w <- input$dotplotPlot_size$width
          h <- input$dotplotPlot_size$height
        }
        w_in <- if (!is.null(w) && w > 10) w / 72 else 11.1
        h_in <- if (!is.null(h) && h > 10) h / 72 else 8.33
        ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
      },
      contentType = "application/pdf"
    )
    
    output$downloadHeatmapCSV <- downloadHandler(
      filename = function() {
        paste0("GridData_", gsub("\\s", "_", input$lipid_class), "_", format(Sys.time(), "%Y%m%d_%H%M"), ".csv")
      },
      content = function(file) {
        res <- gridResults()
        req(res)
        
        export_df <- res %>%
          dplyr::select(Carbon, DB, Mean_LFC, Active_P, Grid_Label = Label, Stars, n_lipids, Lipid_List)
        
        write.csv(export_df, file, row.names = FALSE)
      },
      contentType = "text/csv"
    )
    
    output$downloadDotplotCSV <- downloadHandler(
      filename = function() {
        paste0("GridData_", gsub("\\s", "_", input$lipid_class), "_", format(Sys.time(), "%Y%m%d_%H%M"), ".csv")
      },
      content = function(file) {
        res <- gridResults()
        req(res)
        
        export_df <- res %>%
          dplyr::select(Carbon, DB, Mean_LFC, Active_P, Grid_Label = Label, Stars, n_lipids, Lipid_List)
        
        write.csv(export_df, file, row.names = FALSE)
      },
      contentType = "text/csv"
    )
    
    # --- New Multi-Class Download Handlers ---
    
    output$downloadMergedCSV <- downloadHandler(
      filename = function() {
        paste0("MergedClassesGrid_", format(Sys.time(), "%Y%m%d_%H%M"), ".csv")
      },
      content = function(file) {
        res <- mergedClassesResults()
        req(res)
        
        export_df <- res %>%
          dplyr::select(Class_Var, Carbon, DB, Mean_LFC, n_lipids, Lipid_List)
        
        write.csv(export_df, file, row.names = FALSE)
      },
      contentType = "text/csv"
    )
    
    output$downloadMergedPDF <- downloadHandler(
      filename = function() {
        paste0("MergedClassesGrid_", format(Sys.time(), "%Y%m%d_%H%M"), ".pdf")
      },
      content = function(file) {
        res <- mergedClassesResults()
        req(res)
        
        use_hyper <- isTRUE(input$use_hyperclass)
        color_map <- if (use_hyper) HYPERCLASS_MAP_COLORS else CLASS_MAP_COLORS
        
        all_unique_classes <- unique(res$Class_Var)
        missing_classes <- setdiff(all_unique_classes, names(color_map))
        if (length(missing_classes) > 0) {
          fallback_colors <- setNames(rep("#B0B0B0", length(missing_classes)), missing_classes)
          color_map <- c(color_map, fallback_colors)
        }
        
        scale_x_breaks <- if (min(res$Carbon, na.rm=T) == max(res$Carbon, na.rm=T)) {
          min(res$Carbon, na.rm=T)
        } else {
          seq(min(res$Carbon, na.rm=T), max(res$Carbon, na.rm=T), by = 2)
        }
        scale_y_breaks <- if (min(res$DB, na.rm=T) == max(res$DB, na.rm=T)) {
          min(res$DB, na.rm=T)
        } else {
          seq(min(res$DB, na.rm=T), max(res$DB, na.rm=T), by = 1)
        }
        
        p <- ggplot(res, aes(x = Carbon, y = DB, color = Class_Var, fill = Class_Var)) +
          geom_point(position = position_jitter(width = 0.18, height = 0.18), size = input$pointSize %||% 6, alpha = 0.85) +
          scale_color_manual(values = color_map, labels = format_class_name, name = "Lipid Class") +
          scale_fill_manual(values = color_map, labels = format_class_name, name = "Lipid Class") +
          scale_x_continuous(breaks = scale_x_breaks) +
          scale_y_continuous(breaks = scale_y_breaks) +
          theme_minimal(base_size = input$textSize) +
          theme(
            panel.grid.major = element_line(color = "grey90", size = 0.2),
            panel.grid.minor = element_blank(),
            axis.text = element_text(color = "black", face = "bold")
          ) +
          labs(
            x = "Carbon Length",
            y = "Double Bond Count",
            title = "Merged Classes Grid",
            subtitle = paste("Position:", toupper(input$position), "| Colored by Class")
          )
        
        w <- session$clientData[[paste0("output_", session$ns("mergedPlot"), "_width")]]
        h <- session$clientData[[paste0("output_", session$ns("mergedPlot"), "_height")]]
        if (!is.null(input$mergedPlot_size)) {
          w <- input$mergedPlot_size$width
          h <- input$mergedPlot_size$height
        }
        w_in <- if (!is.null(w) && w > 10) w / 72 else 11.1
        h_in <- if (!is.null(h) && h > 10) h / 72 else 8.33
        
        ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
      },
      contentType = "application/pdf"
    )
    
    output$downloadDiffAllCSV <- downloadHandler(
      filename = function() {
        paste0("FilteredAllClassesGrid_", format(Sys.time(), "%Y%m%d_%H%M"), ".csv")
      },
      content = function(file) {
        res <- filteredAllClassesResults()
        req(res)
        
        export_df <- res %>%
          dplyr::select(Class_Var, Carbon, DB, Cell_Mean_LFC, Carbon_LFC, DB_LFC, Active_P, Label, n_lipids, Lipid_List)
        
        write.csv(export_df, file, row.names = FALSE)
      },
      contentType = "text/csv"
    )
    
    output$downloadDiffAllPDF <- downloadHandler(
      filename = function() {
        paste0("FilteredAllClassesGrid_", format(Sys.time(), "%Y%m%d_%H%M"), ".pdf")
      },
      content = function(file) {
        res <- filteredAllClassesResults()
        req(res)
        
        use_hyper <- isTRUE(input$use_hyperclass)
        color_map <- if (use_hyper) HYPERCLASS_MAP_COLORS else CLASS_MAP_COLORS
        
        all_unique_classes <- unique(res$Class_Var)
        missing_classes <- setdiff(all_unique_classes, names(color_map))
        if (length(missing_classes) > 0) {
          fallback_colors <- setNames(rep("#B0B0B0", length(missing_classes)), missing_classes)
          color_map <- c(color_map, fallback_colors)
        }
        
        size_var <- input$all_size_map %||% "carbon_lfc"
        color_var <- input$all_color_map %||% "db_lfc"
        alpha_var <- input$all_alpha_map %||% "db_lfc"
        
        if (size_var == "carbon_lfc") {
          res$Size_Val <- abs(res$Carbon_LFC)
        } else {
          res$Size_Val <- abs(res$DB_LFC)
        }
        
        if (color_var == "carbon_lfc") {
          res$Color_Val <- res$Carbon_LFC
        } else {
          res$Color_Val <- res$DB_LFC
        }
        
        res$Size_Val[is.na(res$Size_Val)] <- 0
        res$Color_Val[is.na(res$Color_Val)] <- 0
        
        if (alpha_var == "carbon_lfc") {
          res$Alpha_Val <- abs(res$Carbon_LFC)
        } else if (alpha_var == "db_lfc") {
          res$Alpha_Val <- abs(res$DB_LFC)
        } else {
          res$Alpha_Val <- 0.9 # constant value
        }
        res$Alpha_Val[is.na(res$Alpha_Val)] <- 0
        
        low_val <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#2166AC"
        mid_val <- if (isTRUE(input$customScaleColors) && !is.null(input$midColor)) input$midColor else "#F7F7F7"
        high_val <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#B2182B"
        
        scale_x_breaks <- if (min(res$Carbon, na.rm=T) == max(res$Carbon, na.rm=T)) {
          min(res$Carbon, na.rm=T)
        } else {
          seq(min(res$Carbon, na.rm=T), max(res$Carbon, na.rm=T), by = 2)
        }
        scale_y_breaks <- if (min(res$DB, na.rm=T) == max(res$DB, na.rm=T)) {
          min(res$DB, na.rm=T)
        } else {
          seq(min(res$DB, na.rm=T), max(res$DB, na.rm=T), by = 1)
        }
        
        # Determine dynamic label size and fontface
        lbl_type <- input$label_type %||% "stars"
        base_label_size <- if (lbl_type == "stars") {
          input$gridStarsSize %||% 10.0
        } else {
          input$gridPvalSize %||% 3.5
        }
        
        n_cols <- length(unique(res$Carbon))
        n_rows <- length(unique(res$DB))
        scale_factor <- 1
        if (n_cols > 10) scale_factor <- scale_factor * (10 / n_cols)
        if (n_rows > 8) scale_factor <- scale_factor * (8 / n_rows)
        if (isTRUE(input$label_type == "pvalue")) scale_factor <- scale_factor * 0.85
        final_label_size <- max(base_label_size * scale_factor, 1.8)
        lbl_fontface <- if (isTRUE(input$boldLabels)) "bold" else "plain"
        
        # Use constant seed so dot and text label are jittered together perfectly
        jitter_pos <- position_jitter(width = 0.18, height = 0.18, seed = 42)
        
        p <- ggplot(res, aes(x = Carbon, y = DB))
        
        if (alpha_var == "constant") {
          p <- p + geom_point(
            aes(
              color = Class_Var,
              fill = Color_Val,
              size = Size_Val
            ),
            shape = 21,
            stroke = 1.5,
            alpha = 0.9,
            position = jitter_pos
          )
        } else {
          p <- p + geom_point(
            aes(
              color = Class_Var,
              fill = Color_Val,
              size = Size_Val,
              alpha = Alpha_Val
            ),
            shape = 21,
            stroke = 1.5,
            position = jitter_pos
          ) +
          scale_alpha_continuous(range = c(0.3, 1.0), name = "abs(LFC) Alpha")
        }
        
        p <- p +
          geom_text(
            aes(label = Label),
            color = "black",
            size = final_label_size,
            fontface = lbl_fontface,
            vjust = 0.5,
            hjust = 0.5,
            position = jitter_pos
          )
        
        p <- p +
          scale_color_manual(values = color_map, labels = format_class_name, name = "Class Contour") +
          scale_fill_gradient2(low = low_val, mid = mid_val, high = high_val, midpoint = 0, name = "Mapped L2FC") +
          scale_size_continuous(range = c(input$pointSize, input$pointSize * 2.5), name = "abs(LFC) Size") +
          scale_x_continuous(breaks = scale_x_breaks) +
          scale_y_continuous(breaks = scale_y_breaks) +
          theme_minimal(base_size = input$textSize) +
          theme(
            panel.grid.major = element_line(color = "grey90", size = 0.2),
            panel.grid.minor = element_blank(),
            axis.text = element_text(color = "black", face = "bold")
          ) +
          labs(
            x = "Carbon Length",
            y = "Double Bond Count",
            title = "Differential Expression of All Classes",
            subtitle = paste0(
              "Position: ", toupper(input$position),
              " | Size: ", ifelse(size_var == "carbon_lfc", "Carbon Length L2FC", "Double Bond L2FC"),
              " | Color: ", ifelse(color_var == "carbon_lfc", "Carbon Length L2FC", "Double Bond L2FC")
            )
          )
        
        w <- session$clientData[[paste0("output_", session$ns("diffAllPlot"), "_width")]]
        h <- session$clientData[[paste0("output_", session$ns("diffAllPlot"), "_height")]]
        if (!is.null(input$diffAllPlot_size)) {
          w <- input$diffAllPlot_size$width
          h <- input$diffAllPlot_size$height
        }
        w_in <- if (!is.null(w) && w > 10) w / 72 else 11.1
        h_in <- if (!is.null(h) && h > 10) h / 72 else 8.33
        
        ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
      },
      contentType = "application/pdf"
    )
    
    # --- 8. Show Statistics Details Redirect Observer ---
    
    observeEvent(input$show_stats_detail, {
      de_sett <- shared_data$de_settings()
      actual_method <- shared_data$actual_de_method()
      p_thresh <- de_sett$p_threshold %||% 0.05
      p_type <- de_sett$p_value_type %||% "raw"
      use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
      p_label <- if (use_adj) "FDR adjusted p-value" else "raw p-value"
      
      active_tab <- input$grid_tabs %||% "Single Class View"
      
      if (active_tab == "Single Class View") {
        res <- gridResults()
        total_tested <- if (!is.null(res)) nrow(res) else 0
        sig_tested <- if (!is.null(res)) sum(res$Stars != "") else 0
        
        log_text <- paste0(
          "### Structural Grid Statistical Report (Single Class View)\n\n",
          "**Class Selected**: ", input$lipid_class, " (Lipid Category: ", isTRUE(input$use_hyperclass), ")\n",
          "**Position Profile**: ", toupper(input$position), "\n",
          "**Local Log2FC Threshold (abs)**: ", input$gridLog2fcThresh, "\n",
          "**Global Significance Threshold**: ", p_thresh, " (", p_label, ")\n",
          "**Statistical Hypothesis Test**: ", actual_method, "\n",
          "**Total Grid Intersections Evaluated**: ", total_tested, "\n",
          "**Significant Intersections**: ", sig_tested, "\n\n",
          "**Mathematical Formula (Mean Log2FC)**:\n",
          "For each grid cell $(C_k, DB_m)$, the average log2 fold change of constituent lipids is:\n",
          "$$\\text{Mean Log2FC}_{(k,m)} = \\frac{1}{S} \\sum_{s=1}^{S} \\text{log2FC}_s$$\n",
          "Where $S$ represents the total species mapped to the cell intersection.\n"
        )
      } else {
        res_all <- tryCatch(filteredAllClassesResults(), error = function(e) NULL)
        total_all <- if (!is.null(res_all)) nrow(res_all) else 0
        
        log_text <- paste0(
          "### Structural Grid Statistical Report (All Classes View)\n\n",
          "**Position Profile**: ", toupper(input$position), "\n",
          "**Local Log2FC Threshold (abs)**: ", input$gridLog2fcThresh, "\n",
          "**Total Class-Coordinate Intersections**: ", total_all, "\n",
          "**Size Mapping**: ", input$all_size_map, "\n",
          "**Color Mapping**: ", input$all_color_map, "\n",
          "**Alpha Mapping**: ", input$all_alpha_map, "\n\n",
          "**Mathematical Aggregation (Carbon Length and Double Bond L2FC)**:\n",
          "- For each main class, `Carbon_LFC` represents the average Log2FC of all lipids with carbon length $C$.\n",
          "- For each main class, `DB_LFC` represents the average Log2FC of all lipids with double bond count $DB$.\n"
        )
      }
      
      log_text <- paste0(log_text, "\n==================================================\n")
      log_text <- paste0(log_text, "\n", get_stats_console_method_summary(shared_data))
      
      shared_data$stats_detail_text(log_text)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Structural Grids")
    })
    
  })
}
