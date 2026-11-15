# This carrier is stripped by nginx. Never include it in errors or logs.
api_service_caller <- function(req) {
  token <- req$HTTP_X_NEXO_SERVICE_TOKEN
  if (is.null(token)) return(NULL)
  refuse <- function() api_dataset_admin_fail(401L, "admin_auth_required")
  secret <- Sys.getenv("NEXO_SERVICE_SECRET")
  if (!nzchar(secret) || !is.null(req$HTTP_X_FORWARDED_FOR) ||
      !is.character(req$REMOTE_ADDR) || length(req$REMOTE_ADDR) != 1L ||
      is.na(req$REMOTE_ADDR) || !req$REMOTE_ADDR %in% c("127.0.0.1", "::1") ||
      !is.character(token) || length(token) != 1L || is.na(token) || nchar(token) > 8192L) refuse()
  parts <- strsplit(token, ".", fixed = TRUE)[[1L]]
  if (length(parts) != 3L || any(!grepl("^[A-Za-z0-9_-]+$", parts))) refuse()
  decode <- function(x) jsonlite::base64_dec(paste0(chartr("-_", "+/", x),
    strrep("=", (4L - nchar(x) %% 4L) %% 4L)))
  parsed <- tryCatch(list(
    header = jsonlite::fromJSON(rawToChar(decode(parts[[1L]])), simplifyVector = FALSE),
    claims = jsonlite::fromJSON(rawToChar(decode(parts[[2L]])), simplifyVector = FALSE),
    signature = decode(parts[[3L]])), error = function(e) refuse())
  expected <- digest::hmac(secret, paste(parts[1:2], collapse = "."), algo = "sha256", raw = TRUE)
  if (length(parsed$signature) != length(expected) ||
      sum(bitwXor(as.integer(parsed$signature), as.integer(expected))) != 0L) refuse()
  claims <- parsed$claims
  scalar <- function(x) is.character(x) && length(x) == 1L && !is.na(x) && nzchar(x)
  if (!is.list(parsed$header) || !identical(parsed$header$alg, "HS256") || !is.list(claims) ||
      !identical(claims$iss, "nexo-collab") || !identical(claims$aud, "nexo-api") ||
      !identical(claims$sub, "service") ||
      !all(vapply(claims[c("workspace", "project", "actor")], scalar, logical(1))) ||
      !all(c("workspace", "project", "actor") %in% names(claims))) refuse()
  now <- as.numeric(Sys.time())
  if (!is.numeric(claims$exp) || length(claims$exp) != 1L || !is.finite(claims$exp) ||
      claims$exp <= now || claims$exp > now + 60) refuse()
  message("Nexo service actor: ", gsub("[[:cntrl:]]", "", claims$actor))
  list(staff = FALSE, clients = character(), service = TRUE, workspaces = claims$workspace,
    project = claims$project, actor = claims$actor)
}
api_session_caller <- function(req) {
  method <- toupper(req$REQUEST_METHOD %||% "GET")
  path <- req$PATH_INFO %||% ""
  read <- method == "GET" || (method == "POST" &&
    (grepl("/render$|/plots/results_dashboard/[^/]+$", path) ||
      (grepl("/statistics/violin$", path) && req$body$mode %in% c("describe", "check", "verify"))))
  id <- sub("^/api/v1/sessions/([^/]+).*$", "\\1", path)
  session <- if (exists(id, api_sessions, inherits = FALSE)) api_sessions[[id]] else NULL
  collab <- identical(session$kind, "collab")
  required <- identical(Sys.getenv("LIPIDOMIC_ADMIN_REQUIRE_USER"), "1")
  if (!required && !collab) return(NULL)
  service <- api_service_caller(req)
  caller <- if (!is.null(service)) service else api_admin_caller(api_admin_authorization(req), required = TRUE)
  if (is.null(caller)) caller <- list(anonymous = TRUE)
  caller$sessionRead <- isTRUE(read)
  caller
}
# Open authorization is independent of the legacy REQUIRE_USER switch.
api_collab_open <- function(req, collab) {
  if (is.null(collab)) return(NULL)
  scalar <- function(x) is.character(x) && length(x) == 1L && !is.na(x) && nzchar(x)
  if (!is.list(collab) || !scalar(collab$project) || !scalar(collab$workspace))
    api_abort("api_bad_request", "Expected collab project and workspace.")
  caller <- api_service_caller(req)
  if (is.null(caller) || !identical(caller$project, collab$project) ||
      !identical(caller$workspaces, collab$workspace))
    api_abort("api_forbidden_scope", "Collab open requires the project's service identity.")
  caller
}
