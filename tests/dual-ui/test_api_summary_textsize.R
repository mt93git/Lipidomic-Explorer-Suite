# Chart audit b07 F2 (Astra review 2026-11-08, P1): on the structural summaryPlot card, after "Initiate Structural
# Analysis", Text Size 14 on a 390 px card made the render answer a bare HTTP 500 ({"error":"500 - Internal server
# error"}) and the card stayed in error (Export, Finish and the saved checkpoint failed with it). Team's renderPlot
# prints the module's R error in place of the plot. Since chart audit b04 round 2 (cards.R api_render_module_error)
# a module error while drawing is a 422 that carries the module's message. This test replays the audit's sequence:
#   1. structural summaryPlot, design confirmed, runAnalysis pressed; draws at 620x720;
#   2. textSize 14 (the Data-tab change), plus the refused textSize 5 the audit sent around it (400);
#   3. render 390x520 (the audit's small size): either it draws (the module no longer fails: NOTE) or it is refused
#      with 422 whose message is the module's own R error — never a 500, neither from api_card_render nor through the
#      HTTP route;
#   4. recovery: back at 620x720 (textSize 14) it draws; back to textSize 10 at 390x520 it draws.
#   Rscript tests/dual-ui/test_api_summary_textsize.R      (needs R + Team's packages; the coordinator runs it)
for (pkg in c("shiny", "jsonlite", "digest", "plumber")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_summary_textsize: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV", "LIPIDOMIC_API_WORKERS"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_summary_textsize")
Sys.setenv(LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
source("R/frontends/api/engine.R")
is_png <- function(x) is.raw(x) && length(x) > 24L && identical(x[2:4], charToRaw("PNG"))
attempt <- function(expr) tryCatch(list(ok = TRUE, value = expr),
  error = function(e) list(ok = FALSE, class = class(e), message = conditionMessage(e)))
module_prefix <- "Team's module could not draw this plot:"

s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip") # registered: the route below looks it up
on.exit(api_session_close(s), add = TRUE)
stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
card <- api_card_create(s, "structural_tab-summaryPlot")
id <- card$instanceId
invisible(api_card_update(s, id, list(), "runAnalysis"))
first <- api_card_render(s, id, 620, 720)
if (!is_png(first$png)) stop("FAIL summaryPlot does not draw at 620x720 after Initiate Structural Analysis")
cat("PASS step 1: summaryPlot draws at 620x720 after runAnalysis\n")

refused <- attempt(api_card_update(s, id, list(textSize = 5)))
if (refused$ok || !"api_bad_request" %in% refused$class) stop("FAIL textSize 5 must be refused (400), got ", paste(refused$class, collapse = "/"))
changed <- api_card_update(s, id, list(textSize = 14))
if (!identical(as.numeric(unlist(changed$inputs$textSize)), 14)) stop("FAIL textSize 14 was not applied: ", deparse(changed$inputs$textSize))
cat("PASS step 2: textSize 5 refused (400), textSize 14 applied\n")

small <- attempt(api_card_render(s, id, 390, 520))
if (small$ok) {
  if (!is_png(small$value$png)) stop("FAIL the 390x520 render returned no PNG")
  cat("NOTE step 3: textSize 14 at 390x520 draws on this build (b07 F2 not reproduced here); no module error to check\n")
} else {
  if (!"api_unprocessable" %in% small$class)
    stop("FAIL step 3: textSize 14 at 390x520 failed with class ", paste(small$class, collapse = "/"),
      " (a bare 500 through the route), not api_unprocessable: ", small$message)
  if (!startsWith(small$message, module_prefix) || !nzchar(trimws(sub(module_prefix, "", small$message, fixed = TRUE))))
    stop("FAIL step 3: the 422 does not carry the module's R error: ", small$message)
  cat("PASS step 3: textSize 14 at 390x520 is a 422 with the module's error:", small$message, "\n")
}
# The same render through the HTTP route: never plumber's generic 500.
api_run_dir <- normalizePath("R/frontends/api"); root <- getwd()
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
api_render_epoch_bump(s, paste0(id, "-textSize")) # no memory-cache answer: the route draws again
http <- call(paste0("/api/v1/sessions/", s$sessionId, "/cards/", id, "/render"), list(width = 390, height = 520))
if (identical(as.integer(http$status), 500L)) stop("FAIL the render route answered 500: ", rawToChar(as.raw(unlist(http$body))))
if (small$ok) {
  if (!identical(as.integer(http$status), 200L)) stop("FAIL the route answered ", http$status, " where api_card_render drew")
} else {
  if (!identical(as.integer(http$status), 422L)) stop("FAIL the route answered ", http$status, ", expected 422")
  body <- jsonlite::fromJSON(if (is.raw(http$body)) rawToChar(http$body) else as.character(http$body))
  if (!identical(body$error, "unprocessable") || !startsWith(body$message, module_prefix))
    stop("FAIL the route's 422 body does not carry the module's error: ", jsonlite::toJSON(body, auto_unbox = TRUE))
}
cat("PASS step 3 (HTTP): the render route answers", http$status, "(not 500)\n")

back <- attempt(api_card_render(s, id, 620, 720))
if (!back$ok || !is_png(back$value$png)) stop("FAIL step 4: textSize 14 at 620x720 does not draw: ", back$message %||% "no PNG")
invisible(api_card_update(s, id, list(textSize = 10)))
again <- attempt(api_card_render(s, id, 390, 520))
if (!again$ok || !is_png(again$value$png)) stop("FAIL step 4: textSize 10 at 390x520 does not draw: ", again$message %||% "no PNG")
cat("PASS step 4: the card recovers at 620x720 (textSize 14) and at 390x520 with textSize 10\n")
cat("PASS test_api_summary_textsize\n")
