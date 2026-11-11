# Shared analysis settings (Team's sidebar: "Run comparison" and the global filters).
# They are live inputs of the shared data module (data_hub): the differential analysis
# and the class/chain filters react to them directly, without "Prepare data". Nexo lists
# them from Team's own sidebar markup and sets them as the sidebar would. Sample selection
# changes the preparation and stays in Team (phase 2); the palette editor is separate.
api_analysis_sections <- c("Differential Expression", "Lipid Class Filters",
  "Advanced Saturation & Chains", "Granular Chain Filters", "Pathway Substrates")
api_analysis_prefix <- "data_hub-"

api_analysis_doc <- local({
  cache <- NULL
  function() {
    if (is.null(cache)) cache <<- xml2::read_html(htmltools::renderTags(shared_data_ui("data_hub"))$html)
    cache
  }
})
# The accordion section and conditionalPanel condition around the element with this id.
api_analysis_place <- function(doc, id) {
  node <- xml2::xml_find_first(doc, sprintf("//*[@id='%s']", id))
  if (inherits(node, "xml_missing")) return(NULL)
  item <- xml2::xml_find_first(node, "ancestor::*[contains(concat(' ',@class,' '),' accordion-item ')][1]")
  if (inherits(item, "xml_missing")) return(NULL)
  title <- xml2::xml_attr(item, "data-value")
  cond <- xml2::xml_find_first(node, "ancestor::*[@data-display-if][1]")
  # Some checkbox groups have no label of their own: Team shows the group heading above them.
  group <- xml2::xml_find_first(node, "preceding::*[contains(concat(' ',@class,' '),' dock-group-label ')][1]")
  group <- if (inherits(group, "xml_missing") ||
    !identical(xml2::xml_attr(xml2::xml_find_first(group, "ancestor::*[contains(concat(' ',@class,' '),' accordion-item ')][1]"), "data-value"), title))
    NULL else trimws(xml2::xml_text(group))
  list(section = title, condition = if (inherits(cond, "xml_missing")) NULL else xml2::xml_attr(cond, "data-display-if"),
    group = if (length(group) && nzchar(group)) group else NULL)
}

api_analysis_controls <- function(s) {
  doc <- api_analysis_doc(); prefix <- api_analysis_prefix
  placed <- function(controls, fallback = NULL) {
    out <- list()
    for (control in controls) {
      if ((control$type %||% "") %in% c("action", "file")) next
      place <- api_analysis_place(doc, paste0(prefix, control$id)) %||% fallback
      if (is.null(place) || !place$section %in% api_analysis_sections) next
      control$section <- place$section
      if (!nzchar(control$label %||% "") && !is.null(place$group)) control$label <- place$group
      control["condition"] <- list(place$condition)
      out[[length(out) + 1L]] <- control
    }
    out
  }
  controls <- placed(api_schema_from_doc(doc, prefix))
  # Selectors the module builds on the server (reference/comparison groups, class lists,
  # chain sliders): read the rendered markup of each renderUI slot inside a section.
  slots <- xml2::xml_attr(xml2::xml_find_all(doc, "//*[contains(concat(' ',@class,' '),' shiny-html-output ')][@id]"), "id")
  # Data slots wait behind the lazy gate until asked (H9 cold open): open every slot of a section, then flush once
  # so slots that build on each other settle before they are read.
  wanted <- Filter(function(slot) { place <- api_analysis_place(doc, slot); !is.null(place) && place$section %in% api_analysis_sections },
    slots[startsWith(slots, prefix)])
  if (any(vapply(wanted, function(slot) isTRUE(api_output_want(s, slot)), logical(1)))) api_flush(s)
  for (slot in slots[startsWith(slots, prefix)]) {
    place <- api_analysis_place(doc, slot)
    if (is.null(place) || !place$section %in% api_analysis_sections) next
    value <- tryCatch(api_read(s, s$mock$getOutput(slot)), error = function(e) NULL)
    html <- if (is.list(value) && is.character(value$html)) value$html else
      if (is.character(value) && length(value) == 1L && grepl("<", value, fixed = TRUE)) value else NULL
    if (is.null(html)) next
    live <- placed(api_schema_from_doc(tryCatch(xml2::read_html(html), error = function(e) NULL), prefix), place)
    ids <- vapply(controls, `[[`, character(1), "id")
    for (control in live) if (!control$id %in% ids) controls[[length(controls) + 1L]] <- control
  }
  # Choices the module sends at run time (updateSelectInput, updateCheckboxGroupInput…).
  for (i in seq_along(controls)) {
    sent <- s$bus$choices[[paste0(prefix, controls[[i]]$id)]]
    if (length(sent$values)) controls[[i]]$options <- unname(Map(function(v, l) list(value = v, label = l),
      sent$values, sent$labels %||% sent$values))
  }
  api_read(s, lapply(controls, function(control) {
    control["value"] <- list(tryCatch(s$mock$input[[paste0(prefix, control$id)]], error = function(e) NULL))
    control
  }))
}

api_analysis_schema <- function(s) {
  controls <- api_analysis_controls(s)
  sections <- lapply(api_analysis_sections, function(title) {
    mine <- Filter(function(x) identical(x$section, title), controls)
    if (length(mine)) list(title = title, controls = unname(mine)) else NULL
  })
  list(sections = Filter(Negate(is.null), sections), design = api_design_state(s), deState = api_de_state(s))
}

api_analysis_update <- function(s, inputs) {
  api_mutation(s, NULL, NULL, (function() {
  if (!is.list(inputs) || !length(inputs) || is.null(names(inputs)) || any(!nzchar(names(inputs))))
    api_abort("api_bad_request", "Expected named analysis settings.")
  controls <- api_analysis_controls(s)
  ids <- vapply(controls, `[[`, character(1), "id")
  unknown <- setdiff(names(inputs), ids)
  if (length(unknown)) api_abort("api_bad_request", paste0("Not an analysis setting: ", paste(unknown, collapse = ", ")))
  inputs <- api_validate_inputs(controls, inputs)
  # Team's browser sends every sidebar control's value as soon as it binds. A checkpoint
  # that never saved them (legacy or synthetic) leaves them unset here, so send the
  # markup defaults the browser would have sent for the controls left untouched.
  for (control in controls) if (is.null(control$value) && !is.null(control$default) && !control$id %in% names(inputs))
    inputs[control$id] <- list(control$default)
  api_session_dirty(s)
  # Part of every card's disk-cache key (render_disk.R).
  s$analysis_explicit <- utils::modifyList(s$analysis_explicit %||% list(), inputs, keep.null = TRUE)
  # data_hub ids are not card ids, so api_inputs bumps the session epoch: every card redraws.
  do.call(api_inputs, c(list(s), stats::setNames(inputs, paste0(api_analysis_prefix, names(inputs)))))
  api_flush(s)
  api_analysis_schema(s)
  })())
}
