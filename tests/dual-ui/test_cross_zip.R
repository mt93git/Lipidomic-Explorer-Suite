# Real shared_data_server ZIP export/import across Classic and Team policies.
# Uses only the repository's synthetic 12x8 abundance and metadata fixtures.
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/global.R")

source("tests/dual-ui/archive_fixture_helpers.R")

# Each edge is a real export-handler ZIP followed by the real import callback.
edges <- list(c("classic", "classic"), c("classic", "team"),
              c("team", "classic"), c("team", "team"))
for (edge in edges) {
  assert_roundtrip(edge[[1L]], edge[[2L]])
  cat(sprintf("PASS: %s -> %s ZIP restore\n", edge[[1L]], edge[[2L]]))
}
assert_roundtrip("team", "team", legacy = TRUE)
cat("PASS: legacy Team state.json restore\n")
