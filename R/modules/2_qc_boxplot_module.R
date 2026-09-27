# R/modules/2_qc_boxplot_module.R
# QC boxplots and PCA plots.

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
                          selected = "merged"),
             hr(),
             radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                          choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                          selected = "short")
           ),
           accordion_panel("1. Data processing and PCA", icon = icon("cogs"),
             selectInput(ns("normalizationMethod"), tags$span("Normalization Method:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Adjusts values to remove experimental bias between samples. TIC scales values relative to the sample total; Median aligns sample medians; PQN uses probabilistic quotient scaling.")),
                         choices = c("Median (Log Scale)" = "median", "PQN (Linear Scale)" = "pqn", "None" = "none"),
                         selected = "median"),
             radioButtons(ns("pcaMode"), "PCA Analysis Mode (Loading Plot):",
                          choices = c("Individual Lipids" = "omics",
                                      "Aggregated Classes" = "class"),
                          selected = "class"),
             conditionalPanel(
               condition = "input.pcaMode == 'omics'", ns = ns,
               p("⚠️ Note: Computing PCA on individual lipids can take longer. Labels on the Loading Plot will be pre-disabled to maintain legibility and performance.", class="text-warning small")
             ),
             hr(),
             strong("Missing Value Handling"),
             checkboxInput(ns("useImputation"), tags$span("Impute Missing Values (QRILC)", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Replaces missing NA values (generally corresponding to below mass spectrometry detection thresholds) by simulating low-abundance concentrations.")), value = TRUE),
             checkboxInput(ns("imputeZerosPerFile"), tags$span("For each file, impute all-NA lipids to 0", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Sets missing values to 0 if a lipid is entirely undetected in an uploaded file, prior to the main imputation step.")), value = TRUE),
             checkboxInput(ns("imputeRemainingNAtoZero"), "Final cleanup: Impute any remaining NAs to 0", value = TRUE),
             hr(),
             strong("Data Filtering"),
             checkboxInput(ns("dropMisc"), tags$span("Drop 'Misc' lipids?", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Excludes unclassified or miscellaneous lipid categories from downstream analysis.")), TRUE),
             checkboxInput(ns("dropNonDetected"), "Drop lipids not detected in any sample?", FALSE),
             hr(),
             numericInput(ns("maxPCs"), "Max PCs to compute:", value = 3, min = 2, step = 1)
           ),
           accordion_panel("2. Data Visualization", icon = icon("paint-brush"),
              accordion(
                open = "PCA Score Plot", multiple = TRUE,
                 accordion_panel("PCA Score Plot", icon=icon("users"),
                   strong("Coloring"),
                    checkboxGroupInput(ns("colorGrouping"), "Color Samples By:", 
                                       choices=c("Group1","Group2","TimePoint","PatientNumber"), selected=c("Group1"), inline=TRUE),
                    checkboxGroupInput(ns("labelParts"), "Label content:", 
                                       choices=c("Group1","Group2","Replicate","TimePoint","PatientNumber"), selected=c("Group1"), inline=TRUE),
                   checkboxInput(ns("useCustomColors"), "Override sample colors?", FALSE),
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

qc_boxplot_server <- function(id, shared_data, global_color_map) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    
    SHAPE_CHOICES <- c("Circle"=16, "Square"=15, "Triangle"=17, "Diamond"=18, "Plus"=3, "Cross"=4, "Star"=8)
    
  # Helper for safe fallback
    `%||%` <- function(a, b) if (is.null(a) || length(a) == 0 || (length(a) == 1 && is.na(a))) b else a


  # --- 1. Export Settings to Shared Data ---
    settings_out <- reactive({
      list(
        normalizationMethod = input$normalizationMethod,
        pcaMode = input$pcaMode,
        useImputation = input$useImputation,
        imputeZerosPerFile = input$imputeZerosPerFile,
        imputeRemainingNAtoZero = input$imputeRemainingNAtoZero,
        mergeReplicates = (input$mergeReplicatesMode == "merged"),
        dropMisc = input$dropMisc,
        maxPCs = input$maxPCs,
        
    # Aesthetics for Shared Config
        colorGrouping = input$colorGrouping,
        labelParts = input$labelParts,
        useCustomColors = input$useCustomColors,
        shapeGrouping = input$shapeGrouping,
        useShapes = input$useShapes
      )
    })
    
  # Helper to extract custom colors pattern
    custom_colors_list <- reactive({
      nm <- names(input)
      col_inputs <- nm[grep("^customCol_", nm)]
      vals <- list()
      for(ci in col_inputs) vals[[gsub("customCol_", "", ci, fixed=TRUE)]] <- input[[ci]]
      vals
    })
    
  # Helper to extract custom shapes pattern
    custom_shapes_list <- reactive({
      nm <- names(input)
      shape_inputs <- nm[grep("^customShape_", nm)]
      vals <- list()
      for(si in shape_inputs) vals[[gsub("customShape_", "", si, fixed=TRUE)]] <- input[[si]]
      vals
    })
    
    # Update return to include precise lists
    final_settings <- reactive({
      lst <- settings_out()
      lst$custom_colors <- custom_colors_list()
      lst$custom_shapes <- custom_shapes_list()
      lst$outlierTreatments <- outlierTreatments()
      lst$outlier_trigger <- outlierChangesTrigger()
      lst$filterBqcOutliers <- input$filterBqcOutliers
      lst$bqcPassingLipids <- bqcPassingLipids()
      lst$bqcManualExclusions <- bqcManualExclusions()
      lst
    })
    # Dynamic update of colorGrouping and shapeGrouping based on non-unspecified columns with >1 level
    observe({
      if (isolate(shared_data$is_restoring())) return()
      meta <- shared_data$all_metadata()
      req(meta)
      
      valid_choices <- c()
      if (length(unique(meta$Group1)) > 1 && !all(meta$Group1 == "Unspecified")) valid_choices <- c(valid_choices, "Group1")
      if (length(unique(meta$Group2)) > 1 && !all(meta$Group2 == "Unspecified")) valid_choices <- c(valid_choices, "Group2")
      if (length(unique(meta$TimePoint)) > 1 && !all(meta$TimePoint == "Unspecified")) valid_choices <- c(valid_choices, "TimePoint")
      if (length(unique(meta$PatientNumber)) > 1 && !all(meta$PatientNumber == "Unspecified")) valid_choices <- c(valid_choices, "PatientNumber")
      
      if (length(valid_choices) == 0) valid_choices <- c("Group1")
      
      # Isolate inputs to prevent circular update and infinite loop oscillations
      isolate({
        selected_colors <- if (!is.null(input$colorGrouping)) intersect(input$colorGrouping, valid_choices) else character(0)
        if (length(selected_colors) == 0) selected_colors <- valid_choices[1]
        named_color_choices <- get_metadata_group_named_choices(valid_choices, meta)
        updateCheckboxGroupInput(session, "colorGrouping", choices = named_color_choices, selected = selected_colors, inline = TRUE)
        
        valid_shape_choices <- intersect(valid_choices, c("Group1", "Group2", "TimePoint", "PatientNumber"))
        if (length(valid_shape_choices) == 0) valid_shape_choices <- c("Group2")
        
        selected_shape_choice <- if (!is.null(input$shapeGrouping) && input$shapeGrouping %in% valid_shape_choices) {
          input$shapeGrouping
        } else {
          valid_shape_choices[1]
        }
        named_shape_choices <- get_metadata_group_named_choices(valid_shape_choices, meta)
        updateRadioButtons(session, "shapeGrouping", choices = named_shape_choices, selected = selected_shape_choice, inline = TRUE)
      })
    })

    # Safely handle when user unchecks all boxes for colorGrouping to avoid infinite cycle
    observeEvent(input$colorGrouping, {
      if (isolate(shared_data$is_restoring())) return()
      meta <- shared_data$all_metadata()
      req(meta)
      if (length(input$colorGrouping) == 0) {
        valid_choices <- c()
        if (length(unique(meta$Group1)) > 1 && !all(meta$Group1 == "Unspecified")) valid_choices <- c(valid_choices, "Group1")
        if (length(unique(meta$Group2)) > 1 && !all(meta$Group2 == "Unspecified")) valid_choices <- c(valid_choices, "Group2")
        if (length(unique(meta$TimePoint)) > 1 && !all(meta$TimePoint == "Unspecified")) valid_choices <- c(valid_choices, "TimePoint")
        if (length(unique(meta$PatientNumber)) > 1 && !all(meta$PatientNumber == "Unspecified")) valid_choices <- c(valid_choices, "PatientNumber")
        
        if (length(valid_choices) == 0) valid_choices <- c("Group1")
        updateCheckboxGroupInput(session, "colorGrouping", selected = valid_choices[1])
      }
     }, ignoreNULL = FALSE)
     
     observeEvent(input$pcaMode, {
       if (isolate(shared_data$is_restoring())) return()
       if (input$pcaMode == "omics") {
          updateCheckboxInput(session, "showSingleLipidNames", value = FALSE)
          updateCheckboxInput(session, "smartLabelLoad2D", value = FALSE)
          updateCheckboxInput(session, "showLabels3D", value = FALSE)
       } else {
          updateCheckboxInput(session, "showSingleLipidNames", value = TRUE)
          updateCheckboxInput(session, "smartLabelLoad2D", value = TRUE)
          updateCheckboxInput(session, "showLabels3D", value = TRUE)
       }
     })
     
     observeEvent(input$main_tabs, {
       if (input$main_tabs == "PCA Loading Plots" && input$pcaMode == "omics") {
          showNotification(
            "Rendering loading plot for individual lipids. Plot rendering time may vary. Labels have been pre-disabled for clarity and performance.",
            type = "warning",
            duration = 5
          )
       }
     })

  # --- 2. Aesthetics Logic (Migrated from Shared) ---
  # required master maps from Shared (which depend on Metadata) to render options
  # shared_data$color_maps() exists? Yes, but it needs to be robust.
    
    activeColorMap <- reactive({
      req(shared_data$color_maps(), input$colorGrouping)
      key <- paste(input$colorGrouping, collapse = " & ")
      shared_data$color_maps()[[key]]
    })
    activeShapeMap <- reactive({ req(shared_data$shape_maps(), input$shapeGrouping); shared_data$shape_maps()[[input$shapeGrouping]] })

    activeColorGroupNames <- reactiveVal(character(0))
    observe({
      req(activeColorMap())
      new_names <- names(activeColorMap())
      if (!identical(activeColorGroupNames(), new_names)) {
        activeColorGroupNames(new_names)
      }
    })
    
    activeShapeGroupNames <- reactiveVal(character(0))
    observe({
      req(activeShapeMap())
      new_names <- names(activeShapeMap())
      if (!identical(activeShapeGroupNames(), new_names)) {
        activeShapeGroupNames(new_names)
      }
    })

    output$customColorUI <- renderUI({
      req(isTRUE(input$useCustomColors))
      group_names <- activeColorGroupNames()
      validate(need(length(group_names) > 0, "No groups for custom colors."))
      colors <- isolate(activeColorMap())
      lapply(group_names, function(g) {
        raw_id <- paste0("customCol_", gsub("\\s|&", "_", g))
        saved_val <- shared_data$get_restored_input(session$ns(raw_id), colors[[g]])
        colourInput(session$ns(raw_id), paste("Color for", g), value = saved_val)
      })
    })
    output$customShapeUI <- renderUI({
      req(isTRUE(input$useShapes))
      group_names <- activeShapeGroupNames()
      validate(need(length(group_names) > 0, "No groups for custom shapes."))
      shapes <- isolate(activeShapeMap())
      lapply(group_names, function(g) {
        raw_id <- paste0("customShape_", gsub("\\s|&", "_", g))
        saved_val <- shared_data$get_restored_input(session$ns(raw_id), shapes[[g]])
        selectInput(session$ns(raw_id), paste("Shape for", g), choices = SHAPE_CHOICES, selected = saved_val)
      })
    })
    
    local_class_colors <- reactive({
      req(shared_data$class_color_map())
      cols <- shared_data$class_color_map()
      if (input$classLabelFormat == "full") {
        names(cols) <- get_full_class_name(names(cols))
      } else {
        names(cols) <- get_short_class_name(names(cols))
      }
      cols
    })


    plot_dims <- reactiveValues(
      pca2d=list(width=960, height=768), pca3d=list(width=960, height=720), 
      load2d=list(width=960, height=768), load3d=list(width=960, height=720),
      boxplot_after=list(width=600, height=500),
      sample_corr=list(width=960, height=768)
    )
    observeEvent(input$pca2dPlot_size, { plot_dims$pca2d <- input$pca2dPlot_size })
    observeEvent(input$pca3dPlot_size, { plot_dims$pca3d <- input$pca3dPlot_size })
    observeEvent(input$load2dPlot_size, { plot_dims$load2d <- input$load2dPlot_size })
    observeEvent(input$load3dPlot_size, { plot_dims$load3d <- input$load3dPlot_size })
    observeEvent(input$sampleCorrPlot_size, { plot_dims$sample_corr <- input$sampleCorrPlot_size })

    observeEvent(input$boxplotAfterNorm_size, { plot_dims$boxplot_after <- input$boxplotAfterNorm_size })

    prepare_boxplot_data <- function(data_df, metadata) {
      cols_to_select <- intersect(c("FullName", "DisplayLabel", "Group1"), colnames(metadata))
      data_df %>%
        tidyr::pivot_longer(cols = -Lipid_Name, names_to = "FullName", values_to = "Intensity") %>%
        dplyr::left_join(metadata %>% dplyr::select(all_of(cols_to_select)), by = "FullName")
    }
    data_pre_processed <- reactive({
        req(shared_data$rawData()$data, shared_data$selected_cols())
        raw_data_list <- shared_data$rawData(); useCols <- shared_data$selected_cols()
        df <- raw_data_list$data %>% dplyr::select(Lipid_Name, all_of(useCols))
        
    # --- Restore Imputation Logic ---
        impute_zeros <- function(df, cols_to_check) {
          if(is.null(cols_to_check)) return(df)
          cols_present <- intersect(names(df), cols_to_check)
          if (length(cols_present) > 0) {
            rows_all_na <- rowSums(is.na(df[, cols_present, drop=FALSE])) == length(cols_present)
            df[rows_all_na, cols_present] <- 0
          }
          return(df)
        }
        
        if (isTRUE(input$imputeZerosPerFile)) {
          for (cols_in_file in raw_data_list$file_cols) {
            df <- impute_zeros(df, cols_in_file)
          }
        }
        
    # Apply Global Filters
        f_lipids <- shared_data$global_filtered_lipids()
        if(!is.null(f_lipids)) { df <- df %>% dplyr::filter(Lipid_Name %in% f_lipids) }
        df
    })

    boxplotAfterPlotObj <- reactive({
      req(input$main_tabs == "Normalization Check")
      req(shared_data$data_processed()); metadata <- shared_data$all_metadata()
      df_processed <- shared_data$data_processed()
      
   # Apply Global Filters
      f_lipids <- shared_data$global_filtered_lipids()
      if(!is.null(f_lipids)) { df_processed <- df_processed %>% dplyr::filter(Lipid_Name %in% f_lipids) }
      
      df_log <- df_processed %>% dplyr::mutate(across(where(is.numeric), ~log2(. + 1)))
      plot_data <- prepare_boxplot_data(df_log, metadata)
      x_col <- if ("DisplayLabel" %in% colnames(plot_data)) "DisplayLabel" else "FullName"
      ggplot(plot_data, aes(x = .data[[x_col]], y = Intensity, fill = Group1)) +
        geom_boxplot(outlier.shape = NA) + labs(x = NULL, y = "Log2(Intensity + 1)") +
        theme_bw(base_size = 12) +
        coord_cartesian(ylim = quantile(plot_data$Intensity, c(0.01, 0.99), na.rm = TRUE)) +
        theme(axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5))
    })

    output$boxplotAfterNorm <- renderPlot({ boxplotAfterPlotObj() })
    
    outlierScores <- reactive({
      req(plot_data(), input$outlierScope, input$outlierThreshold)
      scores <- if (!is.null(plot_data()$replicate_scores)) plot_data()$replicate_scores else plot_data()$scores
      
      # Define true Biological Group1 Group to accurately map intra-condition replicates
      if ("Group2" %in% names(scores) && length(unique(scores$Group2)) > 1) {
          scores$Group1Group <- paste(scores$Group1, scores$Group2, sep=" - ")
      } else {
          scores$Group1Group <- scores$Group1
      }
      
      if (!"PC2" %in% names(scores)) {
         scores$Centroid_PC1 <- mean(scores$PC1)
         scores$Distance <- 0
         scores$Z_Score <- 0
         scores$Is_Outlier <- factor("Normal", levels = c("Normal", "Outlier Risk"))
         scores$ReplicateName <- if ("DisplayLabel" %in% names(scores)) {
              scores$DisplayLabel
         } else if ("Replicate" %in% names(scores)) {
              if (input$outlierScope == "global") paste(scores$Group1Group, scores$Replicate, sep=" | Rep ") else as.character(scores$Replicate)
         } else {
              scores$FullName
         }
         if (any(duplicated(scores$ReplicateName))) {
           scores$ReplicateName <- ave(seq_along(scores$ReplicateName), scores$ReplicateName, FUN = function(idx) {
             if (length(idx) == 1) return(scores$ReplicateName[idx])
             fns <- scores$FullName[idx]
             reps <- sub("^.*[._-]([0-9]+|[rR][0-9]+|[rR]ep[0-9]+)$", "\\\\1", fns)
             if (length(unique(reps)) == length(idx) && !any(reps == fns)) {
               paste0(scores$ReplicateName[idx], "_", reps)
             } else {
               paste0(scores$ReplicateName[idx], "_", seq_along(idx))
             }
           })
         }
         return(scores)
      }
      
      # Determine centroid
      if (input$outlierScope == "group") {
         centroids <- scores %>% dplyr::group_by(Group1Group) %>% 
                      dplyr::summarise(Centroid_PC1 = mean(PC1), Centroid_PC2 = mean(PC2), .groups="drop")
         scores <- scores %>% dplyr::left_join(centroids, by="Group1Group")
      } else {
         scores$Centroid_PC1 <- mean(scores$PC1)
         scores$Centroid_PC2 <- mean(scores$PC2)
      }
      
      # Calculate Euclidean distance in PC1/PC2 space
      scores <- scores %>% dplyr::mutate(Distance = sqrt((PC1 - Centroid_PC1)^2 + (PC2 - Centroid_PC2)^2))
      
      # Z-score of distance (using pooled MAD for robustness across all replicates to avoid n=3 mathematical instability)
      med_dist <- median(scores$Distance, na.rm=TRUE)
      mad_dist <- mad(scores$Distance, na.rm=TRUE)
      if(mad_dist == 0) mad_dist <- 1e-6
      
      scores <- scores %>% dplyr::mutate(
          Z_Score = (Distance - med_dist) / mad_dist,
          Is_Outlier = ifelse(Z_Score > input$outlierThreshold, "Outlier Risk", "Normal")
      )
      
      scores$Is_Outlier <- factor(scores$Is_Outlier, levels = c("Normal", "Outlier Risk"))
      
      # Clean labels to show actual Replicate name cleanly and guarantee uniqueness per sample
      scores$ReplicateName <- if ("DisplayLabel" %in% names(scores)) {
           scores$DisplayLabel
      } else if ("Replicate" %in% names(scores)) {
           if (input$outlierScope == "global") paste(scores$Group1Group, scores$Replicate, sep=" | Rep ") else as.character(scores$Replicate)
      } else {
           scores$FullName
      }
      
      # Disambiguate duplicate ReplicateName so every sample has its own distinct bar
      if (any(duplicated(scores$ReplicateName))) {
        scores$ReplicateName <- ave(seq_along(scores$ReplicateName), scores$ReplicateName, FUN = function(idx) {
          if (length(idx) == 1) return(scores$ReplicateName[idx])
          fns <- scores$FullName[idx]
          reps <- sub("^.*[._-]([0-9]+|[rR][0-9]+|[rR]ep[0-9]+)$", "\\\\1", fns)
          if (length(unique(reps)) == length(idx) && !any(reps == fns)) {
            paste0(scores$ReplicateName[idx], "_", reps)
          } else {
            paste0(scores$ReplicateName[idx], "_", seq_along(idx))
          }
        })
      }
      
      scores
    })

    outlierScoresFiltered <- reactive({
      scores <- outlierScores()
      N <- if (!is.null(input$outlierNumShow)) input$outlierNumShow else min(30, nrow(scores))
      
      if (N < nrow(scores)) {
         S_outlier <- scores %>% dplyr::filter(Is_Outlier == "Outlier Risk")
         S_normal <- scores %>% dplyr::filter(Is_Outlier == "Normal")
         
         num_outliers <- nrow(S_outlier)
         if (num_outliers >= N) {
            scores_disp <- S_outlier %>% dplyr::arrange(desc(Distance)) %>% head(N)
         } else {
            R <- N - num_outliers
            S_normal_sorted <- S_normal %>% dplyr::arrange(Distance)
            num_normals <- nrow(S_normal_sorted)
            if (num_normals <= R) {
               scores_disp <- rbind(S_outlier, S_normal_sorted)
            } else {
               R1 <- ceiling(R / 2)
               R2 <- floor(R / 2)
               normals_low <- head(S_normal_sorted, R2)
               normals_high <- tail(S_normal_sorted, R1)
               scores_disp <- rbind(S_outlier, normals_low, normals_high)
            }
         }
         scores <- scores_disp %>% dplyr::distinct(FullName, .keep_all = TRUE)
      }
      scores
    })
    
    observe({
      req(outlierScores())
      total_samples <- nrow(outlierScores())
      updateSliderInput(session, "outlierNumShow", max = total_samples, value = min(30, total_samples))
    })

    outlierPlotObj <- reactive({
      req(input$main_tabs == "Outliers Detection")
      scores <- outlierScoresFiltered()
      req(scores)
      
      # Calculate med_dist and mad_dist from the global (unfiltered) scores to keep threshold line accurate
      global_scores <- outlierScores()
      med_dist <- median(global_scores$Distance, na.rm=TRUE)
      mad_dist <- mad(global_scores$Distance, na.rm=TRUE)
      if(mad_dist == 0) mad_dist <- 1e-6
      thresh_line <- med_dist + input$outlierThreshold * mad_dist
      
      p <- ggplot(scores, aes(x = reorder(ReplicateName, Distance), y = Distance, fill = Is_Outlier)) +
        geom_col(position = "identity", color = "black", width = 0.7) +
        geom_hline(yintercept = thresh_line, linetype="dashed", color="red", linewidth = 1) +
        scale_fill_manual(values = c("Normal" = "#4E79A7", "Outlier Risk" = "#E15759"), drop=FALSE) +
        coord_flip() +
        labs(title = paste("Outlier Risk Analysis (", ifelse(input$outlierScope=="global", "Global Scope", "Intra-Group1 Scope"), ")"),
             x = "Samples", y = "Euclidean Distance from Centroid (PC1 & PC2)") +
        theme_bw(base_size = 14) +
        theme(panel.grid.major.y = element_blank(), legend.position = "bottom", legend.title = element_blank())
        
      if (input$outlierScope == "group") {
         # Facet by condition to show replicates WITHIN their condition context
         p <- p + facet_wrap(~Group1Group, scales="free_y", ncol = 1) +
                  theme(strip.background = element_rect(fill="#f8f9fa", color="black"), 
                        strip.text = element_text(face="bold"))
      }
      return(p)
    })
    
    outlierPlotHeight <- reactive({
      req(outlierScoresFiltered())
      N <- nrow(outlierScoresFiltered())
      max(400, N * 20)
    })
    
    output$outlierPlot <- renderPlot({ 
      outlierPlotObj() 
    }, height = function() { 
      outlierPlotHeight() 
    })
    
    output$downloadOutlierPDF <- downloadHandler(
      filename = function() { paste0("Outliers_Detection_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        N <- nrow(outlierScoresFiltered())
        pdf(file, width = 10, height = max(6, N * 0.25))
        print(outlierPlotObj())
        dev.off()
      }
    )
    
    # --- OUTLIERS RESOLUTION AND TREATMENT SYSTEM ---
    outlierTreatments <- reactiveVal(list())
    tempOutlierTreatments <- reactiveVal(list())
    outlierChangesTrigger <- reactiveVal(0)
    
    # Observe and apply restored outlier treatments
    observe({
      treats <- shared_data$restored_outlier_treatments()
      if (!is.null(treats) && length(treats) > 0) {
        outlierTreatments(treats)
      }
    })
    
    # Prune treatments when a new raw dataset is loaded, discarding columns that no longer exist
    observeEvent(shared_data$rawData(), {
      raw_cols <- isolate(shared_data$all_numeric_columns())
      if (is.null(raw_cols)) return()
      current <- isolate(outlierTreatments())
      if (length(current) == 0) return()
      
      valid_treats <- current[names(current) %in% raw_cols]
      if (!identical(names(valid_treats), names(current))) {
        outlierTreatments(valid_treats)
      }
    }, ignoreInit = TRUE)

    
    # Open Modal Observer
    observeEvent(input$openOutlierManager, {
      req(outlierScores())
      tempOutlierTreatments(outlierTreatments())
      
      showModal(modalDialog(
        title = div(class = "d-flex align-items-center justify-content-between",
                    tags$h4(class = "modal-title fw-bold text-primary", 
                            icon("wand-magic-sparkles"), " Outlier Risk Processor & PCA Visualizer")),
        size = "xl",
        easyClose = TRUE,
        footer = tagList(
          actionButton(ns("resetAndReinitiateModal"), "Reset All to Normal & Reinitiate", icon = icon("rotate-left"), class = "btn-outline-danger me-auto"),
          actionButton(ns("applyOutlierChanges"), "Confirm Outlier Risks Processing", icon = icon("check"), class = "btn-success px-4"),
          modalButton("Cancel")
        ),
        layout_columns(
          col_widths = c(5, 7),
          card(
            card_header("PCA Score Plot (Outlier Risks Highlighted)"),
            card_body(
              uiOutput(ns("outlier_pca_fallback_alert")),
              plotOutput(ns("outlierPcaPlot"), height = "480px")
            )
          ),
          card(
            card_header(
              div(class = "d-flex justify-content-between align-items-center flex-wrap gap-2",
                tags$span("Categorize Treatments"),
                div(class = "d-flex gap-1 align-items-center",
                  tags$span(class = "text-muted small me-1", "Batch:"),
                  tags$button(type = "button", class = "btn btn-xs btn-outline-secondary", onclick = "handleBatchOutlierSelect('keep')", icon("check"), " All Keep"),
                  tags$button(type = "button", class = "btn btn-xs btn-outline-warning", onclick = "handleBatchOutlierSelect('average')", icon("calculator"), " All Average"),
                  tags$button(type = "button", class = "btn btn-xs btn-outline-danger", onclick = "handleBatchOutlierSelect('remove')", icon("trash-can"), " All Remove")
                )
              )
            ),
            card_body(
              div(style = "max-height: 480px; overflow-y: auto; padding-right: 5px;",
                  uiOutput(ns("outlierSelectorRowsUI"))
              )
            )
          )
        ),
        hr(),
        card(
          card_header("Treatment Recap"),
          card_body(
            uiOutput(ns("modalRecapUI"))
          )
        )
      ))
    })
    # Helper to generate standard HTML checkboxes styled as bootstrap form checks
    make_chk <- function(type, label, name, is_checked, input_id) {
      chk <- tags$input(
        type = "checkbox",
        class = paste0("form-check-input me-1 chk-", type),
        onclick = sprintf("handleOutlierCheck(this, '%s', '%s', '%s')", name, type, input_id)
      )
      if (is_checked) chk$attribs$checked <- "checked"
      tags$label(
        class = "form-check-label d-flex align-items-center fw-normal small me-3",
        style = "cursor: pointer; user-select: none;",
        chk,
        label
      )
    }

    # Generate dynamic UI selector rows for each flagged outlier and active treatment
    output$outlierSelectorRowsUI <- renderUI({
      req(outlierScores())
      scores <- outlierScores()
      treats <- isolate(tempOutlierTreatments())
      meta <- tryCatch(shared_data$allParsedMetadata(), error = function(e) NULL)
      if (is.null(meta)) meta <- tryCatch(shared_data$all_metadata(), error = function(e) NULL)
      
      flagged_rows <- scores %>% 
        dplyr::filter(Is_Outlier == "Outlier Risk")
      
      # Also include samples with active treatments (remove or average) even if no longer flagged
      treated_names <- names(treats)[sapply(names(treats), function(nm) treats[[nm]] %in% c("remove", "average"))]
      additional_names <- setdiff(treated_names, flagged_rows$FullName)
      
      additional_rows <- list()
      if (length(additional_names) > 0) {
        for (aname in additional_names) {
          score_match <- scores %>% dplyr::filter(FullName == aname)
          if (nrow(score_match) > 0) {
            rep_name <- score_match$ReplicateName[1]
            dist_val <- score_match$Distance[1]
          } else {
            rep_name <- aname
            if (!is.null(meta) && "FullName" %in% names(meta)) {
              sub_m <- meta[meta$FullName == aname, , drop = FALSE]
              if (nrow(sub_m) > 0 && "ReplicateName" %in% names(sub_m) && !is.na(sub_m$ReplicateName[1])) {
                rep_name <- sub_m$ReplicateName[1]
              }
            }
            dist_val <- NA_real_
          }
          additional_rows[[length(additional_rows) + 1]] <- tibble::tibble(
            FullName = aname,
            ReplicateName = rep_name,
            Distance = dist_val,
            Is_Outlier = factor("Normal", levels = c("Normal", "Outlier Risk"))
          )
        }
      }
      
      all_rows <- if (length(additional_rows) > 0) {
        bind_rows(flagged_rows %>% dplyr::select(FullName, ReplicateName, Distance, Is_Outlier), 
                  bind_rows(additional_rows))
      } else {
        flagged_rows %>% dplyr::select(FullName, ReplicateName, Distance, Is_Outlier)
      }
      
      if (nrow(all_rows) == 0) {
        return(div(class = "text-muted p-4 text-center", 
                   tags$i(class = "fa-regular fa-face-smile me-2"), 
                   "No outlier risks detected in the current scope."))
      }
      
      all_rows$has_active_treat <- sapply(all_rows$FullName, function(fn) if (fn %in% names(treats)) treats[[fn]] %in% c("remove", "average") else FALSE)
      all_rows <- all_rows %>% dplyr::arrange(desc(has_active_treat), desc(Distance))
      
      input_id <- session$ns("outlier_treatment_change")
      
      tagList(
        tags$script(HTML("
          function handleOutlierCheck(el, sampleName, type, inputId) {
            var container = el.closest('.outlier-checkbox-container');
            if (!container) return;
            var checkboxes = container.querySelectorAll('input[type=\"checkbox\"]');
            
            if (el.checked) {
              checkboxes.forEach(function(chk) {
                if (chk !== el) chk.checked = false;
              });
              Shiny.setInputValue(inputId, {name: sampleName, value: type}, {priority: 'event'});
            } else {
              // Force 'keep' to be checked if active is unchecked
              checkboxes.forEach(function(chk) {
                if (chk.classList.contains('chk-keep')) {
                  chk.checked = true;
                } else {
                  chk.checked = false;
                }
              });
              Shiny.setInputValue(inputId, {name: sampleName, value: 'keep'}, {priority: 'event'});
            }
          }

          function handleBatchOutlierSelect(type) {
            var containers = document.querySelectorAll('.outlier-checkbox-container');
            containers.forEach(function(container) {
              var targetChk = container.querySelector('.chk-' + type);
              if (targetChk && !targetChk.checked) {
                targetChk.click();
              }
            });
          }
        ")),
        tags$style(HTML("
          .outlier-checkbox-container .form-group {
            margin-bottom: 0 !important;
          }
          .outlier-checkbox-container .checkbox {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
        ")),
        lapply(seq_len(nrow(all_rows)), function(i) {
          row <- all_rows[i, ]
          name <- row$FullName
          label <- row$ReplicateName
          dist_val <- if (!is.na(row$Distance)) round(row$Distance, 3) else NULL
          
          current_choice <- if (name %in% names(treats)) treats[[name]] else "keep"
          
          status_badge <- if (current_choice == "remove") {
            span(class = "badge bg-danger-subtle text-danger-emphasis border border-danger-subtle ms-2", "Excluded / Removed")
          } else if (current_choice == "average") {
            span(class = "badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-2", "Averaged Replicate")
          } else {
            NULL
          }
          
          div(
            class = "border-bottom py-2 mb-2 d-flex align-items-center justify-content-between",
            div(
              tags$strong(label),
              status_badge,
              if (!is.null(dist_val)) span(class = "text-muted ms-2 small", paste0("(Distance: ", dist_val, ")")) else NULL
            ),
            div(
              class = "d-flex gap-1 outlier-checkbox-container",
              make_chk("remove", "Remove", name, current_choice == "remove", input_id),
              make_chk("average", "Average", name, current_choice == "average", input_id),
              make_chk("keep", "Keep", name, current_choice == "keep", input_id)
            )
          )
        })
      )
    })
    
    # Monitor outlier treatment changes sent via JavaScript custom events
    observeEvent(input$outlier_treatment_change, {
      req(input$outlier_treatment_change)
      change <- input$outlier_treatment_change
      name <- change$name
      val <- change$value
      
      curr_treats <- tempOutlierTreatments()
      if (is.null(curr_treats[[name]]) || curr_treats[[name]] != val) {
        curr_treats[[name]] <- val
        tempOutlierTreatments(curr_treats)
      }
    })
    
    # Render interactive PCA plot inside the modal
    output$outlierPcaPlot <- renderPlot({
      pca_res <- shared_data$pca_results(); req(pca_res)
      scores <- if (!is.null(pca_res$replicate_score_df)) pca_res$replicate_score_df else pca_res$score_df
      req(scores)
      if (!"PC2" %in% names(scores)) {
        return(generate_empty_plot_message("At least 2 dimensions/components are required for 2D PCA."))
      }
      
      scores_out <- outlierScores()
      req(scores_out)
      
      # Clean FullName matching by ensuring columns intersect
      common_names <- intersect(scores$FullName, scores_out$FullName)
      req(length(common_names) > 0)
      
      plot_df <- scores %>% 
        dplyr::filter(FullName %in% common_names) %>%
        dplyr::left_join(scores_out %>% dplyr::select(FullName, Is_Outlier, ReplicateName), by = "FullName")
      
      treats <- tempOutlierTreatments()
      plot_df$Treatment <- sapply(plot_df$FullName, function(fn) {
        if (fn %in% names(treats)) treats[[fn]] else "none"
      })
      
      plot_df$DisplayCategory <- mapply(function(is_out, treat) {
        if (treat == "remove") "Outlier (Remove)"
        else if (treat == "average") "Outlier (Average)"
        else if (is_out == "Outlier Risk") {
          if (treat == "keep") "Outlier (Keep)" else "Outlier Risk"
        } else {
          "Normal"
        }
      }, plot_df$Is_Outlier, plot_df$Treatment)
      
      plot_df$DisplayCategory <- factor(plot_df$DisplayCategory, 
                                        levels = c("Normal", "Outlier (Keep)", "Outlier (Average)", "Outlier (Remove)", "Outlier Risk"))
      
      color_map <- c(
        "Normal" = "#4E79A7",
        "Outlier (Keep)" = "#2CA02C",   # Green
        "Outlier (Average)" = "#FF7F0E", # Orange
        "Outlier (Remove)" = "#D62728",   # Red
        "Outlier Risk" = "#E15759"       # Salmon Red
      )
      
      shape_map <- c(
        "Normal" = 16,
        "Outlier (Keep)" = 17,
        "Outlier (Average)" = 15,
        "Outlier (Remove)" = 4,
        "Outlier Risk" = 18
      )
      
      p <- ggplot(plot_df, aes(x = PC1, y = PC2, color = DisplayCategory, shape = DisplayCategory)) +
        geom_point(size = 4) +
        scale_color_manual(values = color_map, drop = FALSE) +
        scale_shape_manual(values = shape_map, drop = FALSE) +
        geom_text_repel(aes(label = ReplicateName), size = 3.5, color = "black", max.overlaps = Inf) +
        geom_hline(yintercept = 0, color = "black", linewidth = 0.4) +
        geom_vline(xintercept = 0, color = "black", linewidth = 0.4) +
        labs(title = "2D PCA Outliers Distribution",
             x = paste0("PC1 (", pca_res$var_PC[1], "%)"),
             y = paste0("PC2 (", pca_res$var_PC[2 %||% 1], "%)")) +
        theme_bw(base_size = 12) +
        theme(panel.grid = element_blank(),
              panel.border = element_rect(colour = "black", fill = NA, linewidth = 1),
              legend.position = "bottom", 
              legend.title = element_blank())
      
      return(p)
    })
    
    # Recap for modal
    output$modalRecapUI <- renderUI({
      treats <- tempOutlierTreatments()
      scores <- outlierScores()
      meta <- tryCatch(shared_data$all_metadata(), error = function(e) NULL)
      
      removed <- list()
      averaged <- list()
      kept <- list()
      
      for (name in names(treats)) {
        act <- treats[[name]]
        label <- scores$ReplicateName[scores$FullName == name]
        if (length(label) == 0 || is.na(label) || label == "") {
          if (!is.null(meta) && "FullName" %in% names(meta)) {
            sub_m <- meta[meta$FullName == name, , drop = FALSE]
            if (nrow(sub_m) > 0 && "ReplicateName" %in% names(sub_m) && !is.na(sub_m$ReplicateName[1])) {
              label <- sub_m$ReplicateName[1]
            } else {
              label <- name
            }
          } else {
            label <- name
          }
        }
        item <- list(name = name, label = label)
        
        if (act == "remove") removed[[name]] <- item
        else if (act == "average") averaged[[name]] <- item
        else if (act == "keep") kept[[name]] <- item
      }
      
      div(class = "p-3 bg-light border rounded small",
          div(style = "margin-bottom: 8px;", 
              tags$strong(class = "text-danger", icon("trash-can"), sprintf(" Excluded/Removed (%d): ", length(removed))), 
              if (length(removed) > 0) {
                div(class = "d-inline-flex flex-wrap gap-1 mt-1",
                  lapply(removed, function(x) span(class = "badge bg-danger-subtle text-danger-emphasis border border-danger-subtle", x$label))
                )
              } else span(class = "text-muted fst-italic", "None")
          ),
          div(style = "margin-bottom: 8px;", 
              tags$strong(class = "text-warning-emphasis", icon("calculator"), sprintf(" Averaged Replicates (%d): ", length(averaged))), 
              if (length(averaged) > 0) {
                div(class = "d-inline-flex flex-wrap gap-1 mt-1",
                  lapply(averaged, function(x) span(class = "badge bg-warning-subtle text-warning-emphasis border border-warning-subtle", x$label))
                )
              } else span(class = "text-muted fst-italic", "None")
          ),
          div(
              tags$strong(class = "text-success", icon("check"), sprintf(" Kept (as Normal) (%d): ", length(kept))), 
              if (length(kept) > 0) {
                div(class = "d-inline-flex flex-wrap gap-1 mt-1",
                  lapply(kept, function(x) span(class = "badge bg-success-subtle text-success-emphasis border border-success-subtle", x$label))
                )
              } else span(class = "text-muted fst-italic", "None")
          )
      )
    })
    
    # Recap for main UI
    recapData <- reactive({
      treats <- outlierTreatments()
      scores <- outlierScores()
      meta <- tryCatch(shared_data$all_metadata(), error = function(e) NULL)
      
      if (length(treats) == 0) {
        return(list(removed = list(), averaged = list(), kept = list(),
                    removed_labels = character(0), averaged_labels = character(0), kept_labels = character(0)))
      }
      
      removed <- list()
      averaged <- list()
      kept <- list()
      
      for (name in names(treats)) {
        act <- treats[[name]]
        label <- scores$ReplicateName[scores$FullName == name]
        if (length(label) == 0 || is.na(label) || label == "") {
          if (!is.null(meta) && "FullName" %in% names(meta)) {
            sub_m <- meta[meta$FullName == name, , drop = FALSE]
            if (nrow(sub_m) > 0 && "ReplicateName" %in% names(sub_m) && !is.na(sub_m$ReplicateName[1])) {
              label <- sub_m$ReplicateName[1]
            } else {
              label <- name
            }
          } else {
            label <- name
          }
        }
        item <- list(name = name, label = label)
        
        if (act == "remove") removed[[name]] <- item
        else if (act == "average") averaged[[name]] <- item
        else if (act == "keep") kept[[name]] <- item
      }
      
      if (length(removed) > 1) {
        ord <- order(sapply(removed, function(x) x$label))
        removed <- removed[ord]
      }
      if (length(averaged) > 1) {
        ord <- order(sapply(averaged, function(x) x$label))
        averaged <- averaged[ord]
      }
      if (length(kept) > 1) {
        ord <- order(sapply(kept, function(x) x$label))
        kept <- kept[ord]
      }
      
      list(
        removed = removed, 
        averaged = averaged, 
        kept = kept,
        removed_labels = if (length(removed) > 0) sapply(removed, function(x) x$label) else character(0),
        averaged_labels = if (length(averaged) > 0) sapply(averaged, function(x) x$label) else character(0),
        kept_labels = if (length(kept) > 0) sapply(kept, function(x) x$label) else character(0)
      )
    })
    
    sorted_uniq <- function(x) {
      if (length(x) == 0) return(character(0))
      sort(unique(x))
    }
    
    output$outlierRecapUI <- renderUI({
      recap <- recapData()
      if (length(recap$removed) == 0 && length(recap$averaged) == 0 && length(recap$kept) == 0) {
        return(NULL)
      }
      
      has_active_treatments <- (length(recap$removed) > 0 || length(recap$averaged) > 0)
      
      card(
        class = "border-warning mt-2 shadow-sm",
        card_header(
          class = "bg-warning-subtle text-warning-emphasis py-2 px-3 d-flex flex-wrap justify-content-between align-items-center gap-2",
          div(
            class = "d-flex align-items-center gap-2",
            icon("triangle-exclamation", class = "text-warning"),
            tags$strong("Outliers Treatment Recap"),
            if (has_active_treatments) {
              tags$span(class = "badge bg-warning text-dark border", paste(length(recap$removed) + length(recap$averaged), "modified"))
            } else {
              tags$span(class = "badge bg-success-subtle text-success border border-success-subtle", "All Normal")
            }
          ),
          div(
            class = "d-flex align-items-center gap-2 flex-wrap",
            if (has_active_treatments) {
              tags$button(
                type = "button",
                class = "btn btn-xs btn-outline-danger d-inline-flex align-items-center gap-1",
                style = "font-size: 0.75rem; padding: 3px 9px; border-radius: 6px; font-weight: 600;",
                onclick = sprintf("Shiny.setInputValue('%s', Math.random(), {priority: 'event'});", session$ns("reset_all_outliers")),
                icon("rotate-left"), " Reset All Treatments & Reinitiate Dataset"
              )
            },
            tags$button(
              type = "button",
              class = "btn btn-xs btn-outline-primary d-inline-flex align-items-center gap-1",
              style = "font-size: 0.75rem; padding: 3px 9px; border-radius: 6px; font-weight: 600;",
              onclick = sprintf("document.getElementById('%s').click();", session$ns("openOutlierManager")),
              icon("sliders"), " Edit in Processor..."
            )
          )
        ),
        card_body(
          class = "p-3 small",
          # Section: Excluded / Removed
          div(
            class = "mb-2",
            div(
              class = "d-flex align-items-center justify-content-between mb-1",
              tags$strong(class = "text-danger", icon("trash-can"), sprintf(" Excluded / Removed (%d):", length(recap$removed))),
              if (length(recap$removed) > 0) {
                tags$button(
                  type = "button",
                  class = "btn btn-link text-danger p-0 text-decoration-none small d-inline-flex align-items-center gap-1",
                  style = "font-size: 0.75rem;",
                  onclick = sprintf("Shiny.setInputValue('%s', Math.random(), {priority: 'event'});", session$ns("cancel_all_removed")),
                  icon("rotate-left"), " Restore All Removed & Reinitiate"
                )
              }
            ),
            if (length(recap$removed) > 0) {
              div(class = "d-flex flex-wrap gap-1 align-items-center mt-1",
                lapply(recap$removed, function(item) {
                  span(
                    class = "badge bg-danger-subtle text-danger-emphasis border border-danger-subtle py-1 px-2 d-inline-flex align-items-center gap-1",
                    style = "font-size: 0.85rem;",
                    item$label,
                    tags$button(
                      type = "button",
                      class = "btn btn-link text-danger p-0 ms-1 fw-bold text-decoration-none",
                      style = "font-size: 1.05rem; line-height: 1; cursor: pointer;",
                      title = paste("Cancel removal for", item$label, "and restore original values"),
                      onclick = sprintf("Shiny.setInputValue('%s', '%s', {priority: 'event'});", session$ns("cancel_single_treatment"), item$name),
                      HTML("&times;")
                    )
                  )
                })
              )
            } else {
              span(class = "text-muted fst-italic", "None")
            }
          ),
          # Section: Averaged Replicates
          div(
            class = "mb-2",
            div(
              class = "d-flex align-items-center justify-content-between mb-1",
              tags$strong(class = "text-warning-emphasis", icon("calculator"), sprintf(" Averaged Replicates (%d):", length(recap$averaged))),
              if (length(recap$averaged) > 0) {
                tags$button(
                  type = "button",
                  class = "btn btn-link text-warning-emphasis p-0 text-decoration-none small d-inline-flex align-items-center gap-1",
                  style = "font-size: 0.75rem;",
                  onclick = sprintf("Shiny.setInputValue('%s', Math.random(), {priority: 'event'});", session$ns("cancel_all_averaged")),
                  icon("rotate-left"), " Cancel All Averaged & Reinitiate"
                )
              }
            ),
            if (length(recap$averaged) > 0) {
              div(class = "d-flex flex-wrap gap-1 align-items-center mt-1",
                lapply(recap$averaged, function(item) {
                  span(
                    class = "badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-1 px-2 d-inline-flex align-items-center gap-1",
                    style = "font-size: 0.85rem;",
                    item$label,
                    tags$button(
                      type = "button",
                      class = "btn btn-link text-danger p-0 ms-1 fw-bold text-decoration-none",
                      style = "font-size: 1.05rem; line-height: 1; cursor: pointer;",
                      title = paste("Cancel averaging for", item$label, "and restore original raw data"),
                      onclick = sprintf("Shiny.setInputValue('%s', '%s', {priority: 'event'});", session$ns("cancel_single_treatment"), item$name),
                      HTML("&times;")
                    )
                  )
                })
              )
            } else {
              span(class = "text-muted fst-italic", "None")
            }
          ),
          # Section: Kept (Normal)
          div(
            tags$strong(class = "text-success", icon("check"), sprintf(" Kept (as Normal) (%d): ", length(recap$kept))),
            if (length(recap$kept) > 0) {
              span(class = "text-success fw-semibold", paste(sapply(recap$kept, function(x) x$label), collapse = ", "))
            } else {
              span(class = "text-muted fst-italic", "None")
            }
          )
        )
      )
    })
    
    # Apply changes observer from modal
    observeEvent(input$applyOutlierChanges, {
      outlierTreatments(tempOutlierTreatments())
      removeModal()
      outlierChangesTrigger(outlierChangesTrigger() + 1)
      showNotification("Outlier treatments applied and analyzed dataset reinitiated!", type = "message")
    })
    
    # Observer: Cancel single sample treatment and reinitiate dataset
    observeEvent(input$cancel_single_treatment, {
      req(input$cancel_single_treatment)
      sample_name <- input$cancel_single_treatment
      curr_treats <- outlierTreatments()
      if (sample_name %in% names(curr_treats)) {
        prev_act <- curr_treats[[sample_name]]
        curr_treats[[sample_name]] <- "keep"
        outlierTreatments(curr_treats)
        tempOutlierTreatments(curr_treats)
        outlierChangesTrigger(outlierChangesTrigger() + 1)
        
        scores <- outlierScores()
        sample_label <- scores$ReplicateName[scores$FullName == sample_name]
        if (length(sample_label) == 0 || is.na(sample_label) || sample_label == "") {
          meta <- tryCatch(shared_data$all_metadata(), error = function(e) NULL)
          if (!is.null(meta) && "FullName" %in% names(meta)) {
            sub_m <- meta[meta$FullName == sample_name, , drop = FALSE]
            if (nrow(sub_m) > 0 && "ReplicateName" %in% names(sub_m) && !is.na(sub_m$ReplicateName[1])) {
              sample_label <- sub_m$ReplicateName[1]
            } else {
              sample_label <- sample_name
            }
          } else {
            sample_label <- sample_name
          }
        }
        act_text <- if (prev_act == "average") "averaging canceled" else "removal canceled"
        showNotification(
          tags$div(
            tags$strong(icon("rotate-left"), " Treatment Canceled: "),
            sprintf("Sample '%s' %s. Analyzed dataset reinitiated with original raw values.", sample_label, act_text)
          ),
          type = "message",
          duration = 4
        )
      }
    })
    
    # Observer: Cancel all averaged replicates and reinitiate dataset
    observeEvent(input$cancel_all_averaged, {
      curr_treats <- outlierTreatments()
      changed <- 0
      for (nm in names(curr_treats)) {
        if (curr_treats[[nm]] == "average") {
          curr_treats[[nm]] <- "keep"
          changed <- changed + 1
        }
      }
      if (changed > 0) {
        outlierTreatments(curr_treats)
        tempOutlierTreatments(curr_treats)
        outlierChangesTrigger(outlierChangesTrigger() + 1)
        showNotification(
          tags$div(
            tags$strong(icon("rotate-left"), " Averaged Samples Canceled: "),
            sprintf("%d averaged sample(s) restored to original raw values. Analyzed dataset reinitiated.", changed)
          ),
          type = "message",
          duration = 5
        )
      }
    })
    
    # Observer: Cancel all removed replicates and reinitiate dataset
    observeEvent(input$cancel_all_removed, {
      curr_treats <- outlierTreatments()
      changed <- 0
      for (nm in names(curr_treats)) {
        if (curr_treats[[nm]] == "remove") {
          curr_treats[[nm]] <- "keep"
          changed <- changed + 1
        }
      }
      if (changed > 0) {
        outlierTreatments(curr_treats)
        tempOutlierTreatments(curr_treats)
        outlierChangesTrigger(outlierChangesTrigger() + 1)
        showNotification(
          tags$div(
            tags$strong(icon("rotate-left"), " Removed Samples Restored: "),
            sprintf("%d removed sample(s) restored to dataset. Analyzed dataset reinitiated.", changed)
          ),
          type = "message",
          duration = 5
        )
      }
    })
    
    # Observer: Reset all outlier treatments and reinitiate dataset
    observeEvent(input$reset_all_outliers, {
      curr_treats <- outlierTreatments()
      if (length(curr_treats) == 0) return()
      for (nm in names(curr_treats)) {
        curr_treats[[nm]] <- "keep"
      }
      outlierTreatments(curr_treats)
      tempOutlierTreatments(curr_treats)
      outlierChangesTrigger(outlierChangesTrigger() + 1)
      showNotification(
        tags$div(
          tags$strong(icon("circle-check"), " Outlier Treatments Reset: "),
          "All outlier treatments removed. Analyzed dataset reinitiated with original raw values."
        ),
        type = "message",
        duration = 5
      )
    })
    
    # Observer: Reset all from inside modal and reinitiate dataset
    observeEvent(input$resetAndReinitiateModal, {
      curr_treats <- outlierTreatments()
      if (length(curr_treats) > 0) {
        for (nm in names(curr_treats)) {
          curr_treats[[nm]] <- "keep"
        }
        outlierTreatments(curr_treats)
        tempOutlierTreatments(curr_treats)
      }
      removeModal()
      outlierChangesTrigger(outlierChangesTrigger() + 1)
      showNotification(
        tags$div(
          tags$strong(icon("circle-check"), " Outlier Treatments Reset: "),
          "All samples reverted to normal (keep). Analyzed dataset reinitiated with original raw values."
        ),
        type = "message",
        duration = 5
      )
    })
    
    # --- END OUTLIERS RESOLUTION ---
    
    plot_data <- reactive({
      res <- shared_data$pca_results(); req(res)
      scores <- res$score_df
      rep_scores <- if (!is.null(res$replicate_score_df)) res$replicate_score_df else res$score_df
      replicate_col <- if ("Replicate" %in% names(scores)) scores$Replicate else NA
      if (length(input$labelParts) > 0) {
        scores$Label <- mapply(
          function(c, p, r, pt, tp) {
            parts <- input$labelParts
            val_c <- if("Group1" %in% parts && !is.na(c) && c != "Unspecified") gsub("_", " ", c) else NULL
            val_p <- if("Group2" %in% parts && !is.na(p) && p != "Unspecified") p else NULL
            val_r <- if("Replicate" %in% parts && !is.na(r) && r != "Unspecified") r else NULL
            val_pt <- if("PatientNumber" %in% parts && !is.na(pt) && pt != "Unspecified") pt else NULL
            val_tp <- if("TimePoint" %in% parts && !is.na(tp) && tp != "Unspecified") tp else NULL
            
            first_parts <- c(val_c, val_p, val_r)
            first_parts <- first_parts[!is.null(first_parts) & nzchar(first_parts)]
            first_str <- paste(first_parts, collapse = "_")
            
            second_str <- if (!is.null(val_pt)) {
              if (nzchar(first_str)) paste0(first_str, "/", val_pt) else val_pt
            } else {
              first_str
            }
            
            res_str <- if (!is.null(val_tp)) {
              if (nzchar(second_str)) paste0(second_str, "_", val_tp) else val_tp
            } else {
              second_str
            }
            res_str
          },
          scores$Group1, scores$Group2, replicate_col,
          if("PatientNumber" %in% names(scores)) scores$PatientNumber else NA,
          if("TimePoint" %in% names(scores)) scores$TimePoint else NA
        )
        
        # Clean up any residual Unspecified or separators in Label
        scores$Label <- gsub("Unspecified", "", scores$Label)
        scores$Label <- gsub("/+", "/", scores$Label)
        scores$Label <- gsub("_+", "_", scores$Label)
        scores$Label <- gsub("^[\\/_]+|[\\/_]+$", "", scores$Label) # trim leading/trailing separators
        scores$Label[scores$Label == ""] <- scores$FullName[scores$Label == ""]
      } else {
        scores$Label <- ""
      }

      # Generate Label for rep_scores as well
      rep_col <- if ("Replicate" %in% names(rep_scores)) rep_scores$Replicate else NA
      if (length(input$labelParts) > 0) {
        rep_scores$Label <- mapply(
          function(c, p, r, pt, tp) {
            parts <- input$labelParts
            val_c <- if("Group1" %in% parts && !is.na(c) && c != "Unspecified") gsub("_", " ", c) else NULL
            val_p <- if("Group2" %in% parts && !is.na(p) && p != "Unspecified") p else NULL
            val_r <- if("Replicate" %in% parts && !is.na(r) && r != "Unspecified") r else NULL
            val_pt <- if("PatientNumber" %in% parts && !is.na(pt) && pt != "Unspecified") pt else NULL
            val_tp <- if("TimePoint" %in% parts && !is.na(tp) && tp != "Unspecified") tp else NULL
            
            first_parts <- c(val_c, val_p, val_r)
            first_parts <- first_parts[!is.null(first_parts) & nzchar(first_parts)]
            first_str <- paste(first_parts, collapse = "_")
            
            second_str <- if (!is.null(val_pt)) {
              if (nzchar(first_str)) paste0(first_str, "/", val_pt) else val_pt
            } else {
              first_str
            }
            
            res_str <- if (!is.null(val_tp)) {
              if (nzchar(second_str)) paste0(second_str, "_", val_tp) else val_tp
            } else {
              second_str
            }
            res_str
          },
          rep_scores$Group1, rep_scores$Group2, rep_col,
          if("PatientNumber" %in% names(rep_scores)) rep_scores$PatientNumber else NA,
          if("TimePoint" %in% names(rep_scores)) rep_scores$TimePoint else NA
        )
        rep_scores$Label <- gsub("Unspecified", "", rep_scores$Label)
        rep_scores$Label <- gsub("/+", "/", rep_scores$Label)
        rep_scores$Label <- gsub("_+", "_", rep_scores$Label)
        rep_scores$Label <- gsub("^[\\/_]+|[\\/_]+$", "", rep_scores$Label)
        rep_scores$Label[rep_scores$Label == ""] <- rep_scores$FullName[rep_scores$Label == ""]
      } else {
        rep_scores$Label <- rep_scores$FullName
      }

      loadings <- res$load_df
      if (input$classLabelFormat == "full") {
        loadings$Class <- get_full_class_name(loadings$Class)
      } else {
        loadings$Class <- get_short_class_name(loadings$Class)
      }
      if("Lipid_Name" %in% names(loadings)) { 
        loadings$Label <- loadings$Lipid_Name 
      } else { 
        if (input$classLabelFormat == "full") {
          loadings$Label <- get_full_class_name(loadings$Class)
        } else {
          loadings$Label <- get_short_class_name(loadings$Class) 
        }
      }
      return(list(scores = scores, replicate_scores = rep_scores, loadings = loadings, var_pc = res$var_PC))
    })

    buildPCA2D_ggplot <- reactive({
      req(input$main_tabs == "PCA Score Plots")
      req(plot_data()); p_data <- plot_data()
      scores <- p_data$scores
      if (!"PC2" %in% names(scores)) {
        return(generate_empty_plot_message("At least 2 dimensions/components are required for 2D PCA."))
      }
      
      # Determine combined color grouping values
      group_cols <- input$colorGrouping
      if (length(group_cols) == 0) group_cols <- "Group1"
      
      scores$ColorGroupVal <- apply(scores[, group_cols, drop=FALSE], 1, function(row) {
        vals <- as.character(row)
        vals <- vals[!is.na(vals) & vals != "Unspecified"]
        if (length(vals) == 0) "Unspecified" else paste(vals, collapse = "_")
      })
      
      colorMap_key <- paste(group_cols, collapse = " & ")
      colorMap <- global_color_map()[[colorMap_key]]
      
      # RStudio console debug outputs
      cat("\n[DEBUG buildPCA2D_ggplot]\n")
      cat("  input$colorGrouping: ", paste(input$colorGrouping, collapse=", "), "\n")
      cat("  group_cols: ", paste(group_cols, collapse=", "), "\n")
      cat("  colorMap_key: ", colorMap_key, "\n")
      cat("  Available keys in global_color_map(): ", paste(names(global_color_map()), collapse=", "), "\n")
      cat("  colorMap exists: ", !is.null(colorMap), "\n")
      if (!is.null(colorMap)) {
         cat("  colorMap size: ", length(colorMap), "\n")
         cat("  colorMap names (head): ", paste(head(names(colorMap)), collapse=", "), "\n")
      }
      cat("  scores$ColorGroupVal unique (head): ", paste(head(unique(scores$ColorGroupVal)), collapse=", "), "\n")
      cat("----------------------------\n")
      
      req(colorMap)
      
      scores$ColorGroupVal <- factor(scores$ColorGroupVal, levels = names(colorMap))
      plot_aes <- aes(x = PC1, y = PC2, color = ColorGroupVal)
      if (isTRUE(input$useShapes)) {
        shapeMap <- shared_data$shape_maps()[[input$shapeGrouping]]; req(shapeMap)
        scores$ShapeGroupVal <- scores[[input$shapeGrouping]] %>% replace_na("NA")
        scores$ShapeGroupVal <- factor(scores$ShapeGroupVal, levels = names(shapeMap))
        plot_aes <- utils::modifyList(plot_aes, aes(shape = ShapeGroupVal))
      }
      
      num_colors <- length(colorMap)
      legend_pos <- if (num_colors > 10) "bottom" else "right"
      color_guide <- if (num_colors > 10) guide_legend(nrow = 4, byrow = TRUE) else guide_legend(ncol = 1)
      
      p <- ggplot(scores, plot_aes) + geom_point(size = input$scoreMarkerSize2D) +
        scale_color_manual(name = colorMap_key, values = colorMap, drop = FALSE) +
        guides(color = color_guide) +
        geom_hline(yintercept = 0, color = "black", linewidth = 0.4) +
        geom_vline(xintercept = 0, color = "black", linewidth = 0.4) +
        labs(title="2D PCA Score Plot", x=paste0("PC1 (",p_data$var_pc[1],"%)"), y=paste0("PC2 (",p_data$var_pc[2 %||% 1],"%)")) +
        theme_bw(base_size = 14) + 
        theme(panel.grid=element_blank(), legend.position = legend_pos)
        
      if (isTRUE(input$addFrame2D)) { p <- p + theme(panel.border=element_rect(colour="black", fill=NA, linewidth=1)) }
      
      if (isTRUE(input$smartLabelPCA2D)) {
        p <- p + geom_text_repel(aes(label = Label), color = "black", size = input$scoreTextSize2D,
                                 force=input$repelForcePCA2D, box.padding=input$repelBoxPadPCA2D,
                                 point.padding=input$repelPointPadPCA2D, max.overlaps = Inf)
      }
      
      if (isTRUE(input$useShapes)) { 
        shapeMap <- shared_data$shape_maps()[[input$shapeGrouping]]
        shape_guide <- if (num_colors > 10) guide_legend(nrow = 1) else guide_legend(ncol = 1)
        p <- p + scale_shape_manual(name = input$shapeGrouping, values = shapeMap, drop = FALSE) +
          guides(shape = shape_guide)
      }
      
      return(p)
    })
    
    buildPCA3D_plotly <- reactive({
      req(input$main_tabs == "PCA Score Plots")
      req(plot_data()); p_data <- plot_data(); scores <- p_data$scores
      if (!"PC3" %in% names(scores)) {
        return(plotly::ggplotly(generate_empty_plot_message("At least 3 dimensions/components are required for 3D PCA.")))
      }
      
      group_cols <- input$colorGrouping
      if (length(group_cols) == 0) group_cols <- "Group1"
      
      scores$ColorGroupVal <- apply(scores[, group_cols, drop=FALSE], 1, function(row) {
        vals <- as.character(row)
        vals <- vals[!is.na(vals) & vals != "Unspecified"]
        if (length(vals) == 0) "Unspecified" else paste(vals, collapse = "_")
      })
      
      colorMap_key <- paste(group_cols, collapse = " & ")
      colorMap <- global_color_map()[[colorMap_key]]
      
      # RStudio console debug outputs
      cat("\n[DEBUG buildPCA3D_plotly]\n")
      cat("  input$colorGrouping: ", paste(input$colorGrouping, collapse=", "), "\n")
      cat("  group_cols: ", paste(group_cols, collapse=", "), "\n")
      cat("  colorMap_key: ", colorMap_key, "\n")
      cat("  Available keys in global_color_map(): ", paste(names(global_color_map()), collapse=", "), "\n")
      cat("  colorMap exists: ", !is.null(colorMap), "\n")
      if (!is.null(colorMap)) {
         cat("  colorMap size: ", length(colorMap), "\n")
         cat("  colorMap names (head): ", paste(head(names(colorMap)), collapse=", "), "\n")
      }
      cat("  scores$ColorGroupVal unique (head): ", paste(head(unique(scores$ColorGroupVal)), collapse=", "), "\n")
      cat("----------------------------\n")
      
      req(colorMap)
      
      scores$ColorGroupVal <- factor(scores$ColorGroupVal, levels = names(colorMap))
      GGPLOT_TO_PLOTLY_SHAPES <- c("16"="circle", "15"="square", "17"="triangle-up", "18"="diamond", "3"="cross", "4"="x", "8"="star")
      shapeMap_plotly <- NULL
      if(isTRUE(input$useShapes)) {
          shapeMap_gg <- shared_data$shape_maps()[[input$shapeGrouping]]; req(shapeMap_gg)
          shapeMap_plotly <- GGPLOT_TO_PLOTLY_SHAPES[as.character(shapeMap_gg)]; names(shapeMap_plotly) <- names(shapeMap_gg)
          scores$ShapeGroupVal <- scores[[input$shapeGrouping]] %>% replace_na("NA"); scores$ShapeGroupVal <- factor(scores$ShapeGroupVal, levels=names(shapeMap_plotly))
      }
      plot_ly(data=scores, x=~PC1, y=~PC2, z=~PC3, color=~ColorGroupVal, colors=colorMap,
              symbol=if(isTRUE(input$useShapes)) ~ShapeGroupVal else I("circle"),
              symbols=if(isTRUE(input$useShapes)) shapeMap_plotly else NULL,
              text=~Label, type="scatter3d", mode=if(isTRUE(input$showLabels3D)) "markers+text" else "markers",
              textfont=list(color='#000000', size=12),
              marker=list(size=input$scoreMarkerSize3D)) %>%
        layout(title=list(text="3D PCA Score"), scene=list(xaxis=list(title=paste0("PC1 (",p_data$var_pc[1],"%)")),
                          yaxis=list(title=paste0("PC2 (",p_data$var_pc[2] %||% 1,"%)")), zaxis=list(title=paste0("PC3 (",p_data$var_pc[3] %||% 1,"%)"))))
    })
    
    buildLoad2D_ggplot <- reactive({
      req(input$main_tabs == "PCA Loading Plots")
      req(plot_data()); p_data <- plot_data(); loadings <- p_data$loadings
      if (!"PC2" %in% names(loadings)) {
        return(generate_empty_plot_message("At least 2 dimensions/components are required for 2D PCA."))
      }
      
      num_classes <- length(local_class_colors())
      legend_pos <- if (num_classes > 10) "bottom" else "right"
      class_guide <- if (num_classes > 10) guide_legend(nrow = 3, byrow = TRUE) else guide_legend(ncol = 1)
      
      p <- ggplot(loadings, aes(PC1, PC2, color = Class)) + geom_point(size = input$loadMarkerSize2D) +
        scale_color_manual(values = local_class_colors(), name = "Lipid Class", drop = FALSE) +
        guides(color = class_guide) +
        geom_hline(yintercept = 0, color="black", linewidth = 0.4) +
        geom_vline(xintercept = 0, color="black", linewidth = 0.4) +
        labs(title = "2D PCA Loadings", x = "PC1 Loading", y = "PC2 Loading") +
        theme_bw(base_size = 14) + 
        theme(panel.grid=element_blank(), legend.position = legend_pos)
      if (isTRUE(input$addFrame2D)) { p <- p + theme(panel.border=element_rect(colour="black", fill=NA, linewidth=1)) }
      if (isTRUE(input$showSingleLipidNames)) {
        if (isTRUE(input$smartLabelLoad2D)) {
          p <- p + geom_text_repel(aes(label = Label), color = "black", size = input$loadTextSize2D,
                                   force=input$repelForceLoad2D, box.padding=input$repelBoxPadLoad2D,
                                   point.padding=input$repelPointPadLoad2D, max.overlaps = Inf)
        } else {
          p <- p + geom_text(aes(label = Label), vjust = -0.8, color = "black", size = input$loadTextSize2D)
        }
      }
      return(p)
    })
    
    buildLoad3D_plotly <- reactive({
      req(input$main_tabs == "PCA Loading Plots")
      req(plot_data()); p_data <- plot_data(); loadings <- p_data$loadings
      if (!"PC3" %in% names(loadings)) {
        return(plotly::ggplotly(generate_empty_plot_message("At least 3 dimensions/components are required for 3D Loadings.")))
      }
      plot_ly(data=loadings, x=~PC1, y=~PC2, z=~PC3, color=~Class, colors=local_class_colors(),
              text=~Label, type="scatter3d", mode=if(isTRUE(input$showSingleLipidNames)) "markers+text" else "markers",
              textfont=list(color='#000000', size=12),
              marker=list(size=input$loadMarkerSize3D)) %>%
        layout(title=list(text="3D PCA Loadings"), scene=list(xaxis=list(title="PC1 Loading"),
                          yaxis=list(title="PC2 Loading"), zaxis=list(title="PC3 Loading")))
    })
    
    sample_corr_fallback_active <- reactiveVal(FALSE)

    # --- Sample Correlation Heatmap Reactives ---
    buildSampleCorrMatrix <- reactive({
      req(input$main_tabs == "Sample Correlation")
      df <- shared_data$data_processed()
      req(df)
      filtered_lipids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_lipids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_lipids)
      }
      
      # If targeted mode active and fewer than 3 lipids, Pearson/Spearman sample correlation is mathematically invalid
      if (isTRUE(shared_data$targeted_mode_active()) && nrow(df) < 3) {
        sample_corr_fallback_active(TRUE)
        notify_targeted_fallback(session, id = "targeted_fallback_corr")
        df <- shared_data$data_processed_unfiltered()
        all_lipids <- if (!is.null(shared_data$global_filtered_lipids_all)) shared_data$global_filtered_lipids_all() else NULL
        if (!is.null(all_lipids)) {
          df <- df %>% dplyr::filter(Lipid_Name %in% all_lipids)
        }
      } else {
        sample_corr_fallback_active(FALSE)
      }
      
      req(nrow(df) > 0)
      mat <- df %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      method <- input$corrMethod %||% "pearson"
      cor_mat <- cor(mat, use = "pairwise.complete.obs", method = method)
      cor_mat
    })

    buildSampleCorrPlot <- reactive({
      cor_mat <- buildSampleCorrMatrix()
      req(cor_mat)
      
      do_cluster <- isTRUE(input$corrCluster)
      if (do_cluster && ncol(cor_mat) > 1) {
        dist_mat <- as.dist(1 - cor_mat)
        if (any(is.na(dist_mat)) || any(is.infinite(dist_mat))) {
          sample_order <- colnames(cor_mat)
        } else {
          hc <- hclust(dist_mat)
          sample_order <- colnames(cor_mat)[hc$order]
        }
      } else {
        sample_order <- colnames(cor_mat)
      }
      
      p_data <- tryCatch(plot_data(), error = function(e) NULL)
      label_lookup <- if (!is.null(p_data)) {
        setNames(p_data$scores$Label, p_data$scores$FullName)
      } else {
        NULL
      }
      
      cor_df <- as.data.frame(cor_mat) %>%
        tibble::rownames_to_column("Sample1") %>%
        tidyr::pivot_longer(cols = -Sample1, names_to = "Sample2", values_to = "Correlation")
        
      if (!is.null(label_lookup)) {
        cor_df$Sample1_Label <- label_lookup[cor_df$Sample1]
        cor_df$Sample2_Label <- label_lookup[cor_df$Sample2]
        cor_df$Sample1_Label[is.na(cor_df$Sample1_Label)] <- cor_df$Sample1[is.na(cor_df$Sample1_Label)]
        cor_df$Sample2_Label[is.na(cor_df$Sample2_Label)] <- cor_df$Sample2[is.na(cor_df$Sample2_Label)]
        
        sample_order_labels <- label_lookup[sample_order]
        sample_order_labels[is.na(sample_order_labels)] <- sample_order[is.na(sample_order_labels)]
      } else {
        cor_df$Sample1_Label <- cor_df$Sample1
        cor_df$Sample2_Label <- cor_df$Sample2
        sample_order_labels <- sample_order
      }
      
      cor_df$Sample1_Label <- factor(cor_df$Sample1_Label, levels = sample_order_labels)
      cor_df$Sample2_Label <- factor(cor_df$Sample2_Label, levels = sample_order_labels)
      
      lbl_size <- input$corrLabelSize %||% 8
      show_lbls <- isTRUE(input$corrShowLabels)
      method <- input$corrMethod %||% "pearson"
      
      p <- ggplot(cor_df, aes(x = Sample1_Label, y = Sample2_Label, fill = Correlation)) +
        geom_tile(color = "white", size = 0.1) +
        scale_fill_gradient2(
          low = "#2166AC", 
          mid = "#F7F7F7", 
          high = "#B2182B", 
          midpoint = 0, 
          limits = c(-1, 1), 
          name = "Correlation"
        ) +
        theme_minimal(base_size = input$textSize %||% 12) +
        theme(
          axis.title = element_blank(),
          panel.grid = element_blank(),
          axis.text.x = if (show_lbls) {
            element_text(angle = 90, vjust = 0.5, hjust = 1, size = lbl_size)
          } else {
            element_blank()
          },
          axis.text.y = if (show_lbls) {
            element_text(size = lbl_size)
          } else {
            element_blank()
          }
        ) +
        labs(
          title = "Sample-Sample Correlation Matrix",
          subtitle = paste("Method:", toupper(method), if(do_cluster) "| Hierarchically Clustered" else "")
        )
        
      p
    })

    # Fallback alert banners when targeted cohort is insufficient for PCA or Correlation
    output$pca_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(shared_data$pca_fallback_active())) })
    output$pca3d_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(shared_data$pca_fallback_active())) })
    output$pca_load_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(shared_data$pca_fallback_active())) })
    output$pca_load3d_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(shared_data$pca_fallback_active())) })
    output$outlier_pca_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(shared_data$pca_fallback_active())) })
    output$corr_fallback_alert <- renderUI({ targeted_fallback_banner_ui(isTRUE(sample_corr_fallback_active())) })

    output$pca2dPlot <- renderPlot({ buildPCA2D_ggplot() })
    output$pca3dPlot <- renderPlotly({ buildPCA3D_plotly() })
    output$load2dPlot <- renderPlot({ buildLoad2D_ggplot() })
    output$load3dPlot <- renderPlotly({ buildLoad3D_plotly() })
    
    create_download <- function(plot_obj, dims, file_prefix) {
      downloadHandler(
        filename = function() paste0(file_prefix, "_", format(Sys.time(),"%Y%m%d_%H%M"), ".pdf"),
        content = function(f) { 
          tryCatch({
            p <- plot_obj()
            req(p)
            d <- dims()
            ggsave(f, plot = p, device = "pdf", width = d$width/72, height = d$height/72, units = "in", limitsize = FALSE)
          }, error = function(e) {
            pdf(f, width=8, height=6)
            plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
            text(0, 0, paste("ERROR in ggsave/QC:\n", e$message), col="red", cex=0.8)
            dev.off()
          })
        },
        contentType = "application/pdf"
      )
    }
    create_3d_download <- function(plotly_obj, dims, file_prefix) {
      downloadHandler(
        filename = function() paste0(file_prefix, "_", format(Sys.time(),"%Y%m%d_%H%M"), ".pdf"),
        content = function(f) { 
          tryCatch({
            fig <- plotly_obj()
            req(fig)
            d <- dims()
            tmp <- tempfile(fileext=".html")
            htmlwidgets::saveWidget(fig, tmp)
            webshot2::webshot(tmp, f, vwidth=d$width, vheight=d$height)
          }, error = function(e) {
            pdf(f, width=8, height=6)
            plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
            text(0, 0, paste("ERROR in webshot/plotly:\n", e$message), col="red", cex=0.8)
            dev.off()
          })
        },
        contentType = "application/pdf"
      )
    }
    output$downloadPCA2Dpdf <- create_download(reactive({buildPCA2D_ggplot()}), reactive(plot_dims$pca2d), "PCA_2D")
    output$downloadLoad2Dpdf <- create_download(reactive({buildLoad2D_ggplot()}), reactive(plot_dims$load2d), "Loading_2D")
    output$downloadBoxplotBefore <- create_download(boxplotBeforePlotObj, reactive(plot_dims$boxplot_before), "QC_Boxplot_Before")
    output$downloadBoxplotAfter <- create_download(boxplotAfterPlotObj, reactive(plot_dims$boxplot_after), "QC_Boxplot_After")
    output$downloadPCA3Dpdf <- create_3d_download(reactive({buildPCA3D_plotly()}), reactive(plot_dims$pca3d), "PCA_3D")
    output$downloadLoad3Dpdf <- create_3d_download(reactive({buildLoad3D_plotly()}), reactive(plot_dims$load3d), "Loading_3D")
    
    # Sample Correlation Plot & Download binding
    output$sampleCorrPlot <- renderPlot({ buildSampleCorrPlot() })
    output$downloadSampleCorrPDF <- create_download(reactive({buildSampleCorrPlot()}), reactive(plot_dims$sample_corr), "Sample_Correlation")
    output$downloadSampleCorrCSV <- downloadHandler(
      filename = function() {
        paste0("Sample_Correlation_Matrix_", format(Sys.time(), "%Y%m%d_%H%M"), ".csv")
      },
      content = function(file) {
        mat <- buildSampleCorrMatrix()
        req(mat)
        write.csv(as.data.frame(mat), file, row.names = TRUE)
      }
    )
    
    build_qc_stats_report <- function(target_tab = NULL) {
      current_tab <- target_tab %||% input$main_tabs %||% "Normalization Check"
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: ", toupper(current_tab), "\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n"
      )
      
      if (current_tab == "Normalization Check") {
        msg <- paste0(
          msg,
          "1. DATA MATRIX & NORMALIZATION\n",
          "   - Normalization Method: ", input$normalizationMethod %||% "median", "\n",
          "   - Missing Imputation:   ", ifelse(isTRUE(input$useImputation), "Yes (QRILC)", "No"), "\n",
          "   - Drop 'Misc' Lipids:   ", ifelse(isTRUE(input$dropMisc), "Yes", "No"), "\n",
          "   - Raw Sample Count:     ", length(shared_data$all_numeric_columns()), " samples\n\n",
          "   - Normalization Calculus:\n",
          "     For Median Normalization:\n",
          "          x_norm = x_raw - median(x_raw) + global_median\n",
          "     This shifts global abundance profiles so replicates match their medians.\n"
        )
      } else if (current_tab == "Outliers Detection") {
        msg <- paste0(
          msg,
          "2. OUTLIER DETECTION CALCULUS\n",
          "   - Detection Scope:      ", input$outlierScope %||% "global", "\n",
          "   - Mathematical Formulation:\n",
          "     Outliers are evaluated using two multidimensional diagnostics based on the PCA space:\n",
          "     1. Distance to Model (D-Score / Orthogonal Distance):\n",
          "          D_i = sqrt( sum_{j=A+1}^{K} (x_{ij} - x_hat_{ij})^2 )\n",
          "        where x_ij is the median-centered intensity of lipid 'j' in sample 'i', and x_hat_ij is the\n",
          "        projection reconstructed from the first 'A' principal components. It measures the residual variance.\n",
          "     2. Hotelling's T2 (Score Distance):\n",
          "          T_i^2 = sum_{a=1}^{A} (t_{ia}^2 / lambda_a)\n",
          "        where t_ia is the score of sample 'i' on PC 'a', and lambda_a is the eigenvalue (variance) of PC 'a'.\n",
          "        This measures the distance from the center of the model space.\n",
          "     3. Critical Limits:\n",
          "          Samples exceeding the critical thresholds (calculated via F-distribution approximations) are flagged\n",
          "          as outlier candidates and can be excluded or average-replaced in the Outliers Detection panel.\n"
        )
      } else if (current_tab %in% c("PCA Score Plots", "PCA Loading Plots")) {
        pca_res <- tryCatch(shared_data$pca_results(), error = function(e) NULL)
        msg <- paste0(
          msg,
          "3. PRINCIPAL COMPONENT ANALYSIS (PCA - Mode: ", input$pcaMode %||% "class", ")\n",
          "   - PCA Algorithm: Singular Value Decomposition (SVD) / NIPALS\n",
          "   - Mathematical Formulation:\n",
          "     The median-centered, log2-transformed data matrix X is decomposed as:\n",
          "          X = U * D * V'\n",
          "        where:\n",
          "          U is the matrix of left singular vectors (scaling scores),\n",
          "          D contains singular values (square roots of eigenvalues),\n",
          "          V contains right singular vectors (loadings, representing coefficients of original lipids).\n",
          "     Each component 'k' explains a portion of total variance:\n",
          "          Explained Variance_k = lambda_k / sum(lambda_j) * 100%\n",
          "        where lambda_k = d_k^2 is the eigenvalue of PC 'k'.\n\n",
          "   - Empirical Eigenvalues & Explained Variance (Estimated on Loaded Dataset):\n"
        )
        if (!is.null(pca_res)) {
          for (i in 1:min(length(pca_res$var_PC), 5)) {
            msg <- paste0(msg, "       PC", i, ": ", round(pca_res$var_PC[i], 2), "% explained variance\n")
          }
        } else {
          msg <- paste0(msg, "       PCA has not been computed yet.\n")
        }
      } else if (current_tab == "Sample Correlation") {
        msg <- paste0(
          msg,
          "4. SAMPLE CORRELATION ANALYSIS\n",
          "   - Correlation Method: ", input$corrMethod %||% "pearson", "\n",
          "   - Clustered:          ", ifelse(isTRUE(input$corrCluster %||% TRUE), "Yes (Hierarchical)", "No"), "\n\n",
          "   - Mathematical Formulation:\n",
          "     Pairwise similarity between sample profiles 'x' and 'y' is computed:\n",
          "          r_xy = sum((x_i - mean(x)) * (y_i - mean(y))) / sqrt(sum(x_i - mean(x))^2 * sum(y_i - mean(y))^2)\n",
          "     Hierarchical clustering uses Euclidean distance and complete linkage to seriate samples.\n"
        )
      } else if (current_tab == "BQC CoV Analysis") {
        bqc_df <- tryCatch(bqcStats(), error = function(e) NULL)
        if (!is.null(bqc_df) && nrow(bqc_df) > 0) {
          med_cov <- median(bqc_df$CoV, na.rm = TRUE)
          pass20 <- sum(bqc_df$CoV <= 20, na.rm = TRUE)
          pct20 <- round((pass20 / nrow(bqc_df)) * 100, 1)
          pass30 <- sum(bqc_df$CoV <= 30, na.rm = TRUE)
          pct30 <- round((pass30 / nrow(bqc_df)) * 100, 1)
          
          msg <- paste0(
            msg,
            "5. BATCH QUALITY CONTROL (BQC) PRECISION METRICS\n",
            "   - Identified BQC Replicates: ", paste(input$bqcSamples, collapse = ", "), "\n",
            "   - Lipid Precision Statistics:\n",
            "       Total Lipids Evaluated:   ", nrow(bqc_df), "\n",
            "       Median CoV (%):           ", round(med_cov, 2), "%\n",
            "       High-Precision (<20% CoV): ", pass20, " lipids (", pct20, "% of total)\n",
            "       Acceptable CoV (<30% CoV): ", pass30, " lipids (", pct30, "% of total)\n\n",
            "   - Mathematical Formulation:\n",
            "     For each lipid species 'l', the mean and standard deviation (SD) are calculated across BQC replicates:\n",
            "          Mean_l = (1 / N) * sum_{i=1}^{N} x_{l,i}\n",
            "          SD_l   = sqrt( (1 / (N - 1)) * sum_{i=1}^{N} (x_{l,i} - Mean_l)^2 )\n",
            "          CoV_l  = (SD_l / Mean_l) * 100%\n",
            "     where x_{l,i} represents the median-centered, normalized abundance of lipid 'l' in BQC replicate 'i'.\n",
            "     Lipids exceeding the acceptable threshold (", input$bqcCovThreshold, "%) are flagged as low-precision outliers.\n",
            "     Global Filtering: ", if (isTRUE(input$filterBqcOutliers)) "ENABLED (low-precision lipids are excluded from all downstream comparisons)" else "DISABLED (low-precision lipids are included in analysis)", "\n"
          )
        } else {
          msg <- paste0(msg, "   - BQC CoV Analysis has not been configured or lacks sufficient replicates.\n")
        }
      }
      
      msg <- paste0(msg, "\n==================================================\n")
      msg <- paste0(msg, "\n", get_stats_console_method_summary(shared_data))
      return(msg)
    }
    
    observeEvent(input$show_stats_detail, {
      msg <- build_qc_stats_report()
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Quality Check & PCA")
    })
    
    observeEvent(input$show_bqc_stats_detail, {
      msg <- build_qc_stats_report("BQC CoV Analysis")
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "BQC CoV Analysis")
    })
    
    # ==========================================
    # BQC CoV ANALYSIS SERVER LOGIC
    # ==========================================
    
    # Get all available samples in processed data
    all_samples <- reactive({
      df <- shared_data$data_processed()
      if (is.null(df)) return(character(0))
      setdiff(names(df), "Lipid_Name")
    })
    
    # Custom BQC Manual Exclusions State
    bqcManualExclusions <- reactiveVal(NULL)
    
    observe({
      excl <- shared_data$restored_bqc_manual_exclusions()
      if (!is.null(excl)) {
        bqcManualExclusions(excl)
      }
    })
    
    # Reset custom exclusions when threshold or samples change
    observeEvent(input$bqcCovThreshold, {
      bqcManualExclusions(NULL)
    })
    
    observeEvent(input$bqcSamples, {
      bqcManualExclusions(NULL)
    })
    
    # Observers for Select All and Select None
    observeEvent(input$bqc_select_all, {
      samps <- all_samples()
      updateCheckboxGroupInput(session, "bqcSamples", selected = samps)
    })
    
    observeEvent(input$bqc_select_none, {
      updateCheckboxGroupInput(session, "bqcSamples", selected = character(0))
    })
    
    # Dynamic BQC columns selection scrollable checkbox list
    output$bqcSamplesSelectorUI <- renderUI({
      samps <- all_samples()
      req(length(samps) > 0)
      
      # Auto-match matching pattern (case-insensitive)
      pat <- input$bqcPattern %||% "BQC"
      matches <- samps[grepl(pat, samps, ignore.case = TRUE)]
      
      # Support for session restore
      saved_selection <- shared_data$get_restored_input(session$ns("bqcSamples"), matches)
      
      tagList(
        tags$span("Selected BQC Samples:", 
                  bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Replicate columns run as Quality Control. CoV is calculated across these columns.")),
        div(
          style = "margin-top: 3px; margin-bottom: 5px; font-size: 0.85rem;",
          actionLink(ns("bqc_select_all"), "All", style = "margin-right: 12px; font-weight: bold; cursor: pointer; text-decoration: none;"),
          actionLink(ns("bqc_select_none"), "None", style = "font-weight: bold; cursor: pointer; text-decoration: none;")
        ),
        div(
          style = "max-height: 150px; overflow-y: auto; border: 1px solid #ced4da; padding: 8px; border-radius: 4px; background-color: #ffffff; margin-bottom: 10px;",
          checkboxGroupInput(
            ns("bqcSamples"), 
            label = NULL,
            choices = samps, 
            selected = saved_selection
          )
        )
      )
    })
    
    # Compute precision metrics: Mean, SD, CoV (%) for each lipid across BQC replicates
    bqcStats <- reactive({
      df <- shared_data$data_processed()
      if (is.null(df)) return(NULL)
      
      bqc_cols <- input$bqcSamples
      if (is.null(bqc_cols) || length(bqc_cols) < 2) return(NULL)
      
      # Extract matrix of BQC values
      mat <- as.matrix(df[, bqc_cols, drop = FALSE])
      means <- rowMeans(mat, na.rm = TRUE)
      sds <- apply(mat, 1, sd, na.rm = TRUE)
      
      # CoV (%) = (SD / Mean) * 100
      covs <- ifelse(means > 0, (sds / means) * 100, 0)
      covs[is.na(covs)] <- 0
      
      data.frame(
        Lipid_Name = df$Lipid_Name,
        Mean = round(means, 2),
        SD = round(sds, 3),
        CoV = round(covs, 2),
        stringsAsFactors = FALSE
      )
    })
    
    # Track which lipids are currently excluded
    bqcExclusionsList <- reactive({
      df_stats <- tryCatch(bqcStats(), error = function(e) NULL)
      if (is.null(df_stats)) return(character(0))
      
      threshold <- input$bqcCovThreshold %||% 20
      auto_excluded <- df_stats$Lipid_Name[df_stats$CoV > threshold]
      
      if (is.null(bqcManualExclusions())) {
        auto_excluded
      } else {
        intersect(bqcManualExclusions(), df_stats$Lipid_Name)
      }
    })
    
    # Lipids that pass precision filter
    bqcPassingLipids <- reactive({
      df_stats <- tryCatch(bqcStats(), error = function(e) NULL)
      if (is.null(df_stats)) {
        # Fallback to all lipids if BQC is not set up
        df <- shared_data$data_processed()
        if (is.null(df)) return(character(0))
        return(df$Lipid_Name)
      }
      setdiff(df_stats$Lipid_Name, bqcExclusionsList())
    })
    
    # Summary Metrics Cards
    output$bqcMetricsSummaryUI <- renderUI({
      df <- shared_data$data_processed()
      if (is.null(df)) {
        return(div(class="alert alert-warning mb-0", "Please load a dataset and click 'Run Analysis' first."))
      }
      
      stats_df <- tryCatch(bqcStats(), error = function(e) NULL)
      if (is.null(stats_df) || nrow(stats_df) == 0) {
        return(div(class="alert alert-info mb-0", "Please configure at least 2 BQC replicate samples in the sidebar panel to calculate CoV statistics."))
      }
      
      med_cov <- median(stats_df$CoV, na.rm = TRUE)
      tot <- nrow(stats_df)
      
      # We want to display the actual pass rate based on current exclusions
      excluded_count <- length(bqcExclusionsList())
      pass_count <- tot - excluded_count
      pass_pct <- round((pass_count / tot) * 100, 1)
      
      pass20 <- sum(stats_df$CoV <= 20, na.rm = TRUE)
      pct20 <- round((pass20 / tot) * 100, 1)
      
      layout_columns(
        col_widths = c(4, 4, 4),
        card(
          class = "border-0 shadow-sm bg-light",
          card_body(
            class = "p-3 text-center",
            h6("Median CoV", class="text-muted mb-1 small"),
            h3(sprintf("%.1f%%", med_cov), class="fw-bold text-dark m-0")
          )
        ),
        card(
          class = "border-0 shadow-sm bg-light",
          card_body(
            class = "p-3 text-center",
            h6("Target Threshold Pass Rate", class="text-muted mb-1 small"),
            h3(sprintf("%d (%s%%)", pass20, pct20), class="fw-bold text-success m-0")
          )
        ),
        card(
          class = "border-0 shadow-sm bg-light",
          card_body(
            class = "p-3 text-center",
            h6("Active Pass Rate (Filtered)", class="text-muted mb-1 small"),
            h3(sprintf("%d (%s%%)", pass_count, pass_pct), class="fw-bold text-primary m-0")
          )
        )
      )
    })
    
    # Build distribution plot
    buildBqcPlot <- function() {
      stats_df <- bqcStats()
      req(stats_df)
      
      threshold <- input$bqcCovThreshold %||% 20
      
      ggplot(stats_df, aes(x = CoV)) +
        geom_density(fill = "#5b92e5", alpha = 0.4, color = "#2c5282", linewidth = 0.8) +
        geom_vline(xintercept = threshold, linetype = "dashed", color = "#e53e3e", linewidth = 1) +
        annotate("text", x = threshold + 1, y = 0.01, label = paste0("Threshold: ", threshold, "%"), 
                 color = "#e53e3e", hjust = 0, fontface = "bold") +
        theme_minimal(base_size = 13) +
        labs(
          x = "Coefficient of Variation (CoV %)",
          y = "Density",
          title = "BQC Measurement Precision Distribution"
        ) +
        theme(
          plot.title = element_text(face = "bold", size = 14, color = "#2d3748"),
          axis.title = element_text(color = "#4a5568"),
          panel.grid.minor = element_blank()
        )
    }
    
    output$bqcPlot <- renderPlot({
      stats_df <- tryCatch(bqcStats(), error = function(e) NULL)
      if (is.null(stats_df) || nrow(stats_df) == 0) {
        return(ggplot() + theme_void() + annotate("text", x = 0.5, y = 0.5, label = "Please configure at least 2 BQC replicate samples to view plot.", size = 4, color = "#6c757d"))
      }
      tryCatch({
        buildBqcPlot()
      }, error = function(e) {
        ggplot() + theme_void() + annotate("text", x = 0.5, y = 0.5, label = "No BQC data available.")
      })
    })
    
    # Subtab 2: Sample Deviation Plot
    output$bqcDeviationPlot <- renderPlot({
      df <- shared_data$data_processed()
      req(df)
      bqc_cols <- input$bqcSamples
      if (is.null(bqc_cols) || length(bqc_cols) < 2) {
        return(ggplot() + theme_void() + annotate("text", x = 0.5, y = 0.5, label = "Please configure at least 2 BQC replicate samples.", size = 4, color = "#6c757d"))
      }
      
      mat <- as.matrix(df[, bqc_cols, drop = FALSE])
      means <- rowMeans(mat, na.rm = TRUE)
      
      # Calculate absolute deviation for each lipid in each sample
      deviations <- abs(mat - means)
      mad_samples <- colMeans(deviations, na.rm = TRUE)
      
      plot_df <- data.frame(
        Sample = names(mad_samples),
        MAD = mad_samples,
        stringsAsFactors = FALSE
      )
      
      med_mad <- median(plot_df$MAD, na.rm = TRUE)
      plot_df$Status <- ifelse(plot_df$MAD > 1.5 * med_mad, "High Deviation", "Normal")
      
      ggplot(plot_df, aes(x = Sample, y = MAD, fill = Status)) +
        geom_bar(stat = "identity", width = 0.5, color = "#2d3748") +
        scale_fill_manual(values = c("Normal" = "#4e79a7", "High Deviation" = "#e15759")) +
        theme_minimal(base_size = 13) +
        labs(x = "BQC Replicate", y = "Mean Absolute Deviation (MAD)", title = "BQC Replicate Deviation from Consensus") +
        theme(
          plot.title = element_text(face = "bold", size = 14, color = "#2d3748"),
          axis.text.x = element_text(angle = 45, hjust = 1),
          legend.position = "bottom",
          panel.grid.minor = element_blank()
        )
    })
    
    # Subtab 3: Sample Abundance Plot
    output$bqcAbundancePlot <- renderPlot({
      df <- shared_data$data_processed()
      req(df)
      bqc_cols <- input$bqcSamples
      if (is.null(bqc_cols) || length(bqc_cols) < 2) {
        return(ggplot() + theme_void() + annotate("text", x = 0.5, y = 0.5, label = "Please configure at least 2 BQC replicate samples.", size = 4, color = "#6c757d"))
      }
      
      mat <- as.matrix(df[, bqc_cols, drop = FALSE])
      totals <- colSums(mat, na.rm = TRUE)
      
      plot_df <- data.frame(
        Sample = names(totals),
        Total = totals,
        stringsAsFactors = FALSE
      )
      
      med_tot <- median(plot_df$Total, na.rm = TRUE)
      
      ggplot(plot_df, aes(x = Sample, y = Total)) +
        geom_bar(stat = "identity", width = 0.5, fill = "#5a6b7c", color = "#2d3748") +
        geom_hline(yintercept = med_tot, linetype = "dashed", color = "#e15759", linewidth = 1) +
        annotate("text", x = 0.6, y = med_tot * 1.02, label = "Median", color = "#e15759", fontface = "bold") +
        theme_minimal(base_size = 13) +
        labs(x = "BQC Replicate", y = "Total Sum Intensity", title = "BQC Sample Total Abundance Profiles") +
        theme(
          plot.title = element_text(face = "bold", size = 14, color = "#2d3748"),
          axis.text.x = element_text(angle = 45, hjust = 1),
          panel.grid.minor = element_blank()
        )
    })
    
    output$downloadBqcPdf <- downloadHandler(
      filename = function() {
        paste0("BQC_CoV_Analysis_", format(Sys.time(), "%Y%m%d_%H%M"), ".pdf")
      },
      content = function(file) {
        pdf(file, width = 8, height = 5)
        print(buildBqcPlot())
        dev.off()
      }
    )
    
    # Subtab 4: Filtered Lipids Table
    output$bqcFilteredTable <- DT::renderDataTable({
      df_stats <- tryCatch(bqcStats(), error = function(e) NULL)
      if (is.null(df_stats) || nrow(df_stats) == 0) {
        return(DT::datatable(data.frame(Message = "No BQC data available."), options = list(dom = "t"), rownames = FALSE))
      }
      
      excluded_lipids <- bqcExclusionsList()
      filtered_df <- df_stats[df_stats$Lipid_Name %in% excluded_lipids, ]
      
      if (nrow(filtered_df) == 0) {
        return(DT::datatable(data.frame(Message = "No lipids are currently filtered out."), options = list(dom = "t"), rownames = FALSE))
      }
      
      DT::datatable(filtered_df, options = list(pageLength = 10, dom = "ltipr"), rownames = FALSE) %>%
        DT::formatStyle("CoV", color = "#721c24", fontWeight = "bold")
    })
    
    # Exclusions Manager Modal
    observeEvent(input$openBqcFilterManager, {
      df_stats <- tryCatch(bqcStats(), error = function(e) NULL)
      req(df_stats)
      
      showModal(modalDialog(
        title = tags$h4(class = "modal-title fw-bold text-primary", 
                        icon("filter"), " BQC High-Variance Lipid Precision Filter"),
        size = "l",
        easyClose = TRUE,
        footer = tagList(
          actionButton(ns("applyBqcFilterChanges"), "Apply Selected Filters", class = "btn-success px-4"),
          modalButton("Cancel")
        ),
        p("Check the lipids you want to filter out (exclude) from downstream analysis. By default, lipids exceeding the acceptable CoV threshold are pre-selected.", class="text-muted small"),
        DT::dataTableOutput(ns("bqcFilterManagerTable"))
      ))
    })
    
    output$bqcFilterManagerTable <- DT::renderDataTable({
      df_stats <- tryCatch(bqcStats(), error = function(e) NULL)
      req(df_stats)
      
      current_excluded <- bqcExclusionsList()
      # Sort the table so high CoV lipids are at the top
      df_stats_sorted <- df_stats[order(df_stats$CoV, decreasing = TRUE), ]
      selected_indices_sorted <- which(df_stats_sorted$Lipid_Name %in% current_excluded)
      
      DT::datatable(
        df_stats_sorted,
        selection = list(mode = 'multiple', selected = selected_indices_sorted),
        options = list(pageLength = 15, dom = "ltipr"),
        rownames = FALSE
      )
    })
    
    observeEvent(input$applyBqcFilterChanges, {
      df_stats <- tryCatch(bqcStats(), error = function(e) NULL)
      req(df_stats)
      df_stats_sorted <- df_stats[order(df_stats$CoV, decreasing = TRUE), ]
      
      selected_rows <- input$bqcFilterManagerTable_rows_selected
      excluded_lipids <- if (is.null(selected_rows)) character(0) else df_stats_sorted$Lipid_Name[selected_rows]
      
      bqcManualExclusions(excluded_lipids)
      removeModal()
    })
    
    # Subtab 5: Render DT table of all BQC precision details
    output$bqcTable <- DT::renderDataTable({
      stats_df <- tryCatch(bqcStats(), error = function(e) NULL)
      if (is.null(stats_df) || nrow(stats_df) == 0) {
        return(DT::datatable(data.frame(Message = "No BQC data available. Configure samples in sidebar."), options = list(dom = 't'), rownames = FALSE))
      }
      
      excluded_lipids <- bqcExclusionsList()
      stats_df$Status <- ifelse(stats_df$Lipid_Name %in% excluded_lipids, "Fail", "Pass")
      
      DT::datatable(
        stats_df,
        options = list(
          pageLength = 10,
          order = list(list(3, 'desc')), # sort by CoV desc
          dom = 'ltipr'
        ),
        rownames = FALSE
      ) %>%
        DT::formatStyle(
          'Status',
          backgroundColor = DT::styleEqual(c("Pass", "Fail"), c("#d4edda", "#f8d7da")),
          color = DT::styleEqual(c("Pass", "Fail"), c("#155724", "#721c24")),
          fontWeight = 'bold'
        )
    })
    
    return(final_settings)
  })
}

