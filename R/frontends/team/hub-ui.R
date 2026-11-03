# Team presentation for the shared data hub. Server and science remain in R/modules/1_shared_data_module.R.
shared_data_ui <- function(id) {
  ns <- NS(id)
  
  tagList(
    tags$div(
      class = "sidebar-main-container dock-unified-container",
      id = "main_sidebar_container",
      
      # 1. Segmented Mode Switcher (Unified Dock Navigation)
      tags$div(
        class = "dock-segmented-switcher",
        tags$button(
          type = "button",
          class = "dock-segment-btn active",
          `data-dock-target` = "pipeline",
          tags$i(class = "fas fa-play-circle"),
          tags$span("Pipeline")
        ),
        tags$button(
          type = "button",
          class = "dock-segment-btn",
          `data-dock-target` = "cohorts",
          tags$i(class = "fas fa-filter"),
          tags$span("Cohorts & Filters")
        ),
        tags$button(
          type = "button",
          class = "dock-segment-btn",
          `data-dock-target` = "plot_controls",
          tags$i(class = "fas fa-sliders-h"),
          tags$span("Plot Controls")
        )
      ),

      # 2. Panel 1: [Global Pipeline]
      tags$div(
        id = "dock_panel_pipeline",
        class = "dock-panel active",
        
        # Section: Pipeline Execution
        tags$div(
          class = "dock-section",
          tags$div(class = "dock-section-title", tags$i(class = "fas fa-play text-primary"), " Preparation"),
          uiOutput(ns("pipelineStatusUI")),
          uiOutput(ns("preparationSummary")),
          actionButton(ns("runAnalysis"), "Prepare data", icon = icon("play"), class = "btn-primary btn-run-analysis sidebar-btn-centered w-100 mb-2"),
          guide_link("Review design",step=2)
        )
      ),

      # 3. Panel 2: [Cohort & Filters]
      tags$div(
        id = "dock_panel_cohorts",
        class = "dock-panel",
        accordion(
          id = ns("cohorts_accordion"),
          open = c("Differential Expression"),
          multiple = TRUE,

          # Sample Selection
          accordion_panel(
            "Sample Selection",
            icon = icon("vials"),
            tags$div(
              class = "d-flex gap-2 justify-content-center mb-2",
              actionButton(ns("selectAll"), "Select All", icon = icon("check-square"), class = "btn-sm btn-outline-secondary w-50 sidebar-btn-centered"),
              actionButton(ns("unselectAll"), "Unselect All", icon = icon("square"), class = "btn-sm btn-outline-secondary w-50 sidebar-btn-centered")
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("filter"), " Subgroup Quick-Selection"),
              uiOutput(ns("subgroupSelectorUI"))
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("list-check"), " Individual Samples"),
              tags$div(
                style = "max-height: 200px; overflow-y: auto; overflow-x: hidden; padding-right: 2px;",
                uiOutput(ns("columnSelectorUI"))
              )
            ),
            tags$div(
              class = "dock-group-block bg-light-subtle p-2 rounded",
              checkboxInput(
                ns("useAveragedSubstitution"), 
                tags$span(
                  "Preserve matrix: Use group average for unchecked samples",
                  tags$span(class = "badge bg-danger ms-1", style = "font-size: 0.68rem; vertical-align: middle;", "Caution"),
                  bslib::tooltip(
                    icon("triangle-exclamation", style = "margin-left: 5px; color: #dc2626; cursor: pointer;"),
                    "CAUTION: Replacing unchecked sample values with their group average artificially deflates within-group variance and inflates residual degrees of freedom in downstream models. This can generate anti-conservative false-positive discoveries. Only intended for visualization preservation."
                  )
                ), 
                FALSE
              )
            )
          ),

          # Differential Expression
          accordion_panel(
            "Differential Expression",
            icon = icon("scale-balanced"),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("calculator"), " Statistical Method"),
              selectInput(
                ns("deMethod"),
                tags$span(
                  "Method:",
                  bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
                                "Selects the type of statistical test. Automatic mode chooses between parametric (limma) and non-parametric tests based on sample size and distributions.")
                ), 
                choices = c("Automatic mode (limma vs Wilcoxon/Kruskal-Wallis)" = "auto",
                            "limma package: Standard Parametric (moderated t-test / ANOVA)" = "limma", 
                            "Standard Non-Parametric (Wilcoxon / Kruskal-Wallis)" = "non_parametric"), 
                selected = "auto",
                width = "100%"
              )
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("layer-group"), " Grouping Factors"),
              checkboxInput(ns("deOrientGroup1"), tags$span("Group by Group1", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Uses the experimental Group1 classification column (e.g. Treated vs Control, Wildtype vs Mutant) to define contrast cohort groups.")), TRUE),
              checkboxInput(ns("deOrientGroup2"), tags$span("Group by Group2", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Uses the cell lineage or tissue Group2 classification column (e.g. Neutrophils, Macrophages) to define contrast cohort groups.")), TRUE),
              tags$div(
                id = ns("deOrientTimePointContainer"),
                class = "timepoint-checkbox-container control-disabled-greyed",
                style = "opacity: 0.52; cursor: not-allowed; transition: opacity 0.2s ease;",
                {
                  cb <- checkboxInput(
                    ns("deOrientTimePoint"),
                    tags$span(
                      "Group by Time Point",
                      bslib::tooltip(
                        tags$span(
                          class = "tp-info-tooltip-trigger",
                          style = "cursor: pointer; pointer-events: auto; display: inline-block;",
                          icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;")
                        ),
                        tags$span(
                          "Check if timepoint has been mapped to a specific group in the metadata mapping. ",
                          tags$a(
                            href = "#",
                            class = "open-meta-mapping-link",
                            onclick = "window.triggerOpenMetadataMapping(event); return false;",
                            "Open Metadata Mapping",
                            style = "color: #93c5fd; text-decoration: underline; font-weight: 600; cursor: pointer; display: inline;"
                          )
                        ),
                        options = list(delay = list(show = 50, hide = 500))
                      )
                    ),
                    FALSE
                  )
                  cb$children[[1]]$children[[1]]$children[[1]]$attribs$disabled <- "disabled"
                  cb
                }
              )
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("code-compare"), " Compared Analysis"),
              radioButtons(
                ns("deComparisonMode"),
                tags$span("Mode:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Direct compares groups against each other. Interaction tests whether the difference between Group 1 levels varies across Group 2 levels or timecourses (e.g., if the treatment effect is different in WT compared to KO).")),
                choices = c("Direct" = "direct", "Interaction" = "interaction"),
                inline = TRUE
              ),
              conditionalPanel("input.deComparisonMode == 'direct'", ns = ns,
                uiOutput(ns("deReferenceGroupUI")),
                uiOutput(ns("deComparisonGroupUI"))
              ),
              conditionalPanel("input.deComparisonMode == 'interaction'", ns = ns,
                uiOutput(ns("deInteractionGroupUI"))
              )
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("sliders"), " Significance & Effect Cutoffs"),
              radioButtons(
                ns("pValueType"),
                tags$span("P-value Type:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Adjusted (BH-FDR) applies a more stringent p-value calculation to correct for multiple testing, reducing false positives.")), 
                choices = c("Adjusted (BH-FDR)" = "adjusted", "Raw (uncorrected)" = "raw"),
                selected = "adjusted",
                inline = TRUE
              ),
              tags$div(
                class = "row g-2 mt-1",
                tags$div(
                  class = "col-6",
                  numericInput(
                    ns("pFilterThreshold"),
                    tags$span(
                      "Threshold <",
                      bslib::tooltip(
                        icon("circle-info", style = "margin-left: 4px; color: #6c757d; cursor: pointer;"),
                        "Applies a statistical significance filter cutoff. Only lipid species with a p-value (raw or BH-FDR adjusted) strictly below this cutoff are classified as statistically significant."
                      )
                    ),
                    0.05,
                    step = 0.01,
                    width = "100%"
                  )
                ),
                tags$div(
                  class = "col-6",
                  numericInput(
                    ns("log2fcThreshold"),
                    tags$span(
                      "|Log2FC| >=",
                      bslib::tooltip(
                        icon("circle-info", style = "margin-left: 4px; color: #6c757d; cursor: pointer;"),
                        "Applies a biological effect size filter cutoff. Requires the absolute log2 fold change (|Log2FC|) between comparison and reference groups to meet or exceed this value."
                      )
                    ),
                    1,
                    step = 0.1,
                    width = "100%"
                  )
                )
              )
            )
          ),

          # Lipid Class Filters
          accordion_panel(
            "Lipid Class Filters",
            icon = icon("filter"),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("sitemap"), " Classification Hierarchy"),
              uiOutput(ns("hyperclassSelectorUI")),
              uiOutput(ns("subclassSelectorUI"))
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("vial"), " Modifications & Mediators"),
              uiOutput(ns("modificationSelectorUI")),
              uiOutput(ns("lipidMediatorSpeciesSelectorUI"))
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("arrows-split-up-and-left"), " Class Splitting"),
              uiOutput(ns("splitControlUI"))
            )
          ),

          # Advanced Filters
          accordion_panel(
            "Advanced Saturation & Chains",
            icon = icon("flask"),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("atom"), " Saturation Features"),
              checkboxGroupInput(ns("selectedSaturationFeatures"), NULL, choices = c("SFA", "MUFA", "PUFA"), inline = TRUE)
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("ruler-horizontal"), " Chain Length Features"),
              checkboxGroupInput(ns("selectedLengthFeatures"), NULL, choices = c("SCFA", "MCFA", "LCFA", "VLCFA"), inline = TRUE)
            )
          ),

          # Granular Chain Filters
          accordion_panel(
            "Granular Chain Filters",
            icon = icon("ruler"),
            tags$div(
              class = "dock-group-block mb-2",
              checkboxInput(ns("activateGranularFiltering"), tags$span("Activate Granular Filtering", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Enables structural filtering to restrict analysis to lipids with specific fatty acid carbon lengths or double bond counts.")), FALSE),
              conditionalPanel("input.activateGranularFiltering == true", ns = ns,
                tags$hr(class = "my-2"),
                checkboxInput(ns("useCombo1"), tags$span("Combo 1", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Applies custom structural filter criteria for designated lipid classes.")), TRUE),
                uiOutput(ns("combo1SlidersUI")),
                tags$hr(class = "my-2"),
                checkboxInput(ns("useCombo2"), tags$span("Combo 2", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Applies custom structural filter criteria for designated lipid classes.")), FALSE),
                uiOutput(ns("combo2SlidersUI")),
                tags$hr(class = "my-2"),
                radioButtons(ns("granularOrderMode"), tags$span("Logic:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Ignore Order applies filtering rules to any fatty acid chain. Respect Order enforces rules based on sequence.")), choices = c("Ignore Order" = "ignore", "Respect Order" = "respect"), selected = "ignore", inline = TRUE)
              )
            )
          ),

          # Substrate Filters
          accordion_panel(
            "Pathway Substrates",
            icon = icon("dna"),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("dna"), " n-6 Pathway Substrates"),
              checkboxGroupInput(ns("n6_substrates"), NULL, choices = c("AA (20:4)"="20:4", "DGLA (20:3)"="20:3", "AdA (22:4)"="22:4"), inline = TRUE)
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("dna"), " n-3 Pathway Substrates"),
              checkboxGroupInput(ns("n3_substrates"), NULL, choices = c("EPA (20:5)"="20:5", "DHA (22:6)"="22:6", "DPA (22:5)"="22:5"), inline = TRUE)
            ),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("crosshairs"), " Acyl Position"),
              radioButtons(ns("substrate_match_positions"), NULL, choices = c("Any"="any", "sn-1"="sn1", "sn-2"="sn2"), selected = "any", inline = TRUE)
            )
          ),

          # Global Color Customization
          accordion_panel(
            "Colors & palettes",
            icon = icon("palette"),
            tags$div(class = "dock-group-block mb-2",
              tags$p(class="text-muted", style="font-size: 0.76rem;", "Use a preset or save your own colors for consistent charts."),
              actionButton(ns("open_palette_editor"), "Open colors & palettes", icon = icon("palette"), class = "btn-primary w-100")
            )
          )
        )
      ),

      # 4. Panel 3: [Plot Controls]
      tags$div(
        id = "dock_panel_plot_controls",
        class = "dock-panel",
        tags$div(
          class = "dock-context-header d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom",
          tags$div(
            class = "d-flex align-items-center gap-2",
            tags$i(id = "dock_active_module_icon", class = "fas fa-sliders-h text-primary"),
            tags$span(id = "dock_active_module_title", class = "fw-bold text-dark", style = "font-size: 0.85rem; letter-spacing: -0.01em;", "Module Controls")
          )
        ),
        tags$div(
          id = "docked_active_plot_controls",
          class = "dock-plot-controls-container",
          tags$div(
            class = "dock-empty-state text-center text-muted py-4 px-2",
            tags$i(class = "fas fa-chart-simple fa-2x mb-2 text-secondary opacity-50"),
            tags$p(class = "small mb-0", "Select any analytical subtab from the top navigation to view and configure its parameters here.")
          )
        )
      )
    )
  )
}

# Server logic
