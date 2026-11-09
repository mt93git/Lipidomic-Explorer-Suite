# Synthetic project records only; Team warns strictly above 80,000 counted nodes.
source('R/frontends/api/storage.R')
bytes <- function(n) charToRaw(jsonlite::toJSON(list(history = rep(list('x'), n)), auto_unbox = TRUE))
stopifnot(!api_project_records_near_limit(NULL))
stopifnot(!api_project_records_near_limit(bytes(39999L)))
stopifnot(api_project_records_near_limit(bytes(40000L)))
cat('PASS API checkpoint records near-limit boundary\n')
