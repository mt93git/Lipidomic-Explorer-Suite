# Browser harness for www/team/js/sheet_picker.js (with sciex_import.js and upload_formats.js, as in Team) with the real shiny.js and the real Team server
# code (R/frontends/team/sheet_picker.R). An observer stands in for the shared data module and
# records every upload of "data_hub-files": name, md5 of the bytes received, sheet names, and whether
# what the shared reader makes of it (load_one_file or read.csv, then as.numeric) is identical()
# to what it makes of the single-sheet fixture.
# Started by tests/team-ux/test_sheet_picker_browser.cjs. TEAM_SHEET_FIXTURES: directory where the
# fixture workbooks are written at start; TEAM_SHEET_MAX_ROWS lowers the row cap.
library(shiny)
root <- Sys.getenv("TEAM_SHEET_ROOT", normalizePath(file.path(getwd(), "..", "..", "..")))
source(file.path(root, "R/utils_data.R"))
source(file.path(root, "R/sample_metadata_import.R"))
source(file.path(root, "R/frontends/team/upload_formats.R"))
source(file.path(root, "R/frontends/team/sciex_import.R"))
source(file.path(root, "R/frontends/team/sheet_picker.R"))
# The Team code was sourced into the global environment (runApp evaluates app.R in a child of it).
if (nzchar(Sys.getenv("TEAM_SHEET_MAX_ROWS"))) assign("team_sheet_max_rows", as.integer(Sys.getenv("TEAM_SHEET_MAX_ROWS")), envir = globalenv())

fixtures <- Sys.getenv("TEAM_SHEET_FIXTURES")
if (nzchar(fixtures)) {
  data_sheet <- data.frame(`Lipid Name` = c("PC(16:0/18:1)", "TG(52:2)", "CE(18:2)", "SM(d18:1/16:0)", "LPC(18:0)"),
                           `Ctrl-1` = c(1.5, 1e-9, 123456.789012345, 0.1 + 0.2, 1/3), `Ctrl-2` = c(NA, 2, 3.25, 4, 5),
                           check.names = FALSE)
  notes <- data.frame(Note = c("Run 2026-10-01", "Instrument QTOF"), Value = c("x", "y"))
  other <- data.frame(`Lipid Name` = c("PE(36:2)", "PC(16:0/18:1)"), `Ctrl-1` = c(99, 98), check.names = FALSE)
  long <- data.frame(`Lipid Name` = sprintf("PC(%d:0)", 1:7), S1 = 1:7 / 7, check.names = FALSE)
  writexl::write_xlsx(list(Notes = notes, Data = data_sheet, Other = other), file.path(fixtures, "multi.xlsx"))
  writexl::write_xlsx(list(Data = data_sheet), file.path(fixtures, "single.xlsx"))
  writexl::write_xlsx(list(Info = notes, Long = long), file.path(fixtures, "rows.xlsx"))
}

app_read <- function(fp, name) {
  df <- if (grepl("\\.csv$", name, ignore.case = TRUE)) {
    d <- read.csv(fp, check.names = FALSE); if (!"Lipid_Name" %in% names(d)) names(d)[1] <- "Lipid_Name"; d
  } else load_one_file(fp, name)
  df <- as.data.frame(df, check.names = FALSE, stringsAsFactors = FALSE)
  df[-1] <- suppressWarnings(lapply(df[-1], as.numeric))
  df
}
# identical() of what the shared reader makes of an upload and of fixtures/single.xlsx.
reference <- if (nzchar(fixtures)) app_read(file.path(fixtures, "single.xlsx"), "single.xlsx")
same_as_single <- function(fp, name) tryCatch(identical(app_read(fp, name), reference), error = function(e) FALSE)

ui <- fluidPage(
  # Same order as R/frontends/team/ui.R: gate, SCIEX, .txt/.tsv formats, then the sheet picker.
  tags$head(tags$script(HTML(team_sheet_gate_js)),
            includeCSS(file.path(root, "www/team/css/sciex_import.css")), includeScript(file.path(root, "www/team/js/sciex_import.js")),
            includeCSS(file.path(root, "www/team/css/upload_formats.css")), includeScript(file.path(root, "www/team/js/upload_formats.js")),
            includeCSS(file.path(root, "www/team/css/sheet_picker.css")), includeScript(file.path(root, "www/team/js/sheet_picker.js"))),
  team_sciex_ui(), team_upload_formats_ui(), team_sheet_picker_ui(),
  fileInput("data_hub-files", "Abundance files", multiple = TRUE, accept = c(".csv", ".xlsx", ".xls")),
  tags$pre(id = "uploads", textOutput("uploads", inline = TRUE)))
server <- function(input, output, session) {
  team_sciex_server(input, session)
  team_upload_formats_server(input, session)
  team_sheet_picker_server(input, session)
  log <- reactiveVal(list())
  observeEvent(input[["data_hub-files"]], {
    f <- input[["data_hub-files"]]
    log(c(log(), list(lapply(seq_len(nrow(f)), function(i) list(
      name = f$name[i], md5 = unname(tools::md5sum(f$datapath[i])),
      sheets = if (team_sheet_is_excel(f$name[i])) paste(readxl::excel_sheets(f$datapath[i]), collapse = ";") else "",
      same_as_single = same_as_single(f$datapath[i], f$name[i]),
      text = if (grepl("\\.csv$", f$name[i])) paste(readLines(f$datapath[i], warn = FALSE), collapse = "\n") else NULL)))))
  })
  output$uploads <- renderText(jsonlite::toJSON(log(), auto_unbox = TRUE))
}
shinyApp(ui, server)
