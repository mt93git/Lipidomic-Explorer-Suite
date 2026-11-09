# Long-lived headless Team sessions. No testServer or harness render counters.
api_debug <- function(...) if (nzchar(Sys.getenv("NEXO_API_DEBUG"))) message(format(Sys.time(), "%H:%M:%OS3"), " api: ", ...)
api_abort <- function(class, message) {
  stop(structure(list(message = message, call = NULL), class = c(class, "error", "condition")))
}
api_alive <- function(s) {
  if (isTRUE(s$broken) || isTRUE(s$closed))
    api_abort("session_lost", "Session is no longer usable; reopen the checkpoint.")
}
# Compare canvas states by JSON, including empty named/unnamed node lists.
api_canonical_json <- function(x) as.character(jsonlite::toJSON(x,
  auto_unbox = TRUE, null = "null", digits = NA))
api_bus <- function() {
  b <- new.env(parent = emptyenv())
  b$log <- list(); b$queue <- list(); b$echoed <- 0L
  # Archived input values (state.json) carry the JSON types the browser bindings
  # would restore; echoes are coerced to those types (numeric inputs stay numeric).
  b$types <- function() list()
  b$push <- function(type, message) {
    b$log[[length(b$log) + 1L]] <- list(type = type, message = message)
    if (length(b$log) > 500L) b$log <- b$log[-seq_len(length(b$log) - 500L)]   # bounded
    invisible(NULL)
  }
  b$messages <- function(type = NULL) {
    entries <- b$log
    if (!is.null(type)) entries <- Filter(function(x) identical(x$type, type), entries)
    lapply(entries, `[[`, "message")
  }
  # The last dialog a module opened with showModal (session$sendModal), until removeModal; PATCH returns it.
  b$modal <- NULL
  b$send_modal <- function(type, message) {
    if (identical(type, "show") && is.list(message)) b$modal <- list(html = paste(as.character(message$html %||% ""), collapse = ""))
    else if (identical(type, "remove")) b$modal <- NULL
    invisible(NULL)
  }
  # The last choices each input received (updateSelectInput & co.), for the Inspector.
  b$choices <- list()
  b$data_choices <- function(id, data) {
    if (is.data.frame(data) && all(c("value", "label") %in% names(data))) {
      values <- as.character(data$value); labels <- as.character(data$label)
    } else {
      values <- as.character(unlist(data, use.names = FALSE))
      labels <- names(unlist(data)); if (is.null(labels) || any(!nzchar(labels))) labels <- values
    }
    if (length(values)) b$choices[[id]] <- list(values = values, labels = labels, selected = NULL)
    invisible(NULL)
  }
  b$echo <- function(id, message) {
    if (is.character(message$options) && length(message$options) == 1L) {
      parsed <- api_option_values(message$options)
      if (length(parsed$values)) b$choices[[id]] <- parsed
    }
    key <- intersect(c("value", "selected"), names(message))
    if (length(key)) b$queue[[id]] <- list(value = message[[key[[1L]]]])
    # updateSelectInput(choices = ...) without a value: the browser replaces the
    # <option>s and the <select> settles on the option marked selected, else the
    # first one, then reports that value. Server-side selectize (url) is not echoed.
    else if (is.character(message$options) && length(message$options) == 1L)
      b$queue[[id]] <- list(options = api_option_values(message$options))
    invisible(NULL)
  }
  b$drain_echo <- function(mock) {
    queued <- b$queue; b$queue <- list(); values <- list()
    for (id in names(queued)) {
      if (!is.null(queued[[id]]$options)) {
        options <- queued[[id]]$options
        if (!length(options$values)) next
        current <- tryCatch(shiny::isolate(mock$input[[id]]), error = function(e) NULL)
        if (is.character(current) && length(current) == 1L && current %in% options$values) next
        queued[[id]]$value <- options$selected %||% options$values[[1L]]
      }
      value <- queued[[id]]$value
      if (is.list(value)) value <- unlist(value, use.names = FALSE)
      archived <- tryCatch(b$types()[[id]], error = function(e) NULL)
      # An input that does not exist yet raises shiny.silent.error on read.
      current <- tryCatch(shiny::isolate(mock$input[[id]]), error = function(e) NULL)
      # updateNumericInput sends its value as text (formatNoSci) and the browser's numeric binding reads a number
      # back: an input that already holds a number keeps the number type, like an archived numeric one.
      if (is.null(archived) && is.numeric(current) && length(current) == 1L) archived <- current
      if (is.character(value) && length(value) == 1L && !is.null(archived)) {
        if (is.numeric(archived)) { n <- suppressWarnings(as.numeric(value)); if (!is.na(n)) value <- n }
        else if (is.logical(archived)) { l <- as.logical(value); if (!is.na(l)) value <- l }
      }
      if (!identical(current, value)) values[id] <- list(value)
    }
    if (length(values)) {
      b$echoed <- b$echoed + length(values)
      # do.call is equivalent to mock$setInputs(!!!values), without attaching rlang.
      do.call(mock$setInputs, values)
    }
    invisible(names(values))
  }
  b$settled <- function(instanceId) any(vapply(b$messages("team-canvas-instance-settled"),
    function(x) identical(x$id, instanceId), logical(1)))
  b
}

# Option values of rendered <option> markup (what updateSelectInput sends as `options`).
api_option_values <- function(html) {
  doc <- tryCatch(xml2::read_html(paste0("<div>", html, "</div>")), error = function(e) NULL)
  if (is.null(doc)) return(list(values = character(), labels = character()))
  options <- xml2::xml_find_all(doc, "//option")
  if (length(options)) {
    values <- xml2::xml_attr(options, "value"); labels <- xml2::xml_text(options)
    values[is.na(values)] <- labels[is.na(values)]
    selected <- values[!is.na(xml2::xml_attr(options, "selected"))]
  } else {
    # updateCheckboxGroupInput / updateRadioButtons send the choices as <input> markup.
    boxes <- xml2::xml_find_all(doc, "//input[@type='checkbox' or @type='radio'][@value]")
    values <- xml2::xml_attr(boxes, "value")
    labels <- vapply(boxes, function(b) trimws(xml2::xml_text(xml2::xml_parent(b))), character(1))
    labels[!nzchar(labels)] <- values[!nzchar(labels)]
    selected <- values[!is.na(xml2::xml_attr(boxes, "checked"))]
  }
  list(values = values, labels = labels, selected = if (length(selected)) selected[[1L]] else NULL)
}
# Project records (methods, design notes, run history) ride along verbatim: Nexo
# never edits them, and Team would otherwise reopen the checkpoint as "older".
api_project_records_bytes <- function(zip) {
  member <- "team-project-records-v1.json"
  entries <- tryCatch(zip::zip_list(zip), error = function(e) NULL)
  if (is.null(entries) || !member %in% entries$filename) return(NULL)
  size <- entries$uncompressed_size[match(member, entries$filename)]
  if (!is.finite(size) || size > 4 * 1024^2) return(NULL)
  con <- unz(zip, member, open = "rb"); on.exit(close(con))
  readBin(con, "raw", n = size)
}
# Output sizes are reactive values consulted by the mock's clientData, so a card
# re-renders when Nexo reports a new logical size (what canvas.js:2036-2046 sends).
api_sizes <- shiny::reactiveValues()
api_install_sizes <- function() {
  api_install_pixelratio()
  if (isTRUE(getOption("nexo.api.sizes.installed"))) return(invisible())
  old <- getS3method("[[", "mockclientdata")
  assignInNamespace("[[.mockclientdata", function(x, name) {
    if (grepl("^output_.*_(width|height)$", name)) {
      v <- api_sizes[[paste0(attr(x, "nexo_session", exact = TRUE) %||% "", "|", name)]]
      if (!is.null(v)) return(v)
    }
    old(x, name)
  }, ns = "shiny")
  options(nexo.api.sizes.installed = TRUE)
}
api_size <- function(s, output, width, height) {
  key <- paste0(s$size_key, "|output_", output)
  api_sizes[[paste0(key, "_width")]] <- width
  api_sizes[[paste0(key, "_height")]] <- height
}
# Retina (Phase 1 close): the mock reports clientData$pixelratio 1, so renderPlot draws at the
# logical size. A render may ask for dpr 2: that output's pixel ratio is a reactive value as in a
# browser session, read by renderPlot (render-plot.R: device = width*pixelratio x height*pixelratio
# at res*pixelratio) for the output being drawn (getCurrentOutputInfo); every other output reads 1.
# Same science, more pixels: Team's own renderPlot does exactly this for a Retina browser.
api_install_pixelratio <- function() {
  if (isTRUE(getOption("nexo.api.pixelratio.installed"))) return(invisible())
  old <- getS3method("$", "mockclientdata")
  assignInNamespace("$.mockclientdata", function(x, name) {
    if (identical(name, "pixelratio")) {
      out <- tryCatch(shiny::getCurrentOutputInfo()$name, error = function(e) NULL)
      if (is.character(out) && length(out) == 1L) {
        key <- paste0(attr(x, "nexo_session", exact = TRUE) %||% "", "|output_", out, "_pixelratio")
        v <- tryCatch(api_sizes[[key]], error = function(e) shiny::isolate(api_sizes[[key]]))
        if (!is.null(v)) return(v)
      }
      return(1)
    }
    old(x, name)
  }, ns = "shiny")
  options(nexo.api.pixelratio.installed = TRUE)
}
# Set only when it changes, and never create the value for a 1x render (a new reactive value
# would invalidate an output already drawn at 1x: a wasted redraw).
api_pixelratio <- function(s, output, dpr) {
  key <- paste0(s$size_key, "|output_", output, "_pixelratio")
  current <- shiny::isolate(api_sizes[[key]])
  if (is.null(current) && identical(as.numeric(dpr), 1)) return(invisible())
  if (!identical(as.numeric(current), as.numeric(dpr))) api_sizes[[key]] <- as.numeric(dpr)
  invisible()
}
# MockShinySession$flush() ends with later::run_now(); inside an httpuv request
# handler that re-enters the server loop and hangs. Every flush therefore runs
# with a private later loop as the current loop: callbacks Team code schedules
# during a flush land on it and run_now() drains only that loop.
api_loop <- later::create_loop()
api_with_loop <- function(s, expr) later::with_loop(s$loop %||% api_loop,
  shiny::withReactiveDomain(s$domain, expr))
api_guard <- function(s, expr) {
  setTimeLimit(elapsed = 120, transient = TRUE)
  on.exit(setTimeLimit(cpu = Inf, elapsed = Inf, transient = FALSE))
  tryCatch(expr, error = function(e) {
    if (grepl("time limit", conditionMessage(e), fixed = TRUE)) {
      s$broken <- TRUE
      api_abort("session_lost", "Session flush timed out; reopen the checkpoint.")
    }
    stop(e)
  })
}
api_inputs <- function(s, ...) {
  api_alive(s)
  values <- list(...)
  api_guard(s, api_with_loop(s, do.call(s$mock$setInputs, values)))
  api_render_epoch_bump(s, names(values))
  invisible(s)
}

api_domain <- function(mock, bus) {
  api_install_sizes()
  proxy <- get("createSessionProxy", asNamespace("shiny"))
  stopifnot("..." %in% names(formals(proxy)))
  # Mock scopes delegate to the R6 object, so install the root fallback first.
  mock$sendCustomMessage <- function(type, message) bus$push(type, message)
  mock$sendInputMessage <- function(inputId, message) bus$echo(inputId, message)
  mock$sendModal <- function(type, message) bus$send_modal(type, message)
  wrap <- function(parent, nsf) proxy(parent, input = parent$input, output = parent$output,
    sendCustomMessage = function(type, message) bus$push(type, message),
    sendInputMessage = function(inputId, message) bus$echo(nsf(inputId), message),
    sendModal = function(type, message) bus$send_modal(type, message),
    # Server-side selectize (updateSelectizeInput(server = TRUE)) keeps its choices behind a
    # data URL the browser queries; keep them for the Inspector as the browser would see them.
    registerDataObj = function(name, data, filterFunc) {
      bus$data_choices(nsf(name), data)
      tryCatch(parent$registerDataObj(name, data, filterFunc), error = function(e) "")
    },
    makeScope = function(ns) { scope <- parent$makeScope(ns); wrap(scope, scope$ns) })
  wrap(mock, identity)
}

api_flush <- function(s, until = NULL, max = 8L) {
  api_alive(s)
  setTimeLimit(elapsed = 120, transient = TRUE)
  on.exit(setTimeLimit(cpu = Inf, elapsed = Inf, transient = FALSE))
  tryCatch(api_with_loop(s, for (i in seq_len(max)) {
    api_debug("flush ", i, " queue=", length(s$bus$queue))
    if (is.function(s$on_flush)) s$on_flush()
    applied <- s$bus$drain_echo(s$mock)
    if (length(applied)) api_render_epoch_bump(s, applied) else s$mock$flushReact()
    if (!length(s$bus$queue) && !is.null(until) && isTRUE(until())) break
  }), error = function(e) {
    if (grepl("time limit", conditionMessage(e), fixed = TRUE)) {
      s$broken <- TRUE
      api_abort("session_lost", "Session flush timed out; reopen the checkpoint.")
    }
    stop(e)
  })
  invisible(s)
}
# Lazy outputs (H8). Team's browser computes only the outputs on screen (Shiny's
# suspendWhenHidden); MockShinySession runs every output observer eagerly, so each card
# computed every plot of its family module. Plot-type outputs inside a card namespace
# now wait behind a gate until the API asks for them (the card's own node, or a later
# render). The same render function computes the value: science is unchanged.
# Since H9 the original dashboard outputs and the Data page slots (hidden on Team's canvas) wait as well.
# LIPIDOMIC_API_LAZY_OUTPUTS=0 restores the eager behaviour.
api_output_lazy_kinds <- function() {
  kinds <- list(shiny::plotOutput, shiny::imageOutput, shiny::tableOutput, shiny::dataTableOutput)
  for (fn in list(c("plotly", "plotlyOutput"), c("visNetwork", "visNetworkOutput"), c("DT", "DTOutput")))
    if (requireNamespace(fn[[1L]], quietly = TRUE)) kinds[[length(kinds) + 1L]] <- getExportedValue(fn[[1L]], fn[[2L]])
  kinds
}
api_output_lazy <- function(mock) {
  lazy <- new.env(parent = emptyenv())
  lazy$wanted <- new.env(parent = emptyenv()); lazy$gates <- new.env(parent = emptyenv()); lazy$skipped <- 0L
  if (identical(Sys.getenv("LIPIDOMIC_API_LAZY_OUTPUTS", "1"), "0")) return(lazy)
  kinds <- api_output_lazy_kinds()
  define <- mock$defineOutput
  gated <- function(name, func, label) {
    kind <- attr(func, "outputFunc")
    # H9 cold open: outputs hidden on Team's canvas wait too, whatever their kind. The API draws dashboard
    # copies (never the original results_dashboard outputs) and reads Data slots only for analysis settings,
    # after api_output_want(). On the pilot checkpoint they were 63 outputs and 6.5 s of every open.
    hidden <- startsWith(name, "results_dashboard-") || startsWith(name, "data_hub-")
    if (is.function(func) && (hidden || (startsWith(name, "tcinstance_") && is.function(kind) &&
        any(vapply(kinds, identical, logical(1), kind))))) {
      gate <- shiny::reactiveVal(isTRUE(lazy$wanted[[name]]))
      lazy$gates[[name]] <- gate
      real <- func
      func <- function(...) {
        if (!isTRUE(gate())) { lazy$skipped <- lazy$skipped + 1L; shiny::req(FALSE) }
        real(...)
      }
      attributes(func) <- attributes(real)
    }
    define(name, func, label)
  }
  unlockBinding("defineOutput", mock); assign("defineOutput", gated, envir = mock); lockBinding("defineOutput", mock)
  lazy
}
api_output_want <- function(s, name) {
  if (is.null(s$lazy)) return(invisible(FALSE))
  s$lazy$wanted[[name]] <- TRUE
  gate <- s$lazy$gates[[name]]
  if (is.function(gate) && !isTRUE(shiny::isolate(gate()))) { gate(TRUE); return(invisible(TRUE)) }
  invisible(FALSE)
}
# getOutput() also flushes (and drains the current later loop): keep reads on the private loop.
api_read <- function(s, expr) api_guard(s, api_with_loop(s, shiny::isolate(expr)))
api_require <- function(ok, reason) if (!isTRUE(ok)) api_abort("api_unprocessable", reason)

api_session_open <- function(zip) {
  zip <- normalizePath(zip, mustWork = TRUE)
  archive <- read_session_archive(zip, include_team_canvas = TRUE,
    metadata_decoder = team_metadata_sidecar_decode)
  on.exit(unlink(archive$directory, recursive = TRUE))
  mock <- shiny::MockShinySession$new()
  size_key <- paste0("k", format(as.numeric(Sys.time()) * 1000, scientific = FALSE), sample(1e6, 1))
  { cd <- mock$clientData; attr(cd, "nexo_session") <- size_key; mock$clientData <- cd }
  success <- FALSE
  on.exit(if (!success) mock$close(), add = TRUE)
  bus <- api_bus(); domain <- api_domain(mock, bus); lazy <- api_output_lazy(mock)
  saved <- archive$shared$applied
  # Team rebuilds the preparation of a checkpoint without shared state from its
  # restored QC inputs (qc_settings_bridge, R/server.R). The API has no QC module,
  # so it refuses rather than prepare with defaults Team would not use.
  if (is.null(saved$spec$settings) || is.null(saved$spec$selected))
    api_abort("api_unprocessable", paste("This checkpoint predates Team's shared preparation state;",
      "open it in Team and save it once, then reopen it in Nexo."))
  settings <- shiny::reactiveVal(saved$spec$settings)
  shared <- NULL
  shiny::withReactiveDomain(domain, {
    shared <- shared_data_server("data_hub", external_settings = shiny::reactive(settings()),
      root_session = domain, design_check = function() TRUE, preparation_policy = "team",
      # The API substitutes the explicit confirmation input for the production
      # guide_workflow$design_ok() bridge; all other policy arguments are identical.
      inference_check = function(paired = FALSE) guide_allows_inference(
        confirmed = isTRUE(domain$input$guide_design_confirm), unit = domain$input$guide_unit,
        type = domain$input$guide_design_type, synthetic_ids = shared$synthetic_sample_ids(), paired = paired))
    domain$userData$team_shared_data <- shared
    # Same bridge as R/server.R: the pseudoreplication reason behind the DA views' warning.
    if (exists("team_group_comparison_participant_reason", mode = "function")) {
      da_reason <- team_group_comparison_participant_reason(shared)
      shared$team_da_participant_reason <- function()
        if (isTRUE(shared$inference_allowed(FALSE))) da_reason() else NULL
    }
    # runAnalysis empties restored_inputs(); keep the archived types for later echoes.
    bus$types <- local({ cache <- list(); function() {
      now <- tryCatch(shiny::isolate(shared$restored_inputs()), error = function(e) NULL)
      if (length(now)) cache <<- now
      cache
    } })
    team_canvas_server(domain$input, domain$output, domain, shared)
    dashboard_data <- if (exists("team_missingness_data_adapter", mode = "function"))
      team_missingness_data_adapter(shared) else shared
    dashboard <- results_dashboard_server(domain$input, domain$output, domain, dashboard_data)
    team_plot_instances_server(domain$input, domain$output, domain, shared, dashboard_data)
  })
  s <- list2env(list(mock = mock, size_key = size_key, loop = later::create_loop(), domain = domain, bus = bus, shared = shared,
    dashboard = dashboard, dashboard_data = dashboard_data,
    # A checkpoint saved before any canvas work opens as Team's empty workspace.
    canvas = archive$canvas %||% list(version = "1", libraryHidden = FALSE, nodes = list()),
    lazy = lazy, broken = FALSE, closed = FALSE), parent = emptyenv())
  api_flush(s)
  api_inputs(s, `data_hub-import_session_file` = data.frame(name = basename(zip),
    size = file.info(zip)$size, type = "application/zip", datapath = zip, stringsAsFactors = FALSE))
  api_flush(s)
  api_read(s, api_require(shared$session_restored() && !shared$is_restoring(), "archive restore incomplete"))
  api_inputs(s, `data_hub-selectedColumns` = saved$spec$selected)
  api_inputs(s, `data_hub-runAnalysis` = 1L)
  api_flush(s)
  s$receipt <- api_read(s, {
    df <- shared$data_processed_allow_missing()
    api_require(is.data.frame(df) && nrow(df) > 0L, "prepared data unavailable")
    recomputed <- shared$preparation_state()$applied
    if (!is.null(saved$output_lipids) || !is.null(saved$output_samples)) {
      same <- identical(as.character(unlist(recomputed$output_lipids)), as.character(unlist(saved$output_lipids))) &&
        identical(as.character(unlist(recomputed$output_samples)), as.character(unlist(saved$output_samples)))
      api_require(same, "recomputed preparation differs from archived receipt")
      "matches archived receipt"
    } else "no archived receipt (legacy checkpoint)"
  })
  restores <- bus$messages("team-canvas-restore")
  if (length(restores)) {
    api_inputs(s, team_canvas_restore_complete =
      list(token = tail(restores, 1L)[[1L]]$restoreToken, ok = TRUE))
    api_flush(s)
  }
  s$revision <- api_read(s, shared$preparation_state()$revision)
  df <- api_read(s, shared$data_processed_allow_missing())
  inputs <- archive$state$inputs[startsWith(names(archive$state$inputs), "results_dashboard-")]
  names(inputs) <- sub("^results_dashboard-", "", names(inputs))
  inputs <- inputs[!startsWith(names(inputs), "plotly_")]
  # Team's dashboard reads a missing top_n as 30 (R/results_dashboard.R rd_int(input$top_n, 30)).
  defaults <- list(color_by = "Group1", top_n = 30L,
    pca_transform = "log2", pca_scale = "uv", violin_lipid = as.character(df[[1L]][1L]))
  s$inputs <- utils::modifyList(defaults, inputs)
  s$samples <- ncol(df) - 1L; s$lipids <- nrow(df)
  s$sha256 <- digest::digest(file = zip, algo = "sha256")
  s$archived_inputs <- archive$state$inputs %||% list()
  s$project_records <- api_project_records_bytes(zip)
  s$cards <- new.env(parent = emptyenv())
  s$instance_sources <- new.env(parent = emptyenv())
  s$created <- s$last_used <- Sys.time()
  if (exists("api_cohort_restore", mode = "function")) api_cohort_restore(s, zip)
  if (exists("api_nexo_read", mode = "function")) s$nexo <- api_nexo_read(zip)
  success <- TRUE
  s
}


api_session_close <- function(s) {
  on.exit({
    s$closed <- TRUE
    if (!is.null(s$sessionId) && exists(s$sessionId, api_sessions, inherits = FALSE)) {
      rm(list = s$sessionId, envir = api_sessions)
      assign(s$sessionId, TRUE, envir = api_sessions_closed)
    }
    # drop this session's reactive sizes
    for (k in grep(paste0("^", s$size_key, "\\|"), names(shiny::isolate(shiny::reactiveValuesToList(api_sizes))), value = TRUE))
      api_sizes[[k]] <- NULL
  })
  if (!isTRUE(s$closed)) s$mock$close()
  invisible(NULL)
}
api_de_state <- function(s) {
  messages <- s$bus$messages("team-canvas-de-state")
  if (length(messages)) tail(messages, 1L)[[1L]] else NULL
}
api_design_state <- function(s) api_read(s, list(
  allowed = isTRUE(s$shared$inference_allowed(FALSE)),
  unit = tryCatch(s$mock$input$guide_unit, error = function(e) NULL),
  type = tryCatch(s$mock$input$guide_design_type, error = function(e) NULL),
  confirmed = isTRUE(tryCatch(s$mock$input$guide_design_confirm, error = function(e) FALSE))))
api_design <- function(s, unit, type, confirm) {
  if (!is.character(unit) || length(unit) != 1L || is.na(unit) ||
      !is.character(type) || length(type) != 1L || is.na(type) ||
      !type %in% c("independent", "paired", "uncertain") ||
      !is.logical(confirm) || length(confirm) != 1L || is.na(confirm))
    api_abort("api_bad_request", "Expected unit, design type and logical confirm.")
  api_session_dirty(s)
  api_inputs(s, guide_unit = unit, guide_design_type = type, guide_design_confirm = confirm)
  api_flush(s)
  c(api_design_state(s), list(deState = api_de_state(s)))
}
api_sessions <- new.env(parent = emptyenv())
api_session_counter <- 0L
# A live session stands for its checkpoint only until something changes it; a save
# makes it the saved checkpoint again (api_checkpoint_save).
api_session_dirty <- function(s) { s$dirty <- TRUE; invisible(s) }
api_session_for_checkpoint <- function(path) {
  sha <- digest::digest(file = path, algo = "sha256")
  # Render workers (pool.R) open the same checkpoint while this process opens it.
  if (exists("api_pool_prepare", mode = "function")) api_pool_prepare(normalizePath(path, mustWork = TRUE), sha)
  for (id in ls(api_sessions)) {
    s <- api_sessions[[id]]
    if (identical(s$sha256, sha)) {
      if (isTRUE(s$broken) || isTRUE(s$closed)) api_session_close(s) else if (!isTRUE(s$dirty)) {
        s$last_used <- Sys.time()
        return(s)
      }
      # A dirty session holds edits the checkpoint does not: leave it to its tab, open fresh.
    }
  }
  if (length(ls(api_sessions)) >= 2L) {
    ids <- ls(api_sessions)
    oldest <- which.min(vapply(ids, function(id) as.numeric(api_sessions[[id]]$last_used), numeric(1)))
    api_session_close(api_sessions[[ids[[oldest]]]])
  }
  s <- api_session_open(path)
  api_session_counter <<- api_session_counter + 1L
  s$sessionId <- paste0("s", api_session_counter)
  api_sessions[[s$sessionId]] <- s
  s
}
api_sessions_closed <- new.env(parent = emptyenv())
api_session_get <- function(id, touch = TRUE) {
  if (!exists(id, api_sessions, inherits = FALSE)) {
    if (exists(id, api_sessions_closed, inherits = FALSE)) api_abort("session_lost", "This session was closed or evicted; reopen the checkpoint.")
    api_abort("api_not_found", "Unknown session.")
  }
  s <- api_sessions[[id]]
  api_alive(s)
  if (touch) s$last_used <- Sys.time()
  s
}
api_sessions_evict_idle <- function(minutes = 30) {
  for (id in ls(api_sessions)) {
    s <- api_sessions[[id]]
    if (as.numeric(difftime(Sys.time(), s$last_used, units = "mins")) >= minutes)
      api_session_close(s)
  }
  invisible(NULL)
}
api_rss_mb <- function() {
  if (!file.exists("/proc/self/status")) return(NA_real_)
  line <- grep("^VmRSS:", readLines("/proc/self/status"), value = TRUE)
  if (!length(line)) return(NA_real_)
  as.numeric(gsub("[^0-9]", "", line[[1L]])) / 1024
}

# Render cache (H7). An input change (API call or echoed module update) bumps an epoch;
# a cached render is valid only for the epochs it was produced in. Inputs inside one
# card's namespace (tcinstance_<id>-…) bump that card's epoch only (H8: adding a card
# no longer invalidates the other 23); every other input bumps the session epoch.
api_render_epoch_bump <- function(s, ids = NULL) {
  card <- grepl("^tcinstance_[a-z0-9_]+-", ids)
  if (is.null(ids) || !all(card)) s$epoch <- (s$epoch %||% 0) + 1
  if (is.null(s$epochs)) s$epochs <- new.env(parent = emptyenv())
  for (id in unique(sub("-.*$", "", ids[card]))) s$epochs[[id]] <- (s$epochs[[id]] %||% 0) + 1
  invisible(s)
}
api_render_epoch <- function(s, instanceId)
  paste(s$epoch %||% 0, if (is.null(s$epochs)) 0 else s$epochs[[instanceId]] %||% 0, sep = ".")
api_render_cache_limit <- function() as.numeric(Sys.getenv("LIPIDOMIC_API_RENDER_CACHE_MB", "64")) * 2^20
api_render_cache_bytes <- function(s) s$render_cache_bytes %||% 0
api_render_cache_clear <- function(s) {
  s$render_cache <- new.env(parent = emptyenv()); s$render_cache_bytes <- 0
  invisible(s)
}
api_render_key <- function(s, instanceId, width, height, format)
  paste(instanceId, width, height, format, api_render_epoch(s, instanceId), sep = "|")
api_render_cache_get <- function(s, key) {
  cache <- s$render_cache
  if (is.null(cache) || !exists(key, envir = cache, inherits = FALSE)) return(NULL)
  s$render_tick <- (s$render_tick %||% 0) + 1
  entry <- cache[[key]]; entry$used <- s$render_tick; assign(key, entry, envir = cache)
  entry$value
}
api_render_cache_put <- function(s, key, value) {
  if (is.null(s$render_cache)) api_render_cache_clear(s)
  bytes <- as.numeric(utils::object.size(value)); limit <- api_render_cache_limit()
  if (bytes > limit / 4) return(invisible(s))
  cache <- s$render_cache
  if (exists(key, envir = cache, inherits = FALSE)) s$render_cache_bytes <- s$render_cache_bytes - cache[[key]]$bytes
  s$render_tick <- (s$render_tick %||% 0) + 1
  assign(key, list(value = value, bytes = bytes, used = s$render_tick), envir = cache)
  s$render_cache_bytes <- s$render_cache_bytes + bytes
  while (s$render_cache_bytes > limit) {
    keys <- ls(cache, all.names = TRUE)
    oldest <- keys[[which.min(vapply(keys, function(k) cache[[k]]$used, numeric(1)))]]
    s$render_cache_bytes <- s$render_cache_bytes - cache[[oldest]]$bytes
    rm(list = oldest, envir = cache)
  }
  invisible(s)
}

# Memory guard (H7), run after every engine request. Soft limit: close the least
# recently used session other than the current one, drop render caches, gc().
# Hard limit: exit with status 3 shortly after the response; systemd restarts the unit.
api_rss_soft_mb <- function() as.integer(Sys.getenv("LIPIDOMIC_API_RSS_SOFT_MB", "2400"))
api_rss_hard_mb <- function() as.integer(Sys.getenv("LIPIDOMIC_API_RSS_HARD_MB", "2700"))
api_memory_guard <- function(rss = api_rss_mb(), current = NULL,
                             quit = function(status) later::later(function() base::quit(save = "no", status = status), 1)) {
  if (is.na(rss)) return(invisible(NULL))
  if (rss > api_rss_hard_mb()) { quit(3L); return(invisible("hard")) }
  if (rss <= api_rss_soft_mb()) return(invisible(NULL))
  ids <- ls(api_sessions)
  used <- vapply(ids, function(id) as.numeric(api_sessions[[id]]$last_used), numeric(1))
  keep <- if (!is.null(current)) current$sessionId else if (length(ids)) ids[[which.max(used)]] else NULL
  others <- setdiff(ids, keep)
  if (length(others)) api_session_close(api_sessions[[others[[which.min(used[others])]]]])
  for (id in ls(api_sessions)) api_render_cache_clear(api_sessions[[id]])
  gc(verbose = FALSE)
  invisible("soft")
}
