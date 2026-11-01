# Synthetic real-hub regression: unmapped confirmed design fields survive restore.
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/global.R")
path <- normalizePath("tests/guided-shared/fixtures/abundance.csv")
ids <- names(read.csv(path, check.names=FALSE))[-1L]
md <- read_sample_metadata_file("tests/guided-shared/fixtures/metadata.csv", "metadata.csv")
md$Tissue <- rep(c("Tissue A", "Tissue B"), length.out=length(ids))
md$ReplicateID <- as.character(seq_along(ids))
full_mapping <- c(Group1="Condition", Group2="Tissue", Replicate="ReplicateID",
                  PatientNumber="SubjectID", TimePoint="TimePoint")
snapshot <- list(data=data.frame(FullName=ids, md[setdiff(names(md),"SampleID")],
  check.names=FALSE), mappings=c(Group1="Condition"), id_column="SampleID")
settings <- list(minDetectionPct=0, dropNonDetected=TRUE, detectionScope="global",
  useImputation=FALSE, normalizationMethod="none", imputationSeed=42L,
  imputeZerosPerFile=TRUE, imputeRemainingNAtoZero=TRUE)
source_zip <- tempfile(fileext=".zip")
expected <- NULL
args <- list(preparation_policy="team", design_check=function() TRUE,
  external_settings=shiny::reactive(settings))
shiny::testServer(shared_data_server, args=args, {
  session$setInputs(files=data.frame(name=basename(path), size=file.info(path)$size,
    type="text/csv", datapath=path), selectedColumns=ids)
  session$flushReact()
  api <- session$returned
  api$set_external_sample_metadata(stage_metadata_v01(md,ids,full_mapping),TRUE)
  invisible(api$all_metadata())
  api$set_external_sample_metadata(snapshot)
  expected <<- api$external_sample_metadata()$scientific_metadata
  stopifnot(identical(expected$Group2,md$Tissue), identical(expected$Replicate,md$ReplicateID))
  session$setInputs(runAnalysis=1L); session$flushReact()
  stopifnot(!is.null(api$data_processed_unfiltered()), file.copy(output$export_session_btn,source_zip))
})
fields <- c("FullName","Group1","Group2","Replicate","PatientNumber","TimePoint")
shiny::testServer(shared_data_server,args=args, {
  api <- session$returned
  api$import_session_path(source_zip)
  for(i in seq_len(12L)) session$flushReact()
  stopifnot(isTRUE(api$session_restored()),is.null(api$data_processed_unfiltered()))
  restored <- api$external_sample_metadata()
  stopifnot(identical(restored$scientific_metadata[fields],expected[fields]))
  api$set_external_sample_metadata(restored$team_snapshot)
  stopifnot(identical(api$external_sample_metadata()$scientific_metadata[fields],expected[fields]))
  session$setInputs(selectedColumns=ids,runAnalysis=1L); session$flushReact()
  stopifnot(!is.null(api$data_processed_unfiltered()))
  reexport <- read_session_archive(output$export_session_btn,metadata_decoder=team_metadata_sidecar_decode)
  stopifnot(identical(reexport$shared$metadata$scientific_metadata[fields],expected[fields]))
  unlink(reexport$directory,recursive=TRUE)
})
cat("PASS: real Team restore, reconfirm, prepare and re-export retain unmapped design fields\n")

archive <- read_session_archive(source_zip,metadata_decoder=team_metadata_sidecar_decode)
encoded <- metadata_sidecar_encode(archive$shared$metadata)
encoded$scientific_metadata$Group1 <- rep("contradictory saved value",length(ids))
encoded$scientific_metadata$Replicate[1L] <- ""
value <- team_metadata_sidecar_decode(encoded)
stopifnot(identical(value$scientific_metadata$Group1,md$Condition),
          identical(value$scientific_metadata$Replicate[1L],""))
classic <- metadata_sidecar_decode(encoded)
stopifnot(identical(classic$scientific_metadata$Group1,md$Condition),
          !identical(classic$scientific_metadata$Group2,md$Tissue))
for(kind in c("missing","na","list","reorder","duplicate")) {
  bad <- encoded
  if(kind=="missing") bad$scientific_metadata$Group2 <- NULL
  if(kind=="na") bad$scientific_metadata$Group2[1L] <- NA_character_
  if(kind=="list") bad$scientific_metadata$Group2 <- as.list(bad$scientific_metadata$Group2)
  if(kind=="reorder") bad$scientific_metadata$FullName <- rev(ids)
  if(kind=="duplicate") bad$scientific_metadata$FullName[2L] <- ids[1L]
  stopifnot(inherits(try({
    decoded <- team_metadata_sidecar_decode(bad)
    team_metadata_validate_ids(decoded, ids)
  },silent=TRUE),"try-error"))
}
cat("PASS: explicit mappings win, legacy empty labels remain exact, malformed fields fail closed; Classic decoder unchanged\n")

# Exercise archives with no snapshot and archives with no sidecar independently.
mutate_archive <- function(kind) {
  dest <- tempfile("team-metadata-"); dir.create(dest)
  utils::unzip(source_zip,exdir=dest)
  state_path <- file.path(dest,"state.json")
  state <- jsonlite::read_json(state_path,simplifyVector=FALSE)
  if(kind=="mismatch-no-snapshot") {
    state$metadata$external_sample_metadata <- NULL
    shared_path <- file.path(dest,"shared-state-v1.json")
    shared <- jsonlite::read_json(shared_path,simplifyVector=TRUE)
    replacement <- paste0("OTHER_",ids)
    shared$metadata$scientific_metadata$FullName <- replacement
    shared$metadata$display_metadata$SampleID <- replacement
    jsonlite::write_json(shared,shared_path,auto_unbox=TRUE,digits=NA)
  } else unlink(file.path(dest,"shared-state-v1.json"))
  jsonlite::write_json(state,state_path,auto_unbox=TRUE,digits=NA)
  zip_path <- tempfile(fileext=".zip")
  zip::zipr(zip_path,list.files(dest),root=dest)
  unlink(dest,recursive=TRUE)
  zip_path
}
bad_zip <- mutate_archive("mismatch-no-snapshot")
shiny::testServer(shared_data_server,args=args, {
  api <- session$returned
  api$import_session_path(bad_zip)
  for(i in seq_len(12L)) session$flushReact()
  stopifnot(!isTRUE(api$session_restored()),!isTRUE(api$is_restoring()),
    grepl("does not match the active abundance matrix", output$import_status_display$html,fixed=TRUE))
})
legacy_zip <- mutate_archive("no-sidecar")
legacy_restore <- function(seed_previous) {
  result <- NULL
  shiny::testServer(shared_data_server,args=args, {
    api <- session$returned
    if(seed_previous) {
      session$setInputs(files=data.frame(name=basename(path),size=file.info(path)$size,
        type="text/csv",datapath=path),selectedColumns=ids)
      session$flushReact()
      prior <- md; prior$Tissue <- "PREVIOUS_SESSION"; prior$ReplicateID <- "PREVIOUS_SESSION"
      api$set_external_sample_metadata(stage_metadata_v01(prior,ids,full_mapping),TRUE)
      invisible(api$all_metadata())
    }
    api$import_session_path(legacy_zip)
    for(i in seq_len(12L)) session$flushReact()
    stopifnot(isTRUE(api$session_restored()))
    result <<- api$external_sample_metadata()$scientific_metadata[fields]
    stopifnot(!any(result$Group2=="PREVIOUS_SESSION"),!any(result$Replicate=="PREVIOUS_SESSION"))
  })
  result
}
stopifnot(identical(legacy_restore(FALSE),legacy_restore(TRUE)))
unlink(c(source_zip,bad_zip,legacy_zip,archive$directory),recursive=TRUE)
cat("PASS: sidecar IDs checked without snapshot; legacy snapshot restore cannot inherit prior-session metadata\n")
