# Libreros Lab preparation controls: filtering acts on measured data, before QRILC.
ux_detection_preview <- function(df, samples, threshold=0, drop_absent=TRUE, scope='global', metadata=NULL) {
  stopifnot(is.numeric(threshold),length(threshold)==1L,is.finite(threshold),threshold>=0,threshold<=100)
  stopifnot(length(samples) > 0L)
  m <- as.matrix(df[,samples,drop=FALSE])
  observed <- is.finite(m) & m>0
  keep <- rep(TRUE,nrow(df))
  if(drop_absent) keep <- rowSums(observed)>0
  if(threshold>0) {
    if(scope=='group') {
      if (is.null(metadata) || !all(c('FullName', 'Group1', 'Group2') %in% names(metadata)) ||
          !all(samples %in% metadata$FullName))
        stop('Group-based detection needs confirmed condition and tissue metadata for all selected samples.')
      md <- metadata[match(samples,metadata$FullName),,drop=FALSE]
      groups <- interaction(md$Group1,md$Group2,drop=TRUE)
      fractions <- vapply(split(seq_along(samples),groups),
                          function(j) rowMeans(observed[,j,drop=FALSE]), numeric(nrow(df)))
      keep <- keep & apply(fractions,1,max)>=threshold/100
    } else keep <- keep & rowMeans(observed)>=threshold/100
  }
  list(keep=keep, observed=observed, input=nrow(df), retained=sum(keep),
       excluded=sum(!keep), samples=length(samples), all_absent=sum(rowSums(observed)==0),
       threshold=threshold, scope=scope,
       retained_missing=if (any(keep)) mean(!observed[keep,,drop=FALSE]) else NA_real_)
}

ux_filter_detected <- function(df, samples, threshold=0, drop_absent=TRUE, scope='global', metadata=NULL) {
  preview <- ux_detection_preview(df, samples, threshold, drop_absent, scope, metadata)
  keep <- preview$keep
  observed <- preview$observed
  if(preview$retained<2L) stop('Fewer than two lipids pass the detection filter. Lower the threshold or review the samples.')
  retained <- df[keep,,drop=FALSE]
  # CSV imports are data.frames; filtering leaves non-sequential row names.
  # Lipid_Name is the identifier used by downstream matrix conversion.
  rownames(retained) <- NULL
  list(data=retained, audit=list(input=preview$input,retained=preview$retained,excluded=preview$excluded,
    samples=preview$samples,all_absent=preview$all_absent,threshold=threshold,scope=scope,
    raw_missing=mean(!observed),retained_missing=preview$retained_missing))
}

