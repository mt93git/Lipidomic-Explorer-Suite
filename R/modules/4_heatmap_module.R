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
           open = c("0. Sample Grouping & Nomenclature", "2. Heatmap Settings"), multiple = TRUE,
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
           accordion_panel("1. Column Annotation", icon = icon("pen-to-square"),
               checkboxInput(ns("activateCellAnnotation"), tags$span("Activate Column Annotation", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Adds color-coded bands at the top of the heatmap to show the Group 1, Group 2, and time point groups for each sample.")), FALSE),
               conditionalPanel("input.activateCellAnnotation == true", ns = ns,
                 p("Define a cell type/name and color for each sample group.", class="text-muted small"),
                 uiOutput(ns("cellAnnotationUI"))
               )
            ),
            accordion_panel("2. Heatmap Settings", icon = icon("sliders"),
              radioButtons(ns("staircaseGroup"), "Row Grouping & Annotation:", 
                           choices = c("Lipid Main Class" = "subclass", "Lipid Category" = "hyperclass"), 
                           selected = "subclass"),
              checkboxInput(ns("condenseRows"), tags$span("Condense Rows (Class Average)", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Averages individual lipid species into their parent lipid classes to reflect class trends.")), FALSE),
              checkboxInput(ns("condenseRowsSD"), tags$span("Condense Rows (Class Standard Deviation)", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Calculates the standard deviation of constituent lipid species within each parent lipid class to reflect intra-class variability across samples.")), FALSE),
              tags$div(
                style = "margin-left: 15px; margin-top: -4px; margin-bottom: 6px;",
                checkboxInput(ns("showHeatmapNumbers_sd_clone"), tags$span("Show Numbers", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Displays numerical values directly inside each matrix cell of the heatmap.")), FALSE)
              ),
              conditionalPanel(
                condition = "input.condenseRows == true || input.condenseRowsSD == true",
                ns = ns,
                actionButton(ns("show_condensed_formulas"), "Show Condensed Class Formulas in the Statistics Tab", 
                             icon = icon("circle-info"), class = "btn-secondary w-100 mt-2")
              ),
              hr(),
              uiOutput(ns("heatmapDisplayColumnSelectorUI")),
              hr(),
              radioButtons(ns("heatmapScaleMode"), tags$span("Scaling:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Standardizes values across rows or columns. Row scaling displays relative enrichment trends across samples for each lipid.")),
                           choiceNames = list(
                             tags$span("Global Z", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Standardizes each lipid species using Z-score calculation across all samples globally. Highlights relative increase (+Z) or decrease (-Z) around the mean (0).")),
                             tags$span("Pattern Z", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Calculates Z-scores across log-transformed values, then scales them to a 0-100 range to highlight pattern shape differences.")),
                             tags$span("Relative", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Scales raw abundance values for each lipid species to a 0-100 range based on minimum and maximum row values."))
                           ),
                           choiceValues = c("global_zscore", "pattern_zscore", "relative"),
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
              colourInput(ns("heatmapGridColor"), "Grid Color", "black"),
              checkboxInput(ns("hideHeatmapRowNames"), "Hide Row Names", FALSE),
              checkboxInput(ns("showHeatmapGrid"), "Show Grid", FALSE)
            ),
            accordion_panel("3. Check Output in Violin View", icon = icon("chart-line"),
              p("Select specific lipids, lipid classes, or structural subsets to compare their distribution across sample groups in Violin View.", class = "text-muted small mb-2"),
              
              tags$div(
                class = "alert alert-warning py-2 px-3 small my-2", style = "font-size: 0.8rem; line-height: 1.3;",
                icon("triangle-exclamation", class = "me-1 text-warning"),
                tags$strong("Performance Note: "),
                "Plotting a large number of lipids (>20 species) may increase loading time. Select specific target species or structural subsets for optimal responsiveness."
              ),
              
              radioButtons(ns("violin_selection_scope"), tags$span("Lipid Selection Scope:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Choose whether Violin View targets active lipids currently displayed on the Heatmap, custom structural/class selections, or statistically significant lipids from Menu 3 DE.")), 
                           choices = c("Current Heatmap View (Active Lipids)" = "current_view", 
                                       "Custom Class / Structural Selection" = "custom",
                                       "Differential Expression Filtered Lipids (Menu 3 DE)" = "de_filtered"), 
                           selected = "current_view"),
              
              conditionalPanel(
                condition = "input.violin_selection_scope == 'custom'", ns = ns,
                tags$div(
                  class = "d-flex justify-content-between align-items-center mb-1 mt-2",
                  tags$strong("Filter by Lipid Class:", style = "font-size: 0.85rem; color: #495057;"),
                  tags$div(
                    actionButton(ns("btn_all_violin_class"), "All", class = "btn btn-link btn-xs p-0 me-2 text-decoration-none fw-bold", style="font-size:0.8rem;"),
                    actionButton(ns("btn_none_violin_class"), "None", class = "btn btn-link btn-xs p-0 text-decoration-none text-muted", style="font-size:0.8rem;")
                  )
                ),
                selectizeInput(ns("heatmap_violin_class_select"), label = NULL, 
                               choices = NULL, multiple = TRUE, 
                               options = list(placeholder = "Select lipid classes...", plugins = list('remove_button'))),
                
                tags$div(
                  class = "mb-2",
                  tags$strong("Saturation Filters:", style = "font-size: 0.8rem; color: #495057; display: block; margin-bottom: 4px;"),
                  actionButton(ns("select_sfa_btn"), "SFA (0 DB)", class = "btn-sm btn-outline-success py-0 px-2 me-1 mb-1"),
                  actionButton(ns("select_mufa_btn"), "MUFA (1 DB)", class = "btn-sm btn-outline-warning py-0 px-2 me-1 mb-1"),
                  actionButton(ns("select_pufa_btn"), "PUFA (≥2 DB)", class = "btn-sm btn-outline-primary py-0 px-2 me-1 mb-1", icon = icon("dna")),
                  
                  tags$strong("Chain Length Filters:", style = "font-size: 0.8rem; color: #495057; display: block; margin-top: 6px; margin-bottom: 4px;"),
                  actionButton(ns("select_scfa_btn"), "SCFA (≤C5)", class = "btn-sm btn-outline-info py-0 px-2 me-1 mb-1"),
                  actionButton(ns("select_mcfa_btn"), "MCFA (C6-C12)", class = "btn-sm btn-outline-info py-0 px-2 me-1 mb-1"),
                  actionButton(ns("select_lcfa_btn"), "LCFA (>C12)", class = "btn-sm btn-outline-info py-0 px-2 me-1 mb-1"),
                  tags$div(class = "mt-1",
                    actionButton(ns("clear_violin_sel_btn"), "None", class = "btn-sm btn-outline-secondary py-0 px-2 mb-1")
                  )
                ),
                
                selectizeInput(ns("select_sn_chains"), "Filter by sn-1 / sn-2 Chain:", 
                               choices = NULL, multiple = TRUE, 
                               options = list(placeholder = "e.g., 18:1, 20:4", plugins = list('remove_button')))
              ),
              
              uiOutput(ns("violin_selection_summary_badge")),
              
              checkboxInput(ns("toggle_individual_species"), "Refine Individual Species List", FALSE),
              conditionalPanel(
                condition = "input.toggle_individual_species == true", ns = ns,
                selectizeInput(ns("heatmap_violin_lipids_select"), label = NULL, 
                               choices = NULL, multiple = TRUE, 
                               options = list(placeholder = "Choose target lipids...", plugins = list('remove_button')))
              ),
              
              actionButton(ns("btn_goto_violin"), "Plot Selected Lipids in Violin View", 
                           icon = icon("chart-line"), class = "btn-plot-violin w-100 my-2"),
              
              hr(class = "my-2"),
              radioButtons(ns("violin_sample_mode"), "Violin Representation Mode:",
                           choices = c("Group Distributions: Sample Conditions (Default)" = "group_distribution",
                                       "Condition Facets: Single Lipids on X-Axis (Class Grouped)" = "condition_facets_species_x",
                                       "Species Facets: Sample Conditions on X-Axis" = "species_panels_condition_x",
                                       "Class Facets: Sample Conditions on X-Axis (Class Merged)" = "class_distribution"),
                           selected = "group_distribution"),
              tags$p(class = "text-muted small mb-2", style = "font-size: 0.78rem;",
                     "Note: All individual sample replicates (M1-M6) are merged into group violins with individual replicate dots overlaid. Group merging can also be configured under Panel 2 in the sidebar."),
              
              selectInput(ns("violin_baseline_group"), tags$span("Baseline Reference Group (Independent from Menu 3):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Select reference baseline group for pairwise Welch's t-test significance calculations in Violin View.")),
                          choices = NULL, selected = NULL),
              
              checkboxInput(ns("show_violin_sig"), tags$span("Show Significance Bars & Stars (*, **, ***)", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Displays pairwise significance brackets and symbols comparing non-baseline conditions against the reference group.")), TRUE),
              conditionalPanel(
                condition = "input.show_violin_sig == true", ns = ns,
                radioButtons(ns("violin_sig_display_type"), "Significance Label Format:",
                             choices = c("Significance Stars (*, **, ***)" = "star", "Numeric p-values" = "pvalue"),
                             selected = "star"),
                numericInput(ns("violin_sig_threshold"), tags$span("Significance Alpha Threshold (p-value):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Cutoff p-value for significance bracket annotation (default = 0.05).")),
                             value = 0.05, min = 0.0001, max = 0.5, step = 0.01)
              )
            )
          ),
          actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                       icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3"),
          tags$button(type = "button", class = "btn btn-outline-primary btn-sm w-100 mt-2",
                      onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
                      icon("layer-group"), " Bottom Menu: Advanced Aesthetics")
       ),
        jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
          render_tab_intro_card(
            title = "Heatmap",
            subtitle = "This module provides interactive clustering and visualization of lipid abundance profiles across groups or individual replicates:",
            bullets = list(
              tags$li(tags$strong("Unfiltered Heatmap:"), " Visualize Z-score row normalized global lipid profiles and clustering patterns across all measured species."),
              tags$li(tags$strong("Filtered Heatmap:"), " Focus hierarchical clustering exclusively on statistically significant differentially abundant lipids (following the set thresholds on the Differential Expression menu and through comparisons of interest) to identify clear lipidomic signatures."),
              tags$li(tags$strong("Violin View:"), " Evaluate statistical significance, abundance variation, and group distributions for selected target species or structural subsets across sample conditions.")
            ),
            collapse_id = ns("intro_collapse")
          ),
          div(class = "heatmap-card-tabs hide-redundant-nav-tabs",
            navset_card_tab(
               id = ns("heatmap_tabs"),
               nav_panel("Unfiltered Heatmap",
                  uiOutput(ns("unfiltered_heatmap_container"))
                ),
                nav_panel("Filtered Heatmap",
                   uiOutput(ns("filtered_heatmap_container"))
                ),
                nav_panel("Violin View", icon = icon("scale-unbalanced"),
                   uiOutput(ns("violin_view_container"))
                )
             )
          )
        ), options = list(handles = "s, se")),
       accordion(
         id = ns("heatmap_advanced_aesthetics_accordion"),
         open = FALSE,
         class = "mt-3 shadow-sm border border-primary-subtle",
         accordion_panel("Advanced Aesthetics & Ordering", icon = icon("layer-group"),
           uiOutput(ns("dragDropOrderingUI"))
         )
       )
    )
  )
}

# --- Module Server ---

heatmap_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    
  # --- 0. Persistence State & Dynamic UI ---
    rv_cols <- reactiveValues(hidden = character(0))
    rv_anno <- reactiveValues(names = list(), colors = list())
    rv_ordering <- reactiveValues(hierarchy = NULL, groups = list(), custom_row = NULL, customize_row_enabled = FALSE)
    plot_dims <- reactiveValues(
      unfiltered = list(width = 800, height = 600),
      unfiltered_sd = list(width = 800, height = 600),
      filtered = list(width = 800, height = 600),
      filtered_sd = list(width = 800, height = 600)
    )
    
    observeEvent(input$heatmapPlot_size, { plot_dims$unfiltered <- input$heatmapPlot_size })
    observeEvent(input$heatmapSDPlot_size, { plot_dims$unfiltered_sd <- input$heatmapSDPlot_size })
    observeEvent(input$filteredHeatmapPlot_size, { plot_dims$filtered <- input$filteredHeatmapPlot_size })
    observeEvent(input$filteredHeatmapSDPlot_size, { plot_dims$filtered_sd <- input$filteredHeatmapSDPlot_size })
    
    # Observer to persist Cell Annotation values
    observe({
      df <- shared_data$data_processed()
      req(df)
      meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% colnames(df))
      
      meta_groups <- if("Group1" %in% names(meta) && "Group2" %in% names(meta)) {
         paste(meta$Group1, meta$Group2, sep="_")
      } else if ("Group1" %in% names(meta)) {
         meta$Group1
      } else {
         "All"
      }
      unique_groups <- sort(unique(meta_groups))
      
      for (g_name in unique_groups) {
        safe_id <- gsub("[^A-Za-z0-9_]", "", g_name)
        
        name_input <- input[[paste0("cell_name_", safe_id)]]
        color_input <- input[[paste0("cell_color_", safe_id)]]
        
        if (!is.null(name_input)) {
          rv_anno$names[[g_name]] <- name_input
        }
        if (!is.null(color_input)) {
          rv_anno$colors[[g_name]] <- color_input
        }
      }
    })
    
    # Observer to persist Naming Hierarchy and Ordering selections
    observe({
       if (!is.null(input$hierarchy_order)) {
          rv_ordering$hierarchy <- input$hierarchy_order
       }
       if (!is.null(input$customizeRowOrder)) {
          rv_ordering$customize_row_enabled <- input$customizeRowOrder
       }
       if (!is.null(input$custom_row_order)) {
          rv_ordering$custom_row <- input$custom_row_order
       }
       
       # Handle group-specific ordering persistence
       df <- shared_data$data_processed()
       if (!is.null(df)) {
          meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% colnames(df))
          available_cols <- intersect(names(meta), c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint"))
          if (grepl("aggregate", input$repMode %||% "aggregate_class")) available_cols <- setdiff(available_cols, c("Replicate", "PatientNumber"))
          
          for (h_col in available_cols) {
             val_order <- input[[paste0("order_", h_col)]]
             if (!is.null(val_order)) {
                rv_ordering$groups[[h_col]] <- val_order
             }
          }
       }
    })
    
    observeEvent(shared_data$analysisMode(), {
       mode <- shared_data$analysisMode()
       if(is.null(mode)) return()
       
        updateRadioButtons(session, "staircaseGroup", 
                           label = "Row Grouping & Annotation:",
                           choices = c("Lipid Main Class" = "subclass", "Lipid Category" = "hyperclass"),
                           selected = input$staircaseGroup %||% "subclass")
    })
    
    # Auto-toggle Show Numbers when Condense Rows (Class Standard Deviation) is toggled
    observeEvent(input$condenseRowsSD, {
       if (isTRUE(input$condenseRowsSD)) {
          updateCheckboxInput(session, "showHeatmapNumbers_sd_clone", value = TRUE)
          updateCheckboxInput(session, "showHeatmapNumbers", value = TRUE)
       } else {
          if (isTRUE(input$showHeatmapNumbers) || isTRUE(input$showHeatmapNumbers_sd_clone)) {
             updateCheckboxInput(session, "showHeatmapNumbers_sd_clone", value = FALSE)
             updateCheckboxInput(session, "showHeatmapNumbers", value = FALSE)
          }
       }
    }, ignoreInit = TRUE)

    # Observer to synchronize "Show Numbers" checkboxes bi-directionally
    observeEvent(input$showHeatmapNumbers, {
       val <- input$showHeatmapNumbers
       if (!is.null(val) && !identical(val, input$showHeatmapNumbers_sd_clone)) {
          updateCheckboxInput(session, "showHeatmapNumbers_sd_clone", value = val)
       }
    }, ignoreInit = TRUE)
    
    observeEvent(input$showHeatmapNumbers_sd_clone, {
       val <- input$showHeatmapNumbers_sd_clone
       if (!is.null(val) && !identical(val, input$showHeatmapNumbers)) {
          updateCheckboxInput(session, "showHeatmapNumbers", value = val)
       }
    }, ignoreInit = TRUE)
     
     # Fallback reactive states when targeted lipid selection has insufficient features for heatmaps
     heatmap_fallback_active <- reactiveVal(FALSE)
     filtered_heatmap_fallback_active <- reactiveVal(FALSE)
      
    # --- Panel 3: Inspect Lipids in Violin View Server Logic ---
    get_filtered_annotation <- function() {
       lipids <- shared_data$global_filtered_lipids()
       anno <- shared_data$annotationData()
       if (is.null(lipids) || is.null(anno)) return(NULL)
       anno %>% dplyr::filter(Lipid_Name %in% lipids)
    }

    # Explicit Reactive Val to store targeted lipids when clicking "Plot Selected Lipids in Violin View"
    active_violin_target_lipids <- reactiveVal(character(0))

    # Update dropdown choices for Panel 3
    observe({
       req(tryCatch(shared_data$data_processed(), error = function(e) NULL))
       lipids <- shared_data$global_filtered_lipids()
       req(lipids)
       
       # Update choices for lipid species selectize input
       updateSelectizeInput(session, "heatmap_violin_lipids_select", choices = sort(lipids), server = TRUE)
       
       # Populate lipid class choices
       sub_anno <- get_filtered_annotation()
       if (!is.null(sub_anno) && "subclass" %in% names(sub_anno)) {
          class_choices <- sort(unique(sub_anno$subclass))
          updateSelectizeInput(session, "heatmap_violin_class_select", choices = class_choices, server = TRUE)
       }
       
       # Parse sn-1/sn-2 chains from detected lipid names (e.g. 18:1, 20:4, 16:0, etc.)
       chain_matches <- unique(unlist(regmatches(lipids, gregexpr("\\b\\d+:\\d+\\b", lipids))))
       if (length(chain_matches) > 0) {
          updateSelectizeInput(session, "select_sn_chains", choices = sort(chain_matches), server = TRUE)
       }
       
       # Populate baseline reference groups for Violin View (unsynced from Menu 3)
       meta <- shared_data$all_metadata()
       if (!is.null(meta)) {
          grp_col <- if ("Group1" %in% names(meta) && length(unique(meta$Group1)) > 1) "Group1" else if ("Group" %in% names(meta)) "Group" else names(meta)[1]
          available_groups <- unique(as.character(meta[[grp_col]]))
          available_groups <- available_groups[!is.na(available_groups) & available_groups != ""]
          if (length(available_groups) > 0) {
             updateSelectInput(session, "violin_baseline_group", choices = available_groups, selected = available_groups[1])
             updateSelectInput(session, "violin_baseline_group_header", choices = available_groups, selected = available_groups[1])
          }
       }
    })

    # Synchronize Baseline Reference Group Pickers (Sidebar & Header)
    observeEvent(input$violin_baseline_group, {
       val <- input$violin_baseline_group
       if (!is.null(val) && !identical(val, input$violin_baseline_group_header)) {
          updateSelectInput(session, "violin_baseline_group_header", selected = val)
       }
    }, ignoreInit = TRUE)

    observeEvent(input$violin_baseline_group_header, {
       val <- input$violin_baseline_group_header
       if (!is.null(val) && !identical(val, input$violin_baseline_group)) {
          updateSelectInput(session, "violin_baseline_group", selected = val)
       }
    }, ignoreInit = TRUE)

    # Select All Lipid Classes
    observeEvent(input$btn_all_violin_class, {
       sub_anno <- get_filtered_annotation()
       req(sub_anno)
       if ("subclass" %in% names(sub_anno)) {
          class_choices <- sort(unique(sub_anno$subclass))
          updateSelectizeInput(session, "heatmap_violin_class_select", selected = class_choices)
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(sub_anno$Lipid_Name))
       }
    })

    # Select None Lipid Classes
    observeEvent(input$btn_none_violin_class, {
       updateSelectizeInput(session, "heatmap_violin_class_select", selected = character(0))
       updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = character(0))
       updateSelectizeInput(session, "select_sn_chains", selected = character(0))
    })

    # Helper to get class-filtered annotation for combinatory structural filtering
    get_class_filtered_annotation <- reactive({
       sub_anno <- get_filtered_annotation()
       req(sub_anno)
       sel_classes <- input$heatmap_violin_class_select
       if (!is.null(sel_classes) && length(sel_classes) > 0 && "subclass" %in% names(sub_anno)) {
          sub_anno <- sub_anno %>% dplyr::filter(subclass %in% sel_classes)
       }
       return(sub_anno)
    })

    # Observe Lipid Class Filter Changes
    observeEvent(input$heatmap_violin_class_select, {
       sel_classes <- input$heatmap_violin_class_select
       req(length(sel_classes) > 0)
       sub_anno <- get_filtered_annotation()
       req(sub_anno)
       
       filtered_lipids <- sub_anno %>% dplyr::filter(subclass %in% sel_classes) %>% dplyr::pull(Lipid_Name)
       if (length(filtered_lipids) > 0) {
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(filtered_lipids))
       }
    }, ignoreInit = TRUE)

    # Quick-Filter: SFA Species (0 Double Bonds)
    observeEvent(input$select_sfa_btn, {
       sub_anno <- get_class_filtered_annotation()
       req(sub_anno)
       sfa_lipids <- if ("Double_Bonds" %in% names(sub_anno)) {
          sub_anno %>% dplyr::filter(Double_Bonds == 0) %>% dplyr::pull(Lipid_Name)
       } else {
          grep(":0", sub_anno$Lipid_Name, value = TRUE)
       }
       if (length(sfa_lipids) > 0) {
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(sfa_lipids))
       } else {
          showNotification("No SFA species (0 DB) detected for current selection.", type = "warning")
       }
    })

    # Quick-Filter: MUFA Species (1 Double Bond)
    observeEvent(input$select_mufa_btn, {
       sub_anno <- get_class_filtered_annotation()
       req(sub_anno)
       mufa_lipids <- if ("Double_Bonds" %in% names(sub_anno)) {
          sub_anno %>% dplyr::filter(Double_Bonds == 1) %>% dplyr::pull(Lipid_Name)
       } else {
          grep(":1", sub_anno$Lipid_Name, value = TRUE)
       }
       if (length(mufa_lipids) > 0) {
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(mufa_lipids))
       } else {
          showNotification("No MUFA species (1 DB) detected for current selection.", type = "warning")
       }
    })

    # Quick-Filter: PUFA Species (Double Bonds >= 2)
    observeEvent(input$select_pufa_btn, {
       sub_anno <- get_class_filtered_annotation()
       req(sub_anno)
       pufa_lipids <- if ("Double_Bonds" %in% names(sub_anno)) {
          sub_anno %>% dplyr::filter(Double_Bonds >= 2) %>% dplyr::pull(Lipid_Name)
       } else {
          grep(":(2|3|4|5|6|7|8)", sub_anno$Lipid_Name, value = TRUE)
       }
       if (length(pufa_lipids) > 0) {
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(pufa_lipids))
       } else {
          showNotification("No PUFA species (≥2 DB) detected for current selection.", type = "warning")
       }
    })

    # Quick-Filter: SCFA (<= C5)
    observeEvent(input$select_scfa_btn, {
       sub_anno <- get_class_filtered_annotation()
       req(sub_anno)
       scfa_lipids <- if ("Total_Carbons" %in% names(sub_anno)) {
          sub_anno %>% dplyr::filter(Total_Carbons <= 5) %>% dplyr::pull(Lipid_Name)
       } else {
          character(0)
       }
       if (length(scfa_lipids) > 0) {
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(scfa_lipids))
       } else {
          showNotification("No SCFA species (≤C5) detected for current selection.", type = "warning")
       }
    })

    # Quick-Filter: MCFA (C6-C12)
    observeEvent(input$select_mcfa_btn, {
       sub_anno <- get_class_filtered_annotation()
       req(sub_anno)
       mcfa_lipids <- if ("Total_Carbons" %in% names(sub_anno)) {
          sub_anno %>% dplyr::filter(Total_Carbons >= 6 & Total_Carbons <= 12) %>% dplyr::pull(Lipid_Name)
       } else {
          character(0)
       }
       if (length(mcfa_lipids) > 0) {
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(mcfa_lipids))
       } else {
          showNotification("No MCFA species (C6-C12) detected for current selection.", type = "warning")
       }
    })

    # Quick-Filter: LCFA (>C12)
    observeEvent(input$select_lcfa_btn, {
       sub_anno <- get_class_filtered_annotation()
       req(sub_anno)
       lcfa_lipids <- if ("Total_Carbons" %in% names(sub_anno)) {
          sub_anno %>% dplyr::filter(Total_Carbons > 12) %>% dplyr::pull(Lipid_Name)
       } else {
          character(0)
       }
       if (length(lcfa_lipids) > 0) {
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(lcfa_lipids))
       } else {
          showNotification("No LCFA species (>C12) detected for current selection.", type = "warning")
       }
    })

    # None (Reset Violin Selection)
    observeEvent(input$clear_violin_sel_btn, {
       updateSelectizeInput(session, "heatmap_violin_class_select", selected = character(0))
       updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = character(0))
       updateSelectizeInput(session, "select_sn_chains", selected = character(0))
    })

    # Filter by sn-1/sn-2 chain selection
    observeEvent(input$select_sn_chains, {
       chains <- input$select_sn_chains
       req(length(chains) > 0)
       lipids <- shared_data$global_filtered_lipids()
       req(lipids)
       
       matched_lipids <- unique(unlist(lapply(chains, function(ch) {
          grep(paste0("\\b", ch, "\\b"), lipids, value = TRUE)
       })))
       
       if (length(matched_lipids) > 0) {
          updateSelectizeInput(session, "heatmap_violin_lipids_select", selected = sort(matched_lipids))
       }
    }, ignoreInit = TRUE)

    # Robust target lipid retriever
    get_active_violin_lipids <- reactive({
       scope <- input$violin_selection_scope %||% "current_view"
       all_global <- shared_data$global_filtered_lipids() %||% character(0)
       
       if (scope == "de_filtered") {
          sig_lipids <- tryCatch(shared_data$significant_lipids(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
          if (!is.null(sig_lipids) && length(sig_lipids) > 0) {
             return(intersect(sig_lipids, all_global))
          }
       } else if (scope == "custom") {
          custom_sel <- input$heatmap_violin_lipids_select
          if (!is.null(custom_sel) && length(custom_sel) > 0) {
             return(custom_sel)
          }
       } else {
          explicit_sel <- active_violin_target_lipids()
          if (length(explicit_sel) > 0) {
             return(intersect(explicit_sel, all_global))
          }
          
          tab_sel <- input$heatmap_tabs %||% "Unfiltered Heatmap"
          if (tab_sel == "Filtered Heatmap") {
             sig_lipids <- tryCatch(shared_data$significant_lipids(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
             if (!is.null(sig_lipids) && length(sig_lipids) > 0) {
                return(intersect(sig_lipids, all_global))
             }
          }
       }
       
       return(all_global)
    })

    # Render Concise Summary Badge in Sidebar
    output$violin_selection_summary_badge <- renderUI({
       lipids <- get_active_violin_lipids()
       n <- length(lipids)
       tags$div(
          class = "my-2 text-center",
          tags$span(class = if(n > 0) "badge badge-violin-selected px-3 py-2" else "badge badge-violin-empty px-3 py-2",
                    sprintf("%d Lipids Selected for Violin View", n))
       )
    })

    # Action Button: Open Violin View 3rd Subtab & Transfer Selected Lipids
    observeEvent(input$btn_goto_violin, {
       target_lipids <- get_active_violin_lipids()
       if (length(target_lipids) == 0) {
          target_lipids <- shared_data$global_filtered_lipids() %||% character(0)
       }
       if (length(target_lipids) == 0) {
          showNotification("No lipids currently selected for Violin View.", type = "warning")
          return()
       }
       
       # 1. Store targeted lipids explicitly
       active_violin_target_lipids(target_lipids)
       
       # 2. Update shared reactive bridge
       shared_data$selected_violin_lipids(target_lipids)
       
       # 3. Switch subtab directly to Violin View inside the Heatmap card container
       nav_select("heatmap_tabs", "Violin View")
       
       showNotification(paste("Viewing", length(target_lipids), "lipids in Violin View."), type = "message")
    })

    # --- 3rd Subtab: Violin View Rendering Logic ---
    output$violin_view_container <- renderUI({
       quick_access <- div(
          class = "quick-access-strip",
          tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToElement('#heatmap_barchart_tab-violin_baseline_group', 'plot_controls', '3. Check Output in Violin View', event);",
            title = "Set reference baseline cohort for pairwise significance calculations",
            icon("flag-checkered"), "Baseline Reference Cohort"
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToElement('#heatmap_barchart_tab-violin_selection_scope', 'plot_controls', '3. Check Output in Violin View', event);",
            title = "Change selection scope between active heatmap view, custom classes, or DE filtered",
            icon("list-check"), "Selection Scope (Heatmap / Custom / DE)"
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToElement('#heatmap_barchart_tab-show_violin_sig', 'plot_controls', '3. Check Output in Violin View', event);",
            title = "Toggle significance bars and star ratings (*, **, ***)",
            icon("star"), "Significance Brackets & Stars"
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
            title = "Bottom Menu: Re-order X-Axis sample groups, classes, or species via drag & drop below plot",
            icon("layer-group"), "Bottom Menu: Advanced Aesthetics"
          )
       )

       target_lipids <- get_active_violin_lipids()
       if (length(target_lipids) == 0) {
          target_lipids <- shared_data$global_filtered_lipids() %||% character(0)
       }
       if (length(target_lipids) == 0) {
          return(tagList(
             quick_access,
             card_body(
                div(class = "alert alert-info text-center my-4",
                    icon("info-circle", class = "me-2"),
                    "No lipids selected for Violin View yet. Select lipids or structural categories in Panel 3 of the sidebar and click 'Plot Selected Lipids in Violin View'.")
             )
          ))
       }
       
       meta <- shared_data$all_metadata()
       grp_col <- if (!is.null(meta) && "Group1" %in% names(meta)) "Group1" else if (!is.null(meta) && "Group" %in% names(meta)) "Group" else names(meta)[1]
       avail_grps <- if (!is.null(meta) && grp_col %in% names(meta)) unique(as.character(meta[[grp_col]])) else c("Control", "Group1")
       avail_grps <- avail_grps[!is.na(avail_grps) & avail_grps != ""]
       
       n_lipids <- length(target_lipids)
       n_rows <- ceiling(min(n_lipids, 60) / 3)
       calc_h <- max(400, n_rows * 260)
       default_h <- min(calc_h, 3000)
       cur_h <- isolate(input$violin_zoom_pct)
       if (is.null(cur_h) || cur_h == 0) cur_h <- default_h
       
       tagList(
          quick_access,
          card_body(
             div(class = "alert alert-warning py-2 px-3 small mb-3", style = "font-size: 0.82rem; line-height: 1.3;",
                 icon("triangle-exclamation", class = "me-1 text-warning"),
                 tags$strong("Performance Note: "),
                 "Plotting a large number of lipids (>20 species) or un-merged single replicates simultaneously may increase rendering time. Target specific species or structural subsets in Panel 3 for optimal responsiveness."
             ),
             div(class = "d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 bg-light p-2 rounded border",
                 div(class = "d-flex align-items-center gap-3 flex-wrap",
                     radioButtons(ns("violin_scale_mode"), "Measurement Scale:", 
                                  choices = c("Log2 Abundance" = "log2", "Linear Abundance" = "linear"), 
                                  selected = "log2", inline = TRUE),
                     selectInput(ns("violin_baseline_group_header"), "Baseline Reference (Violin View):", 
                                 choices = avail_grps, selected = avail_grps[1], width = "210px"),
                     sliderInput(ns("violin_zoom_pct"), "Plot Height (px):", min = 300, max = 5000, value = cur_h, step = 50, width = "200px")
                 ),
                 div(class = "d-flex gap-2",
                     downloadButton(ns("download_violin_pdf"), "Export PDF", class = "btn-sm btn-outline-secondary btn-download-pdf"),
                     downloadButton(ns("download_violin_csv"), "Export Data", class = "btn-sm btn-outline-secondary btn-download-csv")
                 )
             ),
             jqui_resizable(div(style = sprintf("min-height: %dpx;", input$violin_zoom_pct %||% cur_h),
                plotOutput(ns("violin_plot_render"), height = sprintf("%dpx", input$violin_zoom_pct %||% cur_h))
             )),
             tags$div(
                style = "font-size: 0.82rem; color: #495057; background-color: #f8f9fa; border-left: 3px solid #198754; padding: 8px 12px; margin-top: 10px; border-radius: 4px;",
                sprintf("Violin kernel densities represent the probability distribution and abundance variation of selected lipid species or class-merged aggregates across sample conditions (%s measurement scale). Embedded boxplots depict the median and interquartile range (IQR), overlaid with individual sample replicate dots. Pairwise significance brackets are calculated using two-sample Welch's t-test comparing each sample condition against the baseline reference group '%s' (α = %.2f). Significance levels: * p ≤ α, ** p ≤ α/5, *** p ≤ α/50. Click 'Show Statistic Detail' in the sidebar to inspect complete tabular metrics in the Statistics Console.", 
                        if (isTRUE(input$violin_scale_mode == "linear")) "Linear Abundance" else "Log2 Abundance",
                        input$violin_baseline_group_header %||% input$violin_baseline_group %||% avail_grps[1], 
                        as.numeric(input$violin_sig_threshold %||% 0.05))
             )
          )
       )
    })

    # Helper: Structural natural numerical sorting for lipid species names (Sn1_C -> Sn1_DB -> Sn2_C -> Sn2_DB)
    sort_lipids_structurally <- function(lipid_vec) {
       if (length(lipid_vec) == 0) return(character(0))
       
       parsed <- lapply(lipid_vec, function(lip) {
          chains <- unlist(regmatches(lip, gregexpr("\\d+:\\d+", lip)))
          if (length(chains) >= 2) {
             sn1_c  <- as.numeric(gsub(":.*", "", chains[1]))
             sn1_db <- as.numeric(gsub(".*:", "", chains[1]))
             sn2_c  <- as.numeric(gsub(":.*", "", chains[2]))
             sn2_db <- as.numeric(gsub(".*:", "", chains[2]))
             tot_c  <- sn1_c + sn2_c
             tot_db <- sn1_db + sn2_db
          } else if (length(chains) == 1) {
             tot_c  <- as.numeric(gsub(":.*", "", chains[1]))
             tot_db <- as.numeric(gsub(".*:", "", chains[1]))
             sn1_c  <- tot_c
             sn1_db <- tot_db
             sn2_c  <- 0
             sn2_db <- 0
          } else {
             tot_c <- 999; tot_db <- 999; sn1_c <- 999; sn1_db <- 999; sn2_c <- 999; sn2_db <- 999
          }
          cls <- gsub(" .*", "", lip)
          data.frame(Lipid_Name = lip, Class = cls, Sn1_C = sn1_c, Sn1_DB = sn1_db, Sn2_C = sn2_c, Sn2_DB = sn2_db, Total_C = tot_c, Total_DB = tot_db, stringsAsFactors = FALSE)
       })
       
       df_sort <- do.call(rbind, parsed)
       df_sort <- df_sort %>% dplyr::arrange(Class, Sn1_C, Sn1_DB, Sn2_C, Sn2_DB, Total_C, Total_DB, Lipid_Name)
       df_sort$Lipid_Name
    }

    # Build Violin Plot Object using robust metadata matching, DE significance mapping & plot_logratio_violin
    build_heatmap_violin_ggplot <- reactive({
       target_lipids <- get_active_violin_lipids()
       if (length(target_lipids) == 0) {
          target_lipids <- shared_data$global_filtered_lipids() %||% character(0)
       }
       req(length(target_lipids) > 0)
       
       df_norm <- shared_data$data_processed()
       meta <- shared_data$all_metadata()
       req(df_norm, meta)
       
       # Determine lipid species column in data_processed dataframe
       lipid_col <- if ("Lipid_Name" %in% names(df_norm)) {
          "Lipid_Name"
       } else if ("Feature" %in% names(df_norm)) {
          "Feature"
       } else if ("Name" %in% names(df_norm)) {
          "Name"
       } else {
          df_norm$Lipid_Name <- rownames(df_norm)
          "Lipid_Name"
       }
       
       # Extract numeric sample columns
       sample_cols <- setdiff(names(df_norm), c("Lipid_Name", "Feature", "Name", "lipid", "Class", "subclass", "hyperclass", "Category"))
       req(length(sample_cols) > 0)
       
       # Match sample column in metadata
       sample_col <- if ("FullName" %in% names(meta)) {
          "FullName"
       } else if ("Sample" %in% names(meta)) {
          "Sample"
       } else if ("SampleName" %in% names(meta)) {
          "SampleName"
       } else {
          names(meta)[1]
       }
       
       # Match group column in metadata
       group_col <- if ("Group1" %in% names(meta) && length(unique(meta$Group1)) > 1) {
          "Group1"
       } else if ("Group" %in% names(meta)) {
          "Group"
       } else if ("Condition" %in% names(meta)) {
          "Condition"
       } else {
          non_sample <- setdiff(names(meta), c(sample_col, "Replicate", "filename"))
          if (length(non_sample) > 0) non_sample[1] else names(meta)[1]
       }
       
       # Available target lipids present in dataset dataframe
       all_dataset_lipids <- df_norm[[lipid_col]]
       avail_lipids <- intersect(target_lipids, all_dataset_lipids)
       if (length(avail_lipids) == 0) {
          avail_lipids <- head(all_dataset_lipids, 12)
       }
       req(length(avail_lipids) > 0)
       
       # Limit to first 60 species for grid responsive rendering
       plot_lipids <- avail_lipids[1:min(length(avail_lipids), 60)]
       
       sub_df <- df_norm %>% dplyr::filter(!!rlang::sym(lipid_col) %in% plot_lipids)
       req(nrow(sub_df) > 0)
       
       # Convert numeric sample columns if linear scale is selected
       if (isTRUE(input$violin_scale_mode == "linear")) {
          for (sc in sample_cols) {
             if (is.numeric(sub_df[[sc]])) {
                sub_df[[sc]] <- 2^(sub_df[[sc]])
             }
          }
       }
       
       # Pivot ONLY sample numeric columns into long format
       long_df <- sub_df %>% 
          dplyr::select(Feature = !!rlang::sym(lipid_col), dplyr::all_of(sample_cols)) %>% 
          tidyr::pivot_longer(cols = dplyr::all_of(sample_cols), names_to = "Sample_ID", values_to = "Plot_Value")
       
       sample_meta <- meta %>% 
          dplyr::select(Sample_ID = !!rlang::sym(sample_col), GroupingVal = !!rlang::sym(group_col))
       
       long_df <- long_df %>% 
          dplyr::left_join(sample_meta, by = "Sample_ID") %>% 
          dplyr::filter(!is.na(Plot_Value), !is.na(GroupingVal))
       
       req(nrow(long_df) > 0)
       
       # Violin Representation Mode
       mode_sel <- input$violin_sample_mode %||% "group_distribution"
       
       if (mode_sel == "hyperclass_panels_condition_x") {
          sub_anno <- shared_data$annotationData()
          if (!is.null(sub_anno) && "hyperclass" %in% names(sub_anno)) {
             long_df <- long_df %>% 
                dplyr::left_join(sub_anno %>% dplyr::select(Feature = Lipid_Name, Lipid_Class = subclass, Lipid_Hyperclass = hyperclass), by = "Feature")
          } else if (!is.null(sub_anno) && "subclass" %in% names(sub_anno)) {
             long_df <- long_df %>% 
                dplyr::left_join(sub_anno %>% dplyr::select(Feature = Lipid_Name, Lipid_Class = subclass), by = "Feature")
          }
          if (!("Lipid_Class" %in% names(long_df)) || all(is.na(long_df$Lipid_Class))) {
             long_df$Lipid_Class <- gsub(" .*", "", long_df$Feature)
          }
          if (!("Lipid_Hyperclass" %in% names(long_df)) || all(is.na(long_df$Lipid_Hyperclass))) {
             long_df$Lipid_Hyperclass <- gsub("_.*", "", long_df$Lipid_Class)
          }
          
          long_df$Feature <- long_df$Lipid_Hyperclass
          long_df$Facet_Grp <- long_df$Lipid_Hyperclass
          long_df$X_Grp <- long_df$GroupingVal
          long_df$fill_var <- long_df$GroupingVal
       } else if (mode_sel == "class_distribution") {
          sub_anno <- shared_data$annotationData()
          if (!is.null(sub_anno) && "subclass" %in% names(sub_anno)) {
             long_df <- long_df %>% 
                dplyr::left_join(sub_anno %>% dplyr::select(Feature = Lipid_Name, Lipid_Class = subclass), by = "Feature")
          }
          if (!("Lipid_Class" %in% names(long_df)) || all(is.na(long_df$Lipid_Class))) {
             long_df$Lipid_Class <- gsub(" .*", "", long_df$Feature)
          }
          long_df$Feature <- long_df$Lipid_Class
          long_df$Facet_Grp <- long_df$Lipid_Class
          long_df$X_Grp <- long_df$GroupingVal
          long_df$fill_var <- long_df$GroupingVal
       } else if (mode_sel == "species_panels_condition_x") {
          sub_anno <- shared_data$annotationData()
          if (!is.null(sub_anno) && "subclass" %in% names(sub_anno)) {
             long_df <- long_df %>% 
                dplyr::left_join(sub_anno %>% dplyr::select(Feature = Lipid_Name, Lipid_Class = subclass), by = "Feature")
          }
          if (!("Lipid_Class" %in% names(long_df)) || all(is.na(long_df$Lipid_Class))) {
             long_df$Lipid_Class <- gsub(" .*", "", long_df$Feature)
          }
          long_df$Facet_Grp <- long_df$Lipid_Class
          long_df$X_Grp <- long_df$GroupingVal
          long_df$fill_var <- long_df$GroupingVal
       } else if (mode_sel == "condition_facets_species_x") {
          sub_anno <- shared_data$annotationData()
          if (!is.null(sub_anno) && "subclass" %in% names(sub_anno)) {
             long_df <- long_df %>% 
                dplyr::left_join(sub_anno %>% dplyr::select(Feature = Lipid_Name, Lipid_Class = subclass), by = "Feature")
          }
          if (!("Lipid_Class" %in% names(long_df)) || all(is.na(long_df$Lipid_Class))) {
             long_df$Lipid_Class <- gsub(" .*", "", long_df$Feature)
          }
          
          # Subplot Feature = Sample Condition Name (ApoptoticJurk_Cells, PathEColi_Live, etc.)
          # X-axis = Single Lipid Species (ACar 4:0, ACar 5:0, LPA 2:0, etc.)
          # Facet_Grp = Lipid Class (FA_ACar, GP_LPA, etc.)
          # Fill = Lipid Class (for color-coding by class)
          long_df$X_Grp <- long_df$Feature
          long_df$Feature <- long_df$GroupingVal
          long_df$Facet_Grp <- long_df$Lipid_Class
          long_df$fill_var <- long_df$Lipid_Class
       } else if (mode_sel == "class_on_x" || mode_sel == "species_on_x") {
          sub_anno <- shared_data$annotationData()
          if (!is.null(sub_anno) && "subclass" %in% names(sub_anno)) {
             long_df <- long_df %>% 
                dplyr::left_join(sub_anno %>% dplyr::select(Feature = Lipid_Name, Lipid_Class = subclass), by = "Feature")
          }
          if (!("Lipid_Class" %in% names(long_df)) || all(is.na(long_df$Lipid_Class))) {
             long_df$Lipid_Class <- gsub(" .*", "", long_df$Feature)
          }
          
          if (mode_sel == "class_on_x") {
             # Mode 3: X-axis = Lipid Class, Fill / GroupingVal = Sample Group (Condition)
             long_df$Facet_Grp <- "All"
             long_df$X_Grp <- long_df$Lipid_Class
          } else {
             # Mode 5: Facet = Lipid_Class, X-axis = Feature (Lipid Species), GroupingVal = Sample Group (Condition)
             long_df$Facet_Grp <- long_df$Lipid_Class
             long_df$X_Grp <- long_df$Feature
          }
       }
       
       # Natural Structural Sort or Class Order for X-axis items
       x_order_pref <- input$violin_x_order
       if (mode_sel == "condition_facets_species_x" || mode_sel == "species_on_x") {
          unique_feats <- unique(as.character(long_df$X_Grp))
          default_struct_order <- sort_lipids_structurally(unique_feats)
          if (!is.null(x_order_pref) && length(x_order_pref) > 0) {
             avail_x <- intersect(x_order_pref, unique_feats)
             final_levels <- if (length(avail_x) > 0) c(avail_x, setdiff(default_struct_order, avail_x)) else default_struct_order
          } else {
             final_levels <- default_struct_order
          }
          long_df$X_Grp <- factor(long_df$X_Grp, levels = final_levels)
          
          # Preserve sample group factor levels
          matched_grps <- meta[[group_col]][match(sample_cols, meta[[sample_col]])]
          meta_grps <- unique(as.character(matched_grps))
          meta_grps <- meta_grps[!is.na(meta_grps) & meta_grps != ""]
          long_df$GroupingVal <- factor(long_df$GroupingVal, levels = intersect(meta_grps, unique(as.character(long_df$GroupingVal))))
       } else if (mode_sel == "class_on_x") {
          unique_classes <- unique(as.character(long_df$X_Grp))
          if (!is.null(x_order_pref) && length(x_order_pref) > 0) {
             avail_x <- intersect(x_order_pref, unique_classes)
             final_levels <- if (length(avail_x) > 0) c(avail_x, setdiff(unique_classes, avail_x)) else unique_classes
          } else {
             final_levels <- sort(unique_classes)
          }
          long_df$X_Grp <- factor(long_df$X_Grp, levels = final_levels)
          
          # Preserve sample group factor levels
          matched_grps <- meta[[group_col]][match(sample_cols, meta[[sample_col]])]
          meta_grps <- unique(as.character(matched_grps))
          meta_grps <- meta_grps[!is.na(meta_grps) & meta_grps != ""]
          long_df$GroupingVal <- factor(long_df$GroupingVal, levels = intersect(meta_grps, unique(as.character(long_df$GroupingVal))))
       } else {
          # Default group_distribution / class_distribution / species_panels_condition_x: preserve dataset loaded group order (left to right from sample_cols)
          matched_grps <- meta[[group_col]][match(sample_cols, meta[[sample_col]])]
          meta_grps <- unique(as.character(matched_grps))
          meta_grps <- meta_grps[!is.na(meta_grps) & meta_grps != ""]
          
          if (!is.null(x_order_pref) && length(x_order_pref) > 0) {
             avail_x <- intersect(x_order_pref, meta_grps)
             final_levels <- if (length(avail_x) > 0) c(avail_x, setdiff(meta_grps, avail_x)) else meta_grps
          } else {
             final_levels <- meta_grps
          }
          final_levels <- as.character(final_levels)
          all_grp_vals <- unique(as.character(long_df$GroupingVal))
          final_levels <- final_levels[final_levels %in% all_grp_vals]
          if (length(final_levels) < length(all_grp_vals)) {
             final_levels <- c(final_levels, setdiff(all_grp_vals, final_levels))
          }
          long_df$GroupingVal <- factor(as.character(long_df$GroupingVal), levels = final_levels)
          if ("X_Grp" %in% names(long_df)) {
             long_df$X_Grp <- factor(as.character(long_df$X_Grp), levels = final_levels)
          }
       }
       long_df$Significance <- "ns"
       long_df$P_Value <- NA
       
       # Baseline Group Selection (Independent from Menu 3)
       base_ref <- input$violin_baseline_group_header %||% input$violin_baseline_group
       unique_grps <- levels(long_df$GroupingVal)
       if (length(unique_grps) == 0) unique_grps <- unique(as.character(long_df$GroupingVal))
       if (is.null(base_ref) || !(base_ref %in% unique_grps)) {
          base_ref <- unique_grps[1]
       }
       
       # Differential Expression Significance Mapping
       alpha_thresh <- as.numeric(input$violin_sig_threshold %||% 0.05)
       if (isTRUE(input$show_violin_sig %||% TRUE)) {
          grps <- levels(long_df$GroupingVal)
          if (length(grps) >= 2) {
             stats_df <- data.frame()
             ft_col <- if ("X_Grp" %in% names(long_df)) "X_Grp" else "Feature"
             for (ft in unique(long_df[[ft_col]])) {
                b_vals <- long_df %>% dplyr::filter(!!rlang::sym(ft_col) == ft, GroupingVal == base_ref) %>% dplyr::pull(Plot_Value)
                for (cg in setdiff(grps, base_ref)) {
                   c_vals <- long_df %>% dplyr::filter(!!rlang::sym(ft_col) == ft, GroupingVal == cg) %>% dplyr::pull(Plot_Value)
                   pv <- NA
                   st <- "ns"
                   if (length(b_vals) >= 1 && length(c_vals) >= 1) {
                      tt <- tryCatch(t.test(b_vals, c_vals)$p.value, error = function(e) NA)
                      if (!is.na(tt)) {
                         pv <- tt
                         st <- if (pv < (alpha_thresh / 50)) "***" else if (pv < (alpha_thresh / 5)) "**" else if (pv < alpha_thresh) "*" else "ns"
                      }
                   }
                   row_item <- data.frame(GroupingVal = cg, P_Value = pv, Significance = st, stringsAsFactors = FALSE)
                   row_item[[ft_col]] <- ft
                   if (!("Feature" %in% names(row_item))) row_item[["Feature"]] <- ft
                   stats_df <- rbind(stats_df, row_item)
                }
             }
             if (nrow(stats_df) > 0) {
                join_cols <- intersect(c("Feature", "X_Grp", "GroupingVal"), names(long_df))
                join_cols <- intersect(join_cols, names(stats_df))
                long_df <- long_df %>% 
                   dplyr::select(-dplyr::any_of(c("Significance", "P_Value"))) %>% 
                   dplyr::left_join(stats_df, by = join_cols)
                long_df$Significance[is.na(long_df$Significance)] <- "Reference"
             }
          }
       }
       
       # Set color palette matching fill_var
       fill_col <- if ("fill_var" %in% names(long_df)) "fill_var" else "GroupingVal"
       fill_vals <- unique(as.character(long_df[[fill_col]]))
       
       color_map <- character(0)
       if (fill_col == "fill_var" || mode_sel == "condition_facets_species_x" || mode_sel == "species_panels_condition_x") {
          class_cm <- shared_data$class_color_map() %||% character(0)
          if (length(class_cm) > 0 && all(fill_vals %in% names(class_cm))) {
             color_map <- class_cm
          }
       }
       if (length(color_map) == 0 || !all(fill_vals %in% names(color_map))) {
          pal_choice <- input$violin_palette %||% "Set1"
          color_map <- initialize_color_map(fill_vals, palette_name = pal_choice)
       }
       
       p <- plot_logratio_violin(
          df = long_df,
          target_features = unique(long_df$Feature),
          baseline_groups = base_ref,
          color_mapping = color_map,
          y_label = if(isTRUE(input$violin_scale_mode == "linear")) "Linear Abundance Intensity" else "Log2 Abundance Intensity",
          show_baseline = FALSE,
          return_list = FALSE,
          sig_display_type = input$violin_sig_display_type %||% "star",
          show_legend = isTRUE(input$show_violin_legend %||% FALSE),
          facet_fontsize = as.numeric(input$violin_facet_fontsize %||% 11),
          sig_threshold = alpha_thresh
       )
       
       p
    })

    output$violin_plot_render <- renderPlot({
       build_heatmap_violin_ggplot()
    })

    # Download Handlers for Violin View
    output$download_violin_pdf <- downloadHandler(
       filename = function() { paste0("Selected_Lipids_Violin_Plots_", Sys.Date(), ".pdf") },
       content = function(file) {
          p <- build_heatmap_violin_ggplot()
          n_lipids <- min(length(get_active_violin_lipids()), 60)
          h <- max(6, ceiling(n_lipids / 3) * 3)
          ggplot2::ggsave(file, plot = p, width = 11, height = h, device = "pdf")
       }
    )

    output$download_violin_csv <- downloadHandler(
       filename = function() { 
          mode_str <- input$violin_sample_mode %||% "group_distribution"
          paste0("Selected_Lipids_Abundance_Data_", mode_str, "_", format(Sys.Date(), "%Y%m%d"), ".csv") 
       },
       content = function(file) {
          target_lipids <- get_active_violin_lipids()
          df_norm <- shared_data$data_processed()
          meta <- shared_data$all_metadata()
          req(df_norm, meta)
          
          lipid_col <- if ("Lipid_Name" %in% names(df_norm)) {
             "Lipid_Name"
          } else if ("Feature" %in% names(df_norm)) {
             "Feature"
          } else {
             names(df_norm)[1]
          }
          
          sample_cols <- setdiff(names(df_norm), c("Lipid_Name", "Feature", "Name", "lipid", "Class", "subclass", "hyperclass", "Category"))
          sub_df <- df_norm %>% dplyr::filter(!!rlang::sym(lipid_col) %in% target_lipids)
          
          sample_col <- if ("FullName" %in% names(meta)) "FullName" else if ("Sample" %in% names(meta)) "Sample" else names(meta)[1]
          group_col <- if ("Group1" %in% names(meta) && length(unique(meta$Group1)) > 1) "Group1" else if ("Group" %in% names(meta)) "Group" else names(meta)[1]
          
          long_df <- sub_df %>% 
             dplyr::select(Lipid_Name = !!rlang::sym(lipid_col), dplyr::all_of(sample_cols)) %>% 
             tidyr::pivot_longer(cols = dplyr::all_of(sample_cols), names_to = "Sample_ID", values_to = "Log2_Abundance") %>% 
             dplyr::left_join(meta, by = setNames(sample_col, "Sample_ID"))
          
          if (group_col %in% names(long_df)) {
             grp_summary <- long_df %>% 
                dplyr::group_by(Lipid_Name, !!rlang::sym(group_col)) %>% 
                dplyr::mutate(
                   Group_Mean = round(mean(Log2_Abundance, na.rm = TRUE), 4),
                   Group_Variance = round(var(Log2_Abundance, na.rm = TRUE), 4),
                   Group_SD = round(sd(Log2_Abundance, na.rm = TRUE), 4),
                   Group_SE = round(sd(Log2_Abundance, na.rm = TRUE) / sqrt(pmax(1, dplyr::n())), 4)
                ) %>% 
                dplyr::ungroup()
             readr::write_csv(grp_summary, file)
          } else {
             readr::write_csv(long_df, file)
          }
       }
    )
    
     observeEvent(input$show_condensed_formulas, {
        tab_sel <- input$heatmap_tabs %||% "Unfiltered Heatmap"
        
        # Generate standard statistical report text first and append show formulas token
        msg <- generateHeatmapStatsMsg()
        shared_data$stats_detail_text(paste0(msg, "\n#SHOW_FORMULAS#"))
       
       df <- shared_data$data_processed()
       req(df)
       anno <- shared_data$annotationData()
       req(anno)
       
       condense_col <- input$staircaseGroup %||% "subclass"
       req(condense_col %in% names(anno))
       
       active_lipids <- shared_data$global_filtered_lipids()
       if (tab_sel == "Filtered Heatmap") {
         sig_lipids <- tryCatch(shared_data$significant_lipids(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
         if (is.null(sig_lipids)) {
           shared_data$stats_detail_type("html")
           shared_data$stats_detail_html(
             p(class="alert alert-warning", 
               "Differential expression has not been configured yet. Please configure it in the Global Sidebar (Panel 3: Differential Expression) to view Filtered Heatmap formulas.")
           )
           parent_sess <- if (!is.null(session$parent)) session$parent else session
           show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Heatmap")
           return()
         }
         active_lipids <- intersect(sig_lipids, active_lipids)
       }
       
       anno_sub <- anno %>% dplyr::filter(Lipid_Name %in% active_lipids)
       if (nrow(anno_sub) == 0) {
         shared_data$stats_detail_type("html")
         shared_data$stats_detail_html(
           p(class="alert alert-warning", 
             sprintf("No lipids are active in the selected %s to compute condensed class formulas.", tab_sel))
         )
         parent_sess <- if (!is.null(session$parent)) session$parent else session
         show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Heatmap")
         return()
       }
       
       if (input$classLabelFormat == "full") {
         anno_sub$Group_Label <- get_full_class_name(anno_sub[[condense_col]])
       } else {
         anno_sub$Group_Label <- get_short_class_name(anno_sub[[condense_col]])
       }
       
       anno_sub <- anno_sub %>% dplyr::filter(!is.na(Group_Label) & Group_Label != "")
       if (nrow(anno_sub) == 0) {
         shared_data$stats_detail_type("html")
         shared_data$stats_detail_html(p(class="alert alert-warning", "No valid class labels could be mapped."))
         parent_sess <- if (!is.null(session$parent)) session$parent else session
         show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Heatmap")
         return()
       }
       
       grouped_list <- split(anno_sub$Lipid_Name, anno_sub$Group_Label)
       
       ui_elements <- lapply(sort(names(grouped_list)), function(grp_name) {
         lipids <- sort(grouped_list[[grp_name]])
         n_lipids <- length(lipids)
         
         # General formula: Average of all constituent species
         general_formula <- sprintf("%s = mean( %s )", grp_name, paste(head(lipids, 3), collapse = ", "))
         if (n_lipids > 3) {
           general_formula <- sprintf("%s = mean( %s, ... [%d more] )", grp_name, paste(head(lipids, 3), collapse = ", "), n_lipids - 3)
         }
         
         # General formulas: Average & Standard Deviation of constituent species
         general_formula <- sprintf("%s (Mean) = mean( %s )", grp_name, paste(head(lipids, 3), collapse = ", "))
         if (n_lipids > 3) {
           general_formula <- sprintf("%s (Mean) = mean( %s, ... [%d more] )", grp_name, paste(head(lipids, 3), collapse = ", "), n_lipids - 3)
         }
         
         sd_formula <- sprintf("%s (SD) = sd( %s )", grp_name, paste(head(lipids, 3), collapse = ", "))
         if (n_lipids > 3) {
           sd_formula <- sprintf("%s (SD) = sd( %s, ... [%d more] )", grp_name, paste(head(lipids, 3), collapse = ", "), n_lipids - 3)
         }
         
         detailed_mean <- sprintf("(%s) / %d", paste(lipids, collapse = " + "), n_lipids)
         detailed_sd <- if (n_lipids == 1) "0 (single lipid species)" else sprintf("sqrt( (1 / %d) * sum( (x_i - mean)^2 ) )", n_lipids - 1)
         
         tags$div(
           style = "margin-bottom: 12px; padding: 10px; border-radius: 6px; background-color: #f8f9fa; border-left: 4px solid #0072B2; box-shadow: 0 1px 3px rgba(0,0,0,0.05);",
           tags$div(
             style = "margin-bottom: 5px;",
             tags$strong(grp_name, style = "font-size: 1.1rem; color: #212529; margin-right: 15px;"),
             tags$span(style = "font-size: 0.85rem; color: #0072B2; font-family: monospace; font-weight: bold; margin-right: 15px;", general_formula),
             tags$span(style = "font-size: 0.85rem; color: #E28E2B; font-family: monospace; font-weight: bold;", sd_formula)
           ),
           tags$details(
             style = "margin-top: 5px;",
             tags$summary(
               style = "cursor: pointer; font-size: 0.85rem; color: #0072B2; outline: none; margin-bottom: 5px; font-weight: 600;",
               "Show constituent formulas & lipid species detail"
             ),
             tags$div(
               style = "padding: 8px 12px; background-color: #ffffff; border-radius: 4px; border: 1px solid #dee2e6; margin-top: 5px;",
               
               p(strong("Detailed Class Average (Mean) Formula:"), style = "margin-bottom: 4px; font-size: 0.85rem; color: #212529;"),
               div(code(detailed_mean), style = "font-size: 0.85rem; background-color: #f8f9fa; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; display: block; word-break: break-all; border: 1px solid #e9ecef;"),
               
               p(strong("Detailed Class Standard Deviation (SD) Formula:"), style = "margin-bottom: 4px; font-size: 0.85rem; color: #212529;"),
               div(code(detailed_sd), style = "font-size: 0.85rem; background-color: #f8f9fa; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; display: block; word-break: break-all; border: 1px solid #e9ecef;"),
               
               p(strong(sprintf("Constituent Lipid Species (N = %d):", n_lipids)), style = "margin-bottom: 4px; font-size: 0.85rem; color: #212529;"),
               tags$ul(
                 style = "margin-bottom: 0; padding-left: 20px; font-size: 0.85rem; color: #495057;",
                 lapply(lipids, function(l) tags$li(l))
               )
             )
           )
         )
       })
       
       html_report <- tagList(
         h4(sprintf("Condensed Class Formulas (%s)", tab_sel), style = "font-weight: bold; color: #0072B2; margin-bottom: 15px;"),
         p(class="text-muted", sprintf("This report lists the mathematical formulas and individual lipid species grouped under each parent class for the active %s. Click on any class name to expand/toggle the detailed breakdown.", tab_sel)),
         div(ui_elements)
       )
       
       shared_data$stats_detail_type("heatmap_formulas")
       shared_data$stats_detail_html(html_report)
       
       # Show Statistics modal overlay
       parent_sess <- if (!is.null(session$parent)) session$parent else session
       show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Heatmap")
     })
    
  # --- 1. Data Selection (Visual Subset Only) ---
    
  # output$heatmapDisplayColumnSelectorUI allows users to HIDE columns from the heatmap
  # WITHOUT affecting the global statistics or filtering.
    output$heatmapDisplayColumnSelectorUI <- renderUI({
      req(input$repMode)
      mat <- if(grepl("aggregate", input$repMode)) aggregatedMatrixData() else replicateMatrixData()
      req(mat)
      
      meta <- dynamic_metadata()
      if (grepl("aggregate", input$repMode)) {
          cols <- colnames(mat)
          choice_values <- cols
          choice_names <- cols
      } else {
          cols <- colnames(mat)
          choice_values <- cols
          choice_names <- meta$Display_Name[match(cols, meta$FullName)]
      }
      
      current_selected <- setdiff(choice_values, isolate(rv_cols$hidden))
      saved_cols <- shared_data$get_restored_input(session$ns("heatmapDisplayColumns"), current_selected)
      
      tags$div(
        style = "max-height: 200px; overflow-y: auto; border: 1px solid #e9ecef; padding: 10px; border-radius: 5px;",
        checkboxGroupInput(session$ns("heatmapDisplayColumns"), "Display Columns (Subset):", 
                    choiceNames = choice_names, choiceValues = choice_values, selected = saved_cols)
      )
    })
    
  # Observer to Update Persistence State
    observeEvent(input$heatmapDisplayColumns, {
    # This runs when user changes selection OR when mode switches (triggering UI rebuild)
       
     # 1. Identify Context
        req(input$heatmapDisplayColumns)
        rep_mode_val <- input$repMode %||% "replicate"
        mat <- if(grepl("aggregate", rep_mode_val)) aggregatedMatrixData() else replicateMatrixData()
        req(mat)
        all_cols_in_context <- colnames(mat)
        current_selection <- input$heatmapDisplayColumns
        
     # 2. Determine what is explicitly hidden/shown in this context
        hidden_in_context <- setdiff(all_cols_in_context, current_selection)
        visible_in_context <- current_selection
        
     # 3. Get Metadata for Mapping
        meta <- dynamic_metadata()
        
     # 4. Smart Update Logic
        new_hidden <- rv_cols$hidden
        
        if(grepl("aggregate", rep_mode_val)) {
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
      
   # Grouping Logic for Annotation (Fallback to Group1 if DE not set?)
   # checking the global setting if available, or infer from metadata
   # The shared_data doesn't explicitly export "DeOrientGroup1" inputs, but capable to look at dynamic Logic.
   # For simplicty, let's group by "Group1" and "Group2" if available.
      
      meta_groups <- if("Group1" %in% names(meta) && "Group2" %in% names(meta)) {
         paste(meta$Group1, meta$Group2, sep="_")
      } else if ("Group1" %in% names(meta)) {
         meta$Group1
      } else {
         "All"
      }
      unique_groups <- sort(unique(meta_groups))
      
      default_colors <- viridisLite::viridis(length(unique_groups), alpha = 0.9)
      
      lapply(seq_along(unique_groups), function(i) {
        g_name <- unique_groups[i]
        safe_id <- gsub("[^A-Za-z0-9_]", "", g_name)
        
        # Session persistence checks
        local_saved_name <- rv_anno$names[[g_name]] %||% g_name
        local_saved_color <- rv_anno$colors[[g_name]] %||% default_colors[i]
        
        saved_name <- shared_data$get_restored_input(session$ns(paste0("cell_name_", safe_id)), local_saved_name)
        saved_color <- shared_data$get_restored_input(session$ns(paste0("cell_color_", safe_id)), local_saved_color)
        
        layout_columns(col_widths = c(8, 4),
           textInput(session$ns(paste0("cell_name_", safe_id)), label=strong(g_name), value=saved_name),
           colourInput(session$ns(paste0("cell_color_", safe_id)), label=NULL, value=saved_color)
        )
      })
    })
    
    cellAnnotationMapping <- reactive({
      req(input$activateCellAnnotation, replicateMatrixData())
      meta <- dynamic_metadata()
      unique_groups <- sort(unique(meta$Group))
      meta <- shared_data$all_metadata() %>% dplyr::filter(FullName %in% colnames(replicateMatrixData()))
      
      meta$Group <- if("Group1" %in% names(meta) && "Group2" %in% names(meta)) {
         paste(meta$Group1, meta$Group2, sep="_")
      } else if ("Group1" %in% names(meta)) {
         meta$Group1
      } else {
         "All"
      }
      unique_groups <- sort(unique(meta$Group))
      
      default_colors <- viridisLite::viridis(length(unique_groups), alpha = 0.9)
      
      group_map <- purrr::map_dfr(seq_along(unique_groups), function(i) {
        g_name <- unique_groups[i]
        safe_id <- gsub("[^A-Za-z0-9_]", "", g_name)
        tibble::tibble(
          Group = g_name,
          Cell = input[[paste0("cell_name_", safe_id)]] %||% rv_anno$names[[g_name]] %||% g_name,
          Color = input[[paste0("cell_color_", safe_id)]] %||% rv_anno$colors[[g_name]] %||% default_colors[i]
        )
      })
      
      if(grepl("aggregate", input$repMode %||% "replicate", ignore.case = TRUE)) {
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
    
    cellAnnotationMapping_debounced <- debounce(cellAnnotationMapping, 1000)
    
  # --- 2. Data Processing (Consuming Global Data) ---

  # --- Advanced Aesthetics & Drag and Drop UI ---
    dynamic_metadata <- reactive({
       df <- shared_data$data_processed()
       req(df)
       raw_meta <- shared_data$all_metadata()
       meta <- raw_meta %>% dplyr::filter(FullName %in% colnames(df))
       
       candidate_cols <- intersect(names(meta), c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint"))
       valid_cols <- sapply(candidate_cols, function(col) {
         vals <- raw_meta[[col]]
         vals <- vals[!is.na(vals) & vals != "" & vals != "Unspecified"]
         return(length(vals) > 0)
       })
       available_cols <- candidate_cols[valid_cols]
       
       h_order <- input$hierarchy_order %||% rv_ordering$hierarchy %||% available_cols
       h_order <- intersect(h_order, available_cols)
       
       if (grepl("aggregate", input$repMode %||% "aggregate_class")) h_order <- setdiff(h_order, c("Replicate", "PatientNumber"))
       if (length(h_order) == 0) h_order <- available_cols[1] # fallback
       
       for (col in h_order) {
          manual_val_order <- input[[paste0("order_", col)]] %||% rv_ordering$groups[[col]]
          clean_unique <- unique(meta[[col]])
          clean_unique <- clean_unique[!is.na(clean_unique) & clean_unique != "" & clean_unique != "Unspecified"]
          if (!is.null(manual_val_order) && length(manual_val_order) == length(clean_unique)) {
             meta[[col]] <- factor(meta[[col]], levels = manual_val_order)
          } else {
             meta[[col]] <- factor(meta[[col]], levels = clean_unique)
          }
       }
        
        meta <- meta %>% dplyr::arrange(!!!rlang::syms(h_order))
        
        build_custom_display_name <- function(row, h_order) {
          res <- ""
          for (col in h_order) {
            val <- row[[col]]
            val_str <- if (!is.na(val)) as.character(val) else ""
            if (nzchar(val_str) && val_str != "Unspecified") {
              if (col == "PatientNumber") {
                res <- if (nzchar(res)) paste0(res, "/", val_str) else val_str
              } else {
                res <- if (nzchar(res)) paste0(res, "_", val_str) else val_str
              }
            }          }
          res
        }

        if (grepl("aggregate", input$repMode %||% "aggregate_class")) {
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
        tab_sel <- input$heatmap_tabs %||% "Unfiltered Heatmap"
        
        if (identical(tab_sel, "Violin View")) {
           meta <- shared_data$all_metadata()
           df_norm <- shared_data$data_processed()
           target_lipids <- get_active_violin_lipids() %||% character(0)
           mode_sel <- input$violin_sample_mode %||% "group_distribution"
           
           if (mode_sel == "class_on_x") {
              sub_anno <- shared_data$annotationData()
              if (!is.null(sub_anno) && "subclass" %in% names(sub_anno)) {
                 sub_df <- sub_anno %>% dplyr::filter(Lipid_Name %in% target_lipids)
                 x_items <- sort(unique(sub_df$subclass))
              } else {
                 x_items <- sort(unique(gsub(" .*", "", target_lipids)))
              }
              item_label <- "Re-order Lipid Classes on X-Axis:"
           } else if (mode_sel == "condition_facets_species_x" || mode_sel == "species_on_x") {
              x_items <- sort_lipids_structurally(target_lipids[1:min(length(target_lipids), 40)])
              item_label <- "Re-order Lipid Species on X-Axis (Natural Structural Sort Applied):"
           } else {
              sample_cols <- setdiff(names(df_norm), c("Lipid_Name", "Feature", "Name", "lipid", "Class", "subclass", "hyperclass", "Category"))
              sample_col <- if (!is.null(meta) && "FullName" %in% names(meta)) "FullName" else if (!is.null(meta) && "Sample" %in% names(meta)) "Sample" else names(meta)[1]
              grp_col <- if (!is.null(meta) && "Group1" %in% names(meta) && length(unique(meta$Group1)) > 1) "Group1" else if (!is.null(meta) && "Group" %in% names(meta)) "Group" else names(meta)[1]
              
              if (!is.null(df_norm) && !is.null(meta) && grp_col %in% names(meta) && sample_col %in% names(meta)) {
                 matched_grps <- meta[[grp_col]][match(sample_cols, meta[[sample_col]])]
                 x_items <- unique(as.character(matched_grps))
              } else if (!is.null(meta) && grp_col %in% names(meta)) {
                 x_items <- unique(as.character(meta[[grp_col]]))
              } else {
                 x_items <- c("Group 1", "Group 2")
              }
              x_items <- x_items[!is.na(x_items) & x_items != ""]
              item_label <- "Re-order Sample Groups on X-Axis (Heatmap Loaded Order Preserved):"
           }
           
           current_order <- input$violin_x_order
           if (!is.null(current_order) && length(current_order) > 0) {
              avail_curr <- intersect(current_order, x_items)
              if (length(avail_curr) > 0) {
                 x_items <- c(avail_curr, setdiff(x_items, avail_curr))
              }
           }
           
           return(tagList(
               h6("X-Axis Item Ordering (Drag Left to Right)", class = "fw-bold text-primary mb-2"),
               p(item_label, class = "text-muted small mb-2"),
               sortable::rank_list(
                  text = "",
                  labels = x_items,
                  input_id = session$ns("violin_x_order")
               )
            ))
        }
        
        df <- shared_data$data_processed()
        req(df)
        raw_meta <- shared_data$all_metadata()
        meta <- raw_meta %>% dplyr::filter(FullName %in% colnames(df))
        candidate_cols <- intersect(names(meta), c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint"))
        
        # Keep candidate columns only if they contain at least one valid, non-empty, non-Unspecified value
        valid_cols <- sapply(candidate_cols, function(col) {
          vals <- raw_meta[[col]]
          vals <- vals[!is.na(vals) & vals != "" & vals != "Unspecified"]
          return(length(vals) > 0)
        })
        available_cols <- candidate_cols[valid_cols]
        
        if (grepl("aggregate", input$repMode %||% "aggregate_class")) available_cols <- setdiff(available_cols, c("Replicate", "PatientNumber"))
        
        # Session persistence check
        saved_hierarchy_pref <- shared_data$get_restored_input(session$ns("hierarchy_order"), rv_ordering$hierarchy)
        labels_to_show <- available_cols
        if (!is.null(saved_hierarchy_pref)) {
           saved_hierarchy <- intersect(saved_hierarchy_pref, available_cols)
           extra_cols <- setdiff(available_cols, saved_hierarchy)
           labels_to_show <- c(saved_hierarchy, extra_cols)
        }
        
        tagList(
          h6("1. Define Naming Hierarchy"),
          p("Drag to build the sample/group naming structure.", class="text-muted small"),
          sortable::rank_list(
            text = "",
            labels = labels_to_show,
            input_id = session$ns("hierarchy_order")
          ),
          hr(),
          h6("2. Order Specific Groups"),
          uiOutput(session$ns("groupSpecificOrderingUI")),
          hr(),
          h6("3. Customize Row Grouping Order"),
          p("Override the default staircase row grouping order.", class="text-muted small"),
          checkboxInput(session$ns("customizeRowOrder"), "Enable Custom Row Ordering", isTRUE(shared_data$get_restored_input(session$ns("customizeRowOrder"), rv_ordering$customize_row_enabled))),
          conditionalPanel(
             condition = "input.customizeRowOrder == true",
             ns = session$ns,
             uiOutput(session$ns("customRowOrderingUI"))
          )
        )
     })
     outputOptions(output, "dragDropOrderingUI", suspendWhenHidden = FALSE)
    
    output$customRowOrderingUI <- renderUI({
       sort_mode <- input$staircaseGroup %||% "subclass"
       anno <- shared_data$annotationData()
       req(anno)
       
       if (sort_mode == "subclass") {
          unique_vals <- sort(unique(anno$subclass))
          label_txt <- "Order Main Classes (Top to Bottom):"
       } else if (sort_mode == "hyperclass") {
          unique_vals <- sort(unique(anno$hyperclass))
          label_txt <- "Order Lipid Categories (Top to Bottom):"
       } else {
          return(NULL)
       }
       
       unique_vals <- unique_vals[!is.na(unique_vals)]
       
       # Check for saved custom row order
       saved_custom_row_pref <- shared_data$get_restored_input(session$ns("custom_row_order"), rv_ordering$custom_row)
       if (!is.null(saved_custom_row_pref)) {
          saved_custom_row <- intersect(saved_custom_row_pref, unique_vals)
          extra_vals <- setdiff(unique_vals, saved_custom_row)
          labels_to_show <- c(saved_custom_row, extra_vals)
       } else {
          labels_to_show <- unique_vals
       }
       
       sortable::rank_list(
         text = label_txt,
         labels = labels_to_show,
         input_id = session$ns("custom_row_order")
       )
    })
    
    output$groupSpecificOrderingUI <- renderUI({
       h_order <- input$hierarchy_order
       req(h_order)
       meta <- shared_data$all_metadata()
       req(meta)
       
       # Filter h_order to only columns that exist in meta and have valid non-empty values
       valid_cols <- sapply(h_order, function(h_col) {
         if (!(h_col %in% names(meta))) return(FALSE)
         unique_vals <- unique(meta[[h_col]])
         unique_vals <- unique_vals[!is.na(unique_vals) & unique_vals != "" & unique_vals != "Unspecified"]
         return(length(unique_vals) > 0)
       })
       h_order_filtered <- h_order[valid_cols]
       
       lapply(h_order_filtered, function(h_col) {
         unique_vals <- unique(meta[[h_col]])
         unique_vals <- unique_vals[!is.na(unique_vals) & unique_vals != "" & unique_vals != "Unspecified"]
         
         # Reorder unique_vals based on saved order in rv_ordering$groups[[h_col]] if available
         saved_order_pref <- shared_data$get_restored_input(session$ns(paste0("order_", h_col)), rv_ordering$groups[[h_col]])
         if (!is.null(saved_order_pref)) {
            saved_order <- intersect(saved_order_pref, unique_vals)
            extra_vals <- setdiff(unique_vals, saved_order)
            labels_to_show <- c(saved_order, extra_vals)
         } else {
            labels_to_show <- unique_vals
         }
         
         sortable::rank_list(
           text = paste("Order:", get_metadata_group_label(h_col, meta)),
           labels = labels_to_show,
           input_id = session$ns(paste0("order_", h_col))
         )
       })
    })
    
  # --- CRITICAL ARCHITECTURAL FIX: REPLICATE COLUMN ORDERING ---
    replicateMatrixData <- reactive({
      df <- shared_data$data_processed() 
      req(df)
      filtered_ids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_ids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      mat <- df %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      
      meta <- dynamic_metadata()
      
      valid_cols <- intersect(meta$FullName, colnames(df))
      mat <- mat[, valid_cols, drop=FALSE]
      mat
    })
    
  # --- SYNCHRONIZED AGGREGATE LOGIC ---
    aggregatedMatrixData <- reactive({
      mat <- replicateMatrixData()
      req(mat)
      
      meta_ordered <- dynamic_metadata()
      meta_ordered <- meta_ordered[match(colnames(mat), meta_ordered$FullName), ]
      
      groups <- unique(meta_ordered$Group)
      if(length(groups) == 0) return(mat)
      
      res_list <- lapply(groups, function(g) {
         cols <- meta_ordered$FullName[meta_ordered$Group == g]
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
      valid_cols <- setdiff(colnames(mat), rv_cols$hidden)
      if(length(valid_cols) == 0) return(NULL)
      
      mat_display <- mat[rownames(mat) %in% lipids, valid_cols, drop=FALSE]
      
      # Targeted Mode Fallback: if targeted cohort provides < 2 rows or < 2 cols, fall back to All Matrix
      if (isTRUE(shared_data$targeted_mode_active()) && (nrow(mat_display) < 2 || ncol(mat_display) < 2)) {
        heatmap_fallback_active(TRUE)
        notify_targeted_fallback(session, id = "targeted_fallback_heatmap")
        all_lipids <- if (!is.null(shared_data$global_filtered_lipids_all)) shared_data$global_filtered_lipids_all() else rownames(mat)
        mat_display <- mat[rownames(mat) %in% all_lipids, valid_cols, drop=FALSE]
        if (nrow(mat_display) < 2) mat_display <- mat[, valid_cols, drop=FALSE]
      } else if (!isTRUE(shared_data$targeted_mode_active())) {
        heatmap_fallback_active(FALSE)
      }
      
      current_class_colors <- shared_data$class_color_map()
      current_origin_colors <- shared_data$origin_color_map()
      if (input$classLabelFormat == "full") {
        names(current_class_colors) <- get_full_class_name(names(current_class_colors))
        names(current_origin_colors) <- get_full_class_name(names(current_origin_colors))
      } else {
        names(current_class_colors) <- get_short_class_name(names(current_class_colors))
        names(current_origin_colors) <- get_short_class_name(names(current_origin_colors))
      }
      
      mat_sort <- NULL
      actual_sort_mode <- "class"
      annotation_data_param <- shared_data$annotationData()
      if (input$classLabelFormat == "full") {
        annotation_data_param$subclass <- get_full_class_name(annotation_data_param$subclass)
        annotation_data_param$hyperclass <- get_full_class_name(annotation_data_param$hyperclass)
      } else {
        annotation_data_param$subclass <- get_short_class_name(annotation_data_param$subclass)
        annotation_data_param$hyperclass <- get_short_class_name(annotation_data_param$hyperclass)
      }
      
      if (isTRUE(input$condenseRows)) {
         condense_col <- input$staircaseGroup %||% "subclass"
         anno <- annotation_data_param
         anno_subset <- anno[match(rownames(mat_display), anno$Lipid_Name), , drop=FALSE]
         group_vector <- anno_subset[[condense_col]]
         
         valid_rows <- !is.na(group_vector) & group_vector != ""
         mat_display <- mat_display[valid_rows, , drop=FALSE]
         group_vector <- group_vector[valid_rows]
         
         if (nrow(mat_display) > 0) {
            unique_grps <- unique(group_vector)
            avg_list <- lapply(unique_grps, function(grp) {
               sub_mat <- mat_display[group_vector == grp, , drop=FALSE]
               if (nrow(sub_mat) == 1) {
                  return(sub_mat[1, ])
               } else {
                  return(colMeans(sub_mat, na.rm = TRUE))
               }
            })
            mat_display <- do.call(rbind, avg_list)
            rownames(mat_display) <- unique_grps
            
            row_order_source <- NULL
            if (isTRUE(input$customizeRowOrder %||% rv_ordering$customize_row_enabled) && !is.null(input$custom_row_order %||% rv_ordering$custom_row)) {
               row_order_source <- input$custom_row_order %||% rv_ordering$custom_row
               if (input$classLabelFormat == "full") {
                  row_order_source <- get_full_class_name(row_order_source)
               } else {
                  row_order_source <- get_short_class_name(row_order_source)
               }
            } else {
               row_order_source <- if (condense_col == "subclass") names(current_class_colors) else names(current_origin_colors)
            }
            
            if (!is.null(row_order_source)) {
               sorted_grps <- intersect(row_order_source, rownames(mat_display))
               extra_grps <- setdiff(rownames(mat_display), sorted_grps)
               mat_display <- mat_display[c(sorted_grps, extra_grps), , drop=FALSE]
            } else {
               mat_display <- mat_display[order(rownames(mat_display)), , drop=FALSE]
            }
            
            anno_uniq <- anno %>%
               dplyr::select(dplyr::all_of(c("subclass", "hyperclass"))) %>%
               dplyr::distinct() %>%
               dplyr::filter(!is.na(!!rlang::sym(condense_col)), !!rlang::sym(condense_col) != "") %>%
               dplyr::group_by(!!rlang::sym(condense_col)) %>%
               dplyr::slice(1) %>%
               dplyr::ungroup()
               
            condensed_anno <- tibble::tibble(
               Lipid_Name = anno_uniq[[condense_col]],
               subclass = anno_uniq$subclass,
               hyperclass = anno_uniq$hyperclass
            )
            
            actual_sort_mode <- "none"
            mat_sort <- NULL
            annotation_data_param <- condensed_anno
         }
      } else {
         # --- CUSTOM ROW ORDERING ---
         if (isTRUE(input$customizeRowOrder %||% rv_ordering$customize_row_enabled) && !is.null(input$custom_row_order %||% rv_ordering$custom_row)) {
            actual_sort_mode <- "class_first_staircase"
            sort_mode_param <- input$staircaseGroup %||% "subclass"
            if (sort_mode_param == "subclass" && !is.null(current_class_colors)) {
               ranked <- input$custom_row_order %||% rv_ordering$custom_row
               unranked <- setdiff(names(current_class_colors), ranked)
               current_class_colors <- current_class_colors[c(ranked, unranked)]
            } else if (sort_mode_param == "hyperclass" && !is.null(current_origin_colors)) {
               ranked <- input$custom_row_order %||% rv_ordering$custom_row
               unranked <- setdiff(names(current_origin_colors), ranked)
               current_origin_colors <- current_origin_colors[c(ranked, unranked)]
            }
         }
         
         if (input$repMode == "replicate_fixed_class") {
            # Mode B: Strictly project Aggregate on visible Replicates ONLY (1:1 Mapping)
            agg <- aggregatedMatrixData()
            meta <- dynamic_metadata() %>% dplyr::filter(FullName %in% valid_cols)
            
            active_groups <- intersect(colnames(agg), unique(meta$Group))
            agg_subset <- agg[rownames(mat_display), active_groups, drop=FALSE]
            
            canonical_class_order <- names(current_class_colors)
            if(is.null(canonical_class_order) && exists("CLASS_MAP_COLORS")) canonical_class_order <- names(CLASS_MAP_COLORS)
            canonical_origin_order <- names(current_origin_colors)
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
      }
      
      validate(need(need_val <- nrow(mat_display) >= 2 && ncol(mat_display) >= 2, "Insufficient data matrix dimensions to render Unfiltered Heatmap. Verify selections."))
      
      cell_anno <- if(isTRUE(input$activateCellAnnotation)) cellAnnotationMapping_debounced() else NULL
      sort_cols_param <- input$staircaseGroup %||% "subclass"
      
      # Rename matrix columns for final plot if in replicate mode
      if (!grepl("aggregate", input$repMode)) {
         meta <- dynamic_metadata()
         new_names <- meta$Display_Name[match(colnames(mat_display), meta$FullName)]
         colnames(mat_display) <- new_names
         if (!is.null(mat_sort)) {
             colnames(mat_sort) <- meta$Display_Name[match(colnames(mat_sort), meta$FullName)]
         }
         # Align cell annotation names with renamed column names
         if (!is.null(cell_anno)) {
            matched_indices <- match(rownames(cell_anno$df), meta$FullName)
            valid_idx <- !is.na(matched_indices)
            if (any(valid_idx)) {
               df_subset <- cell_anno$df[valid_idx, , drop=FALSE]
               rownames(df_subset) <- meta$Display_Name[matched_indices[valid_idx]]
               common_cols <- intersect(colnames(mat_display), rownames(df_subset))
               cell_anno$df <- df_subset[common_cols, , drop=FALSE]
            } else {
               cell_anno <- NULL
            }
         }
      } else {
         # Align cell annotation names with aggregate group names
         if (!is.null(cell_anno)) {
            meta <- dynamic_metadata()
            meta$HardcodedGroup <- if("Group1" %in% names(meta) && "Group2" %in% names(meta)) {
               paste(meta$Group1, meta$Group2, sep="_")
            } else if ("Group1" %in% names(meta)) {
               meta$Group1
            } else {
               "All"
            }
            group_to_cell <- stats::setNames(cell_anno$df$Cell, rownames(cell_anno$df))
            meta$Cell <- group_to_cell[meta$HardcodedGroup]
            
            df_anno <- meta %>% 
               dplyr::select(Group, Cell) %>% 
               dplyr::distinct() %>% 
               dplyr::filter(!is.na(Group), Group %in% colnames(mat_display))
            
            if (nrow(df_anno) > 0) {
               df_anno <- df_anno %>% tibble::column_to_rownames("Group")
               common_cols <- intersect(colnames(mat_display), rownames(df_anno))
               cell_anno$df <- df_anno[common_cols, , drop=FALSE]
            } else {
               cell_anno <- NULL
            }
         }
      }

      title_text <- if (isTRUE(input$condenseRows)) {
        condense_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Classes" else "Categories"
        sprintf("Unfiltered Heatmap - Class Average (%d %s)", nrow(mat_display), condense_lbl)
      } else {
        sprintf("Unfiltered Heatmap (%d Lipids)", nrow(mat_display))
      }

      heatmap_res <- generateHeatmapObject(mat_display, title_text,  
                            mat_for_sorting = mat_sort,
                            sort_mode = actual_sort_mode, 
                            annotation_data = annotation_data_param,
                            cell_annotation = cell_anno,
                            show_grid = isTRUE(input$showHeatmapGrid), grid_color = input$heatmapGridColor,
                            hide_row_names = isTRUE(input$hideHeatmapRowNames),
                            display_mat = if(isTRUE(input$showHeatmapNumbers) || isTRUE(input$showHeatmapNumbers_sd_clone)) mat_display else NULL,
                            scale_mode = input$heatmapScaleMode, fine_tune = isTRUE(input$fineTuneColors),
                            colors_diverging = c(input$gz_low, input$gz_mid, input$gz_high),
                            colors_sequential = c(input$seq_low, input$seq_high),
                            class_colors = current_class_colors,
                            origin_colors = current_origin_colors, # Pass dynamic origin colors
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
      
      # Targeted Mode Fallback: if targeted cohort produces < 2 significant lipids, fall back to All Matrix
      if (isTRUE(shared_data$targeted_mode_active()) && length(final_lipids) < 2) {
        filtered_heatmap_fallback_active(TRUE)
        notify_targeted_fallback(session, id = "targeted_fallback_filtered_heatmap")
        all_class_lipids <- if (!is.null(shared_data$global_filtered_lipids_all)) shared_data$global_filtered_lipids_all() else rownames(mat)
        final_lipids <- intersect(sig_lipids, all_class_lipids)
        if (length(final_lipids) < 2) final_lipids <- sig_lipids
      } else if (!isTRUE(shared_data$targeted_mode_active())) {
        filtered_heatmap_fallback_active(FALSE)
      }
      
      validate(need(length(final_lipids) > 0, "No lipids passed BOTH significance and current class/chain filters."))
      
   # Determine sorting matrix (Strict Logic)
   # --- COLUMN SUBSETTING FIRST ---
   # Crucial: Sorting must depend ONLY on what is VISIBLE.
      valid_cols <- setdiff(colnames(mat), rv_cols$hidden)
      if(length(valid_cols) == 0) return(NULL)
      
   # Subset the source matrix (mat corresponds to repMode: Aggregate or Replicate)
      mat_display <- mat[rownames(mat) %in% final_lipids, valid_cols , drop=FALSE]
      
      current_class_colors <- shared_data$class_color_map()
      current_origin_colors <- shared_data$origin_color_map()
      if (input$classLabelFormat == "full") {
        names(current_class_colors) <- get_full_class_name(names(current_class_colors))
        names(current_origin_colors) <- get_full_class_name(names(current_origin_colors))
      } else {
        names(current_class_colors) <- get_short_class_name(names(current_class_colors))
        names(current_origin_colors) <- get_short_class_name(names(current_origin_colors))
      }
      
      mat_sort <- NULL
      actual_sort_mode <- "class"
      annotation_data_param <- shared_data$annotationData()
      if (input$classLabelFormat == "full") {
        annotation_data_param$subclass <- get_full_class_name(annotation_data_param$subclass)
        annotation_data_param$hyperclass <- get_full_class_name(annotation_data_param$hyperclass)
      } else {
        annotation_data_param$subclass <- get_short_class_name(annotation_data_param$subclass)
        annotation_data_param$hyperclass <- get_short_class_name(annotation_data_param$hyperclass)
      }
      
      if (isTRUE(input$condenseRows)) {
         condense_col <- input$staircaseGroup %||% "subclass"
         anno <- annotation_data_param
         anno_subset <- anno[match(rownames(mat_display), anno$Lipid_Name), , drop=FALSE]
         group_vector <- anno_subset[[condense_col]]
         
         valid_rows <- !is.na(group_vector) & group_vector != ""
         mat_display <- mat_display[valid_rows, , drop=FALSE]
         group_vector <- group_vector[valid_rows]
         
         if (nrow(mat_display) > 0) {
            unique_grps <- unique(group_vector)
            avg_list <- lapply(unique_grps, function(grp) {
               sub_mat <- mat_display[group_vector == grp, , drop=FALSE]
               if (nrow(sub_mat) == 1) {
                  return(sub_mat[1, ])
               } else {
                  return(colMeans(sub_mat, na.rm = TRUE))
               }
            })
            mat_display <- do.call(rbind, avg_list)
            rownames(mat_display) <- unique_grps
            
            row_order_source <- NULL
            if (isTRUE(input$customizeRowOrder %||% rv_ordering$customize_row_enabled) && !is.null(input$custom_row_order %||% rv_ordering$custom_row)) {
               row_order_source <- input$custom_row_order %||% rv_ordering$custom_row
               if (input$classLabelFormat == "full") {
                  row_order_source <- get_full_class_name(row_order_source)
               } else {
                  row_order_source <- get_short_class_name(row_order_source)
               }
            } else {
               row_order_source <- if (condense_col == "subclass") names(current_class_colors) else names(current_origin_colors)
            }
            
            if (!is.null(row_order_source)) {
               sorted_grps <- intersect(row_order_source, rownames(mat_display))
               extra_grps <- setdiff(rownames(mat_display), sorted_grps)
               mat_display <- mat_display[c(sorted_grps, extra_grps), , drop=FALSE]
            } else {
               mat_display <- mat_display[order(rownames(mat_display)), , drop=FALSE]
            }
            
            anno_uniq <- anno %>%
               dplyr::select(dplyr::all_of(c("subclass", "hyperclass"))) %>%
               dplyr::distinct() %>%
               dplyr::filter(!is.na(!!rlang::sym(condense_col)), !!rlang::sym(condense_col) != "") %>%
               dplyr::group_by(!!rlang::sym(condense_col)) %>%
               dplyr::slice(1) %>%
               dplyr::ungroup()
               
            condensed_anno <- tibble::tibble(
               Lipid_Name = anno_uniq[[condense_col]],
               subclass = anno_uniq$subclass,
               hyperclass = anno_uniq$hyperclass
            )
            
            actual_sort_mode <- "none"
            mat_sort <- NULL
            annotation_data_param <- condensed_anno
         }
      } else {
         # --- CUSTOM ROW ORDERING ---
         if (isTRUE(input$customizeRowOrder %||% rv_ordering$customize_row_enabled) && !is.null(input$custom_row_order %||% rv_ordering$custom_row)) {
            actual_sort_mode <- "class_first_staircase"
            sort_mode_param <- input$staircaseGroup %||% "subclass"
            if (sort_mode_param == "subclass" && !is.null(current_class_colors)) {
               ranked <- input$custom_row_order %||% rv_ordering$custom_row
               unranked <- setdiff(names(current_class_colors), ranked)
               current_class_colors <- current_class_colors[c(ranked, unranked)]
            } else if (sort_mode_param == "hyperclass" && !is.null(current_origin_colors)) {
               ranked <- input$custom_row_order %||% rv_ordering$custom_row
               unranked <- setdiff(names(current_origin_colors), ranked)
               current_origin_colors <- current_origin_colors[c(ranked, unranked)]
            }
         }
         
         if (input$repMode == "replicate_fixed_class") {
            # Mode B Redefinition
            agg <- aggregatedMatrixData()
            meta <- dynamic_metadata() %>% dplyr::filter(FullName %in% valid_cols)
            
            active_groups <- intersect(colnames(agg), unique(meta$Group))
            agg_subset <- agg[rownames(mat_display), active_groups, drop=FALSE]
            
            canonical_class_order <- names(current_class_colors)
            if(is.null(canonical_class_order) && exists("CLASS_MAP_COLORS")) canonical_class_order <- names(CLASS_MAP_COLORS)
            canonical_origin_order <- names(current_origin_colors)
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
      }
      
      validate(need(need_val <- nrow(mat_display) >= 2 && ncol(mat_display) >= 2, "Insufficient data matrix dimensions to render Filtered Heatmap. Verify selections."))
      
      cell_anno <- if(isTRUE(input$activateCellAnnotation)) cellAnnotationMapping_debounced() else NULL
      sort_cols_param <- input$staircaseGroup %||% "subclass"
      
      # Rename matrix columns for final plot if in replicate mode
      if (!grepl("aggregate", input$repMode)) {
         meta <- dynamic_metadata()
         new_names <- meta$Display_Name[match(colnames(mat_display), meta$FullName)]
         colnames(mat_display) <- new_names
         if (!is.null(mat_sort)) {
             colnames(mat_sort) <- meta$Display_Name[match(colnames(mat_sort), meta$FullName)]
         }
         # Align cell annotation names with renamed column names
         if (!is.null(cell_anno)) {
            matched_indices <- match(rownames(cell_anno$df), meta$FullName)
            valid_idx <- !is.na(matched_indices)
            if (any(valid_idx)) {
               df_subset <- cell_anno$df[valid_idx, , drop=FALSE]
               rownames(df_subset) <- meta$Display_Name[matched_indices[valid_idx]]
               common_cols <- intersect(colnames(mat_display), rownames(df_subset))
               cell_anno$df <- df_subset[common_cols, , drop=FALSE]
            } else {
               cell_anno <- NULL
            }
         }
      } else {
         # Align cell annotation names with aggregate group names
         if (!is.null(cell_anno)) {
            meta <- dynamic_metadata()
            meta$HardcodedGroup <- if("Group1" %in% names(meta) && "Group2" %in% names(meta)) {
               paste(meta$Group1, meta$Group2, sep="_")
            } else if ("Group1" %in% names(meta)) {
               meta$Group1
            } else {
               "All"
            }
            group_to_cell <- stats::setNames(cell_anno$df$Cell, rownames(cell_anno$df))
            meta$Cell <- group_to_cell[meta$HardcodedGroup]
            
            df_anno <- meta %>% 
               dplyr::select(Group, Cell) %>% 
               dplyr::distinct() %>% 
               dplyr::filter(!is.na(Group), Group %in% colnames(mat_display))
            
            if (nrow(df_anno) > 0) {
               df_anno <- df_anno %>% tibble::column_to_rownames("Group")
               common_cols <- intersect(colnames(mat_display), rownames(df_anno))
               cell_anno$df <- df_anno[common_cols, , drop=FALSE]
            } else {
               cell_anno <- NULL
            }
         }
      }

      curr_settings <- shared_data$de_settings()
      curr_l2fc <- if (!is.null(curr_settings$log2fc_threshold)) curr_settings$log2fc_threshold else 1
      curr_pval <- if (!is.null(curr_settings$p_threshold)) curr_settings$p_threshold else 0.05

      title_text <- if (isTRUE(input$condenseRows)) {
        condense_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Classes" else "Categories"
        sprintf("Filtered Heatmap - Class Average (%d %s | |L2FC| \u2265 %s, P < %s)", nrow(mat_display), condense_lbl, curr_l2fc, curr_pval)
      } else {
        sprintf("Filtered Heatmap (%d Lipids | |L2FC| \u2265 %s, P < %s)", nrow(mat_display), curr_l2fc, curr_pval)
      }

      heatmap_res <- generateHeatmapObject(mat_display, title_text, 
                            mat_for_sorting = mat_sort,
                            sort_mode = actual_sort_mode,
                            annotation_data = annotation_data_param,
                            cell_annotation = cell_anno,
                            show_grid = isTRUE(input$showHeatmapGrid), grid_color = input$heatmapGridColor,
                            hide_row_names = isTRUE(input$hideHeatmapRowNames),
                            display_mat = if(isTRUE(input$showHeatmapNumbers) || isTRUE(input$showHeatmapNumbers_sd_clone)) mat_display else NULL,
                            scale_mode = input$heatmapScaleMode, fine_tune = isTRUE(input$fineTuneColors),
                            colors_diverging = c(input$gz_low, input$gz_mid, input$gz_high),
                            colors_sequential = c(input$seq_low, input$seq_high),
                            class_colors = current_class_colors,
                            origin_colors = current_origin_colors,
                            annotation_cols = sort_cols_param)
                            
      validate(need(!is.null(heatmap_res), "Heatmap rendering failed internally. Check R console for logs."))
      
      return(heatmap_res)
    })
    
    unfilteredHeatmapSDObj <- reactive({
      req(input$repMode, input$heatmapScaleMode)
      if (!isTRUE(input$condenseRowsSD)) return(NULL)
      if(isTRUE(input$fineTuneColors)) {
        if(input$heatmapScaleMode == 'global_zscore') {
           req(input$gz_low, input$gz_mid, input$gz_high)
        } else {
           req(input$seq_low, input$seq_high)
        }
      }
      
      mat <- if(grepl("aggregate", input$repMode)) aggregatedMatrixData() else replicateMatrixData()
      req(mat)
      
      lipids <- shared_data$global_filtered_lipids()
      req(lipids)
      
      valid_cols <- setdiff(colnames(mat), rv_cols$hidden)
      if(length(valid_cols) == 0) return(NULL)
      
      mat_display <- mat[rownames(mat) %in% lipids, valid_cols, drop=FALSE]
      
      current_class_colors <- shared_data$class_color_map()
      current_origin_colors <- shared_data$origin_color_map()
      if (input$classLabelFormat == "full") {
        names(current_class_colors) <- get_full_class_name(names(current_class_colors))
        names(current_origin_colors) <- get_full_class_name(names(current_origin_colors))
      } else {
        names(current_class_colors) <- get_short_class_name(names(current_class_colors))
        names(current_origin_colors) <- get_short_class_name(names(current_origin_colors))
      }
      
      annotation_data_param <- shared_data$annotationData()
      if (input$classLabelFormat == "full") {
        annotation_data_param$subclass <- get_full_class_name(annotation_data_param$subclass)
        annotation_data_param$hyperclass <- get_full_class_name(annotation_data_param$hyperclass)
      } else {
        annotation_data_param$subclass <- get_short_class_name(annotation_data_param$subclass)
        annotation_data_param$hyperclass <- get_short_class_name(annotation_data_param$hyperclass)
      }
      
      condense_col <- input$staircaseGroup %||% "subclass"
      anno <- annotation_data_param
      anno_subset <- anno[match(rownames(mat_display), anno$Lipid_Name), , drop=FALSE]
      group_vector <- anno_subset[[condense_col]]
      
      valid_rows <- !is.na(group_vector) & group_vector != ""
      mat_display <- mat_display[valid_rows, , drop=FALSE]
      group_vector <- group_vector[valid_rows]
      
      if (nrow(mat_display) == 0) return(NULL)
      
      unique_grps <- unique(group_vector)
      sd_list <- lapply(unique_grps, function(grp) {
         sub_mat <- mat_display[group_vector == grp, , drop=FALSE]
         if (nrow(sub_mat) <= 1) {
            res <- rep(0, ncol(sub_mat))
            names(res) <- colnames(sub_mat)
            return(res)
         } else {
            res <- apply(sub_mat, 2, function(x) sd(x, na.rm = TRUE))
            res[is.na(res) | is.nan(res)] <- 0
            return(res)
         }
      })
      mat_display <- do.call(rbind, sd_list)
      rownames(mat_display) <- unique_grps
      
      row_order_source <- NULL
      if (isTRUE(input$customizeRowOrder %||% rv_ordering$customize_row_enabled) && !is.null(input$custom_row_order %||% rv_ordering$custom_row)) {
         row_order_source <- input$custom_row_order %||% rv_ordering$custom_row
         if (input$classLabelFormat == "full") {
            row_order_source <- get_full_class_name(row_order_source)
         } else {
            row_order_source <- get_short_class_name(row_order_source)
         }
      } else {
         row_order_source <- if (condense_col == "subclass") names(current_class_colors) else names(current_origin_colors)
      }
      
      if (!is.null(row_order_source)) {
         sorted_grps <- intersect(row_order_source, rownames(mat_display))
         extra_grps <- setdiff(rownames(mat_display), sorted_grps)
         mat_display <- mat_display[c(sorted_grps, extra_grps), , drop=FALSE]
      } else {
         mat_display <- mat_display[order(rownames(mat_display)), , drop=FALSE]
      }
      
      anno_uniq <- anno %>%
         dplyr::select(dplyr::all_of(c("subclass", "hyperclass"))) %>%
         dplyr::distinct() %>%
         dplyr::filter(!is.na(!!rlang::sym(condense_col)), !!rlang::sym(condense_col) != "") %>%
         dplyr::group_by(!!rlang::sym(condense_col)) %>%
         dplyr::slice(1) %>%
         dplyr::ungroup()
         
      condensed_anno <- tibble::tibble(
         Lipid_Name = anno_uniq[[condense_col]],
         subclass = anno_uniq$subclass,
         hyperclass = anno_uniq$hyperclass
      )
      
      annotation_data_param <- condensed_anno
      cell_anno <- if(isTRUE(input$activateCellAnnotation)) cellAnnotationMapping_debounced() else NULL
      sort_cols_param <- input$staircaseGroup %||% "subclass"
      
      if (!grepl("aggregate", input$repMode)) {
         meta <- dynamic_metadata()
         new_names <- meta$Display_Name[match(colnames(mat_display), meta$FullName)]
         colnames(mat_display) <- new_names
         if (!is.null(cell_anno)) {
            matched_indices <- match(rownames(cell_anno$df), meta$FullName)
            valid_idx <- !is.na(matched_indices)
            if (any(valid_idx)) {
               df_subset <- cell_anno$df[valid_idx, , drop=FALSE]
               rownames(df_subset) <- meta$Display_Name[matched_indices[valid_idx]]
               common_cols <- intersect(colnames(mat_display), rownames(df_subset))
               cell_anno$df <- df_subset[common_cols, , drop=FALSE]
            } else {
               cell_anno <- NULL
            }
         }
      } else {
         if (!is.null(cell_anno)) {
            meta <- dynamic_metadata()
            meta$HardcodedGroup <- if("Group1" %in% names(meta) && "Group2" %in% names(meta)) {
               paste(meta$Group1, meta$Group2, sep="_")
            } else if ("Group1" %in% names(meta)) {
               meta$Group1
            } else {
               "All"
            }
            group_to_cell <- stats::setNames(cell_anno$df$Cell, rownames(cell_anno$df))
            meta$Cell <- group_to_cell[meta$HardcodedGroup]
            
            df_anno <- meta %>% 
               dplyr::select(Group, Cell) %>% 
               dplyr::distinct() %>% 
               dplyr::filter(!is.na(Group), Group %in% colnames(mat_display))
            
            if (nrow(df_anno) > 0) {
               df_anno <- df_anno %>% tibble::column_to_rownames("Group")
               common_cols <- intersect(colnames(mat_display), rownames(df_anno))
               cell_anno$df <- df_anno[common_cols, , drop=FALSE]
            } else {
               cell_anno <- NULL
            }
         }
      }
      
      condense_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Classes" else "Categories"
      title_text <- sprintf("Unfiltered Heatmap - Class Standard Deviation (%d %s)", nrow(mat_display), condense_lbl)
      heatmap_res <- generateHeatmapObject(mat_display, title_text,  
                            mat_for_sorting = NULL,
                            sort_mode = "none", 
                            annotation_data = annotation_data_param,
                            cell_annotation = cell_anno,
                            show_grid = isTRUE(input$showHeatmapGrid), grid_color = input$heatmapGridColor,
                            hide_row_names = isTRUE(input$hideHeatmapRowNames),
                            display_mat = if(isTRUE(input$showHeatmapNumbers) || isTRUE(input$showHeatmapNumbers_sd_clone)) mat_display else NULL,
                            scale_mode = input$heatmapScaleMode, fine_tune = isTRUE(input$fineTuneColors),
                            colors_diverging = c(input$gz_low, input$gz_mid, input$gz_high),
                            colors_sequential = c(input$seq_low, input$seq_high),
                            class_colors = current_class_colors,
                            origin_colors = current_origin_colors,
                            annotation_cols = sort_cols_param)
                            
      validate(need(!is.null(heatmap_res), "SD Heatmap rendering failed internally."))
      return(heatmap_res)
    })

    filteredHeatmapSDObj <- reactive({
      req(input$repMode, input$heatmapScaleMode)
      if (!isTRUE(input$condenseRowsSD)) return(NULL)
      if(isTRUE(input$fineTuneColors)) {
        if(input$heatmapScaleMode == 'global_zscore') {
           req(input$gz_low, input$gz_mid, input$gz_high)
        } else {
           req(input$seq_low, input$seq_high)
        }
      }
      mat <- if(grepl("aggregate", input$repMode)) aggregatedMatrixData() else replicateMatrixData()
      req(mat)
      
      sig_lipids <- shared_data$significant_lipids()
      class_lipids <- shared_data$global_filtered_lipids()
      
      validate(need(!is.null(sig_lipids), "Please configure Differential Expression (Panel 3) in the Global Sidebar."))
      validate(need(length(sig_lipids) > 0, "No lipids passed significance filters."))
      final_lipids <- intersect(sig_lipids, class_lipids)
      validate(need(length(final_lipids) > 0, "No lipids passed BOTH significance and current class/chain filters."))
      
      valid_cols <- setdiff(colnames(mat), rv_cols$hidden)
      if(length(valid_cols) == 0) return(NULL)
      
      mat_display <- mat[rownames(mat) %in% final_lipids, valid_cols , drop=FALSE]
      
      current_class_colors <- shared_data$class_color_map()
      current_origin_colors <- shared_data$origin_color_map()
      if (input$classLabelFormat == "full") {
        names(current_class_colors) <- get_full_class_name(names(current_class_colors))
        names(current_origin_colors) <- get_full_class_name(names(current_origin_colors))
      } else {
        names(current_class_colors) <- get_short_class_name(names(current_class_colors))
        names(current_origin_colors) <- get_short_class_name(names(current_origin_colors))
      }
      
      annotation_data_param <- shared_data$annotationData()
      if (input$classLabelFormat == "full") {
        annotation_data_param$subclass <- get_full_class_name(annotation_data_param$subclass)
        annotation_data_param$hyperclass <- get_full_class_name(annotation_data_param$hyperclass)
      } else {
        annotation_data_param$subclass <- get_short_class_name(annotation_data_param$subclass)
        annotation_data_param$hyperclass <- get_short_class_name(annotation_data_param$hyperclass)
      }
      
      condense_col <- input$staircaseGroup %||% "subclass"
      anno <- annotation_data_param
      anno_subset <- anno[match(rownames(mat_display), anno$Lipid_Name), , drop=FALSE]
      group_vector <- anno_subset[[condense_col]]
      
      valid_rows <- !is.na(group_vector) & group_vector != ""
      mat_display <- mat_display[valid_rows, , drop=FALSE]
      group_vector <- group_vector[valid_rows]
      
      if (nrow(mat_display) == 0) return(NULL)
      
      unique_grps <- unique(group_vector)
      sd_list <- lapply(unique_grps, function(grp) {
         sub_mat <- mat_display[group_vector == grp, , drop=FALSE]
         if (nrow(sub_mat) <= 1) {
            res <- rep(0, ncol(sub_mat))
            names(res) <- colnames(sub_mat)
            return(res)
         } else {
            res <- apply(sub_mat, 2, function(x) sd(x, na.rm = TRUE))
            res[is.na(res) | is.nan(res)] <- 0
            return(res)
         }
      })
      mat_display <- do.call(rbind, sd_list)
      rownames(mat_display) <- unique_grps
      
      row_order_source <- NULL
      if (isTRUE(input$customizeRowOrder %||% rv_ordering$customize_row_enabled) && !is.null(input$custom_row_order %||% rv_ordering$custom_row)) {
         row_order_source <- input$custom_row_order %||% rv_ordering$custom_row
         if (input$classLabelFormat == "full") {
            row_order_source <- get_full_class_name(row_order_source)
         } else {
            row_order_source <- get_short_class_name(row_order_source)
         }
      } else {
         row_order_source <- if (condense_col == "subclass") names(current_class_colors) else names(current_origin_colors)
      }
      
      if (!is.null(row_order_source)) {
         sorted_grps <- intersect(row_order_source, rownames(mat_display))
         extra_grps <- setdiff(rownames(mat_display), sorted_grps)
         mat_display <- mat_display[c(sorted_grps, extra_grps), , drop=FALSE]
      } else {
         mat_display <- mat_display[order(rownames(mat_display)), , drop=FALSE]
      }
      
      anno_uniq <- anno %>%
         dplyr::select(dplyr::all_of(c("subclass", "hyperclass"))) %>%
         dplyr::distinct() %>%
         dplyr::filter(!is.na(!!rlang::sym(condense_col)), !!rlang::sym(condense_col) != "") %>%
         dplyr::group_by(!!rlang::sym(condense_col)) %>%
         dplyr::slice(1) %>%
         dplyr::ungroup()
         
      condensed_anno <- tibble::tibble(
         Lipid_Name = anno_uniq[[condense_col]],
         subclass = anno_uniq$subclass,
         hyperclass = anno_uniq$hyperclass
      )
      
      annotation_data_param <- condensed_anno
      cell_anno <- if(isTRUE(input$activateCellAnnotation)) cellAnnotationMapping_debounced() else NULL
      sort_cols_param <- input$staircaseGroup %||% "subclass"
      
      if (!grepl("aggregate", input$repMode)) {
         meta <- dynamic_metadata()
         new_names <- meta$Display_Name[match(colnames(mat_display), meta$FullName)]
         colnames(mat_display) <- new_names
         if (!is.null(cell_anno)) {
            matched_indices <- match(rownames(cell_anno$df), meta$FullName)
            valid_idx <- !is.na(matched_indices)
            if (any(valid_idx)) {
               df_subset <- cell_anno$df[valid_idx, , drop=FALSE]
               rownames(df_subset) <- meta$Display_Name[matched_indices[valid_idx]]
               common_cols <- intersect(colnames(mat_display), rownames(df_subset))
               cell_anno$df <- df_subset[common_cols, , drop=FALSE]
            } else {
               cell_anno <- NULL
            }
         }
      } else {
         if (!is.null(cell_anno)) {
            meta <- dynamic_metadata()
            meta$HardcodedGroup <- if("Group1" %in% names(meta) && "Group2" %in% names(meta)) {
               paste(meta$Group1, meta$Group2, sep="_")
            } else if ("Group1" %in% names(meta)) {
               meta$Group1
            } else {
               "All"
            }
            group_to_cell <- stats::setNames(cell_anno$df$Cell, rownames(cell_anno$df))
            meta$Cell <- group_to_cell[meta$HardcodedGroup]
            
            df_anno <- meta %>% 
               dplyr::select(Group, Cell) %>% 
               dplyr::distinct() %>% 
               dplyr::filter(!is.na(Group), Group %in% colnames(mat_display))
            
            if (nrow(df_anno) > 0) {
               df_anno <- df_anno %>% tibble::column_to_rownames("Group")
               common_cols <- intersect(colnames(mat_display), rownames(df_anno))
               cell_anno$df <- df_anno[common_cols, , drop=FALSE]
            } else {
               cell_anno <- NULL
            }
         }
      }
      
      curr_settings <- shared_data$de_settings()
      curr_l2fc <- if (!is.null(curr_settings$log2fc_threshold)) curr_settings$log2fc_threshold else 1
      curr_pval <- if (!is.null(curr_settings$p_threshold)) curr_settings$p_threshold else 0.05
      condense_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Classes" else "Categories"
      title_text <- sprintf("Filtered Heatmap - Class Standard Deviation (%d %s | |L2FC| \u2265 %s, P < %s)", nrow(mat_display), condense_lbl, curr_l2fc, curr_pval)
      heatmap_res <- generateHeatmapObject(mat_display, title_text,  
                            mat_for_sorting = NULL,
                            sort_mode = "none", 
                            annotation_data = annotation_data_param,
                            cell_annotation = cell_anno,
                            show_grid = isTRUE(input$showHeatmapGrid), grid_color = input$heatmapGridColor,
                            hide_row_names = isTRUE(input$hideHeatmapRowNames),
                            display_mat = if(isTRUE(input$showHeatmapNumbers) || isTRUE(input$showHeatmapNumbers_sd_clone)) mat_display else NULL,
                            scale_mode = input$heatmapScaleMode, fine_tune = isTRUE(input$fineTuneColors),
                            colors_diverging = c(input$gz_low, input$gz_mid, input$gz_high),
                            colors_sequential = c(input$seq_low, input$seq_high),
                            class_colors = current_class_colors,
                            origin_colors = current_origin_colors,
                            annotation_cols = sort_cols_param)
                            
      validate(need(!is.null(heatmap_res), "Filtered SD Heatmap rendering failed internally."))
      return(heatmap_res)
    })
    
    output$unfiltered_heatmap_container <- renderUI({
      show_avg <- isTRUE(input$condenseRows) || (!isTRUE(input$condenseRows) && !isTRUE(input$condenseRowsSD))
      show_sd <- isTRUE(input$condenseRowsSD)
      
      cards <- list()
      
      if (show_avg) {
         header_title <- if (isTRUE(input$condenseRows)) "Unfiltered Heatmap - Class Average" else "Unfiltered Heatmap"
         cards[[length(cards) + 1]] <- card(
            class = "mb-3 border-0 bg-light-subtle",
            card_header(
               class = "d-flex justify-content-between align-items-center",
               tags$div(
                  class = "d-flex align-items-center gap-2",
                  tags$strong(header_title, style = "font-size: 1.05rem; color: #1e293b; margin-right: 6px;"),
                  tags$span(class = "badge-summary-pill badge-unfiltered-pill",
                     textOutput(ns("unfiltered_summary_text"), inline = TRUE)
                  )
               ),
               tags$div(
                  class = "d-flex align-items-center gap-1",
                  downloadButton(ns("downloadHeatmapCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 4px;"),
                  downloadButton(ns("downloadHeatmapPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
               )
            ),
            card_body(
               uiOutput(ns("heatmap_fallback_alert")),
               uiOutput(ns("unfiltered_slate_density_ribbon")),
               plotOutput(ns("heatmapPlot"), height = "750px"),
               uiOutput(ns("heatmap_stat_note"))
            )
         )
      }
      
      if (show_sd) {
         cards[[length(cards) + 1]] <- card(
            class = "mb-3 border-0 bg-light-subtle",
            card_header(
               class = "d-flex justify-content-between align-items-center",
               tags$div(
                  tags$strong("Unfiltered Heatmap - Class Standard Deviation", style = "font-size: 1.05rem; color: #E28E2B; margin-right: 10px;"),
                  textOutput(ns("unfiltered_sd_summary_text"), inline = TRUE)
               ),
               tags$div(
                  downloadButton(ns("downloadHeatmapSDCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                  downloadButton(ns("downloadHeatmapSDPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
               )
            ),
            card_body(
               uiOutput(ns("heatmap_sd_fallback_alert")),
               plotOutput(ns("heatmapSDPlot"), height = "750px"),
               uiOutput(ns("heatmap_sd_stat_note"))
            )
         )
      }
      
      quick_access <- div(
        class = "quick-access-strip",
        tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
        tags$button(
          type = "button",
          class = "btn-quick-access",
          onclick = "window.pointToElement('#heatmap_barchart_tab-heatmapScaleMode', 'plot_controls', '2. Heatmap Settings', event);",
          title = "Switch between Global Z-score, Pattern Z-score, or Relative scaling",
          icon("sliders"), "Scaling Mode (Z / Rel)"
        ),
        tags$button(
          type = "button",
          class = "btn-quick-access",
          onclick = "window.pointToElement('#heatmap_barchart_tab-condenseRows', 'plot_controls', '2. Heatmap Settings', event);",
          title = "Toggle condensing lipid species into Class Averages or Standard Deviations",
          icon("layer-group"), "Class Averaging (Condense)"
        ),
        tags$button(
          type = "button",
          class = "btn-quick-access",
          onclick = "window.pointToElement('#heatmap_barchart_tab-repMode', 'plot_controls', '0. Sample Grouping & Nomenclature', event);",
          title = "Switch between Merged Samples (Group Average) and Single Replicates",
          icon("users-viewfinder"), "Sample Grouping Mode"
        ),
        tags$button(
          type = "button",
          class = "btn-quick-access",
          onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
          title = "Bottom Menu: Configure Naming Hierarchy, Group Ordering, and Custom Row Order below plot",
          icon("layer-group"), "Bottom Menu: Advanced Aesthetics"
        )
      )
      
      tagList(quick_access, cards)
    })

    output$filtered_heatmap_container <- renderUI({
      show_avg <- isTRUE(input$condenseRows) || (!isTRUE(input$condenseRows) && !isTRUE(input$condenseRowsSD))
      show_sd <- isTRUE(input$condenseRowsSD)
      
      cards <- list()
      
      if (show_avg) {
         header_title <- if (isTRUE(input$condenseRows)) "Filtered Heatmap - Class Average" else "Filtered Heatmap"
         cards[[length(cards) + 1]] <- card(
            class = "mb-3 border-0 bg-light-subtle",
            card_header(
               class = "d-flex justify-content-between align-items-center",
               tags$div(
                  class = "d-flex align-items-center gap-2",
                  tags$strong(header_title, style = "font-size: 1.05rem; color: #1e293b; margin-right: 6px;"),
                  tags$span(class = "badge-summary-pill badge-filtered-pill",
                     textOutput(ns("filtered_summary_text"), inline = TRUE)
                  ),
                  tags$span(class = "threshold-badge badge bg-light text-primary-emphasis border border-primary-subtle rounded-pill px-2.5 py-1 fw-semibold",
                     uiOutput(ns("filtered_threshold_badge"), inline = TRUE)
                  )
               ),
               tags$div(
                  class = "d-flex align-items-center gap-1",
                  downloadButton(ns("downloadFilteredHeatmapCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 4px;"),
                  downloadButton(ns("downloadFilteredHeatmapPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
               )
            ),
            card_body(
               uiOutput(ns("filtered_heatmap_fallback_alert")),
               uiOutput(ns("de_not_run_banner")),
               uiOutput(ns("filtered_slate_density_ribbon")),
               plotOutput(ns("filteredHeatmapPlot"), height = "750px"),
               uiOutput(ns("heatmap_stat_note_filtered"))
            )
         )
      }
      
      if (show_sd) {
         cards[[length(cards) + 1]] <- card(
            class = "mb-3 border-0 bg-light-subtle",
            card_header(
               class = "d-flex justify-content-between align-items-center",
               tags$div(
                  class = "d-flex align-items-center gap-2",
                  tags$strong("Filtered Heatmap - Class Standard Deviation", style = "font-size: 1.05rem; color: #E28E2B; margin-right: 6px;"),
                  tags$span(class = "badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2.5 py-1",
                     textOutput(ns("filtered_sd_summary_text"), inline = TRUE)
                  ),
                  tags$span(class = "threshold-badge badge bg-light text-secondary border border-secondary-subtle rounded-pill px-2.5 py-1 fw-semibold",
                     uiOutput(ns("filtered_threshold_badge"), inline = TRUE)
                  )
               ),
               tags$div(
                  downloadButton(ns("downloadFilteredHeatmapSDCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                  downloadButton(ns("downloadFilteredHeatmapSDPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
               )
            ),
            card_body(
               uiOutput(ns("filtered_heatmap_sd_fallback_alert")),
               uiOutput(ns("de_not_run_banner_sd")),
               plotOutput(ns("filteredHeatmapSDPlot"), height = "750px"),
               uiOutput(ns("heatmap_sd_stat_note_filtered"))
            )
         )
      }
      
      quick_access <- div(
        class = "quick-access-strip",
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
          onclick = "window.pointToElement('#dock_panel_cohorts', 'cohorts', '3. Differential Expression', event);",
          title = "Configure Differential Expression comparison cohorts in left dock",
          icon("sliders"), "DE & Cohort Settings"
        ),
        tags$button(
          type = "button",
          class = "btn-quick-access",
          onclick = "window.pointToElement('#heatmap_barchart_tab-heatmapScaleMode', 'plot_controls', '2. Heatmap Settings', event);",
          title = "Adjust Heatmap Scaling (Global Z, Pattern Z, Relative) & Palette",
          icon("palette"), "Heatmap Settings & Scaling"
        ),
        tags$button(
          type = "button",
          class = "btn-quick-access",
          onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
          title = "Bottom Menu: Configure Naming Hierarchy, Group Ordering, and Custom Row Order below plot",
          icon("layer-group"), "Bottom Menu: Advanced Aesthetics"
        )
      )
      
      tagList(quick_access, cards)
    })
    
    output$de_not_run_banner <- renderUI({
      render_de_not_run_banner(shared_data)
    })
    
    output$de_not_run_banner_sd <- renderUI({
      render_de_not_run_banner(shared_data)
    })
    
    output$filtered_slate_density_ribbon <- renderUI({
      # Suppress if Differential Expression has not been run or contrast info missing
      if (is.null(shared_data$de_results()) || is.null(shared_data$de_contrast_info())) {
        return(NULL)
      }
      
      # Suppress if rows are condensed into classes (~15-25 classes, labels never collide)
      if (isTRUE(input$condenseRows)) {
        return(NULL)
      }
      
      l <- shared_data$global_filtered_lipids()
      sig <- shared_data$significant_lipids()
      if (is.null(sig)) return(NULL)
      final_lipids <- intersect(l, sig)
      n_lipids <- length(final_lipids)
      
      # Only show when labels start crowding (N > 45 in 750px plot)
      if (n_lipids <= 45) {
        return(NULL)
      }
      
      curr_settings <- shared_data$de_settings()
      curr_l2fc <- if (!is.null(curr_settings$log2fc_threshold)) curr_settings$log2fc_threshold else 1
      curr_pval <- if (!is.null(curr_settings$p_threshold)) curr_settings$p_threshold else 0.05
      
      l2fc_input_id <- ns("inline_l2fc_cutoff")
      pval_input_id <- ns("inline_pval_cutoff")
      
      tags$div(
        class = "slate-density-ribbon mb-1 p-1 rounded-lg border shadow-xs bg-light-subtle",
        style = "border-color: #e2e8f0 !important;",
        tags$div(
          class = "bg-white border rounded px-3 py-1.5 d-flex flex-wrap align-items-center justify-content-between gap-2 shadow-xs",
          style = "border-color: #e2e8f0 !important; font-size: 0.82rem;",
          
          # Left: Icon + Associated Message + Cutoff Inputs
          tags$div(
            class = "d-flex flex-wrap align-items-center gap-2 text-secondary",
            tags$span(
              class = "d-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary",
              style = "width: 22px; height: 22px; font-size: 11px; flex-shrink: 0;",
              icon("sliders")
            ),
            tags$span(
              class = "text-secondary fw-medium",
              sprintf("Important output (%d rows): narrow down rows by adjusting ", n_lipids),
              tags$strong(class = "text-dark", "|Log2FC|"),
              " or ",
              tags$strong(class = "text-dark", "P-value"),
              " thresholds:"
            ),
            # |Log2FC| input
            tags$label(
              `for` = l2fc_input_id,
              class = "d-flex align-items-center gap-1 mb-0 fw-semibold text-secondary ms-1",
              style = "font-size: 0.80rem; white-space: nowrap;",
              "|L2FC| \u2265",
              tags$input(
                id = l2fc_input_id,
                type = "number",
                class = "form-control form-control-sm text-center px-1 py-0 bg-light-subtle",
                style = "width: 58px; height: 26px; font-weight: 700; font-size: 0.82rem; border: 1px solid #cbd5e1;",
                value = curr_l2fc,
                step = "0.1",
                min = "0",
                oninput = "window.syncCutoffFromBanner('log2fc', this.value);",
                onkeydown = sprintf("if(event.key==='Enter'){event.preventDefault();window.applyInlineCutoffs('%s', '%s');}", l2fc_input_id, pval_input_id)
              )
            ),
            # P-value input
            tags$label(
              `for` = pval_input_id,
              class = "d-flex align-items-center gap-1 mb-0 fw-semibold text-secondary",
              style = "font-size: 0.80rem; white-space: nowrap;",
              "P <",
              tags$input(
                id = pval_input_id,
                type = "number",
                class = "form-control form-control-sm text-center px-1 py-0 bg-light-subtle",
                style = "width: 58px; height: 26px; font-weight: 700; font-size: 0.82rem; border: 1px solid #cbd5e1;",
                value = curr_pval,
                step = "0.01",
                min = "0",
                max = "1",
                oninput = "window.syncCutoffFromBanner('pval', this.value);",
                onkeydown = sprintf("if(event.key==='Enter'){event.preventDefault();window.applyInlineCutoffs('%s', '%s');}", l2fc_input_id, pval_input_id)
              )
            ),
            # Apply Button
            tags$button(
              type = "button",
              class = "btn btn-sm btn-primary py-0 px-2 shadow-xs",
              style = "height: 26px; font-size: 0.78rem; font-weight: 600;",
              onclick = sprintf("window.applyInlineCutoffs('%s', '%s');", l2fc_input_id, pval_input_id),
              title = "Apply new |Log2FC| and P-value cutoffs immediately",
              "Apply"
            )
          ),
          
          # Right: Action Buttons
          tags$div(
            class = "d-flex align-items-center gap-2",
            tags$button(
              type = "button",
              class = "btn btn-sm btn-outline-secondary py-0 px-2 d-flex align-items-center gap-1 btn-point-de-menu shadow-xs bg-light-subtle",
              style = "height: 26px; font-size: 0.78rem; font-weight: 600;",
              onclick = "window.pointToCutoffsMenu(event);",
              title = "Open Differential Expression settings in the sidebar dock and highlight threshold inputs",
              icon("arrow-pointer", class = "text-primary", style = "font-size: 0.72rem;"),
              "Show in menu"
            ),
            tags$span(class = "text-muted", "|"),
            tags$button(
              type = "button",
              class = "btn btn-sm btn-light border py-0 px-2 d-flex align-items-center gap-1 text-secondary",
              style = "height: 26px; font-size: 0.78rem;",
              onclick = sprintf("var el = document.getElementById('%s'); if(el){ el.checked = true; $(el).trigger('change'); }", ns("condenseRows")),
              title = "Condense individual lipid species into class averages to eliminate overlapping labels",
              icon("layer-group", style = "font-size: 0.72rem;"),
              "Class Average"
            )
          )
        )
      )
    })
    
    output$unfiltered_slate_density_ribbon <- renderUI({
      if (isTRUE(input$condenseRows)) {
        return(NULL)
      }
      
      l <- shared_data$global_filtered_lipids()
      req(l)
      n_lipids <- length(l)
      if (n_lipids <= 45) {
        return(NULL)
      }
      
      tags$div(
        class = "slate-density-ribbon mb-1 p-1 rounded-lg border shadow-xs bg-light-subtle",
        style = "border-color: #e2e8f0 !important;",
        tags$div(
          class = "bg-white border rounded px-3 py-1.5 d-flex flex-wrap align-items-center justify-content-between gap-2 shadow-xs",
          style = "border-color: #e2e8f0 !important; font-size: 0.82rem;",
          
          # Left: Icon + Message
          tags$div(
            class = "d-flex align-items-center gap-2 text-secondary",
            tags$span(
              class = "d-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary",
              style = "width: 22px; height: 22px; font-size: 11px; flex-shrink: 0;",
              icon("arrow-right-arrow-left")
            ),
            tags$span(
              class = "text-secondary",
              sprintf("Important output (%d rows): high row count in unfiltered view \u2014 switch to ", n_lipids),
              tags$a(
                href = "#",
                class = "fw-semibold text-primary text-decoration-none",
                onclick = "$('#tertiary_subsubtab_bar .subsubtab-pill[data-target=\"Filtered Heatmap\"]').click(); if(!$('#tertiary_subsubtab_bar .subsubtab-pill[data-target=\"Filtered Heatmap\"]').length) { $('#heatmap_barchart_tab-heatmap_tabs a[data-value=\"Filtered Heatmap\"]').click(); } return false;",
                "differential expression analysis"
              ),
              " to focus on statistically significant lipids."
            )
          ),
          
          # Right: Action Buttons
          tags$div(
            class = "d-flex align-items-center gap-1.5",
            tags$button(
              type = "button",
              class = "btn btn-sm btn-primary py-0 px-2.5 d-flex align-items-center gap-1 shadow-xs",
              style = "height: 26px; font-size: 0.78rem; font-weight: 600;",
              onclick = "$('#tertiary_subsubtab_bar .subsubtab-pill[data-target=\"Filtered Heatmap\"]').click(); if(!$('#tertiary_subsubtab_bar .subsubtab-pill[data-target=\"Filtered Heatmap\"]').length) { $('#heatmap_barchart_tab-heatmap_tabs a[data-value=\"Filtered Heatmap\"]').click(); }",
              title = "Switch to Filtered Heatmap (uses |Log2FC| & P-value filters)",
              icon("filter", style = "font-size: 0.72rem;"),
              "Switch to Filtered Heatmap"
            ),
            tags$button(
              type = "button",
              class = "btn btn-sm btn-outline-secondary py-0 px-2 d-flex align-items-center gap-1",
              style = "height: 26px; font-size: 0.78rem;",
              onclick = sprintf("var el = document.getElementById('%s'); if(el){ el.checked = true; $(el).trigger('change'); }", ns("condenseRows")),
              title = "Condense individual lipid species into class averages",
              icon("layer-group", style = "font-size: 0.72rem;"),
              "Class Average"
            )
          )
        )
      )
    })
    
    # Fallback alert banners when targeted cohort is insufficient for Heatmap rendering
    output$heatmap_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(heatmap_fallback_active())) })
    output$heatmap_sd_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(heatmap_fallback_active())) })
    output$filtered_heatmap_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(filtered_heatmap_fallback_active())) })
    output$filtered_heatmap_sd_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(filtered_heatmap_fallback_active())) })

    output$heatmapPlot <- renderPlot({ 
      obj <- unfilteredHeatmapObj(); req(obj)
      grid::grid.newpage(); grid::grid.draw(obj$ht$gtable) 
    })
    
    output$heatmapSDPlot <- renderPlot({
      obj <- unfilteredHeatmapSDObj(); req(obj)
      grid::grid.newpage(); grid::grid.draw(obj$ht$gtable)
    })
    
    output$filteredHeatmapPlot <- renderPlot({ 
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      obj <- filteredHeatmapObj(); req(obj)
      grid::grid.newpage(); grid::grid.draw(obj$ht$gtable) 
    })

    output$filteredHeatmapSDPlot <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      obj <- filteredHeatmapSDObj(); req(obj)
      grid::grid.newpage(); grid::grid.draw(obj$ht$gtable)
    })
    
    output$unfiltered_sd_summary_text <- renderText({
       obj <- tryCatch(unfilteredHeatmapSDObj(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
       if (is.null(obj) || is.null(obj$data)) return("Class Standard Deviation Not Active")
       condense_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Lipid Main Classes" else "Lipid Categories"
       paste("Displaying", nrow(obj$data), condense_lbl, "(Unfiltered Intra-Class Standard Deviation)")
    })

    output$filtered_sd_summary_text <- renderText({
       obj <- tryCatch(filteredHeatmapSDObj(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
       if (is.null(obj) || is.null(obj$data)) return("Class Standard Deviation Not Active / Differential Expression Analysis Not Run")
       condense_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Lipid Main Classes" else "Lipid Categories"
       paste("Displaying", nrow(obj$data), condense_lbl, "(DE Filtered Intra-Class Standard Deviation)")
    })
    
    build_heatmap_journal_note <- function(note_type, is_filtered = FALSE) {
      show_num <- isTRUE(input$showHeatmapNumbers) || isTRUE(input$showHeatmapNumbers_sd_clone)
      is_condense_avg <- isTRUE(input$condenseRows)
      rep_mode <- input$repMode %||% "aggregate_class"
      is_merged <- grepl("aggregate", rep_mode)
      
      border_color <- if (note_type == "sd") "#E28E2B" else "#0072B2"
      
      caption_text <- if (note_type == "sd") {
        # Scenario 1: Class Standard Deviation
        if (show_num) {
          paste0("Hierarchical clustering of condensed lipid class standard deviations across samples. Numeric cell labels display the intra-class standard deviation (dispersion) calculated among constituent lipid species for each sample column j: ",
                 "SD_{C, j} = sqrt((1 / (N - 1)) * sum_{i=1}^N (x_{s_i, j} - bar{x}_{C, j})^2) [for N > 1], or SD_{C, j} = 0 [for N = 1].")
        } else {
          "Hierarchical clustering of condensed lipid class standard deviations across samples. Color gradient intensity corresponds to intra-class standard deviation (dispersion) calculated among constituent lipid species. (Numeric cell labels hidden)."
        }
      } else if (is_condense_avg) {
        # Scenario 2: Condensed Class Average
        if (show_num) {
          paste0("Hierarchical clustering of condensed lipid class averages across samples. Numeric cell labels display the arithmetic mean relative abundance calculated among constituent lipid species within each parent class for each sample column j: ",
                 "bar{x}_{C, j} = (1 / N) * sum_{i=1}^N x_{s_i, j}.")
        } else {
          "Hierarchical clustering of condensed lipid class averages across samples. Color gradient intensity represents arithmetic mean lipid class abundances across samples. (Numeric cell labels hidden)."
        }
      } else if (is_merged) {
        # Scenario 4: Uncondensed Merged Groups
        if (show_num) {
          paste0("Hierarchical clustering of individual lipid species across merged condition groups. Numeric cell labels display group mean relative abundance values averaged across replicate samples for each condition group g: ",
                 "bar{x}_{i, g} = (1 / M_g) * sum_{k=1}^{M_g} x_{i, k}.")
        } else {
          "Hierarchical clustering of individual lipid species across merged condition groups. Color gradient intensity represents group mean relative abundance values averaged across replicate samples. (Numeric cell labels hidden)."
        }
      } else {
        # Scenario 3: Uncondensed Single Samples
        if (show_num) {
          paste0("Hierarchical clustering of individual lipid species across single sample columns. Numeric cell labels display raw or Z-score normalized relative abundance values for each individual lipid species in each sample column j: ",
                 "Z_{i, j} = (x_{i, j} - mu_i) / sigma_i (or relative 0-100 scaling).")
        } else {
          "Hierarchical clustering of individual lipid species across single sample columns. Color gradient intensity represents raw or Z-score normalized relative abundance values across individual sample columns. (Numeric cell labels hidden)."
        }
      }
      
      if (is_filtered) {
        caption_text <- gsub("across samples", "calculated strictly for differentially abundant (significant) features across samples", caption_text)
        caption_text <- gsub("across single sample columns", "for differentially abundant (significant) features across single sample columns", caption_text)
        caption_text <- gsub("across merged condition groups", "for differentially abundant (significant) features across merged condition groups", caption_text)
      }
      
      tags$div(
        style = paste0("font-size: 0.82rem; color: #495057; background-color: #f8f9fa; border-left: 3px solid ", border_color, "; padding: 8px 12px; margin-top: 10px; border-radius: 4px;"),
        caption_text
      )
    }

    output$heatmap_sd_stat_note <- renderUI({
      build_heatmap_journal_note("sd", is_filtered = FALSE)
    })

    output$heatmap_sd_stat_note_filtered <- renderUI({
      build_heatmap_journal_note("sd", is_filtered = TRUE)
    })

    output$downloadHeatmapSDPDF <- downloadHandler(
      filename = function() { paste0("Unfiltered_Heatmap_SD_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          obj <- unfilteredHeatmapSDObj()
          req(obj)
          w <- plot_dims$unfiltered_sd$width %||% 800
          h <- plot_dims$unfiltered_sd$height %||% 600
          w_in <- w / 72
          h_in <- h / 72
          pdf(file, width = w_in, height = h_in)
          grid::grid.draw(obj$ht$gtable)
          dev.off()
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in SD Heatmap PDF generation:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )

    output$downloadHeatmapSDCSV <- downloadHandler(
      filename = function() { paste0("Unfiltered_Heatmap_SD_Variance_Data_", format(Sys.Date(), "%Y%m%d"), ".csv") },
      content = function(file) {
        sd_obj <- unfilteredHeatmapSDObj()
        mean_obj <- unfilteredHeatmapObj()
        req(sd_obj, mean_obj)
        if (is.null(sd_obj$data) || is.null(mean_obj$data)) return(NULL)
        row_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Lipid_Main_Class" else "Lipid_Category"
        
        df_mean <- as.data.frame(mean_obj$data)
        colnames(df_mean) <- paste0(colnames(df_mean), "_Mean")
        
        df_sd <- as.data.frame(round(sd_obj$data, 4))
        colnames(df_sd) <- paste0(colnames(df_sd), "_SD")
        
        df_var <- as.data.frame(round(sd_obj$data^2, 4))
        colnames(df_var) <- paste0(colnames(df_var), "_Variance")
        
        out_df <- cbind(df_mean, df_var, df_sd) %>% tibble::rownames_to_column(row_lbl)
        write.csv(out_df, file, row.names = FALSE)
      }
    )

    output$downloadFilteredHeatmapSDPDF <- downloadHandler(
      filename = function() { paste0("Filtered_Heatmap_SD_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          obj <- filteredHeatmapSDObj()
          req(obj)
          w <- plot_dims$filtered_sd$width %||% 800
          h <- plot_dims$filtered_sd$height %||% 600
          w_in <- w / 72
          h_in <- h / 72
          pdf(file, width = w_in, height = h_in)
          grid::grid.draw(obj$ht$gtable)
          dev.off()
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in Filtered SD Heatmap PDF generation:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )

    output$downloadFilteredHeatmapSDCSV <- downloadHandler(
      filename = function() { paste0("Filtered_Heatmap_SD_Variance_Data_", format(Sys.Date(), "%Y%m%d"), ".csv") },
      content = function(file) {
        sd_obj <- filteredHeatmapSDObj()
        mean_obj <- filteredHeatmapObj()
        req(sd_obj, mean_obj)
        if (is.null(sd_obj$data) || is.null(mean_obj$data)) return(NULL)
        row_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Lipid_Main_Class" else "Lipid_Category"
        
        df_mean <- as.data.frame(mean_obj$data)
        colnames(df_mean) <- paste0(colnames(df_mean), "_Mean")
        
        df_sd <- as.data.frame(round(sd_obj$data, 4))
        colnames(df_sd) <- paste0(colnames(df_sd), "_SD")
        
        df_var <- as.data.frame(round(sd_obj$data^2, 4))
        colnames(df_var) <- paste0(colnames(df_var), "_Variance")
        
        out_df <- cbind(df_mean, df_var, df_sd) %>% tibble::rownames_to_column(row_lbl)
        write.csv(out_df, file, row.names = FALSE)
      }
    )

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
       if(is.null(l)) return("No Lipids Selected")
       if (isTRUE(input$condenseRows)) {
          condense_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Lipid Main Classes" else "Lipid Categories"
          anno <- shared_data$annotationData()
          if (!is.null(anno)) {
             unique_c <- unique(anno[[input$staircaseGroup %||% "subclass"]][anno$Lipid_Name %in% l])
             unique_c <- unique_c[!is.na(unique_c) & unique_c != ""]
             return(paste("Displaying", length(unique_c), condense_lbl, "(Unfiltered Condensed)"))
          }
       }
       paste("Displaying", length(l), "Lipids (Unfiltered)")
    })
    
    output$filtered_summary_text <- renderText({
       l <- shared_data$global_filtered_lipids()
       sig <- shared_data$significant_lipids()
       if(is.null(sig)) return("Differential Expression Analysis Not Run")
       final <- intersect(l, sig)
       if (isTRUE(input$condenseRows)) {
          condense_lbl <- if ((input$staircaseGroup %||% "subclass") == "subclass") "Lipid Main Classes" else "Lipid Categories"
          anno <- shared_data$annotationData()
          if (!is.null(anno)) {
             unique_c <- unique(anno[[input$staircaseGroup %||% "subclass"]][anno$Lipid_Name %in% final])
             unique_c <- unique_c[!is.na(unique_c) & unique_c != ""]
             return(paste("Displaying", length(unique_c), condense_lbl, "(DE Filtered Condensed)"))
          }
       }
       paste("Displaying", length(final), "Lipids (DE Filtered)")
    })

    output$filtered_threshold_badge <- renderUI({
      curr_settings <- shared_data$de_settings()
      curr_l2fc <- if (!is.null(curr_settings$log2fc_threshold)) curr_settings$log2fc_threshold else 1
      curr_pval <- if (!is.null(curr_settings$p_threshold)) curr_settings$p_threshold else 0.05
      HTML(sprintf("|L2FC| &ge; %s &middot; P &lt; %s", curr_l2fc, curr_pval))
    })
    
    output$downloadHeatmapPDF <- downloadHandler(
      filename = function() { paste0("Unfiltered_Heatmap_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          obj <- unfilteredHeatmapObj()
          req(obj)
          
          w <- session$clientData[[paste0("output_", session$ns("heatmapPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("heatmapPlot"), "_height")]]
          if (!is.null(input$heatmapPlot_size)) {
              w <- input$heatmapPlot_size$width
              h <- input$heatmapPlot_size$height
          }
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
      filename = function() { 
         type_str <- if (isTRUE(input$condenseRows)) "Condensed_Mean_Variance_" else ""
         ext <- if (requireNamespace("openxlsx", quietly = TRUE) || requireNamespace("writexl", quietly = TRUE)) ".xlsx" else ".csv"
         paste0("Unfiltered_Heatmap_", type_str, "Data_", format(Sys.Date(), "%Y%m%d"), ext) 
      },
      content = function(file) {
        obj <- unfilteredHeatmapObj()
        req(obj)
        row_lbl <- if (isTRUE(input$condenseRows)) {
           if ((input$staircaseGroup %||% "subclass") == "subclass") "Lipid_Main_Class" else "Lipid_Category"
        } else {
           "Lipid_Name"
        }
        
        if (isTRUE(input$condenseRows)) {
           sd_obj <- tryCatch(unfilteredHeatmapSDObj(), error = function(e) NULL)
           df_mean <- as.data.frame(obj$data)
           colnames(df_mean) <- paste0(colnames(df_mean), "_Mean")
           
           df_sd <- if (!is.null(sd_obj) && !is.null(sd_obj$data)) as.data.frame(round(sd_obj$data, 4)) else NULL
           if (!is.null(df_sd)) colnames(df_sd) <- paste0(colnames(df_sd), "_SD")
           
           df_var <- if (!is.null(sd_obj) && !is.null(sd_obj$data)) as.data.frame(round(sd_obj$data^2, 4)) else NULL
           if (!is.null(df_var)) colnames(df_var) <- paste0(colnames(df_var), "_Variance")
           
           if (requireNamespace("openxlsx", quietly = TRUE)) {
              wb <- openxlsx::createWorkbook()
              openxlsx::addWorksheet(wb, "Condensed_Means")
              openxlsx::writeData(wb, "Condensed_Means", df_mean %>% tibble::rownames_to_column(row_lbl))
              
              if (!is.null(df_var)) {
                 openxlsx::addWorksheet(wb, "Condensed_Variances")
                 openxlsx::writeData(wb, "Condensed_Variances", df_var %>% tibble::rownames_to_column(row_lbl))
              }
              if (!is.null(df_sd)) {
                 openxlsx::addWorksheet(wb, "Condensed_SD")
                 openxlsx::writeData(wb, "Condensed_SD", df_sd %>% tibble::rownames_to_column(row_lbl))
              }
              
              openxlsx::saveWorkbook(wb, file, overwrite = TRUE)
           } else if (requireNamespace("writexl", quietly = TRUE)) {
              sheets <- list("Condensed_Means" = df_mean %>% tibble::rownames_to_column(row_lbl))
              if (!is.null(df_var)) sheets[["Condensed_Variances"]] <- df_var %>% tibble::rownames_to_column(row_lbl)
              if (!is.null(df_sd)) sheets[["Condensed_SD"]] <- df_sd %>% tibble::rownames_to_column(row_lbl)
              writexl::write_xlsx(sheets, file)
           } else {
              out_df <- if (!is.null(df_var) && !is.null(df_sd)) cbind(df_mean, df_var, df_sd) else df_mean
              out_df <- out_df %>% tibble::rownames_to_column(row_lbl)
              write.csv(out_df, file, row.names = FALSE)
           }
        } else {
           out_df <- as.data.frame(obj$data) %>% tibble::rownames_to_column(row_lbl)
           write.csv(out_df, file, row.names = FALSE)
        }
      }
    )
    
    output$downloadFilteredHeatmapPDF <- downloadHandler(
      filename = function() { paste0("Filtered_Heatmap_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          obj <- filteredHeatmapObj()
          req(obj)
          if(is.null(obj$ht$gtable)) return(NULL)
          
          w <- session$clientData[[paste0("output_", session$ns("filteredHeatmapPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("filteredHeatmapPlot"), "_height")]]
          if (!is.null(input$filteredHeatmapPlot_size)) {
              w <- input$filteredHeatmapPlot_size$width
              h <- input$filteredHeatmapPlot_size$height
          }
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
      filename = function() { 
         type_str <- if (isTRUE(input$condenseRows)) "Condensed_Mean_Variance_" else ""
         ext <- if (requireNamespace("openxlsx", quietly = TRUE) || requireNamespace("writexl", quietly = TRUE)) ".xlsx" else ".csv"
         paste0("Filtered_Heatmap_", type_str, "Data_", format(Sys.Date(), "%Y%m%d"), ext) 
      },
      content = function(file) {
        obj <- filteredHeatmapObj()
        req(obj)
        if(is.null(obj$data)) return(NULL)
        
        row_lbl <- if (isTRUE(input$condenseRows)) {
           if ((input$staircaseGroup %||% "subclass") == "subclass") "Lipid_Main_Class" else "Lipid_Category"
        } else {
           "Lipid_Name"
        }
        
        if (isTRUE(input$condenseRows)) {
           sd_obj <- tryCatch(filteredHeatmapSDObj(), error = function(e) NULL)
           df_mean <- as.data.frame(obj$data)
           colnames(df_mean) <- paste0(colnames(df_mean), "_Mean")
           
           df_sd <- if (!is.null(sd_obj) && !is.null(sd_obj$data)) as.data.frame(round(sd_obj$data, 4)) else NULL
           if (!is.null(df_sd)) colnames(df_sd) <- paste0(colnames(df_sd), "_SD")
           
           df_var <- if (!is.null(sd_obj) && !is.null(sd_obj$data)) as.data.frame(round(sd_obj$data^2, 4)) else NULL
           if (!is.null(df_var)) colnames(df_var) <- paste0(colnames(df_var), "_Variance")
           
           if (requireNamespace("openxlsx", quietly = TRUE)) {
              wb <- openxlsx::createWorkbook()
              openxlsx::addWorksheet(wb, "Filtered_Condensed_Means")
              openxlsx::writeData(wb, "Filtered_Condensed_Means", df_mean %>% tibble::rownames_to_column(row_lbl))
              
              if (!is.null(df_var)) {
                 openxlsx::addWorksheet(wb, "Filtered_Condensed_Variances")
                 openxlsx::writeData(wb, "Filtered_Condensed_Variances", df_var %>% tibble::rownames_to_column(row_lbl))
              }
              if (!is.null(df_sd)) {
                 openxlsx::addWorksheet(wb, "Filtered_Condensed_SD")
                 openxlsx::writeData(wb, "Filtered_Condensed_SD", df_sd %>% tibble::rownames_to_column(row_lbl))
              }
              
              openxlsx::saveWorkbook(wb, file, overwrite = TRUE)
           } else if (requireNamespace("writexl", quietly = TRUE)) {
              sheets <- list("Filtered_Condensed_Means" = df_mean %>% tibble::rownames_to_column(row_lbl))
              if (!is.null(df_var)) sheets[["Filtered_Condensed_Variances"]] <- df_var %>% tibble::rownames_to_column(row_lbl)
              if (!is.null(df_sd)) sheets[["Filtered_Condensed_SD"]] <- df_sd %>% tibble::rownames_to_column(row_lbl)
              writexl::write_xlsx(sheets, file)
           } else {
              out_df <- if (!is.null(df_var) && !is.null(df_sd)) cbind(df_mean, df_var, df_sd) else df_mean
              out_df <- out_df %>% tibble::rownames_to_column(row_lbl)
              write.csv(out_df, file, row.names = FALSE)
           }
        } else {
           out_df <- as.data.frame(obj$data) %>% tibble::rownames_to_column(row_lbl)
           write.csv(out_df, file, row.names = FALSE)
        }
      }
    )
    
    output$heatmap_stat_note <- renderUI({
      build_heatmap_journal_note("main", is_filtered = FALSE)
    })
    output$heatmap_stat_note_filtered <- renderUI({
      build_heatmap_journal_note("main", is_filtered = TRUE)
    })
    
  # --- Debug Export ---
    generateHeatmapStatsMsg <- reactive({
      u_obj <- tryCatch(unfilteredHeatmapObj(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
      u_sd_obj <- tryCatch(unfilteredHeatmapSDObj(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
      f_obj <- tryCatch(filteredHeatmapObj(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
      f_sd_obj <- tryCatch(filteredHeatmapSDObj(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
      de_sett <- tryCatch(shared_data$de_settings(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
      
      n_feat_u <- if (!is.null(u_obj) && !is.null(u_obj$data)) nrow(u_obj$data) else 0
      n_col_u <- if (!is.null(u_obj) && !is.null(u_obj$data)) ncol(u_obj$data) else 0
      n_feat_f <- if (!is.null(f_obj) && !is.null(f_obj$data)) nrow(f_obj$data) else 0
      n_col_f <- if (!is.null(f_obj) && !is.null(f_obj$data)) ncol(f_obj$data) else 0
      
      actual_method <- tryCatch(shared_data$actual_de_method(), shiny.silent.error = function(e) "Not configured", error = function(e) "Not configured")
      base_method <- if (!is.null(actual_method)) gsub("^auto_", "", actual_method) else "Not configured"
      
      p_type <- if (!is.null(de_sett) && !is.null(de_sett$p_value_type)) de_sett$p_value_type else "P"
      p_thresh <- if (!is.null(de_sett) && !is.null(de_sett$p_threshold)) de_sett$p_threshold else 0.05
      fc_thresh <- if (!is.null(de_sett) && !is.null(de_sett$log2fc_threshold)) de_sett$log2fc_threshold else 1.0
      
      tab_sel <- input$heatmap_tabs %||% "Unfiltered Heatmap"
      if (identical(tab_sel, "Violin View")) {
         target_lipids <- get_active_violin_lipids()
         base_ref <- input$violin_baseline_group_header %||% input$violin_baseline_group %||% "Control"
         sig_thresh <- as.numeric(input$violin_sig_threshold %||% 0.05)
         scale_lbl <- if (isTRUE(input$violin_scale_mode == "linear")) "Linear Abundance Intensity" else "Log2 Abundance Intensity"
         rep_mode_lbl <- input$violin_sample_mode %||% "group_distribution"
         
         msg <- paste0(
            "==================================================\n",
            "STATISTICAL REPORT: VIOLIN VIEW OUTPUT\n",
            "==================================================\n",
            "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
            "1. VIOLIN VIEW CONFIGURATION & SCOPE\n",
            "   - Selection Scope:          ", input$violin_selection_scope %||% "current_view", "\n",
            "   - Representation Mode:      ", rep_mode_lbl, "\n",
            "   - Active Target Lipids:     ", length(target_lipids), " species/features\n",
            "   - Baseline Reference Group: ", base_ref, "\n",
            "   - Measurement Scale:        ", scale_lbl, "\n",
            "   - Significance Threshold:   p <= ", sig_thresh, "\n",
            "   - Significance Format:      ", input$violin_sig_display_type %||% "star", "\n\n",
            "2. STATISTICAL METHODOLOGY & MATHEMATICAL FORMULATION\n",
            "   - Two-Sample Welch's t-test (Unequal Variance):\n",
            "     For each non-baseline group G compared against baseline group B (ref = '", base_ref, "'):\n",
            "     1. Sample Means:      x_bar_G = mean(X_G),   x_bar_B = mean(X_B)\n",
            "     2. Sample Variances:  s_G^2 = var(X_G),     s_B^2 = var(X_B)\n",
            "     3. Welch's t-statistic:\n",
            "          t = (x_bar_G - x_bar_B) / sqrt( (s_G^2 / n_G) + (s_B^2 / n_B) )\n",
            "     4. Degrees of Freedom (Welch-Satterthwaite equation):\n",
            "          df = ( (s_G^2 / n_G) + (s_B^2 / n_B) )^2 / [ (s_G^2 / n_G)^2 / (n_G - 1) + (s_B^2 / n_B)^2 / (n_B - 1) ]\n",
            "     5. Two-tailed p-value computed from Student's t-distribution with df degrees of freedom.\n\n",
            "3. SIGNIFICANCE STAR CUTOFFS\n",
            "   - ***  p <= ", sig_thresh / 50, " (p <= alpha / 50)\n",
            "   - **   p <= ", sig_thresh / 5, "  (p <= alpha / 5)\n",
            "   - *    p <= ", sig_thresh, "  (p <= alpha)\n",
            "   - ns   p >  ", sig_thresh, "  (Not Significant)\n",
            "==================================================\n"
         )
         return(paste0(msg, "\n", get_stats_console_method_summary(shared_data)))
      }
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: HIERARCHICAL CLUSTERING HEATMAP\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. CLUSTERING PARAMETERS (Unfiltered Heatmap)\n",
        "   - Distance Metric:      Euclidean distance\n",
        "   - Clustering Linkage:   Complete linkage\n",
        "   - Grouping Mode:        ", input$repMode, "\n",
        "   - Scaling Mode:         ", input$heatmapScaleMode, "\n",
        "   - Condense Rows (Class Average): ", ifelse(isTRUE(input$condenseRows), "Yes", "No"), "\n",
        "   - Condense Rows (Class Standard Deviation): ", ifelse(isTRUE(input$condenseRowsSD), "Yes", "No"), "\n",
        "   - Row Grouping Level:   ", input$staircaseGroup, "\n",
        "   - Clustered Features:   ", n_feat_u, " features\n",
        "   - Clustered Columns:    ", n_col_u, " samples/groups\n\n",
        "2. MATHEMATICAL FORMULATION & CALCULUS EXAMPLE\n",
        "   - Z-score Normalization (Row-wise scaling):\n",
        "     For each lipid species 'i' with abundance values [x_i1, ..., x_iN] across the N = ", n_col_u, " columns:\n",
        "     1. Calculate the mean abundance across all samples:\n",
        "          mu_i = (1 / ", n_col_u, ") * sum_{j=1}^{", n_col_u, "} x_ij\n",
        "     2. Calculate the sample standard deviation:\n",
        "          sigma_i = sqrt( (1 / (", n_col_u, " - 1)) * sum_{j=1}^{", n_col_u, "} (x_ij - mu_i)^2 )\n",
        "     3. Compute the standardized Z-score for each column 'j':\n",
        "          z_ij = (x_ij - mu_i) / sigma_i\n",
        "        (This scales the rows to have a mean of 0 and standard deviation of 1).\n\n"
      )
      
      if (isTRUE(input$condenseRows)) {
         msg <- paste0(msg,
           "   - Class Average Row Aggregation:\n",
           "     For parent lipid class C with N constituent species [s_1, ..., s_N]:\n",
           "          y_{C, j} = (1 / N) * sum_{i=1}^{N} x_{s_i, j}\n\n"
         )
      }
      if (isTRUE(input$condenseRowsSD)) {
         msg <- paste0(msg,
           "   - Class Standard Deviation Row Aggregation:\n",
           "     For parent lipid class C with N constituent species [s_1, ..., s_N]:\n",
           "          SD_{C, j} = sqrt( (1 / (N - 1)) * sum_{i=1}^{N} (x_{s_i, j} - y_{C, j})^2 )   [for N > 1]\n",
           "          SD_{C, j} = 0   [for N = 1]\n\n"
         )
      }
      
      msg <- paste0(msg,
        "   - Euclidean Distance:\n",
        "     For any two lipid profiles p and q (vectors of length N = ", n_col_u, "):\n",
        "          d(p, q) = sqrt( sum_{k=1}^{", n_col_u, "} (p_k - q_k)^2 )\n",
        "        This measures the straight-line distance between standardized lipid profiles in ", n_col_u, "-dimensional space.\n\n",
        "   - Complete Linkage Hierarchical Clustering:\n",
        "     The distance between two clusters A and B is the maximum distance between any member of A and B:\n",
        "          D(A, B) = max { d(a, b) : a in A, b in B }\n",
        "        Clusters with the minimum D(A, B) are iteratively merged to build the tree.\n\n",
        "3. DIFFERENTIALLY ABUNDANT (FILTERED) HEATMAP STATUS\n",
        "   - Differential Abundance Test: ", actual_method, "\n",
        "   - Resolved Test:               ", if (base_method == "non_parametric") "Standard Non-Parametric (Wilcoxon/Kruskal-Wallis)" else if (base_method == "Not configured") "Not configured" else "Standard Parametric (limma moderated test)", "\n",
        "   - P-value Type:                ", p_type, "\n",
        "   - Selection Thresholds:        P < ", p_thresh, ", |Log2FC| >= ", fc_thresh, "\n",
        "   - Clustered DE Features:       ", n_feat_f, " features\n",
        "   - Clustered DE Columns:        ", n_col_f, " samples/groups\n\n",
        "   - Filtration Criteria:\n",
        "     Only lipids satisfying the significance threshold are clustered:\n",
        "       * P-value (", p_type, ") < ", p_thresh, "\n",
        "       * Absolute fold change: |log2FC| >= ", fc_thresh, "\n",
        "==================================================\n"
      )
      
      paste0(msg, "\n", get_stats_console_method_summary(shared_data))
    })

    observeEvent(input$show_stats_detail, {
      shared_data$stats_detail_text(generateHeatmapStatsMsg())
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Heatmap")
    })
    
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
