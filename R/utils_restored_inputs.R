# Session-local, non-reactive hydration ledger. A seed is retained until the
# browser acknowledges it; subsequent renders use live input, including NULL.
restored_input_reader <- function() {
  generation_seen <- NULL
  offered <- list()
  consumed <- character()
  live_cache <- list()
  reset <- function(generation) {
    if (!identical(generation_seen, generation)) {
      generation_seen <<- generation
      offered <<- list(); consumed <<- character(); live_cache <<- list()
    }
  }
  equal_value <- function(a,b) {
    a <- as.character(unlist(a,use.names=FALSE)); b <- as.character(unlist(b,use.names=FALSE))
    identical(a,b)
  }
  acknowledge <- function(live, generation) {
    force(live) # Register the input dependency even before a lazy key is offered.
    reset(generation)
    for (key in names(offered)) {
      ids <- offered[[key]]$ids; present <- ids[ids %in% names(live)]
      if (!length(present)) next
      value <- live[[present[[1L]]]]
      item <- offered[[key]]
      arrived <- !isTRUE(item$initial_present) || !equal_value(value,item$initial)
      if (!key %in% consumed && (equal_value(value,item$seed) || arrived)) consumed <<- c(consumed,key)
      if (key %in% consumed) live_cache[key] <<- list(value)
    }
    invisible(NULL)
  }
  read <- function(values, id, default = NULL, namespace = identity,
                   generation = 0L, consume = FALSE, live = list()) {
    reset(generation)
    if (!is.list(values) || !length(values)) return(default)
    clean_id <- sub("^.*?-", "", id)
    exact <- unique(c(id, namespace(id), clean_id))
    matched <- exact[exact %in% names(values)]
    if (!length(matched)) matched <- names(values)[endsWith(names(values),paste0("-",id)) | endsWith(names(values),paste0("-",clean_id))]
    if (!length(matched)) return(default)
    key <- matched[[1L]]
    if (!isTRUE(consume)) return(values[[key]])
    if (!key %in% names(offered)) {
      ids <- unique(c(key,id,namespace(id),namespace(clean_id)))
      present <- ids[ids %in% names(live)]
      offered[[key]] <<- list(seed=values[[key]],ids=ids,initial_present=length(present)>0L,
        initial=if (length(present)) live[[present[[1L]]]] else NULL)
    }
    acknowledge(live,generation)
    if (key %in% consumed && key %in% names(live_cache)) return(live_cache[[key]])
    values[[key]]
  }
  attr(read,"acknowledge") <- acknowledge
  read
}
