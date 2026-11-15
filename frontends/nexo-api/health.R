# Which science the API runs, and whether it is byte-identical to production Team.
# The API keeps its own working tree (it writes logs there); production is only read.
api_science_files <- function(root) {
  modules <- list.files(file.path(root, "R", "modules"), pattern = "\\.R$")
  c("R/global.R", "R/server.R", if (length(modules)) file.path("R/modules", modules))
}

api_science_md5 <- function(root, files) {
  paths <- file.path(root, files)
  setNames(ifelse(file.exists(paths), unname(tools::md5sum(paths)), NA_character_), files)
}

api_science_health <- function(root = getwd(), production = Sys.getenv("LIPIDOMIC_API_PRODUCTION_ROOT", "")) {
  global <- unname(api_science_md5(root, "R/global.R"))
  out <- list(globalMd5 = global, productionRoot = NULL, scienceMatchesProduction = NA,
    scienceFiles = 0L, scienceDiffers = list())
  if (!nzchar(production)) return(out)
  files <- sort(union(api_science_files(root), api_science_files(production)))
  mine <- api_science_md5(root, files)
  theirs <- api_science_md5(production, files)
  differs <- files[is.na(mine) | is.na(theirs) | mine != theirs]
  out$productionRoot <- production
  out$scienceFiles <- length(files)
  out$scienceDiffers <- as.list(differs)
  out$scienceMatchesProduction <- length(differs) == 0L
  out
}
