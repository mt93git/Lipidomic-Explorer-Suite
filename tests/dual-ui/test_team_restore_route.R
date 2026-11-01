source('R/guided_workflow.R')
stopifnot(is.null(guide_restore_route(FALSE,FALSE,1L,NULL)),
          is.null(guide_restore_route(TRUE,TRUE,1L,NULL)))
first <- guide_restore_route(TRUE,FALSE,1L,NULL)
stopifnot(identical(first$destination,'Design'),identical(first$generation,1L),
          is.null(guide_restore_route(TRUE,FALSE,1L,first$generation)))
second <- guide_restore_route(TRUE,FALSE,2L,first$generation)
stopifnot(identical(second$destination,'Design'),identical(second$generation,2L))
# Inspect the real route selection structurally so formatting changes cannot
# break the contract; simple review goes to Preparation and ordinary mode uses
# the restore receipt's Design destination.
contains_call <- function(node,target) {
  if(identical(node,target)) return(TRUE)
  if(is.recursive(node)) for(i in seq_along(node)) if(contains_call(node[[i]],target)) return(TRUE)
  FALSE
}
ast <- parse('R/guided_workflow.R')
stopifnot(contains_call(ast,quote(bslib::nav_select('main_navbar',
  if(team_simple_review_enabled()) 'Preparation' else route$destination,session=session))),
  contains_call(ast,quote(!x %in% c('Experiment','Design'))))
cat('PASS: each completed restore routes once; simple review selects Preparation and ordinary mode selects Design; old tabs guarded\n')
