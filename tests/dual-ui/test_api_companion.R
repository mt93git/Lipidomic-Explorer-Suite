# NEXO-COMPANION-B: POST /api/v1/companion/ask answers identically to the analyst's Team companion
# baseline (refs/up/mods-anapau at d6a00298) on the committed library, and supports references.csv
# citations, wide table rows, and LIPIDOMIC_KB_RESTRICTED_SOURCES gating.
# Synthetic questions over the committed knowledge_base/ library; no AI provider is loaded.
for (pkg in c("plumber", "stringi"))
  if (!requireNamespace(pkg, quietly = TRUE)) { cat("SKIP test_api_companion: package", pkg, "not installed\n"); quit(status = 0) }
for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_ADMIN_REQUIRE_USER", "LIPIDOMIC_API_WORKSPACE", "LIPIDOMIC_KB_DIR", "LIPIDOMIC_KB_STYLE",
  "LIPIDOMIC_KB_FRIENDLY", "LIPIDOMIC_KB_SEARCH_SEED", "LIPIDOMIC_COMPANION_KB",
  "LIPIDOMIC_KB_RESTRICTED_SOURCES", "LIPIDOMIC_KB_REFERENCES"))
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_companion")
source("frontends/nexo-api/engine.R")
tree_kb_answer <- deparse(companion_kb_answer)   # Team's own R/companion_kb.R, loaded by R/global.R
api_run_dir <- normalizePath("frontends/nexo-api"); root <- getwd()
router <- plumber::pr_set_serializer(plumber::plumb(file.path(api_run_dir, "plumber.R")),
  plumber::serializer_unboxed_json(null = "null", na = "null", digits = NA))
setwd(root)
router <- plumber::pr_hook(router, "preroute", function() setwd(root))
ask <- function(x) {
  req <- new.env()
  req$REQUEST_METHOD <- "POST"; req$PATH_INFO <- "/api/v1/companion/ask"; req$QUERY_STRING <- ""
  req$HTTP_CONTENT_TYPE <- "application/json"
  payload <- charToRaw(enc2utf8(as.character(jsonlite::toJSON(x, auto_unbox = TRUE))))
  req$rook.input <- list(read = function(l = -1L) payload, rewind = function() invisible(0L))
  out <- router$call(req)
  list(status = as.integer(out$status), body = jsonlite::fromJSON(as.character(out$body), simplifyVector = FALSE))
}
check <- function(name, expr) { ok <- tryCatch(isTRUE(expr), error = function(e) { message(conditionMessage(e)); FALSE })
  if (!ok) { cat("FAIL", name, "\n"); quit(status = 1) }; cat("PASS", name, "\n") }

pin <- "d6a002985ded6fb0342665419f3e352090296281"
vendored <- new.env(parent = globalenv())
sys.source("frontends/nexo-api/companion/companion_kb.R", envir = vendored)
original <- NULL
src <- tryCatch(suppressWarnings(system2("git", c("show", paste0(pin, ":R/companion_kb.R")), stdout = TRUE, stderr = FALSE)),
  error = function(e) character())
if (length(src) && is.null(attr(src, "status"))) {
  original <- new.env(parent = globalenv()); f <- tempfile(fileext = ".R"); writeLines(src, f, useBytes = TRUE)
  sys.source(f, envir = original)
} else cat("SKIP original-file comparison: commit", pin, "not reachable from this checkout\n")

check("companion_kb.R keeps its 3-line header", {
  lines <- readLines("frontends/nexo-api/companion/companion_kb.R", warn = FALSE, encoding = "UTF-8")
  all(grepl("^# ", lines[1:3])) })

questions <- c(pca = "What does PCA show?", cardiolipin = "What is cardiolipin?",
  apa = "What are eicosanoids?", none = "What is the capital of France?")
answers <- list()
for (key in names(questions)) {
  q <- questions[[key]]
  r <- ask(list(question = q, screen = "canvas"))
  direct <- vendored$companion_kb_answer(tolower(trimws(q)), audience = "team")
  check(paste("route answers", key, "as her vendored companion_kb_answer"), r$status == 200L &&
    identical(r$body$text, direct$text) && identical(r$body$label, direct$source) && identical(r$body$grounded, isTRUE(direct$found)))
  if (!is.null(original))
    check(paste("route answers", key, "as her original file"),
      identical(r$body$text, original$companion_kb_answer(tolower(trimws(q)), audience = "team")$text))
  answers[[key]] <- r$body
}
check("PCA question has no information in her library", !answers$pca$grounded &&
  startsWith(answers$pca$text, "I have no information about this."))
check("cardiolipin answer has section titles and a Source line", answers$cardiolipin$grounded &&
  all(c("Definition", "Structure", "Relevance") %in% strsplit(answers$cardiolipin$text, "\n")[[1L]]) &&
  any(grepl("^Source: .*/Libreros_lab", strsplit(answers$cardiolipin$text, "\n")[[1L]])))
check("library PDF answer cites APA", answers$apa$grounded &&
  any(startsWith(strsplit(answers$apa$text, "\n")[[1L]], "Source: Dudzinski, D. M., & Serhan, C. N. (n.d.). Pharmacology of eicosanoids")))
check("unknown question answers no information", !answers$none$grounded &&
  identical(answers$none$label, "Knowledge base · no matching source"))
lipid_q <- "What is PC34:1?"   # Team's knowledge-base path never sanitises; an identifier must reach her search as typed
check("lipid identifier question answers as Team, not sanitised", identical(ask(list(question = lipid_q))$body$text,
  vendored$companion_kb_answer(tolower(trimws(lipid_q)), audience = "team")$text))
check("question over 500 characters is refused with 422", ask(list(question = strrep("a", 501)))$status == 422L)
check("missing question is refused with 422", ask(list(screen = "data"))$status == 422L)

# Restricted external CSV reference table over POST /api/v1/companion/ask
local({
  tmp <- tempfile("nexo_kb_ext"); dir.create(tmp, recursive = TRUE)
  on.exit({
    Sys.unsetenv(c("LIPIDOMIC_KB_DIR", "LIPIDOMIC_KB_REFERENCES", "LIPIDOMIC_KB_RESTRICTED_SOURCES", "LIPIDOMIC_KB_FRIENDLY"))
    unlink(tmp, recursive = TRUE)
  }, add = TRUE)
  lib_dir <- file.path(tmp, "library")
  ref_csv <- file.path(tmp, "reference_table.csv")
  wide_desc <- paste(
    "Quantified in fasting EDTA human plasma by reversed-phase LC-MS/MS in positive electrospray mode",
    "against a deuterated splash internal standard mix across three analytical batches, with inter-day",
    "coefficient of variation below eight percent, linear calibration response across four orders of",
    "magnitude, carryover below 0.1 percent in blank solvent injections, and method validation details",
    "reported in the primary study protocol (doi:10.1000/example.01) for pooled reference plasma samples."
  )
  writeLines(c(
    "Lipid,Matrix,Method,Concentration_uM,Notes",
    paste("PC 34:1", "Plasma", "LC-MS/MS", "184.5", paste0('"', wide_desc, '"'), sep = ",")
  ), ref_csv)
  refs_map <- file.path(tmp, "references_ext.csv")
  apa_cite <- "Example Lab. (2026). Reference lipid dataset (v1.0). https://doi.org/10.1000/example.01"
  writeLines(c("file,apa", sprintf('"reference_table.csv","%s"', apa_cite)), refs_map)
  vendored$companion_kb_add(ref_csv, dir = lib_dir, tags = "restricted", quiet = TRUE)

  Sys.setenv(LIPIDOMIC_KB_DIR = lib_dir, LIPIDOMIC_KB_REFERENCES = refs_map, LIPIDOMIC_KB_FRIENDLY = "0", LIPIDOMIC_KB_RESTRICTED_SOURCES = "0")
  q_ext <- "What is the concentration of PC 34:1 in plasma?"
  r_off <- ask(list(question = q_ext, screen = "canvas"))
  check("API restricted=0 hides restricted CSV source", r_off$status == 200L && !isTRUE(r_off$body$grounded))

  Sys.setenv(LIPIDOMIC_KB_RESTRICTED_SOURCES = "1")
  r_on <- ask(list(question = q_ext, screen = "canvas"))
  check("API restricted=1 answers wide CSV row with DOI and APA source", r_on$status == 200L && isTRUE(r_on$body$grounded) &&
    grepl("184.5", r_on$body$text, fixed = TRUE) && grepl(apa_cite, r_on$body$text, fixed = TRUE) &&
    !grepl("Libreros_lab", r_on$body$text, fixed = TRUE))
})

check("Team's own companion_kb_answer is untouched", identical(deparse(companion_kb_answer), tree_kb_answer))
for (key in names(answers)) cat("----- ", questions[[key]], " [label: ", answers[[key]]$label, "; grounded: ",
  answers[[key]]$grounded, "]\n", answers[[key]]$text, "\n", sep = "")
