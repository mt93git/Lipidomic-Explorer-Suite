# Redundant plot draws (the class fixed for card create in 2156a924), counted per user operation on the complete
# synthetic fixture. A count is the number of times a card's plot is computed: shiny drawPlot calls for renderPlot,
# executions of the render function past the lazy gate for Plotly. One user operation draws a card's plot at most
# once, and never draws a plot no card shows:
#   1. A renderPlot with its own height (Team's outlierPlot, structural propPlot/diffAcyl, every longitudinal plot)
#      escaped the lazy gate: every card of its family drew it, once per settling round.
#   2. Not changed (section 3): a PATCH, a replay or a restore with a recorded press redraws the card's wanted plot
#      once per settling round, as Team's browser does; drawing it once after the card settles changes what cards
#      built on eventReactive/isolate show.
# Parity: the same operation in the order before this change (plot wanted up front, every round drawn) gives the same image (sha256 of the raw PNG bytes) or the same Plotly JSON (canonical), the same settled
# inputs and the same plotHeight. Every draw starts from the same RNG seed (jittered points).
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_draw_counts: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0", LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV",
  "LIPIDOMIC_API_WORKERS", "LIPIDOMIC_API_LAZY_OUTPUTS"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_draw_counts")
source("frontends/nexo-api/engine.R")
fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
if (!file.exists(fixture)) { cat("SKIP test_api_draw_counts: fixture missing\n"); quit(status = 0) }
invisible(api_catalog())

counts <- new.env(parent = emptyenv()); counts$draw <- list(); counts$exec <- list()
bump <- function(kind, name) counts[[kind]][[name]] <- (counts[[kind]][[name]] %||% 0L) + 1L
suppressMessages(trace("drawPlot", where = asNamespace("shiny"), print = FALSE, tracer = quote({
  bump("draw", name); set.seed(20261109L) })))
on.exit(suppressMessages(untrace("drawPlot", where = asNamespace("shiny"))), add = TRUE)
# Executions past the lazy gate: the counter wraps each output's render function inside the gate.
lazy_outputs <- api_output_lazy
api_output_lazy <- function(mock) {
  lazy <- lazy_outputs(mock)
  define <- mock$defineOutput
  counted <- function(name, func, label) {
    if (is.function(func)) {
      real <- func
      func <- function(...) { bump("exec", name); set.seed(20261109L); real(...) }
      attributes(func) <- attributes(real)
    }
    define(name, func, label)
  }
  unlockBinding("defineOutput", mock); assign("defineOutput", counted, envir = mock); lockBinding("defineOutput", mock)
  lazy
}
snapshot <- function() list(draw = counts$draw, exec = counts$exec)
since <- function(before, kind, names) sum(vapply(names, function(n) (counts[[kind]][[n]] %||% 0L) - (before[[kind]][[n]] %||% 0L), integer(1)))
# Plots of this instance other than its own node (the family module defines them all).
others <- function(before, instanceId, node) {
  drawn <- names(counts$draw)[startsWith(names(counts$draw), paste0(instanceId, "-")) & names(counts$draw) != node]
  stats::setNames(vapply(drawn, function(n) since(before, "draw", n), integer(1)), drawn)
}
count_op <- function(instanceId, node, expr, kind = "draw") {
  before <- snapshot()
  value <- expr
  extra <- others(before, instanceId, node)
  list(value = value, own = since(before, kind, node), others = extra[extra > 0L])
}
fails <- character()
check <- function(ok, pass, fail) if (isTRUE(ok)) cat("PASS", pass, "\n") else { cat("FAIL", fail, "\n"); fails <<- c(fails, fail) }
others_text <- function(x) if (length(x)) paste(sprintf("%s x%d", names(x), x), collapse = ", ") else "none"
# Plotly JSON, canonical: plotly's per-build ids (uid, visdat/cur_data keys, attrs) and the instance id dropped.
canonical <- function(x) {
  if (is.list(x)) { x <- x[setdiff(names(x) %||% character(), c("uid", "visdat", "cur_data", "attrs"))]; lapply(x, canonical) }
  else if (is.character(x)) gsub("tcinstance_[a-z0-9_]+", "<instance>", gsub("[0-9a-f]{10,}", "<id>", x)) else x
}
content <- function(r) if (!is.null(r$png)) digest::digest(r$png, algo = "sha256") else api_canonical_json(canonical(r$figure))
short <- function(x) substr(digest::digest(x, algo = "sha256"), 1, 16)
# The order before this change: the plot wanted before its module starts, nothing held while a card settles.
legacy <- function(nodes, expr) {
  for (n in nodes) s$lazy$wanted[[n]] <- TRUE
  held <- s$lazy$held; s$lazy$held <- NULL
  on.exit(s$lazy$held <- held, add = TRUE)
  expr
}
parity <- function(what, render, reference, card, reference_card) {
  check(identical(content(render), content(reference)),
    sprintf("parity %s: %s identical to the order before (%s)", what, if (is.null(render$png)) "canonical Plotly JSON" else "raw PNG sha256", short(content(render))),
    sprintf("parity %s: content differs from the order before (%s != %s)", what, short(content(render)), short(content(reference))))
  check(identical(api_canonical_json(card$inputs), api_canonical_json(reference_card$inputs)) &&
      identical(card$plotHeight, reference_card$plotHeight),
    sprintf("parity %s: settled inputs and plotHeight (%s) unchanged", what, card$plotHeight %||% "none"),
    sprintf("parity %s: settled inputs or plotHeight differ from the order before", what))
}

s <- api_session_open(fixture)
on.exit(api_session_close(s), add = TRUE)
stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))

# 1a. The outlier card draws its plot once on create (its renderPlot has a reactive height).
id <- "tcinstance_dcoutlier"; node <- paste0(id, "-outlierPlot")
created <- count_op(id, node, api_card_create(s, "qc_pca_tab-outlierPlot", instanceId = id))
check(created$own == 1L, "create qc_pca_tab-outlierPlot draws its plot once",
  sprintf("create qc_pca_tab-outlierPlot drew its plot %d times (expected 1)", created$own))
render <- api_card_render(s, id, 620, created$value$plotHeight %||% 450L)
ref_id <- "tcinstance_dcoutlierref"
reference_card <- legacy(paste0(ref_id, "-outlierPlot"), api_card_create(s, "qc_pca_tab-outlierPlot", instanceId = ref_id))
parity("outlierPlot create", render, api_card_render(s, ref_id, 620, reference_card$plotHeight %||% 450L), s$cards[[id]], reference_card)
# 1b. Another QC card never draws the outlier plot it does not show.
id <- "tcinstance_dcboxplot"; node <- paste0(id, "-boxplotAfterNorm")
created <- count_op(id, node, api_card_create(s, "qc_pca_tab-boxplotAfterNorm", instanceId = id))
check(created$own == 1L && !length(created$others), "create qc_pca_tab-boxplotAfterNorm draws its own plot once and no other",
  sprintf("create qc_pca_tab-boxplotAfterNorm drew its plot %d times and other plots: %s", created$own, others_text(created$others)))
for (x in c("tcinstance_dcoutlier", ref_id, id)) api_card_park(s, x)

# 2. Longitudinal: the module button draws the card's plot once and none of the family's four other plots.
id <- "tcinstance_dclongitudinal"; node <- paste0(id, "-macroclass_plot")
created <- count_op(id, node, api_card_create(s, "longitudinal_tab-macroclass_plot", instanceId = id))
check(!length(created$others), "create longitudinal_tab-macroclass_plot draws no other plot of its family",
  sprintf("create longitudinal_tab-macroclass_plot drew other plots: %s", others_text(created$others)))
pressed <- count_op(id, node, api_card_update(s, id, actions = "submit_longitudinal_btn"))
check(pressed$own == 1L && !length(pressed$others), "action submit_longitudinal_btn draws the card's plot once and no other",
  sprintf("action submit_longitudinal_btn drew the card's plot %d times and other plots: %s", pressed$own, others_text(pressed$others)))
render <- api_card_render(s, id, 620, 450)
ref_id <- "tcinstance_dclongitudinalref"; ref_node <- paste0(ref_id, "-macroclass_plot")
reference <- legacy(ref_node, {
  api_card_create(s, "longitudinal_tab-macroclass_plot", instanceId = ref_id)
  api_card_update(s, ref_id, actions = "submit_longitudinal_btn")
  api_card_render(s, ref_id, 620, 450)
})
parity("longitudinal action", render, reference, s$cards[[id]], s$cards[[ref_id]])
for (x in c(id, ref_id)) api_card_park(s, x)

# 3. Kept on purpose: a wanted plot still draws once per settling round of a PATCH, a replay or a restore with a
# recorded press. Holding it until the card settles (drawing it once, from the settled inputs) changes what a card
# shows wherever Team's plot reads an eventReactive or an isolate()d input for the first time: Team's species plot
# (8_structural_module.R speciesPlot_event <- eventReactive(input$updateSpecies), isolate(input$selectedDetails))
# would show the shifts right after "Initiate Structural Analysis", where Team (and Nexo before) shows nothing until
# "Load Species Plot". The counts are printed, not asserted; the species card must match the order before.
outcome <- function(expr) tryCatch(content(expr), error = function(e) paste("error:", conditionMessage(e)))
id <- "tcinstance_dcspeciespress"; node <- paste0(id, "-speciesPlotPlot")
api_card_create(s, "structural_tab-speciesPlotPlot", instanceId = id)
pressed <- count_op(id, node, api_card_update(s, id, actions = "runAnalysis"))
shown <- outcome(api_card_render(s, id, 620, 450))
ref_id <- "tcinstance_dcspeciespressref"
reference <- legacy(paste0(ref_id, "-speciesPlotPlot"), {
  api_card_create(s, "structural_tab-speciesPlotPlot", instanceId = ref_id)
  api_card_update(s, ref_id, actions = "runAnalysis")
  outcome(api_card_render(s, ref_id, 620, 450))
})
cat(sprintf("NOTE action runAnalysis on speciesPlotPlot drew its plot %d time(s); shows %s\n", pressed$own, substr(shown, 1, 60)))
check(identical(shown, reference), "species card after Initiate Structural Analysis alone shows what it showed before",
  sprintf("species card after Initiate alone changed: %s (before: %s)", substr(shown, 1, 60), substr(reference, 1, 60)))
saved_card <- function(instanceId, source, actions) {
  node_id <- paste0(instanceId, "-", sub("^.*?-", "", source))
  s$canvas$nodes[[length(s$canvas$nodes) + 1L]] <- list(kind = "plot", id = node_id,
    instance = list(id = instanceId, source = source, inputs = list()))
  if (!is.list(s$nexo)) s$nexo <- list()
  s$nexo$nodes[[node_id]] <- list(actions = as.list(actions))
  node_id
}
id <- "tcinstance_dcspeciesrestore"; node <- saved_card(id, "structural_tab-speciesPlotPlot", "runAnalysis")
restored <- count_op(id, node, outcome(api_card_render(s, id, 620, 450)))
ref_id <- "tcinstance_dcspeciesrestoreref"; ref_node <- saved_card(ref_id, "structural_tab-speciesPlotPlot", "runAnalysis")
reference <- legacy(ref_node, outcome(api_card_render(s, ref_id, 620, 450)))
cat(sprintf("NOTE restore of a saved speciesPlotPlot with a recorded runAnalysis drew its plot %d time(s)\n", restored$own))
check(identical(restored$value, reference), "restored species card with a recorded Initiate shows what it showed before",
  sprintf("restored species card changed: %s (before: %s)", substr(restored$value, 1, 60), substr(reference, 1, 60)))
for (x in c("tcinstance_dcspeciespress", "tcinstance_dcspeciespressref", id, ref_id)) api_card_park(s, x)

if (length(fails)) stop(sprintf("FAIL test_api_draw_counts: %d check(s) failed", length(fails)))
cat("PASS test_api_draw_counts\n")
