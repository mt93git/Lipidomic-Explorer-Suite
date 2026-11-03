# Exercise the dependency-selection R block without network access; check that
# CI invokes the same complete runner and retains failure logs rather than a subset.
x <- readLines('.github/workflows/integration-safeguards.yml',warn=FALSE)
stopifnot(any(grepl('tests/dual-ui/run_acceptance.R',x,fixed=TRUE)),
          !any(grepl('GUIDED_FOCUSED_CI',x,fixed=TRUE)),
          any(grepl('if: always()',x,fixed=TRUE)),
          any(grepl('R_PROFILE_USER: /dev/null',x,fixed=TRUE)))
start <- grep("options(repos=",x,fixed=TRUE)
end <- grep("if (length(missing)) stop",x,fixed=TRUE)
stopifnot(length(start)==1L,length(end)==1L,end>start)
code <- parse(text=paste(sub('^          ','',x[start:end]),collapse='\n'))
e <- new.env(parent=globalenv()); e$installed <- character()
e$install.packages <- function(pkgs,...) e$installed <- c(e$installed,pkgs)
e$requireNamespace <- function(...) TRUE
# Substitute the install call's target, retaining actual dependency parsing/checks.
for (node in code) {
 if (is.call(node) && identical(node[[1]],quote(BiocManager::install))) node[[1]] <- as.name('install.packages')
 eval(node,e)
}
imports <- trimws(gsub('\\s*\\([^)]*\\)','',strsplit(read.dcf('DESCRIPTION')[1,'Imports'],',')[[1]]))
stopifnot(all(imports %in% e$installed),'statmod' %in% e$installed,
          !any(grepl('[()]',e$packages)))
cat('PASS: CI full-runner wiring, failure evidence retention and declared dependency parsing\n')
