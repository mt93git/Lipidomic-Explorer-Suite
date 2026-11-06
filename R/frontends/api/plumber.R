# JSON is unboxed for the whole router in run.R (pr_set_serializer).
api_sessions <- new.env(parent = emptyenv())
api_checkpoints <- new.env(parent = emptyenv())
api_commit <- unname(system2("git", c("rev-parse", "HEAD"), stdout = TRUE)[1])

api_error <- function(res, status, error, message) {
  res$status <- status
  list(error = error, message = message)
}
api_handle <- function(res, expr) {
  tryCatch(expr,
    api_bad_request = function(e) api_error(res, 400L, "bad_request", conditionMessage(e)),
    api_unprocessable = function(e) api_error(res, 422L, "unprocessable", conditionMessage(e)))
}
api_body <- function(req) {
  body <- req$body
  if (is.null(body) || identical(body, "")) return(list())
  if (!is.list(body)) api_abort("api_bad_request", "Expected a JSON object.")
  body
}

#* Runtime information
#* @get /api/v1/health
function() list(ok = TRUE, commit = api_commit, r = as.character(getRversion()),
  plotly = as.character(utils::packageVersion("plotly")))

#* Available checkpoints
#* @get /api/v1/checkpoints
function() {
  directory <- Sys.getenv("LIPIDOMIC_API_CHECKPOINT_DIR")
  paths <- if (nzchar(directory)) list.files(directory, pattern = "[.]zip$", full.names = TRUE) else character()
  paths <- paths[!dir.exists(paths)]
  lapply(paths, function(path) list(id = sub("[.]zip$", "", basename(path)), name = basename(path),
    bytes = unname(file.info(path)$size), sha256 = digest::digest(file = path, algo = "sha256")))
}

#* Restore or reuse a checkpoint
#* @post /api/v1/sessions
function(req, res) api_handle(res, {
  id <- api_body(req)$checkpointId
  if (!is.character(id) || length(id) != 1L || is.na(id) || !nzchar(id) ||
      grepl("/", id, fixed = TRUE) || grepl("..", id, fixed = TRUE) || grepl("\\", id, fixed = TRUE))
    api_abort("api_bad_request", "Invalid checkpointId.")
  directory <- Sys.getenv("LIPIDOMIC_API_CHECKPOINT_DIR")
  path <- file.path(directory, paste0(id, ".zip"))
  if (!nzchar(directory) || !file.exists(path) || dir.exists(path)) {
    api_error(res, 404L, "not_found", "Unknown checkpoint.")
  } else {
    key <- normalizePath(path, mustWork = TRUE)
    if (!exists(key, api_checkpoints, inherits = FALSE)) {
      loaded <- api_load_session(path)
      session_id <- paste0("s", length(ls(api_sessions, all.names = TRUE)) + 1L)
      assign(session_id, loaded, api_sessions)
      assign(key, session_id, api_checkpoints)
    }
    session_id <- get(key, api_checkpoints, inherits = FALSE)
    loaded <- get(session_id, api_sessions, inherits = FALSE)
    list(sessionId = session_id, samples = loaded$samples, lipids = loaded$lipids,
      preparation = loaded$applied, inputs = loaded$inputs, canvas = loaded$canvas)
  }
})

#* Render one Team dashboard plot
#* @post /api/v1/sessions/<id>/plots/results_dashboard/<output>
function(id, output, req, res) api_handle(res, {
  if (!exists(id, api_sessions, inherits = FALSE)) {
    api_error(res, 404L, "not_found", "Unknown session.")
  } else {
    loaded <- get(id, api_sessions, inherits = FALSE)
    body <- api_body(req)
    inputs <- body$inputs
    if (is.null(inputs)) inputs <- list()
    if (!is.list(inputs) || (length(inputs) && is.null(names(inputs))))
      api_abort("api_bad_request", "Inputs must be a named object.")
    width <- if (is.null(body$width)) 900 else body$width
    list(figure = api_render_plot(loaded$hub, output, utils::modifyList(loaded$inputs, inputs), width),
      provenance = list(commit = api_commit, preparation = loaded$applied, hooks = "team"))
  }
})
