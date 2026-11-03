# A named color returned by sapply acquires an extra level suffix. Restore the
# intended group names for Team's functional violin palette only.
team_fla_palette_adapter <- function(original) {
  stopifnot(is.function(original))
  found <- 0L
  rewrite <- function(node) {
    if (is.call(node) && identical(node[[1]], as.name('<-')) &&
        identical(node[[2]], as.name('current_violin_plot'))) {
      if (!is.call(node[[3]]) || !identical(node[[3]][[1]], as.name('reactive'))) stop('Team FLA palette requires review: reactive changed')
      replace_palette <- function(x) {
        if (is.call(x) && identical(x[[1]], as.name('<-')) && identical(x[[2]], as.name('safe_colors')) &&
            is.call(x[[3]]) && identical(x[[3]][[1]], as.name('sapply'))) {
          found <<- found + 1L
          return(substitute({ ORIGINAL; names(safe_colors) <- as.character(c_levels) }, list(ORIGINAL=x)))
        }
        if (is.recursive(x)) for (i in seq_along(x)) if (!is.null(x[[i]])) x[[i]] <- replace_palette(x[[i]])
        x
      }
      node[[3]][[2]] <- replace_palette(node[[3]][[2]])
      return(node)
    }
    if (is.recursive(node)) for (i in seq_along(node)) if (!is.null(node[[i]])) node[[i]] <- rewrite(node[[i]])
    node
  }
  adapted <- original; body(adapted) <- rewrite(body(original))
  if (found != 1L) stop('Team FLA palette requires review: expected one palette assignment')
  adapted
}
