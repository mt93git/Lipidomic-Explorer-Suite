# Team Review shell: sends the condition of each sample, the shared condition
# palette and recorded exclusion reasons to the browser. Presentation only; the
# PCA scores, exclusions and prepared data are untouched.
team_review_groups <- function(meta, palette_settings = NULL) {
  if (!is.data.frame(meta) || !"FullName" %in% names(meta) || !nrow(meta)) return(NULL)
  column <- if ("Group1" %in% names(meta) && length(unique(meta$Group1)) > 1) "Group1"
    else if ("Group2" %in% names(meta)) "Group2" else NULL
  if (is.null(column)) return(NULL)
  groups <- as.character(meta[[column]])
  keep <- !is.na(groups) & nzchar(groups) & !is.na(meta$FullName)
  groups <- groups[keep]; samples <- as.character(meta$FullName[keep])
  levels <- unique(groups)
  colors <- rd_team_resolved_condition_colors(levels, palette_settings, column)
  list(column = column, levels = as.list(levels),
       samples = as.list(stats::setNames(groups, samples)),
       colors = as.list(stats::setNames(unname(colors), levels)))
}

team_review_reasons <- function(decisions) {
  parsed <- tryCatch(as.data.frame(decisions, stringsAsFactors = FALSE), error = function(e) NULL)
  if (is.null(parsed) || !all(c("sample", "action", "reason") %in% names(parsed))) return(list())
  excluded <- parsed[parsed$action == "Exclude" & !is.na(parsed$reason) & parsed$reason != "Not recorded", , drop = FALSE]
  if (!nrow(excluded)) return(list())
  as.list(stats::setNames(as.character(excluded$reason), as.character(excluded$sample)))
}

team_review_shell_server <- function(session, shared_data) {
  observe({
    payload <- team_review_groups(rd_value(shared_data$all_metadata), rd_value(shared_data$palette_settings))
    if (!is.null(payload)) session$sendCustomMessage("team-review-groups", payload)
  })
  observe({
    reasons <- if (is.function(shared_data$restored_qc_decisions)) team_review_reasons(rd_value(shared_data$restored_qc_decisions)) else list()
    session$sendCustomMessage("team-review-reasons", list(reasons = reasons))
  })
  invisible(NULL)
}
