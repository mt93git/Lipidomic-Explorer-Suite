# Team presentation only; server and PCA remain shared.
qc_boxplot_ui <- function(id) {
  ns <- NS(id)
  tagList(
  # Use bslib::layout_sidebar for collapsible native sidebar
    layout_sidebar(
      sidebar = sidebar(
        width = 285,
        open = "desktop",
        tags$div(
          class = "sidebar-top-bar d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom",
          tags$div(
            class = "d-flex align-items-center gap-2",
            icon("chart-line", class = "text-secondary"),
            tags$span(class = "fw-bold text-dark", style = "font-size: 0.85rem; letter-spacing: -0.01em;", "Quality Control Controls")
          )
        ),
        accordion(
           open = c("0. Sample Grouping & Nomenclature", "2. Data Visualization"), multiple = TRUE,
           accordion_panel("0. Sample Grouping & Nomenclature", icon = icon("layer-group"),
             radioButtons(ns("mergeReplicatesMode"), tags$span("Grouping Mode (Single/Merged Samples):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Single displays each sample individually. Merged displays the average value across replicates for each group.")),
                          choices = c("Merged Samples" = "merged", "Single Replicates" = "single"),
                          selected = "single"),
             hr(),
             radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                          choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                          selected = "short")
           ),
           accordion_panel("1. Data processing and PCA", guide_link("Review preparation in step 3",step=3)),
           accordion_panel("2. Data Visualization", icon = icon("paint-brush"),
              accordion(
                open = "PCA Score Plot", multiple = TRUE,
                 accordion_panel("PCA Score Plot", icon=icon("users"),
                   strong("Coloring"),
                    checkboxGroupInput(ns("colorGrouping"), "Color Samples By:", 
                                       choices=c("Group1","Group2","TimePoint","PatientNumber"), selected=c("Group1"), inline=TRUE),
                    checkboxGroupInput(ns("labelParts"), "Label content:", 
                                       choices=c("Group1","Group2","Replicate","TimePoint","PatientNumber"), selected=c("Group1"), inline=TRUE),
                   checkboxInput(ns("useCustomColors"), "Override sample colors in this QC tab?", FALSE),
                   uiOutput(ns("customColorUI")), 
                   hr(),
                   strong("Shaping"),
                   checkboxInput(ns("useShapes"), "Use different shapes for groups?", value=FALSE),
                   conditionalPanel("input.useShapes == true", ns = ns,
                      radioButtons(ns("shapeGrouping"), "Shape Samples By:", choices=c("Group1","Group2","TimePoint","PatientNumber"), selected="Group2", inline=TRUE),
                     uiOutput(ns("customShapeUI"))
                   )
                 ),
                 accordion_panel("PCA Loading Plots", icon=icon("atom"),
                   checkboxInput(ns("showSingleLipidNames"), "Single Lipid Name", value = FALSE),
                   p(class="text-muted small", "Class colors are now managed in the Global Sidebar (8. Color Classes).")
                 ),
                accordion_panel("Plot Styling", icon=icon("ruler-combined"),
                  checkboxInput(ns("addFrame2D"), "Add frame to 2D plots?", FALSE), hr(),
                  sliderInput(ns("scoreMarkerSize2D"), "PCA - 2D Dot Size:", min=1, max=20, value=8),
                  sliderInput(ns("scoreTextSize2D"), "PCA - 2D Label Size:", min=1, max=10, value=4, step=0.5),
                  sliderInput(ns("scoreMarkerSize3D"), "PCA - 3D Dot Size:", min=1, max=20, value=8), hr(),
                  sliderInput(ns("loadMarkerSize2D"), "Loadings - 2D Dot Size:", min=1, max=20, value=8),
                  sliderInput(ns("loadTextSize2D"), "Loadings - 2D Label Size:", min=1, max=10, value=4, step=0.5),
                  sliderInput(ns("loadMarkerSize3D"), "Loadings - 3D Dot Size:", min=1, max=20, value=14), hr(),
                  checkboxInput(ns("showLabels3D"), "Show labels on 3D plots?", value = TRUE)
                ),
                accordion_panel("2D Smart Labeling (ggrepel)", icon=icon("tags"),
                  checkboxInput(ns("smartLabelPCA2D"), "Display Labeling (PCA 2D)?", TRUE),
                  conditionalPanel("input.smartLabelPCA2D == true", ns = ns,
                    sliderInput(ns("repelForcePCA2D"), "Repel Force:", min=0, max=100, value=30),
                    sliderInput(ns("repelBoxPadPCA2D"), "Box Padding:", min=0, max=2, value=0.35, step=0.05),
                    sliderInput(ns("repelPointPadPCA2D"), "Point Padding:", min=0, max=2, value=0.35, step=0.05)
                  ), 
                  hr(),
                  checkboxInput(ns("smartLabelLoad2D"), "Display Labeling (Loadings 2D)?", TRUE),
                  conditionalPanel("input.smartLabelLoad2D == true", ns = ns,
                    sliderInput(ns("repelForceLoad2D"), "Repel Force:", min=0, max=100, value=20),
                    sliderInput(ns("repelBoxPadLoad2D"), "Box Padding:", min=0, max=2, value=0.35, step=0.05),
                    sliderInput(ns("repelPointPadLoad2D"), "Point Padding:", min=0, max=2, value=0.35, step=0.05)
                  )
                ),
                accordion_panel("Sample Correlation", icon=icon("diagram-project"),
                  selectInput(ns("corrMethod"), "Correlation Method:", choices = c("Pearson" = "pearson", "Spearman" = "spearman"), selected = "pearson"),
                  checkboxInput(ns("corrCluster"), "Cluster samples hierarchically?", TRUE),
                  checkboxInput(ns("corrShowLabels"), "Show sample labels?", TRUE),
                  sliderInput(ns("corrLabelSize"), "Label Font Size:", min = 1, max = 15, value = 8, step = 0.5)
                )
              )
           )
        ),

        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Quality Check",
          subtitle = "This module provides comprehensive diagnostics to validate data normalization, assess technical precision, and detect outliers before conducting downstream analyses:",
          bullets = list(
            tags$li(tags$strong("Normalization Check:"), " Assess global abundance distribution scaling across biological replicates using boxplots of normalized lipid abundance."),
            tags$li(tags$strong("Outliers Detection:"), " Flag anomalous samples by calculating multidimensional PCA diagnostics (D-Score and Hotelling's T2)."),
            tags$li(tags$strong("PCA Score & Loading Plots:"), " Project sample clustering in low-dimensional space and identify driver lipid species."),
            tags$li(tags$strong("Sample Correlation:"), " Evaluate technical reproducibility and pairwise sample similarity using clustering correlation heatmaps."),
            tags$li(tags$strong("BQC CoV Analysis:"), " Calculate the Coefficient of Variation (CoV) across Batch Quality Control (BQC) technical replicates to globally exclude imprecise lipid measurements.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        div(
          class = "qc-card-tabs hide-redundant-nav-tabs",
          navset_card_pill(
            id = ns("main_tabs"),
            selected = "PCA Score Plots",
            nav_panel("Normalization Check",
              div(
                class = "quick-access-strip mb-2.5 mt-2",
                tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                tags$button(
                  type = "button",
                  class = "btn-quick-access",
                  onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
                  title = "Configure Normalization Method (Median, PQN, None)",
                  icon("sliders"), tags$strong("Normalization Method")
                ),
                tags$button(
                  type = "button",
                  class = "btn-quick-access",
                  onclick = "window.pointToElement('#qc_pca_tab-mergeReplicatesMode', 'plot_controls', '0. Sample Grouping & Nomenclature', event);",
                  title = "Toggle between Merged Samples and Single Replicates in Quality Control sidebar",
                  icon("users-viewfinder"), "Merged Samples / Single Replicates"
                ),
                tags$button(
                  type = "button",
                  class = "btn-quick-access",
                  onclick = "window.pointToElement('#qc_pca_tab-useImputation', 'plot_controls', '1. Data processing and PCA', event);",
                  title = "Configure Missing Value Imputation (QRILC)",
                  icon("wand-magic-sparkles"), "Missing Values (QRILC)"
                )
              ),
              card(
                card_header(
                  class = "d-flex justify-content-between align-items-center",
                  "Normalization Diagnostics",
                  tags$div(
                    downloadButton(ns("downloadBoxplotAfter"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                  )
                ),
                card_body(
                  plotOutput(ns("boxplotAfterNorm"), height="600px"),
                  get_journal_caption("qc")
                )
              )
           ),
           nav_panel("Outliers Detection",
              div(
                class = "quick-access-strip mb-2.5 mt-2",
                tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                tags$button(
                  type = "button",
                  class = "btn-quick-access",
                  onclick = "$('#qc_pca_tab-openOutlierManager').click();",
                  title = "Open modal to process, flag, or remove outlier samples",
                  icon("wand-magic-sparkles"), tags$strong("Process Outlier Risks")
                ),
                tags$button(
                  type = "button",
                  class = "btn-quick-access",
                  onclick = "$('#qc_pca_tab-outlierScope').focus();",
                  title = "Toggle outlier scope between Global and Within Group",
                  icon("globe"), "Context Scope (Global / Group)"
                ),
                tags$button(
                  type = "button",
                  class = "btn-quick-access",
                  onclick = "$('#qc_pca_tab-outlierThreshold').focus();",
                  title = "Adjust MAD risk threshold for flagging outlier samples",
                  icon("triangle-exclamation"), "MAD Risk Threshold"
                ),
                tags$button(
                  type = "button",
                  class = "btn-quick-access",
                  onclick = "$('#qc_pca_tab-outlierNumShow').focus();",
                  title = "Adjust number of sample cards displayed in outlier diagnostic view",
                  icon("arrow-down-1-9"), "Samples Displayed"
                )
              ),
              card(
                card_header(
                  class = "d-flex justify-content-between align-items-center",
                  tags$div(style="flex-grow: 1; margin-right: 20px;",
                    layout_columns(
                      selectInput(ns("outlierScope"), tags$span("Context Scope:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Global compares all samples together to detect outliers. Within Group compares samples only against their specific biological replicates.")), choices = c("Overall / Global" = "global", "Within Group" = "group"), selected = "global"),
                      numericInput(ns("outlierThreshold"), tags$span("MAD Threshold (Risk):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Sets the number of Median Absolute Deviations used to flag outliers.")), value = 2.5, min = 1, step = 0.5),
                      sliderInput(ns("outlierNumShow"), "Samples Displayed:", min = 0, max = 30, value = 30, step = 1)
                    )
                  ),
                  tags$div(
                    downloadButton(ns("downloadOutlierPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                  )
                ),
                card_body(
                  layout_columns(col_widths = c(12),
                    actionButton(ns("openOutlierManager"), "Process Outlier Risks...", icon = icon("wand-magic-sparkles"), class = "btn-warning w-100"),
                    uiOutput(ns("outlierRecapUI"))
                  ),
                  div(style = "max-height: 600px; overflow-y: auto; overflow-x: hidden; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: white;",
                      plotOutput(ns("outlierPlot"), height = "auto")
                  )
                )
              )
           ),
           nav_panel("PCA Score Plots",
             div(
               class = "quick-access-strip mb-2.5 mt-2",
               tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-mergeReplicatesMode', 'plot_controls', '0. Sample Grouping & Nomenclature', event);",
                 title = "Toggle Grouping Mode between Merged Samples and Single Replicates",
                 icon("users-viewfinder"), tags$strong("Grouping: Merged / Single")
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-pcaMode', 'plot_controls', '1. Data processing and PCA', event);",
                 title = "Switch PCA Mode between Individual Lipids and Aggregated Classes",
                 icon("chart-pie"), tags$strong("PCA Mode (Lipids / Classes)")
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-smartLabelPCA2D', 'plot_controls', '2D Smart Labeling (ggrepel)', event);",
                 title = "Toggle and customize ggrepel 2D smart label collision avoidance",
                 icon("tags"), "2D Smart Labeling (ggrepel)"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-shapeGrouping', 'plot_controls', 'PCA Score Plot', event);",
                 title = "Assign point shapes to samples by metadata grouping in sidebar",
                 icon("shapes"), "Sample Shape Grouping"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-showLabels3D', 'plot_controls', 'Plot Styling', event);",
                 title = "Toggle sample labels on 3D score plot",
                 icon("cube"), "3D Plot Labels"
               )
             ),
             navset_card_tab(
               nav_panel("2D Score Plot", 
                 card(
                   card_header(
                     class = "d-flex justify-content-between align-items-center",
                     "2D Score Plot",
                     tags$div(
                       downloadButton(ns("downloadPCA2Dpdf"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                     )
                   ),
                   card_body(
                     uiOutput(ns("pca_fallback_alert")),
                     plotOutput(ns("pca2dPlot"), height="600px"),
                     get_journal_caption("pca")
                   )
                 )
               ),
               nav_panel("3D Score Plot", 
                 card(
                   card_header(
                     class = "d-flex justify-content-between align-items-center",
                     "3D Score Plot",
                     tags$div(
                       downloadButton(ns("downloadPCA3Dpdf"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                     )
                   ),
                   card_body(
                     uiOutput(ns("pca3d_fallback_alert")),
                     plotlyOutput(ns("pca3dPlot"), height="600px"),
                     get_journal_caption("pca")
                   )
                 )
               )
             )
           ),
           nav_panel("PCA Loading Plots",
             div(
               class = "quick-access-strip mb-2.5 mt-2",
               tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-pcaMode', 'plot_controls', '1. Data processing and PCA', event);",
                 title = "Switch PCA Loading mode between Individual Lipids and Aggregated Classes",
                 icon("chart-pie"), tags$strong("PCA Mode (Lipids / Classes)")
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-showSingleLipidNames', 'plot_controls', 'PCA Loading Plots', event);",
                 title = "Toggle single lipid name display in PCA loading plots",
                 icon("font"), "Single Lipid Name Display"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-smartLabelLoad2D', 'plot_controls', '2D Smart Labeling (ggrepel)', event);",
                 title = "Toggle and customize ggrepel 2D smart label collision avoidance for loadings",
                 icon("tags"), "Loadings Smart Labeling"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-loadMarkerSize2D', 'plot_controls', 'Plot Styling', event);",
                 title = "Adjust marker dot size and label font size in Plot Styling accordion",
                 icon("ruler-combined"), "Plot Styling & Marker Sizes"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-showLabels3D', 'plot_controls', 'Plot Styling', event);",
                 title = "Toggle labels on 3D loading plot",
                 icon("cube"), "3D Plot Labels"
               )
             ),
             navset_card_tab(
               nav_panel("2D Loading Plot", 
                 card(
                   card_header(
                     class = "d-flex justify-content-between align-items-center",
                     "2D Loading Plot",
                     tags$div(
                       downloadButton(ns("downloadLoad2Dpdf"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                     )
                   ),
                   card_body(
                     uiOutput(ns("pca_load_fallback_alert")),
                     plotOutput(ns("load2dPlot"), height="600px"),
                     get_journal_caption("pca")
                   )
                 )
               ),
               nav_panel("3D Loading Plot", 
                 card(
                   card_header(
                     class = "d-flex justify-content-between align-items-center",
                     "3D Loading Plot",
                     tags$div(
                       downloadButton(ns("downloadLoad3Dpdf"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                     )
                   ),
                   card_body(
                     uiOutput(ns("pca_load3d_fallback_alert")),
                     plotlyOutput(ns("load3dPlot"), height="600px"),
                     get_journal_caption("pca")
                   )
                 )
               )
             )
           ),
           nav_panel("Sample Correlation", 
             div(
               class = "quick-access-strip mb-2.5 mt-2",
               tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-corrMethod', 'plot_controls', 'Sample Correlation', event);",
                 title = "Select Pearson or Spearman correlation coefficient",
                 icon("chart-line"), tags$strong("Correlation Metric")
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-corrCluster', 'plot_controls', 'Sample Correlation', event);",
                 title = "Toggle hierarchical clustering of correlation matrix",
                 icon("diagram-project"), "Hierarchical Clustering"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-mergeReplicatesMode', 'plot_controls', '0. Sample Grouping & Nomenclature', event);",
                 title = "Toggle between merged sample cohorts and individual replicates",
                 icon("users-viewfinder"), "Merged Samples / Replicates"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-corrLabelSize', 'plot_controls', 'Sample Correlation', event);",
                 title = "Adjust label font size on correlation heatmap",
                 icon("text-height"), "Sample Label Size"
               )
             ),
             card(
               card_header(
                 class = "d-flex justify-content-between align-items-center",
                 "Sample-Sample Correlation Matrix",
                 tags$div(
                   downloadButton(ns("downloadSampleCorrCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                   downloadButton(ns("downloadSampleCorrPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                 )
               ),
               card_body(
                 uiOutput(ns("corr_fallback_alert")),
                 jqui_resizable(plotOutput(ns("sampleCorrPlot"), height="600px")),
                 get_journal_caption("pca")
               )
             )
           ),
           nav_panel("BQC CoV Analysis",
             div(
               class = "quick-access-strip mb-2.5 mt-2",
               tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "$('#qc_pca_tab-openBqcFilterManager').click();",
                 title = "Review and manage high-variance lipid species exceeding CoV cutoff",
                 icon("filter"), tags$strong("Review High-Variance Lipids")
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "$('#qc_pca_tab-bqcPattern').focus();",
                 title = "Pattern used to auto-detect Batch Quality Control (BQC) technical replicates",
                 icon("fingerprint"), "BQC Auto-Detect Pattern"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "$('#qc_pca_tab-bqcCovThreshold').focus();",
                 title = "Set maximum acceptable Coefficient of Variation (typically 20% or 30%)",
                 icon("sliders"), "CoV Threshold Cutoff (%)"
               ),
               tags$button(
                 type = "button",
                 class = "btn-quick-access",
                 onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
                 title = "Inspect normalization pipeline in sidebar",
                 icon("scale-balanced"), "Normalization Method"
               )
             ),
             card(
              card_header(
                class = "d-flex justify-content-between align-items-center",
                "Batch Quality Control (BQC) CoV Precision Analysis",
                tags$div(
                  downloadButton(ns("downloadBqcPdf"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                )
              ),
              card_body(
                layout_columns(
                  col_widths = c(4, 8),
                  # Controls
                  card(
                    card_body(
                      textInput(ns("bqcPattern"), tags$span("BQC Auto-Detect Pattern:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "A text string used to auto-select columns. For example, 'BQC' will match 'BQC_1', 'BQC_2', etc.")), value = "BQC"),
                      p(class="text-muted small mb-2", "Searches sample names for this string to auto-select BQC columns."),
                      uiOutput(ns("bqcSamplesSelectorUI")),
                      hr(),
                      sliderInput(ns("bqcCovThreshold"), tags$span("Acceptable CoV Threshold (%):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Maximum Coefficient of Variation allowed for a lipid. Typical scientific thresholds are 20% or 30%.")), min = 5, max = 50, value = 20, step = 1),
                      checkboxInput(ns("filterBqcOutliers"), tags$span(tags$strong("Filter out high-variance lipids globally", style="color: #dc3545;"), bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #dc3545; cursor: pointer;"), "Globally removes all lipid species that exceed the CoV threshold from all modules (PCA, Volcano, Heatmap, etc.) to ensure data precision.")), value = FALSE),
                      p(class="text-muted small mb-2", "Excludes lipids exceeding the CoV threshold from PCA, Volcano Plots, Heatmaps, and other downstream modules."),
                      actionButton(ns("openBqcFilterManager"), "See high variance lipids...", icon = icon("filter"), class = "btn-warning w-100")
                    )
                  ),
                  # Main Display
                  div(
                    uiOutput(ns("bqcMetricsSummaryUI")),
                    hr(),
                    navset_card_tab(
                      id = ns("bqc_display_tabs"),
                      nav_panel("CoV Density",
                        h6("CoV Distribution across Lipids", class="fw-bold text-secondary mb-2 mt-2"),
                        plotOutput(ns("bqcPlot"), height="350px"),
                        get_journal_caption("bqc")
                      ),
                      nav_panel("Sample Deviation (Outlier Check)",
                        h6("Mean Absolute Deviation (MAD) from Consensus BQC Profile", class="fw-bold text-secondary mb-2 mt-2"),
                        p(class="text-muted small", "Shows the average difference of each BQC sample from the BQC average profile. Higher bars highlight potentially anomalous BQC runs (outliers)."),
                        plotOutput(ns("bqcDeviationPlot"), height="350px")
                      ),
                      nav_panel("Sample Abundance",
                        h6("Total Abundance across BQC Samples", class="fw-bold text-secondary mb-2 mt-2"),
                        p(class="text-muted small", "Monitors injection volume consistency. Replicates should show comparable total abundance profiles."),
                        plotOutput(ns("bqcAbundancePlot"), height="350px")
                      ),
                      nav_panel("Filtered Lipids",
                        h6("Lipids Excluded Globally by Precision Filter", class="fw-bold text-secondary mb-2 mt-2"),
                        p(class="text-muted small", "The following lipids are currently excluded from downstream analysis due to high CoV variance:"),
                        DT::dataTableOutput(ns("bqcFilteredTable"))
                      ),
                      nav_panel("Lipid Precision Table",
                        h6("Lipid Precision Metrics Details", class="fw-bold text-secondary mb-2 mt-2"),
                        DT::dataTableOutput(ns("bqcTable"))
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    ), options = list(handles = "s, se"))
    )
  )
}

