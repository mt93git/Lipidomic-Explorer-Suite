source('R/modules/utils_stats.R')

fake_session <- list()
classic <- list(inference_allowed = function(paired = FALSE) TRUE)
stopifnot(guided_local_inference_allowed(fake_session, classic))
classic_p <- guided_local_p_value(c(1, 2, 3, 4), c(5, 6, 7, 8),
  'non_parametric', fake_session, classic)
stopifnot(is.finite(classic_p))
team <- list(inference_allowed = function(paired = FALSE) !paired)
stopifnot(guided_local_inference_allowed(fake_session, team))
stopifnot(!guided_local_inference_allowed(fake_session, team, paired = TRUE))
team$inference_allowed <- function(paired = FALSE) FALSE
stopifnot(is.na(guided_local_p_value(c(1, 2, 3, 4), c(5, 6, 7, 8),
  'non_parametric', fake_session, team)))
stopifnot(!guided_local_inference_allowed(fake_session, list()))

caption <- as.character(get_journal_caption('volcano', contrast_info = list(
  comp = '<img src=x onerror=alert(1)>', ref = 'Control & more'),
  selected_features = '<svg onload=alert(1)>'))
stopifnot(!grepl('<img|<svg', caption),
  grepl('&lt;img', caption, fixed = TRUE),
  grepl('&lt;svg', caption, fixed = TRUE))
cat('PASS: frontend-specific local inference and escaped captions\n')
