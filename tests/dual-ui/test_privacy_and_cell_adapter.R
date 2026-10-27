source('R/frontends/team/server.R')
full <- data.frame(Lipid_Name=c('A','B'),Sample_1=c(1,2))
targeted <- full[1,,drop=FALSE]
hub <- list(data_processed=function() targeted,
            data_processed_unfiltered=function() full,
            preparation_audit=function() list(normalization='PQN'))
cell <- team_cell_data_adapter(hub)
stopifnot(identical(cell$data_processed(),full),
          identical(hub$data_processed(),targeted),
          identical(cell$preparation_audit,hub$preparation_audit))

# Evaluate only the logger definition; sourcing global.R would load the full app.
expr <- parse('R/global.R')
logger <- Filter(function(x) is.call(x) && identical(x[[1]],as.name('<-')) &&
                   identical(x[[2]],as.name('log_ingestion_event')), as.list(expr))
stopifnot(length(logger)==1L)
e <- new.env(parent=globalenv())
e$INGESTION_LOG_FILE <- tempfile()
eval(logger[[1]],envir=e)
invisible(capture.output(e$log_ingestion_event('UPLOAD',status='INFO',
  message_text='private-patient-name.xlsx',
  details=list(filename='private-patient-name.xlsx',sample_id='Patient-412',
               sample_count=3L)),type='output'))
text <- paste(readLines(e$INGESTION_LOG_FILE),collapse='\n')
stopifnot(grepl('UPLOAD',text,fixed=TRUE),grepl('sample_count: 3',text,fixed=TRUE),
          !grepl('private-patient-name',text,fixed=TRUE),
          !grepl('Patient-412',text,fixed=TRUE))
unlink(e$INGESTION_LOG_FILE)
cat('PASS: Team cell adapter uses full matrix and persistent ingestion trace omits identifiers\n')
