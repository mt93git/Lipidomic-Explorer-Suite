# Shared preparation / QC contract. No annotation, PCA, or metadata-schema decisions.
preparation_settings <- function(settings = list(), policy = "classic") {
  policy <- match.arg(policy, c("classic", "team"))
  defaults <- list(minDetectionPct = 0, dropNonDetected = FALSE, detectionScope = 'global',
    useImputation = TRUE, normalizationMethod = 'median', imputeZerosPerFile = TRUE,
    imputeRemainingNAtoZero = identical(policy, "classic"), outlierTreatments = list(),
    imputationSeed = 42L)
  if (identical(policy, "team")) defaults$dropNonDetected <- TRUE
  for (key in names(defaults)) if (!is.null(settings[[key]])) defaults[[key]] <- settings[[key]]
  p <- defaults$minDetectionPct
  if (!is.numeric(p) || length(p) != 1L || !is.finite(p) || p < 0 || p > 100) stop('Detection threshold must be between 0 and 100.')
  for (key in c('dropNonDetected','useImputation','imputeZerosPerFile','imputeRemainingNAtoZero')) {
    if (!is.logical(defaults[[key]]) || length(defaults[[key]]) != 1L || is.na(defaults[[key]])) stop('Invalid preparation flag: ', key)
  }
  if (length(defaults$detectionScope)!=1L || !defaults$detectionScope %in% c('global','group')) stop('Unknown detection scope.')
  if (length(defaults$normalizationMethod)!=1L || !defaults$normalizationMethod %in% c('none','median','pqn')) stop('Unknown normalization method.')
  seed <- defaults$imputationSeed
  if (!is.numeric(seed) || length(seed) != 1L || !is.finite(seed) || seed != floor(seed) || seed < 0 || seed > .Machine$integer.max) stop("Invalid imputation seed.")
  defaults$imputationSeed <- as.integer(seed)
  tx <- defaults$outlierTreatments
  if (!is.list(tx) || (length(tx) && (is.null(names(tx)) || anyNA(names(tx)) || any(!nzchar(names(tx))) || anyDuplicated(names(tx))))) stop('QC treatments need unique sample IDs.')
  if (any(!vapply(tx,function(x) is.character(x) && length(x)==1L && !is.na(x) && x %in% c('keep','remove','average'),logical(1)))) stop('Unknown QC treatment.')
  defaults$outlierTreatments <- tx[sort(names(tx))]
  defaults
}

preparation_sample_ids <- function(df, selected = NULL, treatments = list(), apply_outliers = TRUE, empty_means_all = TRUE) {
  available <- setdiff(names(df)[vapply(df,is.numeric,logical(1))],'Lipid_Name')
  # Classic compatibility: NULL and an empty widget selection mean all columns.
  # Internal post-QC lists and explicit Team selections must opt out so removing
  # every sample never silently reintroduces excluded measurements.
  if (is.null(selected) || (isTRUE(empty_means_all) && length(selected) == 0L)) selected <- available
  if (!is.character(selected) || anyNA(selected) || anyDuplicated(selected) || !all(selected %in% available)) stop('Selected samples must be unique numeric matrix columns.')
  if (length(treatments) && !all(names(treatments) %in% available)) stop('QC treatments refer to samples outside this matrix.')
  if (apply_outliers) selected <- setdiff(selected,names(treatments)[vapply(treatments,function(x) x %in% c('remove','average'),logical(1))])
  selected
}

preparation_detection_preview <- function(df, samples, threshold=0, drop_absent=FALSE, scope='global', metadata=NULL) {
  preparation_settings(list(minDetectionPct=threshold,dropNonDetected=drop_absent,detectionScope=scope))
  if (!is.data.frame(df) || !'Lipid_Name' %in% names(df) || anyDuplicated(names(df)) || anyNA(df$Lipid_Name) || anyDuplicated(df$Lipid_Name)) stop('A uniquely identified lipid matrix is required.')
  samples <- preparation_sample_ids(df,samples,empty_means_all=FALSE)
  if (!length(samples)) stop('Select at least one measured sample; removed or averaged samples cannot count as detections.')
  m <- as.matrix(df[,samples,drop=FALSE]); observed <- is.finite(m) & m>0
  keep <- rep(TRUE,nrow(df)); rates <- rowMeans(observed)
  if (drop_absent) keep <- rowSums(observed)>0
  if (threshold>0 && scope=='group') {
    fields <- c('FullName','Group1','Group2')
    if (is.null(metadata) || !all(fields %in% names(metadata)) || anyNA(metadata$FullName) || anyDuplicated(metadata$FullName) || !all(samples %in% metadata$FullName)) stop('Group detection requires unambiguous metadata for every selected sample.')
    md <- metadata[match(samples,metadata$FullName),fields,drop=FALSE]
    if (anyNA(md) || any(!nzchar(trimws(as.matrix(md)))) || any(as.matrix(md[,c('Group1','Group2')])=='Unspecified')) stop('Confirm Group1 and Group2 before group-based detection.')
    # Group integer codes rather than concatenated labels (labels can contain separators).
    keys <- paste(match(md$Group1,unique(md$Group1)),match(md$Group2,unique(md$Group2)),sep=':')
    fractions <- lapply(split(seq_along(samples),keys),function(j) rowMeans(observed[,j,drop=FALSE]))
    rates <- Reduce(pmax,fractions)
  }
  if (threshold>0) keep <- keep & rates>=threshold/100
  list(keep=keep,input=nrow(df),retained=sum(keep),excluded=sum(!keep),samples=samples,
    all_absent=sum(rowSums(observed)==0),threshold=threshold,scope=scope,
    drop_absent=drop_absent,raw_missing=mean(!observed),
    retained_missing=if(any(keep)) mean(!observed[keep,,drop=FALSE]) else NA_real_)
}

preparation_filter_detected <- function(df,samples,threshold=0,drop_absent=FALSE,scope='global',metadata=NULL) {
  p <- preparation_detection_preview(df,samples,threshold,drop_absent,scope,metadata)
  if ((threshold>0 || drop_absent) && p$retained<2L) stop('Fewer than two lipids pass the detection filter. Lower the threshold or review the samples.')
  result <- df[p$keep,,drop=FALSE]; rownames(result)<-NULL
  list(data=result,audit=p)
}

preparation_request <- function(data_info, selected=NULL, metadata=NULL, settings=list(), use_average=FALSE, data_id=NULL, policy="classic") {
  if (is.null(data_info$data) || !nrow(data_info$data)) return(NULL)
  cfg <- preparation_settings(settings, policy)
  selected <- preparation_sample_ids(data_info$data,selected,cfg$outlierTreatments,FALSE,
    empty_means_all=identical(policy,"classic"))
  if (!is.logical(use_average) || length(use_average)!=1L || is.na(use_average)) stop('Invalid averaging flag.')
  if (is.null(data_id)) data_id <- digest::digest(list(data_info$data,data_info$file_cols),algo='sha256')
  metadata_id <- digest::digest(metadata,algo='sha256')
  spec <- list(data_id=data_id,metadata_id=metadata_id,selected=selected,settings=cfg,use_average=use_average,imputation_seed=cfg$imputationSeed,policy=policy)
  list(id=digest::digest(spec,algo='sha256'),spec=spec,data_info=data_info,metadata=metadata)
}
preparation_request_preview <- function(request) {
  if (is.null(request)) return(NULL)
  s <- request$spec$settings
  ids <- preparation_sample_ids(request$data_info$data,request$spec$selected,s$outlierTreatments,empty_means_all=FALSE)
  preparation_detection_preview(request$data_info$data,ids,s$minDetectionPct,s$dropNonDetected,s$detectionScope,request$metadata)
}

# One controller per Shiny session; only explicit run/QC triggers may commit a result.
shared_preparation_controller <- function(pending, compute, run_trigger, qc_trigger, authorized, policy="classic") {
  policy <- match.arg(policy, c("classic", "team"))
  result <- shiny::reactiveVal(NULL); applied <- shiny::reactiveVal(NULL)
  failure <- shiny::reactiveVal(NULL); history <- shiny::reactiveVal(list())
  revision <- shiny::reactiveVal(0L)
  attempt <- function(request,reason) {
    tryCatch({
      if (is.null(request)) stop('Upload a matrix before preparing data.')
      preview <- preparation_request_preview(request)
      value <- compute(request)
      if (is.null(value) || !nrow(value) || ncol(value)<2L) stop('Processing did not produce a usable matrix.')
      numeric_values <- unlist(value[vapply(value,is.numeric,logical(1))], use.names=FALSE)
      if (any(is.infinite(numeric_values)) || (anyNA(value) && (policy == "classic" || isTRUE(request$spec$settings$useImputation) || isTRUE(request$spec$settings$imputeRemainingNAtoZero))))
        stop('Processing did not produce a usable matrix under the selected missing-value policy.')
      record <- list(request_id=request$id,spec=request$spec,filter=preview,
        output_lipids=value$Lipid_Name,output_samples=setdiff(names(value),'Lipid_Name'),
        reason=reason,completed_at=as.POSIXct(Sys.time(), tz="UTC"),revision=shiny::isolate(revision())+1L)
      result(value); applied(record); failure(NULL); revision(record$revision)
      history(append(shiny::isolate(history()),list(record)))
      invisible(TRUE)
    },error=function(e) { failure(conditionMessage(e)); invisible(FALSE) })
  }
  apply <- function(confirmed=FALSE,expected_id=NULL) {
    if (!isTRUE(confirmed)) stop('Confirm preparation before applying changes.')
    if (!isTRUE(authorized())) stop('Preparation is not authorized.')
    request <- pending()
    if (is.null(request) || !identical(expected_id,request$id)) stop('The preview changed; review and confirm the current preparation.')
    attempt(request,'run_analysis')
  }
  shiny::observeEvent(run_trigger(), {
    if (!isTRUE(authorized())) return()
    r <- tryCatch(pending(),error=function(e) {failure(conditionMessage(e));NULL})
    if (!is.null(r)) apply(TRUE,r$id)
  },ignoreInit=TRUE)
  shiny::observeEvent(qc_trigger(), {
    if (!isTRUE(authorized()) || policy == "team") return()
    old <- shiny::isolate(applied()); current <- tryCatch(pending(),error=function(e) NULL)
    if (is.null(old) || is.null(current)) return()
    if (!identical(old$spec$data_id,current$spec$data_id) || !identical(old$spec$metadata_id,current$spec$metadata_id)) {
      failure('Data or metadata changed. Review the preparation and click Run Analysis before applying QC.'); return()
    }
    # A QC action must not silently apply an unrelated pending threshold/normalization.
    settings <- old$spec$settings; settings$outlierTreatments <- current$spec$settings$outlierTreatments
    r <- preparation_request(current$data_info,old$spec$selected,current$metadata,settings,old$spec$use_average,current$spec$data_id,policy)
    attempt(r,'qc_treatment')
  },ignoreInit=TRUE)
  state <- shiny::reactive({
    issue <- NULL
    r <- tryCatch(pending(),error=function(e) {issue<<-conditionMessage(e);NULL})
    a <- applied(); err <- failure()
    same_data <- !is.null(r) && !is.null(a) && identical(r$spec$data_id,a$spec$data_id)
    compatible <- same_data && identical(r$spec$metadata_id,a$spec$metadata_id)
    dirty <- !is.null(r) && (is.null(a) || !identical(r$id,a$request_id))
    status <- if(!is.null(issue)) 'invalid' else if(is.null(r)) 'empty' else if(!is.null(err)) 'error' else if(is.null(a) || !same_data) 'unprepared' else if(dirty) 'pending' else 'ready'
    list(status=status,pending=if(is.null(r)) NULL else r$spec,pending_id=if(is.null(r)) NULL else r$id,
      applied=a,dirty=dirty,error=if(!is.null(issue)) issue else err,
      data_available=compatible && is.null(err) && is.null(issue),revision=revision(),history=history())
  })
  data <- shiny::reactive({if(!state()$data_available) return(NULL);result()})
  applied_request <- shiny::reactive({
    if (!state()$data_available) return(NULL)
    r <- pending(); a <- applied()$spec
    preparation_request(r$data_info,a$selected,r$metadata,a$settings,a$use_average,a$data_id,policy)
  })
  reset <- function() {
    result(NULL); applied(NULL); failure(NULL); revision(0L); history(list())
    invisible(NULL)
  }
  list(reset=reset,state=state,data=data,preview=shiny::reactive(preparation_request_preview(pending())),
       applied_request=applied_request,apply=apply)
}
