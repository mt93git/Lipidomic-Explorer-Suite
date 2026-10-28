# Exercise the exact Team commit adapter with real HTTP and injected transport faults.
source('R/frontends/team/project_library.R')
Sys.setenv(LIPIDOMIC_AUTH_URL='http://127.0.0.1:55433',LIPIDOMIC_REST_URL='http://127.0.0.1:55431',LIPIDOMIC_STORAGE_URL='http://127.0.0.1:55432')
a<-jsonlite::read_json('/home/gjb47/lipidomic-supabase-pilot/test-accounts.json')$owner
login<-team_library_call('auth','/token?grant_type=password',body=list(email=a$email,password=a$password),method='POST')
tok<-login$access_token;project<-'10000000-0000-4000-8000-000000000001'
results<-list();real<-team_library_call
for(stage in c('before_upload','after_upload','before_catalog','after_catalog')) {
  # Valid ZIP based on existing case, but distinguish fault trials using a sidecar.
  dir<-tempfile();dir.create(dir)
  zip::unzip('/home/gjb47/lipidomic-supabase-pilot/inputs/Sickle_cell_352_verified.zip',exdir=dir)
  writeLines(paste(stage,Sys.time()),file.path(dir,'persistence-test.txt'))
  path<-tempfile(fileext='.zip');zip::zipr(path,list.files(dir,all.files=FALSE),root=dir)
  fired<-FALSE
  fault<-function(service,path,token=NULL,body=NULL,method='GET',raw=FALSE){
    target<-(service=='storage' && method=='POST' && grepl('upload',stage)) || (service=='rest' && method=='POST' && grepl('catalog',stage))
    if(target && !fired){fired<<-TRUE;if(startsWith(stage,'after'))real(service,path,token,body,method,raw);stop('Injected lost connection')}
    real(service,path,token,body,method,raw)
  }
  first<-tryCatch({team_library_commit(path,project,paste('Fault recovery',stage),tok,call=fault);TRUE},error=function(e)FALSE)
  # Before write should fail cleanly; after write must reconcile the lost response.
  stopifnot(identical(first,startsWith(stage,'after')),fired)
  team_library_commit(path,project,paste('Fault recovery',stage),tok)
  team_library_commit(path,project,paste('Fault recovery',stage),tok)
  hash<-digest::digest(file=path,algo='sha256')
  rows<-real('rest',paste0('/pilot_files?project_id=eq.',project,'&sha256=eq.',hash),tok)
  stopifnot(length(rows)==1)
  bytes<-real('storage',paste0('/object/authenticated/case-files/',project,'/',hash),tok,raw=TRUE)
  stopifnot(identical(digest::digest(bytes,algo='sha256',serialize=FALSE),hash))
  results[[stage]]<-list(first_response_reconciled=first,retry_passed=TRUE,repeated_retry_single_record=TRUE,bytes_verified=TRUE)
  unlink(dir,recursive=TRUE);unlink(path)
}
jsonlite::write_json(results,'/home/gjb47/lipidomic-supabase-pilot/interruption-evidence.json',pretty=TRUE,auto_unbox=TRUE)
cat('PASS: four real HTTP interruption scenarios, retries, deduplication and integrity\n')
