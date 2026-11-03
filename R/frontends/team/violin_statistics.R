# Team Canvas violin statistics. Independent copies of the Results dashboard
# violin may request group comparisons. Tests use exactly the values the violin
# draws: positive, finite prepared abundances on the log10 scale. Missing and
# nonpositive values stay excluded (and counted); nothing is imputed, averaged or
# paired here. Classic modules never call these helpers.

team_violin_stats_source <- "results_dashboard-plot_violin"
team_violin_stats_limits <- list(features = 5000L, comparisons = 45L, tests = 20000L, groups = 30L, label = 500L)
team_violin_stats_tests <- c("welch", "wilcoxon")
team_violin_stats_corrections <- c("holm", "BH", "bonferroni", "none")
team_violin_stats_scopes <- c("displayed", "all_in_scope")
# Optional descriptive effect-size summaries; Hedges g uses pooled SD, not the Welch statistic.
team_violin_stats_effects <- c(welch = "hedges_g", wilcoxon = "cliffs_delta")
team_violin_stats_missing_ids <- c("", "NA", "Unspecified", "Unknown")

team_violin_stats_fail <- function(message) {
  stop(structure(list(message = message, call = NULL),
    class = c("team_violin_stats_error", "error", "condition")))
}

# Mirrors results_dashboard base(): first column holds lipid names, made unique;
# missing group labels become "Unassigned". Participant IDs come only from the
# mapped PatientNumber field or Patient_ID fallback; placeholders are missing.
team_violin_stats_base <- function(df, meta, grouping) {
  if (!is.data.frame(df) || ncol(df) < 3L || nrow(df) < 2L) team_violin_stats_fail("Prepared data are not available.")
  mat <- as.matrix(df[, -1, drop = FALSE])
  storage.mode(mat) <- "double"
  rownames(mat) <- make.unique(as.character(df[[1]]))
  samples <- colnames(mat)
  field <- function(col) {
    if (is.data.frame(meta) && all(c("FullName", col) %in% names(meta)))
      as.character(meta[[col]][match(samples, meta$FullName)]) else rep(NA_character_, length(samples))
  }
  grouping <- if (identical(grouping, "Group2")) "Group2" else "Group1"
  group <- field(grouping)
  group[is.na(group) | !nzchar(group)] <- "Unassigned"
  participant_field <- "PatientNumber"
  participant <- trimws(field("PatientNumber"))
  primary_missing <- is.na(participant) | participant %in% team_violin_stats_missing_ids
  if (all(primary_missing)) { participant <- trimws(field("Patient_ID"));participant_field <- "Patient_ID" }
  participant[is.na(participant) | participant %in% team_violin_stats_missing_ids] <- NA_character_
  if(all(is.na(participant)))participant_field <- "unmapped"
  # Detect possible aliases conservatively; never merge or rewrite subject IDs.
  alias <- toupper(participant)
  numeric_id <- !is.na(alias) & grepl("^(P)?[0-9]+$", alias)
  alias[numeric_id] <- sub("^0+(?=[0-9])", "", sub("^P", "", alias[numeric_id]), perl=TRUE)
  ambiguous <- !is.na(alias) & vapply(seq_along(alias),function(i) length(unique(participant[!is.na(alias) & alias==alias[i]]))>1L,logical(1))
  list(mat = mat, samples = samples, group = group, participant = participant, participant_ambiguous=ambiguous, participant_field=participant_field, grouping = grouping)
}

team_violin_stats_frame <- function(base, lipid) {
  if (!is.character(lipid) || length(lipid) != 1L || is.na(lipid) || !lipid %in% rownames(base$mat))
    team_violin_stats_fail("The displayed lipid is not in the prepared data.")
  values <- as.numeric(base$mat[lipid, ])
  keep <- is.finite(values) & values > 0
  data.frame(Sample = base$samples[keep], Group = base$group[keep], Participant = base$participant[keep],
             Value = log10(values[keep]), stringsAsFactors = FALSE)
}

# The request is honoured only when the copy currently draws these exact values.
team_violin_stats_matches <- function(drawn, frame, lipid) {
  is.data.frame(drawn) && all(c("Sample", "Group", "Lipid", "Log10_abundance") %in% names(drawn)) &&
    nrow(drawn) == nrow(frame) && all(as.character(drawn$Lipid) == lipid) &&
    identical(as.character(drawn$Sample), frame$Sample) && identical(as.character(drawn$Group), frame$Group) &&
    identical(as.numeric(drawn$Log10_abundance), frame$Value)
}

team_violin_stats_groups <- function(base) setdiff(unique(base$group), "Unassigned")

# Independence check over every sample in the compared groups (all features).
# Repeated or partially missing IDs block testing; samples are never averaged.
team_violin_stats_participants <- function(base, groups) {
  if (!is.null(base$participant_ambiguous) && any(base$participant_ambiguous[base$group %in% groups]))
    return(list(status="ambiguous", reason="Participant identifiers have ambiguous case or numeric aliases. Review the metadata mapping before testing; no IDs were merged and no p-values were computed."))
  ids <- base$participant[base$group %in% groups]
  if ((!length(ids) || all(is.na(ids))) && identical(base$participant_field, "unmapped")) return(list(status = "absent", reason = NULL))
  if (anyNA(ids)) return(list(status = "incomplete", reason = sprintf(
    "Participant IDs are missing for %d of %d samples in the compared groups, so independence cannot be verified. No p-values were computed.",
    sum(is.na(ids)), length(ids))))
  repeated <- unique(ids[duplicated(ids)])
  if (length(repeated)) return(list(status = "repeated", reason = sprintf(
    "%d participant ID%s contribute%s more than one sample to the compared groups. Welch and Wilcoxon tests would treat those samples as independent (pseudoreplication). Paired and mixed-effects models are not available here, and samples are never averaged per participant. No p-values were computed.",
    length(repeated), if (length(repeated) == 1L) "" else "s", if (length(repeated) == 1L) "s" else "")))
  list(status = "unique", reason = NULL)
}

team_violin_stats_scalar <- function(value, choices, message) {
  value <- unlist(value, use.names = FALSE)
  if (!is.character(value) || length(value) != 1L || is.na(value) || !value %in% choices) team_violin_stats_fail(message)
  value
}

team_violin_stats_settings <- function(settings, groups) {
  keys <- c("test", "correction", "scope", "comparisons", "effect")
  if (!is.list(settings) || is.null(names(settings)) || anyDuplicated(names(settings)) ||
      !setequal(names(settings), keys)) team_violin_stats_fail("Invalid statistics settings.")
  test <- team_violin_stats_scalar(settings$test, team_violin_stats_tests, "Unsupported statistical test.")
  correction <- team_violin_stats_scalar(settings$correction, team_violin_stats_corrections, "Unsupported multiple-testing correction.")
  scope <- team_violin_stats_scalar(settings$scope, team_violin_stats_scopes, "Unsupported correction family.")
  effect <- team_violin_stats_scalar(settings$effect, c("none", unname(team_violin_stats_effects)), "Unsupported effect size.")
  if (!effect %in% c("none", team_violin_stats_effects[[test]])) team_violin_stats_fail("This effect size does not match the selected test.")
  pairs <- settings$comparisons
  if (is.matrix(pairs)) pairs <- lapply(seq_len(nrow(pairs)), function(i) pairs[i, ])
  if (!is.list(pairs) || !length(pairs) || length(pairs) > team_violin_stats_limits$comparisons)
    team_violin_stats_fail(sprintf("Declare between 1 and %d comparisons.", team_violin_stats_limits$comparisons))
  pairs <- lapply(pairs, function(pair) {
    pair <- unlist(pair, use.names = FALSE)
    if (!is.character(pair) || length(pair) != 2L || anyNA(pair) || pair[[1L]] == pair[[2L]] ||
        any(nchar(pair) > team_violin_stats_limits$label) || !all(pair %in% groups))
      team_violin_stats_fail("A comparison refers to a group that is not in this plot.")
    pair
  })
  unordered <- vapply(pairs, function(pair) paste(sort(pair), collapse = "\r"), character(1))
  if (anyDuplicated(unordered)) team_violin_stats_fail("Each comparison can be declared only once.")
  list(test = test, correction = correction, scope = scope, comparisons = pairs, effect = effect)
}

# Hedges' g of y relative to x: pooled SD and the exact small-sample factor
# J = Gamma(df/2) / (sqrt(df/2) * Gamma((df-1)/2)), df = nx + ny - 2.
team_violin_stats_hedges_g <- function(x, y) {
  nx <- length(x); ny <- length(y); df <- nx + ny - 2
  if (nx < 2L || ny < 2L) return(NA_real_)
  sp <- sqrt(((nx - 1) * stats::var(x) + (ny - 1) * stats::var(y)) / df)
  if (!is.finite(sp) || sp == 0) return(NA_real_)
  j <- exp(lgamma(df / 2) - 0.5 * log(df / 2) - lgamma((df - 1) / 2))
  j * (mean(y) - mean(x)) / sp
}

# Cliff's delta of y relative to x: P(Y > X) - P(Y < X) over all pairs.
team_violin_stats_cliffs_delta <- function(x, y) {
  if (!length(x) || !length(y)) return(NA_real_)
  mean(sign(outer(y, x, "-")))
}

# One two-sided comparison of B (y) against A (x).
team_violin_stats_pair <- function(x, y, test, effect = "none") {
  out <- list(statistic = NA_real_, df = NA_real_, p = NA_real_, effect = NA_real_, note = "")
  if (length(x) < 2L || length(y) < 2L) {
    out$note <- "Fewer than 2 values in a group; not tested."
    return(out)
  }
  if (identical(test, "welch") && stats::var(x) == 0 && stats::var(y) == 0) {
    out$note <- "Both groups are constant; not tested."
    return(out)
  }
  tested <- tryCatch(withCallingHandlers(
    if (identical(test, "welch")) stats::t.test(y, x, var.equal = FALSE)
    else stats::wilcox.test(y, x, exact = NULL, correct = TRUE),
    warning = function(w) {
      out$note <<- if(grepl("ties",conditionMessage(w),ignore.case=TRUE)) "Ties present: normal approximation with continuity correction." else "The statistical test issued a numerical warning; interpret this comparison cautiously."
      invokeRestart("muffleWarning")
    }), error = function(e) NULL)
  if (is.null(tested)) {
    out$note <- "The test could not be computed for these values."
    return(out)
  }
  out$statistic <- unname(tested$statistic)
  if (identical(test, "welch")) out$df <- unname(tested$parameter)
  out$p <- tested$p.value
  if (identical(effect, "hedges_g")) out$effect <- team_violin_stats_hedges_g(x, y)
  if (identical(effect, "cliffs_delta")) out$effect <- team_violin_stats_cliffs_delta(x, y)
  out
}

# m counts every declared test. Untestable comparisons stay in the family
# (conservative), so hiding or failing a comparison never shrinks m.
team_violin_stats_adjust <- function(p, method, m = length(p)) {
  if (identical(method, "none")) return(p)
  stats::p.adjust(p, method = method, n = m)
}

team_violin_stats_fingerprint <- function(base, lipid) {
  digest::digest(list(version = 1L, mat = base$mat, group = base$group, participant = base$participant,
                      grouping = base$grouping, lipid = lipid, participant_field=base$participant_field), algo = "sha256")
}

team_violin_stats_method <- function(settings, features, m) {
  test <- if (identical(settings$test, "welch")) "Welch two-sample t-test (two-sided, unequal variances)"
    else "Wilcoxon rank-sum test (two-sided; exact when n < 50 without ties, otherwise normal approximation with continuity correction)"
  correction <- switch(settings$correction,
    holm = "Holm adjustment", BH = "Benjamini-Hochberg FDR adjustment (q-values)",
    bonferroni = "Bonferroni adjustment", none = "no multiplicity adjustment")
  family <- sprintf("%d test%s (%d lipid%s x %d comparison%s, declared before testing; untestable comparisons count toward m)",
    m, if (m == 1L) "" else "s", features, if (features == 1L) "" else "s",
    length(settings$comparisons), if (length(settings$comparisons) == 1L) "" else "s")
  effect <- switch(settings$effect, none = "",
    hedges_g = " Effect size: Hedges' g of B relative to A (pooled SD, exact small-sample correction; no confidence interval).",
    cliffs_delta = " Effect size: Cliff's delta of B relative to A, P(B > A) - P(B < A); no confidence interval.")
  paste0(test, " of B versus A on log10 prepared abundance; ", correction, " across m = ", family, ".", effect)
}

team_violin_stats_group_summary <- function(base, frame, ids_status) {
  lapply(team_violin_stats_groups(base), function(group) {
    n <- sum(frame$Group == group); ids <- frame$Participant[frame$Group == group]
    # Participant counts are descriptive: repeated IDs are counted once per group.
    list(group = group, nSamples = n, nExcluded = sum(base$group == group) - n,
         nParticipants = if (!anyNA(ids) && !any(base$participant_ambiguous[match(frame$Sample[frame$Group == group],base$samples)])) length(unique(ids)) else NULL)
  })
}

team_violin_stats_compute <- function(base, lipid, settings, design = list(allowed = TRUE, reason = NULL), audit = NULL,
                                      computed_at = Sys.time()) {
  groups <- team_violin_stats_groups(base)
  if (length(groups) > team_violin_stats_limits$groups) team_violin_stats_fail("This plot has too many groups for annotated comparisons.")
  settings <- team_violin_stats_settings(settings, groups)
  frame <- team_violin_stats_frame(base, lipid)
  data_fingerprint <- team_violin_stats_fingerprint(base, lipid)
  blocked <- function(reason) list(status = "blocked", reason = reason, dataFingerprint = data_fingerprint)
  if (!isTRUE(design$allowed)) return(blocked(design$reason %||% "Independent inference is not authorized for this study design. No p-values were computed."))
  ids <- team_violin_stats_participants(base, unique(unlist(settings$comparisons)))
  if (!ids$status %in% c("unique", "absent")) return(blocked(ids$reason))
  features <- if (identical(settings$scope, "displayed")) lipid else rownames(base$mat)
  pairs <- settings$comparisons
  m <- length(features) * length(pairs)
  if (length(features) > team_violin_stats_limits$features || m > team_violin_stats_limits$tests)
    return(blocked(sprintf("The declared family has %d lipids and %d tests (limits: %d lipids, %d tests). Narrow the lipid scope or comparisons, or use the differential analysis module.",
      length(features), m, team_violin_stats_limits$features, team_violin_stats_limits$tests)))
  p <- rep(NA_real_, m)
  rows <- vector("list", length(pairs))
  k <- 0L
  for (feature in features) {
    values <- as.numeric(base$mat[feature, ])
    keep <- is.finite(values) & values > 0
    v <- log10(values[keep]); g <- base$group[keep]
    displayed <- identical(feature, lipid)
    for (i in seq_along(pairs)) {
      k <- k + 1L
      x <- v[g == pairs[[i]][[1L]]]; y <- v[g == pairs[[i]][[2L]]]
      tested <- team_violin_stats_pair(x, y, settings$test, if (displayed) settings$effect else "none")
      p[[k]] <- tested$p
      if (displayed) rows[[i]] <- c(list(index = k, a = pairs[[i]][[1L]], b = pairs[[i]][[2L]], nA = length(x), nB = length(y)), tested)
    }
  }
  adjusted <- team_violin_stats_adjust(p, settings$correction, m)
  na_null <- function(x) if (is.na(x)) NULL else x
  rows <- lapply(rows, function(row) list(a = row$a, b = row$b, nA = row$nA, nB = row$nB,
    statistic = na_null(row$statistic), df = na_null(row$df), p = na_null(row$p),
    pAdj = na_null(adjusted[[row$index]]), effect = na_null(row$effect), note = row$note))
  text <- function(x, fallback = "Unknown") { x <- as.character(x %||% fallback); if (length(x) != 1L || is.na(x) || !nzchar(x)) fallback else substr(x, 1L, 200L) }
  list(status = "ok", settings = settings, result = list(
    fingerprint = digest::digest(list(data_fingerprint, settings), algo = "sha256"),
    dataFingerprint = data_fingerprint,
    computedAt = format(computed_at, "%Y-%m-%dT%H:%M:%OS3Z", tz = "UTC"),
    lipid = lipid, grouping = base$grouping,
    family = list(m = m, features = length(features), comparisons = length(pairs), untestable = sum(is.na(p))),
    groups = team_violin_stats_group_summary(base, frame, ids$status),
    rows = rows,
    provenance = list(
      method = team_violin_stats_method(settings, length(features), m),
      transformation = "log10 of positive, finite prepared abundances: the values drawn in this violin. Missing, zero and negative values are excluded and counted, never imputed here.",
      normalization = text(audit$normalization), imputation = text(audit$imputation),
      participantIds = ids$status,
      design = paste0(if (identical(ids$status, "unique")) "Confirmed independent design; every tested sample has a distinct participant ID."
        else "Confirmed independent design; no participant IDs are mapped, so independence rests on the confirmed design.", " Participant ID field: ", base$participant_field %||% "unmapped", "."))))
}

team_violin_stats_describe <- function(base, lipid, design, audit = NULL) {
  frame <- team_violin_stats_frame(base, lipid)
  groups <- team_violin_stats_groups(base)
  ids <- team_violin_stats_participants(base, groups)
  list(status = "ok", describe = list(
    lipid = lipid, grouping = base$grouping, features = nrow(base$mat),
    groups = team_violin_stats_group_summary(base, frame, ids$status),
    participantIds = ids$status, participantReason = ids$reason,
    designAllowed = isTRUE(design$allowed), designReason = design$reason,
    normalization = as.character(audit$normalization %||% "Unknown"), imputation = as.character(audit$imputation %||% "Unknown"),
    dataFingerprint = team_violin_stats_fingerprint(base, lipid)))
}

# The same Team policy as differential analysis: a confirmed independent design,
# current prepared data and no synthetic samples.
team_violin_stats_design <- function(shared_data, design_type = NULL) {
  policy <- shared_data$inference_allowed
  allowed <- is.function(policy) && isTRUE(tryCatch(policy(paired = FALSE), error = function(e) FALSE))
  if (allowed) return(list(allowed = TRUE, reason = NULL))
  reason <- if (identical(design_type, "paired"))
    "The confirmed study design is matched or repeated. Paired and mixed-effects models are not available in this tab, and independent tests would be invalid. No p-values were computed."
  else if (identical(design_type, "uncertain"))
    "The study design is marked mixed or uncertain, so independence cannot be assumed. No p-values were computed."
  else "Statistics need a confirmed independent study design, current prepared data and no synthetic samples. Review the design, then try again. No p-values were computed."
  list(allowed = FALSE, reason = reason)
}

team_violin_stats_request <- function(request) {
  field <- function(key, pattern) {
    value <- unlist(request[[key]], use.names = FALSE)
    if (!is.character(value) || length(value) != 1L || is.na(value) || !grepl(pattern, value)) team_violin_stats_fail("Invalid statistics request.")
    value
  }
  if (!is.list(request) || is.null(names(request))) team_violin_stats_fail("Invalid statistics request.")
  out <- list(requestId = field("requestId", "^[A-Za-z0-9_-]{1,80}$"), instanceId = field("instanceId", "^tcinstance_[a-z0-9_]{1,80}$"),
              mode = field("mode", "^(describe|apply|verify|check)$"))
  if (out$mode %in% c("apply", "verify")) out$settings <- request$settings
  if (out$mode %in% c("verify", "check")) out$dataFingerprint <- field("dataFingerprint", "^[a-f0-9]{64}$")
  out
}

# Shiny bridge. lookup(id) returns the registered independent copy, or NULL.
team_violin_stats_server <- function(input, session, dashboard_data, lookup) {
  value <- function(x) if (is.function(x)) x() else x
  shiny::observeEvent(input$team_violin_stats_request, {
    raw <- input$team_violin_stats_request
    ids <- list(requestId = NULL, instanceId = NULL, mode = NULL)
    reply <- tryCatch({
      request <- team_violin_stats_request(raw)
      ids <- request[c("requestId", "instanceId", "mode")]
      entry <- lookup(request$instanceId)
      if (is.null(entry) || !identical(entry$source, team_violin_stats_source) || isTRUE(entry$parked) || is.null(entry$dashboard))
        team_violin_stats_fail("This violin copy is not active.")
      lipid <- input[[paste0(request$instanceId, "-violin_lipid")]]
      base <- team_violin_stats_base(value(dashboard_data$data_processed), value(dashboard_data$all_metadata),
                                     input[[paste0(request$instanceId, "-color_by")]])
      frame <- team_violin_stats_frame(base, lipid)
      drawn <- tryCatch(entry$dashboard$violin_data(), error = function(e) NULL)
      if (!team_violin_stats_matches(drawn, frame, lipid)) team_violin_stats_fail("The plot is still updating. Wait for it to finish, then try again.")
      design <- team_violin_stats_design(dashboard_data, input$guide_design_type)
      audit <- tryCatch(value(dashboard_data$preparation_audit), error = function(e) NULL)
      current <- team_violin_stats_fingerprint(base, lipid)
      if (identical(request$mode, "describe")) team_violin_stats_describe(base, lipid, design, audit)
      else if (request$mode %in% c("verify", "check") && !identical(current, request$dataFingerprint))
        list(status = "invalidated", reason = "The prepared data, displayed lipid, grouping or participant IDs changed after these statistics were confirmed.", dataFingerprint = current)
      else if (identical(request$mode, "check")) {
        if (isTRUE(design$allowed)) list(status = "unchanged", dataFingerprint = current)
        else list(status = "blocked", reason = design$reason, dataFingerprint = current)
      } else team_violin_stats_compute(base, lipid, request$settings, design, audit)
    }, team_violin_stats_error = function(e) list(status = "error", reason = conditionMessage(e)),
    error = function(e) list(status = "error", reason = "Statistics could not be computed for this plot."))
    session$sendCustomMessage("team-violin-stats", c(ids, reply))
  }, ignoreInit = TRUE)
  # Withdrawing design confirmation must withdraw drawn p-values too.
  shiny::observe({
    design <- team_violin_stats_design(dashboard_data, input$guide_design_type)
    session$sendCustomMessage("team-violin-stats-policy", list(allowed = design$allowed, reason = design$reason))
  })
  invisible(NULL)
}

# Team-only adapter: scientific request events are not persistent study state.
team_violin_stats_input_filter <- function(original) {
  force(original)
  function(inputs) {
    filtered <- original(inputs)
    if(!is.list(filtered))return(filtered)
    filtered[!grepl("(^|-)team_violin_stats_request$",names(filtered))]
  }
}
