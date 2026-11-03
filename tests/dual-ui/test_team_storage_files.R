# Files backend: per-project folders, atomic writes, sha256 integrity, no traversal.
for (f in c('storage.R','storage_files.R')) source(file.path('R/frontends/team/storage',f))
expect_error <- function(expr, pattern) {
  msg <- tryCatch({force(expr); NULL}, error=conditionMessage)
  if (is.null(msg) || !grepl(pattern, msg, fixed=TRUE)) stop('Expected error containing: ', pattern, ' got: ', format(msg))
}
root <- tempfile('team-storage-files-')
store <- team_storage_files(root)
make_zip <- function(text) { d <- tempfile(); dir.create(d); writeLines(text, file.path(d,'state.json'))
  p <- tempfile(fileext='.zip'); zip::zipr(p, 'state.json', root=d); unlink(d, recursive=TRUE); p }
a <- make_zip('{"a":1}'); b <- make_zip('{"b":2}')

stopifnot(identical(store$list('alpha'), list()))
r1 <- store$save('alpha', a, 'First checkpoint')
stopifnot(identical(r1$id, digest::digest(file=a, algo='sha256')), identical(r1$sha256, r1$id),
  identical(r1$name, 'First checkpoint.zip'), identical(r1$project, 'alpha'), r1$size_bytes == file.info(a)$size)
pdir <- file.path(root, 'projects', 'alpha')
stopifnot(dir.exists(pdir), file.exists(file.path(pdir, paste0(r1$id, c('.zip','.json')))))
if (.Platform$OS.type == 'unix') stopifnot(
  identical(as.character(file.info(pdir)$mode), '700'),
  identical(as.character(file.info(file.path(pdir, paste0(r1$id,'.zip')))$mode), '600'))
Sys.sleep(0.01)
r2 <- store$save('alpha', b, 'Second')
# Idempotent: same bytes return the original record (first label wins, like the database).
again <- store$save('alpha', a, 'Renamed duplicate')
stopifnot(identical(again, r1))
listed <- store$list('alpha')
stopifnot(length(listed) == 2L, identical(listed[[1]]$id, r2$id), identical(listed[[2]]$id, r1$id))
# No temporary files remain after atomic writes.
stopifnot(!length(list.files(pdir, pattern='^\\.tmp-', all.files=TRUE)))

# Load returns a verified copy, at a caller-chosen or temporary path.
out <- store$load('alpha', r1$id)
stopifnot(file.exists(out), identical(digest::digest(file=out, algo='sha256'), r1$id))
dest <- file.path(tempfile('dest-'), 'copy.zip')
stopifnot(identical(store$load('alpha', r2$id, dest), dest), identical(digest::digest(file=dest, algo='sha256'), r2$id))

# Per-project isolation: a checkpoint id from one project is not visible in another.
stopifnot(identical(store$list('beta'), list()))
expect_error(store$load('beta', r1$id), 'Checkpoint not found')
expect_error(store$delete('beta', r1$id), 'Checkpoint not found')

# Integrity: tampered bytes are rejected on load and the destination is not written.
zpath <- file.path(pdir, paste0(r1$id, '.zip'))
original <- readBin(zpath, 'raw', n=file.info(zpath)$size)
tampered <- original; tampered[length(tampered)] <- as.raw(bitwXor(as.integer(tampered[length(tampered)]), 1L)); writeBin(tampered, zpath)
target <- tempfile(fileext='.zip')
expect_error(store$load('alpha', r1$id, target), 'Checkpoint integrity check failed')
stopifnot(!file.exists(target))
# Re-saving the genuine bytes repairs the stored copy instead of trusting it.
invisible(store$save("alpha", a, "Repair")); stopifnot(identical(readBin(zpath, 'raw', n=file.info(zpath)$size), original))
# Metadata pointing at other bytes is rejected.
meta <- file.path(pdir, paste0(r1$id, '.json')); good_meta <- readLines(meta, warn=FALSE)
writeLines(gsub(r1$id, r2$id, good_meta, fixed=TRUE), meta)
expect_error(store$load('alpha', r1$id), 'metadata is invalid')
listed <- suppressWarnings(store$list('alpha')); stopifnot(length(listed) == 1L, identical(listed[[1]]$id, r2$id))
writeLines(good_meta, meta)

# Interrupted save (ZIP written, metadata not yet) stays invisible.
c_zip <- make_zip('{"c":3}'); cid <- digest::digest(file=c_zip, algo='sha256')
invisible(file.copy(c_zip, file.path(pdir, paste0(cid, '.zip'))))
stopifnot(length(store$list('alpha')) == 2L)
expect_error(store$load('alpha', cid), 'Checkpoint not found')
stopifnot(identical(store$save('alpha', c_zip, 'Recovered')$id, cid), length(store$list('alpha')) == 3L)

# Traversal attempts never escape the root (validated before any path is built).
outside <- file.path(dirname(root), 'escaped'); 
for (p in c('../escaped', '..', 'alpha/../../escaped')) expect_error(store$save(p, a, 'x'), 'Invalid project')
stopifnot(!file.exists(outside))
stopifnot(identical(sort(list.files(file.path(root,'projects'))), 'alpha'))

# Delete removes the listing entry and the bytes.
store$delete('alpha', r2$id)
stopifnot(!file.exists(file.path(pdir, paste0(r2$id, c('.zip','.json')))), length(store$list('alpha')) == 2L)
expect_error(store$delete('alpha', r2$id), 'Checkpoint not found')
expect_error(store$load('alpha', r2$id), 'Checkpoint not found')

# A second store on the same root sees the same data (restart persistence).
stopifnot(identical(team_storage_files(root)$list('alpha'), store$list('alpha')))
unlink(c(root, a, b, c_zip, out, dirname(dest)), recursive=TRUE)
cat('PASS: files backend roundtrip, idempotent content-addressed saves, 0700/0600 per-project folders, atomic writes, sha256 tamper rejection, interrupted-save invisibility, project isolation, traversal rejection, delete\n')
