if (!requireNamespace("xml2", quietly = TRUE)) { cat("SKIP test_api_validation_note: package xml2 not installed\n"); quit(status = 0) }
for (pkg in c("jsonlite", "zip")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_validation_note")
source("frontends/nexo-api/engine.R")
# NEXO-P6 item 2. When Team's plot stops with a validate(need()) message (or draws only its grey BQC sentence), Team
# shows a small grey note and the card is up to date. The render's 422 says so (note = TRUE) so Nexo shows a note, not
# an error; a module's own R error stays an error.
fixture <- "tests/dual-ui/fixtures/nexo-complete-synthetic.zip"
dir <- tempfile("validation-note-"); dir.create(dir); utils::unzip(fixture, exdir = dir)
state <- jsonlite::read_json(file.path(dir, "state.json"))
# One principal component: Team's guided QC plot stops with validate(need(...)) (R/modules/2_qc_boxplot_module.R guided_scores).
state$inputs[["qc_pca_tab-maxPCs"]] <- 1
jsonlite::write_json(state, file.path(dir, "state.json"), auto_unbox = TRUE, null = "null", digits = NA)
zip <- tempfile("validation-note-", fileext = ".zip"); zip::zipr(zip, list.files(dir, full.names = TRUE))
s <- api_session_for_checkpoint(zip)
on.exit(api_session_close(s), add = TRUE)
caught <- function(expr) tryCatch({ expr; NULL }, error = identity)

guided <- api_card_create(s, "qc_pca_tab-guided_qc_plot")
e <- caught(api_card_render(s, guided$instanceId, 620, 380))
if (is.null(e) || !inherits(e, "api_unprocessable") || !grepl("PCA needs at least two usable components", conditionMessage(e), fixed = TRUE))
  stop("guided QC with one component did not answer Team's validation message: ", if (is.null(e)) "drew" else conditionMessage(e))
if (!isTRUE(e$note)) stop("Team's validation message is answered as an error, not a note: ", conditionMessage(e))
cat("PASS validate(need()) answers a note:", conditionMessage(e), "\n")

source("frontends/nexo-api/plumber.R", local = (http <- new.env()))
res <- new.env(); res$status <- 200L
body <- http$api_handle(res, api_card_render(s, guided$instanceId, 620, 380))
stopifnot(identical(res$status, 422L), identical(body$error, "unprocessable"), isTRUE(body$note),
  identical(body$message, conditionMessage(e)))
cat("PASS the HTTP answer is 422 with note: true\n")

bqc <- api_card_create(s, "qc_pca_tab-bqcPlot")
e <- caught(api_card_render(s, bqc$instanceId, 620, 380))
if (is.null(e) || !isTRUE(e$note)) stop("BQC sentence without 2 BQC samples is not a note: ", if (is.null(e)) "drew" else conditionMessage(e))
cat("PASS Team's grey BQC sentence answers a note:", conditionMessage(e), "\n")

e <- caught(api_render_module_error(simpleError("invalid 'type' (closure) of argument")))
if (!inherits(e, "api_unprocessable") || isTRUE(e$note)) stop("a module's R error became a note")
cat("PASS a module's own error stays an error\n")
