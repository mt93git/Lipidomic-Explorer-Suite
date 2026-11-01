Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/frontends/team/canvas_state.R")
fails <- function(compute) stopifnot(inherits(tryCatch(compute(), error = identity), "error"))
svg <- '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480"><defs><clipPath id="plot-clip"><rect width="620" height="450"/></clipPath></defs><g clip-path="url(#plot-clip)" pointer-events="none" shape-rendering="crispEdges" style="fill:rgb(23, 107, 115);font-family:Arial;font-size:16px;"><path d="M0,0L10,10"/><text x="10" y="20">Reviewed figure</text></g></svg>'
svg_url <- function(text) paste0("data:image/svg+xml;charset=utf-8,", utils::URLencode(text, reserved = TRUE))
png_url <- "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0b8AAAAASUVORK5CYII="
node <- list(id = "results_dashboard-plot_pca", label = "Reviewed PCA", x = 33, y = 47,
  width = 700, height = 500, visual = list(plotTitle = "My figure", xTitle = "PC1", yTitle = "PC2",
    fontSize = 18, fontColor = "#123456", markColor = "#abcdef", background = "#ffffff"),
  finished = list(url = svg_url(svg), createdAt = "2026-10-28T03:20:10.123Z", stale = FALSE,
    provenance = list(requestId = "prepared-request-1", sampleCount = 42L)))
state <- list(version = "1", libraryHidden = TRUE, nodes = list(node))
valid <- team_canvas_validate(state)
path <- tempfile(fileext = ".json")
writeLines(team_canvas_json(valid), path, useBytes = TRUE)
stopifnot(identical(team_canvas_json(team_canvas_read(path)), team_canvas_json(valid)))
stopifnot(identical(team_canvas_image(png_url), png_url), identical(team_canvas_image(svg_url(svg)), svg_url(svg)))
base64_svg <- paste0("data:image/svg+xml;base64,", gsub("[\r\n]", "", jsonlite::base64_enc(charToRaw(svg))))
stopifnot(identical(team_canvas_image(base64_svg), base64_svg))
empty <- team_canvas_validate(list(version = 1, libraryHidden = FALSE, nodes = list()))
stopifnot(identical(empty$version, "1"), grepl('"nodes":[]', team_canvas_json(empty), fixed = TRUE))
illustration <- list(version = "1", libraryHidden = FALSE, nodes = list(list(
  kind = "illustration", assetVersion = "1", id = "illustration_neutrophil_1", assetId = "neutrophil",
  label = "Neutrophil (conceptual)", x = 20, y = 20, width = 320, height = 260,
  visual = list(background = "#ffffff"), color = "#2d5f8a", finished = NULL
)))
illustration_checked <- team_canvas_validate(illustration)
stopifnot(identical(illustration_checked$nodes[[1]]$kind, "illustration"),
  identical(illustration_checked$nodes[[1]]$assetId, "neutrophil"),
  identical(illustration_checked$nodes[[1]]$color, "#2d5f8a"))
taxonomy <- illustration
taxonomy$nodes[[1]]$id <- "illustration_lipid_class_taxonomy_1"
taxonomy$nodes[[1]]$assetId <- "lipid-class-taxonomy"
stopifnot(identical(team_canvas_validate(taxonomy)$nodes[[1]]$assetId, "lipid-class-taxonomy"))
for (bad in list(
  within(illustration, {nodes[[1]]$assetId <- "unknown"}),
  within(illustration, {nodes[[1]]$color <- "javascript:alert(1)"}),
  within(illustration, {nodes[[1]]$kind <- "illustration"; nodes[[1]]$visual <- list(plotTitle = "not allowed")})
)) stopifnot(inherits(tryCatch(team_canvas_validate(bad), error = identity), "error"))

for (change in list(function(x) {x$version <- "2";x}, function(x) {x$libraryHidden <- 1;x},
  function(x) {x$nodes[[1]]$width <- Inf;x}, function(x) {x$nodes[[1]]$height <- 100;x},
  function(x) {x$nodes[[1]]$x <- -1;x}, function(x) {x$nodes[[1]]$id <- "<script>";x},
  function(x) {x$nodes[[1]]$visual$fontColor <- "url(evil)";x},
  function(x) {x$nodes[[1]]$visual$fontSize <- 100;x},
  function(x) {x$nodes[[1]]$finished$createdAt <- "2026-99-99T12:00:00Z";x},
  function(x) {x$nodes[[1]]$finished$stale <- "false";x},
  function(x) {x$nodes[[1]]$finished$provenance <- list(script = list("nested"));x},
  function(x) {x$nodes[[2]] <- x$nodes[[1]];x},
  function(x) {x$nodes <- rep(x$nodes, 41);x},
  function(x) {x$extra <- "unsupported";x})) fails(function() team_canvas_validate(change(state)))

unsafe <- c('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
  '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
  '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
  '<?evil instruction?><svg xmlns="http://www.w3.org/2000/svg"/>',
  '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.org/a.png"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:url(https://example.org/a)"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><path style="background:image-set(data:text/html,x)"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><path fill="u\\72l(\\68ttps://example.org/a)"/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://example.org/a";</style></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:evil="http://example.org"><evil:path/></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use href="#safe" xlink:href="https://example.org/a"/></svg>')
for (text in unsafe) fails(function() team_canvas_image(svg_url(text)))
fails(function() team_canvas_image("data:image/png;base64,SGVsbG8="))
fails(function() team_canvas_image("https://example.org/figure.png"))
fails(function() team_canvas_image(paste0("data:image/svg+xml,", strrep("x", team_canvas_limits$snapshot))))

# Keep the total boundary effective even when every individual figure fits.
large_bytes <- c(jsonlite::base64_dec(substring(png_url, 23L)), raw(2700000L))
large_url <- paste0("data:image/png;base64,", gsub("[\r\n]", "", jsonlite::base64_enc(large_bytes)))
large_state <- state
large_state$nodes <- lapply(seq_len(8L), function(i) {
  n <- node; n$id <- paste0("plot_", i); n$finished$url <- large_url; n
})
fails(function() team_canvas_validate(large_state))
rm(large_state, large_url, large_bytes)

# The accepted token belongs to a validated state, never a rejected replacement.
messages <- list()
host <- function(input, output, session) {
  session$sendCustomMessage <- function(type, message) messages[[length(messages) + 1L]] <<- list(type = type, message = message)
  team_canvas_server(input, output, session, list())
}
shiny::testServer(host, {
  session$flushReact()
  session$setInputs(team_canvas_state = list(token = "checkpoint-1", state = state))
  stopifnot(identical(session$userData$team_canvas_acked_token(), "checkpoint-1"),
    isTRUE(messages[[length(messages)]]$message$ok),
    identical(team_canvas_json(session$userData$team_canvas_export()), team_canvas_json(valid)))
  bad <- state; bad$version <- "bad"
  session$setInputs(team_canvas_state = list(token = "checkpoint-2", state = bad))
  stopifnot(is.null(session$userData$team_canvas_acked_token()),
    identical(messages[[length(messages)]]$message$ok, FALSE),
    identical(team_canvas_json(session$userData$team_canvas_export()), team_canvas_json(valid)))
  session$userData$team_canvas_import(state)
  session$flushReact()
  restored <- messages[[length(messages)]]
  stopifnot(identical(restored$type, "team-canvas-restore"),
    identical(restored$message$state$nodes[[1]]$finished$url, node$finished$url),
    identical(restored$message$state$nodes[[1]]$finished$stale, FALSE))
  session$userData$team_canvas_import(NULL); session$flushReact()
  stopifnot(is.null(session$userData$team_canvas_export()),
    is.null(messages[[length(messages)]]$message$state))
})

# Real shared-data archive hooks: optional sidecar, old ZIP clear, Classic ignores.
source("R/global.R")
fixture <- normalizePath("tests/dual-ui/fixtures/classic-seed7-synthetic.zip")
# Simulate an archive created by several historical restore/export cycles,
# where the stored basename has grown close to the filesystem's component limit.
long_fixture_dir <- tempfile("long-session-fixture-"); dir.create(long_fixture_dir)
utils::unzip(fixture, exdir = long_fixture_dir)
long_state_path <- file.path(long_fixture_dir, "state.json")
long_state <- jsonlite::read_json(long_state_path, simplifyVector = TRUE)
old_dataset <- file.path(long_fixture_dir, long_state$uploads[[1]])
long_dataset_name <- paste0(strrep("d", 220L), ".csv")
long_dataset <- file.path(dirname(old_dataset), long_dataset_name)
stopifnot(file.rename(old_dataset, long_dataset))
long_state$uploads[[1]] <- file.path("data_files", long_dataset_name)
jsonlite::write_json(long_state, long_state_path, auto_unbox = TRUE, pretty = TRUE, digits = 17)
long_fixture <- tempfile(fileext = ".zip")
zip::zipr(long_fixture, c("state.json", "shared-state-v1.json", "data_files"), root = long_fixture_dir)
exported <- NULL
shiny::testServer(shared_data_server, args = list(preparation_policy = "team", design_check = function() FALSE), {
  imported <- "not-called"
  session$userData$team_canvas_export <- function(provenance = NULL) valid
  session$userData$team_canvas_import <- function(state = NULL, provenance = NULL) imported <<- state
  session$returned$import_session_path(long_fixture)
  for (i in seq_len(10L)) session$flushReact()
  stopifnot(isTRUE(session$returned$session_restored()), is.null(imported))
  session$setInputs(team_canvas_state = list(token = "private-token", state = state))
  exported <<- tempfile(fileext = ".zip")
  session$returned$export_session_path(exported)
  archive <- read_session_archive(exported, include_team_canvas = TRUE)
  stopifnot(identical(team_canvas_json(archive$canvas), team_canvas_json(valid)),
    !any(grepl("team_canvas_", names(archive$state$inputs))),
    !grepl("private-token", paste(readLines(file.path(archive$directory, "state.json")), collapse = ""), fixed = TRUE))
  unlink(archive$directory, recursive = TRUE)
  session$returned$import_session_path(exported)
  for (i in seq_len(10L)) session$flushReact()
  stopifnot(identical(team_canvas_json(imported), team_canvas_json(valid)),
    is.null(session$returned$data_processed()))
  # Repeatedly restore and re-export a near-limit legacy basename. The restored
  # private path and every subsequent archive entry must remain short.
  cycle_archive <- long_fixture
  for (cycle in seq_len(8L)) {
    session$returned$import_session_path(cycle_archive)
    for (i in seq_len(10L)) session$flushReact()
    stopifnot(isTRUE(session$returned$session_restored()), length(session$returned$loaded_files()) == 1L,
      nchar(basename(unname(session$returned$loaded_files()[[1]]))) < 80L)
    next_archive <- tempfile(fileext = ".zip")
    session$returned$export_session_path(next_archive)
    checked <- read_session_archive(next_archive, include_team_canvas = TRUE)
    internal <- unname(checked$state$uploads[[1]])
    stopifnot(nchar(basename(internal)) < 64L,
      file.exists(file.path(checked$directory, internal)))
    unlink(checked$directory, recursive = TRUE)
    if (!identical(cycle_archive, long_fixture)) unlink(cycle_archive)
    cycle_archive <- next_archive
  }
  if (!identical(cycle_archive, long_fixture)) unlink(cycle_archive)
})

bad_dir <- tempfile("bad-canvas-sidecar-"); dir.create(bad_dir)
utils::unzip(exported, exdir = bad_dir)
writeLines('{"version":"future-version"}', file.path(bad_dir, "team-canvas-v1.json"))
bad_zip <- tempfile(fileext = ".zip")
zip::zipr(bad_zip, list.files(bad_dir, all.files = FALSE), root = bad_dir)
fails(function() read_session_archive(bad_zip, include_team_canvas = TRUE))
ignored <- read_session_archive(bad_zip)
stopifnot(is.null(ignored$canvas)); unlink(ignored$directory, recursive = TRUE)
shiny::testServer(shared_data_server, args = list(preparation_policy = "classic"), {
  session$userData$team_canvas_export <- function(...) stop("Classic must not call Canvas export")
  session$userData$team_canvas_import <- function(...) stop("Classic must not call Canvas import")
  session$returned$import_session_path(bad_zip)
  for (i in seq_len(10L)) session$flushReact()
  stopifnot(isTRUE(session$returned$session_restored()))
  classic_zip <- output$export_session_btn
  stopifnot(!"team-canvas-v1.json" %in% zip::zip_list(classic_zip)$filename)
})
unlink(c(path, exported, bad_zip, bad_dir, long_fixture, long_fixture_dir), recursive = TRUE)
cat("PASS: bounded Canvas schema, safe immutable figures, token acknowledgements, short-name repeated Team archive round-trip, old ZIP clear, Classic isolation\n")
