# Focused bootstrap evaluates the production hub without unrelated plot widgets.
suppressPackageStartupMessages({library(shiny);library(bslib);library(dplyr);library(tidyr);library(readxl);library(zip);library(purrr);library(stringr)})
# Block B layout: interface selection and hooks are sourced by global.R before its assignments.
source('R/frontends/interface.R');source('R/hooks.R')
for(expr in parse('R/global.R')) if(is.call(expr) && identical(expr[[1]],as.name('<-'))) eval(expr,.GlobalEnv)
for(path in c('R/utils_data.R','R/utils_preparation.R','R/utils_restored_inputs.R','R/utils_sample_metadata.R','R/sample_metadata_import.R','R/utils_session_archive.R','R/utils_colors.R','R/utils_vis.R','R/modules/utils_stats.R','R/modules/utils_targeted_lipids.R','R/utils_memento.R','R/modules/1_shared_data_module.R')) source(path)
team_workspace_enabled <- function() TRUE
settings <- list(normalizationMethod='none',useImputation=FALSE,imputeZerosPerFile=TRUE,imputeRemainingNAtoZero=TRUE,minDetectionPct=0,dropNonDetected=TRUE,detectionScope='global',dropMisc=FALSE,imputationSeed=42,outlierTreatments=list())
reference <- NULL
server <- function(input,output,session) {
  controls <- reactiveVal(settings); allowed <- reactiveVal(TRUE)
  hub <- shared_data_server('hub',external_settings=controls,preparation_policy='team',design_check=function() allowed(),root_session=session)
}
shiny::testServer(server,{
  path <- normalizePath('tests/guided-shared/fixtures/abundance.csv')
  matrix <- read.csv(path,check.names=FALSE)
  session$setInputs(`hub-files`=data.frame(name='abundance.csv',size=file.info(path)$size,type='text/csv',datapath=path),`hub-selectedColumns`=names(matrix)[-1])
  metadata <- read_sample_metadata_file('tests/guided-shared/fixtures/metadata.csv','metadata.csv')
  hub$set_external_sample_metadata(stage_metadata_v01(metadata,names(matrix)[-1],c(Group1='Condition',Group2='Tissue',PatientNumber='SubjectID',Replicate='ReplicateID',TimePoint='TimePoint')),TRUE)
  session$flushReact()
  stopifnot(hub$request_team_review_preparation('entry'))
  queued <- hub$run_analysis_trigger();stopifnot(hub$request_team_review_preparation('entry'),identical(queued,hub$run_analysis_trigger()))
  session$flushReact()
  stopifnot(identical(hub$preparation_state()$status,'ready'))
  original <- hub$data_processed_unfiltered(); reference <<- original
  # Re-entering an unchanged Review does not issue another numerical run.
  trigger <- hub$run_analysis_trigger();stopifnot(hub$request_team_review_preparation('entry'))
  session$flushReact();stopifnot(identical(trigger,hub$run_analysis_trigger()))
  changed <- settings;changed$minDetectionPct <- 50;controls(changed);session$flushReact()
  stopifnot(!hub$request_team_review_preparation('detection',75),hub$request_team_review_preparation('detection',50))
  session$flushReact();stopifnot(identical(hub$preparation_state()$applied$spec$settings$minDetectionPct,50))
  # An exclusion cannot smuggle a pending normalization change into preparation.
  id <- names(matrix)[2]; changed$outlierTreatments <- setNames(list('remove'),id);changed$normalizationMethod <- 'median';controls(changed);session$flushReact()
  trigger <- hub$run_analysis_trigger();stopifnot(!hub$request_team_review_preparation('exclusion'))
  session$flushReact();stopifnot(identical(trigger,hub$run_analysis_trigger()))
  issue <- hub$team_review_preparation_issue()
  stopifnot(isTRUE(issue$confirmation),'Normalization' %in% issue$changes$Setting,
    !hub$request_team_review_preparation('confirmed',expected_id='stale-preview'))
  stopifnot(identical(trigger,hub$run_analysis_trigger()))
  changed$normalizationMethod <- 'none';controls(changed);session$flushReact()
  stopifnot(hub$request_team_review_preparation('exclusion'));session$flushReact()
  stopifnot(!id %in% names(hub$data_processed_unfiltered()))
  changed$outlierTreatments[[id]] <- 'keep';changed$imputationSeed <- 99L;controls(changed);session$flushReact()
  stopifnot(!hub$request_team_review_preparation('undo'))
  changed$imputationSeed <- 42;controls(changed);session$flushReact()
  stopifnot(hub$request_team_review_preparation('undo'));session$flushReact()
  stopifnot(id %in% names(hub$data_processed_unfiltered()))
  changed$minDetectionPct <- 0;controls(changed);session$flushReact()
  stopifnot(hub$request_team_review_preparation('detection',0));session$flushReact()
  stopifnot(identical(original,hub$data_processed_unfiltered()))
  changed$imputationSeed <- 99L;controls(changed);session$flushReact()
  stopifnot(!hub$request_team_review_preparation('entry'))
  issue <- hub$team_review_preparation_issue()
  stopifnot(isTRUE(issue$confirmation),'Imputation seed' %in% issue$changes$Setting,
    hub$request_team_review_preparation('confirmed',expected_id=issue$request_id))
  session$flushReact()
  stopifnot(identical(hub$preparation_state()$applied$spec$settings$imputationSeed,99L),is.null(hub$team_review_preparation_issue()))
  hub$is_restoring(TRUE);session$flushReact();stopifnot(!hub$request_team_review_preparation('entry'),grepl('still loading',hub$team_review_preparation_issue()$message,fixed=TRUE))
  hub$is_restoring(FALSE);allowed(FALSE);session$flushReact();stopifnot(!hub$request_team_review_preparation('entry'))
})
cat('PASS: real Team preparation hook validates intents, preserves numerical restoration, and rejects unrelated settings\n')

classic_server <- function(input,output,session) {
  hub <- shared_data_server('hub',external_settings=reactive(settings),preparation_policy='classic',root_session=session)
}
shiny::testServer(classic_server,{
  path <- normalizePath('tests/guided-shared/fixtures/abundance.csv'); matrix <- read.csv(path,check.names=FALSE)
  session$setInputs(`hub-files`=data.frame(name='abundance.csv',size=file.info(path)$size,type='text/csv',datapath=path),`hub-selectedColumns`=names(matrix)[-1])
  metadata <- read_sample_metadata_file('tests/guided-shared/fixtures/metadata.csv','metadata.csv')
  hub$set_external_sample_metadata(stage_metadata_v01(metadata,names(matrix)[-1],c(Group1='Condition',Group2='Tissue',PatientNumber='SubjectID',Replicate='ReplicateID',TimePoint='TimePoint')),TRUE)
  session$flushReact()
  trigger <- hub$run_analysis_trigger()
  stopifnot(!hub$request_team_review_preparation('entry'),identical(trigger,hub$run_analysis_trigger()))
  session$setInputs(`hub-runAnalysis`=1L);session$flushReact()
  stopifnot(identical(hub$preparation_state()$status,'ready'),identical(reference,hub$data_processed_unfiltered()))
})
cat('PASS: Classic rejects Team live hooks and manual preparation retains exact Team numerical parity\n')
