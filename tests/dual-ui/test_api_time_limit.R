# Nested request time limits (session.R). api_guard and api_flush each bound a request at 120 s with
# setTimeLimit; when one ran inside the other, the inner on.exit cleared the limit (Inf) and the outer call
# lost its deadline (a 76-species violin card kept a request busy > 10 min), and the inner call restarted the
# clock. A nested call must keep the outer deadline: it may shorten it, never extend or clear it.
# No app: sources session.R only (needs shiny and later). The limit is 2 s here (option nexo.api.time_limit).
#   Rscript tests/dual-ui/test_api_time_limit.R
for (pkg in c("shiny", "later", "jsonlite"))
  if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP test_api_time_limit:", pkg, "not installed\n"); quit(status = 0) }
failures <- 0L
check <- function(name, ok, detail = "") {
  if (isTRUE(ok)) cat("PASS", name, "\n") else { failures <<- failures + 1L; cat("FAIL", name, detail, "\n") }
}
local({
  source("frontends/nexo-api/session.R", local = TRUE)
  options(nexo.api.time_limit = 2)
  now <- function() proc.time()[["elapsed"]]
  session <- function() { s <- new.env(); s$broken <- FALSE; s }
  # Short sleeps up to `cap` seconds; returns how long it ran (stops early only by an error).
  busy <- function(cap = 6) { t0 <- now(); while (now() - t0 < cap) Sys.sleep(0.05); now() - t0 }
  # Runs f(); returns the elapsed seconds and the condition class it ended with ("none" when it returned).
  timed <- function(f) {
    t0 <- now()
    cls <- tryCatch({ f(); "none" }, error = function(e) class(e)[[1L]])
    list(elapsed = now() - t0, class = cls)
  }
  fmt <- function(r) sprintf("(class=%s elapsed=%.2fs)", r$class, r$elapsed)

  # 1. Guard inside guard: the inner call returns quickly; the outer deadline still stops the outer loop.
  outer <- session(); inner <- session()
  r <- timed(function() api_guard(outer, { api_guard(inner, 1L); busy() }))
  check("nested guard keeps the outer deadline",
    identical(r$class, "session_lost") && r$elapsed > 1.5 && r$elapsed < 3.5 && isTRUE(outer$broken) &&
      !isTRUE(inner$broken), fmt(r))

  # 2. Guard inside a flush (Team code run during a flush reads through api_guard): same rule for api_flush.
  outer <- session(); inner <- session()
  outer$bus <- list(queue = list(), drain_echo = function(mock) character())
  outer$mock <- list(flushReact = function() NULL)
  outer$on_flush <- function() { api_guard(inner, 1L); busy() }
  r <- timed(function() api_flush(outer, max = 1L))
  check("guard inside flush keeps the flush deadline",
    identical(r$class, "session_lost") && r$elapsed > 1.5 && r$elapsed < 3.5 && isTRUE(outer$broken), fmt(r))

  # 3. The inner call cannot extend the outer deadline: it starts 1.2 s into the outer call and runs long;
  #    it must stop at the outer deadline (~2 s), not at its own start + 2 s (~3.2 s).
  outer <- session(); inner <- session()
  r <- timed(function() api_guard(outer, { Sys.sleep(1.2); api_guard(inner, busy()) }))
  check("inner guard cannot extend the outer deadline",
    identical(r$class, "session_lost") && r$elapsed > 1.5 && r$elapsed < 2.8 && isTRUE(inner$broken), fmt(r))

  # 4. The outermost call clears the limit when it returns (no deadline leaks past the request).
  r <- timed(function() { api_guard(session(), 1L); busy(2.5) })
  check("outermost guard clears the limit on exit", identical(r$class, "none") && r$elapsed >= 2.5, fmt(r))
})
if (failures) quit(status = 1)
