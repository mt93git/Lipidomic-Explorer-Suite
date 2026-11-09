# H7a: render cache per session and the RSS memory guard. Synthetic fixture only.
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_cache: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_cache")
source("frontends/nexo-api/engine.R")
local({
  fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  png <- api_card_create(s, "qc_pca_tab-boxplotAfterNorm")
  plotly <- api_card_create(s, "results_dashboard-plot_pca")
  flushes <- 0L
  trace_flush <- function() flushes <<- flushes + 1L
  timed <- function(expr) { t <- proc.time()[["elapsed"]]; value <- force(expr); list(value = value, s = proc.time()[["elapsed"]] - t) }

  # 1. A repeated render with nothing changed is served from the cache: no flush, same bytes.
  for (card in list(png, plotly)) {
    first <- timed(api_card_render(s, card$instanceId, 620, 600))
    flushes <- 0L; s$on_flush <- trace_flush
    again <- timed(api_card_render(s, card$instanceId, 620, 600))
    s$on_flush <- NULL
    stopifnot(flushes == 0L, identical(again$value$png, first$value$png),
      identical(api_canonical_json(again$value$figure), api_canonical_json(first$value$figure)),
      isTRUE(again$value$cached), !isTRUE(first$value$cached))
    cat(sprintf("PASS cache hit %s %s first %.2fs hit %.3fs\n", card$render, card$source, first$s, again$s))
  }
  # 1b. H8: adding another card bumps only that card's epoch; the others stay cached.
  third <- api_card_create(s, "qc_pca_tab-pca2dPlot")
  stopifnot(isTRUE(api_card_render(s, png$instanceId, 620, 600)$cached),
    isTRUE(api_card_render(s, plotly$instanceId, 620, 600)$cached))
  cat("PASS cache survives adding another card\n")
  # 1c. H8 lazy outputs: sibling plot outputs of a card's family module wait behind a gate
  # (Team's browser computes only visible outputs); the card's own output still renders.
  if (!identical(Sys.getenv("LIPIDOMIC_API_LAZY_OUTPUTS", "1"), "0")) {
    gates <- ls(s$lazy$gates)
    siblings <- gates[startsWith(gates, paste0(third$instanceId, "-")) & gates != third$nodeId]
    stopifnot(length(siblings) > 0L, s$lazy$skipped > 0L,
      all(vapply(siblings, function(g) !isTRUE(shiny::isolate(s$lazy$gates[[g]]())), logical(1))),
      length(api_card_render(s, third$instanceId, 620, 600)$png) > 8L)
    cat(sprintf("PASS lazy outputs: %d sibling plot outputs gated for one card, %d skipped runs in the session\n",
      length(siblings), s$lazy$skipped))
  }
  # 1d. H8: seeding and schema reads never run a card's download handlers.
  outs <- names(s$mock$.__enclos_env__$private$outs)
  downloads <- Filter(function(n) startsWith(n, paste0(third$instanceId, "-")) &&
    s$mock$.__enclos_env__$private$file_generators$has(s$mock$ns(n)), outs)
  stopifnot(length(downloads) > 0L, !any(downloads %in% api_rendered_output_names(s, third$instanceId)))
  cat(sprintf("PASS seeding skips %d download handlers of a card\n", length(downloads)))
  # 2. A new size, a changed input or a design change is a miss.
  stopifnot(!isTRUE(api_card_render(s, png$instanceId, 700, 600)$cached))
  api_card_update(s, plotly$instanceId, list(top_n = 20L))
  stopifnot(!isTRUE(api_card_render(s, plotly$instanceId, 620, 600)$cached))
  stopifnot(isTRUE(api_card_render(s, plotly$instanceId, 620, 600)$cached))
  api_design(s, "participant", "independent", TRUE)
  stopifnot(!isTRUE(api_card_render(s, plotly$instanceId, 620, 600)$cached))
  cat("PASS cache misses on size, input and design changes\n")
  # The legacy dashboard route re-sends every saved input on each render: unchanged values
  # must not count as a change (no epoch bump, cache hit).
  api_dashboard_v0_card(s, "violin")
  stopifnot(!isTRUE(api_card_render(s, "tcinstance_v0_violin", 620, 600)$cached))
  api_dashboard_v0_card(s, "violin")
  stopifnot(isTRUE(api_card_render(s, "tcinstance_v0_violin", 620, 600)$cached))
  cat("PASS legacy dashboard re-render with the same saved inputs is a cache hit\n")
  # 3. The cache is bounded (bytes) and dropped with the session.
  stopifnot(api_render_cache_bytes(s) > 0, api_render_cache_bytes(s) <= api_render_cache_limit())
  cat(sprintf("PASS cache bounded %.1f KB of %.0f MB\n", api_render_cache_bytes(s) / 1024, api_render_cache_limit() / 2^20))

  # 4. 50 uncached renders: p95 under 3 s, RSS stable (< +100 MB after the first ten).
  times <- numeric(); rss <- numeric()
  for (i in seq_len(50L)) {
    card <- if (i %% 2L) png else plotly
    times[i] <- timed(api_card_render(s, card$instanceId, 600 + 8L * i, 560))$s
    rss[i] <- api_rss_mb()
  }
  p95 <- unname(stats::quantile(times, 0.95))
  growth <- if (all(is.na(rss))) 0 else max(rss[11:50]) - rss[10]
  stopifnot(p95 < 3, growth < 100)
  cat(sprintf("PASS 50 renders p95 %.2fs median %.2fs RSS %.0f->%.0f MB\n", p95, stats::median(times), rss[10], max(rss[11:50])))

  # 5. Memory guard: soft limit closes the least recently used other session and clears
  #    caches; hard limit asks systemd for a restart (quit status 3, injected here).
  other <- api_session_for_checkpoint(fixture)  # s is dirty (cards), so this is a second session
  stopifnot(!identical(other$sessionId, s$sessionId), length(ls(api_sessions)) == 2L)
  other$last_used <- Sys.time() - 600; s$last_used <- Sys.time()
  quit_status <- NULL
  api_memory_guard(rss = 100, current = s, quit = function(status) quit_status <<- status)
  stopifnot(length(ls(api_sessions)) == 2L, is.null(quit_status), api_render_cache_bytes(s) > 0)
  api_memory_guard(rss = api_rss_soft_mb() + 1, current = s, quit = function(status) quit_status <<- status)
  stopifnot(length(ls(api_sessions)) == 1L, isTRUE(other$closed), !isTRUE(s$closed),
    api_render_cache_bytes(s) == 0, is.null(quit_status))
  api_memory_guard(rss = api_rss_hard_mb() + 1, current = s, quit = function(status) quit_status <<- status)
  stopifnot(identical(quit_status, 3L))
  cat(sprintf("PASS memory guard soft %d MB evicts LRU + clears caches, hard %d MB quits 3\n", api_rss_soft_mb(), api_rss_hard_mb()))
})
