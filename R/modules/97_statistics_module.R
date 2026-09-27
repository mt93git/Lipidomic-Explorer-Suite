# R/modules/97_statistics_module.R
# Statistics Detail Console Module

#' Reusable assets (CSS & JS) for Statistics Console theme switching
stats_console_theme_assets <- function() {
  tagList(
    tags$style(HTML("
      /* Statistics Console Theme Styling */
      .stats-console-container {
        position: relative;
        border-radius: 8px;
        transition: all 0.2s ease;
      }
      .stats-console-pre {
        font-family: 'Fira Code', 'Courier New', Courier, monospace;
        line-height: 1.5;
        margin: 0;
        overflow-x: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
        border-radius: 8px;
        transition: color 0.2s ease, background-color 0.2s ease;
      }
      /* Default Theme: Pure White font on Blackscreen (#000000) */
      .stats-console-dark {
        background-color: #000000 !important;
        border: 1px solid #334155 !important;
      }
      .stats-console-dark pre,
      .stats-console-dark.stats-console-pre,
      pre.stats-console-dark,
      .stats-console-dark .shiny-text-output {
        background-color: #000000 !important;
        color: #ffffff !important;
      }
      /* Light Theme: Pure Black font on Whitescreen (#ffffff) */
      .stats-console-light {
        background-color: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
      }
      .stats-console-light pre,
      .stats-console-light.stats-console-pre,
      pre.stats-console-light,
      .stats-console-light .shiny-text-output {
        background-color: #ffffff !important;
        color: #000000 !important;
      }
    ")),
    tags$script(HTML("
      window.toggleStatsConsoleTheme = function(isLight) {
        var theme = isLight ? 'light' : 'dark';
        try {
          localStorage.setItem('stats_console_theme', theme);
        } catch(e) {}
        window.applyStatsConsoleTheme(theme);
      };

      window.applyStatsConsoleTheme = function(theme) {
        var isLight = (theme === 'light');
        
        var switches = document.querySelectorAll('.stats-theme-switch-input');
        switches.forEach(function(el) {
          el.checked = isLight;
        });
        
        var badges = document.querySelectorAll('.stats-theme-badge');
        badges.forEach(function(el) {
          if (isLight) {
            el.className = 'badge bg-light text-dark border border-secondary stats-theme-badge';
            el.innerHTML = '<i class=\"fa fa-sun text-warning me-1\"></i> Black on White';
          } else {
            el.className = 'badge bg-dark text-white border border-secondary stats-theme-badge';
            el.innerHTML = '<i class=\"fa fa-moon me-1\"></i> White on Black';
          }
        });
        
        var containers = document.querySelectorAll('.stats-console-container');
        containers.forEach(function(el) {
          if (isLight) {
            el.classList.remove('stats-console-dark');
            el.classList.add('stats-console-light');
            el.style.backgroundColor = '#ffffff';
            el.style.borderColor = '#cbd5e1';
          } else {
            el.classList.remove('stats-console-light');
            el.classList.add('stats-console-dark');
            el.style.backgroundColor = '#000000';
            el.style.borderColor = '#334155';
          }
        });
        
        var pres = document.querySelectorAll('.stats-console-pre, #stats_modal_pre_text, #stats_console_pre');
        pres.forEach(function(el) {
          if (isLight) {
            el.classList.remove('stats-console-dark');
            el.classList.add('stats-console-light');
            el.style.backgroundColor = '#ffffff';
            el.style.color = '#000000';
          } else {
            el.classList.remove('stats-console-light');
            el.classList.add('stats-console-dark');
            el.style.backgroundColor = '#000000';
            el.style.color = '#ffffff';
          }
        });

        var textOutputs = document.querySelectorAll('.stats-console-container .shiny-text-output');
        textOutputs.forEach(function(el) {
          if (isLight) {
            el.style.color = '#000000';
            el.style.backgroundColor = '#ffffff';
          } else {
            el.style.color = '#ffffff';
            el.style.backgroundColor = '#000000';
          }
        });
      };

      window.initStatsConsoleTheme = function() {
        var saved = 'dark';
        try {
          saved = localStorage.getItem('stats_console_theme') || 'dark';
        } catch(e) {}
        window.applyStatsConsoleTheme(saved);
      };
    "))
  )
}

#' Display Statistics Modal Overlay
#'
#' Opens the publication-grade statistics console overlay dialog directly over
#' the active analysis tab without redirecting the user away from their current view.
#'
#' @param session Shiny session (parent or module)
#' @param shared_data Reactive values / shared state object
#' @param origin_tab_name String label for the originating analysis tab
show_statistics_modal <- function(session, shared_data, origin_tab_name = "Analysis Tab") {
  txt <- shared_data$stats_detail_text() %||% ""
  clean_txt <- gsub("\n#SHOW_FORMULAS#", "", txt, fixed = TRUE)
  if (clean_txt == "") {
    clean_txt <- "No statistical details are currently available for this view."
  }
  type <- shared_data$stats_detail_type() %||% "text"
  if (grepl("#SHOW_FORMULAS#", txt, fixed = TRUE)) {
    type <- "heatmap_formulas"
  }
  html_content <- shared_data$stats_detail_html()
  
  parent_sess <- if (!is.null(session$parent)) session$parent else session
  
  showModal(modalDialog(
    title = div(class = "d-flex justify-content-between align-items-center w-100 pe-2",
      div(class = "d-flex align-items-center gap-2",
        tags$span(style = "font-weight: 700; color: #2563eb; font-size: 1.05rem;", 
                  icon("terminal"), " Statistics Console"),
        tags$span(class = "badge bg-primary-subtle text-primary border border-primary-subtle", 
                  paste0("Context: ", origin_tab_name))
      ),
      div(class = "d-flex align-items-center gap-2 me-2",
        tags$div(
          class = "form-check form-switch d-flex align-items-center gap-2 m-0",
          style = "cursor: pointer;",
          tags$input(
            class = "form-check-input stats-theme-switch-input",
            type = "checkbox",
            role = "switch",
            id = "stats_modal_theme_switch",
            style = "cursor: pointer; width: 2.3em; height: 1.2em;",
            onchange = "window.toggleStatsConsoleTheme(this.checked);"
          ),
          tags$label(
            class = "form-check-label small fw-semibold user-select-none",
            `for` = "stats_modal_theme_switch",
            id = "stats_modal_theme_label",
            style = "cursor: pointer; font-size: 11.5px;",
            tags$span(id = "stats_modal_theme_badge", class = "badge bg-dark text-white border border-secondary stats-theme-badge",
                      icon("moon"), " White on Black")
          )
        )
      )
    ),
    size = "xl",
    easyClose = TRUE,
    fade = TRUE,
    footer = div(class = "d-flex justify-content-between align-items-center w-100",
      tags$button(
        class = "btn btn-sm btn-outline-primary",
        onclick = "navigator.clipboard.writeText(document.getElementById('stats_modal_pre_text').innerText); this.innerHTML = '<i class=\"fa fa-check\"></i> Copied!'; setTimeout(() => this.innerHTML = '<i class=\"fa-regular fa-copy\"></i> Copy Report', 2000);",
        icon("copy"), " Copy Report"
      ),
      modalButton(paste0("Return to ", origin_tab_name), icon = icon("arrow-left"))
    ),
    tagList(
      stats_console_theme_assets(),
      tags$p(class = "text-muted small mb-2", 
             "Mathematical calculus, parameter estimates, and degrees of freedom computed for this active view:"),
      div(
        id = "stats_modal_console_container",
        class = "stats-console-container stats-console-dark",
        style = "position: relative; background-color: #000000; border-radius: 8px; border: 1px solid #334155; margin-bottom: 15px; transition: all 0.2s ease;",
        tags$pre(
          id = "stats_modal_pre_text",
          class = "stats-console-pre stats-console-dark",
          style = "color: #ffffff; background-color: #000000; padding: 18px; font-family: 'Fira Code', 'Courier New', Courier, monospace; font-size: 11.5px; line-height: 1.5; margin: 0; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; max-height: 480px; border-radius: 8px; transition: color 0.2s ease, background-color 0.2s ease;",
          clean_txt
        )
      ),
      if (type == "heatmap_formulas" && !is.null(html_content)) tagList(
        hr(style = "margin: 20px 0; border-top: 2px dashed #dee2e6;"),
        tags$h6(style = "font-weight: bold; color: #2563eb;", icon("layer-group"), " Condensed Class Formulas"),
        tags$p(class = "text-muted small mb-3", 
               "Interactive details and condensed class formulas generated from your heatmap settings:"),
        html_content
      ) else NULL,
      tags$script(HTML("
        setTimeout(function() {
          if (typeof window.initStatsConsoleTheme === 'function') {
            window.initStatsConsoleTheme();
          }
        }, 15);
      "))
    )
  ), session = parent_sess)
}

statistics_ui <- function(id) {
  ns <- NS(id)
  tagList(
    stats_console_theme_assets(),
    card(
      card_header(
        div(class = "d-flex justify-content-between align-items-center",
          tags$span(style = "font-weight: bold; color: #0072B2; font-size: 1.2rem;", 
                    icon("terminal"), " Statistical Details Console"),
          div(class = "d-flex align-items-center gap-3",
            tags$button(
              class = "btn btn-sm btn-outline-primary",
              onclick = paste0("navigator.clipboard.writeText(document.getElementById('", ns("stats_console_pre"), "').innerText); this.innerHTML = '<i class=\"fa fa-check\"></i> Copied!'; setTimeout(() => this.innerHTML = '<i class=\"fa-regular fa-copy\"></i> Copy Report', 2000);"),
              icon("copy"), " Copy Report"
            ),
            tags$div(
              class = "form-check form-switch d-flex align-items-center gap-2 m-0",
              style = "cursor: pointer;",
              tags$input(
                class = "form-check-input stats-theme-switch-input",
                type = "checkbox",
                role = "switch",
                id = ns("stats_tab_theme_switch"),
                style = "cursor: pointer; width: 2.3em; height: 1.2em;",
                onchange = "window.toggleStatsConsoleTheme(this.checked);"
              ),
              tags$label(
                class = "form-check-label small fw-semibold user-select-none",
                `for` = ns("stats_tab_theme_switch"),
                id = ns("stats_tab_theme_label"),
                style = "cursor: pointer; font-size: 11.5px;",
                tags$span(id = ns("stats_tab_theme_badge"), class = "badge bg-dark text-white border border-secondary stats-theme-badge",
                          icon("moon"), " White on Black")
              )
            ),
            tags$span(class = "badge bg-secondary", "Active Analysis Log")
          )
        )
      ),
      card_body(
        # Always show the standard text console printout
        tags$p(class = "text-muted small mb-3", 
               "Below is the complete console printout of the mathematical calculations, parameters, degrees of freedom, and statistics computed for the selected tab. Copy this text directly for your methods section or journal supplemental files."),
        tags$div(
          id = ns("stats_tab_console_container"),
          class = "stats-console-container stats-console-dark",
          style = "position: relative; background-color: #000000; border-radius: 6px; border: 1px solid #334155; margin-bottom: 20px; transition: all 0.2s ease;",
          tags$pre(
            id = ns("stats_console_pre"),
            class = "stats-console-pre stats-console-dark",
            style = "color: #ffffff; background-color: #000000; padding: 20px; font-family: 'Fira Code', 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.5; margin: 0; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; max-height: 500px; border-radius: 6px; transition: color 0.2s ease, background-color 0.2s ease;",
            textOutput(ns("stats_console"))
          )
        ),
        # Conditionally show the HTML formulas panel below it
        uiOutput(ns("stats_formulas_panel")),
        tags$script(HTML("
          setTimeout(function() {
            if (typeof window.initStatsConsoleTheme === 'function') {
              window.initStatsConsoleTheme();
            }
          }, 15);
        "))
      )
    )
  )
}

statistics_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    
    # Observe changes to the text report to determine if we should show the formulas panel
    observe({
      txt <- shared_data$stats_detail_text()
      if (!is.null(txt) && grepl("#SHOW_FORMULAS#", txt, fixed = TRUE)) {
        shared_data$stats_detail_type("heatmap_formulas")
      } else {
        shared_data$stats_detail_type("text")
      }
    })
    
    output$stats_console <- renderText({
      txt <- shared_data$stats_detail_text()
      if (is.null(txt) || txt == "") {
        "No statistical details are currently available. Go to any analysis tab and click 'Show Statistic Detail' to inspect its computations."
      } else {
        # Clean the token so the user never sees it in the console
        gsub("\n#SHOW_FORMULAS#", "", txt, fixed = TRUE)
      }
    })

    output$stats_formulas_panel <- renderUI({
      type <- shared_data$stats_detail_type() %||% "text"
      html_content <- shared_data$stats_detail_html()
      
      if (type == "heatmap_formulas" && !is.null(html_content)) {
        tagList(
          hr(style = "margin: 30px 0; border-top: 2px dashed #dee2e6;"),
          tags$h5(style = "font-weight: bold; color: #0072B2; margin-top: 15px; margin-bottom: 5px;", 
                  icon("layer-group"), " Condensed Class Formulas"),
          tags$p(class = "text-muted small mb-3", 
                 "Below are the interactive details and condensed class formulas generated from your heatmap settings. Toggle individual classes to inspect constituent lipid species."),
          html_content
        )
      } else {
        NULL
      }
    })
  })
}
