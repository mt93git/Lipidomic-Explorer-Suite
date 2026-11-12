# Project-bound sessions through plumber in process. Synthetic identities and the small
# HTTP/JWT boundaries match test_api_collab_auth.R; no running Admin or API required.
for (pkg in c("plumber"))
  if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP test_api_collab_session: package", pkg, "not installed\n"); quit(status = 0) }
for (pkg in c("jsonlite", "zip"))
  if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_ADMIN_REQUIRE_USER", "LIPIDOMIC_API_WORKSPACE"))
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_collab_session")
source("frontends/nexo-api/engine.R")
source("frontends/nexo-api/health.R")
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
  list(status = as.integer(out$status), body = parsed, headers = out$headers)
}
client_a <- "aaaaaaaa-0000-4000-8000-00000000000a"
client_b <- "bbbbbbbb-0000-4000-8000-00000000000b"
user_rows <- list(
  `token-a` = list(list(caller = "11111111-0000-4000-8000-000000000001", caller_view = "client", client_id = client_a)),
  `token-b` = list(list(caller = "22222222-0000-4000-8000-000000000002", caller_view = "client", client_id = client_b)),
  `token-ab` = list(list(caller = "33333333-0000-4000-8000-000000000003", caller_view = "client", client_id = client_a),
    list(caller = "33333333-0000-4000-8000-000000000003", caller_view = "client", client_id = client_b)),
  `token-staff` = list(list(caller = "44444444-0000-4000-8000-000000000004", caller_view = "staff", client_id = NULL)),
  `token-none` = list())
admin_id <- "12345678-1234-4234-8234-123456789abc"
workbook_bytes <- readBin(workbook, "raw", file.info(workbook)$size)
dataset_row <- list(dataset_id = admin_id, order_code = "ORD900", version = 1L, storage_path = "released/ord900/v1.xlsx",
  sha256 = digest::digest(workbook_bytes, algo = "sha256", serialize = FALSE), client_id = client_a)
options(lipidomic.admin.http_fetcher = function(method, url, headers, payload = NULL) {
  stopifnot(headers[["apikey"]] == "synthetic-anon")
  if (grepl("/rest/v1/rpc/nexo_caller$", url)) {
    stopifnot(method == "POST", headers[["Content-Profile"]] == "admin", headers[["Accept-Profile"]] == "admin")
    token <- sub("^Bearer ", "", headers[["Authorization"]])
    if (token == "token-down") stop("Admin is down (synthetic)")
    if (!token %in% names(user_rows)) return(list(status = 401L, body = charToRaw('{"code":"PGRST301"}')))
    return(list(status = 200L, body = charToRaw(jsonlite::toJSON(user_rows[[token]], auto_unbox = TRUE, null = "null"))))
  }
  if (grepl("/rest/v1/rpc/nexo_dataset$", url)) {
    stopifnot(headers[["Authorization"]] == "Bearer synthetic-reader")
    row <- dataset_row[setdiff(names(dataset_row), "client_id")]
    return(list(status = 200L, body = charToRaw(jsonlite::toJSON(list(row), auto_unbox = TRUE))))
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
b64 <- function(x) chartr("+/", "-_", sub("=+$", "", gsub("\n", "", jsonlite::base64_enc(x), fixed = TRUE)))
service_token <- function(workspace, project = "synthetic-project", exp = as.numeric(Sys.time()) + 45, secret = Sys.getenv("NEXO_SERVICE_SECRET")) {
  head <- b64(charToRaw('{"alg":"HS256","typ":"JWT"}'))
  body <- b64(charToRaw(jsonlite::toJSON(list(iss = "nexo-collab", aud = "nexo-api", sub = "service",
    workspace = workspace, project = project, actor = "synthetic-actor", exp = exp), auto_unbox = TRUE)))
  signed <- paste(head, body, sep = ".")
  paste(signed, b64(digest::hmac(secret, signed, algo = "sha256", raw = TRUE)), sep = ".")
}

failures <- character()
check <- function(name, ok) {
  cat(if (isTRUE(ok)) "PASS" else "FAIL", name, "\n")
  if (!isTRUE(ok)) failures <<- c(failures, name)
}
workspace <- api_client_workspace(client_a)
# Put a synthetic checkpoint into the client's store through the storage boundary.
record <- api_store()$save(api_storage_project(workspace), team_zip, "synthetic-collab")
checkpoint <- record$id
send <- function(path, body, project = "project-a", token = NULL) route("POST", path, "application/json",
  charToRaw(jsonlite::toJSON(body, auto_unbox = TRUE)), token = token,
  service_token = if (is.null(token)) service_token(workspace, project) else NULL)
open <- function(project = "project-a", token = NULL) send("/api/v1/sessions",
  list(checkpointId = checkpoint, collab = list(project = project, workspace = workspace)), project, token)
person <- open(token = "token-a")
check("person cannot open collab", person$status == 403L && person$body$error == "forbidden_scope")
mismatch <- send("/api/v1/sessions", list(checkpointId = checkpoint,
  collab = list(project = "other", workspace = workspace)))
check("open claims must match body", mismatch$status == 403L)
a <- open()
check("service opens project-bound collab", a$status == 200L && !is.null(a$body$generation) && !is.null(a$body$engineRevision))
if (a$status == 200L) {
  id <- a$body$sessionId; base <- paste0("/api/v1/sessions/", id)
  check("collab carries binding", identical(api_sessions[[id]]$kind, "collab") && identical(api_sessions[[id]]$project, "project-a"))
  check("person can read collab", route("GET", base, token = "token-a")$status == 200L)
  check("person cannot mutate collab", route("DELETE", base, token = "token-a")$status == 403L)
  check("other project cannot read collab", route("GET", base, service_token = service_token(workspace, "other"))$status == 403L)
  check("other workspace cannot read collab", route("GET", base, token = "token-b")$status == 403L)
  patch <- route("PATCH", paste0(base, "/analysis"), "application/json", charToRaw('{}'), token = "token-a")
  check("person PATCH is forbidden scope", patch$status == 403L && identical(patch$body$error, "forbidden_scope"))
  confirm <- send(paste0(base, "/design"), list(confirm = TRUE), token = "token-a")
  check("person design confirm is forbidden", confirm$status == 403L)
  Sys.unsetenv("LIPIDOMIC_ADMIN_REQUIRE_USER")
  check("collab remains bound with legacy auth off", route("DELETE", base, token = "token-a")$status == 403L &&
    route("GET", base, token = "token-a")$status == 200L && route("GET", base)$status == 401L)
  Sys.setenv(LIPIDOMIC_ADMIN_REQUIRE_USER = "1")
  joined <- route("GET", paste0(base, "/join"), token = "token-a")
  check("join has revision and no canvas", joined$status == 200L && !"canvas" %in% names(joined$body) &&
    all(c("sessionId", "generation", "engineRevision", "preparation", "samples", "lipids", "design", "cards") %in% names(joined$body)))
  check("service can join", route("GET", paste0(base, "/join"), service_token = service_token(workspace, "project-a"))$status == 200L)
  check("person cannot renew lease", send(paste0(base, "/lease"), list(connections = 1L, inFlight = 0L), token = "token-a")$status == 403L)
  check("service renews lease", send(paste0(base, "/lease"), list(connections = 1L, inFlight = 0L))$status == 200L)
  api_sessions[[id]]$last_used <- Sys.time() - 10
  api_sessions_evict_idle(minutes = 0.01)
  check("lease keeps quiet session past idle limit", exists(id, api_sessions, inherits = FALSE))
  b <- open("project-b")
  check("same checkpoint two projects have different sessions", b$status == 200L && !identical(id, b$body$sessionId))
  if (b$status == 200L) {
    base2 <- paste0("/api/v1/sessions/", b$body$sessionId)
    send(paste0(base2, "/lease"), list(connections = 0L, inFlight = 1L), "project-b")
    api_memory_guard(rss = api_rss_soft_mb() + 1)
    health <- route("GET", "/api/v1/health")
    check("soft pressure keeps two leased sessions", exists(id, api_sessions, inherits = FALSE) &&
      exists(b$body$sessionId, api_sessions, inherits = FALSE) && identical(health$body$pressure, TRUE) && health$body$leases == 2L)
    # A legacy open must neither reuse nor evict a leased project session.
    legacy <- api_session_for_checkpoint(team_zip)
    check("LRU preserves both leased project sessions", !identical(legacy$sessionId, id) &&
      exists(id, api_sessions, inherits = FALSE) && exists(b$body$sessionId, api_sessions, inherits = FALSE))
    api_memory_guard(rss = api_rss_soft_mb() + 1)
    check("soft pressure closes newest unleased session first", !exists(legacy$sessionId, api_sessions, inherits = FALSE) &&
      exists(id, api_sessions, inherits = FALSE) && exists(b$body$sessionId, api_sessions, inherits = FALSE))
    third <- open("project-c")
    check("third collab open returns capacity and Retry-After", third$status == 503L &&
      identical(third$body$error, "capacity") && third$body$liveProjects == 2L &&
      !is.null(third$headers[["Retry-After"]]) && !is.null(third$body$retryAfter))
    leased <- api_sessions[[id]]
    leased$lease$renewedAt <- Sys.time() - 181
    leased$last_used <- Sys.time() - 10
    api_sessions_evict_idle(minutes = 0.01)
    check("expired lease permits idle expiry", !exists(id, api_sessions, inherits = FALSE))
  }
}
for (id in ls(api_sessions)) api_session_close(api_sessions[[id]])
settings <- list(samples = c("Control_1", "Control_2", "Control_3", "Treated_1", "Treated_2", "Treated_3"),
  minDetectionPct = 50, detectionScope = "global", dropNonDetected = TRUE, normalizationMethod = "median",
  useImputation = TRUE, imputeZerosPerFile = TRUE, imputeRemainingNAtoZero = FALSE)
dataset_record <- api_store()$save(api_storage_project(paste0(workspace, "-datasets")), workbook, "synthetic-dataset")
dataset_body <- list(datasetId = dataset_record$id, settings = settings,
  collab = list(project = "project-a", workspace = workspace))
check("person cannot open collab dataset", send("/api/v1/datasets/sessions", dataset_body, token = "token-a")$status == 403L)
dataset_open <- send("/api/v1/datasets/sessions", dataset_body)
check("service opens project-bound dataset", dataset_open$status == 200L && !is.null(dataset_open$body$engineRevision) &&
  !is.null(dataset_open$body$generation))
if (dataset_open$status == 200L) {
  joined <- route("GET", paste0("/api/v1/sessions/", dataset_open$body$sessionId, "/join"), token = "token-a")
  check("dataset join includes receipt without canvas", joined$status == 200L && !is.null(joined$body$dataset) && !"canvas" %in% names(joined$body))
}
for (id in ls(api_sessions)) api_session_close(api_sessions[[id]])
admin_open <- send("/api/v1/datasets/sessions", list(adminDatasetId = admin_id, settings = settings,
  collab = list(project = "project-a", workspace = workspace)))
check("service opens released Admin dataset without person token", admin_open$status == 200L &&
  identical(admin_open$body$dataset$adminDatasetId, admin_id))
check("lab collab open of a client dataset is in the client's workspace", admin_open$status == 200L &&
  identical(api_sessions[[admin_open$body$sessionId]]$workspace, workspace))
for (id in ls(api_sessions)) api_session_close(api_sessions[[id]])
# Gerardo, 2026-11-10 (plan D3): a shared project of a client's dataset lives in that client's workspace, also when lab
# staff open it; a lab person's single-user session stays in the lab workspace.
person_open <- function(token) route("POST", "/api/v1/datasets/sessions", "application/json",
  charToRaw(jsonlite::toJSON(list(adminDatasetId = admin_id, settings = settings), auto_unbox = TRUE)), admin_token = token)
lab_open <- person_open("token-staff")
check("lab single-user open stays in the lab workspace", lab_open$status == 200L &&
  identical(lab_open$body$workspace, api_workspace()) && identical(api_sessions[[lab_open$body$sessionId]]$workspace, api_workspace()))
check("lab open names the client's workspace for a shared project", identical(lab_open$body$projectWorkspace, workspace))
member_open <- person_open("token-a")
check("client member open names its own workspace for a shared project", member_open$status == 200L &&
  identical(member_open$body$workspace, workspace) && identical(member_open$body$projectWorkspace, workspace))
for (id in ls(api_sessions)) api_session_close(api_sessions[[id]])
unlink(c(store_root, legacy_dir), recursive = TRUE)
if (length(failures)) quit(status = 1)
