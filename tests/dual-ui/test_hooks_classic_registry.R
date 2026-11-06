# Classic loads the whole app without registering a single hook, so every
# lipidomic_hook() call in the modules runs its pre-existing default.
Sys.setenv(LIPIDOMIC_INTERFACE = "classic", LIPIDOMIC_COMPANION_AI = "0")
suppressPackageStartupMessages(library(shiny))
invisible(capture.output(source("R/global.R"), type = "message"))
stopifnot(identical(lipidomic_hook_registered(), character()))

# Every hook a module calls has a Team implementation, and Team registers no
# hook that the shared code never calls.
called <- unique(unlist(lapply(c(list.files("R/modules", "\\.R$", full.names = TRUE), "R/server.R"),
  function(f) regmatches(readLines(f, warn = FALSE),
    gregexpr('lipidomic_hook\\("[a-z_0-9]+"', readLines(f, warn = FALSE))))))
called <- sort(unique(sub('^lipidomic_hook\\("', "", sub('"$', "", called))))
lipidomic_hook_reset()
for (f in sort(list.files("R/frontends/team/hooks", "\\.R$", full.names = TRUE))) sys.source(f, envir = globalenv())
registered <- lipidomic_hook_registered()
lipidomic_hook_reset()
stopifnot(identical(called, registered))
cat(sprintf("PASS Classic registers no hooks; %d module hooks all have Team implementations\n", length(called)))
