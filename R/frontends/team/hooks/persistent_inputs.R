# Team implementation of the "persistent_inputs" hook (production adapter #15,
# R/frontends/team/violin_statistics.R: team_violin_stats_input_filter).
# Team violin-statistics request events are not persistent study state, so they
# are dropped from saved and restored session inputs. The rest of the Team violin
# statistics feature is R/frontends/team/violin_statistics.R.
team_violin_stats_persistent_filter <- function(filtered, ...) {
  if(!is.list(filtered))return(filtered)
  filtered[!grepl("(^|-)team_violin_stats_request$",names(filtered))]
}
lipidomic_hook_register("persistent_inputs", team_violin_stats_persistent_filter)
