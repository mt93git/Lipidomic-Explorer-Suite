# Density display must not change prepared samples or exported data.
suppressPackageStartupMessages(library(shiny))
`%||%` <- function(a,b) if(is.null(a)) b else a
lipidomic_plotly_event <- function(...) NULL
source('R/sample_metadata_import.R'); source('R/results_dashboard.R')
value <- function(x) { force(x); function(...) x }
cases <- list(nonpositive=c(-1,0,NA,Inf,.1,1,10),regular=c(.01,.1,1,2,5,10,100),constant=rep(10,7),single=c(10,rep(NA,6)),pair=c(.1,100,rep(NA,5)),floor=c(rep(.001,5),10,100),extreme=c(1:6,1e12))
for (case in names(cases)) {
 vals <- cases[[case]]; samples <- paste0('s',seq_along(vals))
 df <- data.frame(Lipid_Name=c('PC(16:0_20:4)+AcO','PC(18:0_18:1)'),rbind(vals,seq_along(vals)+1),check.names=FALSE); names(df)[-1] <- samples
 meta <- data.frame(FullName=samples,Group1='Healthy')
 hub <- list(data_processed=value(df),all_metadata=value(meta),preparation_audit=value(list(normalization='none',imputation='none')),preparation_dirty=value(FALSE),color_maps=value(list(Group1=c(Healthy='#b7b7b7'))))
 testServer(function(input,output,session) results_dashboard_module_server(input,output,session,hub),{
   session$setInputs(color_by='Group1',violin_lipid='PC(16:0_20:4)+AcO');session$flushReact()
   payload <- jsonlite::fromJSON(output$plot_violin,simplifyVector=FALSE)$x
   traces <- Filter(function(t) identical(t$type,'violin'),payload$data)
   drawn <- unlist(lapply(traces,`[[`,'y'),use.names=FALSE)
   keep <- is.finite(vals)&vals>0
   stopifnot(isTRUE(all.equal(sort(drawn),sort(log10(vals[keep])))),all(vapply(traces,function(t)identical(t$spanmode,'soft')&&identical(t$points,'all')&&identical(t$box$visible,TRUE)&&identical(t$hoveron,'points'),logical(1))))
   stopifnot(identical(payload$layout$yaxis$zeroline,FALSE),is.null(payload$layout$yaxis$range),identical(payload$layout$yaxis$autorange,TRUE))
   csv <- read.csv(output$dl_violin,check.names=FALSE)
   stopifnot(isTRUE(all.equal(csv$Prepared_abundance,unname(vals[keep]))),identical(csv$Sample,samples[keep]))
   stopifnot(grepl('smoothed estimates',payload$layout$annotations[[1]]$text,fixed=TRUE))
 })
 cat('PASS',case,'sample values, mapping, tails and export annotation\n')
}
