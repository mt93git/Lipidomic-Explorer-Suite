# Render workers (H9). The engine is one R process: a cold open of a 24-card checkpoint
# drew the cards in view one after another (~2.6 s each on the pilot checkpoint). K worker
# processes (callr::r_session) each open the same checkpoint and draw cards in parallel
# while the main process keeps serving requests.
#
# Only cards the render disk cache could store are sent to a worker (render_disk.R:
# api_card_descriptor is not NULL; Plotly or PNG; not a fixed dashboard copy). The disk
# cache already holds that such a card's plot depends only on the checkpoint, the card's
# explicit inputs and the session-level state in its key (shared analysis settings,
# targeted cohort, study design). A worker aligns that state with the main session before
# drawing, checks it matches, and otherwise refuses the job; the main process then draws
# the card itself. The worker runs Team's own code through the same engine: science is
# unchanged. Plotly coordinates may differ from the main process in the last bit (~1e-15,
# floating-point rounding); PNGs with ggrepel labels already differ between two renders.
#
# LIPIDOMIC_API_WORKERS = number of workers (0, the default, turns the pool off; max 4).
# LIPIDOMIC_API_WORKER_RSS_MB = a worker above this after a job is restarted (default 1500).
#
# Warm worker cards (Phase 1 close, speed). A worker creates its own copy of a card before drawing it (the render's
# "open" phase, 1.6-1.9 s on the production checkpoint), so a new card was paid twice: the main process's create and
# the first render's open. When a poolable card is created (or restored, or its inputs change through the PATCH
# route), an idle worker gets a "warm" job: the same session alignment and the same worker card as a render
# (api_pool_worker_card), without drawing. The first render then goes to the worker that holds that card (affinity),
# or waits for the worker still warming it, and only flushes and draws. Renders always go first: a warm job takes a
# worker only when no render waits. The create never waits for a warm job (it is submitted, not awaited).
# LIPIDOMIC_API_WORKER_REUSE=1 (goal 2, off by default until tests/dual-ui/test_api_pool_warm.R section 4 is green on
# the server): a worker keeps one card per instance and applies a changed input through api_card_update.
api_pool_reuse_on <- function() identical(Sys.getenv("LIPIDOMIC_API_WORKER_REUSE", "0"), "1")
# A worker card's id by content (source + explicit inputs; unchanged since H9) and the instance's own card (reuse).
api_pool_card_id <- function(source, explicit) paste0("tcinstance_pool", substr(digest::digest(list(source, api_sorted(explicit))), 1L, 12L))
api_pool_reuse_id <- function(source, instanceId) paste0("tcinstance_poolr", substr(digest::digest(list(source, instanceId)), 1L, 12L))
api_pool_card_ids <- function(job) c(card = job$cardId, reuse = job$reuseId %||% NA_character_)
api_pool <- new.env(parent = emptyenv())
api_pool$workers <- list(); api_pool$queue <- list(); api_pool$ticking <- FALSE
api_pool$inflight <- new.env(parent = emptyenv())
api_pool$warm_queue <- list(); api_pool$warm_log <- list(); api_pool$warm_submit_ms <- NA_real_

api_pool_size <- function() {
  n <- suppressWarnings(as.integer(Sys.getenv("LIPIDOMIC_API_WORKERS", "0")))
  if (is.na(n)) 0L else max(0L, min(4L, n))
}
api_pool_worker_rss_limit <- function() as.numeric(Sys.getenv("LIPIDOMIC_API_WORKER_RSS_MB", "1500"))
api_pool_job_timeout <- function() as.numeric(Sys.getenv("LIPIDOMIC_API_WORKER_TIMEOUT", "150"))

# --- Code that runs inside a worker. callr resets a function's environment to the
# worker's global environment, so these use only base R and the engine they source.
api_pool_worker_boot <- function(root, api_dir, files) {
  setwd(root)
  Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
    LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0",
    # The main process stores worker results in both caches.
    LIPIDOMIC_API_RENDER_DISK_CACHE = "0", LIPIDOMIC_API_WORKERS = "0")
  Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
  suppressMessages(suppressWarnings(source("R/global.R", local = globalenv())))
  source(file.path(api_dir, "requirements.R"), local = globalenv())
  for (file in files) source(file.path(api_dir, file), local = globalenv())
  invisible(api_catalog())
  Sys.getpid()
}
api_pool_worker_open <- function(path) {
  if (exists("api_worker_session", envir = globalenv()))
    try(api_session_close(get("api_worker_session", envir = globalenv())), silent = TRUE)
  s <- suppressMessages(suppressWarnings(api_session_open(path)))
  assign("api_worker_session", s, envir = globalenv())
  assign("api_worker_path", path, envir = globalenv())
  assign("api_worker_cards", 0L, envir = globalenv())
  # What each worker card shows: list(card = its content id api_pool_card_id(source, explicit), explicit).
  assign("api_worker_content", new.env(parent = emptyenv()), envir = globalenv())
  s$openedSha256 %||% s$sha256
}
# The worker's session, aligned with the job's session-level state (cohort, design, analysis settings).
api_pool_worker_session <- function(job) {
  state_of <- function(s) list(
    cohort = api_read(s, if (isTRUE(s$shared$targeted_mode_active())) sort(as.character(s$shared$targeted_lipids_list())) else character()),
    design = api_design_state(s), analysis = api_sorted(s$analysis_explicit %||% list()), palette = api_palette_key(s))
  same <- function(s) isTRUE(all.equal(state_of(s), job$state[c("cohort", "design", "analysis", "palette")], check.attributes = FALSE))
  align <- function(s) {
    want <- job$state
    if (!identical(state_of(s)$cohort, as.character(want$cohort))) {
      # Applied in the session's own order (the comparison is on the sorted list, as the disk-cache key).
      api_cohort_apply(s, as.character(want$cohortOrder %||% want$cohort)); api_render_epoch_bump(s); api_flush(s)
    }
    if (length(want$analysis) && !isTRUE(all.equal(state_of(s)$analysis, want$analysis, check.attributes = FALSE)))
      api_analysis_update(s, want$analysis)
    # Pilot F1: the session palette, through Team's own setter (palette.R restore).
    if (!is.null(want$palette) && !isTRUE(all.equal(state_of(s)$palette, want$palette, check.attributes = FALSE)))
      api_palette_update(s, list(restore = want$palette))
    d <- state_of(s)$design
    if (is.character(want$design$unit) && is.character(want$design$type) &&
        !isTRUE(all.equal(d[c("unit", "type", "confirmed")], want$design[c("unit", "type", "confirmed")], check.attributes = FALSE)))
      api_design(s, want$design$unit, want$design$type, isTRUE(want$design$confirmed))
    same(s)
  }
  s <- get("api_worker_session", envir = globalenv())
  if (!identical(s$openedSha256 %||% s$sha256, job$sha256)) stop("worker holds another checkpoint")
  # Team's limit is 160 card instances per session; start afresh well before it.
  if (get("api_worker_cards", envir = globalenv()) >= 100L) {
    api_pool_worker_open(get("api_worker_path", envir = globalenv())); s <- get("api_worker_session", envir = globalenv())
  }
  if (!align(s)) {
    # Settings applied for an earlier job cannot always be undone: reopen, then align once more.
    api_pool_worker_open(get("api_worker_path", envir = globalenv())); s <- get("api_worker_session", envir = globalenv())
    if (!align(s)) stop("worker state does not match the session")
  }
  s
}
# The worker card that shows the job's content: list(id, how = "held" | "update" | "open"). A card is created with
# the job's static inputs exactly as before ("open"). With job$reuseId (LIPIDOMIC_API_WORKER_REUSE=1, goal 2) the
# instance's own worker card is updated with the changed inputs through api_card_update, as the main process does for
# a Data-tab change ("update"); inputs it once had and the job lacks cannot be unset, so then a fresh card is created.
api_pool_worker_card <- function(s, job) {
  content <- get("api_worker_content", envir = globalenv())
  held <- function(id) is.character(id) && exists(id, envir = s$cards, inherits = FALSE)
  explicit <- job$explicit %||% list()
  card <- job$cardId %||% api_pool_card_id(job$source, explicit)
  reuse <- job$reuseId
  if (held(reuse) && identical(content[[reuse]]$card, card)) return(list(id = reuse, how = "held"))
  if (held(card)) return(list(id = card, how = "held"))
  if (held(reuse) && is.list(content[[reuse]]) && all(names(content[[reuse]]$explicit) %in% names(explicit))) {
    had <- content[[reuse]]$explicit
    changed <- explicit[!vapply(names(explicit), function(k) k %in% names(had) && identical(had[[k]], explicit[[k]]), logical(1))]
    started <- Sys.time()
    ok <- tryCatch({ if (length(changed)) api_card_update(s, reuse, changed); TRUE }, error = function(e) {
      if (inherits(e, "session_lost")) stop(e)
      FALSE
    })
    api_timing_add("update", started)
    if (ok) { content[[reuse]] <- list(card = card, explicit = explicit); return(list(id = reuse, how = "update")) }
    # A refused update leaves the card in an unknown state: never used again (a fresh card is created below).
    content[[reuse]] <- NULL
  }
  id <- if (!is.null(reuse) && !held(reuse)) reuse else card
  started <- Sys.time()
  # Controls the module builds at run time (FLA logratio's sel_<category>, schema.R api_is_computed_id) are not
  # create inputs: as on the main process, the card is created with its static inputs, then the computed ones are
  # set through api_card_update, which accepts them only once the module has built them (else 400: the main draws it).
  computed <- api_is_computed_id(names(explicit) %||% character())
  api_card_create(s, job$source, explicit[!computed], id)
  assign("api_worker_cards", get("api_worker_cards", envir = globalenv()) + 1L, envir = globalenv())
  if (any(computed)) api_card_update(s, id, explicit[computed])
  api_timing_add("open", started)
  content[[id]] <- list(card = card, explicit = explicit)
  list(id = id, how = "open")
}
# The worker cards this worker holds, named by id, valued by the content each shows (the main process routes by it).
api_pool_worker_held <- function() tryCatch({
  s <- get0("api_worker_session", envir = globalenv()); content <- get0("api_worker_content", envir = globalenv())
  if (is.null(s) || is.null(content)) character() else {
    ids <- grep("^tcinstance_pool", ls(s$cards), value = TRUE)
    stats::setNames(vapply(ids, function(id) content[[id]]$card %||% NA_character_, character(1)), ids)
  }
}, error = function(e) character())
api_pool_worker_error <- function(e) {
  kinds <- c("api_bad_request", "api_not_found", "api_conflict", "api_unprocessable", "api_unavailable", "session_lost")
  list(ok = FALSE, class = intersect(class(e), kinds)[1L], message = conditionMessage(e))
}
api_pool_worker_rss <- function() tryCatch(as.numeric(gsub("[^0-9]", "", grep("^VmRSS:", readLines("/proc/self/status"), value = TRUE)[[1L]])) / 1024,
  error = function(e) NA_real_)
api_pool_worker_render <- function(job) {
  started <- Sys.time()
  out <- tryCatch({
    s <- api_pool_worker_session(job)
    api_timing_reset()
    got <- api_pool_worker_card(s, job)
    value <- api_card_render(s, got$id, job$width, job$height, job$format, dpr = job$dpr %||% 1L)
    list(ok = TRUE, value = value, timing = api_timing$phases, card = got$how)
  }, error = api_pool_worker_error)
  c(out, list(pid = Sys.getpid(), started = as.numeric(started), finished = as.numeric(Sys.time()), rssMb = api_pool_worker_rss(),
    cards = api_pool_worker_held()))
}
# A warm job (Phase 1 close, speed): the same session alignment and the same worker card as a render, without drawing.
api_pool_worker_warm <- function(job) {
  started <- Sys.time()
  out <- tryCatch({
    s <- api_pool_worker_session(job)
    api_timing_reset()
    got <- api_pool_worker_card(s, job)
    list(ok = TRUE, timing = api_timing$phases, card = got$how)
  }, error = api_pool_worker_error)
  c(out, list(pid = Sys.getpid(), started = as.numeric(started), finished = as.numeric(Sys.time()), rssMb = api_pool_worker_rss(),
    cards = api_pool_worker_held()))
}

# --- Main process.
api_pool_start <- function(n = api_pool_size(), files, root = getwd(), api_dir = api_run_dir) {
  api_pool_stop()
  api_pool$boot <- list(root = root, api_dir = api_dir, files = files)
  for (i in seq_len(n)) api_pool$workers[[i]] <- api_pool_spawn(i)
  if (n) api_pool_tick_soon()
  invisible(n)
}
api_pool_stop <- function() {
  for (w in api_pool$workers) try(w$proc$kill(), silent = TRUE)
  for (job in api_pool$queue) job$resolve(list(ok = FALSE, fallback = TRUE))
  api_pool$workers <- list(); api_pool$queue <- list(); api_pool$warm_queue <- list()
  api_pool$inflight <- new.env(parent = emptyenv())
  invisible(NULL)
}
api_pool_spawn <- function(i) {
  w <- new.env(parent = emptyenv())
  w$index <- i; w$sha256 <- NULL; w$path <- NULL; w$job <- NULL; w$loaded <- NULL; w$cards <- character()
  w$proc <- callr::r_session$new(callr::r_session_options(user_profile = FALSE, system_profile = FALSE), wait = TRUE)
  b <- api_pool$boot
  w$proc$call(api_pool_worker_boot, list(b$root, b$api_dir, b$files))
  w$state <- "booting"; w$since <- Sys.time()
  w
}
api_pool_alive <- function() Filter(function(w) !identical(w$state, "dead"), api_pool$workers)
# Workers that can take or are about to take jobs for this checkpoint.
api_pool_serving <- function(sha) Filter(function(w) identical(w$sha256, sha) && w$state %in% c("opening", "idle", "busy"), api_pool$workers)
api_pool_status <- function() {
  states <- vapply(api_pool$workers, function(w) w$state, character(1))
  warming <- sum(vapply(api_pool$workers, function(w) inherits(w$job, "api_pool_warm"), logical(1)))
  list(size = length(api_pool$workers), idle = sum(states == "idle"), busy = sum(states == "busy"),
    starting = sum(states %in% c("booting", "opening")), queued = length(api_pool$queue),
    warming = warming, warmQueued = length(api_pool$warm_queue), inFlight = length(ls(api_pool$inflight)),
    workers = lapply(api_pool$workers, function(w) list(index = w$index, state = w$state,
      checkpoint = w$loaded, cards = length(w$cards))))
}
# A session opens: every worker opens the same checkpoint (in parallel with the main open).
api_pool_prepare <- function(path, sha) {
  for (w in api_pool_alive()) {
    if (identical(w$sha256, sha)) next
    w$path <- path; w$sha256 <- sha
    if (identical(w$state, "idle")) api_pool_open(w)
  }
  invisible(NULL)
}
api_pool_open <- function(w) {
  w$proc$call(api_pool_worker_open, list(w$path)); w$state <- "opening"; w$since <- Sys.time(); w$cards <- character()
  api_pool_tick_soon()
}

# The session-level state a worker aligns before creating or drawing a card (the disk-cache key's).
api_pool_state <- function(s) {
  order <- api_read(s, if (isTRUE(s$shared$targeted_mode_active())) as.character(s$shared$targeted_lipids_list()) else character())
  list(cohort = sort(order), design = api_design_state(s), analysis = api_sorted(s$analysis_explicit %||% list()), cohortOrder = order,
    palette = api_palette_key(s))
}
# What a worker needs to draw this card, or NULL when the main process must draw it.
api_pool_job <- function(s, instanceId, width, height, format, dpr = 1L) {
  if (!length(api_pool_serving(s$openedSha256 %||% s$sha256))) return(NULL)
  descriptor <- api_pool_poolable(api_card_descriptor(s, instanceId))
  if (is.null(descriptor)) return(NULL)
  if (!(identical(format, "auto") || identical(format, descriptor$render) ||
        (identical(format, "json") && identical(descriptor$render, "plotly")))) return(NULL)
  if (!identical(descriptor$render, "png")) dpr <- 1L
  key_format <- api_render_format_key(descriptor$render, dpr)
  memory_key <- api_render_key(s, instanceId, width, height, key_format)
  disk_key <- api_render_disk_key(s, descriptor, width, height, key_format)
  # Already drawn: the main process answers from its caches at once.
  if (!is.null(api_render_cache_get(s, memory_key)) ||
      (!is.null(disk_key) && !is.null(api_render_disk_dir()) && file.exists(file.path(api_render_disk_dir(), paste0(disk_key, ".rds")))))
    return(NULL)
  structure(list(sessionId = s$sessionId, instanceId = instanceId, engineRevision = s$engineRevision %||% 0L, sha256 = s$openedSha256 %||% s$sha256, source = descriptor$source,
    explicit = descriptor$explicit, render = descriptor$render, width = width, height = height, format = descriptor$render,
    state = api_pool_state(s), memoryKey = memory_key, diskKey = disk_key, dpr = dpr, keyFormat = key_format,
    cardId = api_pool_card_id(descriptor$source, descriptor$explicit),
    reuseId = if (api_pool_reuse_on()) api_pool_reuse_id(descriptor$source, instanceId) else NULL,
    submitted = as.numeric(Sys.time())), class = "api_pool_job")
}
# A warm job for this card, or NULL (no worker serves the checkpoint; not poolable). `descriptor`: what a card being
# created right now will be (api_card_create sends it before its own flush, so the worker creates in parallel).
api_pool_warm_job <- function(s, instanceId, descriptor = NULL) {
  if (!length(api_pool_serving(s$openedSha256 %||% s$sha256)) || !is.character(instanceId) || length(instanceId) != 1L) return(NULL)
  # A card being created: its own inputs win over a saved canvas node with the same id (api_card_descriptor would
  # read the saved ones); the same exclusions as api_card_descriptor (acted, replayed member actions).
  current <- if (!is.null(descriptor) && !exists(instanceId, envir = s$cards, inherits = FALSE)) {
    if ((!is.null(s$acted) && isTRUE(s$acted[[instanceId]])) || length(api_card_member_actions(s, instanceId))) NULL else descriptor
  } else api_card_descriptor(s, instanceId)
  current <- api_pool_poolable(current)
  if (is.null(current)) return(NULL)
  structure(list(warm = TRUE, sessionId = s$sessionId, instanceId = instanceId, engineRevision = s$engineRevision %||% 0L, sha256 = s$openedSha256 %||% s$sha256, source = current$source,
    explicit = current$explicit, render = current$render, state = api_pool_state(s), descriptor = descriptor,
    cardId = api_pool_card_id(current$source, current$explicit),
    reuseId = if (api_pool_reuse_on()) api_pool_reuse_id(current$source, instanceId) else NULL,
    resolve = function(...) invisible(NULL), submitted = as.numeric(Sys.time())), class = "api_pool_warm")
}
# Send an idle worker a warm job for this card. Never blocks: the job is queued and handed to a worker (an
# asynchronous callr call) or left for the next tick; nothing waits for its answer. TRUE when a job was queued.
api_pool_warm <- function(s, instanceId, descriptor = NULL) {
  if (!length(api_pool$workers)) return(FALSE)
  started <- Sys.time()
  on.exit(api_pool$warm_submit_ms <- as.numeric(difftime(Sys.time(), started, units = "secs")) * 1000)
  tryCatch({
    job <- api_pool_warm_job(s, instanceId, descriptor)
    if (is.null(job)) FALSE else {
      # One pending warm per card (the newest wins), at most 32 pending.
      pending <- Filter(function(x) !api_pool_same_instance(x, job), api_pool$warm_queue)
      api_pool$warm_queue <- utils::tail(c(pending, list(job)), 32L)
      api_pool_pump()
      TRUE
    }
  }, error = function(e) { message("render pool warm: ", conditionMessage(e)); FALSE })
}
api_pool_same_instance <- function(a, b) identical(a$sessionId, b$sessionId) && identical(a$instanceId, b$instanceId)
api_pool_same_card <- function(a, b) !is.null(a) && !is.null(b) && identical(a$sha256, b$sha256) &&
  identical(a$cardId, b$cardId) && identical(a$reuseId, b$reuseId)
# 2: the worker holds a card showing exactly this job's content (no open); 1: it holds the instance's own card with
# other inputs (reuse: an update); 0: neither. Mirrors api_pool_worker_card.
api_pool_holds <- function(w, job) {
  cards <- w$cards %||% character()
  if (!identical(w$loaded, job$sha256) || !length(cards)) return(0L)
  if (job$cardId %in% names(cards)) return(2L)
  if (!is.null(job$reuseId) && job$reuseId %in% names(cards))
    return(if (identical(unname(cards[[job$reuseId]]), job$cardId)) 2L else 1L)
  0L
}
# The worker that holds this card's current content, or NULL.
api_pool_holder <- function(s, instanceId) {
  job <- api_pool_warm_job(s, instanceId)
  if (is.null(job)) return(NULL)
  for (w in api_pool_serving(s$openedSha256 %||% s$sha256)) if (api_pool_holds(w, job) == 2L) return(w)
  NULL
}
api_pool_ready <- function(sha) Filter(function(w) identical(w$state, "idle") && identical(w$sha256, sha) && identical(w$loaded, sha),
  api_pool$workers)
api_pool_dispatch <- function(w, job, fn, fields) {
  w$job <- job; w$state <- "busy"; w$since <- Sys.time()
  w$proc$call(fn, list(job[fields]))
}
api_pool_submit <- function(job) {
  key <- paste(job$sessionId, job$engineRevision, job$memoryKey, sep = "|")
  held <- api_pool$inflight[[key]]
  if (!is.null(held)) return(held)
  settled <- FALSE
  answer <- promises::promise(function(resolve, reject) {
    job$resolve <- function(result) {
      settled <<- TRUE
      if (exists(key, api_pool$inflight, inherits = FALSE)) rm(list = key, envir = api_pool$inflight)
      resolve(result)
    }
    api_pool$queue[[length(api_pool$queue) + 1L]] <- job
    api_pool_pump()
  })
  if (!settled) api_pool$inflight[[key]] <- answer
  answer
}
api_pool_pump <- function() {
  # A worker that died while idle starts again (boot, then open the checkpoint).
  for (w in api_pool$workers) if (identical(w$state, "idle") && !w$proc$is_alive()) api_pool_restart(w)
  keep <- list()
  for (job in api_pool$queue) {
    if (!length(api_pool_serving(job$sha256))) { job$resolve(list(ok = FALSE, fallback = TRUE)); next }
    # The render creates the card itself: a warm job for it still waiting is dropped.
    api_pool$warm_queue <- Filter(function(x) !api_pool_same_instance(x, job), api_pool$warm_queue)
    idle <- api_pool_ready(job$sha256)
    holds <- vapply(idle, api_pool_holds, integer(1), job = job)
    # Affinity: the worker holding the card; else wait for the worker warming it right now (an open elsewhere would
    # cost as much and start later); else the instance's own card (reuse); else any idle worker, as before.
    warming <- Filter(function(w) identical(w$state, "busy") && inherits(w$job, "api_pool_warm") && api_pool_same_card(w$job, job),
      api_pool$workers)
    w <- if (any(holds == 2L)) idle[[which(holds == 2L)[[1L]]]] else if (length(warming)) NULL else
      if (any(holds == 1L)) idle[[which(holds == 1L)[[1L]]]] else if (length(idle)) idle[[1L]] else NULL
    if (is.null(w)) { keep[[length(keep) + 1L]] <- job; next }
    api_pool_dispatch(w, job, api_pool_worker_render,
      c("sha256", "source", "explicit", "width", "height", "format", "state", "dpr", "cardId", "reuseId"))
  }
  api_pool$queue <- keep
  # Warm jobs only take workers no render is waiting for.
  if (!length(api_pool$queue)) api_pool_pump_warm()
  api_pool_tick_soon()
}
api_pool_pump_warm <- function() {
  keep <- list()
  for (job in api_pool$warm_queue) {
    if (!length(api_pool_serving(job$sha256))) next
    if (!length(api_pool_ready(job$sha256))) { keep[[length(keep) + 1L]] <- job; next }
    # Rebuilt now: the card's inputs or the session state may have changed while it waited, or it may be gone.
    s <- tryCatch(api_session_find(job$sessionId), error = function(e) NULL)
    fresh <- if (is.null(s)) NULL else tryCatch(api_pool_warm_job(s, job$instanceId, job$descriptor), error = function(e) NULL)
    if (is.null(fresh)) next
    serving <- api_pool_serving(fresh$sha256)
    # Already warm somewhere, or a worker is creating it right now (a warm or a render of the same card).
    if (any(vapply(serving, function(w) api_pool_holds(w, fresh) == 2L || api_pool_same_card(w$job, fresh), logical(1)))) next
    idle <- api_pool_ready(fresh$sha256)
    if (!length(idle)) { keep[[length(keep) + 1L]] <- job; next }
    holds <- vapply(idle, api_pool_holds, integer(1), job = fresh)
    # The instance's own card (reuse) if its worker is idle; else the idle worker holding the fewest cards.
    w <- if (any(holds == 1L)) idle[[which(holds == 1L)[[1L]]]] else
      idle[[which.min(vapply(idle, function(x) length(x$cards %||% character()), numeric(1)))]]
    api_pool_dispatch(w, fresh, api_pool_worker_warm, c("sha256", "source", "explicit", "state", "cardId", "reuseId"))
  }
  api_pool$warm_queue <- keep
  invisible(NULL)
}
# A warm job's answer: logged (the last 50 in api_pool$warm_log, one stderr line each); nothing waits for it.
api_pool_warm_done <- function(w, job, result) {
  entry <- list(instanceId = job$instanceId, sessionId = job$sessionId, worker = w$index, ok = isTRUE(result$ok),
    card = result$card, timing = result$timing, message = result$message,
    ms = if (is.numeric(result$finished) && is.numeric(result$started)) (result$finished - result$started) * 1000 else NA_real_)
  api_pool$warm_log <- utils::tail(c(api_pool$warm_log, list(entry)), 50L)
  phases <- entry$timing %||% list()
  message(paste(c(sprintf("warm %s worker %d %s %s", job$instanceId, w$index, if (entry$ok) "ok" else "failed", entry$card %||% ""),
    vapply(names(phases), function(n) sprintf("%s=%.0fms", n, phases[[n]]), character(1)),
    sprintf("total=%.0fms", entry$ms)), collapse = " "))
  invisible(entry)
}
api_pool_tick_soon <- function() {
  if (isTRUE(api_pool$ticking)) return(invisible(NULL))
  api_pool$ticking <- TRUE
  later::later(api_pool_tick, 0.02)
}
api_pool_restart <- function(w) {
  try(w$proc$kill(), silent = TRUE)
  fresh <- api_pool_spawn(w$index); fresh$path <- w$path; fresh$sha256 <- w$sha256
  api_pool$workers[[w$index]] <- fresh
}
api_pool_tick <- function() {
  api_pool$ticking <- FALSE
  on.exit({
    tryCatch(api_pool_pump(), error = function(e) message("render pool: ", conditionMessage(e)))
    if (any(vapply(api_pool$workers, function(w) w$state %in% c("booting", "opening", "busy"), logical(1)))) api_pool_tick_soon()
  })
  for (w in api_pool$workers) tryCatch(api_pool_tick_worker(w), error = function(e) {
    message("render worker ", w$index, ": ", conditionMessage(e))
    job <- w$job; w$job <- NULL
    if (!is.null(job)) job$resolve(list(ok = FALSE, fallback = TRUE))
    tryCatch(api_pool_restart(w), error = function(e) w$state <- "dead")
  })
}
api_pool_tick_worker <- function(w) {
  was <- w$state
  if (!was %in% c("booting", "opening", "busy")) return(invisible(NULL))
  # Test-only delivery barrier: the real worker draws its captured state, but its answer waits
  # until the test releases it. Nothing is polled/read while held; the normal tick retries.
  hold <- getOption("nexo.api.hold_worker")
  if (identical(was, "busy") && !is.null(hold) && isTRUE(hold(w$job))) return(invisible(NULL))
  limit <- if (identical(was, "booting")) 300 else api_pool_job_timeout()
  timed_out <- as.numeric(difftime(Sys.time(), w$since, units = "secs")) > limit
  alive <- w$proc$is_alive()
  message <- NULL
  if (alive && !timed_out) {
    if (!identical(w$proc$poll_process(0), "ready")) return(invisible(NULL))
    message <- w$proc$read()
    # Startup and progress messages: the call is still running.
    if (is.null(message) || (!isTRUE(message$code == 200) && is.null(message$error))) return(invisible(NULL))
  }
  failed <- !alive || timed_out || !is.null(message$error)
  reopen <- FALSE
  if (identical(was, "busy")) {
    job <- w$job; w$job <- NULL
    result <- if (failed) list(ok = FALSE, fallback = TRUE) else message$result
    # What the worker holds now (after a recycle at 100 cards or a reopen, only what it created since).
    if (!failed && !is.null(result$cards)) w$cards <- result$cards
    if (inherits(job, "api_pool_warm")) tryCatch(api_pool_warm_done(w, job, result), error = function(e) NULL)
    else if (!is.null(job)) job$resolve(result)
    if (!failed && isTRUE(result$rssMb > api_pool_worker_rss_limit())) failed <- TRUE
    # The worker's own session went wrong (anything but the module's refusal): open the checkpoint again.
    if (!failed && !isTRUE(result$ok) && !identical(result$class, "api_unprocessable")) reopen <- TRUE
  }
  if (failed) {
    if (identical(was, "booting") && alive && !timed_out) {
      # The engine does not load in a worker: no pool, the main process draws everything.
      w$state <- "dead"; message("render worker ", w$index, " failed to start: ", conditionMessage(message$error))
    } else if (identical(was, "opening") && alive && !timed_out) {
      w$sha256 <- NULL; w$path <- NULL; w$loaded <- NULL; w$state <- "idle"
    } else api_pool_restart(w)
    return(invisible(NULL))
  }
  w$state <- "idle"
  if (identical(was, "opening")) w$loaded <- message$result
  # Booted; the session moved to another checkpoint while this worker opened or drew; or its session broke.
  if (!is.null(w$path) && (identical(was, "booting") || reopen || !identical(w$loaded, w$sha256))) api_pool_open(w)
  invisible(NULL)
}

# The main process takes a worker's answer: the main session's provenance, both caches
# (only if nothing that feeds the plot changed meanwhile), or its own render if the
# worker could not draw the card.
api_pool_finish <- function(job, out, render_here) {
  s <- api_session_find(job$sessionId)
  key_format <- job$keyFormat %||% job$render
  if (!identical(job$engineRevision, s$engineRevision %||% 0L) ||
      !identical(api_render_key(s, job$instanceId, job$width, job$height, key_format), job$memoryKey)) {
    api_timing_note("where", "main")
    return(render_here())
  }
  if (!isTRUE(out$ok)) {
    # The module's own refusal (req()/validate()) is the same in any process: forward it. Any other
    # worker error (its session lost, a 400 from its card) is the worker's: draw here (H9 review P1).
    if (identical(out$class, "api_unprocessable")) api_abort(out$class, out$message)
    return(render_here())
  }
  result <- out$value
  result$engineRevision <- job$engineRevision
  result$where <- "worker"
  result$provenance <- list(commit = api_commit, checkpointSha256 = s$sha256,
    preparationCheck = s$receipt, revision = s$revision %||% result$provenance$revision, hooks = "team")
  result$cached <- FALSE
  if (identical(api_render_key(s, job$instanceId, job$width, job$height, key_format), job$memoryKey))
    api_render_cache_put(s, job$memoryKey, result)
  if (!is.null(job$diskKey) && identical(job$diskKey,
      api_render_disk_key(s, api_card_descriptor(s, job$instanceId), job$width, job$height, key_format)))
    api_render_disk_put(job$diskKey, result)
  result
}
