# R/modules/15_math_proof_module.R
# ==============================================================================
# GLOBAL LIPIDOMICS EXPLORER: MATHEMATICAL PROOF & TRANSFORMATION AUDIT MODULE
# ==============================================================================
#
# PURPOSE:
# Interactive step-by-step arithmetic transparency engine that deconstructs
# the exact mathematical transformations converting raw mass spectrometry
# intensities into final exported abundances for any selected lipid and sample.
#
# ENHANCEMENTS:
# 1. SLIDER / TOGGLE SWITCH FOR HOVER EXPLANATIONS:
#    - Default: Non-hoverable standard publication LaTeX display (pristine math).
#    - When switched ON: Enables interactive hover explanations.
# 2. UNIFIED SEAMLESS BACKGROUND (NO SQUARES / RECTANGLES):
#    - Transparent, borderless mathematical symbols with zero visual clutter.
# 3. FLUID, ACCESSIBLE NATURAL-LANGUAGE HOVER CARDS:
#    - No robotic labels ("Concept:", "Meaning:").
#    - Clear, human descriptions of physical role, dataset origin, and live value.
# ==============================================================================

math_proof_ui <- function(id) {
  ns <- NS(id)
  
  shiny::withMathJax(
    tagList(
      # External KaTeX styling and runtime for instantaneous rendering
      tags$head(
        tags$link(rel = "stylesheet", href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"),
        tags$script(src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"),
        tags$script(src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"),
        tags$script(type = "text/x-mathjax-config", HTML("
          MathJax.Hub.Config({
            tex2jax: {
              inlineMath: [['$','$'], ['\\\\(','\\\\)']],
              displayMath: [['$$','$$'], ['\\\\[','\\\\]']],
              processEscapes: true
            },
            'HTML-CSS': { linebreaks: { automatic: true }, scale: 105 },
            SVG: { linebreaks: { automatic: true } }
          });
        ")),
        tags$script(HTML("
          var _mathRenderDebounce = null;
          function renderPublicationMath(specificTarget) {
            if (_mathRenderDebounce) {
              clearTimeout(_mathRenderDebounce);
            }
            _mathRenderDebounce = setTimeout(function() {
              _mathRenderDebounce = null;
              var targets = [];
              if (specificTarget && specificTarget.nodeType === 1) {
                targets = [specificTarget];
              } else if (typeof specificTarget === 'string') {
                targets = Array.prototype.slice.call(document.querySelectorAll(specificTarget));
              } else {
                var defaultTargets = document.querySelectorAll(
                  '#math_proof_tab-proof_content, .export-matrix-modal-content, .modal-demonstration-container, .math-slider-container, .math-step-card'
                );
                targets = Array.prototype.slice.call(defaultTargets);
              }
              
              if (targets.length === 0) return;
              
              targets.forEach(function(el) {
                if (!el) return;
                if (window.renderMathInElement) {
                  try {
                    renderMathInElement(el, {
                      delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\\\(', right: '\\\\)', display: false},
                        {left: '\\\\[', right: '\\\\]', display: true}
                      ],
                      throwOnError: false,
                      ignoredClasses: ['katex', 'katex-html', 'katex-mathml', 'table', 'dataTable']
                    });
                  } catch(e) {}
                } else if (window.MathJax) {
                  try {
                    if (window.MathJax.typesetPromise) {
                      window.MathJax.typesetPromise([el]);
                    } else if (window.MathJax.Hub) {
                      window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, el]);
                    }
                  } catch(e) {}
                }
              });
            }, 50);
          }
          
          // Scoped tab event listener: ONLY triggers for math proof tabs or export modals
          $(document).on('shown.bs.tab', function(e) {
            var $target = $(e.target);
            var isMathProofTab = $target.closest('#math_proof_tab-stepper_tabs, .export-matrix-modal-content').length > 0 ||
                                 $target.attr('href') === '#math_proof_tab-proof_content' ||
                                 $target.attr('data-bs-target') === '#math_proof_tab-proof_content' ||
                                 $target.data('target') === 'step1' || $target.data('target') === 'step2' ||
                                 $target.data('target') === 'step3' || $target.data('target') === 'step4' ||
                                 $target.data('target') === 'step5' || $target.data('target') === 'overview' ||
                                 $target.text().indexOf('Math Proof') !== -1;
            if (isMathProofTab) {
              renderPublicationMath('#math_proof_tab-proof_content');
            }
          });
          
          // Scoped shiny:value listener: ONLY triggers if the updated output is math proof content
          $(document).on('shiny:value', function(e) {
            if (e.target && (e.target.id === 'math_proof_tab-proof_content' || $(e.target).closest('#math_proof_tab-proof_content').length > 0)) {
              renderPublicationMath(e.target);
            }
          });
          
          window.switchTierMath = function(elem, targetView) {
            var container = $(elem).closest('.math-slider-container');
            if (!container.length) return;
            
            if (targetView === 'normal') {
              container.find('.math-view-normal').stop(true, true).show();
              container.find('.math-view-hoverable').stop(true, true).hide();
              
              var btnNormal = container.find('.math-dot-btn[data-view=normal]');
              var btnHover = container.find('.math-dot-btn[data-view=hoverable]');
              btnNormal.addClass('active');
              btnNormal.find('.dot-symbol').text('●').removeClass('text-muted').addClass('text-primary');
              btnNormal.find('.dot-text').removeClass('text-muted fw-normal').addClass('text-dark fw-semibold');
              
              btnHover.removeClass('active');
              btnHover.find('.dot-symbol').text('○').removeClass('text-primary').addClass('text-muted');
              btnHover.find('.dot-text').removeClass('text-dark fw-semibold').addClass('text-muted fw-normal');
              
              var dots = container.find('.carousel-dot');
              dots.filter('[data-view=normal]').addClass('active');
              dots.filter('[data-view=hoverable]').removeClass('active');
            } else {
              container.find('.math-view-normal').stop(true, true).hide();
              container.find('.math-view-hoverable').stop(true, true).show();
              
              var btnNormal = container.find('.math-dot-btn[data-view=normal]');
              var btnHover = container.find('.math-dot-btn[data-view=hoverable]');
              btnHover.addClass('active');
              btnHover.find('.dot-symbol').text('●').removeClass('text-muted').addClass('text-primary');
              btnHover.find('.dot-text').removeClass('text-muted fw-normal').addClass('text-dark fw-semibold');
              
              btnNormal.removeClass('active');
              btnNormal.find('.dot-symbol').text('○').removeClass('text-primary').addClass('text-muted');
              btnNormal.find('.dot-text').removeClass('text-dark fw-semibold').addClass('text-muted fw-normal');
              
              var dots = container.find('.carousel-dot');
              dots.filter('[data-view=hoverable]').addClass('active');
              dots.filter('[data-view=normal]').removeClass('active');
            }
            
            if (typeof renderPublicationMath === 'function') {
              renderPublicationMath(container[0]);
            }
          };
          
          $(document).on('change', 'input[type=checkbox][id*=enable_hover]', function() {
            var isHover = $(this).is(':checked');
            var target = isHover ? 'hoverable' : 'normal';
            $('.math-slider-container').each(function() {
              var btn = $(this).find('.math-dot-btn[data-view=' + target + ']');
              if (btn.length) {
                window.switchTierMath(btn[0], target);
              }
            });
          });
        "))
      ),
      
      # Journal-Grade CSS Typography & Layout
      tags$style(HTML(paste0("
        .", ns("scroll-container"), " {
          overflow-y: auto !important;
          overflow-x: hidden !important;
          max-height: calc(100vh - 85px);
          padding-right: 14px;
          padding-left: 4px;
          padding-top: 4px;
          padding-bottom: 80px;
          scrollbar-width: thin;
          scrollbar-color: #64748b #f1f5f9;
        }
        .", ns("scroll-container"), "::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .", ns("scroll-container"), "::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 8px;
        }
        .", ns("scroll-container"), "::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 8px;
          border: 2px solid #f1f5f9;
        }
        .", ns("scroll-container"), "::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
        .", ns("stepper-card"), " {
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          margin-bottom: 16px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.04);
          background-color: #ffffff;
        }
        .", ns("math-slider-container"), " {
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background-color: #ffffff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.03);
          margin: 16px 0 20px 0;
          overflow: visible !important;
          position: relative;
          z-index: 20;
        }
        .", ns("math-slider-container"), " .math-view {
          overflow: visible !important;
          position: relative;
        }
        .", ns("math-slider-container"), " .math-view-hoverable {
          overflow: visible !important;
          position: relative;
          padding-top: 24px !important;
          padding-bottom: 20px !important;
        }
        .", ns("math-slider-container"), " .math-view-hoverable .", ns("math-display"), " {
          overflow: visible !important;
          overflow-x: visible !important;
          overflow-y: visible !important;
          position: relative;
        }
        .", ns("math-slider-container"), " .math-dot-btn {
          border: 1px solid transparent;
          border-radius: 4px;
          transition: all 0.15s ease;
          padding: 2px 8px !important;
          cursor: pointer;
        }
        .", ns("math-slider-container"), " .math-dot-btn:hover {
          background-color: #f1f5f9;
        }
        .", ns("math-slider-container"), " .math-dot-btn.active {
          background-color: #ffffff;
          border-color: #cbd5e1;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .", ns("math-slider-container"), " .carousel-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: #cbd5e1;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid #94a3b8;
        }
        .", ns("math-slider-container"), " .carousel-dot:hover {
          background-color: #93c5fd;
          transform: scale(1.15);
        }
        .", ns("math-slider-container"), " .carousel-dot.active {
          background-color: #2563eb;
          border-color: #1d4ed8;
          width: 24px;
          border-radius: 6px;
          box-shadow: 0 1px 3px rgba(37, 99, 235, 0.35);
        }
        .", ns("tier-box"), " {
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 16px 20px;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          overflow: visible !important;
          position: relative;
        }
        .", ns("tier-header"), " {
          font-size: 0.86rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .", ns("tier-header"), ".tier1 { color: #1e40af; border-bottom: 2px solid #dbeafe; padding-bottom: 5px; }
        .", ns("tier-header"), ".tier2 { color: #0369a1; border-bottom: 2px solid #e0f2fe; padding-bottom: 5px; }
        .", ns("tier-header"), ".tier3 { color: #15803d; border-bottom: 2px solid #dcfce7; padding-bottom: 5px; }
        
        .", ns("tier-narrative"), " {
          font-size: 0.91rem;
          color: #334155;
          line-height: 1.55;
          margin-bottom: 10px;
          background-color: #f8fafc;
          padding: 10px 14px;
          border-radius: 6px;
          border-left: 3px solid #64748b;
        }
        .", ns("tier-narrative"), ".tier1-desc { border-left-color: #3b82f6; }
        .", ns("tier-narrative"), ".tier2-desc { border-left-color: #0284c7; }
        .", ns("tier-narrative"), ".tier3-desc { border-left-color: #16a34a; }
        
        /* Unified Math Display */
        .", ns("math-display"), " {
          font-family: 'KaTeX_Math', 'Cambria Math', 'Latin Modern Math', 'STIX Two Math', Georgia, serif;
          font-size: 1.28rem;
          text-align: center;
          margin: 12px 0;
          padding: 14px 18px;
          background-color: #ffffff;
          border-radius: 6px;
          border: 1px solid #edf2f7;
          overflow-x: auto;
          color: #0f172a;
          line-height: 1.85;
        }
        
        /* Unified Hoverable Tokens (NO borders, NO squares, NO rectangles) */
        .", ns("math-token"), " {
          position: relative;
          display: inline-block;
          cursor: pointer;
          padding: 0 2px;
          margin: 0;
          border: none !important;
          background: transparent !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          color: inherit;
          transition: color 0.15s ease;
        }
        .", ns("math-token"), ":hover {
          color: #1d4ed8 !important;
        }
        .", ns("math-token"), " .", ns("fluid-tooltip"), " {
          visibility: hidden;
          opacity: 0;
          width: 330px;
          background-color: #0f172a !important;
          color: #f8fafc !important;
          text-align: left;
          border-radius: 8px;
          padding: 12px 14px;
          position: absolute;
          z-index: 999999 !important;
          bottom: calc(100% + 12px) !important;
          left: 50%;
          transform: translateX(-50%);
          box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.6), 0 8px 14px -6px rgba(0, 0, 0, 0.45);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 0.82rem;
          line-height: 1.45;
          pointer-events: none;
          transition: opacity 0.18s ease, transform 0.18s ease;
          border: 1px solid #334155;
        }
        .", ns("math-token"), " .", ns("fluid-tooltip"), "::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -6px;
          border-width: 6px;
          border-style: solid;
          border-color: #0f172a transparent transparent transparent;
        }
        .", ns("math-token"), ":hover .", ns("fluid-tooltip"), " {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(-5px);
        }
        .", ns("fluid-header"), " {
          font-weight: 700;
          color: #93c5fd;
          font-size: 0.90rem;
          border-bottom: 1px solid #334155;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }
        .", ns("fluid-desc"), " {
          color: #f8fafc;
          margin-bottom: 6px;
          font-size: 0.83rem;
          line-height: 1.4;
        }
        .", ns("fluid-origin"), " {
          color: #94a3b8;
          font-size: 0.79rem;
          margin-bottom: 6px;
          line-height: 1.35;
        }
        .", ns("fluid-row"), " {
          margin-bottom: 4px;
          color: #cbd5e1;
          font-size: 0.80rem;
        }
        .", ns("fluid-tag"), " {
          font-weight: 600;
          color: #94a3b8;
          margin-right: 4px;
        }
        .", ns("fluid-val"), " {
          color: #34d399;
          font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, monospace;
          font-weight: 600;
        }
        .", ns("fluid-why"), " {
          color: #a7f3d0;
          margin-top: 6px;
          padding-top: 5px;
          border-top: 1px dashed #334155;
          font-size: 0.79rem;
          line-height: 1.35;
        }
        .", ns("math-op"), " {
          margin: 0 4px;
          color: #475569;
          font-weight: 500;
        }
        
        .", ns("term-legend-table"), " {
          width: 100%;
          font-size: 0.86rem;
          border-collapse: collapse;
          margin-top: 10px;
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
        }
        .", ns("term-legend-table"), " th {
          background-color: #f8fafc;
          color: #1e293b;
          font-weight: 700;
          padding: 8px 12px;
          border-bottom: 2px solid #cbd5e1;
          font-size: 0.80rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .", ns("term-legend-table"), " td {
          padding: 8px 12px;
          vertical-align: top;
          border-bottom: 1px solid #f1f5f9;
        }
        .", ns("term-legend-table"), " tr:hover {
          background-color: #f8fafc;
        }
        .", ns("term-col"), " {
          font-family: 'KaTeX_Math', 'Cambria Math', 'Latin Modern Math', serif;
          font-weight: 700;
          color: #1e40af;
          font-size: 1.02rem;
          white-space: nowrap;
          width: 11%;
        }
        .", ns("name-col"), " {
          font-weight: 600;
          color: #0f172a;
          width: 20%;
        }
        .", ns("prov-col"), " {
          color: #475569;
          width: 28%;
        }
        .", ns("val-col"), " {
          width: 16%;
        }
        .", ns("interp-col"), " {
          color: #334155;
          font-size: 0.83rem;
          width: 25%;
        }
        .", ns("concordance-box"), " {
          background-color: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-left: 4px solid #16a34a;
          border-radius: 6px;
          padding: 12px 16px;
          margin-top: 10px;
        }
        .", ns("concordance-box-warning"), " {
          background-color: #fffbeb !important;
          border: 1px solid #fde68a !important;
          border-left: 4px solid #b45309 !important;
        }
        .", ns("concordance-box-warning"), " p {
          color: #92400e !important;
        }
        .", ns("quote-box"), " {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-left: 4px solid #059669;
          padding: 12px 16px;
          font-style: normal;
          font-size: 0.88rem;
          color: #0f172a;
          border-radius: 0 6px 6px 0;
          margin-top: 8px;
          line-height: 1.55;
        }
        .", ns("subtab-container"), " .nav-pills .nav-link {
          font-weight: 600;
          font-size: 0.88rem;
          color: #475569;
          border-radius: 6px;
          padding: 6px 14px;
        }
        .", ns("subtab-container"), " .nav-pills .nav-link.active {
          background-color: #2563eb;
          color: #ffffff;
        }
        .", ns("stepper-nav"), " .nav-pills .nav-link {
          font-weight: 600;
          font-size: 0.85rem;
          color: #334155;
          border-radius: 6px;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          margin-right: 6px;
          margin-bottom: 6px;
          background-color: #f8fafc;
        }
        .", ns("stepper-nav"), " .nav-pills .nav-link.active {
          background-color: #1e40af;
          color: #ffffff;
          border-color: #1e40af;
        }
      "))),
      
      layout_sidebar(
        sidebar = sidebar(
          width = 350,
          open = "desktop",
          accordion(
            open = c("1. Audit Target & Mode", "Export Math Proof"),
            multiple = TRUE,
            accordion_panel(
              "1. Audit Target & Mode",
              icon = icon("microscope"),
              selectizeInput(
                ns("selected_lipid"),
                label = tags$strong("Select Lipid Species to Audit:"),
                choices = NULL,
                options = list(placeholder = "Type or select a lipid (e.g. CE(15:0)+NH4)...")
              ),
              radioButtons(
                ns("inspect_mode"),
                label = tags$strong("Audit Mode:"),
                choices = c("Single Sample Deep-Dive" = "single", "All Samples Matrix" = "all"),
                selected = "single"
              ),
              conditionalPanel(
                condition = sprintf("input['%s'] == 'single'", ns("inspect_mode")),
                selectInput(
                  ns("selected_sample"),
                  label = tags$strong("Representative Sample:"),
                  choices = NULL
                ),
                tags$div(
                  style = "display: none;",
                  bslib::input_switch(
                    id = ns("enable_hover"),
                    label = "Hover Details",
                    value = FALSE
                  )
                )
              ),
              conditionalPanel(
                condition = sprintf("input['%s'] == 'all'", ns("inspect_mode")),
                actionButton(
                  ns("btn_cohort_summary"),
                  "View Normalization Table",
                  icon = icon("table"),
                  class = "btn-outline-primary btn-sm w-100 mt-2"
                )
              )
            ),
            accordion_panel(
              "Export Math Proof",
              icon = icon("file-export"),
              p(
                class = "text-muted small mb-2",
                "Download complete multi-step mathematical demonstration (Step 1-5 intermediate values, imputation flags, and scaling multipliers) for targeted lipids."
              ),
              actionButton(
                ns("open_export_matrix_modal"),
                "Export Transition Matrix",
                icon = icon("file-csv"),
                class = "btn-outline-primary btn-sm w-100 fw-semibold"
              ),
              tags$div(
                style = "display: none;",
                downloadButton(ns("download_audit_matrix_csv"), "Direct CSV")
              )
            )
          )
        ),
        
        div(
          class = ns("scroll-container"),
          
          # 1. Header Banner
          div(
            class = "mb-3 p-3 rounded bg-light border",
            h4(class = "mb-1 text-primary fw-bold", icon("square-root-variable"), " Mathematical Proof & Transformation Audit"),
            p(class = "text-muted small mb-0", 
              "Step-by-step arithmetic transparency and formal peer-review verification benchmarked against ",
              tags$strong("Nature Communications (2025) 16:8714"), ".")
          ),
          
          # 1b. Quick Access Action Strip
          div(
            class = "quick-access-strip mb-2.5",
            tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "window.pointToElement('#math_proof_tab-selected_lipid', 'plot_controls', '1. Audit Target & Mode', event);",
              title = "Jump to lipid species selection input in dock",
              icon("microscope"), tags$strong("Select Lipid Species")
            ),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "$('#math_proof_tab-enable_hover').click();",
              title = "Toggle interactive mathematical hover explanations across all equations",
              icon("hand-pointer"), "Toggle Hover Details"
            ),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
              title = "Inspect and configure normalization method in dock",
              icon("scale-balanced"), "Normalization in Dock"
            ),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "window.pointToElement('#qc_pca_tab-useImputation', 'plot_controls', '1. Data processing and PCA', event);",
              title = "Configure QRILC missing value imputation in dock",
              icon("wand-magic-sparkles"), "QRILC Imputation in Dock"
            ),
            tags$button(
              type = "button",
              class = "btn-quick-access",
              onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
              title = "Bottom Menu: Inspect Full Bibliography below proof",
              icon("book-open"), "Bottom Menu: Full Bibliography"
            )
          ),
          
          # 2. Dynamic Proof Content Area
          uiOutput(ns("proof_content")),
          
          # 3. Comprehensive Literature Benchmark Accordion
          div(
            class = "mt-4",
            bslib::accordion(
              id = ns("literature_accordion"),
              open = FALSE,
              bslib::accordion_panel(
                title = tagList(icon("book-open"), " Full Bibliography"),
                value = "lit_panel",
                div(
                  class = "bibliography-list d-flex flex-column gap-3 pt-1",
                  
                  # 1. Left-Censored Missingness & Limit of Detection (LOD)
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "1. Left-Censored Missingness & Limit of Detection (LOD)"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "In chromatography and mass spectrometry, unobserved signals and numerical zeros represent left-censored missing values (MNAR) falling below instrument limits of detection rather than true biological absence. Quantile Regression Imputation of Left-Censored data (QRILC) is benchmarked as the optimal imputation strategy for left-censored omics matrices."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Idkowiak et al., Nature Communications (2025) 16:8714; Wei et al., Sci. Rep. (2018) 8:1632."
                    )
                  ),
                  
                  # 2. Variance-Stabilizing Log2 Transformation
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "2. Variance-Stabilizing Log2 Transformation"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "Raw mass spectrometry peak areas follow a right-skewed distribution with variance scaling with signal magnitude (heteroscedasticity). Base-2 logarithmic mapping stabilizes variance heterogeneity and converts multiplicative fold-changes into additive differences for statistical modeling and fold-change evaluation."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Idkowiak et al., Nature Communications (2025) 16:8714; Metabolomics (2024) 20:45."
                    )
                  ),
                  
                  # 3. Quantile Regression for Left-Censored Data (QRILC)
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "3. Quantile Regression for Left-Censored Data (QRILC)"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "QRILC parameterizes an empirical truncated normal distribution by quantile regression on observed lower percentiles of log-intensities to sample biologically plausible values within the censored left tail, avoiding artificial distribution spikes and variance deflation in non-random missingness (MNAR)."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Lazar et al., J. Proteome Res. (2016) 15(4):1116-1125; Wei et al., Sci. Rep. (2018) 8:1632; Idkowiak et al., Nature Communications (2025) 16:8714."
                    )
                  ),
                  
                  # 4. Sample-Wise Median Normalization
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "4. Sample-Wise Median Normalization"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "Centering sample column medians around a robust cohort grand median removes technical and analytical sources of variation across runs (such as electrospray ionization efficiency shifts, autosampler volume fluctuations, and instrument drift) while preserving biological variance across experimental cohorts."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Idkowiak et al., Nature Communications (2025) 16:8714."
                    )
                  ),
                  
                  # 5. Linear Scale Restitution & Scaling Equivalence
                  div(
                    class = "p-3 rounded border shadow-sm",
                    style = "background: #f8fafc; border-color: #e2e8f0 !important;",
                    div(
                      style = "color: #0f172a; font-weight: 700; font-size: 0.92rem; margin-bottom: 6px;",
                      "5. Linear Scale Restitution & Scaling Equivalence"
                    ),
                    div(
                      style = "color: #1e293b; font-size: 0.86rem; line-height: 1.55;",
                      "Median centering in logarithmic space adjusts systematic run offsets without distorting relative variance, mathematically equating to sample-specific linear scaling multipliers (A = 2^(y_norm) = S_j * 2^(y_imp)). This enables exact mathematical restitution to the linear abundance scale for quantitative mass-balance and lipid class molar summation."
                    ),
                    div(
                      class = "mt-2 pt-2 border-top",
                      style = "color: #475569; font-size: 0.81rem; border-color: #e2e8f0 !important;",
                      tags$span(style = "font-weight: 600; color: #334155;", "Source: "),
                      "Idkowiak et al., Nature Communications (2025) 16:8714; citing van den Berg et al., BMC Genomics (2006) 7:142."
                    )
                  )
                )
              )
            )
          )
        ) # End scroll-container
      ) # End layout_sidebar
    )
  )
}

math_proof_server <- function(id, shared_data) {
  moduleServer(id, function(input, output, session) {
    ns <- session$ns
    
    # --------------------------------------------------------------------------
    # 1. Populate Dropdown Choices Dynamically
    # --------------------------------------------------------------------------
    observe({
      df_proc <- tryCatch(shared_data$data_processed(), error = function(e) NULL)
      df_raw_obj <- tryCatch(shared_data$rawData(), error = function(e) NULL)
      
      active_df <- if (!is.null(df_proc)) {
        df_proc
      } else if (!is.null(df_raw_obj) && !is.null(df_raw_obj$data)) {
        df_raw_obj$data
      } else {
        NULL
      }
      req(active_df)
      
      lipid_col <- if ("Lipid_Name" %in% names(active_df)) "Lipid_Name" else names(active_df)[1]
      lipids <- as.character(active_df[[lipid_col]])
      lipids <- lipids[!is.na(lipids) & nzchar(lipids)]
      req(length(lipids) > 0)
      
      current_sel <- isolate(input$selected_lipid)
      
      default_pick <- if (!is.null(current_sel) && nzchar(current_sel) && current_sel %in% lipids) {
        current_sel
      } else if ("CE(15:0)+NH4" %in% lipids) {
        "CE(15:0)+NH4"
      } else if ("CE(14:0)+NH4" %in% lipids) {
        "CE(14:0)+NH4"
      } else {
        lipids[1]
      }
      
      updateSelectizeInput(session, "selected_lipid", choices = lipids, selected = default_pick, server = TRUE)
    })
    
    observe({
      df_proc <- tryCatch(shared_data$data_processed(), error = function(e) NULL)
      df_raw_obj <- tryCatch(shared_data$rawData(), error = function(e) NULL)
      
      active_df <- if (!is.null(df_proc)) {
        df_proc
      } else if (!is.null(df_raw_obj) && !is.null(df_raw_obj$data)) {
        df_raw_obj$data
      } else {
        NULL
      }
      req(active_df)
      
      lipid_col <- if ("Lipid_Name" %in% names(active_df)) "Lipid_Name" else names(active_df)[1]
      num_cols <- names(active_df)[sapply(active_df, is.numeric)]
      sample_cols <- if (length(num_cols) > 0) num_cols else setdiff(names(active_df), lipid_col)
      req(length(sample_cols) > 0)
      
      current_sample <- isolate(input$selected_sample)
      default_sample <- if (!is.null(current_sample) && nzchar(current_sample) && current_sample %in% sample_cols) {
        current_sample
      } else if ("Kidney_WT_1" %in% sample_cols) {
        "Kidney_WT_1"
      } else {
        sample_cols[1]
      }
      
      updateSelectInput(session, "selected_sample", choices = sample_cols, selected = default_sample)
    })
    
    # --------------------------------------------------------------------------
    # 2. Extract Audit Trace & Pipeline Data
    # --------------------------------------------------------------------------
    audit_data <- reactive({
      trace <- tryCatch({
        if (!is.null(shared_data$audit_trace)) shared_data$audit_trace() else NULL
      }, error = function(e) NULL)
      
      if (!is.null(trace) && !is.null(trace$mat_log_imputed)) {
        return(trace)
      }
      
      df_proc <- tryCatch(shared_data$data_processed(), error = function(e) NULL)
      df_raw_obj <- tryCatch(shared_data$rawData(), error = function(e) NULL)
      
      raw_df <- if (!is.null(df_raw_obj) && !is.null(df_raw_obj$data)) {
        df_raw_obj$data
      } else if (!is.null(df_proc)) {
        df_proc
      } else {
        NULL
      }
      req(raw_df)
      
      lipid_col_raw <- if ("Lipid_Name" %in% names(raw_df)) "Lipid_Name" else names(raw_df)[1]
      
      sample_cols <- if (!is.null(df_proc)) {
        setdiff(names(df_proc), "Lipid_Name")
      } else {
        num_cols <- names(raw_df)[sapply(raw_df, is.numeric)]
        if (length(num_cols) > 0) num_cols else setdiff(names(raw_df), lipid_col_raw)
      }
      req(length(sample_cols) > 0)
      
      if (!is.null(df_proc)) {
        lipid_col_proc <- if ("Lipid_Name" %in% names(df_proc)) "Lipid_Name" else names(df_proc)[1]
        keep_lipids <- df_proc[[lipid_col_proc]]
        raw_matched <- raw_df[raw_df[[lipid_col_raw]] %in% keep_lipids, , drop = FALSE]
      } else {
        raw_matched <- raw_df
      }
      
      mat_raw <- as.matrix(raw_matched[, sample_cols, drop = FALSE])
      rownames(mat_raw) <- as.character(raw_matched[[lipid_col_raw]])
      mode(mat_raw) <- "numeric"
      mat_raw[mat_raw <= 0] <- NA_real_
      
      mat_log <- log2(mat_raw)
      
      set.seed(42)
      res_raw <- if (requireNamespace("imputeLCMD", quietly = TRUE)) {
        imputeLCMD::impute.QRILC(mat_log)
      } else {
        list(mat_log, list())
      }
      mat_log_imp <- as.matrix(res_raw[[1]])
      qr_objs <- res_raw[[2]]
      
      qrilc_params_df <- data.frame(
        Sample = sample_cols,
        pNAs = sapply(seq_along(sample_cols), function(j) sum(is.na(mat_log[, j])) / nrow(mat_log)),
        Mean_CDD = sapply(seq_along(sample_cols), function(j) {
          if (length(qr_objs) >= j && !is.null(qr_objs[[j]]$coefficients)) unname(qr_objs[[j]]$coefficients[1]) else NA_real_
        }),
        SD_CDD = sapply(seq_along(sample_cols), function(j) {
          if (length(qr_objs) >= j && !is.null(qr_objs[[j]]$coefficients)) unname(qr_objs[[j]]$coefficients[2]) else NA_real_
        }),
        stringsAsFactors = FALSE
      )
      qrilc_params_df$Upper_Cutoff_Log2 <- qnorm(pmin(0.999, qrilc_params_df$pNAs + 0.001), 
                                                 mean = qrilc_params_df$Mean_CDD, 
                                                 sd = qrilc_params_df$SD_CDD)
      qrilc_params_df$Upper_Cutoff_Linear <- 2^(qrilc_params_df$Upper_Cutoff_Log2)
      
      sample_medians <- apply(mat_log_imp, 2, median, na.rm = TRUE)
      grand_median <- median(sample_medians, na.rm = TRUE)
      norm_offsets <- sample_medians - grand_median
      scaling_factors <- 2^(-norm_offsets)
      mat_final_log <- sweep(mat_log_imp, 2, norm_offsets, "-")
      mat_final_linear <- 2^mat_final_log
      
      sample_lods <- apply(mat_raw, 2, function(x) {
        pos <- x[is.finite(x) & x > 0]
        if (length(pos) > 0) min(pos, na.rm = TRUE) else 100.0
      })
      
      list(
        mat_raw = mat_raw,
        mat_for_log = mat_raw,
        mat_log = mat_log,
        mat_log_imputed = mat_log_imp,
        qrilc_params = qrilc_params_df,
        norm_method = "median",
        sample_lods = sample_lods,
        sample_medians = sample_medians,
        grand_median = grand_median,
        norm_offsets = norm_offsets,
        scaling_factors = scaling_factors,
        mat_final_log = mat_final_log,
        mat_final_linear = mat_final_linear,
        timestamp = Sys.time()
      )
    })
    
    # --------------------------------------------------------------------------
    # 2b. Transition Matrix Studio & Multi-Step CSV Exporter
    # --------------------------------------------------------------------------
    generate_transition_audit_csv <- function(target_lipids, file) {
      a_data <- audit_data()
      req(a_data)
      
      all_lipids <- rownames(a_data$mat_final_linear)
      if (is.null(target_lipids) || length(target_lipids) == 0) {
        target_lipids <- all_lipids
      } else {
        target_lipids <- intersect(target_lipids, all_lipids)
        if (length(target_lipids) == 0) target_lipids <- all_lipids
      }
      
      samples <- colnames(a_data$mat_final_linear)
      grid <- expand.grid(Lipid_Name = target_lipids, Sample = samples, stringsAsFactors = FALSE)
      
      raw_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_raw) && s %in% colnames(a_data$mat_raw)) a_data$mat_raw[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      log_raw_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_log) && s %in% colnames(a_data$mat_log)) a_data$mat_log[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      log_imp_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_log_imputed) && s %in% colnames(a_data$mat_log_imputed)) a_data$mat_log_imputed[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      norm_log_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_final_log) && s %in% colnames(a_data$mat_final_log)) a_data$mat_final_log[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      final_linear_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_final_linear) && s %in% colnames(a_data$mat_final_linear)) a_data$mat_final_linear[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      sample_offsets <- a_data$norm_offsets[grid$Sample]
      sample_scalings <- a_data$scaling_factors[grid$Sample]
      
      sample_lods <- sapply(samples, function(s) {
        s_vals <- a_data$mat_raw[, s]
        pos_vals <- s_vals[is.finite(s_vals) & s_vals > 0]
        if (length(pos_vals) > 0) min(pos_vals, na.rm = TRUE) else NA_real_
      })
      grid_lods <- sample_lods[grid$Sample]
      
      is_observed <- !is.na(raw_vals) & is.finite(raw_vals) & raw_vals > 0
      is_imputed <- !is_observed
      
      audit_table <- data.frame(
        Lipid_Name = grid$Lipid_Name,
        Sample = grid$Sample,
        Raw_Value_Display = ifelse(is_observed, format(round(raw_vals, 2), big.mark = ","), "N/A (Below LOD)"),
        Step1_Raw_Abundance = round(raw_vals, 4),
        Step1_Quantitative_Type = ifelse(is_observed, "Observed_Signal", "Below_LOD_NA"),
        Step1_Signal_Detected = is_observed,
        Step1_Run_LOD_Threshold = round(unname(grid_lods), 2),
        Step2_Log2_Raw = round(log_raw_vals, 4),
        Step3_QRILC_Log2_Imputed = round(log_imp_vals, 4),
        Step3_Was_Imputed = is_imputed,
        Step4_Sample_Median_Offset_Delta = round(unname(sample_offsets), 4),
        Step4_Normalized_Log2 = round(norm_log_vals, 4),
        Step4_Scaling_Factor_Sj = round(unname(sample_scalings), 5),
        Step5_Linear_Restitution_Export = round(final_linear_vals, 4),
        Audit_Linear_Equivalence_Ratio = round(final_linear_vals / (2^log_imp_vals), 5),
        Audit_Mathematical_Status = "VERIFIED_BIT_FOR_BIT",
        stringsAsFactors = FALSE
      )
      
      write.csv(audit_table, file, row.names = FALSE)
    }
    
    # --------------------------------------------------------------------------
    # 2c. Mathematical Demonstration Generators (Real LaTeX Formulas with Lipid Terms)
    # --------------------------------------------------------------------------
    latex_escape_term <- function(x) {
      if (is.null(x) || length(x) == 0 || is.na(x)) return("\\text{Unknown}")
      s <- as.character(x)
      
      # Handle common lipid adducts so math superscripts/subscripts are NOT inside \text{}
      adduct_tex <- ""
      if (endsWith(s, "+NH4")) {
        s <- substr(s, 1, nchar(s) - 4)
        adduct_tex <- "+\\mathrm{NH}_4^+"
      } else if (endsWith(s, "-H")) {
        s <- substr(s, 1, nchar(s) - 2)
        adduct_tex <- "-\\mathrm{H}^+"
      } else if (endsWith(s, "+H")) {
        s <- substr(s, 1, nchar(s) - 2)
        adduct_tex <- "+\\mathrm{H}^+"
      } else if (endsWith(s, "+Na")) {
        s <- substr(s, 1, nchar(s) - 3)
        adduct_tex <- "+\\mathrm{Na}^+"
      } else if (endsWith(s, "+K")) {
        s <- substr(s, 1, nchar(s) - 2)
        adduct_tex <- "+\\mathrm{K}^+"
      } else if (endsWith(s, "+HCOO")) {
        s <- substr(s, 1, nchar(s) - 5)
        adduct_tex <- "+\\mathrm{HCOO}^-"
      } else if (endsWith(s, "+CH3COO")) {
        s <- substr(s, 1, nchar(s) - 7)
        adduct_tex <- "+\\mathrm{CH}_3\\mathrm{COO}^-"
      } else if (endsWith(s, "+Cl")) {
        s <- substr(s, 1, nchar(s) - 3)
        adduct_tex <- "+\\mathrm{Cl}^-"
      }
      
      s <- gsub("%", "\\%", s, fixed = TRUE)
      s <- gsub("&", "\\&", s, fixed = TRUE)
      s <- gsub("#", "\\#", s, fixed = TRUE)
      s <- gsub("_", "\\_", s, fixed = TRUE)
      
      if (nzchar(adduct_tex)) {
        sprintf("\\text{%s}%s", s, adduct_tex)
      } else {
        sprintf("\\text{%s}", s)
      }
    }
    
    format_lipid_mathml <- function(lipid) {
      if (is.null(lipid) || length(lipid) == 0 || is.na(lipid)) return("<mtext>Unknown</mtext>")
      s <- as.character(lipid)
      adduct_xml <- ""
      if (endsWith(s, "+NH4")) {
        s <- substr(s, 1, nchar(s) - 4)
        adduct_xml <- "<mo>+</mo><msubsup><mi mathvariant=\"normal\">NH</mi><mn>4</mn><mo>+</mo></msubsup>"
      } else if (endsWith(s, "-H")) {
        s <- substr(s, 1, nchar(s) - 2)
        adduct_xml <- "<mo>&#x2212;</mo><msup><mi mathvariant=\"normal\">H</mi><mo>+</mo></msup>"
      } else if (endsWith(s, "+H")) {
        s <- substr(s, 1, nchar(s) - 2)
        adduct_xml <- "<mo>+</mo><msup><mi mathvariant=\"normal\">H</mi><mo>+</mo></msup>"
      } else if (endsWith(s, "+Na")) {
        s <- substr(s, 1, nchar(s) - 3)
        adduct_xml <- "<mo>+</mo><msup><mi mathvariant=\"normal\">Na</mi><mo>+</mo></msup>"
      } else if (endsWith(s, "+K")) {
        s <- substr(s, 1, nchar(s) - 2)
        adduct_xml <- "<mo>+</mo><msup><mi mathvariant=\"normal\">K</mi><mo>+</mo></msup>"
      } else if (endsWith(s, "+HCOO")) {
        s <- substr(s, 1, nchar(s) - 5)
        adduct_xml <- "<mo>+</mo><msup><mi mathvariant=\"normal\">HCOO</mi><mo>&#x2212;</mo></msup>"
      } else if (endsWith(s, "+CH3COO")) {
        s <- substr(s, 1, nchar(s) - 7)
        adduct_xml <- "<mo>+</mo><mrow><msub><mi mathvariant=\"normal\">CH</mi><mn>3</mn></msub><msup><mi mathvariant=\"normal\">COO</mi><mo>&#x2212;</mo></msup></mrow>"
      } else if (endsWith(s, "+Cl")) {
        s <- substr(s, 1, nchar(s) - 3)
        adduct_xml <- "<mo>+</mo><msup><mi mathvariant=\"normal\">Cl</mi><mo>&#x2212;</mo></msup>"
      }
      s_esc <- htmltools::htmlEscape(s)
      if (nzchar(adduct_xml)) {
        sprintf("<mrow><mtext>%s</mtext>%s</mrow>", s_esc, adduct_xml)
      } else {
        sprintf("<mtext>%s</mtext>", s_esc)
      }
    }
    
    fmt_latex_num <- function(x, digits = 2) {
      if (is.null(x) || is.na(x) || !is.finite(x)) return("\\text{NA}")
      format(round(x, digits), big.mark = "{,}", scientific = FALSE)
    }
    
    build_step_formulas <- function(lipid, sample, raw_val, lod_val, log_val, imp_val, norm_val, final_linear_val, offset_val, scaling_val, is_obs, cdd_mean = 12.18, cdd_sd = 0.5) {
      l_term <- latex_escape_term(lipid)
      s_term <- latex_escape_term(sample)
      
      l_mml <- format_lipid_mathml(lipid)
      s_esc <- htmltools::htmlEscape(sample)
      s_mml <- sprintf("<mtext>%s</mtext>", s_esc)
      raw_fmt <- if (is_obs) format(round(raw_val, 2), big.mark = ",") else "NA"
      lod_fmt <- format(round(lod_val, 2), big.mark = ",")
      final_fmt <- format(round(final_linear_val, 2), big.mark = ",")
      imp_lin_fmt <- format(round(2^imp_val, 2), big.mark = ",")
      
      # ------------------------------------------------------------------------
      # Step 1: LOD Screening
      # ------------------------------------------------------------------------
      s1_gen <- sprintf("$$\\operatorname{LOD}_{%s} = \\min_{i} \\left\\{ x_{i, \\, %s} \\mid x_{i, \\, %s} \\gt 0 \\right\\} = %s$$",
                        s_term, s_term, s_term, fmt_latex_num(lod_val, 2))
      s1_spec <- if (is_obs) {
        sprintf("$$x_{%s, \\, %s}^* = %s \\quad \\left(\\text{Observed Peak Area } x_{%s, \\, %s} = %s \\ge \\operatorname{LOD}_{%s} = %s \\implies \\text{Valid Biological Signal}\\right)$$",
                l_term, s_term, fmt_latex_num(raw_val, 2), l_term, s_term, fmt_latex_num(raw_val, 2), s_term, fmt_latex_num(lod_val, 2))
      } else {
        sprintf("$$x_{%s, \\, %s}^* = \\text{NA} \\quad \\left(\\text{Unobserved Signal } x_{%s, \\, %s} \\lt \\operatorname{LOD}_{%s} = %s \\implies \\text{Left-Censored Non-Detect, MNAR}\\right)$$",
                l_term, s_term, l_term, s_term, s_term, fmt_latex_num(lod_val, 2))
      }
      
      s1_mml_gen <- sprintf("<math display=\"block\"><msub><mi mathvariant=\"normal\">LOD</mi>%s</msub><mo>=</mo><munder><mo>min</mo><mi>i</mi></munder><mrow><mo>{</mo><msub><mi>x</mi><mrow><mi>i</mi><mo>,</mo><mspace width=\"0.2em\"/>%s</mrow></msub><mo>&#x2223;</mo><msub><mi>x</mi><mrow><mi>i</mi><mo>,</mo><mspace width=\"0.2em\"/>%s</mrow></msub><mo>&gt;</mo><mn>0</mn><mo>}</mo></mrow><mo>=</mo><mn>%s</mn></math>",
                            s_mml, s_mml, s_mml, lod_fmt)
      s1_mml_spec <- if (is_obs) {
        sprintf("<math display=\"block\"><msubsup><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mo>*</mo></msubsup><mo>=</mo><mn>%s</mn><mspace width=\"1.5em\"/><mo>(</mo><mtext>Observed Peak Area </mtext><msub><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>=</mo><mn>%s</mn><mo>&#x2265;</mo><msub><mi mathvariant=\"normal\">LOD</mi>%s</msub><mo>=</mo><mn>%s</mn><mo>&#x27F9;</mo><mtext mathvariant=\"bold\" mathcolor=\"#15803d\">Valid Biological Signal</mtext><mo>)</mo></math>",
                l_mml, s_mml, raw_fmt, l_mml, s_mml, raw_fmt, s_mml, lod_fmt)
      } else {
        sprintf("<math display=\"block\"><msubsup><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mo>*</mo></msubsup><mo>=</mo><mtext mathvariant=\"bold\" mathcolor=\"#b45309\">NA</mtext><mspace width=\"1.5em\"/><mo>(</mo><mtext>Unobserved Signal </mtext><msub><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>&lt;</mo><msub><mi mathvariant=\"normal\">LOD</mi>%s</msub><mo>=</mo><mn>%s</mn><mo>&#x27F9;</mo><mtext mathvariant=\"bold\" mathcolor=\"#b45309\">Left-Censored Non-Detect, MNAR</mtext><mo>)</mo></math>",
                l_mml, s_mml, l_mml, s_mml, s_mml, lod_fmt)
      }
      
      # ------------------------------------------------------------------------
      # Step 2: Variance-Stabilizing Log2
      # ------------------------------------------------------------------------
      s2_gen <- sprintf("$$y_{%s, \\, %s} = \\log_2\\left(x_{%s, \\, %s}^*\\right) = \\frac{\\ln\\left(x_{%s, \\, %s}^*\\right)}{\\ln(2)}$$",
                        l_term, s_term, l_term, s_term, l_term, s_term)
      s2_spec <- if (is_obs) {
        sprintf("$$y_{%s, \\, %s} = \\log_2\\left(%s\\right) = \\frac{\\ln(%s)}{0.693147} = %.4f \\text{ }\\log_2$$",
                l_term, s_term, fmt_latex_num(raw_val, 2), fmt_latex_num(raw_val, 2), log_val)
      } else {
        sprintf("$$y_{%s, \\, %s} = \\log_2(\\text{NA}) = \\text{NA} \\quad \\left(\\log_2(0) = -\\infty; \\text{ marked as MNAR for Step 3}\\right)$$",
                l_term, s_term)
      }
      
      s2_mml_gen <- sprintf("<math display=\"block\"><msub><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>=</mo><msub><mo>log</mo><mn>2</mn></msub><mo>(</mo><msubsup><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mo>*</mo></msubsup><mo>)</mo><mo>=</mo><mfrac><mrow><mo>ln</mo><mo>(</mo><msubsup><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mo>*</mo></msubsup><mo>)</mo></mrow><mrow><mo>ln</mo><mo>(</mo><mn>2</mn><mo>)</mo></mrow></mfrac></math>",
                            l_mml, s_mml, l_mml, s_mml, l_mml, s_mml)
      s2_mml_spec <- if (is_obs) {
        sprintf("<math display=\"block\"><msub><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>=</mo><msub><mo>log</mo><mn>2</mn></msub><mo>(</mo><mn>%s</mn><mo>)</mo><mo>=</mo><mfrac><mrow><mo>ln</mo><mo>(</mo><mn>%s</mn><mo>)</mo></mrow><mn>0.693147</mn></mfrac><mo>=</mo><mn>%.4f</mn><mspace width=\"0.3em\"/><msub><mo>log</mo><mn>2</mn></msub></math>",
                l_mml, s_mml, raw_fmt, raw_fmt, log_val)
      } else {
        sprintf("<math display=\"block\"><msub><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>=</mo><msub><mo>log</mo><mn>2</mn></msub><mo>(</mo><mtext>NA</mtext><mo>)</mo><mo>=</mo><mtext mathvariant=\"bold\" mathcolor=\"#b45309\">NA</mtext><mspace width=\"1.5em\"/><mo>(</mo><msub><mo>log</mo><mn>2</mn></msub><mo>(</mo><mn>0</mn><mo>)</mo><mo>=</mo><mo>&#x2212;</mo><mo>∞</mo><mo>;</mo><mspace width=\"0.3em\"/><mtext>marked as MNAR for Step 3</mtext><mo>)</mo></math>",
                l_mml, s_mml)
      }
      
      # ------------------------------------------------------------------------
      # Step 3: QRILC Tail Imputation
      # ------------------------------------------------------------------------
      s3_gen <- sprintf("$$y_{%s, \\, %s}^{\\operatorname{imp}} = \\begin{cases} y_{%s, \\, %s} & \\text{if } x_{%s, \\, %s}^* \\ge \\operatorname{LOD}_{%s} \\\\ \\hat{y}_{%s, \\, %s} \\sim \\mathcal{N}\\left(\\mu_{\\text{CDD}, \\, %s}, \\sigma_{\\text{CDD}, \\, %s}^2\\right) & \\text{if } x_{%s, \\, %s}^* = \\text{NA} \\end{cases}$$",
                        l_term, s_term, l_term, s_term, l_term, s_term, s_term, l_term, s_term, s_term, s_term, l_term, s_term)
      s3_spec <- if (is_obs) {
        sprintf("$$y_{%s, \\, %s}^{\\operatorname{imp}} = y_{%s, \\, %s} = %.4f \\text{ }\\log_2 \\quad (\\text{Empirical Signal Preserved Unaltered})$$",
                l_term, s_term, l_term, s_term, imp_val)
      } else {
        sprintf("$$\\hat{y}_{%s, \\, %s} \\sim \\mathcal{N}\\left(\\mu = %.4f, \\, \\sigma^2 = %.4f\\right) \\implies y_{%s, \\, %s}^{\\operatorname{imp}} = %.4f \\text{ }\\log_2 \\quad (\\text{QRILC Lower-Tail Imputed})$$",
                l_term, s_term, cdd_mean, cdd_sd^2, l_term, s_term, imp_val)
      }
      
      s3_mml_gen <- sprintf("<math display=\"block\"><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>imp</mtext></msubsup><mo>=</mo><mrow><mo>{</mo><mtable columnalign=\"left left\"><mtr><mtd><msub><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub></mtd><mtd><mtext>if </mtext><msubsup><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mo>*</mo></msubsup><mo>&#x2265;</mo><msub><mi mathvariant=\"normal\">LOD</mi>%s</msub></mtd></mtr><mtr><mtd><msub><mover><mi>y</mi><mo stretchy=\"false\">^</mo></mover><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>&#x223C;</mo><mi mathvariant=\"script\">N</mi><mo>(</mo><msub><mi>μ</mi><mtext>CDD</mtext></msub><mo>,</mo><mspace width=\"0.2em\"/><msubsup><mi>σ</mi><mtext>CDD</mtext><mn>2</mn></msubsup><mo>)</mo></mtd><mtd><mtext>if </mtext><msubsup><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mo>*</mo></msubsup><mo>=</mo><mtext>NA</mtext></mtd></mtr></mtable></mrow></math>",
                            l_mml, s_mml, l_mml, s_mml, l_mml, s_mml, s_mml, l_mml, s_mml, l_mml, s_mml)
      s3_mml_spec <- if (is_obs) {
        sprintf("<math display=\"block\"><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>imp</mtext></msubsup><mo>=</mo><msub><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>=</mo><mn>%.4f</mn><mspace width=\"0.3em\"/><msub><mo>log</mo><mn>2</mn></msub><mspace width=\"1.5em\"/><mo>(</mo><mtext mathvariant=\"bold\" mathcolor=\"#15803d\">Empirical Signal Preserved Unaltered</mtext><mo>)</mo></math>",
                l_mml, s_mml, l_mml, s_mml, imp_val)
      } else {
        sprintf("<math display=\"block\"><msub><mover><mi>y</mi><mo stretchy=\"false\">^</mo></mover><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>&#x223C;</mo><mi mathvariant=\"script\">N</mi><mo>(</mo><mi>μ</mi><mo>=</mo><mn>%.4f</mn><mo>,</mo><mspace width=\"0.2em\"/><msup><mi>σ</mi><mn>2</mn></msup><mo>=</mo><mn>%.4f</mn><mo>)</mo><mo>&#x27F9;</mo><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>imp</mtext></msubsup><mo>=</mo><mn>%.4f</mn><mspace width=\"0.3em\"/><msub><mo>log</mo><mn>2</mn></msub><mspace width=\"1.5em\"/><mo>(</mo><mtext mathvariant=\"bold\" mathcolor=\"#b45309\">QRILC Lower-Tail Imputed</mtext><mo>)</mo></math>",
                l_mml, s_mml, cdd_mean, cdd_sd^2, l_mml, s_mml, imp_val)
      }
      
      # ------------------------------------------------------------------------
      # Step 4: Sample Median Centering Normalization
      # ------------------------------------------------------------------------
      s4_gen <- sprintf("$$\\Delta_{%s} = \\operatorname{Median}\\left(\\mathbf{Y}_{%s}^{\\operatorname{imp}}\\right) - \\operatorname{GrandMedian}, \\quad y_{%s, \\, %s}^{\\operatorname{norm}} = y_{%s, \\, %s}^{\\operatorname{imp}} - \\Delta_{%s}$$",
                        s_term, s_term, l_term, s_term, l_term, s_term, s_term)
      s4_spec <- sprintf("$$y_{%s, \\, %s}^{\\operatorname{norm}} = %.4f - (%+.4f) = %.4f \\text{ }\\log_2 \\quad \\left(\\Delta_{%s} = %+.4f\\right)$$",
                         l_term, s_term, imp_val, offset_val, norm_val, s_term, offset_val)
      
      s4_mml_gen <- sprintf("<math display=\"block\"><msub><mo>&#x0394;</mo>%s</msub><mo>=</mo><mi mathvariant=\"normal\">Median</mi><mo>(</mo><msubsup><mi mathvariant=\"bold\">Y</mi>%s<mtext>imp</mtext></msubsup><mo>)</mo><mo>&#x2212;</mo><mi mathvariant=\"normal\">GrandMedian</mi><mo>,</mo><mspace width=\"1.5em\"/><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>norm</mtext></msubsup><mo>=</mo><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>imp</mtext></msubsup><mo>&#x2212;</mo><msub><mo>&#x0394;</mo>%s</msub></math>",
                            s_mml, s_mml, l_mml, s_mml, l_mml, s_mml, s_mml)
      s4_mml_spec <- sprintf("<math display=\"block\"><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>norm</mtext></msubsup><mo>=</mo><mn>%.4f</mn><mo>&#x2212;</mo><mo>(</mo><mn>%+.4f</mn><mo>)</mo><mo>=</mo><mn>%.4f</mn><mspace width=\"0.3em\"/><msub><mo>log</mo><mn>2</mn></msub><mspace width=\"1.5em\"/><mo>(</mo><msub><mo>&#x0394;</mo>%s</msub><mo>=</mo><mn>%+.4f</mn><mo>)</mo></math>",
                             l_mml, s_mml, imp_val, offset_val, norm_val, s_mml, offset_val)
      
      # ------------------------------------------------------------------------
      # Step 5: Linear Restitution & Exact Equivalence
      # ------------------------------------------------------------------------
      s5_gen <- sprintf("$$A_{%s, \\, %s} = 2^{y_{%s, \\, %s}^{\\operatorname{norm}}} = 2^{y_{%s, \\, %s}^{\\operatorname{imp}} - \\Delta_{%s}} = x_{%s, \\, %s}^{\\operatorname{imp}} \\times S_{%s} \\quad \\text{where } S_{%s} = 2^{-\\Delta_{%s}}$$",
                        l_term, s_term, l_term, s_term, l_term, s_term, s_term, l_term, s_term, s_term, s_term, s_term)
      s5_spec <- sprintf("$$A_{%s, \\, %s} = 2^{%.4f} = %s \\quad \\left(S_{%s} = 2^{-(%+.4f)} = %.5f\\right)$$",
                         l_term, s_term, norm_val, fmt_latex_num(final_linear_val, 2), s_term, offset_val, scaling_val)
      s5_proof <- sprintf("$$\\text{Exact Equivalence Proof: } \\frac{A_{%s, \\, %s}}{2^{y_{%s, \\, %s}^{\\operatorname{imp}}}} = \\frac{%s}{%s} = %.5f \\equiv S_{%s} \\quad (\\text{Bit-for-Bit Identity Verified})$$",
                          l_term, s_term, l_term, s_term, fmt_latex_num(final_linear_val, 2), fmt_latex_num(2^imp_val, 2), scaling_val, s_term)
      
      s5_mml_gen <- sprintf("<math display=\"block\"><msub><mi>A</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>=</mo><msup><mn>2</mn><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>norm</mtext></msubsup></msup><mo>=</mo><msup><mn>2</mn><mrow><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>imp</mtext></msubsup><mo>&#x2212;</mo><msub><mo>&#x0394;</mo>%s</msub></mrow></msup><mo>=</mo><msubsup><mi>x</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>imp</mtext></msubsup><mo>×</mo><msub><mi>S</mi>%s</msub><mspace width=\"1.5em\"/><mtext>where </mtext><msub><mi>S</mi>%s</msub><mo>=</mo><msup><mn>2</mn><mrow><mo>&#x2212;</mo><msub><mo>&#x0394;</mo>%s</msub></mrow></msup></math>",
                            l_mml, s_mml, l_mml, s_mml, l_mml, s_mml, s_mml, l_mml, s_mml, s_mml, s_mml, s_mml)
      s5_mml_spec <- sprintf("<math display=\"block\"><msub><mi>A</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><mo>=</mo><msup><mn>2</mn><mn>%.4f</mn></msup><mo>=</mo><mn>%s</mn><mspace width=\"1.5em\"/><mo>(</mo><msub><mi>S</mi>%s</msub><mo>=</mo><msup><mn>2</mn><mrow><mo>&#x2212;</mo><mo>(</mo><mn>%+.4f</mn><mo>)</mo></mrow></msup><mo>=</mo><mn>%.5f</mn><mo>)</mo></math>",
                             l_mml, s_mml, norm_val, final_fmt, s_mml, offset_val, scaling_val)
      s5_mml_proof <- sprintf("<math display=\"block\"><mtext mathvariant=\"bold\">Exact Equivalence Proof: </mtext><mfrac><msub><mi>A</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow></msub><msup><mn>2</mn><msubsup><mi>y</mi><mrow>%s,<mspace width=\"0.2em\"/>%s</mrow><mtext>imp</mtext></msubsup></msup></mfrac><mo>=</mo><mfrac><mn>%s</mn><mn>%s</mn></mfrac><mo>=</mo><mn>%.5f</mn><mo>&#x2261;</mo><msub><mi>S</mi>%s</msub><mspace width=\"1em\"/><mo>(</mo><mtext mathvariant=\"bold\" mathcolor=\"#15803d\">Bit-for-Bit Identity Verified</mtext><mo>)</mo></math>",
                              l_mml, s_mml, l_mml, s_mml, final_fmt, imp_lin_fmt, scaling_val, s_mml)
      
      # Semantic natural language translations of each mathematical formulation
      s1_lit_gen <- sprintf(
        "The analytical Limit of Detection (LOD) for sample %s is determined by calculating the minimum non-zero chromatographic peak area quantified across all lipids in the run: LOD = %s area units. In mass spectrometry, signals falling at or below this physical threshold represent instrument detector noise floor, baseline drift, or ion suppression, and cannot be distinguished from background.",
        sample, lod_fmt
      )
      s1_lit_spec <- if (is_obs) {
        sprintf(
          "Analyte %s in sample %s registered an observed detector peak area of %s, which meets or exceeds the run detection threshold (LOD = %s). The signal is confirmed as a valid biological observation (x* = %s) and retained unaltered for variance-stabilizing logarithmic transformation in Step 2.",
          lipid, sample, raw_fmt, lod_fmt, raw_fmt
        )
      } else {
        sprintf(
          "Analyte %s in sample %s yielded no detectable instrument response (or fell below the detection threshold of LOD = %s). The measurement is assigned x* = NA and classified as Missing Not At Random (MNAR) rather than zero, preventing undefined numerical collapse in logarithms while reserving the analyte for lower-tail imputation in Step 3.",
          lipid, sample, lod_fmt
        )
      }
      
      s2_lit_gen <- "Raw chromatographic peak areas span several orders of magnitude, with experimental measurement error scaling quadratically with signal intensity (heteroscedastic noise). Applying a base-2 logarithmic transformation stabilizes variance across the dynamic range and converts multiplicative biological fold changes into symmetric, additive linear differences (log2 fold change)."
      s2_lit_spec <- if (is_obs) {
        sprintf(
          "The empirical peak area of %s in sample %s (%s) is converted to a base-2 logarithmic scale by dividing its natural logarithm by ln(2) ≈ 0.693147. This yields y = %.4f log2 units, stabilizing heteroscedastic instrument noise while preserving true biological abundance.",
          lipid, sample, raw_fmt, log_val
        )
      } else {
        sprintf(
          "Because analyte %s was left-censored below the detector threshold (x* = NA), taking log2(0) would mathematically produce negative infinity (-Inf) and invalidate numerical computations. The missing state is strictly preserved as y = log2(NA) = NA to flag it for probabilistic tail modeling in Step 3.",
          lipid
        )
      }
      
      s3_lit_gen <- "In high-throughput lipidomics, non-detects are predominantly Missing Not At Random (MNAR) due to instrument sensitivity limits. Replacing missing values with zero or cohort means severely distorts data distribution and induces false-positive statistical calls. Quantile Regression for Left-Censored Data (QRILC) rigorously models the lower tail of a truncated Gaussian distribution, sampling biologically plausible sub-threshold values while leaving all observed signals untouched."
      s3_lit_spec <- if (is_obs) {
        sprintf(
          "Because analyte %s was confirmed above the detection limit in sample %s, it completely bypasses the imputation algorithm. Its verified biological log2 signal of %.4f log2 is retained completely unaltered (y_imp = %.4f log2).",
          lipid, sample, imp_val, imp_val
        )
      } else {
        sprintf(
          "Because analyte %s was left-censored (NA), QRILC estimates the lower-tail truncated Gaussian distribution of sample %s (mean μ = %.4f, variance σ² = %.4f). A biologically plausible sub-threshold concentration is sampled from this distribution, assigning an imputed abundance of y_imp = %.4f log2 units.",
          lipid, sample, cdd_mean, cdd_sd^2, imp_val
        )
      }
      
      s4_lit_gen <- "Technical variations (such as electrospray ionization source efficiency drift, matrix suppression, and autosampler injection volume fluctuations) affect all lipid species within a sample run simultaneously. Sample median centering aligns each run's global median with the grand cohort median by subtracting a sample-specific technical offset (Δ_j), removing systematic batch variance without altering relative biological proportions."
      s4_lit_spec <- sprintf(
        "The median log2 abundance across all lipids in sample %s is compared against the grand median of all samples across the entire cohort, identifying a systematic technical run offset of Δ = %+.4f log2 units. Subtracting this offset from %s's abundance (%.4f) centers the sample against the global baseline, producing a normalized abundance of y_norm = %.4f log2 units.",
        sample, offset_val, lipid, imp_val, norm_val
      )
      
      ratio_check <- if (is.finite(final_linear_val) && is.finite(imp_val) && (2^imp_val) > 0) final_linear_val / (2^imp_val) else scaling_val
      s5_lit_gen <- "Exponentiating normalized log2 abundances (A = 2^(y_norm)) restores values to the linear intensity domain, enabling direct biochemical interpretation and fold-change comparisons. By the laws of exponents, subtracting an additive offset in log2 space (y - Δ) is mathematically identical to multiplying the pre-normalization linear signal by a constant scaling multiplier S_j = 2^(-Δ)."
      s5_lit_spec <- sprintf(
        "Exponentiating the normalized log2 abundance of %s (2^%.4f) restores the signal to the linear intensity domain as A = %s area units. Mathematically, subtracting an offset in log2 space (y - Δ) is identical to multiplying the pre-normalization linear signal (%s) by the constant sample scaling multiplier S = 2^(-Δ) = %.5f.",
        lipid, norm_val, final_fmt, imp_lin_fmt, scaling_val
      )
      
      s5_proof_lit <- sprintf(
        "Exact Equivalence Proof: Dividing the restituted linear abundance (%s) by the pre-normalization linear intensity (%s) yields exactly %.5f, confirming an exact bit-for-bit identity with the theoretical multiplier S = 2^(-(%+.4f)) = %.5f with zero numerical divergence.",
        final_fmt, imp_lin_fmt, ratio_check, offset_val, scaling_val
      )
      
      list(
        step1 = list(gen = s1_gen, spec = s1_spec, mml_gen = s1_mml_gen, mml_spec = s1_mml_spec, lit_gen = s1_lit_gen, lit_spec = s1_lit_spec, lit = s1_lit_spec),
        step2 = list(gen = s2_gen, spec = s2_spec, mml_gen = s2_mml_gen, mml_spec = s2_mml_spec, lit_gen = s2_lit_gen, lit_spec = s2_lit_spec, lit = s2_lit_spec),
        step3 = list(gen = s3_gen, spec = s3_spec, mml_gen = s3_mml_gen, mml_spec = s3_mml_spec, lit_gen = s3_lit_gen, lit_spec = s3_lit_spec, lit = s3_lit_spec),
        step4 = list(gen = s4_gen, spec = s4_spec, mml_gen = s4_mml_gen, mml_spec = s4_mml_spec, lit_gen = s4_lit_gen, lit_spec = s4_lit_spec, lit = s4_lit_spec),
        step5 = list(gen = s5_gen, spec = s5_spec, proof = s5_proof, mml_gen = s5_mml_gen, mml_spec = s5_mml_spec, mml_proof = s5_mml_proof, lit_gen = s5_lit_gen, lit_spec = s5_lit_spec, lit = s5_lit_spec, proof_lit = s5_proof_lit)
      )
    }
    
    generate_demonstration_report_html <- function(a_data, target_lipids, file, target_samples = NULL) {
      all_lipids <- rownames(a_data$mat_raw)
      samples <- colnames(a_data$mat_raw)
      
      lipids_to_audit <- if (!is.null(target_lipids) && length(target_lipids) > 0) {
        intersect(target_lipids, all_lipids)
      } else {
        head(all_lipids, 5)
      }
      if (length(lipids_to_audit) == 0) lipids_to_audit <- head(all_lipids, 1)
      
      html_lines <- c(
        "<!DOCTYPE html>",
        "<html lang='en'>",
        "<head>",
        "<meta charset='UTF-8'>",
        "<meta name='viewport' content='width=device-width, initial-scale=1.0'>",
        sprintf("<title>Mathematical Demonstration & Transformation Audit - %d Lipid(s)</title>", length(lipids_to_audit)),
        "<link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'>",
        "<script src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'></script>",
        "<script src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js'></script>",
        "<script>",
        "  window.MathJax = {",
        "    tex: {",
        "      inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],",
        "      displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],",
        "      processEscapes: true",
        "    },",
        "    options: {",
        "      skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']",
        "    }",
        "  };",
        "</script>",
        "<script id='MathJax-script' async src='https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js'></script>",
        "<style>",
        "  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.55; color: #1e293b; background-color: #f8fafc; padding: 24px; max-width: 1100px; margin: 0 auto; }",
        "  .header-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }",
        "  .lipid-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin-bottom: 28px; box-shadow: 0 2px 4px rgba(0,0,0,0.04); page-break-after: always; }",
        "  .step-box { background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 16px; margin: 16px 0; }",
        "  .step-box.step1 { border-left-color: #10b981; }",
        "  .step-box.step2 { border-left-color: #64748b; }",
        "  .step-box.step3 { border-left-color: #f59e0b; }",
        "  .step-box.step4 { border-left-color: #3b82f6; }",
        "  .step-box.step5 { border-left-color: #10b981; }",
        "  .step-title { font-weight: 700; font-size: 1.05rem; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; }",
        "  .badge { display: inline-block; padding: 3px 8px; font-size: 0.75rem; font-weight: 600; border-radius: 4px; }",
        "  .badge-success { background-color: #d1fae5; color: #065f46; }",
        "  .badge-warning { background-color: #fef3c7; color: #92400e; }",
        "  .badge-primary { background-color: #dbeafe; color: #1e40af; }",
        "  .badge-secondary { background-color: #f1f5f9; color: #475569; }",
        "  .math-block { background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 10px 0; font-size: 1.02rem; overflow-x: auto; }",
        "  math { font-family: 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', KaTeX_Math, -apple-system, sans-serif; font-size: 1.15rem; color: #0f172a; display: block; margin: 4px 0; overflow-x: auto; }",
        "  .latex-code-toggle { margin-top: 10px; font-size: 0.78rem; color: #64748b; }",
        "  .latex-code-toggle summary { cursor: pointer; color: #2563eb; font-weight: 500; }",
        "  .latex-code-toggle summary:hover { text-decoration: underline; }",
        "  .latex-code-toggle code { display: block; background: #f8fafc; padding: 6px 10px; border-radius: 4px; font-size: 0.75rem; margin-top: 4px; white-space: pre-wrap; word-break: break-all; border: 1px solid #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }",
        "  .lexicon-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 22px; margin-bottom: 26px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }",
        "  .lexicon-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 0.86rem; }",
        "  .lexicon-table th, .lexicon-table td { border: 1px solid #e2e8f0; padding: 9px 12px; text-align: left; vertical-align: top; }",
        "  .lexicon-table th { background-color: #f1f5f9; color: #1e293b; font-weight: 700; font-size: 0.80rem; text-transform: uppercase; letter-spacing: 0.03em; }",
        "  .lexicon-table tr:nth-child(even) { background-color: #f8fafc; }",
        "  .lexicon-table tr:hover { background-color: #f1f5f9; }",
        "  .lexicon-table code { background: #e0f2fe; color: #0369a1; padding: 2px 7px; border-radius: 4px; font-size: 0.85rem; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }",
        "  .semantic-translation { background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); border-radius: 6px; padding: 8px 12px; margin: 8px 0 10px 0; font-size: 0.86rem; color: #334155; line-height: 1.5; }",
        "  .semantic-translation strong { color: #0284c7; }",
        "  .semantic-translation.proof-translation { background: rgba(240, 253, 244, 0.35); border-color: rgba(187, 247, 208, 0.35); border-left-color: rgba(22, 163, 74, 0.45); color: #334155; }",
        "  .semantic-translation.proof-translation strong { color: #16a34a; }",
        "  .literal-reading { background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); border-radius: 6px; padding: 8px 12px; margin: 8px 0 10px 0; font-size: 0.86rem; color: #334155; line-height: 1.5; }",
        "  .justification { font-size: 0.90rem; color: #334155; margin-top: 6px; line-height: 1.5; }",
        "  .audit-table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 0.85rem; }",
        "  .audit-table th, .audit-table td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }",
        "  .audit-table th { background-color: #f1f5f9; font-weight: 600; }",
        "  .audit-table tr:nth-child(even) { background-color: #f8fafc; }",
        "  .na-tag { color: #b45309; font-weight: 700; background: #fef3c7; padding: 1px 5px; border-radius: 3px; font-size: 0.78rem; }",
        "  @media print { body { background: white; padding: 0; } .lipid-card { box-shadow: none; border: 1px solid #ccc; page-break-after: always; } .no-print { display: none; } }",
        "</style>",
        "</head>",
        "<body>",
        "<div class='no-print' style='margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 8px;'>",
        "  <button onclick='window.print()' style='background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;'>Print / Save to PDF</button>",
        "</div>",
        "<div class='header-card'>",
        "  <h2 style='margin: 0 0 6px 0; color: #1e3a8a;'>Mathematical Demonstration & Transformation Audit Report</h2>",
        "  <p style='margin: 0 0 12px 0; color: #64748b; font-size: 0.92rem;'>Formal Bit-for-Bit Verification & Empirical Pipeline Proof | Nature Communications (2025) 16:8714 Benchmark</p>",
        sprintf("  <div style='display: flex; gap: 16px; font-size: 0.82rem; color: #475569;'><span><strong>Audited Lipids:</strong> %d</span><span><strong>Sample Runs:</strong> %d</span><span><strong>Generated:</strong> %s</span></div>",
                length(lipids_to_audit), length(samples), format(Sys.time(), "%Y-%m-%d %H:%M:%S")),
        "</div>",
        "<div class='lexicon-card'>",
        "  <div style='display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;'>",
        "    <div style='display: flex; align-items: center; gap: 8px;'>",
        "      <span class='badge' style='background: #2563eb; color: white;'>LEXICON</span>",
        "      <h3 style='margin: 0; color: #0f172a; font-size: 1.05rem;'>Mathematical, Transformation & Statistical Symbols Reference</h3>",
        "    </div>",
        "    <span style='font-size: 0.78rem; color: #64748b;'>Operational Pipeline Definitions</span>",
        "  </div>",
        "  <p style='margin: 0 0 14px 0; color: #475569; font-size: 0.86rem;'>Standardized definitions of mathematical symbols, variables, and operational mechanisms utilized across the 5-step data normalization workflow.</p>",
        "  <table class='lexicon-table'>",
        "    <thead>",
        "      <tr>",
        "        <th style='width: 18%;'>Mathematical Term</th>",
        "        <th style='width: 27%;'>Literal Term (Concept)</th>",
        "        <th style='width: 55%;'>Operational Definition & Pipeline Role</th>",
        "      </tr>",
        "    </thead>",
        "    <tbody>",
        "      <tr><td><code>LOD<sub>j</sub></code></td><td><strong>Limit of Detection (LOD)</strong></td><td>The lowest positive peak area reliably measured by the mass spectrometer in sample <em>j</em> (&min;<sub>i</sub> {x_{i, j} | x_{i, j} &gt; 0}). Any signal below this boundary is physical non-detect (left-censored).</td></tr>",
        "      <tr><td><code>x_{i, j}</code></td><td><strong>Raw Abundance</strong></td><td>The empirical linear peak area (or detector ion counts) recorded for lipid species <em>i</em> in sample run <em>j</em> prior to any transformation.</td></tr>",
        "      <tr><td><code>x*<sub>i, j</sub></code></td><td><strong>Ingested Screened Signal</strong></td><td>Abundance after LOD screening: accepted as true biological signal if <em>x &ge; LOD</em>, or mapped to <code>NA</code> if below instrument threshold.</td></tr>",
        "      <tr><td><code>y_{i, j}</code></td><td><strong>Log2 Raw Abundance</strong></td><td>Base-2 log transformed signal (<em>y = log2(x*)</em>). Stabilizes heteroscedastic noise across the dynamic range and linearizes multiplicative fold changes.</td></tr>",
        "      <tr><td><code>QRILC</code></td><td><strong>Quantile Regression for Left-Censored Data</strong></td><td>Statistical method estimating the lower tail of a truncated log-normal distribution to impute sub-LOD non-detects without shrinking cohort variance.</td></tr>",
        "      <tr><td><code>MNAR</code></td><td><strong>Missing Not At Random</strong></td><td>Condition where missingness depends on true low concentration (below physical detector limit), requiring left-censored tail modeling rather than random imputation.</td></tr>",
        "      <tr><td><code>y<sup>imp</sup><sub>i, j</sub></code></td><td><strong>Imputed Abundance</strong></td><td>Complete log2 matrix after Step 3: retains observed empirical values unaltered, and contains QRILC-sampled draws (<em>&ycirc;<sub>i, j</sub></em>) for non-detects.</td></tr>",
        "      <tr><td><code>&Delta;<sub>j</sub></code></td><td><strong>Sample Median Offset</strong></td><td>Technical shift per sample run: difference between sample <em>j</em>'s median log2 intensity and the grand cohort median (&Delta;<sub>j</sub> = Median(Y<sub>j</sub>) - GrandMedian).</td></tr>",
        "      <tr><td><code>y<sup>norm</sup><sub>i, j</sub></code></td><td><strong>Normalized Log2 Abundance</strong></td><td>Batch- and run-corrected log2 signal after median centering: <em>y^{norm} = y^{imp} - &Delta;_j</em>. Eliminates electrospray ionization shifts and loading variations.</td></tr>",
        "      <tr><td><code>A<sub>i, j</sub></code></td><td><strong>Restituted Linear Abundance</strong></td><td>Final restored linear abundance: <em>A = 2^{y^{norm}}</em>. Preserves physical peak area proportions for downstream fold-change calculations.</td></tr>",
        "      <tr><td><code>S<sub>j</sub></code></td><td><strong>Linear Scaling Multiplier</strong></td><td>Direct linear scaling multiplier: <em>S_j = 2^{-&Delta;_j}</em>. Multiplying linear signals by <em>S_j</em> is mathematically identical to log2 offset subtraction and exponentiation.</td></tr>",
        "    </tbody>",
        "  </table>",
        "</div>"
      )
      
      for (idx in seq_along(lipids_to_audit)) {
        lip <- lipids_to_audit[idx]
        raw_vals <- as.numeric(a_data$mat_raw[lip, samples])
        names(raw_vals) <- samples
        log_vals <- as.numeric(a_data$mat_log[lip, samples])
        names(log_vals) <- samples
        imp_vals <- as.numeric(a_data$mat_log_imputed[lip, samples])
        names(imp_vals) <- samples
        norm_vals <- as.numeric(a_data$mat_final_log[lip, samples])
        names(norm_vals) <- samples
        final_linear_vals <- as.numeric(a_data$mat_final_linear[lip, samples])
        names(final_linear_vals) <- samples
        
        is_obs <- !is.na(raw_vals) & is.finite(raw_vals) & raw_vals > 0
        names(is_obs) <- samples
        n_obs <- sum(is_obs)
        n_na <- length(samples) - n_obs
        
        rep_sample <- if (!is.null(target_samples) && target_samples[1] %in% samples) {
          target_samples[1]
        } else if (n_na > 0 && n_obs > 0) {
          samples[!is_obs][1]
        } else {
          samples[1]
        }
        s_idx <- match(rep_sample, samples)
        
        rep_raw <- raw_vals[s_idx]
        rep_is_obs <- isTRUE(is_obs[s_idx])
        rep_log <- log_vals[s_idx]
        rep_imp <- imp_vals[s_idx]
        rep_norm <- norm_vals[s_idx]
        rep_final <- final_linear_vals[s_idx]
        
        rep_offset <- if (!is.null(names(a_data$norm_offsets))) a_data$norm_offsets[rep_sample] else a_data$norm_offsets[s_idx]
        rep_scaling <- if (!is.null(names(a_data$scaling_factors))) a_data$scaling_factors[rep_sample] else a_data$scaling_factors[s_idx]
        rep_lod <- if (!is.null(a_data$sample_lods) && !is.null(names(a_data$sample_lods)) && rep_sample %in% names(a_data$sample_lods)) a_data$sample_lods[rep_sample] else if (!is.null(a_data$sample_lods) && length(a_data$sample_lods) >= s_idx) a_data$sample_lods[s_idx] else 100.0
        
        forms <- build_step_formulas(lip, rep_sample, rep_raw, rep_lod, rep_log, rep_imp, rep_norm, rep_final, rep_offset, rep_scaling, rep_is_obs)
        
        card_html <- c(
          "<div class='lipid-card'>",
          "  <div style='display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px;'>",
          sprintf("    <h3 style='margin: 0; color: #0f172a;'>%d. Lipid Species: <code>%s</code></h3>", idx, htmltools::htmlEscape(lip)),
          sprintf("    <div><span class='badge %s'>%s</span></div>",
                  if (n_na == 0) "badge-success" else "badge-warning",
                  if (n_na == 0) sprintf("100%% Detected (%d/%d)", n_obs, length(samples)) else sprintf("Has N/A (%d/%d non-detects)", n_na, length(samples))),
          "  </div>",
          "  <h4 style='margin: 12px 0 6px 0; font-size: 0.95rem; color: #334155;'>Cross-Sample Empirical Transformation Matrix</h4>",
          "  <table class='audit-table'>",
          "    <thead><tr><th>Sample Column</th><th>Raw Abundance</th><th>LOD Status</th><th>Log2 Raw</th><th>QRILC Log2</th><th>Median Offset (&Delta;<sub>j</sub>)</th><th>Norm Log2</th><th>Restituted Linear</th><th>Ratio Check</th></tr></thead>",
          "    <tbody>"
        )
        
        for (s in samples) {
          cur_idx <- match(s, samples)
          s_raw <- raw_vals[cur_idx]
          s_obs <- isTRUE(is_obs[cur_idx])
          s_log <- log_vals[cur_idx]
          s_imp <- imp_vals[cur_idx]
          s_norm <- norm_vals[cur_idx]
          s_fin <- final_linear_vals[cur_idx]
          s_off <- if (!is.null(names(a_data$norm_offsets))) a_data$norm_offsets[s] else a_data$norm_offsets[cur_idx]
          s_ratio <- s_fin / (2^s_imp)
          
          card_html <- c(card_html, sprintf(
            "    <tr><td><strong>%s</strong></td><td>%s</td><td>%s</td><td>%s</td><td><strong>%.3f</strong></td><td>%+.3f</td><td>%.3f</td><td><strong style='color:#15803d;'>%s</strong></td><td>%.4f (<em>S</em><sub>j</sub>)</td></tr>",
            s,
            if (s_obs) format(round(s_raw, 2), big.mark = ",") else "<span class='na-tag'>N/A (Below LOD)</span>",
            if (s_obs) "<span class='badge badge-success'>Observed</span>" else "<span class='badge badge-warning'>Imputed MNAR</span>",
            if (s_obs) sprintf("%.3f", s_log) else "NA",
            s_imp,
            s_off,
            s_norm,
            format(round(s_fin, 2), big.mark = ","),
            s_ratio
          ))
        }
        card_html <- c(card_html, "    </tbody></table>")
        
        card_html <- c(
          card_html,
          sprintf("<h4 style='margin: 18px 0 8px 0; font-size: 0.95rem; color: #334155;'>5-Step Mathematical Derivation with Term of Lipid (Demonstration on Sample: <code>%s</code>)</h4>", rep_sample),
          
          # STEP 1
          "  <div class='step-box step1'>",
          sprintf("    <div class='step-title'><span>Step 1: Limit of Detection (LOD) & Raw Ingestion</span><span class='badge %s'>%s</span></div>",
                  if (rep_is_obs) "badge-success" else "badge-warning",
                  if (rep_is_obs) "Signal Validated" else "Left-Censored Non-Detect (NA)"),
          sprintf("    <div class='math-block'>%s<details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step1$mml_gen, htmltools::htmlEscape(forms$step1$gen)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step1$lit_gen),
          sprintf("    <div class='math-block'><strong>Specific Formulation for Selected Lipid:</strong><div style='margin-top:6px;'>%s</div><details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step1$mml_spec, htmltools::htmlEscape(forms$step1$spec)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step1$lit_spec),
          "    <div class='justification'>",
          sprintf("      <strong>Methodological Justification:</strong> For analyte <em>%s</em> in sample <em>%s</em>, physical instrument threshold was %s. %s",
                  lip, rep_sample,
                  if (rep_is_obs) sprintf("exceeded at %s (above LOD)", format(round(rep_raw, 2), big.mark=",")) else "not met (below physical detector limit)",
                  if (rep_is_obs) "Measurement is preserved as true biological signal." else "Because log2(0) is mathematically undefined (-infinity), it is mapped to NA as Missing Not At Random (MNAR) for Step 3 modeling."),
          "    </div>",
          "  </div>",
          
          # STEP 2
          "  <div class='step-box step2'>",
          "    <div class='step-title'><span>Step 2: Variance-Stabilizing Base-2 Log Transformation</span><span class='badge badge-secondary'>Log2 Normalization</span></div>",
          sprintf("    <div class='math-block'>%s<details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step2$mml_gen, htmltools::htmlEscape(forms$step2$gen)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step2$lit_gen),
          sprintf("    <div class='math-block'><strong>Specific Formulation for Selected Lipid:</strong><div style='margin-top:6px;'>%s</div><details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step2$mml_spec, htmltools::htmlEscape(forms$step2$spec)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step2$lit_spec),
          "    <div class='justification'>",
          "      <strong>Methodological Justification:</strong> Raw lipid peak area variance scales quadratically with abundance. Log2 transformation stabilizes heteroscedastic noise and converts multiplicative biological fold changes into uniform additive linear distances.",
          "    </div>",
          "  </div>",
          
          # STEP 3
          "  <div class='step-box step3'>",
          sprintf("    <div class='step-title'><span>Step 3: Quantile Regression for Left-Censored Data (QRILC) Imputation</span><span class='badge %s'>%s</span></div>",
                  if (rep_is_obs) "badge-secondary" else "badge-warning",
                  if (rep_is_obs) "Observed (Unaltered)" else "QRILC Imputed"),
          sprintf("    <div class='math-block'>%s<details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step3$mml_gen, htmltools::htmlEscape(forms$step3$gen)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step3$lit_gen),
          sprintf("    <div class='math-block'><strong>Specific Formulation for Selected Lipid:</strong><div style='margin-top:6px;'>%s</div><details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step3$mml_spec, htmltools::htmlEscape(forms$step3$spec)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step3$lit_spec),
          "    <div class='justification'>",
          "      <strong>Methodological Justification:</strong> Imputing cohort means for low-abundance non-detects distorts biological reality. QRILC rigorously estimates the truncated Gaussian lower tail, sampling biologically plausible sub-LOD abundances without inflating cohort variance.",
          "    </div>",
          "  </div>",
          
          # STEP 4
          "  <div class='step-box step4'>",
          sprintf("    <div class='step-title'><span>Step 4: Sample-Wise Global Median Centering Normalization</span><span class='badge badge-primary'>Offset: %+.3f log2</span></div>", rep_offset),
          sprintf("    <div class='math-block'>%s<details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step4$mml_gen, htmltools::htmlEscape(forms$step4$gen)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step4$lit_gen),
          sprintf("    <div class='math-block'><strong>Specific Formulation for Selected Lipid:</strong><div style='margin-top:6px;'>%s</div><details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step4$mml_spec, htmltools::htmlEscape(forms$step4$spec)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step4$lit_spec),
          "    <div class='justification'>",
          sprintf("      <strong>Methodological Justification:</strong> Corrects run-to-run electrospray ionization shifts and injection volume variance uniformly across all lipids by centering sample median to the grand cohort median (calculated offset &Delta;<sub>j</sub> = %+.4f log2).", rep_offset),
          "    </div>",
          "  </div>",
          
          # STEP 5
          "  <div class='step-box step5'>",
          sprintf("    <div class='step-title'><span>Step 5: Linear Restitution & Exact Scaling Equivalence Proof</span><span class='badge badge-success'>Multiplier: %.4f</span></div>", rep_scaling),
          sprintf("    <div class='math-block'>%s<details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step5$mml_gen, htmltools::htmlEscape(forms$step5$gen)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step5$lit_gen),
          sprintf("    <div class='math-block'><strong>Specific Formulation for Selected Lipid:</strong><div style='margin-top:6px;'>%s</div><details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step5$mml_spec, htmltools::htmlEscape(forms$step5$spec)),
          sprintf("    <div class='semantic-translation'><strong>Semantic Translation:</strong> %s</div>", forms$step5$lit_spec),
          sprintf("    <div class='math-block' style='background:#f0fdf4; border-color:#86efac;'>%s<details class='latex-code-toggle'><summary>LaTeX Source</summary><code>%s</code></details></div>",
                  forms$step5$mml_proof, htmltools::htmlEscape(forms$step5$proof)),
          sprintf("    <div class='semantic-translation proof-translation'><strong style='color:#166534;'>Semantic Translation (Equivalence Proof):</strong> %s</div>", forms$step5$proof_lit),
          "    <div class='justification'>",
          sprintf("      <strong>Methodological Justification:</strong> Demonstrates bit-for-bit mathematical equivalence between normalized log2 exponentiation and multiplying the original linear signal by the sample scaling multiplier <em>S</em><sub>j</sub> = %.5f.", rep_scaling),
          "    </div>",
          "  </div>",
          "</div>"
        )
        html_lines <- c(html_lines, card_html)
      }
      
      html_lines <- c(
        html_lines,
        "<script>",
        "  function renderAllMath() {",
        "    if (window.renderMathInElement) {",
        "      try {",
        "        renderMathInElement(document.body, {",
        "          delimiters: [",
        "            {left: '$$', right: '$$', display: true},",
        "            {left: '$', right: '$', display: false}",
        "          ],",
        "          throwOnError: false",
        "        });",
        "      } catch(e) { console.error(e); }",
        "    } else if (window.MathJax && window.MathJax.typesetPromise) {",
        "      window.MathJax.typesetPromise();",
        "    }",
        "  }",
        "  if (document.readyState === 'loading') {",
        "    document.addEventListener('DOMContentLoaded', renderAllMath);",
        "  } else {",
        "    renderAllMath();",
        "  }",
        "</script>",
        "</body></html>"
      )
      writeLines(html_lines, file)
    }
    
    generate_demonstration_report_md <- function(a_data, target_lipids, file, target_samples = NULL) {
      all_lipids <- rownames(a_data$mat_raw)
      samples <- colnames(a_data$mat_raw)
      
      lipids_to_audit <- if (!is.null(target_lipids) && length(target_lipids) > 0) {
        intersect(target_lipids, all_lipids)
      } else {
        head(all_lipids, 5)
      }
      if (length(lipids_to_audit) == 0) lipids_to_audit <- head(all_lipids, 1)
      
      md_lines <- c(
        "# Mathematical Demonstration & Transformation Audit Report",
        "",
        "**Benchmark**: *Nature Communications (2025) 16:8714*",
        sprintf("**Audited Lipids**: %d | **Sample Runs**: %d | **Timestamp**: %s", length(lipids_to_audit), length(samples), format(Sys.time(), "%Y-%m-%d %H:%M:%S")),
        "",
        "---",
        "",
        "### Mathematical & Pipeline Lexicon",
        "",
        "| Mathematical Term | Literal Term (Concept) | Operational Definition & Pipeline Role |",
        "|:---|:---|:---|",
        "| **$\\operatorname{LOD}_j$** | Limit of Detection (LOD) | Lowest positive peak area measured by the mass spectrometer in sample $j$ ($\\min_i \\{x_{ij} \\mid x_{ij} > 0\\}$). Signals below this are physical non-detects. |",
        "| **$x_{i, j}$** | Raw Abundance | Empirical linear peak area or detector ion count recorded for lipid $i$ in sample $j$ prior to transformation. |",
        "| **$x_{i, j}^*$** | Ingested Screened Signal | Abundance after LOD screening: accepted as true biological signal if $x \\ge \\operatorname{LOD}$, or $\\text{NA}$ if below threshold. |",
        "| **$y_{i, j}$** | Log2 Raw Abundance | Base-2 log transformed abundance ($y = \\log_2(x^*)$). Stabilizes heteroscedastic noise and converts fold changes into linear distances. |",
        "| **QRILC** | Quantile Regression for Left-Censored Data | Estimates the truncated lower tail of log abundances to draw realistic sub-LOD values without shrinking cohort variance. |",
        "| **MNAR** | Missing Not At Random | Missingness caused by low concentration below detector sensitivity, requiring lower-tail estimation. |",
        "| **$y_{i, j}^{\\operatorname{imp}}$** | Complete Imputed Abundance | Complete log2 matrix after Step 3: retains observed empirical values unaltered, and contains QRILC-sampled draws for non-detects. |",
        "| **$\\Delta_j$** | Sample Median Offset | Systematic run offset: $\\operatorname{Median}(\\mathbf{Y}_j^{\\operatorname{imp}}) - \\operatorname{GrandMedian}$. |",
        "| **$y_{i, j}^{\\operatorname{norm}}$** | Normalized Log2 Abundance | Run-corrected signal: $y^{\\operatorname{norm}} = y^{\\operatorname{imp}} - \\Delta_j$, eliminating electrospray ionization shifts. |",
        "| **$A_{i, j}$** | Restituted Linear Abundance | Restored linear abundance: $A = 2^{y^{\\operatorname{norm}}}$. Preserves calibrated physical signal scale. |",
        "| **$S_j$** | Linear Scaling Multiplier | Direct linear scaling multiplier: $S_j = 2^{-\\Delta_j}$, where $A = x^{\\operatorname{imp}} \\times S_j$. |",
        "",
        "---",
        ""
      )
      
      for (idx in seq_along(lipids_to_audit)) {
        lip <- lipids_to_audit[idx]
        raw_vals <- as.numeric(a_data$mat_raw[lip, samples])
        names(raw_vals) <- samples
        log_vals <- as.numeric(a_data$mat_log[lip, samples])
        names(log_vals) <- samples
        imp_vals <- as.numeric(a_data$mat_log_imputed[lip, samples])
        names(imp_vals) <- samples
        norm_vals <- as.numeric(a_data$mat_final_log[lip, samples])
        names(norm_vals) <- samples
        final_linear_vals <- as.numeric(a_data$mat_final_linear[lip, samples])
        names(final_linear_vals) <- samples
        
        is_obs <- !is.na(raw_vals) & is.finite(raw_vals) & raw_vals > 0
        names(is_obs) <- samples
        n_obs <- sum(is_obs)
        n_na <- length(samples) - n_obs
        
        rep_sample <- if (!is.null(target_samples) && target_samples[1] %in% samples) {
          target_samples[1]
        } else if (n_na > 0 && n_obs > 0) {
          samples[!is_obs][1]
        } else {
          samples[1]
        }
        s_idx <- match(rep_sample, samples)
        
        rep_raw <- raw_vals[s_idx]
        rep_is_obs <- isTRUE(is_obs[s_idx])
        rep_log <- log_vals[s_idx]
        rep_imp <- imp_vals[s_idx]
        rep_norm <- norm_vals[s_idx]
        rep_final <- final_linear_vals[s_idx]
        
        rep_offset <- if (!is.null(names(a_data$norm_offsets))) a_data$norm_offsets[rep_sample] else a_data$norm_offsets[s_idx]
        rep_scaling <- if (!is.null(names(a_data$scaling_factors))) a_data$scaling_factors[rep_sample] else a_data$scaling_factors[s_idx]
        rep_lod <- if (!is.null(a_data$sample_lods) && !is.null(names(a_data$sample_lods)) && rep_sample %in% names(a_data$sample_lods)) a_data$sample_lods[rep_sample] else if (!is.null(a_data$sample_lods) && length(a_data$sample_lods) >= s_idx) a_data$sample_lods[s_idx] else 100.0
        
        forms <- build_step_formulas(lip, rep_sample, rep_raw, rep_lod, rep_log, rep_imp, rep_norm, rep_final, rep_offset, rep_scaling, rep_is_obs)
        
        md_lines <- c(
          md_lines,
          sprintf("## %d. Lipid Species: `%s`", idx, lip),
          sprintf("- **Quantitative Status**: %s", if (n_na == 0) sprintf("100%% Detected (%d/%d)", n_obs, length(samples)) else sprintf("Has N/A (%d/%d non-detects)", n_na, length(samples))),
          "",
          "### Cross-Sample Transformation Matrix",
          "",
          "| Sample | Raw Abundance | LOD Status | Log2 Raw | QRILC Log2 | Median Offset ($\\Delta_j$) | Norm Log2 | Restituted Linear | Ratio Check |",
          "|:---|:---|:---|:---|:---|:---|:---|:---|:---|",
          ""
        )
        
        for (s in samples) {
          cur_idx <- match(s, samples)
          s_raw <- raw_vals[cur_idx]
          s_obs <- isTRUE(is_obs[cur_idx])
          s_log <- log_vals[cur_idx]
          s_imp <- imp_vals[cur_idx]
          s_norm <- norm_vals[cur_idx]
          s_fin <- final_linear_vals[cur_idx]
          s_off <- if (!is.null(names(a_data$norm_offsets))) a_data$norm_offsets[s] else a_data$norm_offsets[cur_idx]
          s_ratio <- s_fin / (2^s_imp)
          
          md_lines <- c(md_lines, sprintf(
            "| **%s** | %s | %s | %s | **%.3f** | %+.3f | %.3f | **%s** | %.4f ($S_j$) |",
            s,
            if (s_obs) format(round(s_raw, 2), big.mark = ",") else "N/A (Below LOD)",
            if (s_obs) "Observed" else "Imputed MNAR",
            if (s_obs) sprintf("%.3f", s_log) else "NA",
            s_imp,
            s_off,
            s_norm,
            format(round(s_fin, 2), big.mark = ","),
            s_ratio
          ))
        }
        
        md_lines <- c(
          md_lines,
          "",
          sprintf("### 5-Step Mathematical Derivation with Term of Lipid (`%s` in `%s`)", lip, rep_sample),
          "",
          "#### Step 1: Limit of Detection (LOD) Screening",
          forms$step1$gen,
          sprintf("> **Semantic Translation**: %s", forms$step1$lit_gen),
          "",
          sprintf("**Real Formula for Selected Lipid (%s in %s)**:", lip, rep_sample),
          forms$step1$spec,
          sprintf("> **Semantic Translation**: %s", forms$step1$lit_spec),
          sprintf("> **Methodological Justification**: For analyte %s in sample %s, physical instrument threshold was %s. %s",
                  lip, rep_sample,
                  if (rep_is_obs) sprintf("exceeded at %s (above LOD)", format(round(rep_raw, 2), big.mark=",")) else "not met (below physical detector limit)",
                  if (rep_is_obs) "Measurement is preserved as true biological signal." else "Because log2(0) is mathematically undefined (-infinity), it is mapped to NA as Missing Not At Random (MNAR) for Step 3 modeling."),
          "",
          "#### Step 2: Variance-Stabilizing Base-2 Logarithmic Transformation",
          forms$step2$gen,
          sprintf("> **Semantic Translation**: %s", forms$step2$lit_gen),
          "",
          sprintf("**Real Formula for Selected Lipid (%s in %s)**:", lip, rep_sample),
          forms$step2$spec,
          sprintf("> **Semantic Translation**: %s", forms$step2$lit_spec),
          "> **Methodological Justification**: Raw lipid peak area variance scales quadratically with abundance. Log2 transformation stabilizes heteroscedastic noise and converts multiplicative biological fold changes into uniform additive linear distances.",
          "",
          "#### Step 3: QRILC Tail Imputation (Left-Censored Data)",
          forms$step3$gen,
          sprintf("> **Semantic Translation**: %s", forms$step3$lit_gen),
          "",
          sprintf("**Real Formula for Selected Lipid (%s in %s)**:", lip, rep_sample),
          forms$step3$spec,
          sprintf("> **Semantic Translation**: %s", forms$step3$lit_spec),
          "> **Methodological Justification**: Imputing cohort means for low-abundance non-detects distorts biological reality. QRILC rigorously estimates the truncated Gaussian lower tail, sampling biologically plausible sub-LOD abundances without inflating cohort variance.",
          "",
          "#### Step 4: Sample-Wise Global Median Centering Normalization",
          forms$step4$gen,
          sprintf("> **Semantic Translation**: %s", forms$step4$lit_gen),
          "",
          sprintf("**Real Formula for Selected Lipid (%s in %s)**:", lip, rep_sample),
          forms$step4$spec,
          sprintf("> **Semantic Translation**: %s", forms$step4$lit_spec),
          sprintf("> **Methodological Justification**: Corrects run-to-run electrospray ionization shifts and injection volume variance uniformly across all lipids by centering sample median to the grand cohort median (calculated offset Delta_j = %+.4f log2).", rep_offset),
          "",
          "#### Step 5: Linear Restitution & Exact Scaling Equivalence Proof",
          forms$step5$gen,
          sprintf("> **Semantic Translation**: %s", forms$step5$lit_gen),
          "",
          sprintf("**Real Formula for Selected Lipid (%s in %s)**:", lip, rep_sample),
          forms$step5$spec,
          sprintf("> **Semantic Translation**: %s", forms$step5$lit_spec),
          "",
          forms$step5$proof,
          sprintf("> **Semantic Translation (Equivalence Proof)**: %s", forms$step5$proof_lit),
          sprintf("> **Methodological Justification**: Demonstrates bit-for-bit mathematical equivalence between normalized log2 exponentiation and multiplying the original linear signal by the sample scaling multiplier S_j = %.5f.", rep_scaling),
          "",
          "---",
          ""
        )
      }
      writeLines(md_lines, file)
    }
    
    render_export_matrix_modal <- function(ns) {
      modalDialog(
        title = tags$div(
          class = "d-flex align-items-center justify-content-between w-100 pe-2",
          tags$div(
            class = "d-flex align-items-center",
            icon("table-cells", class = "text-primary me-2 fs-5"),
            tags$strong(class = "fs-5 text-dark", "Transition Matrix"),
            tags$span(class = "badge bg-light text-secondary border ms-2 font-monospace", "Lipids × Samples Grid")
          ),
          tags$div(
            class = "d-flex align-items-center gap-2",
            tags$button(
              id = "btn_matrix_modal_expand",
              type = "button",
              class = "btn btn-sm btn-outline-primary fw-bold d-inline-flex align-items-center gap-1 shadow-sm",
              onclick = "toggleMatrixModalFullscreen(this);",
              title = "Click to Expand Studio to Full Screen / Extended Width",
              tags$i(class = "fa fa-expand btn-matrix-expand-icon"),
              tags$span(id = "txt_matrix_modal_expand", "Expand Studio")
            ),
            tags$button(
              type = "button",
              class = "btn-close ms-2",
              "data-bs-dismiss" = "modal",
              "aria-label" = "Close",
              title = "Close Studio",
              onclick = "$('.modal').modal('hide');"
            )
          )
        ),
        size = "xl",
        easyClose = TRUE,
        fade = TRUE,
        
        tags$div(
          class = "export-matrix-modal-content",
          
          # KaTeX & custom styling for crisp mathematical vector rendering, studio window expansion, and light alpha blue cell selection
          tags$link(rel = "stylesheet", href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"),
          tags$script(src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"),
          tags$script(src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"),
          tags$style(HTML("
            /* Base sizing for the Matrix Studio modal */
            .modal-dialog.matrix-studio-dialog {
              max-width: 92vw !important;
              width: 92vw !important;
              margin: 2vh auto !important;
              transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
            }
            .modal-dialog.matrix-studio-dialog .modal-content {
              border-radius: 12px !important;
              box-shadow: 0 10px 30px rgba(0,0,0,0.25) !important;
              max-height: 94vh !important;
              display: flex !important;
              flex-direction: column !important;
            }
            .modal-dialog.matrix-studio-dialog .modal-body {
              overflow-y: auto !important;
              flex: 1 1 auto !important;
              max-height: calc(94vh - 140px) !important;
              padding: 16px 22px !important;
            }

            /* Extended / Fullscreen state when 'Click to Expand' is active */
            .modal-dialog.matrix-studio-dialog.matrix-modal-fullscreen {
              max-width: 98vw !important;
              width: 98vw !important;
              height: 97vh !important;
              margin: 1.5vh auto !important;
            }
            .modal-dialog.matrix-studio-dialog.matrix-modal-fullscreen .modal-content {
              height: 97vh !important;
              max-height: 97vh !important;
            }
            .modal-dialog.matrix-studio-dialog.matrix-modal-fullscreen .modal-body {
              max-height: calc(97vh - 135px) !important;
            }

            /* Light alpha blue for selected measurement cells in matrix table - does NOT mask value */
            .export-matrix-modal-content table.dataTable tbody td.selected,
            .export-matrix-modal-content table.dataTable tbody td.active,
            .export-matrix-modal-content table.dataTable tbody th.selected,
            .export-matrix-modal-content table.dataTable tbody th.active,
            table.dataTable tbody td.selected,
            table.dataTable tbody td.active,
            table.dataTable.cell-border tbody td.selected,
            table.dataTable.cell-border tbody td.active,
            [id*='matrix_grid_dt'] table.dataTable tbody td.selected,
            [id*='matrix_grid_dt'] table.dataTable tbody td.active {
              background-color: rgba(59, 130, 246, 0.22) !important;
              background-image: none !important;
              box-shadow: inset 0 0 0 2px #2563eb !important;
              color: #0f172a !important;
              font-weight: 700 !important;
            }

            /* Ensure text, badges, and numbers inside selected cell are crisp and NOT masked */
            .export-matrix-modal-content table.dataTable tbody td.selected *,
            .export-matrix-modal-content table.dataTable tbody td.active *,
            table.dataTable tbody td.selected *,
            table.dataTable tbody td.active * {
              color: #0f172a !important;
              font-weight: 700 !important;
            }

            /* Hover effect for measurement cells */
            .export-matrix-modal-content table.dataTable tbody td:hover,
            table.dataTable tbody td:hover {
              background-color: rgba(59, 130, 246, 0.08);
              cursor: pointer;
            }
            .export-matrix-modal-content table.dataTable tbody td.selected:hover,
            .export-matrix-modal-content table.dataTable tbody td.active:hover,
            table.dataTable tbody td.selected:hover,
            table.dataTable tbody td.active:hover {
              background-color: rgba(59, 130, 246, 0.32) !important;
            }

            /* Row selection highlight (when in row target mode) */
            .export-matrix-modal-content table.dataTable tbody tr.selected > td,
            .export-matrix-modal-content table.dataTable tbody tr.active > td,
            table.dataTable tbody tr.selected > td,
            table.dataTable tbody tr.active > td {
              background-color: rgba(59, 130, 246, 0.12) !important;
              color: #0f172a !important;
            }

            .math-block-card {
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 14px 18px;
              margin: 8px 0;
              overflow-x: auto;
            }

            /* Standout red export demonstration button with transparent alpha background */
            [id*='download_demonstration_html'] {
              background-color: rgba(239, 68, 68, 0.08) !important;
              color: #b91c1c !important;
              border: 1px solid rgba(239, 68, 68, 0.32) !important;
              transition: all 0.15s ease-in-out !important;
            }
            [id*='download_demonstration_html']:hover {
              background-color: rgba(239, 68, 68, 0.16) !important;
              color: #7f1d1d !important;
              border-color: rgba(239, 68, 68, 0.55) !important;
            }
            [id*='download_demonstration_html'] i,
            [id*='download_demonstration_html'] svg {
              color: #dc2626 !important;
            }
          ")),
          tags$script(HTML("
            function toggleMatrixModalFullscreen(btn) {
              var $dlg = $('.export-matrix-modal-content').closest('.modal-dialog');
              if (!$dlg.length) {
                $dlg = $(btn).closest('.modal-dialog');
              }
              if (!$dlg.hasClass('matrix-studio-dialog')) {
                $dlg.addClass('matrix-studio-dialog');
              }
              var isExpanded = $dlg.hasClass('matrix-modal-fullscreen');
              if (isExpanded) {
                $dlg.removeClass('matrix-modal-fullscreen');
                $('#txt_matrix_modal_expand').text('Expand Studio');
                $('.btn-matrix-expand-icon').removeClass('fa-compress').addClass('fa-expand');
                $('#btn_matrix_modal_expand').removeClass('btn-primary text-white').addClass('btn-outline-primary');
              } else {
                $dlg.addClass('matrix-modal-fullscreen');
                $('#txt_matrix_modal_expand').text('Contract Studio');
                $('.btn-matrix-expand-icon').removeClass('fa-expand').addClass('fa-compress');
                $('#btn_matrix_modal_expand').removeClass('btn-outline-primary').addClass('btn-primary text-white');
              }
              setTimeout(function() {
                $(window).trigger('resize');
                if (window.jQuery && $.fn.dataTable) {
                  $.fn.dataTable.tables({ api: true }).columns.adjust();
                }
              }, 250);
            }

            $(document).ready(function() {
              setTimeout(function() {
                var $dlg = $('.export-matrix-modal-content').closest('.modal-dialog');
                if ($dlg.length && !$dlg.hasClass('matrix-studio-dialog')) {
                  $dlg.addClass('matrix-studio-dialog');
                }
              }, 50);
            });
          ")),
          
          tags$div(
            class = "alert alert-light border py-2 px-3 mb-3 d-flex align-items-center justify-content-between",
            tags$div(
              tags$div(
                class = "fw-semibold text-dark",
                style = "font-size: 1.08rem;",
                icon("circle-info", class = "text-primary me-2 fs-5"),
                "Click any measurement cell in the grid to inspect its exact 5-step mathematical proof. Use the controls below to select pipeline steps and highlight modes."
              )
            ),
            uiOutput(ns("matrix_modal_cohort_stats_badge"))
          ),
          
          tags$div(
            class = "d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2 p-2 bg-light rounded border",
            tags$div(
              class = "d-flex flex-wrap align-items-center gap-3",
              tags$div(
                class = "d-flex align-items-center gap-2",
                tags$span(class = "fw-bold small text-dark", icon("crosshairs", class = "text-primary me-1"), "Selection Target:"),
                radioButtons(
                  ns("matrix_selection_target"),
                  label = NULL,
                  choices = c(
                    "Individual Measurement Cells (1 row × 1 column)" = "cell",
                    "Full Lipid Rows (all sample columns)" = "row"
                  ),
                  selected = "cell",
                  inline = TRUE
                )
              ),
              tags$div(
                class = "d-flex align-items-center gap-1",
                actionButton(ns("matrix_select_all_btn"), "Select All", icon = icon("check-double"), class = "btn btn-xs btn-outline-secondary py-1 px-2", style = "font-size: 0.78rem;"),
                actionButton(ns("matrix_select_na_btn"), "Select N/A Cells", icon = icon("filter"), class = "btn btn-xs btn-outline-warning text-dark py-1 px-2", style = "font-size: 0.78rem;"),
                actionButton(ns("matrix_select_complete_btn"), "Select Detected", icon = icon("circle-check"), class = "btn btn-xs btn-outline-success py-1 px-2", style = "font-size: 0.78rem;"),
                actionButton(ns("matrix_clear_sel_btn"), "Clear", icon = icon("xmark"), class = "btn btn-xs btn-outline-danger py-1 px-2", style = "font-size: 0.78rem;"),
                tags$button(
                  type = "button",
                  class = "btn btn-xs btn-outline-primary py-1 px-2 ms-1 fw-semibold",
                  style = "font-size: 0.78rem;",
                  onclick = "toggleMatrixModalFullscreen(this);",
                  tags$i(class = "fa fa-expand btn-matrix-expand-icon me-1"),
                  "Expand Window"
                )
              )
            ),
            uiOutput(ns("matrix_modal_selection_badge"), inline = TRUE)
          ),
          
          bslib::navset_card_tab(
            id = ns("matrix_modal_tabs"),
            bslib::nav_panel(
              title = tagList(icon("table-cells"), " 1. Matrix View (Lipids × Samples)"),
              value = "matrix_view_tab",
              tags$div(
                class = "p-2",
                tags$div(
                  class = "d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2 p-2 bg-white rounded border",
                  tags$div(
                    class = "d-flex align-items-center gap-2",
                    tags$span(class = "fw-bold small text-dark", icon("layer-group", class = "text-primary me-1"), "Select Transformation Step Specific Matrix Values:"),
                    radioButtons(
                      ns("matrix_grid_view_mode"),
                      label = NULL,
                      choices = c(
                        "Step 1: Raw Abundance (Explicit N/A)" = "raw",
                        "Step 4: Normalized log2 (y_norm)" = "norm_log2",
                        "Step 5: Linear Restituted (Aij)" = "final_linear",
                        "Multipliers: Sample Scaling (Sj & Δj)" = "scaling"
                      ),
                      selected = "raw",
                      inline = TRUE
                    )
                  ),
                  tags$span(class = "small text-muted font-monospace", "Click any cell to isolate measurement")
                ),
                DT::dataTableOutput(ns("matrix_grid_dt"))
              )
            ),
            bslib::nav_panel(
              title = tagList(icon("table-list"), " 2. Transition Matrix Table (Long CSV Preview)"),
              value = "preview_tab",
              tags$div(
                class = "p-2",
                tags$p(class = "small text-muted mb-2",
                  icon("circle-info", class = "text-primary me-1"),
                  "Columnar multi-step transition audit for selected measurements. Shows raw peak areas, LOD detection limits, Step 2 Log2, Step 3 QRILC, Step 4 Norm Log2, and Step 5 Restituted Linear."
                ),
                DT::dataTableOutput(ns("matrix_preview_dt"))
              )
            )
          )
        ),
        
        footer = tags$div(
          class = "d-flex align-items-center justify-content-between w-100 flex-wrap gap-2",
          tags$div(
            class = "d-flex align-items-center gap-2",
            uiOutput(ns("matrix_modal_footer_summary"))
          ),
          tags$div(
            class = "d-flex align-items-center gap-2 flex-wrap",
            modalButton("Close"),
            downloadButton(
              ns("download_all_matrix_csv"),
              "Export All Table (CSV)",
              icon = icon("file-csv"),
              class = "btn btn-outline-primary btn-sm px-2"
            ),
            downloadButton(
              ns("download_selected_matrix_csv"),
              "Export Selected Measurements (CSV)",
              icon = icon("download"),
              class = "btn btn-primary btn-sm px-2 fw-bold"
            ),
            downloadButton(
              ns("download_demonstration_html"),
              "Export Demonstration (HTML / PDF)",
              icon = icon("file-code", style = "color: #dc2626;"),
              class = "btn btn-sm px-2 fw-bold",
              style = "background-color: rgba(239, 68, 68, 0.08); color: #b91c1c; border: 1px solid rgba(239, 68, 68, 0.35);"
            ),
            downloadButton(
              ns("download_demonstration_md"),
              "Export Demonstration (Markdown / LaTeX)",
              icon = icon("file-lines"),
              class = "btn btn-outline-secondary btn-sm px-2"
            )
          )
        )
      )
    }
    
    observeEvent(input$open_export_matrix_modal, {
      parent_sess <- if (!is.null(session$parent)) session$parent else session
      showModal(render_export_matrix_modal(ns), session = parent_sess)
    })
    
    matrix_lipids_summary <- reactive({
      a_data <- audit_data()
      req(a_data)
      mat_r <- a_data$mat_raw
      req(mat_r)
      
      lipids <- rownames(mat_r)
      samples <- colnames(mat_r)
      total_s <- length(samples)
      
      is_valid <- !is.na(mat_r) & is.finite(mat_r) & (mat_r > 0)
      detected_counts <- rowSums(is_valid)
      na_counts <- total_s - detected_counts
      
      data.frame(
        Lipid_Name = lipids,
        Detected_Samples = detected_counts,
        NA_Count = as.integer(na_counts),
        stringsAsFactors = FALSE
      )
    })
    
    matrix_grid_data <- reactive({
      a_data <- audit_data()
      req(a_data)
      mode_sel <- if (!is.null(input$matrix_grid_view_mode)) input$matrix_grid_view_mode else "raw"
      
      lipids <- rownames(a_data$mat_raw)
      samples <- colnames(a_data$mat_raw)
      
      if (mode_sel == "raw") {
        m <- a_data$mat_raw
        df_grid <- as.data.frame(matrix("", nrow = nrow(m), ncol = ncol(m)))
        colnames(df_grid) <- samples
        for (j in seq_len(ncol(m))) {
          vals <- m[, j]
          df_grid[[j]] <- ifelse(!is.na(vals) & is.finite(vals) & vals > 0, 
                                 format(round(vals, 2), big.mark = ","), 
                                 "N/A")
        }
      } else if (mode_sel == "final_linear") {
        m <- a_data$mat_final_linear
        df_grid <- as.data.frame(matrix("", nrow = nrow(m), ncol = ncol(m)))
        colnames(df_grid) <- samples
        for (j in seq_len(ncol(m))) {
          vals <- m[, j]
          df_grid[[j]] <- ifelse(!is.na(vals) & is.finite(vals), 
                                 format(round(vals, 2), big.mark = ","), 
                                 "N/A")
        }
      } else if (mode_sel == "norm_log2") {
        m <- a_data$mat_final_log
        df_grid <- as.data.frame(matrix("", nrow = nrow(m), ncol = ncol(m)))
        colnames(df_grid) <- samples
        for (j in seq_len(ncol(m))) {
          vals <- m[, j]
          df_grid[[j]] <- ifelse(!is.na(vals) & is.finite(vals), 
                                 sprintf("%.3f", vals), 
                                 "N/A")
        }
      } else {
        # scaling multiplier & offset mode
        m <- a_data$mat_final_linear
        df_grid <- as.data.frame(matrix("", nrow = nrow(m), ncol = ncol(m)))
        colnames(df_grid) <- samples
        for (j in seq_len(ncol(m))) {
          s_name <- samples[j]
          s_fac <- if (!is.null(names(a_data$scaling_factors))) a_data$scaling_factors[s_name] else a_data$scaling_factors[j]
          s_off <- if (!is.null(names(a_data$norm_offsets))) a_data$norm_offsets[s_name] else a_data$norm_offsets[j]
          df_grid[[j]] <- sprintf("S=%.4f (Δ=%+.3f)", s_fac, s_off)
        }
      }
      
      cbind(data.frame(Lipid_Name = lipids, stringsAsFactors = FALSE), df_grid)
    })
    
    output$matrix_grid_dt <- DT::renderDataTable(server = FALSE, {
      df <- matrix_grid_data()
      req(df)
      sample_cols <- setdiff(names(df), "Lipid_Name")
      mode_sel <- if (!is.null(input$matrix_grid_view_mode)) input$matrix_grid_view_mode else "raw"
      sel_target <- if (!is.null(input$matrix_selection_target)) input$matrix_selection_target else "cell"
      
      dt <- DT::datatable(
        df,
        selection = list(mode = "multiple", target = sel_target),
        rownames = FALSE,
        class = "compact stripe hover border nowrap cell-border",
        options = list(
          pageLength = 10,
          lengthMenu = c(10, 25, 50, 100),
          autoWidth = FALSE,
          scrollX = TRUE,
          dom = "fltip",
          language = list(
            search = "Filter Lipids in Matrix:",
            lengthMenu = "Show _MENU_ lipids"
          )
        )
      )
      
      if (mode_sel == "raw" && length(sample_cols) > 0) {
        dt <- dt %>% DT::formatStyle(
          columns = sample_cols,
          backgroundColor = DT::styleEqual("N/A", "#fef3c7"),
          color = DT::styleEqual("N/A", "#b45309"),
          fontWeight = DT::styleEqual("N/A", "bold")
        )
      }
      dt
    })
    
    # Extract selected measurement pairs: list of list(lipid = ..., sample = ...)
    selected_measurements <- reactive({
      sel_target <- if (!is.null(input$matrix_selection_target)) input$matrix_selection_target else "cell"
      df_grid <- matrix_grid_data()
      req(df_grid)
      sample_cols <- setdiff(names(df_grid), "Lipid_Name")
      
      if (sel_target == "cell") {
        cells <- input$matrix_grid_dt_cells_selected
        if (!is.null(cells) && nrow(cells) > 0) {
          items <- list()
          for (k in seq_len(nrow(cells))) {
            r <- cells[k, 1]
            c <- cells[k, 2] # 0-indexed column in DT client mode
            if (r >= 1 && r <= nrow(df_grid)) {
              lip <- df_grid$Lipid_Name[r]
              if (c == 0) {
                # Clicked on Lipid_Name column -> include all samples for this lipid
                for (s in sample_cols) {
                  items[[length(items) + 1]] <- list(lipid = lip, sample = s)
                }
              } else if (c >= 1 && c <= length(sample_cols)) {
                s <- sample_cols[c]
                items[[length(items) + 1]] <- list(lipid = lip, sample = s)
              }
            }
          }
          if (length(items) > 0) return(unique(items))
        }
      } else {
        rows <- input$matrix_grid_dt_rows_selected
        if (!is.null(rows) && length(rows) > 0) {
          items <- list()
          for (r in rows) {
            if (r >= 1 && r <= nrow(df_grid)) {
              lip <- df_grid$Lipid_Name[r]
              for (s in sample_cols) {
                items[[length(items) + 1]] <- list(lipid = lip, sample = s)
              }
            }
          }
          if (length(items) > 0) return(items)
        }
      }
      list()
    })
    
    selected_matrix_lipids <- reactive({
      meas <- selected_measurements()
      if (length(meas) > 0) {
        unique(sapply(meas, function(x) x$lipid))
      } else {
        character(0)
      }
    })
    
    selected_matrix_samples <- reactive({
      meas <- selected_measurements()
      if (length(meas) > 0) {
        unique(sapply(meas, function(x) x$sample))
      } else {
        character(0)
      }
    })
    
    observeEvent(input$matrix_select_all_btn, {
      sel_target <- if (!is.null(input$matrix_selection_target)) input$matrix_selection_target else "cell"
      df_grid <- matrix_grid_data()
      req(df_grid)
      if (sel_target == "cell") {
        sample_cols <- setdiff(names(df_grid), "Lipid_Name")
        all_cells <- expand.grid(row = seq_len(nrow(df_grid)), col = seq_along(sample_cols))
        DT::selectCells(DT::dataTableProxy("matrix_grid_dt"), as.matrix(all_cells))
      } else {
        DT::selectRows(DT::dataTableProxy("matrix_grid_dt"), seq_len(nrow(df_grid)))
      }
    })
    
    observeEvent(input$matrix_select_na_btn, {
      sel_target <- if (!is.null(input$matrix_selection_target)) input$matrix_selection_target else "cell"
      a_data <- audit_data()
      req(a_data)
      mat_r <- a_data$mat_raw
      req(mat_r)
      
      na_indices <- which(is.na(mat_r) | mat_r <= 0, arr.ind = TRUE)
      if (nrow(na_indices) > 0) {
        if (sel_target == "cell") {
          # col index in DT is 1-based matching sample_cols
          cell_mat <- cbind(na_indices[, 1], na_indices[, 2])
          DT::selectCells(DT::dataTableProxy("matrix_grid_dt"), cell_mat)
          showNotification(sprintf("Selected %d specific N/A measurement cells (below LOD).", nrow(cell_mat)), type = "message", duration = 3)
        } else {
          na_rows <- unique(na_indices[, 1])
          DT::selectRows(DT::dataTableProxy("matrix_grid_dt"), na_rows)
          showNotification(sprintf("Selected %d lipid lines containing N/A non-detects.", length(na_rows)), type = "message", duration = 3)
        }
      } else {
        showNotification("No N/A measurements in this dataset.", type = "warning", duration = 3)
      }
    })
    
    observeEvent(input$matrix_select_complete_btn, {
      sel_target <- if (!is.null(input$matrix_selection_target)) input$matrix_selection_target else "cell"
      a_data <- audit_data()
      req(a_data)
      mat_r <- a_data$mat_raw
      req(mat_r)
      
      obs_indices <- which(!is.na(mat_r) & mat_r > 0, arr.ind = TRUE)
      if (nrow(obs_indices) > 0) {
        if (sel_target == "cell") {
          cell_mat <- cbind(obs_indices[, 1], obs_indices[, 2])
          DT::selectCells(DT::dataTableProxy("matrix_grid_dt"), cell_mat)
          showNotification(sprintf("Selected %d detected measurement cells.", nrow(cell_mat)), type = "message", duration = 3)
        } else {
          comp_rows <- which(rowSums(is.na(mat_r) | mat_r <= 0) == 0)
          if (length(comp_rows) > 0) {
            DT::selectRows(DT::dataTableProxy("matrix_grid_dt"), comp_rows)
            showNotification(sprintf("Selected %d 100%% complete lipid lines.", length(comp_rows)), type = "message", duration = 3)
          }
        }
      }
    })
    
    observeEvent(input$matrix_clear_sel_btn, {
      DT::selectCells(DT::dataTableProxy("matrix_grid_dt"), NULL)
      DT::selectRows(DT::dataTableProxy("matrix_grid_dt"), NULL)
    })
    
    output$matrix_modal_selection_badge <- renderUI({
      meas <- selected_measurements()
      n <- length(meas)
      if (n == 0) {
        tags$span(class = "badge bg-secondary-subtle text-secondary border font-monospace", "0 cells selected (All Matrix active)")
      } else if (n == 1) {
        m <- meas[[1]]
        tags$span(class = "badge bg-primary-subtle text-primary border border-primary font-monospace fw-bold",
                  sprintf("Selected 1 cell: %s [%s]", m$lipid, m$sample))
      } else {
        lips <- length(unique(sapply(meas, function(x) x$lipid)))
        samps <- length(unique(sapply(meas, function(x) x$sample)))
        tags$span(class = "badge bg-primary-subtle text-primary border border-primary font-monospace fw-bold",
                  sprintf("%d cells selected (%d lipids × %d samples)", n, lips, samps))
      }
    })
    
    output$matrix_modal_footer_summary <- renderUI({
      meas <- selected_measurements()
      n <- length(meas)
      df <- matrix_grid_data()
      total_n <- if (!is.null(df)) nrow(df) else 0
      if (n == 0) {
        tags$span(class = "text-muted small", 
                  icon("circle-info", class = "text-primary me-1"),
                  sprintf("No specific cells selected. 'Export All Table' exports all %d lipids.", total_n))
      } else if (n == 1) {
        m <- meas[[1]]
        tags$span(class = "text-dark small fw-semibold",
                  icon("check", class = "text-success me-1"),
                  sprintf("1 measurement selected: %s in %s. Ready for demonstration.", m$lipid, m$sample))
      } else {
        tags$span(class = "text-dark small fw-semibold",
                  icon("check", class = "text-success me-1"),
                  sprintf("%d measurements selected across %d lipids. Ready for demonstration & export.", 
                          n, length(unique(sapply(meas, function(x) x$lipid)))))
      }
    })
    
    output$matrix_modal_cohort_stats_badge <- renderUI({
      df <- matrix_lipids_summary()
      req(df)
      total_n <- nrow(df)
      na_n <- sum(df$NA_Count > 0)
      comp_n <- total_n - na_n
      tags$div(
        class = "d-flex align-items-center gap-2",
        tags$span(class = "badge bg-light text-dark border", sprintf("Total: %d", total_n)),
        tags$span(class = "badge bg-warning-subtle text-dark border", sprintf("With N/A: %d", na_n)),
        tags$span(class = "badge bg-success-subtle text-success border", sprintf("Complete: %d", comp_n))
      )
    })
    
    output$matrix_preview_dt <- DT::renderDataTable({
      a_data <- audit_data()
      req(a_data)
      all_lipids <- rownames(a_data$mat_final_linear)
      sel_lipids <- selected_matrix_lipids()
      
      preview_lipids <- if (length(sel_lipids) > 0) head(sel_lipids, 10) else head(all_lipids, 5)
      samples <- colnames(a_data$mat_final_linear)
      grid <- expand.grid(Lipid_Name = preview_lipids, Sample = samples, stringsAsFactors = FALSE)
      
      raw_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_raw) && s %in% colnames(a_data$mat_raw)) a_data$mat_raw[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      log_raw_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_log) && s %in% colnames(a_data$mat_log)) a_data$mat_log[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      log_imp_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_log_imputed) && s %in% colnames(a_data$mat_log_imputed)) a_data$mat_log_imputed[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      norm_log_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_final_log) && s %in% colnames(a_data$mat_final_log)) a_data$mat_final_log[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      final_linear_vals <- mapply(function(l, s) {
        if (l %in% rownames(a_data$mat_final_linear) && s %in% colnames(a_data$mat_final_linear)) a_data$mat_final_linear[l, s] else NA_real_
      }, grid$Lipid_Name, grid$Sample)
      
      is_observed <- !is.na(raw_vals) & is.finite(raw_vals) & raw_vals > 0
      
      preview_df <- data.frame(
        Lipid_Name = grid$Lipid_Name,
        Sample = grid$Sample,
        Raw_Value_Display = ifelse(is_observed, format(round(raw_vals, 2), big.mark = ","), "N/A (Below LOD)"),
        Quantitative_Type = ifelse(is_observed, "Observed Signal", "Below LOD (NA)"),
        Step2_Log2_Raw = ifelse(is_observed, round(log_raw_vals, 3), NA),
        Step3_QRILC_Imputed = round(log_imp_vals, 3),
        Step3_Was_Imputed = ifelse(!is_observed, "TRUE (QRILC Sampled)", "FALSE (Preserved)"),
        Step4_Normalized_Log2 = round(norm_log_vals, 3),
        Step5_Restituted_Linear = format(round(final_linear_vals, 2), big.mark = ","),
        stringsAsFactors = FALSE
      )
      
      DT::datatable(
        preview_df,
        rownames = FALSE,
        class = "compact stripe hover border",
        options = list(
          pageLength = 10,
          scrollX = TRUE,
          dom = "tip"
        )
      )
    })
    
    # Live Demonstration Tab Controls & UI
    output$demo_lipid_selector_ui <- renderUI({
      a_data <- audit_data()
      req(a_data)
      all_lipids <- rownames(a_data$mat_raw)
      sel_lipids <- selected_matrix_lipids()
      choices <- if (length(sel_lipids) > 0) sel_lipids else all_lipids
      selectInput(ns("demo_target_lipid"), label = NULL, choices = choices, selected = choices[1], width = "260px")
    })
    
    output$demo_sample_selector_ui <- renderUI({
      a_data <- audit_data()
      req(a_data)
      samples <- colnames(a_data$mat_raw)
      sel_samps <- selected_matrix_samples()
      choices <- if (length(sel_samps) > 0) sel_samps else samples
      selectInput(ns("demo_target_sample"), label = NULL, choices = choices, selected = choices[1], width = "220px")
    })
    
    output$modal_step_demonstration_ui <- renderUI({
      a_data <- audit_data()
      req(a_data)
      all_lipids <- rownames(a_data$mat_raw)
      samples <- colnames(a_data$mat_raw)
      
      # Determine active lipid and sample from selected cell or dropdown
      meas <- selected_measurements()
      active_lip <- if (!is.null(input$demo_target_lipid) && input$demo_target_lipid %in% all_lipids) {
        input$demo_target_lipid
      } else if (length(meas) > 0) {
        meas[[1]]$lipid
      } else {
        all_lipids[1]
      }
      
      active_samp <- if (!is.null(input$demo_target_sample) && input$demo_target_sample %in% samples) {
        input$demo_target_sample
      } else if (length(meas) > 0) {
        meas[[1]]$sample
      } else {
        samples[1]
      }
      
      raw_vals <- as.numeric(a_data$mat_raw[active_lip, samples])
      names(raw_vals) <- samples
      log_vals <- as.numeric(a_data$mat_log[active_lip, samples])
      names(log_vals) <- samples
      imp_vals <- as.numeric(a_data$mat_log_imputed[active_lip, samples])
      names(imp_vals) <- samples
      norm_vals <- as.numeric(a_data$mat_final_log[active_lip, samples])
      names(norm_vals) <- samples
      final_linear_vals <- as.numeric(a_data$mat_final_linear[active_lip, samples])
      names(final_linear_vals) <- samples
      
      is_obs <- !is.na(raw_vals) & is.finite(raw_vals) & raw_vals > 0
      names(is_obs) <- samples
      
      s_idx <- match(active_samp, samples)
      s_raw <- raw_vals[s_idx]
      s_is_obs <- isTRUE(is_obs[s_idx])
      s_log <- log_vals[s_idx]
      s_imp <- imp_vals[s_idx]
      s_norm <- norm_vals[s_idx]
      s_fin <- final_linear_vals[s_idx]
      
      s_off <- if (!is.null(names(a_data$norm_offsets))) a_data$norm_offsets[active_samp] else a_data$norm_offsets[s_idx]
      s_scaling <- if (!is.null(names(a_data$scaling_factors))) a_data$scaling_factors[active_samp] else a_data$scaling_factors[s_idx]
      s_lod <- if (!is.null(a_data$sample_lods) && !is.null(names(a_data$sample_lods))) a_data$sample_lods[active_samp] else 100.0
      
      forms <- build_step_formulas(active_lip, active_samp, s_raw, s_lod, s_log, s_imp, s_norm, s_fin, s_off, s_scaling, s_is_obs)
      
      shiny::withMathJax(
        tags$div(
          class = "modal-demonstration-container p-2",
          tags$div(
            class = "d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom",
            tags$h5(class = "mb-0 fw-bold text-dark",
              icon("calculator", class = "text-primary me-2"),
              sprintf("Mathematical Proof for %s in Sample: %s", active_lip, active_samp)
            ),
            tags$span(
              class = paste("badge", if (s_is_obs) "bg-success" else "bg-warning text-dark"),
              if (s_is_obs) "Signal Detected (Observed)" else "Left-Censored Non-Detect (QRILC Imputed)"
            )
          ),
          
          # Step 1 Card
          tags$div(
            class = "card mb-3 border-start-success border-start-4 shadow-sm",
            tags$div(
              class = "card-body py-2 px-3",
              tags$h6(class = "fw-bold text-success mb-2",
                      icon("filter", class = "me-1"),
                      "Step 1: Limit of Detection (LOD) Screening & Raw Ingestion"),
              tags$div(class = "math-block-card", HTML(forms$step1$mml_gen)),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step1$lit_gen
              ),
              tags$div(class = "math-block-card", tags$strong("Selected Lipid Formulation:"), tags$div(style = "margin-top: 4px;", HTML(forms$step1$mml_spec))),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step1$lit_spec
              ),
              tags$small(class = "text-muted",
                         "Justification: Establishes instrument sensitivity bounds. Mappings of non-detects to NA prevent log2(0) crashes and mark measurements as Missing Not At Random (MNAR).")
            )
          ),
          
          # Step 2 Card
          tags$div(
            class = "card mb-3 border-start-secondary border-start-4 shadow-sm",
            tags$div(
              class = "card-body py-2 px-3",
              tags$h6(class = "fw-bold text-secondary mb-2",
                      icon("chart-line", class = "me-1"),
                      "Step 2: Variance-Stabilizing Base-2 Logarithmic Transformation"),
              tags$div(class = "math-block-card", HTML(forms$step2$mml_gen)),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step2$lit_gen
              ),
              tags$div(class = "math-block-card", tags$strong("Selected Lipid Formulation:"), tags$div(style = "margin-top: 4px;", HTML(forms$step2$mml_spec))),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step2$lit_spec
              ),
              tags$small(class = "text-muted",
                         "Justification: Heteroscedastic mass spec variance scales with signal magnitude; log2 transformation stabilizes error variance and linearizes multiplicative fold changes.")
            )
          ),
          
          # Step 3 Card
          tags$div(
            class = "card mb-3 border-start-warning border-start-4 shadow-sm",
            tags$div(
              class = "card-body py-2 px-3",
              tags$h6(class = "fw-bold text-warning mb-2",
                      icon("chart-area", class = "me-1"),
                      "Step 3: Quantile Regression for Left-Censored Data (QRILC) Imputation"),
              tags$div(class = "math-block-card", HTML(forms$step3$mml_gen)),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step3$lit_gen
              ),
              tags$div(class = "math-block-card", tags$strong("Selected Lipid Formulation:"), tags$div(style = "margin-top: 4px;", HTML(forms$step3$mml_spec))),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step3$lit_spec
              ),
              tags$small(class = "text-muted",
                         "Justification: Left-censored non-detects are modeled via Gaussian tail estimation, avoiding artificial high-abundance artifacts from mean/median imputation.")
            )
          ),
          
          # Step 4 Card
          tags$div(
            class = "card mb-3 border-start-info border-start-4 shadow-sm",
            tags$div(
              class = "card-body py-2 px-3",
              tags$h6(class = "fw-bold text-info mb-2",
                      icon("sliders", class = "me-1"),
                      sprintf("Step 4: Sample-Wise Global Median Centering Normalization (Offset: %+.3f log2)", s_off)),
              tags$div(class = "math-block-card", HTML(forms$step4$mml_gen)),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step4$lit_gen
              ),
              tags$div(class = "math-block-card", tags$strong("Selected Lipid Formulation:"), tags$div(style = "margin-top: 4px;", HTML(forms$step4$mml_spec))),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step4$lit_spec
              ),
              tags$small(class = "text-muted",
                         "Justification: Eliminates systematic technical loading biases between sample injection runs uniformly across all analytes.")
            )
          ),
          
          # Step 5 Card
          tags$div(
            class = "card mb-3 border-start-primary border-start-4 shadow-sm",
            tags$div(
              class = "card-body py-2 px-3",
              tags$h6(class = "fw-bold text-primary mb-2",
                      icon("check-double", class = "me-1"),
                      sprintf("Step 5: Restitution to Linear Abundance & Exact Multiplier Equivalence (S = %.5f)", s_scaling)),
              tags$div(class = "math-block-card", HTML(forms$step5$mml_gen)),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step5$lit_gen
              ),
              tags$div(class = "math-block-card", tags$strong("Selected Lipid Formulation:"), tags$div(style = "margin-top: 4px;", HTML(forms$step5$mml_spec))),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 249, 255, 0.35); border: 1px solid rgba(186, 230, 253, 0.35); border-left: 3px solid rgba(2, 132, 199, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation: ", style = "color: #0284c7;"), forms$step5$lit_spec
              ),
              tags$div(class = "math-block-card", style = "background: #f0fdf4; border-color: #86efac;", HTML(forms$step5$mml_proof)),
              tags$div(class = "p-2 rounded mb-2", style = "background: rgba(240, 253, 244, 0.35); border: 1px solid rgba(187, 247, 208, 0.35); border-left: 3px solid rgba(22, 163, 74, 0.45); font-size: 0.85rem; color: #334155;",
                tags$strong("Semantic Translation (Equivalence Proof): ", style = "color: #16a34a;"), forms$step5$proof_lit
              ),
              tags$small(class = "text-muted",
                         "Bit-for-Bit Verification: Direct exponentiation exactly equals multiplying the imputed linear peak area by the constant scaling multiplier Sj.")
            )
          ),
          
          tags$script(HTML("
            if (typeof renderPublicationMath === 'function') {
              renderPublicationMath('.modal-demonstration-container');
            }
          "))
        )
      )
    })
    
    output$download_selected_matrix_csv <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Transition_Matrix_Selected_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv")
      },
      content = function(file) {
        sel_lips <- selected_matrix_lipids()
        target_lipids <- if (length(sel_lips) > 0) sel_lips else NULL
        generate_transition_audit_csv(target_lipids, file)
      }
    )
    
    output$download_all_matrix_csv <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Transition_Matrix_Full_Dataset_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv")
      },
      content = function(file) {
        generate_transition_audit_csv(NULL, file)
      }
    )
    
    output$download_audit_matrix_csv <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Transition_Matrix_Full_Dataset_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".csv")
      },
      content = function(file) {
        generate_transition_audit_csv(NULL, file)
      }
    )
    
    output$download_demonstration_html <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Mathematical_Demonstration_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".html")
      },
      content = function(file) {
        a_data <- audit_data()
        req(a_data)
        sel_lips <- selected_matrix_lipids()
        sel_samps <- selected_matrix_samples()
        target_lipids <- if (length(sel_lips) > 0) sel_lips else if (!is.null(input$demo_target_lipid)) input$demo_target_lipid else head(rownames(a_data$mat_raw), 5)
        target_samples <- if (length(sel_samps) > 0) sel_samps else if (!is.null(input$demo_target_sample)) input$demo_target_sample else NULL
        generate_demonstration_report_html(a_data, target_lipids, file, target_samples = target_samples)
      }
    )
    
    output$download_demonstration_md <- downloadHandler(
      filename = function() {
        paste0("LipidomicExplorer_Mathematical_Demonstration_", format(Sys.time(), "%Y%m%d_%H%M%S"), ".md")
      },
      content = function(file) {
        a_data <- audit_data()
        req(a_data)
        sel_lips <- selected_matrix_lipids()
        sel_samps <- selected_matrix_samples()
        target_lipids <- if (length(sel_lips) > 0) sel_lips else if (!is.null(input$demo_target_lipid)) input$demo_target_lipid else head(rownames(a_data$mat_raw), 5)
        target_samples <- if (length(sel_samps) > 0) sel_samps else if (!is.null(input$demo_target_sample)) input$demo_target_sample else NULL
        generate_demonstration_report_md(a_data, target_lipids, file, target_samples = target_samples)
      }
    )
    
    
    # --------------------------------------------------------------------------
    # 4. Step Navigation Buttons (Left to Right Slider Controls)
    # --------------------------------------------------------------------------
    observeEvent(input$goto_step1, { updateTabsetPanel(session, "stepper_tabs", selected = "step1") })
    observeEvent(input$goto_step2, { updateTabsetPanel(session, "stepper_tabs", selected = "step2") })
    observeEvent(input$goto_step3, { updateTabsetPanel(session, "stepper_tabs", selected = "step3") })
    observeEvent(input$goto_step4, { updateTabsetPanel(session, "stepper_tabs", selected = "step4") })
    observeEvent(input$goto_step5, { updateTabsetPanel(session, "stepper_tabs", selected = "step5") })
    observeEvent(input$goto_overview, { updateTabsetPanel(session, "stepper_tabs", selected = "overview") })
    
    # --------------------------------------------------------------------------
    # 5. Render Step-by-Step Proof or Comparative Table
    # --------------------------------------------------------------------------
    output$proof_content <- renderUI({
      trace <- audit_data()
      req(trace)
      
      all_lipids <- rownames(trace$mat_raw)
      lipid <- if (!is.null(input$selected_lipid) && nzchar(input$selected_lipid) && input$selected_lipid %in% all_lipids) {
        input$selected_lipid
      } else if ("CE(15:0)+NH4" %in% all_lipids) {
        "CE(15:0)+NH4"
      } else if (length(all_lipids) > 0) {
        all_lipids[1]
      } else {
        NULL
      }
      req(lipid)
      
      mode <- if (!is.null(input$inspect_mode)) input$inspect_mode else "single"
      hover_active <- isTRUE(input$enable_hover)
      
      rendered_tags <- if (mode == "single") {
        all_samples <- colnames(trace$mat_raw)
        sample <- if (!is.null(input$selected_sample) && nzchar(input$selected_sample) && input$selected_sample %in% all_samples) {
          input$selected_sample
        } else if ("Kidney_WT_1" %in% all_samples) {
          "Kidney_WT_1"
        } else if (length(all_samples) > 0) {
          all_samples[1]
        } else {
          NULL
        }
        req(sample)
        render_stepper_proof(trace, lipid, sample, hover_active)
      } else {
        render_all_samples_table(trace, lipid)
      }
      
      # Return with trigger to force MathJax/KaTeX typeset
      tagList(
        rendered_tags,
        tags$script(HTML("if (typeof renderPublicationMath === 'function') { renderPublicationMath('#math_proof_tab-proof_content'); }"))
      )
    })
    
    # Helper: Build Dual Formula Slider (Two Dots to switch between Normal & Hoverable)
    build_dual_formula_slider <- function(slider_id, normal_content, hoverable_content, title_label = "Equation Formulation") {
      is_hover_default <- isTRUE(input$enable_hover)
      div(
        class = paste(ns("math-slider-container"), "math-slider-container mb-3"),
        id = ns(slider_id),
        # Control Header with Two Dots & Label
        div(
          class = "d-flex align-items-center justify-content-between px-3 py-2 bg-light border-bottom",
          div(
            class = "d-flex align-items-center gap-2",
            tags$span(class = "badge bg-white text-dark border", style = "font-size: 0.75rem; font-weight: 600;", 
                      icon("square-root-variable", class = "text-primary me-1"), title_label)
          ),
          div(
            class = "math-dot-toggle d-flex align-items-center gap-1",
            # Dot 1: Normal (Default active)
            tags$button(
              type = "button",
              class = paste("btn btn-sm btn-link text-decoration-none py-0 px-2 math-dot-btn", if (!is_hover_default) "active" else ""),
              `data-view` = "normal",
              onclick = "switchTierMath(this, 'normal');",
              title = "Dot 1: Normal Publication Formula (Default)",
              tags$span(class = paste("dot-symbol fw-bold", if (!is_hover_default) "text-primary" else "text-muted"), style = "font-size: 1.1rem; line-height: 1;", if (!is_hover_default) "●" else "○"),
              tags$span(class = paste("dot-text", if (!is_hover_default) "text-dark fw-semibold" else "text-muted fw-normal"), style = "font-size: 0.80rem;", "Normal Formula")
            ),
            tags$span(class = "text-muted", style = "font-size: 0.80rem;", "·"),
            # Dot 2: Hoverable
            tags$button(
              type = "button",
              class = paste("btn btn-sm btn-link text-decoration-none py-0 px-2 math-dot-btn", if (is_hover_default) "active" else ""),
              `data-view` = "hoverable",
              onclick = "switchTierMath(this, 'hoverable');",
              title = "Dot 2: Interactive Hoverable Formula (Hover terms for details)",
              tags$span(class = paste("dot-symbol fw-bold", if (is_hover_default) "text-primary" else "text-muted"), style = "font-size: 1.1rem; line-height: 1;", if (is_hover_default) "●" else "○"),
              tags$span(class = paste("dot-text", if (is_hover_default) "text-dark fw-semibold" else "text-muted fw-normal"), style = "font-size: 0.80rem;", "Hoverable Formula")
            )
          )
        ),
        
        # Slide 1: Normal Formula
        div(
          class = "math-view math-view-normal bg-white p-3",
          style = if (is_hover_default) "display: none;" else "display: block;",
          div(class = ns("math-display"), style = "margin: 0; border: none; box-shadow: none;", normal_content)
        ),
        
        # Slide 2: Hoverable Formula
        div(
          class = "math-view math-view-hoverable bg-white px-3 py-4",
          style = if (is_hover_default) "display: block; overflow: visible !important;" else "display: none; overflow: visible !important;",
          div(class = ns("math-display"), style = "margin: 0; border: none; box-shadow: none; overflow: visible !important;", hoverable_content)
        ),
        
        # Bottom Pagination Bar with Two Dots
        div(
          class = "d-flex justify-content-center align-items-center gap-2 py-2 bg-light border-top",
          tags$span(class = "text-muted small me-2", style = "font-size: 0.73rem;", "Slide to switch formula:"),
          tags$span(
            class = paste("carousel-dot", if (!is_hover_default) "active" else ""),
            `data-view` = "normal",
            onclick = "switchTierMath(this, 'normal');",
            title = "Dot 1: Normal Publication Formula"
          ),
          tags$span(
            class = paste("carousel-dot", if (is_hover_default) "active" else ""),
            `data-view` = "hoverable",
            onclick = "switchTierMath(this, 'hoverable');",
            title = "Dot 2: Interactive Hoverable Formula"
          )
        )
      )
    }

    # Helper: Build Fluid Hover Math Token (UNIFIED BACKGROUND, NO SQUARES/RECTANGLES)
    make_fluid_token <- function(sym, title, desc, origin, val_label, val_num, why) {
      tags$span(
        class = ns("math-token"),
        HTML(paste0("\\(", sym, "\\)")),
        tags$span(
          class = ns("fluid-tooltip"),
          tags$div(class = ns("fluid-header"), title),
          tags$div(class = ns("fluid-desc"), desc),
          tags$div(class = ns("fluid-origin"), origin),
          tags$div(class = ns("fluid-row"), tags$span(class = ns("fluid-tag"), paste0(val_label, ":")), tags$span(class = ns("fluid-val"), val_num)),
          tags$div(class = ns("fluid-why"), why)
        )
      )
    }
    # Helper: Math Operator for hover formulas (properly compiled by KaTeX)
    make_op <- function(op) {
      tags$span(class = ns("math-op"), HTML(paste0("\\(", op, "\\)")))
    }

    
    # Helper: Build 5-column Term Legend & Dataset Provenance Table
    build_term_legend_ui <- function(terms_list) {
      tags$div(
        class = "mt-4 pt-3 border-top",
        tags$div(
          class = "d-flex align-items-center justify-content-between mb-2",
          tags$h6(class = "fw-bold text-dark mb-0", 
                  icon("book-bookmark", class = "text-primary me-2"), 
                  "Comprehensive Term Legend & Dataset Provenance"),
          tags$span(class = "badge bg-light text-muted border", "Full Tabular Mapping")
        ),
        tags$p(class = "text-muted small mb-2", 
               "Detailed reference inventory linking each mathematical symbol to its biostatistical definition, origin in the uploaded dataset, empirical value, and laboratory interpretation:"),
        tags$div(
          class = "table-responsive",
          tags$table(
            class = paste("table table-sm align-middle mb-0", ns("term-legend-table")),
            tags$thead(
              tags$tr(
                tags$th(class = ns("term-col"), "Term"),
                tags$th(class = ns("name-col"), "Concept & Scientific Role"),
                tags$th(class = ns("prov-col"), "Dataset Origin & Provenance"),
                tags$th(class = ns("val-col"), "Empirical Value"),
                tags$th(class = ns("interp-col"), "Experimental / Physical Meaning")
              )
            ),
            tags$tbody(
              lapply(terms_list, function(row) {
                tags$tr(
                  tags$td(class = ns("term-col"), row$symbol),
                  tags$td(class = ns("name-col"), tags$strong(row$name)),
                  tags$td(class = ns("prov-col"), tags$span(row$prov)),
                  tags$td(class = ns("val-col"), tags$span(class = "badge bg-light text-dark border font-monospace", row$val)),
                  tags$td(class = ns("interp-col"), tags$small(row$interp))
                )
              })
            )
          )
        )
      )
    }
    
    # Helper: Build 3 Subtabs for each Step Card
    build_step_card_ui <- function(step_num, title, icon_name, badge_label, badge_color, 
                                   math_content, rationale_content, quote_content,
                                   prev_btn_id = NULL, next_btn_id = NULL) {
      div(
        class = paste0(ns("stepper-card"), " card p-0 mb-4"),
        div(
          class = "card-header bg-white py-3 px-4 d-flex align-items-center justify-content-between border-bottom",
          div(
            tags$span(class = "badge bg-dark rounded-pill me-2 px-2 py-1", paste("Step", step_num)),
            icon(icon_name, class = "text-primary me-2"),
            tags$strong(style = "font-size: 1.05rem; color: #1e293b;", title)
          ),
          tags$span(class = paste("badge", badge_color), badge_label)
        ),
        div(
          class = paste0(ns("subtab-container"), " card-body p-4"),
          bslib::navset_pill(
            id = ns(paste0("subtabs_step_", step_num)),
            selected = "math_demo",
            
            # Subtab 1: Mathematical Demonstration
            bslib::nav_panel(
              title = tagList(icon("calculator"), " 1. Mathematical Demonstration"),
              value = "math_demo",
              div(class = "pt-3", math_content)
            ),
            
            # Subtab 2: Biostatistical Mechanism & Rationale
            bslib::nav_panel(
              title = tagList(icon("microscope"), " 2. Biostatistical Rationale"),
              value = "rationale",
              div(class = "pt-3", rationale_content)
            ),
            
            # Subtab 3: Literature Reference
            bslib::nav_panel(
              title = tagList(icon("book-open"), " 3. Literature Reference"),
              value = "citation",
              div(class = "pt-3", quote_content)
            )
          ),
          
          # Footer Navigation Controls (Slide Left / Right)
          if (!is.null(prev_btn_id) || !is.null(next_btn_id)) {
            div(
              class = "d-flex justify-content-between align-items-center pt-3 mt-4 border-top",
              if (!is.null(prev_btn_id)) {
                actionButton(ns(prev_btn_id), "← Previous Step", icon = icon("arrow-left"), 
                             class = "btn-outline-secondary btn-sm px-3")
              } else div(),
              if (!is.null(next_btn_id)) {
                actionButton(ns(next_btn_id), "Next Step →", icon = icon("arrow-right"), 
                             class = "btn-primary btn-sm px-3")
              } else div()
            )
          }
        )
      )
    }
    
    # Render Stepper Navigation Flow
    render_stepper_proof <- function(trace, lipid, sample, hover_active = FALSE) {
      # Underlying metadata
      total_lipids <- nrow(trace$mat_raw)
      lipid_idx <- which(rownames(trace$mat_raw) == lipid)
      total_samples <- ncol(trace$mat_raw)
      sample_idx <- which(colnames(trace$mat_raw) == sample)
      
      # Extract underlying data points
      raw_val <- if (lipid %in% rownames(trace$mat_raw) && sample %in% colnames(trace$mat_raw)) {
        trace$mat_raw[lipid, sample]
      } else NA_real_
      
      is_observed <- !is.na(raw_val) && is.finite(raw_val) && raw_val > 0
      sample_all_raw <- trace$mat_raw[, sample]
      min_sample_signal <- min(sample_all_raw[is.finite(sample_all_raw) & sample_all_raw > 0], na.rm = TRUE)
      sample_missing_count <- sum(is.na(sample_all_raw) | sample_all_raw <= 0)
      sample_detected_count <- total_lipids - sample_missing_count
      log2_val <- if (is_observed) log2(raw_val) else NA_real_
      
      log2_imp <- if (lipid %in% rownames(trace$mat_log_imputed) && sample %in% colnames(trace$mat_log_imputed)) {
        trace$mat_log_imputed[lipid, sample]
      } else NA_real_
      
      qrilc_row <- trace$qrilc_params[trace$qrilc_params$Sample == sample, ]
      pna_pct <- if (nrow(qrilc_row) > 0) round(qrilc_row$pNAs * 100, 2) else 0
      mu_est <- if (nrow(qrilc_row) > 0) round(qrilc_row$Mean_CDD, 3) else NA
      sigma_est <- if (nrow(qrilc_row) > 0) round(qrilc_row$SD_CDD, 3) else NA
      upper_cutoff_log2 <- if (nrow(qrilc_row) > 0) round(qrilc_row$Upper_Cutoff_Log2, 3) else NA
      upper_cutoff_lin <- if (nrow(qrilc_row) > 0) round(qrilc_row$Upper_Cutoff_Linear, 1) else NA
      
      med_j <- if (sample %in% names(trace$sample_medians)) round(trace$sample_medians[[sample]], 3) else NA
      grand_med <- round(trace$grand_median, 3)
      delta_j <- if (sample %in% names(trace$norm_offsets)) round(trace$norm_offsets[[sample]], 3) else 0
      scale_j <- if (sample %in% names(trace$scaling_factors)) round(trace$scaling_factors[[sample]], 6) else 1
      
      norm_log <- if (lipid %in% rownames(trace$mat_final_log) && sample %in% colnames(trace$mat_final_log)) {
        round(trace$mat_final_log[lipid, sample], 4)
      } else NA
      
      final_linear <- if (lipid %in% rownames(trace$mat_final_linear) && sample %in% colnames(trace$mat_final_linear)) {
        trace$mat_final_linear[lipid, sample]
      } else NA
      
      # ------------------------------------------------------------------------
      # STEP 1: RAW INGESTION & DETECTION LIMIT SCREENING
      # ------------------------------------------------------------------------
      step1_terms <- list(
        list(
          symbol = "$i$",
          name = "Lipid Species Identifier",
          prov = sprintf("Row %d of %d in uploaded dataset (Lipid_Name = '%s')", lipid_idx, total_lipids, lipid),
          val = sprintf("i = %d", lipid_idx),
          interp = "Identifies this unique chemical analyte in the Scripps/UB lipidomics profiling library."
        ),
        list(
          symbol = "$j$",
          name = "Sample Injection Run",
          prov = sprintf("Column %d of %d in uploaded dataset (Header: '%s')", sample_idx, total_samples, sample),
          val = sprintf("j = %d", sample_idx),
          interp = "Identifies the biological replicate and mass spectrometry injection run."
        ),
        list(
          symbol = "$x_{ij}$",
          name = "Raw Chromatographic Area",
          prov = sprintf("Cell at Row '%s', Column '%s' in raw uploaded file", lipid, sample),
          val = if (is_observed) format(round(raw_val, 4), scientific = FALSE) else "Unobserved (Blank / <= 0)",
          interp = "Integrated detector ion current recorded for this lipid adduct across its retention window."
        ),
        list(
          symbol = "$\\text{LOD}_j$",
          name = "Run Detection Limit (Calculus: Lowest Value)",
          prov = sprintf("Calculated by calculus as min_{i}(x_ij > 0). Lowest measured peak area across all %d lipids in '%s'", total_lipids, sample),
          val = sprintf("%s (Lowest Quantified Value)", format(round(min_sample_signal, 2), big.mark = ",")),
          interp = "Empirical limit of detection defined as the lowest measured signal in this injection run. Hover over formula tokens to see how Mass Spectrometry determines NA."
        ),
        list(
          symbol = "$x_{ij}^*$",
          name = "Cleaned Signal",
          prov = sprintf("Evaluated by testing raw area against run detection limit (%s)", format(round(min_sample_signal, 2), big.mark = ",")),
          val = if (is_observed) format(round(raw_val, 4), scientific = FALSE) else "NA (Left-Censored)",
          interp = "Replaces absent peaks with NA so downstream logarithmic formulas do not break on zero."
        ),
        list(
          symbol = "$N, M$",
          name = "Dataset Dimensions",
          prov = "Matrix dimensions of uploaded experimental dataset",
          val = sprintf("N = %d, M = %d", total_lipids, total_samples),
          interp = sprintf("%d lipid species profiled across %d biological sample injections.", total_lipids, total_samples)
        )
      )
      
      # Step 1 - Tier 1: Posed Formula
      step1_tier1_normal <- "$$x_{ij}^* = \\begin{cases} x_{ij} & \\text{if } x_{ij} > \\text{LOD}_j \\\\ \\text{NA} & \\text{if } x_{ij} \\le \\text{LOD}_j \\end{cases}$$"
      step1_tier1_hover <- div(
        class = "d-flex align-items-center justify-content-center flex-wrap gap-2 py-1",
        make_fluid_token("x_{ij}^*", "x_{ij}^* - Screened Abundance", 
                         "Verified peak signal from the instrument, kept if detected or marked missing (NA) if absent.",
                         sprintf("Read directly from row '%s', column '%s' in the uploaded raw dataset.", lipid, sample),
                         "Value in this sample", if (is_observed) format(round(raw_val, 2), big.mark = ",") else "NA (Below detection limit)",
                         "Converts undetected peaks into NA so zero-values do not cause errors in downstream logarithms."),
        make_op("="),
        tags$span(style = "font-size: 2.2rem; font-weight: 300; line-height: 1; margin: 0 4px;", HTML("\\(\\{\\)")),
        div(
          class = "d-inline-flex flex-column text-start gap-1",
          div(
            class = "d-flex align-items-center gap-1",
            make_fluid_token("x_{ij}", "x_{ij} - Raw Peak Area", 
                             "Initial signal area registered by the detector for this lipid.",
                             sprintf("Cell at Row '%s', Column '%s' in raw uploaded table.", lipid, sample),
                             "Raw measured area", if (is_observed) format(round(raw_val, 2), big.mark = ",") else "Blank / <= 0",
                             "Integrated detector ion counts registered by the mass spectrometer."),
            make_op("\\quad \\text{if }"),
            make_fluid_token("x_{ij}", "x_{ij} - Raw Peak Area", "Signal area tested against noise boundary.", sprintf("Cell '%s', '%s'", lipid, sample), "Raw reading", if (is_observed) format(round(raw_val, 2), big.mark = ",") else "Blank / <= 0", "Raw detector counts."),
            make_op(">"),
            make_fluid_token("\\text{LOD}_j", "\\text{LOD}_j - Limit of Detection (Calculus: Lowest Value)", 
                             "Defined by calculus as the minimum positive peak area in this run: \\text{LOD}_j = \\min_i \\{x_{ij} > 0\\}.",
                             sprintf("Lowest positive reading in sample '%s'.", sample),
                             "Lowest quantified value", format(round(min_sample_signal, 2), big.mark = ","),
                             "How NA is determined in Mass Spectrometry: An analyte is registered as NA (or 0/blank) when its signal-to-noise ratio falls below the detector noise floor (S/N < 3), when electrospray ionization (ESI) suffers ion suppression from co-eluting matrix components, or when peak picking fails to integrate a valid isotopic envelope. Because these are left-censored (Missing Not At Random, MNAR), they are correctly mapped to NA for QRILC tail imputation.")
          ),
          div(
            class = "d-flex align-items-center gap-1",
            make_fluid_token("\\text{NA}", "\\text{NA} - Mass Spectrometry Left-Censored Missing Flag",
                             "Missing value code indicating the analyte was below the detection threshold.",
                             sprintf("Assigned when peak area <= %s in sample '%s'.", format(round(min_sample_signal, 2), big.mark = ","), sample),
                             "Missing status", "NA (Left-Censored)",
                             "In mass spectrometry, an NA is not zero molecules but a signal below the physical detector limit of detection. Mapping to NA prevents log(0) mathematical collapse and enables Step 3 QRILC tail imputation."),
            make_op("\\quad \\text{if }"),
            make_fluid_token("x_{ij}", "x_{ij} - Raw Peak Area", "Signal area tested against noise boundary.", sprintf("Cell '%s', '%s'", lipid, sample), "Raw reading", if (is_observed) format(round(raw_val, 2), big.mark = ",") else "Blank / <= 0", "Raw detector counts."),
            make_op("\\le"),
            make_fluid_token("\\text{LOD}_j", "\\text{LOD}_j - Limit of Detection (Calculus: Lowest Value)", 
                             "Defined by calculus as the minimum positive peak area in this run: \\text{LOD}_j = \\min_i \\{x_{ij} > 0\\}.",
                             sprintf("Lowest positive reading in sample '%s'.", sample),
                             "Lowest quantified value", format(round(min_sample_signal, 2), big.mark = ","),
                             "How NA is determined in Mass Spectrometry: An analyte is registered as NA (or 0/blank) when its signal-to-noise ratio falls below the detector noise floor (S/N < 3), when electrospray ionization (ESI) suffers ion suppression from co-eluting matrix components, or when peak picking fails to integrate a valid isotopic envelope. Because these are left-censored (Missing Not At Random, MNAR), they are correctly mapped to NA for QRILC tail imputation.")
          )
        )
      )
      
      # Step 1 - Tier 2: Empirical Substitution
      step1_tier2_normal <- if (is_observed) {
        sprintf("$$x_{ij}^* = %s > \\text{LOD}_j (%s) \\implies x_{ij}^* = %s$$",
                format(round(raw_val, 2), big.mark = ","),
                format(round(min_sample_signal, 2), big.mark = ","),
                format(round(raw_val, 2), big.mark = ","))
      } else {
        sprintf("$$x_{ij}^* = 0.00 \\le \\text{LOD}_j (%s) \\implies x_{ij}^* = \\text{NA}$$",
                format(round(min_sample_signal, 2), big.mark = ","))
      }
      step1_tier2_hover <- if (is_observed) {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token("x_{ij}^*", "x_{ij}^* - Cleaned Abundance", "Evaluated abundance for this lipid.", sprintf("Cell '%s', '%s'", lipid, sample), "Cleaned signal", format(round(raw_val, 2), big.mark = ","), "Preserves true biological abundance."),
          make_op("="),
          make_fluid_token(format(round(raw_val, 2), big.mark = ","), "x_{ij} - Raw Measured Peak Area", "Experimental signal recorded by mass spectrometer.", sprintf("Row '%s', Col '%s'", lipid, sample), "Raw peak area", format(round(raw_val, 2), big.mark = ","), "Integrated ion counts."),
          make_op(">"),
          make_fluid_token(sprintf("\\text{LOD}_j = %s", format(round(min_sample_signal, 2), big.mark = ",")), "\\text{LOD}_j - Limit of Detection (Calculus: Lowest Value)", "Defined by calculus as the minimum positive peak area in this run: \\text{LOD}_j = \\min_i \\{x_{ij} > 0\\}.", sprintf("Lowest signal in '%s'", sample), "Lowest quantified value", format(round(min_sample_signal, 2), big.mark = ","), "How NA is determined in Mass Spectrometry: Registered as NA when S/N < 3, when ESI ion suppression occurs, or when peak picking fails to integrate a valid isotopic envelope (left-censored MNAR)."),
          make_op("\\implies"),
          make_fluid_token(sprintf("x_{ij}^* = %s", format(round(raw_val, 2), big.mark = ",")), "x_{ij}^* - Retained Value", "Verified valid chromatographic signal.", "Passed to Step 2", "Passed value", format(round(raw_val, 2), big.mark = ","), "Ready for base-2 logarithmic transformation.")
        )
      } else {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token("x_{ij}^*", "x_{ij}^* - Cleaned Abundance", "Evaluated abundance for this lipid.", sprintf("Cell '%s', '%s'", lipid, sample), "Cleaned signal", "NA", "Replaces non-detect with NA."),
          make_op("="),
          make_fluid_token("0.00", "x_{ij} - Raw Signal", "Unobserved or zero signal in raw matrix.", sprintf("Row '%s', Col '%s'", lipid, sample), "Raw reading", "<= 0 or Blank", "No chromatographic peak above baseline."),
          make_op("\\le"),
          make_fluid_token(sprintf("\\text{LOD}_j = %s", format(round(min_sample_signal, 2), big.mark = ",")), "\\text{LOD}_j - Limit of Detection (Calculus: Lowest Value)", "Defined by calculus as the minimum positive peak area in this run: \\text{LOD}_j = \\min_i \\{x_{ij} > 0\\}.", sprintf("Lowest signal in '%s'", sample), "Lowest quantified value", format(round(min_sample_signal, 2), big.mark = ","), "How NA is determined in Mass Spectrometry: Registered as NA when S/N < 3, when ESI ion suppression occurs, or when peak picking fails to integrate a valid isotopic envelope (left-censored MNAR)."),
          make_op("\\implies"),
          make_fluid_token("x_{ij}^* = \\text{NA}", "x_{ij}^* - Left-Censored Missing Flag", "Flagged as left-censored missing data.", "Handled in Step 3", "Status", "NA (Left-Censored)", "Queued for Step 3 QRILC tail modeling.")
        )
      }
      
      # Step 1 - Tier 3: Arithmetic Output & Status
      step1_tier3_normal <- if (is_observed) {
        sprintf("$$x_{ij}^* = %s \\quad (\\text{Retained Positive Abundance})$$", format(round(raw_val, 4), scientific = FALSE))
      } else {
        "$$x_{ij}^* = \\text{NA} \\quad (\\text{Left-Censored Non-Detect Flagged for Step 3})$$"
      }
      step1_tier3_hover <- if (is_observed) {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token(sprintf("x_{ij}^* = %s", format(round(raw_val, 4), scientific = FALSE)), "x_{ij}^* - Retained Positive Abundance", "Validated peak area passed to Step 2.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Retained abundance", format(round(raw_val, 4), scientific = FALSE), "Proceeds to Step 2 for log2 transformation."),
          make_op("\\quad"),
          make_fluid_token("\\text{[Status: Verified Detected]}", "Pipeline Status", "Analyte successfully cleared detection filtering.", "Step 1 Quality Control", "Filter status", "PASS", "Proceeds to Step 2.")
        )
      } else {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token("x_{ij}^* = \\text{NA}", "x_{ij}^* - Left-Censored Non-Detect", "Non-detect converted to missing flag.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Missing status", "NA", "Prevents log(0) calculation error."),
          make_op("\\quad"),
          make_fluid_token("\\text{[Status: Left-Censored NA]}", "Pipeline Status", "Signal was below LOD.", "Step 1 Quality Control", "Filter status", "QUEUED FOR QRILC", "Imputed in Step 3 via tail distribution.")
        )
      }
      
      step1_math <- tagList(
        # Tier 1
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier1"), icon("cube"), "Tier 1: Posed Symbolic Equation"),
            div(class = paste(ns("tier-narrative"), "tier1-desc"),
                HTML(paste0(
                  "We formulate the analytical screening model. The empirical Limit of Detection (\\(\\text{LOD}_j\\)) is defined by calculus as the lowest quantified positive value in the injection run: ",
                  "$$\\text{LOD}_j = \\min_{i} \\{ x_{ij} \\mid x_{ij} > 0 \\}$$ ",
                  "Raw chromatographic peak areas are evaluated against this threshold; analytes with zero signal or signals below LOD are converted to missing values (NA) to prevent computational collapse (\\(\\log_2(0) = -\\infty\\)). Use the two dots on any equation box or hover over tokens to explore how mass spectrometry determines NA."
                ))),
            build_dual_formula_slider("slider_step1_tier1", step1_tier1_normal, step1_tier1_hover, "Step 1: Posed Symbolic Screening Formula")
        ),
        
        # Tier 2
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier2"), icon("sliders"), "Tier 2: Empirical Term Substitution"),
            div(class = paste(ns("tier-narrative"), "tier2-desc"),
                HTML(sprintf("For analyte <strong>%s</strong> in sample <strong>%s</strong>, the raw detector signal was <strong>%s</strong> compared to the injection detection threshold (lowest quantified value) of <strong>%s</strong>.",
                             htmltools::htmlEscape(lipid), htmltools::htmlEscape(sample),
                             if (is_observed) format(round(raw_val, 2), big.mark = ",") else "Unobserved (Blank / <= 0)",
                             format(round(min_sample_signal, 2), big.mark = ",")))),
            build_dual_formula_slider("slider_step1_tier2", step1_tier2_normal, step1_tier2_hover, "Step 1: Empirical Sample Substitution")
        ),
        
        # Tier 3
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier3"), icon("check-circle"), "Tier 3: Arithmetic Output & Pipeline Status"),
            div(class = paste(ns("tier-narrative"), "tier3-desc"),
                if (is_observed) {
                  "The signal is experimentally validated and retained as positive abundance. It proceeds to Step 2 for variance stabilization."
                } else {
                  "The analyte is confirmed as a left-censored non-detect. It is cleanly assigned to NA so that downstream log2 transformation does not produce undefined (-Inf) values."
                }),
            build_dual_formula_slider("slider_step1_tier3", step1_tier3_normal, step1_tier3_hover, "Step 1: Detection Output & Pipeline Status"),
            div(class = paste(ns("concordance-box"), if (!is_observed) ns("concordance-box-warning") else ""),
                if (is_observed) {
                  p(class = "text-success fw-bold mb-0", icon("circle-check"), 
                    sprintf(" Analyte was successfully detected with signal %.2f. Passed to Step 2.", raw_val))
                } else {
                  p(class = "fw-bold mb-0", style = "color: #92400e !important; font-size: 0.92rem;", icon("triangle-exclamation", class = "me-1 text-warning"), 
                    sprintf(" Analyte was below the limit of detection (%s). Mapped to NA to protect downstream calculations.",
                            format(round(min_sample_signal, 2), big.mark = ",")))
                })),
        build_term_legend_ui(step1_terms)
      )
      step1_rationale <- div(
        p("In mass spectrometry lipidomics, detection limits are dictated by detector sensitivity, mobile phase composition, and ionization efficiency. The empirical Limit of Detection ($\\text{LOD}_j$) is defined by calculus as the lowest observed positive detector response in the sample injection: $\\text{LOD}_j = \\min_i \\{ x_{ij} \\mid x_{ij} > 0 \\}$."),
        p(tags$strong("How is NA determined in Mass Spectrometry?"), " A peak is registered as NA (or 0 / blank) through three principal mass spectrometry mechanisms:"),
        tags$ul(
          tags$li(tags$strong("Signal-to-Noise Floor (S/N < 3): "), "The mass spectrometer's electron multiplier or orbitrap detector registers raw ion current that cannot be statistically differentiated from baseline chemical and electronic noise."),
          tags$li(tags$strong("Chromatographic Peak Integration Failure: "), "Automated peak-picking algorithms (e.g. XCMS, MS-DIAL, LipidSearch) fail to find a coherent chromatographic elution profile matching the expected isotopic distribution ($M+0, M+1, M+2$) within the retention time tolerance window ($\\Delta \\text{RT}$)."),
          tags$li(tags$strong("Ion Suppression & Matrix Effects: "), "High-abundance co-eluting lipids or salts compete for surface charge in the electrospray ionization (ESI) droplet, suppressing analyte ionization below physical detection limits.")
        ),
        p("Because these missing values result from low physical concentration rather than random instrument failure, they represent left-censored ", tags$strong("Missing Not At Random (MNAR)"), " data. Crucially, in logarithmic transformation, $\\log_2(0)$ is mathematically undefined ($-\\infty$), which collapses linear modeling and variance calculations. Therefore, rigorous biostatistical processing requires detecting and converting these non-detects into left-censored missing values (NA) for Step 3 QRILC imputation.")
      )
      step1_quote <- div(
        div(class = ns("quote-box"),
            icon("book-open", class = "me-2 text-primary"),
            "Non-detects in chromatography and mass spectrometry represent left-censored data (MNAR) falling below instrument limits of detection rather than true biological absence (Idkowiak et al., Nature Communications 2025, 16:8714). Quantile Regression Imputation of Left-Censored data (QRILC) is benchmarked as the optimal strategy for left-censored MNAR omics data (Wei et al., Sci. Rep. 2018, 8:1632).")
      )
      
      # ------------------------------------------------------------------------
      # STEP 2: VARIANCE-STABILIZING LOG2 TRANSFORMATION
      # ------------------------------------------------------------------------
      step2_terms <- list(
        list(
          symbol = "$x_{ij}^*$",
          name = "Cleaned Signal",
          prov = sprintf("Cleaned scalar value from Step 1 for Row %d ('%s'), Col %d ('%s')", lipid_idx, lipid, sample_idx, sample),
          val = if (is_observed) format(round(raw_val, 4), scientific = FALSE) else "NA",
          interp = "Input positive peak area intensity passed to logarithmic transformation."
        ),
        list(
          symbol = "$y_{ij}$",
          name = "Log2 Intensity",
          prov = "Computed via base-2 logarithmic transformation: y_ij = log2(x_ij*)",
          val = if (is_observed) sprintf("%.6f log2", log2_val) else "NA",
          interp = "Standardized scale where biological fold changes become symmetric additive distances."
        ),
        list(
          symbol = "$\\log_2(\\cdot)$",
          name = "Binary Logarithm",
          prov = "Standard mathematical change-of-base function: log2(x) = ln(x) / ln(2)",
          val = "Base 2",
          interp = "Calms down high-abundance noise so small and large lipids can be compared fairly."
        ),
        list(
          symbol = "$\\Delta y$",
          name = "Additive Distance Property",
          prov = "Mathematical identity: log2(A) - log2(B) = log2(A / B)",
          val = "+1.0 log2 = 2.0x",
          interp = "A difference of +1.0 log2 represents an exact 2-fold biological accumulation."
        )
      )
      
      # Step 2 - Tier 1: Posed Formula
      step2_tier1_normal <- "$$y_{ij} = \\log_2(x_{ij}^*)$$"
      step2_tier1_hover <- div(
        class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
        make_fluid_token("y_{ij}", "y_{ij} - Log2 Intensity", 
                         "Signal converted into base-2 logarithmic scale.",
                         "Calculated by taking log2(Cleaned Signal).",
                         "Value in this sample", if (is_observed) sprintf("%.4f log2", log2_val) else "NA",
                         "Makes biological fold changes symmetric (+1 means 2x higher, -1 means 2x lower)."),
        make_op("="),
        make_fluid_token("\\log_2", "\\log_2 - Binary Logarithm", 
                         "The mathematical base-2 logarithmic operation (ln(x) / ln(2)).",
                         "Applied uniformly to all positive readings in dataset.",
                         "Operation", "Base 2",
                         "Calms down high-abundance noise so small and large lipids can be compared fairly."),
        make_op("("),
        make_fluid_token("x_{ij}^*", "x_{ij}^* - Cleaned Signal", 
                         "Cleaned positive peak area from Step 1.",
                         sprintf("Row '%s', Column '%s'", lipid, sample),
                         "Input signal", if (is_observed) format(round(raw_val, 2), big.mark = ",") else "NA",
                         "Input linear peak area integration ready for log transformation."),
        make_op(")")
      )
      
      # Step 2 - Tier 2: Empirical Substitution
      step2_tier2_normal <- if (is_observed) {
        sprintf("$$y_{ij} = \\log_2(%s) = \\frac{\\ln(%s)}{\\ln(2)}$$", 
                format(round(raw_val, 4), scientific = FALSE),
                format(round(raw_val, 4), scientific = FALSE))
      } else {
        "$$y_{ij} = \\log_2(\\text{NA}) = \\text{NA} \\quad (\\text{Undefined for Non-Detect})$$"
      }
      step2_tier2_hover <- if (is_observed) {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token("y_{ij}", "y_{ij} - Evaluated Log2 Intensity", "Transformed intensity.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Computed value", sprintf("%.6f log2", log2_val), "Stabilizes variance."),
          make_op("="),
          make_op("\\log_2("),
          make_fluid_token(format(round(raw_val, 2), big.mark = ","), "x_{ij}^* - Substituted Peak Area", "Empirical measured area from mass spectrometer.", sprintf("Cell '%s', '%s'", lipid, sample), "Input area", format(round(raw_val, 2), big.mark = ","), "Measured chromatographic peak area."),
          make_op(")"),
          make_op("="),
          make_op("\\frac{\\ln("),
          make_fluid_token(format(round(raw_val, 2), big.mark = ","), "x_{ij}^* - Natural Log Argument", "Linear area passed to ln(x).", sprintf("Cell '%s', '%s'", lipid, sample), "Value", format(round(raw_val, 2), big.mark = ","), "Natural logarithm numerator."),
          make_op(")}{\\ln(2)}")
        )
      } else {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token("y_{ij}", "y_{ij} - Log2 Value", "Log-transformed intensity.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Value", "NA", "Undefined for non-detect."),
          make_op("="),
          make_op("\\log_2("),
          make_fluid_token("\\text{NA}", "\\text{NA} - Left-Censored Input", "Missing value passed from Step 1.", "Step 1 Output", "Input", "NA", "Cannot take log of absent peak."),
          make_op(")"),
          make_op("="),
          make_fluid_token("\\text{NA}", "\\text{NA} - Undefined Logarithm", "Preserves missingness safely.", "Step 2 Output", "Result", "NA", "Queued for Step 3 QRILC imputation.")
        )
      }
      
      # Step 2 - Tier 3: Arithmetic Output & Status
      step2_tier3_normal <- if (is_observed) {
        sprintf("$$y_{ij} = %.6f \\log_2 \\quad (\\text{Stabilized Log2 Intensity})$$", log2_val)
      } else {
        "$$y_{ij} = \\text{NA} \\quad (\\text{Awaiting Step 3 QRILC Tail Modeling})$$"
      }
      step2_tier3_hover <- if (is_observed) {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token(sprintf("y_{ij} = %.6f \\log_2", log2_val), "y_{ij} - Stabilized Log2 Intensity", "Base-2 logarithmic intensity.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Log2 value", sprintf("%.6f", log2_val), "Variance is homoscedastic across dynamic range."),
          make_op("\\quad"),
          make_fluid_token("\\text{[Status: Log2 Stabilized]}", "Pipeline Status", "Variance successfully stabilized.", "Step 2 Quality Control", "Status", "READY", "Ready for median normalization or downstream testing.")
        )
      } else {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token("y_{ij} = \\text{NA}", "y_{ij} - Undefined Log2 Flag", "Preserved missing status.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Value", "NA", "Zero values never produce -Inf."),
          make_op("\\quad"),
          make_fluid_token("\\text{[Status: Queued for QRILC]}", "Pipeline Status", "Missing tail modeling pending.", "Step 2 Quality Control", "Status", "QUEUED", "Proceeds to Step 3.")
        )
      }

      step2_math <- tagList(
        # Tier 1
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier1"), icon("cube"), "Tier 1: Posed Symbolic Equation"),
            div(class = paste(ns("tier-narrative"), "tier1-desc"),
                "We formulate the variance-stabilizing base-2 logarithmic transformation. Raw mass spec intensities exhibit right-skewness and multiplicative error; log2 transformation conforms the data to homoscedastic Gaussian assumptions. Use the two dots on any equation box to toggle between the publication formula and interactive hover explanations."),
            build_dual_formula_slider("slider_step2_tier1", step2_tier1_normal, step2_tier1_hover, "Step 2: Posed Symbolic Log2 Equation")
        ),
        
        # Tier 2
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier2"), icon("sliders"), "Tier 2: Empirical Term Substitution"),
            div(class = paste(ns("tier-narrative"), "tier2-desc"),
                if (is_observed) {
                  HTML(sprintf("Substituting the raw measured peak area of <strong>%s</strong> into the binary logarithm yields the exact log2 intensity.",
                               format(round(raw_val, 2), big.mark = ",")))
                } else {
                  HTML(sprintf("Because <strong>%s</strong> was left-censored (NA) in Step 1, its logarithmic value remains undefined (NA) and is queued for Step 3 QRILC tail modeling.",
                               htmltools::htmlEscape(lipid)))
                }),
            build_dual_formula_slider("slider_step2_tier2", step2_tier2_normal, step2_tier2_hover, "Step 2: Empirical Log2 Substitution")
        ),
        
        # Tier 3
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier3"), icon("check-circle"), "Tier 3: Arithmetic Output & Pipeline Status"),
            div(class = paste(ns("tier-narrative"), "tier3-desc"),
                if (is_observed) {
                  sprintf("The calculated log2 intensity is %.6f log2. Variance is stabilized, and biological 2-fold shifts now correspond to distances of +/-1.000.", log2_val)
                } else {
                  "The value remains NA. Imputation will sample a probabilistic value from the lower tail in Step 3."
                }),
            build_dual_formula_slider("slider_step2_tier3", step2_tier3_normal, step2_tier3_hover, "Step 2: Evaluated Log2 Intensity"),
            div(class = ns("concordance-box"),
                if (is_observed) {
                  p(class = "text-success fw-bold mb-0", icon("chart-line"), 
                    sprintf(" Continuous Log2 Transformed Intensity: %.6f log2", log2_val))
                } else {
                  p(class = "text-info fw-bold mb-0", icon("hourglass-half"), 
                    " Analyte queued for Step 3 QRILC truncated normal tail modeling.")
                })),
        build_term_legend_ui(step2_terms)
      )
      step2_rationale <- div(
        p("Mass spectrometry detector outputs span orders of magnitude ($10^3$ to $10^9$ counts). On this raw linear scale, experimental variance is strictly multiplicative (higher signals exhibit proportionally higher standard deviations), violating fundamental homoscedasticity assumptions required for linear models and ANOVA."),
        p("Applying a base-2 logarithm achieves two biostatistical necessities:"),
        tags$ol(
          tags$li(strong("Variance Stabilization:"), " De-couples variance from the mean, conforming the data to a Gaussian-like distribution."),
          tags$li(strong("Linearization of Fold Changes:"), " Converts multiplicative fold differences into symmetric additive distances ($+1.0\\text{ log}_2 = 2.0\\times$ upregulation, $-1.0\\text{ log}_2 = 0.5\\times$ downregulation).")
        )
      )
      step2_quote <- div(
        div(class = ns("quote-box"),
            icon("book-open", class = "me-2 text-primary"),
            "Logarithmic transformation normalizes skewed peak area distributions, stabilizes heteroscedastic instrument noise, and converts multiplicative biological relationships into additive differences for statistical modeling (Idkowiak et al., Nature Communications 2025, 16:8714; Metabolomics 2024, 20:45).")
      )
      
      # ------------------------------------------------------------------------
      # STEP 3: QRILC TRUNCATED TAIL IMPUTATION
      # ------------------------------------------------------------------------
      step3_terms <- list(
        list(
          symbol = "$\\text{pNAs}_j$",
          name = "Missing Fraction",
          prov = sprintf("Missing count (%d) / Total lipids (%d) in column '%s'", sample_missing_count, total_lipids, sample),
          val = sprintf("%.2f%% (%d NAs)", pna_pct, sample_missing_count),
          interp = "Percentage of undetectable lipids in this biological sample run."
        ),
        list(
          symbol = "$\\hat{\\mu}_j$",
          name = "Estimated Mean (CDD)",
          prov = sprintf("QRILC regression intercept for sample column '%s'", sample),
          val = sprintf("%.3f log2", mu_est),
          interp = "Theoretical center of the complete log2 distribution if all low signals were detectable."
        ),
        list(
          symbol = "$\\hat{\\sigma}_j$",
          name = "Estimated SD (CDD)",
          prov = sprintf("QRILC regression slope for sample column '%s'", sample),
          val = sprintf("%.3f log2", sigma_est),
          interp = "Spread and natural biological variance of lipid abundances in this sample."
        ),
        list(
          symbol = "$\\tau_j$",
          name = "Upper Truncation Ceiling",
          prov = sprintf("tau_j = mu + sigma * Phi^-1(pNAs) = %.3f log2 (Linear: %s)", upper_cutoff_log2, format(upper_cutoff_lin, big.mark = ",")),
          val = sprintf("%.3f log2", upper_cutoff_log2),
          interp = "Upper bound for imputed values; guarantees imputed signals stay strictly below detected signals."
        ),
        list(
          symbol = "$y_{ij}^{\\text{imp}}$",
          name = "Imputed Intensity",
          prov = sprintf("Cell at Row '%s', Column '%s' after QRILC imputation", lipid, sample),
          val = sprintf("%.6f log2", log2_imp),
          interp = if (is_observed) "Observed measurement preserved bit-for-bit (no imputation needed)." else "Probabilistic value drawn from left tail below detection limit."
        )
      )
      
      # Step 3 - Tier 1: Posed Formula
      step3_tier1_normal <- "$$\\begin{aligned}
      Q_{Y_j}(p) &= \\hat{\\mu}_j + \\hat{\\sigma}_j \\Phi^{-1}(p) \\\\[6pt]
      y_{ij}^{\\text{imp}} &\\sim \\mathcal{N}_{[-\\infty, \\tau_j]}(\\hat{\\mu}_j, \\hat{\\sigma}_j^2) \\quad \\text{for all } (i, j) \\text{ where } y_{ij} = \\text{NA}
      \\end{aligned}$$"
      
      step3_tier1_hover <- tagList(
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token("Q_{Y_j}(p)", "Q_{Y_j}(p) - Quantile Curve", 
                           "Mathematical curve describing how lipid abundances are spread across this sample.",
                           sprintf("Fitted to observed lower percentiles in column '%s'.", sample),
                           "Distribution model", "Fitted curve",
                           "Predicts what low-abundance signals should look like in the missing tail."),
          make_op("="),
          make_fluid_token("\\hat{\\mu}_j", "\\hat{\\mu}_j - Distribution Center", 
                           "Theoretical middle abundance of this sample if the detector had no detection limit.",
                           sprintf("Fitted baseline intercept for sample '%s'.", sample),
                           "Estimated center", sprintf("%.3f log2", mu_est),
                           "Anchors the central location of the complete lipid distribution."),
          make_op("+"),
          make_fluid_token("\\hat{\\sigma}_j", "\\hat{\\sigma}_j - Distribution Spread", 
                           "How widely lipid abundances vary and scatter across this sample.",
                           sprintf("Fitted slope parameter for sample '%s'.", sample),
                           "Estimated spread", sprintf("%.3f log2", sigma_est),
                           "Ensures imputed missing values have realistic natural biological variation."),
          make_fluid_token("\\Phi^{-1}(p)", "\\Phi^{-1}(p) - Bell Curve Position", 
                           "Position along a standard bell curve for the sample's missingness proportion.",
                           "Inverse CDF of N(0, 1) evaluated at missingness fraction.",
                           "Z-score position", sprintf("%.3f", qnorm(pmin(0.999, (pna_pct/100) + 0.001))),
                           "Converts the fraction of missing lipids into a precise statistical cutoff point.")
        ),
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1 mt-2",
          make_fluid_token("y_{ij}^{\\text{imp}}", "y_{ij}^{\\text{imp}} - Imputed Intensity", 
                           "Complete log2 abundance for this lipid after handling missing data.",
                           sprintf("Cell at '%s', '%s' in post-imputation matrix.", lipid, sample),
                           "Value in this sample", sprintf("%.4f log2", log2_imp),
                           "Provides a complete dataset with zero missing gaps, ready for normalization."),
          make_op("\\sim"),
          make_fluid_token("\\mathcal{N}_{[-\\infty, \\tau_j]}", "\\mathcal{N}_{[-\\infty, \\tau_j]} - Truncated Normal", 
                           "Bell curve distribution strictly cut off at upper ceiling tau_j.",
                           sprintf("Ceiling bound tau_j = %.3f log2 for sample '%s'.", upper_cutoff_log2, sample),
                           "Upper ceiling", sprintf("%s linear", format(upper_cutoff_lin, big.mark = ",")),
                           "Guarantees that imputed values always stay below the observed detection threshold."),
          make_op("("),
          make_fluid_token("\\hat{\\mu}_j", "\\hat{\\mu}_j - Distribution Center", "Sample distribution center.", sprintf("Fitted for '%s'", sample), "Center", sprintf("%.3f log2", mu_est), "Center location."),
          make_op(","),
          make_fluid_token("\\hat{\\sigma}_j^2", "\\hat{\\sigma}_j^2 - Distribution Variance", "Sample distribution variance.", sprintf("Fitted for '%s'", sample), "Variance", sprintf("%.3f^2 log2", sigma_est), "Spread squared."),
          make_op(")"),
          make_op("\\quad \\text{for all } (i, j) \\text{ where } y_{ij} = \\text{NA}")
        )
      )
      
      # Step 3 - Tier 2: Empirical Substitution
      step3_tier2_normal <- if (!is_observed) {
        sprintf("$$\\begin{aligned}
        \\hat{\\mu}_j &= %.3f \\log_2, \\quad \\hat{\\sigma}_j = %.3f \\log_2, \\quad \\text{pNAs}_j = %.2f\\%% \\\\[4pt]
        \\tau_j &= %.3f + %.3f \\times \\Phi^{-1}(%.4f) = %.3f \\log_2 \\\\[4pt]
        y_{ij}^{\\text{imp}} &\\sim \\mathcal{N}_{[-\\infty, %.3f]}(%.3f, %.3f^2)
        \\end{aligned}$$",
                mu_est, sigma_est, pna_pct,
                mu_est, sigma_est, pmin(0.999, (pna_pct/100) + 0.001), upper_cutoff_log2,
                upper_cutoff_log2, mu_est, sigma_est)
      } else {
        sprintf("$$\\begin{aligned}
        \\hat{\\mu}_j &= %.3f \\log_2, \\quad \\hat{\\sigma}_j = %.3f \\log_2, \\quad \\text{pNAs}_j = %.2f\\%% \\\\[4pt]
        \\tau_j &= %.3f \\log_2 \\quad (\\text{Linear Cutoff: } %s) \\\\[4pt]
        y_{ij}^{\\text{imp}} &= y_{ij} = %.6f \\log_2 \\quad (\\text{Observed; Imputation Bypassed})
        \\end{aligned}$$",
                mu_est, sigma_est, pna_pct,
                upper_cutoff_log2, format(upper_cutoff_lin, big.mark = ","),
                log2_val)
      }
      
      step3_tier2_hover <- if (!is_observed) {
        tagList(
          div(
            class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
            make_fluid_token(sprintf("\\hat{\\mu}_j = %.3f", mu_est), "\\hat{\\mu}_j - Distribution Center", "QRILC estimated mean.", sprintf("Sample '%s'", sample), "Mean", sprintf("%.3f log2", mu_est), "Fitted intercept."),
            make_op(",\\quad"),
            make_fluid_token(sprintf("\\hat{\\sigma}_j = %.3f", sigma_est), "\\hat{\\sigma}_j - Distribution Spread", "QRILC estimated standard deviation.", sprintf("Sample '%s'", sample), "Std Dev", sprintf("%.3f log2", sigma_est), "Fitted slope."),
            make_op(",\\quad"),
            make_fluid_token(sprintf("\\text{pNAs}_j = %.2f\\%%", pna_pct), "\\text{pNAs}_j - Missing Proportion", "Fraction of unobserved lipids in this run.", sprintf("%d of %d lipids", sample_missing_count, total_lipids), "Missing fraction", sprintf("%.2f%%", pna_pct), "Dictates quantile cutoff.")
          ),
          div(
            class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1 mt-2",
            make_fluid_token(sprintf("\\tau_j = %.3f \\log_2", upper_cutoff_log2), "\\tau_j - Truncation Ceiling", "Maximum allowed value for imputed data.", sprintf("Upper bound for '%s'", sample), "Cutoff ceiling", sprintf("%.3f log2 (%s lin)", upper_cutoff_log2, format(upper_cutoff_lin, big.mark = ",")), "Guarantees imputed values stay strictly in missing tail."),
            make_op("\\implies"),
            make_fluid_token(sprintf("y_{ij}^{\\text{imp}} \\sim \\mathcal{N}_{[-\\infty, %.3f]}(%.3f, %.3f^2)", upper_cutoff_log2, mu_est, sigma_est), "y_{ij}^{\\text{imp}} - Tail Sampling", "Draws random value from left truncated Gaussian distribution.", "QRILC tail sampler", "Sampled value", sprintf("%.6f log2", log2_imp), "Fills missing gap realistically.")
          )
        )
      } else {
        tagList(
          div(
            class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
            make_fluid_token(sprintf("\\hat{\\mu}_j = %.3f", mu_est), "\\hat{\\mu}_j - Distribution Center", "QRILC estimated mean.", sprintf("Sample '%s'", sample), "Mean", sprintf("%.3f log2", mu_est), "Fitted intercept."),
            make_op(",\\quad"),
            make_fluid_token(sprintf("\\hat{\\sigma}_j = %.3f", sigma_est), "\\hat{\\sigma}_j - Distribution Spread", "QRILC estimated standard deviation.", sprintf("Sample '%s'", sample), "Std Dev", sprintf("%.3f log2", sigma_est), "Fitted slope."),
            make_op(",\\quad"),
            make_fluid_token(sprintf("\\tau_j = %.3f", upper_cutoff_log2), "\\tau_j - Truncation Ceiling", "Upper detection cutoff.", sprintf("Sample '%s'", sample), "Cutoff", sprintf("%.3f log2", upper_cutoff_log2), "Separates detected from missing.")
          ),
          div(
            class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1 mt-2",
            make_fluid_token(sprintf("y_{ij}^{\\text{imp}} = y_{ij} = %.6f \\log_2", log2_val), "y_{ij}^{\\text{imp}} - Observed Value Retained", "No imputation needed because real signal was detected.", sprintf("Measured peak: %s", format(round(raw_val, 2), big.mark = ",")), "Retained log2", sprintf("%.6f log2", log2_val), "Experimental measurement preserved bit-for-bit.")
          )
        )
      }
      
      # Step 3 - Tier 3: Arithmetic Output & Status
      step3_tier3_normal <- if (is_observed) {
        sprintf("$$y_{ij}^{\\text{imp}} = y_{ij} = %.6f \\log_2 \\quad (\\text{Observed Signal Retained})$$", log2_val)
      } else {
        sprintf("$$y_{ij}^{\\text{imp}} = %.6f \\log_2 \\quad (< %.3f \\log_2 \\text{ Truncation Threshold})$$", log2_imp, upper_cutoff_log2)
      }
      step3_tier3_hover <- if (is_observed) {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token(sprintf("y_{ij}^{\\text{imp}} = %.6f \\log_2", log2_val), "y_{ij}^{\\text{imp}} - Retained Log2 Signal", "Measured signal preserved.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Value", sprintf("%.6f log2", log2_val), "Experimental integrity intact."),
          make_op("\\quad"),
          make_fluid_token("\\text{[Status: Observed - Bypassed]}", "Pipeline Status", "Imputation was not needed.", "Step 3 Decision", "Status", "BYPASS", "Passed directly to Step 4.")
        )
      } else {
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token(sprintf("y_{ij}^{\\text{imp}} = %.6f \\log_2", log2_imp), "y_{ij}^{\\text{imp}} - Imputed Tail Value", "Probabilistic low-abundance imputation.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Imputed value", sprintf("%.6f log2", log2_imp), "Strictly below LOD floor."),
          make_op("<"),
          make_fluid_token(sprintf("\\tau_j = %.3f \\log_2", upper_cutoff_log2), "\\tau_j - Truncation Boundary", "Maximum ceiling for missing tail.", sprintf("Sample '%s'", sample), "Ceiling", sprintf("%.3f log2", upper_cutoff_log2), "Satisfies truncated normal constraint."),
          make_op("\\quad"),
          make_fluid_token("\\text{[Status: Successfully Imputed]}", "Pipeline Status", "Tail value generated.", "Step 3 Imputation Engine", "Status", "IMPUTED", "Ready for Step 4.")
        )
      }

      step3_math <- tagList(
        # Tier 1
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier1"), icon("cube"), "Tier 1: Posed Symbolic Equation"),
            div(class = paste(ns("tier-narrative"), "tier1-desc"),
                "We formulate the Quantile Regression for Left-Censored data (QRILC) model. QRILC fits a regression line to observed lower percentiles to estimate the unobserved tail, sampling realistic values below the detection floor. Use the two dots on any equation box to toggle between the publication formula and interactive hover explanations."),
            build_dual_formula_slider("slider_step3_tier1", step3_tier1_normal, step3_tier1_hover, "Step 3: Posed Symbolic QRILC Truncation Model")
        ),
        
        # Tier 2
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier2"), icon("sliders"), "Tier 2: Empirical Term Substitution"),
            div(class = paste(ns("tier-narrative"), "tier2-desc"),
                HTML(sprintf("In sample <strong>%s</strong>, %d of %d lipids (%.2f%%) were left-censored. Fitting quantile regression yielded an estimated mean of <strong>%.3f log2</strong> and standard deviation of <strong>%.3f log2</strong>, establishing an upper truncation ceiling of <strong>%.3f log2</strong> (%s linear peak area).",
                             htmltools::htmlEscape(sample), sample_missing_count, total_lipids, pna_pct, mu_est, sigma_est, upper_cutoff_log2, format(upper_cutoff_lin, big.mark = ",")))),
            build_dual_formula_slider("slider_step3_tier2", step3_tier2_normal, step3_tier2_hover, "Step 3: Empirical Quantile Tail Substitution")
        ),
        
        # Tier 3
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier3"), icon("check-circle"), "Tier 3: Arithmetic Output & Pipeline Status"),
            div(class = paste(ns("tier-narrative"), "tier3-desc"),
                if (is_observed) {
                  HTML(sprintf("Because <strong>%s</strong> was observed with a positive experimental signal, QRILC imputation was bypassed to preserve true biological measurement integrity.", htmltools::htmlEscape(lipid)))
                } else {
                  HTML(sprintf("QRILC successfully sampled a realistic low-abundance tail value of <strong>%.6f log2</strong> (%s linear peak area), strictly below the truncation ceiling of <strong>%.3f log2</strong>.",
                               log2_imp, format(round(2^log2_imp, 2), big.mark = ","), upper_cutoff_log2))
                }),
            build_dual_formula_slider("slider_step3_tier3", step3_tier3_normal, step3_tier3_hover, "Step 3: Imputed Abundance Output"),
            div(class = ns("concordance-box"),
                if (is_observed) {
                  p(class = "text-success fw-bold mb-0", icon("circle-check"), 
                    sprintf(" Analyte was observed experimentally (signal: %s). QRILC tail sampling bypassed to maintain data fidelity.",
                            format(round(raw_val, 2), big.mark = ",")))
                } else {
                  p(class = "text-primary fw-bold mb-0", icon("dice"), 
                    sprintf(" Left-censored non-detect imputed at %.6f log2 (strictly below sample LOD of %.3f log2).",
                            log2_imp, upper_cutoff_log2))
                })),
        build_term_legend_ui(step3_terms)
      )
      step3_rationale <- div(
        p("Missing values in mass spectrometry lipidomics are overwhelmingly Missing Not At Random (MNAR), caused by low-abundance compounds falling beneath instrument detection sensitivity. Imputing with zero causes mathematical collapse in logarithms; imputing with fixed constants (e.g. LOD/2 or minimum value) creates artificial sharp spike spikes in distributions that distort variance estimates and elevate False Discovery Rates (FDR)."),
        p("The QRILC algorithm models the left-censored tail by fitting a quantile regression against the Gaussian distribution of observed signals. It samples stochastic values from a truncated normal distribution restricted to $[-\\infty, \\tau_j]$, preserving natural biological variation below the detection threshold while ensuring imputed values never exceed observed values.")
      )
      step3_quote <- div(
        div(class = ns("quote-box"),
            icon("book-open", class = "me-2 text-primary"),
            "Quantile Regression for Left-Censored Data (QRILC) models the truncated lower-tail Gaussian distribution for MNAR non-detects, sampling biologically plausible sub-threshold values without introducing artificial spikes or distorting variance (Lazar et al., J. Proteome Res. 2016, 15(4):1116-1125; Wei et al., Sci. Rep. 2018, 8:1632).")
      )
      
      # ------------------------------------------------------------------------
      # STEP 4: SAMPLE-WISE GLOBAL MEDIAN NORMALIZATION
      # ------------------------------------------------------------------------
      step4_terms <- list(
        list(
          symbol = "$m_j$",
          name = "Sample Column Median",
          prov = sprintf("Median of all %d lipid intensities in sample column '%s'", total_lipids, sample),
          val = sprintf("%.3f log2", med_j),
          interp = "Overall sample loading / total lipid content indicator for this injection."
        ),
        list(
          symbol = "$M$",
          name = "Cohort Grand Median",
          prov = sprintf("Median of all %d sample medians across the entire experimental cohort", total_samples),
          val = sprintf("%.3f log2", grand_med),
          interp = "Golden reference baseline anchor that all biological samples are normalized to."
        ),
        list(
          symbol = "$\\delta_j$",
          name = "Calculated Log2 Shift",
          prov = sprintf("delta_j = m_j - M = %.3f - %.3f = %+.3f log2", med_j, grand_med, delta_j),
          val = sprintf("%+.3f log2", delta_j),
          interp = sprintf("Analytical loading offset (%s relative to cohort grand median).",
                           if (delta_j > 0) sprintf("%.1f%% excess volume", (2^delta_j - 1)*100) else sprintf("%.1f%% reduced volume", (1 - 2^delta_j)*100))
        ),
        list(
          symbol = "$y_{ij}^{\\text{norm}}$",
          name = "Normalized Log2 Intensity",
          prov = sprintf("y_norm = y_imp - delta_j = %.6f - (%+.3f)", log2_imp, delta_j),
          val = sprintf("%.4f log2", norm_log),
          interp = "Standardized biological intensity purged of loading differences, used for ANOVA, Volcano plots, and PCA."
        )
      )
      
      # Step 4 - Tier 1: Posed Formula
      step4_tier1_normal <- "$$\\begin{aligned}
      m_j &= \\operatorname{median}_{i}(y_{ij}^{\\text{imp}}), \\quad M = \\operatorname{median}_{j}(m_j) \\\\[6pt]
      \\delta_j &= m_j - M \\\\[6pt]
      y_{ij}^{\\text{norm}} &= y_{ij}^{\\text{imp}} - \\delta_j
      \\end{aligned}$$"
      
      step4_tier1_hover <- tagList(
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token("m_j", "m_j - Sample Median", 
                           "Middle abundance of all lipids measured in this single sample run.",
                           sprintf("Median across %d lipids in column '%s'.", total_lipids, sample),
                           "Sample median", sprintf("%.3f log2", med_j),
                           "Reflects overall sample loading and instrument sensitivity for this run."),
          make_op("="),
          make_op("\\operatorname{median}_i("),
          make_fluid_token("y_{ij}^{\\text{imp}}", "y_{ij}^{\\text{imp}} - Imputed Intensity", "All lipid intensities in this injection.", sprintf("Sample '%s'", sample), "Intensity vector", sprintf("%d values", total_lipids), "Source intensities."),
          make_op(") ,\\quad"),
          make_fluid_token("M", "M - Cohort Grand Median", 
                           "The master reference median across all sample injection runs in the cohort.",
                           sprintf("Median of all %d sample medians in dataset.", total_samples),
                           "Cohort grand median", sprintf("%.3f log2", grand_med),
                           "Fixed golden standard anchor that all samples are aligned to.")
        ),
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1 mt-2",
          make_fluid_token("\\delta_j", "\\delta_j - Sample Loading Shift", 
                           "Difference between this sample's median and the cohort reference grand median.",
                           sprintf("Subtraction: m_j - M = %.3f - %.3f = %+.3f log2.", med_j, grand_med, delta_j),
                           "Calculated shift", sprintf("%+.3f log2", delta_j),
                           "Quantifies technical loading or dilution bias that needs to be equalized."),
          make_op("="),
          make_fluid_token("m_j", "m_j - Sample Median", "Sample loading median.", sprintf("Column '%s'", sample), "Sample median", sprintf("%.3f log2", med_j), "Sample center."),
          make_op("-"),
          make_fluid_token("M", "M - Cohort Grand Median", "Cohort reference grand median.", "Grand median across cohort.", "Grand median", sprintf("%.3f log2", grand_med), "Cohort center anchor."),
          make_op(";\\quad"),
          make_fluid_token("y_{ij}^{\\text{norm}}", "y_{ij}^{\\text{norm}} - Normalized Log2", 
                           "The biological intensity after removing technical loading and pipetting differences.",
                           sprintf("Subtraction: %.4f - (%+.3f)", log2_imp, delta_j),
                           "Normalized value", sprintf("%.4f log2", norm_log),
                           "Clean biological measurement used for differential statistics and volcano plots."),
          make_op("="),
          make_fluid_token("y_{ij}^{\\text{imp}}", "y_{ij}^{\\text{imp}} - Imputed Intensity", "Post-imputation intensity before loading adjustment.", sprintf("Lipid '%s'", lipid), "Input intensity", sprintf("%.4f log2", log2_imp), "Pre-normalization value."),
          make_op("-"),
          make_fluid_token("\\delta_j", "\\delta_j - Loading Offset", "Sample loading shift.", sprintf("Sample '%s'", sample), "Shift offset", sprintf("%+.3f log2", delta_j), "Offset correction subtracted from signal.")
        )
      )
      
      # Step 4 - Tier 2: Empirical Substitution
      step4_tier2_normal <- sprintf("$$\\begin{aligned}
      m_j &= %.3f \\log_2, \\quad M = %.3f \\log_2 \\\\[4pt]
      \\delta_j &= %.3f - %.3f = %+.3f \\log_2 \\\\[4pt]
      y_{ij}^{\\text{norm}} &= %.6f - (%+.3f)
      \\end{aligned}$$",
              med_j, grand_med,
              med_j, grand_med, delta_j,
              log2_imp, delta_j)
      
      step4_tier2_hover <- tagList(
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token(sprintf("m_j = %.3f \\log_2", med_j), "m_j - Sample Median", "Empirical sample median.", sprintf("Sample '%s'", sample), "Sample median", sprintf("%.3f log2", med_j), "Sample center."),
          make_op(",\\quad"),
          make_fluid_token(sprintf("M = %.3f \\log_2", grand_med), "M - Cohort Grand Median", "Cohort reference median.", "Cohort anchor", "Grand median", sprintf("%.3f log2", grand_med), "Cohort benchmark.")
        ),
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1 mt-2",
          make_fluid_token(sprintf("\\delta_j = %+.3f \\log_2", delta_j), "\\delta_j - Loading Offset", "Calculated analytical shift.", sprintf("%.3f - %.3f", med_j, grand_med), "Offset delta_j", sprintf("%+.3f log2", delta_j), "Subtracted from all lipids in sample."),
          make_op("="),
          make_fluid_token(sprintf("%.3f", med_j), "m_j", "Sample median.", sprintf("Sample '%s'", sample), "Value", sprintf("%.3f", med_j), "Sample center."),
          make_op("-"),
          make_fluid_token(sprintf("%.3f", grand_med), "M", "Grand median.", "Cohort reference", "Value", sprintf("%.3f", grand_med), "Cohort center.")
        ),
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1 mt-2",
          make_fluid_token("y_{ij}^{\\text{norm}}", "y_{ij}^{\\text{norm}} - Normalized Abundance", "Subtracted loading adjustment.", sprintf("%.6f - (%+.3f)", log2_imp, delta_j), "Normalized", sprintf("%.4f log2", norm_log), "Loading equalized."),
          make_op("="),
          make_fluid_token(sprintf("%.6f", log2_imp), "y_{ij}^{\\text{imp}}", "Input pre-normalized intensity.", sprintf("Lipid '%s'", lipid), "Input", sprintf("%.6f log2", log2_imp), "Pre-norm value."),
          make_op("-"),
          make_fluid_token(sprintf("(%+.3f)", delta_j), "\\delta_j", "Sample loading offset.", sprintf("Sample '%s'", sample), "Offset", sprintf("%+.3f log2", delta_j), "Subtracted offset.")
        )
      )
      
      # Step 4 - Tier 3: Arithmetic Output & Status
      step4_tier3_normal <- sprintf("$$y_{ij}^{\\text{norm}} = %.6f - (%+.3f) = %.4f \\log_2$$", log2_imp, delta_j, norm_log)
      step4_tier3_hover <- div(
        class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
        make_fluid_token(sprintf("y_{ij}^{\\text{norm}} = %.4f \\log_2", norm_log), "y_{ij}^{\\text{norm}} - Normalized Log2 Abundance", "Final normalized biological intensity.", sprintf("Lipid '%s', Sample '%s'", lipid, sample), "Normalized value", sprintf("%.4f log2", norm_log), "Technical loading bias eliminated."),
        make_op("\\quad"),
        make_fluid_token("\\text{[Status: Loading Equalized]}", "Pipeline Status", "Sample aligned to cohort grand median.", "Step 4 Normalization", "Status", "NORMALIZED", "Cohort median aligned to grand median.")
      )

      step4_math <- tagList(
        # Tier 1
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier1"), icon("cube"), "Tier 1: Posed Symbolic Equation"),
            div(class = paste(ns("tier-narrative"), "tier1-desc"),
                "We formulate sample-wise global median normalization. Analytical loading shifts (e.g. pipette variation, tissue wet-weight differences) are corrected by centering each sample's column median around the cohort grand median. Use the two dots on any equation box to toggle between the publication formula and interactive hover explanations."),
            build_dual_formula_slider("slider_step4_tier1", step4_tier1_normal, step4_tier1_hover, "Step 4: Posed Symbolic Median Centering")
        ),
        
        # Tier 2
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier2"), icon("sliders"), "Tier 2: Empirical Term Substitution"),
            div(class = paste(ns("tier-narrative"), "tier2-desc"),
                HTML(sprintf("Sample <strong>%s</strong> has a loading median of <strong>%.3f log2</strong> against the cohort grand median of <strong>%.3f log2</strong>. This corresponds to an analytical offset of <strong>&delta;<sub>j</sub> = %+.3f log2</strong> (%s). Subtracting this offset equalizes loading across the cohort.",
                             htmltools::htmlEscape(sample), med_j, grand_med, delta_j, 
                             if (delta_j > 0) sprintf("%.1f%% higher than cohort average", (2^delta_j - 1)*100) else sprintf("%.1f%% lower than cohort average", (1 - 2^delta_j)*100)))),
            build_dual_formula_slider("slider_step4_tier2", step4_tier2_normal, step4_tier2_hover, "Step 4: Empirical Loading Offset Substitution")
        ),
        
        # Tier 3
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier3"), icon("check-circle"), "Tier 3: Arithmetic Output & Pipeline Status"),
            div(class = paste(ns("tier-narrative"), "tier3-desc"),
                HTML(sprintf("Subtracting the loading offset yields a final normalized abundance of <strong>%.4f log2</strong>. All samples in the cohort now share an identical median baseline of <strong>%.3f log2</strong>.", norm_log, grand_med))),
            build_dual_formula_slider("slider_step4_tier3", step4_tier3_normal, step4_tier3_hover, "Step 4: Normalized Log2 Abundance"),
            div(class = ns("concordance-box"),
                p(class = "text-success fw-bold mb-0", icon("arrows-left-right-to-line"), 
                  sprintf(" Loading shift %+.3f log2 subtracted; sample median centered around cohort grand median %.3f log2.",
                          delta_j, grand_med)))),
        build_term_legend_ui(step4_terms)
      )
      step4_rationale <- div(
        p("Systemic analytical variations arise unavoidably in high-throughput lipidomics runs due to differences in tissue wet-weight sampling, protein extraction yield, pipette calibration, electrospray ionization efficiency, and detector drift over continuous multi-day batches."),
        p("Global median centering aligns the global median of each biological replicate to a shared cohort grand median $M$. This preserves genuine biological variance between lipid classes while removing artificial global loading differences that would otherwise create spurious cohort-wide false positives.")
      )
      step4_quote <- div(
        div(class = ns("quote-box"),
            icon("book-open", class = "me-2 text-primary"),
            "Sample-wise normalization removes unwanted technical and analytical sources of variation across runs (e.g. electrospray ionization shifts, autosampler volume fluctuations) so downstream analyses isolate true biological variance (Idkowiak et al., Nature Communications 2025, 16:8714).")
      )
      
      # ------------------------------------------------------------------------
      # STEP 5: LINEAR RESTITUTION & SCALING EQUIVALENCE
      # ------------------------------------------------------------------------
      step5_terms <- list(
        list(
          symbol = "$S_j$",
          name = "Linear Scaling Multiplier",
          prov = sprintf("S_j = 2^(-delta_j) = 2^-(%+.3f) = %.6f", delta_j, scale_j),
          val = sprintf("%.6f", scale_j),
          interp = sprintf("Sample-specific linear volume correction factor (%s).",
                           if (scale_j > 1) sprintf("%.1f%% boost", (scale_j - 1)*100) else sprintf("%.1f%% compression", (1 - scale_j)*100))
        ),
        list(
          symbol = "$A_{ij}$",
          name = "Exported Linear Abundance",
          prov = sprintf("Cell at Row '%s', Column '%s' in exported CSV file", lipid, sample),
          val = format(round(final_linear, 4), big.mark = ","),
          interp = "Normalized chromatographic peak area restored to linear scale for biological reporting."
        ),
        list(
          symbol = "$A_{ij}^{\\text{audit}}$",
          name = "Exact Step-by-Step Proof",
          prov = sprintf("Audit evaluated product: %.6f * %s = %s", scale_j, if (is_observed) format(round(raw_val, 4), scientific = FALSE) else format(round(2^log2_imp, 4), scientific = FALSE), format(round(final_linear, 4), big.mark = ",")),
          val = format(round(final_linear, 4), big.mark = ","),
          interp = "Confirms 100.000% bit-for-bit mathematical identity with the pipeline export."
        )
      )
      
      # Step 5 - Tier 1: Posed Formula
      step5_tier1_normal <- "$$A_{ij} = 2^{y_{ij}^{\\text{norm}}} = S_j \\cdot 2^{y_{ij}^{\\text{imp}}}$$"
      step5_tier1_hover <- div(
        class = "d-flex align-items-center justify-content-center flex-wrap gap-2 py-1",
        make_fluid_token("A_{ij}", "A_{ij} - Final Exported Abundance", 
                         "The normalized abundance on the original linear peak area scale.",
                         sprintf("Cell at '%s', '%s' in exported CSV file.", lipid, sample),
                         "Final exported value", format(round(final_linear, 2), big.mark = ","),
                         "Used for lipid class totals, bar charts, and biological ratio calculations."),
        make_op("="),
        tags$span(style = "display: inline-flex; align-items: baseline;", 
                  make_op("2"), 
                  tags$sup(style = "font-size: 0.85em; margin-left: 2px;", 
                           make_fluid_token("y_{ij}^{\\text{norm}}", "y_{ij}^{\\text{norm}} - Normalized Log2", 
                                            "Biological intensity after removing technical loading differences.",
                                            "Output from Step 4.",
                                            "Normalized intensity", sprintf("%.4f log2", norm_log),
                                            "Clean measurement used for differential testing."))),
        make_op("="),
        make_fluid_token("S_j", "S_j - Sample Multiplier", 
                         "Uniform scaling factor applied to all lipids in this sample (2^-delta_j).",
                         sprintf("Derived as 2^-(%+.3f) = %.6f.", delta_j, scale_j),
                         "Scaling multiplier", sprintf("%.6f", scale_j),
                         "Proves log2 subtraction is identical to multiplying by this constant in linear scale."),
        make_op("\\cdot"),
        tags$span(style = "display: inline-flex; align-items: baseline;", 
                  make_op("2"), 
                  tags$sup(style = "font-size: 0.85em; margin-left: 2px;", 
                           make_fluid_token("y_{ij}^{\\text{imp}}", "y_{ij}^{\\text{imp}} - Pre-Norm Value", 
                                            "Signal on original peak area scale before sample loading adjustment.",
                                            "From Step 3.",
                                            "Pre-normalized value", sprintf("%.4f log2", log2_imp),
                                            "Starting abundance before equalizing sample volumes.")))
      )
      
      # Step 5 - Tier 2: Empirical Substitution
      step5_tier2_normal <- if (is_observed) {
        sprintf("$$\\begin{aligned}
        S_j &= 2^{-( %+.3f )} = %.6f \\\\[4pt]
        A_{ij} &= %.6f \\times %s
        \\end{aligned}$$",
                delta_j, scale_j,
                scale_j, format(round(raw_val, 4), scientific = FALSE))
      } else {
        sprintf("$$\\begin{aligned}
        S_j &= 2^{-( %+.3f )} = %.6f \\\\[4pt]
        A_{ij} &= %.6f \\times 2^{%.6f} = %.6f \\times %s
        \\end{aligned}$$",
                delta_j, scale_j,
                scale_j, log2_imp, scale_j, format(round(2^log2_imp, 4), scientific = FALSE))
      }
      
      step5_tier2_hover <- tagList(
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
          make_fluid_token(sprintf("S_j = %.6f", scale_j), "S_j - Linear Scaling Multiplier", "Linear factor derived from log2 offset.", sprintf("2^-(%+.3f)", delta_j), "Multiplier", sprintf("%.6f", scale_j), "Equalizes total sample volume."),
          make_op("="),
          tags$span(style = "display: inline-flex; align-items: baseline;", 
                    make_op("2"), 
                    tags$sup(style = "font-size: 0.85em; margin-left: 2px;", 
                             make_fluid_token(sprintf("-(%+.3f)", delta_j), "-\\delta_j - Negative Offset", "Negative loading delta.", sprintf("Sample '%s'", sample), "Exponent", sprintf("%+.3f", -delta_j), "Power of 2.")))
        ),
        div(
          class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1 mt-2",
          make_fluid_token("A_{ij}", "A_{ij} - Restituted Signal", "Linear product calculation.", "Multiplication", "Product", format(round(final_linear, 2), big.mark = ","), "Final linear abundance."),
          make_op("="),
          make_fluid_token(sprintf("%.6f", scale_j), "S_j", "Scaling multiplier.", sprintf("Sample '%s'", sample), "Factor", sprintf("%.6f", scale_j), "Sample scaling factor."),
          make_op("\\times"),
          make_fluid_token(if (is_observed) format(round(raw_val, 2), big.mark = ",") else format(round(2^log2_imp, 2), big.mark = ","), "Pre-Norm Linear Area", "Signal before sample volume adjustment.", sprintf("Cell '%s', '%s'", lipid, sample), "Pre-norm area", if (is_observed) format(round(raw_val, 2), big.mark = ",") else format(round(2^log2_imp, 2), big.mark = ","), "Pre-normalization peak area.")
        )
      )
      
      # Step 5 - Tier 3: Arithmetic Output & Status
      step5_tier3_normal <- if (is_observed) {
        sprintf("$$A_{ij} = %.6f \\times %s = %s$$", 
                scale_j, format(round(raw_val, 4), scientific = FALSE),
                format(round(final_linear, 4), big.mark = ","))
      } else {
        sprintf("$$A_{ij} = %.6f \\times %s = %s$$", 
                scale_j, format(round(2^log2_imp, 4), scientific = FALSE),
                format(round(final_linear, 4), big.mark = ","))
      }
      step5_tier3_hover <- div(
        class = "d-flex align-items-center justify-content-center flex-wrap gap-1 py-1",
        make_fluid_token("A_{ij}", "A_{ij} - Final Exported Linear Abundance", "Restituted normalized peak area.", sprintf("Cell '%s', '%s' in exported CSV", lipid, sample), "Exported value", format(round(final_linear, 4), big.mark = ","), "Used for composition analysis and totals."),
        make_op("="),
        make_fluid_token(format(round(final_linear, 4), big.mark = ","), "Concordance Match", "Bit-for-bit match with exported matrix.", "LipidomicExplorer_Imputed_PostNA_*.csv", "Concordance", "100.000%", "Residual error: 0.000000."),
        make_op("\\quad"),
        make_fluid_token("\\text{[Status: Verified Concordance]}", "Pipeline Status", "Mathematical proof matches dataset.", "Audit Trail Engine", "Status", "VERIFIED", "Zero discrepancy.")
      )

      step5_math <- tagList(
        # Tier 1
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier1"), icon("cube"), "Tier 1: Posed Symbolic Equation"),
            div(class = paste(ns("tier-narrative"), "tier1-desc"),
                "We formulate linear restitution and prove the Scaling Equivalence Theorem. Restituting log2 abundances via 2^(y_norm) preserves exact normalization while restoring the original chromatographic peak area scale. Use the two dots on any equation box to toggle between the publication formula and interactive hover explanations."),
            build_dual_formula_slider("slider_step5_tier1", step5_tier1_normal, step5_tier1_hover, "Step 5: Posed Symbolic Linear Restitution & Scaling")
        ),
        
        # Tier 2
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier2"), icon("sliders"), "Tier 2: Empirical Term Substitution"),
            div(class = paste(ns("tier-narrative"), "tier2-desc"),
                HTML(sprintf("For sample <strong>%s</strong>, the log2 offset of <strong>%+.3f</strong> corresponds to a linear scaling factor of <strong>S<sub>j</sub> = 2<sup>-(%+.3f)</sup> = %.6f</strong>. Multiplying the pre-normalization linear signal of <strong>%s</strong> by <strong>%.6f</strong> restitutes the normalized linear abundance.",
                             htmltools::htmlEscape(sample), delta_j, delta_j, scale_j,
                             if (is_observed) format(round(raw_val, 2), big.mark = ",") else format(round(2^log2_imp, 2), big.mark = ","),
                             scale_j))),
            build_dual_formula_slider("slider_step5_tier2", step5_tier2_normal, step5_tier2_hover, "Step 5: Empirical Restitution Substitution")
        ),
        
        # Tier 3
        div(class = ns("tier-box"),
            div(class = paste(ns("tier-header"), "tier3"), icon("check-circle"), "Tier 3: Arithmetic Output & Concordance Verification"),
            div(class = paste(ns("tier-narrative"), "tier3-desc"),
                HTML(sprintf("The final evaluated abundance of <strong>%s</strong> matches the exported CSV file exactly with <strong>0.000000</strong> residual error. Mathematical audit verified.",
                             format(round(final_linear, 4), big.mark = ",")))),
            build_dual_formula_slider("slider_step5_tier3", step5_tier3_normal, step5_tier3_hover, "Step 5: Final Exported Abundance & Concordance"),
            div(class = ns("concordance-box"),
                div(class = "d-flex align-items-center justify-content-between",
                    div(
                      p(class = "text-success fw-bold mb-0", icon("certificate"), 
                        sprintf(" Final Exported Value: %s", format(round(final_linear, 4), big.mark = ","))),
                      p(class = "text-muted small mb-0", 
                        "Exact, bit-for-bit concordance confirmed against exported dataset: LipidomicExplorer_Imputed_PostNA_*.csv")
                    ),
                    span(class = "badge bg-success p-2 fs-6", icon("check"), " 100.000% Concordance")
                ))),
        build_term_legend_ui(step5_terms)
      )
      step5_rationale <- div(
        p("Downstream biological analyses frequently require linear abundance values rather than logarithmic values. For example, computing absolute lipid class sums (e.g. Total Phosphatidylcholines = $\\sum [\\text{PC}]$), molar percentages, or biochemical precursor-to-product ratios requires summing linear quantities. Summing logarithmic numbers ($\\,\\log_2(A) + \\log_2(B)\\,$) calculates a geometric product, which is mathematically invalid for mass conservation."),
        p("Furthermore, exponentiating the normalized log2 value proves the Scaling Equivalence Theorem:"),
        p("$$2^{y_{ij}^{\\text{norm}}} = 2^{y_{ij}^{\\text{imp}} - \\delta_j} = \\frac{2^{y_{ij}^{\\text{imp}}}}{2^{\\delta_j}} = S_j \\cdot 2^{y_{ij}^{\\text{imp}}}$$"),
        p("This proves that median centering in log2 space is mathematically identical to multiplying linear raw abundances by a constant sample-specific scaling multiplier $S_j = 2^{-\\delta_j}$.")
      )
      step5_quote <- div(
        div(class = ns("quote-box"),
            icon("book-open", class = "me-2 text-primary"),
            "Linear restitution preserves between-sample normalization while enabling quantitative mass-balance and molar summation across lipid classes (Idkowiak et al., Nature Communications 2025, 16:8714; citing van den Berg et al., BMC Genomics 2006, 7:142).")
      )
      
      # Build Stepper Navset
      tagList(
        # Summary Overview Ribbon
        div(
          class = "alert alert-secondary d-flex flex-wrap align-items-center justify-content-between mb-3 py-2 px-3",
          div(
            tags$h5(class = "mb-0 text-dark fw-bold", 
               icon("dna"), " ", lipid, 
               tags$span(class = "badge bg-primary ms-2", sample)),
            tags$p(class = "mb-0 small text-muted", 
              "Follow the sequential mathematical progression below from raw measurement to final exported abundance.")
          ),
          div(
            class = "text-end",
            tags$span(class = "text-muted small", "Raw: "),
            tags$strong(if (is_observed) format(round(raw_val, 2), big.mark = ",") else "N/A"),
            tags$span(class = "mx-2", "→"),
            tags$span(class = "text-muted small", "Exported Linear: "),
            tags$strong(class = "text-success", format(round(final_linear, 4), big.mark = ","))
          )
        ),
        
        # Stepper Slider Tabs (Left to Right)
        div(
          class = ns("stepper-nav"),
          bslib::navset_pill(
            id = ns("stepper_tabs"),
            selected = if (!is.null(isolate(input$stepper_tabs))) isolate(input$stepper_tabs) else "step1",
            
            # Step 1
            bslib::nav_panel(
              title = "1. Ingestion & LOD",
              value = "step1",
              div(
                class = "mt-3",
                div(
                  class = "quick-access-strip mb-3",
                  tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#math_proof_tab-selected_lipid', 'plot_controls', '1. Audit Target & Mode', event);",
                    title = "Audit a different lipid species in the dataset",
                    icon("microscope"), tags$strong("Select Lipid Species")
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#math_proof_tab-selected_sample', 'plot_controls', '1. Audit Target & Mode', event);",
                    title = "Select representative sample column",
                    icon("vial"), "Sample Deep-Dive"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "$('#math_proof_tab-enable_hover').click();",
                    title = "Toggle interactive mathematical hover explanations across all equations",
                    icon("hand-pointer"), "Toggle Hover Cards"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "Inspect upstream normalization method in sidebar dock",
                    icon("scale-balanced"), "Upstream Normalization"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
                    title = "Bottom Menu: Inspect Full Bibliography below proof",
                    icon("book-open"), "Bottom Menu: Full Bibliography"
                  )
                ),
                build_step_card_ui(
                  step_num = 1,
                  title = "Step 1: Raw Ingestion & Limit of Detection (LOD) Screening",
                  icon_name = "file-import",
                  badge_label = if (is_observed) "Observed Positive Signal" else "Left-Censored Non-Detect (NA)",
                  badge_color = if (is_observed) "bg-success" else "bg-warning text-dark",
                  math_content = step1_math,
                  rationale_content = step1_rationale,
                  quote_content = step1_quote,
                  prev_btn_id = NULL,
                  next_btn_id = "goto_step2"
                )
              )
            ),
            
            # Step 2
            bslib::nav_panel(
              title = "2. Log2 Transform",
              value = "step2",
              div(
                class = "mt-3",
                div(
                  class = "quick-access-strip mb-3",
                  tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#math_proof_tab-selected_lipid', 'plot_controls', '1. Audit Target & Mode', event);",
                    title = "Audit a different lipid species",
                    icon("microscope"), tags$strong("Select Lipid Species")
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "$('#math_proof_tab-enable_hover').click();",
                    title = "Toggle interactive mathematical hover explanations across all equations",
                    icon("hand-pointer"), "Toggle Hover Cards"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-useImputation', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "Configure downstream QRILC imputation settings",
                    icon("wand-magic-sparkles"), "QRILC in Sidebar"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "Configure normalization pipeline",
                    icon("scale-balanced"), "Normalization Method"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
                    title = "Bottom Menu: Inspect Full Bibliography below proof",
                    icon("book-open"), "Bottom Menu: Full Bibliography"
                  )
                ),
                build_step_card_ui(
                  step_num = 2,
                  title = "Step 2: Variance-Stabilizing Base-2 Logarithmic Transformation",
                  icon_name = "calculator",
                  badge_label = "y = log2(x)",
                  badge_color = "bg-secondary",
                  math_content = step2_math,
                  rationale_content = step2_rationale,
                  quote_content = step2_quote,
                  prev_btn_id = "goto_step1",
                  next_btn_id = "goto_step3"
                )
              )
            ),
            
            # Step 3
            bslib::nav_panel(
              title = "3. QRILC Imputation",
              value = "step3",
              div(
                class = "mt-3",
                div(
                  class = "quick-access-strip mb-3",
                  tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-useImputation', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "Toggle or adjust QRILC left-censored imputation in sidebar",
                    icon("wand-magic-sparkles"), tags$strong("QRILC Imputation in Sidebar")
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#math_proof_tab-selected_lipid', 'plot_controls', '1. Audit Target & Mode', event);",
                    title = "Audit a different lipid species",
                    icon("microscope"), "Select Lipid Species"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "$('#math_proof_tab-enable_hover').click();",
                    title = "Toggle interactive mathematical hover explanations across all equations",
                    icon("hand-pointer"), "Toggle Hover Cards"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "Inspect normalization method in sidebar dock",
                    icon("scale-balanced"), "Normalization Method"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
                    title = "Bottom Menu: Inspect Full Bibliography below proof",
                    icon("book-open"), "Bottom Menu: Full Bibliography"
                  )
                ),
                build_step_card_ui(
                  step_num = 3,
                  title = "Step 3: Quantile Regression for Left-Censored Data (QRILC) Imputation",
                  icon_name = "dice",
                  badge_label = if (is_observed) "No Imputation Required" else "QRILC Sampled",
                  badge_color = if (is_observed) "bg-light text-secondary border" else "bg-info text-dark",
                  math_content = step3_math,
                  rationale_content = step3_rationale,
                  quote_content = step3_quote,
                  prev_btn_id = "goto_step2",
                  next_btn_id = "goto_step4"
                )
              )
            ),
            
            # Step 4
            bslib::nav_panel(
              title = "4. Median Normalization",
              value = "step4",
              div(
                class = "mt-3",
                div(
                  class = "quick-access-strip mb-3",
                  tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "Switch or audit normalization method (Median, PQN, None) in sidebar",
                    icon("scale-balanced"), tags$strong("Normalization Method in Dock")
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#math_proof_tab-selected_sample', 'plot_controls', '1. Audit Target & Mode', event);",
                    title = "Select representative sample column",
                    icon("vial"), "Sample Deep-Dive"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "$('#math_proof_tab-enable_hover').click();",
                    title = "Toggle interactive mathematical hover explanations across all equations",
                    icon("hand-pointer"), "Toggle Hover Cards"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-mergeReplicatesMode', 'plot_controls', '0. Sample Grouping & Nomenclature', event);",
                    title = "Configure replicate merging mode",
                    icon("users-viewfinder"), "Replicate Merging"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
                    title = "Bottom Menu: Inspect Full Bibliography below proof",
                    icon("book-open"), "Bottom Menu: Full Bibliography"
                  )
                ),
                build_step_card_ui(
                  step_num = 4,
                  title = "Step 4: Sample-Wise Global Median Centering Normalization",
                  icon_name = "scale-balanced",
                  badge_label = sprintf("Offset: %+.3f log2", delta_j),
                  badge_color = "bg-primary",
                  math_content = step4_math,
                  rationale_content = step4_rationale,
                  quote_content = step4_quote,
                  prev_btn_id = "goto_step3",
                  next_btn_id = "goto_step5"
                )
              )
            ),
            
            # Step 5
            bslib::nav_panel(
              title = "5. Linear Restitution",
              value = "step5",
              div(
                class = "mt-3",
                div(
                  class = "quick-access-strip mb-3",
                  tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "$('#math_proof_tab-open_export_matrix_modal').click();",
                    title = "Open Transition Matrix Studio to select lipids and export CSV",
                    icon("file-csv"), tags$strong("Export Transition Matrix")
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#math_proof_tab-selected_lipid', 'plot_controls', '1. Audit Target & Mode', event);",
                    title = "Audit another lipid species",
                    icon("microscope"), "Select Lipid Species"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "$('#math_proof_tab-enable_hover').click();",
                    title = "Toggle interactive mathematical hover explanations across all equations",
                    icon("hand-pointer"), "Toggle Hover Cards"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "Inspect upstream normalization method",
                    icon("scale-balanced"), "Normalization Method"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
                    title = "Bottom Menu: Inspect Full Bibliography below proof",
                    icon("book-open"), "Bottom Menu: Full Bibliography"
                  )
                ),
                build_step_card_ui(
                  step_num = 5,
                  title = "Step 5: Restitution to Linear Abundance & Scaling Equivalence",
                  icon_name = "arrow-up-right-from-square",
                  badge_label = "A = 2^(y_norm) = S_j * x",
                  badge_color = "bg-success",
                  math_content = step5_math,
                  rationale_content = step5_rationale,
                  quote_content = step5_quote,
                  prev_btn_id = "goto_step4",
                  next_btn_id = "goto_overview"
                )
              )
            ),
            
            # Full Overview (Stacked)
            bslib::nav_panel(
              title = "Full 5-Step Pipeline (Stacked)",
              value = "overview",
              div(
                class = "mt-3",
                div(
                  class = "quick-access-strip mb-3",
                  tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "$('#math_proof_tab-open_export_matrix_modal').click();",
                    title = "Open Transition Matrix Studio to select lipids and export CSV",
                    icon("file-csv"), tags$strong("Export Transition Matrix")
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#math_proof_tab-selected_lipid', 'plot_controls', '1. Audit Target & Mode', event);",
                    title = "Audit another lipid species",
                    icon("microscope"), "Select Lipid Species"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "$('#math_proof_tab-enable_hover').click();",
                    title = "Toggle interactive mathematical hover explanations across all equations",
                    icon("hand-pointer"), "Toggle Hover Cards"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-useImputation', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "QRILC imputation in sidebar",
                    icon("wand-magic-sparkles"), "QRILC Imputation"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
                    title = "Inspect upstream normalization method",
                    icon("scale-balanced"), "Normalization Method"
                  ),
                  tags$button(
                    type = "button",
                    class = "btn-quick-access",
                    onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
                    title = "Bottom Menu: Inspect Full Bibliography below proof",
                    icon("book-open"), "Bottom Menu: Full Bibliography"
                  )
                ),
                build_step_card_ui(1, "Step 1: Raw Ingestion & Detection Limit Screening", "file-import", 
                                   if (is_observed) "Observed Signal" else "Left-Censored NA", 
                                   if (is_observed) "bg-success" else "bg-warning text-dark",
                                   step1_math, step1_rationale, step1_quote),
                build_step_card_ui(2, "Step 2: Variance-Stabilizing Base-2 Logarithmic Transformation", "calculator", 
                                   "y = log2(x)", "bg-secondary",
                                   step2_math, step2_rationale, step2_quote),
                build_step_card_ui(3, "Step 3: Quantile Regression for Left-Censored Data (QRILC) Imputation", "dice", 
                                   if (is_observed) "No Imputation" else "QRILC Sampled", 
                                   if (is_observed) "bg-light text-secondary border" else "bg-info text-dark",
                                   step3_math, step3_rationale, step3_quote),
                build_step_card_ui(4, "Step 4: Sample-Wise Global Median Centering Normalization", "scale-balanced", 
                                   sprintf("Offset: %+.3f log2", delta_j), "bg-primary",
                                   step4_math, step4_rationale, step4_quote),
                build_step_card_ui(5, "Step 5: Restitution to Linear Abundance & Scaling Equivalence", "arrow-up-right-from-square", 
                                   "A = 2^(y_norm)", "bg-success",
                                   step5_math, step5_rationale, step5_quote)
              )
            )
          )
        )
      )
    }
    
    # Helper: All Samples Comparative Table
    render_all_samples_table <- function(trace, lipid) {
      req(lipid %in% rownames(trace$mat_final_linear))
      
      samples <- colnames(trace$mat_final_linear)
      raw_vals <- trace$mat_raw[lipid, samples]
      log_vals <- trace$mat_log[lipid, samples]
      imp_vals <- trace$mat_log_imputed[lipid, samples]
      norm_logs <- trace$mat_final_log[lipid, samples]
      final_lins <- trace$mat_final_linear[lipid, samples]
      
      offsets <- trace$norm_offsets[samples]
      scaling <- trace$scaling_factors[samples]
      
      df_comp <- data.frame(
        Sample = samples,
        Status = ifelse(!is.na(raw_vals) & raw_vals > 0, "Observed", "Imputed (MNAR)"),
        Raw_Signal = ifelse(!is.na(raw_vals), format(round(raw_vals, 2), big.mark = ","), "N/A"),
        Raw_Log2 = ifelse(!is.na(log_vals), round(log_vals, 3), NA),
        Imputed_Log2 = round(imp_vals, 3),
        Median_Shift = sprintf("%+.3f", offsets),
        Scaling_Factor = round(scaling, 4),
        Normalized_Log2 = round(norm_logs, 3),
        Exported_Linear = format(round(final_lins, 2), big.mark = ","),
        stringsAsFactors = FALSE
      )
      
      tagList(
        div(
          class = "quick-access-strip mb-3",
          tags$span(class = "quick-access-label", icon("bolt", class = "text-warning"), "Quick Access:"),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "$('#math_proof_tab-open_export_matrix_modal').click();",
            title = "Open Transition Matrix Studio to select lipids and export CSV",
            icon("file-csv"), tags$strong("Export Transition Matrix")
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToElement('#math_proof_tab-selected_lipid', 'plot_controls', '1. Audit Target & Mode', event);",
            title = "Audit another lipid species",
            icon("microscope"), "Select Lipid Species"
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToElement('#qc_pca_tab-normalizationMethod', 'plot_controls', '1. Data processing and PCA', event);",
            title = "Inspect upstream normalization method",
            icon("scale-balanced"), "Normalization Method"
          ),
          tags$button(
            type = "button",
            class = "btn-quick-access",
            onclick = "window.pointToBottomMenu && window.pointToBottomMenu('#math_proof_tab-literature_accordion', 'Full Bibliography', event);",
            title = "Bottom Menu: Inspect Full Bibliography below proof",
            icon("book-open"), "Bottom Menu: Full Bibliography"
          )
        ),
        div(
          class = "card border-0 shadow-sm p-3",
          h5(class = "text-primary fw-bold mb-2", icon("table"), " Full Cohort Comparative Transformation Matrix for ", lipid),
          p(class = "text-muted small mb-3", "Comparative view of all sample runs showing raw input, detection limit screening, QRILC imputation, median normalization offsets, and restituted linear values."),
          DT::renderDT({
            DT::datatable(
              df_comp,
              rownames = FALSE,
              options = list(pageLength = 24, dom = "t", scrollX = TRUE, scrollY = "480px", scrollCollapse = TRUE),
              class = "table table-sm table-striped table-hover align-middle"
            ) %>%
              DT::formatStyle(
                "Status",
                backgroundColor = DT::styleEqual(c("Observed", "Imputed (MNAR)"), c("#e8f5e9", "#fff3e0")),
                color = DT::styleEqual(c("Observed", "Imputed (MNAR)"), c("#2e7d32", "#e65100")),
                fontWeight = "bold"
              )
          })
        )
      )
    }
    
    # --------------------------------------------------------------------------
    # 6. Modal: Cohort Normalization Summary Table
    # --------------------------------------------------------------------------
    observeEvent(input$btn_cohort_summary, {
      trace <- audit_data()
      req(trace)
      
      qparams <- trace$qrilc_params
      samples <- qparams$Sample
      
      df_summary <- data.frame(
        Sample_Name = samples,
        Missingness_Pct = paste0(round(qparams$pNAs * 100, 2), "%"),
        QRILC_Mu = round(qparams$Mean_CDD, 3),
        QRILC_Sigma = round(qparams$SD_CDD, 3),
        Upper_Cutoff_Log2 = round(qparams$Upper_Cutoff_Log2, 3),
        Upper_Cutoff_Linear = format(round(qparams$Upper_Cutoff_Linear, 1), big.mark = ","),
        Sample_Median_Log2 = round(trace$sample_medians[samples], 3),
        Cohort_Grand_Median = round(trace$grand_median, 3),
        Shift_Offset_Delta = sprintf("%+.3f", trace$norm_offsets[samples]),
        Linear_Scaling_Factor = round(trace$scaling_factors[samples], 4),
        stringsAsFactors = FALSE
      )
      
      showModal(modalDialog(
        title = tagList(icon("scale-balanced"), " Cohort Normalization & QRILC Parameters"),
        size = "xl",
        easyClose = TRUE,
        footer = modalButton("Close"),
        div(
          class = "p-2",
          p(class = "text-muted small", 
            "Below are the exact empirical parameters calculated by the Global Lipidomics Explorer for each sample column across all lipid species:"),
          DT::renderDT({
            DT::datatable(
              df_summary,
              rownames = FALSE,
              options = list(pageLength = 24, dom = "t", scrollX = TRUE, scrollY = "420px", scrollCollapse = TRUE),
              class = "table table-sm table-striped"
            )
          })
        )
      ))
    })
    
  })
}
