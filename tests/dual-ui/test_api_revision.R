# Engine revision, stale worker and intent-idempotency contracts.
for (pkg in c("shiny", "jsonlite", "callr", "promises", "later", "digest", "plumber"))
  if (!requireNamespace(pkg, quietly = TRUE)) {
    cat("SKIP test_api_revision: package", pkg, "not installed\n"); quit(status = 0)
  }
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0", LIPIDOMIC_API_RENDER_DISK_CACHE = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV", "LIPIDOMIC_API_WORKERS"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_revision")
source("frontends/nexo-api/engine.R"); source("frontends/nexo-api/pool.R")
source("frontends/nexo-api/plumber.R")
Sys.setenv(LIPIDOMIC_ADMIN_SUPABASE_URL = "https://admin.invalid",
  LIPIDOMIC_ADMIN_ANON_KEY = "synthetic-anon")
options(lipidomic.admin.http_fetcher = function(method, url, headers, payload = NULL) {
  stopifnot(grepl("/rpc/nexo_caller$", url),
    identical(headers[["Authorization"]], "Bearer synthetic-revision-user"))
  list(status = 200L, body = charToRaw('[{"caller":"synthetic-user","caller_view":"staff","client_id":null}]'))
})
# Use the actual PATCH handler in process, including the plan's header carrier.
lines <- readLines("frontends/nexo-api/plumber.R")
route <- function(tag) {
  start <- grep(paste0("^#\\* ", tag, "$"), lines) + 1L
  end <- which(seq_along(lines) > start & grepl("^#\\*", lines))[[1L]] - 1L
  eval(parse(text = lines[start:end]))
}
patch <- route("@patch /api/v1/sessions/<id>/cards/<instanceId>")
render <- route("@post /api/v1/sessions/<id>/cards/<instanceId>/render")
wait_for <- function(ok, timeout = 240) {
  deadline <- Sys.time() + timeout
  while (!isTRUE(ok()) && Sys.time() < deadline) later::run_now(0.1)
  isTRUE(ok())
}
await <- function(p) {
  done <- FALSE; value <- NULL
  promises::then(p, function(v) { value <<- v; done <<- TRUE }, function(e) { value <<- e; done <<- TRUE })
  if (!wait_for(function() done)) stop("promise did not settle")
  if (inherits(value, "error")) stop(value)
  value
}
# Plumber's res$setHeader appends: a second call sends the header twice and fetch reads "3, 3".
fake_res <- function(headers = list()) {
  res <- new.env(); res$headers <- headers
  res$setHeader <- function(name, value) { he <- list(); he[[name]] <- value; res$headers <- c(res$headers, he) }
  res
}
one_revision <- function(res) {
  values <- unlist(res$headers[names(res$headers) == "X-Nexo-Engine-Revision"])
  if (length(values) != 1L) stop(sprintf("%d X-Nexo-Engine-Revision headers: %s", length(values), paste(values, collapse = ", ")))
  values[[1L]]
}
failed <- 0L
check <- function(name, code) {
  error <- tryCatch({ force(code); NULL }, error = function(e) conditionMessage(e))
  if (is.null(error)) cat("PASS", name, "\n") else {
    failed <<- failed + 1L; cat("FAIL", name, ":", error, "\n")
  }
}
local({
  on.exit({ options(nexo.api.delay_patch = NULL, nexo.api.hold_worker = NULL, nexo.api.fail_after_apply = NULL)
    api_pool_stop() }, add = TRUE)
  api_pool_start(1L, c("health.R", "session.R", "schema.R", "catalog.R", "cards.R", "storage_files.R",
    "storage.R", "analysis.R", "palette.R", "cohort.R", "nexo_store.R", "render_disk.R", "pool.R"),
    getwd(), normalizePath("frontends/nexo-api"))
  s <- api_session_for_checkpoint("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
  on.exit(api_session_close(s), add = TRUE)
  stopifnot(wait_for(function() api_pool_status()$idle == 1L))
  stopifnot(identical(s$engineRevision, 0L))
  id <- api_card_create(s, "qc_pca_tab-pca2dPlot")$instanceId
  stopifnot(identical(s$engineRevision, 1L), isTRUE(api_card_schema(s, id)$cacheable))
  check("revision headers preserve canvas and read-array bodies", {
    for (body in list(api_canvas_current(s), list(list(id = "synthetic-download")))) {
      res <- fake_res()
      answer <- api_revision_header(res, body, s$sessionId)
      stopifnot(identical(answer, body),
        identical(one_revision(res), as.character(s$engineRevision)))
    }
  })
  check("a patch answer carries one engine revision header", {
    res <- fake_res()
    answer <- patch(s$sessionId, id, list(REQUEST_METHOD = "PATCH",
      PATH_INFO = sprintf("/api/v1/sessions/%s/cards/%s", s$sessionId, id),
      HTTP_X_NEXO_ADMIN_TOKEN = "synthetic-revision-user", body = list(inputs = list(scoreMarkerSize2D = 6))), res)
    stopifnot(identical(one_revision(res), as.character(answer$engineRevision)))
  })
  check("a render answer carries one engine revision header", {
    res <- fake_res()
    await(promises::as.promise(render(s$sessionId, id, list(REQUEST_METHOD = "POST",
      PATH_INFO = sprintf("/api/v1/sessions/%s/cards/%s/render", s$sessionId, id),
      HTTP_X_NEXO_ADMIN_TOKEN = "synthetic-revision-user", body = list(width = 620, height = 480)), res)))
    stopifnot(identical(one_revision(res), as.character(s$engineRevision)))
  })
  check("busy mutation answers carry the current revision", local({
    res <- fake_res()
    api_busy <<- TRUE
    answer <- tryCatch(patch(s$sessionId, id, list(REQUEST_METHOD = "PATCH",
      PATH_INFO = sprintf("/api/v1/sessions/%s/cards/%s", s$sessionId, id),
      HTTP_X_NEXO_ADMIN_TOKEN = "synthetic-revision-user", body = list()), res), finally = { api_busy <<- FALSE })
    stopifnot(identical(res$status, 503L), identical(answer$engineRevision, s$engineRevision),
      identical(one_revision(res), as.character(s$engineRevision)))
  }))
  check("patch answers carry an engine revision that increases", {
    answers <- list(); invoked <- FALSE
    options(nexo.api.delay_patch = function(sessionId, instanceId, n) {
      if (!invoked) {
        invoked <<- TRUE
        later::later(function() {
          answers[["second"]] <<- api_card_update(s, id, list(scoreMarkerSize2D = 9))
        }, 0)
        return(0.1)
      }
      0
    })
    answers[["first"]] <- api_card_update(s, id, list(scoreMarkerSize2D = 5))
    options(nexo.api.delay_patch = NULL)
    if (!invoked) stop("delay_patch hook was not invoked")
    stopifnot(identical(names(answers), c("second", "first")))
    if (is.null(answers$first$engineRevision) || is.null(answers$second$engineRevision)) stop("missing engineRevision")
    stopifnot(answers$first$engineRevision < answers$second$engineRevision)
  })
  check("held worker result is not returned stale (B1)", {
    held <- FALSE; release <- FALSE; done <- FALSE; out <- NULL
    options(nexo.api.hold_worker = function(job) {
      if (!inherits(job, "api_pool_job")) return(FALSE)
      held <<- TRUE; !release
    })
    render_id <- api_card_create(s, "results_dashboard-plot_pca")$instanceId
    job <- api_pool_job(s, render_id, 620, 680, "auto")
    stopifnot(inherits(job, "api_pool_job"))
    p <- api_pool_submit(job)
    promises::then(p, function(v) { out <<- v; done <<- TRUE })
    if (!wait_for(function() held, 10)) stop("hold_worker hook was not invoked")
    stopifnot(!done)
    api_cohort_set(s, head(api_cohort_lipids(s), 6L))
    release <- TRUE
    stopifnot(wait_for(function() done), isTRUE(out$ok))
    options(nexo.api.hold_worker = NULL)
    fresh <- api_card_render(s, render_id, 620, 680, "auto")
    result <- api_pool_finish(job, out, function() fresh)
    stale_error <- api_pool_finish(job, list(ok = FALSE, class = "api_unprocessable", message = "old refusal"), function() fresh)
    stopifnot(identical(stale_error, fresh))
    traces <- function(r) lapply(r$figure$data, function(t) t[intersect(names(t), c("type", "name", "x", "y"))])
    same <- function(a, b) if (!is.null(a$png)) identical(digest::digest(a$png, "sha256"), digest::digest(b$png, "sha256")) else
      isTRUE(all.equal(traces(a), traces(b), tolerance = 1e-9))
    if (same(out$value, fresh)) stop("fixture did not change the rendered science")
    if (!identical(result$where, "main") && !same(result, fresh)) stop("old worker image returned with current provenance")
    stopifnot(identical(result$where, "main"), same(result, fresh), identical(result$engineRevision, s$engineRevision))
  })
  check("stale worker refusals carry the fresh render revision", {
    res <- fake_res(list(`X-Nexo-Engine-Revision` = as.character(job$engineRevision)))
    answer <- api_exclusive(res, api_pool_finish(job,
      list(ok = FALSE, class = "api_unprocessable", message = "old refusal"),
      function() api_card_render(s, "tcinstance_missing", res = res)))
    stopifnot(identical(res$status, 404L), identical(answer$engineRevision, s$engineRevision),
      identical(one_revision(res), as.character(s$engineRevision)))
  })
  check("identical simultaneous renders share one job", {
    api_render_cache_clear(s)
    job <- api_pool_job(s, id, 777, 680, "auto")
    held <- TRUE
    options(nexo.api.hold_worker = function(job) held)
    a <- api_pool_submit(job); b <- api_pool_submit(job)
    shared <- identical(a, b); count <- api_pool_status()$inFlight
    held <- FALSE
    await(a); await(b)
    options(nexo.api.hold_worker = NULL)
    if (!shared) stop("identical renders submitted two jobs")
    stopifnot(identical(count, 1L), identical(api_pool_status()$inFlight, 0L))
  })
  check("two display densities submit two jobs", {
    png <- api_card_create(s, "qc_pca_tab-boxplotAfterNorm")$instanceId
    held <- TRUE
    options(nexo.api.hold_worker = function(job) held)
    a <- api_pool_submit(api_pool_job(s, png, 777, 680, "auto", 1L))
    b <- api_pool_submit(api_pool_job(s, png, 777, 680, "auto", 2L))
    count <- api_pool_status()$inFlight
    held <- FALSE
    await(a); await(b)
    options(nexo.api.hold_worker = NULL)
    if (!identical(count, 2L)) stop("two DPRs did not register two in-flight jobs")
    stopifnot(!identical(a, b), identical(api_pool_status()$inFlight, 0L))
  })
  check("intent errors retain their status and expire after ten minutes", {
    req <- list(REQUEST_METHOD = "PATCH",
      PATH_INFO = sprintf("/api/v1/sessions/%s/cards/%s", s$sessionId, id),
      HTTP_X_NEXO_ADMIN_TOKEN = "synthetic-revision-user",
      HTTP_X_NEXO_INTENT = "synthetic-expiring-intent", body = list(inputs = list(unknownInput = 1)))
    res <- fake_res()
    before <- s$engineRevision
    first <- patch(s$sessionId, id, req, res)
    stopifnot(identical(res$status, 400L), identical(s$engineRevision, before))
    req$body <- list(inputs = list(scoreMarkerSize2D = 11))
    second <- patch(s$sessionId, id, req, res)
    stopifnot(identical(first, second), identical(res$status, 400L), identical(s$engineRevision, before))
    s$intents[[req$HTTP_X_NEXO_INTENT]]$at <- Sys.time() - 601
    res$status <- 200L
    third <- patch(s$sessionId, id, req, res)
    stopifnot(third$engineRevision > before, identical(res$status, 200L))
  })
  check("repeated intent is applied once", {
    stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
    action <- api_card_create(s, "structural_tab-summaryPlot")$instanceId
    req <- list(REQUEST_METHOD = "PATCH",
      PATH_INFO = sprintf("/api/v1/sessions/%s/cards/%s", s$sessionId, action),
      HTTP_X_NEXO_ADMIN_TOKEN = "synthetic-revision-user",
      HTTP_X_NEXO_INTENT = "synthetic-intent-1", body = list(actions = list("runAnalysis")))
    res <- fake_res()
    hit <- FALSE
    options(nexo.api.fail_after_apply = function(sessionId, instanceId) { hit <<- TRUE; TRUE })
    first <- tryCatch(patch(s$sessionId, action, req, res), error = identity)
    options(nexo.api.fail_after_apply = NULL)
    if (!hit || !inherits(first, "error")) stop("fail_after_apply did not interrupt the answer")
    answer <- patch(s$sessionId, action, req, res)
    stopifnot(identical(one_revision(res), as.character(answer$engineRevision)),
      identical(s$engineRevision, answer$engineRevision), !api_card_schema(s, action)$cacheable)
    api_card_update(s, id, list(scoreMarkerSize2D = 10))
    replay <- patch(s$sessionId, action, req, res)
    stopifnot(identical(answer, replay), replay$engineRevision < s$engineRevision,
      identical(one_revision(res), as.character(answer$engineRevision)))
    count <- api_read(s, s$mock$input[[paste0(action, "-runAnalysis")]])
    if (!identical(as.numeric(count), 1)) stop(sprintf("runAnalysis counter is %s (expected 1)", count))
    stopifnot(identical(s$intents[[req$HTTP_X_NEXO_INTENT]]$status, 200L))
  })
})
quit(status = as.integer(failed > 0L))
