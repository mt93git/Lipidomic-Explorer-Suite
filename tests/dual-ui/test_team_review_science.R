# Synthetic data: the review preview, pending request and committed result agree.
library(shiny)
source('R/utils_preparation.R')
d <- data.frame(Lipid_Name=c('a','b','c','d'), A=c(1,1,0,0), B=c(2,0,3,0), C=c(3,0,4,0))
info <- list(data=d,file_cols=list(c('A','B','C')))
settings <- list(minDetectionPct=0,dropNonDetected=TRUE,detectionScope='global',
  useImputation=FALSE,normalizationMethod='none',imputeZerosPerFile=FALSE,
  imputeRemainingNAtoZero=FALSE,imputationSeed=7L,outlierTreatments=list())
request <- function(s) preparation_request(info,c('A','B','C'),settings=s,policy='team')
p0 <- preparation_request_preview(request(settings))
stopifnot(p0$input==4L,p0$retained==3L,p0$excluded==1L)
s50 <- settings; s50$minDetectionPct <- 50
p50 <- preparation_request_preview(request(s50))
stopifnot(p50$retained==2L,p50$excluded==2L)
sremove <- s50; sremove$outlierTreatments <- list(B='remove')
pr <- preparation_request_preview(request(sremove))
stopifnot(identical(pr$samples,c('A','C')),pr$retained==3L,pr$excluded==1L)
sundo <- sremove; sundo$outlierTreatments <- list(B='keep')
pu <- preparation_request_preview(request(sundo))
stopifnot(identical(pu$samples,c('A','B','C')),identical(pu$keep,p50$keep))
server <- function(input,output,session) {
  current <- reactiveVal(request(settings)); run <- reactiveVal(0L); qc <- reactiveVal(0L)
  ctl <- shared_preparation_controller(current,function(req) {
    p <- preparation_request_preview(req)
    req$data_info$data[p$keep,c('Lipid_Name',p$samples),drop=FALSE]
  },run,qc,function() TRUE,policy='team')
}
testServer(server, {
  session$flushReact(); run(1L); session$flushReact()
  stopifnot(ctl$state()$status=='ready',ctl$state()$revision==1L)
  current(request(s50)); session$flushReact()
  stopifnot(ctl$state()$status=='pending',ctl$state()$dirty,ctl$state()$revision==1L)
  qc(1L); session$flushReact()
  stopifnot(ctl$state()$status=='pending',ctl$state()$revision==1L)
  run(2L); session$flushReact()
  stopifnot(ctl$state()$status=='ready',ctl$state()$revision==2L,
    identical(ctl$state()$applied$spec$settings$normalizationMethod,'none'),
    identical(ctl$state()$applied$spec$settings$useImputation,FALSE))
  current(request(sremove)); session$flushReact()
  stopifnot(ctl$state()$status=='pending',ctl$state()$revision==2L)
  run(3L); session$flushReact()
  stopifnot(ctl$state()$status=='ready',identical(names(ctl$data()),c('Lipid_Name','A','C')))
  current(request(sundo)); session$flushReact()
  stopifnot(ctl$state()$status=='pending')
  run(4L); session$flushReact()
  stopifnot(identical(names(ctl$data()),c('Lipid_Name','A','B','C')))
})
cat('PASS: detection impact, reversible sample exclusion, and explicit current preparation\n')
