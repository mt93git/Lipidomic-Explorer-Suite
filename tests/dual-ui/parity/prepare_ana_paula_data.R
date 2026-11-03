# Derive local-only app import files from the two original workbooks.
# No ambiguous or unmatched metadata is silently imputed.
library(readxl)
source_dir <- Sys.getenv('SOURCE_DIR'); out <- Sys.getenv('PRIVATE_OUT')
if(!nzchar(source_dir)||!nzchar(out)) stop('Set SOURCE_DIR and PRIVATE_OUT')
paths <- list.files(source_dir,pattern='\\.xlsx$',full.names=TRUE)
ab <- paths[grepl('^2026_6-2-',basename(paths))]
clin <- paths[grepl('^SCD Serum Sharing_',basename(paths))]
stopifnot(length(ab)==1L,length(clin)==1L)
mat <- as.data.frame(read_excel(ab,na=c("", "N/A")),check.names=FALSE); names(mat)[1] <- 'Lipid_Name'
control <- as.data.frame(read_excel(clin,sheet='SCD CTL YA'),check.names=FALSE)
case <- as.data.frame(read_excel(clin,sheet='SCD YA'),check.names=FALSE)
stopifnot(ncol(mat)==68L,!anyDuplicated(names(mat)),!anyDuplicated(mat$Lipid_Name))
ids <- names(mat)[-1]; rows <- vector('list',length(ids))
for(i in seq_along(ids)) {
 p <- strsplit(ids[i],'_',fixed=TRUE)[[1]]
 stopifnot(length(p)==3L,p[2] %in% c('Control','Exp'),grepl('^(CCSteadyState|SteadyState|PainCrisis)[12]$',p[1]),grepl('^[0-9]+$',p[3]))
 subject <- paste0(if(p[2]=='Control') 'SCDCT' else 'SCD',p[3])
 visit <- paste0(if(grepl('Steady',p[1])) 'Steady State #' else 'Pain Crisis #',substr(p[1],nchar(p[1]),nchar(p[1])))
 d <- if(p[2]=='Control') control else case
 visit_col <- names(d)[tolower(names(d))=='visit type']
 hits <- which(!is.na(d[['Subject ID']]) & d[['Subject ID']]==subject & !is.na(d[[visit_col]]) & tolower(d[[visit_col]])==tolower(visit))
 status <- if(length(hits)==1L) 'matched' else if(length(hits)==0L) 'unmatched' else 'ambiguous'
 row <- data.frame(SampleID=ids[i],SubjectID=subject,SampleLabel=p[1],ExpectedVisit=visit,ClinicalVisit=NA_character_,
   Cohort=if(p[2]=='Control') 'Control' else if(grepl('Steady',p[1])) 'SCD steady' else 'SCD crisis',
   Condition=if(p[2]=='Control') 'Healthy' else if(grepl('Steady',p[1])) 'SC-SteadyState' else 'SC-PainCrisis',
   EnrollmentDate=NA_character_,BiosampleID=NA_character_,Serum=NA_character_,MatchStatus=status,stringsAsFactors=FALSE)
 if(length(hits)==1L) {
  x <- d[hits,,drop=FALSE]; row$ClinicalVisit <- as.character(x[[visit_col]])
  row$EnrollmentDate <- as.character(x[['Date of Enrollment']]);row$Serum <- as.character(x[['Serum']])
  if('Unique Biosample ID' %in% names(x)) row$BiosampleID <- as.character(x[['Unique Biosample ID']])
 }
 rows[[i]] <- row
}
meta <- do.call(rbind,rows)
if(!dir.exists(out)) dir.create(out,recursive=TRUE,mode='0700')
Sys.chmod(out,'0700')
write.csv(meta,file.path(out,'metadata_all.csv'),row.names=FALSE,na='')
write.csv(mat,file.path(out,'abundance_all.csv'),row.names=FALSE,na='')
matched <- meta$MatchStatus=='matched'
write.csv(meta[matched,],file.path(out,'metadata_matched.csv'),row.names=FALSE,na='')
write.csv(mat[,c('Lipid_Name',meta$SampleID[matched])],file.path(out,'abundance_matched.csv'),row.names=FALSE,na='')
primary <- matched & meta$SampleLabel %in% c('CCSteadyState1','SteadyState1')
write.csv(meta[primary,],file.path(out,'metadata_primary.csv'),row.names=FALSE,na='')
write.csv(mat[,c('Lipid_Name',meta$SampleID[primary])],file.path(out,'abundance_primary.csv'),row.names=FALSE,na='')
Sys.chmod(list.files(out,full.names=TRUE),'0600')
cat(sprintf('Samples %d; matched %d; unmatched %d; ambiguous %d; independent first-visit candidate %d\n',length(ids),sum(matched),sum(meta$MatchStatus=='unmatched'),sum(meta$MatchStatus=='ambiguous'),sum(primary)))
cat('Matched clinical data retained in private output; patient/visit keys derived from sample labels and matched by exact subject and visit. No clinical values inferred.\n')
