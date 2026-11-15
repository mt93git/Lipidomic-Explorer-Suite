Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_COMPANION_ENV", "LIPIDOMIC_STORAGE_URL"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/engine.R")
source("frontends/nexo-api/datasets.R")
source("frontends/nexo-api/service.R")
source("frontends/nexo-api/dataset_upload.R")
fixture <- "tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx"
expect_choices <- function(expr) {
 e <- tryCatch({expr; NULL}, api_dataset_choices = identity)
 stopifnot(!is.null(e), identical(e$payload$reason, "upload_choices_required")); e$payload
}
local({
 e <- expect_choices(api_upload_read(fixture, "synthetic.xlsx", list()))
 stopifnot("sheet" %in% vapply(e$missing, `[[`, character(1), "name"))
 cat("PASS workbook asks for sheet choice\n")
 d <- api_upload_read(fixture, "synthetic.xlsx", list(sheet = "Abundance", metadataSheet = "Metadata", idColumn = "FullName", mappings = list(Group1 = "Group1Term")))
 on.exit(unlink(d))
 parsed <- api_dataset_read(d)
 on.exit(unlink(parsed$abundance), add = TRUE)
 stopifnot(length(parsed$samples) == 6L)
 cat("PASS Team workbook is staged for normal preparation\n")
})
local({
 bad <- tempfile(fileext = ".xlsx"); writeLines("not a workbook", bad); on.exit(unlink(bad))
 team <- tryCatch(team_sheet_list(bad, "synthetic.xlsx"), error = conditionMessage)
 err <- tryCatch(api_upload_read(bad, "synthetic.xlsx", list()), api_dataset_choices = identity)
 stopifnot(identical(err$payload$message, team))
 cat("PASS rejected workbook retains Team's message\n")
})
local({
 root <- tempfile(); dir.create(root); on.exit(unlink(root, recursive = TRUE))
 Sys.setenv(LIPIDOMIC_STORAGE_DIR = root, LIPIDOMIC_ADMIN_SUPABASE_URL = "https://synthetic.invalid", LIPIDOMIC_ADMIN_ANON_KEY = "synthetic")
 client <- "11111111-1111-4111-8111-111111111111"
 other <- "22222222-2222-4222-8222-222222222222"
 row <- list(caller = "33333333-3333-4333-8333-333333333333", caller_view = "client", client_id = client, members_prepare = FALSE)
 options(lipidomic.admin.http_fetcher = function(...) list(status = 200L, body = charToRaw(jsonlite::toJSON(list(row), auto_unbox = TRUE, null = "null"))))
 request <- function() list(HTTP_X_NEXO_ADMIN_TOKEN = "synthetic", body = list(
  list(name = "file", filename = "synthetic.xlsx", value = readBin(fixture, "raw", file.size(fixture))),
  list(name = "choices", value = charToRaw('{"sheet":"Abundance","metadataSheet":"Metadata","idColumn":"FullName","mappings":{"Group1":"Group1Term"}}'))))
 upload <- function() { rm(list = ls(api_admin_caller_cache), envir = api_admin_caller_cache); res <- new.env(); res$status <- 200L; body <- api_dataset_upload_route(request(), res); list(status = res$status, body = body) }
 denied <- upload(); stopifnot(denied$status == 403L, denied$body$error == "lab_prepares")
 cat("PASS client without members_prepare gets 403 lab_prepares\n")
 row$members_prepare <- TRUE
 accepted <- upload(); stopifnot(accepted$status == 200L, api_upload_id(accepted$body$adminDatasetId))
 id <- accepted$body$adminDatasetId
 cat("PASS enabled client uploads workbook\n")
 destination <- tempfile(fileext = ".xlsx"); on.exit(unlink(destination), add = TRUE)
 admin <- api_dataset_admin(id, destination, "Bearer synthetic")
 stopifnot(file.exists(destination), admin$openedBy$clientId == client, identical(admin$openedBy$userId, row$caller))
 provenance <- readxl::read_excel(destination, sheet = "Provenance")
 stopifnot("upload_id" %in% provenance[[1L]])
 parsed <- api_dataset_read(destination); on.exit(unlink(parsed$abundance), add = TRUE)
 preview <- api_dataset_preview_route(list(HTTP_X_NEXO_ADMIN_TOKEN = "synthetic", body = list(adminDatasetId = id, samples = parsed$samples, minDetectionPct = 0, detectionScope = "global", dropNonDetected = TRUE)), new.env())
 stopifnot(preview$total > 0)
 cat("PASS uploaded workbook opens through preview\n")
 res <- new.env(); res$status <- 200L
 choices <- api_dataset_route(list(HTTP_X_NEXO_ADMIN_TOKEN = "synthetic", body = list(adminDatasetId = id)), res)
 stopifnot(res$status == 422L, choices$reason == "preparation_choices_required")
 cat("PASS uploaded workbook opens through sessions with normal preparation choices\n")
 settings <- c(list(samples = parsed$samples), lapply(api_dataset_required_settings, `[[`, "teamControlDefault"))
 res <- new.env(); res$status <- 200L
 opened <- api_dataset_route(list(HTTP_X_NEXO_ADMIN_TOKEN = "synthetic", body = list(adminDatasetId = id, settings = settings)), res)
 stopifnot(res$status == 200L, opened$lipids > 0L, opened$samples == 6L)
 api_session_close(api_sessions[[opened$sessionId]])
 cat("PASS uploaded workbook prepares through sessions with Team\n")
 row$client_id <- other; rm(list = ls(api_admin_caller_cache), envir = api_admin_caller_cache)
 denied <- tryCatch(api_dataset_admin(id, destination, "Bearer synthetic"), api_dataset_admin_error = identity)
 stopifnot(denied$status == 404L)
 cat("PASS another client's member cannot open upload\n")
 row <- list(caller_view = "staff", client_id = NULL, members_prepare = NULL)
 accepted <- upload(); stopifnot(accepted$status == 200L)
 stopifnot(accepted$body$adminDatasetId != id)
 cat("PASS staff with NULL members_prepare uploads workbook\n")
 if (requireNamespace("plumber", quietly = TRUE)) {
  api_run_dir <- normalizePath("frontends/nexo-api"); assign("api_run_dir", api_run_dir, envir = .GlobalEnv)
  repo <- getwd(); on.exit(setwd(repo), add = TRUE)
  router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_run_dir, "plumber.R")), plumber::serializer_unboxed_json(null = "null"))
  setwd(repo)
  boundary <- "synthetic-upload-boundary"
  file <- request()$body[[1L]]
  part <- function(head, value) c(charToRaw(paste0("--", boundary, "\r\n", head, "\r\n\r\n")), value, charToRaw("\r\n"))
  body <- c(part('Content-Disposition: form-data; name="file"; filename="synthetic.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', file$value),
   part('Content-Disposition: form-data; name="choices"', request()$body[[2L]]$value), charToRaw(paste0("--", boundary, "--\r\n")))
  req <- new.env(); req$REQUEST_METHOD <- "POST"; req$PATH_INFO <- "/api/v1/datasets/upload"; req$QUERY_STRING <- ""
  req$HTTP_X_NEXO_ADMIN_TOKEN <- "synthetic"; req$HTTP_CONTENT_TYPE <- paste0("multipart/form-data; boundary=", boundary)
  req$rook.input <- list(read = function(l = -1L) body, rewind = function() invisible(NULL))
  answer <- router$call(req)
  stopifnot(answer$status == 200L)
  cat("PASS multipart upload route accepts workbook through plumber\n")
 }
})
local({
 root <- getwd(); on.exit(setwd(root))
 setwd("frontends/nexo-api")
 source("datasets.R")
 cat("PASS dataset sources also load from plumber working directory\n")
})
local({
 labels <- tempfile(fileext = ".csv"); on.exit(unlink(labels))
 utils::write.csv(data.frame(Sample = c("Control_1", "Control_2", "Control_3", "Treated_1", "Treated_2", "Treated_3"), Condition = rep(c("Control", "Treated"), each = 3)), labels, row.names = FALSE)
 imported <- api_upload_read(fixture, "synthetic.xlsx", list(sheet = "Abundance", idColumn = "Sample", mappings = list(Group1 = "Condition")), list(path = labels, name = "labels.csv"))
 on.exit(unlink(imported), add = TRUE)
 d <- api_dataset_read(imported); on.exit(unlink(d$abundance), add = TRUE)
 stopifnot(identical(unique(d$snapshot$data$Group1Term), c("Control", "Treated")))
 cat("PASS separate sample labels use Team metadata reader and mappings\n")
})
local({
 e <- expect_choices(api_upload_read(fixture, "synthetic.xlsx", list(sheet = "Abundance", metadataSheet = "Metadata", idColumn = "FullName")))
 stopifnot(identical(e$missing[[1L]]$label, "Condition / Group 1"))
 cat("PASS optional mappings use Team's field labels\n")
})
local({
 bad <- tempfile(fileext = ".xlsx"); out <- tempfile(fileext = ".csv")
 on.exit(unlink(c(bad, out)))
 openxlsx::write.xlsx(list(Matrix = data.frame(Lipid = "PC(34:1)")), bad)
 team <- tryCatch(team_sheet_extract(bad, "synthetic.xlsx", "Matrix", out), error = conditionMessage)
 err <- tryCatch(api_upload_read(bad, "synthetic.xlsx", list(metadataSheet = "__none__")), api_dataset_choices = identity)
 stopifnot(inherits(err, "api_dataset_choices"), identical(err$payload$message, team))
 cat("PASS empty abundance is refused with Team's sheet message\n")
})
