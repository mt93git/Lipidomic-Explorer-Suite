# Team-only persistence. User tokens live in a single Shiny session, never globals.
# Ported from origin/claude/project-thread-okihs3:R/frontends/team/project_library.R.
# The Supabase transport and idempotent commit (team_library_call,
# team_library_commit) now live behind the storage API in
# R/frontends/team/storage/; checkpoint save/resume/retry go through a store
# from team_storage_session(), so the same flow works with either backend.
#
# TODO(block C3 / integration): production's team_library_server(),
# team_library_ui() and team_library_login_placeholder() are NOT ported here.
# They depend on files outside this block: shared_data$export_session_path /
# import_session_path (production changes to the shared hub), workspace.R
# (team_workspace_enabled), foreground.R, the Canvas save acknowledgement and the
# sign-in gate in R/server.R. When they land, rebuild the server's save, resume,
# retry and recover_pending handlers on team_library_save_checkpoint(),
# team_library_resume_checkpoint() and team_library_recover_pending() below,
# with store <- team_storage_session(session, token = access).

team_library_enabled <- function() identical(Sys.getenv("LIPIDOMIC_PROJECT_LIBRARY"), "1")

# Sign-in throttle, ON by default. Per account (normalized email): the first 5
# failed attempts get no delay; after that the next attempt waits 1 s, 2 s, 4 s ...
# (capped at 60 s) counted from the last failure. There is no lockout, and a
# successful sign-in resets the account.
# LIPIDOMIC_LOGIN_THROTTLE=off restores immediate retries: the Team pilot, where
# Gerardo requested immediate sign-in retries, keeps that behaviour by setting
# the variable to off at its next deploy. Authentication and project permissions
# remain enforced by the identity service either way.
#
# Call shape kept from production: `attempt <- team_library_login_limiter()`.
#   attempt(email)                     before a sign-in: waits if required
#   attempt(email, outcome="failure")  after a failed sign-in
#   attempt(email, outcome="success")  after a successful sign-in (reset)
# attempt() with no email is a no-op, as in production. Failure counts are
# shared by every session of this R process (a reload must not reset them) and
# are forgotten after 24 h without failures. Only email hashes are kept.
# Production does not route activation attempts through this limiter.
team_library_login_state <- new.env(parent=emptyenv())
team_library_login_throttle_enabled <- function(value=Sys.getenv("LIPIDOMIC_LOGIN_THROTTLE", unset="")) {
  !tolower(trimws(value)) %in% c("off","0","false","no")
}
team_library_login_delay <- function(failures, free=5L, cap=60) {
  if (failures < free) 0 else min(cap, 2^(failures - free))
}
team_library_login_limiter <- function(now=function() as.numeric(Sys.time()), sleep=Sys.sleep,
                                       state=team_library_login_state) {
  forget_after <- 24 * 3600
  function(email=NULL, outcome=c("attempt","failure","success")) {
    outcome <- match.arg(outcome)
    if (!team_library_login_throttle_enabled()) return(invisible(TRUE))
    if (!is.character(email) || length(email) != 1L || is.na(email)) return(invisible(TRUE))
    key <- digest::digest(tolower(trimws(email)), algo="sha256", serialize=FALSE)
    t <- now()
    for (k in ls(state)) if (t - state[[k]]$last > forget_after) rm(list=k, envir=state)
    entry <- if (exists(key, envir=state, inherits=FALSE)) state[[key]] else list(failures=0L, last=t)
    if (identical(outcome, "success")) {
      if (exists(key, envir=state, inherits=FALSE)) rm(list=key, envir=state)
    } else if (identical(outcome, "failure")) {
      assign(key, list(failures=entry$failures + 1L, last=t), envir=state)
    } else {
      # The delay counts from the last failure; time already waited is credited.
      delay <- team_library_login_delay(entry$failures) - (t - entry$last)
      if (delay > 0) sleep(delay)
    }
    invisible(TRUE)
  }
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
