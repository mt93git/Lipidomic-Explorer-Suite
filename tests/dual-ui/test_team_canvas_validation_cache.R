Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/frontends/team/canvas_state.R")

svg_url <- function(fill) paste0("data:image/svg+xml,", utils::URLencode(
  paste0('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="', fill, '"/></svg>'),
  reserved = TRUE))
url_a <- svg_url("#123456")
url_b <- svg_url("#654321")
calls <- 0L
validate_counted <- function(url) { calls <<- calls + 1L; team_canvas_image(url) }

# Exact unchanged content is validated once; a byte-level edit is a miss.
cache <- team_canvas_image_cache(max_bytes = 1024L)
stopifnot(identical(team_canvas_image_cached(url_a, cache, validate_counted), url_a), calls == 1L)
stopifnot(identical(team_canvas_image_cached(url_a, cache, validate_counted), url_a), calls == 1L)
stopifnot(identical(team_canvas_image_cached(url_b, cache, validate_counted), url_b), calls == 2L)

# Invalid images are never cached, even after the same malicious content is
# submitted again. A later non-image field is also validated on a cache hit.
bad_url <- svg_url("url(https://example.invalid/image)")
fails <- function(expr) stopifnot(inherits(tryCatch(force(expr), error = identity), "error"))
fails(team_canvas_image_cached(bad_url, cache, validate_counted))
fails(team_canvas_image_cached(bad_url, cache, validate_counted))
stopifnot(calls == 4L)

node <- list(id = "plot_pca", label = "PCA", x = 10, y = 10, width = 300, height = 250,
  visual = list(), finished = list(url = url_a, createdAt = "2026-10-28T03:20:10Z", stale = FALSE))
state <- list(version = "1", libraryHidden = FALSE, nodes = list(node))
stopifnot(identical(team_canvas_validate(state, image_cache = cache)$nodes[[1]]$finished$url, url_a), calls == 4L)
stopifnot(identical(team_canvas_validate(state, image_cache = cache)$nodes[[1]]$finished$url, url_a), calls == 4L)
tampered <- state; tampered$nodes[[1]]$x <- -1
fails(team_canvas_validate(tampered, image_cache = cache))
stopifnot(calls == 4L)

# The bound evicts least-recently-used entries; an oversized single item is
# validated normally but is not retained. A digest collision can never hit:
# exact string comparison forces validation of the second candidate.
small <- team_canvas_image_cache(max_bytes = nchar(url_a, type = "bytes") + 1L)
invisible(team_canvas_image_cached(url_a, small, validate_counted))
invisible(team_canvas_image_cached(url_b, small, validate_counted))
stopifnot(small$bytes <= small$max_bytes, length(small$order) == 1L)

# The independent entry-count bound also evicts tiny snapshots and keeps the
# environment from growing through repeated cosmetic edits.
count_bounded <- team_canvas_image_cache(max_bytes = 1024^2, max_entries = 3L)
tiny_urls <- vapply(1:5, function(i) svg_url(sprintf("#%06x", i)), character(1))
before <- calls
for (url in tiny_urls) invisible(team_canvas_image_cached(url, count_bounded, validate_counted))
stopifnot(calls == before + 5L, length(count_bounded$order) == 3L,
  count_bounded$bytes <= count_bounded$max_bytes)
invisible(team_canvas_image_cached(tiny_urls[[1]], count_bounded, validate_counted))
stopifnot(calls == before + 6L, length(count_bounded$order) == 3L)

collision <- team_canvas_image_cache(hash = function(url) "forced-collision")
before <- calls
invisible(team_canvas_image_cached(url_a, collision, validate_counted))
invisible(team_canvas_image_cached(url_b, collision, validate_counted))
invisible(team_canvas_image_cached(url_a, collision, validate_counted))
stopifnot(calls == before + 2L)

# Separate session caches do not share prior validation results.
session_two <- team_canvas_image_cache()
before <- calls
invisible(team_canvas_image_cached(url_a, session_two, validate_counted))
stopifnot(calls == before + 1L, length(session_two$order) == 1L)

# The normal Shiny session-ended hook clears the retained image strings.
cleanup <- NULL
fake_session <- list(onSessionEnded = function(callback) cleanup <<- callback)
cleanup_cache <- team_canvas_image_cache()
invisible(team_canvas_image_cached(url_a, cleanup_cache))
stopifnot(length(cleanup_cache$order) == 1L, cleanup_cache$bytes > 0)
team_canvas_image_cache_on_session_end(fake_session, cleanup_cache)
cleanup()
stopifnot(length(cleanup_cache$order) == 0L, cleanup_cache$bytes == 0,
  length(ls(envir = cleanup_cache$entries, all.names = TRUE)) == 0L)

cat("PASS: Team canvas image cache is exact-content, bounded, failure-safe, and session-local\n")
