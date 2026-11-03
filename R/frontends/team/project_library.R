# Team-only persistence. User tokens live in a single Shiny session, never globals.
# Ported from origin/claude/project-thread-okihs3:R/frontends/team/project_library.R.
# The Supabase transport and idempotent commit (team_library_call,
# team_library_commit) now live behind the storage API in
# R/frontends/team/storage/; checkpoint save/resume/retry go through a store
# from team_storage_session(), so the same flow works with either backend.
#
# team_library_ui(), team_library_login_placeholder() and team_library_server()
# below are production's, with checkpoint list/save/load going through the
# session's store and sign-in through team_library_sign_in(). With
# LIPIDOMIC_STORAGE=files there is no identity service: the library opens a
# single local project without sign-in (see storage/README.md).

team_library_enabled <- function() identical(Sys.getenv("LIPIDOMIC_PROJECT_LIBRARY"), "1")

# Sign-in throttle, ON by default and never blocking. Per account (normalized
# email): the first 5 failed attempts get no wait; after that the next attempt
# is refused for 1 s, 2 s, 4 s ... (capped at 60 s) counted from the last
# failure. There is no lockout, and a successful sign-in resets the account.
# LIPIDOMIC_LOGIN_THROTTLE=off (or 0/false/no) restores immediate retries: the
# Team pilot, where Gerardo requested immediate sign-in retries, keeps that
# behaviour by setting the variable to off at its next deploy. Authentication
# and project permissions remain enforced by the identity service either way.
#
# Call shape kept from production: `attempt <- team_library_login_limiter()`.
#   attempt(email)                     before a sign-in; returns list(allowed=TRUE)
#                                      or list(allowed=FALSE, retry_after_seconds=N).
#                                      When refused, do NOT contact the identity service.
#   attempt(email, outcome="failure")  after a failed sign-in
#   attempt(email, outcome="success")  after a successful sign-in (reset)
# attempt() with no email is allowed, as in production. Failure counts are kept
# per R process, shared by its sessions (a reload does not reset them; a process
# restart does) and forgotten after 24 h without failures. Only email hashes
# are kept. team_library_sign_in() below is the guarded flow for the port.
# Production does not route activation attempts through this limiter.
team_library_login_state <- new.env(parent=emptyenv())
team_library_login_throttle_enabled <- function(value=Sys.getenv("LIPIDOMIC_LOGIN_THROTTLE", unset="")) {
  !tolower(trimws(value)) %in% c("off","0","false","no")
}
team_library_login_delay <- function(failures, free=5L, cap=60) {
  if (failures < free) 0 else min(cap, 2^(failures - free))
}
team_library_login_limiter <- function(now=function() as.numeric(Sys.time()), state=team_library_login_state) {
  forget_after <- 24 * 3600
  allowed <- list(allowed=TRUE)
  function(email=NULL, outcome=c("attempt","failure","success")) {
    outcome <- match.arg(outcome)
    if (!team_library_login_throttle_enabled()) return(allowed)
    if (!is.character(email) || length(email) != 1L || is.na(email)) return(allowed)
    key <- digest::digest(tolower(trimws(email)), algo="sha256", serialize=FALSE)
    t <- now()
    for (k in ls(state)) if (t - state[[k]]$last > forget_after) rm(list=k, envir=state)
    entry <- if (exists(key, envir=state, inherits=FALSE)) state[[key]] else list(failures=0L, last=t)
    if (identical(outcome, "success")) {
      if (exists(key, envir=state, inherits=FALSE)) rm(list=key, envir=state)
    } else if (identical(outcome, "failure")) {
      assign(key, list(failures=entry$failures + 1L, last=t), envir=state)
    } else {
      # The wait counts from the last failure; time already waited is credited.
      remaining <- team_library_login_delay(entry$failures) - (t - entry$last)
      if (remaining > 0) return(list(allowed=FALSE, retry_after_seconds=as.integer(ceiling(remaining))))
    }
    allowed
  }
}
team_library_login_wait_message <- function(result) {
  sprintf("Too many attempts. Try again in %d s.", as.integer(result$retry_after_seconds))
}
# Guarded password sign-in for the team_library_server port: a refused attempt
# never reaches the identity service; outcomes feed the limiter.
team_library_sign_in <- function(email, password, attempt, call=team_library_call) {
  gate <- attempt(email)
  if (!isTRUE(gate$allowed)) stop(team_library_login_wait_message(gate), call.=FALSE)
  r <- tryCatch(call("auth","/token?grant_type=password",body=list(email=email,password=password),method="POST"),
    error=function(e) NULL)
  if (is.null(r) || !is.character(r$access_token) || length(r$access_token) != 1L || !nzchar(r$access_token)) {
    attempt(email, outcome="failure")
    stop("Sign-in failed. Check your email and password, or try again later.", call.=FALSE)
  }
  attempt(email, outcome="success")
  r
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

# Durable queue is operator-owned, outside the application release and web root.
# Production code, unchanged.
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

team_library_checkpoint_limit <- 100 * 1024^2

# Storage half of production's save_checkpoint(): export the session ZIP,
# optionally append the archived records sidecar, enforce the pilot size limit,
# then save through the store. With `user`, the bytes pass through the durable
# queue first (production's database flow) and the queue slot is cleared only
# after the store confirms the save.
team_library_save_checkpoint <- function(store, project, label, export, attach_records=NULL,
                                         user=NULL, queue=team_library_queue) {
  if (!inherits(store, "team_storage")) stop("Checkpoint storage is not ready.", call.=FALSE)
  label <- team_storage_check_label(label)
  path <- tempfile(fileext=".zip")
  on.exit(unlink(path), add=TRUE)
  export(path)
  if (is.function(attach_records)) attach_records(path)
  if (!file.exists(path)) stop("The checkpoint could not be created.", call.=FALSE)
  if (file.info(path)$size > team_library_checkpoint_limit) stop("Checkpoint exceeds the pilot's 100 MiB limit.", call.=FALSE)
  if (is.null(user)) return(store$save(project, path, label))
  pending <- queue(user, list(path=path, project=project, label=label))
  record <- store$save(project, pending$path, label)
  queue(user, clear=TRUE, expected=pending$sha256)
  record
}

# Production's recover_pending(): retry an interrupted save for this user.
team_library_recover_pending <- function(store, user, project, queue=team_library_queue) {
  pending <- queue(user)
  if (is.null(pending)) return(invisible(NULL))
  if (!identical(pending$project, project))
    stop("An interrupted checkpoint belongs to another project. Select that project before retrying.", call.=FALSE)
  record <- store$save(pending$project, pending$path, pending$label)
  queue(user, clear=TRUE, expected=pending$sha256)
  record
}

# Storage half of production's resume handler: verified load, read the records
# sidecar before import, import, then remove the temporary copy.
team_library_resume_checkpoint <- function(store, project, id, import, read_records=FALSE) {
  if (!inherits(store, "team_storage")) stop("Checkpoint storage is not ready.", call.=FALSE)
  path <- store$load(project, id)
  on.exit(unlink(path), add=TRUE)
  records <- if (isTRUE(read_records)) team_project_records_read(path) else NULL
  import(path)
  invisible(records)
}

# Sign-in exists only with the database backend. LIPIDOMIC_STORAGE=files is a
# single local user with no identity service: the library opens one local
# project immediately and the workspace starts without a sign-in form.
team_library_uses_identity <- function() identical(team_storage_backend(), "database")
team_library_local_project <- "local"

team_library_ui <- function() {
  identity <- team_library_uses_identity()
  tags$section(class="team-library",style="background:white;border:1px solid #d9e5e8;border-radius:12px;margin:16px;padding:20px;",
    tags$style(HTML(".team-library .shiny-input-container{width:100%!important;margin-bottom:10px}.team-library-grid{display:grid;grid-template-columns:1fr 1.7fr 1fr;gap:18px;align-items:end}.team-library-login{display:flex;gap:16px;align-items:end;flex-wrap:wrap}.team-library-login>.shiny-input-container{flex:1;min-width:180px}.team-library select{min-height:44px}.team-library small{display:block;margin-top:14px;color:#526b77}@media(max-width:750px){.team-library-grid{grid-template-columns:1fr}.team-library{margin:8px!important;padding:16px!important}}")),
    h3("Project library"),p("Save a private checkpoint. Return to your analysis without uploading files again."),
    if (team_workspace_enabled() && identity) tagAppendChild(uiOutput("team_library_account"),team_library_login_placeholder()) else uiOutput("team_library_account"),uiOutput("team_library_projects"),uiOutput("team_library_recovery"),
    tags$p(role="status",tagAppendChild(textOutput("team_library_status"),
      if (identity) "Sign in to access saved projects." else "Opening saved projects on this computer.")))
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
# Production's server. Checkpoints are listed, saved and loaded only through
# this session's store (team_storage_session); project and membership lookups
# and token refresh still talk to the identity service in database mode.
team_library_server <- function(input,output,session,shared_data,on_authenticated=NULL) {
  identity_service<-team_library_uses_identity()
  account<-reactiveVal(NULL); projects<-reactiveVal(list()); members<-reactiveVal(list()); files<-reactiveVal(list()); files_for<-reactiveVal(NULL); status<-reactiveVal(if(identity_service) "Sign in to access saved projects." else "Opening saved projects on this computer.")
  # Credential rotation must not rebuild the project/name inputs while a Canvas
  # checkpoint is awaiting its acknowledgement. Only identity changes affect UI.
  account_identity<-reactiveVal(NULL)
  session$userData$team_library_authenticated <- function() !is.null(account_identity())
  session$userData$team_library_identity <- function() account_identity()$user
  set_account<-function(value){
    account(value)
    account_identity(if(is.null(value)) NULL else value[c("user","email")])
  }
  # One store per session. The database backend asks for this session's
  # current token on every operation; it is never cached outside account().
  session_token<-function(){a<-isolate(account());if(is.null(a)||!is.character(a$token)||length(a$token)!=1L||!nzchar(a$token))stop("Sign in first.");a$token}
  store<-team_storage_session(session,token=if(identity_service) session_token else NULL)
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
    if(!identity_service) return(invisible(NULL))
    if(Sys.time()>a$expires) {
      r<-team_library_call("auth","/token?grant_type=refresh_token",body=list(refresh_token=a$refresh),method="POST")
      a$token<-r$access_token;a$refresh<-r$refresh_token;a$expires<-Sys.time()+r$expires_in-30;set_account(a)
    }
    # Online verification also rejects disabled users before any project operation.
    team_library_call("auth","/user",a$token);a$token
  }
  # Write access is rechecked before every save (database mode); the local
  # library has one project owned by its single user.
  load_members<-function(tok) if(identity_service) members(team_library_call("rest","/pilot_members",tok))
  refresh_projects<-function(){
    if(!identity_service){
      projects(list(list(id=team_library_local_project,name="This computer")))
      members(list(list(project_id=team_library_local_project,user_id=isolate(account())$user,role="owner")))
      return(invisible(NULL))
    }
    tok<-access();projects(team_library_call("rest","/pilot_projects?order=name",tok));members(team_library_call("rest","/pilot_members",tok))}
  selected_project<-function(){id<-isolate(input$team_library_project)
    ids<-vapply(isolate(projects()),function(p)p$id,"")
    if(length(id)!=1 || !id %in% ids) stop("Choose an accessible project.");id}
  assert_project_binding <- function(id, bind=TRUE) {
    bound <- isolate(bound_project())
    if (!is.null(bound) && !identical(bound, id)) stop("This analysis is already bound to another project. Start a fresh session before switching projects.", call.=FALSE)
    if (is.null(bound) && isTRUE(bind)) bound_project(id)
    id
  }
  refresh_files<-function(){id<-selected_project();access();files(store$list(id));files_for(id)}
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
      actionButton("team_library_activation_submit","Set password")))
    else if(!identity_service) tagList(p("Projects are saved on this computer for a single local user; there is no sign-in."),actionButton("team_library_logout","Clear this session"))
    else tagList(p(paste("Signed in as",a$email)),actionButton("team_library_logout","Sign out and clear this session"))})
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
  # Records come from store$list(): list(id, project, name, sha256, size_bytes, created_at).
  checkpoint_choices<-function(ff){
    ff<-Filter(function(x)grepl("\\.zip$",x$name,ignore.case=TRUE),ff)
    setNames(vapply(ff,function(x)x$id,""),vapply(ff,function(x)paste(x$name,substr(x$created_at,1,19)),""))
  }
  # In the Team workspace every autosave adds a checkpoint file to the open project. Re-rendering
  # the whole library form for that rebuilt and re-bound its inputs and made Shiny re-measure every
  # output on the page, so a new list for the same project only replaces the checkpoint options.
  # The form still re-renders whenever the old code did for any other reason: projects, members,
  # or files of another project (`files_for`), which also recomputes write access. A re-render
  # without `selected` and an option update both leave the newest checkpoint selected.
  live_checkpoints<-team_workspace_enabled()
  rendered_for<-NULL # project whose checkpoint list the rendered form shows
  output$team_library_projects<-renderUI({req(account_identity());pp<-projects();ff<-if(live_checkpoints) {files_for();isolate(files())} else files();mm<-members()
    rendered_for<<-NULL
    if(!length(pp))return(p("No projects are shared with this account yet. Ask your project owner for access."))
    rendered_for<<-isolate(files_for())
    active<-isolate(input$team_library_project);if(is.null(active)||!nzchar(active))active<-pp[[1]]$id
    writable<-any(vapply(mm,function(m)identical(m$project_id,active)&&m$role %in% c("owner","editor"),logical(1)))
    pc<-setNames(vapply(pp,function(x)x$id,""),vapply(pp,function(x)x$name,""))
    fc<-checkpoint_choices(ff)
    draft_label<-isolate(input$team_library_label)
    if(!is.character(draft_label)||length(draft_label)!=1L||is.na(draft_label))draft_label<-"Analysis checkpoint"
    tagList(div(class="team-library-grid",
      div(class="team-library-project",selectInput("team_library_project","Project",pc,selected=isolate(input$team_library_project),selectize=FALSE)),
      div(class="team-library-resume",selectInput("team_library_checkpoint","Saved checkpoint",fc,selectize=FALSE),actionButton("team_library_resume","Resume checkpoint")),
      if(writable) div(class="team-library-save",textInput("team_library_label","New checkpoint name",draft_label),actionButton("team_library_save","Save current analysis")) else p("Read-only access: you can resume checkpoints but cannot save new versions here.")),
      tags$small("A checkpoint stores your files and settings. Resuming opens Review and automatically updates the data table and PCA; AI-proposed scientific changes still require confirmation."))})
  if(live_checkpoints) observeEvent(files(),{
    project<-isolate(files_for())
    if(!is.null(project)&&identical(project,rendered_for)&&!is.null(isolate(account_identity())))
      updateSelectInput(session,"team_library_checkpoint",choices=checkpoint_choices(files()))
  },ignoreInit=TRUE)
  output$team_library_status<-renderText(status())
  output$team_library_recovery<-renderUI({
    status() # Recheck the durable queue after a save, recovery or sign-in result.
    if(is.null(account_identity()) || is.null(pending)) return(NULL)
    div(class="team-library-recovery",p("An interrupted checkpoint is waiting. Select its original project, then retry."),
        actionButton("team_library_retry","Retry saved checkpoint"))
  })
  # Per-account throttle: a refused attempt shows "Too many attempts. Try again
  # in N s." and never reaches the identity service; nothing here waits.
  login_attempt <- team_library_login_limiter()
  observeEvent(input$team_library_login,foreground_guard("team_library_login",{
    if(!is.null(isolate(account())))stop("Sign out before switching accounts.")
    email <- trimws(input$team_library_email)
    password <- input$team_library_password
    updateTextInput(session,"team_library_password",value="")
    r<-team_library_sign_in(email,password,login_attempt,call=team_library_call)
    rm(password)
    set_account(list(token=r$access_token,refresh=r$refresh_token,expires=Sys.time()+r$expires_in-30,email=r$user$email,user=r$user$id))
    tryCatch({
      refresh_projects();pending<<-team_library_queue(r$user$id)
      status(if(!is.null(pending)) "An interrupted checkpoint is ready to recover. Select its project and click Retry saved checkpoint." else "Signed in. Choose a project and a saved checkpoint.")
      if (is.function(on_authenticated)) on_authenticated()
    }, error=function(e) {
      a<-isolate(account());revoke(a)
      set_account(NULL);projects(list());members(list());files(list());files_for(NULL)
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
    set_account(NULL);projects(list());members(list());files(list());files_for(NULL);generation<<-generation+1L
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
  # The durable queue holds checkpoints of signed-in database users only; the
  # files backend writes atomically and has no remote commit to interrupt.
  recover_pending <- function(id) {
    if (!identity_service) return(invisible(TRUE))
    if (is.null(pending) && team_workspace_enabled()) pending <<- team_library_queue(isolate(account())$user)
    if (is.null(pending)) return(invisible(TRUE))
    if (!identical(pending$project, id)) stop("An interrupted checkpoint belongs to another project. Select that project before retrying.", call.=FALSE)
    store$save(pending$project, pending$path, pending$label)
    cleanup_pending()
    invisible(TRUE)
  }
  save_checkpoint <- function(label=NULL) {
    tok<-access();if (team_workspace_enabled()) load_members(tok);id<-if (team_workspace_enabled()) writable_project() else selected_project();if(team_workspace_enabled()) assert_project_binding(id);req(length(shared_data$loaded_files())>0)
    if (is.null(label)) label<-trimws(input$team_library_label)
    if (!is.character(label)||length(label)!=1L||!nzchar(label)||nchar(label)>80)stop("Use a checkpoint name between 1 and 80 characters.")
    recover_pending(id)
    user<-if(identity_service) isolate(account())$user else NULL
    tryCatch(team_library_save_checkpoint(store,id,label,export=shared_data$export_session_path,
        attach_records=if(team_workspace_enabled()) function(path) team_project_records_attach(path,session) else NULL,
        user=user,queue=team_library_queue),
      error=function(e){
        # An interrupted commit stays in the durable queue; offer Retry.
        if(!is.null(user)) pending<<-tryCatch(team_library_queue(user),error=function(ignored) pending)
        stop(e)
      })
    pending<<-NULL
    if(team_workspace_enabled() && is.function(session$userData$team_project_records_saved)) session$userData$team_project_records_saved()
    refresh_files();status(if (team_workspace_enabled()) "Checkpoint saved privately: canvas, finished figures, methods, design notes, run history and companion actions. Your applied scientific settings have not changed." else "Checkpoint saved privately. Your applied scientific settings have not changed.")
    TRUE
  }
  observeEvent(input$team_library_save,foreground_guard("team_library_save",{
    if (!team_workspace_enabled()) return(save_checkpoint())
    if (!is.null(autosave_request)) { status("Autosave is in progress. Your named checkpoint will be available when it finishes."); return(invisible(NULL)) }
    tok <- access(); load_members(tok); project <- selected_project(); assert_project_binding(project); req(length(shared_data$loaded_files()) > 0)
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
      tok <- access(); load_members(tok); project <- writable_project(); assert_project_binding(project); req(length(shared_data$loaded_files()) > 0)
      recover_pending(project)
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
    tok<-access(); load_members(tok)
    writable_project(pending$project)
    store$save(pending$project,pending$path,pending$label)
    cleanup_pending();refresh_files();status("Checkpoint recovered and saved. No scientific settings were changed.")
  }))
  observe({
    # Before authentication the deferred backend returns plain FALSE, with no
    # reactive dependency. Subscribe only after scientific startup is available.
    req(account_identity())
    if(isTRUE(shared_data$session_restored())) status(if(team_workspace_enabled()) "Checkpoint restored. Review is open; the data table and PCA update automatically." else "Checkpoint restored. Review Design and Quality, then confirm Prepare data. No new file upload is needed.")
  })
  observeEvent(input$team_library_resume,foreground_guard("team_library_resume",{
    access();project<-selected_project();ff<-isolate(files());id<-isolate(input$team_library_checkpoint)
    chosen<-Filter(function(x)identical(x$id,id),ff)
    if(length(chosen)!=1)stop("Choose a saved checkpoint.")
    if(length(shared_data$loaded_files()))stop("Open a fresh session before resuming another checkpoint, so current work is not replaced.")
    # store$load verifies the sha256 before any byte reaches the importer.
    records<-team_library_resume_checkpoint(store,project,id,read_records=team_workspace_enabled(),import=function(path){
      assert_project_binding(project)
      status("Loading the saved checkpoint…")
      if(team_workspace_enabled()){
        # Cancel even a failed earlier import before beginning another generation.
        if(!is.null(records_restore_observer))records_restore_observer$destroy()
        records_restore_observer<<-NULL;records_restore_sequence<<-records_restore_sequence+1L
      }
      shared_data$import_session_path(path)
    })
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
  # Local library: no identity service, so the single local user is ready now.
  if (!identity_service) {
    set_account(list(user="local",email=""))
    refresh_projects()
    status("Saved projects are kept on this computer. Choose a saved checkpoint or start a new analysis.")
    if (is.function(on_authenticated)) on_authenticated()
  }
  invisible(account)
}
