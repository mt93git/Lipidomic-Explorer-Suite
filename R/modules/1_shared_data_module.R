# R/modules/1_shared_data_module.R
# Shared functionality and data hub.

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
        
        # Section: Data Ingestion
        tags$div(
          class = "dock-section",
          tags$div(class = "dock-section-title", tags$i(class = "fas fa-cloud-arrow-up text-primary"), " Upload Data File(s)"),
          div(
            class = "data-upload-container",
            fileInput(ns("files"), label = NULL, multiple = TRUE, accept = c(".csv", ".xlsx", ".xls")),
            uiOutput(ns("loaded_files_display"))
          )
        ),

        # Section: Pipeline Execution
        tags$div(
          class = "dock-section",
          tags$div(class = "dock-section-title", tags$i(class = "fas fa-play text-primary"), " Pipeline Execution"),
          uiOutput(ns("pipelineStatusUI")),
          actionButton(ns("runAnalysis"), "Run Analysis", icon = icon("play"), class = "btn-primary btn-run-analysis sidebar-btn-centered w-100 mb-2"),
          actionButton(ns("openMetadataMappingBtn"), "Metadata Mapping", icon = icon("gears"), class = "btn-outline-primary btn-metadata-mapping sidebar-btn-centered w-100 mb-2"),
          actionButton(
            ns("downloadPostNAData"),
            label = tags$span(
              "Download Imputed CSV",
              bslib::tooltip(
                icon("circle-info", style = "margin-left: 6px; color: #047857; cursor: pointer;", onclick = "event.stopPropagation();"),
                "Downloads the loaded dataset preprocessed through the standard bioinformatics pipeline: (1) Sample selection and outlier filtering; (2) Per-file zero-to-missing detection; (3) Log2 scale transformation; (4) Left-censored missing value imputation via QRILC (Quantile Regression for Left-Censored data); (5) Sample-wise abundance normalization; and (6) Restitution to the linear abundance scale."
              )
            ),
            icon = icon("file-arrow-down"),
            class = "btn-download-post-na sidebar-btn-centered w-100"
          ),
          # Hidden programmatic direct download trigger (for single-click export when no outliers are treated)
          tags$div(
            style = "position: absolute; width: 0; height: 0; overflow: hidden; opacity: 0; pointer-events: none;",
            downloadButton(ns("downloadPostNADataDirect"), label = "Direct Download")
          )
        ),

        # Section: Session Persistence
        tags$div(
          class = "dock-section border-0",
          tags$div(class = "dock-section-title", tags$i(class = "fas fa-floppy-disk text-secondary"), " Session Persistence"),
          tags$label(class = "control-label small text-muted mb-1", "Import Session (.zip):"),
          fileInput(ns("import_session_file"), NULL, accept = c(".zip"), width = "100%"),
          uiOutput(ns("import_status_display")),
          downloadButton(ns("export_session_btn"), "Export Session", class = "btn-secondary btn-export-session sidebar-btn-centered w-100 mt-2")
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
            "Global Colors",
            icon = icon("palette"),
            tags$div(
              class = "dock-group-block mb-2",
              tags$div(class = "dock-group-label", icon("palette"), " Color Configuration Context"),
              tags$p(class="text-muted", style="font-size: 0.76rem; margin-bottom: 6px;", "Customize colors for sample groups, lipid classes, and structural categories globally across all tabs."),
              selectInput(
                ns("colorEditMode"),
                "Select Color Context:", 
                choices = c("Sample Groups (Group1)" = "Group1",
                            "Sample Groups (Group2)" = "Group2",
                            "Composite Groups (Group1 & Group2)" = "Group1_Group2",
                            "Lipid Main Class" = "Lipid Class", 
                            "Lipid Category" = "Hyperclass"),
                selected = "Group1",
                width = "100%"
              ),
              uiOutput(ns("classColorUI")),
              actionButton(ns("btn_apply_colors"), "Apply Color Changes", icon = icon("palette"), class = "btn-success sidebar-btn-centered w-100 mt-2")
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

shared_data_server <- function(id, external_settings = reactive(NULL), welcome_load_demo_trigger = NULL) {
  moduleServer(id, function(input, output, session) {
    
    SHAPE_CHOICES <- c("Circle"=16, "Square"=15, "Triangle"=17, "Diamond"=18, "Plus"=3, "Cross"=4, "Star"=8)
    
    # Helper to extract numeric or time-suffix at the end of a string
    extract_embedded_timepoint <- function(x) {
      m <- regexpr("[0-9]+([a-zA-Z]+)?$", x)
      if (m != -1) {
        regmatches(x, m)
      } else {
        x
      }
    }
    
    # Helper to resolve embedded metadata, overriding TimePoint and stripping suffixes from carriers
    resolve_embedded_metadata <- function(full_meta, parsed_df, has_embedded, tp_map, schema, input) {
      if (has_embedded != "Yes") return(full_meta)
      
      # Determine which categories are carriers
      tp_carriers <- character(0)
      if (!is.null(schema)) {
        for (comp_name in names(schema)) {
          if (schema[[comp_name]] == "Ignore" || schema[[comp_name]] == "TimePoint") next
          checkbox_id <- paste0("schema_has_tp_", comp_name)
          val <- tryCatch(input[[checkbox_id]], error = function(e) FALSE)
          if (isTRUE(val)) {
            tp_carriers <- c(tp_carriers, schema[[comp_name]])
          }
        }
      }
      tp_carriers <- unique(tp_carriers)
      
      new_tps <- sapply(seq_len(nrow(full_meta)), function(i) {
        # Check all possible carrier categories mapped to their term columns in parsed_df
        for (carrier in tp_carriers) {
          term_key <- if (carrier == "Group1") {
            parsed_df$Group1Term[i]
          } else if (carrier == "Group2") {
            parsed_df$Group2Term[i]
          } else if (carrier == "Replicate") {
            parsed_df$ReplicateTerm[i]
          } else if (carrier == "PatientNumber") {
            parsed_df$PatientTerm[i]
          } else {
            NA_character_
          }
          
          if (!is.na(term_key) && term_key %in% names(tp_map) && nzchar(tp_map[[term_key]])) {
            return(tp_map[[term_key]])
          }
        }
        return(full_meta$TimePoint[i])
      })
      full_meta$TimePoint <- as.character(new_tps)
      
      extract_shared_root <- function(term, tp) {
        if (is.na(term) || is.na(tp) || !nzchar(tp)) return(term)
        term_lower <- tolower(term)
        tp_lower <- tolower(tp)
        if (endsWith(term_lower, tp_lower)) {
          suffix_len <- nchar(tp)
          root <- substr(term, 1, nchar(term) - suffix_len)
          root <- sub("[_-]+$", "", root)
          if (nzchar(root)) return(root)
        }
        return(term)
      }
      
      for (carrier in tp_carriers) {
        if (carrier %in% colnames(full_meta)) {
          clean_vals <- sapply(seq_len(nrow(full_meta)), function(i) {
            orig_val <- full_meta[[carrier]][i]
            
            term_key <- if (carrier == "Group1") {
              parsed_df$Group1Term[i]
            } else if (carrier == "Group2") {
              parsed_df$Group2Term[i]
            } else if (carrier == "Replicate") {
              parsed_df$ReplicateTerm[i]
            } else if (carrier == "PatientNumber") {
              parsed_df$PatientTerm[i]
            } else {
              orig_val
            }
            
            if (!is.na(term_key) && term_key %in% names(tp_map) && nzchar(tp_map[[term_key]])) {
              root <- extract_shared_root(term_key, tp_map[[term_key]])
              return(root)
            }
            return(orig_val)
          })
          full_meta[[carrier]] <- as.character(clean_vals)
        }
      }
      return(full_meta)
    }
    
    rv <- reactiveValues(
        uploads = list(), # Now stores PATHS only
        origin_colors = list(), # Persistent store for Origin Colors
        species_colors = list(), # Persistent store for Species Colors
        transcriptomics_upload = NULL, # Stores transcriptomics data name & path
        multiomics_cohort_map = list(), # Custom 2-column cohort mapping
        lipidomics_confirmed = FALSE,
        selected_mapping_tab = "Lipidomics",
        timepoint_was_available = FALSE
    )
    
    is_restoring <- reactiveVal(FALSE)
    metadata_trigger <- reactiveVal(0)
    run_analysis_trigger_val <- reactiveVal(0)
    analysis_is_fresh <- reactiveVal(FALSE)
    saved_timecourses <- reactiveVal(list())
    saved_patient_groups <- reactiveVal(list())
    saved_designer_cases <- reactiveVal(list())
    saved_timepoint_order_prefs <- reactiveVal(NULL)
    saved_level_prefs <- reactiveVal(list())
    restored_inputs <- reactiveVal(list())
    prev_subclass_choices <- reactiveVal(character(0))
    prev_hyperclass_choices <- reactiveVal(character(0))
    prev_lm_species_choices <- reactiveVal(character(0))
    actual_method_val <- reactiveVal("limma")
    stats_detail_text <- reactiveVal("No statistical detail available yet. Click 'Show Statistic Detail' in any visualization tab to view its mathematical analysis.")
    stats_detail_type <- reactiveVal("text")
    stats_detail_html <- reactiveVal(NULL)
    selected_violin_lipids <- reactiveVal(character(0))
    
    get_restored_input <- function(id, default = NULL) {
      inputs <- restored_inputs()
      if (id %in% names(inputs)) return(inputs[[id]])
      ns_id <- session$ns(id)
      if (ns_id %in% names(inputs)) return(inputs[[ns_id]])
      
      clean_id <- gsub("^.*?-", "", id)
      if (clean_id %in% names(inputs)) return(inputs[[clean_id]])
      for (k in names(inputs)) {
        if (grepl(paste0("-", id, "$"), k) || grepl(paste0("-", clean_id, "$"), k)) {
          return(inputs[[k]])
        }
      }
      return(default)
    }
    
    # (authorizeMetadata observer is consolidated atomically below with modal dismissal and telemetry)
    
    # Helper for dataset check
    load_default_if_needed <- function() {
      return(FALSE)
    }

    observeEvent(input$runAnalysis, {
      ts <- format(Sys.time(), "%H:%M:%S")
      cat(sprintf("[LIPIDOMIC EXPLORER %s] 'Run Analysis' action triggered.\n", ts))
      cat(sprintf("  >> Staged uploaded file(s): %d\n", length(rv$uploads)))
      if (length(rv$uploads) == 0) {
        cat("  >> [STATUS] No uploaded data files present. Prompting user to upload data.\n")
        flush.console()
        showNotification("Please upload your data and metadata files in the Pipeline tab first.", type = "warning", duration = 5)
        return()
      }
      cat("  >> [STATUS] Triggering fresh analysis execution across all data modules...\n")
      flush.console()
      rv$lipidomics_confirmed <- TRUE
      metadata_trigger(isolate(metadata_trigger()) + 1)
      analysis_is_fresh(TRUE)
      run_analysis_trigger_val(isolate(run_analysis_trigger_val()) + 1)
      session$sendCustomMessage("pipelineExecutionActive", list(status = "running"))
    })

    observeEvent(input$ensure_analysis_run, {
      if (length(rv$uploads) == 0) {
        return()
      }
      if (is.null(data_processed()) || !isTRUE(analysis_is_fresh())) {
        rv$lipidomics_confirmed <- TRUE
        analysis_is_fresh(TRUE)
        run_analysis_trigger_val(isolate(run_analysis_trigger_val()) + 1)
        session$sendCustomMessage("pipelineExecutionActive", list(status = "running"))
      }
    })

    output$pipelineStatusUI <- renderUI({
      if (length(rv$uploads) == 0) {
        return(tags$div(
          class = "pipeline-status-badge d-flex align-items-center justify-content-between px-2 py-1 mb-2 rounded border",
          style = "background: #f8fafc; border-color: #e2e8f0 !important; font-size: 11px; color: #64748b;",
          tags$span(icon("clock", class = "me-1 text-secondary"), "Pipeline: Awaiting file upload"),
          tags$span(class = "badge bg-secondary text-white", "Idle")
        ))
      }
      
      dp <- tryCatch(data_processed(), error = function(e) NULL)
      if (!is.null(dp) && isTRUE(analysis_is_fresh())) {
        n_lipids <- nrow(dp)
        return(tags$div(
          class = "pipeline-status-badge d-flex align-items-center justify-content-between px-2 py-1 mb-2 rounded border",
          style = "background: #f0fdf4; border-color: #bbf7d0 !important; font-size: 11px; color: #166534;",
          tags$span(
            icon("circle-check", class = "text-success me-1"),
            tags$strong("Base Pipeline:"), sprintf(" Active (%d lipids)", n_lipids)
          ),
          tags$span(class = "badge bg-success text-white", "Ready")
        ))
      }
      
      tags$div(
        class = "pipeline-status-badge d-flex align-items-center justify-content-between px-2 py-1 mb-2 rounded border",
        style = "background: #eff6ff; border-color: #bfdbfe !important; font-size: 11px; color: #1e40af;",
        tags$span(icon("circle-dot", class = "text-primary me-1"), "Data Selected: Ready to Run Pipeline"),
        tags$span(class = "badge bg-primary text-white", "Active")
      )
    })
    outputOptions(output, "pipelineStatusUI", suspendWhenHidden = FALSE)

    observe({
      dp <- tryCatch(data_processed(), error = function(e) NULL)
      if (!is.null(dp) && isTRUE(analysis_is_fresh())) {
        updateActionButton(session, "runAnalysis", label = " Re-run Pipeline", icon = icon("rotate"))
      } else {
        updateActionButton(session, "runAnalysis", label = " Run Analysis", icon = icon("play"))
      }
    })
    
    observeEvent(input$launch_default_analysis, {
      cat(file=stderr(), "\n[DEBUG] --- launch_default_analysis Triggered ---\n")
      if (length(rv$uploads) == 0) {
        showNotification("Please upload your data and metadata files in the Pipeline tab first.", type = "warning", duration = 5)
        return()
      }
      
      # 1. Reset parameters to default
      updateSelectInput(session, "deMethod", selected = "auto")
      updateRadioButtons(session, "pValueType", selected = "adjusted")
      updateNumericInput(session, "pFilterThreshold", value = 0.05)
      updateNumericInput(session, "log2fcThreshold", value = 1)
      updateCheckboxInput(session, "activateGranularFiltering", value = FALSE)
      updateCheckboxInput(session, "useAveragedSubstitution", value = FALSE)
      
      # 3. Trigger fresh analysis run
      rv$lipidomics_confirmed <- TRUE
      metadata_trigger(isolate(metadata_trigger()) + 1)
      analysis_is_fresh(TRUE)
      run_analysis_trigger_val(isolate(run_analysis_trigger_val()) + 1)
    })

    # Alert notification on synthetic average substitution activation
    observeEvent(input$useAveragedSubstitution, {
      if (isTRUE(input$useAveragedSubstitution)) {
        showNotification(
          "Warning: Synthetic group-average substitution artificially deflates within-group variance and inflates degrees of freedom, which may create anti-conservative false positives in differential expression. Not recommended for statistical hypothesis testing.",
          type = "warning",
          duration = 10
        )
      }
    }, ignoreInit = TRUE)

  # --- HELPER: Detect File Type ---
    detect_file_type <- function(fp) {
        if(!file.exists(fp)) return("unknown")
        
        is_csv <- grepl("\\.csv$", fp, ignore.case = TRUE)
        header <- if (is_csv) {
            tryCatch(
                read.csv(fp, nrows = 5, check.names = FALSE),
                error = function(e) return(NULL)
            )
        } else {
            tryCatch(
                readxl::read_excel(fp, n_max = 5, .name_repair = "minimal"), 
                error = function(e) return(NULL)
            )
        }
        if(is.null(header)) return("unknown")
        
        cols <- colnames(header)
    # Signature: Lipid Mediator (Cols are Lipids like PGD2, PGE2) OR Col 1 is "Sample_Name"
    # Signature: Global Lipidomics (Cols are Samples like Vehicle-..., Col 1 is Lipid name like "CE(...)")
        
    # Heuristic 1: Check Col 1 Name
        col1 <- cols[1]
        
    # Heuristic 2: Check standard Mediator names in columns
        mediator_candidates <- c("PGD2", "PGE2", "LXA4", "RvD1", "Maresin", "TXB2")
        matches_mediator_cols <- sum(mediator_candidates %in% cols) > 0
        
    # Heuristic 3: Check Row Content (Global has Lipid Strings in Col 1)
        first_col_vals <- as.character(header[[1]])
        has_lipid_strings <- any(grepl("^(CE|PC|PE|SM|LPC)\\(", first_col_vals))
        
        if (matches_mediator_cols) {
            return("mediator")
        } else if (has_lipid_strings) {
            return("global")
        } else {
      # Fallback based on "Sample Name" vs "Sample_Name" if strict
            if (grepl("Sample_Name", col1)) return("mediator") # Usually usage in current Mediator files
            if (grepl("Sample Name", col1)) return("global")
            return("global") # Default
        }
    }

    observeEvent(input$files, {
      req(input$files)
      cat(sprintf("\n[LIPIDOMIC EXPLORER] Received upload of %d file(s):\n", nrow(input$files)))
      metadata_restored(FALSE)
      current_files <- rv$uploads
      for (i in seq_len(nrow(input$files))) {
        file_info <- input$files[i, ]
        cat(sprintf("  [%d/%d] '%s' (%.2f MB)\n", i, nrow(input$files), file_info$name, file_info$size / (1024^2)))
        if (!file_info$name %in% names(current_files)) {
          dest_dir <- file.path("data", "user_uploads")
          if (!dir.exists(dest_dir)) dir.create(dest_dir, recursive = TRUE)
          
          # Make a unique filename to prevent conflicts
          safe_fname <- make.unique(c(names(current_files), file_info$name))[length(current_files) + 1]
          dest_path <- file.path(dest_dir, safe_fname)
          if (normalizePath(file_info$datapath, mustWork = FALSE) != normalizePath(dest_path, mustWork = FALSE)) {
            file.copy(file_info$datapath, dest_path, overwrite = TRUE)
          }
          
          current_files[[file_info$name]] <- dest_path
          cat(sprintf("        -> Staged to: %s\n", dest_path))
        }
      }
      flush.console()
      rv$lipidomics_confirmed <- FALSE
      analysis_is_fresh(FALSE)
      rv$uploads <- purrr::compact(current_files)
      session$sendCustomMessage("dataFilesUploaded", list(count = nrow(input$files)))
    })
    
    # (Demo loading observers removed - buttons not active in UI)
    
    observe({
      req(names(rv$uploads))
      lapply(names(rv$uploads), function(filename) {
        safe_id <- make.names(filename)
        observeEvent(input[[paste0("remove_", safe_id)]], {
          current_uploads <- rv$uploads
          current_uploads[[filename]] <- NULL
          rv$uploads <- current_uploads
          metadata_restored(FALSE)
        })
      })
    })
    
    output$loaded_files_display <- renderUI({
      files <- names(rv$uploads)
      if (length(files) == 0) return(NULL)
      tags$div(
        class = "mt-2 p-1 px-2 border rounded loaded-files-card",
        style = "background: #f8fafc; border-color: #e2e8f0 !important; font-size: 0.72rem;",
        lapply(files, function(filename) {
          safe_id <- make.names(filename)
          tags$div(
            class = "d-flex justify-content-between align-items-center py-1",
            style = "border-bottom: 1px dashed #e2e8f0; gap: 6px;",
            tags$span(
              class = "loaded-file-name text-truncate",
              style = "font-size: 0.72rem; line-height: 1.25; color: #334155; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; word-break: break-all; flex-grow: 1;",
              title = filename,
              filename
            ),
            actionButton(session$ns(paste0("remove_", safe_id)), icon("times"), 
                         class = "btn-sm btn-link text-danger p-0", 
                         style = "text-decoration: none; font-size: 0.75rem; min-width: 18px; line-height: 1;",
                         title = "Remove this file")
          )
        })
      )
    })
    
    # (Transcriptomics processing and uploader logic removed)
    gene_raw_data <- reactive(NULL)
    gene_expression_matrix <- reactive(NULL)
    gene_de_results <- reactive(NULL)
    audit_trace_data <- reactiveVal(NULL)

    # Helper to get active metadata: filters by data_processed() if available, otherwise returns all parsed metadata
    get_active_metadata <- reactive({
      meta <- allParsedMetadata()
      if (is.null(meta) || nrow(meta) == 0) {
        p_struct <- tryCatch(parsedMetadataStructure(), error = function(e) NULL)
        if (!is.null(p_struct) && !is.null(p_struct$parsed_df) && nrow(p_struct$parsed_df) > 0) {
          meta <- p_struct$parsed_df
        } else {
          return(NULL)
        }
      }
      
      dp <- tryCatch(data_processed(), error = function(e) NULL)
      if (!is.null(dp) && (is.data.frame(dp) || is.matrix(dp)) && ncol(dp) > 0) {
        meta <- meta %>% dplyr::filter(FullName %in% colnames(dp))
      } else {
        rd <- tryCatch(rawData(), error = function(e) NULL)
        if (!is.null(rd) && !is.null(rd$data) && (is.data.frame(rd$data) || is.matrix(rd$data)) && ncol(rd$data) > 0) {
          meta <- meta %>% dplyr::filter(FullName %in% colnames(rd$data))
        }
      }
      meta
    })

    # (Multi-omics alignment and mapping modal logic removed)
    
    # Consolidated into authorizeMetadata observer

    activeFiles <- reactive({
      files_to_process <- list()
      if (length(rv$uploads) > 0) {
          files_to_process <- c(files_to_process, rv$uploads)
      }
      files_to_process[!duplicated(names(files_to_process))]
    })
    
    rawData <- reactive({
      files_to_process <- activeFiles()
      shiny::validate(shiny::need(length(files_to_process) > 0, "No data files found. Please upload or ensure data directories exist."))
      
      log_ingestion_event("2_RAWDATA_REACTIVE_TRIGGERED", "START",
        sprintf("rawData reactive triggered for %d active file(s)", length(files_to_process)),
        list(active_files = names(files_to_process))
      )
      
      withProgress(message = "Ingesting and parsing datasets...", value = 0, {
        n_files <- length(files_to_process)
        parsed_data <- lapply(seq_along(files_to_process), function(i) {
          fname <- names(files_to_process)[i]
          fp <- files_to_process[[i]]
          setProgress(value = (i - 1) / n_files, detail = paste("Reading file:", fname))
          
          # Detect Type
          ftype <- detect_file_type(fp)
          log_ingestion_event("2_FILE_TYPE_DETECTED", "INFO",
            sprintf("File [%d/%d] '%s' detected as format: '%s'", i, n_files, fname, ftype),
            list(file = fname, detected_type = ftype, path = fp)
          )
          
          if (ftype == "global") {
              if (grepl("\\.csv$", fp, ignore.case = TRUE)) {
                   df <- read.csv(fp, check.names=FALSE)
                   if(!"Lipid_Name" %in% names(df)) names(df)[1] <- "Lipid_Name" # Assumption
                   return(df)
              } else {
                   return(load_one_file(fp, fname))
              }
          } else if (ftype == "mediator") {
               allSheets <- tryCatch(readxl::excel_sheets(fp), error = function(e) character(0))
               if(length(allSheets) == 0) return(NULL)
               
               sheet_dfs <- lapply(allSheets, function(sht) {
                   df_raw <- tryCatch(readxl::read_xlsx(fp, sheet = sht, col_names = TRUE, .name_repair = "unique"), error = function(e) NULL)
                   if (is.null(df_raw)) return(NULL)
                   
                   sample_col <- colnames(df_raw)[1]
                   df_raw <- df_raw %>% dplyr::filter(!is.na(.[[1]]))
                   df_raw[[sample_col]] <- make.unique(as.character(df_raw[[sample_col]]))
                   
                   for (j in 2:ncol(df_raw)) if (!is.numeric(df_raw[[j]])) suppressWarnings(df_raw[[j]] <- as.numeric(as.character(df_raw[[j]])))
                   
                   mat <- as.matrix(df_raw[,-1, drop=FALSE])
                   rownames(mat) <- df_raw[[sample_col]]
                   
                   t_df <- as.data.frame(t(mat), stringsAsFactors = FALSE) %>%
                       tibble::rownames_to_column("Lipid_Name")
                   t_df
               })
               sheet_dfs <- sheet_dfs[!sapply(sheet_dfs, is.null)]
               if(length(sheet_dfs) == 0) return(NULL)
               purrr::reduce(sheet_dfs, function(x, y) full_join(x, y, by = "Lipid_Name"))
          } else {
              log_ingestion_event("2_FILE_UNKNOWN_TYPE", "WARNING",
                sprintf("File '%s' has unknown type. Skipping.", fname),
                list(file = fname, path = fp)
              )
              return(NULL)
          }
        })
        
        setProgress(value = 0.8, detail = "Merging file columns...")
        parsed_data <- parsed_data[!sapply(parsed_data, is.null)]
        if (length(parsed_data) == 0) {
          log_ingestion_event("2_RAWDATA_FAILED", "ERROR",
            "Failed to parse any valid data files from uploads.",
            list(attempted_files = names(files_to_process))
          )
          shiny::validate(shiny::need(FALSE, "Failed to parse any valid data files."))
          return(list(data = NULL, file_cols = list()))
        }
        
        merged_df <- purrr::reduce(parsed_data, function(x, y) full_join(x, y, by = "Lipid_Name"))
        
        setProgress(value = 0.9, detail = "Converting numeric data types...")
        merged_df <- merged_df %>% dplyr::mutate(across(-all_of("Lipid_Name"), as.numeric))
        file_cols <- list(setdiff(names(merged_df), "Lipid_Name")) # Simplified col tracking
        
        setProgress(value = 1.0, detail = "Completed Ingestion")
        
        sample_cols <- setdiff(names(merged_df), "Lipid_Name")
        log_ingestion_event("2_RAWDATA_COMPLETED", "SUCCESS",
          sprintf("Raw dataset successfully loaded: %d lipids x %d sample columns", nrow(merged_df), length(sample_cols)),
          list(
            total_lipids = nrow(merged_df),
            total_samples = length(sample_cols),
            first_samples = head(sample_cols, 6)
          )
        )
        list(data = merged_df, file_cols = file_cols)
      })
    })
    observeEvent(rawData(), {
      if (!isTRUE(isolate(rv$lipidomics_confirmed))) {
        analysis_is_fresh(FALSE)
      }
    })
    all_numeric_columns <- reactive({
      df_info <- rawData(); req(df_info$data)
      df_info$data %>% dplyr::select(where(is.numeric)) %>% names()
    })
    output$columnSelectorUI <- renderUI({
      cols <- all_numeric_columns(); req(cols)
      saved_cols <- get_restored_input(session$ns("selectedColumns"), cols)
      checkboxGroupInput(session$ns("selectedColumns"), "Select samples:", choices = cols, selected = saved_cols)
    })
    output$subgroupSelectorUI <- renderUI({
      cols <- all_numeric_columns(); req(cols)
      meta <- tryCatch(allParsedMetadata(), error = function(e) NULL)
      if (is.null(meta) || nrow(meta) == 0) return(NULL)
      
      # Filter for matching columns
      meta_matched <- meta %>% dplyr::filter(FullName %in% cols)
      if (nrow(meta_matched) == 0) return(NULL)
      
      combined_groups <- sapply(seq_len(nrow(meta_matched)), function(i) {
        g1 <- meta_matched$Group1[i]
        g2 <- meta_matched$Group2[i]
        parts <- c()
        if (!is.na(g1) && g1 != "Unspecified" && g1 != "") parts <- c(parts, g1)
        if (!is.na(g2) && g2 != "Unspecified" && g2 != "") parts <- c(parts, g2)
        if (length(parts) == 0) return("Other")
        paste(parts, collapse = "_")
      })
      meta_matched$Subgroup <- combined_groups
      
      unique_subgroups <- sort(unique(combined_groups))
      if (length(unique_subgroups) <= 1) return(NULL)
      
      # Build UI
      tags$div(
        class = "mt-2 p-2 border rounded bg-light",
        tags$strong("Select by Subgroup:", style = "font-size: 0.9rem; color: #495057; display: block; margin-bottom: 5px;"),
        tags$div(
          style = "display: flex; flex-wrap: wrap; gap: 8px;",
          lapply(unique_subgroups, function(sg) {
            sub_count <- sum(meta_matched$Subgroup == sg)
            tags$div(
              style = "background-color: #ffffff; border: 1px solid #dee2e6; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 500;",
              tags$span(sprintf("%s (%d)", sg, sub_count)),
              tags$span(
                style = "display: inline-flex; gap: 4px;",
                tags$a(
                  href = "#",
                  onclick = sprintf("Shiny.setInputValue('%s', {subgroup: '%s', action: 'all'}, {priority: 'event'}); return false;", session$ns("subgroupToggle"), sg),
                  class = "btn btn-xs btn-outline-success",
                  style = "padding: 1px 4px; font-size: 0.75rem; text-decoration: none;",
                  "All"
                ),
                tags$a(
                  href = "#",
                  onclick = sprintf("Shiny.setInputValue('%s', {subgroup: '%s', action: 'none'}, {priority: 'event'}); return false;", session$ns("subgroupToggle"), sg),
                  class = "btn btn-xs btn-outline-danger",
                  style = "padding: 1px 4px; font-size: 0.75rem; text-decoration: none;",
                  "None"
                )
              )
            )
          })
        )
      )
    })
    outputOptions(output, "columnSelectorUI", suspendWhenHidden = FALSE)
    outputOptions(output, "subgroupSelectorUI", suspendWhenHidden = FALSE)
    observeEvent(input$selectAll, { updateCheckboxGroupInput(session, "selectedColumns", selected = all_numeric_columns()) })
    observeEvent(input$unselectAll, { updateCheckboxGroupInput(session, "selectedColumns", selected = character(0)) })
    observeEvent(input$subgroupToggle, {
      trigger <- input$subgroupToggle
      req(trigger$subgroup, trigger$action)
      subgrp <- trigger$subgroup
      action <- trigger$action
      
      cols <- all_numeric_columns(); req(cols)
      meta <- tryCatch(allParsedMetadata(), error = function(e) NULL)
      req(meta)
      
      meta_matched <- meta %>% dplyr::filter(FullName %in% cols)
      req(nrow(meta_matched) > 0)
      
      combined_groups <- sapply(seq_len(nrow(meta_matched)), function(i) {
        g1 <- meta_matched$Group1[i]
        g2 <- meta_matched$Group2[i]
        parts <- c()
        if (!is.na(g1) && g1 != "Unspecified" && g1 != "") parts <- c(parts, g1)
        if (!is.na(g2) && g2 != "Unspecified" && g2 != "") parts <- c(parts, g2)
        if (length(parts) == 0) return("Other")
        paste(parts, collapse = "_")
      })
      meta_matched$Subgroup <- combined_groups
      
      current_selected <- input$selectedColumns
      target_samples <- meta_matched$FullName[meta_matched$Subgroup == subgrp]
      
      new_selected <- if (action == "all") {
        unique(c(current_selected, target_samples))
      } else {
        setdiff(current_selected, target_samples)
      }
      
      updateCheckboxGroupInput(session, "selectedColumns", selected = new_selected)
    })
  # Helper to retrieve settings safely
    get_setting <- function(name, default = NULL) {
      settings <- isolate(external_settings())
      if (is.null(settings) || is.null(settings[[name]])) return(default)
      settings[[name]]
    }

    # Reactive value for outlier trigger to prevent circular reactivity loops
    outlier_trigger_val <- reactiveVal(0)
    observe({
      settings <- external_settings()
      val <- if (!is.null(settings) && !is.null(settings$outlier_trigger)) settings$outlier_trigger else 0
      if (val != outlier_trigger_val()) {
        outlier_trigger_val(val)
      }
    })

    # Reactive value for data processing settings to prevent circular reactivity loops
    data_processing_settings <- reactiveVal(list())
    observe({
      settings <- external_settings()
      if (is.null(settings)) return()
      new_val <- list(
        normalizationMethod = settings$normalizationMethod,
        useImputation = settings$useImputation,
        imputeZerosPerFile = settings$imputeZerosPerFile,
        imputeRemainingNAtoZero = settings$imputeRemainingNAtoZero
      )
      if (!identical(data_processing_settings(), new_val)) {
        data_processing_settings(new_val)
      }
    })

    # Reactive value for PCA settings to prevent circular reactivity loops
    pca_settings_val <- reactiveVal(list(
      mergeReplicates = TRUE,
      pcaMode = "class",
      maxPCs = 3,
      dropMisc = TRUE
    ))
    observe({
      settings <- external_settings()
      if (is.null(settings)) return()
      new_val <- list(
        mergeReplicates = isTRUE(settings$mergeReplicates),
        pcaMode = settings$pcaMode %||% "class",
        maxPCs = settings$maxPCs %||% 3,
        dropMisc = isTRUE(settings$dropMisc)
      )
      if (!identical(pca_settings_val(), new_val)) {
        pca_settings_val(new_val)
      }
    })

    # Reactive value for color settings to prevent circular reactivity loops
    color_settings_val <- reactiveVal(list(
      colorGrouping = "Group1",
      useCustomColors = FALSE,
      custom_colors = list()
    ))
    observe({
      settings <- external_settings()
      if (is.null(settings)) return()
      new_val <- list(
        colorGrouping = settings$colorGrouping %||% "Group1",
        useCustomColors = isTRUE(settings$useCustomColors),
        custom_colors = settings$custom_colors %||% list()
      )
      if (!identical(color_settings_val(), new_val)) {
        color_settings_val(new_val)
      }
    })

    # Reactive value for shape settings to prevent circular reactivity loops
    shape_settings_val <- reactiveVal(list(
      shapeGrouping = "Group2",
      useShapes = FALSE,
      custom_shapes = list()
    ))
    observe({
      settings <- external_settings()
      if (is.null(settings)) return()
      new_val <- list(
        shapeGrouping = settings$shapeGrouping %||% "Group2",
        useShapes = isTRUE(settings$useShapes),
        custom_shapes = settings$custom_shapes %||% list()
      )
      if (!identical(shape_settings_val(), new_val)) {
        shape_settings_val(new_val)
      }
    })

    # Reactive value for BQC filter settings to prevent circular reactivity loops
    bqc_filter_settings_val <- reactiveVal(list(
      filterBqcOutliers = FALSE,
      bqcPassingLipids = NULL
    ))
    observe({
      settings <- external_settings()
      if (is.null(settings)) return()
      new_val <- list(
        filterBqcOutliers = isTRUE(settings$filterBqcOutliers),
        bqcPassingLipids = settings$bqcPassingLipids
      )
      if (!identical(bqc_filter_settings_val(), new_val)) {
        bqc_filter_settings_val(new_val)
      }
    })



    compute_imputed_matrix <- function(apply_outliers = TRUE) {
      df_info <- rawData()
      if (is.null(df_info) || is.null(df_info$data) || nrow(df_info$data) == 0) {
        return(NULL)
      }
      
      useCols <- input$selectedColumns
      if(is.null(useCols) || length(useCols) == 0) {
        # Fallback: if input is NULL (UI not ready) or empty, try to default to all numeric columns
        cols_all <- names(df_info$data)[sapply(df_info$data, is.numeric)]
        cols_all <- setdiff(cols_all, "Lipid_Name")
        if(length(cols_all) > 0) useCols <- cols_all
      }
      
      outlier_treatments <- get_setting("outlierTreatments", list())
      
      if (isTRUE(apply_outliers)) {
        for (name in names(outlier_treatments)) {
          act <- outlier_treatments[[name]]
          if (act %in% c("remove", "average")) {
            useCols <- setdiff(useCols, name)
          }
        }
      }
      
      if (length(useCols) == 0) return(NULL)
      data_subset <- df_info$data %>% dplyr::select(Lipid_Name, all_of(useCols))
        
      # External Setting: imputeZerosPerFile (default TRUE)
      if (isTRUE(get_setting("imputeZerosPerFile", TRUE))) {
        for (cols_in_file in df_info$file_cols) {
          data_subset <- impute_zeros_per_file(data_subset, cols_in_file)
        }
      }
      mat_subset <- data_subset %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      
      t_imp_start <- Sys.time()
      log_ingestion_event(
        stage = "6_IMPUTATION_NORMALIZATION_START",
        status = "START",
        message_text = sprintf("Starting Imputation & Normalization for %d samples across %d lipids.", ncol(mat_subset), nrow(mat_subset)),
        details = list(
          sample_count = ncol(mat_subset),
          lipid_count = nrow(mat_subset),
          samples = head(colnames(mat_subset), 6),
          useImputation = isTRUE(get_setting("useImputation", TRUE)),
          normalizationMethod = get_setting("normalizationMethod", "median")
        )
      )
      
      # --- LEGACY PIPELINE ALIGNMENT (v9.6) ---
      # 1. Log Transform Scaffolding
      mat_for_log <- mat_subset
      mat_for_log[mat_for_log <= 0] <- NA 
      mat_log <- log2(mat_for_log)
      
      # 2. Imputation (QRILC)
      qr_objs <- NULL
      if (isTRUE(get_setting("useImputation", TRUE))) {
        if (sum(is.na(mat_log)) > 0) {
          log_ingestion_event(
            stage = "6a_QRILC_IMPUTATION_RUNNING",
            status = "INFO",
            message_text = sprintf("Running QRILC imputation on %d missing values (%.1f%% of matrix)...",
                                   sum(is.na(mat_log)), 100 * sum(is.na(mat_log)) / length(mat_log))
          )
          mat_log_imputed <- tryCatch({
             set.seed(42)
             if (system.file(package = "imputeLCMD") == "") {
               stop("Package 'imputeLCMD' is not installed. Please install it to use QRILC imputation.")
             }
             invisible(capture.output(res_raw <- imputeLCMD::impute.QRILC(mat_log)))
             qr_objs <- res_raw[[2]]
             as.matrix(res_raw[[1]])
          }, error = function(e) {
             log_ingestion_event("6a_QRILC_IMPUTATION_ERROR", "WARNING", paste("QRILC Imputation failed:", e$message), list(error = e$message))
             mat_log # Fallback
          })
        } else { 
            mat_log_imputed <- mat_log 
        }
      } else { 
          mat_log_imputed <- mat_log 
      }
      
      # Build QRILC parameter diagnostics
      qrilc_params_df <- data.frame(
        Sample = colnames(mat_log),
        pNAs = sapply(seq_len(ncol(mat_log)), function(j) sum(is.na(mat_log[, j])) / nrow(mat_log)),
        Mean_CDD = sapply(seq_len(ncol(mat_log)), function(j) {
          if (!is.null(qr_objs) && length(qr_objs) >= j && !is.null(qr_objs[[j]]$coefficients)) {
            unname(qr_objs[[j]]$coefficients[1])
          } else NA_real_
        }),
        SD_CDD = sapply(seq_len(ncol(mat_log)), function(j) {
          if (!is.null(qr_objs) && length(qr_objs) >= j && !is.null(qr_objs[[j]]$coefficients)) {
            unname(qr_objs[[j]]$coefficients[2])
          } else NA_real_
        }),
        stringsAsFactors = FALSE
      )
      qrilc_params_df$Upper_Cutoff_Log2 <- qnorm(pmin(0.999, qrilc_params_df$pNAs + 0.001), 
                                                 mean = qrilc_params_df$Mean_CDD, 
                                                 sd = qrilc_params_df$SD_CDD)
      qrilc_params_df$Upper_Cutoff_Linear <- 2^(qrilc_params_df$Upper_Cutoff_Log2)
      
      # 3. Normalization
      norm_method <- get_setting("normalizationMethod", "median")
      sample_medians <- apply(mat_log_imputed, 2, median, na.rm = TRUE)
      grand_median <- median(sample_medians, na.rm = TRUE)
      
      if (norm_method == "pqn") {
         mat_linear_imputed <- 2^mat_log_imputed
         presence_mask <- rowSums(!is.na(mat_linear_imputed) & mat_linear_imputed > 0) / ncol(mat_linear_imputed) >= 0.5
         data_subset_pqn <- if (sum(presence_mask) < 10) mat_linear_imputed else mat_linear_imputed[presence_mask, , drop = FALSE]
         ref_spectrum <- apply(data_subset_pqn, 1, median, na.rm = TRUE)
         ref_spectrum[ref_spectrum == 0 | is.na(ref_spectrum)] <- 1
         quotients <- sweep(data_subset_pqn, 1, ref_spectrum, "/")
         pqn_factors <- apply(quotients, 2, median, na.rm = TRUE)
         pqn_factors[is.na(pqn_factors) | pqn_factors == 0] <- 1
         mat_norm_linear <- sweep(mat_linear_imputed, 2, pqn_factors, "/")
         mat_final_log <- log2(mat_norm_linear)
         norm_offsets <- log2(pqn_factors)
         scaling_factors <- 1 / pqn_factors
      } else if (norm_method == "median") {
         norm_offsets <- sample_medians - grand_median
         scaling_factors <- 2^(-norm_offsets)
         mat_final_log <- sweep(mat_log_imputed, 2, norm_offsets, "-")
      } else {
         norm_offsets <- rep(0, ncol(mat_log_imputed))
         names(norm_offsets) <- colnames(mat_log_imputed)
         scaling_factors <- rep(1, ncol(mat_log_imputed))
         names(scaling_factors) <- colnames(mat_log_imputed)
         mat_final_log <- mat_log_imputed
      }
      
      # 4. Final Cleanup & Linear Return
      mat_final_log[!is.finite(mat_final_log)] <- NA
      mat_final_linear <- 2^mat_final_log
      
      # Populate Audit Trace Data Cache
      if (isTRUE(apply_outliers)) {
        audit_trace_data(list(
          mat_raw = mat_subset,
          mat_for_log = mat_for_log,
          mat_log = mat_log,
          mat_log_imputed = mat_log_imputed,
          qrilc_params = qrilc_params_df,
          norm_method = norm_method,
          sample_medians = sample_medians,
          grand_median = grand_median,
          norm_offsets = norm_offsets,
          scaling_factors = scaling_factors,
          mat_final_log = mat_final_log,
          mat_final_linear = mat_final_linear,
          timestamp = Sys.time()
        ))
      }
      
      data_processed_final <- as.data.frame(mat_final_linear) %>% tibble::rownames_to_column("Lipid_Name")
      
      # =========================================================================
      # --- INJECTION START: SYNTHETIC PRESERVATION PROTOCOL ---
      # =========================================================================
      keep_cols <- useCols
      all_cols <- names(df_info$data)[sapply(df_info$data, is.numeric)]
      all_cols <- setdiff(all_cols, "Lipid_Name")
      unchecked_cols <- setdiff(all_cols, useCols)
      
      if (length(unchecked_cols) > 0) {
          cols_to_parse <- c(useCols, unchecked_cols)
          parsed_meta <- tryCatch(allParsedMetadata(), error = function(e) NULL)
          if (!is.null(parsed_meta) && "FullName" %in% names(parsed_meta) && all(cols_to_parse %in% parsed_meta$FullName)) {
              full_meta <- parsed_meta %>% dplyr::filter(FullName %in% cols_to_parse)
          } else {
              full_meta <- bind_rows(lapply(cols_to_parse, parse_col_info_v2))
          }
          full_meta$Group <- if("Group1" %in% names(full_meta) && "Group2" %in% names(full_meta)) {
              paste(full_meta$Group1, full_meta$Group2, sep="_")
          } else if ("Group1" %in% names(full_meta)) {
              full_meta$Group1
          } else { "All" }
          
          group_defs <- full_meta %>% dplyr::group_by(Group) %>% dplyr::summarize(groupCols = list(FullName), .groups="drop")
          
          for (i in seq_len(nrow(group_defs))) {
              theseCols <- group_defs$groupCols[[i]]
              c_checked <- intersect(theseCols, useCols)          # Biological peers that survived filtering
              c_unchecked <- intersect(theseCols, unchecked_cols) # Missing/excluded samples
              
              for (uc in c_unchecked) {
                  is_avg_outlier <- (uc %in% names(outlier_treatments) && outlier_treatments[[uc]] == "average")
                  should_average <- isTRUE(input$useAveragedSubstitution) || (isTRUE(apply_outliers) && is_avg_outlier)
                  
                  # Requires at least one valid peer to act as a mathematical anchor
                  if (should_average && length(c_checked) >= 1) {
                      # Calculate Mean Intensity Vector across checked peers
                      if (length(c_checked) == 1) {
                          subVals <- data_processed_final[[c_checked]]
                      } else {
                          subVals <- rowMeans(data_processed_final[, c_checked, drop=FALSE], na.rm=TRUE)
                      }
                      
                      # Substitute the void with the Calculated Mean Vector
                      data_processed_final[[uc]] <- subVals
                      keep_cols <- c(keep_cols, uc)
                  }
              }
          }
      }
      
      # 5. Topological Realignment: Force original experimental matrix dimensions for kept columns
      final_cols_ordered <- c("Lipid_Name", intersect(all_cols, keep_cols))
      data_processed_final <- data_processed_final %>% dplyr::select(dplyr::all_of(final_cols_ordered))
      # =========================================================================
      # --- INJECTION END ---
      # =========================================================================
      
      # External Setting: imputeRemainingNAtoZero (default TRUE)
      if (isTRUE(get_setting("imputeRemainingNAtoZero", TRUE))) {
        na_count <- sum(is.na(data_processed_final))
        if (na_count > 0) {
          data_processed_final <- data_processed_final %>% dplyr::mutate(across(where(is.numeric), ~replace_na(., 0)))
        }
      }
      t_imp_end <- Sys.time()
      elapsed_sec <- as.numeric(difftime(t_imp_end, t_imp_start, units = "secs"))
      log_ingestion_event(
        stage = "6_IMPUTATION_NORMALIZATION_SUCCESS",
        status = "SUCCESS",
        message_text = sprintf("Imputation & Normalization finished successfully in %.3fs.", elapsed_sec),
        details = list(
          final_dimensions = sprintf("%d lipids x %d columns", nrow(data_processed_final), ncol(data_processed_final)),
          retained_samples = ncol(data_processed_final) - 1
        )
      )
      return(data_processed_final)
    }

    data_processed_full <- eventReactive({
      rawData()
      run_analysis_trigger_val()
      outlier_trigger_val()
      data_processing_settings()
    }, {
      log_ingestion_event(
        stage = "6_DATA_PROCESSED_TRIGGERED",
        status = "INFO",
        message_text = "data_processed_full reactive event triggered.",
        details = list(
          analysis_is_fresh = isolate(analysis_is_fresh()),
          run_analysis_val = isolate(run_analysis_trigger_val())
        )
      )
      df_info <- rawData()
      if (is.null(df_info) || is.null(df_info$data) || nrow(df_info$data) == 0) {
        return(NULL)
      }
      if (!isolate(analysis_is_fresh())) {
        log_ingestion_event(
          stage = "6_DATA_PROCESSED_WAITING",
          status = "INFO",
          message_text = "Waiting for analysis authorization (analysis_is_fresh is FALSE)."
        )
        return(NULL)
      }
      res <- tryCatch({
        compute_imputed_matrix(apply_outliers = TRUE)
      }, error = function(e) {
        log_ingestion_event(
          stage = "6_IMPUTATION_ERROR",
          status = "ERROR",
          message_text = paste("compute_imputed_matrix failed:", e$message),
          details = list(error = e$message)
        )
        stop(e)
      })
      validate(need(!is.null(res) && sum(is.na(res)) == 0, "Processing resulted in unhandled NA values."))
      return(res)
    })

    # Global Targeted Lipid Selection State
    targeted_mode_active <- reactiveVal(FALSE)
    targeted_lipids_list <- reactiveVal(character(0))

    data_processed <- reactive({
      df <- data_processed_full()
      if (is.null(df) || nrow(df) == 0) return(df)
      if (isTRUE(targeted_mode_active()) && length(targeted_lipids_list()) > 0) {
        lipid_col <- if ("Lipid_Name" %in% names(df)) "Lipid_Name" else names(df)[1]
        df <- df[df[[lipid_col]] %in% targeted_lipids_list(), , drop = FALSE]
      }
      return(df)
    })
    # --- STAGE-GATED REACTIVE VALIDATION INTERFACE (Phase 2 & 3 & 6) ---
    parsedMetadataStructure <- reactiveVal(NULL)
    editableMetadata <- reactiveVal(NULL)
    
    clusters <- reactiveVal(1)
    uniqueCols <- reactiveVal(NULL)
    autoDetectedFeatures <- reactiveVal(c("time_course"))
    schemaSelections <- reactiveVal(list())
    timepointGroup1Map <- reactiveVal(list())
    hasEmbeddedTimePoints <- reactiveVal("No")
    embeddedTimePointPrefixes <- reactiveVal(character(0))
    embeddedTimePointMap <- reactiveVal(list())
    randomSampleExample <- reactiveVal("")
    just_restored <- reactiveVal(FALSE)
    metadata_restored <- reactiveVal(FALSE)
    missing_files_to_restore <- reactiveVal(character(0))
    restoring_state_data <- reactiveVal(NULL)
    restored_outlier_treatments <- reactiveVal(list())
    restored_bqc_manual_exclusions <- reactiveVal(NULL)
    
    # Fast header extraction for instant display example
    observeEvent(activeFiles(), {
      fs <- activeFiles()
      req(length(fs) > 0)
      
      first_file <- fs[[1]]
      ftype <- detect_file_type(first_file)
      
      sample_name <- ""
      tryCatch({
        if (ftype == "global") {
          if (grepl("\\.csv$", first_file)) {
            hdr <- names(read.csv(first_file, nrows = 1, check.names = FALSE))
            cols <- setdiff(hdr, c("Lipid_Name", "Lipid Name", "Lipids", "Lipid", "Sample Name", "SampleName", "Compound", "Feature", "Metabolite", "ID"))
            if (length(cols) > 0) sample_name <- cols[1]
          } else {
            sheets <- readxl::excel_sheets(first_file)
            if (length(sheets) > 0) {
              hdr <- names(readxl::read_excel(first_file, sheet = sheets[1], n_max = 1))
              cols <- setdiff(hdr, c("Lipid_Name", "Lipid Name", "Lipids", "Lipid", "Sample Name", "SampleName", "Compound", "Feature", "Metabolite", "ID"))
              if (length(cols) > 0) sample_name <- cols[1]
            }
          }
        } else if (ftype == "mediator") {
          sheets <- readxl::excel_sheets(first_file)
          if (length(sheets) > 0) {
            df_col <- readxl::read_excel(first_file, sheet = sheets[1], range = readxl::cell_cols(1), n_max = 5)
            vals <- as.character(na.omit(df_col[[1]]))
            if (length(vals) > 0) sample_name <- vals[1]
          }
        }
      }, error = function(e) NULL)
      
      if (nzchar(sample_name)) {
        randomSampleExample(sample_name)
        if (exists("cols") && length(cols) > 0 && (is.null(isolate(uniqueCols())) || length(isolate(uniqueCols())) == 0)) {
          uniqueCols(unique(cols))
        }
      }
    })
    
    # eventReactive for authorized metadata - this is the gatekeeper!
    # It only updates when the 'authorizeMetadata' btn in the modal is clicked.
    allParsedMetadata <- eventReactive(metadata_trigger(), {
      req(editableMetadata())
      req(parsedMetadataStructure())
      t_res_start <- Sys.time()
      
      # Reconstruct full metadata matrix from mappings
      full_meta <- apply_nomenclature_mappings(
        parsedMetadataStructure()$parsed_df,
        editableMetadata()
      )
      
      full_meta <- resolve_embedded_metadata(
        full_meta,
        parsedMetadataStructure()$parsed_df,
        hasEmbeddedTimePoints(),
        embeddedTimePointMap(),
        schemaSelections(),
        input
      )
      
      # Map each TimePoint to its parent Group1 using the timepointGroup1Map
      assoc <- timepointGroup1Map()
      new_tp_conds <- sapply(seq_len(nrow(full_meta)), function(i) {
        tp <- full_meta$TimePoint[i]
        cond <- full_meta$Group1[i]
        associated_conds <- assoc[[tp]]
        if (is.null(associated_conds) || length(associated_conds) == 0) {
          return(cond)
        }
        if (cond %in% associated_conds) {
          return(cond)
        } else {
          return(associated_conds[1])
        }
      })
      full_meta$TimePoint_Group1 <- as.character(new_tp_conds)
      
      # Join with cluster IDs
      cluster_mapping <- tibble(
        FullName = parsedMetadataStructure()$parsed_df$FullName,
        Cluster = as.integer(parsedMetadataStructure()$clusters)
      )
      
      final_meta <- full_meta %>%
        left_join(cluster_mapping, by = "FullName")
      display_labels <- mapply(function(c, pop, rep, pat, tp, fn) {
        c_val <- if (!is.na(c) && nzchar(c) && c != "Unspecified") as.character(c) else ""
        p_val <- if (!is.na(pop) && nzchar(pop) && pop != "Unspecified") as.character(pop) else ""
        r_val <- if (!is.na(rep) && nzchar(rep) && rep != "Unspecified") as.character(rep) else ""
        pt_val <- if (!is.na(pat) && nzchar(pat) && pat != "Unspecified") as.character(pat) else ""
        tp_val <- if (!is.na(tp) && nzchar(tp) && tp != "Unspecified") as.character(tp) else ""
        
        first_parts <- c(c_val, p_val, r_val)
        first_parts <- first_parts[nzchar(first_parts)]
        first_str <- paste(first_parts, collapse = "_")
        
        second_str <- if (nzchar(pt_val)) {
          if (nzchar(first_str)) {
            paste0(first_str, "/", pt_val)
          } else {
            pt_val
          }
        } else {
          first_str
        }

        res <- if (nzchar(tp_val)) {
          if (nzchar(second_str)) {
            paste0(second_str, "_", tp_val)
          } else {
            tp_val
          }
        } else {
          second_str
        }
        
        if (!nzchar(res)) fn else res
      }, final_meta$Group1, final_meta$Group2, final_meta$Replicate, final_meta$PatientNumber, final_meta$TimePoint, final_meta$FullName, USE.NAMES = FALSE)

      # Ensure DisplayLabel uniquely identifies each sample
      if (any(duplicated(display_labels))) {
        display_labels <- ave(seq_along(display_labels), display_labels, FUN = function(idx) {
          if (length(idx) == 1) return(display_labels[idx])
          fns <- final_meta$FullName[idx]
          reps <- sub("^.*[._-]([0-9]+|[rR][0-9]+|[rR]ep[0-9]+)$", "\\\\1", fns)
          if (length(unique(reps)) == length(idx) && !any(reps == fns)) {
            paste0(display_labels[idx], "_", reps)
          } else {
            paste0(display_labels[idx], "_", seq_along(idx))
          }
        })
      }

      final_meta$DisplayLabel <- display_labels

      final_meta <- final_meta %>%
        select(FullName, DisplayLabel, Cluster, Group1, Group2, Replicate, PatientNumber, TimePoint, TimePoint_Group1)

      t_res_end <- Sys.time()
      cat(file = stderr(), sprintf("[PERF - METADATA RESOLUTION] %s | Resolved %d sample metadata records in %.4f sec\n",
                                  format(t_res_end, "%H:%M:%OS3"),
                                  nrow(final_meta),
                                  as.numeric(difftime(t_res_end, t_res_start, units = "secs"))))
      final_meta
    }, ignoreNULL = FALSE)
    
    # Automatically toggle DE checkboxes depending on available levels of Group2, Group1, and TimePoint
    observe({
      meta <- allParsedMetadata()
      req(meta)
      
      clean_grp_levels <- function(col_name) {
        if (!col_name %in% names(meta)) return(0)
        vals <- meta[[col_name]]
        vals <- vals[!is.na(vals) & nzchar(trimws(as.character(vals))) & vals != "Unspecified"]
        length(unique(vals))
      }
      
      g1_n <- clean_grp_levels("Group1")
      g2_n <- clean_grp_levels("Group2")
      tp_n <- clean_grp_levels("TimePoint")
      
      if (g2_n < 2) {
        updateCheckboxInput(session, "deOrientGroup2", value = FALSE)
      } else {
        g2_val <- if (g1_n < 2 && g2_n >= 2) TRUE else isolate(input$deOrientGroup2)
        updateCheckboxInput(session, "deOrientGroup2", 
                            label = tags$span(paste("Group by", get_metadata_group_label("Group2", meta)), 
                                              bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                                             "Uses the cell lineage or tissue Group2 classification column to define contrast cohort groups.")),
                            value = g2_val)
      }
      if (g1_n < 2) {
        g1_val <- if (g1_n == 1 && g2_n <= 1) TRUE else FALSE
        updateCheckboxInput(session, "deOrientGroup1", value = g1_val)
      } else {
        updateCheckboxInput(session, "deOrientGroup1", 
                            label = tags$span(paste("Group by", get_metadata_group_label("Group1", meta)), 
                                              bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                                             "Uses the experimental Group1 classification column to define contrast cohort groups.")),
                            value = isolate(input$deOrientGroup1))
      }
      if (tp_n < 2) {
        updateCheckboxInput(
          session, "deOrientTimePoint",
          label = tags$span(
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
          value = FALSE
        )
        session$sendCustomMessage("setTimePointControlState", list(
          id = session$ns("deOrientTimePoint"),
          containerId = session$ns("deOrientTimePointContainer"),
          enabled = FALSE
        ))
        rv$timepoint_was_available <- FALSE
      } else {
        tp_val <- if (isTRUE(rv$timepoint_was_available)) isolate(input$deOrientTimePoint) else TRUE
        rv$timepoint_was_available <- TRUE
        
        updateCheckboxInput(
          session, "deOrientTimePoint",
          label = tags$span(
            paste("Group by", get_metadata_group_label("TimePoint", meta)),
            bslib::tooltip(
              icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
              "Uses the longitudinal TimePoint classification column to define contrast cohort groups."
            )
          ),
          value = tp_val
        )
        session$sendCustomMessage("setTimePointControlState", list(
          id = session$ns("deOrientTimePoint"),
          containerId = session$ns("deOrientTimePointContainer"),
          enabled = TRUE
        ))
      }
      
      # Dynamically update colorEditMode dropdown with context labels
      g1_label <- paste0("Sample Groups (", get_metadata_group_label("Group1", meta), ")")
      g2_label <- paste0("Sample Groups (", get_metadata_group_label("Group2", meta), ")")
      comp_label <- paste0("Composite Groups (", get_metadata_group_label("Group1_Group2", meta), ")")
      
      color_choices <- c("Group1", "Group2", "Group1_Group2", "Lipid Class", "Hyperclass")
      names(color_choices) <- c(g1_label, g2_label, comp_label, "Lipid Main Class", "Lipid Category")
      
      curr_color_mode <- isolate(input$colorEditMode) %||% "Group1"
      if (curr_color_mode == "Group1" && g1_n < 2 && g2_n >= 2) {
        curr_color_mode <- "Group2"
      }
      updateSelectInput(session, "colorEditMode", choices = color_choices, selected = curr_color_mode)
    })
    
    # Reactive expression for delimiter detection
    currentDelim <- reactive({
      delims <- input$custom_delimiters
      if (is.null(delims) || length(delims) == 0) {
        return("_")
      }
      escaped <- sapply(delims, function(d) {
        if (d == ".") "\\."
        else if (d == "-") "\\-"
        else d
      })
      paste(escaped, collapse = "|")
    })
    
    # Update schemaSelections when columns, delimiters, or nomenclature alignment selection changes
    observeEvent(c(uniqueCols(), currentDelim(), input$nomenclature_standard_align), {
      cols <- uniqueCols()
      req(length(cols) > 0)
      delim <- currentDelim()
      
      # Decompose all sample names and get all components unioned
      components <- list()
      for (name in cols) {
        comps <- decompose_sample_name(name, delim)
        for (k in names(comps)) {
          if (is.null(components[[k]])) {
            components[[k]] <- comps[[k]]
          }
        }
      }
      keys <- names(components)
      get_key_rank <- function(k) {
        num <- as.integer(sub("_.*$", "", sub("^Part_", "", k)))
        if (is.na(num)) num <- 0L
        suffix <- 0L
        if (grepl("_alpha$", k)) suffix <- 1L
        if (grepl("_numeric$", k)) suffix <- 2L
        num * 10L + suffix
      }
      sorted_keys <- keys[order(sapply(keys, get_key_rank))]
      components <- components[sorted_keys]
      comp_names <- names(components)
      
      schema <- list()
      is_standard <- input$nomenclature_standard_align %||% "Yes"
      
      if (is_standard == "Yes") {
        # Conventional ordering: Part 1 = Group1, Part 2 = Group2, Part 3 = Replicate, Part 4 = Ignore
        for (i in seq_along(comp_names)) {
          comp_name <- comp_names[i]
          part_num <- as.integer(sub("_.*$", "", sub("^Part_", "", comp_name)))
          if (is.na(part_num)) part_num <- 0L
          
          if (part_num == 1) {
            schema[[comp_name]] <- "Group1"
          } else if (part_num == 2) {
            schema[[comp_name]] <- "Group2"
          } else if (part_num == 3) {
            schema[[comp_name]] <- "Replicate"
          } else {
            schema[[comp_name]] <- "Ignore"
          }
        }
        # If Part 3 is non-numeric/descriptor (e.g. "KO") and Part 4 is numeric/replicate, assign Replicate to Part 4
        if ("Part_3" %in% comp_names && "Part_4" %in% comp_names) {
          p3_val <- as.character(components[["Part_3"]] %||% "")
          p4_val <- as.character(components[["Part_4"]] %||% "")
          if (!grepl("^[0-9]+$|^[rR][0-9]+$", p3_val) && grepl("^[0-9]+$|^[rR][0-9]+$", p4_val)) {
            schema[["Part_3"]] <- "Ignore"
            schema[["Part_4"]] <- "Replicate"
          }
        }
      } else {
        # Try to preserve existing schema selections if their component names match,
        # otherwise compute auto-detected default selections
        old_schema <- isolate(schemaSelections())
        for (comp_name in comp_names) {
          if (!is.null(old_schema[[comp_name]])) {
            schema[[comp_name]] <- old_schema[[comp_name]]
          } else {
            val_content <- components[[comp_name]]
            default_sel <- "Ignore"
            if (grepl("^[rRmMvV][0-9]+$", val_content)) default_sel <- "Replicate"
            else if (grepl("^[sScC0-9]+[a-zA-Z]*$", val_content) && nchar(val_content) <= 4) default_sel <- "TimePoint"
            else if (grepl("^[0-9]+[a-zA-Z]*$", val_content)) default_sel <- "PatientNumber"
            else if (val_content %in% c("SCD", "SCDC", "SCDCT", "Control", "Sickle")) default_sel <- "Group1"
            else if (val_content %in% c("YA", "Adult", "Pediatric", "Control")) default_sel <- "Group2"
            
            # Positional overrides:
            if (default_sel == "Ignore") {
              if (comp_name %in% c("Part_1", "Part_1_alpha")) {
                default_sel <- "Group1"
              } else if (comp_name %in% c("Part_2", "Part_2_alpha")) {
                default_sel <- "Group2"
              }
            }
            schema[[comp_name]] <- default_sel
          }
        }
      }
      if (!identical(schema, isolate(schemaSelections()))) {
        schemaSelections(schema)
      }
    })
    
    # Reactive expression for interpreter results (schema-aware)
    parsedResults <- reactive({
      req(uniqueCols())
      schema <- schemaSelections()
      req(length(schema) > 0)
      delim <- currentDelim()
      
      # Parse all samples using the dynamic schema
      parsed_list <- lapply(uniqueCols(), function(name) {
        parse_sample_by_schema(name, delim, schema)
      })
      parsed_df <- bind_rows(parsed_list)
      
      # Generate mapping table
      distinct_group1 <- na.omit(unique(parsed_df$Group1Term))
      distinct_timepoints <- na.omit(unique(parsed_df$TimePointTerm))
      distinct_replicates <- na.omit(unique(parsed_df$ReplicateTerm))
      distinct_group2 <- na.omit(unique(parsed_df$Group2Term))
      distinct_patients <- na.omit(unique(parsed_df$PatientTerm))
      
      mappings <- tibble(
        Category = character(),
        OriginalTerm = character(),
        MappedValue = character()
      )
      
      for (term in distinct_group1) {
        restored <- restore_delimiters(term)
        mapped_val <- if (restored == "SCD") {
          "Sickle Cell Disease"
        } else if (restored %in% c("SCDC", "SCDCT")) {
          "Control"
        } else {
          restored
        }
        mappings <- add_row(mappings, Category = "Group1", OriginalTerm = term, MappedValue = mapped_val)
      }
      
      for (term in distinct_timepoints) {
        restored <- restore_delimiters(term)
        mapped_val <- if (restored == "S1") {
          "Steady State TimePoint"
        } else if (restored == "S2") {
          "Steady State TimePoint2"
        } else if (restored == "C1") {
          "Pain Crisis TimePoint1"
        } else if (restored == "C2") {
          "Pain Crisis TimePoint2"
        } else {
          restored
        }
        mappings <- add_row(mappings, Category = "TimePoint", OriginalTerm = term, MappedValue = mapped_val)
      }
      
      for (term in distinct_replicates) {
        mappings <- add_row(mappings, Category = "Replicate", OriginalTerm = term, MappedValue = term)
      }
      
      for (term in distinct_group2) {
        if (!grepl("^[0-9]+$", term)) {
          mapped_val <- if (term == "YA") "SCD (single cell disease)" else term
          mappings <- add_row(mappings, Category = "Group2", OriginalTerm = term, MappedValue = mapped_val)
        }
      }
      
      for (term in distinct_patients) {
        if (!grepl("^[0-9]+$", term)) {
          mappings <- add_row(mappings, Category = "PatientNumber", OriginalTerm = term, MappedValue = term)
        }
      }
      
      list(parsed_df = parsed_df, mappings = mappings, delim = delim)
    })
    
    # Sync schema selections from UI inputs to schemaSelections reactiveVal
    observe({
      if (isolate(is_restoring())) return()
      req(uniqueCols())
      current_schema <- schemaSelections()
      comp_names <- names(current_schema)
      req(length(comp_names) > 0)
      
      updated <- current_schema
      changed <- FALSE
      for (comp_name in comp_names) {
        val <- input[[paste0("schema_", comp_name)]]
        if (!is.null(val) && val != current_schema[[comp_name]]) {
          updated[[comp_name]] <- val
          changed <- TRUE
        }
      }
      if (changed) {
        schemaSelections(updated)
      }
    })
    
    # Update internal structures when parsedResults updates
    observe({
      if (isolate(is_restoring())) return()
      if (isolate(just_restored())) return()
      if (isolate(metadata_restored())) return()
      res <- parsedResults()
      parsedMetadataStructure(list(
        parsed_df = res$parsed_df,
        clusters = clusters()
      ))
      editableMetadata(res$mappings)
      timepointGroup1Map(list()) # Reset timepoint-condition association mapping on new file or schema change
      metadata_trigger(isolate(metadata_trigger()) + 1) # Automatically pre-authorize metadata
    })
    
    output$standard_format_example_ui <- renderUI({
      ex <- randomSampleExample()
      if (is.null(ex) || !nzchar(ex)) {
        raw_df <- tryCatch(isolate(rawData()$data), error = function(e) NULL)
        if (!is.null(raw_df)) {
          c_names <- setdiff(names(raw_df), "Lipid_Name")
          if (length(c_names) > 0) {
            ex <- c_names[1]
            randomSampleExample(ex)
          }
        }
      }
      
      content <- if (is.null(ex) || !nzchar(ex)) {
        div(
          class = "py-2 text-center",
          tags$i(class = "fas fa-spinner fa-spin text-primary", style = "font-size: 1.25rem;")
        )
      } else {
        tags$code(
          style = "font-size: 1.25rem; font-weight: bold; color: #007bff;",
          ex
        )
      }
      
      div(
        class = "alert alert-secondary py-2 px-3 small my-2 text-center",
        p(class = "mb-1 text-muted", "Sample example from the loaded dataset:"),
        content
      )
    })
    outputOptions(output, "standard_format_example_ui", suspendWhenHidden = FALSE)
    
    # Render DT table in modal
    output$metadata_val_table <- DT::renderDT({
      req(editableMetadata())
      DT::datatable(
        editableMetadata(),
        editable = list(target = "cell", disable = list(columns = c(0, 1))), # Category and OriginalTerm are read-only
        selection = "none",
        rownames = FALSE,
        options = list(
          pageLength = 15,
          dom = "tp"
        )
      )
    })
    
    output$sample_preview_header <- renderUI({
      files <- names(activeFiles())
      dataset_info <- if (length(files) > 0) {
        paste0(" (", paste(files, collapse = ", "), ")")
      } else {
        ""
      }
      tagList(
        h5(class = "card-title text-primary", "1. Sample Structure Preview"),
        p(class = "card-text", 
          paste0("Preview of sample names convention in the loaded dataset", dataset_info, ":")
        )
      )
    })
    
    # Render HTML preview table of heterogeneous parsed components (Phase 6 guidance)
    output$sample_structure_preview <- renderTable({
      req(input$nomenclature_standard_align == "No")
      req(parsedMetadataStructure())
      df <- parsedMetadataStructure()$parsed_df
      
      # Defensive check: ensure all expected columns exist
      required_cols <- c("FullName", "Group1Term", "Group2Term", "ReplicateTerm", "PatientTerm", "TimePointTerm")
      for (col in required_cols) {
        if (!col %in% colnames(df)) {
          df[[col]] <- NA_character_
        }
      }
      
      # Select heterogeneous samples: group by parsed terms and pick the first of each group,
      # ordering to get distinct Group 1 and Group 2 levels first
      preview <- df %>%
        group_by(Group1Term, Group2Term, ReplicateTerm, PatientTerm, TimePointTerm) %>%
        slice(1) %>%
        ungroup() %>%
        arrange(Group1Term, Group2Term) %>%
        head(5)
      
      # Dynamically build display dataframe and selected columns
      preview_display <- preview %>%
        mutate(
          `Sample Name` = sprintf('<span class="sample-name-cell" data-fullname="%s" style="cursor: pointer; border-bottom: 1px dashed #007bff; padding: 2px; font-family: monospace; font-weight: bold; color: #1a0dab;" title="Highlight text here to map it">%s</span>', FullName, FullName)
        )
      
      schema <- schemaSelections()
      active_cats <- unique(unlist(schema))
      
      cols_to_select <- c("Sample Name")
      
      if ("Group1" %in% active_cats) {
        preview_display$`Group1 Prefix` <- preview$Group1Term
        cols_to_select <- c(cols_to_select, "Group1 Prefix")
      }
      if ("Group2" %in% active_cats) {
        preview_display$`Group2 Prefix` <- preview$Group2Term
        cols_to_select <- c(cols_to_select, "Group2 Prefix")
      }
      if ("Replicate" %in% active_cats) {
        preview_display$`Replicate` <- preview$ReplicateTerm
        cols_to_select <- c(cols_to_select, "Replicate")
      }
      if ("PatientNumber" %in% active_cats) {
        preview_display$`Patient Number` <- preview$PatientTerm
        cols_to_select <- c(cols_to_select, "Patient Number")
      }
      if ("TimePoint" %in% active_cats) {
        preview_display$`TimePoint` <- preview$TimePointTerm
        cols_to_select <- c(cols_to_select, "TimePoint")
      }
      
      # Keep only the dynamically active columns
      preview_display <- preview_display[, cols_to_select, drop = FALSE]
      
      # Replace NA with "-" for cleaner display
      preview_display[is.na(preview_display)] <- "-"
      preview_display
    }, sanitize.text.function = function(x) x, striped = TRUE, hover = TRUE, bordered = TRUE, align = "c", spacing = "s")
    
    # Reactive value to hold the currently highlighted text
    highlightedText <- reactiveVal(NULL)
    
    # Update highlightedText when selected_sample_substring triggers (repeatable with timestamp)
    observeEvent(input$selected_sample_substring, {
      req(input$selected_sample_substring$text)
      highlightedText(input$selected_sample_substring$text)
    })
    
    # Render the pop-up inline card for mapping the highlighted text
    output$highlight_mapping_panel <- renderUI({
      req(input$nomenclature_standard_align == "No")
      req(highlightedText())
      
      div(
        class = "card border-primary bg-light mb-3",
        div(
          class = "card-header bg-primary text-white d-flex justify-content-between align-items-center py-2",
          tags$span(class = "fw-bold", paste0("Interactive Mapping Helper: '", highlightedText(), "'")),
          actionButton(session$ns("close_highlight_panel"), "X", class = "btn btn-sm btn-close btn-close-white", style = "background: none; border: none; color: white; font-weight: bold;")
        ),
        div(
          class = "card-body py-2",
          p(class = "card-text small mb-2", "Select the category and enter the clinical value to register this term in the mappings table below:"),
          fluidRow(
            column(
              6,
              radioButtons(
                session$ns("selected_text_category"),
                "Metadata Category:",
                choices = c(
                  "Group1" = "Group1",
                  "Group2" = "Group2",
                  "Replicate" = "Replicate",
                  "PatientNumber" = "PatientNumber",
                  "TimePoint" = "TimePoint"
                ),
                selected = "Group1",
                inline = TRUE
              )
            ),
            column(
              6,
              div(
                class = "input-group input-group-sm",
                textInput(
                  session$ns("selected_text_mapped_val"),
                  NULL,
                  value = highlightedText(),
                  placeholder = "Enter mapped clinical value..."
                ),
                div(
                  class = "input-group-append",
                  actionButton(
                    session$ns("add_selected_text_mapping"),
                    "Add Rule",
                    class = "btn btn-primary btn-sm ms-2"
                  )
                )
              )
            )
          )
        )
      )
    })
    
    # Render dynamic visual dropdown schema connector
    output$schema_config_ui <- renderUI({
      req(input$nomenclature_standard_align == "No")
      req(uniqueCols())
      delim <- currentDelim()
      schema <- schemaSelections()
      req(length(schema) > 0)
      
      # Decompose all sample names and get all components unioned
      components <- list()
      for (name in uniqueCols()) {
        comps <- decompose_sample_name(name, delim)
        for (k in names(comps)) {
          if (is.null(components[[k]])) {
            components[[k]] <- comps[[k]]
          }
        }
      }
      keys <- names(components)
      get_key_rank <- function(k) {
        num <- as.integer(sub("_.*$", "", sub("^Part_", "", k)))
        if (is.na(num)) num <- 0L
        suffix <- 0L
        if (grepl("_alpha$", k)) suffix <- 1L
        if (grepl("_numeric$", k)) suffix <- 2L
        num * 10L + suffix
      }
      sorted_keys <- keys[order(sapply(keys, get_key_rank))]
      components <- components[sorted_keys]
      
      formatted_components <- list()
      for (comp_name in names(components)) {
        val <- components[[comp_name]]
        if (grepl("_alpha$", comp_name)) {
          part_num <- gsub("Part_|_alpha", "", comp_name)
          label <- paste("Part", part_num, "(Letters)")
        } else if (grepl("_numeric$", comp_name)) {
          part_num <- gsub("Part_|_numeric", "", comp_name)
          label <- paste("Part", part_num, "(Numbers)")
        } else {
          part_num <- gsub("Part_", "", comp_name)
          label <- paste("Part", part_num)
        }
        formatted_components[[comp_name]] <- list(val = val, label = label)
      }
      
      # Render dropdowns in cards
      inputs <- lapply(names(formatted_components), function(comp_name) {
        comp <- formatted_components[[comp_name]]
        val <- comp$val
        label <- comp$label
        
        selected_sel <- schema[[comp_name]] %||% "Ignore"
        
        column(
          width = as.integer(12 / min(length(formatted_components), 4)),
          div(
            class = "card mb-2 border-warning",
            div(class = "card-header py-1 text-white small text-center fw-bold", style = "background-color: #d97706;", label),
            div(
              class = "card-body py-2 text-center",
              div(style = "font-size: 1.1rem; font-family: monospace; font-weight: bold; color: #1a0dab; margin-bottom: 5px;", val),
              selectInput(
                session$ns(paste0("schema_", comp_name)),
                label = NULL,
                choices = c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint", "Ignore"),
                selected = selected_sel
              ),
              conditionalPanel(
                condition = sprintf("input['%s'] != 'Ignore' && input['%s'] != 'TimePoint'", 
                                    session$ns(paste0("schema_", comp_name)), 
                                    session$ns(paste0("schema_", comp_name))),
                ns = session$ns,
                div(
                  style = "display: inline-flex; align-items: center; justify-content: center; margin-top: 5px; width: 100%;",
                  checkboxInput(
                    session$ns(paste0("schema_has_tp_", comp_name)),
                    label = tags$span(style = "color: #d97706; font-weight: bold; font-size: 0.95rem;", "Embedded TimePoint ?"),
                    value = isolate(input[[paste0("schema_has_tp_", comp_name)]]) %||% get_restored_input(paste0("schema_has_tp_", comp_name), FALSE)
                  )
                )
              )
            )
          )
        )
      })
      fluidRow(inputs)
    })
    
    output$standard_embedded_tp_ui <- renderUI({
       req(uniqueCols())
       delim <- currentDelim()
       schema <- schemaSelections()
       req(length(schema) > 0)
       
       # Decompose all sample names and get all components unioned
       components <- list()
       for (name in uniqueCols()) {
         comps <- decompose_sample_name(name, delim)
         for (k in names(comps)) {
           if (is.null(components[[k]])) {
             components[[k]] <- comps[[k]]
           }
         }
       }
       keys <- names(components)
       get_key_rank <- function(k) {
         num <- as.integer(sub("_.*$", "", sub("^Part_", "", k)))
         if (is.na(num)) num <- 0L
         suffix <- 0L
         if (grepl("_alpha$", k)) suffix <- 1L
         if (grepl("_numeric$", k)) suffix <- 2L
         num * 10L + suffix
       }
       sorted_keys <- keys[order(sapply(keys, get_key_rank))]
       components <- components[sorted_keys]
       
       formatted_components <- list()
       for (comp_name in names(components)) {
         val <- components[[comp_name]]
         if (grepl("_alpha$", comp_name)) {
           part_num <- gsub("Part_|_alpha", "", comp_name)
           label <- paste("Part", part_num, "(Letters)")
         } else if (grepl("_numeric$", comp_name)) {
           part_num <- gsub("Part_|_numeric", "", comp_name)
           label <- paste("Part", part_num, "(Numbers)")
         } else {
           part_num <- gsub("Part_", "", comp_name)
           label <- paste("Part", part_num)
         }
         formatted_components[[comp_name]] <- list(val = val, label = label)
       }
       
       inputs <- lapply(names(formatted_components), function(comp_name) {
         comp <- formatted_components[[comp_name]]
         val <- comp$val
         label <- comp$label
         
         mapped_cat <- schema[[comp_name]] %||% "Ignore"
         if (mapped_cat == "Ignore" || mapped_cat == "TimePoint") return(NULL)
         
         div(
           style = "display: inline-flex; align-items: center; margin-right: 20px; margin-bottom: 10px;",
           checkboxInput(
             session$ns(paste0("schema_has_tp_", comp_name)),
             label = tags$span(style = "color: #d97706; font-weight: bold; font-size: 0.95rem;", sprintf("%s (%s) embeds a TimePoint ?", label, val)),
             value = isolate(input[[paste0("schema_has_tp_", comp_name)]]) %||% get_restored_input(paste0("schema_has_tp_", comp_name), FALSE)
           )
         )
       })
       
       inputs <- inputs[!sapply(inputs, is.null)]
       if (length(inputs) == 0) return(NULL)
       
       div(
        class = "mt-3 pt-3 border-top",
        h6(
          style = "color: #4e79a7; font-weight: bold; margin-bottom: 8px; display: inline-flex; align-items: center;", 
          tags$span(
            "Embedded TimePoint Configuration", 
            bslib::tooltip(
              icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
              "Based on the detected naming pattern, in order to allow further longitudinal / timecourse analysis, it is required to annotate the part of the metadata which is carrying a temporal dimension."
            )
          )
        ),
        p(class = "text-muted small mb-2", "If one of the standardized parts embeds a timepoint (e.g. 12C in Allergic_12C_M5), check it below:"),
        div(class = "d-flex flex-wrap", inputs)
      )
    })
    
    output$visual_connection_flow <- renderUI({
      req(input$nomenclature_standard_align == "No")
      req(uniqueCols())
      delim <- currentDelim()
      schema <- schemaSelections()
      req(length(schema) > 0)
      
      # Find sample name with maximum number of components to show as exemplar flow
      exemplar_sample <- uniqueCols()[1]
      max_comps_len <- 0
      for (name in uniqueCols()) {
        comps <- decompose_sample_name(name, delim)
        if (length(comps) > max_comps_len) {
          max_comps_len <- length(comps)
          exemplar_sample <- name
        }
      }
      
      # Decompose exemplar sample
      components <- decompose_sample_name(exemplar_sample, delim)
      
      # Colors for categories
      cat_colors <- list(
        Group1 = "#e2f0d9",     # soft green
        Group2 = "#fce4d6",    # soft orange
        Replicate = "#f2f2f2",     # soft grey
        PatientNumber = "#e1f5fe", # soft blue
        TimePoint = "#fff2cc",     # soft yellow
        Ignore = "#f5f5f5"
      )
      
      text_colors <- list(
        Group1 = "#385723",
        Group2 = "#c65911",
        Replicate = "#595959",
        PatientNumber = "#0288d1",
        TimePoint = "#7f6000",
        Ignore = "#7f7f7f"
      )
      
      parts_to_show <- names(components)
      
      div(
        class = "mt-3 p-3 border rounded bg-white",
        style = "border-left: 5px solid #17a2b8 !important;",
        h6(class = "text-secondary fw-bold mb-3", "Visual Case Connection: Deconstructed Sample Nomenclature"),
        div(
          style = "display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;",
          # Row 1: Full name
          div(
            style = "font-size: 1.2rem; font-weight: bold; color: #333; background: #f8f9fa; padding: 8px 16px; border-radius: 20px; border: 1px solid #dee2e6;",
            tags$span(style = "color: #777; font-size: 0.9rem; font-weight: normal; margin-right: 8px;", "Original exemplar:"),
            tags$code(style = "font-size: 1.2rem; color: #1a0dab;", exemplar_sample)
          ),
          # Row 2: Decomposed pieces
          div(
            style = "display: flex; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 10px;",
            lapply(seq_along(parts_to_show), function(i) {
              comp_name <- parts_to_show[i]
              val <- components[[comp_name]]
              category <- schema[[comp_name]] %||% "Ignore"
              bg <- cat_colors[[category]] %||% "#f5f5f5"
              fg <- text_colors[[category]] %||% "#7f7f7f"
              
              div(
                style = "display: flex; flex-direction: column; align-items: center; margin: 0 10px;",
                div(
                  style = sprintf("padding: 8px 14px; border-radius: 6px; background-color: %s; color: %s; font-family: monospace; font-weight: bold; border: 1px solid %s; font-size: 1.1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.08); min-width: 60px; text-align: center;", bg, fg, fg),
                  val
                ),
                div(style = "color: #888; font-weight: bold; margin: 4px 0;", "↓"),
                div(
                  style = sprintf("padding: 4px 10px; border-radius: 4px; background-color: %s; color: %s; font-weight: bold; border: 1px dashed %s; font-size: 0.85rem; text-align: center; min-width: 100px;", bg, fg, fg),
                  category
                )
              )
            })
          )
        )
      )
    })
    
    output$timepoint_condition_association_ui <- renderUI({
      req(parsedResults())
      req(editableMetadata())
      
      df_meta <- editableMetadata()
      tp_terms <- df_meta %>% dplyr::filter(Category == "TimePoint") %>% pull(MappedValue) %>% unique()
      cond_terms <- df_meta %>% dplyr::filter(Category == "Group1") %>% pull(MappedValue) %>% unique()
      
      if (length(tp_terms) == 0 || length(cond_terms) == 0) return(NULL)
      
      current_assoc <- timepointGroup1Map()
      parsed_df <- parsedResults()$parsed_df
      
      # Reconstruct metadata to look up co-occurrence directly on mapped condition/timepoint
      full_meta <- apply_nomenclature_mappings(parsed_df, df_meta)
      full_meta <- resolve_embedded_metadata(
        full_meta,
        parsed_df,
        hasEmbeddedTimePoints(),
        embeddedTimePointMap(),
        schemaSelections(),
        input
      )
      
      selectors <- lapply(tp_terms, function(tp) {
        # Find all conditions co-occurring with this mapped TimePoint across all samples
        co_occurring_mapped <- full_meta %>%
          dplyr::filter(TimePoint == tp) %>%
          pull(Group1) %>%
          unique() %>%
          na.omit()
        
        # Filter out "Unspecified"
        co_occurring_mapped <- setdiff(co_occurring_mapped, "Unspecified")
        
        default_cond <- current_assoc[[tp]]
        # Clean default_cond to only include valid cond_terms
        if (!is.null(default_cond)) {
          default_cond <- intersect(default_cond, cond_terms)
        }
        
        if (is.null(default_cond) || length(default_cond) == 0) {
          default_cond <- if (length(co_occurring_mapped) > 0) {
            co_occurring_mapped
          } else {
            if (grepl("Steady|Control|S1|S2", tp, ignore.case = TRUE) && any(grepl("Control", cond_terms, ignore.case = TRUE))) {
              cond_terms[grepl("Control", cond_terms, ignore.case = TRUE)][1]
            } else if (grepl("Crisis|Pain|C1|C2", tp, ignore.case = TRUE) && any(grepl("Disease|Sickle", cond_terms, ignore.case = TRUE))) {
              cond_terms[grepl("Disease|Sickle", cond_terms, ignore.case = TRUE)][1]
            } else {
              cond_terms[1]
            }
          }
        }
        
        column(
          width = 6,
          div(
            class = "d-flex align-items-center mb-2",
            tags$span(style = "font-weight: bold; width: 45%; word-wrap: break-word;", tp),
            tags$span(style = "margin: 0 10px;", "belongs to"),
            div(
              style = "width: 45%;",
              selectInput(
                session$ns(paste0("tp_assoc_", make.names(tp))),
                label = NULL,
                choices = cond_terms,
                selected = default_cond,
                multiple = TRUE
              )
            )
          )
        )
      })
      
      div(
        class = "card border-info bg-light mb-3",
        div(
          class = "card-body py-3",
          h6(class = "card-title text-info fw-bold mb-2", "TimePoint to Group1 Association"),
          p(class = "card-text small mb-3", "If TimePoints represent nested measurements within specific disease states or conditions, associate each TimePoint with its parent Group1 group below:"),
          fluidRow(selectors)
        )
      )
    })
    
    # Sync observer for TimePoint-Group1 mapping
    observe({
      if (isolate(is_restoring())) return()
      if (isolate(just_restored())) return()
      req(editableMetadata())
      df_meta <- editableMetadata()
      tp_terms <- df_meta %>% dplyr::filter(Category == "TimePoint") %>% pull(MappedValue) %>% unique()
      req(length(tp_terms) > 0)
      
      current <- timepointGroup1Map()
      changed <- FALSE
      for (tp in tp_terms) {
        input_id <- paste0("tp_assoc_", make.names(tp))
        val <- input[[input_id]]
        if (!is.null(val) && (!tp %in% names(current) || !identical(current[[tp]], val))) {
          current[[tp]] <- val
          changed <- TRUE
        }
      }
      if (changed) {
        timepointGroup1Map(current)
      }
    })
    
    # Observer to automatically check and enable/disable embedded TimePoints based on checkboxes in Decomposition Schema
    observe({
      if (isolate(is_restoring())) return()
      if (isolate(just_restored())) return()
      req(uniqueCols(), length(schemaSelections()) > 0)
      schema <- schemaSelections()
      delim <- currentDelim()
      
      embedded_prefixes <- character(0)
      any_checked <- FALSE
      
      for (comp_name in names(schema)) {
        if (schema[[comp_name]] == "Ignore" || schema[[comp_name]] == "TimePoint") next
        checkbox_id <- paste0("schema_has_tp_", comp_name)
        val <- input[[checkbox_id]]
        if (isTRUE(val)) {
          any_checked <- TRUE
          # Extract values for this component across all samples
          comp_vals <- sapply(uniqueCols(), function(name) {
            components <- decompose_sample_name(name, delim)
            components[[comp_name]]
          })
          comp_vals <- unique(na.omit(as.character(comp_vals)))
          embedded_prefixes <- unique(c(embedded_prefixes, comp_vals))
        }
      }
      
      if (any_checked && length(embedded_prefixes) > 0) {
        hasEmbeddedTimePoints("Yes")
        embeddedTimePointPrefixes(embedded_prefixes)
        
        # Autofill values with extracted suffixes
        current_map <- embeddedTimePointMap()
        map_updated <- FALSE
        for (pref in embedded_prefixes) {
          if (is.null(current_map[[pref]]) || !nzchar(current_map[[pref]])) {
            current_map[[pref]] <- extract_embedded_timepoint(pref)
            map_updated <- TRUE
          }
        }
        if (map_updated) {
          embeddedTimePointMap(current_map)
        }
      } else {
        hasEmbeddedTimePoints("No")
        embeddedTimePointPrefixes(character(0))
        embeddedTimePointMap(list())
      }
    })
    
    # Expose any_embedded_tp_checked reactively to conditionalPanel
    output$any_embedded_tp_checked <- reactive({
      hasEmbeddedTimePoints() == "Yes"
    })
    outputOptions(output, "any_embedded_tp_checked", suspendWhenHidden = FALSE)
    
    output$embedded_tp_mapping_panel <- renderUI({
      req(hasEmbeddedTimePoints() == "Yes")
      req(editableMetadata())
      
      current_selected <- embeddedTimePointPrefixes()
      current_map <- embeddedTimePointMap()
      
      # Render mapping text inputs for each selected prefix
      mapping_inputs <- NULL
      if (length(current_selected) > 0) {
        inputs <- lapply(current_selected, function(prefix) {
          default_tp <- if (!is.null(current_map[[prefix]]) && nzchar(current_map[[prefix]])) {
            current_map[[prefix]]
          } else {
            extract_embedded_timepoint(prefix)
          }
          column(
            width = 6,
            div(
              class = "d-flex align-items-center mb-2",
              tags$span(style = "font-weight: bold; width: 45%; word-wrap: break-word;", prefix),
              tags$span(style = "margin: 0 10px;", "maps to TimePoint:"),
              div(
                style = "width: 45%;",
                textInput(
                  session$ns(paste0("embedded_tp_val_", make.names(prefix))),
                  label = NULL,
                  value = default_tp,
                  placeholder = "e.g. Steady State"
                )
              )
            )
          )
        })
        mapping_inputs <- fluidRow(inputs)
      }
      
      tagList(
        if (!is.null(mapping_inputs)) {
          div(
            style = "margin-top: 15px; border-top: 1px dashed #ccc; padding-top: 15px;",
            h6(class = "small text-muted mb-3", "Specify the corresponding TimePoint name for each selected prefix:"),
            mapping_inputs
          )
        }
      )
    })
    
    # Automatically sync the embedded TimePoint mapping from UI inputs to the reactive value
    observe({
      req(hasEmbeddedTimePoints() == "Yes")
      selected <- embeddedTimePointPrefixes()
      
      # Isolate current map read to avoid reactive cycle
      current_map <- isolate(embeddedTimePointMap())
      changed <- FALSE
      
      # Clean up removed prefixes from map
      for (k in names(current_map)) {
        if (!k %in% selected) {
          current_map[[k]] <- NULL
          changed <- TRUE
        }
      }
      
      if (length(selected) > 0) {
        for (prefix in selected) {
          input_id <- paste0("embedded_tp_val_", make.names(prefix))
          val <- input[[input_id]]
          if (!is.null(val)) {
            if (is.null(current_map[[prefix]]) || current_map[[prefix]] != val) {
              current_map[[prefix]] <- val
              changed <- TRUE
            }
          }
        }
      }
      
      if (changed) {
        embeddedTimePointMap(current_map)
      }
    })
    
    # Reset standard align selection when back_to_step0 link is clicked
    observeEvent(input$back_to_step0, {
      updateRadioButtons(session, "nomenclature_standard_align", selected = "Yes")
    })
    
    # Handle adding the selected text mapping rule
    observeEvent(input$add_selected_text_mapping, {
      req(highlightedText())
      req(input$selected_text_category)
      req(input$selected_text_mapped_val)
      
      category <- input$selected_text_category
      orig_term <- highlightedText()
      mapped_val <- input$selected_text_mapped_val
      
      # Resolve matching component based on highlighted sample name
      full_name <- input$selected_sample_substring$fullName
      delim <- currentDelim()
      
      matching_comp <- find_matching_component(full_name, orig_term, delim)
      if (!is.null(matching_comp)) {
        # Update schema selections reactiveVal
        current_schema <- schemaSelections()
        current_schema[[matching_comp]] <- category
        schemaSelections(current_schema)
        
        # Update UI dropdown selection
        updateSelectInput(
          session,
          paste0("schema_", matching_comp),
          selected = category
        )
      }
      
      # If the term is NOT a pure number, add/update it in the distinct mappings table
      if (!grepl("^[0-9]+$", orig_term)) {
        df <- editableMetadata()
        idx <- which(df$Category == category & df$OriginalTerm == orig_term)
        if (length(idx) > 0) {
          df$MappedValue[idx] <- mapped_val
        } else {
          df <- df %>% add_row(Category = category, OriginalTerm = orig_term, MappedValue = mapped_val)
        }
        editableMetadata(df)
      }
      
      # Clear highlighted text to hide panel
      highlightedText(NULL)
    })
    
    observeEvent(input$close_highlight_panel, {
      highlightedText(NULL)
    })
    
    # Handle DT edits
    observeEvent(input$metadata_val_table_cell_edit, {
      info <- input$metadata_val_table_cell_edit
      df <- editableMetadata()
      # info$row is 1-indexed, info$col is 0-indexed since rownames=FALSE
      row <- info$row
      col <- info$col + 1
      df[row, col] <- info$value
      editableMetadata(df)
    })
    
    # Trigger validation modal when rawData is updated (new files are loaded)
    observeEvent(rawData(), {
      if (isolate(is_restoring())) return()
      if (isolate(just_restored())) return()
      if (isolate(metadata_restored())) return()
      
      already_confirmed <- isTRUE(isolate(rv$lipidomics_confirmed))
      if (!already_confirmed) {
        rv$lipidomics_confirmed <- FALSE
      }
      rv$selected_mapping_tab <- "Lipidomics"
      raw_data <- isolate(rawData())
      req(raw_data$data)
      cols <- setdiff(names(raw_data$data), "Lipid_Name")
      req(length(cols) > 0)
      
      cat(sprintf("\n[LIPIDOMIC EXPLORER] rawData updated (%d samples). Initializing metadata structures...\n", length(cols)))
      
      unique_cols <- unique(cols)
      uniqueCols(unique_cols)
      ex_sample <- if (length(unique_cols) > 0) unique_cols[1] else ""
      randomSampleExample(ex_sample)
      
      # Detect active delimiters that appear in any sample name
      active_delims <- c()
      for (d in c("_", "-", ".", "/", " ")) {
        d_regex <- if (d == ".") "\\." else d
        if (any(grepl(d_regex, unique_cols))) {
          active_delims <- c(active_delims, d)
        }
      }
      if (length(active_delims) == 0) {
        active_delims <- c("_")
      }
      
      updateCheckboxGroupInput(session, "custom_delimiters", selected = active_delims)
      
      # Perform Jaro-Winkler hierarchical clustering on column headers (Phase 2)
      num_threads <- tryCatch({ parallel::detectCores() }, error = function(e) 1)
      if (length(unique_cols) >= 2) {
        d_mat <- stringdist::stringdistmatrix(unique_cols, method = "jw", p = 0.1, nthread = num_threads)
        hc <- hclust(d_mat, method = "ward.D2")
        cls <- tryCatch({
          cutree(hc, h = 0.25)
        }, error = function(e) {
          cutree(hc, k = min(length(unique_cols), 5))
        })
      } else {
        cls <- 1
      }
      clusters(cls)
      
      # Auto-detect features
      detected_features <- c()
      if (any(grepl("_[mM][0-9]+", unique_cols) | grepl("-[mM][0-9]+", unique_cols))) {
        detected_features <- c(detected_features, "bio_rep")
      }
      if (any(grepl("_[rR][0-9]+", unique_cols) | grepl("-[rR][0-9]+", unique_cols))) {
        detected_features <- c(detected_features, "tech_rep")
      }
      if (any(grepl("_[vV][0-9]+", unique_cols) | grepl("-[vV][0-9]+", unique_cols))) {
        detected_features <- c(detected_features, "vial_rep")
      }
      if (any(grepl("_[sScC][0-9]+", unique_cols) | grepl("_[0-9]+[a-zA-Z]+", unique_cols))) {
        detected_features <- c(detected_features, "time_course")
      }
      if (length(detected_features) == 0) {
        detected_features <- c(detected_features, "time_course")
      }
      autoDetectedFeatures(detected_features)
      
      # Show the Metadata Mapping modal automatically when new data is loaded without prior confirmation
      if (!already_confirmed) {
        cat("[LIPIDOMIC EXPLORER] Showing Metadata Mapping modal dialog...\n")
        showMetadataMappingModal(sample_example = ex_sample)
      }
    })
    
    # Helper function to show the Metadata Mapping modal
    showMetadataMappingModal <- function(sample_example = NULL) {
      if (is.null(sample_example) || !nzchar(sample_example)) {
        sample_example <- isolate(randomSampleExample())
      }
      if (is.null(sample_example) || !nzchar(sample_example)) {
        raw_df <- tryCatch(isolate(rawData()$data), error = function(e) NULL)
        if (!is.null(raw_df)) {
          c_names <- setdiff(names(raw_df), "Lipid_Name")
          if (length(c_names) > 0) {
            sample_example <- c_names[1]
            randomSampleExample(sample_example)
          }
        }
      }
      
      showModal(modalDialog(
        title = "Metadata Mapping",
        size = "xl",
        easyClose = TRUE,
        footer = tagList(
          modalButton("Close"),
          actionButton(
            session$ns("authorizeMetadata"),
            "Confirm",
            class = "btn-success px-4 fw-bold",
            `data-bs-dismiss` = "modal",
            `data-dismiss` = "modal"
          )
        ),
        div(
          # Custom style to enforce 90% modal width on large screens
          tags$style(HTML("
            @media (min-width: 768px) {
              .modal-dialog {
                max-width: 90% !important;
                width: 90% !important;
              }
            }
          ")),
          # Custom JS event listener to capture repeatable text highlights & handle modal horizontal stretching
          tags$script(HTML(paste0("
            $(document).off('mouseup', '.sample-name-cell');
            $(document).on('mouseup', '.sample-name-cell', function(e) {
              var selection = window.getSelection();
              var selectedText = selection.toString().trim();
              if (selectedText.length > 0) {
                var fullName = $(this).attr('data-fullname') || $(this).text().trim();
                var inputId = '", session$ns("selected_sample_substring"), "';
                Shiny.setInputValue(inputId, {text: selectedText, fullName: fullName, ts: Date.now()}, {priority: 'event'});
              }
            });
            
            // Custom mouse drag resizer for the validation modal width
            $(document).off('mousedown', '.modal-resize-handle');
            $(document).on('mousedown', '.modal-resize-handle', function(e) {
              e.preventDefault();
              var modal = $(this).closest('.modal-content');
              var startWidth = modal.width();
              var startX = e.clientX;
              
              $(document).on('mousemove.modalresize', function(e) {
                var newWidth = startWidth + (e.clientX - startX);
                modal.css('width', newWidth + 'px');
                modal.closest('.modal-dialog').css('max-width', 'none'); // Override Bootstrap limits
              });
              
              $(document).on('mouseup.modalresize', function() {
                $(document).off('.modalresize');
              });
            });
          "))),
          
          # Resizable handle vertical bar (lateral bar) on the right edge of modal
          div(
            class = "modal-resize-handle",
            style = "position: absolute; right: 0; top: 0; bottom: 0; width: 10px; cursor: col-resize; background: rgba(0, 0, 0, 0.03); border-right: 3px dashed #007bff; z-index: 1060; border-top-right-radius: 5px; border-bottom-right-radius: 5px;",
            title = "Drag laterally to resize this validation window"
          ),
          
          tabsetPanel(
            id = session$ns("mapping_tabs"),
            selected = rv$selected_mapping_tab,
            tabPanel("Lipidomics",
              # Step 0: Nomenclature Alignment Check
              conditionalPanel(
                condition = "input.nomenclature_standard_align != 'No'",
                ns = session$ns,
                div(
                  class = "card mb-4 border-primary bg-light",
                  div(
                    class = "card-body py-3",
                    h5(class = "card-title text-primary fw-bold mb-2", "Step 0: Nomenclature Alignment Check"),
                    p(class = "card-text small mb-3",
                      "To align downstream statistical models, loaded must follows conventional annotation ordering and separation by '_' delimiters. Examples include:",
                      tags$ul(class = "mb-2",
                        tags$li(tags$code("KO_Neutrophil_R1")),
                        tags$li(tags$code("Control_Plasma_M2"))
                      )
                    ),
                    div(
                      id = session$ns("standard_format_example_ui"),
                      class = "shiny-html-output",
                      div(
                        class = "alert alert-secondary py-2 px-3 small my-2 text-center",
                        p(class = "mb-1 text-muted", "Sample example from the loaded dataset:"),
                        if (!is.null(sample_example) && nzchar(sample_example)) {
                          tags$code(
                            style = "font-size: 1.25rem; font-weight: bold; color: #007bff;",
                            sample_example
                          )
                        } else {
                          div(
                            class = "py-2 text-center",
                            tags$i(class = "fas fa-spinner fa-spin text-primary", style = "font-size: 1.25rem;")
                          )
                        }
                      )
                    ),
                    radioButtons(
                      session$ns("nomenclature_standard_align"),
                      label = "Are the sample names formatted according to one of these sequences?",
                      choices = c("Yes" = "Yes", "No" = "No"),
                      selected = "Yes"
                    ),
                    uiOutput(session$ns("standard_embedded_tp_ui"))
                  )
                )
              ),
              # Step 1 & 2 Wrapper
              conditionalPanel(
                condition = "input.nomenclature_standard_align == 'No'",
                ns = session$ns,
                div(
                  class = "card border-light bg-light mb-4",
                  div(
                    class = "card-body",
                    actionLink(session$ns("back_to_step0"), "<- Back to Nomenclature Alignment Check", class = "btn btn-link btn-sm p-0 mb-3"),
                    uiOutput(session$ns("sample_preview_header")),
                    div(style = "overflow: auto; resize: both; min-height: 120px; border: 1px solid #dee2e6; padding: 10px; background: white;",
                        tableOutput(session$ns("sample_structure_preview"))),
                    uiOutput(session$ns("highlight_mapping_panel")),
                    div(
                      class = "card mb-3 border-info bg-light",
                      div(
                        class = "card-body py-3",
                        h6(class = "fw-bold text-primary mb-1", "Decomposition Schema Mapping"),
                        p(class = "text-muted small mb-3",
                          tags$strong("Note:"), " If one of these decomposed parts of the sample embeds a TimePoint dimension, check 'Embedded TimePoint ?' to enable extraction."
                        ),
                        uiOutput(session$ns("schema_config_ui")),
                        uiOutput(session$ns("visual_connection_flow"))
                      )
                    )
                  )
                )
              ),
              # Moved outside conditional panels so they are always visible
              uiOutput(session$ns("timepoint_condition_association_ui")),
              tags$details(
                style = "border: 1px solid #dee2e6; border-radius: 4px; padding: 15px; background-color: #f8f9fa; margin-top: 15px;",
                tags$summary(style = "cursor: pointer; font-weight: bold; color: #007bff;", "Metadata Terms Mapping & Alignment"),
                DT::DTOutput(session$ns("metadata_val_table"))
              )
            )
          )
        )
      ))
    }
    
    observeEvent(input$openMetadataMappingBtn, {
      ts <- format(Sys.time(), "%H:%M:%S")
      cat(sprintf("\n[RSTUDIO METADATA %s] 'Metadata Mapping' button clicked.\n", ts))
      if (is.null(rawData()$data)) {
        cat("  >> [STATUS] No raw dataset loaded yet. Prompting user to upload data first.\n")
        flush.console()
        showNotification("Please upload a lipidomics dataset first to configure metadata mapping.", type = "warning", duration = 4)
        return()
      }
      n_samples <- length(setdiff(names(rawData()$data), "Lipid_Name"))
      cat(sprintf("  >> [STATUS] Opening Metadata Mapping modal dialog for %d samples...\n", n_samples))
      flush.console()
      metadata_restored(FALSE)
      showMetadataMappingModal()
    })
    
    # Close modal and validate metadata mapping when authorized
    observeEvent(input$authorizeMetadata, {
      ts <- format(Sys.time(), "%H:%M:%S")
      cat(sprintf("\n[RSTUDIO METADATA %s] 'Confirm' (authorizeMetadata) clicked in modal.\n", ts))
      cat("  >> Authorizing metadata mapping and dismissing modal dialog...\n")
      flush.console()
      removeModal()
      rv$lipidomics_confirmed <- TRUE
      metadata_trigger(isolate(metadata_trigger()) + 1)
      analysis_is_fresh(TRUE)
      run_analysis_trigger_val(isolate(run_analysis_trigger_val()) + 1)
      showNotification("Metadata mapping confirmed! Pipeline execution launched.", type = "message", duration = 4)
      session$sendCustomMessage("pipelineExecutionActive", list(status = "running"))
      
      tryCatch({
        meta <- allParsedMetadata()
        cat(sprintf("[LIPIDOMIC EXPLORER %s] Metadata mapping confirmed and applied.\n", ts))
        cat("Analysis Mode: Global Lipidomics\n")
        cat("Nomenclature Standard Align: ", input$nomenclature_standard_align, "\n")
        cat("Embedded TimePoints: ", hasEmbeddedTimePoints(), "\n")
        
        # Display summary of mapped terms per category
        if (!is.null(meta)) {
          cat("Unique levels counts parsed:\n")
          for (col in c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint", "TimePoint_Group1")) {
            if (col %in% colnames(meta)) {
              vals <- sort(unique(meta[[col]]))
              cat(sprintf("  - %s (%d levels): %s\n", col, length(vals), paste(vals, collapse = ", ")))
            }
          }
        }
        flush.console()
      }, error = function(e) {
        cat("Error printing mapping info: ", e$message, "\n")
        flush.console()
      })
    })
    baseLipidAnnotation <- reactive({
      req(rawData()$data$Lipid_Name)
      req(isTRUE(rv$lipidomics_confirmed) || isTRUE(is_restoring()))
      lipid_names <- rawData()$data$Lipid_Name
      t_anno_start <- Sys.time()
      log_ingestion_event(
        stage = "7_LIPID_ANNOTATION_START",
        status = "START",
        message_text = sprintf("Starting bulk lipid nomenclature parsing for %d lipid species...", length(lipid_names)),
        details = list(count = length(lipid_names), sample_lipids = head(lipid_names, 5))
      )
      res <- tryCatch({
        parse_lipid_names_bulk(lipid_names, mode = "Global Lipidomics")
      }, error = function(e) {
        log_ingestion_event(
          stage = "7_LIPID_ANNOTATION_ERROR",
          status = "ERROR",
          message_text = paste("Failed to parse lipid nomenclature:", e$message),
          details = list(error = e$message)
        )
        stop(e)
      })
      t_anno_end <- Sys.time()
      elapsed_sec <- as.numeric(difftime(t_anno_end, t_anno_start, units = "secs"))
      log_ingestion_event(
        stage = "7_LIPID_ANNOTATION_SUCCESS",
        status = "SUCCESS",
        message_text = sprintf("Lipid nomenclature parsing completed in %.3fs for %d species.", elapsed_sec, nrow(res)),
        details = list(
          parsed_species = nrow(res),
          hyperclasses = paste(sort(unique(res$hyperclass)), collapse = ", "),
          subclasses_count = length(unique(res$subclass))
        )
      )
      res
    })
    
    annotationData <- reactive({
      req(baseLipidAnnotation())
      base_anno <- baseLipidAnnotation()
      


      active_mods <- input$activeModifications %||% character(0)
      
      base_anno %>% dplyr::mutate(
        subclass = case_when(
          modification == "plasmalogen" & !("plasmalogen" %in% active_mods) & subclass == "GP_PE_P" ~ "GP_PE",
          modification == "ether" & !("ether" %in% active_mods) & subclass == "GP_PE_E" ~ "GP_PE",
          modification == "dihydro" & !("dihydro" %in% active_mods) & subclass == "SP_Cer_dh" ~ "SP_Cer",
          modification == "dihydro" & !("dihydro" %in% active_mods) & subclass == "SP_SM_dh" ~ "SP_SM",
          TRUE ~ subclass
        ),
    # Re-derive hyperclass just in case
        hyperclass = case_when(
           subclass %in% c("GP_PE") ~ "GP",
           TRUE ~ hyperclass
        )
      )
    })
    
  # --- GLOBAL FILTER LOGIC ---
    
  # 1. Class Filter
    output$hyperclassSelectorUI <- renderUI({
      anno <- annotationData(); req(anno)
      choices <- sort(unique(anno$hyperclass))
      
      # Build color-coded HTML labels
      choice_names <- lapply(choices, function(hc) {
        full_name <- get_full_class_name(hc)
        hc_color <- if (hc %in% names(HYPERCLASS_MAP_COLORS)) HYPERCLASS_MAP_COLORS[[hc]] else "#B0B0B0"
        
        tags$span(
          tags$span(style = sprintf("display:inline-block; width:10px; height:10px; border-radius:50%%; background-color:%s; margin-right:6px; vertical-align:middle;", hc_color)),
          tags$span(style = "vertical-align:middle; font-weight:normal;", full_name)
        )
      })
      
      current_selection <- isolate(input$hyperclassSelector)
      if (isolate(is_restoring())) {
        selected <- if (is.null(current_selection)) choices else intersect(current_selection, choices)
      } else if (is.null(current_selection)) {
        selected <- choices
      } else {
        prev_ch <- prev_hyperclass_choices()
        new_choices <- setdiff(choices, prev_ch)
        selected <- union(intersect(current_selection, choices), new_choices)
      }
      
      prev_hyperclass_choices(choices)
      
      tagList(
        div(style="margin-bottom: 5px;",
            actionLink(session$ns("btn_all_hyper"), "All", style="text-decoration: underline; font-weight: normal; margin-right: 10px; cursor: pointer; color: #007bff;"),
            actionLink(session$ns("btn_none_hyper"), "None", style="text-decoration: underline; font-weight: normal; cursor: pointer; color: #007bff;")
        ),
        checkboxGroupInput(session$ns("hyperclassSelector"), 
                            label = "Lipid Category:", 
                            choiceNames = choice_names,
                            choiceValues = choices,
                            selected = selected, inline = TRUE)
      )
    })
    outputOptions(output, "hyperclassSelectorUI", suspendWhenHidden = FALSE)
    
    observeEvent(input$btn_all_hyper, {
      anno <- annotationData(); req(anno)
      choices <- sort(unique(anno$hyperclass))
      updateCheckboxGroupInput(session, "hyperclassSelector", selected = choices)
    })
    observeEvent(input$btn_none_hyper, {
      updateCheckboxGroupInput(session, "hyperclassSelector", selected = character(0))
    })
    
    output$subclassSelectorUI <- renderUI({
      anno <- annotationData(); req(anno)
      req(input$hyperclassSelector)
      filtered_anno <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector)
      choices <- sort(unique(filtered_anno$subclass))
      
      # Build mapping of subclass -> hyperclass from filtered annotation data
      sub_to_hyper <- filtered_anno %>% 
        dplyr::select(subclass, hyperclass) %>% 
        dplyr::distinct()
      sub_hyper_map <- setNames(sub_to_hyper$hyperclass, sub_to_hyper$subclass)
      
      # Build color-coded HTML labels
      choice_names <- lapply(choices, function(c) {
        full_name <- get_full_class_name(c)
        hc <- sub_hyper_map[[c]] %||% "Misc"
        hc_color <- if (hc %in% names(HYPERCLASS_MAP_COLORS)) HYPERCLASS_MAP_COLORS[[hc]] else "#B0B0B0"
        
        tags$span(
          tags$span(style = sprintf("display:inline-block; width:10px; height:10px; border-radius:50%%; background-color:%s; margin-right:6px; vertical-align:middle;", hc_color)),
          tags$span(style = "vertical-align:middle; font-weight:normal;", full_name)
        )
      })
      
      # Persistence Logic:
      # Filter selection is executed via strict intersection with available choices.
      # However, newly revealed choices (e.g. via Split Subclasses modifications like Ether and Plasmalogen)
      # should be checked by default.
      current_selection <- isolate(input$subclassSelector)
      if (isolate(is_restoring())) {
        selected <- if (is.null(current_selection)) choices else intersect(current_selection, choices)
      } else if (is.null(current_selection)) {
        selected <- choices
      } else {
        prev_ch <- prev_subclass_choices()
        new_choices <- setdiff(choices, prev_ch)
        selected <- union(intersect(current_selection, choices), new_choices)
      }
      
      prev_subclass_choices(choices)
      
      tagList(
        div(style="margin-bottom: 5px;",
            actionButton(session$ns("btn_all_sub"), "All", class = "btn btn-link btn-xs", style="padding: 0; text-decoration: underline; font-weight: normal; margin-right: 10px; border: none;"),
            actionButton(session$ns("btn_none_sub"), "None", class = "btn btn-link btn-xs", style="padding: 0; text-decoration: underline; font-weight: normal; border: none;")
        ),
        checkboxGroupInput(session$ns("subclassSelector"), "Lipid Main Class:",
                           choiceNames = choice_names,
                           choiceValues = choices,
                           selected = selected,
                           inline = TRUE)
      )
    })
    outputOptions(output, "subclassSelectorUI", suspendWhenHidden = FALSE)
    
    observeEvent(input$btn_all_sub, {
      anno <- annotationData(); req(anno, input$hyperclassSelector)
      filtered_anno <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector)
      choices <- as.character(sort(unique(filtered_anno$subclass)))
      updateCheckboxGroupInput(session, "subclassSelector", selected = choices)
    })
    observeEvent(input$btn_none_sub, {
      updateCheckboxGroupInput(session, "subclassSelector", selected = character(0))
    })
    
    output$modificationSelectorUI <- renderUI({
      anno <- annotationData(); req(anno)
      req(input$hyperclassSelector, input$subclassSelector)
      if(!"modification" %in% names(anno)) return(NULL)
      filtered_anno <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector, subclass %in% input$subclassSelector)
      choices <- sort(unique(filtered_anno$modification))
      tagList(
        div(style="margin-bottom: 5px;",
            actionLink(session$ns("btn_all_mod"), "All", style="text-decoration: underline; font-weight: normal; margin-right: 10px; cursor: pointer; color: #007bff;"),
            actionLink(session$ns("btn_none_mod"), "None", style="text-decoration: underline; font-weight: normal; cursor: pointer; color: #007bff;")
        ),
        checkboxGroupInput(session$ns("modificationSelector"), "Structural Modification State:", choices = choices, selected = choices, inline = TRUE)
      )
    })
    
    # Removed lipidMediatorSpeciesSelectorUI and button observers
    
    output$splitControlUI <- renderUI({
      anno <- baseLipidAnnotation(); req(anno)
   # Check presence
      has_plasmalogen <- any(anno$modification == "plasmalogen")
      has_ether <- any(anno$modification == "ether")
      has_dihydro <- any(anno$modification == "dihydro")
      
      choices <- list()
      selected <- list()
      
      if(has_plasmalogen) { choices[["Plasmalogen (P-)"]] <- "plasmalogen"; selected <- c(selected, "plasmalogen") }
      if(has_ether) { choices[["Ether (O-)"]] <- "ether"; selected <- c(selected, "ether") }
      if(has_dihydro) { choices[["Dihydro (d-)"]] <- "dihydro"; selected <- c(selected, "dihydro") }
      
      if(length(choices) == 0) return(NULL)
        
      checkboxGroupInput(session$ns("activeModifications"), "Lipid Sub Class:", 
                         choices = choices, selected = unlist(selected), inline = TRUE)
    })
    outputOptions(output, "modificationSelectorUI", suspendWhenHidden = FALSE)

    observeEvent(input$btn_all_mod, {
      anno <- annotationData(); req(anno, input$hyperclassSelector, input$subclassSelector)
      if(!"modification" %in% names(anno)) return(NULL)
      filtered_anno <- anno %>% dplyr::filter(hyperclass %in% input$hyperclassSelector, subclass %in% input$subclassSelector)
      choices <- sort(unique(filtered_anno$modification))
      updateCheckboxGroupInput(session, "modificationSelector", selected = choices)
    })
    observeEvent(input$btn_none_mod, {
      updateCheckboxGroupInput(session, "modificationSelector", selected = character(0))
    })
    
    lipids_to_show_by_class <- reactive({
      anno <- annotationData()
      req(anno)
      
      # Defensive defaults: if input controls are hidden or uninitialized in the dock tab, include all available
      sel_hc <- if (!is.null(input$hyperclassSelector) && length(input$hyperclassSelector) > 0) {
        input$hyperclassSelector
      } else {
        unique(anno$hyperclass)
      }
      
      sel_sc <- if (!is.null(input$subclassSelector) && length(input$subclassSelector) > 0) {
        input$subclassSelector
      } else {
        unique(anno$subclass)
      }
      
      res <- anno %>% dplyr::filter(hyperclass %in% sel_hc, subclass %in% sel_sc)
      if ("modification" %in% names(anno)) {
        sel_mod <- if (!is.null(input$modificationSelector) && length(input$modificationSelector) > 0) {
          input$modificationSelector
        } else {
          unique(anno$modification)
        }
        res <- res %>% dplyr::filter(modification %in% sel_mod)
      }
      
      # Safety check prevents crashes during transient states where inputs are stale
      req(nrow(res) > 0)
      res %>% dplyr::pull(Lipid_Name)
    })
    
  # 2. Advanced Filters
    lipids_to_show_by_advanced_filters <- reactive({
      anno <- annotationData()
   # Saturation
      if (!is.null(input$selectedSaturationFeatures) && length(input$selectedSaturationFeatures) > 0) {
        req_cols <- paste0("Has_", input$selectedSaturationFeatures)
        if(all(req_cols %in% names(anno))) {
           sat_mat <- as.matrix(anno[, req_cols])
           anno <- anno[rowSums(sat_mat, na.rm=TRUE) > 0, ]
        }
      }
   # Length
      if (!is.null(input$selectedLengthFeatures) && length(input$selectedLengthFeatures) > 0) {
        req_cols <- paste0("Has_", input$selectedLengthFeatures)
        if(all(req_cols %in% names(anno))) {
           len_mat <- as.matrix(anno[, req_cols])
           anno <- anno[rowSums(len_mat, na.rm=TRUE) > 0, ]
        }
      }
      anno$Lipid_Name
    })
    
  # 3. Granular Filters
    get_chain_ranges <- reactive({
      anno <- annotationData(); req(anno)
      all_nC <- c(anno$nCchain1, anno$nCchain2); all_DB <- c(anno$DBchain1, anno$DBchain2)
      min_C <- min(all_nC, na.rm = TRUE); max_C <- max(all_nC, na.rm = TRUE)
      min_DB <- min(all_DB, na.rm = TRUE); max_DB <- max(all_DB, na.rm = TRUE)
      if(!is.finite(min_C) || !is.finite(max_C)) return(NULL)
      list(min_C=min_C, max_C=max_C, min_DB=min_DB, max_DB=max_DB)
    })
    output$combo1SlidersUI <- renderUI({
      ranges <- get_chain_ranges(); req(ranges)
      tagList(
        sliderInput(session$ns("granular_nC1_range"), "Chain Length Range:", min=ranges$min_C, max=ranges$max_C, value=c(ranges$min_C, ranges$max_C)),
        sliderInput(session$ns("granular_DB1_range"), "Double Bond Range:", min=ranges$min_DB, max=ranges$max_DB, value=c(ranges$min_DB, ranges$max_DB), step=1)
      )
    })
    outputOptions(output, "combo1SlidersUI", suspendWhenHidden = FALSE)
    output$combo2SlidersUI <- renderUI({
      ranges <- get_chain_ranges(); req(ranges)
      tagList(
        sliderInput(session$ns("granular_nC2_range"), "Chain Length Range:", min=ranges$min_C, max=ranges$max_C, value=c(ranges$min_C, ranges$max_C)),
        sliderInput(session$ns("granular_DB2_range"), "Double Bond Range:", min=ranges$min_DB, max=ranges$max_DB, value=c(ranges$min_DB, ranges$max_DB), step=1)
      )
    })
    outputOptions(output, "combo2SlidersUI", suspendWhenHidden = FALSE)
    lipids_to_show_by_granular_filter <- reactive({
      anno_data <- annotationData()
      if (!isTRUE(input$activateGranularFiltering) || (!isTRUE(input$useCombo1) && !isTRUE(input$useCombo2))) {
        return(anno_data$Lipid_Name)
      }
      req(input$granularOrderMode)
      cond1A <- cond1B <- cond2A <- cond2B <- rep(FALSE, nrow(anno_data))
      
      if (isTRUE(input$useCombo1)) {
        req(input$granular_nC1_range, input$granular_DB1_range)
        cond1A <- tidyr::replace_na(dplyr::between(anno_data$nCchain1, input$granular_nC1_range[1], input$granular_nC1_range[2]) &
                                      dplyr::between(anno_data$DBchain1, input$granular_DB1_range[1], input$granular_DB1_range[2]), FALSE)
        cond1B <- tidyr::replace_na(dplyr::between(anno_data$nCchain2, input$granular_nC1_range[1], input$granular_nC1_range[2]) &
                                      dplyr::between(anno_data$DBchain2, input$granular_DB1_range[1], input$granular_DB1_range[2]), FALSE)
      }
      if (isTRUE(input$useCombo2)) {
        req(input$granular_nC2_range, input$granular_DB2_range)
        cond2A <- tidyr::replace_na(dplyr::between(anno_data$nCchain1, input$granular_nC2_range[1], input$granular_nC2_range[2]) &
                                      dplyr::between(anno_data$DBchain1, input$granular_DB2_range[1], input$granular_DB2_range[2]), FALSE)
        cond2B <- tidyr::replace_na(dplyr::between(anno_data$nCchain2, input$granular_nC2_range[1], input$granular_nC2_range[2]) &
                                      dplyr::between(anno_data$DBchain2, input$granular_DB2_range[1], input$granular_DB2_range[2]), FALSE)
      }
      passing_indices <- if (isTRUE(input$useCombo1) && isTRUE(input$useCombo2)) {
         if (input$granularOrderMode == "respect") cond1A & cond2B else (cond1A & cond2B) | (cond2A & cond1B)
      } else if (isTRUE(input$useCombo1)) {
         if (input$granularOrderMode == "respect") cond1A else cond1A | cond1B
      } else if (isTRUE(input$useCombo2)) {
         if (input$granularOrderMode == "respect") cond2B else cond2A | cond2B
      } else { rep(TRUE, nrow(anno_data)) }
      
      anno_data$Lipid_Name[passing_indices]
    })
    
  # 4. Substrate Filters
    lipids_to_show_by_substrate_filter <- reactive({
      anno_data <- annotationData()
      selected_substrates <- c(input$n6_substrates, input$n3_substrates)
      if (length(selected_substrates) == 0) return(anno_data$Lipid_Name)
      
      anno_data <- anno_data %>%
        dplyr::mutate(chain1_str = dplyr::if_else(!is.na(nCchain1), paste(nCchain1, DBchain1, sep = ":"), NA_character_),
                      chain2_str = dplyr::if_else(!is.na(nCchain2), paste(nCchain2, DBchain2, sep = ":"), NA_character_))
      
      positions <- input$substrate_match_positions
      if ("any" %in% positions || length(positions) == 0) {
        anno_data <- anno_data %>% dplyr::filter(chain1_str %in% selected_substrates | chain2_str %in% selected_substrates)
      } else if ("sn1" %in% positions) {
        anno_data <- anno_data %>% dplyr::filter(chain1_str %in% selected_substrates)
      } else if ("sn2" %in% positions) {
        anno_data <- anno_data %>% dplyr::filter(chain2_str %in% selected_substrates)
      }
      anno_data$Lipid_Name
    })
    
  # --- 6. Global Class Colors ---
    output$classColorUI <- renderUI({
      mode <- input$colorEditMode %||% "Group1"
      meta <- allParsedMetadata()
      anno <- annotationData()
      
      all_color_maps <- masterColorMaps()
      
      if (mode == "Group1" && !is.null(meta) && "Group1" %in% names(meta)) {
         grp_map <- all_color_maps[["Group1"]] %||% initialize_color_map(sort(unique(meta$Group1)), "Set1")
         items <- sort(names(grp_map))
         tagList(
           lapply(items, function(g) {
              safe_g <- gsub("[^A-Za-z0-9]", "_", g)
              def_col <- grp_map[[g]] %||% "#B0B0B0"
              div(style="display: inline-block; width: 48%; padding-right: 5px; vertical-align: top; margin-bottom: 6px;",
                  colourpicker::colourInput(session$ns(paste0("globalGroupCol_Group1_", safe_g)), label = g, value = def_col, showColour = "both")
              )
           })
         )
      } else if (mode == "Group2" && !is.null(meta) && "Group2" %in% names(meta)) {
         grp_map <- all_color_maps[["Group2"]] %||% initialize_color_map(sort(unique(meta$Group2)), "Dark2")
         items <- sort(names(grp_map))
         tagList(
           lapply(items, function(g) {
              safe_g <- gsub("[^A-Za-z0-9]", "_", g)
              def_col <- grp_map[[g]] %||% "#B0B0B0"
              div(style="display: inline-block; width: 48%; padding-right: 5px; vertical-align: top; margin-bottom: 6px;",
                  colourpicker::colourInput(session$ns(paste0("globalGroupCol_Group2_", safe_g)), label = g, value = def_col, showColour = "both")
              )
           })
         )
      } else if (mode == "Group1_Group2" && !is.null(meta) && "Group1" %in% names(meta) && "Group2" %in% names(meta)) {
         comp_grps <- unique(paste(meta$Group1, meta$Group2, sep = "_"))
         comp_grps <- gsub("_NA$", "", comp_grps)
         grp_map <- all_color_maps[["Group1 & Group2"]] %||% initialize_color_map(comp_grps, "Set2")
         items <- sort(names(grp_map))
         tagList(
           lapply(items, function(g) {
              safe_g <- gsub("[^A-Za-z0-9]", "_", g)
              def_col <- grp_map[[g]] %||% "#B0B0B0"
              div(style="display: inline-block; width: 48%; padding-right: 5px; vertical-align: top; margin-bottom: 6px;",
                  colourpicker::colourInput(session$ns(paste0("globalGroupCol_Comp_", safe_g)), label = g, value = def_col, showColour = "both")
              )
           })
         )
      } else if (mode == "Hyperclass" && !is.null(anno)) {
         origins <- sort(unique(anno$hyperclass))
         grp_map <- HYPERCLASS_MAP_COLORS
         tagList(
           lapply(origins, function(org) {
              safe_org <- gsub("[^A-Za-z0-9]", "_", org)
              def_col <- grp_map[[org]] %||% "#B0B0B0"
              div(style="display: inline-block; width: 48%; padding-right: 5px; vertical-align: top; margin-bottom: 6px;",
                  colourpicker::colourInput(session$ns(paste0("globalOriginCol_", safe_org)), label = org, value = def_col, showColour = "both")
              )
           })
         )
      } else {
         current_map <- global_class_color_map()
         classes <- sort(names(current_map))
         tagList(
           lapply(classes, function(cls) {
              safe_cls <- gsub("[^A-Za-z0-9]", "_", cls)
              def_col <- if(!is.null(current_map[[cls]])) current_map[[cls]] else "#B0B0B0"
              div(style="display: inline-block; width: 32%; padding-right: 5px; vertical-align: top; margin-bottom: 6px;",
                  colourpicker::colourInput(session$ns(paste0("globalClassCol_", safe_cls)), label = cls, value = def_col, showColour = "both")
              )
           })
         )
      }
    })

    observeEvent(input$btn_apply_colors, {
      mode <- input$colorEditMode %||% "Group1"
      curr_custom <- color_settings_val()$custom_colors %||% list()
      
      meta <- allParsedMetadata()
      anno <- annotationData()
      
      if (mode == "Group1" && !is.null(meta) && "Group1" %in% names(meta)) {
         grps <- sort(unique(meta$Group1))
         for (g in grps) {
            safe_g <- gsub("[^A-Za-z0-9]", "_", g)
            inp_val <- input[[paste0("globalGroupCol_Group1_", safe_g)]]
            if (!is.null(inp_val) && inp_val != "") {
               curr_custom[[g]] <- inp_val
               curr_custom[[paste0("Group1_", safe_g)]] <- inp_val
            }
         }
      } else if (mode == "Group2" && !is.null(meta) && "Group2" %in% names(meta)) {
         grps <- sort(unique(meta$Group2))
         for (g in grps) {
            safe_g <- gsub("[^A-Za-z0-9]", "_", g)
            inp_val <- input[[paste0("globalGroupCol_Group2_", safe_g)]]
            if (!is.null(inp_val) && inp_val != "") {
               curr_custom[[g]] <- inp_val
               curr_custom[[paste0("Group2_", safe_g)]] <- inp_val
            }
         }
      } else if (mode == "Group1_Group2" && !is.null(meta) && "Group1" %in% names(meta) && "Group2" %in% names(meta)) {
         comp_grps <- unique(paste(meta$Group1, meta$Group2, sep = "_"))
         comp_grps <- gsub("_NA$", "", comp_grps)
         for (g in comp_grps) {
            safe_g <- gsub("[^A-Za-z0-9]", "_", g)
            inp_val <- input[[paste0("globalGroupCol_Comp_", safe_g)]]
            if (!is.null(inp_val) && inp_val != "") {
               curr_custom[[g]] <- inp_val
               curr_custom[[safe_g]] <- inp_val
            }
         }
      } else if (mode == "Hyperclass" && !is.null(anno)) {
         origins <- sort(unique(anno$hyperclass))
         for (org in origins) {
            safe_org <- gsub("[^A-Za-z0-9]", "_", org)
            inp_val <- input[[paste0("globalOriginCol_", safe_org)]]
            if (!is.null(inp_val) && inp_val != "") {
               rv$origin_colors[[org]] <- inp_val
               curr_custom[[org]] <- inp_val
            }
         }
      } else if (mode == "Lipid Class" && !is.null(anno)) {
         classes <- sort(unique(anno$subclass))
         for (cls in classes) {
            safe_cls <- gsub("[^A-Za-z0-9]", "_", cls)
            inp_val <- input[[paste0("globalClassCol_", safe_cls)]]
            if (!is.null(inp_val) && inp_val != "") {
               curr_custom[[cls]] <- inp_val
            }
         }
      }
      
      color_settings_val(list(
         colorGrouping = color_settings_val()$colorGrouping %||% "Group1",
         useCustomColors = TRUE,
         custom_colors = curr_custom
      ))
      showNotification("Global custom colors applied successfully!", type = "message", duration = 3)
    })
  # --- 6. Hierarchical Color Logic ---
    
  # A. Lipid Class Map
    map_lipid_class <- reactive({
       anno <- annotationData(); req(anno)
       classes <- sort(unique(anno$subclass))
       
       current_map <- CLASS_MAP_COLORS
       unknown <- setdiff(classes, names(current_map))
       if (length(unknown) > 0) {
         # Safe Brewer Fallback
         fallback_colors <- safe_brewer_pal(length(unknown), "Dark2")
         names(fallback_colors) <- unknown
         current_map <- c(current_map, fallback_colors)
       }

     # Override with Inputs (prefix: globalClassCol_)
       for(cls in classes) {
         safe_cls <- gsub("[^A-Za-z0-9]", "_", cls)
         inp_id <- paste0("globalClassCol_", safe_cls)
         if(!is.null(input[[inp_id]]) && input[[inp_id]] != "") {
           current_map[[cls]] <- input[[inp_id]]
         }
       }
       
       # Return only classes present in the current data
       current_map[names(current_map) %in% classes]
    })
    
  # B. Biosynthetic Origin Map
    map_bio_origin <- reactive({
       anno <- annotationData(); req(anno)
       origins <- sort(unique(anno$hyperclass))
       
       current_map <- HYPERCLASS_MAP_COLORS
       
     # Ensure coverage
       unknown <- setdiff(origins, names(current_map))
       if(length(unknown) > 0) {
           fallback <- safe_brewer_pal(length(unknown), "Set1")
           names(fallback) <- unknown
           current_map <- c(current_map, fallback)
       }
       
     # Override with Inputs (prefix: globalOriginCol_)
     # Use Persistent Store (rv$origin_colors) to survive UI destruction
       for(org in names(rv$origin_colors)) {
          current_map[[org]] <- rv$origin_colors[[org]]
       }
       
       # Return only origins present in the current data
       current_map[names(current_map) %in% origins]
    })
    
  # Persistence Observer for Origins
    observe({
       anno <- annotationData()
       req(anno)
       origins <- unique(anno$hyperclass) 
       
       for(org in origins) {
         if(is.na(org)) next
         safe_org <- gsub("[^A-Za-z0-9]", "_", org)
         inp_id <- paste0("globalOriginCol_", safe_org)
         val <- input[[inp_id]]
         
         if(!is.null(val) && val != "") {
             rv$origin_colors[[org]] <- val
         }
       }
     })
     
   # C. Single Species Map (Lipid_Name)
     map_single_species <- reactive({
        anno <- annotationData(); req(anno)
        species <- sort(unique(anno$Lipid_Name))
        
        current_map <- character(0)
        
        unknown <- setdiff(species, names(current_map))
        if(length(unknown) > 0) {
            fallback <- scales::hue_pal()(length(unknown))
            names(fallback) <- unknown
            current_map <- c(current_map, fallback)
        }
       
    # Override with Inputs (prefix: globalSpeciesCol_)
    # Use Persistent Store (rv$species_colors)
       for(sp in names(rv$species_colors)) {
          current_map[[sp]] <- rv$species_colors[[sp]]
       }
       
       # Return only species present in the current data
       current_map[names(current_map) %in% species]
    })

  # Persistence Observer for Species
    observe({
       anno <- annotationData()
       req(anno)
       species <- unique(anno$Lipid_Name)
       
       for(sp in species) {
          if(is.na(sp)) next
          safe_sp <- gsub("[^A-Za-z0-9]", "_", sp)
          inp_id <- paste0("globalSpeciesCol_", safe_sp)
          val <- input[[inp_id]]
          
          if(!is.null(val) && val != "") {
             rv$species_colors[[sp]] <- val
          }
       }
    })

  # --- UI Rendering for Panel 8 ---
    output$classColorUI <- renderUI({
      anno <- annotationData(); req(anno)
      mode <- input$colorEditMode # Current Dropdown Selection
      
   # Select Data and Input Prefix based on Mode
   # BREAK LOOP: Isolate the map read to prevent recursive re-rendering when inputs update.
   # The UI should initialize with current map, but input updates (which update the map via observer)
   # should NOT trigger a full UI re-render.
      if (is.null(mode) || mode == "Lipid Class") {
          current_map <- isolate(map_lipid_class())
          prefix <- "globalClassCol_"
          items <- sort(names(current_map))
       } else if (mode == "Hyperclass") {
          current_map <- isolate(map_bio_origin())
          prefix <- "globalOriginCol_"
          items <- sort(names(current_map))
      } else {
     # Single Species
          current_map <- isolate(map_single_species())
          prefix <- "globalSpeciesCol_"
          items <- sort(names(current_map))
      }
      
   # Grid layout 
      tagList(
        lapply(items, function(item) {
           safe_id <- gsub("[^A-Za-z0-9]", "_", item)
           val <- if(!is.null(current_map[[item]])) current_map[[item]] else "#B0B0B0"
           
           div(style="display: inline-block; width: 32%; padding-right: 5px; vertical-align: top;",
               colourpicker::colourInput(session$ns(paste0(prefix, safe_id)), label=item, value = val, showColour = "both")
           )
        })
      )
    })
    
  # Backward Compatibility Wrapper
    global_class_color_map <- map_lipid_class

  # 5. Differential Expression Logic
    getDEGroupChoices <- reactive({
      # 1. Primary source: processed data columns or parsed metadata
      meta <- tryCatch({
        if (!is.null(data_processed())) {
          m <- allParsedMetadata()
          if (!is.null(m)) m %>% dplyr::filter(FullName %in% colnames(data_processed())) else NULL
        } else {
          allParsedMetadata()
        }
      }, shiny.silent.error = function(e) NULL, error = function(e) NULL)

      if (is.null(meta)) {
        edit_m <- tryCatch(editableMetadata(), shiny.silent.error = function(e) NULL, error = function(e) NULL)
        if (!is.null(edit_m) && "Group1" %in% names(edit_m)) {
          meta <- edit_m
        }
      }
      
      if (is.null(meta)) {
        return(c("Kidney_WT", "Kidney_Ctns", "Plasma_WT", "Plasma_Ctns"))
      }
      
      parts <- list()
      if (isTRUE(input$deOrientGroup1) && "Group1" %in% names(meta)) parts$Group1 <- meta$Group1
      if (isTRUE(input$deOrientGroup2) && "Group2" %in% names(meta)) parts$Group2 <- meta$Group2
      if (isTRUE(input$deOrientTimePoint) && "TimePoint" %in% names(meta)) {
        tps <- meta$TimePoint
        if (any(!is.na(tps) & tps != "" & tps != "Unspecified")) {
          parts$TimePoint <- tps
        }
      }
      
      if (length(parts) == 0) {
        if ("Group1" %in% names(meta)) return(unique(meta$Group1))
        return("All")
      } else {
        res_vec <- do.call(paste, c(parts, list(sep = "_")))
        return(unique(res_vec))
      }
    })
    output$deReferenceGroupUI <- renderUI({ 
      choices <- getDEGroupChoices()
      # Persistence & Restoration: Keep current selection if valid, fall back to restored input
      current_sel <- isolate(input$deReferenceGroups)
      if (length(current_sel) == 0) {
        current_sel <- get_restored_input("deReferenceGroups", NULL) %||% get_restored_input("moReferenceGroups", NULL)
      }
      selected <- intersect(current_sel, choices)
      if (length(selected) == 0 && length(choices) >= 2) {
        selected <- choices[1]
      } else if (length(selected) == 0 && length(choices) == 1) {
        selected <- choices[1]
      }
      selectizeInput(session$ns("deReferenceGroups"), "Reference:", choices = choices, selected = selected, multiple = TRUE,
                     options = list(placeholder = "Select groups (multiple allowed)...")) 
    })
    output$deComparisonGroupUI <- renderUI({ 
      choices <- getDEGroupChoices()
      # Persistence & Restoration: Keep current selection if valid, fall back to restored input
      current_sel <- isolate(input$deComparisonGroups)
      if (length(current_sel) == 0) {
        current_sel <- get_restored_input("deComparisonGroups", NULL) %||% get_restored_input("moComparisonGroups", NULL)
      }
      selected <- intersect(current_sel, choices)
      if (length(selected) == 0 && length(choices) >= 2) {
        selected <- choices[2]
      } else if (length(selected) == 0 && length(choices) == 1) {
        selected <- choices[1]
      }
      selectizeInput(session$ns("deComparisonGroups"), "Comparison:", choices = choices, selected = selected, multiple = TRUE,
                     options = list(placeholder = "Select groups (multiple allowed)...")) 
    })
    
    output$deInteractionGroupUI <- renderUI({
      choices <- getDEGroupChoices()
      
   # Persistence helper
      get_persisted <- function(id) {
         curr <- isolate(input[[id]])
         if(is.null(curr) || curr == "") return("")
         if(curr %in% choices) return(curr) else return("")
      }
      
      tagList(
        p(class="text-muted small mb-1", "Formula: (Comp_T2 - Comp_T1) - (Ref_T2 - Ref_T1)"),
        tags$div(class = "badge bg-light text-secondary border mb-1", style = "font-size: 10.5px;", "Reference Cohort:"),
        div(style="display: flex; gap: 5px; margin-bottom: 6px;",
            div(style="flex: 1;", selectInput(session$ns("int_ref_t2"), "Ref T2 (Response):", choices = c("Select group..." = "", choices), selected = get_persisted("int_ref_t2"))),
            div(style="flex: 1;", selectInput(session$ns("int_ref_t1"), "Ref T1 (Baseline):", choices = c("Select group..." = "", choices), selected = get_persisted("int_ref_t1")))
        ),
        tags$div(class = "badge bg-light text-secondary border mb-1", style = "font-size: 10.5px;", "Comparison Cohort:"),
        div(style="display: flex; gap: 5px;",
            div(style="flex: 1;", selectInput(session$ns("int_comp_t2"), "Comp T2 (Response):", choices = c("Select group..." = "", choices), selected = get_persisted("int_comp_t2"))),
            div(style="flex: 1;", selectInput(session$ns("int_comp_t1"), "Comp T1 (Baseline):", choices = c("Select group..." = "", choices), selected = get_persisted("int_comp_t1")))
        )
      )
    })

    # Synchronize inline DE setup inputs with sidebar controls
    observeEvent(input$inline_de_ref, {
      updateSelectizeInput(session, "deReferenceGroups", selected = input$inline_de_ref)
    }, ignoreInit = TRUE, ignoreNULL = FALSE)

    observeEvent(input$inline_de_comp, {
      updateSelectizeInput(session, "deComparisonGroups", selected = input$inline_de_comp)
    }, ignoreInit = TRUE, ignoreNULL = FALSE)

    observeEvent(input$inline_de_mode, {
      req(input$inline_de_mode)
      updateRadioButtons(session, "deComparisonMode", selected = input$inline_de_mode)
    }, ignoreInit = TRUE)
    
       allLipidDEOutput <- reactive({
      mat <- data_processed()
      if (is.null(mat) || ncol(mat) < 3) return(NULL) # Lipid_Name + 2 columns
      
      mat_num <- mat %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      meta <- allParsedMetadata() %>% dplyr::filter(FullName %in% colnames(mat_num))
      if (is.null(meta) || nrow(meta) == 0) return(NULL)
      
      # Determine Grouping based on Selection (with defensive defaults for docked controls)
      parts <- list()
      orient_g1 <- if (is.null(input$deOrientGroup1)) TRUE else isTRUE(input$deOrientGroup1)
      orient_g2 <- if (is.null(input$deOrientGroup2)) FALSE else isTRUE(input$deOrientGroup2)
      orient_tp <- if (is.null(input$deOrientTimePoint)) FALSE else isTRUE(input$deOrientTimePoint)
      
      if (orient_g1 && "Group1" %in% names(meta)) parts$Group1 <- meta$Group1
      if (orient_g2 && "Group2" %in% names(meta)) parts$Group2 <- meta$Group2
      if (orient_tp && "TimePoint" %in% names(meta)) {
        tps <- meta$TimePoint
        if (any(!is.na(tps) & tps != "" & tps != "Unspecified")) {
          parts$TimePoint <- tps
        }
      }
      
      if (length(parts) == 0 && "Group1" %in% names(meta) && length(unique(meta$Group1)) >= 2) {
        parts$Group1 <- meta$Group1
      }
      
      meta$Dynamic_DE_Group <- if (length(parts) == 0) {
        "All"
      } else {
        do.call(paste, c(parts, list(sep = "_")))
      }
      
      if (length(unique(meta$Dynamic_DE_Group)) < 2) {
        return(NULL)
      }
      
      de_mode <- input$deComparisonMode %||% "direct"
      
      # Resolve reference and comparison groups with automatic fallback
      ref_groups <- input$deReferenceGroups
      comp_groups <- input$deComparisonGroups
      
      if (de_mode == "direct") {
        if (is.null(ref_groups) || length(ref_groups) == 0 ||
            is.null(comp_groups) || length(comp_groups) == 0) {
          choices <- getDEGroupChoices()
          if (length(choices) >= 2) {
            ref_groups <- if (is.null(ref_groups) || length(ref_groups) == 0) choices[1] else ref_groups
            comp_groups <- if (is.null(comp_groups) || length(comp_groups) == 0) choices[2] else comp_groups
          } else {
            return(NULL)
          }
        }
      } else {
        req(input$int_ref_t1, input$int_ref_t2, input$int_comp_t1, input$int_comp_t2)
        if (any(c(input$int_ref_t1, input$int_ref_t2, input$int_comp_t1, input$int_comp_t2) == "")) return(NULL)
      }
      
      # Construct Contrast String
      contrast_str <- if (de_mode == "direct") {
        construct_contrast_string(ref_groups, comp_groups)
      } else {
        # Interaction Contrast: (Comp_T2 - Comp_T1) - (Ref_T2 - Ref_T1)
        g_ref1 <- make.names(input$int_ref_t1); g_ref2 <- make.names(input$int_ref_t2)
        g_comp1 <- make.names(input$int_comp_t1); g_comp2 <- make.names(input$int_comp_t2)
        paste0("(", g_comp2, "-", g_comp1, ")-(", g_ref2, "-", g_ref1, ")")
      }
      
      if (is.null(contrast_str) || !nzchar(contrast_str)) return(NULL)
      
      # --- LEGACY ALIGNMENT (v9.6) ---
      # Ensure using strict log2(x) for DE to match Legacy, not log2(x+1)
      mat_log <- log2(mat_num)
      mat_log[!is.finite(mat_log)] <- NA
      
      # Resolve method if in Auto-Route mode or unrecognized legacy input
      method_to_run <- input$deMethod
      if (is.null(method_to_run) || !method_to_run %in% c("auto", "limma", "non_parametric")) {
        method_to_run <- "limma"
      }
      if (method_to_run == "auto") {
        resolved <- auto_route_statistical_method(mat_log, meta, "Dynamic_DE_Group")
        actual_method_val(paste0("auto_", resolved))
        method_to_run <- resolved
      } else {
        actual_method_val(method_to_run)
      }
      
      de_out <- if (method_to_run == "non_parametric") {
        perform_non_parametric_analysis(mat_log, meta, "Dynamic_DE_Group", contrast_str)
      } else {
        perform_limma_analysis(mat_log, meta, "Dynamic_DE_Group", contrast_str)
      }
      de_out
    })
    
    allLipidDEResults <- reactive({
      out <- allLipidDEOutput()
      if (is.null(out)) return(NULL)
      out$results
    })
    
    allLipidDEFit <- reactive({
      out <- allLipidDEOutput()
      if (is.null(out)) return(NULL)
      out$fit
    })
    
    significantLipids <- reactive({
      res <- allLipidDEResults()
      if(is.null(res)) return(NULL)
      p_val_type <- input$pValueType %||% "adjusted"
      p_col <- if(p_val_type == "adjusted") "p_adj_bh" else "p_raw"
      p_thresh <- input$pFilterThreshold %||% 0.05
      fc_thresh <- input$log2fcThreshold %||% 1
      res %>% 
        dplyr::filter(.data[[p_col]] <= p_thresh, abs(log2FC) >= fc_thresh) %>%
        dplyr::pull(Lipid_Name)
    })
    
  # --- GLOBAL FILTERED LIPIDS ---
    global_filtered_lipids_all <- reactive({
      l1 <- lipids_to_show_by_class()
      l2 <- lipids_to_show_by_advanced_filters()
      l3 <- lipids_to_show_by_granular_filter()
      l4 <- lipids_to_show_by_substrate_filter()
      
      base_set <- Reduce(intersect, list(l1, l2, l3, l4))
      
      # Integrate BQC CoV outliers filtering
      bqc_settings <- bqc_filter_settings_val()
      if (isTRUE(bqc_settings$filterBqcOutliers) && !is.null(bqc_settings$bqcPassingLipids)) {
         base_set <- intersect(base_set, bqc_settings$bqcPassingLipids)
      }
      base_set
    })

    global_filtered_lipids <- reactive({
      base_set <- global_filtered_lipids_all()

      # Integrate Global Targeted Lipid Selection
      if (isTRUE(targeted_mode_active()) && length(targeted_lipids_list()) > 0) {
         base_set <- intersect(base_set, targeted_lipids_list())
         print(paste("DEBUG: Post-Targeted Mode Filtered Set length:", length(base_set)))
      }
      
      print(paste("DEBUG: Global Filtered Set length:", length(base_set)))
      base_set
    })

    pca_fallback_active <- reactiveVal(FALSE)

    pca_results <- reactive({
      pca_opts <- pca_settings_val()
      
      # Unified PCA calculation pipeline
      run_pca_calc <- function(df_input, filter_set = NULL) {
        req(df_input)
        if (!is.null(filter_set)) {
          df_input <- df_input %>% dplyr::filter(Lipid_Name %in% filter_set)
        }
        useCols <- setdiff(names(df_input), "Lipid_Name")
        if (nrow(df_input) <= 1 || length(useCols) < 2) {
          stop("Not enough data for PCA (requires >1 lipid and >=2 samples).")
        }
        
        pca_mode <- pca_opts$pcaMode %||% "omics"
        t_pca_start <- Sys.time()
        cat(sprintf("\n[PERF - START] %s | Starting PCA Calculation (mode: %s)\n",
                    format(t_pca_start, "%H:%M:%OS3"), pca_mode), file = stderr())
                    
        if (pca_mode == "omics") {
          mat_pca <- df_input %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
          mat_pca_t <- t(mat_pca)
          near_zero_var <- which(apply(mat_pca_t, 2, var, na.rm = TRUE) < 1e-10)
          if (length(near_zero_var) > 0) {
            mat_pca_t <- mat_pca_t[, -near_zero_var, drop = FALSE]
          }
          if (ncol(mat_pca_t) <= 1) {
            stop("Not enough variable lipids for PCA (requires >=2 variable lipids).")
          }
          pca_res <- prcomp(mat_pca_t, scale. = TRUE)
          
          max_pcs <- pca_opts$maxPCs %||% 3
          ncomp <- min(max_pcs, ncol(pca_res$x))
          if (ncomp < 1) stop("PCA produced 0 components.")
          
          pca_scores_df <- as.data.frame(pca_res$x) %>%
            dplyr::select(all_of(paste0("PC", 1:ncomp))) %>%
            tibble::rownames_to_column("FullName") %>%
            dplyr::left_join(allParsedMetadata(), by = "FullName")
          
          replicate_score_df <- pca_scores_df
          
          if (isTRUE(pca_opts$mergeReplicates)) {
            merged_meta <- allParsedMetadata() %>%
              dplyr::mutate(NewGroupName = mapply(function(cond, pop, tp) {
                parts <- c(
                  if (!is.na(cond) && cond != "Unspecified" && nzchar(cond)) as.character(cond) else "",
                  if (!is.na(pop) && pop != "Unspecified" && nzchar(pop)) as.character(pop) else "",
                  if (!is.na(tp) && tp != "Unspecified" && nzchar(tp)) as.character(tp) else ""
                )
                parts <- parts[nzchar(parts)]
                if (length(parts) == 0) "Unspecified" else paste(parts, collapse = "_")
              }, Group1, Group2, TimePoint, USE.NAMES = FALSE)) %>%
              dplyr::distinct(NewGroupName, .keep_all = TRUE) %>%
              dplyr::select(-FullName, -Replicate)
            pca_scores_df <- pca_scores_df %>%
              dplyr::mutate(NewGroupName = mapply(function(cond, pop, tp) {
                parts <- c(
                  if (!is.na(cond) && cond != "Unspecified" && nzchar(cond)) as.character(cond) else "",
                  if (!is.na(pop) && pop != "Unspecified" && nzchar(pop)) as.character(pop) else "",
                  if (!is.na(tp) && tp != "Unspecified" && nzchar(tp)) as.character(tp) else ""
                )
                parts <- parts[nzchar(parts)]
                if (length(parts) == 0) "Unspecified" else paste(parts, collapse = "_")
              }, Group1, Group2, TimePoint, USE.NAMES = FALSE)) %>%
              dplyr::group_by(NewGroupName) %>%
              dplyr::summarise(across(starts_with("PC"), mean), .groups = "drop") %>%
              dplyr::left_join(merged_meta, by = "NewGroupName") %>%
              dplyr::mutate(FullName = NewGroupName)
          }
          
          pca_loadings_df <- as.data.frame(pca_res$rotation) %>%
            dplyr::select(all_of(paste0("PC", 1:ncomp))) %>%
            tibble::rownames_to_column("Lipid_Name") %>%
            dplyr::left_join(annotationData() %>% dplyr::select(Lipid_Name, subclass), by = "Lipid_Name") %>%
            dplyr::rename(Class = subclass)
          var_explained <- round(summary(pca_res)$importance[2, 1:ncomp] * 100, 1)
          t_pca_end <- Sys.time()
          cat(sprintf("[PERF - COMPLETE] %s | %s PCA Calculation Finished in %.3f sec\n",
                      format(t_pca_end, "%H:%M:%OS3"), pca_mode, as.numeric(difftime(t_pca_end, t_pca_start, units = "secs"))), file = stderr())
          list(score_df = pca_scores_df, replicate_score_df = replicate_score_df, load_df = pca_loadings_df, var_PC = var_explained)
        } else {
          # CLASS mode
          anno <- annotationData() %>% dplyr::filter(Lipid_Name %in% df_input$Lipid_Name)
          df_class <- df_input %>%
            dplyr::left_join(anno %>% dplyr::select(Lipid_Name, subclass), by = "Lipid_Name")
          if(isTRUE(pca_opts$dropMisc)){ df_class <- df_class[df_class$subclass != "Misc", ] }
          colMetadata <- allParsedMetadata() %>% dplyr::filter(FullName %in% useCols)
          
          longDF_rep <- df_class %>%
            tidyr::pivot_longer(all_of(useCols), names_to = "FullName", values_to = "Value")
            
          classRepDF <- longDF_rep %>%
            dplyr::filter(!is.na(FullName) & FullName != "") %>%
            dplyr::group_by(subclass, FullName) %>%
            dplyr::summarize(Value = sum(Value, na.rm = TRUE), .groups = "drop")
            
          mat_rep_wide <- classRepDF %>%
            tidyr::pivot_wider(names_from = subclass, values_from = Value, values_fill = 0)
            
          if (nrow(mat_rep_wide) < 2) stop("At least 2 distinct samples are required to run class PCA.")
          
          mat_rep_pca <- as.matrix(mat_rep_wide[, -1])
          rownames(mat_rep_pca) <- mat_rep_wide$FullName
          mat_rep_filt <- mat_rep_pca[, apply(mat_rep_pca, 2, sd, na.rm = TRUE) > 1e-12, drop = FALSE]
          
          max_pcs <- pca_opts$maxPCs %||% 3
          if (ncol(mat_rep_filt) < 2) stop("Not enough variable classes for PCA.")
          ncomp <- min(max_pcs, nrow(mat_rep_filt) - 1, ncol(mat_rep_filt))
          if (ncomp < 1) stop("Not enough dimensions for class PCA.")
          pca_res <- nipals::nipals(mat_rep_filt, ncomp = ncomp, gramschmidt = TRUE)
          
          replicate_score_df <- as.data.frame(pca_res$scores) %>%
            `colnames<-`(paste0("PC", 1:ncomp)) %>%
            tibble::rownames_to_column("FullName") %>%
            dplyr::left_join(colMetadata, by = "FullName")
            
          if(isTRUE(pca_opts$mergeReplicates)){
            merged_meta <- colMetadata %>%
              dplyr::mutate(NewGroupName = mapply(function(cond, pop, tp) {
                parts <- c(
                  if (!is.na(cond) && cond != "Unspecified" && nzchar(cond)) as.character(cond) else "",
                  if (!is.na(pop) && pop != "Unspecified" && nzchar(pop)) as.character(pop) else "",
                  if (!is.na(tp) && tp != "Unspecified" && nzchar(tp)) as.character(tp) else ""
                )
                parts <- parts[nzchar(parts)]
                if (length(parts) == 0) "Unspecified" else paste(parts, collapse = "_")
              }, Group1, Group2, TimePoint, USE.NAMES = FALSE)) %>%
              dplyr::distinct(NewGroupName, .keep_all = TRUE) %>%
              dplyr::select(-FullName, -Replicate)
              
            score_df <- replicate_score_df %>%
              dplyr::mutate(NewGroupName = mapply(function(cond, pop, tp) {
                parts <- c(
                  if (!is.na(cond) && cond != "Unspecified" && nzchar(cond)) as.character(cond) else "",
                  if (!is.na(pop) && pop != "Unspecified" && nzchar(pop)) as.character(pop) else "",
                  if (!is.na(tp) && tp != "Unspecified" && nzchar(tp)) as.character(tp) else ""
                )
                parts <- parts[nzchar(parts)]
                if (length(parts) == 0) "Unspecified" else paste(parts, collapse = "_")
              }, Group1, Group2, TimePoint, USE.NAMES = FALSE)) %>%
              dplyr::group_by(NewGroupName) %>%
              dplyr::summarise(across(starts_with("PC"), mean), .groups = "drop") %>%
              dplyr::left_join(merged_meta, by = "NewGroupName") %>%
              dplyr::mutate(FullName = NewGroupName)
          } else {
            score_df <- replicate_score_df
          }
          
          load_df <- as.data.frame(pca_res$loadings) %>%
            `colnames<-`(paste0("PC", 1:ncomp)) %>%
            tibble::rownames_to_column(var = "Class")
          t_pca_end <- Sys.time()
          cat(sprintf("[PERF - COMPLETE] %s | %s PCA Calculation Finished in %.3f sec\n",
                      format(t_pca_end, "%H:%M:%OS3"), pca_mode, as.numeric(difftime(t_pca_end, t_pca_start, units = "secs"))), file = stderr())
          list(score_df = score_df, replicate_score_df = replicate_score_df, load_df = load_df, var_PC = round(pca_res$R2 * 100, 1))
        }
      }
      
      df_curr <- data_processed()
      filtered_curr <- global_filtered_lipids()
      
      # Targeted mode check & graceful fallback
      if (isTRUE(targeted_mode_active()) && length(targeted_lipids_list()) > 0) {
        attempt <- tryCatch({
          run_pca_calc(df_curr, filtered_curr)
        }, error = function(e) {
          cat("[PCA Notice] Targeted PCA cannot be computed on selected lipids:", e$message, "\n", file = stderr())
          NULL
        })
        
        if (!is.null(attempt) && length(attempt$var_PC) >= 2) {
          pca_fallback_active(FALSE)
          attempt$fallback_used <- FALSE
          return(attempt)
        }
        
        # Insufficient or erroneous targeted PCA -> Fall back to All Matrix
        cat("[PCA Fallback] Targeted lipids insufficient for PCA. Falling back to All Matrix.\n", file = stderr())
        pca_fallback_active(TRUE)
        notify_targeted_fallback(session, id = "targeted_fallback_pca")
        
        df_all <- data_processed_full()
        all_filtered <- global_filtered_lipids_all()
        res_all <- tryCatch({
          run_pca_calc(df_all, all_filtered)
        }, error = function(e) {
          tryCatch(run_pca_calc(df_all, NULL), error = function(e2) NULL)
        })
        validate(need(!is.null(res_all), "Could not compute PCA on dataset."))
        res_all$fallback_used <- TRUE
        return(res_all)
      } else {
        pca_fallback_active(FALSE)
        res <- run_pca_calc(df_curr, filtered_curr)
        res$fallback_used <- FALSE
        return(res)
      }
    })
    masterColorMaps <- reactive({
      meta <- allParsedMetadata(); req(meta)
      color_opts <- color_settings_val()
      
      unique_conditions <- sort(unique(meta$Group1)) %>% na.omit()
      cond_colors <- initialize_color_map(unique_conditions, "Set1")
      
      unique_group2 <- sort(unique(meta$Group2)) %>% na.omit()
      pop_colors <- initialize_color_map(unique_group2, "Dark2")
      
      # Combined (kept for legacy/backward compatibility)
      meta_groups <- meta %>% dplyr::mutate(Group = gsub("_NA$", "", paste(Group1, Group2, sep = "_")))
      unique_groups <- sort(unique(meta_groups$Group)) %>% na.omit()
      group_colors <- initialize_color_map(unique_groups, "Set2") 
      
      # TimePoint
      unique_timepoints <- sort(unique(meta$TimePoint)) %>% na.omit()
      tp_colors <- initialize_color_map(unique_timepoints, "Accent")
      
      # PatientNumber
      unique_patients <- sort(unique(meta$PatientNumber)) %>% na.omit()
      patient_colors <- initialize_color_map(unique_patients, "Paired")
      
      # Build dynamic map for the currently selected colorGrouping combination
      group_cols <- color_opts$colorGrouping
      if (length(group_cols) == 0) group_cols <- "Group1"
      comb_key <- paste(group_cols, collapse = " & ")
      
      combined_vals <- apply(meta[, group_cols, drop=FALSE], 1, function(row) {
        vals <- as.character(row)
        vals <- vals[!is.na(vals) & vals != "Unspecified"]
        if (length(vals) == 0) "Unspecified" else paste(vals, collapse = "_")
      })
      unique_combined <- sort(unique(combined_vals))
      combined_colors <- initialize_color_map(unique_combined, "Set2")
      
      # Apply Custom Overrides from QC Module
      if (isTRUE(color_opts$useCustomColors)) {
         custom_map <- color_opts$custom_colors
         
         resolve_override <- function(name, custom_map, default) {
            key <- gsub("\\s|&", "_", name)
            if (!is.null(custom_map[[key]])) return(custom_map[[key]])
            if (!is.null(custom_map[[name]])) return(custom_map[[name]])
            default
         }
         
         # Override Group1 Colors
         for (cond in names(cond_colors)) {
            cond_colors[[cond]] <- resolve_override(cond, custom_map, cond_colors[[cond]])
         }
         
         # Override Group2 Colors
         for (pop in names(pop_colors)) {
            pop_colors[[pop]] <- resolve_override(pop, custom_map, pop_colors[[pop]])
         }
         
         # Override Group Colors
         for (grp in names(group_colors)) {
            group_colors[[grp]] <- resolve_override(grp, custom_map, group_colors[[grp]])
         }
         
         # Override TimePoint Colors
         for (tp in names(tp_colors)) {
            tp_colors[[tp]] <- resolve_override(tp, custom_map, tp_colors[[tp]])
         }
         
         # Override PatientNumber Colors
         for (pt in names(patient_colors)) {
            patient_colors[[pt]] <- resolve_override(pt, custom_map, patient_colors[[pt]])
         }
         
         # Override Combined Colors
         for (comb in names(combined_colors)) {
            combined_colors[[comb]] <- resolve_override(comb, custom_map, combined_colors[[comb]])
         }
      }
      
      res_list <- list(
        Group1 = cond_colors,
        Group2 = pop_colors,
        "Group1 & Group2" = group_colors,
        TimePoint = tp_colors,
        PatientNumber = patient_colors
      )
      res_list[[comb_key]] <- combined_colors
      res_list
    })
    masterShapeMaps <- reactive({
      meta <- allParsedMetadata(); req(meta)
      shape_opts <- shape_settings_val()
      
      # Dynamic combined shape map for shapeGrouping
      shape_cols <- shape_opts$shapeGrouping
      if (length(shape_cols) == 0) shape_cols <- "Group2"
      comb_key <- paste(shape_cols, collapse = " & ")
      
      combined_vals <- apply(meta[, shape_cols, drop=FALSE], 1, function(row) {
        vals <- as.character(row)
        vals <- vals[!is.na(vals) & vals != "Unspecified"]
        if (length(vals) == 0) "Unspecified" else paste(vals, collapse = "_")
      })
      
      res_list <- list(
        Group1 = make_shape_map(meta$Group1, SHAPE_CHOICES),
        Group2 = make_shape_map(meta$Group2, SHAPE_CHOICES),
        TimePoint = make_shape_map(meta$TimePoint, SHAPE_CHOICES),
        PatientNumber = make_shape_map(meta$PatientNumber, SHAPE_CHOICES)
      )
      res_list[[comb_key]] <- make_shape_map(combined_vals, SHAPE_CHOICES)
      
      # Apply Custom Shape Overrides from QC Module
      if (isTRUE(shape_opts$useShapes)) {
        custom_shapes <- shape_opts$custom_shapes
        for (name in names(res_list)) {
          for (lvl in names(res_list[[name]])) {
            key <- gsub("\\s|&", "_", lvl)
            if (!is.null(custom_shapes[[key]])) {
              res_list[[name]][[lvl]] <- custom_shapes[[key]]
            } else if (!is.null(custom_shapes[[lvl]])) {
              res_list[[name]][[lvl]] <- custom_shapes[[lvl]]
            }
          }
        }
      }
      
      res_list
    })
    activeColorMap <- reactive({ 
      req(masterColorMaps())
      color_opts <- color_settings_val()
      group_cols <- color_opts$colorGrouping
      if (length(group_cols) == 0) group_cols <- "Group1"
      key <- paste(group_cols, collapse = " & ")
      masterColorMaps()[[key]] 
    })
    activeShapeMap <- reactive({ 
      req(masterShapeMaps())
      shape_opts <- shape_settings_val()
      group_cols <- shape_opts$shapeGrouping
      if (length(group_cols) == 0) group_cols <- "Group2"
      key <- paste(group_cols, collapse = " & ")
      masterShapeMaps()[[key]] 
    })
    output$customColorUI <- renderUI({
      req(isTRUE(get_setting("useCustomColors", FALSE)), activeColorMap())
   # Note: This controls custom colors on the server side if were to render them here
   # but they are rendered in QC module. Kept for legacy or fallback.
      NULL 
    })
    output$customShapeUI <- renderUI({
      req(isTRUE(get_setting("useShapes", FALSE)), activeShapeMap())
      NULL
    })
    default_class_colors <- reactive({
      req(pca_results())
      classes <- unique(pca_results()$load_df$Class) %>% na.omit()
      req(length(classes) > 0)
      finalColors <- CLASS_MAP_COLORS
      unknown <- setdiff(classes, names(finalColors))
      if (length(unknown) > 0) {
        fallback_colors <- colorRampPalette(brewer.pal(8, "Dark2"))(length(unknown))
        names(fallback_colors) <- unknown
        finalColors <- c(finalColors, fallback_colors)
      }
      finalColors[classes]
    })
    output$customColorClassUI <- renderUI({
      req(pca_results(), isTRUE(get_setting("useCustomColorsClasses", FALSE)))
      NULL
    })
    dynamic_class_colors <- reactive({
      defaults <- default_class_colors()
      if (!isTRUE(get_setting("useCustomColorsClasses", FALSE))) return(defaults)
      
   # For customization, used to read inputs. Now these inputs are in QC module.
   # The qc_boxplot_module sends back 'custom_class_colors' list in settings.
      custom_map <- get_setting("custom_class_colors", list())
      
      for (g in names(defaults)) {
        if (!is.null(custom_map[[g]])) { defaults[g] <- custom_map[[g]] }
      }
      defaults
    })
    observeEvent(get_setting("mergeReplicates", TRUE), {
   # This used to update a local input 'labelParts'. 
   # Since labelParts is now in QC module, this logic should move there or be handled by the user.
   # cannot update an input that doesn't exist here.    # Removing local update logic.
    }, ignoreNULL = TRUE, ignoreInit = TRUE)
    
    # ==========================================
    # --- SESSION SAVE & RESTORE MECHANICALS ---
    # ==========================================
    
    restore_list_of_lists <- function(x) {
      if (is.null(x)) return(list())
      
      clean_item <- function(item) {
        if (is.data.frame(item)) {
          row_list <- split(item, seq_len(nrow(item)))
          res <- lapply(row_list, function(r) as.list(r))
          names(res) <- NULL
          return(lapply(res, clean_item))
        }
        if (is.list(item)) {
          item <- as.list(item)
          if (is.null(names(item)) || all(names(item) == "")) {
            # Unnamed list
            cleaned <- lapply(item, clean_item)
            simplified <- lapply(cleaned, function(v) {
              if (is.list(v) && length(v) == 1 && (is.null(names(v)) || all(names(v) == ""))) {
                v[[1]]
              } else {
                v
              }
            })
            if (all(sapply(simplified, is.atomic)) && all(sapply(simplified, length) == 1)) {
              return(unlist(simplified))
            } else {
              return(simplified)
            }
          } else {
            # Named list
            for (n in names(item)) {
              val <- item[[n]]
              cleaned_val <- clean_item(val)
              if (is.list(cleaned_val) && length(cleaned_val) == 1 && (is.null(names(cleaned_val)) || all(names(cleaned_val) == ""))) {
                item[[n]] <- cleaned_val[[1]]
              } else {
                item[[n]] <- cleaned_val
              }
            }
            return(item)
          }
        }
        return(item)
      }
      
      if (is.data.frame(x)) {
        row_list <- split(x, seq_len(nrow(x)))
        res <- lapply(row_list, function(r) as.list(r))
        names(res) <- NULL
        return(lapply(res, clean_item))
      }
      if (is.list(x)) {
        return(lapply(x, clean_item))
      }
      return(list())
    }
    
    serialize_state <- function() {
      global_session <- getDefaultReactiveDomain()
      all_inputs <- reactiveValuesToList(global_session$input)
      
      # Exclude buttons, files, import files, and dynamic outlier treatment inputs
      excl_patterns <- c("import_session_file", "export_session_btn", "files", "openMetadataMappingBtn", "runAnalysis", "downloadPostNAData", "selectAll", "unselectAll", "authorizeMetadata", "remove_", "treat_", "subgroupToggle")
      
      clean_inputs <- list()
      for (k in names(all_inputs)) {
        is_excluded <- any(sapply(excl_patterns, function(pat) grepl(pat, k)))
        is_dt_transient <- grepl("_rows_", k) || grepl("_cell_", k) || grepl("_state$", k) || grepl("_columns$", k) || grepl("_search$", k)
        
        if (!is_excluded && !is_dt_transient) {
          val <- all_inputs[[k]]
          if (is.atomic(val) || is.list(val)) {
            clean_inputs[[k]] <- val
          }
        }
      }
      
      # Gather metadata state
      metadata_state <- list(
        parsedMetadataStructure = parsedMetadataStructure(),
        editableMetadata = editableMetadata(),
        clusters = clusters(),
        uniqueCols = uniqueCols(),
        autoDetectedFeatures = autoDetectedFeatures(),
        schemaSelections = schemaSelections(),
        timepointGroup1Map = timepointGroup1Map(),
        hasEmbeddedTimePoints = hasEmbeddedTimePoints(),
        embeddedTimePointPrefixes = embeddedTimePointPrefixes(),
        embeddedTimePointMap = embeddedTimePointMap()
      )
      
      # Gather custom colors/shapes
      color_shape_state <- list(
        origin_colors = rv$origin_colors,
        species_colors = rv$species_colors
      )
      
      # Gather outliers state
      outliers_state <- list(
        treatments = get_setting("outlierTreatments", list()),
        bqcManualExclusions = get_setting("bqcManualExclusions", NULL)
      )
      
      # Gather longitudinal custom state
      longitudinal_state <- list(
        saved_timecourses = saved_timecourses(),
        saved_patient_groups = saved_patient_groups(),
        saved_designer_cases = saved_designer_cases(),
        saved_timepoint_order_prefs = saved_timepoint_order_prefs(),
        saved_level_prefs = saved_level_prefs()
      )
      
      # Gather uploads
      uploads_state <- rv$uploads
      
      list(
        inputs = clean_inputs,
        metadata = metadata_state,
        color_shape = color_shape_state,
        outliers = outliers_state,
        longitudinal = longitudinal_state,
        uploads = uploads_state,
        analysisMode = "Global Lipidomics"
      )
    }
    
    update_input_generic <- function(sess, id, val) {
      if (grepl("_json$", id)) {
        if (is.list(val) || (is.character(val) && length(val) > 1)) {
          val_str <- jsonlite::toJSON(val, auto_unbox = TRUE)
        } else if (is.character(val) && length(val) == 1) {
          val_str <- val
        } else {
          val_str <- as.character(val)
        }
        updateTextInput(sess, id, value = val_str)
      } else if (is.logical(val) && length(val) == 1) {
        updateCheckboxInput(sess, id, value = val)
      } else if (is.numeric(val)) {
        if (length(val) == 2) {
          updateSliderInput(sess, id, value = val)
        } else {
          updateNumericInput(sess, id, value = val)
          updateSliderInput(sess, id, value = val)
        }
      } else if (is.character(val)) {
        updateCheckboxGroupInput(sess, id, selected = val)
        updateSelectInput(sess, id, selected = val)
        if (length(val) <= 1) {
          val_scalar <- if (length(val) == 1) val else ""
          updateTextInput(sess, id, value = val_scalar)
          updateRadioButtons(sess, id, selected = val_scalar)
          if (length(val) == 1 && grepl("^#", val) && (nchar(val) == 7 || nchar(val) == 9)) {
            colourpicker::updateColourInput(sess, id, value = val)
          }
        }
      } else if (is.list(val)) {
        val_unlisted <- unlist(val)
        updateCheckboxGroupInput(sess, id, selected = val_unlisted)
        updateSelectInput(sess, id, selected = val_unlisted)
      }
    }
    
    output$export_session_btn <- downloadHandler(
      filename = function() {
        paste0("Lipidomic_Explorer_Session_", format(Sys.time(), "%Y%m%d_%H%M"), ".zip")
      },
      content = function(file) {
        # Create a temp directory
        tmp_dir <- tempfile("session_export_")
        dir.create(tmp_dir)
        on.exit(unlink(tmp_dir, recursive = TRUE))
        
        # Serialize state
        state_list <- serialize_state()
        
        # Copy data files to the zip directory first
        uploads <- state_list$uploads
        if (length(uploads) > 0) {
          data_files_dir <- file.path(tmp_dir, "data_files")
          dir.create(data_files_dir)
          for (name in names(uploads)) {
            path <- uploads[[name]]
            if (file.exists(path)) {
              dest <- file.path(data_files_dir, basename(path))
              file.copy(path, dest, overwrite = TRUE)
              # Update state.json references to be relative to the zip archive
              state_list$uploads[[name]] <- file.path("data_files", basename(path))
            }
          }
        }
        
        # (Copying transcriptomics file removed)
        
        # Save state.json
        state_json_path <- file.path(tmp_dir, "state.json")
        jsonlite::write_json(state_list, state_json_path, auto_unbox = TRUE, pretty = TRUE)
        
        # Zip the directory using zip::zip (preserving structure)
        old_wd <- getwd()
        setwd(tmp_dir)
        files_to_zip <- "state.json"
        if (dir.exists("data_files")) {
          files_to_zip <- c(files_to_zip, "data_files")
        }
        zip::zip(file, files = files_to_zip, recurse = TRUE)
        setwd(old_wd)
      },
      contentType = "application/zip"
    )
    
    # Observe Download Imputed CSV Button Click
    # If no outliers were removed or averaged: trigger direct download immediately.
    # If outliers WERE removed or averaged: present interactive choice panel for Before/After/Both.
    observeEvent(input$downloadPostNAData, {
      ts <- format(Sys.time(), "%H:%M:%S")
      cat(sprintf("\n[RSTUDIO DOWNLOAD %s] 'Download Imputed CSV' button clicked.\n", ts))
      df <- tryCatch(data_processed(), error = function(e) NULL)
      if (is.null(df) || nrow(df) == 0) {
        cat("  >> [STATUS] Imputed dataset not available yet. Prompting user to run analysis first.\n")
        flush.console()
        showNotification("Please upload data and click 'Run Analysis' first to generate the imputed dataset.", type = "warning")
        return()
      }
      cat(sprintf("  >> [STATUS] Imputed dataset ready (%d lipids x %d cols). Processing download request...\n", nrow(df), ncol(df)))
      flush.console()
      
      outlier_treatments <- get_setting("outlierTreatments", list())
      averaged_samples <- names(outlier_treatments)[sapply(outlier_treatments, function(x) identical(x, "average"))]
      removed_samples <- names(outlier_treatments)[sapply(outlier_treatments, function(x) identical(x, "remove"))]
      active_count <- length(averaged_samples) + length(removed_samples)
      
      if (active_count == 0) {
        # No outliers removed or averaged: trigger direct download
        session$sendCustomMessage("triggerClick", list(id = session$ns("downloadPostNADataDirect")))
      } else {
        # Active outliers exist: show choice modal
        meta_all <- tryCatch(all_metadata(), error = function(e) NULL)
        get_friendly_name <- function(col_name) {
          if (!is.null(meta_all) && "FullName" %in% names(meta_all)) {
            row_match <- meta_all[meta_all$FullName == col_name, ]
            if (nrow(row_match) > 0) {
              if ("ReplicateName" %in% names(row_match) && !is.na(row_match$ReplicateName[1]) && nzchar(trimws(row_match$ReplicateName[1]))) {
                return(trimws(row_match$ReplicateName[1]))
              }
              if ("DisplayLabel" %in% names(row_match) && !is.na(row_match$DisplayLabel[1]) && nzchar(trimws(row_match$DisplayLabel[1]))) {
                return(trimws(row_match$DisplayLabel[1]))
              }
            }
          }
          return(col_name)
        }
        
        avg_labels <- if (length(averaged_samples) > 0) sapply(averaged_samples, get_friendly_name) else character(0)
        rem_labels <- if (length(removed_samples) > 0) sapply(removed_samples, get_friendly_name) else character(0)
        
        showModal(modalDialog(
          title = div(class = "d-flex align-items-center gap-2",
            tags$i(class = "fa-solid fa-file-csv", style = "color: #047857; font-size: 1.25rem;"),
            tags$h5(class = "modal-title fw-bold mb-0", style = "color: #0f172a;", "Export Imputed Dataset: Outlier Options")
          ),
          size = "l",
          easyClose = TRUE,
          footer = tagList(
            modalButton("Close")
          ),
          div(class = "p-1",
            # Information & Outlier Treatment Status Banner
            div(class = "p-3 mb-3 rounded-3", 
                style = "background: rgba(15, 23, 42, 0.03); border: 1px solid rgba(15, 23, 42, 0.08); border-radius: 11px !important;",
              div(class = "d-flex align-items-center gap-2 mb-2",
                tags$i(class = "fa-solid fa-circle-info", style = "color: #047857;"),
                tags$strong(style = "color: #0f172a; font-size: 13.5px;", "Active Outlier Modifications Detected")
              ),
              p(class = "small text-muted mb-2",
                "Your current dataset includes active outlier treatments. Select whether to export the dataset before these adjustments were applied, the final dataset after adjustments, or both versions:"
              ),
              div(class = "d-flex flex-wrap gap-2 small mt-2 pt-1 border-top",
                div(class = "d-flex align-items-center gap-1",
                  tags$span(class = "badge", style = "background: rgba(234, 88, 12, 0.12); color: #C2410C; border: 1px solid rgba(234, 88, 12, 0.25);",
                    paste0("Averaged (", length(averaged_samples), ")")
                  ),
                  tags$span(class = "text-secondary small",
                    if (length(avg_labels) > 0) paste(avg_labels, collapse = ", ") else "None"
                  )
                ),
                if (length(removed_samples) > 0) {
                  div(class = "d-flex align-items-center gap-1 ms-2",
                    tags$span(class = "badge", style = "background: rgba(239, 68, 68, 0.12); color: #B91C1C; border: 1px solid rgba(239, 68, 68, 0.25);",
                      paste0("Excluded (", length(removed_samples), ")")
                    ),
                    tags$span(class = "text-secondary small",
                      paste(rem_labels, collapse = ", ")
                    )
                  )
                } else NULL
              )
            ),
            
            # 3 Choice Cards Layout
            layout_columns(
              col_widths = c(4, 4, 4),
              
              # Card 1: Before Outliers
              card(
                class = "border-0 shadow-sm h-100",
                style = "border: 1px solid rgba(124, 58, 237, 0.25) !important; background: rgba(124, 58, 237, 0.02) !important; border-radius: 12px;",
                card_header(
                  style = "background: rgba(124, 58, 237, 0.08) !important; border-bottom: 1px solid rgba(124, 58, 237, 0.20) !important; border-radius: 12px 12px 0 0;",
                  div(class = "d-flex justify-content-between align-items-center",
                    tags$span(style = "color: #5B21B6; font-weight: 700; font-size: 13.5px;", icon("clock-rotate-left"), " Before Outliers"),
                    tags$span(class = "badge", style = "background: rgba(124, 58, 237, 0.15); color: #5B21B6; border: 1px solid rgba(124, 58, 237, 0.30);", "Raw Imputed")
                  )
                ),
                card_body(
                  class = "d-flex flex-column justify-content-between",
                  div(
                    p(class = "small text-muted mb-2", "Dataset prior to replicate exclusion or peer-averaging."),
                    tags$ul(class = "small text-secondary ps-3 mb-3",
                      tags$li("All sample replicates retained"),
                      tags$li("Authentic measured values"),
                      tags$li("No peer-group substitutions")
                    )
                  ),
                  div(class = "mt-auto pt-2",
                    downloadButton(session$ns("downloadImputedBefore"), "Before Outliers CSV", icon = icon("file-csv"), class = "btn-imputed-choice btn-imputed-before w-100")
                  )
                )
              ),
              
              # Card 2: After Outliers
              card(
                class = "border-0 shadow-sm h-100",
                style = "border: 1px solid rgba(5, 150, 105, 0.25) !important; background: rgba(5, 150, 105, 0.02) !important; border-radius: 12px;",
                card_header(
                  style = "background: rgba(5, 150, 105, 0.08) !important; border-bottom: 1px solid rgba(5, 150, 105, 0.20) !important; border-radius: 12px 12px 0 0;",
                  div(class = "d-flex justify-content-between align-items-center",
                    tags$span(style = "color: #047857; font-weight: 700; font-size: 13.5px;", icon("wand-magic-sparkles"), " After Outliers"),
                    tags$span(class = "badge", style = "background: rgba(5, 150, 105, 0.15); color: #047857; border: 1px solid rgba(5, 150, 105, 0.30);", "Final Analyzed")
                  )
                ),
                card_body(
                  class = "d-flex flex-column justify-content-between",
                  div(
                    p(class = "small text-muted mb-2", "Active dataset reflecting all outlier exclusions and group substitutions."),
                    tags$ul(class = "small text-secondary ps-3 mb-3",
                      tags$li("Excluded samples omitted"),
                      tags$li("Averaged samples mean-substituted"),
                      tags$li("Exact matrix used in DE and PCA")
                    )
                  ),
                  div(class = "mt-auto pt-2",
                    downloadButton(session$ns("downloadImputedAfter"), "After Outliers CSV", icon = icon("file-csv"), class = "btn-imputed-choice btn-imputed-after w-100")
                  )
                )
              ),
              
              # Card 3: Both Versions ZIP
              card(
                class = "border-0 shadow-sm h-100",
                style = "border: 1px solid rgba(234, 88, 12, 0.25) !important; background: rgba(234, 88, 12, 0.02) !important; border-radius: 12px;",
                card_header(
                  style = "background: rgba(234, 88, 12, 0.08) !important; border-bottom: 1px solid rgba(234, 88, 12, 0.20) !important; border-radius: 12px 12px 0 0;",
                  div(class = "d-flex justify-content-between align-items-center",
                    tags$span(style = "color: #C2410C; font-weight: 700; font-size: 13.5px;", icon("box-archive"), " Both Versions"),
                    tags$span(class = "badge", style = "background: rgba(234, 88, 12, 0.15); color: #C2410C; border: 1px solid rgba(234, 88, 12, 0.30);", "Complete ZIP")
                  )
                ),
                card_body(
                  class = "d-flex flex-column justify-content-between",
                  div(
                    p(class = "small text-muted mb-2", "Complete archival package containing both Before and After CSVs."),
                    tags$ul(class = "small text-secondary ps-3 mb-3",
                      tags$li("Both CSV matrices bundled"),
                      tags$li("Outliers Treatment Ledger included"),
                      tags$li("Publication & audit compliance")
                    )
                  ),
                  div(class = "mt-auto pt-2",
                    downloadButton(session$ns("downloadImputedBoth"), "Both Versions (ZIP)", icon = icon("file-zipper"), class = "btn-imputed-choice btn-imputed-both w-100")
                  )
                )
              )
            )
          )
        ))
      }
    })
    
    # Direct Download Handler (for single-click export when no outliers are treated)
    output$downloadPostNADataDirect <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Imputed_PostNA_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv")
      },
      content = function(file) {
        df <- data_processed()
        if (is.null(df) || nrow(df) == 0) return(NULL)
        write.csv(df, file, row.names = FALSE, na = "")
      },
      contentType = "text/csv"
    )

    # Choice Modal Handler 1: Before Outliers Treatment CSV
    output$downloadImputedBefore <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Imputed_Before_Outliers_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv")
      },
      content = function(file) {
        df <- compute_imputed_matrix(apply_outliers = FALSE)
        if (is.null(df) || nrow(df) == 0) df <- data_processed()
        write.csv(df, file, row.names = FALSE, na = "")
      },
      contentType = "text/csv"
    )

    # Choice Modal Handler 2: After Outliers Treatment CSV
    output$downloadImputedAfter <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Imputed_After_Outliers_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv")
      },
      content = function(file) {
        df <- data_processed()
        if (is.null(df) || nrow(df) == 0) df <- compute_imputed_matrix(apply_outliers = TRUE)
        write.csv(df, file, row.names = FALSE, na = "")
      },
      contentType = "text/csv"
    )

    # Choice Modal Handler 3: Both Versions ZIP Archive
    output$downloadImputedBoth <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Imputed_Both_Versions_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".zip")
      },
      content = function(file) {
        tmp_dir <- file.path(tempdir(), paste0("imputed_both_", format(Sys.time(), "%Y%m%d_%H%M%S_%OS3")))
        dir.create(tmp_dir, recursive = TRUE, showWarnings = FALSE)
        
        file_dest <- normalizePath(file, winslash = "/", mustWork = FALSE)
        before_file <- file.path(tmp_dir, paste0("LipidomicExplorer_Imputed_Before_Outliers_", format(Sys.time(), "%Y%m%d"), ".csv"))
        after_file  <- file.path(tmp_dir, paste0("LipidomicExplorer_Imputed_After_Outliers_", format(Sys.time(), "%Y%m%d"), ".csv"))
        ledger_file <- file.path(tmp_dir, "Outliers_Treatment_Ledger.txt")
        
        df_before <- compute_imputed_matrix(apply_outliers = FALSE)
        if (is.null(df_before) || nrow(df_before) == 0) df_before <- data_processed()
        df_after <- data_processed()
        if (is.null(df_after) || nrow(df_after) == 0) df_after <- compute_imputed_matrix(apply_outliers = TRUE)
        
        write.csv(df_before, before_file, row.names = FALSE, na = "")
        write.csv(df_after, after_file, row.names = FALSE, na = "")
        
        outlier_treatments <- get_setting("outlierTreatments", list())
        averaged_samples <- names(outlier_treatments)[sapply(outlier_treatments, function(x) identical(x, "average"))]
        removed_samples <- names(outlier_treatments)[sapply(outlier_treatments, function(x) identical(x, "remove"))]
        
        meta_all <- tryCatch(all_metadata(), error = function(e) NULL)
        get_friendly_name <- function(col_name) {
          if (!is.null(meta_all) && "FullName" %in% names(meta_all)) {
            row_match <- meta_all[meta_all$FullName == col_name, ]
            if (nrow(row_match) > 0) {
              if ("ReplicateName" %in% names(row_match) && !is.na(row_match$ReplicateName[1]) && nzchar(trimws(row_match$ReplicateName[1]))) {
                return(trimws(row_match$ReplicateName[1]))
              }
              if ("DisplayLabel" %in% names(row_match) && !is.na(row_match$DisplayLabel[1]) && nzchar(trimws(row_match$DisplayLabel[1]))) {
                return(trimws(row_match$DisplayLabel[1]))
              }
            }
          }
          return(col_name)
        }
        
        avg_labels <- if (length(averaged_samples) > 0) sapply(averaged_samples, get_friendly_name) else character(0)
        rem_labels <- if (length(removed_samples) > 0) sapply(removed_samples, get_friendly_name) else character(0)
        
        ledger_lines <- c(
          "================================================================================",
          "GLOBAL LIPIDOMIC EXPLORER - OUTLIER TREATMENT ARCHIVAL LEDGER",
          "================================================================================",
          paste0("Export Timestamp: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S")),
          paste0("Total Quantified Lipids: ", if (!is.null(df_after)) nrow(df_after) else 0),
          paste0("Total Columns (Before Outliers): ", if (!is.null(df_before)) ncol(df_before) else 0),
          paste0("Total Columns (After Outliers):  ", if (!is.null(df_after)) ncol(df_after) else 0),
          "",
          "--------------------------------------------------------------------------------",
          "OUTLIER TREATMENT CONFIGURATION",
          "--------------------------------------------------------------------------------",
          paste0("Averaged Replicates (", length(averaged_samples), "): ", if (length(avg_labels) > 0) paste(avg_labels, collapse = ", ") else "None"),
          paste0("Excluded/Removed Replicates (", length(removed_samples), "): ", if (length(rem_labels) > 0) paste(rem_labels, collapse = ", ") else "None"),
          "",
          "--------------------------------------------------------------------------------",
          "ARCHIVE FILE INVENTORY",
          "--------------------------------------------------------------------------------",
          "1. LipidomicExplorer_Imputed_Before_Outliers_*.csv",
          "   - Raw imputed & normalized data matrix prior to outlier removal or averaging.",
          "   - Retains authentic individual replicate measurements for all samples.",
          "",
          "2. LipidomicExplorer_Imputed_After_Outliers_*.csv",
          "   - Final analyzed data matrix post-outlier processing.",
          "   - Excluded replicates are completely removed.",
          "   - Averaged replicates are substituted with biological peer group averages.",
          "",
          "3. Outliers_Treatment_Ledger.txt",
          "   - Comprehensive audit trail and metadata configuration ledger.",
          "================================================================================"
        )
        writeLines(ledger_lines, ledger_file)
        
        old_wd <- getwd()
        setwd(tmp_dir)
        files_to_zip <- c(basename(before_file), basename(after_file), basename(ledger_file))
        zip::zip(file_dest, files = files_to_zip)
        setwd(old_wd)
        unlink(tmp_dir, recursive = TRUE)
      },
      contentType = "application/zip"
    )
    
    import_status <- reactiveVal("")
    output$import_status_display <- renderUI({
      status <- import_status()
      if (status == "") return(NULL)
      if (grepl("Error", status)) {
        div(class = "alert alert-danger p-2 small mt-2", status)
      } else {
        div(class = "alert alert-success p-2 small mt-2", status)
      }
    })
    
    # Observer to handle uploading missing datasets during session restore
    observeEvent(input$missing_file_uploader, {
      req(input$missing_file_uploader)
      req(length(missing_files_to_restore()) > 0)
      
      file_info <- input$missing_file_uploader
      orig_name <- missing_files_to_restore()[1]
      
      # Copy to user_uploads folder
      dest_dir <- file.path("data", "user_uploads")
      if (!dir.exists(dest_dir)) dir.create(dest_dir, recursive = TRUE)
      dest_path <- file.path(dest_dir, basename(file_info$name))
      file.copy(file_info$datapath, dest_path, overwrite = TRUE)
      
      # Update rv$uploads
      current_uploads <- rv$uploads
      current_uploads[[orig_name]] <- dest_path
      rv$uploads <- current_uploads
      
      # Remove from missing list
      remaining <- missing_files_to_restore()[-1]
      missing_files_to_restore(remaining)
      
      if (length(remaining) > 0) {
        # Update modal to ask for the next missing file
        showModal(modalDialog(
          title = "Missing Dataset Required",
          size = "m",
          easyClose = FALSE,
          footer = NULL,
          div(
            class = "text-center py-2",
            tags$h4(class = "text-danger fw-bold mb-3", "Missing Raw Dataset"),
            tags$p("The session has been restored, but the following required dataset file was missing from the package:"),
            tags$p(tags$code(style = "font-size: 1.15rem;", paste(remaining, collapse = ", "))),
            tags$p(class = "text-muted small my-3", "Please locate and upload this file from your computer to complete the session restoration:"),
            fileInput(
              session$ns("missing_file_uploader"),
              label = NULL,
              multiple = FALSE,
              buttonLabel = "Browse...",
              placeholder = "Select raw data file..."
            )
          )
        ))
      } else {
        # All files restored! Close modal
        removeModal()
        
        # Resume the restoration pipeline stages sequentially
        state_data <- restoring_state_data()
        restoring_state_data(NULL)
        
        # Stage 2: Metadata Mappings
        tryCatch({
          if (!is.null(state_data$metadata$parsedMetadataStructure)) {
            pms <- state_data$metadata$parsedMetadataStructure
            if (is.list(pms$parsed_df) && !is.data.frame(pms$parsed_df)) pms$parsed_df <- as.data.frame(pms$parsed_df)
            if (is.list(pms$mappings) && !is.data.frame(pms$mappings)) pms$mappings <- as.data.frame(pms$mappings)
            
            # Defensively ensure required parsed columns are present
            required_cols <- c("FullName", "Group1Term", "Group2Term", "ReplicateTerm", "PatientTerm", "TimePointTerm")
            for (col in required_cols) {
              if (!col %in% colnames(pms$parsed_df)) {
                pms$parsed_df[[col]] <- NA_character_
              }
            }
            parsedMetadataStructure(pms)
          }
          if (!is.null(state_data$metadata$editableMetadata)) {
            em <- state_data$metadata$editableMetadata
            if (is.list(em) && !is.data.frame(em)) em <- as.data.frame(em)
            editableMetadata(em)
          }
          
          safe_restore_val <- function(val, default = NULL) {
            if (is.null(val)) return(default)
            val
          }
          
          clusters(safe_restore_val(state_data$metadata$clusters, 1))
          uniqueCols(safe_restore_val(state_data$metadata$uniqueCols))
          autoDetectedFeatures(safe_restore_val(state_data$metadata$autoDetectedFeatures))
          schemaSelections(safe_restore_val(as.list(state_data$metadata$schemaSelections)))
          timepointGroup1Map(safe_restore_val(as.list(state_data$metadata$timepointGroup1Map)))
          hasEmbeddedTimePoints(safe_restore_val(state_data$metadata$hasEmbeddedTimePoints, "No"))
          embeddedTimePointPrefixes(safe_restore_val(state_data$metadata$embeddedTimePointPrefixes))
          embeddedTimePointMap(safe_restore_val(as.list(state_data$metadata$embeddedTimePointMap)))
          
          if (!is.null(state_data$color_shape$origin_colors)) {
            rv$origin_colors <- as.list(state_data$color_shape$origin_colors)
          }
          if (!is.null(state_data$color_shape$species_colors)) {
            rv$species_colors <- as.list(state_data$color_shape$species_colors)
          }
          if (!is.null(state_data$longitudinal$saved_timecourses)) {
            saved_timecourses(restore_list_of_lists(state_data$longitudinal$saved_timecourses))
          }
          if (!is.null(state_data$longitudinal$saved_patient_groups)) {
            saved_patient_groups(restore_list_of_lists(state_data$longitudinal$saved_patient_groups))
          }
          if (!is.null(state_data$longitudinal$saved_designer_cases)) {
            saved_designer_cases(restore_list_of_lists(state_data$longitudinal$saved_designer_cases))
          }
          if (!is.null(state_data$longitudinal$saved_timepoint_order_prefs)) {
            saved_timepoint_order_prefs(state_data$longitudinal$saved_timepoint_order_prefs)
          }
          if (!is.null(state_data$longitudinal$saved_level_prefs)) {
            saved_level_prefs(as.list(state_data$longitudinal$saved_level_prefs))
          }
          if (!is.null(state_data$outliers$treatments)) {
            restored_outlier_treatments(as.list(state_data$outliers$treatments))
          }
          if (!is.null(state_data$outliers$bqcManualExclusions)) {
            restored_bqc_manual_exclusions(as.character(state_data$outliers$bqcManualExclusions))
          }
          
          metadata_restored(TRUE)
          rv$lipidomics_confirmed <- TRUE
          metadata_trigger(isolate(metadata_trigger()) + 1)
          import_status("Metadata restored. Hydrating UI inputs...")
        }, error = function(e) {
          is_restoring(FALSE)
          import_status(paste("Error during metadata restoration:", e$message))
        })
        
        # Stage 3: Inputs Hydration
        session$onFlushed(function() {
          tryCatch({
            global_session <- getDefaultReactiveDomain()
            inputs_to_restore <- state_data$inputs
            
            if (!is.null(state_data$analysisMode)) {
              updateRadioButtons(session, "analysisMode", selected = state_data$analysisMode)
            }
            
            for (id in names(inputs_to_restore)) {
              val <- inputs_to_restore[[id]]
              if (is.null(val)) next
              
              freezeReactiveValue(global_session$input, id)
              update_input_generic(global_session, id, val)
            }
            import_status("UI inputs hydrated. Running analysis...")
          }, error = function(e) {
            is_restoring(FALSE)
            import_status(paste("Error during input hydration:", e$message))
          })
          
          # Stage 4: Run Analysis & Finalize
          session$onFlushed(function() {
            tryCatch({
              analysis_is_fresh(TRUE)
              run_analysis_trigger_val(isolate(run_analysis_trigger_val()) + 1)
              restored_inputs(list())
              is_restoring(FALSE)
              just_restored(TRUE)
              session$onFlushed(function() {
                just_restored(FALSE)
              }, once = TRUE)
              import_status("Session successfully restored!")
              removeModal()
            }, error = function(e) {
              restored_inputs(list())
              is_restoring(FALSE)
              import_status(paste("Error during analysis execution:", e$message))
            })
          }, once = TRUE)
          
        }, once = TRUE)
      }
    })
    
    observeEvent(input$import_session_file, {
      req(input$import_session_file)
      import_status("Processing session import...")
      
      # 1. Unzip uploaded file
      zip_path <- input$import_session_file$datapath
      dest_dir <- normalizePath(file.path(getwd(), "data", "user_uploads"), winslash = "/", mustWork = FALSE)
      if (!dir.exists(dest_dir)) dir.create(dest_dir, recursive = TRUE)
      
      # Create unique extraction directory
      extract_dir <- normalizePath(file.path(dest_dir, paste0("import_", format(Sys.time(), "%Y%m%d_%H%M%S"))), winslash = "/", mustWork = FALSE)
      dir.create(extract_dir)
      
      extraction_success <- tryCatch({
        zip::unzip(zip_path, exdir = extract_dir)
        TRUE
      }, error = function(e) {
        import_status(paste("Error: Failed to unzip file.", e$message))
        FALSE
      })
      
      if (!extraction_success) return()
      
      state_json_path <- file.path(extract_dir, "state.json")
      if (!file.exists(state_json_path)) {
        import_status("Error: state.json not found in session archive.")
        return()
      }
      
      # 2. Parse state.json
      state_data <- tryCatch({
        jsonlite::read_json(state_json_path, simplifyVector = TRUE)
      }, error = function(e) {
        import_status(paste("Error: Failed to parse state.json.", e$message))
        NULL
      })
      
      if (is.null(state_data)) return()
      
      # Map legacy deMethod values to standard limma for backward compatibility
      if (!is.null(state_data$inputs)) {
        for (k in names(state_data$inputs)) {
          if (grepl("deMethod$", k) && state_data$inputs[[k]] %in% c("gls", "spline_dream", "diff_var")) {
            state_data$inputs[[k]] <- "limma"
          }
        }
      }
      
      # 3. Start sequential hydration
      is_restoring(TRUE)
      restored_inputs(state_data$inputs)
      import_status("Restoring data files...")
      
      # Stage 1: Files restoration
      tryCatch({
        new_uploads <- list()
        uploads <- state_data$uploads
        if (length(uploads) > 0) {
          for (name in names(uploads)) {
            rel_path <- uploads[[name]]
            full_extracted_path <- file.path(extract_dir, rel_path)
            fallback_extracted_path <- file.path(extract_dir, basename(rel_path))
            
            target_path <- NULL
            if (file.exists(full_extracted_path)) {
              target_path <- full_extracted_path
            } else if (file.exists(fallback_extracted_path)) {
              target_path <- fallback_extracted_path
            }
            
            if (!is.null(target_path)) {
              dest_path <- file.path(dest_dir, basename(target_path))
              file.copy(target_path, dest_path, overwrite = TRUE)
              new_uploads[[name]] <- dest_path
            }
          }
        }
        
        # Update uploads
        rv$uploads <- new_uploads
        
        # (Restoring transcriptomics upload removed)
        
        # If any files are missing, open the Interactive Missing File Modal and halt
        missing <- setdiff(names(uploads), names(new_uploads))
        if (length(missing) > 0) {
          missing_files_to_restore(missing)
          restoring_state_data(state_data)
          
          showModal(modalDialog(
            title = "Missing Dataset Required",
            size = "m",
            easyClose = FALSE,
            footer = NULL,
            div(
              class = "text-center py-2",
              tags$h4(class = "text-danger fw-bold mb-3", "Missing Raw Dataset"),
              tags$p("The session has been restored, but the following required dataset file was missing from the package:"),
              tags$p(tags$code(style = "font-size: 1.15rem;", paste(missing, collapse = ", "))),
              tags$p(class = "text-muted small my-3", "Please locate and upload this file from your computer to complete the session restoration:"),
              fileInput(
                session$ns("missing_file_uploader"),
                label = NULL,
                multiple = FALSE,
                buttonLabel = "Browse...",
                placeholder = "Select raw data file..."
              )
            )
          ))
          return() # Halt Stage 2, 3, 4 until upload completes
        }
        
        import_status("Files restored. Restoring metadata mappings...")
      }, error = function(e) {
        is_restoring(FALSE)
        import_status(paste("Error during file restoration:", e$message))
      })
      
      # Stage 2: Metadata Mappings
      session$onFlushed(function() {
        tryCatch({
          if (!is.null(state_data$metadata$parsedMetadataStructure)) {
            pms <- state_data$metadata$parsedMetadataStructure
            if (is.list(pms$parsed_df) && !is.data.frame(pms$parsed_df)) pms$parsed_df <- as.data.frame(pms$parsed_df)
            if (is.list(pms$mappings) && !is.data.frame(pms$mappings)) pms$mappings <- as.data.frame(pms$mappings)
            
            # Defensively ensure required parsed columns are present
            required_cols <- c("FullName", "Group1Term", "Group2Term", "ReplicateTerm", "PatientTerm", "TimePointTerm")
            for (col in required_cols) {
              if (!col %in% colnames(pms$parsed_df)) {
                pms$parsed_df[[col]] <- NA_character_
              }
            }
            parsedMetadataStructure(pms)
          }
          if (!is.null(state_data$metadata$editableMetadata)) {
            em <- state_data$metadata$editableMetadata
            if (is.list(em) && !is.data.frame(em)) em <- as.data.frame(em)
            editableMetadata(em)
          }
          
          # Helper for safe restore
          safe_restore_val <- function(val, default = NULL) {
            if (is.null(val)) return(default)
            val
          }
          
          clusters(safe_restore_val(state_data$metadata$clusters, 1))
          uniqueCols(safe_restore_val(state_data$metadata$uniqueCols))
          autoDetectedFeatures(safe_restore_val(state_data$metadata$autoDetectedFeatures))
          schemaSelections(safe_restore_val(as.list(state_data$metadata$schemaSelections)))
          timepointGroup1Map(safe_restore_val(as.list(state_data$metadata$timepointGroup1Map)))
          hasEmbeddedTimePoints(safe_restore_val(state_data$metadata$hasEmbeddedTimePoints, "No"))
          embeddedTimePointPrefixes(safe_restore_val(state_data$metadata$embeddedTimePointPrefixes))
          embeddedTimePointMap(safe_restore_val(as.list(state_data$metadata$embeddedTimePointMap)))
          
          # Custom colors
          if (!is.null(state_data$color_shape$origin_colors)) {
            rv$origin_colors <- as.list(state_data$color_shape$origin_colors)
          }
          if (!is.null(state_data$color_shape$species_colors)) {
            rv$species_colors <- as.list(state_data$color_shape$species_colors)
          }
          
          # Restore longitudinal custom state
          if (!is.null(state_data$longitudinal$saved_timecourses)) {
            saved_timecourses(restore_list_of_lists(state_data$longitudinal$saved_timecourses))
          }
          if (!is.null(state_data$longitudinal$saved_patient_groups)) {
            saved_patient_groups(restore_list_of_lists(state_data$longitudinal$saved_patient_groups))
          }
          if (!is.null(state_data$longitudinal$saved_designer_cases)) {
            saved_designer_cases(restore_list_of_lists(state_data$longitudinal$saved_designer_cases))
          }
          if (!is.null(state_data$longitudinal$saved_timepoint_order_prefs)) {
            saved_timepoint_order_prefs(state_data$longitudinal$saved_timepoint_order_prefs)
          }
          if (!is.null(state_data$longitudinal$saved_level_prefs)) {
            saved_level_prefs(as.list(state_data$longitudinal$saved_level_prefs))
          }
          if (!is.null(state_data$outliers$treatments)) {
            restored_outlier_treatments(as.list(state_data$outliers$treatments))
          }
          if (!is.null(state_data$outliers$bqcManualExclusions)) {
            restored_bqc_manual_exclusions(as.character(state_data$outliers$bqcManualExclusions))
          }
          if (!is.null(state_data$multiomics_cohort_map)) {
            rv$multiomics_cohort_map <- as.list(state_data$multiomics_cohort_map)
          }
          
          metadata_restored(TRUE)
          rv$lipidomics_confirmed <- TRUE
          # Trigger metadata confirmation
          metadata_trigger(isolate(metadata_trigger()) + 1)
          import_status("Metadata restored. Hydrating UI inputs...")
        }, error = function(e) {
          is_restoring(FALSE)
          import_status(paste("Error during metadata restoration:", e$message))
        })
        
        # Stage 3: Inputs Hydration
        session$onFlushed(function() {
          tryCatch({
            global_session <- getDefaultReactiveDomain()
            inputs_to_restore <- state_data$inputs
            
            # Defensively ensure deReferenceGroups and deComparisonGroups are hydrated from moReferenceGroups / moComparisonGroups if missing
            ns_ref_id <- session$ns("deReferenceGroups")
            ns_comp_id <- session$ns("deComparisonGroups")
            ns_mo_ref_id <- session$ns("moReferenceGroups")
            ns_mo_comp_id <- session$ns("moComparisonGroups")
            
            ref_val <- inputs_to_restore[[ns_ref_id]] %||% inputs_to_restore[["deReferenceGroups"]] %||%
                       inputs_to_restore[[ns_mo_ref_id]] %||% inputs_to_restore[["moReferenceGroups"]]
            comp_val <- inputs_to_restore[[ns_comp_id]] %||% inputs_to_restore[["deComparisonGroups"]] %||%
                        inputs_to_restore[[ns_mo_comp_id]] %||% inputs_to_restore[["moComparisonGroups"]]
            
            if (!is.null(ref_val)) {
              inputs_to_restore[[ns_ref_id]] <- ref_val
              inputs_to_restore[["deReferenceGroups"]] <- ref_val
            }
            if (!is.null(comp_val)) {
              inputs_to_restore[[ns_comp_id]] <- comp_val
              inputs_to_restore[["deComparisonGroups"]] <- comp_val
            }
            
            # Map legacy significance threshold checkboxes in both directions for robustness
            for (id in names(inputs_to_restore)) {
              if (grepl("-noSigThreshold$", id)) {
                apply_id <- gsub("-noSigThreshold$", "-applySigThreshold", id)
                inputs_to_restore[[apply_id]] <- !isTRUE(inputs_to_restore[[id]])
              } else if (grepl("-applySigThreshold$", id)) {
                no_sig_id <- gsub("-applySigThreshold$", "-noSigThreshold", id)
                inputs_to_restore[[no_sig_id]] <- !isTRUE(inputs_to_restore[[id]])
              }
            }
            
            # Map legacy gridLabelSize to gridStarsSize and gridPvalSize if not present
            for (id in names(inputs_to_restore)) {
              if (grepl("-gridLabelSize$", id)) {
                prefix <- gsub("gridLabelSize$", "", id)
                stars_id <- paste0(prefix, "gridStarsSize")
                pval_id <- paste0(prefix, "gridPvalSize")
                
                # If they are not already in the inputs list, compute them from the legacy value
                if (is.null(inputs_to_restore[[stars_id]])) {
                  inputs_to_restore[[stars_id]] <- as.numeric(inputs_to_restore[[id]]) * 2
                }
                if (is.null(inputs_to_restore[[pval_id]])) {
                  inputs_to_restore[[pval_id]] <- as.numeric(inputs_to_restore[[id]])
                }
              }
            }
            
            # First, restore analysisMode
            if (!is.null(state_data$analysisMode)) {
              updateRadioButtons(session, "analysisMode", selected = state_data$analysisMode)
            }
            
            for (id in names(inputs_to_restore)) {
              val <- inputs_to_restore[[id]]
              if (is.null(val)) next
              
              freezeReactiveValue(global_session$input, id)
              update_input_generic(global_session, id, val)
            }
            import_status("UI inputs hydrated. Running analysis...")
          }, error = function(e) {
            is_restoring(FALSE)
            import_status(paste("Error during input hydration:", e$message))
          })
          
          # Stage 4: Run Analysis & Finalize
          session$onFlushed(function() {
            tryCatch({
              analysis_is_fresh(TRUE)
              run_analysis_trigger_val(isolate(run_analysis_trigger_val()) + 1)
              restored_inputs(list())
              is_restoring(FALSE)
              just_restored(TRUE)
              session$onFlushed(function() {
                just_restored(FALSE)
              }, once = TRUE)
              import_status("Session successfully restored!")
              removeModal()
            }, error = function(e) {
              restored_inputs(list())
              is_restoring(FALSE)
              import_status(paste("Error during analysis execution:", e$message))
            })
          }, once = TRUE)
          
        }, once = TRUE)
        
      }, once = TRUE)
    })
    
    observe({
      meta <- allParsedMetadata()
      if (is.null(meta)) return()
      
      cohorts <- if ("Group2" %in% names(meta)) {
        unique(meta$Group2)
      } else if ("Group1" %in% names(meta)) {
        unique(meta$Group1)
      } else if ("Cluster" %in% names(meta)) {
        unique(meta$Cluster)
      } else {
        "All"
      }
      
      curr <- input$corrCohort
      sel <- if (!is.null(curr) && curr %in% cohorts) curr else cohorts[1]
      
      updateSelectInput(session, "corrCohort", choices = cohorts, selected = sel)
    })
    
    return(
      list(
        rawData = rawData, data_processed = data_processed, pca_results = pca_results,
        data_processed_unfiltered = data_processed_full,
        targeted_mode_active = targeted_mode_active,
        targeted_lipids_list = targeted_lipids_list,
        pca_fallback_active = pca_fallback_active,
        set_targeted_mode = function(val) { targeted_mode_active(as.logical(val)) },
        set_targeted_lipids = function(vec) { targeted_lipids_list(as.character(vec)) },
        audit_trace = reactive({ audit_trace_data() }),
        selected_cols = reactive({ input$selectedColumns }), all_metadata = allParsedMetadata,
        annotationData = annotationData,
        multiomics_cohort_map = reactive({ rv$multiomics_cohort_map }),
        run_analysis_trigger = reactive({ run_analysis_trigger_val() }),
        aesthetics = reactive({
          list(
            color_group = get_setting("colorGrouping", "Group1"), 
            shape_group = get_setting("shapeGrouping", "Group2"),
            use_shapes = get_setting("useShapes", FALSE), 
            label_parts = get_setting("labelParts", "Group1"),
            use_custom_colors = get_setting("useCustomColors", FALSE), 
            use_custom_class_colors = get_setting("useCustomColorsClasses", FALSE),
            add_frame_2d = get_setting("addFrame2D", FALSE), 
            score_marker_size_2d = get_setting("scoreMarkerSize2D", 8),
            score_text_size_2d = get_setting("scoreTextSize2D", 4), 
            score_marker_size_3d = get_setting("scoreMarkerSize3D", 8),
            load_marker_size_2d = get_setting("loadMarkerSize2D", 8), 
            load_text_size_2d = get_setting("loadTextSize2D", 4),
            load_marker_size_3d = get_setting("loadMarkerSize3D", 14), 
            show_labels_3d = get_setting("showLabels3D", TRUE),
            smart_label_pca_2d = get_setting("smartLabelPCA2D", TRUE), 
            repel_force_pca_2d = get_setting("repelForcePCA2D", 30),
            repel_box_pad_pca_2d = get_setting("repelBoxPadPCA2D", 0.35), 
            repel_point_pad_pca_2d = get_setting("repelPointPadPCA2D", 0.35),
            smart_label_load_2d = get_setting("smartLabelLoad2D", TRUE), 
            repel_force_load_2d = get_setting("repelForceLoad2D", 20),
            repel_box_pad_load_2d = get_setting("repelBoxPadLoad2D", 0.35), 
            repel_point_pad_load_2d = get_setting("repelPointPadLoad2D", 0.35)
          )
        }),
        color_maps = masterColorMaps, shape_maps = masterShapeMaps,
        dynamic_class_colors = dynamic_class_colors,
    # Export Filters and DE
        global_filtered_lipids = global_filtered_lipids,
        global_filtered_lipids_all = global_filtered_lipids_all,
        de_results = allLipidDEResults,
        significant_lipids = significantLipids,
        analysisMode = reactive({ "Global Lipidomics" }),
        de_contrast_info = reactive({ 
            ref_g <- input$deReferenceGroups
            comp_g <- input$deComparisonGroups
            if (is.null(ref_g) || length(ref_g) == 0 ||
                is.null(comp_g) || length(comp_g) == 0) {
              choices <- getDEGroupChoices()
              if (length(choices) >= 2) {
                ref_g <- if (is.null(ref_g) || length(ref_g) == 0) choices[1] else ref_g
                comp_g <- if (is.null(comp_g) || length(comp_g) == 0) choices[2] else comp_g
              } else {
                return(NULL)
              }
            }
            list(ref=ref_g, comp=comp_g, str=construct_contrast_string(ref_g, comp_g)) 
        }),
        de_settings = reactive({
          list(
            method = input$deMethod %||% "limma",
            spline_df = NULL,
            p_value_type = input$pValueType %||% "adjusted",
            p_threshold = input$pFilterThreshold %||% 0.05,
            log2fc_threshold = input$log2fcThreshold %||% 1,
            orient_group1 = if (is.null(input$deOrientGroup1)) TRUE else isTRUE(input$deOrientGroup1),
            orient_group2 = isTRUE(input$deOrientGroup2),
            orient_timepoint = isTRUE(input$deOrientTimePoint),
            mode = input$deComparisonMode %||% "direct"
          )
        }),
        de_group_choices = getDEGroupChoices,
        de_ref_selected = reactive({ input$deReferenceGroups }),
        de_comp_selected = reactive({ input$deComparisonGroups }),
        de_comparison_mode = reactive({ input$deComparisonMode %||% "direct" }),
        grouped_metadata = reactive({
          meta <- allParsedMetadata()
          if (is.null(meta) || nrow(meta) == 0) return(NULL)
          # Reconstruct the dynamic grouping logic locally to export it
          parts <- list()
          orient_g1 <- if (is.null(input$deOrientGroup1)) TRUE else isTRUE(input$deOrientGroup1)
          orient_g2 <- if (is.null(input$deOrientGroup2)) FALSE else isTRUE(input$deOrientGroup2)
          orient_tp <- if (is.null(input$deOrientTimePoint)) FALSE else isTRUE(input$deOrientTimePoint)
          
          if (orient_g1 && "Group1" %in% names(meta)) parts$Group1 <- meta$Group1
          if (orient_g2 && "Group2" %in% names(meta)) parts$Group2 <- meta$Group2
          if (orient_tp && "TimePoint" %in% names(meta)) {
            tps <- meta$TimePoint
            if (any(!is.na(tps) & tps != "" & tps != "Unspecified")) {
              parts$TimePoint <- tps
            }
          }
          if (length(parts) == 0 && "Group1" %in% names(meta) && length(unique(meta$Group1)) >= 2) {
            parts$Group1 <- meta$Group1
          }
          meta$Dynamic_DE_Group <- if (length(parts) == 0) {
            "All"
          } else {
            do.call(paste, c(parts, list(sep = "_")))
          }
          meta
        }),
        baseLipidAnnotation = baseLipidAnnotation,
        class_color_map = map_lipid_class,   # Export Class Map
        origin_color_map = map_bio_origin,   # Export Origin Map
        species_color_map = map_single_species, # Export Species Map
        is_restoring = is_restoring,
        saved_timecourses = saved_timecourses,
        saved_patient_groups = saved_patient_groups,
        saved_designer_cases = saved_designer_cases,
        saved_timepoint_order_prefs = saved_timepoint_order_prefs,
        saved_level_prefs = saved_level_prefs,
        restored_inputs = restored_inputs,
        get_restored_input = get_restored_input,
        restored_outlier_treatments = restored_outlier_treatments,
        restored_bqc_manual_exclusions = restored_bqc_manual_exclusions,
        all_numeric_columns = all_numeric_columns,
        actual_de_method = reactive({ actual_method_val() }),
        de_fit = allLipidDEFit,
        stats_detail_text = stats_detail_text,
        stats_detail_type = stats_detail_type,
        stats_detail_html = stats_detail_html,
        selected_violin_lipids = selected_violin_lipids,
        gene_de_results = gene_de_results,
        gene_expression_matrix = gene_expression_matrix,
        add_transcriptomic_data = reactive({ isTRUE(input$addTranscriptomicData) }),
        appModeToggle = reactive({ input$appModeToggle }),
        corr_scope = reactive({ input$corrScope %||% "all" }),
        corr_cohort = reactive({ input$corrCohort %||% "All" })
      )
    )
  })
}
