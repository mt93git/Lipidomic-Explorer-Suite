# Team preparation reuse (production R/global.R parse memo and R/modules PCA cache
# call site), registered on the shared hooks so Classic parses and runs PCA as before.

# The same names, mode, remaps and parser code/lexicon always parse to the same table:
# this process keeps recent whole-matrix results (at most 16 results and about 64 MB,
# by object.size(), which is approximate; least recently used evicted), so reopening a
# project does not parse it again. Only the value is memoized: warnings or messages the
# parser emitted on the first call are not replayed on a hit.
team_parse_lipid_names_memo <- local({
  memo <- new.env(parent = emptyenv()); keys <- character(); sizes <- numeric()
  budget <- 64 * 1024^2; max_entries <- 16L
  # A function's fingerprint is its formals, body and (for a closure) the values it captured.
  fp <- function(f, depth = 0L) {
    if (!is.function(f) || is.primitive(f)) return(f)
    e <- environment(f)
    own <- depth < 3L && !identical(e, globalenv()) && !identical(e, baseenv()) && !identical(e, emptyenv()) && !isNamespace(e)
    list(formals(f), body(f), if (own) lapply(as.list(e, all.names = TRUE, sorted = TRUE), fp, depth + 1L))
  }
  # The parser in use is global.R's (environment(parse_lipid_names_bulk)$parse); tests may swap it.
  deps <- function(parse) lapply(list(parse, get0("clean_lipid_name", globalenv()), get0("classify_chain", globalenv())), fp)
  function(parse) {
    function(lipid_names, mode = "Global Lipidomics", custom_remaps = list()) {
      if (length(lipid_names) < 50L) return(parse(lipid_names, mode, custom_remaps))
      key <- digest::digest(list(lipid_names, mode, custom_remaps, deps(parse), get0("class_map", globalenv()),
        get0("REVERSE_HYPERCLASS_MAP", globalenv())), algo = "sha256")
      if (!is.null(hit <- get0(key, envir = memo, inherits = FALSE))) { i <- match(key, keys); keys <<- c(keys[-i], key); sizes <<- c(sizes[-i], sizes[i]); return(hit) }
      # Whole-matrix parses are also kept on disk per project (prep_cache.R): NULL there means parse.
      store <- get0("team_prep_cache_parse_store", globalenv(), mode = "function"); input <- list(lipid_names, mode, custom_remaps)
      value <- if (!is.null(store)) tryCatch(store(key, input), error = function(e) NULL)
      if (is.null(value)) { value <- parse(lipid_names, mode, custom_remaps); if (!is.null(store)) tryCatch(store(key, input, value), error = function(e) NULL) }
      size <- as.numeric(utils::object.size(value))
      if (size > budget / 2) return(value)
      assign(key, value, envir = memo); keys <<- c(keys, key); sizes <<- c(sizes, size)
      while (sum(sizes) > budget || length(keys) > max_entries) { rm(list = keys[[1L]], envir = memo); keys <<- keys[-1L]; sizes <<- sizes[-1L] }
      value
    }
  }
})
lipidomic_hook_register("parse_lipid_names_bulk", team_parse_lipid_names_memo)

# Shared PCA: pca_cache(input) returns a stored result or NULL; pca_cache(input, value) stores one.
lipidomic_hook_register("pca_cache", function(...) team_prep_cache_pca(...))
