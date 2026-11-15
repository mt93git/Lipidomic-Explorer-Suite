for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_session")
source("frontends/nexo-api/engine.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
local({
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  stopifnot(is.environment(s), identical(s$receipt, "matches archived receipt"),
    s$bus$echoed > 0L, !is.null(s$revision), nzchar(s$inputs$violin_lipid))
  restores <- s$bus$messages("team-canvas-restore")
  if (length(restores)) stopifnot(identical(api_read(s, s$mock$input$team_canvas_restore_complete)$token,
    tail(restores, 1L)[[1L]]$restoreToken))
  # A checkpoint without canvas work opens as an empty v1 workspace (never null).
  canvas <- s$canvas
  stopifnot(is.list(canvas), identical(canvas$version, "1"), length(canvas$nodes) == 0L)
  roundtrip <- jsonlite::fromJSON(api_canonical_json(canvas), simplifyVector = FALSE)
  stopifnot(identical(api_canonical_json(canvas), api_canonical_json(roundtrip)))
  if (!grepl("^[0-9a-f]{12}\\.[0-9a-f]{32}$", s$sessionId)) stop("FAIL generation-prefixed session id")
  cat("PASS generation-prefixed session id\n")
  cat("PASS session open\n")
  same <- api_session_for_checkpoint(fixture)
  stopifnot(identical(s, same), identical(s$sessionId, same$sessionId), length(ls(api_sessions)) == 1L)
  # Same bridges as R/server.R: the DA pseudoreplication reason and Team's top_n fallback (30).
  stopifnot(is.function(s$shared$team_da_participant_reason), identical(s$inputs$top_n, 30L),
    length(s$archived_inputs) > 0L, "qc_pca_tab-colorGrouping" %in% names(s$archived_inputs))
  # New cards start from the family's archived values (what Team copies from its view).
  s$archived_inputs[["qc_pca_tab-scoreMarkerSize2D"]] <- 13
  card <- api_card_create(s, "qc_pca_tab-pca2dPlot")
  current <- api_card_current_inputs(s, card)
  stopifnot(identical(as.numeric(current$scoreMarkerSize2D), 13),
    identical(current$colorGrouping, s$archived_inputs[["qc_pca_tab-colorGrouping"]]))
  cat("PASS session seeds cards from archived inputs\n")
  # A choices-only updateSelectInput settles on the selected/first option like the browser.
  b <- api_bus(); seen <- list()
  fake <- list(input = list(pick = "stale", keep = "b"), setInputs = function(...) seen <<- c(seen, list(...)))
  b$echo("pick", list(options = "<option value=\"a\">A</option><option value=\"b\" selected>B</option>"))
  b$echo("keep", list(options = "<option value=\"a\">A</option><option value=\"b\">B</option>"))
  b$echo("none", list(label = "only a label"))
  b$drain_echo(fake)
  stopifnot(identical(seen, list(pick = "b")))
  cat("PASS session echoes choices-only updates\n")
  # Once a card exists the live session no longer equals the checkpoint: a fresh one opens.
  fresh <- api_session_for_checkpoint(fixture)
  stopifnot(!identical(fresh$sessionId, s$sessionId), isTRUE(s$dirty), length(ls(api_sessions)) == 2L)
  stopifnot(!identical(fresh$sessionId, s$sessionId))
  cat("PASS two creates never reuse session id\n")
  api_session_close(fresh)
  cat("PASS session reuse only while clean\n")
  api_session_close(s)
  stopifnot(length(ls(api_sessions)) == 0L, isTRUE(s$closed))
  cat("PASS session close\n")
})
