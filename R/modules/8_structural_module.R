# R/modules/8_structural_module.R
# Structural Lipidome Audit.

# --- Module UI ---

structural_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = "1. Analysis Settings", multiple = TRUE,
          accordion_panel("1. Analysis Settings", icon = icon("cogs"),
            numericInput(ns("minClassSize"), "Min Lipids per Group:", 3, min=1, step=1),
            numericInput(ns("pThreshold"), "P-value Threshold:", 0.05, min=0.001, max=1, step=0.01),
            selectInput(ns("pValType"), "P-value Type:", choices = c("Raw"="p_raw", "FDR"="p_adj_bh"), selected="p_raw")
          ),
          accordion_panel("2. Aesthetics", icon = icon("paintbrush"),
             numericInput(ns("pointSize"), "Violin Dot Size:", 3, min=1, step=0.5),
             numericInput(ns("textSize"), "Text Size:", 10, min=6, step=1),
             colourpicker::colourInput(ns("colRef"), "Ref Color:", value = "#0072B2"),
             colourpicker::colourInput(ns("colComp"), "Comp Color:", value = "#D55E00")
          ),
          hr(),
          actionButton(ns("runAnalysis"), "Initiate Structural Analysis", class = "btn-success", width = "100%")
        ),
        hr(),
        helpText("Comparison of the structural properties (Chain Length, Unsaturation) of lipids enriched in the Comparison group vs Reference group (based on DE results). It also addresses region-specific (sn-1, sn-2) structural details where available.")
      ),
      navset_card_tab(
          nav_panel("Structural Analysis Dot Plots", 
            card_header(textOutput(ns("summary_stats_text"))),
            card_body(
               jqui_resizable(plotOutput(ns("summaryPlot"), height = "75vh"))
            ),
            card_footer(
              downloadButton(ns("downloadSummaryPDF"), "Download PDF"),
              downloadButton(ns("downloadSummaryCSV"), "Download Data (CSV)", class="btn-secondary")
            )
          ),
          nav_panel("Violin Plots",
             card_header("Lipid Species Identification"),
             card_body(
                uiOutput(ns("classSelectorUI")),
                fluidRow(
                  column(6, sliderInput(ns("labelTop"), "Label Top % Extremes:", min=0, max=100, value=0, step=1)),
                  column(6, actionButton(ns("updateSpecies"), "Load Species Plot", class = "btn-secondary", style="margin-top: 25px; width: 100%;"))
                ),
                hr(),
                jqui_resizable(plotOutput(ns("speciesPlotPlot"), height = "60vh"))
             ),
             card_footer(
               downloadButton(ns("downloadSpeciesPDF"), "Download PDF")
             )
          )
        )
    )
  )
}

# --- Module Server ---

structural_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    
  # --- 1. Data Preparation ---
    
    structuralData <- reactive({
      req(shared_data$de_results(), shared_data$annotationData())
      
      de_res <- shared_data$de_results()
      anno <- shared_data$annotationData()
      
   # Merge DE results with structural annotation
   # Filter for significant DE? The reference uses "Enriched in AMD" vs "Enriched in Healthy" based on logFC > 0 / < 0
   # But usually only care about significant ones?
   # The reference script takes ALL lipids, calculates mean difference, detects direction.
   # But here Currently using the DE results which already did the stats.
   # Let's use ALL lipids that were tested, split by Log2FC direction.
      
      df <- de_res %>%
        dplyr::left_join(anno, by="Lipid_Name") %>%
        dplyr::mutate(
          Direction = dplyr::if_else(log2FC > 0, "Enriched in Comp", "Enriched in Ref")
        )
      
   # Apply Global Filters
      filtered_ids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_ids)) {
        df <- df %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      
      df
    })
    
  # --- 2. Structural Audit Loop ---
    
    auditResults <- eventReactive(input$runAnalysis, {
      df <- structuralData()
      req(nrow(df) > 0)
      
   # Iterate by Class
   # using 'subclass' or 'hyperclass'? Reference implies 'Class'.
      classes <- unique(df$subclass)
      classes <- classes[!is.na(classes) & classes != "Misc"]
      
      results_list <- list()
      
      for(cls in classes) {
        sub_df <- df %>% dplyr::filter(subclass == cls)
        
    # Check min size per group
        n_comp <- sum(sub_df$Direction == "Enriched in Comp", na.rm=TRUE)
        n_ref <- sum(sub_df$Direction == "Enriched in Ref", na.rm=TRUE)
        
        if (n_comp < input$minClassSize || n_ref < input$minClassSize) next
        
    # Features to test
    # Universal
        features <- list("Total_Carbons"="Total Carbons", "Total_DB"="Total Unsaturation")
        
    # Specific
    # Needs to check if columns exist and are numeric
        if("nCchain1" %in% names(sub_df) && "nCchain2" %in% names(sub_df)) {
       # Basic check if it has 2 chains populated
             if(sum(!is.na(sub_df$nCchain2)) > 5) {
                features <- c(features, list("nCchain1"="sn1-Length", "DBchain1"="sn1-DB", 
                                             "nCchain2"="sn2-Length", "DBchain2"="sn2-DB"))
             } else if(sum(!is.na(sub_df$nCchain1)) > 5) {
        # Sphingo-like (often parsed as chain1)
                features <- c(features, list("nCchain1"="N-Acyl Length", "DBchain1"="N-Acyl DB"))
             }
        }
        
        for(feat_col in names(features)) {
           if(!feat_col %in% names(sub_df)) next
           
      # T-test
           form <- as.formula(paste(feat_col, "~ Direction"))
      # want Comp - Ref. 
      # t.test(y ~ x) order depends on factor levels.
      # Let's fix levels: Ref, Comp
           sub_df$Direction <- factor(sub_df$Direction, levels=c("Enriched in Ref", "Enriched in Comp"))
           
           tt <- tryCatch(t.test(form, data=sub_df), error=function(e) NULL)
           
           if(!is.null(tt)) {
             diff_val <- tt$estimate[2] - tt$estimate[1] # Comp - Ref
             pval <- tt$p.value
             
             results_list[[length(results_list)+1]] <- data.frame(
               Class = cls,
               Feature = features[[feat_col]],
               Feature_Col = feat_col,
               Diff = diff_val,
               P_Value = pval,
               n_Comp = n_comp,
               n_Ref = n_ref
             )
           }
        }
      }
      
      if(length(results_list) == 0) return(NULL)
      do.call(rbind, results_list)
    })
    
  # --- 3. Plotting: Summary ---
    
    summaryPlotReactive <- reactive({
      res <- auditResults()
      validate(need(!is.null(res) && nrow(res) > 0, "No structural shifts detected or insufficient data."))
      
      res_sig <- res %>% dplyr::filter(P_Value < input$pThreshold)
      validate(need(nrow(res_sig) > 0, paste("No shifts found with P <", input$pThreshold)))
      
      data_plot <- res_sig %>%
        dplyr::mutate(
          Label = paste(Class, Feature),
          Stars = dplyr::case_when(
            P_Value < 0.001 ~ "***",
            P_Value < 0.01 ~ "**",
            P_Value < 0.05 ~ "*",
            TRUE ~ ""
          )
        ) %>%
        dplyr::arrange(desc(abs(Diff)))
      
      if(nrow(data_plot) > 30) data_plot <- head(data_plot, 30)
      
      ggplot(data_plot, aes(x = Diff, y = reorder(Label, Diff), color = Diff)) +
        geom_vline(xintercept = 0, linetype = "dashed", color = "grey70") +
        geom_point(aes(size = abs(Diff))) +
        geom_text(aes(label = Stars), color = "black", vjust = -0.5, size = input$textSize/3) +
        scale_color_gradient2(low = "#0072B2", mid = "grey90", high = "#D55E00", name = "Difference") +
        theme_pubr(base_size = input$textSize) +
        labs(
          title = "Key Structural Remodeling Shifts",
          subtitle = paste("Comparison vs Reference | P <", input$pThreshold),
          x = "Difference (Comp - Ref)", y = NULL
        )
    })
    
    output$summaryPlot <- renderPlot({
      summaryPlotReactive()
    })
    
    output$summary_stats_text <- renderText({
       res <- auditResults()
       if(is.null(res)) return("No results.")
       n_sig <- sum(res$P_Value < input$pThreshold, na.rm=TRUE)
       paste("Found", n_sig, "significant shifts out of", nrow(res), "tested features.")
    })
    
  # --- 4. Plotting: Details (Superplots) ---
    
    output$classSelectorUI <- renderUI({
       res <- auditResults()
       req(res)
       res_sig <- res %>% dplyr::filter(P_Value < input$pThreshold)
       if(nrow(res_sig) == 0) return(NULL)
       
    # Create labels "Class - Feature"
       choices <- paste(res_sig$Class, res_sig$Feature, sep=" | ")
       selectInput(session$ns("selectedDetails"), "Select Shifts to Visualize:", choices = choices, multiple = TRUE, selected = head(choices, 4))
    })
    
    speciesPlotReactive <- eventReactive(input$updateSpecies, {
      details <- isolate(input$selectedDetails)
      req(details)
      pct_top <- isolate(input$labelTop) / 100
      
      parts <- strsplit(details, " \\| ")
      sel_classes <- sapply(parts, `[`, 1)
      sel_feats <- sapply(parts, `[`, 2)
      
      df <- structuralData()
      df$Direction <- factor(df$Direction, levels=c("Enriched in Ref", "Enriched in Comp"))
      
      plot_list <- list()
      
      for(i in seq_along(details)) {
         cls <- sel_classes[i]
         feat_name <- sel_feats[i]
         
         feat_col <- dplyr::case_when(
            feat_name == "Total Carbons" ~ "Total_Carbons",
            feat_name == "Total Unsaturation" ~ "Total_DB",
            feat_name == "sn1-Length" ~ "nCchain1",
            feat_name == "sn1-DB" ~ "DBchain1",
            feat_name == "sn2-Length" ~ "nCchain2",
            feat_name == "sn2-DB" ~ "DBchain2",
            feat_name == "N-Acyl Length" ~ "nCchain1",
            feat_name == "N-Acyl DB" ~ "DBchain1",
            TRUE ~ NA_character_
          )
         if(is.na(feat_col) || !(feat_col %in% names(df))) next
         
         sub_df <- df %>% 
           dplyr::filter(subclass == cls) %>% 
           dplyr::filter(!is.na(.data[[feat_col]]))
           
         if(nrow(sub_df) == 0) next
         
         vals <- sub_df[[feat_col]]
         if (length(vals) == 0) next
         
         med_val <- median(vals, na.rm=TRUE)
         sub_df$Deviation <- abs(vals - med_val)
         
         n_label <- ceiling(nrow(sub_df) * pct_top)
         sub_df <- sub_df %>% dplyr::arrange(desc(Deviation))
         
         labeled_lipids <- head(sub_df$Lipid_Name, n_label)
         
         p <- ggplot(sub_df, aes(x = Direction, y = .data[[feat_col]], fill = Direction)) +
            geom_violin(trim = FALSE, alpha = 0.5, color = "black", scale = "width") +
            geom_jitter(shape = 21, color = "black", width = 0.15, alpha = 0.7, size = input$pointSize / 1.5) +
            geom_boxplot(width = 0.1, fill = "white", outlier.shape = NA, alpha = 0.8, color = "black") +
            ggpubr::stat_compare_means(method = "t.test", label = "p.signif", label.x = 1.5) +
            ggrepel::geom_text_repel(
              data = subset(sub_df, Lipid_Name %in% labeled_lipids),
              aes(label = Lipid_Name),
              size = input$textSize / 3,
              max.overlaps = 50,
              box.padding = 0.5
            ) +
            scale_fill_manual(values = c("Enriched in Ref" = input$colRef, "Enriched in Comp" = input$colComp)) +
            labs(title = paste(cls, "-", feat_name), y = feat_name, x = NULL) +
            theme_pubr(base_size = input$textSize) +
            theme(legend.position = "none")
         
         plot_list[[length(plot_list) + 1]] <- p
      }
      
      if(length(plot_list) > 0) {
        patchwork::wrap_plots(plot_list, ncol = min(2, length(plot_list)))
      } else {
    # Return empty plot with message
        ggplot() + 
          annotate("text", x = 0.5, y = 0.5, label = "Insufficient data or invalid selected features.") + 
          theme_void()
      }
    }, ignoreNULL = FALSE)

    output$speciesPlotPlot <- renderPlot({
      speciesPlotReactive()
    })
    
   # --- Downloads ---
    output$downloadSummaryPDF <- downloadHandler(
      filename = function() { paste0("structural_summary_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          p <- summaryPlotReactive()
          if(is.null(p)) stop("Summary plot is NULL")
          w <- session$clientData[[paste0("output_", session$ns("summaryPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("summaryPlot"), "_height")]]
          if(!is.null(input$summaryPlot_size)) {
              w <- input$summaryPlot_size$width
              h <- input$summaryPlot_size$height
          }
          w_in <- 10
          h_in <- 8
          if (!is.null(w) && w > 10) w_in <- w / 72
          if (!is.null(h) && h > 10) h_in <- h / 72
          ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in ggsave/summaryPlotReactive:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )

    output$downloadSummaryCSV <- downloadHandler(
      filename = function() { paste0("structural_summary_", format(Sys.Date(), "%Y%m%d"), ".csv") },
      content = function(file) {
        res <- auditResults()
        req(res)
        write.csv(res, file, row.names = FALSE)
      }
    )

    output$downloadSpeciesPDF <- downloadHandler(
      filename = function() { paste0("structural_species_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        tryCatch({
          p <- speciesPlotReactive()
          if(is.null(p)) stop("Species plot is NULL")
          w <- session$clientData[[paste0("output_", session$ns("speciesPlotPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("speciesPlotPlot"), "_height")]]
          if(!is.null(input$speciesPlotPlot_size)) {
              w <- input$speciesPlotPlot_size$width
              h <- input$speciesPlotPlot_size$height
          }
          w_in <- 12
          h_in <- 8
          if (!is.null(w) && w > 10) w_in <- w / 72
          if (!is.null(h) && h > 10) h_in <- h / 72
          ggsave(file, plot = p, device = "pdf", width = w_in, height = h_in, limitsize = FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in ggsave/speciesPlotReactive:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
  })
}
