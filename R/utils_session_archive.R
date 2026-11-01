# Keep archived dataset names independent of their temporary filesystem names.
# This prevents repeated restore/export cycles from nesting temp prefixes.
team_session_archive_dataset_name <- function(upload_name, index) {
  if (!is.character(upload_name) || length(upload_name) != 1L || is.na(upload_name) ||
      !is.numeric(index) || length(index) != 1L || !is.finite(index) || index < 1 || index != as.integer(index))
    stop("Invalid dataset archive name.")
  ext <- tolower(tools::file_ext(upload_name))
  if (!grepl("^[a-z0-9]{1,12}$", ext)) ext <- ""
  suffix <- if (nzchar(ext)) paste0(".", ext) else ""
  paste0("dataset-", sprintf("%03d", as.integer(index)), "-",
    substr(digest::digest(upload_name, algo="sha256", serialize=FALSE), 1L, 16L), suffix)
}

session_archive_dataset_name <- function(upload_name, path, index, policy) {
  if (identical(policy,"team")) return(team_session_archive_dataset_name(upload_name,index))
  if (identical(policy,"classic")) return(basename(path))
  stop("Invalid session archive policy.")
}

team_session_restored_dataset_path <- function(dest_dir, archive_path) {
  if (!is.character(dest_dir) || length(dest_dir) != 1L || !dir.exists(dest_dir) ||
      !is.character(archive_path) || length(archive_path) != 1L || is.na(archive_path))
    stop("Invalid restored dataset path.")
  ext <- tolower(tools::file_ext(archive_path))
  if (!grepl("^[a-z0-9]{1,12}$", ext)) ext <- ""
  tempfile("dataset-", tmpdir=dest_dir, fileext=if(nzchar(ext)) paste0(".",ext) else "")
}

session_restored_dataset_path <- function(dest_dir, archive_path, policy) {
  if (identical(policy,"team")) return(team_session_restored_dataset_path(dest_dir,archive_path))
  if (identical(policy,"classic")) return(tempfile("dataset-",tmpdir=dest_dir,fileext=paste0("-",basename(archive_path))))
  stop("Invalid session archive policy.")
}

# R's unz() cannot address ZIP member names longer than 255 bytes. For this
# legacy case, stream through the system unzip reader without extracting paths
# or attributes. The restricted member alphabet prevents wildcard expansion.
session_archive_member_connection <- function(path, name, allow_long = FALSE) {
  if (nchar(name, type="bytes") <= 255L) return(unz(path,name,open="rb"))
  if (!isTRUE(allow_long)) stop("Long dataset names are not supported for this session archive mode.")
  if (!grepl("^[A-Za-z0-9._/-]+$",name) || grepl("(^|/)-",name))
    stop("Long dataset paths in this archive are not portable.")
  unzip_bin <- Sys.which("unzip")
  if (!nzchar(unzip_bin)) stop("This runtime cannot read a long dataset name from the session archive.")
  archive_path <- normalizePath(path,mustWork=TRUE)
  command <- paste(shQuote(unzip_bin),"-p",shQuote(archive_path),shQuote(name))
  pipe(command,open="rb")
}

# Session archive boundary. Validate paths and sizes before extracting anything.
read_session_archive <- function(path, max_bytes = 512 * 1024^2, include_team_canvas = FALSE,
                                 metadata_decoder = metadata_sidecar_decode) {
  entries <- zip::zip_list(path)
  safe <- function(x) is.character(x) && all(!is.na(x) & nzchar(x) &
    !grepl('(^/|^[A-Za-z]:|\\\\|(^|/)\\.\\.(/|$))', x))
  if (!nrow(entries) || nrow(entries)>10000L || !safe(entries$filename) ||
      anyDuplicated(entries$filename) || any(!is.finite(entries$uncompressed_size)) ||
      any(entries$uncompressed_size<0) || sum(entries$uncompressed_size)>max_bytes)
    stop('Unsafe or oversized session archive.')
  parts <- strsplit(sub('/$', '', entries$filename), '/', fixed=TRUE)
  canonical<-tolower(stringi::stri_trans_nfc(entries$filename))
  if(anyDuplicated(canonical) || any(grepl(':',entries$filename,fixed=TRUE)) ||
     any(vapply(parts,function(p)any(grepl('[. ]$',p) | grepl('^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])([.]|$)',toupper(p))),logical(1))))
    stop('Ambiguous or nonportable archive paths.')
  if (any(vapply(parts,function(p) any(p %in% c('', '.', '..')),logical(1)))) stop('Noncanonical archive paths are not supported.')
  if (!'state.json' %in% entries$filename) stop('state.json not found in session archive.')
  if (entries$uncompressed_size[entries$filename=='state.json']>20*1024^2) stop('Session state exceeds 20 MiB.')
  if (isTRUE(include_team_canvas) && 'team-canvas-v1.json' %in% entries$filename &&
      entries$uncompressed_size[entries$filename=='team-canvas-v1.json'] > 24 * 1024^2)
    stop('Figure canvas state exceeds 24 MiB.')
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
      input <- session_archive_member_connection(path,name,allow_long=isTRUE(include_team_canvas))
      input_closed <- FALSE
      on.exit(if(!input_closed) close(input))
      output <- file(target,open='wb');on.exit(close(output),add=TRUE)
      n <- 0
      repeat {
        chunk <- readBin(input,'raw',n=1024L*1024L)
        if (!length(chunk)) break
        n <- n+length(chunk)
        if (total+n>max_bytes || n>entries$uncompressed_size[i]) stop('Archive exceeds its allowed size.')
        writeBin(chunk,output)
      }
      input_status <- close(input); input_closed <- TRUE
      if(inherits(input,"pipe") && (!length(input_status) || !identical(as.integer(input_status),0L)))
        stop("Could not read a dataset from the session archive.")
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
  if(any(dir.exists(file.path(dest,paths))))stop('Dataset paths must refer to files, not directories.')
  sidecar <- NULL
  if (file.exists(file.path(dest,'shared-state-v1.json'))) {
    sidecar <- jsonlite::read_json(file.path(dest,'shared-state-v1.json'),simplifyVector=TRUE)
    if (!identical(sidecar$version, '1')) stop('Unsupported shared session version.')
    sidecar$metadata <- metadata_decoder(sidecar$metadata)
  }
  canvas <- NULL
  if (isTRUE(include_team_canvas) && file.exists(file.path(dest, 'team-canvas-v1.json')))
    canvas <- team_canvas_read(file.path(dest, 'team-canvas-v1.json'))
  success <- TRUE
  list(directory=dest,state=state,shared=sidecar,canvas=canvas)
}

metadata_sidecar_encode <- function(metadata) {
  if (is.null(metadata)) return(NULL)
  metadata$mappings <- as.list(metadata$mappings)
  metadata
}
metadata_sidecar_decode <- function(metadata) {
  # Older exports encoded absent metadata as {}; newer ones use JSON null.
  if (is.null(metadata) || (is.list(metadata) && !length(metadata))) return(NULL)
  if (!identical(metadata$version,'0.1')) stop('Unsupported metadata version.')
  mapping <- unlist(metadata$mappings, use.names=TRUE)
  if (length(mapping) && is.null(names(mapping))) stop('Metadata mappings must preserve their target names.')
  stage <- stage_metadata_v01(metadata$display_metadata,metadata$scientific_metadata$FullName,mapping)
  confirm_metadata_v01(stage,TRUE)
}
