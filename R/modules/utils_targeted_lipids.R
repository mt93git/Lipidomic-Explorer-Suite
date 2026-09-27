# R/modules/utils_targeted_lipids.R
# Global Targeted Lipid Cohort Selection Hub
# Provides Navbar Hub, Floating Persistent Indicator, Dual-Mode Modal (DT & Paste),
# and reactive synchronization with shared_data.

# ==============================================================================
# UI Component: Navbar Control Hub
# ==============================================================================
targeted_lipids_hub_ui <- function(id) {
  ns <- NS(id)
  
  tags$div(
    id = ns("hub_wrapper"),
    class = "targeted-lipids-hub-container d-flex align-items-center justify-content-end",
    uiOutput(ns("scope_pill_ui"))
  )
}

# ==============================================================================
# UI Component: Floating Persistent Indicator
# ==============================================================================
targeted_lipids_floating_indicator_ui <- function(id) {
  ns <- NS(id)
  uiOutput(ns("floating_indicator"))
}

# ==============================================================================
# Modal Dialog Generator
# ==============================================================================
render_targeted_lipids_modal <- function(session, ns) {
  modalDialog(
    title = tagList(
      icon("bullseye", class = "text-primary me-2"),
      tags$strong("Targeted Lipid Cohort Selection Hub"),
      tags$span(class = "badge bg-light text-secondary border ms-2 font-monospace", "Global Isolation")
    ),
    size = "xl",
    easyClose = TRUE,
    fade = TRUE,
    
    # Modal Content Body
    tags$div(
      class = "targeted-lipids-modal-content",
      
      # Top Description & Instructions Banner
      tags$div(
        class = "alert alert-light border py-2 px-3 mb-3 d-flex align-items-center justify-content-between",
        tags$div(
          tags$div(
            class = "fw-semibold text-dark",
            icon("filter", class = "text-primary me-1"),
            "Isolate a single lipid or a custom multi-lipid cohort to enforce globally across all analytical, statistical, structural, and mathematical modules."
          ),
          tags$div(
            class = "small text-muted",
            "Beyond single lipid analysis: use the searchable table to select individual or multiple rows, or paste an external list of lipid identifiers."
          )
        ),
        uiOutput(ns("modal_cohort_stats_badge"))
      ),
      
      # Active Selection Summary Bar & Action Strip (Live Building List)
      tags$div(
        class = "card bg-light-subtle border-1 mb-3",
        tags$div(
          class = "card-body py-2 px-3",
          tags$div(
            class = "d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2",
            tags$div(
              class = "d-flex align-items-center gap-2",
              tags$span(class = "fw-bold small text-dark", icon("layer-group", class = "text-primary me-1"), "Targeted Cohort (Live Building List):"),
              uiOutput(ns("selected_count_badge"), inline = TRUE)
            ),
            tags$div(
              class = "d-flex align-items-center gap-1",
              actionButton(ns("btn_select_all"), "Select All", icon = icon("check-double"), class = "btn btn-xs btn-outline-secondary py-0 px-2", style = "font-size: 0.75rem;"),
              actionButton(ns("btn_clear_sel"), "Clear Cohort", icon = icon("trash-can"), class = "btn btn-xs btn-outline-danger py-0 px-2", style = "font-size: 0.75rem;"),
              actionButton(ns("btn_invert_sel"), "Invert", icon = icon("arrows-rotate"), class = "btn btn-xs btn-outline-secondary py-0 px-2", style = "font-size: 0.75rem;")
            )
          ),
          # Removable Chips Strip
          tags$div(
            id = ns("selected_chips_container"),
            class = "targeted-chips-scrollbox p-2 border rounded bg-white",
            style = "max-height: 100px; overflow-y: auto; min-height: 38px;",
            uiOutput(ns("selected_chips_list"))
          )
        )
      ),
      
      # Navset Tabs: Interactive Table vs Direct Paste
      bslib::navset_card_tab(
        id = ns("input_mode_tabs"),
        
        # TAB 1: Interactive Data Table
        bslib::nav_panel(
          title = tagList(icon("table"), " Interactive Data Table (DT)"),
          value = "table_mode",
          tags$div(
            class = "p-2",
            # Action Toolbar for Table Selection (Add to Target List)
            tags$div(
              class = "d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 mb-2 bg-light border rounded shadow-xs",
              tags$div(
                class = "d-flex align-items-center gap-2",
                tags$span(class = "fw-bold small text-dark", icon("table-list", class = "text-primary me-1"), "Table Rows:"),
                uiOutput(ns("table_highlight_status"), inline = TRUE)
              ),
              tags$div(
                class = "d-flex align-items-center gap-2",
                actionButton(
                  ns("btn_add_table_to_target"),
                  label = tagList(icon("plus-circle"), " Add to Target List"),
                  class = "btn btn-primary btn-sm fw-bold shadow-sm px-3",
                  title = "Add highlighted table rows to the live building list above"
                ),
                actionButton(
                  ns("btn_remove_table_from_target"),
                  label = tagList(icon("minus-circle"), " Remove Selected"),
                  class = "btn btn-outline-danger btn-sm px-2",
                  title = "Remove highlighted table rows from the live building list"
                ),
                actionButton(
                  ns("btn_clear_table_checks"),
                  label = tagList(icon("xmark"), " Deselect Rows"),
                  class = "btn btn-outline-secondary btn-sm px-2",
                  title = "Deselect currently highlighted rows in the table"
                )
              )
            ),
            tags$p(class = "small text-muted mb-2",
              icon("circle-info", class = "text-primary me-1"),
              "Search or filter the table, click rows to highlight lipids, then click 'Add to Target List'. Use Shift+Click for ranges."
            ),
            DT::dataTableOutput(ns("lipids_dt_table"))
          )
        ),
        
        # TAB 2: Direct Paste / Text Input
        bslib::nav_panel(
          title = tagList(icon("paste"), " Direct Paste / Text Input"),
          value = "paste_mode",
          tags$div(
            class = "p-3",
            tags$label(class = "form-label fw-bold small text-dark",
              icon("clipboard", class = "text-primary me-1"),
              "Paste Lipid Identifiers (separated by newlines, commas, semicolons, or tabs):"
            ),
            textAreaInput(
              ns("paste_text_input"),
              label = NULL,
              rows = 7,
              placeholder = "CE(14:0)+NH4\nCE(15:0)+NH4\nPC(16:0/18:1)\nPE(18:0/20:4)\nSM(d18:1/16:0)...",
              width = "100%"
            ),
            # Live Validation Report
            uiOutput(ns("paste_validation_ui")),
            # Paste Actions
            tags$div(
              class = "d-flex align-items-center gap-2 mt-3",
              actionButton(
                ns("btn_paste_replace"),
                "Apply Matched (Replace Selection)",
                icon = icon("check"),
                class = "btn btn-primary btn-sm"
              ),
              actionButton(
                ns("btn_paste_append"),
                "Append Matched to Selection",
                icon = icon("plus"),
                class = "btn btn-outline-primary btn-sm"
              ),
              actionButton(
                ns("btn_paste_clear_input"),
                "Clear Input",
                icon = icon("xmark"),
                class = "btn btn-outline-secondary btn-sm"
              )
            )
          )
        )
      )
    ),
    
    # Modal Footer
    footer = tags$div(
      class = "d-flex align-items-center justify-content-between w-100",
      actionButton(
        ns("modal_reset_full_btn"),
        "Reset to Full Dataset",
        icon = icon("rotate-left"),
        class = "btn btn-outline-danger btn-sm"
      ),
      tags$div(
        class = "d-flex align-items-center gap-2",
        modalButton("Cancel"),
        actionButton(
          ns("modal_apply_btn"),
          "Apply Selection & Enable Single Lipid Analysis Mode",
          icon = icon("check"),
          class = "btn btn-primary btn-sm px-3"
        )
      )
    )
  )
}

# ==============================================================================
# Helper: Fast Vectorized Lipid Nomenclature Summary (<0.02s for 3,000 lipids)
# ==============================================================================
fast_parse_lipids_summary <- function(lipid_names) {
  if (is.null(lipid_names) || length(lipid_names) == 0) {
    return(data.frame(
      Lipid_Name = character(0),
      Class = character(0),
      Category = character(0),
      Total_Carbons = integer(0),
      Total_DB = integer(0),
      stringsAsFactors = FALSE
    ))
  }
  
  classes <- sub("[( /_\\-].*", "", lipid_names)
  classes[is.na(classes) | !nzchar(classes)] <- "Unknown"
  
  cat_map <- c(
    PC = "GP", PE = "GP", PS = "GP", PI = "GP", PG = "GP", PA = "GP",
    LPC = "GP", LPE = "GP", LPS = "GP", LPI = "GP", LPG = "GP", LPA = "GP",
    PIP = "GP", PIP2 = "GP", PIP3 = "GP",
    TG = "GL", DG = "GL", MG = "GL", TAG = "GL", DAG = "GL", MAG = "GL",
    Cer = "SP", SM = "SP", HexCer = "SP", GlcCer = "SP", GalCer = "SP",
    LacCer = "SP", Sulfatide = "SP", Sphingosine = "SP", SPH = "SP",
    Sphinganine = "SP", CerP = "SP",
    CE = "ST", Chol = "ST", Cholesterol = "ST", DC = "ST", BA = "ST",
    FA = "FA", FFA = "FA", OxFA = "FA", CAR = "FA"
  )
  categories <- unname(cat_map[classes])
  categories[is.na(categories)] <- "Other"
  
  paren_match <- regexec("\\(([^)]+)\\)", lipid_names)
  chains <- regmatches(lipid_names, paren_match)
  
  n <- length(lipid_names)
  total_c <- integer(n)
  total_db <- integer(n)
  
  for (i in seq_len(n)) {
    ch <- chains[[i]]
    if (length(ch) > 1) {
      inner <- ch[2]
      m <- gregexpr("(?:[a-z]+)?(\\d+):(\\d+)", inner, perl = TRUE)
      reg_matches <- regmatches(inner, m)[[1]]
      if (length(reg_matches) > 0) {
        c_sum <- 0L
        db_sum <- 0L
        for (tok in reg_matches) {
          clean_tok <- sub("^[a-z]+", "", tok)
          parts <- strsplit(clean_tok, ":")[[1]]
          if (length(parts) == 2) {
            c_sum <- c_sum + as.integer(parts[1])
            db_sum <- db_sum + as.integer(parts[2])
          }
        }
        total_c[i] <- c_sum
        total_db[i] <- db_sum
      } else {
        total_c[i] <- NA_integer_
        total_db[i] <- NA_integer_
      }
    } else {
      total_c[i] <- NA_integer_
      total_db[i] <- NA_integer_
    }
  }
  
  data.frame(
    Lipid_Name = lipid_names,
    Class = classes,
    Category = categories,
    Total_Carbons = total_c,
    Total_DB = total_db,
    stringsAsFactors = FALSE
  )
}

# ==============================================================================
# Server Logic: Targeted Lipids Hub & Modal Server
# ==============================================================================
targeted_lipids_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    cat("[TARGETED LIPIDS] Server initialized for module:", id, "\n", file = stderr())
    
    # Local reactive state inside modal to avoid committing changes until "Apply"
    local_selected <- reactiveVal(character(0))
    parent_sess <- if (!is.null(session$parent)) session$parent else session
    
    # Anti-rapid-fire debounce guard (prevents modal collision crashes on rapid clicks)
    last_modal_open_time <- 0
    safe_show_modal <- function(initial_selection = character(0)) {
      now <- as.numeric(Sys.time())
      if ((now - last_modal_open_time) < 0.8) {
        cat("[TARGETED LIPIDS] safe_show_modal: ignoring rapid duplicate click\n", file = stderr())
        return(invisible(NULL))
      }
      last_modal_open_time <<- now
      local_selected(initial_selection)
      showModal(render_targeted_lipids_modal(session, ns), session = parent_sess)
    }
    
    # --------------------------------------------------------------------------
    # 1. Segmented Scope Pill UI (Option 1)
    # --------------------------------------------------------------------------
    output$scope_pill_ui <- renderUI({
      is_active <- isTRUE(shared_data$targeted_mode_active())
      cur_list <- shared_data$targeted_lipids_list()
      n_targeted <- length(cur_list)
      
      # Fast count extraction without invoking heavy master_lipids_data() or annotation pipelines
      raw_obj <- tryCatch(shared_data$rawData(), error = function(e) NULL)
      n_total <- if (!is.null(raw_obj) && !is.null(raw_obj$data)) {
        nrow(raw_obj$data)
      } else {
        0
      }
      if (n_total == 0) {
        m_df <- tryCatch(isolate(master_lipids_data()), error = function(e) NULL)
        n_total <- if (!is.null(m_df)) nrow(m_df) else 0
      }
      
      tags$div(
        class = "targeted-scope-bar d-flex align-items-center gap-2",
        
        # Scope Label (Analytical Ensemble) with Integrated Hover Tooltip Balloon
        tags$div(
          class = "targeted-scope-label-wrapper",
          tags$span(
            class = "targeted-scope-label text-uppercase",
            "Analytical Ensemble:"
          ),
          tags$div(
            class = "targeted-scope-tooltip-balloon",
            tags$div(class = "targeted-tooltip-title", "Analytical Ensemble (Global Matrix Scope)"),
            tags$div(
              class = "targeted-tooltip-body",
              "Beyond single lipid analysis: decide whether to isolate an individual lipid of interest, analyze a custom targeted sub-cohort of lipids, or evaluate the whole dataset across all 12 analytical modules."
            )
          )
        ),
        
        # Continuous Segmented Pill
        tags$div(
          class = "targeted-scope-pill d-inline-flex align-items-center shadow-sm",
          
          # Segment A: All Lipids (Full Dataset)
          tags$button(
            id = ns("btn_scope_all"),
            type = "button",
            class = paste(
              "btn btn-sm targeted-scope-segment targeted-scope-all",
              if (!is_active) "is-active" else "is-inactive"
            ),
            title = "Full Dataset: Run PCA, heatmaps, and statistics on the complete loaded matrix of lipids.",
            onclick = sprintf("Shiny.setInputValue('%s', Math.random(), {priority: 'event'});", ns("click_scope_all")),
            tagList(
              tags$span(class = "fw-bold", "All"),
              if (n_total > 0) tags$span(
                class = "ms-1 targeted-pill-num",
                sprintf("(%s)", format(n_total, big.mark = ","))
              )
            )
          ),
          
            # Segment B: Single Lipid Analysis Mode
            tags$button(
              id = ns("btn_scope_targeted"),
              type = "button",
              class = paste(
                "btn btn-sm targeted-scope-segment targeted-scope-targeted",
                if (is_active) "is-active" else "is-inactive"
              ),
              title = "Single Lipid Analysis Mode: Isolate and restrict all 12 analytical modules to your selected lipids.",
              onclick = sprintf("if (!this.dataset.clicked) { this.dataset.clicked = 'true'; var btn = this; setTimeout(function(){ delete btn.dataset.clicked; }, 800); Shiny.setInputValue('%s', Math.random(), {priority: 'event'}); }", ns("click_scope_targeted")),
              tagList(
                tags$span(class = "fw-bold", "Single Lipid Analysis Mode"),
                tags$span(
                  class = "ms-1 targeted-pill-num",
                  sprintf("(%s)", if (n_targeted > 0) format(n_targeted, big.mark = ",") else "0")
                )
              )
            ),
            
            # Edit Button (Direct Modal Access)
            tags$button(
              id = ns("btn_scope_edit"),
              type = "button",
              class = "btn btn-sm targeted-scope-edit",
              title = "Configure Cohort: Open the searchable DataTable and direct paste tool to customize your lipid cohort.",
              onclick = sprintf("if (!this.dataset.clicked) { this.dataset.clicked = 'true'; var btn = this; setTimeout(function(){ delete btn.dataset.clicked; }, 800); Shiny.setInputValue('%s', Math.random(), {priority: 'event'}); }", ns("click_scope_edit")),
              tags$span(class = "fw-semibold", "Edit")
            )
          )
        )
    })
    outputOptions(output, "scope_pill_ui", suspendWhenHidden = FALSE)
    
    # --------------------------------------------------------------------------
    # 2. Scope Pill Click Handlers
    # --------------------------------------------------------------------------
    observeEvent(input$click_scope_all, {
      cat("[TARGETED LIPIDS] click_scope_all: switching to standard mode (full dataset)\n", file = stderr())
      shared_data$set_targeted_mode(FALSE)
    })
    
    observeEvent(input$click_scope_targeted, {
      cur_list <- shared_data$targeted_lipids_list()
      cat(sprintf("[TARGETED LIPIDS] click_scope_targeted: cur_list length = %d\n", length(cur_list)), file = stderr())
      if (length(cur_list) > 0) {
        shared_data$set_targeted_mode(TRUE)
      } else {
        # Prompt user with modal to select lipids first (debounced)
        safe_show_modal(character(0))
      }
    })
    
    observeEvent(input$click_scope_edit, {
      cat("[TARGETED LIPIDS] click_scope_edit: opening configuration modal\n", file = stderr())
      cur_list <- shared_data$targeted_lipids_list()
      safe_show_modal(cur_list)
    })
    
    # Backward-compatible trigger for any external open_modal_btn calls
    observeEvent(input$open_modal_btn, {
      cat("[TARGETED LIPIDS] open_modal_btn clicked!\n", file = stderr())
      cur_list <- shared_data$targeted_lipids_list()
      safe_show_modal(cur_list)
    })
    
    # --------------------------------------------------------------------------
    # 5. Extract Full Master Lipids Table (Unfiltered) - Fast & Non-Blocking
    # --------------------------------------------------------------------------
    master_lipids_data <- reactive({
      # Priority 1: Use rawData()$data directly (instantaneous, never triggers imputation)
      df_unfiltered <- NULL
      raw_obj <- tryCatch(shared_data$rawData(), error = function(e) NULL)
      if (!is.null(raw_obj) && !is.null(raw_obj$data) && nrow(raw_obj$data) > 0) {
        df_unfiltered <- raw_obj$data
      }
      
      # Priority 2: Fallback to data_processed_unfiltered if rawData is not populated
      if (is.null(df_unfiltered) || nrow(df_unfiltered) == 0) {
        df_unfiltered <- tryCatch({
          if (!is.null(shared_data$data_processed_unfiltered)) {
            shared_data$data_processed_unfiltered()
          } else {
            NULL
          }
        }, error = function(e) NULL)
      }
      
      # Priority 3: Fallback to demo datasets if nothing loaded yet
      if (is.null(df_unfiltered) || nrow(df_unfiltered) == 0) {
        demo_candidates <- c(
          file.path("data", "user_uploads", "demo_global_lipidomics.xlsx"),
          file.path("data", "multiomics_demo_data", "02_LIPID_bone_niche_neutrophils.xlsx")
        )
        for (f in demo_candidates) {
          if (file.exists(f)) {
            tryCatch({
              df_demo <- as.data.frame(readxl::read_excel(f))
              if (ncol(df_demo) > 0 && nrow(df_demo) > 0) {
                df_unfiltered <- df_demo
                break
              }
            }, error = function(e) NULL)
          }
        }
      }
      
      req(df_unfiltered)
      lipid_col <- if ("Lipid_Name" %in% names(df_unfiltered)) "Lipid_Name" else names(df_unfiltered)[1]
      
      lipid_names <- unique(as.character(df_unfiltered[[lipid_col]]))
      lipid_names <- lipid_names[!is.na(lipid_names) & nzchar(lipid_names)]
      
      num_cols <- names(df_unfiltered)[sapply(df_unfiltered, is.numeric)]
      mean_abund <- if (length(num_cols) > 0) {
        row_means <- rowMeans(as.matrix(df_unfiltered[, num_cols, drop = FALSE]), na.rm = TRUE)
        names(row_means) <- as.character(df_unfiltered[[lipid_col]])
        round(row_means[lipid_names], 2)
      } else {
        rep(NA_real_, length(lipid_names))
      }
      
      # Check if annotationData has already been computed without blocking
      anno <- tryCatch({
        if (!is.null(shared_data$annotationData)) {
          # Use isolate to avoid reactive re-evaluation cascades
          isolate(shared_data$annotationData())
        } else {
          NULL
        }
      }, error = function(e) NULL)
      
      if (!is.null(anno) && nrow(anno) > 0 && "Lipid_Name" %in% names(anno)) {
        res_df <- data.frame(
          Lipid_Name = lipid_names,
          Class = "Unknown",
          Category = "Unknown",
          Total_Carbons = NA_integer_,
          Total_DB = NA_integer_,
          Mean_Intensity = unname(mean_abund),
          stringsAsFactors = FALSE
        )
        m <- match(res_df$Lipid_Name, anno$Lipid_Name)
        if ("lipid_class" %in% names(anno)) res_df$Class <- ifelse(!is.na(m), anno$lipid_class[m], "Unknown")
        if ("hyperclass" %in% names(anno)) res_df$Category <- ifelse(!is.na(m), anno$hyperclass[m], "Unknown")
        if ("Total_Carbons" %in% names(anno)) res_df$Total_Carbons <- ifelse(!is.na(m), anno$Total_Carbons[m], NA_integer_)
        if ("Total_DB" %in% names(anno)) res_df$Total_DB <- ifelse(!is.na(m), anno$Total_DB[m], NA_integer_)
      } else {
        # Vectorized fast parsing in <0.02 seconds (zero UI thread freezing)
        parsed_df <- fast_parse_lipids_summary(lipid_names)
        parsed_df$Mean_Intensity <- unname(mean_abund)
        res_df <- parsed_df
      }
      
      res_df
    })
    
    # --------------------------------------------------------------------------
    # 6. Selected Count Badge & Chips in Modal
    # --------------------------------------------------------------------------
    output$modal_cohort_stats_badge <- renderUI({
      m_df <- master_lipids_data()
      total_n <- if (!is.null(m_df)) nrow(m_df) else 0
      tags$span(
        class = "badge bg-secondary-subtle text-secondary border font-monospace",
        sprintf("Total Lipids in Dataset: %d", total_n)
      )
    })
    
    output$selected_count_badge <- renderUI({
      sel <- local_selected()
      m_df <- master_lipids_data()
      total_n <- if (!is.null(m_df)) nrow(m_df) else 0
      n_sel <- length(sel)
      
      if (n_sel > 0) {
        tags$span(
          class = "badge bg-primary text-white font-monospace",
          sprintf("%d / %d Lipids (%.1f%%)", n_sel, total_n, if (total_n > 0) (n_sel / total_n) * 100 else 0)
        )
      } else {
        tags$span(class = "badge bg-light text-muted border font-monospace", "None Selected")
      }
    })
    
    output$selected_chips_list <- renderUI({
      sel <- local_selected()
      if (length(sel) == 0) {
        return(tags$span(class = "text-muted small fst-italic", "No lipids added to target cohort yet. Highlight rows in the table below and click 'Add to Target List', or paste names in Tab 2."))
      }
      
      chips <- lapply(sel, function(lip) {
        tags$span(
          class = "badge bg-white text-dark border d-inline-flex align-items-center gap-1 py-1 px-2 me-1 mb-1 shadow-xs",
          style = "font-size: 0.80rem; font-weight: 500;",
          lip,
          tags$a(
            href = "#",
            class = "remove-chip-link text-decoration-none ms-1",
            style = "font-size: 0.76rem; cursor: pointer; padding: 0 2px;",
            title = paste("Remove", lip),
            onclick = sprintf("Shiny.setInputValue('%s', '%s', {priority: 'event'}); return false;", ns("remove_single_lipid"), lip),
            icon("xmark")
          )
        )
      })
      
      tagList(chips)
    })
    
    observeEvent(input$remove_single_lipid, {
      req(input$remove_single_lipid)
      lip_to_remove <- input$remove_single_lipid
      cur <- local_selected()
      new_sel <- setdiff(cur, lip_to_remove)
      local_selected(new_sel)
      
      # Sync DT row selection if table is displayed
      m_df <- master_lipids_data()
      if (!is.null(m_df)) {
        cur_dt_rows <- input$lipids_dt_table_rows_selected
        row_idx <- which(m_df$Lipid_Name == lip_to_remove)
        if (length(row_idx) > 0 && row_idx %in% cur_dt_rows) {
          remaining_rows <- setdiff(cur_dt_rows, row_idx)
          DT::selectRows(DT::dataTableProxy("lipids_dt_table"), remaining_rows)
        }
      }
    })
    
    # --------------------------------------------------------------------------
    # 7. DT Table Render & Selection Action Handlers
    # --------------------------------------------------------------------------
    output$lipids_dt_table <- DT::renderDataTable({
      df <- master_lipids_data()
      req(df)
      
      # Isolate local_selected() so table only renders initially or when dataset changes,
      # never re-rendering on individual row selections!
      cur_sel <- isolate(local_selected())
      selected_idx <- which(df$Lipid_Name %in% cur_sel)
      
      DT::datatable(
        df,
        selection = list(mode = "multiple", selected = selected_idx),
        rownames = FALSE,
        class = "compact stripe hover border",
        options = list(
          pageLength = 10,
          lengthMenu = c(10, 25, 50, 100),
          autoWidth = FALSE,
          scrollX = TRUE,
          dom = "fltip",
          language = list(
            search = "Filter Table:",
            lengthMenu = "Show _MENU_ lipids"
          )
        )
      )
    })
    
    # Status badge for highlighted rows in DT
    output$table_highlight_status <- renderUI({
      rows <- input$lipids_dt_table_rows_selected
      n <- if (!is.null(rows)) length(rows) else 0
      if (n == 0) {
        tags$span(class = "badge bg-secondary-subtle text-secondary border font-monospace", "0 rows highlighted")
      } else {
        tags$span(
          class = "badge bg-primary-subtle text-primary border border-primary font-monospace fw-bold",
          sprintf("%d row(s) highlighted", n)
        )
      }
    })
    
    # Add highlighted table rows to Target List
    observeEvent(input$btn_add_table_to_target, {
      df <- master_lipids_data()
      req(df)
      rows <- input$lipids_dt_table_rows_selected
      if (is.null(rows) || length(rows) == 0) {
        showNotification("No rows highlighted in the table. Click one or more rows to select them first.", type = "warning", duration = 3)
        return()
      }
      
      selected_lipids <- df$Lipid_Name[rows]
      cur <- local_selected()
      new_lipids <- setdiff(selected_lipids, cur)
      
      if (length(new_lipids) == 0) {
        showNotification(sprintf("All %d selected lipid(s) are already in the Target List.", length(selected_lipids)), type = "message", duration = 3)
        return()
      }
      
      combined <- unique(c(cur, selected_lipids))
      local_selected(combined)
      
      showNotification(
        sprintf("Added %d lipid(s) to Target List. Cohort now contains %d lipids.", length(new_lipids), length(combined)),
        type = "default",
        duration = 3
      )
    })
    
    # Remove highlighted table rows from Target List
    observeEvent(input$btn_remove_table_from_target, {
      df <- master_lipids_data()
      req(df)
      rows <- input$lipids_dt_table_rows_selected
      if (is.null(rows) || length(rows) == 0) {
        showNotification("No rows highlighted in the table to remove.", type = "warning", duration = 3)
        return()
      }
      
      selected_lipids <- df$Lipid_Name[rows]
      cur <- local_selected()
      remaining <- setdiff(cur, selected_lipids)
      removed_count <- length(intersect(cur, selected_lipids))
      
      if (removed_count == 0) {
        showNotification("None of the highlighted rows were in the Target List.", type = "warning", duration = 3)
        return()
      }
      
      local_selected(remaining)
      
      showNotification(
        sprintf("Removed %d lipid(s) from Target List. Cohort now contains %d lipids.", removed_count, length(remaining)),
        type = "message",
        duration = 3
      )
    })
    
    # Deselect Table Rows (clear DT row highlights without altering building list)
    observeEvent(input$btn_clear_table_checks, {
      DT::selectRows(DT::dataTableProxy("lipids_dt_table"), NULL)
    })
    
    # Quick Actions: Select All, Clear All, Invert Selection
    observeEvent(input$btn_select_all, {
      df <- master_lipids_data()
      req(df)
      all_names <- df$Lipid_Name
      local_selected(all_names)
      
      matching_rows <- seq_len(nrow(df))
      cur_dt_rows <- input$lipids_dt_table_rows_selected
      if (!identical(sort(cur_dt_rows), sort(matching_rows))) {
        DT::selectRows(DT::dataTableProxy("lipids_dt_table"), matching_rows)
      }
    })
    
    observeEvent(input$btn_clear_sel, {
      local_selected(character(0))
      
      cur_dt_rows <- input$lipids_dt_table_rows_selected
      if (!is.null(cur_dt_rows) && length(cur_dt_rows) > 0) {
        DT::selectRows(DT::dataTableProxy("lipids_dt_table"), NULL)
      }
    })
    
    observeEvent(input$btn_invert_sel, {
      df <- master_lipids_data()
      req(df)
      cur <- local_selected()
      new_sel <- setdiff(df$Lipid_Name, cur)
      local_selected(new_sel)
      
      matching_rows <- which(df$Lipid_Name %in% new_sel)
      cur_dt_rows <- input$lipids_dt_table_rows_selected
      if (!identical(sort(cur_dt_rows), sort(matching_rows))) {
        DT::selectRows(DT::dataTableProxy("lipids_dt_table"), matching_rows)
      }
    })
    
    # --------------------------------------------------------------------------
    # 8. Direct Paste Validation & Actions
    # --------------------------------------------------------------------------
    parsed_paste_tokens <- reactive({
      raw_txt <- input$paste_text_input %||% ""
      tokens <- unlist(strsplit(raw_txt, "[\r\n,;\t]+"))
      tokens <- trimws(tokens)
      tokens <- tokens[nzchar(tokens)]
      unique(tokens)
    })
    
    output$paste_validation_ui <- renderUI({
      tokens <- parsed_paste_tokens()
      if (length(tokens) == 0) return(NULL)
      
      m_df <- master_lipids_data()
      all_names <- if (!is.null(m_df)) m_df$Lipid_Name else character(0)
      
      matched <- intersect(tokens, all_names)
      unmatched <- setdiff(tokens, all_names)
      
      tags$div(
        class = "paste-validation-feedback mt-3",
        if (length(matched) > 0) {
          tags$div(
            class = "alert alert-success py-2 px-3 small d-flex align-items-center gap-2 mb-2",
            icon("circle-check", class = "text-success fs-6"),
            tags$span(
              tags$strong(sprintf("%d", length(matched))),
              sprintf(" valid lipid identifier(s) successfully recognized in the active dataset.")
            )
          )
        } else {
          tags$div(
            class = "alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-2",
            icon("circle-xmark", class = "text-danger fs-6"),
            tags$span("No recognized lipid identifiers found matching the active dataset.")
          )
        },
        if (length(unmatched) > 0) {
          tags$div(
            class = "alert alert-warning py-2 px-3 small mb-0",
            tags$div(
              class = "fw-bold mb-1 text-warning-emphasis",
              icon("triangle-exclamation", class = "text-warning me-1"),
              sprintf("%d unrecognized identifier(s) not found in dataset:", length(unmatched))
            ),
            tags$div(
              class = "font-monospace text-muted",
              style = "max-height: 60px; overflow-y: auto; font-size: 0.75rem;",
              paste(unmatched, collapse = ", ")
            )
          )
        }
      )
    })
    
    observeEvent(input$btn_paste_replace, {
      tokens <- parsed_paste_tokens()
      req(length(tokens) > 0)
      
      m_df <- master_lipids_data()
      req(m_df)
      matched <- intersect(tokens, m_df$Lipid_Name)
      
      if (length(matched) > 0) {
        local_selected(matched)
        matching_rows <- which(m_df$Lipid_Name %in% matched)
        cur_dt_rows <- input$lipids_dt_table_rows_selected
        if (!identical(sort(cur_dt_rows), sort(matching_rows))) {
          DT::selectRows(DT::dataTableProxy("lipids_dt_table"), matching_rows)
        }
        showNotification(sprintf("Selection replaced with %d matched lipids.", length(matched)), type = "message", duration = 3)
      } else {
        showNotification("No matching lipids found to apply.", type = "warning", duration = 3)
      }
    })
    
    observeEvent(input$btn_paste_append, {
      tokens <- parsed_paste_tokens()
      req(length(tokens) > 0)
      
      m_df <- master_lipids_data()
      req(m_df)
      matched <- intersect(tokens, m_df$Lipid_Name)
      
      if (length(matched) > 0) {
        new_sel <- unique(c(local_selected(), matched))
        local_selected(new_sel)
        matching_rows <- which(m_df$Lipid_Name %in% new_sel)
        cur_dt_rows <- input$lipids_dt_table_rows_selected
        if (!identical(sort(cur_dt_rows), sort(matching_rows))) {
          DT::selectRows(DT::dataTableProxy("lipids_dt_table"), matching_rows)
        }
        showNotification(sprintf("Appended %d lipids. Total selected: %d.", length(matched), length(new_sel)), type = "message", duration = 3)
      } else {
        showNotification("No matching lipids found to append.", type = "warning", duration = 3)
      }
    })
    
    observeEvent(input$btn_paste_clear_input, {
      updateTextAreaInput(session, "paste_text_input", value = "")
    })
    
    # --------------------------------------------------------------------------
    # 9. Modal Commit & Reset
    # --------------------------------------------------------------------------
    observeEvent(input$modal_apply_btn, {
      cur <- local_selected()
      df <- master_lipids_data()
      table_rows <- input$lipids_dt_table_rows_selected
      table_lipids <- if (!is.null(df) && !is.null(table_rows) && length(table_rows) > 0) {
        valid_rows <- table_rows[table_rows >= 1 & table_rows <= nrow(df)]
        df$Lipid_Name[valid_rows]
      } else {
        character(0)
      }
      
      # Merge without duplicates (silently handle doubloons)
      sel <- unique(c(cur, table_lipids))
      sel <- sel[!is.na(sel) & nzchar(sel)]
      
      cat(sprintf("[TARGETED LIPIDS] modal_apply_btn clicked! combined sel length = %d: %s\n", length(sel), paste(sel, collapse = ", ")), file = stderr())
      
      local_selected(sel)
      shared_data$set_targeted_lipids(sel)
      
      if (length(sel) > 0) {
        shared_data$set_targeted_mode(TRUE)
        showNotification(
          tagList(icon("bullseye"), sprintf(" Single Lipid Analysis Mode Enabled: %d lipid(s) isolated across all modules.", length(sel))),
          type = "default",
          duration = 4
        )
      } else {
        shared_data$set_targeted_mode(FALSE)
        showNotification("No lipids selected. Restored Standard Mode (Full Dataset).", type = "warning", duration = 4)
      }
      removeModal(session = parent_sess)
    })
    
    observeEvent(input$modal_reset_full_btn, {
      local_selected(character(0))
      shared_data$set_targeted_lipids(character(0))
      shared_data$set_targeted_mode(FALSE)
      
      m_df <- master_lipids_data()
      if (!is.null(m_df)) {
        cur_dt_rows <- input$lipids_dt_table_rows_selected
        if (!is.null(cur_dt_rows) && length(cur_dt_rows) > 0) {
          DT::selectRows(DT::dataTableProxy("lipids_dt_table"), NULL)
        }
      }
      
      showNotification("Restored Standard Mode across all modules (Full Dataset).", type = "message", duration = 3)
      removeModal(session = parent_sess)
    })
  })
}

# ==============================================================================
# Targeted Mode Plot Fallback Utilities & UI Banners
# ==============================================================================
TARGETED_FALLBACK_MESSAGE <- "Couldn't display the plot with selected lipid; All Matrix has been used; try 'Lipid Class Filters' in 'Cohort and Filter' to get less stringent filtering"

notify_targeted_fallback <- function(session = shiny::getDefaultReactiveDomain(), id = "targeted_fallback") {
  shiny::showNotification(
    TARGETED_FALLBACK_MESSAGE,
    type = "warning",
    duration = 10,
    id = id
  )
}

targeted_fallback_banner_ui <- function(active = TRUE) {
  if (!isTRUE(active)) return(NULL)
  tags$div(
    class = "targeted-fallback-banner mb-2 shadow-xs d-flex align-items-center justify-content-between gap-2",
    style = paste(
      "background: rgba(254, 243, 199, 0.42);",
      "backdrop-filter: blur(6px);",
      "-webkit-backdrop-filter: blur(6px);",
      "border: 1px solid rgba(245, 158, 11, 0.28);",
      "border-left: 3px solid rgba(217, 119, 6, 0.65);",
      "border-radius: 8px;",
      "color: #78350f;",
      "font-size: 0.83rem;",
      "padding: 7px 12px;",
      "transition: opacity 0.2s ease, transform 0.2s ease, margin 0.2s ease;"
    ),
    tags$div(
      class = "d-flex align-items-center gap-2 flex-grow-1",
      icon("circle-info", style = "color: rgba(217, 119, 6, 0.85); font-size: 0.95rem; flex-shrink: 0;"),
      tags$span(
        tags$strong(style = "color: #92400e; font-weight: 650;", "Analytical Notice: "),
        "Couldn't display the plot with selected lipid; ",
        tags$span(
          style = "background: rgba(100, 116, 139, 0.12); color: #334155; border: 1px solid rgba(100, 116, 139, 0.22); border-radius: 4px; font-weight: 550; font-size: 0.76rem; padding: 1px 6px; display: inline-block; vertical-align: baseline;",
          "All Matrix has been used"
        ),
        "; try ",
        tags$strong(style = "color: #92400e;", "'Lipid Class Filters'"),
        " in ",
        tags$strong(style = "color: #92400e;", "'Cohort and Filter'"),
        " to get less stringent filtering."
      )
    ),
    tags$div(
      class = "d-flex align-items-center gap-1 flex-shrink-0",
      tags$button(
        type = "button",
        class = "btn btn-xs targeted-fallback-open-btn d-inline-flex align-items-center gap-1 fw-semibold",
        style = paste(
          "background: rgba(245, 158, 11, 0.15);",
          "border: 1px solid rgba(245, 158, 11, 0.35);",
          "color: #92400e;",
          "font-size: 0.74rem;",
          "border-radius: 6px;",
          "padding: 3px 9px;",
          "white-space: nowrap;",
          "transition: all 0.15s ease;"
        ),
        onmouseover = "this.style.background='rgba(245, 158, 11, 0.28)'; this.style.borderColor='rgba(245, 158, 11, 0.5)';",
        onmouseout = "this.style.background='rgba(245, 158, 11, 0.15)'; this.style.borderColor='rgba(245, 158, 11, 0.35)';",
        onclick = "if(window.pointToElement) { window.pointToElement('#data_hub-hyperclassSelectorUI', 'cohorts', 'Lipid Class Filters', event); }",
        tagList(icon("filter", style = "font-size: 0.7rem;"), "Open Class Filters")
      ),
      tags$button(
        type = "button",
        class = "btn-close-banner ms-1",
        title = "Dismiss notice",
        `aria-label` = "Close",
        style = paste(
          "background: transparent;",
          "border: none;",
          "color: #92400e;",
          "opacity: 0.55;",
          "font-size: 1.15rem;",
          "line-height: 1;",
          "padding: 0 4px;",
          "cursor: pointer;",
          "border-radius: 4px;",
          "display: inline-flex;",
          "align-items: center;",
          "justify-content: center;",
          "transition: opacity 0.15s ease, background 0.15s ease;"
        ),
        onmouseover = "this.style.opacity='1'; this.style.background='rgba(245, 158, 11, 0.25)';",
        onmouseout = "this.style.opacity='0.55'; this.style.background='transparent';",
        onclick = "var b = this.closest('.targeted-fallback-banner'); if(b) { b.style.opacity='0'; b.style.transform='translateY(-4px)'; b.style.marginBottom='0'; setTimeout(function(){ b.remove(); }, 220); }",
        HTML("&times;")
      )
    )
  )
}

