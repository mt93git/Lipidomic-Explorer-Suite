# R/modules/6_volcano_module.R
# Volcano Plot analysis.

# --- Helper Functions (Internal to Module) ---

cleanLipidName <- function(x) sub("([+\\-](NH4|AcO|\\d*H))$","",x)

piecewise_compress_trans <- function(L, a) {
  if(L < 0) stop("Threshold L must be >= 0"); if(a <= 0) stop("Param a must be > 0")
  forward <- function(x) sapply(x, function(v) if(is.na(v) || abs(v) <= L) v else sign(v)*(L + a*log(abs(v)-L+1)))
  inverse <- function(y) sapply(y, function(v) if(is.na(v) || abs(v) <= L) v else sign(v)*(L + exp((abs(v)-L)/a) - 1))
  scales::trans_new("piecewiseCompress", forward, inverse, domain=c(-Inf,Inf))
}

piecewise_compress_non_sig <- function(T_val, factor) {
  if(T_val <= 0 || factor < 1) return(scales::identity_trans())
  boundary <- T_val / factor
  forward <- function(y) ifelse(is.na(y) | y <= 0, y, ifelse(y <= T_val, y / factor, boundary + (y - T_val)))
  inverse <- function(y_prime) ifelse(is.na(y_prime) | y_prime <= 0, y_prime, ifelse(y_prime <= boundary, y_prime * factor, T_val + (y_prime - boundary)))
  scales::trans_new("nonSigYCompress", forward, inverse, domain = c(0, Inf))
}

round_away_from_zero <- function(x) {
  if(is.na(x) || x==0) return(0)
  sign(x) * ceiling(abs(x))
}

# --- Module UI ---

volcano_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = c("0. Nomenclature", "1. Aesthetics"), multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Aesthetics", icon = icon("paintbrush"),
            radioButtons(ns("volcanoColorMode"), "Coloring:",
                         choices = c("By Regulation" = "regulation", "By Lipid Main Class" = "subclass", "By Lipid Category" = "hyperclass"), selected = "regulation"),
            checkboxInput(ns("showLabels"), "Show Labels", TRUE),
            sliderInput(ns("labelThreshold"), tags$span("Label Top N (or %):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Selects the number or percentage of top-ranked lipid dots to label based on their combined fold change and statistical significance.")), 0, 100, 10, 1),
            checkboxInput(ns("useCountInsteadOfPct"), tags$span("As absolute count?", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "If checked, labels the top N absolute number of lipids. If unchecked, labels the top percentage (%) of lipids.")), TRUE),
            sliderInput(ns("alphaWeightLog2FC"), tags$span("Weight abs(Log2FC):", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Controls how heavily the magnitude of the fold change (Log2FC) contributes to the labeling rank score.")), 0, 5, 1, 0.1),
            sliderInput(ns("betaWeightNegLog10P"), tags$span("Weight -Log10P:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Controls how heavily the statistical significance (-Log10 P-value) contributes to the labeling rank score.")), 0, 5, 1, 0.1),
            hr(),
            strong("Aesthetic Settings"),
            numericInput(ns("labelTextSize"), "Label Text Size:", 4.5, min=1, step=0.5),
            colourpicker::colourInput(ns("labelTextColor"), "Label Text Color:", value = "#000000"),
            
      # Enhanced Point Controls
            layout_columns(col_widths = c(6, 6),
               numericInput(ns("pointSize"), "Dot Size:", 4, min=0.1, step=0.5),
               sliderInput(ns("pointAlpha"), "Alpha:", 0, 1, 0.7, 0.05)
            ),
            sliderInput(ns("pointStroke"), "Dot Stroke:", 0, 2, 0.2, 0.1),
            
            numericInput(ns("axisTextSize"), "Axis Text Size:", 16, min=6, step=1),
            numericInput(ns("legendTextSize"), "Legend Font Size:", 16, min=6, step=1),
            numericInput(ns("labelForce"), "Label Repel Force:", 35, min=0, step=1),
            
            checkboxInput(ns("removeGrid"), "Remove grid lines?", TRUE),
            checkboxInput(ns("showDensity"), tags$span("Show Density Contours?", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Overlays contour lines indicating where the highest density of lipid species is concentrated on the plot.")), FALSE),
            
            hr(),
            strong("Axis Limits"),
            checkboxInput(ns("symmetricX"), tags$span("Force Symmetric X-Axis?", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Centers the X-axis so that the left and right limits are symmetric, facilitating balanced comparison of fold-change magnitudes.")), TRUE),
            numericInput(ns("xMin"), "X-Min:", NULL),
            numericInput(ns("xMax"), "X-Max:", NULL),
            numericInput(ns("yMin"), "Y-Min:", NULL),
            numericInput(ns("yMax"), "Y-Max:", NULL),
            hr(),
            strong("Axis Compression"),
            checkboxInput(ns("compressX"), tags$span("Compress X Axis", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Compresses extreme values (large fold-changes or high p-values) to keep the main group of lipids readable on the plot.")), FALSE),
            conditionalPanel("input.compressX == true", ns = ns, numericInput(ns("xCompressParam"), "Compress Param:", 0.6, step=0.1)),
            checkboxInput(ns("compressY"), tags$span("Compress Y Axis", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Compresses extreme values (large fold-changes or high p-values) to keep the main group of lipids readable on the plot.")), TRUE),
            conditionalPanel("input.compressY == true", ns = ns, numericInput(ns("yCompressFactor"), "Compress Factor:", 1.5, step=0.1))
          )
        ),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
       ),
      jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Volcano Plot",
          subtitle = "This module performs differential abundance comparisons between sample groups, plotting statistical significance against fold-change magnitudes:",
          bullets = list(
            tags$li(tags$strong("Significance Analysis:"), " Identify lipid species demonstrating statistically significant changes based on user-defined P-value and Log2 Fold Change thresholds."),
            tags$li(tags$strong("Regulation Colorization:"), " Visualize upregulated and downregulated lipid species colored by significance direction, Lipid Main Class, or Lipid Category.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        card(
          card_header(
            class = "d-flex justify-content-between align-items-center",
            textOutput(ns("volcano_stats_text")),
            tags$div(
              actionButton(ns("openStudioVolcano"), label = NULL, icon = icon("camera-retro"), class = "btn-sm btn-outline-secondary py-0 me-1", title = "Open in Publication Export Studio"),
              downloadButton(ns("downloadTable"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
              downloadButton(ns("downloadPlot"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
            )
          ),
          card_body(
            uiOutput(ns("volcano_fallback_alert")),
            uiOutput(ns("de_not_run_banner")),
            plotOutput(ns("volcanoPlot"), height="600px"),
            uiOutput(ns("volcano_stat_note"))
          )
        )
      ), options = list(handles = "s, se"))
    )
  )
}

# --- Module Server ---

volcano_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    volcano_fallback_active <- reactiveVal(FALSE)
    
  # --- Volcano Data Construction (Global) ---
    volcanoData <- reactive({
      req(shared_data$de_results(), shared_data$de_settings())
      
      results <- shared_data$de_results()
      settings <- shared_data$de_settings()
      
   # Apply Global Filters
   # Volcano usually shows everything, but if users filter classes, must respect it.
      filtered_ids <- shared_data$global_filtered_lipids()
      if (isTRUE(shared_data$targeted_mode_active())) {
        targeted_subset <- if (!is.null(filtered_ids)) results %>% dplyr::filter(Lipid_Name %in% filtered_ids) else results
        if (nrow(targeted_subset) == 0) {
          volcano_fallback_active(TRUE)
          notify_targeted_fallback(session, id = "targeted_fallback_volcano")
          all_filtered_ids <- if (!is.null(shared_data$global_filtered_lipids_all)) shared_data$global_filtered_lipids_all() else NULL
          if (!is.null(all_filtered_ids)) {
            results <- results %>% dplyr::filter(Lipid_Name %in% all_filtered_ids)
          }
        } else {
          volcano_fallback_active(FALSE)
          results <- targeted_subset
        }
      } else {
        volcano_fallback_active(FALSE)
        if(!is.null(filtered_ids)) {
          results <- results %>% dplyr::filter(Lipid_Name %in% filtered_ids)
        }
      }
      
   # Extract Settings
      p_type <- settings$p_value_type
      p_thresh <- settings$p_threshold
      lfc_thresh <- settings$log2fc_threshold
      
   # Determine P-col
      p_col <- if(p_type == "adjusted") "p_adj_bh" else "p_raw"
      
   # Add Regulation Status locally for visualization
      df_volc <- results %>%
        dplyr::mutate(
          Regulation = dplyr::case_when(
            !is.na(.data[[p_col]]) & .data[[p_col]] < p_thresh & log2FC >= lfc_thresh ~ "Up",
            !is.na(.data[[p_col]]) & .data[[p_col]] < p_thresh & log2FC <= -lfc_thresh ~ "Down",
            TRUE ~ "NS"
          ),
          negLog10P = -log10(.data[[p_col]]),
     # Weighted Ranking Metric
          labelRankVal = (input$alphaWeightLog2FC * abs(log2FC)) + (input$betaWeightNegLog10P * negLog10P)
        ) %>%
        dplyr::left_join(shared_data$annotationData(), by="Lipid_Name")
      
      if (input$classLabelFormat == "full") {
        df_volc$subclass <- get_full_class_name(df_volc$subclass)
        df_volc$hyperclass <- get_full_class_name(df_volc$hyperclass)
      } else {
        df_volc$subclass <- get_short_class_name(df_volc$subclass)
        df_volc$hyperclass <- get_short_class_name(df_volc$hyperclass)
      }
      df_volc
    })
    
  # --- Plotting ---
    generateVolcanoPlot <- function() {
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      plot_data <- volcanoData()
      req(plot_data)
      settings <- shared_data$de_settings()
      
      p_thresh_line <- -log10(settings$p_threshold)
      p_val_label <- if(settings$p_value_type == "adjusted") "Adj. P-Value (FDR)" else "Raw P-Value"
      lfc_cut <- settings$log2fc_threshold
      
      p <- ggplot(plot_data, aes(x = log2FC, y = negLog10P)) +
        geom_vline(xintercept = c(-lfc_cut, lfc_cut), linetype = "dotted") +
        geom_hline(yintercept = p_thresh_line, linetype = "dotted") +
        labs(title = "Volcano Plot", x = expression(Log[2]~"Fold Change"), y = bquote(-Log[10]~.(p_val_label))) +
        theme_bw(base_size = input$axisTextSize) + # Use axis text size for base size
        theme(
            legend.text = element_text(size = input$legendTextSize),
            legend.title = element_text(size = input$legendTextSize)
        )

      if (isTRUE(input$removeGrid)) {
        p <- p + theme(panel.grid = element_blank())
      }
      
   # Coloring
      if (input$volcanoColorMode == "subclass") {
        c_map <- shared_data$class_color_map()
        p <- p + geom_point(aes(color = subclass), alpha = input$pointAlpha, size = input$pointSize, stroke = input$pointStroke)
        if (!is.null(c_map)) {
          names(c_map) <- if (input$classLabelFormat == "full") get_full_class_name(names(c_map)) else get_short_class_name(names(c_map))
          p <- p + scale_color_manual(values = c_map)
        }
      } else if (input$volcanoColorMode == "hyperclass") {
        c_map <- shared_data$origin_color_map()
        p <- p + geom_point(aes(color = hyperclass), alpha = input$pointAlpha, size = input$pointSize, stroke = input$pointStroke)
        if (!is.null(c_map)) {
          names(c_map) <- if (input$classLabelFormat == "full") get_full_class_name(names(c_map)) else get_short_class_name(names(c_map))
          p <- p + scale_color_manual(values = c_map)
        }
      } else {
        p <- p + 
          geom_point(aes(color = Regulation), alpha = input$pointAlpha, size = input$pointSize, stroke = input$pointStroke) +
          scale_color_manual(values = c("Up" = "#E41A1C", "Down" = "#377EB8", "NS" = "#AAAAAA"))
      }
      
   # Density
      if (isTRUE(input$showDensity)) {
        p <- p + geom_density_2d(color = "black", alpha = 0.5)
      }
      
   # Axis Compression & Limits
      trans_x <- if(isTRUE(input$compressX)) piecewise_compress_trans(lfc_cut, input$xCompressParam) else "identity"
      trans_y <- if(isTRUE(input$compressY)) piecewise_compress_non_sig(p_thresh_line, input$yCompressFactor) else "identity"
      
    # Handle Axis Limits
    # Symmetric X Logic
      is_custom_x_min <- !is.null(input$xMin) && !is.na(input$xMin)
      is_custom_x_max <- !is.null(input$xMax) && !is.na(input$xMax)
      
      custom_x_min <- if (is_custom_x_min) input$xMin else NA
      custom_x_max <- if (is_custom_x_max) input$xMax else NA
      
      if (isTRUE(input$symmetricX)) {
        # Determine maximum absolute value in data
        max_val <- max(abs(plot_data$log2FC), na.rm = TRUE)
        if (is.na(max_val) || max_val <= 0) max_val <- 1.0
        
        # Override with custom limits if specified
        if (is_custom_x_max) max_val <- custom_x_max
        if (is_custom_x_min) max_val <- max(max_val, abs(custom_x_min))
        
        # Round top value to closest number
        if (max_val >= 5) {
          max_val <- round(max_val)
        } else if (max_val >= 1) {
          max_val <- round(max_val, 1)
        } else {
          max_val <- round(max_val, 2)
        }
        if (max_val <= 0) max_val <- 0.1
        
        custom_x_min <- -max_val
        custom_x_max <- max_val
        is_custom_x_min <- TRUE
        is_custom_x_max <- TRUE
      }
      
      # If both are NA/NULL, x_limits is NULL (auto-scale)
      if (!is_custom_x_min && !is_custom_x_max) {
        x_limits <- NULL
      } else {
        x_limits <- c(custom_x_min, custom_x_max)
      }
      
      y_limits <- if(!is.null(input$yMax) && !is.na(input$yMax)) c(0, input$yMax) else NULL

   # Exact ticks from Legacy & User Instructions
      x_min_use <- if (is_custom_x_min) custom_x_min else min(plot_data$log2FC, na.rm = TRUE)
      x_max_use <- if (is_custom_x_max) custom_x_max else max(plot_data$log2FC, na.rm = TRUE)
      
      if (is.na(x_min_use)) x_min_use <- -1.0
      if (is.na(x_max_use)) x_max_use <- 1.0
      
      max_val <- max(abs(x_min_use), abs(x_max_use), na.rm = TRUE)
      if (is.na(max_val) || max_val <= 0) max_val <- 1.0
      
      if (max_val >= 1) {
        round_max <- ceiling(max_val * 2) / 2
        if (round_max <= 2.5) {
          step <- 0.5
        } else if (round_max <= 5) {
          step <- 1.0
        } else if (round_max <= 10) {
          step <- 2.0
        } else {
          step <- 5.0
        }
      } else {
        round_max <- ceiling(max_val * 10) / 10
        if (round_max <= 0) round_max <- 0.1
        if (round_max <= 0.2) {
          step <- 0.05
        } else if (round_max <= 0.5) {
          step <- 0.1
        } else {
          step <- 0.2
        }
      }
      
      pos_breaks <- seq(0, round_max, by = step)
      if (tail(pos_breaks, 1) != round_max) {
        pos_breaks <- c(pos_breaks, round_max)
      }
      custom_breaks <- unique(sort(c(-pos_breaks, pos_breaks)))
      
      # Determine active range boundaries to filter breaks (data min/max if limits are auto-scaled)
      filter_min <- if (is_custom_x_min) custom_x_min else min(plot_data$log2FC, na.rm = TRUE)
      filter_max <- if (is_custom_x_max) custom_x_max else max(plot_data$log2FC, na.rm = TRUE)
      if (is.na(filter_min)) filter_min <- -1.0
      if (is.na(filter_max)) filter_max <- 1.0
      
      # If max_val >= 5, round data boundaries to closest integer to display clean outer ticks
      if (max_val >= 5) {
        if (!is_custom_x_min) filter_min <- round(filter_min)
        if (!is_custom_x_max) filter_max <- round(filter_max)
      } else {
        if (!is_custom_x_min) filter_min <- round(filter_min, 1)
        if (!is_custom_x_max) filter_max <- round(filter_max, 1)
      }
      
      custom_breaks <- custom_breaks[custom_breaks >= filter_min & custom_breaks <= filter_max]
      
      # Include 0, cutoffs, and any non-NA user limits or rounded active limits in the ticks list
      needed_breaks <- c(0, -lfc_cut, lfc_cut)
      if (is_custom_x_min) {
        needed_breaks <- c(needed_breaks, custom_x_min)
      } else {
        needed_breaks <- c(needed_breaks, filter_min)
      }
      if (is_custom_x_max) {
        needed_breaks <- c(needed_breaks, custom_x_max)
      } else {
        needed_breaks <- c(needed_breaks, filter_max)
      }
      
      custom_breaks <- unique(sort(c(custom_breaks, needed_breaks)))
      
      # Round custom_breaks except custom user inputs
      if (max_val >= 5) {
        custom_breaks <- round(custom_breaks)
        if (is_custom_x_min) custom_breaks <- c(custom_breaks, custom_x_min)
        if (is_custom_x_max) custom_breaks <- c(custom_breaks, custom_x_max)
        custom_breaks <- unique(sort(custom_breaks))
      } else {
        custom_breaks <- unique(round(custom_breaks, 2))
      }
      
      # Final filtering to ensure all tick breaks are strictly within the viewport limits
      custom_breaks <- custom_breaks[custom_breaks >= filter_min & custom_breaks <= filter_max]

      # Create label formatter to enforce "only show digits when max value is inferior to 5"
      label_formatter <- function(x) {
        sapply(x, function(v) {
          if (v %% 1 == 0) {
            res <- sprintf("%.0f", v)
          } else {
            res <- format(round(v, 2), drop0trailing = TRUE, scientific = FALSE)
          }
          res <- trimws(res)
          res <- gsub("^-0$", "0", res)
          res
        })
      }

      p <- p + 
           scale_x_continuous(trans = trans_x, limits = x_limits, breaks = custom_breaks, labels = label_formatter) + 
           scale_y_continuous(trans = trans_y, limits = y_limits)
      
   # Labels
      if (isTRUE(input$showLabels) && input$labelThreshold > 0) {
        df_sig <- plot_data %>% dplyr::filter(Regulation != "NS") %>% dplyr::arrange(desc(labelRankVal))
        
        n_show <- input$labelThreshold
        if (!isTRUE(input$useCountInsteadOfPct)) {
           n_show <- ceiling(nrow(df_sig) * (input$labelThreshold / 100))
        }
        
        df_sig <- head(df_sig, n_show)
        
        if (nrow(df_sig) > 0) {
          p <- p + ggrepel::geom_text_repel(
            data=df_sig, aes(label=cleanLipidName(Lipid_Name)), 
            size = input$labelTextSize, 
            color = input$labelTextColor,
            force = input$labelForce, max.overlaps=Inf, show.legend=FALSE
          )
        }
      }
      
      p
    }
    
    output$volcano_fallback_alert <- renderUI({
      targeted_fallback_banner_ui(isTRUE(volcano_fallback_active()))
    })
    output$volcanoPlot <- renderPlot({ generateVolcanoPlot() })
    output$de_not_run_banner <- renderUI({
      render_de_not_run_banner(shared_data)
    })
    output$volcano_stats_text <- renderText({ 
      if (is.null(shared_data$de_results())) return("Differential Expression Analysis Not Run")
      df <- volcanoData()
      n_up <- sum(df$Regulation == "Up", na.rm=TRUE)
      n_down <- sum(df$Regulation == "Down", na.rm=TRUE)
      paste0("Volcano Plot (Up: ", n_up, ", Down: ", n_down, ")")
    })
    
  # --- Downloads ---
    output$downloadPlot <- downloadHandler(
      filename = "volcano_plot.pdf",
      content = function(file) {
        tryCatch({
          w <- session$clientData[[paste0("output_", session$ns("volcanoPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("volcanoPlot"), "_height")]]
          if (!is.null(input$volcanoPlot_size)) {
            w <- input$volcanoPlot_size$width
            h <- input$volcanoPlot_size$height
          }
          w_in <- if (!is.null(w)) w / 72 else 10
          h_in <- if (!is.null(h)) h / 72 else 8
          ggsave(file, plot=generateVolcanoPlot(), device="pdf", width=w_in, height=h_in, limitsize=FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in ggsave/Volcano:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
    output$downloadTable <- downloadHandler(
      filename = "volcano_data.csv",
      content = function(file) {
        write.csv(volcanoData(), file, row.names=FALSE)
      }
    )

    observeEvent(input$openStudioVolcano, {
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_publication_export_studio_modal(parent_sess, initial_figure = "volcano")
    })
    
    output$volcano_stat_note <- renderUI({
      get_journal_caption("volcano", shared_data$actual_de_method(), shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info())
    })
    
    observeEvent(input$show_stats_detail, {
      # Build detailed statistical printout for Volcano Plot / DE Analysis
      df <- tryCatch(volcanoData(), error = function(e) NULL)
      contrast <- shared_data$de_contrast_info()
      de_sett <- shared_data$de_settings()
      actual_method <- shared_data$actual_de_method()
      base_method <- gsub("^auto_", "", actual_method)
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: DIFFERENTIAL EXP. & VOLCANO\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. ANALYSIS CONFIGURATION\n",
        "   - Selection Method:     ", if (grepl("^auto_", actual_method)) "Automatic mode" else "Manual Selection", "\n",
        "   - Resolved Test:        ", if (base_method == "non_parametric") "Standard Non-Parametric (Wilcoxon Rank-Sum)" else "Standard Parametric (limma)", "\n",
        "   - P-value Type:         ", de_sett$p_value_type, "\n",
        "   - Significance Cutoffs: P < ", de_sett$p_threshold, 
        ", |Log2FC| >= ", de_sett$log2fc_threshold, "\n"
      )
      
      if (!is.null(contrast)) {
        msg <- paste0(
          msg,
          "   - Contrast String:      ", contrast$str, "\n",
          "   - Reference Groups:     ", paste(contrast$ref, collapse = ", "), "\n",
          "   - Comparison Groups:    ", paste(contrast$comp, collapse = ", "), "\n"
        )
      }
      
      # Extract sample sizes from grouped metadata if available
      meta <- tryCatch(shared_data$grouped_metadata(), error = function(e) NULL)
      n_ref <- 0
      n_comp <- 0
      if (!is.null(meta) && !is.null(contrast)) {
        n_ref <- sum(meta$Dynamic_DE_Group %in% contrast$ref, na.rm = TRUE)
        n_comp <- sum(meta$Dynamic_DE_Group %in% contrast$comp, na.rm = TRUE)
        msg <- paste0(
          msg,
          "   - Reference Replicates: N = ", n_ref, "\n",
          "   - Comparison Replicates: N = ", n_comp, "\n"
        )
      }
      
      if (!is.null(df) && nrow(df) > 0) {
        n_up <- sum(df$Regulation == "Up", na.rm = TRUE)
        n_down <- sum(df$Regulation == "Down", na.rm = TRUE)
        n_ns <- sum(df$Regulation == "NS", na.rm = TRUE)
        
        msg <- paste0(
          msg,
          "\n2. STATISTICAL SUMMARY\n",
          "   - Total Analyzed Lipids: ", nrow(df), "\n",
          "   - Up-regulated (Sig):    ", n_up, " lipids\n",
          "   - Down-regulated (Sig):  ", n_down, " lipids\n",
          "   - Non-significant (NS):  ", n_ns, " lipids\n"
        )
      }
      
      # 3. MATHEMATICAL CALCULUS DETAILS
      msg <- paste0(msg, "\n3. MATHEMATICAL CALCULUS & TEST SPECIFICATION\n")
      
      if (base_method == "non_parametric") {
        msg <- paste0(
          msg,
          "   - Statistical Test: Wilcoxon Rank-Sum Test (equivalent to Mann-Whitney U test)\n",
          "   - Mathematical Formulation:\n",
          "     For each individual lipid species:\n",
          "     1. Pool values from the reference group (n1 = ", n_ref, ") and comparison group (n2 = ", n_comp, ").\n",
          "     2. Rank the pooled values from 1 to N (N = n1 + n2 = ", (n_ref + n_comp), ").\n",
          "     3. Compute the rank sum (W) for the comparison group.\n",
          "     4. Compute the Mann-Whitney U statistics:\n",
          "          U1 = W - [n2 * (n2 + 1)] / 2\n",
          "          U2 = n1 * n2 - U1\n",
          "          U = min(U1, U2)\n",
          "     5. Compute the Normal Approximation:\n",
          "          Expected Mean (mu_U) = (n1 * n2) / 2 = ", (n_ref * n_comp) / 2, "\n",
          "          Expected Variance (sigma_U^2) = (n1 * n2 * (n1 + n2 + 1)) / 12 = ", round((n_ref * n_comp * (n_ref + n_comp + 1)) / 12, 4), "\n",
          "          Z-score = (U - mu_U) / sqrt(Expected Variance)\n",
          "     6. Retrieve the two-tailed p-value from the standard normal distribution.\n\n",
          "   - Multiple Testing Adjustment:\n",
          "     Raw p-values are adjusted using the Benjamini-Hochberg False Discovery Rate (FDR) procedure:\n",
          "          Adjusted P(i) = P(i) * total_lipids / rank_i\n",
          "     where lipids are ordered by increasing raw p-value.\n"
        )
      } else {
        # limma parametric testing
        # Retrieve fit if available
        fit <- tryCatch(shared_data$de_fit(), error = function(e) NULL)
        
        # Check if we have empirical Bayes parameters
        d0 <- if (!is.null(fit) && !is.null(fit$df.prior)) round(mean(fit$df.prior), 3) else NULL
        s02 <- if (!is.null(fit) && !is.null(fit$s2.prior)) mean(fit$s2.prior) else NULL
        s0 <- if (!is.null(s02)) round(sqrt(s02), 4) else NULL
        dg <- if (!is.null(fit) && !is.null(fit$df.residual)) round(mean(fit$df.residual), 1) else NULL
        
        msg <- paste0(
          msg,
          "   - Statistical Test: Empirical Bayes Moderated t-test (limma package)\n",
          "   - Mathematical Formulation:\n",
          "     For each lipid species 'g':\n",
          "     1. Fit a linear model via Ordinary Least Squares (OLS):\n",
          "          y_g = X * beta_g + epsilon_g\n",
          "        where X is the design matrix and beta_g represents group means.\n",
          "     2. Compute the ordinary residual standard deviation (s_g) and residual degrees of freedom (d_g).\n",
          "     3. Apply Empirical Bayes Shrinkage to standard errors. The moderated standard deviation (s_tilde_g)\n",
          "        borrows variance information from all analyzed lipids toward a common prior variance (s_0^2):\n",
          "          s_tilde_g^2 = (d_0 * s_0^2 + d_g * s_g^2) / (d_0 + d_g)\n",
          "        where d_0 represents the prior degrees of freedom (precision of the prior description).\n",
          "     4. Compute the moderated t-statistic:\n",
          "          t_tilde_g = beta_hat_g / (s_tilde_g * sqrt(v_g))\n",
          "        where v_g is the unmoderated standard error scaling factor derived from (X'X)^-1.\n",
          "     5. Compute the p-value using a two-tailed Student's t-distribution with (d_0 + d_g) degrees of freedom.\n"
        )
        
        if (!is.null(d0) && !is.null(s0) && !is.null(dg)) {
          msg <- paste0(
            msg,
            "\n4. EMPIRICAL BAYES MODEL FIT METRICS (Estimated Eagerly):\n",
            "   - Prior Degrees of Freedom (d_0)  : ", d0, " (strength of variance shrinkage)\n",
            "   - Prior Standard Deviation (s_0)  : ", s0, " (common baseline log2 variance)\n",
            "   - Average Residual Deg. of Freedom: ", dg, " (d_g per lipid)\n",
            "   - Total Degrees of Freedom (d_0+dg): ", round(d0 + dg, 3), " (used for significance testing)\n"
          )
        } else {
          msg <- paste0(
            msg,
            "\n4. OLS t-TEST METRICS (eBayes Fallback Mode):\n",
            "   - Prior parameters are unavailable (eBayes fit failed or residuals df = 0).\n",
            "   - Statistics computed using standard unmoderated two-tailed Student's t-tests.\n"
          )
        }
        
        msg <- paste0(
          msg,
          "\n5. MULTIPLE TESTING ADJUSTMENT:\n",
          "   Raw p-values are adjusted using the Benjamini-Hochberg False Discovery Rate (FDR) procedure:\n",
          "        Adjusted P(i) = P(i) * total_lipids / rank_i\n",
          "   where lipids are ordered by increasing raw p-value.\n"
        )
      }
      
      msg <- paste0(msg, "\n==================================================\n")
      
      msg <- paste0(msg, "\n", get_stats_console_method_summary(shared_data))
      
      # Write to stats_detail_text and display modal overlay
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Volcano Plot")
    })
    
  })
}
