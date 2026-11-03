# Regression: a Team canvas copy of the dashboard PCA rendered before the browser
# had bound its `pca_scale` select, so the production pca_data reactive read NULL:
# `data.frame(..., Scaling = NULL)` failed ("arguments imply differing number of
# rows: 8, 1, 0") and `identical(NULL, "uv")` would have meant centered-only.
# Team now supplies the dashboard's own UI default until the control is bound.
# Usage: R_PROFILE_USER=/dev/null Rscript --vanilla tests/dual-ui/test_team_dashboard_pca_scale_default.R [results_dashboard.R]
args <- commandArgs(trailingOnly = TRUE)
dashboard_file <- if (length(args)) args[[1L]] else file.path("R", "results_dashboard.R")
check <- function(label, ok) if (!isTRUE(ok)) stop(label, call. = FALSE) else cat("ok -", label, "\n")
suppressPackageStartupMessages({ library(shiny) })
source(file.path("tests", "integration", "helpers.R"), local = TRUE)

env <- new.env(parent = globalenv())
sys.source(dashboard_file, env)
sys.source(file.path("R", "frontends", "team", "plot_instances.R"), env)

# 1. The default is read from the existing control, not restated by Team.
defaults <- env$team_dashboard_input_defaults()
check("Team reads the dashboard PCA scaling default from results_dashboard_ui", identical(defaults, list(pca_scale = "uv")))
src <- paste(readLines(dashboard_file, warn = FALSE), collapse = "\n")
check("that default is the dashboard's first (selected) scaling choice",
      grepl('selectInput(ns("pca_scale"), "PCA scaling", c("Unit variance" = "uv", "Centered only" = "none")', src, fixed = TRUE))
team_src <- paste(readLines(file.path("R", "frontends", "team", "plot_instances.R"), warn = FALSE), collapse = "\n")
check("dashboard copies are served through the defaulting input",
      grepl("results_dashboard_module_server(team_dashboard_instance_input(input,value$inputs),output,session,dashboard_data)", team_src, fixed = TRUE))

# 2. The production pca_data reactive on the synthetic fixture.
fixture <- utils::read.csv(file.path("tests", "browser", "ci", "fixtures", "abundance.csv"), check.names = FALSE, stringsAsFactors = FALSE)
x <- as.matrix(fixture[, -1L]); storage.mode(x) <- "double"; rownames(x) <- fixture[[1L]]
groups <- rep(c("Control", "Treatment"), each = 4L)
pca_with <- function(input) {
  e <- new.env(parent = env)
  e$input <- input
  e$base <- function() list(mat = x, log = { l <- x; l[!is.finite(l) | l <= 0] <- NA; log10(l) })
  e$sample_info <- function() list(group = groups, levels = unique(groups))
  eval(find_assignment(parse(dashboard_file), "pca_data"), e)
  tryCatch(shiny::isolate(e$pca_data()), error = function(err) err)
}
unbound <- pca_with(shiny::reactiveValues(pca_transform = NULL, pca_scale = NULL))
check("an unbound pca_scale broke the original reactive (the reported failure)",
      inherits(unbound, "error") && grepl("differing number of rows", conditionMessage(unbound)))
bound_uv <- pca_with(shiny::reactiveValues(pca_transform = NULL, pca_scale = "uv"))
copy_unbound <- pca_with(env$team_dashboard_instance_input(shiny::reactiveValues(pca_transform = NULL, pca_scale = NULL)))
check("the Team copy computes before its control is bound", !inherits(copy_unbound, "error"))
check("that PCA uses unit-variance scaling", identical(copy_unbound$df$Scaling[[1L]], "uv") && isTRUE(copy_unbound$pc$scale[[1L]] != FALSE))
check("and is byte-identical to the PCA with the bound default control",
      identical(serialize(copy_unbound, NULL, version = 2L), serialize(bound_uv, NULL, version = 2L)))
bound_none <- pca_with(shiny::reactiveValues(pca_transform = NULL, pca_scale = "none"))
copy_none <- pca_with(env$team_dashboard_instance_input(shiny::reactiveValues(pca_transform = NULL, pca_scale = "none")))
check("a bound user choice is passed through unchanged",
      identical(copy_none$df$Scaling[[1L]], "none") && identical(serialize(copy_none, NULL, version = 2L), serialize(bound_none, NULL, version = 2L)))
# S3 methods are found from the environment the app sources them into.
reads <- evalq(local({
  copy_input <- team_dashboard_instance_input(shiny::reactiveValues(top_n = NULL))
  shiny::isolate(list(top_n = copy_input$top_n, pca_transform = copy_input[["pca_transform"]], pca_scale = copy_input[["pca_scale"]]))
}), env)
check("only pca_scale receives a default; other unbound controls stay NULL",
      is.null(reads$top_n) && is.null(reads$pca_transform) && identical(reads$pca_scale, "uv"))
cat("PASS: Team dashboard copies use the dashboard's PCA scaling default until its control is bound\n")
