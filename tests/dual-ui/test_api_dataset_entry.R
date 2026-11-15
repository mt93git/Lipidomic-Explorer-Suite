# Entry preparation contracts, synthetic workbook and fake Admin boundary only.
for (pkg in c("readxl", "openxlsx", "jsonlite", "digest"))
  if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP entry dependency", pkg, "\n"); quit(status = 0) }
`%||%` <- function(x, y) if (is.null(x)) y else x
source("R/utils_preparation.R")
source("frontends/nexo-api/datasets.R")
stopifnot(isTRUE(api_dataset_required_settings$dropNonDetected$teamControlDefault),
  isTRUE(api_dataset_required_settings$imputeZerosPerFile$teamControlDefault),
  identical(api_dataset_required_settings$imputeRemainingNAtoZero$teamControlDefault, FALSE))
cat("PASS guided workspace defaults pinned\n")
d <- api_dataset_read("tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx")
choices <- tryCatch(api_dataset_choices(d, list()), api_dataset_choices = identity)
stopifnot(identical(choices$payload$sampleGroups$Control_1, "Control"))
d$snapshot$mappings <- d$snapshot$mappings[names(d$snapshot$mappings) != "Group1"]
choices <- tryCatch(api_dataset_choices(d, list()), api_dataset_choices = identity)
stopifnot(is.null(choices$payload$sampleGroups))
cat("PASS sample groups present only with condition mapping\n")
d <- api_dataset_read("tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx")
for (scope in c("global", "group")) for (threshold in c(0, 50, 80, 100)) {
  settings <- list(samples = d$samples, minDetectionPct = threshold, detectionScope = scope, dropNonDetected = TRUE)
  p <- api_dataset_preview(d, settings)
  input <- api_dataset_detection_input(d)
  team <- preparation_detection_preview(input$data, settings$samples, threshold, TRUE, scope, input$metadata)
  stopifnot(p$kept == team$retained, p$total == team$input,
    length(p$leftOut) == team$excluded, sum(vapply(p$histogram, function(x) x$kept + x$leftOut, numeric(1))) == p$total)
}
global <- api_dataset_preview(d, list(samples = d$samples, minDetectionPct = 50, detectionScope = "global", dropNonDetected = TRUE))
group <- api_dataset_preview(d, list(samples = d$samples, minDetectionPct = 50, detectionScope = "group", dropNonDetected = TRUE))
strict <- api_dataset_preview(d, list(samples = d$samples, minDetectionPct = 100, detectionScope = "global", dropNonDetected = TRUE))
stopifnot(group$kept > global$kept, strict$kept < global$kept, global$missing$values > 0)
cat("PASS preview counts match Team and change with scope and threshold\n")
Sys.setenv(LIPIDOMIC_ADMIN_SUPABASE_URL = "https://admin.invalid", LIPIDOMIC_ADMIN_ANON_KEY = "synthetic-anon")
row <- list(dataset_id = "12345678-1234-1234-1234-123456789abc", order_code = "SYN001", version = 2,
  client_id = "12345678-1234-1234-1234-123456789abd", client_name = "Synthetic lab", released_at = "2026-01-01T00:00:00Z", members_prepare = TRUE)
options(lipidomic.admin.http_fetcher = function(method, url, headers, body) {
  if (endsWith(url, "/rpc/nexo_caller")) return(list(status = 200L, body = charToRaw("[]")))
  stopifnot(endsWith(url, "/rpc/nexo_datasets_for_caller"), headers[["Authorization"]] == "Bearer synthetic-user")
  list(status = 200L, body = charToRaw(jsonlite::toJSON(list(row), auto_unbox = TRUE)))
})
listed <- api_datasets_list("Bearer synthetic-user")$datasets[[1]]
stopifnot(identical(listed$adminDatasetId, row$dataset_id), listed$membersPrepare, listed$orderCode == "SYN001",
  listed$clientName == row$client_name, listed$releasedAt == row$released_at, listed$version == 2, listed$clientId == row$client_id)
missing <- tryCatch(api_datasets_list(NULL), api_dataset_admin_error = identity)
stopifnot(missing$status == 401L)
cat("PASS datasets map caller RPC rows and require a token\n")
# ENTRY-INT step 5: Start offers the Excel upload to a client member whose client prepares, even with nothing released:
# the list answers membersPrepare from the caller's nexo_caller rows (the rows api_admin_caller already reads).
caller_rows <- function(on) list(list(caller = "synthetic-member", caller_view = "client",
  client_id = "12345678-1234-1234-1234-123456789abd", members_prepare = on))
for (on in c(TRUE, FALSE)) {
  rm(list = ls(api_admin_caller_cache), envir = api_admin_caller_cache)
  options(lipidomic.admin.http_fetcher = function(method, url, headers, body)
    list(status = 200L, body = charToRaw(jsonlite::toJSON(if (endsWith(url, "/rpc/nexo_caller")) caller_rows(on) else list(), auto_unbox = TRUE))))
  answer <- api_datasets_list("Bearer synthetic-member")
  stopifnot(length(answer$datasets) == 0L, identical(answer$membersPrepare, on))
}
cat("PASS datasets list says whether a client member prepares, with nothing released\n")
