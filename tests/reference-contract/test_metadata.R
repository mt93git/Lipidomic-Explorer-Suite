source('prototypes/metadata-contract/contract.R')
out <- commandArgs(TRUE); if(!length(out)) out <- tempfile('metadata-evidence-')
dir.create(out,recursive=TRUE,showWarnings=FALSE)
rows <- list()
check <- function(name, expression) {
  stopifnot(isTRUE(expression)); rows[[length(rows)+1L]] <<- data.frame(check=name,status='PASS')
}
fails <- function(expr) inherits(tryCatch({force(expr); NULL},error=identity),'error')
x <- read_sample_metadata_v01('prototypes/metadata-contract/example.csv'); ids <- x$SampleID
check('leading zeros preserved',identical(x$SubjectID,c('001','002','003','004')))
check('valid independent study',validate_sample_metadata_v01(x,ids)$valid)
check('reorder by exact matrix ID',identical(validate_sample_metadata_v01(x[4:1,],ids)$data$SampleID,ids))
for (case in c('duplicate','missing','extra','case','whitespace','blank','numeric','column_duplicate','column_blank','missing_id','bad_type','bad_time','no_unit')) {
  bad <- x
  if(case=='duplicate') bad$SampleID[2] <- ids[1]
  if(case=='missing') bad <- bad[-1,]
  if(case=='extra') {bad <- rbind(bad,bad[1,]);bad$SampleID[5]<-'EXTRA'}
  if(case=='case') bad$SampleID[1] <- tolower(ids[1])
  if(case=='whitespace') bad$SampleID[1] <- paste0(ids[1],' ')
  if(case=='blank') bad$SampleID[1] <- ''
  if(case=='numeric') bad$SubjectID <- 1:4
  if(case=='column_duplicate') names(bad)[2] <- 'SampleID'
  if(case=='column_blank') names(bad)[2] <- ''
  if(case=='missing_id') bad$SampleID <- NULL
  if(case=='bad_type') bad$SampleType[1] <- 'patient'
  if(case=='bad_time') bad$TimeValue[1] <- 'yesterday'
  if(case=='no_unit') bad$TimeUnit <- NULL
  check(paste('reject',case),!validate_sample_metadata_v01(bad,ids)$valid)
}
check('reject duplicate matrix IDs',!validate_sample_metadata_v01(x,c(ids[1],ids[1],ids[3:4]))$valid)
map <- c(Group1='Condition',Group2='Tissue',PatientNumber='SubjectID',Replicate='ReplicateID',TimePoint='TimeValue')
s <- stage_metadata_v01(x,ids,map)
check('no implicit confirmation',fails(confirm_metadata_v01(s)))
check('cancel rejects',fails(confirm_metadata_v01(s,FALSE)))
check('string true not confirmation',fails(confirm_metadata_v01(s,'true')))
h <- confirm_metadata_v01(s,TRUE)
check('confirmed hub preserves donor IDs',identical(h$scientific_metadata$PatientNumber,x$SubjectID))
check('sidecar preserves every field',identical(h$display_metadata,x))
check('parsed terms adapter',identical(confirm_metadata_v01(s,TRUE,'parsed_terms')$scientific_metadata$PatientTerm,x$SubjectID))
check('reject unsupported mapping',fails(stage_metadata_v01(x,ids,c(Seed='Condition'))))
check('reject reused mapping source',fails(stage_metadata_v01(x,ids,c(Group1='Condition',Group2='Condition'))))
b <- x; b$Condition[1] <- '';check('reject blank scientific group',fails(stage_metadata_v01(b,ids,map)))
s$original$SampleID[1]<-'WRONG';check('revalidate before confirmation',fails(confirm_metadata_v01(s,TRUE)))
p <- x; p$SubjectID <- c('001','002','001','002')
check('valid complete paired design',validate_sample_metadata_v01(p,ids,TRUE)$valid)
check('repeated donors warn without selecting model',length(validate_sample_metadata_v01(p,ids)$warnings)>0)
p$SubjectID[4]<-'003';check('incomplete pairs rejected',!validate_sample_metadata_v01(p,ids,TRUE)$valid)
p <- x; p$SubjectID <- rep('001',4);check('technical replicates need decision',!validate_sample_metadata_v01(p,ids,TRUE)$valid)
b <- x; b$Batch <- b$Condition;check('confounding warning',length(validate_sample_metadata_v01(b,ids)$warnings)>0)
b <- x; b$Comment <- c('NA','a,b','"quoted"','lípid'); tmp <- tempfile(fileext='.csv'); write.csv(b,tmp,row.names=FALSE,na='')
check('CSV roundtrip punctuation UTF8 literal NA',identical(read_sample_metadata_v01(tmp),b));unlink(tmp)
b$Comment[1] <- '<script>alert(1)</script>';check('untrusted text retained as inert data',identical(confirm_metadata_v01(stage_metadata_v01(b,ids),TRUE)$display_metadata$Comment,b$Comment))
# Compare to Max's actual legacy mapper, not a reimplementation.
source('tools/reference_contract/helpers.R'); e <- new.env(parent=globalenv())
load_assignments('R/global.R',c('restore_delimiters','apply_nomenclature_mappings'),e)
legacy <- e$apply_nomenclature_mappings(confirm_metadata_v01(stage_metadata_v01(x,ids,map),TRUE,'parsed_terms')$scientific_metadata,NULL)
check('actual legacy mapper equals hub adapter on fixture',identical(as.data.frame(legacy),h$scientific_metadata[,names(legacy)]))
b <- x; b$TimeUnit[1]<-'day';check('reject silently mixed time units',fails(stage_metadata_v01(b,ids,map)))
b <- x;b$Condition[1]<-'SHIELD';check('reject lossy legacy token',fails(confirm_metadata_v01(stage_metadata_v01(b,ids,map),TRUE,'parsed_terms')))
check('hub preserves literal legacy token',confirm_metadata_v01(stage_metadata_v01(b,ids,map),TRUE)$scientific_metadata$Group1[1]=='SHIELD')
write.csv(do.call(rbind,rows),file.path(out,'metadata-checks.csv'),row.names=FALSE)
write.csv(h$scientific_metadata,file.path(out,'synthetic-hub-metadata.csv'),row.names=FALSE)
print(do.call(rbind,rows));cat(length(rows),'metadata checks PASS\n')
