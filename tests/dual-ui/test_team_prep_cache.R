# Team preparation cache (R/frontends/team/prep_cache.R). Two things are reused:
# the whole-matrix lipid parse, and the per-figure SVG security check of a canvas
# being read; the canvas's structural validation always runs live. Checks: a reused
# parse is identical() and byte-identical to a live one, and a canvas read with
# reused figure checks equals a live read (state and image cache); every key input
# (names, mode, remaps, lexicon, code version, locale, figure bytes, checker policy)
# invalidates; corrupted, forged (bad HMAC or body), oversized (decompression bomb),
# foreign or unexpected objects fall back to live; any internal error, including a
# failing logger, still parses; nothing is stored without a bound project, in
# Classic (which never fingerprints), or above the in-memory preflight; no token or
# URL is stored; folders are private; caps evict least recently used objects and
# stale .tmp- files; an evicted object is written again; two processes, one after
# the other or at the same time, share the cache.
# Optional: Rscript tests/dual-ui/test_team_prep_cache.R checkpoint.zip [cache-dir]
#   checkpoint.zip  also checks its real canvas and dataset, and times the figure checks;
#   cache-dir       recomputes EVERY object in a live server's cache folder from its
#                   stored input and requires the live value to be byte-identical
#                   (uses that server's secret: LIPIDOMIC_PREP_CACHE_KEY_FILE/SECRET or the default).
args <- commandArgs(trailingOnly = TRUE)
live_key_file <- Sys.getenv("LIPIDOMIC_PREP_CACHE_KEY_FILE", "")
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_COMPANION_AI = "0")
work <- tempfile("prep-cache-test-"); dir.create(work, mode = "0700")
cache_root <- file.path(work, "cache"); key_file <- file.path(work, "keys", "team-prep-cache.key")
Sys.setenv(LIPIDOMIC_PREP_CACHE_DIR = cache_root, LIPIDOMIC_PREP_CACHE_KEY_FILE = key_file)
Sys.unsetenv("LIPIDOMIC_PREP_CACHE_SECRET")
suppressPackageStartupMessages(source("R/global.R"))
stopifnot(is.function(team_prep_cache_parse_store), is.function(team_prep_cache_image_validate), is.character(team_prep_cache_state$code))
local({
same <- function(a, b) identical(a, b) && identical(serialize(a, NULL), serialize(b, NULL))
fails <- function(expr) stopifnot(inherits(tryCatch(force(expr), error = identity), "error"))
project <- "11111111-1111-4111-8111-111111111111"; other <- "22222222-2222-4222-8222-222222222222"
session_for <- function(p, token = "sess-token-3f9a1c") { s <- new.env(); s$token <- token; s$userData <- new.env(); s$userData$team_library_bound_project <- function() p; s }
in_project <- function(p, expr, token = "sess-token-3f9a1c") shiny::withReactiveDomain(session_for(p, token), expr)
objects <- function(p = project) list.files(file.path(cache_root, p), pattern = "^[0-9a-f]{64}$", full.names = TRUE)
kind_of <- function(f) { b <- readBin(f, "raw", 1024L); nl <- which(b == as.raw(10L)); jsonlite::fromJSON(rawToChar(b[(nl[1] + 1L):(nl[2] - 1L)]))$kind }
count_kind <- function(k, p = project) sum(vapply(objects(p), kind_of, "") == k)
memo <- environment(team_parse_lipid_names_memo); wrapper <- environment(parse_lipid_names_bulk); parse <- wrapper$parse
invisible(team_prep_cache_parse_shape())   # its one-name probe is not counted below
reset_memo <- function() { rm(list = ls(memo$memo), envir = memo$memo); assign("keys", character(), envir = memo); assign("sizes", numeric(), envir = memo) }
# Count parses without changing the memo's key: the memo fingerprints its parser and
# what the parser captures, so the counter lives outside it (an option).
makeActiveBinding("calls", function(v) if (missing(v)) getOption("prep_cache_test_calls", 0L) else options(prep_cache_test_calls = v), environment())
counting <- local(function(...) { options(prep_cache_test_calls = getOption("prep_cache_test_calls", 0L) + 1L); parse(...) },
  envir = list2env(list(parse = parse), parent = globalenv()))
assign("parse", counting, envir = wrapper)
on.exit(assign("parse", parse, envir = wrapper), add = TRUE)
# A process restart: the in-process memo is gone, the disk is not.
cold <- function(expr) { reset_memo(); calls <<- 0L; force(expr) }
secret <- function() team_prep_cache_secret()
# An object as team_prep_cache_write signs it (for forging tests).
encode <- function(kind, key, value, key_secret = secret()) {
  f <- tempfile(tmpdir = work); dir.create(f); p <- file.path(f, "o")
  stopifnot(isTRUE(team_prep_cache_write(p, kind, key, value, key_secret))); b <- readBin(p, "raw", file.size(p)); unlink(f, recursive = TRUE); b }
lines_of <- function(b) { nl <- which(b == as.raw(10L)); list(mac = rawToChar(b[7:70]), header = b[(nl[1] + 1L):nl[2]], body = b[-seq_len(nl[2])]) }

names_from <- function(path) {
  sheet <- readxl::read_excel(path, sheet = 1)
  col <- intersect(c("Lipid_Name", "Lipid Name", "Lipids", "Lipid", "Compound", "Feature"), names(sheet))
  as.character(sheet[[if (length(col)) col[[1]] else 1L]])
}
x <- names_from("demo_data/demo_global_lipidomics.xlsx"); stopifnot(length(x) >= 50L)
fresh <- parse(x)

# ---- parse: miss, then hit after a restart (no parse at all), byte-identical
a <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(a, fresh), length(objects()) == 1L)
b <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, same(b, fresh))
b2 <- in_project(project, parse_lipid_names_bulk(x)); stopifnot(calls == 0L, same(b2, fresh))   # a hit also fills the memo
stopifnot(file.info(cache_root)$mode == as.octmode("700"), file.info(file.path(cache_root, project))$mode == as.octmode("700"),
  all(file.info(objects())$mode == as.octmode("600")), file.info(key_file)$mode == as.octmode("600"), file.info(key_file)$size == 32)

# ---- parse invalidation, one key input at a time: names, mode, remaps, lexicon, code version, locale
y <- x; y[[7]] <- "PC 99:9"
r <- cold(in_project(project, parse_lipid_names_bulk(y))); stopifnot(calls == 1L, same(r, parse(y)))
r <- cold(in_project(project, parse_lipid_names_bulk(x, mode = "Lipid Mediators"))); stopifnot(calls == 1L, same(r, parse(x, mode = "Lipid Mediators")))
remaps <- list("PC 34:1" = "Glycerophospholipids")
r <- cold(in_project(project, parse_lipid_names_bulk(x, custom_remaps = remaps))); stopifnot(calls == 1L, same(r, parse(x, custom_remaps = remaps)))
old_map <- class_map; class_map[["ZZ"]] <<- "Test lexicon entry"
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(r, parse(x)))
class_map <<- old_map
real_code <- team_prep_cache_state$code
team_prep_cache_state$code <<- paste(rev(strsplit(real_code, "")[[1]]), collapse = "")
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(r, fresh))
team_prep_cache_state$code <<- real_code
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, same(r, fresh))
old_collate <- Sys.getlocale("LC_COLLATE"); alt <- if (identical(old_collate, "C")) "C.UTF-8" else "C"
locale_ok <- nzchar(suppressWarnings(Sys.setlocale("LC_COLLATE", alt))); Sys.setlocale("LC_COLLATE", old_collate)
if (locale_ok) {
  # a warm process whose locale changes: its memo hit is never written under the new locale
  n <- length(objects())
  invisible(in_project(project, parse_lipid_names_bulk(x)))                 # memo warm (old locale)
  Sys.setlocale("LC_COLLATE", alt); calls <- 0L
  r <- in_project(project, parse_lipid_names_bulk(x)); stopifnot(calls == 0L, length(objects()) == n)   # memo hit, nothing stored
  r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(r, parse(x)), length(objects()) == n + 1L)   # new locale: its own key
  Sys.setlocale("LC_COLLATE", old_collate)
  r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, same(r, fresh))
} else message("locale steps skipped: cannot set LC_COLLATE=", alt)
stopifnot(length(objects()) == 6L + locale_ok)

# ---- a memo hit never writes: another project misses once, then stores its own
reset_memo(); calls <- 0L
invisible(in_project(project, parse_lipid_names_bulk(x))); invisible(in_project(other, parse_lipid_names_bulk(x)))
stopifnot(calls == 0L, length(objects(other)) == 0L)
r <- cold(in_project(other, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(r, fresh), length(objects(other)) == 1L)
r <- cold(in_project(other, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, same(r, fresh))

# ---- scope: no project, Classic, switched off: never the stored object, nothing written
n <- length(objects()); n_other <- length(objects(other))
r <- cold(parse_lipid_names_bulk(x)); stopifnot(calls == 1L, same(r, fresh))
r <- cold(in_project(NULL, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(r, fresh))
Sys.setenv(LIPIDOMIC_INTERFACE = "classic")
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(r, fresh))
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
Sys.setenv(LIPIDOMIC_PREP_CACHE = "0"); r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L); Sys.unsetenv("LIPIDOMIC_PREP_CACHE")
stopifnot(length(objects()) == n, length(objects(other)) == n_other)

# ---- Classic never fingerprints; a Team code version that cannot be computed turns the cache off
listed <- 0L
assign("list.files", function(...) { listed <<- listed + 1L; base::list.files(...) }, envir = globalenv())
Sys.setenv(LIPIDOMIC_INTERFACE = "classic"); source("R/frontends/team/prep_cache.R")
rm("list.files", envir = globalenv()); Sys.setenv(LIPIDOMIC_INTERFACE = "team")
stopifnot(listed == 0L, is.null(team_prep_cache_state$code))
owd <- setwd(work); suppressMessages(source(file.path(owd, "R/frontends/team/prep_cache.R"))); setwd(owd)
stopifnot(is.null(team_prep_cache_state$code))
r <- cold(in_project(project, parse_lipid_names_bulk(y))); stopifnot(calls == 1L, same(r, parse(y)), length(objects()) == n)
suppressMessages(source("R/frontends/team/prep_cache.R")); stopifnot(identical(team_prep_cache_state$code, real_code))
invisible(team_prep_cache_parse_shape())

# ---- fail-open: any internal error, a failing logger, a failing store itself
for (broken in c("team_prep_cache_path", "team_prep_cache_get", "team_prep_cache_put", "team_prep_cache_context", "team_prep_cache_secret")) {
  saved <- get(broken, globalenv()); assign(broken, function(...) stop("injected"), envir = globalenv())
  r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x))))
  assign(broken, saved, envir = globalenv())
  if (!same(r, fresh)) stop("parse failed with a broken ", broken)
}
assign("message", function(...) stop("logger down"), envir = globalenv())
saved <- team_prep_cache_get; team_prep_cache_get <<- function(...) stop("injected")   # its handler logs
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(r, fresh))
team_prep_cache_get <<- saved
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, same(r, fresh))   # hit logged through a failing logger
rm("message", envir = globalenv())
saved <- team_prep_cache_parse_store; team_prep_cache_parse_store <<- function(...) stop("store down")   # global.R's guard
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, same(r, fresh))
team_prep_cache_parse_store <<- saved
assign("Sys.setFileTime", function(...) stop("injected"), envir = globalenv())   # the hit's LRU refresh
r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x)))); rm("Sys.setFileTime", envir = globalenv())
stopifnot(calls == 0L, same(r, fresh))

# ---- read and permission errors; folders checked before every use
parse_key <- function(names) digest::digest(list(v = 3L, memo = digest::digest(list(names, "Global Lipidomics", list(), memo$deps(wrapper$parse),
  get0("class_map", globalenv()), get0("REVERSE_HYPERCLASS_MAP", globalenv())), algo = "sha256"), context = team_prep_cache_context()), algo = "sha256")
k <- parse_key(x); p <- team_prep_cache_path(project, "parse", k); stopifnot(file.exists(p))
Sys.chmod(p, "000")
r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x)))); stopifnot(same(r, fresh))
if (file.exists(p)) Sys.chmod(p, "0600")
unlink(p); dir.create(p)   # a folder where the object should be
r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x)))); stopifnot(calls == 1L, same(r, fresh))
unlink(p, recursive = TRUE)
saved <- team_prep_cache_private_dir; team_prep_cache_private_dir <<- function(dir, create = TRUE) TRUE
pdir <- file.path(cache_root, project); Sys.chmod(pdir, "0500")   # unwritable
r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x)))); stopifnot(calls == 1L, same(r, fresh), !file.exists(p))
Sys.chmod(pdir, "0700"); team_prep_cache_private_dir <<- saved
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(file.exists(p))
Sys.chmod(cache_root, "0755")   # changed after earlier use: re-checked and repaired
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, same(r, fresh), file.info(cache_root)$mode == as.octmode("700"))
Sys.chmod(pdir, "0777")
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, file.info(pdir)$mode == as.octmode("700"))
link_root <- file.path(work, "linked"); file.symlink(cache_root, link_root)
Sys.setenv(LIPIDOMIC_PREP_CACHE_DIR = link_root)
r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x)))); stopifnot(calls == 1L, same(r, fresh))   # a linked root is never used
Sys.setenv(LIPIDOMIC_PREP_CACHE_DIR = cache_root)
stopifnot(identical(team_prep_cache_root(), cache_root))
Sys.setenv(LIPIDOMIC_PREP_CACHE_DIR = paste0(cache_root, "//")); stopifnot(identical(team_prep_cache_root(), cache_root)); Sys.setenv(LIPIDOMIC_PREP_CACHE_DIR = cache_root)

# ---- an evicted or removed object is written again by the same process
unlink(p); r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 1L, file.exists(p))
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, same(r, fresh))

# ---- corrupted, forged and oversized objects fall back to a live parse and are deleted
good <- readBin(p, "raw", file.size(p))
input <- list(x, "Global Lipidomics", list())
forge_mac <- function(header, body, mac) c(charToRaw(paste0("LXPC3 ", mac, "\n")), header, body)
L <- lines_of(good)
evil <- encode("parse", k, list(input = input, value = fresh[1:3, ])); E <- lines_of(evil)
corrupt <- list(
  flipped_body = { z <- good; z[length(z) - 10L] <- xor(z[length(z) - 10L], as.raw(1L)); z },
  flipped_mac = { z <- good; z[10] <- as.raw(if (z[10] == charToRaw("a")) 98L else 97L); z },
  truncated = good[seq_len(length(good) - 100L)],
  empty = raw(0),
  garbage = as.raw(sample(0:255, 4096, TRUE)),
  swapped_body = forge_mac(L$header, E$body, L$mac),                                   # signed header, another body
  plain_sha = forge_mac(E$header, E$body, digest::digest(E$header, algo = "sha256", serialize = FALSE)),
  other_secret = encode("parse", k, list(input = input, value = fresh[1:3, ]), as.raw(rev(seq_len(32)))))
for (nm in names(corrupt)) {
  writeBin(corrupt[[nm]], p)
  r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x))))
  if (calls != 1L || !same(r, fresh)) stop("bad object not replaced by a live parse: ", nm)
  r <- cold(in_project(project, parse_lipid_names_bulk(x))); if (calls != 0L || !same(r, fresh)) stop("not stored again after: ", nm)
}
# well-signed objects that do not belong: a foreign input, a wrong shape, another key or kind
bad_values <- list(
  foreign_input = list(input = list(y, "Global Lipidomics", list()), value = fresh),
  short = list(input = input, value = fresh[1:3, ]),
  renamed = list(input = input, value = stats::setNames(fresh, toupper(names(fresh)))),
  retyped = list(input = input, value = { f <- fresh; f$Total_DB <- as.character(f$Total_DB); f }),
  plain_df = list(input = input, value = as.data.frame(fresh)))
for (nm in names(bad_values)) {
  writeBin(encode("parse", k, bad_values[[nm]]), p)
  r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x))))
  if (calls != 1L || !same(r, fresh)) stop("unexpected object accepted: ", nm)
}
writeBin(encode("parse", paste0(k, "0"), list(input = input, value = fresh)), p)
r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x)))); stopifnot(calls == 1L, same(r, fresh))
writeBin(encode("svg", k, list(input = input, value = fresh)), p)
r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x)))); stopifnot(calls == 1L, same(r, fresh))
# decompression bombs: 256 MiB of zeros (twice the bound). Unsigned: refused at the
# signature. Signed with its true length: refused at the header. Never decompressed.
bomb <- memCompress(raw(256 * 1024^2), type = "gzip")
bomb_header <- charToRaw(paste0(jsonlite::toJSON(list(v = 3L, kind = "parse", key = k, n = 256 * 1024^2, z = length(bomb),
  b = digest::digest(bomb, algo = "sha256", serialize = FALSE)), auto_unbox = TRUE), "\n"))
decompressions <- 0L
assign("memDecompress", function(...) { decompressions <<- decompressions + 1L; base::memDecompress(...) }, envir = globalenv())
for (blob in list(forge_mac(bomb_header, bomb, strrep("0", 64)), forge_mac(bomb_header, bomb, team_prep_cache_hmac(secret(), bomb_header)))) {
  writeBin(blob, p)
  r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x)))); stopifnot(calls == 1L, same(r, fresh), decompressions == 0L)
}
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(calls == 0L, decompressions == 1L)   # a good object: once
rm("memDecompress", envir = globalenv()); rm(bomb); invisible(gc())
# preflight: a value over the in-memory limit is never serialized for storage
old_limit <- team_prep_cache_value_max_bytes; team_prep_cache_value_max_bytes <<- 1000
serialized <- 0L; assign("serialize", function(...) { serialized <<- serialized + 1L; base::serialize(...) }, envir = globalenv())
unlink(p); r <- suppressMessages(cold(in_project(project, parse_lipid_names_bulk(x))))
rm("serialize", envir = globalenv()); team_prep_cache_value_max_bytes <<- old_limit
stopifnot(calls == 1L, same(r, fresh), !file.exists(p), serialized == 0L)
r <- cold(in_project(project, parse_lipid_names_bulk(x))); stopifnot(file.exists(p))

# ---- figures: only the per-figure SVG check is reused; the canvas is always validated live
svg_url <- function(fill) paste0("data:image/svg+xml,", utils::URLencode(
  paste0('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="', fill, '"/></svg>'), reserved = TRUE))
node <- function(id, url, x = 10) list(id = id, label = id, x = x, y = 10, width = 300, height = 250, visual = list(fontSize = 12),
  finished = list(url = url, createdAt = "2026-10-28T03:20:10Z", stale = FALSE))
url_a <- svg_url("#123456"); url_b <- svg_url("#654321")
state <- list(version = "1", libraryHidden = FALSE, nodes = list(node("plot_a", url_a), node("plot_b", url_b)))
canvas_file <- function(st) { f <- tempfile(tmpdir = work, fileext = ".json"); writeLines(team_canvas_json(st), f, useBytes = TRUE); f }
image_state <- function(cache) list(order = cache$order, bytes = cache$bytes, entries = mget(sort(ls(cache$entries)), envir = cache$entries))
live_read <- function(f) { st <- jsonlite::read_json(f, simplifyVector = FALSE); c0 <- team_canvas_image_cache(); v <- team_canvas_validate(st, image_cache = c0); list(v = v, cache = image_state(c0)) }
read_in <- function(p, f) { v <- in_project(p, team_canvas_read(f)); cache <- attr(v, "team_canvas_image_cache"); attr(v, "team_canvas_image_cache") <- NULL; list(v = v, cache = image_state(cache)) }
svg_checks <- 0L; structural <- 0L; real_svg <- team_canvas_svg; real_validate <- team_canvas_validate
team_canvas_svg <<- function(...) { svg_checks <<- svg_checks + 1L; real_svg(...) }
team_canvas_validate <<- function(...) { structural <<- structural + 1L; real_validate(...) }
on.exit({ team_canvas_svg <<- real_svg; team_canvas_validate <<- real_validate }, add = TRUE)
f1 <- canvas_file(state); live <- live_read(f1); svg_checks <- 0L; structural <- 0L
r1 <- read_in(project, f1); stopifnot(svg_checks == 2L, structural == 1L, same(r1$v, live$v), same(r1$cache, live$cache), count_kind("svg") == 2L)
r2 <- read_in(project, f1); stopifnot(svg_checks == 2L, structural == 2L, same(r2$v, live$v), same(r2$cache, live$cache))   # figures reused, structure live
# structural fields are always validated live, even with every figure reused
bad <- state; bad$nodes[[1]]$x <- -1; fails(read_in(project, canvas_file(bad))); stopifnot(svg_checks == 2L)
bad2 <- state; bad2$nodes[[2]]$visual$fontColor <- "red"; fails(read_in(project, canvas_file(bad2)))
moved <- state; moved$nodes[[2]]$x <- 99; rm2 <- read_in(project, canvas_file(moved)); stopifnot(svg_checks == 2L, same(rm2$v, live_read(canvas_file(moved))$v))
# a figure changed by one byte is checked live
c_state <- state; c_state$nodes[[2]]$finished$url <- svg_url("#654322"); svg_checks <- 0L
invisible(read_in(project, canvas_file(c_state))); stopifnot(svg_checks == 1L)
# a policy change (team_canvas_limits) or a checker change misses
svg_checks <- 0L; old_limits <- team_canvas_limits; team_canvas_limits$snapshot <<- team_canvas_limits$snapshot + 1
invisible(read_in(project, f1)); stopifnot(svg_checks == 2L); team_canvas_limits <<- old_limits
svg_checks <- 0L; invisible(read_in(project, f1)); stopifnot(svg_checks == 0L)
saved <- team_canvas_png; team_canvas_png <<- function(bytes) { saved(bytes) }   # same behaviour, different code
svg_checks <- 0L; invisible(read_in(project, f1)); stopifnot(svg_checks == 2L); team_canvas_png <<- saved
# libxml2's identity (version and loaded object) is part of the policy; unknown means no reuse
lib_id <- team_prep_cache_libxml2(); stopifnot(nzchar(lib_id))
if (file.exists("/proc/self/maps")) stopifnot(grepl("^[0-9.]+ [0-9a-f]{64}", lib_id))
cat("libxml2 identity:", lib_id, "\n")
saved <- team_prep_cache_libxml2
team_prep_cache_libxml2 <<- function() paste(lib_id, "changed")
svg_checks <- 0L; invisible(read_in(project, f1)); stopifnot(svg_checks == 2L)
team_prep_cache_libxml2 <<- function() ""
n <- length(objects()); unlink(objects()[vapply(objects(), kind_of, "") == "svg"]); n <- length(objects())
for (i in 1:2) { svg_checks <- 0L; ri <- suppressMessages(read_in(project, f1)); stopifnot(svg_checks == 2L, same(ri$v, live$v), length(objects()) == n) }
team_prep_cache_libxml2 <<- saved
svg_checks <- 0L; invisible(read_in(project, f1)); stopifnot(svg_checks == 2L); svg_checks <- 0L; invisible(read_in(project, f1)); stopifnot(svg_checks == 0L)
# an unsafe figure is never stored and always refused
bad_svg <- state; bad_svg$nodes[[1]]$finished$url <- svg_url("url(https://example.invalid/x)"); n <- length(objects())
fails(read_in(project, canvas_file(bad_svg))); fails(read_in(project, canvas_file(bad_svg))); stopifnot(length(objects()) == n)
# a signed entry for another figure, placed at an unsafe figure's key, is refused
svg_key <- function(url) digest::digest(list(v = 3L, figure = digest::digest(url, algo = "sha256", serialize = FALSE),
  policy = team_prep_cache_svg_policy(), context = team_prep_cache_context()), algo = "sha256")
evil_url <- bad_svg$nodes[[1]]$finished$url; ep <- team_prep_cache_path(project, "svg", svg_key(evil_url))
writeBin(encode("svg", svg_key(evil_url), list(input = url_a, value = TRUE)), ep)
fails(suppressMessages(read_in(project, canvas_file(bad_svg)))); stopifnot(!file.exists(ep))
writeBin(encode("svg", svg_key(evil_url), list(input = evil_url, value = FALSE)), ep)   # wrong value
fails(suppressMessages(read_in(project, canvas_file(bad_svg)))); stopifnot(!file.exists(ep))
# a forged (unsigned) entry claiming the unsafe figure passed is refused
fake <- lines_of(encode("svg", svg_key(evil_url), list(input = evil_url, value = TRUE)))
writeBin(forge_mac(fake$header, fake$body, digest::digest(fake$header, algo = "sha256", serialize = FALSE)), ep)
fails(suppressMessages(read_in(project, canvas_file(bad_svg)))); stopifnot(!file.exists(ep))
# no project: the figures are checked live and nothing is stored
svg_checks <- 0L; n <- length(objects()); rn <- read_in(NULL, f1); stopifnot(svg_checks == 2L, same(rn$v, live$v), length(objects()) == n)
# the session's later validations (import, edits) are unchanged: no figure hook there
stopifnot(is.null(team_canvas_image_cache()$validate))

# ---- tokens and URLs
stopifnot(!team_prep_cache_safe(serialize(list("x sess-token-3f9a1c y"), NULL), session_for(project)),
  !team_prep_cache_safe(serialize(list("https://example.test/session/0123456789abcdef0123/download"), NULL), NULL),
  !team_prep_cache_safe(serialize(list(access_token = "a"), NULL), NULL),
  !team_prep_cache_safe(serialize(list("see https://lib.example.test/storage/v1/object"), NULL), NULL),
  !team_prep_cache_safe(serialize(list("https://pubmed.ncbi.nlm.nih.gov/123/download?token=x"), NULL), NULL),
  team_prep_cache_safe(serialize(list("https://pubmed.ncbi.nlm.nih.gov/31415926/"), NULL), NULL),
  team_prep_cache_safe(serialize(list('<svg xmlns="http://www.w3.org/2000/svg"/>'), NULL), NULL))
scan <- function(files) for (f in files) {
  b <- readBin(f, "raw", file.size(f)); body <- serialize(team_prep_cache_decode(b, kind_of(f), jsonlite::fromJSON(rawToChar(lines_of(b)$header))$key, secret()), NULL)
  if (!team_prep_cache_safe(body, session_for(project)) || length(grepRaw("fixture-token|sess-token", body)))
    stop("a stored object holds a token or URL: ", f)
  if (file.info(f)$mode != as.octmode("600")) stop("stored object is not private: ", f)
}
scan(c(objects(), objects(other)))

# ---- caps: least recently used objects go first; stale .tmp- files are removed, fresh ones count
third <- "33333333-3333-4333-8333-333333333333"
urls <- vapply(1:5, function(i) svg_url(sprintf("#%06d", i)), "")
path_of <- function(u) team_prep_cache_path(third, "svg", svg_key(u))
validate_in <- function(u) in_project(third, team_prep_cache_image_validate(u))
old_count <- team_prep_cache_project_max_count; team_prep_cache_project_max_count <<- 3L
for (i in 1:3) { invisible(validate_in(urls[[i]])); Sys.setFileTime(path_of(urls[[i]]), Sys.time() - c(600, 300, 100)[[i]]) }
svg_checks <- 0L; invisible(validate_in(urls[[1]])); stopifnot(svg_checks == 0L)   # a hit refreshes the oldest
invisible(validate_in(urls[[4]]))
stopifnot(length(objects(third)) == 3L, file.exists(path_of(urls[[1]])), !file.exists(path_of(urls[[2]])), file.exists(path_of(urls[[4]])))
tdir <- file.path(cache_root, third); stale <- file.path(tdir, ".tmp-stale"); young <- file.path(tdir, ".tmp-young")
writeBin(raw(10), stale); writeBin(raw(10), young); Sys.setFileTime(stale, Sys.time() - 1200)
invisible(validate_in(urls[[5]]))
stopifnot(!file.exists(stale), file.exists(young), length(objects(third)) == 2L)   # 3 slots: the young write in progress holds one
unlink(young)
old_bytes <- team_prep_cache_project_max_bytes; team_prep_cache_project_max_bytes <<- 1
invisible(validate_in(urls[[2]])); stopifnot(length(objects(third)) == 0L)
team_prep_cache_project_max_count <<- old_count; team_prep_cache_project_max_bytes <<- old_bytes
old_object <- team_prep_cache_object_max_bytes; team_prep_cache_object_max_bytes <<- 16
invisible(suppressMessages(validate_in(urls[[3]]))); stopifnot(length(objects(third)) == 0L)
team_prep_cache_object_max_bytes <<- old_object
old_ser <- team_prep_cache_serialized_max_bytes; team_prep_cache_serialized_max_bytes <<- 64
invisible(suppressMessages(validate_in(urls[[3]]))); stopifnot(length(objects(third)) == 0L)
team_prep_cache_serialized_max_bytes <<- old_ser

# ---- two processes: one after the other (a restart), then two started together
child <- file.path(work, "child.R")
writeLines(c(
  'suppressPackageStartupMessages(source("R/global.R"))',
  'a <- commandArgs(TRUE); s <- new.env(); s$token <- "child-token"; s$userData <- new.env(); s$userData$team_library_bound_project <- function() a[[1]]',
  'sheet <- readxl::read_excel("demo_data/demo_global_lipidomics.xlsx", sheet = 1)',
  'col <- intersect(c("Lipid_Name", "Lipid Name", "Lipids", "Lipid", "Compound", "Feature"), names(sheet))',
  'nm <- as.character(sheet[[if (length(col)) col[[1]] else 1L]]); nm[[3]] <- a[[3]]',
  'saveRDS(shiny::withReactiveDomain(s, parse_lipid_names_bulk(nm)), a[[2]]); writeLines("done", paste0(a[[2]], ".done"))'), child)
rscript <- file.path(R.home("bin"), "Rscript")
fourth <- "44444444-4444-4444-8444-444444444444"
run_child <- function(out, name) { o <- system2(rscript, c("--vanilla", shQuote(child), fourth, shQuote(out), shQuote(name)), stdout = TRUE, stderr = TRUE)
  grep("^\\[prep-cache\\]", o, value = TRUE) }
o1 <- file.path(work, "c1.rds"); log1 <- run_child(o1, "PC 77:7"); r1 <- readRDS(o1); log2 <- run_child(o1, "PC 77:7"); r2 <- readRDS(o1)
z <- x; z[[3]] <- "PC 77:7"
stopifnot(any(grepl("miss parse", log1)), any(grepl("hit parse", log2)), !any(grepl("hit parse", log1)), same(r1, parse(z)), same(r2, parse(z)))
cat("two processes in turn:", log1[grepl("parse", log1)][1], "|", log2[grepl("parse", log2)][1], "\n")
outs <- file.path(work, c("p1.rds", "p2.rds")); logs <- file.path(work, c("p1.log", "p2.log"))
for (i in 1:2) system2(rscript, c("--vanilla", shQuote(child), fourth, shQuote(outs[[i]]), shQuote("PC 66:6")), stdout = logs[[i]], stderr = logs[[i]], wait = FALSE)
deadline <- Sys.time() + 300
while (!all(file.exists(paste0(outs, ".done"))) && Sys.time() < deadline) Sys.sleep(0.5)
stopifnot(all(file.exists(paste0(outs, ".done"))))
z <- x; z[[3]] <- "PC 66:6"; zz <- parse(z)
stopifnot(same(readRDS(outs[[1]]), zz), same(readRDS(outs[[2]]), zz))
concurrent <- vapply(logs, function(l) paste(grep("parse", grep("^\\[prep-cache\\]", readLines(l), value = TRUE), value = TRUE), collapse = " "), "")
o3 <- file.path(work, "p3.rds"); log3 <- run_child(o3, "PC 66:6"); stopifnot(any(grepl("hit parse", log3)), same(readRDS(o3), zz))   # the object they left is whole
stopifnot(!length(list.files(file.path(cache_root, fourth), pattern = "^[.]tmp-", all.files = TRUE)))
cat("two processes together:", concurrent[[1]], "|", concurrent[[2]], "\n")

# ---- optional: a real checkpoint's canvas and dataset, and the figure checks' time
if (length(args) >= 1L && file.exists(args[[1]])) {
  team_canvas_svg <<- real_svg; team_canvas_validate <<- real_validate
  archive <- read_session_archive(args[[1]], include_team_canvas = TRUE, metadata_decoder = team_metadata_sidecar_decode)
  on.exit(unlink(archive$directory, recursive = TRUE), add = TRUE)
  cf <- file.path(archive$directory, "team-canvas-v1.json")
  real_live <- live_read(cf)
  t_live <- system.time(for (i in 1:3) live_read(cf))[["elapsed"]] / 3
  unlink(objects()); t_miss <- system.time(m <- read_in(project, cf))[["elapsed"]]
  stopifnot(same(m$v, real_live$v), same(m$cache, real_live$cache))
  t_hit <- system.time(for (i in 1:3) { h <- read_in(project, cf); stopifnot(same(h$v, real_live$v), same(h$cache, real_live$cache)) })[["elapsed"]] / 3
  figures <- sum(vapply(real_live$v$nodes, function(n) !is.null(n$finished), logical(1)))
  cat(sprintf("real canvas read (s): live %.2f, first read storing %d figure checks %.2f, reused %.2f (structure always live)\n", t_live, figures, t_miss, t_hit))
  ds <- list.files(archive$directory, pattern = "[.]xlsx$", recursive = TRUE, full.names = TRUE)
  for (f in ds) { nm <- names_from(f); if (length(nm) < 50L) next
    r1 <- cold(in_project(project, parse_lipid_names_bulk(nm))); r2 <- cold(in_project(project, parse_lipid_names_bulk(nm)))
    stopifnot(calls == 0L, same(r1, parse(nm)), same(r2, parse(nm))) }
  cat("real checkpoint: canvas", length(real_live$v$nodes), "nodes,", length(ds), "dataset(s) checked\n")
}
scan(unlist(lapply(list.dirs(cache_root, recursive = FALSE), function(d) list.files(d, pattern = "^[0-9a-f]{64}$", full.names = TRUE))))
})

# ---- optional: every object in a live server's cache recomputes byte-identically
if (length(args) >= 2L && dir.exists(args[[2]])) local({
  if (nzchar(live_key_file)) Sys.setenv(LIPIDOMIC_PREP_CACHE_KEY_FILE = live_key_file) else Sys.unsetenv("LIPIDOMIC_PREP_CACHE_KEY_FILE")
  Sys.setenv(LIPIDOMIC_PREP_CACHE_DIR = args[[2]]); team_prep_cache_state$secret <<- NULL
  secret <- team_prep_cache_secret(); stopifnot(is.raw(secret))
  same <- function(a, b) identical(a, b) && identical(serialize(a, NULL), serialize(b, NULL))
  parse <- environment(parse_lipid_names_bulk)$parse; deps <- function() environment(team_parse_lipid_names_memo)$deps(parse)
  files <- list.files(args[[2]], pattern = "^[0-9a-f]{64}$", recursive = TRUE, full.names = TRUE)
  stopifnot(length(files) >= 1L)
  counts <- c(parse = 0L, svg = 0L)
  for (f in files) {
    raw <- readBin(f, "raw", file.size(f)); nl <- which(raw == as.raw(10L))
    header <- jsonlite::fromJSON(rawToChar(raw[(nl[1] + 1L):(nl[2] - 1L)]))
    project <- basename(dirname(f))
    stored <- team_prep_cache_decode(raw, header$kind, header$key, secret)   # HMAC verified first
    stopifnot(identical(basename(team_prep_cache_path(project, header$kind, header$key)), basename(f)), file.info(f)$mode == as.octmode("600"))
    if (identical(header$kind, "parse")) {
      i <- stored$input
      memo_key <- digest::digest(list(i[[1]], i[[2]], i[[3]], deps(), get0("class_map", globalenv()), get0("REVERSE_HYPERCLASS_MAP", globalenv())), algo = "sha256")
      stopifnot(identical(header$key, digest::digest(list(v = 3L, memo = memo_key, context = team_prep_cache_context()), algo = "sha256")))
      if (!same(stored$value, parse(i[[1]], i[[2]], i[[3]]))) stop("stored parse differs from a live parse: ", f)
    } else {
      stopifnot(identical(header$key, digest::digest(list(v = 3L, figure = digest::digest(stored$input, algo = "sha256", serialize = FALSE),
        policy = team_prep_cache_svg_policy(), context = team_prep_cache_context()), algo = "sha256")))
      # stored "passed" for exactly this figure; the live check passes and returns it unchanged
      if (!identical(stored$value, TRUE) || !same(team_canvas_image(stored$input), stored$input)) stop("stored figure check differs from a live check: ", f)
    }
    counts[[header$kind]] <- counts[[header$kind]] + 1L
  }
  cat("live cache:", counts[["parse"]], "parse and", counts[["svg"]], "figure-check object(s) agree byte for byte with a live computation\n")
})
unlink(work, recursive = TRUE)
cat("test_team_prep_cache.R: OK\n")
