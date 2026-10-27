# Proposal 0.1. Standalone, deliberately not sourced by app.R or the shared hub.
# No settings, reactive values, files, or global state are changed by the adapters.
read_sample_metadata_v01 <- function(path) {
  if (!file.exists(path) || file.info(path)$size > 20 * 1024^2) stop('CSV missing or larger than 20 MiB.')
  x <- read.csv(path, colClasses='character', check.names=FALSE, na.strings=character(),
                fileEncoding='UTF-8-BOM', strip.white=FALSE, comment.char='', row.names=NULL)
  if (nrow(x)>100000L || ncol(x)>200L) stop('Metadata exceeds prototype limits.')
  x
}
validate_sample_metadata_v01 <- function(x, matrix_ids, paired=FALSE) {
  errors <- character(); warnings <- character()
  add <- function(s) errors <<- c(errors,s)
  blank <- function(z) is.na(z) | !nzchar(trimws(z))
  if (!is.character(matrix_ids) || !length(matrix_ids) || any(blank(matrix_ids)) || anyDuplicated(matrix_ids)) add('Matrix sample IDs must be unique nonempty strings.')
  if (!is.data.frame(x) || !nrow(x)) return(list(valid=FALSE,errors='Metadata must contain rows.',warnings=warnings,data=NULL))
  if (anyDuplicated(names(x)) || any(blank(names(x)))) add('Column names must be unique and nonempty.')
  if (any(!vapply(x,is.character,logical(1)))) add('Read every column as text; numeric coercion can destroy identifiers.')
  if (!'SampleID' %in% names(x)) add('Required column: SampleID.')
  if (length(errors)) return(list(valid=FALSE,errors=errors,warnings=warnings,data=NULL))
  ids <- x$SampleID
  if (any(blank(ids))) add('SampleID cannot be blank.')
  if (anyDuplicated(ids)) add('SampleID must identify one matrix column, not a donor or group.')
  if (any(!is.na(ids) & ids != trimws(ids))) add('SampleID contains surrounding whitespace; review it explicitly.')
  missing <- setdiff(matrix_ids,ids); extra <- setdiff(ids,matrix_ids)
  if (length(missing)) add(paste('Missing matrix samples:',paste(missing,collapse=', ')))
  if (length(extra)) add(paste('Unmatched metadata rows:',paste(extra,collapse=', ')))
  if ('SampleType' %in% names(x) && any(!x$SampleType %in% c('study','pooled_qc','blank','standard'))) add('SampleType must be study, pooled_qc, blank, or standard.')
  if ('TimeValue' %in% names(x)) {
    v <- suppressWarnings(as.numeric(x$TimeValue)); populated <- !blank(x$TimeValue)
    if (any(populated & !is.finite(v))) add('Populated TimeValue must be finite numeric text.')
    if (!'TimeUnit' %in% names(x) || any(populated & blank(x$TimeUnit))) add('Populated TimeValue requires TimeUnit.')
  }
  if (all(c('Condition','Batch') %in% names(x))) {
    z <- unique(x[,c('Condition','Batch'),drop=FALSE]); z <- z[complete.cases(z) & nzchar(z$Batch),,drop=FALSE]
    if (length(unique(z$Condition))>1L && all(table(z$Batch)==1L)) warnings <- c(warnings,'Batch and condition may be confounded; inspect the design before modeling.')
  }
  if (paired) {
    if (!all(c('SubjectID','Condition') %in% names(x))) add('Paired comparison requires explicit SubjectID and Condition.')
    else if (any(blank(x$SubjectID)) || any(blank(x$Condition))) add('Paired identifiers and conditions cannot be blank.')
    else {
      if (length(unique(x$Condition))!=2L) add('This paired prototype supports exactly two conditions.')
      tab <- table(x$SubjectID,x$Condition)
      if (any(tab!=1L)) add('Pairs are incomplete or repeated; select visits / resolve technical replicates explicitly first.')
    }
  } else if ('SubjectID' %in% names(x) && anyDuplicated(x$SubjectID[!blank(x$SubjectID)])) {
    warnings <- c(warnings,'Repeated SubjectID: review pairing, visits, and technical replicates; no model is selected automatically.')
  }
  list(valid=!length(errors),errors=errors,warnings=warnings,
       data=if(length(errors)) NULL else x[match(matrix_ids,ids),,drop=FALSE])
}
stage_metadata_v01 <- function(x, matrix_ids, mappings=character(), paired=FALSE) {
  v <- validate_sample_metadata_v01(x,matrix_ids,paired)
  allowed <- c('Group1','Group2','Replicate','PatientNumber','TimePoint')
  if (length(mappings)) {
    if (!is.character(mappings) || is.null(names(mappings)) || anyDuplicated(names(mappings)) ||
        !all(names(mappings) %in% allowed) || anyDuplicated(unname(mappings)) || !all(mappings %in% names(x))) stop('Choose unique existing source columns and supported hub targets.')
    if (any(vapply(x[unname(mappings)],function(z) any(is.na(z) | !nzchar(trimws(z))),logical(1)))) stop('Mapped scientific columns cannot contain blank values.')
  }
  if ('TimePoint' %in% names(mappings) && identical(unname(mappings['TimePoint']),'TimeValue') && 'TimeUnit' %in% names(x) && length(unique(x$TimeUnit))>1L) stop('Convert mixed time units explicitly before mapping TimeValue.')
  # Always includes the full original metadata for display/export as a separate table.
  list(version='0.1',validation=v,mappings=mappings,matrix_ids=matrix_ids,paired=paired,original=x)
}
confirm_metadata_v01 <- function(stage, confirmed=FALSE, format=c('hub','parsed_terms')) {
  if (!isTRUE(confirmed)) stop('Explicit confirmation is required before applying scientific metadata.')
  # Revalidate the exact staged payload; callers must invalidate confirmation if the UI changes it.
  fresh <- stage_metadata_v01(stage$original,stage$matrix_ids,stage$mappings,stage$paired)
  if (!fresh$validation$valid) stop(paste(fresh$validation$errors,collapse='; '))
  x <- fresh$validation$data
  hub <- data.frame(FullName=x$SampleID,stringsAsFactors=FALSE,check.names=FALSE)
  for (target in names(fresh$mappings)) hub[[target]] <- x[[fresh$mappings[[target]]]]
  if (match.arg(format)=='parsed_terms') {
    if (any(vapply(hub[-1],function(z) any(grepl('SHIELD',z,fixed=TRUE)),logical(1)))) stop('Legacy parser rewrites literal SHIELD tokens; use hub adapter until agreed escaping exists.')
    rename <- c(Group1='Group1Term',Group2='Group2Term',Replicate='ReplicateTerm',PatientNumber='PatientTerm',TimePoint='TimePointTerm')
    for (name in intersect(names(hub),names(rename))) names(hub)[names(hub)==name] <- rename[[name]]
  }
  list(version='0.1',scientific_metadata=hub,display_metadata=x,mappings=fresh$mappings,
       warnings=fresh$validation$warnings)
}
