# Group comparison applies Violin statistics' participant independence check:
# repeated, incomplete or ambiguous participant IDs among the compared samples
# block unpaired p-values; unique or unmapped IDs leave results untouched.
if (!exists("%||%")) `%||%` <- function(a, b) if (is.null(a)) b else a
source("R/core/hooks.R")
source("R/frontends/team/hooks/logratio.R")  # participant rules + "logratio_shared_data" hook
source("R/frontends/team/violin_statistics.R")
source("R/modules/utils_stats.R")
df <- data.frame(Lipid_Name = c("PC(34:1)", "PC(36:2)"), S1 = c(1, 2), S2 = c(2, 3), S3 = c(3, 4), S4 = c(4, 5), check.names = FALSE)
hub <- function(meta) list(data_processed = function() df, all_metadata = function() meta)
meta <- function(ids) data.frame(FullName = paste0("S", 1:4), Group1 = c("A", "A", "B", "B"), PatientNumber = ids, stringsAsFactors = FALSE)
samples <- paste0("S", 1:4)

repeated <- team_group_comparison_participants(hub(meta(c("P1", "P2", "P1", "P3"))), samples)
stopifnot(identical(repeated$status, "repeated"), grepl("pseudoreplication", repeated$reason, fixed = TRUE),
          grepl("No p-values were computed", repeated$reason, fixed = TRUE))
# Same wording as Violin statistics for the same samples.
violin_base <- team_violin_stats_base(df, meta(c("P1", "P2", "P1", "P3")), "Group1")
stopifnot(identical(repeated$reason, team_violin_stats_participants(violin_base, c("A", "B"))$reason))

unique_ids <- team_group_comparison_participants(hub(meta(c("P1", "P2", "P3", "P4"))), samples)
stopifnot(identical(unique_ids$status, "unique"), is.null(unique_ids$reason))

unmapped <- team_group_comparison_participants(hub(meta(rep(NA_character_, 4))), samples)
stopifnot(identical(unmapped$status, "absent"), is.null(unmapped$reason))

incomplete <- team_group_comparison_participants(hub(meta(c("P1", NA, "P3", "P4"))), samples)
stopifnot(identical(incomplete$status, "incomplete"), !is.null(incomplete$reason))

# Only the compared samples count: a repeat outside them does not block.
outside <- team_group_comparison_participants(hub(meta(c("P1", "P2", "P3", "P1"))), samples[1:3])
stopifnot(identical(outside$status, "unique"))

# Without prepared data the check abstains rather than blocking.
stopifnot(is.null(team_group_comparison_participants(list(data_processed = function() NULL, all_metadata = function() NULL), samples)$reason))
# A one-lipid selection is still checked (participants do not depend on lipids).
one <- df[1, , drop = FALSE]
one_lipid <- team_group_comparison_participants(list(data_processed = function() one, all_metadata = function() meta(c("P1", "P2", "P1", "P3"))), samples)
stopifnot(identical(one_lipid$status, "repeated"))

# The policy handed to the log-ratio module withholds unpaired p-values for every
# output it produces; paired policy and a design that already refuses are unchanged.
guard <- function(ids, allowed = TRUE) {
  h <- hub(meta(ids)); h$inference_allowed <- function(paired = FALSE) allowed
  team_group_comparison_guarded_data(h)
}
shiny::isolate({
  g <- guard(c("P1", "P2", "P1", "P3"))
  stopifnot(identical(g$inference_allowed(FALSE), FALSE), identical(g$inference_allowed(paired = TRUE), TRUE),
            identical(g$participant_reason(), repeated$reason))
  # The module's own p-value helper (used by the plot, CSV, PDF and ZIP paths) is withheld.
  x <- c(1, 2, 3, 4); y <- c(2, 4, 5, 7)
  stopifnot(is.na(guided_local_p_value(x, y, "non_parametric", NULL, g, FALSE)))
  g <- guard(c("P1", "P2", "P3", "P4"))
  stopifnot(identical(g$inference_allowed(FALSE), TRUE), is.null(g$participant_reason()),
            isTRUE(all.equal(guided_local_p_value(x, y, "non_parametric", NULL, g, FALSE), wilcox.test(x, y, exact = FALSE)$p.value)))
  g <- guard(c("P1", "P2", "P1", "P3"), allowed = FALSE)
  stopifnot(identical(g$inference_allowed(FALSE), FALSE))
})
# Every log-ratio card (the original one and Group comparison) runs the same
# module, which applies the guarded policy once through the hook.
received <- lipidomic_hook("logratio_shared_data")(hub(meta(c("P1", "P2", "P1", "P3"))) |> within(inference_allowed <- function(paired = FALSE) TRUE))
shiny::isolate(stopifnot(identical(received$inference_allowed(FALSE), FALSE), identical(received$participant_reason(), repeated$reason)))
received <- lipidomic_hook("logratio_shared_data")(hub(meta(c("P1", "P2", "P3", "P4"))) |> within(inference_allowed <- function(paired = FALSE) TRUE))
shiny::isolate(stopifnot(identical(received$inference_allowed(FALSE), TRUE)))
# Group comparison does not guard a second time: it calls logratio_server directly.
gc_src <- paste(readLines("R/frontends/team/group_comparison.R"), collapse = "\n")
stopifnot(grepl("result <- logratio_server(id, shared_data, global_color_map)", gc_src, fixed = TRUE),
          !grepl("team_group_comparison_guarded_data(shared_data)", gc_src, fixed = TRUE))
cat("PASS: group comparison uses Violin statistics' participant independence check\n")
