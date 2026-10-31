# Structural ownership and startup isolation, executed on both A and A+B.
source('R/frontends/interface.R')
team <- dir.exists('R/frontends/team')
stopifnot(identical(dir.exists('www/team'),team))
orphans <- c('R/guided_shared.R','www/js/guided_shared.js','www/css/guided_shared.css',
 'www/models/neutrophil.glb','www/models/neutrophil-cinematic.mp4',
 'www/models/neutrophil-preview.png','www/models/neutrophil-cinematic.jpg',
 'www/js/cell_viewer.js','www/css/cell_show.css',
 'www/team/img/app_logo_transparent.png','www/team/img/app_logo.jpg','www/team/img/app_logo_ribbon.png')
stopifnot(!any(file.exists(orphans)))
stopifnot(!any(file.exists(file.path('R',paste0(c('cell_show','companion_assistant','companion_ai_provider','guided_workflow','results_dashboard','guided_shared'),'.R')))))
# Classic bootstrap must not source an unselected Team server or presentation.
s <- paste(readLines('R/global.R'),collapse='\n')
stopifnot(!grepl('source("R/frontends/team/server.R")',s,fixed=TRUE),
 grepl('file.path("R", "frontends", lipidomic_interface(), "server.R")',s,fixed=TRUE))
if (team) {
 for (file in c('R/frontends/team/guided_workflow.R','R/frontends/team/cell_show.R','R/frontends/team/ux_preparation.R')) {
  text <- paste(readLines(file),collapse='\n')
  stopifnot(!any(vapply(c('guide_bone_sample_ids','Keep bone tissues only','CCSteadyState','SteadyState_','16 OCT 2026','lps_bones'),grepl,logical(1),x=text,fixed=TRUE)))
 }
 stopifnot(grepl('MIT',paste(readLines('www/team/models/README.md'),collapse=' '),fixed=TRUE))
 source('R/frontends/team/cell_show.R')
 stopifnot(identical(cell_group_display(c('Exp','Control'),c('unrelated1','unrelated2'),'Group2'),c('Exp','Control')))
}
cat('PASS consolidation ownership, no duplicate assets, selected bootstrap and dataset-agnostic Team\n')
