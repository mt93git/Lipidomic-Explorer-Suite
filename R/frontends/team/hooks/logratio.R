# Team implementations of the log-ratio hooks (R/modules/9_logratio_module.R).
# Ported from production's descriptive_inference_labels_adapter.R (#6) and the
# participant guard in group_comparison.R (#7); behaviour and messages unchanged.

# --- #6 violin_export_table(df, session, shared_data) -> df ------------------
# Team exports must distinguish an unavailable test from a nonsignificant result.
# Only the two violin CSV writers call this; plot filtering and the shared
# analysis data remain unchanged.
team_violin_export_labels <- function(df, session, shared_data) {
  missing_test <- is.na(df$P_Value) & !is.na(df$Is_Baseline) & !df$Is_Baseline
  df$Significance[missing_test] <- "Not tested"
  df
}
lipidomic_hook_register("violin_export_table", team_violin_export_labels)

# --- #7 logratio_shared_data(shared_data) -> shared_data ----------------------
# Participant-independence rule shared with Violin statistics (production
# R/frontends/team/violin_statistics.R, copied verbatim; that file defines the
# same functions identically when it arrives).
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

# From production group_comparison.R (verbatim).
# Participant independence over the compared samples, reusing Violin statistics'
# rules (PatientNumber, else Patient_ID; repeated, incomplete or ambiguous IDs block).
team_group_comparison_participants <- function(shared_data, samples) {
  df <- tryCatch(shared_data$data_processed(), error = function(e) NULL)
  meta <- tryCatch(shared_data$all_metadata(), error = function(e) NULL)
  # Participants do not depend on lipids; a one-lipid selection must still be checked.
  if (is.data.frame(df) && nrow(df) == 1L) df <- df[c(1L, 1L), , drop = FALSE]
  base <- tryCatch(team_violin_stats_base(df, meta, "Group1"), error = function(e) NULL)
  if (is.null(base) || !length(samples)) return(list(status = "unknown", reason = NULL))
  base$group <- ifelse(base$samples %in% samples, "compared", "other")
  team_violin_stats_participants(base, "compared")
}

# What to do instead when participant IDs repeat under an independent design.
team_pseudoreplication_recommendation <- "Recommendation: analyse these samples as paired or repeated measures (set the study design to Matched or repeated and use a paired comparison), so each participant's samples are compared within that participant."

# Participant reason over every prepared sample that has metadata (the samples
# the log-ratio module and the Differential analysis engine draw from), or NULL.
# The same rule as team_group_comparison_guarded_data() below.
team_group_comparison_participant_reason <- function(shared_data) {
  compared <- function() {
    df <- shared_data$data_processed(); meta <- shared_data$all_metadata()
    if (!is.data.frame(df) || !is.data.frame(meta) || !'FullName' %in% names(meta)) return(character())
    intersect(setdiff(colnames(df), 'Lipid_Name'), as.character(meta$FullName))
  }
  shiny::reactive(tryCatch(team_group_comparison_participants(shared_data, compared())$reason, error = function(e) NULL))
}

# The log-ratio module compares every prepared sample that has metadata and gets
# each p-value from shared_data$inference_allowed. Giving it a copy whose unpaired
# policy also requires participant independence withholds p-values in every output
# it produces (plot data, CSV, PDF and ZIP exports), not only on the Canvas card.
team_group_comparison_guarded_data <- function(shared_data) {
  policy <- shared_data$inference_allowed
  if (!is.function(policy)) return(shared_data)
  compared <- function() {
    df <- shared_data$data_processed(); meta <- shared_data$all_metadata()
    if (!is.data.frame(df) || !is.data.frame(meta) || !'FullName' %in% names(meta)) return(character())
    intersect(setdiff(colnames(df), 'Lipid_Name'), as.character(meta$FullName))
  }
  reason <- shiny::reactive(tryCatch(team_group_comparison_participants(shared_data, compared())$reason, error = function(e) NULL))
  guarded <- shared_data
  guarded$participant_reason <- function() reason()
  guarded$inference_allowed <- function(paired = FALSE) {
    if (!isTRUE(policy(paired = paired))) return(FALSE)
    isTRUE(paired) || is.null(reason())
  }
  guarded
}

# Every log-ratio card ("Violin Plots · Logratio") receives the guarded policy.
lipidomic_hook_register("logratio_shared_data", function(shared_data, ...) team_group_comparison_guarded_data(shared_data))
