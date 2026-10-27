# Evaluate the production table-cell formatter with untrusted labels/palette.
expr <- parse('R/modules/8_structural_module.R')
find_formatter <- function(x) {
  if (is.call(x) && identical(x[[1]], as.name('function')) &&
      grepl("background-color:%s;margin-right:6px", paste(deparse(x), collapse=''), fixed=TRUE) &&
      identical(names(as.list(x[[2]])), 'ch')) return(x)
  if (is.recursive(x)) for (i in seq_along(x)) {
    if (identical(x[[i]], quote(expr=))) next
    out <- find_formatter(x[[i]])
    if (!is.null(out)) return(out)
  }
  NULL
}
formatter <- find_formatter(expr)
stopifnot(!is.null(formatter))
`%||%` <- function(x,y) if(is.null(x)) y else x
label <- '<img src=x onerror=alert(1)>'
color_map <- setNames(list("red;' onmouseover='alert(1)"), label)
render_cell <- eval(formatter)
html <- render_cell(label)
stopifnot(!grepl('<img',html,fixed=TRUE),
          !grepl('onmouseover',html,fixed=TRUE),
          grepl('&lt;img',html,fixed=TRUE),
          grepl('background-color:#94a3b8',html,fixed=TRUE))
color_map <- list('18:1'='#123456')
stopifnot(grepl('<strong>18:1</strong>',render_cell('18:1'),fixed=TRUE),
          grepl('background-color:#123456',render_cell('18:1'),fixed=TRUE))
cat('PASS: production structural cell escapes markup and validates palette color\n')
