# Team prototype shell only. Scientific navigation/gates remain in guided_workflow.
# Two views only: Classic, and Team = the Data -> Review -> Canvas workspace. The old seven-step
# Team shell is no longer a mode, so LIPIDOMIC_TEAM_WORKSPACE is not read here any more: with
# LIPIDOMIC_INTERFACE=team (or its alias guided) the workspace is always on.
team_workspace_enabled <- function() {
  if (!exists('lipidomic_interface', mode = 'function')) return(TRUE) # this file is sourced for Team only
  identical(tryCatch(lipidomic_interface(), error = function(e) ''), 'team')
}
# Shared code outside the Team frontend (R/companion_assistant.R, R/companion_ai_provider.R) still
# reads LIPIDOMIC_TEAM_WORKSPACE itself; keep it in step with the switch above for this process.
if (team_workspace_enabled() && !identical(Sys.getenv('LIPIDOMIC_TEAM_WORKSPACE'), '1'))
  Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = '1')
# The private project library (LIPIDOMIC_PROJECT_LIBRARY=1) is the Team sign-in boundary: without it Team
# refuses to start. Local use on one computer is the library's files backend (LIPIDOMIC_STORAGE=files),
# which has no sign-in; production's library-less local session (LIPIDOMIC_TEAM_LOCAL_SESSION) is not ported.
team_workspace_require_library <- function() {
  if (team_workspace_enabled() && !team_library_enabled())
    stop('Team workspace requires LIPIDOMIC_PROJECT_LIBRARY=1 (the private project library; ',
      'LIPIDOMIC_STORAGE=files keeps it on this computer without sign-in).', call. = FALSE)
  invisible(TRUE)
}
team_workspace_ui <- function() tags$section(id='team-workspace',
  tags$div(class='tw-top',tags$div(tags$span(class='tw-eyebrow','YOUR ANALYSIS WORKSPACE'),tags$h1('From samples to insight')),
    tags$div(class='tw-account-actions',
      tags$span(id='team-autosave-status',role='status',`aria-live`='polite',''),
      tags$button(type='button',class='tw-signout','Sign out',`data-tw-logout`='true'))),
  tags$nav(class='tw-steps',`aria-label`='Analysis steps',
    tags$button(type='button',`data-tw-stage`='data',tags$span('01'),tags$strong('Data'),tags$small('Upload or resume')),
    tags$button(type='button',`data-tw-stage`='review',tags$span('02'),tags$strong('Review'),tags$small('Filter and inspect')),
    tags$button(type='button',`data-tw-stage`='canvas',tags$span('03'),tags$strong('Canvas'),tags$small('Explore and build figures'))),
  tags$div(class='tw-journey',
    tags$div(class='tw-journey-copy',tags$span(class='tw-progress',id='tw-progress',''),tags$h2(id='tw-screen-title',tabindex='-1','Choose how to begin'),tags$p(id='tw-screen-help','Select a saved analysis or start with a new matrix.')),
    tags$div(class='tw-journey-actions',
      tags$button(type='button',class='tw-back',`data-tw-back`='true','← Back'),
      tags$button(type='button',class='tw-next',`data-tw-next`='true','Next →'))),
  tags$div(class='tw-choice-card',
    tags$button(type='button',`data-tw-choice`='matrix','Upload a new matrix'),
    tags$p('Or choose a private saved checkpoint in the library below.')),
  tags$div(class='tw-canvas-tabs',guide_link('Figure canvas',step=5),guide_link('3D cell',step=6),guide_link('Save & export',step=7),
    tags$details(tags$summary('Analysis tools'),tags$div(class='tw-tools',lapply(guide_tools,function(x)guide_link(x,tool=x))))),
  tags$p(id='tw-next',role='status',`aria-live`='polite','Sign in to start an analysis.'))
