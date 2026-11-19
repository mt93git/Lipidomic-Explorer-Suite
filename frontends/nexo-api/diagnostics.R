# Nexo Diagnostics: an attractor landscape of the prepared lipidomics, after Shin et al. 2025
# (Adv. Sci. 12:2412503, "REVERT"), adapted from single-cell transcriptomes to bulk lipidomics samples.
#
# Steps (dx_landscape):
#   1. Nodes: the lipids that best separate a reference group from a target group, decorrelated.
#   2. Ordering: an optional metadata column (pseudotime, time, severity); without one, each sample's
#      projection on the reference -> target centroid axis. Ordering enriches the model, it never blocks it.
#   3. Smoothing with a moving window along the ordering, then binarisation at each node's median.
#   4. Network: Spearman correlation of the smoothed series gives candidate regulators and their signs;
#      each node gets the sign-consistent Boolean rule (identity, AND, OR of up to three inputs) that
#      best predicts its state k steps later (k larger than the window, as in the paper).
#   5. Attractor landscape: synchronous updates from every state of the 2^n state space; basins, the
#      effective distance d_eff on the reference -> target axis, the attractor entropy under one- and
#      two-node flips, and the aberrance score (the paper's cancer score).
#   6. In silico perturbations: each node fixed at 0 or 1, then pairs of the most effective ones.
#   7. Samples mapped onto the landscape, and the landscape tested against every metadata column.
#
# The dx_* functions are pure (matrix and data.frame in, lists out) so tests run them without Team.

dx_null <- function(a, b) if (is.null(a) || (length(a) == 1L && is.na(a))) b else a

# ---- 1. data ---------------------------------------------------------------------------------
# prepared: Team's data_processed_allow_missing() (lipid name first, one column per sample).
dx_matrix <- function(prepared, samples, min_detect = 0.8) {
  values <- as.matrix(prepared[, samples, drop = FALSE])
  storage.mode(values) <- "double"
  values[!is.finite(values) | values <= 0] <- NA
  rownames(values) <- make.unique(as.character(prepared[[1L]]))
  keep <- rowMeans(!is.na(values)) >= min_detect
  values <- values[keep, , drop = FALSE]
  values <- log2(values + 1)
  for (i in seq_len(nrow(values))) {
    miss <- is.na(values[i, ])
    if (any(miss)) values[i, miss] <- min(values[i, !miss]) - 1  # half the minimum, on the log2 scale
  }
  values <- sweep(values, 2L, apply(values, 2L, stats::median), "-")  # sample median normalisation
  t(values)  # samples x lipids
}

dx_zscore <- function(x) {
  sd <- apply(x, 2L, stats::sd)
  sd[!is.finite(sd) | sd == 0] <- 1
  sweep(sweep(x, 2L, colMeans(x), "-"), 2L, sd, "/")
}

dx_select <- function(z, groups, reference, target, n_nodes, max_cor = 0.9) {
  a <- z[groups %in% reference, , drop = FALSE]; b <- z[groups %in% target, , drop = FALSE]
  pooled <- sqrt((apply(a, 2L, stats::var) * (nrow(a) - 1) + apply(b, 2L, stats::var) * (nrow(b) - 1)) / (nrow(a) + nrow(b) - 2))
  pooled[!is.finite(pooled) | pooled == 0] <- 1
  effect <- (colMeans(b) - colMeans(a)) / pooled
  p <- vapply(seq_len(ncol(z)), function(j) suppressWarnings(stats::wilcox.test(b[, j], a[, j], exact = FALSE)$p.value), numeric(1))
  p[!is.finite(p)] <- 1
  rank <- order(-abs(effect) * -log10(pmax(p, 1e-300)))
  picked <- integer(0)
  for (j in rank) {
    if (!length(picked) || all(abs(stats::cor(z[, j], z[, picked, drop = FALSE])) < max_cor)) picked <- c(picked, j)
    if (length(picked) >= n_nodes) break
  }
  data.frame(feature = colnames(z)[picked], effect = unname(effect[picked]), p = p[picked],
    fdr = stats::p.adjust(p, "BH")[picked], stringsAsFactors = FALSE)
}

dx_axis_projection <- function(x, ref_rows, target_rows) {
  vn <- colMeans(x[ref_rows, , drop = FALSE]); vc <- colMeans(x[target_rows, , drop = FALSE])
  axis <- vc - vn; denom <- sum(axis^2)
  if (denom == 0) return(rep(0, nrow(x)))
  as.numeric(sweep(x, 2L, vn, "-") %*% axis) / denom
}

dx_smooth <- function(x, window) {
  n <- nrow(x); half <- window %/% 2
  out <- x
  for (i in seq_len(n)) out[i, ] <- colMeans(x[max(1L, i - half):min(n, i + half), , drop = FALSE])
  out
}

# ---- 4. Boolean rules --------------------------------------------------------------------------
dx_apply_rule <- function(rule, states) {
  if (identical(rule$op, "ID")) return(states[, rule$inputs[[1L]]])
  lits <- states[, rule$inputs, drop = FALSE]
  neg <- rule$signs < 0
  if (any(neg)) lits[, neg] <- !lits[, neg]
  if (identical(rule$op, "AND")) rowSums(lits) == ncol(lits) else rowSums(lits) > 0
}

dx_fit_rules <- function(binary, rho, step, cut = 0.6, max_candidates = 4L, max_inputs = 2L, parsimony = 0.03) {
  n <- ncol(binary); m <- nrow(binary) - step
  if (m < 3L) stop("Too few samples for the chosen window.")
  input <- binary[seq_len(m), , drop = FALSE]
  lapply(seq_len(n), function(i) {
    output <- binary[step + seq_len(m), i]
    self <- list(inputs = i, signs = 1, op = "ID", score = mean(input[, i] == output), self = TRUE)
    others <- setdiff(seq_len(n), i)
    cand <- others[abs(rho[i, others]) >= cut]
    cand <- utils::head(cand[order(-abs(rho[i, cand]))], max_candidates)
    best <- NULL
    for (size in seq_len(min(max_inputs, length(cand)))) {
      for (inputs in utils::combn(cand, size, simplify = FALSE)) {
        signs <- sign(rho[i, inputs])
        ops <- if (size == 1L) "ID1" else c("AND", "OR")
        for (op in ops) {
          rule <- list(inputs = inputs, signs = signs, op = if (op == "ID1") "OR" else op, self = FALSE)
          rule$score <- mean(dx_apply_rule(rule, input) == output)
          rule$strength <- sum(abs(rho[i, inputs]))
          # An extra input must earn its place (parsimony): fewer inputs keep more attractors apart.
          gain <- if (is.null(best)) Inf else rule$score - best$score - parsimony * (length(inputs) - length(best$inputs))
          better <- is.null(best) || gain > 1e-9 ||
            (abs(rule$score - best$score) <= 1e-9 && length(inputs) == length(best$inputs) && rule$strength > best$strength)
          if (better) best <- rule
        }
      }
    }
    if (is.null(best) || best$score < self$score - 1e-9) self else best
  })
}

dx_step <- function(rules, states, fixed = NULL) {
  out <- states
  for (i in seq_along(rules)) out[, i] <- dx_apply_rule(rules[[i]], states)
  if (length(fixed)) for (f in names(fixed)) out[, as.integer(f)] <- fixed[[f]] == 1
  out
}

dx_codes <- function(states) as.numeric(states %*% (2^(seq_len(ncol(states)) - 1)))
dx_states <- function(codes, n) {
  s <- matrix(FALSE, length(codes), n)
  for (i in seq_len(n)) s[, i] <- (codes %/% 2^(i - 1)) %% 2 == 1
  s
}

# Attractor of each state: the smallest code on its final cycle, plus the cycle's mean state.
dx_run <- function(rules, states, fixed = NULL, max_steps = 300L, record = 64L) {
  for (t in seq_len(max_steps)) {
    nxt <- dx_step(rules, states, fixed)
    if (identical(nxt, states)) break
    states <- nxt
  }
  codes <- dx_codes(states); low <- codes; sums <- states * 1; len <- rep(1L, nrow(states))
  if (!identical(dx_step(rules, states, fixed), states)) {
    first <- codes; closed <- rep(FALSE, nrow(states))
    for (t in seq_len(record)) {
      states <- dx_step(rules, states, fixed)
      c <- dx_codes(states)
      closed <- closed | c == first
      open <- !closed
      low[open] <- pmin(low[open], c[open]); sums[open, ] <- sums[open, ] + states[open, ]; len[open] <- len[open] + 1L
    }
  }
  list(attractor = low, mean_state = sums / len, cycle = len)
}

# ---- 5. landscape ------------------------------------------------------------------------------
dx_deff <- function(v, vn, vc) {
  axis <- vc - vn; denom <- sum(axis^2)
  if (denom == 0) return(rep(0, NROW(v)))
  as.numeric(sweep(rbind(v), 2L, vn, "-") %*% axis) / denom
}

dx_flip_masks <- function(n, free) {
  singles <- lapply(free, function(i) i)
  pairs <- if (length(free) > 1L) utils::combn(free, 2L, simplify = FALSE) else list()
  vapply(c(singles, pairs), function(idx) sum(2^(idx - 1)), numeric(1))
}

dx_xor <- function(codes, mask) as.numeric(bitwXor(as.integer(codes), as.integer(mask)))

dx_space <- function(rules, n, vn, vc, fixed = NULL) {
  free <- setdiff(seq_len(n), as.integer(names(fixed)))
  codes <- as.numeric(0:(2^length(free) - 1))
  states <- matrix(FALSE, length(codes), n)
  for (k in seq_along(free)) states[, free[[k]]] <- (codes %/% 2^(k - 1)) %% 2 == 1
  if (length(fixed)) for (f in names(fixed)) states[, as.integer(f)] <- fixed[[f]] == 1
  all_codes <- dx_codes(states)
  run <- dx_run(rules, states, fixed)
  lookup <- rep(NA_real_, 2^n); lookup[all_codes + 1] <- run$attractor
  ids <- sort(unique(run$attractor))
  # Entropy of each state: where its one- and two-node flips settle (Shin et al. use random
  # perturbations; every flip here, so the result does not depend on a seed).
  masks <- dx_flip_masks(n, free)
  landed <- vapply(masks, function(m) lookup[dx_xor(all_codes, m) + 1], numeric(length(all_codes)))
  landed <- matrix(landed, nrow = length(all_codes))
  entropy <- numeric(length(all_codes))
  for (a in ids) { p <- rowMeans(landed == a); entropy <- entropy - ifelse(p > 0, p * log2(p), 0) }
  smax <- max(log2(length(masks)), 1)  # at least one bit, so a one-lipid space has finite depths
  d_state <- dx_deff(states * 1, vn, vc)
  attractors <- lapply(ids, function(a) {
    member <- run$attractor == a
    state <- colMeans(run$mean_state[member, , drop = FALSE])
    list(code = a, basin = mean(member), entropy = mean(entropy[member]), state = state,
      cyclic = max(run$cycle[member]) > 1L, deff = dx_deff(state, vn, vc))
  })
  basin <- vapply(attractors, `[[`, numeric(1), "basin")
  attractors <- attractors[order(-basin)]
  d <- vapply(attractors, `[[`, numeric(1), "deff"); s <- vapply(attractors, `[[`, numeric(1), "entropy")
  b <- vapply(attractors, `[[`, numeric(1), "basin")
  score <- sum((1 - s / smax) * b * pmin(pmax(d, 0), 1))
  list(attractors = attractors, score = score, smax = smax, lookup = lookup, codes = all_codes,
    attractor_of_state = run$attractor, entropy = entropy, d_state = d_state,
    entropy_lookup = { e <- rep(NA_real_, 2^n); e[all_codes + 1] <- entropy; e })
}

dx_attractor_json <- function(space, names, labels = NULL) {
  lapply(seq_along(space$attractors), function(k) {
    a <- space$attractors[[k]]
    list(id = paste0("A", k), code = a$code, basin = a$basin, entropy = a$entropy, deff = a$deff,
      depth = 1 - a$entropy / space$smax, cyclic = a$cyclic,
      state = I(round(a$state, 3)), label = dx_null(labels[[k]], ""))
  })
}

dx_label_attractors <- function(space, reference, target) {
  d <- vapply(space$attractors, `[[`, numeric(1), "deff")
  labels <- rep("", length(d))
  # A group names an attractor only near its own end of the axis: after a perturbation the farthest attractor
  # may sit at d = 0.3, and is not the target's.
  if (length(d) && min(d) <= 0.25) labels[[which.min(d)]] <- reference
  if (length(d) && max(d) >= 0.75) labels[[which.max(d)]] <- target
  labels
}

# ---- 7. metadata ---------------------------------------------------------------------------------
dx_auc <- function(score, positive) {
  pos <- score[positive]; neg <- score[!positive]
  if (!length(pos) || !length(neg)) return(NA_real_)
  r <- rank(c(pos, neg))
  (sum(r[seq_along(pos)]) - length(pos) * (length(pos) + 1) / 2) / (length(pos) * length(neg))
}

# mirrors: a categorical column that only renames the groups (Cramer's V >= 0.95 against them).
dx_mirrors <- function(v, groups) {
  keep <- !is.na(v) & !is.na(groups)
  tab <- table(v[keep], groups[keep])
  if (min(dim(tab)) < 2L) return(FALSE)
  chi <- suppressWarnings(stats::chisq.test(tab, correct = FALSE)$statistic)
  sqrt(chi / (sum(tab) * (min(dim(tab)) - 1))) >= 0.95
}

# Partial mirror: one whole group is a level of the column, or the union of several (the same samples, Jaccard
# >= 0.95), e.g. a treatment column whose "Healthy control" level is the control group, or a visit column that splits
# the crisis group into first and second crises. Across all samples its test then carries that group's difference;
# the column's own question lives in the other levels. Returns the group, or NULL.
dx_contains_group <- function(v, groups) {
  keep <- !is.na(v) & !is.na(groups)
  v <- v[keep]; groups <- groups[keep]
  if (length(unique(groups)) < 2L) return(NULL)
  for (g in unique(groups)) {
    b <- groups == g
    inside <- vapply(unique(v), function(l) mean(b[v == l]) >= 0.95, logical(1))
    a <- v %in% unique(v)[inside]
    if (sum(a) >= 3L && sum(a & b) / sum(a | b) >= 0.95) return(g)
  }
  NULL
}

dx_metadata_tests <- function(metadata, d_init, attractor, skip, groups = NULL) {
  out <- list()
  # Identifiers (Subject_ID, Patient_ID, ...) name samples or people: they are not tested.
  for (col in setdiff(names(metadata), c(skip, grep("(^|_)(ID|Id|id)$", names(metadata), value = TRUE)))) {
    v <- metadata[[col]]
    if (is.factor(v)) v <- as.character(v)
    if (is.character(v)) v[trimws(v) == ""] <- NA
    num <- suppressWarnings(as.numeric(as.character(v)))
    ok <- !is.na(v)
    if (sum(ok) < 6L) next
    if (sum(!is.na(num)) >= 6L && sum(!is.na(num)) >= 0.8 * sum(ok) && length(unique(num[!is.na(num)])) > 3L) {
      keep <- !is.na(num)
      ct <- suppressWarnings(stats::cor.test(d_init[keep], num[keep], method = "spearman", exact = FALSE))
      out[[length(out) + 1L]] <- list(column = col, kind = "numeric", n = sum(keep), statistic = unname(ct$estimate),
        statisticName = "Spearman rho", p = ct$p.value,
        points = lapply(which(keep), function(i) list(x = num[[i]], y = d_init[[i]], attractor = attractor[[i]])))
    } else {
      lev <- table(v[ok]); lev <- lev[lev >= 3L]
      if (length(lev) < 2L || length(lev) > 10L) next
      keep <- ok & v %in% names(lev)
      if (length(unique(v[keep])) == sum(keep)) next
      kw <- suppressWarnings(stats::kruskal.test(d_init[keep], factor(v[keep])))
      tab <- table(factor(v[keep]), factor(attractor[keep]))
      fisher <- if (ncol(tab) > 1L) tryCatch(suppressWarnings(stats::chisq.test(tab, simulate.p.value = TRUE, B = 2000)$p.value), error = function(e) NA_real_) else NA_real_
      levels <- lapply(names(lev), function(l) {
        x <- d_init[keep & v == l]
        q <- stats::quantile(x, c(0, .25, .5, .75, 1), names = FALSE)
        list(level = l, n = length(x), min = q[[1]], q1 = q[[2]], median = q[[3]], q3 = q[[4]], max = q[[5]],
          attractors = as.list(table(factor(attractor[keep & v == l], levels = sort(unique(attractor))))))
      })
      mirrors <- !is.null(groups) && isTRUE(dx_mirrors(v, groups))
      out[[length(out) + 1L]] <- list(column = col, kind = "categorical", n = sum(keep), statistic = unname(kw$statistic),
        mirrorsGroup = mirrors, containsGroup = if (!mirrors && !is.null(groups)) dx_contains_group(v[keep], groups[keep]),
        statisticName = "Kruskal-Wallis H", p = kw$p.value, attractorP = fisher, levels = levels)
    }
  }
  if (!length(out)) return(list())
  p <- vapply(out, `[[`, numeric(1), "p"); fdr <- stats::p.adjust(p, "BH")
  for (i in seq_along(out)) out[[i]]$fdr <- fdr[[i]]
  out[order(p)]
}

# Fig. 2d: the critical transition index (mean |feature-feature correlation| over mean
# |sample-sample correlation|) of each group, on the most variable lipids.
dx_transition_index <- function(z, groups, max_features = 200L) {
  var <- apply(z, 2L, stats::var); top <- utils::head(order(-var), max_features)
  lapply(unique(groups[!is.na(groups)]), function(g) {
    x <- z[groups %in% g, top, drop = FALSE]
    if (nrow(x) < 4L) return(NULL)
    ff <- suppressWarnings(abs(stats::cor(x))); ss <- suppressWarnings(abs(stats::cor(t(x))))
    ic <- mean(ff[upper.tri(ff)], na.rm = TRUE) / mean(ss[upper.tri(ss)], na.rm = TRUE)
    list(group = g, n = nrow(x), index = ic)
  })
}

# ---- the whole analysis ----------------------------------------------------------------------------
dx_landscape <- function(x, metadata, group_column, reference, target, ordering_column = NULL,
  subject_column = NULL, n_nodes = 12L, cut = 0.6, window_fraction = 0.1, n_double = 5L, max_inputs = 2L, parsimony = 0.03) {
  stopifnot(nrow(x) == nrow(metadata))
  n_nodes <- as.integer(max(4L, min(14L, n_nodes)))
  groups <- as.character(metadata[[group_column]]); groups[trimws(groups) == ""] <- NA
  if (sum(groups %in% reference) < 3L || sum(groups %in% target) < 3L)
    stop("The reference and the target groups need at least three samples each.")
  z <- dx_zscore(x)
  nodes <- dx_select(z, groups, reference, target, n_nodes)
  n <- nrow(nodes)
  zn <- z[, nodes$feature, drop = FALSE]
  # Ordering: a metadata column when given (pseudotime or another numeric order), else the axis.
  used <- !is.na(groups)
  ordering_source <- "axis"
  order_value <- dx_axis_projection(zn, which(groups %in% reference), which(groups %in% target))
  if (length(ordering_column) && nzchar(ordering_column) && ordering_column %in% names(metadata)) {
    col <- suppressWarnings(as.numeric(as.character(metadata[[ordering_column]])))
    if (sum(!is.na(col)) >= 10L) { order_value <- col; used <- used & !is.na(col); ordering_source <- ordering_column }
  }
  traj <- which(used)[order(order_value[used])]
  window <- max(3L, round(window_fraction * length(traj)))
  step <- window + 1L
  smooth <- dx_smooth(zn[traj, , drop = FALSE], window)
  threshold <- apply(smooth, 2L, stats::median)
  binary <- sweep(smooth, 2L, threshold, ">")
  rho <- suppressWarnings(stats::cor(smooth, method = "spearman")); rho[!is.finite(rho)] <- 0
  rules <- dx_fit_rules(binary, rho, step, cut, max_inputs = max_inputs, parsimony = parsimony)
  ends <- max(1L, round(0.2 * nrow(binary)))
  vn <- colMeans(binary[seq_len(ends), , drop = FALSE]); vc <- colMeans(binary[nrow(binary) - seq_len(ends) + 1L, , drop = FALSE])
  base <- dx_space(rules, n, vn, vc)
  labels <- dx_label_attractors(base, reference, target)
  ids <- vapply(base$attractors, `[[`, numeric(1), "code")
  aid <- function(code) paste0("A", match(code, ids))
  # Samples on the landscape (Fig. 3e, 4b).
  sample_states <- sweep(zn, 2L, threshold, ">")
  sample_codes <- dx_codes(sample_states)
  sample_att <- base$lookup[sample_codes + 1]
  d_init <- dx_deff(sample_states * 1, vn, vc)
  d_final <- vapply(sample_att, function(a) base$attractors[[match(a, ids)]]$deff, numeric(1))
  pca <- stats::prcomp(zn)
  pcs <- pca$x[, 1:2, drop = FALSE]
  if (stats::cor(pcs[, 1], d_init) < 0) pcs[, 1] <- -pcs[, 1]
  ids_col <- metadata$.sample
  samples <- lapply(seq_len(nrow(x)), function(i) list(sample = ids_col[[i]], group = dx_null(groups[[i]], "Unassigned"),
    pc1 = pcs[i, 1], pc2 = pcs[i, 2], order = order_value[[i]], dInit = d_init[[i]], dFinal = d_final[[i]],
    entropy = base$entropy_lookup[sample_codes[[i]] + 1], attractor = aid(sample_att[[i]]),
    state = paste(as.integer(sample_states[i, ]), collapse = ""),
    subject = if (length(subject_column) && subject_column %in% names(metadata)) as.character(metadata[[subject_column]][[i]]) else NULL))
  # Fig. 4c: where each initial state settles, and the entropy of the states in each basin.
  d_bin <- round(base$d_state * 20) / 20
  final_d <- vapply(base$attractor_of_state, function(a) round(base$attractors[[match(a, ids)]]$deff, 3), numeric(1))
  flow <- stats::aggregate(list(count = rep(1L, length(d_bin))), list(dInit = d_bin, dFinal = final_d), length)
  entropy_by_attractor <- lapply(seq_along(ids), function(k) {
    e <- base$entropy[base$attractor_of_state == ids[[k]]]
    q <- stats::quantile(e, c(0, .25, .5, .75, 1), names = FALSE)
    list(attractor = paste0("A", k), deff = base$attractors[[k]]$deff, min = q[[1]], q1 = q[[2]], median = q[[3]], q3 = q[[4]], max = q[[5]])
  })
  # Fig. 4e-f: every node fixed at 0 and at 1.
  name <- nodes$feature
  perturb <- function(fixed) {
    sp <- dx_space(rules, n, vn, vc, fixed)
    list(score = sp$score, attractors = dx_attractor_json(sp, name, dx_label_attractors(sp, reference, target)))
  }
  singles <- list()
  for (i in seq_len(n)) for (v in 0:1) {
    fixed <- stats::setNames(list(v), i)
    r <- perturb(fixed)
    singles[[length(singles) + 1L]] <- list(id = sprintf("%s_%d", name[[i]], v), node = i, value = v, score = r$score, attractors = r$attractors)
  }
  order_single <- order(vapply(singles, `[[`, numeric(1), "score"))
  top <- singles[order_single]
  top <- top[!duplicated(vapply(top, `[[`, numeric(1), "node"))][seq_len(min(n_double, n))]
  doubles <- list()
  for (a in seq_along(top)) for (b in seq_along(top)) if (a < b) {
    fixed <- stats::setNames(list(top[[a]]$value, top[[b]]$value), c(top[[a]]$node, top[[b]]$node))
    r <- perturb(fixed)
    doubles[[length(doubles) + 1L]] <- list(first = top[[a]]$id, second = top[[b]]$id, score = r$score, attractors = r$attractors)
  }
  rules_json <- lapply(seq_len(n), function(i) {
    r <- rules[[i]]
    lit <- vapply(seq_along(r$inputs), function(k) paste0(if (r$signs[[k]] < 0) "NOT " else "", name[[r$inputs[[k]]]]), character(1))
    text <- if (identical(r$op, "ID")) lit[[1L]] else paste(lit, collapse = paste0(" ", r$op, " "))
    list(node = name[[i]], rule = text, fit = r$score, self = isTRUE(r$self))
  })
  edges <- do.call(rbind, lapply(seq_len(n), function(i) {
    r <- rules[[i]]
    if (isTRUE(r$self)) return(NULL)
    data.frame(from = r$inputs, to = i, sign = r$signs)
  }))
  scc <- rep(1L, n)
  if (!is.null(edges) && nrow(edges)) {
    g <- igraph::graph_from_edgelist(cbind(edges$from, edges$to), directed = TRUE)
    g <- igraph::add_vertices(g, max(0L, n - igraph::vcount(g)))
    comp <- igraph::components(g, mode = "strong")
    scc <- comp$membership
    set.seed(1L)
    layout <- igraph::layout_with_fr((if (exists("as_undirected", envir = asNamespace("igraph"))) igraph::as_undirected else igraph::as.undirected)(g, mode = "collapse"))
  } else layout <- cbind(cos(seq_len(n) * 2 * pi / n), sin(seq_len(n) * 2 * pi / n))
  core <- as.integer(names(which.max(table(scc))))
  network <- list(
    nodes = lapply(seq_len(n), function(i) list(id = i, name = name[[i]], cls = sub("[ (].*$", "", name[[i]]),
      effect = nodes$effect[[i]], p = nodes$p[[i]], fdr = nodes$fdr[[i]], core = scc[[i]] == core && sum(scc == core) > 1L,
      x = layout[i, 1], y = layout[i, 2])),
    edges = if (is.null(edges)) list() else lapply(seq_len(nrow(edges)), function(k) list(from = edges$from[[k]], to = edges$to[[k]], sign = edges$sign[[k]])))
  skip <- c(".sample", group_column)
  att_ids <- vapply(sample_att, aid, character(1))
  tests <- dx_metadata_tests(metadata[, setdiff(names(metadata), skip), drop = FALSE], d_init, att_ids, character(0), groups)
  # Within the cases (every sample outside the reference group): the prognostic question, where the
  # group column no longer explains the position on the landscape.
  cases <- !is.na(groups) & !groups %in% reference
  within <- dx_metadata_tests(metadata[cases, setdiff(names(metadata), skip), drop = FALSE], d_init[cases], att_ids[cases], character(0), groups[cases])
  diagnostic <- lapply(setdiff(unique(groups[!is.na(groups)]), reference), function(g) {
    keep <- groups %in% c(reference, g)
    list(group = g, vs = reference, n = sum(keep), aucInit = dx_auc(d_init[keep], groups[keep] == g),
      aucFinal = dx_auc(d_final[keep], groups[keep] == g),
      inTarget = mean(d_final[groups %in% g] >= 0.5))
  })
  warnings <- character(0)
  for (t in tests) if (t$kind == "numeric" && grepl("run|order|inject|batch|plate", t$column, ignore.case = TRUE) && abs(t$statistic) >= 0.5)
    warnings <- c(warnings, sprintf("d_eff follows %s (rho %.2f): the disease axis may carry an acquisition effect.", t$column, t$statistic))
  list(
    params = list(groupColumn = group_column, reference = reference, target = target, ordering = ordering_source,
      nodes = n, window = window, step = step, cut = cut, samples = nrow(x), features = ncol(x), stateSpace = 2^n,
      maxInputs = max_inputs, parsimony = parsimony, ends = 0.2, perturbations = "every one- and two-lipid flip",
      ruleFit = mean(vapply(rules, `[[`, numeric(1), "score"))),
    network = network, rules = rules_json,
    attractors = dx_attractor_json(base, name, labels), score = base$score, smax = base$smax,
    samples = samples, flow = lapply(seq_len(nrow(flow)), function(i) as.list(flow[i, ])),
    entropyByAttractor = entropy_by_attractor,
    perturbations = list(single = singles, double = doubles,
      control = list(score = base$score)),
    metadata = tests, metadataCases = within, diagnostic = diagnostic, transitionIndex = Filter(Negate(is.null), dx_transition_index(z, groups)),
    warnings = I(warnings))
}

# ---- API (session adapters) --------------------------------------------------------------------------
dx_session_data <- function(s) {
  prepared <- api_read(s, s$shared$data_processed_allow_missing())
  metadata <- as.data.frame(api_read(s, s$shared$all_metadata()), stringsAsFactors = FALSE)
  id_col <- names(metadata)[vapply(metadata, function(v) sum(as.character(v) %in% names(prepared)), numeric(1)) > 0]
  if (!length(id_col)) api_abort("api_unprocessable", "The sample metadata does not name the prepared samples.")
  id_col <- id_col[[which.max(vapply(id_col, function(c) sum(as.character(metadata[[c]]) %in% names(prepared)), numeric(1)))]]
  samples <- intersect(as.character(metadata[[id_col]]), names(prepared)[-1L])
  metadata <- metadata[match(samples, as.character(metadata[[id_col]])), , drop = FALSE]
  metadata$.sample <- samples
  # Team stores mapped columns under its own names (Group1, PatientNumber, ...): show the study's names again.
  mappings <- tryCatch(api_read(s, s$shared$external_sample_metadata())$mappings, error = function(e) NULL)
  for (role in names(mappings)) {
    original <- as.character(mappings[[role]])
    if (role %in% names(metadata) && length(original) == 1L && nzchar(original) && !original %in% names(metadata))
      names(metadata)[names(metadata) == role] <- original
  }
  # Team's derived columns (display labels, group combinations, clusters) and identifiers are not metadata to test.
  derived <- c("DisplayLabel", "Cluster", grep("_Group[12]$|^TimePoint_", names(metadata), value = TRUE))
  internal <- c(id_col, "FullName", "SampleID", "Replicate", "ReplicateID", derived)
  metadata <- metadata[, c(".sample", setdiff(names(metadata), c(".sample", internal))), drop = FALSE]
  single <- vapply(metadata, function(v) length(unique(v[!is.na(v) & trimws(as.character(v)) != ""])) < 2L, logical(1))
  metadata <- metadata[, !single | names(metadata) == ".sample", drop = FALSE]
  list(prepared = prepared, metadata = metadata, samples = samples)
}

api_diagnostics_options <- function(s) {
  d <- dx_session_data(s)
  columns <- lapply(setdiff(names(d$metadata), ".sample"), function(col) {
    v <- as.character(d$metadata[[col]]); v[trimws(v) == "" | v == "NA"] <- NA
    num <- suppressWarnings(as.numeric(v))
    numeric <- sum(!is.na(num)) >= 6L && sum(!is.na(num)) >= 0.8 * sum(!is.na(v)) && length(unique(num[!is.na(num)])) > 3L
    lev <- sort(table(v), decreasing = TRUE)
    list(name = col, numeric = numeric, missing = sum(is.na(v)),
      levels = if (!numeric && length(lev) <= 12L) lapply(names(lev), function(l) list(level = l, n = as.integer(lev[[l]]))) else list())
  })
  list(samples = length(d$samples), features = nrow(d$prepared), columns = columns)
}

api_diagnostics_landscape <- function(s, body) {
  need <- c("groupColumn", "reference", "target")
  if (!all(need %in% names(body))) api_abort("api_bad_request", "Expected groupColumn, reference and target.")
  d <- dx_session_data(s)
  if (!body$groupColumn %in% names(d$metadata)) api_abort("api_bad_request", "Unknown group column.")
  x <- dx_matrix(d$prepared, d$samples, min_detect = as.numeric(dx_null(body$minDetection, 0.8)))
  tryCatch(dx_landscape(x, d$metadata, body$groupColumn, unlist(body$reference), unlist(body$target),
    ordering_column = dx_null(body$orderingColumn, NULL), subject_column = dx_null(body$subjectColumn, NULL),
    n_nodes = as.integer(dx_null(body$nodes, 12L)), cut = as.numeric(dx_null(body$cut, 0.6)),
    window_fraction = as.numeric(dx_null(body$window, 0.1)), max_inputs = as.integer(dx_null(body$maxInputs, 2L)),
    parsimony = as.numeric(dx_null(body$parsimony, 0.03))),
    error = function(e) api_abort("api_unprocessable", conditionMessage(e)))
}
