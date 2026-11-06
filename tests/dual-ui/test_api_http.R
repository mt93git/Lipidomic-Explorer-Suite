local({
  directory <- tempfile(); dir.create(directory)
  stopifnot(file.copy("tests/dual-ui/fixtures/classic-seed7-synthetic.zip", file.path(directory, "synthetic.zip")))
  port <- httpuv::randomPort()
  child <- callr::r_bg(function(root, directory, port) {
    setwd(root)
    Sys.setenv(LIPIDOMIC_API_CHECKPOINT_DIR = directory, LIPIDOMIC_API_PORT = port)
    source("R/frontends/api/run.R")
  }, args = list(getwd(), directory, port), libpath = .libPaths(), cmdargs = "--vanilla")
  on.exit({ child$kill(); unlink(directory, recursive = TRUE) })
  base <- sprintf("http://127.0.0.1:%d/api/v1", port)
  health <- NULL
  deadline <- Sys.time() + 60
  repeat {
    health <- tryCatch(httr::GET(paste0(base, "/health"), httr::timeout(1)), error = function(e) NULL)
    if (!is.null(health) || !child$is_alive() || Sys.time() >= deadline) break
    Sys.sleep(0.2)
  }
  if (is.null(health)) stop("API did not become healthy: ", child$read_error())
  stopifnot(httr::status_code(health) == 200L, httr::content(health)$ok)
  cat("PASS I1 health 200\n")
  post <- function(path, body) httr::POST(paste0(base, path), body = body, encode = "json")
  opened <- post("/sessions", list(checkpointId = "synthetic"))
  stopifnot(httr::status_code(opened) == 200L)
  session <- httr::content(opened)
  stopifnot(nzchar(session$sessionId))
  again <- httr::content(post("/sessions", list(checkpointId = "synthetic")))
  stopifnot(identical(session$sessionId, again$sessionId))
  cat("PASS I1 sessions 200 cached\n")
  path <- paste0("/sessions/", session$sessionId, "/plots/results_dashboard/")
  plotted <- post(paste0(path, "pca"), list(inputs = session$inputs, width = 900))
  stopifnot(httr::status_code(plotted) == 200L, length(httr::content(plotted)$figure$data) > 0)
  cat("PASS I1 pca 200\n")
  stopifnot(httr::status_code(post("/sessions/unknown/plots/results_dashboard/pca", list())) == 404L,
    httr::status_code(post("/sessions", list(checkpointId = "missing"))) == 404L,
    httr::status_code(post("/sessions", list(checkpointId = "../synthetic"))) == 400L,
    httr::status_code(post(paste0(path, "unknown"), list())) == 400L,
    httr::status_code(post(paste0(path, "violin"), list(inputs = list(violin_lipid = "not-a-lipid")))) == 422L)
  checkpoints <- httr::content(httr::GET(paste0(base, "/checkpoints")))
  stopifnot(length(checkpoints) == 1L, checkpoints[[1]]$id == "synthetic",
    nchar(checkpoints[[1]]$sha256) == 64L)
  cat("PASS I1 errors 400/404/422 and checkpoints\n")
})
