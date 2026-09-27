# R/modules/11_longitudinal_module.R
# Longitudinal Patient Trajectories Analysis Module

# --- Module UI ---

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

# --- Module Server ---

longitudinal_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    
    # -------------------------------------------------------------------------
    # 0. Advanced Aesthetics & Ordering Setup
    # -------------------------------------------------------------------------
    # Centralized states linked to shared_data
    timepoint_order_prefs <- shared_data$saved_timepoint_order_prefs
    designer_cases <- shared_data$saved_designer_cases
    
    resolve_longitudinal_cohort <- function(df) {
      if ("Cohort" %in% names(df)) {
        return(df$Cohort)
      }
      if ("TimePoint" %in% names(df)) {
        if ("Group1" %in% names(df) && "Group2" %in% names(df)) {
          return(paste0(df$Group1, "_", df$Group2, "_", df$TimePoint))
        } else if ("Group1" %in% names(df)) {
          return(paste0(df$Group1, "_", df$TimePoint))
        } else {
          return(df$TimePoint)
        }
      } else {
        if ("Group1" %in% names(df) && "Group2" %in% names(df)) {
          return(paste0(df$Group1, "_", df$Group2))
        } else if ("Group1" %in% names(df)) {
          return(df$Group1)
        } else {
          return(rep("Cohort", nrow(df)))
        }
      }
    }
    
    available_cohorts <- reactive({
      meta <- shared_data$all_metadata()
      req(meta)
      unique(resolve_longitudinal_cohort(meta))
    })
    
    saved_timecourses <- shared_data$saved_timecourses
    current_builder_sequence <- reactiveVal(character())
    
    # Initialize defaults or reset saved_timecourses on new dataset or cohort map change
    observe({
      if (isolate(shared_data$is_restoring())) return()
      ch <- cohorts_map()
      req(ch$ss1, ch$ss2)
      cohorts <- available_cohorts()
      req(cohorts)
      
      if (length(saved_timecourses()) == 0) {
        defaults <- list()
        if (ch$ss1 %in% cohorts && ch$ss2 %in% cohorts) {
          defaults[[length(defaults) + 1]] <- list(
            id = paste0("tc_", sample(100000:999999, 1)),
            cohorts = c(ch$ss1, ch$ss2)
          )
        }
        if (ch$pc1 %in% cohorts && ch$pc2 %in% cohorts) {
          defaults[[length(defaults) + 1]] <- list(
            id = paste0("tc_", sample(100000:999999, 1)),
            cohorts = c(ch$pc1, ch$pc2)
          )
        }
        saved_timecourses(defaults)
      }
    })
    
    # Prune saved timecourses if a new dataset lacks their cohorts
    observe({
      if (isolate(shared_data$is_restoring())) return()
      cohorts <- available_cohorts()
      req(cohorts)
      
      current_tc <- saved_timecourses()
      valid_tc <- list()
      for (tc in current_tc) {
        if (all(tc$cohorts %in% cohorts) && length(tc$cohorts) >= 2) {
          valid_tc[[length(valid_tc) + 1]] <- tc
        }
      }
      
      if (length(valid_tc) != length(current_tc)) {
        ch <- cohorts_map()
        defaults <- list()
        if (ch$ss1 %in% cohorts && ch$ss2 %in% cohorts) {
          defaults[[length(defaults) + 1]] <- list(
            id = paste0("tc_", sample(100000:999999, 1)),
            cohorts = c(ch$ss1, ch$ss2)
          )
        }
        if (ch$pc1 %in% cohorts && ch$pc2 %in% cohorts) {
          defaults[[length(defaults) + 1]] <- list(
            id = paste0("tc_", sample(100000:999999, 1)),
            cohorts = c(ch$pc1, ch$pc2)
          )
        }
        if (length(defaults) > 0) {
          saved_timecourses(defaults)
        } else {
          saved_timecourses(list())
        }
      }
    })
    
    # Populate designer Group and Timepoint dropdowns
    observe({
      if (isolate(shared_data$is_restoring())) return()
      meta <- shared_data$all_metadata()
      req(meta)
      
      groups <- if ("Group2" %in% names(meta)) {
        sort(unique(as.character(meta$Group2)))
      } else {
        "All"
      }
      updateSelectInput(session, "custom_builder_group", choices = groups)
      
      timepoints <- if ("Group1" %in% names(meta)) {
        sort(unique(as.character(meta$Group1)))
      } else if ("TimePoint" %in% names(meta)) {
        sort(unique(as.character(meta$TimePoint)))
      } else {
        sort(unique(as.character(available_cohorts())))
      }
      updateSelectInput(session, "custom_builder_timepoint", choices = timepoints)
    })
    
    # Resolve selected Group + Timepoint to a matching cohort
    matched_cohort_reactive <- reactive({
      grp <- input$custom_builder_group
      tp <- input$custom_builder_timepoint
      cohorts <- available_cohorts()
      req(tp, cohorts)
      
      match1 <- if (is.null(grp) || grp == "All") tp else paste0(tp, "_", grp)
      match2 <- if (is.null(grp) || grp == "All") tp else paste0(grp, "_", tp)
      
      res <- intersect(cohorts, c(match1, match2, tp))
      if (length(res) > 0) return(res[1])
      return(NULL)
    })
    
    # Add point button event
    observeEvent(input$btn_add_point, {
      cohort <- matched_cohort_reactive()
      if (is.null(cohort)) {
        showNotification("No matching Cohort found in metadata for selected Group and Timepoint", type = "error")
        return()
      }
      
      current <- current_builder_sequence()
      if (cohort %in% current) {
        showNotification(paste("Cohort", cohort, "is already in the sequence."), type = "warning")
        return()
      }
      
      current_builder_sequence(c(current, cohort))
    })
    
    # Clear button event
    observeEvent(input$btn_clear_seq, {
      current_builder_sequence(character())
    })
    
    # Save Timecourse button event
    observeEvent(input$btn_save_timecourse, {
      seq <- current_builder_sequence()
      if (length(seq) < 2) {
        showNotification("A timecourse sequence must have at least 2 points.", type = "error")
        return()
      }
      
      tcs <- saved_timecourses()
      duplicate <- any(sapply(tcs, function(tc) identical(tc$cohorts, seq)))
      if (duplicate) {
        showNotification("This exact timecourse is already in your designed comparisons.", type = "warning")
        return()
      }
      
      new_tc <- list(
        id = paste0("tc_", sample(100000:999999, 1)),
        cohorts = seq
      )
      saved_timecourses(c(tcs, list(new_tc)))
      current_builder_sequence(character())
      showNotification("Timecourse added to designed comparisons!", type = "message")
    })
    
    # Delete timecourses event
    observe({
      tcs <- saved_timecourses()
      req(length(tcs) > 0)
      
      for (tc in tcs) {
        local({
          tc_id <- tc$id
          btn_name <- paste0("del_", tc_id)
          observeEvent(input[[btn_name]], {
            current <- saved_timecourses()
            ids <- sapply(current, function(x) x$id)
            idx <- which(ids == tc_id)
            if (length(idx) > 0) {
              current[[idx]] <- NULL
              saved_timecourses(current)
            }
          }, once = TRUE, ignoreInit = TRUE)
        })
      }
    })
    
    # Display the current sequence being built
    output$current_sequence_display <- renderUI({
      seq <- current_builder_sequence()
      if (length(seq) == 0) {
        return(p(class="text-muted small italic", style="margin-top:5px; font-style:italic;", "Sequence is empty. Add points above."))
      }
      
      clean_labels <- gsub("_Exp", "", seq)
      div(
        style = "margin-top: 5px; padding: 5px; border-radius: 4px; background: #e9ecef; border: 1px solid #ced4da;",
        tags$strong("Current: "),
        paste(clean_labels, collapse = " -> ")
      )
    })
    
    # Display the list of saved timecourses
    output$saved_timecourses_list_ui <- renderUI({
      tcs <- saved_timecourses()
      if (length(tcs) == 0) {
        return(NULL)
      }
      
      ns <- session$ns
      lapply(seq_along(tcs), function(i) {
        tc <- tcs[[i]]
        clean_labels <- gsub("_Exp", "", tc$cohorts)
        
        div(
          class = "d-flex align-items-center justify-content-between mb-1 p-1 border-bottom",
          div(
            style = "font-size: 11px; overflow-wrap: break-word; max-width: 80%;",
            tags$strong(paste0("TC ", i, ": ")),
            paste(clean_labels, collapse = " -> ")
          ),
          actionButton(ns(paste0("del_", tc$id)), "", icon = icon("trash"), class = "btn-outline-danger btn-sm p-1", style = "font-size: 10px; line-height: 1;")
        )
      })
    })
    
    active_cohorts <- reactive({
      cases <- designer_cases()
      if (length(cases) > 0) {
        return(unique(unlist(lapply(cases, function(x) x$items))))
      }
      available_cohort_items()
    })
    
    ordered_timepoints <- reactive({
      ord <- input$ordered_timepoints_list
      ac <- active_cohorts()
      if (length(ord) > 0 && all(ord %in% ac) && length(ord) == length(ac)) return(ord)
      ac
    })
    
    output$timepoint_order_ui <- renderUI({
      sel <- active_cohorts()
      req(length(sel) > 0)
      
      pref <- isolate(timepoint_order_prefs())
      if (!is.null(pref)) {
        ordered_sel <- c(intersect(pref, sel), setdiff(sel, pref))
      } else {
        ordered_sel <- sel
      }
      
      sortable::rank_list(
        text = NULL,
        labels = ordered_sel,
        input_id = session$ns("ordered_timepoints_list")
      )
    })
    
    observeEvent(input$ordered_timepoints_list, {
      timepoint_order_prefs(input$ordered_timepoints_list)
    })
    
    observe({
      if (isolate(shared_data$is_restoring())) return()
      meta <- shared_data$all_metadata()
      req(meta)
      cols <- setdiff(colnames(meta), c("FullName", "Sample_ID", "DisplayLabel"))
      updateSelectInput(session, "order_target_var", choices = cols, selected = "Cohort")
    })
    
    output$level_order_ui <- renderUI({
       target <- input$order_target_var
       req(target)
       meta <- shared_data$all_metadata()
       if(!(target %in% colnames(meta))) return(NULL)
       
       default_levels <- sort(unique(meta[[target]]))
       pref <- isolate(shared_data$saved_level_prefs()[[target]])
       if(!is.null(pref)) {
           if(all(default_levels %in% pref)) {
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
       current_prefs <- shared_data$saved_level_prefs()
       current_prefs[[input$order_target_var]] <- input$manual_level_order
       shared_data$saved_level_prefs(current_prefs)
    })
    
    custom_cohort_colors <- reactive({
      sel <- active_cohorts()
      req(length(sel) > 0)
      
      base_colors <- c("#9ECAE1", "#3182BD", "#FB6A4A", "#CB181D", "#A6D854", "#FFD92F", "#E78AC3", "#B3B3B3")
      if (length(sel) > length(base_colors)) {
        base_colors <- colorRampPalette(base_colors)(length(sel))
      }
      
      cols <- sapply(seq_along(sel), function(i) {
        lvl <- sel[i]
        safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
        val <- input[[paste0("cp_cohort_", safe_lvl)]]
        if (is.null(val)) base_colors[i] else val
      })
      names(cols) <- sel
      cols
    })
    
    custom_direction_colors <- reactive({
      dirs <- c("Up", "Down", "No Change")
      default_cols <- c("Up" = "#FC4E2A", "Down" = "#1D91C0", "No Change" = "#969696")
      
      cols <- sapply(dirs, function(lvl) {
        safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
        val <- input[[paste0("cp_dir_", safe_lvl)]]
        if (is.null(val)) default_cols[lvl] else val
      })
      names(cols) <- dirs
      cols
    })
    
    output$cohort_colors_ui <- renderUI({
      sel <- active_cohorts()
      req(length(sel) > 0)
      
      base_colors <- c("#9ECAE1", "#3182BD", "#FB6A4A", "#CB181D", "#A6D854", "#FFD92F", "#E78AC3", "#B3B3B3")
      if (length(sel) > length(base_colors)) {
        base_colors <- colorRampPalette(base_colors)(length(sel))
      }
      
      ns <- session$ns
      lapply(seq_along(sel), function(i) {
        lvl <- sel[i]
        safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
        id <- paste0("cp_cohort_", safe_lvl)
        
        cur_val <- input[[id]]
        saved_val <- shared_data$get_restored_input(ns(id), base_colors[i])
        def_val <- if (!is.null(cur_val)) cur_val else saved_val
        
        div(style="display:inline-block; margin-right:5px; margin-bottom: 5px;",
            colourpicker::colourInput(ns(id), lvl, value = def_val, showColour="both", width="100px")
        )
      }) %>% div(class="d-flex flex-wrap", .)
    })
    
    output$direction_colors_ui <- renderUI({
      dirs <- c("Up", "Down", "No Change")
      default_cols <- c("Up" = "#FC4E2A", "Down" = "#1D91C0", "No Change" = "#969696")
      
      ns <- session$ns
      lapply(dirs, function(lvl) {
        safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
        id <- paste0("cp_dir_", safe_lvl)
        
        cur_val <- input[[id]]
        saved_val <- shared_data$get_restored_input(ns(id), default_cols[lvl])
        def_val <- if (!is.null(cur_val)) cur_val else saved_val
        
        div(style="display:inline-block; margin-right:5px; margin-bottom: 5px;",
            colourpicker::colourInput(ns(id), lvl, value = def_val, showColour="both", width="100px")
        )
      }) %>% div(class="d-flex flex-wrap", .)
    })
    
    # -------------------------------------------------------------------------
    # 1. Parsing Cohort & Patient inputs
    # -------------------------------------------------------------------------
    cohort_mapping_table <- reactive({
      meta <- shared_data$all_metadata()
      req(meta)
      
      meta_resolved <- meta
      meta_resolved$Cohort <- resolve_longitudinal_cohort(meta)
      
      grp_var <- input$longitudinal_group_var
      tp_var <- input$longitudinal_timepoint_var
      
      req(tp_var)
      
      if (is.null(grp_var) || grp_var == "None" || !grp_var %in% names(meta_resolved)) {
        meta_resolved %>%
          dplyr::select(TimePointVal = dplyr::all_of(tp_var), Cohort) %>%
          dplyr::distinct() %>%
          dplyr::mutate(GroupVal = "None")
      } else {
        meta_resolved %>%
          dplyr::select(GroupVal = dplyr::all_of(grp_var), TimePointVal = dplyr::all_of(tp_var), Cohort) %>%
          dplyr::distinct()
      }
    })
    
    # Keep cohorts_map reactive just for compatibility if needed elsewhere
    cohorts_map <- reactive({
      list(ss1 = "SteadyState1_Exp", ss2 = "SteadyState2_Exp", pc1 = "PainCrisis1_Exp", pc2 = "PainCrisis2_Exp")
    })
    
    output$cohort_variable_selectors_ui <- renderUI({
      meta <- shared_data$all_metadata()
      req(meta)
      ns <- session$ns
      
      meta_cols <- names(meta)
      char_fac_cols <- meta_cols[sapply(meta, function(x) is.character(x) || is.factor(x))]
      char_fac_cols <- setdiff(char_fac_cols, c("Sample_ID", "FullName", "Patient_ID", "DisplayLabel"))
      
      default_grp <- if ("Group2" %in% char_fac_cols) "Group2" else "None"
      default_tp <- if ("TimePoint" %in% char_fac_cols) {
        "TimePoint"
      } else if ("Group1" %in% char_fac_cols) {
        "Group1"
      } else if (length(char_fac_cols) > 0) {
        char_fac_cols[1]
      } else {
        ""
      }
      
      saved_grp <- shared_data$get_restored_input("longitudinal_group_var", default_grp)
      saved_tp <- shared_data$get_restored_input("longitudinal_timepoint_var", default_tp)
      grp_choices <- get_metadata_group_named_choices(c("None", char_fac_cols), meta)
      tp_choices <- get_metadata_group_named_choices(char_fac_cols, meta)
      tagList(
        selectInput(ns("longitudinal_group_var"), "Grouping Variable:", 
                    choices = grp_choices, selected = saved_grp),
        selectInput(ns("longitudinal_timepoint_var"), "Timepoint Variable:", 
                    choices = tp_choices, selected = saved_tp)
      )
    })
    
    output$cohort_selectors_ui <- renderUI({
      mapping <- cohort_mapping_table()
      req(mapping)
      ns <- session$ns
      
      groups <- unique(mapping$GroupVal)
      sanitize_id <- function(x) gsub("[^a-zA-Z0-9_]", "_", x)
      
      lapply(groups, function(g) {
        tps <- mapping %>%
          dplyr::filter(GroupVal == g) %>%
          dplyr::pull(TimePointVal) %>%
          unique() %>%
          sort()
        
        header_text <- if (g == "None") "Select Timepoints to include in trajectory:" else paste("Group:", g)
        
        div(
          class = "mb-2 p-2 border rounded bg-white",
          div(
            class = "d-flex justify-content-between align-items-center mb-1",
            h6(style = "font-weight: bold; font-size: 10px; margin: 0; color: #495057;", header_text),
            div(
              style = "font-size: 9px;",
              actionLink(ns(paste0("btn_all_", sanitize_id(g))), "All", style = "margin-right: 4px; text-decoration: none; font-weight: bold;"),
              "|",
              actionLink(ns(paste0("btn_none_", sanitize_id(g))), "None", style = "margin-left: 4px; text-decoration: none; font-weight: bold;")
            )
          ),
          div(
            class = "d-flex flex-wrap",
            lapply(tps, function(tp) {
              raw_id <- paste0("chk_cohort_tp_", sanitize_id(g), "_", sanitize_id(tp))
              chk_id <- ns(raw_id)
              saved_val <- shared_data$get_restored_input(raw_id, TRUE)
              div(
                style = "margin-right: 15px;",
                checkboxInput(chk_id, as.character(tp), value = saved_val)
              )
            })
          )
        )
      })
    })
    
    # Observe dynamic "All" and "None" buttons for each group
    observe({
      mapping <- cohort_mapping_table()
      req(mapping)
      ns <- session$ns
      
      groups <- unique(mapping$GroupVal)
      sanitize_id <- function(x) gsub("[^a-zA-Z0-9_]", "_", x)
      
      for (g in groups) {
        local({
          grp <- g
          grp_id <- sanitize_id(grp)
          tps <- mapping %>%
            dplyr::filter(GroupVal == grp) %>%
            dplyr::pull(TimePointVal) %>%
            unique() %>%
            sort()
          
          observeEvent(input[[paste0("btn_all_", grp_id)]], {
            for (tp in tps) {
              chk_id <- paste0("chk_cohort_tp_", grp_id, "_", sanitize_id(tp))
              updateCheckboxInput(session, chk_id, value = TRUE)
            }
          }, ignoreInit = TRUE)
          
          observeEvent(input[[paste0("btn_none_", grp_id)]], {
            for (tp in tps) {
              chk_id <- paste0("chk_cohort_tp_", grp_id, "_", sanitize_id(tp))
              updateCheckboxInput(session, chk_id, value = FALSE)
            }
          }, ignoreInit = TRUE)
        })
      }
    })
    
    # designer_cases is shared and defined above
    
    # Helper to sync target cases with their checkbox and bucket inputs in the UI
    sync_cases_from_inputs <- function() {
      current_cases <- designer_cases()
      if (length(current_cases) == 0) return()
      
      updated_cases <- lapply(current_cases, function(c) {
        val <- input[[paste0("case_bucket_", c$id)]]
        if (!is.null(val)) {
          c$items <- val
        }
        c$connected <- TRUE
        c
      })
      designer_cases(updated_cases)
    }
    
    # Available cohorts based on checkboxes in Panel 2
    available_cohort_items <- reactive({
      mapping <- cohort_mapping_table()
      req(mapping)
      
      groups <- unique(mapping$GroupVal)
      sanitize_id <- function(x) gsub("[^a-zA-Z0-9_]", "_", x)
      
      checked_cohorts <- character()
      for (g in groups) {
        tps <- mapping %>%
          dplyr::filter(GroupVal == g) %>%
          dplyr::pull(TimePointVal) %>%
          unique() %>%
          sort()
        for (tp in tps) {
          chk_id <- paste0("chk_cohort_tp_", sanitize_id(g), "_", sanitize_id(tp))
          is_checked <- input[[chk_id]]
          if (is.null(is_checked)) is_checked <- TRUE
          
          if (is_checked) {
            cohort_names <- mapping %>%
              dplyr::filter(GroupVal == g & TimePointVal == tp) %>%
              dplyr::pull(Cohort) %>%
              unique()
            checked_cohorts <- c(checked_cohorts, cohort_names[!is.na(cohort_names)])
          }
        }
      }
      unique(checked_cohorts)
    })
    
    # Initialize designer cases on dataset or variables change
    observe({
      if (isolate(shared_data$is_restoring())) return()
      mapping <- cohort_mapping_table()
      req(mapping)
      
      tp_order <- timepoint_order_prefs()
      
      # Extract unique base cohort names (e.g. S_SCDC, S_SCD, C_SCD) by stripping trailing _TimePoint
      base_cohorts <- unique(sapply(seq_len(nrow(mapping)), function(i) {
        cohort <- mapping$Cohort[i]
        tp <- mapping$TimePointVal[i]
        sub(paste0("_", tp, "$"), "", cohort)
      }))
      
      defaults <- list()
      for (bc in base_cohorts) {
        # Filter mapping rows that correspond to this base cohort patient group
        bc_rows <- mapping[sapply(seq_len(nrow(mapping)), function(i) {
          sub(paste0("_", mapping$TimePointVal[i], "$"), "", mapping$Cohort[i]) == bc
        }), ]
        
        tps <- unique(bc_rows$TimePointVal)
        
        if (!is.null(tp_order)) {
          sorted_tps <- intersect(tp_order, tps)
          missing_tps <- setdiff(tps, tp_order)
          tps <- c(sorted_tps, missing_tps)
        } else {
          tps <- sort(tps)
        }
        
        cohort_items <- character()
        for (tp in tps) {
          cohort_name <- bc_rows %>%
            dplyr::filter(TimePointVal == tp) %>%
            dplyr::pull(Cohort) %>%
            .[1]
          if (!is.na(cohort_name)) {
            cohort_items <- c(cohort_items, cohort_name)
          }
        }
        
        if (length(cohort_items) >= 1) {
          defaults[[length(defaults) + 1]] <- list(
            id = paste0("case_", sample(100000:999999, 1)),
            name = paste(bc, "Timecourse"),
            items = cohort_items,
            connected = TRUE
          )
        }
      }
      
      # We only initialize if designer_cases is currently empty
      if (length(designer_cases()) == 0) {
        designer_cases(defaults)
      }
    })
    
    # Prune any items in designer_cases that are no longer in available_cohort_items()
    observe({
      if (isolate(shared_data$is_restoring())) return()
      cohorts <- available_cohort_items()
      current_cases <- designer_cases()
      req(current_cases)
      
      if (is.data.frame(current_cases)) {
        row_list <- split(current_cases, seq_len(nrow(current_cases)))
        current_cases <- lapply(row_list, as.list)
      }
      
      updated <- lapply(current_cases, function(c) {
        if (is.list(c)) {
          c$items <- intersect(c$items, cohorts)
        }
        c
      })
      
      # Only update if there was actually a change to prevent infinite loops!
      if (!identical(current_cases, updated)) {
        designer_cases(updated)
      }
    })
    
    # Add a new Timecourse Line
    observeEvent(input$btn_add_case, {
      sync_cases_from_inputs()
      current <- designer_cases()
      new_case <- list(
        id = paste0("case_", sample(100000:999999, 1)),
        name = paste("Timecourse", length(current) + 1),
        items = character(0),
        connected = TRUE
      )
      designer_cases(c(current, list(new_case)))
    })
    
    # Delete Trajectory Line observer
    observe({
      cases <- designer_cases()
      req(cases)
      
      if (is.data.frame(cases)) {
        row_list <- split(cases, seq_len(nrow(cases)))
        cases <- lapply(row_list, as.list)
      }
      
      for (c in cases) {
        if (!is.list(c) || is.null(c$id)) next
        local({
          case_id <- c$id
          btn_id <- paste0("btn_del_case_", case_id)
          observeEvent(input[[btn_id]], {
            sync_cases_from_inputs()
            current <- designer_cases()
            updated <- Filter(function(x) {
              if (is.list(x) && !is.null(x$id)) x$id != case_id else TRUE
            }, current)
            designer_cases(updated)
          }, ignoreInit = TRUE)
        })
      }
    })
    
    # Delete individual timecourse item observer
    observeEvent(input$delete_timecourse_item, {
      req(input$delete_timecourse_item)
      event <- input$delete_timecourse_item
      case_id <- event$case_id
      item_idx <- as.integer(event$item_idx)
      
      sync_cases_from_inputs()
      current <- designer_cases()
      req(current)
      
      updated <- lapply(current, function(c) {
        if (c$id == case_id) {
          if (length(c$items) >= item_idx) {
            c$items <- c$items[-item_idx]
          }
        }
        c
      })
      designer_cases(updated)
    })
    
    # Render the drag-and-drop designer UI
    output$trajectory_designer_ui <- renderUI({
      ns <- session$ns
      cohorts <- available_cohort_items()
      cases <- designer_cases()
      
      if (is.data.frame(cases)) {
        row_list <- split(cases, seq_len(nrow(cases)))
        cases <- lapply(row_list, as.list)
      }
      
      # 1. Available Cohorts source bucket
      source_bucket <- div(
        class = "mb-2 p-2 border rounded designer-bucket",
        style = "border-style: dashed !important; background-color: #f7fafc;",
        h6(style = "font-weight: bold; font-size: 10px; margin-bottom: 6px; color: #4a5568;", "Draggable Cohorts:"),
        sortable::rank_list(
          text = NULL,
          labels = cohorts,
          input_id = ns("source_cohorts_bucket"),
          options = sortable::sortable_options(
            group = list(
              name = "cohorts_group",
              pull = "clone",
              put = FALSE
            )
          )
        )
      )
      
      # 2. Render each Trajectory Case
      cases_buckets <- lapply(seq_along(cases), function(i) {
        c <- cases[[i]]
        
        # Build labels with a delete cross on each item
        bucket_labels <- setNames(lapply(seq_along(c$items), function(idx) {
          item_val <- c$items[idx]
          div(
            class = "d-flex justify-content-between align-items-center w-100",
            span(item_val),
            tags$span(
              class = "text-danger delete-item-cross",
              style = "cursor: pointer; font-weight: bold; margin-left: 8px; font-size: 11px; padding: 0 2px; line-height: 1;",
              onclick = sprintf("event.stopPropagation(); Shiny.setInputValue('%s', {case_id: '%s', item_idx: %d}, {priority: 'event'})", ns("delete_timecourse_item"), c$id, idx),
              "×"
            )
          )
        }), c$items)
        
        div(
          class = "card mb-0",
          style = "border: 1px solid #dee2e6; background-color: #ffffff;",
          div(
            class = "card-header d-flex justify-content-between align-items-center py-1 px-2",
            style = "background-color: #f8f9fa; border-bottom: 1px solid #dee2e6;",
            span(style = "font-weight: bold; font-size: 9px; color: #4a5568;", paste0("Timecourse ", i)),
            actionButton(ns(paste0("btn_del_case_", c$id)), "", icon = icon("times"), class = "btn-link text-danger p-0 border-0", style = "font-size: 10px; font-weight: bold; line-height: 1; text-decoration: none;")
          ),
          div(
            class = "card-body p-1",
            sortable::rank_list(
              text = NULL,
              labels = bucket_labels,
              input_id = ns(paste0("case_bucket_", c$id)),
              options = sortable::sortable_options(
                group = list(
                  name = "cohorts_group",
                  pull = TRUE,
                  put = TRUE
                )
              )
            )
          )
        )
      })
      
      # 3. Add Timecourse Button (Full Width)
      controls <- div(
        class = "mt-2",
        actionButton(ns("btn_add_case"), "Add Timecourse", class = "btn-outline-success btn-sm w-100 py-1", icon = icon("plus"), style = "font-size: 10px; font-weight: 500; padding: 3px 6px;")
      )
      
      tagList(
        source_bucket,
        div(
          style = "max-height: 250px; overflow-y: auto; padding-right: 5px; margin-bottom: 5px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;",
          cases_buckets
        ),
        controls
      )
    })
    
    longitudinal_design <- eventReactive(input$submit_longitudinal_btn, {
      meta <- shared_data$all_metadata()
      req(meta)
      
      # Sync current items before capturing the design
      sync_cases_from_inputs()
      
      list(
        group_var = input$longitudinal_group_var,
        timepoint_var = input$longitudinal_timepoint_var,
        designer_cases = designer_cases(),
        checked_groups = Filter(function(g) g$checked, saved_patient_groups()),
        comparison_mode = "custom" # Always treat as custom designer
      )
    }, ignoreInit = FALSE)
    
    # --- Dynamic Patient Groups State & UI ---
    saved_patient_groups <- shared_data$saved_patient_groups
    
    available_patients <- reactive({
      meta <- shared_data$all_metadata()
      req(meta)
      pts <- if ("PatientNumber" %in% names(meta)) {
        meta$PatientNumber
      } else if ("Patient_ID" %in% names(meta)) {
        meta$Patient_ID
      } else {
        NULL
      }
      req(pts)
      sort(unique(as.character(pts)))
    })
    
    all_patients_clean <- reactive({
      pts_raw <- available_patients()
      req(pts_raw)
      unique(gsub("^0*", "", gsub("^[Pp]0*", "", as.character(pts_raw))))
    })
    
    # Initialize choices for adding patients to custom groups
    observe({
      if (isolate(shared_data$is_restoring())) return()
      pts <- available_patients()
      updateSelectizeInput(session, "new_group_pts", choices = pts, server = TRUE)
    })
    
    # Initialize/reset or prune patient groups when metadata changes
    observeEvent(shared_data$all_metadata(), {
      if (isolate(shared_data$is_restoring())) return()
      meta <- shared_data$all_metadata()
      req(meta)
      
      avail_raw <- if ("PatientNumber" %in% names(meta)) {
        meta$PatientNumber
      } else if ("Patient_ID" %in% names(meta)) {
        meta$Patient_ID
      } else {
        NULL
      }
      req(avail_raw)
      avail_clean <- unique(gsub("^0*", "", gsub("^[Pp]0*", "", as.character(avail_raw))))
      
      current_pg <- saved_patient_groups()
      
      pruned_pg <- list()
      for (g in current_pg) {
        valid_pts <- intersect(g$pts, avail_clean)
        if (length(valid_pts) > 0) {
          g$pts <- valid_pts
          if (g$is_default) {
            pts_formatted <- sapply(valid_pts, function(p) {
              if (suppressWarnings(!is.na(as.integer(p)))) {
                paste0("P", sprintf("%03d", as.integer(p)))
              } else {
                paste0("P", p)
              }
            })
            g$name <- paste0("Group ", gsub("^group", "", g$id), " (", paste(pts_formatted, collapse = ", "), ")")
          }
          pruned_pg[[length(pruned_pg) + 1]] <- g
        }
      }
      saved_patient_groups(pruned_pg)
    })
    
    # Sync checkboxes dynamically back to saved_patient_groups
    observe({
      if (isolate(shared_data$is_restoring())) return()
      groups <- saved_patient_groups()
      req(length(groups) > 0)
      
      if (is.data.frame(groups)) {
        row_list <- split(groups, seq_len(nrow(groups)))
        groups <- lapply(row_list, as.list)
      }
      
      updated <- FALSE
      new_groups <- lapply(groups, function(g) {
        if (is.list(g) && !is.null(g$id)) {
          chk_val <- input[[paste0("chk_group_", g$id)]]
          if (!is.null(chk_val) && chk_val != g$checked) {
            g$checked <- chk_val
            updated <<- TRUE
          }
        }
        g
      })
      if (updated) {
        saved_patient_groups(new_groups)
      }
    })
    
    # Delete group action
    observe({
      groups <- saved_patient_groups()
      req(length(groups) > 0)
      
      if (is.data.frame(groups)) {
        row_list <- split(groups, seq_len(nrow(groups)))
        groups <- lapply(row_list, as.list)
      }
      
      for (g in groups) {
        if (!is.list(g) || is.null(g$id)) next
        local({
          g_id <- g$id
          btn_name <- paste0("del_group_", g_id)
          observeEvent(input[[btn_name]], {
            current <- saved_patient_groups()
            if (is.data.frame(current)) {
              row_list <- split(current, seq_len(nrow(current)))
              current <- lapply(row_list, as.list)
            }
            ids <- sapply(current, function(x) {
              if (is.list(x) && !is.null(x$id)) x$id else ""
            })
            idx <- which(ids == g_id)
            if (length(idx) > 0) {
              current[[idx]] <- NULL
              saved_patient_groups(current)
            }
          }, once = TRUE, ignoreInit = TRUE)
        })
      }
    })
    
    # Add custom patient group
    observeEvent(input$btn_add_patient_group, {
      name <- trimws(input$new_group_name)
      pts <- input$new_group_pts
      
      if (name == "") {
        showNotification("Please enter a group name.", type = "error")
        return()
      }
      if (length(pts) == 0) {
        showNotification("Please select at least one patient.", type = "error")
        return()
      }
      
      current <- saved_patient_groups()
      duplicate <- any(sapply(current, function(g) g$name == name))
      if (duplicate) {
        showNotification(paste("A group named", name, "already exists."), type = "warning")
        return()
      }
      
      clean_pts <- gsub("^[Pp]0*", "", pts)
      clean_pts <- gsub("^0*", "", clean_pts)
      
      new_id <- paste0("pg_", sample(100000:999999, 1))
      
      new_group <- list(
        id = new_id,
        name = name,
        pts = clean_pts,
        checked = TRUE,
        is_default = FALSE
      )
      
      saved_patient_groups(c(current, list(new_group)))
      
      updateTextInput(session, "new_group_name", value = "")
      updateSelectizeInput(session, "new_group_pts", selected = character(0))
      
      showNotification("Patient group added!", type = "message")
    })
    
    # Render checkboxes and delete buttons in Panel 3
    output$saved_patient_groups_list_ui <- renderUI({
      groups <- saved_patient_groups()
      if (length(groups) == 0) {
        return(p(class = "text-muted small italic", "No patient groups defined."))
      }
      
      if (is.data.frame(groups)) {
        row_list <- split(groups, seq_len(nrow(groups)))
        groups <- lapply(row_list, as.list)
      }
      
      ns <- session$ns
      lapply(groups, function(g) {
        if (!is.list(g) || is.null(g$id)) return(NULL)
        div(
          class = "d-flex align-items-center justify-content-between mb-1 p-1 border-bottom",
          div(
            class = "d-flex align-items-center",
            style = "max-width: 80%;",
            checkboxInput(ns(paste0("chk_group_", g$id)), g$name, value = g$checked)
          ),
          actionButton(ns(paste0("del_group_", g$id)), "", icon = icon("trash"), class = "btn-outline-danger btn-sm p-1", style = "font-size: 10px; line-height: 1;")
        )
      })
    })
    
    # Dynamically update the Patient Layout selector in Panel 1
    observe({
      if (isolate(shared_data$is_restoring())) return()
      groups <- saved_patient_groups()
      
      choices <- c("Selected Subgroups Grid" = "all")
      if (length(groups) > 0) {
        group_choices <- sapply(groups, function(g) g$id)
        group_names <- sapply(groups, function(g) g$name)
        choices <- c(choices, stats::setNames(group_choices, group_names))
      }
      
      current_sel <- input$patientLayout
      selected_val <- if (!is.null(current_sel) && current_sel %in% choices) current_sel else "all"
      
      updateSelectInput(session, "patientLayout", choices = choices, selected = selected_val)
    })
    
    # Helper to resolve patient list safely
    get_group_pts_safe <- function(grp_id) {
      groups <- saved_patient_groups()
      idx <- which(sapply(groups, function(g) g$id == grp_id))
      if (length(idx) > 0) {
        if (groups[[idx]]$checked) {
          return(groups[[idx]]$pts)
        }
      }
      return(character(0))
    }

    transitions_list <- reactive({
      design <- longitudinal_design()
      tcs <- design$designer_cases
      checked_groups <- design$checked_groups
      
      res <- list()
      if (length(tcs) == 0) return(res)
      
      if (length(checked_groups) == 0) {
        all_pts <- all_patients_clean()
        for (tc in tcs) {
          cohorts <- tc$items
          if (length(cohorts) >= 2) {
            for (i in 1:(length(cohorts) - 1)) {
              c1 <- cohorts[i]
              c2 <- cohorts[i+1]
              res[[length(res) + 1]] <- list(
                g1 = c1, 
                g2 = c2, 
                pts = all_pts, 
                label = paste0(c1, "_vs_", c2)
              )
            }
          }
        }
      } else {
        for (g in checked_groups) {
          for (tc in tcs) {
            cohorts <- tc$items
            if (length(cohorts) >= 2) {
              for (i in 1:(length(cohorts) - 1)) {
                c1 <- cohorts[i]
                c2 <- cohorts[i+1]
                res[[length(res) + 1]] <- list(
                  g1 = c1, 
                  g2 = c2, 
                  pts = g$pts, 
                  label = paste0(c1, "_vs_", c2, " (", g$name, ")")
                )
              }
            }
          }
        }
      }
      res
    })
    
    # Unified colors for cohorts
    cohort_colors_map <- reactive({
      custom_cohort_colors()
    })
    
    # Directions colors reactive
    dir_colors_map <- reactive({
      custom_direction_colors()
    })
    
    # -------------------------------------------------------------------------
    # 2. Reactive Data Preparation
    # -------------------------------------------------------------------------
    longData <- reactive({
      message("[DEBUG longitudinal] longData reactive triggered")
      df_imputed <- shared_data$data_processed()
      df_anno <- shared_data$annotationData()
      df_meta <- shared_data$all_metadata()
      req(df_imputed, df_anno, df_meta)
      
      # Intercept Factor Level Ordering based on user UI Preferences
      target_col <- input$order_target_var
      if (!is.null(target_col) && target_col %in% colnames(df_meta)) {
        pref <- shared_data$saved_level_prefs()[[target_col]]
        if (!is.null(pref)) {
          valid_pref <- intersect(pref, unique(df_meta[[target_col]]))
          remainder <- setdiff(unique(df_meta[[target_col]]), valid_pref)
          df_meta[[target_col]] <- factor(df_meta[[target_col]], levels = c(valid_pref, remainder))
        }
      }
      
      # Handle potential differences in naming structures
      df_meta$Cohort <- resolve_longitudinal_cohort(df_meta)
      if (!"Patient_ID" %in% names(df_meta)) {
        df_meta$Patient_ID <- df_meta$PatientNumber
      }
      df_meta$Patient_ID <- gsub("^[Pp]0*", "", as.character(df_meta$Patient_ID))
      df_meta$Patient_ID <- gsub("^0*", "", df_meta$Patient_ID)
      if (!"Sample_ID" %in% names(df_meta)) {
        df_meta$Sample_ID <- df_meta$FullName
      }
      
      df_long <- df_imputed %>%
        tidyr::pivot_longer(cols = -Lipid_Name, names_to = "Sample_ID", values_to = "Value") %>%
        dplyr::inner_join(df_anno, by = "Lipid_Name") %>%
        dplyr::inner_join(df_meta, by = "Sample_ID")
      
      message("[DEBUG longitudinal] longData: rows = ", nrow(df_long))
      df_long
    })
    
    # Subclass sums
    subclassSumsData <- reactive({
      message("[DEBUG longitudinal] subclassSumsData reactive triggered")
      df_long <- longData()
      req(df_long)
      
      res <- df_long %>%
        dplyr::group_by(Sample_ID, Cohort, Patient_ID, subclass) %>%
        dplyr::summarise(Value = log2(sum(Value, na.rm=TRUE) + 1.0), .groups = "drop") %>%
        dplyr::rename(Metric_Name = subclass)
      message("[DEBUG longitudinal] subclassSumsData: rows = ", nrow(res))
      res
    })
    
    # Macroclass sums
    macroclassSumsData <- reactive({
      message("[DEBUG longitudinal] macroclassSumsData reactive triggered")
      df_long <- longData()
      req(df_long)
      
      res <- df_long %>%
        dplyr::group_by(Sample_ID, Cohort, Patient_ID, hyperclass) %>%
        dplyr::summarise(Value = log2(sum(Value, na.rm=TRUE) + 1.0), .groups = "drop") %>%
        dplyr::rename(Metric_Name = hyperclass)
      message("[DEBUG longitudinal] macroclassSumsData: rows = ", nrow(res))
      res
    })
    
    # Functional Indices
    indicesData <- reactive({
      message("[DEBUG longitudinal] indicesData reactive triggered")
      df_long <- longData()
      df_meta <- shared_data$all_metadata()
      req(df_long, df_meta)
      
      if (!"Patient_ID" %in% names(df_meta)) {
        df_meta$Patient_ID <- df_meta$PatientNumber
      }
      df_meta$Patient_ID <- gsub("^[Pp]0*", "", as.character(df_meta$Patient_ID))
      df_meta$Patient_ID <- gsub("^0*", "", df_meta$Patient_ID)
      if (!"Sample_ID" %in% names(df_meta)) {
        df_meta$Sample_ID <- df_meta$FullName
      }
      df_meta$Cohort <- resolve_longitudinal_cohort(df_meta)
      
      # 1. Aggregate by subclass per sample
      class_sums <- df_long %>%
        dplyr::group_by(Sample_ID, subclass) %>%
        dplyr::summarize(TotalValue = sum(Value, na.rm = TRUE), .groups = "drop") %>%
        tidyr::pivot_wider(names_from = subclass, values_from = TotalValue, values_fill = 0)
      
      # 2. Total lipid per sample
      total_lipid <- df_long %>%
        dplyr::group_by(Sample_ID) %>%
        dplyr::summarize(Total = sum(Value, na.rm = TRUE), .groups = "drop")
      
      # 3. Saturation and Length sums per sample
      sat_sums <- df_long %>%
        dplyr::group_by(Sample_ID) %>%
        dplyr::summarize(
          SFA_Total = sum(Value[Has_SFA == TRUE], na.rm=TRUE),
          MUFA_Total = sum(Value[Has_MUFA == TRUE], na.rm=TRUE),
          PUFA_Total = sum(Value[Has_PUFA == TRUE], na.rm=TRUE),
          AA_Total = sum(Value[Has_AA == TRUE], na.rm=TRUE),
          EPA_Total = sum(Value[Has_EPA == TRUE], na.rm=TRUE),
          DHA_Total = sum(Value[Has_DHA == TRUE], na.rm=TRUE),
          SCFA_Total = sum(Value[Has_SCFA == TRUE], na.rm=TRUE),
          MCFA_Total = sum(Value[Has_MCFA == TRUE], na.rm=TRUE),
          LCFA_Total = sum(Value[Has_LCFA == TRUE], na.rm=TRUE),
          VLCFA_Total = sum(Value[Has_VLCFA == TRUE], na.rm=TRUE),
          .groups="drop"
        )
      
      class_sums <- class_sums %>% 
        dplyr::left_join(total_lipid, by = "Sample_ID") %>% 
        dplyr::left_join(sat_sums, by = "Sample_ID")
      
      get_cls <- function(data, cls) { if(cls %in% names(data)) data[[cls]] else rep(0, nrow(data)) }
      
      indices <- list()
      
      # --- STRUCTURAL (21 Indices) ---
      indices[["PE/PC_Index"]] <- get_cls(class_sums, "GP_PE") / (get_cls(class_sums, "GP_PC") + 1e-9)
      indices[["Membrane_Fluidity_Index"]] <- get_cls(class_sums, "GP_PC") / (get_cls(class_sums, "GP_PE") + get_cls(class_sums, "SP_SM") + 1e-9)
      indices[["Structural/Energetic_Ratio"]] <- (get_cls(class_sums, "GP_PC") + get_cls(class_sums, "GP_PE") + get_cls(class_sums, "SP_SM")) / 
                                                 (get_cls(class_sums, "GL_TAG") + get_cls(class_sums, "GL_DAG") + 1e-9)
      indices[["Cardiolipin_Fraction"]] <- get_cls(class_sums, "GP_CL") / (class_sums$Total + 1e-9)
      indices[["CE_Fraction"]] <- get_cls(class_sums, "ST_CE") / (class_sums$Total + 1e-9)
      indices[["PC_Fraction"]] <- get_cls(class_sums, "GP_PC") / (class_sums$Total + 1e-9)
      indices[["PE_Fraction"]] <- get_cls(class_sums, "GP_PE") / (class_sums$Total + 1e-9)
      indices[["SM_Fraction"]] <- get_cls(class_sums, "SP_SM") / (class_sums$Total + 1e-9)
      indices[["Plasmalogen_Fraction"]] <- get_cls(class_sums, "GP_PE_P") / (get_cls(class_sums, "GP_PE") + get_cls(class_sums, "GP_PE_P") + 1e-9)
      indices[["Ether_PE_Fraction"]] <- get_cls(class_sums, "GP_PE_E") / (get_cls(class_sums, "GP_PE") + get_cls(class_sums, "GP_PE_E") + 1e-9)
      indices[["SFA_Fraction"]] <- class_sums$SFA_Total / (class_sums$Total + 1e-9)
      indices[["MUFA_Fraction"]] <- class_sums$MUFA_Total / (class_sums$Total + 1e-9)
      indices[["PUFA_Fraction"]] <- class_sums$PUFA_Total / (class_sums$Total + 1e-9)
      indices[["AA_Fraction"]] <- class_sums$AA_Total / (class_sums$PUFA_Total + 1e-9)
      indices[["EPA_Fraction"]] <- class_sums$EPA_Total / (class_sums$PUFA_Total + 1e-9)
      indices[["DHA_Fraction"]] <- class_sums$DHA_Total / (class_sums$PUFA_Total + 1e-9)
      indices[["PUFA/SFA_Ratio"]] <- class_sums$PUFA_Total / (class_sums$SFA_Total + 1e-9)
      indices[["SCFA_Fraction"]] <- class_sums$SCFA_Total / (class_sums$Total + 1e-9)
      indices[["MCFA_Fraction"]] <- class_sums$MCFA_Total / (class_sums$Total + 1e-9)
      indices[["LCFA_Fraction"]] <- class_sums$LCFA_Total / (class_sums$Total + 1e-9)
      indices[["VLCFA_Fraction"]] <- class_sums$VLCFA_Total / (class_sums$Total + 1e-9)
      
      # --- SIGNALING (14 Indices) ---
      pl_total <- get_cls(class_sums, "GP_PC") + get_cls(class_sums, "GP_PE") + get_cls(class_sums, "GP_PG") + 
                  get_cls(class_sums, "GP_PI") + get_cls(class_sums, "GP_PS") + get_cls(class_sums, "GP_PA") + get_cls(class_sums, "GP_CL")
      
      indices[["(LPC+LPE)/PL_Index"]] <- (get_cls(class_sums, "GP_LPC") + get_cls(class_sums, "GP_LPE")) / (pl_total + 1e-9)
      indices[["Ceramide_Fraction"]] <- get_cls(class_sums, "SP_Cer") / (class_sums$Total + 1e-9)
      indices[["Cer/SM_Index"]] <- get_cls(class_sums, "SP_Cer") / (get_cls(class_sums, "SP_SM") + 1e-9)
      indices[["DG/PL_Index"]] <- get_cls(class_sums, "GL_DAG") / (pl_total + 1e-9)
      indices[["PI_Fraction"]] <- get_cls(class_sums, "GP_PI") / (class_sums$Total + 1e-9)
      indices[["PA_Fraction"]] <- get_cls(class_sums, "GP_PA") / (class_sums$Total + 1e-9)
      indices[["PG_Fraction"]] <- get_cls(class_sums, "GP_PG") / (class_sums$Total + 1e-9)
      indices[["PS_Fraction"]] <- get_cls(class_sums, "GP_PS") / (class_sums$Total + 1e-9)
      indices[["LPC/PC"]] <- get_cls(class_sums, "GP_LPC") / (get_cls(class_sums, "GP_PC") + 1e-9)
      indices[["LPE/PE"]] <- get_cls(class_sums, "GP_LPE") / (get_cls(class_sums, "GP_PE") + 1e-9)
      indices[["LPI/PI"]] <- get_cls(class_sums, "GP_LPI") / (get_cls(class_sums, "GP_PI") + 1e-9)
      indices[["LPS/PS"]] <- get_cls(class_sums, "GP_LPS") / (get_cls(class_sums, "GP_PS") + 1e-9)
      indices[["LPA/PA"]] <- get_cls(class_sums, "GP_LPA") / (get_cls(class_sums, "GP_PA") + 1e-9)
      indices[["LPG/PG"]] <- get_cls(class_sums, "GP_LPG") / (get_cls(class_sums, "GP_PG") + 1e-9)
      
      # --- ENERGY (9 Indices) ---
      indices[["DG/TG_Index"]] <- get_cls(class_sums, "GL_DAG") / (get_cls(class_sums, "GL_TAG") + 1e-9)
      indices[["Energy_Load_Index"]] <- (get_cls(class_sums, "GL_TAG") + get_cls(class_sums, "GL_DAG") + get_cls(class_sums, "ST_CE")) / 
                                        (class_sums$Total - get_cls(class_sums, "GL_TAG") - get_cls(class_sums, "GL_DAG") - get_cls(class_sums, "ST_CE") + 1e-9)
      indices[["Storage_Index"]] <- get_cls(class_sums, "GL_TAG") / (class_sums$Total - get_cls(class_sums, "GL_TAG") + 1e-9)
      indices[["TG/CE_Index"]] <- get_cls(class_sums, "GL_TAG") / (get_cls(class_sums, "ST_CE") + 1e-9)
      indices[["TG/PL_Index"]] <- get_cls(class_sums, "GL_TAG") / (pl_total + 1e-9)
      indices[["TG_Fraction"]] <- get_cls(class_sums, "GL_TAG") / (class_sums$Total + 1e-9)
      indices[["DG_Fraction"]] <- get_cls(class_sums, "GL_DAG") / (class_sums$Total + 1e-9)
      indices[["TG_DG_Fraction"]] <- (get_cls(class_sums, "GL_TAG") + get_cls(class_sums, "GL_DAG")) / (class_sums$Total + 1e-9)
      indices[["ACar_Fraction"]] <- get_cls(class_sums, "FA_ACar") / (class_sums$Total + 1e-9)
      
      # Combine into long dataframe
      idx_df <- data.frame(Sample_ID = class_sums$Sample_ID)
      for (k in names(indices)) idx_df[[k]] <- indices[[k]]
      
      df_idx_meta <- idx_df %>%
        dplyr::inner_join(df_meta, by = "Sample_ID")
      
      message("[DEBUG longitudinal] indicesData: rows = ", nrow(df_idx_meta))
      df_idx_meta
    })
    
    # Subclass structural features (Total carbons, DBs, and sn1/sn2 Length/DB)
    structFeaturesData <- reactive({
      message("[DEBUG longitudinal] structFeaturesData reactive triggered")
      df_long <- longData()
      anno <- shared_data$annotationData()
      req(df_long, anno)
      
      # Map annotation features safely
      Total_C <- if ("Total_Carbons" %in% names(anno)) anno$Total_Carbons else rep(NA, nrow(anno))
      Total_DB <- if ("Total_DB" %in% names(anno)) anno$Total_DB else rep(NA, nrow(anno))
      sn1_C <- if ("nCchain1" %in% names(anno)) anno$nCchain1 else rep(NA, nrow(anno))
      sn1_DB <- if ("DBchain1" %in% names(anno)) anno$DBchain1 else rep(NA, nrow(anno))
      sn2_C <- if ("nCchain2" %in% names(anno)) anno$nCchain2 else rep(NA, nrow(anno))
      sn2_DB <- if ("DBchain2" %in% names(anno)) anno$DBchain2 else rep(NA, nrow(anno))
      
      struct_meta <- data.frame(
        Lipid_Name = anno$Lipid_Name,
        Total_C = Total_C,
        Total_DB = Total_DB,
        sn1_C = sn1_C,
        sn1_DB = sn1_DB,
        sn2_C = sn2_C,
        sn2_DB = sn2_DB,
        stringsAsFactors = FALSE
      )
      
      df_struct_long <- df_long %>%
        dplyr::inner_join(struct_meta, by = "Lipid_Name")
      
      # Calculate abundance-weighted averages per sample and subclass
      df_sample_struct <- df_struct_long %>%
        dplyr::group_by(Sample_ID, Cohort, Patient_ID, subclass) %>%
        dplyr::summarise(
          Total_C_wt = sum(Value[!is.na(Total_C)] * Total_C[!is.na(Total_C)], na.rm = TRUE) / sum(Value[!is.na(Total_C)], na.rm = TRUE),
          Total_DB_wt = sum(Value[!is.na(Total_DB)] * Total_DB[!is.na(Total_DB)], na.rm = TRUE) / sum(Value[!is.na(Total_DB)], na.rm = TRUE),
          sn1_C_wt = sum(Value[!is.na(sn1_C)] * sn1_C[!is.na(sn1_C)], na.rm = TRUE) / sum(Value[!is.na(sn1_C)], na.rm = TRUE),
          sn1_DB_wt = sum(Value[!is.na(sn1_DB)] * sn1_DB[!is.na(sn1_DB)], na.rm = TRUE) / sum(Value[!is.na(sn1_DB)], na.rm = TRUE),
          sn2_C_wt = sum(Value[!is.na(sn2_C)] * sn2_C[!is.na(sn2_C)], na.rm = TRUE) / sum(Value[!is.na(sn2_C)], na.rm = TRUE),
          sn2_DB_wt = sum(Value[!is.na(sn2_DB)] * sn2_DB[!is.na(sn2_DB)], na.rm = TRUE) / sum(Value[!is.na(sn2_DB)], na.rm = TRUE),
          .groups = "drop"
        ) %>%
        dplyr::mutate(dplyr::across(dplyr::ends_with("_wt"), ~ ifelse(is.nan(.), NA, .)))
      
      # Reshape to long format for features
      df_struct_features <- df_sample_struct %>%
        tidyr::pivot_longer(
          cols = c(Total_C_wt, Total_DB_wt, sn1_C_wt, sn1_DB_wt, sn2_C_wt, sn2_DB_wt),
          names_to = "Feature_Type",
          values_to = "Value"
        ) %>%
        dplyr::mutate(
          Feature_Label = dplyr::case_when(
            Feature_Type == "Total_C_wt" ~ "Total Carbons",
            Feature_Type == "Total_DB_wt" ~ "Total Unsaturation",
            Feature_Type == "sn1_C_wt" ~ "sn1-Length",
            Feature_Type == "sn1_DB_wt" ~ "sn1-DB",
            Feature_Type == "sn2_C_wt" ~ "sn2-Length",
            Feature_Type == "sn2_DB_wt" ~ "sn2-DB"
          ),
          Metric_Name = paste(subclass, Feature_Label, sep = " - ")
        ) %>%
        dplyr::filter(!is.na(Value))
      
      message("[DEBUG longitudinal] structFeaturesData: rows = ", nrow(df_struct_features))
      df_struct_features
    })
    
    # All Metrics data (individual lipids)
    allMetricsData <- reactive({
      message("[DEBUG longitudinal] allMetricsData reactive triggered")
      df_long <- longData()
      req(df_long)
      
      res <- df_long %>%
        dplyr::select(Sample_ID, Cohort, Patient_ID, Lipid_Name, Value) %>%
        dplyr::rename(Metric_Name = Lipid_Name)
      message("[DEBUG longitudinal] allMetricsData: rows = ", nrow(res))
      res
    })
    
    # -------------------------------------------------------------------------
    # 3. Significance Ledger Engine
    # -------------------------------------------------------------------------
    ledgerData <- reactive({
      message("[DEBUG longitudinal] Starting ledgerData reactive...")
      start_time <- Sys.time()
      
      df_macro <- macroclassSumsData()
      df_sub <- subclassSumsData()
      df_struct <- structFeaturesData()
      df_allmetrics <- allMetricsData()
      
      am <- shared_data$analysisMode() %||% "Global Lipidomics"
      has_indices <- am == "Global Lipidomics"
      df_idx <- if (has_indices) indicesData() else NULL
      
      req(df_macro, df_sub, df_struct, df_allmetrics)
      trans <- transitions_list()
      
      local_method <- input$localStatMethod %||% "auto"
      resolved_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      clean_method <- gsub("^auto_", "", resolved_method)
      
      if (length(trans) == 0) {
        message("[DEBUG longitudinal] No transitions designed for ledgerData.")
        return(data.frame(
          Metric_Category = character(),
          Metric_Name = character(),
          Comparison = character(),
          P_Value = numeric(),
          Significance = character(),
          Direction = character(),
          stringsAsFactors = FALSE
        ))
      }
      
      res_list <- list()
      
      test_configs <- list(
        list(data = df_macro, val_col = "Value", category = "lipid_class", is_index = FALSE),
        list(data = df_sub, val_col = "Value", category = "lipid_class_hyper", is_index = FALSE),
        list(data = df_struct, val_col = "Value", category = "structural_features", is_index = FALSE),
        list(data = df_allmetrics, val_col = "Value", category = "individual_lipids", is_index = FALSE)
      )
      
      if (has_indices && !is.null(df_idx)) {
        test_configs[[length(test_configs) + 1]] <- list(
          data = df_idx, val_col = NULL, category = "indexes", is_index = TRUE
        )
      }
      
      for (config in test_configs) {
        c_data <- config$data
        val_col <- config$val_col
        cat_name <- config$category
        is_idx <- config$is_index
        
        for (tr in trans) {
          g1 <- tr$g1
          g2 <- tr$g2
          pts <- tr$pts
          comp_label <- tr$label
          
          # Filter to only relevant patient groups and cohorts
          sub_data <- c_data %>% dplyr::filter(Patient_ID %in% pts & Cohort %in% c(g1, g2))
          
          if (nrow(sub_data) == 0) next
          
          pts_g1 <- sub_data %>% dplyr::filter(Cohort == g1) %>% dplyr::pull(Patient_ID) %>% unique()
          pts_g2 <- sub_data %>% dplyr::filter(Cohort == g2) %>% dplyr::pull(Patient_ID) %>% unique()
          common_pts <- intersect(pts_g1, pts_g2)
          
          if (length(common_pts) < 2) next
          
          # Format data to long columns (Patient_ID, Cohort, Metric_Name, Value)
          sub_data_long <- if (is_idx) {
            metrics <- names(sub_data)[sapply(sub_data, is.numeric)]
            sub_data %>%
              dplyr::filter(Patient_ID %in% common_pts) %>%
              tidyr::pivot_longer(cols = dplyr::all_of(metrics), names_to = "Metric_Name", values_to = "Value")
          } else {
            sub_data %>%
              dplyr::filter(Patient_ID %in% common_pts) %>%
              dplyr::select(Patient_ID, Cohort, Metric_Name, Value)
          }
          
          # Handle replicate averages if multiple samples exist per patient/cohort
          sub_data_long <- sub_data_long %>%
            dplyr::group_by(Patient_ID, Cohort, Metric_Name) %>%
            dplyr::summarise(Value = mean(Value, na.rm = TRUE), .groups = "drop")
          
          # Pivot wider
          wide_all <- sub_data_long %>%
            tidyr::pivot_wider(names_from = Cohort, values_from = Value)
          
          if (!(g1 %in% names(wide_all)) || !(g2 %in% names(wide_all))) next
          
          # Keep complete pairs only
          wide_all <- wide_all %>%
            dplyr::filter(!is.na(.data[[g1]]) & !is.na(.data[[g2]]))
          
          if (nrow(wide_all) == 0) next
          
          # Apply pairing/filtering mode consistency
          filter_mode <- input$patientFilterMode %||% "all_dots"
          if (filter_mode == "paired_all") {
            design <- longitudinal_design()
            all_tcs <- design$designer_cases
            
            c_data_long <- if (is_idx) {
              metrics <- names(c_data)[sapply(c_data, is.numeric)]
              c_data %>%
                tidyr::pivot_longer(cols = dplyr::all_of(metrics), names_to = "Metric_Name", values_to = "Value")
            } else {
              c_data %>%
                dplyr::select(Patient_ID, Cohort, Metric_Name, Value)
            }
            
            valid_pts_list <- list()
            for (tc_item in all_tcs) {
              tc_ch <- if (is.list(tc_item)) (tc_item$items %||% tc_item$cohorts) else tc_item
              if (length(tc_ch) < 2) next
              
              pts_tc <- c_data_long %>%
                dplyr::filter(Cohort %in% tc_ch) %>%
                dplyr::group_by(Patient_ID, Metric_Name) %>%
                dplyr::summarise(n_cohorts = length(unique(Cohort)), .groups = "drop") %>%
                dplyr::filter(n_cohorts >= 2) %>%
                dplyr::select(Patient_ID, Metric_Name)
              
              valid_pts_list[[length(valid_pts_list) + 1]] <- pts_tc
            }
            
            if (length(valid_pts_list) > 0) {
              common_pts_metrics <- Reduce(function(df1, df2) {
                dplyr::inner_join(df1, df2, by = c("Patient_ID", "Metric_Name"))
              }, valid_pts_list)
              
              wide_all <- wide_all %>%
                dplyr::semi_join(common_pts_metrics, by = c("Patient_ID", "Metric_Name"))
            }
          }
          
          if (nrow(wide_all) == 0) next
          
          wide_all <- wide_all %>%
            dplyr::mutate(Diff = .data[[g2]] - .data[[g1]])
          
          # Group by Metric_Name and run vectorized tests based on local choice
          if (clean_method == "non_parametric") {
            stats <- wide_all %>%
              dplyr::group_by(Metric_Name) %>%
              dplyr::summarise(
                Mean_Diff = mean(Diff, na.rm = TRUE),
                SD_Diff = sd(Diff, na.rm = TRUE),
                N = sum(!is.na(Diff)),
                Mean_g1 = mean(.data[[g1]], na.rm = TRUE),
                Mean_g2 = mean(.data[[g2]], na.rm = TRUE),
                P_Value = tryCatch(wilcox.test(.data[[g1]], .data[[g2]], paired = TRUE, exact = FALSE)$p.value, error = function(e) NA_real_),
                .groups = "drop"
              ) %>%
              dplyr::filter(N >= 2) %>%
              dplyr::mutate(T_Stat = 0)
          } else {
            stats <- wide_all %>%
              dplyr::group_by(Metric_Name) %>%
              dplyr::summarise(
                Mean_Diff = mean(Diff, na.rm = TRUE),
                SD_Diff = sd(Diff, na.rm = TRUE),
                N = sum(!is.na(Diff)),
                Mean_g1 = mean(.data[[g1]], na.rm = TRUE),
                Mean_g2 = mean(.data[[g2]], na.rm = TRUE),
                .groups = "drop"
              ) %>%
              dplyr::filter(N >= 2 & !is.na(SD_Diff) & SD_Diff > 1e-9) %>%
              dplyr::mutate(
                T_Stat = Mean_Diff / (SD_Diff / sqrt(N)),
                P_Value = 2 * pt(-abs(T_Stat), df = N - 1)
              )
          }
          
          stats <- stats %>%
            dplyr::mutate(
              Metric_Category = cat_name,
              Comparison = comp_label,
              Significance = dplyr::case_when(
                P_Value < 0.001 ~ "***",
                P_Value < 0.01 ~ "**",
                P_Value < 0.05 ~ "*",
                TRUE ~ "ns"
              ),
              Direction = dplyr::case_when(
                Mean_Diff > 0 ~ "Up",
                TRUE ~ "Down"
              )
            ) %>%
            dplyr::select(Metric_Category, Metric_Name, Comparison, P_Value, Significance, Direction) %>%
            as.data.frame()
          
          if (nrow(stats) > 0) {
            res_list[[length(res_list) + 1]] <- stats
          }
        }
      }
      
      end_time <- Sys.time()
      elapsed <- as.numeric(difftime(end_time, start_time, units = "secs"))
      message(sprintf("[DEBUG longitudinal] ledgerData reactive completed in %.3f seconds.", elapsed))
      
      if (length(res_list) == 0) {
        return(data.frame(
          Metric_Category = character(),
          Metric_Name = character(),
          Comparison = character(),
          P_Value = numeric(),
          Significance = character(),
          Direction = character(),
          stringsAsFactors = FALSE
        ))
      }
      
      do.call(rbind, res_list)
    })
    
    # Extract significant metrics only list
    sig_metrics_list <- reactive({
      df <- ledgerData()
      req(df)
      unique(df$Metric_Name[df$P_Value < 0.05])
    })
    
    # -------------------------------------------------------------------------
    # 4. Dropdowns UI Rendering
    # -------------------------------------------------------------------------
    output$macroclass_selector_ui <- renderUI({
      message("[DEBUG longitudinal] macroclass_selector_ui triggered")
      df <- macroclassSumsData()
      req(df)
      choices <- unique(df$Metric_Name)
      
      show_sig <- input$showSignificantOnly %||% FALSE
      if (show_sig) {
        choices <- intersect(choices, sig_metrics_list())
      }
      
      # Standard complete name mapping
      names_map <- choices
      label_format <- input$classLabelFormat %||% "full"
      if (label_format == "full") {
        names(names_map) <- get_full_class_name(choices)
      } else {
        names(names_map) <- get_short_class_name(choices)
      }
      
      message("[DEBUG longitudinal] macroclass_selector_ui: choices size: ", length(choices))
      saved_val <- shared_data$get_restored_input("selectedMacroclass", choices[1])
      selectInput(session$ns("selectedMacroclass"), "Select Lipid Category:", choices = names_map, selected = saved_val)
    })
    
    output$subclass_selector_ui <- renderUI({
      message("[DEBUG longitudinal] subclass_selector_ui triggered")
      df <- subclassSumsData()
      req(df)
      choices <- unique(df$Metric_Name)
      
      show_sig <- input$showSignificantOnly %||% FALSE
      if (show_sig) {
        choices <- intersect(choices, sig_metrics_list())
      }
      
      names_map <- choices
      label_format <- input$classLabelFormat %||% "full"
      if (label_format == "full") {
        names(names_map) <- get_full_class_name(choices)
      } else {
        names(names_map) <- get_short_class_name(choices)
      }
      
      message("[DEBUG longitudinal] subclass_selector_ui: choices size: ", length(choices))
      saved_val <- shared_data$get_restored_input("selectedSubclass", choices[1])
      selectInput(session$ns("selectedSubclass"), "Select Lipid Main Class:", choices = names_map, selected = saved_val)
    })
    
    output$index_selector_ui <- renderUI({
      message("[DEBUG longitudinal] index_selector_ui triggered")
      am <- shared_data$analysisMode() %||% "Global Lipidomics"
      if (am != "Global Lipidomics") {
        return(p(class="text-info", "Functional Indices are only available in Global Lipidomics mode."))
      }
      
      df <- indicesData()
      req(df)
      choices <- names(df)[sapply(df, is.numeric)]
      
      show_sig <- input$showSignificantOnly %||% FALSE
      if (show_sig) {
        choices <- intersect(choices, sig_metrics_list())
      }
      
      message("[DEBUG longitudinal] index_selector_ui: choices size: ", length(choices))
      saved_val <- shared_data$get_restored_input("selectedIndex", choices[1])
      selectInput(session$ns("selectedIndex"), "Select Index:", choices = choices, selected = saved_val)
    })
    
    output$struct_selector_ui <- renderUI({
      message("[DEBUG longitudinal] struct_selector_ui triggered")
      df <- structFeaturesData()
      req(df)
      choices <- unique(df$Metric_Name)
      
      show_sig <- input$showSignificantOnly %||% FALSE
      if (show_sig) {
        choices <- intersect(choices, sig_metrics_list())
      }
      
      message("[DEBUG longitudinal] struct_selector_ui: choices size: ", length(choices))
      saved_val <- shared_data$get_restored_input("selectedStructFeature", choices[1])
      selectInput(session$ns("selectedStructFeature"), "Select Structural Feature:", choices = choices, selected = saved_val)
    })
    
    output$allmetrics_selector_ui <- renderUI({
      message("[DEBUG longitudinal] allmetrics_selector_ui triggered")
      df_allmetrics <- allMetricsData()
      req(df_allmetrics)
      
      ledger <- tryCatch(ledgerData(), error = function(e) NULL)
      if (is.null(ledger)) return(NULL)
      
      sig_metrics_df <- ledger %>%
        dplyr::filter(Metric_Category == "individual_lipids" & P_Value < 0.05) %>%
        dplyr::arrange(P_Value)
      
      sig_metrics <- unique(sig_metrics_df$Metric_Name)
      all_lipids <- unique(df_allmetrics$Metric_Name)
      
      if (length(sig_metrics) == 0 && length(all_lipids) == 0) return(NULL)
      
      default_selected <- sig_metrics
      if (length(default_selected) > 20) {
        default_selected <- default_selected[1:20]
      }
      
      saved_val <- shared_data$get_restored_input("selectedAllMetrics", default_selected)
      selectizeInput(
        session$ns("selectedAllMetrics"),
        label = "Select Lipids to Display (defaults to top significant):",
        choices = all_lipids,
        selected = saved_val,
        multiple = TRUE,
        options = list(
          placeholder = "Search and select lipids...",
          plugins = list("remove_button"),
          dropdownParent = "body"
        ),
        width = "100%"
      )
    })
    
    # -------------------------------------------------------------------------
    # 5. Core Plotting Engine
    # -------------------------------------------------------------------------
    plot_pair <- function(data, metric, val_col, g1, g2, patient_ids, y_min, y_max, show_y_title = TRUE, title_text = NULL) {
      local_method <- input$localStatMethod %||% "auto"
      resolved_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      
      pts_g1 <- data %>% dplyr::filter(Cohort == g1 & Patient_ID %in% patient_ids) %>% dplyr::pull(Patient_ID)
      pts_g2 <- data %>% dplyr::filter(Cohort == g2 & Patient_ID %in% patient_ids) %>% dplyr::pull(Patient_ID)
      common_pts <- intersect(pts_g1, pts_g2)
      
      g1_label <- gsub("_Exp", "", g1)
      g2_label <- gsub("_Exp", "", g2)
      
      if (is.null(title_text)) {
        title_text <- paste(g1_label, "vs", g2_label)
      }
      
      if (length(common_pts) < 1) {
        return(
          ggplot() + 
            theme_void() + 
            labs(title = title_text, subtitle = "No matched pairs (n = 0)") +
            theme(plot.title = element_text(size = 9, face = "bold", hjust = 0.5),
                  plot.subtitle = element_text(size = 8, hjust = 0.5, color = "grey50"))
        )
      }
      
      plot_data <- data %>%
        dplyr::filter(Patient_ID %in% common_pts & Cohort %in% c(g1, g2)) %>%
        dplyr::mutate(Cohort = factor(Cohort, levels = c(g1, g2)))
      
      paired_diffs <- plot_data %>%
        dplyr::select(Patient_ID, Cohort, dplyr::all_of(val_col)) %>%
        tidyr::pivot_wider(names_from = Cohort, values_from = dplyr::all_of(val_col))
      
      if (!(g1 %in% colnames(paired_diffs)) || !(g2 %in% colnames(paired_diffs))) {
        paired_diffs$Direction <- "No Change"
      } else {
        paired_diffs <- paired_diffs %>%
          dplyr::mutate(
            Diff = .data[[g2]] - .data[[g1]],
            Direction = dplyr::case_when(
              Diff > 0.0001 ~ "Up",
              Diff < -0.0001 ~ "Down",
              TRUE ~ "No Change"
            )
          )
      }
      
      plot_data <- plot_data %>%
        dplyr::left_join(dplyr::select(paired_diffs, Patient_ID, Direction), by = "Patient_ID")
      
      pval_text <- "paired p = N/A"
      is_sig <- FALSE
      if (length(common_pts) >= 2 && g1 %in% colnames(paired_diffs) && g2 %in% colnames(paired_diffs)) {
        wide_data <- paired_diffs %>% dplyr::filter(!is.na(.data[[g1]]) & !is.na(.data[[g2]]))
        if (nrow(wide_data) >= 2) {
          pval <- tryCatch(compute_local_p_val(wide_data[[g1]], wide_data[[g2]], method = resolved_method, paired = TRUE), error = function(e) NA_real_)
          if (!is.na(pval)) {
            if (!is.na(pval)) {
              if (pval < 0.001) {
                pval_text <- paste0("paired p < 0.001 (***)")
                is_sig <- TRUE
              } else if (pval < 0.01) {
                pval_text <- paste0("paired p = ", sprintf("%.3f", pval), " (**)")
                is_sig <- TRUE
              } else if (pval < 0.05) {
                pval_text <- paste0("paired p = ", sprintf("%.3f", pval), " (*)")
                is_sig <- TRUE
              } else {
                pval_text <- paste0("paired p = ", sprintf("%.3f", pval), " (ns)")
              }
            }
          }
        }
      }
      
      # Apply significance filtering
      plot_sig_mode <- input$sig_filter_mode %||% "all"
      line_alpha <- 0.5
      if (!is_sig && plot_sig_mode == "color_sig") {
        plot_data$Direction <- "No Change"
      } else if (!is_sig && plot_sig_mode == "draw_sig") {
        line_alpha <- 0.0
      }
      
      p <- ggplot(plot_data, aes(x = Cohort, y = !!sym(val_col)))
      
      if (line_alpha > 0) {
        p <- p + geom_line(aes(group = Patient_ID, color = Direction), alpha = line_alpha, linewidth = 0.6, show.legend = TRUE)
      }
      
      p <- p +
        geom_point(aes(fill = Cohort), shape = 21, size = 3, color = "black", stroke = 0.4, alpha = 0.85, show.legend = FALSE) +
        ggrepel::geom_text_repel(
          aes(label = sub("^P0*", "", Patient_ID)),
          size = 2.5,
          segment.color = "grey60",
          segment.size = 0.2,
          box.padding = 0.15,
          point.padding = 0.2,
          max.overlaps = Inf,
          show.legend = FALSE
        ) +
        scale_x_discrete(labels = c(g1_label, g2_label), expand = c(0.1, 0.1)) +
        scale_fill_manual(values = cohort_colors_map(), guide = "none") +
        scale_color_manual(
          name = "Timecourse",
          values = dir_colors_map(),
          labels = c("Up" = "Increase", "Down" = "Decrease", "No Change" = "No Change"),
          drop = FALSE,
          guide = guide_legend(override.aes = list(alpha = 1, linewidth = 1))
        ) +
        coord_cartesian(ylim = c(y_min, y_max), clip = "off") +
        theme_classic() +
        theme(
          legend.position = "right",
          plot.title = element_text(size = 9, face = "bold", hjust = 0.5),
          plot.subtitle = element_text(size = 8, hjust = 0.5, color = "grey30"),
          axis.text = element_text(size = 8),
          axis.title = element_text(size = 8),
          aspect.ratio = 1.0
        ) +
        labs(
          title = title_text,
          subtitle = paste0(pval_text, " (n = ", length(common_pts), ")"),
          x = NULL,
          y = NULL
        )
      
      y_title <- if (show_y_title) {
        if (val_col != "Value") {
          "Index Value"
        } else if (grepl("Carbons|Unsaturation|Length|DB", metric)) {
          "Weighted Index"
        } else {
          "Log2 Abundance"
        }
      } else {
        NULL
      }
      p <- p + labs(y = y_title)
      return(p)
    }
    
    plot_overlaid_pair <- function(data, metric, val_col, patient_ids, y_min, y_max, show_y_title = TRUE) {
      ch <- cohorts_map()
      plot_data <- data %>%
        dplyr::filter(Patient_ID %in% patient_ids) %>%
        dplyr::filter(Cohort %in% c(ch$ss1, ch$pc1, ch$ss2, ch$pc2))
      
      if (nrow(plot_data) < 1) {
        return(
          ggplot() + 
            theme_void() + 
            labs(title = "SS vs PC (Overlaid)", subtitle = "No matched pairs (n = 0)") +
            theme(plot.title = element_text(size = 9, face = "bold", hjust = 0.5),
                  plot.subtitle = element_text(size = 8, hjust = 0.5, color = "grey50"))
        )
      }
      
      plot_data <- plot_data %>%
        dplyr::mutate(
          State = dplyr::case_when(
            Cohort %in% c(ch$ss1, ch$ss2) ~ "Steady State",
            Cohort %in% c(ch$pc1, ch$pc2) ~ "Pain Crisis"
          ),
          State = factor(State, levels = c("Steady State", "Pain Crisis")),
          Visit = dplyr::case_when(
            Cohort %in% c(ch$ss1, ch$pc1) ~ "Visit 1",
            Cohort %in% c(ch$ss2, ch$pc2) ~ "Visit 2"
          ),
          Visit = factor(Visit, levels = c("Visit 1", "Visit 2"))
        )
      
      wide_visit1 <- plot_data %>%
        dplyr::filter(Visit == "Visit 1") %>%
        dplyr::select(Patient_ID, State, dplyr::all_of(val_col)) %>%
        tidyr::pivot_wider(names_from = State, values_from = dplyr::all_of(val_col))
      
      if (ncol(wide_visit1) >= 3 && "Pain Crisis" %in% names(wide_visit1) && "Steady State" %in% names(wide_visit1)) {
        wide_visit1 <- wide_visit1 %>%
          dplyr::mutate(
            Diff = `Pain Crisis` - `Steady State`,
            Direction = dplyr::case_when(
              Diff > 0.0001 ~ "Up",
              Diff < -0.0001 ~ "Down",
              TRUE ~ "No Change"
            ),
            Visit = "Visit 1"
          )
      } else {
        wide_visit1 <- data.frame(Patient_ID = character(), Direction = character(), Visit = character())
      }
      
      wide_visit2 <- plot_data %>%
        dplyr::filter(Visit == "Visit 2") %>%
        dplyr::select(Patient_ID, State, dplyr::all_of(val_col)) %>%
        tidyr::pivot_wider(names_from = State, values_from = dplyr::all_of(val_col))
      
      if (ncol(wide_visit2) >= 3 && "Pain Crisis" %in% names(wide_visit2) && "Steady State" %in% names(wide_visit2)) {
        wide_visit2 <- wide_visit2 %>%
          dplyr::mutate(
            Diff = `Pain Crisis` - `Steady State`,
            Direction = dplyr::case_when(
              Diff > 0.0001 ~ "Up",
              Diff < -0.0001 ~ "Down",
              TRUE ~ "No Change"
            ),
            Visit = "Visit 2"
          )
      } else {
        wide_visit2 <- data.frame(Patient_ID = character(), Direction = character(), Visit = character())
      }
      
      diffs <- rbind(wide_visit1[, c("Patient_ID", "Direction", "Visit")], wide_visit2[, c("Patient_ID", "Direction", "Visit")])
      if (nrow(diffs) > 0) {
        diffs <- diffs %>% dplyr::mutate(Visit = factor(Visit, levels = c("Visit 1", "Visit 2")))
        plot_data <- plot_data %>%
          dplyr::left_join(diffs %>% dplyr::select(Patient_ID, Visit, Direction), by = c("Patient_ID", "Visit"))
      } else {
        plot_data$Direction <- "No Change"
      }
      
      p_v1 <- NA; p_v2 <- NA
      if (nrow(wide_visit1) >= 2 && "Pain Crisis" %in% colnames(wide_visit1) && "Steady State" %in% colnames(wide_visit1)) {
        p_v1 <- tryCatch(compute_local_p_val(wide_visit1$`Steady State`, wide_visit1$`Pain Crisis`, method = resolved_method, paired = TRUE), error = function(e) NA_real_)
      }
      if (nrow(wide_visit2) >= 2 && "Pain Crisis" %in% colnames(wide_visit2) && "Steady State" %in% colnames(wide_visit2)) {
        p_v2 <- tryCatch(compute_local_p_val(wide_visit2$`Steady State`, wide_visit2$`Pain Crisis`, method = resolved_method, paired = TRUE), error = function(e) NA_real_)
      }
      
      format_pval_short <- function(p) {
        if (is.na(p)) return("N/A")
        if (p < 0.001) return("<0.001(***)")
        if (p < 0.01) return(paste0(sprintf("%.3f", p), "(**)"))
        if (p < 0.05) return(paste0(sprintf("%.3f", p), "(*)"))
        return(paste0(sprintf("%.3f", p), "(ns)"))
      }
      
      sub_text <- paste0("V1 p=", format_pval_short(p_v1), ", V2 p=", format_pval_short(p_v2))
      
      is_sig_v1 <- !is.na(p_v1) && p_v1 < 0.05
      is_sig_v2 <- !is.na(p_v2) && p_v2 < 0.05
      
      plot_sig_mode <- input$sig_filter_mode %||% "all"
      
      # Apply segment-specific significance filtering
      plot_data <- plot_data %>%
        dplyr::mutate(
          Direction = dplyr::case_when(
            plot_sig_mode == "color_sig" & Visit == "Visit 1" & !is_sig_v1 ~ "No Change",
            plot_sig_mode == "color_sig" & Visit == "Visit 2" & !is_sig_v2 ~ "No Change",
            TRUE ~ Direction
          ),
          LineAlpha = dplyr::case_when(
            plot_sig_mode == "draw_sig" & Visit == "Visit 1" & !is_sig_v1 ~ 0.0,
            plot_sig_mode == "draw_sig" & Visit == "Visit 2" & !is_sig_v2 ~ 0.0,
            TRUE ~ 0.6
          )
        )
      
      p <- ggplot(plot_data, aes(x = State, y = !!sym(val_col))) +
        geom_line(aes(group = interaction(Patient_ID, Visit), color = Direction, linetype = Visit, alpha = LineAlpha), linewidth = 0.6) +
        scale_alpha_identity() +
        geom_point(aes(fill = Cohort), shape = 21, size = 3, color = "black", stroke = 0.4, alpha = 0.85, show.legend = FALSE) +
        ggrepel::geom_text_repel(
          aes(label = sub("^P0*", "", Patient_ID)),
          size = 2.5,
          segment.color = "grey60",
          segment.size = 0.2,
          box.padding = 0.15,
          point.padding = 0.2,
          max.overlaps = Inf,
          show.legend = FALSE
        ) +
        scale_fill_manual(values = cohort_colors_map(), guide = "none") +
        scale_color_manual(
          name = "Timecourse",
          values = dir_colors_map(),
          labels = c("Up" = "Increase", "Down" = "Decrease", "No Change" = "No Change"),
          drop = FALSE,
          guide = guide_legend(order = 1, override.aes = list(alpha = 1, linewidth = 1))
        ) +
        scale_linetype_manual(
          name = "Visit",
          values = c("Visit 1" = "solid", "Visit 2" = "dashed"),
          guide = guide_legend(order = 2)
        ) +
        scale_x_discrete(expand = c(0.1, 0.1)) +
        coord_cartesian(ylim = c(y_min, y_max), clip = "off") +
        theme_classic() +
        theme(
          legend.position = "right",
          plot.title = element_text(size = 9, face = "bold", hjust = 0.5),
          plot.subtitle = element_text(size = 8, hjust = 0.5, color = "grey30"),
          axis.text = element_text(size = 8),
          axis.title = element_text(size = 8),
          aspect.ratio = 1.0
        ) +
        labs(
          title = "SS vs PC (Overlaid)",
          subtitle = sub_text,
          x = NULL,
          y = NULL
        )
      
      y_title <- if (show_y_title) {
        if (val_col != "Value") {
          "Index Value"
        } else if (grepl("Carbons|Unsaturation|Length|DB", metric)) {
          "Weighted Index"
        } else {
          "Log2 Abundance"
        }
      } else {
        NULL
      }
      p <- p + labs(y = y_title)
      return(p)
    }
    
    plot_trajectory_single <- function(data, metric, val_col, timecourses, patient_ids, y_min, y_max, show_y_title = TRUE, title_text = NULL, tc_index = NULL) {
      local_method <- input$localStatMethod %||% "auto"
      resolved_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      
      req(length(timecourses) > 0)
      
      plot_data_list <- list()
      pval_texts <- c()
      
      plot_sig_mode <- input$sig_filter_mode %||% "all"
      
      for (i in seq_along(timecourses)) {
        tc <- timecourses[[i]]
        tc_cohorts <- if (is.list(tc)) (tc$items %||% tc$cohorts) else tc
        tc_connected <- if (is.list(tc)) (tc$connected %||% TRUE) else TRUE
        
        if (length(tc_cohorts) < 2) next
        
        filter_mode <- input$patientFilterMode %||% "all_dots"
        
        if (filter_mode == "paired_all") {
          # Find patients that have at least 2 cohorts in ALL designed timecourses
          design <- longitudinal_design()
          all_tcs <- design$designer_cases
          valid_pts_list <- list()
          for (tc_item in all_tcs) {
            tc_ch <- if (is.list(tc_item)) (tc_item$items %||% tc_item$cohorts) else tc_item
            if (length(tc_ch) < 2) next
            
            pts_tc <- data %>%
              dplyr::filter(Cohort %in% tc_ch) %>%
              dplyr::group_by(Patient_ID) %>%
              dplyr::summarise(n_cohorts = length(unique(Cohort)), .groups = "drop") %>%
              dplyr::filter(n_cohorts >= 2) %>%
              dplyr::pull(Patient_ID)
            
            valid_pts_list[[length(valid_pts_list) + 1]] <- pts_tc
          }
          
          if (length(valid_pts_list) > 0) {
            pts_with_some_data <- Reduce(intersect, valid_pts_list)
          } else {
            pts_with_some_data <- character()
          }
        } else if (filter_mode == "paired_tc") {
          # Keep only patients with data for at least 2 cohorts in this timecourse box
          pts_with_some_data <- data %>%
            dplyr::filter(Cohort %in% tc_cohorts) %>%
            dplyr::group_by(Patient_ID) %>%
            dplyr::summarise(n_cohorts = length(unique(Cohort)), .groups = "drop") %>%
            dplyr::filter(n_cohorts >= 2) %>%
            dplyr::pull(Patient_ID)
        } else { # "all_dots"
          # Filter to only keep patients that have data for AT LEAST ONE selected cohort in this timecourse ("all available")
          pts_with_some_data <- data %>%
            dplyr::filter(Cohort %in% tc_cohorts) %>%
            dplyr::group_by(Patient_ID) %>%
            dplyr::summarise(n_cohorts = length(unique(Cohort)), .groups = "drop") %>%
            dplyr::filter(n_cohorts >= 1) %>%
            dplyr::pull(Patient_ID)
        }
        
        tc_data <- data %>%
          dplyr::filter(Patient_ID %in% patient_ids & Patient_ID %in% pts_with_some_data & Cohort %in% tc_cohorts)
        
        if (nrow(tc_data) == 0) next
        
        tc_data$Timecourse_ID <- if (!is.null(tc_index)) tc_index else i
        
        # Calculate direction based on first vs last selected cohort for this timecourse
        first_cohort <- tc_cohorts[1]
        last_cohort <- tc_cohorts[length(tc_cohorts)]
        
        tc_wide <- tc_data %>%
          dplyr::filter(Cohort %in% c(first_cohort, last_cohort)) %>%
          dplyr::select(Patient_ID, Cohort, dplyr::all_of(val_col)) %>%
          tidyr::pivot_wider(names_from = Cohort, values_from = dplyr::all_of(val_col))
        
        if (first_cohort %in% colnames(tc_wide) && last_cohort %in% colnames(tc_wide)) {
          tc_wide <- tc_wide %>%
            dplyr::mutate(
              Diff = .data[[last_cohort]] - .data[[first_cohort]],
              Direction = dplyr::case_when(
                is.na(Diff) ~ "No Change",
                Diff > 0.0001 ~ "Up",
                Diff < -0.0001 ~ "Down",
                TRUE ~ "No Change"
              )
            )
        } else {
          tc_wide$Direction <- "No Change"
        }
        
        # Calculate significance (first vs last)
        pval_text <- "p = N/A"
        is_sig <- FALSE
        if (length(unique(tc_data$Patient_ID)) >= 2 && first_cohort %in% colnames(tc_wide) && last_cohort %in% colnames(tc_wide)) {
          wide_test <- tc_wide %>% dplyr::filter(!is.na(.data[[first_cohort]]) & !is.na(.data[[last_cohort]]))
          if (nrow(wide_test) >= 2) {
            pval <- tryCatch(compute_local_p_val(wide_test[[first_cohort]], wide_test[[last_cohort]], method = resolved_method, paired = TRUE), error = function(e) NA_real_)
            if (!is.na(pval)) {
              if (!is.na(pval)) {
                if (pval < 0.001) {
                  pval_text <- "p < 0.001 (***)"
                  is_sig <- TRUE
                } else if (pval < 0.01) {
                  pval_text <- paste0("p = ", sprintf("%.3f", pval), " (**)")
                  is_sig <- TRUE
                } else if (pval < 0.05) {
                  pval_text <- paste0("p = ", sprintf("%.3f", pval), " (*)")
                  is_sig <- TRUE
                } else {
                  pval_text <- paste0("p = ", sprintf("%.3f", pval), " (ns)")
                }
              }
            }
          }
        }
        
        lbl1 <- gsub("_Exp", "", first_cohort)
        lbl2 <- gsub("_Exp", "", last_cohort)
        pval_texts <- c(pval_texts, paste0(lbl1, " vs ", lbl2, ": ", pval_text))
        
        tc_data <- tc_data %>%
          dplyr::left_join(dplyr::select(tc_wide, Patient_ID, Direction), by = "Patient_ID") %>%
          dplyr::filter(!is.na(Direction))
        
        tc_data$LineAlpha <- 0.5
        if (!tc_connected) {
          tc_data$LineAlpha <- 0.0
        } else if (!is_sig && plot_sig_mode == "color_sig") {
          tc_data$Direction <- "No Change"
        } else if (!is_sig && plot_sig_mode == "draw_sig") {
          tc_data$LineAlpha <- 0.0
        }
        
        tc_data$Direction <- factor(tc_data$Direction, levels = c("Down", "No Change", "Up"))
        
        plot_data_list[[length(plot_data_list) + 1]] <- tc_data
      }
      
      if (length(plot_data_list) == 0) {
        return(NULL)
      }
      
      plot_data <- dplyr::bind_rows(plot_data_list)
      
      all_tc_cohorts <- unique(unlist(lapply(timecourses, function(x) if (is.list(x)) (x$items %||% x$cohorts) else x)))
      plot_data <- plot_data %>%
        dplyr::mutate(Cohort = factor(Cohort, levels = all_tc_cohorts))
      
      subtitle_text <- paste(pval_texts, collapse = "; ")
      clean_cohort_labels <- gsub("_Exp", "", all_tc_cohorts)
      
      display_title <- title_text
      if (!is.null(tc_index)) {
        display_title <- if (is.list(timecourses[[1]])) timecourses[[1]]$name else paste("Timecourse", tc_index)
      }
      
      p <- ggplot(plot_data, aes(x = Cohort, y = !!sym(val_col)))
      
      p <- p + geom_line(aes(group = interaction(Patient_ID, Timecourse_ID), color = Direction, alpha = LineAlpha), linewidth = 0.6, show.legend = TRUE) +
        scale_alpha_identity()
      
      p <- p +
        geom_point(aes(fill = Cohort), shape = 21, size = 3, color = "black", stroke = 0.4, alpha = 0.85, show.legend = FALSE) +
        ggrepel::geom_text_repel(
          aes(label = sub("^P0*", "", Patient_ID)),
          size = 2.5,
          segment.color = "grey60",
          segment.size = 0.2,
          box.padding = 0.15,
          point.padding = 0.2,
          max.overlaps = Inf,
          show.legend = FALSE
        ) +
        scale_x_discrete(labels = clean_cohort_labels, expand = c(0.1, 0.1)) +
        scale_fill_manual(values = cohort_colors_map(), guide = "none") +
        scale_color_manual(
          name = "Timecourse",
          values = dir_colors_map(),
          labels = c("Up" = "Increase", "Down" = "Decrease", "No Change" = "No Change"),
          drop = FALSE,
          guide = guide_legend(override.aes = list(alpha = 1, linewidth = 1))
        ) +
        coord_cartesian(ylim = c(y_min, y_max), clip = "off") +
        theme_classic() +
        theme(
          legend.position = "right",
          plot.title = element_text(size = 9, face = "bold", hjust = 0.5),
          plot.subtitle = element_text(size = 8, hjust = 0.5, color = "grey30"),
          axis.text = element_text(size = 8),
          axis.title = element_text(size = 8),
          aspect.ratio = 1.0
        ) +
        labs(
          title = display_title,
          subtitle = paste0(subtitle_text, " (n = ", length(unique(plot_data$Patient_ID)), ")"),
          x = NULL,
          y = NULL
        )
      
      y_title <- if (show_y_title) {
        if (val_col != "Value") {
          "Index Value"
        } else if (grepl("Carbons|Unsaturation|Length|DB", metric)) {
          "Weighted Index"
        } else {
          "Log2 Abundance"
        }
      } else {
        NULL
      }
      p <- p + labs(y = y_title)
      return(p)
    }
    
    plot_trajectory <- function(data, metric, val_col, timecourses, patient_ids, y_min, y_max, show_y_title = TRUE, title_text = NULL) {
      req(length(timecourses) > 0)
      
      tc_layout <- input$timecourseLayout %||% "single"
      
      if (tc_layout == "separate") {
        plots_list <- list()
        for (i in seq_along(timecourses)) {
          p_tc <- plot_trajectory_single(data, metric, val_col, timecourses[i], patient_ids, y_min, y_max, show_y_title = show_y_title, title_text = NULL, tc_index = i)
          if (!is.null(p_tc)) {
            plots_list[[length(plots_list) + 1]] <- p_tc
          }
        }
        if (length(plots_list) == 0) {
          return(
            ggplot() + 
              theme_void() + 
              labs(title = title_text, subtitle = "No matched pairs (n = 0)") +
              theme(plot.title = element_text(size = 9, face = "bold", hjust = 0.5))
          )
        }
        
        p_wrapped <- patchwork::wrap_plots(plots_list, ncol = length(plots_list), guides = "collect")
        if (!is.null(title_text) && title_text != "") {
          p_wrapped <- p_wrapped + patchwork::plot_annotation(
            title = title_text,
            theme = theme(
              plot.title = element_text(size = 9, face = "bold", hjust = 0.5, margin = margin(b = 2))
            )
          )
        }
        return(p_wrapped)
      } else {
        p_single <- plot_trajectory_single(data, metric, val_col, timecourses, patient_ids, y_min, y_max, show_y_title, title_text, tc_index = NULL)
        if (is.null(p_single)) {
          return(
            ggplot() + 
              theme_void() + 
              labs(title = title_text, subtitle = "No matched pairs (n = 0)") +
              theme(plot.title = element_text(size = 9, face = "bold", hjust = 0.5),
                    plot.subtitle = element_text(size = 8, hjust = 0.5, color = "grey50"))
          )
        }
        return(p_single)
      }
    }
    
    generate_grid_plot <- function(data, metric, val_col, metric_label) {
      if ("Metric_Name" %in% names(data)) {
        data <- data %>% dplyr::filter(Metric_Name == metric)
      }
      
      y_vals <- if (is.null(val_col)) {
        data %>% pull(!!sym(metric))
      } else {
        data %>% dplyr::pull(!!sym(val_col))
      }
      
      if (length(y_vals) == 0) return(NULL)
      y_min <- min(y_vals, na.rm = TRUE)
      y_max <- max(y_vals, na.rm = TRUE)
      y_range <- y_max - y_min
      if (y_range == 0) y_range <- 1.0
      y_min <- y_min - y_range * 0.05
      y_max <- y_max + y_range * 0.05
      
      design <- longitudinal_design()
      plot_mode <- design$comparison_mode
      checked_groups <- design$checked_groups
      
      layout_mode <- input$patientLayout
      
      plot_metric_name <- metric
      if (input$classLabelFormat == "full") {
        plot_metric_name <- get_full_class_name(metric)
      } else {
        plot_metric_name <- get_short_class_name(metric)
      }
      
      tcs <- design$designer_cases
      
      if (length(tcs) == 0) {
        combined <- ggplot() + 
          theme_void() + 
          labs(title = "No active trajectories designed. Please drag cohorts into the designer under Panel 2.")
      } else {
        groups_list <- list()
        if (layout_mode == "all") {
          all_pts_to_plot <- if (length(checked_groups) == 0) {
            all_patients_clean()
          } else {
            unique(unlist(lapply(checked_groups, function(x) x$pts)))
          }
          groups_list[[1]] <- list(name = "All Patients", pts = all_pts_to_plot)
          
          for (g in checked_groups) {
            groups_list[[length(groups_list) + 1]] <- list(name = g$name, pts = g$pts)
          }
        } else {
          idx <- which(sapply(checked_groups, function(g) g$id == layout_mode))
          if (length(idx) > 0) {
            grp <- checked_groups[[idx]]
            groups_list[[1]] <- list(name = grp$name, pts = grp$pts)
          } else {
            pts_to_use <- get_group_pts_safe(layout_mode)
            groups_list[[1]] <- list(name = layout_mode, pts = pts_to_use)
          }
        }
        
        tc_layout <- input$timecourseLayout %||% "single"
        plots <- list()
        
        if (tc_layout == "separate") {
          for (g_idx in seq_along(groups_list)) {
            g <- groups_list[[g_idx]]
            for (tc_idx in seq_along(tcs)) {
              tc_name <- tcs[[tc_idx]]$name
              cell_title <- if (length(groups_list) > 1) {
                paste0(g$name, ": ", tc_name)
              } else {
                tc_name
              }
              
              show_y <- (tc_idx == 1)
              
              p_cell <- plot_trajectory_single(
                data = data,
                metric = metric,
                val_col = val_col %||% metric,
                timecourses = tcs[tc_idx],
                patient_ids = g$pts,
                y_min = y_min,
                y_max = y_max,
                show_y_title = show_y,
                title_text = cell_title,
                tc_index = tc_idx
              )
              
              if (is.null(p_cell)) {
                p_cell <- ggplot() + 
                  theme_void() + 
                  labs(title = cell_title, subtitle = "No matched pairs (n = 0)") +
                  theme(plot.title = element_text(size = 9, face = "bold", hjust = 0.5))
              }
              
              plots[[length(plots) + 1]] <- p_cell
            }
          }
          combined <- patchwork::wrap_plots(plots, ncol = length(tcs), guides = "collect")
        } else {
          for (g_idx in seq_along(groups_list)) {
            g <- groups_list[[g_idx]]
            show_y <- (g_idx %% 3 == 1)
            
            p_cell <- plot_trajectory(
              data = data,
              metric = metric,
              val_col = val_col %||% metric,
              timecourses = tcs,
              patient_ids = g$pts,
              y_min = y_min,
              y_max = y_max,
              show_y_title = show_y,
              title_text = g$name
            )
            
            plots[[length(plots) + 1]] <- p_cell
          }
          combined <- patchwork::wrap_plots(plots, ncol = if (layout_mode == "all") 3 else 1, guides = "collect")
        }
      }
      
      combined <- combined +
        patchwork::plot_annotation(
          title = plot_metric_name,
          theme = theme(
            plot.title = element_text(size = 13, face = "bold", hjust = 0.5, margin = margin(b = 5))
          )
        ) & theme(legend.position = "right")
      
      return(combined)
    }
    
    # -------------------------------------------------------------------------
    # 6. Tab Plots Rendering
    # -------------------------------------------------------------------------
    
    get_dynamic_plot_height <- function() {
      design <- longitudinal_design()
      layout_mode <- input$patientLayout
      checked_groups <- design$checked_groups
      tcs <- design$designer_cases
      tc_layout <- input$timecourseLayout %||% "single"
      
      if (length(tcs) == 0) return(350)
      
      if (tc_layout == "separate") {
        n_rows <- if (layout_mode == "all") (length(checked_groups) + 1) else 1
        return(max(350, n_rows * 300))
      } else {
        if (layout_mode == "all") {
          n_plots <- length(checked_groups) + 1
          n_rows <- ceiling(n_plots / 3)
          return(max(350, n_rows * 350))
        } else {
          return(350)
        }
      }
    }
    
    macroclassPlotReactive <- reactive({
      message("[DEBUG longitudinal] macroclassPlotReactive: selected = ", input$selectedMacroclass)
      req(input$selectedMacroclass)
      df <- macroclassSumsData()
      req(df)
      generate_grid_plot(df, input$selectedMacroclass, "Value", input$selectedMacroclass)
    })
    
    output$macroclass_plot <- renderPlot({
      message("[DEBUG longitudinal] renderPlot macroclass_plot")
      macroclassPlotReactive()
    }, height = get_dynamic_plot_height)
    
    subclassPlotReactive <- reactive({
      message("[DEBUG longitudinal] subclassPlotReactive: selected = ", input$selectedSubclass)
      req(input$selectedSubclass)
      df <- subclassSumsData()
      req(df)
      generate_grid_plot(df, input$selectedSubclass, "Value", input$selectedSubclass)
    })
    
    output$subclass_plot <- renderPlot({
      message("[DEBUG longitudinal] renderPlot subclass_plot")
      subclassPlotReactive()
    }, height = get_dynamic_plot_height)
    
    indexPlotReactive <- reactive({
      message("[DEBUG longitudinal] indexPlotReactive: selected = ", input$selectedIndex)
      req(input$selectedIndex)
      df <- indicesData()
      req(df)
      generate_grid_plot(df, input$selectedIndex, NULL, input$selectedIndex)
    })
    
    output$index_plot <- renderPlot({
      message("[DEBUG longitudinal] renderPlot index_plot")
      indexPlotReactive()
    }, height = get_dynamic_plot_height)
    
    structPlotReactive <- reactive({
      message("[DEBUG longitudinal] structPlotReactive: selected = ", input$selectedStructFeature)
      req(input$selectedStructFeature)
      df <- structFeaturesData()
      req(df)
      generate_grid_plot(df, input$selectedStructFeature, "Value", input$selectedStructFeature)
    })
    
    output$struct_plot <- renderPlot({
      message("[DEBUG longitudinal] renderPlot struct_plot")
      structPlotReactive()
    }, height = get_dynamic_plot_height)
    
    get_allmetrics_plot_height <- function() {
      df_allmetrics <- allMetricsData()
      if (is.null(df_allmetrics)) return(350)
      
      ledger <- tryCatch(ledgerData(), error = function(e) NULL)
      if (is.null(ledger)) return(350)
      
      selected_metrics <- input$selectedAllMetrics
      if (is.null(selected_metrics) || length(selected_metrics) == 0) {
        sig_metrics_df <- ledger %>%
          dplyr::filter(Metric_Category == "individual_lipids" & P_Value < 0.05) %>%
          dplyr::arrange(P_Value)
        selected_metrics <- unique(sig_metrics_df$Metric_Name)
      }
      
      if (length(selected_metrics) == 0) return(350)
      
      design <- longitudinal_design()
      layout_mode <- input$patientLayout
      checked_groups <- design$checked_groups
      tcs <- design$designer_cases
      tc_layout <- input$timecourseLayout %||% "single"
      
      if (length(tcs) == 0) {
        single_height <- 350
      } else if (tc_layout == "separate") {
        n_rows <- if (layout_mode == "all") (length(checked_groups) + 1) else 1
        single_height <- max(350, n_rows * 300)
      } else {
        if (layout_mode == "all") {
          n_plots <- length(checked_groups) + 1
          n_rows <- ceiling(n_plots / 3)
          single_height <- max(350, n_rows * 350)
        } else {
          single_height <- 350
        }
      }
      
      ncol_metric <- if (length(tcs) == 0) {
        1
      } else if (tc_layout == "separate") {
        length(tcs)
      } else if (layout_mode == "all") {
        3
      } else {
        1
      }
      
      top_ncol <- if (ncol_metric == 1) {
        3
      } else if (ncol_metric == 2) {
        2
      } else {
        1
      }
      
      max_total_height <- 20000
      n_top_rows_max <- max(1, floor(max_total_height / single_height))
      max_allowed_M <- n_top_rows_max * top_ncol
      max_allowed_M <- min(max_allowed_M, 100)
      
      if (length(selected_metrics) > max_allowed_M) {
        selected_metrics <- selected_metrics[1:max_allowed_M]
      }
      
      M <- length(selected_metrics)
      n_top_rows <- ceiling(M / top_ncol)
      
      return(n_top_rows * single_height)
    }
    
    allmetricsPlotReactive <- reactive({
      message("[DEBUG longitudinal] allmetricsPlotReactive triggered")
      df_allmetrics <- allMetricsData()
      req(df_allmetrics)
      
      ledger <- tryCatch(ledgerData(), error = function(e) NULL)
      if (is.null(ledger)) {
        message("[DEBUG longitudinal] allmetricsPlotReactive: ledger is NULL")
        return(
          ggplot() + 
            theme_void() + 
            labs(title = "No significance data available.")
        )
      }
      
      selected_metrics <- input$selectedAllMetrics
      if (is.null(selected_metrics) || length(selected_metrics) == 0) {
        sig_metrics_df <- ledger %>%
          dplyr::filter(Metric_Category == "individual_lipids" & P_Value < 0.05) %>%
          dplyr::arrange(P_Value)
        selected_metrics <- unique(sig_metrics_df$Metric_Name)
      }
      
      if (length(selected_metrics) == 0) {
        return(
          ggplot() + 
            theme_void() + 
            labs(title = "No individual lipids selected/detected to display.") +
            theme(plot.title = element_text(size = 12, face = "bold", hjust = 0.5))
        )
      }
      
      design <- longitudinal_design()
      layout_mode <- input$patientLayout
      checked_groups <- design$checked_groups
      tcs <- design$designer_cases
      tc_layout <- input$timecourseLayout %||% "single"
      
      if (length(tcs) == 0) {
        single_height <- 350
      } else if (tc_layout == "separate") {
        n_rows <- if (layout_mode == "all") (length(checked_groups) + 1) else 1
        single_height <- max(350, n_rows * 300)
      } else {
        if (layout_mode == "all") {
          n_plots <- length(checked_groups) + 1
          n_rows <- ceiling(n_plots / 3)
          single_height <- max(350, n_rows * 350)
        } else {
          single_height <- 350
        }
      }
      
      ncol_metric <- if (length(tcs) == 0) {
        1
      } else if (tc_layout == "separate") {
        length(tcs)
      } else if (layout_mode == "all") {
        3
      } else {
        1
      }
      
      top_ncol <- if (ncol_metric == 1) {
        3
      } else if (ncol_metric == 2) {
        2
      } else {
        1
      }
      
      max_total_height <- 20000
      n_top_rows_max <- max(1, floor(max_total_height / single_height))
      max_allowed_M <- n_top_rows_max * top_ncol
      max_allowed_M <- min(max_allowed_M, 100)
      
      if (length(selected_metrics) > max_allowed_M) {
        selected_metrics <- selected_metrics[1:max_allowed_M]
      }
      
      plots <- list()
      for (m in selected_metrics) {
        p_m <- generate_grid_plot(df_allmetrics, m, "Value", m)
        if (!is.null(p_m)) {
          plots[[length(plots) + 1]] <- patchwork::wrap_elements(p_m)
        }
      }
      
      if (length(plots) == 0) {
        return(
          ggplot() + 
            theme_void() + 
            labs(title = "No individual lipids to display.") +
            theme(plot.title = element_text(size = 12, face = "bold", hjust = 0.5))
        )
      }
      
      combined <- patchwork::wrap_plots(plots, ncol = top_ncol)
      return(combined)
    })
    
    output$allmetrics_plot <- renderPlot({
      allmetricsPlotReactive()
    }, height = get_allmetrics_plot_height)
    
    output$allmetrics_status <- renderUI({
      df_allmetrics <- allMetricsData()
      if (is.null(df_allmetrics)) return(NULL)
      
      ledger <- tryCatch(ledgerData(), error = function(e) NULL)
      if (is.null(ledger)) return(NULL)
      
      sig_metrics_df <- ledger %>%
        dplyr::filter(Metric_Category == "individual_lipids" & P_Value < 0.05) %>%
        dplyr::arrange(P_Value)
      
      sig_metrics <- unique(sig_metrics_df$Metric_Name)
      
      selected_metrics <- input$selectedAllMetrics
      using_custom_selection <- !is.null(selected_metrics) && length(selected_metrics) > 0
      
      if (!using_custom_selection) {
        selected_metrics <- sig_metrics
      }
      
      total_sig_count <- length(selected_metrics)
      if (total_sig_count == 0) {
        return(div(class = "alert alert-info py-2 px-3 mb-3", "No individual lipids selected/detected to display."))
      }
      
      design <- longitudinal_design()
      layout_mode <- input$patientLayout
      checked_groups <- design$checked_groups
      tcs <- design$designer_cases
      tc_layout <- input$timecourseLayout %||% "single"
      
      if (length(tcs) == 0) {
        single_height <- 350
      } else if (tc_layout == "separate") {
        n_rows <- if (layout_mode == "all") (length(checked_groups) + 1) else 1
        single_height <- max(350, n_rows * 300)
      } else {
        if (layout_mode == "all") {
          n_plots <- length(checked_groups) + 1
          n_rows <- ceiling(n_plots / 3)
          single_height <- max(350, n_rows * 350)
        } else {
          single_height <- 350
        }
      }
      
      ncol_metric <- if (length(tcs) == 0) {
        1
      } else if (tc_layout == "separate") {
        length(tcs)
      } else if (layout_mode == "all") {
        3
      } else {
        1
      }
      
      top_ncol <- if (ncol_metric == 1) {
        3
      } else if (ncol_metric == 2) {
        2
      } else {
        1
      }
      
      max_total_height <- 20000
      n_top_rows_max <- max(1, floor(max_total_height / single_height))
      max_allowed_M <- n_top_rows_max * top_ncol
      max_allowed_M <- min(max_allowed_M, 100)
      
      label_type <- if (using_custom_selection) "selected" else "significant"
      
      if (total_sig_count > max_allowed_M) {
        div(class = "alert alert-warning py-2 px-3 mb-3",
          style = "font-size: 0.9rem; line-height: 1.4;",
          icon("triangle-exclamation"),
          sprintf(" Showing the top %d of %d %s individual lipids, ordered by p-value. Remaining metrics are truncated to prevent rendering errors (max height cap of %dpx reached).", 
                  max_allowed_M, total_sig_count, label_type, max_total_height)
        )
      } else {
        div(class = "alert alert-success py-2 px-3 mb-3",
          style = "font-size: 0.9rem; line-height: 1.4;",
          icon("circle-check"),
          sprintf(" Showing all %d %s individual lipids organized in a %d-column grid.", 
                  total_sig_count, label_type, top_ncol)
        )
      }
    })
    
    # Significance Ledger Table
    output$ledger_table <- DT::renderDT({
      message("[DEBUG longitudinal] renderDT ledger_table triggered")
      df <- ledgerData()
      req(df)
      DT::datatable(df, options = list(pageLength = 10, scrollX = TRUE, order = list(list(3, 'asc'))), rownames = FALSE) %>%
        DT::formatRound(columns = c("P_Value"), digits = 4) %>%
        DT::formatStyle("Direction", color = DT::styleEqual(c("Up", "Down"), c("#FC4E2A", "#1D91C0")))
    })
    
    # -------------------------------------------------------------------------
    # 7. Exporters & Download Handlers
    # -------------------------------------------------------------------------
    activePlotReactive <- reactive({
      tab <- input$longitudinal_tabs
      if (tab %in% c("Lipid Categories", "Macroclasses")) {
        macroclassPlotReactive()
      } else if (tab %in% c("Lipid Main Classes", "Subclasses")) {
        subclassPlotReactive()
      } else if (tab == "Functional Indices") {
        indexPlotReactive()
      } else if (tab == "Structural Features") {
        structPlotReactive()
      } else if (tab == "All Metrics") {
        allmetricsPlotReactive()
      } else {
        NULL
      }
    })
    
    output$downloadPlot <- downloadHandler(
      filename = function() {
        tab <- input$longitudinal_tabs
        m_name <- switch(tab,
          "Lipid Categories" = input$selectedMacroclass,
          "Macroclasses" = input$selectedMacroclass,
          "Lipid Main Classes" = input$selectedSubclass,
          "Subclasses" = input$selectedSubclass,
          "Functional Indices" = input$selectedIndex,
          "Structural Features" = input$selectedStructFeature,
          "All Metrics" = "all_significant_lipids",
          "plot"
        )
        paste0("longitudinal_", tolower(tab), "_", gsub(" ", "_", m_name), ".pdf")
      },
      content = function(file) {
        tab <- input$longitudinal_tabs
        p <- activePlotReactive()
        req(p)
        
        design <- longitudinal_design()
        layout_mode <- input$patientLayout
        checked_groups <- design$checked_groups
        tcs <- design$designer_cases
        tc_layout <- input$timecourseLayout %||% "single"
        
        if (tab == "All Metrics") {
          selected_metrics <- input$selectedAllMetrics
          if (is.null(selected_metrics) || length(selected_metrics) == 0) {
            ledger <- tryCatch(ledgerData(), error = function(e) NULL)
            selected_metrics <- if (!is.null(ledger)) {
              ledger %>%
                dplyr::filter(Metric_Category == "individual_lipids" & P_Value < 0.05) %>%
                dplyr::pull(Metric_Name) %>%
                unique()
            } else {
              character()
            }
          }
          
          if (tc_layout == "separate") {
            ncol_val <- length(tcs)
            nrow_val <- if (layout_mode == "all") (length(checked_groups) + 1) else 1
            single_w <- ncol_val * 4.5 + 1.5
            single_h <- nrow_val * 3.5 + 0.5
          } else {
            if (layout_mode == "all") {
              n_plots <- length(checked_groups) + 1
              n_rows <- ceiling(n_plots / 3)
              single_w <- 11.5
              single_h <- max(4.5, n_rows * 4.2)
            } else {
              single_w <- 5.0
              single_h <- 4.2
            }
          }
          
          ncol_metric <- if (length(tcs) == 0) {
            1
          } else if (tc_layout == "separate") {
            length(tcs)
          } else if (layout_mode == "all") {
            3
          } else {
            1
          }
          
          top_ncol <- if (ncol_metric == 1) {
            3
          } else if (ncol_metric == 2) {
            2
          } else {
            1
          }
          
          max_total_height <- 20000
          if (length(tcs) == 0) {
            single_height_px <- 350
          } else if (tc_layout == "separate") {
            n_rows_px <- if (layout_mode == "all") (length(checked_groups) + 1) else 1
            single_height_px <- max(350, n_rows_px * 300)
          } else {
            if (layout_mode == "all") {
              n_plots_px <- length(checked_groups) + 1
              n_rows_px <- ceiling(n_plots_px / 3)
              single_height_px <- max(350, n_rows_px * 350)
            } else {
              single_height_px <- 350
            }
          }
          
          n_top_rows_max <- max(1, floor(max_total_height / single_height_px))
          max_allowed_M <- n_top_rows_max * top_ncol
          max_allowed_M <- min(max_allowed_M, 100)
          
          total_sig_count <- length(selected_metrics)
          if (total_sig_count > max_allowed_M) {
            selected_metrics <- selected_metrics[1:max_allowed_M]
          }
          
          M <- length(selected_metrics)
          if (M == 0) M <- 1
          
          n_top_rows <- ceiling(M / top_ncol)
          
          w_in <- if (top_ncol == 3) {
            single_w * 3
          } else if (top_ncol == 2) {
            single_w * 2
          } else {
            single_w
          }
          h_in <- n_top_rows * single_h
        } else {
          plot_name <- switch(tab,
            "Lipid Categories" = "macroclass_plot",
            "Macroclasses" = "macroclass_plot",
            "Lipid Main Classes" = "subclass_plot",
            "Subclasses" = "subclass_plot",
            "Functional Indices" = "index_plot",
            "Structural Features" = "struct_plot",
            "macroclass_plot"
          )
          size_val <- input[[paste0(plot_name, "_size")]]
          w <- session$clientData[[paste0("output_", session$ns(plot_name), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns(plot_name), "_height")]]
          if (!is.null(size_val)) {
            w <- size_val$width
            h <- size_val$height
          }
          
          if (!is.null(w) && !is.null(h) && w > 10) {
            w_in <- w / 72
            h_in <- h / 72
          } else {
            w_in <- 11.5
            h_in <- 10.5
            
            if (tc_layout == "separate") {
              ncol_val <- length(tcs)
              nrow_val <- if (layout_mode == "all") (length(checked_groups) + 1) else 1
              w_in <- ncol_val * 4.5 + 1.5
              h_in <- nrow_val * 3.5 + 0.5
            } else {
              if (layout_mode == "all") {
                n_plots <- length(checked_groups) + 1
                n_rows <- ceiling(n_plots / 3)
                if (n_plots == 1) {
                  w_in <- 4.5; h_in <- 4.2
                } else if (n_plots == 2) {
                  w_in <- 8.0; h_in <- 4.2
                } else {
                  w_in <- 11.5; h_in <- max(4.5, n_rows * 4.2)
                }
              } else {
                w_in <- 11.5; h_in <- 4.2
              }
            }
          }
        }
        
        ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
      }
    )
    
    output$downloadCSV <- downloadHandler(
      filename = function() {
        tab <- input$longitudinal_tabs
        m_name <- switch(tab,
          "Lipid Categories" = input$selectedMacroclass,
          "Macroclasses" = input$selectedMacroclass,
          "Lipid Main Classes" = input$selectedSubclass,
          "Subclasses" = input$selectedSubclass,
          "Functional Indices" = input$selectedIndex,
          "Structural Features" = input$selectedStructFeature,
          "All Metrics" = "all_significant_lipids",
          "data"
        )
        paste0("longitudinal_", tolower(tab), "_", gsub(" ", "_", m_name), ".csv")
      },
      content = function(file) {
        tab <- input$longitudinal_tabs
        df_meta <- shared_data$all_metadata()
        req(df_meta)
        
        df_meta$Cohort <- resolve_longitudinal_cohort(df_meta)
        if (!"Patient_ID" %in% names(df_meta)) {
          df_meta$Patient_ID <- df_meta$PatientNumber
        }
        if (!"Sample_ID" %in% names(df_meta)) {
          df_meta$Sample_ID <- df_meta$FullName
        }
        
        design <- longitudinal_design()
        checked_groups <- design$checked_groups
        
        # Compile patient list based on selection
        layout_mode <- input$patientLayout
        target_pts <- if (layout_mode == "all") {
          if (length(checked_groups) == 0) {
            all_patients_clean()
          } else {
            unique(unlist(lapply(checked_groups, function(x) x$pts)))
          }
        } else {
          idx <- which(sapply(checked_groups, function(g) g$id == layout_mode))
          if (length(idx) > 0) {
            checked_groups[[idx]]$pts
          } else {
            get_group_pts_safe(layout_mode)
          }
        }
        
        filter_complete_cases <- function(df, tab_metric) {
          tcs <- design$designer_cases
          
          if (length(tcs) == 0) return(df %>% dplyr::filter(FALSE))
          
          ch_selected <- unique(unlist(lapply(tcs, function(x) x$items)))
          res_df <- df %>%
            dplyr::filter(Patient_ID %in% target_pts & Cohort %in% ch_selected)
          
          res_df_list <- list()
          for (i in seq_along(tcs)) {
            tc_cohorts <- tcs[[i]]$items
            tc_df <- res_df %>%
              dplyr::filter(Cohort %in% tc_cohorts) %>%
              dplyr::mutate(Timecourse_ID = i, Timecourse_Name = tcs[[i]]$name)
            res_df_list[[length(res_df_list) + 1]] <- tc_df
          }
          
          if (length(res_df_list) == 0) return(df %>% dplyr::filter(FALSE))
          return(dplyr::bind_rows(res_df_list))
        }
        
        if (tab %in% c("Lipid Categories", "Macroclasses")) {
          df_metric <- macroclassSumsData() %>% dplyr::filter(Metric_Name == input$selectedMacroclass)
          df <- filter_complete_cases(df_metric, input$selectedMacroclass)
        } else if (tab %in% c("Lipid Main Classes", "Subclasses")) {
          df_metric <- subclassSumsData() %>% dplyr::filter(Metric_Name == input$selectedSubclass)
          df <- filter_complete_cases(df_metric, input$selectedSubclass)
        } else if (tab == "Functional Indices") {
          df_full <- indicesData()
          meta_cols <- c("Sample_ID", "Cohort", "Patient_ID", "Group1", "Group2", "Replicate", "PatientNumber", "TimePoint", "TimePoint_Group1", "FullName", "DisplayLabel", "Cluster")
          cols_keep <- c(meta_cols, input$selectedIndex)
          df_metric <- df_full[, cols_keep, drop = FALSE] %>% dplyr::filter(!is.na(.data[[input$selectedIndex]]))
          df <- filter_complete_cases(df_metric, input$selectedIndex)
        } else if (tab == "Structural Features") {
          df_metric <- structFeaturesData() %>% dplyr::filter(Metric_Name == input$selectedStructFeature)
          df <- filter_complete_cases(df_metric, input$selectedStructFeature)
        } else if (tab == "All Metrics") {
          selected_metrics <- input$selectedAllMetrics
          if (is.null(selected_metrics) || length(selected_metrics) == 0) {
            ledger <- tryCatch(ledgerData(), error = function(e) NULL)
            selected_metrics <- if (!is.null(ledger)) {
              ledger %>%
                dplyr::filter(Metric_Category == "individual_lipids" & P_Value < 0.05) %>%
                dplyr::pull(Metric_Name) %>%
                unique()
            } else {
              character()
            }
          }
          df_metric <- allMetricsData() %>% dplyr::filter(Metric_Name %in% selected_metrics)
          df <- filter_complete_cases(df_metric, "All_Significant_Lipids")
        } else {
          df <- ledgerData()
        }
        
        write.csv(df, file, row.names = FALSE)
      }
    )
    
    longitudinal_selected_features <- reactive({
      tab <- input$longitudinal_tabs %||% "Lipid Categories"
      if (tab %in% c("Lipid Categories", "Macroclasses")) {
        input$selectedMacroclass
      } else if (tab %in% c("Lipid Main Classes", "Subclasses")) {
        input$selectedSubclass
      } else if (tab == "Functional Indices") {
        input$selectedIndex
      } else if (tab == "Structural Features") {
        input$selectedStructFeature
      } else if (tab == "All Metrics") {
        input$selectedAllMetrics
      } else {
        character()
      }
    })

    render_stat_note_fn <- function() {
      local_method <- input$localStatMethod %||% "auto"
      resolved_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      get_journal_caption("longitudinal", resolved_method, shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info(), selected_features = longitudinal_selected_features())
    }
    output$longitudinal_stat_note_1 <- renderUI({ render_stat_note_fn() })
    output$longitudinal_stat_note_2 <- renderUI({ render_stat_note_fn() })
    output$longitudinal_stat_note_3 <- renderUI({ render_stat_note_fn() })
    output$longitudinal_stat_note_4 <- renderUI({ render_stat_note_fn() })
    output$longitudinal_stat_note_5 <- renderUI({ render_stat_note_fn() })
    output$longitudinal_stat_note <- renderUI({ render_stat_note_fn() })
    
    observeEvent(input$show_stats_detail, {
      # Determine active subtab
      tab <- input$longitudinal_tabs %||% "Lipid Categories"
      
      selected_metrics <- character()
      if (tab %in% c("Lipid Categories", "Macroclasses")) {
        selected_metrics <- input$selectedMacroclass
      } else if (tab %in% c("Lipid Main Classes", "Subclasses")) {
        selected_metrics <- input$selectedSubclass
      } else if (tab == "Functional Indices") {
        selected_metrics <- input$selectedIndex
      } else if (tab == "Structural Features") {
        selected_metrics <- input$selectedStructFeature
      } else if (tab == "All Metrics") {
        selected_metrics <- input$selectedAllMetrics
      }
      
      trans <- tryCatch(transitions_list(), error = function(e) list())
      
      local_method <- input$localStatMethod %||% "auto"
      actual_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      base_method <- gsub("^auto_", "", actual_method)
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: LONGITUDINAL TRAJECTORIES\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. VISUALIZATION SETTINGS\n",
        "   - Longitudinal Tab:     ", tab, "\n",
        "   - Patient Layout:       ", input$patientLayout %||% "all", "\n",
        "   - Timecourse Layout:    ", input$timecourseLayout %||% "single", "\n",
        "   - Patient Filter Mode:  ", input$patientFilterMode %||% "all_dots", "\n",
        "   - Selected Metrics:     ", paste(selected_metrics, collapse = ", "), "\n",
        "   - Designed Transitions: ", length(trans), "\n",
        "   - Statistical Test:     ", actual_method, " (local pairwise)\n\n",
        "2. MATHEMATICAL FORMULATION & PAIRED CALCULUS\n",
        "   For each designed transition from Cohort G1 to Cohort G2:\n\n",
        "   1. Pairing Constraint (Complete Case Analysis):\n",
        "      Only patients with valid measurements at both G1 and G2 are included.\n",
        "      Let N_p be the number of patients with complete data for both cohorts.\n\n"
      )
      
      if (base_method == "non_parametric") {
        msg <- paste0(
          msg,
          "   2. Non-Parametric Test: Wilcoxon Signed-Rank Test (paired comparison)\n",
          "      - For each of the N_p patients, calculate the difference: d_i = Y_i,G2 - Y_i,G1.\n",
          "      - Exclude any difference where d_i = 0. Let N_r be the number of non-zero differences.\n",
          "      - Rank the remaining absolute differences |d_i| from 1 to N_r (assigning average ranks for ties).\n",
          "      - Assign the original sign of each difference to its rank.\n",
          "      - Compute the sum of positive ranks: W+ = sum_{d_i > 0} R_i.\n",
          "      - Compute normal approximation (if N_r >= 10):\n",
          "          Expected Mean (mu_W) = N_r * (N_r + 1) / 4\n",
          "          Expected Variance (sigma_W^2) = N_r * (N_r + 1) * (2*N_r + 1) / 24\n",
          "          Z = (W+ - mu_W - 0.5) / sqrt(sigma_W^2)  (with continuity correction)\n",
          "      - Compute two-tailed p-value from standard normal distribution.\n"
        )
      } else {
        msg <- paste0(
          msg,
          "   2. Paired Differences:\n",
          "      For each patient 'i' (from 1 to N_p):\n",
          "          d_i = Y_i,G2 - Y_i,G1\n",
          "      where Y_i,G1 and Y_i,G2 represent the metric abundance values at G1 and G2 respectively.\n\n",
          "   3. Mean Paired Difference:\n",
          "          Mean_Diff = (1 / N_p) * sum_{i=1}^{N_p} d_i\n\n",
          "   4. Standard Deviation of Differences:\n",
          "          SD_Diff = sqrt( (1 / (N_p - 1)) * sum_{i=1}^{N_p} (d_i - Mean_Diff)^2 )\n\n",
          "   5. Paired Student's t-statistic:\n",
          "          t = Mean_Diff / ( SD_Diff / sqrt(N_p) )\n\n",
          "   6. Significance Testing (Two-tailed Paired t-test):\n",
          "      The p-value is computed from a Student's t-distribution with df = N_p - 1 degrees of freedom:\n",
          "          p = 2 * P( T_(N_p-1) >= |t| )\n"
        )
      }
      
      if (length(trans) > 0) {
        msg <- paste0(msg, "\n3. ACTIVE DESIGNED TRANSITIONS:\n")
        for (tr in trans) {
          msg <- paste0(msg, "   - Transition '", tr$label, "': Comparing Cohort '", tr$g2, "' vs '", tr$g1, "' (N_paired_patients = ", length(tr$pts), ")\n")
        }
      } else {
        msg <- paste0(msg, "\n3. No active transitions have been designed in the sidebar yet.\n")
      }
      
      msg <- paste0(msg, "\n==================================================\n")
      
      msg <- paste0(msg, "\n", get_stats_console_method_summary(shared_data))
      
      # Write to stats_detail_text and display modal overlay
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Longitudinal Trajectories")
    })
    
  })
}
