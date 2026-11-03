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
    if(path=='/logout') {stopifnot(method=='POST',identical(token,'temporary-secret'));if(mode=='logoutfail')stop('SECRET logout error')}
    invisible(NULL)
  }
  error <- tryCatch({do.call(team_library_activate,c(values,list(call=stub)));NULL},error=function(e)conditionMessage(e))
  if(!is.null(error)) stopifnot(!grepl('SECRET|temporary-secret',error))
  list(calls=calls,error=error)
}
x <- run(); stopifnot(is.null(x$error),identical(vapply(x$calls,`[[`,'','path'),c('/verify','/user','/logout')))
x <- run('mismatch');stopifnot(!is.null(x$error),identical(vapply(x$calls,`[[`,'','path'),c('/verify','/logout')))
x <- run('expired');stopifnot(!is.null(x$error),length(x$calls)==1L)
x <- run('putfail');stopifnot(!is.null(x$error),tail(x$calls,1)[[1]]$path=='/logout')
x <- run('logoutfail');stopifnot(is.null(x$error),tail(x$calls,1)[[1]]$path=='/logout')
for(field in names(args)) {
  invalid <- args
  invalid[[field]] <- switch(field,email='bad',code='short',type='signup',password='short',confirm='different')
  x <- run(values=invalid);stopifnot(!is.null(x$error),length(x$calls)==0L)
}
args$type <- 'recovery';stopifnot(is.null(run()$error))
cat('Team library activation tests passed.\n')

# Testing policy: rapid retries do not create an application-level lockout.
limit <- team_library_login_limiter(function() 0)
for(i in seq_len(1000)) stopifnot(isTRUE(limit()))
server_source <- paste(deparse(body(team_library_server)),collapse="\n")
stopifnot(!grepl("activation_attempts|Please wait before signing in|Please wait before trying again",server_source))
stopifnot(grepl('/token?grant_type=password',server_source,fixed=TRUE))
cat('PASS: immediate repeated sign-in/setup retries; password authentication remains required.\n')
