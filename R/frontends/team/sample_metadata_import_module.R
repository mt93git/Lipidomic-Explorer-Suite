sample_metadata_import_ui <- function(id) {
  ns <- shiny::NS(id)
  shiny::tagList(
    shiny::h4("Sample metadata"),
    shiny::p("Add a CSV or XLSX table with one row per sample. Sample identifiers must exactly match the abundance matrix column names, including case and leading zeros."),
    shiny::fileInput(ns("file"), "Sample metadata file", accept = c(".csv", ".xlsx")),
    shiny::uiOutput(ns("identifier_ui")),
    shiny::uiOutput(ns("mapping_ui")),
    shiny::uiOutput(ns("match_summary")),
    shiny::tableOutput(ns("match_preview")),
    shiny::uiOutput(ns("confirm_ui")),
    shiny::uiOutput(ns("status"))
  )
}

# sample_ids is the reactive vector of matrix column names. on_confirm is an
# optional callback supplied by the shared-data module; it receives an immutable
# snapshot list(data, mappings, id_column) only after explicit confirmation.
sample_metadata_import_server <- function(id, sample_ids, on_confirm = NULL) {
  shiny::moduleServer(id, function(input, output, session) {
    confirmed <- shiny::reactiveVal(NULL)
    status <- shiny::reactiveVal(NULL)
    metadata <- shiny::reactive({
      f <- input$file
      shiny::req(f)
      read_sample_metadata_file(f$datapath, f$name)
    })

    output$identifier_ui <- shiny::renderUI({
      df <- metadata()
      shiny::selectInput(session$ns("id_column"), "Column containing sample identifier",
                         choices = c("Choose a column" = "", names(df)), selected = "")
    })
    output$mapping_ui <- shiny::renderUI({
      df <- metadata()
      shiny::req(nzchar(input$id_column %||% ""))
      choices <- c("Keep existing design field" = "", setdiff(names(df), input$id_column))
      fields <- c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint")
      labels <- c("Condition / Group 1", "Tissue / Group 2", "Replicate", "Donor / Patient number", "Time point")
      shiny::tagList(
        shiny::p("Optional design mappings. Choosing a column replaces that design field for every matched sample; unmapped columns remain descriptive metadata."),
        lapply(seq_along(fields), function(i) shiny::selectInput(
          session$ns(paste0("map_", fields[i])), labels[i], choices = choices, selected = ""))
      )
    })

    selected_mappings <- shiny::reactive({
      fields <- c("Group1", "Group2", "Replicate", "PatientNumber", "TimePoint")
      values <- vapply(fields, function(field) input[[paste0("map_", field)]] %||% "", character(1))
      values[nzchar(values)]
    })
    preview <- shiny::reactive({
      shiny::req(nzchar(input$id_column %||% ""))
      preview_sample_metadata_match(metadata(), input$id_column, sample_ids())
    })
    mapping_problem <- shiny::reactive({
      p <- preview()
      if (!p$valid) return("Resolve sample identifier matching errors.")
      tryCatch({
        probe <- data.frame(FullName = p$matched$FullName, stringsAsFactors = FALSE)
        merge_confirmed_sample_metadata(probe, p$matched, selected_mappings())
        NULL
      }, error = function(e) conditionMessage(e))
    })
    can_confirm <- shiny::reactive(is.null(tryCatch(mapping_problem(), error = function(e) "Upload and match metadata first.")))
    output$confirm_ui <- shiny::renderUI({
      button <- shiny::actionButton(session$ns("confirm"), "Confirm sample metadata",
                                    class = "btn-primary")
      if (!can_confirm()) button <- shiny::tagAppendAttributes(button, disabled = "disabled")
      button
    })
    output$match_summary <- shiny::renderUI({
      p <- preview()
      pieces <- c(sprintf("%d of %d matrix samples matched", p$matched_count, p$sample_count),
                  sprintf("%d unmatched matrix samples", length(p$missing_samples)),
                  sprintf("%d unused metadata rows", length(p$unused_ids)),
                  sprintf("%d duplicate identifiers", length(p$duplicate_ids)),
                  sprintf("%d blank identifiers", length(p$blank_rows)),
                  sprintf("%d empty matched metadata values", p$missing_values))
      problem <- mapping_problem()
      shiny::div(class = if (is.null(problem)) "alert alert-info" else "alert alert-warning",
                 shiny::strong(if (is.null(problem)) "Ready to confirm" else "Resolve matching errors"),
                 shiny::tags$ul(lapply(pieces, shiny::tags$li)),
                 if (!is.null(problem)) shiny::p(problem),
                 if (length(p$missing_samples)) shiny::p("Unmatched samples: ", paste(utils::head(p$missing_samples, 8L), collapse = ", ")),
                 if (length(p$duplicate_ids)) shiny::p("Duplicate IDs: ", paste(utils::head(p$duplicate_ids, 8L), collapse = ", ")))
    })
    output$match_preview <- shiny::renderTable({
      p <- preview()
      ids <- sample_ids()
      shown <- utils::head(ids, 10L)
      rows <- match(shown, metadata()[[input$id_column]])
      result <- data.frame(Matrix_sample = shown, Metadata_row = rows,
                           stringsAsFactors = FALSE)
      mapped <- selected_mappings()
      for (target in names(mapped)) result[[target]] <- metadata()[[mapped[[target]]]][rows]
      extras <- setdiff(names(metadata()), c(input$id_column, unname(mapped)))
      for (field in utils::head(extras, 3L)) {
        label <- if (field %in% names(result)) paste0("Imported: ", field) else field
        result[[label]] <- metadata()[[field]][rows]
      }
      result
    }, rownames = FALSE)
    output$status <- shiny::renderUI({
      msg <- status()
      if (is.null(msg)) return(NULL)
      shiny::div(role = "status", class = if (isTRUE(msg$ok)) "text-success" else "text-danger", msg$text)
    })
    shiny::observeEvent(input$file, { confirmed(NULL); status(NULL) })
    shiny::observeEvent(sample_ids(), { confirmed(NULL); status(NULL) }, ignoreInit = TRUE)
    shiny::observeEvent(list(input$id_column, selected_mappings()), {
      old <- shiny::isolate(confirmed())
      if (!is.null(old) &&
          (!identical(old$id_column, input$id_column) ||
           !identical(old$mappings, selected_mappings()))) {
        confirmed(NULL)
        status(list(ok = FALSE, text = "Selections changed. Review the preview and confirm again; previously applied metadata remains active until then."))
      }
    }, ignoreInit = TRUE)
    shiny::observeEvent(input$confirm, {
      result <- tryCatch({
        p <- preview()
        if (!p$valid) stop("Resolve duplicate, blank, and unmatched sample identifiers before confirming.")
        mappings <- selected_mappings()
        if (anyDuplicated(unname(mappings))) stop("A metadata column can map to only one design field.")
        snapshot <- list(data = p$matched, mappings = mappings, id_column = input$id_column)
        # Check mapped fields, without changing canonical state during preview.
        probe <- data.frame(FullName = snapshot$data$FullName, stringsAsFactors = FALSE)
        merge_confirmed_sample_metadata(probe, snapshot$data, mappings)
        if (is.function(on_confirm)) on_confirm(snapshot)
        confirmed(snapshot)
        status(list(ok = TRUE, text = "Sample metadata confirmed. Review the design before updating prepared data."))
        TRUE
      }, error = function(e) {
        status(list(ok = FALSE, text = conditionMessage(e)))
        FALSE
      })
      invisible(result)
    })
    shiny::reactive(confirmed())
  })
}
