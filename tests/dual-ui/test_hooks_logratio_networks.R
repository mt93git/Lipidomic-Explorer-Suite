# Hooks for the log-ratio, structural and FLA modules (production adapters #6-#10, #13).
# Classic runs each hook's default, which reproduces the code before the hook;
# the Team implementations reproduce production's adapters on small synthetic inputs.
suppressPackageStartupMessages({ library(shiny); library(ggplot2) })
source("R/core/hooks.R")
lipidomic_hook_reset()

parsed <- function(path) parse(path, keep.source = FALSE)
logratio <- parsed("R/modules/9_logratio_module.R")
structural <- parsed("R/modules/8_structural_module.R")
fla <- parsed("R/modules/10_fla_module.R")

# Right-hand side of the single assignment to `target` (a symbol or output$id).
find_assign <- function(node, target) {
  hits <- list()
  walk <- function(x) {
    if (is.call(x) && identical(x[[1L]], as.name("<-")) && identical(x[[2L]], target)) hits[[length(hits) + 1L]] <<- x[[3L]]
    if (is.recursive(x)) for (i in seq_along(x)) if (!is.null(x[[i]])) walk(x[[i]])
  }
  for (e in node) walk(e)
  stopifnot(length(hits) == 1L)
  hits[[1L]]
}
# Every lipidomic_hook("name") call within a node, deparsed with its arguments.
hook_calls <- function(node, name) {
  hits <- character()
  walk <- function(x) {
    if (is.call(x) && is.call(x[[1L]]) && identical(x[[1L]][[1L]], as.name("lipidomic_hook")) &&
        identical(x[[1L]][[2L]], name)) hits <<- c(hits, paste(deparse(x), collapse = " "))
    if (is.recursive(x)) for (i in seq_along(x)) if (!is.null(x[[i]])) walk(x[[i]])
  }
  for (e in node) walk(e)
  hits
}
calls_fn <- function(node, fname) {
  found <- FALSE
  walk <- function(x) {
    if (is.call(x) && identical(x[[1L]], as.name(fname))) found <<- TRUE
    if (is.recursive(x)) for (i in seq_along(x)) if (!is.null(x[[i]])) walk(x[[i]])
  }
  walk(node); found
}
# A reactive/renderPlot body as a function evaluated in `env`.
body_fn <- function(rhs, env) {
  stopifnot(is.call(rhs), length(rhs) >= 2L)
  f <- function() NULL; body(f) <- rhs[[2L]]; environment(f) <- env; f
}

# --- 1. Modules contain each hook call at the adapter targets -------------------
writers <- hook_calls(logratio, "violin_export_table")
stopifnot(length(writers) == 2L, all(grepl("(export_df, session, shared_data)", writers, fixed = TRUE)))
server <- find_assign(logratio, as.name("logratio_server"))
first <- body(eval(server))[[2L]]
stopifnot(identical(first, quote(shared_data <- lipidomic_hook("logratio_shared_data")(shared_data))))
# C1's two Team-only restore additions are still there.
stopifnot(sum(grepl('identical(lipidomic_interface(), "team")', readLines("R/modules/9_logratio_module.R"), fixed = TRUE)) >= 2L)

msg_structural <- "Correlation network requires a confirmed independent study design. Repeated observations cannot be treated as independent."
msg_fla <- "Functional correlation circos requires a confirmed independent study design. Repeated observations cannot be treated as independent."
network_data <- find_assign(structural, as.name("networkData"))
network_plot <- find_assign(structural, quote(output$networkPlot))
cor_data <- find_assign(fla, as.name("correlation_data"))
circos_logic <- find_assign(fla, as.name("circos_plot_logic"))
circos_plot <- find_assign(fla, quote(output$plotCircos))
for (rhs in list(network_data, network_plot, cor_data, circos_logic, circos_plot))
  stopifnot(length(hook_calls(list(rhs[[2L]][[2L]]), "inference_allowed")) == 1L)  # the first statement is the gate
stopifnot(length(hook_calls(structural, "inference_allowed")) == 2L, length(hook_calls(fla, "inference_allowed")) == 3L)
# #10 is fixed in the module for both interfaces (Max, 3 Nov): no FLA palette hook.
stopifnot(length(hook_calls(fla, "fla_violin_palette")) == 0L)

banner <- find_assign(structural, as.name("render_structural_status_banner"))
banner_base <- find_assign(structural, as.name("render_structural_status_banner_base"))
stopifnot(length(hook_calls(list(banner), "de_banner")) == 1L, length(hook_calls(structural, "de_banner")) == 1L,
  calls_fn(banner_base, "render_de_not_run_banner_base"), !calls_fn(banner_base, "render_de_not_run_banner"))
# The unwarned Differential analysis banner the structural banner builds on.
stopifnot(any(grepl("^render_de_not_run_banner_base <- function\\(shared_data\\)", readLines("R/modules/utils_stats.R"))))
cat("PASS modules call violin_export_table x2, logratio_shared_data, inference_allowed x5, de_banner; FLA palette fixed in module\n")

# --- 2. Classic: no registrations, every default reproduces the original code ---
stopifnot(identical(lipidomic_hook_registered(), character()))
export_df <- data.frame(Sample = c("s1", "s2", "s3", "s4"), P_Value = c(NA, 0.01, NA, NA),
  Significance = c("ns", "*", "ns", "ns"), Is_Baseline = c(FALSE, FALSE, TRUE, NA), stringsAsFactors = FALSE)
stopifnot(identical(lipidomic_hook("violin_export_table")(export_df, NULL, NULL), export_df))
sd_plain <- list(inference_allowed = function(paired = FALSE) TRUE)
stopifnot(identical(lipidomic_hook("logratio_shared_data")(sd_plain), sd_plain))
stopifnot(isTRUE(lipidomic_hook("inference_allowed")(TRUE, NULL, list(), scope = "structural")))
# #10: the module's own palette statements key the FLA violin colours by group.
find_all <- function(node, target) { hits <- list(); walk <- function(x) { if (is.call(x) && identical(x[[1L]], as.name("<-")) && identical(x[[2L]], target)) hits[[length(hits) + 1L]] <<- x; if (is.recursive(x)) for (i in seq_along(x)) if (!is.null(x[[i]])) walk(x[[i]]) }; for (e in node) walk(e); hits }
palette_steps <- find_all(fla, as.name("safe_colors"))
stopifnot(length(palette_steps) == 2L)
palette_env <- new.env()
palette_env$input <- list(); palette_env$global_color_map <- NULL; palette_env$c_var <- "Group"
palette_env$c_levels <- c("A", "B"); palette_env$`%||%` <- function(a, b) if (is.null(a)) b else a
palette_env$shared_data <- list(color_maps = function() list(Group = stats::setNames(c("#111111", "#222222"), c("A", "B"))))
for (step in palette_steps) eval(step, palette_env)
stopifnot(identical(palette_env$safe_colors, c(A = "#111111", B = "#222222")))

# Gates pass in Classic: each body runs on to its original first statement
# (req() on missing data), even when the study design forbids inference.
`%||%` <- function(a, b) if (is.null(a)) b else a
generate_empty_plot_message <- eval(find_assign(parsed("R/global.R"), as.name("generate_empty_plot_message")))
guided_local_inference_allowed <- eval(find_assign(parsed("R/modules/utils_stats.R"), as.name("guided_local_inference_allowed")))
gate_env <- function(policy) {
  e <- new.env(parent = globalenv())
  e$session <- NULL
  e$shared_data <- list(inference_allowed = policy, data_processed = function() NULL, annotationData = function() NULL)
  e$processed_db <- function() NULL
  e$networkData <- function() NULL
  e$circos_plot_logic <- function() NULL
  e
}
silent <- function(f) inherits(tryCatch(f(), error = function(e) e), "shiny.silent.error")
blocked <- function(paired = FALSE) FALSE
for (rhs in list(network_data, cor_data, circos_logic, circos_plot)) stopifnot(silent(body_fn(rhs, gate_env(blocked))))
pdf(NULL); classic_plot <- body_fn(network_plot, gate_env(blocked))(); invisible(dev.off())
stopifnot(is.null(classic_plot))  # the original "No significant correlations" base-graphics plot

# Classic structural banner: the DA banner when there is one, otherwise the ready banner with its launch button.
banner_env <- function(da) {
  e <- new.env(parent = globalenv())
  e$shared_data <- list(); e$input <- list(runAnalysis = 0)
  e$render_de_not_run_banner_base <- function(shared_data) da
  eval(call("<-", as.name("render_structural_status_banner_base"), banner_base), e)
  eval(call("<-", as.name("render_structural_status_banner"), banner), e)
  e
}
stopifnot(identical(banner_env("DA")$render_structural_status_banner(), "DA"))
ready <- as.character(banner_env(NULL)$render_structural_status_banner())
stopifnot(grepl("structural-ready-banner", ready), grepl("Initiate Structural Analysis", ready))
cat("PASS Classic defaults leave exports, shared_data, gates, palette and the structural banner unchanged\n")

# --- 3. Team implementations reproduce production's adapters ------------------
source("R/frontends/team/hooks/logratio.R")
source("R/frontends/team/hooks/networks.R")
stopifnot(all(c("violin_export_table", "logratio_shared_data", "inference_allowed") %in% lipidomic_hook_registered()))

# #6: a missing test on a non-baseline row is "Not tested"; baseline, NA-baseline and tested rows unchanged.
labelled <- lipidomic_hook("violin_export_table")(export_df, NULL, NULL)
stopifnot(identical(labelled$Significance, c("Not tested", "*", "ns", "ns")),
  identical(labelled[setdiff(names(labelled), "Significance")], export_df[setdiff(names(export_df), "Significance")]))

# #7: unpaired p-values are withheld when participant IDs repeat; paired ones are not.
synthetic <- function(patients) {
  df <- data.frame(Lipid_Name = c("PC 34:1", "PE 36:2"), s1 = c(1, 2), s2 = c(3, 4), s3 = c(5, 6), s4 = c(7, 8))
  meta <- data.frame(FullName = c("s1", "s2", "s3", "s4"), Group1 = c("A", "A", "B", "B"), PatientNumber = patients)
  list(data_processed = function() df, all_metadata = function() meta, inference_allowed = function(paired = FALSE) TRUE)
}
guarded <- lipidomic_hook("logratio_shared_data")(synthetic(c("P1", "P2", "P1", "P3")))
isolate({
  stopifnot(isFALSE(guarded$inference_allowed(FALSE)), isTRUE(guarded$inference_allowed(TRUE)),
    startsWith(guarded$participant_reason(), "1 participant ID contributes more than one sample to the compared groups."))
})
unique_ids <- lipidomic_hook("logratio_shared_data")(synthetic(c("P1", "P2", "P3", "P4")))
isolate(stopifnot(isTRUE(unique_ids$inference_allowed(FALSE)), is.null(unique_ids$participant_reason())))
no_policy <- list(data_processed = function() NULL)
stopifnot(identical(lipidomic_hook("logratio_shared_data")(no_policy), no_policy))
stopifnot(nchar(team_pseudoreplication_recommendation) > 0L,
  is.null(isolate(team_group_comparison_participant_reason(synthetic(c("P1", "P2", "P3", "P4")))())))

# #8/#9: blocked inference shows production's message; allowed inference runs the original body.
stopifnot(isFALSE(lipidomic_hook("inference_allowed")(TRUE, NULL, list(), scope = "fla")),
  isFALSE(lipidomic_hook("inference_allowed")(TRUE, NULL, list(inference_allowed = blocked), scope = "structural")),
  isTRUE(lipidomic_hook("inference_allowed")(TRUE, NULL, list(inference_allowed = function(paired = FALSE) TRUE), scope = "fla")))
label_of <- function(p) vapply(p$layers, function(l) as.character(l$aes_params$label %||% NA), character(1))
same_message <- function(p, msg) inherits(p, "ggplot") &&
  identical(label_of(p), label_of(generate_empty_plot_message(msg)))
stopifnot(is.null(body_fn(network_data, gate_env(blocked))()), is.null(body_fn(cor_data, gate_env(blocked))()),
  same_message(body_fn(network_plot, gate_env(blocked))(), msg_structural),
  same_message(body_fn(circos_plot, gate_env(blocked))(), msg_fla))
logic <- body_fn(circos_logic, gate_env(blocked))()
stopifnot(is.function(logic), identical(names(formals(logic)), "include_title"))
pdf(NULL); printed <- logic(); invisible(dev.off())
stopifnot(same_message(printed, msg_fla))
allowed <- function(paired = FALSE) TRUE
for (rhs in list(network_data, cor_data, circos_logic, circos_plot)) stopifnot(silent(body_fn(rhs, gate_env(allowed))))


# #13: a de_banner implementation (the participant warning) is added above the
# whole structural banner, which keeps its ready banner and launch button.
lipidomic_hook_register("de_banner", function(banner, shared_data, ...) tagList(tags$div(class = "team-warning", "W"), banner))
team_ready <- as.character(banner_env(NULL)$render_structural_status_banner())
stopifnot(grepl("team-warning", team_ready), grepl("Initiate Structural Analysis", team_ready),
  regexpr("team-warning", team_ready) < regexpr("structural-ready-banner", team_ready))
lipidomic_hook_reset()
cat("PASS Team hooks: Not tested labels, participant guard, network gates with production messages, palette names, structural warning\n")
