# Unit test (no server): the server-side checkpoint validator and canvas tabs.
# Old checkpoints are unchanged; a valid tabs field round-trips; a bad one is dropped.
Sys.setenv(LIPIDOMIC_INTERFACE = "team")
source("R/frontends/team/canvas_state.R")
node <- function(id, x) list(id = id, label = id, x = x, y = 40, width = 620, height = 500, visual = list())
old <- list(version = "1", libraryHidden = FALSE, nodes = list(node("results_dashboard-plot_pca", 30), node("results_dashboard-plot_violin", 700)))
before <- team_canvas_json(team_canvas_validate(old))
stopifnot(!grepl('"tabs"', before))
path <- tempfile(fileext = ".json"); writeLines(before, path, useBytes = TRUE)
stopifnot(identical(team_canvas_json(team_canvas_read(path)), before))
tabs <- list(version = "1", active = "tab-2",
  tabs = list(list(id = "tab-1", name = "Canvas 1", nodes = list("results_dashboard-plot_pca")),
              list(id = "tab-2", name = "Résultats · B", nodes = list("results_dashboard-plot_violin"))),
  figure = list(deselected = list("results_dashboard-plot_pca"), order = list("results_dashboard-plot_violin", "results_dashboard-plot_pca")))
with_tabs <- old; with_tabs$tabs <- tabs
saved <- team_canvas_json(team_canvas_validate(with_tabs))
path2 <- tempfile(fileext = ".json"); writeLines(saved, path2, useBytes = TRUE)
round <- team_canvas_read(path2)
stopifnot(identical(team_canvas_json(round), saved), identical(round$tabs$active, "tab-2"),
  identical(unlist(round$tabs$tabs[[2]]$nodes), "results_dashboard-plot_violin"),
  identical(round$tabs$tabs[[2]]$name, "Résultats · B"))
# Unknown cards are dropped, unlisted cards join the first tab.
partial <- old; partial$tabs <- list(version = "1", active = "tab-1", tabs = list(list(id = "tab-1", name = "A", nodes = list("ghost"))))
p <- team_canvas_validate(partial)$tabs
stopifnot(identical(unlist(p$tabs[[1]]$nodes), c("results_dashboard-plot_pca", "results_dashboard-plot_violin")))
# Unknown versions and malformed fields fall back (field dropped), never an error.
for (bad in list(list(version = "2", active = "tab-1", tabs = list()), list(version = "1", active = "tab-1", tabs = "x"),
                 list(version = "1", active = "tab-1", tabs = list(list(id = "bad id", name = "A", nodes = list()))),
                 list(version = "1", active = "tab-1", tabs = list(list(id = "tab-1", name = "   ", nodes = list()))),
                 list(version = "1", active = "tab-1", tabs = list(list(id = "tab-1", name = "A", nodes = list(), extra = 1))))) {
  x <- old; x$tabs <- bad; v <- team_canvas_validate(x); stopifnot(is.null(v$tabs), identical(team_canvas_json(v), before))
}
# A tabs field without "active" opens on its first tab instead of being dropped.
x <- old; x$tabs <- list(version = "1", tabs = list(list(id = "tab-1", name = "A", nodes = list()), list(id = "tab-2", name = "B", nodes = list())))
na <- team_canvas_validate(x)$tabs; stopifnot(identical(na$active, "tab-1"), length(na$tabs) == 2L)
# Names are repaired like the JS model (control characters, 40 characters); a bad figure is dropped on its own.
x <- old; x$tabs <- list(version = "1", active = "tab-2", tabs = list(list(id = "tab-1", name = paste(rep("é", 45), collapse = ""), nodes = list()),
  list(id = "tab-2", name = "Line\tbreak", nodes = list("results_dashboard-plot_violin"))), figure = "oops")
rp <- team_canvas_validate(x)$tabs
stopifnot(nchar(rp$tabs[[1]]$name) == 40L, identical(rp$tabs[[2]]$name, "Line break"), identical(rp$active, "tab-2"),
  identical(rp$figure, list(deselected = list(), order = list())))
cat("PASS canvas tabs state: old checkpoints unchanged, tabs round-trip, bad fields fall back to one tab\n")
