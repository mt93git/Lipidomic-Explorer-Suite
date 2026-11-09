# Nexo goes beyond Team's canvas: styling Team's validator would reject (team_canvas_object,
# R/frontends/team/canvas_state.R) lives in Nexo's own checkpoint member, nexo-canvas-v1.json.
# Team's archive reader opens only the members it knows, so Team still opens the checkpoint
# and draws its own version of each card; Nexo restores its member exactly as it was saved.
for (pkg in c("shiny", "jsonlite", "digest", "xml2", "zip")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_nexo_store: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_nexo_store")
source("frontends/nexo-api/engine.R")

parse <- function(txt) jsonlite::fromJSON(txt, simplifyVector = FALSE)
canon <- function(x) as.character(jsonlite::toJSON(x, auto_unbox = TRUE, null = "null", na = "null", digits = NA))
style <- parse('{"version":1,"nodes":{"tcinstance_a":{"style":{"yaxis":{"type":"log","range":[0.1,null]},
  "weights":{"title":"bold"},"margin":{"l":60},"shapes":[{"type":"line","y0":1}],"empty":{},"none":[]}}}}')

refused <- function(x) tryCatch({ api_nexo_check(x); FALSE }, error = function(e) inherits(e, "api_bad_request"))
if (!refused(list(1, 2))) stop("a JSON array was accepted")
if (!refused(parse('{"version":2,"nodes":{}}'))) stop("an unknown version was accepted")
if (!refused(parse('{"version":1,"nodes":[1]}'))) stop("nodes must be an object keyed by node id")
if (!refused(list(version = 1L, nodes = list(a = list(pad = strrep("x", 2 * 1024^2)))))) stop("a member over 2 MiB was accepted")
if (!is.null(api_nexo_check(NULL))) stop("null clears the member")
if (!identical(canon(api_nexo_check(style)), canon(style))) stop("a valid member must pass unchanged")
cat("PASS the Nexo member is an object, version 1, nodes keyed by id, at most 2 MiB\n")

s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
if (!is.null(s$nexo)) stop("a Team checkpoint has no Nexo member")
s$nexo <- style
zip <- tempfile(fileext = ".zip"); plain <- tempfile(fileext = ".zip"); on.exit(unlink(c(zip, plain)), add = TRUE)
api_read(s, s$shared$export_session_path(zip)); file.copy(zip, plain); api_nexo_append(zip, s)
if (!api_nexo_member %in% zip::zip_list(zip)$filename) stop("the member was not written")
team_view <- function(path) { a <- read_session_archive(path, include_team_canvas = TRUE); a[c("state", "shared", "canvas")] }
if (is.null(team_view(zip)$state) || !identical(team_view(zip), team_view(plain)))
  stop("Team must read a checkpoint with the Nexo member exactly as the same checkpoint without it")
again <- api_session_open(zip); on.exit(api_session_close(again), add = TRUE)
if (!identical(canon(again$nexo), canon(style))) stop("reopen must restore the member exactly (nulls, empty objects and arrays)")
cat("PASS the member is saved in the checkpoint, Team still reads it, reopen restores it exactly\n")

bad <- tempfile(fileext = ".zip"); on.exit(unlink(bad), add = TRUE)
file.copy(zip, bad); stage <- tempfile(); dir.create(stage)
writeLines("{not json", file.path(stage, api_nexo_member))
zip::zip_append(bad, files = api_nexo_member, root = stage)
if (!is.null(api_nexo_read(bad))) stop("a broken member must be ignored, never block opening")
cat("PASS a broken Nexo member is ignored and the checkpoint still opens\n")

body <- parse('{"label":"x","canvas":{}}')
if (!identical(api_nexo_from_body(body, s), s$nexo)) stop("a save without nexo keeps the session's member")
if (!is.null(api_nexo_from_body(parse('{"nexo":null}'), s))) stop("nexo:null clears the member")
if (!identical(canon(api_nexo_from_body(list(nexo = style), s)), canon(style))) stop("a save with nexo sets it")
cat("PASS save keeps, clears or sets the member as the request says\n")
