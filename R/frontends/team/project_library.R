# Team-only persistence. User tokens live in a single Shiny session, never globals.
team_library_enabled <- function() identical(Sys.getenv("LIPIDOMIC_PROJECT_LIBRARY"), "1")
team_library_call <- function(service, path, token=NULL, body=NULL, method="GET", raw=FALSE) {
  base <- Sys.getenv(paste0("LIPIDOMIC_",toupper(service),"_URL"))
  if (!nzchar(base)) stop("Project library is not configured.")
  # Operator-controlled endpoints only; identifiers are validated before interpolation.
  h <- if (!is.null(token)) httr::add_headers(Authorization=paste("Bearer",token)) else httr::add_headers()
  args <- list(url=paste0(base,path),h,httr::timeout(90))
  if (!is.null(body)) {args$body<-body; args$encode<-if(is.raw(body)) "raw" else "json"}
  r <- do.call(httr::VERB,c(list(verb=method),args))
  if (httr::status_code(r)>=300) stop("Request denied or service unavailable. Sign in again or check your project access.")
  if(raw) return(httr::content(r,as="raw"))
  text <- httr::content(r,as="text",encoding="UTF-8")
  if(!nzchar(text)) return(NULL)
  jsonlite::fromJSON(text,simplifyVector=FALSE)
}
# Team testing: Gerardo requested immediate sign-in retries. Authentication and
# project permissions remain enforced by the identity service.
team_library_login_limiter <- function(now=function() as.numeric(Sys.time())) {
  function() invisible(TRUE)
}
# One-time setup never authenticates the analysis session. Revoke the temporary
# GoTrue session even when identity verification or the password update fails.
team_library_activate <- function(email, code, type, password, confirm, call=team_library_call) {
  scalar <- function(x) is.character(x) && length(x)==1L && !is.na(x)
  invalid <- function(message) stop(message, call.=FALSE)
  if(!scalar(email) || !grepl("^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$",trimws(email)))
    invalid("Enter a valid email address.")
  email <- tolower(trimws(email))
  if(!scalar(code) || !grepl("^[[:xdigit:]]{40,128}$",trimws(code)))
    invalid("Enter the activation code provided by your administrator.")
  if(!scalar(type) || !type %in% c("invite","recovery")) invalid("Choose invitation or password recovery.")
  if(!scalar(password) || nchar(password)<12L || nchar(password)>256L)
    invalid("Use a password between 12 and 256 characters.")
  if(!scalar(confirm) || !identical(password,confirm)) invalid("The passwords must match.")
  token <- NULL
  tryCatch({
    r <- call("auth","/verify",body=list(token_hash=trimws(code),type=type),method="POST")
    token <- r$access_token
    if(!scalar(token) || !nzchar(token)) stop("Invalid session")
    if(!scalar(r$user$email) || !identical(tolower(trimws(r$user$email)),email)) stop("Identity mismatch")
    call("auth","/user",token,body=list(password=password),method="PUT")
    invisible(TRUE)
  }, error=function(e) invalid("Setup could not be completed. Check the email and code, or ask your administrator for a new code."),
  finally={if(scalar(token) && nzchar(token)) try(call("auth","/logout",token,method="POST"),silent=TRUE)})
}
# Idempotent commit: recover an uploaded object or a lost successful response.
team_library_commit <- function(path, project, label, token, call=team_library_call) {
  if(!grepl("^[0-9a-f-]{36}$", project))stop("Invalid project.")
  hash<-digest::digest(file=path,algo="sha256");key<-paste0(project,"/",hash)
  lookup<-function()call("rest",paste0("/pilot_files?project_id=eq.",project,"&sha256=eq.",hash),token)
  verify_object<-function(){b<-call("storage",paste0("/object/authenticated/case-files/",key),token,raw=TRUE)
    if(!identical(digest::digest(b,algo="sha256",serialize=FALSE),hash))stop("Stored checkpoint integrity check failed.")
    invisible(TRUE)}
  existing<-lookup()
  if(length(existing)){verify_object();return(invisible(hash))}
  bytes<-readBin(path,"raw",n=file.info(path)$size)
  # Upload failures include a lost response, a concurrent upload or an orphan
  # from a prior attempt. Only exact, readable bytes can satisfy recovery.
  tryCatch(call("storage",paste0("/object/case-files/",key),token,bytes,"POST"),
    error=function(e){tryCatch(verify_object(),error=function(ignored)stop("Checkpoint upload incomplete. Retry this saved checkpoint."))})
  verify_object()
  record<-list(project_id=project,object_path=key,original_name=paste0(label,".zip"),sha256=hash,size_bytes=length(bytes))
  tryCatch(call("rest","/pilot_files",token,record,"POST"),error=function(e){
    if(!length(lookup()))stop("Upload verified; registration is pending. Click Retry saved checkpoint.")
  })
  if(!length(lookup()))stop("Checkpoint registration could not be verified. Retry this saved checkpoint.")
  invisible(hash)
}
# Durable queue is operator-owned, outside the application release and web root.
team_library_queue <- function(user, pending=NULL, clear=FALSE, expected=NULL) {
  root<-Sys.getenv("LIPIDOMIC_UPLOAD_QUEUE")
  if(!nzchar(root)||!grepl("^[0-9a-f-]{36}$",user))stop("Durable checkpoint queue is not configured.")
  dir.create(root,recursive=TRUE,mode="0700",showWarnings=FALSE)
  slot<-file.path(root,user)
  lock<-paste0(slot,".lock")
  handle<-filelock::lock(lock,timeout=1000)
  if(is.null(handle))stop("Another checkpoint operation is in progress. Retry shortly.")
  on.exit(filelock::unlock(handle),add=TRUE)
  if(clear){
    if(dir.exists(slot)){
      m<-jsonlite::read_json(file.path(slot,"manifest.json"),simplifyVector=TRUE)
      if(is.null(expected)||!identical(m$sha256,expected))stop("The pending checkpoint changed. Sign in again before retrying.")
      unlink(slot,recursive=TRUE)
    }
    return(NULL)
  }
  if(!is.null(pending)){
    if(dir.exists(slot))stop("A saved checkpoint is pending. Retry it first.")
    stage<-tempfile(pattern=".staging-",tmpdir=root);dir.create(stage,mode="0700")
    on.exit(unlink(stage,recursive=TRUE),add=TRUE)
    if(!file.copy(pending$path,file.path(stage,"checkpoint.zip")))stop("Could not persist pending checkpoint.")
    Sys.chmod(file.path(stage,"checkpoint.zip"),"0600")
    manifest<-list(user=user,project=pending$project,label=pending$label,
      sha256=digest::digest(file=file.path(stage,"checkpoint.zip"),algo="sha256"))
    jsonlite::write_json(manifest,file.path(stage,"manifest.json"),auto_unbox=TRUE)
    Sys.chmod(file.path(stage,"manifest.json"),"0600")
    if(!file.rename(stage,slot))stop("Another save is pending. Sign in again to recover it.")
  }
  if(!dir.exists(slot))return(NULL)
  m<-jsonlite::read_json(file.path(slot,"manifest.json"),simplifyVector=TRUE)
  path<-file.path(slot,"checkpoint.zip")
  if(!identical(m$user,user)||!identical(digest::digest(file=path,algo="sha256"),m$sha256))stop("Pending checkpoint integrity check failed. Contact the administrator.")
  list(path=path,project=m$project,label=m$label,sha256=m$sha256)
}
team_library_ui <- function() {
  tags$section(class="team-library",style="background:white;border:1px solid #d9e5e8;border-radius:12px;margin:16px;padding:20px;",
    tags$style(HTML(".team-library .shiny-input-container{width:100%!important;margin-bottom:10px}.team-library-grid{display:grid;grid-template-columns:1fr 1.7fr 1fr;gap:18px;align-items:end}.team-library-login{display:flex;gap:16px;align-items:end;flex-wrap:wrap}.team-library-login>.shiny-input-container{flex:1;min-width:180px}.team-library select{min-height:44px}.team-library small{display:block;margin-top:14px;color:#526b77}@media(max-width:750px){.team-library-grid{grid-template-columns:1fr}.team-library{margin:8px!important;padding:16px!important}}")),
    h3("Project library"),p("Save a private checkpoint. Return to your analysis without uploading files again."),
    if (team_workspace_enabled()) tagAppendChild(uiOutput("team_library_account"),team_library_login_placeholder()) else uiOutput("team_library_account"),uiOutput("team_library_projects"),uiOutput("team_library_recovery"),
    tags$p(role="status",tagAppendChild(textOutput("team_library_status"),"Sign in to access saved projects.")))
}
# Shown inside the account output until the server's first render replaces it, so the sign-in card
# has its final size from the first paint (Team workspace only: its styles live in shell.css).
# Plain boxes, not inputs: nothing can be typed, focused or autofilled by a password manager
# before the real form arrives.
team_library_login_placeholder <- function() {
  field <- function(label) div(class="form-group shiny-input-container",tags$label(class="control-label",label),
    div(class="form-control",HTML("&nbsp;")))
  tagList(div(class="team-library-login team-library-login-placeholder",`aria-hidden`="true",
      field("Email"),field("Password"),tags$button(type="button",class="btn btn-default",tabindex="-1",tags$span("Sign in"))),
    tags$details(class="team-library-activation team-library-login-placeholder",`aria-hidden`="true",tags$summary(tabindex="-1","Activate your invitation or reset your password")))
}
team_library_server <- function(input,output,session,shared_data,on_authenticated=NULL) {
  account<-reactiveVal(NULL); projects<-reactiveVal(list()); members<-reactiveVal(list()); files<-reactiveVal(list()); status<-reactiveVal("Sign in to access saved projects.")
  # Credential rotation must not rebuild the project/name inputs while a Canvas
  # checkpoint is awaiting its acknowledgement. Only identity changes affect UI.
  account_identity<-reactiveVal(NULL)
  session$userData$team_library_authenticated <- function() !is.null(account_identity())
  session$userData$team_library_identity <- function() account_identity()$user
  set_account<-function(value){
    account(value)
    account_identity(if(is.null(value)) NULL else value[c("user","email")])
  }
  generation<-0L
  observe({a<-account_identity();session$sendCustomMessage("team-auth-state",list(authenticated=!is.null(a)))})
  observeEvent(input$team_workspace_ready,{session$sendCustomMessage("team-auth-state",list(authenticated=!is.null(isolate(account()))))})
  pending<-NULL
  bound_project <- reactiveVal(NULL)
  cleanup_pending<-function(){a<-isolate(account());if(!is.null(a))team_library_queue(a$user,clear=TRUE,expected=pending$sha256);pending<<-NULL}
  revoke <- function(a) {
    if (!is.null(a) && is.character(a$token) && length(a$token)==1L && nzchar(a$token))
      try(team_library_call("auth","/logout",a$token,method="POST"),silent=TRUE)
  }
  session$onSessionEnded(function(){a<-isolate(account());set_account(NULL);revoke(a)})
  guard<-function(code) tryCatch(force(code),error=function(e) {status(conditionMessage(e)); invisible(NULL)})
  foreground_restore_token <- reactiveVal(NULL)
  foreground_guard <- function(action, code) {
    token <- isolate(input[[paste0("team_foreground_",action)]])
    ok <- TRUE
    on.exit({
      if (is.character(token) && length(token)==1L && grepl("^foreground-[0-9]+$", token)) {
        if (identical(action,"team_library_resume") && ok) foreground_restore_token(token)
        else session$sendCustomMessage("team-foreground-result", list(id=token, ok=ok))
      }
    }, add=TRUE)
    tryCatch(force(code), error=function(e) {ok <<- FALSE; status(conditionMessage(e)); invisible(NULL)})
  }
  observe({
    req(account_identity())
    token <- foreground_restore_token()
    if (is.null(token)) return()
    if (!isTRUE(shared_data$is_restoring())) {
      restored <- isTRUE(shared_data$session_restored())
      foreground_restore_token(NULL)
      session$onFlushed(function() session$sendCustomMessage("team-foreground-result",list(id=token,ok=restored)),once=TRUE)
    }
  })
  access<-function(){a<-isolate(account());if(is.null(a))stop("Sign in first.")
    if(Sys.time()>a$expires) {
      r<-team_library_call("auth","/token?grant_type=refresh_token",body=list(refresh_token=a$refresh),method="POST")
      a$token<-r$access_token;a$refresh<-r$refresh_token;a$expires<-Sys.time()+r$expires_in-30;set_account(a)
    }
    # Online verification also rejects disabled users before any project operation.
    team_library_call("auth","/user",a$token);a$token
  }
  refresh_projects<-function(){tok<-access();projects(team_library_call("rest","/pilot_projects?order=name",tok));members(team_library_call("rest","/pilot_members",tok))}
  selected_project<-function(){id<-isolate(input$team_library_project)
    ids<-vapply(isolate(projects()),function(p)p$id,"")
    if(length(id)!=1 || !id %in% ids) stop("Choose an accessible project.");id}
  assert_project_binding <- function(id, bind=TRUE) {
    bound <- isolate(bound_project())
    if (!is.null(bound) && !identical(bound, id)) stop("This analysis is already bound to another project. Start a fresh session before switching projects.", call.=FALSE)
    if (is.null(bound) && isTRUE(bind)) bound_project(id)
    id
  }
  refresh_files<-function(){id<-selected_project();files(team_library_call("rest",paste0("/pilot_files?project_id=eq.",id,"&order=created_at.desc"),access()))}
  writable_project <- function(id=selected_project()) {
    a <- isolate(account()); mm <- isolate(members())
    if (is.null(a) || !length(mm) || !any(vapply(mm, function(m) {
      # The API is normally user-scoped and returns user_id. Older pilot
      # responses omit it; those responses are still scoped by the verified
      # bearer token and retain the role/project check for compatibility.
      same_user <- is.null(m$user_id) || identical(m$user_id, a$user)
      identical(m$project_id, id) && same_user && m$role %in% c("owner", "editor")
    }, logical(1))))
      stop("You need owner or editor access to save this project.", call.=FALSE)
    id
  }
  emit_autosave_context <- function() {
    a <- isolate(account()); id <- tryCatch(isolate(input$team_library_project), error=function(e) NULL)
    loaded <- tryCatch(length(shared_data$loaded_files()) > 0, error=function(e) FALSE)
    writable <- FALSE
    if (!is.null(a) && is.character(id) && length(id)==1L && nzchar(id))
      writable <- any(vapply(isolate(members()), function(m) {
        same_user <- is.null(m$user_id) || identical(m$user_id, a$user)
        identical(m$project_id,id) && same_user && m$role %in% c("owner","editor")
      }, logical(1)))
    session$sendCustomMessage("team-autosave-context", list(loaded=loaded, writable=writable,
      project=if(is.character(id)&&length(id)==1L) id else NULL))
  }
  observe({ req(account_identity()); input$team_library_project; members(); emit_autosave_context() })
  observe({
    req(account_identity())
    loaded <- tryCatch(length(shared_data$loaded_files()) > 0, error=function(e) FALSE)
    if (team_workspace_enabled() && loaded && is.null(isolate(bound_project()))) {
      id <- tryCatch(isolate(input$team_library_project), error=function(e) NULL)
      ids <- vapply(isolate(projects()), function(p) p$id, "")
      if (is.character(id) && length(id)==1L && id %in% ids) bound_project(id)
    }
  })
  output$team_library_account<-renderUI({a<-account_identity();if(is.null(a)) tagList(
    div(class="team-library-login",textInput("team_library_email","Email"),passwordInput("team_library_password","Password"),actionButton("team_library_login","Sign in")),
    tags$details(class="team-library-activation",tags$summary("Activate your invitation or reset your password"),
      p("Use the one-time activation code supplied by your administrator. Then sign in with your new password."),
      textInput("team_library_activation_email","Email"),
      passwordInput("team_library_activation_code","Activation code"),
      selectInput("team_library_activation_type","Code type",c("Invitation"="invite","Password recovery"="recovery"),selectize=FALSE),
      passwordInput("team_library_activation_password","New password (at least 12 characters)"),
      passwordInput("team_library_activation_confirm","Confirm new password"),
      actionButton("team_library_activation_submit","Set password"))) else tagList(p(paste("Signed in as",a$email)),actionButton("team_library_logout","Sign out and clear this session"))})
  activation_busy <- FALSE
  observeEvent(input$team_library_activation_submit, foreground_guard("team_library_activation_submit", {
    if(activation_busy) return()
    activation_busy <<- TRUE
    tryCatch({
      values <- lapply(c("email","code","type","password","confirm"),function(suffix) input[[paste0("team_library_activation_",suffix)]])
      names(values) <- c("email","code","type","password","confirm")
      # Clear secrets immediately; no temporary access token enters account().
      for(suffix in c("email","code","password","confirm")) updateTextInput(session,paste0("team_library_activation_",suffix),value="")
      updateSelectInput(session,"team_library_activation_type",selected="invite")
      updateTextInput(session,"team_library_password",value="")
      if(!is.null(isolate(account()))) stop("Sign out before setting a password.",call.=FALSE)
      do.call(team_library_activate,values)
      status("Password set. Sign in normally with your email and new password.")
    },finally={activation_busy <<- FALSE})
  }))
  output$team_library_projects<-renderUI({req(account_identity());pp<-projects();ff<-files();mm<-members()
    if(!length(pp))return(p("No projects are shared with this account yet. Ask your project owner for access."))
    active<-isolate(input$team_library_project);if(is.null(active)||!nzchar(active))active<-pp[[1]]$id
    writable<-any(vapply(mm,function(m)identical(m$project_id,active)&&m$role %in% c("owner","editor"),logical(1)))
    pc<-setNames(vapply(pp,function(x)x$id,""),vapply(pp,function(x)x$name,""))
    ff<-Filter(function(x)grepl("\\.zip$",x$original_name,ignore.case=TRUE),ff)
    fc<-setNames(vapply(ff,function(x)x$id,""),vapply(ff,function(x)paste(x$original_name,substr(x$created_at,1,19)),""))
    draft_label<-isolate(input$team_library_label)
    if(!is.character(draft_label)||length(draft_label)!=1L||is.na(draft_label))draft_label<-"Analysis checkpoint"
    tagList(div(class="team-library-grid",
      div(class="team-library-project",selectInput("team_library_project","Project",pc,selected=isolate(input$team_library_project),selectize=FALSE)),
      div(class="team-library-resume",selectInput("team_library_checkpoint","Saved checkpoint",fc,selectize=FALSE),actionButton("team_library_resume","Resume checkpoint")),
      if(writable) div(class="team-library-save",textInput("team_library_label","New checkpoint name",draft_label),actionButton("team_library_save","Save current analysis")) else p("Read-only access: you can resume checkpoints but cannot save new versions here.")),
      tags$small("A checkpoint stores your files and settings. Resuming opens Review and automatically updates the data table and PCA; AI-proposed scientific changes still require confirmation."))})
  output$team_library_status<-renderText(status())
  output$team_library_recovery<-renderUI({
    status() # Recheck the durable queue after a save, recovery or sign-in result.
    if(is.null(account_identity()) || is.null(pending)) return(NULL)
    div(class="team-library-recovery",p("An interrupted checkpoint is waiting. Select its original project, then retry."),
        actionButton("team_library_retry","Retry saved checkpoint"))
  })
  login_attempt <- team_library_login_limiter()
  observeEvent(input$team_library_login,foreground_guard("team_library_login",{
    if(!is.null(isolate(account())))stop("Sign out before switching accounts.")
    email <- trimws(input$team_library_email)
    password <- input$team_library_password
    updateTextInput(session,"team_library_password",value="")
    login_attempt()
    r<-tryCatch(team_library_call("auth","/token?grant_type=password",body=list(email=email,password=password),method="POST"),
      error=function(e) stop("Sign-in failed. Check your email and password, or try again later.",call.=FALSE))
    rm(password)
    set_account(list(token=r$access_token,refresh=r$refresh_token,expires=Sys.time()+r$expires_in-30,email=r$user$email,user=r$user$id))
    tryCatch({
      refresh_projects();pending<<-team_library_queue(r$user$id)
      status(if(!is.null(pending)) "An interrupted checkpoint is ready to recover. Select its project and click Retry saved checkpoint." else "Signed in. Choose a project and a saved checkpoint.")
      if (is.function(on_authenticated)) on_authenticated()
    }, error=function(e) {
      a<-isolate(account());revoke(a)
      set_account(NULL);projects(list());members(list());files(list())
      # A failed scientific start may already have registered observers. This
      # Shiny session must never be reused for another login attempt.
      if (team_workspace_enabled()) {
        session$close()
        stop("The workspace could not start. Reload the page and sign in again.", call.=FALSE)
      }
      stop(e)
    })
  }))
  observeEvent(input$team_library_project,guard(refresh_files()),ignoreInit=TRUE)
  observeEvent(input$team_library_logout,{
    a<-isolate(account());revoke(a)
    set_account(NULL);projects(list());members(list());files(list());generation<<-generation+1L
    # Reload destroys the scientific session too; a second identity cannot inherit data.
    session$reload()
    if (team_workspace_enabled()) session$onFlushed(function() session$close(), once=TRUE)
  })
  records_restore_observer <- NULL
  records_restore_sequence <- 0L
  records_generation <- function(){
    full<-session$userData$team_shared_data
    read<-if(is.function(shared_data$restore_generation))shared_data$restore_generation else if(is.list(full))full$restore_generation else NULL
    if(is.function(read))isolate(read()) else NULL
  }
  canvas_save_request <- NULL
  autosave_request <- NULL
  canvas_save_sequence <- 0L
  autosave_sequence <- 0L
  recover_pending <- function(id, tok) {
    if (is.null(pending) && team_workspace_enabled()) pending <<- team_library_queue(isolate(account())$user)
    if (is.null(pending)) return(invisible(TRUE))
    if (!identical(pending$project, id)) stop("An interrupted checkpoint belongs to another project. Select that project before retrying.", call.=FALSE)
    team_library_commit(pending$path, pending$project, pending$label, tok)
    cleanup_pending()
    invisible(TRUE)
  }
  save_checkpoint <- function(label=NULL) {
    tok<-access();if (team_workspace_enabled()) members(team_library_call("rest","/pilot_members",tok));id<-if (team_workspace_enabled()) writable_project() else selected_project();if(team_workspace_enabled()) assert_project_binding(id);req(length(shared_data$loaded_files())>0)
    if (is.null(label)) label<-trimws(input$team_library_label)
    if (!is.character(label)||length(label)!=1L||!nzchar(label)||nchar(label)>80)stop("Use a checkpoint name between 1 and 80 characters.")
    recover_pending(id, tok)
    path<-tempfile(fileext=".zip")
    tryCatch({shared_data$export_session_path(path);if(team_workspace_enabled())team_project_records_attach(path,session)},error=function(e){unlink(path);stop(e)})
    if(file.info(path)$size>100*1024^2){unlink(path);stop("Checkpoint exceeds the pilot's 100 MiB limit.")}
    on.exit(unlink(path),add=TRUE)
    pending<<-team_library_queue(isolate(account())$user,list(path=path,project=id,label=label))
    team_library_commit(pending$path,id,label,tok)
    cleanup_pending()
    if(team_workspace_enabled() && is.function(session$userData$team_project_records_saved)) session$userData$team_project_records_saved()
    refresh_files();status(if (team_workspace_enabled()) "Checkpoint saved privately: canvas, finished figures, methods, design notes, run history and companion actions. Your applied scientific settings have not changed." else "Checkpoint saved privately. Your applied scientific settings have not changed.")
    TRUE
  }
  observeEvent(input$team_library_save,foreground_guard("team_library_save",{
    if (!team_workspace_enabled()) return(save_checkpoint())
    if (!is.null(autosave_request)) { status("Autosave is in progress. Your named checkpoint will be available when it finishes."); return(invisible(NULL)) }
    tok <- access(); members(team_library_call("rest","/pilot_members",tok)); project <- selected_project(); assert_project_binding(project); req(length(shared_data$loaded_files()) > 0)
    canvas_save_sequence <<- canvas_save_sequence + 1L
    canvas_save_request <<- list(id=paste0("checkpoint-",canvas_save_sequence),
                                user=isolate(account())$user, project=project,
                                label=isolate(input$team_library_label), started=Sys.time())
    status("Saving your latest canvas edits before creating the checkpoint…")
    session$sendCustomMessage("team-canvas-save-request",list(requestId=canvas_save_request$id))
  }))
  handle_canvas_ack <- function(reply, request, kind=c("manual","autosave")) {
    kind <- match.arg(kind)
    if (is.null(request) || !is.list(reply) || !identical(reply$requestId,request$id)) return(FALSE)
    if (kind == "manual") canvas_save_request <<- NULL else autosave_request <<- NULL
    ok <- guard({
      a <- isolate(account())
      if (is.null(a) || !identical(a$user,request$user) ||
          as.numeric(difftime(Sys.time(),request$started,units="secs")) > 120)
        stop("This checkpoint request expired. Please try again.", call.=FALSE)
      if (!isTRUE(reply$ok)) stop("Canvas could not be saved. Check the canvas message and try again.", call.=FALSE)
      if (!identical(selected_project(),request$project))
        stop("The project or checkpoint name changed while saving. Please try again.", call.=FALSE)
      if (kind == "manual" && !identical(isolate(input$team_library_label),request$label))
        stop("The checkpoint name changed while saving. Please try again.", call.=FALSE)
      ack <- session$userData$team_canvas_acked_token
      if (!is.function(ack) || !is.character(reply$token) || length(reply$token)!=1L ||
          !nzchar(reply$token) || !identical(reply$token,ack()))
        stop("The latest canvas changes have not been confirmed. Please try again.", call.=FALSE)
      if (kind == "autosave") save_checkpoint(request$label) else save_checkpoint()
    })
    session$sendCustomMessage("team-canvas-save-result",list(requestId=request$id,ok=isTRUE(ok)))
    if (kind == "autosave")
      session$sendCustomMessage("team-autosave-result",list(requestId=request$id,revision=request$revision,ok=isTRUE(ok),message=if(isTRUE(ok)) "Saved" else status()))
    isTRUE(ok)
  }
  observeEvent(input$team_canvas_save_ready, {
    if (!team_workspace_enabled()) return()
    reply <- input$team_canvas_save_ready
    if (!is.null(canvas_save_request)) return(handle_canvas_ack(reply, canvas_save_request, "manual"))
    if (!is.null(autosave_request)) handle_canvas_ack(reply, autosave_request, "autosave")
  })
  observeEvent(input$team_library_autosave_request, {
    if (!team_workspace_enabled()) return()
    payload <- input$team_library_autosave_request
    if (!is.null(canvas_save_request) || !is.null(autosave_request)) {
      session$sendCustomMessage("team-autosave-result", list(
        revision=if (is.list(payload)) payload$revision else NULL,
        ok=FALSE, message="A save is already in progress; retry after it finishes."))
      return()
    }
    ok <- guard({
      if (!is.list(payload) || !is.character(payload$revision) || length(payload$revision)!=1L ||
          !grepl("^[A-Za-z0-9._:-]{1,120}$", payload$revision)) stop("Invalid autosave revision.", call.=FALSE)
      tok <- access(); members(team_library_call("rest","/pilot_members",tok)); project <- writable_project(); assert_project_binding(project); req(length(shared_data$loaded_files()) > 0)
      recover_pending(project, isolate(account())$token)
      autosave_sequence <<- autosave_sequence + 1L
      autosave_request <<- list(id=paste0("autosave-",autosave_sequence), revision=payload$revision,
                                user=isolate(account())$user, project=project,
                                label=paste0("Autosave ",format(Sys.time(), "%Y-%m-%d %H:%M:%S UTC", tz="UTC"), " · ", substr(session$token,1,6)), started=Sys.time())
      status("Saving latest workspace changes…")
      session$sendCustomMessage("team-canvas-save-request",list(requestId=autosave_request$id,kind="autosave"))
      local({
        request <- autosave_request
        later::later(function() {
          if (session$isClosed() || is.null(autosave_request) || !identical(autosave_request$id,request$id)) return()
          autosave_request <<- NULL
          session$sendCustomMessage("team-canvas-save-result",list(requestId=request$id,ok=FALSE))
          session$sendCustomMessage("team-autosave-result",list(revision=request$revision,ok=FALSE,message="Save timed out. Your changes remain in this tab."))
        }, 120)
      })
      TRUE
    })
    if (!isTRUE(ok) && is.null(autosave_request))
      session$sendCustomMessage("team-autosave-result",list(revision=if(is.list(payload)) payload$revision else NULL,ok=FALSE,message=status()))
  })
  observeEvent(input$team_library_retry,foreground_guard("team_library_retry",{
    if(is.null(pending))stop("There is no pending checkpoint to retry.")
    tok<-access(); members(team_library_call("rest","/pilot_members",tok))
    writable_project(pending$project)
    team_library_commit(pending$path,pending$project,pending$label,tok)
    cleanup_pending();refresh_files();status("Checkpoint recovered and saved. No scientific settings were changed.")
  }))
  observe({
    # Before authentication the deferred backend returns plain FALSE, with no
    # reactive dependency. Subscribe only after scientific startup is available.
    req(account_identity())
    if(isTRUE(shared_data$session_restored())) status(if(team_workspace_enabled()) "Checkpoint restored. Review is open; the data table and PCA update automatically." else "Checkpoint restored. Review Design and Quality, then confirm Prepare data. No new file upload is needed.")
  })
  observeEvent(input$team_library_resume,foreground_guard("team_library_resume",{
    tok<-access();project<-selected_project();ff<-isolate(files());id<-isolate(input$team_library_checkpoint)
    chosen<-Filter(function(x)identical(x$id,id),ff)
    if(length(chosen)!=1)stop("Choose a saved checkpoint.")
    if(length(shared_data$loaded_files()))stop("Open a fresh session before resuming another checkpoint, so current work is not replaced.")
    x<-chosen[[1]];if(!grepl("^[0-9a-f-]{36}/[0-9a-f]{64}$",x$object_path))stop("Invalid checkpoint path.")
    bytes<-team_library_call("storage",paste0("/object/authenticated/case-files/",x$object_path),tok,raw=TRUE)
    if(!identical(digest::digest(bytes,algo="sha256",serialize=FALSE),x$sha256))stop("Checkpoint integrity check failed.")
    path<-tempfile(fileext=".zip");writeBin(bytes,path);on.exit(unlink(path),add=TRUE)
    assert_project_binding(project)
    status("Loading the saved checkpoint…")
    records<-if(team_workspace_enabled())team_project_records_read(path) else NULL
    if(team_workspace_enabled()){
      # Cancel even a failed earlier import before beginning another generation.
      if(!is.null(records_restore_observer))records_restore_observer$destroy()
      records_restore_observer<<-NULL;records_restore_sequence<<-records_restore_sequence+1L
    }
    shared_data$import_session_path(path)
    if(team_workspace_enabled()){
      request_sequence<-records_restore_sequence;request_generation<-records_generation()
      restore_records<-observe({
        if(!identical(request_sequence,records_restore_sequence) ||
           !identical(records_generation(),request_generation) ||
           !identical(input$team_library_project,project)){
          restore_records$destroy();return()
        }
        if(!isTRUE(shared_data$is_restoring()) && isTRUE(shared_data$session_restored())){
          session$userData$team_project_records_import(records);restore_records$destroy()
          records_restore_observer<<-NULL
        }
      },priority=-1000)
      records_restore_observer<<-restore_records
    }
  }))
  invisible(account)
}
