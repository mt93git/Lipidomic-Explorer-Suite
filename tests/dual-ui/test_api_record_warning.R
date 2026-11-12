# Synthetic project records only; Team warns strictly above 80,000 counted nodes.
source('frontends/nexo-api/storage.R')
bytes <- function(n) charToRaw(jsonlite::toJSON(list(history = rep(list('x'), n)), auto_unbox = TRUE))
stopifnot(!api_project_records_near_limit(NULL))
stopifnot(!api_project_records_near_limit(bytes(39999L)))
stopifnot(api_project_records_near_limit(bytes(40000L)))
cat('PASS API checkpoint records near-limit boundary\n')
# FIX-PROD-C 2: the threshold is Team's own warning point, 80 % of Team's real limit (R/frontends/team/project_records.R
# team_project_records_node_limit, enforced by team_project_records_validate when Team saves), counted Team's way.
team <- new.env(); sys.source('R/frontends/team/project_records.R', envir = team)
for (n in c(39999L, 40000L, 49999L, 50000L)) {
  record <- list(history = rep(list('x'), n))
  team_says <- team$team_project_records_nodes(record) > 0.8 * team$team_project_records_node_limit
  if (!identical(api_project_records_near_limit(bytes(n)), team_says)) stop('API and Team disagree at ', n, ' history rows')
}
stopifnot(team$team_project_records_node_limit == 100000L)
cat('PASS API near-limit threshold is 80 % of Team\'s project-records limit (', team$team_project_records_node_limit, 'nodes )\n')
