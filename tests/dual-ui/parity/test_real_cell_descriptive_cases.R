# Actual Paula67 cell companion outputs and CSV mathematics. Explicit QA view:
# observed Healthy vs SC-SteadyState, descriptive only, no significance/localization.
source('R/global.R');source('R/sample_metadata_import.R');source('R/results_dashboard.R');source('R/cell_show.R')
hubs<-readRDS(Sys.getenv('PRIVATE_HUB_RDS'));value<-function(x){force(x);function(...)x};results<-list()
for(policy in c('classic','team')){
 d<-hubs[[policy]];stopifnot(ncol(d$matrix)==68L,all(c('Healthy','SC-SteadyState')%in%d$metadata$Group1))
 h<-list(data_processed=value(d$matrix),all_metadata=value(d$metadata),preparation_audit=value(list(normalization='median',imputation='QRILC')),preparation_dirty=value(FALSE))
 server<-function(input,output,session)cell_show_server(input,output,session,h)
 shiny::testServer(server,{
  feature<-d$matrix$Lipid_Name[1];sample<-names(d$matrix)[2];cls<-rd_class(feature)
  session$setInputs(cell_group_column='Group1',cell_reference_group='Healthy',cell_comparison_group='SC-SteadyState',cell_class=cls,cell_lipid=feature,cell_sample=sample,cell_explore_level='feature',cell_profile_view='share');session$flushReact()
  csv<-function(id)read.csv(output[[id]],check.names=FALSE)
  feature_csv<-csv('cell_lipid_csv');expected<-as.numeric(d$matrix[1,-1]);stopifnot(nrow(feature_csv)==67L,max(abs(feature_csv$Prepared_signal-expected)/pmax(1,abs(expected)))<1e-12)
  profile_csv<-csv('cell_profile_csv');classes<-rd_class(d$matrix$Lipid_Name);sums<-tapply(d$matrix[[sample]],classes,sum);ix<-match(profile_csv$Class,names(sums));stopifnot(!anyNA(ix),max(abs(profile_csv$Abundance-sums[ix])/pmax(1,abs(sums[ix])))<1e-12,abs(sum(profile_csv$Signal_percent)-100)<1e-10)
  compare_csv<-csv('cell_comparison_csv');indices<-match(compare_csv$Measurement,names(d$matrix));original<-as.numeric(d$matrix[1,indices]);stopifnot(!anyNA(indices),max(abs(compare_csv$Prepared_signal-original)/pmax(1,abs(original)))<1e-12,all(compare_csv$Group%in%c('Healthy','SC-SteadyState')))
  class_csv<-csv('cell_class_profile_csv');expected_class<-vapply(seq_len(nrow(class_csv)),function(i)sum(d$matrix[[class_csv$Sample[i]]][classes==class_csv$Class[i]]),numeric(1));stopifnot(max(abs(class_csv$Abundance-expected_class)/pmax(1,abs(expected_class)))<1e-12)
  for(id in c('cell_lipid_plot','cell_profile_plot','cell_class_plot','cell_comparison_plot')){
   payload<-jsonlite::fromJSON(output[[id]],simplifyVector=FALSE);stopifnot(length(payload$x$data)>0)
   results[[id]][[policy]]<<-list(status='PASS',traces_sha256=digest::digest(payload$x$data,algo='sha256'),feature_csv_rows=nrow(feature_csv),profile_classes=nrow(profile_csv),comparison_measurements=nrow(compare_csv),class_csv_rows=nrow(class_csv))
  }
 })
}
stopifnot(length(results)==4L,all(vapply(results,function(x)all(c('classic','team')%in%names(x)),logical(1))))
for(id in names(results))stopifnot(identical(results[[id]]$classic,results[[id]]$team))
out<-Sys.getenv('CELL_CASES_JSON');if(nzchar(out))jsonlite::write_json(results,out,auto_unbox=TRUE,pretty=TRUE)
cat('PASS: four actual cell companion Plotly outputs,67-measurement feature CSV, class sums/shares and descriptive Healthy-vs-SC-SteadyState measurement CSVs; both saved policies agree. Team-only UI, no inference or localization claimed.\n')
