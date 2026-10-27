# Execute actual bootstrap branches with fake installers: never access network.
extract_branch <- function(path, needle) {
  expr <- parse(path)
  hits <- Filter(function(x) is.call(x) && identical(x[[1]], as.name('if')) &&
    grepl(needle, paste(deparse(x), collapse=' '), fixed=TRUE), as.list(expr))
  stopifnot(length(hits)==1L)
  hits[[1]]
}
preflight <- extract_branch('app.R', 'length(pkgs_missing) > 0')
recovery <- extract_branch('R/global.R', '[GLOBAL RECOVERY]')
probe <- function(expr, flag, missing=TRUE) {
  e <- new.env(parent=baseenv()); e$calls <- 0L; e$pkgs_missing <- if(missing) 'shiny' else character()
  e$Sys.getenv <- function(...) flag
  e$file.exists <- function(...) TRUE
  e$requireNamespace <- function(...) !missing
  e$source <- e$install.packages <- function(...) { e$calls <- e$calls+1L }
  e$message <- function(...) invisible(NULL)
  error <- tryCatch({eval(expr,e);NULL},error=function(x)conditionMessage(x))
  list(calls=e$calls,error=error)
}
x<-probe(preflight,'0');stopifnot(x$calls==0L,grepl('automatic installation is disabled',x$error))
stopifnot(probe(preflight,'1')$calls==1L,probe(preflight,'0',FALSE)$calls==0L)
stopifnot(probe(recovery,'0')$calls==0L,probe(recovery,'1')$calls==1L,probe(recovery,'1',FALSE)$calls==0L)
cat('PASS: actual bootstrap branches do not install by default; explicit opt-in works without network in test.\n')
