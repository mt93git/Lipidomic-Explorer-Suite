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
route <- function(method, route_path, type = NULL, payload = raw(), token = NULL) {
  req <- new.env()
  if (!is.null(token)) req$HTTP_AUTHORIZATION <- paste("Bearer", token)
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
settings <- list(samples = c("Control_1", "Control_2", "Control_3", "Treated_1", "Treated_2", "Treated_3"),
  minDetectionPct = 50, detectionScope = "global", dropNonDetected = TRUE, normalizationMethod = "median",
  useImputation = TRUE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = FALSE)
canvas_state <- list(version = "1", libraryHidden = FALSE, nodes = list(
  list(kind = "illustration", id = "illustration_lcms", label = "LC-MS", assetId = "lc-ms",
    assetVersion = "1", color = "#2d5f8a", x = 0, y = 0, width = 620, height = 720,
    visual = list(background = "#ffffff"))))
save_into <- function(session_id, label, token, opacity = 0.5) post_json(paste0("/api/v1/sessions/", session_id, "/checkpoints"),
  list(label = label, canvas = list(token = paste0("scope-", gsub("[^A-Za-z0-9]", "-", label), "-", opacity), state = canvas_state),
    nexo = list(version = 1L, nodes = list(illustration_lcms = list(style = list(opacity = opacity))))), token)
close_all <- function() for (sid in ls(api_sessions)) api_session_close(api_sessions[[sid]])

# --- Switch off: today's shared workspace, no token needed, the RPC never called (even with a token).
staff_upload <- upload_form("/api/v1/checkpoints", team_zip, "team.zip", extra = list(label = "staff upload"))
stopifnot(staff_upload$status == 200L, staff_upload$body$source == "store", is.null(staff_upload$body$clientId))
staff_id <- staff_upload$body$id
listing <- route("GET", "/api/v1/checkpoints", token = "token-a")
stopifnot(listing$status == 200L, setequal(ids_of(listing), c(staff_id, "legacy-synthetic")), length(fetches) == 0L,
  file.exists(file.path(store_root, "projects", "nexo-pilot", paste0(staff_id, ".zip"))))
restored <- post_json("/api/v1/sessions", list(checkpointId = staff_id), token = "token-a")
stopifnot(restored$status == 200L, length(fetches) == 0L)
off_saved <- save_into(restored$body$sessionId, "off save", NULL)
stopifnot(off_saved$status == 200L, file.exists(file.path(store_root, "projects", "nexo-pilot", paste0(off_saved$body$id, ".json"))))
stopifnot(route("GET", paste0("/api/v1/checkpoints/", off_saved$body$id, "/download"))$status == 200L,
  route("DELETE", paste0("/api/v1/checkpoints/", off_saved$body$id))$status == 200L,
  upload_form("/api/v1/datasets/sessions", workbook, "released.xlsx")$status == 422L, length(fetches) == 0L)
close_all()
cat("PASS switch off: shared workspace, folder listed, no token needed, the caller RPC never called\n")

# --- Switch on.
Sys.setenv(LIPIDOMIC_ADMIN_REQUIRE_USER = "1")
for (case in list(list("GET", "/api/v1/checkpoints"), list("GET", paste0("/api/v1/checkpoints/", staff_id, "/download")),
    list("DELETE", paste0("/api/v1/checkpoints/", staff_id)))) {
  answer <- route(case[[1L]], case[[2L]])
  stopifnot(answer$status == 401L, identical(answer$body$error, "admin_auth_required"))
}
answer <- post_json("/api/v1/sessions", list(checkpointId = staff_id))
stopifnot(answer$status == 401L, identical(answer$body$error, "admin_auth_required"))
answer <- upload_form("/api/v1/checkpoints", team_zip, "team.zip")
stopifnot(answer$status == 401L, identical(answer$body$error, "admin_auth_required"), length(fetches) == 0L)
answer <- route("GET", "/api/v1/checkpoints", token = "token-forged")
stopifnot(answer$status == 401L, identical(answer$body$error, "admin_auth_required"), caller_fetches("token-forged") == 1L)
answer <- route("GET", "/api/v1/checkpoints", token = "token-down")
stopifnot(answer$status == 503L, identical(answer$body$error, "admin_datasets_unavailable"),
  !grepl("token-down", jsonlite::toJSON(answer$body, auto_unbox = TRUE)))
cat("PASS switch on: no token, a refused token and Admin down answer 401/401/503 before any store access\n")

# Staff: today's workspace and the legacy folder, uploads allowed.
listing <- route("GET", "/api/v1/checkpoints", token = "token-staff")
stopifnot(listing$status == 200L, setequal(ids_of(listing), c(staff_id, "legacy-synthetic")),
  all(vapply(listing$body, function(x) is.null(x$clientId), logical(1))))
staff_again <- upload_form("/api/v1/checkpoints", team_zip, "team.zip", "token-staff", list(label = "staff upload"))
stopifnot(staff_again$status == 200L, identical(staff_again$body$id, staff_id))
stopifnot(upload_form("/api/v1/datasets/sessions", workbook, "released.xlsx", "token-staff")$status == 422L)
cat("PASS staff list today's workspace with the folder, and upload ZIPs and workbooks\n")

# Members: uploads are staff-only.
for (token in c("token-a", "token-none")) {
  answer <- upload_form("/api/v1/checkpoints", team_zip, "team.zip", token)
  stopifnot(answer$status == 403L, identical(answer$body$error, "staff_only"))
  answer <- upload_form("/api/v1/datasets/sessions", workbook, "released.xlsx", token)
  stopifnot(answer$status == 403L, identical(answer$body$error, "staff_only"))
  answer <- post_json("/api/v1/datasets/sessions", list(datasetId = strrep("a", 64L), settings = settings), token)
  stopifnot(answer$status == 403L, identical(answer$body$error, "staff_only"))
}
stopifnot(length(list.files(file.path(store_root, "projects"))) == 1L)
cat("PASS member ZIP upload, multipart workbook upload and stored datasetId answer 403 staff_only\n")

# Member A: an empty scope at first, then saves land in nexo-client-<A>.
listing <- route("GET", "/api/v1/checkpoints", token = "token-a")
stopifnot(listing$status == 200L, length(listing$body) == 0L)
opened <- post_json("/api/v1/datasets/sessions", list(adminDatasetId = admin_id, settings = settings), "token-a")
stopifnot(opened$status == 200L, identical(opened$body$dataset$openedBy$clientId, client_a))
session_a <- opened$body$sessionId
answer <- save_into(session_a, "b tries", "token-b")
stopifnot(answer$status == 403L, identical(answer$body$error, "forbidden_scope"))
answer <- save_into(session_a, "none tries", "token-none")
stopifnot(answer$status == 403L, identical(answer$body$error, "forbidden_scope"))
stopifnot(save_into(session_a, "no token", NULL)$status == 401L)
saved_a <- save_into(session_a, "a named", "token-a", 0.4)
stopifnot(saved_a$status == 200L, identical(saved_a$body$clientId, client_a))
autosave_a <- save_into(session_a, "autosave", "token-a", 0.6)
stopifnot(autosave_a$status == 200L, identical(autosave_a$body$name, "autosave"))
workspace_a <- file.path(store_root, "projects", paste0("nexo-client-", client_a))
stopifnot(file.exists(file.path(workspace_a, paste0(saved_a$body$id, ".zip"))),
  file.exists(file.path(workspace_a, paste0(autosave_a$body$id, ".zip"))),
  !file.exists(file.path(store_root, "projects", "nexo-pilot", paste0(saved_a$body$id, ".zip"))))
staff_into_a <- save_into(session_a, "staff into a", "token-staff", 0.7)
stopifnot(staff_into_a$status == 200L, file.exists(file.path(workspace_a, paste0(staff_into_a$body$id, ".zip"))))
a_ids <- c(saved_a$body$id, autosave_a$body$id, staff_into_a$body$id)
cat("PASS member save and autosave land in nexo-client-<A>; B and a member without clients get 403 forbidden_scope; staff may save there\n")

listing <- route("GET", "/api/v1/checkpoints", token = "token-a")
stopifnot(listing$status == 200L, setequal(ids_of(listing), a_ids),
  all(vapply(listing$body, function(x) identical(x$clientId, client_a) && identical(x$source, "store"), logical(1))))
stopifnot(length(route("GET", "/api/v1/checkpoints", token = "token-b")$body) == 0L,
  length(route("GET", "/api/v1/checkpoints", token = "token-none")$body) == 0L)
listing <- route("GET", "/api/v1/checkpoints", token = "token-staff")
stopifnot(setequal(ids_of(listing), c(staff_id, "legacy-synthetic")))
listing <- route("GET", "/api/v1/checkpoints", token = "token-ab")
stopifnot(setequal(ids_of(listing), a_ids), all(vapply(listing$body, function(x) identical(x$clientId, client_a), logical(1))))
cat("PASS lists: A sees only its client's checkpoints with clientId; B none; staff unchanged; a member of A and B sees A's\n")

# Restore, download, delete outside the scope: 404, the same answer as an unknown id.
for (token in c("token-a", "token-none")) for (cid in c(staff_id, "legacy-synthetic", strrep("e", 64L))) {
  stopifnot(post_json("/api/v1/sessions", list(checkpointId = cid), token)$status == 404L,
    route("GET", paste0("/api/v1/checkpoints/", cid, "/download"), token = token)$status == 404L,
    route("DELETE", paste0("/api/v1/checkpoints/", cid), token = token)$status == 404L)
}
for (cid in a_ids) for (token in c("token-b", "token-staff"))
  stopifnot(post_json("/api/v1/sessions", list(checkpointId = cid), token)$status == 404L,
    route("GET", paste0("/api/v1/checkpoints/", cid, "/download"), token = token)$status == 404L,
    route("DELETE", paste0("/api/v1/checkpoints/", cid), token = token)$status == 404L)
stopifnot(file.exists(file.path(store_root, "projects", "nexo-pilot", paste0(staff_id, ".zip"))),
  all(file.exists(file.path(workspace_a, paste0(a_ids, ".zip")))))
cat("PASS A gets 404 on staff, folder and unknown ids; B and staff get 404 on A's ids; nothing deleted\n")

downloaded <- route("GET", paste0("/api/v1/checkpoints/", saved_a$body$id, "/download"), token = "token-a")
stopifnot(downloaded$status == 200L, is.raw(downloaded$body),
  identical(digest::digest(downloaded$body, algo = "sha256", serialize = FALSE), saved_a$body$id))
restored_a <- post_json("/api/v1/sessions", list(checkpointId = saved_a$body$id), "token-a")
stopifnot(restored_a$status == 200L)
resaved <- save_into(restored_a$body$sessionId, "a resaved", "token-a", 0.3)
stopifnot(resaved$status == 200L, identical(resaved$body$clientId, client_a),
  file.exists(file.path(workspace_a, paste0(resaved$body$id, ".zip"))))
answer <- save_into(restored_a$body$sessionId, "b into restored", "token-b", 0.2)
stopifnot(answer$status == 403L, identical(answer$body$error, "forbidden_scope"))
removed <- route("DELETE", paste0("/api/v1/checkpoints/", saved_a$body$id), token = "token-a")
stopifnot(removed$status == 200L, !file.exists(file.path(workspace_a, paste0(saved_a$body$id, ".zip"))),
  !saved_a$body$id %in% ids_of(route("GET", "/api/v1/checkpoints", token = "token-a")))
cat("PASS A downloads, restores (the session keeps A's workspace), resaves and deletes within its scope\n")

# Staff restore and delete as today.
staff_session <- post_json("/api/v1/sessions", list(checkpointId = staff_id), "token-staff")
stopifnot(staff_session$status == 200L)
staff_saved <- save_into(staff_session$body$sessionId, "staff save", "token-staff", 0.9)
stopifnot(staff_saved$status == 200L, is.null(staff_saved$body$clientId),
  file.exists(file.path(store_root, "projects", "nexo-pilot", paste0(staff_saved$body$id, ".zip"))))
answer <- save_into(staff_session$body$sessionId, "a into staff", "token-a", 0.8)
stopifnot(answer$status == 403L, identical(answer$body$error, "forbidden_scope"))
stopifnot(route("GET", "/api/v1/checkpoints/legacy-synthetic/download", token = "token-staff")$status == 200L,
  route("DELETE", "/api/v1/checkpoints/legacy-synthetic", token = "token-staff")$status == 405L,
  route("DELETE", paste0("/api/v1/checkpoints/", staff_saved$body$id), token = "token-staff")$status == 200L)
cat("PASS staff restore, save, download and delete in today's workspace; A cannot save into a staff session\n")

# One RPC per token for 60 s, then asked again; the cache never holds the token itself.
for (attempt_n in 1:3) stopifnot(route("GET", "/api/v1/checkpoints", token = "token-a2")$status == 200L)
stopifnot(caller_fetches("token-a2") == 1L)
held <- paste(capture.output(str(as.list(api_admin_caller_cache), give.attr = TRUE)), collapse = "\n")
stopifnot(!grepl("token-", held, fixed = TRUE))
for (key in ls(api_admin_caller_cache)) api_admin_caller_cache[[key]]$at <- Sys.time() - 61
stopifnot(route("GET", "/api/v1/checkpoints", token = "token-a2")$status == 200L, caller_fetches("token-a2") == 2L)
cat("PASS caller answer cached per token for 60 s, keyed without the token\n")

close_all()
Sys.unsetenv("LIPIDOMIC_ADMIN_REQUIRE_USER")
fetches <- list()
listing <- route("GET", "/api/v1/checkpoints")
stopifnot(listing$status == 200L, setequal(ids_of(listing), c(staff_id, "legacy-synthetic")), length(fetches) == 0L)
cat("PASS switch off again: shared workspace as before; client workspaces stay on disk, unlisted\n")
options(lipidomic.admin.http_fetcher = NULL)
