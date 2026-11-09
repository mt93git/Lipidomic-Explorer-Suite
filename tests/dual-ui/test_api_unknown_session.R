# Chart audit b12 (F4): after an eviction Nexo's canvas validation got a generic 500 for the lost session and retried
# about 80 times in 6 minutes without telling the user. Every session route answers an unknown session with
# 404 {"error":"not_found","message":"Unknown session."}, whatever the body, so the client can reopen.
# (Cause: the route passed api_session_get(id) as a lazy argument, forced first inside an S4 `$<-` dispatch that
# re-wrapped the classed condition as a plain simpleError.)
for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
for (pkg in c("plumber", "callr", "httr")) if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP test_api_unknown_session: package", pkg, "not installed\n"); quit(status = 0) }
local({
  directory <- tempfile(); dir.create(directory)
  port <- httpuv::randomPort()
  child <- callr::r_bg(function(root, directory, port) {
    setwd(root)
    Sys.setenv(LIPIDOMIC_API_CHECKPOINT_DIR = directory, LIPIDOMIC_API_PORT = port,
      LIPIDOMIC_STORAGE_DIR = file.path(directory, "store"), LIPIDOMIC_API_WORKSPACE = "unknown-session-test")
    source("R/frontends/api/run.R")
  }, args = list(getwd(), directory, port), libpath = .libPaths(), cmdargs = "--vanilla")
  on.exit({ child$kill(); unlink(directory, recursive = TRUE) })
  base <- sprintf("http://127.0.0.1:%d/api/v1/sessions/nosuch999", port)
  health <- NULL; deadline <- Sys.time() + 60
  repeat {
    health <- tryCatch(httr::GET(sprintf("http://127.0.0.1:%d/api/v1/health", port), httr::timeout(1)), error = function(e) NULL)
    if (!is.null(health) || !child$is_alive() || Sys.time() >= deadline) break
    Sys.sleep(0.2)
  }
  if (is.null(health) && grepl("requires these Team symbols", child$read_error(), fixed = TRUE)) {
    cat("SKIP test_api_unknown_session: needs the production Team port (PRs 8 and 9)\n"); quit(save = "no", status = 0)
  }
  if (is.null(health)) stop("API did not become healthy: ", child$read_error())
  card <- "/cards/tcinstance_000000000000"
  routes <- list(
    list("POST", "/canvas/validate", list(token = "t1", state = list())),
    list("GET", "/canvas"),
    list("POST", "/checkpoints", list(label = "x", canvas = list(token = "t1", state = list()))),
    list("GET", ""),
    list("POST", "/design", list(unit = "animal", type = "independent", confirm = TRUE)),
    list("GET", "/analysis"), list("PATCH", "/analysis", list(inputs = list())),
    list("GET", "/cohort"), list("PUT", "/cohort", list()),
    list("POST", "/cards", list(source = "qc_pca_tab-pca2dPlot", inputs = list())),
    list("GET", paste0(card, "/schema")), list("PATCH", card, list(inputs = list())),
    list("POST", paste0(card, "/render"), list(width = 400, height = 300, format = "png")),
    list("POST", "/plots/results_dashboard/pca", list(inputs = list(), width = 400)),
    list("POST", "/export", list(figureKey = "pca_2d", formats = list("png"))),
    list("GET", paste0(card, "/data.csv")), list("GET", paste0(card, "/downloads")),
    list("GET", paste0(card, "/downloads/dl")),
    list("POST", paste0(card, "/statistics/violin"), list(mode = "describe")),
    list("GET", "/statistics/violin/policy"),
    list("POST", paste0(card, "/group-comparison/confirm"), list(confirmationToken = "x")),
    list("GET", paste0(card, "/group-comparison")))
  wrong <- character()
  for (r in routes) {
    response <- httr::VERB(r[[1L]], paste0(base, r[[2L]]), body = if (length(r) > 2L) r[[3L]], encode = "json")
    body <- tryCatch(httr::content(response, as = "parsed", type = "application/json"), error = function(e) list())
    if (httr::status_code(response) != 404L || !identical(body$error, "not_found"))
      wrong <- c(wrong, sprintf("%s %s -> %d %s", r[[1L]], r[[2L]], httr::status_code(response), if (is.null(body$error)) "" else body$error))
  }
  if (length(wrong)) stop("unknown session not answered 404 not_found:\n  ", paste(wrong, collapse = "\n  "))
  cat(sprintf("PASS every session route (%d) answers an unknown session with 404 not_found\n", length(routes)))
})
cat("PASS test_api_unknown_session\n")
