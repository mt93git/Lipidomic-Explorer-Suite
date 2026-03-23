# app.R
# App entry point.

source(file.path("R", "global.R"))

shiny::shinyApp(
  ui = ui,
  server = server
)
