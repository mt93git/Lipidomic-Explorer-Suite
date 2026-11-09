# Team's targeted lipid cohort ("Single Lipid Analysis Mode") isolates chosen lipids across
# all modules through shared_data$set_targeted_lipids / set_targeted_mode, exactly what its
# modal's Apply does (R/modules/utils_targeted_lipids.R). Team keeps the cohort in memory
# only. Nexo sets it the same way and also keeps it in the checkpoint, in its own member
# that Team's archive reader ignores, so a reopened Nexo session draws the same plots.
for (pkg in c("shiny", "jsonlite", "digest", "xml2", "zip")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_targeted_cohort: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_targeted_cohort")
source("frontends/nexo-api/engine.R")
s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
cohort <- api_cohort_get(s)
if (isTRUE(cohort$active) || length(cohort$lipids)) stop("a fresh session has no cohort")
names_all <- vapply(cohort$available, `[[`, character(1), "lipid")
prepared <- as.character(api_read(s, s$shared$data_processed_allow_missing())[[1L]])
if (!all(prepared %in% names_all)) stop("available lipids miss prepared ones (Team lists the imported lipids)")
if (!all(nzchar(vapply(cohort$available, function(x) x$class %||% "", character(1))))) stop("every lipid carries its class")
cat("PASS cohort lists the imported lipids with their class, as Team's modal does\n")

stopifnot(isTRUE(api_design(s, "Animal", "independent", TRUE)$allowed))
volcano <- api_card_create(s, "volcano_tab-volcanoPlot")
draw <- function() digest::digest(api_card_render(s, volcano$instanceId, 620, 600))
before <- draw(); epoch <- s$epoch %||% 0; s$dirty <- FALSE
pick <- names_all[seq_len(12)]
result <- api_cohort_set(s, pick)
if (!isTRUE(result$active) || !identical(result$lipids, pick)) stop("cohort not applied")
if (!isTRUE(api_read(s, s$shared$targeted_mode_active())) || !identical(api_read(s, s$shared$targeted_lipids_list()), pick))
  stop("shared targeted state differs from Team's modal apply")
if (!isTRUE(s$dirty) || !((s$epoch %||% 0) > epoch)) stop("cohort must mark the session changed and redraw every card")
if (identical(draw(), before)) stop("volcano did not change with the cohort")
cat("PASS cohort applies like Team's modal and the plots redraw from Team's code\n")

refused <- function(x) tryCatch({ api_cohort_set(s, x); FALSE }, error = function(e) inherits(e, "api_bad_request"))
if (!refused(c(pick[1L], "not-a-lipid"))) stop("unknown lipid accepted")
if (!refused(list(1, 2))) stop("non-text accepted")
cat("PASS cohort refuses unknown lipids\n")

zip <- tempfile(fileext = ".zip"); on.exit(unlink(zip), add = TRUE)
api_read(s, s$shared$export_session_path(zip)); api_cohort_append(zip, s)
archive <- read_session_archive(zip, include_team_canvas = TRUE)
if (is.null(archive$state)) stop("Team's archive reader fails on a checkpoint with the cohort member")
again <- api_session_open(zip); on.exit(api_session_close(again), add = TRUE)
back <- api_cohort_get(again)
if (!isTRUE(back$active) || !identical(back$lipids, pick)) stop("reopened session lost the cohort")
cat("PASS cohort is saved in its own checkpoint member, Team still reads the archive, reopen restores it\n")

cleared <- api_cohort_set(s, character())
if (isTRUE(cleared$active) || length(cleared$lipids) || isTRUE(api_read(s, s$shared$targeted_mode_active()))) stop("clearing must restore the full dataset")
cat("PASS clearing the cohort restores the full dataset\n")
