# Chart audit b11 F3 (pathwayPlot, pathwayVisNetwork): Team's "Options & Configuration" offers
# "Download Layout JSON" (download_config) and "Upload Layout JSON (.json):" (upload_config, a fileInput)
# (R/modules/13_pathway_module.R:171-173). The card's downloads list the module's configuration download,
# served by its own downloadHandler; the upload endpoint feeds the module the datapath data.frame a
# Shiny fileInput gives, and a bad file is refused with 4xx and Team's own message.
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_pathway_layout_json: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_pathway_layout_json")
source("frontends/nexo-api/engine.R")
source("frontends/nexo-api/export.R")

s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
status_of <- function(expr) tryCatch({ force(expr); 200L }, error = function(e) {
  cls <- class(e)[grepl("^api_", class(e))]
  if (!length(cls)) stop(e)
  if (any(cls %in% c("api_bad_request", "api_too_large", "api_unsupported"))) 400L else 500L
})
message_of <- function(expr) tryCatch({ force(expr); "" }, error = function(e) conditionMessage(e))

for (source in c("pathway_tab-pathwayPlot", "pathway_tab-pathwayVisNetwork")) {
  card <- api_card_create(s, source)
  id <- card$instanceId
  # 1. Downloads list Team's layout JSON with Team's label; the module's handler serves JSON that parses.
  downloads <- api_card_downloads(s, id)$downloads
  hit <- Filter(function(x) identical(x$id, "download_config"), downloads)
  if (length(hit) != 1L) stop(source, ": download_config not listed: ", paste(vapply(downloads, `[[`, "", "id"), collapse = ", "))
  if (!identical(hit[[1]]$label, "Download Layout JSON")) stop(source, ": label ", deparse(hit[[1]]$label))
  file <- api_card_download(s, id, "download_config")
  if (!identical(file$name, "pathway_layout_config.json")) stop(source, ": file name ", deparse(file$name))
  if (!grepl("json", file$type, fixed = TRUE)) stop(source, ": content type ", deparse(file$type))
  text <- if (is.raw(file$bytes)) rawToChar(file$bytes) else if (!is.null(file$path)) paste(readLines(file$path, warn = FALSE), collapse = "\n") else rawToChar(file$body)
  layout <- jsonlite::fromJSON(text, simplifyVector = FALSE)
  for (key in c("active_classes", "custom_nodes", "added_edges", "removed_edges", "position_overrides"))
    if (!key %in% names(layout)) stop(source, ": downloaded layout lacks ", key)
  cat("PASS", source, "downloads list Download Layout JSON and it parses\n")

  # 2. Round trip: move one node in the JSON, upload it; the module takes it (position_overrides_json) and settles.
  # Team's own format for a moved node: [x, y] (13_pathway_module.R:530 overrides[[node]] <- c(x, y)); PC is a default node.
  drawn_before <- api_card_render(s, id, 800, 600)$figure
  layout$position_overrides <- list(PC = list(123, -45))
  edited <- as.character(jsonlite::toJSON(layout, auto_unbox = TRUE, pretty = TRUE))
  before <- api_card_get(s, id)$inputs$position_overrides_json
  up <- api_card_upload(s, id, "upload_config", list(name = "pathway_layout_config.json", content = edited))
  if (!isTRUE(up$settled)) stop(source, ": upload did not settle")
  after <- up$inputs$position_overrides_json
  if (is.null(after) || identical(after, before)) stop(source, ": position_overrides_json unchanged: ", deparse(after))
  moved <- jsonlite::fromJSON(after, simplifyVector = FALSE)
  if (!identical(as.numeric(unlist(moved$PC)), c(123, -45))) stop(source, ": override ", after)
  drawn_after <- api_card_render(s, id, 800, 600)$figure
  if (identical(drawn_after, drawn_before)) stop(source, ": the render did not change after the upload")
  # The moved node is drawn at the uploaded position: plotly carries x = 123; visNetwork places nodes at x * 55
  # (13_pathway_module.R:1743 init_x <- pos[1] * 55), i.e. 6765.
  want <- if (grepl("VisNetwork$", source)) "6765" else "123"
  if (!grepl(sprintf("(^|[^0-9.])%s([^0-9]|$)", want), as.character(jsonlite::toJSON(drawn_after, auto_unbox = TRUE, digits = NA))))
    stop(source, ": no coordinate ", want, " in the render after the upload")
  again <- api_card_download(s, id, "download_config")
  text2 <- if (is.raw(again$bytes)) rawToChar(again$bytes) else if (!is.null(again$path)) paste(readLines(again$path, warn = FALSE), collapse = "\n") else rawToChar(again$body)
  if (!identical(as.numeric(unlist(jsonlite::fromJSON(text2, simplifyVector = FALSE)$position_overrides$PC)), c(123, -45)))
    stop(source, ": downloaded layout after upload lacks the moved node")
  cat("PASS", source, "upload of the edited layout is accepted, settles and round-trips\n")

  # 3. A non-JSON file, a wrong extension, an oversized file and an unknown input are refused with 4xx.
  bad <- list(name = "layout.json", content = "this is not json {")
  if (status_of(api_card_upload(s, id, "upload_config", bad)) != 400L) stop(source, ": non-JSON not refused with 4xx")
  msg <- message_of(api_card_upload(s, id, "upload_config", bad))
  if (!startsWith(msg, "Error loading layout JSON:")) stop(source, ": message is not Team's: ", msg)
  # Text that names a file is not read as one: it is not JSON.
  if (status_of(api_card_upload(s, id, "upload_config", list(name = "layout.json", content = "R/global.R"))) != 400L)
    stop(source, ": a file path was read instead of refused")
  if (!startsWith(message_of(api_card_upload(s, id, "upload_config", list(name = "layout.json", content = "\"text\""))), "Error loading layout JSON:"))
    stop(source, ": a JSON scalar did not get Team's message")
  if (status_of(api_card_upload(s, id, "upload_config", list(name = "layout.csv", content = "{}"))) != 400L)
    stop(source, ": a .csv file was accepted")
  big <- paste0("{\"pad\":\"", strrep("a", 300 * 1024), "\"}")
  if (status_of(api_card_upload(s, id, "upload_config", list(name = "layout.json", content = big))) != 400L)
    stop(source, ": an oversized file was accepted")
  if (status_of(api_card_upload(s, id, "sig_thresh", list(name = "layout.json", content = "{}"))) != 400L)
    stop(source, ": a non-file input was accepted as an upload")
  if (!identical(api_card_get(s, id)$inputs$position_overrides_json, after)) stop(source, ": a refused file changed the layout")
  cat("PASS", source, "a non-JSON, non-.json, oversized or unknown upload is refused with 4xx\n")
}
cat("PASS test_api_pathway_layout_json\n")
