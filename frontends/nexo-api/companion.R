# NEXO-COMPANION-B: the companion chat answers with the analyst's trained Team companion, unchanged.
# Her files (companion/, pinned to refs/up/mods-anapau d6a00298) load into their own environment so they
# never replace the tree's R/companion_*.R that Team uses. The optional AI provider is not loaded.
api_companion_env <- local({
  env <- new.env(parent = globalenv())
  dir <- file.path(if (exists("api_run_dir")) api_run_dir else "frontends/nexo-api", "companion")
  sys.source(file.path(dir, "companion_kb.R"), envir = env)
  env
})

# Team's grounded path (her R/companion_assistant.R): trim and lower-case the question, then answer
# from the knowledge base with the Team audience. Team does not sanitise on this path (only before the
# optional AI provider, which is off), so neither do we. `text` is her answer as Team shows it.
api_companion_ask <- function(body) {
  q <- body$question
  if (!is.character(q) || length(q) != 1L || is.na(q) || !nzchar(trimws(q)) || nchar(q) > 500L)
    api_abort("api_unprocessable", "Ask a question of 1 to 500 characters.")
  if (!is.null(body$screen) && !(is.character(body$screen) && length(body$screen) == 1L &&
      body$screen %in% c("start", "data", "review", "canvas", "inspector")))
    api_abort("api_unprocessable", "Unknown screen.")
  if (!is.null(body$card) && (!is.character(body$card) || length(body$card) != 1L))
    api_abort("api_unprocessable", "card must be a string.")
  a <- api_companion_env$companion_kb_answer(tolower(trimws(q)), audience = "team")
  list(text = a$text, label = a$source, grounded = isTRUE(a$found))
}
