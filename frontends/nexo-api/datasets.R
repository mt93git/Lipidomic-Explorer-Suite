# Nexo session from an Admin dataset v1 workbook (docs/integration/admin-dataset-session.md).
# The workbook goes through Team's own steps (upload, confirmed metadata snapshot, sample
# selection, Prepare) with explicit settings; nothing here computes or defaults science.
api_dataset_sheets <- c("Abundance", "Metadata", "Internal_Standards", "QC_Injections", "Provenance")
api_dataset_metadata_columns <- c("FullName", "Group1Term", "Group2Term", "ReplicateTerm", "PatientTerm", "TimePointTerm")
# Fixed by the format (docs/01_input_data_specification.md); Team's import module asks for this mapping.
api_dataset_mappings <- c(Group1 = "Group1Term", Group2 = "Group2Term", Replicate = "ReplicateTerm",
  PatientNumber = "PatientTerm", TimePoint = "TimePointTerm")
# Every preparation setting Team shows as a QC widget (R/modules/2_qc_boxplot_module.R), with the
# published guided workspace default for Nexo to prefill. The API never applies these defaults itself.
api_dataset_required_settings <- list(
  minDetectionPct = list(label = "Minimum detection (%)", kind = "number", min = 0, max = 100, step = 5, teamControlDefault = 0),
  detectionScope = list(label = "Detection across", kind = "choice", choices = c("global", "group"), teamControlDefault = "global"),
  dropNonDetected = list(label = "Drop lipids not detected in any sample", kind = "boolean", teamControlDefault = TRUE),
  normalizationMethod = list(label = "Normalization", kind = "choice", choices = c("median", "pqn", "none"), teamControlDefault = "median"),
  useImputation = list(label = "Impute missing values (QRILC)", kind = "boolean", teamControlDefault = TRUE),
  imputeZerosPerFile = list(label = "For each file, impute all-NA lipids to 0", kind = "boolean", teamControlDefault = TRUE),
  imputeRemainingNAtoZero = list(label = "Final cleanup: impute any remaining NAs to 0", kind = "boolean", teamControlDefault = FALSE))
# Absent = what Team does when the person never touches them (no seed widget; no sample decisions; unticked).
api_dataset_optional_settings <- c("imputationSeed", "outlierTreatments")

# A 422 whose body carries what Nexo needs to ask the person (reason, missing choices, samples).
api_dataset_fail <- function(reason, message, ...) {
  payload <- c(list(error = "unprocessable", reason = reason, message = message), list(...))
  stop(structure(list(message = message, call = NULL, payload = payload),
    class = c("api_dataset_choices", "error", "condition")))
}
api_dataset_blank <- function(x) is.na(x) | !nzchar(trimws(x))

# Validate the dataset v1 contract and stage what Team's upload and metadata steps receive.
api_dataset_read <- function(path, name = basename(path)) {
  sheets <- tryCatch(readxl::excel_sheets(path), error = function(e) NULL)
  if (is.null(sheets) || !identical(utils::head(sheets, 5L), api_dataset_sheets))
    api_dataset_fail("dataset_invalid", paste("Expected a dataset v1 workbook with the sheets",
      paste(api_dataset_sheets, collapse = ", "), "in this order."))
  provenance <- as.data.frame(readxl::read_excel(path, sheet = "Provenance", col_names = FALSE, col_types = "text", .name_repair = "minimal"))
  format <- if (ncol(provenance) >= 2L) provenance[[2L]][match("dataset_format", trimws(provenance[[1L]]))] else NA
  if (!identical(trimws(format %||% ""), "1"))
    api_dataset_fail("dataset_invalid", "Provenance must state dataset_format = 1.")
  header <- names(readxl::read_excel(path, sheet = "Abundance", n_max = 0L, .name_repair = "minimal"))
  if (!length(header) || !identical(header[[1L]], "Lipid") || length(header) < 2L)
    api_dataset_fail("dataset_invalid", "The Abundance sheet must start with a Lipid column followed by sample columns.")
  ids <- header[-1L]
  if (anyDuplicated(ids) || any(api_dataset_blank(ids)))
    api_dataset_fail("dataset_invalid", "Abundance sample columns must have unique, nonempty headers.")
  meta <- as.data.frame(readxl::read_excel(path, sheet = "Metadata", col_types = "text", .name_repair = "minimal"),
    stringsAsFactors = FALSE)
  if (!identical(names(meta), api_dataset_metadata_columns))
    api_dataset_fail("dataset_invalid", paste("The Metadata sheet must have exactly the columns",
      paste(api_dataset_metadata_columns, collapse = ", "), "."))
  if (!nrow(meta))
    api_dataset_fail("metadata_required", paste("This dataset has no sample metadata. Team would ask",
      "for sample labels interactively; open it in Team, or release it with a Metadata sheet."))
  meta[is.na(meta)] <- ""
  if (anyDuplicated(meta$FullName) || !setequal(meta$FullName, ids))
    api_dataset_fail("dataset_invalid", "Metadata FullName must list each Abundance sample column exactly once.",
      missingInMetadata = I(setdiff(ids, meta$FullName)), extraInMetadata = I(setdiff(meta$FullName, ids)))
  meta <- meta[match(ids, meta$FullName), , drop = FALSE]; rownames(meta) <- NULL
  mappings <- character()
  for (field in names(api_dataset_mappings)) {
    column <- api_dataset_mappings[[field]]; blank <- api_dataset_blank(meta[[column]])
    if (all(blank)) next   # Unmapped, as an unmapped column in Team's import: "Unspecified".
    if (any(blank)) api_dataset_fail("dataset_invalid", paste0("Metadata ", column,
      " is blank for some samples; Team cannot map a partly blank design column."), samples = I(ids[blank]))
    mappings[[field]] <- column
  }
  # Team's reader binds every sheet of a workbook (R/utils_data.R load_one_file): hand it the
  # Abundance sheet alone, cells untouched.
  abundance <- tempfile("dataset-abundance-", fileext = ".xlsx")
  wb <- openxlsx::loadWorkbook(path)
  for (sheet in setdiff(names(wb), "Abundance")) openxlsx::removeWorksheet(wb, sheet)
  openxlsx::saveWorkbook(wb, abundance, overwrite = TRUE)
  list(name = name, sha256 = digest::digest(file = path, algo = "sha256"), samples = ids, abundance = abundance,
    snapshot = list(data = meta, mappings = mappings, id_column = "FullName"))
}

# The explicit choices, or a typed 422 listing the missing ones; invalid values get Team's message.
api_dataset_choices <- function(dataset, settings) {
  if (is.null(settings)) settings <- list()
  if (!is.list(settings) || (length(settings) && is.null(names(settings))))
    api_abort("api_bad_request", "Expected settings as a JSON object.")
  given <- function(key) !is.null(settings[[key]])
  missing <- list()
  if (!given("samples")) missing[[length(missing) + 1L]] <- list(name = "samples", label = "Samples",
    kind = "samples", choices = I(dataset$samples), teamControlDefault = I(dataset$samples))
  for (key in names(api_dataset_required_settings)) if (!given(key))
    missing[[length(missing) + 1L]] <- c(list(name = key), lapply(api_dataset_required_settings[[key]],
      function(v) if (length(v) > 1L) I(v) else v))
  if (length(missing)) {
    groups <- if ("Group1" %in% names(dataset$snapshot$mappings))
      list(sampleGroups = as.list(stats::setNames(dataset$snapshot$data$Group1Term, dataset$samples))) else list()
    do.call(api_dataset_fail, c(list("preparation_choices_required", paste("Team asks for these preparation choices:",
      paste(vapply(missing, `[[`, character(1), "name"), collapse = ", ")),
      missing = missing, availableSamples = I(dataset$samples)), groups))
  }
  samples <- settings$samples
  if (is.list(samples)) samples <- unlist(samples, use.names = FALSE)
  if (!is.character(samples) || !length(samples) || anyNA(samples) || anyDuplicated(samples) ||
      !all(samples %in% dataset$samples))
    api_abort("api_unprocessable", "samples must be unique Abundance sample columns (at least one).")
  use_average <- settings$useAveragedSubstitution %||% FALSE
  if (!is.logical(use_average) || length(use_average) != 1L || is.na(use_average))
    api_abort("api_unprocessable", "useAveragedSubstitution must be true or false.")
  keys <- c(names(api_dataset_required_settings), intersect(api_dataset_optional_settings, names(settings)))
  values <- settings[keys]
  if (is.list(values$outlierTreatments)) values$outlierTreatments <- lapply(values$outlierTreatments,
    function(x) if (is.list(x)) unlist(x) else x)
  cfg <- tryCatch(preparation_settings(values, "team"), error = function(e) api_abort("api_unprocessable", conditionMessage(e)))
  if (length(cfg$outlierTreatments) && !all(names(cfg$outlierTreatments) %in% dataset$samples))
    api_abort("api_unprocessable", "outlierTreatments refer to samples outside this dataset.")
  list(settings = cfg, samples = samples, use_average = use_average,
    key = digest::digest(list("dataset-v1", dataset$sha256, cfg, samples, use_average), algo = "sha256"))
}

api_dataset_session_open <- function(dataset, choices) {
  mock <- shiny::MockShinySession$new()
  size_key <- paste0("k", format(as.numeric(Sys.time()) * 1000, scientific = FALSE), sample(1e6, 1))
  { cd <- mock$clientData; attr(cd, "nexo_session") <- size_key; mock$clientData <- cd }
  success <- FALSE
  on.exit(if (!success) mock$close(), add = TRUE)
  bus <- api_bus(); domain <- api_domain(mock, bus); lazy <- api_output_lazy(mock)
  settings <- shiny::reactiveVal(choices$settings)
  shared <- NULL
  # Same wiring as api_session_open() (session.R), which mirrors R/server.R.
  shiny::withReactiveDomain(domain, {
    shared <- shared_data_server("data_hub", external_settings = shiny::reactive(settings()),
      root_session = domain, design_check = function() TRUE, preparation_policy = "team",
      inference_check = function(paired = FALSE) guide_allows_inference(
        confirmed = isTRUE(domain$input$guide_design_confirm), unit = domain$input$guide_unit,
        type = domain$input$guide_design_type, synthetic_ids = shared$synthetic_sample_ids(), paired = paired))
    domain$userData$team_shared_data <- shared
    if (exists("team_group_comparison_participant_reason", mode = "function")) {
      da_reason <- team_group_comparison_participant_reason(shared)
      shared$team_da_participant_reason <- function()
        if (isTRUE(shared$inference_allowed(FALSE))) da_reason() else NULL
    }
    team_canvas_server(domain$input, domain$output, domain, shared)
    dashboard_data <- if (exists("team_missingness_data_adapter", mode = "function"))
      team_missingness_data_adapter(shared) else shared
    dashboard <- results_dashboard_server(domain$input, domain$output, domain, dashboard_data)
    team_plot_instances_server(domain$input, domain$output, domain, shared, dashboard_data)
  })
  s <- list2env(list(mock = mock, size_key = size_key, loop = later::create_loop(), domain = domain, bus = bus, shared = shared,
    dashboard = dashboard, dashboard_data = dashboard_data,
    canvas = list(version = "1", libraryHidden = FALSE, nodes = list()),
    lazy = lazy, broken = FALSE, closed = FALSE), parent = emptyenv())
  api_flush(s)
  # Team step 1: the upload (fileInput data_hub-files).
  api_inputs(s, `data_hub-files` = data.frame(name = dataset$name, size = file.info(dataset$abundance)$size,
    type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", datapath = dataset$abundance,
    stringsAsFactors = FALSE))
  api_flush(s)
  ids <- tryCatch(api_read(s, s$shared$all_numeric_columns()), error = function(e) {
    if (inherits(e, "session_lost")) stop(e)
    api_abort("api_unprocessable", paste("Team could not read the Abundance sheet:", conditionMessage(e)))
  })
  api_require(identical(as.character(ids), dataset$samples), "Team read different sample columns from the Abundance sheet.")
  # Team step 2: the confirmed metadata snapshot (what sample_metadata_import_server hands over).
  tryCatch(api_guard(s, api_with_loop(s, shiny::isolate(s$shared$set_external_sample_metadata(dataset$snapshot)))),
    error = function(e) {
      if (inherits(e, "session_lost")) stop(e)
      api_abort("api_unprocessable", paste("Team refused the Metadata sheet:", conditionMessage(e)))
    })
  api_flush(s)
  # Team steps 3-4: sample selection, then Prepare.
  api_inputs(s, `data_hub-selectedColumns` = choices$samples, `data_hub-useAveragedSubstitution` = choices$use_average)
  api_inputs(s, `data_hub-runAnalysis` = 1L)
  api_flush(s)
  state <- api_read(s, s$shared$preparation_state())
  if (is.null(state$applied) || !isTRUE(state$data_available))
    api_abort("api_unprocessable", state$error %||% "Team did not prepare this dataset with these settings.")
  df <- api_read(s, s$shared$data_processed_allow_missing())
  api_require(is.data.frame(df) && nrow(df) > 0L, "prepared data unavailable")
  raw <- api_dataset_detection_input(dataset)$data
  # Prepared rows, before any imputation; the original workbook cells stay untouched.
  raw <- raw[match(df$Lipid_Name, raw$Lipid_Name), , drop = FALSE]
  s$dataset_missing <- lapply(intersect(choices$samples, names(df)), function(id) {
    values <- raw[[id]]
    list(sample = id, missing = sum(!is.finite(values) | values <= 0), of = length(values))
  })
  s$receipt <- "prepared from dataset v1"
  s$revision <- state$revision %||% state$applied$revision
  s$inputs <- list(color_by = "Group1", top_n = 30L, pca_transform = "log2", pca_scale = "uv",
    violin_lipid = as.character(df[[1L]][1L]))
  s$samples <- ncol(df) - 1L; s$lipids <- nrow(df)
  s$engineRevision <- 0L
  s$openedSha256 <- choices$key
  s$sha256 <- choices$key
  s$dataset <- list(sha256 = dataset$sha256, format = 1L, name = dataset$name,
    settings = c(list(samples = I(choices$samples)), choices$settings, list(useAveragedSubstitution = choices$use_average)))
  s$archived_inputs <- list(); s$project_records <- NULL; s$nexo <- NULL
  s$cards <- new.env(parent = emptyenv())
  s$instance_sources <- new.env(parent = emptyenv())
  s$created <- s$last_used <- Sys.time()
  success <- TRUE
  s
}

# Open or reuse (while clean) the session for this workbook and these exact choices.
api_dataset_session <- function(path, settings, name = basename(path), admin = NULL, collab = NULL) {
  if (!is.null(collab)) api_session_admit()
  dataset <- api_dataset_read(path, name)
  on.exit(unlink(dataset$abundance))
  choices <- api_dataset_choices(dataset, settings)
  for (id in ls(api_sessions)) {
    s <- api_sessions[[id]]
    if (is.null(collab) && !identical(s$kind, "collab") && identical(s$sha256, choices$key) &&
        identical(s$dataset$adminDatasetId, admin$adminDatasetId) &&
        identical(s$dataset$openedBy, admin$openedBy)) {
      if (isTRUE(s$broken) || isTRUE(s$closed)) api_session_close(s) else if (!isTRUE(s$dirty)) {
        s$last_used <- Sys.time()
        return(s)
      }
    }
  }
  api_session_make_room()
  s <- api_dataset_session_open(dataset, choices)
  s$dataset <- c(s$dataset, admin)
  # Opened by a client member: its saves belong to that client's workspace (nexo-store-scope.md).
  if (identical(admin$openedBy$view, "client")) s$workspace <- api_client_workspace(admin$openedBy$clientId)
  s$sessionId <- api_session_id()
  s$lineage <- s$sessionId
  s$kind <- "legacy"
  if (is.null(s$workspace)) s$workspace <- api_workspace()
  api_session_bind(s, collab)
  api_sessions[[s$sessionId]] <- s
  s
}

# The POST /api/v1/sessions body, plus the dataset receipt. projectWorkspace: where a shared (collab) project of this
# open lives, the dataset's client workspace whoever opened it (product owner, 2026-11-10, plan D3); `workspace` stays the
# single-user session's.
api_dataset_session_response <- function(s) list(sessionId = s$sessionId, workspace = s$workspace,
  projectWorkspace = if (is.null(s$dataset$openedBy$clientId)) s$workspace else api_client_workspace(s$dataset$openedBy$clientId),
  generation = api_session_generation,
  engineRevision = s$engineRevision %||% 0L, checkpointSha256 = s$sha256,
  near_limit = api_project_records_near_limit(s$project_records),
  preparation = list(revision = s$revision, check = s$receipt), samples = s$samples, lipids = s$lipids,
  inputs = s$inputs, canvas = s$canvas, nexo = s$nexo, design = api_design_state(s), deState = api_de_state(s),
  renderWorkers = if (exists("api_pool_alive", mode = "function")) length(api_pool_alive()) else 0L,
  dataset = s$dataset)

# Small injectable boundary: failures use fixed messages so credentials cannot escape in errors.
api_dataset_admin_fail <- function(status, error) {
  stop(structure(list(message = error, call = NULL, status = status, error = error),
    class = c("api_dataset_admin_error", "error", "condition")))
}
api_dataset_admin_http <- function(method, url, headers, body = NULL) {
  # libcurl rejects an excessive Content-Length before receiving the body. The
  # callback independently bounds actual (decoded) bytes, including chunked errors.
  cap <- if (identical(method, "POST")) 64 * 1024 else 90 * 1024^2
  path <- tempfile("admin-response-")
  connection <- file(path, "wb")
  keep <- FALSE
  on.exit({ try(close(connection), silent = TRUE); if (!keep) unlink(path) })
  handle <- curl::new_handle()
  curl::handle_setheaders(handle, .list = as.list(headers))
  curl::handle_setopt(handle, customrequest = method, timeout = 60,
    followlocation = FALSE, accept_encoding = "gzip", maxfilesize_large = cap)
  if (!is.null(body)) curl::handle_setopt(handle, postfields = body)
  received <- 0
  # libcurl reports a refused Content-Length only as a warning followed by a generic
  # "cannot open the connection" error; name the cause so callers see the limit.
  too_large <- FALSE; http_error <- ""
  response <- withCallingHandlers(tryCatch(curl::curl_fetch_stream(url, function(chunk) {
    if (length(chunk) > cap - received) { too_large <<- TRUE; stop("Admin response exceeds byte limit.") }
    writeBin(chunk, connection)
    received <<- received + length(chunk)
  }, handle = handle), error = function(e) {
    if (too_large) stop("Admin response exceeds byte limit.", call. = FALSE)
    # An HTTP error status makes the curl connection refuse to open, before any body is read.
    if (nzchar(http_error)) stop("Admin response refused: ", http_error, call. = FALSE)
    stop(e)
  }), warning = function(w) {
    if (grepl("Maximum file size exceeded|exceeded max file size", conditionMessage(w))) {
      too_large <<- TRUE
      invokeRestart("muffleWarning")
    }
    if (grepl("HTTP error", conditionMessage(w), fixed = TRUE)) {
      http_error <<- sub(".*(HTTP error [0-9]+).*", "\\1", conditionMessage(w))
      invokeRestart("muffleWarning")
    }
  })
  flush(connection)
  if (identical(method, "POST"))
    return(list(status = response$status_code, body = readBin(path, "raw", received)))
  keep <- TRUE
  list(status = response$status_code, path = path)
}
api_dataset_workbooks <- new.env(parent = emptyenv())
api_dataset_admin <- function(id, path, authorization = NULL, service = NULL, cache = FALSE) {
  if (exists("api_upload_id", mode = "function") && api_upload_id(id)) return(api_upload_resolve(id, path, authorization, service, cache))
  caller <- is.character(authorization) && length(authorization) == 1L && !is.na(authorization) &&
    grepl("^Bearer [^[:space:]]+$", authorization, ignore.case = TRUE)
  auth_required <- function() api_dataset_admin_fail(401L, "admin_auth_required")
  if (!caller && is.null(service) && identical(Sys.getenv("LIPIDOMIC_ADMIN_REQUIRE_USER"), "1")) auth_required()
  fail <- function() api_dataset_admin_fail(503L, "admin_datasets_unavailable")
  config <- Sys.getenv(c("LIPIDOMIC_ADMIN_SUPABASE_URL", "LIPIDOMIC_ADMIN_ANON_KEY", "LIPIDOMIC_ADMIN_NEXO_TOKEN"))
  if (any(!nzchar(trimws(config)))) fail()
  base <- sub("/+$", "", config[[1L]])
  headers <- c(apikey = config[[2L]], Authorization = paste("Bearer", config[[3L]]),
    `Content-Profile` = "admin", `Accept-Profile` = "admin", `Content-Type` = "application/json")
  fetch <- getOption("lipidomic.admin.http_fetcher", api_dataset_admin_http)
  # refused: what a 4xx answer means for this step (the released object refused by Storage is an integrity
  # failure); connection errors and 5xx stay "unavailable".
  request <- function(method, url, body = NULL, destination = NULL, refused = fail, user_rpc = FALSE) {
    request_headers <- headers
    if (user_rpc) request_headers[["Authorization"]] <- authorization
    response <- tryCatch(fetch(method, url, request_headers, body), error = function(e) {
      if (user_rpc && grepl("HTTP error 401", conditionMessage(e), fixed = TRUE)) auth_required()
      if (grepl("HTTP error 4[0-9][0-9]", conditionMessage(e))) refused() else fail()
    })
    if (is.list(response) && is.character(response$path) && length(response$path) == 1L)
      on.exit(unlink(response$path))
    if (!is.list(response) || length(response$status) != 1L || is.na(response$status)) fail()
    if (user_rpc && response$status == 401L) auth_required()
    if (response$status >= 400L && response$status < 500L) refused()
    if (response$status < 200L || response$status >= 300L) fail()
    cap <- if (identical(method, "POST")) 64 * 1024 else 90 * 1024^2
    if (is.null(destination)) {
      if (!is.raw(response$body) || length(response$body) > cap) fail()
      return(response$body)
    }
    # Preserve the small offline fetcher seam without buffering production downloads.
    if (is.raw(response$body)) {
      if (length(response$body) > cap) fail()
      writeBin(response$body, destination)
    } else {
      if (!is.character(response$path) || length(response$path) != 1L || is.na(response$path)) fail()
      size <- file.info(response$path)$size
      if (length(size) != 1L || is.na(size) || size > cap ||
          !file.copy(response$path, destination, overwrite = TRUE)) fail()
    }
    invisible(NULL)
  }
  rpc <- if (caller) "nexo_dataset_for_caller" else "nexo_dataset"
  raw <- request("POST", paste0(base, "/rest/v1/rpc/", rpc),
    jsonlite::toJSON(list(p_dataset_id = id), auto_unbox = TRUE), user_rpc = caller)
  rows <- tryCatch(jsonlite::fromJSON(rawToChar(raw), simplifyVector = FALSE), error = function(e) fail())
  if (identical(rows, list())) api_dataset_admin_fail(404L, "dataset_not_found")
  if (!is.list(rows) || length(rows) != 1L || !is.list(rows[[1L]])) fail()
  row <- rows[[1L]]
  text <- function(x) is.character(x) && length(x) == 1L && !is.na(x) && nzchar(x)
  if (!text(row$dataset_id) || tolower(row$dataset_id) != tolower(id) || !text(row$order_code) ||
      !is.numeric(row$version) || length(row$version) != 1L || is.na(row$version) ||
      row$version < 1 || row$version != floor(row$version) || !text(row$storage_path) ||
      !text(row$sha256) || !grepl("^[a-fA-F0-9]{64}$", row$sha256)) fail()
  if (caller && (!text(row$caller) || !text(row$client_id) ||
      !text(row$caller_view) || !row$caller_view %in% c("staff", "client"))) fail()
  segments <- strsplit(row$storage_path, "/", fixed = TRUE)[[1L]]
  if (startsWith(row$storage_path, "/") || any(segments %in% c("", ".", ".."))) fail()
  encoded <- paste(vapply(segments, utils::URLencode, character(1), reserved = TRUE, repeated = TRUE), collapse = "/")
  accepted <- FALSE
  on.exit(if (!accepted) unlink(path), add = TRUE)
  cached <- if (cache) api_dataset_workbooks[[tolower(row$sha256)]] else NULL
  if (!is.null(cached) && file.exists(cached)) {
    if (!file.copy(cached, path, overwrite = TRUE)) fail()
  } else {
    request("GET", paste0(base, "/storage/v1/object/authenticated/admin-files/", encoded), destination = path,
      refused = function() api_dataset_admin_fail(502L, "dataset_integrity_failed"))
    if (!identical(digest::digest(file = path, algo = "sha256"), tolower(row$sha256)))
      api_dataset_admin_fail(502L, "dataset_integrity_failed")
    if (cache) {
      cached <- tempfile("dataset-cache-", fileext = ".xlsx")
      if (!file.copy(path, cached, overwrite = TRUE)) fail()
      # Bound local cache storage; no token or signed URL is retained.
      if (length(ls(api_dataset_workbooks)) >= 8L) {
        key <- ls(api_dataset_workbooks)[[1L]]; unlink(api_dataset_workbooks[[key]])
        rm(list = key, envir = api_dataset_workbooks)
      }
      api_dataset_workbooks[[tolower(row$sha256)]] <- cached
    }
  }
  accepted <- TRUE
  provenance <- list(adminDatasetId = row$dataset_id, orderCode = row$order_code, version = row$version)
  if (caller) provenance$openedBy <- list(userId = row$caller, view = row$caller_view, clientId = row$client_id)
  provenance
}

# Who calls a checkpoint route (docs/integration/nexo-store-scope.md). NULL while LIPIDOMIC_ADMIN_REQUIRE_USER is not
# "1": the shared workspace, as before. On, list(staff, clients) from admin.nexo_caller() with the user's token; no rows
# is a caller without any scope. Answers are kept 60 s in memory, keyed by a digest: the token itself is never kept.
api_admin_caller_cache <- new.env(parent = emptyenv())
api_admin_caller <- function(authorization, required = identical(Sys.getenv("LIPIDOMIC_ADMIN_REQUIRE_USER"), "1")) {
  if (!required) return(NULL)
  if (!is.character(authorization) || length(authorization) != 1L || is.na(authorization) ||
      !grepl("^Bearer [^[:space:]]+$", authorization, ignore.case = TRUE)) api_dataset_admin_fail(401L, "admin_auth_required")
  now <- Sys.time()
  for (key in ls(api_admin_caller_cache))
    if (difftime(now, api_admin_caller_cache[[key]]$at, units = "secs") >= 60) rm(list = key, envir = api_admin_caller_cache)
  key <- digest::digest(authorization, algo = "sha256", serialize = FALSE)
  if (!is.null(api_admin_caller_cache[[key]])) return(api_admin_caller_cache[[key]]$caller)
  fail <- function() api_dataset_admin_fail(503L, "admin_datasets_unavailable")
  config <- Sys.getenv(c("LIPIDOMIC_ADMIN_SUPABASE_URL", "LIPIDOMIC_ADMIN_ANON_KEY"))
  if (any(!nzchar(trimws(config)))) fail()
  headers <- c(apikey = config[[2L]], Authorization = authorization, `Content-Profile` = "admin",
    `Accept-Profile` = "admin", `Content-Type` = "application/json")
  fetch <- getOption("lipidomic.admin.http_fetcher", api_dataset_admin_http)
  response <- tryCatch(fetch("POST", paste0(sub("/+$", "", config[[1L]]), "/rest/v1/rpc/nexo_caller"), headers, "{}"),
    error = function(e) if (grepl("HTTP error 401", conditionMessage(e), fixed = TRUE)) list(status = 401L) else NULL)
  if (!is.list(response) || length(response$status) != 1L || is.na(response$status)) fail()
  if (response$status == 401L) api_dataset_admin_fail(401L, "admin_auth_required")
  if (response$status < 200L || response$status >= 300L || !is.raw(response$body) || length(response$body) > 64 * 1024) fail()
  rows <- tryCatch(jsonlite::fromJSON(rawToChar(response$body), simplifyVector = FALSE), error = function(e) fail())
  if (!is.list(rows) || !all(vapply(rows, function(r) is.list(r) && is.character(r$caller_view) &&
      length(r$caller_view) == 1L && r$caller_view %in% c("staff", "client"), logical(1)))) fail()
  views <- vapply(rows, `[[`, character(1), "caller_view")
  ids <- lapply(rows[views == "client"], `[[`, "client_id")
  if (!all(vapply(ids, function(x) is.character(x) && length(x) == 1L && !is.na(x), logical(1)))) fail()
  clients <- unique(tolower(as.character(unlist(ids))))
  if (!all(grepl("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", clients))) fail()
  answer <- list(staff = any(views == "staff"), clients = clients, userId = if (length(rows)) rows[[1L]]$caller else NULL,
    membersPrepare = lapply(clients, function(id) any(vapply(rows, function(r) identical(tolower(r$client_id %||% ""), id) && isTRUE(r$members_prepare), logical(1)))))
  api_admin_caller_cache[[key]] <- list(at = now, caller = answer)
  answer
}
# Uploads into the shared store stay with lab staff once the switch is on.
api_admin_staff_only <- function(authorization) {
  caller <- api_admin_caller(authorization)
  if (!is.null(caller) && !caller$staff) api_abort("api_staff_only", "Uploads are for lab staff.")
  invisible(caller)
}

# Released workbooks live in the storage layer under "<workspace>-datasets" (Admin's release step).
api_dataset_project <- function() api_storage_project(paste0(api_workspace(), "-datasets"))
api_dataset_route <- function(req, res) tryCatch({
  admin <- NULL
  collab <- NULL
  type <- req$HTTP_CONTENT_TYPE %||% ""
  tmp <- tempfile("dataset-", fileext = ".xlsx"); on.exit(unlink(tmp))
  if (grepl("^multipart/form-data", type)) {
    api_admin_staff_only(api_admin_authorization(req))
    parts <- req$body
    part <- function(name) {
      found <- Filter(function(x) is.list(x) && identical(x$name, name), parts)
      if (length(found) > 1L) api_abort("api_bad_request", paste("Duplicate multipart field:", name))
      if (length(found)) found[[1L]] else NULL
    }
    file <- part("file")
    if (is.null(file) || !is.raw(file$value)) api_abort("api_bad_request", "Expected multipart file field.")
    if (length(file$value) > 90 * 1024^2) api_abort("api_too_large", "Dataset exceeds 90 MiB.")
    writeBin(file$value, tmp)
    name <- basename(file$filename %||% "dataset.xlsx")
    raw <- part("settings")
    settings <- if (is.null(raw)) list() else tryCatch(jsonlite::fromJSON(rawToChar(raw$value), simplifyVector = FALSE),
      error = function(e) api_abort("api_bad_request", "settings must be a JSON object."))
  } else {
    body <- req$body
    if (is.null(body) || identical(body, "")) body <- list()
    if (!is.list(body) || (length(body) && is.null(names(body)))) api_abort("api_bad_request", "Expected a JSON object.")
    collab <- body$collab
    collab_caller <- api_collab_open(req, collab)
    if (!is.null(body$adminDatasetId)) {
      id <- body$adminDatasetId
      if (!is.character(id) || length(id) != 1L || is.na(id) ||
          !(api_upload_id(id) || grepl("^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$", id)) ||
          !is.null(body$datasetId)) api_abort("api_bad_request", "Expected one adminDatasetId (uuid).")
      admin <- api_dataset_admin(id, tmp, api_admin_authorization(req), collab_caller)
      name <- paste0(admin$orderCode, "-v", admin$version, ".xlsx")
    } else {
      if (is.null(collab_caller)) api_admin_staff_only(api_admin_authorization(req))
      id <- body$datasetId
      if (!api_storage_id(id)) api_abort("api_bad_request", "Expected adminDatasetId (uuid), datasetId (sha256) or a multipart file.")
      if (!file.copy(api_store()$load(if (is.null(collab_caller)) api_dataset_project() else
          api_storage_project(paste0(body$collab$workspace, "-datasets")), id), tmp, overwrite = TRUE))
        api_abort("api_unavailable", "Cannot read the stored dataset.")
      name <- paste0("dataset-", substr(id, 1L, 12L), ".xlsx")
    }
    settings <- body$settings
  }
  response <- api_dataset_session_response(api_dataset_session(tmp, settings, name, admin, collab))
  response
}, api_dataset_admin_error = function(e) {
  res$status <- e$status
  list(error = e$error, message = e$error)
}, api_dataset_choices = function(e) { res$status <- 422L; e$payload })

# Basic auth remains in Authorization on the public deployment.
api_admin_authorization <- function(req) {
  token <- req$HTTP_X_NEXO_ADMIN_TOKEN
  if (!is.null(token)) return(paste("Bearer", token))
  authorization <- req$HTTP_AUTHORIZATION
  if (is.character(authorization) && length(authorization) == 1L && !is.na(authorization) &&
      grepl("^Bearer [^[:space:]]+$", authorization, ignore.case = TRUE)) return(authorization)
  NULL
}

api_dataset_detection_input <- function(dataset) {
  df <- as.data.frame(readxl::read_excel(dataset$abundance, sheet = "Abundance", na = c("", "N/A", "NA")))
  names(df)[1L] <- "Lipid_Name"
  md <- dataset$snapshot$data
  for (key in c("Group1", "Group2")) md[[key]] <- if (key %in% names(dataset$snapshot$mappings))
    md[[dataset$snapshot$mappings[[key]]]] else "Unspecified"
  list(data = df, metadata = md)
}
api_dataset_preview <- function(dataset, settings) {
  input <- api_dataset_detection_input(dataset)
  samples <- unlist(settings$samples, use.names = FALSE)
  p <- tryCatch(preparation_detection_preview(input$data, samples, settings$minDetectionPct,
    settings$dropNonDetected, settings$detectionScope, input$metadata),
    error = function(e) api_abort("api_unprocessable", conditionMessage(e)))
  observed <- is.finite(as.matrix(input$data[, samples, drop = FALSE])) & as.matrix(input$data[, samples, drop = FALSE]) > 0
  detected <- rowSums(observed)
  list(kept = p$retained, total = p$input, leftOut = I(input$data$Lipid_Name[!p$keep]),
    histogram = lapply(0:length(samples), function(n) list(detectedIn = n,
      kept = sum(detected == n & p$keep), leftOut = sum(detected == n & !p$keep))),
    samples = length(samples), missing = list(values = sum(!observed), cells = length(observed)))
}

api_datasets_list <- function(authorization) {
  if (!is.character(authorization) || length(authorization) != 1L || is.na(authorization) ||
      !grepl("^Bearer [^[:space:]]+$", authorization, ignore.case = TRUE))
    api_dataset_admin_fail(401L, "admin_auth_required")
  fail <- function() api_dataset_admin_fail(503L, "admin_datasets_unavailable")
  config <- Sys.getenv(c("LIPIDOMIC_ADMIN_SUPABASE_URL", "LIPIDOMIC_ADMIN_ANON_KEY"))
  if (any(!nzchar(trimws(config)))) fail()
  headers <- c(apikey = config[[2L]], Authorization = authorization, `Content-Profile` = "admin",
    `Accept-Profile` = "admin", `Content-Type` = "application/json")
  fetch <- getOption("lipidomic.admin.http_fetcher", api_dataset_admin_http)
  response <- tryCatch(fetch("POST", paste0(sub("/+$", "", config[[1L]]), "/rest/v1/rpc/nexo_datasets_for_caller"), headers, "{}"),
    error = function(e) if (grepl("HTTP error 401", conditionMessage(e), fixed = TRUE)) list(status = 401L) else NULL)
  if (!is.list(response) || length(response$status) != 1L || is.na(response$status)) fail()
  if (response$status == 401L) api_dataset_admin_fail(401L, "admin_auth_required")
  if (response$status < 200L || response$status >= 300L || !is.raw(response$body) || length(response$body) > 64 * 1024) fail()
  rows <- tryCatch(jsonlite::fromJSON(rawToChar(response$body), simplifyVector = FALSE), error = function(e) fail())
  fields <- c(adminDatasetId = "dataset_id", orderCode = "order_code", version = "version", clientId = "client_id",
    clientName = "client_name", releasedAt = "released_at", membersPrepare = "members_prepare")
  if (!is.list(rows) || !all(vapply(rows, function(row) is.list(row) && all(fields %in% names(row)), logical(1)))) fail()
  # membersPrepare: the caller is a client member whose client prepares (C5), from the nexo_caller rows the checkpoint
  # scope reads, so Start offers the Excel upload with nothing released too.
  caller <- api_admin_caller(authorization, required = TRUE)
  list(datasets = unname(lapply(rows, function(row) stats::setNames(row[fields], names(fields)))),
    membersPrepare = any(vapply(caller$membersPrepare, isTRUE, logical(1))))
}

api_dataset_preview_route <- function(req, res) tryCatch({
  body <- req$body
  if (!is.list(body) || is.null(names(body))) api_abort("api_bad_request", "Expected a JSON object.")
  id <- body$adminDatasetId
  if (!is.character(id) || length(id) != 1L || is.na(id) ||
      !(api_upload_id(id) || grepl("^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$", id)))
    api_abort("api_bad_request", "Expected adminDatasetId (uuid).")
  authorization <- api_admin_authorization(req)
  if (is.null(authorization)) api_dataset_admin_fail(401L, "admin_auth_required")
  path <- tempfile(fileext = ".xlsx"); on.exit(unlink(path))
  admin <- api_dataset_admin(id, path, authorization, cache = TRUE)
  dataset <- api_dataset_read(path); on.exit(unlink(dataset$abundance), add = TRUE)
  required <- c("samples", "minDetectionPct", "detectionScope", "dropNonDetected")
  if (!all(required %in% names(body))) api_abort("api_bad_request", "Expected samples and detection settings.")
  api_dataset_preview(dataset, body)
}, api_dataset_admin_error = function(e) { res$status <- e$status; list(error = e$error, message = e$error) })

api_dataset_quality <- function(s) {
  result <- api_read(s, s$shared$pca_results())
  scores <- result$replicate_score_df %||% result$score_df
  # Exact global outlier rule of qc_boxplot_server's private outlierScores reactive.
  # Team does not publish that reactive; the PCA itself is Team's shared result.
  two <- "PC2" %in% names(scores)
  pc2 <- if (two) scores$PC2 else rep(0, nrow(scores))
  distance <- if (two) sqrt((scores$PC1 - mean(scores$PC1))^2 + (pc2 - mean(pc2))^2) else rep(0, nrow(scores))
  deviation <- stats::mad(distance, na.rm = TRUE)
  if (deviation == 0) deviation <- 1e-6
  flagged <- (distance - stats::median(distance, na.rm = TRUE)) / deviation > 2.5
  prepared <- api_read(s, s$shared$data_processed_allow_missing())
  ids <- intersect(scores$FullName, names(prepared))
  list(pca = lapply(seq_len(nrow(scores)), function(i) list(sample = scores$FullName[[i]], group = scores$Group1[[i]],
    pc1 = scores$PC1[[i]], pc2 = pc2[[i]], distance = distance[[i]], flagged = flagged[[i]])),
    limit = 2.5, variance = I(utils::head(result$var_PC, 2L)),
    spread = lapply(ids, function(id) {
      # Same log2 scale as Team's boxplotAfterPlotObj.
      values <- log2(pmax(prepared[[id]], 0) + 1)
      quantiles <- stats::quantile(values, c(.25, .5, .75), na.rm = TRUE, names = FALSE)
      list(sample = id, group = scores$Group1[match(id, scores$FullName)], median = quantiles[[2L]], q1 = quantiles[[1L]], q3 = quantiles[[3L]])
    }), missing = s$dataset_missing %||% list())
}

source(file.path(if (exists("api_run_dir")) api_run_dir else if (file.exists("dataset_upload.R")) "." else "frontends/nexo-api", "dataset_upload.R"))
