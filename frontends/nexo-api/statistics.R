# Transport only: Team owns the policy, data selection and statistical computation.
api_violin_policy <- function(s) {
  api_alive(s)
  messages <- s$bus$messages("team-violin-stats-policy")
  if (length(messages)) tail(messages, 1L)[[1L]] else list(allowed = NA, reason = "unknown")
}

api_violin_settings <- function(settings, required = FALSE) {
  keys <- c("test", "correction", "scope", "comparisons", "effect")
  if (is.null(settings) && !required) return(NULL)
  api_card_inputs_validate(settings, keys)
  for (key in setdiff(keys, names(settings)))
    api_abort("api_bad_request", paste("Missing statistics setting:", key))
  choices <- list(test = team_violin_stats_tests, correction = c(team_violin_stats_corrections, "bh"),
    scope = team_violin_stats_scopes, effect = c("none", unname(team_violin_stats_effects)))
  for (key in names(choices)) {
    v <- settings[[key]]
    if (!is.character(v) || length(v) != 1L || is.na(v) || !v %in% choices[[key]])
      api_abort("api_bad_request", paste("Invalid statistics setting:", key))
  }
  if (identical(settings$correction, "bh")) settings$correction <- "BH"
  if (!settings$effect %in% c("none", team_violin_stats_effects[[settings$test]]))
    api_abort("api_bad_request", "Invalid statistics setting: effect does not match test")
  pairs <- settings$comparisons
  bad <- function() api_abort("api_bad_request", "Invalid statistics setting: comparisons")
  if (!is.list(pairs) || !is.null(names(pairs)) || !length(pairs) ||
      length(pairs) > team_violin_stats_limits$comparisons) bad()
  pairs <- lapply(pairs, function(pair) {
    if (!is.list(pair) && !is.character(pair)) bad()
    if (!is.null(names(pair))) {
      if (length(pair) != 2L || !setequal(names(pair), c("a", "b"))) bad()
      pair <- pair[c("a", "b")]
    }
    if (is.list(pair) && !all(vapply(pair, function(x)
      is.character(x) && length(x) == 1L && !is.na(x), logical(1)))) bad()
    pair <- unname(unlist(pair, use.names = FALSE))
    if (!is.character(pair) || length(pair) != 2L || anyNA(pair) || any(!nzchar(pair)) ||
        any(nchar(pair) > team_violin_stats_limits$label) || pair[[1L]] == pair[[2L]]) bad()
    pair
  })
  if (anyDuplicated(vapply(pairs, function(p) paste(sort(p), collapse = "\r"), character(1)))) bad()
  settings$comparisons <- pairs
  settings
}

api_violin_stats <- function(s, instanceId, mode, settings = NULL, dataFingerprint = NULL) {
  card <- tryCatch(api_card_get(s, instanceId), api_not_found = function(e)
    api_abort("api_unprocessable", "Statistics are available for violin cards only"))
  api_require(identical(card$source, "results_dashboard-plot_violin"),
    "Statistics are available for violin cards only")
  if (!is.character(mode) || length(mode) != 1L || is.na(mode) ||
      !mode %in% c("describe", "apply", "verify", "check"))
    api_abort("api_bad_request", "Invalid statistics mode")
  settings <- api_violin_settings(settings, mode %in% c("apply", "verify"))
  if (!is.null(dataFingerprint) || mode %in% c("verify", "check")) {
    if (!is.character(dataFingerprint) || length(dataFingerprint) != 1L || is.na(dataFingerprint) ||
        !grepl("^[a-f0-9]{64}$", dataFingerprint))
      api_abort("api_bad_request", "Invalid dataFingerprint")
  }
  s$statistics_counter <- (s$statistics_counter %||% 0) + 1
  requestId <- paste0("r", s$statistics_counter)
  replies <- function() Filter(function(x) identical(x$requestId, requestId),
    s$bus$messages("team-violin-stats"))
  api_inputs(s, team_violin_stats_request = list(requestId = requestId, instanceId = instanceId,
    mode = mode, settings = settings, dataFingerprint = dataFingerprint))
  api_flush(s, until = function() length(replies()) > 0L, max = 8L)
  messages <- replies()
  if (!length(messages)) api_abort("api_unavailable", "No Team violin statistics reply after 8 flushes")
  reply <- tail(messages, 1L)[[1L]]
  reply$policy <- api_violin_policy(s)
  reply
}

api_group_comparison <- function(s, instanceId, confirmationToken = NULL) {
  card <- api_card_get(s, instanceId)
  api_require(identical(card$source, "group_comparison_tab-comparisonPlot"),
    "Group comparison is available for group comparison cards only")
  if (!is.null(confirmationToken)) {
    if (!is.character(confirmationToken) || length(confirmationToken) != 1L ||
        is.na(confirmationToken) || !grepl("^[a-f0-9]{64}$", confirmationToken))
      api_abort("api_bad_request", "Invalid confirmationToken")
    api_session_dirty(s)
    do.call(api_inputs, c(list(s), stats::setNames(list(confirmationToken),
      paste0(instanceId, "-gc_baseline_confirmation"))))
  }
  api_flush(s)
  messages <- Filter(function(x) identical(x$id, instanceId), s$bus$messages("team-group-comparison-data"))
  if (length(messages)) tail(messages, 1L)[[1L]] else list(id = instanceId, requiresConfirmation = TRUE)
}
