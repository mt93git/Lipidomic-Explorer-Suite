# Real ZIP round trip through the shared production module; synthetic data only.
source("R/global.R")
source("tests/dual-ui/archive_fixture_helpers.R")
created<-make_archive("classic")
# Extend the actual exported ZIP with lazy controls that have no initial browser UI.
d<-tempfile();dir.create(d);utils::unzip(created$path,exdir=d);state_file<-file.path(d,"state.json");st<-jsonlite::read_json(state_file,simplifyVector=FALSE)
st$inputs[["violin_tab-featureLevel"]]<-"class";st$inputs[["composition_tab-displayMode"]]<-"relative"
jsonlite::write_json(st,state_file,auto_unbox=TRUE,null="null");z<-tempfile(fileext=".zip");zip::zipr(z,list.files(d),root=d);unlink(d,recursive=TRUE)
for(policy in c("classic","team")){
 cfg<-shiny::reactiveVal(settings_for(policy));approved<-shiny::reactiveVal(FALSE)
 shiny::testServer(shared_data_server,args=list(external_settings=shiny::reactive(cfg()),preparation_policy=policy,design_check=if(policy=="team")function()isTRUE(approved()) else NULL),{
  session$setInputs(import_session_file=data.frame(name="fixture.zip",size=file.info(z)$size,type="application/zip",datapath=z));for(i in 1:10)session$flushReact();api<-session$returned
  stopifnot(api$session_restored(),!api$is_restoring())
  if(policy=="classic"){
   stopifnot(!is.null(api$data_processed_unfiltered()),api$get_restored_input("violin_tab-featureLevel")=="class")
   session$setInputs(`violin_tab-featureLevel`="class");session$flushReact();session$setInputs(`violin_tab-featureLevel`="species");session$flushReact();stopifnot(api$get_restored_input("violin_tab-featureLevel",default="fixed-default")=="species")
   cfg(modifyList(cfg(),list(normalizationMethod="median",minDetectionPct=50)));session$flushReact();stopifnot(api$preparation_state()$dirty,grepl("Re-run Pipeline",output$preparationSummary$html,fixed=TRUE),!grepl("Update prepared data",output$preparationSummary$html,fixed=TRUE))
   before<-api$run_analysis_trigger();api$request_preparation_run();session$flushReact();stopifnot(api$run_analysis_trigger()==before+1L,!api$preparation_state()$dirty,api$preparation_state()$applied$spec$settings$normalizationMethod=="median")
   stopifnot(file.exists(output$export_session_btn),api$get_restored_input("composition_tab-displayMode")=="relative",api$get_restored_input("violin_tab-featureLevel",default="fixed-default")=="species")
   invalid<-tempfile(fileext=".zip");writeLines("Not a ZIP archive",invalid);generation<-api$restore_generation();session$setInputs(import_session_file=data.frame(name="invalid.zip",size=file.info(invalid)$size,type="application/zip",datapath=invalid));session$flushReact();stopifnot(api$restore_generation()==generation,api$get_restored_input("violin_tab-featureLevel",default="fixed-default")=="species");unlink(invalid)
   session$setInputs(import_session_file=data.frame(name="fixture-again.zip",size=file.info(z)$size,type="application/zip",datapath=z));for(i in 1:10)session$flushReact();stopifnot(api$get_restored_input("violin_tab-featureLevel")=="class")
  }else{
   stopifnot(is.null(api$data_processed_unfiltered()),awaiting_restore_review())
   before<-api$run_analysis_trigger();api$request_preparation_run();session$flushReact();stopifnot(api$run_analysis_trigger()==before,is.null(api$data_processed_unfiltered()))
   stopifnot(api$get_restored_input("violin_tab-featureLevel")=="class",api$get_restored_input("violin_tab-featureLevel")=="class")
  }
 })
}
old<-Sys.getenv("LIPIDOMIC_INTERFACE");Sys.setenv(LIPIDOMIC_INTERFACE="classic");classic<-vapply(c("qc","pca"),get_journal_caption,character(1));Sys.setenv(LIPIDOMIC_INTERFACE="team");team<-vapply(c("qc","pca"),get_journal_caption,character(1));Sys.setenv(LIPIDOMIC_INTERFACE=old)
stopifnot(!any(grepl("methods record",classic,fixed=TRUE)),all(grepl("methods record",team,fixed=TRUE)),all(grepl("Re-run Pipeline",classic,fixed=TRUE)))
unlink(c(created$path,z));cat("PASS real ZIP Classic lazy controls, pending summary/shared rerun/export, repeated import, Team review guard, captions\n")
