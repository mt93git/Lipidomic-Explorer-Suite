# Nexo Phase 1 small fixes (item 5): the temp file api_card_upload writes for the module's fileInput
# (R/frontends/api/export.R) is removed once the module has read it (after the flush), also when the upload
# is refused, including a failure after the file was written (the flush itself fails).
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_small_fixes: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("R/frontends/api/requirements.R"); api_skip_unless_team_ready("test_api_small_fixes")
source("R/frontends/api/engine.R")
source("R/frontends/api/export.R")

s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
uploads <- function() {
  dir <- file.path(tempdir(), "nexo-uploads")
  if (!dir.exists(dir)) character() else list.files(dir, full.names = TRUE)
}
refused <- function(expr) tryCatch({ force(expr); FALSE }, error = function(e) TRUE)

card <- api_card_create(s, "pathway_tab-pathwayPlot")
id <- card$instanceId
layout <- api_card_download(s, id, "download_config")
text <- if (is.raw(layout$bytes)) rawToChar(layout$bytes) else if (!is.null(layout$path)) paste(readLines(layout$path, warn = FALSE), collapse = "\n") else rawToChar(layout$body)

# 1. An accepted upload: the module took the file (settled), and no temp file is left behind.
before <- uploads()
up <- api_card_upload(s, id, "upload_config", list(name = "pathway_layout_config.json", content = text))
if (!isTRUE(up$settled)) stop("upload did not settle")
left <- setdiff(uploads(), before)
if (length(left)) stop("temp upload file left after an accepted upload: ", paste(basename(left), collapse = ", "))
cat("PASS accepted upload leaves no temp file\n")

# 2. Refused before writing (not JSON): nothing left either.
before <- uploads()
if (!refused(api_card_upload(s, id, "upload_config", list(name = "layout.json", content = "not json {")))) stop("non-JSON accepted")
left <- setdiff(uploads(), before)
if (length(left)) stop("temp upload file left after a refused upload: ", paste(basename(left), collapse = ", "))
cat("PASS refused upload leaves no temp file\n")

# 3. Refused after the file was written (the flush fails): the file is still removed.
real_flush <- api_flush
api_flush <- function(...) stop("flush failed (test)")
before <- uploads()
failed <- refused(api_card_upload(s, id, "upload_config", list(name = "pathway_layout_config.json", content = text)))
api_flush <- real_flush
if (!failed) stop("the failing flush did not fail the upload")
left <- setdiff(uploads(), before)
if (length(left)) stop("temp upload file left after a failed flush: ", paste(basename(left), collapse = ", "))
cat("PASS upload failing after the write leaves no temp file\n")
cat("PASS test_api_small_fixes\n")
