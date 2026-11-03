# Team-only archival records. No approval tokens, pending AI proposals or code.
# Ported from origin/claude/project-thread-okihs3:R/frontends/team/project_records.R:
# only the checkpoint sidecar format (validate / json / attach / read), which is
# a storage concern. The records are appended inside the session ZIP before it
# is hashed and saved, so one checkpoint object carries both.
#
# TODO(block C3 / integration): team_project_records_server(),
# team_project_guided_server(), team_project_companion_server() and
# team_project_share_ui() are workflow/UX code (they clone guided_workflow_server
# and companion_assistant_server and need the production project_records browser script) and
# are not ported here. They provide session$userData$team_project_records_export
# and team_project_records_import, which attach/read below consume.
team_project_records_member <- 'team-project-records-v1.json'
team_project_records_validate <- function(record) {
  fail<-function()stop('Invalid project methods/decisions record.',call.=FALSE)
  if(!is.list(record)||!identical(record$version,'1')||!identical(record$kind,'archived-project-records'))fail()
  required<-c('version','kind','created_at','design','question','run_history','companion_actions','methods','applied_preparation','quality_decisions')
  if(!setequal(names(record),required)||anyDuplicated(names(record)))fail()
  if(!is.character(record$created_at)||length(record$created_at)!=1L)fail()
  if(!is.list(record$design)||!setequal(names(record$design),c('unit','relationship','notes')))fail()
  scalar<-function(x)is.character(x)&&length(x)==1L&&!is.na(x)
  if(!all(vapply(record$design,scalar,logical(1)))||!scalar(record$question))fail()
  if(!is.list(record$run_history)||length(record$run_history)>10000L||!is.list(record$companion_actions)||length(record$companion_actions)>10000L)fail()
  for(row in record$run_history){
    if(!is.list(row)||!all(c('run','time','experiment','retained','sample_count','threshold','scope','imputation','normalization','seed')%in%names(row)))fail()
    if(!all(vapply(row[c('time','experiment','scope','imputation','normalization')],scalar,logical(1))))fail()
    if(!all(vapply(row[c('run','retained','sample_count','threshold')],function(x)is.numeric(x)&&length(x)==1L&&is.finite(x),logical(1))))fail()
  }
  fields<-c('Time','Action','Parameter','Previous','Proposed','Status')
  for(row in record$companion_actions)if(!is.list(row)||!setequal(names(row),fields)||!all(vapply(row,scalar,logical(1))))fail()
  if(!is.list(record$methods)||!setequal(names(record$methods),c('status','lines'))||!scalar(record$methods$status)||!record$methods$status%in%c('applied','not_prepared')||!is.list(record$methods$lines)||!all(vapply(record$methods$lines,scalar,logical(1))))fail()
  # JSON-only bounded recursive data; never deserialize executable R objects.
  nodes<-0L
  walk<-function(x,depth=0L){nodes<<-nodes+length(x);if(depth>30L||nodes>100000L)fail();if(is.list(x)){for(v in x)walk(v,depth+1L)}else if(!(is.null(x)||is.character(x)||is.logical(x)||is.numeric(x)))fail()}
  walk(record)
  bytes<-jsonlite::toJSON(record,auto_unbox=TRUE,null='null',na='null',digits=NA)
  if(nchar(bytes,type='bytes')>4*1024^2)stop('Project records exceed 4 MiB.',call.=FALSE)
  record
}
team_project_records_json <- function(record) jsonlite::toJSON(team_project_records_validate(record),auto_unbox=TRUE,null='null',na='null',digits=NA)
# `export` defaults to the session exporter registered by the records server.
team_project_records_attach <- function(path,session,export=session$userData$team_project_records_export) {
  if(!is.function(export))stop('Project methods/decisions are not ready to save. Retry shortly.',call.=FALSE)
  record<-team_project_records_validate(shiny::isolate(export()))
  stage<-tempfile('team-records-');dir.create(stage);on.exit(unlink(stage,recursive=TRUE))
  writeLines(team_project_records_json(record),file.path(stage,team_project_records_member),useBytes=TRUE)
  # Append before hashing, durable queuing and storage commit: one atomic object.
  zip::zip_append(path,files=team_project_records_member,root=stage)
  verified<-team_project_records_read(path)
  if(!identical(team_project_records_json(verified),team_project_records_json(record)))stop('Project records verification failed.',call.=FALSE)
  invisible(record)
}
team_project_records_read <- function(path) {
  entries<-zip::zip_list(path);match<-which(entries$filename==team_project_records_member)
  if(!length(match))return(NULL) # Older checkpoints remain readable.
  if(length(match)!=1L||entries$uncompressed_size[match]>4*1024^2)stop('Invalid or oversized project records.',call.=FALSE)
  con<-unz(path,team_project_records_member,open='rb');on.exit(close(con))
  bytes<-readBin(con,'raw',n=4*1024^2+1L)
  if(length(bytes)>4*1024^2)stop('Project records exceed 4 MiB.',call.=FALSE)
  team_project_records_validate(jsonlite::fromJSON(rawToChar(bytes),simplifyVector=FALSE))
}
