# Team presentation only. Extracted from guided-code-snapshot; shared servers stay in R/modules.
# Loaded after common modules only when lipidomic_interface() == "team".

# heatmap_ui (4_heatmap)
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
                actionButton(ns("show_condensed_formulas"), "Show Condensed Class Formulas in Statistics Tab", 
                             icon = icon("circle-info"), class = "btn-secondary btn-sm w-100 mt-1 mb-1")
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

# barchart_ui (5_barchart)
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
          sliderInput(ns("donutZoom"), "Chart size %:", min=10, max=200, value=100, step=10),
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

# volcano_ui (6_volcano)
volcano_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = c("0. Nomenclature", "1. Aesthetics"), multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Aesthetics", icon = icon("paintbrush"),
            radioButtons(ns("volcanoColorMode"), "Coloring:",
                         choices = c("By Regulation" = "regulation", "By Lipid Main Class" = "subclass", "By Lipid Category" = "hyperclass"), selected = "regulation"),
            checkboxInput(ns("showLabels"), "Show Labels", TRUE),
            sliderInput(ns("labelThreshold"), tags$span("Label Top N (or %):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Selects the number or percentage of top-ranked lipid dots to label based on their combined fold change and statistical significance.")), 0, 100, 10, 1),
            checkboxInput(ns("useCountInsteadOfPct"), tags$span("As absolute count?", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "If checked, labels the top N absolute number of lipids. If unchecked, labels the top percentage (%) of lipids.")), TRUE),
            sliderInput(ns("alphaWeightLog2FC"), tags$span("Weight abs(Log2FC):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Controls how heavily the magnitude of the fold change (Log2FC) contributes to the labeling rank score.")), 0, 5, 1, 0.1),
            sliderInput(ns("betaWeightNegLog10P"), tags$span("Weight -Log10P:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Controls how heavily the statistical significance (-Log10 P-value) contributes to the labeling rank score.")), 0, 5, 1, 0.1),
            hr(),
            strong("Aesthetic Settings"),
            numericInput(ns("labelTextSize"), "Label Text Size:", 4.5, min=1, step=0.5),
            colourpicker::colourInput(ns("labelTextColor"), "Label Text Color:", value = "#000000"),
            
      # Enhanced Point Controls
            layout_columns(col_widths = c(6, 6),
               numericInput(ns("pointSize"), "Dot Size:", 4, min=0.1, step=0.5),
               sliderInput(ns("pointAlpha"), "Alpha:", 0, 1, 0.7, 0.05)
            ),
            sliderInput(ns("pointStroke"), "Dot Stroke:", 0, 2, 0.2, 0.1),
            
            numericInput(ns("axisTextSize"), "Axis Text Size:", 16, min=6, step=1),
            numericInput(ns("legendTextSize"), "Legend Font Size:", 16, min=6, step=1),
            numericInput(ns("labelForce"), "Label Repel Force:", 35, min=0, step=1),
            
            checkboxInput(ns("removeGrid"), "Remove grid lines?", TRUE),
            checkboxInput(ns("showDensity"), tags$span("Show Density Contours?", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Overlays contour lines indicating where the highest density of lipid species is concentrated on the plot.")), FALSE),
            
            hr(),
            strong("Axis Limits"),
            checkboxInput(ns("symmetricX"), tags$span("Force Symmetric X-Axis?", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Centers the X-axis so that the left and right limits are symmetric, facilitating balanced comparison of fold-change magnitudes.")), TRUE),
            numericInput(ns("xMin"), "X-Min:", NULL),
            numericInput(ns("xMax"), "X-Max:", NULL),
            numericInput(ns("yMin"), "Y-Min:", NULL),
            numericInput(ns("yMax"), "Y-Max:", NULL),
            hr(),
            strong("Axis Compression"),
            checkboxInput(ns("compressX"), tags$span("Compress X Axis", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Compresses extreme values (large fold-changes or high p-values) to keep the main group of lipids readable on the plot.")), FALSE),
            conditionalPanel("input.compressX == true", ns = ns, numericInput(ns("xCompressParam"), "Compress Param:", 0.6, step=0.1)),
            checkboxInput(ns("compressY"), tags$span("Compress Y Axis", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Compresses extreme values (large fold-changes or high p-values) to keep the main group of lipids readable on the plot.")), TRUE),
            conditionalPanel("input.compressY == true", ns = ns, numericInput(ns("yCompressFactor"), "Compress Factor:", 1.5, step=0.1))
          )
        ),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
       ),
      jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Volcano Plot",
          subtitle = "This module performs differential abundance comparisons between sample groups, plotting statistical significance against fold-change magnitudes:",
          bullets = list(
            tags$li(tags$strong("Significance Analysis:"), " Identify lipid species demonstrating statistically significant changes based on user-defined P-value and Log2 Fold Change thresholds."),
            tags$li(tags$strong("Regulation Colorization:"), " Visualize upregulated and downregulated lipid species colored by significance direction, Lipid Main Class, or Lipid Category.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        card(
          card_header(
            class = "d-flex justify-content-between align-items-center",
            textOutput(ns("volcano_stats_text")),
            tags$div(
              actionButton(ns("openStudioVolcano"), label = NULL, icon = icon("camera-retro"), class = "btn-sm btn-outline-secondary py-0 me-1", title = "Open in Publication Export Studio"),
              downloadButton(ns("downloadTable"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
              downloadButton(ns("downloadPlot"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
            )
          ),
          card_body(
            uiOutput(ns("volcano_fallback_alert")),
            uiOutput(ns("de_not_run_banner")),
            plotOutput(ns("volcanoPlot"), height="600px"),
            uiOutput(ns("volcano_stat_note"))
          )
        )
      ), options = list(handles = "s, se"))
    )
  )
}

# lsea_ui (7_lsea)
lsea_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = c("0. Nomenclature", "1. Analysis Settings"), multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Analysis Settings", icon = icon("cogs"),
            uiOutput(ns("groupingModeUI")),
            uiOutput(ns("groupSelectorUI")), # Select Split factor ONLY
            numericInput(ns("minClassSize"), tags$span("Min Lipids per Group:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Excludes categories with fewer than this number of detected species from the enrichment analysis to avoid statistical bias.")), 3, min=1, step=1),
            checkboxInput(ns("noSigThreshold"), tags$span("Not Apply Significancy Threshold", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Runs enrichment tests on all lipids without applying p-value or fold-change filters first, highlighting broad trends in lipid sets.")), FALSE),
            uiOutput(ns("log2fcThreshUI")),
            uiOutput(ns("singleLipidSliderUI"))
          ),
          accordion_panel("2. Aesthetics", icon = icon("paintbrush"),
            numericInput(ns("pointSize"), "Point Size (Scale):", 5, min=1, step=0.5),
            numericInput(ns("textSize"), "Text Size:", 12, min=6, step=1),
            numericInput(ns("labelSize"), "Significance Label Size:", 4.5, min=1, step=0.5),
            checkboxInput(ns("circledDots"), "Circled Dots", FALSE),
            conditionalPanel("input.circledDots == true", ns = ns,
              colourpicker::colourInput(ns("borderColor"), "Dot Border Color:", "black")
            ),
            checkboxInput(ns("customScaleColors"), "Custom Scale Colors", FALSE),
            conditionalPanel("input.customScaleColors == true", ns = ns,
              colourpicker::colourInput(ns("lowColor"), "Low (-FC)", "#0072B2"),
              colourpicker::colourInput(ns("midColor"), "Mid (0)", "grey90"),
              colourpicker::colourInput(ns("highColor"), "High (+FC)", "#D55E00")
            ),
            radioButtons(ns("sigDisplayType"), "Significance Label Format:",
                         choices = c("Star" = "star", "P-value" = "pvalue"),
                         selected = "star")
          )
        ),
        hr(),
        helpText("Comparison groups are set in the Main Sidebar (3. Differential Expression)"),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Lipid Set & Class Enrichment (LSEA)",
          subtitle = "This module performs coordinate class and set abundance testing to evaluate shifts across lipid structural or biological groups:",
          bullets = list(
            tags$li(tags$strong("Set & Class Testing:"), " Assess statistically significant coordinate shifts across lipid categories, main classes, carbon chain lengths, or individual species."),
            tags$li(tags$strong("Class Fold-Change (Log2FC):"), " Evaluate cohort-wise aggregated fold change and significance across structurally related lipid classes.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        card(
          card_header(
            class = "d-flex justify-content-between align-items-center",
            textOutput(ns("lsea_stats_text")),
            uiOutput(ns("lseaDownloadsUI"))
          ),
          card_body(
            uiOutput(ns("lsea_fallback_alert")),
            uiOutput(ns("de_not_run_banner")),
            tags$div(
              style = "max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;",
              tabindex = "0", `aria-label` = "LSEA plot; scroll horizontally to view the full figure on narrow screens",
              tags$div(
                style = "width: 100%; min-width: 800px;",
                plotOutput(ns("lseaPlot"), width = "100%", height = "600px")
              )
            ),
            uiOutput(ns("lsea_stat_note"))
          )
        )
      ), options = list(handles = "s, se"))
    )
  )
}

# structural_ui (8_structural)
structural_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = c("0. Nomenclature", "1. Analysis Settings"), multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Analysis Settings", icon = icon("cogs"),
            uiOutput(ns("groupingModeUI")),
            numericInput(ns("minClassSize"), tags$span("Min Lipids per Group:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Excludes categories with fewer than this number of detected species from the structural analysis.")), 3, min=1, step=1),
            checkboxInput(ns("noSigThreshold"), tags$span("Not Apply Significancy Threshold", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Runs structural analysis on all classes without applying p-value filters first.")), FALSE),
            numericInput(
              ns("log2fcThreshold"),
              tags$span(
                "Log2FC Threshold (abs):",
                bslib::tooltip(
                  icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
                  "Applies an effect size filter requiring the absolute log2 fold change (|Log2FC|) to meet or exceed this cutoff threshold for inclusion in the structural feature analysis."
                )
              ),
              0, min=0, step=0.1
            ),
            selectInput(ns("sortBy"), "Sort Top Classes By:",
                        choices = c("P-value (Lowest first)" = "pvalue", "Abs Log2FC (Highest first)" = "log2fc", "Class Name (Alphabetical)" = "name"),
                        selected = "pvalue"),
            uiOutput(ns("topClassesCountUI"))
          ),
          accordion_panel("2. Advanced Aesthetics & Ordering", icon = icon("sliders"),
             numericInput(ns("pointSize"), "Violin Dot Size:", 3, min=1, step=0.5),
             numericInput(ns("textSize"), "Text Size:", 10, min=6, step=1),
             colourpicker::colourInput(ns("colRef"), "Ref Color:", value = "#0072B2"),
             colourpicker::colourInput(ns("colComp"), "Comp Color:", value = "#D55E00"),
             checkboxInput(ns("circledDots"), "Circled Dots", FALSE),
             conditionalPanel("input.circledDots == true", ns = ns,
                colourpicker::colourInput(ns("borderColor"), "Dot Border Color:", "black")
             ),
             checkboxInput(ns("customScaleColors"), "Custom Scale Colors", FALSE),
             conditionalPanel("input.customScaleColors == true", ns = ns,
                colourpicker::colourInput(ns("lowColor"), "Low (-Diff)", "#0072B2"),
                colourpicker::colourInput(ns("midColor"), "Mid (0)", "grey90"),
                colourpicker::colourInput(ns("highColor"), "High (+Diff)", "#D55E00")
             ),
             radioButtons(ns("sigDisplayType"), "Significance Label Format:",
                          choices = c("Star" = "star", "P-value" = "pvalue"),
                          selected = "star"),
             checkboxInput(ns("colorClassLabels"), tags$span("Color Y-Axis Class Labels by LSEA Regulation", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Colors the category labels on the Y-axis red or blue to reflect class enrichment.")), TRUE)
          ),
          hr(),
          actionButton(ns("runAnalysis"), "Initiate Structural Analysis", class = "btn-initiate-structural", width = "100%")
        ),
        hr(),
        helpText("Comparison of the structural properties (Chain Length, Unsaturation) of lipids enriched in the Comparison group vs Reference group (based on DE results). It also addresses region-specific (sn-1, sn-2) structural details where available."),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      div(
        class = "structural-main-scroll-viewport",
        render_tab_intro_card(
          title = "Structural",
          subtitle = "This module analyzes lipidome changes across structural features such as carbon chain length and double bond count:",
          bullets = list(
            tags$li(tags$strong("Structural Analysis Dot Plots:"), " Compare carbon chain lengths and double bond counts across lipid classes, plotting values by regulation direction."),
            tags$li(tags$strong("Violin Plots:"), " Inspect individual species distribution violin charts within specific lipid classes, highlighting extreme values."),
            tags$li(tags$strong("Correlation Networks:"), " Map structural inter-dependencies using Pearson correlation-based graph networks at main class, chain length, or species levels.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        div(
          class = "structural-card-tabs hide-redundant-nav-tabs",
          navset_card_tab(
            id = ns("structural_subtabs"),
            selected = "Structural Analysis Dot Plots",
            nav_panel("Structural Analysis Dot Plots", 
               card_header(
                 class = "d-flex justify-content-between align-items-center",
                 textOutput(ns("summary_stats_text")),
                  uiOutput(ns("structuralDownloadsUI"))
               ),
                card_body(
                  fillable = FALSE,
                  fill = FALSE,
                  class = "p-3 structural-dotplot-card-body",
                  div(
                    class = "quick-access-strip mb-2.5",
                    tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#structural_tab-groupingModeUI', 'plot_controls', '1. Analysis Settings', event);",
                      title = "Select target lipid class for structural analysis",
                      icon("dna"), tags$strong("Target Lipid Class")
                    ),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access btn-quick-l2fc",
                      onclick = "window.pointToElement('#structural_tab-log2fcThreshold', 'plot_controls', '1. Analysis Settings', event);",
                      title = "Adjust |Log2FC| effect size threshold in sidebar",
                      icon("filter"), "|Log2FC| Cutoff"
                    ),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#structural_tab-sortBy', 'plot_controls', '1. Analysis Settings', event);",
                      title = "Sort top classes by P-value, Abs Log2FC, or Name",
                      icon("arrow-down-wide-short"), "Sort Classes"
                    ),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#structural_tab-runAnalysis', 'plot_controls', '1. Analysis Settings', event);",
                      title = "Initiate Structural Analysis calculation",
                      icon("play"), "Initiate Analysis"
                    ),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#structural_tab-pointSize', 'plot_controls', '2. Advanced Aesthetics & Ordering', event);",
                      title = "Customize dot sizes, custom color scale, and significance formats in left dock",
                      icon("sliders"), "Aesthetics & Sizing"
                    )
                  ),
                  uiOutput(ns("de_not_run_banner_summary")),
                  jqui_resizable(
                    plotOutput(ns("summaryPlot"), height = "600px"),
                    options = list(handles = "s, se")
                  ),
                  uiOutput(ns("structural_stat_note"))
                )
            ),
            nav_panel("Violin Plots", 
               card_header(
                 class = "d-flex justify-content-between align-items-center",
                 "Lipid Species Identification",
                 tags$div(
                    downloadButton(ns("downloadSpeciesPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                 )
               ),
               card_body(
                  fillable = FALSE,
                  fill = FALSE,
                  class = "p-3 structural-dotplot-card-body",
                  div(
                    class = "quick-access-strip mb-2.5",
                    tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#structural_tab-classSelectorUI', 'plot_controls', '1. Analysis Settings', event);",
                      title = "Select target lipid class for species-level violin distributions",
                      icon("dna"), tags$strong("Target Lipid Class")
                    ),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#structural_tab-sigDisplayType', 'plot_controls', '2. Advanced Aesthetics & Ordering', event);",
                      title = "Toggle significance display between Stars (*, **, ***) and Numeric P-values",
                      icon("star"), "Significance (Stars / P-val)"
                    ),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#structural_tab-pointSize', 'plot_controls', '2. Advanced Aesthetics & Ordering', event);",
                      title = "Configure violin point jitter size and border styling",
                      icon("circle-dot"), "Dot Jitter & Size"
                    ),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#structural_tab-colorClassLabels', 'plot_controls', '2. Advanced Aesthetics & Ordering', event);",
                      title = "Color Y-axis class labels by LSEA regulation direction",
                      icon("tags"), "Color Labels by LSEA"
                    ),
                    tags$button(
                      type = "button",
                      class = "btn-quick-access",
                      onclick = "window.pointToElement('#data_hub-hyperclassSelectorUI', 'cohorts', 'Lipid Class Filters', event);",
                      title = "Filter by lipid category and subclass hierarchy in left dock",
                      icon("filter"), "Class Filters"
                    )
                  ),
                  uiOutput(ns("de_not_run_banner_species")),
                  uiOutput(ns("classSelectorUI")),
                  fluidRow(
                    column(6, sliderInput(ns("labelTop"), "Label Top % Extremes:", min=0, max=100, value=0, step=1)),
                    column(6, actionButton(ns("updateSpecies"), "Load Species Plot", class = "btn-secondary", style="margin-top: 25px; width: 100%;"))
                  ),
                  hr(),
                  jqui_resizable(
                    plotOutput(ns("speciesPlotPlot"), height = "600px"),
                    options = list(handles = "s, se")
                  ),
                  uiOutput(ns("species_stat_note"))
               )
            ),
            nav_panel("Correlation Networks",
               card_header("Structural & Species Correlation Mapper"),
               div(
                 class = "p-3",
                 div(
                   class = "quick-access-strip mb-2.5",
                   tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                   tags$button(
                     type = "button",
                     class = "btn-quick-access",
                     onclick = "window.pointToElement('#structural_tab-networkLevel', 'plot_controls', '1. Analysis Settings', event);",
                     title = "Switch network aggregation level (Class, Chain Length, Saturation, or Species)",
                     icon("sitemap"), tags$strong("Hierarchy Level")
                   ),
                   tags$button(
                     type = "button",
                     class = "btn-quick-access",
                     onclick = "window.pointToElement('#structural_tab-networkThresh', 'plot_controls', '1. Analysis Settings', event);",
                     title = "Adjust minimum absolute Pearson correlation threshold (|r|)",
                     icon("sliders"), "Min Absolute Correlation (|r|)"
                   ),
                   tags$button(
                     type = "button",
                     class = "btn-quick-access",
                     onclick = "window.pointToElement('#structural_tab-networkLayout', 'plot_controls', '1. Analysis Settings', event);",
                     title = "Switch graph layout algorithm (Stress, Fruchterman-Reingold, Circle, Kamada-Kawai)",
                     icon("circle-nodes"), "Network Layout"
                   ),
                   tags$button(
                     type = "button",
                     class = "btn-quick-access",
                     onclick = "window.pointToElement('#data_hub-n6_substrates', 'cohorts', 'Pathway Substrates', event);",
                     title = "Filter by n-6 and n-3 pathway substrates in left dock",
                     icon("dna"), "Pathway Substrates"
                   )
                 ),
                 p(class="text-muted small", "Visualize the inter-dependencies of aggregated structural metrics or individual species. Edges connect pairs meeting the selected absolute Pearson correlation threshold. This threshold does not establish statistical significance. The graph is undirected."),
                 layout_columns(
                  col_widths = c(3, 9),
                  card(
                     selectInput(ns("networkLevel"), "Aggregation Level:", 
                       choices = c("Lipid Main Class (Aggregated)" = "subclass",
                                   "Fatty Acid Chain Length (Aggregated)" = "Total_Carbons",
                                   "Fatty Acid Saturation (Aggregated)" = "Total_DB",
                                   "Individual Lipid Species" = "Lipid_Name")
                     ),
                      sliderInput(
                        ns("networkThresh"),
                        tags$span(
                          "Minimum Absolute Correlation (|r|):",
                          bslib::tooltip(
                            icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
                            "Applies a pairwise correlation filter. Only feature pairs with an absolute Pearson correlation coefficient (|r|) meeting or exceeding this cutoff threshold will be linked by network edges."
                          )
                        ),
                        min=0.5, max=0.99, value=0.85, step=0.01
                      ),
                     selectInput(ns("networkLayout"), "Graph Layout:", choices = c("stress", "fr", "circle", "kk"), selected = "stress")
                  ),
                   div(style = "display: flex; flex-direction: column;",
                      jqui_resizable(
                        plotOutput(ns("networkPlot"), height = "800px"),
                        options = list(handles = "s, se")
                      ),
                     shiny::HTML("<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #0072b2; font-size: 11px; line-height: 1.4; color: #333; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif; border-radius: 0 4px 4px 0;'><b>Methodology Note (Correlation Networks):</b> Correlation networks illustrate inter-lipid correlations. Nodes represent either aggregated lipid main classes, chain lengths, double bonds, or individual species. Edges indicate pairwise Pearson correlation coefficients (|r|) exceeding the user-specified threshold. Undirected graph layout is optimized using the selected algorithm (e.g. Stress or Fruchterman-Reingold).</div>")
                   )
                 )
               )
            )
          )
        ),
        
        # ADVANCED AESTHETICS & ORDERING RIBBON
        accordion(
          id = ns("structural_advanced_aesthetics_accordion"),
          open = FALSE,
          class = "mt-3 shadow-sm",
          accordion_panel(
            title = "Advanced Aesthetics & Ordering",
            icon = icon("sliders"),
            layout_columns(
              col_widths = c(6, 6),
              
              # Left: Factor Level Ordering & Class Sorting
              card(
                card_header(icon("sort"), " Factor Level Ordering & Class Sorting"),
                card_body(
                  p(class = "text-muted small", HTML("Select a metadata variable or cohort comparison dimension to customize factor level ordering on plots, or adjust class sorting order.")),
                  selectInput(ns("order_target_var"), "Target Variable (Factor Ordering):", choices = NULL, width = "100%"),
                  uiOutput(ns("level_order_ui")),
                  hr(),
                  selectInput(ns("bottom_sortBy"), "Sort Top Classes By:",
                              choices = c("P-value (Lowest first)" = "pvalue", "Abs Log2FC (Highest first)" = "log2fc", "Class Name (Alphabetical)" = "name"),
                              selected = "pvalue")
                )
              ),
              
              # Right: Custom Plot Colors & Sizing Overrides
              card(
                card_header(icon("palette"), " Custom Plot Colors & Sizing Overrides"),
                card_body(
                  p(class = "text-muted small", "Target a specific dimension to define custom fill colors, or customize comparison cohort colors and sizing:"),
                  fluidRow(
                    column(6, colourpicker::colourInput(ns("bottom_colRef"), "Ref Color:", value = "#0072B2")),
                    column(6, colourpicker::colourInput(ns("bottom_colComp"), "Comp Color:", value = "#D55E00"))
                  ),
                  fluidRow(
                    column(6, numericInput(ns("bottom_pointSize"), "Violin Dot Size:", 3, min = 1, step = 0.5)),
                    column(6, numericInput(ns("bottom_textSize"), "Text Size:", 10, min = 6, step = 1))
                  ),
                  hr(),
                  p(class = "text-muted small fw-bold", "Cohort & Metadata Level Colors:"),
                  selectInput(ns("color_target_var"), "Target Variable (Fill By):", choices = NULL, width = "100%"),
                  uiOutput(ns("dynamic_colors_ui")),
                  actionButton(ns("btn_apply_structural_colors"), "Apply Custom Colors", icon = icon("palette"), class = "btn-success btn-apply-colors w-100 mt-2")
                )
              )
            )
          )
        )
      )
    )
  )
}

# structural_proportions_ui (8_structural)
structural_proportions_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        
        # --- 1. STACKED PROPORTIONS CONTROLS ---
        div(
          id = ns("prop_sidebar_stacked_controls"),
          class = "prop-subview-controls prop-stacked-controls",
          conditionalPanel(
            condition = "input.prop_subtab_view == 'proportions_view' || !input.prop_subtab_view",
            ns = ns,
            accordion(
              id = ns("prop_stacked_accordion"),
              open = c("0. Scope & Grouping", "1. Proportion Settings"),
              multiple = TRUE,
              
              # 0. Scope & Grouping
              accordion_panel(
                "0. Scope & Grouping", icon = icon("layer-group"),
                uiOutput(ns("prop_group_var_ui")),
                radioButtons(ns("prop_group_level"), "Grouping Level:",
                             choices = c("Lipid Main Class", "Lipid Category"),
                             selected = "Lipid Main Class", inline = FALSE),
                conditionalPanel(
                  condition = "input.prop_group_level == 'Lipid Main Class'", ns = ns,
                  radioButtons(ns("prop_class_mode"), "Class Selection Mode:",
                               choices = c("Major Lipid Classes" = "major",
                                           "Include Sub Classes" = "subclasses"),
                               selected = "major")
                ),
                conditionalPanel(
                  condition = "input.prop_group_level == 'Lipid Main Class' && input.prop_class_mode == 'subclasses'", ns = ns,
                  div(
                    style = "margin-top: 4px; margin-bottom: 8px; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;",
                    checkboxGroupInput(
                      ns("prop_subclass_mod_types"),
                      tags$span(
                        tags$b("Include Subclasses / Modifications:"),
                        bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
                                       "Select which subclass modifications to split and include.")
                      ),
                      choices = c(
                        "Standard (e.g. Diacyl / PE)" = "standard",
                        "Mature" = "mature",
                        "Plasmalogen (P-)" = "plasmalogen",
                        "Ether (O-)" = "ether",
                        "Dihydro (d-)" = "dihydro"
                      ),
                      selected = c("standard", "mature", "plasmalogen", "ether", "dihydro"),
                      inline = FALSE
                    )
                  )
                ),
                uiOutput(ns("prop_target_class_ui"))
              ),
              
              # 1. Proportion Settings
              accordion_panel(
                "1. Proportion Settings", icon = icon("chart-pie"),
                radioButtons(ns("prop_value_mode"), tags$span("Value Mode:", 
                             bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                            "Calculates cumulative abundance either as absolute values or standardized/normalized values, expressed as raw intensity or percentage composition.")),
                             choices = c("Absolute (intensity)", "Absolute (%)", 
                                 "Normalized (intensity)", "Normalized (%)"),
                             selected = "Absolute (%)"),
                div(
                  style = "margin-top: 6px; margin-bottom: 12px; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;",
                  checkboxInput(
                    ns("prop_enable_donut"),
                    tags$span(
                      icon("chart-pie", class = "me-1 text-primary"),
                      tags$b("Display as Donut Plot"),
                      bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
                                     "Switch between a horizontal Stacked Bar Chart and circular Donut Plots for acyl chain composition.")
                    ),
                    value = FALSE
                  ),
                  conditionalPanel(
                    condition = "input.prop_enable_donut == true",
                    ns = ns,
                    tags$div(
                      style = "margin-top: 6px; padding-top: 6px; border-top: 1px dashed #cbd5e1;",
                      checkboxInput(ns("prop_show_donut_stats"), "Show Donut Proportion", FALSE)
                    )
                  )
                ),
                selectInput(ns("prop_position"), "Acyl Chain Position Breakdown:",
                            choices = c("Both Merged (Total Acyl Content)" = "both",
                                        "Sn-1 Position Only" = "sn1",
                                        "Sn-2 Position Only" = "sn2",
                                        "Side-by-Side Comparison (Sn-1 vs Sn-2)" = "side_by_side"),
                            selected = "both"),
                radioButtons(ns("prop_multiclass_mode"), "Multi-Class Layout:",
                             choices = c("Merged (Single Combined Barplot)" = "merged",
                                         "Stacked Vertically (Per-Class Barplots)" = "stacked"),
                             selected = "stacked", inline = FALSE)
              ),
              
              # 2. Color Customization & Overrides
              accordion_panel(
                "2. Color Customization & Overrides", icon = icon("palette"),
                uiOutput(ns("prop_color_pickers_ui"))
              ),
              
              # 3. Error Bars & Dispersion
              accordion_panel(
                "3. Error Bars & Dispersion", icon = icon("chart-column"),
                checkboxInput(ns("prop_show_error_bars"), "Show Error Bars", value = FALSE),
                conditionalPanel(
                  condition = "input.prop_show_error_bars == true", ns = ns,
                  radioButtons(ns("prop_error_bar_type"), tags$span("Error Bar Type:", 
                               bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                              "Individual Segments displays error bars for each individual acyl chain (recommended for percentage composition); Total Bar displays an error bar for cumulative class abundance variance.")),
                               choices = c("Individual Segments" = "individual", "Total Bar" = "total"),
                               selected = "individual"),
                  radioButtons(ns("prop_error_bar_style"), "Error Bar Style:",
                               choices = c("Half Bar (One-Sided +)" = "half", 
                                           "Full Bar (Two-Sided \u00B1)" = "full"),
                               selected = "half", inline = TRUE),
                  radioButtons(ns("prop_error_bar_color"), "Error Bar Color:",
                               choices = c("Black" = "black", 
                                           "In Color (Match Acyl Chain)" = "color"),
                               selected = "black", inline = TRUE),
                  radioButtons(ns("prop_error_bar_stats"), tags$span("Statistical Mode Choice:", 
                               bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                              "Standard Deviation (SD) measures dispersion across replicates; Standard Error of the Mean (SEM) measures precision of the estimated group mean.")),
                               choices = c("Standard Deviation (SD)" = "sd", "Standard Error of the Mean (SEM)" = "sem"),
                               selected = "sem"),
                  uiOutput(ns("prop_error_bar_note"))
                )
              )
            ),
            hr(),
            actionButton(ns("prop_show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                         icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-2")
          )
        ),
        
        # --- 2. DIFFERENTIAL ACYL CHAIN CONTROLS ---
        div(
          id = ns("prop_sidebar_diff_controls"),
          class = "prop-subview-controls prop-diff-controls",
          conditionalPanel(
            condition = "input.prop_subtab_view == 'differential_view' || input.prop_subtab_view == 'diff_acyl_view'",
            ns = ns,
            accordion(
              id = ns("prop_diff_accordion"),
              open = c("0. Scope & Target Class", "1. Comparison Framework & Cohorts"),
              multiple = TRUE,
              
              # 0. Scope & Target Class
              accordion_panel(
                "0. Scope & Target Class", icon = icon("layer-group"),
                radioButtons(
                  ns("diff_group_level"),
                  tags$span(tags$b("Grouping Level:"), bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Filter acyl chain differential analysis by Lipid Main Class or high-level Lipid Category.")),
                  choices = c("Lipid Main Class", "Lipid Category"),
                  selected = "Lipid Main Class",
                  inline = FALSE
                ),
                conditionalPanel(
                  condition = "input.diff_group_level == 'Lipid Main Class'", ns = ns,
                  radioButtons(
                    ns("diff_class_mode"),
                    tags$span(tags$b("Class Selection Mode:"), bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Choose between Major Classes or splitting into Subclasses / Linkage modifications.")),
                    choices = c("Major Lipid Classes" = "major", "Include Sub Classes" = "subclasses"),
                    selected = "major",
                    inline = FALSE
                  )
                ),
                conditionalPanel(
                  condition = "input.diff_group_level == 'Lipid Main Class' && input.diff_class_mode == 'subclasses'", ns = ns,
                  div(
                    style = "margin-top: 6px; padding: 6px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;",
                    checkboxGroupInput(
                      ns("diff_subclass_mod_types"),
                      tags$span(
                        tags$b("Include Subclasses / Modifications:"),
                        bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Select which subclass modifications to include in differential analysis.")
                      ),
                      choices = c(
                        "Standard (e.g. Diacyl / PE)" = "standard",
                        "Mature" = "mature",
                        "Plasmalogen (P-)" = "plasmalogen",
                        "Ether (O-)" = "ether",
                        "Dihydro (d-)" = "dihydro"
                      ),
                      selected = c("standard", "mature", "plasmalogen", "ether", "dihydro"),
                      inline = FALSE
                    )
                  )
                ),
                uiOutput(ns("diff_target_class_ui"))
              ),
              
              # 1. Comparison Framework & Cohorts
              accordion_panel(
                "1. Comparison Framework & Cohorts", icon = icon("code-compare"),
                selectInput(
                  ns("diff_comp_type"),
                  tags$span("Comparison Framework:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Select whether to contrast experimental cohorts based on Compared Analysis, custom metadata cohorts, paired stereospecific positions (sn-1 vs sn-2), or paired subjects.")),
                  choices = c(
                    "Compared Analysis (Global Contrast)" = "de_contrast",
                    "Custom Cohort Comparison" = "cohort",
                    "sn-1 vs sn-2 Positional Remodeling" = "sn1_vs_sn2",
                    "Paired Patient / Subject" = "paired_patient"
                  ),
                  selected = "de_contrast"
                ),
                conditionalPanel(
                  condition = "input.diff_comp_type == 'de_contrast'", ns = ns,
                  uiOutput(ns("diff_contrast_status_ui"))
                ),
                conditionalPanel(
                  condition = "input.diff_comp_type == 'cohort'", ns = ns,
                  uiOutput(ns("diff_cohort_var_ui"))
                ),
                conditionalPanel(
                  condition = "input.diff_comp_type == 'paired_patient'", ns = ns,
                  uiOutput(ns("diff_patient_var_ui"))
                ),
                conditionalPanel(
                  condition = "input.diff_comp_type == 'cohort' || input.diff_comp_type == 'paired_patient'", ns = ns,
                  uiOutput(ns("diff_ref_group_ui")),
                  uiOutput(ns("diff_comp_group_ui"))
                ),
                conditionalPanel(
                  condition = "input.diff_comp_type == 'sn1_vs_sn2'", ns = ns,
                  uiOutput(ns("diff_sn_cohort_filter_ui")),
                  tags$p(class = "text-muted small mt-1", "Contrasting paired sn-1 vs sn-2 distribution across all selected samples.")
                ),
                conditionalPanel(
                  condition = "input.diff_comp_type == 'cohort'", ns = ns,
                  uiOutput(ns("diff_strata_filter_ui"))
                )
              ),
              
              # 2. Statistical Testing & Visualization
              accordion_panel(
                "2. Statistical Testing & Visualization", icon = icon("chart-simple"),
                radioButtons(
                  ns("diff_test_type"),
                  tags$span("Statistical Test:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Two-sample Student's t-test assumes normality; Wilcoxon rank-sum is non-parametric; Paired test evaluates within-replicate differences.")),
                  choices = c(
                    "Student's t-test" = "t_test",
                    "Wilcoxon Rank-Sum" = "wilcoxon",
                    "Paired t-test" = "paired_t"
                  ),
                  selected = "t_test"
                ),
                radioButtons(
                  ns("diff_plot_style"),
                  "Plot Visualization:",
                  choices = c(
                    "Diverging Forest Plot" = "forest",
                    "Acyl Volcano Plot" = "volcano"
                  ),
                  selected = "forest",
                  inline = TRUE
                ),
                selectInput(
                  ns("diff_rank_by"),
                  "Rank Chains By:",
                  choices = c(
                    "Magnitude (|Log2FC|)" = "abs_log2fc",
                    "Effect Size (Log2FC High to Low)" = "log2fc_desc",
                    "Effect Size (Log2FC Low to High)" = "log2fc_asc",
                    "Statistical Significance (P-value)" = "pvalue"
                  ),
                  selected = "abs_log2fc"
                )
              ),
              
              # 3. Significance Cutoffs
              accordion_panel(
                "3. Significance Cutoffs", icon = icon("filter"),
                div(
                  class = "d-flex gap-2",
                  numericInput(ns("diff_p_cutoff"), "P-value Cutoff:", value = 0.05, min = 0.0001, max = 0.5, step = 0.01),
                  numericInput(ns("diff_fc_cutoff"), "Log2FC Cutoff:", value = 0.5, min = 0, max = 5, step = 0.1)
                )
              )
            ),
            hr(),
            actionButton(
              ns("diff_show_stats_detail"),
              tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates differential acyl chain statistics and displays them in the Statistics Console.")),
              icon = icon("arrow-right-long"),
              class = "btn-info btn-show-stats w-100 mt-2"
            )
          )
        )
      ),
      div(
        class = "structural-main-scroll-viewport",
        render_tab_intro_card(
          title = "Main Class & Acyl Chain Proportions",
          subtitle = "Profile relative composition and acyl chain configuration across lipid classes and sample cohorts:",
          bullets = list(
            tags$li(tags$strong("Stacked Proportions:"), " Visualize cumulative class proportions, subclass modifications (plasmalogens, ethers), and sn-1/sn-2 acyl chain breakdowns."),
            tags$li(tags$strong("Differential Acyl Chain Expression:"), " Evaluate statistically significant acyl chain remodeling across conditions using diverging forest plots or volcano views.")
          ),
          collapse_id = ns("prop_intro_collapse")
        ),
        div(
          class = "quick-access-strip mb-2.5",
          tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.setPropPosition('side_by_side', event);",
            title = "Acyl Chain Position Breakdown: Side-by-Side Comparison (Sn-1 vs Sn-2)",
            icon("arrows-split-up-and-left"), tags$strong("Sn1 vs Sn2")
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.switchPropSubtab('proportions_view', event);",
            title = "View Stacked Cumulative Proportions Barplot",
            icon("chart-bar"), "Stacked Proportions"
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.switchPropSubtab('differential_view', event);",
            title = "View Differential Acyl Chain Remodeling (Forest & Volcano Plots)",
            icon("arrow-trend-up"), "Differential Remodeling"
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToLog2FCFilter(event);",
            title = "Jump to Compared Analysis in Data Dock",
            icon("code-compare"), "Compared Analysis"
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#structural_tab-prop_bottom_matrix_accordion', '2. Structural Filter Matrix', event);",
            title = "Bottom Menu: Open and scroll to the 2. Structural Filter Matrix below the plot",
            icon("table-cells"), tags$strong("Bottom Menu: Structural Filter Matrix")
          )
        ),
        card(
          class = "border shadow-sm mb-3",
          card_header(
            class = "d-flex justify-content-between align-items-center flex-wrap gap-2",
            tags$div(
              class = "d-flex align-items-center gap-2",
              icon("diagram-project", class = "text-primary fs-5"),
              tags$span(class = "fw-bold fs-6 text-dark", "Main Class Linkage & Acyl Chain Profiling")
            ),
            uiOutput(ns("prop_subtab_download_buttons_ui"))
          ),
          card_body(
            fillable = FALSE,
            fill = FALSE,
            class = "p-3",
            
            # Subtab Switcher: Stacked Proportions vs Differential Acyl Chain Expression
            div(
              class = "prop-card-tabs hide-redundant-nav-tabs",
              navset_pill(
                id = ns("prop_subtab_view"),
                selected = "proportions_view",
                # SUBTAB 1: STACKED PROPORTIONS
                nav_panel(
                  title = tagList(icon("chart-bar", class = "me-1 text-primary"), "Stacked Proportions"),
                  value = "proportions_view",
                  div(
                    class = "pt-3",
                    jqui_resizable(
                      div(
                        id = ns("prop_plot_container"),
                        style = "width: 100%; height: 400px; min-height: 250px; padding-bottom: 12px; margin-bottom: 16px; position: relative; box-sizing: border-box; overflow: visible;",
                        div(
                          id = ns("prop_plot_viewport"),
                          class = "prop-plot-scroll-viewport",
                          style = "width: 100%; height: 100%; overflow-y: auto; overflow-x: auto; position: relative; border-radius: 6px;",
                          plotOutput(
                            ns("propPlotPlot"),
                            width = "100%",
                            height = "auto",
                            hover = hoverOpts(
                              id = ns("propPlot_hover"),
                              delay = 50,
                              delayType = "debounce",
                              clip = TRUE,
                              nullOutside = TRUE
                            )
                          ),
                          uiOutput(ns("propPlot_tooltip"), style = "position: absolute; top: 0; left: 0; pointer-events: none; width: 0; height: 0;")
                        )
                      ),
                      options = list(handles = "s, se")
                    )
                  )
                ),
                # SUBTAB 2: DIFFERENTIAL ACYL CHAIN EXPRESSION
                nav_panel(
                  title = tagList(icon("scale-balanced", class = "me-1 text-danger"), "Differential Acyl Chain Expression"),
                  value = "differential_view",
                  div(
                    class = "pt-3 diff-acyl-container",
                    uiOutput(ns("diff_acyl_kpi_ui")),
                    jqui_resizable(
                      div(
                        id = ns("diff_plot_container"),
                        style = "width: 100%; height: 500px; min-height: 320px; padding-bottom: 12px; margin-bottom: 16px; position: relative; box-sizing: border-box; overflow: visible;",
                        div(
                          id = ns("diff_plot_viewport"),
                          class = "prop-plot-scroll-viewport",
                          style = "width: 100%; height: 100%; overflow-y: auto; overflow-x: auto; position: relative; border-radius: 6px;",
                          plotOutput(
                            ns("diffAcylPlot"),
                            width = "100%",
                            height = "100%"
                          )
                        )
                      ),
                      options = list(handles = "s, se")
                    ),
                    uiOutput(ns("diff_plot_bottom_note")),
                    card(
                      class = "border shadow-sm mb-3",
                      card_header(
                        class = "py-2 px-3 fw-bold text-secondary d-flex align-items-center justify-content-between bg-light border-bottom",
                        tags$div(
                          class = "d-flex align-items-center gap-2",
                          icon("table-cells", class = "text-primary"),
                          tags$span("Differential Acyl Chain Summary Table")
                        ),
                        tags$div(
                          class = "d-flex align-items-center gap-2",
                          actionButton(
                            ns("diff_table_show_stats_detail"),
                            "Show Statistic Detail",
                            icon = icon("calculator"),
                            class = "btn-outline-primary btn-sm py-0 fw-semibold"
                          ),
                          tags$span(class = "badge bg-secondary-subtle text-secondary border", "Active & Ranked Configurations")
                        )
                      ),
                      card_body(
                        class = "p-2",
                        DTOutput(ns("diffAcylTable"))
                      )
                    )
                  )
                )
              )
            ),
            
            # Methodology Annotation
            uiOutput(ns("prop_stat_note"))
          )
        ),
        
        # BOTTOM MENU: STRUCTURAL FILTER MATRIX
        conditionalPanel(
          condition = "input.prop_subtab_view == 'proportions_view' || !input.prop_subtab_view",
          ns = ns,
          accordion(
            id = ns("prop_bottom_matrix_accordion"),
            open = "2. Structural Filter Matrix",
            class = "mt-3 shadow-sm",
            accordion_panel(
              title = "2. Structural Filter Matrix",
              icon = icon("table-cells"),
              card(
                card_header(
                  class = "d-flex justify-content-between align-items-center py-2 px-3",
                  tags$div(class = "d-flex align-items-center gap-2", icon("table-cells", class = "text-primary"), tags$span(class = "fw-bold", "Acyl Chain Filter Matrix")),
                  uiOutput(ns("prop_matrix_status_badge"), inline = TRUE)
                ),
                card_body(class = "p-2", uiOutput(ns("prop_chain_matrix_ui")))
              )
            )
          )
        )
      )
    )
  )
}

# logratio_ui (9_logratio)
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
        uiOutput(ns("featureLevelUI")),
        uiOutput(ns("featurePickerUI")),
        p(class = "text-muted small", "Adjust plot height and columns directly above the chart."),
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
      div(class = "violin-study", style = "padding-bottom: 12px; margin-bottom: 15px;",
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
          class = "violin-study-card",
          card_header(
            class = "d-flex justify-content-between align-items-center",
            uiOutput(ns("dynamicPlotTitle"), inline=TRUE),
            tags$div(
              downloadButton(ns("downloadCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
              downloadButton(ns("downloadPlot"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
            )
          ),
          card_body(
             div(class = "violin-size-controls",
               selectInput(ns("panelHeight"), "Panel height", choices = c("Comfortable" = 520, "Tall" = 720, "Presentation" = 900), selected = 520),
               selectInput(ns("panelColumns"), "Panels per row", choices = c("One (recommended)" = 1, "Two" = 2, "Three" = 3), selected = 1)
             ),
             p(class = "text-muted small", "Each feature gets a full-size panel. More features add rows; multiple columns can be scrolled horizontally on smaller screens."),
             uiOutput(ns("baseline_status_banner")),
             tags$div(
                class = "violin-study-viewport",
                uiOutput(ns("scrollable_plot_ui"))
             ),
             uiOutput(ns("violin_stat_note"))
          )
        )
      ),
      
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

# fla_ui (10_fla)
fla_ui <- function(id) {
  ns <- NS(id)
  tagList(
      
      layout_sidebar(
        sidebar = sidebar(
          width = 300,
          h5("Functional Lipid Analysis", class="mt-2 text-primary"),
          p(class="text-muted small", "Computes 41 biochemically defined indices spanning Structural, Signaling, and Energy domains."),
          
          accordion(
            open = "0. Nomenclature", multiple = TRUE,
            accordion_panel("0. Nomenclature", icon = icon("font"),
              radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                           choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                           selected = "short")
            )
          ),
          hr(),
          
          radioButtons(ns("localStatMethod"), "Statistical Mode Choice:",
                       choices = c("Automatic mode" = "auto", 
                                   "Parametric (t-test)" = "parametric", 
                                   "Non-Parametric (Wilcoxon)" = "non_parametric"),
                       selected = "auto"),
          hr(),
          
          # Grouping & Baseline
          selectizeInput(ns("groupingMetadata"), 
                         tags$span("Primary Grouping (Order matters):", 
                                   bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                                  "Order defines the grouping hierarchy: the first variable splits the box/violin charts (x-axis), while subsequent variables define sub-groupings/facets. Drag and drop to rearrange.")), 
                          choices = c("Group1", "Group2"), 
                          selected = NULL, 
                          multiple = TRUE, 
                          options = list(plugins = list('drag_drop'))),
                         
          uiOutput(ns("baselineSelectorUI")),
          
          # Compare vs Baseline moved here for better UX, shown conditionally
          conditionalPanel(
             condition = paste0("input['", ns("fla_subtabs"), "'] == 'Index Divergence (Volcano & Biomarkers)'"),
             uiOutput(ns("volcano_comparison_ui"))
          ),
          
          hr(),
          
          # Aesthetics
          radioButtons(ns("scaleMode"), "Measurement Scale:", 
                       choices = c("Log2 Fold Change (Log2FC)" = "log2fc", 
                                   "Fold Change (FC)" = "fc", 
                                   "Raw Ratio Value" = "raw"), 
                       selected = "log2fc"),
          
          hr(),
          sliderInput(ns("plotZoom"), "Viewport Zoom %:", min=10, max=200, value=50, step=1),
          
          hr(),
          radioButtons(ns("labelMode"), "Plot Labeling:", 
                       choices = c("Equation", "Functional Name", "Both"),
                       selected = "Equation"),
          checkboxInput(ns("showSignificantOnly"), "Show ONLY significant indices", value = FALSE),
          radioButtons(ns("sigDisplayType"), "Significance Label Format:",
                       choices = c("Star" = "star", "P-value" = "pvalue"),
                       selected = "star"),
          hr(),
          # Index Selector
          radioButtons(ns("categoryMode"), "Index Category Grouping:", 
                       choices = c("General (3 Categories)" = "general", "Detailed (10 Thematic Categories)" = "detailed"), 
                       selected = "general"),
          uiOutput(ns("indexPickerUI")),
          
          hr(),
          accordion(
            open = FALSE,
            accordion_panel(
              title = "Metrics Dictionary",
              icon = icon("book"),
              
              checkboxInput(ns("display_ontology"), "Display Associated Ontology", value = FALSE),
              
              uiOutput(ns("metrics_dictionary_ui"))
            )
          ),
           hr(),
           actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                        icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3"),
           tags$button(type = "button", class = "btn btn-outline-primary btn-sm w-100 mt-2",
                       onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
                       icon("layer-group"), " Advanced Aesthetics & Ordering")
        ),
        
        # Main Area
        div(style = "display: flex; flex-direction: column;",
          render_tab_intro_card(
            title = "Functional Ratios",
            subtitle = "This module computes and analyzes 41 biochemically defined lipid indices representing membrane structure, signaling, and storage:",
            bullets = list(
              tags$li(tags$strong("Violin Plots:"), " Inspect the distribution probability density of calculated functional ratios across sample groups."),
              tags$li(tags$strong("Index Divergence:"), " Identify significant shifts in indices using volcano plots and extract key functional biomarkers."),
              tags$li(tags$strong("Functional Networks:"), " Map co-regulation networks among indices using absolute Pearson correlation thresholds.")
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
              title = "Bottom Menu: Scroll to and configure Factor Level Ordering, Custom Plot Colors, and Topology below plot",
              icon("layer-group"), tags$strong("Bottom Menu: Advanced Aesthetics")
            )
          ),
          navset_card_tab(
            id = ns("fla_subtabs"),
          nav_panel("Violin Plots (All Selected)",
            jqui_resizable(div(style = "min-height: 60vh; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
              card(
                style = "height: 100%; min-height: 60vh;",
                card_header(
                  class = "d-flex justify-content-between align-items-center",
                  "Functional Ratios Distribution",
                  tags$div(
                    downloadButton(ns("downloadLedger"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                    downloadButton(ns("downloadPlot"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                  )
                ),
                card_body(
                   uiOutput(ns("baseline_status_banner")),
                   tags$div(
                      style = "width: 100%; height: 100%; overflow: auto; border: 1px solid #e9ecef; background: #fff; padding: 10px;",
                      uiOutput(ns("scrollable_plot_ui"))
                   ),
                   uiOutput(ns("fla_violin_stat_note"))
                )
              )
            ), options = list(handles = "s, se"))
          ),
          
          nav_panel("Index Divergence (Volcano & Biomarkers)",
            navset_card_tab(
               id = ns("volcano_subtabs"),
               nav_panel("Functional Volcano",
                  card(
                    card_header(
                       class = "d-flex justify-content-between align-items-center",
                       "Functional Volcano",
                       tags$div(
                          downloadButton(ns("dl_volcano_csv"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                          downloadButton(ns("dl_volcano_pdf"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                       )
                    ),
                    card_body(
                      uiOutput(ns("volcanoPlotUI")),
                      uiOutput(ns("fla_volcano_stat_note"))
                    )
                  )
                ),
               nav_panel("Significant Functional Biomarkers",
                  card(
                    card_header("Significant Functional Biomarkers"),
                    card_body(
                      DTOutput(ns("tableBiomarkers"))
                    )
                  )
                )
             )
           ),
           
          nav_panel("Correlation Network",
            navset_card_tab(
               id = ns("correlation_subtabs"),
               nav_panel("Functional Correlation Circos Plot",
                  card(
                     style = "height: 100%; min-height: 60vh;",
                     card_header(
                         class = "d-flex justify-content-between align-items-center",
                         "Circos Map",
                         tags$div(
                            downloadButton(ns("downloadCircosPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                         )
                      ),
                     card_body(
                        p(class="text-muted small mt-2", "This plot computes pairwise Pearson correlations between the selected indices across all samples and visualizes the strongest absolute links."),
                        uiOutput(ns("circos_dynamic_title")),
                        tags$div(
                           style = "width: 100%; height: 100%; overflow: auto; border: 1px solid #e9ecef; background: #fff; padding: 10px;",
                           uiOutput(ns("circos_zoom_ui"))
                        )
                     )
                  )
               ),
               nav_panel("Significant Correlation Ledger",
                  card(
                     card_header(
                         class = "d-flex justify-content-between align-items-center",
                         "Correlation Statistics",
                         tags$div(
                            downloadButton(ns("downloadCorrCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv")
                         )
                      ),
                     card_body(
                        p(class="text-muted small mt-2", "Detailed Pearson statistics, Fisher Z-scores, and unadjusted P-values for the correlation network."),
                        DT::dataTableOutput(ns("corrTable"))
                     )
                  )
               )
            )
          )
        ),
        
        # ADVANCED AESTHETICS RIBBON
        accordion(
           id = ns("fla_advanced_aesthetics_accordion"),
           open = FALSE,
           class = "mt-3 shadow-sm border border-primary-subtle",
           accordion_panel(
              title = "Advanced Aesthetics & Ordering",
              icon = icon("sliders"),
              
              conditionalPanel(
                 condition = paste0("input['", ns("fla_subtabs"), "'] == 'Violin Plots (All Selected)' || input['", ns("fla_subtabs"), "'] == 'Multivariate Fingerprinting'"),
                 layout_columns(
                    col_widths = c(6, 6),
                    card(
                       card_header(icon("sort"), " Factor Level Ordering"),
                       card_body(
                          p(class="text-muted small", HTML("Select a metadata variable to manually order its levels from left-to-right on the plots.")),
                          selectInput(ns("order_target_var"), "Target Variable:", choices=NULL, width="100%"),
                          uiOutput(ns("level_order_ui"))
                       )
                    ),
                    card(
                       card_header(icon("palette"), " Custom Plot Colors"),
                       card_body(
                          p(class="text-muted small", "Target a specific dimension to define the Violin fill colors mapping override."),
                          selectInput(ns("color_target_var"), "Target Variable (Fill By):", choices=NULL, width="100%"),
                          uiOutput(ns("dynamic_colors_ui"))
                       )
                    )
                 )
              ),
              
              conditionalPanel(
                 condition = paste0("input['", ns("fla_subtabs"), "'] == 'Correlation Network'"),
                 layout_columns(
                    col_widths = c(12),
                    card(
                       card_header(icon("project-diagram"), " Network Topology Parameters"),
                       card_body(
                          sliderInput(ns("corrThresh"), "Minimum Absolute Correlation (|r|):", min=0.5, max=0.99, value=0.85, step=0.01),
                          sliderInput(ns("maxLinks"), "Maximum Links to Display:", min=5, max=50, value=20, step=1),
                          checkboxInput(ns("plot_ontology_circos"), tags$span("Overlay Ontology Labels", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Overlays descriptive biological pathways or lipid ontology classification labels directly onto the plots.")), value = FALSE)
                       )
                    )
                 )
              ),
              
              conditionalPanel(
                 condition = paste0("input['", ns("fla_subtabs"), "'] == 'Index Divergence (Volcano & Biomarkers)'"),
                 layout_columns(
                    col_widths = c(12),
                    card(
                       card_header(icon("chart-area"), " Volcano Plot Settings"),
                       card_body(
                          checkboxInput(ns("plot_ontology_volcano"), tags$span("Overlay Ontology Labels", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Overlays descriptive biological pathways or lipid ontology classification labels directly onto the plots.")), value = FALSE),
                          sliderInput(ns("volcano_height"), "Volcano Plot Height (px)", min=400, max=2000, value=600, step=50),
                       sliderInput(ns("volcano_width"), "Volcano Plot Width (px)", min=400, max=2400, value=1200, step=50)
                       )
                    )
                 )
              )
           )
        )
      )
    )
  )
}

# longitudinal_ui (11_longitudinal)
longitudinal_ui <- function(id) {
  ns <- NS(id)
  tagList(
    tags$style(HTML("
      /* Custom styles for the drag-and-drop designer */
      .rank-list-item {
        padding: 6px 12px !important;
        margin: 3px 0 !important;
        font-size: 12px !important;
        line-height: 1.2 !important;
        background-color: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 4px !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.02) !important;
        cursor: grab !important;
      }
      .rank-list-item:hover {
        background-color: #edf2f7 !important;
        border-color: #cbd5e0 !important;
      }
      .rank-list-container {
        padding: 2px !important;
        min-height: 25px !important;
        margin-bottom: 0 !important;
      }
      .designer-bucket {
        min-height: 35px !important;
        background-color: #f8f9fa !important;
        border: 1px dashed #cbd5e0 !important;
        border-radius: 4px !important;
        padding: 3px !important;
      }
      .longitudinal-compact-sidebar .control-label,
      .longitudinal-compact-sidebar label {
        font-size: 11px !important;
      }
      .longitudinal-compact-sidebar .selectize-input,
      .longitudinal-compact-sidebar .selectize-dropdown {
        font-size: 11px !important;
        line-height: 1.2 !important;
      }
      .longitudinal-compact-sidebar .selectize-input {
        padding: 4px 8px !important;
        min-height: 28px !important;
      }
      .longitudinal-compact-sidebar .checkbox label,
      .longitudinal-compact-sidebar .checkbox label span {
        font-size: 11px !important;
      }
    ")),
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = c("0. Nomenclature", "1. Scope & Settings", "2. Cohorts & Trajectories"), multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Scope & Settings", icon = icon("cogs"),
            radioButtons(ns("localStatMethod"), "Statistical Mode Choice:",
                         choices = c("Automatic mode" = "auto",
                                     "Parametric (paired t-test)" = "parametric",
                                     "Non-Parametric (paired Wilcoxon)" = "non_parametric"),
                         selected = "auto"),
            selectInput(ns("patientLayout"), tags$span("Patient Layout:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Determines if patient trajectories are plotted in separate columns or overlaid on the same plot to visualize temporal trends.")), 
                        choices = c("Selected Subgroups Grid" = "all"),
                        selected = "all"),
            selectInput(ns("timecourseLayout"), tags$span("Timecourse Layout:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Determines if patient trajectories are plotted in separate columns or overlaid on the same plot to visualize temporal trends.")),
                        choices = c("Single Plot (All on same X)" = "single", "Separate Plot per Timecourse" = "separate"),
                        selected = "single"),
            radioButtons(ns("patientFilterMode"), tags$span("Patient Pairing / Filtering:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Configures matched-sample pairing and controls how missing time points for individual patients are filtered.")),
                         choices = c("All Dots (Show all samples)" = "all_dots",
                                     "Paired in Same Timecourse" = "paired_tc",
                                     "Paired in All Timecourses" = "paired_all"),
                         selected = "all_dots"),
            checkboxInput(ns("showSignificantOnly"), "Show ONLY significant metrics", value = FALSE)
          ),
          accordion_panel("2. Cohorts & Trajectories", icon = icon("users"),
            div(
              class = "longitudinal-compact-sidebar",
              p(class="text-muted small", style="font-size: 11px;", "Select grouping/timepoint variables, check timepoints, and drag cohorts to design timecourse lines:"),
              uiOutput(ns("cohort_variable_selectors_ui")),
              uiOutput(ns("cohort_selectors_ui")),
              hr(style = "margin: 10px 0;"),
              uiOutput(ns("trajectory_designer_ui")),
              actionButton(ns("submit_longitudinal_btn"), "Generate Analysis", class = "btn-primary w-100 mt-2", icon = icon("play"), style = "font-size: 11px; font-weight: 500; padding: 4px 8px;")
            )
          ),
          accordion_panel("3. Patient IDs", icon = icon("id-card"),
            p(class="text-muted small", "Select which patient groups to show, or design new ones:"),
            uiOutput(ns("saved_patient_groups_list_ui")),
            hr(style = "margin: 10px 0;"),
            wellPanel(
              style = "padding: 10px; margin-bottom: 0; background-color: #f8f9fa; border: 1px solid #dee2e6;",
              h6(style = "font-weight: bold; margin-bottom: 8px; font-size: 12px;", "Create New Patient Group"),
              textInput(ns("new_group_name"), "Group Name:", placeholder = "e.g. Responders"),
              selectizeInput(ns("new_group_pts"), "Select Patients:", choices = NULL, multiple = TRUE, width = "100%"),
              actionButton(ns("btn_add_patient_group"), "Add Group", class = "btn-success btn-sm w-100", icon = icon("plus"))
            )
          )
        ),
        hr(),
        layout_columns(
          col_widths = c(6, 6),
          downloadButton(ns("downloadCSV"), "CSV", class = "btn-sm btn-outline-secondary btn-download-csv w-100"),
          downloadButton(ns("downloadPlot"), "PDF", class = "btn-sm btn-outline-secondary btn-download-pdf w-100")
        ),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      div(style = "display: flex; flex-direction: column;",
        render_tab_intro_card(
          title = "Longitudinal",
          subtitle = "This module tracks abundance trajectories and temporal dynamics across sequential timepoints. For the best use of this feature, it is required to annotate which part of the sample name represents the timepoint under the metadata mapping settings:",
          bullets = list(
            tags$li(tags$strong("Temporal Visualization:"), " Plot temporal trajectories across sequential timepoints for lipid categories, lipid main classes, individual species, structural parameters (carbons, double bonds), or calculated functional ratios."),
            tags$li(tags$strong("Cohort & Group Comparison:"), " Evaluate and compare trajectories across custom patient groups, cohorts, or distinct experimental conditions in either single-timepoint status checks or multi-timepoint longitudinal trend analyses.")
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
            title = "Bottom Menu: Configure Timepoint Ordering, Factor Level Ordering, and Color Overrides below plot",
            icon("layer-group"), tags$strong("Bottom Menu: Advanced Aesthetics")
          )
        ),
        navset_card_tab(
          id = ns("longitudinal_tabs"),
        nav_panel("Lipid Categories",
          card(
            card_body(
              uiOutput(ns("macroclass_selector_ui")),
              jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
                plotOutput(ns("macroclass_plot"), height="auto")
              )),
              uiOutput(ns("longitudinal_stat_note_1"))
            )
          )
        ),
        nav_panel("Lipid Main Classes",
          card(
            card_body(
              uiOutput(ns("subclass_selector_ui")),
              jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
                plotOutput(ns("subclass_plot"), height="auto")
              )),
              uiOutput(ns("longitudinal_stat_note_2"))
            )
          )
        ),
        nav_panel("Functional Indices",
          card(
            card_body(
              uiOutput(ns("index_selector_ui")),
              jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
                plotOutput(ns("index_plot"), height="auto")
              )),
              uiOutput(ns("longitudinal_stat_note_3"))
            )
          )
        ),
        nav_panel("Structural Features",
          card(
            card_body(
              uiOutput(ns("struct_selector_ui")),
              jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
                plotOutput(ns("struct_plot"), height="auto")
              )),
              uiOutput(ns("longitudinal_stat_note_4"))
            )
          )
        ),
        nav_panel("All Metrics",
          card(
            card_body(
              uiOutput(ns("allmetrics_selector_ui")),
              uiOutput(ns("allmetrics_status")),
              jqui_resizable(div(style = "min-height: 400px; max-height: 850px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow-y: auto;",
                plotOutput(ns("allmetrics_plot"), height="auto")
              )),
              uiOutput(ns("longitudinal_stat_note_5"))
            )
          )
        ),
        nav_panel("Significance Ledger",
          card(
            card_body(
              p(class="text-muted small", "Paired t-test results for each metric and contrast."),
              DT::DTOutput(ns("ledger_table"))
            )
          )
        )
      )
    )
  ),
    
    # ADVANCED AESTHETICS & ORDERING ACCORDION
    accordion(
      open = FALSE,
      accordion_panel(
        title = "Advanced Aesthetics & Ordering",
        icon = icon("sliders"),
        layout_columns(
          col_widths = c(4, 4, 4),
          
          # Column 1: Timepoint Ordering
          card(
            card_header(icon("clock"), " Timepoint Ordering"),
            card_body(
              p(class="text-muted small", "Drag to order the active timepoints/cohorts from left-to-right on the x-axis."),
              uiOutput(ns("timepoint_order_ui")),
              hr(),
              radioButtons(ns("sig_filter_mode"), "Significance Filter:", 
                           choices = c("Show All trajectories" = "all",
                                       "Color Only Significant Transitions" = "color_sig",
                                       "Only Draw Significant Transitions" = "draw_sig"),
                           selected = "all")
            )
          ),
          
          # Column 2: Factor Level Ordering
          card(
            card_header(icon("sort"), " Factor Level Ordering"),
            card_body(
              p(class="text-muted small", HTML("Select a metadata variable to manually order its levels on the plots.")),
              selectInput(ns("order_target_var"), "Target Variable:", choices=NULL, width="100%"),
              uiOutput(ns("level_order_ui"))
            )
          ),
          
          # Column 3: Custom Colors & Aesthetics
          card(
            card_header(icon("palette"), " Custom Plot Colors"),
            card_body(
              p(class="text-muted small", "Customize Cohort colors (points) and Trajectory direction colors (lines)."),
              uiOutput(ns("cohort_colors_ui")),
              hr(),
              uiOutput(ns("direction_colors_ui"))
            )
          )
        )
      )
    )
  )
}

# pathway_ui (13_pathway)
pathway_ui <- function(id) {
  ns <- NS(id)
  layout_sidebar(
    sidebar = sidebar(
      width = 350,
      open = "desktop",
      # Hidden inputs for JSON serialization/hydration (session restore compatible)
      tags$div(style = "display: none;",
        textInput(ns("active_classes_json"), "", value = jsonlite::toJSON(DEFAULT_PATHWAY_CLASSES)),
        textInput(ns("custom_nodes_json"), "", value = "{}"),
        textInput(ns("added_edges_json"), "", value = "[]"),
        textInput(ns("removed_edges_json"), "", value = "[]"),
        textInput(ns("position_overrides_json"), "", value = "{}")
      ),
      accordion(
        open = c("0. Nomenclature", "1. Active Contrast", "7. Options & Configuration", "8. Dynamic Physics Flow"), multiple = TRUE,
        accordion_panel("0. Nomenclature", icon = icon("font"),
          radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                       choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                       selected = "short")
        ),
        accordion_panel("1. Active Contrast", icon = icon("scale-balanced"),
          uiOutput(ns("contrastInfoUI"))
        ),
        accordion_panel("2. Layout Presets", icon = icon("wand-magic-sparkles"),
          p(class="text-muted small", "Set starting class layout."),
          layout_columns(col_widths = c(4, 4, 4),
            actionButton(ns("preset_default"), "Default (18)", class = "btn-sm btn-outline-primary"),
            actionButton(ns("preset_all"), "All (28)", class = "btn-sm btn-outline-secondary"),
            actionButton(ns("preset_clear"), "Scratch", class = "btn-sm btn-outline-danger")
          )
        ),
        accordion_panel("3. Node Visibility", icon = icon("eye"),
          p(class="text-muted small", "Choose which lipid class nodes to show."),
          checkboxInput(ns("only_detected_classes"), "Show only classes present in dataset", value = FALSE),
          uiOutput(ns("activeClassesSelectorUI"))
        ),
        accordion_panel("4. Move Nodes", icon = icon("arrows-up-down-left-right"),
          p(class="text-muted small", "Customize node coordinates."),
          uiOutput(ns("moveNodeSelectorUI")),
          numericInput(ns("move_x"), "X Position:", value = 0, step = 0.5),
          numericInput(ns("move_y"), "Y Position:", value = 0, step = 0.5),
          actionButton(ns("move_node_btn"), "Move Node", icon = icon("location-arrow"), class = "btn-primary btn-sm w-100 mt-2")
        ),
        accordion_panel("5. Add Custom Class", icon = icon("plus"),
          p(class="text-muted small", "Add an unlisted lipid class."),
          textInput(ns("add_node_name"), "Class Abbreviation:", placeholder = "e.g. TG-O"),
          numericInput(ns("add_node_x"), "X Coordinate:", value = 0),
          numericInput(ns("add_node_y"), "Y Coordinate:", value = 0),
          actionButton(ns("add_node_btn"), "Add Custom Node", icon = icon("plus-circle"), class = "btn-success btn-sm w-100 mt-2")
        ),
        accordion_panel("6. Manage Custom Edges", icon = icon("diagram-project"),
          p(class="text-muted small", "Add or remove connections between active classes."),
          uiOutput(ns("edgeRemovalUI")),
          actionButton(ns("remove_edge_btn"), "Remove Selected Edge", icon = icon("trash"), class = "btn-danger btn-sm w-100 mt-2"),
          hr(),
          p(class="text-muted small", "Add new connection:"),
          uiOutput(ns("edgeAddSourceUI")),
          uiOutput(ns("edgeAddTargetUI")),
          actionButton(ns("add_edge_btn"), "Add Edge", icon = icon("plus"), class = "btn-success btn-sm w-100 mt-2")
        ),
        accordion_panel("7. Options & Configuration", icon = icon("gears"),
          checkboxInput(ns("show_grid"), 
                        tags$span("Show Coordinate Grid (Positioning)", 
                                  bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                                 "Overlays an alignment grid on the map. Useful for precisely placing and aligning nodes when custom positioning is needed.")), 
                        value = FALSE),
          checkboxInput(ns("filter_consolidated"), 
                        tags$span("Exclude consolidated format lipids (e.g. PC(34:1)) from saturation ratio", 
                                  bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                                 "Excludes lipids with unresolved fatty acid structures (where individual sn-1/sn-2 chains are unknown) from saturation ratio calculations to ensure biochemically precise indices.")), 
                        value = TRUE),
          hr(),
          p(class="text-muted small", tags$b("Node Mapping Settings:")),
          selectInput(ns("node_color_map"), "Map Node Color to:", 
                      choices = c("Saturation Change (Z-score)" = "sat_zscore",
                                  "Saturation Change (Log2FC)" = "sat_log2fc",
                                  "Saturation Ratio (Absolute)" = "sat", 
                                  "Carbon Length Change (\u0394C)" = "carbon", 
                                  "Log2 Fold Change" = "fc"), 
                      selected = "sat_zscore"),
          selectInput(ns("node_size_map"), "Map Node Size to:", 
                      choices = c("Fold Change Magnitude" = "fc_mag", 
                                  "Class Abundance (Log-scaled)" = "abundance"), 
                      selected = "abundance"),
          hr(),
          p(class="text-muted small", tags$b("Node Label Display Options:")),
          checkboxInput(ns("label_show_delta_c"), "Show Carbon Length Change (\u0394C)", value = TRUE),
          checkboxInput(ns("label_show_sat_z"), "Show Saturation Change (Z-score)", value = FALSE),
          checkboxInput(ns("label_show_log2fc"), "Show Abundance Log2 Fold Change (Log2FC)", value = FALSE),
          hr(),
          p(class="text-muted small", tags$b("Significance Overlay:")),
          checkboxInput(ns("show_significance"), "Show significance markers on map", value = FALSE),
          selectInput(ns("significance_type"), "Display style:", choices = c("Stars" = "stars", "P-value" = "pvalue", "Both" = "both"), selected = "stars"),
          numericInput(
            ns("sig_threshold"),
            tags$span(
              "Significance Threshold (p <):",
              bslib::tooltip(
                icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
                "Applies a statistical significance filter cutoff. Lipids with a p-value strictly below this cutoff threshold will display significance highlight markers on the metabolic pathway network map."
              )
            ),
            value = 0.05, min = 0, max = 1, step = 0.01
          ),
          selectInput(ns("sig_adj_method"), "P-value type:", choices = c("Raw P-value" = "raw", "BH Adjusted (FDR)" = "BH"), selected = "raw"),
          hr(),
          p(class="text-muted small", "Import/Export Layout Configuration JSON:"),
          downloadButton(ns("download_config"), "Download Layout JSON", class = "btn-download-layout-json btn-sm w-100 mb-2"),
          fileInput(ns("upload_config"), "Upload Layout JSON (.json):", accept = c(".json"), width = "100%")
        ),
        accordion_panel("8. Dynamic Physics Flow", icon = icon("atom"),
          p(class="text-muted small", "Control the interactive bubble collision and rebounding physics engine:"),
          checkboxInput(ns("enable_physics"), "Enable Dynamic Physics Flow", value = TRUE),
          sliderInput(ns("overlap_avoidance"), "Repulsion & Bump Force:", min = 0.5, max = 2.0, value = 1.0, step = 0.1),
          sliderInput(ns("spring_length"), "Spring Connection Distance:", min = 60, max = 200, value = 120, step = 10),
          actionButton(ns("stabilize_physics_btn"), "Stabilize & Settle Layout", icon = icon("anchor"), class = "btn-outline-primary btn-sm w-100 mt-1")
        )
      )
    ),
    jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
      render_tab_intro_card(
        title = "Lipid Pathways",
        subtitle = "This module overlays lipid abundance, carbon length changes, and saturation shifts onto an interactive metabolic pathway map:",
        bullets = list(
          tags$li(tags$strong("Dynamic Physics Flow:"), " Drag and position class bubbles with active physics flow that bumps neighboring bubbles and causes them to bounce and rebound."),
          tags$li(tags$strong("Biochemical Shifts:"), " Map saturation change, carbon chain length, or log2 fold changes directly onto node sizes and colors.")
        ),
        collapse_id = ns("intro_collapse")
      ),
      card(
        card_header(
          class = "d-flex justify-content-between align-items-center",
          "Lipid Metabolic Pathway Map",
          tags$div(
            downloadButton(ns("downloadPlotCSV"), "CSV", class = "btn-sm btn-outline-secondary py-0 btn-download-csv", style = "margin-right: 5px;"),
            downloadButton(ns("downloadPlotPDF"), "PDF", class = "btn-sm btn-outline-secondary py-0 btn-download-pdf")
          )
        ),
        card_body(
          uiOutput(ns("de_not_run_banner")),
          navset_card_pill(
            id = ns("pathway_view_type"),
            selected = "Dynamic Physics Flow",
            nav_panel(
              "Dynamic Physics Flow",
              icon = icon("atom"),
              tags$div(
                style = "margin-bottom: 8px; font-size: 12px; color: #475569; background-color: #f1f5f9; padding: 6px 12px; border-radius: 6px;",
                icon("hand-pointer", class = "text-primary me-1"),
                tags$strong("Interactive Physics:"), " Click and drag any lipid bubble to move it across the canvas. Dynamic flow physics will actively bump neighboring bubbles and cause them to bounce and rebound."
              ),
              visNetworkOutput(ns("pathwayVisNetwork"), height = "720px")
            ),
            nav_panel(
              "Cartesian Grid Map",
              icon = icon("table-cells"),
              plotlyOutput(ns("pathwayPlot"), height = "700px")
            )
          ),
          uiOutput(ns("pathwayCaptionUI"))
        )
      )
    )),
    hr(),
    card(
      card_header("Lipid Class Pathway Summary Table"),
      card_body(
        DT::dataTableOutput(ns("summaryTable"))
      )
    )
  )
}

# cellular_org_ui (14_cellular_org)
cellular_org_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = c("0. Nomenclature", "1. Analysis Options", "2. Data Visualization"), multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Analysis Options", icon = icon("filter"),
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
            
            uiOutput(ns("baselineSelectorUI")),
            hr(),
            helpText("Calculates exploratory lipid-derived stress, peroxidation-propensity, and storage/complexity indices. These are compositional proxies, not direct organelle-function, ferroptosis, or macrophage-state measurements.")
          ),
          accordion_panel("2. Data Visualization", icon = icon("paint-brush"),
            accordion(
              open = "M1/M2 Lipid Proxy", multiple = TRUE,
              accordion_panel("M1/M2 Lipid Proxy", icon = icon("users"),
                strong("Coloring"),
                checkboxGroupInput(ns("colorGrouping"), "Color Samples By:", 
                                   choices = c("Group1", "Group2", "TimePoint", "PatientNumber"), selected = c("Group1"), inline = TRUE),
                checkboxGroupInput(ns("labelParts"), "Label content:", 
                                   choices = c("Group1", "Group2", "Replicate", "TimePoint", "PatientNumber"), selected = c("Group1"), inline = TRUE),
                checkboxInput(ns("showLabels"), "Show Sample Labels", FALSE),
                checkboxInput(ns("useCustomColors"), "Override sample colors?", FALSE),
                uiOutput(ns("customColorUI")), 
                hr(),
                strong("Shaping"),
                checkboxInput(ns("useShapes"), "Use different shapes for groups?", value = FALSE),
                conditionalPanel("input.useShapes == true", ns = ns,
                  radioButtons(ns("shapeGrouping"), "Shape Samples By:", choices = c("Group1", "Group2", "TimePoint", "PatientNumber"), selected = "Group2", inline = TRUE),
                  uiOutput(ns("customShapeUI"))
                )
              ),
              accordion_panel("Plot Styling", icon = icon("ruler-combined"),
                sliderInput(ns("textSize"), "Plot Font Size:", min = 10, max = 22, value = 14, step = 1),
                numericInput(ns("pointSize"), "Scatter Dot Size:", value = 4, min = 1, step = 0.5),
                hr(),
                radioButtons(ns("sigDisplayType"), "Significance Label Format:",
                             choices = c("Star" = "star", "P-value" = "pvalue"),
                             selected = "star")
              )
            )
          )
        ),
        hr(),
        actionButton(ns("show_stats_detail"), 
                     tags$span("Show Statistic Detail", 
                               bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), 
                                              "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Cellular Organization",
          subtitle = "This module summarizes lipid abundance as exploratory compositional proxies:",
          bullets = list(
            tags$li(tags$strong("Subcellular Stress Profiles:"), " Compare lipid-ratio proxies related to membrane composition and organelle-associated lipid classes."),
            tags$li(tags$strong("Cellular Peroxidation Index:"), " Summarize polyunsaturation as a lipid-derived peroxidation-propensity proxy, not a ferroptosis assay."),
            tags$li(tags$strong("Phenotypic State Map:"), " Compare neutral-storage and structural-complexity lipid axes; M1/M2 labels are exploratory hypotheses, not measured cell states.")
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
        navset_card_tab(
          id = ns("org_tabs"),
          nav_panel("Subcellular Lipid Profiles", 
            card_header(
              class = "d-flex justify-content-between align-items-center",
              "Organelle-associated Lipid Profile Comparison",
              tags$div(
                downloadButton(ns("downloadStressCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                downloadButton(ns("downloadStressPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
              )
            ),
            card_body(
              uiOutput(ns("baseline_status_banner_stress")),
              div(style = "width: 100%; overflow-x: auto;", 
                  jqui_resizable(div(style = "min-width: 840px;", plotOutput(ns("stressPlot"), height = "1550px")))),
              uiOutput(ns("stress_note")),
              markdown("
> **Lipid-derived index interpretation**: These compositional ratios do not establish organelle function or a causal mechanism.
> * **PE/PC ratio**: Relative phosphatidylethanolamine to phosphatidylcholine abundance; it may motivate a membrane-curvature hypothesis but does not measure ER morphology.
> * **PC saturation ratio**: Log2 ratio of saturated to unsaturated PC. Negative values indicate relatively more unsaturated PC; membrane fluidity is not measured here.
> * **PG/CL ratio**: Relative phosphatidylglycerol to cardiolipin abundance. Cardiolipin maturation or remodeling would require independent validation.
> * **Acylcarnitine fraction**: Acylcarnitine abundance relative to total measured lipids; it does not measure fatty acid oxidation flux.
> * **BMP/LBPA fraction**: BMP/LBPA abundance relative to total measured lipids; it does not measure lysosomal capacity.
> * **VLCFA/ether ratio**: Very-long-chain fatty acids relative to ether lipids; it does not establish peroxisomal transport or oxidase failure.
> * **Cer/SM ratio**: Ceramide relative to sphingomyelin abundance; it does not establish a Golgi secretory or conversion block.
              ")
            )
          ),
          nav_panel("Peroxidation Proxy (CPI)", 
            card_header(
              class = "d-flex justify-content-between align-items-center",
              "Cellular Peroxidation Index (CPI) Lipid Proxy",
              tags$div(
                downloadButton(ns("downloadCpiCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                downloadButton(ns("downloadCpiPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
              )
            ),
            card_body(
              uiOutput(ns("baseline_status_banner_cpi")),
              jqui_resizable(plotOutput(ns("cpiPlot"), height = "600px")),
              uiOutput(ns("cpi_note")),
              markdown("
> **CPI Formula**: CPI = (0.014 × % monoenoic) + (1.0 × % dienoic) + (2.0 × % trienoic) + (3.2 × % tetraenoic) + (4.0 × % pentaenoic) + (5.4 × % hexaenoic).
> Higher scores reflect greater weighted polyunsaturation in this lipid-composition index. CPI is an exploratory proxy; it does not measure GPX4 response, ferroptosis, or cell death.
              ")
            )
          ),
          nav_panel("M1/M2 Lipid Proxy (Exploratory)", 
            card_header(
              class = "d-flex justify-content-between align-items-center",
              "Storage vs. Complexity (Exploratory M1/M2 Proxy)",
              tags$div(
                downloadButton(ns("downloadPolarCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                downloadButton(ns("downloadPolarPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
              )
            ),
            card_body(
              jqui_resizable(plotOutput(ns("polarPlot"), height = "600px")),
              uiOutput(ns("polar_note")),
              markdown("
> **Lipid-composition quadrants** (relative to this dataset):
> * **High storage, low complexity**: Relatively more neutral storage lipids (TGs, DGs, CEs).
> * **Low storage, high complexity**: Relatively more ether and complex membrane lipids.
> * **High on both axes**: Higher neutral storage and membrane complexity indices.
> * **Low on both axes**: Lower values on both lipid-composition indices.
> These patterns can motivate an M1/M2 hypothesis only after cell type is established and an independent phenotype assay confirms it.
              ")
            )
          )
        )
      )),
      
      # ADVANCED AESTHETICS RIBBON
      accordion(
         open = FALSE,
         accordion_panel(
            title = "Advanced Aesthetics & Ordering",
            icon = icon("sliders"),
            
            layout_columns(
               col_widths = c(6, 6),
               card(
                  card_header(icon("sort"), " Factor Level Ordering"),
                  card_body(
                     p(class="text-muted small", HTML("Select a metadata variable to manually order its levels from left-to-right on the plots.")),
                     selectInput(ns("order_target_var"), "Target Variable:", choices=NULL, width="100%"),
                     uiOutput(ns("level_order_ui"))
                  )
               ),
               card(
                  card_header(icon("palette"), " Custom Plot Colors"),
                  card_body(
                     p(class="text-muted small", "Target a specific dimension to define the plot fill and color overrides."),
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

# math_proof_ui (15_math_proof)
math_proof_ui <- function(id) {
  ns <- NS(id)
  
  with_pinned_mathjax(
    tagList(
      # Fixed-version KaTeX assets; SRI fails closed if CDN bytes change.
      tags$head(
        tags$link(rel = "stylesheet", href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css", integrity = "sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV", crossorigin = "anonymous"),
        tags$script(src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js", integrity = "sha384-XjKyOOlGwcjNTAIQHIpgOno0Hl1YQqzUOEleOLALmuqehneUG+vnGctmUb0ZY0l8", crossorigin = "anonymous"),
        tags$script(src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js", integrity = "sha384-+VBxd3r6XgURycqtZ117nYw44OOcIax56Z4dCRWbxyPt0Koah1uHoK0o4+/RRE05", crossorigin = "anonymous"),
        tags$script(type = "text/x-mathjax-config", HTML("
          MathJax.Hub.Config({
            tex2jax: {
              inlineMath: [['$','$'], ['\\\\(','\\\\)']],
              displayMath: [['$$','$$'], ['\\\\[','\\\\]']],
              processEscapes: true
            },
            'HTML-CSS': { linebreaks: { automatic: true }, scale: 105 },
            SVG: { linebreaks: { automatic: true } }
          });
        ")),
        tags$script(HTML("
          var _mathRenderDebounce = null;
          function renderPublicationMath(specificTarget) {
            if (_mathRenderDebounce) {
              clearTimeout(_mathRenderDebounce);
            }
            _mathRenderDebounce = setTimeout(function() {
              _mathRenderDebounce = null;
              var targets = [];
              if (specificTarget && specificTarget.nodeType === 1) {
                targets = [specificTarget];
              } else if (typeof specificTarget === 'string') {
                targets = Array.prototype.slice.call(document.querySelectorAll(specificTarget));
              } else {
                var defaultTargets = document.querySelectorAll(
                  '#math_proof_tab-proof_content, .export-matrix-modal-content, .modal-demonstration-container, .math-slider-container, .math-step-card'
                );
                targets = Array.prototype.slice.call(defaultTargets);
              }
              
              if (targets.length === 0) return;
              
              targets.forEach(function(el) {
                if (!el) return;
                if (window.renderMathInElement) {
                  try {
                    renderMathInElement(el, {
                      delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\\\(', right: '\\\\)', display: false},
                        {left: '\\\\[', right: '\\\\]', display: true}
                      ],
                      throwOnError: false,
                      ignoredClasses: ['katex', 'katex-html', 'katex-mathml', 'table', 'dataTable']
                    });
                  } catch(e) {}
                } else if (window.MathJax) {
                  try {
                    if (window.MathJax.typesetPromise) {
                      window.MathJax.typesetPromise([el]);
                    } else if (window.MathJax.Hub) {
                      window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, el]);
                    }
                  } catch(e) {}
                }
              });
            }, 50);
          }
          
          // Scoped tab event listener: ONLY triggers for math proof tabs or export modals
          $(document).on('shown.bs.tab', function(e) {
            var $target = $(e.target);
            var isMathProofTab = $target.closest('#math_proof_tab-stepper_tabs, .export-matrix-modal-content').length > 0 ||
                                 $target.attr('href') === '#math_proof_tab-proof_content' ||
                                 $target.attr('data-bs-target') === '#math_proof_tab-proof_content' ||
                                 $target.data('target') === 'step1' || $target.data('target') === 'step2' ||
                                 $target.data('target') === 'step3' || $target.data('target') === 'step4' ||
                                 $target.data('target') === 'step5' || $target.data('target') === 'overview' ||
                                 $target.text().indexOf('Math Proof') !== -1;
            if (isMathProofTab) {
              renderPublicationMath('#math_proof_tab-proof_content');
            }
          });
          
          // Scoped shiny:value listener: ONLY triggers if the updated output is math proof content
          $(document).on('shiny:value', function(e) {
            if (e.target && (e.target.id === 'math_proof_tab-proof_content' || $(e.target).closest('#math_proof_tab-proof_content').length > 0)) {
              renderPublicationMath(e.target);
            }
          });
          
          window.switchTierMath = function(elem, targetView) {
            var container = $(elem).closest('.math-slider-container');
            if (!container.length) return;
            
            if (targetView === 'normal') {
              container.find('.math-view-normal').stop(true, true).show();
              container.find('.math-view-hoverable').stop(true, true).hide();
              
              var btnNormal = container.find('.math-dot-btn[data-view=normal]');
              var btnHover = container.find('.math-dot-btn[data-view=hoverable]');
              btnNormal.addClass('active');
              btnNormal.find('.dot-symbol').text('●').removeClass('text-muted').addClass('text-primary');
              btnNormal.find('.dot-text').removeClass('text-muted fw-normal').addClass('text-dark fw-semibold');
              
              btnHover.removeClass('active');
              btnHover.find('.dot-symbol').text('○').removeClass('text-primary').addClass('text-muted');
              btnHover.find('.dot-text').removeClass('text-dark fw-semibold').addClass('text-muted fw-normal');
              
              var dots = container.find('.carousel-dot');
              dots.filter('[data-view=normal]').addClass('active');
              dots.filter('[data-view=hoverable]').removeClass('active');
            } else {
              container.find('.math-view-normal').stop(true, true).hide();
              container.find('.math-view-hoverable').stop(true, true).show();
              
              var btnNormal = container.find('.math-dot-btn[data-view=normal]');
              var btnHover = container.find('.math-dot-btn[data-view=hoverable]');
              btnHover.addClass('active');
              btnHover.find('.dot-symbol').text('●').removeClass('text-muted').addClass('text-primary');
              btnHover.find('.dot-text').removeClass('text-muted fw-normal').addClass('text-dark fw-semibold');
              
              btnNormal.removeClass('active');
              btnNormal.find('.dot-symbol').text('○').removeClass('text-primary').addClass('text-muted');
              btnNormal.find('.dot-text').removeClass('text-dark fw-semibold').addClass('text-muted fw-normal');
              
              var dots = container.find('.carousel-dot');
              dots.filter('[data-view=hoverable]').addClass('active');
              dots.filter('[data-view=normal]').removeClass('active');
            }
            
            if (typeof renderPublicationMath === 'function') {
              renderPublicationMath(container[0]);
            }
          };
          
          $(document).on('change', 'input[type=checkbox][id*=enable_hover]', function() {
            var isHover = $(this).is(':checked');
            var target = isHover ? 'hoverable' : 'normal';
            $('.math-slider-container').each(function() {
              var btn = $(this).find('.math-dot-btn[data-view=' + target + ']');
              if (btn.length) {
                window.switchTierMath(btn[0], target);
              }
            });
          });
        "))
      ),
      
      # Journal-Grade CSS Typography & Layout
      tags$style(HTML(paste0("
        .", ns("scroll-container"), " {
          overflow-y: auto !important;
          overflow-x: hidden !important;
          max-height: calc(100vh - 85px);
          padding-right: 14px;
          padding-left: 4px;
          padding-top: 4px;
          padding-bottom: 80px;
          scrollbar-width: thin;
          scrollbar-color: #64748b #f1f5f9;
        }
        .", ns("scroll-container"), "::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .", ns("scroll-container"), "::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 8px;
        }
        .", ns("scroll-container"), "::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 8px;
          border: 2px solid #f1f5f9;
        }
        .", ns("scroll-container"), "::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
        .", ns("stepper-card"), " {
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          margin-bottom: 16px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.04);
          background-color: #ffffff;
        }
        .", ns("math-slider-container"), " {
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background-color: #ffffff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.03);
          margin: 16px 0 20px 0;
          overflow: visible !important;
          position: relative;
          z-index: 20;
        }
        .", ns("math-slider-container"), " .math-view {
          overflow: visible !important;
          position: relative;
        }
        .", ns("math-slider-container"), " .math-view-hoverable {
          overflow: visible !important;
          position: relative;
          padding-top: 24px !important;
          padding-bottom: 20px !important;
        }
        .", ns("math-slider-container"), " .math-view-hoverable .", ns("math-display"), " {
          overflow: visible !important;
          overflow-x: visible !important;
          overflow-y: visible !important;
          position: relative;
        }
        .", ns("math-slider-container"), " .math-dot-btn {
          border: 1px solid transparent;
          border-radius: 4px;
          transition: all 0.15s ease;
          padding: 2px 8px !important;
          cursor: pointer;
        }
        .", ns("math-slider-container"), " .math-dot-btn:hover {
          background-color: #f1f5f9;
        }
        .", ns("math-slider-container"), " .math-dot-btn.active {
          background-color: #ffffff;
          border-color: #cbd5e1;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .", ns("math-slider-container"), " .carousel-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: #cbd5e1;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid #94a3b8;
        }
        .", ns("math-slider-container"), " .carousel-dot:hover {
          background-color: #93c5fd;
          transform: scale(1.15);
        }
        .", ns("math-slider-container"), " .carousel-dot.active {
          background-color: #2563eb;
          border-color: #1d4ed8;
          width: 24px;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(37, 99, 235, 0.35);
        }
        .", ns("tier-box"), " {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 16px 20px;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          overflow: visible !important;
          position: relative;
        }
        .", ns("tier-header"), " {
          font-size: 0.86rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .", ns("tier-header"), ".tier1 { color: #1e40af; border-bottom: 2px solid #dbeafe; padding-bottom: 5px; }
        .", ns("tier-header"), ".tier2 { color: #0369a1; border-bottom: 2px solid #e0f2fe; padding-bottom: 5px; }
        .", ns("tier-header"), ".tier3 { color: #15803d; border-bottom: 2px solid #dcfce7; padding-bottom: 5px; }
        
        .", ns("tier-narrative"), " {
          font-size: 0.91rem;
          color: #334155;
          line-height: 1.55;
          margin-bottom: 10px;
          background-color: #f8fafc;
          padding: 10px 14px;
          border-radius: 6px;
          border-left: 3px solid #64748b;
        }
        .", ns("tier-narrative"), ".tier1-desc { border-left-color: #3b82f6; }
        .", ns("tier-narrative"), ".tier2-desc { border-left-color: #0284c7; }
        .", ns("tier-narrative"), ".tier3-desc { border-left-color: #16a34a; }
        
        /* Unified Math Display */
        .", ns("math-display"), " {
          font-family: 'KaTeX_Math', 'Cambria Math', 'Latin Modern Math', 'STIX Two Math', Georgia, serif;
          font-size: 1.28rem;
          text-align: center;
          margin: 12px 0;
          padding: 14px 18px;
          background-color: #ffffff;
          border-radius: 6px;
          border: 1px solid #edf2f7;
          overflow-x: auto;
          color: #0f172a;
          line-height: 1.85;
        }
        
        /* Unified Hoverable Tokens (NO borders, NO squares, NO rectangles) */
        .", ns("math-token"), " {
          position: relative;
          display: inline-block;
          cursor: pointer;
          padding: 0 2px;
          margin: 0;
          border: none !important;
          background: transparent !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          color: inherit;
          transition: color 0.15s ease;
        }
        .", ns("math-token"), ":hover {
          color: #1d4ed8 !important;
        }
        .", ns("math-token"), " .", ns("fluid-tooltip"), " {
          visibility: hidden;
          opacity: 0;
          width: 330px;
          background-color: #0f172a !important;
          color: #f8fafc !important;
          text-align: left;
          border-radius: 8px;
          padding: 12px 14px;
          position: absolute;
          z-index: 999999 !important;
          bottom: calc(100% + 12px) !important;
          left: 50%;
          transform: translateX(-50%);
          box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.6), 0 8px 14px -6px rgba(0, 0, 0, 0.45);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 0.82rem;
          line-height: 1.45;
          pointer-events: none;
          transition: opacity 0.18s ease, transform 0.18s ease;
          border: 1px solid #334155;
        }
        .", ns("math-token"), " .", ns("fluid-tooltip"), "::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -6px;
          border-width: 6px;
          border-style: solid;
          border-color: #0f172a transparent transparent transparent;
        }
        .", ns("math-token"), ":hover .", ns("fluid-tooltip"), " {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(-5px);
        }
        .", ns("fluid-header"), " {
          font-weight: 700;
          color: #93c5fd;
          font-size: 0.90rem;
          border-bottom: 1px solid #334155;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }
        .", ns("fluid-desc"), " {
          color: #f8fafc;
          margin-bottom: 6px;
          font-size: 0.83rem;
          line-height: 1.4;
        }
        .", ns("fluid-origin"), " {
          color: #94a3b8;
          font-size: 0.79rem;
          margin-bottom: 6px;
          line-height: 1.35;
        }
        .", ns("fluid-row"), " {
          margin-bottom: 4px;
          color: #cbd5e1;
          font-size: 0.80rem;
        }
        .", ns("fluid-tag"), " {
          font-weight: 600;
          color: #94a3b8;
          margin-right: 4px;
        }
        .", ns("fluid-val"), " {
          color: #34d399;
          font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
          font-weight: 600;
        }
        .", ns("fluid-why"), " {
          color: #a7f3d0;
          margin-top: 6px;
          padding-top: 5px;
          border-top: 1px dashed #334155;
          font-size: 0.79rem;
          line-height: 1.35;
        }
        .", ns("math-op"), " {
          margin: 0 4px;
          color: #475569;
          font-weight: 500;
        }
        
        .", ns("term-legend-table"), " {
          width: 100%;
          font-size: 0.86rem;
          border-collapse: collapse;
          margin-top: 10px;
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
        }
        .", ns("term-legend-table"), " th {
          background-color: #f8fafc;
          color: #1e293b;
          font-weight: 700;
          padding: 8px 12px;
          border-bottom: 2px solid #cbd5e1;
          font-size: 0.80rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .", ns("term-legend-table"), " td {
          padding: 8px 12px;
          vertical-align: top;
          border-bottom: 1px solid #f1f5f9;
        }
        .", ns("term-legend-table"), " tr:hover {
          background-color: #f8fafc;
        }
        .", ns("term-col"), " {
          font-family: 'KaTeX_Math', 'Cambria Math', 'Latin Modern Math', serif;
          font-weight: 700;
          color: #1e40af;
          font-size: 1.02rem;
          white-space: nowrap;
          width: 11%;
        }
        .", ns("name-col"), " {
          font-weight: 600;
          color: #0f172a;
          width: 20%;
        }
        .", ns("prov-col"), " {
          color: #475569;
          width: 28%;
        }
        .", ns("val-col"), " {
          width: 16%;
        }
        .", ns("interp-col"), " {
          color: #334155;
          font-size: 0.83rem;
          width: 25%;
        }
        .", ns("concordance-box"), " {
          background-color: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-left: 4px solid #16a34a;
          border-radius: 6px;
          padding: 12px 16px;
          margin-top: 10px;
        }
        .", ns("concordance-box-warning"), " {
          background-color: #fffbeb !important;
          border: 1px solid #fde68a !important;
          border-left: 4px solid #b45309 !important;
        }
        .", ns("concordance-box-warning"), " p {
          color: #92400e !important;
        }
        .", ns("quote-box"), " {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-left: 4px solid #059669;
          padding: 12px 16px;
          font-style: normal;
          font-size: 0.88rem;
          color: #0f172a;
          border-radius: 0 6px 6px 0;
          margin-top: 8px;
          line-height: 1.55;
        }
        .", ns("subtab-container"), " .nav-pills .nav-link {
          font-weight: 600;
          font-size: 0.88rem;
          color: #475569;
          border-radius: 6px;
          padding: 6px 14px;
        }
        .", ns("subtab-container"), " .nav-pills .nav-link.active {
          background-color: #2563eb;
          color: #ffffff;
        }
        .", ns("stepper-nav"), " .nav-pills .nav-link {
          font-weight: 600;
          font-size: 0.85rem;
          color: #334155;
          border-radius: 6px;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          margin-right: 6px;
          margin-bottom: 6px;
          background-color: #f8fafc;
        }
        .", ns("stepper-nav"), " .nav-pills .nav-link.active {
          background-color: #1e40af;
          color: #ffffff;
          border-color: #1e40af;
        }
      "))),
      
      layout_sidebar(
        sidebar = sidebar(
          width = 350,
          open = "desktop",
          accordion(
            open = c("1. Audit Target & Mode", "Export Math Proof"),
            multiple = TRUE,
            accordion_panel(
              "1. Audit Target & Mode",
              icon = icon("microscope"),
              selectizeInput(
                ns("selected_lipid"),
                label = tags$strong("Select Lipid Species to Audit:"),
                choices = NULL,
                options = list(placeholder = "Type or select a lipid (e.g. CE(15:0)+NH4)...")
              ),
              radioButtons(
                ns("inspect_mode"),
                label = tags$strong("Audit Mode:"),
                choices = c("Single Sample Deep-Dive" = "single", "All Samples Matrix" = "all"),
                selected = "single"
              ),
              conditionalPanel(
                condition = sprintf("input['%s'] == 'single'", ns("inspect_mode")),
                selectInput(
                  ns("selected_sample"),
                  label = tags$strong("Representative Sample:"),
                  choices = NULL
                ),
                tags$div(
                  style = "display: none;",
                  bslib::input_switch(
                    id = ns("enable_hover"),
                    label = "Hover Details",
                    value = FALSE
                  )
                )
              ),
              conditionalPanel(
                condition = sprintf("input['%s'] == 'all'", ns("inspect_mode")),
                actionButton(
                  ns("btn_cohort_summary"),
                  "View Normalization Table",
                  icon = icon("table"),
                  class = "btn-outline-primary btn-sm w-100 mt-2"
                )
              )
            ),
            accordion_panel(
              "Export Math Proof",
              icon = icon("file-export"),
              p(
                class = "text-muted small mb-2",
                "Download complete multi-step mathematical demonstration (Step 1-5 intermediate values, imputation flags, and scaling multipliers) for targeted lipids."
              ),
              actionButton(
                ns("open_export_matrix_modal"),
                "Export Transition Matrix",
                icon = icon("file-csv"),
                class = "btn-outline-primary btn-sm w-100 fw-semibold"
              ),
              tags$div(
                style = "display: none;",
                downloadButton(ns("download_audit_matrix_csv"), "Direct CSV")
              )
            )
          )
        ),
        
        div(
          class = ns("scroll-container"),
          
          # 1. Header Banner
          div(
            class = "mb-3 p-3 rounded bg-light border",
            h4(class = "mb-1 text-primary fw-bold", icon("square-root-variable"), " Mathematical Proof & Transformation Audit"),
            p(class = "text-muted small mb-0", 
              "Step-by-step arithmetic transparency and formal peer-review verification benchmarked against ",
              tags$strong("Nature Communications (2025) 16:8714"), ".")
          ),
          
          # 1b. Quick Access Action Strip
          div(
            class = "quick-access-strip mb-2.5",
            tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "window.pointToElement('#math_proof_tab-selected_lipid', 'plot_controls', '1. Audit Target & Mode', event);",
              title = "Jump to lipid species selection input in dock",
              icon("microscope"), tags$strong("Select Lipid Species")
            ),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "$('#math_proof_tab-enable_hover').click();",
              title = "Toggle interactive mathematical hover explanations across all equations",
              icon("hand-pointer"), "Toggle Hover Details"
            ),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
              title = "Inspect and configure normalization method in dock",
              icon("scale-balanced"), "Normalization in Dock"
            ),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "window.pointToElement('#qc_pca_tab-useImputation', 'plot_controls', '1. Data processing and PCA', event);",
              title = "Configure QRILC missing value imputation in dock",
              icon("wand-magic-sparkles"), "QRILC Imputation in Dock"
            ),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
              title = "Bottom Menu: Inspect Full Bibliography below proof",
              icon("book-open"), "Bottom Menu: Full Bibliography"
            )
          ),
          
          # 2. Dynamic Proof Content Area
          uiOutput(ns("proof_content")),
          
          # 3. Comprehensive Literature Benchmark Accordion
          div(
            class = "mt-4",
            bslib::accordion(
              id = ns("literature_accordion"),
              open = FALSE,
              bslib::accordion_panel(
                title = tagList(icon("book-open"), " Full Bibliography"),
                value = "lit_panel",
                div(
                  class = "bibliography-list d-flex flex-column gap-3 pt-1",
                  
                  # 1. Left-Censored Missingness & Limit of Detection (LOD)
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "1. Left-Censored Missingness & Limit of Detection (LOD)"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "In chromatography and mass spectrometry, unobserved signals and numerical zeros represent left-censored missing values (MNAR) falling below instrument limits of detection rather than true biological absence. Quantile Regression Imputation of Left-Censored data (QRILC) is benchmarked as the optimal imputation strategy for left-censored omics matrices."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Idkowiak et al., Nature Communications (2025) 16:8714; Wei et al., Sci. Rep. (2018) 8:1632."
                    )
                  ),
                  
                  # 2. Variance-Stabilizing Log2 Transformation
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "2. Variance-Stabilizing Log2 Transformation"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "Raw mass spectrometry peak areas follow a right-skewed distribution with variance scaling with signal magnitude (heteroscedasticity). Base-2 logarithmic mapping stabilizes variance heterogeneity and converts multiplicative fold-changes into additive differences for statistical modeling and fold-change evaluation."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Idkowiak et al., Nature Communications (2025) 16:8714; Metabolomics (2024) 20:45."
                    )
                  ),
                  
                  # 3. Quantile Regression for Left-Censored Data (QRILC)
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "3. Quantile Regression for Left-Censored Data (QRILC)"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "QRILC parameterizes an empirical truncated normal distribution by quantile regression on observed lower percentiles of log-intensities to sample biologically plausible values within the censored left tail, avoiding artificial distribution spikes and variance deflation in non-random missingness (MNAR)."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Lazar et al., J. Proteome Res. (2016) 15(4):1116-1125; Wei et al., Sci. Rep. (2018) 8:1632; Idkowiak et al., Nature Communications (2025) 16:8714."
                    )
                  ),
                  
                  # 4. Sample-Wise Median Normalization
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "4. Sample-Wise Median Normalization"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "Centering sample column medians around a robust cohort grand median removes technical and analytical sources of variation across runs (such as electrospray ionization efficiency shifts, autosampler volume fluctuations, and instrument drift) while preserving biological variance across experimental cohorts."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Idkowiak et al., Nature Communications (2025) 16:8714."
                    )
                  ),
                  
                  # 5. Linear Scale Restitution & Scaling Equivalence
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "5. Linear Scale Restitution & Scaling Equivalence"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "Median centering in logarithmic space adjusts systematic run offsets without distorting relative variance, mathematically equating to sample-specific linear scaling multipliers (A = 2^(y_norm) = S_j * 2^(y_imp)). This enables exact mathematical restitution to the linear abundance scale for quantitative mass-balance and lipid class molar summation."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Idkowiak et al., Nature Communications (2025) 16:8714; citing van den Berg et al., BMC Genomics (2006) 7:142."
                    )
                  )
                )
              )
            )
          )
        ) # End scroll-container
      ) # End layout_sidebar
    )
  )
}

# export_studio_ui (99_export_studio)
export_studio_ui <- function(id) {
  ns <- NS(id)

  tagList(
    tags$div(
      class = "export-studio-container p-2",
      layout_columns(
        col_widths = c(5, 7),
        gap = "15px",

        # --- LEFT PANEL: GEOMETRY & PUBLICATION CONTROLS ---
        tags$div(
          class = "export-studio-controls card border-0 shadow-sm p-3 bg-white",
          
          tags$div(
            class = "d-flex align-items-center justify-content-between mb-3 border-bottom pb-2",
            tags$h5(class = "fw-bold mb-0 text-primary", tags$i(class = "fa-solid fa-camera-retro me-2"), "Figure & Presets"),
            tags$span(class = "badge bg-primary-subtle text-primary border border-primary-subtle", "Export Preview")
          ),

          # 1. Figure Selector
          tags$div(
            class = "mb-3",
            tags$label(class = "form-label fw-bold text-dark small text-uppercase", "1. Select Active Figure to Export:"),
            selectInput(
              ns("target_figure"),
              label = NULL,
              choices = c(
                "PCA 2D Score Plot (Quality Check)" = "pca_2d",
                "Volcano Plot (Differential Lipids)" = "volcano",
                "Top Lipid Class Abundance (Bar Chart)" = "class_abundance",
                "Lipid Abundance Heatmap (Matrix)" = "heatmap"
              ),
              selected = "pca_2d",
              width = "100%"
            )
          ),

          # 2. Journal Layout Preset
          tags$div(
            class = "mb-3",
            tags$label(class = "form-label fw-bold text-dark small text-uppercase", "2. Target Journal Layout Preset:"),
            radioButtons(
              ns("journal_preset"),
              label = NULL,
              choices = c(
                "Nature (89 / 120 / 180 mm)" = "nature",
                "Cell (85 / 114 / 174 mm)" = "cell",
                "Science (55 / 120 / 175 mm)" = "science",
                "EMBO / PNAS (84 / 178 mm)" = "embo",
                "Custom Dimensions" = "custom"
              ),
              selected = "nature"
            )
          ),

          # 3. Column Width Preset
          tags$div(
            class = "mb-3",
            tags$label(class = "form-label fw-bold text-dark small text-uppercase", "3. Column Width Mode:"),
            radioButtons(
              ns("col_width_mode"),
              label = NULL,
              choices = c(
                "Single Column (1-Col)" = "single",
                "1.5-Column" = "mid",
                "Double Column (Full Page Width)" = "double",
                "Custom Width" = "custom"
              ),
              selected = "single",
              inline = TRUE
            )
          ),

          # 4. Dimension & Geometry Inputs
          tags$div(
            class = "mb-3 p-2 bg-light rounded border",
            layout_columns(
              col_widths = c(6, 6),
              numericInput(ns("width_mm"), "Width (mm):", value = 89, min = 40, max = 250, step = 1),
              numericInput(ns("height_mm"), "Height (mm):", value = 89, min = 40, max = 250, step = 1)
            ),
            tags$div(
              class = "d-flex align-items-center gap-1 mt-1",
              tags$span(class = "text-muted small me-2", "Aspect Ratio:"),
              actionButton(ns("ratio_1_1"), "1:1", class = "btn btn-xs btn-outline-secondary py-0 px-2"),
              actionButton(ns("ratio_4_3"), "4:3", class = "btn btn-xs btn-outline-secondary py-0 px-2"),
              actionButton(ns("ratio_16_9"), "16:9", class = "btn btn-xs btn-outline-secondary py-0 px-2"),
              actionButton(ns("ratio_golden"), "1.618", class = "btn btn-xs btn-outline-secondary py-0 px-2")
            )
          ),

          # 5. Typography Auto-Scaler
          tags$div(
            class = "mb-3",
            tags$div(
              class = "d-flex align-items-center justify-content-between mb-1",
              tags$label(class = "form-label fw-bold text-dark small text-uppercase mb-0", "4. Typography Auto-Scaler:"),
              uiOutput(ns("typography_badge_ui"), inline = TRUE)
            ),
            sliderInput(
              ns("base_font_pt"),
              label = NULL,
              min = 5.5, max = 12.0, value = 7.5, step = 0.5,
              width = "100%"
            ),
            p(class = "text-muted small mb-0", "Sets the base font size used in exported figures.")
          ),

          # 6. Resolution & Hybrid Engine
          tags$div(
            class = "mb-3",
            layout_columns(
              col_widths = c(6, 6),
              selectInput(
                ns("dpi_setting"),
                "Resolution (DPI):",
                choices = c("300 DPI (Standard)" = 300, "600 DPI (Press Grade)" = 600, "1200 DPI (Ultra Fine)" = 1200),
                selected = 600
              ),
              selectInput(
                ns("font_family"),
                "Font Family:",
                choices = c("Arial / Helvetica (Default)" = "sans", "Times New Roman" = "serif", "Courier" = "mono"),
                selected = "sans"
              )
            ),
            checkboxInput(
              ns("hybrid_mode"),
              tags$span(class = "fw-semibold", "Hybrid Cairo Engine (600 DPI raster matrix + pure vector typography)"),
              value = TRUE
            )
          ),

          # 7. Reproducibility Bundle Formats
          tags$div(
            class = "mb-2",
            tags$label(class = "form-label fw-bold text-dark small text-uppercase", "5. Bundle Formats Included:"),
            tags$div(
              class = "d-flex flex-wrap gap-3 p-2 bg-light rounded border",
              checkboxInput(ns("inc_pdf"), "Vector PDF", value = TRUE),
              checkboxInput(ns("inc_svg"), "Vector SVG", value = TRUE),
              checkboxInput(ns("inc_png"), "600 DPI PNG", value = TRUE),
              checkboxInput(ns("inc_tiff"), "Press TIFF", value = TRUE),
              checkboxInput(ns("inc_csv"), "Data (CSV; included with R Script)", value = TRUE),
              checkboxInput(ns("inc_rscript"), "R Script", value = TRUE)
            )
          ),

          # 8. Export Action Buttons
          tags$div(
            class = "mt-2 pt-2 border-top",
            tags$label(class = "form-label fw-bold text-dark small text-uppercase mb-2", "6. Single Asset Downloads:"),
            tags$div(
              class = "d-flex flex-wrap gap-2 mb-3",
              downloadButton(ns("download_single_pdf"), "PDF", class = "btn-sm btn-outline-danger", icon = icon("file-pdf")),
              downloadButton(ns("download_single_svg"), "SVG", class = "btn-sm btn-outline-warning text-dark", icon = icon("bezier-curve")),
              downloadButton(ns("download_single_png"), "PNG (600 DPI)", class = "btn-sm btn-outline-primary", icon = icon("image")),
              downloadButton(ns("download_single_tiff"), "TIFF (Press)", class = "btn-sm btn-outline-secondary", icon = icon("file-image")),
              downloadButton(ns("download_single_csv"), "CSV", class = "btn-sm btn-outline-success", icon = icon("table")),
              downloadButton(ns("download_single_rscript"), "R Script", class = "btn-sm btn-outline-info text-dark", icon = icon("code"))
            ),
            tags$div(
              class = "d-grid",
              downloadButton(
                ns("download_bundle_zip"),
                label = "Download Reproducibility Bundle (.ZIP)",
                icon = icon("box-archive"),
                class = "btn btn-primary fw-bold shadow-sm py-2"
              )
            )
          )
        ),

        # --- RIGHT PANEL: LIVE PUBLICATION CANVAS PREVIEW ---
        tags$div(
          class = "export-studio-preview card border-0 shadow-sm p-3 bg-white d-flex flex-column",
          
          # Status Bar
          uiOutput(ns("journal_audit_bar_ui")),

          # Canvas Viewport with Physical Dimension Border
          tags$div(
            class = "publication-canvas-frame d-flex align-items-center justify-content-center flex-grow-1 bg-light rounded border my-2 position-relative",
            style = "min-height: 480px; overflow: hidden; padding: 15px;",
            plotOutput(ns("studio_preview_plot"), width = "100%", height = "450px")
          ),

          # Publication Submission Checklist Card
          tags$div(
            class = "publication-audit-card p-2 bg-light-subtle rounded border small",
            tags$div(class = "fw-bold text-dark mb-1", tags$i(class = "fa-solid fa-clipboard-check text-success me-1"), "Publication Submission Audit:"),
            tags$div(
              class = "d-flex flex-wrap gap-3 text-muted",
              tags$span(tags$i(class = "fa-solid fa-check text-success me-1"), "Review text rendering in the downloaded file"),
              tags$span(tags$i(class = "fa-solid fa-check text-success me-1"), "Check line widths against journal requirements"),
              tags$span(tags$i(class = "fa-solid fa-check text-success me-1"), "Review colors for accessibility"),
              tags$span(tags$i(class = "fa-solid fa-check text-success me-1"), "R script and data available in bundle")
            )
          )
        )
      )
    )
  )
}

