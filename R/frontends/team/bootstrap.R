# Team implementations of the shared hooks in R/hooks.R.
invisible(lapply(sort(list.files("R/frontends/team/hooks", pattern = "\\.R$", full.names = TRUE)), source))
# Publication Export Studio server (registers the "export_studio_server" hook).
source("R/frontends/team/export_studio.R")
source("R/frontends/team/metadata_state.R")
# Project library and project records belong to the storage block (D). They are
# sourced when installed. Without them the project library is disabled, so the
# Team workspace (which requires it) cannot start.
for (team_storage_file in c("R/frontends/team/project_library.R", "R/frontends/team/project_records.R"))
  if (file.exists(team_storage_file)) source(team_storage_file)
rm(team_storage_file)
if (!exists("team_library_enabled", mode = "function")) team_library_enabled <- function() FALSE
# Team workspace, Canvas and their features (production R/global.R Team block and
# R/frontends/team/server.R, same order).
source("R/frontends/team/group_comparison.R")
source("R/frontends/team/plot_instances.R")
source("R/frontends/team/review_shell.R")
source("R/frontends/team/foreground.R")
source("R/frontends/team/workspace.R")
source("R/frontends/team/canvas.R")
source("R/frontends/team/canvas_state.R")
source("R/frontends/team/violin_statistics.R")
source("R/frontends/team/companion_workspace.R")
source("R/frontends/team/sample_metadata_import_module.R")
source("R/frontends/team/ux_preparation.R")
source("R/frontends/team/guided_preparation_controls.R")
source("R/frontends/team/palette_distinct.R")
source("R/frontends/team/results_dashboard.R")
source("R/frontends/team/scientific_insight_context.R")
source("R/frontends/team/scientific_insight.R")
source("R/frontends/team/cell_show.R")
source("R/frontends/team/guided_workflow.R")
source("R/frontends/team/hub-ui.R")
source("R/frontends/team/qc-ui.R")
source("R/frontends/team/modules-ui.R")
source("R/frontends/team/companion_assistant.R")
source("R/frontends/team/companion_ai_provider.R", local = TRUE)
companion_env <- Sys.getenv("LIPIDOMIC_COMPANION_ENV", unset = "")
if (nzchar(companion_env) && file.exists(companion_env)) companion_read_env(companion_env)
if (companion_ai_available()) future::plan(future::multisession, workers = 2)
