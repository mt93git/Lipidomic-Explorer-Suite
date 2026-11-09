# Chart audit b07 F3: Duplicate and Save->reopen carried a card's inputs but not the module action presses, so a copy
# (or a reopened card) of structural summaryPlot showed Team's placeholder "Click 'Initiate Structural Analysis'..."
# until the user pressed the button again. Nexo records the pressed actions in its own checkpoint member
# (nodes[<node id>]$actions) and the API replays them (cards.R api_card_replay): on a copy, on a restored card of a
# reopened checkpoint, and idempotently (a second replay presses nothing).
for (pkg in c("shiny", "jsonlite", "digest", "zip")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_actions_replay: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_actions_replay")
source("R/frontends/api/engine.R")
root <- tempfile()
Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_API_WORKSPACE = "actions-replay", LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
on.exit(unlink(root, recursive = TRUE), add = TRUE)
if (!exists("api_card_replay", mode = "function")) stop("FAIL api_card_replay is not defined (the API cannot replay recorded presses)")
source <- "structural_tab-summaryPlot"
placeholder <- "Initiate Structural Analysis"
# summaryPlot renders as PNG: Team's placeholder is told apart by its bytes (the placeholder image drawn before the
# first press, same size) and, for plotly/JSON renders, by its text; the press itself by the instance's action counter.
render_bytes <- function(s, id, what) {
  out <- tryCatch(api_card_render(s, id, 900, 650), error = function(e) e)
  if (inherits(out, "error")) stop("FAIL ", what, ": render failed: ", conditionMessage(out))
  if (!is.null(out$png)) return(out$png)
  text <- as.character(jsonlite::toJSON(out$figure, auto_unbox = TRUE))
  if (grepl(placeholder, text, fixed = TRUE)) return(placeholder_bytes)
  charToRaw(text)
}
pressed_count <- function(s, id) {
  value <- api_read(s, tryCatch(s$mock$input[[paste0(id, "-runAnalysis")]], error = function(e) NULL))
  if (is.null(value)) 0 else as.numeric(value)
}
placeholder_bytes <- NULL
drawn <- function(s, id, what) {
  bytes <- render_bytes(s, id, what)
  if (identical(bytes, placeholder_bytes)) stop("FAIL ", what, ": shows Team's placeholder instead of the plot")
  if (pressed_count(s, id) < 1) stop("FAIL ", what, ": runAnalysis was never pressed on this instance")
  invisible(bytes)
}
shows_placeholder <- function(s, id, what) identical(render_bytes(s, id, what), placeholder_bytes) && pressed_count(s, id) == 0

s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
card <- api_card_create(s, source)
schema <- api_card_schema(s, card$instanceId)
if (!"runAnalysis" %in% unlist(schema$actions)) stop("FAIL summaryPlot does not offer runAnalysis: ", paste(unlist(schema$actions), collapse = ", "))
placeholder_bytes <- render_bytes(s, card$instanceId, "before Initiate")
if (pressed_count(s, card$instanceId) != 0) stop("FAIL a new card must not have pressed runAnalysis")
api_card_update(s, card$instanceId, list(), "runAnalysis")
if (!identical(api_card_pressed(s, card$instanceId), "runAnalysis")) stop("FAIL the press is not recorded on the instance")
drawn(s, card$instanceId, "original after Initiate")
cat("PASS press Initiate: recorded (runAnalysis) and the original draws\n")

# Duplicate: a copy with the same inputs, then the recorded presses replayed before its first render.
copy <- api_card_create(s, source, card$inputs[intersect(names(card$inputs), card$allowedInputs)])
if (!shows_placeholder(s, copy$instanceId, "copy without replay")) stop("FAIL a copy without replay should show the placeholder (inputs alone do not carry presses)")
copy2 <- api_card_create(s, source, list())
replay <- api_card_replay(s, copy2$instanceId, list("runAnalysis", "download_summary"))
if (!identical(as.character(replay$replayed), "runAnalysis") || length(replay$failed)) stop("FAIL replay on the copy: ", jsonlite::toJSON(replay, auto_unbox = TRUE))
drawn(s, copy2$instanceId, "copy after replay")
again <- api_card_replay(s, copy2$instanceId, list("runAnalysis"))
if (length(again$replayed) || length(again$failed)) stop("FAIL a second replay must press nothing: ", jsonlite::toJSON(again, auto_unbox = TRUE))
bogus <- api_card_replay(s, copy$instanceId, list("notAnAction"))
if (!identical(as.character(bogus$failed), "notAnAction")) stop("FAIL an action the module does not offer must be reported as failed")
cat("PASS duplicate: the copy draws after replay; replay is idempotent; an unknown action is reported failed\n")

# Save via the checkpoint route with Nexo's member recording the press, reopen: the restored card draws.
node <- paste0(card$instanceId, "-summaryPlot")
nodes <- list(list(kind = "plot", id = node, label = "Structural summary", x = 0, y = 0, width = 900, height = 700,
  visual = list(background = "#ffffff"),
  instance = list(id = card$instanceId, source = source, inputs = api_card_get(s, card$instanceId)$inputs[card$allowedInputs])))
nexo <- list(version = 1, nodes = stats::setNames(list(list(actions = list("runAnalysis"))), node))
record <- api_checkpoint_save(s, "actions-replay", list(token = "actions-replay", state = list(version = "1", libraryHidden = FALSE, nodes = nodes)), nexo)
path <- api_checkpoint_path(record$id)
members <- zip::zip_list(path)$filename
if (!"nexo-canvas-v1.json" %in% members) stop("FAIL the checkpoint lacks Nexo's member")
api_session_close(s)
s2 <- api_session_open(path); on.exit(api_session_close(s2), add = TRUE)
# The restore (inside the open) replays the recorded press; that must not count as an edit. Confirming the
# design below is a real edit and dirties the session on its own, so the restore is checked here.
if (isTRUE(s2$dirty)) stop("FAIL a replay on restore must not dirty the session")
stopifnot(isTRUE(api_design(s2, "Animal", "independent", TRUE)$allowed))
if (!identical(api_card_member_actions(s2, card$instanceId), "runAnalysis")) stop("FAIL the reopened session does not read the recorded press")
if (!is.null(api_card_descriptor(s2, card$instanceId))) stop("FAIL a card with recorded presses must not be served from the inputs-keyed disk cache")
drawn(s2, card$instanceId, "reopened card")
if (!identical(api_card_pressed(s2, card$instanceId), "runAnalysis")) stop("FAIL the restore did not replay the press")
confirm <- api_card_replay(s2, card$instanceId, list("runAnalysis"))
if (length(confirm$replayed) || length(confirm$failed)) stop("FAIL the client's replay after a restore must press nothing")
cat("PASS save -> reopen: the restored card replays its recorded press and draws; Team's instance inputs unchanged\n")
cat("PASS test_api_actions_replay\n")
