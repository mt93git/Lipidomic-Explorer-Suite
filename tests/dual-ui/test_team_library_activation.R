# Ported from production tests/dual-ui/test_team_library_activation.R.
source('R/frontends/team/project_library.R')
args <- list(email=' Person@Example.org ',code=paste(rep('a',64),collapse=''),type='invite',password='long password 123',confirm='long password 123')
run <- function(mode='ok', values=args) {
  calls <- list()
  stub <- function(service,path,token=NULL,body=NULL,method='GET',...) {
    calls[[length(calls)+1L]] <<- list(service=service,path=path,token=token,body=body,method=method)
    if(path=='/verify') {
      stopifnot(identical(names(body),c('token_hash','type')),is.null(body$email),method=='POST')
      if(mode=='expired') stop('SECRET expired API payload')
      return(list(access_token='temporary-secret',user=list(email=if(mode=='mismatch') 'other@example.org' else 'person@example.org')))
    }
    if(path=='/user') {
      stopifnot(method=='PUT',identical(token,'temporary-secret'),identical(names(body),'password'))
      if(mode=='putfail') stop('SECRET update error')
    }
    if(path=='/logout?scope=local') {stopifnot(method=='POST',identical(token,'temporary-secret'));if(mode=='logoutfail')stop('SECRET logout error')}
    invisible(NULL)
  }
  error <- tryCatch({do.call(team_library_activate,c(values,list(call=stub)));NULL},error=function(e)conditionMessage(e))
  if(!is.null(error)) stopifnot(!grepl('SECRET|temporary-secret',error))
  list(calls=calls,error=error)
}
x <- run(); stopifnot(is.null(x$error),identical(vapply(x$calls,`[[`,'','path'),c('/verify','/user','/logout?scope=local')))
x <- run('mismatch');stopifnot(!is.null(x$error),identical(vapply(x$calls,`[[`,'','path'),c('/verify','/logout?scope=local')))
x <- run('expired');stopifnot(!is.null(x$error),length(x$calls)==1L)
x <- run('putfail');stopifnot(!is.null(x$error),tail(x$calls,1)[[1]]$path=='/logout?scope=local')
x <- run('logoutfail');stopifnot(is.null(x$error),tail(x$calls,1)[[1]]$path=='/logout?scope=local')
for(field in names(args)) {
  invalid <- args
  invalid[[field]] <- switch(field,email='bad',code='short',type='signup',password='short',confirm='different')
  x <- run(values=invalid);stopifnot(!is.null(x$error),length(x$calls)==0L)
}
args$type <- 'recovery';stopifnot(is.null(run()$error))
cat('Team library activation tests passed.\n')

# Production's "immediate retries" policy is replaced by the non-blocking
# throttle (test_team_storage_login_throttle.R). The server signs in only
# through the guarded flow and never routes activation through the limiter.
server_source <- paste(deparse(body(team_library_server)),collapse="\n")
stopifnot(!grepl("activation_attempts|Please wait before signing in|Please wait before trying again|Sys.sleep",server_source))
stopifnot(grepl('team_library_sign_in(email, password, login_attempt',server_source,fixed=TRUE))
stopifnot(grepl('/token?grant_type=password',paste(deparse(team_library_sign_in),collapse="\n"),fixed=TRUE))
cat('PASS: sign-in goes through the guarded, non-blocking flow; password authentication remains required.\n')
