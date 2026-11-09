# H8 stress: one session with 24 live cards from the catalog (synthetic fixture only).
# Measures create and render times, cache hits, a resize pass and RSS, with budgets.
# Machine-dependent wall-clock budgets: opt in with NEXO_API_PERF=1.
if (!identical(Sys.getenv("NEXO_API_PERF"), "1")) {
  cat("SKIP test_api_stress: set NEXO_API_PERF=1 to run timing budgets\n"); quit(status = 0)
}
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_stress: package", pkg, "not installed\n"); quit(status = 0)
}
diagnostics <- tempfile("api-stress-", fileext = ".log")
cat("Diagnostics:", diagnostics, "\n")
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
sink(diagnostics)
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_stress")
source("frontends/nexo-api/engine.R")
sink()
target <- as.integer(Sys.getenv("NEXO_STRESS_CARDS", "24"))
timed <- function(expr) { t <- proc.time()[["elapsed"]]; value <- force(expr); list(value = value, s = proc.time()[["elapsed"]] - t) }
q <- function(x, p) unname(stats::quantile(x, p))
fmt <- function(x) sprintf("median %.2fs p95 %.2fs max %.2fs total %.1fs", stats::median(x), q(x, 0.95), max(x), sum(x))

rss0 <- api_rss_mb()
sink(diagnostics, append = TRUE)
opened <- timed(api_session_for_checkpoint("tests/dual-ui/fixtures/classic-seed7-synthetic.zip"))
sink()
s <- opened$value
api_design(s, "Animal", "independent", TRUE)
cat(sprintf("INFO open %.1fs RSS %.0f -> %.0f MB\n", opened$s, rss0, api_rss_mb()))

cards <- list(); create_s <- numeric(); render_s <- numeric(); rss <- numeric(); skipped <- character()
for (entry in api_catalog()) {
  if (length(cards) >= target) break
  if (identical(entry$needs, "time")) next
  sink(diagnostics, append = TRUE)
  out <- tryCatch({
    created <- timed(api_card_create(s, entry$id))
    if (entry$id %in% c("structural_tab-summaryPlot", "structural_tab-speciesPlotPlot"))
      api_card_update(s, created$value$instanceId, actions = "runAnalysis")
    rendered <- timed(api_card_render(s, created$value$instanceId, 620, 720))
    list(card = created$value, id = entry$id, render = entry$render, c = created$s, r = rendered$s)
  }, error = function(e) { skipped <<- c(skipped, entry$id); NULL })
  sink()
  if (is.null(out)) next
  cards[[length(cards) + 1L]] <- out
  create_s <- c(create_s, out$c); render_s <- c(render_s, out$r); rss <- c(rss, api_rss_mb())
}
kinds <- table(vapply(cards, `[[`, "", "render"))
stopifnot(length(cards) == target, length(kinds) >= 2L)
cat(sprintf("PASS stress %d cards [%s] (%d catalog entries gated by the module and skipped)\n",
  length(cards), paste(names(kinds), kinds, sep = "=", collapse = " "), length(skipped)))
cat(sprintf("INFO create %s\n", fmt(create_s)))
slow <- order(create_s, decreasing = TRUE)[1:3]
cat(sprintf("INFO slowest creates: %s\n", paste(sprintf("%s %.1fs", vapply(cards[slow], `[[`, "", "id"), create_s[slow]), collapse = ", ")))
cat(sprintf("INFO lazy outputs %s: %d gated plot outputs, %d skipped runs\n",
  if (identical(Sys.getenv("LIPIDOMIC_API_LAZY_OUTPUTS", "1"), "0")) "off" else "on", length(ls(s$lazy$gates)), s$lazy$skipped))
cat(sprintf("INFO first render 620x720 %s\n", fmt(render_s)))

sink(diagnostics, append = TRUE)
again <- vapply(cards, function(x) { r <- timed(api_card_render(s, x$card$instanceId, 620, 720)); if (!isTRUE(r$value$cached)) NA_real_ else r$s }, 0)
resized <- vapply(cards, function(x) timed(api_card_render(s, x$card$instanceId, 700, 760))$s, 0)
sink()
stopifnot(!anyNA(again), sum(again) < 1)
cat(sprintf("PASS cached pass %d/%d hits total %.3fs\n", length(again), length(cards), sum(again)))
cat(sprintf("INFO resize pass 700x760 %s\n", fmt(resized)))

peak <- max(rss, api_rss_mb())
cat(sprintf("INFO RSS open %.0f MB, after %d cards %.0f MB, peak %.0f MB; cache %.1f MB\n",
  rss0, length(cards), api_rss_mb(), peak, api_render_cache_bytes(s) / 2^20))
stopifnot(q(render_s, 0.95) < 6, q(resized, 0.95) < 6, peak < api_rss_soft_mb())
cat(sprintf("PASS budgets: render p95 < 6 s, resize p95 < 6 s, peak RSS under the %.0f MB soft guard\n", api_rss_soft_mb()))
api_session_close(s)
