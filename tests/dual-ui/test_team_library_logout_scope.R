# Ending a Team session revokes only that session (GoTrue scope=local). A global
# logout would sign out every other session of the same account, e.g. a second
# tab or a concurrent run, and their later saves would be denied.
library(shiny)
Sys.setenv(LIPIDOMIC_PROJECT_LIBRARY='1',LIPIDOMIC_STORAGE='database',LIPIDOMIC_LOGIN_THROTTLE='off')
scope<-new.env(parent=globalenv())
for(f in c('storage/storage.R','storage/storage_files.R','storage/storage_database.R','project_library.R'))sys.source(file.path('R/frontends/team',f),scope)
scope$team_workspace_enabled<-function()TRUE
scope$team_library_queue<-function(...)NULL
calls<-new.env();calls$log<-list()
project<-'11111111-1111-4111-8111-111111111111'
scope$team_library_call<-function(service,path,token=NULL,body=NULL,method='GET',raw=FALSE){
 calls$log[[length(calls$log)+1L]]<-list(service=service,path=path,token=token)
 if(service=='auth'&&grepl('grant_type=password',path))return(list(access_token='synthetic',refresh_token='synthetic',expires_in=3600,user=list(id='44444444-4444-4444-8444-444444444444',email='qa@example.test')))
 if(service=='auth')return(NULL)
 if(service=='rest'&&path=='/pilot_projects?order=name')return(list(list(id=project,name='QA fixture')))
 if(service=='rest'&&path=='/pilot_members')return(list(list(project_id=project,role='owner')))
 if(service=='rest'&&grepl('^/pilot_files',path))return(list())
 stop('unexpected synthetic call')
}
hub<-list(loaded_files=function()character(),is_restoring=function()FALSE,session_restored=function()FALSE,restore_generation=function()0L,import_session_path=function(path)NULL)
testServer(function(input,output,session)scope$team_library_server(input,output,session,hub),{
 session$setInputs(team_library_email='qa@example.test',team_library_password='synthetic',team_library_login=1L);session$flushReact()
})
logouts<-Filter(function(x)x$service=='auth'&&startsWith(x$path,'/logout'),calls$log)
stopifnot(length(logouts)==1L,identical(logouts[[1]]$path,'/logout?scope=local'),identical(logouts[[1]]$token,'synthetic'))
cat('PASS session end revokes only its own session (logout scope=local).\n')

# Activation / password recovery: the temporary session from /verify is revoked in `finally`, on success
# and on failure (e.g. an identity mismatch), and only that session (scope=local).
activation<-function(verified_email){
 log<-list()
 stub<-function(service,path,token=NULL,body=NULL,method='GET',raw=FALSE){
  log[[length(log)+1L]]<<-list(service=service,path=path,token=token)
  if(service=='auth'&&path=='/verify')return(list(access_token='temporary',user=list(email=verified_email)))
  NULL
 }
 res<-tryCatch(scope$team_library_activate('qa@example.test',strrep('a',40),'recovery','synthetic-pass-123','synthetic-pass-123',call=stub),error=function(e)e)
 list(res=res,logouts=Filter(function(x)x$service=='auth'&&startsWith(x$path,'/logout'),log),put=any(vapply(log,function(x)identical(x$path,'/user'),logical(1))))
}
ok<-activation('qa@example.test')
stopifnot(isTRUE(ok$res),ok$put,length(ok$logouts)==1L,identical(ok$logouts[[1]]$path,'/logout?scope=local'),identical(ok$logouts[[1]]$token,'temporary'))
bad<-activation('someone-else@example.test')
stopifnot(inherits(bad$res,'error'),!bad$put,length(bad$logouts)==1L,identical(bad$logouts[[1]]$path,'/logout?scope=local'),identical(bad$logouts[[1]]$token,'temporary'))
cat('PASS activation and recovery revoke only their temporary session (logout scope=local), on success and on mismatch.\n')
