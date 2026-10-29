source('R/guided_workflow.R')
stopifnot(is.null(guide_restore_route(FALSE,FALSE,1L,NULL)),
          is.null(guide_restore_route(TRUE,TRUE,1L,NULL)))
first <- guide_restore_route(TRUE,FALSE,1L,NULL)
stopifnot(identical(first$destination,'Design'),identical(first$generation,1L),
          is.null(guide_restore_route(TRUE,FALSE,1L,first$generation)))
second <- guide_restore_route(TRUE,FALSE,2L,first$generation)
stopifnot(identical(second$destination,'Design'),identical(second$generation,2L))
source_text <- paste(readLines('R/guided_workflow.R',warn=FALSE),collapse='\n')
stopifnot(grepl("bslib::nav_select('main_navbar',route$destination,session=session)",source_text,fixed=TRUE),
          grepl("!x %in% c('Experiment','Design')",source_text,fixed=TRUE))
cat('PASS: each completed restore routes Team to Design once and guards old tabs\n')
