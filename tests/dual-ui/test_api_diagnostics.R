# Nexo Diagnostics (frontends/nexo-api/diagnostics.R): the attractor landscape of a lipid profile after Shin et al.
# 2025 on synthetic data only. Checks the paper's quantities (effective distance, attractor entropy, aberrance score),
# that the reference and target groups land on their own attractors, that an optional ordering column is used and
# never required, and that the metadata tests see a planted association.
for (pkg in c("igraph")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_diagnostics: package", pkg, "not installed\n"); quit(status = 0)
}
source("frontends/nexo-api/diagnostics.R")
fail <- function(...) stop(paste0("FAIL ", ...), call. = FALSE)
check <- function(ok, ...) if (!isTRUE(ok)) fail(...)

# ---- effective distance and the aberrance score formula (Shin et al. eq. 4 and 5) ----------------------------
vn <- c(0, 0, 0); vc <- c(1, 1, 1)
check(abs(dx_deff(c(0, 0, 0), vn, vc)) < 1e-12, "d_eff of the reference attractor is 0")
check(abs(dx_deff(c(1, 1, 1), vn, vc) - 1) < 1e-12, "d_eff of the target attractor is 1")
check(abs(dx_deff(c(1, 0, 1), vn, vc) - 2 / 3) < 1e-12, "d_eff is the projection on the reference -> target axis")

# ---- a two-attractor toggle: A inhibits B, B inhibits A ------------------------------------------------------
toggle <- list(list(inputs = 2L, signs = -1, op = "OR", self = FALSE), list(inputs = 1L, signs = -1, op = "OR", self = FALSE))
space <- dx_space(toggle, 2L, c(1, 0), c(0, 1))
fixed_points <- Filter(function(a) !a$cyclic, space$attractors)
check(length(fixed_points) == 2L, "the toggle switch has two point attractors (got ", length(fixed_points), ")")
d <- sort(vapply(fixed_points, `[[`, numeric(1), "deff"))
check(all(abs(d - c(0, 1)) < 1e-12), "the toggle's point attractors sit at d = 0 and d = 1")
check(abs(sum(vapply(space$attractors, `[[`, numeric(1), "basin")) - 1) < 1e-12, "basins cover the whole state space")
# Fixing A high removes the B-high attractor: the score falls to the reference side.
pert <- dx_space(toggle, 2L, c(1, 0), c(0, 1), fixed = list(`1` = 1))
check(length(pert$attractors) == 1L && abs(pert$attractors[[1]]$deff) < 1e-12, "fixing A high leaves only the reference attractor")
check(pert$score < 1e-12, "the aberrance score of a landscape with only the reference attractor is 0")

# ---- the whole analysis on a synthetic cohort ----------------------------------------------------------------
set.seed(20261118)
n_per <- 14L; groups <- rep(c("Healthy", "Transition", "Disease"), each = n_per)
progress <- c(runif(n_per, 0, 0.3), runif(n_per, 0.3, 0.7), runif(n_per, 0.7, 1))
lipids <- sprintf("PC(%d:%d)", 30 + 1:40, 1:40 %% 6)
up <- 1:6; down <- 7:12
x <- matrix(rnorm(length(groups) * length(lipids), 0, 0.4), length(groups), dimnames = list(sprintf("S%02d", seq_along(groups)), lipids))
x[, up] <- x[, up] + 2.5 * progress; x[, down] <- x[, down] - 2.5 * progress
age <- round(30 + 30 * progress + rnorm(length(groups), 0, 4))
metadata <- data.frame(.sample = rownames(x), Condition = groups, Age = age, Site = rep(c("North", "South"), length.out = length(groups)),
  Pseudotime = progress, Subject_ID = sprintf("P%02d", seq_along(groups)), stringsAsFactors = FALSE)
r <- dx_landscape(x, metadata, "Condition", "Healthy", "Disease", n_nodes = 8L, cut = 0.5)
check(r$params$ordering == "axis", "without an ordering column the reference -> target axis orders the samples")
check(r$params$nodes == 8L && all(vapply(r$network$nodes, `[[`, character(1), "name") %in% lipids[1:12]), "the network nodes are the planted lipids")
check(length(r$attractors) >= 2L, "the landscape has a reference and a target attractor")
labels <- vapply(r$attractors, `[[`, character(1), "label")
check("Healthy" %in% labels && "Disease" %in% labels, "the attractors nearest d = 0 and d = 1 carry the group names")
check(r$score >= 0 && r$score <= 1, "the aberrance score lies in [0, 1]")
d_init <- vapply(r$samples, `[[`, numeric(1), "dInit")
check(stats::median(d_init[groups == "Disease"]) > stats::median(d_init[groups == "Transition"]) &&
  stats::median(d_init[groups == "Transition"]) > stats::median(d_init[groups == "Healthy"]), "samples order Healthy < Transition < Disease on d_eff")
auc <- Filter(function(g) g$group == "Disease", r$diagnostic)[[1]]$aucInit
check(auc > 0.9, "d_eff separates Disease from Healthy (AUC ", round(auc, 2), ")")
check(length(r$perturbations$single) == 2L * 8L, "every lipid is fixed low and high")
check(length(r$perturbations$double) == choose(5L, 2L), "pairs of the five most effective single perturbations")
best <- min(vapply(r$perturbations$single, `[[`, numeric(1), "score"))
check(best <= r$score + 1e-12, "the most effective perturbation does not raise the aberrance score")
tests <- setNames(r$metadata, vapply(r$metadata, `[[`, character(1), "column"))
check(!is.null(tests$Age) && tests$Age$kind == "numeric" && tests$Age$statistic > 0.5 && tests$Age$p < 0.001, "the planted Age association is found")
check(!is.null(tests$Site) && tests$Site$p > 0.01, "an unrelated column is not significant")
check(is.null(tests$Subject_ID), "identifier columns are not tested")
# An ordering column (pseudotime) is used when given.
r2 <- dx_landscape(x, metadata, "Condition", "Healthy", "Disease", ordering_column = "Pseudotime", n_nodes = 8L, cut = 0.5)
check(r2$params$ordering == "Pseudotime", "a numeric ordering column replaces the axis")
# ---- acquisition order: checked when a column records it, and said when none does -----------------------------
check(any(grepl("No run-order or batch column", r$warnings)), "without a run-order column the landscape says drift was not checked")
drift <- list(list(column = "Injection_Position", kind = "numeric", statistic = 0.8, p = 1e-6, fdr = 1e-5),
  list(column = "Plate", kind = "categorical", statistic = 12, p = 1e-4, fdr = 0.002), list(column = "Age", kind = "numeric", statistic = 0.7, p = 1e-5, fdr = 1e-4))
w <- dx_acquisition_warnings(c("Injection_Position", "Plate", "Age"), drift)
check(length(w) == 2L && grepl("Injection_Position", w[[1]]) && grepl("Plate", w[[2]]), "an injection position and a plate that follow d_eff are both flagged, Age is not")
check(!length(dx_acquisition_warnings(c("RunOrder", "Age"), list(list(column = "RunOrder", kind = "numeric", statistic = 0.1, p = 0.5, fdr = 0.6)))),
  "a run order unrelated to d_eff raises nothing")
check(any(grepl("No run-order", dx_acquisition_warnings(c("Platelets", "Platelets_group", "Disorder"), list()))),
  "column names that only contain a word (Platelets, Disorder) are not run-order columns")
check(!length(dx_acquisition_warnings(c("RunOrder", "batchID"), list())), "camel-case run-order and batch names are recognised")
check(isTRUE(all.equal(unname(vapply(r2$samples, `[[`, numeric(1), "order")), metadata$Pseudotime)), "samples carry the ordering column's values")
# Too few samples in a group is refused with a message, not a crash.
refused <- tryCatch(dx_landscape(x[1:20, ], metadata[1:20, ], "Condition", "Healthy", "Disease"), error = function(e) conditionMessage(e))
check(is.character(refused) && grepl("at least three", refused), "a target group with under three samples is refused")
cat("PASS test_api_diagnostics\n")
