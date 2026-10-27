# R/results_dashboard.R
# Descriptive results dashboard: PCA, class signal composition, distribution,
# top-variable heatmap. Every plot offers the exact data frame it draws as CSV.
# No tests of group differences are performed here.

rd_palette <- c("#337f87", "#c77958", "#6d7195", "#b89b5e", "#78a095", "#a68a9c", "#708ca6", "#a0a579")
rd_other <- "#9a9893"

rd_int <- function(x, default) {
  x <- suppressWarnings(as.integer(x))
  if (length(x) != 1 || is.na(x)) default else x
}

rd_value <- function(x) if (is.function(x)) tryCatch(x(), error = function(e) NULL) else x

# Fixed-order categorical colors; levels beyond 8 share the neutral "other" gray.
rd_colors <- function(levels) {
  cols <- rep(rd_other, length(levels))
  n <- min(length(levels), length(rd_palette))
  cols[seq_len(n)] <- rd_palette[seq_len(n)]
  stats::setNames(cols, levels)
}

# Resolve by category identity, never by the order of groups in this plot.
rd_shared_colors <- function(levels, mapping = NULL, fold_case = FALSE) {
  cols <- rd_colors(levels)
  if (is.null(mapping) || !length(mapping) || is.null(names(mapping))) return(cols)
  keys <- if (fold_case) toupper(names(mapping)) else names(mapping)
  wanted <- if (fold_case) toupper(levels) else levels
  # Canonical annotation keys (GP_PC, GL_TAG, FA_ACar) and the dashboard's
  # short class labels refer to the same category; do not change aggregation.
  if (fold_case) {
    short <- sub("^(GP|GL|SP|FA|ST|PR|SL|PK)_", "", keys)
    unique_alias <- !duplicated(short) & !duplicated(short, fromLast = TRUE) & !(short %in% keys)
    mapping <- c(mapping, mapping[unique_alias])
    keys <- c(keys, short[unique_alias])
  }
  matched <- unlist(mapping, use.names = FALSE)[match(wanted, keys)]
  valid <- !is.na(matched) & grepl("^#[0-9A-Fa-f]{6}$", matched)
  cols[valid] <- matched[valid]
  cols
}

rd_class <- function(lipids) {
  cls <- toupper(sub("[( /_\\-].*", "", trimws(lipids)))
  cls[is.na(cls) | !nzchar(cls)] <- "Unknown"
  cls
}

rd_layout <- function(p, ..., margin = list(l = 60, r = 20, t = 10, b = 60)) {
  plotly::layout(p, paper_bgcolor = "#ffffff", plot_bgcolor = "#ffffff",
                 font = list(family = "Inter, system-ui, sans-serif", size = 12, color = "#52514e"),
                 hoverlabel = list(bgcolor = "#ffffff", bordercolor = "#d9e1e3",
                                   font = list(family = "Inter, system-ui, sans-serif", size = 12,
                                               color = "#20323b"), align = "left"),
                 margin = margin, ...) |>
    plotly::event_register("plotly_click") |>
    plotly::config(displaylogo = FALSE, scrollZoom = FALSE, responsive = TRUE, modeBarButtonsToRemove = c("lasso2d", "select2d"))
}

# Thin labels, never observations. Full identifiers remain in hover and CSV.
rd_ticks <- function(values, budget) {
  if(!length(values))return(values)
  values[unique(round(seq(1,length(values),length.out=min(length(values),max(2,budget)))))]
}

rd_field_label <- function(field) {
  known <- c(Group1 = "Condition / cell type", Group2 = "Tissue / sample type",
             TimePoint = "Time point", PatientNumber = "Patient / donor",
             Replicate = "Replicate", FullName = "Sample ID")
  if (field %in% names(known)) return(unname(known[[field]]))
  tools::toTitleCase(gsub("[_.-]+", " ",
                           gsub("([a-z])([A-Z])", "\\1 \\2", field, perl = TRUE)))
}

rd_sample_fields <- function(meta, sample) {
  if (!is.data.frame(meta) || !"FullName" %in% names(meta)) return(character())
  index <- match(sample, as.character(meta$FullName))
  if (is.na(index)) return(character())
  fields <- setdiff(names(meta), "FullName")
  fields <- fields[!grepl("^(Display[_ .-]?Label|Cluster|Time[_ .-]?Point[_ .-]?Group[0-9]+)$",
                          fields, ignore.case = TRUE)]
  primary <- intersect(c("Group1", "Group2"), fields)
  secondary <- intersect(c("TimePoint", "PatientNumber", "Replicate"), fields)
  imported <- setdiff(fields, c(primary, secondary))
  fields <- c(primary, imported, secondary)
  values <- vapply(fields, function(field) {
    value <- as.character(meta[[field]][index])
    if (!length(value) || is.na(value) || !nzchar(trimws(value)) ||
        trimws(value) %in% c("Unspecified", "Unknown")) "" else value
  }, character(1))
  values[nzchar(values)]
}

rd_sample_hover <- function(sample, meta, max_fields = 8L) {
  escape <- function(x) as.character(htmltools::htmlEscape(x))
  fields <- rd_sample_fields(meta, sample)
  visible <- head(fields, max_fields)
  details <- if (length(visible)) paste0("<br>", paste(vapply(names(visible), function(field) {
    value <- visible[[field]]
    if (nchar(value) > 100L) value <- paste0(substr(value, 1L, 100L), "…")
    paste0("<span style='color:#6b7280'>", escape(rd_field_label(field)), ":</span> ",
           escape(value))
  }, character(1)), collapse = "<br>")) else ""
  more <- if (length(fields) > length(visible)) "<br><i>Click for all sample details</i>" else ""
  paste0("<b>", escape(sample), "</b>", details, more)
}

rd_sample_card <- function(sample, meta) {
  fields <- rd_sample_fields(meta, sample)
  shiny::tags$div(class = "rd-card rd-sample-card", role = "region",
    `aria-label` = paste("Sample details for", sample),
    style = "box-sizing:border-box;max-width:100%;min-width:0;margin-top:12px;padding:16px 20px;max-height:300px;overflow-y:auto;overflow-x:hidden;overflow-wrap:anywhere;background:#ffffff;color:#20323b;border:1px solid #d9e1e3;border-radius:12px;box-shadow:0 8px 24px rgba(22,34,48,0.08);",
    shiny::tags$h4(style = "margin:0 0 8px;overflow-wrap:anywhere;", "Sample details"),
    shiny::tags$p(style = "overflow-wrap:anywhere;word-break:break-word;",
                  shiny::tags$strong("Sample ID: "), sample),
    if (length(fields)) shiny::tags$dl(
      style = "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:10px 16px;margin:0;min-width:0;",
      lapply(names(fields), function(field) shiny::tags$div(style = "min-width:0;overflow-wrap:anywhere;word-break:break-word;",
        shiny::tags$dt(style = "font-weight:600;", rd_field_label(field)),
        shiny::tags$dd(style = "margin:0;overflow-wrap:anywhere;", fields[[field]]))))
    else shiny::tags$p("No additional confirmed metadata are available for this sample."))
}

rd_card <- function(ns, id, title, subtitle, height = "420px") {
  div(class = "rd-card",
    div(class = "rd-card-head",
      div(h3(title), p(class = "rd-card-sub", subtitle)),
      downloadButton(ns(paste0("dl_", id)), "Plot data (CSV)", class = "btn-sm rd-dl")),
    plotly::plotlyOutput(ns(paste0("plot_", id)), height = height),
    uiOutput(ns(paste0("detail_", id))),
    uiOutput(ns(paste0("note_", id)), class = "rd-card-note"))
}

results_dashboard_ui <- function(id = "results_dashboard") {
  ns <- if (is.null(id)) identity else NS(id)
  css <- "www/css/dashboard.css"
  div(class = "rd-dashboard",

    div(class = "rd-header",
      div(h2("Results overview"),
          p(class = "rd-lede", "Descriptive views of the applied, prepared abundances within the current lipid scope. Nothing here tests group differences.")),
      div(class = "rd-controls",
        tags$button(type = "button", class = "guide-button", icon("palette"), " Colors & palettes",
          onclick = "Shiny.setInputValue('data_hub-open_palette_editor', Date.now(), {priority:'event'});"),
        selectInput(ns("color_by"), "Color samples by", c("Condition / cell type"="Group1", "Tissue / sample type"="Group2"), width = "190px", selectize=FALSE),
        selectInput(ns("pca_transform"), "PCA abundance scale", c("Log2(pmax(x, 0) + 1) (canonical default)" = "log2", "Log10" = "log10", "Linear prepared values" = "linear"), width = "290px", selectize=FALSE),
        selectInput(ns("pca_scale"), "PCA scaling", c("Unit variance" = "uv", "Centered only" = "none"), width = "160px", selectize=FALSE),
        numericInput(ns("top_n"), "Heatmap lipids", 30, min = 5, max = 500, step = 5, width = "130px"),
        numericInput(ns("n_class"), "Classes shown", 7, min = 1, max = 7, width = "130px"))),
    uiOutput(ns("status")),
    uiOutput(ns("kpis")),
    div(class = "rd-card rd-violin-card",
      div(class = "rd-card-head",
        div(h3("Violin plots"), p(class = "rd-card-sub", "Compare the distribution of a lipid across your sample groups. Each dot is one measurement.")),
        downloadButton(ns("dl_violin"), "Plot data (CSV)", class = "btn-sm rd-dl")),
      div(class = "rd-violin-controls",
        selectizeInput(ns("violin_lipid"), "Choose a lipid", choices = NULL, width = "100%",
          options = list(placeholder = "Search for a lipid…")),
        tags$button(type = "button", class = "guide-button", `data-guide-tool` = "Violin Plots", "Class comparisons & advanced controls →")),
      p(class = "rd-card-sub", "Uses Color samples by above. Values are log10 prepared abundances, including applied normalization and imputation. For class proportions, fold changes and statistical tests, open advanced controls."),
      plotly::plotlyOutput(ns("plot_violin"), height = "360px"),
      uiOutput(ns("detail_violin")),
      uiOutput(ns("note_violin"), class = "rd-card-note")),
    div(class = "rd-grid",
      rd_card(ns, "pca", "Principal component analysis", "Samples projected on PC1 and PC2 of the selected abundance scale."),
      rd_card(ns, "comp", "Class signal composition", "Share of each sample's summed prepared signal by lipid class."),
      rd_card(ns, "dist", "Abundance distribution", "Per-sample distribution of log10 abundances."),
      rd_card(ns, "heat", "Top-variable lipids", "Row z-scores of log10 abundances for the most variable lipids.", "560px")),
    div(class = "rd-methods",
      h3("How to read these views"),
      tags$ul(
        tags$li(strong("Sample labels. "),"#1, #2 and so on are display positions in the current prepared dataset, not sample IDs. They can change after samples are excluded. Axes show fewer labels when space is limited; every measurement remains plotted. Hover or tap a mark for the original sample ID and confirmed metadata; click a mark to open its details below the chart. CSV files include the original IDs and display positions."),
        tags$li(strong("Input. "), "The applied output of data preparation (linear scale), restricted to the active targeted lipid scope. Pending, unapplied settings are not reflected."),
        tags$li(strong("Missing and nonpositive values. "), "Values that are missing, zero or negative cannot be log-transformed and are treated as missing in log10 views; they are never imputed here. Linear PCA uses complete finite lipids; log10 PCA and the heatmap use only lipids with a positive value in every displayed sample. The distribution plot shows positive values only; composition sums positive values only. Counts of excluded lipids are reported under each plot."),
        tags$li(strong("Transformations. "), "The canonical dashboard PCA uses log2(pmax(x, 0) + 1), centers each lipid and scales to unit variance, matching the shared individual-lipid PCA. Log10 and linear views remain available as explicitly labeled exploratory alternatives. The distribution and heatmap always use log10(abundance). The heatmap ranks lipids by variance of log10 values across displayed samples and shows per-lipid z-scores (color is relative within each row)."),
        tags$li(strong("Composition is not molar. "), "Class shares are fractions of summed prepared feature signal. Ionization efficiency differs across classes and species, so these shares are not molar proportions or absolute amounts without validated quantitative calibration."),
        tags$li(strong("No inference. "), "Groups are used only for color and ordering. Separation in PCA or the heatmap is exploratory, not evidence of a group difference."))))
}

results_dashboard_module_server <- function(input, output, session, shared_data) {
  plot_width <- function(id) { w<-session$clientData[[paste0("output_",session$ns(paste0("plot_",id)),"_width")]]; if(is.null(w)||!is.finite(w)||w<=0)600 else w }
  sample_axis <- function(values,id,left=60) {
    ticks<-rd_ticks(values,floor((plot_width(id)-left-35)/48))
    list(title="Sample",type="category",tickangle=0,categoryorder="array",categoryarray=values,tickmode="array",tickvals=ticks,ticktext=unname(sample_info()$labels[ticks]),automargin=TRUE,tickfont=list(size=11))
  }
  base <- reactive({
    df <- rd_value(shared_data$data_processed)
    validate(need(is.data.frame(df) && ncol(df) >= 3 && nrow(df) >= 2,
                  "Prepare data to see results (at least 2 lipids and 2 samples are needed)."))
    mat <- as.matrix(df[, -1, drop = FALSE])
    storage.mode(mat) <- "double"
    rownames(mat) <- make.unique(as.character(df[[1]]))
    meta <- rd_value(shared_data$all_metadata)
    samples <- colnames(mat)
    grp <- function(col) {
      g <- if (is.data.frame(meta) && all(c("FullName", col) %in% names(meta)))
        as.character(meta[[col]][match(samples, meta$FullName)]) else rep(NA_character_, length(samples))
      g[is.na(g) | !nzchar(g)] <- "Unassigned"
      g
    }
    groups <- data.frame(Sample = samples, Group1 = grp("Group1"), Group2 = grp("Group2"), stringsAsFactors = FALSE)
    log_mat <- mat
    log_mat[!is.finite(log_mat) | log_mat <= 0] <- NA
    log_mat <- log10(log_mat)
    list(mat = mat, log = log_mat, groups = groups, class = rd_class(rownames(mat)), meta = meta)
  })

  sample_hover <- reactive({
    b <- base()
    stats::setNames(vapply(b$groups$Sample, rd_sample_hover, character(1), meta = b$meta),
                    b$groups$Sample)
  })
  clicked_sample <- reactiveVal(NULL)
  clicked_chart <- reactiveVal(NULL)
  for (chart in c("violin", "pca", "comp", "dist", "heat")) local({
    chart_id <- chart
    source_id <- session$ns(paste0("rd_", chart_id))
    observeEvent(lipidomic_plotly_event("plotly_click", source = source_id), {
      hit <- lipidomic_plotly_event("plotly_click", source = source_id)
      raw <- if (chart_id %in% c("violin", "pca")) hit$customdata else hit$x
      sample <- as.character(unlist(raw, use.names = FALSE)[1])
      if (length(sample) && !is.na(sample) && sample %in% base()$groups$Sample) {
        clicked_sample(sample)
        clicked_chart(chart_id)
      }
    }, ignoreInit = TRUE)
    output[[paste0("detail_", chart_id)]] <- renderUI({
      if (!identical(clicked_chart(), chart_id)) return(NULL)
      sample <- clicked_sample()
      if (is.null(sample) || !sample %in% base()$groups$Sample) return(NULL)
      rd_sample_card(sample, base()$meta)
    })
  })

  initial_grouping <- FALSE
  observeEvent(base(),{if(!initial_grouping){b<-base();updateSelectInput(session,"color_by",selected=if(length(unique(b$groups$Group1))>1)"Group1" else "Group2");initial_grouping<<-TRUE}},ignoreInit=FALSE)

  sample_info <- reactive({
    b <- base()
    g <- b$groups[[if (identical(input$color_by, "Group2")) "Group2" else "Group1"]]
    lev <- unique(g)
    ord <- order(match(g, lev), b$groups$Sample)
    labels <- stats::setNames(sprintf("#%d",seq_along(g)),b$groups$Sample)
    grouping <- if (identical(input$color_by, "Group2")) "Group2" else "Group1"
    maps <- rd_value(shared_data$color_maps)
    list(group = g, levels = lev, colors = rd_shared_colors(lev, maps[[grouping]]), order = ord, labels = labels)
  })

  complete_log <- reactive({
    lm <- base()$log
    keep <- rowSums(is.na(lm)) == 0
    sds <- apply(lm[keep, , drop = FALSE], 1, stats::sd)
    list(mat = lm[keep, , drop = FALSE][sds > 0, , drop = FALSE],
         n_incomplete = sum(!keep), n_constant = sum(sds == 0))
  })

  output$status <- renderUI({
    if (isTRUE(rd_value(shared_data$preparation_dirty)))
      div(class = "rd-pending", role = "status", icon("triangle-exclamation"),
          " Preparation settings changed. These results still reflect the previously applied run; update prepared data to refresh them.")
  })

  output$kpis <- renderUI({
    b <- base(); si <- sample_info()
    nonpos <- mean(is.na(b$log)) * 100
    tile <- function(v, l) div(class = "rd-kpi", div(class = "rd-kpi-value", v), div(class = "rd-kpi-label", l))
    div(class = "rd-kpis",
      tile(format(nrow(b$mat), big.mark = ","), "Lipids in scope"),
      tile(ncol(b$mat), "Samples"),
      tile(length(unique(b$class)), "Lipid classes"),
      tile(length(si$levels), paste("Groups in", if(identical(input$color_by,"Group2"))"tissue" else "condition")),
      tile(sprintf("%.1f%%", nonpos), "Missing or nonpositive values"))
  })

  # ---- Visible lipid distributions -------------------------------------------
  observeEvent(base(), {
    choices <- rownames(base()$mat)
    selected <- isolate(input$violin_lipid)
    if (length(selected) != 1 || !selected %in% choices) selected <- choices[1]
    updateSelectizeInput(session, "violin_lipid", choices = choices, selected = selected, server = TRUE)
  })
  violin_data <- reactive({
    b <- base(); si <- sample_info()
    req(input$violin_lipid, input$violin_lipid %in% rownames(b$mat))
    values <- as.numeric(b$mat[input$violin_lipid, ])
    keep <- is.finite(values) & values > 0
    data.frame(Sample = b$groups$Sample[keep], Group = si$group[keep],
      Lipid = rep(input$violin_lipid, sum(keep)), Prepared_abundance = values[keep],
      Log10_abundance = log10(values[keep]), stringsAsFactors = FALSE)
  })
  output$plot_violin <- plotly::renderPlotly({
    d <- violin_data(); si <- sample_info()
    validate(need(nrow(d) > 0, "This lipid has no positive, finite values to plot. Choose another lipid."))
    d$Group <- factor(d$Group, levels = si$levels)
    d$Hover <- paste0(unname(sample_hover()[d$Sample]), "<br>Lipid: ",
                      as.character(htmltools::htmlEscape(d$Lipid)))
    plotly::plot_ly(d, x = ~Group, y = ~Log10_abundance, color = ~Group,
      source = session$ns("rd_violin"), customdata = ~Sample,
      colors = si$colors, type = "violin", points = "all", jitter = 0.16,
      pointpos = 0, spanmode = "hard", box = list(visible = TRUE),
      marker = list(color = "#162230", size = 5, opacity = 0.8),
      meanline = list(visible = FALSE), text = ~Hover,
      hovertemplate = "%{text}<br>log10 prepared abundance: %{y:.3f}<extra></extra>") |>
      rd_layout(xaxis = list(title = "Sample group", type = "category"),
        yaxis = list(title = "log10 prepared abundance", gridcolor = "#ebeae6"), showlegend = FALSE)
  })
  output$note_violin <- renderUI({
    d <- violin_data(); omitted <- ncol(base()$mat) - nrow(d)
    paste0(nrow(d), " measurements shown; ", omitted,
      " excluded for missing, zero or negative values. Shape shows a smoothed distribution; the inner box shows quartiles and median. Small groups may not form a meaningful violin. Descriptive only: no significance test is applied.")
  })

  # ---- PCA -------------------------------------------------------------------
  pca_data <- reactive({
    b <- base(); si <- sample_info()
    linear <- identical(input$pca_transform, "linear")
    log10 <- identical(input$pca_transform, "log10")
    canonical <- !linear && !log10
    # Keep the dashboard's default numerically aligned with shared_data$pca_results
    # (individual-lipid mode): log2(pmax(x, 0) + 1), complete finite lipids,
    # variance cutoff 1e-10, centered and unit-variance scaled.
    mat <- if (linear) b$mat else if (log10) b$log else log2(pmax(b$mat, 0) + 1)
    keep <- rowSums(!is.finite(mat)) == 0
    sds <- apply(mat[keep, , drop = FALSE], 1, stats::sd)
    variable <- sds^2 >= 1e-10
    cl <- list(mat = mat[keep, , drop = FALSE][variable, , drop = FALSE],
               n_incomplete = sum(!keep), n_constant = sum(!variable))
    validate(need(nrow(cl$mat) >= 2 && ncol(cl$mat) >= 3,
                  "PCA needs at least 2 complete, non-constant lipids and 3 samples."))
    # Unit variance is the canonical default, while the explicit centered-only
    # control remains available for exploratory dashboard views.
    pc <- stats::prcomp(t(cl$mat), center = TRUE, scale. = identical(input$pca_scale, "uv"))
    ve <- pc$sdev^2 / sum(pc$sdev^2) * 100
    list(df = data.frame(Sample = rownames(pc$x), Group = si$group, PC1 = pc$x[, 1], PC2 = pc$x[, 2],
                         PC1_variance_pct = ve[1], PC2_variance_pct = ve[2], Lipids_used = nrow(cl$mat),
                         Scaling = input$pca_scale,
                         Transformation = if (linear) "linear" else if (log10) "log10" else "log2_pmax_plus_1",
                         stringsAsFactors = FALSE),
         ve = ve, cl = cl, pc = pc)
  })

  output$plot_pca <- plotly::renderPlotly({
    d <- pca_data(); si <- sample_info(); df <- d$df
    df$Group <- factor(df$Group, levels = si$levels)
    df$Hover <- unname(sample_hover()[df$Sample])
    plotly::plot_ly(df, x = ~PC1, y = ~PC2, color = ~Group, colors = si$colors, type = "scatter", mode = "markers",
                    source = session$ns("rd_pca"), customdata = ~Sample,
                    marker = list(size = 11, line = list(color = "#fcfcfb", width = 2)),
                    text = ~Hover, hovertemplate = "%{text}<br>PC1 %{x:.2f}<br>PC2 %{y:.2f}<extra></extra>") |>
      rd_layout(xaxis = list(title = sprintf("PC1 (%.1f%%)", d$ve[1]), zeroline = FALSE, gridcolor = "#ebeae6"),
                yaxis = list(title = sprintf("PC2 (%.1f%%)", d$ve[2]), zeroline = FALSE, gridcolor = "#ebeae6"),
                legend = list(orientation = "h", y = -0.25),margin=list(l=60,r=15,t=10,b=100))
  })
  output$note_pca <- renderUI({
    d <- pca_data(); cl <- d$cl
    sprintf("%s abundances; centered%s. %d lipids used; %d excluded for missing%s values, %d for zero variance.",
            if(identical(input$pca_transform,"linear")) "Linear" else if (identical(input$pca_transform,"log10")) "Log10" else "Canonical log2(pmax(x, 0) + 1)",
            if(identical(input$pca_scale,"uv")) " and scaled to unit variance" else " only",
            nrow(cl$mat), cl$n_incomplete,
            if(identical(input$pca_transform,"linear") || identical(input$pca_transform,"log2")) " or nonfinite" else ", nonpositive or nonfinite",
            cl$n_constant)
  })

  # ---- Class composition -----------------------------------------------------
  comp_data <- reactive({
    b <- base(); si <- sample_info()
    pos <- b$mat
    pos[!is.finite(pos) | pos <= 0] <- 0
    by_class <- rowsum(pos, b$class)
    totals <- colSums(by_class)
    n_keep <- min(7, max(1, rd_int(input$n_class, 7)))  # 7 classes + "Other" fits the 8-hue palette
    top <- names(sort(rowSums(sweep(by_class, 2, pmax(totals, .Machine$double.eps), "/")), decreasing = TRUE))
    lab <- ifelse(rownames(by_class) %in% head(top, n_keep), rownames(by_class), "Other classes")
    by_class <- rowsum(by_class, lab)
    out <- expand.grid(Class = rownames(by_class), Sample = colnames(by_class), stringsAsFactors = FALSE)
    out$Signal_sum <- as.vector(by_class)
    out$Share_pct <- ifelse(totals[out$Sample] > 0, out$Signal_sum / totals[out$Sample] * 100, NA)
    out$Group <- si$group[match(out$Sample, b$groups$Sample)]
    lev <- c(intersect(head(top, n_keep), rownames(by_class)), intersect("Other classes", rownames(by_class)))
    out$Class <- factor(out$Class, levels = lev)
    out$Sample <- factor(out$Sample, levels = b$groups$Sample[si$order])
    out[order(out$Sample, out$Class), ]
  })

  output$plot_comp <- plotly::renderPlotly({
    df <- comp_data(); lev <- levels(df$Class)
    cols <- rd_shared_colors(lev, rd_value(shared_data$class_color_map), fold_case = TRUE); cols["Other classes"] <- rd_other
    df$Hover <- paste0(unname(sample_hover()[as.character(df$Sample)]), "<br>Class: ",
                       as.character(htmltools::htmlEscape(as.character(df$Class))))
    plotly::plot_ly(df, x = ~Sample, y = ~Share_pct, color = ~Class, colors = cols[lev], type = "bar",
                    source = session$ns("rd_comp"), text = ~Hover,
                    marker = list(line = list(color = "#fcfcfb", width = 1)),
                    hovertemplate = "%{text}<br>%{y:.1f}% of summed signal<extra></extra>") |>
      rd_layout(barmode = "stack", bargap = 0.15,
                xaxis = sample_axis(levels(df$Sample),"comp"),
                yaxis = list(title = "Share of summed signal (%)", range = c(0, 100), gridcolor = "#ebeae6"),
                legend = list(traceorder = "normal",orientation="h",x=0,y=-0.25), margin=list(l=60,r=15,t=10,b=130))
  })
  output$note_comp <- renderUI("Signal shares, not molar proportions. Missing and nonpositive values contribute nothing to sums. Sample labels are spaced for readability; hover or tap any bar for its full identifier.")

  # ---- Distribution ----------------------------------------------------------
  dist_data <- reactive({
    b <- base(); si <- sample_info()
    out <- data.frame(Lipid_Name = rep(rownames(b$log), ncol(b$log)),
                      Sample = rep(colnames(b$log), each = nrow(b$log)),
                      log10_abundance = as.vector(b$log), stringsAsFactors = FALSE)
    out <- out[!is.na(out$log10_abundance), ]
    out$Group <- si$group[match(out$Sample, b$groups$Sample)]
    out$Sample <- factor(out$Sample, levels = b$groups$Sample[si$order])
    out[order(out$Sample), ]
  })

  output$plot_dist <- plotly::renderPlotly({
    df <- dist_data(); si <- sample_info()
    boxes <- split(df$log10_abundance, df$Sample, drop = TRUE)
    p <- plotly::plot_ly(source = session$ns("rd_dist"))
    shown_groups <- character()
    hovers <- sample_hover()
    for (sample in levels(df$Sample)) {
      values <- boxes[[sample]]
      if (!length(values)) next
      group <- as.character(df$Group[match(sample, as.character(df$Sample))])
      color <- unname(si$colors[[group]])
      p <- plotly::add_trace(p, x = rep(sample, length(values)), y = values,
        type = "box", name = group, legendgroup = group,
        showlegend = !group %in% shown_groups,
        marker = list(color = color), line = list(color = color, width = 1.5),
        boxpoints = FALSE,
        hovertemplate = paste0(hovers[[sample]],
          "<br>log10 abundance: %{y:.3f}<extra></extra>"))
      shown_groups <- union(shown_groups, group)
    }
    p |>
      rd_layout(xaxis = sample_axis(levels(df$Sample),"dist"),
                yaxis = list(title = "log10(abundance)", gridcolor = "#ebeae6"),
                legend = list(orientation = "h", y = -0.25),margin=list(l=60,r=15,t=10,b=100))
  })
  output$note_dist <- renderUI({
    sprintf("%s positive values shown; %s missing or nonpositive values omitted.",
            format(nrow(dist_data()), big.mark = ","), format(sum(is.na(base()$log)), big.mark = ","))
  })

  # ---- Heatmap ---------------------------------------------------------------
  heat_data <- reactive({
    cl <- complete_log(); si <- sample_info()
    validate(need(nrow(cl$mat) >= 2, "The heatmap needs at least 2 lipids with positive, non-constant values in every sample."))
    v <- apply(cl$mat, 1, stats::var)
    top <- names(sort(v, decreasing = TRUE))[seq_len(min(max(2, rd_int(input$top_n, 50)), length(v)))]
    m <- cl$mat[top, si$order, drop = FALSE]
    z <- t(scale(t(m)))
    if (nrow(z) > 2) z <- z[stats::hclust(stats::dist(z))$order, , drop = FALSE]
    out <- data.frame(Lipid_Name = rep(rownames(z), ncol(z)), Sample = rep(colnames(z), each = nrow(z)),
                      z_score = as.vector(z), log10_abundance = as.vector(cl$mat[rownames(z), colnames(z)]),
                      log10_variance = unname(v[rep(rownames(z), ncol(z))]), stringsAsFactors = FALSE)
    out$Group <- si$group[match(out$Sample, base()$groups$Sample)]
    list(z = z, df = out, n = length(v))
  })

  output$plot_heat <- plotly::renderPlotly({
    h <- heat_data(); z <- h$z; lim <- max(abs(z), 1, na.rm = TRUE)
    hover <- matrix(rep(unname(sample_hover()[colnames(z)]), each = nrow(z)), nrow = nrow(z))
    hover <- paste0(hover, "<br>Lipid: ",
                    rep(as.character(htmltools::htmlEscape(rownames(z))), ncol(z)))
    dim(hover) <- dim(z)
    plotly::plot_ly(x = colnames(z), y = rownames(z), z = z, type = "heatmap", zmin = -lim, zmax = lim,
                    source = session$ns("rd_heat"), text = hover,
                    colorscale = list(c(0, "#337f87"), c(0.5, "#f0efec"), c(1, "#c77958")),
                    xgap = 1, ygap = 1, colorbar = list(title = "z-score", thickness = 12),
                    hovertemplate = "%{text}<br>z = %{z:.2f}<extra></extra>") |>
      rd_layout(xaxis = sample_axis(colnames(z),"heat",left=125),
                yaxis = list(title = "", type = "category", tickmode="array",tickvals=rd_ticks(rownames(z),24),ticktext=vapply(rd_ticks(rownames(z),24),function(x)if(nchar(x)>19)paste0(substr(x,1,18),"…")else x,character(1)),tickfont = list(size = 10),automargin=TRUE),
                margin = list(l = 125, r = 20, t = 10, b = 70))
  })
  output$note_heat <- renderUI({
    h <- heat_data()
    sprintf("Top %d of %d eligible lipids by variance of log10 values; rows clustered (Euclidean, complete linkage).", nrow(h$z), h$n)
  })

  # ---- Downloads: exactly the data frames drawn ------------------------------
  dl <- function(name, data_fun) downloadHandler(
    filename = function() sprintf("results_%s_%s.csv", name, format(Sys.Date(), "%Y%m%d")),
    content = function(file) {
      x<-data_fun();if("Sample" %in% names(x))x$Axis_label<-unname(sample_info()$labels[as.character(x$Sample)])
      a<-rd_value(shared_data$preparation_audit);x$Normalization<-a$normalization %||% "Unknown";x$Imputation<-a$imputation %||% "Unknown"
      utils::write.csv(sample_metadata_csv_safe(x),file,row.names=FALSE,na="")
    })
  output$dl_violin <- dl("lipid_violin", violin_data)
  output$dl_pca <- dl("pca_scores", function() pca_data()$df)
  output$dl_comp <- dl("class_signal_composition", comp_data)
  output$dl_dist <- dl("log10_distribution", dist_data)
  output$dl_heat <- dl("top_variable_heatmap", function() heat_data()$df)

  invisible(list(pca=pca_data,composition=comp_data,distribution=dist_data,heatmap=heat_data))
}

results_dashboard_server <- function(input,output,session,shared_data) {
  shiny::moduleServer("results_dashboard",function(input,output,session)results_dashboard_module_server(input,output,session,shared_data))
}
