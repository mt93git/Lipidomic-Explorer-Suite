# 03_COMPANION_KNOWLEDGE.R
# --------------------------------------------------------
# Feed and inspect the companion's knowledge base.
#
#   Rscript 03_COMPANION_KNOWLEDGE.R add <file-or-folder> [--audience=all|team|classic] [--tags=a,b] [--title="..."]
#   Rscript 03_COMPANION_KNOWLEDGE.R list
#   Rscript 03_COMPANION_KNOWLEDGE.R remove <id-or-file-name>
#   Rscript 03_COMPANION_KNOWLEDGE.R rebuild
#   Rscript 03_COMPANION_KNOWLEDGE.R ask "<question>" [--audience=team|classic]
#   Rscript 03_COMPANION_KNOWLEDGE.R stats
#
# The companion answers only from what is stored here. See knowledge_base/README.md.
# --------------------------------------------------------

script_arg <- grep("^--file=", commandArgs(FALSE), value = TRUE)
if (length(script_arg)) {
  script_dir <- dirname(normalizePath(sub("^--file=", "", script_arg[[1L]]), winslash = "/", mustWork = FALSE))
  if (file.exists(file.path(script_dir, "R", "companion_kb.R"))) setwd(script_dir)
}
source("R/companion_kb.R")

args <- commandArgs(trailingOnly = TRUE)
opts <- args[startsWith(args, "--")]
args <- args[!startsWith(args, "--")]
opt <- function(name, default = NULL) {
  hit <- opts[startsWith(opts, paste0("--", name, "="))]
  if (length(hit)) sub(paste0("^--", name, "="), "", hit[[1L]]) else default
}
cmd <- if (length(args)) args[[1L]] else "help"

usage <- function() cat(paste(readLines("03_COMPANION_KNOWLEDGE.R", n = 14L)[3:13], collapse = "\n"), "\n")

run <- function() {
  if (cmd == "add") {
    targets <- args[-1L]
    if (!length(targets)) stop("Give a file or a folder to add.", call. = FALSE)
    files <- unlist(lapply(targets, function(t) if (dir.exists(t)) list.files(t, recursive = TRUE, full.names = TRUE) else t))
    files <- files[tolower(tools::file_ext(files)) %in% COMPANION_KB_TYPES]
    if (!length(files)) stop("No supported files found. Supported: ", paste0(".", COMPANION_KB_TYPES, collapse = " "), call. = FALSE)
    tags <- strsplit(opt("tags", ""), ",", fixed = TRUE)[[1L]]
    ok <- 0L
    for (f in files) {
      res <- tryCatch({ companion_kb_add(f, audience = opt("audience", "all"), tags = tags, title = if (length(files) == 1L) opt("title") else NULL); TRUE },
                      error = function(e) { message("Skipped ", basename(f), ": ", conditionMessage(e)); FALSE })
      ok <- ok + as.integer(res)
    }
    message(sprintf("%d of %d file(s) added. The running app reloads the base by itself.", ok, length(files)))
  } else if (cmd == "list") {
    m <- companion_kb_sources()
    if (!nrow(m)) { cat("The library is empty. Seed guidance is always loaded.\n"); return(invisible()) }
    print(m[, c("id", "file", "type", "audience", "n_chunks", "added_at")], row.names = FALSE)
  } else if (cmd == "remove") {
    if (length(args) < 2L) stop("Give the id or file name to remove (see 'list').", call. = FALSE)
    companion_kb_remove(args[[2L]])
  } else if (cmd == "rebuild") {
    companion_kb_rebuild()
  } else if (cmd == "stats") {
    kb <- companion_kb_load(force = TRUE)
    cat(sprintf("Passages: %d (seed %d, library %d)\nLibrary: %s\nSeed: %s\n", kb$N, sum(kb$chunks$origin == "seed"),
                sum(kb$chunks$origin == "library"), normalizePath(companion_kb_dir(), mustWork = FALSE), normalizePath(companion_kb_seed_dir(), mustWork = FALSE)))
  } else if (cmd == "ask") {
    if (length(args) < 2L) stop("Give a question in quotes.", call. = FALSE)
    a <- companion_kb_answer(args[[2L]], companion_kb_load(force = TRUE), opt("audience", "team"))
    cat(a$text, "\n")
    if (a$found) cat(sprintf("\n[%s]\n", a$source))
  } else usage()
}
tryCatch(run(), error = function(e) { message("Error: ", conditionMessage(e)); quit(status = 1L) })
