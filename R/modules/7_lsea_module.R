# R/modules/7_lsea_module.R
# LSEA Module.

# --- Helper Functions ---
format_lsea_short_name <- function(cls) {
  if (is.null(cls)) return(cls)
  sapply(cls, function(x) {
    if (is.na(x)) return(x)
    # Remove prefix GP_, SP_, GL_, ST_, FA_
    clean <- gsub("^(GP_|SP_|GL_|ST_|FA_)", "", x)
    # Map sub-subclasses specifically
    clean <- gsub("^PE_P$", "PE-P", clean)
    clean <- gsub("^PE_E$", "PE-O", clean)
    clean <- gsub("^Cer_dh$", "Cer-dh", clean)
    clean <- gsub("^SM_dh$", "SM-dh", clean)
    clean
  })
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
          open = c("0. Nomenclature", "1. Analysis Settings"), multiple = TRUE,
          accordion_panel("0. Nomenclature", icon = icon("font"),
            radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                         choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                         selected = "full")
          ),
          accordion_panel("1. Analysis Settings", icon = icon("cogs"),
            uiOutput(ns("groupingModeUI")),
            uiOutput(ns("groupSelectorUI")), # Select Split factor ONLY
            numericInput(ns("minClassSize"), tags$span("Min Lipids per Group:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Excludes categories with fewer than this number of detected species from the enrichment analysis to avoid statistical bias.")), 3, min=1, step=1),
            checkboxInput(ns("noSigThreshold"), tags$span("Not Apply Significancy Threshold", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Runs enrichment tests on all lipids without applying p-value or fold-change filters first, highlighting broad trends in lipid sets.")), FALSE),
            uiOutput(ns("log2fcThreshUI")),
            uiOutput(ns("singleLipidSliderUI"))
          ),
          accordion_panel("2. Aesthetics", icon = icon("paintbrush"),
            numericInput(ns("pointSize"), "Point Size (Scale):", 5, min=1, step=0.5),
            numericInput(ns("textSize"), "Text Size:", 12, min=6, step=1),
            numericInput(ns("labelSize"), "Significance Label Size:", 4.5, min=1, step=0.5),
            checkboxInput(ns("circledDots"), "Circled Dots", FALSE),
            conditionalPanel("input.circledDots == true", ns = ns,
              colourpicker::colourInput(ns("borderColor"), "Dot Border Color:", "black")
            ),
            checkboxInput(ns("customScaleColors"), "Custom Scale Colors", FALSE),
            conditionalPanel("input.customScaleColors == true", ns = ns,
              colourpicker::colourInput(ns("lowColor"), "Low (-FC)", "#0072B2"),
              colourpicker::colourInput(ns("midColor"), "Mid (0)", "grey90"),
              colourpicker::colourInput(ns("highColor"), "High (+FC)", "#D55E00")
            ),
            radioButtons(ns("sigDisplayType"), "Significance Label Format:",
                         choices = c("Star" = "star", "P-value" = "pvalue"),
                         selected = "star")
          )
        ),
        hr(),
        helpText("Comparison groups are set in the Main Sidebar (3. Differential Expression)"),
        actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                     icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3")
      ),
      jqui_resizable(div(style = "min-height: 400px; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
        render_tab_intro_card(
          title = "Lipid Set & Class Enrichment (LSEA)",
          subtitle = "This module performs coordinate class and set abundance testing to evaluate shifts across lipid structural or biological groups:",
          bullets = list(
            tags$li(tags$strong("Set & Class Testing:"), " Assess statistically significant coordinate shifts across lipid categories, main classes, carbon chain lengths, or individual species."),
            tags$li(tags$strong("Class Fold-Change (Log2FC):"), " Evaluate cohort-wise aggregated fold change and significance across structurally related lipid classes.")
          ),
          collapse_id = ns("intro_collapse")
        ),
        card(
          card_header(
            class = "d-flex justify-content-between align-items-center",
            textOutput(ns("lsea_stats_text")),
            tags$div(
              downloadButton(ns("downloadTable"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
              downloadButton(ns("downloadPlot"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
            )
          ),
          card_body(
            uiOutput(ns("lsea_fallback_alert")),
            uiOutput(ns("de_not_run_banner")),
            plotOutput(ns("lseaPlot"), height="600px"),
            uiOutput(ns("lsea_stat_note"))
          )
        )
      ), options = list(handles = "s, se"))
    )
  )
}

# --- Module Server ---

lsea_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    lsea_fallback_active <- reactiveVal(FALSE)
    
    # Track grouping, threshold settings, contrast, and max count to handle slider reset
    last_grouping <- reactiveVal(NULL)
    last_no_sig <- reactiveVal(NULL)
    last_contrast <- reactiveVal(NULL)
    last_split <- reactiveVal(NULL)
    last_sig_settings <- reactiveVal(NULL)
    last_max_lipids <- reactiveVal(NULL)
    
  # --- 1. Dynamic UI ---
    
    output$groupingModeUI <- renderUI({
       choices <- c("Lipid Main Class" = "subclass", "Lipid Category" = "hyperclass", "Single Lipid" = "Lipid_Name")
       default_sel <- "subclass"
       
       curr_sel <- isolate(input$lseaGrouping)
       default_sel <- if (!is.null(curr_sel) && curr_sel %in% choices) {
           curr_sel
       } else {
           shared_data$get_restored_input(session$ns("lseaGrouping"), default_sel)
       }
       
       radioButtons(session$ns("lseaGrouping"), "Set Type (Group Lipids by):", 
                    choices = choices, selected = default_sel, inline = TRUE)
     })
    
    output$groupSelectorUI <- renderUI({
      req(shared_data$all_metadata())
      
      # Determine active facet choices based on the Differential Expression orient checkboxes
      de_sett <- shared_data$de_settings()
      active_facs <- c()
      if (isTRUE(de_sett$orient_group1)) active_facs <- c(active_facs, "Group1")
      if (isTRUE(de_sett$orient_group2)) active_facs <- c(active_facs, "Group2")
      if (isTRUE(de_sett$orient_timepoint)) active_facs <- c(active_facs, "TimePoint")
      
      # Cross-reference with available metadata columns
      meta <- shared_data$all_metadata()
      active_facs <- intersect(active_facs, names(meta))
      
      raw_choices <- c("None", active_facs)
      choices <- get_metadata_group_named_choices(raw_choices, meta)
      
      curr_splitBy <- isolate(input$splitBy)
      saved_splitBy <- if (!is.null(curr_splitBy) && curr_splitBy %in% raw_choices) {
        curr_splitBy
      } else {
        restored <- shared_data$get_restored_input(session$ns("splitBy"), NULL)
        if (!is.null(restored) && restored %in% raw_choices) {
          restored
        } else {
          "None"
        }
      }
      tagList(
        selectInput(session$ns("splitBy"), "Split Plots By (Facet):", choices = choices, selected = saved_splitBy)
      )
    })
    
    output$singleLipidSliderUI <- renderUI({
       req(input$lseaGrouping)
       # React to significance threshold changes as well
       no_sig_val <- if (!is.null(input$noSigThreshold)) {
         isTRUE(input$noSigThreshold)
       } else if (!is.null(input$applySigThreshold)) {
         !isTRUE(input$applySigThreshold)
       } else {
         FALSE
       }
       
       res <- lseaResults()
       is_single <- input$lseaGrouping == "Lipid_Name"
       
       # Determine maximum available items to display
       max_lipids <- if (!is.null(res) && nrow(res) > 0) {
         if (is_single) {
           if ((input$splitBy %||% "None") == "None") nrow(res) else length(unique(res$Class))
         } else {
           length(unique(res$Class))
         }
       } else {
         0
       }
       
       # Default value: for classes, always the highest available for the significant mode chosen
       default_val <- if (is_single) min(25, max_lipids) else max_lipids
       
       # Check if grouping level, significance mode, contrast, split, or significance cutoffs changed
       reset_slider <- FALSE
       if (is.null(last_grouping()) || last_grouping() != input$lseaGrouping) {
         reset_slider <- TRUE
         last_grouping(input$lseaGrouping)
       }
       if (is.null(last_no_sig()) || last_no_sig() != no_sig_val) {
         reset_slider <- TRUE
         last_no_sig(no_sig_val)
       }
       
       de_ci <- shared_data$de_contrast_info()
       curr_contrast <- if (!is.null(de_ci)) paste(c(de_ci$ref, de_ci$comp), collapse = " vs ") else ""
       if (is.null(last_contrast()) || last_contrast() != curr_contrast) {
         reset_slider <- TRUE
         last_contrast(curr_contrast)
       }
       
       curr_split <- input$splitBy %||% "None"
       if (is.null(last_split()) || last_split() != curr_split) {
         reset_slider <- TRUE
         last_split(curr_split)
       }
       
       de_sett <- shared_data$de_settings()
       curr_sig_settings <- paste(
         de_sett$p_threshold %||% 0.05,
         de_sett$p_value_type %||% "raw",
         input$lseaLog2fcThresh %||% 0,
         input$minClassSize %||% 3,
         sep = "_"
       )
       if (is.null(last_sig_settings()) || last_sig_settings() != curr_sig_settings) {
         reset_slider <- TRUE
         last_sig_settings(curr_sig_settings)
       }
       
       curr_val <- isolate(input$numLipids)
       prev_max <- last_max_lipids()
       
       saved_val <- if (isTRUE(shared_data$is_restoring())) {
         shared_data$get_restored_input(session$ns("numLipids"), default_val)
       } else if (reset_slider || is.null(curr_val) || curr_val <= 1 || is.null(prev_max) || prev_max <= 1 || curr_val >= prev_max) {
         default_val
       } else {
         max(1, min(curr_val, max_lipids))
       }
       last_max_lipids(max_lipids)
       
       # Ensure saved_val is within [1, max(1, max_lipids)]
       saved_val <- max(1, min(saved_val, max(1, max_lipids)))
       
       curr_sort <- isolate(input$topLipidsSortBy)
       saved_sort <- if (!is.null(curr_sort)) {
           curr_sort
       } else {
           shared_data$get_restored_input(session$ns("topLipidsSortBy"), "pvalue")
       }
       
       # Set labels depending on grouping
       if (input$lseaGrouping == "Lipid_Name") {
           sort_label <- "Sort Top Lipids By:"
           num_label <- "Number of Lipids to Display:"
        } else if (input$lseaGrouping == "subclass") {
            sort_label <- "Sort Top Lipid Main Classes By:"
            num_label <- "Number of Lipid Main Classes to Display:"
        } else {
            sort_label <- "Sort Top Lipid Categories By:"
            num_label <- "Number of Lipid Categories to Display:"
        }
       
       tagList(
           selectInput(session$ns("topLipidsSortBy"), sort_label,
                       choices = c("P-value (Lowest first)" = "pvalue", 
                                   "Absolute Log2FC (Highest first)" = "log2fc"),
                       selected = saved_sort),
           sliderInput(session$ns("numLipids"), num_label, 
                       min = 1, max = max(1, max_lipids), value = saved_val, step = 1)
       )
    })
    
    output$log2fcThreshUI <- renderUI({
       curr_val <- isolate(input$lseaLog2fcThresh)
       saved_val <- if (!is.null(curr_val)) {
           curr_val
       } else {
           shared_data$get_restored_input(session$ns("lseaLog2fcThresh"), 0)
       }
       numericInput(
         session$ns("lseaLog2fcThresh"),
         tags$span(
           "Log2FC Threshold (abs):",
           bslib::tooltip(
             icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"),
             "Applies a local effect size filter cutoff to include only lipids with an absolute log2 fold change (|Log2FC|) meeting or exceeding this threshold in the lipid set enrichment analysis."
           )
         ), 
         value = saved_val, min = 0, step = 0.1
       )
    })
    
  # --- 2. LSEA Analysis ---
    
    lseaResults <- reactive({
      req(shared_data$data_processed(), shared_data$annotationData(), 
          shared_data$de_contrast_info(), shared_data$grouped_metadata(),
          input$splitBy)
      
      df_wide <- shared_data$data_processed() 
      grp_col <- input$lseaGrouping %||% "subclass"
      
      # Retrieve annotations, using uncollapsed annotations for Class/Hyperclass grouping to support sub-subclasses
      if (grp_col %in% c("subclass", "hyperclass") && !is.null(shared_data$baseLipidAnnotation)) {
        anno <- shared_data$baseLipidAnnotation()
      } else {
        anno <- shared_data$annotationData()
      }
      meta_grouped <- shared_data$grouped_metadata() # Contains Dynamic_DE_Group
      contrast_info <- shared_data$de_contrast_info()
      
      ref_groups <- contrast_info$ref
      comp_groups <- contrast_info$comp
      
      # Filter metadata to matched cols
      use_cols <- setdiff(names(df_wide), "Lipid_Name")
      meta_sub <- meta_grouped %>% dplyr::filter(FullName %in% use_cols)
      
      grp_col <- input$lseaGrouping %||% "subclass"
      
      # Apply Global Filters to Data Matrix
      filtered_ids <- shared_data$global_filtered_lipids()
      if (isTRUE(shared_data$targeted_mode_active())) {
        targeted_df <- if (!is.null(filtered_ids)) df_wide %>% dplyr::filter(Lipid_Name %in% filtered_ids) else df_wide
        needs_fallback <- FALSE
        if (nrow(targeted_df) < 1) {
          needs_fallback <- TRUE
        } else if (grp_col != "Lipid_Name") {
          min_sz <- input$minClassSize %||% 3
          cls_vec <- anno[[grp_col]][match(targeted_df$Lipid_Name, anno$Lipid_Name)]
          cls_tab <- table(cls_vec[!is.na(cls_vec)])
          if (length(cls_tab) == 0 || max(cls_tab) < min_sz) {
            needs_fallback <- TRUE
          }
        }
        
        if (needs_fallback) {
          lsea_fallback_active(TRUE)
          notify_targeted_fallback(session, id = "targeted_fallback_lsea")
          all_filtered_ids <- if (!is.null(shared_data$global_filtered_lipids_all)) shared_data$global_filtered_lipids_all() else NULL
          if (!is.null(all_filtered_ids)) {
            df_wide <- df_wide %>% dplyr::filter(Lipid_Name %in% all_filtered_ids)
          }
        } else {
          lsea_fallback_active(FALSE)
          df_wide <- targeted_df
        }
      } else {
        lsea_fallback_active(FALSE)
        if(!is.null(filtered_ids)) {
          df_wide <- df_wide %>% dplyr::filter(Lipid_Name %in% filtered_ids)
        }
      }
      
      # Pull from global DE results directly if displaying single lipids without faceting
      if (grp_col == "Lipid_Name" && input$splitBy == "None") {
        de_res <- shared_data$de_results()
        if (is.null(de_res) || nrow(de_res) == 0) return(NULL)
        
        # Filter to active filtered lipids
        de_res <- de_res %>% dplyr::filter(Lipid_Name %in% df_wide$Lipid_Name)
        
        final_res <- de_res %>%
          dplyr::transmute(
            Class = Lipid_Name,
            Facet = "All Data",
            Log2FC = log2FC,
            P_Value = p_raw,
            P_Adj = p_adj_bh
          )
      } else {
        # Data Matrix (log2-transformed to ensure mathematically correct log2 fold changes and proper statistics)
        mat_num <- df_wide %>% tibble::column_to_rownames("Lipid_Name") %>% as.matrix()
        mat <- log2(mat_num)
        mat[!is.finite(mat)] <- NA
        
        # Helper to run test on a subset
        run_test_subset <- function(subset_samples, facet_val) {
          if(length(subset_samples) < 2) return(NULL)
          
          # Subset matrix and meta
          sub_mat <- mat[, subset_samples, drop=FALSE]
          sub_meta <- meta_sub %>% dplyr::filter(FullName %in% subset_samples)
          
          # Required to map samples to Ref or Comp based on Dynamic_DE_Group
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
          
          lipid_classes <- if(grp_col == "Lipid_Name") {
              rownames(sub_mat)
          } else {
              anno[[grp_col]][match(rownames(sub_mat), anno$Lipid_Name)]
          }
          
          unique_classes <- unique(lipid_classes)
          unique_classes <- unique_classes[!is.na(unique_classes)]
          
          min_size <- if(grp_col == "Lipid_Name") 1 else input$minClassSize
          
          res_list <- lapply(unique_classes, function(cls) {
            idx <- which(lipid_classes == cls)
            if(length(idx) < min_size) return(NULL)
            
            cls_mat <- sub_mat[idx, , drop=FALSE]
            
            # Aggregate class abundance per sample (mean of log2-transformed intensities)
            cls_means <- colMeans(cls_mat, na.rm=TRUE)
            
            dat <- data.frame(Value = cls_means, Group = conds)
            
            if(length(unique(dat$Group)) < 2) return(NULL)
            if(min(table(dat$Group)) < 2) return(NULL)
            
            vals_comp <- dat$Value[dat$Group == "Comp"]
            vals_ref <- dat$Value[dat$Group == "Ref"]
            
            pval <- tryCatch(compute_local_p_val(vals_ref, vals_comp, method = shared_data$actual_de_method(), paired = FALSE), error=function(e) NA_real_)
            if(is.na(pval)) return(NULL)
            
            data.frame(
              Class = cls,
              Facet = facet_val,
              Log2FC = mean(vals_comp) - mean(vals_ref), # Log2 inputs -> diff = log2FC
              P_Value = pval
            )
          })
          
          do.call(rbind, res_list)
        }
        
        # Iteration
        if (input$splitBy == "None") {
          final_res <- run_test_subset(meta_sub$FullName, "All Data")
        } else {
          facets <- unique(meta_sub[[input$splitBy]])
          facets <- facets[!is.na(facets)]
          
          final_res <- map_df(facets, function(f) {
             samps <- meta_sub$FullName[meta_sub[[input$splitBy]] == f]
             run_test_subset(samps, f)
          })
        }
        
        if(is.null(final_res) || nrow(final_res) == 0) return(NULL)
        
        # Calculate adjusted p-values globally
        final_res$P_Adj <- p.adjust(final_res$P_Value, method = "BH")
      }
      
      de_sett <- shared_data$de_settings()
      p_thresh <- de_sett$p_threshold %||% 0.05
       lfc_thresh <- if (!is.null(input$lseaLog2fcThresh)) input$lseaLog2fcThresh else 0.0
      p_type <- de_sett$p_value_type %||% "raw"
      use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
      
      # Post-processing
      res_processed <- final_res %>%
        dplyr::mutate(
          Active_P = if (use_adj) P_Adj else P_Value,
          Full_Name = if(input$classLabelFormat == "full") get_full_class_name(Class) else format_lsea_short_name(Class),
          Significance = dplyr::case_when(
            Active_P < 0.001 ~ "***",
            Active_P < 0.01 ~ "**",
            Active_P < 0.05 ~ "*",
            TRUE ~ ""
          ),
          P_Val_Label = sapply(Active_P, function(p) {
            if (is.na(p)) return("")
            if (p < 0.001) sprintf("%.1e", p) else sprintf("%.3f", p)
          }),
          NegLog10P = -log10(pmax(Active_P, 1e-300))
        )
      
      # Resolve significance threshold setting (with backward compatibility)
      no_sig <- if (!is.null(input$noSigThreshold)) {
        isTRUE(input$noSigThreshold)
      } else if (!is.null(input$applySigThreshold)) {
        !isTRUE(input$applySigThreshold)
      } else {
        FALSE
      }
      
      # Filter by p-value and local Log2FC unless "Not Apply" is checked
      if (!no_sig) {
        res_processed <- res_processed %>% 
          dplyr::filter(abs(Log2FC) >= lfc_thresh) %>%
          dplyr::filter(Active_P <= p_thresh)
      }
      
      res_processed
    })
    
  # --- 3. Plotting ---
    
    generateLseaPlot <- function() {
      if (is.null(shared_data$de_results())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      res <- lseaResults()
      contrast_info <- shared_data$de_contrast_info()
      if (is.null(res) || nrow(res) == 0) {
        de_sett <- shared_data$de_settings()
        p_thresh <- de_sett$p_threshold %||% 0.05
        lfc_thresh <- de_sett$log2fc_threshold %||% 0.0
        p_type <- de_sett$p_value_type %||% "raw"
        use_adj <- (p_type == "p_adj_bh" || p_type == "adjusted")
        p_label <- if (use_adj) "FDR adjusted p-value" else "raw p-value"
        unit_name <- if ((input$lseaGrouping %||% "subclass") == "Lipid_Name") "lipids" else if ((input$lseaGrouping %||% "subclass") == "subclass") "lipid main classes" else "lipid categories"
        
        return(generate_empty_plot_message(paste0(
          "No significant ", unit_name, " found (", p_label, " < ", p_thresh, ", |Log2FC| >= ", lfc_thresh, ").\n\n",
          "- Shift to Raw (uncorrected) p-value or adjust cutoffs in 3. Differential Expression\n",
          "- Inspect Outliers Detection under Quality Check (outliers may reduce significance)\n",
          "- Note: Lack of significance may also reflect authentic biological uniformity."
        )))
      }
      
      is_single <- (input$lseaGrouping %||% "subclass") == "Lipid_Name"
      
      # Filter by numLipids for all grouping levels
      if (!is.null(input$numLipids)) {
         sort_by <- input$topLipidsSortBy %||% "pvalue"
         if (sort_by == "log2fc") {
            res <- res %>%
              dplyr::group_by(Facet) %>%
              dplyr::arrange(desc(abs(Log2FC))) %>%
              dplyr::slice_head(n = input$numLipids) %>%
              dplyr::ungroup()
         } else {
            res <- res %>%
              dplyr::group_by(Facet) %>%
              dplyr::arrange(P_Value) %>%
              dplyr::slice_head(n = input$numLipids) %>%
              dplyr::ungroup()
         }
      }
      
      if (nrow(res) == 0) {
        return(generate_empty_plot_message("No lipids to display (Number of Lipids to Display is set to 0)."))
      }
      
   # Reorder within facets using tidytext::reorder_within
   # Logic: x = Log2FC, y = Full_Name
      
      low_val <- if (isTRUE(input$customScaleColors) && !is.null(input$lowColor)) input$lowColor else "#0072B2"
      mid_val <- if (isTRUE(input$customScaleColors) && !is.null(input$midColor)) input$midColor else "grey90"
      high_val <- if (isTRUE(input$customScaleColors) && !is.null(input$highColor)) input$highColor else "#D55E00"
      
      # Determine symmetric Log2FC scale limits centered at 0 to guarantee accurate color mapping reflecting the X-axis
      max_abs_lfc <- max(abs(res$Log2FC), na.rm = TRUE)
      if (!is.finite(max_abs_lfc) || max_abs_lfc <= 0) {
        max_abs_lfc <- 1
      }
      lfc_limits <- c(-max_abs_lfc, max_abs_lfc)
      
      label_col <- if (is.null(input$sigDisplayType) || input$sigDisplayType == "star") "Significance" else "P_Val_Label"
      
      p <- ggplot(res, aes(x = Log2FC, y = tidytext::reorder_within(Full_Name, Log2FC, Facet))) +
        geom_vline(xintercept = 0, linetype = "dashed", color = "grey50")
      
      if (isTRUE(input$circledDots)) {
        border_col <- if (!is.null(input$borderColor)) input$borderColor else "black"
        p <- p +
          geom_point(aes(size = NegLog10P, fill = Log2FC), shape = 21, color = border_col, stroke = 0.5) +
          scale_fill_gradient2(
            low = low_val, mid = mid_val, high = high_val, 
            midpoint = 0, limits = lfc_limits, oob = scales::squish, name = "Log2FC"
          )
      } else {
        p <- p +
          geom_point(aes(size = NegLog10P, color = Log2FC)) +
          scale_color_gradient2(
            low = low_val, mid = mid_val, high = high_val, 
            midpoint = 0, limits = lfc_limits, oob = scales::squish, name = "Log2FC"
          )
      }
      
      p <- p +
        geom_text(aes(label = .data[[label_col]], hjust = ifelse(Log2FC > 0, 1.4, -0.4)), color = "black", vjust = 0.5, size = input$labelSize) +
        scale_y_reordered() +
        scale_size(range = c(input$pointSize/2, input$pointSize*1.5)) +
        theme_pubr(base_size = input$textSize) +
        theme(legend.position = "right") +
        ggplot2::coord_cartesian(clip = "off") +
        labs(
          title = paste(if (is_single) "Ranked Single Lipid Remodeling:" else "Ranked Lipid Class Enrichment:", contrast_info$str),
          y = NULL,
          x = if (is_single) "Log2 Fold Change" else "Log2 Fold Change (Aggregated by Class)"
        )
        
      if (input$splitBy != "None") {
        p <- p + facet_wrap(~Facet, scales = "free_y", ncol = 3)
      }
      
      p
    }
    
    output$lsea_fallback_alert <- renderUI({
      targeted_fallback_banner_ui(isTRUE(lsea_fallback_active()))
    })
    output$de_not_run_banner <- renderUI({
      render_de_not_run_banner(shared_data)
    })
    
    output$lseaPlot <- renderPlot({ 
      if (is.null(shared_data$de_results()) || is.null(shared_data$de_contrast_info())) {
        return(generate_empty_plot_message("Please select comparison groups above or click 'Show in menu'"))
      }
      generateLseaPlot() 
    })
    
    output$lsea_stats_text <- renderText({
       if (is.null(shared_data$de_results()) || is.null(shared_data$de_contrast_info())) {
         return("Differential Expression Analysis Not Run")
       }
       res <- lseaResults()
       if(is.null(res)) return("No results.")
       
       grp_col <- input$lseaGrouping %||% "subclass"
       unit_name <- if (grp_col == "Lipid_Name") {
         "lipids"
       } else if (grp_col == "subclass") {
         "main classes"
       } else {
         "lipid categories"
       }
       
       # Resolve significance threshold setting
       no_sig <- if (!is.null(input$noSigThreshold)) {
         isTRUE(input$noSigThreshold)
       } else if (!is.null(input$applySigThreshold)) {
         !isTRUE(input$applySigThreshold)
       } else {
         FALSE
       }
       
       if (!is.null(input$numLipids)) {
           sort_by <- input$topLipidsSortBy %||% "pvalue"
           if (sort_by == "log2fc") {
               res_display <- res %>%
                 dplyr::group_by(Facet) %>%
                 dplyr::arrange(desc(abs(Log2FC))) %>%
                 dplyr::slice_head(n = input$numLipids) %>%
                 dplyr::ungroup()
           } else {
               res_display <- res %>%
                 dplyr::group_by(Facet) %>%
                 dplyr::arrange(P_Value) %>%
                 dplyr::slice_head(n = input$numLipids) %>%
                 dplyr::ungroup()
           }
           
           show_count <- nrow(res_display)
           total_count <- nrow(res)
           
           if (no_sig) {
             paste0("LSEA Results: showing ", show_count, " ", unit_name, " out of ", total_count, " tested (Significance Threshold is Not Applied).")
           } else {
             paste0("LSEA Results: found ", total_count, " significant ", unit_name, " (showing top ", show_count, ").")
           }
       } else {
           if (no_sig) {
             paste0("LSEA Results: showing ", nrow(res), " ", unit_name, " (Significance Threshold is Not Applied).")
           } else {
             paste0("LSEA Results: found ", nrow(res), " significant ", unit_name, ".")
           }
       }
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
    
    output$lsea_stat_note <- renderUI({
      get_journal_caption("lsea", shared_data$actual_de_method(), shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info())
    })
    
    observeEvent(input$show_stats_detail, {
      # Build detailed mathematical report for LSEA
      de_sett <- shared_data$de_settings()
      actual_method <- shared_data$actual_de_method()
      base_method <- gsub("^auto_", "", actual_method)
      
      meta <- tryCatch(shared_data$grouped_metadata(), error = function(e) NULL)
      contrast <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      n_ref <- 0
      n_comp <- 0
      if (!is.null(meta) && !is.null(contrast)) {
        n_ref <- sum(meta$Dynamic_DE_Group %in% contrast$ref, na.rm = TRUE)
        n_comp <- sum(meta$Dynamic_DE_Group %in% contrast$comp, na.rm = TRUE)
      }
      
      # Determine display label for Grouping Level
      grp_val <- input$lseaGrouping %||% "subclass"
      grp_label <- switch(grp_val,
        "subclass" = "Lipid Main Class",
        "hyperclass" = "Lipid Category",
        "Lipid_Name" = "Single Lipid",
        grp_val
      )
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: LIPID SET ENRICHMENT ANALYSIS\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. LSEA CONFIGURATION\n",
        "   - Grouping Level:           ", grp_label, "\n",
        "   - Minimum Lipids per Class: ", input$minClassSize, "\n",
        "   - Underlying DE Method:     ", actual_method, "\n",
        "   - Underlying P-value Type:  ", de_sett$p_value_type, "\n",
        "   - Ignore DE Threshold:      ", ifelse(isTRUE(input$noSigThreshold), "Yes", "No"), "\n\n"
      )
      
      if (grp_val == "Lipid_Name") {
        msg <- paste0(
          msg,
          "2. MATHEMATICAL FORMULATION & CALCULUS EXAMPLE (Single Lipid Level)\n",
          "   For each individual lipid species:\n",
          "   Let X_g represent the raw abundance of the lipid in sample 'g'.\n\n",
          "   1. Log2-Transformation:\n",
          "        x_g = log2(X_g)\n",
          "      (This standardizes the multiplicative variance in lipid abundance into additive variance).\n\n",
          "   2. Abundance Comparison:\n",
          "      We compare the log2 abundances of the comparison group (N_comp = ", n_comp, ") vs reference group (N_ref = ", n_ref, ").\n",
          "        Delta_x = Mean(x_comp) - Mean(x_ref)\n\n",
          "   3. Significance Testing (Local P-value):\n",
          "      We test the null hypothesis that there is no difference in abundance between the two groups.\n"
        )
        
        if (base_method == "non_parametric") {
          msg <- paste0(
            msg,
            "      We perform a Wilcoxon rank-sum test by pooling x_g values, ranking them from 1 to N = ", (n_ref + n_comp), ",\n",
            "      and computing the Mann-Whitney U statistic:\n",
            "          U = R_comp - [", n_comp, " * (", n_comp, " + 1)] / 2\n",
            "          Z-score = (U - mu_U) / sigma_U\n",
            "      where expected mean mu_U = ", (n_comp * n_ref) / 2, " and expected variance sigma_U^2 = ", round((n_comp * n_ref * (n_comp + n_ref + 1)) / 12, 4), ".\n"
          )
        } else {
          msg <- paste0(
            msg,
            "      We perform a standard two-sample Student's t-test comparing x_comp vs x_ref:\n",
            "          t = Delta_x / ( s_p * sqrt(1/", n_comp, " + 1/", n_ref, ") )\n",
            "      where pooled standard deviation s_p is:\n",
            "          s_p = sqrt( ( (", n_comp, " - 1)*s_comp^2 + (", n_ref, " - 1)*s_ref^2 ) / ", (n_comp + n_ref - 2), " )\n",
            "      The raw p-value is calculated from a Student's t-distribution with df = ", (n_comp + n_ref - 2), ".\n"
          )
        }
      } else {
        msg <- paste0(
          msg,
          "2. MATHEMATICAL FORMULATION & CALCULUS EXAMPLE (Class-Level Enrichment)\n",
          "   For a lipid class 'C' containing k species (k >= ", input$minClassSize, "):\n",
          "   Let X_ig represent the raw abundance of lipid 'i' in sample 'g'.\n\n",
          "   1. Log2-Transformation:\n",
          "        x_ig = log2(X_ig)\n",
          "      (This standardizes the multiplicative variance in lipid abundance into additive variance).\n\n",
          "   2. Class-Level Abundance Aggregation:\n",
          "      For each sample 'g', the class abundance is the mean of log2 abundances:\n",
          "        Y_Cg = (1 / k) * sum_{i in C} x_ig\n\n",
          "   3. Class Log2 Fold Change (Log2FC):\n",
          "      Let 'comp' be the comparison group (N_comp = ", n_comp, ") and 'ref' be the reference group (N_ref = ", n_ref, ").\n",
          "        Delta_Y_C = Mean(Y_C, comp) - Mean(Y_C, ref)\n",
          "                  = (1 / ", n_comp, ") * sum_{g in comp} Y_Cg  -  (1 / ", n_ref, ") * sum_{g in ref} Y_Cg\n\n",
          "   4. Significance Testing (Local P-value):\n",
          "      We test the null hypothesis that there is no difference in class abundance between the two groups.\n"
        )
        
        if (base_method == "non_parametric") {
          msg <- paste0(
            msg,
            "      We perform a Wilcoxon rank-sum test by pooling Y_Cg, ranking them from 1 to N = ", (n_ref + n_comp), ",\n",
            "      and computing the Mann-Whitney U statistic:\n",
            "          U = R_comp - [", n_comp, " * (", n_comp, " + 1)] / 2\n",
            "          Z-score = (U - mu_U) / sigma_U\n",
            "      where expected mean mu_U = ", (n_comp * n_ref) / 2, " and expected variance sigma_U^2 = ", round((n_comp * n_ref * (n_comp + n_ref + 1)) / 12, 4), ".\n"
          )
        } else {
          msg <- paste0(
            msg,
            "      We perform a standard two-sample Student's t-test comparing L_comp vs L_ref:\n",
            "          t = Delta_Y_C / ( s_p * sqrt(1/", n_comp, " + 1/", n_ref, ") )\n",
            "      where pooled standard deviation s_p is:\n",
            "          s_p = sqrt( ( (", n_comp, " - 1)*s_comp^2 + (", n_ref, " - 1)*s_ref^2 ) / ", (n_comp + n_ref - 2), " )\n",
            "      The raw p-value is calculated from a Student's t-distribution with df = ", (n_comp + n_ref - 2), ".\n"
          )
        }
      }
      
      msg <- paste0(
        msg,
        "\n   5. Multiple Testing Adjustment:\n",
        "      P-values are adjusted using the Benjamini-Hochberg (BH) False Discovery Rate (FDR) procedure:\n",
        "          Adjusted P(i) = P(i) * total_classes / rank_i\n",
        "      where classes are ordered by increasing raw p-value.\n",
        "==================================================\n"
      )
      
      msg <- paste0(msg, "\n", get_stats_console_method_summary(shared_data))
      
      # Write to stats_detail_text and display modal overlay
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Lipid Set Enrichment (LSEA)")
    })
    
  })
}
