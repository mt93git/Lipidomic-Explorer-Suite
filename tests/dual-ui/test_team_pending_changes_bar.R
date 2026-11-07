# Run with: Rscript tests/dual-ui/test_team_pending_changes_bar.R
# The guided "Changes pending" bar follows dirty/applied/pending (R/utils_preparation.R state),
# not status == "pending", so a failed Update keeps the bar and shows why.
source("R/frontends/team/pending_changes_bar.R")
spec <- function(tx = list(), ...) {
  settings <- modifyList(list(minDetectionPct = 0, normalizationMethod = "median", outlierTreatments = tx), list(...))
  list(data_id = "d1", metadata_id = "m1", selected = c("S01", "S02", "S03"), settings = settings, use_average = FALSE)
}
state <- function(applied, pending, status = "pending", error = NULL, dirty = TRUE)
  list(status = status, pending = pending, applied = list(spec = applied, request_id = "r1"), dirty = dirty, error = error)

s <- team_pending_changes_summary(state(spec(), spec(list(S01 = "remove"))))
stopifnot(identical(s$excluded, "S01"), !length(s$restored), !isTRUE(s$failed),
  identical(s$text, "S01 excluded — results shown are from the previous run."))

# A failed Update leaves dirty TRUE with status "error": the bar stays and names the failure.
s <- team_pending_changes_summary(state(spec(), spec(list(S01 = "remove")), "error", "Processing did not produce a usable matrix."))
stopifnot(identical(s$excluded, "S01"), isTRUE(s$failed),
  grepl("S01 excluded", s$text, fixed = TRUE),
  grepl("The last update did not apply: Processing did not produce a usable matrix.", s$text, fixed = TRUE))

# A restoration or a settings change has no Undo; the text says what is pending.
s <- team_pending_changes_summary(state(spec(list(S02 = "remove")), spec(list(S02 = "keep"))))
stopifnot(!length(s$excluded), identical(s$restored, "S02"),
  identical(s$text, "S02 restored — results shown are from the previous run."))
s <- team_pending_changes_summary(state(spec(), spec(minDetectionPct = 50, normalizationMethod = "pqn")))
stopifnot(!length(s$excluded), !length(s$restored),
  identical(s$text, "detection threshold, normalization changed — results shown are from the previous run."))

# Nothing to show: applied run current, no applied run, unbuildable request (pending NULL,
# dirty FALSE in state()) or a different matrix.
stopifnot(is.null(team_pending_changes_summary(state(spec(), spec(), "ready", dirty = FALSE))),
  is.null(team_pending_changes_summary(list(status = "unprepared", pending = spec(), applied = NULL, dirty = TRUE))),
  is.null(team_pending_changes_summary(list(status = "invalid", pending = NULL, applied = list(spec = spec()), dirty = FALSE, error = "Unknown QC treatment."))),
  is.null(team_pending_changes_summary(state(spec(), modifyList(spec(), list(data_id = "d2")), "unprepared"))))
# Malformed treatments (NULL, NA, a vector) neither error nor count as an exclusion or a setting.
s <- team_pending_changes_summary(state(spec(list(S03 = NULL)), spec(list(S01 = "remove", S02 = NULL, S03 = c("remove", "keep"), S04 = NA_character_, S05 = 1))))
stopifnot(identical(s$excluded, "S01"), !length(s$restored),
  identical(s$text, "S01 excluded — results shown are from the previous run."))
cat("PASS: pending changes summary\n")
