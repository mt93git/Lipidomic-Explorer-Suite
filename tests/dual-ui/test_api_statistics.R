if (!requireNamespace("xml2", quietly = TRUE)) { cat("SKIP test_api_statistics: package xml2 not installed\n"); quit(status = 0) }
for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_statistics")
source("frontends/nexo-api/engine.R")
source("frontends/nexo-api/statistics.R")
local({
  s <- api_session_open("tests/dual-ui/fixtures/classic-seed7-synthetic.zip")
  on.exit(api_session_close(s))
  stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
  violin <- api_card_create(s, "results_dashboard-plot_violin")
  id <- violin$instanceId
  described <- api_violin_stats(s, id, "describe")
  stopifnot(identical(described$status, "ok"), isTRUE(described$policy$allowed))
  cat("PASS stats describe\n")
  # Describe supplies groups, not pairs: declare every unordered pair, as the client does.
  groups <- vapply(described$describe$groups, `[[`, character(1), "group")
  stopifnot(length(groups) >= 2L)
  settings <- list(test = "welch", correction = "bh", scope = "displayed",
    comparisons = combn(groups, 2L, simplify = FALSE), effect = "hedges_g")
  applied <- api_violin_stats(s, id, "apply", settings)
  finite <- function(x) is.numeric(x) && length(x) == 1L && is.finite(x)
  stopifnot(identical(applied$status, "ok"), identical(applied$settings$correction, "BH"),
    any(vapply(applied$result$rows, function(r) finite(r$p) && finite(r$pAdj), logical(1))),
    !identical(applied$requestId, described$requestId))
  cat("PASS stats apply welch/bh\n")
  checked <- api_violin_stats(s, id, "check", settings, applied$result$dataFingerprint)
  stopifnot(checked$status %in% c("ok", "unchanged"))
  cat("PASS stats check\n")
  for (key in c("test", "correction", "scope", "effect", "comparisons", "unknown")) {
    wrong <- settings; wrong[[key]] <- "invalid"
    bad <- tryCatch(api_violin_stats(s, id, "apply", wrong), error = identity)
    stopifnot(inherits(bad, "api_bad_request"), grepl(key, conditionMessage(bad), fixed = TRUE))
  }
  stopifnot(inherits(tryCatch(api_violin_stats(s, id, "invalid"), error = identity), "api_bad_request"))
  cat("PASS stats 400\n")
  other <- api_card_create(s, "results_dashboard-plot_pca")
  bad <- tryCatch(api_violin_stats(s, other$instanceId, "describe"), error = identity)
  stopifnot(inherits(bad, "api_unprocessable"),
    identical(conditionMessage(bad), "Statistics are available for violin cards only"))
  cat("PASS stats violin-only\n")

  # Independent reference: prepared abundance -> positive finite values -> log10,
  # B versus A, two-sided unequal-variance t-test. All declared pairs count in BH.
  df <- api_read(s, s$shared$data_processed_allow_missing())
  meta <- api_read(s, s$shared$all_metadata())
  values <- as.numeric(unlist(df[match(applied$result$lipid, make.unique(as.character(df[[1L]]))), -1L], use.names = FALSE))
  group <- as.character(meta[[applied$result$grouping]][match(names(df)[-1L], meta$FullName)])
  group[is.na(group) | !nzchar(group)] <- "Unassigned"
  keep <- is.finite(values) & values > 0
  values <- log10(values[keep]); group <- group[keep]
  reference <- vapply(settings$comparisons, function(pair) {
    x <- values[group == pair[[1L]]]; y <- values[group == pair[[2L]]]
    if (length(x) < 2L || length(y) < 2L || (var(x) == 0 && var(y) == 0)) return(NA_real_)
    tryCatch(t.test(y, x, var.equal = FALSE)$p.value, error = function(e) NA_real_)
  }, numeric(1))
  adjusted <- p.adjust(reference, method = "BH", n = length(reference))
  valid <- which(is.finite(reference))
  stopifnot(length(valid) >= 1L)
  for (i in valid) stopifnot(abs(applied$result$rows[[i]]$p - reference[[i]]) < 1e-9,
    abs(applied$result$rows[[i]]$pAdj - adjusted[[i]]) < 1e-9)
  cat("PASS stats parity welch\n")

  comparison <- api_card_create(s, "group_comparison_tab-comparisonPlot")
  first <- api_group_comparison(s, comparison$instanceId)
  stopifnot(is.list(first), is.logical(first$requiresConfirmation))
  if (!is.null(first$confirmationToken)) {
    confirmed <- api_group_comparison(s, comparison$instanceId, first$confirmationToken)
    stopifnot(identical(confirmed$requiresConfirmation, FALSE), !is.null(confirmed$rows))
    cat("PASS group comparison confirm\n")
  } else if (identical(first$requiresConfirmation, FALSE)) {
    stopifnot(!is.null(first$rows))
    cat("PASS group comparison confirm\n")
  } else cat("SKIP group comparison fixture did not produce a confirmation token\n")
})
