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
          open = "1. Aesthetics", multiple = TRUE,
          accordion_panel("1. Aesthetics", icon = icon("paintbrush"),
            radioButtons(ns("volcanoColorMode"), "Coloring:",
                         choices = c("By Regulation" = "regulation", "By Pathway" = "pathway"), selected = "regulation"),
            checkboxInput(ns("showLabels"), "Show Labels", TRUE),
            sliderInput(ns("labelThreshold"), "Label Top N (or %):", 0, 100, 10, 1),
            checkboxInput(ns("useCountInsteadOfPct"), "As absolute count?", TRUE),
            sliderInput(ns("alphaWeightLog2FC"), "Weight abs(Log2FC):", 0, 5, 1, 0.1),
            sliderInput(ns("betaWeightNegLog10P"), "Weight -Log10P:", 0, 5, 1, 0.1),
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
            checkboxInput(ns("showDensity"), "Show Density Contours?", FALSE),
            
            hr(),
            strong("Axis Limits"),
            checkboxInput(ns("symmetricX"), "Force Symmetric X-Axis?", TRUE),
            numericInput(ns("xMin"), "X-Min:", NULL),
            numericInput(ns("xMax"), "X-Max:", NULL),
            numericInput(ns("yMin"), "Y-Min:", NULL),
            numericInput(ns("yMax"), "Y-Max:", NULL),
            hr(),
            strong("Axis Compression"),
            checkboxInput(ns("compressX"), "Compress X Axis", FALSE),
            conditionalPanel("input.compressX == true", ns = ns, numericInput(ns("xCompressParam"), "Compress Param:", 0.6, step=0.1)),
            checkboxInput(ns("compressY"), "Compress Y Axis", TRUE),
            conditionalPanel("input.compressY == true", ns = ns, numericInput(ns("yCompressFactor"), "Compress Factor:", 1.5, step=0.1))
          )
        )
      ),
        card(
          card_header(textOutput(ns("volcano_stats_text"))),
          card_body(jqui_resizable(plotOutput(ns("volcanoPlot"), height = "80vh"))),
          card_footer(
            layout_columns(col_widths = c(2, 2),
              downloadButton(ns("downloadPlot"), "Download PDF"),
              downloadButton(ns("downloadTable"), "Download CSV")
            )
          )
        )
      )
    )

}

# --- Module Server ---

volcano_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    
  # --- Volcano Data Construction (Global) ---
    volcanoData <- reactive({
      req(shared_data$de_results(), shared_data$de_settings())
      
      results <- shared_data$de_results()
      settings <- shared_data$de_settings()
      
   # Apply Global Filters
   # Volcano usually shows everything, but if users filter classes, must respect it.
      filtered_ids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_ids)) {
        results <- results %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      
   # Extract Settings
      p_type <- settings$p_value_type
      p_thresh <- settings$p_threshold
      lfc_thresh <- settings$log2fc_threshold
      
   # Determine P-col
      p_col <- if(p_type == "adjusted") "p_adj_bh" else "p_raw"
      
   # Add Regulation Status locally for visualization
      results %>%
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
    })
    
  # --- Plotting ---
    generateVolcanoPlot <- function() {
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
      if (input$volcanoColorMode == "pathway") {
    # Simplified pathway coloring for MVP - just use hyperclass
        p <- p + geom_point(aes(color = hyperclass), alpha = input$pointAlpha, size = input$pointSize, stroke = input$pointStroke)
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
      custom_x_min <- input$xMin
      custom_x_max <- input$xMax
      
      if(isTRUE(input$symmetricX)) {
     # If user provides Manual, symmetric based on MAX of abs(manual)
     # Or Auto if manual is NULL.
          max_val <- max(abs(plot_data$log2FC), na.rm=TRUE)
          if (!is.null(custom_x_max)) max_val <- custom_x_max
          if (!is.null(custom_x_min)) max_val <- max(max_val, abs(custom_x_min)) # Take max of range
          
     # Force Symmetric
          custom_x_min <- -max_val
          custom_x_max <- max_val
      } 
      
      x_limits <- if(!is.null(custom_x_min) && !is.null(custom_x_max)) c(custom_x_min, custom_x_max) else NULL
      y_limits <- if(!is.null(input$yMax)) c(0, input$yMax) else NULL

   # Exact ticks from Legacy
      x_min_use <- if(!is.null(x_limits)) x_limits[1] else min(plot_data$log2FC, na.rm=TRUE)
      x_max_use <- if(!is.null(x_limits)) x_limits[2] else max(plot_data$log2FC, na.rm=TRUE)
      
      default_breaks <- scales::breaks_extended()(c(x_min_use, x_max_use))
      custom_breaks <- unique(sort(c(default_breaks, -lfc_cut, lfc_cut)))
   # Filter to visible range
      custom_breaks <- custom_breaks[custom_breaks >= x_min_use & custom_breaks <= x_max_use]

      p <- p + 
           scale_x_continuous(trans = trans_x, limits = x_limits, breaks = custom_breaks) + 
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
    
    output$volcanoPlot <- renderPlot({ generateVolcanoPlot() })
    output$volcano_stats_text <- renderText({ 
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
    
  })
}
