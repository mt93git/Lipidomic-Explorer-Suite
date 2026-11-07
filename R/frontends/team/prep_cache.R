# Team preparation cache (W9): two results a checkpoint's reopen repeats every
# time are kept on this server's disk, so reopening it (after a restart, or in
# another R process of the same server) does not repeat them unless something
# changed. Nothing else is reused: the canvas's structural validation always runs.
#
#   parse   the whole-matrix lipid name parse (R/global.R's parse_lipid_names_bulk),
#           stored after a live parse and read on a miss of the in-process memo;
#           keyed by that memo's key (names, mode, remaps, the parser's code and
#           lexicon) plus the context below.
#   svg     the security check of one saved figure (team_canvas_image: format,
#           encoding, size, and the SVG's XML, elements, attributes, styles and
#           references), for figures of a checkpoint being read (team_canvas_read).
#           Keyed by the sha256 of the exact figure, a fingerprint of the checking
#           code and of the policy it reads (team_canvas_limits), computed at each
#           use, plus the context. A hit means "this exact figure passed": the
#           image cache then holds exactly that figure, as after a live check.
#
# Context: the code version (every R file, the reference tables, R, the packages
# and system libraries involved; hashed once when this file is sourced at Team
# process start, so a process never hashes files deployed after it started; Classic
# skips it) and the locale (LC_CTYPE, LC_COLLATE, UTF-8).
#
# Storage follows the W8 card cache's rules: one folder per project (the project
# this session is bound to; nothing is stored without one), objects named by the
# sha256 of their kind, project and key, never a session token, auth token or URL
# (other than XML namespaces and PubMed source links) inside a stored object, size
# caps (values over 32 MiB in memory are never stored). It is local to this server,
# private to the app's user (folders owned by that user, not links, 0700, checked
# before every use; files 0600) and least recently used objects are evicted.
#
# Integrity: each object's header (kind, key, lengths, sha256 of the compressed
# body) is authenticated with HMAC-SHA256 under a random 32-byte secret kept outside
# the cache folder (LIPIDOMIC_PREP_CACHE_SECRET, or a 0600 key file), compared in
# constant time, and the body's sha256 is checked, before anything is decompressed
# or unserialized. Whoever holds the secret (this server, or anyone running as its
# user, who could change the app's code anyway) is trusted: memDecompress is bounded
# only by the serialized length that signed header declares (at most 128 MiB).
#
# Fail-open: a missing, corrupted, forged, oversized or unexpected object is deleted
# and the value is computed live; so is any error in this file (logging included).
# If the code version or the secret cannot be established the cache is off.

team_prep_cache_object_max_bytes <- 64 * 1024^2        # one stored object (compressed)
team_prep_cache_serialized_max_bytes <- 128 * 1024^2   # its value, serialized (signed header bound)
team_prep_cache_value_max_bytes <- 32 * 1024^2         # object.size() preflight: larger values are not stored
team_prep_cache_project_max_bytes <- 512 * 1024^2      # one project's folder
team_prep_cache_project_max_count <- 256L
team_prep_cache_total_max_bytes <- 2 * 1024^3          # every project on this server
team_prep_cache_tmp_max_age <- 600                     # seconds before a .tmp- leftover is removed

team_prep_cache_absolute <- function(path) {
  path <- path.expand(path)
  if (!grepl("^/", path)) path <- file.path(getwd(), path)
  gsub("/+$", "", gsub("/+", "/", path))
}
team_prep_cache_root <- function() {
  root <- Sys.getenv("LIPIDOMIC_PREP_CACHE_DIR", "")
  if (!nzchar(root)) root <- file.path(tools::R_user_dir("lipidomic-explorer", "cache"), "team-prep")
  team_prep_cache_absolute(root)
}
team_prep_cache_key_file <- function() {
  path <- Sys.getenv("LIPIDOMIC_PREP_CACHE_KEY_FILE", "")
  if (!nzchar(path)) path <- file.path(tools::R_user_dir("lipidomic-explorer", "config"), "team-prep-cache.key")
  team_prep_cache_absolute(path)
}

team_prep_cache_fingerprint <- function() {
  files <- sort(c(list.files("R", pattern = "[.]R$", recursive = TRUE, full.names = TRUE),
                  # data/ also holds runtime logs (ingestion_trace.log): reference tables only
                  list.files("data", pattern = "[.](csv|tsv|json|rds|xlsx)$", full.names = TRUE, recursive = TRUE)))
  if (!length(files)) stop("no app code found")
  pkgs <- vapply(c("jsonlite", "curl", "xml2", "digest", "tibble", "dplyr", "stringr", "stringi", "purrr", "rlang", "vctrs", "shiny"),
    function(p) tryCatch(as.character(utils::packageVersion(p)), error = function(e) ""), character(1))
  digest::digest(list(vapply(files, function(f) digest::digest(file = f, algo = "sha256"), character(1)),
    files, pkgs, team_prep_cache_libraries(), R.version.string), algo = "sha256")
}
# The libxml2 the figure check really runs on: xml2's reported version plus, where
# /proc/self/maps exists, the sha256 of each libxml2 shared object mapped into this
# process. Once per process; "" when unknown, which turns figure-check reuse off.
team_prep_cache_libxml2 <- local({
  id <- NULL
  function() {
    if (is.null(id)) id <<- tryCatch({
      version <- as.character(utils::getFromNamespace("libxml2_version", "xml2")())   # also loads libxml2
      maps <- if (file.exists("/proc/self/maps")) grep("/libxml2[.]so", readLines("/proc/self/maps", warn = FALSE), value = TRUE) else character()
      objects <- sort(unique(sub("^[^/]*", "", maps)))
      if (length(version) != 1L || !nzchar(version)) "" else
        paste(c(version, vapply(objects, function(f) digest::digest(file = f, algo = "sha256"), character(1))), collapse = " ")
    }, error = function(e) "")
    id
  }
})
team_prep_cache_libraries <- function()
  list(xml2 = team_prep_cache_libxml2(),
    curl = tryCatch(curl::curl_version()$version, error = function(e) ""),
    icu = tryCatch(stringi::stri_info()$ICU.version, error = function(e) ""),
    ext = as.list(extSoftVersion()))

# Per-process state: the code version (at source time, Team only) and the secret
# (on first use).
team_prep_cache_state <- local({
  s <- new.env(parent = emptyenv())
  team <- identical(tryCatch(lipidomic_interface(), error = function(e) ""), "team")
  s$code <- if (team) tryCatch(team_prep_cache_fingerprint(), error = function(e) NULL)
  s$secret <- NULL
  s
})

team_prep_cache_log <- function(...) try(message("[prep-cache] ", ...), silent = TRUE)

# A private folder, checked before every use: not a link, owned by this process's
# user, mode 0700 (repaired).
team_prep_cache_private_dir <- function(dir, create = TRUE) {
  if (!dir.exists(dir)) {
    if (!create) return(FALSE)
    if (!dir.create(dir, recursive = TRUE, mode = "0700") && !dir.exists(dir)) return(FALSE)
  }
  if (nzchar(Sys.readlink(dir))) return(FALSE)
  info <- file.info(dir, extra_cols = TRUE)
  if (!isTRUE(info$isdir) || !identical(as.character(info$uname), Sys.info()[["effective_user"]])) return(FALSE)
  if (info$mode != as.octmode("700")) {
    Sys.chmod(dir, "0700", use_umask = FALSE)
    if (file.info(dir)$mode != as.octmode("700")) return(FALSE)
  }
  TRUE
}

# The HMAC secret: 32 random bytes, from LIPIDOMIC_PREP_CACHE_SECRET (64 hex digits)
# or a 0600 key file outside the cache folder, created atomically (link(2) fails
# when another process created it first; then that one is used).
team_prep_cache_secret <- function() {
  s <- team_prep_cache_state
  if (!is.null(s$secret)) return(if (is.raw(s$secret)) s$secret else NULL)
  s$secret <- FALSE
  hex <- Sys.getenv("LIPIDOMIC_PREP_CACHE_SECRET", "")
  secret <- if (nzchar(hex)) {
    if (grepl("^[0-9a-fA-F]{64}$", hex)) as.raw(strtoi(substring(hex, seq(1, 63, 2), seq(2, 64, 2)), 16L)) else NULL
  } else tryCatch({
    path <- team_prep_cache_key_file(); dir <- dirname(path)
    if (startsWith(paste0(dir, "/"), paste0(team_prep_cache_root(), "/"))) stop("key file inside the cache folder")
    if (!team_prep_cache_private_dir(dir)) stop("key folder is not private")
    if (!file.exists(path)) {
      random <- file("/dev/urandom", "rb", raw = TRUE); bytes <- tryCatch(readBin(random, "raw", 32L), finally = close(random))
      if (length(bytes) != 32L) stop("no random source")
      tmp <- tempfile(".key-", tmpdir = dir); on.exit(unlink(tmp), add = TRUE)
      writeBin(bytes, tmp); Sys.chmod(tmp, "0600", use_umask = FALSE)
      suppressWarnings(file.link(tmp, path))
    }
    info <- file.info(path, extra_cols = TRUE)
    if (nzchar(Sys.readlink(path)) || !identical(as.character(info$uname), Sys.info()[["effective_user"]]) || info$size != 32) stop("unsafe key file")
    if (info$mode != as.octmode("600")) { Sys.chmod(path, "0600", use_umask = FALSE); if (file.info(path)$mode != as.octmode("600")) stop("key file is not private") }
    readBin(path, "raw", 32L)
  }, error = function(e) { team_prep_cache_log("off: ", conditionMessage(e)); NULL })
  if (is.raw(secret) && length(secret) == 32L) s$secret <- secret
  if (is.raw(s$secret)) s$secret else NULL
}

team_prep_cache_enabled <- function()
  !identical(Sys.getenv("LIPIDOMIC_PREP_CACHE", "1"), "0") && !is.null(team_prep_cache_state$code) &&
    identical(tryCatch(lipidomic_interface(), error = function(e) ""), "team")

# What every key includes besides its own inputs.
team_prep_cache_context <- function()
  list(code = team_prep_cache_state$code, ctype = Sys.getlocale("LC_CTYPE"), collate = Sys.getlocale("LC_COLLATE"),
    utf8 = isTRUE(l10n_info()[["UTF-8"]]))

# The project the current session is bound to (project_library.R), or NULL.
team_prep_cache_project <- function(session = shiny::getDefaultReactiveDomain()) {
  if (is.null(session) || !team_prep_cache_enabled()) return(NULL)
  bound <- tryCatch(session$userData$team_library_bound_project, error = function(e) NULL)
  project <- if (is.function(bound)) tryCatch(bound(), error = function(e) NULL)
  if (is.character(project) && length(project) == 1L && !is.na(project) && grepl("^[0-9a-f-]{36}$", project)) project else NULL
}

team_prep_cache_path <- function(project, kind, key) {
  if (!is.character(project) || length(project) != 1L || !grepl("^[0-9a-f-]{36}$", project)) return(NULL)
  # The project is both the folder and part of the hashed name: no two projects
  # can ever address one object.
  file.path(team_prep_cache_root(), project,
    digest::digest(paste0("team-prep:", kind, ":", project, ":", key), algo = "sha256", serialize = FALSE))
}

# Stored objects carry no secrets or addresses: not this session's token, no auth
# token, no Shiny session path and no URL except XML namespace names and PubMed
# source links (https://pubmed.ncbi.nlm.nih.gov/<pmid>/). Fixed-string searches
# first (a regex over a few MB of SVG is slow); patterns only near each occurrence.
team_prep_cache_safe <- function(bytes, session = shiny::getDefaultReactiveDomain()) {
  token <- tryCatch(session$token, error = function(e) NULL)
  if (is.character(token) && length(token) == 1L && nzchar(token) && length(grepRaw(token, bytes, fixed = TRUE))) return(FALSE)
  for (marker in c("access_token", "refresh_token", "Bearer ", "bearer ")) if (length(grepRaw(marker, bytes, fixed = TRUE))) return(FALSE)
  for (at in grepRaw("session/", bytes, fixed = TRUE, all = TRUE))
    if (length(grepRaw("^session/[0-9a-f]{16,}", bytes[at:min(length(bytes), at + 40L)]))) return(FALSE)
  for (at in grepRaw("://", bytes, fixed = TRUE, all = TRUE)) {
    window <- bytes[max(1L, at - 32L):min(length(bytes), at + 2050L)]
    for (u in grepRaw("[[:alpha:]][[:alnum:]+.-]*://[[:graph:]]*", window, all = TRUE, value = TRUE)) {
      u <- rawToChar(u)
      if (!grepl("^http://www\\.w3\\.org/[A-Za-z0-9/._-]*([^A-Za-z0-9/._-].*)?$", u, useBytes = TRUE) &&
          !grepl("^https://pubmed\\.ncbi\\.nlm\\.nih\\.gov/[1-9][0-9]{0,9}/$", u, useBytes = TRUE)) return(FALSE)
    }
  }
  TRUE
}

# Constant-time comparison of two hex digests.
team_prep_cache_same_mac <- function(a, b) {
  a <- charToRaw(a); b <- charToRaw(b)
  length(a) == length(b) && Reduce(bitwOr, as.integer(xor(a, b)), 0L) == 0L
}

# One object: "LXPC3 <hmac>\n", a one-line JSON header (version, kind, key,
# serialized length n, compressed length z, sha256 b of the compressed body; the
# HMAC covers exactly this line) and the gzip-compressed serialized value.
team_prep_cache_hmac <- function(secret, bytes) digest::hmac(secret, bytes, algo = "sha256", serialize = FALSE)
team_prep_cache_write <- function(path, kind, key, value, secret) {
  plain <- serialize(value, NULL); n <- length(plain)
  if (n > team_prep_cache_serialized_max_bytes) stop("value too large")
  if (!team_prep_cache_safe(plain)) return("value holds a token or URL")
  body <- memCompress(plain, type = "gzip"); rm(plain)
  if (length(body) > team_prep_cache_object_max_bytes) return(paste(length(body), "bytes compressed"))
  header <- charToRaw(paste0(jsonlite::toJSON(list(v = 3L, kind = kind, key = key, n = n, z = length(body),
    b = digest::digest(body, algo = "sha256", serialize = FALSE)), auto_unbox = TRUE), "\n"))
  tmp <- tempfile(".tmp-", tmpdir = dirname(path)); on.exit(unlink(tmp), add = TRUE)
  con <- file(tmp, "wb"); tryCatch({
    writeBin(charToRaw(paste0("LXPC3 ", team_prep_cache_hmac(secret, header), "\n")), con); writeBin(header, con); writeBin(body, con)
  }, finally = close(con))
  Sys.chmod(tmp, "0600", use_umask = FALSE)
  # Atomic: another process reads the old object or the whole new one.
  if (!file.rename(tmp, path)) stop("rename failed")
  TRUE
}
team_prep_cache_decode <- function(bytes, kind, key, secret) {
  first <- match(as.raw(10L), bytes[seq_len(min(length(bytes), 80L))])
  if (is.na(first) || first != 71L || !identical(rawToChar(bytes[1:6]), "LXPC3 ")) stop("not an object")
  second <- first + match(as.raw(10L), bytes[(first + 1L):min(length(bytes), first + 1024L)])
  if (is.na(second)) stop("not an object")
  header <- bytes[(first + 1L):second]
  if (!team_prep_cache_same_mac(rawToChar(bytes[7:70]), team_prep_cache_hmac(secret, header))) stop("bad signature")
  # Authenticated header: written by this server with this secret.
  h <- jsonlite::fromJSON(rawToChar(header))
  if (!is.list(h) || !identical(h$v, 3L) || !identical(h$kind, kind) || !identical(h$key, key) ||
      !is.numeric(h$n) || h$n > team_prep_cache_serialized_max_bytes || !identical(as.numeric(h$z), as.numeric(length(bytes) - second)))
    stop("header mismatch")
  body <- bytes[-seq_len(second)]
  if (!identical(digest::digest(body, algo = "sha256", serialize = FALSE), h$b)) stop("bad body")
  plain <- memDecompress(body, type = "gzip")
  if (length(plain) != h$n) stop("length mismatch")
  unserialize(plain)
}

# A stored object is list(input, value): the exact input it was computed from (a
# hit must be given an identical input, and an offline check can recompute every
# stored value from it) and the value.
team_prep_cache_get <- function(project, kind, key, input, check) {
  secret <- team_prep_cache_secret(); path <- team_prep_cache_path(project, kind, key)
  if (is.null(secret) || is.null(path) || !team_prep_cache_private_dir(team_prep_cache_root(), create = FALSE) ||
      !team_prep_cache_private_dir(dirname(path), create = FALSE) || !file.exists(path)) return(NULL)
  value <- tryCatch({
    size <- file.size(path)
    if (is.na(size) || size > team_prep_cache_object_max_bytes + 4096) stop("oversized")
    team_prep_cache_decode(suppressWarnings(readBin(path, "raw", size)), kind, key, secret)
  }, error = function(e) structure(conditionMessage(e), class = "team_prep_cache_bad"))
  if (!inherits(value, "team_prep_cache_bad") && !(is.list(value) && identical(names(value), c("input", "value")) && identical(value$input, input)))
    value <- structure("input differs", class = "team_prep_cache_bad")
  if (!inherits(value, "team_prep_cache_bad") && !isTRUE(tryCatch(check(value$value), error = function(e) FALSE)))
    value <- structure("unexpected value", class = "team_prep_cache_bad")
  if (inherits(value, "team_prep_cache_bad")) {
    msg <- unclass(value)
    if (!msg %in% c("oversized", "not an object", "bad signature", "bad body", "input differs", "unexpected value", "header mismatch", "length mismatch")) msg <- "unreadable"
    team_prep_cache_log("discarded ", kind, " ", substr(key, 1L, 10L), " (", msg, ")")
    unlink(path)
    return(NULL)
  }
  try(Sys.setFileTime(path, Sys.time()), silent = TRUE)   # least recently used goes first
  value$value
}

# Stores a value unless an object for its key is already on disk (the same key
# always means the same value) or it is too large.
team_prep_cache_put <- function(project, kind, key, input, value) {
  secret <- team_prep_cache_secret(); path <- team_prep_cache_path(project, kind, key)
  if (is.null(secret) || is.null(path)) return(invisible(FALSE))
  size <- as.numeric(utils::object.size(input)) + as.numeric(utils::object.size(value))
  if (size > team_prep_cache_value_max_bytes) { team_prep_cache_log("not stored ", kind, ": ", round(size), " bytes in memory"); return(invisible(FALSE)) }
  ok <- tryCatch(suppressWarnings({
    dir <- dirname(path)
    if (!team_prep_cache_private_dir(dirname(dir)) || !team_prep_cache_private_dir(dir)) stop("cache folder is not private")
    if (file.exists(path)) TRUE else {
      done <- team_prep_cache_write(path, kind, key, list(input = input, value = value), secret)
      if (!isTRUE(done)) { team_prep_cache_log("refused ", kind, ": ", done); FALSE } else { team_prep_cache_evict(dir); TRUE }
    }
  }), error = function(e) { team_prep_cache_log("write failed ", kind, ": ", conditionMessage(e)); FALSE })
  invisible(isTRUE(ok))
}

# Least recently used objects go first: per project by count and bytes, then the
# whole cache by bytes. Leftover .tmp- files (a write that died) older than ten
# minutes are removed; younger ones (a write in progress) count toward the quota.
team_prep_cache_evict <- function(dir) {
  sweep <- function(d) {
    tmp <- list.files(d, pattern = "^[.]tmp-", all.files = TRUE, full.names = TRUE, no.. = TRUE)
    if (!length(tmp)) return(c(count = 0, bytes = 0))
    info <- file.info(tmp, extra_cols = FALSE)
    old <- difftime(Sys.time(), info$mtime, units = "secs") > team_prep_cache_tmp_max_age
    unlink(tmp[old])
    c(count = sum(!old), bytes = sum(info$size[!old], na.rm = TRUE))
  }
  trim <- function(files, max_count, max_bytes) {
    if (!length(files)) return(invisible())
    info <- file.info(files, extra_cols = FALSE)
    o <- order(info$mtime, decreasing = TRUE)
    keep <- seq_along(o) <= max_count & cumsum(info$size[o]) <= max_bytes
    unlink(files[o][!keep])
  }
  objects <- function(d) list.files(d, pattern = "^[0-9a-f]{64}$", full.names = TRUE, recursive = FALSE)
  pending <- sweep(dir)
  trim(objects(dir), team_prep_cache_project_max_count - pending[["count"]], team_prep_cache_project_max_bytes - pending[["bytes"]])
  dirs <- list.dirs(dirname(dir), recursive = FALSE)
  pending_all <- Reduce(`+`, lapply(dirs, sweep), c(count = 0, bytes = 0))
  trim(unlist(lapply(dirs, objects), use.names = FALSE), .Machine$integer.max, team_prep_cache_total_max_bytes - pending_all[["bytes"]])
}

# ---- parse ------------------------------------------------------------------

# The parse table's shape, from parsing one name with the live parser (once per process).
team_prep_cache_parse_shape <- local({
  shape <- NULL
  function() {
    if (is.null(shape)) {
      probe <- environment(parse_lipid_names_bulk)$parse("PC 34:1")
      shape <<- list(class = class(probe), names = names(probe), types = vapply(probe, typeof, character(1)))
    }
    shape
  }
})
team_prep_cache_parse_ok <- function(v, names) {
  shape <- team_prep_cache_parse_shape()
  is.data.frame(v) && identical(class(v), shape$class) && identical(names(v), shape$names) &&
    identical(vapply(v, typeof, character(1)), shape$types) && nrow(v) == length(names) &&
    identical(v$Lipid_Name, as.character(names))
}

# R/global.R's parse memo calls this on a miss of its in-process memo, with its key
# and input list(names, mode, remaps): with two arguments it returns the stored
# parse or NULL; with three (after a live parse) it stores the value. Never fails.
team_prep_cache_parse_store <- function(key, input, value) {
  reading <- missing(value)
  tryCatch({
    project <- team_prep_cache_project()
    if (is.null(project)) return(NULL)
    full <- digest::digest(list(v = 3L, memo = key, context = team_prep_cache_context()), algo = "sha256")
    if (reading) {
      hit <- team_prep_cache_get(project, "parse", full, input, function(v) team_prep_cache_parse_ok(v, input[[1L]]))
      team_prep_cache_log(if (is.null(hit)) "miss" else "hit", " parse ", substr(full, 1L, 10L), " ", length(input[[1L]]), " names")
      return(hit)
    }
    team_prep_cache_put(project, "parse", full, input, value)
    NULL
  }, error = function(e) { team_prep_cache_log("parse skipped: ", conditionMessage(e)); NULL })
}

# ---- svg --------------------------------------------------------------------

# The figure check's code and the policy it reads, fingerprinted at each use.
team_prep_cache_svg_policy <- function() {
  code <- lapply(c("team_canvas_image", "team_canvas_svg", "team_canvas_png", "team_canvas_base64", "team_canvas_string", "team_canvas_fail"),
    function(name) { f <- get(name, mode = "function"); list(name, formals(f), body(f)) })
  digest::digest(list(code, get("team_canvas_limits"), team_prep_cache_libraries()), algo = "sha256")
}

# team_canvas_read's image cache validates figures it has not seen with this: the
# stored result for exactly this figure under this checker and policy, else the
# live team_canvas_image() (whose errors reach the caller), stored once it passes.
# It returns the figure, as team_canvas_image() does.
team_prep_cache_image_validate <- function(url) {
  found <- tryCatch({
    project <- team_prep_cache_project()
    if (is.null(project) || !is.character(url) || length(url) != 1L || is.na(url)) NULL
    else if (!nzchar(team_prep_cache_libxml2())) { team_prep_cache_log("svg reuse off: libxml2 unknown"); NULL } else {
      key <- digest::digest(list(v = 3L, figure = digest::digest(url, algo = "sha256", serialize = FALSE),
        policy = team_prep_cache_svg_policy(), context = team_prep_cache_context()), algo = "sha256")
      hit <- team_prep_cache_get(project, "svg", key, url, function(v) identical(v, TRUE))
      team_prep_cache_log(if (is.null(hit)) "miss" else "hit", " svg ", substr(key, 1L, 10L), " ", nchar(url, type = "bytes"), " bytes")
      list(project = project, key = key, hit = !is.null(hit))
    }
  }, error = function(e) { team_prep_cache_log("svg skipped: ", conditionMessage(e)); NULL })
  if (isTRUE(found$hit)) return(url)
  validated <- team_canvas_image(url)
  if (!is.null(found) && identical(validated, url))
    tryCatch(team_prep_cache_put(found$project, "svg", found$key, url, TRUE), error = function(e) NULL)
  validated
}

# ---- pca --------------------------------------------------------------------

# The shared PCA (R/modules/1_shared_data_module.R, pca_results' run_pca_calc) asks
# this before computing, with its exact inputs: the matrix it is about to analyse
# (already filtered to the lipid set), the PCA settings, the sample metadata and the
# lipid annotation it joins. With one argument it returns the stored result or NULL;
# with two (the computed result, from its exit) it stores it. Keyed by the sha256 of
# those inputs plus the context and the numerical libraries (prcomp's LAPACK/BLAS,
# nipals); a hit must be given identical inputs (team_prep_cache_get) and is the
# exact value computed from them. Never fails: NULL means compute.
team_prep_cache_pca_libraries <- function()
  list(la = tryCatch(La_version(), error = function(e) ""), la_library = tryCatch(La_library(), error = function(e) ""),
    blas = tryCatch(extSoftVersion()[["BLAS"]], error = function(e) ""),
    pkgs = vapply(c("stats", "nipals", "tidyr", "dplyr", "tibble"), function(p) tryCatch(as.character(utils::packageVersion(p)), error = function(e) ""), character(1)))
team_prep_cache_pca_ok <- function(v)
  is.list(v) && all(c("score_df", "replicate_score_df", "load_df", "var_PC") %in% names(v)) &&
    is.data.frame(v$score_df) && is.data.frame(v$load_df) && is.numeric(v$var_PC)
team_prep_cache_pca <- function(input, value) {
  reading <- missing(value)
  tryCatch({
    project <- team_prep_cache_project()
    if (is.null(project) || (!reading && !team_prep_cache_pca_ok(value))) return(NULL)
    key <- digest::digest(list(v = 1L, input = input, libraries = team_prep_cache_pca_libraries(), context = team_prep_cache_context()), algo = "sha256")
    if (reading) {
      hit <- team_prep_cache_get(project, "pca", key, input, team_prep_cache_pca_ok)
      team_prep_cache_log(if (is.null(hit)) "miss" else "hit", " pca ", substr(key, 1L, 10L))
      return(hit)
    }
    team_prep_cache_put(project, "pca", key, input, value)
    NULL
  }, error = function(e) { team_prep_cache_log("pca skipped: ", conditionMessage(e)); NULL })
}
