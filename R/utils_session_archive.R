# Session archive boundary. Validate paths and sizes before extracting anything.
read_session_archive <- function(path, max_bytes = 512 * 1024^2) {
  entries <- zip::zip_list(path)
  safe <- function(x) is.character(x) && all(!is.na(x) & nzchar(x) &
    !grepl('(^/|^[A-Za-z]:|\\\\|(^|/)\\.\\.(/|$))', x))
  if (!nrow(entries) || nrow(entries)>10000L || !safe(entries$filename) ||
      anyDuplicated(entries$filename) || any(!is.finite(entries$uncompressed_size)) ||
      any(entries$uncompressed_size<0) || sum(entries$uncompressed_size)>max_bytes)
    stop('Unsafe or oversized session archive.')
  parts <- strsplit(sub('/$', '', entries$filename), '/', fixed=TRUE)
  if (any(vapply(parts,function(p) any(p %in% c('', '.', '..')),logical(1)))) stop('Noncanonical archive paths are not supported.')
  if (!'state.json' %in% entries$filename) stop('state.json not found in session archive.')
  if (entries$uncompressed_size[entries$filename=='state.json']>20*1024^2) stop('Session state exceeds 20 MiB.')
  dest <- tempfile('lipidomic-session-');dir.create(dest)
  success <- FALSE;on.exit(if(!success) unlink(dest,recursive=TRUE))
  # zip_list exposes permission bits but not reliable Unix file-type bits. Stream
  # every entry into a newly created REGULAR file; never restore links/attributes.
  # Enforce actual streamed size too, not only the archive's declared size.
  total <- 0
  for (i in seq_len(nrow(entries))) {
    name <- entries$filename[i]; target <- file.path(dest,name)
    if (endsWith(name,'/')) {
      if (!dir.exists(target) && !dir.create(target,recursive=TRUE)) stop('Invalid archive directory.')
      next
    }
    parent <- dirname(target)
    if (!dir.exists(parent) && !dir.create(parent,recursive=TRUE)) stop('Invalid archive file hierarchy.')
    size <- (function() {
      input <- unz(path,name,open='rb');on.exit(close(input))
      output <- file(target,open='wb');on.exit(close(output),add=TRUE)
      n <- 0
      repeat {
        chunk <- readBin(input,'raw',n=1024L*1024L)
        if (!length(chunk)) break
        n <- n+length(chunk)
        if (total+n>max_bytes || n>entries$uncompressed_size[i]) stop('Archive exceeds its allowed size.')
        writeBin(chunk,output)
      }
      n
    })()
    if (size!=entries$uncompressed_size[i]) stop('Truncated archive entry.')
    total <- total+size
  }
  state <- jsonlite::read_json(file.path(dest,'state.json'),simplifyVector=TRUE)
  if (!is.list(state) || !is.list(state$uploads) || !length(state$uploads) ||
      is.null(names(state$uploads)) || anyDuplicated(names(state$uploads))) stop('Invalid session file list.')
  paths <- unlist(state$uploads,use.names=FALSE)
  if (length(paths)!=length(state$uploads) || !safe(paths)) stop('Invalid session dataset paths.')
  sidecar <- NULL
  if (file.exists(file.path(dest,'shared-state-v1.json'))) {
    sidecar <- jsonlite::read_json(file.path(dest,'shared-state-v1.json'),simplifyVector=TRUE)
    if (!identical(sidecar$version, '1')) stop('Unsupported shared session version.')
    sidecar$metadata <- metadata_sidecar_decode(sidecar$metadata)
  }
  success <- TRUE
  list(directory=dest,state=state,shared=sidecar)
}

metadata_sidecar_encode <- function(metadata) {
  if (is.null(metadata)) return(NULL)
  metadata$mappings <- as.list(metadata$mappings)
  metadata
}
metadata_sidecar_decode <- function(metadata) {
  if (is.null(metadata)) return(NULL)
  if (!identical(metadata$version,'0.1')) stop('Unsupported metadata version.')
  mapping <- unlist(metadata$mappings, use.names=TRUE)
  if (length(mapping) && is.null(names(mapping))) stop('Metadata mappings must preserve their target names.')
  stage <- stage_metadata_v01(metadata$display_metadata,metadata$scientific_metadata$FullName,mapping)
  confirm_metadata_v01(stage,TRUE)
}
