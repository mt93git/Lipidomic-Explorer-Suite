source('R/guided_workflow.R')
source('R/ux_preparation.R')
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
workflow_text <- paste(readLines('R/guided_workflow.R',warn=FALSE),collapse='\n')
stopifnot(grepl('guide_resolved_local_workbook(local_files[i],local_root)',workflow_text,fixed=TRUE),
          !grepl('../bone-data/original',workflow_text,fixed=TRUE))
unlink(base,recursive=TRUE)

companion_text <- paste(readLines('R/companion_assistant.R',warn=FALSE),collapse='\n')
stopifnot(grepl("if(p$parameter=='detection')updateSliderInput",companion_text,fixed=TRUE),
          !grepl("if(p$parameter=='detection')updateNumericInput",companion_text,fixed=TRUE))

study <- data.frame(scenario=c('global80_qrilc','baseline'),retained=c(7,9),
                    excluded=c(2,0),missing_pct=c(1,3),PC1=c(22,33),PC2=c(11,15),
                    procrustes_r=c(.8,1))
table <- ux_comparison_table_data(study)
stopifnot(identical(table$Scenario,study$scenario),
          identical(table$Retained,study$retained),nrow(table)==2L)
cat('PASS: local workbooks require explicit in-root path; slider and scenario labels are correct\n')
