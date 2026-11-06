# Read-only adapter around the same restore and dashboard modules used by Team.
api_abort <- function(class, message) {
  stop(structure(list(message = message, call = NULL), class = c(class, "error", "condition")))
}

api_load_session <- function(zip) {
  archive <- read_session_archive(zip, include_team_canvas = TRUE,
    metadata_decoder = team_metadata_sidecar_decode)
  on.exit(unlink(archive$directory, recursive = TRUE))
  saved <- archive$shared$applied
  settings <- shiny::reactiveVal(if (is.null(saved)) preparation_settings(list(), "team") else saved$spec$settings)
  result <- NULL
  shiny::testServer(shared_data_server, args = list(
    external_settings = shiny::reactive(settings()), preparation_policy = "team",
    design_check = function() TRUE), {
    session$flushReact()
    session$setInputs(import_session_file = data.frame(name = basename(zip),
      size = file.info(zip)$size, type = "application/zip", datapath = zip))
    for (i in seq_len(8L)) session$flushReact()
    api <- session$returned
    stopifnot(isTRUE(api$session_restored()), !isTRUE(api$is_restoring()))
    raw <- api$rawData()$data
    selected <- if (is.null(saved)) names(raw)[vapply(raw, is.numeric, logical(1))] else saved$spec$selected
    session$setInputs(selectedColumns = selected)
    session$setInputs(runAnalysis = 1L)
    session$flushReact()
    df <- api$data_processed_allow_missing()
    stopifnot(is.data.frame(df), nrow(df) > 0L)
    # Snapshot while the restore session is alive; no reactive from a closed
    # testServer is retained by the HTTP cache.
    value <- function(x) { force(x); function(...) x }
    hub <- list(data_processed = value(df))
    for (key in c("all_metadata", "preparation_audit", "color_maps", "class_color_map", "palette_settings"))
      hub[[key]] <- value(api[[key]]())
    hub$preparation_dirty <- shiny::reactiveVal(FALSE)
    hub$team_compact_distribution <- TRUE
    hub$inference_allowed <- function(...) FALSE
    inputs <- archive$state$inputs[startsWith(names(archive$state$inputs), "results_dashboard-")]
    names(inputs) <- sub("^results_dashboard-", "", names(inputs))
    inputs <- inputs[!startsWith(names(inputs), "plotly_")]
    defaults <- list(color_by = "Group1", n_class = 7L, top_n = 10L,
      pca_transform = "log2", pca_scale = "uv", violin_lipid = as.character(df[[1]][1]))
    result <<- list(hub = hub, canvas = archive$canvas, applied = api$preparation_state()$applied,
      inputs = utils::modifyList(defaults, inputs), samples = ncol(df) - 1L, lipids = nrow(df))
  })
  result
}

api_render_plot <- function(hub, output_id, inputs, width = 900) {
  if (!is.character(output_id) || length(output_id) != 1L || is.na(output_id) ||
      !output_id %in% c("pca", "violin", "dist", "comp", "heat"))
    api_abort("api_bad_request", "Unknown dashboard output.")
  if (!is.numeric(width) || length(width) != 1L || !is.finite(width) || width <= 0)
    api_abort("api_bad_request", "Width must be a positive finite number.")
  if (!is.list(inputs) || (length(inputs) && (is.null(names(inputs)) || any(!nzchar(names(inputs))))))
    api_abort("api_bad_request", "Inputs must be a named object.")
  old_client <- getS3method("[[", "mockclientdata")
  assignInNamespace("[[.mockclientdata", function(x, name) {
    if (grepl("plot_(dist|comp|heat)_width$", name)) return(width)
    old_client(x, name)
  }, ns = "shiny")
  on.exit(assignInNamespace("[[.mockclientdata", old_client, ns = "shiny"))
  figure <- NULL
  server <- function(input, output, session) results_dashboard_module_server(input, output, session, hub)
  tryCatch(shiny::testServer(server, {
    do.call(session$setInputs, inputs)
    session$flushReact()
    figure <<- jsonlite::fromJSON(output[[paste0("plot_", output_id)]], simplifyVector = FALSE)$x
  }), shiny.silent.error = function(e) {
    message <- conditionMessage(e)
    # req() (including an unknown violin lipid) has an empty message.
    if (!nzchar(message)) message <- "The selected plot inputs are unavailable for this session."
    api_abort("api_unprocessable", message)
  })
  figure
}
