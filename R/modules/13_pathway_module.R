# R/modules/13_pathway_module.R
# Lipid Pathway Visualization Module reproducing LipidCruncher logic

# Curated layout constants for the 28 lipid classes
ALL_PATHWAY_NODES <- list(
  'TG'      = list(x=0.0, y=0.0, label='TAG', lx=-2.5, ly=-1.5),
  'DG'      = list(x=0.0, y=5.0, label='DAG', lx=-4.0, ly=5.5),
  'PA'      = list(x=0.0, y=10.0, label='PA', lx=-3.0, ly=9.5),
  'LPA'     = list(x=0.0, y=15.0, label='LPA', lx=-2.5, ly=14.0),
  'LCB'     = list(x=-10.0, y=15.0, label='LCBs', lx=-13.0, ly=15.0),
  'Cer'     = list(x=-10.0, y=10.0, label='Cer', lx=-12.5, ly=10.0),
  'SM'      = list(x=-10.0, y=5.0, label='SM', lx=-13.0, ly=4.0),
  'PE'      = list(x=4.33, y=-2.5, label='PE', lx=2.5, ly=-1.5),
  'LPE'     = list(x=8.66, y=-5.0, label='LPE', lx=9.5, ly=-6.0),
  'PC'      = list(x=-4.33, y=-2.5, label='PC', lx=-4.0, ly=-2.0),
  'LPC'     = list(x=-8.66, y=-5.0, label='LPC', lx=-12.5, ly=-6.5),
  'PI'      = list(x=10.0, y=15.0, label='PI', lx=11.5, ly=15.5),
  'LPI'     = list(x=13.54, y=18.54, label='LPI', lx=14.5, ly=19.0),
  'CDP-DAG' = list(x=5.0, y=10.0, label='CDP-DAG', lx=2.0, ly=11.5),
  'PG'      = list(x=10.0, y=10.0, label='PG', lx=11.0, ly=9.5),
  'LPG'     = list(x=15.0, y=10.0, label='LPG', lx=16.0, ly=9.5),
  'PS'      = list(x=10.0, y=5.0, label='PS', lx=11.5, ly=4.0),
  'LPS'     = list(x=13.54, y=1.46, label='LPS', lx=14.5, ly=1.0),
  'MAG'     = list(x=0.0, y=-5.0, label='MAG', lx=-1.5, ly=-7.0),
  'dhCer'   = list(x=-10.0, y=12.5, label='dhCer', lx=-9.0, ly=11.5),
  'CerP'    = list(x=-14.0, y=12.0, label='CerP', lx=-18.0, ly=12.0),
  'HexCer'  = list(x=-14.0, y=2.0, label='HexCer', lx=-20.0, ly=3.0),
  'Hex2Cer' = list(x=-18.0, y=-1.0, label='Hex2Cer', lx=-24.5, ly=0.0),
  'Hex3Cer' = list(x=-22.0, y=-4.0, label='Hex3Cer', lx=-24.0, ly=-6.0),
  'ePC'     = list(x=-10.0, y=18.0, label='ePC', lx=-12.5, ly=18.0),
  'ePE'     = list(x=-2.0, y=19.0, label='ePE', lx=-4.5, ly=20.5),
  'CL'      = list(x=17.0, y=13.0, label='CL', lx=18.5, ly=13.0),
  'CE'      = list(x=-5.0, y=16.0, label='CE', lx=-7.5, ly=16.0)
)

ALL_PATHWAY_EDGES <- list(
  c('TG', 'DG'), c('DG', 'PA'), c('PA', 'LPA'),
  c('LCB', 'Cer'), c('Cer', 'SM'),
  c('PA', 'CDP-DAG'), c('CDP-DAG', 'PI'), c('CDP-DAG', 'PG'), c('CDP-DAG', 'PS'),
  c('DG', 'PC'), c('DG', 'PE'), c('PE', 'PS'),
  c('PC', 'LPC'), c('PE', 'LPE'), c('PI', 'LPI'), c('PG', 'LPG'), c('PS', 'LPS'),
  c('DG', 'MAG'), c('LCB', 'dhCer'), c('dhCer', 'Cer'),
  c('Cer', 'CerP'), c('Cer', 'HexCer'), c('HexCer', 'Hex2Cer'),
  c('Hex2Cer', 'Hex3Cer'), c('PG', 'CL')
)

DEFAULT_PATHWAY_CLASSES <- c(
  'TG', 'DG', 'PA', 'LPA', 'LCB', 'Cer', 'SM',
  'PE', 'LPE', 'PC', 'LPC', 'PI', 'LPI',
  'CDP-DAG', 'PG', 'LPG', 'PS', 'LPS'
)

ALL_PATHWAY_CLASSES <- names(ALL_PATHWAY_NODES)

# Reverse mapping from app subclasses to pathway class names
REVERSE_CLASS_MAP <- c(
  "GP_LPC"="LPC", "GP_LPE"="LPE", "GP_LPG"="LPG", "GP_LPI"="LPI", "GP_LPS"="LPS",
  "GP_PC"="PC", "GP_PE"="PE", "GP_PG"="PG", "GP_PI"="PI", "GP_PS"="PS", "GP_PA"="PA",
  "GP_LPA"="LPA", "GP_CL"="CL", "ST_CE"="CE", "SP_Cer"="Cer",
  "SP_GlcCer"="HexCer", "SP_SM"="SM", "GL_DAG"="DG", "GL_TAG"="TG"
)

# UI Definition
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

# Server Logic
pathway_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    
    # Track container dimensions for resizable WYSIWYG download parity
    plot_dims <- reactiveValues(
      pathway = list(width = 800, height = 700)
    )
    observeEvent(input$pathwayPlot_size, {
      plot_dims$pathway <- input$pathwayPlot_size
    })
    
    # -------------------------------------------------------------
    # State Machine Accessors (from hidden JSON fields)
    # -------------------------------------------------------------
    # Safe parsing helper functions for session restore compatibility
    safe_parse_classes <- function(val) {
      if (is.null(val) || length(val) == 0) return(DEFAULT_PATHWAY_CLASSES)
      if (is.list(val)) val <- unlist(val)
      if (is.character(val) && length(val) > 1) return(val)
      if (is.character(val) && length(val) == 1) {
        val <- trimws(val)
        if (val == "" || val == "[]" || val == "{}" || val == "[object Object]") return(DEFAULT_PATHWAY_CLASSES)
        parsed <- tryCatch({
          jsonlite::fromJSON(val)
        }, error = function(e) {
          if (grepl(",", val)) {
            parts <- trimws(strsplit(val, ",")[[1]])
            return(parts[parts != ""])
          }
          return(NULL)
        })
        if (!is.null(parsed)) {
          if (is.list(parsed)) parsed <- unlist(parsed)
          if (is.character(parsed) && length(parsed) > 0) return(parsed)
        }
      }
      return(DEFAULT_PATHWAY_CLASSES)
    }
    
    safe_parse_list <- function(val) {
      if (is.null(val) || length(val) == 0) return(list())
      if (is.list(val)) {
        return(lapply(val, unlist))
      }
      if (is.character(val) && length(val) == 1) {
        val <- trimws(val)
        if (val == "" || val == "[]" || val == "{}" || val == "[object Object]") return(list())
        parsed <- tryCatch({
          jsonlite::fromJSON(val, simplifyVector = FALSE)
        }, error = function(e) {
          return(list())
        })
        if (is.list(parsed)) {
          return(lapply(parsed, unlist))
        }
      }
      return(list())
    }

    active_classes <- reactive({
      safe_parse_classes(input$active_classes_json)
    })
    
    custom_nodes <- reactive({
      safe_parse_list(input$custom_nodes_json)
    })
    
    added_edges <- reactive({
      safe_parse_list(input$added_edges_json)
    })
    
    removed_edges <- reactive({
      safe_parse_list(input$removed_edges_json)
    })
    
    position_overrides <- reactive({
      safe_parse_list(input$position_overrides_json)
    })
    
    # -------------------------------------------------------------
    # Helper functions to query node positions & edges
    # -------------------------------------------------------------
    get_current_pos <- function(node) {
      overrides <- position_overrides()
      if (node %in% names(overrides)) {
        return(as.numeric(overrides[[node]]))
      }
      c_nodes <- custom_nodes()
      if (node %in% names(c_nodes)) {
        return(as.numeric(c_nodes[[node]]))
      }
      if (node %in% names(ALL_PATHWAY_NODES)) {
        return(c(ALL_PATHWAY_NODES[[node]]$x, ALL_PATHWAY_NODES[[node]]$y))
      }
      return(c(0.0, 0.0))
    }
    
    get_current_label_pos <- function(node) {
      overrides <- position_overrides()
      if (node %in% names(overrides)) {
        pos <- as.numeric(overrides[[node]])
        return(auto_label_pos(pos[1], pos[2], node))
      }
      c_nodes <- custom_nodes()
      if (node %in% names(c_nodes)) {
        pos <- as.numeric(c_nodes[[node]])
        return(auto_label_pos(pos[1], pos[2], node))
      }
      if (node %in% names(ALL_PATHWAY_NODES)) {
        return(c(ALL_PATHWAY_NODES[[node]]$lx, ALL_PATHWAY_NODES[[node]]$ly))
      }
      return(c(0.0, 0.0))
    }
    
    auto_label_pos <- function(x, y, label) {
      if (x <= 0) {
        lx <- x - nchar(label) * 0.6 - 1.5
      } else {
        lx <- x + 1.5
      }
      ly <- y - 1.5
      return(c(lx, ly))
    }
    
    compute_current_edges <- reactive({
      active <- active_classes()
      active_set <- setNames(rep(TRUE, length(active)), active)
      
      edges <- list()
      removed <- removed_edges()
      
      for (e in ALL_PATHWAY_EDGES) {
        is_removed <- FALSE
        for (re in removed) {
          if ((re[1] == e[1] && re[2] == e[2]) || (re[1] == e[2] && re[2] == e[1])) {
            is_removed <- TRUE
            break
          }
        }
        if (!is_removed) {
          if (e[1] %in% names(active_set) && e[2] %in% names(active_set)) {
            edges[[length(edges) + 1]] <- e
          }
        }
      }
      
      for (ae in added_edges()) {
        if (ae[1] %in% names(active_set) && ae[2] %in% names(active_set)) {
          already_exists <- FALSE
          for (e in edges) {
            if ((e[1] == ae[1] && e[2] == ae[2]) || (e[1] == ae[2] && e[2] == ae[1])) {
              already_exists <- TRUE
              break
            }
          }
          if (!already_exists) {
            edges[[length(edges) + 1]] <- ae
          }
        }
      }
      return(edges)
    })
    
    # -------------------------------------------------------------
    # UI Renderers for selectors
    # -------------------------------------------------------------
    output$contrastInfoUI <- renderUI({
      contrast <- shared_data$de_contrast_info()
      if (is.null(contrast)) {
        return(div(class = "alert alert-warning p-2 small m-0", "No comparison groups selected in panel 3."))
      }
      div(
        tags$b("Active Comparison:"), br(),
        tags$span(class = "badge bg-primary", paste(contrast$comp, collapse = ", ")),
        tags$span(" vs "),
        tags$span(class = "badge bg-secondary", paste(contrast$ref, collapse = ", "))
      )
    })
    
    detected_classes <- reactive({
      req(shared_data$data_processed(), shared_data$annotationData())
      anno <- shared_data$annotationData()
      processed_log2 <- shared_data$data_processed()
      
      valid_species <- intersect(anno$Lipid_Name, processed_log2$Lipid_Name)
      if (length(valid_species) == 0) return(character(0))
      
      sub_anno <- anno[anno$Lipid_Name %in% valid_species, ]
      p_classes <- sapply(seq_len(nrow(sub_anno)), function(i) {
        map_species_to_pathway_class(sub_anno$subclass[i], sub_anno$modification[i])
      })
      unique(p_classes[!is.na(p_classes)])
    })

    output$activeClassesSelectorUI <- renderUI({
      curated <- ALL_PATHWAY_CLASSES
      custom <- names(custom_nodes())
      all_available <- unique(c(curated, custom))
      
      if (isTRUE(input$only_detected_classes)) {
        det <- detected_classes()
        all_available <- intersect(all_available, det)
      }
      
      choices_list <- as.list(all_available)
      if (identical(input$classLabelFormat %||% "short", "full")) {
        names(choices_list) <- sapply(all_available, get_full_class_name)
      } else {
        names(choices_list) <- sapply(all_available, get_short_class_name)
      }
      
      selectInput(ns("active_classes_select"), "Classes to Display:", choices = choices_list, selected = intersect(active_classes(), all_available), multiple = TRUE, width = "100%")
    })
    
    observeEvent(input$active_classes_select, {
      if (!identical(sort(active_classes()), sort(input$active_classes_select))) {
        updateTextInput(session, "active_classes_json", value = jsonlite::toJSON(input$active_classes_select))
      }
    }, ignoreNULL = FALSE)
    
    output$moveNodeSelectorUI <- renderUI({
      selectInput(ns("move_node_select"), "Select Node to Move:", choices = active_classes())
    })
    
    observe({
      node <- input$move_node_select
      req(node)
      pos <- get_current_pos(node)
      updateNumericInput(session, "move_x", value = pos[1])
      updateNumericInput(session, "move_y", value = pos[2])
    })
    
    output$edgeRemovalUI <- renderUI({
      edges <- compute_current_edges()
      if (length(edges) == 0) {
        return(p("No edges currently present."))
      }
      edge_labels <- sapply(edges, function(e) paste(e[1], "—", e[2]))
      selectInput(ns("edge_to_remove"), "Select Edge to Remove:", choices = edge_labels)
    })
    
    output$edgeAddSourceUI <- renderUI({
      selectInput(ns("add_edge_source"), "Source Node (From):", choices = active_classes())
    })
    
    output$edgeAddTargetUI <- renderUI({
      active <- active_classes()
      src <- input$add_edge_source
      choices <- setdiff(active, src)
      selectInput(ns("add_edge_target"), "Target Node (To):", choices = choices)
    })
    
    # -------------------------------------------------------------
    # Preset click handlers
    # -------------------------------------------------------------
    observeEvent(input$preset_default, {
      selected <- DEFAULT_PATHWAY_CLASSES
      if (isTRUE(input$only_detected_classes)) {
        selected <- intersect(selected, detected_classes())
      }
      updateTextInput(session, "active_classes_json", value = jsonlite::toJSON(selected))
      updateTextInput(session, "custom_nodes_json", value = "{}")
      updateTextInput(session, "added_edges_json", value = "[]")
      updateTextInput(session, "removed_edges_json", value = "[]")
      updateTextInput(session, "position_overrides_json", value = "{}")
    })
    
    observeEvent(input$preset_all, {
      selected <- ALL_PATHWAY_CLASSES
      if (isTRUE(input$only_detected_classes)) {
        selected <- intersect(selected, detected_classes())
      }
      updateTextInput(session, "active_classes_json", value = jsonlite::toJSON(selected))
      updateTextInput(session, "custom_nodes_json", value = "{}")
      updateTextInput(session, "added_edges_json", value = "[]")
      updateTextInput(session, "removed_edges_json", value = "[]")
      updateTextInput(session, "position_overrides_json", value = "{}")
    })
    
    observeEvent(input$preset_clear, {
      updateTextInput(session, "active_classes_json", value = "[]")
      updateTextInput(session, "custom_nodes_json", value = "{}")
      updateTextInput(session, "added_edges_json", value = "[]")
      updateTextInput(session, "removed_edges_json", value = "[]")
      updateTextInput(session, "position_overrides_json", value = "{}")
    })
    
    # -------------------------------------------------------------
    # Add custom node handler
    # -------------------------------------------------------------
    observeEvent(input$add_node_btn, {
      name <- trimws(input$add_node_name)
      req(name != "")
      x <- input$add_node_x
      y <- input$add_node_y
      
      c_nodes <- custom_nodes()
      c_nodes[[name]] <- c(x, y)
      updateTextInput(session, "custom_nodes_json", value = jsonlite::toJSON(c_nodes, auto_unbox = TRUE))
      
      active <- unique(c(active_classes(), name))
      updateTextInput(session, "active_classes_json", value = jsonlite::toJSON(active))
      updateTextInput(session, "add_node_name", value = "")
    })
    
    # -------------------------------------------------------------
    # Move node handler
    # -------------------------------------------------------------
    observeEvent(input$move_node_btn, {
      node <- input$move_node_select
      req(node)
      x <- input$move_x
      y <- input$move_y
      
      overrides <- position_overrides()
      overrides[[node]] <- c(x, y)
      updateTextInput(session, "position_overrides_json", value = jsonlite::toJSON(overrides, auto_unbox = TRUE))
    })
    
    # -------------------------------------------------------------
    # Add edge handler
    # -------------------------------------------------------------
    observeEvent(input$add_edge_btn, {
      src <- input$add_edge_source
      tgt <- input$add_edge_target
      req(src, tgt, src != tgt)
      
      added <- added_edges()
      exists <- FALSE
      for (e in added) {
        if ((e[1] == src && e[2] == tgt) || (e[1] == tgt && e[2] == src)) {
          exists <- TRUE
          break
        }
      }
      if (!exists) {
        added[[length(added) + 1]] <- c(src, tgt)
        updateTextInput(session, "added_edges_json", value = jsonlite::toJSON(added))
      }
    })
    
    # -------------------------------------------------------------
    # Remove edge handler
    # -------------------------------------------------------------
    observeEvent(input$remove_edge_btn, {
      edge_str <- input$edge_to_remove
      req(edge_str)
      
      parts <- strsplit(edge_str, " — ")[[1]]
      req(length(parts) == 2)
      src <- parts[1]
      tgt <- parts[2]
      
      added <- added_edges()
      new_added <- list()
      for (e in added) {
        if (!((e[1] == src && e[2] == tgt) || (e[1] == tgt && e[2] == src))) {
          new_added[[length(new_added) + 1]] <- e
        }
      }
      updateTextInput(session, "added_edges_json", value = jsonlite::toJSON(new_added))
      
      is_curated <- FALSE
      for (ce in ALL_PATHWAY_EDGES) {
        if ((ce[1] == src && ce[2] == tgt) || (ce[1] == tgt && ce[2] == src)) {
          is_curated <- TRUE
          break
        }
      }
      if (is_curated) {
        removed <- removed_edges()
        exists <- FALSE
        for (re in removed) {
          if ((re[1] == src && re[2] == tgt) || (re[1] == tgt && re[2] == src)) {
            exists <- TRUE
            break
          }
        }
        if (!exists) {
          removed[[length(removed) + 1]] <- c(src, tgt)
          updateTextInput(session, "removed_edges_json", value = jsonlite::toJSON(removed))
        }
      }
    })
    
    # -------------------------------------------------------------
    # JSON Config Import/Export
    # -------------------------------------------------------------
    output$download_config <- downloadHandler(
      filename = function() "pathway_layout_config.json",
      content = function(file) {
        config <- list(
          active_classes = active_classes(),
          custom_nodes = custom_nodes(),
          added_edges = added_edges(),
          removed_edges = removed_edges(),
          position_overrides = position_overrides()
        )
        writeLines(jsonlite::toJSON(config, pretty = TRUE, auto_unbox = TRUE), file)
      },
      contentType = "application/json"
    )
    
    observeEvent(input$upload_config, {
      req(input$upload_config)
      tryCatch({
        loaded <- jsonlite::fromJSON(input$upload_config$datapath, simplifyVector = FALSE)
        if (!is.null(loaded$active_classes)) {
          updateTextInput(session, "active_classes_json", value = jsonlite::toJSON(loaded$active_classes))
        }
        if (!is.null(loaded$custom_nodes)) {
          updateTextInput(session, "custom_nodes_json", value = jsonlite::toJSON(loaded$custom_nodes, auto_unbox = TRUE))
        }
        if (!is.null(loaded$added_edges)) {
          updateTextInput(session, "added_edges_json", value = jsonlite::toJSON(loaded$added_edges))
        }
        if (!is.null(loaded$removed_edges)) {
          updateTextInput(session, "removed_edges_json", value = jsonlite::toJSON(loaded$removed_edges))
        }
        if (!is.null(loaded$position_overrides)) {
          updateTextInput(session, "position_overrides_json", value = jsonlite::toJSON(loaded$position_overrides, auto_unbox = TRUE))
        }
        showNotification("Configuration loaded successfully!", type = "message")
      }, error = function(e) {
        showNotification(paste("Error loading layout JSON:", e$message), type = "error")
      })
    })
    
    # -------------------------------------------------------------
    # CALCULATE PATHWAY METRICS (Calculations)
    # -------------------------------------------------------------
    is_consolidated <- function(lipid_name, subclass) {
      single_chain_subclasses <- c("GP_LPC", "GP_LPE", "GP_LPG", "GP_LPI", "GP_LPS", "GP_LPA", "FA_ACar", "LCB")
      if (subclass %in% single_chain_subclasses) {
        return(FALSE)
      }
      if (grepl("\\(", lipid_name)) {
        inner <- regmatches(lipid_name, regexpr("(?<=\\().*(?=\\))", lipid_name, perl = TRUE))
        if (length(inner) > 0) {
          return(!grepl("[/_|;]", inner))
        }
      }
      return(FALSE)
    }
    
    count_saturated_unsaturated <- function(lipid_name) {
      m <- regexpr("(?<=\\().*(?=\\))", lipid_name, perl = TRUE)
      if (m == -1) {
        m2 <- regexpr("\\d+:\\d+$", lipid_name)
        if (m2 == -1) return(c(sat = 0, unsat = 0))
        chain_block <- regmatches(lipid_name, m2)
      } else {
        chain_block <- regmatches(lipid_name, m)
      }
      
      chain_block <- gsub("\\(\\d*OH\\)", "", chain_block, ignore.case = TRUE)
      chain_block <- gsub("\\(O\\)", "", chain_block, ignore.case = TRUE)
      
      chains <- strsplit(chain_block, "[/_|;]")[[1]]
      n_sat <- 0
      n_unsat <- 0
      for (ch in chains) {
        mt <- regexpr("(?<=:)\\d+", ch, perl = TRUE)
        if (mt > -1) {
          db <- as.numeric(regmatches(ch, mt))
          if (!is.na(db)) {
            if (db == 0) {
              n_sat <- n_sat + 1
            } else {
              n_unsat <- n_unsat + 1
            }
          }
        }
      }
      return(c(sat = n_sat, unsat = n_unsat))
    }
    
    map_species_to_pathway_class <- function(subclass, modification) {
      if (is.null(subclass) || is.na(subclass) || subclass == "") return(NA_character_)
      
      if (subclass %in% c("GP_PE_P", "GP_PE_E")) return("ePE")
      if (subclass == "SP_Cer_dh") return("dhCer")
      
      is_ether <- !is.null(modification) && !is.na(modification) && modification %in% c("ether", "plasmalogen")
      if (subclass == "GP_PC" && is_ether) return("ePC")
      
      if (!subclass %in% names(REVERSE_CLASS_MAP)) return(NA_character_)
      
      mapped <- REVERSE_CLASS_MAP[[subclass]]
      return(mapped)
    }
    
    pathway_metrics <- reactive({
      req(shared_data$data_processed(), shared_data$annotationData())
      
      meta <- tryCatch(shared_data$grouped_metadata(), error = function(e) NULL)
      contrast <- shared_data$de_contrast_info()
      
      if (is.null(contrast) || is.null(meta)) return(NULL)
      
      ref_samples <- meta$FullName[meta$Dynamic_DE_Group %in% contrast$ref]
      comp_samples <- meta$FullName[meta$Dynamic_DE_Group %in% contrast$comp]
      
      if (length(ref_samples) == 0 || length(comp_samples) == 0) return(NULL)
      
      anno <- shared_data$annotationData()
      processed_linear <- shared_data$data_processed()
      
      # Convert linear values back to log2 scale for pathway logic compatibility
      processed_log2 <- processed_linear
      intensity_cols <- setdiff(names(processed_log2), "Lipid_Name")
      processed_log2[, intensity_cols] <- log2(processed_log2[, intensity_cols])
      
      # Avoid setting rownames on tibble error by setting rownames of input to NULL first
      intensity_mat <- processed_log2
      rownames(intensity_mat) <- NULL
      intensity_mat <- intensity_mat %>%
        tibble::column_to_rownames("Lipid_Name")
      
      anno$pathway_class <- sapply(seq_len(nrow(anno)), function(i) {
        map_species_to_pathway_class(anno$subclass[i], anno$modification[i])
      })
      
      valid_indices <- which(!is.na(anno$pathway_class) & anno$Lipid_Name %in% rownames(intensity_mat))
      if (length(valid_indices) == 0) return(NULL)
      
      mapped_anno <- anno[valid_indices, ]
      mapped_intensity <- intensity_mat[mapped_anno$Lipid_Name, , drop = FALSE]
      
      unique_p_classes <- unique(mapped_anno$pathway_class)
      
      class_abundance_df <- do.call(rbind, lapply(unique_p_classes, function(cls) {
        species_in_class <- mapped_anno$Lipid_Name[mapped_anno$pathway_class == cls]
        sub_mat <- mapped_intensity[species_in_class, , drop = FALSE]
        colSums(sub_mat, na.rm = TRUE)
      }))
      rownames(class_abundance_df) <- unique_p_classes
      
      fold_changes <- sapply(unique_p_classes, function(cls) {
        # Align samples safely with intersect in case metadata contains extra samples not in dataset
        ref_samples_clean <- intersect(ref_samples, colnames(class_abundance_df))
        comp_samples_clean <- intersect(comp_samples, colnames(class_abundance_df))
        
        ref_vals <- class_abundance_df[cls, ref_samples_clean]
        comp_vals <- class_abundance_df[cls, comp_samples_clean]
        ref_mean <- mean(ref_vals, na.rm = TRUE)
        comp_mean <- mean(comp_vals, na.rm = TRUE)
        if (is.na(ref_mean) || is.nan(ref_mean) || ref_mean <= 0) return(0.0)
        if (is.na(comp_mean) || is.nan(comp_mean)) return(0.0)
        return(comp_mean / ref_mean)
      })
      
      sat_ratios <- sapply(unique_p_classes, function(cls) {
        species_in_class <- mapped_anno[mapped_anno$pathway_class == cls, ]
        if (input$filter_consolidated) {
          keep <- sapply(seq_len(nrow(species_in_class)), function(i) {
            !is_consolidated(species_in_class$Lipid_Name[i], species_in_class$subclass[i])
          })
          species_in_class <- species_in_class[keep, ]
        }
        
        if (nrow(species_in_class) == 0) return(0.0)
        
        counts <- lapply(species_in_class$Lipid_Name, count_saturated_unsaturated)
        total_sat <- sum(sapply(counts, function(c) c["sat"]))
        total_unsat <- sum(sapply(counts, function(c) c["unsat"]))
        
        total_chains <- total_sat + total_unsat
        if (total_chains <= 0) return(0.0)
        return(total_sat / total_chains)
      })
      
      species_count <- sapply(unique_p_classes, function(cls) {
        sum(mapped_anno$pathway_class == cls)
      })
      
      base_df <- data.frame(
        Class = unique_p_classes,
        Fold_Change = fold_changes,
        Saturation_Ratio = sat_ratios,
        Species_Count = species_count,
        stringsAsFactors = FALSE
      )
      
      # Calculate abundance-weighted carbon length and abundance for each class
      carbon_abundance_metrics <- lapply(unique_p_classes, function(cls) {
        species_in_class <- mapped_anno[mapped_anno$pathway_class == cls, ]
        if (nrow(species_in_class) == 0) {
          return(data.frame(
            Class = cls, Ref_Carbon = NA_real_, Comp_Carbon = NA_real_, Carbon_Change = NA_real_,
            Ref_Abundance = NA_real_, Comp_Abundance = NA_real_, Abundance_FC = NA_real_,
            P_Value = NA_real_,
            Ref_Sat_Ratio = NA_real_, Comp_Sat_Ratio = NA_real_,
            Saturation_Log2FC = NA_real_, Saturation_ZScore = NA_real_,
            stringsAsFactors = FALSE
          ))
        }
        
        # Get raw log2 intensities for these species
        sub_mat <- mapped_intensity[species_in_class$Lipid_Name, , drop = FALSE]
        
        # Convert to linear abundance (2^x) for weighting and total abundance
        linear_mat <- 2^sub_mat
        
        # Extract carbon lengths for these species
        carbons <- species_in_class$Total_Carbons
        valid_c <- !is.na(carbons)
        
        ref_samples_clean <- intersect(ref_samples, colnames(linear_mat))
        comp_samples_clean <- intersect(comp_samples, colnames(linear_mat))
        
        if (length(ref_samples_clean) == 0 || length(comp_samples_clean) == 0) {
          return(data.frame(
            Class = cls, Ref_Carbon = NA_real_, Comp_Carbon = NA_real_, Carbon_Change = NA_real_,
            Ref_Abundance = NA_real_, Comp_Abundance = NA_real_, Abundance_FC = NA_real_,
            P_Value = NA_real_,
            Ref_Sat_Ratio = NA_real_, Comp_Sat_Ratio = NA_real_,
            Saturation_Log2FC = NA_real_, Saturation_ZScore = NA_real_,
            stringsAsFactors = FALSE
          ))
        }
        
        # Calculate weighted average carbon length per sample
        ref_mean_c <- NA_real_
        comp_mean_c <- NA_real_
        c_change <- NA_real_
        
        if (sum(valid_c) > 0) {
          carbons_v <- carbons[valid_c]
          linear_mat_v <- linear_mat[valid_c, , drop = FALSE]
          
          weighted_c_for_sample <- function(samples) {
            sapply(samples, function(s) {
              abunds <- linear_mat_v[, s]
              tot_abund <- sum(abunds, na.rm = TRUE)
              if (is.na(tot_abund) || tot_abund <= 0) return(NA_real_)
              sum(abunds * carbons_v, na.rm = TRUE) / tot_abund
            })
          }
          
          ref_weighted_c <- weighted_c_for_sample(ref_samples_clean)
          comp_weighted_c <- weighted_c_for_sample(comp_samples_clean)
          
          ref_mean_c <- mean(ref_weighted_c, na.rm = TRUE)
          comp_mean_c <- mean(comp_weighted_c, na.rm = TRUE)
          if (!is.na(ref_mean_c) && !is.na(comp_mean_c)) {
            c_change <- comp_mean_c - ref_mean_c
          }
        }
        
        # Calculate saturation ratio per sample (abundance-weighted)
        ref_mean_sat <- NA_real_
        comp_mean_sat <- NA_real_
        sat_change_zscore <- NA_real_
        sat_change_log2fc <- NA_real_
        
        species_in_class_sat <- species_in_class
        if (input$filter_consolidated) {
          keep_sat <- sapply(seq_len(nrow(species_in_class_sat)), function(i) {
            !is_consolidated(species_in_class_sat$Lipid_Name[i], species_in_class_sat$subclass[i])
          })
          species_in_class_sat <- species_in_class_sat[keep_sat, ]
        }
        
        if (nrow(species_in_class_sat) > 0) {
          sub_mat_sat <- mapped_intensity[species_in_class_sat$Lipid_Name, , drop = FALSE]
          linear_mat_sat <- 2^sub_mat_sat
          
          # Get saturation fraction for each species
          counts_sat <- lapply(species_in_class_sat$Lipid_Name, count_saturated_unsaturated)
          sats_f <- sapply(counts_sat, function(c) {
            tot_ch <- c["sat"] + c["unsat"]
            if (tot_ch <= 0) return(NA_real_)
            return(c["sat"] / tot_ch)
          })
          
          valid_s <- !is.na(sats_f)
          if (sum(valid_s) > 0) {
            sats_f_v <- sats_f[valid_s]
            linear_mat_sat_v <- linear_mat_sat[valid_s, , drop = FALSE]
            
            weighted_s_for_sample <- function(samples) {
              sapply(samples, function(s) {
                abunds <- linear_mat_sat_v[, s]
                tot_abund <- sum(abunds, na.rm = TRUE)
                if (is.na(tot_abund) || tot_abund <= 0) return(NA_real_)
                sum(abunds * sats_f_v, na.rm = TRUE) / tot_abund
              })
            }
            
            ref_weighted_s <- weighted_s_for_sample(ref_samples_clean)
            comp_weighted_s <- weighted_s_for_sample(comp_samples_clean)
            
            ref_mean_sat <- mean(ref_weighted_s, na.rm = TRUE)
            comp_mean_sat <- mean(comp_weighted_s, na.rm = TRUE)
            
            if (!is.na(ref_mean_sat) && !is.na(comp_mean_sat)) {
              sat_change_log2fc <- log2((comp_mean_sat + 1e-9) / (ref_mean_sat + 1e-9))
              
              all_weighted_s <- c(ref_weighted_s, comp_weighted_s)
              sd_s <- sd(all_weighted_s, na.rm = TRUE)
              if (!is.na(sd_s) && sd_s > 0) {
                sat_change_zscore <- (comp_mean_sat - ref_mean_sat) / sd_s
              } else {
                sat_change_zscore <- 0.0
              }
            }
          }
        }
        
        # Compute total linear abundance of the class per sample
        ref_abunds <- colSums(linear_mat, na.rm = TRUE)[ref_samples_clean]
        comp_abunds <- colSums(linear_mat, na.rm = TRUE)[comp_samples_clean]
        
        ref_mean_abund <- mean(ref_abunds, na.rm = TRUE)
        comp_mean_abund <- mean(comp_abunds, na.rm = TRUE)
        abund_fc <- if (!is.na(ref_mean_abund) && ref_mean_abund > 0) comp_mean_abund / ref_mean_abund else NA_real_
        
        p_val_abund <- NA_real_
        if (length(ref_abunds) >= 2 && length(comp_abunds) >= 2) {
          ref_log <- log2(ref_abunds + 1)
          comp_log <- log2(comp_abunds + 1)
          
          # Clean NA, NaN, and Inf values
          ref_log_clean <- ref_log[is.finite(ref_log)]
          comp_log_clean <- comp_log[is.finite(comp_log)]
          
          if (length(ref_log_clean) >= 2 && length(comp_log_clean) >= 2) {
            v_ref <- var(ref_log_clean)
            v_comp <- var(comp_log_clean)
            if (!is.na(v_ref) && !is.na(v_comp) && (v_ref > 0 || v_comp > 0)) {
              t_res <- tryCatch(t.test(comp_log_clean, ref_log_clean), error = function(e) NULL)
              if (!is.null(t_res)) {
                p_val_abund <- t_res$p.value
              }
            }
          }
        }
        
        p_val_sat <- NA_real_
        if (exists("ref_weighted_s") && exists("comp_weighted_s") && length(ref_weighted_s) >= 2 && length(comp_weighted_s) >= 2) {
          ref_s_clean <- ref_weighted_s[is.finite(ref_weighted_s)]
          comp_s_clean <- comp_weighted_s[is.finite(comp_weighted_s)]
          if (length(ref_s_clean) >= 2 && length(comp_s_clean) >= 2) {
            v_ref_s <- var(ref_s_clean)
            v_comp_s <- var(comp_s_clean)
            if (!is.na(v_ref_s) && !is.na(v_comp_s) && (v_ref_s > 0 || v_comp_s > 0)) {
              t_res <- tryCatch(t.test(comp_s_clean, ref_s_clean), error = function(e) NULL)
              if (!is.null(t_res)) {
                p_val_sat <- t_res$p.value
              }
            }
          }
        }
        
        p_val_carbon <- NA_real_
        if (exists("ref_weighted_c") && exists("comp_weighted_c") && length(ref_weighted_c) >= 2 && length(comp_weighted_c) >= 2) {
          ref_c_clean <- ref_weighted_c[is.finite(ref_weighted_c)]
          comp_c_clean <- comp_weighted_c[is.finite(comp_weighted_c)]
          if (length(ref_c_clean) >= 2 && length(comp_c_clean) >= 2) {
            v_ref_c <- var(ref_c_clean)
            v_comp_c <- var(comp_c_clean)
            if (!is.na(v_ref_c) && !is.na(v_comp_c) && (v_ref_c > 0 || v_comp_c > 0)) {
              t_res <- tryCatch(t.test(comp_c_clean, ref_c_clean), error = function(e) NULL)
              if (!is.null(t_res)) {
                p_val_carbon <- t_res$p.value
              }
            }
          }
        }
        
        data.frame(
          Class = cls,
          Ref_Carbon = ref_mean_c,
          Comp_Carbon = comp_mean_c,
          Carbon_Change = c_change,
          Ref_Abundance = ref_mean_abund,
          Comp_Abundance = comp_mean_abund,
          Abundance_FC = abund_fc,
          P_Value_Abund = p_val_abund,
          P_Value_Sat = p_val_sat,
          P_Value_Carbon = p_val_carbon,
          Ref_Sat_Ratio = ref_mean_sat,
          Comp_Sat_Ratio = comp_mean_sat,
          Saturation_Log2FC = sat_change_log2fc,
          Saturation_ZScore = sat_change_zscore,
          stringsAsFactors = FALSE
        )
      })
      
      carbon_abundance_df <- do.call(rbind, carbon_abundance_metrics)
      
      if (!is.null(carbon_abundance_df) && nrow(carbon_abundance_df) > 0) {
        res_df <- merge(base_df, carbon_abundance_df, by = "Class", all.x = TRUE)
      } else {
        res_df <- base_df
        res_df$Ref_Carbon <- NA_real_
        res_df$Comp_Carbon <- NA_real_
        res_df$Carbon_Change <- NA_real_
        res_df$Ref_Abundance <- NA_real_
        res_df$Comp_Abundance <- NA_real_
        res_df$Abundance_FC <- NA_real_
        res_df$P_Value_Abund <- NA_real_
        res_df$P_Value_Sat <- NA_real_
        res_df$P_Value_Carbon <- NA_real_
        res_df$P_Value <- NA_real_
        res_df$P_Adj <- NA_real_
        res_df$Ref_Sat_Ratio <- NA_real_
        res_df$Comp_Sat_Ratio <- NA_real_
        res_df$Saturation_Log2FC <- NA_real_
        res_df$Saturation_ZScore <- NA_real_
      }
      
      # Select active P_Value based on user's color map choice
      color_map_choice <- input$node_color_map %||% "sat_zscore"
      if (color_map_choice %in% c("sat_zscore", "sat_log2fc", "sat")) {
        res_df$P_Value <- res_df$P_Value_Sat
      } else if (color_map_choice == "carbon") {
        res_df$P_Value <- res_df$P_Value_Carbon
      } else { # "fc"
        res_df$P_Value <- res_df$P_Value_Abund
      }
      
      # Calculate BH adjusted p-values dynamically
      raw_ps <- res_df$P_Value
      adj_ps <- rep(NA_real_, length(raw_ps))
      valid_p_idx <- which(!is.na(raw_ps))
      if (length(valid_p_idx) > 0) {
        adj_ps[valid_p_idx] <- p.adjust(raw_ps[valid_p_idx], method = "BH")
      }
      res_df$P_Adj <- adj_ps
      
      res_df
    })
    
    get_plasma_color <- function(val, max_val = 1.0) {
      if (is.na(val) || val <= 0) val <- 0.0
      norm_val <- if (max_val > 0) val / max_val else 0.0
      norm_val <- max(0.0, min(1.0, norm_val))
      idx <- as.integer(norm_val * 99) + 1
      palette <- viridisLite::plasma(100)
      return(palette[idx])
    }
    
    get_divergent_color <- function(val, max_abs_val) {
      if (is.na(val) || is.infinite(val)) return("#cccccc")
      if (max_abs_val <= 0) return("#f7f7f7")
      norm_val <- val / max_abs_val
      norm_val <- max(-1.0, min(1.0, norm_val))
      t <- (norm_val + 1) / 2
      if (t < 0.5) {
        p <- t / 0.5
        r <- round(0x1f + p * (0xf7 - 0x1f))
        g <- round(0x77 + p * (0xf7 - 0x77))
        b <- round(0xb4 + p * (0xf7 - 0xb4))
      } else {
        p <- (t - 0.5) / 0.5
        r <- round(0xf7 + p * (0xd6 - 0xf7))
        g <- round(0xf7 + p * (0x27 - 0xf7))
        b <- round(0xf7 + p * (0x28 - 0xf7))
      }
      return(sprintf("#%02x%02x%02x", r, g, b))
    }
    
    scale_fold_change <- function(fc) {
      if (is.na(fc) || fc <= 0) return(0.0)
      return(max(0.2, min(5.0, log2(fc + 1))))
    }
    
    # -------------------------------------------------------------
    # PLOTLY FIGURE GENERATOR (R rendering)
    # -------------------------------------------------------------
    buildPathwayPlot <- reactive({
      if (is.null(shared_data$de_contrast_info())) {
        fig <- plot_ly() %>%
          layout(
            title = list(
              text = "<b>Differential Expression Analysis Not Run</b><br><span style='font-size: 13px; color: #d97706;'>Please select comparison groups in 3. Differential Expression main left sidebar</span>",
              font = list(family = "inherit", size = 16, color = "#1e293b")
            ),
            xaxis = list(visible = FALSE),
            yaxis = list(visible = FALSE)
          )
        return(fig)
      }
      
      metrics <- pathway_metrics()
      active <- active_classes()
      
      format_abundance <- function(val) {
        if (is.null(val) || is.na(val)) return("N/A")
        if (val >= 1e6) {
          return(sprintf("%.2e", val))
        } else if (val >= 100) {
          return(sprintf("%.1f", val))
        } else {
          return(sprintf("%.2f", val))
        }
      }
      active_set <- setNames(rep(TRUE, length(active)), active)
      
      node_xs <- c()
      node_ys <- c()
      hover_texts <- c()
      node_labels <- c()
      label_xs <- c()
      label_ys <- c()
      node_colors <- c()
      
      color_map_choice <- input$node_color_map %||% "sat"
      size_map_choice <- input$node_size_map %||% "fc_mag"
      
      # Determine limits and colorscale settings based on node_color_map selection
      if (color_map_choice == "sat_zscore") {
        max_abs_sat <- 1.0
        if (!is.null(metrics) && nrow(metrics) > 0) {
          valid_sats <- metrics$Saturation_ZScore[is.finite(metrics$Saturation_ZScore)]
          if (length(valid_sats) > 0) {
            max_abs_sat <- max(abs(valid_sats), na.rm = TRUE)
          }
        }
        if (is.na(max_abs_sat) || max_abs_sat <= 0) max_abs_sat <- 1.0
        cmin_val <- -max_abs_sat
        cmax_val <- max_abs_sat
        colorscale_val <- list(c(0, "#1f77b4"), c(0.5, "#f7f7f7"), c(1, "#d62728"))
        colorbar_title <- "Saturation Change (Z-score)"
      } else if (color_map_choice == "sat_log2fc") {
        max_abs_sat <- 1.0
        if (!is.null(metrics) && nrow(metrics) > 0) {
          valid_sats <- metrics$Saturation_Log2FC[is.finite(metrics$Saturation_Log2FC)]
          if (length(valid_sats) > 0) {
            max_abs_sat <- max(abs(valid_sats), na.rm = TRUE)
          }
        }
        if (is.na(max_abs_sat) || max_abs_sat <= 0) max_abs_sat <- 1.0
        cmin_val <- -max_abs_sat
        cmax_val <- max_abs_sat
        colorscale_val <- list(c(0, "#1f77b4"), c(0.5, "#f7f7f7"), c(1, "#d62728"))
        colorbar_title <- "Saturation Change (Log2FC)"
      } else if (color_map_choice == "sat") {
        cmin_val <- 0
        cmax_val <- if (!is.null(metrics) && nrow(metrics) > 0) max(metrics$Saturation_Ratio, na.rm = TRUE) else 1.0
        if (is.na(cmax_val) || cmax_val <= 0) cmax_val <- 1.0
        colorscale_val <- "Plasma"
        colorbar_title <- "Saturation Ratio"
      } else if (color_map_choice == "carbon") {
        max_abs_c <- 1.0
        if (!is.null(metrics) && nrow(metrics) > 0) {
          valid_c_changes <- metrics$Carbon_Change[is.finite(metrics$Carbon_Change)]
          if (length(valid_c_changes) > 0) {
            max_abs_c <- max(abs(valid_c_changes), na.rm = TRUE)
          }
        }
        if (is.na(max_abs_c) || max_abs_c <= 0) max_abs_c <- 1.0
        cmin_val <- -max_abs_c
        cmax_val <- max_abs_c
        colorscale_val <- list(c(0, "#1f77b4"), c(0.5, "#f7f7f7"), c(1, "#d62728"))
        colorbar_title <- "Carbon Length Change (\u0394C)"
      } else { # "fc"
        max_abs_fc <- 1.0
        if (!is.null(metrics) && nrow(metrics) > 0) {
          valid_fcs <- metrics$Abundance_FC[is.finite(metrics$Abundance_FC) & metrics$Abundance_FC > 0]
          if (length(valid_fcs) > 0) {
            max_abs_fc <- max(abs(log2(valid_fcs)), na.rm = TRUE)
          }
        }
        if (is.na(max_abs_fc) || max_abs_fc <= 0) max_abs_fc <- 1.0
        cmin_val <- -max_abs_fc
        cmax_val <- max_abs_fc
        colorscale_val <- list(c(0, "#1f77b4"), c(0.5, "#f7f7f7"), c(1, "#d62728"))
        colorbar_title <- "Log2 Fold Change"
      }
      
      min_log_abund <- 1.0
      max_log_abund <- 7.0
      if (size_map_choice == "abundance" && !is.null(metrics) && nrow(metrics) > 0) {
        avg_abunds <- (metrics$Ref_Abundance + metrics$Comp_Abundance) / 2
        valid_abunds <- avg_abunds[is.finite(avg_abunds) & avg_abunds > 0]
        if (length(valid_abunds) > 0) {
          log_abunds <- log10(valid_abunds)
          min_log_abund <- min(log_abunds, na.rm = TRUE)
          max_log_abund <- max(log_abunds, na.rm = TRUE)
        }
      }
      
      shapes_list <- list()
      classes_with_data <- c()
      
      for (cls in active) {
        pos <- get_current_pos(cls)
        lpos <- get_current_label_pos(cls)
        
        fc <- 1.0
        sat <- 0.0
        n_sp <- 0
        has_data <- FALSE
        
        ref_c <- NA_real_
        comp_c <- NA_real_
        c_change <- NA_real_
        ref_abund <- NA_real_
        comp_abund <- NA_real_
        abund_fc <- NA_real_
        p_val <- NA_real_
        p_adj <- NA_real_
        ref_sat_ratio <- NA_real_
        comp_sat_ratio <- NA_real_
        sat_log2fc <- NA_real_
        sat_zscore <- NA_real_
        
        if (!is.null(metrics) && cls %in% metrics$Class) {
          row <- metrics[metrics$Class == cls, ]
          fc <- as.numeric(row$Fold_Change[1])
          sat <- as.numeric(row$Saturation_Ratio[1])
          n_sp <- as.integer(row$Species_Count[1])
          has_data <- TRUE
          classes_with_data <- c(classes_with_data, cls)
          
          ref_c <- as.numeric(row$Ref_Carbon[1])
          comp_c <- as.numeric(row$Comp_Carbon[1])
          c_change <- as.numeric(row$Carbon_Change[1])
          ref_abund <- as.numeric(row$Ref_Abundance[1])
          comp_abund <- as.numeric(row$Comp_Abundance[1])
          abund_fc <- as.numeric(row$Abundance_FC[1])
          p_val <- as.numeric(row$P_Value[1])
          p_adj <- as.numeric(row$P_Adj[1])
          ref_sat_ratio <- as.numeric(row$Ref_Sat_Ratio[1])
          comp_sat_ratio <- as.numeric(row$Comp_Sat_Ratio[1])
          sat_log2fc <- as.numeric(row$Saturation_Log2FC[1])
          sat_zscore <- as.numeric(row$Saturation_ZScore[1])
        }
        
        c_change_str <- if (is.na(c_change)) "N/A" else {
          sprintf("%+.2f%s", c_change, ifelse(c_change < 0, " (shortening)", ifelse(c_change > 0, " (elongation)", "")))
        }
        
        p_val_str <- if (is.na(p_val)) "N/A" else sprintf("%.4f", p_val)
        p_adj_str <- if (is.na(p_adj)) "N/A" else sprintf("%.4f", p_adj)
        
        hover_texts <- c(hover_texts, paste0(
          "<b>", cls, "</b><br>",
          "Abundance (Ref): ", format_abundance(ref_abund), "<br>",
          "Abundance (Comp): ", format_abundance(comp_abund), "<br>",
          "Abundance Fold Change: ", if (is.na(abund_fc)) "N/A" else sprintf("%.3f", abund_fc), "<br>",
          "P-value: ", p_val_str, "<br>",
          "FDR (BH Adjusted): ", p_adj_str, "<br>",
          "Saturation Ratio (Ref): ", if (is.na(ref_sat_ratio)) "N/A" else sprintf("%.3f", ref_sat_ratio), "<br>",
          "Saturation Ratio (Comp): ", if (is.na(comp_sat_ratio)) "N/A" else sprintf("%.3f", comp_sat_ratio), "<br>",
          "Saturation Log2FC: ", if (is.na(sat_log2fc)) "N/A" else sprintf("%+.3f", sat_log2fc), "<br>",
          "Saturation Z-score: ", if (is.na(sat_zscore)) "N/A" else sprintf("%+.3f", sat_zscore), "<br>",
          "Avg Carbon Length (Ref): ", if (is.na(ref_c)) "N/A" else sprintf("%.2f", ref_c), "<br>",
          "Avg Carbon Length (Comp): ", if (is.na(comp_c)) "N/A" else sprintf("%.2f", comp_c), "<br>",
          "Carbon Length Change: ", c_change_str, "<br>",
          "Species Detected: ", n_sp
        ))
        
        # Calculate color value for colorbar and fill color mapping
        if (color_map_choice == "sat_zscore") {
          color_val <- if (is.na(sat_zscore)) 0.0 else sat_zscore
          fill_c <- get_divergent_color(color_val, max_abs_sat)
        } else if (color_map_choice == "sat_log2fc") {
          color_val <- if (is.na(sat_log2fc)) 0.0 else sat_log2fc
          fill_c <- get_divergent_color(color_val, max_abs_sat)
        } else if (color_map_choice == "sat") {
          color_val <- sat
          fill_c <- get_plasma_color(sat, cmax_val)
        } else if (color_map_choice == "carbon") {
          color_val <- if (is.na(c_change)) 0.0 else c_change
          fill_c <- get_divergent_color(color_val, max_abs_c)
        } else { # "fc"
          log2_fc_val <- if (!is.na(abund_fc) && abund_fc > 0) log2(abund_fc) else 0.0
          color_val <- log2_fc_val
          fill_c <- get_divergent_color(color_val, max_abs_fc)
        }
        
        node_xs <- c(node_xs, pos[1])
        node_ys <- c(node_ys, pos[2])
        node_colors <- c(node_colors, color_val)
        
        if (has_data) {
          # Calculate radius based on mapping
          if (size_map_choice == "fc_mag") {
            log2_fc_val <- if (!is.na(abund_fc) && abund_fc > 0) log2(abund_fc) else 0.0
            sz <- 0.4 + 0.5 * min(4.0, abs(log2_fc_val))
            r_fc <- 0.5 * sz
          } else { # "abundance"
            mean_abund <- (ref_abund + comp_abund) / 2
            log10_abund <- if (!is.na(mean_abund) && mean_abund > 0) log10(mean_abund) else 1.0
            norm_sz <- if (max_log_abund > min_log_abund) (log10_abund - min_log_abund) / (max_log_abund - min_log_abund) else 0.5
            norm_sz <- max(0.0, min(1.0, norm_sz))
            r_fc <- 0.25 + 0.8 * norm_sz
          }
          
          # Add fill circle
          shapes_list[[length(shapes_list) + 1]] <- list(
            type = "circle",
            x0 = pos[1] - r_fc, x1 = pos[1] + r_fc,
            y0 = pos[2] - r_fc, y1 = pos[2] + r_fc,
            line = list(width = 0),
            fillcolor = fill_c,
            layer = "below"
          )
          
          # Add outline circle (same radius)
          outline_color <- "black"
          if (!is.na(abund_fc)) {
            if (abund_fc > 1.0) {
              outline_color <- "#d62728" # Red for upregulation
            } else if (abund_fc < 1.0) {
              outline_color <- "#1f77b4" # Blue for downregulation
            }
          }
          
          shapes_list[[length(shapes_list) + 1]] <- list(
            type = "circle",
            x0 = pos[1] - r_fc, x1 = pos[1] + r_fc,
            y0 = pos[2] - r_fc, y1 = pos[2] + r_fc,
            line = list(color = outline_color, width = 1.5),
            fillcolor = "rgba(0,0,0,0)",
            layer = "above"
          )
        } else {
          # Undetected classes get dashed gray circle
          shapes_list[[length(shapes_list) + 1]] <- list(
            type = "circle",
            x0 = pos[1] - 0.75, x1 = pos[1] + 0.75,
            y0 = pos[2] - 0.75, y1 = pos[2] + 0.75,
            line = list(color = "gray", width = 1.5, dash = "dash"),
            fillcolor = "rgba(0,0,0,0)",
            layer = "above"
          )
        }
        
        node_labels <- c(node_labels, cls)
        label_xs <- c(label_xs, lpos[1])
        label_ys <- c(label_ys, lpos[2])
      }
      
      p <- plot_ly()
      
      edges <- compute_current_edges()
      edge_xs <- c()
      edge_ys <- c()
      for (e in edges) {
        pos_a <- get_current_pos(e[1])
        pos_b <- get_current_pos(e[2])
        edge_xs <- c(edge_xs, pos_a[1], pos_b[1], NA)
        edge_ys <- c(edge_ys, pos_a[2], pos_b[2], NA)
      }
      if (length(edge_xs) > 0) {
        p <- p %>% add_trace(
          x = edge_xs, y = edge_ys,
          type = "scatter", mode = "lines",
          line = list(color = "blue", width = 1),
          hoverinfo = "skip", showlegend = FALSE
        )
      }
      
      if ("LPA" %in% active) {
        lpa_pos <- get_current_pos("LPA")
        p <- p %>% add_trace(
          x = c(0.0, lpa_pos[1]), y = c(20.0, lpa_pos[2]),
          type = "scatter", mode = "lines",
          line = list(color = "blue", width = 1),
          hoverinfo = "skip", showlegend = FALSE
        )
      }
      
      if ("LCB" %in% active) {
        lcb_pos <- get_current_pos("LCB")
        p <- p %>% add_trace(
          x = c(-5.0, lcb_pos[1]), y = c(20.0, lcb_pos[2]),
          type = "scatter", mode = "lines",
          line = list(color = "blue", width = 1),
          hoverinfo = "skip", showlegend = FALSE
        )
      }
      
      if ("LCB" %in% active && "LPA" %in% active) {
        lpa_pos <- get_current_pos("LPA")
        p <- p %>% add_trace(
          x = c(-5.0, lpa_pos[1]), y = c(20.0, lpa_pos[2]),
          type = "scatter", mode = "lines",
          line = list(color = "blue", width = 1),
          hoverinfo = "skip", showlegend = FALSE
        )
      }
      
      for (target in c("ePC", "ePE", "CE")) {
        if (target %in% active) {
          tgt_pos <- get_current_pos(target)
          p <- p %>% add_trace(
            x = c(-5.0, tgt_pos[1]), y = c(20.0, tgt_pos[2]),
            type = "scatter", mode = "lines",
            line = list(color = "blue", width = 1),
            hoverinfo = "skip", showlegend = FALSE
          )
        }
      }
      
      precursor_annotations <- list()
      if ("LPA" %in% active) {
        precursor_annotations[[length(precursor_annotations) + 1]] <- list(
          x = 0, y = 20.5, text = "G3P", showarrow = FALSE,
          font = list(size = 15, color = "black")
        )
      }
      if ("LCB" %in% active) {
        precursor_annotations[[length(precursor_annotations) + 1]] <- list(
          x = -5, y = 20.5, text = "Fatty Acids", showarrow = FALSE,
          font = list(size = 15, color = "black")
        )
      }
      
      label_annotations <- list()
      show_sig <- isTRUE(input$show_significance)
      sig_threshold <- input$sig_threshold %||% 0.05
      sig_type <- input$significance_type %||% "stars"
      sig_method <- input$sig_adj_method %||% "raw"
      
      for (i in seq_along(node_labels)) {
        cls <- node_labels[i]
        color <- if (cls %in% classes_with_data) "black" else "gray"
        
        label_text <- if (identical(input$classLabelFormat %||% "short", "full")) {
          get_full_class_name(cls)
        } else {
          get_short_class_name(cls)
        }
        sig_str <- ""
        
        if (cls %in% metrics$Class) {
          row <- metrics[metrics$Class == cls, ]
          c_change <- as.numeric(row$Carbon_Change[1])
          p_val <- as.numeric(row$P_Value[1])
          p_adj <- as.numeric(row$P_Adj[1])
          
          p_val_to_check <- if (sig_method == "BH") p_adj else p_val
          
          if (show_sig && !is.na(p_val_to_check) && p_val_to_check < sig_threshold) {
            stars <- if (p_val_to_check < 0.001) "***" else if (p_val_to_check < 0.01) "**" else if (p_val_to_check < 0.05) "*" else ""
            if (sig_type == "stars") {
              sig_str <- paste0(" <span style='color: red;'><b>", stars, "</b></span>")
            } else if (sig_type == "pvalue") {
              sig_str <- paste0(" <span style='color: red;'>p=", sprintf("%.3g", p_val_to_check), "</span>")
            } else {
              sig_str <- paste0(" <span style='color: red;'><b>", stars, "</b> (p=", sprintf("%.3g", p_val_to_check), ")</span>")
            }
          }
          
          label_details <- c()
          if (isTRUE(input$label_show_delta_c) && !is.na(c_change)) {
            label_details <- c(label_details, sprintf("\u0394C: %+.2f", c_change))
          }
          if (isTRUE(input$label_show_sat_z)) {
            sat_z <- as.numeric(row$Saturation_ZScore[1])
            if (!is.na(sat_z)) {
              label_details <- c(label_details, sprintf("\u0394Sat(Z): %+.2f", sat_z))
            }
          }
          if (isTRUE(input$label_show_log2fc)) {
            abund_fc <- as.numeric(row$Abundance_FC[1])
            if (!is.na(abund_fc) && abund_fc > 0) {
              label_details <- c(label_details, sprintf("Log2FC: %+.2f", log2(abund_fc)))
            }
          }
          
          if (length(label_details) > 0) {
            label_text <- paste0("<b>", cls, "</b>", sig_str, "<br><span style='color: #777777; font-size: 10px;'>", paste(label_details, collapse = "<br>"), "</span>")
          } else {
            label_text <- paste0("<b>", cls, "</b>", sig_str)
          }
        }
        
        label_annotations[[length(label_annotations) + 1]] <- list(
          x = label_xs[i], y = label_ys[i], text = label_text, showarrow = FALSE,
          font = list(size = 14, color = color),
          xanchor = "left", yanchor = "middle"
        )
      }
      
      all_annotations <- c(precursor_annotations, label_annotations)
      
      if (length(node_xs) > 0) {
        p <- p %>% add_trace(
          x = node_xs, y = node_ys,
          type = "scatter", mode = "markers",
          marker = list(
            size = 25,
            opacity = 0,
            color = node_colors,
            colorscale = colorscale_val,
            cmin = cmin_val,
            cmax = cmax_val,
            colorbar = list(
              title = list(text = colorbar_title, font = list(size = 13), side = "top"),
              tickfont = list(size = 11),
              orientation = "h",
              x = 0.5,
              xanchor = "center",
              y = -0.15,
              yanchor = "top",
              len = 0.6
            )
          ),
          text = hover_texts,
          hoverinfo = "text",
          showlegend = FALSE
        )
      }
      
      all_xs <- node_xs
      all_ys <- node_ys
      if ("LPA" %in% active) all_ys <- c(all_ys, 20.0)
      if ("LCB" %in% active) {
        all_xs <- c(all_xs, -5.0)
        all_ys <- c(all_ys, 20.0)
      }
      all_xs <- c(all_xs, label_xs)
      all_ys <- c(all_ys, label_ys)
      
      if (length(all_xs) == 0 || length(all_ys) == 0) {
        x_range <- c(-25.0, 25.0)
        y_range <- c(-15.0, 25.0)
      } else {
        x_range <- c(min(all_xs) - 4.0, max(all_xs) + 4.0)
        y_range <- c(min(all_ys) - 4.0, max(all_ys) + 4.0)
      }
      
      show_grid <- isTRUE(input$show_grid)
      
      p <- p %>% layout(
        title = list(text = "Lipid Pathway Map", font = list(size = 20)),
        xaxis = list(
          range = x_range,
          scaleanchor = "y", scaleratio = 1,
          showgrid = show_grid, zeroline = FALSE, visible = show_grid,
          gridcolor = if (show_grid) "#cccccc" else NULL,
          gridwidth = if (show_grid) 0.5 else NULL
        ),
        yaxis = list(
          range = y_range,
          showgrid = show_grid, zeroline = FALSE, visible = show_grid,
          gridcolor = if (show_grid) "#cccccc" else NULL,
          gridwidth = if (show_grid) 0.5 else NULL
        ),
        shapes = shapes_list,
        annotations = all_annotations,
        margin = list(l = 40, r = 40, t = 60, b = 100)
      )
      
      return(p)
    })
    
    output$de_not_run_banner <- renderUI({
      render_de_not_run_banner(shared_data)
    })
    
    output$pathwayPlot <- renderPlotly({
      buildPathwayPlot()
    })

    # -------------------------------------------------------------
    # VISNETWORK PHYSICS BUBBLE GENERATOR
    # -------------------------------------------------------------
    output$pathwayVisNetwork <- renderVisNetwork({
      metrics <- pathway_metrics()
      active <- active_classes()
      edges_list <- compute_current_edges()
      
      color_map_choice <- input$node_color_map %||% "sat_zscore"
      size_map_choice <- input$node_size_map %||% "fc_mag"
      label_format <- input$classLabelFormat %||% "short"
      
      # Determine limits for node color mapping
      if (color_map_choice == "sat_zscore") {
        max_abs_sat <- 1.0
        if (!is.null(metrics) && nrow(metrics) > 0) {
          valid_sats <- metrics$Saturation_ZScore[is.finite(metrics$Saturation_ZScore)]
          if (length(valid_sats) > 0) max_abs_sat <- max(abs(valid_sats), na.rm = TRUE)
        }
        if (is.na(max_abs_sat) || max_abs_sat <= 0) max_abs_sat <- 1.0
      } else if (color_map_choice == "sat_log2fc") {
        max_abs_sat <- 1.0
        if (!is.null(metrics) && nrow(metrics) > 0) {
          valid_sats <- metrics$Saturation_Log2FC[is.finite(metrics$Saturation_Log2FC)]
          if (length(valid_sats) > 0) max_abs_sat <- max(abs(valid_sats), na.rm = TRUE)
        }
        if (is.na(max_abs_sat) || max_abs_sat <= 0) max_abs_sat <- 1.0
      } else if (color_map_choice == "sat") {
        cmax_val <- if (!is.null(metrics) && nrow(metrics) > 0) max(metrics$Saturation_Ratio, na.rm = TRUE) else 1.0
        if (is.na(cmax_val) || cmax_val <= 0) cmax_val <- 1.0
      } else if (color_map_choice == "carbon") {
        max_abs_c <- 1.0
        if (!is.null(metrics) && nrow(metrics) > 0) {
          valid_c_changes <- metrics$Carbon_Change[is.finite(metrics$Carbon_Change)]
          if (length(valid_c_changes) > 0) max_abs_c <- max(abs(valid_c_changes), na.rm = TRUE)
        }
        if (is.na(max_abs_c) || max_abs_c <= 0) max_abs_c <- 1.0
      } else {
        max_abs_fc <- 1.0
        if (!is.null(metrics) && nrow(metrics) > 0) {
          valid_fcs <- metrics$Abundance_FC[is.finite(metrics$Abundance_FC) & metrics$Abundance_FC > 0]
          if (length(valid_fcs) > 0) max_abs_fc <- max(abs(log2(valid_fcs)), na.rm = TRUE)
        }
        if (is.na(max_abs_fc) || max_abs_fc <= 0) max_abs_fc <- 1.0
      }
      
      # Determine limits for abundance size mapping
      min_log_abund <- 1.0
      max_log_abund <- 7.0
      if (size_map_choice == "abundance" && !is.null(metrics) && nrow(metrics) > 0) {
        avg_abunds <- (metrics$Ref_Abundance + metrics$Comp_Abundance) / 2
        valid_abunds <- avg_abunds[is.finite(avg_abunds) & avg_abunds > 0]
        if (length(valid_abunds) > 0) {
          log_abunds <- log10(valid_abunds)
          min_log_abund <- min(log_abunds, na.rm = TRUE)
          max_log_abund <- max(log_abunds, na.rm = TRUE)
        }
      }
      
      format_abund <- function(val) {
        if (is.null(val) || is.na(val)) return("N/A")
        if (val >= 1e6) sprintf("%.2e", val) else if (val >= 100) sprintf("%.1f", val) else sprintf("%.2f", val)
      }
      
      nodes_list <- list()
      for (cls in active) {
        pos <- get_current_pos(cls)
        fc <- 1.0
        sat <- 0.0
        n_sp <- 0
        has_data <- FALSE
        
        ref_c <- NA_real_; comp_c <- NA_real_; c_change <- NA_real_
        ref_abund <- NA_real_; comp_abund <- NA_real_; abund_fc <- NA_real_
        p_val <- NA_real_; p_adj <- NA_real_
        ref_sat_ratio <- NA_real_; comp_sat_ratio <- NA_real_
        sat_log2fc <- NA_real_; sat_zscore <- NA_real_
        
        if (!is.null(metrics) && cls %in% metrics$Class) {
          row <- metrics[metrics$Class == cls, ]
          fc <- as.numeric(row$Fold_Change[1])
          sat <- as.numeric(row$Saturation_Ratio[1])
          n_sp <- as.integer(row$Species_Count[1])
          has_data <- TRUE
          
          ref_c <- as.numeric(row$Ref_Carbon[1])
          comp_c <- as.numeric(row$Comp_Carbon[1])
          c_change <- as.numeric(row$Carbon_Change[1])
          ref_abund <- as.numeric(row$Ref_Abundance[1])
          comp_abund <- as.numeric(row$Comp_Abundance[1])
          abund_fc <- as.numeric(row$Abundance_FC[1])
          p_val <- as.numeric(row$P_Value[1])
          p_adj <- as.numeric(row$P_Adj[1])
          ref_sat_ratio <- as.numeric(row$Ref_Sat_Ratio[1])
          comp_sat_ratio <- as.numeric(row$Comp_Sat_Ratio[1])
          sat_log2fc <- as.numeric(row$Saturation_Log2FC[1])
          sat_zscore <- as.numeric(row$Saturation_ZScore[1])
        }
        
        # Determine fill color
        if (color_map_choice == "sat_zscore") {
          color_val <- if (is.na(sat_zscore)) 0.0 else sat_zscore
          fill_c <- get_divergent_color(color_val, max_abs_sat)
        } else if (color_map_choice == "sat_log2fc") {
          color_val <- if (is.na(sat_log2fc)) 0.0 else sat_log2fc
          fill_c <- get_divergent_color(color_val, max_abs_sat)
        } else if (color_map_choice == "sat") {
          color_val <- sat
          fill_c <- get_plasma_color(sat, cmax_val)
        } else if (color_map_choice == "carbon") {
          color_val <- if (is.na(c_change)) 0.0 else c_change
          fill_c <- get_divergent_color(color_val, max_abs_c)
        } else {
          log2_fc_val <- if (!is.na(abund_fc) && abund_fc > 0) log2(abund_fc) else 0.0
          fill_c <- get_divergent_color(log2_fc_val, max_abs_fc)
        }
        
        # Border outline: red if up, blue if down, gray if unchanged/no data
        border_c <- "#64748b"
        if (!is.na(abund_fc)) {
          if (abund_fc > 1.0) border_c <- "#d62728"
          else if (abund_fc < 1.0) border_c <- "#1f77b4"
        }
        if (!has_data) {
          border_c <- "#94a3b8"
          fill_c <- "#f8fafc"
        }
        
        # Node radius sizing
        if (size_map_choice == "fc_mag") {
          log2_fc_val <- if (!is.na(abund_fc) && abund_fc > 0) log2(abund_fc) else 0.0
          node_size <- 25 + 18 * min(3.0, abs(log2_fc_val))
        } else {
          mean_abund <- (ref_abund + comp_abund) / 2
          log10_abund <- if (!is.na(mean_abund) && mean_abund > 0) log10(mean_abund) else 1.0
          norm_sz <- if (max_log_abund > min_log_abund) (log10_abund - min_log_abund) / (max_log_abund - min_log_abund) else 0.5
          norm_sz <- max(0.0, min(1.0, norm_sz))
          node_size <- 22 + 35 * norm_sz
        }
        if (!has_data) node_size <- 22
        
        # Display label
        display_label <- cls
        if (identical(label_format, "full")) {
          full_name <- REVERSE_CLASS_MAP[names(REVERSE_CLASS_MAP) == cls]
          if (length(full_name) > 0 && !is.na(full_name[1])) display_label <- full_name[1]
        }
        
        # Rich HTML Tooltip
        tooltip_html <- paste0(
          "<div style='padding: 8px 10px; font-family: sans-serif; font-size: 13px; line-height: 1.4;'>",
          "<div style='font-size: 14px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 4px;'>",
          cls, if (cls != display_label) paste0(" (", display_label, ")") else "", "</div>",
          "<div><strong>Abundance (Ref):</strong> ", format_abund(ref_abund), "</div>",
          "<div><strong>Abundance (Comp):</strong> ", format_abund(comp_abund), "</div>",
          "<div><strong>Abundance FC:</strong> ", if (is.na(abund_fc)) "N/A" else sprintf("%.3f", abund_fc), "</div>",
          "<div><strong>P-value:</strong> ", if (is.na(p_val)) "N/A" else sprintf("%.4g", p_val), "</div>",
          "<div><strong>FDR (BH):</strong> ", if (is.na(p_adj)) "N/A" else sprintf("%.4g", p_adj), "</div>",
          "<div><strong>Saturation Ratio (Comp):</strong> ", if (is.na(comp_sat_ratio)) "N/A" else sprintf("%.3f", comp_sat_ratio), "</div>",
          "<div><strong>Saturation Z-score:</strong> ", if (is.na(sat_zscore)) "N/A" else sprintf("%+.3f", sat_zscore), "</div>",
          "<div><strong>Carbon Length Change:</strong> ", if (is.na(c_change)) "N/A" else sprintf("%+.2f", c_change), "</div>",
          "<div><strong>Detected Species:</strong> ", n_sp, "</div>",
          "<div style='margin-top: 6px; font-size: 11px; color: #2563eb; font-style: italic;'>\u2726 Click & drag to bump and rebound neighboring bubbles</div>",
          "</div>"
        )
        
        init_x <- pos[1] * 55
        init_y <- pos[2] * -55
        
        nodes_list[[length(nodes_list) + 1]] <- data.frame(
          id = cls,
          label = display_label,
          title = tooltip_html,
          value = node_size,
          size = node_size,
          shape = "dot",
          x = init_x,
          y = init_y,
          color.background = fill_c,
          color.border = border_c,
          color.highlight.background = "#fef08a",
          color.highlight.border = "#b45309",
          borderWidth = if (has_data) 3.5 else 2,
          shadow = list(enabled = TRUE, color = "rgba(0,0,0,0.12)", size = 7, x = 2, y = 2),
          font.size = 14,
          font.face = "bold",
          font.color = "#0f172a",
          font.strokeWidth = 2,
          font.strokeColor = "#ffffff",
          stringsAsFactors = FALSE
        )
      }
      nodes_df <- bind_rows(nodes_list)
      
      edges_list_data <- list()
      for (e in edges_list) {
        if (e[1] %in% active && e[2] %in% active) {
          edges_list_data[[length(edges_list_data) + 1]] <- data.frame(
            from = e[1],
            to = e[2],
            arrows = "to",
            color = "#94a3b8",
            width = 2.5,
            smooth = TRUE,
            stringsAsFactors = FALSE
          )
        }
      }
      edges_df <- if (length(edges_list_data) > 0) bind_rows(edges_list_data) else data.frame(from=character(), to=character(), stringsAsFactors=FALSE)
      
      phys_enabled <- if (is.null(input$enable_physics)) TRUE else isTRUE(input$enable_physics)
      repulsion_force <- as.numeric(input$overlap_avoidance %||% 1.0)
      spring_len <- as.numeric(input$spring_length %||% 120)
      
      net <- visNetwork(nodes_df, edges_df, width = "100%", height = "720px") %>%
        visNodes(
          scaling = list(min = 18, max = 55),
          borderWidth = 3.5
        ) %>%
        visEdges(
          arrows = list(to = list(enabled = TRUE, scaleFactor = 0.75)),
          color = list(color = "#94a3b8", highlight = "#2563eb", hover = "#1d4ed8"),
          smooth = list(enabled = TRUE, type = "continuous")
        ) %>%
        visPhysics(
          enabled = phys_enabled,
          solver = "forceAtlas2Based",
          forceAtlas2Based = list(
            gravitationalConstant = -85,
            centralGravity = 0.005,
            springLength = spring_len,
            springConstant = 0.08,
            damping = 0.45,
            avoidOverlap = repulsion_force
          ),
          stabilization = list(enabled = TRUE, iterations = 80)
        ) %>%
        visInteraction(
          dragNodes = TRUE,
          dragView = TRUE,
          zoomView = TRUE,
          hover = TRUE,
          navigationButtons = TRUE,
          keyboard = TRUE
        )
      return(net)
    })
    
    observeEvent(input$stabilize_physics_btn, {
      visNetworkProxy(ns("pathwayVisNetwork")) %>%
        visPhysics(stabilization = list(enabled = TRUE, iterations = 100)) %>%
        visStabilize()
    })

    
    output$pathwayCaptionUI <- renderUI({
      contrast <- shared_data$de_contrast_info()
      comp_name <- if (!is.null(contrast)) paste(contrast$comp, collapse = ", ") else "Comparison"
      ref_name <- if (!is.null(contrast)) paste(contrast$ref, collapse = ", ") else "Reference"
      
      color_desc <- ""
      node_color_choice <- input$node_color_map %||% "sat_zscore"
      if (node_color_choice == "sat_zscore") {
        color_desc <- sprintf("Fill colors represent the Z-score of abundance-weighted saturation change (divergent scale: red indicates increased saturation / fewer double bonds in %s, blue indicates decreased saturation / more double bonds in %s, and white indicates no change). ", comp_name, comp_name)
      } else if (node_color_choice == "sat_log2fc") {
        color_desc <- sprintf("Fill colors represent the Log2 fold change of abundance-weighted saturation ratio (divergent scale: red indicates increased saturation / fewer double bonds in %s, blue indicates decreased saturation / more double bonds in %s, and white indicates no change). ", comp_name, comp_name)
      } else if (node_color_choice == "sat") {
        color_desc <- "Fill colors represent saturated fatty acid chain ratio (Plasma scale: brighter/yellow represents higher saturation, darker/purple represents lower saturation). "
      } else if (node_color_choice == "carbon") {
        color_desc <- sprintf("Fill colors represent average carbon length change (\u0394C) (divergent scale: red indicates elongation/longer chains in %s, blue indicates shortening/shorter chains in %s). ", comp_name, comp_name)
      } else if (node_color_choice == "fc") {
        color_desc <- sprintf("Fill colors represent log2 fold change of class abundance (divergent scale: red shows lipid classes upregulated in %s, while blue shows lipid classes upregulated in %s). ", comp_name, ref_name)
      }
      
      size_desc <- ""
      node_size_choice <- input$node_size_map %||% "fc_mag"
      if (node_size_choice == "fc_mag") {
        size_desc <- sprintf("Node circle sizes represent the magnitude of abundance fold change between %s and %s (larger dots indicate greater change). ", comp_name, ref_name)
      } else if (node_size_choice == "abundance") {
        size_desc <- "Node circle sizes represent the total class abundance (larger dots indicate higher abundance). "
      }
      
      outline_desc <- sprintf("Node outlines represent the direction of change: red outlines indicate upregulated lipid classes (FC > 1.0) in %s, blue outlines indicate downregulated lipid classes (FC < 1.0) in %s, and black outlines represent the baseline (FC = 1.0). ", comp_name, comp_name)
      
      tags$p(class = "text-muted small mt-2",
        tags$span(size_desc),
        tags$span(color_desc),
        tags$span(outline_desc),
        tags$span("Gray dashed circles represent pathway classes that were not detected in the dataset.")
      )
    })
    
    # -------------------------------------------------------------
    # DOWNLOAD HANDLERS
    # -------------------------------------------------------------
    output$downloadPlotCSV <- downloadHandler(
      filename = function() {
        paste0("Lipid_Pathway_Visualization_Data_", format(Sys.time(), "%Y%m%d_%H%M"), ".csv")
      },
      content = function(file) {
        metrics <- pathway_metrics()
        if (is.null(metrics) || nrow(metrics) == 0) {
          writeLines("No data available for the active contrast.", file)
          return()
        }
        metrics <- metrics[order(metrics$Class), ]
        write.csv(metrics, file, row.names = FALSE)
      }
    )
    
    create_plotly_download <- function(plotly_obj, dims, file_prefix) {
      downloadHandler(
        filename = function() paste0(file_prefix, "_", format(Sys.time(), "%Y%m%d_%H%M"), ".pdf"),
        content = function(file) {
          tryCatch({
            fig <- plotly_obj()
            req(fig)
            d <- dims()
            fig <- fig %>% layout(width = d$width, height = d$height)
            
            tmp <- tempfile(fileext = ".html")
            htmlwidgets::saveWidget(fig, tmp, selfcontained = TRUE)
            webshot2::webshot(tmp, file, vwidth = d$width, vheight = d$height)
          }, error = function(file_err) {
            pdf(file, width = 11, height = 8.5)
            plot(0, 0, type = "n", axes = FALSE, xlab = "", ylab = "")
            text(0, 0, paste("ERROR in PDF render:\n", file_err$message), col = "red", cex = 0.8)
            dev.off()
          })
        },
        contentType = "application/pdf"
      )
    }
    
    output$downloadPlotPDF <- create_plotly_download(
      reactive({ buildPathwayPlot() }),
      reactive({ plot_dims$pathway }),
      "Lipid_Pathway_Visualization"
    )
    
    # -------------------------------------------------------------
    # SUMMARY TABLE
    # -------------------------------------------------------------
    output$summaryTable <- DT::renderDataTable({
      metrics <- pathway_metrics()
      if (is.null(metrics) || nrow(metrics) == 0) {
        return(DT::datatable(data.frame(Message = "Please select reference/comparison groups in Sidebar Panel 3 to generate pathway breakdown data.")))
      }
      
      metrics_formatted <- metrics %>%
        dplyr::mutate(
          Fold_Change = round(Fold_Change, 3),
          Saturation_Ratio = round(Saturation_Ratio, 3),
          Ref_Sat_Ratio = round(Ref_Sat_Ratio, 3),
          Comp_Sat_Ratio = round(Comp_Sat_Ratio, 3),
          Saturation_Log2FC = round(Saturation_Log2FC, 3),
          Saturation_ZScore = round(Saturation_ZScore, 3),
          Ref_Carbon = round(Ref_Carbon, 2),
          Comp_Carbon = round(Comp_Carbon, 2),
          Carbon_Change = round(Carbon_Change, 2),
          Ref_Abundance = round(Ref_Abundance, 1),
          Comp_Abundance = round(Comp_Abundance, 1),
          Abundance_FC = round(Abundance_FC, 3),
          P_Value = round(P_Value, 5),
          P_Adj = round(P_Adj, 5)
        ) %>%
        dplyr::select(
          `Lipid Class` = Class,
          `Fold Change (Log2-based)` = Fold_Change,
          `Abundance (Ref)` = Ref_Abundance,
          `Abundance (Comp)` = Comp_Abundance,
          `Abundance Ratio (Linear)` = Abundance_FC,
          `Saturation Ratio (Static)` = Saturation_Ratio,
          `Saturation Ratio (Ref)` = Ref_Sat_Ratio,
          `Saturation Ratio (Comp)` = Comp_Sat_Ratio,
          `Saturation Change (Log2FC)` = Saturation_Log2FC,
          `Saturation Change (Z-Score)` = Saturation_ZScore,
          `Avg Carbon Length (Ref)` = Ref_Carbon,
          `Avg Carbon Length (Comp)` = Comp_Carbon,
          `Carbon Length Change` = Carbon_Change,
          `P-Value (Raw)` = P_Value,
          `FDR (BH-Adjusted)` = P_Adj,
          `Species Count` = Species_Count
        )
      
      DT::datatable(
        metrics_formatted,
        options = list(pageLength = 10, scrollX = TRUE),
        rownames = FALSE
      )
    })
  })
}
