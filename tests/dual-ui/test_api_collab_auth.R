# Nexo's store per client (docs/integration/nexo-store-scope.md) through plumber's router in this process.
# Offline: the Admin RPCs (nexo_caller, nexo_dataset_for_caller) and Storage are faked through
# options(lipidomic.admin.http_fetcher), as in test_api_dataset_route.R. Synthetic data and tokens only.
# Names: this file runs in the global environment with the app, so no variable is named like a base function.
for (pkg in c("plumber"))
  if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP test_api_checkpoint_scope: package", pkg, "not installed\n"); quit(status = 0) }
for (pkg in c("jsonlite", "zip"))
  if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_ADMIN_REQUIRE_USER", "LIPIDOMIC_API_WORKSPACE"))
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_checkpoint_scope")
source("frontends/nexo-api/engine.R")
team_zip <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
workbook <- "tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx"
store_root <- tempfile("scope-store-"); dir.create(store_root)
legacy_dir <- tempfile("scope-legacy-"); dir.create(legacy_dir)
stopifnot(file.copy("tests/dual-ui/fixtures/nexo-complete-synthetic.zip", file.path(legacy_dir, "legacy-synthetic.zip")))
Sys.setenv(LIPIDOMIC_STORAGE_DIR = store_root, LIPIDOMIC_API_CHECKPOINT_DIR = legacy_dir,
  LIPIDOMIC_ADMIN_SUPABASE_URL = "https://admin.invalid/", LIPIDOMIC_ADMIN_ANON_KEY = "synthetic-anon",
  LIPIDOMIC_ADMIN_NEXO_TOKEN = "synthetic-reader")
api_run_dir <- normalizePath("frontends/nexo-api"); root <- getwd()
router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_run_dir, "plumber.R")),
  plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
setwd(root)
router <- plumber::pr_hook(router, "preroute", function() setwd(root))
route <- function(method, route_path, type = NULL, payload = raw(), token = NULL, admin_token = NULL, service_token = NULL, forwarded = NULL) {
  req <- new.env()
  if (!is.null(token)) req$HTTP_AUTHORIZATION <- paste("Bearer", token)
  req$HTTP_X_NEXO_ADMIN_TOKEN <- admin_token
  req$HTTP_X_NEXO_SERVICE_TOKEN <- service_token
  req$HTTP_X_FORWARDED_FOR <- forwarded
  req$REMOTE_ADDR <- "127.0.0.1"
  req$REQUEST_METHOD <- method; req$PATH_INFO <- route_path; req$QUERY_STRING <- ""
  if (!is.null(type)) req$HTTP_CONTENT_TYPE <- type
  req$rook.input <- list(read = function(l = -1L) payload, rewind = function() invisible(0L))
  out <- router$call(req)
  parsed <- if (is.raw(out$body)) out$body else
    tryCatch(jsonlite::fromJSON(as.character(out$body), simplifyVector = FALSE), error = function(e) NULL)
  list(status = as.integer(out$status), body = parsed)
}
post_json <- function(route_path, x, token = NULL) route("POST", route_path, "application/json",
  charToRaw(jsonlite::toJSON(x, auto_unbox = TRUE, null = "null")), token)
upload_form <- function(route_path, file_path, field_name, token = NULL, extra = list()) {
  boundary <- "nexo-scope-test-boundary"
  part <- function(head, value) c(charToRaw(paste0("--", boundary, "\r\n", head, "\r\n\r\n")), value, charToRaw("\r\n"))
  payload <- part(paste0('Content-Disposition: form-data; name="file"; filename="', field_name,
    '"\r\nContent-Type: application/octet-stream'), readBin(file_path, "raw", file.info(file_path)$size))
  for (key in names(extra)) payload <- c(payload, part(paste0('Content-Disposition: form-data; name="', key, '"'), charToRaw(extra[[key]])))
  route("POST", route_path, paste0("multipart/form-data; boundary=", boundary), c(payload, charToRaw(paste0("--", boundary, "--\r\n"))), token)
}
ids_of <- function(listing) vapply(listing$body, function(x) x$id, character(1))
client_a <- "aaaaaaaa-0000-4000-8000-00000000000a"
client_b <- "bbbbbbbb-0000-4000-8000-00000000000b"
user_rows <- list(
  `token-a` = list(list(caller = "11111111-0000-4000-8000-000000000001", caller_view = "client", client_id = client_a)),
  `token-b` = list(list(caller = "22222222-0000-4000-8000-000000000002", caller_view = "client", client_id = client_b)),
  `token-ab` = list(list(caller = "33333333-0000-4000-8000-000000000003", caller_view = "client", client_id = client_a),
    list(caller = "33333333-0000-4000-8000-000000000003", caller_view = "client", client_id = client_b)),
  `token-staff` = list(list(caller = "44444444-0000-4000-8000-000000000004", caller_view = "staff", client_id = NULL)),
  `token-none` = list())
user_rows[["token-a2"]] <- user_rows[["token-a"]]
admin_id <- "12345678-1234-4234-8234-123456789abc"
workbook_bytes <- readBin(workbook, "raw", file.info(workbook)$size)
dataset_row <- list(dataset_id = admin_id, order_code = "ORD900", version = 1L, storage_path = "released/ord900/v1.xlsx",
  sha256 = digest::digest(workbook_bytes, algo = "sha256", serialize = FALSE), client_id = client_a)
fetches <- list()
caller_fetches <- function(token) sum(vapply(fetches, function(x) grepl("/rpc/nexo_caller$", x$url) &&
  identical(x$auth, paste("Bearer", token)), logical(1)))
options(lipidomic.admin.http_fetcher = function(method, url, headers, payload = NULL) {
  fetches[[length(fetches) + 1L]] <<- list(url = url, auth = headers[["Authorization"]])
  stopifnot(headers[["apikey"]] == "synthetic-anon")
  if (grepl("/rest/v1/rpc/nexo_caller$", url)) {
    stopifnot(method == "POST", headers[["Content-Profile"]] == "admin", headers[["Accept-Profile"]] == "admin")
    token <- sub("^Bearer ", "", headers[["Authorization"]])
    if (token == "token-down") stop("Admin is down (synthetic)")
    if (!token %in% names(user_rows)) return(list(status = 401L, body = charToRaw('{"code":"PGRST301"}')))
    return(list(status = 200L, body = charToRaw(jsonlite::toJSON(user_rows[[token]], auto_unbox = TRUE, null = "null"))))
  }
  if (grepl("/rest/v1/rpc/nexo_dataset_for_caller$", url)) {
    token <- sub("^Bearer ", "", headers[["Authorization"]])
    who <- user_rows[[token]]
    rows <- if (token %in% c("token-a", "token-staff")) list(c(dataset_row,
      list(caller = who[[1L]]$caller, caller_view = who[[1L]]$caller_view))) else list()
    return(list(status = 200L, body = charToRaw(jsonlite::toJSON(rows, auto_unbox = TRUE))))
  }
  stopifnot(method == "GET", headers[["Authorization"]] == "Bearer synthetic-reader")
  list(status = 200L, body = workbook_bytes)
})

Sys.setenv(LIPIDOMIC_ADMIN_REQUIRE_USER = "1", NEXO_SERVICE_SECRET = "synthetic-service-secret")
session_b <- api_session_for_checkpoint(team_zip)
session_b$workspace <- api_client_workspace(client_b)
base_b <- paste0("/api/v1/sessions/", session_b$sessionId)
failures <- character()
check <- function(name, response, status, error = NULL) {
  ok <- identical(response$status, as.integer(status)) && (is.null(error) || identical(response$body$error, error))
  cat(if (ok) "PASS" else "FAIL", name, if (!ok) paste("(got", response$status, response$body$error %||% "", response$body$message %||% "", ")"), "\n")
  if (!ok) failures <<- c(failures, name)
}
check("A cannot render B session", post_json(paste0(base_b, "/cards/missing/render"), list(), "token-a"), 403, "forbidden_scope")
check("A cannot read B schema", route("GET", paste0(base_b, "/cards/missing/schema"), token = "token-a"), 403, "forbidden_scope")
check("A cannot PATCH B session", route("PATCH", paste0(base_b, "/analysis"), "application/json", charToRaw('{}'), "token-a"), 403, "forbidden_scope")
check("A cannot close B session", route("DELETE", base_b, token = "token-a"), 403, "forbidden_scope")
check("no token requires authentication", route("GET", base_b), 401, "admin_auth_required")
check("Bearer accepted", route("GET", base_b, token = "token-b"), 200)
check("Admin header accepted over Basic", route("GET", base_b, token = "unused", admin_token = "token-b"), 200)
old_id <- paste0(if (startsWith(session_b$sessionId, "000000000000.")) "111111111111" else "000000000000", ".", strrep("a", 32))
check("previous generation is lost", route("GET", paste0("/api/v1/sessions/", old_id), token = "token-b"), 409, "session_lost")
b64 <- function(x) chartr("+/", "-_", sub("=+$", "", gsub("\n", "", jsonlite::base64_enc(x), fixed = TRUE)))
service_token <- function(workspace, exp = as.numeric(Sys.time()) + 45, secret = Sys.getenv("NEXO_SERVICE_SECRET")) {
  head <- b64(charToRaw('{"alg":"HS256","typ":"JWT"}'))
  body <- b64(charToRaw(jsonlite::toJSON(list(iss = "nexo-collab", aud = "nexo-api", sub = "service",
    workspace = workspace, project = "synthetic-project", actor = "synthetic-actor", exp = exp), auto_unbox = TRUE)))
  signed <- paste(head, body, sep = ".")
  paste(signed, b64(digest::hmac(secret, signed, algo = "sha256", raw = TRUE)), sep = ".")
}
check("service A cannot read B", route("GET", base_b, service_token = service_token(api_client_workspace(client_a))), 403, "forbidden_scope")
valid <- service_token(api_client_workspace(client_b))
check("service B can read B", route("GET", base_b, service_token = valid), 200)
check("expired service refused", route("GET", base_b, service_token = service_token(api_client_workspace(client_b), as.numeric(Sys.time()) - 1)), 401)
check("wrong signature refused", route("GET", base_b, service_token = service_token(api_client_workspace(client_b), secret = "wrong-synthetic")), 401)
check("forwarded service refused", route("GET", base_b, service_token = valid, forwarded = "192.0.2.1"), 401)
check("non-loopback service refused", { req <- list(HTTP_X_NEXO_SERVICE_TOKEN = valid, REMOTE_ADDR = "192.0.2.1");
  tryCatch({ api_service_caller(req); list(status = 200L) }, api_dataset_admin_error = function(e) list(status = e$status)) }, 401)
violin <- api_card_create(session_b, "results_dashboard-plot_violin")$instanceId
session_b$kind <- "collab"
session_b$project <- "synthetic-project"
check("person can verify violin statistics on collab session",
  post_json(paste0(base_b, "/cards/", violin, "/statistics/violin"),
    list(mode = "verify", dataFingerprint = strrep("0", 64),
      settings = list(test = "welch", correction = "BH", scope = "displayed",
        comparisons = list(list("Control", "Treated")), effect = "hedges_g")), "token-b"), 200)
api_session_close(session_b)
open_folder <- function(workspace = NULL, token = NULL) {
  collab <- if (!is.null(workspace)) list(project = "synthetic-project", workspace = workspace)
  payload <- charToRaw(jsonlite::toJSON(list(checkpointId = "legacy-synthetic", collab = collab), auto_unbox = TRUE, null = "null"))
  opened <- route("POST", "/api/v1/sessions", "application/json", payload, token,
    service_token = if (!is.null(workspace)) service_token(workspace))
  if (identical(opened$status, 200L)) api_session_close(api_sessions[[opened$body$sessionId]])
  opened
}
check("service for the staff workspace opens a folder checkpoint", open_folder(api_workspace()), 200)
check("service for a client workspace cannot open a folder checkpoint", open_folder(api_client_workspace(client_a)), 404)
check("member cannot open a folder checkpoint", open_folder(token = "token-a"), 404)
unlink(c(store_root, legacy_dir), recursive = TRUE)
if (length(failures)) quit(status = 1)
