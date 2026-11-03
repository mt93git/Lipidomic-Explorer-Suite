suppressPackageStartupMessages(library(shiny))
`%||%`<-function(a,b)if(is.null(a))b else a
lipidomic_plotly_event<-function(...)NULL
source('R/utils_colors.R');source('R/sample_metadata_import.R');source('R/results_dashboard.R')

# palette_extend: distinct, palette first, deterministic, for every preset and N = 1..40.
for (name in names(COLOR_PALETTE_PRESETS)) {
  pal <- toupper(COLOR_PALETTE_PRESETS[[name]])
  for (n in 1:40) {
    x <- palette_extend(pal, n)
    k <- min(n, length(pal))
    stopifnot(length(x) == n, !anyDuplicated(x), all(grepl('^#[0-9A-F]{6}$', x)),
              identical(x[seq_len(k)], pal[seq_len(k)]), identical(x, palette_extend(pal, n)))
    if (n > length(pal)) {
      lab <- palette_lab(x); d <- as.matrix(stats::dist(lab)); diag(d) <- Inf
      stopifnot(min(d[(length(pal) + 1):n, ]) >= 9)  # generated colors are perceptually apart
    }
  }
}
stopifnot(identical(palette_extend(character(), 5), character()), identical(palette_extend('#123456', 0), character()))
# Edge inputs: variant pool exhaustion, many categories, NA/alpha/named colors, empty.
stopifnot(!anyDuplicated(palette_extend('#155E75', 41)), !anyDuplicated(palette_extend('#000000', 2000)),
          !anyDuplicated(palette_preset_colors('Ocean & Coral', list(Group1 = sprintf('G%03d', 1:328)))),
          identical(unname(palette_distinct(c(NA, '#12345680', 'red'))), c('#B0B0B0', '#123456', '#FF0000')),
          length(palette_distinct(character())) == 0L)

# Presets applied to many categories no longer cycle (previously rep(length.out=)).
labels <- sprintf('K%02d', 1:40)
preset <- palette_preset_colors('Ocean & Coral', list('Lipid Class' = labels, Group1 = c('A', 'B')))
stopifnot(!anyDuplicated(preset[startsWith(names(preset), 'Lipid Class::')]),
          identical(unname(preset[paste0('Lipid Class::', labels[1:8])]), toupper(COLOR_PALETTE_PRESETS[['Ocean & Coral']])))

# Default maps never share a colour between classes, and the copy in R/global.R
# (overwritten when R/utils_colors.R is sourced) stays identical.
stopifnot(!anyDuplicated(toupper(CLASS_MAP_COLORS)), !anyDuplicated(toupper(HYPERCLASS_MAP_COLORS)),
          # Default maps are built from DEFAULT_PALETTE: its first 7 colors, then distinct variants; Misc is its gray.
          identical(unname(CLASS_MAP_COLORS[1:7]), DEFAULT_PALETTE[1:7]), CLASS_MAP_COLORS[['Misc']] == DEFAULT_PALETTE[8],
          identical(unname(HYPERCLASS_MAP_COLORS[1:5]), DEFAULT_PALETTE[1:5]), HYPERCLASS_MAP_COLORS[['Misc']] == DEFAULT_PALETTE[8],
          CLASS_MAP_COLORS[['SP_SM']] == '#007279', CLASS_MAP_COLORS[['SP_Cer']] == '#FFD8FF')
# Groups: default palette in sorted order, distinct past 8, and never a color of another group.
g <- initialize_color_map(sprintf('G%02d', 12:1))
stopifnot(identical(names(g), sprintf('G%02d', 1:12)), identical(unname(g[1:8]), DEFAULT_PALETTE), !anyDuplicated(g))
fb <- default_palette_fallback(c(A = DEFAULT_PALETTE[1], B = DEFAULT_PALETTE[2]), c('x', 'y'))
stopifnot(length(fb) == 2L, !any(toupper(fb) %in% toupper(DEFAULT_PALETTE[1:2])), !anyDuplicated(fb))
global_defs <- Filter(function(e) is.call(e) && identical(e[[1]], as.name('<-')) && identical(e[[2]], as.name('CLASS_MAP_COLORS')), as.list(parse('R/global.R', keep.source = FALSE)))
stopifnot(length(global_defs) == 1L, identical(eval(global_defs[[1]][[3]], baseenv()), CLASS_MAP_COLORS))

# palette_distinct keeps first occurrences and names, replaces repeats (the default class map has none left).
fixed <- palette_distinct(CLASS_MAP_COLORS)
stopifnot(!anyDuplicated(fixed), identical(names(fixed), names(CLASS_MAP_COLORS)),
          identical(unname(fixed[!duplicated(toupper(CLASS_MAP_COLORS))]), toupper(unname(CLASS_MAP_COLORS[!duplicated(toupper(CLASS_MAP_COLORS))]))))

# Composition render: 40 classes with a cycling 8-color map (legacy/preset state).
classes <- sprintf('K%02d', 1:40)
df <- data.frame(Lipid_Name = paste0(classes, '(1)'), S1 = 1:40, S2 = 40:1, S3 = 2, S4 = 3, check.names = FALSE)
metadata <- data.frame(FullName = paste0('S', 1:4), Group1 = c('A', 'A', 'B', 'B'), Group2 = 'X')
value <- function(x) { force(x); function(...) x }
cycling <- stats::setNames(rep(COLOR_PALETTE_PRESETS[['Ocean & Coral']], length.out = 40), classes)
check_render <- function(team) {
  hub <- list(data_processed = value(df), all_metadata = value(metadata), preparation_audit = value(list()),
              preparation_dirty = value(FALSE), color_maps = value(list()), class_color_map = value(cycling),
              palette_settings = value(list(useCustomColors = FALSE)), team_compact_distribution = team)
  server <- function(input, output, session) results_dashboard_module_server(input, output, session, hub)
  out <- NULL
  testServer(server, {
    session$setInputs(color_by = 'Group1', comp_axis_mode = 'sample'); session$flushReact()
    traces <- jsonlite::fromJSON(output$plot_comp, simplifyVector = FALSE)$x$data
    to_hex <- function(col) { v <- as.numeric(regmatches(col, gregexpr('[0-9.]+', col))[[1]])
      if (startsWith(col, '#')) toupper(substr(col, 1, 7)) else sprintf('#%02X%02X%02X', v[1], v[2], v[3]) }
    bars <- vapply(traces, function(t) { col <- t$marker$color; to_hex(if (is.list(col)) col[[1]] else col[1]) }, character(1))
    names(bars) <- vapply(traces, function(t) t$name, character(1))
    html <- output$select_comp$html
    m <- regmatches(html, gregexpr('data-value="(K[0-9]{2})"[^>]*>\\s*<span class="tds-swatch" style="background:(#[0-9A-Fa-f]{6})', html, perl = TRUE))[[1]]
    legend <- toupper(sub('.*background:', '', m)); names(legend) <- sub('data-value="([^"]+)".*', '\\1', m)
    out <<- list(bars = bars, legend = legend)
  })
  out
}
for (team in c(TRUE, FALSE)) {
  r <- check_render(team)
  bars <- r$bars[classes]
  stopifnot(length(bars) == 40, !anyNA(bars), !anyDuplicated(bars), length(r$legend) == 40,
            identical(unname(r$legend[classes]), unname(bars)),
            identical(unname(bars[1:8]), toupper(COLOR_PALETTE_PRESETS[['Ocean & Coral']])),
            identical(r, check_render(team)))  # same category, same color across re-renders
}
# Short dashboard labels that the app aliases to a canonical class (R/global.R class_map)
# take that class's colour: TG is Triacylglycerol (GL_TAG), DG is GL_DAG, CAR is FA_ACar.
local({
  # The app sources R/global.R first; take its class_map the same way.
  for (e in parse('R/global.R')) if (is.call(e) && identical(e[[1]], as.name('<-')) && identical(e[[2]], as.name('class_map'))) eval(e, globalenv())
  m <- as.list(CLASS_MAP_COLORS)
  lv <- c('PC', 'TG', 'DG', 'CAR', 'CHE', 'SM')
  r <- setNames(rd_class_colors(lv, m), lv)
  stopifnot(identical(r[['TG']], CLASS_MAP_COLORS[['GL_TAG']]),
            identical(r[['DG']], CLASS_MAP_COLORS[['GL_DAG']]),
            identical(r[['CAR']], CLASS_MAP_COLORS[['FA_ACar']]),
            identical(r[['CHE']], CLASS_MAP_COLORS[['ST_CE']]),
            identical(r[['PC']], CLASS_MAP_COLORS[['GP_PC']]),
            !anyDuplicated(toupper(r)))
})
cat('PASS composition colors: palette_extend N=1..40 distinct/palette-first/deterministic for every preset; presets no longer cycle; 40-class composition bars (Team and Classic paths) distinct, legend swatches == bar colors, stable across re-renders; TG/DG/CAR/CHE take their aliased class colours.\n')
