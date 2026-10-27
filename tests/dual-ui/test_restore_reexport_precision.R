source("R/global.R")

fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
stopifnot(file.exists(fixture))
threshold <- 0.0000123456

for (policy in c("classic", "team")) {
  settings <- shiny::reactiveVal(list(imputationSeed = 42L, useImputation = FALSE,
                                      normalizationMethod = "none"))
  shiny::testServer(shared_data_server, args = list(
    external_settings = shiny::reactive(settings()),
    preparation_policy = policy,
    design_check = if (policy == "team") function() FALSE else NULL
  ), {
    session$setInputs(import_session_file = data.frame(
      name = "session.zip", size = file.info(fixture)$size,
      type = "application/zip", datapath = fixture))
    for (i in seq_len(10L)) session$flushReact()
    stopifnot(isTRUE(session_restored()),
              is.null(preparation$state()$applied),
              identical(restored_preparation_seed(), 7L))

    session$setInputs(pFilterThreshold = threshold,
                      minDetectionPct = 33.33333333333334)
    exported <- read_session_archive(output$export_session_btn)
    stopifnot(identical(as.integer(exported$state$preparation_contract$imputation_seed), 7L),
              isTRUE(all.equal(exported$state$inputs$pFilterThreshold, threshold,
                               tolerance = 0)),
              isTRUE(all.equal(exported$state$inputs$minDetectionPct,
                               33.33333333333334, tolerance = 0)))
    unlink(exported$directory, recursive = TRUE)
  })
}

# A malformed optional seed must fail before replacing the current session.
tmp <- tempfile("malformed-seed-")
dir.create(tmp)
utils::unzip(fixture, exdir = tmp)
state_path <- file.path(tmp, "state.json")
state <- jsonlite::read_json(state_path, simplifyVector = FALSE)
state$preparation_contract$imputation_seed <- "bad"
jsonlite::write_json(state, state_path, auto_unbox = TRUE, pretty = TRUE, digits = NA)
malformed <- tempfile(fileext = ".zip")
old_wd <- getwd()
setwd(tmp)
zip::zipr(malformed, c("state.json", "shared-state-v1.json", "data_files"))
setwd(old_wd)

settings <- shiny::reactiveVal(list(imputationSeed = 42L, useImputation = FALSE,
                                    normalizationMethod = "none"))
shiny::testServer(shared_data_server, args = list(
  external_settings = shiny::reactive(settings()),
  preparation_policy = "classic"
), {
  session$setInputs(import_session_file = data.frame(
    name = "good.zip", size = file.info(fixture)$size,
    type = "application/zip", datapath = fixture))
  for (i in seq_len(10L)) session$flushReact()
  previous_uploads <- rv$uploads
  stopifnot(isTRUE(session_restored()), identical(restored_preparation_seed(), 7L))

  extracted_dirs <- function() {
    dirs <- list.dirs(tempdir(), recursive = FALSE, full.names = TRUE)
    dirs[startsWith(basename(dirs), "lipidomic-session-")]
  }
  before_bad_import <- extracted_dirs()
  session$setInputs(import_session_file = data.frame(
    name = "bad.zip", size = file.info(malformed)$size,
    type = "application/zip", datapath = malformed))
  session$flushReact()
  stopifnot(isTRUE(session_restored()),
            identical(restored_preparation_seed(), 7L),
            identical(rv$uploads, previous_uploads),
            !length(setdiff(extracted_dirs(), before_bad_import)),
            grepl("Invalid imputation seed", output$import_status_display$html,
                  fixed = TRUE))
})
unlink(c(tmp, malformed), recursive = TRUE)

cat("PASS: restored seed and numeric controls survive immediate ZIP re-export; invalid seed leaves session intact\n")
