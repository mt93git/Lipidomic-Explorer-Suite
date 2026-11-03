# Hooks export_artifacts (#1, #14), de_banner (#11), volcano_caption (#12) and
# persistent_inputs (#15): Classic runs the module's own behaviour unchanged;
# Team's registrations reproduce production's adapters on synthetic inputs.
suppressPackageStartupMessages({ library(shiny); library(ggplot2) })
`%||%` <- function(a, b) if (!is.null(a)) a else b
source("R/core/hooks.R")
source("R/modules/utils_stats.R")
suppressPackageStartupMessages(source("R/modules/99_export_studio_module.R"))
eval(parse("R/modules/1_shared_data_module.R")[[1L]])  # session_persistent_inputs only

has <- function(path, text) any(grepl(text, readLines(path, warn = FALSE), fixed = TRUE))
# --- Each module calls its hook ------------------------------------------------
stopifnot(
  has("R/modules/99_export_studio_module.R", 'lipidomic_hook("export_artifacts")(art, figure_key = figure_key'),
  has("R/modules/utils_stats.R", 'lipidomic_hook("de_banner")(render_de_not_run_banner_base(shared_data)'),
  has("R/modules/6_volcano_module.R", 'lipidomic_hook("volcano_caption")(generateVolcanoPlotBase()'),
  has("R/modules/6_volcano_module.R", 'output$volcanoPlot <- renderPlot({ generateVolcanoPlot() })'),
  has("R/modules/6_volcano_module.R", 'ggsave(file, plot=generateVolcanoPlot()'),
  has("R/modules/1_shared_data_module.R", 'lipidomic_hook("persistent_inputs")(inputs[!transient])'))

reason <- "2 participant IDs contribute more than one sample to this comparison (P1, P2). No p-values were computed."
long_comp <- "treated with a very long name to force wrapping of the title"
sd <- list(
  inference_allowed = function(paired = FALSE) TRUE, preparation_dirty = function() FALSE,
  de_results = function() data.frame(Lipid_Name = c("PC(34:1)", "PE(36:2)", "TG(52:2)"),
    log2FC = c(1.5, -1.1, 0.2), p_raw = c(0.01, 0.03, 0.5)),
  de_contrast_info = function() list(ref = "control", comp = long_comp),
  team_da_participant_reason = function() reason,
  pca_results = function() list(score_df = data.frame(FullName = c("S1", "S2"), PC1 = c(-1, 1),
    PC2 = c(0.5, -0.5), Group1 = c("A", "B")), var_PC = c(60, 25)),
  grouped_metadata = function() NULL, data_processed = function() NULL, annotationData = function() NULL)
no_de <- modifyList(sd, list(de_results = function() NULL))
no_reason <- modifyList(sd, list(team_da_participant_reason = function() NULL))
same_art <- function(a, b) identical(a$r_script, b$r_script) && identical(a$data, b$data) &&
  identical(a$plot$labels, b$plot$labels) && identical(a$plot$theme, b$plot$theme) &&
  identical(setdiff(names(a), "plot"), setdiff(names(b), "plot"))
gen <- function(key, s = sd, pt = 7.5) generate_export_artifacts(figure_key = key, shared_data = s, base_pt = pt)
base <- function(key, s = sd, pt = 7.5) generate_export_artifacts_base(figure_key = key, shared_data = s, base_pt = pt)
plot <- ggplot(data.frame(x = 1, y = 1), aes(x, y)) + geom_point()
inputs <- list(a = 1, "x-team_violin_stats_request" = 2, team_violin_stats_request = 3,
  guide_step = 4, "y-team_violin_stats_request_other" = 5)

# --- Classic: nothing registered, every default is the module's own result ----
lipidomic_hook_reset()
for (key in c("volcano", "pca_2d")) stopifnot(same_art(gen(key), base(key)))
classic_volcano <- gen("volcano")
stopifnot(is.null(classic_volcano$team_notes), is.null(classic_volcano$plot$labels$caption),
  identical(classic_volcano$plot$labels$title, paste0("Volcano Plot (", long_comp, " vs control)")))
stopifnot(inherits(try(gen("volcano", modifyList(sd, list(preparation_dirty = function() TRUE))), silent = TRUE), "try-error"))
for (s in list(sd, no_de)) stopifnot(identical(render_de_not_run_banner(s), render_de_not_run_banner_base(s)))
stopifnot(identical(lipidomic_hook("volcano_caption")(plot, shared_data = sd,
  width_px = function() stop("Classic must not read the width")), plot))
stopifnot(identical(names(session_persistent_inputs(inputs)),
  c("a", "x-team_violin_stats_request", "team_violin_stats_request", "y-team_violin_stats_request_other")),
  identical(session_persistent_inputs(NULL), list()))
cat("PASS Classic: export artifacts, DE banner, volcano plot and persistent inputs unchanged\n")

# --- Team: registrations in bootstrap order (sorted file names) ---------------
team_files <- file.path("R/frontends/team/hooks", c("export.R", "participant_warning.R", "persistent_inputs.R"))
stopifnot(identical(team_files[1:2], sort(team_files[1:2])))
for (f in team_files) source(f)
reg <- get("export_artifacts", envir = .lipidomic_hooks)
stopifnot(length(reg) == 2L, identical(reg[[2L]], team_export_participant_warning_artifacts))
# Production: team_export_participant_warning_adapter(team_export_studio_artifacts_adapter(orig)).
stopifnot(same_art(gen("volcano"), team_export_participant_warning_artifacts(
  team_export_studio_adapt_artifacts(base("volcano"), width_mm = 89, base_pt = 7.5),
  figure_key = "volcano", shared_data = sd, base_pt = 7.5)))

note <- paste("Pseudoreplication warning. 2 participant IDs contribute more than one sample to this comparison (P1, P2).",
  "Differential analysis p-values here were computed as if these samples were independent; interpret them with caution.",
  "Recommendation: analyse these samples as paired or repeated measures (set the study design to Matched or repeated and use a paired comparison), so each participant's samples are compared within that participant.")
team_volcano <- gen("volcano")
stopifnot(identical(team_volcano$data, classic_volcano$data),
  identical(team_volcano$team_notes, note),
  identical(team_volcano$plot$labels$title, "Volcano Plot (treated with a very\nlong name to force wrapping of the\ntitle vs control)"),
  identical(team_volcano$plot$labels$caption, paste0("Pseudoreplication warning: 2 participant IDs\nrepeat across the compared samples; p-values\n",
    "assume independent samples. Consider a paired\nanalysis.")),
  startsWith(team_volcano$r_script, paste0(paste0("# ", strwrap(note, width = 76), collapse = "\n"), "\n\n")),
  grepl("labs(title = 'Volcano Plot (treated with a very\\nlong name", team_volcano$r_script, fixed = TRUE))
stopifnot(identical(gen("volcano", pt = 6)$plot$labels$title,
  "Volcano Plot (treated with a very long name\nto force wrapping of the title vs control)"))
# Without a participant reason only the title is wrapped; other figures get no warning.
quiet <- gen("volcano", no_reason)
stopifnot(is.null(quiet$team_notes), is.null(quiet$plot$labels$caption), !grepl("Pseudoreplication", quiet$r_script),
  identical(quiet$plot$labels$title, team_volcano$plot$labels$title))
pca <- gen("pca_2d")
stopifnot(is.null(pca$team_notes), is.null(pca$plot$labels$caption), identical(pca$data, base("pca_2d")$data))

# DE banner: the warning sits above whatever the slot showed, only with a result and a reason.
banner <- render_de_not_run_banner(sd)
stopifnot(inherits(banner, "shiny.tag.list"), length(banner) == 2L, is.null(banner[[2L]]),
  grepl("team-da-participant-warning", as.character(banner), fixed = TRUE),
  grepl(sub("^Pseudoreplication warning\\. ", "", note), as.character(banner), fixed = TRUE),
  identical(render_de_not_run_banner(no_reason), render_de_not_run_banner_base(no_reason)),
  identical(render_de_not_run_banner(no_de), render_de_not_run_banner_base(no_de)),
  identical(team_de_banner_without_warning(sd), render_de_not_run_banner_base(sd)))

# Volcano caption wraps to the rendered width; narrow figures get the compact form.
wide <- lipidomic_hook("volcano_caption")(plot, shared_data = sd, width_px = function() 1200)
narrow <- lipidomic_hook("volcano_caption")(plot, shared_data = sd, width_px = function() 300)
stopifnot(identical(wide$labels$caption, paste("Pseudoreplication warning: 2 participant IDs repeat across the compared samples;",
    "p-values assume independent samples. Consider a paired analysis.")),
  identical(narrow$labels$caption, "Pseudoreplication warning: p-values\nassume independent samples."),
  identical(wide$theme$plot.caption$colour, "#b45309"),
  identical(lipidomic_hook("volcano_caption")(plot, shared_data = no_reason, width_px = function() 300), plot))

# Persistent inputs: Team drops violin-statistics request events after the Classic filter.
stopifnot(identical(names(session_persistent_inputs(inputs)), c("a", "y-team_violin_stats_request_other")),
  identical(session_persistent_inputs(NULL), list()))
lipidomic_hook_reset()
cat("PASS Team: export title wrap and warning (caption, script header, notes), DE banner, volcano caption, persistent filter; production order\n")
