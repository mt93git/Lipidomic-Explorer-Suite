# Browser harness for www/team/js/upload_formats.js with the real shiny.js and the real Team
# server code (R/frontends/team/upload_formats.R). An observer stands in for the shared data
# module and records every upload of "data_hub-files" (names and md5 of the received bytes).
# Started by tests/team-ux/test_upload_formats_browser.cjs; TEAM_UPLOAD_HARNESS_DELAY (seconds)
# slows conversions so overlapping selections can be tested.
library(shiny)
root <- Sys.getenv("TEAM_UPLOAD_ROOT", normalizePath(file.path(getwd(), "..", "..", "..")))
source(file.path(root, "R/sample_metadata_import.R"))
source(file.path(root, "R/frontends/team/upload_formats.R"))
delay <- as.numeric(Sys.getenv("TEAM_UPLOAD_HARNESS_DELAY", "0"))
if (delay > 0) {
  convert <- team_upload_convert_one
  team_upload_convert_one <- function(...) { Sys.sleep(delay); convert(...) }
}
ui <- fluidPage(
  tags$head(includeCSS(file.path(root, "www/team/css/upload_formats.css")),
            includeScript(file.path(root, "www/team/js/upload_formats.js"))),
  team_upload_formats_ui(),
  fileInput("data_hub-files", "Abundance files", multiple = TRUE, accept = c(".csv", ".xlsx", ".xls")),
  tags$pre(id = "uploads", textOutput("uploads", inline = TRUE)))
server <- function(input, output, session) {
  team_upload_formats_server(input, session)
  log <- reactiveVal(list())
  observeEvent(input[["data_hub-files"]], {
    f <- input[["data_hub-files"]]
    log(c(log(), list(lapply(seq_len(nrow(f)), function(i) list(name = f$name[i], md5 = unname(tools::md5sum(f$datapath[i])),
      text = if (grepl("\\.csv$", f$name[i])) paste(readLines(f$datapath[i], warn = FALSE), collapse = "\n") else NULL)))))
  })
  output$uploads <- renderText(jsonlite::toJSON(log(), auto_unbox = TRUE))
}
shinyApp(ui, server)
