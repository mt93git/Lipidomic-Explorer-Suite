# R/modules/8_structural_module.R
# Structural Lipidome Audit.

# --- Module UI ---

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
                  tags$div(
                    downloadButton(ns("downloadSummaryCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                    downloadButton(ns("downloadSummaryPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
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
                 p(class="text-muted small", "Visualize the inter-dependencies of aggregated structural metrics or individual species. Edges represent significant Pearson correlations. Graph is accurately undirected."),
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

# --- Main Class & Acyl Chain Proportions Module UI ---

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

# --- Differential Acyl Chain Computation Engine ---

compute_differential_acyl_chains <- function(
  df_long,
  meta,
  comparison_mode = "cohort",
  cohort_var = "Group1",
  ref_group = "WT",
  comp_group = "Ctns_KO",
  strata_var = NULL,
  strata_val = NULL,
  patient_var = NULL,
  sn_contrast = "sn2_vs_sn1",
  abundance_metric = "prop",
  stat_test = "t_test",
  p_adjust_method = "BH",
  active_chains = NULL,
  pval_cutoff = 0.05,
  l2fc_cutoff = 0.5
) {
  req_df <- df_long %>% dplyr::filter(!is.na(AcylChain), nzchar(AcylChain))
  if (!is.null(active_chains) && length(active_chains) > 0) {
    req_df <- req_df %>% dplyr::filter(AcylChain %in% active_chains)
  }
  
  if (nrow(req_df) == 0) return(NULL)
  
  # Join metadata columns if missing
  join_cols <- setdiff(names(meta), names(req_df))
  if (length(join_cols) > 0) {
    req_df <- req_df %>% dplyr::left_join(meta %>% dplyr::select(FullName, dplyr::all_of(join_cols)), by = "FullName")
  }
  
  # Optional stratification
  if (!is.null(strata_var) && strata_var %in% names(req_df) && !is.null(strata_val) && strata_val != "all") {
    req_df <- req_df %>% dplyr::filter(.data[[strata_var]] == strata_val)
  }
  
  results <- list()
  eps <- if (abundance_metric == "prop") 0.05 else 1.0
  
  if (comparison_mode == "cohort") {
    sample_agg <- req_df %>%
      dplyr::group_by(FullName, .data[[cohort_var]], AcylChain) %>%
      dplyr::summarise(Intensity = sum(Intensity, na.rm = TRUE), .groups = "drop")
    
    if (abundance_metric == "prop") {
      sample_agg <- sample_agg %>%
        dplyr::group_by(FullName) %>%
        dplyr::mutate(
          Total = sum(Intensity, na.rm = TRUE),
          Value = ifelse(Total > 0, Intensity / Total * 100, 0)
        ) %>%
        dplyr::ungroup()
    } else {
      sample_agg <- sample_agg %>% dplyr::mutate(Value = Intensity)
    }
    
    chains <- unique(sample_agg$AcylChain)
    for (ch in chains) {
      ref_vals <- sample_agg$Value[sample_agg$AcylChain == ch & sample_agg[[cohort_var]] %in% ref_group]
      comp_vals <- sample_agg$Value[sample_agg$AcylChain == ch & sample_agg[[cohort_var]] %in% comp_group]
      
      ref_vals <- ref_vals[!is.na(ref_vals)]
      comp_vals <- comp_vals[!is.na(comp_vals)]
      
      if (length(ref_vals) == 0 && length(comp_vals) == 0) next
      
      m_ref <- if (length(ref_vals) > 0) mean(ref_vals) else 0
      m_comp <- if (length(comp_vals) > 0) mean(comp_vals) else 0
      delta <- m_comp - m_ref
      l2fc <- log2((m_comp + eps) / (m_ref + eps))
      
      se_ref <- if (length(ref_vals) > 1) stats::sd(ref_vals) / sqrt(length(ref_vals)) else 0
      se_comp <- if (length(comp_vals) > 1) stats::sd(comp_vals) / sqrt(length(comp_vals)) else 0
      se_diff <- sqrt(se_ref^2 + se_comp^2)
      
      ci_low <- l2fc - 1.96 * (se_diff / (abs(m_ref) + eps))
      ci_high <- l2fc + 1.96 * (se_diff / (abs(m_ref) + eps))
      
      pval <- 1.0
      if (length(ref_vals) >= 2 && length(comp_vals) >= 2) {
        if (stat_test == "wilcoxon") {
          wt <- tryCatch(stats::wilcox.test(comp_vals, ref_vals), error = function(e) NULL)
          if (!is.null(wt)) pval <- wt$p.value
        } else {
          tt <- tryCatch(stats::t.test(comp_vals, ref_vals), error = function(e) NULL)
          if (!is.null(tt)) pval <- tt$p.value
        }
      }
      
      results[[length(results) + 1]] <- data.frame(
        AcylChain = ch,
        Reference_Group = paste(ref_group, collapse = "+"),
        Comparison_Group = paste(comp_group, collapse = "+"),
        N_Ref = length(ref_vals),
        N_Comp = length(comp_vals),
        Mean_Ref = m_ref,
        Mean_Comp = m_comp,
        Delta = delta,
        Log2FC = l2fc,
        CI_Low = ci_low,
        CI_High = ci_high,
        PValue = ifelse(is.na(pval), 1.0, pval),
        stringsAsFactors = FALSE
      )
    }
  } else if (comparison_mode == "sn_position") {
    sample_agg <- req_df %>%
      dplyr::filter(Position %in% c("sn-1", "sn-2")) %>%
      dplyr::group_by(FullName, Position, AcylChain) %>%
      dplyr::summarise(Intensity = sum(Intensity, na.rm = TRUE), .groups = "drop")
    
    if (abundance_metric == "prop") {
      sample_agg <- sample_agg %>%
        dplyr::group_by(FullName, Position) %>%
        dplyr::mutate(
          Total = sum(Intensity, na.rm = TRUE),
          Value = ifelse(Total > 0, Intensity / Total * 100, 0)
        ) %>%
        dplyr::ungroup()
    } else {
      sample_agg <- sample_agg %>% dplyr::mutate(Value = Intensity)
    }
    
    chains <- unique(sample_agg$AcylChain)
    for (ch in chains) {
      sn1_df <- sample_agg %>% dplyr::filter(AcylChain == ch, Position == "sn-1")
      sn2_df <- sample_agg %>% dplyr::filter(AcylChain == ch, Position == "sn-2")
      
      merged <- dplyr::inner_join(sn1_df, sn2_df, by = "FullName", suffix = c("_sn1", "_sn2"))
      if (nrow(merged) < 2) next
      
      m_sn1 <- mean(merged$Value_sn1, na.rm = TRUE)
      m_sn2 <- mean(merged$Value_sn2, na.rm = TRUE)
      
      ref_m <- if (sn_contrast == "sn2_vs_sn1") m_sn1 else m_sn2
      comp_m <- if (sn_contrast == "sn2_vs_sn1") m_sn2 else m_sn1
      delta <- comp_m - ref_m
      l2fc <- log2((comp_m + eps) / (ref_m + eps))
      
      diff_vec <- if (sn_contrast == "sn2_vs_sn1") (merged$Value_sn2 - merged$Value_sn1) else (merged$Value_sn1 - merged$Value_sn2)
      se_diff <- stats::sd(diff_vec, na.rm = TRUE) / sqrt(nrow(merged))
      ci_low <- l2fc - 1.96 * (se_diff / (abs(ref_m) + eps))
      ci_high <- l2fc + 1.96 * (se_diff / (abs(ref_m) + eps))
      
      pval <- 1.0
      if (stat_test == "wilcoxon") {
        wt <- tryCatch(stats::wilcox.test(diff_vec), error = function(e) NULL)
        if (!is.null(wt)) pval <- wt$p.value
      } else {
        tt <- tryCatch(stats::t.test(diff_vec), error = function(e) NULL)
        if (!is.null(tt)) pval <- tt$p.value
      }
      
      results[[length(results) + 1]] <- data.frame(
        AcylChain = ch,
        Reference_Group = if (sn_contrast == "sn2_vs_sn1") "sn-1" else "sn-2",
        Comparison_Group = if (sn_contrast == "sn2_vs_sn1") "sn-2" else "sn-1",
        N_Ref = nrow(merged),
        N_Comp = nrow(merged),
        Mean_Ref = ref_m,
        Mean_Comp = comp_m,
        Delta = delta,
        Log2FC = l2fc,
        CI_Low = ci_low,
        CI_High = ci_high,
        PValue = ifelse(is.na(pval), 1.0, pval),
        stringsAsFactors = FALSE
      )
    }
  } else if (comparison_mode == "paired_patient") {
    p_col <- if (!is.null(patient_var) && patient_var %in% names(req_df)) patient_var else "FullName"
    sample_agg <- req_df %>%
      dplyr::group_by(FullName, .data[[p_col]], .data[[cohort_var]], AcylChain) %>%
      dplyr::summarise(Intensity = sum(Intensity, na.rm = TRUE), .groups = "drop")
    
    if (abundance_metric == "prop") {
      sample_agg <- sample_agg %>%
        dplyr::group_by(FullName) %>%
        dplyr::mutate(
          Total = sum(Intensity, na.rm = TRUE),
          Value = ifelse(Total > 0, Intensity / Total * 100, 0)
        ) %>%
        dplyr::ungroup()
    } else {
      sample_agg <- sample_agg %>% dplyr::mutate(Value = Intensity)
    }
    
    chains <- unique(sample_agg$AcylChain)
    for (ch in chains) {
      ref_df <- sample_agg %>% dplyr::filter(AcylChain == ch, .data[[cohort_var]] %in% ref_group)
      comp_df <- sample_agg %>% dplyr::filter(AcylChain == ch, .data[[cohort_var]] %in% comp_group)
      
      merged <- dplyr::inner_join(ref_df, comp_df, by = p_col, suffix = c("_ref", "_comp"))
      if (nrow(merged) < 2) next
      
      m_ref <- mean(merged$Value_ref, na.rm = TRUE)
      m_comp <- mean(merged$Value_comp, na.rm = TRUE)
      delta <- m_comp - m_ref
      l2fc <- log2((m_comp + eps) / (m_ref + eps))
      
      diff_vec <- merged$Value_comp - merged$Value_ref
      se_diff <- stats::sd(diff_vec, na.rm = TRUE) / sqrt(nrow(merged))
      ci_low <- l2fc - 1.96 * (se_diff / (abs(m_ref) + eps))
      ci_high <- l2fc + 1.96 * (se_diff / (abs(m_ref) + eps))
      
      pval <- 1.0
      if (stat_test == "wilcoxon") {
        wt <- tryCatch(stats::wilcox.test(diff_vec), error = function(e) NULL)
        if (!is.null(wt)) pval <- wt$p.value
      } else {
        tt <- tryCatch(stats::t.test(diff_vec), error = function(e) NULL)
        if (!is.null(tt)) pval <- tt$p.value
      }
      
      results[[length(results) + 1]] <- data.frame(
        AcylChain = ch,
        Reference_Group = paste(ref_group, collapse = "+"),
        Comparison_Group = paste(comp_group, collapse = "+"),
        N_Ref = nrow(merged),
        N_Comp = nrow(merged),
        Mean_Ref = m_ref,
        Mean_Comp = m_comp,
        Delta = delta,
        Log2FC = l2fc,
        CI_Low = ci_low,
        CI_High = ci_high,
        PValue = ifelse(is.na(pval), 1.0, pval),
        stringsAsFactors = FALSE
      )
    }
  }
  
  if (length(results) == 0) return(NULL)
  
  res_df <- dplyr::bind_rows(results) %>%
    dplyr::mutate(
      AdjPValue = stats::p.adjust(PValue, method = p_adjust_method),
      Significance = dplyr::case_when(
        PValue <= pval_cutoff & Log2FC >= l2fc_cutoff ~ "Significant Up",
        PValue <= pval_cutoff & Log2FC <= -l2fc_cutoff ~ "Significant Down",
        TRUE ~ "Not Significant"
      ),
      Significance_FDR = dplyr::case_when(
        AdjPValue <= pval_cutoff & Log2FC >= l2fc_cutoff ~ "FDR Sig Up",
        AdjPValue <= pval_cutoff & Log2FC <= -l2fc_cutoff ~ "FDR Sig Down",
        TRUE ~ "Not Significant"
      )
    )
  
  return(res_df)
}

# --- Statistical Report Generators for Proportions & Differential Views ---

generate_diff_acyl_stats_report <- function(diff_res, shared_data, input) {
  if (is.null(diff_res) || is.null(diff_res$results) || nrow(diff_res$results) == 0) {
    msg <- paste0(
      "================================================================================\n",
      "STATISTICAL REPORT: DIFFERENTIAL ACYL CHAIN EXPRESSION & REMODELING\n",
      "================================================================================\n",
      "Generated:                  ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
      "STATUS: No differential acyl chain results are currently available.\n\n",
      "REASON & TROUBLESHOOTING:\n",
      "   1. Ensure a valid lipidomics abundance dataset has been uploaded and processed.\n",
      "   2. Confirm that lipid names follow recognized acyl chain conventions (e.g., PC 16:0_18:1, PE 18:0/20:4).\n",
      "   3. Verify that at least two cohorts or conditions exist with replicate samples (N >= 2).\n",
      "   4. If positional remodeling (sn-1 vs sn-2) is chosen, ensure stereospecific isomer annotations exist.\n",
      "================================================================================\n\n"
    )
    msg <- paste0(msg, get_stats_console_method_summary(shared_data))
    return(msg)
  }
  
  df <- diff_res$results
  comp_type <- diff_res$comp_type %||% "cohort"
  stat_test <- diff_res$stat_test %||% "t_test"
  metric <- diff_res$abundance_metric %||% "prop"
  pval_cut <- diff_res$pval_cutoff %||% 0.05
  l2fc_cut <- diff_res$l2fc_cutoff %||% 0.5
  rank_by <- diff_res$rank_by %||% "abs_log2fc"
  
  framework_label <- switch(
    comp_type,
    "de_contrast" = "Compared Analysis Contrast (Global Statistical Partition)",
    "cohort" = "Custom Cohort Contrast (Unpaired Two-Group Design)",
    "sn1_vs_sn2" = "sn-1 vs sn-2 Positional Remodeling (Paired / Intra-Sample Design)",
    "paired_patient" = "Paired Patient / Subject Contrast (Intra-Subject Matching)",
    "Sample Cohort Contrast"
  )
  
  metric_label <- if (metric == "prop") "Composition Percentage (%) normalized per Lipid Class" else "Raw Feature Ion Intensity (Unscaled)"
  test_label <- if (stat_test == "wilcoxon") {
    if (comp_type %in% c("sn1_vs_sn2", "paired_patient")) "Wilcoxon Signed-Rank Test (Paired Differences)" else "Wilcoxon / Mann-Whitney Rank-Sum Test (Non-Parametric)"
  } else {
    if (comp_type %in% c("sn1_vs_sn2", "paired_patient")) "Paired Student's t-Test" else "Welch's Two-Sample t-Test (Heteroscedastic, Unequal Variances)"
  }
  
  ref_name <- diff_res$ref_group
  comp_name <- diff_res$comp_group
  
  cohort_var <- input$diff_cohort_var %||% "Group1"
  strata_val <- input$diff_strata_filter %||% "all"
  sn_subset <- input$diff_sn_cohort_filter %||% "all"
  patient_var <- input$diff_patient_var %||% "SubjectID"
  
  n_ref_max <- max(df$N_Ref, na.rm = TRUE)
  n_comp_max <- max(df$N_Comp, na.rm = TRUE)
  
  n_total <- nrow(df)
  n_up <- sum(df$Significance == "Significant Up", na.rm = TRUE)
  n_down <- sum(df$Significance == "Significant Down", na.rm = TRUE)
  n_ns <- sum(df$Significance == "Not Significant", na.rm = TRUE)
  n_fdr_up <- sum(df$Significance_FDR == "FDR Sig Up", na.rm = TRUE)
  n_fdr_down <- sum(df$Significance_FDR == "FDR Sig Down", na.rm = TRUE)
  
  # Identify top remodeling drivers
  top_up <- df %>% dplyr::filter(Significance == "Significant Up") %>% dplyr::arrange(PValue, desc(Log2FC)) %>% dplyr::slice(1)
  top_down <- df %>% dplyr::filter(Significance == "Significant Down") %>% dplyr::arrange(PValue, Log2FC) %>% dplyr::slice(1)
  
  lines <- c()
  lines <- c(lines, "================================================================================")
  lines <- c(lines, "STATISTICAL REPORT: DIFFERENTIAL ACYL CHAIN EXPRESSION & REMODELING")
  lines <- c(lines, "================================================================================")
  lines <- c(lines, paste0("Generated:                  ", format(Sys.time(), "%Y-%m-%d %H:%M:%S")))
  lines <- c(lines, paste0("Comparison Framework:       ", framework_label))
  lines <- c(lines, paste0("Active Contrast:            ", comp_name, " (Comparison) vs ", ref_name, " (Reference)"))
  if (comp_type == "de_contrast") {
    lines <- c(lines, paste0("Cohort Grouping:            Global Compared Analysis (Dynamic DE Groups)"))
  } else if (comp_type == "cohort") {
    lines <- c(lines, paste0("Cohort Grouping Variable:   ", cohort_var))
    if (strata_val != "all") {
      lines <- c(lines, paste0("Stratification Filter:      ", strata_val))
    }
  } else if (comp_type == "sn1_vs_sn2") {
    if (sn_subset != "all") {
      lines <- c(lines, paste0("Cohort Stratified Subset:   ", sn_subset))
    }
  } else if (comp_type == "paired_patient") {
    lines <- c(lines, paste0("Paired Subject Identifier:  ", patient_var))
  }
  lines <- c(lines, paste0("Abundance Metric:           ", metric_label))
  lines <- c(lines, paste0("Hypothesis Test:            ", test_label))
  lines <- c(lines, paste0("Multiple Testing Adj.:      Benjamini-Hochberg (BH) False Discovery Rate (FDR)"))
  lines <- c(lines, paste0("Significance Thresholds:    p-value <= ", sprintf("%.4f", pval_cut), " | |Log2FC| >= ", sprintf("%.2f", l2fc_cut)))
  lines <- c(lines, paste0("Total Acyl Chains Tested:   K = ", n_total))
  lines <- c(lines, "")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, "1. SAMPLE REPLICATE COHORT ARCHITECTURE")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, paste0("   - Reference Cohort (", ref_name, "):      N = ", n_ref_max, " samples/replicates"))
  lines <- c(lines, paste0("   - Comparison Cohort (", comp_name, "):   N = ", n_comp_max, " samples/replicates"))
  if (comp_type %in% c("sn1_vs_sn2", "paired_patient")) {
    lines <- c(lines, "   - Statistical Pairing:          Strict intra-sample / intra-subject paired matching (d_i = y_comp,i - y_ref,i)")
  } else {
    lines <- c(lines, "   - Statistical Independence:     Independent two-sample design across experimental cohorts")
  }
  lines <- c(lines, "")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, "2. MATHEMATICAL FORMULATION & EFFECT SIZE CALCULUS")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  eps_val <- if (metric == "prop") 0.05 else 1.0
  if (metric == "prop") {
    lines <- c(lines, "   (A) Relative Composition Normalization:")
    lines <- c(lines, "       For sample s and acyl chain c within evaluated lipid class subset C:")
    lines <- c(lines, "           P(c, s) = [ Intensity(c, s) / Total_Class_Intensity(s) ] * 100")
    lines <- c(lines, "       where sum_{c in C} P(c, s) = 100%")
    lines <- c(lines, "")
    lines <- c(lines, "   (B) Cohort Means & Absolute Composition Shift (Delta):")
    lines <- c(lines, paste0("       Mean_Ref(c)  = (1 / N_ref)  * sum_{s in Ref}  P(c, s)"))
    lines <- c(lines, paste0("       Mean_Comp(c) = (1 / N_comp) * sum_{s in Comp} P(c, s)"))
    lines <- c(lines, "       Delta(c)     = Mean_Comp(c) - Mean_Ref(c)   [% percentage points]")
  } else {
    lines <- c(lines, "   (A) Raw Intensity Averaging & Absolute Difference (Delta):")
    lines <- c(lines, paste0("       Mean_Ref(c)  = (1 / N_ref)  * sum_{s in Ref}  Intensity(c, s)"))
    lines <- c(lines, paste0("       Mean_Comp(c) = (1 / N_comp) * sum_{s in Comp} Intensity(c, s)"))
    lines <- c(lines, "       Delta(c)     = Mean_Comp(c) - Mean_Ref(c)")
  }
  lines <- c(lines, "")
  lines <- c(lines, "   (C) Log2 Fold Change (Log2FC) with Noise-Stabilizing Pseudocount:")
  lines <- c(lines, paste0("       To prevent division by zero and dampen low-abundance noise, a pseudocount"))
  lines <- c(lines, paste0("       epsilon = ", eps_val, " is applied:"))
  lines <- c(lines, paste0("           Log2FC(c) = log2( ( Mean_Comp(c) + ", eps_val, " ) / ( Mean_Ref(c) + ", eps_val, " ) )"))
  lines <- c(lines, "")
  lines <- c(lines, "   (D) Analytical Standard Error of Difference & 95% Confidence Interval:")
  if (comp_type %in% c("sn1_vs_sn2", "paired_patient")) {
    lines <- c(lines, "       For paired observations, let d_i = Value_Comp(i) - Value_Ref(i):")
    lines <- c(lines, "           SE_diff = SD(d) / sqrt(N_pairs)")
  } else {
    lines <- c(lines, "       For independent cohorts:")
    lines <- c(lines, "           SE_ref  = SD_ref  / sqrt(N_ref)")
    lines <- c(lines, "           SE_comp = SD_comp / sqrt(N_comp)")
    lines <- c(lines, "           SE_diff = sqrt( SE_ref^2 + SE_comp^2 )")
  }
  lines <- c(lines, paste0("       95% Confidence Interval on Log2FC:"))
  lines <- c(lines, paste0("           CI_95% = Log2FC +/- 1.96 * [ SE_diff / ( |Mean_Ref| + ", eps_val, " ) ]"))
  lines <- c(lines, "")
  lines <- c(lines, "   (E) Hypothesis Testing & Multiplicity Adjustment:")
  lines <- c(lines, "       Null Hypothesis H0: No significant remodeling or abundance shift between conditions.")
  if (stat_test == "wilcoxon") {
    if (comp_type %in% c("sn1_vs_sn2", "paired_patient")) {
      lines <- c(lines, "       Method: Wilcoxon Signed-Rank Test (paired differences).")
    } else {
      lines <- c(lines, "       Method: Wilcoxon Rank-Sum (Mann-Whitney U) Non-Parametric Test.")
    }
  } else {
    if (comp_type %in% c("sn1_vs_sn2", "paired_patient")) {
      lines <- c(lines, "       Method: Two-Sided Paired Student's t-Test.")
    } else {
      lines <- c(lines, "       Method: Two-Sided Welch's Two-Sample t-Test (unequal variances).")
    }
  }
  lines <- c(lines, "       False Discovery Rate (FDR) Control:")
  lines <- c(lines, "       Nominal p-values are adjusted using the Benjamini-Hochberg (BH) procedure:")
  lines <- c(lines, "           AdjPValue(i) = min( 1, min_{k >= i} [ (K * P_(k)) / k ] )")
  lines <- c(lines, "")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, "3. HYPOTHESIS TESTING SUMMARY & DRIVER ENUMERATION")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, paste0("   - Total Evaluated Chains:           ", n_total))
  lines <- c(lines, paste0("   - Nominal Significant UP   (p<=", sprintf("%.2f", pval_cut), "): ", n_up, " (", sprintf("%.1f%%", 100*n_up/max(1, n_total)), ")"))
  lines <- c(lines, paste0("   - Nominal Significant DOWN (p<=", sprintf("%.2f", pval_cut), "): ", n_down, " (", sprintf("%.1f%%", 100*n_down/max(1, n_total)), ")"))
  lines <- c(lines, paste0("   - Non-Significant:                  ", n_ns, " (", sprintf("%.1f%%", 100*n_ns/max(1, n_total)), ")"))
  lines <- c(lines, paste0("   - FDR Significant UP   (q<=", sprintf("%.2f", pval_cut), "): ", n_fdr_up, " (", sprintf("%.1f%%", 100*n_fdr_up/max(1, n_total)), ")"))
  lines <- c(lines, paste0("   - FDR Significant DOWN (q<=", sprintf("%.2f", pval_cut), "): ", n_fdr_down, " (", sprintf("%.1f%%", 100*n_fdr_down/max(1, n_total)), ")"))
  if (nrow(top_up) > 0) {
    lines <- c(lines, paste0("   - Top Remodeling Driver (UP):       ", top_up$AcylChain[1], 
                             " (Log2FC = ", sprintf("%+.3f", top_up$Log2FC[1]), 
                             ", p = ", if(top_up$PValue[1]<1e-4) sprintf("%.2e", top_up$PValue[1]) else sprintf("%.4f", top_up$PValue[1]), ")"))
  }
  if (nrow(top_down) > 0) {
    lines <- c(lines, paste0("   - Top Remodeling Driver (DOWN):     ", top_down$AcylChain[1], 
                             " (Log2FC = ", sprintf("%+.3f", top_down$Log2FC[1]), 
                             ", p = ", if(top_down$PValue[1]<1e-4) sprintf("%.2e", top_down$PValue[1]) else sprintf("%.4f", top_down$PValue[1]), ")"))
  }
  lines <- c(lines, "")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, "4. RANKED ACYL CHAIN DIFFERENTIAL BREAKDOWN")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  
  # Format table header
  header_fmt <- "%-12s | %10s | %10s | %10s | %8s | %18s | %10s | %10s | %-16s"
  ref_col_name <- substr(paste0("Mean_", ref_name), 1, 10)
  comp_col_name <- substr(paste0("Mean_", comp_name), 1, 10)
  lines <- c(lines, sprintf(header_fmt, "Acyl Chain", ref_col_name, comp_col_name, "Delta", "Log2FC", "95% CI", "P-Value", "Adj P-Val", "Status"))
  lines <- c(lines, paste(rep("-", 112), collapse = ""))
  
  df_display <- df
  if (rank_by == "abs_log2fc") {
    df_display <- df_display %>% dplyr::arrange(desc(abs(Log2FC)))
  } else if (rank_by == "log2fc_desc") {
    df_display <- df_display %>% dplyr::arrange(desc(Log2FC))
  } else if (rank_by == "log2fc_asc") {
    df_display <- df_display %>% dplyr::arrange(Log2FC)
  } else if (rank_by == "pvalue") {
    df_display <- df_display %>% dplyr::arrange(PValue, desc(abs(Log2FC)))
  }
  
  val_fmt <- if (metric == "prop") "%.2f%%" else "%.2e"
  for (i in seq_len(nrow(df_display))) {
    row <- df_display[i, ]
    m_ref_str <- sprintf(val_fmt, row$Mean_Ref)
    m_comp_str <- sprintf(val_fmt, row$Mean_Comp)
    delta_str <- if (metric == "prop") sprintf("%+.2f%%", row$Delta) else sprintf("%+.2e", row$Delta)
    l2fc_str <- sprintf("%+.3f", row$Log2FC)
    ci_str <- sprintf("[%+.2f, %+.2f]", row$CI_Low, row$CI_High)
    pval_str <- if (row$PValue < 1e-4) sprintf("%.2e", row$PValue) else sprintf("%.4f", row$PValue)
    adjp_str <- if (row$AdjPValue < 1e-4) sprintf("%.2e", row$AdjPValue) else sprintf("%.4f", row$AdjPValue)
    status_str <- row$Significance
    
    lines <- c(lines, sprintf(header_fmt, row$AcylChain, m_ref_str, m_comp_str, delta_str, l2fc_str, ci_str, pval_str, adjp_str, status_str))
  }
  
  lines <- c(lines, paste(rep("=", 80), collapse = ""))
  lines <- c(lines, "")
  lines <- c(lines, get_stats_console_method_summary(shared_data))
  
  paste(lines, collapse = "\n")
}

generate_prop_stats_report <- function(raw_data, shared_data, input) {
  if (is.null(raw_data) || is.null(raw_data$df_long) || nrow(raw_data$df_long) == 0) {
    msg <- paste0(
      "================================================================================\n",
      "STATISTICAL REPORT: ACYL CHAIN COMPOSITION PROPORTIONS & DISPERSION\n",
      "================================================================================\n",
      "Generated:                  ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
      "STATUS: No composition data is currently available.\n",
      "Please load an annotated dataset to inspect acyl chain proportions.\n",
      "================================================================================\n\n"
    )
    msg <- paste0(msg, get_stats_console_method_summary(shared_data))
    return(msg)
  }
  
  df_long <- raw_data$df_long
  grp_var <- raw_data$grp_var %||% "Group1"
  grp_display <- raw_data$grp_display %||% grp_var
  val_mode <- raw_data$val_mode %||% "Absolute (%)"
  pos_mode <- raw_data$pos_mode %||% "both"
  multiclass_mode <- raw_data$multiclass_mode %||% "stacked"
  cls_targets <- raw_data$cls_targets
  
  pos_label <- switch(
    pos_mode,
    "side_by_side" = "sn-1 and sn-2 Separated (Positional Resolution)",
    "both" = "Combined / Unresolved Sn Positions",
    "sn-1" = "Isolated sn-1 Position Only",
    "sn-2" = "Isolated sn-2 Position Only",
    pos_mode
  )
  
  grp_counts <- df_long %>%
    dplyr::group_by(GroupingVal) %>%
    dplyr::summarise(N = length(unique(FullName)), .groups = "drop")
  
  unique_chains <- unique(df_long$AcylChain)
  n_chains <- length(unique_chains)
  
  lines <- c()
  lines <- c(lines, "================================================================================")
  lines <- c(lines, "STATISTICAL REPORT: ACYL CHAIN COMPOSITION PROPORTIONS & DISPERSION")
  lines <- c(lines, "================================================================================")
  lines <- c(lines, paste0("Generated:                  ", format(Sys.time(), "%Y-%m-%d %H:%M:%S")))
  lines <- c(lines, paste0("Grouping Dimension (Y-Axis): ", grp_display, " (", grp_var, ")"))
  lines <- c(lines, paste0("Target Lipid Class(es):      ", paste(cls_targets, collapse = ", ")))
  lines <- c(lines, paste0("Value Representation Mode:   ", val_mode))
  lines <- c(lines, paste0("Positional Mode:             ", pos_label))
  lines <- c(lines, paste0("Multi-Class Normalization:   ", multiclass_mode))
  lines <- c(lines, paste0("Total Acyl Chains Tracked:   ", n_chains))
  lines <- c(lines, "")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, "1. SAMPLE REPLICATE COHORT ARCHITECTURE")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  for (i in seq_len(nrow(grp_counts))) {
    lines <- c(lines, paste0("   - Group '", grp_counts$GroupingVal[i], "': N = ", grp_counts$N[i], " samples"))
  }
  lines <- c(lines, "")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, "2. MATHEMATICAL FORMULATION & COMPOSITION CALCULUS")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  if (grepl("[(][%][)]$", val_mode)) {
    lines <- c(lines, "   (A) Relative Percentage Normalization:")
    lines <- c(lines, "       For sample s, lipid class C, and acyl chain c:")
    lines <- c(lines, "           P(c, s) = [ Intensity(c, s) / Total_Class_Intensity(s) ] * 100")
    lines <- c(lines, "       where sum_{c in C} P(c, s) = 100%")
    lines <- c(lines, "")
    lines <- c(lines, "   (B) Cohort Mean Composition:")
    lines <- c(lines, "       For group G with N_G replicates:")
    lines <- c(lines, "           Mean_P(c, G) = (1 / N_G) * sum_{s in G} P(c, s)")
    lines <- c(lines, "")
    lines <- c(lines, "   (C) Sample Dispersion Estimates:")
    lines <- c(lines, "       - Sample Standard Deviation (SD):")
    lines <- c(lines, "           SD(c, G) = sqrt( (1 / (N_G - 1)) * sum_{s in G} (P(c, s) - Mean_P(c, G))^2 )")
    lines <- c(lines, "       - Standard Error of the Mean (SEM):")
    lines <- c(lines, "           SEM(c, G) = SD(c, G) / sqrt(N_G)")
  } else {
    lines <- c(lines, "   (A) Raw Ion Intensity Summation:")
    lines <- c(lines, "       For sample s, lipid class C, and acyl chain c:")
    lines <- c(lines, "           Value(c, s) = sum_{lipid in c} Intensity(lipid, s)")
    lines <- c(lines, "")
    lines <- c(lines, "   (B) Cohort Mean Intensity:")
    lines <- c(lines, "       For group G with N_G replicates:")
    lines <- c(lines, "           Mean_Int(c, G) = (1 / N_G) * sum_{s in G} Value(c, s)")
  }
  lines <- c(lines, "")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  lines <- c(lines, "3. PROMINENT ACYL CHAIN COMPOSITION BREAKDOWN")
  lines <- c(lines, "--------------------------------------------------------------------------------")
  
  df_norm <- df_long
  if (grepl("[(][%][)]$", val_mode)) {
    df_norm <- df_norm %>%
      dplyr::group_by(FullName, LipidClass) %>%
      dplyr::mutate(
        ClassTot = sum(Intensity, na.rm = TRUE),
        NormVal = ifelse(ClassTot > 0, Intensity / ClassTot * 100, 0)
      ) %>%
      dplyr::ungroup()
  } else {
    df_norm <- df_norm %>% dplyr::mutate(NormVal = Intensity)
  }
  
  chain_summary <- df_norm %>%
    dplyr::group_by(AcylChain, GroupingVal) %>%
    dplyr::summarise(MeanVal = mean(NormVal, na.rm = TRUE), .groups = "drop") %>%
    tidyr::pivot_wider(names_from = GroupingVal, values_from = MeanVal, values_fill = 0)
  
  grp_names <- setdiff(names(chain_summary), "AcylChain")
  avg_col <- rowMeans(chain_summary %>% dplyr::select(dplyr::all_of(grp_names)), na.rm = TRUE)
  chain_summary$OverallAvg <- avg_col
  chain_summary <- chain_summary %>% dplyr::arrange(desc(OverallAvg)) %>% dplyr::select(-OverallAvg)
  
  hdr_parts <- c(sprintf("%-14s", "Acyl Chain"))
  for (gn in grp_names) {
    hdr_parts <- c(hdr_parts, sprintf("%12s", substr(gn, 1, 12)))
  }
  lines <- c(lines, paste(hdr_parts, collapse = " | "))
  lines <- c(lines, paste(rep("-", min(100, 16 + length(grp_names) * 15)), collapse = ""))
  
  for (i in seq_len(min(25, nrow(chain_summary)))) {
    r <- chain_summary[i, ]
    row_parts <- c(sprintf("%-14s", r$AcylChain))
    for (gn in grp_names) {
      val <- r[[gn]]
      val_str <- if (grepl("[(][%][)]$", val_mode)) sprintf("%.2f%%", val) else sprintf("%.2e", val)
      row_parts <- c(row_parts, sprintf("%12s", val_str))
    }
    lines <- c(lines, paste(row_parts, collapse = " | "))
  }
  if (nrow(chain_summary) > 25) {
    lines <- c(lines, paste0("... [and ", nrow(chain_summary) - 25, " more acyl chains] ..."))
  }
  
  lines <- c(lines, paste(rep("=", 80), collapse = ""))
  lines <- c(lines, "")
  lines <- c(lines, get_stats_console_method_summary(shared_data))
  
  paste(lines, collapse = "\n")
}

# --- Module Server ---

structural_server <- function(id, shared_data, global_color_map = NULL) {
  moduleServer(id, function(input, output, session) {
    
    # Store custom factor level orderings across variables
    level_prefs <- reactiveValues()
    
    # Track grouping changes for aesthetic target selection
    prev_grouping_var <- reactiveVal(NULL)
    
    # State tracking for topClassesCount slider
    last_struct_grouping <- reactiveVal(NULL)
    last_struct_no_sig <- reactiveVal(NULL)
    last_struct_contrast <- reactiveVal(NULL)
    last_struct_max_count <- reactiveVal(NULL)
    last_struct_sig_settings <- reactiveVal(NULL)
    last_struct_run_count <- reactiveVal(0)
    
    # --- Advanced Aesthetics & Ordering: Grouping & Target Synchronization ---
    observe({
      if (isolate(shared_data$is_restoring())) return()
      meta <- tryCatch(shared_data$all_metadata(), error = function(e) NULL)
      req(meta)
      
      valid_cols <- c()
      contrast_info <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      if (!is.null(contrast_info) && !is.null(contrast_info$ref) && !is.null(contrast_info$comp)) {
        valid_cols <- c(valid_cols, "Direction")
      }
      if ("Group1" %in% names(meta)) valid_cols <- c(valid_cols, "Group1")
      if ("Group2" %in% names(meta)) {
        g2_clean <- meta$Group2[!is.na(meta$Group2) & nzchar(meta$Group2) & meta$Group2 != "Unspecified"]
        if (length(unique(g2_clean)) > 0) {
          valid_cols <- c(valid_cols, "Group2", "Group1_Group2")
        }
      }
      if ("TimePoint" %in% names(meta)) {
        tp_clean <- meta$TimePoint[!is.na(meta$TimePoint) & nzchar(meta$TimePoint) & meta$TimePoint != "Unspecified"]
        if (length(unique(tp_clean)) > 1) {
          valid_cols <- c(valid_cols, "TimePoint")
        }
      }
      if ("FullName" %in% names(meta)) {
        valid_cols <- c(valid_cols, "FullName")
      }
      
      choices <- valid_cols
      labels <- sapply(choices, function(c) {
        if (c == "Direction") "Cohort Comparison (Ref vs Comp)"
        else if (c == "Group1_Group2") get_metadata_group_label("Group1_Group2", meta)
        else if (c == "FullName") "Patient / Sample Replicate"
        else get_metadata_group_label(c, meta)
      })
      named_choices <- setNames(choices, labels)
      
      meta_candidates <- setdiff(valid_cols, c("Direction", "FullName"))
      active_meta_sel <- if (length(meta_candidates) > 0) {
        determine_active_grouping_selection(meta, meta_candidates, isolate(input$order_target_var))
      } else {
        character(0)
      }
      
      default_sel <- if ("Direction" %in% valid_cols) "Direction" else if (length(active_meta_sel) > 0) active_meta_sel[1] else choices[1]
      
      curr_order <- isolate(input$order_target_var)
      curr_color <- isolate(input$color_target_var)
      
      sel_order <- if (!is.null(curr_order) && curr_order %in% choices) curr_order else default_sel
      sel_color <- if (!is.null(curr_color) && curr_color %in% choices) curr_color else default_sel
      
      updateSelectInput(session, "order_target_var", choices = named_choices, selected = sel_order)
      updateSelectInput(session, "color_target_var", choices = named_choices, selected = sel_color)
    })
    
    # 1. Level Sequencer (sortable rank_list)
    output$level_order_ui <- renderUI({
      target <- input$order_target_var
      req(target)
      meta <- shared_data$all_metadata()
      
      if (target == "Direction") {
        contrast_info <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
        ref_n <- if (!is.null(contrast_info$ref)) paste0("Enriched in Ref (", contrast_info$ref[1], ")") else "Enriched in Ref"
        comp_n <- if (!is.null(contrast_info$comp)) paste0("Enriched in Comp (", contrast_info$comp[1], ")") else "Enriched in Comp"
        default_levels <- c(ref_n, comp_n)
      } else if (target == "Group1_Group2") {
        req(meta)
        comb_vals <- paste(meta$Group1, meta$Group2, sep = " & ")
        default_levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != "" & !grepl("Unspecified", comb_vals)]))
      } else if (!is.null(meta) && target %in% colnames(meta)) {
        vals <- as.character(meta[[target]])
        default_levels <- sort(unique(vals[!is.na(vals) & vals != "" & vals != "Unspecified"]))
      } else {
        return(NULL)
      }
      
      pref <- isolate(level_prefs[[target]])
      if (is.null(pref)) {
        pref <- shared_data$saved_level_prefs()[[target]]
      }
      if (!is.null(pref)) {
        if (all(default_levels %in% pref)) {
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
      
      if (target == "Direction") {
        contrast_info <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
        ref_n <- if (!is.null(contrast_info$ref)) paste0("Enriched in Ref (", contrast_info$ref[1], ")") else "Enriched in Ref"
        comp_n <- if (!is.null(contrast_info$comp)) paste0("Enriched in Comp (", contrast_info$comp[1], ")") else "Enriched in Comp"
        levels <- c(ref_n, comp_n)
        base_map <- stats::setNames(c(input$colRef %||% "#0072B2", input$colComp %||% "#D55E00"), levels)
      } else if (target == "Group1_Group2") {
        req(meta)
        comb_vals <- paste(meta$Group1, meta$Group2, sep = " & ")
        levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != "" & !grepl("Unspecified", comb_vals)]))
        base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[target]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[target]], error = function(e) NULL)
      } else if (!is.null(meta) && target %in% colnames(meta)) {
        vals <- as.character(meta[[target]])
        levels <- sort(unique(vals[!is.na(vals) & vals != "" & vals != "Unspecified"]))
        base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[target]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[target]], error = function(e) NULL)
      } else {
        return(NULL)
      }
      
      if (is.null(base_map) || length(base_map) == 0) {
        pal <- RColorBrewer::brewer.pal(min(9, max(3, length(levels))), "Set1")
        if (length(levels) > length(pal)) pal <- grDevices::colorRampPalette(pal)(length(levels))
        base_map <- stats::setNames(pal[1:length(levels)], levels)
      }
      
      ns <- session$ns
      lapply(levels, function(lvl) {
        safe_col <- gsub("[^A-Za-z0-9]", "", target)
        safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
        id <- paste0("cp_", safe_col, "_", safe_lvl)
        
        cur_val <- input[[id]]
        saved_val <- shared_data$get_restored_input(ns(id), base_map[lvl])
        def_val <- if (!is.null(cur_val)) cur_val else saved_val
        if (is.na(def_val) || is.null(def_val) || def_val == "") def_val <- "#0072B2"
        
        div(style = "display:inline-block; margin-right:5px; margin-bottom: 5px;",
            colourpicker::colourInput(ns(id), lvl, value = def_val, showColour = "both", width = "110px")
        )
      }) %>% div(class = "d-flex flex-wrap", .)
    })
    
    observeEvent(input$btn_apply_structural_colors, {
      target <- input$color_target_var
      req(target)
      meta <- shared_data$all_metadata()
      
      if (target == "Direction") {
        contrast_info <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
        ref_n <- if (!is.null(contrast_info$ref)) paste0("Enriched in Ref (", contrast_info$ref[1], ")") else "Enriched in Ref"
        comp_n <- if (!is.null(contrast_info$comp)) paste0("Enriched in Comp (", contrast_info$comp[1], ")") else "Enriched in Comp"
        safe_col <- gsub("[^A-Za-z0-9]", "", target)
        id_ref <- paste0("cp_", safe_col, "_", gsub("[^A-Za-z0-9]", "", ref_n))
        id_comp <- paste0("cp_", safe_col, "_", gsub("[^A-Za-z0-9]", "", comp_n))
        
        if (!is.null(input[[id_ref]])) {
          colourpicker::updateColourInput(session, "colRef", value = input[[id_ref]])
          colourpicker::updateColourInput(session, "bottom_colRef", value = input[[id_ref]])
        }
        if (!is.null(input[[id_comp]])) {
          colourpicker::updateColourInput(session, "colComp", value = input[[id_comp]])
          colourpicker::updateColourInput(session, "bottom_colComp", value = input[[id_comp]])
        }
      } else {
        levels <- if (target == "Group1_Group2" && !is.null(meta)) {
          comb_vals <- paste(meta$Group1, meta$Group2, sep = " & ")
          sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != "" & !grepl("Unspecified", comb_vals)]))
        } else if (!is.null(meta) && target %in% colnames(meta)) {
          vals <- as.character(meta[[target]])
          sort(unique(vals[!is.na(vals) & vals != "" & vals != "Unspecified"]))
        } else character(0)
        
        safe_col <- gsub("[^A-Za-z0-9]", "", target)
        new_palette <- sapply(levels, function(lvl) {
          id <- paste0("cp_", safe_col, "_", gsub("[^A-Za-z0-9]", "", lvl))
          input[[id]] %||% "#0072B2"
        })
        names(new_palette) <- levels
        
        if (is.function(shared_data$update_color_map)) {
          shared_data$update_color_map(target, new_palette)
        } else if (!is.null(shared_data$color_maps)) {
          current_maps <- shared_data$color_maps()
          current_maps[[target]] <- new_palette
          shared_data$color_maps(current_maps)
        }
      }
      
      showNotification("Structural plot colors updated successfully.", type = "message", duration = 3)
    })
    
    # --- Two-Way Sync between Sidebar Aesthetics and Bottom Ribbon ---
    observeEvent(input$bottom_colRef, {
      if (!identical(input$bottom_colRef, isolate(input$colRef))) {
        colourpicker::updateColourInput(session, "colRef", value = input$bottom_colRef)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$colRef, {
      if (!identical(input$colRef, isolate(input$bottom_colRef))) {
        colourpicker::updateColourInput(session, "bottom_colRef", value = input$colRef)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$bottom_colComp, {
      if (!identical(input$bottom_colComp, isolate(input$colComp))) {
        colourpicker::updateColourInput(session, "colComp", value = input$bottom_colComp)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$colComp, {
      if (!identical(input$colComp, isolate(input$bottom_colComp))) {
        colourpicker::updateColourInput(session, "bottom_colComp", value = input$colComp)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$bottom_pointSize, {
      if (!identical(input$bottom_pointSize, isolate(input$pointSize))) {
        updateNumericInput(session, "pointSize", value = input$bottom_pointSize)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$pointSize, {
      if (!identical(input$pointSize, isolate(input$bottom_pointSize))) {
        updateNumericInput(session, "bottom_pointSize", value = input$pointSize)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$bottom_textSize, {
      if (!identical(input$bottom_textSize, isolate(input$textSize))) {
        updateNumericInput(session, "textSize", value = input$bottom_textSize)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$textSize, {
      if (!identical(input$textSize, isolate(input$bottom_textSize))) {
        updateNumericInput(session, "bottom_textSize", value = input$textSize)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$bottom_sortBy, {
      if (!identical(input$bottom_sortBy, isolate(input$sortBy))) {
        updateSelectInput(session, "sortBy", selected = input$bottom_sortBy)
      }
    }, ignoreInit = TRUE)
    
    observeEvent(input$sortBy, {
      if (!identical(input$sortBy, isolate(input$bottom_sortBy))) {
        updateSelectInput(session, "bottom_sortBy", selected = input$sortBy)
      }
    }, ignoreInit = TRUE)
    
    # Auto-initialize Ref & Comp colors from global/shared color maps when contrast changes
    observe({
      contrast_info <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      req(!is.null(contrast_info$ref) && !is.null(contrast_info$comp))
      ref_name <- contrast_info$ref[1]
      comp_name <- contrast_info$comp[1]
      
      cmaps <- tryCatch(shared_data$color_maps(), error = function(e) list())
      gmaps <- if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map(), error = function(e) list()) else list()
      all_maps <- c(cmaps, gmaps)
      
      for (m in all_maps) {
        if (!is.null(m) && is.character(m)) {
          if (ref_name %in% names(m)) {
            new_ref <- m[[ref_name]]
            colourpicker::updateColourInput(session, "colRef", value = new_ref)
            colourpicker::updateColourInput(session, "bottom_colRef", value = new_ref)
          }
          if (comp_name %in% names(m)) {
            new_comp <- m[[comp_name]]
            colourpicker::updateColourInput(session, "colComp", value = new_comp)
            colourpicker::updateColourInput(session, "bottom_colComp", value = new_comp)
          }
        }
      }
    })
    
  # --- 1. Dynamic UI & Data Preparation ---
    
    output$groupingModeUI <- renderUI({
        choices <- c("Lipid Main Class" = "subclass")
       default_sel <- "subclass"
       
       curr_sel <- isolate(input$structuralGrouping)
       default_sel <- if (!is.null(curr_sel) && curr_sel %in% choices) {
           curr_sel
       } else {
           shared_data$get_restored_input(session$ns("structuralGrouping"), default_sel)
       }
       
       radioButtons(session$ns("structuralGrouping"), "Group Lipids by:", 
                    choices = choices, selected = default_sel, inline = TRUE)
    })
    
    output$log2fcThreshUI <- renderUI({
        curr_val <- isolate(input$structLog2fcThresh)
        saved_val <- if (!is.null(curr_val)) {
            curr_val
        } else {
            shared_data$get_restored_input(session$ns("structLog2fcThresh"), 0)
        }
        numericInput(
          session$ns("structLog2fcThresh"),
          tags$span(
            "Log2FC Threshold (abs):",
            bslib::tooltip(
              icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
              "Applies an effect size filter requiring the absolute log2 fold change (|Log2FC|) to meet or exceed this cutoff threshold for inclusion in the structural feature analysis."
            )
          ), 
          value = saved_val, min = 0, step = 0.1
        )
    })
    
    output$topClassesCountUI <- renderUI({
      req(input$structuralGrouping)
      grp_col <- input$structuralGrouping %||% "subclass"
      is_single <- (grp_col == "Lipid_Name")
      
      num_label <- if (is_single) {
        "Number of Lipids to Display:"
      } else if (grp_col == "hyperclass") {
        "Number of Lipid Categories to Display:"
      } else {
        "Number of Lipid Main Classes to Display:"
      }
      
      no_sig_val <- isTRUE(input$noSigThreshold)
      
      res <- if (is.null(input$runAnalysis) || input$runAnalysis == 0) {
        NULL
      } else {
        tryCatch(auditResults(), error = function(e) NULL)
      }
      
      audit_count <- 0
      if (!is.null(res) && nrow(res) > 0) {
        de_sett <- shared_data$de_settings()
        p_thresh <- de_sett$p_threshold %||% 0.05
        p_type <- de_sett$p_value_type %||% "raw"
        use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
        l2fc_thresh <- input$log2fcThreshold %||% 0
        
        res_sig <- if (no_sig_val) {
          res
        } else {
          if (use_adj) res %>% dplyr::filter(P_Adj <= p_thresh) else res %>% dplyr::filter(P_Value <= p_thresh)
        }
        if (l2fc_thresh > 0) {
          res_sig <- res_sig %>% dplyr::filter(abs(Diff) >= l2fc_thresh)
        }
        audit_count <- if (!is.null(res_sig)) nrow(res_sig) else 0
      }
      
      base_count <- 25
      df <- tryCatch(structuralData(), error = function(e) NULL)
      if (!is.null(df) && nrow(df) > 0) {
        classes <- if (grp_col == "Lipid_Name") unique(df$Lipid_Name) else unique(df[[grp_col]])
        classes <- classes[!is.na(classes) & classes != "Misc"]
        if (length(classes) > 0) base_count <- max(25, length(classes) * 2)
      }
      
      max_count <- if (!is.null(res) && nrow(res) > 0) {
        if (audit_count > 0) audit_count else 1
      } else {
        max(1, base_count)
      }
      
      default_val <- if (is_single) min(25, max_count) else max_count
      
      reset_slider <- FALSE
      if (is.null(last_struct_grouping()) || last_struct_grouping() != grp_col) {
        reset_slider <- TRUE
        last_struct_grouping(grp_col)
      }
      if (is.null(last_struct_no_sig()) || last_struct_no_sig() != no_sig_val) {
        reset_slider <- TRUE
        last_struct_no_sig(no_sig_val)
      }
      
      de_ci <- shared_data$de_contrast_info()
      curr_contrast <- if (!is.null(de_ci)) paste(c(de_ci$ref, de_ci$comp), collapse = " vs ") else ""
      if (is.null(last_struct_contrast()) || last_struct_contrast() != curr_contrast) {
        reset_slider <- TRUE
        last_struct_contrast(curr_contrast)
      }
      
      de_sett <- shared_data$de_settings()
      curr_sig_settings <- paste(
        de_sett$p_threshold %||% 0.05,
        de_sett$p_value_type %||% "raw",
        input$log2fcThreshold %||% 0,
        input$minClassSize %||% 3,
        sep = "_"
      )
      if (is.null(last_struct_sig_settings()) || last_struct_sig_settings() != curr_sig_settings) {
        reset_slider <- TRUE
        last_struct_sig_settings(curr_sig_settings)
      }
      
      curr_run <- input$runAnalysis %||% 0
      if (last_struct_run_count() != curr_run) {
        reset_slider <- TRUE
        last_struct_run_count(curr_run)
      }
      
      curr_val <- isolate(input$topClassesCount)
      prev_max <- last_struct_max_count()
      
      is_restoring_session <- tryCatch(isTRUE(shared_data$is_restoring()), error = function(e) FALSE)
      saved_val <- if (reset_slider || is.null(curr_val)) {
        if (is_restoring_session) {
          shared_data$get_restored_input(session$ns("topClassesCount"), default_val)
        } else {
          default_val
        }
      } else {
        if (!is_single) {
          if (is.null(prev_max) || prev_max <= 1 || curr_val >= prev_max) {
            default_val
          } else {
            max(1, min(curr_val, max_count))
          }
        } else {
          max(1, min(curr_val, max_count))
        }
      }
      last_struct_max_count(max_count)
      saved_val <- max(1, min(saved_val, max(1, max_count)))
      
      sliderInput(session$ns("topClassesCount"), num_label,
                  min = 1, max = max(1, max_count), value = saved_val, step = 1)
    })
    
    structuralData <- reactive({
      req(shared_data$de_results(), shared_data$annotationData())
      
      de_res <- shared_data$de_results()
      anno <- shared_data$annotationData()
      
      # Filter by local Log2FC threshold
      lfc_thresh <- if (!is.null(input$structLog2fcThresh)) input$structLog2fcThresh else 0.0
      
      df <- de_res %>%
        dplyr::filter(abs(log2FC) >= lfc_thresh) %>%
        dplyr::left_join(anno, by="Lipid_Name") %>%
        dplyr::mutate(
          Direction = dplyr::if_else(log2FC > 0, "Enriched in Comp", "Enriched in Ref")
        )
      
   # Apply Global Filters
      filtered_ids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_ids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      
      if ("subclass" %in% names(df)) {
        df$subclass <- get_short_class_name(df$subclass)
      }
      if ("hyperclass" %in% names(df)) {
        df$hyperclass <- get_short_class_name(df$hyperclass)
      }
      
      df
    })
    
  # --- 2. Structural Audit Loop ---
    
    auditResults <- eventReactive(input$runAnalysis, {
      df <- structuralData()
      req(nrow(df) > 0)
      
   # Iterate by Grouping Level
      grp_col <- input$structuralGrouping %||% "subclass"
      classes <- if (grp_col == "Lipid_Name") unique(df$Lipid_Name) else unique(df[[grp_col]])
      classes <- classes[!is.na(classes) & classes != "Misc"]
      
      # Single species typically don't need min class sizes > 1
      min_size <- if(grp_col == "Lipid_Name") 1 else input$minClassSize
      
      results_list <- list()
      
      for(cls in classes) {
        if(grp_col == "Lipid_Name") {
            sub_df <- df %>% dplyr::filter(Lipid_Name == cls)
        } else {
            sub_df <- df %>% dplyr::filter(.data[[grp_col]] == cls)
        }
        
    # Check min size per group
        n_comp <- sum(sub_df$Direction == "Enriched in Comp", na.rm=TRUE)
        n_ref <- sum(sub_df$Direction == "Enriched in Ref", na.rm=TRUE)
        
        if (n_comp < min_size || n_ref < min_size) next
        
    # Features to test
    # Universal
        features <- list("Total_Carbons"="Total Carbons", "Total_DB"="Total Unsaturation")
        
    # Specific
    # Needs to check if columns exist and are numeric
        if("nCchain1" %in% names(sub_df) && "nCchain2" %in% names(sub_df)) {
       # Basic check if it has 2 chains populated
             if(sum(!is.na(sub_df$nCchain2)) > 5) {
                features <- c(features, list("nCchain1"="sn1-Length", "DBchain1"="sn1-DB", 
                                             "nCchain2"="sn2-Length", "DBchain2"="sn2-DB"))
             } else if(sum(!is.na(sub_df$nCchain1)) > 5) {
        # Sphingo-like (often parsed as chain1)
                features <- c(features, list("nCchain1"="N-Acyl Length", "DBchain1"="N-Acyl DB"))
             }
        }
        
        for(feat_col in names(features)) {
           if(!feat_col %in% names(sub_df)) next
           
           vals_ref <- sub_df[[feat_col]][sub_df$Direction == "Enriched in Ref"]
           vals_comp <- sub_df[[feat_col]][sub_df$Direction == "Enriched in Comp"]
           pval <- tryCatch(compute_local_p_val(vals_ref, vals_comp, method = shared_data$actual_de_method(), paired = FALSE), error=function(e) NA_real_)
           
           if(!is.na(pval)) {
             diff_val <- mean(vals_comp, na.rm=TRUE) - mean(vals_ref, na.rm=TRUE) # Comp - Ref
             
             results_list[[length(results_list)+1]] <- data.frame(
               Class = cls,
               Feature = features[[feat_col]],
               Feature_Col = feat_col,
               Diff = diff_val,
               P_Value = pval,
               n_Comp = n_comp,
               n_Ref = n_ref
             )
           }
        }
      }
      
      if(length(results_list) == 0) return(NULL)
      res_df <- do.call(rbind, results_list)
      res_df$P_Adj <- p.adjust(res_df$P_Value, method = "BH")
      res_df
    })
    
  # --- 3. Plotting: Summary ---
    
    summaryPlotReactive <- reactive({
      res <- auditResults()
      validate(need(!is.null(res) && nrow(res) > 0, "No structural shifts detected or insufficient data."))
      
      de_sett <- shared_data$de_settings()
      p_thresh <- de_sett$p_threshold %||% 0.05
      p_type <- de_sett$p_value_type %||% "raw"
      use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
      
      res_sig <- if (isTRUE(input$noSigThreshold)) {
        res
      } else {
        if (use_adj) {
          res %>% dplyr::filter(P_Adj <= p_thresh)
        } else {
          res %>% dplyr::filter(P_Value <= p_thresh)
        }
      }
      
      l2fc_thresh <- input$log2fcThreshold %||% 0
      if (l2fc_thresh > 0) {
        res_sig <- res_sig %>% dplyr::filter(abs(Diff) >= l2fc_thresh)
      }
      
      if (is.null(res_sig) || nrow(res_sig) == 0) {
        p_label <- if (use_adj) "FDR adjusted p-value" else "raw p-value"
        return(generate_empty_plot_message(paste0(
          "No significant structural shifts found (", p_label, " < ", p_thresh, ").\n\n",
          "- Shift to Raw (uncorrected) p-value or adjust cutoffs in 3. Differential Expression\n",
          "- Inspect Outliers Detection under Quality Check (outliers may reduce significance)\n",
          "- Note: Lack of significance may also reflect authentic biological uniformity."
        )))
      }
      
      data_plot <- res_sig %>%
        dplyr::mutate(
          Active_P = if (use_adj) P_Adj else P_Value,
          Display_Class = if (!is.null(input$classLabelFormat) && input$classLabelFormat == "full") {
            get_full_class_name(Class)
          } else {
            get_short_class_name(Class)
          },
          Label = paste(Display_Class, Feature),
          Stars = dplyr::case_when(
            Active_P < 0.001 ~ "***",
            Active_P < 0.01 ~ "**",
            Active_P < 0.05 ~ "*",
            TRUE ~ ""
          ),
          P_Val_Label = sapply(Active_P, function(p) {
            if (is.na(p)) return("")
            if (p < 0.001) sprintf("%.1e", p) else sprintf("%.3f", p)
          })
        )
      
      sort_mode <- input$sortBy %||% "pvalue"
      data_plot <- if (sort_mode == "pvalue") {
        data_plot %>% dplyr::arrange(Active_P)
      } else if (sort_mode == "log2fc") {
        data_plot %>% dplyr::arrange(desc(abs(Diff)))
      } else {
        data_plot %>% dplyr::arrange(Display_Class)
      }
      
      top_n_cnt <- input$topClassesCount %||% 25
      if (nrow(data_plot) > top_n_cnt) data_plot <- head(data_plot, top_n_cnt)
      
      # Now sort by Diff to order the y-axis cleanly from bottom to top
      data_plot <- data_plot %>% dplyr::arrange(Diff)
      data_plot$Label <- factor(data_plot$Label, levels = data_plot$Label)
      
      low_val <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#0072B2"
      mid_val <- if (isTRUE(input$customScaleColors) && !is.null(input$midColor)) input$midColor else "grey90"
      high_val <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#D55E00"
      
      label_col <- if (is.null(input$sigDisplayType) || input$sigDisplayType == "star") "Stars" else "P_Val_Label"
      
      # Class-level regulation coloring logic
      label_colors <- "black"
      if (isTRUE(input$colorClassLabels)) {
        tryCatch({
          de_res <- shared_data$de_results()
          anno <- shared_data$annotationData()
          grp_col <- input$structuralGrouping %||% "subclass"
          
          # Group and calculate mean log2FC per class
          class_reg <- de_res %>%
            dplyr::left_join(anno, by = "Lipid_Name") %>%
            dplyr::filter(!is.na(.data[[grp_col]]))
          
          if (grp_col == "subclass") {
            class_reg$Class_Key <- get_short_class_name(class_reg$subclass)
          } else if (grp_col == "hyperclass") {
            class_reg$Class_Key <- get_short_class_name(class_reg$hyperclass)
          } else {
            class_reg$Class_Key <- class_reg$Lipid_Name
          }
          
          class_means <- class_reg %>%
            dplyr::group_by(Class_Key) %>%
            dplyr::summarise(Mean_LFC = mean(log2FC, na.rm = TRUE), .groups = "drop")
          
          max_abs_lfc <- max(abs(class_means$Mean_LFC), na.rm = TRUE)
          if (is.na(max_abs_lfc) || max_abs_lfc == 0) max_abs_lfc <- 1
          
          # 3-color interpolation centered at 0 with grey60 in the middle for readability
          map_lfc_to_color <- function(lfc, max_lfc) {
            if (is.na(lfc) || max_lfc == 0) return("grey60")
            u <- lfc / max_lfc
            u <- max(-1, min(1, u))
            
            low_col <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#0072B2"
            high_col <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#D55E00"
            
            if (u < 0) {
              cl <- colorRamp(c(low_col, "grey60"))(1 + u)
              rgb(cl[1,1], cl[1,2], cl[1,3], maxColorValue = 255)
            } else {
              cl <- colorRamp(c("grey60", high_col))(u)
              rgb(cl[1,1], cl[1,2], cl[1,3], maxColorValue = 255)
            }
          }
          
          color_map <- sapply(class_means$Mean_LFC, map_lfc_to_color, max_lfc = max_abs_lfc)
          names(color_map) <- class_means$Class_Key
          
          # Map to each label's class in sorted data_plot
          label_colors <- sapply(data_plot$Class, function(cls) {
            cls_key <- get_short_class_name(cls)
            if (cls_key %in% names(color_map)) color_map[[cls_key]] else "grey60"
          })
        }, error = function(e) {
          label_colors <- "black"
        })
      }
      
      max_abs_diff <- max(abs(data_plot$Diff), na.rm = TRUE)
      if (!is.finite(max_abs_diff) || max_abs_diff <= 0) {
        max_abs_diff <- 1
      }
      diff_limits <- c(-max_abs_diff, max_abs_diff)

      if (isTRUE(input$circledDots)) {
        border_col <- if (!is.null(input$borderColor) && nzchar(input$borderColor)) input$borderColor else "black"
        p <- ggplot(data_plot, aes(x = Diff, y = Label)) +
          geom_vline(xintercept = 0, linetype = "dashed", color = "grey70") +
          geom_point(aes(size = abs(Diff), fill = Diff), shape = 21, color = border_col, stroke = 0.5) +
          geom_text(aes(label = .data[[label_col]], hjust = ifelse(Diff > 0, 1.4, -0.4)), color = "black", vjust = 0.5, size = input$textSize/3) +
          scale_fill_gradient2(
            low = low_val, mid = mid_val, high = high_val, 
            midpoint = 0, limits = diff_limits, oob = scales::squish, name = "Difference"
          )
      } else {
        p <- ggplot(data_plot, aes(x = Diff, y = Label)) +
          geom_vline(xintercept = 0, linetype = "dashed", color = "grey70") +
          geom_point(aes(size = abs(Diff), color = Diff)) +
          geom_text(aes(label = .data[[label_col]], hjust = ifelse(Diff > 0, 1.4, -0.4)), color = "black", vjust = 0.5, size = input$textSize/3) +
          scale_color_gradient2(
            low = low_val, mid = mid_val, high = high_val, 
            midpoint = 0, limits = diff_limits, oob = scales::squish, name = "Difference"
          )
      }
      
      sub_title_text <- if (isTRUE(input$noSigThreshold)) {
        "Comparison vs Reference | Significancy Threshold is Not Applied"
      } else {
        p_label <- if (p_type == "p_adj_bh" || p_type == "adjusted") "FDR P" else "Raw P"
        paste("Comparison vs Reference |", p_label, "<", p_thresh)
      }
      
      p <- p +
        theme_pubr(base_size = input$textSize) +
        theme(
          axis.text.y = element_text(color = label_colors),
          plot.margin = margin(t = 12, r = 24, b = 16, l = 12, unit = "pt")
        ) +
        ggplot2::coord_cartesian(clip = "off") +
        scale_x_continuous(expand = expansion(mult = c(0.08, 0.08))) +
        labs(
          title = "Key Structural Remodeling Shifts",
          subtitle = sub_title_text,
          x = "Difference (Comp - Ref)", y = NULL
        )
      p
    })
    
    render_structural_status_banner <- function() {
      de_banner <- render_de_not_run_banner(shared_data)
      if (!is.null(de_banner)) return(de_banner)
      
      if (is.null(input$runAnalysis) || input$runAnalysis == 0) {
        return(
          div(
            class = "structural-ready-banner alert alert-info d-flex flex-wrap justify-content-between align-items-center mb-3 shadow-sm",
            style = "border-left: 5px solid #0284c7; background: #f0f9ff; border-radius: 9px; padding: 12px 18px; border-top: 1px solid #bae6fd; border-right: 1px solid #bae6fd; border-bottom: 1px solid #bae6fd;",
            div(class = "d-flex align-items-center gap-3",
              div(style = "width: 40px; height: 40px; border-radius: 50%; background: #e0f2fe; color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;",
                icon("dna")
              ),
              div(
                tags$h6(style = "font-weight: 700; color: #0369a1; margin: 0 0 2px 0; font-size: 0.95rem;", 
                       "Structural Remodeling Analysis Ready"),
                tags$span(style = "color: #0284c7; font-size: 13px;", 
                          "Differential expression is computed. Initiate structural analysis to evaluate carbon chain and unsaturation remodeling.")
              )
            ),
            div(class = "d-flex flex-wrap gap-2 align-items-center mt-2 mt-sm-0",
              tags$button(
                type = "button",
                class = "btn btn-sm btn-primary",
                onclick = "window.runStructuralAnalysis && window.runStructuralAnalysis(event); return false;",
                style = "font-weight: 600; padding: 7px 16px; border-radius: 9px; white-space: nowrap;",
                icon("play"), " Initiate Structural Analysis"
              ),
              tags$button(
                type = "button",
                class = "btn btn-sm btn-outline-primary",
                onclick = "window.pointToStructuralLauncher && window.pointToStructuralLauncher(event); return false;",
                style = "font-weight: 600; padding: 7px 16px; border-radius: 9px; white-space: nowrap;",
                icon("crosshairs"), " Point to Button"
              )
            )
          )
        )
      }
      return(NULL)
    }

    output$de_not_run_banner_summary <- renderUI({
      render_structural_status_banner()
    })

    output$de_not_run_banner_species <- renderUI({
      render_structural_status_banner()
    })

    output$summaryPlot <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      if (is.null(input$runAnalysis) || input$runAnalysis == 0) {
        return(generate_empty_plot_message("Click 'Initiate Structural Analysis' in the left sidebar to compute structural remodeling shifts"))
      }
      summaryPlotReactive()
    })
    
    output$summary_stats_text <- renderText({
       if (is.null(shared_data$de_results())) return("Differential Expression Analysis Not Run")
       if (is.null(input$runAnalysis) || input$runAnalysis == 0) return("Awaiting 'Initiate Structural Analysis' execution")
       res <- auditResults()
       if(is.null(res)) return("No results.")
       de_sett <- shared_data$de_settings()
       p_thresh <- de_sett$p_threshold %||% 0.05
       p_type <- de_sett$p_value_type %||% "p_raw"
       n_sig <- if (p_type == "p_adj_bh" || p_type == "adjusted") {
         sum(res$P_Adj <= p_thresh, na.rm=TRUE)
       } else {
         sum(res$P_Value <= p_thresh, na.rm=TRUE)
       }
       if (isTRUE(input$noSigThreshold)) {
         paste("Showing all", nrow(res), "tested features (Significancy Threshold is Not Applied).")
       } else {
         paste("Found", n_sig, "significant shifts out of", nrow(res), "tested features.")
       }
    })
    
  # --- 4. Plotting: Details (Superplots) ---
    
    output$classSelectorUI <- renderUI({
       res <- auditResults()
       req(res)
       de_sett <- shared_data$de_settings()
       p_thresh <- de_sett$p_threshold %||% 0.05
       p_type <- de_sett$p_value_type %||% "p_raw"
       res_sig <- if (isTRUE(input$noSigThreshold)) {
         res
       } else {
         if (p_type == "p_adj_bh" || p_type == "adjusted") {
           res %>% dplyr::filter(P_Adj <= p_thresh)
         } else {
           res %>% dplyr::filter(P_Value <= p_thresh)
         }
       }
       if(is.null(res_sig) || nrow(res_sig) == 0) return(NULL)
       
       raw_choices <- paste(res_sig$Class, res_sig$Feature, sep=" | ")
       display_classes <- if (!is.null(input$classLabelFormat) && input$classLabelFormat == "full") {
         get_full_class_name(res_sig$Class)
       } else {
         get_short_class_name(res_sig$Class)
       }
       display_choices <- paste(display_classes, res_sig$Feature, sep=" | ")
       
       choices <- raw_choices
       names(choices) <- display_choices
       
       curr_selected <- isolate(input$selectedDetails)
       saved_selected <- if (!is.null(curr_selected) && all(curr_selected %in% raw_choices)) {
         curr_selected
       } else {
         shared_data$get_restored_input(session$ns("selectedDetails"), head(raw_choices, 4))
       }
       selectInput(session$ns("selectedDetails"), "Select Shifts to Visualize:", choices = choices, multiple = TRUE, selected = saved_selected)
    })
    
    speciesPlotReactive <- eventReactive(input$updateSpecies, {
      details <- isolate(input$selectedDetails)
      req(details)
      pct_top <- isolate(input$labelTop) / 100
      border_col <- if (isTRUE(input$circledDots) && !is.null(input$borderColor) && nzchar(input$borderColor)) input$borderColor else "black"
      
      parts <- strsplit(details, " \\| ")
      sel_classes <- sapply(parts, `[`, 1)
      sel_feats <- sapply(parts, `[`, 2)
      
      df <- structuralData()
      
      contrast_info <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      ref_col <- input$colRef %||% "#0072B2"
      comp_col <- input$colComp %||% "#D55E00"
      
      # Factor ordering for Direction based on user level_prefs
      dir_levels <- c("Enriched in Ref", "Enriched in Comp")
      pref_dir <- isolate(level_prefs[["Direction"]])
      if (!is.null(pref_dir) && length(pref_dir) == 2) {
        ref_alias <- if (!is.null(contrast_info$ref)) paste0("Enriched in Ref (", contrast_info$ref[1], ")") else "Enriched in Ref"
        comp_alias <- if (!is.null(contrast_info$comp)) paste0("Enriched in Comp (", contrast_info$comp[1], ")") else "Enriched in Comp"
        if (pref_dir[1] %in% c(comp_alias, "Enriched in Comp")) {
          dir_levels <- c("Enriched in Comp", "Enriched in Ref")
        }
      }
      df$Direction <- factor(df$Direction, levels = dir_levels)
      
      plot_list <- list()
      
       grp_col <- input$structuralGrouping %||% "subclass"
       
       for(i in seq_along(details)) {
         cls <- sel_classes[i]
         feat_name <- sel_feats[i]
         
         feat_col <- dplyr::case_when(
            feat_name == "Total Carbons" ~ "Total_Carbons",
            feat_name == "Total Unsaturation" ~ "Total_DB",
            feat_name == "sn1-Length" ~ "nCchain1",
            feat_name == "sn1-DB" ~ "DBchain1",
            feat_name == "sn2-Length" ~ "nCchain2",
            feat_name == "sn2-DB" ~ "DBchain2",
            feat_name == "N-Acyl Length" ~ "nCchain1",
            feat_name == "N-Acyl DB" ~ "DBchain1",
            TRUE ~ NA_character_
          )
         if(is.na(feat_col) || !(feat_col %in% names(df))) next
         
         if(grp_col == "Lipid_Name") {
            sub_df <- df %>% dplyr::filter(Lipid_Name == cls) %>% dplyr::filter(!is.na(.data[[feat_col]]))
         } else {
            sub_df <- df %>% dplyr::filter(.data[[grp_col]] == cls) %>% dplyr::filter(!is.na(.data[[feat_col]]))
         }
           
         if(nrow(sub_df) == 0) next
         
         vals <- sub_df[[feat_col]]
         if (length(vals) == 0) next
         
         med_val <- median(vals, na.rm=TRUE)
         sub_df$Deviation <- abs(vals - med_val)
         
         n_label <- ceiling(nrow(sub_df) * pct_top)
         sub_df <- sub_df %>% dplyr::arrange(desc(Deviation))
         
         labeled_lipids <- head(sub_df$Lipid_Name, n_label)
         # Smart Density-Based Y-Ceiling & Bracket Positioning
         dirs <- c("Enriched in Ref", "Enriched in Comp")
         x_heights <- numeric(length(dirs))
         g_mins <- c()
         g_maxs <- c()
         
         for (j in seq_along(dirs)) {
            d_val <- dirs[j]
            d_vals <- na.omit(sub_df[[feat_col]][sub_df$Direction == d_val & is.finite(sub_df[[feat_col]])])
            if (length(d_vals) >= 2) {
               dens <- tryCatch(density(d_vals, adjust = 1)$x, error = function(e) d_vals)
               g_mins <- c(g_mins, min(dens, na.rm = TRUE))
               g_maxs <- c(g_maxs, max(dens, na.rm = TRUE))
               x_heights[j] <- max(dens, na.rm = TRUE)
            } else if (length(d_vals) == 1) {
               g_mins <- c(g_mins, d_vals)
               g_maxs <- c(g_maxs, d_vals)
               x_heights[j] <- d_vals
            } else {
               x_heights[j] <- min(sub_df[[feat_col]], na.rm = TRUE)
            }
         }
         
         v_min <- if (length(g_mins) > 0) min(g_mins, na.rm = TRUE) else min(sub_df[[feat_col]], na.rm = TRUE)
         v_max <- if (length(g_maxs) > 0) max(g_maxs, na.rm = TRUE) else max(sub_df[[feat_col]], na.rm = TRUE)
         v_range <- v_max - v_min
         if (is.na(v_range) || v_range == 0 || is.infinite(v_range)) v_range <- 1.0
         
         # Calculate statistical difference between Enriched in Ref vs Enriched in Comp
         v1 <- sub_df[[feat_col]][sub_df$Direction == "Enriched in Ref"]
         v2 <- sub_df[[feat_col]][sub_df$Direction == "Enriched in Comp"]
         
         p_val <- NA
         if (length(v1) >= 1 && length(v2) >= 1) {
            p_val <- if (shared_data$actual_de_method() == "non_parametric") {
               tryCatch(wilcox.test(v1, v2)$p.value, error = function(e) NA)
            } else {
               tryCatch(t.test(v1, v2)$p.value, error = function(e) NA)
            }
         }
         
         sig_text <- if (is.null(input$sigDisplayType) || input$sigDisplayType == "star") {
            if (is.na(p_val) || p_val >= 0.05) "ns"
            else if (p_val < 0.001) "***"
            else if (p_val < 0.01) "**"
            else "*"
         } else {
            if (is.na(p_val)) "ns"
            else if (p_val < 0.001) sprintf("p = %.1e", p_val)
            else sprintf("p = %.3f", p_val)
         }
         
         bracket_y <- max(x_heights, na.rm = TRUE) + (v_range * 0.06)
         text_y <- bracket_y + (v_range * 0.02)
         
         p <- ggplot(sub_df, aes(x = Direction, y = .data[[feat_col]], fill = Direction)) +
            geom_violin(trim = FALSE, alpha = 0.5, color = "black", scale = "width") +
            geom_jitter(shape = 21, color = border_col, width = 0.15, alpha = 0.7, size = input$pointSize / 1.5) +
            geom_boxplot(width = 0.1, fill = "white", outlier.shape = NA, alpha = 0.8, color = "black")
         
         # Add strictly horizontal bracket & text annotation if comparison is significant
         if (!is.na(sig_text) && sig_text != "ns") {
            p <- p + 
               annotate("segment", x = 1, xend = 2, y = bracket_y, yend = bracket_y, color = "black", linewidth = 0.4) +
               annotate("text", x = 1.5, y = text_y, label = sig_text, fontface = "bold", size = (input$textSize / 3) + 0.5, vjust = 0)
         }
         
         if (!is.null(contrast_info) && !is.null(contrast_info$ref) && !is.null(contrast_info$comp)) {
            p <- p + scale_x_discrete(labels = c(
               "Enriched in Ref" = paste0("Enriched in Ref\n(", contrast_info$ref[1], ")"),
               "Enriched in Comp" = paste0("Enriched in Comp\n(", contrast_info$comp[1], ")")
            ))
         }
         
         p <- p +
            ggrepel::geom_text_repel(
              data = subset(sub_df, Lipid_Name %in% labeled_lipids),
              aes(label = Lipid_Name),
              size = input$textSize / 3,
              max.overlaps = 50,
              box.padding = 0.5
            ) +
            scale_fill_manual(values = c("Enriched in Ref" = ref_col, "Enriched in Comp" = comp_col)) +
            labs(title = paste(if (!is.null(input$classLabelFormat) && input$classLabelFormat == "full") get_full_class_name(cls) else get_short_class_name(cls), "-", feat_name), y = feat_name, x = NULL) +
            theme_pubr(base_size = input$textSize) +
            theme(legend.position = "none") +
            scale_y_continuous(expand = expansion(mult = c(0.08, 0.18))) +
            coord_cartesian(clip = "off")
         
         plot_list[[length(plot_list) + 1]] <- p
      }
      
      if(length(plot_list) > 0) {
        patchwork::wrap_plots(plot_list, ncol = min(2, length(plot_list)))
      } else {
    # Return empty plot with message
        ggplot() + 
          annotate("text", x = 0.5, y = 0.5, label = "Insufficient data or invalid selected features.") + 
          theme_void()
      }
    }, ignoreNULL = FALSE)

    output$speciesPlotPlot <- renderPlot({
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      if (is.null(input$runAnalysis) || input$runAnalysis == 0) {
        return(generate_empty_plot_message("Click 'Initiate Structural Analysis' in the left sidebar to compute structural remodeling shifts"))
      }
      speciesPlotReactive()
    })
    
    # --- 5. Network Graph Plotting ---
    networkData <- reactive({
      req(shared_data$data_processed(), shared_data$annotationData())
      mat <- shared_data$data_processed() %>% tibble::column_to_rownames("Lipid_Name")
      anno <- shared_data$annotationData()
      
      filtered_ids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_ids)) mat <- mat[rownames(mat) %in% filtered_ids, , drop=FALSE]
      
      req(nrow(mat) > 3)
      mode <- input$networkLevel
      
      if (!is.null(input$classLabelFormat) && input$classLabelFormat == "full") {
         if ("subclass" %in% names(anno)) anno$subclass <- get_full_class_name(anno$subclass)
         if ("hyperclass" %in% names(anno)) anno$hyperclass <- get_full_class_name(anno$hyperclass)
      } else {
         if ("subclass" %in% names(anno)) anno$subclass <- get_short_class_name(anno$subclass)
         if ("hyperclass" %in% names(anno)) anno$hyperclass <- get_short_class_name(anno$hyperclass)
      }
      
      df_merge <- mat %>% tibble::rownames_to_column("Lipid_Name") %>%
         dplyr::left_join(anno, by="Lipid_Name")
      
      if(mode == "subclass") {
         df_agg <- df_merge %>% dplyr::filter(!is.na(subclass)) %>% dplyr::group_by(subclass) %>%
           dplyr::summarise(dplyr::across(where(is.numeric), sum, na.rm=TRUE)) %>%
           tibble::column_to_rownames("subclass")
      } else if (mode == "Total_Carbons") {
         df_agg <- df_merge %>% dplyr::filter(!is.na(Total_Carbons)) %>%
           dplyr::group_by(Total_Carbons) %>%
           dplyr::summarise(dplyr::across(where(is.numeric), sum, na.rm=TRUE)) %>%
           dplyr::mutate(Chain_Length = paste0("C", Total_Carbons)) %>%
           tibble::column_to_rownames("Chain_Length") %>% dplyr::select(-Total_Carbons)
      } else if (mode == "Total_DB") {
         df_agg <- df_merge %>% dplyr::filter(!is.na(Total_DB)) %>%
           dplyr::group_by(Total_DB) %>%
           dplyr::summarise(dplyr::across(where(is.numeric), sum, na.rm=TRUE)) %>%
           dplyr::mutate(Saturation = paste0("DB:", Total_DB)) %>%
           tibble::column_to_rownames("Saturation") %>% dplyr::select(-Total_DB)
      } else {
         df_agg <- df_merge %>% tibble::column_to_rownames("Lipid_Name") %>%
           dplyr::select(where(is.numeric))
      }
      
      if (nrow(df_agg) < 3) return(NULL)
      
      cor_mat <- cor(t(df_agg), use = "pairwise.complete.obs", method = "pearson")
      cor_mat[lower.tri(cor_mat, diag=TRUE)] <- NA
      
      cor_df <- as.data.frame(as.table(cor_mat)) %>%
         dplyr::filter(!is.na(Freq)) %>%
         dplyr::rename(Node_1 = Var1, Node_2 = Var2, Pearson_r = Freq) %>%
         dplyr::mutate(AbsCor = abs(Pearson_r)) %>%
         dplyr::filter(AbsCor >= input$networkThresh)
         
      if(nrow(cor_df) == 0) return(NULL)
      
      n_samples <- ncol(df_agg)
      if(n_samples > 3) {
          t_stat <- cor_df$Pearson_r * sqrt((n_samples - 2) / (1 - cor_df$Pearson_r^2))
          cor_df$P_Value <- 2 * pt(-abs(t_stat), df = n_samples - 2)
      } else {
          cor_df$P_Value <- NA
      }
      
      cor_df <- cor_df %>% dplyr::mutate(
         Direction = ifelse(Pearson_r > 0, "+ (Positive)", "- (Negative)"),
         Significance = dplyr::case_when(
            is.na(P_Value) ~ "ns",
            P_Value < 0.001 ~ "p < 0.001",
            P_Value < 0.01 ~ "p < 0.01",
            P_Value < 0.05 ~ "p < 0.05",
            TRUE ~ "ns"
         )
      ) %>% dplyr::filter(Significance != "ns")
      
      if(nrow(cor_df) == 0) return(NULL)
      
      if (nrow(cor_df) > 100) {
         cor_df <- cor_df %>% dplyr::arrange(dplyr::desc(AbsCor)) %>% head(100)
      }
      
      nodes <- data.frame(name = unique(c(as.character(cor_df$Node_1), as.character(cor_df$Node_2))))
      
      if(mode == "subclass") {
         nodes$color_cat <- nodes$name
         c_map <- shared_data$class_color_map()
         if (!is.null(c_map) && !is.null(input$classLabelFormat) && input$classLabelFormat == "full") {
            names(c_map) <- get_full_class_name(names(c_map))
         } else if (!is.null(c_map)) {
            names(c_map) <- get_short_class_name(names(c_map))
         }
         if(is.null(c_map)) {
            pal <- RColorBrewer::brewer.pal(8, "Set2")
            nodes$color_val <- pal[as.numeric(as.factor(nodes$color_cat)) %% 8 + 1]
         } else {
            nodes$color_val <- c_map[nodes$color_cat]
         }
      } else if (mode %in% c("Total_Carbons", "Total_DB")) {
         nodes$color_val <- "#EDC948"
      } else {
         nodes$color_cat <- anno$subclass[match(nodes$name, anno$Lipid_Name)]
         c_map <- shared_data$class_color_map()
         if (!is.null(c_map) && !is.null(input$classLabelFormat) && input$classLabelFormat == "full") {
            names(c_map) <- get_full_class_name(names(c_map))
         } else if (!is.null(c_map)) {
            names(c_map) <- get_short_class_name(names(c_map))
         }
         nodes$color_val <- if(!is.null(c_map)) c_map[nodes$color_cat] else "#B0B0B0"
         nodes$color_val[is.na(nodes$color_val)] <- "#B0B0B0"
      }
      
      g <- tidygraph::tbl_graph(nodes = nodes, edges = cor_df, directed = FALSE)
      return(list(graph = g, mode = mode))
    })
    
    output$networkPlot <- renderPlot({
       net <- networkData()
       if(is.null(net)) {
          plot.new()
          text(0.5, 0.5, "No significant correlations found at this threshold.", cex=1.5)
          return()
       }
       g <- net$graph
       border_col <- if (isTRUE(input$circledDots) && !is.null(input$borderColor) && nzchar(input$borderColor)) input$borderColor else "black"
       p <- ggraph::ggraph(g, layout = input$networkLayout) +
         ggraph::geom_edge_link(aes(color = Direction, edge_width = Significance), alpha = 0.7) +
         ggraph::scale_edge_width_manual(values = c("p < 0.05" = 0.5, "p < 0.01" = 1.2, "p < 0.001" = 2.0)) +
         ggraph::scale_edge_color_manual(values = c("+ (Positive)" = "#0072B2", "- (Negative)" = "#D55E00")) +
         ggraph::geom_node_point(aes(fill = I(color_val)), shape = 21, size = 10, color = border_col, stroke = 1) +
         ggraph::geom_node_text(aes(label = name), repel = TRUE, size = 4.5, fontface = "bold", bg.color = "white", bg.r = 0.15) +
         ggplot2::theme_void() +
         ggplot2::theme(
            legend.position = "right",
            legend.title = element_text(face="bold"),
            plot.title = element_text(face="bold", size=16)
         ) +
         ggplot2::labs(title = paste("Undirected Correlation Network:", net$mode),
                       edge_color = "Correlation", edge_width = "Significance")
       p
    })
    
   # --- Downloads ---
    output$downloadSummaryPDF <- downloadHandler(
      filename = function() { paste0("structural_summary_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          p <- summaryPlotReactive()
          if(is.null(p)) stop("Summary plot is NULL")
          w <- session$clientData[[paste0("output_", session$ns("summaryPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("summaryPlot"), "_height")]]
          if(!is.null(input$summaryPlot_size)) {
              w <- input$summaryPlot_size$width
              h <- input$summaryPlot_size$height
          } else if(!is.null(input$summary_plot_container_size)) {
              w <- input$summary_plot_container_size$width
              h <- input$summary_plot_container_size$height
          }
          w_in <- 10
          h_in <- 8
          if (!is.null(w) && w > 10) w_in <- w / 72
          if (!is.null(h) && h > 10) h_in <- h / 72
          ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in ggsave/summaryPlotReactive:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )

    output$downloadSummaryCSV <- downloadHandler(
      filename = function() { paste0("structural_summary_", format(Sys.Date(), "%Y%m%d"), ".csv") },
      content = function(file) {
        res <- auditResults()
        req(res)
        write.csv(res, file, row.names = FALSE)
      }
    )

    output$downloadSpeciesPDF <- downloadHandler(
      filename = function() { paste0("structural_species_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          p <- speciesPlotReactive()
          if(is.null(p)) stop("Species plot is NULL")
          w <- session$clientData[[paste0("output_", session$ns("speciesPlotPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("speciesPlotPlot"), "_height")]]
          if(!is.null(input$speciesPlotPlot_size)) {
              w <- input$speciesPlotPlot_size$width
              h <- input$speciesPlotPlot_size$height
          } else if(!is.null(input$species_plot_container_size)) {
              w <- input$species_plot_container_size$width
              h <- input$species_plot_container_size$height
          }
          w_in <- 12
          h_in <- 8
          if (!is.null(w) && w > 10) w_in <- w / 72
          if (!is.null(h) && h > 10) h_in <- h / 72
          ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in ggsave/speciesPlotReactive:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
    output$structural_stat_note <- renderUI({
      get_journal_caption("structural", shared_data$actual_de_method(), shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info())
    })
    
    output$species_stat_note <- renderUI({
      get_journal_caption("violin", shared_data$actual_de_method(), shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info())
    })
    
    # --- Statistical Audit Console Triggers & Routing ---
    trigger_differential_stats_modal <- function() {
      diff_res <- tryCatch(diff_acyl_data(), error = function(e) NULL)
      msg <- generate_diff_acyl_stats_report(diff_res, shared_data, input)
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Differential Acyl Chain Expression")
    }

    trigger_proportions_stats_modal <- function() {
      raw <- tryCatch(prop_raw_chain_data(), error = function(e) NULL)
      msg <- generate_prop_stats_report(raw, shared_data, input)
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Acyl Chain Proportions")
    }

    trigger_structural_stats_modal <- function() {
      # Build detailed mathematical report for Structural Analysis
      de_sett <- shared_data$de_settings()
      actual_method <- shared_data$actual_de_method()
      base_method <- gsub("^auto_", "", actual_method)
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: STRUCTURAL ANALYSIS\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. ANALYSIS CONFIGURATION\n",
        "   - Grouping Level:           ", switch(input$structuralGrouping %||% "subclass", "subclass" = "Lipid Main Class", "hyperclass" = "Lipid Category", input$structuralGrouping %||% "subclass"), "\n",
        "   - Minimum Lipids per Main Class: ", input$minClassSize, "\n",
        "   - Underlying DE Method:     ", actual_method, "\n",
        "   - Underlying P-value Type:  ", de_sett$p_value_type, "\n",
        "   - Ignore DE Threshold:      ", ifelse(isTRUE(input$noSigThreshold), "Yes", "No"), "\n\n",
        "2. MATHEMATICAL FORMULATION & CALCULUS EXAMPLE\n",
        "   For a given lipid class 'C' and a structural feature 'F' (e.g., Total Carbon Length, Double Bonds):\n\n",
        "   1. Enrichment Partitioning:\n",
        "      Lipids belonging to class 'C' are split into two groups based on the sign of their Log2 Fold Change (Log2FC)\n",
        "      derived from the main differential expression (DE) analysis:\n",
        "        * Comparison Enriched Group (S_comp): lipids with Log2FC > 0\n",
        "        * Reference Enriched Group (S_ref): lipids with Log2FC <= 0\n\n",
        "   2. Property Mean Difference (Shift):\n",
        "      Let V_comp be the feature values of lipids in S_comp (size n_comp), and V_ref be the feature values of lipids in S_ref (size n_ref).\n",
        "        Delta_mu_F = Mean(V_comp) - Mean(V_ref)\n",
        "                   = (1 / n_comp) * sum_{i in S_comp} F_i  -  (1 / n_ref) * sum_{j in S_ref} F_j\n\n",
        "   3. Hypothesis Testing:\n",
        "      We test the null hypothesis that there is no difference in structural property 'F' between the two enriched directions.\n"
      )
      
      if (base_method == "non_parametric") {
        msg <- paste0(
          msg,
          "      We perform a Wilcoxon rank-sum test by pooling V_comp and V_ref, ranking them,\n",
          "      and computing the Mann-Whitney U statistic:\n",
          "          U = R_comp - [n_comp * (n_comp + 1)] / 2\n",
          "          Z-score = (U - mu_U) / sigma_U\n"
        )
      } else {
        msg <- paste0(
          msg,
          "      We perform a standard two-sample Student's t-test with pooled variance:\n",
          "          t = Delta_mu_F / ( s_p * sqrt(1/n_comp + 1/n_ref) )\n",
          "      where the pooled standard deviation s_p is:\n",
          "          s_p = sqrt( ( (n_comp - 1)*s_comp^2 + (n_ref - 1)*s_ref^2 ) / (n_comp + n_ref - 2) )\n",
          "      The p-value is computed from Student's t-distribution with df = n_comp + n_ref - 2.\n"
        )
      }
      
      msg <- paste0(
        msg,
        "\n   4. Multiple Testing Correction:\n",
        "      P-values are adjusted using the Benjamini-Hochberg (BH) False Discovery Rate (FDR) procedure:\n",
        "          Adjusted P(i) = P(i) * total_tests / rank_i\n",
        "==================================================\n"
      )
      
      msg <- paste0(msg, "\n", get_stats_console_method_summary(shared_data))
      
      # Write to stats_detail_text and display modal overlay
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      origin_title <- if (identical(input$structural_subtabs, "Violin Plots")) "Lipid Species Identification" else "Structural Analysis"
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = origin_title)
    }

    # Dedicated trigger observers
    observeEvent(input$diff_show_stats_detail, {
      trigger_differential_stats_modal()
    })
    
    observeEvent(input$diff_table_show_stats_detail, {
      trigger_differential_stats_modal()
    })
    
    observeEvent(input$prop_show_stats_detail, {
      active_view <- input$prop_subtab_view %||% "proportions_view"
      if (identical(active_view, "differential_view")) {
        trigger_differential_stats_modal()
      } else {
        trigger_proportions_stats_modal()
      }
    })

    # Sidebar button observer dynamically routed based on active tab and subview
    observeEvent(input$show_stats_detail, {
      active_subtab <- input$structural_subtabs %||% "Structural Analysis Dot Plots"
      if (identical(active_subtab, "Main Class & Acyl Chain Proportions")) {
        active_view <- input$prop_subtab_view %||% "proportions_view"
        if (identical(active_view, "differential_view")) {
          trigger_differential_stats_modal()
        } else {
          trigger_proportions_stats_modal()
        }
      } else {
        trigger_structural_stats_modal()
      }
    })
    
  # --- 5. Subclass & Acyl Chain Composition Proportions Server ---
    
    prop_color_map <- reactiveVal(character(0))

    output$prop_group_var_ui <- renderUI({
      meta <- shared_data$all_metadata()
      req(meta)
      
      valid_cols <- c("Group1")
      if ("Group2" %in% names(meta)) {
        g2_clean <- meta$Group2[!is.na(meta$Group2) & nzchar(meta$Group2) & meta$Group2 != "Unspecified"]
        if (length(unique(g2_clean)) > 0) {
          valid_cols <- c(valid_cols, "Group2", "Group1_Group2")
        }
      }
      valid_cols <- c(valid_cols, "FullName")
      choices <- get_metadata_group_named_choices(valid_cols, meta)
      
      cohort_cols <- setdiff(valid_cols, "FullName")
      default_cohort <- determine_default_grouping_metadata(meta, cohort_cols)
      if (length(default_cohort) == 0 || !default_cohort[1] %in% choices) {
        default_cohort <- if ("Group1" %in% choices) "Group1" else choices[1]
      } else {
        default_cohort <- default_cohort[1]
      }
      
      curr_sel <- isolate(input$prop_group_var)
      selected_val <- if (!is.null(curr_sel) && curr_sel %in% choices) {
        curr_sel
      } else if ("FullName" %in% choices) {
        "FullName"
      } else {
        default_cohort
      }
      
      selectInput(session$ns("prop_group_var"), "Group By (Y-Axis):", choices = choices, selected = selected_val)
    })

    build_class_selection_choices <- function(anno, grp_level = "Lipid Main Class", class_mode = "major", allowed_mods = NULL, curr_sel = NULL) {
      if (is.null(allowed_mods)) {
        allowed_mods <- c("standard", "mature", "plasmalogen", "ether", "dihydro")
      }
      
      if (identical(grp_level, "Lipid Category")) {
        cat_choices_map <- c(
          "Glycerophospholipids (GP)" = "GP",
          "Sphingolipids (SP)" = "SP",
          "Glycerolipids (GL)" = "GL",
          "Sterol Lipids (ST)" = "ST",
          "Fatty Acyls (FA)" = "FA"
        )
        detected_cats <- unique(anno$hyperclass)
        detected_cats <- detected_cats[!is.na(detected_cats) & nzchar(detected_cats)]
        valid_cats <- intersect(unname(cat_choices_map), detected_cats)
        
        choices_vec <- cat_choices_map[cat_choices_map %in% valid_cats]
        choices <- c("All Categories" = "all_categories", choices_vec)
        
        selected_val <- if (!is.null(curr_sel) && any(curr_sel %in% c("all_categories", valid_cats))) {
          curr_sel[curr_sel %in% c("all_categories", valid_cats)]
        } else if ("GP" %in% valid_cats) {
          "GP"
        } else if (length(valid_cats) > 0) {
          valid_cats[1]
        } else {
          "all_categories"
        }
        if (length(selected_val) > 1 && any(selected_val %in% c("all_categories", "all"))) {
          specific <- setdiff(selected_val, c("all_categories", "all"))
          if (length(specific) > 0) selected_val <- specific
        }
        
        return(list(choices = choices, selected_val = selected_val, label = "Selected Lipid Categories:"))
      } else {
        clean_subclass <- gsub("^GP_|^SP_|^GL_|^ST_|^FA_", "", anno$subclass)
        clean_base_class <- gsub("_.*$", "", clean_subclass)
        
        if (class_mode %in% c("subclasses", "linkage")) {
          mod_type <- dplyr::case_when(
            grepl("_P$", anno$subclass) | anno$modification == "plasmalogen" | grepl("\\(P-", anno$Lipid_Name, ignore.case = TRUE) ~ "Plasmalogen (P-)",
            grepl("_E$", anno$subclass) | anno$modification == "ether" | grepl("\\(O-", anno$Lipid_Name, ignore.case = TRUE) ~ "Ether (O-)",
            anno$modification == "dihydro" | grepl("_dh$", anno$subclass) | grepl("(?i)(Cer|SM)\\s*\\(d\\d+:0", anno$Lipid_Name, perl = TRUE) ~ "Dihydro (d-)",
            anno$modification == "mature" | grepl("(?i)(Cer|SM)\\s*\\(d\\d+:[1-9]", anno$Lipid_Name, perl = TRUE) ~ "Mature",
            clean_base_class %in% c("LPC", "LPE", "LPG", "LPI", "LPS", "LPA") ~ "Lyso",
            TRUE ~ "Standard / Diacyl"
          )
          
          mod_key <- dplyr::case_when(
            mod_type == "Plasmalogen (P-)" ~ "plasmalogen",
            mod_type == "Ether (O-)" ~ "ether",
            mod_type == "Dihydro (d-)" ~ "dihydro",
            mod_type == "Mature" ~ "mature",
            TRUE ~ "standard"
          )
          
          has_multi_mod <- clean_base_class %in% names(which(tapply(mod_type, clean_base_class, function(x) length(unique(x))) > 1))
          subclass_label <- ifelse(
            mod_type %in% c("Standard / Diacyl") & !has_multi_mod,
            clean_base_class,
            ifelse(
              clean_base_class == "PE" & mod_type == "Standard / Diacyl",
              "Phosphatidylethanolamine (PE)",
              paste0(clean_base_class, " [", mod_type, "]")
            )
          )
          subclass_id <- paste0(clean_base_class, "__", gsub("[^A-Za-z0-9]", "", mod_type))
          
          detected_df <- data.frame(
            id = subclass_id,
            label = subclass_label,
            base_cls = clean_base_class,
            mod_type = mod_type,
            mod_key = mod_key,
            stringsAsFactors = FALSE
          ) %>% dplyr::distinct()
          
          detected_df <- detected_df %>% dplyr::filter(mod_key %in% allowed_mods)
          
          mod_order <- c("Standard / Diacyl" = 1, "Mature" = 2, "Plasmalogen (P-)" = 3, "Ether (O-)" = 4, "Dihydro (d-)" = 5, "Lyso" = 6)
          detected_df$ord <- mod_order[detected_df$mod_type] %||% 7
          detected_df <- detected_df %>% dplyr::arrange(base_cls, ord)
          
          choices_vec <- stats::setNames(detected_df$id, detected_df$label)
          choices <- c(
            "All Phospholipid Subclasses" = "all_pl_subclasses",
            "All Detected Subclasses" = "all_subclasses",
            choices_vec
          )
          
          matching_ids <- detected_df$id[detected_df$base_cls %in% curr_sel | detected_df$id %in% curr_sel]
          
          default_sel <- if (any(c("PE__StandardDiacyl", "PE__PlasmalogenP") %in% detected_df$id)) {
            intersect(c("PE__StandardDiacyl", "PE__EtherO", "PE__PlasmalogenP"), detected_df$id)
          } else if (nrow(detected_df) > 0) {
            detected_df$id[1]
          } else {
            character(0)
          }
          
          selected_val <- if (length(matching_ids) > 0) {
            matching_ids
          } else if (!is.null(curr_sel) && any(curr_sel %in% c(names(choices), choices))) {
            curr_sel[curr_sel %in% c(names(choices), choices)]
          } else {
            default_sel
          }
          if (length(selected_val) > 1 && any(selected_val %in% c("all_subclasses", "all_pl_subclasses", "all"))) {
            specific <- setdiff(selected_val, c("all_subclasses", "all_pl_subclasses", "all"))
            if (length(specific) > 0) selected_val <- specific
          }
          
          return(list(choices = choices, selected_val = selected_val, label = "Selected Lipid Classes & Subclasses:"))
        } else {
          all_classes <- c("PC", "PE", "PI", "PS", "PG", "PA", "TAG", "DAG", "Cer", "SM", "LPC", "LPE", "ACar", "CE", "CL")
          detected <- intersect(all_classes, unique(clean_base_class))
          other_detected <- setdiff(unique(clean_base_class), c(all_classes, "Misc", ""))
          detected <- c(detected, sort(other_detected))
          
          choices <- c("All Phospholipids" = "phospholipids", "All Classes" = "all", detected)
          
          clean_curr <- unique(gsub("__.*$", "", curr_sel))
          valid_sel <- intersect(c(curr_sel, clean_curr), unname(choices))
          if (length(valid_sel) > 1 && any(valid_sel %in% c("all", "phospholipids"))) {
            specific <- setdiff(valid_sel, c("all", "phospholipids"))
            if (length(specific) > 0) valid_sel <- specific
          }
          selected_val <- if (length(valid_sel) > 0) valid_sel else if ("PE" %in% choices) "PE" else if ("PC" %in% choices) "PC" else choices[1]
          
          return(list(choices = choices, selected_val = selected_val, label = "Selected Lipid Classes:"))
        }
      }
    }

    output$prop_target_class_ui <- renderUI({
      anno <- shared_data$annotationData()
      req(anno)
      grp_level <- input$prop_group_level %||% "Lipid Main Class"
      class_mode <- input$prop_class_mode %||% (if (!is.null(input$prop_mode) && input$prop_mode == "subclass") "subclasses" else "major")
      allowed_mods <- input$prop_subclass_mod_types %||% c("standard", "mature", "plasmalogen", "ether", "dihydro")
      curr_sel <- isolate(input$prop_target_classes)
      
      res <- build_class_selection_choices(anno, grp_level, class_mode, allowed_mods, curr_sel)
      selectizeInput(session$ns("prop_target_classes"), res$label,
                     choices = res$choices, selected = res$selected_val, multiple = TRUE,
                     options = list(plugins = list("remove_button"), placeholder = "Select or type classes/categories..."))
    })

    output$diff_target_class_ui <- renderUI({
      anno <- shared_data$annotationData()
      req(anno)
      grp_level <- input$diff_group_level %||% (input$prop_group_level %||% "Lipid Main Class")
      class_mode <- input$diff_class_mode %||% (input$prop_class_mode %||% "major")
      allowed_mods <- input$diff_subclass_mod_types %||% (input$prop_subclass_mod_types %||% c("standard", "mature", "plasmalogen", "ether", "dihydro"))
      curr_sel <- isolate(input$diff_target_classes) %||% isolate(input$prop_target_classes)
      
      res <- build_class_selection_choices(anno, grp_level, class_mode, allowed_mods, curr_sel)
      selectizeInput(session$ns("diff_target_classes"), res$label,
                     choices = res$choices, selected = res$selected_val, multiple = TRUE,
                     options = list(plugins = list("remove_button"), placeholder = "Select or type classes/categories..."))
    })

    # Two-way synchronization between Stacked Proportions and Differential Acyl Chain selections
    # Helper to resolve macro exclusivity ("all", "phospholipids", etc. vs specific items)
    resolve_macro_exclusivity <- function(sel) {
      if (length(sel) <= 1) return(sel)
      macro_keys <- c("all", "phospholipids", "all_categories", "all_subclasses", "all_pl_subclasses")
      has_macro <- intersect(sel, macro_keys)
      has_specific <- setdiff(sel, macro_keys)
      if (length(has_macro) > 0 && length(has_specific) > 0) {
        last_item <- utils::tail(sel, 1)
        if (last_item %in% macro_keys) last_item else has_specific
      } else {
        sel
      }
    }

    # 1. Target Classes / Items Sync & Mutual Exclusivity
    is_syncing_structural_inputs <- FALSE

    observeEvent(input$prop_target_classes, {
      if (is_syncing_structural_inputs) return()
      sel <- input$prop_target_classes
      req(!is.null(sel), length(sel) > 0)
      clean_sel <- resolve_macro_exclusivity(sel)
      if (!identical(sel, clean_sel)) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateSelectizeInput(session, "prop_target_classes", selected = clean_sel)
        return()
      }
      diff_sel <- input$diff_target_classes
      if (!is.null(diff_sel) && !identical(sort(clean_sel), sort(diff_sel))) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateSelectizeInput(session, "diff_target_classes", selected = clean_sel)
      }
    }, ignoreInit = TRUE)

    observeEvent(input$diff_target_classes, {
      if (is_syncing_structural_inputs) return()
      sel <- input$diff_target_classes
      req(!is.null(sel), length(sel) > 0)
      clean_sel <- resolve_macro_exclusivity(sel)
      if (!identical(sel, clean_sel)) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateSelectizeInput(session, "diff_target_classes", selected = clean_sel)
        return()
      }
      prop_sel <- input$prop_target_classes
      if (!is.null(prop_sel) && !identical(sort(clean_sel), sort(prop_sel))) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateSelectizeInput(session, "prop_target_classes", selected = clean_sel)
      }
    }, ignoreInit = TRUE)

    # 2. Grouping Level Sync (Main Class vs Category)
    observeEvent(input$prop_group_level, {
      if (is_syncing_structural_inputs) return()
      val <- input$prop_group_level
      req(val)
      if (!is.null(input$diff_group_level) && !identical(input$diff_group_level, val)) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateRadioButtons(session, "diff_group_level", selected = val)
      }
    }, ignoreInit = TRUE)

    observeEvent(input$diff_group_level, {
      if (is_syncing_structural_inputs) return()
      val <- input$diff_group_level
      req(val)
      if (!is.null(input$prop_group_level) && !identical(input$prop_group_level, val)) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateRadioButtons(session, "prop_group_level", selected = val)
      }
    }, ignoreInit = TRUE)

    # 3. Class Mode Sync (Major vs Subclasses)
    observeEvent(input$prop_class_mode, {
      if (is_syncing_structural_inputs) return()
      val <- input$prop_class_mode
      req(val)
      if (!is.null(input$diff_class_mode) && !identical(input$diff_class_mode, val)) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateRadioButtons(session, "diff_class_mode", selected = val)
      }
    }, ignoreInit = TRUE)

    observeEvent(input$diff_class_mode, {
      if (is_syncing_structural_inputs) return()
      val <- input$diff_class_mode
      req(val)
      if (!is.null(input$prop_class_mode) && !identical(input$prop_class_mode, val)) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateRadioButtons(session, "prop_class_mode", selected = val)
      }
    }, ignoreInit = TRUE)

    # 4. Subclass Modification Types Sync
    observeEvent(input$prop_subclass_mod_types, {
      if (is_syncing_structural_inputs) return()
      val <- input$prop_subclass_mod_types
      req(val)
      if (!is.null(input$diff_subclass_mod_types) && !identical(sort(input$diff_subclass_mod_types), sort(val))) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateCheckboxGroupInput(session, "diff_subclass_mod_types", selected = val)
      }
    }, ignoreInit = TRUE)

    observeEvent(input$diff_subclass_mod_types, {
      if (is_syncing_structural_inputs) return()
      val <- input$diff_subclass_mod_types
      req(val)
      if (!is.null(input$prop_subclass_mod_types) && !identical(sort(input$prop_subclass_mod_types), sort(val))) {
        is_syncing_structural_inputs <<- TRUE
        on.exit(is_syncing_structural_inputs <<- FALSE, add = TRUE)
        shiny::updateCheckboxGroupInput(session, "prop_subclass_mod_types", selected = val)
      }
    }, ignoreInit = TRUE)

    # ReactiveVal holding active selection of acyl chains (NULL = default to all available chains)
    prop_selected_chains <- reactiveVal(NULL)

    # 1. Raw Long Data Reactive: extracts all individual acyl chains for the active class/position/group selection
    extract_filtered_raw_chain_data <- function(
      df_proc,
      meta,
      anno,
      grp_var = NULL,
      grp_level = "Lipid Main Class",
      class_mode = "major",
      subclass_mod_types = c("standard", "mature", "plasmalogen", "ether", "dihydro"),
      cls_targets = NULL,
      val_mode = "Absolute (%)",
      pos_mode = "both",
      multiclass_mode = "stacked"
    ) {
      cohort_cols <- c("Group1")
      if ("Group2" %in% names(meta)) {
        g2_clean <- meta$Group2[!is.na(meta$Group2) & nzchar(meta$Group2) & meta$Group2 != "Unspecified"]
        if (length(unique(g2_clean)) > 0) cohort_cols <- c(cohort_cols, "Group2", "Group1_Group2")
      }
      default_grp <- determine_default_grouping_metadata(meta, cohort_cols)
      fallback_grp <- if (length(default_grp) > 0 && default_grp[1] %in% names(meta)) default_grp[1] else if ("Group1" %in% names(meta)) "Group1" else if ("FullName" %in% names(meta)) "FullName" else names(meta)[1]
      
      if (is.null(grp_var) || !grp_var %in% c(names(meta), "Group1_Group2")) {
        grp_var <- fallback_grp
      }
      
      # Handle Group1_Group2 composite
      meta_temp <- meta
      if (grp_var == "Group1_Group2") {
        meta_temp$Group1_Group2 <- paste(meta_temp$Group1, meta_temp$Group2, sep = " & ")
      }
      
      grp_display <- get_metadata_group_label(grp_var, meta)
      
      # Ensure clean numeric matrix with Lipid_Name as rownames
      if ("Lipid_Name" %in% names(df_proc)) {
        mat_raw <- df_proc %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      } else {
        mat_raw <- as.matrix(df_proc)
      }
      mode(mat_raw) <- "numeric"
      
      # Guard against double-exponentiation: if data is already linear (max > 35), keep as linear
      max_val <- suppressWarnings(max(mat_raw, na.rm = TRUE))
      if (is.finite(max_val) && max_val <= 35) {
        mat_lin <- 2^mat_raw
      } else {
        mat_lin <- mat_raw
      }
      
      # Precompute clean subclass, base class, and linkage/modification annotations
      clean_subclass <- gsub("^GP_|^SP_|^GL_|^ST_|^FA_", "", anno$subclass)
      clean_base_class <- gsub("_.*$", "", clean_subclass)
      
      mod_type <- dplyr::case_when(
        grepl("_P$", anno$subclass) | anno$modification == "plasmalogen" | grepl("\\(P-", anno$Lipid_Name, ignore.case = TRUE) ~ "Plasmalogen (P-)",
        grepl("_E$", anno$subclass) | anno$modification == "ether" | grepl("\\(O-", anno$Lipid_Name, ignore.case = TRUE) ~ "Ether (O-)",
        anno$modification == "dihydro" | grepl("_dh$", anno$subclass) | grepl("(?i)(Cer|SM)\\s*\\(d\\d+:0", anno$Lipid_Name, perl = TRUE) ~ "Dihydro (d-)",
        anno$modification == "mature" | grepl("(?i)(Cer|SM)\\s*\\(d\\d+:[1-9]", anno$Lipid_Name, perl = TRUE) ~ "Mature",
        clean_base_class %in% c("LPC", "LPE", "LPG", "LPI", "LPS", "LPA") ~ "Lyso",
        TRUE ~ "Standard / Diacyl"
      )
      
      mod_key <- dplyr::case_when(
        mod_type == "Plasmalogen (P-)" ~ "plasmalogen",
        mod_type == "Ether (O-)" ~ "ether",
        mod_type == "Dihydro (d-)" ~ "dihydro",
        mod_type == "Mature" ~ "mature",
        TRUE ~ "standard"
      )
      
      has_multi_mod <- clean_base_class %in% names(which(tapply(mod_type, clean_base_class, function(x) length(unique(x))) > 1))
      subclass_label <- ifelse(
        mod_type %in% c("Standard / Diacyl") & !has_multi_mod,
        clean_base_class,
        ifelse(
          clean_base_class == "PE" & mod_type == "Standard / Diacyl",
          "Phosphatidylethanolamine (PE)",
          paste0(clean_base_class, " [", mod_type, "]")
        )
      )
      subclass_id <- paste0(clean_base_class, "__", gsub("[^A-Za-z0-9]", "", mod_type))
      
      anno$clean_subclass <- clean_subclass
      anno$Base_Class <- clean_base_class
      anno$mod_type <- mod_type
      anno$mod_key <- mod_key
      anno$Subclass_ID <- subclass_id
      anno$Subclass_Label <- subclass_label
      
      CATEGORY_NAMES <- c(
        "GP" = "Glycerophospholipids (GP)",
        "SP" = "Sphingolipids (SP)",
        "GL" = "Glycerolipids (GL)",
        "ST" = "Sterol Lipids (ST)",
        "FA" = "Fatty Acyls (FA)",
        "Misc" = "Other Lipids"
      )

      if (is.null(cls_targets) || length(cls_targets) == 0) {
        cls_targets <- if (grp_level == "Lipid Category") {
          if ("GP" %in% anno$hyperclass) "GP" else unique(anno$hyperclass)[1]
        } else if (class_mode %in% c("subclasses", "linkage")) {
          pe_subs <- intersect(c("PE__StandardDiacyl", "PE__EtherO", "PE__PlasmalogenP"), anno$Subclass_ID)
          if (length(pe_subs) > 0) pe_subs else unique(anno$Subclass_ID)[1]
        } else {
          if ("PE" %in% clean_base_class) "PE" else if ("PC" %in% clean_base_class) "PC" else unique(clean_base_class)[1]
        }
      }
      
      # If specific targets and macro keys coexist, strictly prioritize specific targets
      macro_keys <- c("all", "phospholipids", "all_categories", "all_subclasses", "all_pl_subclasses")
      specific_targets <- setdiff(cls_targets, macro_keys)
      if (length(specific_targets) > 0 && any(cls_targets %in% macro_keys)) {
        cls_targets <- specific_targets
      }
      
      # Map samples to GroupingVal
      sample_grps <- stats::setNames(as.character(meta_temp[[grp_var]]), meta_temp$FullName)
      
      # Filter lipids based on target classes/subclasses or categories
      if (grp_level == "Lipid Category") {
        anno_sub <- if ("all_categories" %in% cls_targets || "all" %in% cls_targets) {
          anno
        } else {
          anno %>% dplyr::filter(hyperclass %in% cls_targets)
        }
        anno_sub$LipidClass <- unname(CATEGORY_NAMES[anno_sub$hyperclass])
        anno_sub$LipidClass[is.na(anno_sub$LipidClass)] <- anno_sub$hyperclass[is.na(anno_sub$LipidClass)]
      } else if (class_mode %in% c("subclasses", "linkage")) {
        allowed_mods <- subclass_mod_types %||% c("standard", "mature", "plasmalogen", "ether", "dihydro")
        anno_filtered <- anno %>% dplyr::filter(mod_key %in% allowed_mods)
        
        anno_sub <- if ("all_subclasses" %in% cls_targets || "all" %in% cls_targets) {
          anno_filtered
        } else if ("all_pl_subclasses" %in% cls_targets) {
          anno_filtered %>% dplyr::filter(hyperclass == "GP" | Base_Class %in% c("PC", "PE", "PI", "PS", "PG", "PA", "CL", "LPC", "LPE"))
        } else {
          anno_filtered %>% dplyr::filter(
            Subclass_ID %in% cls_targets | 
            Subclass_Label %in% cls_targets | 
            Base_Class %in% cls_targets
          )
        }
        anno_sub$LipidClass <- anno_sub$Subclass_Label
      } else {
        anno_sub <- if ("all" %in% cls_targets) {
          anno
        } else if ("phospholipids" %in% cls_targets) {
          anno %>% dplyr::filter(hyperclass == "GP" | Base_Class %in% c("PC", "PE", "PI", "PS", "PG", "PA", "CL"))
        } else {
          anno %>% dplyr::filter(
            Base_Class %in% cls_targets | 
            clean_subclass %in% cls_targets | 
            subclass %in% cls_targets | 
            subclass %in% paste0("GP_", cls_targets)
          )
        }
        clean_subclass_sub <- gsub("^GP_|^SP_|^GL_|^ST_|^FA_", "", anno_sub$subclass)
        anno_sub$LipidClass <- gsub("_.*$", "", clean_subclass_sub)
      }
      
      if (nrow(anno_sub) == 0) return(NULL)
      valid_lipids <- intersect(anno_sub$Lipid_Name, rownames(mat_lin))
      if (length(valid_lipids) == 0) return(NULL)
      
      # Value Mode standardization: if Normalized, standardize each lipid across samples to sum to 1
      if (grepl("^Normalized", val_mode)) {
        row_sums <- rowSums(mat_lin[valid_lipids, , drop = FALSE], na.rm = TRUE)
        mat_sub <- mat_lin[valid_lipids, , drop = FALSE] / ifelse(row_sums > 0, row_sums, 1)
      } else {
        mat_sub <- mat_lin[valid_lipids, , drop = FALSE]
      }
      anno_sub <- anno_sub %>% dplyr::filter(Lipid_Name %in% valid_lipids)
      
      # Acyl Chain Composition (14:0, 16:0, 18:1, 20:4, 22:6, etc.)
      chain_records <- list()
      for (i in seq_len(nrow(anno_sub))) {
        l_name <- anno_sub$Lipid_Name[i]
        ch1_c <- anno_sub$nCchain1[i]; ch1_db <- anno_sub$DBchain1[i]
        ch2_c <- anno_sub$nCchain2[i]; ch2_db <- anno_sub$DBchain2[i]
        cls_tag <- anno_sub$subclass[i] %||% "Lipid"
        
        c_df <- extract_robust_acyl_chains(
          lipid_name = l_name,
          nCchain1 = ch1_c, DBchain1 = ch1_db,
          nCchain2 = ch2_c, DBchain2 = ch2_db,
          pos_mode = pos_mode,
          cls_name = gsub("^GP_|^SP_|^GL_|^ST_|^FA_", "", cls_tag)
        )
        
        if (!is.null(c_df) && nrow(c_df) > 0) {
          chain_records[[l_name]] <- c_df
        }
      }
      
      if (length(chain_records) == 0) return(NULL)
      
      records <- list()
      for (l_name in names(chain_records)) {
        c_df <- chain_records[[l_name]]
        l_cls <- anno_sub$LipidClass[anno_sub$Lipid_Name == l_name][1]
        for (k in seq_len(nrow(c_df))) {
          tok <- c_df$AcylChain[k]
          pos_tag <- c_df$Position[k]
          w <- c_df$Weight[k]
          intensities <- mat_sub[l_name, ] * w
          records[[length(records) + 1]] <- data.frame(
            Lipid_Name = l_name,
            LipidClass = l_cls,
            AcylChain = tok,
            Position = pos_tag,
            FullName = names(intensities),
            Intensity = as.numeric(intensities),
            stringsAsFactors = FALSE
          )
        }
      }
      
      df_long <- dplyr::bind_rows(records) %>%
        dplyr::mutate(GroupingVal = sample_grps[FullName]) %>%
        dplyr::filter(!is.na(GroupingVal), !is.na(AcylChain))
      
      df_long$AcylChain_Raw <- df_long$AcylChain
      
      list(
        df_long = df_long,
        anno_sub = anno_sub,
        cls_targets = cls_targets,
        grp_var = grp_var,
        grp_display = grp_display,
        grp_level = grp_level,
        val_mode = val_mode,
        class_mode = class_mode,
        pos_mode = pos_mode,
        multiclass_mode = multiclass_mode,
        CATEGORY_NAMES = CATEGORY_NAMES
      )
    }

    # 1. Raw Long Data Reactive: extracts all individual acyl chains for the active class/position/group selection
    prop_raw_chain_data <- reactive({
      req(shared_data$data_processed(), shared_data$all_metadata(), shared_data$annotationData())
      
      df_proc <- shared_data$data_processed()
      meta <- shared_data$all_metadata()
      anno <- shared_data$annotationData()
      req(df_proc, meta, anno, nrow(df_proc) > 0)
      
      res <- extract_filtered_raw_chain_data(
        df_proc = df_proc,
        meta = meta,
        anno = anno,
        grp_var = input$prop_group_var,
        grp_level = input$prop_group_level %||% "Lipid Main Class",
        class_mode = input$prop_class_mode %||% (if (!is.null(input$prop_mode) && input$prop_mode == "subclass") "subclasses" else "major"),
        subclass_mod_types = input$prop_subclass_mod_types %||% c("standard", "mature", "plasmalogen", "ether", "dihydro"),
        cls_targets = input$prop_target_classes,
        val_mode = input$prop_value_mode %||% "Absolute (%)",
        pos_mode = input$prop_position %||% "both",
        multiclass_mode = input$prop_multiclass_mode %||% "stacked"
      )
      req(res)
      res
    })

    # Raw Long Data Reactive for Differential Acyl Chain Expression
    diff_raw_chain_data <- reactive({
      req(shared_data$data_processed(), shared_data$all_metadata(), shared_data$annotationData())
      
      df_proc <- shared_data$data_processed()
      meta <- shared_data$all_metadata()
      anno <- shared_data$annotationData()
      req(df_proc, meta, anno, nrow(df_proc) > 0)
      
      grp_level <- input$diff_group_level %||% (input$prop_group_level %||% "Lipid Main Class")
      class_mode <- input$diff_class_mode %||% (input$prop_class_mode %||% "major")
      subclass_mod_types <- input$diff_subclass_mod_types %||% (input$prop_subclass_mod_types %||% c("standard", "mature", "plasmalogen", "ether", "dihydro"))
      cls_targets <- input$diff_target_classes %||% input$prop_target_classes
      
      res <- extract_filtered_raw_chain_data(
        df_proc = df_proc,
        meta = meta,
        anno = anno,
        grp_var = input$diff_cohort_var %||% input$prop_group_var,
        grp_level = grp_level,
        class_mode = class_mode,
        subclass_mod_types = subclass_mod_types,
        cls_targets = cls_targets,
        val_mode = input$prop_value_mode %||% "Absolute (%)",
        pos_mode = input$prop_position %||% "both",
        multiclass_mode = "stacked"
      )
      req(res)
      res
    })

    # Reset selection to NULL (all chains) when the underlying class/position context changes
    observeEvent(c(input$prop_group_level, input$prop_class_mode, input$prop_subclass_mod_types, input$prop_target_classes, input$prop_position,
                   input$diff_group_level, input$diff_class_mode, input$diff_subclass_mod_types, input$diff_target_classes), {
      if (!is.null(prop_selected_chains())) {
        prop_selected_chains(NULL)
      }
    }, ignoreInit = TRUE)

    # 2. Available Chains Information for Matrix Rendering
    available_prop_chains_info <- reactive({
      raw <- prop_raw_chain_data()
      req(raw, raw$df_long, nrow(raw$df_long) > 0)
      
      # Retain only chains with detected positive abundance in active samples
      active_chains <- raw$df_long %>%
        dplyr::group_by(AcylChain) %>%
        dplyr::summarise(Tot = sum(Intensity, na.rm = TRUE), .groups = "drop") %>%
        dplyr::filter(Tot > 0) %>%
        dplyr::pull(AcylChain)
      
      if (length(active_chains) == 0) {
        active_chains <- unique(raw$df_long$AcylChain)
      }
      
      all_chains <- sort(unique(as.character(active_chains)))
      all_chains <- all_chains[!is.na(all_chains) & nzchar(all_chains)]
      
      matches <- stringr::str_match(all_chains, "^(\\d{1,2}):(\\d{1,2})$")
      is_std <- !is.na(matches[, 1])
      
      std_chains <- all_chains[is_std]
      other_chains <- all_chains[!is_std]
      
      c_vals <- sort(unique(as.integer(matches[is_std, 2])))
      db_vals <- sort(unique(as.integer(matches[is_std, 3])))
      
      chain_colors <- generate_acyl_chain_colors(all_chains, custom_overrides = prop_color_map())
      
      list(
        all_chains = all_chains,
        std_chains = std_chains,
        other_chains = other_chains,
        c_vals = c_vals,
        db_vals = db_vals,
        chain_colors = chain_colors
      )
    })

    # Selection Matrix Observers
    observeEvent(input$btn_prop_matrix_all, {
      info <- available_prop_chains_info()
      req(info)
      prop_selected_chains(info$all_chains)
    })

    observeEvent(input$btn_prop_matrix_none, {
      prop_selected_chains(character(0))
    })

    observeEvent(input$btn_prop_matrix_sat, {
      info <- available_prop_chains_info()
      req(info)
      sat_chains <- grep(":0$", info$all_chains, value = TRUE)
      prop_selected_chains(sat_chains)
    })

    observeEvent(input$btn_prop_matrix_unsat, {
      info <- available_prop_chains_info()
      req(info)
      unsat_chains <- grep(":[1-9][0-9]*$", info$all_chains, value = TRUE)
      prop_selected_chains(unsat_chains)
    })

    observeEvent(input$prop_matrix_selected_chains, {
      new_sel <- as.character(input$prop_matrix_selected_chains %||% character(0))
      curr_sel <- prop_selected_chains()
      info <- tryCatch(available_prop_chains_info(), error = function(e) NULL)
      effective_curr <- if (is.null(curr_sel) && !is.null(info)) info$all_chains else (curr_sel %||% character(0))
      if (!identical(sort(effective_curr), sort(new_sel))) {
        prop_selected_chains(new_sel)
      }
    }, ignoreInit = TRUE, ignoreNULL = FALSE)

    # 3. Status Badge in Accordion Title
    output$prop_matrix_status_badge <- renderUI({
      info <- tryCatch(available_prop_chains_info(), error = function(e) NULL)
      if (is.null(info) || length(info$all_chains) == 0) return(NULL)
      
      total_n <- length(info$all_chains)
      sel <- prop_selected_chains()
      curr_n <- if (is.null(sel)) total_n else length(intersect(sel, info$all_chains))
      
      if (curr_n == total_n) {
        return(NULL)
      } else if (curr_n == 0) {
        span(class = "badge bg-danger-subtle text-danger border border-danger-subtle ms-2", 
             sprintf("None selected (0 / %d)", total_n))
      } else {
        span(class = "badge bg-primary-subtle text-primary border border-primary-subtle ms-2", 
             sprintf("Filtered: %d of %d configurations", curr_n, total_n))
      }
    })

    # 4. Render Selection Matrix UI
    output$prop_chain_matrix_ui <- renderUI({
      info <- tryCatch(available_prop_chains_info(), error = function(e) NULL)
      if (is.null(info) || length(info$all_chains) == 0) {
        return(div(class = "text-muted small p-2", "No acyl chain configurations available for current class selection."))
      }
      
      raw <- tryCatch(prop_raw_chain_data(), error = function(e) NULL)
      sel <- prop_selected_chains()
      std_set <- info$std_chains
      c_vals <- info$c_vals
      db_vals <- info$db_vals
      chain_colors <- info$chain_colors
      shiny_ns_id <- session$ns("prop_matrix_selected_chains")
      
      # Build column headers with count of available chains with that DB
      col_ths <- lapply(db_vals, function(db) {
        db_count <- sum(grepl(paste0(":", db, "$"), std_set))
        tags$th(
          class = "prop-matrix-col-btn",
          onclick = sprintf("window.propMatrixToggleCol(this, '%d');", db),
          title = sprintf("Click to toggle all :%d configurations (%d available)", db, db_count),
          tagList(
            paste0(":", db),
            tags$span(class = "prop-matrix-hdr-count", sprintf("(%d)", db_count))
          )
        )
      })
      
      # Build rows with count of available chains with that C
      rows_trs <- lapply(c_vals, function(c) {
        c_count <- sum(grepl(paste0("^", c, ":"), std_set))
        row_cells <- lapply(db_vals, function(db) {
          tok <- paste0(c, ":", db)
          if (tok %in% std_set) {
            is_checked <- if (is.null(sel)) TRUE else (tok %in% sel)
            col <- chain_colors[[tok]] %||% "#0284c7"
            cb_id <- session$ns(paste0("cb_chain_", c, "_", db))
            tags$td(
              class = "prop-matrix-cell",
              tags$label(
                class = "prop-matrix-cell-label",
                `for` = cb_id,
                tags$input(
                  type = "checkbox",
                  class = "prop-matrix-cb",
                  id = cb_id,
                  `data-chain` = tok,
                  `data-c` = as.character(c),
                  `data-db` = as.character(db),
                  checked = if (is_checked) "checked" else NULL,
                  onchange = "window.syncPropMatrixSelection(this.closest('.prop-matrix-container'));"
                ),
                tags$span(class = "prop-matrix-dot", style = sprintf("background-color: %s;", col)),
                tok
              )
            )
          } else {
            tags$td(class = "prop-matrix-empty", "—")
          }
        })
        
        tags$tr(
          tags$th(
            class = "prop-matrix-row-btn",
            onclick = sprintf("window.propMatrixToggleRow(this, '%d');", c),
            title = sprintf("Click to toggle all C%d configurations (%d available)", c, c_count),
            tagList(
              paste0("C", c),
              tags$span(class = "prop-matrix-hdr-count", sprintf("(%d)", c_count))
            )
          ),
          row_cells
        )
      })
      
      # Target class context banner
      raw_targets <- if (!is.null(raw)) raw$cls_targets else character(0)
      display_cls_name <- if (is.null(raw)) {
        "Selected Classes"
      } else if (raw$grp_level == "Lipid Category") {
        cats <- sapply(raw_targets, function(x) raw$CATEGORY_NAMES[[x]] %||% x)
        paste(cats, collapse = ", ")
      } else if (raw$class_mode %in% c("subclasses", "linkage")) {
        paste(raw_targets, collapse = ", ")
      } else {
        paste(raw_targets, collapse = ", ")
      }
      
      pos_mode_val <- if (!is.null(raw)) raw$pos_mode else "both"
      pos_label <- switch(pos_mode_val, 
                          "sn1" = "sn-1 only",
                          "sn2" = "sn-2 only",
                          "side_by_side" = "sn-1 & sn-2 (split)",
                          "Merged (sn-1 + sn-2)")

      context_banner <- div(
        class = "prop-matrix-context-bar d-flex align-items-center justify-content-between p-2 mb-2 bg-white border rounded shadow-sm flex-wrap gap-2",
        div(
          class = "d-flex align-items-center gap-2 flex-wrap",
          span(class = "badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 fw-bold",
               icon("layer-group", class = "me-1"), display_cls_name),
          span(class = "text-dark small fw-semibold",
               if (length(std_set) > 0) {
                 sprintf("%d configurations (%s | C%d–C%d, :%d to :%d)", 
                         length(info$all_chains),
                         if (length(info$other_chains) > 0) sprintf("%d std + %d other", length(std_set), length(info$other_chains)) else "all standard",
                         min(c_vals), max(c_vals), min(db_vals), max(db_vals))
               } else {
                 sprintf("%d configurations (non-standard)", length(info$all_chains))
               }
          )
        ),
        div(
          class = "d-flex align-items-center gap-2 ms-auto",
          span(class = "badge bg-light text-secondary border small",
               icon("arrows-left-right", class = "me-1"),
               paste("Position:", pos_label))
        )
      )
      
      # Table UI if c_vals and db_vals are non-empty
      table_ui <- if (length(c_vals) > 0 && length(db_vals) > 0) {
        div(
          class = "prop-matrix-table-wrapper",
          tags$table(
            class = "prop-matrix-table",
            tags$thead(
              tags$tr(
                tags$th(class = "prop-matrix-corner", "Carbons \\ DB"),
                col_ths
              )
            ),
            tags$tbody(
              rows_trs
            )
          )
        )
      } else NULL

      # Special / Unparsed chains container
      other_ui <- if (length(info$other_chains) > 0) {
        other_labels <- lapply(info$other_chains, function(tok) {
          is_checked <- if (is.null(sel)) TRUE else (tok %in% sel)
          col <- chain_colors[[tok]] %||% "#94a3b8"
          tags$label(
            class = "prop-matrix-cell-label me-3",
            tags$input(
              type = "checkbox",
              class = "prop-matrix-cb",
              `data-chain` = tok,
              checked = if (is_checked) "checked" else NULL,
              onchange = "window.syncPropMatrixSelection(this.closest('.prop-matrix-container'));"
            ),
            tags$span(class = "prop-matrix-dot", style = sprintf("background-color: %s;", col)),
            tok
          )
        })
        div(
          class = "prop-matrix-other-wrapper",
          tags$span(class = "fw-semibold text-secondary small me-2", icon("tag"), "Other / Unassigned:"),
          other_labels
        )
      } else NULL

      div(
        class = "prop-matrix-container",
        `data-shiny-id` = shiny_ns_id,
        context_banner,
        div(
          class = "prop-matrix-controls",
          actionButton(session$ns("btn_prop_matrix_all"), "Select All", icon = icon("check-double"), class = "btn-outline-primary btn-sm", onclick = "window.propMatrixSelectAll(this); return false;"),
          actionButton(session$ns("btn_prop_matrix_none"), "None", icon = icon("ban"), class = "btn-outline-secondary btn-sm", onclick = "window.propMatrixSelectNone(this); return false;"),
          actionButton(session$ns("btn_prop_matrix_sat"), "Saturated (:0)", icon = icon("filter"), class = "btn-outline-info btn-sm", onclick = "window.propMatrixSelectSaturated(this); return false;"),
          actionButton(session$ns("btn_prop_matrix_unsat"), "Unsaturated (:1+)", icon = icon("filter"), class = "btn-outline-info btn-sm", onclick = "window.propMatrixSelectUnsaturated(this); return false;"),
          div(
            class = "ms-auto d-flex align-items-center",
            checkboxInput(session$ns("prop_renormalize_subset"), 
                          tags$span("Re-scale selected to 100%", 
                                    bslib::tooltip(icon("circle-info", style = "margin-left: 4px; color: #6c757d; cursor: pointer;"), 
                                                   "Unchecked (default): displays each acyl chain's true composition % in the lipid class. Checked: re-scales the selected subset so they sum to 100%.")), 
                          value = FALSE)
          )
        ),
        table_ui,
        other_ui,
        div(
          class = "text-muted small mt-2 d-flex align-items-center gap-1",
          icon("circle-info", class = "text-secondary"),
          tags$span("Click any column header (:0, :1...) or row header (C16, C18...) to toggle entire groups. Click 'None' to deselect all and focus on specific configurations.")
        )
      )
    })

    # =========================================================================
    # 'OTHER' COMPONENT INSPECTOR & DEBUGGER ENGINE
    # =========================================================================

    prop_other_components_data <- reactive({
      raw <- prop_raw_chain_data()
      req(raw, raw$df_long, nrow(raw$df_long) > 0)
      df_long <- raw$df_long
      
      info <- tryCatch(available_prop_chains_info(), error = function(e) NULL)
      sel <- prop_selected_chains()
      
      # Determine standard & prominent candidates (default thresholding)
      standard_chains <- names(EXPERT_SPECIFIC_ACYL_COLORS)
      standard_chains <- standard_chains[standard_chains != "Other"]
      detected_standard <- intersect(unique(df_long$AcylChain), standard_chains)
      
      class_prominent <- df_long %>%
        dplyr::group_by(LipidClass, AcylChain) %>%
        dplyr::summarise(ClsTot = sum(Intensity, na.rm = TRUE), .groups = "drop_last") %>%
        dplyr::mutate(ClsProp = ClsTot / sum(ClsTot)) %>%
        dplyr::filter(ClsProp >= 0.005) %>%
        dplyr::pull(AcylChain) %>%
        unique()
      
      valid_candidates <- unique(c(detected_standard, class_prominent))
      valid_candidates <- valid_candidates[valid_candidates != "Other" & !is.na(valid_candidates)]
      valid_candidates <- valid_candidates[!grepl("^(3[5-9]|[4-9]\\d|\\d{3,}):", valid_candidates)]
      
      # Class totals for percentage calculations
      class_totals <- df_long %>%
        dplyr::group_by(LipidClass) %>%
        dplyr::summarise(Class_Total = sum(Intensity, na.rm = TRUE), .groups = "drop")
      
      # An item is in "Other" (or candidate for Other) if:
      # In default mode (sel is NULL): !AcylChain %in% valid_candidates
      # In custom mode (!is.null(sel)): !AcylChain %in% sel
      if (is.null(sel)) {
        other_rows <- df_long %>% dplyr::filter(!AcylChain %in% valid_candidates)
      } else {
        other_rows <- df_long %>% dplyr::filter(!AcylChain %in% sel)
      }
      
      if (nrow(other_rows) == 0) {
        return(data.frame(
          Lipid_Name = character(0),
          LipidClass = character(0),
          AcylChain = character(0),
          Position = character(0),
          Total_Intensity = numeric(0),
          Mean_Intensity = numeric(0),
          Class_Total = numeric(0),
          Pct_Of_Class = numeric(0),
          N_Samples = integer(0),
          Reason = character(0),
          stringsAsFactors = FALSE
        ))
      }
      
      other_summary <- other_rows %>%
        dplyr::group_by(Lipid_Name, LipidClass, AcylChain, Position) %>%
        dplyr::summarise(
          Total_Intensity = sum(Intensity, na.rm = TRUE),
          Mean_Intensity = mean(Intensity, na.rm = TRUE),
          N_Samples = dplyr::n_distinct(FullName[Intensity > 0]),
          .groups = "drop"
        ) %>%
        dplyr::left_join(class_totals, by = "LipidClass") %>%
        dplyr::mutate(
          Pct_Of_Class = dplyr::if_else(Class_Total > 0, (Total_Intensity / Class_Total) * 100, 0),
          Reason = dplyr::case_when(
            grepl("^(3[5-9]|[4-9]\\d|\\d{3,}):", AcylChain) ~ "Precursor / Sum Comp (>34 C)",
            !is.null(sel) && !AcylChain %in% sel ~ "Unselected in Matrix Filter",
            TRUE ~ "Trace Abundance (<0.5% Class Threshold)"
          )
        ) %>%
        dplyr::arrange(desc(Total_Intensity))
      
      other_summary
    })

    # Status Badge in Accordion Title
    output$prop_other_status_badge <- renderUI({
      df_other <- tryCatch(prop_other_components_data(), error = function(e) NULL)
      is_expanded <- isTRUE(input$prop_expand_other)
      
      if (is.null(df_other) || nrow(df_other) == 0) {
        return(span(class = "badge bg-success-subtle text-success border border-success-subtle ms-2", 
                    "0 in 'Other'"))
      }
      
      n_spec <- nrow(df_other)
      
      if (is_expanded) {
        span(class = "badge bg-info-subtle text-info-emphasis border border-info-subtle ms-2",
             sprintf("Expanded (%d displayed individually)", n_spec))
      } else {
        top_cls <- df_other %>% 
          dplyr::group_by(LipidClass) %>% 
          dplyr::summarise(TotPct = sum(Pct_Of_Class), .groups = "drop") %>%
          dplyr::arrange(desc(TotPct))
        
        main_cls_str <- if (nrow(top_cls) > 0) sprintf("%.1f%% of %s", top_cls$TotPct[1], top_cls$LipidClass[1]) else ""
        badge_text <- if (nzchar(main_cls_str)) sprintf("%d species (%s)", n_spec, main_cls_str) else sprintf("%d species in 'Other'", n_spec)
        
        span(class = "badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-2", 
             badge_text)
      }
    })

    # Summary Box in Accordion Body
    output$prop_other_summary_box <- renderUI({
      df_other <- tryCatch(prop_other_components_data(), error = function(e) NULL)
      is_expanded <- isTRUE(input$prop_expand_other)
      
      if (is.null(df_other) || nrow(df_other) == 0) {
        return(div(
          class = "alert alert-success py-2 px-3 mb-2 small d-flex align-items-center gap-2",
          icon("check-circle"),
          tags$span("No lipid species are currently categorized into 'Other'. All detected acyl chains are displayed.")
        ))
      }
      
      n_spec <- nrow(df_other)
      n_chains <- length(unique(df_other$AcylChain))
      
      cls_breakdown <- df_other %>%
        dplyr::group_by(LipidClass) %>%
        dplyr::summarise(
          N = dplyr::n(),
          Pct = sum(Pct_Of_Class),
          .groups = "drop"
        ) %>%
        dplyr::arrange(desc(Pct))
      
      cls_pills <- lapply(seq_len(nrow(cls_breakdown)), function(i) {
        tags$span(
          class = "badge bg-light text-dark border me-1 mb-1 font-monospace",
          sprintf("%s: %d species (%.2f%%)", cls_breakdown$LipidClass[i], cls_breakdown$N[i], cls_breakdown$Pct[i])
        )
      })
      
      if (is_expanded) {
        div(
          class = "alert alert-info py-2 px-3 mb-2 small d-flex align-items-center gap-2",
          icon("circle-info", class = "text-info fs-5"),
          tags$div(
            tags$strong("Expanded Mode Active: "),
            "All individual acyl chains are plotted individually with expert color assignments. 'Other' grouping is disabled."
          )
        )
      } else {
        div(
          class = "alert alert-warning py-2 px-3 mb-2 small",
          div(
            class = "d-flex align-items-center gap-2 mb-1",
            icon("triangle-exclamation", class = "text-warning fs-6"),
            tags$strong(sprintf("%d lipid species (%d acyl chain configurations) grouped in 'Other':", n_spec, n_chains))
          ),
          div(class = "d-flex flex-wrap mt-1", cls_pills)
        )
      }
    })

    # Quick View Table in Accordion Body
    output$prop_other_quick_table <- renderUI({
      df_other <- tryCatch(prop_other_components_data(), error = function(e) NULL)
      if (is.null(df_other) || nrow(df_other) == 0) {
        return(div(class = "text-muted small p-2", "No components in 'Other'."))
      }
      
      top_rows <- head(df_other, 12)
      
      trs <- lapply(seq_len(nrow(top_rows)), function(i) {
        r <- top_rows[i, ]
        tags$tr(
          tags$td(class = "py-1 px-2 font-monospace small fw-bold", r$Lipid_Name),
          tags$td(class = "py-1 px-2 small text-muted", r$LipidClass),
          tags$td(class = "py-1 px-2 font-monospace small text-primary", r$AcylChain),
          tags$td(class = "py-1 px-2 small text-end font-monospace", sprintf("%.2f%%", r$Pct_Of_Class)),
          tags$td(class = "py-1 px-2 small text-end text-muted font-monospace", scales::comma(round(r$Total_Intensity)))
        )
      })
      
      tagList(
        div(
          style = "max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px;",
          tags$table(
            class = "table table-sm table-striped table-hover mb-0",
            tags$thead(
              class = "table-light sticky-top",
              tags$tr(
                tags$th(class = "py-1 px-2 small", "Lipid"),
                tags$th(class = "py-1 px-2 small", "Class"),
                tags$th(class = "py-1 px-2 small", "Chain"),
                tags$th(class = "py-1 px-2 small text-end", "% Class"),
                tags$th(class = "py-1 px-2 small text-end", "Intensity")
              )
            ),
            tags$tbody(trs)
          )
        ),
        if (nrow(df_other) > 12) {
          tags$div(
            class = "text-muted small mt-1 text-center",
            sprintf("Showing top 12 of %d species. Click 'Inspect Full Table' for all.", nrow(df_other))
          )
        }
      )
    })

    # Full Modal Inspector
    observeEvent(input$prop_open_other_modal, {
      df_other <- tryCatch(prop_other_components_data(), error = function(e) NULL)
      all_classes <- if (!is.null(df_other) && nrow(df_other) > 0) sort(unique(df_other$LipidClass)) else character(0)
      
      showModal(modalDialog(
        title = tagList(
          icon("magnifying-glass-chart", class = "text-warning me-2"),
          tags$span(class = "fw-bold", "'Other' Component Inspector & Detailed Debugger")
        ),
        size = "xl",
        easyClose = TRUE,
        fade = TRUE,
        div(
          class = "p-1",
          div(
            class = "alert alert-light border py-2 px-3 mb-3 small d-flex align-items-center gap-2",
            icon("circle-info", class = "text-primary fs-5"),
            tags$span(
              "These lipid species are currently categorized into the ", tags$strong("'Other'"), 
              " slice in the Proportions plot because their individual acyl chain contribution is below the 0.5% class threshold or they are not selected in the matrix. Use this inspector to examine individual intensities, export the complete list, or add all chains directly to the selection matrix."
            )
          ),
          div(
            class = "d-flex align-items-center justify-content-between flex-wrap gap-3 mb-3 p-3 bg-light rounded-3 border",
            div(
              style = "min-width: 250px;",
              selectInput(
                ns("prop_other_modal_class_filter"),
                tags$span(class = "fw-bold small", "Filter by Lipid Class:"),
                choices = c("All Classes" = "all", all_classes),
                selected = "all",
                width = "100%"
              )
            ),
            div(
              class = "d-flex align-items-center gap-2 flex-wrap",
              actionButton(
                ns("prop_add_other_to_matrix_btn"),
                "Add All 'Other' Chains to Selection Matrix",
                icon = icon("plus-circle"),
                class = "btn btn-primary btn-sm"
              ),
              downloadButton(
                ns("prop_download_other_csv_modal"),
                "Export Complete CSV",
                class = "btn btn-outline-success btn-sm"
              )
            )
          ),
          DT::dataTableOutput(ns("prop_other_table_full"))
        ),
        footer = tagList(
          modalButton("Close")
        )
      ))
    })

    # Render Full Modal DataTable
    output$prop_other_table_full <- DT::renderDataTable({
      df_other <- tryCatch(prop_other_components_data(), error = function(e) NULL)
      req(df_other, nrow(df_other) > 0)
      
      cls_filter <- input$prop_other_modal_class_filter %||% "all"
      if (cls_filter != "all") {
        df_other <- df_other %>% dplyr::filter(LipidClass == cls_filter)
      }
      
      display_df <- df_other %>%
        dplyr::transmute(
          `Lipid Name` = Lipid_Name,
          `Lipid Class` = LipidClass,
          `Acyl Chain` = AcylChain,
          `Position` = Position,
          `Total Intensity` = round(Total_Intensity, 1),
          `Mean Intensity` = round(Mean_Intensity, 1),
          `% of Class` = round(Pct_Of_Class, 3),
          `Detected Samples` = N_Samples,
          `Grouping Reason` = Reason
        )
      
      DT::datatable(
        display_df,
        options = list(
          pageLength = 15,
          lengthMenu = c(10, 15, 25, 50, 100),
          order = list(list(6, "desc")), # Sort by % of Class descending (col 6)
          scrollX = TRUE,
          dom = '<"d-flex justify-content-between align-items-center mb-2"lf>rt<"d-flex justify-content-between align-items-center mt-2"ip>'
        ),
        rownames = FALSE,
        class = "table table-striped table-hover table-sm"
      ) %>%
        DT::formatCurrency("Total Intensity", currency = "", interval = 3, mark = ",", digits = 1) %>%
        DT::formatCurrency("Mean Intensity", currency = "", interval = 3, mark = ",", digits = 1) %>%
        DT::formatString("% of Class", suffix = "%")
    })

    # CSV Download Handlers
    prop_other_csv_download_fn <- function(file) {
      df_other <- tryCatch(prop_other_components_data(), error = function(e) NULL)
      req(df_other, nrow(df_other) > 0)
      
      out_df <- df_other %>%
        dplyr::select(
          Lipid_Name,
          LipidClass,
          AcylChain,
          Position,
          Total_Intensity,
          Mean_Intensity,
          Class_Total_Intensity = Class_Total,
          Pct_Of_Class,
          N_Samples_Detected = N_Samples,
          Grouping_Reason = Reason
        )
      
      readr::write_csv(out_df, file)
    }

    output$prop_download_other_csv <- downloadHandler(
      filename = function() {
        paste0("Lipidomic_Other_Components_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv")
      },
      content = prop_other_csv_download_fn
    )

    output$prop_download_other_csv_modal <- downloadHandler(
      filename = function() {
        paste0("Lipidomic_Other_Components_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv")
      },
      content = prop_other_csv_download_fn
    )

    # Add Other Chains to Matrix Handler
    add_other_to_matrix_handler <- function() {
      df_other <- tryCatch(prop_other_components_data(), error = function(e) NULL)
      req(df_other, nrow(df_other) > 0)
      info <- available_prop_chains_info()
      req(info)
      
      new_chains <- unique(as.character(df_other$AcylChain))
      curr_sel <- prop_selected_chains()
      
      if (is.null(curr_sel)) {
        standard_chains <- names(EXPERT_SPECIFIC_ACYL_COLORS)
        standard_chains <- standard_chains[standard_chains != "Other"]
        detected_standard <- intersect(info$all_chains, standard_chains)
        comb_sel <- unique(c(detected_standard, new_chains))
      } else {
        comb_sel <- unique(c(curr_sel, new_chains))
      }
      
      prop_selected_chains(comb_sel)
      
      showNotification(
        sprintf("Added %d acyl chain configurations from 'Other' into selection matrix.", length(new_chains)),
        type = "message",
        duration = 4
      )
    }

    observeEvent(input$prop_add_other_to_matrix_btn, {
      add_other_to_matrix_handler()
      removeModal()
    })

    observeEvent(input$prop_add_other_to_matrix_link, {
      add_other_to_matrix_handler()
    })

    # 5. Filtered Data Aggregation for Barplot & Stats
    buildPropPlotData <- reactive({
      raw <- prop_raw_chain_data()
      req(raw, raw$df_long, nrow(raw$df_long) > 0)
      
      df_long <- raw$df_long
      cls_targets <- raw$cls_targets
      grp_var <- raw$grp_var
      grp_display <- raw$grp_display
      grp_level <- raw$grp_level
      val_mode <- raw$val_mode
      class_mode <- raw$class_mode
      pos_mode <- raw$pos_mode
      multiclass_mode <- raw$multiclass_mode
      CATEGORY_NAMES <- raw$CATEGORY_NAMES
      
      info <- available_prop_chains_info()
      req(info)
      
      sel <- prop_selected_chains()
      
      # If user explicitly cleared all selections, return empty result
      if (!is.null(sel) && length(sel) == 0) {
        display_targets <- sapply(cls_targets, function(x) {
          if (x == "all_categories") "All Categories"
          else if (x %in% names(CATEGORY_NAMES)) CATEGORY_NAMES[[x]]
          else if (x == "all_pl_subclasses") "All Phospholipid Subclasses"
          else if (x == "all_subclasses") "All Subclasses"
          else if (x == "phospholipids") "All Phospholipids"
          else if (x == "all") "All Classes"
          else if (grepl("__", x)) {
            parts <- strsplit(x, "__")[[1]]
            paste0(parts[1], " (", parts[2], ")")
          } else x
        })
        return(list(
          data = data.frame(),
          total_data = NULL,
          ind_data = NULL,
          is_empty = TRUE,
          mode = "acyl",
          grp_level = grp_level,
          val_mode = val_mode,
          class_mode = class_mode,
          target_class = paste(display_targets, collapse = ", "),
          grp_var = grp_var,
          grp_label = grp_display,
          pos_mode = pos_mode,
          multiclass_mode = multiclass_mode,
          n_classes = length(unique(df_long$LipidClass))
        ))
      }
      
      if (isTRUE(input$prop_expand_other)) {
        # Display All Individually: do not group any species into "Other"
        if (is.null(sel)) {
          selected_set <- unique(df_long$AcylChain)
        } else {
          selected_set <- union(intersect(sel, info$all_chains), unique(df_long$AcylChain))
        }
      } else if (is.null(sel)) {
        # Default mode (all selected): prioritize known standard biological acyl chains
        standard_chains <- names(EXPERT_SPECIFIC_ACYL_COLORS)
        standard_chains <- standard_chains[standard_chains != "Other"]
        detected_standard <- intersect(unique(df_long$AcylChain), standard_chains)
        
        # Prominent chains within individual classes (>= 0.5% of class intensity) so low-abundance classes (ACar, LPA, GlcCer) are never crowded out
        class_prominent <- df_long %>%
          dplyr::group_by(LipidClass, AcylChain) %>%
          dplyr::summarise(ClsTot = sum(Intensity, na.rm = TRUE), .groups = "drop_last") %>%
          dplyr::mutate(ClsProp = ClsTot / sum(ClsTot)) %>%
          dplyr::filter(ClsProp >= 0.005) %>%
          dplyr::pull(AcylChain) %>%
          unique()
        
        valid_candidates <- unique(c(detected_standard, class_prominent))
        valid_candidates <- valid_candidates[valid_candidates != "Other" & !is.na(valid_candidates)]
        # Strictly filter out any multi-chain precursor or fragment sums (> 34 carbons)
        valid_candidates <- valid_candidates[!grepl("^(3[5-9]|[4-9]\\d|\\d{3,}):", valid_candidates)]
        
        df_long <- df_long %>% dplyr::mutate(AcylChain = if_else(AcylChain %in% valid_candidates, AcylChain, "Other"))
        selected_set <- unique(df_long$AcylChain)
      } else {
        # User customized selection: keep all explicitly selected configurations exactly as named
        selected_set <- intersect(sel, info$all_chains)
      }
      
      n_cls <- length(unique(df_long$LipidClass))
      is_stacked <- (multiclass_mode == "stacked" && n_cls > 1)
      
      if (is_stacked) {
        sample_grp_cols <- if (pos_mode == "side_by_side") c("FullName", "GroupingVal", "LipidClass", "Position", "AcylChain") else c("FullName", "GroupingVal", "LipidClass", "AcylChain")
        sample_norm_cols <- if (pos_mode == "side_by_side") c("FullName", "GroupingVal", "LipidClass", "Position") else c("FullName", "GroupingVal", "LipidClass")
        cohort_grp_cols <- if (pos_mode == "side_by_side") c("GroupingVal", "LipidClass", "Position", "AcylChain") else c("GroupingVal", "LipidClass", "AcylChain")
        cohort_norm_cols <- if (pos_mode == "side_by_side") c("GroupingVal", "LipidClass", "Position") else c("GroupingVal", "LipidClass")
      } else {
        sample_grp_cols <- if (pos_mode == "side_by_side") c("FullName", "GroupingVal", "Position", "AcylChain") else c("FullName", "GroupingVal", "AcylChain")
        sample_norm_cols <- if (pos_mode == "side_by_side") c("FullName", "GroupingVal", "Position") else c("FullName", "GroupingVal")
        cohort_grp_cols <- if (pos_mode == "side_by_side") c("GroupingVal", "Position", "AcylChain") else c("GroupingVal", "AcylChain")
        cohort_norm_cols <- if (pos_mode == "side_by_side") c("GroupingVal", "Position") else "GroupingVal"
      }
      
      # 1. Aggregate at Sample Level
      renormalize <- isTRUE(input$prop_renormalize_subset)
      
      if (renormalize) {
        # Subset first, then scale so selected chains sum to 100%
        df_sample_chain <- df_long %>%
          dplyr::filter(AcylChain %in% selected_set) %>%
          dplyr::group_by(across(all_of(sample_grp_cols))) %>%
          dplyr::summarise(Intensity = sum(Intensity, na.rm = TRUE), .groups = "drop")
        
        if (grepl("\\(\\%\\)$", val_mode)) {
          df_sample_chain <- df_sample_chain %>%
            dplyr::group_by(across(all_of(sample_norm_cols))) %>%
            dplyr::mutate(
              Total_Sample = sum(Intensity, na.rm = TRUE),
              Value = dplyr::if_else(Total_Sample > 0, Intensity / Total_Sample * 100, 0)
            ) %>%
            dplyr::ungroup()
        } else {
          df_sample_chain <- df_sample_chain %>%
            dplyr::mutate(Value = Intensity)
        }
      } else {
        # Preserve class composition %: calculate Total_Sample on all chains, then filter to selected
        df_sample_chain_all <- df_long %>%
          dplyr::group_by(across(all_of(sample_grp_cols))) %>%
          dplyr::summarise(Intensity = sum(Intensity, na.rm = TRUE), .groups = "drop")
        
        if (grepl("\\(\\%\\)$", val_mode)) {
          df_sample_chain_all <- df_sample_chain_all %>%
            dplyr::group_by(across(all_of(sample_norm_cols))) %>%
            dplyr::mutate(
              Total_Sample = sum(Intensity, na.rm = TRUE),
              Value = dplyr::if_else(Total_Sample > 0, Intensity / Total_Sample * 100, 0)
            ) %>%
            dplyr::ungroup()
        } else {
          df_sample_chain_all <- df_sample_chain_all %>%
            dplyr::mutate(Value = Intensity)
        }
        
        df_sample_chain <- df_sample_chain_all %>%
          dplyr::filter(AcylChain %in% selected_set)
      }
      
      # Compute Sample-Level Totals (for Total Bar Error)
      df_sample_total <- df_sample_chain %>%
        dplyr::group_by(across(all_of(sample_norm_cols))) %>%
        dplyr::summarise(
          Total_Intensity = sum(Intensity, na.rm = TRUE),
          Total_Value = sum(Value, na.rm = TRUE),
          .groups = "drop"
        )
      
      # Complete missing acyl chains with 0 for all replicate samples within each cohort
      # This ensures all replicates are represented (N >= 2) for true replicate dispersion
      nesting_cols <- intersect(sample_norm_cols, names(df_sample_chain))
      if (length(nesting_cols) > 0 && length(selected_set) > 0) {
        df_sample_chain <- df_sample_chain %>%
          tidyr::complete(
            tidyr::nesting(!!!rlang::syms(nesting_cols)),
            AcylChain = selected_set,
            fill = list(Value = 0, Intensity = 0)
          )
      }
      
      # 2. Aggregate across Replicates within GroupingVal
      df_grp <- df_sample_chain %>%
        dplyr::group_by(across(all_of(cohort_grp_cols))) %>%
        dplyr::summarise(
          Mean_Value = mean(Value, na.rm = TRUE),
          Mean_Abundance = mean(Intensity, na.rm = TRUE),
          SD_Value = stats::sd(Value, na.rm = TRUE),
          N = sum(!is.na(Value)),
          .groups = "drop"
        ) %>%
        dplyr::mutate(
          SEM_Value = dplyr::if_else(N > 1, SD_Value / sqrt(N), 0),
          SD_Value = dplyr::if_else(is.na(SD_Value), 0, SD_Value)
        )
      
      # Ensure Proportion column is always present (for tooltips and exports)
      if (grepl("\\(\\%\\)$", val_mode)) {
        df_grp$Proportion <- df_grp$Mean_Value
      } else {
        df_grp <- df_grp %>%
          dplyr::group_by(across(all_of(cohort_norm_cols))) %>%
          dplyr::mutate(
            tot_cohort = sum(Mean_Value, na.rm = TRUE),
            Proportion = ifelse(tot_cohort > 0, Mean_Value / tot_cohort * 100, 0)
          ) %>%
          dplyr::select(-tot_cohort) %>%
          dplyr::ungroup()
      }
      
      if (!("LipidClass" %in% names(df_grp))) {
        df_grp$LipidClass <- "All Selected"
      }
      
      unique_chains <- setdiff(unique(df_grp$AcylChain), "Other")
      chain_ord <- unique_chains[order(
        as.numeric(sapply(strsplit(unique_chains, ":"), `[`, 1)),
        as.numeric(sapply(strsplit(unique_chains, ":"), `[`, 2))
      )]
      if ("Other" %in% df_grp$AcylChain) chain_ord <- c(chain_ord, "Other")
      
      df_grp$AcylChain <- factor(df_grp$AcylChain, levels = chain_ord)
      
      # Total Bar Error statistics across replicates
      df_total <- df_sample_total %>%
        dplyr::group_by(across(all_of(cohort_norm_cols))) %>%
        dplyr::summarise(
          Mean_Total = mean(Total_Value, na.rm = TRUE),
          SD_Total = stats::sd(Total_Value, na.rm = TRUE),
          N_Total = sum(!is.na(Total_Value)),
          .groups = "drop"
        ) %>%
        dplyr::mutate(
          SEM_Total = dplyr::if_else(N_Total > 1, SD_Total / sqrt(N_Total), 0),
          SD_Total = dplyr::if_else(is.na(SD_Total), 0, SD_Total)
        )
      
      if (!("LipidClass" %in% names(df_total))) {
        df_total$LipidClass <- "All Selected"
      }
      
      # Individual Segment Error Bars: cumulative position along stacked bars
      df_ind_error <- df_grp %>%
        dplyr::group_by(across(all_of(cohort_norm_cols))) %>%
        dplyr::arrange(desc(AcylChain)) %>%
        dplyr::mutate(
          Cum_Value = cumsum(Mean_Value),
          Error_SD = SD_Value,
          Error_SEM = SEM_Value
        ) %>%
        dplyr::ungroup()
      
      display_targets <- sapply(cls_targets, function(x) {
        if (x == "all_categories") "All Categories"
        else if (x %in% names(CATEGORY_NAMES)) CATEGORY_NAMES[[x]]
        else if (x == "all_pl_subclasses") "All Phospholipid Subclasses"
        else if (x == "all_subclasses") "All Subclasses"
        else if (x == "phospholipids") "All Phospholipids"
        else if (x == "all") "All Classes"
        else if (grepl("__", x)) {
          parts <- strsplit(x, "__")[[1]]
          paste0(parts[1], " (", parts[2], ")")
        } else x
      })
      
      # Factor ordering for GroupingVal based on user level_prefs
      pref_grp <- isolate(level_prefs[[grp_var]])
      if (!is.null(pref_grp) && length(pref_grp) > 0) {
        existing_lvls <- unique(as.character(df_grp$GroupingVal))
        ord_lvls <- c(intersect(pref_grp, existing_lvls), setdiff(existing_lvls, pref_grp))
        df_grp$GroupingVal <- factor(df_grp$GroupingVal, levels = rev(ord_lvls))
        if ("GroupingVal" %in% names(df_total)) {
          df_total$GroupingVal <- factor(df_total$GroupingVal, levels = rev(ord_lvls))
        }
        if ("GroupingVal" %in% names(df_ind_error)) {
          df_ind_error$GroupingVal <- factor(df_ind_error$GroupingVal, levels = rev(ord_lvls))
        }
      }
      
      list(
        data = df_grp,
        total_data = df_total,
        ind_data = df_ind_error,
        is_empty = FALSE,
        mode = "acyl",
        grp_level = grp_level,
        val_mode = val_mode,
        class_mode = class_mode,
        target_class = paste(display_targets, collapse = ", "), 
        grp_var = grp_var,
        grp_label = grp_display,
        pos_mode = pos_mode,
        multiclass_mode = multiclass_mode,
        n_classes = n_cls
      )
    })

    safe_prop_col_id <- function(cat) {
      paste0("prop_col_", gsub("[^A-Za-z0-9]", "_", cat), "_", digest::digest(cat, algo = "crc32"))
    }

    output$prop_color_pickers_ui <- renderUI({
      res_info <- buildPropPlotData()
      if (is.null(res_info) || is.null(res_info$data) || isTRUE(res_info$is_empty) || nrow(res_info$data) == 0) {
        return(div(class = "text-muted small p-2", "No acyl chain configurations currently selected."))
      }
      df <- res_info$data
      cats <- sort(unique(as.character(df$AcylChain)))
      
      curr_map <- isolate(prop_color_map())
      base_map <- generate_acyl_chain_colors(cats, custom_overrides = curr_map)
      
      pickers <- lapply(cats, function(cat) {
        safe_id <- safe_prop_col_id(cat)
        init_c <- if (cat %in% names(curr_map) && !is.na(curr_map[[cat]]) && curr_map[[cat]] != "") {
          curr_map[[cat]]
        } else if (cat %in% names(base_map) && !is.na(base_map[[cat]]) && base_map[[cat]] != "") {
          base_map[[cat]]
        } else {
          "#757575"
        }
        div(style = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding: 4px 8px; background: rgba(0,0,0,0.02); border-radius: 4px;",
          tags$span(style = "font-weight: 500; font-size: 12px; margin-right: 8px;", cat),
          colourpicker::colourInput(session$ns(safe_id), label = NULL, value = init_c, showColour = "both", width = "100px")
        )
      })
      
      tagList(
        div(style = "max-height: 380px; overflow-y: auto; padding-right: 4px; margin-bottom: 8px;",
          do.call(tagList, pickers)
        ),
        actionButton(session$ns("btn_apply_prop_colors"), "Apply Color Changes", class = "btn-primary w-100 mb-1"),
        actionButton(session$ns("btn_reset_prop_colors"), "Reset to Default Colors", class = "btn-outline-secondary w-100 btn-sm")
      )
    })
    
    observeEvent(input$btn_apply_prop_colors, {
      res_info <- buildPropPlotData()
      req(res_info, res_info$data, !isTRUE(res_info$is_empty), nrow(res_info$data) > 0)
      df <- res_info$data
      cats <- sort(unique(as.character(df$AcylChain)))
      
      new_map <- character(0)
      for (cat in cats) {
        safe_id <- safe_prop_col_id(cat)
        val <- input[[safe_id]]
        if (!is.null(val) && val != "") new_map[cat] <- val
      }
      prop_color_map(new_map)
    })

    observeEvent(input$btn_reset_prop_colors, {
      prop_color_map(character(0))
    })

    observeEvent(c(input$prop_group_level, input$prop_class_mode, input$prop_subclass_mod_types, input$prop_target_classes, input$prop_multiclass_mode, input$prop_position), {
      prop_color_map(character(0))
    }, ignoreInit = TRUE)

    output$prop_error_bar_note <- renderUI({
      grp_var <- input$prop_group_var %||% "Group1"
      val_mode <- input$prop_value_mode %||% "Absolute (%)"
      err_type <- input$prop_error_bar_type %||% "individual"
      is_donut <- isTRUE(input$prop_enable_donut)
      is_pct <- grepl("[(][%][)]$", val_mode)
      
      if (is_donut) {
        div(
          class = "alert alert-info py-1 px-2 mb-0 small mt-1",
          style = "font-size: 11px; line-height: 1.3;",
          icon("circle-info", class = "me-1 text-info"),
          tags$b("Donut Plot Active: "), "Error bars are displayed in the Stacked Bar Chart view. Uncheck 'Display as Donut Plot' above to view error bars."
        )
      } else if (identical(grp_var, "FullName")) {
        div(
          class = "alert alert-warning py-2 px-2 mb-0 small mt-1",
          style = "font-size: 11px; line-height: 1.35; border-left: 3px solid #f59e0b;",
          div(
            class = "d-flex align-items-start gap-2",
            icon("triangle-exclamation", class = "text-warning mt-1 flex-shrink-0"),
            div(
              tags$b("Individual Sample Mode (N = 1):"),
              tags$br(),
              "Each bar represents a single sample replicate, so dispersion across replicates cannot be computed.",
              tags$div(
                class = "mt-2",
                actionButton(
                  session$ns("prop_switch_to_group_btn"),
                  "Switch to Cohort View (Group 1)",
                  icon = icon("layer-group"),
                  class = "btn-sm btn-outline-primary py-0 px-2 fw-semibold",
                  style = "font-size: 11px;"
                )
              )
            )
          )
        )
      } else if (is_pct && err_type == "total") {
        div(
          class = "alert alert-warning py-1 px-2 mb-0 small mt-1",
          style = "font-size: 11px; line-height: 1.3;",
          icon("triangle-exclamation", class = "me-1 text-warning"),
          tags$b("Note: "), "In percentage modes (100% sum), total bar sum is invariant across replicates (SD = 0). Switch to ",
          tags$b("Individual Segments"), " to display error bars per acyl chain, or switch Value Mode to 'Absolute (intensity)'."
        )
      } else {
        res_info <- tryCatch(buildPropPlotData(), error = function(e) NULL)
        n_max <- if (!is.null(res_info$data) && nrow(res_info$data) > 0 && "N" %in% names(res_info$data)) {
          max(res_info$data$N, na.rm = TRUE)
        } else 0
        
        if (n_max <= 1) {
          div(
            class = "alert alert-secondary py-1 px-2 mb-0 small mt-1",
            style = "font-size: 11px; line-height: 1.3;",
            icon("circle-exclamation", class = "me-1 text-secondary"),
            tags$b("Single Replicate Group (N = 1): "),
            "Selected group contains only 1 sample per condition. Error bars require at least 2 replicates (N >= 2)."
          )
        } else {
          tags$div(
            class = "text-muted small py-1",
            style = "font-size: 11px;",
            icon("circle-check", class = "me-1 text-success"),
            sprintf("Error bars calculated across replicates (N = %d) in the selected Y-axis group.", as.integer(n_max))
          )
        }
      }
    })

    observeEvent(input$prop_switch_to_group_btn, {
      meta <- shared_data$all_metadata()
      req(meta)
      cohort_cols <- c("Group1")
      if ("Group2" %in% names(meta)) {
        g2_clean <- meta$Group2[!is.na(meta$Group2) & nzchar(meta$Group2) & meta$Group2 != "Unspecified"]
        if (length(unique(g2_clean)) > 0) cohort_cols <- c(cohort_cols, "Group2", "Group1_Group2")
      }
      target_grp <- determine_default_grouping_metadata(meta, cohort_cols)
      sel_grp <- if (length(target_grp) > 0 && target_grp[1] %in% names(meta)) target_grp[1] else "Group1"
      updateSelectInput(session, "prop_group_var", selected = sel_grp)
    })

    observeEvent(input$prop_show_error_bars, {
      if (isTRUE(input$prop_show_error_bars) && identical(input$prop_group_var, "FullName")) {
        meta <- shared_data$all_metadata()
        if (!is.null(meta)) {
          cohort_cols <- c("Group1")
          if ("Group2" %in% names(meta)) {
            g2_clean <- meta$Group2[!is.na(meta$Group2) & nzchar(meta$Group2) & meta$Group2 != "Unspecified"]
            if (length(unique(g2_clean)) > 0) cohort_cols <- c(cohort_cols, "Group2", "Group1_Group2")
          }
          target_grp <- determine_default_grouping_metadata(meta, cohort_cols)
          sel_grp <- if (length(target_grp) > 0 && target_grp[1] %in% names(meta)) target_grp[1] else if ("Group1" %in% names(meta)) "Group1" else NULL
          if (!is.null(sel_grp)) {
            updateSelectInput(session, "prop_group_var", selected = sel_grp)
            showNotification(
              sprintf("Switched 'Group By (Y-Axis)' to '%s' to compute replicate error bars (N >= 2).", sel_grp),
              type = "message",
              duration = 4
            )
          }
        }
      }
    })


    propPlotReactive <- reactive({
      res_info <- buildPropPlotData()
      req(res_info)
      
      if (isTRUE(res_info$is_empty) || is.null(res_info$data) || nrow(res_info$data) == 0) {
        return(
          ggplot() +
            annotate("text", x = 0.5, y = 0.5, 
                     label = "No acyl chain configurations selected.\nPlease select one or more configurations in the Acyl Chain Filter Matrix below.",
                     size = 4.8, color = "#64748b", fontface = "bold", hjust = 0.5) +
            theme_void()
        )
      }
      
      df_plot <- res_info$data
      val_mode <- res_info$val_mode %||% (input$prop_value_mode %||% "Absolute (%)")
      pos_mode <- res_info$pos_mode %||% "both"
      multiclass_mode <- res_info$multiclass_mode %||% "merged"
      class_mode <- res_info$class_mode %||% "major"
      grp_level <- res_info$grp_level %||% "Lipid Main Class"
      n_classes <- res_info$n_classes %||% 1
      is_stacked <- (multiclass_mode == "stacked" && n_classes > 1)
      
      show_error <- isTRUE(input$prop_show_error_bars)
      error_type <- input$prop_error_bar_type %||% "individual"
      error_style <- input$prop_error_bar_style %||% "half"
      error_color <- input$prop_error_bar_color %||% "black"
      error_stats <- input$prop_error_bar_stats %||% "sem"
      
      is_pct <- grepl("\\(\\%\\)$", val_mode)
      
      x_label <- switch(val_mode,
        "Absolute (intensity)"   = "Mean Linear Abundance Intensity",
        "Absolute (%)"           = if (is_stacked) sprintf("Acyl chain composition (percentage of individual %s total)", if (grp_level == "Lipid Category") "lipid category" else "main class") else "Phospholipid alkyl/acyl composition (percentage of total)",
        "Normalized (intensity)" = "Mean Standardized / Normalized Intensity (per-lipid standardized across samples)",
        "Normalized (%)"         = if (is_stacked) sprintf("Normalized acyl chain composition (percentage of individual %s total)", if (grp_level == "Lipid Category") "lipid category" else "main class") else "Normalized phospholipid alkyl/acyl composition (percentage of total)",
        "Proportion (%)"
      )
      
      all_cats <- unique(c(levels(df_plot$AcylChain), as.character(df_plot$AcylChain)))
      all_cats <- all_cats[!is.na(all_cats) & nzchar(all_cats)]
      custom_overrides <- prop_color_map()
      custom_pal <- generate_acyl_chain_colors(all_cats, custom_overrides = custom_overrides)
      
      is_donut <- isTRUE(input$prop_enable_donut)
      
      if (isTRUE(is_donut)) {
        # Align donut ring dimensions exactly with Composition tab buildDonutPlot (xmin=2, xmax=3, xlim=0.5 to 3.5)
        r_in <- 2.0
        r_out <- 3.0
        r_mid <- 2.5
        
        # Facet grouping columns
        facet_cols <- c("GroupingVal")
        if (is_stacked && "LipidClass" %in% names(df_plot)) {
          facet_cols <- c(facet_cols, "LipidClass")
        }
        if (pos_mode == "side_by_side" && "Position" %in% names(df_plot)) {
          facet_cols <- c(facet_cols, "Position")
        }
        
        df_donut <- df_plot %>%
          dplyr::group_by(dplyr::across(dplyr::all_of(facet_cols))) %>%
          dplyr::arrange(dplyr::desc(AcylChain)) %>%
          dplyr::mutate(
            SliceVal = Proportion,
            TotalVal = sum(SliceVal, na.rm = TRUE),
            Pct = dplyr::if_else(TotalVal > 0, SliceVal / TotalVal * 100, 0),
            ymax = cumsum(Pct / 100),
            ymin = c(0, head(ymax, n = -1)),
            y_mid = (ymax + ymin) / 2,
            xmin = r_in,
            xmax = r_out
          ) %>%
          dplyr::ungroup()
        
        p_title <- sprintf("Acyl Chain Composition Donut Plot (%s)", val_mode)
        
        p <- ggplot(df_donut) +
          geom_rect(
            aes(ymin = ymin, ymax = ymax, xmin = xmin, xmax = xmax, fill = AcylChain),
            color = "white",
            linewidth = 0.5
          ) +
          coord_polar(theta = "y", start = 0) +
          xlim(c(0.5, 3.5)) +
          theme_void(base_size = input$textSize %||% 12) +
          labs(fill = "Acyl Chain", title = p_title) +
          theme(
            aspect.ratio = 1,
            legend.position = "top",
            legend.title = element_text(face = "bold"),
            strip.text = element_text(face = "bold", size = (input$textSize %||% 12) * 0.95, color = "#1e293b", margin = margin(t = 4, b = 6)),
            strip.background = element_rect(fill = "#f1f5f9", color = "#cbd5e1", linewidth = 0.8),
            plot.title = element_text(face = "bold", hjust = 0.5, size = (input$textSize %||% 12) * 1.05, margin = margin(b = 10)),
            plot.margin = margin(10, 10, 10, 10)
          )
        
        # Overlay stats labels if checked, aligned with Composition tab (buildDonutPlot)
        if (isTRUE(input$prop_show_donut_stats)) {
          label_df <- df_donut %>% dplyr::filter(Pct >= 1.0)
          if (nrow(label_df) == 0 && nrow(df_donut) > 0) {
            label_df <- df_donut %>% dplyr::slice_max(order_by = Pct, n = 5)
          }
          if (nrow(label_df) > 0) {
            p <- p + ggrepel::geom_label_repel(
              data = label_df,
              aes(x = 2.5, y = y_mid, label = sprintf("%.1f%%", Pct), fill = AcylChain),
              color = "black",
              fontface = "bold",
              size = max(2.8, (input$textSize %||% 12) * 0.28),
              show.legend = FALSE,
              family = "sans",
              nudge_x = 0.8,
              segment.color = "grey30",
              segment.size = 0.4,
              max.overlaps = Inf
            )
          }
        }
        
        # Faceting: exactly 1 donut plot per stacked bar
        n_grps <- length(unique(df_donut$GroupingVal))
        if (is_stacked) {
          if (pos_mode == "side_by_side") {
            if (n_grps == 1) {
              p <- p + facet_grid(LipidClass ~ Position)
            } else {
              p <- p + facet_grid(LipidClass ~ GroupingVal + Position)
            }
          } else {
            p <- p + facet_grid(LipidClass ~ GroupingVal)
          }
        } else {
          if (pos_mode == "side_by_side") {
            if (n_grps > 1) {
              p <- p + facet_grid(GroupingVal ~ Position)
            } else {
              p <- p + facet_wrap(~ Position, ncol = 2)
            }
          } else {
            p <- p + facet_wrap(~ GroupingVal, ncol = min(4, max(1, n_grps)))
          }
        }
        
        if (length(custom_pal) > 0) {
          p <- p + scale_fill_manual(values = custom_pal, drop = FALSE)
        } else {
          p <- p + scale_fill_manual(values = EXPERT_SPECIFIC_ACYL_COLORS, drop = FALSE)
        }
        
        return(p)
      }
      
      p <- ggplot(df_plot, aes(y = GroupingVal, x = Mean_Value, fill = AcylChain)) +
        geom_bar(
          stat = "identity", 
          position = "stack",
          color = "white",
          linewidth = 0.3
        ) +
        theme_pubr(base_size = input$textSize %||% 12) +
        labs(x = x_label, y = NULL, fill = "Acyl Chain") +
        theme(
          legend.position = "top",
          axis.text.y = element_text(face = "bold"),
          legend.title = element_text(face = "bold")
        )
      
      if (is_pct) {
        p <- p + scale_x_continuous(labels = function(x) paste0(x, "%"), expand = expansion(mult = c(0, 0.05)))
      } else {
        p <- p + scale_x_continuous(labels = scales::comma_format(), expand = expansion(mult = c(0, 0.08)))
      }
      
      # Add Error Bars if requested
      if (isTRUE(show_error)) {
        if (error_type == "total" && !is.null(res_info$total_data)) {
          df_tot <- res_info$total_data
          df_tot$Err <- if (error_stats == "sd") df_tot$SD_Total else df_tot$SEM_Total
          df_tot_valid <- df_tot %>% dplyr::filter(!is.na(N_Total), N_Total > 1, !is.na(Err), Err > 0)
          if (nrow(df_tot_valid) > 0) {
            tot_bar_col <- if (error_color == "color") "#2563eb" else "#0f172a"
            if (error_style == "half") {
              p <- p +
                geom_segment(
                  data = df_tot_valid,
                  aes(y = GroupingVal, yend = GroupingVal, x = Mean_Total, xend = Mean_Total + Err),
                  inherit.aes = FALSE,
                  linewidth = 0.7,
                  color = tot_bar_col
                ) +
                geom_errorbar(
                  data = df_tot_valid,
                  aes(y = GroupingVal, xmin = Mean_Total + Err, xmax = Mean_Total + Err),
                  inherit.aes = FALSE,
                  width = 0.3,
                  linewidth = 0.7,
                  color = tot_bar_col
                )
            } else {
              p <- p + geom_errorbar(
                data = df_tot_valid,
                aes(y = GroupingVal, xmin = pmax(0, Mean_Total - Err), xmax = Mean_Total + Err),
                inherit.aes = FALSE,
                width = 0.3,
                color = tot_bar_col,
                linewidth = 0.65
              )
            }
          }
        } else if (error_type == "individual" && !is.null(res_info$ind_data)) {
          df_ind <- res_info$ind_data
          df_ind$Err <- if (error_stats == "sd") df_ind$Error_SD else df_ind$Error_SEM
          df_ind_valid <- df_ind %>% dplyr::filter(!is.na(N), N > 1, !is.na(Err), Err > 0, !is.na(Mean_Value), Mean_Value > 0.001)
          if (nrow(df_ind_valid) > 0) {
            if (error_style == "half") {
              if (error_color == "color") {
                p <- p +
                  geom_segment(
                    data = df_ind_valid,
                    aes(y = GroupingVal, yend = GroupingVal, x = Cum_Value, xend = Cum_Value + Err, color = AcylChain),
                    inherit.aes = FALSE,
                    linewidth = 0.65
                  ) +
                  geom_errorbar(
                    data = df_ind_valid,
                    aes(y = GroupingVal, xmin = Cum_Value + Err, xmax = Cum_Value + Err, color = AcylChain),
                    inherit.aes = FALSE,
                    width = 0.22,
                    linewidth = 0.65
                  )
              } else {
                p <- p +
                  geom_segment(
                    data = df_ind_valid,
                    aes(y = GroupingVal, yend = GroupingVal, x = Cum_Value, xend = Cum_Value + Err),
                    inherit.aes = FALSE,
                    linewidth = 0.65,
                    color = "#0f172a"
                  ) +
                  geom_errorbar(
                    data = df_ind_valid,
                    aes(y = GroupingVal, xmin = Cum_Value + Err, xmax = Cum_Value + Err),
                    inherit.aes = FALSE,
                    width = 0.22,
                    linewidth = 0.65,
                    color = "#0f172a"
                  )
              }
            } else {
              # Full Bar (Two-Sided)
              if (error_color == "color") {
                p <- p + geom_errorbar(
                  data = df_ind_valid,
                  aes(y = GroupingVal, xmin = pmax(0, Cum_Value - Err), xmax = Cum_Value + Err, color = AcylChain),
                  inherit.aes = FALSE,
                  width = 0.22,
                  linewidth = 0.6
                )
              } else {
                p <- p + geom_errorbar(
                  data = df_ind_valid,
                  aes(y = GroupingVal, xmin = pmax(0, Cum_Value - Err), xmax = Cum_Value + Err),
                  inherit.aes = FALSE,
                  width = 0.22,
                  linewidth = 0.6,
                  color = "#0f172a"
                )
              }
            }
          }
        }
      }
      
      if (is_stacked) {
        if (pos_mode == "side_by_side") {
          p <- p + facet_grid(LipidClass ~ Position, scales = "free_y")
        } else {
          p <- p + facet_wrap(~ LipidClass, ncol = 1, scales = "free_y")
        }
        p <- p + theme(
          strip.background = element_rect(fill = "#f1f5f9", color = "#cbd5e1", linewidth = 0.8),
          strip.text = element_text(face = "bold", size = (input$textSize %||% 12) * 0.95, color = "#1e293b")
        )
      } else {
        if (pos_mode == "side_by_side") {
          p <- p + facet_wrap(~ Position, ncol = 2) +
            theme(
              strip.background = element_rect(fill = "#f1f5f9", color = "#cbd5e1", linewidth = 0.8),
              strip.text = element_text(face = "bold", size = (input$textSize %||% 12) * 0.95, color = "#1e293b")
            )
        }
      }
      
      pal_to_use <- if (length(custom_pal) > 0) custom_pal else EXPERT_SPECIFIC_ACYL_COLORS
      p <- p + scale_fill_manual(values = pal_to_use, drop = FALSE)
      if (isTRUE(show_error) && error_color == "color" && error_type == "individual") {
        p <- p + scale_color_manual(values = pal_to_use, guide = "none", drop = FALSE)
      }
      
      p
    })

    debounced_prop_container_size <- debounce(reactive(input$prop_plot_container_size), 250)

    get_prop_plot_height <- function() {
      res_info <- tryCatch(buildPropPlotData(), error = function(e) NULL)
      is_donut <- isTRUE(input$prop_enable_donut)
      is_stacked <- (!is.null(res_info) && res_info$multiclass_mode == "stacked" && (res_info$n_classes %||% 1) > 1)
      n_classes <- if (is_stacked) (res_info$n_classes %||% 1) else 1
      
      base_h <- if (is_donut) {
        pos_mode <- res_info$pos_mode %||% "both"
        n_grps <- if (!is.null(res_info$data)) length(unique(res_info$data$GroupingVal)) else 1
        n_rows <- if (is_stacked) {
          if (pos_mode == "side_by_side" && n_grps > 1) n_classes * n_grps else n_classes
        } else {
          if (pos_mode == "side_by_side" && n_grps > 1) n_grps else ceiling(n_grps / 3)
        }
        max(360, min(1800, 260 * max(1, n_rows)))
      } else if (is_stacked) {
        max(450, 240 * n_classes)
      } else {
        400
      }
      
      container_size <- debounced_prop_container_size()
      if (!is.null(container_size) && !is.null(container_size$height) && is.numeric(container_size$height) && container_size$height > 200) {
        available_h <- max(200, container_size$height - 16)
        return(max(base_h, available_h))
      }
      base_h
    }

    output$propPlotPlot <- renderPlot({
      propPlotReactive()
    }, height = get_prop_plot_height)

    propPlotBuilt <- reactive({
      p <- propPlotReactive()
      req(p)
      tryCatch(ggplot2::ggplot_build(p), error = function(e) NULL)
    })

    output$propPlot_tooltip <- renderUI({
      hover <- input$propPlot_hover
      if (is.null(hover) || is.null(hover$x) || is.null(hover$y)) return(NULL)
      
      val_mode <- input$prop_value_mode %||% "Absolute (%)"
      is_donut <- isTRUE(input$prop_enable_donut)
      if (is_donut) return(NULL)
      
      b <- propPlotBuilt()
      if (is.null(b) || length(b$data) == 0) return(NULL)
      
      res_info <- tryCatch(buildPropPlotData(), error = function(e) NULL)
      if (is.null(res_info) || is.null(res_info$data) || isTRUE(res_info$is_empty) || nrow(res_info$data) == 0) return(NULL)
      
      df_plot <- res_info$data
      d <- b$data[[1]]
      layout_df <- b$layout$layout
      
      # 1. Resolve active panel robustly across all facet configurations
      target_panel <- 1
      matched_panel <- FALSE
      
      # Strategy A: Use hover$mapping if supplied by Shiny
      if (!is.null(hover$mapping)) {
        cond <- rep(TRUE, nrow(layout_df))
        has_map <- FALSE
        if (!is.null(hover$mapping$panelvar1) && hover$mapping$panelvar1 %in% names(layout_df) && !is.null(hover$panelvar1)) {
          cond <- cond & (as.character(layout_df[[hover$mapping$panelvar1]]) == as.character(hover$panelvar1))
          has_map <- TRUE
        }
        if (!is.null(hover$mapping$panelvar2) && hover$mapping$panelvar2 %in% names(layout_df) && !is.null(hover$panelvar2)) {
          cond <- cond & (as.character(layout_df[[hover$mapping$panelvar2]]) == as.character(hover$panelvar2))
          has_map <- TRUE
        }
        if (has_map) {
          idx <- which(cond)
          if (length(idx) > 0) {
            target_panel <- layout_df$PANEL[idx[1]]
            matched_panel <- TRUE
          }
        }
      }
      
      # Strategy B: Dynamic permutation search across all layout_df facet columns
      if (!matched_panel && !is.null(hover$panelvar1)) {
        facet_cols <- setdiff(names(layout_df), c("PANEL", "ROW", "COL", "SCALE_X", "SCALE_Y", "COORD"))
        if (length(facet_cols) == 1) {
          idx <- which(as.character(layout_df[[facet_cols[1]]]) == as.character(hover$panelvar1))
          if (length(idx) > 0) {
            target_panel <- layout_df$PANEL[idx[1]]
            matched_panel <- TRUE
          }
        } else if (length(facet_cols) >= 2) {
          # Try both permutations of panelvar1 and panelvar2
          p1 <- which(as.character(layout_df[[facet_cols[1]]]) == as.character(hover$panelvar1) &
                      as.character(layout_df[[facet_cols[2]]]) == as.character(hover$panelvar2))
          p2 <- which(as.character(layout_df[[facet_cols[2]]]) == as.character(hover$panelvar1) &
                      as.character(layout_df[[facet_cols[1]]]) == as.character(hover$panelvar2))
          idx <- if (length(p1) > 0) p1 else p2
          if (length(idx) > 0) {
            target_panel <- layout_df$PANEL[idx[1]]
            matched_panel <- TRUE
          }
        }
      }
      
      # 2. Filter segment data to active panel and exclude 0-width zero-intensity stacked segments
      d_sub <- d[d$PANEL == target_panel, ]
      if (nrow(d_sub) == 0) return(NULL)
      d_sub <- d_sub[abs(d_sub$xmax - d_sub$xmin) > 0.0001, ]
      if (nrow(d_sub) == 0) return(NULL)
      
      # 3. Locate segment under cursor
      hit <- d_sub[hover$x >= (d_sub$xmin - 0.001) & hover$x <= (d_sub$xmax + 0.001) &
                   hover$y >= (d_sub$ymin - 0.001) & hover$y <= (d_sub$ymax + 0.001), ]
      if (nrow(hit) == 0) return(NULL)
      hit_row <- hit[1, ]
      
      # 4. Resolve Y-axis GroupingVal label
      scale_y_idx <- if ("SCALE_Y" %in% names(layout_df)) {
        layout_df$SCALE_Y[layout_df$PANEL == target_panel][1]
      } else {
        1
      }
      y_scales <- b$layout$panel_scales_y
      y_labels <- if (!is.null(y_scales) && length(y_scales) >= scale_y_idx) {
        lbls <- tryCatch(y_scales[[scale_y_idx]]$get_labels(), error = function(e) NULL)
        if (is.null(lbls) || !is.character(lbls) || length(lbls) == 0) {
          lbls <- y_scales[[scale_y_idx]]$range$range
        }
        lbls
      } else {
        NULL
      }
      y_idx <- round(hit_row$y)
      hit_grp <- if (!is.null(y_labels) && y_idx >= 1 && y_idx <= length(y_labels)) {
        y_labels[y_idx]
      } else {
        levels(df_plot$GroupingVal)[y_idx]
      }
      
      # 5. Resolve Acyl Chain name (primary: levels of AcylChain via group index; secondary: color mapping)
      chain_levels <- levels(df_plot$AcylChain)
      hit_chain <- if (!is.null(chain_levels) && !is.null(hit_row$group) && hit_row$group >= 1 && hit_row$group <= length(chain_levels)) {
        chain_levels[hit_row$group]
      } else {
        all_cats <- unique(c(chain_levels, as.character(df_plot$AcylChain)))
        all_cats <- all_cats[!is.na(all_cats) & nzchar(all_cats)]
        custom_pal <- generate_acyl_chain_colors(all_cats, custom_overrides = prop_color_map())
        color_to_chain <- stats::setNames(names(custom_pal), tolower(unname(custom_pal)))
        hit_fill <- tolower(trimws(hit_row$fill))
        color_to_chain[hit_fill] %||% "Acyl Chain"
      }
      
      # 6. Retrieve exact proportion and abundance from df_plot using active panel context
      pos_val <- if ("Position" %in% names(layout_df)) as.character(layout_df$Position[layout_df$PANEL == target_panel][1]) else NULL
      cls_val <- if ("LipidClass" %in% names(layout_df)) as.character(layout_df$LipidClass[layout_df$PANEL == target_panel][1]) else NULL
      
      match_filter <- (as.character(df_plot$GroupingVal) == as.character(hit_grp)) & 
                      (as.character(df_plot$AcylChain) == as.character(hit_chain))
      if (!is.null(pos_val) && !is.na(pos_val) && nzchar(pos_val) && "Position" %in% names(df_plot)) {
        match_filter <- match_filter & (as.character(df_plot$Position) == pos_val)
      }
      if (!is.null(cls_val) && !is.na(cls_val) && nzchar(cls_val) && "LipidClass" %in% names(df_plot)) {
        match_filter <- match_filter & (as.character(df_plot$LipidClass) == cls_val)
      }
      
      val_mode <- input$prop_value_mode %||% "Absolute (%)"
      is_pct <- grepl("\\(\\%\\)$", val_mode)
      bar_segment_width <- abs(hit_row$xmax - hit_row$xmin)
      
      matched_records <- df_plot[match_filter, ]
      prop_val <- if (nrow(matched_records) > 0) matched_records$Proportion[1] else bar_segment_width
      abund_val <- if (nrow(matched_records) > 0) matched_records$Mean_Abundance[1] else NA
      mean_val <- if (nrow(matched_records) > 0) matched_records$Mean_Value[1] else bar_segment_width
      err_val <- if (nrow(matched_records) > 0 && isTRUE(input$prop_show_error_bars)) {
        if (identical(input$prop_error_bar_stats, "sd")) matched_records$SD_Value[1] else matched_records$SEM_Value[1]
      } else NA
      
      if (is.null(cls_val) && nrow(matched_records) > 0 && "LipidClass" %in% names(matched_records)) {
        cls_val <- as.character(matched_records$LipidClass[1])
      }
      if (is.null(pos_val) && nrow(matched_records) > 0 && "Position" %in% names(matched_records)) {
        pos_val <- as.character(matched_records$Position[1])
      }
      
      # 7. Calculate non-overflowing positioning relative to container
      is_right_half <- (!is.null(hover$coords_css$x) && hover$coords_css$x > 540)
      is_bottom_third <- (!is.null(hover$range$bottom) && !is.null(hover$coords_css$y) && hover$coords_css$y > (hover$range$bottom - 110))
      is_top_strip <- (!is.null(hover$coords_css$y) && hover$coords_css$y < 75)
      
      x_trans <- if (is_right_half) "calc(-100% - 14px)" else "14px"
      y_trans <- if (is_top_strip) "10px" else if (is_bottom_third) "calc(-100% - 10px)" else "-50%"
      
      tooltip_style <- sprintf(
        "position: absolute; left: %dpx; top: %dpx; transform: translate(%s, %s);",
        as.integer(hover$coords_css$x), as.integer(hover$coords_css$y), x_trans, y_trans
      )
      
      # 8. Render polished floating legend card
      div(
        class = "prop-hover-tooltip",
        style = tooltip_style,
        div(
          class = "prop-tooltip-header",
          div(
            class = "prop-tooltip-swatch",
            style = sprintf("background-color: %s;", hit_row$fill)
          ),
          div(
            class = "prop-tooltip-title",
            hit_chain
          ),
          if (!is.null(pos_val) && !is.na(pos_val) && nzchar(pos_val) && pos_val != "Both") {
            span(class = "prop-tooltip-badge", pos_val)
          },
          if (!is.null(cls_val) && !is.na(cls_val) && nzchar(cls_val) && cls_val != "All Selected") {
            span(class = "prop-tooltip-badge ms-1", cls_val)
          }
        ),
        div(
          class = "prop-tooltip-stat",
          if (is_pct) {
            sprintf("%.1f%%%s", prop_val, 
                    if (!is.na(err_val) && err_val > 0) sprintf(" (±%.1f%% %s)", err_val, toupper(input$prop_error_bar_stats %||% "sem")) else "")
          } else {
            sprintf("%s%s", format(round(mean_val, 1), big.mark = ",", scientific = FALSE),
                    if (!is.na(err_val) && err_val > 0) sprintf(" (±%s %s)", format(round(err_val, 1), big.mark = ","), toupper(input$prop_error_bar_stats %||% "sem")) else "")
          },
          span(style = "font-size: 11px; font-weight: 500; color: #94a3b8; margin-left: 4px;", 
               if (is_pct) "relative composition" else "mean abundance")
        ),
        div(
          class = "prop-tooltip-detail",
          span("Sample / Group:"),
          tags$b(as.character(hit_grp))
        ),
        if (hit_chain == "Other") {
          div(
            style = "margin-top: 6px; padding-top: 5px; border-top: 1px dashed rgba(255,255,255,0.15); font-size: 10px; color: #cbd5e1; font-style: italic;",
            "Pooled minor / unassigned acyl chains (see 'Other' Inspector)"
          )
        }
      )
    })

    output$prop_stat_note <- renderUI({
      active_tab <- input$prop_subtab_view %||% "proportions_view"
      if (identical(active_tab, "differential_view")) {
        return(NULL)
      }
      
      res_info <- tryCatch(buildPropPlotData(), error = function(e) NULL)
      if (is.null(res_info) || isTRUE(res_info$is_empty) || nrow(res_info$data) == 0) return(NULL)
      
      is_stacked <- (res_info$multiclass_mode == "stacked" && (res_info$n_classes %||% 1) > 1)
      class_mode <- res_info$class_mode %||% "major"
      grp_level <- res_info$grp_level %||% "Lipid Main Class"
      val_mode <- res_info$val_mode %||% (input$prop_value_mode %||% "Absolute (%)")
      
      layout_txt <- if (is_stacked) {
        sprintf("displayed in vertically stacked panels (%d %s: %s)",
                res_info$n_classes,
                if (grp_level == "Lipid Category") "categories" else if (class_mode == "linkage") "subclasses" else "classes",
                res_info$target_class)
      } else {
        sprintf("merged across selected %s: %s",
                if (grp_level == "Lipid Category") "categories" else if (class_mode %in% c("subclasses", "linkage")) "subclasses" else "classes",
                res_info$target_class)
      }
      grp_label <- res_info$grp_label %||% res_info$grp_var
      
      err_txt <- if (isTRUE(input$prop_show_error_bars)) {
        sprintf(" Error bars: <b>%s</b> for <b>%s</b> across replicates.",
                if (identical(input$prop_error_bar_stats, "sd")) "Standard Deviation (SD)" else "Standard Error of the Mean (SEM)",
                if (identical(input$prop_error_bar_type, "individual")) "individual acyl chain segments" else "total class abundance")
      } else ""
      
      is_donut <- isTRUE(input$prop_enable_donut)
      vmode_txt <- if (is_donut) {
        if (isTRUE(input$prop_show_donut_stats)) {
          " Visualization mode: <b>Donut Plot</b> (with Donut Proportions)."
        } else {
          " Visualization mode: <b>Donut Plot</b>."
        }
      } else {
        " Visualization mode: <b>Stacked Bar Chart</b>."
      }
      
      m_text <- sprintf("Fatty acyl chain composition analysis across <i>%s</i> (Position: <b>%s</b>, %s). Value mode: <b>%s</b>.%s%s", 
                        grp_label, res_info$pos_mode %||% "both", layout_txt, val_mode, vmode_txt, err_txt)
      shiny::HTML(sprintf("<div style='margin-top: 15px; padding: 12px; background-color: #f8f9fa; border-left: 4px solid #198754; font-size: 11px; line-height: 1.4; color: #333; border-radius: 0 4px 4px 0;'><b>Methodology Note (Main Class & Acyl Chain Proportions):</b> %s</div>", m_text))
    })

    output$downloadPropCSV <- downloadHandler(
      filename = function() {
        paste0("MainClass_AcylChain_Proportions_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".csv")
      },
      content = function(file) {
        res_info <- buildPropPlotData()
        req(res_info, res_info$data)
        write.csv(res_info$data, file, row.names = FALSE)
      }
    )

    output$downloadPropPDF <- downloadHandler(
      filename = function() {
        paste0("MainClass_AcylChain_Proportions_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".pdf")
      },
      content = function(file) {
        p <- propPlotReactive()
        req(p)
        res_info <- tryCatch(buildPropPlotData(), error = function(e) NULL)
        h_pdf <- if (!is.null(res_info) && res_info$multiclass_mode == "stacked" && (res_info$n_classes %||% 1) > 1) {
          max(8, 4 * res_info$n_classes)
        } else {
          8
        }
        w <- session$clientData[[paste0("output_", session$ns("propPlotPlot"), "_width")]]
        h <- session$clientData[[paste0("output_", session$ns("propPlotPlot"), "_height")]]
        w_in <- if (!is.null(w) && is.numeric(w) && w > 10) w / 72 else 12
        h_in <- if (!is.null(h) && is.numeric(h) && h > 10) h / 72 else h_pdf
        ggsave(file, plot = p, width = w_in, height = h_in, device = "pdf", limitsize = FALSE)
      }
    )

    # Dynamic Download Buttons Switcher for Subtabs
    output$prop_subtab_download_buttons_ui <- renderUI({
      active_tab <- input$prop_subtab_view %||% "proportions_view"
      if (identical(active_tab, "differential_view")) {
        tags$div(
          class = "d-flex align-items-center gap-1",
          downloadButton(session$ns("downloadDiffAcylCSV"), "Diff CSV", class="btn-sm btn-outline-primary py-0 btn-download-csv", style="margin-right: 5px;"),
          downloadButton(session$ns("downloadDiffAcylPDF"), "Diff PDF", class="btn-sm btn-outline-primary py-0 btn-download-pdf")
        )
      } else {
        tags$div(
          class = "d-flex align-items-center gap-1",
          downloadButton(session$ns("downloadPropCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
          downloadButton(session$ns("downloadPropPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
        )
      }
    })

    # Differential Compared Analysis Contrast Status UI
    output$diff_contrast_status_ui <- renderUI({
      de_ci <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      if (!is.null(de_ci) && !is.null(de_ci$ref) && !is.null(de_ci$comp) && 
          length(de_ci$ref) > 0 && length(de_ci$comp) > 0) {
        ref_txt <- paste(de_ci$ref, collapse = ", ")
        comp_txt <- paste(de_ci$comp, collapse = ", ")
        tags$div(
          class = "p-2 rounded bg-light border mb-2",
          style = "font-size: 0.8rem; border-left: 3px solid #3b82f6 !important;",
          tags$div(
            class = "d-flex align-items-center justify-content-between mb-1",
            tags$span(class = "fw-bold text-primary", icon("circle-check"), " Compared Analysis Active"),
            tags$a(
              href = "#",
              class = "text-decoration-none small text-muted",
              onclick = "window.pointToLog2FCFilter(event); return false;",
              title = "View or modify contrast in Compared Analysis dock",
              icon("sliders"), " Edit"
            )
          ),
          tags$div(
            class = "d-flex flex-column gap-1",
            tags$div(
              tags$span(class = "text-muted", "Numerator: "),
              tags$span(class = "badge bg-danger-subtle text-danger border border-danger-subtle", comp_txt)
            ),
            tags$div(
              tags$span(class = "text-muted", "Denominator: "),
              tags$span(class = "badge bg-primary-subtle text-primary border border-primary-subtle", ref_txt)
            )
          ),
          tags$p(class = "text-muted mb-0 mt-1", style = "font-size: 0.72rem;",
                 "Samples are automatically partitioned according to the active global Compared Analysis definition.")
        )
      } else {
        tags$div(
          class = "p-2 rounded bg-warning-subtle border border-warning mb-2 text-dark",
          style = "font-size: 0.8rem;",
          tags$div(class = "fw-bold mb-1", icon("triangle-exclamation", class = "text-warning"), " No Contrast Defined"),
          tags$p(class = "mb-1 small", "No active contrast was found in Compared Analysis."),
          tags$a(
            href = "#",
            class = "btn btn-xs btn-outline-primary",
            onclick = "window.pointToLog2FCFilter(event); return false;",
            icon("code-compare"), " Define in Compared Analysis"
          )
        )
      }
    })

    # Differential Contrast UI Controls
    output$diff_cohort_var_ui <- renderUI({
      meta <- shared_data$all_metadata()
      req(meta)
      valid_cols <- c("Group1")
      if ("Group2" %in% names(meta)) {
        g2_clean <- meta$Group2[!is.na(meta$Group2) & nzchar(meta$Group2) & meta$Group2 != "Unspecified"]
        if (length(unique(g2_clean)) > 0) {
          valid_cols <- c(valid_cols, "Group2", "Group1_Group2")
        }
      }
      other_candidates <- names(meta)[sapply(meta, function(col) {
        u <- unique(col[!is.na(col) & nzchar(as.character(col))])
        length(u) >= 2 && length(u) <= 20
      })]
      other_candidates <- setdiff(other_candidates, c("FullName", "SampleName", "Sample", "ID", valid_cols))
      if (length(other_candidates) > 0) {
        valid_cols <- c(valid_cols, other_candidates)
      }
      
      choices <- get_metadata_group_named_choices(valid_cols, meta)
      cohort_cols <- setdiff(valid_cols, "FullName")
      default_cohort <- determine_default_grouping_metadata(meta, cohort_cols)
      
      de_ci <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      if (!is.null(de_ci) && length(de_ci$ref) > 0) {
        if ("Group1_Group2" %in% names(meta) && any(de_ci$ref %in% meta$Group1_Group2) && "Group1_Group2" %in% choices) {
          default_cohort <- "Group1_Group2"
        } else if ("Group1" %in% names(meta) && any(de_ci$ref %in% meta$Group1) && "Group1" %in% choices) {
          default_cohort <- "Group1"
        } else if ("Group2" %in% names(meta) && any(de_ci$ref %in% meta$Group2) && "Group2" %in% choices) {
          default_cohort <- "Group2"
        }
      }
      
      if (length(default_cohort) == 0 || !default_cohort[1] %in% choices) {
        default_cohort <- if ("Group1" %in% choices) "Group1" else choices[1]
      } else {
        default_cohort <- default_cohort[1]
      }
      curr_sel <- isolate(input$diff_cohort_var)
      selected_val <- if (!is.null(curr_sel) && curr_sel %in% choices) curr_sel else default_cohort
      
      selectInput(session$ns("diff_cohort_var"), "Cohort Dimension:", choices = choices, selected = selected_val)
    })

    output$diff_ref_group_ui <- renderUI({
      meta <- shared_data$all_metadata()
      req(meta)
      cohort_var <- input$diff_cohort_var %||% "Group1"
      req(cohort_var %in% names(meta))
      
      vals <- sort(unique(as.character(meta[[cohort_var]])))
      vals <- vals[!is.na(vals) & nzchar(vals) & vals != "Unspecified"]
      req(length(vals) >= 2)
      
      wt_idx <- grep("^(wt|wild|ctrl|control|veh|vehicle|ref|baseline|mock)", vals, ignore.case = TRUE)
      default_ref <- if (length(wt_idx) > 0) vals[wt_idx[1]] else vals[1]
      
      de_ci <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      if (!is.null(de_ci) && length(de_ci$ref) > 0 && any(de_ci$ref %in% vals)) {
        default_ref <- intersect(de_ci$ref, vals)[1]
      }
      
      curr_sel <- isolate(input$diff_ref_group)
      selected_val <- if (!is.null(curr_sel) && curr_sel %in% vals) curr_sel else default_ref
      
      selectInput(session$ns("diff_ref_group"), "Reference Group (Denominator):", choices = vals, selected = selected_val)
    })

    output$diff_comp_group_ui <- renderUI({
      meta <- shared_data$all_metadata()
      req(meta)
      cohort_var <- input$diff_cohort_var %||% "Group1"
      req(cohort_var %in% names(meta))
      
      vals <- sort(unique(as.character(meta[[cohort_var]])))
      vals <- vals[!is.na(vals) & nzchar(vals) & vals != "Unspecified"]
      req(length(vals) >= 2)
      
      ref_val <- input$diff_ref_group %||% vals[1]
      non_ref <- setdiff(vals, ref_val)
      default_comp <- if (length(non_ref) > 0) non_ref[1] else vals[2]
      
      de_ci <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      if (!is.null(de_ci) && length(de_ci$comp) > 0 && any(de_ci$comp %in% vals)) {
        matched_comp <- intersect(de_ci$comp, vals)
        if (length(matched_comp) > 0 && matched_comp[1] != ref_val) {
          default_comp <- matched_comp[1]
        }
      }
      
      curr_sel <- isolate(input$diff_comp_group)
      selected_val <- if (!is.null(curr_sel) && curr_sel %in% vals && curr_sel != ref_val) curr_sel else default_comp
      
      selectInput(session$ns("diff_comp_group"), "Comparison Group (Numerator):", choices = vals, selected = selected_val)
    })

    output$diff_strata_filter_ui <- renderUI({
      meta <- shared_data$all_metadata()
      req(meta)
      cohort_var <- input$diff_cohort_var %||% "Group1"
      
      other_factor <- if (cohort_var == "Group1" && "Group2" %in% names(meta)) {
        "Group2"
      } else if (cohort_var == "Group2" && "Group1" %in% names(meta)) {
        "Group1"
      } else {
        NULL
      }
      
      if (!is.null(other_factor) && other_factor %in% names(meta)) {
        vals <- sort(unique(as.character(meta[[other_factor]])))
        vals <- vals[!is.na(vals) & nzchar(vals) & vals != "Unspecified"]
        if (length(vals) > 1) {
          choices <- c("All Samples (Pooled)" = "all", stats::setNames(vals, paste0("Only: ", vals)))
          return(selectInput(session$ns("diff_strata_filter"), 
                             tags$span("Stratify / Filter By:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), sprintf("Restrict differential comparison to a specific stratum of %s, or pool across all samples.", other_factor))),
                             choices = choices, selected = "all"))
        }
      }
      NULL
    })

    output$diff_sn_cohort_filter_ui <- renderUI({
      meta <- shared_data$all_metadata()
      req(meta)
      choices <- c("All Samples Combined" = "all")
      if ("Group1" %in% names(meta)) {
        g1_vals <- sort(unique(as.character(meta$Group1[!is.na(meta$Group1) & nzchar(meta$Group1)])))
        if (length(g1_vals) > 0) {
          choices <- c(choices, stats::setNames(paste0("Group1::", g1_vals), paste0("Group1: ", g1_vals)))
        }
      }
      if ("Group1_Group2" %in% names(meta)) {
        g12_vals <- sort(unique(as.character(meta$Group1_Group2[!is.na(meta$Group1_Group2) & nzchar(meta$Group1_Group2)])))
        if (length(g12_vals) > 0) {
          choices <- c(choices, stats::setNames(paste0("Group1_Group2::", g12_vals), paste0("Cohort: ", g12_vals)))
        }
      }
      selectInput(session$ns("diff_sn_cohort_filter"), "Sample Subset for sn-1 vs sn-2:", choices = choices, selected = "all")
    })

    output$diff_patient_var_ui <- renderUI({
      meta <- shared_data$all_metadata()
      req(meta)
      candidate_cols <- grep("patient|subject|donor|mouse|animal|pair", names(meta), ignore.case = TRUE, value = TRUE)
      if (length(candidate_cols) == 0) {
        candidate_cols <- setdiff(names(meta), c("FullName", "SampleName", "Sample", "Group1", "Group2", "Group1_Group2"))
      }
      if (length(candidate_cols) == 0) {
        return(helpText(class = "text-muted small", "No subject ID column detected in metadata."))
      }
      selectInput(session$ns("diff_patient_var"), "Subject / Pairing Variable:", choices = candidate_cols, selected = candidate_cols[1])
    })

    # Differential Acyl Chain Computation Reactive
    diff_acyl_data <- reactive({
      raw <- diff_raw_chain_data()
      req(raw, raw$df_long, nrow(raw$df_long) > 0)
      
      meta <- shared_data$all_metadata()
      req(meta)
      
      comp_type <- input$diff_comp_type %||% "de_contrast"
      stat_test <- input$diff_test_type %||% "t_test"
      p_cut <- input$diff_p_cutoff %||% 0.05
      fc_cut <- input$diff_fc_cutoff %||% 0.5
      
      sel <- prop_selected_chains()
      df_long <- raw$df_long
      
      detected_all <- unique(df_long$AcylChain)
      detected_all <- detected_all[!is.na(detected_all) & nzchar(detected_all)]
      
      if (isTRUE(input$prop_expand_other)) {
        if (is.null(sel)) {
          active_chains <- detected_all
        } else {
          active_chains <- union(intersect(sel, detected_all), detected_all)
        }
      } else if (is.null(sel)) {
        standard_chains <- names(EXPERT_SPECIFIC_ACYL_COLORS)
        standard_chains <- standard_chains[standard_chains != "Other"]
        detected_standard <- intersect(detected_all, standard_chains)
        class_prominent <- df_long %>%
          dplyr::group_by(LipidClass, AcylChain) %>%
          dplyr::summarise(ClsTot = sum(Intensity, na.rm = TRUE), .groups = "drop_last") %>%
          dplyr::mutate(ClsProp = ClsTot / sum(ClsTot)) %>%
          dplyr::filter(ClsProp >= 0.005) %>%
          dplyr::pull(AcylChain) %>%
          unique()
        valid_candidates <- unique(c(detected_standard, class_prominent))
        valid_candidates <- valid_candidates[valid_candidates != "Other" & !is.na(valid_candidates)]
        valid_candidates <- valid_candidates[!grepl("^(3[5-9]|[4-9]\\d|\\d{3,}):", valid_candidates)]
        df_long <- df_long %>% dplyr::mutate(AcylChain = dplyr::if_else(AcylChain %in% valid_candidates, AcylChain, "Other"))
        active_chains <- unique(df_long$AcylChain)
      } else {
        active_chains <- intersect(sel, detected_all)
        if (length(active_chains) == 0) active_chains <- detected_all
      }
      
      val_mode <- raw$val_mode
      abundance_metric <- if (grepl("[(][%][)]$", val_mode)) "prop" else "intensity"
      
      de_ci <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      meta_grouped <- tryCatch(shared_data$grouped_metadata(), error = function(e) NULL)
      has_de_ci <- !is.null(de_ci) && !is.null(de_ci$ref) && !is.null(de_ci$comp) && 
                   length(de_ci$ref) > 0 && length(de_ci$comp) > 0
      
      use_meta <- meta
      if (comp_type == "de_contrast") {
        if (has_de_ci) {
          if (!is.null(meta_grouped) && "Dynamic_DE_Group" %in% names(meta_grouped)) {
            use_meta <- meta_grouped
            cohort_var <- "Dynamic_DE_Group"
          } else {
            cohort_var <- input$diff_cohort_var %||% "Group1"
          }
          ref_grp <- de_ci$ref
          comp_grp <- de_ci$comp
        } else {
          cohort_var <- input$diff_cohort_var %||% "Group1"
          vals <- sort(unique(as.character(meta[[cohort_var]])))
          vals <- vals[!is.na(vals) & nzchar(vals) & vals != "Unspecified"]
          ref_grp <- if (length(vals) >= 1) vals[1] else "WT"
          comp_grp <- if (length(vals) >= 2) vals[2] else ref_grp
        }
        strata_val <- "all"
        strata_var <- NULL
      } else {
        cohort_var <- input$diff_cohort_var %||% "Group1"
        ref_grp <- input$diff_ref_group %||% "WT"
        comp_grp <- input$diff_comp_group %||% "Ctns_KO"
        
        strata_val <- input$diff_strata_filter %||% "all"
        strata_var <- if (cohort_var == "Group1" && "Group2" %in% names(meta)) {
          "Group2"
        } else if (cohort_var == "Group2" && "Group1" %in% names(meta)) {
          "Group1"
        } else {
          NULL
        }
      }
      
      sn_subset <- input$diff_sn_cohort_filter %||% "all"
      if (comp_type == "sn1_vs_sn2" && sn_subset != "all") {
        parts <- strsplit(sn_subset, "::")[[1]]
        sub_var <- parts[1]; sub_val <- parts[2]
        if (sub_var %in% names(df_long)) {
          df_long <- df_long %>% dplyr::filter(.data[[sub_var]] == sub_val)
        } else if (sub_var %in% names(meta)) {
          df_long <- df_long %>% dplyr::left_join(meta %>% dplyr::select(FullName, dplyr::all_of(sub_var)), by = "FullName") %>%
            dplyr::filter(.data[[sub_var]] == sub_val)
        }
      }
      
      patient_var <- input$diff_patient_var %||% NULL
      
      res_df <- compute_differential_acyl_chains(
        df_long = df_long,
        meta = use_meta,
        comparison_mode = if (comp_type == "sn1_vs_sn2") "sn_position" else if (comp_type == "paired_patient") "paired_patient" else "cohort",
        cohort_var = cohort_var,
        ref_group = ref_grp,
        comp_group = comp_grp,
        strata_var = if (!is.null(strata_var) && strata_val != "all") strata_var else NULL,
        strata_val = if (!is.null(strata_var) && strata_val != "all") strata_val else NULL,
        patient_var = patient_var,
        abundance_metric = abundance_metric,
        stat_test = stat_test,
        p_adjust_method = "BH",
        active_chains = active_chains,
        pval_cutoff = p_cut,
        l2fc_cutoff = fc_cut
      )
      
      ref_label <- if (is.character(ref_grp)) paste(ref_grp, collapse = "+") else as.character(ref_grp)
      comp_label <- if (is.character(comp_grp)) paste(comp_grp, collapse = "+") else as.character(comp_grp)
      
      list(
        results = res_df,
        comp_type = comp_type,
        ref_group = if (comp_type == "sn1_vs_sn2") "sn-1" else ref_label,
        comp_group = if (comp_type == "sn1_vs_sn2") "sn-2" else comp_label,
        abundance_metric = abundance_metric,
        stat_test = stat_test,
        pval_cutoff = p_cut,
        l2fc_cutoff = fc_cut,
        rank_by = input$diff_rank_by %||% "abs_log2fc",
        plot_style = input$diff_plot_style %||% "forest",
        target_classes = raw$cls_targets,
        grp_level = raw$grp_level,
        class_mode = raw$class_mode,
        n_lipids = if (!is.null(raw$anno_sub)) nrow(raw$anno_sub) else 0,
        strata_val = strata_val,
        strata_var = strata_var,
        cohort_var = if (comp_type == "de_contrast") "Compared Analysis" else cohort_var,
        patient_var = patient_var,
        sn_subset = sn_subset
      )
    })

    # KPI Summary Cards
    output$diff_acyl_kpi_ui <- renderUI({
      diff_res <- tryCatch(diff_acyl_data(), error = function(e) NULL)
      req(diff_res, diff_res$results)
      df <- diff_res$results
      
      n_total <- nrow(df)
      n_up <- sum(df$Significance == "Significant Up", na.rm = TRUE)
      n_down <- sum(df$Significance == "Significant Down", na.rm = TRUE)
      n_ns <- sum(df$Significance == "Not Significant", na.rm = TRUE)
      
      top_row <- df %>% dplyr::arrange(PValue, desc(abs(Log2FC))) %>% dplyr::slice(1)
      top_chain <- if (nrow(top_row) > 0) top_row$AcylChain[1] else "None"
      top_l2fc <- if (nrow(top_row) > 0) sprintf("%+.2f", top_row$Log2FC[1]) else "0"
      top_pval <- if (nrow(top_row) > 0) {
        if (top_row$PValue[1] < 0.001) sprintf("%.2e", top_row$PValue[1]) else sprintf("%.4f", top_row$PValue[1])
      } else "1"
      
      comp_type <- diff_res$comp_type %||% "de_contrast"
      comp_grp <- diff_res$comp_group %||% "Numerator"
      ref_grp <- diff_res$ref_group %||% "Denominator"
      cohort_var <- diff_res$cohort_var %||% "Group1"
      sn_sub <- diff_res$sn_subset %||% "all"
      
      if (comp_type == "sn1_vs_sn2") {
        if (sn_sub != "all") {
          parts <- strsplit(sn_sub, "::")[[1]]
          sub_ctx <- if (length(parts) == 2) parts[2] else sn_sub
          up_group_tag <- sprintf("%s · %s", comp_grp, sub_ctx)
          down_group_tag <- sprintf("%s · %s", ref_grp, sub_ctx)
          up_desc <- sprintf("%s (%s)", comp_grp, sub_ctx)
          down_desc <- sprintf("%s (%s)", ref_grp, sub_ctx)
          analyzed_subtext <- sprintf("sn-1 vs sn-2 (%s: %s)", parts[1], sub_ctx)
        } else {
          up_group_tag <- comp_grp
          down_group_tag <- ref_grp
          up_desc <- comp_grp
          down_desc <- sprintf("%s (Depleted in %s)", ref_grp, comp_grp)
          analyzed_subtext <- "sn-1 vs sn-2 (All Samples)"
        }
      } else if (comp_type == "paired_patient") {
        pat_col <- diff_res$patient_var %||% "Subject"
        up_group_tag <- comp_grp
        down_group_tag <- ref_grp
        up_desc <- comp_grp
        down_desc <- ref_grp
        analyzed_subtext <- sprintf("Paired %s (%s vs %s)", pat_col, comp_grp, ref_grp)
      } else if (comp_type == "de_contrast") {
        up_group_tag <- comp_grp
        down_group_tag <- ref_grp
        up_desc <- comp_grp
        down_desc <- ref_grp
        analyzed_subtext <- sprintf("Compared Analysis (%s vs %s)", comp_grp, ref_grp)
      } else {
        # Cohort comparison
        up_group_tag <- comp_grp
        down_group_tag <- ref_grp
        up_desc <- comp_grp
        down_desc <- ref_grp
        strata_txt <- if (!is.null(diff_res$strata_val) && diff_res$strata_val != "all") sprintf(" [%s]", diff_res$strata_val) else ""
        analyzed_subtext <- sprintf("%s%s (%s vs %s)", cohort_var, strata_txt, comp_grp, ref_grp)
      }
      
      top_group_tag <- if (nrow(top_row) > 0) {
        if (top_row$Log2FC[1] >= 0) up_group_tag else down_group_tag
      } else ""
      
      div(
        class = "row g-2 mb-2",
        div(
          class = "col-6 col-md-3",
          div(
            class = "card h-100 border-0 shadow-sm bg-white px-2.5 py-2 d-flex flex-row align-items-center justify-content-between",
            style = "border-left: 3px solid #6366f1 !important; min-height: 56px;",
            div(
              style = "min-width: 0; flex: 1;",
              div(style = "font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; line-height: 1.1; margin-bottom: 2px;", "Analyzed Chains"),
              div(style = "font-size: 1.15rem; font-weight: 700; color: #1e293b; line-height: 1.1;", n_total),
              div(style = "font-size: 0.70rem; color: #94a3b8; line-height: 1.1; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;", title = analyzed_subtext, analyzed_subtext)
            ),
            div(style = "width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; margin-left: 6px;", class = "bg-light text-primary", icon("dna"))
          )
        ),
        div(
          class = "col-6 col-md-3",
          div(
            class = "card h-100 border-0 shadow-sm bg-white px-2.5 py-2 d-flex flex-row align-items-center justify-content-between",
            style = "border-left: 3px solid #ef4444 !important; min-height: 56px;",
            div(
              style = "min-width: 0; flex: 1;",
              div(style = "font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; line-height: 1.1; margin-bottom: 2px;", "Significant Up"),
              div(
                style = "font-size: 1.15rem; font-weight: 700; color: #dc2626; line-height: 1.1; display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;",
                n_up,
                tags$span(style = "font-size: 0.72rem; font-weight: 600; color: #64748b;", sprintf("(%s)", up_group_tag))
              ),
              div(style = "font-size: 0.70rem; color: #94a3b8; line-height: 1.1; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;", title = sprintf("Enriched in %s", up_desc), sprintf("Enriched in %s", up_desc))
            ),
            div(style = "width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; margin-left: 6px;", class = "bg-danger-subtle text-danger", icon("arrow-trend-up"))
          )
        ),
        div(
          class = "col-6 col-md-3",
          div(
            class = "card h-100 border-0 shadow-sm bg-white px-2.5 py-2 d-flex flex-row align-items-center justify-content-between",
            style = "border-left: 3px solid #0284c7 !important; min-height: 56px;",
            div(
              style = "min-width: 0; flex: 1;",
              div(style = "font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; line-height: 1.1; margin-bottom: 2px;", "Significant Down"),
              div(
                style = "font-size: 1.15rem; font-weight: 700; color: #0284c7; line-height: 1.1; display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;",
                n_down,
                tags$span(style = "font-size: 0.72rem; font-weight: 600; color: #64748b;", sprintf("(%s)", down_group_tag))
              ),
              div(style = "font-size: 0.70rem; color: #94a3b8; line-height: 1.1; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;", title = sprintf("Enriched in %s", down_desc), sprintf("Enriched in %s", down_desc))
            ),
            div(style = "width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; margin-left: 6px;", class = "bg-info-subtle text-info", icon("arrow-trend-down"))
          )
        ),
        div(
          class = "col-6 col-md-3",
          div(
            class = "card h-100 border-0 shadow-sm bg-white px-2.5 py-2 d-flex flex-row align-items-center justify-content-between",
            style = "border-left: 3px solid #10b981 !important; min-height: 56px;",
            div(
              style = "min-width: 0; flex: 1;",
              div(style = "font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; line-height: 1.1; margin-bottom: 2px;", "Top Remodeling Driver"),
              div(
                style = "font-size: 1.05rem; font-weight: 700; color: #1e293b; line-height: 1.1; display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap;",
                top_chain,
                if (top_chain != "None" && nzchar(top_group_tag)) tags$span(style = "font-size: 0.72rem; font-weight: 600; color: #64748b;", sprintf("(%s)", top_group_tag)) else NULL
              ),
              div(style = "font-size: 0.70rem; color: #94a3b8; line-height: 1.1; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;", sprintf("Log2FC: %s | p: %s", top_l2fc, top_pval))
            ),
            div(style = "width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; flex-shrink: 0; margin-left: 6px;", class = "bg-success-subtle text-success", icon("trophy"))
          )
        )
      )
    })

    # Differential Plot Reactive & Dynamic Height Handling
    debounced_diff_container_size <- debounce(reactive(input$diff_plot_container_size), 250)

    get_diff_plot_height <- function() {
      diff_res <- tryCatch(diff_acyl_data(), error = function(e) NULL)
      n_chains <- if (!is.null(diff_res) && !is.null(diff_res$results)) nrow(diff_res$results) else 8
      plot_style <- if (!is.null(diff_res)) diff_res$plot_style else "forest"
      
      base_h <- if (plot_style == "volcano") {
        480
      } else {
        max(420, min(1400, 160 + n_chains * 26))
      }
      
      container_size <- debounced_diff_container_size()
      if (!is.null(container_size) && !is.null(container_size$height) && is.numeric(container_size$height) && container_size$height > 200) {
        return(max(base_h, container_size$height - 16))
      }
      base_h
    }

    diffAcylPlotReactive <- reactive({
      diff_res <- tryCatch(diff_acyl_data(), error = function(e) NULL)
      req(diff_res, diff_res$results)
      df <- diff_res$results
      req(nrow(df) > 0)
      
      plot_style <- diff_res$plot_style %||% "forest"
      rank_by <- diff_res$rank_by %||% "abs_log2fc"
      p_cut <- diff_res$pval_cutoff %||% 0.05
      fc_cut <- diff_res$l2fc_cutoff %||% 0.5
      ref_label <- diff_res$ref_group
      comp_label <- diff_res$comp_group
      
      all_chains <- unique(df$AcylChain)
      color_map <- generate_acyl_chain_colors(all_chains, custom_overrides = prop_color_map())
      
      if (plot_style == "volcano") {
        df_plot <- df %>%
          dplyr::mutate(
            NegLogP = -log10(pmax(PValue, 1e-20)),
            Is_Sig = (PValue <= p_cut & abs(Log2FC) >= fc_cut)
          )
        
        p <- ggplot(df_plot, aes(x = Log2FC, y = NegLogP)) +
          geom_vline(xintercept = 0, color = "#475569", linewidth = 0.8) +
          geom_vline(xintercept = c(-fc_cut, fc_cut), linetype = "dashed", color = "#94a3b8", linewidth = 0.6) +
          geom_hline(yintercept = -log10(p_cut), linetype = "dashed", color = "#94a3b8", linewidth = 0.6) +
          geom_point(aes(fill = AcylChain, size = (Mean_Ref + Mean_Comp) / 2),
                     shape = 21, color = "#1e293b", stroke = 0.6, alpha = 0.88) +
          scale_fill_manual(values = color_map, guide = "none") +
          scale_size_continuous(range = c(3, 8), name = if (diff_res$abundance_metric == "prop") "Mean Composition (%)" else "Mean Abundance") +
          labs(
            title = sprintf("Differential Acyl Chain Remodeling: %s vs %s", comp_label, ref_label),
            subtitle = sprintf("Acyl Volcano Plot: Dashed cutoffs: p ≤ %.2f, |Log2FC| ≥ %.2f. Circle size indicates mean abundance.", p_cut, fc_cut),
            x = sprintf("Log2 Fold Change (%s / %s)", comp_label, ref_label),
            y = "-Log10 (P-Value)"
          ) +
          theme_minimal(base_size = 12) +
          theme(
            plot.title = element_text(face = "bold", size = 13.5, color = "#0f172a"),
            plot.subtitle = element_text(size = 10, color = "#64748b", margin = margin(b = 10)),
            axis.title = element_text(face = "bold", color = "#334155", size = 11),
            panel.grid.minor = element_blank(),
            panel.grid.major = element_line(color = "#f1f5f9", linewidth = 0.8),
            legend.position = "right"
          )
        
        sig_pts <- df_plot %>% dplyr::filter(Is_Sig)
        if (nrow(sig_pts) > 0) {
          p <- p + ggrepel::geom_text_repel(
            data = sig_pts,
            aes(label = AcylChain),
            size = 3.8,
            fontface = "bold",
            color = "#0f172a",
            max.overlaps = 30,
            box.padding = 0.4
          )
        }
        return(p)
      } else {
        # Diverging Forest Plot
        df_plot <- df
        if (rank_by == "abs_log2fc") {
          df_plot <- df_plot %>% dplyr::arrange(abs(Log2FC))
        } else if (rank_by == "log2fc_desc") {
          df_plot <- df_plot %>% dplyr::arrange(Log2FC)
        } else if (rank_by == "log2fc_asc") {
          df_plot <- df_plot %>% dplyr::arrange(desc(Log2FC))
        } else {
          df_plot <- df_plot %>% dplyr::arrange(desc(PValue))
        }
        
        df_plot$AcylChain <- factor(df_plot$AcylChain, levels = df_plot$AcylChain)
        df_plot$Stars <- dplyr::case_when(
          df_plot$PValue < 0.001 ~ "***",
          df_plot$PValue < 0.01  ~ "**",
          df_plot$PValue < 0.05  ~ "*",
          TRUE ~ ""
        )
        
        x_range <- max(abs(c(df_plot$CI_Low, df_plot$CI_High, df_plot$Log2FC)), na.rm = TRUE)
        offset <- max(0.15, x_range * 0.03)
        
        p <- ggplot(df_plot, aes(x = Log2FC, y = AcylChain)) +
          geom_vline(xintercept = 0, color = "#475569", linewidth = 0.8) +
          geom_vline(xintercept = c(-fc_cut, fc_cut), linetype = "dashed", color = "#94a3b8", linewidth = 0.6) +
          geom_errorbar(aes(xmin = CI_Low, xmax = CI_High), width = 0.28, orientation = "y", color = "#64748b", alpha = 0.85, linewidth = 0.5) +
          geom_col(aes(fill = AcylChain), width = 0.62, alpha = 0.9, color = "#334155", linewidth = 0.3) +
          geom_text(aes(x = ifelse(Log2FC >= 0, pmax(CI_High, Log2FC) + offset, pmin(CI_Low, Log2FC) - offset), label = Stars),
                    vjust = 0.75, size = 4.2, fontface = "bold", color = "#0f172a") +
          scale_fill_manual(values = color_map, guide = "none") +
          labs(
            title = sprintf("Differential Acyl Chain Remodeling: %s vs %s", comp_label, ref_label),
            subtitle = sprintf("Diverging effect size (Log2 Fold Change) with 95%% CI. Dashed cutoffs: |Log2FC| ≥ %.2f, * p<0.05, ** p<0.01, *** p<0.001", fc_cut),
            x = sprintf("Log2 Fold Change (%s / %s)", comp_label, ref_label),
            y = "Acyl Chain Configuration"
          ) +
          theme_minimal(base_size = 12) +
          theme(
            plot.title = element_text(face = "bold", size = 13.5, color = "#0f172a"),
            plot.subtitle = element_text(size = 10, color = "#64748b", margin = margin(b = 10)),
            axis.text.y = element_text(face = "bold", color = "#1e293b", size = 11),
            axis.title = element_text(face = "bold", color = "#334155", size = 11),
            panel.grid.minor = element_blank(),
            panel.grid.major.y = element_line(color = "#f1f5f9", linewidth = 0.8),
            panel.grid.major.x = element_line(color = "#e2e8f0", linewidth = 0.5)
          )
        return(p)
      }
    })

    output$diffAcylPlot <- renderPlot({
      p <- diffAcylPlotReactive()
      req(p)
      p
    }, height = get_diff_plot_height)

    # Dynamic Journal Caption / Bottom Note for Differential Acyl Chain Expression
    output$diff_plot_bottom_note <- renderUI({
      diff_res <- tryCatch(diff_acyl_data(), error = function(e) NULL)
      req(diff_res, diff_res$results)
      df <- diff_res$results
      req(nrow(df) > 0)
      
      plot_style <- diff_res$plot_style %||% "forest"
      p_cut <- diff_res$pval_cutoff %||% 0.05
      fc_cut <- diff_res$l2fc_cutoff %||% 0.5
      ref_label <- diff_res$ref_group
      comp_label <- diff_res$comp_group
      comp_type <- diff_res$comp_type %||% "cohort"
      stat_test <- diff_res$stat_test %||% "t_test"
      
      # Dynamic Directionality explanation
      if (comp_type == "sn1_vs_sn2") {
        right_expl <- sprintf("acyl chains preferentially esterified at the <b>%s</b> position", comp_label)
        left_expl <- sprintf("acyl chains preferentially esterified at the <b>%s</b> position", ref_label)
      } else {
        right_expl <- sprintf("lipids upregulated in <b>%s</b>", comp_label)
        left_expl <- sprintf("lipids upregulated in <b>%s</b>", ref_label)
      }
      
      if (plot_style == "volcano") {
        plot_desc <- sprintf(
          "Volcano plot illustrating the relationship between effect size and statistical significance for all analyzed lipids. Right side (positive log2 fold change) shows %s, while left side (negative log2 fold change) shows %s. Circle size indicates mean abundance (%s). Vertical dashed lines indicate fold change cutoff (|Log2FC| &ge; <b>%.2f</b>), while horizontal dashed line indicates significance cutoff (P &le; <b>%.2f</b>).",
          right_expl, left_expl, if (identical(diff_res$abundance_metric, "prop")) "relative composition %" else "abundance intensity", fc_cut, p_cut
        )
      } else {
        plot_desc <- sprintf(
          "Diverging Forest plot illustrating the effect sizes (log2 fold change) and 95%% confidence intervals for all analyzed lipids. Right side (positive log2 fold change) shows %s, while left side (negative log2 fold change) shows %s. Asterisks denote statistical significance tiers (* P &le; 0.05, ** P &le; 0.01, *** P &le; 0.001). Vertical dashed lines indicate fold change cutoff (|Log2FC| &ge; <b>%.2f</b>).",
          right_expl, left_expl, fc_cut
        )
      }
      
      test_applied <- dplyr::case_when(
        stat_test == "wilcoxon" ~ "Wilcoxon Rank-Sum / Mann-Whitney U test (non-parametric)",
        stat_test == "paired_t" ~ "Paired Student's two-tailed t-test (parametric)",
        TRUE ~ "Two-Sample Student's two-tailed t-test (parametric)"
      )
      
      comp_str <- sprintf("<b>%s</b> vs <b>%s</b>", comp_label, ref_label)
      if (!is.null(diff_res$strata_var) && !is.null(diff_res$strata_val) && diff_res$strata_val != "all") {
        comp_str <- sprintf("%s (Stratified by <b>%s</b> = <b>%s</b>)", comp_str, diff_res$strata_var, diff_res$strata_val)
      }
      
      target_cls <- diff_res$target_classes
      target_display <- if (is.null(target_cls) || length(target_cls) == 0 || "all" %in% target_cls || "all_categories" %in% target_cls || "all_subclasses" %in% target_cls) {
        "All Analyzed Classes"
      } else if ("phospholipids" %in% target_cls || "all_pl_subclasses" %in% target_cls) {
        "All Phospholipids"
      } else {
        clean_cls <- gsub("__.*$", "", target_cls)
        paste(unique(clean_cls), collapse = ", ")
      }
      
      n_total <- nrow(df)
      n_up <- sum(df$Significance == "Significant Up", na.rm = TRUE)
      n_down <- sum(df$Significance == "Significant Down", na.rm = TRUE)
      n_lipids <- diff_res$n_lipids %||% 0
      
      shiny::HTML(sprintf(
        "<div style='margin-top: 8px; margin-bottom: 16px; padding: 12px 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 4px; font-size: 11.5px; line-height: 1.5; color: #334155;'>
           <div style='margin-bottom: 6px;'>%s</div>
           <div style='display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 4px 16px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px;'>
             <div>Test Applied: <b>%s</b></div>
             <div>Significance Evaluation: <b>Raw P-values &le; %.2f</b> (FDR-adjusted values in table)</div>
             <div>Comparison: %s</div>
             <div>Scope: <b>%s</b> (<b>%d</b> lipids, <b>%d</b> chains analyzed: <b>%d</b> Up, <b>%d</b> Down)</div>
           </div>
         </div>",
        plot_desc, test_applied, p_cut, comp_str, target_display, n_lipids, n_total, n_up, n_down
      ))
    })

    # Differential Acyl Chain Interactive Table
    output$diffAcylTable <- DT::renderDT({
      diff_res <- tryCatch(diff_acyl_data(), error = function(e) NULL)
      req(diff_res, diff_res$results)
      df <- diff_res$results
      req(nrow(df) > 0)
      
      all_chains <- unique(df$AcylChain)
      color_map <- generate_acyl_chain_colors(all_chains, custom_overrides = prop_color_map())
      
      metric_unit <- if (diff_res$abundance_metric == "prop") "%" else "AU"
      ref_label <- diff_res$ref_group
      comp_label <- diff_res$comp_group
      
      table_df <- df %>%
        dplyr::mutate(
          Color = sapply(AcylChain, function(ch) {
            col <- color_map[[ch]] %||% "#94a3b8"
            sprintf("<span style='display:inline-block;width:12px;height:12px;border-radius:50%%;background-color:%s;margin-right:6px;vertical-align:middle;box-shadow:0 1px 2px rgba(0,0,0,0.15);'></span><strong>%s</strong>", col, ch)
          }),
          Mean_Ref_Fmt = sprintf("%.2f %s", Mean_Ref, metric_unit),
          Mean_Comp_Fmt = sprintf("%.2f %s", Mean_Comp, metric_unit),
          Delta_Fmt = sprintf("%+.2f %s", Delta, metric_unit),
          Log2FC_Fmt = sprintf("%+.2f", Log2FC),
          CI_Fmt = sprintf("[%.2f, %.2f]", CI_Low, CI_High),
          PVal_Fmt = ifelse(PValue < 0.001, sprintf("%.2e", PValue), sprintf("%.4f", PValue)),
          FDR_Fmt = ifelse(AdjPValue < 0.001, sprintf("%.2e", AdjPValue), sprintf("%.4f", AdjPValue)),
          Status = dplyr::case_when(
            Significance == "Significant Up" ~ "<span class='badge bg-danger text-white px-2 py-1'>Enriched (Up)</span>",
            Significance == "Significant Down" ~ "<span class='badge bg-info text-white px-2 py-1'>Depleted (Down)</span>",
            TRUE ~ "<span class='badge bg-secondary-subtle text-secondary border px-2 py-1'>Not Significant</span>"
          )
        ) %>%
        dplyr::select(
          AcylChain_Display = Color,
          Ref_Mean = Mean_Ref_Fmt,
          Comp_Mean = Mean_Comp_Fmt,
          Delta = Delta_Fmt,
          Log2FC = Log2FC_Fmt,
          `95% CI` = CI_Fmt,
          `P-Value` = PVal_Fmt,
          `FDR (Adj. P)` = FDR_Fmt,
          Status
        )
      
      col_names <- c(
        "Acyl Chain",
        paste0(ref_label, " Mean"),
        paste0(comp_label, " Mean"),
        paste0("\u0394 (", comp_label, " - ", ref_label, ")"),
        "Log2 Fold Change",
        "95% Confidence Interval",
        "P-Value",
        "FDR (Adj. P)",
        "Significance"
      )
      
      DT::datatable(
        table_df,
        colnames = col_names,
        escape = FALSE,
        selection = "single",
        rownames = FALSE,
        options = list(
          pageLength = 15,
          lengthMenu = list(c(10, 15, 25, 50, -1), c("10", "15", "25", "50", "All")),
          scrollX = TRUE,
          dom = "<'d-flex justify-content-between align-items-center mb-2'Bf>rt<'d-flex justify-content-between align-items-center mt-2'ip>",
          buttons = list(
            list(extend = "copy", className = "btn btn-outline-secondary btn-sm py-0"),
            list(extend = "csv", className = "btn btn-outline-secondary btn-sm py-0"),
            list(extend = "excel", className = "btn btn-outline-secondary btn-sm py-0")
          ),
          order = list(list(4, "desc"))
        )
      )
    })

    output$downloadDiffAcylCSV <- downloadHandler(
      filename = function() {
        paste0("Differential_Acyl_Chain_Expression_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".csv")
      },
      content = function(file) {
        diff_res <- tryCatch(diff_acyl_data(), error = function(e) NULL)
        req(diff_res, diff_res$results)
        write.csv(diff_res$results, file, row.names = FALSE)
      }
    )

    output$downloadDiffAcylPDF <- downloadHandler(
      filename = function() {
        paste0("Differential_Acyl_Chain_Expression_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".pdf")
      },
      content = function(file) {
        p <- diffAcylPlotReactive()
        req(p)
        diff_res <- tryCatch(diff_acyl_data(), error = function(e) NULL)
        n_ch <- if (!is.null(diff_res) && !is.null(diff_res$results)) nrow(diff_res$results) else 10
        h_pdf <- max(6, min(16, 3.5 + 0.3 * n_ch))
        w_pdf <- 9
        ggsave(file, plot = p, width = w_pdf, height = h_pdf, device = "pdf", limitsize = FALSE)
      }
    )
    
    outputOptions(output, "prop_group_var_ui", suspendWhenHidden = FALSE)
    outputOptions(output, "prop_target_class_ui", suspendWhenHidden = FALSE)
    outputOptions(output, "diff_target_class_ui", suspendWhenHidden = FALSE)
    outputOptions(output, "prop_chain_matrix_ui", suspendWhenHidden = FALSE)
    outputOptions(output, "prop_matrix_status_badge", suspendWhenHidden = FALSE)
    outputOptions(output, "propPlotPlot", suspendWhenHidden = FALSE)
    outputOptions(output, "diffAcylPlot", suspendWhenHidden = FALSE)
    outputOptions(output, "diffAcylTable", suspendWhenHidden = FALSE)
    
  })
}
