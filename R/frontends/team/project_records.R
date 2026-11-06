# Team-only archival records. No approval tokens, pending AI proposals or code.
# Ported from origin/claude/project-thread-okihs3:R/frontends/team/project_records.R.
# The checkpoint sidecar (validate / json / attach / read) is appended inside the
# session ZIP before it is hashed and saved through the storage API, so one
# checkpoint object carries both. The Team servers below provide
# session$userData$team_project_records_export / _import / _saved, which the
# project library (project_library.R) consumes around save and resume.
team_project_records_member <- 'team-project-records-v1.json'
team_project_records_node_limit <- 100000L
team_project_records_size_message <- 'Project records reached the size limit for one checkpoint (run history). This change is not saved; your work stays in this tab. Download a session copy from Save & export.'
# Deterministic rejections: retrying the same record cannot succeed.
team_project_records_permanent <- function(message) is.character(message)&&length(message)==1L&&
  (startsWith(message,'Invalid project methods/decisions record')||startsWith(message,'Project records')||startsWith(message,'Invalid or oversized project records'))
team_project_records_nodes <- function(record){nodes<-0L;walk<-function(x){nodes<<-nodes+length(x);if(is.list(x))for(v in x)walk(v)};walk(record);nodes}
# Saved, but past 80% of the bound: say so before a future save is refused.
team_project_records_near_limit <- function(session){n<-session$userData$team_project_records_last_nodes;is.numeric(n)&&length(n)==1L&&n>0.8*team_project_records_node_limit}
team_project_records_validate <- function(record) {
  fail<-function()stop('Invalid project methods/decisions record.',call.=FALSE)
  if(!is.list(record)||!identical(record$version,'1')||!identical(record$kind,'archived-project-records'))fail()
  required<-c('version','kind','created_at','design','question','run_history','companion_actions','methods','applied_preparation','quality_decisions')
  if(!setequal(names(record),required)||anyDuplicated(names(record)))fail()
  if(!is.character(record$created_at)||length(record$created_at)!=1L)fail()
  if(!is.list(record$design)||!setequal(names(record$design),c('unit','relationship','notes')))fail()
  scalar<-function(x)is.character(x)&&length(x)==1L&&!is.na(x)
  if(!all(vapply(record$design,scalar,logical(1)))||!scalar(record$question))fail()
  if(!is.list(record$run_history)||length(record$run_history)>10000L||!is.list(record$companion_actions)||length(record$companion_actions)>10000L)fail()
  for(row in record$run_history){
    if(!is.list(row)||!all(c('run','time','experiment','retained','sample_count','threshold','scope','imputation','normalization','seed')%in%names(row)))fail()
    if(!all(vapply(row[c('time','experiment','scope','imputation','normalization')],scalar,logical(1))))fail()
    if(!all(vapply(row[c('run','retained','sample_count','threshold')],function(x)is.numeric(x)&&length(x)==1L&&is.finite(x),logical(1))))fail()
  }
  fields<-c('Time','Action','Parameter','Previous','Proposed','Status')
  for(row in record$companion_actions)if(!is.list(row)||!setequal(names(row),fields)||!all(vapply(row,scalar,logical(1))))fail()
  if(!is.list(record$methods)||!setequal(names(record$methods),c('status','lines'))||!scalar(record$methods$status)||!record$methods$status%in%c('applied','not_prepared')||!is.list(record$methods$lines)||!all(vapply(record$methods$lines,scalar,logical(1))))fail()
  # JSON-only bounded recursive data; never deserialize executable R objects.
  nodes<-0L
  walk<-function(x,depth=0L){nodes<<-nodes+length(x);if(nodes>team_project_records_node_limit)stop(team_project_records_size_message,call.=FALSE);if(depth>30L)fail();if(is.list(x)){for(v in x)walk(v,depth+1L)}else if(!(is.null(x)||is.character(x)||is.logical(x)||is.numeric(x)))fail()}
  walk(record)
  bytes<-jsonlite::toJSON(record,auto_unbox=TRUE,null='null',na='null',digits=NA)
  if(nchar(bytes,type='bytes')>4*1024^2)stop('Project records exceed 4 MiB.',call.=FALSE)
  record
}
team_project_records_json <- function(record) jsonlite::toJSON(team_project_records_validate(record),auto_unbox=TRUE,null='null',na='null',digits=NA)
# `export` defaults to the session exporter registered by the records server.
team_project_records_attach <- function(path,session,export=session$userData$team_project_records_export) {
  if(!is.function(export))stop('Project methods/decisions are not ready to save. Retry shortly.',call.=FALSE)
  record<-team_project_records_validate(shiny::isolate(export()))
  session$userData$team_project_records_last_nodes<-team_project_records_nodes(record)
  stage<-tempfile('team-records-');dir.create(stage);on.exit(unlink(stage,recursive=TRUE))
  writeLines(team_project_records_json(record),file.path(stage,team_project_records_member),useBytes=TRUE)
  # Append before hashing, durable queuing and storage commit: one atomic object.
  zip::zip_append(path,files=team_project_records_member,root=stage)
  verified<-team_project_records_read(path)
  if(!identical(team_project_records_json(verified),team_project_records_json(record)))stop('Project records verification failed.',call.=FALSE)
  invisible(record)
}
team_project_records_read <- function(path) {
  entries<-zip::zip_list(path);match<-which(entries$filename==team_project_records_member)
  if(!length(match))return(NULL) # Older checkpoints remain readable.
  if(length(match)!=1L||entries$uncompressed_size[match]>4*1024^2)stop('Invalid or oversized project records.',call.=FALSE)
  con<-unz(path,team_project_records_member,open='rb');on.exit(close(con))
  bytes<-readBin(con,'raw',n=4*1024^2+1L)
  if(length(bytes)>4*1024^2)stop('Project records exceed 4 MiB.',call.=FALSE)
  team_project_records_validate(jsonlite::fromJSON(rawToChar(bytes),simplifyVector=FALSE))
}
# Capture the existing methods exporter inside a Team function clone; fail closed
# if the shared module contract changes. Classic keeps its original function.
team_project_guided_server <- function(input,output,session,shared_data) {
  original<-guided_workflow_server;found<-NULL
  visit<-function(node){
    if(is.call(node)&&identical(node[[1]],as.name('<-'))&&identical(node[[2]],quote(output$guide_report)))found<<-node[[3]][['content']]
    if(is.recursive(node))for(i in seq_along(node))if(!is.null(node[[i]]))visit(node[[i]])
  }
  visit(body(original));if(!is.call(found)||!identical(found[[1]],as.name('function')))stop('Team methods exporter contract requires review.')
  # Session-only Team (no project library) has no private checkpoints: keep the original wording.
  local_session<-exists('team_workspace_session_only',mode='function')&&isTRUE(team_workspace_session_only())
  wording<-function(node){
    if(is.character(node)&&!local_session){
      node<-gsub('Previous run history is not restored.','Private checkpoints preserve archived run history; historical records do not approve current analyses.',node,fixed=TRUE)
      node<-gsub('Run history is session-local.','Private checkpoints preserve run history as archived records.',node,fixed=TRUE)
      node<-gsub('Save the prepared matrix, labels CSV and methods record in the same folder.','Private checkpoints include source settings and archived methods/decisions. Download separate copies when useful.',node,fixed=TRUE)
      node<-gsub('Keep the methods record for guided design notes and run history.','Private project checkpoints include methods, design notes and run history; downloads are optional copies.',node,fixed=TRUE)
    }
    if(is.recursive(node))for(i in seq_along(node))if(!is.null(node[[i]]))node[[i]]<-wording(node[[i]])
    node
  }
  adapted<-original;b<-as.list(wording(body(original)));b<-append(b,list(substitute(session$userData$team_project_methods_writer <- WRITER,list(WRITER=wording(found)))),after=length(b)-1L);body(adapted)<-as.call(b)
  adapted(input,output,session,shared_data)
}
# Retain every logged Team action; the archival size limit fails visibly rather
# than silently dropping older actions. Token deduplication limits stay intact.
team_project_companion_server <- function(input,output,session,shared_data,workflow) {
  original<-companion_assistant_server;seen<-0L
  rewrite<-function(node){
    if(is.call(node)&&identical(node[[1]],as.name('audit'))&&length(node)==2L&&is.call(node[[2]])&&identical(node[[2]][[1]],as.name('tail'))&&length(node[[2]])==3L&&is.call(node[[2]][[2]])&&identical(node[[2]][[2]][[1]],as.name('rbind'))){
      node[[2]]<-node[[2]][[2]];seen<<-seen+1L
    }
    if(is.recursive(node))for(i in seq_along(node))if(!is.null(node[[i]]))node[[i]]<-rewrite(node[[i]])
    node
  }
  adapted<-original;body(adapted)<-rewrite(body(original));if(seen!=1L)stop('Team companion action log contract requires review.')
  bindings<-new.env(parent=environment(original))
  guidance<-if(exists('team_workspace_session_only',mode='function')&&isTRUE(team_workspace_session_only()))
    paste('This is a local session without a project library: nothing is saved automatically.',
      'Use Save & export to download a session ZIP (data, settings and canvas) and the methods and decisions record before closing the tab.',
      'A restored session ZIP does not approve current analyses or replay AI proposals.') else
    paste('When a writable private project is available, workspace edits, methods and decisions, design notes, run history and companion actions autosave in its checkpoints.',
    'Check the Saved status; Save & export also offers named checkpoints.',
    'Restored history and actions are archived records: they do not approve current analyses or replay AI proposals. Downloads are optional copies.')
  canvas_local<-if(exists('team_workspace_session_only',mode='function')&&isTRUE(team_workspace_session_only()))
    paste('In Canvas, explore PCA, class profiles, volcano and violin plots. This local session is not saved automatically:',
      'use Save & export to download a session ZIP, a whole-Canvas SVG or per-plot exports; CSV is available when the source provides it.')
  base_steps<-companion_assistant_step_guidance
  # In a local session steps 5 and 7 describe saving, which the reviewed seed words for the project library:
  # local_steps tells explain_step to use this text rather than the knowledge base for them.
  bindings$companion_assistant_step_guidance<-local({f<-base_steps;message<-guidance;canvas<-canvas_local;function(team_workspace=TRUE){result<-f(team_workspace);if(isTRUE(team_workspace)){result[7]<-message;if(!is.null(canvas)){result[5]<-canvas;attr(result,'local_steps')<-c(5L,7L)}};result}})
  if(exists('companion_ai_cards',mode='function'))bindings$companion_ai_cards<-local({f<-companion_ai_cards;message<-guidance;function(){cards<-f();cards$share$text<-message;cards}})
  if(exists('companion_ai_methods',mode='function'))bindings$companion_ai_methods<-local({f<-companion_ai_methods;message<-guidance;function()paste(f(),paste('[seven_steps]',message),sep='\n')})
  environment(adapted)<-bindings
  adapted(input,output,session,shared_data,workflow)
}
team_project_records_server <- function(input,output,session,shared_data,workflow,assistant) {
  local_session<-exists('team_workspace_session_only',mode='function')&&isTRUE(team_workspace_session_only())
  local_message<-'Local session: methods, design notes, run history and companion actions are not saved automatically. Download them here, and export a session ZIP to resume later.'
  archived<-shiny::reactiveVal(NULL);state<-shiny::reactiveVal(if(local_session) local_message else 'Records are not yet saved to a private project. Autosave is available when signed in to a writable project; check the save status.')
  restored_hydration<-NULL
  # Resuming rebuilds the applied preparation, which completes after import and
  # re-logs the latest archived run. Expect that one rebuild; never edit records.
  rebuild_key<-NULL
  # Only the run the restore itself produced is removed: guided_workflow.R marks the first run completed after
  # a restore with restore_rebuild=<its restore generation>, and only a run marked with the current generation is
  # dropped, when its content repeats the latest saved run. A person's own runs are never marked, so an identical
  # run they make before or after the import is kept; a marker left by an earlier restore is ignored.
  # Content, not key: the key hashes restore_generation, which every resume increments. It is compared in the
  # records' own JSON form, so an archived (JSON round-tripped) run and its native rebuild compare equal.
  run_key<-function(h)digest::digest(as.character(jsonlite::toJSON(h[setdiff(names(h),c('key','time','run','archived','restore_rebuild'))],
    auto_unbox=TRUE,null='null',na='null',digits=NA)),algo='sha256')
  design_values<-function()list(unit=text(input$guide_unit),relationship=text(input$guide_design_type),notes=text(input$guide_design_notes))
  signature<-function(design=design_values())digest::digest(list(history=workflow$history(),actions=assistant$audit(),goal=workflow$goal(),design=design))
  session$userData$team_project_records_saved<-function()state('Saved to your project: methods, design notes, run history and companion actions.')
  text<-function(x)if(is.character(x)&&length(x)==1L&&!is.na(x))x else ''
  safe<-function(f)if(is.function(f))tryCatch(f(),error=function(e)NULL) else NULL
  restore_rebuild<-function(h)!isTRUE(h$archived)&&!is.null(h$restore_rebuild)&&identical(as.integer(h$restore_rebuild),as.integer(safe(shared_data$restore_generation)))
  session$userData$team_project_records_export<-function(){
    audit<-assistant$audit();rows<-lapply(seq_len(nrow(audit)),function(i)as.list(audit[i,,drop=FALSE]))
    applied<-safe(shared_data$preparation_audit);writer<-session$userData$team_project_methods_writer
    prep<-safe(shared_data$preparation_state);receipt<-if(is.list(prep))prep$applied else NULL
    provenance<-if(is.null(receipt))NULL else list(data_id=receipt$spec$data_id,revision=receipt$revision,request_id=receipt$request_id,
      completed_at=if(inherits(receipt$completed_at,'POSIXct'))format(receipt$completed_at,tz='UTC',usetz=TRUE) else NULL,
      output_samples=as.list(receipt$output_samples),output_lipids=as.list(receipt$output_lipids))
    if(is.null(applied))methods<-list(status='not_prepared',lines=list('No preparation has been applied; this checkpoint preserves draft design and decisions.')) else {
      path<-tempfile(fileext='.txt');on.exit(unlink(path));writer(path)
      lines<-readLines(path,warn=FALSE)
      lines<-gsub('Run history is session-local.','Private checkpoints preserve this run history as archived records.',lines,fixed=TRUE)
      lines<-gsub('Previous run history is not restored.','Private checkpoints include archived run history; historical records do not approve current analyses.',lines,fixed=TRUE)
      methods<-list(status='applied',lines=as.list(lines))
    }
    team_project_records_validate(list(version='1',kind='archived-project-records',created_at=format(Sys.time(),tz='UTC',usetz=TRUE),
      design=list(unit=text(input$guide_unit),relationship=text(input$guide_design_type),notes=text(input$guide_design_notes)),question=text(workflow$goal()),
      run_history=workflow$history(),companion_actions=rows,methods=methods,applied_preparation=list(audit=applied,provenance=provenance),quality_decisions=safe(shared_data$qc_decisions)))
  }
  session$userData$team_project_records_import<-function(record){
    rebuild_key<<-NULL
    if(is.null(record)){restored_hydration<<-NULL;archived(NULL);state('This older checkpoint has no archived methods/decisions sidecar. No missing records were reconstructed.');return(invisible(NULL))}
    record<-team_project_records_validate(record);archived(record)
    previous_design<-design_values()
    # Restore historical data only. Confirmation and proposals are never revived.
    assistant$pending(NULL)
    history<-record$run_history
    for(i in seq_along(history)){history[[i]]$archived<-TRUE;history[[i]]$time<-paste0('[Archived] ',sub('^\\[Archived\\] ','',history[[i]]$time))}
    # A rebuilt current run may have completed while source files hydrated.
    # Keep it in addition to the archived history instead of overwriting it.
    # Runs already in this record (the same run, by its own key) are not added twice.
    record_key<-function(h)if(!is.null(h$key))as.character(h$key) else digest::digest(h)
    current<-Filter(function(h)!record_key(h)%in%vapply(record$run_history,record_key,character(1)),workflow$history())
    latest<-if(length(record$run_history))run_key(record$run_history[[length(record$run_history)]]) else NULL
    marked<-which(vapply(current,restore_rebuild,logical(1)))
    rebuilt<-length(marked)>0L
    # Already rebuilt: drop that one run if it repeats the latest saved run; keep everything else.
    if(rebuilt&&identical(run_key(current[[marked[[1]]]]),latest))current<-current[-marked[[1]]]
    # Not rebuilt yet: expect one live run repeating the latest archived run.
    rebuild_key<<-if(rebuilt)NULL else latest
    history<-c(history,current)
    for(i in seq_along(history))history[[i]]$run<-i
    workflow$history(history)
    fields<-c(Time='Time',Action='Action',Parameter='Parameter',Previous='Previous',Proposed='Proposed',Status='Status')
    audit<-as.data.frame(setNames(lapply(fields,function(k)vapply(record$companion_actions,function(r)r[[k]],character(1))),names(fields)),stringsAsFactors=FALSE)
    if(nrow(audit))audit$Status<-paste0('[Archived] ',sub('^\\[Archived\\] ','',audit$Status))
    current_actions<-assistant$audit()
    if(nrow(current_actions)) {
      # Existing live actions are not approvals; preserve their original status.
      original<-if(length(record$companion_actions))as.data.frame(setNames(lapply(fields,function(k)vapply(record$companion_actions,function(r)r[[k]],character(1))),names(fields)),stringsAsFactors=FALSE) else current_actions[FALSE,,drop=FALSE]
      row_key<-function(d)apply(d,1L,function(x)paste(x,collapse='\r'))
      current_actions<-current_actions[!row_key(current_actions)%in%row_key(original),,drop=FALSE]
      audit<-rbind(audit,current_actions)
    }
    assistant$audit(audit)
    shiny::updateTextInput(session,'guide_unit',value=record$design$unit)
    shiny::updateSelectInput(session,'guide_design_type',selected=record$design$relationship)
    shiny::updateTextAreaInput(session,'guide_design_notes',value=record$design$notes)
    shiny::updateCheckboxInput(session,'guide_design_confirm',value=FALSE)
    workflow$goal(record$question)
    target_signature<-signature(record$design)
    restored_hydration<<-if(identical(signature(),target_signature))NULL else list(signature=target_signature,design=record$design,previous_design=previous_design)
    state('Archived methods, design notes, run history and companion actions restored. They do not approve the current analysis or replay actions.')
    invisible(TRUE)
  }
  shiny::observeEvent(workflow$history(),{
    if(is.null(rebuild_key))return()
    history<-workflow$history();marked<-which(vapply(history,restore_rebuild,logical(1)))
    if(!length(marked))return()
    expected<-rebuild_key;rebuild_key<<-NULL
    if(!identical(run_key(history[[marked[[1]]]]),expected))return()
    history<-history[-marked[[1]]];for(i in seq_along(history))history[[i]]$run<-i
    workflow$history(history)
  },ignoreInit=TRUE,priority=10)
  shiny::observeEvent(input$team_library_project,{state('Project selection changed. Current records have not been saved to this selected project.')},ignoreInit=TRUE)
  output$team_project_records_status<-shiny::renderText(state())
  output$team_archived_methods<-shiny::downloadHandler(filename=function()'archived-methods-and-decisions.txt',content=function(file){r<-archived();shiny::req(r);writeLines(c('ARCHIVED CHECKPOINT RECORD — not current scientific approval',unlist(r$methods$lines,use.names=FALSE)),file,useBytes=TRUE)})
  output$team_archived_methods_available<-shiny::renderUI(if(!is.null(archived()))shiny::downloadButton('team_archived_methods','Download archived checkpoint methods'))
  # Server-generated history/actions also schedule the same autosave barrier.
  shiny::observeEvent(list(workflow$history(),assistant$audit(),input$guide_unit,input$guide_design_type,input$guide_design_notes,workflow$goal()),{
    if(!is.null(restored_hydration)){
      hydration<-restored_hydration;current_design<-design_values()
      # update*Input reaches the browser asynchronously, possibly one field at
      # a time. Suppress only known old/target values while server records still
      # match this import. Any new note value or server event is a real change.
      known_values<-all(vapply(names(current_design),function(key)
        current_design[[key]] %in% c(hydration$previous_design[[key]],hydration$design[[key]]),logical(1)))
      if(identical(signature(hydration$design),hydration$signature) && known_values){
        if(identical(current_design,hydration$design))restored_hydration<<-NULL
        return()
      }
      restored_hydration<<-NULL
    }
    if(!isTRUE(safe(shared_data$is_restoring))){
      state(if(local_session) local_message else 'Record changes are pending save. Autosave requires a writable private project; check the save status.')
      session$sendCustomMessage('team-project-records-changed',list())
    }
  },ignoreInit=TRUE)
  invisible(list(archived=archived,status=state))
}
team_project_share_ui <- function(session_only = exists('team_workspace_session_only',mode='function')&&isTRUE(team_workspace_session_only())) {
  ui<-guide_share_ui()
  replace<-function(x){
    # Session-only Team: the downloads are the only way to keep the work, so the original wording stays.
    if(is.character(x)&&!session_only){
      x<-gsub('Save the prepared data, sample labels and methods record together. Add a session ZIP if you want to resume the analysis later.','When signed in to a writable private project, changes autosave in its checkpoints, including methods, design notes, run history and companion actions. Check the save status. Downloads below are optional copies.',x,fixed=TRUE)
      x<-gsub('Save both files.','Optional downloads:',x,fixed=TRUE)
      x<-gsub('1. Save the prepared data','Prepared data (optional export)',x,fixed=TRUE)
      x<-gsub('2. Save labels and methods','Labels, methods and actions (optional exports)',x,fixed=TRUE)
      x<-gsub('3. Save a session to resume later','Session ZIP (optional export)',x,fixed=TRUE)
      x<-gsub('Runs in this session','Run history (current and archived)',x,fixed=TRUE)
      x<-gsub('Companion actions are session-local. Save this log before closing or restoring a session.','Private project checkpoints automatically include companion actions, methods, design notes and run history. Downloads are optional copies.',x,fixed=TRUE)
      x<-gsub('Save Methods and decisions separately to preserve design notes and run history.','Private checkpoints also preserve archived methods, design notes and run history; downloads remain optional.',x,fixed=TRUE)
      x<-gsub('History is kept for this browser session and included in the workflow record. The original session ZIP does not restore this new history.','Private checkpoints preserve run history. Restored entries are archived records, not approval of the current analysis.',x,fixed=TRUE)
    }
    if(is.list(x))for(i in seq_along(x))x[i]<-list(replace(x[[i]]))
    x
  }
  shiny::tagList(replace(ui),shiny::tags$div(class='guide-panel',shiny::textOutput('team_project_records_status'),shiny::uiOutput('team_archived_methods_available')),
    shiny::includeScript('www/team/js/project_records.js'))
}
