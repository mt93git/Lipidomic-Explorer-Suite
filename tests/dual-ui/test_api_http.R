for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
for (pkg in c("plumber", "callr", "httr")) if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP test_api_http: package", pkg, "not installed\n"); quit(status = 0) }
local({
  directory <- tempfile(); dir.create(directory)
  stopifnot(file.copy("tests/dual-ui/fixtures/classic-seed7-synthetic.zip", file.path(directory, "synthetic.zip")))
  port <- httpuv::randomPort()
  child <- callr::r_bg(function(root, directory, port) {
    setwd(root)
    Sys.setenv(LIPIDOMIC_API_CHECKPOINT_DIR = directory, LIPIDOMIC_API_PORT = port,
      LIPIDOMIC_STORAGE_DIR = file.path(directory, "store"), LIPIDOMIC_API_WORKSPACE = "http-test")
    source("frontends/nexo-api/run.R")
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
  if (is.null(health) && grepl("requires these Team symbols", child$read_error(), fixed = TRUE)) {
    cat("SKIP test_api_http: needs the production Team port (PRs 8 and 9)\n"); quit(save = "no", status = 0)
  }
  if (is.null(health)) stop("API did not become healthy: ", child$read_error())
  stopifnot(httr::status_code(health) == 200L, httr::content(health)$ok)
  stopifnot(nzchar(httr::content(health)$root), nzchar(httr::content(health)$shiny),
    httr::content(health)$sessions == 0L, grepl("^[0-9a-f]{32}$", httr::content(health)$science$globalMd5))
  cat("PASS I1 health 200\n")
  catalog_response <- httr::GET(paste0(base, "/catalog"))
  stopifnot(httr::status_code(catalog_response) == 200L)
  # Read declarations without loading the application in this HTTP client process.
  definitions <- parse("R/frontends/team/plot_instances.R")
  counts <- new.env(parent = baseenv())
  for (expr in definitions) if (is.call(expr) && identical(expr[[1L]], as.name("<-")) && is.symbol(expr[[2L]]) &&
      as.character(expr[[2L]]) %in% c("team_plot_instance_families", "team_cell_instance_outputs")) eval(expr, counts)
  expected <- sum(vapply(counts$team_plot_instance_families, function(x) length(x$outputs), integer(1))) +
    length(counts$team_cell_instance_outputs)
  stopifnot(length(httr::content(catalog_response)$outputs) == expected)
  cat(sprintf("PASS I1 catalog %d\n", expected))
  post <- function(path, body) httr::POST(paste0(base, path), body = body, encode = "json")
  opened <- post("/sessions", list(checkpointId = "synthetic"))
  stopifnot(httr::status_code(opened) == 200L)
  session <- httr::content(opened)
  stopifnot(nzchar(session$sessionId), nchar(session$checkpointSha256) == 64L,
    identical(session$preparation$check, "matches archived receipt"),
    !is.null(session$preparation$revision), is.list(session$design), session$samples == 8L, session$lipids == 12L)
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
    httr::status_code(post(paste0(path, "unknown"), list())) == 400L)
  # A dashboard copy falls back to a valid lipid on its first render (Team's
  # team_dashboard_instance_input); once the input is applied the module reports 422.
  stopifnot(httr::status_code(post(paste0(path, "violin"), list(inputs = list(violin_lipid = "not-a-lipid")))) %in% c(200L, 422L))
  checkpoints <- httr::content(httr::GET(paste0(base, "/checkpoints")))
  stopifnot(length(checkpoints) == 1L, checkpoints[[1]]$id == "synthetic",
    nchar(checkpoints[[1]]$sha256) == 64L, checkpoints[[1]]$source == "folder",
    checkpoints[[1]]$sizeBytes > 0)
  cat("PASS I1 errors 400/404/422 and checkpoints\n")
  session_path <- paste0("/sessions/", session$sessionId)
  inspected <- httr::GET(paste0(base, session_path))
  stopifnot(httr::status_code(inspected) == 200L, !is.null(httr::content(inspected)$revision))
  designed <- post(paste0(session_path, "/design"), list(unit = "Animal", type = "independent", confirm = TRUE))
  stopifnot(httr::status_code(designed) == 200L, isTRUE(httr::content(designed)$allowed))
  violin_response <- post(paste0(session_path, "/cards"), list(source = "results_dashboard-plot_violin"))
  stopifnot(httr::status_code(violin_response) == 200L)
  violin_path <- paste0(session_path, "/cards/", httr::content(violin_response)$instanceId)
  stats_response <- post(paste0(violin_path, "/statistics/violin"), list(mode = "describe"))
  stopifnot(httr::status_code(stats_response) == 200L,
    identical(httr::content(stats_response)$status, "ok"))
  cat("PASS stats HTTP describe 200\n")
  created <- post(paste0(session_path, "/cards"), list(source = "qc_pca_tab-pca2dPlot"))
  stopifnot(httr::status_code(created) == 200L)
  card_path <- paste0(session_path, "/cards/", httr::content(created)$instanceId)
  schema_response <- httr::GET(paste0(base, card_path, "/schema"))
  schema <- httr::content(schema_response)
  stopifnot(httr::status_code(schema_response) == 200L, is.list(schema$controls),
    length(schema$controls) > 0L, is.null(names(schema$controls)))
  cat("PASS I1 card schema 200\n")
  rendered <- post(paste0(card_path, "/render"), list(width = 800, height = 600))
  bytes <- httr::content(rendered, as = "raw")
  stopifnot(httr::status_code(rendered) == 200L,
    grepl("image/png", httr::headers(rendered)[["content-type"]], fixed = TRUE),
    !is.null(httr::headers(rendered)[["x-nexo-revision"]]),
    identical(bytes[1:8], as.raw(c(137, 80, 78, 71, 13, 10, 26, 10))))
  cat("PASS I1 card PNG bytes\n")
  presets <- httr::GET(paste0(base, "/export/presets"))
  stopifnot(httr::status_code(presets) == 200L, length(httr::content(presets)$presets) == 5L)
  bad <- post(paste0(session_path, "/export"), list(figureKey = "nope"))
  stopifnot(httr::status_code(bad) == 400L)
  cat("PASS I1 export presets 200, bad export 400\n")
  # Keep nested node arrays as lists through Plumber's JSON parser.
  canvas <- list(version = "1", libraryHidden = FALSE, nodes = list(
    list(kind = "illustration", id = "illustration_http", label = "LC-MS", x = 0, y = 0,
      width = 620, height = 720, visual = list(background = "#ffffff"),
      assetId = "lc-ms", assetVersion = "1", color = "#2d5f8a")))
  validated <- post(paste0(session_path, "/canvas/validate"), list(token = "http-validate", state = canvas))
  stopifnot(httr::status_code(validated) == 200L, isTRUE(httr::content(validated)$ok))
  current <- httr::GET(paste0(base, session_path, "/canvas"))
  stopifnot(httr::status_code(current) == 200L,
    identical(httr::content(current), httr::content(validated)$state))
  saved <- post(paste0(session_path, "/checkpoints"), list(label = "roundtrip",
    canvas = list(token = "http-save", state = canvas)))
  record <- httr::content(saved)
  stopifnot(httr::status_code(saved) == 200L, nchar(record$sha256) == 64L,
    record$id == record$sha256, record$source == "store")
  checkpoint_path <- paste0(base, "/checkpoints/", record$id)
  downloaded <- httr::GET(paste0(checkpoint_path, "/download"))
  bytes <- httr::content(downloaded, as = "raw")
  stopifnot(httr::status_code(downloaded) == 200L,
    grepl("application/zip", httr::headers(downloaded)[["content-type"]], fixed = TRUE),
    grepl('attachment; filename="roundtrip.zip"', httr::headers(downloaded)[["content-disposition"]], fixed = TRUE),
    identical(bytes[1:2], charToRaw("PK")))
  upload <- file.path(directory, "download.bin"); writeBin(bytes, upload)
  uploaded <- httr::POST(paste0(base, "/checkpoints"), encode = "multipart",
    body = list(file = httr::upload_file(upload, type = "application/zip"), label = "upload"))
  stopifnot(httr::status_code(uploaded) == 200L, identical(httr::content(uploaded), record[setdiff(names(record), "near_limit")]))
  # near_limit is the save response's project-size warning (test_api_record_warning.R), not part of the record.
  listing <- httr::content(httr::GET(paste0(base, "/checkpoints")))
  stopifnot(listing[[1L]]$id == record$id, listing[[1L]]$source == "store")
  # Opening identical bytes through the saved id reuses the same live restore.
  reopened_response <- post("/sessions", list(checkpointId = record$id))
  reused_response <- post("/sessions", list(checkpointId = record$id))
  reopened <- httr::content(reopened_response); reused <- httr::content(reused_response)
  stopifnot(httr::status_code(reopened_response) == 200L, httr::status_code(reused_response) == 200L,
    nzchar(reopened$sessionId), identical(reopened$sessionId, reused$sessionId))
  stopifnot(httr::status_code(httr::DELETE(checkpoint_path)) == 200L,
    httr::status_code(httr::GET(paste0(checkpoint_path, "/download"))) == 404L,
    httr::status_code(httr::DELETE(paste0(base, "/checkpoints/synthetic"))) == 405L)
  writeBin(charToRaw("not a checkpoint"), upload)
  invalid <- httr::POST(paste0(base, "/checkpoints"), encode = "multipart",
    body = list(file = httr::upload_file(upload, type = "application/zip"), label = "invalid"))
  stopifnot(httr::status_code(invalid) == 422L)
  cat("PASS I1 checkpoint validate/save/download/upload/delete\n")
  patched <- httr::PATCH(paste0(base, card_path), body = list(inputs = list()), encode = "json")
  stopifnot(httr::status_code(patched) == 200L,
    httr::status_code(httr::DELETE(paste0(base, card_path))) == 200L,
    httr::status_code(httr::DELETE(paste0(base, session_path))) == 200L,
    httr::status_code(httr::GET(paste0(base, session_path))) == 409L)  # closed sessions answer session_lost
  cat("PASS I1 session delete 200\n")
})
