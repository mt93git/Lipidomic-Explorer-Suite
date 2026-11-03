# Regression (2026-11-03): on Paula's copy, restored dashboard violin copies sometimes drew the
# first lipid instead of their saved one. The copy's data arrived before the browser had sent the
# saved `violin_lipid`, so the dashboard observer ("keep the selection if it is a choice, else the
# first") read nothing and pushed the first lipid to the browser. A copy now reads its saved value
# until the browser has reported it once; after that, or after 60 s, the live value wins.
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
check("before the browser reports it, the saved value is read (not NULL)", identical(read("violin_lipid"), "PC 34:1"))
live$violin_lipid <- "PC 32:0"  # the server's own default reaching the browser first
check("a different value before the saved one was reached still reads as saved", identical(read("violin_lipid"), "PC 34:1"))
live$violin_lipid <- "PC 34:1"
check("once the browser reports the saved value, it is the live value", identical(read("violin_lipid"), "PC 34:1"))
live$violin_lipid <- "LPC 18:0"
check("after that, the analyst's change wins", identical(read("violin_lipid"), "LPC 18:0"))
live$top_n <- "25"
check("numbers match their saved number", identical(read("top_n"), "25"))
check("keys without a saved value keep the dashboard default", identical(read("pca_scale"), "uv"))
y <- env$team_dashboard_instance_input(live, list(violin_lipid = "PE 36:2")); assign("until", Sys.time() - 1, envir = .subset2(y, "state"))
check("after the 60 s limit the live value wins", identical(read("violin_lipid", y), "LPC 18:0"))
z <- env$team_dashboard_instance_input(reactiveValues(violin_lipid = NULL))
check("a copy without saved inputs behaves as before", is.null(read("violin_lipid", z)))
cat("PASS restored copies read their saved inputs until the browser has them\n")
