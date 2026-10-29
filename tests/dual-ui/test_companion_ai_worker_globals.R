# Exercise the actual future globals expression without enabling AI or a provider.
find_future_promise <- function(node) {
  if (!is.call(node) && !is.expression(node) && !is.pairlist(node)) return(NULL)
  if (is.call(node) && is.call(node[[1L]]) &&
      identical(paste(deparse(node[[1L]]), collapse = ""),
                "promises::future_promise")) return(node)
  for (i in seq_along(node)) {
    found <- tryCatch(find_future_promise(node[[i]]), error = function(e) NULL)
    if (!is.null(found)) return(found)
  }
  NULL
}

future_call <- find_future_promise(parse("R/companion_assistant.R"))
stopifnot(!is.null(future_call), !is.null(future_call[["globals"]]))
worker_env <- new.env(parent = globalenv())
source("R/companion_ai_provider.R", local = worker_env)
worker_env$cleanq <- "How do I use the results?"
worker_env$ctx <- list(step = 5L)
worker_globals <- eval(future_call[["globals"]], envir = worker_env)
stopifnot("companion_ai_available" %in% names(worker_globals))

run_offline <- function() {
  prior_flag <- Sys.getenv("LIPIDOMIC_COMPANION_AI", unset = NA_character_)
  prior_plan <- future::plan()
  on.exit({
    future::plan(prior_plan)
    if (is.na(prior_flag)) Sys.unsetenv("LIPIDOMIC_COMPANION_AI")
    else Sys.setenv(LIPIDOMIC_COMPANION_AI = prior_flag)
  }, add = TRUE)
  Sys.setenv(LIPIDOMIC_COMPANION_AI = "0")
  future::plan(future::multisession, workers = 2L)
  job <- future::future(
    companion_ai_complete(cleanq, ctx),
    globals = worker_globals, seed = FALSE)
  stopifnot(inherits(job, "MultisessionFuture"))
  result <- future::value(job)
  stopifnot(is.list(result), identical(result$ok, FALSE),
    identical(result$error, "AI guidance is disabled; the local guide remains available."))
}
run_offline()
cat("PASS: actual companion future globals resolve on a disabled, no-network multisession worker\n")
