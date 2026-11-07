# Team implementations of the R/server.R wiring hooks (production R/server.R,
# Team branches: hidden Structural outputs, Team Export Studio server and the
# workspace sign-in gate). Classic registers none of these, so its server is unchanged.

# --- "structural_server_started"(output) -------------------------------------
# Called right after structural_server; Team suspends the hidden Classic
# Structural outputs (team_suspend_hidden_classic_outputs, R/frontends/team/server.R).
lipidomic_hook_register("structural_server_started", function(output, ...) {
  team_suspend_hidden_classic_outputs(output)
  output
})

# --- "export_studio_server"(id, shared_data, input =, output =, session =) ------
# Team runs its own server (R/frontends/team/export_studio.R), which still calls
# export_studio_server() and adds the Team publication bundle download.
lipidomic_hook_register("export_studio_server", function(id, shared_data, input, output, session, ...) {
  team_export_studio_server(input, output, session, shared_data, id = id)
})

# --- "server_entry"(server) -> server ------------------------------------------
# Workspace authentication is a server boundary: no scientific module or input
# handler exists in a session until its project-library sign-in succeeds.
# Without the Team workspace the scientific server runs directly, as before.
# team_workspace_require_library() is in workspace.R; team_library_server() is
# owned by the project library (R/frontends/team/project_library.R, block D).
team_workspace_server_entry <- function(scientific_server) {
  force(scientific_server)
  function(input, output, session) {
    if (!team_workspace_enabled()) return(scientific_server(input, output, session))
    team_workspace_require_library()
    session$userData$team_shared_data <- NULL
    deferred <- list(
      loaded_files = function() {
        data <- session$userData$team_shared_data
        if (is.null(data)) return(character())
        data$loaded_files()
      },
      session_restored = function() {
        data <- session$userData$team_shared_data
        if (is.null(data)) return(FALSE)
        data$session_restored()
      },
      is_restoring = function() {
        data <- session$userData$team_shared_data
        if (is.null(data)) return(FALSE)
        data$is_restoring()
      },
      export_session_path = function(path) {
        data <- session$userData$team_shared_data
        if (is.null(data)) stop("Sign in first.")
        data$export_session_path(path)
      },
      import_session_path = function(path) {
        data <- session$userData$team_shared_data
        if (is.null(data)) stop("Sign in first.")
        data$import_session_path(path)
      }
    )
    started <- FALSE
    start_science <- function() {
      if (started) return(invisible(NULL))
      started <<- TRUE
      scientific_server(input, output, session)
    }
    team_library_server(input, output, session, deferred, on_authenticated=start_science)
    invisible(NULL)
  }
}
lipidomic_hook_register("server_entry", function(server, ...) team_workspace_server_entry(server))
