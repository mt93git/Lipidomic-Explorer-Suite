# The group table of the PCA score card (R/frontends/team/results_dashboard.R rd_pca_score_figure,
# output$plot_pcascore) fits every group. With a fixed row step the rows of a 10-group study ran
# below the figure (paper y < 0) and only the first four showed, on Team and on Nexo (which renders
# this figure). The table now sizes itself from the number of groups; the colour dots stay on their
# rows; a study with up to four groups keeps the old layout. Presentation only: the medians and n
# in the table are the ones rd_pca_score_stats computed. Synthetic data only. ASCII only.
for (pkg in c("shiny", "plotly", "htmltools")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_pca_score_table_rows: package", pkg, "not installed\n"); quit(status = 0)
}
suppressPackageStartupMessages(library(shiny))
source("R/frontends/team/results_dashboard.R")
checks <- character()
check <- function(label, condition) { if (!isTRUE(condition)) stop(paste("FAIL:", label)); checks <<- c(checks, label) }

synthetic <- function(k) {
  lev <- paste0("Group_", LETTERS[seq_len(k)]); n <- 4L
  set.seed(20261120)
  group <- rep(lev, each = n); score <- rnorm(length(group), rep(seq_len(k), each = n), 0.4)
  res <- rd_pca_score_stats(score, group, test = "rank", correction = "BH")
  cols <- setNames(grDevices::hcl.colors(k), lev)
  list(r = list(res = res, k = 1L, ve = 41.2, score = score, group = group, sample = paste0(group, "_", seq_along(group)),
                levels = lev, colors = as.list(cols)), lev = lev, res = res)
}
table_of <- function(fig) {
  lay <- fig$x$layoutAttrs[[1]]
  ann <- Filter(function(a) identical(a$yref, "paper"), lay$annotations)
  proxies <- Filter(function(t) isTRUE(t$meta$teamLegendProxy), fig$x$attrs)
  list(lay = lay, ann = ann, proxies = proxies, ys = vapply(ann, `[[`, numeric(1), "y"))
}

for (k in c(10L, 16L)) {
  s <- synthetic(k); t <- table_of(rd_pca_score_figure(s$r))
  check(sprintf("%d groups: header + %d rows of three cells", k, k), length(t$ann) == 3L * (k + 1L))
  check(sprintf("%d groups: every table annotation has y >= 0", k), all(t$ys >= 0))
  dom <- t$lay$yaxis2$domain
  check(sprintf("%d groups: the table fits its own domain", k), all(t$ys <= dom[2]) && dom[1] == 0)
  check(sprintf("%d groups: the plot sits above the table", k), isTRUE(all.equal(t$lay$yaxis$domain[1], dom[2])))
  check(sprintf("%d groups: yaxis2 range equals its domain (proxy dots in paper units)", k), isTRUE(all.equal(unlist(t$lay$yaxis2$range), unlist(dom))))
  rows <- vapply(s$lev, function(g) { hit <- Filter(function(a) startsWith(a$text, paste0(g, " (n = ")), t$ann); hit[[1]]$y }, numeric(1))
  dots <- vapply(t$proxies, function(p) p$y, numeric(1)); names(dots) <- vapply(t$proxies, `[[`, "", "name")
  check(sprintf("%d groups: every group has a row and a colour dot", k), length(dots) == k && setequal(names(dots), s$lev))
  check(sprintf("%d groups: each colour dot sits on its row", k), isTRUE(all.equal(unname(dots[s$lev]), unname(rows))))
  check(sprintf("%d groups: rows are evenly spaced and in group order", k), all(diff(rows) < 0) && diff(range(diff(rows))) < 1e-9)
  med <- vapply(s$lev, function(g) { y <- rows[[g]]; Filter(function(a) a$y == y && a$x == 0.60, t$ann)[[1]]$text }, "")
  check(sprintf("%d groups: medians shown are rd_pca_score_stats' values", k), identical(unname(med), sprintf("%+.2f", unname(s$res$median[s$lev]))))
}

# Up to four groups: the layout the lab already uses, unchanged.
s <- synthetic(3L); t <- table_of(rd_pca_score_figure(s$r))
check("3 groups: table domain stays c(0, 0.28)", isTRUE(all.equal(unlist(t$lay$yaxis2$domain), c(0, 0.28))) && isTRUE(all.equal(unlist(t$lay$yaxis$domain), c(0.28, 1))))
check("3 groups: header at 0.215, rows 0.052 apart", isTRUE(all.equal(sort(unique(t$ys), decreasing = TRUE), 0.215 - 0.052 * 0:3)))

cat(sprintf("PASS %s\n", checks), sep = "")
cat(sprintf("test_pca_score_table_rows: %d checks passed\n", length(checks)))
