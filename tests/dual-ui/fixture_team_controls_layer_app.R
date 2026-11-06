# Fixture for test_team_controls_layer_browser.cjs: the Team stylesheet stack (every includeCSS line of
# R/frontends/team/ui.R, in order, under the same bslib theme) around the controls Max's modules and the
# Team scripts render: Shiny buttons, selects (native and selectize), text/number inputs, checkboxes,
# radios, sliders, file inputs, and the plain <button>s the Team JS builds (card heads, inspector).
# A second block sits outside the Team shell (body without ts-shell-app is simulated by ?classic=1).
suppressPackageStartupMessages({library(shiny); library(bslib)})
port <- as.integer(Sys.getenv("TEAM_CONTROLS_PORT", "44120"))
ui_src <- readLines("R/frontends/team/ui.R", warn = FALSE)
css <- unique(unlist(regmatches(ui_src, gregexpr('www/team/css/[A-Za-z0-9_]+\\.css', ui_src))))
addResourcePath("team", normalizePath("www/team"))
theme <- bs_theme(version = 5, bg = "#FFFFFF", fg = "#1F1F1F", primary = "#2D5F8A", secondary = "#57819F",
  base_font = c("Nunito Sans", "sans-serif"), heading_font = c("Cormorant Garamond", "serif"))
controls <- function(p) tagList(
  div(class = "ux20-row",
    actionButton(paste0(p, "act"), "Apply settings"),
    actionButton(paste0(p, "act_icon"), "Download", icon = icon("download")),
    actionButton(paste0(p, "act_primary"), "Run", class = "btn-primary"),
    downloadButton(paste0(p, "dl"), "Download PNG"),
    tags$button(type = "button", "Plain button"),
    tags$input(type = "button", value = "Input button")),
  selectInput(paste0(p, "sel_native"), "Native select", c("Group", "Class", "Lipid"), selectize = FALSE),
  selectInput(paste0(p, "sel_selectize"), "Selectize", c("Group", "Class", "Lipid")),
  selectInput(paste0(p, "sel_multi"), "Multiple", c("PC", "PE", "TG"), multiple = TRUE, selected = "PC"),
  textInput(paste0(p, "txt"), "Title", "Volcano plot"),
  numericInput(paste0(p, "num"), "Point size", 3),
  textAreaInput(paste0(p, "area"), "Notes", "Notes"),
  checkboxInput(paste0(p, "chk"), "Show labels", TRUE),
  checkboxGroupInput(paste0(p, "chkg"), "Classes", c("PC", "PE"), selected = "PC", inline = TRUE),
  radioButtons(paste0(p, "rad"), "Scale", c("Linear", "Log10"), inline = TRUE),
  sliderInput(paste0(p, "sld"), "Alpha", 0, 1, 0.6),
  sliderInput(paste0(p, "rng"), "Range", 0, 10, c(2, 8)),
  fileInput(paste0(p, "file"), "Metadata file"),
  tags$input(type = "file", id = paste0(p, "rawfile")),
  tags$input(type = "range", min = 0, max = 10, value = 4),
  tags$input(type = "checkbox", checked = NA), tags$input(type = "radio", checked = NA))
ui <- function(req) {
  classic <- grepl("classic=1", req$QUERY_STRING %||% "")
  page_fluid(theme = theme,
    tags$head(lapply(css, function(f) tags$link(rel = "stylesheet", href = sub("^www/", "", f))),
      tags$script(HTML(if (classic) "" else "document.addEventListener('DOMContentLoaded',function(){document.body.classList.add('ts-shell-app');});"))),
    tags$section(id = "team-workspace", tags$h2("Settings"), div(id = "ux20-workspace", controls("w_"))),
    div(id = "team-canvas-root", div(class = "tc-layout",
      div(class = "tc-main", div(class = "tc-node", `data-plot-id` = "fixture-plot",
        div(class = "tc-node-head", tags$strong("Volcano"), tags$button(type = "button", "Data & settings"),
          tags$button(type = "button", "Controls"), tags$button(type = "button", "Finish plot"), tags$button(type = "button", "Remove")),
        # canvas.js: the plot card's label/background edit sits first in details.tc-settings.
        tags$details(class = "tc-settings", open = NA, tags$summary("Appearance"),
          div(class = "tc-edit", tags$label("Label ", tags$input(type = "text", value = "Volcano")), tags$label("Background ", tags$input(type = "color", value = "#ffffff"))),
          div(class = "tc-edit")))),
      tags$aside(id = "tc-selection-inspector", class = "tc-selection-inspector", div(class = "tc-inspector-header", tags$h3("Volcano"), tags$button(type = "button", "×")),
        div(class = "tc-inspector-body", div(class = "tc-settings", controls("i_")))))),
    # Structural module acyl-chain matrix (max-content wide) in a narrow Data & settings panel; its card body scrolls.
    div(class = "tc-instance-host is-open", style = "width:320px;overflow:hidden", div(class = "card-body", style = "overflow:auto",
      div(id = "fx-prop_chain_matrix_ui", class = "shiny-html-output", div(class = "prop-matrix-container", div(class = "prop-matrix-controls", tags$button(class = "btn btn-outline-info btn-sm", "Unsaturated (:1+)"),
          div(class = "ms-auto d-flex align-items-center", checkboxInput("pm_rescale", "Re-scale selected to 100%"))),
        div(class = "prop-matrix-table-wrapper", tags$table(class = "prop-matrix-table", tags$tr(lapply(0:6, function(db) tags$td(class = "prop-matrix-cell",
          tags$label(class = "prop-matrix-cell-label", tags$input(type = "checkbox", class = "prop-matrix-cb", checked = NA), paste0("22:", db))))))))))),
    # Designed controls the layer must leave pixel-identical (review of 6b3ad36).
    div(id = "ux20-designed", style = "position:fixed;left:0;top:0;z-index:2147483000;width:560px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:16px;background:#fff",
      tags$button(type = "button", class = "btn-close", `aria-label` = "Close"),
      tags$div(class = "gc-inspector", div(class = "gc-section", tags$strong("Classes"), tags$button(type = "button", class = "tc-chip", `aria-pressed` = "true", "PC"),
        tags$button(type = "button", class = "tc-chip", disabled = NA, "PE"), tags$input(type = "color", value = "#d62728"))),
      tags$div(class = "gc-section", tags$input(type = "color", value = "#1f77b4")),
      tags$div(class = "ts-stale", tags$button(type = "button", class = "ts-stale-close", "\u00d7")),
      tags$button(type = "button", class = "assistant-send", disabled = NA, "Send"),
      tags$nav(class = "ts-steps", tags$button(type = "button", class = "ts-step", tags$span("Data"), tags$small("Choose a project"))),
      div(class = "dt-buttons btn-group", tags$button(class = "btn btn-secondary buttons-csv", type = "button", tags$span("CSV"))),
      tags$input(type = "color", class = "palette-color", value = "#2ca02c"),
      # canvas.js illustration card: "Accent" well in .tc-content > .tc-edit (not the Background swatch).
      div(class = "tc-content", div(class = "tc-edit", tags$label("Accent ", tags$input(type = "color", value = "#2d5f8a"))))),
    div(id = "lipidomic-companion", class = "lipidomic-companion", tags$button(type = "button", class = "companion-toggle", "Ask"), tags$button(type = "button", "Plain companion button"), tags$input(type = "text", value = "Question")))
}
`%||%` <- function(a, b) if (is.null(a)) b else a
server <- function(input, output, session) { output$w_dl <- output$i_dl <- downloadHandler("x.txt", function(f) writeLines("x", f)) }
shiny::runApp(shinyApp(ui, server), host = "127.0.0.1", port = port, launch.browser = FALSE)
