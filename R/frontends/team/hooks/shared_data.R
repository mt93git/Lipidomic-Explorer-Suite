# Team: Differential analysis is not blocked for repeated participants, but its
# views warn when an independent design has participant IDs that repeat across
# the prepared samples (see participant_warning.R).
team_shared_data_participant_reason <- function(shared_data) {
  team_da_reason <- team_group_comparison_participant_reason(shared_data)
  shared_data$team_da_participant_reason <- function() {
    if (isTRUE(shared_data$inference_allowed(FALSE))) team_da_reason() else NULL
  }
  shared_data
}
lipidomic_hook_register("shared_data", team_shared_data_participant_reason)
