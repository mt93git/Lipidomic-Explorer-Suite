# Real transport regression: run from the repository root. No Team engine required.
for (pkg in c("httpuv", "curl", "httr", "callr"))
  if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP test_api_dataset_http: package", pkg, "not installed\n"); quit(status = 0) }
for (pkg in c("digest", "jsonlite"))
  if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
local({
  cap <- 90 * 1024^2
  written <- 0; active_cap <- cap
  transport <- new.env(parent = globalenv())
  sys.source("frontends/nexo-api/datasets.R", envir = transport)
  # Observe disk writes without replacing the real HTTP client.
  transport$writeBin <- function(object, con, ...) {
    written <<- written + length(object)
    stopifnot(written <= active_cap)
    base::writeBin(object, con, ...)
  }
  port <- httpuv::randomPort()
  ready <- tempfile(); on.exit(unlink(ready))
  # httpuv cannot start a server inside a forked child once the parent has loaded it, so the
  # fixture server runs in a separate R process.
  server <- callr::r_bg(function(port, cap, ready) {
    srv <- httpuv::startServer("127.0.0.1", port, list(call = function(req) {
      chunked <- grepl("chunked", req$PATH_INFO)
      size <- if (grepl("small", req$PATH_INFO)) 16L else if (identical(req$REQUEST_METHOD, "POST")) 128 * 1024 else cap + 65536
      # httpuv uses proper chunk framing when it gzip-encodes a response. An
      # explicit identity encoding keeps the Content-Length cases uncompressed.
      headers <- if (chunked) list() else list(`Content-Encoding` = "identity", `Content-Length` = as.character(size))
      list(status = if (grepl("error", req$PATH_INFO)) 502L else 200L,
        headers = headers, body = raw(size))
    }))
    file.create(ready)
    repeat httpuv::service(50)
  }, args = list(port = port, cap = cap, ready = ready), supervise = TRUE)
  on.exit(server$kill(), add = TRUE)
  deadline <- Sys.time() + 10
  while (!file.exists(ready) && Sys.time() < deadline) Sys.sleep(0.02)
  stopifnot(file.exists(ready))
  # Prove the no-length fixture is a healthy, genuinely chunked HTTP response.
  probe <- curl::curl_fetch_memory(paste0("http://127.0.0.1:", port, "/small-chunked"),
    handle = curl::new_handle(accept_encoding = "gzip"))
  headers <- tolower(rawToChar(probe$headers))
  stopifnot(probe$status_code == 200L, identical(probe$content, raw(16L)),
    grepl("transfer-encoding: chunked", headers, fixed = TRUE),
    !grepl("content-length:", headers, fixed = TRUE))
  small <- transport$api_dataset_admin_http("GET", paste0("http://127.0.0.1:", port, "/small"), character())
  stopifnot(small$status == 200L, identical(readBin(small$path, "raw", 16L), raw(16L)))
  unlink(small$path)
  rpc <- transport$api_dataset_admin_http("POST", paste0("http://127.0.0.1:", port, "/small"), character(), "{}")
  stopifnot(rpc$status == 200L, identical(rpc$body, raw(16L)))
  for (suffix in c("length", "chunked", "length-error", "chunked-error")) {
    written <- 0
    before <- list.files(tempdir(), pattern = "^admin-response-", full.names = TRUE)
    result <- tryCatch(transport$api_dataset_admin_http("GET", paste0("http://127.0.0.1:", port, "/", suffix), character()), error = identity)
    # A body over the cap is cut by the limit; an error status is refused before any body is read.
    stopifnot(inherits(result, "error"), grepl(if (endsWith(suffix, "error")) "size|limit|exceed|HTTP error" else "size|limit|exceed", conditionMessage(result), ignore.case = TRUE),
      identical(before, list.files(tempdir(), pattern = "^admin-response-", full.names = TRUE)))
    stopifnot(written <= cap)
    if (startsWith(suffix, "length")) stopifnot(written == 0) else if (!endsWith(suffix, "error")) stopifnot(written > 0)
    cat("PASS bounded storage transfer and partial cleanup:", suffix, "\n")
  }
  active_cap <- 64 * 1024
  for (suffix in c("length", "chunked", "length-error", "chunked-error")) {
    written <- 0
    before <- list.files(tempdir(), pattern = "^admin-response-", full.names = TRUE)
    result <- tryCatch(transport$api_dataset_admin_http("POST", paste0("http://127.0.0.1:", port, "/", suffix), character(), "{}"), error = identity)
    stopifnot(inherits(result, "error"), written <= active_cap,
      grepl(if (endsWith(suffix, "error")) "size|limit|exceed|HTTP error" else "size|limit|exceed", conditionMessage(result), ignore.case = TRUE),
      identical(before, list.files(tempdir(), pattern = "^admin-response-", full.names = TRUE)))
    if (startsWith(suffix, "length")) stopifnot(written == 0)
    cat("PASS bounded RPC transfer and cleanup:", suffix, "\n")
  }
})
