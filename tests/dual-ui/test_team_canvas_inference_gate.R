# Cards name why the unpaired comparison is refused, and longitudinal readiness comes from
# the metadata time points, not from run-dependent selectors.
# Run with: Rscript --vanilla tests/dual-ui/test_team_canvas_inference_gate.R
`%||%` <- function(a, b) if (is.null(a)) b else a
src <- parse('R/frontends/team/plot_instances.R', keep.source = FALSE)
for (e in src) if (is.call(e) && identical(e[[1]], as.name('<-')) &&
  as.character(e[[2]]) %in% c('team_canvas_inference_gate', 'team_canvas_timepoints_available')) eval(e)
ready <- list(status = 'ready', dirty = FALSE, data_available = TRUE)
g <- team_canvas_inference_gate
stopifnot(
  identical(g(TRUE), 'ok'),
  is.na(g(NULL)),
  identical(g(FALSE, FALSE, '', 'independent', ready), 'design'),
  identical(g(FALSE, FALSE, 'Mouse', NULL, ready), 'design'),
  identical(g(FALSE, FALSE, 'Mouse', 'independent', ready), 'design'),        # not confirmed
  identical(g(FALSE, TRUE, 'Mouse', 'paired', ready), 'paired'),              # confirmed paired
  identical(g(FALSE, FALSE, 'Mouse', 'paired', ready), 'design'),             # paired, not confirmed
  identical(g(FALSE, FALSE, 'Mouse', 'uncertain', ready), 'uncertain'),
  identical(g(FALSE, FALSE, 'Mouse', 'independent', list(status = 'pending', dirty = TRUE, data_available = TRUE)), 'preparation'),
  identical(g(FALSE, FALSE, 'Mouse', 'independent', list(status = 'empty', dirty = FALSE, data_available = FALSE)), 'preparation'),
  identical(g(FALSE, FALSE, 'Mouse', 'independent', ready, synthetic_ids = 'avg_1'), 'measured')
)
tp <- team_canvas_timepoints_available
stopifnot(
  is.na(tp(NULL)),
  identical(tp(data.frame(Group1 = c('A', 'B'))), FALSE),
  identical(tp(data.frame(TimePoint = c('Day 0', 'Day 0', 'Unspecified'))), FALSE),
  identical(tp(data.frame(TimePoint = c('Day 0', 'Day 14', NA))), TRUE)
)
code <- paste(readLines('R/frontends/team/plot_instances.R'), collapse = '\n')
stopifnot(grepl("gate=gate", code, fixed = TRUE), grepl("timepoints=team_canvas_timepoints_available", code, fixed = TRUE))
cat('PASS cards get the actual inference refusal (design / paired / uncertain / preparation / measured) and metadata time points\n')
