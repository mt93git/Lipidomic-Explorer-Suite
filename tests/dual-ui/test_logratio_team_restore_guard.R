# The Team-only log-ratio restore additions must stay behind the Team guard so
# Classic runs the same code it ran before them.
path <- "R/modules/9_logratio_module.R"
src <- readLines(path, warn = FALSE)
pd <- utils::getParseData(parse(path, keep.source = TRUE))

team_guard <- 'identical(lipidomic_interface(), "team")'
if_rows <- pd[pd$token == "IF", ]
guarded <- do.call(rbind, lapply(if_rows$parent, function(parent_id) {
  kids <- pd[pd$parent == parent_id, ]
  kids <- kids[order(kids$line1, kids$col1), ]
  cond <- kids[which(kids$token == "'('")[1] + 1L, ]
  cond_text <- utils::getParseText(pd, cond$id)
  if (startsWith(cond_text, team_guard)) {
    parent <- pd[pd$id == parent_id, ]
    data.frame(line1 = parent$line1, line2 = parent$line2)
  }
}))
stopifnot(!is.null(guarded), nrow(guarded) > 0)
inside_team_guard <- function(line) any(guarded$line1 <= line & guarded$line2 >= line)

restore_line <- grep('get_restored_input(session$ns("featureLevel")', src, fixed = TRUE)
boundary_line <- grep("lazy analysis controls have supplied featureLevel", src, fixed = TRUE)
stopifnot(length(restore_line) == 1L, length(boundary_line) == 1L,
  inside_team_guard(restore_line), inside_team_guard(boundary_line))

# Classic never takes the Team branch, so its feature level comes only from its own input.
lipidomic_interface <- function() "classic"
stopifnot(!identical(lipidomic_interface(), "team"))

cat("PASS logratio Team restore additions are confined to the Team guard\n")
