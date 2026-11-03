source('R/global.R')
source('R/sample_metadata_import.R')
source('R/frontends/team/server.R')
checks <- character()
check <- function(label, condition) { if (!isTRUE(condition)) stop(paste('FAIL:',label)); checks <<- c(checks,label) }
fixture <- data.frame(Lipid_Name=paste0('PC(',seq(100,199),':1)'),
  S1=seq(101,200),S2=seq(201,300),S3=seq(301,400),S4=seq(401,500),check.names=FALSE)
fixture$S1[c(2,8,19,33,55,89)] <- NA
fixture$S2[c(3,11,28,42,72,91)] <- NA
path <- tempfile(fileext='.csv'); write.csv(fixture,path,row.names=FALSE)
ids <- names(fixture)[-1]
md <- data.frame(SampleID=ids,Condition=c('A','A','B','B'),Tissue='bone',stringsAsFactors=FALSE)
base <- list(useImputation=FALSE,normalizationMethod='none',imputeZerosPerFile=FALSE,
 imputeRemainingNAtoZero=TRUE,minDetectionPct=0,dropNonDetected=FALSE,detectionScope='global',
 outlierTreatments=list(),outlier_trigger=0,imputationSeed=42L)

shiny::testServer(shared_data_server, args=list(preparation_policy='team', design_check=function() TRUE), {
 session$setInputs(files=data.frame(name='synthetic.csv',size=file.info(path)$size,type='text/csv',datapath=path),selectedColumns=ids,colorEditMode='Group1')
 session$flushReact()
 session$returned$set_external_sample_metadata(stage_metadata_v01(md,ids,c(Group1='Condition',Group2='Tissue')),TRUE)
 session$flushReact()
 html <- output$classColorUI$html
 stopifnot(grepl('palette-color-grid',html,fixed=TRUE),grepl('data-palette-label="A"',html,fixed=TRUE),grepl('data-palette-label="B"',html,fixed=TRUE),!grepl('globalSpeciesCol_',html,fixed=TRUE))
 cat('PASS: Team group palette retains its renderer and exact group labels\n')
})
