# Heatmap and QC hooks that replace production's Team adapters #2-#5:
#   heatmap_scale_adapter              -> heatmap_violin_values
#   heatmap_canvas_boundaries_adapter  -> heatmap_container_outputs
#   qc_3d_labels_adapter               -> qc_3d_textfont
#   legacy_vector_adapter              -> qc_plot_outputs
# Classic defaults must reproduce the module's previous behavior exactly; Team
# implementations must reproduce the production adapters. Fast, synthetic data only.
suppressPackageStartupMessages({
  library(shiny); library(bslib); library(htmltools); library(ggplot2); library(plotly)
})
source("R/hooks.R")
lipidomic_hook_reset()

# shiny::testServer() returns NULL; capture the value of its test expression.
test_value <- function(server, expr) {
  result <- new.env()
  eval(substitute(shiny::testServer(SERVER, assign("value", EXPR, envir = RESULT)),
                  list(SERVER = server, EXPR = substitute(expr), RESULT = result)), parent.frame())
  result$value
}

find_assignment <- function(node, target) {
  if (is.call(node) && identical(node[[1]], as.name("<-")) &&
      ((is.symbol(node[[2]]) && identical(as.character(node[[2]]), target)) ||
       (is.call(node[[2]]) && identical(node[[2]][[1]], as.name("$")) &&
        identical(as.character(node[[2]][[3]]), target)))) return(node)
  if (is.recursive(node)) for (i in seq_along(node)) {
    child <- tryCatch(node[[i]], error = function(e) NULL)
    if (is.null(child)) next
    found <- tryCatch(find_assignment(child, target), error = function(e) NULL)
    if (!is.null(found)) return(found)
  }
  NULL
}
heatmap_path <- "R/modules/4_heatmap_module.R"
qc_path <- "R/modules/2_qc_boxplot_module.R"
heatmap_exprs <- parse(heatmap_path, keep.source = FALSE)
heatmap_text <- paste(readLines(heatmap_path, warn = FALSE), collapse = "\n")
qc_text <- paste(readLines(qc_path, warn = FALSE), collapse = "\n")

# --- Every production adapter target now has an explicit hook call site. ------
count <- function(text, pattern) lengths(regmatches(text, gregexpr(pattern, text, fixed = TRUE)))
stopifnot(count(heatmap_text, 'lipidomic_hook("heatmap_violin_values", heatmap_violin_values_default)') == 2L,
          count(heatmap_text, 'lipidomic_hook("heatmap_container_outputs")(output, "unfiltered_heatmap_container", unfiltered_heatmap_ui)') == 1L,
          count(heatmap_text, 'lipidomic_hook("heatmap_container_outputs")(output, "filtered_heatmap_container", filtered_heatmap_ui)') == 1L,
          count(qc_text, 'lipidomic_hook("qc_3d_textfont")') == 2L,
          count(qc_text, 'lipidomic_hook("qc_plot_outputs")') == 1L,
          count(heatmap_text, "output$unfiltered_heatmap_container <- renderUI({ unfiltered_heatmap_ui() })") == 1L,
          count(heatmap_text, "output$filtered_heatmap_container <- renderUI({ filtered_heatmap_ui() })") == 1L)
# The CSV hook call sits right before the Log2_Abundance pivot.
csv_at <- regexpr('scale = "log2")', heatmap_text, fixed = TRUE)
pivot_at <- regexpr('values_to = "Log2_Abundance"', heatmap_text, fixed = TRUE)
stopifnot(csv_at > 0, pivot_at > csv_at, pivot_at - csv_at < 400)

# The violin default is a top-level function of the heatmap module.
defaults <- new.env(parent = globalenv())
eval(find_assignment(heatmap_exprs, "heatmap_violin_values_default"), defaults)

# --- #2 heatmap_violin_values ------------------------------------------------
sub_df <- data.frame(Lipid_Name = c("PC(34:1)", "PE(36:2)", "TG(52:2)"),
  S1 = c(1, 3.5, -2), S2 = c(0, 10, NA), S3 = c("a", "b", "c"), stringsAsFactors = FALSE)
sample_cols <- c("S1", "S2", "S3")
original_transform <- function(sub_df, input) {  # the module's code before the hook
  if (isTRUE(input$violin_scale_mode == "linear")) {
    for (sc in sample_cols) {
      if (is.numeric(sub_df[[sc]])) {
        sub_df[[sc]] <- 2^(sub_df[[sc]])
      }
    }
  }
  sub_df
}
module_scale <- function(input) if (isTRUE(input$violin_scale_mode == "linear")) "linear" else "log2"
classic_values <- lipidomic_hook("heatmap_violin_values", defaults$heatmap_violin_values_default)
for (mode in list("linear", "log2", NULL)) {
  input <- list(violin_scale_mode = mode)
  stopifnot(identical(classic_values(sub_df, sample_cols, scale = module_scale(input)),
                      original_transform(sub_df, input)))
}
# Classic CSV path had no transform at all.
stopifnot(identical(classic_values(sub_df, sample_cols, scale = "log2"), sub_df))

# --- #4 qc_3d_textfont (Classic) and #5 qc_plot_outputs (Classic) -----------------
textfont <- list(color = "#000000", size = 12)
for (labels in c(TRUE, FALSE))
  stopifnot(identical(lipidomic_hook("qc_3d_textfont")(textfont, input = list(showLabels3D = labels)), textfont))
classic_outputs <- test_value(function(input, output, session) {
  lipidomic_hook("qc_plot_outputs")(output, input = input,
    builders = list(pca2dPlot = function() ggplot(), load2dPlot = function() ggplot()))
}, names(session$.__enclos_env__$private$outs))
stopifnot(length(classic_outputs) == 0L)

# --- #3 heatmap_container_outputs: render the module's builders ----------------
builder_env <- function(input) {
  env <- new.env(parent = globalenv())
  env$input <- input
  env$ns <- shiny::NS("heatmap")
  env$shared_data <- list(de_contrast_info = function() list(ref = "control", comp = "treated"))
  env
}
flag_sets <- list(c(FALSE, FALSE), c(TRUE, FALSE), c(FALSE, TRUE), c(TRUE, TRUE))
render_hook <- function(kind, flags) {
  test_value(function(input, output, session) {
    # The module's own statements: builder, Classic output, then the hook call.
    env <- builder_env(input); env$output <- output
    for (target in paste0(kind, c("_heatmap_ui", "_heatmap_container")))
      eval(find_assignment(heatmap_exprs, target), env)
    lipidomic_hook("heatmap_container_outputs")(output, paste0(kind, "_heatmap_container"),
                                                env[[paste0(kind, "_heatmap_ui")]])
  }, {
    session$setInputs(condenseRows = flags[[1]], condenseRowsSD = flags[[2]])
    name <- paste0(kind, "_heatmap_container")
    out <- list()
    for (suffix in c("", "_average", "_sd")) {
      id <- paste0(name, suffix)
      value <- tryCatch(output[[id]]$html, error = function(e) NULL)
      if (!is.null(value)) out[[id]] <- as.character(value)
    }
    out
  })
}
classic_render <- lapply(c("unfiltered", "filtered"), function(kind) lapply(flag_sets, function(f) render_hook(kind, f)))
names(classic_render) <- c("unfiltered", "filtered")
for (kind in names(classic_render)) for (i in seq_along(flag_sets)) {
  out <- classic_render[[kind]][[i]]
  stopifnot(identical(names(out), paste0(kind, "_heatmap_container")))
  html <- out[[1]]
  avg <- flag_sets[[i]][[1]] || (!flag_sets[[i]][[1]] && !flag_sets[[i]][[2]])
  stopifnot(grepl("quick-access-strip", html, fixed = TRUE),
            grepl("Class Standard Deviation", html, fixed = TRUE) == flag_sets[[i]][[2]],
            grepl(if (kind == "unfiltered") "heatmap-heatmapPlot" else "heatmap-filteredHeatmapPlot", html, fixed = TRUE) == avg,
            !grepl(">Data<", html, fixed = TRUE),
            identical(kind == "filtered", grepl("updateFilteredHeatmapTabTitle", html, fixed = TRUE)))
}

# Byte-identical to the renderUI the module had before the hook (when git history is available).
git_show <- function(ref, path) {
  out <- suppressWarnings(tryCatch(system2("git", c("show", paste0(ref, ":", path)), stdout = TRUE, stderr = FALSE),
                                   error = function(e) NULL))
  if (is.null(out) || !is.null(attr(out, "status"))) NULL else out
}
baseline <- git_show("5e7ac36", heatmap_path)
if (is.null(baseline)) {
  cat("SKIP Classic heatmap container byte comparison: baseline commit 5e7ac36 not available\n")
} else {
  baseline_exprs <- parse(text = baseline, keep.source = FALSE)
  for (kind in c("unfiltered", "filtered")) {
    original <- find_assignment(baseline_exprs, paste0(kind, "_heatmap_container"))
    stopifnot(!is.null(original), identical(original[[3]][[1]], as.name("renderUI")))
    for (i in seq_along(flag_sets)) {
      expected <- test_value(function(input, output, session) {
        env <- builder_env(input); env$output <- output
        eval(original, env)
      }, {
        session$setInputs(condenseRows = flag_sets[[i]][[1]], condenseRowsSD = flag_sets[[i]][[2]])
        as.character(output[[paste0(kind, "_heatmap_container")]]$html)
      })
      stopifnot(identical(expected, classic_render[[kind]][[i]][[1]]))
    }
  }
  cat("PASS Classic heatmap containers are byte-identical to the pre-hook renderUI\n")
}

# --- Team implementations --------------------------------------------------------
for (file in c("R/frontends/team/hooks/heatmap.R", "R/frontends/team/hooks/qc.R")) source(file)
stopifnot(all(c("heatmap_violin_values", "heatmap_container_outputs", "qc_3d_textfont",
                "qc_plot_outputs") %in% lipidomic_hook_registered()))

# #2 Team: prepared values are linear; log2 view (and CSV) take log2 of positive finite values.
team_values <- lipidomic_hook("heatmap_violin_values", defaults$heatmap_violin_values_default)
stopifnot(identical(team_values(sub_df, sample_cols, scale = "linear"), sub_df))
logged <- team_values(sub_df, c("S1", "S2"), scale = "log2")
stopifnot(identical(logged$S1, c(0, log2(3.5), NA_real_)),
          identical(logged$S2, c(NA_real_, log2(10), NA_real_)),
          identical(logged$S3, sub_df$S3), identical(logged$Lipid_Name, sub_df$Lipid_Name))

# #4 Team: textfont only while 3D labels are on.
stopifnot(is.null(lipidomic_hook("qc_3d_textfont")(textfont, input = list(showLabels3D = FALSE))),
          is.null(lipidomic_hook("qc_3d_textfont")(textfont, input = list())),
          identical(lipidomic_hook("qc_3d_textfont")(textfont, input = list(showLabels3D = TRUE)), textfont))
trace_mode <- function(font) plotly::plotly_build(plotly::plot_ly(data.frame(x = 1, y = 1, z = 1, l = "a"),
  x = ~x, y = ~y, z = ~z, text = ~l, type = "scatter3d", mode = "markers", textfont = font))$x$data[[1]]$mode
stopifnot(identical(trace_mode(NULL), "markers"))

# #3 Team: controls stay in the container; each card gets its own output; CSV buttons read "Data".
team_render <- lapply(c("unfiltered", "filtered"), function(kind) render_hook(kind, c(TRUE, TRUE)))
names(team_render) <- c("unfiltered", "filtered")
for (kind in names(team_render)) {
  out <- team_render[[kind]]
  name <- paste0(kind, "_heatmap_container")
  stopifnot(identical(names(out), paste0(name, c("", "_average", "_sd"))))
  plot <- if (kind == "unfiltered") "heatmap-heatmapPlot" else "heatmap-filteredHeatmapPlot"
  sd_plot <- if (kind == "unfiltered") "heatmap-heatmapSDPlot" else "heatmap-filteredHeatmapSDPlot"
  stopifnot(grepl("quick-access-strip", out[[name]], fixed = TRUE),
            !grepl(plot, out[[name]], fixed = TRUE), !grepl(sd_plot, out[[name]], fixed = TRUE),
            grepl(paste0('id="', plot, '"'), out[[paste0(name, "_average")]], fixed = TRUE),
            !grepl(sd_plot, out[[paste0(name, "_average")]], fixed = TRUE),
            grepl(sd_plot, out[[paste0(name, "_sd")]], fixed = TRUE),
            !grepl(paste0('id="', plot, '"'), out[[paste0(name, "_sd")]], fixed = TRUE),
            !grepl("quick-access-strip", out[[paste0(name, "_average")]], fixed = TRUE),
            !grepl("quick-access-strip", out[[paste0(name, "_sd")]], fixed = TRUE),
            identical(kind == "filtered", grepl("updateFilteredHeatmapTabTitle", out[[name]], fixed = TRUE)),
            !grepl("updateFilteredHeatmapTabTitle", out[[paste0(name, "_average")]], fixed = TRUE))
  for (card in paste0(name, c("_average", "_sd")))
    stopifnot(grepl(">Data<", gsub("\\s+", "", gsub("</i>", "", out[[card]])), fixed = TRUE),
              !grepl(">CSV<", gsub("\\s+", "", gsub("</i>", "", out[[card]])), fixed = TRUE))
}

# Team output matches production's AST adapter applied to the pre-hook renderUI.
production_ref <- "origin/claude/project-thread-okihs3"
adapter_src <- git_show(production_ref, "R/frontends/team/heatmap_canvas_boundaries_adapter.R")
if (is.null(baseline) || is.null(adapter_src)) {
  cat("SKIP Team heatmap container parity with production adapter: git refs not available\n")
} else {
  prod <- new.env(parent = globalenv())
  eval(parse(text = adapter_src), prod)
  both <- lapply(c("unfiltered", "filtered"), function(kind) find_assignment(baseline_exprs, paste0(kind, "_heatmap_container")))
  original_server <- function(input, output, session) NULL
  body(original_server) <- as.call(c(list(as.name("{")), both))
  adapted <- prod$team_heatmap_canvas_boundaries_adapter(original_server)
  produced <- test_value(function(input, output, session) {
    env <- builder_env(input); env$output <- output
    eval(body(adapted), env)
  }, {
    session$setInputs(condenseRows = TRUE, condenseRowsSD = TRUE)
    out <- list()
    for (kind in c("unfiltered", "filtered")) for (suffix in c("", "_average", "_sd")) {
      id <- paste0(kind, "_heatmap_container", suffix); out[[id]] <- as.character(output[[id]]$html)
    }
    out
  })
  ours <- c(team_render$unfiltered, team_render$filtered)
  stopifnot(identical(names(produced), names(ours)))
  for (id in names(ours)) stopifnot(identical(produced[[id]], ours[[id]]))
  cat("PASS Team heatmap container outputs are byte-identical to production's adapter\n")
}

# #5 Team: vector outputs registered beside the original 2D plots, gated by their toggle.
point_plot <- function() ggplot(data.frame(PC1 = c(-1, 0, 1), PC2 = c(1, 0, -1)), aes(PC1, PC2)) + geom_point() +
  geom_hline(yintercept = 0)
log_plot <- function() ggplot(data.frame(PC1 = c(1, 10, 100), PC2 = c(1, 0, -1)), aes(PC1, PC2)) + geom_point() +
  scale_x_log10()
shiny::testServer(function(input, output, session) {
  lipidomic_hook("qc_plot_outputs")(output, input = input,
    builders = list(pca2dPlot = point_plot, load2dPlot = log_plot))
}, {
  registered <- names(session$.__enclos_env__$private$outs)
  stopifnot(setequal(registered, c("pca2dVectorPlot", "load2dVectorPlot")))
  off <- tryCatch(output$pca2dVectorPlot, error = identity)
  stopifnot(inherits(off, "shiny.silent.error"))
  session$setInputs(team_pca2dPlot_vector = TRUE, team_load2dPlot_vector = TRUE)
  stopifnot(grepl("scatter", output$pca2dVectorPlot, fixed = TRUE))
  unavailable <- tryCatch(output$load2dVectorPlot, error = identity)
  stopifnot(inherits(unavailable, "error"),
            grepl("Editable vector view unavailable: transformed axes require the original view.",
                  conditionMessage(unavailable), fixed = TRUE))
})
vector_src <- git_show(production_ref, "R/frontends/team/legacy_vector_adapter.R")
if (is.null(vector_src)) {
  cat("SKIP Team editable vector parity with production: git ref not available\n")
} else {
  prod_vector <- new.env(parent = globalenv())
  eval(parse(text = vector_src), prod_vector)
  stopifnot(identical(deparse(body(prod_vector$team_qc_editable_vector)), deparse(body(team_qc_editable_vector))))
  cat("PASS Team editable vector view is the production implementation\n")
}

lipidomic_hook_reset()
cat("PASS heatmap/QC hooks: Classic defaults keep prior behavior; Team reproduces adapters #2-#5\n")
