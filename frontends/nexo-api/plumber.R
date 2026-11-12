# Load the statistics adapter here so both run.R and direct router users get it.
source(file.path(if (exists("api_run_dir")) api_run_dir else "frontends/nexo-api", "statistics.R"), local = TRUE)
source(file.path(if (exists("api_run_dir")) api_run_dir else "frontends/nexo-api", "export.R"), local = TRUE)
if (!exists("api_dataset_route", mode = "function"))
  source(file.path(if (exists("api_run_dir")) api_run_dir else "frontends/nexo-api", "datasets.R"), local = globalenv())
if (!exists("api_pool_status", mode = "function"))
  source(file.path(if (exists("api_run_dir")) api_run_dir else "frontends/nexo-api", "pool.R"), local = globalenv())

source(file.path(if (exists("api_run_dir")) api_run_dir else "frontends/nexo-api", "service.R"), local = globalenv())

# The router's default JSON serializer is installed in run.R.
api_error <- function(res, status, error, message) {
  res$status <- status
  list(error = error, message = message)
}
api_handle <- function(res, expr) {
  handler <- function(e) {
    codes <- c(api_bad_request = 400L, api_not_found = 404L, api_conflict = 409L,
      api_unprocessable = 422L, api_too_large = 413L, api_unavailable = 503L,
      api_method_not_allowed = 405L, session_lost = 409L, api_forbidden_scope = 403L, api_staff_only = 403L)
    kind <- intersect(class(e), names(codes))[[1L]]
    body <- api_error(res, codes[[kind]], sub("^api_", "", kind), conditionMessage(e))
    # NEXO-P6 item 2: Team's validation message, shown as a note (cards.R api_card_render).
    if (isTRUE(e$note)) body$note <- TRUE
    body
  }
  tryCatch(expr, api_capacity = function(e) {
    res$status <- 503L; res$setHeader("Retry-After", "60")
    list(error = "capacity", liveProjects = e$liveProjects, retryAfter = 60L)
  }, api_bad_request = handler, api_not_found = handler,
    api_conflict = handler, api_unprocessable = handler, api_too_large = handler,
    api_unavailable = handler, api_method_not_allowed = handler, session_lost = handler,
    api_forbidden_scope = handler, api_staff_only = handler,
    # The Admin caller lookup (datasets.R): 401 admin_auth_required, 503 when Admin cannot answer.
    api_dataset_admin_error = function(e) api_error(res, e$status, e$error, e$error))
}
api_busy <- FALSE
api_exclusive <- function(res, expr, id = NULL) {
  if (api_busy) {
    res$setHeader("Retry-After", "1")
    return(api_revision_header(res,
      api_error(res, 503L, "busy", "The engine is busy with another request; retry shortly."), id))
  }
  api_busy <<- TRUE
  assign("api_busy_global", TRUE, envir = globalenv())
  on.exit({
    api_busy <<- FALSE; assign("api_busy_global", FALSE, envir = globalenv())
    # Timed: past the soft RSS limit the guard clears every render cache and runs gc() (a render's "guard" phase).
    guarded <- Sys.time()
    tryCatch(api_memory_guard(), error = function(e) message("memory guard: ", conditionMessage(e)))
    if (exists("api_timing_add", mode = "function")) api_timing_add("guard", guarded)
  })
  api_revision_header(res, api_handle(res, expr), id)
}
api_body <- function(req) {
  body <- req$body
  if (is.null(body) || identical(body, "")) return(list())
  if (!is.list(body) || (length(body) && is.null(names(body))))
    api_abort("api_bad_request", "Expected a JSON object.")
  body
}

#* Browsers cache the nginx basic-auth credentials, so a cross-site form POST would
#* be authenticated: refuse cross-site state changes and non-JSON bodies.
#* @filter samesite
function(req, res) {
  method <- toupper(req$REQUEST_METHOD %||% "GET")
  if (method %in% c("POST", "PATCH", "PUT", "DELETE")) {
    site <- req$HTTP_SEC_FETCH_SITE
    if (!is.null(site) && identical(site, "cross-site")) {
      res$status <- 403L
      return(list(error = "forbidden", message = "Cross-site requests are not allowed."))
    }
    type <- req$HTTP_CONTENT_TYPE %||% ""
    if (method != "DELETE" && !grepl("^(application/json|multipart/form-data)", type)) {
      res$status <- 415L
      return(list(error = "unsupported_media_type", message = "Send application/json or multipart/form-data."))
    }
  }
  plumber::forward()
}

#* Runtime information
#* @get /api/v1/health
function() list(ok = TRUE, commit = api_commit, root = getwd(), r = as.character(getRversion()),
  shiny = as.character(utils::packageVersion("shiny")), plotly = as.character(utils::packageVersion("plotly")),
  sessions = length(ls(api_sessions)), leases = api_session_leases(), pressure = api_pressure, rssMb = api_rss_mb(), science = api_science_health(), workers = api_pool_status())

#* Team output catalog
#* @get /api/v1/catalog
# The catalog is static and cached at startup (run.R): serve it outside the engine lock
# so a page load does not wait behind a 10 s session open.
function(res) list(version = "1", outputs = api_catalog())

# Checkpoint routes are scoped per client when LIPIDOMIC_ADMIN_REQUIRE_USER=1 (docs/integration/nexo-store-scope.md):
# api_admin_caller() is NULL while it is off, and every route behaves as before.
#* Available checkpoints
#* @get /api/v1/checkpoints
function(req, res) api_handle(res, api_checkpoint_list(api_admin_caller(api_admin_authorization(req))))

#* Upload a Team checkpoint ZIP
#* @parser multi
#* @post /api/v1/checkpoints
function(req, res) api_exclusive(res, { api_admin_staff_only(api_admin_authorization(req)); api_checkpoint_upload(req) })

#* Download a checkpoint ZIP
#* @get /api/v1/checkpoints/<id>/download
function(id, req, res) {
  result <- api_exclusive(res, {
    x <- api_checkpoint_resolve(id, api_admin_caller(api_admin_authorization(req)), req$argsQuery$workspace)
    # Labels are display names, never paths; escape HTTP quoted-string delimiters.
    name <- gsub('["\\\\/]', "_", sub("[.]zip$", "", x$record$name))
    bytes <- readBin(x$path, "raw", n = file.info(x$path)$size)
    list(bytes = bytes, name = name)
  })
  if (is.null(result$bytes)) return(result)
  res$setHeader("Content-Type", "application/zip")
  res$setHeader("Content-Disposition", paste0('attachment; filename="', result$name, '.zip"'))
  res$body <- result$bytes
  res
}

#* Delete a stored checkpoint (legacy folder files are read-only)
#* @delete /api/v1/checkpoints/<id>
function(id, req, res) api_exclusive(res, api_checkpoint_delete(id, api_admin_caller(api_admin_authorization(req)), req$argsQuery$workspace))

#* Validate and acknowledge a canvas using Team's observer
#* @parser json list(simplifyVector = FALSE)
#* @post /api/v1/sessions/<id>/canvas/validate
function(id, req, res) api_exclusive(res, id = id, {
  # The session first: an unknown one is a 404, not an error raised later inside the module flush.
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  api_mutation(s, req, res, {
    previous <- s$canvas
    answer <- api_canvas_validate(s, body$token, body$state)
    if (isTRUE(answer$ok) && !identical(api_canonical_json(previous), api_canonical_json(s$canvas)))
      api_session_dirty(s)
    answer
  }, handle = api_handle)
})

#* Current validated canvas
#* @get /api/v1/sessions/<id>/canvas
function(id, req, res) api_exclusive(res, id = id, api_canvas_current(api_session_get(id, api_session_caller(req))))

#* Save the current session and an acknowledged canvas
#* @parser json list(simplifyVector = FALSE)
#* @post /api/v1/sessions/<id>/checkpoints
function(id, req, res) api_exclusive(res, id = id, {
  caller <- api_session_caller(req)
  body <- api_body(req)
  s <- api_session_get(id, caller)
  # Only a collab session (opened by the sidecar's service identity) may mark a save as collab.
  api_checkpoint_save_revision(s, req, res, body$label, body$canvas, api_nexo_from_body(body, s), caller,
    collab = identical(s$kind, "collab") && isTRUE(body$collab), handle = api_handle)
})

#* Restore or reuse a checkpoint
#* @post /api/v1/sessions
function(req, res) api_exclusive(res, {
  body <- api_body(req)
  caller <- api_collab_open(req, body$collab)
  if (is.null(caller)) caller <- api_admin_caller(api_admin_authorization(req))
  s <- api_checkpoint_session(body$checkpointId, caller, body$workspace, body$collab)
  list(sessionId = s$sessionId, workspace = s$workspace, generation = api_session_generation, engineRevision = s$engineRevision %||% 0L, checkpointSha256 = s$sha256, near_limit = api_project_records_near_limit(s$project_records),
    preparation = list(revision = s$revision, check = s$receipt), samples = s$samples, lipids = s$lipids,
    inputs = s$inputs, canvas = s$canvas, nexo = s$nexo, design = api_design_state(s), deState = api_de_state(s),
    renderWorkers = length(api_pool_alive()))
})

#* Upload an extra Excel workbook
#* @post /api/v1/datasets/upload
function(req, res) api_exclusive(res, api_dataset_upload_route(req, res))

#* Released datasets visible to the caller
#* @get /api/v1/datasets
function(req, res) api_exclusive(res, api_datasets_list(api_admin_authorization(req)))

#* Detection preview without opening a session
#* @post /api/v1/datasets/preview
function(req, res) api_exclusive(res, api_dataset_preview_route(req, res))

#* @parser json list(simplifyVector = FALSE)
#* @parser multi
#* @post /api/v1/datasets/sessions
function(req, res) api_exclusive(res, api_dataset_route(req, res))

#* Join a project session without its personal canvas
#* @get /api/v1/sessions/<id>/join
function(id, req, res) api_exclusive(res, id = id, api_session_join(api_session_get(id, api_session_caller(req))))

#* Renew the project's live connection and in-flight lease
#* @parser json list(simplifyVector = FALSE)
#* @post /api/v1/sessions/<id>/lease
function(id, req, res) api_exclusive(res, id = id, api_session_lease(api_session_get(id, api_session_caller(req)), api_body(req)))

#* Inspect a session
#* @get /api/v1/sessions/<id>
function(id, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req), touch = FALSE)
  idle <- as.numeric(difftime(Sys.time(), s$last_used, units = "secs"))
  s$last_used <- Sys.time()
  list(engineRevision = s$engineRevision, revision = api_read(s, s$shared$preparation_state()$revision),
    cards = unname(as.list(s$cards)), idleSeconds = idle, rssMb = api_rss_mb())
})

#* Close a session
#* @delete /api/v1/sessions/<id>
function(id, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req))
  api_mutation(s, req, res, api_session_close(s), handle = api_handle)
  list(ok = TRUE)
})

#* Confirm study design
#* @post /api/v1/sessions/<id>/design
function(id, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  api_mutation(s, req, res, api_design(s, body$unit, body$type, body$confirm), handle = api_handle)
})

#* Shared analysis settings (Team's sidebar: Run comparison and global filters)
#* @get /api/v1/sessions/<id>/analysis
function(id, req, res) api_exclusive(res, id = id, {
  api_analysis_schema(api_session_get(id, api_session_caller(req)))
})

#* Change shared analysis settings; every card redraws
#* @patch /api/v1/sessions/<id>/analysis
function(id, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  api_mutation(s, req, res, api_analysis_update(s, body$inputs %||% list()), handle = api_handle)
})

#* Team's session palette (data hub "Colors & palettes"): presets, saved palettes, per-group colours
#* @get /api/v1/sessions/<id>/palette
function(id, req, res) api_exclusive(res, id = id, {
  api_palette_get(api_session_get(id, api_session_caller(req)))
})

#* Change the session palette through Team's own editor inputs; every group-coloured card redraws
#* @parser json list(simplifyVector = FALSE)
#* @patch /api/v1/sessions/<id>/palette
function(id, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  api_mutation(s, req, res, api_palette_update(s, body), handle = api_handle)
})

#* Targeted lipid cohort (Team's Single Lipid Analysis Mode)
#* @get /api/v1/sessions/<id>/cohort
function(id, req, res) api_exclusive(res, id = id, {
  api_cohort_get(api_session_get(id, api_session_caller(req)))
})

#* Set or clear the targeted lipid cohort; every card redraws
#* @put /api/v1/sessions/<id>/cohort
function(id, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  api_mutation(s, req, res, api_cohort_set(s, body$lipids %||% character()), handle = api_handle)
})

#* Create an independent card
#* @post /api/v1/sessions/<id>/cards
# A poolable card also gets a render worker's copy started in parallel (pool.R warm job; never awaited). The response
# carries a Server-Timing header with the create's phases (cards.R api_timing_create_log; other = total - the rest).
function(id, req, res) {
  api_timing_reset(); api_timing$scope <- "create"; t0 <- Sys.time()
  on.exit(api_timing$scope <- NULL, add = TRUE)
  body <- NULL
  result <- api_exclusive(res, id = id, {
    started <- Sys.time()
    s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
    api_timing_add("request", started)
    api_mutation(s, req, res, api_card_create(s, body$source, body$inputs %||% list(), body$instanceId), handle = api_handle)
  })
  timing <- api_timing_snapshot()
  total <- as.numeric(difftime(Sys.time(), t0, units = "secs")) * 1000
  timing$phases$other <- api_timing_other(timing$phases, total)
  res$setHeader("Server-Timing", api_timing_header(timing, total))
  tryCatch(api_timing_create_log(result$instanceId, if (is.list(body)) body$source else NULL, timing, total), error = function(e) NULL)
  result
}

#* Inspect live card controls
#* @get /api/v1/sessions/<id>/cards/<instanceId>/schema
function(id, instanceId, req, res) api_exclusive(res, id = id, {
  api_card_schema(api_session_get(id, api_session_caller(req)), instanceId)
})

#* Update card controls or click actions
#* @patch /api/v1/sessions/<id>/cards/<instanceId>
function(id, instanceId, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  # A changed input warms a render worker's copy of the new content, in parallel with this update (pool.R).
  api_card_update(s, instanceId, body$inputs %||% list(), body$actions %||% character(),
    warm = TRUE, req = req, res = res, handle = api_handle)
})

#* Replay a card's recorded module actions (duplicate, reopen, session recovery; chart audit b07 F3)
#* @post /api/v1/sessions/<id>/cards/<instanceId>/replay
function(id, instanceId, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  api_mutation(s, req, res, api_card_replay(s, instanceId, body$actions %||% character()), handle = api_handle)
})

#* Forward a Plotly click on a card to Team's module (chart audit b12: cell class / comparison selection)
#* @parser json list(simplifyVector = FALSE)
#* @post /api/v1/sessions/<id>/cards/<instanceId>/events
function(id, instanceId, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req))
  api_mutation(s, req, res, api_card_event(s, instanceId, api_body(req)), handle = api_handle)
})

#* Park a card
#* @delete /api/v1/sessions/<id>/cards/<instanceId>
function(id, instanceId, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req))
  api_mutation(s, req, res, api_card_park(s, instanceId), handle = api_handle)
  list(ok = TRUE)
})

#* Render a card in its native format
#* @post /api/v1/sessions/<id>/cards/<instanceId>/render
# A cacheable card goes to a render worker (pool.R) when the pool is on: the request
# waits on a promise and the engine lock is free for the next request meanwhile.
# Optional body "dpr" (1 or 2, default 1): a PNG card drawn at that pixel ratio (Retina); the
# response carries a Server-Timing header with the render's phases (cards.R api_timing_*).
function(id, instanceId, req, res) {
  format <- "auto"; dpr <- 1L
  api_timing_reset(); t0 <- Sys.time()
  plan <- api_exclusive(res, id = id, {
    started <- Sys.time()
    s <- api_session_get(id, api_session_caller(req)); body <- api_body(req); format <- body$format %||% "auto"
    dpr <- api_render_dpr(body$dpr)
    size <- api_card_render_size(body$width %||% 800, body$height %||% 600)
    api_timing_add("request", started); started <- Sys.time()
    job <- if (length(api_pool$workers)) api_pool_job(s, instanceId, size[[1L]], size[[2L]], format, dpr) else NULL
    if (length(api_pool$workers)) api_timing_add("pool", started)
    if (is.null(job)) { api_timing_note("where", "main"); api_card_render(s, instanceId, size[[1L]], size[[2L]], format, dpr = dpr, res = res) } else job
  })
  timed <- function(result, timing = api_timing_snapshot()) {
    if (is.null(result$render)) return(result)
    # The main process answers at once or 503s (api_exclusive): its queue wait is 0.
    timing$phases <- c(list(queue = timing$phases$queue %||% 0), timing$phases[setdiff(names(timing$phases), "queue")])
    total <- as.numeric(difftime(Sys.time(), t0, units = "secs")) * 1000
    # Whatever no phase measured: a gap in the instrumentation is always visible.
    timing$phases$other <- api_timing_other(timing$phases, total)
    res$setHeader("Server-Timing", api_timing_header(timing, total))
    tryCatch(api_timing_log(instanceId, result$width, result$height, result$dpr %||% 1L, timing, total),
      error = function(e) NULL)
    result
  }
  respond <- function(result) {
    result <- timed(result)
    result$where <- NULL
    if (!is.null(result$engineRevision)) res$headers[["X-Nexo-Engine-Revision"]] <- as.character(result$engineRevision)
    if (identical(result$render, "png")) {
      res$setHeader("Content-Type", "image/png")
      res$setHeader("X-Nexo-Revision", as.character(result$provenance$revision))
      res$body <- result$png
      return(res)
    }
    result
  }
  if (!inherits(plan, "api_pool_job")) return(respond(plan))
  promises::then(api_pool_submit(plan), function(out) {
    # Other requests ran while this one waited: its timing is rebuilt from the worker's own phases.
    api_timing_reset()
    if (isTRUE(out$ok)) {
      api_timing$phases <- out$timing %||% list()
      if (is.numeric(out$started)) api_timing$phases$queue <- max(0, (out$started - plan$submitted) * 1000)
      api_timing_note("where", "worker")
      # held: the worker already had the card (warm job or an earlier render); open: it created it; update: reuse.
      if (is.character(out$card)) api_timing_note("workercard", out$card)
    } else api_timing_note("where", "main-fallback")
    respond(api_exclusive(res, id = id, api_pool_finish(plan, out,
      function() api_card_render(api_session_get(id, api_session_caller(req)), instanceId, plan$width, plan$height, format, dpr = dpr, res = res))))
  })
}

#* Compatibility with the Nexo v0 dashboard client
#* @post /api/v1/sessions/<id>/plots/results_dashboard/<output>
function(id, output, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  result <- api_dashboard_v0_render(s, output, body$inputs %||% list(), body$width %||% 900, body$height %||% 600)
  list(figure = result$figure, provenance = result$provenance, engineRevision = result$engineRevision %||% s$engineRevision)
})

#* Journal presets, figures and formats of Team's Export studio
#* @get /api/v1/export/presets
function() api_export_presets()

#* Publication bundle (ZIP) produced by Team's Export studio code
#* @parser json list(simplifyVector = FALSE)
#* @post /api/v1/sessions/<id>/export
function(id, req, res) {
  result <- api_exclusive(res, id = id, api_export_bundle(api_session_get(id, api_session_caller(req)), api_body(req)))
  if (is.null(result$bytes)) return(result)
  res$setHeader("Content-Type", "application/zip")
  res$setHeader("Content-Disposition", paste0('attachment; filename="', result$name, '"'))
  res$body <- result$bytes
  res
}

#* The card's data, from its module's own download handler
#* @get /api/v1/sessions/<id>/cards/<instanceId>/data.csv
function(id, instanceId, req, res) {
  result <- api_exclusive(res, id = id, api_card_csv(api_session_get(id, api_session_caller(req)), instanceId))
  if (is.null(result$bytes)) return(result)
  res$setHeader("Content-Type", "text/csv; charset=utf-8")
  res$setHeader("Content-Disposition", paste0('attachment; filename="', result$name, '"'))
  res$body <- result$bytes
  res
}

#* "More downloads from this analysis": the module's own download buttons for this card
#* @get /api/v1/sessions/<id>/cards/<instanceId>/downloads
function(id, instanceId, req, res) api_exclusive(res, id = id, api_card_downloads(api_session_get(id, api_session_caller(req)), instanceId))

#* A configuration file for the card's module (b11 F3: the pathway "Upload Layout JSON (.json):"),
#* body {name, content}; the module receives it as Shiny's fileInput gives it
#* @parser json list(simplifyVector = FALSE)
#* @post /api/v1/sessions/<id>/cards/<instanceId>/uploads/<inputId>
function(id, instanceId, inputId, req, res)
  api_exclusive(res, id = id, {
    s <- api_session_get(id, api_session_caller(req))
    api_mutation(s, req, res, api_card_upload(s, instanceId, inputId, api_body(req)), handle = api_handle)
  })

#* One of those downloads, produced by the module's download handler
#* @get /api/v1/sessions/<id>/cards/<instanceId>/downloads/<downloadId>
function(id, instanceId, downloadId, req, res) {
  result <- api_exclusive(res, id = id, api_card_download(api_session_get(id, api_session_caller(req)), instanceId, downloadId))
  if (is.null(result$bytes)) return(result)
  res$setHeader("Content-Type", result$type)
  res$setHeader("Content-Disposition", paste0('attachment; filename="', result$name, '"'))
  res$body <- result$bytes
  res
}

#* Request Team violin statistics
#* @parser json list(simplifyVector = FALSE)
#* @post /api/v1/sessions/<id>/cards/<instanceId>/statistics/violin
function(id, instanceId, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req)); body <- api_body(req)
  api_mutation(s, req, res, api_violin_stats(s, instanceId, body$mode, body$settings, body$dataFingerprint), handle = api_handle)
})

#* Current Team violin inference policy
#* @get /api/v1/sessions/<id>/statistics/violin/policy
function(id, req, res) api_exclusive(res, id = id, api_violin_policy(api_session_get(id, api_session_caller(req))))

#* Team's PCA score analysis of a dashboard PCA card (statistics.R api_pca_score), as its module rendered it
#* @get /api/v1/sessions/<id>/cards/<instanceId>/pca-score
function(id, instanceId, req, res) api_exclusive(res, id = id, api_pca_score(api_session_get(id, api_session_caller(req)), instanceId))

#* Confirm the reference group for this card
#* @parser json list(simplifyVector = FALSE)
#* @post /api/v1/sessions/<id>/cards/<instanceId>/group-comparison/confirm
function(id, instanceId, req, res) api_exclusive(res, id = id, {
  s <- api_session_get(id, api_session_caller(req))
  api_mutation(s, req, res, api_group_comparison(s, instanceId, api_body(req)$confirmationToken), handle = api_handle)
})

#* Current Team group comparison data
#* @get /api/v1/sessions/<id>/cards/<instanceId>/group-comparison
function(id, instanceId, req, res) api_exclusive(res, id = id, api_group_comparison(api_session_get(id, api_session_caller(req)), instanceId))

#* Prepared dataset quality check
#* @get /api/v1/sessions/<id>/quality
function(id, req, res) api_exclusive(res, id = id, {
  api_dataset_quality(api_session_get(id, api_session_caller(req)))
})
