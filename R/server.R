# R/server.R
# Main Server Logic.

server <- function(input, output, session) {
  
  # =========================================================================
  # REAL-TIME RSTUDIO CONSOLE INTERACTION & CLICK TRACER
  # Receives all UI button clicks, file inputs, tabs, and JS events from browser
  # and outputs high-visibility formatted traces directly to the RStudio console.
  # =========================================================================
  observeEvent(input$client_ui_trace, {
    evt <- input$client_ui_trace
    req(evt, evt$type)
    ts <- format(Sys.time(), "%H:%M:%S")
    
    if (evt$type == "CLICK") {
      p <- evt$payload
      target_info <- if (!is.null(p$dock_target) && nzchar(p$dock_target)) sprintf(" | Target: '%s'", p$dock_target) else ""
      cat(sprintf("\n[RSTUDIO CLICK %s] Button: '%s' | ID: '%s' | Tag: <%s>%s\n",
                  ts, p$label, p$id, p$tag, target_info))
      flush.console()
    } else if (evt$type == "FILE_SELECTED") {
      p <- evt$payload
      cat(sprintf("\n[RSTUDIO FILE PICKER %s] %d file(s) selected by user in file dialog:\n", ts, p$count))
      if (!is.null(p$files) && length(p$files) > 0) {
        for (f in p$files) {
          cat(sprintf("   >> File: '%s' | Size: %s | Type: '%s'\n", f$name, f$size_mb, f$type))
        }
      }
      cat("   >> Status: Browser is uploading file bytes to Shiny server...\n")
      flush.console()
    } else if (evt$type == "FILE_UPLOAD_COMPLETE") {
      p <- evt$payload
      cat(sprintf("\n[RSTUDIO UPLOAD %s] Browser finished uploading bytes for input '%s'.\n", ts, p$input_id))
      flush.console()
    } else if (evt$type == "STATUS") {
      cat(sprintf("\n[RSTUDIO SESSION %s] %s\n", ts, evt$payload$message))
      flush.console()
    } else if (evt$type == "JS_ERROR") {
      p <- evt$payload
      cat(sprintf("\n[RSTUDIO JS ERROR %s] %s (at %s:%s)\n", ts, p$message, p$filename, p$lineno))
      flush.console()
    }
  }, ignoreInit = TRUE)

 # --- REACTIVE BRIDGE ---
 # Bridge to resolve circular dependency between QC Module (UI/Settings)
 # and Shared Data Module (Logic/Data).
  qc_settings_bridge <- reactiveVal(NULL)
  # Reactive bridge for welcome modal demo dataset launcher
  welcome_load_demo_trigger <- reactiveVal(0)
  
  # The shared_data_server is called first, accepting the bridge.
  shared_data <- shared_data_server("data_hub", external_settings = qc_settings_bridge, welcome_load_demo_trigger = welcome_load_demo_trigger)

  # =========================================================================
  # Global Targeted Lipid Selection Hub
  # =========================================================================
  targeted_lipids_server("targeted_lipids_hub", shared_data = shared_data)
  
 # --- GLOBAL COLOR STATE ---
 # Use the master color maps from shared_data, which now incorporate custom overrides.
  global_color_map <- reactive({
    req(shared_data$color_maps())
    shared_data$color_maps()
  })

 # The qc_boxplot_server is called to activate the visualization module.
 # It returns the current settings from the UI.
  qc_module_return <- qc_boxplot_server("qc_pca_tab", shared_data, global_color_map)
  
 # Populate the bridge with settings from QC module
  observe({
    req(qc_module_return())
    qc_settings_bridge(qc_module_return())
  })
  
 # The heatmap_server is called to activate the heatmap module.
  heatmap_debug <- heatmap_server("heatmap_barchart_tab", shared_data)
  

  
  # Programmatic trigger to expand Differential Expression in the unified dock
  observeEvent(input$trigger_open_de_menu, {
    tryCatch({
      bslib::accordion_panel_close(id = "data_hub-cohorts_accordion", values = "Sample Selection", session = session)
      bslib::accordion_panel_open(id = "data_hub-cohorts_accordion", values = "Differential Expression", session = session)
    }, error = function(e) NULL)
  }, ignoreInit = TRUE)
  
  # Programmatic trigger to expand Differential Expression and switch p-value type to raw
  observeEvent(input$trigger_switch_to_raw_p, {
    tryCatch({
      bslib::accordion_panel_open(id = "data_hub-cohorts_accordion", values = "Differential Expression", session = session)
      updateRadioButtons(session, "data_hub-pValueType", selected = "raw")
    }, error = function(e) NULL)
  }, ignoreInit = TRUE)
  
  # Programmatic trigger to navigate to Outliers Detection tab under Quality Check
  observeEvent(input$trigger_go_to_outliers, {
    tryCatch({
      bslib::nav_select("main_navbar", selected = "Quality Check", session = session)
      bslib::nav_select("qc_pca_tab-main_tabs", selected = "Outliers Detection", session = session)
    }, error = function(e) NULL)
  }, ignoreInit = TRUE)
  
 # The barchart_server is called to activate the composition module.
  barchart_server("barchart", shared_data, global_color_map)
   
 # --- DIAGNOSTIC OBSERVER ---
 # This observer will run ONCE when the app starts and print the names
 # of all the reactives being returned by the shared_data module.
  observeEvent(TRUE, {
    cat("--- Reactives available from shared_data ---\n")
    print(names(shared_data))
    cat("------------------------------------------\n")
  }, once = TRUE)
 # --- END DIAGNOSTIC ---
  
  # Welcome Modal Helper
  showWelcomeModal <- function() {
    message("[SERVER] showWelcomeModal called!")
    tryCatch({
      showModal(modalDialog(
        title = tags$h4(style = "color: #4e79a7; font-weight: bold; margin-bottom: 0;", "Welcome to Global Lipidomic Explorer"),
        size = "l",
        navset_pill(
          nav_panel("1. Features & Capabilities",
            tags$div(
              style = "font-size: 0.95rem; line-height: 1.5; color: #333333; padding-top: 10px;",
              p("Welcome to the Global Lipidomic Explorer, a specialized interactive environment tailored for global lipidomic profiling. The platform automates structural parsing, cohort comparisons, and pathway visualization directly from raw abundance matrices."),
              tags$h6(style = "font-weight: bold; color: #4e79a7; margin-top: 15px; margin-bottom: 5px;", "Primary Modules & Analysis Views:"),
              tags$ul(
                style = "padding-left: 20px;",
                tags$li(strong("Data Ingestion & Annotation:"), " Dynamic parser with in-silico lipid chain structures identification."),
                tags$li(strong("Quality Check:"), " Distribution boxplots, PCA score & loadings, correlation matrices, and technical outlier treatment."),
                tags$li(strong("Precision Filtering:"), " Technical replicate BQC Coefficient of Variation (CoV) analysis to globally exclude imprecise species."),
                tags$li(strong("Differential Abundance:"), " Automated linear modeling (limma) or ranks-based tests (Wilcoxon) selection based on skewness."),
                tags$li(strong("Composition & Structural shifts:"), " Stacked barcharts, chain-length/unsaturation dotplots, and species violin distributions."),
                tags$li(strong("Carbon & Double Bond Grids:"), " Single-class and multi-class heatmaps mapped across structural coordinates."),
                tags$li(strong("Lipid Set Enrichment (LSEA):"), " Group-wise pathway-level set enrichment testing (NES and P-values)."),
                tags$li(strong("Metabolic Pathways:"), " Biosynthetic class biosynthesis networks overlaid with abundance and saturation shifts."),
                tags$li(strong("Cellular & Organelle stress:"), " Organelle saturation scores, peroxidation indexes, and macrophage polarization maps."),
                tags$li(strong("Longitudinal Trajectories:"), " Multi-timepoint trajectory trend profiling across patients or experimental cohorts."),
                tags$li(strong("Session Persistence:"), " Compress and export complete active session packages to share specific analyses with collaborators.")
              )
            )
          ),
          nav_panel("2. Quick Start User Guide",
            tags$div(
              style = "font-size: 0.95rem; line-height: 1.5; color: #333333; padding-top: 10px;",
              tags$h6(style = "font-weight: bold; color: #4e79a7; margin-bottom: 8px;", "Step-by-step workflow:"),
              tags$ol(
                style = "padding-left: 20px;",
                tags$li(strong("Upload Dataset:"), " Navigate to the 'Input & Run Analysis' sidebar. Upload your abundance matrix (.csv or .xlsx) and mapping key."),
                tags$li(strong("Select Metadata Mapping:"), " Map your group classifications, covariates, and conditions. Specify the comparison group vs baseline reference."),
                tags$li(strong("Run Pipeline:"), " Click 'Run Analysis'. The app will perform median normalizations, log2 conversions, and automated chain structure parsing."),
                tags$li(strong("Explore Dashboards:"), " Toggle through the top navigation tabs to inspect QC plots, volcanic signposts, LSEA enrichment, structural shift matrices, and organelle-specific stress indices."),
                tags$li(strong("Save & Share Sessions:"), " Click 'Export Session' in the sidebar to download a package containing your complete analysis state. Your collaborators can use 'Import Session' to instantly load your exact configurations, comparisons, and custom plots.")
              )
            )
          )
        ),
        easyClose = TRUE,
        footer = tags$div(
          class = "d-flex align-items-center justify-content-between w-100 flex-wrap gap-2 pt-1",
          # Strategic Action Buttons
          tags$div(
            class = "d-flex align-items-center gap-2 flex-wrap",
            actionButton(
              "welcome_btn_tour",
              label = tags$span(icon("compass", class = "me-1"), "Guided Onboarding"),
              class = "btn-primary fw-semibold px-3 shadow-sm",
              onclick = "window.startGuidedTour && window.startGuidedTour();"
            ),
            actionButton(
              "welcome_btn_upload",
              label = tags$span(icon("cloud-arrow-up", class = "me-1"), "Load New Dataset"),
              class = "btn-outline-primary px-3",
              onclick = "window.navigateToDataUpload && window.navigateToDataUpload(this);"
            ),
            actionButton(
              "welcome_btn_restore",
              label = tags$span(icon("box-archive", class = "me-1"), "Restore Saved Session (.zip)"),
              class = "btn-outline-secondary px-3",
              onclick = "window.navigateToSessionRestore && window.navigateToSessionRestore();"
            )
          ),
          # Sleek modern red close icon button in bottom right
          tags$button(
            type = "button",
            id = "welcome_btn_red_close",
            class = "btn welcome-modal-red-close ms-auto shadow-sm",
            "data-bs-dismiss" = "modal",
            "aria-label" = "Close",
            title = "Dismiss Welcome",
            onclick = "Shiny.setInputValue('welcome_modal_dismissed', Math.random());",
            icon("xmark", style = "font-size: 1.15rem; font-weight: bold;")
          )
        )
      ), session = session)
      message("[SERVER] showWelcomeModal succeeded!")
    }, error = function(e) {
      message("[SERVER] showWelcomeModal ERROR: ", e$message)
    })
  }

  # Show introductory welcome message on startup
  has_shown_welcome <- FALSE
  observe({
    if (!has_shown_welcome) {
      has_shown_welcome <<- TRUE
      showWelcomeModal()
    }
  })

  # Programmatic trigger to open welcome modal anytime
  observeEvent(input$trigger_show_welcome_modal, {
    showWelcomeModal()
  }, ignoreInit = FALSE)

  observeEvent(input$btn_reopen_welcome_guide, {
    showWelcomeModal()
  })

  # Server handlers for Welcome Modal Actions

  observeEvent(input$welcome_btn_tour, {
    removeModal()
    session$sendCustomMessage("startGuidedTour", list(step = 1))
  })

  observeEvent(input$welcome_btn_upload, {
    removeModal()
    session$sendCustomMessage("navigateToDataUpload", list())
  })

  observeEvent(input$welcome_btn_restore, {
    removeModal()
    session$sendCustomMessage("navigateToSessionRestore", list())
  })

  observeEvent(input$welcome_modal_dismissed, {
    removeModal()
  })
  
 # The volcano_server is called to activate the volcano module.
  volcano_server("volcano_tab", shared_data)
  
 # The lsea_server is called to activate the LSEA module.
  lsea_server("lsea_tab", shared_data)

  # The structural_server is called to activate the Structural module.
  structural_server("structural_tab", shared_data, global_color_map)
  
  # The structural_grid_server is called to activate the Structural Grid module.
  structural_grid_server("structural_grid_tab", shared_data)
   
  # The logratio_server is called to activate the LogRatio module.
  logratio_server("logratio_tab", shared_data, global_color_map)
  
 # The fla_server is called to activate the Functional Ratios module.
  fla_server("fla_tab", shared_data, global_color_map)
  
  # The pathway_server is called to activate the Lipid Pathways module.
  pathway_server("pathway_tab", shared_data)
  
  # The cellular_org_server is called to activate the Cellular Organization module.
  cellular_org_server("cellular_org_tab", shared_data, global_color_map)
  
   # The longitudinal_server is called to activate the Longitudinal Trajectories module.
  longitudinal_server("longitudinal_tab", shared_data)
  
  # The statistics_server is called to activate the Statistics Console.
   statistics_server("statistics_tab", shared_data)
   
  # The math_proof_server is called to activate the Mathematical Proof & Audit module.
   math_proof_server("math_proof_tab", shared_data)
   
  # The system_debug_server is called to activate the Debug module.
   system_debug_server("sys_debug_tab", shared_data)
   
  # --- REACTIVE DIAGNOSTIC ---
  observe({
    cat("\n[REACTIVE DIAGNOSTIC] Triggered:\n", file = stderr())
    
    df_proc <- tryCatch({
      shared_data$data_processed()
    }, error = function(e) {
      cat(sprintf("  - data_processed validation message: '%s'\n", e$message), file = stderr())
      NULL
    })
    cat(sprintf("  - data_processed is NULL: %s %s\n", is.null(df_proc), if(!is.null(df_proc)) sprintf("(dims: %dx%d)", nrow(df_proc), ncol(df_proc)) else ""), file = stderr())
    
    meta <- tryCatch({
      shared_data$grouped_metadata()
    }, error = function(e) {
      cat(sprintf("  - grouped_metadata error/validation: '%s'\n", e$message), file = stderr())
      NULL
    })
    cat(sprintf("  - grouped_metadata is NULL: %s %s\n", is.null(meta), if(!is.null(meta)) sprintf("(nrow: %d)", nrow(meta)) else ""), file = stderr())
  })


  # =========================================================================
  # PHASE 5: Publication Export Studio
  # =========================================================================
  export_studio_server("export_studio", shared_data = shared_data)

  cat("\n[MAIN SERVER] ALL MODULE SERVERS INITIALIZED!\n", file = stderr())
}

