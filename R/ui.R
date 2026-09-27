# R/ui.R
# Main UI structure.

# Load version dynamically from DESCRIPTION file
app_version <- tryCatch({
  desc <- read.dcf("DESCRIPTION")
  if ("Version" %in% colnames(desc)) {
    desc[1, "Version"]
  } else {
    "10.3.3"
  }
}, error = function(e) {
  "10.3.3"
})

# Define the overall theme for the application.
app_theme <- bslib::bs_theme(
  version = 5,
  bg = "#FFFFFF",
  fg = "#1F1F1F",
  primary = "#2563EB",
  secondary = "#E28E2B",
  base_font = bslib::font_google("Inter", local = FALSE),
  heading_font = bslib::font_google("Inter", local = FALSE)
) %>% bslib::bs_add_rules(".sidebar .card-header { font-weight: bold; }")

# Main UI definition using page_navbar for a multi-tab layout.
ui <- page_navbar(
  id = "main_navbar",
  selected = "Quality Check",
  title = tags$img(
    id = "navbar_brand_logo_img",
    src = "img/app_logo_ribbon.png",
    alt = "Global Lipidomic Explorer",
    class = "navbar-brand-logo-full"
  ),
  window_title = "Global Lipidomic Explorer",
  theme = app_theme,
  header = tagList(
    tags$head(
      tags$link(rel = "icon", type = "image/png", href = "img/favicon.png"),
      tags$link(rel = "shortcut icon", href = "img/favicon.png"),
      includeCSS("www/css/custom.css"),
      includeScript("www/js/app.js"),
      includeScript("www/js/tour_guide.js")
    ),
    tags$div(
      id = "targeted_lipids_top_dock",
      class = "targeted-lipids-top-dock d-flex justify-content-end align-items-center mb-2 pe-3",
      targeted_lipids_hub_ui("targeted_lipids_hub")
    )
  ),
  
 # The sidebar will contain all user controls. It is defined by the shared_data module.
  sidebar = sidebar(
    id = "main_sidebar",
    width = 305,
    shared_data_ui("data_hub") # UI from the central data module.
  ),
  
  # ==============================================================================
  # --- 1. Data & Overview ---
  # ==============================================================================
  nav_menu(
    title = "1. Data & Overview",
    icon = icon("database"),
    nav_panel("App Info", icon = icon("info-circle"),
      card(
        class = "mb-3 border-0 bg-light-subtle",
        card_body(
          div(
            class = "d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2",
            div(
              class = "d-flex align-items-center gap-3",
              tags$img(src = "img/app_logo.jpg", alt = "App Logo", style = "width: 72px; height: 72px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; background: white; object-fit: contain;"),
              div(
                tags$h3("Global Lipidomic Explorer", class = "text-primary fw-bold mb-1"),
                tags$span(class = "badge-version-chip", paste0("Version ", app_version))
              )
            ),
            actionButton(
              "btn_reopen_welcome_guide",
              " Welcome Guide & Tour",
              icon = icon("compass"),
              class = "btn btn-outline-primary btn-sm fw-semibold shadow-sm",
              onclick = "if(window.showWelcomeModal) { window.showWelcomeModal(); } else { Shiny.setInputValue('trigger_show_welcome_modal', Math.random()); }"
            )
          ),
          tags$p(class = "text-muted", 
                "An interactive environment designed for clinical and laboratory lipidomics profiling. The platform automates structural parsing, quality control diagnostics, differential comparisons, metabolic mapping, and session sharing directly from raw abundance matrices."),
         
         hr(class = "my-4"),
         
         navset_card_tab(
           nav_panel("1. Features & Capabilities",
             card_body(
               tags$ul(
                 style = "padding-left: 20px; line-height: 1.6;",
                 tags$li(strong("Data Ingestion & Annotation:"), " Dynamic parser with automated lipid chain structures identification."),
                 tags$li(strong("Quality Check:"), " Distribution boxplots, PCA score & loadings, correlation matrices, and technical outlier treatment."),
                 tags$li(strong("Precision Filtering:"), " Technical replicate BQC Coefficient of Variation (CoV) analysis to globally exclude imprecise species."),
                 tags$li(strong("Differential Abundance:"), " Automated linear modeling (limma) or ranks-based tests (Wilcoxon) selection based on skewness."),
                 tags$li(strong("Composition & Structural shifts:"), " Stacked barcharts, chain-length/unsaturation dotplots, and species violin distributions."),
                 tags$li(strong("Carbon & Double Bond Grids:"), " Single-class and multi-class heatmaps mapped across structural coordinates."),
                 tags$li(strong("Lipid Set Enrichment (LSEA):"), " Group-wise pathway-level set enrichment testing (NES and P-values)."),
                 tags$li(strong("Metabolic Pathways:"), " Biosynthetic class biosynthesis networks overlaid with abundance and saturation shifts."),
                 tags$li(strong("Cellular & Organelle stress:"), " Organelle saturation scores, peroxidation indexes, and macrophage polarization maps."),
                 tags$li(strong("Longitudinal Trajectories:"), " Multi-timepoint trajectory trend profiling across patients or experimental cohorts."),
                 tags$li(strong("Session Persistence:"), " Compress and export complete active session packages to share exact configurations with collaborators.")
               )
             )
           ),
           nav_panel("2. Quick Start User Guide",
             card_body(
               h5(icon("compass"), " Quick Start Workflow Guide", class = "fw-bold text-secondary mb-3"),
               tags$ol(
                 style = "padding-left: 20px; line-height: 1.6;",
                 tags$li(strong("Upload:"), " Navigate to the 'Input & Run Analysis' sidebar. Upload your raw spreadsheet (.xlsx or .csv) and metadata mapping sheet."),
                 tags$li(strong("Map:"), " Map group classifications and select your Comparison group vs. Baseline Reference group."),
                 tags$li(strong("Run:"), " Click 'Run Analysis' to initialize the data processing, normalization, and structural parsing pipeline."),
                 tags$li(strong("Explore:"), " Navigate through the top tabs to visualize quality check distributions, pathway maps, and organelle scores."),
                 tags$li(strong("Save:"), " Click 'Export Session' in the sidebar to download a package containing your complete active session state.")
               )
             )
           )
         )
        )
      )
    ),
    nav_panel("Lexicon", icon = icon("book"),
    tagList(
      card(
        class = "mb-3 border-0 bg-light-subtle",
        card_body(
          tags$h5("Lexicon & Structural Taxonomy", class="text-primary fw-bold mb-1"),
          tags$p(class="text-muted small mb-0", 
                 "Authoritative reference guide for the 4-tier lipidomic nomenclature, chemical definitions, and metadata classification standards:"),
          tags$ul(class="text-muted small mb-0", style="padding-left: 20px; margin-top: 5px;",
            tags$li(tags$strong("Tier 1 - Lipid Category:"), " 5 overarching biochemical categories: Fatty Acyl, Glycerolipid, Glycerophospholipid, Sphingolipid, and Sterol Lipid."),
            tags$li(tags$strong("Tier 2 - Lipid Main Class:"), " 21 primary parent classes defining molecular headgroups and fundamental metabolic pathways."),
            tags$li(tags$strong("Tier 3 - Lipid Sub Class:"), " Alkyl ether (O-), plasmalogen vinyl-ether (P-), dihydro (d-), and split sub-class variants (Ether PE, Plasmalogen PE)."),
            tags$li(tags$strong("Tier 4 - Structural Modification State:"), " Backbone saturation and processing status (dihydro, mature, standard), alongside saturation and carbon chain filters.")
          )
        )
      ),
      layout_columns(
        col_widths = breakpoints(sm = 12, md = 12, lg = c(8, 4), xl = c(8, 4)),
        card(
          class = "shadow-sm border-0 mb-3",
          card_header(
            class = "d-flex justify-content-between align-items-center py-2 px-3 bg-light-subtle",
            tags$div(
              class = "d-flex align-items-center gap-2",
              icon("layer-group", class = "text-primary"),
              tags$h5("Lipid Category & Main Class Architecture", style = "margin-bottom: 0; font-weight: 700; color: #1e40af; font-size: 1.05rem;")
            ),
            tags$span(class = "badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1",
                      style = "font-size: 0.72rem; font-weight: 600;",
                      "5 Categories / 21 Main Classes")
          ),
          card_body(
            class = "p-3",
            tags$div(
              class = "lexicon-search-wrapper",
              tags$span(class = "lexicon-search-icon", icon("magnifying-glass")),
              tags$input(id = "lexicon-filter-input", type = "text", class = "form-control lexicon-search-input",
                         placeholder = "Quick filter abbreviations or definitions (e.g. PC, Cer, Ether, mature)...",
                         autocomplete = "off")
            ),
            tags$div(
              class = "lexicon-category-grid",
              # Column 1: Glycerophospholipids (GP)
              tags$div(
                class = "lexicon-subcard subcard-gp",
                tags$div(
                  class = "lexicon-subcard-header",
                  tags$span("GP: Glycerophospholipids"),
                  tags$span(class = "badge badge-gp", "13 Main Classes")
                ),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "CL"), tags$span(class = "lexicon-desc", "Cardiolipin")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "LPA"), tags$span(class = "lexicon-desc", "Lysophosphatidic Acid")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "LPC"), tags$span(class = "lexicon-desc", "Lysophosphatidylcholine")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "LPE"), tags$span(class = "lexicon-desc", "Lysophosphatidylethanolamine")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "LPG"), tags$span(class = "lexicon-desc", "Lysophosphatidylglycerol")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "LPI"), tags$span(class = "lexicon-desc", "Lysophosphatidylinositol")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "LPS"), tags$span(class = "lexicon-desc", "Lysophosphatidylserine")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "PA"), tags$span(class = "lexicon-desc", "Phosphatidic Acid")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "PC"), tags$span(class = "lexicon-desc", "Phosphatidylcholine")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "PE"), tags$span(class = "lexicon-desc", "Phosphatidylethanolamine")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "PG"), tags$span(class = "lexicon-desc", "Phosphatidylglycerol")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "PI"), tags$span(class = "lexicon-desc", "Phosphatidylinositol")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gp", "PS"), tags$span(class = "lexicon-desc", "Phosphatidylserine"))
              ),
              
              # Column 2: Sphingolipids (SP)
              tags$div(
                class = "lexicon-subcard subcard-sp",
                tags$div(
                  class = "lexicon-subcard-header",
                  tags$span("SP: Sphingolipids"),
                  tags$span(class = "badge badge-sp", "4 Main Classes")
                ),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-sp", "Cer"), tags$span(class = "lexicon-desc", "Ceramide")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-sp", "GlcCer"), tags$span(class = "lexicon-desc", "Glucosylceramide")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-sp", "LacCer"), tags$span(class = "lexicon-desc", "Lactosylceramide")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-sp", "SM"), tags$span(class = "lexicon-desc", "Sphingomyelin"))
              ),
              
              # Column 3: Glycerolipids (GL), Sterols (ST), Fatty Acyls (FA)
              tags$div(
                class = "lexicon-subcard subcard-gl",
                tags$div(
                  class = "lexicon-subcard-header",
                  tags$span("GL: Glycerolipids"),
                  tags$span(class = "badge badge-gl", "2 Main Classes")
                ),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gl", "DAG"), tags$span(class = "lexicon-desc", "Diacylglycerol")),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gl", "TAG"), tags$span(class = "lexicon-desc", "Triacylglycerol")),
                
                tags$div(
                  class = "lexicon-subcard-header subcard-st",
                  style = "margin-top: 14px;",
                  tags$span("ST: Sterol Lipids"),
                  tags$span(class = "badge badge-st", "1 Main Class")
                ),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-st", "CE"), tags$span(class = "lexicon-desc", "Cholesteryl Ester")),
                
                tags$div(
                  class = "lexicon-subcard-header subcard-fa",
                  style = "margin-top: 14px;",
                  tags$span("FA: Fatty Acyls"),
                  tags$span(class = "badge badge-fa", "1 Main Class")
                ),
                tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-fa", "ACar"), tags$span(class = "lexicon-desc", "Acylcarnitine"))
              )
            )
          )
        ),
        
        # Right Column Cards
        tags$div(
          # Tier 3 Card: Lipid Sub Class
          card(
            class = "shadow-sm border-0 mb-3",
            card_header(
              class = "d-flex align-items-center justify-content-between py-2 px-3 bg-light-subtle",
              tags$div(
                class = "d-flex align-items-center gap-2",
                icon("diagram-project", style = "color: #0284c7;"),
                tags$h5("Lipid Sub Class", style = "margin-bottom: 0; font-weight: 700; color: #0284c7; font-size: 1.05rem;")
              ),
              tags$span(class = "badge bg-info-subtle text-info border border-info-subtle px-2 py-1",
                        style = "font-size: 0.72rem; font-weight: 600;",
                        "5 Distinctions")
            ),
            card_body(
              class = "p-3",
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-subclass", "O-"), tags$span(class = "lexicon-desc", tags$strong("Ether (O-): "), "Alkyl ether bond linkage")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-subclass", "P-"), tags$span(class = "lexicon-desc", tags$strong("Plasmalogen (P-): "), "Vinyl-ether (alkenyl) bond linkage")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-subclass", "d-"), tags$span(class = "lexicon-desc", tags$strong("Dihydro (d-): "), "Saturated sphingoid base linkage")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-subclass", "PE_E"), tags$span(class = "lexicon-desc", tags$strong("Ether Phosphatidylethanolamine: "), "Ether-linked PE (O-)")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-subclass", "PE_P"), tags$span(class = "lexicon-desc", tags$strong("Plasmalogen Phosphatidylethanolamine: "), "Plasmalogen PE (P-)"))
            )
          ),
          
          # Tier 4 Card: Structural Modification State
          card(
            class = "shadow-sm border-0 mb-3",
            card_header(
              class = "d-flex align-items-center justify-content-between py-2 px-3 bg-light-subtle",
              tags$div(
                class = "d-flex align-items-center gap-2",
                icon("dna", style = "color: #c2410c;"),
                tags$h5("Structural Modification State", style = "margin-bottom: 0; font-weight: 700; color: #c2410c; font-size: 1.05rem;")
              ),
              tags$span(class = "badge bg-warning-subtle text-warning border border-warning-subtle px-2 py-1",
                        style = "font-size: 0.72rem; font-weight: 600;",
                        "3 States")
            ),
            card_body(
              class = "p-3",
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-mod", "dihydro"), tags$span(class = "lexicon-desc", tags$strong("dihydro: "), "Dihydro-modification / saturated backbone")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-mod", "mature"), tags$span(class = "lexicon-desc", tags$strong("mature: "), "Fully processed / unsaturated mature state")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-mod", "standard"), tags$span(class = "lexicon-desc", tags$strong("standard: "), "Standard / conventional unmodified state"))
            )
          ),
          
          # Filter Reference Card
          card(
            class = "shadow-sm border-0",
            card_header(
              class = "d-flex align-items-center gap-2 py-2 px-3 bg-light-subtle",
              icon("filter", style = "color: #047857;"),
              tags$h5("Structural Filters", style = "margin-bottom: 0; font-weight: 700; color: #047857; font-size: 1.05rem;")
            ),
            card_body(
              class = "p-3",
              tags$div(style = "font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.3px;", "Saturation Categories:"),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gl", "SFA"), tags$span(class = "lexicon-desc", tags$strong("Saturated: "), "0 Double Bonds")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gl", "MUFA"), tags$span(class = "lexicon-desc", tags$strong("Monounsaturated: "), "1 Double Bond")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-gl", "PUFA"), tags$span(class = "lexicon-desc", tags$strong("Polyunsaturated: "), "≥ 2 Double Bonds")),
              
              tags$hr(class = "my-2"),
              tags$div(style = "font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 8px; margin-bottom: 6px; letter-spacing: 0.3px;", "Acyl Chain Lengths:"),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-neutral", "SCFA"), tags$span(class = "lexicon-desc", tags$strong("Short-Chain: "), "< 6 Carbons")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-neutral", "MCFA"), tags$span(class = "lexicon-desc", tags$strong("Medium-Chain: "), "6 to 12 Carbons")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-neutral", "LCFA"), tags$span(class = "lexicon-desc", tags$strong("Long-Chain: "), "13 to 21 Carbons")),
              tags$div(class = "lexicon-item", tags$span(class = "lexicon-badge badge-neutral", "VLCFA"), tags$span(class = "lexicon-desc", tags$strong("Very-Long-Chain: "), "> 21 Carbons"))
            )
          )
        )
      )
    )
  )
  ),

  # ==============================================================================
  # --- 2. Quality Control ---
  # ==============================================================================
  nav_menu(
    title = "2. Quality Control",
    icon = icon("shield-halved"),
    nav_panel("Quality Check", icon = icon("sitemap"),
      qc_boxplot_ui("qc_pca_tab")
    )
  ),

  # ==============================================================================
  # --- 3. Quantitative ---
  # ==============================================================================
  nav_menu(
    title = "3. Quantitative",
    icon = icon("chart-simple"),
    nav_panel("Heatmap", icon = icon("table-cells"),
      heatmap_ui("heatmap_barchart_tab")
    ),
    nav_panel("Composition", icon = icon("chart-bar"),
      barchart_ui("barchart")
    ),
    nav_panel("Volcano Plot", icon = icon("mountain-sun"),
      volcano_ui("volcano_tab")
    ),
    nav_panel("LSEA", icon = icon("chart-line"),
      lsea_ui("lsea_tab")
    )
  ),

  # ==============================================================================
  # --- 4. Structural ---
  # ==============================================================================
  nav_menu(
    title = "4. Structural",
    icon = icon("dna"),
    nav_panel("Structural", icon = icon("dna"),
      structural_ui("structural_tab")
    ),
    nav_panel("Main Class & Acyl Chain Proportions", icon = icon("chart-column"),
      structural_proportions_ui("structural_tab")
    ),
    nav_panel("Structural Grid", icon = icon("table-cells-large"),
      structural_grid_ui("structural_grid_tab")
    ),
    nav_panel("Violin Plots", icon = icon("scale-unbalanced"),
      logratio_ui("logratio_tab")
    )
  ),

  # ==============================================================================
  # --- 5. Targeted Analysis ---
  # ==============================================================================
  nav_menu(
    title = "5. Targeted Analysis",
    icon = icon("diagram-project"),
    nav_panel("Functional Ratios", icon = icon("calculator"),
      fla_ui("fla_tab")
    ),
    nav_panel("Lipid Pathways", icon = icon("diagram-project"),
      pathway_ui("pathway_tab")
    ),
    nav_panel("Cellular Organization", icon = icon("cubes"),
      cellular_org_ui("cellular_org_tab")
    ),
    nav_panel("Longitudinal", icon = icon("clock"),
      longitudinal_ui("longitudinal_tab")
    )
  ),

  # ==============================================================================
  # --- 6. Reference & Methods ---
  # ==============================================================================
  nav_menu(
    title = "6. Reference & Methods",
    icon = icon("book-bookmark"),
    # Dedicated Statistics tab is hidden - statistical details are displayed directly
    # via the high-contrast 'Show Statistic Detail' console modal overlay on each plot tab.
    nav_panel("Math Proof", icon = icon("square-root-variable"), fillable = FALSE,
      math_proof_ui("math_proof_tab")
    ),
    nav_panel("About & Citation", icon = icon("info-circle"),
      card(
        card_header(h4("About the Lipidomic Explorer")),
        card_body(
          p("This app intend to allow to facilitate the analysis of lipidomics data"),
          hr(),
          h5("Author"),
          p("Maxence Tricaud - Libreros Lab"),
          p(icon("envelope"), tags$a(href="mailto:mtricaud.cetri@gmail.com", "mtricaud.cetri@gmail.com")),
          p(
            tags$img(src = "https://info.orcid.org/wp-content/uploads/2019/11/orcid_16x16.png", style="width:16px; height:16px;"),
            " ORCID: ",
            tags$a(href="https://orcid.org/0009-0000-0737-5110", target="_blank", "0009-0000-0737-5110")
          )
        )
      )
    )
  )
)
