# Numerical and design contract for Team Canvas violin statistics.
# Reference values come from base R stats functions and hand formulas.
if (!exists("%||%")) `%||%` <- function(a, b) if (is.null(a)) b else a
source("R/hooks.R"); source("R/frontends/team/hooks/logratio.R")  # shared participant rules
source("R/frontends/team/violin_statistics.R")
fails <- function(expr, pattern = NULL) {
  e <- tryCatch({ force(expr); NULL }, error = identity)
  stopifnot(inherits(e, "error"))
  if (!is.null(pattern)) stopifnot(grepl(pattern, conditionMessage(e)))
}
near <- function(a, b, tol = 1e-12) isTRUE(all.equal(a, b, tolerance = tol))

# ---- Pairwise tests against stats:: on the classic sleep data -------------
x <- sleep$extra[sleep$group == 1]; y <- sleep$extra[sleep$group == 2]
welch <- team_violin_stats_pair(x, y, "welch", "hedges_g")
ref <- stats::t.test(y, x, var.equal = FALSE)
stopifnot(identical(welch$p, ref$p.value), identical(welch$statistic, unname(ref$statistic)),
          identical(welch$df, unname(ref$parameter)), abs(welch$p - 0.07939414) < 1e-6, welch$statistic > 0)
# Hedges' g, pooled SD and exact J = Gamma(9) / (sqrt(9) Gamma(8.5)) for df = 18.
sp <- sqrt((9 * var(x) + 9 * var(y)) / 18)
stopifnot(near(welch$effect, gamma(9) / (sqrt(9) * gamma(8.5)) * (mean(y) - mean(x)) / sp), abs(welch$effect - 0.797) < 2e-3)
# Never Student's pooled-variance t-test, never paired by vector order.
stopifnot(!identical(welch$p, stats::t.test(y, x, var.equal = TRUE)$p.value),
          !identical(welch$p, stats::t.test(y, x, paired = TRUE)$p.value))

wilcox <- team_violin_stats_pair(x, y, "wilcoxon", "cliffs_delta")
wref <- suppressWarnings(stats::wilcox.test(y, x, exact = NULL, correct = TRUE))
stopifnot(identical(wilcox$p, wref$p.value), identical(wilcox$statistic, unname(wref$statistic)), is.na(wilcox$df),
          abs(wilcox$p - 0.06933) < 1e-4, grepl("Ties", wilcox$note))
brute <- mean(vapply(y, function(b) mean(sign(b - x)), numeric(1)))
stopifnot(near(wilcox$effect, brute), near(wilcox$effect, 2 * unname(wref$statistic) / (length(x) * length(y)) - 1))
exact <- team_violin_stats_pair(c(1.1, 2.3, 3.5, 4.2), c(5.1, 6.3, 7.2, 8.4, 9.9), "wilcoxon")
stopifnot(near(exact$p, 2 / choose(9, 4)), identical(exact$note, ""), is.na(exact$effect))
stopifnot(identical(team_violin_stats_cliffs_delta(1:3, 4:6), 1), identical(team_violin_stats_cliffs_delta(4:6, 1:3), -1))

small <- team_violin_stats_pair(1, c(2, 3), "welch")
constant <- team_violin_stats_pair(c(2, 2, 2), c(2, 2), "welch")
stopifnot(is.na(small$p), grepl("Fewer than 2", small$note), is.na(constant$p), grepl("constant", constant$note))

# ---- Multiplicity: declared m, untestable tests count, none is identity -----
p <- c(0.01, 0.04, NA, 0.03)
for (method in c("holm", "BH", "bonferroni"))
  stopifnot(identical(team_violin_stats_adjust(p, method, 4L), stats::p.adjust(p, method, n = 4L)))
stopifnot(near(team_violin_stats_adjust(p, "holm", 4L), c(0.04, 0.09, NA, 0.09)),
          near(team_violin_stats_adjust(p, "bonferroni", 4L), c(0.04, 0.16, NA, 0.12)),
          identical(team_violin_stats_adjust(p, "none", 4L), p))

# ---- End-to-end on prepared values exactly as drawn ------------------------
df <- data.frame(Lipid = c("PC(34:1)", "PE(36:2)", "TG(50:1)"),
  S1 = c(10, 50, 100), S2 = c(12, 55, 90), S3 = c(15, 0, 120), S4 = c(-1, 60, 95),
  S5 = c(20, 70, 110), S6 = c(25, 75, NA), S7 = c(22, 80, 140), S8 = c(30, 66, 150),
  S9 = c(18, 52, 101), S10 = c(16, 58, 99), S11 = c(14, 61, 97), check.names = FALSE)
meta <- data.frame(FullName = names(df)[-1], Group1 = rep(c("A", "B", "C"), c(4, 4, 3)), Group2 = "Plasma",
                   PatientNumber = "Unspecified", stringsAsFactors = FALSE)
# Replace whole fields: modifyList() would merge unnamed comparison lists.
settings <- function(...) {
  out <- list(test = "welch", correction = "holm", scope = "displayed",
              comparisons = list(c("A", "B"), c("A", "C"), c("B", "C")), effect = "none")
  override <- list(...); out[names(override)] <- override; out
}
base <- team_violin_stats_base(df, meta, "Group1")
frame <- team_violin_stats_frame(base, "PC(34:1)")
stopifnot(identical(frame$Sample, c("S1", "S2", "S3", "S5", "S6", "S7", "S8", "S9", "S10", "S11")),
          identical(frame$Value, log10(c(10, 12, 15, 20, 25, 22, 30, 18, 16, 14))))
# The dashboard's violin_data() frame is accepted only when it is identical.
drawn <- data.frame(Sample = frame$Sample, Group = frame$Group, Lipid = "PC(34:1)",
                    Prepared_abundance = 10^frame$Value, Log10_abundance = frame$Value, stringsAsFactors = FALSE)
stopifnot(team_violin_stats_matches(drawn, frame, "PC(34:1)"))
moved <- drawn; moved$Log10_abundance[[1]] <- moved$Log10_abundance[[1]] + 1e-9
stopifnot(!team_violin_stats_matches(moved, frame, "PC(34:1)"), !team_violin_stats_matches(drawn, frame, "PE(36:2)"))

ok <- team_violin_stats_compute(base, "PC(34:1)", settings(), audit = list(normalization = "PQN", imputation = "No imputation"),
                                computed_at = as.POSIXct("2026-10-30 12:00:00", tz = "UTC"))
stopifnot(identical(ok$status, "ok"), identical(ok$result$family$m, 3L), identical(ok$result$family$features, 1L),
          identical(ok$result$computedAt, "2026-10-30T12:00:00.000Z"), identical(ok$result$provenance$participantIds, "absent"))
v <- split(frame$Value, frame$Group)
raw <- c(t.test(v$B, v$A)$p.value, t.test(v$C, v$A)$p.value, t.test(v$C, v$B)$p.value)
rows <- ok$result$rows
stopifnot(identical(vapply(rows, `[[`, numeric(1), "p"), raw),
          identical(vapply(rows, `[[`, numeric(1), "pAdj"), p.adjust(raw, "holm")),
          identical(vapply(rows, `[[`, integer(1), "nA"), c(3L, 3L, 4L)))
groups <- ok$result$groups
stopifnot(identical(vapply(groups, `[[`, character(1), "group"), c("A", "B", "C")),
          identical(vapply(groups, `[[`, integer(1), "nSamples"), c(3L, 4L, 3L)),
          identical(vapply(groups, `[[`, integer(1), "nExcluded"), c(1L, 0L, 0L)),
          all(vapply(groups, function(g) is.null(g$nParticipants), logical(1))))

# Declared family across every lipid in scope: m = 3 lipids x 3 comparisons.
family <- team_violin_stats_compute(base, "PC(34:1)", settings(scope = "all_in_scope", correction = "BH"))
all_p <- unlist(lapply(rownames(base$mat), function(lipid) {
  f <- team_violin_stats_frame(base, lipid); g <- split(f$Value, factor(f$Group, c("A", "B", "C")))
  c(t.test(g$B, g$A)$p.value, t.test(g$C, g$A)$p.value, t.test(g$C, g$B)$p.value)
}))
stopifnot(identical(family$result$family$m, 9L), identical(family$result$family$features, 3L),
          identical(vapply(family$result$rows, `[[`, numeric(1), "pAdj"), p.adjust(all_p, "BH", n = 9L)[1:3]),
          grepl("m = 9 tests", family$result$provenance$method))
# A subset of comparisons is a different declared family, never a hidden annotation.
one <- team_violin_stats_compute(base, "PC(34:1)", settings(comparisons = list(c("A", "B"))))
stopifnot(identical(one$result$family$m, 1L), identical(one$result$rows[[1]]$pAdj, raw[[1]]))
wil <- team_violin_stats_compute(base, "PC(34:1)", settings(test = "wilcoxon", effect = "cliffs_delta", correction = "none"))
stopifnot(identical(wil$result$rows[[1]]$p, suppressWarnings(wilcox.test(v$B, v$A, exact = NULL, correct = TRUE))$p.value),
          identical(wil$result$rows[[1]]$pAdj, wil$result$rows[[1]]$p),
          near(wil$result$rows[[1]]$effect, mean(sign(outer(v$B, v$A, "-")))))

# ---- Settings are validated before any test -------------------------------
fails(team_violin_stats_compute(base, "PC(34:1)", settings(effect = "cliffs_delta")), "does not match")
fails(team_violin_stats_compute(base, "PC(34:1)", settings(comparisons = list(c("A", "Z")))), "not in this plot")
fails(team_violin_stats_compute(base, "PC(34:1)", settings(comparisons = list(c("A", "B"), c("B", "A")))), "only once")
fails(team_violin_stats_compute(base, "PC(34:1)", settings(comparisons = list())), "between 1 and 45")
fails(team_violin_stats_compute(base, "PC(34:1)", settings(test = "paired_t")), "Unsupported")
fails(team_violin_stats_compute(base, "PC(34:1)", settings(comparisons = list(c("A", "Unassigned")))), "not in this plot")
fails(team_violin_stats_compute(base, "missing lipid", settings()), "not in the prepared data")

# ---- Pseudoreplication and design gates: no p-values, never averaging -------
repeated <- meta; repeated$PatientNumber <- c("P1", "P2", "P3", "P4", "P1", "P2", "P3", "P4", "P9", "P10", "P11")
blocked <- team_violin_stats_compute(team_violin_stats_base(df, repeated, "Group1"), "PC(34:1)", settings())
stopifnot(identical(blocked$status, "blocked"), is.null(blocked$result), grepl("pseudoreplication", blocked$reason),
          grepl("never averaged", blocked$reason), !grepl("P1", blocked$reason, fixed = TRUE))
within <- meta; within$PatientNumber <- c("P1", "P1", "P2", "P3", paste0("Q", 1:7))
stopifnot(identical(team_violin_stats_compute(team_violin_stats_base(df, within, "Group1"), "PC(34:1)", settings())$status, "blocked"))
# Comparisons that do not involve the repeated participant are independent.
only_c <- meta; only_c$PatientNumber <- c("P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P1", "P10", "P11")
stopifnot(identical(team_violin_stats_compute(team_violin_stats_base(df, only_c, "Group1"), "PC(34:1)", settings(comparisons = list(c("A", "B"))))$status, "ok"),
          identical(team_violin_stats_compute(team_violin_stats_base(df, only_c, "Group1"), "PC(34:1)", settings())$status, "blocked"))
partial <- meta; partial$PatientNumber[1:5] <- paste0("P", 1:5)
incomplete <- team_violin_stats_compute(team_violin_stats_base(df, partial, "Group1"), "PC(34:1)", settings())
stopifnot(identical(incomplete$status, "blocked"), grepl("cannot be verified", incomplete$reason))
unique_ids <- meta; unique_ids$PatientNumber <- paste0("P", seq_len(nrow(meta)))
counted <- team_violin_stats_compute(team_violin_stats_base(df, unique_ids, "Group1"), "PC(34:1)", settings())
stopifnot(identical(counted$result$provenance$participantIds, "unique"),
          identical(vapply(counted$result$groups, `[[`, integer(1), "nParticipants"), c(3L, 4L, 3L)),
          identical(vapply(counted$result$rows, `[[`, numeric(1), "p"), raw))
design <- team_violin_stats_compute(base, "PC(34:1)", settings(), design = list(allowed = FALSE, reason = "Paired design."))
stopifnot(identical(design$status, "blocked"), identical(design$reason, "Paired design."), is.null(design$result))
policy <- function(value) list(inference_allowed = function(paired = FALSE) { stopifnot(identical(paired, FALSE)); value })
stopifnot(isTRUE(team_violin_stats_design(policy(TRUE))$allowed),
          grepl("matched or repeated", team_violin_stats_design(policy(FALSE), "paired")$reason),
          grepl("uncertain", team_violin_stats_design(policy(FALSE), "uncertain")$reason),
          !team_violin_stats_design(list())$allowed)

# ---- Fingerprints follow data, lipid, grouping and participant IDs ----------
fp <- team_violin_stats_fingerprint(base, "PC(34:1)")
stopifnot(identical(fp, team_violin_stats_fingerprint(team_violin_stats_base(df, meta, "Group1"), "PC(34:1)")),
          !identical(fp, team_violin_stats_fingerprint(base, "PE(36:2)")),
          !identical(fp, team_violin_stats_fingerprint(team_violin_stats_base(df, meta, "Group2"), "PC(34:1)")),
          !identical(fp, team_violin_stats_fingerprint(team_violin_stats_base(df, unique_ids, "Group1"), "PC(34:1)")),
          grepl("^[a-f0-9]{64}$", fp))
changed <- df; changed$S1[[1]] <- 11
stopifnot(!identical(fp, team_violin_stats_fingerprint(team_violin_stats_base(changed, meta, "Group1"), "PC(34:1)")))

# ---- Request envelope ------------------------------------------------------
good <- list(requestId = "tcs1_a", instanceId = "tcinstance_abc", mode = "check", dataFingerprint = fp)
stopifnot(identical(team_violin_stats_request(good)$dataFingerprint, fp))
fails(team_violin_stats_request(modifyList(good, list(instanceId = "results_dashboard"))), "Invalid")
fails(team_violin_stats_request(modifyList(good, list(mode = "eval"))), "Invalid")
fails(team_violin_stats_request(modifyList(good, list(dataFingerprint = "abc"))), "Invalid")

# ---- Wiring: Team-only source, client loaded before the canvas ---------------
# Team files load only through the Team bootstrap (end of R/global.R).
bootstrap <- readLines("R/frontends/team/bootstrap.R", warn = FALSE)
stopifnot(sum(grepl('source("R/frontends/team/violin_statistics.R")', bootstrap, fixed = TRUE)) == 1L,
          !any(grepl("violin_statistics", readLines("R/global.R", warn = FALSE), fixed = TRUE)))
team_ui <- paste(readLines("R/frontends/team/ui.R", warn = FALSE), collapse = "\n")
stopifnot(regexpr("canvas_statistics.js", team_ui, fixed = TRUE) < regexpr('www/team/js/canvas.js"', team_ui, fixed = TRUE))
stopifnot(!any(grepl("team_violin_stats", c(readLines("R/modules/utils_stats.R", warn = FALSE), readLines("R/frontends/classic/ui.R", warn = FALSE)))))

cat("PASS: violin statistics match stats::t.test/wilcox.test/p.adjust, declared families, drawn values, pseudoreplication and design gates\n")

# Identifier aliases block inference; Patient_ID is accepted as a mapped fallback.
alias_df<-data.frame(Lipid=c("L1","L2"),S1=c(1,2),S2=c(2,3),S3=c(3,4),S4=c(4,5))
alias_md<-data.frame(FullName=names(alias_df)[-1],Group1=c("A","A","B","B"),Patient_ID=c("P012","12","x1","x2"))
alias_base<-team_violin_stats_base(alias_df,alias_md,"Group1")
stopifnot(identical(alias_base$participant,alias_md$Patient_ID),team_violin_stats_participants(alias_base,c("A","B"))$status=="ambiguous")
counts<-team_violin_stats_group_summary(alias_base,team_violin_stats_frame(alias_base,"L1"),"ambiguous")
stopifnot(counts[[1]]$nSamples==2L,is.null(counts[[1]]$nParticipants))
cat("PASS identifier fallback/alias guard and descriptive counts independent of inference\n")

source("R/frontends/team/hooks/persistent_inputs.R")  # Team "persistent_inputs" hook
filtered<-team_violin_stats_persistent_filter(list(team_violin_stats_request=list(mode="apply"),kept="study setting"))
stopifnot(identical(filtered,list(kept="study setting")))
cat("PASS Team transient statistics requests cannot replay through saved session inputs\n")

repeat_md<-alias_md;repeat_md$Patient_ID<-c("P1","P1","P2","P3");repeat_base<-team_violin_stats_base(alias_df,repeat_md,"Group1");repeat_counts<-team_violin_stats_group_summary(repeat_base,team_violin_stats_frame(repeat_base,"L1"),"repeated");stopifnot(repeat_counts[[1]]$nSamples==2L,repeat_counts[[1]]$nParticipants==1L,team_violin_stats_participants(repeat_base,c("A","B"))$status=="repeated");cat("PASS repeated subjects have truthful descriptive counts without permitting inference\n")

# IDs mapped elsewhere cannot make missing comparison-group IDs independent.
missing_compared <- meta; missing_compared$PatientNumber <- NA_character_; only_third <- missing_compared$Group1 == "C"; missing_compared$PatientNumber[only_third] <- paste0("C",seq_len(sum(only_third)))
missing_compared$Patient_ID <- rep("repeated-id",nrow(missing_compared))
missing_base <- team_violin_stats_base(df,missing_compared,"Group1")
stopifnot(missing_base$participant_field == "PatientNumber",team_violin_stats_participants(missing_base,c("A","B"))$status == "incomplete",team_violin_stats_compute(missing_base,"PC(34:1)",settings(comparisons=list(c("A","B"))))$status == "blocked")
cat("PASS three-group partial ID mapping blocks missing comparison-group identifiers\n")
