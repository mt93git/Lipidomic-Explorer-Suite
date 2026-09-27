# R/modules/14_cellular_org_module.R
# Cellular Organization & Subcellular Stress Module
# Calculates and visualizes organelle-specific stress indicators, CPI, and immune cell signatures.

# --- Helper Functions (Internal to Module) ---

calculate_cpi <- function(value, db) {
  # CPI = 0.014*%mono + 1.0*%di + 2.0*%tri + 3.2*%tetra + 4.0*%penta + 5.4*%hexa
  total_val <- sum(value, na.rm = TRUE)
  if (total_val == 0) return(0)
  
  p_mono  <- sum(value[which(db == 1)], na.rm = TRUE) / total_val * 100
  p_di    <- sum(value[which(db == 2)], na.rm = TRUE) / total_val * 100
  p_tri   <- sum(value[which(db == 3)], na.rm = TRUE) / total_val * 100
  p_tetra <- sum(value[which(db == 4)], na.rm = TRUE) / total_val * 100
  p_penta <- sum(value[which(db == 5)], na.rm = TRUE) / total_val * 100
  p_hexa  <- sum(value[which(db >= 6)], na.rm = TRUE) / total_val * 100 # Hexaenoic and above
  
  cpi <- (0.014 * p_mono) + (1.0 * p_di) + (2.0 * p_tri) + (3.2 * p_tetra) + (4.0 * p_penta) + (5.4 * p_hexa)
  return(cpi)
}

# --- Module UI ---

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
            helpText("Calculates organelle stress scores, cellular peroxidation indices (CPI) for ferroptosis vulnerability, and M1/M2 phenotypic trajectories directly from your parsed lipidomics data.")
          ),
          accordion_panel("2. Data Visualization", icon = icon("paint-brush"),
            accordion(
              open = "M1/M2 Phenotype State", multiple = TRUE,
              accordion_panel("M1/M2 Phenotype State", icon = icon("users"),
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
          subtitle = "This module projects lipid abundance profiles onto subcellular organelles and functional phenotypes:",
          bullets = list(
            tags$li(tags$strong("Subcellular Stress Profiles:"), " Assess stress signatures (curvature, saturation, degradative capacity) across lysosomes, peroxisomes, Golgi, mitochondria, and ER."),
            tags$li(tags$strong("Cellular Peroxidation Index:"), " Quantify lipid susceptibility to free-radical peroxidation and ferroptotic cell death based on polyunsaturated content."),
            tags$li(tags$strong("Phenotypic State Map:"), " Map sample trajectories along neutral storage (M1-like inflammatory) and structural complexity (M2-like resolving) axes.")
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
          nav_panel("Subcellular Stress Profiles", 
            card_header(
              class = "d-flex justify-content-between align-items-center",
              "Organelle Stress Profile Comparison",
              tags$div(
                downloadButton(ns("downloadStressCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                downloadButton(ns("downloadStressPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
              )
            ),
            card_body(
              uiOutput(ns("baseline_status_banner_stress")),
              jqui_resizable(plotOutput(ns("stressPlot"), height = "600px")),
              uiOutput(ns("stress_note")),
              markdown("
> **Subcellular Indices Interpretation**:
> * **ER Curvature Stress**: PE / PC ratio. Conical PE (phosphatidylethanolamines) alters membrane curvature compared to cylindrical PC (phosphatidylecholines), impacting ER membrane packaging.
> * **ER Saturation Score**: Log2 ratio of Saturated PC / Unsaturated PC. Highly saturated chains pack tightly, reducing membrane fluidity. Negative values indicate double-bond enrichment (unsaturation).
> * **Mitochondrial PG/CL Ratio**: PG / CL ratio. Elevation indicates block of cardiolipin maturation or remodeling.
> * **FAO Acylcarnitine Stress**: Relative accumulation of acylcarnitines indicating matrix fatty acid oxidation stall.
> * **Lysosomal BMP Mass**: Normalized BMP/LBPA abundance indicating endolysosomal capacity.
> * **Peroxisomal Dysfunction**: VLCFA-to-ether lipid ratio. Higher values suggest peroxisomal transport/oxidase failure (accumulation of very long-chain fatty acids relative to ether lipids).
> * **Golgi Secretory Arrest**: Cer / SM ratio. Elevated ratio indicates block of conversion of ceramides to sphingomyelins.
              ")
            )
          ),
          nav_panel("Ferroptosis & Peroxidation (CPI)", 
            card_header(
              class = "d-flex justify-content-between align-items-center",
              "Cellular Peroxidation Index (CPI) & Vulnerability",
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
> Higher scores indicate a massive concentration of bis-allylic carbons (specifically in arachidonoyl/adrenoyl tails), reflecting extreme susceptibility to GPX4-inhibitor-induced ferroptotic rupture.
              ")
            )
          ),
          nav_panel("M1/M2 Phenotype State", 
            card_header(
              class = "d-flex justify-content-between align-items-center",
              "Macrophage M1/M2 & Storage vs. Complexity Trajectory",
              tags$div(
                downloadButton(ns("downloadPolarCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                downloadButton(ns("downloadPolarPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
              )
            ),
            card_body(
              jqui_resizable(plotOutput(ns("polarPlot"), height = "600px")),
              uiOutput(ns("polar_note")),
              markdown("
> **Phenotypic State Quadrants**:
> * **Top-Left (M1 Storage)**: Enriched in neutral storage lipids (TGs, DGs, CEs). Corresponds to classically activated, glycolysis-dependent inflammatory macrophages.
> * **Bottom-Right (M2 Structural)**: Enriched in ether lipids (plasmalogens) and complex sphingomyelins. Corresponds to alternatively activated, resolving macrophages configured for efferocytosis.
> * **Top-Right (Complex/Hypertrophic)**: High neutral storage and high membrane complexity.
> * **Bottom-Left (Undifferentiated)**: Low storage and low structural complexity.
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

# --- Module Server ---

cellular_org_server <- function(id, shared_data, global_color_map) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    
    # Store custom level orders
    level_prefs <- reactiveValues()
    
    # Track plot sizes dynamically for WYSIWYG exporting
    plot_dims <- reactiveValues(
      stress = list(width = 800, height = 600),
      cpi = list(width = 800, height = 600),
      polar = list(width = 800, height = 600)
    )
    
    observeEvent(input$stressPlot_size, {
      plot_dims$stress <- input$stressPlot_size
    })
    observeEvent(input$cpiPlot_size, {
      plot_dims$cpi <- input$cpiPlot_size
    })
    observeEvent(input$polarPlot_size, {
      plot_dims$polar <- input$polarPlot_size
    })
    
    # Dynamic baseline selector UI
    output$baselineSelectorUI <- renderUI({
      selectizeInput(session$ns("selectedBaseline"), 
                     tags$span("Reference Baseline:", 
                               bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                              "Select one or more group levels to serve as the baseline for statistical comparisons.")), 
                     choices = NULL, 
                     selected = NULL,
                     multiple = TRUE)
    })
    outputOptions(output, "baselineSelectorUI", suspendWhenHidden = FALSE)
    
    # Dynamically update groupingMetadata choices with informative condition labels
    observe({
      meta <- shared_data$all_metadata()
      req(meta)
      valid_cols <- c("Group1")
      if ("Group2" %in% names(meta)) {
        g2_clean <- meta$Group2[!is.na(meta$Group2) & nzchar(meta$Group2) & meta$Group2 != "Unspecified"]
        if (length(unique(g2_clean)) > 0) valid_cols <- c(valid_cols, "Group2")
      }
      choices <- get_metadata_group_named_choices(valid_cols, meta)
      curr_sel <- isolate(input$groupingMetadata)
      selected <- determine_active_grouping_selection(meta, valid_cols, curr_sel)
      updateSelectizeInput(session, "groupingMetadata", choices = choices, selected = selected)
    })
    
    observe({
      meta <- shared_data$all_metadata()
      val <- input$groupingMetadata
      req(meta, length(val) > 0)
      
      if (input$comparisonStrategy == "Global (Combined Reference)" || length(val) == 1) {
        if (length(val) == 1) {
          choices <- unique(meta[[val]])
        } else {
          choices <- apply(meta[, val, drop=FALSE], 1, paste, collapse="_")
          choices <- unique(choices)
        }
      } else {
        x_col <- val[length(val)]
        choices <- unique(meta[[x_col]])
      }
      
      choices <- sort(choices[!is.na(choices) & choices != ""])
      
      curr_sel <- input$selectedBaseline
      valid_sel <- intersect(curr_sel, choices)
      sel <- if (length(valid_sel) > 0) valid_sel else (if (length(choices) > 0) choices[1] else NULL)
      
      updateSelectizeInput(session, "selectedBaseline", choices = choices, selected = sel)
    })
    
    SHAPE_CHOICES <- c("Circle" = 16, "Square" = 15, "Triangle" = 17, "Diamond" = 18, "Plus" = 3, "Cross" = 4, "Star" = 8)
    
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
    
    # Polar Aesthetics: Synchronized palettes and shapes
    polar_base_color_map <- reactive({
      group_cols <- input$colorGrouping
      if (length(group_cols) == 0) group_cols <- "Group1"
      key <- paste(group_cols, collapse = " & ")
      
      base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[key]], error = function(e) NULL) else NULL) %||%
                  tryCatch(shared_data$color_maps()[[key]], error = function(e) NULL)
      
      meta <- shared_data$all_metadata()
      if (is.null(base_map) && !is.null(meta)) {
        comb_vals <- apply(meta[, group_cols, drop = FALSE], 1, function(row) {
          vals <- as.character(row)
          vals <- vals[!is.na(vals) & vals != "Unspecified"]
          if (length(vals) == 0) "Unspecified" else paste(vals, collapse = "_")
        })
        lvls <- sort(unique(comb_vals))
        pal <- RColorBrewer::brewer.pal(min(9, max(3, length(lvls))), "Set1")
        if (length(lvls) > length(pal)) pal <- colorRampPalette(pal)(length(lvls))
        base_map <- stats::setNames(pal[1:length(lvls)], lvls)
      }
      base_map
    })

    polar_active_color_map <- reactive({
      base_map <- polar_base_color_map()
      req(base_map)
      if (isTRUE(input$useCustomColors)) {
        for (g in names(base_map)) {
          raw_id <- paste0("customCol_", gsub("\\s|&", "_", g))
          val <- input[[raw_id]]
          if (!is.null(val) && nzchar(val)) {
            base_map[[g]] <- val
          }
        }
      }
      base_map
    })

    polar_base_shape_map <- reactive({
      shape_col <- input$shapeGrouping %||% "Group2"
      base_smap <- tryCatch(shared_data$shape_maps()[[shape_col]], error = function(e) NULL)
      
      meta <- shared_data$all_metadata()
      if (is.null(base_smap) && !is.null(meta) && shape_col %in% names(meta)) {
        lvls <- sort(unique(na.omit(as.character(meta[[shape_col]]))))
        base_smap <- stats::setNames(rep(SHAPE_CHOICES, length.out = length(lvls))[1:length(lvls)], lvls)
      }
      base_smap
    })

    polar_active_shape_map <- reactive({
      base_smap <- polar_base_shape_map()
      req(base_smap)
      if (isTRUE(input$useShapes)) {
        for (g in names(base_smap)) {
          raw_id <- paste0("customShape_", gsub("\\s|&", "_", g))
          val <- input[[raw_id]]
          if (!is.null(val) && nzchar(val)) {
            base_smap[[g]] <- as.numeric(val)
          }
        }
      }
      base_smap
    })

    output$customColorUI <- renderUI({
      req(isTRUE(input$useCustomColors))
      colors <- polar_base_color_map()
      req(colors)
      group_names <- names(colors)
      validate(need(length(group_names) > 0, "No groups for custom colors."))
      lapply(group_names, function(g) {
        raw_id <- paste0("customCol_", gsub("\\s|&", "_", g))
        saved_val <- if (!is.null(input[[raw_id]])) input[[raw_id]] else colors[[g]]
        colourpicker::colourInput(session$ns(raw_id), paste("Color for", g), value = saved_val)
      })
    })

    output$customShapeUI <- renderUI({
      req(isTRUE(input$useShapes))
      shapes <- polar_base_shape_map()
      req(shapes)
      group_names <- names(shapes)
      validate(need(length(group_names) > 0, "No groups for custom shapes."))
      lapply(group_names, function(g) {
        raw_id <- paste0("customShape_", gsub("\\s|&", "_", g))
        saved_val <- if (!is.null(input[[raw_id]])) input[[raw_id]] else shapes[[g]]
        selectInput(session$ns(raw_id), paste("Shape for", g), choices = SHAPE_CHOICES, selected = saved_val)
      })
    })
    
    # Reactive calculations of all indices per sample
    computed_metrics <- reactive({
      df <- shared_data$data_processed()
      anno <- shared_data$annotationData()
      meta <- shared_data$grouped_metadata()
      req(df, anno, meta)
      
      # Pivot to long format and join with annotations and metadata
      df_long <- df %>%
        tidyr::pivot_longer(cols = -Lipid_Name, names_to = "Sample", values_to = "Value") %>%
        dplyr::left_join(anno, by = "Lipid_Name") %>%
        dplyr::left_join(meta, by = c("Sample" = "FullName"))
      
      # If Dynamic_DE_Group is not present, create it from Group
      if (!"Dynamic_DE_Group" %in% names(df_long)) {
        df_long$Dynamic_DE_Group <- df_long$Group
      }
      
      # Calculate total lipid sum per sample
      total_sums <- df_long %>%
        dplyr::group_by(Sample) %>%
        dplyr::summarize(Total = sum(Value, na.rm = TRUE), .groups = "drop")
      
      # Compute subclass totals per sample
      class_totals <- df_long %>%
        dplyr::group_by(Sample, subclass) %>%
        dplyr::summarize(Subclass_Total = sum(Value, na.rm = TRUE), .groups = "drop") %>%
        tidyr::pivot_wider(names_from = subclass, values_from = Subclass_Total, values_fill = 0)
      
      # Join with total sums
      metrics_df <- total_sums %>%
        dplyr::left_join(class_totals, by = "Sample")
      
      # Helper to get subclass sum safely
      get_sub <- function(cls) {
        if (cls %in% names(metrics_df)) metrics_df[[cls]] else rep(0, nrow(metrics_df))
      }
      
      # Compute indices per sample
      metrics_df$er_curvature <- get_sub("GP_PE") / (get_sub("GP_PC") + 1e-9)
      
      # ER Saturation Score: log2(Saturated PC / Unsaturated PC)
      pc_sat_unsat <- df_long %>%
        dplyr::filter(subclass == "GP_PC") %>%
        dplyr::group_by(Sample) %>%
        dplyr::summarize(
          Sat_PC = sum(Value[which(Total_DB == 0)], na.rm = TRUE),
          Unsat_PC = sum(Value[which(Total_DB > 0)], na.rm = TRUE),
          .groups = "drop"
        )
      
      metrics_df <- metrics_df %>%
        dplyr::left_join(pc_sat_unsat, by = "Sample")
      metrics_df$er_saturation <- log2((metrics_df$Sat_PC + 1e-9) / (metrics_df$Unsat_PC + 1e-9))
      metrics_df$er_saturation[is.na(metrics_df$er_saturation)] <- 0
      
      # Mitochondrial PG/CL ratio
      metrics_df$mito_pg_cl <- get_sub("GP_PG") / (get_sub("GP_CL") + 1e-9)
      
      # FAO Acylcarnitine stress (Acar / Total * 1000)
      metrics_df$mito_fao_stress <- (get_sub("FA_ACar") / (metrics_df$Total + 1e-9)) * 1000
      
      # Lysosomal BMP Mass (% of total)
      bmp_vals <- get_sub("GP_BMP") + get_sub("BMP") + get_sub("LBPA")
      metrics_df$lyso_bmp <- (bmp_vals / (metrics_df$Total + 1e-9)) * 100
      
      # Peroxisomal VLCFA/ether ratio
      vlcfa_sums <- df_long %>%
        dplyr::group_by(Sample) %>%
        dplyr::summarize(VLCFA_Sum = sum(Value[which(Has_VLCFA == TRUE)], na.rm = TRUE), .groups = "drop")
      metrics_df <- metrics_df %>%
        dplyr::left_join(vlcfa_sums, by = "Sample")
      
      ether_sums <- get_sub("GP_PE_P") + get_sub("GP_PE_E") + get_sub("GP_PC_P") + get_sub("GP_PC_E")
      metrics_df$peroxisome_stress <- metrics_df$VLCFA_Sum / (ether_sums + 1e-9)
      
      # Golgi Secretory Arrest: Ceramide / SM
      metrics_df$golgi_arrest <- get_sub("SP_Cer") / (get_sub("SP_SM") + 1e-9)
      
      # Compute CPI (Cellular Peroxidation Index)
      cpi_sums <- df_long %>%
        dplyr::group_by(Sample) %>%
        dplyr::summarize(CPI = calculate_cpi(Value, Total_DB), .groups = "drop")
      metrics_df <- metrics_df %>%
        dplyr::left_join(cpi_sums, by = "Sample")
      
      # M1 Score: Neutral Lipids (TG + DG + CE)
      metrics_df$m1_score <- get_sub("GL_TAG") + get_sub("GL_DAG") + get_sub("ST_CE")
      
      # M2 Score: Structural/Ether Lipids (PE_P + PE_E + PC_P + PC_E + SM + Cer)
      metrics_df$m2_score <- ether_sums + get_sub("SP_SM") + get_sub("SP_Cer")
      
      # Scale scores for M1/M2 state visualization (relative percentages)
      metrics_df$m1_scaled <- (metrics_df$m1_score / (metrics_df$Total + 1e-9)) * 100
      metrics_df$m2_scaled <- (metrics_df$m2_score / (metrics_df$Total + 1e-9)) * 100
      
      # Re-join with complete sample-level metadata
      all_meta <- shared_data$all_metadata()
      if (!is.null(all_meta) && "FullName" %in% names(all_meta)) {
        cols_to_add <- setdiff(names(all_meta), names(metrics_df))
        metrics_df <- metrics_df %>%
          dplyr::left_join(all_meta %>% dplyr::select(FullName, dplyr::all_of(cols_to_add)), by = c("Sample" = "FullName"))
      } else {
        sample_meta <- meta %>%
          dplyr::select(FullName, dplyr::any_of(c("Group1", "Group2", "TimePoint", "Group", "Dynamic_DE_Group")))
        metrics_df <- metrics_df %>%
          dplyr::left_join(sample_meta, by = c("Sample" = "FullName"))
      }
      
      # Apply manual level ordering if available
      grp_var <- input$groupingMetadata[1] %||% "Group1"
      if (grp_var %in% names(metrics_df)) {
        pref <- level_prefs[[grp_var]]
        unique_vals <- unique(na.omit(as.character(metrics_df[[grp_var]])))
        if (!is.null(pref) && length(pref) > 0) {
          valid_pref <- intersect(pref, unique_vals)
          remainder <- sort(setdiff(unique_vals, valid_pref))
          metrics_df[[grp_var]] <- factor(metrics_df[[grp_var]], levels = c(valid_pref, remainder))
        } else {
          lvls <- sort(unique_vals)
          metrics_df[[grp_var]] <- factor(metrics_df[[grp_var]], levels = lvls)
        }
      }
      
      return(metrics_df)
    })
    
    active_color_map <- reactive({
      meta <- shared_data$all_metadata()
      req(meta)
      
      val <- input$groupingMetadata
      req(length(val) > 0)
      
      target <- input$color_target_var
      default_target <- if (length(val) > 1) {
        if (input$comparisonStrategy == "Faceted (Intra-group Reference)") val[length(val)] else "Combined_Grouping"
      } else {
        val[1]
      }
      if (is.null(target) || (target != "Combined_Grouping" && !target %in% names(meta))) {
        target <- default_target
      }
      
      if (target == "Combined_Grouping") {
        comb_vals <- apply(meta[, val, drop = FALSE], 1, paste, collapse = "_")
        levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != ""]))
      } else {
        raw_vals <- meta[[target]]
        levels <- sort(unique(raw_vals[!is.na(raw_vals) & raw_vals != ""]))
      }
      
      base_map <- NULL
      if (target != "Combined_Grouping") {
        base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[target]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[target]], error = function(e) NULL)
      } else {
        comb_key <- paste(val, collapse = " & ")
        base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[comb_key]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[comb_key]], error = function(e) NULL)
      }
      
      if (is.null(base_map) || !all(levels %in% names(base_map))) {
        pal <- RColorBrewer::brewer.pal(min(9, max(3, length(levels))), "Set1")
        if (length(levels) > length(pal)) pal <- colorRampPalette(pal)(length(levels))
        fallback_map <- stats::setNames(pal[1:length(levels)], levels)
        if (is.null(base_map)) {
          base_map <- fallback_map
        } else {
          missing_lvls <- setdiff(levels, names(base_map))
          base_map <- c(base_map, fallback_map[missing_lvls])
        }
      }
      
      cmap <- base_map[levels]
      
      # Apply custom overrides from color pickers
      safe_col <- gsub("[^A-Za-z0-9]", "", target)
      for (lvl in levels) {
        safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
        id <- paste0("cp_", safe_col, "_", safe_lvl)
        picker_val <- input[[id]]
        if (!is.null(picker_val) && nzchar(picker_val)) {
          cmap[lvl] <- picker_val
        }
      }
      
      return(cmap)
    })
    
    # Palette configuration
    color_scale <- reactive({
      req(active_color_map())
      scale_color_manual(values = active_color_map())
    })
    
    fill_scale <- reactive({
      req(active_color_map())
      scale_fill_manual(values = active_color_map())
    })
    
    # --- DECOUPLED PLOT BUILDERS ---
    
    buildStressPlot <- reactive({
      stress_features <- c(
        "er_curvature",
        "er_saturation",
        "mito_pg_cl",
        "mito_fao_stress",
        "lyso_bmp",
        "peroxisome_stress",
        "golgi_arrest"
      )
      
      df_met <- computed_metrics()
      req(df_met)
      
      df_met_rename <- df_met %>%
        dplyr::rename(
          `ER Curvature (PE/PC)` = er_curvature,
          `ER Saturation (PC Sat/Unsat)` = er_saturation,
          `Mito PG/CL (Maturation)` = mito_pg_cl,
          `FAO Stall (Acylcarnitine)` = mito_fao_stress,
          `Lysosomal Density (% BMP)` = lyso_bmp,
          `Peroxisomal (VLCFA/Ether)` = peroxisome_stress,
          `Golgi Arrest (Cer/SM)` = golgi_arrest
        )
      
      nice_features <- c(
        "ER Curvature (PE/PC)",
        "ER Saturation (PC Sat/Unsat)",
        "Mito PG/CL (Maturation)",
        "FAO Stall (Acylcarnitine)",
        "Lysosomal Density (% BMP)",
        "Peroxisomal (VLCFA/Ether)",
        "Golgi Arrest (Cer/SM)"
      )
      
      meta_df <- shared_data$all_metadata()
      req(meta_df)
      
      df_long <- df_met_rename %>%
        dplyr::select(Sample, dplyr::all_of(nice_features)) %>%
        tidyr::pivot_longer(cols = -Sample, names_to = "Feature", values_to = "Plot_Value")
      
      val <- input$groupingMetadata
      req(length(val) > 0)
      
      meta_mapped <- meta_df %>% dplyr::select(FullName, dplyr::all_of(val))
      meta_mapped$GroupingVal <- apply(meta_mapped[, val, drop=FALSE], 1, paste, collapse = "_")
      
      if (length(val) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") {
        meta_mapped$Facet_Grp <- apply(meta_mapped[, val[-length(val)], drop=FALSE], 1, paste, collapse = "_")
        meta_mapped$X_Grp <- meta_mapped[[ val[length(val)] ]]
      } else {
        meta_mapped$Facet_Grp <- "All"
        meta_mapped$X_Grp <- meta_mapped$GroupingVal
      }
      
      df_prop <- df_long %>%
        dplyr::left_join(meta_mapped, by=c("Sample"="FullName"))
      
      ordered_samples <- setdiff(colnames(shared_data$data_processed()), "Lipid_Name")
      meta_ordered <- meta_df %>% 
        dplyr::filter(FullName %in% ordered_samples)
        
      for (col in val) {
        if (!is.null(level_prefs[[col]])) {
          valid_pref <- intersect(level_prefs[[col]], unique(meta_ordered[[col]]))
          remainder <- setdiff(unique(meta_ordered[[col]]), valid_pref)
          meta_ordered[[col]] <- factor(meta_ordered[[col]], levels = c(valid_pref, remainder))
        } else {
          meta_ordered[[col]] <- factor(meta_ordered[[col]])
        }
      }
      meta_ordered <- meta_ordered %>% dplyr::arrange(dplyr::across(dplyr::all_of(val)))
      meta_ordered$GroupingVal <- apply(meta_ordered[, val, drop=FALSE], 1, paste, collapse="_")
      ordered_groups <- unique(meta_ordered$GroupingVal)
      if (!is.null(level_prefs[["Combined_Grouping"]])) {
        valid_cg <- intersect(level_prefs[["Combined_Grouping"]], ordered_groups)
        ordered_groups <- c(valid_cg, setdiff(ordered_groups, valid_cg))
      }
      
      if (length(val) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") {
        meta_ordered$Facet_Grp <- apply(meta_ordered[, val[-length(val)], drop=FALSE], 1, paste, collapse="_")
        x_col_name <- val[length(val)]
        meta_ordered$X_Grp <- meta_ordered[[ x_col_name ]]
        ordered_facets <- unique(meta_ordered$Facet_Grp)
        ordered_xs <- levels(meta_ordered[[ x_col_name ]])
      } else {
        ordered_facets <- "All"
        meta_ordered$Facet_Grp <- "All"
        if (length(val) == 1) {
          ordered_xs <- levels(meta_ordered[[ val[1] ]])
          ordered_groups <- intersect(ordered_xs, ordered_groups)
        } else {
          ordered_xs <- ordered_groups
        }
        meta_ordered$X_Grp <- factor(meta_ordered$GroupingVal, levels = ordered_xs)
      }
      
      baseline_grp <- input$selectedBaseline
      if (is.null(baseline_grp) || length(baseline_grp) == 0 || all(!nzchar(trimws(baseline_grp)))) return(NULL)
      
      if (input$comparisonStrategy == "Faceted (Intra-group Reference)" && length(val) > 1) {
        plot_db_all <- df_prop %>%
          dplyr::mutate(Is_Baseline = (X_Grp %in% baseline_grp))
      } else {
        plot_db_all <- df_prop %>%
          dplyr::mutate(Is_Baseline = (GroupingVal %in% baseline_grp))
      }
      
      stats_df <- data.frame()
      resolved_method <- "t_test"
      
      if (input$comparisonStrategy == "Faceted (Intra-group Reference)" && length(val) > 1) {
        ref_x <- baseline_grp[1]
        for(feat in unique(plot_db_all$Feature)) {
          sub_f <- plot_db_all %>% dplyr::filter(Feature == feat)
          for(fac in unique(sub_f$Facet_Grp)) {
            f_facet_df <- sub_f %>% dplyr::filter(Facet_Grp == fac)
            base_vals <- f_facet_df %>% dplyr::filter(X_Grp == ref_x) %>% dplyr::pull(Plot_Value)
            for(g in setdiff(unique(f_facet_df$X_Grp), ref_x)) {
              comp_vals <- f_facet_df %>% dplyr::filter(X_Grp == g) %>% dplyr::pull(Plot_Value)
              p_val <- NA
              stars <- "ns"
              if(length(base_vals)>=2 && length(comp_vals)>=2) {
                v_base <- var(base_vals,na.rm=T)
                v_comp <- var(comp_vals,na.rm=T)
                if(!is.na(v_base) && !is.na(v_comp) && !(v_base == 0 && v_comp == 0)) {
                  tt <- tryCatch(compute_local_p_val(base_vals, comp_vals, method = resolved_method, paired = FALSE), error=function(e) NA)
                  if(!is.na(tt)) {
                    p_val <- tt
                    if(p_val < 0.001) stars <- "***"
                    else if(p_val < 0.01) stars <- "**"
                    else if(p_val < 0.05) stars <- "*"
                  }
                }
              }
              grp_val_actual <- unique(f_facet_df$GroupingVal[f_facet_df$X_Grp == g])[1]
              if(!is.na(grp_val_actual)) {
                stats_df <- rbind(stats_df, data.frame(Feature=feat, GroupingVal=grp_val_actual, P_Value=p_val, Significance=stars))
              }
            }
          }
        }
      } else {
        for(feat in unique(plot_db_all$Feature)) {
          sub_f <- plot_db_all %>% dplyr::filter(Feature == feat)
          base_vals <- sub_f %>% dplyr::filter(GroupingVal %in% baseline_grp) %>% dplyr::pull(Plot_Value)
          for(g in setdiff(ordered_groups, baseline_grp)) {
            comp_vals <- sub_f %>% dplyr::filter(GroupingVal == g) %>% dplyr::pull(Plot_Value)
            p_val <- NA
            stars <- "ns"
            if(length(base_vals)>=2 && length(comp_vals)>=2) {
              v_base <- var(base_vals,na.rm=T)
              v_comp <- var(comp_vals,na.rm=T)
              if(!is.na(v_base) && !is.na(v_comp) && !(v_base == 0 && v_comp == 0)) {
                tt <- tryCatch(compute_local_p_val(base_vals, comp_vals, method = resolved_method, paired = FALSE), error=function(e) NA)
                if(!is.na(tt)) {
                  p_val <- tt
                  if(p_val < 0.001) stars <- "***"
                  else if(p_val < 0.01) stars <- "**"
                  else if(p_val < 0.05) stars <- "*"
                }
              }
            }
            stats_df <- rbind(stats_df, data.frame(Feature=feat, GroupingVal=g, P_Value=p_val, Significance=stars))
          }
        }
      }
      
      if(nrow(stats_df) > 0) {
        plot_db_all <- plot_db_all %>% dplyr::left_join(stats_df, by=c("Feature", "GroupingVal"))
        plot_db_all$Significance[is.na(plot_db_all$Significance) & plot_db_all$Is_Baseline == TRUE] <- "Reference"
      } else {
        plot_db_all$P_Value <- NA
        plot_db_all$Significance <- "ns"
        plot_db_all$Significance[plot_db_all$Is_Baseline == TRUE] <- "Reference"
      }
      
      plot_db_all$GroupingVal <- factor(plot_db_all$GroupingVal, levels = ordered_groups)
      if (length(val) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") {
        plot_db_all$X_Grp <- factor(plot_db_all$X_Grp, levels = ordered_xs)
        plot_db_all$Facet_Grp <- factor(plot_db_all$Facet_Grp, levels = ordered_facets)
      } else {
        plot_db_all$X_Grp <- factor(plot_db_all$X_Grp, levels = ordered_xs)
      }
      
      c_var <- input$color_target_var
      default_c_var <- if (length(val) > 1) {
        if (input$comparisonStrategy == "Faceted (Intra-group Reference)") val[length(val)] else "Combined_Grouping"
      } else {
        val[1]
      }
      if (is.null(c_var) || (c_var != "Combined_Grouping" && !c_var %in% names(plot_db_all))) {
        c_var <- default_c_var
      }
      if (c_var == "Combined_Grouping") {
        plot_db_all$Combined_Grouping <- plot_db_all$GroupingVal
      }
      
      cmap <- active_color_map()
      p <- plot_logratio_violin(
        df = plot_db_all,
        target_features = nice_features,
        baseline_groups = input$selectedBaseline,
        color_mapping = cmap,
        color_var = c_var,
        y_label = "Computed Index Value",
        sig_display_type = input$sigDisplayType %||% "star"
      )
      
      if (!is.null(p)) {
        p <- p + labs(
          title = "Organelle stress profile comparisons across cohorts",
          subtitle = "Violin distribution showing sample density and technical variance"
        )
      }
      p
    })
    
    buildCpiPlot <- reactive({
      df_met <- computed_metrics()
      req(df_met)
      meta_df <- shared_data$all_metadata()
      req(meta_df)
      
      df_long <- df_met %>%
        dplyr::select(Sample, Plot_Value = CPI) %>%
        dplyr::mutate(Feature = "CPI")
      
      val <- input$groupingMetadata
      req(length(val) > 0)
      
      meta_mapped <- meta_df %>% dplyr::select(FullName, dplyr::all_of(val))
      meta_mapped$GroupingVal <- apply(meta_mapped[, val, drop=FALSE], 1, paste, collapse = "_")
      
      if (length(val) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") {
        meta_mapped$Facet_Grp <- apply(meta_mapped[, val[-length(val)], drop=FALSE], 1, paste, collapse = "_")
        meta_mapped$X_Grp <- meta_mapped[[ val[length(val)] ]]
      } else {
        meta_mapped$Facet_Grp <- "All"
        meta_mapped$X_Grp <- meta_mapped$GroupingVal
      }
      
      df_prop <- df_long %>%
        dplyr::left_join(meta_mapped, by=c("Sample"="FullName"))
      
      ordered_samples <- setdiff(colnames(shared_data$data_processed()), "Lipid_Name")
      meta_ordered <- meta_df %>% 
        dplyr::filter(FullName %in% ordered_samples)
        
      for (col in val) {
        if (!is.null(level_prefs[[col]])) {
          valid_pref <- intersect(level_prefs[[col]], unique(meta_ordered[[col]]))
          remainder <- setdiff(unique(meta_ordered[[col]]), valid_pref)
          meta_ordered[[col]] <- factor(meta_ordered[[col]], levels = c(valid_pref, remainder))
        } else {
          meta_ordered[[col]] <- factor(meta_ordered[[col]])
        }
      }
      meta_ordered <- meta_ordered %>% dplyr::arrange(dplyr::across(dplyr::all_of(val)))
      meta_ordered$GroupingVal <- apply(meta_ordered[, val, drop=FALSE], 1, paste, collapse="_")
      ordered_groups <- unique(meta_ordered$GroupingVal)
      if (!is.null(level_prefs[["Combined_Grouping"]])) {
        valid_cg <- intersect(level_prefs[["Combined_Grouping"]], ordered_groups)
        ordered_groups <- c(valid_cg, setdiff(ordered_groups, valid_cg))
      }
      
      if (length(val) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") {
        meta_ordered$Facet_Grp <- apply(meta_ordered[, val[-length(val)], drop=FALSE], 1, paste, collapse="_")
        x_col_name <- val[length(val)]
        meta_ordered$X_Grp <- meta_ordered[[ x_col_name ]]
        ordered_facets <- unique(meta_ordered$Facet_Grp)
        ordered_xs <- levels(meta_ordered[[ x_col_name ]])
      } else {
        ordered_facets <- "All"
        meta_ordered$Facet_Grp <- "All"
        if (length(val) == 1) {
          ordered_xs <- levels(meta_ordered[[ val[1] ]])
          ordered_groups <- intersect(ordered_xs, ordered_groups)
        } else {
          ordered_xs <- ordered_groups
        }
        meta_ordered$X_Grp <- factor(meta_ordered$GroupingVal, levels = ordered_xs)
      }
      
      baseline_grp <- input$selectedBaseline
      if (is.null(baseline_grp) || length(baseline_grp) == 0 || all(!nzchar(trimws(baseline_grp)))) return(NULL)
      
      if (input$comparisonStrategy == "Faceted (Intra-group Reference)" && length(val) > 1) {
        plot_db_all <- df_prop %>%
          dplyr::mutate(Is_Baseline = (X_Grp %in% baseline_grp))
      } else {
        plot_db_all <- df_prop %>%
          dplyr::mutate(Is_Baseline = (GroupingVal %in% baseline_grp))
      }
      
      stats_df <- data.frame()
      resolved_method <- "t_test"
      
      if (input$comparisonStrategy == "Faceted (Intra-group Reference)" && length(val) > 1) {
        ref_x <- baseline_grp[1]
        for(feat in unique(plot_db_all$Feature)) {
          sub_f <- plot_db_all %>% dplyr::filter(Feature == feat)
          for(fac in unique(sub_f$Facet_Grp)) {
            f_facet_df <- sub_f %>% dplyr::filter(Facet_Grp == fac)
            base_vals <- f_facet_df %>% dplyr::filter(X_Grp == ref_x) %>% dplyr::pull(Plot_Value)
            for(g in setdiff(unique(f_facet_df$X_Grp), ref_x)) {
              comp_vals <- f_facet_df %>% dplyr::filter(X_Grp == g) %>% dplyr::pull(Plot_Value)
              p_val <- NA
              stars <- "ns"
              if(length(base_vals)>=2 && length(comp_vals)>=2) {
                v_base <- var(base_vals,na.rm=T)
                v_comp <- var(comp_vals,na.rm=T)
                if(!is.na(v_base) && !is.na(v_comp) && !(v_base == 0 && v_comp == 0)) {
                  tt <- tryCatch(compute_local_p_val(base_vals, comp_vals, method = resolved_method, paired = FALSE), error=function(e) NA)
                  if(!is.na(tt)) {
                    p_val <- tt
                    if(p_val < 0.001) stars <- "***"
                    else if(p_val < 0.01) stars <- "**"
                    else if(p_val < 0.05) stars <- "*"
                  }
                }
              }
              grp_val_actual <- unique(f_facet_df$GroupingVal[f_facet_df$X_Grp == g])[1]
              if(!is.na(grp_val_actual)) {
                stats_df <- rbind(stats_df, data.frame(Feature=feat, GroupingVal=grp_val_actual, P_Value=p_val, Significance=stars))
              }
            }
          }
        }
      } else {
        for(feat in unique(plot_db_all$Feature)) {
          sub_f <- plot_db_all %>% dplyr::filter(Feature == feat)
          base_vals <- sub_f %>% dplyr::filter(GroupingVal %in% baseline_grp) %>% dplyr::pull(Plot_Value)
          for(g in setdiff(ordered_groups, baseline_grp)) {
            comp_vals <- sub_f %>% dplyr::filter(GroupingVal == g) %>% dplyr::pull(Plot_Value)
            p_val <- NA
            stars <- "ns"
            if(length(base_vals)>=2 && length(comp_vals)>=2) {
              v_base <- var(base_vals,na.rm=T)
              v_comp <- var(comp_vals,na.rm=T)
              if(!is.na(v_base) && !is.na(v_comp) && !(v_base == 0 && v_comp == 0)) {
                tt <- tryCatch(compute_local_p_val(base_vals, comp_vals, method = resolved_method, paired = FALSE), error=function(e) NA)
                if(!is.na(tt)) {
                  p_val <- tt
                  if(p_val < 0.001) stars <- "***"
                  else if(p_val < 0.01) stars <- "**"
                  else if(p_val < 0.05) stars <- "*"
                }
              }
            }
            stats_df <- rbind(stats_df, data.frame(Feature=feat, GroupingVal=g, P_Value=p_val, Significance=stars))
          }
        }
      }
      
      if(nrow(stats_df) > 0) {
        plot_db_all <- plot_db_all %>% dplyr::left_join(stats_df, by=c("Feature", "GroupingVal"))
        plot_db_all$Significance[is.na(plot_db_all$Significance) & plot_db_all$Is_Baseline == TRUE] <- "Reference"
      } else {
        plot_db_all$P_Value <- NA
        plot_db_all$Significance <- "ns"
        plot_db_all$Significance[plot_db_all$Is_Baseline == TRUE] <- "Reference"
      }
      
      plot_db_all$GroupingVal <- factor(plot_db_all$GroupingVal, levels = ordered_groups)
      if (length(val) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") {
        plot_db_all$X_Grp <- factor(plot_db_all$X_Grp, levels = ordered_xs)
        plot_db_all$Facet_Grp <- factor(plot_db_all$Facet_Grp, levels = ordered_facets)
      } else {
        plot_db_all$X_Grp <- factor(plot_db_all$X_Grp, levels = ordered_xs)
      }
      
      c_var <- input$color_target_var
      default_c_var <- if (length(val) > 1) {
        if (input$comparisonStrategy == "Faceted (Intra-group Reference)") val[length(val)] else "Combined_Grouping"
      } else {
        val[1]
      }
      if (is.null(c_var) || (c_var != "Combined_Grouping" && !c_var %in% names(plot_db_all))) {
        c_var <- default_c_var
      }
      if (c_var == "Combined_Grouping") {
        plot_db_all$Combined_Grouping <- plot_db_all$GroupingVal
      }
      
      cmap <- active_color_map()
      p <- plot_logratio_violin(
        df = plot_db_all,
        target_features = "CPI",
        baseline_groups = input$selectedBaseline,
        color_mapping = cmap,
        color_var = c_var,
        y_label = "CPI Score (Weighted Bis-Allylic Carbon)",
        sig_display_type = input$sigDisplayType %||% "star"
      )
      
      if (!is.null(p)) {
        p <- p + labs(
          title = "Cellular Peroxidation Index (CPI)",
          subtitle = "Quantifies lipid peroxidation and ferroptosis susceptibility"
        )
      }
      p
    })
    
    buildPolarPlot <- reactive({
      df_met <- computed_metrics()
      if (is.null(df_met)) return(NULL)
      
      meta <- shared_data$all_metadata()
      
      # 1. Determine Color Grouping
      group_cols <- input$colorGrouping
      if (length(group_cols) == 0) group_cols <- "Group1"
      group_cols <- intersect(group_cols, names(df_met))
      if (length(group_cols) == 0) group_cols <- "Group1"
      
      df_met$ColorGroupVal <- apply(df_met[, group_cols, drop = FALSE], 1, function(row) {
        vals <- as.character(row)
        vals <- vals[!is.na(vals) & vals != "Unspecified"]
        if (length(vals) == 0) "Unspecified" else paste(vals, collapse = "_")
      })
      
      colorMap <- polar_active_color_map()
      req(colorMap)
      
      # Ensure factor levels
      df_met$ColorGroupVal <- factor(df_met$ColorGroupVal, levels = names(colorMap))
      
      # 2. Setup aesthetics
      plot_aes <- aes(x = m1_scaled, y = m2_scaled, color = ColorGroupVal)
      
      # 3. Shape Grouping
      if (isTRUE(input$useShapes) && !is.null(input$shapeGrouping) && input$shapeGrouping %in% names(df_met)) {
        shapeMap <- polar_active_shape_map()
        req(shapeMap)
        df_met$ShapeGroupVal <- as.character(df_met[[input$shapeGrouping]])
        df_met$ShapeGroupVal[is.na(df_met$ShapeGroupVal) | df_met$ShapeGroupVal == ""] <- "Unspecified"
        df_met$ShapeGroupVal <- factor(df_met$ShapeGroupVal, levels = names(shapeMap))
        plot_aes <- utils::modifyList(plot_aes, aes(shape = ShapeGroupVal))
      }
      
      # 4. Formatted Labels
      if (isTRUE(input$showLabels)) {
        if (length(input$labelParts) > 0) {
          replicate_col <- if ("Replicate" %in% names(df_met)) df_met$Replicate else NA
          pt_col <- if ("PatientNumber" %in% names(df_met)) df_met$PatientNumber else NA
          tp_col <- if ("TimePoint" %in% names(df_met)) df_met$TimePoint else NA
          g1_col <- if ("Group1" %in% names(df_met)) df_met$Group1 else NA
          g2_col <- if ("Group2" %in% names(df_met)) df_met$Group2 else NA
          
          df_met$Label <- mapply(
            function(c, p, r, pt, tp, s) {
              parts <- input$labelParts
              val_c <- if ("Group1" %in% parts && !is.na(c) && c != "Unspecified") gsub("_", " ", c) else NULL
              val_p <- if ("Group2" %in% parts && !is.na(p) && p != "Unspecified") p else NULL
              val_r <- if ("Replicate" %in% parts && !is.na(r) && r != "Unspecified") r else NULL
              val_pt <- if ("PatientNumber" %in% parts && !is.na(pt) && pt != "Unspecified") pt else NULL
              val_tp <- if ("TimePoint" %in% parts && !is.na(tp) && tp != "Unspecified") tp else NULL
              
              first_parts <- c(val_c, val_p, val_r)
              first_parts <- first_parts[!is.null(first_parts) & nzchar(first_parts)]
              first_str <- paste(first_parts, collapse = "_")
              
              second_str <- if (!is.null(val_pt)) {
                if (nzchar(first_str)) paste0(first_str, "/", val_pt) else val_pt
              } else {
                first_str
              }
              res <- if (!is.null(val_tp)) {
                if (nzchar(second_str)) paste0(second_str, " (", val_tp, ")") else val_tp
              } else {
                second_str
              }
              if (is.null(res) || !nzchar(res)) s else res
            },
            g1_col, g2_col, replicate_col, pt_col, tp_col, df_met$Sample
          )
        } else {
          df_met$Label <- df_met$Sample
        }
      }
      
      # 5. Build plot
      x_mid <- mean(df_met$m1_scaled, na.rm = TRUE)
      y_mid <- mean(df_met$m2_scaled, na.rm = TRUE)
      
      num_colors <- length(colorMap)
      legend_pos <- "bottom"
      color_guide <- guide_legend(
        title.position = "top",
        title.hjust = 0.5,
        nrow = if (num_colors > 12) 3 else if (num_colors > 6) 2 else 1,
        byrow = TRUE
      )
      
      # Human readable title for color legend
      color_legend_title <- if (!is.null(meta)) {
        paste(vapply(group_cols, function(col) get_metadata_group_label(col, meta), character(1)), collapse = " & ")
      } else {
        paste(group_cols, collapse = " & ")
      }
      
      pt_size <- input$pointSize %||% 4
      txt_size <- input$textSize %||% 14
      
      p <- ggplot(df_met, plot_aes) +
        geom_vline(xintercept = x_mid, linetype = "dashed", color = "grey60") +
        geom_hline(yintercept = y_mid, linetype = "dashed", color = "grey60") +
        annotate("text", x = x_mid + (max(df_met$m1_scaled, na.rm = TRUE) - x_mid)/2, y = y_mid + (max(df_met$m2_scaled, na.rm = TRUE) - y_mid)/2, 
                 label = "Hypertrophic State", color = "grey50", alpha = 0.5, fontface = "italic", size = 5) +
        annotate("text", x = min(df_met$m1_scaled, na.rm = TRUE) + (x_mid - min(df_met$m1_scaled, na.rm = TRUE))/2, y = y_mid + (max(df_met$m2_scaled, na.rm = TRUE) - y_mid)/2, 
                 label = "Resolving M2 State\n(Complex Membranes)", color = "grey50", alpha = 0.5, fontface = "italic", size = 5) +
        annotate("text", x = x_mid + (max(df_met$m1_scaled, na.rm = TRUE) - x_mid)/2, y = min(df_met$m2_scaled, na.rm = TRUE) + (y_mid - min(df_met$m2_scaled, na.rm = TRUE))/2, 
                 label = "Inflammatory M1 State\n(Neutral Storage)", color = "grey50", alpha = 0.5, fontface = "italic", size = 5) +
        annotate("text", x = min(df_met$m1_scaled, na.rm = TRUE) + (x_mid - min(df_met$m1_scaled, na.rm = TRUE))/2, y = min(df_met$m2_scaled, na.rm = TRUE) + (y_mid - min(df_met$m2_scaled, na.rm = TRUE))/2, 
                 label = "Undifferentiated", color = "grey50", alpha = 0.5, fontface = "italic", size = 5) +
        geom_point(size = pt_size, alpha = 0.85) +
        scale_color_manual(name = color_legend_title, values = colorMap, drop = FALSE) +
        guides(color = color_guide) +
        theme_minimal(base_size = txt_size) +
        theme(
          panel.grid.minor = element_blank(),
          legend.position = "bottom",
          legend.box = "horizontal",
          legend.direction = "horizontal",
          legend.title = element_text(face = "bold", size = rel(0.9)),
          legend.text = element_text(size = rel(0.85))
        ) +
        labs(
          title = "Lipidomic Phenotypic Trajectory Map",
          subtitle = "Transitions between Storage (M1-like) and Structural Complexity (M2-like)",
          x = "Neutral Storage Index (% of Total Lipids)",
          y = "Membrane Structural/Ether Index (% of Total Lipids)"
        )
      
      if (isTRUE(input$useShapes) && !is.null(input$shapeGrouping) && input$shapeGrouping %in% names(df_met)) {
        shapeMap <- polar_active_shape_map()
        shape_title <- if (!is.null(meta)) get_metadata_group_label(input$shapeGrouping, meta) else input$shapeGrouping
        shape_guide <- guide_legend(title.position = "top", title.hjust = 0.5, nrow = 1, byrow = TRUE)
        p <- p + scale_shape_manual(name = shape_title, values = shapeMap, drop = FALSE) +
          guides(shape = shape_guide)
      }
      
      if (isTRUE(input$showLabels)) {
        p <- p + ggrepel::geom_text_repel(aes(label = Label), color = "black", max.overlaps = 25, size = 4)
      }
      
      p
    })
    
    output$baseline_status_banner_stress <- renderUI({
      if (is.null(shared_data$data_processed())) return(NULL)
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        div(
          class = "baseline-warning-banner alert alert-warning d-flex flex-wrap justify-content-between align-items-center mb-3 shadow-sm",
          style = "border-left: 5px solid #d97706; background: #fffbeb; border-radius: 9px; padding: 12px 18px; border-top: 1px solid #fde68a; border-right: 1px solid #fde68a; border-bottom: 1px solid #fde68a;",
          div(class = "d-flex align-items-center gap-3",
            div(style = "width: 40px; height: 40px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;",
              icon("arrow-pointer")
            ),
            div(
              tags$h6(style = "font-weight: 700; color: #92400e; margin: 0 0 2px 0; font-size: 0.95rem;", 
                     "Reference Baseline Selection Required"),
              tags$span(style = "color: #b45309; font-size: 13px;", 
                        "Select an item in 'Reference Baseline:' in the left sidebar to calculate organelle stress comparisons.")
            )
          ),
          div(class = "d-flex flex-wrap gap-2 align-items-center mt-2 mt-sm-0",
            tags$button(
              type = "button",
              class = "btn btn-sm btn-warning text-dark btn-point-baseline",
              `data-target-baseline` = session$ns("selectedBaseline"),
              onclick = sprintf("window.pointToBaselineSelector && window.pointToBaselineSelector('%s', event); return false;", session$ns("selectedBaseline")),
              style = "font-weight: 600; padding: 7px 16px; border-radius: 8px; white-space: nowrap;",
              icon("crosshairs"), " Point to Reference Baseline"
            )
          )
        )
      } else {
        NULL
      }
    })

    output$baseline_status_banner_cpi <- renderUI({
      if (is.null(shared_data$data_processed())) return(NULL)
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        div(
          class = "baseline-warning-banner alert alert-warning d-flex flex-wrap justify-content-between align-items-center mb-3 shadow-sm",
          style = "border-left: 5px solid #d97706; background: #fffbeb; border-radius: 9px; padding: 12px 18px; border-top: 1px solid #fde68a; border-right: 1px solid #fde68a; border-bottom: 1px solid #fde68a;",
          div(class = "d-flex align-items-center gap-3",
            div(style = "width: 40px; height: 40px; border-radius: 50%; background: #fef3c7; color: #d97706; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;",
              icon("arrow-pointer")
            ),
            div(
              tags$h6(style = "font-weight: 700; color: #92400e; margin: 0 0 2px 0; font-size: 0.95rem;", 
                     "Reference Baseline Selection Required"),
              tags$span(style = "color: #b45309; font-size: 13px;", 
                        "Select an item in 'Reference Baseline:' in the left sidebar to calculate CPI comparisons.")
            )
          ),
          div(class = "d-flex flex-wrap gap-2 align-items-center mt-2 mt-sm-0",
            tags$button(
              type = "button",
              class = "btn btn-sm btn-warning text-dark btn-point-baseline",
              `data-target-baseline` = session$ns("selectedBaseline"),
              onclick = sprintf("window.pointToBaselineSelector && window.pointToBaselineSelector('%s', event); return false;", session$ns("selectedBaseline")),
              style = "font-weight: 600; padding: 7px 16px; border-radius: 8px; white-space: nowrap;",
              icon("crosshairs"), " Point to Reference Baseline"
            )
          )
        )
      } else {
        NULL
      }
    })

    output$stressPlot <- renderPlot({
      if (is.null(shared_data$data_processed())) {
        return(generate_empty_plot_message("Please upload a dataset and run the analysis to view stress profiles."))
      }
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        return(generate_empty_plot_message("Please select an item in 'Reference Baseline:' in the left sidebar to view stress profiles."))
      }
      p <- buildStressPlot()
      if (is.null(p)) {
        return(generate_empty_plot_message("Please select an item in 'Reference Baseline:' in the left sidebar to view stress profiles."))
      }
      p
    })
    
    output$cpiPlot <- renderPlot({
      if (is.null(shared_data$data_processed())) {
        return(generate_empty_plot_message("Please upload a dataset and run the analysis to view CPI scores."))
      }
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        return(generate_empty_plot_message("Please select an item in 'Reference Baseline:' in the left sidebar to view CPI scores."))
      }
      p <- buildCpiPlot()
      if (is.null(p)) {
        return(generate_empty_plot_message("Please select an item in 'Reference Baseline:' in the left sidebar to view CPI scores."))
      }
      p
    })
    
    output$polarPlot <- renderPlot({
      if (is.null(shared_data$data_processed())) {
        return(generate_empty_plot_message("Please upload a dataset and run the analysis to view phenotype trajectories."))
      }
      buildPolarPlot()
    })
    
    # --- RENDER journal style notes/captions ---
    output$stress_note <- renderUI({
      get_journal_caption("cellular_org_stress", shared_data$actual_de_method(), shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info())
    })
    
    output$cpi_note <- renderUI({
      get_journal_caption("cellular_org_cpi", shared_data$actual_de_method(), shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info())
    })
    
    output$polar_note <- renderUI({
      get_journal_caption("cellular_org_polar", shared_data$actual_de_method(), shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info())
    })
    
    # --- STATISTICS REDIRECTION SEQUENCE ---
    observeEvent(input$show_stats_detail, {
      df_met <- tryCatch(computed_metrics(), error = function(e) NULL)
      contrast <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      actual_method <- shared_data$actual_de_method()
      base_method <- gsub("^auto_", "", actual_method)
      
      n_ref <- 0
      n_comp <- 0
      if (!is.null(df_met) && !is.null(contrast)) {
        n_ref <- sum(df_met$Dynamic_DE_Group %in% contrast$ref, na.rm = TRUE)
        n_comp <- sum(df_met$Dynamic_DE_Group %in% contrast$comp, na.rm = TRUE)
      }
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: CELLULAR ORG. & ORGANELLE STRESS\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. ANALYSIS CONFIGURATION\n",
        "   - Primary Grouping:          ", paste(input$groupingMetadata, collapse = ", "), "\n",
        "   - Comparison Strategy:       ", input$comparisonStrategy %||% "Default", "\n",
        "   - Reference Baseline:        ", paste(input$selectedBaseline, collapse = ", "), "\n",
        "   - Statistical Framework:     ", if (base_method == "non_parametric") "Non-Parametric (Wilcoxon Rank-Sum/Kruskal-Wallis)" else "Parametric (limma/ANOVA/t-test)", "\n",
        "   - Reference Cohort:          ", if(!is.null(contrast)) paste(contrast$ref, collapse = ", ") else "Default", "\n",
        "   - Comparison Cohort:         ", if(!is.null(contrast)) paste(contrast$comp, collapse = ", ") else "Default", "\n",
        "   - Sample Replicate Count:    N_comp = ", n_comp, ", N_ref = ", n_ref, "\n\n",
        "2. BIOCHEMICAL INDICES & FORMULATIONS\n",
        "   a. ER Curvature Stress:\n",
        "      Ratio = PE / PC. Conical PE lipids alter membrane curvature compared to cylindrical PC.\n",
        "   b. ER Saturation Score:\n",
        "      Score = log2(Saturated PC / Unsaturated PC). Saturated PC induces membrane rigidification.\n",
        "   c. Mitochondrial PG/CL Ratio:\n",
        "      Ratio = PG / CL. Elevation indicates cardiolipin maturation/remodeling block.\n",
        "   d. FAO Acylcarnitine Stress:\n",
        "      Fraction = (Total Acylcarnitines / Total Lipids) * 1000.\n",
        "   e. Lysosomal BMP Mass:\n",
        "      Percentage = (Total BMP/LBPA / Total Lipids) * 100.\n",
        "   f. Peroxisomal Dysfunction:\n",
        "      Score = Total VLCFA / Total Ether Lipids.\n",
        "   g. Golgi Secretory Arrest:\n",
        "      Score = Ceramide / Sphingomyelin.\n\n",
        "3. CELLULAR PEROXIDATION INDEX (CPI)\n",
        "   CPI Score = (0.014 * % monoenoic) + (1.0 * % dienoic) + (2.0 * % trienoic) + (3.2 * % tetraenoic) + (4.0 * % pentaenoic) + (5.4 * % hexaenoic).\n",
        "   Quantifies biological susceptibility to lipid peroxidation and ferroptotic cell death.\n\n",
        "4. MACROPHAGE POLARIZATION TRAJECTORY\n",
        "   - M1 Storage Index = (GL_TAG + GL_DAG + ST_CE) / Total * 100 (Neutral storage marker).\n",
        "   - M2 Complexity Index = (PE_P + PE_E + PC_P + PC_E + SM + Cer) / Total * 100 (Structural complexity marker).\n"
      )
      
      if (!is.null(df_met) && nrow(df_met) > 0) {
        msg <- paste0(
          msg,
          "\n5. COMPUTED SAMPLE DATA OVERVIEW (Total N = ", nrow(df_met), ")\n",
          "   - Mean ER Curvature Stress:  ", round(mean(df_met$er_curvature, na.rm = TRUE), 3), "\n",
          "   - Mean ER Saturation Score:  ", round(mean(df_met$er_saturation, na.rm = TRUE), 3), "\n",
          "   - Mean Mito PG/CL Ratio:     ", round(mean(df_met$mito_pg_cl, na.rm = TRUE), 3), "\n",
          "   - Mean CPI Peroxidation:     ", round(mean(df_met$CPI, na.rm = TRUE), 3), "\n",
          "   - Mean M1 Storage Score:     ", round(mean(df_met$m1_scaled, na.rm = TRUE), 3), "%\n",
          "   - Mean M2 Complexity Score:  ", round(mean(df_met$m2_scaled, na.rm = TRUE), 3), "%\n"
        )
      }
      
      msg <- paste0(msg, "\n==================================================\n")
      
      # Write to shared_data and display modal overlay
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Cellular Organization")
    })
    
    # --- DOWNLOADS (WYSIWYG PDF EXPORTING) ---
    output$downloadStressCSV <- downloadHandler(
      filename = function() { paste0("subcellular_stress_metrics_", Sys.Date(), ".csv") },
      content = function(file) {
        df_met <- computed_metrics()
        write.csv(df_met, file, row.names = FALSE)
      }
    )
    
    output$downloadStressPDF <- downloadHandler(
      filename = function() { paste0("subcellular_stress_metrics_", Sys.Date(), ".pdf") },
      content = function(file) {
        p <- buildStressPlot()
        req(p)
        dims <- plot_dims$stress
        ggsave(
          file, 
          plot = p, 
          device = "pdf", 
          width = dims$width / 72, 
          height = dims$height / 72, 
          limitsize = FALSE
        )
      },
      contentType = "application/pdf"
    )
    
    output$downloadCpiCSV <- downloadHandler(
      filename = function() { paste0("cpi_ferroptosis_vulnerability_", Sys.Date(), ".csv") },
      content = function(file) {
        df_met <- computed_metrics() %>% dplyr::select(Sample, CPI, dplyr::any_of(c("Group1", "Group2", "Group")))
        write.csv(df_met, file, row.names = FALSE)
      }
    )
    
    output$downloadCpiPDF <- downloadHandler(
      filename = function() { paste0("cpi_ferroptosis_vulnerability_", Sys.Date(), ".pdf") },
      content = function(file) {
        p <- buildCpiPlot()
        req(p)
        dims <- plot_dims$cpi
        ggsave(
          file, 
          plot = p, 
          device = "pdf", 
          width = dims$width / 72, 
          height = dims$height / 72, 
          limitsize = FALSE
        )
      },
      contentType = "application/pdf"
    )
    
    output$downloadPolarCSV <- downloadHandler(
      filename = function() { paste0("phenotypic_polarization_scores_", Sys.Date(), ".csv") },
      content = function(file) {
        df_met <- computed_metrics() %>% dplyr::select(Sample, m1_score, m2_score, m1_scaled, m2_scaled, dplyr::any_of(c("Group1", "Group2", "Group")))
        write.csv(df_met, file, row.names = FALSE)
      }
    )
    
    output$downloadPolarPDF <- downloadHandler(
      filename = function() { paste0("phenotypic_polarization_scores_", Sys.Date(), ".pdf") },
      content = function(file) {
        p <- buildPolarPlot()
        req(p)
        dims <- plot_dims$polar
        ggsave(
          file, 
          plot = p, 
          device = "pdf", 
          width = dims$width / 72, 
          height = dims$height / 72, 
          limitsize = FALSE
        )
      },
      contentType = "application/pdf"
    )
    
    # --- ADVANCED AESTHETICS & ORDERING ---
    prev_grouping <- reactiveVal(NULL)
    
    observe({
      if (isolate(shared_data$is_restoring())) return()
      val <- input$groupingMetadata
      req(length(val) > 0)
      meta <- shared_data$all_metadata()
      req(meta)
      
      choices <- val
      if (length(val) > 1) {
        choices <- c(choices, "Combined_Grouping")
      }
      labels <- sapply(choices, function(c) {
        if (c == "Combined_Grouping") get_metadata_group_label("Group1_Group2", meta)
        else get_metadata_group_label(c, meta)
      })
      named_choices <- setNames(choices, labels)
      
      default_order <- if (length(val) > 1 && input$comparisonStrategy == "Faceted (Intra-group Reference)") val[length(val)] else val[1]
      default_color <- if (length(val) > 1) {
        if (input$comparisonStrategy == "Faceted (Intra-group Reference)") val[length(val)] else "Combined_Grouping"
      } else {
        val[1]
      }
      
      curr_order <- isolate(input$order_target_var)
      curr_color <- isolate(input$color_target_var)
      last_val <- isolate(prev_grouping())
      
      grouping_changed <- is.null(last_val) || !identical(val, last_val)
      if (grouping_changed) {
        sel_order <- default_order
        sel_color <- default_color
        prev_grouping(val)
      } else {
        sel_order <- if (!is.null(curr_order) && curr_order %in% choices) curr_order else default_order
        sel_color <- if (!is.null(curr_color) && curr_color %in% choices) curr_color else default_color
      }
      
      updateSelectInput(session, "order_target_var", choices = named_choices, selected = sel_order)
      updateSelectInput(session, "color_target_var", choices = named_choices, selected = sel_color)
    })
    
    output$level_order_ui <- renderUI({
       target <- input$order_target_var
       req(target)
       meta <- shared_data$all_metadata()
       req(meta)
       
       if (target == "Combined_Grouping") {
           grp_cols <- input$groupingMetadata
           req(length(grp_cols) > 1)
           comb_vals <- apply(meta[, grp_cols, drop=FALSE], 1, paste, collapse = "_")
           default_levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != ""]))
       } else if (target == "Dynamic_DE_Group") {
           de_sets <- shared_data$de_settings()
           parts <- list()
           if (isTRUE(de_sets$orient_group1)) parts$Group1 <- meta$Group1
           if (isTRUE(de_sets$orient_group2)) parts$Group2 <- meta$Group2
           if (isTRUE(de_sets$orient_timepoint) && "TimePoint" %in% names(meta)) {
             tps <- meta$TimePoint
             if (any(!is.na(tps) & tps != "" & tps != "Unspecified")) {
               parts$TimePoint <- tps
             }
           }
           comb_vals <- if (length(parts) == 0) "All" else do.call(paste, c(parts, list(sep = "_")))
           default_levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != ""]))
       } else if (target %in% colnames(meta)) {
           raw_vals <- meta[[target]]
           default_levels <- sort(unique(raw_vals[!is.na(raw_vals) & raw_vals != ""]))
       } else {
           return(NULL)
       }
       
       pref <- isolate(level_prefs[[target]])
       if (is.null(pref)) {
           pref <- shared_data$saved_level_prefs()[[target]]
       }
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
       
       sortable::rank_list(text = NULL, labels = final_levels, input_id = session$ns("manual_level_order"))
    })
    
    observeEvent(input$manual_level_order, {
       req(input$order_target_var)
       level_prefs[[input$order_target_var]] <- input$manual_level_order
    })
    
    output$dynamic_colors_ui <- renderUI({
       target <- input$color_target_var
       req(target)
       meta <- shared_data$all_metadata()
       req(meta)
       
       if (target == "Combined_Grouping") {
           grp_cols <- input$groupingMetadata
           req(length(grp_cols) > 1)
           comb_vals <- apply(meta[, grp_cols, drop=FALSE], 1, paste, collapse = "_")
           levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != ""]))
       } else if (target == "Dynamic_DE_Group") {
           de_sets <- shared_data$de_settings()
           parts <- list()
           if (isTRUE(de_sets$orient_group1)) parts$Group1 <- meta$Group1
           if (isTRUE(de_sets$orient_group2)) parts$Group2 <- meta$Group2
           if (isTRUE(de_sets$orient_timepoint) && "TimePoint" %in% names(meta)) {
             tps <- meta$TimePoint
             if (any(!is.na(tps) & tps != "" & tps != "Unspecified")) {
               parts$TimePoint <- tps
             }
           }
           comb_vals <- if (length(parts) == 0) "All" else do.call(paste, c(parts, list(sep = "_")))
           levels <- sort(unique(comb_vals[!is.na(comb_vals) & comb_vals != ""]))
       } else if (target %in% colnames(meta)) {
           raw_vals <- meta[[target]]
           levels <- sort(unique(raw_vals[!is.na(raw_vals) & raw_vals != ""]))
       } else {
           return(NULL)
       }
       
       base_map <- isolate(active_color_map())
       
       ns <- session$ns
       
       isolate({
           lapply(levels, function(lvl) {
              safe_col <- gsub("[^A-Za-z0-9]", "", target)
              safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
              id <- paste0("cp_", safe_col, "_", safe_lvl)
              
              cur_val <- input[[id]]
              saved_val <- shared_data$get_restored_input(ns(id), base_map[lvl])
              if (is.na(saved_val) || is.null(saved_val)) {
                pal <- RColorBrewer::brewer.pal(min(9, max(3, length(levels))), "Set1")
                if(length(levels) > length(pal)) pal <- colorRampPalette(pal)(length(levels))
                temp_map <- stats::setNames(pal[1:length(levels)], levels)
                saved_val <- temp_map[lvl]
              }
              def_val <- if(!is.null(cur_val)) cur_val else saved_val
              
              div(style="display:inline-block; margin-right:5px; margin-bottom: 5px;",
                  colourpicker::colourInput(ns(id), lvl, value = def_val, showColour="both", width="100px")
              )
           }) %>% div(class="d-flex flex-wrap", .)
       })
    })
    
  })
}
