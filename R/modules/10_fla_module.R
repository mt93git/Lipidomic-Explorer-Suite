# R/modules/10_fla_module.R
# Functional Lipid Analysis (FLA) Module

fla_palette_global <- c(
    "Structural"="#4E79A7", "Signaling"="#E15759", "Energy"="#59A14F",
    "Membrane Architecture"="#1F4E79", "Lipid Raft Dynamics"="#2B7A78", 
    "Apoptosis & Ferroptosis"="#D7191C", "Mitochondrial Homeostasis"="#E66100", 
    "Epigenetic Remodeling"="#7B3294", "Vesicular Trafficking"="#8C510A", 
    "Secondary Signaling Messengers"="#D01C8B", "Lysosomal Hydrolysis & Eicosanoids"="#CA0020", 
    "Lipid Droplet Maturation"="#1A9850", "Lipolytic Clearance"="#008837",
    "Other"="#404040"
)

formula_dict_global <- list(
    "Membrane_Fluidity_Index" = "PC / (PE + SM)", "PE/PC_Index" = "PE / PC",
    "Structural/Energetic_Ratio" = "(PC + PE + SM) / (TAG + DAG)", "Cardiolipin_Fraction" = "CL / Total Lipids",
    "CE_Fraction" = "CE / Total Lipids", "PC_Fraction" = "PC / Total Lipids", "PE_Fraction" = "PE / Total Lipids",
    "SM_Fraction" = "SM / Total Lipids", "Plasmalogen_Fraction" = "PE(P) / (PE + PE(P))",
    "Ether_PE_Fraction" = "PE(O) / (PE + PE(O))", "SFA_Fraction" = "SFA / Total Lipids",
    "MUFA_Fraction" = "MUFA / Total Lipids", "PUFA_Fraction" = "PUFA / Total Lipids",
    "AA_Fraction" = "AA (20:4) / Total PUFA", "EPA_Fraction" = "EPA (20:5) / Total PUFA",
    "DHA_Fraction" = "DHA (22:6) / Total PUFA",
    "PUFA/SFA_Ratio" = "PUFA / SFA", "SCFA_Fraction" = "SCFA / Total Lipids",
    "MCFA_Fraction" = "MCFA / Total Lipids", "LCFA_Fraction" = "LCFA / Total Lipids",
    "VLCFA_Fraction" = "VLCFA / Total Lipids", "(LPC+LPE)/PL_Index" = "(LPC + LPE) / Phospholipids",
    "Ceramide_Fraction" = "Ceramide / Total Lipids", "Cer/SM_Index" = "Ceramide / SM",
    "DG/PL_Index" = "DAG / Phospholipids", "PI_Fraction" = "PI / Total Lipids",
    "PA_Fraction" = "PA / Total Lipids", "PG_Fraction" = "PG / Total Lipids",
    "PS_Fraction" = "PS / Total Lipids", "LPC/PC" = "LPC / PC",
    "LPE/PE" = "LPE / PE", "LPI/PI" = "LPI / PI",
    "LPS/PS" = "LPS / PS", "LPA/PA" = "LPA / PA",
    "LPG/PG" = "LPG / PG", "DG/TG_Index" = "DAG / TAG",
    "Energy_Load_Index" = "(TAG+DAG+CE) / (Total - (TAG+DAG+CE))",
    "Storage_Index" = "TAG / (Total - TAG)", "TG/CE_Index" = "TAG / CE",
    "TG/PL_Index" = "TAG / Phospholipids", "TG_Fraction" = "TAG / Total Lipids",
    "DG_Fraction" = "DAG / Total Lipids", "TG_DG_Fraction" = "(TAG + DAG) / Total Lipids",
    "ACar_Fraction" = "Acylcarnitines / Total Lipids"
)

functional_name_dict_global <- list(
    "Membrane_Fluidity_Index" = "Membrane Fluidity", "PE/PC_Index" = "ER Planarity",
    "Structural/Energetic_Ratio" = "Organelle Expansion", "Cardiolipin_Fraction" = "Mitochondrial Density",
    "CE_Fraction" = "Sterol Sequestration", "PC_Fraction" = "Bilayer Planarity", "PE_Fraction" = "Membrane Fusogenicity",
    "SM_Fraction" = "Raft Condensation", "Plasmalogen_Fraction" = "Antioxidant Shielding",
    "Ether_PE_Fraction" = "Ferroptotic Resistance", "SFA_Fraction" = "Acyl-Chain Condensation",
    "MUFA_Fraction" = "Acyl-Chain Fluidization", "PUFA_Fraction" = "Eicosanoid Precursor Pool",
    "AA_Fraction" = "Arachidonic Acid (Pro-inflammatory) Pool", "EPA_Fraction" = "Eicosapentaenoic Acid (SPM) Pool",
    "DHA_Fraction" = "Docosahexaenoic Acid (SPM) Pool",
    "PUFA/SFA_Ratio" = "Structural Fluidity", "SCFA_Fraction" = "HDAC Inhibition",
    "MCFA_Fraction" = "Oxidative Clearance", "LCFA_Fraction" = "Bilayer Thickness",
    "VLCFA_Fraction" = "Transmembrane Anchoring", "(LPC+LPE)/PL_Index" = "Lyso-Storm",
    "Ceramide_Fraction" = "Apoptotic Signaling", "Cer/SM_Index" = "Raft Collapse",
    "DG/PL_Index" = "PKC Anchoring", "PI_Fraction" = "Kinase Docking",
    "PA_Fraction" = "Secretory Fusion", "PG_Fraction" = "Mitochondrial Priming",
    "PS_Fraction" = "Apoptotic Masking", "LPC/PC" = "PC Hydrolysis",
    "LPE/PE" = "PE Hydrolysis", "LPI/PI" = "PI Hydrolysis",
    "LPS/PS" = "PS Hydrolysis", "LPA/PA" = "PA Hydrolysis",
    "LPG/PG" = "PG Hydrolysis", "DG/TG_Index" = "Lipolytic Mobilization",
    "Energy_Load_Index" = "Metabolic Burden", "Storage_Index" = "Neutral Core Accumulation",
    "TG/CE_Index" = "Droplet Core Fluidity", "TG/PL_Index" = "Droplet Expansion",
    "TG_Fraction" = "Triglyceride Pool", "DG_Fraction" = "Diacylglycerol Toxicity",
    "TG_DG_Fraction" = "Glycerolipid Accumulation", "ACar_Fraction" = "Beta-Oxidation Bottleneck"
)

index_full_name_dict <- list(
    "Membrane_Fluidity_Index" = "Membrane Fluidity Index",
    "PE/PC_Index" = "Phosphatidylethanolamine / Phosphatidylcholine Index",
    "Structural/Energetic_Ratio" = "Structural / Energetic Ratio",
    "Cardiolipin_Fraction" = "Cardiolipin Fraction",
    "CE_Fraction" = "Cholesteryl Ester Fraction",
    "PC_Fraction" = "Phosphatidylcholine Fraction",
    "PE_Fraction" = "Phosphatidylethanolamine Fraction",
    "SM_Fraction" = "Sphingomyelin Fraction",
    "Plasmalogen_Fraction" = "Plasmalogen Fraction",
    "Ether_PE_Fraction" = "Ether PE Fraction",
    "SFA_Fraction" = "SFA Fraction",
    "MUFA_Fraction" = "MUFA Fraction",
    "PUFA_Fraction" = "PUFA Fraction",
    "AA_Fraction" = "Arachidonic Acid Fraction",
    "EPA_Fraction" = "Eicosapentaenoic Acid Fraction",
    "DHA_Fraction" = "Docosahexaenoic Acid Fraction",
    "PUFA/SFA_Ratio" = "PUFA / SFA Ratio",
    "SCFA_Fraction" = "SCFA Fraction",
    "MCFA_Fraction" = "MCFA Fraction",
    "LCFA_Fraction" = "LCFA Fraction",
    "VLCFA_Fraction" = "VLCFA Fraction",
    "(LPC+LPE)/PL_Index" = "(Lysophosphatidylcholine + Lysophosphatidylethanolamine) / Phospholipid Index",
    "Ceramide_Fraction" = "Ceramide Fraction",
    "Cer/SM_Index" = "Ceramide / Sphingomyelin Index",
    "DG/PL_Index" = "Diacylglycerol / Phospholipid Index",
    "PI_Fraction" = "Phosphatidylinositol Fraction",
    "PA_Fraction" = "Phosphatidic Acid Fraction",
    "PG_Fraction" = "Phosphatidylglycerol Fraction",
    "PS_Fraction" = "Phosphatidylserine Fraction",
    "LPC/PC" = "Lysophosphatidylcholine / Phosphatidylcholine",
    "LPE/PE" = "Lysophosphatidylethanolamine / Phosphatidylethanolamine",
    "LPI/PI" = "Lysophosphatidylinositol / Phosphatidylinositol",
    "LPS/PS" = "Lysophosphatidylserine / Phosphatidylserine",
    "LPA/PA" = "Lysophosphatidic Acid / Phosphatidic Acid",
    "LPG/PG" = "Lysophosphatidylglycerol / Phosphatidylglycerol",
    "DG/TG_Index" = "Diacylglycerol / Triacylglycerol Index",
    "Energy_Load_Index" = "Energy Load Index",
    "Storage_Index" = "Storage Index",
    "TG/CE_Index" = "Triacylglycerol / Cholesteryl Ester Index",
    "TG/PL_Index" = "Triacylglycerol / Phospholipid Index",
    "TG_Fraction" = "Triacylglycerol Fraction",
    "DG_Fraction" = "Diacylglycerol Fraction",
    "TG_DG_Fraction" = "(Triacylglycerol + Diacylglycerol) Fraction",
    "ACar_Fraction" = "Acylcarnitine Fraction"
)

format_index_label <- function(index, mode, class_format = "full") {
    if (length(index) > 1) return(unname(sapply(index, format_index_label, mode=mode, class_format=class_format)))
    
    eq <- index
    if (class_format == "full") {
        eq <- index_full_name_dict[[index]] %||% index
    }
    func <- functional_name_dict_global[[index]]
    if (is.null(func)) func <- index
    
    if (mode == "Functional Name") {
        return(func)
    } else if (mode == "Both") {
        return(paste0(func, "\n(", eq, ")"))
    } else {
        return(eq)
    }
}

fla_ui <- function(id) {
  ns <- NS(id)
  tagList(
      
      layout_sidebar(
        sidebar = sidebar(
          width = 300,
          h5("Functional Lipid Analysis", class="mt-2 text-primary"),
          p(class="text-muted small", "Computes 41 biochemically defined indices spanning Structural, Signaling, and Energy domains."),
          
          accordion(
            open = "0. Nomenclature", multiple = TRUE,
            accordion_panel("0. Nomenclature", icon = icon("font"),
              radioButtons(ns("classLabelFormat"), "Class/Origin Name Format:",
                           choices = c("Complete Names" = "full", "Abbreviated Names" = "short"),
                           selected = "short")
            )
          ),
          hr(),
          
          radioButtons(ns("localStatMethod"), "Statistical Mode Choice:",
                       choices = c("Automatic mode" = "auto", 
                                   "Parametric (t-test)" = "parametric", 
                                   "Non-Parametric (Wilcoxon)" = "non_parametric"),
                       selected = "auto"),
          hr(),
          
          # Grouping & Baseline
          selectizeInput(ns("groupingMetadata"), 
                         tags$span("Primary Grouping (Order matters):", 
                                   bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                                  "Order defines the grouping hierarchy: the first variable splits the box/violin charts (x-axis), while subsequent variables define sub-groupings/facets. Drag and drop to rearrange.")), 
                          choices = c("Group1", "Group2"), 
                          selected = NULL, 
                          multiple = TRUE, 
                          options = list(plugins = list('drag_drop'))),
                         
          uiOutput(ns("baselineSelectorUI")),
          
          # Compare vs Baseline moved here for better UX, shown conditionally
          conditionalPanel(
             condition = paste0("input['", ns("fla_subtabs"), "'] == 'Index Divergence (Volcano & Biomarkers)'"),
             uiOutput(ns("volcano_comparison_ui"))
          ),
          
          hr(),
          
          # Aesthetics
          radioButtons(ns("scaleMode"), "Measurement Scale:", 
                       choices = c("Log2 Fold Change (Log2FC)" = "log2fc", 
                                   "Fold Change (FC)" = "fc", 
                                   "Raw Ratio Value" = "raw"), 
                       selected = "log2fc"),
          
          hr(),
          sliderInput(ns("plotZoom"), "Viewport Zoom %:", min=10, max=200, value=50, step=1),
          
          hr(),
          radioButtons(ns("labelMode"), "Plot Labeling:", 
                       choices = c("Equation", "Functional Name", "Both"),
                       selected = "Equation"),
          checkboxInput(ns("showSignificantOnly"), "Show ONLY significant indices", value = FALSE),
          radioButtons(ns("sigDisplayType"), "Significance Label Format:",
                       choices = c("Star" = "star", "P-value" = "pvalue"),
                       selected = "star"),
          hr(),
          # Index Selector
          radioButtons(ns("categoryMode"), "Index Category Grouping:", 
                       choices = c("General (3 Categories)" = "general", "Detailed (10 Thematic Categories)" = "detailed"), 
                       selected = "general"),
          uiOutput(ns("indexPickerUI")),
          
          hr(),
          accordion(
            open = FALSE,
            accordion_panel(
              title = "Metrics Dictionary",
              icon = icon("book"),
              
              checkboxInput(ns("display_ontology"), "Display Associated Ontology", value = FALSE),
              
              uiOutput(ns("metrics_dictionary_ui"))
            )
          ),
           hr(),
           actionButton(ns("show_stats_detail"), tags$span("Show Statistic Detail", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #1D4ED8; cursor: pointer;"), "Calculates the statistical details underlying the results and displays them in the Statistics Console.")), 
                        icon = icon("arrow-right-long"), class = "btn-info btn-show-stats w-100 mt-3"),
           tags$button(type = "button", class = "btn btn-outline-primary btn-sm w-100 mt-2",
                       onclick = "window.pointToAdvancedAesthetics && window.pointToAdvancedAesthetics(event);",
                       icon("layer-group"), " Advanced Aesthetics & Ordering")
        ),
        
        # Main Area
        div(style = "display: flex; flex-direction: column;",
          render_tab_intro_card(
            title = "Functional Ratios",
            subtitle = "This module computes and analyzes 41 biochemically defined lipid indices representing membrane structure, signaling, and storage:",
            bullets = list(
              tags$li(tags$strong("Violin Plots:"), " Inspect the distribution probability density of calculated functional ratios across sample groups."),
              tags$li(tags$strong("Index Divergence:"), " Identify significant shifts in indices using volcano plots and extract key functional biomarkers."),
              tags$li(tags$strong("Functional Networks:"), " Map co-regulation networks among indices using absolute Pearson correlation thresholds.")
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
              title = "Bottom Menu: Scroll to and configure Factor Level Ordering, Custom Plot Colors, and Topology below plot",
              icon("layer-group"), tags$strong("Bottom Menu: Advanced Aesthetics")
            )
          ),
          navset_card_tab(
            id = ns("fla_subtabs"),
          nav_panel("Violin Plots (All Selected)",
            jqui_resizable(div(style = "min-height: 60vh; padding-bottom: 12px; margin-bottom: 15px; position: relative; overflow: hidden;",
              card(
                style = "height: 100%; min-height: 60vh;",
                card_header(
                  class = "d-flex justify-content-between align-items-center",
                  "Functional Ratios Distribution",
                  tags$div(
                    downloadButton(ns("downloadLedger"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                    downloadButton(ns("downloadPlot"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                  )
                ),
                card_body(
                   uiOutput(ns("baseline_status_banner")),
                   tags$div(
                      style = "width: 100%; height: 100%; overflow: auto; border: 1px solid #e9ecef; background: #fff; padding: 10px;",
                      uiOutput(ns("scrollable_plot_ui"))
                   ),
                   uiOutput(ns("fla_violin_stat_note"))
                )
              )
            ), options = list(handles = "s, se"))
          ),
          
          nav_panel("Index Divergence (Volcano & Biomarkers)",
            navset_card_tab(
               id = ns("volcano_subtabs"),
               nav_panel("Functional Volcano",
                  card(
                    card_header(
                       class = "d-flex justify-content-between align-items-center",
                       "Functional Volcano",
                       tags$div(
                          downloadButton(ns("dl_volcano_csv"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv", style="margin-right: 5px;"),
                          downloadButton(ns("dl_volcano_pdf"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                       )
                    ),
                    card_body(
                      uiOutput(ns("volcanoPlotUI")),
                      uiOutput(ns("fla_volcano_stat_note"))
                    )
                  )
                ),
               nav_panel("Significant Functional Biomarkers",
                  card(
                    card_header("Significant Functional Biomarkers"),
                    card_body(
                      DTOutput(ns("tableBiomarkers"))
                    )
                  )
                )
             )
           ),
           
          nav_panel("Correlation Network",
            navset_card_tab(
               id = ns("correlation_subtabs"),
               nav_panel("Functional Correlation Circos Plot",
                  card(
                     style = "height: 100%; min-height: 60vh;",
                     card_header(
                         class = "d-flex justify-content-between align-items-center",
                         "Circos Map",
                         tags$div(
                            downloadButton(ns("downloadCircosPDF"), "PDF", class="btn-sm btn-outline-secondary py-0 btn-download-pdf")
                         )
                      ),
                     card_body(
                        p(class="text-muted small mt-2", "This plot computes pairwise Pearson correlations between the selected indices across all samples and visualizes the strongest absolute links."),
                        uiOutput(ns("circos_dynamic_title")),
                        tags$div(
                           style = "width: 100%; height: 100%; overflow: auto; border: 1px solid #e9ecef; background: #fff; padding: 10px;",
                           uiOutput(ns("circos_zoom_ui"))
                        )
                     )
                  )
               ),
               nav_panel("Significant Correlation Ledger",
                  card(
                     card_header(
                         class = "d-flex justify-content-between align-items-center",
                         "Correlation Statistics",
                         tags$div(
                            downloadButton(ns("downloadCorrCSV"), "CSV", class="btn-sm btn-outline-secondary py-0 btn-download-csv")
                         )
                      ),
                     card_body(
                        p(class="text-muted small mt-2", "Detailed Pearson statistics, Fisher Z-scores, and unadjusted P-values for the correlation network."),
                        DT::dataTableOutput(ns("corrTable"))
                     )
                  )
               )
            )
          )
        ),
        
        # ADVANCED AESTHETICS RIBBON
        accordion(
           id = ns("fla_advanced_aesthetics_accordion"),
           open = FALSE,
           class = "mt-3 shadow-sm border border-primary-subtle",
           accordion_panel(
              title = "Advanced Aesthetics & Ordering",
              icon = icon("sliders"),
              
              conditionalPanel(
                 condition = paste0("input['", ns("fla_subtabs"), "'] == 'Violin Plots (All Selected)' || input['", ns("fla_subtabs"), "'] == 'Multivariate Fingerprinting'"),
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
                          p(class="text-muted small", "Target a specific dimension to define the Violin fill colors mapping override."),
                          selectInput(ns("color_target_var"), "Target Variable (Fill By):", choices=NULL, width="100%"),
                          uiOutput(ns("dynamic_colors_ui"))
                       )
                    )
                 )
              ),
              
              conditionalPanel(
                 condition = paste0("input['", ns("fla_subtabs"), "'] == 'Correlation Network'"),
                 layout_columns(
                    col_widths = c(12),
                    card(
                       card_header(icon("project-diagram"), " Network Topology Parameters"),
                       card_body(
                          sliderInput(ns("corrThresh"), "Minimum Absolute Correlation (|r|):", min=0.5, max=0.99, value=0.85, step=0.01),
                          sliderInput(ns("maxLinks"), "Maximum Links to Display:", min=5, max=50, value=20, step=1),
                          checkboxInput(ns("plot_ontology_circos"), tags$span("Overlay Ontology Labels", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Overlays descriptive biological pathways or lipid ontology classification labels directly onto the plots.")), value = FALSE)
                       )
                    )
                 )
              ),
              
              conditionalPanel(
                 condition = paste0("input['", ns("fla_subtabs"), "'] == 'Index Divergence (Volcano & Biomarkers)'"),
                 layout_columns(
                    col_widths = c(12),
                    card(
                       card_header(icon("chart-area"), " Volcano Plot Settings"),
                       card_body(
                          checkboxInput(ns("plot_ontology_volcano"), tags$span("Overlay Ontology Labels", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Overlays descriptive biological pathways or lipid ontology classification labels directly onto the plots.")), value = FALSE),
                          sliderInput(ns("volcano_height"), "Volcano Plot Height (px)", min=400, max=2000, value=600, step=50),
                       sliderInput(ns("volcano_width"), "Volcano Plot Width (px)", min=400, max=2400, value=1200, step=50)
                       )
                    )
                 )
              )
           )
        )
      )
    )
  )
}

fla_server <- function(id, shared_data, global_color_map = NULL) {
  ontology_dict <- list(
    "Membrane_Fluidity_Index" = c("Membrane Rigidification", "Membrane Hyper-Fluidity"),
    "PE/PC_Index" = c("Endoplasmic Reticulum Planarity", "Non-Bilayer ER Stress"),
    "Structural/Energetic_Ratio" = c("Lipid Droplet Accumulation", "Organelle Network Expansion"),
    "PC_Fraction" = c("Secretory Apparatus Contraction", "Planar Bilayer Expansion"),
    "PE_Fraction" = c("Vesicular Fusion Arrest", "Vesicular Fusion Facilitation"),
    "SM_Fraction" = c("Raft Dissociation", "Lipid Raft Condensation"),
    "CE_Fraction" = c("Free Cholesterol Toxicity", "Sterol Ester Sequestration"),
    "Plasmalogen_Fraction" = c("Peroxidation Vulnerability", "Antioxidant Membrane Shielding"),
    "Ether_PE_Fraction" = c("Ferroptotic Resistance", "Ferroptotic Oxidative Vulnerability"),
    "Cardiolipin_Fraction" = c("Mitochondrial Destabilization", "Mitochondrial Cristae Assembly"),
    "SFA_Fraction" = c("Acyl-Chain Fluidization", "Acyl-Chain Condensation"),
    "MUFA_Fraction" = c("Saturated Acyl-Chain Rigidity", "Monounsaturated Fluidity Rescue"),
    "PUFA_Fraction" = c("Eicosanoid Precursor Depletion", "Eicosanoid Precursor Accumulation"),
    "AA_Fraction" = c("AA Precursor Depletion", "AA Precursor Accumulation"),
    "EPA_Fraction" = c("EPA Precursor Depletion", "EPA Precursor Accumulation"),
    "DHA_Fraction" = c("DHA Precursor Depletion", "DHA Precursor Accumulation"),
    "PUFA/SFA_Ratio" = c("Structural Condensation", "Maximize Lateral Diffusion"),
    "VLCFA_Fraction" = c("Independent Leaflet Mobility", "Transmembrane Leaflet Anchoring"),
    "LCFA_Fraction" = c("Membrane Thickness Alteration", "Physiological Bilayer Thickness"),
    "MCFA_Fraction" = c("Oxidative Substrate Clearance", "Mitochondrial Catabolic Arrest"),
    "SCFA_Fraction" = c("HDAC Inhibition Loss", "Chromatin Hyperacetylation"),
    "(LPC+LPE)/PL_Index" = c("Basal Phospholipid Pool", "Global Phospholipid Hydrolysis"),
    "LPC/PC" = c("Basal Phosphatidylcholine Pool", "Eicosanoid Substrate Mobilization"),
    "LPE/PE" = c("Basal Phosphatidylethanolamine Pool", "Mitochondrial Membrane Deformation"),
    "LPI/PI" = c("Kinase Docking Stability", "Inflammatory Eicosanoid Biosynthesis"),
    "LPS/PS" = c("Apoptotic Recognition Signal", "Apoptotic Masking"),
    "LPA/PA" = c("Focal Adhesion Stability", "Actin Cytoskeleton Polymerization"),
    "LPG/PG" = c("Lysosomal Inactivity", "Lysosomal Vesicle Expansion"),
    "Ceramide_Fraction" = c("Basal Sphingolipid Pool", "Apoptotic Receptor Clustering"),
    "Cer/SM_Index" = c("Intact Lipid Rafts", "Rapid Raft Collapse"),
    "PS_Fraction" = c("Efferocytotic Evasion", "Electrostatic Kinase Anchoring"),
    "PI_Fraction" = c("Vesicular Trafficking Arrest", "Expanded Receptor Docking Sites"),
    "PA_Fraction" = c("Vesicular Fusion Arrest", "Secretory Granule Release"),
    "PG_Fraction" = c("Cardiolipin Precursor Depletion", "Mitochondrial Biogenesis Priming"),
    "DG/PL_Index" = c("Receptor Signaling Arrest", "Active PKC Membrane Anchoring"),
    "Storage_Index" = c("Organelle Membrane Expansion", "Neutral Lipid Core Accumulation"),
    "Energy_Load_Index" = c("Cytosolic Volume Homeostasis", "Inert Lipid Droplet Overload"),
    "TG_Fraction" = c("Energy Substrate Depletion", "Triglyceride Droplet Maturation"),
    "TG_DG_Fraction" = c("Glycerolipid Synthesis Arrest", "Glycerolipid Droplet Accumulation"),
    "TG/PL_Index" = c("Surface-to-Volume Equilibrium", "Lipid Droplet Monolayer Rupture"),
    "TG/CE_Index" = c("Rigid Inner Droplet", "Fluid Inner Droplet"),
    "DG/TG_Index" = c("Lipolytic Arrest", "Active Triglyceride Cleavage"),
    "DG_Fraction" = c("Diacylglycerol Clearance", "Diacylglycerol Membrane Toxicity"),
    "ACar_Fraction" = c("Beta-Oxidation Equilibrium", "Beta-Oxidation Arrest")
  )

  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    
    # Update Baseline choices based on grouping metadata
    output$baselineSelectorUI <- renderUI({
      selectizeInput(session$ns("selectedBaseline"), 
                     tags$span("Reference Baseline:", 
                                bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), 
                                               "Select one or more group levels to serve as the baseline. Index results will represent the Log2 Fold Change of each group relative to this baseline's average.")), 
                     choices = NULL, 
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
    
    # --- Advanced Aesthetics Reactive Logic ---
    level_prefs <- reactiveValues()
    prev_grouping <- reactiveVal(NULL)
    
    observe({
      if (isolate(shared_data$is_restoring())) return()
      val <- input$groupingMetadata
      req(length(val) > 0)
      meta <- shared_data$all_metadata()
      
      choices <- val
      if(length(val) > 1) {
         choices <- c(choices, "Combined_Grouping")
      }
      labels <- sapply(choices, function(c) {
        if (c == "Combined_Grouping") get_metadata_group_label("Group1_Group2", meta)
        else get_metadata_group_label(c, meta)
      })
      named_choices <- setNames(choices, labels)
      
      # Select the combined grouping by default if multiple are selected, ensuring exact sync!
      sel <- if(length(val) > 1) "Combined_Grouping" else val[1]
      
      curr_order <- isolate(input$order_target_var)
      curr_color <- isolate(input$color_target_var)
      last_val <- isolate(prev_grouping())
      
      grouping_changed <- is.null(last_val) || !identical(val, last_val)
      if (grouping_changed) {
        sel_order <- sel
        sel_color <- sel
        prev_grouping(val)
      } else {
        sel_order <- if (!is.null(curr_order) && curr_order %in% choices) curr_order else sel
        sel_color <- if (!is.null(curr_color) && curr_color %in% choices) curr_color else sel
      }
      
      updateSelectInput(session, "order_target_var", choices = named_choices, selected = sel_order)
      updateSelectInput(session, "color_target_var", choices = named_choices, selected = sel_color)
    })
    
    output$level_order_ui <- renderUI({
       target <- input$order_target_var
       req(target)
       meta <- shared_data$all_metadata()
       
       if (target == "Combined_Grouping") {
           grp_cols <- input$groupingMetadata
           req(length(grp_cols) > 1)
           meta[[target]] <- apply(meta[, grp_cols, drop=FALSE], 1, paste, collapse = "_")
       } else if (!(target %in% colnames(meta))) {
           return(NULL)
       }
       
       default_levels <- sort(unique(meta[[target]]))
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
       
       if (target == "Combined_Grouping") {
           grp_cols <- input$groupingMetadata
           req(length(grp_cols) > 1)
           meta[[target]] <- apply(meta[, grp_cols, drop=FALSE], 1, paste, collapse = "_")
       } else if (!(target %in% colnames(meta))) {
           return(NULL)
       }
       
       levels <- sort(unique(meta[[target]]))
       
       base_map <- shared_data$color_maps()[[target]]
       if (is.null(base_map)) {
          pal <- RColorBrewer::brewer.pal(min(9, max(3, length(levels))), "Set1")
          if(length(levels) > length(pal)) pal <- colorRampPalette(pal)(length(levels))
          base_map <- stats::setNames(pal[1:length(levels)], levels)
       }
       
       ns <- session$ns
       
       # ISOLATE prevents the UI from blowing itself up when the user interacts with the color pickers
       isolate({
           lapply(levels, function(lvl) {
              safe_col <- gsub("[^A-Za-z0-9]", "", target)
              safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
              id <- paste0("cp_", safe_col, "_", safe_lvl)
              
              cur_val <- input[[id]]
              saved_val <- shared_data$get_restored_input(ns(id), base_map[lvl])
              def_val <- if(!is.null(cur_val)) cur_val else saved_val
              
              div(style="display:inline-block; margin-right:5px; margin-bottom: 5px;",
                  colourpicker::colourInput(ns(id), lvl, value = def_val, showColour="both", width="100px")
              )
           }) %>% div(class="d-flex flex-wrap", .)
       })
    })
    
    outputOptions(output, "level_order_ui", suspendWhenHidden = FALSE)
    outputOptions(output, "dynamic_colors_ui", suspendWhenHidden = FALSE)
    
    observe({
        if (isolate(shared_data$is_restoring())) return()
        meta <- shared_data$all_metadata()
        val <- input$groupingMetadata
        req(length(val) > 0)
        
        if (length(val) == 1) {
           choices <- unique(meta[[val]])
        } else {
           choices <- apply(meta[, val, drop=FALSE], 1, paste, collapse="_")
           choices <- unique(choices)
        }
        
        choices <- sort(choices[!is.na(choices) & choices != ""])
        
        isolate({
            curr_sel <- input$selectedBaseline
            valid_sel <- intersect(curr_sel, choices)
            if(length(valid_sel) > 0) {
                sel <- valid_sel
            } else {
                sel <- choices[1]
            }
            updateSelectizeInput(session, "selectedBaseline", choices = choices, selected = sel)
        })
    })
    
    # 1. Compute 41 Functional Indices per Sample
    fla_indices <- reactive({
      df <- shared_data$data_processed()
      anno <- shared_data$annotationData()
      req(df, anno)
      
      # Pivot to long format
      df_long <- df %>% 
        tidyr::pivot_longer(cols = -Lipid_Name, names_to = "Sample", values_to = "Value") %>%
        dplyr::left_join(anno, by = "Lipid_Name")
      
      # Aggregate by subclass per sample
      class_sums <- df_long %>%
        dplyr::group_by(Sample, subclass) %>%
        dplyr::summarize(TotalValue = sum(Value, na.rm = TRUE), .groups = "drop") %>%
        tidyr::pivot_wider(names_from = subclass, values_from = TotalValue, values_fill = 0)
      
      # Total lipid per sample
      total_lipid <- df_long %>%
        dplyr::group_by(Sample) %>%
        dplyr::summarize(Total = sum(Value, na.rm = TRUE), .groups = "drop")
      
      # Saturation and Length sums per sample
      sat_sums <- df_long %>%
        dplyr::group_by(Sample) %>%
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
      
      class_sums <- class_sums %>% dplyr::left_join(total_lipid, by = "Sample") %>% dplyr::left_join(sat_sums, by = "Sample")
      
      get_cls <- function(data, cls) { if(cls %in% names(data)) data[[cls]] else rep(0, nrow(data)) }
      
      indices <- list()
      
      # --- STRUCTURAL (18 Indices) ---
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
      idx_df <- data.frame(Sample = class_sums$Sample)
      for (k in names(indices)) idx_df[[k]] <- indices[[k]]
      
      idx_long <- idx_df %>% tidyr::pivot_longer(cols = -Sample, names_to = "Index", values_to = "Value")
      
      idx_long <- idx_long %>% dplyr::mutate(
        Category_General = dplyr::case_when(
          Index %in% c("PE/PC_Index", "Membrane_Fluidity_Index", "Structural/Energetic_Ratio", "Cardiolipin_Fraction", "CE_Fraction", "PC_Fraction", "PE_Fraction", "SM_Fraction", "Plasmalogen_Fraction", "Ether_PE_Fraction", "SFA_Fraction", "MUFA_Fraction", "PUFA_Fraction", "PUFA/SFA_Ratio", "SCFA_Fraction", "MCFA_Fraction", "LCFA_Fraction", "VLCFA_Fraction") ~ "Structural",
          Index %in% c("(LPC+LPE)/PL_Index", "Ceramide_Fraction", "Cer/SM_Index", "DG/PL_Index", "PI_Fraction", "PA_Fraction", "PG_Fraction", "PS_Fraction", "LPC/PC", "LPE/PE", "LPI/PI", "LPS/PS", "LPA/PA", "LPG/PG", "AA_Fraction", "EPA_Fraction", "DHA_Fraction") ~ "Signaling",
          Index %in% c("DG/TG_Index", "Energy_Load_Index", "Storage_Index", "TG/CE_Index", "TG/PL_Index", "TG_Fraction", "DG_Fraction", "TG_DG_Fraction", "ACar_Fraction") ~ "Energy",
          TRUE ~ "Other"
        ),
        Category_Detailed = dplyr::case_when(
          Index %in% c("Membrane_Fluidity_Index", "PE/PC_Index", "Structural/Energetic_Ratio", "PC_Fraction", "PE_Fraction", "SFA_Fraction", "MUFA_Fraction", "PUFA_Fraction", "PUFA/SFA_Ratio", "LCFA_Fraction", "VLCFA_Fraction") ~ "Membrane Architecture",
          Index %in% c("SM_Fraction", "CE_Fraction") ~ "Lipid Raft Dynamics",
          Index %in% c("Plasmalogen_Fraction", "Ether_PE_Fraction", "LPS/PS", "PS_Fraction", "Ceramide_Fraction", "Cer/SM_Index") ~ "Apoptosis & Ferroptosis",
          Index %in% c("Cardiolipin_Fraction", "MCFA_Fraction", "LPE/PE", "PG_Fraction", "ACar_Fraction") ~ "Mitochondrial Homeostasis",
          Index %in% c("SCFA_Fraction") ~ "Epigenetic Remodeling",
          Index %in% c("PI_Fraction", "PA_Fraction") ~ "Vesicular Trafficking",
          Index %in% c("DG/PL_Index", "LPA/PA", "LPI/PI") ~ "Secondary Signaling Messengers",
          Index %in% c("LPG/PG", "(LPC+LPE)/PL_Index", "LPC/PC", "AA_Fraction", "EPA_Fraction", "DHA_Fraction") ~ "Lysosomal Hydrolysis & Eicosanoids",
          Index %in% c("Storage_Index", "Energy_Load_Index", "TG_Fraction", "TG_DG_Fraction", "TG/PL_Index", "TG/CE_Index") ~ "Lipid Droplet Maturation",
          Index %in% c("DG/TG_Index", "DG_Fraction") ~ "Lipolytic Clearance",
          TRUE ~ "Other"
        )
      )
      
      list(wide = idx_df, long = idx_long)
    })
    
    # 2. Add Metadata and compute Log2FC / FC / Diff vs Baseline
    processed_db <- reactive({
      idx_data <- fla_indices()
      
      # Dynamically assign 'Category' for plotting downstream
      if(isTRUE(input$categoryMode == "detailed")) {
          idx_data$long$Category <- idx_data$long$Category_Detailed
      } else {
          idx_data$long$Category <- idx_data$long$Category_General
      }
      
      meta_df <- shared_data$all_metadata()
      grp_cols <- input$groupingMetadata
      baseline_grp <- input$selectedBaseline
      req(idx_data, meta_df, length(grp_cols) > 0)
      if (is.null(baseline_grp) || length(baseline_grp) == 0 || all(!nzchar(trimws(baseline_grp)))) return(NULL)
      
      local_method <- input$localStatMethod %||% "auto"
      resolved_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      
      meta_mapped <- meta_df %>% dplyr::select(FullName, dplyr::all_of(grp_cols))
      
      t_var <- input$order_target_var
      
      # Compute Combined_Grouping eagerly so it can be ordered
      meta_mapped$Combined_Grouping <- apply(meta_mapped[, grp_cols, drop=FALSE], 1, paste, collapse = "_")
      
      if(!is.null(t_var) && !is.null(level_prefs[[t_var]])) {
          if (t_var %in% colnames(meta_mapped)) {
              meta_mapped[[t_var]] <- factor(meta_mapped[[t_var]], levels = level_prefs[[t_var]])
          }
      }
      
      if(!is.null(t_var) && t_var == "Combined_Grouping" && !is.null(level_prefs[[t_var]])) {
          meta_mapped <- meta_mapped %>% dplyr::arrange(Combined_Grouping)
      } else {
          meta_mapped <- meta_mapped %>% dplyr::arrange(dplyr::across(dplyr::all_of(grp_cols)))
      }
      
      meta_mapped$GroupingVal <- meta_mapped$Combined_Grouping
      ordered_groups <- unique(meta_mapped$GroupingVal)
      
      df_long <- idx_data$long %>% dplyr::left_join(meta_mapped, by=c("Sample"="FullName"))
      
      # Baseline means
      baseline_means <- df_long %>%
        dplyr::filter(GroupingVal %in% baseline_grp) %>%
        dplyr::group_by(Index, Category) %>%
        dplyr::summarise(Baseline_Mean = mean(Value, na.rm=TRUE), .groups="drop")
      
      req(nrow(baseline_means) > 0)
      scale_mode <- input$scaleMode %||% "log2fc"
      
      plot_db <- df_long %>%
        dplyr::left_join(baseline_means, by=c("Index", "Category")) %>%
        dplyr::mutate(
          Log2FC = log2((Value + 1e-9) / (Baseline_Mean + 1e-9)),
          FC = (Value + 1e-9) / (Baseline_Mean + 1e-9),
          Raw = Value,
          Is_Baseline = (GroupingVal %in% baseline_grp)
        ) %>%
        dplyr::mutate(Plot_Value = if(scale_mode == "log2fc") Log2FC else if(scale_mode == "fc") FC else Raw)
      
      # Calculate Stats
      plot_db$GroupingVal <- factor(plot_db$GroupingVal, levels = ordered_groups)
      stats_df <- data.frame()
      for(idx in unique(plot_db$Index)) {
         sub_f <- plot_db %>% dplyr::filter(Index == idx)
         base_vals <- sub_f %>% dplyr::filter(GroupingVal %in% baseline_grp) %>% dplyr::pull(Plot_Value)
         
         for(g in setdiff(ordered_groups, baseline_grp)) {
            comp_vals <- sub_f %>% dplyr::filter(GroupingVal == g) %>% dplyr::pull(Plot_Value)
            p_val <- NA
            stars <- "ns"
            if(length(na.omit(base_vals))>=2 && length(na.omit(comp_vals))>=2) {
               tt <- tryCatch(compute_local_p_val(base_vals, comp_vals, method = resolved_method, paired = FALSE), error=function(e) NA)
               if(!is.na(tt)) {
                  p_val <- tt
                  if(p_val < 0.001) stars <- "***"
                  else if(p_val < 0.01) stars <- "**"
                  else if(p_val < 0.05) stars <- "*"
               }
            }
            stats_df <- rbind(stats_df, data.frame(Index=idx, GroupingVal=g, P_Value=p_val, Significance=stars))
         }
      }
      
      if(nrow(stats_df) > 0) {
         plot_db <- plot_db %>% dplyr::left_join(stats_df, by=c("Index", "GroupingVal"))
         plot_db$Significance[is.na(plot_db$Significance) & plot_db$Is_Baseline] <- "Reference"
      } else {
         plot_db$P_Value <- NA
         plot_db$Significance <- "ns"
      }
      
      plot_db$GroupingVal <- factor(plot_db$GroupingVal, levels = ordered_groups)
      plot_db
    })
    
    # 3. UI logic for Checkbox grouping
    output$indexPickerUI <- renderUI({
      req(processed_db())
      df <- processed_db()
      
      if(isTRUE(input$showSignificantOnly)) {
         sig_idx <- df %>% dplyr::filter(Significance != "ns", !is.na(Significance), Significance != "Reference") %>% dplyr::pull(Index) %>% unique()
         df <- df %>% dplyr::filter(Index %in% sig_idx)
      }
      
      if(isTRUE(input$categoryMode == "detailed")) {
          cat_order <- c("Membrane Architecture", "Lipid Raft Dynamics", "Apoptosis & Ferroptosis", "Mitochondrial Homeostasis", "Epigenetic Remodeling", "Vesicular Trafficking", "Secondary Signaling Messengers", "Lysosomal Hydrolysis & Eicosanoids", "Lipid Droplet Maturation", "Lipolytic Clearance", "Other")
      } else {
          cat_order <- c("Structural", "Signaling", "Energy", "Other")
      }
      
      present_cats <- intersect(cat_order, unique(df$Category))
      categories <- lapply(present_cats, function(x) unique(df$Index[df$Category == x]))
      names(categories) <- present_cats
      
      curr_sel <- isolate(unifiedSelectedIndices())
      if (is.null(curr_sel)) curr_sel <- c("PE/PC_Index", "Energy_Load_Index", "(LPC+LPE)/PL_Index") # Defaults
      
      master_all_js <- paste0("$('#", ns("master_idx_container"), " input[type=checkbox]').prop('checked', true).trigger('change'); return false;")
      master_none_js <- paste0("$('#", ns("master_idx_container"), " input[type=checkbox]').prop('checked', false).trigger('change'); return false;")
      
      master_header <- tags$div(
          class = "d-flex justify-content-between align-items-center mb-2",
          tags$strong("Indices to Plot:"),
          tags$div(
             tags$a(href="#", onclick=master_all_js, "All"), " | ", tags$a(href="#", onclick=master_none_js, "None")
          )
      )
      
      ui_groups <- lapply(names(categories), function(cat_name) {
          cat_feats <- categories[[cat_name]]
          if(length(cat_feats) > 0) {
              group_all_js <- "$(this).closest('.category-group').find('input[type=checkbox]').prop('checked', true).trigger('change'); return false;"
              group_none_js <- "$(this).closest('.category-group').find('input[type=checkbox]').prop('checked', false).trigger('change'); return false;"
              
              col_hex <- switch(cat_name, 
                  "Structural"="#4E79A7", "Signaling"="#E15759", "Energy"="#59A14F",
                  "Membrane Architecture"="#4E79A7", "Lipid Raft Dynamics"="#76B7B2", "Apoptosis & Ferroptosis"="#E15759", 
                  "Mitochondrial Homeostasis"="#F28E2B", "Epigenetic Remodeling"="#B07AA1", "Vesicular Trafficking"="#9C755F", 
                  "Secondary Signaling Messengers"="#FF9D9A", "Lysosomal Hydrolysis & Eicosanoids"="#D37295", 
                  "Lipid Droplet Maturation"="#59A14F", "Lipolytic Clearance"="#8CD17D",
                  "#6c757d"
              )
              
              raw_id <- paste0("sel_", cat_name)
              saved_sel <- shared_data$get_restored_input(ns(raw_id), intersect(cat_feats, curr_sel))
              tags$div(
                  class = "category-group mb-2",
                  style = paste0("border-left: 3px solid ", col_hex, "; padding-left: 10px; margin-left: 5px;"),
                  tags$div(
                      class = "d-flex justify-content-between align-items-center",
                      tags$span(style=paste0("color:", col_hex, "; font-weight:bold;"), cat_name),
                      tags$div(tags$a(href="#", onclick=group_all_js, "All"), " | ", tags$a(href="#", onclick=group_none_js, "None"))
                  ),
                  checkboxGroupInput(ns(raw_id), label = NULL, 
                                     choiceNames = format_index_label(cat_feats, input$labelMode, input$classLabelFormat %||% "full"),
                                     choiceValues = cat_feats, 
                                     selected = saved_sel)
              )
          }
      })
      
      tags$div(id = ns("master_idx_container"), master_header, ui_groups)
    })
    
    unifiedSelectedIndices <- reactive({
       sel <- c(
         input$sel_Structural, input$sel_Signaling, input$sel_Energy,
         input[["sel_Membrane Architecture"]],
         input[["sel_Lipid Raft Dynamics"]],
         input[["sel_Apoptosis & Ferroptosis"]],
         input[["sel_Mitochondrial Homeostasis"]],
         input[["sel_Epigenetic Remodeling"]],
         input[["sel_Vesicular Trafficking"]],
         input[["sel_Secondary Signaling Messengers"]],
         input[["sel_Lysosomal Hydrolysis & Eicosanoids"]],
         input[["sel_Lipid Droplet Maturation"]],
         input[["sel_Lipolytic Clearance"]],
         input$sel_Other
       )
       
       if (is.null(sel) || length(sel) == 0) {
           sel <- c("PE/PC_Index", "Energy_Load_Index", "(LPC+LPE)/PL_Index")
       }
       
       if (isTRUE(input$showSignificantOnly)) {
           df <- processed_db()
           sig_idx <- df %>% dplyr::filter(Significance != "ns", !is.na(Significance), Significance != "Reference") %>% dplyr::pull(Index) %>% unique()
           sel <- intersect(sel, sig_idx)
           
           if (length(sel) == 0 && length(sig_idx) > 0) {
               sel <- sig_idx[1:min(3, length(sig_idx))]
           }
       }
       
       sel
    })
    
    # 4. Render Scrollable Violin Plots
    output$scrollable_plot_ui <- renderUI({
      if (is.null(shared_data$data_processed()) || is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        return(plotOutput(session$ns("logratioPlot"), width = "100%", height = "450px"))
      }
      req(processed_db())
      df <- processed_db()
      
      sel_indices <- unifiedSelectedIndices()
      if (length(sel_indices) == 0) return(plotOutput(session$ns("logratioPlot"), width = "100%", height = "450px"))
      
      df <- df %>% dplyr::filter(Index %in% sel_indices)
      feats <- unique(df$Index)
      n <- length(feats)
      if (n == 0) return(plotOutput(session$ns("logratioPlot"), width = "100%", height = "450px"))
      
      ncols <- min(3, n)
      nrows <- ceiling(n / 3)
      zoom <- input$plotZoom / 100
      
      total_w <- max(800, ncols * 400) * zoom
      total_h <- max(400, nrows * 350) * zoom
      
      plotOutput(session$ns("logratioPlot"), width = paste0(total_w, "px"), height = paste0(total_h, "px"))
    })
    
    current_violin_plot <- reactive({
      df <- processed_db()
      if (is.null(df)) return(NULL)
      sel_indices <- unifiedSelectedIndices()
      if (length(sel_indices) == 0) return(NULL)
      sub_df <- df %>% dplyr::filter(Index %in% sel_indices)
      if (nrow(sub_df) == 0) return(NULL)
      
      y_lab <- if(input$scaleMode == "log2fc") "Log2FC" else if(input$scaleMode == "fc") "Fold Change" else "Ratio"
      
      grp_cols <- input$groupingMetadata
      c_var <- input$color_target_var
      
      if (!is.null(c_var) && c_var == "Combined_Grouping" && length(grp_cols) > 1) {
          sub_df[[c_var]] <- sub_df$GroupingVal
      } else if (is.null(c_var) || !(c_var %in% names(sub_df))) {
          c_var <- grp_cols[1]
      }
      
      c_levels <- sort(unique(sub_df[[c_var]]))
      
      safe_colors <- sapply(c_levels, function(lvl) {
         safe_col <- gsub("[^A-Za-z0-9]", "", c_var)
         safe_lvl <- gsub("[^A-Za-z0-9]", "", lvl)
         val <- input[[paste0("cp_", safe_col, "_", safe_lvl)]]
         
         if(is.null(val)) {
            base_map <- (if (!is.null(global_color_map) && is.function(global_color_map)) tryCatch(global_color_map()[[c_var]], error = function(e) NULL) else NULL) %||% tryCatch(shared_data$color_maps()[[c_var]], error = function(e) NULL)
            if (is.null(base_map)) {
               pal <- RColorBrewer::brewer.pal(min(9, max(3, length(c_levels))), "Set1")
               if(length(c_levels) > length(pal)) pal <- colorRampPalette(pal)(length(c_levels))
               base_map <- stats::setNames(pal[1:length(c_levels)], c_levels)
            }
            return(base_map[lvl])
         } else {
            return(val)
         }
      })
      
      # Define universal palette for facets
      fla_palette <- c(
          "Structural"="#4E79A7", "Signaling"="#E15759", "Energy"="#59A14F",
          "Membrane Architecture"="#4E79A7", "Lipid Raft Dynamics"="#76B7B2", "Apoptosis & Ferroptosis"="#E15759", 
          "Mitochondrial Homeostasis"="#F28E2B", "Epigenetic Remodeling"="#B07AA1", "Vesicular Trafficking"="#9C755F", 
          "Secondary Signaling Messengers"="#FF9D9A", "Lysosomal Hydrolysis & Eicosanoids"="#D37295", 
          "Lipid Droplet Maturation"="#59A14F", "Lipolytic Clearance"="#8CD17D",
          "Other"="#6c757d"
      )
      
      idx_levels <- unique(as.character(sub_df$Index))
      idx_cats <- sapply(idx_levels, function(i) unique(sub_df$Category[sub_df$Index == i])[1])
      
      if(isTRUE(input$categoryMode == "detailed")) {
          cat_order <- c("Membrane Architecture", "Lipid Raft Dynamics", "Apoptosis & Ferroptosis", "Mitochondrial Homeostasis", "Epigenetic Remodeling", "Vesicular Trafficking", "Secondary Signaling Messengers", "Lysosomal Hydrolysis & Eicosanoids", "Lipid Droplet Maturation", "Lipolytic Clearance", "Other")
      } else {
          cat_order <- c("Structural", "Signaling", "Energy", "Other")
      }
      
      idx_cats_factor <- factor(idx_cats, levels = cat_order)
      idx_base_order <- match(idx_levels, names(functional_name_dict_global))
      
      # Sort levels by category and then by index master-list order
      idx_order <- order(idx_cats_factor, idx_base_order)
      idx_levels <- idx_levels[idx_order]
      idx_cats <- idx_cats[idx_order]
      
      strip_colors <- fla_palette_global[idx_cats]
      
      facet_levels <- format_index_label(idx_levels, input$labelMode, input$classLabelFormat %||% "full")
      sub_df$FacetLabel <- format_index_label(as.character(sub_df$Index), input$labelMode, input$classLabelFormat %||% "full")
      sub_df$FacetLabel <- factor(sub_df$FacetLabel, levels = facet_levels)
      
      p <- ggplot(sub_df, aes(x = GroupingVal, y = Plot_Value, fill = !!sym(c_var))) +
        geom_violin(trim = FALSE, alpha = 0.5) +
        geom_boxplot(width = 0.15, fill = "white", outlier.shape = NA) +
        geom_jitter(shape = 21, width = 0.1, size = 2) +
        scale_fill_manual(values = safe_colors) +
        ggh4x::facet_wrap2(~FacetLabel, scales="free_y", ncol = min(3, length(unique(sub_df$Index))),
                           strip = ggh4x::strip_themed(background_x = ggh4x::elem_list_rect(fill = strip_colors))) +
        ggpubr::theme_pubr(base_size = 14) +
        labs(x = NULL, y = y_lab) +
        theme(
          legend.position = "none",
          strip.text = element_text(size = 14, face = "bold", color="white"),
          axis.text.x = element_text(angle = 45, hjust = 1)
        )
      
      sig_dat <- sub_df %>% dplyr::distinct(Index, GroupingVal, Significance, P_Value) %>% dplyr::filter(Significance %in% c("*", "**", "***"))
      
      if(nrow(sig_dat) > 0) {
         base_lvl <- input$selectedBaseline[1]
         grp_levels <- levels(sub_df$GroupingVal)
         if (is.null(grp_levels)) grp_levels <- unique(as.character(sub_df$GroupingVal))
         base_x <- which(grp_levels == base_lvl)
         
         if(length(base_x) == 1) {
             segs <- list()
             texts <- list()
             
             for(idx_name in unique(sig_dat$Index)) {
                 idx_sub <- sub_df %>% dplyr::filter(Index == idx_name)
                 g_mins <- c()
                 g_maxs <- c()
                 x_heights <- numeric(length(grp_levels))
                 
                 for (j in seq_along(grp_levels)) {
                    g_val <- grp_levels[j]
                    vals <- na.omit(idx_sub$Plot_Value[idx_sub$GroupingVal == g_val & is.finite(idx_sub$Plot_Value)])
                    if (length(vals) >= 2) {
                       dens <- tryCatch(density(vals, adjust = 1)$x, error = function(e) vals)
                       g_mins <- c(g_mins, min(dens, na.rm = TRUE))
                       g_maxs <- c(g_maxs, max(dens, na.rm = TRUE))
                       x_heights[j] <- max(dens, na.rm = TRUE)
                    } else if (length(vals) == 1) {
                       g_mins <- c(g_mins, vals)
                       g_maxs <- c(g_maxs, vals)
                       x_heights[j] <- vals
                    } else {
                       x_heights[j] <- 0
                    }
                 }
                 
                 v_min <- if (length(g_mins) > 0) min(g_mins, na.rm = TRUE) else min(idx_sub$Plot_Value, na.rm = TRUE)
                 v_max <- if (length(g_maxs) > 0) max(g_maxs, na.rm = TRUE) else max(idx_sub$Plot_Value, na.rm = TRUE)
                 v_range <- v_max - v_min
                 if (is.na(v_range) || v_range == 0 || is.infinite(v_range)) v_range <- 1.0
                 
                 idx_sig_rows <- sig_dat %>% dplyr::filter(Index == idx_name)
                 for(i in seq_len(nrow(idx_sig_rows))) {
                     comp_lvl <- as.character(idx_sig_rows$GroupingVal[i])
                     comp_x <- which(grp_levels == comp_lvl)
                     if (length(comp_x) != 1 || base_x == comp_x) next
                     
                     sig_text <- if (isTRUE(input$sigDisplayType == "pvalue")) {
                         p_val <- idx_sig_rows$P_Value[i]
                         if (is.na(p_val) || p_val >= (as.numeric(input$sig_threshold %||% 0.05))) ""
                         else if (p_val < 0.001) sprintf("p = %.1e", p_val)
                         else sprintf("p = %.3f", p_val)
                     } else {
                         as.character(idx_sig_rows$Significance[i])
                     }
                     if (is.na(sig_text) || sig_text == "" || sig_text == "ns" || sig_text == "Reference") next
                     
                     span_indices <- min(base_x, comp_x):max(base_x, comp_x)
                     current_y <- max(x_heights[span_indices], na.rm = TRUE) + (v_range * 0.05)
                     
                     facet_lab <- format_index_label(as.character(idx_name), input$labelMode, input$classLabelFormat %||% "full")
                     segs[[length(segs)+1]] <- data.frame(Index=idx_name, FacetLabel=facet_lab, x=base_x, xend=comp_x, y=current_y, yend=current_y)
                     texts[[length(texts)+1]] <- data.frame(Index=idx_name, FacetLabel=facet_lab, x=(base_x+comp_x)/2, y=current_y + (v_range * 0.02), label=sig_text)
                     
                     x_heights[span_indices] <- current_y + (v_range * 0.13)
                 }
             }
             
             if(length(segs) > 0) {
                 seg_df <- do.call(rbind, segs)
                 txt_df <- do.call(rbind, texts)
                 
                 seg_df$FacetLabel <- factor(seg_df$FacetLabel, levels = facet_levels)
                 txt_df$FacetLabel <- factor(txt_df$FacetLabel, levels = facet_levels)
                 
                 p <- p + geom_segment(data=seg_df, aes(x=x, xend=xend, y=y, yend=yend), inherit.aes=FALSE, color="black", linewidth=0.4) +
                          geom_text(data=txt_df, aes(x=x, y=y, label=label), inherit.aes=FALSE, size=4, fontface="bold", color="black", vjust=0)
             }
         }
      }
      p <- p + scale_y_continuous(expand = expansion(mult = c(0.08, 0.18))) + coord_cartesian(clip = "off")
      return(p)
    })
    
    output$baseline_status_banner <- renderUI({
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
                        "Select an item in 'Reference Baseline:' in the left sidebar to compute functional ratio distributions.")
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

    output$logratioPlot <- renderPlot({
      if (is.null(shared_data$data_processed())) {
        return(generate_empty_plot_message("Please upload a dataset and click 'Run Analysis' in the left sidebar"))
      }
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        return(generate_empty_plot_message("Please select an item in 'Reference Baseline:' in the left sidebar to generate functional ratio plots"))
      }
      p <- current_violin_plot()
      if (is.null(p)) {
        return(generate_empty_plot_message("No indices selected or available under current filters"))
      }
      p
    })
    
    # 4b. Download Handlers
    output$downloadPlot <- downloadHandler(
      filename = function() {
        paste0("Functional_Violin_Plots_", format(Sys.time(), "%Y-%m-%d-%H-%M"), ".pdf")
      },
      content = function(file) {
        req(processed_db())
        df <- processed_db()
        sel_indices <- unifiedSelectedIndices()
        feats <- unique(df$Index[df$Index %in% sel_indices])
        req(length(feats) > 0)
        
        n <- length(feats)
        ncols <- min(3, n)
        nrows <- ceiling(n / 3)
        
        zoom <- input$plotZoom / 100
        w_in <- max(10, ncols * 5) * zoom
        h_in <- max(6, nrows * 4.5) * zoom
        
        p <- current_violin_plot()
        pdf(file, width = w_in, height = h_in)
        print(p)
        dev.off()
      }
    )
    
    output$downloadLedger <- downloadHandler(
      filename = function() {
        paste0("Functional_Indices_Ledger_", format(Sys.time(), "%Y%m%d_%H%M"), ".csv")
      },
      content = function(file) {
        req(processed_db())
        df <- processed_db()
        sel_indices <- unifiedSelectedIndices()
        sub_df <- df %>% dplyr::filter(Index %in% sel_indices)
        req(nrow(sub_df) > 0)
        
        ordered_groups <- levels(sub_df$GroupingVal)
        if(is.null(ordered_groups)) ordered_groups <- unique(sub_df$GroupingVal)
        
        ledger_out <- data.frame()
        
        for(idx in unique(sub_df$Index)) {
            idx_data <- sub_df %>% dplyr::filter(Index == idx)
            for(i in seq_len(length(ordered_groups)-1)) {
                for(j in seq(i+1, length(ordered_groups))) {
                    g1 <- ordered_groups[i]
                    g2 <- ordered_groups[j]
                    
                    vals_1 <- idx_data$Raw[idx_data$GroupingVal == g1]
                    vals_2 <- idx_data$Raw[idx_data$GroupingVal == g2]
                    
                    if(length(na.omit(vals_1)) >= 2 && length(na.omit(vals_2)) >= 2) {
                        log_v1 <- log2(vals_1 + 1e-9)
                        log_v2 <- log2(vals_2 + 1e-9)
                        
                        local_method <- input$localStatMethod %||% "auto"
                        resolved_method <- if (local_method == "auto") {
                           shared_data$actual_de_method()
                        } else if (local_method == "parametric") {
                           "limma"
                        } else {
                           "non_parametric"
                        }
                        
                        pval <- tryCatch(compute_local_p_val(log_v1, log_v2, method = resolved_method, paired = FALSE), error=function(e) NA)
                        
                        m1 <- mean(vals_1, na.rm=TRUE)
                        m2 <- mean(vals_2, na.rm=TRUE)
                        logfc <- log2((m2 + 1e-9) / (m1 + 1e-9))
                        
                        ledger_out <- rbind(ledger_out, data.frame(
                          Metric = idx,
                          Group_1 = g1,
                          Group_2 = g2,
                          Mean_Group_1 = m1,
                          Mean_Group_2 = m2,
                          Log2FC_G2_vs_G1 = logfc,
                          Pval = pval
                        ))
                    }
                }
            }
        }
        write.csv(ledger_out, file, row.names=FALSE)
      }
    )
    
    output$metrics_dictionary_ui <- renderUI({
       sel_indices <- unifiedSelectedIndices()
       if(length(sel_indices) == 0) return(tags$em("No indices selected.", class="text-muted small"))
       
       req(processed_db())
       df <- processed_db()
       sub_df <- df %>% dplyr::filter(Index %in% sel_indices) %>% dplyr::distinct(Index, Category)
       
       # Group by Category order
       cat_levels <- if(isTRUE(input$categoryMode == "detailed")) {
           c("Membrane Architecture", "Lipid Raft Dynamics", "Apoptosis & Ferroptosis", "Mitochondrial Homeostasis", "Epigenetic Remodeling", "Vesicular Trafficking", "Secondary Signaling Messengers", "Lysosomal Hydrolysis & Eicosanoids", "Lipid Droplet Maturation", "Lipolytic Clearance", "Other")
       } else {
           c("Structural", "Signaling", "Energy", "Other")
       }
       present_cats <- intersect(cat_levels, unique(sub_df$Category))
       
       cat_blocks <- lapply(present_cats, function(cat) {
          cat_indices <- sub_df$Index[sub_df$Category == cat]
          col_hex <- fla_palette_global[cat]
          if(is.na(col_hex)) col_hex <- "#6c757d"
          
          idx_lis <- lapply(cat_indices, function(idx) {
             form_str <- formula_dict_global[[idx]]
             ont_str <- ""
             if(isTRUE(input$display_ontology)) {
                 ont_tup <- ontology_dict[[idx]]
                 if(!is.null(ont_tup)) {
                     ont_str <- tags$span(style="color:#6c757d;", paste0(" [", ont_tup[1], " \u2194 ", ont_tup[2], "]"))
                 }
             }
             tags$li(tags$b(paste0(idx, ": ")), form_str, ont_str)
          })
          
          tagList(
             tags$h6(cat, class = "mt-2", style = paste0("color: ", col_hex, "; font-weight: bold;")),
             tags$ul(class = "small text-muted", style = "padding-left: 15px; margin-bottom: 0;", idx_lis)
          )
       })
       
       tagList(cat_blocks)
    })
    
    output$volcanoPlotUI <- renderUI({
       height <- if (!is.null(input$volcano_height)) input$volcano_height else 600
       width <- if (!is.null(input$volcano_width)) input$volcano_width else 1200
       plotOutput(session$ns("plotVolcano"), height = paste0(height, "px"), width = paste0(width, "px"))
    })
    
    output$volcano_comparison_ui <- renderUI({
       req(processed_db())
       df <- processed_db()
       comp_groups <- unique(df$GroupingVal[!df$Is_Baseline])
       baseline_grp <- unique(df$GroupingVal[df$Is_Baseline])
       baseline_text <- paste(baseline_grp, collapse = ", ")
       if (baseline_text == "") baseline_text <- "None Selected"
       
       tagList(
           tags$div(class="mb-3", tags$strong("Reference Baseline: "), tags$span(baseline_text, class="text-primary")),
           selectInput(session$ns("volcano_target_group"), tags$span("Compare vs Baseline:", bslib::tooltip(icon("circle-info", style = "margin-left: 5px; color: #6c757d; cursor: pointer;"), "Selects which comparison group serves as the baseline reference for calculating functional lipid ratios.")), choices = comp_groups, multiple = TRUE, selected = comp_groups[1])
       )
    })
    
    # 5. Volcano & PCA
    volcano_plot_obj <- reactive({
      df <- processed_db()
      target_group <- input$volcano_target_group
      if (is.null(target_group) || length(target_group) == 0) return(NULL)
      
      # Average by Index and GroupingVal (excluding baseline)
      volc_df <- df %>% 
         dplyr::filter(!Is_Baseline, GroupingVal %in% target_group) %>%
         dplyr::group_by(Index, Category, GroupingVal) %>%
         dplyr::summarize(
           Mean_Val = mean(Plot_Value, na.rm=TRUE),
           P_Value = first(P_Value),
           .groups="drop"
         ) %>%
         dplyr::filter(!is.na(P_Value))
      
      if(nrow(volc_df) == 0) return(NULL)
      
      volc_df$Label <- format_index_label(volc_df$Index, input$labelMode, input$classLabelFormat %||% "full")
      if (isTRUE(input$plot_ontology_volcano)) {
         volc_df$Label <- sapply(seq_len(nrow(volc_df)), function(i) {
             idx <- volc_df$Index[i]
             val <- volc_df$Mean_Val[i]
             terms <- ontology_dict[[idx]]
             base_label <- volc_df$Label[i]
             if(is.null(terms)) return(base_label)
             if(val > 0) {
                 paste0(base_label, "\n[", terms[2], "]")
             } else {
                 paste0(base_label, "\n[", terms[1], "]")
             }
         })
      }
      
      x_title <- if(input$scaleMode == "log2fc") "Log2FC" else "Mean Difference"
      baseline_grp <- unique(df$GroupingVal[df$Is_Baseline])
      baseline_text <- paste(baseline_grp, collapse = ", ")
      if(baseline_text == "") baseline_text <- "Baseline"
      
      x_label <- paste0("<- Up in ", baseline_text, "   |   Up in Target ->\n", x_title)
      
      # Calculate symmetric round max based on data
      max_val <- max(abs(volc_df$Mean_Val), na.rm = TRUE)
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
      x_limits <- c(-round_max, round_max)
      
      p <- ggplot(volc_df, aes(x = Mean_Val, y = -log10(P_Value), color = Category)) +
        geom_point(size = 3, alpha = 0.8) +
        geom_hline(yintercept = -log10(0.05), linetype = "dashed", color = "grey50", alpha=0.5) +
        geom_vline(xintercept = 0, color = "black", size = 0.5) +
        ggrepel::geom_text_repel(
          data = subset(volc_df, P_Value < 0.05), 
          aes(label = Label), 
          size = 3.5, 
          show.legend = FALSE,
          max.overlaps = Inf, 
          box.padding = 0.5, 
          point.padding = 0.4, 
          min.segment.length = 0, 
          segment.color = "grey50",
          force = 2
        ) +
        scale_color_manual(values = fla_palette_global) +
        scale_x_continuous(limits = x_limits, breaks = custom_breaks) +
        theme_minimal() +
        labs(x = x_label, title="Significance across Comparisons") +
        theme(
            text = element_text(size = 14), 
            strip.text = element_text(size=14, face="bold"),
            panel.grid.major = element_blank(), 
            panel.grid.minor = element_blank()
        )
        
      if (length(target_group) > 1) {
          p <- p + facet_wrap(~GroupingVal)
      }
      list(plot = p, data = volc_df)
    })
    
    output$plotVolcano <- renderPlot({
      if (is.null(shared_data$data_processed())) {
        return(generate_empty_plot_message("Please upload a dataset and click 'Run Analysis' in the left sidebar"))
      }
      if (is.null(input$selectedBaseline) || length(input$selectedBaseline) == 0 || all(!nzchar(trimws(input$selectedBaseline)))) {
        return(generate_empty_plot_message("Please select an item in 'Reference Baseline:' in the left sidebar to generate volcano plot"))
      }
      obj <- volcano_plot_obj()
      if (is.null(obj)) {
        return(generate_empty_plot_message("Please select target comparison groups to display volcano plot"))
      }
      obj$plot
    })
    
    output$dl_volcano_pdf <- downloadHandler(
        filename = function() { paste0("Volcano_Plot_", Sys.Date(), ".pdf") },
        content = function(file) {
            obj <- volcano_plot_obj()
            req(obj)
            w_in <- if (!is.null(input$volcano_width)) input$volcano_width / 72 else 1200 / 72
            h_in <- if (!is.null(input$volcano_height)) input$volcano_height / 72 else 600 / 72
            
            ggsave(file, plot = obj$plot, width = w_in, height = h_in, device = "pdf")
        }
    )
    
    output$dl_volcano_csv <- downloadHandler(
        filename = function() { paste0("Volcano_Data_", Sys.Date(), ".csv") },
        content = function(file) {
            obj <- volcano_plot_obj()
            req(obj)
            write.csv(obj$data, file, row.names = FALSE)
        }
    )
    
    output$tableBiomarkers <- renderDT({
      df <- processed_db()
      target_group <- input$volcano_target_group
      if (is.null(target_group) || length(target_group) == 0) return(NULL)
      
      sig_df <- df %>% 
         dplyr::filter(Significance %in% c("*", "**", "***"), GroupingVal %in% target_group) %>%
         dplyr::group_by(Index, Category, GroupingVal) %>%
         dplyr::summarize(
           Mean_Val = mean(Plot_Value, na.rm=TRUE),
           P_Value = first(P_Value),
           .groups="drop"
         ) %>%
         dplyr::arrange(P_Value) %>%
         dplyr::mutate(
           P_Value = formatC(P_Value, format = "e", digits = 2),
           Mean_Val = round(Mean_Val, 2)
         )
         
      DT::datatable(sig_df, options = list(pageLength = 10, dom = 'ft'))
    })
    
    output$plotPCA <- renderPlot({
      idx_data <- fla_indices()
      meta <- shared_data$all_metadata()
      mat <- idx_data$wide %>% tibble::column_to_rownames("Sample") %>% as.matrix()
      
      nzv <- apply(mat, 2, var, na.rm=TRUE) > 1e-9
      mat <- mat[, nzv, drop=FALSE]
      req(ncol(mat) > 1)
      
      pca_res <- prcomp(mat, scale. = TRUE)
      scores <- as.data.frame(pca_res$x) %>% 
        tibble::rownames_to_column("FullName") %>%
        dplyr::left_join(meta, by = "FullName")
      
      grp_col <- input$groupingMetadata[1]
      
      var_exp <- round(summary(pca_res)$importance[2, 1:2] * 100, 1)
      ggplot(scores, aes_string(x = "PC1", y = "PC2", color = grp_col)) +
        geom_point(size = 4, alpha = 0.8) +
        stat_ellipse(level = 0.95, linetype = "dashed") +
        theme_minimal() +
        labs(x = paste0("PC1 (", var_exp[1], "%)"), y = paste0("PC2 (", var_exp[2], "%)")) +
        theme(text = element_text(size = 14), legend.position = "bottom")
    })
    
    output$plotPCALoadings <- renderPlot({
      idx_data <- fla_indices()
      mat <- idx_data$wide %>% tibble::column_to_rownames("Sample") %>% as.matrix()
      nzv <- apply(mat, 2, var, na.rm=TRUE) > 1e-9
      mat <- mat[, nzv, drop=FALSE]
      req(ncol(mat) > 1)
      pca_res <- prcomp(mat, scale. = TRUE)
      
      loadings <- as.data.frame(pca_res$rotation) %>%
        tibble::rownames_to_column("Index") %>%
        dplyr::left_join(unique(idx_data$long[, c("Index", "Category")]), by = "Index")
      
      loadings$PlotLabel <- format_index_label(loadings$Index, input$labelMode, input$classLabelFormat %||% "full")
      
      ggplot(loadings, aes(x = PC1, y = PC2, color = Category, label = PlotLabel)) +
        geom_point(size = 3) +
        ggrepel::geom_text_repel(size = 3.5, show.legend = FALSE) +
        geom_hline(yintercept = 0, linetype = "dotted") +
        geom_vline(xintercept = 0, linetype = "dotted") +
        scale_color_manual(values = fla_palette_global) +
        theme_minimal() +
        theme(text = element_text(size = 14))
    })
    
    # 6. Correlation Engine
    correlation_data <- reactive({
      req(processed_db())
      df_long <- processed_db()
      
      sel_indices <- unifiedSelectedIndices()
      sub_df <- df_long %>% dplyr::filter(Index %in% sel_indices)
      if(length(unique(sub_df$Index)) < 3) return(NULL)
      
      df_wide <- sub_df %>% 
        dplyr::select(Sample, Index, Plot_Value) %>%
        tidyr::pivot_wider(names_from = Index, values_from = Plot_Value) %>%
        tibble::column_to_rownames("Sample")
        
      cor_mat <- cor(df_wide, use = "pairwise.complete.obs", method = "pearson")
      cor_mat[lower.tri(cor_mat, diag=TRUE)] <- NA
      
      cor_df <- as.data.frame(as.table(cor_mat)) %>%
        dplyr::filter(!is.na(Freq)) %>%
        dplyr::rename(Index_1 = Var1, Index_2 = Var2, Pearson_r = Freq) %>%
        dplyr::mutate(
           AbsCor = abs(Pearson_r),
           Direction = ifelse(Pearson_r > 0, "+ (Positive)", "- (Negative)"),
           Fisher_Z = 0.5 * log((1 + Pearson_r) / (1 - Pearson_r))
        )
      
      n_samples <- nrow(df_wide)
      if(n_samples > 3) {
          t_stat <- cor_df$Pearson_r * sqrt((n_samples - 2) / (1 - cor_df$Pearson_r^2))
          cor_df$P_Value <- 2 * pt(-abs(t_stat), df = n_samples - 2)
      } else {
          cor_df$P_Value <- NA
      }
      
      cor_df <- cor_df %>%
        dplyr::filter(AbsCor >= input$corrThresh) %>%
        dplyr::arrange(dplyr::desc(AbsCor))
        
      top_n <- input$maxLinks
      if(nrow(cor_df) > top_n) cor_df <- cor_df[1:top_n, ]
      
      return(cor_df)
    })

    output$circos_dynamic_title <- renderUI({
       cor_df <- correlation_data()
       if(is.null(cor_df)) return(NULL)
       
       n_links <- nrow(cor_df)
       thresh <- input$corrThresh
       
       tags$div(
          class = "text-center mb-3",
          tags$h4("Correlation Circoplot", class="fw-bold m-0"),
          tags$span(class="text-muted fst-italic", paste0("|r| >= ", thresh, " .. top ", n_links, " links"))
       )
    })

    output$circos_zoom_ui <- renderUI({
       zoom <- input$plotZoom
       if (is.null(zoom)) zoom <- 50
       
       h_dim <- 700 * (zoom / 50)
       h_dim <- max(400, h_dim)
       
       # Expand width by 35% so the legend sidebar has its own space without squishing the circle!
       w_dim <- h_dim * 1.35
       
       plotOutput(session$ns("plotCircos"), width = paste0(w_dim, "px"), height = paste0(h_dim, "px"))
    })

    # 6a. Correlation Circos Plot Logic
    circos_plot_logic <- reactive({
      req(processed_db())
      cor_df <- correlation_data()
      if(is.null(cor_df) || nrow(cor_df) == 0) {
         return(function() {
            plot.new()
            text(0.5, 0.5, paste("No pairwise correlations >", input$corrThresh), cex=1.5)
         })
      }
      
      df_long <- processed_db()
      sel_indices <- unifiedSelectedIndices()
      sub_df <- df_long %>% dplyr::filter(Index %in% sel_indices)
      
      nodes <- unique(c(as.character(cor_df$Index_1), as.character(cor_df$Index_2)))
      
      cat_map <- sub_df %>% dplyr::distinct(Index, Category)
      node_cats <- cat_map$Category[match(nodes, cat_map$Index)]
      
      fla_palette <- c(
          "Structural"="#4E79A7", "Signaling"="#E15759", "Energy"="#59A14F",
          "Membrane Architecture"="#4E79A7", "Lipid Raft Dynamics"="#76B7B2", "Apoptosis & Ferroptosis"="#E15759", 
          "Mitochondrial Homeostasis"="#F28E2B", "Epigenetic Remodeling"="#B07AA1", "Vesicular Trafficking"="#9C755F", 
          "Secondary Signaling Messengers"="#FF9D9A", "Lysosomal Hydrolysis & Eicosanoids"="#D37295", 
          "Lipid Droplet Maturation"="#59A14F", "Lipolytic Clearance"="#8CD17D",
          "Other"="#6c757d"
      )
      
      grid_col <- fla_palette_global[unique(cat_map$Category)]
      grid_col <- grid_col[!is.na(grid_col)]
      node_colors <- fla_palette_global[node_cats]
      names(node_colors) <- nodes
      
      link_colors <- ifelse(cor_df$Pearson_r > 0, scales::alpha("#0072B2", 0.7), scales::alpha("#D55E00", 0.7)) # Blue = Pos, Red = Neg
      
      n_nodes <- length(nodes)
      gap_deg <- min(2, max(0.1, 90 / n_nodes))
      
      thresh <- input$corrThresh
      n_links <- nrow(cor_df)
      
      return(function(include_title = FALSE) {
         # Segment the plot device into two distinct regions (Left: Circle, Right: Legends)
         layout(matrix(c(1, 2), nrow=1), widths=c(1, 0.35))
         
         # --- Left Pane: Circos Plot ---
         top_mar <- if(include_title) 6 else 2
         par(mar = c(2, 2, top_mar, 0), xpd=TRUE)
         
         circlize::circos.clear()
         circlize::circos.par(gap.degree = gap_deg, start.degree = 90)
         
         safe_track_height <- 0.15 
         
         circlize::chordDiagram(
            cor_df[, c("Index_1", "Index_2", "AbsCor")], 
            grid.col = node_colors,
            col = link_colors,
            transparency = 0.4,
            annotationTrack = "grid",
            annotationTrackHeight = c(0.02),
            preAllocateTracks = list(track.height = safe_track_height)
         )
         
         circlize::circos.trackPlotRegion(track.index = 1, panel.fun = function(x, y) {
           xlim <- circlize::get.cell.meta.data("xlim")
           ylim <- circlize::get.cell.meta.data("ylim")
           sector.name <- circlize::get.cell.meta.data("sector.index")
           display_name <- format_index_label(sector.name, input$labelMode, input$classLabelFormat %||% "full")
           if (isTRUE(input$plot_ontology_circos)) {
               terms <- ontology_dict[[sector.name]]
               if (!is.null(terms)) {
                   display_name <- paste0(display_name, "\n[", terms[1], " \u2194 ", terms[2], "]")
               }
           }
           
           circlize::circos.text(mean(xlim), ylim[1], display_name, facing = "clockwise", 
                                 niceFacing = TRUE, adj = c(0, 0.5), cex = 0.85, font = 2)
         }, bg.border = NA)
         
         if(include_title) {
             title("Correlation Circoplot", line = 3, cex.main=1.5)
             mtext(paste0("|r| >= ", thresh, " .. top ", n_links, " links"), side=3, line=1.5, cex=1, font=3)
         }
         
         circlize::circos.clear()
         
         # --- Right Pane: Legends ---
         par(mar = c(2, 0, top_mar, 2), xpd=TRUE)
         plot.new()
         
         legend("topleft", legend=names(grid_col), fill=grid_col, horiz=FALSE, bty="n", cex=1.1, title="Index Category", title.cex=1.2, xpd=NA)
         legend("left", legend=c("Positive (+)", "Negative (-)"), fill=c("#0072B2", "#D55E00"), horiz=FALSE, bty="n", cex=1.1, title="Correlation", title.cex=1.2, xpd=NA, inset=c(0, 0.5))
      })
    })

    output$plotCircos <- renderPlot({
      func <- circos_plot_logic()
      req(func)
      func()
    })

    # 6b. Correlation Data Table
    output$corrTable <- DT::renderDataTable({
      df <- correlation_data()
      req(df)
      
      out_df <- df %>%
         dplyr::select(Index_1, Index_2, Pearson_r, Direction, Fisher_Z, P_Value) %>%
         dplyr::arrange(dplyr::desc(abs(Pearson_r)))
      
      DT::datatable(out_df, 
        options = list(pageLength = 10, scrollX = TRUE, dom = 'Bfrtip'),
        rownames = FALSE,
        colnames = c("Index 1", "Index 2", "Pearson r", "Direction", "Fisher Z-Score", "P-value")
      ) %>%
      DT::formatRound(columns = c("Pearson_r", "Fisher_Z"), digits = 3) %>%
      DT::formatSignif(columns = c("P_Value"), digits = 3) %>%
      DT::formatStyle('Direction', color = DT::styleEqual(c('+ (Positive)', '- (Negative)'), c('#0072B2', '#D55E00')))
    })
    
    # 6c. Correlation Downloads
    output$downloadCircosPDF <- downloadHandler(
      filename = function() { paste0("Functional_Correlation_Network_", format(Sys.Date(), "%Y%m%d"), ".pdf") },
      content = function(file) {
        func <- circos_plot_logic()
        zoom <- input$plotZoom %||% 50
        h_dim <- 700 * (zoom / 50)
        h_dim <- max(400, h_dim)
        w_dim <- h_dim * 1.35
        
        w_in <- w_dim / 72
        h_in <- h_dim / 72
        
        pdf(file, width=w_in, height=h_in)
        func(include_title = TRUE)
        dev.off()
      },
      contentType = "application/pdf"
    )

    output$downloadCorrCSV <- downloadHandler(
      filename = function() { paste0("Functional_Correlation_Ledger_", format(Sys.Date(), "%Y%m%d"), ".csv") },
      content = function(file) {
        df <- correlation_data()
        req(df)
        write.csv(df, file, row.names = FALSE)
      }
    )
    

     output$fla_violin_stat_note <- renderUI({
       local_method <- input$localStatMethod %||% "auto"
       resolved_method <- if (local_method == "auto") {
          shared_data$actual_de_method()
       } else if (local_method == "parametric") {
          "limma"
       } else {
          "non_parametric"
       }
       get_journal_caption("fla", resolved_method, shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info(), selected_features = unifiedSelectedIndices())
     })
     
     output$fla_volcano_stat_note <- renderUI({
       local_method <- input$localStatMethod %||% "auto"
       resolved_method <- if (local_method == "auto") {
          shared_data$actual_de_method()
       } else if (local_method == "parametric") {
          "limma"
       } else {
          "non_parametric"
       }
       get_journal_caption("fla_volcano", resolved_method, shared_data$de_settings()$p_value_type, contrast_info = shared_data$de_contrast_info(), selected_features = unifiedSelectedIndices())
     })
    
    observeEvent(input$show_stats_detail, {
      local_method <- input$localStatMethod %||% "auto"
      actual_method <- if (local_method == "auto") {
         shared_data$actual_de_method()
      } else if (local_method == "parametric") {
         "limma"
      } else {
         "non_parametric"
      }
      base_method <- gsub("^auto_", "", actual_method)
      sel_indices <- unifiedSelectedIndices()
      baseline_grp <- input$selectedBaseline
      scale_mode <- input$scaleMode %||% "log2fc"
      active_tab <- input$fla_subtabs %||% "Violin Plots (All Selected)"
      plot_observed <- "Violin Plots"
      if (active_tab == "Index Divergence (Volcano & Biomarkers)") {
         inner_tab <- input$volcano_subtabs %||% "Functional Volcano"
         plot_observed <- paste0("Volcano Plot (", inner_tab, ")")
      } else if (active_tab == "Correlation Network") {
         inner_tab <- input$correlation_subtabs %||% "Functional Correlation Circos Plot"
         plot_observed <- paste0("Correlation Map (", inner_tab, ")")
      }
      
      meta <- tryCatch(shared_data$grouped_metadata(), error = function(e) NULL)
      contrast <- tryCatch(shared_data$de_contrast_info(), error = function(e) NULL)
      n_ref <- 0
      n_comp <- 0
      if (!is.null(meta) && !is.null(contrast)) {
        n_ref <- sum(meta$Dynamic_DE_Group %in% contrast$ref, na.rm = TRUE)
        n_comp <- sum(meta$Dynamic_DE_Group %in% contrast$comp, na.rm = TRUE)
      }
      
      msg <- paste0(
        "==================================================\n",
        "STATISTICAL REPORT: FUNCTIONAL LIPID ANALYSIS (FLA)\n",
        "==================================================\n",
        "Generated: ", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n\n",
        "1. ANALYSIS CONFIGURATION\n",
        "   - Primary Grouping:     ", paste(input$groupingMetadata, collapse = ", "), "\n",
        "   - Baseline/Reference:   ", paste(baseline_grp, collapse = ", "), "\n",
        "   - Measurement Scale:    ", scale_mode, "\n",
        "   - Category Grouping:    ", input$categoryMode, "\n",
        "   - Statistical Test:     ", actual_method, " (local pairwise)\n",
        "   - Current Sub-Tab:      ", active_tab, "\n",
        "   - Plot Observed:        ", plot_observed, "\n",
        "   - Replicate Sizes:      N_comp = ", n_comp, ", N_ref = ", n_ref, "\n\n",
        "2. MATHEMATICAL FORMULATION & CALCULUS EXAMPLE\n",
        "   For each selected functional ratio index:\n",
        "   Let {P_1, P_2, ...} be the set of precursor lipid species (numerator)\n",
        "   and {Q_1, Q_2, ...} be the set of product lipid species (denominator).\n\n",
        "   1. Absolute Ratio Calculation:\n",
        "      For each sample 'j', the absolute index value is the sum of precursors divided by the sum of products:\n",
        "          R_j = sum_a P_aj / sum_b Q_bj\n\n",
        "   2. Log2-Transformation:\n",
        "          L_j = log2(R_j) = log2( sum_a P_aj ) - log2( sum_b Q_bj )\n",
        "        (This maps the ratio onto a symmetric log scale where a fold change of zero means equal proportions).\n\n",
        "   3. Index Log2 Fold Change (Log2FC):\n",
        "      Let 'comp' be the comparison group and 'ref' be the reference group.\n",
        "          Delta_L = Mean(L, comp) - Mean(L, ref)\n",
        "                  = (1 / ", n_comp, ") * sum_{j in comp} L_j  -  (1 / ", n_ref, ") * sum_{j in ref} L_j\n\n",
        "   4. Pairwise Local Statistics:\n",
        "      The log2 index values L_j are compared between the comparison group and reference group.\n"
      )
      
      if (base_method == "non_parametric") {
        msg <- paste0(
          msg,
          "      We perform a Wilcoxon rank-sum test on the log2 index values L_j:\n",
          "          U = R_comp - [", n_comp, " * (", n_comp, " + 1)] / 2\n",
          "          Z-score = (U - mu_U) / sigma_U\n"
        )
      } else {
        msg <- paste0(
          msg,
          "      We perform a two-sample equal variance Student's t-test comparing L_comp vs L_ref:\n",
          "          t = Delta_L / ( s_p * sqrt(1/", n_comp, " + 1/", n_ref, ") )\n",
          "      where pooled standard deviation s_p is calculated on the log2 ratios:\n",
          "          s_p = sqrt( ( (", n_comp, " - 1)*s_comp^2 + (", n_ref, " - 1)*s_ref^2 ) / ", (n_comp + n_ref - 2), " )\n",
          "      The p-value is computed from Student's t-distribution with df = ", (n_comp + n_ref - 2), ".\n"
        )
      }
      
      msg <- paste0(
        msg,
        "\n3. INDEX EQUATION INDEX DICTIONARY:\n"
      )
      for (idx in sel_indices) {
        eq <- formula_dict_global[[idx]] %||% "N/A"
        func_name <- functional_name_dict_global[[idx]] %||% idx
        msg <- paste0(
          msg,
          sprintf("   %-25s : %s [Formula: %s]\n", idx, func_name, eq)
        )
      }
      
      msg <- paste0(msg, "\n==================================================\n")
      
      msg <- paste0(msg, "\n", get_stats_console_method_summary(shared_data))
      
      # Write to stats_detail_text and display modal overlay
      shared_data$stats_detail_text(msg)
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      show_statistics_modal(session = parent_sess, shared_data = shared_data, origin_tab_name = "Functional Ratios")
    })
    
  })
}
