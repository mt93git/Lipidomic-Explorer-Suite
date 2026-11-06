source('R/frontends/team/canvas_state.R')

fails <- function(expr) stopifnot(inherits(tryCatch(expr(), error = identity), 'error'))

shape <- list(id='label-box', type='shape', shape='rectangle', x=40, y=36,
  width=220, height=72, fill='#F5E9C8', stroke='#172B3A', strokeWidth=3,
  radius=18, z=1)
text <- list(id='label-text', type='text', x=70, y=58, width=160, height=24,
  text='Phospholipids', fontSize=16, color='#172B3A', z=2)
state <- list(version='1', libraryHidden=FALSE, nodes=list(), document=list(
  version='1', layout='free', paper='letter', orientation='portrait',
  items=list(shape, text)))

validated <- team_canvas_validate(state)
stopifnot(identical(validated$document$items[[1]]$shape, 'rectangle'),
  identical(validated$document$items[[1]]$fill, '#f5e9c8'),
  identical(validated$document$items[[1]]$stroke, '#172b3a'),
  identical(validated$document$items[[1]]$radius, 18))

path <- tempfile(fileext='.json')
writeLines(team_canvas_json(validated), path)
roundtrip <- team_canvas_read(path)
stopifnot(identical(team_canvas_json(roundtrip), team_canvas_json(validated)))
unlink(path)

for (change in list(
  function(x) { x$document$items[[1]]$shape <- 'triangle'; x },
  function(x) { x$document$items[[1]]$fill <- 'red'; x },
  function(x) { x$document$items[[1]]$fill <- '#ffffff\n'; x },
  function(x) { x$document$items[[1]]$stroke <- 'url(#evil)'; x },
  function(x) { x$document$items[[1]]$fill <- list('#ffffff'); x },
  function(x) { x$document$items[[1]]$strokeWidth <- NaN; x },
  function(x) { x$document$items[[1]]$strokeWidth <- Inf; x },
  function(x) { x$document$items[[1]]$strokeWidth <- '3'; x },
  function(x) { x$document$items[[1]]$stroke <- '#12345'; x },
  function(x) { x$document$items[[1]]$strokeWidth <- 21; x },
  function(x) { x$document$items[[1]]$radius <- -1; x },
  function(x) { x$document$items[[1]]$extra <- 'nope'; x },
  function(x) { y <- x; y$document$items[[1]]$shape <- 'line'; y$document$items[[1]]$radius <- 4; y }
)) fails(function() team_canvas_validate(change(state)))

for (kind in c('ellipse', 'line', 'arrow')) {
  item <- shape; item$id <- paste0(kind, '-one'); item$shape <- kind
  if (kind %in% c('line', 'arrow')) item$radius <- NULL
  test <- state; test$document$items <- list(item)
  stopifnot(identical(team_canvas_validate(test)$document$items[[1]]$shape, kind))
}

cat('PASS: native primitive shapes validate, reject unsafe fields, and round-trip without figure nodes\n')
