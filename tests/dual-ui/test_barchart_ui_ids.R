# Static Barchart UI contract: its fixed outputs are unique in both frontends.
ui_expression <- function(path) {
  exprs <- parse(path)
  matches <- Filter(function(expr) is.call(expr) && identical(expr[[1]], as.name('<-')) &&
    identical(expr[[2]], as.name('barchart_ui')), as.list(exprs))
  stopifnot(length(matches) == 1L)
  matches[[1]]
}
output_ids <- function(expr) {
  text <- paste(deparse(expr, width.cutoff = 500L), collapse = '\n')
  pattern <- '(?:plotOutput|plotlyOutput|uiOutput|textOutput|tableOutput|DTOutput)\\s*\\(\\s*ns\\s*\\(\\s*"([^"]+)"'
  matches <- regmatches(text, gregexpr(pattern, text, perl = TRUE))[[1]]
  sub(pattern, '\\1', matches, perl = TRUE)
}
classic <- output_ids(ui_expression('R/modules/5_barchart_module.R'))
team <- output_ids(ui_expression('R/frontends/team/modules-ui.R'))
stopifnot(length(classic) > 0L, length(team) > 0L,
          !anyDuplicated(classic), !anyDuplicated(team),
          all(c('active_contrast_badge_bar_ui', 'active_contrast_badge_donut_ui') %in% classic))
server <- paste(readLines('R/modules/5_barchart_module.R', warn = FALSE), collapse = '\n')
for (id in c('active_contrast_badge_bar_ui', 'active_contrast_badge_donut_ui')) {
  stopifnot(grepl(paste0('output\\$', id, '\\s*<-\\s*renderUI'), server, perl = TRUE))
}
cat('PASS: Classic and Team Barchart output IDs are unique\n')
