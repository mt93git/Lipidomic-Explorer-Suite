# Hooks run their default until a frontend registers an implementation, and
# several implementations of one hook compose in registration order.
source("R/core/hooks.R")
default <- function(x, k) x * k
stopifnot(identical(lipidomic_hook("demo", default)(3, 2), 6))
stopifnot(identical(lipidomic_hook("demo")(3), 3))
lipidomic_hook_register("demo", function(x, k) x + k)
stopifnot(identical(lipidomic_hook("demo", default)(3, 2), 5))
lipidomic_hook_register("demo", function(x, k) x * 10)
stopifnot(identical(lipidomic_hook("demo", default)(3, 2), 50))
stopifnot(identical(lipidomic_hook_registered(), "demo"))
lipidomic_hook_reset()
stopifnot(identical(lipidomic_hook("demo", default)(3, 2), 6))
stopifnot(inherits(try(lipidomic_hook_register("", identity), silent = TRUE), "try-error"))

# Classic never loads a Team hook implementation: only the Team bootstrap
# sources R/frontends/team/hooks, and global.R loads that bootstrap only for Team.
global <- readLines("R/global.R", warn = FALSE)
stopifnot(!any(grepl("frontends/team/hooks", global, fixed = TRUE)))
stopifnot(any(grepl('frontends/team/hooks', readLines("R/frontends/team/bootstrap.R"), fixed = TRUE)))
cat("PASS hooks default, register, compose and reset; Team hooks load only through the Team bootstrap\n")
