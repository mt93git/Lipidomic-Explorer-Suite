# Excel uploads reuse Team's sheet gate, reader and metadata confirmation checks.
local({
  root <- if (dir.exists("R")) "." else file.path(if (exists("api_run_dir")) api_run_dir else ".", "../..")
  for (file in c("R/frontends/team/upload_formats.R", "R/frontends/team/sheet_picker.R", "R/sample_metadata_import.R"))
    source(file.path(root, file), local = globalenv())
})
api_upload_choice <- function(name, label, choices) {
  api_dataset_fail("upload_choices_required", "Choose how to read this workbook.",
    missing = list(list(name = name, label = label, choices = I(choices))))
}
api_upload_read <- function(path, name, choices, metadata_file = NULL) {
  tryCatch({
    sheets <- team_sheet_list(path, name)
    sheet <- choices$sheet
    if (is.null(sheet)) {
      if (length(sheets) > 1L) api_upload_choice("sheet", "Abundance worksheet", c(sheets, "__all__"))
      sheet <- sheets[[1L]]
    }
    if (!sheet %in% c(sheets, "__all__")) stop("Choose an existing worksheet.")
    input <- path; input_name <- name
    if (sheet != "__all__") {
      input <- tempfile(fileext = ".csv"); on.exit(unlink(input), add = TRUE)
      team_sheet_extract(path, name, sheet, input)
      # load_one_file is Team's Excel reader; its CSV path lives in shared_data.
      selected <- tempfile(fileext = ".xlsx"); on.exit(unlink(selected), add = TRUE)
      openxlsx::write.xlsx(list(Abundance = utils::read.csv(input, check.names = FALSE)), selected, overwrite = TRUE)
      input <- selected
    }
    mock <- shiny::MockShinySession$new(); on.exit(mock$close(), add = TRUE)
    abundance <- shiny::withReactiveDomain(mock, load_one_file(input, input_name))
    if (is.null(abundance) || ncol(abundance) < 2L || !nrow(abundance)) stop("File or sheet seems empty.")
    ids <- setdiff(names(abundance), "Lipid_Name")
    metadata <- data.frame(FullName = ids, stringsAsFactors = FALSE)
    mappings <- character()
    meta_sheet <- choices$metadataSheet
    if (!is.null(metadata_file)) meta_sheet <- "__file__"
    if (is.null(meta_sheet)) api_upload_choice("metadataSheet", "Sample labels worksheet", c(sheets, "__none__"))
    if (meta_sheet != "__none__") {
      if (is.null(metadata_file) && !meta_sheet %in% sheets) stop("Choose an existing worksheet.")
      meta_path <- tempfile(fileext = ".xlsx"); on.exit(unlink(meta_path), add = TRUE)
      if (is.null(metadata_file)) {
        wb <- openxlsx::loadWorkbook(path)
        for (other in setdiff(names(wb), meta_sheet)) openxlsx::removeWorksheet(wb, other)
        openxlsx::saveWorkbook(wb, meta_path, overwrite = TRUE)
        meta <- team_read_sample_metadata_file(meta_path, "labels.xlsx")
      } else meta <- team_read_sample_metadata_file(metadata_file$path, metadata_file$name)
      if (is.null(choices$idColumn)) api_upload_choice("idColumn", "Column containing sample identifier", names(meta))
      p <- preview_sample_metadata_match(meta, choices$idColumn, ids)
      if (!p$valid) stop("Resolve duplicate, blank, and unmatched sample identifiers before confirming.")
      metadata <- p$matched
      mappings <- unlist(choices$mappings %||% list(), use.names = TRUE)
      if (is.null(choices$mappings)) {
        labels <- c(Group1 = "Condition / Group 1", Group2 = "Tissue / Group 2", Replicate = "Replicate",
          PatientNumber = "Donor / Patient number", TimePoint = "Time point")
        for (field in names(api_dataset_mappings)) {
          key <- paste0("map", field)
          if (is.null(choices[[key]])) api_upload_choice(key, labels[[field]], c("__none__", setdiff(names(meta), choices$idColumn)))
          if (choices[[key]] != "__none__") mappings[[field]] <- choices[[key]]
        }
      }
      if (anyDuplicated(unname(mappings))) stop("A metadata column can map to only one design field.")
      merge_confirmed_sample_metadata(data.frame(FullName = ids), metadata, mappings)
    }
    # Encode the confirmed import as the existing v1 transport. Values come from Team,
    # and only explicitly mapped design fields are included; no design is inferred.
    canonical <- data.frame(FullName = ids, stringsAsFactors = FALSE)
    for (field in names(api_dataset_mappings)) canonical[[api_dataset_mappings[[field]]]] <-
      if (field %in% names(mappings)) metadata[[mappings[[field]]]] else rep("", length(ids))
    names(abundance)[1L] <- "Lipid"
    out <- tempfile(fileext = ".xlsx")
    wb <- openxlsx::createWorkbook()
    tables <- list(Abundance = abundance, Metadata = canonical, Internal_Standards = data.frame(),
      QC_Injections = data.frame(), Provenance = data.frame(key = "dataset_format", value = "1"))
    for (s in names(tables)) { openxlsx::addWorksheet(wb, s); openxlsx::writeData(wb, s, tables[[s]]) }
    openxlsx::saveWorkbook(wb, out, overwrite = TRUE)
    out
  }, error = function(e) {
    if (inherits(e, "api_dataset_choices")) stop(e)
    api_dataset_fail("upload_invalid", conditionMessage(e))
  })
}

api_upload_uuid <- function() {
  hex <- api_session_random_hex(16L)
  paste0("upload-", substr(hex, 1, 8), "-", substr(hex, 9, 12), "-", substr(hex, 13, 16), "-", substr(hex, 17, 20), "-", substr(hex, 21, 32))
}
api_upload_id <- function(id) is.character(id) && length(id) == 1L && !is.na(id) &&
  grepl("^upload-[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$", id)

api_dataset_upload_route <- function(req, res) tryCatch({
  caller <- api_admin_caller(api_admin_authorization(req), required = TRUE)
  parts <- req$body
  part <- function(key) {
    found <- Filter(function(x) is.list(x) && identical(x$name, key), parts)
    if (length(found) > 1L) api_abort("api_bad_request", "Duplicate multipart field.")
    if (length(found)) found[[1L]] else NULL
  }
  text <- function(key) { p <- part(key); if (is.null(p)) NULL else rawToChar(p$value) }
  workspace <- text("workspace")
  if (!isTRUE(caller$staff)) {
    allowed <- caller$clients[vapply(caller$membersPrepare, isTRUE, logical(1))]
    if (!length(allowed)) api_dataset_admin_fail(403L, "lab_prepares")
    if (is.null(workspace)) {
      if (length(allowed) != 1L) api_upload_choice("workspace", "Client workspace", vapply(allowed, api_client_workspace, character(1)))
      workspace <- api_client_workspace(allowed[[1L]])
    }
    if (!workspace %in% vapply(allowed, api_client_workspace, character(1))) api_dataset_admin_fail(403L, "lab_prepares")
  }
  workspace <- api_storage_project(workspace %||% api_workspace())
  file <- part("file")
  if (is.null(file) || !is.raw(file$value)) api_abort("api_bad_request", "Expected multipart file field.")
  if (length(file$value) > team_sheet_max_bytes) api_abort("api_too_large", "Excel workbooks up to 50 MB can be loaded.")
  name <- basename(file$filename %||% "workbook.xlsx")
  if (!team_sheet_is_excel(name)) api_abort("api_bad_request", "Choose an Excel workbook.")
  choices <- tryCatch(jsonlite::fromJSON(text("choices") %||% "{}", simplifyVector = FALSE),
    error = function(e) api_abort("api_bad_request", "choices must be a JSON object."))
  if (!is.list(choices) || (length(choices) && is.null(names(choices)))) api_abort("api_bad_request", "choices must be a JSON object.")
  # A workspace choice is returned alongside workbook choices for multi-client members.
  if (!is.null(choices$workspace)) api_abort("api_bad_request", "Send workspace as a multipart field.")
  path <- tempfile(fileext = paste0(".", tools::file_ext(name))); on.exit(unlink(path))
  writeBin(file$value, path)
  labels <- part("metadataFile"); metadata_file <- NULL
  if (!is.null(labels)) {
    if (!is.raw(labels$value)) api_abort("api_bad_request", "Expected sample labels file.")
    label_path <- tempfile(); on.exit(unlink(label_path), add = TRUE)
    if (length(labels$value) > 20 * 1024^2) api_abort("api_too_large", "The metadata file is missing or exceeds the 20 MB limit.")
    writeBin(labels$value, label_path)
    metadata_file <- list(path = label_path, name = basename(labels$filename %||% "labels.csv"))
  }
  prepared <- api_upload_read(path, name, choices, metadata_file); on.exit(unlink(prepared), add = TRUE)
  id <- api_upload_uuid()
  wb <- openxlsx::loadWorkbook(prepared)
  openxlsx::writeData(wb, "Provenance", data.frame(key = "upload_id", value = id), startRow = 3L, colNames = FALSE)
  openxlsx::saveWorkbook(wb, prepared, overwrite = TRUE)
  project <- api_storage_project(paste0(workspace, "-datasets"))
  # Keep the original workbook as well as the confirmed transport in the existing store.
  api_store()$save(project, path, paste0(id, "-source"))
  if (!is.null(metadata_file)) api_store()$save(project, metadata_file$path, paste0(id, "-labels"))
  record <- api_store()$save(project, prepared, id, lineage = workspace)
  # The shared index contains the transport, but resolution checks its recorded workspace
  # before returning bytes. Staff may open uploads from any workspace.
  api_store()$save(api_dataset_project(), prepared, id, lineage = workspace)
  list(adminDatasetId = record$name)
}, api_dataset_admin_error = function(e) { res$status <- e$status; list(error = e$error, message = e$error) },
 api_dataset_choices = function(e) { res$status <- 422L; e$payload })

api_upload_resolve <- function(id, path, authorization, service = NULL, cache = FALSE) {
  caller <- if (is.null(service)) api_admin_caller(authorization, required = TRUE) else service
  rows <- Filter(function(x) identical(x$name, id), api_store()$list(api_dataset_project()))
  if (!length(rows)) api_dataset_admin_fail(404L, "dataset_not_found")
  row <- rows[[1L]]
  if (!isTRUE(caller$staff) && !row$lineage %in% api_caller_workspaces(caller)) api_dataset_admin_fail(404L, "dataset_not_found")
  api_store()$load(api_storage_project(paste0(row$lineage, "-datasets")), row$id, path)
  client <- if (startsWith(row$lineage, "nexo-client-")) sub("^nexo-client-", "", row$lineage) else NULL
  list(adminDatasetId = id, orderCode = "Uploaded workbook", version = 1L,
    openedBy = list(userId = caller$userId %||% caller$actor, view = if (isTRUE(caller$staff)) "staff" else "client", clientId = client))
}
