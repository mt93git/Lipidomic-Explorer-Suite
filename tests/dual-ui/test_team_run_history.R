# One committed controller revision produces one coherent Team history row.
`%||%` <- function(x,y) if(is.null(x)) y else x
source('R/guided_workflow.R')
make_run <- function(revision, lipids, samples, seed) {
  matrix <- data.frame(Lipid_Name=paste0('L',seq_len(lipids)),check.names=FALSE)
  for (id in paste0('S',seq_len(samples))) matrix[[id]] <- seq_len(lipids)
  applied <- list(revision=revision,request_id=paste0('request-',revision),
    spec=list(data_id='same-dataset',settings=list(imputationSeed=seed,
      useImputation=TRUE,normalizationMethod='pqn')),
    output_lipids=matrix$Lipid_Name,output_samples=names(matrix)[-1],
    filter=list(retained=lipids,threshold=80,scope='group',excluded=2,
                samples=paste0('S',seq_len(samples))),
    completed_at=as.POSIXct(sprintf('2026-10-27 06:%02d:00',revision),tz='UTC'))
  list(state=list(data_available=TRUE,revision=revision,applied=applied),matrix=matrix)
}
runs <- list(make_run(1L,8L,8L,101L),make_run(2L,8L,7L,102L),make_run(3L,8L,8L,103L))
history <- list(); key <- NULL
for (run in runs) {
  # Reactive fields may expose the old matrix with a new receipt, or vice versa.
  old <- if(length(history)) runs[[length(history)]]$matrix else NULL
  if(!is.null(old)) stopifnot(is.null(guide_completed_run_record(run$state,old)))
  record <- guide_completed_run_record(run$state,run$matrix,c('study.xlsx'),0L)
  stopifnot(!is.null(record))
  update <- guide_history_append(history,key,record)
  history <- update$history; key <- update$last_key
  table <- guide_history_table(history)
  stopifnot(update$added,nrow(table)==length(history),
            identical(as.integer(table$Samples),vapply(history,`[[`,integer(1),'sample_count')))
  duplicate <- guide_history_append(history,key,record)
  stopifnot(!duplicate$added,length(duplicate$history)==length(history))
}
stopifnot(length(history)==3L,
          identical(vapply(history,`[[`,integer(1),'sample_count'),c(8L,7L,8L)),
          identical(vapply(history,`[[`,integer(1),'samples'),c(8L,7L,8L)),
          identical(vapply(history,function(h) length(h$sample_ids),integer(1)),c(8L,7L,8L)),
          identical(vapply(history,`[[`,integer(1),'seed'),c(101L,102L,103L)),
          identical(vapply(history,`[[`,integer(1),'run'),1:3),
          all(grepl('UTC',vapply(history,`[[`,character(1),'time'))))
stopifnot(nrow(guide_history_table(history[1]))==1L,
          nrow(guide_history_table(history))==3L,
          identical(guide_history_table(history)$Samples,c(8L,7L,8L)))
cat('PASS: one and three applied runs render one and three history rows with scalar counts\n')
