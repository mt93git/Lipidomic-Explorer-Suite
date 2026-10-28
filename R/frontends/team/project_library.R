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
team_library_ui <- function() {
  tags$section(class="team-library",style="background:white;border:1px solid #d9e5e8;border-radius:12px;margin:16px;padding:20px;",
    tags$style(HTML(".team-library .shiny-input-container{width:100%!important;margin-bottom:10px}.team-library-grid{display:grid;grid-template-columns:1fr 1.7fr 1fr;gap:18px;align-items:end}.team-library-login{display:flex;gap:16px;align-items:end;flex-wrap:wrap}.team-library-login>.shiny-input-container{flex:1;min-width:180px}.team-library select{min-height:44px}.team-library small{display:block;margin-top:14px;color:#526b77}@media(max-width:750px){.team-library-grid{grid-template-columns:1fr}.team-library{margin:8px!important;padding:16px!important}}")),
    h3("Project library"),p("Save a private checkpoint. Return to your analysis without uploading files again."),
    uiOutput("team_library_account"),uiOutput("team_library_projects"),
    tags$p(role="status",textOutput("team_library_status")))
}
team_library_server <- function(input,output,session,shared_data) {
  account<-reactiveVal(NULL); projects<-reactiveVal(list()); members<-reactiveVal(list()); files<-reactiveVal(list()); status<-reactiveVal("Sign in to access saved projects.")
  generation<-0L
  session$onSessionEnded(function(){account(NULL)})
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
      if(writable) div(textInput("team_library_label","New checkpoint name","Analysis checkpoint"),actionButton("team_library_save","Save current analysis")) else p("Read-only access: you can resume checkpoints but cannot save new versions here.")),
      tags$small("A checkpoint stores your files and settings. Restoring requires review before Prepare data; it never applies new scientific parameters automatically."))})
  output$team_library_status<-renderText(status())
  observeEvent(input$team_library_login,guard({
    if(!is.null(isolate(account())))stop("Sign out before switching accounts.")
    r<-team_library_call("auth","/token?grant_type=password",body=list(email=trimws(input$team_library_email),password=input$team_library_password),method="POST")
    updateTextInput(session,"team_library_password",value="")
    account(list(token=r$access_token,refresh=r$refresh_token,expires=Sys.time()+r$expires_in-30,email=r$user$email))
    refresh_projects();status("Signed in. Choose a project and a saved checkpoint.")
  }))
  observeEvent(input$team_library_project,guard(refresh_files()),ignoreInit=TRUE)
  observeEvent(input$team_library_logout,{
    a<-isolate(account());if(!is.null(a))try(team_library_call("auth","/logout",a$token,method="POST"),silent=TRUE)
    account(NULL);projects(list());files(list());generation<<-generation+1L
    # Reload destroys the scientific session too; a second identity cannot inherit data.
    session$reload()
  })
  observeEvent(input$team_library_save,guard({
    tok<-access();id<-selected_project();req(length(shared_data$loaded_files())>0)
    label<-trimws(input$team_library_label);if(!nzchar(label)||nchar(label)>80)stop("Use a checkpoint name between 1 and 80 characters.")
    path<-tempfile(fileext=".zip");on.exit(unlink(path),add=TRUE)
    shared_data$export_session_path(path)
    if(file.info(path)$size>100*1024^2)stop("Checkpoint exceeds the pilot's 100 MiB limit.")
    hash<-digest::digest(file=path,algo="sha256");key<-paste0(id,"/",hash)
    existing<-team_library_call("rest",paste0("/pilot_files?project_id=eq.",id,"&sha256=eq.",hash),tok)
    if(!length(existing)) {
      bytes<-readBin(path,"raw",n=file.info(path)$size)
      team_library_call("storage",paste0("/object/case-files/",key),tok,bytes,"POST")
      team_library_call("rest","/pilot_files",tok,list(project_id=id,object_path=key,original_name=paste0(label,".zip"),sha256=hash,size_bytes=length(bytes)),"POST")
    }
    refresh_files();status("Checkpoint saved privately. Your applied scientific settings have not changed.")
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
}
