source('R/global.R')
archive <- 'tests/dual-ui/fixtures/classic-seed7-synthetic.zip'
tmp <- tempfile('classic-edit-');dir.create(tmp);on.exit(unlink(tmp,recursive=TRUE),add=TRUE)
unzip(archive,exdir=tmp)
state_path <- file.path(tmp,'state.json')
state <- jsonlite::read_json(state_path,simplifyVector=FALSE)
state$color_shape$custom_colors <- list(Control='#123456')
state$color_shape$useCustomColors <- TRUE
state$color_shape$active_palette <- 'Study palette'
state$color_shape$color_palettes <- list('Study palette'=list(name='Study palette',colors=list(Control='#123456')))
jsonlite::write_json(state,state_path,auto_unbox=TRUE,pretty=TRUE)
zip_path <- tempfile(fileext='.zip')
old <- getwd();setwd(tmp);zip::zipr(zip_path,c('state.json','shared-state-v1.json','data_files'));setwd(old)
settings <- shiny::reactiveVal(list(useImputation=FALSE,normalizationMethod='none',imputeZerosPerFile=FALSE,imputeRemainingNAtoZero=TRUE,minDetectionPct=0,dropNonDetected=FALSE,detectionScope='global',outlierTreatments=list(),colorGrouping='Group1',useCustomColors=FALSE,custom_colors=list()))
shiny::testServer(shared_data_server,args=list(external_settings=shiny::reactive(settings()),preparation_policy='classic'),{
 session$setInputs(import_session_file=data.frame(name='session.zip',size=file.info(zip_path)$size,type='application/zip',datapath=zip_path))
 for(i in seq_len(10L))session$flushReact()
 stopifnot(isTRUE(session_restored()),!is.null(restored_palette_state()),identical(restored_preparation_seed(),7L))
 session$setInputs(selectedColumns=all_numeric_columns(),runAnalysis=1);session$flushReact()
 before <- serialize_state()
 stopifnot(identical(before$color_shape$active_palette,'Study palette'),identical(before$color_shape$custom_colors$Control,'#123456'))
 group <- allParsedMetadata()$Group1[1]; id <- paste0('globalGroupCol_Group1_',gsub('[^A-Za-z0-9]','_',group))
 vals <- setNames(list('#ABCDEF'),id); vals$colorEditMode <- 'Group1';do.call(session$setInputs,vals)
 session$setInputs(btn_apply_colors=1);session$flushReact()
 exported <- read_session_archive(output$export_session_btn)
 after <- exported$state
 stopifnot(isTRUE(classic_palette_edited()),identical(after$color_shape$custom_colors[[group]],'#ABCDEF'),!identical(after$color_shape$active_palette,'Study palette'))
 unlink(exported$directory,recursive=TRUE)
 # A new upload under the same display name replaces bytes and invalidates restored state.
 oldname <- names(rv$uploads)[1]; orig <- rawData()$data; changed <- orig; changed[[2]][1] <- changed[[2]][1]+999
 newfile <- tempfile(fileext='.csv');write.csv(changed,newfile,row.names=FALSE,na='')
 session$setInputs(files=data.frame(name=oldname,size=file.info(newfile)$size,type='text/csv',datapath=newfile));session$flushReact()
 stopifnot(is.null(restored_preparation_seed()),is.null(restored_team_snapshot()),is.null(external_metadata()),!isTRUE(session_restored()),is.null(preparation$state()$applied),rawData()$data[[2]][1]==changed[[2]][1])
})
cat('PASS: Classic edited color wins on ZIP re-export; same-name upload replaces and invalidates restored state\n')
