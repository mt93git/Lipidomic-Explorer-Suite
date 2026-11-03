# Differential analysis pseudoreplication warning (Team only; nothing blocked).
# The real shared hub runs its own Differential analysis on the synthetic browser
# fixture (tests/dual-ui/fixture_team_da_participant_capture.R) with unique,
# repeated and no participant IDs:
#  - every DA value is serialize-identical to the production wiring, in all cases;
#  - with repeated IDs under an independent design, the DA "not run" banner slot
#    and the volcano figure carry the existing participant reason as a warning;
#  - the volcano's plotted data are identical with and without the warning.
# Optional: LIPIDOMIC_BASELINE_TREE=<root of the production tree (0cb7e12, paula/deployed-prod)>
# also compares against that tree's own code.
suppressPackageStartupMessages({
  library(shiny); library(ggplot2); source('R/global.R')
  source('R/frontends/team/server.R'); source('R/frontends/team/violin_statistics.R')
  source('R/frontends/team/da_participant_warning.R'); source('R/frontends/team/export_studio_adapter.R')
})
checks <- character()
check <- function(label, condition) { if (!isTRUE(condition)) stop(paste('FAIL:', label), call. = FALSE); checks <<- c(checks, label) }

# ---- Units ---------------------------------------------------------------------
base <- list(participant = c('P1', 'P2', 'P1', 'P2'), group = c('a', 'a', 'b', 'b'), participant_field = 'PatientNumber',
             participant_ambiguous = rep(FALSE, 4))
reasons <- list(repeated = team_violin_stats_participants(base, c('a', 'b'))$reason,
  incomplete = team_violin_stats_participants(modifyList(base, list(participant = c('P1', NA, 'P3', 'P4'))), c('a', 'b'))$reason,
  ambiguous = team_violin_stats_participants(modifyList(base, list(participant_ambiguous = c(TRUE, FALSE, FALSE, FALSE))), c('a', 'b'))$reason)
for (k in names(reasons)) {
  w <- team_da_participant_warning_text(reasons[[k]])
  check(paste(k, 'reason becomes a warning that does not claim p-values were withheld'),
    !grepl('no p-values were computed', w, ignore.case = TRUE) && grepl('computed as if these samples were independent', w, fixed = TRUE))
}
check('warning recommends a paired analysis', grepl('Recommendation: analyse these samples as paired or repeated measures', team_da_participant_warning_text(reasons$repeated), fixed = TRUE))
check('repeated warning keeps the existing reason text',
  startsWith(team_da_participant_warning_text(reasons$repeated), sub(' No p-values were computed.', '', reasons$repeated, fixed = TRUE)))
banner <- team_de_banner_participant_warning_adapter(function(sd) 'original banner')
check('banner unchanged without a reason or without results',
  identical(banner(list(team_da_participant_reason = function() NULL, de_results = function() data.frame(x = 1))), 'original banner') &&
  identical(banner(list(team_da_participant_reason = function() reasons$repeated, de_results = function() NULL)), 'original banner') &&
  identical(banner(list()), 'original banner'))
e <- new.env(parent = globalenv()); sys.source('R/modules/6_volcano_module.R', e)
before <- serialize(body(e$volcano_server), NULL)
adapted <- team_volcano_participant_warning_adapter(e$volcano_server)
check('volcano adapter leaves the shared module body untouched', identical(before, serialize(body(e$volcano_server), NULL)))
mutant <- function(id, shared_data) shiny::moduleServer(id, function(input, output, session) { generateVolcanoPlot <- function(x) NULL })
check('volcano adapter fails closed on a changed module', inherits(try(team_volcano_participant_warning_adapter(mutant), silent = TRUE), 'try-error'))
# Structural: its own "ready" banner and launch button stay, with the warning above.
es <- new.env(parent = globalenv()); sys.source('R/modules/8_structural_module.R', es)
check('structural adapter matches the checked-in module', is.function(team_structural_participant_warning_adapter(es$structural_server)))
mini <- function(id, shared_data) {
  input <- list(runAnalysis = 0)
  render_structural_status_banner <- function() {
    de_banner <- render_de_not_run_banner(shared_data)
    if (!is.null(de_banner)) return(de_banner)
    if (input$runAnalysis == 0) return('READY BANNER')
    NULL
  }
  render_structural_status_banner()
}
render_de_not_run_banner <- team_de_banner_participant_warning_adapter(function(sd) NULL)
warned_hub <- list(team_da_participant_reason = function() reasons$repeated, de_results = function() data.frame(x = 1))
html <- function(x) as.character(htmltools::renderTags(x)$html)
check('without the adapter the warning would hide the structural ready banner (the defect)', !grepl('READY BANNER', html(mini('s', warned_hub)), fixed = TRUE))
fixed <- team_structural_participant_warning_adapter(mini)
check('structural keeps its ready banner and adds the warning above it',
  grepl('Pseudoreplication warning', html(fixed('s', warned_hub)), fixed = TRUE) && grepl('READY BANNER', html(fixed('s', warned_hub)), fixed = TRUE))
check('structural banner unchanged without a reason', identical(fixed('s', list(team_da_participant_reason = function() NULL, de_results = function() data.frame(x = 1))), 'READY BANNER'))
rm(render_de_not_run_banner)
cap <- team_volcano_warning_caption(ggplot2::ggplot(), list(team_da_participant_reason = function() reasons$repeated, de_results = function() data.frame(x = 1)), 330)
check('caption is wrapped to a narrow rendered width (330 px)', all(nchar(strsplit(cap$labels$caption, '\n')[[1]]) <= 48L))

# Small figures get the compact caption; it fits the smallest Export Studio page
# (40 x 40 mm at 7.5 pt): at most 4 lines whose width stays inside the page.
small <- team_volcano_warning_caption(ggplot2::ggplot(), list(team_da_participant_reason = function() reasons$repeated, de_results = function() data.frame(x = 1)),
  40 / 25.4 * 72 + 40, size = 7.5)
small_lines <- strsplit(small$labels$caption, '\n')[[1]]
check('40 mm export caption is compact and fits the page', length(small_lines) <= 4L &&
  max(nchar(small_lines)) * 7.5 * 0.6 <= 40 / 25.4 * 72 && grepl('p-values assume independent samples', paste(small_lines, collapse = ' '), fixed = TRUE))
# The caption width is read reactively: a reactive using it is rebuilt when the
# Export Studio width changes (and an isolated read works outside reactives).
check('Export Studio caption width is reactive', {
  ms <- shiny::MockShinySession$new(); ms$setInputs(width_mm = 89); n <- 0L
  shiny::withReactiveDomain(ms, {
    r <- shiny::reactive({ n <<- n + 1L; team_da_export_width_mm() })
    first <- shiny::isolate(r()); ms$setInputs(width_mm = 40); second <- shiny::isolate(r())
  })
  identical(c(first, second), c(89, 40)) && n == 2L
})
check('width read outside a reactive context falls back to an isolated read', {
  ms <- shiny::MockShinySession$new(); ms$setInputs(width_mm = 120)
  identical(shiny::withReactiveDomain(ms, team_da_export_width_mm()), 120)
})

walk <- function(node) if (is.call(node)) c(list(node), unlist(lapply(as.list(node), walk), recursive = FALSE)) else
  if (is.expression(node) || is.list(node) || is.pairlist(node)) unlist(lapply(as.list(node), walk), recursive = FALSE) else list()
server_calls <- vapply(walk(parse('R/server.R')), function(x) paste(deparse(x[[1L]]), collapse = ''), character(1))
check('R/server.R keeps inference_check as the design policy and adds only the participant reason',
  sum(server_calls == 'team_group_comparison_participant_reason') == 1L && !any(grepl('team_da_inference_check', server_calls)))

# ---- The shared hub's own Differential analysis --------------------------------
fixture <- normalizePath('tests/browser/ci/fixtures/abundance.csv')
capture_script <- normalizePath('tests/dual-ui/fixture_team_da_participant_capture.R')
capture <- function(mode, case) {
  out <- tempfile(fileext = '.rds'); log <- tempfile(fileext = '.log')
  system2(file.path(R.home('bin'), 'Rscript'), c('--vanilla', shQuote(capture_script), mode, case, shQuote(out), shQuote(fixture)),
    stdout = log, stderr = log, env = 'R_PROFILE_USER=/dev/null')
  if (!file.exists(out)) stop(sprintf('capture %s/%s failed in %s:\n%s', mode, case, getwd(), paste(tail(readLines(log), 30), collapse = '\n')))
  readRDS(out)
}
run_in <- function(tree, mode, case) { old <- setwd(tree); on.exit(setwd(old)); capture(mode, case) }
de_keys <- c('de_results', 'significant_lipids', 'de_settings', 'de_contrast_info', 'actual_de_method', 'inference_unpaired', 'inference_paired', 'data_processed')
same_de <- function(a, b) all(vapply(c('1', '0.5'), function(fc) identical(serialize(a[[fc]][de_keys], NULL), serialize(b[[fc]][de_keys], NULL)), logical(1)))
here <- getwd(); baseline <- Sys.getenv('LIPIDOMIC_BASELINE_TREE')
results <- list()
for (case in c('unique', 'absent', 'repeated')) {
  r <- list(warning = run_in(here, 'warning', case), production = run_in(here, 'production', case))
  check(paste(case, 'participants: DA output serialize-identical to the production wiring'), same_de(r$warning, r$production))
  check(paste(case, 'participants: DA ran (five significant lipids at |log2FC| >= 0.5)'),
    is.data.frame(r$warning[['0.5']]$de_results) && length(r$warning[['0.5']]$significant_lipids) == 5L)
  if (nzchar(baseline)) check(paste(case, 'participants: DA output serialize-identical to the baseline tree'),
    same_de(r$warning, run_in(normalizePath(baseline), 'production', case)))
  results[[case]] <- r
}
for (case in c('unique', 'absent')) check(paste(case, 'participants: no reason and the banner is unchanged'),
  is.null(results[[case]]$warning$team$reason) && identical(results[[case]]$warning$team$banner, 'original banner'))
rep <- results$repeated$warning
check('repeated participants: the existing reason is reported', grepl('^4 participant IDs contribute more than one sample', rep$team$reason))
check('repeated participants: the banner slot shows the warning above the original content',
  grepl(team_da_participant_warning_text(rep$team$reason), rep$team$banner, fixed = TRUE) && grepl('Pseudoreplication warning', rep$team$banner, fixed = TRUE) &&
  grepl('original banner', rep$team$banner, fixed = TRUE))

# The volcano figure: same plotted data, plus the warning caption.
volcano <- function(server, x, reason, extra = rep$team$hub) {
  hub <- list(annotationData = function() extra$annotationData, global_filtered_lipids = function() extra$global_filtered_lipids,
    class_color_map = function() extra$class_color_map, origin_color_map = function() extra$origin_color_map,de_results = function() x$de_results, de_settings = function() x$de_settings, actual_de_method = function() x$actual_de_method,
    de_contrast_info = function() x$de_contrast_info, significant_lipids = function() x$significant_lipids,
    targeted_mode_active = function() FALSE,
    team_da_participant_reason = function() reason)
  out <- NULL
  shiny::testServer(server, args = list(shared_data = hub), {
    session$setInputs(classLabelFormat = 'full', volcanoColorMode = 'regulation', showLabels = TRUE, labelThreshold = 10, useCountInsteadOfPct = TRUE,
      alphaWeightLog2FC = 1, betaWeightNegLog10P = 1, labelTextSize = 4.5, labelTextColor = '#000000', pointSize = 4, pointAlpha = 0.7, pointStroke = 0.2,
      axisTextSize = 16, legendTextSize = 16, labelForce = 35, removeGrid = TRUE, showDensity = FALSE, symmetricX = FALSE, compressX = FALSE, compressY = FALSE)
    out <<- tryCatch(generateVolcanoPlot(), error = function(e) e)
  })
  out
}
x <- rep[['0.5']]
plain <- volcano(e$volcano_server, x, rep$team$reason)
warned <- volcano(adapted, x, rep$team$reason)
quiet <- volcano(adapted, x, NULL)
if (inherits(plain, 'error')) stop('volcano did not render: ', conditionMessage(plain))
built <- function(p) lapply(ggplot2::ggplot_build(p)$data, function(d) d[, setdiff(names(d), 'PANEL'), drop = FALSE])
check('volcano with the warning plots exactly the same layers and data', identical(built(plain), built(warned)) && identical(plain$data, warned$data))
check('volcano with the warning keeps title and axes', identical(plain$labels$title, warned$labels$title) && identical(plain$labels$x, warned$labels$x))
check('volcano caption states the warning', grepl('Pseudoreplication warning', warned$labels$caption, fixed = TRUE) &&
  grepl('4 participant IDs repeat across the compared samples', gsub('\n', ' ', warned$labels$caption), fixed = TRUE) &&
  grepl('Consider a paired analysis', gsub('\n', ' ', warned$labels$caption), fixed = TRUE))
check('volcano without a reason is the unadapted figure', identical(serialize(built(plain), NULL), serialize(built(quiet), NULL)) && is.null(quiet$labels$caption))

# ---- Exports -------------------------------------------------------------------
# Volcano card: PDF uses generateVolcanoPlot (caption checked above); its CSV
# (downloadTable) writes volcanoData() and is not touched by any adapter.
check('volcano card CSV handler is not rewritten (only generateVolcanoPlot is)', {
  a <- deparse(body(adapted)); o <- deparse(body(e$volcano_server))
  identical(grep('write_spreadsheet_csv', a, value = TRUE), grep('write_spreadsheet_csv', o, value = TRUE))
})
# Publication Export Studio, the real volcano artifact on the captured repeated case.
es2 <- new.env(parent = globalenv()); sys.source('R/modules/99_export_studio_module.R', es2)
team_art <- team_export_studio_artifacts_adapter(es2$generate_export_artifacts)
warned_art <- team_export_participant_warning_adapter(team_art)
x <- rep[['0.5']]
export_hub <- function(reason) list(inference_allowed = function(paired = FALSE) !paired, de_results = function() x$de_results,
  de_contrast_info = function() x$de_contrast_info, de_settings = function() x$de_settings, team_da_participant_reason = function() reason)
prod_art <- shiny::isolate(team_art('volcano', export_hub(rep$team$reason), base_pt = 7.5))
w_art <- shiny::isolate(warned_art('volcano', export_hub(rep$team$reason), base_pt = 7.5))
q_art <- shiny::isolate(warned_art('volcano', export_hub(NULL), base_pt = 7.5))
check('Export Studio volcano data table is identical with the warning', identical(serialize(prod_art$data, NULL), serialize(w_art$data, NULL)))
check('Export Studio volcano figure keeps its data and layers, and adds the caption',
  identical(built(prod_art$plot), built(w_art$plot)) && grepl('Pseudoreplication warning', w_art$plot$labels$caption, fixed = TRUE))
check('Export Studio reproduction script starts with the warning as comments and still parses',
  startsWith(w_art$r_script, '# Pseudoreplication warning.') && is.expression(parse(text = w_art$r_script)) && grepl(prod_art$r_script, w_art$r_script, fixed = TRUE))
check('Export Studio artifacts unchanged without a reason',
  identical(serialize(prod_art[names(prod_art) != 'plot'], NULL), serialize(q_art[names(q_art) != 'plot'], NULL)) &&
  identical(built(prod_art$plot), built(q_art$plot)) && identical(prod_art$plot$labels, q_art$plot$labels) && is.null(q_art$team_notes))
stub <- team_export_participant_warning_adapter(function(figure_key, shared_data, ...) list(plot = ggplot2::ggplot(), data = data.frame(a = 1), r_script = 'x <- 1'))
check('other Export Studio figures are untouched', identical(stub('pca_2d', export_hub(rep$team$reason), base_pt = 7.5), list(plot = ggplot2::ggplot(), data = data.frame(a = 1), r_script = 'x <- 1')) ||
  is.null(stub('pca_2d', export_hub(rep$team$reason), base_pt = 7.5)$team_notes))
bundle <- function(art) {
  f <- tempfile(fileext = '.zip')
  team_export_studio_write_bundle(f, art, list(pdf = FALSE, svg = FALSE, png = TRUE, tiff = FALSE, csv = TRUE, rscript = TRUE), 89, 89, 300, 7.5, 'nature', 'sans', TRUE)
  d <- tempfile(); utils::unzip(f, exdir = d); d
}
bp <- bundle(prod_art); bw <- bundle(w_art)
csv_name <- paste0(prod_art$filename_base, '_data.csv')
check('ZIP: data CSV byte-identical with the warning', identical(unname(tools::md5sum(file.path(bp, csv_name))), unname(tools::md5sum(file.path(bw, csv_name)))))
check('ZIP: NOTES.txt carries the warning only when warned',
  !file.exists(file.path(bp, 'NOTES.txt')) && grepl('pseudoreplication', paste(readLines(file.path(bw, 'NOTES.txt')), collapse = ' '), fixed = TRUE) &&
  grepl('Recommendation:', paste(readLines(file.path(bw, 'NOTES.txt')), collapse = ' '), fixed = TRUE))
check('ZIP: files are the production set plus NOTES.txt', setequal(list.files(bw), c(list.files(bp), 'NOTES.txt')))

cat(sprintf('PASS (%d checks):\n', length(checks))); cat(paste0(' - ', checks, collapse = '\n'), '\n')
