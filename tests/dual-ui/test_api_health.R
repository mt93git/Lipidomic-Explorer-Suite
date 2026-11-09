# Health reports which science the API runs and whether it matches production.
# Pure file comparison: needs no Shiny, no plumber and no study data.
source("R/frontends/api/health.R", local = TRUE)

make_tree <- function(files) {
  root <- tempfile("api-health-")
  for (name in names(files)) {
    path <- file.path(root, name)
    dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
    writeLines(files[[name]], path)
  }
  root
}
science <- list("R/global.R" = "g <- 1", "R/server.R" = "s <- 1",
  "R/modules/a.R" = "a <- 1", "R/modules/b.R" = "b <- 1")
api <- make_tree(science)
prod <- make_tree(science)
on.exit(unlink(c(api, prod), recursive = TRUE))

h <- api_science_health(api, "")
stopifnot(grepl("^[0-9a-f]{32}$", h$globalMd5), is.na(h$scienceMatchesProduction),
  is.null(h$productionRoot), length(h$scienceDiffers) == 0L)
cat("PASS H1 globalMd5 without a production root\n")

h <- api_science_health(api, prod)
stopifnot(isTRUE(h$scienceMatchesProduction), identical(h$productionRoot, prod),
  h$scienceFiles == 4L, length(h$scienceDiffers) == 0L)
cat("PASS H2 identical science matches production\n")

writeLines("b <- 2", file.path(prod, "R/modules/b.R"))
writeLines("c <- 1", file.path(prod, "R/modules/c.R"))
h <- api_science_health(api, prod)
stopifnot(identical(h$scienceMatchesProduction, FALSE),
  identical(sort(unlist(h$scienceDiffers)), c("R/modules/b.R", "R/modules/c.R")))
cat("PASS H3 a changed and an extra module both differ\n")

h <- api_science_health(api, file.path(prod, "missing"))
stopifnot(identical(h$scienceMatchesProduction, FALSE), "R/global.R" %in% unlist(h$scienceDiffers))
cat("PASS H4 an unreadable production root never reports a match\n")
