# Reviewed guidance and optional server-side AI. Model output never executes scientific changes.
companion_sanitize_question <- function(question, known_labels = character()) {
  stopifnot(is.character(question), length(question) == 1L, !is.na(question))
  clean <- question
  labels <- unique(as.character(unlist(known_labels, use.names = FALSE)))
  # Single letters and digits are too ambiguous in prose and scientific values.
  labels <- labels[!is.na(labels) & nchar(trimws(labels)) >= 2L]
  # Literal labels are escaped before use in a regex. Word boundaries alone do
  # not work for filenames with punctuation or short labels such as "A1".
  escape <- function(x) gsub("([][{}()+*^$|\\\\?.])", "\\\\\\1", x, perl = TRUE)
  for (label in labels[order(nchar(labels), decreasing = TRUE)]) {
    pattern <- paste0("(?<![[:alnum:]_])", escape(label), "(?![[:alnum:]_])")
    clean <- gsub(pattern, "[study label]", clean, ignore.case = TRUE, perl = TRUE)
  }
  clean <- gsub("[[:alnum:]._%+-]+@[[:alnum:].-]+\\.[[:alpha:]]{2,}", "[email]", clean, perl = TRUE)
  clean <- gsub("(?<![[:alnum:]])(?:19|20)[0-9]{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12][0-9]|3[01])(?![[:alnum:]])", "[date]", clean, perl = TRUE)
  clean <- gsub("(?<![[:alnum:]])(?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12][0-9]|3[01])[-/.](?:19|20)?[0-9]{2}(?![[:alnum:]])", "[date]", clean, perl = TRUE)
  clean <- gsub("(?<![[:alnum:]])(?:\\+?[0-9]{1,3}[-. ]?)?\\(?[0-9]{3}\\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}(?![[:alnum:]])", "[phone]", clean, perl = TRUE)
  clean <- gsub("(?<![[:alnum:]_])[0-9]{6,}(?![[:alnum:]_])", "[identifier]", clean, perl = TRUE)
  clean <- gsub("(?<![[:alnum:]_])(?!log10\\b|c[0-9]+\\b|tg[0-9]+\\b)[[:alpha:]]+[_-]?[0-9]{2,}[[:alnum:]_-]*(?![[:alnum:]_])", "[identifier]", clean, ignore.case = TRUE, perl = TRUE)
  clean
}

companion_assistant_server <- function(input, output, session, shared_data, guide_workflow) {
  ai_busy <- FALSE; ai_count <- 0L; ai_last <- as.POSIXct(0,origin='1970-01-01'); ai_closed <- FALSE
  session$onSessionEnded(function(){ai_closed<<-TRUE})
  scalar <- function(x, type='character') length(x)==1L && !is.list(x) && !is.na(x) && typeof(x)==type
  safe <- function(f, fallback=NULL) tryCatch(f(),error=function(e)fallback)
  norm_names <- c(median='Median (log scale)',pqn='PQN (linear scale)',none='None')
  ids <- c(normalization='qc_pca_tab-normalizationMethod',detection='qc_pca_tab-minDetectionPct',imputation='qc_pca_tab-useImputation')
  settings_keys <- c('normalizationMethod','minDetectionPct','useImputation','imputationSeed','detectionScope','dropNonDetected','imputeZerosPerFile','imputeRemainingNAtoZero','dropMisc')
  revision <- reactiveVal(0L); pending <- reactiveVal(NULL); last_fp <- NULL; counter <- 0L; seen <- character()
  audit <- reactiveVal(data.frame(Time=character(),Action=character(),Parameter=character(),Previous=character(),Proposed=character(),Status=character()))
  settings <- reactive(setNames(lapply(ids,function(id)input[[id]]),names(ids)))
  fingerprint <- reactive(digest::digest(list(
    step=safe(guide_workflow$step,1L),settings=lapply(settings_keys,function(k)input[[paste0('qc_pca_tab-',k)]]),
    raw=safe(shared_data$rawData),selected=safe(shared_data$selected_cols),metadata=safe(shared_data$all_metadata),
    restoring=safe(shared_data$is_restoring,FALSE),files=safe(shared_data$loaded_files),contrast=safe(shared_data$de_contrast_info),processed=safe(shared_data$data_processed),audit=safe(shared_data$preparation_audit),
    design=list(input$guide_unit,input$guide_design_type,input$guide_design_confirm),averaging=input[['data_hub-useAveragedSubstitution']])))
  step <- reactive({x<-safe(guide_workflow$step,1L);if(length(x)!=1L||is.na(x)||!x %in% 1:7)1L else as.integer(x)})
  refresh <- function(){fp<-fingerprint();if(!identical(fp,last_fp)){last_fp<<-fp;revision(isolate(revision())+1L);old<-isolate(pending());if(!is.null(old)){log('proposal',old$parameter,old$previous,old$value,'superseded by workspace change');pending(NULL);session$sendCustomMessage('assistant_preview',list())}}}
  action <- function(id,label,args=list())list(id=id,label=label,args=args)
  nav <- function(n,label)action('navigate_step',label,list(step=n))
  reply <- function(text,actions=list(),source='Local guide · reviewed application methods')session$sendCustomMessage('assistant_reply',list(text=text,source=source,mode='Local guide',revision=isolate(revision()),actions=actions))
  log <- function(act,p='',old='',new='',status='requested')audit(tail(rbind(isolate(audit()),data.frame(Time=format(Sys.time(),'%Y-%m-%d %H:%M:%S %Z'),Action=act,Parameter=p,Previous=as.character(old),Proposed=as.character(new),Status=status)),200))
  valid_event <- function(x){
    if(!is.list(x)||!scalar(x$nonce,'double')&&!scalar(x$nonce,'integer')&&!scalar(x$nonce))return(FALSE)
    key<-as.character(x$nonce);if(key %in% seen)return(FALSE);seen<<-tail(c(seen,key),200);TRUE
  }
  explain_step <- function(){
    txt<-c('Upload abundance files or restore a session ZIP. Original files stay unchanged.',
    'Review sample labels, selected samples and independent or matched design. Only you can confirm the design review.',
    'Review detection, missing values and normalization. Prepare data only after reviewing these choices; previous plots keep the applied run until then.',
    'Choose the biological question. A study description does not automatically change the statistical model.',
    'Explore PCA, class profiles, volcano and violin plots. Hover over points and export the CSV behind each plot.',
    'Select a lipid and measurement to inspect prepared abundances. Anatomy is interpreted reference biology; bulk signals do not establish subcellular lipid locations. No dynamic simulation is enabled.',
    'Export results, methods and decisions, sample labels and a session ZIP. Also save the companion action log; it is session-local.')
    reply(txt[step()],list(nav(step(),'Open this step')))
  }
  local_guidance <- function(q) {
    if(grepl('\\b(imput[a-z]*|missing|qrilc)\\b',q)){reply('QRILC estimates missing values under a left-censoring assumption. Missingness alone does not establish that assumption. Imputed values are estimates, not measurements. Turning it off retains missing values; some tools require complete data.',list(nav(3,'Open Quality')));return()}
    if(grepl('\\b(normal[a-z]*|pqn|median)\\b',q)){if(grepl('^(does|is|are|why|how|what|can i)\\b',q)){reply('Changing a normalization control updates the proposed Quality setting, but it does not change the currently applied plots until you review Quality and run preparation.');return()};reply('Median normalization uses the log scale; PQN uses the linear scale. The appropriate choice depends on the assay and controls. To request a change, type “set normalization to pqn”. Review and confirm it before preparing data.',list(nav(3,'Open Quality')));return()}
    if(grepl('\\b(filter[a-z]*|detect[a-z]*|threshold)\\b',q)){reply('Only positive measurements count as detected. Global filtering may remove signals specific to one group. Review the detection scope and controls. To propose a threshold, type “set detection to 80”. Nothing changes until you confirm.',list(nav(3,'Review Quality')));return()}
    if(grepl('violin',q)){reply('Violin plots show the distribution of a selected lipid across samples in each group. The dashboard uses log10 positive prepared abundances, shows individual points and excludes unavailable or nonpositive values. A shape difference alone is not a statistical test.',list(nav(5,'Open Results')));return()}
    if(grepl('pca',q)){reply('PCA summarizes variation, not significance or causality. Dashboard PCA supports linear or log10 prepared abundances and scaling choices. Match the transformation, scaling, samples and lipids before comparing plots.',list(nav(5,'Open Results')));return()}
    if(grepl('\\b(volcano|fold|signific[a-z]*)\\b',q)){reply('A volcano plot combines effect size and statistical evidence. Check the contrast direction, test, multiple-testing correction and independent experimental units. The guided comparison currently uses unpaired tests; a paired design label does not convert the test.',list(nav(5,'Open Results'),nav(2,'Review Design')));return()}
    if(grepl('\\b(3d|cells?|membrane|nucleus|granules?|simulat[a-z]*)\\b',q)){reply('Measured source: uploaded abundances. Processed: filtered, normalized and potentially imputed values. Interpreted: reference cell anatomy and biological context. No dynamic simulation is enabled. Bulk lipidomics does not measure subcellular localization.',list(nav(6,'Open 3D Show')));return()}
    if(grepl('\\b(steps?|workflow|start|begin|next|help)\\b',q)){explain_step();return()}
    reply('This is reviewed local guidance. I can explain filtering, imputation, normalization, PCA, volcano plots, violin plots and the 3D view. For sample-specific scientific conclusions, review the results with your analyst.',list(nav(step(),'Open current step'),nav(3,'Review Quality')))
  }
  propose <- function(p,value){
    refresh(); cfg<-settings();if(isTRUE(safe(shared_data$is_restoring,FALSE))){reply('Wait for session restoration to finish before proposing changes.');return()}
    valid<-scalar(p)&&p %in% names(ids) && switch(p,normalization=scalar(value)&&value %in% names(norm_names),detection=is.numeric(value)&&length(value)==1L&&!is.na(value)&&is.finite(value)&&value>=0&&value<=100,imputation=scalar(value,'logical'),FALSE)
    if(!isTRUE(valid)){reply('That proposal is invalid. Choose an available normalization, detection from 0 to 100%, or imputation on/off.');return()}
    if(is.null(safe(shared_data$rawData))||is.null(cfg[[p]])){reply('Load an experiment first, then review Quality before requesting a parameter change.',list(nav(1,'Open Experiment')));return()}
    if(identical(as.character(cfg[[p]]),as.character(value))){reply('That setting already has the requested value. No change is needed.');return()}
    counter<<-counter+1L
    token<-digest::digest(list(session$token,counter,Sys.time(),fingerprint()),algo='sha256')
    pending(list(token=token,parameter=p,value=value,previous=cfg[[p]],fingerprint=fingerprint(),expires=Sys.time()+300))
    label<-function(v)if(p=='normalization')unname(norm_names[as.character(v)]) else if(p=='imputation')if(isTRUE(v))'QRILC on' else 'Imputation off' else paste0(v,'%')
    session$sendCustomMessage('assistant_preview',list(token=token,title=paste('Change',p,'?'),current=label(cfg[[p]]),proposed=label(value),reason='This changes a preparation setting. Existing plots remain on the previous applied run. Review Quality and click Prepare data yourself to recompute. This proposal expires in five minutes.'))
    log('propose',p,cfg[[p]],value,'awaiting confirmation')
  }
  observe({refresh();cfg<-settings();s<-step();dirty<-isTRUE(safe(shared_data$preparation_dirty,FALSE));ready<-!is.null(safe(shared_data$data_processed));
    session$sendCustomMessage('assistant_state',list(step=s,ready=ready,dirty=dirty,revision=isolate(revision()),ai_enabled=exists('companion_ai_available')&&companion_ai_available(),normalization=cfg$normalization,imputation=cfg$imputation,
      message=if(dirty)'Settings have changed. Plots still use the last applied run.' else if(s==2&&!isTRUE(safe(guide_workflow$design_ok,FALSE)))'Review your study design before continuing.' else 'Ask about this step or choose a guided action.',
      actions=list(nav(s,'Explain this step'),nav(if(dirty)3 else min(7,s+1),if(dirty)'Review Quality' else 'Next step'))))
  })
  observeEvent(input$assistant_request,{
    r<-input$assistant_request;if(!valid_event(r))return();q<-r$text
    if(!scalar(q)||nchar(q)>600){reply('Please enter a question of no more than 600 characters.');return()};q<-tolower(trimws(q))
    if(grepl('^(hi|hello|hey|hola|good morning|good afternoon|good evening)[!., ]*$',q)){
      reply('Hello! I can explain this step, help you find a plot, or guide you through the workflow. What would you like to do?',list(nav(step(),'Explore this step'),nav(1,'Start an experiment')),source='Local welcome');return()
    }
    if(grepl('^(thanks|thank you|gracias)[!., ]*$',q)){reply('You’re welcome. I’m here whenever you want to review a method or find your next step.',list(nav(step(),'Return to this step')),source='Local welcome');return()}
    if(grepl('^(please )?(set|switch|change|turn).*(and|then).*(prepare|run|apply)\\b',q)){reply('I can propose one scientific setting at a time, but I will not prepare or run the analysis from chat. Ask separately to change a setting, confirm it, then review Quality and click Prepare data yourself.');return()}
    if(grepl('^set normalization to (median|pqn|none)[.!]?$',q)){propose('normalization',sub('[.!]$','',sub('^set normalization to ','',q)));return()}
    if(grepl('^please switch normalization from (median|pqn|none) to (median|pqn|none) for me[.!]?$',q)){m<-regexec('^please switch normalization from (median|pqn|none) to (median|pqn|none)',q);z<-regmatches(q,m)[[1]];propose('normalization',z[3]);return()}
    if(grepl('^can you switch to (median|pqn|none)[.!?]?$',q)){propose('normalization',sub('[.!?]$','',sub('^can you switch to ','',q)));return()}
    if(grepl('^set (detection|threshold) to [0-9]+(\\.[0-9]+)?%?[.!]?$',q)){raw<-sub('^set (detection|threshold) to ','',q);n<-as.numeric(sub('[%!.]+$','',raw));if(n<=1&&!grepl('%',raw)){reply('Please include a percentage for a threshold at or below 1, for example “set detection to 0.8%”.');return()};propose('detection',n);return()}
    if(q %in% c('turn imputation on','turn imputation off')){propose('imputation',q=='turn imputation on');return()}
    if(exists('companion_ai_guard')) { guarded<-companion_ai_guard(q); if(!is.null(guarded)){reply(guarded$answer,guarded$actions,source='Local guide · reviewed scientific boundaries');return()} }
    if(exists('companion_ai_available')&&companion_ai_available() && !q %in% c('explain this step','help')) {
      if(ai_busy){reply('Please wait for the current answer.');return()}
      if(ai_count>=60L || as.numeric(difftime(Sys.time(),ai_last,units='secs'))<3){reply('AI request limit reached. Use Explain this step for local guidance.');return()}
      # Only the question and an explicit small context cross the provider boundary.
      # Remove known study labels; no metadata, matrices or design notes are serialized.
      files<-as.character(unlist(safe(shared_data$loaded_files),use.names=FALSE))
      private<-c(safe(shared_data$selected_cols),unlist(safe(shared_data$all_metadata),use.names=FALSE),files,basename(files))
      cleanq<-companion_sanitize_question(q,private)
      ctx<-list(step=step(),ready=!is.null(safe(shared_data$data_processed)),dirty=isTRUE(safe(shared_data$preparation_dirty,FALSE)),normalization=settings()$normalization,imputation=settings()$imputation)
      request_fp<-fingerprint();request_rev<-revision();ai_busy<<-TRUE;ai_count<<-ai_count+1L;ai_last<<-Sys.time()
      session$sendCustomMessage('assistant_busy',list(busy=TRUE))
      job<-promises::future_promise(companion_ai_complete(cleanq,ctx),globals=list(cleanq=cleanq,ctx=ctx,companion_ai_complete=companion_ai_complete,companion_ai_available=companion_ai_available,companion_ai_guard=companion_ai_guard,companion_ai_cards=companion_ai_cards,companion_ai_context=companion_ai_context,companion_ai_methods=companion_ai_methods,companion_ai_validate=companion_ai_validate,`%||%`=`%||%`),seed=FALSE)
      promises::then(job,onFulfilled=function(result){
        ai_busy<<-FALSE;if(ai_closed)return(NULL)
        session$sendCustomMessage('assistant_busy',list(busy=FALSE))
        isolate({
          if(!identical(request_fp,fingerprint())){reply('The workspace changed while I was answering. Please ask again for current guidance.');return(NULL)}
          if(!isTRUE(result$ok)){reply(paste(result$error %||% 'AI guidance could not be completed.','You can still use the local guidance below.'),list(nav(step(),'Open current step')),source='Connection status');local_guidance(q);return(NULL)}
          ai_actions <- Filter(function(a)is.list(a)&&identical(a$id,'navigate_step'),result$actions %||% list())
          session$sendCustomMessage('assistant_reply',list(text=result$answer,actions=ai_actions,source=if(identical(result$source,'local-reviewed'))'Local guide · reviewed scientific boundaries' else paste('OpenAI',result$source,'·',paste(result$citations,collapse=', ')),mode='AI guide',revision=request_rev))
          log('ai_reply',status='answered; question not logged')
        });NULL
      },onRejected=function(error){ai_busy<<-FALSE;if(!ai_closed){session$sendCustomMessage('assistant_busy',list(busy=FALSE));isolate(local_guidance(q))};NULL})
      return()
    }
    local_guidance(q)
  },ignoreInit=TRUE)
  observeEvent(input$assistant_action,{
    r<-input$assistant_action;if(!valid_event(r))return();if(!scalar(r$id)||!is.list(r$args)){reply('This action is not supported.');return()};refresh()
    if(!is.numeric(r$revision)||length(r$revision)!=1||is.na(r$revision)||r$revision!=revision()){reply('The workspace changed. Please request this action again.');return()}
    if(r$id=='navigate_step'){
      n<-r$args$step;if(!is.numeric(n)||length(n)!=1||!is.finite(n)||n!=as.integer(n)||!n %in% 1:7){reply('Choose a workflow step from 1 to 7.');return()}
      session$sendCustomMessage('assistant_navigate',list(step=as.integer(n)));reply('I requested that step. The workflow will check whether data preparation and design review are complete.');return()
    }
    if(r$id=='propose_parameter'){propose(r$args$parameter,r$args$value);return()}
    reply('I cannot execute that action. Use the app controls to prepare data, confirm study design or export files.')
  },ignoreInit=TRUE)
  observeEvent(input$assistant_confirm,{
    r<-input$assistant_confirm;if(!valid_event(r))return();p<-pending();pending(NULL);session$sendCustomMessage('assistant_preview',list())
    if(is.null(p)){log('confirm','','','','rejected no pending proposal');reply('This proposal is stale, expired or already used. No change was made. Request it again.');return()}
    if(!scalar(r$token)||!identical(r$token,p$token)){log('confirm',p$parameter,p$previous,p$value,'rejected wrong token');reply('This proposal token is invalid. No change was made. Request it again.');return()}
    if(isTRUE(safe(shared_data$is_restoring,FALSE))||Sys.time()>p$expires||!identical(fingerprint(),p$fingerprint)){log('confirm',p$parameter,p$previous,p$value,'rejected stale or expired');reply('This proposal is stale or expired. No change was made. Request it again.');return()}
    if(p$parameter=='normalization')updateSelectInput(session,ids[[p$parameter]],selected=p$value)
    if(p$parameter=='detection')updateSliderInput(session,ids[[p$parameter]],value=p$value)
    if(p$parameter=='imputation')updateCheckboxInput(session,ids[[p$parameter]],value=p$value)
    log('confirm',p$parameter,p$previous,p$value,'setting update sent')
    reply('Confirmed: the setting update was sent to Quality. Review it there and click Prepare data to apply it. Existing plots have not been recomputed.')
  },ignoreInit=TRUE)
  observeEvent(input$assistant_cancel,{r<-input$assistant_cancel;if(!valid_event(r))return();p<-isolate(pending());if(is.null(p)||!scalar(r$token)||!identical(r$token,p$token)){log('cancel','','','','rejected wrong token');reply('That cancellation token is invalid.');return()};pending(NULL);log('cancel',p$parameter,p$previous,p$value,'cancelled');session$sendCustomMessage('assistant_preview',list());reply('Proposal cancelled. Your settings were kept.')},ignoreInit=TRUE)
  output$companion_actions_csv<-downloadHandler(filename=function()'companion-actions.csv',content=function(file)write_spreadsheet_csv(audit(),file,row.names=FALSE))
  invisible(list(pending=pending,revision=revision,audit=audit,settings=settings,fingerprint=fingerprint))
}
