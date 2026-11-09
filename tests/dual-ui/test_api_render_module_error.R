# Chart audit b04 round 2 (donutPlotFiltered): when Team's module itself stops with an R error while drawing a card,
# Team's browser shows that error text in the output; the API answered HTTP 500 with plumber's generic body
# ({"error":"500 - Internal server error"}), so Nexo could only say "Request failed (500)". The render now answers
# 422 (api_unprocessable, like Team's validate()/req() refusals, forwarded from a render worker the same way) with the
# module's own message. Session loss and the API's own refusals keep their class.
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_render_module_error: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_render_module_error")
source("frontends/nexo-api/engine.R")

# 1. The real case: Team's filtered donut (R/modules/5_barchart_module.R, the filtered-donut renderPlot passes the
#    function `ncols` to R/utils_vis.R:1242, "invalid 'type' (closure) of argument").
s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
donut <- api_card_create(s, "barchart-donutPlotFiltered")
got <- tryCatch(list(ok = TRUE, value = api_card_render(s, donut$instanceId, 620, 380)),
  error = function(e) list(ok = FALSE, class = class(e), message = conditionMessage(e)))
if (isTRUE(got$ok)) {
  cat("NOTE Team's filtered donut draws now (module fixed): part 1 has no module error to check\n")
} else {
  if (!"api_unprocessable" %in% got$class)
    stop("filtered donut render failed with class ", paste(got$class, collapse = "/"), ", not api_unprocessable: ", got$message)
  if (!grepl("invalid 'type' (closure) of argument", got$message, fixed = TRUE))
    stop("filtered donut render message does not carry the module's error: ", got$message)
  cat("PASS a module error while drawing answers 422 with the module's message:", got$message, "\n")
}

# 2. The rule on its own: any other error becomes api_unprocessable with its text; the API's own classes pass through.
classify <- function(e) tryCatch(api_render_module_error(e), error = function(x) list(class = class(x), message = conditionMessage(x)))
plain <- classify(simpleError("invalid 'type' (closure) of argument", call = quote(min(ncols, n_facets))))
if (!"api_unprocessable" %in% plain$class || !grepl("invalid 'type' (closure) of argument", plain$message, fixed = TRUE))
  stop("module error became ", paste(plain$class, collapse = "/"), ": ", plain$message)
blank <- classify(simpleError(""))
if (!"api_unprocessable" %in% blank$class || !nzchar(blank$message)) stop("an empty module error has no message: ", blank$message)
lost <- classify(structure(list(message = "Session flush timed out; reopen the checkpoint.", call = NULL),
  class = c("session_lost", "error", "condition")))
if (!"session_lost" %in% lost$class || "api_unprocessable" %in% lost$class) stop("session_lost became ", paste(lost$class, collapse = "/"))
own <- classify(structure(list(message = "Unknown render format.", call = NULL), class = c("api_bad_request", "error", "condition")))
if (!"api_bad_request" %in% own$class) stop("api_bad_request became ", paste(own$class, collapse = "/"))
cat("PASS module errors are api_unprocessable with their message; session_lost and API refusals keep their class\n")
cat("PASS test_api_render_module_error\n")
