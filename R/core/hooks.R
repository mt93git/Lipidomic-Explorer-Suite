# R/core/hooks.R
# Named extension points for optional frontends. A module calls
#   lipidomic_hook("name", default)(value, ...)
# where `default` is exactly what the module did before the hook existed.
# Classic registers nothing, so every call runs its default unchanged.
# A frontend registers its implementation once at startup; several
# implementations of one hook run in registration order, each receiving the
# previous result as its first argument.
.lipidomic_hooks <- new.env(parent = emptyenv())

lipidomic_hook_identity <- function(x, ...) x

lipidomic_hook_register <- function(name, fn) {
  if (!is.character(name) || length(name) != 1L || is.na(name) || !nzchar(name))
    stop("Hook name must be a single non-empty string.", call. = FALSE)
  if (!is.function(fn)) stop("Hook implementation must be a function.", call. = FALSE)
  current <- get0(name, envir = .lipidomic_hooks, inherits = FALSE, ifnotfound = list())
  assign(name, c(current, list(fn)), envir = .lipidomic_hooks)
  invisible(name)
}

lipidomic_hook <- function(name, default = lipidomic_hook_identity) {
  fns <- get0(name, envir = .lipidomic_hooks, inherits = FALSE, ifnotfound = list())
  if (!length(fns)) return(default)
  if (length(fns) == 1L) return(fns[[1L]])
  function(x, ...) {
    for (fn in fns) x <- fn(x, ...)
    x
  }
}

lipidomic_hook_registered <- function() sort(ls(.lipidomic_hooks, all.names = TRUE))

lipidomic_hook_reset <- function() {
  rm(list = ls(.lipidomic_hooks, all.names = TRUE), envir = .lipidomic_hooks)
  invisible(NULL)
}
