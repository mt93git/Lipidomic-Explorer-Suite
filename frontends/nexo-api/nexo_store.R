# Nexo's own checkpoint member. Team's canvas validator (team_canvas_object,
# R/frontends/team/canvas_state.R) rejects any key it does not know, so styling that goes
# beyond Team (axis ranges, log scales, weights, reference lines...) is kept here instead,
# keyed by node id. Team's archive reader opens only the members it knows
# (R/utils_session_archive.R), so Team still opens the checkpoint and draws its own version
# of each card. The API checks the envelope only; the client validates the style itself.
api_nexo_member <- "nexo-canvas-v1.json"
api_nexo_limit <- 2 * 1024^2

api_nexo_json <- function(x)
  as.character(jsonlite::toJSON(x, auto_unbox = TRUE, null = "null", na = "null", digits = NA))

api_nexo_check <- function(x) {
  if (is.null(x)) return(NULL)
  bad <- function(msg) api_abort("api_bad_request", msg)
  if (!is.list(x) || is.null(names(x))) bad("Nexo canvas must be a JSON object.")
  if (!identical(as.numeric(x$version), 1)) bad("Unsupported Nexo canvas version.")
  nodes <- x$nodes
  if (!is.list(nodes) || (length(nodes) && (is.null(names(nodes)) || any(!nzchar(names(nodes))))))
    bad("Nexo canvas nodes must be an object keyed by node id.")
  if (!length(nodes)) x$nodes <- structure(list(), names = character())
  if (nchar(api_nexo_json(x), type = "bytes") > api_nexo_limit) bad("Nexo canvas exceeds 2 MiB.")
  x
}

# What a save request means for the member: absent keeps the session's, null clears it.
api_nexo_from_body <- function(body, s)
  if ("nexo" %in% names(body)) api_nexo_check(body$nexo) else s$nexo

api_nexo_append <- function(path, s) {
  if (is.null(s$nexo)) return(invisible(FALSE))
  stage <- tempfile("nexo-canvas-"); dir.create(stage); on.exit(unlink(stage, recursive = TRUE))
  writeLines(api_nexo_json(s$nexo), file.path(stage, api_nexo_member), useBytes = TRUE)
  zip::zip_append(path, files = api_nexo_member, root = stage)
  invisible(TRUE)
}

# A missing, oversized or broken member is ignored: it must never block opening the checkpoint.
api_nexo_read <- function(zip) tryCatch({
  entries <- zip::zip_list(zip)
  if (!api_nexo_member %in% entries$filename) return(NULL)
  size <- entries$uncompressed_size[match(api_nexo_member, entries$filename)]
  if (!is.finite(size) || size > api_nexo_limit) return(NULL)
  con <- unz(zip, api_nexo_member); on.exit(close(con))
  api_nexo_check(jsonlite::fromJSON(paste(readLines(con, warn = FALSE), collapse = "\n"), simplifyVector = FALSE))
}, error = function(e) NULL)
