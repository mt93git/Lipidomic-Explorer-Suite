# The Nexo API refuses to start on R packages older than it needs (run.R).
# Pure version comparison: sources only requirements.R, never R/global.R.
source("frontends/nexo-api/requirements.R", local = TRUE)

failures <- character()
check <- function(id, label, ok) {
  if (isTRUE(ok)) cat("PASS", id, label, "\n") else {
    cat("FAIL", id, label, "\n"); failures <<- c(failures, id)
  }
}

check("R1", "the API asks for zip >= 3.0.0 (zip_append duplicates members below it)",
  exists("api_min_packages") && identical(api_min_packages[["zip"]], "3.0.0"))

installed <- as.character(utils::packageVersion("stats"))
old <- tryCatch(api_old_packages(min = c(stats = "999.0.0")), error = function(e) conditionMessage(e))
check("R2", "a minimum far above the installed version is reported",
  identical(old, sprintf("stats %s (needs >= 999.0.0)", installed)))

old <- tryCatch(api_old_packages(min = c(stats = "0.0.1")), error = function(e) conditionMessage(e))
check("R3", "a minimum of 0.0.1 reports nothing", identical(old, character()))

old <- tryCatch(api_old_packages(min = c(nexoNoSuchPackage = "1.0.0")), error = function(e) conditionMessage(e))
check("R4", "a package that is not installed is reported",
  identical(old, "nexoNoSuchPackage not installed (needs >= 1.0.0)"))

old <- tryCatch(api_old_packages(min = c(stats = "0.0.1", nexoNoSuchPackage = "1.0.0", utils = "999.0.0")),
  error = function(e) conditionMessage(e))
check("R5", "only the packages below their minimum are reported, in order",
  identical(old, c("nexoNoSuchPackage not installed (needs >= 1.0.0)",
    sprintf("utils %s (needs >= 999.0.0)", as.character(utils::packageVersion("utils"))))))

if (length(failures)) quit(save = "no", status = 1)
