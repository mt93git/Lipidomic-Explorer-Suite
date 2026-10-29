source("R/global.R")

fixture <- normalizePath("tests/guided-shared/fixtures/abundance.csv")
ids <- names(utils::read.csv(fixture, check.names = FALSE))[-1L]
settings_for <- function() shiny::reactiveVal(list(
  useImputation = FALSE, normalizationMethod = "none", imputationSeed = 11L))

for (policy in c("classic", "team")) {
  settings <- settings_for()
  exported_zip <- tempfile(fileext = ".zip")
  expected_raw <- NULL
  shiny::testServer(shared_data_server, args = list(
    external_settings = shiny::reactive(settings()), preparation_policy = policy,
    design_check = if (policy == "team") function() FALSE else NULL
  ), {
    session$setInputs(files = data.frame(name = "synthetic.csv",
      size = file.info(fixture)$size, type = "text/csv", datapath = fixture),
      selectedColumns = ids)
    session$flushReact()
    expected_raw <<- rawData()$data
    stopifnot(is.null(external_metadata()), is.null(preparation$state()$applied),
              is.data.frame(expected_raw))
    stopifnot(file.copy(output$export_session_btn, exported_zip))
  })

  extracted <- tempfile("no-metadata-"); dir.create(extracted)
  utils::unzip(exported_zip, exdir = extracted)
  sidecar_text <- paste(readLines(file.path(extracted, "shared-state-v1.json"), warn = FALSE), collapse = "\n")
  stopifnot(grepl('"metadata"[[:space:]]*:[[:space:]]*null', sidecar_text))
  archive <- read_session_archive(exported_zip)
  archived_file <- file.path(archive$directory, unlist(archive$state$uploads, use.names = FALSE)[[1L]])
  stopifnot(is.null(archive$shared$metadata),
            identical(readBin(archived_file, "raw", file.info(fixture)$size),
                      readBin(fixture, "raw", file.info(fixture)$size)))
  unlink(archive$directory, recursive = TRUE)

  restored_settings <- settings_for()
  shiny::testServer(shared_data_server, args = list(
    external_settings = shiny::reactive(restored_settings()), preparation_policy = policy,
    design_check = if (policy == "team") function() FALSE else NULL
  ), {
    session$setInputs(import_session_file = data.frame(name = "session.zip",
      size = file.info(exported_zip)$size, type = "application/zip", datapath = exported_zip))
    for (i in seq_len(10L)) session$flushReact()
    stopifnot(isTRUE(session_restored()), is.null(external_metadata()),
              identical(rawData()$data, expected_raw),
              identical(is.null(preparation$state()$applied), policy == "team"))
  })

  # A previously exported absent metadata object ({}) remains readable.
  sidecar <- jsonlite::read_json(file.path(extracted, "shared-state-v1.json"), simplifyVector = FALSE)
  sidecar$metadata <- list()
  jsonlite::write_json(sidecar, file.path(extracted, "shared-state-v1.json"), auto_unbox = TRUE)
  legacy_zip <- tempfile(fileext = ".zip")
  zip::zipr(legacy_zip, c("state.json", "shared-state-v1.json", "data_files"), root = extracted)
  legacy <- read_session_archive(legacy_zip)
  stopifnot(is.null(legacy$shared$metadata))
  unlink(c(legacy$directory, legacy_zip, extracted, exported_zip), recursive = TRUE)
}

cat("PASS: Classic and Team ZIPs round-trip exact synthetic data without metadata; legacy empty sidecars remain readable\n")
