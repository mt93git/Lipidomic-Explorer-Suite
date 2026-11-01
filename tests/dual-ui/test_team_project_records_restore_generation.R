library(shiny)
scope<-new.env(parent=globalenv());sys.source('R/frontends/team/project_library.R',scope)
scope$team_workspace_enabled<-function()TRUE
scope$team_library_queue<-function(...)NULL
scope$team_project_records_read<-function(path)list(source=rawToChar(readBin(path,'raw',file.info(path)$size)))
project<-'11111111-1111-4111-8111-111111111111';ids<-c(A='22222222-2222-4222-8222-222222222222',B='33333333-3333-4333-8333-333333333333')
hashes<-vapply(c('A','B'),function(x)digest::digest(charToRaw(x),algo='sha256',serialize=FALSE),character(1))
scope$team_library_call<-function(service,path,token=NULL,body=NULL,method='GET',raw=FALSE){
 if(service=='auth'&&grepl('grant_type=password',path))return(list(access_token='synthetic',refresh_token='synthetic',expires_in=3600,user=list(id='44444444-4444-4444-8444-444444444444',email='qa@example.test')))
 if(service=='auth')return(NULL)
 if(service=='rest'&&path=='/pilot_projects?order=name')return(list(list(id=project,name='QA fixture')))
 if(service=='rest'&&path=='/pilot_members')return(list(list(project_id=project,role='owner')))
 if(service=='rest'&&grepl('^/pilot_files',path))return(lapply(seq_along(ids),function(i)list(id=ids[[i]],original_name=paste0(names(ids)[i],'.zip'),created_at='2026-10-31',object_path=paste0(project,'/',hashes[[i]]),sha256=hashes[[i]])))
 if(service=='storage')return(charToRaw(names(ids)[match(sub('.*/','',path),hashes)]))
 stop('unexpected synthetic call')
}
testServer(function(input,output,session){
 restoring<-reactiveVal(FALSE);restored<-reactiveVal(FALSE);generation<-reactiveVal(0L);imports<-reactiveVal(list())
 session$userData$team_project_records_import<-function(record)imports(c(isolate(imports()),list(record$source)))
 hub<-list(loaded_files=function()character(),is_restoring=restoring,session_restored=restored,restore_generation=generation,
  import_session_path=function(path){generation(isolate(generation())+1L);restoring(TRUE);restored(FALSE)})
 scope$team_library_server(input,output,session,hub)
},{
 session$setInputs(team_library_email='qa@example.test',team_library_password='synthetic',team_library_login=1L);session$flushReact()
 session$setInputs(team_library_project=project,team_library_checkpoint=ids[['A']]);session$flushReact()
 session$setInputs(team_library_resume=1L);session$flushReact();stopifnot(isolate(generation())==1L)
 # A fails asynchronously, without loading files or claiming success.
 restoring(FALSE);restored(FALSE);session$flushReact();stopifnot(length(isolate(imports()))==0L)
 session$setInputs(team_library_checkpoint=ids[['B']],team_library_resume=2L);session$flushReact();stopifnot(isolate(generation())==2L)
 restoring(FALSE);restored(TRUE);session$flushReact()
 stopifnot(identical(isolate(imports()),list('B')))
 # Another generation cannot accidentally satisfy an old observer.
 restored(FALSE);session$setInputs(team_library_checkpoint=ids[['A']],team_library_resume=3L);session$flushReact()
 generation(isolate(generation())+1L);restoring(FALSE);restored(TRUE);session$flushReact()
 stopifnot(identical(isolate(imports()),list('B')))
})
cat('PASS failed async restore A then successful B hydrates only B records; superseded generation cannot hydrate an orphan observer. No auth or DB requests executed.\n')
