# Supabase backend (LIPIDOMIC_STORAGE=database). Ported from the production
# Team runtime (origin/claude/project-thread-okihs3:R/frontends/team/project_library.R).
# Schema and row-level security: pilot/supabase/schema.sql on that branch
# (tables pilot_projects, pilot_members, pilot_files; private bucket case-files).
# User tokens live in a single Shiny session, never globals: every operation
# asks the session-owned `token` function for the current bearer token.

# Production transport, unchanged. Endpoints come only from the operator's
# LIPIDOMIC_{AUTH,REST,STORAGE}_URL; identifiers are validated before interpolation.
team_library_call <- function(service, path, token=NULL, body=NULL, method="GET", raw=FALSE) {
  base <- Sys.getenv(paste0("LIPIDOMIC_",toupper(service),"_URL"))
  if (!nzchar(base)) stop("Project library is not configured.")
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

# Production idempotent commit, unchanged: recover an uploaded object or a lost
# successful response; only exact, readable bytes can satisfy recovery.
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

# `token`: a function returning the session's current access token (preferred,
# so refreshes are honoured) or a single string. `call`: injectable transport.
team_storage_database <- function(token, call = team_library_call) {
  if (!is.function(token) && !team_storage_scalar(token))
    stop("The database storage backend needs a signed-in session.", call. = FALSE)
  current_token <- function() {
    value <- if (is.function(token)) token() else token
    if (!team_storage_scalar(value) || !nzchar(value)) stop("Sign in first.", call. = FALSE)
    value
  }
  as_record <- function(row, project) {
    ok <- is.list(row) && team_storage_scalar(row$id) && grepl(team_storage_uuid_pattern, row$id) &&
      identical(row$project_id, project) && team_storage_scalar(row$sha256) &&
      grepl(team_storage_sha256_pattern, row$sha256) &&
      identical(row$object_path, paste0(project, "/", row$sha256)) &&
      team_storage_scalar(row$original_name)
    if (!ok) return(NULL)
    team_storage_record(row$id, project, row$original_name, row$sha256,
      if (is.numeric(row$size_bytes)) row$size_bytes else NA_real_,
      if (team_storage_scalar(row$created_at)) row$created_at else NA_character_)
  }
  find_one <- function(project, id, tok) {
    rows <- call("rest", paste0("/pilot_files?project_id=eq.", project, "&id=eq.", id), tok)
    if (length(rows) != 1L) stop("Checkpoint not found.", call. = FALSE)
    record <- as_record(rows[[1L]], project)
    if (is.null(record)) stop("Invalid checkpoint path.", call. = FALSE)
    record
  }
  team_storage_store("database", list(
    list = function(project) {
      rows <- call("rest", paste0("/pilot_files?project_id=eq.", project, "&order=created_at.desc"), current_token())
      Filter(Negate(is.null), lapply(rows, as_record, project = project))
    },
    save = function(project, path, label) {
      tok <- current_token()
      hash <- team_library_commit(path, project, label, tok, call = call)
      rows <- call("rest", paste0("/pilot_files?project_id=eq.", project, "&sha256=eq.", hash), tok)
      record <- if (length(rows) == 1L) as_record(rows[[1L]], project) else NULL
      if (is.null(record)) stop("Checkpoint registration could not be verified. Retry this saved checkpoint.", call. = FALSE)
      record
    },
    load = function(project, id, dest) {
      tok <- current_token()
      record <- find_one(project, id, tok)
      bytes <- call("storage", paste0("/object/authenticated/case-files/", project, "/", record$sha256), tok, raw = TRUE)
      if (!is.raw(bytes) || !identical(team_storage_sha256_raw(bytes), record$sha256))
        stop("Checkpoint integrity check failed.", call. = FALSE)
      team_storage_write_atomic(dest, bytes = bytes)
      dest
    },
    delete = function(project, id) {
      # Production schema grants no DELETE on pilot_files or case-files objects;
      # until an operator adds owner/editor delete policies this is denied.
      tok <- current_token()
      record <- find_one(project, id, tok)
      # Remove the catalog row first: a leftover object is invisible and a later
      # save of the same bytes reuses it through the idempotent commit.
      call("rest", paste0("/pilot_files?project_id=eq.", project, "&id=eq.", id), tok, method = "DELETE")
      if (length(call("rest", paste0("/pilot_files?project_id=eq.", project, "&id=eq.", id), tok)))
        stop("Checkpoint could not be deleted. Check your project access.", call. = FALSE)
      tryCatch(call("storage", paste0("/object/case-files/", project, "/", record$sha256), tok, method = "DELETE"),
        error = function(e) warning("Checkpoint removed from the project; its stored object was kept.", call. = FALSE))
      invisible(TRUE)
    }
  ))
}
