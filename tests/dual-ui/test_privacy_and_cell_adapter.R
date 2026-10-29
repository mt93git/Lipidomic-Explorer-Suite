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
source('R/frontends/interface.R')
vars <- c('LIPIDOMIC_INTERFACE', 'LIPIDOMIC_UI_TRACE_DEBUG', 'CI',
  'CONTINUOUS_INTEGRATION', 'GITHUB_ACTIONS', 'LIPIDOMIC_HOSTED',
  'SHINY_SERVER', 'SHINY_SERVER_VERSION', 'SHINY_SERVER_LICENSE',
  'RSCONNECT', 'RSCONNECT_SERVER', 'CONNECT_SERVER', 'SHINYAPPS_INSTANCE_ID')
original_env <- Sys.getenv(vars, unset=NA_character_)
tryCatch({
  check_log <- function(interface, hosted=FALSE, debug='', full=FALSE) {
    Sys.unsetenv(vars)
    Sys.setenv(LIPIDOMIC_INTERFACE=interface, LIPIDOMIC_UI_TRACE_DEBUG=debug)
    if (hosted) Sys.setenv(LIPIDOMIC_HOSTED='1')
    e <- new.env(parent=globalenv())
    e$INGESTION_LOG_FILE <- tempfile()
    on.exit(unlink(e$INGESTION_LOG_FILE), add=TRUE)
    eval(logger[[1]],envir=e)
    invisible(capture.output(e$log_ingestion_event('UPLOAD',status='INFO',
      message_text='private-patient-name.xlsx',
      details=list(filename='private-patient-name.xlsx',sample_id='Patient-412',
                   sample_count=3L)),type='output'))
    text <- paste(readLines(e$INGESTION_LOG_FILE),collapse='\n')
    stopifnot(grepl('UPLOAD',text,fixed=TRUE))
    if (full) {
      stopifnot(grepl('private-patient-name',text,fixed=TRUE),
                grepl('Patient-412',text,fixed=TRUE))
    } else {
      stopifnot(grepl('sample_count: 3',text,fixed=TRUE),
                !grepl('private-patient-name',text,fixed=TRUE),
                !grepl('Patient-412',text,fixed=TRUE))
    }
  }
  check_log('classic', full=TRUE)
  check_log('classic', debug='0')
  check_log('team')
  check_log('team', debug='0')
  # Explicit debugging is local-only; hosted logs always retain strict privacy.
  check_log('team', debug='1', full=TRUE)
  for (interface in c('classic','team')) for (debug in c('', '0', '1'))
    check_log(interface, hosted=TRUE, debug=debug)
}, finally={
  Sys.unsetenv(vars)
  existing <- !is.na(original_env)
  if (any(existing)) do.call(Sys.setenv, as.list(original_env[existing]))
})
cat('PASS: Team cell adapter uses full matrix; local logging and hosted/Team privacy follow runtime policy\n')
