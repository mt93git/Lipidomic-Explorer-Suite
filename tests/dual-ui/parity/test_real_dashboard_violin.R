# Actual Team dashboard violin CSV on full real prepared data and metadata.
source('R/global.R')
source('R/sample_metadata_import.R')
source('R/results_dashboard.R')
lipidomic_plotly_event <- function(...) NULL
p <- Sys.getenv('PRIVATE_HUB_RDS');if(!nzchar(p)) stop('Set PRIVATE_HUB_RDS')
d <- readRDS(p)$team
value <- function(x) {force(x);function(...)x}
hub <- list(data_processed=value(d$matrix),all_metadata=value(d$metadata),
 preparation_audit=value(list(normalization='median',imputation='QRILC')),
 preparation_dirty=value(FALSE),color_maps=value(d$color_maps))
server<-function(input,output,session) results_dashboard_module_server(input,output,session,hub)
mat<-as.matrix(d$matrix[-1]);rownames(mat)<-d$matrix$Lipid_Name
stopifnot(nrow(mat)==352,ncol(mat)==67)
shiny::testServer(server,{
 for(lipid in rownames(mat)[1:3]) {
   session$setInputs(color_by='Group1',violin_lipid=lipid);session$flushReact()
   csv<-read.csv(output$dl_violin,check.names=FALSE,stringsAsFactors=FALSE)
   vals<-mat[lipid,match(csv$Sample,colnames(mat))]
   stopifnot(nrow(csv)==67, max(abs(csv$Prepared_abundance-vals))<1e-7,
    max(abs(csv$Log10_abundance-log10(vals)))<1e-12,
    identical(csv$Group,as.character(d$metadata$Group1[match(csv$Sample,d$metadata$FullName)])))
 }
})
cat('PASS: Team Results dashboard violin CSV, 3 lipids x 67 samples; prepared linear, log10 and metadata group match real input; descriptive only\n')
