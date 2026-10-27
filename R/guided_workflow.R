# Seven-step navigation over the existing analysis modules. Input IDs are preserved.
guide_steps <- c('Experiment','Design','Preparation','Question','Results','3D Show','Share')
guide_labels <- c('Experiment','Design','Quality','My question','Results','3D Show','Share')
guide_tools <- c('Quality Check','Run comparison','Heatmap','Composition','Volcano Plot','LSEA',
  'Structural','Main Class & Acyl Chain Proportions','Structural Grid','Violin Plots',
  'Functional Ratios','Lipid Pathways','Cellular Organization','Longitudinal',
  'Math Proof','Lexicon','App Info','About & Citation','Publication Export Studio')
guide_link <- function(label, step=NULL, tool=NULL) tags$button(type='button',class='guide-button',
  `data-guide-step`=step,`data-guide-tool`=tool,label)
guide_heading <- function(step,title,description) div(class='guide-heading',
  span(class='ux-eyebrow',paste('STEP',step,'OF 7')),h2(title),p(description))
guide_focus_link <- function(label,id) tags$button(type='button',class='guide-button',`data-guide-focus`=id,label)
guide_next <- function(step,label) div(class='guide-actions',guide_link(label,step=step))
guide_loading_output <- function(id,label) uiOutput(id,container=function(...)tags$div(...,p(class='guide-loading',role='status',label)))
guide_header <- function() tagList(
  div(id='guide-navigation',tags$nav(`aria-label`='Analysis workflow',
    lapply(seq_along(guide_steps),function(i) tags$button(type='button',`data-guide-step`=i,
      class='guide-step',tags$span(i),guide_labels[i]))),
    div(class='guide-global-actions',guide_link('All analysis tools',step=5),guide_link('Help & methods',tool='App Info'))),
  div(id='guide-context',uiOutput('guide_context')),
  div(id='guide-analysis-toolbar',guide_link('← Question',step=4),
      selectInput('guide_tool',tags$span(class='visually-hidden','Analysis tool'),choices=c('Choose a tool'='',guide_tools),selectize=FALSE),
      guide_link('Quality',step=3),guide_link('Share results',step=7)))
guide_experiment_ui <- function() div(class='guide-page',
  guide_heading(1,'Start with your experiment','Add the abundance matrix first, then decide whether to add a separate sample metadata table before reviewing Design.'),
  div(class='guide-panel',id='guide-experiment-abundance',
    h3('1. Add the abundance matrix'),
    p('Upload an Excel or CSV abundance matrix. Original files are kept unchanged.'),
    fileInput('data_hub-files','Abundance files',multiple=TRUE,accept=c('.csv','.xlsx','.xls')),
    uiOutput('data_hub-loaded_files_display'),uiOutput('guide_experiment_summary'),
    p(class='guide-upload-limit','Uploads over 90 MB: open the workbook from the lab server instead.'),
    guide_loading_output('guide_local_experiments','Connecting to the analysis workspace… Saved workbooks will appear here.')),
  div(class='guide-panel',id='guide-experiment-metadata',
    h3('2. Add sample metadata (optional)'),
    uiOutput('guide_experiment_metadata_prompt'),
    sample_metadata_import_ui('sample_metadata_import')),
  div(class='guide-panel',id='guide-experiment-design',
    h3('3. Review the study design'),
    p('Check sample names, choose measurements, and confirm how samples are related.'),
    uiOutput('guide_experiment_next')),
  tags$details(class='guide-panel',
    tags$summary('Resume from a saved session ZIP instead'),
    fileInput('data_hub-import_session_file','Saved session (.zip)',accept='.zip'),
    uiOutput('data_hub-import_status_display'),
    p('Restores source data and saved settings. Review and confirm Design, then click Prepare data in Quality to rebuild results.')))
guide_design_ui <- function() div(class='guide-page',
  guide_heading(2,'Confirm the study design','Review the sample labels, choose which samples to include, then confirm your review.'),
  uiOutput('guide_design_status'),
  div(class='guide-panel',h3('1. Review sample labels'),actionButton('data_hub-openMetadataMappingBtn','Edit sample labels and metadata',class='btn-primary'),
    p('The table below shows how the column names were interpreted. Correct any labels with the editor before continuing.'),
    p('This table includes all loaded measurements. The Next run column marks which ones are selected for preparation.'),DT::DTOutput('guide_metadata'),uiOutput('guide_time_label_hint')),
  div(id='guide-design-decisions',class='guide-panel',h3('2. Describe your experimental units'),
    textInput('guide_unit','What was independently sampled? (required)','',placeholder='For example: Animal or donor'),
    p(id='guide_unit_help','For example: Animal, donor, culture or independently collected sample.'),
    selectInput('guide_design_type','Relationship between samples (required)',c('Choose a design'='',
      'Independent experimental units'='independent','Matched or repeated measurements'='paired','Mixed or uncertain — needs review'='uncertain'),selectize=FALSE),
    p(id='guide_design_type_help','Different animals or independently collected samples: choose Independent. Multiple tissues or times from the same animal: choose Matched or repeated. If you cannot establish the relationship, choose Mixed or uncertain for exploratory preparation.'),
    textAreaInput('guide_design_notes','Design and exclusion notes (optional)',placeholder='Record matching across tissues, independent time cohorts, exclusions and reasons.'),
    p('Replicate labels such as M3 do not establish animal matching across tissues. This design record does not automatically change the statistical model.')),
  div(id='guide-sample-selection',class='guide-panel',h3('3. Choose samples'),uiOutput('guide_sample_summary')),
  div(id='guide-design-review',class='guide-panel',h3('4. Confirm your review'),
    uiOutput('guide_design_receipt_token'),
    checkboxInput('guide_design_confirm','I reviewed the labels, selected samples and design above.',FALSE),
    p(id='guide_design_confirm_help','Check this box after reviewing the three sections above. Changing sample labels, selected samples, or restoring a session asks you to review again.'),
    guide_link('Continue to Quality →',step=3)))
guide_quality_ui <- function() div(class='guide-page',
  guide_heading(3,'Check quality and prepare your data','Review detection before imputation, then check distributions and unusual samples.'),
  div(class='guide-columns',div(class='guide-panel',guided_preparation_controls('qc_pca_tab')),
    div(class='guide-panel',h3('Prepare'),uiOutput('guide_quality_status'),div(id='guide-running-status',role='status','Preparing the selected measurements… Please wait for completion before continuing.'),div(id='guide-run-controls'),
      p('QRILC assumes missing values reflect low abundance. Missingness alone does not establish that cause. An 80% global filter can remove tissue-specific signals.'))),
  div(class='guide-panel',id='guide-qc-review',tabindex='-1',h3('Review sample quality'),
    p('Use this plot to guide a careful review of your prepared samples.'),
    tags$ol(
      tags$li('Click a point or choose a sample from the list to see its ID and metadata.'),
      tags$li('Investigate unusual patterns in their technical and biological context. A point alone does not establish an outlier.'),
      tags$li('If you decide to exclude a sample, enter your reason, review and confirm the exclusion.'),
      tags$li('Click Update prepared data to apply the decision. You can undo it and update again; the original data remain unchanged.')),
    uiOutput('qc_pca_tab-guided_qc_status'),plotly::plotlyOutput('qc_pca_tab-guided_qc_plot',height='380px'),
    uiOutput('qc_pca_tab-guided_qc_select_ui'),uiOutput('qc_pca_tab-guided_qc_selection'),uiOutput('qc_pca_tab-guided_qc_decisions'),
    div(class='guide-actions',downloadButton('qc_pca_tab-guided_qc_plot_csv','Plot data CSV'),downloadButton('qc_pca_tab-guided_qc_plot_png','PNG'),downloadButton('qc_pca_tab-guided_qc_plot_svg','SVG'),downloadButton('qc_pca_tab-guided_qc_plot_pdf','PDF')),
    downloadButton('qc_pca_tab-guided_qc_download','Download sample decisions')),
  uiOutput('guide_quality_next'))
guide_question_ui <- function() div(class='guide-page',
  guide_heading(4,'What would you like to find out?','Choose one question below. Start with the big picture to inspect patterns before testing group differences.'),
  div(class='guide-goals',
    actionButton('guide_goal_overview',tagList(h3('Explore the big picture'),p('Sample grouping, composition and abundance patterns.'))),
    actionButton('guide_goal_compare',tagList(h3('Compare conditions'),p('Differences between groups and lipid-set enrichment.'))),
    actionButton('guide_goal_structure',tagList(h3('Explore lipid structures'),p('Chain length, unsaturation, proportions and networks.'))),
    actionButton('guide_goal_function',tagList(h3('Explore biological functions'),p('Functional ratios, pathways and cellular indices.'))),
    actionButton('guide_goal_time',tagList(h3('Explore changes over time'),p('Time courses with an explicit independent or repeated design.')))),
  uiOutput('guide_question_summary'),uiOutput('guide_question_requirements'),
  div(id='guide-contrast-controls',class='guide-panel',h3('Define comparisons'),
    p('Reference is the baseline. Comparison is the group measured against it. Positive fold changes mean higher abundance in Comparison. Keep the groups separate and review the statistical method before interpreting differences.')),
  guide_next(5,'Open results and tools →'))
guide_results_ui <- function() div(class='guide-page',
  guide_heading(5,'Explore and understand your results','Explore the interactive dashboard, download the data behind each plot, or open a specialized analysis below.'),
  guided_advanced_controls("qc_pca_tab"),
  results_dashboard_ui(),
  uiOutput('guide_recommended'),
  tags$details(tags$summary('All analysis tools (advanced)'),div(class='guide-tool-grid',lapply(guide_tools,function(x)guide_link(x,tool=x)))),
  div(class='guide-panel',h3('Read results in context'),p('Use Show Statistic Detail within a module to inspect its test and assumptions. Associations and derived cellular indices do not establish causality or a cellular diagnosis.'),
    guide_link('Trace a measurement',tool='Math Proof')),guide_next(6,'Explore the 3D cell →'))
guide_share_ui <- function() div(class='guide-page',
  guide_heading(7,'Share and reproduce','Save the prepared data, sample labels and methods record together. Add a session ZIP if you want to resume the analysis later.'),
  uiOutput('guide_share_summary'),
  div(class='guide-tool-grid',
    div(class='guide-panel',h3('1. Save the prepared data'),actionButton('data_hub-downloadPostNAData','Download prepared data',class='btn-primary'),
      div(style='display:none',downloadButton('data_hub-downloadPostNADataDirect','Direct Download')),
      p('Downloads the numerical matrix used by the current analysis. If samples were treated as outliers, choose the before/after version in the download dialog.')),
    div(class='guide-panel',h3('2. Save labels and methods'),downloadButton('guide_report','Download methods and decisions',class='btn-primary'),
      downloadButton('guide_metadata_csv','Download sample labels (CSV)'),
      downloadButton('companion_actions_csv','Download companion actions (CSV)'),
      p('Companion actions are session-local. Save this log before closing or restoring a session.'),
      p('Save both files. The labels CSV marks which samples were included in the applied run. The methods record lists preparation settings, selected samples, design notes, the current contrast and run history.')),
    div(class='guide-panel',h3('3. Save a session to resume later'),downloadButton('data_hub-export_session_btn','Export Session',class='btn-primary'),
      p('Restore this ZIP from Experiment, review and confirm Design, then click Prepare data in Quality to rebuild results. Save Methods and decisions separately to preserve guided design notes and run history.')),
    div(class='guide-panel',h3('Figures and tables (optional)'),actionButton('guide_export_studio','Open Publication Export Studio',class='btn-primary'),
      p('First open a result in step 5. In the studio, choose that figure and download PDF or another format. Per-figure PDF and CSV buttons also remain inside each analysis.'))),
  div(class='guide-panel',h3('Runs in this session'),DT::DTOutput('guide_history'),
    p('History is kept for this browser session and included in the workflow record. The original session ZIP does not restore this new history.')),
  guide_link('Author and citation',tool='About & Citation'))

guide_bone_sample_ids <- function(md) {
  if(is.null(md)||!'FullName' %in% names(md))return(character())
  as.character(md$FullName[grepl('(^|_)(Femur|Lumbar|Skull|Sternum)(_|$)',md$FullName,ignore.case=TRUE)])
}
guide_workbook_label <- function(path) {
  name<-basename(path)
  if(grepl('Neutrophils',name,ignore.case=TRUE))return('Bone neutrophils — Femur, Lumbar, Skull and Sternum')
  if(grepl('LPS',name,ignore.case=TRUE))return('LPS time course — bones and organs (choose samples in Design)')
  name
}
guide_tool_description <- function(tool) switch(tool,
  'Quality Check'='Start here: inspect distributions, sample grouping and unusual measurements.',
  'Composition'='View the broad lipid classes and their relative abundance across sample groups.',
  'Heatmap'='Explore abundance patterns across individual lipids and sample groups.',
  'Volcano Plot'='Find lipid differences for the chosen reference and comparison groups.',
  'LSEA'='Test whether lipid sets are enriched among the measured differences.',
  'Violin Plots'='Inspect distributions for individual lipids in the selected comparison.',
  'Structural'='Compare chain length and unsaturation among lipids associated with the selected comparison.',
  'Main Class & Acyl Chain Proportions'='Inspect class proportions and acyl-chain composition.',
  'Structural Grid'='Explore chain-length and unsaturation patterns by lipid class.',
  'Functional Ratios'='Inspect derived ratios; review their assumptions before biological interpretation.',
  'Lipid Pathways'='Explore pathway-level summaries of the measured lipidome.',
  'Cellular Organization'='Explore derived cellular indices; these do not establish a cellular diagnosis.',
  'Longitudinal'='Inspect a time course after mapping time points and the independent or repeated design.',
  'Open this tool and review its help and statistical details.')
guide_design_issues <- function(confirmed,unit,type) {
  issues <- list()
  if(!nzchar(trimws(unit %||% ''))) issues[[length(issues)+1L]] <- list(id='guide_unit',message='Enter what was independently sampled, for example Animal or donor.')
  if(!isTRUE(type %in% c('independent','paired','uncertain'))) issues[[length(issues)+1L]] <- list(id='guide_design_type',message='Choose a relationship between samples: Independent, Matched or repeated, or Mixed or uncertain.')
  if(!isTRUE(confirmed)) issues[[length(issues)+1L]] <- list(id='guide_design_confirm',message='Check the review box: “I reviewed the labels, selected samples and design above.”.')
  issues
}
guide_valid_design <- function(confirmed,unit,type) length(guide_design_issues(confirmed,unit,type))==0L
guide_allows_unpaired_de <- function(confirmed,unit,type) {
  guide_valid_design(confirmed,unit,type) && identical(type,'independent')
}
guide_allows_inference <- function(confirmed,unit,type,synthetic_ids=character(),paired=FALSE) {
  guide_valid_design(confirmed,unit,type) &&
    identical(type,if(isTRUE(paired))'paired' else 'independent') &&
    length(synthetic_ids)==0L
}
guide_longitudinal_block_reasons <- function(design_type, md) {
  reasons <- character()
  if (!identical(design_type, 'paired'))
    reasons <- c(reasons, 'This study records independent donor samples. Longitudinal significance tests require verified repeated measurements from the same donor. Keep the independent design label for this study; use descriptive views to explore group patterns.')
  times <- if (!is.null(md) && 'TimePoint' %in% names(md))
    unique(as.character(md$TimePoint)) else character()
  times <- times[!is.na(times) & nzchar(times) & times != 'Unspecified']
  if (length(times) < 2L)
    reasons <- c(reasons, 'Fewer than two sampling times are mapped in TimePoint. A longitudinal analysis needs at least two real time points.')
  id_col <- intersect(c('PatientNumber','Patient_ID'), names(md))
  ids <- if (length(id_col)) as.character(md[[id_col[1]]]) else character()
  ids <- ids[!is.na(ids) & nzchar(ids) & ids != 'Unspecified']
  if (!length(ids))
    reasons <- c(reasons, 'No donor or patient identifier is mapped. Repeated measurements need a verified subject ID; replicate numbers alone do not establish matching.')
  reasons
}
guide_valid_contrast <- function(ref,comp) length(ref)>0&&length(comp)>0&&!any(ref %in% comp)
# Build history only from one committed controller state and its complete matrix.
# Pending inputs and separately updating audit reactives are not run receipts.
guide_completed_run_record <- function(state, matrix, loaded_files=character(), restore_generation=0L) {
  if (!is.list(state) || !isTRUE(state$data_available) || is.null(state$applied) ||
      is.null(matrix) || !is.data.frame(matrix) || !'Lipid_Name' %in% names(matrix)) return(NULL)
  applied <- state$applied
  if (is.null(applied$revision) || !identical(state$revision,applied$revision) ||
      !identical(as.character(matrix$Lipid_Name),as.character(applied$output_lipids)) ||
      !identical(setdiff(names(matrix),'Lipid_Name'),as.character(applied$output_samples))) return(NULL)
  settings <- applied$spec$settings; filter <- applied$filter
  if (is.null(settings) || is.null(filter) || !identical(nrow(matrix),as.integer(filter$retained)) ||
      !inherits(applied$completed_at,'POSIXct') || length(applied$completed_at)!=1L || is.na(applied$completed_at)) return(NULL)
  key <- digest::digest(list(restore_generation,applied$spec$data_id,applied$revision,applied$request_id),algo='sha256')
  completed_at <- applied$completed_at
  # The filter preview may contain a vector named samples. Never let that
  # shadow the scalar count used by the Share table and methods record.
  filter$samples <- NULL
  c(list(key=key, sample_ids=as.character(applied$output_samples),
    experiment=paste(loaded_files,collapse='; '),
    time=format(completed_at,tz='UTC',usetz=TRUE)),filter,
    list(sample_count=as.integer(length(applied$output_samples)),
      samples=as.integer(length(applied$output_samples)),seed=settings$imputationSeed,
      imputation=if(isTRUE(settings$useImputation))'QRILC' else 'No imputation',
      normalization=settings$normalizationMethod))
}

guide_history_table <- function(history) {
  if(!length(history))return(data.frame(Status='No completed preparation runs in this session.'))
  do.call(rbind,lapply(history,function(a) {
    stopifnot(length(a$sample_count)==1L,length(a$retained)==1L)
    data.frame(Run=a$run,Experiment=a$experiment,Time=a$time,
      Lipids=a$retained,Samples=a$sample_count,Detection=a$threshold,
      Scope=a$scope,Imputation=a$imputation,Normalization=a$normalization,Seed=a$seed)
  }))
}

guide_history_append <- function(history, last_key, record) {
  if(is.null(record) || identical(record$key,last_key))
    return(list(history=history,last_key=last_key,added=FALSE))
  record$run <- length(history)+1L
  list(history=append(history,list(record)),last_key=record$key,added=TRUE)
}

# A restored Classic tab name is not a Team workflow position. Route each
# completed restore generation to the design review exactly once.
guide_restore_route <- function(completed, restoring, generation, last_routed) {
  if(!isTRUE(completed) || isTRUE(restoring) || length(generation)!=1L ||
      is.na(generation) || identical(generation,last_routed)) return(NULL)
  list(destination='Design',generation=generation)
}

# Only an explicitly configured directory can supply server-local workbooks.
# Resolve every candidate and require it to remain directly inside that root.
guide_local_workbook_root <- function(value=Sys.getenv('LIPIDOMIC_LOCAL_WORKBOOK_DIR',unset='')) {
  if(!is.character(value) || length(value)!=1L || !nzchar(trimws(value))) return(NULL)
  path <- tryCatch(normalizePath(path.expand(value),mustWork=TRUE),error=function(e)NULL)
  if(is.null(path) || !dir.exists(path)) NULL else path
}
guide_resolved_local_workbook <- function(path,root) {
  if(is.null(root) || !is.character(path) || length(path)!=1L ||
      !grepl('\\.xlsx$',path,ignore.case=TRUE)) return(NULL)
  resolved <- tryCatch(normalizePath(path,mustWork=TRUE),error=function(e)NULL)
  if(is.null(resolved) || !identical(dirname(resolved),root) ||
      isTRUE(file.info(resolved)$isdir)) return(NULL)
  resolved
}
guide_local_workbooks <- function(root=guide_local_workbook_root()) {
  if(is.null(root)) return(character())
  candidates <- list.files(root,pattern='\\.xlsx$',full.names=TRUE,recursive=FALSE,ignore.case=TRUE)
  candidates[vapply(candidates,function(path)!is.null(guide_resolved_local_workbook(path,root)),logical(1))]
}

guided_workflow_server <- function(input,output,session,shared_data) {
  safe <- function(f) tryCatch(f(),error=function(e)NULL)
  sample_metadata_import_server('sample_metadata_import',
    sample_ids=reactive({
      raw <- safe(shared_data$rawData)
      if(is.null(raw)||is.null(raw$data)) return(character())
      setdiff(names(raw$data),'Lipid_Name')
    }),
    on_confirm=shared_data$set_external_sample_metadata)
  skip_extra_metadata <- reactiveVal(FALSE)
  observeEvent(input$guide_skip_extra_metadata, {skip_extra_metadata(TRUE)}, ignoreInit=TRUE)
  metadata_choice_ready <- reactive({
    !is.null(safe(shared_data$external_sample_metadata)) || isTRUE(skip_extra_metadata())
  })
  experiment_stage <- reactive({
    if (is.null(safe(shared_data$rawData))) return('needs_abundance')
    if (!is.null(safe(shared_data$external_sample_metadata))) return('metadata_confirmed')
    if (isTRUE(skip_extra_metadata())) return('metadata_skipped')
    'metadata_pending'
  })
  step <- reactiveVal(1L); tool <- reactiveVal(''); goal <- reactiveVal('overview')
  history <- reactiveVal(list())
  metadata <- reactive(safe(shared_data$all_metadata))
  ready <- reactive({
    state <- safe(shared_data$preparation_state)
    is.list(state) && isTRUE(state$data_available) && !is.null(state$applied) &&
      !is.null(safe(shared_data$data_processed))
  })
  selected_samples <- reactive(safe(shared_data$selected_cols) %||% character())
  applied_samples <- reactive(safe(shared_data$applied_sample_ids) %||% character())
  # The confirmation is bound to the reviewed, rendered design. A checkbox value
  # alone can arrive from an old browser state or the same flush as a changed input.
  design_projection <- function(md) {
    if(is.null(md)) return(NULL)
    md[intersect(c('FullName','DisplayLabel','Cluster','Group1','Group2','Replicate',
      'PatientNumber','TimePoint','TimePoint_Group1'),names(md))]
  }
  design_token <- reactive({
    if(isTRUE(safe(shared_data$is_restoring)) || is.null(safe(shared_data$rawData))) return(NULL)
    digest::digest(list(
      data_id=safe(shared_data$preparation_data_id),
      restore_generation=safe(shared_data$restore_generation),
      selected=selected_samples(),
      metadata=design_projection(metadata()),
      external=safe(shared_data$external_sample_metadata),
      unit=input$guide_unit, relationship=input$guide_design_type
    ),algo='sha256')
  })
  reviewed_token <- reactiveVal(NULL)
  output$guide_design_receipt_token <- renderUI(
    tags$span(id='guide-current-review-token', `data-guide-review-token`=design_token() %||% '',hidden=NA))
  observeEvent(design_token(), {
    if(!identical(isolate(reviewed_token()),design_token())) {
      reviewed_token(NULL)
      updateCheckboxInput(session,'guide_design_confirm',value=FALSE)
    }
  },ignoreNULL=FALSE,priority=100)
  observeEvent(input$guide_review_receipt,{
    receipt<-input$guide_review_receipt
    reviewed_token(if(is.list(receipt) && isTRUE(receipt$checked) &&
      !is.null(design_token()) && identical(receipt$token,design_token())) design_token() else NULL)
  },ignoreNULL=FALSE,priority=90)
  review_confirmed <- reactive(isTRUE(input$guide_design_confirm) &&
    !is.null(design_token()) && identical(reviewed_token(),design_token()))
  design_issues <- reactive({
    if(isTRUE(safe(shared_data$is_restoring))) return(list(list(id="guide_design_confirm", message="Your saved session is still loading. Wait for restoration to finish, then review and confirm the design.")))
    issues<-guide_design_issues(review_confirmed(),input$guide_unit,input$guide_design_type)
    if(!is.null(safe(shared_data$rawData))&&!length(selected_samples())) issues<-c(list(list(id='data_hub-selectedColumns',message='Select at least one sample in “Choose samples”.')),issues)
    issues
  })
  design_ok <- reactive(length(design_issues())==0L)
  design_attempted <- reactiveVal(FALSE)
  longitudinal_blocked <- reactiveVal(FALSE)
  require_design <- function(target=NULL) {
    design_attempted(TRUE)
    step(2L);tool('');bslib::nav_select('main_navbar','Design',session=session)
    issues <- design_issues()
    if(is.null(target)) target <- if(length(issues)) issues[[1]]$id else 'guide_design_type'
    session$onFlushed(function(){session$sendCustomMessage('guide-focus',list(id=target))},once=TRUE)
  }
  output$guide_design_status <- renderUI({
    issues <- design_issues()
    blocked_note <- if(isTRUE(longitudinal_blocked())) {
      reasons <- guide_longitudinal_block_reasons(input$guide_design_type,metadata())
      if(length(reasons)) div(class='guide-pending',h3('Why Longitudinal is unavailable'),
        lapply(reasons,p))
    }
    if(!length(issues)) return(div(class='guide-design-status guide-design-ready',role='status',h3('Design review complete'),
      p('You can continue to Quality. Your choices and notes will be included in the workflow record.'),
      blocked_note,
      guide_link('Continue to Quality →',step=3)))
    div(class=paste('guide-design-status',if(design_attempted())'guide-design-required'),role='status',
      h3(sprintf('%d %s left before Quality',length(issues),if(length(issues)==1)'item' else 'items')),
      p('Use the links below to go directly to each required field. Design notes are optional.'),
      tags$ol(lapply(issues,function(issue)tags$li(tags$button(type='button',class='guide-design-jump',`data-guide-focus`=issue$id,issue$message)))),blocked_note)
  })
  go <- function(i,check=TRUE) {
    if(check && i>1 && is.null(safe(shared_data$rawData))) {showNotification('Choose an existing workbook or upload abundance files in Experiment first.',type='warning');i<-1L}
    if(check && i>2 && !design_ok()) {require_design();return()}
    if(check && i>3 && !ready()) {i<-3L;session$onFlushed(function(){session$sendCustomMessage('guide-focus',list(id='data_hub-runAnalysis'))},once=TRUE)}
    step(i);tool('');bslib::nav_select('main_navbar',guide_steps[i],session=session)
  }
  statistical_design_allowed <- function(x) {
    # These tools display inferential results from the unpaired DE pipeline.
    # Keep Quality, the unfiltered Heatmap and descriptive Composition available.
    unpaired_de_tools <- c('Volcano Plot','LSEA','Structural Grid',
      'Violin Plots','Functional Ratios','Lipid Pathways','Cellular Organization')
    if(!x %in% c(unpaired_de_tools,'Structural','Longitudinal'))return(TRUE)
    if(!design_ok()){require_design();return(FALSE)}
    synthetic_ids <- if(is.function(shared_data$synthetic_sample_ids)) shared_data$synthetic_sample_ids() else character()
    if(length(synthetic_ids)>0L) {
      showNotification('Statistical comparisons are unavailable because this prepared run includes synthetic averaged samples. Prepare a run with measured samples only.',type='warning',duration=12)
      go(3L,FALSE)
      return(FALSE)
    }
    if(identical(input$guide_design_type,'uncertain')) {
      showNotification('For statistical comparisons, establish whether samples are independent or matched. Update the highlighted relationship field in Design. Exploratory quality views remain available.',type='warning')
      require_design('guide_design_type');return(FALSE)
    }
    if(x %in% unpaired_de_tools && identical(input$guide_design_type,'paired')) {
      showNotification('This tool currently uses an unpaired test. Use a validated repeated-measures analysis for matched samples; do not change the design label to bypass this check.',type='warning',duration=12)
      require_design('guide_design_type');return(FALSE)
    }
    if(identical(x,'Longitudinal')) {
      reasons <- guide_longitudinal_block_reasons(input$guide_design_type,metadata())
      if(length(reasons)) {
        longitudinal_blocked(TRUE)
        showNotification('Longitudinal is unavailable for this study. See the reasons on Design.',type='warning',duration=12)
        require_design(if(!identical(input$guide_design_type,'paired'))'guide_design_type' else 'data_hub-openMetadataMappingBtn')
        return(FALSE)
      }
    }
    TRUE
  }
  open_tool <- function(x) {
    if(!x %in% guide_tools)return()
    informational <- x %in% c('App Info','Lexicon','About & Citation','Run comparison')
    if(!informational && !ready()) {go(4);return()}
    if(!statistical_design_allowed(x))return()
    longitudinal_blocked(FALSE)
    tool(x);if(!x %in% c('Quality Check','Run comparison') || step()!=3)step(5L)
    if(x=='Publication Export Studio')step(7L)
    bslib::nav_select('main_navbar',x,session=session)
    updateSelectInput(session,'guide_tool',selected=x)
  }
  focus_steps<-c(guide_unit=2L,guide_design_type=2L,guide_design_confirm=2L,'data_hub-selectedColumns'=2L,'data_hub-openMetadataMappingBtn'=2L,'data_hub-runAnalysis'=3L,'sample_metadata_import-file'=1L,'data_hub-files'=1L)
  observeEvent(input$guide_focus_request,{
    id<-input$guide_focus_request
    if(length(id)!=1||!id %in% names(focus_steps))return()
    go(unname(focus_steps[id]),FALSE)
    session$onFlushed(function(){session$sendCustomMessage('guide-focus',list(id=id))},once=TRUE)
  })
  observeEvent(input[['data_hub-authorizeMetadata']],{go(2,FALSE)},ignoreInit=TRUE,priority=-10)
  observeEvent(input$guide_step,{i<-suppressWarnings(as.integer(input$guide_step));if(length(i)==1&&!is.na(i)&&i%in%1:7)go(i)})
  observeEvent(input$guide_open_tool,open_tool(input$guide_open_tool))
  observeEvent(input$guide_tool,{if(nzchar(input$guide_tool))open_tool(input$guide_tool)},ignoreInit=TRUE)
  for(g in c('overview','compare','structure','function','time')) local({k<-g;observeEvent(input[[paste0('guide_goal_',k)]],{goal(k)})})
  observeEvent(input$main_navbar,{
    x<-input$main_navbar
    if(isTRUE(safe(shared_data$session_restored)) && !design_ok() &&
       !x %in% c('Experiment','Design')) {require_design();return()}
    if(x %in% guide_steps){step(match(x,guide_steps));tool('')}
    else if(x %in% guide_tools){if(!statistical_design_allowed(x))return();tool(x);if(x=='Publication Export Studio')step(7L)else if(!x %in% c('Quality Check','Run comparison')||step()!=3)step(5L)}
  })
  last_routed_restore <- NULL
  observeEvent(list(shared_data$session_restored(),shared_data$restore_generation()),{
    route <- guide_restore_route(shared_data$session_restored(),
      isTRUE(safe(shared_data$is_restoring)),shared_data$restore_generation(),
      last_routed_restore)
    if(is.null(route))return()
    last_routed_restore <<- route$generation
    step(2L);tool('');design_attempted(TRUE)
    session$onFlushed(function() {
      bslib::nav_select('main_navbar',route$destination,session=session)
    },once=TRUE)
  },ignoreInit=TRUE,priority=-20)
  # Keep an already-open statistical tool subject to the current design too.
  # Changing the relationship or invalidating review must not leave a stale tool active.
  observeEvent(list(input$guide_design_type,design_ok(),
                    if(is.function(shared_data$synthetic_sample_ids))shared_data$synthetic_sample_ids() else character()),{
    x<-isolate(tool())
    if(!nzchar(x))x<-isolate(input$main_navbar) %||% ''
    statistical_design_allowed(x)
  },ignoreInit=TRUE)
  observe({session$sendCustomMessage('guide-state',list(
    step=step(),tool=tool(),goal=goal(),selectedSamples=selected_samples(),
    designAttempted=design_attempted(),designIssues=design_issues(),
    experimentStage=experiment_stage(),
    preparationStage=if(!ready()) 'not_prepared' else if(isTRUE(safe(shared_data$preparation_dirty))) 'update_pending' else 'prepared'
  ))})
  # Descriptive fields do not alter the study design; mapped design fields do.
  previous_metadata <- NULL
  observeEvent(metadata(),{
    md<-design_projection(metadata())
    if(is.null(previous_metadata)){
      previous_metadata <<- md
      return()
    }
    if(!identical(md,previous_metadata)){
      previous_metadata <<- md
      updateCheckboxInput(session,'guide_design_confirm',value=FALSE)
    }
  },ignoreInit=FALSE)
  observeEvent(if(is.function(shared_data$dataset_revision))shared_data$dataset_revision() else NULL,{
    updateCheckboxInput(session,'guide_design_confirm',value=FALSE)
    skip_extra_metadata(FALSE)
  },ignoreInit=TRUE)
  previous_selection <- NULL
  observeEvent(selected_samples(),{
    chosen<-selected_samples()
    if(!is.null(previous_selection)&&!identical(chosen,previous_selection))updateCheckboxInput(session,'guide_design_confirm',value=FALSE)
    previous_selection <<- chosen
  },ignoreNULL=FALSE)
  output$guide_context <- renderUI({
    a<-safe(shared_data$preparation_audit)
    if(is.null(a)) return(div(class='guide-context-text',
      if(is.null(safe(shared_data$rawData))) 'Start with an experiment: upload a file or choose a saved workbook.'
      else if(design_ok()) 'Design reviewed. Continue to Quality to prepare your data.'
      else 'Experiment loaded. Review your samples in Design.'))
    dirty<-isTRUE(safe(shared_data$preparation_dirty))
    div(class='guide-run-summary',
      div(class='guide-run-top',
        div(class='guide-run-counts',strong(paste(format(a$retained,big.mark=','),'lipids')),span('·'),strong(paste(a$samples,'samples'))),
        span(class=paste('guide-run-status',if(dirty)'has-changes' else 'is-ready'),if(dirty)'Changes pending' else 'Analysis ready'),
        tags$details(class='guide-method-details',tags$summary('Preparation details'),
          div(class='guide-method-copy',
            p(sprintf('Detection: at least %g%% (%s). Imputation: %s. Normalization: %s. Random seed: %s.',a$threshold,a$scope,a$imputation,a$normalization,a$seed)),
            p('These are the settings used for the results currently shown.')))),
      if(dirty)div(class='guide-run-next',span('Your results still use the last prepared data.'),guide_link('Review changes →',step=3)),
      if(identical(input$guide_design_type,'uncertain'))p(class='guide-run-note','Exploratory analysis: confirm how samples are related before interpreting group tests.'),
      if(tool() %in% c('Volcano Plot','LSEA','Structural','Violin Plots')){
        contrast<-safe(shared_data$de_contrast_info)
        if(length(contrast$ref)&&length(contrast$comp)) tags$details(class='guide-contrast-details',
          tags$summary('Comparison and direction'),
          div(class='guide-contrast-pair',div(span('REFERENCE'),strong(paste(contrast$ref,collapse=', '))),
              div(span('COMPARISON'),strong(paste(contrast$comp,collapse=', ')))),
          p('Positive log2 fold change means higher in Comparison. For other plot scales, read the axis label and plot methods.'))
      })
  })
  local_root <- guide_local_workbook_root()
  local_files <- guide_local_workbooks(local_root)
  output$guide_local_experiments <- renderUI({
    if(!length(local_files))return(p('No saved workbooks found on this computer. Upload your abundance files above.'))
    div(class='guide-panel',h3('Existing data on this computer'),
      selectInput('guide_local_file','Workbook on the lab server',choices=setNames(as.character(seq_along(local_files)),vapply(local_files,guide_workbook_label,'')),selectize=FALSE),
      actionButton('guide_load_local','Open this workbook',class='btn-outline-primary'),
      p('Choose a workbook, then click Open this workbook. The sample-name review opens next. The LPS workbook also contains organs; use Keep bone tissues only in Design for a bone-only analysis.'),
      uiOutput('guide_local_source'))
  })
  output$guide_local_source <- renderUI({
    i<-suppressWarnings(as.integer(input$guide_local_file));req(length(i)==1,!is.na(i),i>=1,i<=length(local_files))
    p(class='guide-source-file',paste('Source file:',basename(local_files[i])))
  })
  observeEvent(input$guide_load_local,{
    i<-suppressWarnings(as.integer(input$guide_local_file));req(length(i)==1,!is.na(i),i>=1,i<=length(local_files))
    resolved <- guide_resolved_local_workbook(local_files[i],local_root)
    if(is.null(resolved)){showNotification('This local workbook is no longer available inside the configured directory.',type='error');return()}
    if(identical(as.character(safe(shared_data$loaded_files)),basename(resolved))){go(2,FALSE);return()}
    shared_data$load_local_workbook(resolved)
  })
  output$guide_experiment_summary <- renderUI({
    r<-safe(shared_data$rawData);if(is.null(r)||is.null(r$data))return(p('No experiment loaded yet.'))
    div(class='guide-next-task',role='status',strong('Abundance matrix loaded'),
      p(sprintf('%s lipid rows · %d measurement columns',format(nrow(r$data),big.mark=','),ncol(r$data)-1)),
      p(if(metadata_choice_ready()) 'Next: review your sample labels and study design.' else 'Next: add sample metadata, or explicitly continue without an additional metadata table.'))
  })
  output$guide_experiment_metadata_prompt <- renderUI({
    r <- safe(shared_data$rawData)
    if (is.null(r) || is.null(r$data))
      return(p(class='guide-pending','First add an abundance matrix in step 1.'))
    if (!is.null(safe(shared_data$external_sample_metadata)))
      return(div(class='guide-next-task',role='status',strong('Sample metadata confirmed.'),
        p('Its matched fields are available for Design review. You can replace the table below if needed.')))
    if (isTRUE(skip_extra_metadata()))
      return(div(class='guide-next-task',role='status',strong('Continuing without additional metadata.'),
        p('Design will use the sample information already derived from the abundance matrix. You may still add a table below.')))
    div(class='guide-next-task',role='status',strong('Next: add sample metadata'),
      p('Use a CSV or XLSX table whose sample IDs exactly match the matrix columns, or choose to continue without an additional table.'),
      div(class='guide-actions',guide_focus_link('Go to metadata file picker','sample_metadata_import-file'),
        actionButton('guide_skip_extra_metadata','Continue without additional metadata',class='btn-outline-secondary')))
  })
  output$guide_experiment_next <- renderUI({
    if (is.null(safe(shared_data$rawData)))
      return(p(class='guide-pending','Add the abundance matrix in step 1 before Design.'))
    if (!metadata_choice_ready())
      return(p(class='guide-pending','Confirm sample metadata or choose “Continue without additional metadata” in step 2.'))
    guide_next(2,'Continue to study design →')
  })
  output$guide_metadata <- DT::renderDT({
    md<-metadata();validate(need(!is.null(md),'Upload files, then open the metadata editor to confirm the mapping.'))
    keep<-intersect(c('FullName','Group1','Group2','TimePoint','PatientNumber','Replicate'),names(md))
    labels<-c(FullName='Sample',Group1='Condition / cell type',Group2='Tissue / sample type',TimePoint='Time point',PatientNumber='Animal / donor ID',Replicate='Replicate ID')
    view<-data.frame(Next_run=ifelse(md$FullName %in% selected_samples(),'Included','Excluded'),md[,keep,drop=FALSE],check.names=FALSE)
    DT::datatable(view,colnames=c('Next run',unname(labels[keep])),rownames=FALSE,options=list(pageLength=5,lengthMenu=c(5,10,25,100),scrollX=TRUE))
  })
  output$guide_time_label_hint <- renderUI({
    md<-metadata();req(md)
    times<-unique(md$TimePoint);times<-times[!is.na(times)&!times %in% c('','Unspecified')]
    if(length(times)<2&&any(grepl('[0-9]+[[:space:]]*(hr|h|min|day)',md$Group1,ignore.case=TRUE)))
      div(class='guide-pending',p('Some condition labels look like sampling times, but the Time point column is not mapped. For a time-course analysis, open the label editor and map the part that contains time. Do not infer repeated animals from replicate labels.'),guide_focus_link('Go to label editor','data_hub-openMetadataMappingBtn'))
  })
  output$guide_question_summary <- renderUI({
    contrast<-safe(shared_data$de_contrast_info);ref<-contrast$ref;comp<-contrast$comp
    div(class='guide-panel',h3(switch(goal(),overview='Explore the big picture',compare='Compare conditions',structure='Explore lipid structures',`function`='Explore biological functions',time='Explore changes over time')),
      if(goal()=='overview')p('Start with PCA, composition or a heatmap. A two-group contrast is not required.') else
      if(goal()=='time')p('Confirm time ordering and experimental units. Independent time cohorts must not be treated as repeated measurements of the same animal.') else
      if(guide_valid_contrast(ref,comp))p(paste('Current comparison:',paste(comp,collapse=', '),'against',paste(ref,collapse=', '))) else
        p(class='guide-pending','Choose different, non-overlapping Reference and Comparison groups below. Reference is the baseline.'))
  })
  output$guide_sample_summary <- renderUI({
    md<-metadata();req(md)
    chosen<-selected_samples();bones<-guide_bone_sample_ids(md)
    div(class='guide-selection-summary',
      p(id='data_hub-selectedColumns_help',strong(sprintf('%d of %d measurements selected for the next preparation run.',length(chosen),nrow(md))),
        if(length(chosen)==nrow(md))' All samples are included by default.' else ' Only checked samples are included.'),
      if(!length(chosen))p(class='guide-pending','Select at least one sample before continuing.'),
      if(length(bones)&&length(bones)<nrow(md))tagList(p('This workbook includes bone tissues and other samples. For a bone-only analysis, use the shortcut below.'),actionButton('guide_bones_only','Keep bone tissues only',class='btn-outline-primary')),
      p('Open Sample Selection below to customize the selection. Use subgroup All / None links for tissues or check individual measurements.'))
  })
  observeEvent(input$guide_bones_only,{ids<-guide_bone_sample_ids(metadata());req(length(ids));shared_data$set_selected_cols(ids)})
  observe({
    preview <- tryCatch(shared_data$detection_preview(), error=function(e) NULL)
    valid <- !is.null(preview) && is.null(preview$error) && length(preview$retained)==1L && is.finite(preview$retained) && preview$retained>=2
    session$sendCustomMessage("guide-qc-prepare-enabled",list(enabled=valid))
  })
  output$guide_quality_status <- renderUI({
    preview<-tryCatch(shared_data$detection_preview(),error=function(e) NULL)
    if(!is.null(preview) && (!is.null(preview$error) || (length(preview$retained)==1L && is.finite(preview$retained) && preview$retained < 2))) return(div(class='guide-next-task guide-pending',role='status',p(strong('Preparation unavailable: the detection preview must retain at least two lipids.')),p(preview$error %||% 'Adjust the detection settings before preparing.')))
    if(!ready())return(div(class='guide-next-task',role='status',p(strong('Next: review the three settings, then click Prepare data.')),p(sprintf('%d measurements selected. Review detection, missing-value handling and normalization on the left. When preparation finishes, review the sample quality plot.',length(selected_samples())))))
    if(isTRUE(safe(shared_data$preparation_dirty))) return(div(class='guide-next-task',role='status',p(strong('Changes are pending.')),p('Review your settings or sample decisions, then click Update prepared data in the preparation controls. The plot and results still show the previous prepared run.'),guide_focus_link('Go to Update prepared data button','data_hub-runAnalysis')))
    div(class='guide-next-task',role='status',p(strong('Preparation complete. Next: review sample quality.')),p('Inspect the plot and sample details before choosing whether a decision is needed.'),tags$a(class='guide-button',href='#guide-qc-review','Review sample quality ↓'))
  })
  output$guide_quality_next <- renderUI({
    if(!ready())return(div(class='guide-actions',guide_focus_link('Go to Prepare data button','data_hub-runAnalysis')))
    div(class='guide-actions',guide_link(if(isTRUE(safe(shared_data$preparation_dirty)))'Continue with the previous applied run →' else 'After reviewing quality, continue to My question →',step=4))
  })
  question_requirements <- reactive({
    messages<-character()
    if(goal()!='overview'&&identical(input$guide_design_type,'uncertain'))messages<-c(messages,'Your design review is complete, but animal/sample matching is still uncertain. Resolve independent versus matched measurements before interpreting statistical comparisons. You can explore patterns with Quality Check, Composition and Heatmap meanwhile.')
    if(goal()=='time'){
      md<-metadata();tp<-unique(md$TimePoint);tp<-tp[!is.na(tp)&!tp %in% c('','Unspecified')]
      if(length(tp)<2)messages<-c(messages,'This experiment does not have at least two mapped time points. Edit sample labels in Design before using Longitudinal. A tissue comparison without mapped sampling times is not a time course.')
    }
    messages
  })
  output$guide_question_requirements <- renderUI({
    messages<-question_requirements();if(!length(messages))return(NULL)
    div(class='guide-panel guide-pending',h3('Before interpreting this question'),lapply(messages,p),
      guide_focus_link('Review sample relationships','guide_design_type'),
      if(goal()=='time')guide_focus_link('Go to label editor','data_hub-openMetadataMappingBtn'),
      guide_link('Choose an exploratory question',step=4))
  })
  output$guide_share_summary <- renderUI({
    a<-safe(shared_data$preparation_audit);req(a)
    div(class='guide-next-task',p(strong(sprintf('Ready to save: %s lipids × %d measurements in the applied run.',format(a$retained,big.mark=','),a$samples))),
      p('Save the prepared matrix, labels CSV and methods record in the same folder. After restoring the session ZIP, confirm Design and click Prepare data in Quality to rebuild results. Keep the methods record for guided design notes and run history.'),
      if(isTRUE(safe(shared_data$preparation_dirty)))p(class='guide-pending','Pending changes are not included in these applied results. Return to Quality and update preparation to apply them.'))
  })
  recommended <- reactive(switch(goal(),overview=c('Quality Check','Composition','Heatmap'),compare=c('Volcano Plot','LSEA','Violin Plots'),structure=c('Structural','Main Class & Acyl Chain Proportions','Structural Grid'),`function`=c('Functional Ratios','Lipid Pathways','Cellular Organization'),time='Longitudinal'))
  output$guide_recommended <- renderUI(div(class='guide-panel',h3('Recommended tools'),
    if(length(question_requirements()))tagList(p(class='guide-pending',paste(question_requirements(),collapse=' ')),guide_focus_link('Review the required design labels','guide_design_type'),p('Quality Check, Composition and Heatmap remain available for exploratory work.')),
    div(class='guide-tool-grid',lapply(recommended(),function(x)div(class='guide-tool-card',guide_link(x,tool=x),p(guide_tool_description(x)))))))
  last_run_key <- NULL
  observeEvent(shared_data$preparation_state()$revision,{
    state <- shared_data$preparation_state()
    matrix <- safe(shared_data$data_processed_unfiltered)
    generation <- safe(shared_data$restore_generation) %||% 0L
    record <- guide_completed_run_record(state,matrix,
      loaded_files=safe(shared_data$loaded_files) %||% character(),
      restore_generation=generation)
    update <- guide_history_append(history(),last_run_key,record)
    if(!update$added) return()
    last_run_key <<- update$last_key
    history(update$history)
  },ignoreNULL=FALSE)
  history_table <- reactive(guide_history_table(history()))
  output$guide_history <- DT::renderDT(DT::datatable(history_table(),rownames=FALSE,options=list(dom='t',scrollX=TRUE)))
  observeEvent(input$guide_export_studio,{req(ready());show_publication_export_studio_modal(session)})
  output$guide_metadata_csv <- downloadHandler(filename=function()'sample-metadata.csv',content=function(file){md<-metadata();req(md);md$Included_in_applied_run<-md$FullName %in% applied_samples();md$Selected_for_next_run<-md$FullName %in% selected_samples();write.csv(sample_metadata_csv_safe(md),file,row.names=FALSE)})
  output$guide_report <- downloadHandler(filename=function()paste0('lipidomics-workflow-',Sys.Date(),'.txt'),content=function(file){
    a<-safe(shared_data$preparation_audit);req(a)
    contrast<-safe(shared_data$de_contrast_info); settings<-safe(shared_data$de_settings)
    lines<-c('Libreros Lab — Lipidomic Explorer workflow record',paste('Created:',format(Sys.time(),tz='UTC',usetz=TRUE)),
      paste('Software version:',app_version),paste('Loaded files:',paste(shared_data$loaded_files(),collapse='; ')),'','STUDY DESIGN',paste('Experimental unit:',input$guide_unit),paste('Sample relationship:',input$guide_design_type),
      paste('Design reviewed:',isTRUE(input$guide_design_confirm)),paste('Notes:',input$guide_design_notes),'','APPLIED PREPARATION',
      sprintf('Lipids: %d loaded; %d retained; %d excluded before imputation.',a$input,a$retained,a$excluded),
      sprintf('Samples: %d. Entirely undetected lipid rows: %d.',a$samples,a$all_absent),
      sprintf('Missing measurements: %.1f%% before filtering; %.1f%% among retained measurements before imputation.',100*a$raw_missing,100*a$retained_missing),
      sprintf('Detection threshold: %g%%; scope: %s.',a$threshold,a$scope),
      sprintf('Imputation: %s. Normalization: %s. Random seed: %s.',a$imputation,a$normalization,a$seed),
      paste('Samples included in the applied run:',paste(applied_samples(),collapse=', ')),paste('Samples selected for the next run:',paste(selected_samples(),collapse=', ')),
      paste('Pending preparation changes:',isTRUE(safe(shared_data$preparation_dirty))),
      '', 'SAMPLE QUALITY DECISIONS', if (is.null(safe(shared_data$qc_decisions)) || !nrow(safe(shared_data$qc_decisions))) 'No guided sample decisions recorded.' else capture.output(print(safe(shared_data$qc_decisions),row.names=FALSE)), '', 'CURRENT QUESTION AND CONTRAST',paste('Question:',goal()),
      paste('Reference:',paste(contrast$ref,collapse=', ')),paste('Comparison:',paste(contrast$comp,collapse=', ')),
      paste('Statistical method setting:',settings$method),paste('P-value type:',settings$p_value_type),
      paste('P-value threshold:',settings$p_threshold),paste('Absolute log2 fold-change threshold:',settings$log2fc_threshold),
      'These are current controls; confirm the selected test and its assumptions in the figure statistics.',
      '','SESSION RUN HISTORY',unlist(lapply(history(),function(h)c(paste('Run',h$run,'—',h$time),paste('Experiment:',h$experiment),
        sprintf('%d lipids; %d samples; detection %g%% (%s); %s; %s normalization; seed %s.',h$retained,h$sample_count,h$threshold,h$scope,h$imputation,h$normalization,h$seed)))),
      '','LIMITATIONS','The design record does not automatically select or change the statistical model.',
      'QRILC assumes left-censored missingness. NA values alone do not demonstrate this mechanism.',
      'Default preparation settings are starting values, not an approved scientific protocol.',
      if(identical(input$guide_design_type,'uncertain'))'Animal/donor matching remains unresolved. Do not interpret statistical comparisons until the experimental-unit relationships and test are established.',
      'A session ZIP restores source data and saved settings. Review and confirm Design, then click Prepare data in Quality to rebuild results. Previous run history is not restored.',
      paste('Advanced PCA settings:',paste(capture.output(str(safe(shared_data$pca_settings))),collapse=' ')),
      'Advanced individual-lipid PCA: prcomp on log2(pmax(prepared abundance, 0) + 1), centered and scaled to unit variance after removing near-constant lipids. Class PCA sums linear prepared abundances and uses NIPALS.',
      paste('Dashboard PCA:', if(identical(input[['results_dashboard-pca_transform']], 'linear')) 'linear complete finite prepared abundances' else 'log10 of positive complete prepared abundances', '; centered; scaling:', input[['results_dashboard-pca_scale']] %||% 'uv'),
      paste('Actual differential method:',safe(shared_data$actual_method) %||% 'Not executed'),
      'Differential group tests in this workflow are unpaired; the design description alone does not change a model.',
      'The current contrast can differ from earlier figures; export figures together with their own statistical details.',
      'Save the session ZIP and sample metadata alongside this record. Run history is session-local.',
      '','AUTHOR','Global Lipidomic Explorer: Maxence Tricaud, Libreros Lab. Preserve original method citations.')
    writeLines(lines,file,useBytes=TRUE)
  })
  outputOptions(output,'guide_metadata_csv',suspendWhenHidden=FALSE)
  outputOptions(output,'guide_report',suspendWhenHidden=FALSE)
  invisible(list(step=step,tool=tool,goal=goal,history=history,design_ok=design_ok,design_issues=design_issues,require_design=require_design))
}
