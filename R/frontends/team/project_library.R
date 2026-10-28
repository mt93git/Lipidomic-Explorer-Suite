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
    uiOutput("team_library_account"),uiOutput("team_library_projects"),
    tags$p(role="status",textOutput("team_library_status")))
}
team_library_server <- function(input,output,session,shared_data,on_authenticated=NULL) {
  account<-reactiveVal(NULL); projects<-reactiveVal(list()); members<-reactiveVal(list()); files<-reactiveVal(list()); status<-reactiveVal("Sign in to access saved projects.")
  generation<-0L
  observe({a<-account();session$sendCustomMessage("team-auth-state",list(authenticated=!is.null(a)))})
  observeEvent(input$team_workspace_ready,{session$sendCustomMessage("team-auth-state",list(authenticated=!is.null(isolate(account()))))})
  pending<-NULL
  cleanup_pending<-function(){a<-isolate(account());if(!is.null(a))team_library_queue(a$user,clear=TRUE,expected=pending$sha256);pending<<-NULL}
  revoke <- function(a) {
    if (!is.null(a) && is.character(a$token) && length(a$token)==1L && nzchar(a$token))
      try(team_library_call("auth","/logout",a$token,method="POST"),silent=TRUE)
  }
  session$onSessionEnded(function(){a<-isolate(account());account(NULL);revoke(a)})
  guard<-function(code) tryCatch(force(code),error=function(e) {status(conditionMessage(e)); invisible(NULL)})
  access<-function(){a<-isolate(account());if(is.null(a))stop("Sign in first.")
    if(Sys.time()>a$expires) {
      r<-team_library_call("auth","/token?grant_type=refresh_token",body=list(refresh_token=a$refresh),method="POST")
      a$token<-r$access_token;a$refresh<-r$refresh_token;a$expires<-Sys.time()+r$expires_in-30;account(a)
    }
    # Online verification also rejects disabled users before any project operation.
    team_library_call("auth","/user",a$token);a$token
  }
  refresh_projects<-function(){tok<-access();projects(team_library_call("rest","/pilot_projects?order=name",tok));members(team_library_call("rest","/pilot_members",tok))}
  selected_project<-function(){id<-isolate(input$team_library_project)
    ids<-vapply(isolate(projects()),function(p)p$id,"")
    if(length(id)!=1 || !id %in% ids) stop("Choose an accessible project.");id}
  refresh_files<-function(){id<-selected_project();files(team_library_call("rest",paste0("/pilot_files?project_id=eq.",id,"&order=created_at.desc"),access()))}
  output$team_library_account<-renderUI({a<-account();if(is.null(a)) div(class="team-library-login",
    textInput("team_library_email","Email"),passwordInput("team_library_password","Password"),actionButton("team_library_login","Sign in")) else tagList(p(paste("Signed in as",a$email)),actionButton("team_library_logout","Sign out and clear this session"))})
  output$team_library_projects<-renderUI({req(account());pp<-projects();ff<-files();mm<-members()
    if(!length(pp))return(p("No projects are shared with this account yet. Ask your project owner for access."))
    active<-isolate(input$team_library_project);if(is.null(active)||!nzchar(active))active<-pp[[1]]$id
    writable<-any(vapply(mm,function(m)identical(m$project_id,active)&&m$role %in% c("owner","editor"),logical(1)))
    pc<-setNames(vapply(pp,function(x)x$id,""),vapply(pp,function(x)x$name,""))
    ff<-Filter(function(x)grepl("\\.zip$",x$original_name,ignore.case=TRUE),ff)
    fc<-setNames(vapply(ff,function(x)x$id,""),vapply(ff,function(x)paste(x$original_name,substr(x$created_at,1,19)),""))
    tagList(div(class="team-library-grid",
      div(selectInput("team_library_project","Project",pc,selected=isolate(input$team_library_project),selectize=FALSE)),
      div(selectInput("team_library_checkpoint","Saved checkpoint",fc,selectize=FALSE),actionButton("team_library_resume","Resume checkpoint")),
      if(writable) div(textInput("team_library_label","New checkpoint name","Analysis checkpoint"),actionButton("team_library_save","Save current analysis"),actionButton("team_library_retry","Retry saved checkpoint")) else p("Read-only access: you can resume checkpoints but cannot save new versions here.")),
      tags$small("A checkpoint stores your files and settings. Restoring requires review before Prepare data; it never applies new scientific parameters automatically."))})
  output$team_library_status<-renderText(status())
  observeEvent(input$team_library_login,guard({
    if(!is.null(isolate(account())))stop("Sign out before switching accounts.")
    email <- trimws(input$team_library_email)
    password <- input$team_library_password
    updateTextInput(session,"team_library_password",value="")
    r<-team_library_call("auth","/token?grant_type=password",body=list(email=email,password=password),method="POST")
    rm(password)
    account(list(token=r$access_token,refresh=r$refresh_token,expires=Sys.time()+r$expires_in-30,email=r$user$email,user=r$user$id))
    tryCatch({
      refresh_projects();pending<<-team_library_queue(r$user$id)
      status(if(!is.null(pending)) "An interrupted checkpoint is ready to recover. Select its project and click Retry saved checkpoint." else "Signed in. Choose a project and a saved checkpoint.")
      if (is.function(on_authenticated)) on_authenticated()
    }, error=function(e) {
      a<-isolate(account());revoke(a)
      account(NULL);projects(list());members(list());files(list())
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
    account(NULL);projects(list());members(list());files(list());generation<<-generation+1L
    # Reload destroys the scientific session too; a second identity cannot inherit data.
    session$reload()
    if (team_workspace_enabled()) session$onFlushed(function() session$close(), once=TRUE)
  })
  observeEvent(input$team_library_save,guard({
    tok<-access();id<-selected_project();req(length(shared_data$loaded_files())>0)
    label<-trimws(input$team_library_label);if(!nzchar(label)||nchar(label)>80)stop("Use a checkpoint name between 1 and 80 characters.")
    if(!is.null(pending))stop("A checkpoint is pending. Retry it before saving another version.")
    path<-tempfile(fileext=".zip")
    tryCatch(shared_data$export_session_path(path),error=function(e){unlink(path);stop(e)})
    if(file.info(path)$size>100*1024^2){unlink(path);stop("Checkpoint exceeds the pilot's 100 MiB limit.")}
    on.exit(unlink(path),add=TRUE)
    pending<<-team_library_queue(isolate(account())$user,list(path=path,project=id,label=label))
    team_library_commit(pending$path,id,label,tok)
    cleanup_pending()
    refresh_files();status("Checkpoint saved privately. Your applied scientific settings have not changed.")
  }))
  observeEvent(input$team_library_retry,guard({
    if(is.null(pending))stop("There is no pending checkpoint to retry.")
    tok<-access()
    if(!identical(selected_project(),pending$project))stop("Select the project used for the pending checkpoint.")
    team_library_commit(pending$path,pending$project,pending$label,tok)
    cleanup_pending();refresh_files();status("Checkpoint recovered and saved. No scientific settings were changed.")
  }))
  observeEvent(shared_data$session_restored(), {
    if(isTRUE(shared_data$session_restored()) && !is.null(account())) status("Checkpoint restored. Review Design and Quality, then confirm Prepare data. No new file upload is needed.")
  },ignoreInit=TRUE)
  observeEvent(input$team_library_resume,guard({
    tok<-access();selected_project();ff<-isolate(files());id<-isolate(input$team_library_checkpoint)
    chosen<-Filter(function(x)identical(x$id,id),ff)
    if(length(chosen)!=1)stop("Choose a saved checkpoint.")
    if(length(shared_data$loaded_files()))stop("Open a fresh session before resuming another checkpoint, so current work is not replaced.")
    x<-chosen[[1]];if(!grepl("^[0-9a-f-]{36}/[0-9a-f]{64}$",x$object_path))stop("Invalid checkpoint path.")
    bytes<-team_library_call("storage",paste0("/object/authenticated/case-files/",x$object_path),tok,raw=TRUE)
    if(!identical(digest::digest(bytes,algo="sha256",serialize=FALSE),x$sha256))stop("Checkpoint integrity check failed.")
    path<-tempfile(fileext=".zip");writeBin(bytes,path);on.exit(unlink(path),add=TRUE)
    shared_data$import_session_path(path)
    status("Restoring checkpoint. Review Design and Quality before preparing data.")
  }))
  invisible(account)
}
