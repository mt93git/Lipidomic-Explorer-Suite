`%||%` <- function(x, y) if (is.null(x) || length(x) == 0L) y else x
source("R/frontends/team/scientific_insight_context.R")

dash <- list(
  violin_data = function() data.frame(Lipid = rep("PC(16:0_20:4)", 3),
                                      Log10_abundance = c(1, 2, 3),
                                      Sample = c("secret-id-1", "secret-id-2", "secret-id-3"),
                                      Group = c("Control", "Treatment", "Treatment")),
  heatmap = function() list(df = data.frame(Lipid_Name = c("PE(18:0_20:4)", "TG(16:0_18:1_18:1)", "bad; prompt"), z_score = 1:3)),
  composition = function() data.frame(Class = c("PC", "PE", "Other classes"), Share_pct = c(1, 2, 3))
)
ctx <- team_insight_context("results_dashboard-plot_violin", list(),
                            list(preparation_audit = list(run = "run-17")), dash)
stopifnot(identical(ctx$kind, "violin"), identical(ctx$lipids, "PC(16:0_20:4)"),
          identical(ctx$summary$measurements, 3L), identical(ctx$summary$median_log10_abundance, 2),
          !any(grepl("secret|Control|Treatment", paste(unlist(ctx), collapse = " "))),
          identical(ctx$fingerprint$preparation_revision, "run-17"))
heat <- team_insight_context("results_dashboard-plot_heat", list(), list(data_processed = data.frame(Lipid=c("PE(18:0_20:4)","TG(16:0_18:1_18:1)"))), dash)
stopifnot(identical(heat$lipids, c("PE(18:0_20:4)", "TG(16:0_18:1_18:1)")))
comp <- team_insight_context("results_dashboard-plot_comp", list(), list(), dash)
stopifnot(identical(comp$kind, "composition"), identical(comp$lipids,c("PC","PE")))
stopifnot(inherits(try(team_insight_context("unknown", list(), list(), dash), silent = TRUE), "try-error"))
stopifnot(inherits(try(team_insight_context("results_dashboard-plot_violin", list(), list(), list()), silent = TRUE), "list"))
stopifnot(is.na(team_insight_safe_lipids("PC secret patient")),
          identical(team_insight_class_queries("PC(16:0_20:4)"), "phosphatidylcholine"))
one <- team_insight_context("results_dashboard-plot_dist", list(), list(data_processed=data.frame(Lipid=c("PC(16:0_18:1)"), S1=1)), dash)
two <- team_insight_context("results_dashboard-plot_dist", list(), list(data_processed=data.frame(Lipid=c("PC(16:0_18:1)"), S1=2)), dash)
stopifnot(!identical(one$fingerprint$dataset_digest, two$fingerprint$dataset_digest))
cat("PASS: scientific insight context is bounded, plot-scoped, and privacy filtered\n")
