# parse_lipid_names_bulk keeps the last few whole-matrix results per process in Team
# (R/frontends/team/hooks/prep_cache.R, on global.R's parse_lipid_names_bulk hook): a memoized result is identical() and
# byte-identical to parsing again, for real matrices and edge cases.
# Optional: Rscript tests/dual-ui/test_lipid_parse_memo.R path/to/matrix.xlsx [...]
# Skips (exit 0, with a message) when R/global.R's packages are not installed.
absent <- Filter(function(p) !requireNamespace(p, quietly = TRUE), c("digest", "readxl", "tibble"))
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
if (!length(absent)) tryCatch(suppressPackageStartupMessages(source("R/global.R")),
  packageNotFoundError = function(e) absent <<- e$package)
if (length(absent)) { message("SKIP test_lipid_parse_memo.R: missing package(s) ", paste(absent, collapse = ", ")); quit(save = "no", status = 0) }
# local(): on.exit needs a frame to run in under Rscript; envir keeps the globals the memo reads.
local({
parse <- environment(parse_lipid_names_bulk)$parse
stopifnot(is.function(parse), !identical(parse, parse_lipid_names_bulk))
same <- function(a, b) identical(a, b) && identical(serialize(a, NULL), serialize(b, NULL))
calls <- 0L
counting <- function(...) { calls <<- calls + 1L; parse(...) }
assign("parse", counting, envir = environment(parse_lipid_names_bulk))
on.exit(assign("parse", parse, envir = environment(parse_lipid_names_bulk)), add = TRUE)
names_from <- function(path) {
  sheet <- readxl::read_excel(path, sheet = 1)
  col <- intersect(c("Lipid_Name", "Lipid Name", "Lipids", "Lipid", "Compound", "Feature"), names(sheet))
  as.character(sheet[[if (length(col)) col[[1]] else 1L]])
}
paths <- c(commandArgs(trailingOnly = TRUE), list.files("demo_data", pattern = "\\.xlsx$", full.names = TRUE))
sets <- lapply(paths, names_from); names(sets) <- basename(paths)
sets <- sets[vapply(sets, length, 1L) >= 50L]
stopifnot(length(sets) >= 1L)
edge <- c(sets[[1]][1:60], NA, "", "  ", "PC 34:1", "PC 34:1", "PC(16:0_18:1)+AcO", "TG(52:3)+NH4", "Cer(d18:1/16:0)", "unknown thing", "LPC 18:0;O", "SM d18:1/16:0")
sets$edge <- edge
sets$shuffled <- rev(sets[[1]])
reset <- function() { e <- environment(team_parse_lipid_names_memo); rm(list = ls(e$memo), envir = e$memo); assign("keys", character(), envir = e); assign("sizes", numeric(), envir = e) }
for (name in names(sets)) {
  x <- sets[[name]]
  fresh <- parse(x)
  memo_env <- environment(team_parse_lipid_names_memo)
  reset()
  calls <- 0L
  first <- parse_lipid_names_bulk(x); second <- parse_lipid_names_bulk(x)
  if (calls != 1L) stop("memo did not serve the repeat call: ", name)
  if (!same(first, fresh) || !same(second, fresh)) stop("memoized result differs from a fresh parse: ", name)
}
# Mode and remaps are part of the key.
x <- sets$edge; calls <- 0L
a <- parse_lipid_names_bulk(x, custom_remaps = list("unknown thing" = "Glycerophospholipids"))
stopifnot(calls == 1L, same(a, parse(x, custom_remaps = list("unknown thing" = "Glycerophospholipids"))), !same(a, parse(x)))
b <- parse_lipid_names_bulk(x, mode = "Lipid Mediators"); stopifnot(calls == 2L, same(b, parse(x, mode = "Lipid Mediators")))
# A caller modifying its copy never changes what the next caller gets.
y <- parse_lipid_names_bulk(sets$edge); y$subclass[1] <- "changed"
stopifnot(same(parse_lipid_names_bulk(sets$edge), parse(sets$edge)))
# Small calls (parse_lipid_name's single names) bypass the memo.
calls <- 0L; invisible(parse_lipid_names_bulk("PC 34:1")); invisible(parse_lipid_names_bulk("PC 34:1")); stopifnot(calls == 2L)
# Byte budget: total kept size stays under it, least recently used results go first,
# and a result over half the budget is returned but never kept.
e <- environment(team_parse_lipid_names_memo); old_budget <- e$budget; reset()
one <- as.numeric(utils::object.size(parse(c(sets$edge, "PC 1:0"))))
assign("budget", one * 3.5, envir = e)
for (i in 1:3) invisible(parse_lipid_names_bulk(c(sets$edge, paste0("PC ", i, ":0"))))
invisible(parse_lipid_names_bulk(c(sets$edge, "PC 1:0")))   # touch 1: now most recent
invisible(parse_lipid_names_bulk(c(sets$edge, "PC 4:0")))   # evicts 2, the least recent
stopifnot(sum(e$sizes) <= e$budget, length(e$keys) == 3L, length(ls(e$memo)) == 3L)
calls <- 0L; invisible(parse_lipid_names_bulk(c(sets$edge, "PC 1:0"))); stopifnot(calls == 0L)
invisible(parse_lipid_names_bulk(c(sets$edge, "PC 2:0"))); stopifnot(calls == 1L)
assign("budget", one, envir = e); reset(); calls <- 0L
big <- parse_lipid_names_bulk(sets$edge); stopifnot(same(big, parse(sets$edge)), length(e$keys) == 0L)
invisible(parse_lipid_names_bulk(sets$edge)); stopifnot(calls == 2L)
assign("budget", old_budget, envir = e); reset()
# The key follows the parser's lexicon and helpers: changing class_map or a helper
# misses the memo and returns what a fresh parse returns with the change.
x <- sets$edge; base_result <- parse_lipid_names_bulk(x); calls <- 0L
g <- globalenv(); set <- function(name, value) assign(name, value, envir = g)
saved_map <- g$class_map; changed_map <- saved_map; changed_map[["PC"]] <- "Changed class"; set("class_map", changed_map)
changed <- parse_lipid_names_bulk(x); stopifnot(calls == 1L, same(changed, parse(x)))
set("class_map", saved_map); invisible(parse_lipid_names_bulk(x)); stopifnot(calls == 1L)
saved_chain <- g$classify_chain; copy <- function() NULL; formals(copy) <- formals(saved_chain); body(copy) <- body(saved_chain); environment(copy) <- g
set("classify_chain", copy); invisible(parse_lipid_names_bulk(x)); stopifnot(calls == 1L)   # same code: same key
body(copy) <- call("{", quote(invisible(NULL)), body(saved_chain)); set("classify_chain", copy)
invisible(parse_lipid_names_bulk(x)); stopifnot(calls == 2L)
# A closure is keyed on what it captured: the same body with a different captured value
# misses; a new closure capturing the same value hits.
capturing <- function(tag) { f <- saved_chain; environment(f) <- list2env(list(tag = tag), parent = g); f }
set("classify_chain", capturing("a")); invisible(parse_lipid_names_bulk(x)); stopifnot(calls == 3L)
set("classify_chain", capturing("a")); invisible(parse_lipid_names_bulk(x)); stopifnot(calls == 3L)
set("classify_chain", capturing("b")); invisible(parse_lipid_names_bulk(x)); stopifnot(calls == 4L)
# A byte-compiled parser keeps its key (the fingerprint reads the code, not the bytecode).
set("classify_chain", saved_chain); invisible(parse_lipid_names_bulk(x)); n <- calls
set("classify_chain", compiler::cmpfun(saved_chain)); invisible(parse_lipid_names_bulk(x)); stopifnot(calls == n)
set("classify_chain", saved_chain)
# At most max_entries results are kept, least recently used first out.
old_max <- e$max_entries; assign("max_entries", 3L, envir = e); reset()
for (i in 1:5) invisible(parse_lipid_names_bulk(c(sets$edge, paste0("PC ", i, ":0"))))
stopifnot(length(e$keys) == 3L, length(ls(e$memo)) == 3L)
calls <- 0L; invisible(parse_lipid_names_bulk(c(sets$edge, "PC 5:0"))); stopifnot(calls == 0L)
invisible(parse_lipid_names_bulk(c(sets$edge, "PC 1:0"))); stopifnot(calls == 1L)
assign("max_entries", old_max, envir = e); reset()
# Errors propagate and are not memoized.
assign("parse", function(...) stop("boom"), envir = environment(parse_lipid_names_bulk))
stopifnot(inherits(try(parse_lipid_names_bulk(paste0("X", 1:60)), silent = TRUE), "try-error"))
assign("parse", counting, envir = environment(parse_lipid_names_bulk))
calls <- 0L; invisible(parse_lipid_names_bulk(paste0("X", 1:60))); stopifnot(calls == 1L)
cat(sprintf("PASS: parse_lipid_names_bulk memo identical to a fresh parse (%s)\n", paste(sprintf("%s:%d", names(sets), lengths(sets)), collapse = ", ")))
}, envir = globalenv())
