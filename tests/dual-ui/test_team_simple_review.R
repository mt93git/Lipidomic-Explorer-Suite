library(shiny)
source('R/frontends/team/guided_preparation_controls.R')
source('R/frontends/team/guided_workflow.R')
team_workspace_enabled <- function() TRUE
review <- htmltools::renderTags(guide_quality_ui())$html
design <- htmltools::renderTags(guide_design_ui())$html
stopifnot(grepl('tw-simple-review',review,fixed=TRUE),
          grepl('guide_review_data',review,fixed=TRUE),
          grepl('guided_qc_plot',review,fixed=TRUE),
          grepl('detectionPreview',review,fixed=TRUE),
          !grepl('guide_design_confirm',review,fixed=TRUE),
          !grepl('guide_design_type',design,fixed=TRUE),
          length(gregexpr('id="qc_pca_tab-minDetectionPct"',review,fixed=TRUE)[[1]])==1L)
# A simpler preparation path must not grant inferential design validity.
stopifnot(!guide_allows_inference(TRUE,'',''),
          guide_allows_inference(TRUE,'Animal','independent'))
team_share <- htmltools::renderTags(guide_share_ui())$html
stopifnot(grepl('open Review to rebuild the data table and PCA automatically',team_share,fixed=TRUE),
          grepl('Open a result in Canvas',team_share,fixed=TRUE),
          !grepl('click Prepare data in Review',team_share,fixed=TRUE),
          !grepl('step 5',team_share,fixed=TRUE))
team_workspace_enabled <- function() FALSE
legacy <- htmltools::renderTags(guide_quality_ui())$html
stopifnot(!grepl('tw-simple-review',legacy,fixed=TRUE),
          grepl('guided_qc_plot',legacy,fixed=TRUE))
classic_share <- htmltools::renderTags(guide_share_ui())$html
stopifnot(grepl('click Prepare data in Quality',classic_share,fixed=TRUE),
          grepl('open a result in step 5',tolower(classic_share),fixed=TRUE))
cat('PASS: single-screen Team Review preserves explicit inference requirements and legacy UI\n')
# Exercise navigation on the real server with a retained, pending applied run.
team_workspace_enabled <- function() TRUE
`%||%` <- function(a,b) if(is.null(a)) b else a
sample_metadata_import_server <- function(...) invisible(NULL)
server <- function(input,output,session) {
  dirty <- reactiveVal(TRUE); status <- reactiveVal('pending'); requests <- reactiveVal(list())
  fields <- unique(sub('shared_data\\$', '', regmatches(paste(readLines('R/frontends/team/guided_workflow.R'),collapse='\n'),gregexpr('shared_data\\$[A-Za-z_]+',paste(readLines('R/frontends/team/guided_workflow.R'),collapse='\n')))[[1]]))
  hub <- setNames(lapply(fields,function(x) function(...) NULL),fields)
  matrix <- data.frame(Lipid_Name=c('A','B'),s1=c(1,2),s2=c(3,4))
  hub$rawData <- reactive(list(data=matrix));hub$data_processed <- reactive(matrix)
  hub$selected_cols <- reactive(c('s1','s2'));hub$applied_sample_ids <- hub$selected_cols
  hub$all_metadata <- reactive(data.frame(FullName=c('s1','s2'),Group1='A',Group2='B'))
  hub$is_restoring <- reactive(FALSE);hub$session_restored <- reactive(FALSE)
  hub$preparation_dirty <- dirty
  hub$preparation_state <- reactive(list(status=status(),dirty=dirty(),data_available=TRUE,applied=list(run=1),error=if(status()=='error') 'Fixture preparation error' else NULL))
  hub$detection_preview <- reactive(list(retained=2))
  hub$request_team_review_preparation <- function(kind,expected_threshold=NULL) {requests(append(isolate(requests()),list(list(kind=kind,threshold=expected_threshold))));TRUE}
  guide <- guided_workflow_server(input,output,session,hub)
}
shiny::testServer(server,{
  session$setInputs(guide_step=5);session$flushReact()
  stopifnot(identical(guide$step(),3L))
  dirty(FALSE);status('error');session$setInputs(guide_step=5);session$flushReact()
  stopifnot(identical(guide$step(),3L))
  stopifnot(grepl('Fixture preparation error',output$guide_quality_status$html,fixed=TRUE))
  status('ready');session$setInputs(guide_step=5);session$flushReact()
  stopifnot(identical(guide$step(),5L),length(requests())==0L)
  session$setInputs(guide_step=3);session$flushReact()
  session$setInputs(team_review_prepare=list(kind='detection',threshold=75,source='ai'));session$flushReact()
  stopifnot(length(requests())==0L)
  session$setInputs(team_review_prepare=list(kind='detection',threshold=75,source='human'));session$flushReact()
  stopifnot(identical(requests()[[1]],list(kind='detection',threshold=75)))
  session$setInputs(team_review_prepare=list(kind='detection',threshold=101,source='human'));session$flushReact()
  stopifnot(length(requests())==1L)
  session$setInputs(team_review_prepare=list(kind='entry',source='human'));session$flushReact()
  stopifnot(length(requests())==2L,identical(requests()[[2]]$kind,'entry'))
})
cat('PASS: Team Canvas requires a clean, ready preparation on the server\n')
summary <- team_review_summary(data.frame(Lipid_Name=c('A','B'),s1=c(1,3),s2=c(5,7)),data.frame(FullName=c('s1','s2'),Group1=c('A','B'),Group2='Liver'),list(filter=list(retained_missing=.25)))
stopifnot(identical(summary$measures$Value,c('2','2','25.0%','4','3')),
          identical(summary$groups$Samples,c(1L,1L)),grepl('Linear abundance',summary$scale,fixed=TRUE))
cat('PASS: descriptive prepared-data summary uses measured matrix and recorded pre-imputation missingness\n')
