library(shiny)
source('R/utils_sample_metadata.R')
source('R/sample_metadata_import.R')
`%||%` <- function(a,b) if(is.null(a)) b else a
# Exercise the actual hub helper in isolation with representative confirmed Team snapshots.
txt <- readLines('R/modules/1_shared_data_module.R', warn=FALSE)
start <- grep('^    team_metadata_snapshot_present <- function\\(snapshot\\)',txt)
end <- grep('^    import_status <- reactiveVal',txt)
stopifnot(length(start)==1L,length(end)==1L,start<end)
env <- new.env(parent=globalenv())
env$all_numeric_columns <- function() c('S1','S2')
env$allParsedMetadata <- function() data.frame(FullName=c('S1','S2'),Group1=c('old1','old2'),Group2='old tissue',Replicate='1',PatientNumber='none',TimePoint='none',stringsAsFactors=FALSE)
eval(parse(text=paste(txt[start:(end-1L)],collapse='\n')),env)
stopifnot(!env$team_metadata_snapshot_present(NULL), !env$team_metadata_snapshot_present(list()),
  inherits(try(env$team_metadata_snapshot_present(list(unexpected='value')),silent=TRUE),'try-error'),
  inherits(try(env$team_metadata_snapshot_present('bad'),silent=TRUE),'try-error'))
snap <- list(data=data.frame(FullName=c('S1','S2'), Condition=c('A','B'), SampleID=c('extra1','extra2'), Note=c('x','y')),mappings=c(Group1='Condition'))
v <- env$canonical_team_metadata(snap)
stopifnot(identical(v$scientific_metadata$Group1,c('A','B')),
  identical(v$scientific_metadata$Group2,c('old tissue','old tissue')),
  identical(v$scientific_metadata$Note,c('x','y')),
  identical(v$scientific_metadata$SampleID,c('extra1','extra2')),
  identical(v$team_snapshot$data,snap$data))
snap$data$FullName <- c('S2','S1')
stopifnot(inherits(try(env$canonical_team_metadata(snap),silent=TRUE),'try-error'))
cat('PASS: Team metadata canonical conversion, extras, identifiers, and partial mappings\n')
