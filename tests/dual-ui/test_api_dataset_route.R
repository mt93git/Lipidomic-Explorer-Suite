# POST /api/v1/datasets/sessions through plumber's router in this process (plumber.R parsing,
# samesite filter, run.R's serializer): multipart upload, typed 422, stored datasetId, 404.
for (pkg in c("plumber"))
  if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP test_api_dataset_route: package", pkg, "not installed\n"); quit(status = 0) }
for (pkg in c("jsonlite"))
  if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv("LIPIDOMIC_ADMIN_REQUIRE_USER")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_dataset_route")
source("frontends/nexo-api/engine.R")
fixture <- "tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx"
store <- tempfile("dataset-store-"); dir.create(store)
Sys.setenv(LIPIDOMIC_STORAGE_DIR = store, LIPIDOMIC_API_WORKSPACE = "route-test")
# A released dataset in the storage layer, written by the files backend itself.
stored <- api_store()$save("route-test-datasets", fixture, "synthetic dataset")
api_run_dir <- normalizePath("frontends/nexo-api"); root <- getwd()
router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_run_dir, "plumber.R")),
  plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
setwd(root)
router <- plumber::pr_hook(router, "preroute", function() setwd(root))
call <- function(method, path, type = NULL, body = raw(), authorization = NULL) {
  req <- new.env()
  req$HTTP_AUTHORIZATION <- authorization
  req$REQUEST_METHOD <- method; req$PATH_INFO <- path; req$QUERY_STRING <- ""
  if (!is.null(type)) req$HTTP_CONTENT_TYPE <- type
  req$rook.input <- list(read = function(l = -1L) body, rewind = function() invisible(0L))
  out <- router$call(req)
  list(status = as.integer(out$status), body = jsonlite::fromJSON(as.character(out$body), simplifyVector = FALSE))
}
multipart <- function(path, settings) {
  boundary <- "nexo-dataset-test-boundary"
  part <- function(head, value) c(charToRaw(paste0("--", boundary, "\r\n", head, "\r\n\r\n")), value, charToRaw("\r\n"))
  body <- c(part('Content-Disposition: form-data; name="file"; filename="released.xlsx"\r\nContent-Type: application/octet-stream',
      readBin(path, "raw", file.info(path)$size)),
    part('Content-Disposition: form-data; name="settings"', charToRaw(jsonlite::toJSON(settings, auto_unbox = TRUE))),
    charToRaw(paste0("--", boundary, "--\r\n")))
  call("POST", "/api/v1/datasets/sessions", paste0("multipart/form-data; boundary=", boundary), body)
}
json <- function(path, x, authorization = NULL) call("POST", path, "application/json", charToRaw(jsonlite::toJSON(x, auto_unbox = TRUE)), authorization)
settings <- list(samples = c("Control_1", "Control_2", "Control_3", "Treated_1", "Treated_2", "Treated_3"),
  minDetectionPct = 50, detectionScope = "global", dropNonDetected = TRUE, normalizationMethod = "median",
  useImputation = TRUE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = FALSE)

missing <- multipart(fixture, list(samples = settings$samples))
stopifnot(missing$status == 422L, identical(missing$body$reason, "preparation_choices_required"),
  length(missing$body$missing) == 7L, length(missing$body$availableSamples) == 6L,
  identical(missing$body$missing[[1L]]$name, "minDetectionPct"))
cat("PASS route 422 lists the missing choices\n")
opened <- multipart(fixture, settings)
session <- opened$body
stopifnot(opened$status == 200L, nzchar(session$sessionId), nchar(session$checkpointSha256) == 64L,
  identical(session$preparation$check, "prepared from dataset v1"), session$samples == 6L,
  identical(session$canvas$version, "1"), length(session$canvas$nodes) == 0L,
  identical(session$dataset$sha256, stored$sha256), identical(session$dataset$name, "released.xlsx"),
  is.list(session$design), is.null(session$nexo))
cat("PASS route opens a session from an uploaded workbook\n")
quality <- call("GET", paste0("/api/v1/sessions/", session$sessionId, "/quality"))
stopifnot(quality$status == 200L, length(quality$body$pca) == 6L,
  length(quality$body$spread) == 6L, length(quality$body$missing) == 6L,
  quality$body$limit == 2.5, quality$body$missing[[2L]]$missing > 0)
cat("PASS quality route summarizes Team prepared dataset\n")
again <- json("/api/v1/datasets/sessions", list(datasetId = stored$id, settings = settings))
stopifnot(again$status == 200L, identical(again$body$sessionId, session$sessionId))
unknown <- json("/api/v1/datasets/sessions", list(datasetId = strrep("a", 64L), settings = settings))
stopifnot(unknown$status == 404L)
invalid <- multipart("tests/dual-ui/fixtures/classic-seed7-synthetic.zip", settings)
stopifnot(invalid$status == 422L, identical(invalid$body$reason, "dataset_invalid"))
cat("PASS route resolves a stored datasetId (same session), 404s an unknown one, 422s a non-v1 file\n")
info <- call("GET", paste0("/api/v1/sessions/", session$sessionId))
stopifnot(info$status == 200L)
closed <- call("DELETE", paste0("/api/v1/sessions/", session$sessionId))
stopifnot(closed$status == 200L, length(ls(api_sessions)) == 0L)
cat("PASS dataset session is a regular session (inspect, close)\n")

# Offline Admin RPC/storage boundary; the fetcher must receive the restricted credentials.
admin_id <- "12345678-1234-1234-1234-123456789abc"
Sys.setenv(LIPIDOMIC_ADMIN_SUPABASE_URL = "https://admin.invalid/",
  LIPIDOMIC_ADMIN_ANON_KEY = "synthetic-anon", LIPIDOMIC_ADMIN_NEXO_TOKEN = "synthetic-token")
bytes <- readBin(fixture, "raw", file.info(fixture)$size)
row <- list(dataset_id = admin_id, order_code = "ORD041", version = 1L,
  storage_path = "released/order 041/v1.xlsx", sha256 = digest::digest(bytes, algo = "sha256", serialize = FALSE))
mode <- "ok"; requests <- list()
expected_key <- "released/order%20041/v1.xlsx"
options(lipidomic.admin.http_fetcher = function(method, url, headers, body = NULL) {
  requests[[length(requests) + 1L]] <<- list(method = method, url = url, headers = headers, body = body)
  stopifnot(headers[["apikey"]] == "synthetic-anon", headers[["Authorization"]] == "Bearer synthetic-token")
  if (mode == "unavailable") stop("synthetic-token must never escape")
  if (grepl("/rest/v1/rpc/nexo_dataset$", url)) {
    stopifnot(method == "POST", headers[["Content-Profile"]] == "admin", headers[["Accept-Profile"]] == "admin",
      jsonlite::fromJSON(body)$p_dataset_id == admin_id)
    rows <- if (mode == "missing") list() else list(row)
    return(list(status = 200L, body = charToRaw(jsonlite::toJSON(rows, auto_unbox = TRUE))))
  }
  stopifnot(method == "GET", url == paste0("https://admin.invalid/storage/v1/object/authenticated/admin-files/", expected_key))
  # Storage answers a missing or refused object with a 4xx (its own 404 travels as HTTP 400); the real fetcher
  # raises "HTTP error N" instead of returning the status.
  if (mode == "object-missing") return(list(status = 400L, body = charToRaw('{"statusCode":"404","error":"not_found"}')))
  if (mode == "object-refused") stop("Admin response refused: HTTP error 403", call. = FALSE)
  if (mode == "storage-down") return(list(status = 503L, body = raw()))
  list(status = 200L, body = if (mode == "integrity") c(bytes, as.raw(0)) else bytes)
})
# Each storage segment is literal object-key data, including preexisting percent escapes.
for (case in list(c("order%2041", "order%252041"), c("%2e%2e", "%252e%252e"),
    c("%2f", "%252f"), c("signed#%20", "signed%23%2520"),
    c("signed?%20", "signed%3F%2520"), c("order 041", "order%20041"))) {
  row$storage_path <- paste0("released/", case[[1L]], "/v1.xlsx")
  expected_key <- paste0("released/", case[[2L]], "/v1.xlsx")
  target <- tempfile(fileext = ".xlsx")
  api_dataset_admin(admin_id, target)
  stopifnot(identical(readBin(target, "raw", file.info(target)$size), bytes))
  unlink(target)
}
cat("PASS storage keys preserve literal percent, dots, slashes, fragments, queries and spaces\n")
admin_open <- function(settings = NULL) json("/api/v1/datasets/sessions", list(adminDatasetId = admin_id, settings = settings))
a <- admin_open()
stopifnot(a$status == 422L, a$body$reason == "preparation_choices_required", length(a$body$availableSamples) == 6L)
cat("PASS Admin route asks for explicit preparation choices\n")
# Prepare's title ("Prepare ORD041 · v1") comes with the choices, from the row the open just read.
stopifnot(identical(a$body$orderCode, "ORD041"), identical(a$body$version, 1L))
cat("PASS Admin route's 422 names the dataset\n")
a <- admin_open(settings)
stopifnot(a$status == 200L)
admin_session <- api_sessions[[a$body$sessionId]]
admin_data <- api_read(admin_session, admin_session$shared$data_processed_allow_missing())
api_session_close(admin_session)
upload <- multipart(fixture, settings)
stopifnot(a$status == 200L, a$body$dataset$adminDatasetId == admin_id,
  a$body$dataset$orderCode == "ORD041", a$body$dataset$version == 1L,
  identical(a$body$checkpointSha256, upload$body$checkpointSha256),
  identical(a$body$samples, upload$body$samples), identical(a$body$lipids, upload$body$lipids),
  identical(admin_data,
    api_read(api_sessions[[upload$body$sessionId]], api_sessions[[upload$body$sessionId]]$shared$data_processed_allow_missing())))
cat("PASS Admin route opens with provenance and multipart preparation parity\n")
# A released row whose object Storage refuses (4xx) is an integrity failure; a down store stays unavailable.
for (case in list(list("missing", 404L, "dataset_not_found"), list("integrity", 502L, "dataset_integrity_failed"),
    list("object-missing", 502L, "dataset_integrity_failed"), list("object-refused", 502L, "dataset_integrity_failed"),
    list("storage-down", 503L, "admin_datasets_unavailable"), list("unavailable", 503L, "admin_datasets_unavailable"))) {
  mode <- case[[1L]]; a <- admin_open(settings)
  stopifnot(a$status == case[[2L]], a$body$error == case[[3L]],
    !grepl("synthetic-token", jsonlite::toJSON(a$body, auto_unbox = TRUE)))
  cat("PASS Admin route", case[[2L]], case[[3L]], "\n")
}
# Caller authorization applies only to the RPC; Storage retains the reader credential.
mode <- "ok"; requests <- list()
caller_identity <- list(userId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", view = "client",
  clientId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
options(lipidomic.admin.http_fetcher = function(method, url, headers, body = NULL) {
  requests[[length(requests) + 1L]] <<- list(url = url, headers = headers)
  stopifnot(headers[["apikey"]] == "synthetic-anon")
  if (endsWith(url, "/rpc/nexo_caller")) return(list(status = 200L,
    body = charToRaw(jsonlite::toJSON(list(list(caller_view = caller_identity$view,
      client_id = caller_identity$clientId)), auto_unbox = TRUE))))
  if (method == "POST") {
    stopifnot(endsWith(url, "/rpc/nexo_dataset_for_caller"),
      headers[["Authorization"]] == "Bearer synthetic-user", headers[["Content-Profile"]] == "admin")
    if (mode == "unauthorized") return(list(status = 401L, body = raw()))
    if (mode == "unauthorized-curl") stop("Admin response refused: HTTP error 401")
    rows <- if (mode == "other-client") list() else list(c(row,
      list(caller = caller_identity$userId, caller_view = caller_identity$view, client_id = caller_identity$clientId)))
    return(list(status = 200L, body = charToRaw(jsonlite::toJSON(rows, auto_unbox = TRUE))))
  }
  stopifnot(headers[["Authorization"]] == "Bearer synthetic-token")
  list(status = 200L, body = bytes)
})
caller_open <- function() json("/api/v1/datasets/sessions",
  list(adminDatasetId = admin_id, settings = settings), "Bearer synthetic-user")
a <- caller_open()
stopifnot(a$status == 200L, identical(a$body$dataset$openedBy, caller_identity),
  identical(api_sessions[[a$body$sessionId]]$dataset$openedBy, caller_identity), length(requests) == 2L,
  !grepl("synthetic-user", jsonlite::toJSON(a$body, auto_unbox = TRUE)))
cat("PASS caller RPC forwards user authorization only to RPC and records openedBy in session and body\n")
stopifnot(identical(a$body$workspace, api_sessions[[a$body$sessionId]]$workspace),
  identical(a$body$workspace, api_client_workspace(caller_identity$clientId)))
cat("PASS dataset open answer carries session workspace\n")
for (case in list(list("unauthorized", 401L, "admin_auth_required"),
    list("unauthorized-curl", 401L, "admin_auth_required"), list("other-client", 404L, "dataset_not_found"))) {
  mode <- case[[1L]]; requests <- list(); a <- caller_open()
  stopifnot(a$status == case[[2L]], a$body$error == case[[3L]], length(requests) == 1L)
  cat("PASS caller route", case[[1L]], case[[2L]], case[[3L]], "\n")
}
Sys.setenv(LIPIDOMIC_ADMIN_REQUIRE_USER = "1")
requests <- list(); a <- admin_open(settings)
stopifnot(a$status == 401L, a$body$error == "admin_auth_required", length(requests) == 0L)
cat("PASS required user without token returns 401 before fetching\n")
mode <- "ok"; a <- caller_open()
stopifnot(a$status == 200L, identical(a$body$dataset$openedBy, caller_identity))
stopifnot(call("GET", paste0("/api/v1/sessions/", a$body$sessionId, "/quality"))$status == 401L)
stopifnot(call("GET", paste0("/api/v1/sessions/", a$body$sessionId, "/quality"),
  authorization = "Bearer synthetic-user")$status == 200L)
cat("PASS quality route uses session caller authorization\n")
requests <- list()
preview_body <- c(list(adminDatasetId = admin_id), settings[c("samples", "minDetectionPct", "detectionScope", "dropNonDetected")])
p1 <- json("/api/v1/datasets/preview", preview_body, "Bearer synthetic-user")
preview_body$minDetectionPct <- 100
p2 <- json("/api/v1/datasets/preview", preview_body, "Bearer synthetic-user")
stopifnot(p1$status == 200L, p2$status == 200L, p1$body$kept > p2$body$kept, p1$body$kept == a$body$lipids,
  length(requests) == 3L, sum(vapply(requests, function(x) grepl("/storage/", x$url), logical(1))) == 1L)
stopifnot(json("/api/v1/datasets/preview", preview_body)$status == 401L)
mode <- "other-client"
stopifnot(json("/api/v1/datasets/preview", preview_body, "Bearer synthetic-user")$status == 404L)
mode <- "ok"
cat("PASS preview route reauthorizes cached SHA workbook without redownloading\n")
stopifnot(call("GET", "/api/v1/datasets")$status == 401L)
options(lipidomic.admin.http_fetcher = function(method, url, headers, body = NULL) {
  stopifnot(endsWith(url, "/rpc/nexo_datasets_for_caller"), headers[["Authorization"]] == "Bearer synthetic-user")
  list(status = 200L, body = charToRaw(jsonlite::toJSON(list(list(dataset_id = admin_id,
    order_code = "SYN001", version = 1L, client_id = caller_identity$clientId,
    client_name = "Synthetic lab", released_at = "2026-01-01T00:00:00Z", members_prepare = FALSE)), auto_unbox = TRUE)))
})
listed <- call("GET", "/api/v1/datasets", authorization = "Bearer synthetic-user")
stopifnot(listed$status == 200L, listed$body$datasets[[1L]]$adminDatasetId == admin_id,
  identical(listed$body$datasets[[1L]]$membersPrepare, FALSE))
cat("PASS datasets GET maps released rows and refuses anonymous caller\n")

Sys.unsetenv("LIPIDOMIC_ADMIN_REQUIRE_USER")
Sys.unsetenv("LIPIDOMIC_ADMIN_NEXO_TOKEN")
a <- admin_open(settings)
stopifnot(a$status == 503L, a$body$error == "admin_datasets_unavailable")
cat("PASS Admin route refuses missing configuration\n")
options(lipidomic.admin.http_fetcher = NULL)
for (id in ls(api_sessions)) api_session_close(api_sessions[[id]])

# The actual checkpoint route must retain preparation, metadata, canvas and the Nexo member.
local({
  selected <- settings; selected$samples <- settings$samples[-6L]
  opened <- multipart(fixture, selected)
  stopifnot(opened$status == 200L, opened$body$samples == 5L)
  id <- opened$body$sessionId; live <- api_sessions[[id]]
  data <- api_read(live, live$shared$data_processed_allow_missing())
  metadata <- api_read(live, live$shared$allParsedMetadata())
  state <- list(version = "1", libraryHidden = FALSE, nodes = list(
    list(kind = "illustration", id = "illustration_lcms", label = "LC-MS", assetId = "lc-ms",
      assetVersion = "1", color = "#2d5f8a", x = 0, y = 0, width = 620, height = 720,
      visual = list(background = "#ffffff"))))
  nexo <- list(version = 1L, nodes = list(illustration_lcms = list(style = list(opacity = 0.8))))
  saved <- json(paste0("/api/v1/sessions/", id, "/checkpoints"),
    list(label = "selected dataset", canvas = list(token = "dataset-save", state = state), nexo = nexo))
  stopifnot(saved$status == 200L)
  accepted <- live$canvas
  stopifnot(call("DELETE", paste0("/api/v1/sessions/", id))$status == 200L)
  reopened <- json("/api/v1/sessions", list(checkpointId = saved$body$id))
  stopifnot(reopened$status == 200L)
  restored <- api_sessions[[reopened$body$sessionId]]
  stopifnot(identical(api_read(restored, restored$shared$data_processed_allow_missing()), data),
    identical(api_read(restored, restored$shared$allParsedMetadata()), metadata),
    identical(names(data), c("Lipid_Name", selected$samples)),
    identical(api_canonical_json(restored$canvas), api_canonical_json(accepted)),
    identical(api_canonical_json(restored$nexo), api_canonical_json(nexo)))
  api_session_close(restored)
  cat("PASS dataset checkpoint POST, close and reopen preserves selected samples, values, metadata, canvas and Nexo sidecar\n")
})
