# Opt-in integration presentation. All scientific calculations remain in the shared hub.
guided_shared_enabled <- function() identical(Sys.getenv('LIPIDOMIC_INTERFACE','classic'),'guided')
guided_shared_steps <- c('Experiment','Design','Quality Check','Question','Results','3D Show','Share')
guide_heading <- function(n,title,description) tagList(tags$small(paste('STEP',n,'OF 7')),h2(title),p(description))
guide_next <- function(n,label) actionButton(paste0('shared_next_',n),label,class='btn-primary')
guided_shared_header <- function() tagList(
  tags$link(rel='stylesheet',href='css/guided_shared.css'),
  tags$script(src='js/guided_shared.js'),
  tags$div(class='shared-guide-nav',role='navigation',`aria-label`='Seven-step workflow',
    lapply(seq_along(guided_shared_steps),function(i) actionButton(paste0('shared_step_',i),paste(i,c('Experiment','Design','Quality','My question','Results','3D Show','Share')[i])))),
  uiOutput('shared_status'))
guided_shared_panels <- function() list(
  nav_panel('Experiment',value='Experiment',div(class='shared-guide-page',
    guide_heading(1,'Start with your experiment','Upload an abundance matrix, then add the sample metadata. Restore an existing session to continue an earlier analysis.'),
    div(id='shared-upload-slot'),div(id='shared-restore-slot',h3('Restore a session ZIP')),guide_next(2,'Next: review sample metadata'))),
  nav_panel('Design',value='Design',div(class='shared-guide-page',
    guide_heading(2,'Tell us what each sample represents','SampleID must match the abundance matrix column exactly. Optional fields remain descriptive unless you map them explicitly.'),
    fileInput('shared_metadata_file','Sample metadata CSV',accept='.csv'),
    uiOutput('shared_metadata_mappings'),uiOutput('shared_metadata_preview'),
    tableOutput('shared_metadata_table'),
    checkboxInput('shared_design_confirm','I have reviewed the sample mapping and study design',FALSE),
    actionButton('shared_metadata_apply','Confirm metadata and study design',class='btn-primary'),
    uiOutput('shared_design_status'),guide_next(3,'Next: prepare data and review QC'))),
  nav_panel('Question',value='Question',div(class='shared-guide-page',
    guide_heading(4,'Define your comparison','Choose the reference and comparison groups. Check the contrast direction before interpreting fold changes.'),
    div(id='shared-contrast-slot'),guide_next(5,'Next: explore results'))),
  nav_panel('Results',value='Results',div(class='shared-guide-page',
    guide_heading(5,'Explore the same prepared data','These tools use the shared Classic scientific pipeline. Open a tool to inspect plots, adjust presentation and download results.'),
    uiOutput('shared_result_summary'),
    div(class='shared-tool-grid',lapply(c('Volcano Plot','Heatmap','Violin Plots','Composition','LSEA','Longitudinal'),function(tool)
      tags$button(type='button',class='btn btn-outline-primary',`data-shared-tool`=tool,tool))),
    guide_next(6,'Next: explore the 3D reference cell'))),
  nav_panel('3D Show',value='3D Show',cell_show_ui()),
  nav_panel('Share',value='Share',div(class='shared-guide-page',
    guide_heading(7,'Save a reproducible session','Export the applied matrix and session ZIP. Pending scientific settings must be applied or reverted first. A restored ZIP requires review before Run Analysis.'),
    div(id='shared-session-slot'),
    downloadButton('shared_matrix_csv','Prepared matrix CSV'),
    downloadButton('shared_metadata_csv','Confirmed metadata CSV'),
    uiOutput('shared_share_status'))))

guided_shared_server <- function(input,output,session,hub,design_bridge) {
  metadata_file <- reactiveVal(NULL); confirmed_token <- reactiveVal(NULL)
  legacy_preview <- reactiveVal(NULL); reviewed_token <- reactiveVal(NULL)
  fields <- c(Group1='Condition',Group2='Tissue',PatientNumber='SubjectID',Replicate='ReplicateID',TimePoint='TimePoint')
  observeEvent(input$shared_metadata_file,{
    legacy_preview(NULL); confirmed_token(NULL)
    tryCatch(metadata_file(read_sample_metadata_v01(input$shared_metadata_file$datapath)),
      error=function(e) {metadata_file(NULL);showNotification(conditionMessage(e),type='error')})
  })
  observeEvent(hub$external_sample_metadata(),{
    md <- hub$external_sample_metadata()
    if (!is.null(md) && (is.null(isolate(metadata_file())) || isTRUE(hub$is_restoring()))) metadata_file(md$display_metadata)
  })
  observeEvent(hub$session_restored(),{
    if (!isTRUE(hub$session_restored())) return()
    confirmed_token(NULL); reviewed_token(NULL)
    updateCheckboxInput(session,'shared_design_confirm',value=FALSE)
    if (!is.null(hub$external_sample_metadata())) {
      legacy_preview(NULL); metadata_file(hub$external_sample_metadata()$display_metadata); return()
    }
    m<-hub$all_metadata();req(m)
    md<-data.frame(SampleID=as.character(m$FullName),stringsAsFactors=FALSE)
    for(target in names(fields)) if(target %in% names(m)) md[[fields[[target]]]]<-as.character(m[[target]])
    legacy_preview(list(data=md,mappings=fields[names(fields)%in%names(m)],native=m))
    metadata_file(md)
    confirmed_token(NULL)
    updateCheckboxInput(session,'shared_design_confirm',value=FALSE)
    showNotification('Classic metadata restored for review. Confirm the mapping before preparing data.',type='message',duration=10)
  })
  output$shared_metadata_mappings <- renderUI({
    md <- metadata_file(); req(md)
    saved <- isolate(hub$external_sample_metadata())
    tagList(lapply(names(fields),function(target) {
      preferred <- if(!is.null(saved$mappings[[target]])) saved$mappings[[target]] else if(!is.null(isolate(legacy_preview())))fields[[target]] else if(target=='Group1')fields[[target]] else ''
      selectInput(paste0('shared_map_',target),paste(target,'← metadata column'),
        choices=c('Not mapped'='',setNames(names(md),names(md))),
        selected=if(preferred %in% names(md))preferred else '',selectize=FALSE)
    }))
  })
  staged <- reactive({
    tryCatch({
      md <- metadata_file()
      if(is.null(md))stop('Upload a sample metadata CSV in Design.')
      ids <- hub$all_numeric_columns()
      if(!length(ids))stop('Upload an abundance matrix in Experiment first.')
      mapping <- vapply(names(fields),function(k)input[[paste0('shared_map_',k)]] %||% '',character(1))
      mapping <- mapping[nzchar(mapping)]
      stage_metadata_v01(md,ids,mapping)
    },error=function(e) list(validation=list(valid=FALSE,errors=conditionMessage(e),warnings=character())))
  })
  token <- reactive({
    s<-staged();if(!isTRUE(s$validation$valid))return(NULL)
    digest::digest(list(s$original,s$mappings,s$matrix_ids,hub$selected_cols(),hub$preparation_data_id(),hub$restore_generation(),
      if(!is.null(legacy_preview()))tryCatch(hub$all_metadata(),error=function(e)NULL)else NULL),algo='sha256')
  })
  design_ok <- reactive(!is.null(token()) && !is.null(confirmed_token()) && identical(token(),confirmed_token()))
  design_bridge(function() design_ok())
  observeEvent(token(),{
    reviewed_token(NULL)
    if(!isTRUE(design_ok())) updateCheckboxInput(session,'shared_design_confirm',value=FALSE)
  },ignoreNULL=FALSE,priority=100)
  observeEvent(input$shared_review_receipt,{
    receipt<-input$shared_review_receipt
    reviewed_token(if(isTRUE(receipt$checked) && identical(receipt$token,token()))token() else NULL)
  },ignoreNULL=FALSE)
  output$shared_metadata_preview <- renderUI({
    s <- tryCatch(staged(),error=function(e)NULL)
    if(is.null(s))return(p('Upload a matrix and metadata CSV to preview the mapping.'))
    tagList(tags$span(`data-shared-review-token`=token() %||% '',hidden=NA),p(sprintf('%d matrix samples · %d metadata rows',length(s$matrix_ids),nrow(s$original))),
      lapply(s$validation$errors,function(x)div(class='alert alert-danger',x)),
      lapply(s$validation$warnings,function(x)div(class='alert alert-info',x)))
  })
  output$shared_metadata_table <- renderTable({s<-staged();req(s$validation$valid);head(s$validation$data,12)},striped=TRUE)
  observeEvent(input$shared_apply_receipt,{
    tryCatch({
      if(!isTRUE(input$shared_design_confirm) || is.null(reviewed_token()) || !identical(reviewed_token(),token()) || !identical(input$shared_apply_receipt$token,token()))stop('Review the current mapping and check the confirmation box again.')
      s<-staged();if(!'Group1'%in%names(s$mappings))stop('Map the biological condition to Group1 before continuing.')
      if(!isTRUE(s$validation$valid))stop(paste(s$validation$errors,collapse='; '))
      legacy<-legacy_preview()
      preserve_legacy<-!is.null(legacy) && identical(s$original,legacy$data) && identical(s$mappings,legacy$mappings)
      # Keep all native Classic labels, timepoint groups and clusters when merely reviewing.
      if(preserve_legacy && !identical(legacy$native,hub$all_metadata()))stop('Classic metadata changed after restoration. Restore again or upload the updated metadata for review.')
      if(!preserve_legacy)hub$set_external_sample_metadata(s,TRUE)
      confirmed_token(token())
      showNotification('Metadata confirmed. Continue to Quality to prepare the data.',type='message')
    },error=function(e)showNotification(conditionMessage(e),type='error'))
  })
  output$shared_design_status <- renderUI(if(isTRUE(design_ok()))p('Study design confirmed.')else p('Study design needs review.'))
  output$shared_status <- renderUI({
    s<-hub$preparation_state();a<-s$applied
    div(class='shared-status',role='status',
      strong(if(is.null(a))'No prepared run yet' else paste(length(a$output_lipids),'lipids ·',length(a$output_samples),'samples')),
      p(if(!isTRUE(design_ok()))'Next: confirm your sample metadata in Design.' else if(is.null(a))'Next: open Quality, review settings and click Run Analysis.' else if(s$dirty)'Settings changed. Review Quality and run again to apply them.' else 'Prepared data are ready. Review QC before interpreting results.'),
      if(!is.null(s$error))p(s$error))
  })
  output$shared_result_summary <- renderUI({s<-hub$preparation_state();req(s$data_available);a<-s$applied
    p(paste('Applied normalization:',a$spec$settings$normalizationMethod,'· Detection:',a$spec$settings$minDetectionPct,'percent · Imputation seed:',a$spec$imputation_seed))})
  output$shared_share_status <- renderUI({s<-hub$preparation_state();p(if(s$dirty)'Apply pending settings before exporting a session.' else 'The ZIP includes the original matrix files, session settings and versioned metadata.')})
  go <- function(n){
    if(n>=3 && !isTRUE(design_ok())){showNotification('Go to Design, review the metadata and click Confirm metadata and study design.',type='warning');n<-2}
    if(n>=4 && !isTRUE(hub$preparation_state()$data_available)){showNotification('Prepare the data in Quality first.',type='warning');n<-3}
    bslib::nav_select('main_navbar',guided_shared_steps[n],session=session)
  }
  for(i in seq_along(guided_shared_steps)) local({n<-i
    observeEvent(input[[paste0('shared_step_',n)]],go(n),ignoreInit=TRUE)
    observeEvent(input[[paste0('shared_next_',n)]],go(n),ignoreInit=TRUE)
  })
  observeEvent(input$guide_step, {n<-as.integer(input$guide_step);if(length(n)==1 && n%in%1:7)go(n)})
  observeEvent(input$shared_tool,{if(input$shared_tool%in%c('Volcano Plot','Heatmap','Violin Plots','Composition','LSEA','Longitudinal'))bslib::nav_select('main_navbar',input$shared_tool,session=session)})
  output$shared_matrix_csv<-downloadHandler(filename=function()'prepared-matrix.csv',content=function(file){d<-hub$data_processed_unfiltered();req(d);write_spreadsheet_csv(d,file,row.names=FALSE,na='')})
  output$shared_metadata_csv<-downloadHandler(filename=function()'sample-metadata.csv',content=function(file){m<-hub$external_sample_metadata();req(m);write_spreadsheet_csv(m$display_metadata,file,row.names=FALSE,na='')})
  cell_hub <- hub
  cell_hub$data_processed <- hub$data_processed_unfiltered
  cell_hub$preparation_dirty <- reactive(hub$preparation_state()$dirty)
  cell_hub$preparation_audit <- reactive({
    applied<-hub$preparation_state()$applied
    if(is.null(applied))return(NULL)
    c(applied$filter,list(normalization=applied$spec$settings$normalizationMethod,
      imputation=if(isTRUE(applied$spec$settings$useImputation))'QRILC' else 'None',
      seed=applied$spec$imputation_seed))
  })
  cell_show_server(input,output,session,cell_hub)
  invisible(list(design_ok=design_ok,staged=staged,token=token))
}
# Descriptive class grouping for the read-only cell view, not the scientific annotation parser.
rd_class <- function(lipids) {
  cls <- toupper(sub('[( /_\\-].*','',trimws(lipids)))
  cls[is.na(cls)|!nzchar(cls)] <- 'Unknown';cls
}
