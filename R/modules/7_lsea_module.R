# R/modules/7_lsea_module.R
# LSEA Module.

# --- Helper Functions ---

get_full_class_name <- function(abbr) {
 # Map common lipid abbreviations to full names
 # This can be expanded or moved to a central utility if needed
  case_when(
    abbr %in% c("CER", "Cer") ~ "Ceramide",
    abbr == "ACAR"   ~ "Acylcarnitine",
    abbr == "CE"     ~ "Cholesteryl Ester",
    abbr == "CL"     ~ "Cardiolipin",
    abbr == "GLCCER" ~ "Glucosylceramide",
    abbr == "LACCER" ~ "Lactosylceramide",
    abbr == "LPC"    ~ "Lysophosphatidylcholine",
    abbr == "LPE"    ~ "Lysophosphatidylethanolamine",
    abbr == "LPG"    ~ "Lysophosphatidylglycerol",
    abbr == "LPI"    ~ "Lysophosphatidylinositol",
    abbr == "LPS"    ~ "Lysophosphatidylserine",
    abbr == "PC"     ~ "Phosphatidylcholine",
    abbr == "PE"     ~ "Phosphatidylethanolamine",
    abbr == "PA"     ~ "Phosphatidic Acid",
    abbr == "LPA"    ~ "Lysophosphatidic Acid",
    abbr == "PG"     ~ "Phosphatidylglycerol",
    abbr == "PI"     ~ "Phosphatidylinositol",
    abbr == "PS"     ~ "Phosphatidylserine",
    abbr == "SM"     ~ "Sphingomyelin",
    abbr == "DAG"    ~ "Diacylglycerol",
    abbr == "TAG"    ~ "Triacylglycerol",
    TRUE ~ abbr
  )
}

# --- Module UI ---

lsea_ui <- function(id) {
  ns <- NS(id)
  tagList(
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
          open = "1. Analysis Settings", multiple = TRUE,
          accordion_panel("1. Analysis Settings", icon = icon("cogs"),
            uiOutput(ns("groupSelectorUI")), # Select Split factor ONLY
            numericInput(ns("minClassSize"), "Min Lipids per Class:", 3, min=1, step=1)
          ),
          accordion_panel("2. Aesthetics", icon = icon("paintbrush"),
            numericInput(ns("pointSize"), "Point Size (Scale):", 5, min=1, step=0.5),
            numericInput(ns("textSize"), "Text Size:", 12, min=6, step=1),
            numericInput(ns("labelSize"), "Significance Label Size:", 4.5, min=1, step=0.5),
            checkboxInput(ns("useFullNames"), "Use Full Class Names", TRUE)
          )
        ),
        hr(),
        helpText("Comparison groups are set in the Main Sidebar (3. Differential Expression)")
      ),
      card(
        card_header(textOutput(ns("lsea_stats_text"))),
        card_body(jqui_resizable(plotOutput(ns("lseaPlot"), height = "80vh"))),
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

lsea_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    
  # --- 1. Dynamic UI ---
    
    output$groupSelectorUI <- renderUI({
      req(shared_data$all_metadata())
      meta_cols <- setdiff(names(shared_data$all_metadata()), c("FullName", "Sample.Name", "Lipid.ID", "Sample.Name_Original", "Dynamic_DE_Group"))
      tagList(
        selectInput(session$ns("splitBy"), "Split Plots By (Facet):", choices = c("None", meta_cols), selected = "Population")
      )
    })
    
  # --- 2. LSEA Analysis ---
    
    lseaResults <- reactive({
      req(shared_data$data_processed(), shared_data$annotationData(), 
          shared_data$de_contrast_info(), shared_data$grouped_metadata(),
          input$splitBy)
      
      df_wide <- shared_data$data_processed() 
      anno <- shared_data$annotationData()
      meta_grouped <- shared_data$grouped_metadata() # Contains Dynamic_DE_Group
      contrast_info <- shared_data$de_contrast_info()
      
      ref_groups <- contrast_info$ref
      comp_groups <- contrast_info$comp
      
   # Filter metadata to matched cols
      use_cols <- setdiff(names(df_wide), "Lipid_Name")
      meta_sub <- meta_grouped %>% dplyr::filter(FullName %in% use_cols)
      
   # Apply Global Filters to Data Matrix
      filtered_ids <- shared_data$global_filtered_lipids()
      if(!is.null(filtered_ids)) {
        df_wide <- df_wide %>% dplyr::filter(Lipid_Name %in% filtered_ids)
      }
      
   # Data Matrix
      mat <- df_wide %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
      
   # Helper to run test on a subset
      run_test_subset <- function(subset_samples, facet_val) {
        if(length(subset_samples) < 2) return(NULL)
        
    # Subset matrix and meta
        sub_mat <- mat[, subset_samples, drop=FALSE]
        sub_meta <- meta_sub %>% dplyr::filter(FullName %in% subset_samples)
        
    # Required to map samples to Ref or Comp based on Dynamic_DE_Group
    # Create a temporary group label: "Ref", "Comp", or NA
        sub_meta$Test_Group <- dplyr::case_when(
          sub_meta$Dynamic_DE_Group %in% ref_groups ~ "Ref",
          sub_meta$Dynamic_DE_Group %in% comp_groups ~ "Comp",
          TRUE ~ NA_character_
        )
        
    # Filter to only relevant samples
        sub_meta <- sub_meta %>% dplyr::filter(!is.na(Test_Group))
        if(nrow(sub_meta) < 2) return(NULL)
        
        sub_mat <- sub_mat[, sub_meta$FullName, drop=FALSE]
        conds <- sub_meta$Test_Group
        
    # Classes
    # Get class for each row (lipid)
    # anno has Lipid_Name, hyperclass, subclass...
    # The reference used "str_extract(rownames, '^[A-Za-z]+')" which implies abbreviation at start
    # must use 'subclass' or 'hyperclass' from global annotation.
    # Let's use 'subclass' as it's more granular like PC, PE, Cer... 
    # but the reference said "CLASS = cls".
        
        lipid_classes <- anno$subclass[match(rownames(sub_mat), anno$Lipid_Name)]
        
        unique_classes <- unique(lipid_classes)
        unique_classes <- unique_classes[!is.na(unique_classes)]
        
        res_list <- lapply(unique_classes, function(cls) {
          idx <- which(lipid_classes == cls)
          if(length(idx) < input$minClassSize) return(NULL)
          
     # Matrix for this class
          cls_mat <- sub_mat[idx, , drop=FALSE]
          
     # Aggregate: Mean of lipids in this class per sample
     # shape: n_lipids x n_samples -> colMeans -> 1 x n_samples
          cls_means <- colMeans(cls_mat, na.rm=TRUE)
          
     # Form data for t-test
          dat <- data.frame(Value = cls_means, Group = conds)
     # Groups are already filtered to "Ref" and "Comp"
          
          if(length(unique(dat$Group)) < 2) return(NULL)
      # Ensure at least 2 samples per group
          if(min(table(dat$Group)) < 2) return(NULL)
          
     # T-test
     # Compare Comp vs Ref
     # want Comp - Ref direction
          vals_comp <- dat$Value[dat$Group == "Comp"]
          vals_ref <- dat$Value[dat$Group == "Ref"]
          
          test_res <- tryCatch(t.test(vals_comp, vals_ref), error=function(e) NULL)
          if(is.null(test_res)) return(NULL)
          
          data.frame(
            Class = cls,
            Facet = facet_val,
            Log2FC = mean(vals_comp) - mean(vals_ref), # Log2 inputs -> diff = log2FC
            P_Value = test_res$p.value
          )
        })
        
        do.call(rbind, res_list)
      }
      
   # Iteration
      if (input$splitBy == "None") {
    # Run on all data
        final_res <- run_test_subset(meta_sub$FullName, "All Data")
      } else {
    # Loop over levels
        facets <- unique(meta_sub[[input$splitBy]])
        facets <- facets[!is.na(facets)]
        
        final_res <- map_df(facets, function(f) {
           samps <- meta_sub$FullName[meta_sub[[input$splitBy]] == f]
           run_test_subset(samps, f)
        })
      }
      
      if(is.null(final_res) || nrow(final_res) == 0) return(NULL)
      
   # Post-processing
      final_res %>%
        dplyr::mutate(
          Full_Name = if(input$useFullNames) get_full_class_name(Class) else Class,
          Significance = dplyr::case_when(
            P_Value < 0.001 ~ "***",
            P_Value < 0.01 ~ "**",
            P_Value < 0.05 ~ "*",
            TRUE ~ ""
          ),
          NegLog10P = -log10(P_Value)
        )
    })
    
  # --- 3. Plotting ---
    
    generateLseaPlot <- function() {
      res <- lseaResults()
      contrast_info <- shared_data$de_contrast_info()
      validate(need(!is.null(res) && nrow(res) > 0, "No significant results or insufficient data for LSEA."))
      
   # Reorder within facets using tidytext::reorder_within
   # Logic: x = Log2FC, y = Full_Name
      
      p <- ggplot(res, aes(x = Log2FC, y = tidytext::reorder_within(Full_Name, Log2FC, Facet), color = Log2FC)) +
        geom_point(aes(size = NegLog10P)) +
        geom_text(aes(label = Significance), color = "black", vjust = 0.8, hjust = -0.4, size = input$labelSize) +
        geom_vline(xintercept = 0, linetype = "dashed", color = "grey50") +
        scale_y_reordered() +
        scale_color_gradient2(low = "#0072B2", mid = "grey90", high = "#D55E00") +
        scale_size(range = c(input$pointSize/2, input$pointSize*1.5)) +
        theme_pubr(base_size = input$textSize) +
        theme(legend.position = "right") +
        labs(
          title = paste("Ranked Lipid Class Enrichment:", contrast_info$str),
          y = NULL,
          x = "Log2 Fold Change (Aggregated by Class)"
        )
        
      if (input$splitBy != "None") {
        p <- p + facet_wrap(~Facet, scales = "free_y", ncol = 3)
      }
      
      p
    }
    
    output$lseaPlot <- renderPlot({ generateLseaPlot() })
    
    output$lsea_stats_text <- renderText({
       res <- lseaResults()
       if(is.null(res)) return("No results.")
       paste("LSEA Results: ", nrow(res), " classes tested.")
    })
    
  # --- Downloads ---
    output$downloadPlot <- downloadHandler(
      filename = "lsea_plot.pdf",
      content = function(file) {
        tryCatch({
          w <- session$clientData[[paste0("output_", session$ns("lseaPlot"), "_width")]]
          h <- session$clientData[[paste0("output_", session$ns("lseaPlot"), "_height")]]
          if(!is.null(input$lseaPlot_size)) {
              w <- input$lseaPlot_size$width
              h <- input$lseaPlot_size$height
          }
          w_in <- if (!is.null(w)) w / 72 else 12
          h_in <- if (!is.null(h)) h / 72 else 8
          ggsave(file, plot=generateLseaPlot(), device="pdf", width=w_in, height=h_in, limitsize=FALSE)
        }, error = function(e) {
          pdf(file, width=8, height=6)
          plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
          text(0, 0, paste("ERROR in ggsave/LSEA:\n", e$message), col="red", cex=0.8)
          dev.off()
        })
      },
      contentType = "application/pdf"
    )
    
    output$downloadTable <- downloadHandler(
      filename = "lsea_results.csv",
      content = function(file) {
        write.csv(lseaResults(), file, row.names=FALSE)
      }
    )
    
  })
}
