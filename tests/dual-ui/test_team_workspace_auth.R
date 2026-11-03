# Run with: Rscript tests/dual-ui/test_team_workspace_auth.R
# Keep this test independent of the scientific modules: the boundary must hold
# before any of them can register an input handler.
source("R/server.R", local = FALSE)
source("R/frontends/team/workspace.R", local = FALSE)

lipidomic_interface <- function() "team"
team_workspace_enabled <- function() TRUE
team_library_enabled <- function() TRUE
science_starts <- 0L
scientific_server <- function(input, output, session) {
  science_starts <<- science_starts + 1L
  session$userData$team_shared_data <- list(loaded_files=function() "loaded")
}
library_callback <- NULL
library_proxy <- NULL
team_library_server <- function(input, output, session, shared_data, on_authenticated=NULL) {
  library_callback <<- on_authenticated
  library_proxy <<- shared_data
  invisible(function() NULL)
}
session <- new.env(parent=emptyenv())
session$userData <- new.env(parent=emptyenv())
server(list(), list(), session)
stopifnot(science_starts == 0L,
          is.function(library_callback),
          length(library_proxy$loaded_files()) == 0L,
          identical(library_proxy$session_restored(), FALSE))
stopifnot(inherits(try(library_proxy$import_session_path("x"), silent=TRUE), "try-error"))
library_callback()
library_callback()
stopifnot(science_starts == 1L,
          identical(library_proxy$loaded_files(), "loaded"))

# A partial scientific startup leaves unknown handlers registered. The start
# callback must remain spent, even if the caller catches its error.
scientific_server <- function(input, output, session) {
  science_starts <<- science_starts + 1L
  stop("partial registration")
}
failed <- new.env(parent=emptyenv())
failed$userData <- new.env(parent=emptyenv())
server(list(), list(), failed)
stopifnot(inherits(try(library_callback(), silent=TRUE), "try-error"))
library_callback()
stopifnot(science_starts == 2L)

# Session ZIP import and export already apply this shared filter to every
# serialized input; credentials must stay outside both directions.
eval(parse("R/modules/1_shared_data_module.R")[[1]])
filtered <- session_persistent_inputs(list(team_library_email="user@example.org",
  team_library_password="secret", `data_hub-normalizationMethod`="median"))
stopifnot(identical(names(filtered), "data_hub-normalizationMethod"))

team_library_enabled <- function() FALSE
stopifnot(inherits(try(team_workspace_require_library(), silent=TRUE), "try-error"))
cat("PASS: Team workspace auth boundary, spent failed startup, and ZIP credential filter\n")
