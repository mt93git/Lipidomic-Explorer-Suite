# Model B feasibility harness. Source this file to reuse the session functions.
# No HTTP server or browser is started. All generated files live in tempdir().
api_bus <- function() {
  b <- new.env(parent = emptyenv())
  b$log <- list(); b$queue <- list(); b$echoed <- 0L
  # Archived input values (state.json) carry the JSON types the browser bindings
  # would restore; echoes are coerced to those types (numeric inputs stay numeric).
  b$types <- function() list()
  b$renders <- new.env(parent = emptyenv())
  b$push <- function(type, message) {
    b$log[[length(b$log) + 1L]] <- list(type = type, message = message)
    invisible(NULL)
  }
  b$messages <- function(type = NULL) {
    entries <- b$log
    if (!is.null(type)) entries <- Filter(function(x) identical(x$type, type), entries)
    lapply(entries, `[[`, "message")
  }
  b$echo <- function(id, message) {
    key <- intersect(c("value", "selected"), names(message))
    if (length(key)) b$queue[[id]] <- list(value = message[[key[[1L]]]])
    invisible(NULL)
  }
  b$drain_echo <- function(mock) {
    queued <- b$queue; b$queue <- list(); values <- list()
    for (id in names(queued)) {
      value <- queued[[id]]$value
      if (is.list(value)) value <- unlist(value, use.names = FALSE)
      archived <- tryCatch(b$types()[[id]], error = function(e) NULL)
      if (is.character(value) && length(value) == 1L && !is.null(archived)) {
        if (is.numeric(archived)) { n <- suppressWarnings(as.numeric(value)); if (!is.na(n)) value <- n }
        else if (is.logical(archived)) { l <- as.logical(value); if (!is.na(l)) value <- l }
      }
      # An input that does not exist yet raises shiny.silent.error on read.
      current <- tryCatch(shiny::isolate(mock$input[[id]]), error = function(e) NULL)
      if (!identical(current, value)) values[id] <- list(value)
    }
    if (length(values)) {
      b$echoed <- b$echoed + length(values)
      # do.call is equivalent to mock$setInputs(!!!values), without attaching rlang.
      do.call(mock$setInputs, values)
    }
    invisible(length(values))
  }
  b$settled <- function(instanceId) any(vapply(b$messages("team-canvas-instance-settled"),
    function(x) identical(x$id, instanceId), logical(1)))
  b
}

# Output sizes are reactive values consulted by the mock's clientData, so a card
# re-renders when Nexo reports a new logical size (what canvas.js:2036-2046 sends).
api_sizes <- shiny::reactiveValues()
api_install_sizes <- function() {
  if (isTRUE(getOption("nexo.api.sizes.installed"))) return(invisible())
  old <- getS3method("[[", "mockclientdata")
  assignInNamespace("[[.mockclientdata", function(x, name) {
    if (grepl("^output_.*_(width|height)$", name)) {
      v <- api_sizes[[name]]
      if (!is.null(v)) return(v)
    }
    old(x, name)
  }, ns = "shiny")
  options(nexo.api.sizes.installed = TRUE)
}
api_size <- function(output, width, height) {
  api_sizes[[paste0("output_", output, "_width")]] <- width
  api_sizes[[paste0("output_", output, "_height")]] <- height
}
api_inputs <- function(s, ...) {
  values <- list(...)
  shiny::withReactiveDomain(s$domain, do.call(s$mock$setInputs, values))
  invisible(s)
}

api_domain <- function(mock, bus) {
  api_install_sizes()
  proxy <- get("createSessionProxy", asNamespace("shiny"))
  stopifnot("..." %in% names(formals(proxy)))
  # Mock scopes delegate to the R6 object, so install the root fallback first.
  mock$sendCustomMessage <- function(type, message) bus$push(type, message)
  mock$sendInputMessage <- function(inputId, message) bus$echo(inputId, message)
  # Plotly PCA does not itself read clientData width. Add a harness-only resize
  # dependency so S7 measures actual renderer invocations, not cached getOutput.
  define <- mock$defineOutput
  locked <- bindingIsLocked("defineOutput", mock)
  if (locked) unlockBinding("defineOutput", mock)
  mock$defineOutput <- function(name, func, label = name) {
    if (is.function(func) && endsWith(name, "-plot_pca")) {
      original <- func
      func <- function(...) {
        api_sizes[[paste0("output_", name, "_width")]]
        n <- bus$renders[[name]]
        bus$renders[[name]] <- if (is.null(n)) 1L else n + 1L
        original(...)
      }
    }
    define(name, func, label)
  }
  if (locked) lockBinding("defineOutput", mock)
  wrap <- function(parent, nsf) proxy(parent, input = parent$input, output = parent$output,
    sendCustomMessage = function(type, message) bus$push(type, message),
    sendInputMessage = function(inputId, message) bus$echo(nsf(inputId), message),
    makeScope = function(ns) { scope <- parent$makeScope(ns); wrap(scope, scope$ns) })
  wrap(mock, identity)
}

api_flush <- function(s, until = NULL) {
  setTimeLimit(elapsed = 120, transient = TRUE)
  on.exit(setTimeLimit(cpu = Inf, elapsed = Inf, transient = FALSE))
  # setInputs itself flushes; use at most eight flush-driving calls per batch.
  shiny::withReactiveDomain(s$domain, for (i in seq_len(8L)) {
    if (!s$bus$drain_echo(s$mock)) s$mock$flushReact()
    if (!length(s$bus$queue) && !is.null(until) && isTRUE(until())) break
  })
  invisible(s)
}
api_read <- function(s, expr) shiny::withReactiveDomain(s$domain, shiny::isolate(expr))
api_require <- function(ok, reason) if (!isTRUE(ok)) stop(reason, call. = FALSE)

api_session_open <- function(zip) {
  zip <- normalizePath(zip, mustWork = TRUE)
  archive <- read_session_archive(zip, include_team_canvas = TRUE,
    metadata_decoder = team_metadata_sidecar_decode)
  on.exit(unlink(archive$directory, recursive = TRUE))
  mock <- shiny::MockShinySession$new()
  success <- FALSE
  on.exit(if (!success) mock$close(), add = TRUE)
  bus <- api_bus(); domain <- api_domain(mock, bus)
  saved <- archive$shared$applied
  settings <- shiny::reactiveVal(if (is.null(saved$spec$settings))
    preparation_settings(list(), "team") else saved$spec$settings)
  shared <- NULL
  shiny::withReactiveDomain(domain, {
    shared <- shared_data_server("data_hub", external_settings = shiny::reactive(settings()),
      root_session = domain, design_check = function() TRUE, preparation_policy = "team",
      # The harness substitutes the explicit confirmation input for the production
      # guide_workflow$design_ok() bridge; all other policy arguments are identical.
      inference_check = function(paired = FALSE) guide_allows_inference(
        confirmed = isTRUE(domain$input$guide_design_confirm), unit = domain$input$guide_unit,
        type = domain$input$guide_design_type, synthetic_ids = shared$synthetic_sample_ids(), paired = paired))
    domain$userData$team_shared_data <- shared
    bus$types <- function() shiny::isolate(shared$restored_inputs()) %||% list()
    team_canvas_server(domain$input, domain$output, domain, shared)
    dashboard_data <- if (exists("team_missingness_data_adapter", mode = "function"))
      team_missingness_data_adapter(shared) else shared
    dashboard <- results_dashboard_server(domain$input, domain$output, domain, dashboard_data)
    team_plot_instances_server(domain$input, domain$output, domain, shared, dashboard_data)
  })
  s <- list(mock = mock, domain = domain, bus = bus, shared = shared,
    dashboard = dashboard, dashboard_data = dashboard_data, canvas = archive$canvas)
  api_flush(s)
  api_inputs(s, `data_hub-import_session_file` = data.frame(name = basename(zip),
    size = file.info(zip)$size, type = "application/zip", datapath = zip, stringsAsFactors = FALSE))
  api_flush(s)
  api_read(s, {
    api_require(shared$session_restored() && !shared$is_restoring(), "archive restore incomplete")
    raw <- shared$rawData()$data
    if (is.null(saved)) names(raw)[vapply(raw, is.numeric, logical(1))] else saved$spec$selected
  }) -> selected
  api_inputs(s, `data_hub-selectedColumns` = selected)
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
  success <- TRUE
  s
}

api_instance <- function(s, source, id) {
  resolved <- team_plot_instance_source(source)
  defaults <- if (resolved$family == "results_dashboard") team_dashboard_input_defaults() else
    team_plot_instance_input_defaults(resolved$family)
  if (resolved$family == "results_dashboard") defaults$violin_lipid <- api_read(s,
    as.character(s$shared$data_processed_allow_missing()[[1]][1]))
  defaults <- defaults[intersect(names(defaults), team_plot_instance_input_ids(source))]
  layout <- team_plot_instance_layout(source)
  defaults <- utils::modifyList(defaults, layout$tabs)
  defaults <- utils::modifyList(defaults, team_plot_instance_shown_by[[source]] %||% list())
  output <- paste0(id, "-", resolved$output)
  api_size(output, 800, 600)
  do.call(api_inputs, c(list(s), stats::setNames(defaults, paste0(id, "-", names(defaults)))))
  api_read(s, s$domain$userData$team_canvas_instances_create(list(id = id, source = source, inputs = defaults)))
  api_flush(s, function() s$bus$settled(id))
  errors <- Filter(function(x) identical(x$id, id), s$bus$messages("team-canvas-instance-error"))
  api_require(!length(errors), if (length(errors)) errors[[1]]$message else "instance error")
  api_require(s$bus$settled(id), paste(id, "did not settle in eight flushes"))
  list(id = id, output = output, value = s$mock$getOutput(output), wrappers = layout$wrappers)
}
api_png <- function(value) api_require(is.list(value) && is.character(value$src) &&
  startsWith(value$src, "data:image/png;base64,"), "output is not a base64 PNG")
api_widget <- function(value) {
  api_require(is.character(value) && length(value) == 1L, "widget output is not JSON text")
  jsonlite::fromJSON(value, simplifyVector = FALSE)$x
}
api_memory <- function() {
  if (file.exists("/proc/self/status")) {
    line <- grep("^VmRSS:", readLines("/proc/self/status"), value = TRUE)
    return(list(mib = as.numeric(gsub("[^0-9]", "", line)) / 1024, source = "VmRSS"))
  }
  rss <- suppressWarnings(as.numeric(system2("ps", c("-o", "rss=", "-p", Sys.getpid()), stdout = TRUE)))
  list(mib = rss / 1024, source = "ps RSS (VmRSS skipped on macOS)")
}

api_spike_main <- function(args = commandArgs(trailingOnly = TRUE)) {
  passed <- rep(FALSE, 8L); s <- NULL; second <- NULL; startup <- NULL
  # Suppress application stdout, keeping the nine-line protocol on stdout.
  diagnostics <- tempfile("engine-spike-", fileext = ".log")
  sink(diagnostics)
  on.exit({
    if (!is.null(s)) try(s$mock$close(), silent = TRUE)
    if (!is.null(second)) try(second$mock$close(), silent = TRUE)
    sink()
  })
  tryCatch({
    Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
    Sys.setenv(LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
    source("R/global.R")
    INGESTION_LOG_FILE <<- tempfile("engine-ingestion-", fileext = ".log")
    api_require(length(args) == 1L, "usage: engine_spike.R <session.zip>")
  }, error = function(e) startup <<- conditionMessage(e))
  report <- function(n, expr) {
    started <- proc.time()[[3]]
    detail <- tryCatch({
      if (!is.null(startup)) stop(paste("startup:", startup), call. = FALSE)
      if (n > 1L && n < 8L && is.null(s)) stop("S1 session unavailable", call. = FALSE)
      result <- force(expr); passed[n] <<- TRUE; result
    }, error = function(e) {
      msg <- conditionMessage(e)
      if (!nzchar(msg)) msg <- paste(class(e), collapse = "/")
      msg
    })
    sink()
    cat(sprintf("%s S%d %s [%.3fs]\n", if (passed[n]) "PASS" else "FAIL", n,
      gsub("[\r\n]+", " ", paste(detail, collapse = "; ")), proc.time()[[3]] - started))
    sink(diagnostics, append = TRUE)
  }
  report(1L, {
    s <- api_session_open(args[[1]])
    api_require(s$bus$echoed > 0L, "no input values echoed")
    sprintf("%s; echoed=%d; R=%s shiny=%s plotly=%s", s$receipt, s$bus$echoed,
      getRversion(), packageVersion("shiny"), packageVersion("plotly"))
  })
  report(2L, {
    p <- api_instance(s, "qc_pca_tab-pca2dPlot", "tcinstance_qc")
    api_png(p$value); "QC PCA settled; base64 PNG"
  })
  report(3L, {
    # Attempt every family even when an earlier family fails.
    checks <- list(
      pca = function() { p <- api_instance(s, "results_dashboard-plot_pca", "tcinstance_pca")
        api_require(length(api_widget(p$value)$data) > 0L, "PCA has no x$data"); "plotly x$data present" },
      pathway = function() { p <- api_instance(s, "pathway_tab-pathwayVisNetwork", "tcinstance_pathway")
        api_require(length(api_widget(p$value)$nodes) > 0L, "network has no nodes"); "network nodes present" },
      heatmap = function() { p <- api_instance(s, "heatmap_barchart_tab-heatmapPlot", "tcinstance_heatmap")
        api_require(!is.null(p$value), "heatmap returned NULL")
        paste("heatmap", paste(capture.output(str(p$value, max.level = 1L)), collapse = " "),
          "wrappers:", paste(p$wrappers, collapse = ",")) })
    failed <- FALSE
    result <- vapply(names(checks), function(key) tryCatch(paste(key, checks[[key]]()), error = function(e) {
      failed <<- TRUE; paste(key, "ERROR", conditionMessage(e))
    }), character(1))
    api_require(!failed, paste(result, collapse = "; ")); result
  })
  report(4L, {
    api_inputs(s, guide_unit = "Animal", guide_design_type = "independent", guide_design_confirm = TRUE)
    api_flush(s)
    api_require(api_read(s, s$shared$inference_allowed(FALSE)), "inference_allowed(FALSE) remains FALSE")
    p <- api_instance(s, "volcano_tab-volcanoPlot", "tcinstance_volcano")
    api_png(p$value); "inference allowed; volcano PNG"
  })
  report(5L, {
    p <- api_instance(s, "results_dashboard-plot_violin", "tcinstance_violin")
    api_inputs(s, team_violin_stats_request = list(requestId = "r1", instanceId = p$id, mode = "describe"))
    api_flush(s)
    replies <- Filter(function(x) identical(x$requestId, "r1"), s$bus$messages("team-violin-stats"))
    api_require(length(replies) > 0L, "no violin statistics reply")
    reply <- tail(replies, 1L)[[1L]]
    api_require(identical(reply$status, "ok"), paste("status", reply$status, reply$reason)); "violin describe status=ok"
  })
  report(6L, {
    restores <- s$bus$messages("team-canvas-restore")
    if (length(restores)) api_inputs(s, team_canvas_restore_complete =
      list(token = tail(restores, 1L)[[1]]$restoreToken, ok = TRUE))
    state <- team_canvas_validate(s$canvas %||% list(version = 1L, libraryHidden = FALSE, nodes = list()))
    api_inputs(s, team_canvas_state = list(token = "t1", state = state))
    api_flush(s)
    acks <- Filter(function(x) identical(x$token, "t1"), s$bus$messages("team-canvas-state-ack"))
    api_require(length(acks) > 0L && isTRUE(tail(acks, 1L)[[1]]$ok), "canvas ack missing or rejected")
    tmp <- tempfile(fileext = ".zip")
    api_read(s, s$shared$export_session_path(tmp))
    archive <- read_session_archive(tmp, include_team_canvas = TRUE)
    canon <- function(x) as.character(jsonlite::toJSON(x, auto_unbox = TRUE, null = "null", digits = NA))
    equal <- identical(canon(archive$canvas), canon(state))
    unlink(c(tmp, archive$directory), recursive = TRUE)
    api_require(equal, "exported canvas differs from acknowledged state"); "canvas ack ok; ZIP canvas identical"
  })
  report(7L, {
    before <- api_memory(); times <- numeric(50L)
    count <- s$bus$renders[["tcinstance_pca-plot_pca"]] %||% 0L
    for (i in seq_len(50L)) {
      start <- proc.time()[[3]]
      api_size("tcinstance_pca-plot_pca", if (i %% 2L) 801 else 800, 600)
      api_flush(s)
      value <- s$mock$getOutput("tcinstance_pca-plot_pca")
      api_require(length(api_widget(value)$data) > 0L, "PCA render unavailable")
      times[i] <- proc.time()[[3]] - start
    }
    after <- api_memory()
    renders <- (s$bus$renders[["tcinstance_pca-plot_pca"]] %||% 0L) - count
    api_require(renders >= 50L, "fewer than 50 actual PCA renderer invocations")
    sprintf("50 PCA renders (harness resize dependency); %s %.2f -> %.2f MiB delta=%+.2f MiB; mean=%.4fs",
      after$source, before$mib, after$mib, after$mib - before$mib, mean(times))
  })
  report(8L, {
    before <- api_memory(); second <- api_session_open(args[[1]])
    both <- api_memory()
    if (!is.null(s)) s$mock$close()
    gc(); after <- api_memory()
    api_require(api_read(second, !is.null(second$shared$data_processed_allow_missing())), "second session unavailable after first close")
    sprintf("second session restored; first closed; %s before=%.2f both=%.2f after-gc=%.2f MiB", after$source, before$mib, both$mib, after$mib)
  })
  sink(); cat(sprintf("SUMMARY %d/8\n", sum(passed))); sink(diagnostics, append = TRUE)
  if (all(passed[1:3])) 0L else 1L
}
if (sys.nframe() == 0L) quit(status = api_spike_main())
