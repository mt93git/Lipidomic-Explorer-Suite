# R/modules/2_qc_boxplot_module.R
# QC boxplots and PCA plots.

qc_boxplot_ui <- function(id) {
  ns <- NS(id)
  tagList(
  # Use bslib::layout_sidebar for collapsible native sidebar
    layout_sidebar(
      sidebar = sidebar(
        width = 350,
        open = "desktop",
        accordion(
           open = c("1. Data processing and PCA", "2. Data Visualization"), multiple = TRUE,
           accordion_panel("1. Data processing and PCA", icon = icon("cogs"),
             selectInput(ns("normalizationMethod"), "Normalization Method:",
                         choices = c("Median (Log Scale)" = "median", "PQN (Linear Scale)" = "pqn", "None" = "none"),
                         selected = "median"),
             radioButtons(ns("pcaMode"), "PCA Analysis Mode:",
                          choices = c("Individual Lipids" = "omics",
                                      "Aggregated Classes" = "class"),
                          selected = "class"),
             hr(),
             strong("Missing Value Handling"),
             checkboxInput(ns("useImputation"), "Impute Missing Values (QRILC)", value = TRUE),
             checkboxInput(ns("imputeZerosPerFile"), "For each file, impute all-NA lipids to 0", value = TRUE),
             checkboxInput(ns("imputeRemainingNAtoZero"), "Final cleanup: Impute any remaining NAs to 0", value = TRUE),
             hr(),
             strong("Data Filtering"),
             checkboxInput(ns("mergeReplicates"), "Display merged replicated", TRUE),
             checkboxInput(ns("dropMisc"), "Drop 'Misc' lipids?", TRUE),
             hr(),
             numericInput(ns("maxPCs"), "Max PCs to compute:", value = 3, min = 2, step = 1)
           ),
           accordion_panel("2. Data Visualization", icon = icon("paint-brush"),
              accordion(
                open = "PCA Score Plot", multiple = TRUE,
                accordion_panel("PCA Score Plot", icon=icon("users"),
                  strong("Coloring"),
                  radioButtons(ns("colorGrouping"), "Color Samples By:", 
                               choices=c("Condition","Population","Condition & Population"), selected="Condition", inline=TRUE),
                  checkboxGroupInput(ns("labelParts"), "Label content:", 
                                     choices=c("Condition","Population","Replicate"), selected=c("Condition"), inline=TRUE),
                  checkboxInput(ns("useCustomColors"), "Override sample colors?", FALSE),
                  uiOutput(ns("customColorUI")), 
                  hr(),
                  strong("Shaping"),
                  checkboxInput(ns("useShapes"), "Use different shapes for groups?", value=FALSE),
                  conditionalPanel("input.useShapes == true", ns = ns,
                    radioButtons(ns("shapeGrouping"), "Shape Samples By:", choices=c("Condition","Population"), selected="Population", inline=TRUE),
                    uiOutput(ns("customShapeUI"))
                  )
                ),
                accordion_panel("PCA Loading Plot", icon=icon("atom"),
                  p(class="text-muted small", "Class colors are now managed in the Global Sidebar (8. Color Classes).")
                ),
                accordion_panel("Plot Styling", icon=icon("ruler-combined"),
                  checkboxInput(ns("addFrame2D"), "Add frame to 2D plots?", FALSE), hr(),
                  sliderInput(ns("scoreMarkerSize2D"), "PCA - 2D Dot Size:", min=1, max=20, value=8),
                  sliderInput(ns("scoreTextSize2D"), "PCA - 2D Label Size:", min=1, max=10, value=4, step=0.5),
                  sliderInput(ns("scoreMarkerSize3D"), "PCA - 3D Dot Size:", min=1, max=20, value=8), hr(),
                  sliderInput(ns("loadMarkerSize2D"), "Loadings - 2D Dot Size:", min=1, max=20, value=8),
                  sliderInput(ns("loadTextSize2D"), "Loadings - 2D Label Size:", min=1, max=10, value=4, step=0.5),
                  sliderInput(ns("loadMarkerSize3D"), "Loadings - 3D Dot Size:", min=1, max=20, value=14), hr(),
                  checkboxInput(ns("showLabels3D"), "Show labels on 3D plots?", value = TRUE)
                ),
                accordion_panel("2D Smart Labeling (ggrepel)", icon=icon("tags"),
                  checkboxInput(ns("smartLabelPCA2D"), "Display Labeling (PCA 2D)?", TRUE),
                  conditionalPanel("input.smartLabelPCA2D == true", ns = ns,
                    sliderInput(ns("repelForcePCA2D"), "Repel Force:", min=0, max=100, value=30),
                    sliderInput(ns("repelBoxPadPCA2D"), "Box Padding:", min=0, max=2, value=0.35, step=0.05),
                    sliderInput(ns("repelPointPadPCA2D"), "Point Padding:", min=0, max=2, value=0.35, step=0.05)
                  ), 
                  hr(),
                  checkboxInput(ns("smartLabelLoad2D"), "Display Labeling (Loadings 2D)?", TRUE),
                  conditionalPanel("input.smartLabelLoad2D == true", ns = ns,
                    sliderInput(ns("repelForceLoad2D"), "Repel Force:", min=0, max=100, value=20),
                    sliderInput(ns("repelBoxPadLoad2D"), "Box Padding:", min=0, max=2, value=0.35, step=0.05),
                    sliderInput(ns("repelPointPadLoad2D"), "Point Padding:", min=0, max=2, value=0.35, step=0.05)
                  )
                )
              )
           )
        )
      ),
      navset_card_pill(
          id = ns("main_tabs"),
          selected = "PCA Score Plots",
          nav_panel("Normalization Check",
             card(
               card_body(jqui_resizable(plotOutput(ns("boxplotAfterNorm"), height="60vh"))),
               card_footer(downloadButton(ns("downloadBoxplotAfter"), "Download PDF", class="btn-sm"))
             )
          ),
          nav_panel("PCA Score Plots",
            navset_card_tab(
              nav_panel("2D Score Plot", 
                card(
                  card_body(jqui_resizable(plotOutput(ns("pca2dPlot"), height="80vh"))),
                  card_footer(downloadButton(ns("downloadPCA2Dpdf"), "Download PDF", class="btn-sm"))
                )
              ),
              nav_panel("3D Score Plot", 
                card(
                  card_body(jqui_resizable(plotlyOutput(ns("pca3dPlot"), height="80vh"))),
                  card_footer(downloadButton(ns("downloadPCA3Dpdf"), "Download PDF", class="btn-sm"))
                )
              )
            )
          ),
          nav_panel("PCA Loading Plots",
            navset_card_tab(
              nav_panel("2D Loading Plot", 
                card(
                  card_body(jqui_resizable(plotOutput(ns("load2dPlot"), height="80vh"))),
                  card_footer(downloadButton(ns("downloadLoad2Dpdf"), "Download PDF", class="btn-sm"))
                )
              ),
              nav_panel("3D Loading Plot", 
                card(
                  card_body(jqui_resizable(plotlyOutput(ns("load3dPlot"), height="80vh"))),
                  card_footer(downloadButton(ns("downloadLoad3Dpdf"), "Download PDF", class="btn-sm"))
                )
              )
            )
          )
      )
    )
  )
}

qc_boxplot_server <- function(id, shared_data, global_color_map) {
  moduleServer(id, function(input, output, session) {
    
    SHAPE_CHOICES <- c("Circle"=16, "Square"=15, "Triangle"=17, "Diamond"=18, "Plus"=3, "Cross"=4, "Star"=8)
    
  # Helper for safe fallback
    `%||%` <- function(a, b) if (is.null(a) || is.na(a)) b else a

  # --- 1. Export Settings to Shared Data ---
    settings_out <- reactive({
      list(
        normalizationMethod = input$normalizationMethod,
        pcaMode = input$pcaMode,
        useImputation = input$useImputation,
        imputeZerosPerFile = input$imputeZerosPerFile,
        imputeRemainingNAtoZero = input$imputeRemainingNAtoZero,
        mergeReplicates = input$mergeReplicates,
        dropMisc = input$dropMisc,
        maxPCs = input$maxPCs,
        
    # Aesthetics for Shared Config
        colorGrouping = input$colorGrouping,
        labelParts = input$labelParts,
        useCustomColors = input$useCustomColors

        
    # Capture Custom Color Inputs dynamically
    # custom_color_inputs removed to avoid triggering on irrelevant input changes (like plot resize)
      )
    })
    
  # Helper to extract custom colors pattern
    custom_colors_list <- reactive({
      nm <- names(input)
      col_inputs <- nm[grep("^customCol_", nm)]
      vals <- list()
      for(ci in col_inputs) vals[[gsub("customCol_", "", ci, fixed=TRUE)]] <- input[[ci]]
      vals
    })
    

    
  # custom_class_colors_list removed
    
  # Update return to include precise lists
    final_settings <- reactive({
      lst <- settings_out()
      lst$custom_colors <- custom_colors_list()

   # lst$custom_class_colors removed
      lst
    })

  # --- 2. Aesthetics Logic (Migrated from Shared) ---
  # required master maps from Shared (which depend on Metadata) to render options
  # shared_data$color_maps() exists? Yes, but it needs to be robust.
    
    activeColorMap <- reactive({ req(shared_data$color_maps(), input$colorGrouping); shared_data$color_maps()[[input$colorGrouping]] })
    activeShapeMap <- reactive({ req(shared_data$shape_maps(), input$shapeGrouping); shared_data$shape_maps()[[input$shapeGrouping]] })

    output$customColorUI <- renderUI({
      req(isTRUE(input$useCustomColors), activeColorMap())
      colors <- activeColorMap(); validate(need(length(colors) > 0, "No groups for custom colors."))
      lapply(names(colors), function(g) colourInput(session$ns(paste0("customCol_", gsub("\\s|&", "_", g))), paste("Color for", g), value = colors[[g]]))
    })
    output$customShapeUI <- renderUI({
      req(isTRUE(input$useShapes), activeShapeMap())
      shapes <- activeShapeMap(); validate(need(length(shapes) > 0, "No groups for custom shapes."))
      lapply(names(shapes), function(g) selectInput(session$ns(paste0("customShape_", g)), paste("Shape for", g), choices = SHAPE_CHOICES, selected = shapes[[g]]))
    })
    
  # Dynamic Class Colors for Local Use
    local_class_colors <- reactive({
      req(shared_data$class_color_map())
      shared_data$class_color_map()
    })


    plot_dims <- reactiveValues(
      pca2d=list(width=960, height=768), pca3d=list(width=960, height=720), 
      load2d=list(width=960, height=768), load3d=list(width=960, height=720),
      boxplot_after=list(width=600, height=500)
    )
    observeEvent(input$pca2dPlot_size, { plot_dims$pca2d <- input$pca2dPlot_size })
    observeEvent(input$pca3dPlot_size, { plot_dims$pca3d <- input$pca3dPlot_size })
    observeEvent(input$load2dPlot_size, { plot_dims$load2d <- input$load2dPlot_size })
    observeEvent(input$load3dPlot_size, { plot_dims$load3d <- input$load3dPlot_size })

    observeEvent(input$boxplotAfterNorm_size, { plot_dims$boxplot_after <- input$boxplotAfterNorm_size })

    prepare_boxplot_data <- function(data_df, metadata) {
      data_df %>%
        tidyr::pivot_longer(cols = -Lipid_Name, names_to = "FullName", values_to = "Intensity") %>%
        dplyr::left_join(metadata %>% dplyr::select(FullName, Condition), by = "FullName")
    }
    data_pre_processed <- reactive({
        req(shared_data$rawData(), shared_data$selected_cols())
        raw_data_list <- shared_data$rawData(); useCols <- shared_data$selected_cols()
        df <- raw_data_list$data %>% dplyr::select(Lipid_Name, all_of(useCols))
        
    # --- Restore Imputation Logic ---
        impute_zeros <- function(df, cols_to_check) {
          if(is.null(cols_to_check)) return(df)
          cols_present <- intersect(names(df), cols_to_check)
          if (length(cols_present) > 0) {
            rows_all_na <- rowSums(is.na(df[, cols_present, drop=FALSE])) == length(cols_present)
            df[rows_all_na, cols_present] <- 0
          }
          return(df)
        }
        
        if (isTRUE(input$imputeZerosPerFile)) {
          for (cols_in_file in raw_data_list$file_cols) {
            df <- impute_zeros(df, cols_in_file)
          }
        }
        
    # Apply Global Filters
        f_lipids <- shared_data$global_filtered_lipids()
        if(!is.null(f_lipids)) { df <- df %>% dplyr::filter(Lipid_Name %in% f_lipids) }
        df
    })

    boxplotAfterPlotObj <- reactive({
      req(shared_data$data_processed()); metadata <- shared_data$all_metadata()
      df_processed <- shared_data$data_processed()
      
   # Apply Global Filters
      f_lipids <- shared_data$global_filtered_lipids()
      if(!is.null(f_lipids)) { df_processed <- df_processed %>% dplyr::filter(Lipid_Name %in% f_lipids) }
      
      df_log <- df_processed %>% dplyr::mutate(across(where(is.numeric), ~log2(. + 1)))
      plot_data <- prepare_boxplot_data(df_log, metadata)
      ggplot(plot_data, aes(x = FullName, y = Intensity, fill = Condition)) +
        geom_boxplot(outlier.shape = NA) + labs(x = NULL, y = "Log2(Intensity + 1)") +
        theme_bw(base_size = 12) +
        coord_cartesian(ylim = quantile(plot_data$Intensity, c(0.01, 0.99), na.rm = TRUE)) +
        theme(axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5))
    })

    output$boxplotAfterNorm <- renderPlot({ boxplotAfterPlotObj() })
    
    plot_data <- reactive({
      res <- shared_data$pca_results(); req(res)
      scores <- res$score_df
      replicate_col <- if ("Replicate" %in% names(scores)) scores$Replicate else NA
      scores$Label <- mapply(
        function(c, p, r) {
          parts <- input$labelParts
          paste(c(if("Condition" %in% parts) gsub("_"," ", c), if("Population" %in% parts) p, if("Replicate" %in% parts) r), collapse="\n")
        },
        scores$Condition, scores$Population, replicate_col
      )
      loadings <- res$load_df
      if("Lipid_Name" %in% names(loadings)) { loadings$Label <- loadings$Lipid_Name } else { loadings$Label <- gsub("_"," ",loadings$Class) }
      return(list(scores = scores, loadings = loadings, var_pc = res$var_PC))
    })

    buildPCA2D_ggplot <- reactive({
      req(plot_data()); p_data <- plot_data()
      scores <- p_data$scores; colorMap <- global_color_map()[[input$colorGrouping]]
      if (input$colorGrouping == "Condition & Population") {
        scores$ColorGroupVal <- gsub("_NA$", "", paste(scores$Condition, scores$Population, sep = "_"))
      } else { 
    # FIX: Do NOT replace underscores with spaces here, as keys in global_color_map retain underscores.
        scores$ColorGroupVal <- scores[[input$colorGrouping]] %>% replace_na("NA") 
      }
      scores$ColorGroupVal <- factor(scores$ColorGroupVal, levels = names(colorMap))
      plot_aes <- aes(x = PC1, y = PC2, color = ColorGroupVal)
      if (isTRUE(input$useShapes)) {
        shapeMap <- shared_data$shape_maps()[[input$shapeGrouping]]; req(shapeMap)
        scores$ShapeGroupVal <- scores[[input$shapeGrouping]] %>% replace_na("NA")
        scores$ShapeGroupVal <- factor(scores$ShapeGroupVal, levels = names(shapeMap))
        plot_aes <- utils::modifyList(plot_aes, aes(shape = ShapeGroupVal))
      }
      p <- ggplot(scores, plot_aes) + geom_point(size = input$scoreMarkerSize2D) +
        scale_color_manual(name = input$colorGrouping, values = colorMap, drop = FALSE) +
        geom_hline(yintercept = 0, color = "black", linewidth = 0.4) +
        geom_vline(xintercept = 0, color = "black", linewidth = 0.4) +
        labs(title="2D PCA Score Plot", x=paste0("PC1 (",p_data$var_pc[1],"%)"), y=paste0("PC2 (",p_data$var_pc[2 %||% 1],"%)")) +
        theme_bw(base_size = 14) + theme(panel.grid=element_blank())
      if (isTRUE(input$addFrame2D)) { p <- p + theme(panel.border=element_rect(colour="black", fill=NA, linewidth=1)) }
      if (isTRUE(input$smartLabelPCA2D)) {
        p <- p + geom_text_repel(aes(label = Label), color = "black", size = input$scoreTextSize2D,
                                 force=input$repelForcePCA2D, box.padding=input$repelBoxPadPCA2D,
                                 point.padding=input$repelPointPadPCA2D)
      } else {
        p <- p + geom_text(aes(label = Label), vjust=-0.8, color="black", size=input$scoreTextSize2D)
      }
      if (isTRUE(input$useShapes)) { p <- p + scale_shape_manual(name = input$shapeGrouping, values = shared_data$shape_maps()[[input$shapeGrouping]]) }
      return(p)
    })
    
    buildPCA3D_plotly <- reactive({
      req(plot_data()); p_data <- plot_data(); scores <- p_data$scores; req("PC3" %in% names(scores))
      colorMap <- global_color_map()[[input$colorGrouping]]
      if (input$colorGrouping == "Condition & Population") {
        scores$ColorGroupVal <- gsub("_NA$", "", paste(scores$Condition, scores$Population, sep = "_"))
      } else { 
    # FIX: Do NOT replace underscores with spaces here, as keys in global_color_map retain underscores.
        scores$ColorGroupVal <- scores[[input$colorGrouping]] %>% replace_na("NA")
      }
      scores$ColorGroupVal <- factor(scores$ColorGroupVal, levels = names(colorMap))
      GGPLOT_TO_PLOTLY_SHAPES <- c("16"="circle", "15"="square", "17"="triangle-up", "18"="diamond", "3"="cross", "4"="x", "8"="star")
      shapeMap_plotly <- NULL
      if(isTRUE(input$useShapes)) {
          shapeMap_gg <- shared_data$shape_maps()[[input$shapeGrouping]]; req(shapeMap_gg)
          shapeMap_plotly <- GGPLOT_TO_PLOTLY_SHAPES[as.character(shapeMap_gg)]; names(shapeMap_plotly) <- names(shapeMap_gg)
          scores$ShapeGroupVal <- scores[[input$shapeGrouping]] %>% replace_na("NA"); scores$ShapeGroupVal <- factor(scores$ShapeGroupVal, levels=names(shapeMap_plotly))
      }
      plot_ly(data=scores, x=~PC1, y=~PC2, z=~PC3, color=~ColorGroupVal, colors=colorMap,
              symbol=if(isTRUE(input$useShapes)) ~ShapeGroupVal else I("circle"),
              symbols=if(isTRUE(input$useShapes)) shapeMap_plotly else NULL,
              text=~Label, type="scatter3d", mode=if(isTRUE(input$showLabels3D)) "markers+text" else "markers",
              textfont=list(color='#000000', size=12),
              marker=list(size=input$scoreMarkerSize3D)) %>%
        layout(title=list(text="3D PCA Score"), scene=list(xaxis=list(title=paste0("PC1 (",p_data$var_pc[1],"%)")),
                          yaxis=list(title=paste0("PC2 (",p_data$var_pc[2] %||% 1,"%)")), zaxis=list(title=paste0("PC3 (",p_data$var_pc[3] %||% 1,"%)"))))
    })
    
    buildLoad2D_ggplot <- reactive({
      req(plot_data()); p_data <- plot_data(); loadings <- p_data$loadings
      p <- ggplot(loadings, aes(PC1, PC2, color = Class)) + geom_point(size = input$loadMarkerSize2D) +
        scale_color_manual(values = local_class_colors(), name = "Lipid Class", drop = FALSE) +
        geom_hline(yintercept = 0, color="black", linewidth = 0.4) +
        geom_vline(xintercept = 0, color="black", linewidth = 0.4) +
        labs(title = "2D PCA Loadings", x = "PC1 Loading", y = "PC2 Loading") +
        theme_bw(base_size = 14) + theme(panel.grid=element_blank())
      if (isTRUE(input$addFrame2D)) { p <- p + theme(panel.border=element_rect(colour="black", fill=NA, linewidth=1)) }
      if (isTRUE(input$smartLabelLoad2D)) {
        p <- p + geom_text_repel(aes(label = Label), color = "black", size = input$loadTextSize2D,
                                 force=input$repelForceLoad2D, box.padding=input$repelBoxPadLoad2D,
                                 point.padding=input$repelPointPadLoad2D)
      } else {
        p <- p + geom_text(aes(label = Label), vjust = -0.8, color = "black", size = input$loadTextSize2D)
      }
      return(p)
    })
    
    buildLoad3D_plotly <- reactive({
      req(plot_data()); p_data <- plot_data(); loadings <- p_data$loadings; req("PC3" %in% names(loadings))
      plot_ly(data=loadings, x=~PC1, y=~PC2, z=~PC3, color=~Class, colors=local_class_colors(),
              text=~Label, type="scatter3d", mode=if(isTRUE(input$showLabels3D)) "markers+text" else "markers",
              textfont=list(color='#000000', size=12),
              marker=list(size=input$loadMarkerSize3D)) %>%
        layout(title=list(text="3D PCA Loadings"), scene=list(xaxis=list(title="PC1 Loading"),
                          yaxis=list(title="PC2 Loading"), zaxis=list(title="PC3 Loading")))
    })
    
    output$pca2dPlot <- renderPlot({ buildPCA2D_ggplot() })
    output$pca3dPlot <- renderPlotly({ buildPCA3D_plotly() })
    output$load2dPlot <- renderPlot({ buildLoad2D_ggplot() })
    output$load3dPlot <- renderPlotly({ buildLoad3D_plotly() })
    
    create_download <- function(plot_obj, dims, file_prefix) {
      downloadHandler(
        filename = function() paste0(file_prefix, "_", format(Sys.time(),"%Y%m%d_%H%M"), ".pdf"),
        content = function(f) { 
          tryCatch({
            p <- plot_obj()
            req(p)
            d <- dims()
            ggsave(f, plot = p, device = "pdf", width = d$width/96, height = d$height/96, units = "in", limitsize = FALSE)
          }, error = function(e) {
            pdf(f, width=8, height=6)
            plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
            text(0, 0, paste("ERROR in ggsave/QC:\n", e$message), col="red", cex=0.8)
            dev.off()
          })
        },
        contentType = "application/pdf"
      )
    }
    create_3d_download <- function(plotly_obj, dims, file_prefix) {
      downloadHandler(
        filename = function() paste0(file_prefix, "_", format(Sys.time(),"%Y%m%d_%H%M"), ".pdf"),
        content = function(f) { 
          tryCatch({
            fig <- plotly_obj()
            req(fig)
            d <- dims()
            tmp <- tempfile(fileext=".html")
            htmlwidgets::saveWidget(fig, tmp)
            webshot2::webshot(tmp, f, vwidth=d$width, vheight=d$height)
          }, error = function(e) {
            pdf(f, width=8, height=6)
            plot(0, 0, type="n", axes=FALSE, xlab="", ylab="")
            text(0, 0, paste("ERROR in webshot/plotly:\n", e$message), col="red", cex=0.8)
            dev.off()
          })
        },
        contentType = "application/pdf"
      )
    }
    output$downloadPCA2Dpdf <- create_download(reactive({buildPCA2D_ggplot()}), reactive(plot_dims$pca2d), "PCA_2D")
    output$downloadLoad2Dpdf <- create_download(reactive({buildLoad2D_ggplot()}), reactive(plot_dims$load2d), "Loading_2D")
    output$downloadBoxplotBefore <- create_download(boxplotBeforePlotObj, reactive(plot_dims$boxplot_before), "QC_Boxplot_Before")
    output$downloadBoxplotAfter <- create_download(boxplotAfterPlotObj, reactive(plot_dims$boxplot_after), "QC_Boxplot_After")
    output$downloadPCA3Dpdf <- create_3d_download(reactive({buildPCA3D_plotly()}), reactive(plot_dims$pca3d), "PCA_3D")
    output$downloadLoad3Dpdf <- create_3d_download(reactive({buildLoad3D_plotly()}), reactive(plot_dims$load3d), "Loading_3D")
    
    return(final_settings)
  })
}

