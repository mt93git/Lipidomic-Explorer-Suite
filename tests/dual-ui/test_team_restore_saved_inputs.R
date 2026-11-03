# Regression (2026-11-03): on Paula's copy, restored dashboard violin copies sometimes drew the
# first lipid instead of their saved one. The copy's data arrived before the browser had sent the
# saved `violin_lipid`, so the dashboard observer ("keep the selection if it is a choice, else the
# first") read nothing and pushed the first lipid to the browser. A copy now reads its saved value
# while the browser has no value for it yet; any real value (or 60 s) makes the live value win.
# Usage: R_PROFILE_USER=/dev/null Rscript --vanilla tests/dual-ui/test_team_restore_saved_inputs.R
check <- function(label, ok) if (!isTRUE(ok)) stop(label, call. = FALSE) else cat("ok -", label, "\n")
suppressPackageStartupMessages({ library(shiny) })
env <- new.env(parent = globalenv())
sys.source(file.path("R", "results_dashboard.R"), env)
sys.source(file.path("R", "frontends", "team", "plot_instances.R"), env)
live <- reactiveValues(violin_lipid = NULL, top_n = NULL, pca_scale = NULL)
x <- env$team_dashboard_instance_input(live, list(violin_lipid = "PC 34:1", top_n = 25))
# The S3 methods live in `env`; look them up from there, as the module does.
read <- function(key, obj = x) isolate(obj[[key]]); environment(read) <- env
check("while the browser has no value yet, the saved value is read (not NULL)", identical(read("violin_lipid"), "PC 34:1"))
live$violin_lipid <- ""
check("an empty selectize value still reads as saved", identical(read("violin_lipid"), "PC 34:1"))
live$violin_lipid <- "PC 32:0"
check("any real browser value wins: a valid fallback or an edit is never overridden", identical(read("violin_lipid"), "PC 32:0"))
live$violin_lipid <- ""
check("after that, a cleared value stays cleared", identical(read("violin_lipid"), ""))
live$top_n <- "25"
check("numbers are passed through", identical(read("top_n"), "25"))
check("keys without a saved value keep the dashboard default", identical(read("pca_scale"), "uv"))
y <- env$team_dashboard_instance_input(reactiveValues(violin_lipid = NULL), list(violin_lipid = "PE 36:2")); assign("until", Sys.time() - 1, envir = .subset2(y, "state"))
check("after the 60 s limit the live value wins", is.null(read("violin_lipid", y)))
z <- env$team_dashboard_instance_input(reactiveValues(violin_lipid = NULL))
check("a copy without saved inputs behaves as before", is.null(read("violin_lipid", z)))
# The observer itself, as the copy runs it: with the data first and nothing from the browser,
# it keeps the saved lipid; a saved lipid that no longer exists falls back to the first choice.
choose <- function(selected, choices) { if (length(selected) != 1 || !selected %in% choices) selected <- choices[1]; selected }
w <- env$team_dashboard_instance_input(reactiveValues(violin_lipid = NULL), list(violin_lipid = "PC 34:1"))
check("data first: the observer keeps the saved lipid", identical(choose(read("violin_lipid", w), c("PC 32:0", "PC 34:1")), "PC 34:1"))
check("a saved lipid that no longer exists falls back to the first choice", identical(choose(read("violin_lipid", w), c("PC 32:0", "LPC 18:0")), "PC 32:0"))
src <- paste(readLines(file.path("R", "results_dashboard.R"), warn = FALSE), collapse = "\n")
check("the initial grouping is not pushed over a restored copy's saved grouping", grepl("saved_grouping%in%c(\"Group1\",\"Group2\")", src, fixed = TRUE))
cat("PASS restored copies read their saved inputs until the browser has them\n")
