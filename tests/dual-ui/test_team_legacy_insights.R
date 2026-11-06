`%||%` <- function(x,y) if(is.null(x)||!length(x))y else x
source('R/frontends/team/scientific_insight_context.R')
source('R/frontends/team/scientific_insight.R')

# A provider must never receive source selections, sample labels, values, or
# a local fingerprint even if a future context adapter adds such fields.
ctx <- list(lipids=c('PC(34:1)','PE(36:2)'), kind='heatmap',
            context_label='patient secret', summary=list(value=987654321,group='private-group'),
            fingerprint=list(scientific_inputs=list(sample='private-sample')))
papers <- list(list(pmid='123',title='Public evidence',abstract='Published abstract',year='2024',url='https://pubmed.ncbi.nlm.nih.gov/123/'))
payload <- team_insight_provider_payload(ctx,papers)
stopifnot(identical(names(payload),c('lipids','lipid_classes','search_level','papers')),
          identical(payload$lipid_classes,c('phosphatidylcholine','phosphatidylethanolamine')),
          identical(payload$lipids,c('PC(34:1)','PE(36:2)')),
          !grepl('private|patient|987654321',jsonlite::toJSON(payload,auto_unbox=TRUE)))

# Instance settings and the prepared dataset participate in the locally stored
# fingerprint. Group labels stay inside the one-way digest.
data <- data.frame(Lipid=c('PC(34:1)','PE(36:2)'),s1=c(1,2),s2=c(2,3))
metadata <- data.frame(Sample=c('s1','s2'),Group=c('A','B'))
dash <- list(violin_data=data.frame(Lipid='PC(34:1)',Log10_abundance=c(1,2)))
make_ctx <- function(color='Group',matrix=data) team_insight_context('results_dashboard-plot_violin',list('results_dashboard-color_by'=color),list(data_processed=matrix),dash)
a <- team_insight_persisted_fingerprint(make_ctx(),metadata)
b <- team_insight_persisted_fingerprint(make_ctx('Other'),metadata)
changed <- data; changed$s1[1] <- 9
stopifnot(!identical(a,b),!identical(a,team_insight_persisted_fingerprint(make_ctx(matrix=changed),metadata)),grepl('^[a-f0-9]{64}$',a))
cat('PASS legacy insight provider minimization and local context fingerprint sensitivity\n')

# Even a stale instance-context hook cannot authorize a search without the
# currently applied prepared dataset. No provider call is needed for this test.
rd_value <- function(x) if(is.function(x))tryCatch(x(),error=function(e)NULL) else x
shiny::testServer(function(input,output,session) {
  values <- shiny::reactiveVal(NULL)
  messages <- new.env(); messages$items <- list(); messages$called <- FALSE
  session$sendCustomMessage <- function(type,message) messages$items[[length(messages$items)+1L]] <- message
  session$userData$team_canvas_instance_context <- function(id) { messages$called <- TRUE; ctx }
  team_scientific_insight_server(input,output,session,list(data_processed=values),list())
},{
  session$flushReact()
  session$setInputs(team_scientific_insight=list(plot_id='tcinstance_old-plot_violin',request_id='empty'))
  stopifnot(identical(tail(messages$items,1)[[1]]$status,'unsupported'),!messages$called)
  values(data.frame(Lipid=character(),sample=numeric()))
  session$setInputs(team_scientific_insight=list(plot_id='tcinstance_old-plot_violin',request_id='zero-rows'))
  stopifnot(identical(tail(messages$items,1)[[1]]$status,'unsupported'),!messages$called)
})
cat('PASS missing or empty dataset rejects stale instance context\n')

# Cell contexts are built only from the corresponding instance's live result.
cell_inputs <- list(cell_lipid='PC(34:1)',cell_class='PC',cell_sample='s1',cell_group_column='Group',cell_reference_group='A',cell_comparison_group='B',cell_explore_level='feature',cell_profile_view='share')
cell_results <- list(
 feature_values=function()data.frame(Lipid='PC(34:1)',Prepared_signal=1,Measurement='s1'),
 profile=function()data.frame(Class=c('PC','PE'),Sample='s1',Signal_percent=c(60,40)),
 class_comparison=function()data.frame(Class=c('PC','PE'),Group=c('A','B'),Abundance=c(1,2)),
 selected_values=function()data.frame(Class='PC',Lipid='PC(34:1)',Group=c('A','B'),Prepared_signal=c(1,2)))
hub <- list(data_processed=data)
cellctx <- function(source='cell_comparison_plot',inputs=cell_inputs,results=cell_results,shared=hub) team_insight_cell_context(source,inputs,shared,results)
for(source in c('cell_lipid_plot','cell_profile_plot','cell_class_plot','cell_comparison_plot')) stopifnot(!is.null(cellctx(source)))
stopifnot(is.null(cellctx('cell_forged')),is.null(cellctx(shared=list(data_processed=NULL))))
missing <- cell_inputs; missing$cell_comparison_group <- 'C'
stopifnot(is.null(cellctx(inputs=missing)),is.null(cellctx('cell_class_plot',missing)))
other <- cell_results; other$selected_values <- function()data.frame(Class='PE',Lipid='PE(36:2)',Group=c('A','B'),Prepared_signal=c(2,3))
stopifnot(is.null(cellctx(results=other)))
changed <- cell_inputs;changed$cell_reference_group <- 'B';changed$cell_comparison_group <- 'A'
stopifnot(!identical(team_insight_persisted_fingerprint(cellctx(),metadata),team_insight_persisted_fingerprint(cellctx(inputs=changed),metadata)))
missing <- cell_inputs;missing$cell_sample <- 's2';stopifnot(is.null(cellctx('cell_profile_plot',missing)))
cat('PASS per-instance Cell result binding, groups, source, selection and prepared dataset\n')

# End-to-end factory wiring: two copies can select different lipids and the
# result context is tied to the precise registered source and namespace.
`%||%` <- function(a,b) if(is.null(a))b else a
rd_class <- function(x) sub('\\(.*','',x)
sample_metadata_csv_safe <- identity
lipidomic_plotly_event <- function(...) NULL
source('R/frontends/team/cell_show.R');source('R/frontends/team/plot_instances.R')
fixture <- data.frame(Lipid=c('PC(34:1)','PE(36:2)'),S1=c(10,50),S2=c(20,60),S3=c(30,70),S4=c(40,80))
fixture_meta <- data.frame(FullName=names(fixture)[-1],Group1=c('A','A','B','B'))
value <- function(x){force(x);function(...)x}
fixture_hub <- list(data_processed=value(fixture),all_metadata=value(fixture_meta),preparation_audit=value(list(normalization='none',imputation='none')),preparation_dirty=value(FALSE))
shiny::testServer(function(input,output,session) {
  factory <- team_plot_instances_server(input,output,session,fixture_hub,fixture_hub)
},{
  for(id in c('tcinstance_one','tcinstance_two')) factory(list(id=id,source='cell_comparison_plot',inputs=list()))
  for(id in c('tcinstance_one','tcinstance_two')) {
    settings <- list('Group1','A','B','PC','feature','PC(34:1)','S1','share')
    names(settings) <- paste0(id,'-',c('cell_group_column','cell_reference_group','cell_comparison_group','cell_class','cell_explore_level','cell_lipid','cell_sample','cell_profile_view'))
    do.call(session$setInputs,settings)
  }
  session$setInputs(`tcinstance_two-cell_class`='PE',`tcinstance_two-cell_lipid`='PE(36:2)')
  session$flushReact()
  one <- session$userData$team_canvas_instance_context('tcinstance_one-cell_comparison_plot')
  two <- session$userData$team_canvas_instance_context('tcinstance_two-cell_comparison_plot')
  stopifnot(identical(one$lipids,'PC(34:1)'),identical(two$lipids,'PE(36:2)'),
            is.null(session$userData$team_canvas_instance_context('tcinstance_one-cell_lipid_plot')),
            is.null(session$userData$team_canvas_instance_context('tcinstance_forged-cell_comparison_plot')),
            !identical(team_insight_persisted_fingerprint(one,fixture_meta),team_insight_persisted_fingerprint(two,fixture_meta)))
  session$setInputs(`tcinstance_two-cell_comparison_group`='missing')
  stopifnot(is.null(session$userData$team_canvas_instance_context('tcinstance_two-cell_comparison_plot')))
})
cat('PASS real Cell instances and forged source binding\n')
