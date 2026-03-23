# R/ui.R
# Main UI structure.

# Define the overall theme for the application.
app_theme <- bslib::bs_theme(
  version = 5,
  bg = "#FFFFFF",
  fg = "#1F1F1F",
  primary = "#4E79A7",
  secondary = "#E28E2B",
  base_font = bslib::font_google("Inter", local = FALSE),
  heading_font = bslib::font_google("Inter", local = FALSE)
) %>% bslib::bs_add_rules(".sidebar .card-header { font-weight: bold; }")

# Main UI definition using page_navbar for a multi-tab layout.
ui <- page_navbar(
  title = "Lipidomic Explorer v4.0",
  theme = app_theme,
  
 # The sidebar will contain all user controls. It is defined by the shared_data module.
  sidebar = sidebar(
    width = 380,
    shared_data_ui("data_hub") # UI from the central data module.
  ),
  
 # Each nav_panel corresponds to a major analysis tab.
 # The content of each tab is defined in its respective module's UI function.
  nav_panel("QC & PCA", icon = icon("sitemap"),
    qc_boxplot_ui("qc_pca_tab")
  ),
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
  ),
  nav_panel("Structural", icon = icon("dna"),
    structural_ui("structural_tab")
  ),
  nav_panel("Violin Plots", icon = icon("scale-unbalanced"),
    logratio_ui("logratio_tab")
  ),


  
 # An "About" page for providing information and citations.
  nav_panel("About & Citation", icon = icon("info-circle"),
    card(
      card_header(h4("About the Lipidomic Explorer")),
      card_body(
        p("This app intend to allow to facilitate the analysis of lipidomics data"),
        hr(),
        h5("Author"),
        p("Maxence Tricaud - Libreros Lab"),
        p(icon("envelope"), tags$a(href="mailto:maxence.benjamin@gmail.com", "maxence.benjamin@gmail.com")),
        p(
          tags$img(src = "https://info.orcid.org/wp-content/uploads/2019/11/orcid_16x16.png", style="width:16px; height:16px;"),
          " ORCID: ",
          tags$a(href="https://orcid.org/0009-0000-0737-5110", target="_blank", "0009-0000-0737-5110")
        )
      )
    )
  )
)

