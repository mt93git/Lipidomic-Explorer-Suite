source('R/frontends/team/guided_workflow.R')
source('R/frontends/team/ux_preparation.R')
old <- Sys.getenv('LIPIDOMIC_LOCAL_WORKBOOK_DIR',unset=NA_character_)
on.exit(if(is.na(old)) Sys.unsetenv('LIPIDOMIC_LOCAL_WORKBOOK_DIR') else
  Sys.setenv(LIPIDOMIC_LOCAL_WORKBOOK_DIR=old),add=TRUE)
Sys.unsetenv('LIPIDOMIC_LOCAL_WORKBOOK_DIR')
stopifnot(is.null(guide_local_workbook_root()),length(guide_local_workbooks())==0L)
base <- tempfile();dir.create(base);root <- file.path(base,'allowed');dir.create(root)
outside <- file.path(base,'outside.xlsx');writeBin(as.raw(1),outside)
inside <- file.path(root,'inside.xlsx');writeBin(as.raw(2),inside)
subdir <- file.path(root,'nested');dir.create(subdir)
writeBin(as.raw(3),file.path(subdir,'nested.xlsx'))
invisible(file.symlink(outside,file.path(root,'outside-link.xlsx')))
Sys.setenv(LIPIDOMIC_LOCAL_WORKBOOK_DIR=root)
resolved_root <- guide_local_workbook_root()
stopifnot(identical(resolved_root,normalizePath(root)),
          identical(basename(guide_local_workbooks()),'inside.xlsx'),
          is.null(guide_resolved_local_workbook(outside,resolved_root)),
          is.null(guide_resolved_local_workbook(file.path(root,'outside-link.xlsx'),resolved_root)),
          is.null(guide_resolved_local_workbook(file.path(subdir,'nested.xlsx'),resolved_root)))
# Browser values are numeric indices into the listed files, never paths.
workflow_text <- paste(readLines('R/frontends/team/guided_workflow.R',warn=FALSE),collapse='\n')
stopifnot(grepl('guide_resolved_local_workbook(local_files[i],local_root)',workflow_text,fixed=TRUE),
          !grepl('../bone-data/original',workflow_text,fixed=TRUE))
unlink(base,recursive=TRUE)

companion_text <- paste(readLines('R/frontends/team/companion_assistant.R',warn=FALSE),collapse='\n')
stopifnot(grepl("if(p$parameter=='detection')updateSliderInput",companion_text,fixed=TRUE),
          !grepl("if(p$parameter=='detection')updateNumericInput",companion_text,fixed=TRUE))

cat('PASS: local workbooks require explicit in-root path; no study-specific shortcuts are bundled\n')
