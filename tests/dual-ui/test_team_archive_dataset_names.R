source("R/utils_session_archive.R")
source("R/modules/1_shared_data_module.R")

stopifnot(is.null(team_restore_seed_input(list(main_navbar="Share",keep="value"),NULL,"team")$main_navbar),
  identical(team_restore_seed_input(list(main_navbar="Share"),NULL,"classic")$main_navbar,"Share"))
stopifnot(grepl("^dataset-001-[a-f0-9]{16}\\.csv$",
    session_archive_dataset_name("abundance.csv","/tmp/old-temp-basename.csv",1L,"team")),
  identical(session_archive_dataset_name("abundance.csv","/tmp/old-temp-basename.csv",1L,"classic"),
    "old-temp-basename.csv"))

stage_zip <- function(upload_name, bytes) {
  stage <- tempfile("session-stage-"); dir.create(stage)
  dir.create(file.path(stage, "data_files"))
  writeBin(bytes, file.path(stage, "data_files", upload_name))
  state <- list(uploads = list(`abundance.csv` = file.path("data_files", upload_name)))
  jsonlite::write_json(state, file.path(stage, "state.json"), auto_unbox = TRUE, pretty = TRUE)
  archive <- tempfile(fileext = ".zip")
  zip::zipr(archive, c("state.json", "data_files"), root = stage)
  list(stage = stage, archive = archive)
}

bytes <- charToRaw("Lipid_Name,S1\nPC(34:1),1\n")
legacy_name <- paste0(strrep("d", 246L), ".csv")
current <- stage_zip(legacy_name, bytes)
unlink(current$stage, recursive = TRUE)

for (cycle in seq_len(8L)) {
  restored <- read_session_archive(current$archive, include_team_canvas = TRUE)
  source_path <- file.path(restored$directory, restored$state$uploads[["abundance.csv"]])
  stopifnot(identical(readBin(source_path, "raw", n = file.info(source_path)$size), bytes))
  private <- tempfile("restored-data-"); dir.create(private)
  restored_path <- team_session_restored_dataset_path(private, source_path)
  stopifnot(file.copy(source_path, restored_path), nchar(basename(restored_path)) < 80L)
  compact_name <- team_session_archive_dataset_name("abundance.csv", 1L)
  next_stage <- tempfile("session-stage-"); dir.create(next_stage)
  dir.create(file.path(next_stage, "data_files"))
  stopifnot(file.copy(restored_path, file.path(next_stage, "data_files", compact_name)))
  jsonlite::write_json(list(uploads = list(`abundance.csv` = file.path("data_files", compact_name))),
    file.path(next_stage, "state.json"), auto_unbox = TRUE, pretty = TRUE)
  next_archive <- tempfile(fileext = ".zip")
  zip::zipr(next_archive, c("state.json", "data_files"), root = next_stage)
  checked <- read_session_archive(next_archive, include_team_canvas = TRUE)
  ref <- checked$state$uploads[["abundance.csv"]]
  stopifnot(nchar(basename(ref)) < 64L,
    identical(readBin(file.path(checked$directory, ref), "raw", n = length(bytes)), bytes))
  unlink(c(restored$directory, private, next_stage), recursive = TRUE)
  if (cycle > 1L) unlink(current$archive)
  current <- list(stage = next_stage, archive = next_archive)
  unlink(checked$directory, recursive = TRUE)
}

unlink(current$archive)
cat("PASS: long legacy dataset paths restore and remain compact across repeated checkpoint cycles\n")

# Long-name streaming must reject unzip patterns, shell metacharacters and option-like
# path components before invoking the external reader. Classic never enables it.
long_prefix <- paste0('data_files/', strrep('a', 250L))
for (bad in c(paste0(long_prefix, '*.csv'), paste0(long_prefix, '?.csv'),
              paste0(long_prefix, '[a].csv'), paste0(long_prefix, "'x.csv"),
              paste0(long_prefix, ';x.csv'), paste0(long_prefix, '/-x.csv'))) {
  stopifnot(inherits(try(session_archive_member_connection(current$archive, bad, TRUE), silent=TRUE), 'try-error'))
}
stopifnot(inherits(try(session_archive_member_connection(current$archive, paste0(long_prefix, '.csv'), FALSE), silent=TRUE), 'try-error'))
cat('PASS: long paths reject wildcard, shell and option patterns; Classic fallback stays disabled\n')
