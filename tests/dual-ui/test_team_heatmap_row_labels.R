# Synthetic data. Every heatmap row carries its own full lipid name: no thinning, no truncation.
source("R/frontends/team/results_dashboard.R")
check <- function(label, ok) { if (!isTRUE(ok)) stop("FAIL: ", label, call. = FALSE); cat("ok  ", label, "\n") }
rows <- function(n) sprintf("TAG(%d:1_FA16:1)+NH4 synthetic %d", 40L + seq_len(n), seq_len(n))
for (n in c(30L, 61L, 1362L)) {
  z <- matrix(seq_len(n * 3L) / n, n, 3L, dimnames = list(rows(n), c("A", "B", "C")))
  v <- rd_team_heatmap_view(z, c(6L, 6L, 18L))
  check(sprintf("%d rows: one tick per row", n), identical(unname(unlist(v$yaxis$tickvals)), rownames(z)))
  check(sprintf("%d rows: full names, never truncated", n), identical(unname(unlist(v$yaxis$ticktext)), rownames(z)))
  plot_px <- v$height - v$margin$t - v$margin$b
  check(sprintf("%d rows: each row is at least 12 px tall for its 10 px label", n), plot_px / n >= 12)
}
cat("all row-label checks passed\n")
src <- readLines("R/frontends/team/results_dashboard.R", warn = FALSE)
check("dashboard note no longer says labels may be thinned", !any(grepl("Labels may be thinned", src, fixed = TRUE)))
