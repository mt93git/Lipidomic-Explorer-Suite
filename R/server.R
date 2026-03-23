# R/server.R
# Main Server Logic.

server <- function(input, output, session) {
  
 # --- REACTIVE BRIDGE ---
 # Bridge to resolve circular dependency between QC Module (UI/Settings)
 # and Shared Data Module (Logic/Data).
  qc_settings_bridge <- reactiveVal(NULL)
  
 # The shared_data_server is called first, accepting the bridge.
  shared_data <- shared_data_server("data_hub", external_settings = qc_settings_bridge)
  
 # --- GLOBAL COLOR STATE ---
 # Use the master color maps from shared_data, which now incorporate custom overrides.
  global_color_map <- reactive({
    req(shared_data$color_maps())
    shared_data$color_maps()
  })

 # The qc_boxplot_server is called to activate the visualization module.
 # It returns the current settings from the UI.
  qc_module_return <- qc_boxplot_server("qc_pca_tab", shared_data, global_color_map)
  
 # Populate the bridge with settings from QC module
  observe({
    req(qc_module_return())
    qc_settings_bridge(qc_module_return())
  })
  
 # The heatmap_server is called to activate the heatmap module.
  heatmap_debug <- heatmap_server("heatmap_barchart_tab", shared_data)
  

  
 # The barchart_server is called to activate the composition module.
  barchart_server("barchart", shared_data, global_color_map)
   
 # --- DIAGNOSTIC OBSERVER ---
 # This observer will run ONCE when the app starts and print the names
 # of all the reactives being returned by the shared_data module.
  observeEvent(TRUE, {
    cat("--- Reactives available from shared_data ---\n")
    print(names(shared_data))
    cat("------------------------------------------\n")
  }, once = TRUE)
 # --- END DIAGNOSTIC ---
  
 # The volcano_server is called to activate the volcano module.
  volcano_server("volcano_tab", shared_data)
  
 # The lsea_server is called to activate the LSEA module.
  lsea_server("lsea_tab", shared_data)

 # The structural_server is called to activate the Structural module.
  structural_server("structural_tab", shared_data)
  
 # The logratio_server is called to activate the LogRatio module.
  logratio_server("logratio_tab", shared_data, global_color_map)
}
