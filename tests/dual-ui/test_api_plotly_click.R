# Chart audit b12 (Astra review 2026-11-08, P1): Team turns a click on a cell plot's Plotly point into an input change
# (R/frontends/team/plot_instances.R l.55-62): a class bar of cell_class_plot selects that class (cell_class), a point of
# cell_comparison_plot selects that measurement (cell_sample). Nexo had no plotly_click bridge. The API now takes a
# click as Shiny's plotly binding sends it: the root input "plotly_click-<source>" (source = the instance's private
# event source, e.g. tcinstance_<id>-cell_class_profile) set to the JSON array of points plotly's htmlwidget builds
# (eventDataWithKey: curveNumber, pointNumber, x, y and, when present, z, customdata, key), so Team's own observer
# (lipidomic_plotly_event -> plotly::event_data) runs. Route: POST /api/v1/sessions/<id>/cards/<instanceId>/events
# {event: "plotly_click", source, points}. Only for the sources Team registers with event_register("plotly_click")
# and observes for a canvas copy (api_card_click_sources).
#   Rscript tests/dual-ui/test_api_plotly_click.R
# Part 1 (Team's code + the point validation) needs only base R and jsonlite; part 2 (a live Team session) is skipped
# when Team cannot run (the coordinator runs it).
if (!requireNamespace("jsonlite", quietly = TRUE)) { cat("SKIP test_api_plotly_click: jsonlite not installed\n"); quit(status = 0) }
local({
  source("frontends/nexo-api/session.R", local = TRUE)
  source("frontends/nexo-api/cards.R", local = TRUE)
  if (!exists("api_card_click_sources") || !exists("api_plotly_points", mode = "function"))
    stop("FAIL the API has no plotly_click bridge (api_card_click_sources / api_plotly_points)")
  # Every allowed source is one Team registers for plotly_click on that output and observes on a canvas copy.
  # Production keeps Team's cell views in R/cell_show.R; the hooks tree moved them to R/frontends/team/cell_show.R.
  cell_file <- Filter(file.exists, c("R/frontends/team/cell_show.R", "R/cell_show.R"))[1L]
  if (is.na(cell_file)) stop("FAIL Team's cell_show.R is in neither R/frontends/team nor R")
  cell <- paste(readLines(cell_file, warn = FALSE), collapse = "\n")
  adapter <- paste(readLines("R/frontends/team/plot_instances.R", warn = FALSE), collapse = "\n")
  stopifnot(identical(sort(names(api_card_click_sources)), c("cell_class_plot", "cell_comparison_plot")))
  for (output in names(api_card_click_sources)) {
    source_id <- api_card_click_sources[[output]]
    body <- regmatches(cell, regexpr(paste0("output\\$", output, "<-plotly::renderPlotly\\(\\{[^\n]*"), cell))
    if (!length(body) || !grepl(paste0('source="', source_id, '"'), body, fixed = TRUE) ||
        !grepl('event_register("plotly_click")', body, fixed = TRUE))
      stop("FAIL ", output, " does not register plotly_click for source ", source_id, " in ", cell_file)
    if (!grepl(paste0("lipidomic_plotly_event('plotly_click',source=session$ns('", source_id, "')"), adapter, fixed = TRUE))
      stop("FAIL Team's canvas copy does not observe plotly_click on its private ", source_id)
  }
  cat("PASS the click sources are the ones Team registers (event_register) and observes on a canvas copy\n")

  ok <- function(points) tryCatch(api_plotly_points(points), error = function(e) e)
  bad <- function(points) inherits(ok(points), "api_bad_request")
  one <- list(list(curveNumber = 1L, pointNumber = 3L, x = 12.5, y = "PC"))
  got <- ok(one)
  if (inherits(got, "error")) stop("FAIL a plain click point is refused: ", conditionMessage(got))
  json <- api_plotly_click_json(got)
  parsed <- jsonlite::parse_json(json, simplifyVector = TRUE)  # what plotly::event_data does with the input value
  if (!is.data.frame(parsed) || !identical(parsed$y, "PC") || !identical(parsed$curveNumber, 1L) || !identical(parsed$x, 12.5))
    stop("FAIL the input value does not parse as plotly::event_data reads it: ", json)
  withdata <- ok(list(list(curveNumber = 0L, pointNumber = 7L, x = "Reference", y = 3.2, customdata = "S07")))
  if (!identical(jsonlite::parse_json(api_plotly_click_json(withdata), simplifyVector = TRUE)$customdata, "S07"))
    stop("FAIL customdata is not carried")
  box <- ok(list(list(curveNumber = 0L, pointNumber = list(2L, 4L), x = 1, y = 2, z = 3, key = list("a", "b"))))
  if (inherits(box, "error")) stop("FAIL a pointNumber pair / z / key array is refused: ", conditionMessage(box))
  if (!bad(NULL) || !bad(list()) || !bad("x") || !bad(list(list(curveNumber = 0L, pointNumber = 1L, x = 1, y = 2, evil = "x"))) ||
      !bad(list(list(curveNumber = -1L, pointNumber = 1L, x = 1, y = 2))) ||
      !bad(list(list(curveNumber = 0L, pointNumber = 1L, x = list(a = 1), y = 2))) ||
      !bad(list(list(curveNumber = 0L, pointNumber = 1L, x = 1, y = strrep("y", 2001)))) ||
      !bad(rep(one, 51L)))
    stop("FAIL a malformed click (empty, not an array, unknown key, negative curve, nested value, long text, 51 points) is accepted")
  cat("PASS click points: plotly's shape is accepted and parses as event_data reads it; malformed clicks are 400\n")
})

for (pkg in c("shiny", "jsonlite", "digest", "plumber", "plotly")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_plotly_click part 2: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV", "LIPIDOMIC_API_WORKERS"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_plotly_click")
Sys.setenv(LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
source("frontends/nexo-api/engine.R")
fails <- function(expr, class = "api_bad_request") tryCatch({ force(expr); FALSE }, error = function(e) inherits(e, class))
s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip") # registered: the route below looks it up
on.exit(api_session_close(s), add = TRUE)
# The catalog tells Nexo which cards forward clicks, and from which source.
if (!identical(api_catalog_entry("cell_class_plot")$clickSource, "cell_class_profile") ||
    !identical(api_catalog_entry("cell_comparison_plot")$clickSource, "cell_comparison_points") ||
    !is.null(api_catalog_entry("results_dashboard-plot_pca")$clickSource))
  stop("FAIL the catalog's clickSource is not exactly the two cell plots' sources")
cat("PASS catalog clickSource: cell_class_plot and cell_comparison_plot only\n")
traces <- function(figure) Filter(is.list, figure$data)
values <- function(x) unlist(x, use.names = FALSE)

# cell_class_plot: a click on a class bar selects that class (Team: updateSelectInput(session,'cell_class',...)).
cls <- api_card_create(s, "cell_class_plot")
drawn <- api_card_render(s, cls$instanceId, 620, 720)
if (!identical(drawn$figure$source, paste0(cls$instanceId, "-cell_class_profile")))
  stop("FAIL the class plot's event source is not the instance's private one: ", deparse(drawn$figure$source))
classes <- unique(unlist(lapply(traces(drawn$figure), function(t) values(t$y))))
before <- as.character(values(api_card_get(s, cls$instanceId)$inputs$cell_class))
target <- setdiff(classes, before)
if (!length(target)) stop("FAIL the fixture shows a single class; cannot test a class click")
target <- target[[1L]]
epoch <- api_render_epoch(s, cls$instanceId); s$dirty <- FALSE
out <- api_card_event(s, cls$instanceId, list(event = "plotly_click", source = "cell_class_profile",
  points = list(list(curveNumber = 0L, pointNumber = 0L, x = 1.5, y = target))))
if (!identical(as.character(values(out$inputs$cell_class)), target))
  stop("FAIL a click on the ", target, " bar left cell_class at ", paste(values(out$inputs$cell_class), collapse = ","))
if (!"cell_class" %in% values(out$changed)) stop("FAIL the answer does not name cell_class as changed")
if (!identical(as.character(values(api_card_get(s, cls$instanceId)$inputs$cell_class)), target)) stop("FAIL the card record keeps the old class")
if (identical(api_render_epoch(s, cls$instanceId), epoch)) stop("FAIL the click did not invalidate the card's cached render")
if (!isTRUE(s$dirty)) stop("FAIL a click that changes the selection must dirty the session (it is an edit)")
if (!identical(as.character(values(s$explicit[[cls$instanceId]]$cell_class)), target)) stop("FAIL the new class is not recorded with the card's explicit inputs (disk cache / render worker)")
redrawn <- api_card_render(s, cls$instanceId, 620, 720)
if (isTRUE(redrawn$cached)) stop("FAIL the card was not drawn again after the click")
cat("PASS cell_class_plot: a click on the", target, "bar selects that class; the card draws again\n")
# Clicking the same bar again is a new event (Shiny's priority 'event') and changes nothing.
same <- api_card_event(s, cls$instanceId, list(event = "plotly_click", source = "cell_class_profile",
  points = list(list(curveNumber = 0L, pointNumber = 0L, x = 1.5, y = target))))
if (length(values(same$changed)) || !identical(as.character(values(same$inputs$cell_class)), target)) stop("FAIL a repeated click changed the card")
# Team ignores a y that is not a class of the data (its observer's own check).
odd <- api_card_event(s, cls$instanceId, list(event = "plotly_click", source = "cell_class_profile",
  points = list(list(curveNumber = 0L, pointNumber = 0L, x = 1, y = "NOT_A_CLASS"))))
if (length(values(odd$changed))) stop("FAIL a click outside Team's classes changed the card")
cat("PASS repeated click and a click outside Team's classes change nothing\n")

# cell_comparison_plot: a click on a measurement point selects that measurement (cell_sample).
cmp <- api_card_create(s, "cell_comparison_plot")
figure <- tryCatch(api_card_render(s, cmp$instanceId, 620, 720)$figure, error = function(e) stop("FAIL the comparison plot does not draw: ", conditionMessage(e)))
if (!identical(figure$source, paste0(cmp$instanceId, "-cell_comparison_points"))) stop("FAIL the comparison plot's event source is not private: ", deparse(figure$source))
samples <- unique(unlist(lapply(traces(figure), function(t) values(t$customdata))))
current <- as.character(values(api_card_get(s, cmp$instanceId)$inputs$cell_sample))
pick <- setdiff(samples, current)
if (!length(pick)) stop("FAIL the comparison plot shows no other measurement to click")
pick <- pick[[1L]]
moved <- api_card_event(s, cmp$instanceId, list(event = "plotly_click", source = "cell_comparison_points",
  points = list(list(curveNumber = 0L, pointNumber = 0L, x = "Reference", y = 1, customdata = pick))))
if (!identical(as.character(values(moved$inputs$cell_sample)), pick)) stop("FAIL a click on ", pick, " left cell_sample at ", paste(values(moved$inputs$cell_sample), collapse = ","))
cat("PASS cell_comparison_plot: a click on measurement", pick, "selects it (cell_sample)\n")

# Refusals: wrong event, wrong source, a plot that takes no clicks, an unknown card.
if (!fails(api_card_event(s, cmp$instanceId, list(event = "plotly_hover", source = "cell_comparison_points", points = list(list(curveNumber = 0L, pointNumber = 0L, x = 1, y = 1))))))
  stop("FAIL a plotly_hover event is accepted")
if (!fails(api_card_event(s, cmp$instanceId, list(event = "plotly_click", source = "cell_class_profile", points = list(list(curveNumber = 0L, pointNumber = 0L, x = 1, y = 1))))))
  stop("FAIL another plot's source is accepted")
pca <- api_card_create(s, "results_dashboard-plot_pca")
if (!fails(api_card_event(s, pca$instanceId, list(event = "plotly_click", source = "rd_pca", points = list(list(curveNumber = 0L, pointNumber = 0L, x = 1, y = 1))))))
  stop("FAIL a plot without a click bridge accepts clicks")
if (!fails(api_card_event(s, "tcinstance_000000000000", list(event = "plotly_click", source = "cell_class_profile", points = list())), "api_not_found"))
  stop("FAIL an unknown card is not 404")
cat("PASS refusals: plotly_hover, another plot's source and a plot without a click bridge are 400; an unknown card 404\n")

# The HTTP route.
api_run_dir <- normalizePath("frontends/nexo-api"); root <- getwd()
router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_run_dir, "plumber.R")),
  plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
setwd(root)
router <- plumber::pr_hook(router, "preroute", function() setwd(root))
call <- function(path, x) {
  req <- new.env(); body <- charToRaw(jsonlite::toJSON(x, auto_unbox = TRUE))
  req$REQUEST_METHOD <- "POST"; req$PATH_INFO <- path; req$QUERY_STRING <- ""
  req$HTTP_CONTENT_TYPE <- "application/json"
  req$rook.input <- list(read = function(l = -1L) body, rewind = function() invisible(0L))
  router$call(req)
}
back <- setdiff(classes, target)[[1L]]
http <- call(paste0("/api/v1/sessions/", s$sessionId, "/cards/", cls$instanceId, "/events"),
  list(event = "plotly_click", source = "cell_class_profile", points = list(list(curveNumber = 0L, pointNumber = 1L, x = 2, y = back))))
if (!identical(as.integer(http$status), 200L)) stop("FAIL POST .../events answered ", http$status)
reply <- jsonlite::fromJSON(if (is.raw(http$body)) rawToChar(http$body) else as.character(http$body))
if (!identical(as.character(reply$inputs$cell_class), back)) stop("FAIL the route's answer does not carry the new class")
refused <- call(paste0("/api/v1/sessions/", s$sessionId, "/cards/", cls$instanceId, "/events"), list(event = "plotly_click", source = "nope", points = list()))
if (!identical(as.integer(refused$status), 400L)) stop("FAIL a bad source through the route answered ", refused$status)
cat("PASS POST /api/v1/sessions/<id>/cards/<instanceId>/events: 200 with the new inputs; a bad source 400\n")
cat("PASS test_api_plotly_click\n")
