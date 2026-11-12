# R/frontends/team/results_dashboard.R
# Descriptive results dashboard: PCA, class signal composition, distribution,
# top-variable heatmap. Every plot offers the exact data frame it draws as CSV.
# No tests of group differences are performed here.

rd_palette <- c("#337f87", "#c77958", "#6d7195", "#b89b5e", "#78a095", "#a68a9c", "#708ca6", "#a0a579")
rd_other <- "#9a9893"

# Presentation adapter: transpose all cell-associated data together, preserving IDs.
# Numeric colorscale stop positions deliberately use heterogeneous lists, not c().
rd_team_heatmap_view <- function(z, group_n) {
  stopifnot(is.matrix(z), length(group_n)==ncol(z))
  squares <- nrow(z)<=15L && ncol(z)<=15L
  text <- outer(rownames(z),seq_len(ncol(z)),function(lipid,i)
    paste0('Group: ',htmltools::htmlEscape(colnames(z)[i]),'<br>n = ',group_n[i],
      '<br>Lipid: ',htmltools::htmlEscape(lipid)))
  groups <- vapply(seq_len(ncol(z)),function(i) rd_team_heat_tick(colnames(z)[i],group_n[i]),character(1))
  if(squares) {
    width <- max(520, nrow(z)*16+230)
    list(squares=TRUE,z=t(z),text=t(text),x=rownames(z),y=colnames(z),
      width=width,height=ncol(z)*16+210,
      colorbar=list(title='Mean z-score',orientation='h',x=0,xanchor='left',y=1.02,yanchor='bottom',lenmode='pixels',len=250,thickness=10),
      xaxis=list(title='',type='category',tickmode='array',tickvals=rownames(z),ticktext=rownames(z),
        tickangle=-90,tickfont=list(size=9),domain=c(0,nrow(z)*16/(width-230)),constrain='domain',automargin=FALSE),
      yaxis=list(title=list(text='Sample group',standoff=6),type='category',tickmode='array',tickvals=colnames(z),ticktext=paste0(htmltools::htmlEscape(colnames(z)),' (n=',group_n,')'),
        scaleanchor='x',scaleratio=1,constrain='domain',automargin=FALSE),margin=list(l=210,r=20,t=70,b=140,autoexpand=FALSE))
  } else {
    # Preserve a usable row height instead of compressing the entire catalog
    # into a short card. The Canvas scrolls this bounded natural-size plot.
    height <- min(24000, max(420, nrow(z)*12+155))
    dense <- nrow(z)>60L
    margin <- if(dense)list(l=125,r=20,t=110,b=45) else list(l=125,r=20,t=10,b=145)
    colorbar <- if(dense)list(title='Mean z-score',thickness=12,lenmode='pixels',len=160,y=1,yanchor='top',x=1,xanchor='left') else list(title='Mean z-score',thickness=12)
    tick_budget <- min(80L,max(2L,floor((height-155)/16)))
    ticks <- rd_ticks(rownames(z),tick_budget)
    list(squares=FALSE,z=z,text=text,x=colnames(z),y=rownames(z),
      width=800,height=height,colorbar=colorbar,
      xaxis=list(title=list(text='Sample group',standoff=20),type='category',tickangle=0,side=if(dense)'top' else 'bottom',
        tickmode='array',tickvals=colnames(z),ticktext=groups,automargin=TRUE),
      yaxis=list(title='',type='category',tickmode='array',tickvals=ticks,
        ticktext=vapply(ticks,function(x)if(nchar(x)>19)paste0(substr(x,1,18),'…')else x,character(1)),
        tickfont=list(size=10),automargin=TRUE),margin=margin)
  }
}

rd_int <- function(x, default) {
  x <- suppressWarnings(as.integer(x))
  if (length(x) != 1 || is.na(x)) default else x
}

rd_value <- function(x) if (is.function(x)) tryCatch(x(), error = function(e) NULL) else x

# Team condition defaults only; explicit shared maps take precedence by exact ID.
rd_team_condition_colors <- function(levels, mapping=NULL) {
  palette<-c('#BCD8EC','#FFCBE1','#D6E5BD','#DCCCEC','#FFDAB4','#F9E1A8')
  # Sort IDs so category display order cannot change their default color.
  ids<-sort(unique(as.character(levels)),method='radix')
  defaults<-stats::setNames(rep(palette,length.out=length(ids)),ids)
  defaults[grepl('^healthy($|[_ -])',ids,ignore.case=TRUE)]<-'#7A7A7A'
  if(!is.null(mapping) && length(mapping) && !is.null(names(mapping))) {
    colors<-unlist(mapping,use.names=FALSE);keys<-names(mapping)
    valid<-!is.na(colors) & grepl('^#[0-9A-Fa-f]{6}$',colors) & keys%in%ids
    defaults[keys[valid]]<-colors[valid]
  }
  defaults[levels]
}

# masterColorMaps is populated with automatic Brewer defaults even when no user
# has chosen colors. Only the persisted palette state identifies intentional edits.
rd_team_resolved_condition_colors <- function(levels, palette_settings=NULL, context='Group1') {
  overrides<-list()
  if(is.list(palette_settings) && isTRUE(palette_settings$useCustomColors)) {
    custom<-palette_settings$custom_colors
    if(!is.null(custom)) for(id in levels) {
      keys<-c(paste0(context,'::',id),paste0(context,'_',gsub('[^A-Za-z0-9]','_',id)),id,gsub('\\s|&','_',id))
      for(key in unique(keys)) {
        value<-if(key %in% names(custom)) custom[[key]] else NULL
        if(is.character(value) && length(value)==1L && !is.na(value) && grepl('^#[0-9A-Fa-f]{6}$',value)) {
          overrides[[id]]<-value;break
        }
      }
    }
  }
  rd_team_condition_colors(levels,overrides)
}

# Fixed-order categorical colors with a deterministic extended palette.
rd_colors <- function(levels) {
  cols <- if(length(levels)) grDevices::hcl.colors(length(levels), "Dark 3") else character()
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
    # The app's own class aliases (R/global.R class_map: TG -> GL_TAG, DG -> GL_DAG,
    # CAR -> FA_ACar, ...) name the same category under another short label.
    if (exists("class_map", inherits = TRUE) && is.character(class_map) && length(names(class_map))) {
      alias <- toupper(names(class_map)); target <- match(toupper(unname(class_map)), keys)
      add <- !is.na(target) & !(alias %in% keys) & !duplicated(alias)
      mapping <- c(mapping, mapping[target[add]])
      keys <- c(keys, alias[add])
    }
  }
  matched <- unlist(mapping, use.names = FALSE)[match(wanted, keys)]
  valid <- !is.na(matched) & grepl("^#[0-9A-Fa-f]{6}$", matched)
  cols[valid] <- matched[valid]
  cols
}

# Standalone sourcing (unit tests) still needs the Team palette helpers.
if (!exists("palette_distinct", mode = "function")) source(file.path("R", "frontends", "team", "palette_distinct.R"))
# Composition classes: resolve by identity, then never repeat a color within the
# plot (palette_distinct, R/frontends/team/palette_distinct.R). Bars and swatches share this map.
rd_class_colors <- function(levels, mapping = NULL) {
  palette_distinct(rd_shared_colors(levels, mapping, fold_case = TRUE))
}

rd_class <- function(lipids) {
  cls <- toupper(sub("[( /_\\-].*", "", trimws(lipids)))
  cls[is.na(cls) | !nzchar(cls)] <- "Unknown"
  cls
}

# Composition overview: a legend outside the bars, at the right, lists every visible class with a dot in its color,
# in the same order as the stack (top to bottom).
# The script recomputes the names after every draw, so a class that is turned off, by the class selector or by
# "Show series" in Appearance, loses its name at once and the others close up. Presentation only: it reads the plotted
# values and never changes them.
rd_comp_label_js <- "function(el, x) {
  var PREFIX = 'team-bar-label:', busy = false;
  function visibleBar(t) { return t && t.type === 'bar' && t.visible !== false && t.visible !== 'legendonly'; }
  function others(gd) { return (gd.layout.annotations || []).filter(function (a) { return !(a && typeof a.name === 'string' && a.name.indexOf(PREFIX) === 0); }); }
  function labels(gd) {
    var full = gd._fullLayout; if (!full || !full.xaxis || !full.yaxis || !full._size) return null;
    var cats = full.xaxis._categories || []; if (!cats.length) return [];
    var last = cats[cats.length - 1], h = full._size.h; if (!(h > 0)) return null;
    var items = [];
    (gd.data || []).forEach(function (t) {
      if (!visibleBar(t) || !Array.isArray(t.x) || !Array.isArray(t.y)) return;
      var i = t.x.indexOf(last), v = Number(t.y[i]); if (i < 0 || !isFinite(v) || v <= 0) return;
      var c = t.marker && typeof t.marker.color === 'string' ? t.marker.color : '#52514e';
      items.push({ name: String(t.name), color: c });
    });
    if (!items.length) return [];
    // The legend lists the classes in the same order as the stack, top to bottom: the last trace drawn is the top segment.
    items.reverse();
    var pitch = Math.max(11, Math.min(17, h / items.length)), fs = Math.max(9, Math.min(12, Math.round(pitch - 4))), text = (full.font && full.font.color) || '#52514e';
    return items.map(function (it, k) {
      return { name: PREFIX + it.name, xref: 'paper', yref: 'paper', x: 1.02, y: Math.round((1 - (k + 0.5) * pitch / h) * 10000) / 10000, showarrow: false,
        text: '<span style=\"color:' + it.color + '\">●</span> ' + it.name, xanchor: 'left', yanchor: 'middle', align: 'left', font: { size: fs, color: text }, captureevents: false };
    });
  }
  function sig(list) { return JSON.stringify((list || []).map(function (a) { return [a.name, a.y, a.text, a.x, a.font && a.font.size]; })); }
  function refresh() {
    if (busy || !el.layout || !window.Plotly) return;
    var wanted = labels(el); if (wanted === null) return;
    var current = (el.layout.annotations || []).filter(function (a) { return a && typeof a.name === 'string' && a.name.indexOf(PREFIX) === 0; });
    if (sig(current) === sig(wanted)) return;
    busy = true;
    Promise.resolve(window.Plotly.relayout(el, { annotations: others(el).concat(wanted) })).catch(function () {}).then(function () { busy = false; });
  }
  el.on('plotly_afterplot', refresh);
  refresh();
}"

rd_layout <- function(p, ..., margin = list(l = 60, r = 20, t = 10, b = 60)) {
  plotly::layout(p, paper_bgcolor = "#ffffff", plot_bgcolor = "#ffffff",
                 font = list(family = "Arial, Helvetica, sans-serif", size = 10, color = "#52514e"),
                 hoverlabel = list(bgcolor = "#ffffff", bordercolor = "#d9e1e3",
                                   font = list(family = "Arial, Helvetica, sans-serif", size = 10,
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

rd_pca_score_ui <- function(ns) {
  div(class = "rd-pca-score",
    tags$h4("PCA score analysis"),
    p(class = "rd-card-sub", "Tests whether the sample scores on one principal component differ between groups. The PCA itself is not changed."),
    selectInput(ns("pcs_pc"), "Principal component", c("PC1", "PC2", "PC3", "PC4", "PC5"), selectize = FALSE),
    checkboxGroupInput(ns("pcs_groups"), "Groups to compare", choices = character()),
    selectInput(ns("pcs_test"), "Tests", c("Kruskal-Wallis + Mann-Whitney U (rank-based)" = "rank", "One-way ANOVA + Welch t-test" = "param"), selectize = FALSE),
    selectInput(ns("pcs_corr"), "Multiple-testing correction", c("Benjamini-Hochberg (FDR)" = "BH", "Holm" = "holm", "Bonferroni" = "bonferroni", "None (unadjusted)" = "none"), selectize = FALSE),
    tags$button(type = "button", class = "btn btn-sm btn-primary rd-pcs-plot-btn", `data-pcs-plot` = "1", "Plot on canvas"),
    p(class = "rd-card-note rd-pcs-plot-note", "Adds the box plot and the group table as a figure on the canvas."),
    uiOutput(ns("pcs_report")))
}

rd_card <- function(ns, id, title, subtitle, height = "420px") {
  div(class = "rd-card",
    div(class = "rd-card-head",
      div(h3(title), p(class = "rd-card-sub", subtitle)),
      downloadButton(ns(paste0("dl_", id)), "Plot data (CSV)", class = "btn-sm rd-dl")),
    if (id == "heat") rd_heat_significance_ui(ns),
    if (id %in% c("comp", "heat")) uiOutput(ns(paste0("select_", id))),
    plotly::plotlyOutput(ns(paste0("plot_", id)), height = height),
    uiOutput(ns(paste0("detail_", id))),
    uiOutput(ns(paste0("note_", id)), class = "rd-card-note"),
    if (id == "pca") rd_pca_score_ui(ns))
}

# ---- PCA score statistics (Team Canvas, Statistics tab of the PCA card) -------
# Tests the sample scores of one principal component between sample groups. It never
# changes the PCA itself: scores come from pca_data() and are only read here.
rd_pca_score_stars <- function(p) {
  ifelse(is.na(p), "", ifelse(p < 0.001, "***", ifelse(p < 0.01, "**", ifelse(p < 0.05, "*", "ns"))))
}
rd_pca_score_fmt <- function(p) {
  ifelse(is.na(p), "NA", ifelse(p < 0.0001, "< 0.0001", formatC(p, digits = 2, format = "fg", flag = "#")))
}
rd_pca_score_stats <- function(score, group, test = c("rank", "param"), correction = c("BH", "holm", "bonferroni", "none")) {
  test <- match.arg(test); correction <- match.arg(correction)
  group <- as.character(group); lev <- unique(group)
  keep <- is.finite(score); score <- score[keep]; group <- group[keep]
  n <- vapply(lev, function(g) sum(group == g), integer(1)); names(n) <- lev
  tested <- lev[n[lev] >= 2L]
  skipped <- setdiff(lev, tested)
  med <- vapply(lev, function(g) if (n[[g]]) stats::median(score[group == g]) else NA_real_, numeric(1)); names(med) <- lev
  omni <- NULL
  if (length(tested) >= 3L) {
    k <- group %in% tested; gf <- factor(group[k], levels = tested)
    omni <- if (identical(test, "rank")) {
      r <- stats::kruskal.test(score[k], gf)
      list(name = "Kruskal-Wallis", p = unname(r$p.value))
    } else {
      r <- summary(stats::aov(score[k] ~ gf))[[1]]
      list(name = "One-way ANOVA", p = unname(r[["Pr(>F)"]][1]))
    }
  }
  prs <- if (length(tested) >= 2L) utils::combn(tested, 2L, simplify = FALSE) else list()
  rows <- lapply(prs, function(pr) {
    a <- score[group == pr[1]]; b <- score[group == pr[2]]
    p <- tryCatch(if (identical(test, "rank")) suppressWarnings(stats::wilcox.test(a, b, exact = FALSE)$p.value) else stats::t.test(a, b)$p.value, error = function(e) NA_real_)
    data.frame(A = pr[1], B = pr[2], p_raw = p, stringsAsFactors = FALSE)
  })
  pairs <- if (length(rows)) do.call(rbind, rows) else data.frame(A = character(), B = character(), p_raw = numeric(), stringsAsFactors = FALSE)
  pairs$p_adj <- if (nrow(pairs)) stats::p.adjust(pairs$p_raw, method = correction) else numeric()
  pairs$stars <- rd_pca_score_stars(pairs$p_adj)
  list(n = n, median = med, tested = tested, skipped = skipped, omnibus = omni, pairs = pairs, test = test, correction = correction)
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
        numericInput(ns("top_n"), "Most variable: count", 30, min = 5, max = 500, step = 5, width = "130px")),
      tags$div(style="display:none", textInput(ns("heat_group_selection"), NULL, value="__ALL__"), textInput(ns("heat_lipid_selection"), NULL, value="__ALL__"), textInput(ns("comp_class_selection"), NULL, value="__ALL__"))),
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
      rd_card(ns, "heat", "Lipid heatmap", "Explore individual lipids by class or search the full available catalog.", "560px"),
      div(class = "rd-pcascore-slot", style = "display:none", plotly::plotlyOutput(ns("plot_pcascore"), height = "460px"))),
    div(class = "rd-methods",
      h3("How to read these views"),
      tags$ul(
        tags$li(strong("Sample labels. "),"#1, #2 and so on are display positions in the current prepared dataset, not sample IDs. They can change after samples are excluded. Axes show fewer labels when space is limited; every measurement remains plotted. Hover or tap a mark for the original sample ID and confirmed metadata; click a mark to open its details below the chart. CSV files include the original IDs and display positions."),
        tags$li(strong("Input. "), "The applied output of data preparation (linear scale), restricted to the active targeted lipid scope. Pending, unapplied settings are not reflected."),
        tags$li(strong("Missing and nonpositive values. "), "Values that are missing, zero or negative cannot be log-transformed and are treated as missing in log10 views; they are never imputed here. Linear PCA uses complete finite lipids; log10 PCA and the heatmap use only lipids with a positive value in every displayed sample. The distribution plot shows positive values only; composition sums positive values only. Counts of excluded lipids are reported under each plot."),
        tags$li(strong("Transformations. "), "The canonical dashboard PCA uses log2(pmax(x, 0) + 1), centers each lipid and scales to unit variance, matching the shared individual-lipid PCA. Log10 and linear views remain available as explicitly labeled exploratory alternatives. The distribution and heatmap always use log10(abundance). The heatmap ranks lipids and computes row z-scores over the full prepared cohort, then displays group means. Changing visible groups does not recalculate these values."),
        tags$li(strong("Composition is not molar. "), "Class shares are fractions of summed prepared feature signal. Ionization efficiency differs across classes and species, so these shares are not molar proportions or absolute amounts without validated quantitative calibration."),
        tags$li(strong("No inference. "), "Groups define heatmap columns and sample colors. Separation in PCA or the heatmap is exploratory, not evidence of a group difference. The heatmap's optional Significant only view runs no test of its own: it keeps the lipids that Differential analysis already reports as significant for its current comparison, with that analysis's test, multiple-testing correction and thresholds, and is unavailable when the study design does not allow independent-sample inference."))))
}

# "Show: All lipids / Significant only" for the lipid heatmap. Nothing here
# computes a test: Significant only reads the Differential analysis result that
# the volcano and filtered heatmaps already use (shared_data$significant_lipids),
# so the test, threshold and multiple-testing correction are that analysis's own.
# "all" (the default, and the value of any older checkpoint without this input)
# leaves the heatmap exactly as before.
rd_heat_significance_choices <- c("All lipids" = "all", "Significant only" = "significant")
rd_heat_significance_ui <- function(ns) {
  div(class = "rd-heat-significance",
    radioButtons(ns("heat_significance"), "Show", choices = rd_heat_significance_choices, selected = "all", inline = TRUE),
    uiOutput(ns("heat_significance_status")))
}

# The option is offered only under the policy that gates the Differential
# analysis engine itself (a confirmed independent design, current prepared data,
# no synthetic samples: shared_data$inference_allowed) and the Team participant
# check used by Group comparison (repeated participant IDs are pseudoreplication).
# The returned reason is the app's existing wording for each block.
rd_heat_significance_guard <- function(shared_data) {
  guarded <- if (exists("team_group_comparison_guarded_data", mode = "function"))
    team_group_comparison_guarded_data(shared_data) else shared_data
  function(design_type = NULL) {
    policy <- shared_data$inference_allowed
    if (!is.function(policy) || !isTRUE(tryCatch(policy(paired = FALSE), error = function(e) FALSE))) {
      reason <- if (exists("team_violin_stats_design", mode = "function"))
        team_violin_stats_design(shared_data, design_type)$reason else NULL
      return(list(allowed = FALSE, reason = reason %||% "Independent inference is not authorized for this study design."))
    }
    participant <- if (is.function(guarded$participant_reason))
      tryCatch(guarded$participant_reason(), error = function(e) NULL) else NULL
    if (!is.null(participant)) return(list(allowed = FALSE, reason = participant, participant = TRUE))
    list(allowed = TRUE, reason = NULL)
  }
}

# Plain-language statement of the criterion significant_lipids() applies
# (R/modules/1_shared_data_module.R significantLipids), read from the same inputs.
rd_heat_significance_criterion <- function(settings, contrast, method, interaction = NULL) {
  fmt <- function(x) format(as.numeric(x), trim = TRUE, drop0trailing = TRUE)
  adjusted <- identical(settings$p_value_type %||% "adjusted", "adjusted")
  test <- switch(sub("^auto_", "", as.character(method %||% "")[1L]),
    limma = "limma moderated t-test", non_parametric = "Wilcoxon rank-sum test", "Differential analysis test")
  groups <- function(x) if (length(x) > 1L) sprintf("mean of (%s)", paste(x, collapse = ", ")) else as.character(x)
  side <- if (identical(settings$mode %||% "direct", "direct")) {
    if (is.list(contrast) && length(contrast$ref) && length(contrast$comp)) sprintf("%s vs %s", groups(contrast$comp), groups(contrast$ref)) else "Differential analysis comparison"
  } else if (is.list(interaction) && all(vapply(c("comp_t2", "comp_t1", "ref_t2", "ref_t1"), function(k) length(interaction[[k]]) == 1L && nzchar(interaction[[k]]), logical(1))))
    sprintf("interaction (%s - %s) - (%s - %s)", interaction$comp_t2, interaction$comp_t1, interaction$ref_t2, interaction$ref_t1)
  else "Differential analysis interaction contrast"
  sprintf("%s; %s %s %s and |log2FC| %s %s (%s on log2 abundance)", side,
    if (adjusted) "Benjamini-Hochberg adjusted p" else "unadjusted p", "\u2264", fmt(settings$p_threshold %||% 0.05),
    "\u2265", fmt(settings$log2fc_threshold %||% 1), test)
}

# interaction: the Differential analysis interaction groups (data_hub-int_*),
# used only to name the contrast.
rd_heat_significance_result <- function(shared_data, interaction = NULL) {
  res <- rd_value(shared_data$de_results)
  lipids <- rd_value(shared_data$significant_lipids)
  if (!is.data.frame(res) || is.null(lipids)) return(NULL)
  settings <- rd_value(shared_data$de_settings) %||% list(); method <- rd_value(shared_data$actual_de_method)
  # The non-parametric engine (R/modules/utils_stats.R perform_non_parametric_analysis)
  # reads only the first two groups of an interaction formula, so its p-values do
  # not test the interaction. Refuse rather than label them as interaction results.
  if (!identical(settings$mode %||% "direct", "direct") && identical(sub("^auto_", "", as.character(method %||% "")[1L]), "non_parametric"))
    return(list(blocked = "Differential analysis used the Wilcoxon rank-sum route for an interaction comparison; that route does not test the interaction, so its results are not used here."))
  list(lipids = unique(as.character(lipids)),
       criterion = rd_heat_significance_criterion(settings, rd_value(shared_data$de_contrast_info), method, interaction))
}

# Plotly expands a per-sample constant hover template once per lipid. In Team,
# compact only identical templates after Plotly builds its traces: a scalar is
# the same Plotly template for every point and leaves the numeric data intact.
plotly_build.team_compact_distribution <- function(p, ...) {
  class(p) <- setdiff(class(p), 'team_compact_distribution')
  p <- plotly::plotly_build(p, ...)
  p$x$data <- lapply(p$x$data, function(trace) {
    h <- trace$hovertemplate
    if (is.character(h) && length(h) > 1L && !anyNA(h) && all(h == h[[1L]])) trace$hovertemplate <- h[[1L]]
    # Transport only: www/team/js/plot_payload.js restores the same arrays before
    # Plotly draws (a repeated sample name sent once; values as exact doubles).
    x <- trace$x; y <- trace$y; if (utils::packageVersion('jsonlite') < '1.8.5') return(trace)
    if (is.character(x) && length(x) > 1L && !anyNA(x) && all(x == x[[1L]])) trace$x <- list(teamRepeat = x[[1L]], n = length(x))
    if (is.double(y) && length(y) > 1L && all(is.finite(y))) trace$y <- list(teamFloat64 = gsub('\n', '', jsonlite::base64_enc(writeBin(as.vector(y), raw(), size = 8L, endian = 'little')), fixed = TRUE))
    trace
  })
  # Unbuilt traces repeat every value; the browser never reads them (plotly's
  # own Shiny snapshot drops the same keys).
  p$x[c('visdat', 'cur_data', 'attrs')] <- NULL
  if (utils::packageVersion('jsonlite') >= '1.8.5') p$x$teamPacked <- 1L
  p
}

# Team violin style (presentation only): condition fill, outline darkened 45%,
# black points, inner box darkened 15% / 60%, black axis frame with outside ticks
# and a dotted horizontal grid. Values, samples and hover data are untouched.
rd_darker <- function(col, f) {
  m <- grDevices::col2rgb(col)[, 1]
  grDevices::rgb(floor(m[1] * (1 - f) + .5), floor(m[2] * (1 - f) + .5), floor(m[3] * (1 - f) + .5), maxColorValue = 255)
}
plotly_build.team_violin_style <- function(p, ...) {
  colors <- attr(p, 'team_violin_colors')
  class(p) <- setdiff(class(p), 'team_violin_style')
  p <- plotly::plotly_build(p, ...)
  p$x$data <- lapply(p$x$data, function(trace) {
    col <- if (identical(trace$type, 'violin')) unname(colors[as.character(trace$name)]) else NA
    if (length(col) != 1L || is.na(col) || !grepl('^#[0-9A-Fa-f]{6}$', col)) return(trace)
    trace$fillcolor <- col
    trace$line <- list(color = rd_darker(col, .45), width = 1.2)
    trace$marker <- list(color = '#000000', size = 5, opacity = 1, line = list(width = 0))
    trace$box <- list(visible = TRUE, width = .22, fillcolor = rd_darker(col, .15), line = list(color = rd_darker(col, .60), width = 1))
    trace
  })
  frame <- list(showline = TRUE, mirror = TRUE, linecolor = '#000000', ticks = 'outside')
  p$x$layout$xaxis <- utils::modifyList(if (is.list(p$x$layout$xaxis)) p$x$layout$xaxis else list(), frame)
  p$x$layout$yaxis <- utils::modifyList(if (is.list(p$x$layout$yaxis)) p$x$layout$yaxis else list(), c(frame, list(gridcolor = '#dddddd', griddash = 'dot')))
  p
}

# Team Canvas labels use multiple lines without changing group keys or hover data.
rd_team_heat_tick <- function(group, n) {
  label <- htmltools::htmlEscape(as.character(group))
  if (nchar(as.character(group)) > 12L) {
    label <- gsub("([_-])", "\\1<br>", label, perl=TRUE)
    label <- gsub("[[:space:]]+", "<br>", label, perl=TRUE)
  }
  paste0(label, "<br>(n=", n, ")")
}

results_dashboard_module_server <- function(input, output, session, shared_data) {
  plot_width <- function(id) { w<-session$clientData[[paste0("output_",session$ns(paste0("plot_",id)),"_width")]]; if(is.null(w)||!is.finite(w)||w<=0)600 else w }
  # Team distribution only: its ticks read the width through this budget, so a width
  # report that leaves the budget unchanged does not re-render it (reactiveVal ignores equal values).
  budgets <- new.env(parent=emptyenv())
  tick_budget <- function(id,left) {
    key <- paste(id,left); calc <- function() floor((plot_width(id)-left-35)/48)
    if (!isTRUE(shared_data$team_compact_distribution) || !identical(id,'dist')) return(calc())
    if (is.null(budgets[[key]])) { rv <- shiny::reactiveVal(shiny::isolate(calc())); shiny::observe(rv(calc()),priority=100); budgets[[key]] <- rv }
    budgets[[key]]()
  }
  sample_axis <- function(values,id,left=60) {
    ticks<-rd_ticks(values,tick_budget(id,left))
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
      if(chart_id=="comp" && isTRUE(shared_data$team_compact_distribution) && !identical(input$comp_axis_mode,"sample")) return()
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
  # A restored canvas copy brings its own grouping; only a new view picks one from the data.
  saved_grouping <- if (inherits(input,"team_dashboard_instance_input")) .subset2(input,"saved")$color_by else NULL
  observeEvent(base(),{if(!initial_grouping){if(!(length(saved_grouping)==1L&&saved_grouping%in%c("Group1","Group2"))){b<-base();updateSelectInput(session,"color_by",selected=if(length(unique(b$groups$Group1))>1)"Group1" else "Group2")};initial_grouping<<-TRUE}},ignoreInit=FALSE)

  sample_info <- reactive({
    b <- base()
    g <- b$groups[[if (identical(input$color_by, "Group2")) "Group2" else "Group1"]]
    lev <- unique(g)
    ord <- order(match(g, lev), b$groups$Sample)
    labels <- stats::setNames(sprintf("#%d",seq_along(g)),b$groups$Sample)
    grouping <- if (identical(input$color_by, "Group2")) "Group2" else "Group1"
    maps <- rd_value(shared_data$color_maps)
    colors <- if(isTRUE(shared_data$team_compact_distribution)) rd_team_resolved_condition_colors(lev,rd_value(shared_data$palette_settings),grouping) else rd_shared_colors(lev,maps[[grouping]])
    list(group = g, levels = lev, colors = colors, order = ord, labels = labels)
  })

  team_condition_meta <- function() if(isTRUE(shared_data$team_compact_distribution)) list(teamConditions=unname(sort(sample_info()$levels,method='radix'))) else NULL

  # Full label map lets the Team figure workspace distinguish a change in
  # label meaning from width-dependent thinning of axis ticks.
  canvas_sample_labels <- function() {
    labels <- sample_info()$labels
    c(list(teamCanvasSampleLabels = list(values = unname(names(labels)), labels = unname(labels))),team_condition_meta())
  }

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
      colors = si$colors, type = "violin", points = "all", hoveron = "points", jitter = 0.16,
      pointpos = 0, spanmode = "soft", box = list(visible = TRUE),
      marker = list(color = "#162230", size = 5, opacity = 0.8),
      meanline = list(visible = FALSE), text = ~Hover,
      hovertemplate = "%{text}<br>log10 prepared abundance: %{y:.3f}<extra></extra>") |>
      rd_layout(meta=team_condition_meta(),xaxis = list(title = "Sample group", type = "category"),
        yaxis = list(title = "log10 prepared abundance", zeroline = FALSE,
          autorange = TRUE, gridcolor = "#ebeae6"), showlegend = FALSE,
        margin = list(l = 60, r = 20, t = 10, b = 95),
        annotations = list(list(x = 0, y = 0, yshift = -65, xref = "paper", yref = "paper",
          text = "Dots: prepared sample values. Tails: smoothed estimates.",
          showarrow = FALSE, xanchor = "left", yanchor = "top",
          font = list(size = 10, color = "#52514e")))) |>
      (function(p) { if (!isTRUE(shared_data$team_compact_distribution)) return(p); attr(p, 'team_violin_colors') <- si$colors; class(p) <- c('team_violin_style', class(p)); p })() |>
      htmlwidgets::onRender("function(el) { if (window.TeamViolinDisplay) return window.TeamViolinDisplay.fit(el); }")
  })
  output$note_violin <- renderUI({
    d <- violin_data(); omitted <- ncol(base()$mat) - nrow(d)
    paste0(nrow(d), " measurements shown; ", omitted,
      " excluded for missing, zero or negative values. Points show prepared sample values, which may include imputation. The smoothed shape extends beyond their range; its tails are estimates, not additional measurements. The inner box shows quartiles and median. Small groups may not form a meaningful violin. Descriptive only: no significance test is applied.")
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
    # Publication layout: framed plot, Arial 10, transform title on top, legend at the top right with the group sizes.
    ttl <- if (identical(input$pca_transform, "linear")) "Linear" else if (identical(input$pca_transform, "log10")) "Log10" else "Log2"
    p <- plotly::plot_ly(source = session$ns("rd_pca"))
    for (g in levels(df$Group)) {
      i <- which(df$Group == g); if (!length(i)) next
      col <- si$colors[[g]]; if (is.null(col) || is.na(col)) col <- "#6b7280"
      p <- plotly::add_trace(p, type = "scatter", mode = "markers", x = df$PC1[i], y = df$PC2[i], name = sprintf("%s (n = %d)", g, length(i)),
        legendgroup = g, customdata = df$Sample[i], marker = list(size = 8, color = col, line = list(color = col, width = 0)),
        text = df$Hover[i], hovertemplate = "%{text}<br>PC1 %{x:.2f}<br>PC2 %{y:.2f}<extra></extra>")
    }
    frame <- list(showline = TRUE, linecolor = "#000000", linewidth = 1, mirror = TRUE, ticks = "outside", ticklen = 4, tickcolor = "#000000",
                  showgrid = FALSE, zeroline = TRUE, zerolinecolor = "#7f7f7f", zerolinewidth = 1)
    p |> rd_layout(meta = team_condition_meta(), title = list(text = ttl, x = 0.5, xanchor = "center", font = list(family = "Arial, Helvetica, sans-serif", size = 10, color = "#000000")),
                xaxis = c(list(title = sprintf("PC1 (%.1f%%)", d$ve[1])), frame),
                yaxis = c(list(title = sprintf("PC2 (%.1f%%)", d$ve[2])), frame),
                legend = list(orientation = "v", x = 1.02, xanchor = "left", y = 1, yanchor = "top"),
                margin = list(l = 60, r = 190, t = 35, b = 55))
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

  # ---- PCA score analysis (Statistics tab) ---------------------------------------
  observe({
    si <- sample_info()
    updateCheckboxGroupInput(session, "pcs_groups", choices = si$levels, selected = { keep <- intersect(si$levels, isolate(input$pcs_groups)); if (length(keep) >= 2L) keep else si$levels }, inline = FALSE)
  })
  pcs_result <- reactive({
    d <- pca_data(); si <- sample_info()
    k <- as.integer(sub("^PC", "", input$pcs_pc %||% "PC1"))
    validate(need(is.finite(k) && k >= 1L && k <= ncol(d$pc$x), "This principal component does not exist for the current data."))
    chosen <- intersect(si$levels, input$pcs_groups %||% si$levels)
    validate(need(length(chosen) >= 2L, "Choose at least two groups."))
    grp <- as.character(si$group); sc <- unname(d$pc$x[, k]); keepg <- grp %in% chosen
    res <- rd_pca_score_stats(sc[keepg], grp[keepg], test = input$pcs_test %||% "rank", correction = input$pcs_corr %||% "BH")
    validate(need(length(res$tested) >= 2L, "At least two chosen groups need two or more samples."))
    list(res = res, k = k, ve = d$ve[k], score = sc[keepg], group = grp[keepg], sample = names(d$pc$x[, k])[keepg],
         levels = chosen, colors = si$colors)
  })
  # The canvas figure: one box per group with its samples, significance brackets, and the group table
  # (colour, median, n) drawn inside the figure on the right.
  output$plot_pcascore <- plotly::renderPlotly({
    r <- pcs_result(); res <- r$res; lev <- intersect(r$levels, res$tested)
    fam <- "Arial, Helvetica, sans-serif"
    colof <- function(g) { col <- r$colors[[g]]; if (is.null(col) || is.na(col)) "#6b7280" else col }
    p <- plotly::plot_ly()
    for (g in lev) {
      i <- r$group == g; col <- colof(g)
      p <- plotly::add_trace(p, type = "box", x = rep(g, sum(i)), y = r$score[i], name = g, text = r$sample[i],
        boxpoints = "all", jitter = 0.45, pointpos = 0, fillcolor = grDevices::adjustcolor(col, 0.65),
        line = list(color = "#000000", width = 1.5), marker = list(color = col, size = 6, line = list(color = "#3a3a3a", width = 0.8)),
        hoverinfo = "y+text", legendgroup = g, showlegend = FALSE)
    }
    yr <- range(r$score[r$group %in% lev], na.rm = TRUE); span <- max(diff(yr), 1e-9); pr <- res$pairs
    shapes <- list(); ann <- list(); top <- yr[2]
    for (i in seq_len(nrow(pr))) {
      x1 <- match(pr$A[i], lev) - 1; x2 <- match(pr$B[i], lev) - 1
      y0 <- yr[2] + span * (0.06 + 0.17 * (i - 1)); y1 <- y0 + span * 0.03; top <- max(top, y1 + span * 0.09)
      shapes[[length(shapes) + 1L]] <- list(type = "path", path = sprintf("M %s,%s L %s,%s L %s,%s L %s,%s", x1, y0, x1, y1, x2, y1, x2, y0), line = list(color = "#000000", width = 1.5))
      big <- !identical(pr$stars[i], "ns")
      ann[[length(ann) + 1L]] <- list(x = (x1 + x2) / 2, y = y1, text = pr$stars[i], showarrow = FALSE, yanchor = "bottom", xanchor = "center", font = list(family = fam, size = if (big) 16 else 12, color = "#000000"))
    }
    ttl <- if (!is.null(res$omnibus)) sprintf("%s p = %s", res$omnibus$name, rd_pca_score_fmt(res$omnibus$p)) else NULL
    cell <- function(x, y, text, xanchor, bold = FALSE) list(x = x, y = y, xref = "paper", yref = "paper", text = if (bold) paste0("<b>", text, "</b>") else text,
      showarrow = FALSE, xanchor = xanchor, yanchor = "middle", align = xanchor, font = list(family = fam, size = 10, color = "#000000"))
    # Group table below the plot (as in the publication figure): colour dot + group (n), median, n.
    tab_top <- 0.215; step <- 0.052; y_head <- tab_top
    ann[[length(ann) + 1L]] <- cell(0.27, y_head, "Group", "center", TRUE)
    ann[[length(ann) + 1L]] <- cell(0.60, y_head, sprintf("Median PC%d", r$k), "center", TRUE)
    ann[[length(ann) + 1L]] <- cell(0.86, y_head, "n", "center", TRUE)
    for (j in seq_along(lev)) {
      g <- lev[j]; y <- y_head - step * j; nm <- if (nchar(g) > 26L) paste0(substr(g, 1L, 25L), "…") else g
      ann[[length(ann) + 1L]] <- cell(0.075, y, sprintf("%s (n = %d)", htmltools::htmlEscape(nm), res$n[[g]]), "left")
      ann[[length(ann) + 1L]] <- cell(0.60, y, sprintf("%+.2f", res$median[[g]]), "center")
      ann[[length(ann) + 1L]] <- cell(0.86, y, as.character(res$n[[g]]), "center")
      p <- plotly::add_trace(p, type = "scatter", mode = "markers", x = 0.045, y = y, xaxis = "x2", yaxis = "y2", name = g, legendgroup = g, showlegend = FALSE,
        meta = list(teamLegendProxy = TRUE), hoverinfo = "skip", marker = list(symbol = "circle", size = 8, color = colof(g), line = list(color = "#3a3a3a", width = 0.8)))
    }
    frame <- list(showline = TRUE, linecolor = "#000000", linewidth = 1, mirror = TRUE, showgrid = FALSE, zeroline = FALSE, tickcolor = "#000000", ticklen = 4)
    p |> rd_layout(meta = team_condition_meta(), shapes = shapes, annotations = ann,
      xaxis = c(list(title = "", type = "category", domain = c(0, 1), categoryorder = "array", categoryarray = lev, showticklabels = FALSE, ticks = ""), frame[c("showline", "linecolor", "linewidth", "mirror", "showgrid", "zeroline")]),
      yaxis = c(list(title = sprintf("PC%d score (%.1f%% of variance)", r$k, r$ve), domain = c(0.28, 1), ticks = "outside",
                     range = c(yr[1] - span * 0.05, top + span * 0.03)), frame),
      xaxis2 = list(domain = c(0, 1), range = c(0, 1), visible = FALSE, fixedrange = TRUE, anchor = "y2"),
      yaxis2 = list(domain = c(0, 0.28), range = c(0, 0.28), visible = FALSE, fixedrange = TRUE, anchor = "x2"),
      showlegend = FALSE, margin = list(l = 65, r = 15, t = 15, b = 10))
  })
  output$pcs_report <- renderUI({
    r <- pcs_result(); res <- r$res; pr <- res$pairs
    rank <- identical(res$test, "rank")
    corr <- c(BH = "Benjamini-Hochberg", holm = "Holm", bonferroni = "Bonferroni", none = "no")[[res$correction]]
    verdict <- function(p) if (is.na(p)) "not computed" else if (p < 0.05) "significant" else if (p < 0.10) "borderline" else "not significant"
    lines <- c("Statistical tests performed:",
      if (!is.null(res$omnibus)) sprintf("1. %s across all %d groups at once: p = %s (%s).", res$omnibus$name, length(res$tested), rd_pca_score_fmt(res$omnibus$p), if (res$omnibus$p < 0.05) "the groups differ" else "no evidence that the groups differ"),
      sprintf("%s. %s on each pair of groups (%d comparison%s).", if (!is.null(res$omnibus)) "2" else "1", if (rank) "Mann-Whitney U (normal approximation)" else "Welch t-test", nrow(pr), if (nrow(pr) == 1L) "" else "s"),
      if (identical(res$correction, "none")) "No multiple-testing correction was applied; p-values are unadjusted." else sprintf("%s correction across the %d pairwise comparison%s.", corr, nrow(pr), if (nrow(pr) == 1L) "" else "s"))
    cmp <- sprintf("%s vs %s: %sp = %s (%s) %s", pr$A, pr$B, if (identical(res$correction, "none")) "" else "adjusted ", rd_pca_score_fmt(pr$p_adj), vapply(pr$p_adj, verdict, ""), pr$stars)
    note <- if (length(res$skipped)) sprintf("Not tested (fewer than 2 samples): %s.", paste(res$skipped, collapse = ", "))
    tagList(tags$div(class = "rd-pca-score-report", lapply(lines, tags$p)), tags$div(class = "rd-pca-score-report", lapply(cmp, tags$p)),
      tags$p(class = "rd-card-note", "Stars: * adjusted p < 0.05, ** < 0.01, *** < 0.001, ns = not significant. Scores are descriptive coordinates of an unsupervised PCA; p-values are exploratory."),
      if (!is.null(note)) tags$p(class = "rd-card-note", note))
  })

  # Selections are persisted as input strings, not encoded in plotted values.
  selection <- function(raw, choices) {
    if (is.null(raw) || identical(raw, "__ALL__")) return(choices)
    if (!is.character(raw) || length(raw)!=1L || is.na(raw) || nchar(raw)>2000000L) return(character())
    parsed <- tryCatch(jsonlite::fromJSON(raw,simplifyVector=FALSE),error=function(e) NULL)
    if (!is.list(parsed) || !is.null(names(parsed)) || any(!vapply(parsed,function(x)is.character(x)&&length(x)==1L&&!is.na(x),logical(1)))) return(character())
    intersect(choices,unlist(parsed,use.names=FALSE))
  }
  selection_bar <- function(id, choices, selected, label, colors=NULL, searchable=FALSE, defaults=NULL, classes=NULL) {
    tags$div(class="rd-selection-bar", `data-selection-input`=session$ns(id),
      `data-choices`=jsonlite::toJSON(unname(choices),auto_unbox=FALSE), `data-selection-kind`=if(id=="comp_class_selection") "composition" else "heatmap", `aria-label`=label,
      `data-default-choices`=if(!is.null(defaults)) jsonlite::toJSON(unname(defaults),auto_unbox=FALSE),
      `data-all-token`=if(!is.null(defaults)) "__EVERY__",
      `data-class-members`=if(!is.null(classes)) jsonlite::toJSON(lapply(split(choices,classes),unname),auto_unbox=FALSE),
      if(!is.null(classes)) tags$div(class="tds-class-catalog",tags$strong(class="tds-label","Lipid classes"),
        lapply(sort(unique(classes)),function(cl) tags$button(type="button",`data-class`=cl,cl,tags$small(class="tds-class-count")))),
      if (searchable) tags$details(class="tds-collapsible", tags$summary(label), tags$div(class="tds-picker-body",
      if (searchable) tags$input(type="search", class="tds-search", placeholder="Search all available lipids…", `aria-label`="Search lipids"),
      if(!is.null(defaults)) tags$button(type="button",`data-action`="default","Most variable"),
      tags$button(type="button", `data-action`="all", "All"),
      tags$button(type="button", `data-action`="none", "None"),
      lapply(choices,function(choice) tags$button(type="button",`data-value`=choice,
        `aria-pressed`=if(choice %in% selected) "true" else "false",
        if(!is.null(colors)) tags$span(class="tds-swatch",style=paste0("background:",colors[[choice]]),`aria-hidden`="true"),choice)))) else tagList(
      tags$strong(class="tds-label",label), tags$button(type="button", `data-action`="all", "All"), tags$button(type="button", `data-action`="none", "None"),
      lapply(choices,function(choice) tags$button(type="button",`data-value`=choice, `aria-pressed`=if(choice %in% selected) "true" else "false", if(!is.null(colors)) tags$span(class="tds-swatch",style=paste0("background:",colors[[choice]]),`aria-hidden`="true"), choice))))
  }
  comp_full <- reactive({
    b <- base(); si <- sample_info(); pos <- b$mat; pos[!is.finite(pos) | pos<=0] <- 0
    by_class <- rowsum(pos,b$class); lev <- rownames(by_class)
    out <- expand.grid(Class=lev,Sample=colnames(by_class),stringsAsFactors=FALSE)
    out$Signal_sum <- as.vector(by_class); out$Group <- si$group[match(out$Sample,b$groups$Sample)]
    out$Class <- factor(out$Class,levels=lev);out$Sample <- factor(out$Sample,levels=b$groups$Sample[si$order])
    out[order(out$Sample,out$Class),]
  })
  comp_data <- reactive({
    out<-comp_full(); chosen<-selection(input$comp_class_selection,levels(out$Class))
    out$Selected<-as.character(out$Class)%in%chosen
    selected_totals<-tapply(ifelse(out$Selected,out$Signal_sum,0),as.character(out$Sample),sum)
    all_totals<-tapply(out$Signal_sum,as.character(out$Sample),sum)
    out$Denominator_selected<-unname(selected_totals[as.character(out$Sample)])
    denominator_all<-unname(all_totals[as.character(out$Sample)])
    out$Share_pct<-ifelse(out$Selected & out$Denominator_selected>0,100*out$Signal_sum/out$Denominator_selected,NA_real_)
    out$Share_all_pct<-ifelse(denominator_all>0,100*out$Signal_sum/denominator_all,NA_real_)
    out
  })
  output$select_comp <- renderUI({
    df<-comp_full();lev<-levels(df$Class)
    classes<-selection_bar('comp_class_selection',lev,selection(input$comp_class_selection,lev),'Visible lipid classes',rd_class_colors(lev,rd_value(shared_data$class_color_map)))
    if(!isTRUE(shared_data$team_compact_distribution)) return(classes)
    groups<-unique(as.character(df$Group))
    tagList(classes,
      tags$div(style='display:none',textInput(session$ns('comp_group_selection'),NULL,value=isolate(input$comp_group_selection) %||% '__ALL__')),
      selection_bar('comp_group_selection',groups,isolate(selection(input$comp_group_selection,groups)),'Conditions'),
      selectInput(session$ns('comp_axis_mode'),'X axis',c('By group'='group','By sample'='sample'),selected=isolate(input$comp_axis_mode) %||% 'group',selectize=FALSE))
  })
  comp_team_data <- reactive({
    d<-comp_data(); visible<-selection(input$comp_group_selection,unique(as.character(d$Group)))
    d$Group_visible<-as.character(d$Group)%in%visible
    d$Estimator<-'Equal-weight mean of per-sample selected-class signal percentages'
    d$Axis_mode<-if(identical(input$comp_axis_mode,'sample')) 'sample' else 'group'
    # Group summaries include all classes and flags for an auditable CSV.
    keys<-unique(d[c('Group','Class')]);keys$Mean_share_pct<-NA_real_;keys$SD_share_pct<-NA_real_;keys$N_samples<-0L
    for(i in seq_len(nrow(keys))) {
      values<-d$Share_pct[as.character(d$Group)==as.character(keys$Group[i]) & as.character(d$Class)==as.character(keys$Class[i])]
      values<-values[is.finite(values)];keys$N_samples[i]<-length(values)
      if(length(values))keys$Mean_share_pct[i]<-mean(values)
      if(length(values)>1L)keys$SD_share_pct[i]<-stats::sd(values)
    }
    index<-match(paste(d$Group,d$Class,sep='\r'),paste(keys$Group,keys$Class,sep='\r'))
    d$Group_mean_share_pct<-keys$Mean_share_pct[index];d$Group_SD_share_pct<-keys$SD_share_pct[index];d$Group_N_samples<-keys$N_samples[index]
    list(samples=d,groups=keys)
  })
  output$plot_comp <- plotly::renderPlotly({
    if(isTRUE(shared_data$team_compact_distribution)) {
      source<-comp_team_data();d<-source$samples
      group_mode<-!identical(input$comp_axis_mode,'sample')
      chosen<-selection(input$comp_class_selection,levels(d$Class));visible<-selection(input$comp_group_selection,unique(as.character(d$Group)))
      validate(need(length(chosen)>0,'Select at least one lipid class.'),need(length(visible)>0,'Select at least one condition.'))
      lev<-levels(d$Class);cols<-rd_class_colors(lev,rd_value(shared_data$class_color_map))
      p<-plotly::plot_ly(source=session$ns('rd_comp'))
      # Stack order: the largest class at the bottom, growing smaller toward the top (less to more, top to bottom).
      class_means<-if(group_mode) tapply(source$groups$Mean_share_pct[as.character(source$groups$Group)%in%visible],as.character(source$groups$Class)[as.character(source$groups$Group)%in%visible],function(v) mean(v,na.rm=TRUE)) else tapply(d$Share_pct[d$Group_visible],as.character(d$Class)[d$Group_visible],function(v) mean(v,na.rm=TRUE))
      class_means<-unname(class_means[lev]);class_means[!is.finite(class_means)]<-0
      plot_order<-lev[order(-class_means,lev)]
      for(cl in plot_order) {
        if(group_mode) {
          df<-source$groups[as.character(source$groups$Class)==cl & as.character(source$groups$Group)%in%visible,,drop=FALSE]
          x<-as.character(df$Group);y<-df$Mean_share_pct
          hover<-paste0('Group: ',htmltools::htmlEscape(x),'<br>Class: ',htmltools::htmlEscape(cl),'<br>Mean share: ',round(y,2),'%<br>SD: ',ifelse(is.finite(df$SD_share_pct),paste0(round(df$SD_share_pct,2),' percentage points'),'not defined (n < 2)'),'<br>n = ',df$N_samples)
          counts<-vapply(x,function(g) length(unique(as.character(d$Sample[as.character(d$Group)==g & d$Denominator_selected>0]))),integer(1))
        } else {
          df<-d[as.character(d$Class)==cl & d$Group_visible,,drop=FALSE]
          x<-as.character(df$Sample);y<-df$Share_pct
          hover<-paste0(unname(sample_hover()[x]),'<br>Class: ',htmltools::htmlEscape(cl),'<br>Share: ',round(y,2),'%')
        }
        p<-plotly::add_trace(p,x=x,y=y,type='bar',name=cl,legendgroup=cl,
          visible=cl%in%chosen,meta=list(teamSourceKey=paste0('team-composition:',cl)),
          marker=list(color=unname(cols[cl]),line=list(color='#fcfcfb',width=1)),text=hover,textposition='none',hovertemplate='%{text}<extra></extra>')
      }
      axis<-if(group_mode) list(title='Condition / cell type',type='category',tickmode='array',tickvals=x,ticktext=paste0(x,' · n = ',counts)) else sample_axis(x,'comp')
      return(htmlwidgets::onRender(p |> rd_layout(barmode='stack',bargap=.15,
        meta=list(teamConditions=unname(sort(sample_info()$levels,method='radix')),teamComposition=list(version=1L,axisMode=if(group_mode)'group' else 'sample',groupInputId=session$ns('comp_group_selection'),groupIds=unique(as.character(d$Group)),estimator='Equal-weight mean of per-sample selected-class signal percentages'),
          teamClassSelection=list(inputId=session$ns('comp_class_selection'),classes=unname(lev),selected=unname(chosen),serverEstimator=TRUE)),
        xaxis=axis,yaxis=list(title=if(group_mode)'Mean share of selected signal (%)' else 'Share of selected signal (%)',range=c(0,100)),
        showlegend=FALSE,margin=list(l=60,r=125,t=10,b=100)),rd_comp_label_js))
    }
    df<-comp_full();lev<-levels(df$Class);cols<-rd_class_colors(lev,rd_value(shared_data$class_color_map))
    df$Hover<-paste0(unname(sample_hover()[as.character(df$Sample)]),"<br>Class: ",as.character(htmltools::htmlEscape(as.character(df$Class))))
    meta<-canvas_sample_labels();meta$teamClassSelection<-list(inputId=session$ns('comp_class_selection'),classes=unname(lev))
    plotly::plot_ly(df,x=~Sample,y=~Signal_sum,color=~Class,colors=cols[lev],legendgroup=~Class,type='bar',source=session$ns('rd_comp'),text=~Hover,textposition='none',
      marker=list(line=list(color='#fcfcfb',width=1)),hovertemplate='%{text}<br>%{y:.1f}% of selected signal<extra></extra>') |>
      rd_layout(barmode='stack',barnorm='percent',bargap=0.15,meta=meta,xaxis=sample_axis(levels(df$Sample),'comp'),
        yaxis=list(title='Share of selected signal (%)',range=c(0,100),gridcolor='#ebeae6'),showlegend=FALSE,legend=list(itemclick=FALSE,itemdoubleclick=FALSE),margin=list(l=60,r=15,t=10,b=100))
  })
  output$note_comp <- renderUI({
    d<-comp_data();chosen<-unique(as.character(d$Class[d$Selected]));zero<-length(unique(as.character(d$Sample[d$Denominator_selected<=0])))
    paste(if(isTRUE(shared_data$team_compact_distribution) && !identical(input$comp_axis_mode,"sample")) "Group bars are equal-weight means of per-sample selected-class percentages; hover reports SD and the number of samples with positive selected signal." else "Visible classes are renormalized to 100% per sample. Signal shares, not molar proportions.",
      if(length(chosen)==1L) "With one class selected, every sample with signal is 100%." else "",
      if(zero) sprintf("%d samples have no positive signal in this selection; their shares are undefined.",zero) else "",
      "CSV includes all classes with a Selected flag, raw sums and both selected/all-class shares.")
  })

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
      trace <- list(x = rep(sample, length(values)), y = values,
        type = "box", name = group, legendgroup = group,
        showlegend = !group %in% shown_groups,
        marker = list(color = color), line = list(color = color, width = 1.5),
        boxpoints = FALSE,
        hovertemplate = paste0(hovers[[sample]],
          "<br>log10 abundance: %{y:.3f}<extra></extra>"))
      # Plotly box traces need an explicit fill; marker color alone does not
      # control the box and can disagree with the group legend.
      if (isTRUE(shared_data$team_compact_distribution)) {
        trace$fillcolor <- color
        trace$meta <- list(teamSourceKey=paste0('team-abundance-distribution:',sample))
      }
      p <- do.call(plotly::add_trace, c(list(p), trace))
      shown_groups <- union(shown_groups, group)
    }
    p <- p |>
      rd_layout(meta = canvas_sample_labels(), xaxis = sample_axis(levels(df$Sample),"dist"),
                yaxis = list(title = "log10(abundance)", gridcolor = "#ebeae6"),
                legend = list(orientation = "h", y = -0.25),margin=list(l=60,r=15,t=10,b=100))
    if (isTRUE(shared_data$team_compact_distribution)) class(p) <- c('team_compact_distribution', class(p))
    p
  })
  output$note_dist <- renderUI({
    # Read the reactives first: inside S4 generics (BiocGenerics' format/nrow) a validate()
    # stop is re-raised as a plain error and logged, instead of staying a silent validation.
    d <- dist_data(); b <- base()
    sprintf("%s positive values shown; %s missing or nonpositive values omitted.",
            format(nrow(d), big.mark = ","), format(sum(is.na(b$log)), big.mark = ","))
  })

  # Full eligible catalog. The historical __ALL__ token keeps its original
  # top-N meaning; __EVERY__ explicitly requests every eligible individual row.
  # Class buttons write species IDs, never aggregate abundances or annotations.
  heat_base <- reactive({
    cl<-complete_log(); si<-sample_info()
    validate(need(nrow(cl$mat)>=2,'The heatmap needs at least 2 lipids with positive, non-constant values in every sample.'))
    v<-apply(cl$mat,1,stats::var)
    ranked<-names(sort(v,decreasing=TRUE))
    top<-head(ranked,min(max(2,rd_int(input$top_n,30)),length(v)))
    z<-t(scale(t(cl$mat)))
    # Keep the former top-N clustering, with remaining catalog rows in variance
    # order. Do not run quadratic clustering over the entire lipid catalog.
    if(length(top)>2)top<-top[stats::hclust(stats::dist(z[top,,drop=FALSE]))$order]
    row_order<-c(top,setdiff(ranked,top)); z<-z[row_order,,drop=FALSE]
    m<-cl$mat[row_order,,drop=FALSE]; groups<-si$levels
    counts<-vapply(groups,function(g)sum(si$group==g),integer(1))
    group_z<-vapply(groups,function(g)rowMeans(z[,si$group==g,drop=FALSE]),numeric(nrow(z)))
    group_log<-vapply(groups,function(g)rowMeans(m[,si$group==g,drop=FALSE]),numeric(nrow(z)))
    dim(group_z)<-c(nrow(z),length(groups));dim(group_log)<-dim(group_z)
    dimnames(group_z)<-list(rownames(z),groups);dimnames(group_log)<-dimnames(group_z)
    # Fixed across top-N, custom species, classes and visible sample groups.
    lim<-max(abs(group_z),1,na.rm=TRUE)
    lipids<-rownames(z)
    # Preserve exact name prefixes (e.g. PC, LPC and PC O- stay distinct).
    classes<-ifelse(grepl("(",lipids,fixed=TRUE),toupper(trimws(sub("\\(.*","",lipids))),rd_class(lipids))
    out<-expand.grid(Lipid_Name=lipids,Group=groups,stringsAsFactors=FALSE)
    out$Class<-rep(classes,length(groups));out$Group_n<-rep(counts,each=nrow(z))
    out$mean_z<-as.vector(group_z);out$mean_log10<-as.vector(group_log)
    out$log10_variance<-unname(v[out$Lipid_Name]);out$Variance_rank<-match(out$Lipid_Name,ranked)
    list(full_z=group_z,full_log=group_log,df=out,n=length(v),lim=lim,groups=groups,
         lipids=lipids,default_lipids=top,classes=classes,
         n_incomplete=cl$n_incomplete,n_constant=cl$n_constant)
  })
  heat_selected <- function(raw,h) {
    if(is.null(raw)||identical(raw,"__ALL__")) return(h$default_lipids)
    if(identical(raw,"__EVERY__")) return(h$lipids)
    selection(raw,h$lipids)
  }
  # Significant only: availability follows the inference guard alone; the
  # Differential analysis result is read only when the view asks for it.
  heat_significance_guard <- rd_heat_significance_guard(shared_data)
  heat_significance_allowed <- reactive(heat_significance_guard(tryCatch(session$rootScope()$input$guide_design_type, error = function(e) NULL)))
  heat_significance <- reactive({
    g <- heat_significance_allowed()
    if (!isTRUE(g$allowed)) return(list(allowed = FALSE, reason = g$reason, lipids = character(), criterion = NULL))
    root <- tryCatch(session$rootScope()$input, error = function(e) NULL)
    interaction <- if (!is.null(root)) lapply(c(comp_t2 = "int_comp_t2", comp_t1 = "int_comp_t1", ref_t2 = "int_ref_t2", ref_t1 = "int_ref_t1"),
      function(k) root[[paste0("data_hub-", k)]])
    r <- rd_heat_significance_result(shared_data, interaction)
    if (!is.null(r$blocked)) return(list(allowed = FALSE, reason = r$blocked, lipids = character(), criterion = NULL))
    if (is.null(r)) return(list(allowed = FALSE, lipids = character(), criterion = NULL,
      reason = "No Differential analysis result is available for the current comparison. Set the comparison in Differential analysis, then try again."))
    c(list(allowed = TRUE, reason = NULL), r)
  })
  heat_data <- reactive({
    h<-heat_base(); visible<-selection(input$heat_group_selection,h$groups)
    significance<-if(identical(input$heat_significance,"significant")) heat_significance() else NULL
    # Significant only shows every heatmap lipid that passes the criterion, in
    # the heatmap's own row order; the lipid picker applies to All lipids.
    lipids<-if(is.null(significance)) heat_selected(input$heat_lipid_selection,h) else h$lipids[h$lipids %in% significance$lipids]
    h$df$Group_visible<-h$df$Group %in% visible
    h$df$Lipid_visible<-h$df$Lipid_Name %in% lipids
    h$df$Visible<-h$df$Group_visible & h$df$Lipid_visible
    h$z<-h$full_z[lipids,visible,drop=FALSE]
    h$visible<-visible;h$lipids_visible<-lipids
    if(!is.null(significance)){
      h$df$DE_significant<-if(isTRUE(significance$allowed)) h$df$Lipid_Name %in% significance$lipids else NA
      h$df$Significance_filter<-if(isTRUE(significance$allowed)) paste("Significant only:",significance$criterion) else paste("Significant only unavailable:",significance$reason)
      h$significance<-significance
    }
    h
  })
  # Under the Show control: why Significant only is unavailable, or what it
  # currently shows (the card itself only says it could not update when empty).
  output$heat_significance_status<-renderUI({
    g<-heat_significance_allowed()
    text<-if(!isTRUE(g$allowed)) paste(c("Significant only is unavailable.",g$reason,
      if(isTRUE(g$participant)&&exists("team_pseudoreplication_recommendation")) team_pseudoreplication_recommendation),collapse=" ") else if(identical(input$heat_significance,"significant")){
      h<-tryCatch(heat_data(),error=function(e)NULL);s<-h$significance;k<-length(h$lipids_visible)
      if(is.null(s)) NULL
      else if(!isTRUE(s$allowed)) paste("Significant only is unavailable.",s$reason)
      else if(!k) sprintf("No lipid in this heatmap passes the Differential analysis criterion (%s). Choose All lipids to show the heatmap.",s$criterion)
      else sprintf("Showing %d significant lipid%s: %s.",k,if(k==1L)"" else "s",s$criterion)
    }
    tags$p(class="rd-heat-significance-note",id=session$ns("heat_significance_reason"),`data-rd-significance-for`=session$ns("heat_significance"),
      `data-allowed`=if(isTRUE(g$allowed)) "true" else "false",role="status",text)
  })
  output$select_heat<-renderUI({
    h<-heat_base(); groups<-isolate(selection(input$heat_group_selection,h$groups))
    lipids<-isolate(heat_selected(input$heat_lipid_selection,h))
    controls<-tagList(selection_bar('heat_group_selection',h$groups,groups,'Visible sample groups'),
      selection_bar('heat_lipid_selection',h$lipids,lipids,'Visible lipids',searchable=TRUE,
        defaults=h$default_lipids,classes=h$classes))
    if(!isTRUE(shared_data$team_compact_distribution))return(controls)
    tags$details(class='tds-heat-controls',id=session$ns('heat_selection_controls'),open=if(length(lipids)<=60L)NA else NULL,
      tags$summary(textOutput(session$ns('heat_selection_summary'),inline=TRUE)),controls)
  })
  output$heat_selection_summary<-renderText({h<-heat_data();sprintf('Groups & lipids · %d selected',length(h$lipids_visible))})
  output$plot_heat<-plotly::renderPlotly({
    h<-heat_data();z<-h$z;s<-h$significance
    if(!is.null(s)) validate(need(isTRUE(s$allowed),paste("Significant only is unavailable.",s$reason,"Choose All lipids to show the heatmap.")),
      need(nrow(z)>0,sprintf("No lipid in this heatmap passes the Differential analysis criterion (%s). Choose All lipids to show the heatmap.",s$criterion)))
    validate(need(nrow(z)>0,'Select at least one lipid to display the heatmap.'), need(ncol(z)>0,'Select at least one group to display the heatmap.'))
    team_labels <- isTRUE(shared_data$team_compact_distribution)
    group_n <- h$df$Group_n[match(colnames(z),h$df$Group)]
    heat_ticks <- if (team_labels) vapply(seq_along(colnames(z)), function(i) rd_team_heat_tick(colnames(z)[i],group_n[i]), character(1)) else paste0(colnames(z),' (n=',group_n,')')
    row_ticks <- rd_ticks(rownames(z), if(team_labels && nrow(z)<=60L) nrow(z) else 24L)
    # Team presentation is rebuilt from the current selection on every render.
    # Matrix values, full-cohort limits and source IDs remain the shared contract.
    if (team_labels) {
      view <- rd_team_heatmap_view(z, group_n)
      return(plotly::plot_ly(x=view$x,y=view$y,z=view$z,type='heatmap',
        zmin=-h$lim,zmax=h$lim,source=session$ns('rd_heat'),width=view$width,height=view$height,
        meta=list(teamSourceKey='team-abundance-heatmap'),
        colorscale=list(list(0,'#0047AB'),list(0.5,'#FFFFFF'),list(1,'#FF0000')),
        autocolorscale=FALSE,xgap=0,ygap=0,
        colorbar=view$colorbar,text=view$text,
        hovertemplate='%{text}<br>Mean z = %{z:.2f}<extra></extra>') |>
        rd_layout(xaxis=view$xaxis,yaxis=view$yaxis,margin=view$margin,
          meta=list(teamConditions=unname(sort(sample_info()$levels,method='radix')),teamHeatmap=list(version=1L,geometry=if(view$squares)'square-horizontal' else 'rectangular',
            lipidIds=rownames(z),groupIds=colnames(z),naturalWidth=view$width,naturalHeight=view$height,
            rowCount=nrow(z),columnCount=ncol(z),valueDefinition='Mean full-cohort lipid z-score'))))
    }
    plotly::plot_ly(x=colnames(z),y=rownames(z),z=z,type='heatmap',zmin=-h$lim,zmax=h$lim,source=session$ns('rd_heat'),
      colorscale=list(c(0,'#337f87'),c(0.5,'#f0efec'),c(1,'#c77958')),xgap=1,ygap=1,colorbar=list(title='Mean z-score',thickness=12),
      text=matrix(rep(paste0('n = ',h$df$Group_n[match(colnames(z),h$df$Group)]),each=nrow(z)),nrow=nrow(z)),
      hovertemplate='Group: %{x}<br>%{text}<br>Lipid: %{y}<br>Mean z = %{z:.2f}<extra></extra>') |>
      rd_layout(xaxis=list(title=if(team_labels) list(text='Sample group',standoff=20) else 'Sample group',type='category',tickangle=0,tickmode='array',tickvals=colnames(z),ticktext=heat_ticks,automargin=TRUE),
        yaxis=list(title='',type='category',tickmode='array',tickvals=row_ticks,ticktext=vapply(row_ticks,function(x)if(nchar(x)>19)paste0(substr(x,1,18),'…')else x,character(1)),tickfont=list(size=10),automargin=TRUE),margin=list(l=125,r=20,t=10,b=if(team_labels)145 else 70))
  })
  output$note_heat<-renderUI({
    h<-heat_data();s<-h$significance
    if(!is.null(s)){
      if(!isTRUE(s$allowed)||!length(h$lipids_visible)) return(NULL)
      missing<-length(setdiff(s$lipids,h$lipids))
      return(paste(sprintf('Significant only: %d lipid%s pass%s the Differential analysis criterion (%s).',length(h$lipids_visible),if(length(h$lipids_visible)==1L)'' else 's',if(length(h$lipids_visible)==1L)'es' else '',s$criterion),
        if(missing) sprintf('%d further significant lipid%s cannot be drawn here (missing/nonpositive values or zero variance).',missing,if(missing==1L)'' else 's') else '',
        'The lipid picker applies to All lipids; group selection still applies. Full-cohort z-scores and color scale stay fixed; no test is run here.',
        if(isTRUE(shared_data$team_compact_distribution) && (nrow(h$z)>15L || ncol(h$z)>15L))'The taller heatmap scrolls within its card. Labels may be thinned; hover or download CSV for every lipid name. Cell values are unchanged.' else if(length(h$lipids_visible)>60)'Some row labels are hidden for readability. Hover over each row or download the CSV to read every lipid name.' else ''))
    }
    paste(sprintf('Showing %d of %d available lipids. Classes select individual lipids; rows are never combined. Full-cohort z-scores and color scale stay fixed.',length(h$lipids_visible),h$n),
      sprintf('%d excluded for missing/nonpositive values; %d for zero variance.',h$n_incomplete,h$n_constant),
      if(isTRUE(shared_data$team_compact_distribution) && (nrow(h$z)>15L || ncol(h$z)>15L))'The taller heatmap scrolls within its card. Labels may be thinned; hover or download CSV for every lipid name. Cell values are unchanged.' else if(length(h$lipids_visible)>60)'Some row labels are hidden for readability. Hover over each row or download the CSV to read every lipid name.' else '')
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
  output$dl_comp <- dl("class_signal_composition", function() if(isTRUE(shared_data$team_compact_distribution)) comp_team_data()$samples else comp_data())
  output$dl_dist <- dl("log10_distribution", dist_data)
  output$dl_heat <- dl("top_variable_heatmap", function() heat_data()$df)

  invisible(list(pca=pca_data,composition=comp_data,composition_team=comp_team_data,distribution=dist_data,heatmap=heat_data,
                violin_data=violin_data,heatmap_significance=heat_significance,heatmap_significance_allowed=heat_significance_allowed))
}

results_dashboard_server <- function(input,output,session,shared_data) {
  shiny::moduleServer("results_dashboard",function(input,output,session)results_dashboard_module_server(input,output,session,shared_data))
}
