# Shiny bridge and checkpoint contract for Team Canvas violin statistics. The
# copy is a real results_dashboard module; the bridge must test its drawn values.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a, b) if (is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source("R/sample_metadata_import.R"); source("R/results_dashboard.R")
source("R/frontends/team/scientific_insight_context.R"); source("R/frontends/team/violin_statistics.R")
source("R/frontends/team/plot_instances.R"); source("R/frontends/team/canvas_state.R")
fails <- function(expr) stopifnot(inherits(tryCatch({ force(expr); NULL }, error = identity), "error"))

df <- data.frame(Lipid = c("PC(34:1)", "PE(36:2)"), S1 = c(10, 50), S2 = c(12, 55), S3 = c(15, 0), S4 = c(-1, 60),
                 S5 = c(20, 70), S6 = c(25, 75), S7 = c(22, 80), S8 = c(30, 66), check.names = FALSE)
meta <- data.frame(FullName = names(df)[-1], Group1 = rep(c("A", "B"), each = 4), Group2 = "X",
                   PatientNumber = paste0("P", 1:8), stringsAsFactors = FALSE)
value <- function(x) { force(x); function(...) x }
allowed <- reactiveVal(TRUE)
prepared <- reactiveVal(df); metadata <- reactiveVal(meta)
hub <- list(data_processed = prepared, all_metadata = metadata,
  preparation_audit = value(list(normalization = "PQN", imputation = "No imputation")),
  preparation_dirty = value(FALSE), color_maps = value(list()),
  inference_allowed = function(paired = FALSE) !isTRUE(paired) && isTRUE(allowed()))
sent <- new.env(); sent$messages <- list()
capture <- list(sendCustomMessage = function(type, message) sent$messages[[length(sent$messages) + 1L]] <- list(type = type, message = message))
last <- function(type) { hits <- Filter(function(m) identical(m$type, type), sent$messages); if (length(hits)) hits[[length(hits)]]$message else NULL }
server <- function(input, output, session) {
  instances <- team_plot_instances_server(input, output, session, hub, hub)
  # A second bridge on a recording session; the registered one talks to the mock.
  team_violin_stats_server(input, capture, hub, function(id) {
    active <- environment(instances)$active
    if (exists(id, active, inherits = FALSE)) get(id, active) else NULL
  })
}
request <- function(id, mode, ...) list(requestId = id, instanceId = "tcinstance_stats", mode = mode, ...)
settings <- list(test = "welch", correction = "holm", scope = "displayed", comparisons = list(list("A", "B")), effect = "hedges_g")
testServer(server, {
  instances(list(id = "tcinstance_stats", source = "results_dashboard-plot_violin", inputs = list(violin_lipid = "PC(34:1)", color_by = "Group1")))
  session$setInputs(`tcinstance_stats-violin_lipid` = "PC(34:1)", `tcinstance_stats-color_by` = "Group1"); session$flushReact()
  stopifnot(isTRUE(last("team-violin-stats-policy")$allowed))

  session$setInputs(team_violin_stats_request = request("d1", "describe")); session$flushReact()
  d <- last("team-violin-stats")
  stopifnot(identical(d$requestId, "d1"), identical(d$status, "ok"), identical(d$describe$participantIds, "unique"),
            identical(vapply(d$describe$groups, `[[`, integer(1), "nSamples"), c(3L, 4L)))

  session$setInputs(team_violin_stats_request = request("a1", "apply", settings = settings)); session$flushReact()
  a <- last("team-violin-stats")
  drawn <- environment(instances)$active$tcinstance_stats$dashboard$violin_data()
  x <- drawn$Log10_abundance[drawn$Group == "A"]; y <- drawn$Log10_abundance[drawn$Group == "B"]
  stopifnot(identical(a$requestId, "a1"), identical(a$status, "ok"), identical(x, log10(c(10, 12, 15))),
            identical(a$result$rows[[1]]$p, t.test(y, x)$p.value), identical(a$result$rows[[1]]$pAdj, t.test(y, x)$p.value),
            identical(a$result$family$m, 1L), identical(a$result$lipid, "PC(34:1)"),
            identical(vapply(a$result$groups, `[[`, integer(1), "nParticipants"), c(3L, 4L)),
            identical(a$result$provenance$normalization, "PQN"))
  fingerprint <- a$result$dataFingerprint

  # The canvas checkpoint accepts exactly this server result for this copy.
  node <- list(id = "tcinstance_stats-plot_violin", label = "Violin", x = 0, y = 0, width = 620, height = 720, visual = list(),
    instance = list(id = "tcinstance_stats", source = "results_dashboard-plot_violin", inputs = list(violin_lipid = "PC(34:1)")),
    statistics = list(version = "1", applied = a$settings, result = a$result,
      presentation = list(show = TRUE, pValue = "adjusted", label = "both", fontSize = 12, spacing = 0.08, tip = 0.02, nDisplay = "both", hidden = list(list("A", "B")))))
  saved <- team_canvas_validate(list(version = "1", libraryHidden = FALSE, nodes = list(node)))
  round_trip <- team_canvas_validate(jsonlite::fromJSON(team_canvas_json(saved), simplifyVector = FALSE))
  stopifnot(isTRUE(all.equal(round_trip$nodes[[1]]$statistics$result$rows[[1]]$p, a$result$rows[[1]]$p, tolerance = 1e-14)),
            identical(round_trip$nodes[[1]]$statistics$presentation$hidden, list(c("A", "B"))))
  bad <- node; bad$statistics$presentation$hidden <- list(list("B", "Z")); fails(team_canvas_validate(list(version = "1", libraryHidden = FALSE, nodes = list(bad))))
  bad <- node; bad$statistics$result$rows[[1]]$pAdj <- a$result$rows[[1]]$p / 2; fails(team_canvas_validate(list(version = "1", libraryHidden = FALSE, nodes = list(bad))))
  bad <- node; bad$statistics$result$family$m <- 2; fails(team_canvas_validate(list(version = "1", libraryHidden = FALSE, nodes = list(bad))))
  bad <- node; bad$statistics$applied$effect <- "cliffs_delta"; fails(team_canvas_validate(list(version = "1", libraryHidden = FALSE, nodes = list(bad))))
  bad <- node; bad$id <- "tcinstance_stats-plot_pca"; bad$instance$source <- "results_dashboard-plot_pca"; fails(team_canvas_validate(list(version = "1", libraryHidden = FALSE, nodes = list(bad))))

  session$setInputs(team_violin_stats_request = request("c1", "check", dataFingerprint = fingerprint)); session$flushReact()
  stopifnot(identical(last("team-violin-stats")$status, "unchanged"))
  session$setInputs(team_violin_stats_request = request("v1", "verify", settings = a$settings, dataFingerprint = fingerprint)); session$flushReact()
  stopifnot(identical(last("team-violin-stats")$result$rows[[1]]$p, a$result$rows[[1]]$p))

  # Scientific changes invalidate: displayed lipid, prepared values, participant IDs.
  session$setInputs(`tcinstance_stats-violin_lipid` = "PE(36:2)"); session$flushReact()
  session$setInputs(team_violin_stats_request = request("c2", "check", dataFingerprint = fingerprint)); session$flushReact()
  stopifnot(identical(last("team-violin-stats")$status, "invalidated"))
  session$setInputs(`tcinstance_stats-violin_lipid` = "PC(34:1)"); session$flushReact()
  repeated <- meta; repeated$PatientNumber <- rep(paste0("P", 1:4), 2); metadata(repeated); session$flushReact()
  session$setInputs(team_violin_stats_request = request("c3", "check", dataFingerprint = fingerprint)); session$flushReact()
  stopifnot(identical(last("team-violin-stats")$status, "invalidated"))
  session$setInputs(team_violin_stats_request = request("a2", "apply", settings = settings)); session$flushReact()
  blocked <- last("team-violin-stats")
  stopifnot(identical(blocked$status, "blocked"), is.null(blocked$result), grepl("pseudoreplication", blocked$reason))
  metadata(meta); session$flushReact()

  # Withdrawing the design withdraws p-values and blocks new ones.
  allowed(FALSE); session$flushReact()
  stopifnot(identical(last("team-violin-stats-policy")$allowed, FALSE))
  session$setInputs(team_violin_stats_request = request("c4", "check", dataFingerprint = fingerprint)); session$flushReact()
  stopifnot(identical(last("team-violin-stats")$status, "blocked"))
  session$setInputs(team_violin_stats_request = request("a3", "apply", settings = settings)); session$flushReact()
  stopifnot(identical(last("team-violin-stats")$status, "blocked"))
  allowed(TRUE); session$flushReact()

  # Unknown or foreign copies and malformed requests return errors, not p-values.
  session$setInputs(team_violin_stats_request = list(requestId = "x1", instanceId = "tcinstance_missing", mode = "apply", settings = settings)); session$flushReact()
  stopifnot(identical(last("team-violin-stats")$status, "error"), is.null(last("team-violin-stats")$result))
  session$setInputs(team_violin_stats_request = request("x2", "apply", settings = c(settings, list(extra = 1)))); session$flushReact()
  stopifnot(identical(last("team-violin-stats")$status, "error"))
})
cat("PASS: violin statistics bridge tests the copy's drawn values, invalidates on scientific changes, blocks pseudoreplication and validates checkpoints\n")
