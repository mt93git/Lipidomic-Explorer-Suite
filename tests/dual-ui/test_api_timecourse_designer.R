# Chart audit b10 F4: Team's longitudinal time-course designer (sortable::rank_list buckets case_bucket_<id>,
# R/modules/11_longitudinal_module.R:1265-1320). The card schema exposes each "Timecourse i" bucket with its items in
# the module's own order, read from the rendered designer (case ids are random per session, never hard-coded).
# A bucket is a computed control: not in allowedInputs, kept in Nexo's member. Setting it the way sortable's JS does
# (an array of item ids) and pressing Generate Analysis changes the module's time-course definition and the render.
for (pkg in c("shiny", "jsonlite", "digest", "xml2")) if (!requireNamespace(pkg, quietly = TRUE)) {
  cat("SKIP test_api_timecourse_designer: package", pkg, "not installed\n"); quit(status = 0)
}
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1",
  LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
if (!requireNamespace("sortable", quietly = TRUE)) { cat("SKIP test_api_timecourse_designer: package sortable not installed\n"); quit(status = 0) }
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_timecourse_designer")
source("frontends/nexo-api/engine.R")

s <- api_session_open("tests/dual-ui/fixtures/nexo-complete-synthetic.zip")
on.exit(api_session_close(s), add = TRUE)
fails <- function(expr) inherits(tryCatch({ force(expr); NULL }, error = function(e) e), "error")
source <- "longitudinal_tab-macroclass_plot"
card <- api_card_create(s, source)
id <- card$instanceId
buckets <- function() Filter(function(x) identical(x$type, "bucket"), api_card_schema(s, id)$controls)
items <- function(b) as.character(unlist(b$value %||% b$default, use.names = FALSE))
image <- function() {
  r <- api_card_render(s, id, 620, 550)
  digest::digest(r[setdiff(names(r), c("cached", "disk", "revision", "elapsed", "provenance", "key"))])
}

# 1. The schema exposes one bucket per Timecourse, labelled as Team draws it, with items and the source cohorts.
b <- buckets()
if (length(b) < 2L) stop("expected at least two time-course buckets, got ", length(b))
stopifnot(all(grepl("^case_bucket_case_[0-9]+$", vapply(b, `[[`, character(1), "id"))))
stopifnot(identical(vapply(b, `[[`, character(1), "label"), paste("Timecourse", seq_along(b))))
stopifnot(all(vapply(b, function(x) isTRUE(x$computed), logical(1))))
stopifnot(!any(vapply(b, `[[`, character(1), "id") %in% card$allowedInputs))
cohorts <- vapply(b[[1L]]$options, function(o) as.character(o$value), character(1))
if (!length(cohorts)) stop("bucket offers no source cohorts")
first <- items(b[[1L]]); second <- items(b[[2L]])
if (!length(first)) stop("Timecourse 1 has no items on the synthetic fixture")
stopifnot(all(c(first, second) %in% cohorts))
cat(sprintf("PASS %d buckets; Timecourse 1 = %s; Timecourse 2 = %s; %d source cohorts\n", length(b),
  paste(first, collapse = ", "), paste(second, collapse = ", "), length(cohorts)))

# 2. Drawn once with the module's default design (Generate Analysis, the card's run need).
api_card_update(s, id, actions = "submit_longitudinal_btn")
before <- image()

# 3. Move Timecourse 1's first item to the end of Timecourse 2, as sortable's JS sends it, then Generate Analysis.
moved <- first[[1L]]
patch <- list(first[-1L], unique(c(second, moved)))
names(patch) <- c(b[[1L]]$id, b[[2L]]$id)
api_card_update(s, id, patch, actions = "submit_longitudinal_btn")
for (n in names(patch)) stopifnot(identical(as.character(unlist(api_read(s, s$mock$input[[paste0(id, "-", n)]]))), patch[[n]]))
stopifnot(identical(s$explicit[[id]][[b[[2L]]$id]], patch[[2L]]))
after <- buckets()
by <- stats::setNames(after, vapply(after, `[[`, character(1), "id"))
stopifnot(identical(as.character(unlist(by[[b[[1L]]$id]]$default)), patch[[1L]]),
  identical(as.character(unlist(by[[b[[2L]]$id]]$default)), patch[[2L]]))
cat(sprintf("PASS moving %s to Timecourse 2 changes the module's designer (rendered items)\n", moved))
if (identical(image(), before)) stop("the render did not change after the time-course definition changed")
cat("PASS the render changes with the time-course definition\n")

# 4. Validation: an item that is not a source cohort, and a bucket id the module never built, are refused.
stopifnot(fails(api_card_update(s, id, setNames(list(c(moved, "NoSuchCohort")), b[[2L]]$id))))
stopifnot(fails(api_card_update(s, id, list(case_bucket_case_000000 = list(moved)))))
cat("PASS bucket values are checked against the source cohorts; unknown buckets are refused\n")

# 5. Add Timecourse shows a new, empty bucket after the existing ones.
api_card_update(s, id, actions = "btn_add_case")
grown <- buckets()
stopifnot(length(grown) == length(b) + 1L, !length(items(grown[[length(grown)]])),
  identical(grown[[length(grown)]]$label, paste("Timecourse", length(grown))))
cat("PASS Add Timecourse shows an empty bucket\n")
cat("PASS test_api_timecourse_designer\n")
