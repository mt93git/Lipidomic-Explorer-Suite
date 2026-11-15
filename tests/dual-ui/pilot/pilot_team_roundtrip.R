# Nexo phase 1 close, simulated pilot round 2: the checkpoint Paula saved in Nexo, opened by Team in Team's own
# process and libraries (headless, no browser).
#   Rscript tests/dual-ui/pilot/pilot_team_roundtrip.R <NEXO_PILOT_OUT>/pilot-saved.zip      # from the repository root
# (i)   Team's archive reader reads it (read_session_archive, include_team_canvas = TRUE).
# (ii)  Team's canvas validator returns the archive's canvas unchanged (canonical JSON, api_canonical_json).
# (iii) Team's restore: shared_data_server imports the ZIP and hands its canvas to team_canvas_server, which emits
#       team-canvas-restore with that same state; then every saved plot is created the way canvas.js asks for it after
#       a restore (input team_canvas_instance_create), and none raises team-canvas-instance-error.
# (iv)  Every plot node's instance is a source in Team's catalog whose inputs validate (team_plot_instance_validate).
# (v)   The node/tab/finished/statistics/illustration/text counts match what pilot-log.json beside the ZIP says Paula
#       saved (step 11b). Same rules as pilot_figure1.cjs canvasCounts: tabs in canvas$tabs$tabs (0 without a tabs
#       member); finished = plots with a finished snapshot (illustrations always carry one); texts = Figure page items
#       of type text.
# (vi)  Pilot F1: the session palette colour Paula set in Nexo (step 4b, logged as metrics.sessionPalette) is in the
#       checkpoint as Team saves it (state.json color_shape, Team's read_session_archive) and Team's restore puts it
#       back in the session's colour map (shared_data$color_maps()).
# Prints PASS/FAIL/INFO lines; exit status 1 on any FAIL, 2 on bad usage, 0 when every check passes (or SKIP).
# Written on a machine without R (2026-11-08): never run by its author; the coordinator runs it on the RTX.
for (pkg in c("shiny", "jsonlite", "digest")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP pilot_team_roundtrip: package", pkg, "not installed\n"); quit(status = 0)
}
args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 1L || !nzchar(args[[1L]]) || !file.exists(args[[1L]])) {
  cat("FAIL usage: Rscript tests/dual-ui/pilot/pilot_team_roundtrip.R <checkpoint.zip>\n"); quit(status = 2)
}
if (!file.exists("R/global.R")) {
  cat("FAIL run it from the repository root (R/global.R not found)\n"); quit(status = 2)
}
zip <- normalizePath(args[[1L]], mustWork = TRUE)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("pilot_team_roundtrip")
source("frontends/nexo-api/engine.R")

failed <- 0L
pass <- function(...) cat("PASS", ..., "\n", sep = "")
fail <- function(...) { cat("FAIL", ..., "\n", sep = ""); failed <<- failed + 1L }
info <- function(...) cat("INFO", ..., "\n", sep = "")
attempt <- function(expr) tryCatch(list(value = expr, error = NULL), error = function(e) list(value = NULL, error = conditionMessage(e)))
canonical <- function(x) { if (!is.null(x)) attr(x, "team_canvas_image_cache") <- NULL; api_canonical_json(x) }
is_plot <- function(node) identical(node$kind %||% "plot", "plot")
canvas_counts <- function(canvas) {
  nodes <- canvas$nodes %||% list()
  list(nodes = length(nodes), tabs = length(canvas$tabs$tabs %||% list()),
    finished = sum(vapply(nodes, function(n) is_plot(n) && !is.null(n$finished), logical(1))),
    statistics = sum(vapply(nodes, function(n) !is.null(n$statistics), logical(1))),
    illustrations = sum(vapply(nodes, function(n) identical(n$kind, "illustration"), logical(1))),
    texts = sum(vapply(canvas$document$items %||% list(), function(i) identical(i$type, "text"), logical(1))))
}

main <- function() {
  info(sprintf(" checkpoint %s, %s bytes, sha256 %s", basename(zip), format(file.info(zip)$size, big.mark = ""),
    digest::digest(file = zip, algo = "sha256")))
  # (i) Team's archive reader.
  read <- attempt(read_session_archive(zip, include_team_canvas = TRUE))
  archive <- read$value
  if (!is.null(archive$directory)) on.exit(unlink(archive$directory, recursive = TRUE), add = TRUE)
  if (!is.null(read$error)) { fail(" (i) read_session_archive refused the checkpoint: ", read$error); return(invisible()) }
  if (is.null(archive$canvas)) { fail(" (i) read_session_archive read it but found no Team canvas (team-canvas-v1.json)"); return(invisible()) }
  pass(sprintf(" (i) read_session_archive(include_team_canvas = TRUE) read it: %d canvas node(s)", length(archive$canvas$nodes)))

  # (ii) Team's canvas validator returns the same canvas.
  checked <- attempt(team_canvas_validate(archive$canvas))
  validated <- checked$value
  if (!is.null(checked$error)) { fail(" (ii) team_canvas_validate refused the archive canvas: ", checked$error); return(invisible()) }
  if (identical(canonical(validated), canonical(archive$canvas))) pass(" (ii) team_canvas_validate(archive$canvas) equals the archive canvas (canonical JSON)")
  else fail(sprintf(" (ii) team_canvas_validate changed the canvas: %d -> %d nodes, %d -> %d JSON bytes",
    length(archive$canvas$nodes), length(validated$nodes), nchar(canonical(archive$canvas), "bytes"), nchar(canonical(validated), "bytes")))

  # (iv) Every plot instance is a Team catalog source whose inputs validate.
  plots <- Filter(is_plot, validated$nodes)
  instances <- Filter(function(n) !is.null(n$instance), plots)
  for (node in Filter(function(n) is.null(n$instance), plots)) info(" (iv) ", node$id, " is a fixed node (no instance): Team draws its family's own view")
  bad <- character()
  for (node in instances) {
    r <- attempt(team_plot_instance_validate(node$instance, node$id))
    if (!is.null(r$error)) bad <- c(bad, sprintf("%s (%s): %s", node$id, node$instance$source %||% "?", r$error))
  }
  if (length(bad)) fail(" (iv) ", length(bad), " plot instance(s) refused by team_plot_instance_validate: ", paste(bad, collapse = "; "))
  else pass(sprintf(" (iv) %d plot instance(s): every source is in Team's catalog and its inputs validate (%s)", length(instances),
    paste(unique(vapply(instances, function(n) n$instance$source, "")), collapse = ", ")))

  # (iii) Team's restore through shared_data_server and team_canvas_server (the API engine's headless Team session,
  # frontends/nexo-api/session.R api_session_open: the archive is imported by Team's own data_hub import).
  opened <- attempt(api_session_open(zip))
  if (!is.null(opened$error)) { fail(" (iii) Team's restore of the checkpoint failed: ", opened$error) } else {
    s <- opened$value
    on.exit(api_session_close(s), add = TRUE)
    restores <- s$bus$messages("team-canvas-restore")
    if (!length(restores)) fail(" (iii) Team's restore sent no team-canvas-restore")
    else if (!identical(canonical(tail(restores, 1L)[[1L]]$state), canonical(validated)))
      fail(sprintf(" (iii) team-canvas-restore carries another state: %d nodes, expected %d", length(tail(restores, 1L)[[1L]]$state$nodes), length(validated$nodes)))
    else pass(sprintf(" (iii) Team's restore emitted team-canvas-restore with the validated canvas (%d node(s))", length(validated$nodes)))
    early <- s$bus$messages("team-canvas-instance-error")
    problems <- vapply(early, function(m) paste0(m$id %||% "?", ": ", m$message %||% ""), "")
    # What canvas.js does after a restore: ask the server for each saved plot (it is created from Team's saved copy).
    for (i in seq_along(instances)) {
      node <- instances[[i]]; id <- node$instance$id; t0 <- Sys.time()
      made <- attempt({
        api_inputs(s, team_canvas_instance_create = list(id = id, source = node$instance$source,
          inputs = node$instance$inputs, request = paste0("pilot", i)))
        api_flush(s, function() any(vapply(s$bus$messages("team-canvas-instance-ready"), function(m) identical(m$id, id), logical(1))))
      })
      errors <- Filter(function(m) identical(m$id, id), s$bus$messages("team-canvas-instance-error"))
      ready <- any(vapply(s$bus$messages("team-canvas-instance-ready"), function(m) identical(m$id, id), logical(1)))
      if (!is.null(made$error)) problems <- c(problems, paste0(id, ": ", made$error))
      else if (length(errors)) problems <- c(problems, paste0(id, ": ", errors[[1L]]$message %||% ""))
      else if (!ready) problems <- c(problems, paste0(id, ": no team-canvas-instance-ready"))
      info(sprintf(" (iii) created %s (%s) in %.1f s", id, node$instance$source, as.numeric(difftime(Sys.time(), t0, units = "secs"))))
    }
    if (length(problems)) fail(" (iii) ", length(problems), " instance problem(s): ", paste(unique(problems), collapse = "; "))
    else pass(sprintf(" (iii) no team-canvas-instance-error; all %d saved plot(s) created from Team's restored copies", length(instances)))
  }

  # (vi) The session palette colour (pilot F1): saved as Team saves it, restored by Team's own restore.
  log_file <- file.path(dirname(zip), "pilot-log.json")
  palette <- if (file.exists(log_file)) Filter(function(e) is.list(e$metrics$sessionPalette), jsonlite::read_json(log_file, simplifyVector = FALSE)) else list()
  if (!length(palette)) info(" (vi) the pilot log records no session palette change (step 4b): nothing to check")
  else {
    want <- tail(palette, 1L)[[1L]]$metrics$sessionPalette
    key <- palette_context_key(want$context, want$group)
    saved <- archive$state$color_shape
    if (!identical(toupper(as.character(saved$custom_colors[[key]] %||% "")), toupper(want$color)) || !isTRUE(saved$useCustomColors))
      fail(" (vi) state.json color_shape does not carry ", key, " = ", want$color, " (read_session_archive)")
    else pass(" (vi) Team's read_session_archive reads ", key, " = ", toupper(want$color), " from state.json color_shape")
    if (!is.null(opened$value)) {
      restored <- attempt(api_read(opened$value, opened$value$shared$color_maps()[[want$context]][[want$group]]))
      if (!is.null(restored$error) || !identical(toupper(as.character(restored$value %||% "")), toupper(want$color)))
        fail(" (vi) after Team's restore the session map has ", restored$value %||% restored$error, " for ", want$group, ", expected ", want$color)
      else pass(" (vi) Team's restore (data hub import) puts ", want$group, " back in ", toupper(want$color), " (shared_data$color_maps())")
    }
  }

  # (v) Counts, compared with what the pilot log says Paula saved.
  counts <- canvas_counts(validated)
  info(" (v) counts ", paste(names(counts), unlist(counts), sep = "=", collapse = " "))
  log_path <- file.path(dirname(zip), "pilot-log.json")
  if (!file.exists(log_path)) { fail(" (v) no pilot-log.json beside the ZIP to compare the counts with"); return(invisible()) }
  entries <- jsonlite::read_json(log_path, simplifyVector = FALSE)
  saved <- Filter(function(e) identical(as.character(e$step), "11b") && !is.null(e$metrics$saved$counts), entries)
  mine <- Filter(function(e) identical(e$metrics$saved$zip, basename(zip)), saved)
  if (!length(mine) && length(saved) == 1L) mine <- saved
  if (!length(mine)) { fail(" (v) pilot-log.json has no step 11b entry for ", basename(zip)); return(invisible()) }
  logged <- mine[[1L]]$metrics$saved
  if (!identical(logged$sha256, digest::digest(file = zip, algo = "sha256"))) info(" (v) the log's sha256 for ", logged$zip, " differs from this file's: not the same download")
  differs <- Filter(Negate(is.null), lapply(names(counts), function(k)
    if (!identical(as.integer(logged$counts[[k]] %||% NA), as.integer(counts[[k]]))) sprintf("%s %s in Team, %s in the pilot log", k, counts[[k]], logged$counts[[k]] %||% "absent")))
  if (length(differs)) fail(" (v) counts differ: ", paste(unlist(differs), collapse = "; "))
  else pass(" (v) counts match what the pilot log (", mine[[1L]]$engine %||% "?", ", step 11b) says Paula saved: ",
    paste(names(counts), unlist(counts), sep = "=", collapse = " "))
  invisible()
}
main()
cat(if (failed) sprintf("pilot_team_roundtrip: %d FAIL\n", failed) else "pilot_team_roundtrip: all PASS\n")
quit(status = if (failed) 1L else 0L)
