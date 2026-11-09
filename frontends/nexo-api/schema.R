# Schema metadata comes from the same markup and default reader as Team.
api_schema_from_doc <- function(doc, prefix = "tcinstance_schema-") {
  if (is.null(doc)) return(list())
  # Normalize a copy for Team's fixed-namespace default reader; never mutate a cached doc.
  normalized <- xml2::read_html(gsub(prefix, "tcinstance_schema-", as.character(doc), fixed = TRUE))
  defaults <- team_plot_instance_doc_defaults(normalized)
  attr <- function(node, key) { x <- xml2::xml_attr(node, key); if (is.na(x)) NULL else x }
  text <- function(node) { x <- trimws(xml2::xml_text(node)); if (is.na(x) || !nzchar(x)) NULL else x }
  cls <- function(node, key) key %in% strsplit(attr(node, "class") %||% "", "\\s+")[[1L]]
  number <- function(node, key) { x <- suppressWarnings(as.numeric(attr(node, key))); if (length(x) == 1L && is.finite(x)) x else NULL }
  fields <- xml2::xml_find_all(doc, "//select[@id] | //textarea[@id] | //input[@id] | //*[@id and (contains(concat(' ',@class,' '),' shiny-input-radiogroup ') or contains(concat(' ',@class,' '),' shiny-input-checkboxgroup ') or contains(concat(' ',@class,' '),' shiny-tab-input ') or contains(concat(' ',@class,' '),' action-button '))]")
  out <- list()
  tab_titles <- list()
  labels <- xml2::xml_find_all(doc, "//label[@for]")
  for (node in fields) {
    full <- attr(node, "id")
    if (!startsWith(full, prefix)) next
    id <- substring(full, nchar(prefix) + 1L)
    if (id %in% names(out)) next
    tag <- xml2::xml_name(node); kind <- attr(node, "type") %||% ""
    multiple <- !is.null(attr(node, "multiple"))
    type <- if (cls(node, "action-button")) "action" else if (cls(node, "shiny-tab-input")) "tabs" else
      if (cls(node, "shiny-input-radiogroup")) "radio" else if (cls(node, "shiny-input-checkboxgroup")) "checkboxgroup" else
      if (tag == "select") { if (multiple) "multiselect" else "select" } else
      if (tag == "textarea") "textarea" else if (cls(node, "js-range-slider") || kind == "range") "range" else
      if (cls(node, "shiny-colour-input") || kind == "color") "color" else
      switch(kind, checkbox = "boolean", number = "number", text = "text", file = "file", NULL)
    if (is.null(type)) next
    label_nodes <- labels[xml2::xml_attr(labels, "for") == full]
    label <- if (length(label_nodes)) text(label_nodes[[1L]]) else NULL
    if (is.null(label)) label <- text(xml2::xml_find_first(node, "ancestor::*[contains(concat(' ',@class,' '),' checkbox ')][1]//label"))
    if (is.null(label)) label <- text(xml2::xml_find_first(node, "ancestor::*[contains(concat(' ',@class,' '),' form-group ')][1]/label"))
    # FLA's index picker (10_fla_module.R indexPickerUI): a labelless checkbox group whose category name is the
    # coloured span heading its .category-group block.
    if (is.null(label)) label <- text(xml2::xml_find_first(node, "ancestor::*[contains(concat(' ',@class,' '),' category-group ')][1]/div[1]/span[1]"))
    # A button's label is its own visible text (Team's markup nests a tooltip inside it: leave that out).
    if (type == "action") label <- api_button_text(node) %||% api_button_icon_label(node) %||% label
    options <- list()
    choices <- if (type %in% c("select", "multiselect")) xml2::xml_find_all(node, ".//option") else
      if (type %in% c("radio", "checkboxgroup")) xml2::xml_find_all(node, ".//input[@value]") else
      if (type == "tabs") xml2::xml_find_all(node, ".//*[@data-value]") else list()
    for (choice in choices) {
      value <- attr(choice, if (type == "tabs") "data-value" else "value") %||% text(choice)
      title <- if (type %in% c("radio", "checkboxgroup")) text(xml2::xml_find_first(choice, "ancestor::label[1]")) else text(choice)
      options[[length(options) + 1L]] <- list(value = value, label = title %||% value)
    }
    pane <- xml2::xml_find_first(node, "ancestor::*[contains(concat(' ',@class,' '),' tab-pane ')][1]")
    group <- attr(pane, "data-value")
    # The title Team shows for that tab (a nav link with the pane's value), e.g. "differential_view" is shown as
    # "Differential Acyl Chain Expression" (8_structural_module.R nav_panel).
    if (!is.null(group) && !group %in% names(tab_titles)) tab_titles[group] <- list(api_tab_title(doc, group))
    group_label <- if (is.null(group)) NULL else tab_titles[[group]]
    if (is.null(group)) group <- text(xml2::xml_find_first(node, "ancestor::*[./h4 or ./h5][1]/*[self::h4 or self::h5][1]"))
    slider <- cls(node, "js-range-slider")
    default <- defaults[[id]]
    placeholder <- attr(node, "placeholder")
    selectize <- NULL
    if (tag == "select") {
      # selectizeInput writes its options as JSON next to the select (placeholder, plugins).
      scripts <- xml2::xml_find_all(doc, "//script[@data-for]")
      scripts <- scripts[xml2::xml_attr(scripts, "data-for") == full]
      config <- if (length(scripts)) tryCatch(jsonlite::fromJSON(xml2::xml_text(scripts[[1L]])), error = function(e) NULL)
      if (is.null(placeholder)) placeholder <- config$placeholder
      # Team's drag_drop plugin means the order of the chosen values matters ("Order matters").
      plugins <- as.character(unlist(config$plugins, use.names = FALSE))
      if (length(plugins)) selectize <- list(plugins = as.list(plugins))
    }
    out[[id]] <- list(id = id, type = type, label = label, default = default,
      options = options, min = number(node, if (slider) "data-min" else "min"),
      max = number(node, if (slider) "data-max" else "max"), step = number(node, if (slider) "data-step" else "step"),
      multiple = multiple || type == "checkboxgroup", placeholder = placeholder, group = group)
    if (!is.null(selectize)) out[[id]]$selectize <- selectize
    if (!is.null(group_label)) out[[id]]$groupLabel <- group_label
    # Team's state carriers: labelless text inputs inside a display:none block (e.g. the pathway layout JSON,
    # R/modules/13_pathway_module.R). Team never shows them; Nexo keeps their value but draws no field.
    if (type %in% c("text", "textarea") && is.null(label) &&
        !inherits(xml2::xml_find_first(node, "ancestor::*[contains(translate(@style, ' ', ''), 'display:none')]"), "xml_missing"))
      out[[id]]$hidden <- TRUE
  }
  # Dashboard selection bars send text tokens/JSON through hidden inputs.
  # Keep that wire type while exposing the choices carried by their custom markup.
  for (bar in xml2::xml_find_all(doc, "//*[@data-selection-input and @data-choices]")) {
    full <- attr(bar, "data-selection-input")
    if (!startsWith(full, prefix)) next
    id <- substring(full, nchar(prefix) + 1L)
    choices <- jsonlite::fromJSON(attr(bar, "data-choices"))
    control <- out[[id]] %||% list(id = id, type = "text", label = NULL, default = NULL,
      options = list(), min = NULL, max = NULL, step = NULL, multiple = FALSE,
      placeholder = NULL, group = NULL)
    control$label <- attr(bar, "aria-label")
    control$hidden <- NULL # a selection bar's wire input is hidden, its choices are shown
    control$options <- lapply(choices, function(x) list(value = x, label = x))
    # Team reads `__ALL__` as these defaults when present, and writes `__EVERY__` for "all choices"
    # (www/team/js/dashboard_selection.js); the client needs both to show and write the same selection.
    defaults <- attr(bar, "data-default-choices")
    control$defaultChoices <- if (!is.null(defaults) && nzchar(defaults)) as.list(jsonlite::fromJSON(defaults)) else NULL
    control$allToken <- if (identical(attr(bar, "data-all-token"), "__EVERY__")) "__EVERY__" else "__ALL__"
    out[[id]] <- control
  }
  for (control in api_schema_rank_buckets(doc, prefix)) out[[control$id]] <- control
  unname(out)
}

api_tab_title <- function(doc, value) {
  links <- xml2::xml_find_all(doc, "//*[@data-value and (self::a or self::button or @role='tab')]")
  links <- links[xml2::xml_attr(links, "data-value") == value]
  title <- if (length(links)) api_button_text(links[[1L]]) else NULL
  if (is.null(title) || identical(title, value)) NULL else title
}

# Team's longitudinal time-course designer (R/modules/11_longitudinal_module.R:1265-1320): sortable::rank_list
# buckets. sortable's JS sends a bucket's value as its items' data-rank-id (else their text), in order. Each
# "Timecourse i" bucket (case_bucket_<id>, ids random per session) becomes a "bucket" control: items as its default,
# the cloning source bucket's cohorts as its options, the label as Team's card header shows it.
api_schema_rank_buckets <- function(doc, prefix) {
  if (is.null(doc)) return(list())
  has <- function(name) paste0("contains(concat(' ',@class,' '),' ", name, " ')")
  items <- function(list_node) {
    nodes <- xml2::xml_find_all(list_node, paste0("./*[", has("rank-list-item"), "]"))
    if (!length(nodes)) nodes <- xml2::xml_find_all(list_node, "./*[not(self::script)]")
    vapply(nodes, function(n) {
      id <- xml2::xml_attr(n, "data-rank-id")
      if (is.na(id) || !nzchar(id)) trimws(xml2::xml_text(n)) else id
    }, character(1))
  }
  lists <- xml2::xml_find_all(doc, paste0("//*[@id and ", has("rank-list"), "]"))
  ids <- xml2::xml_attr(lists, "id")
  source <- lists[ids == paste0(prefix, "source_cohorts_bucket")]
  cohorts <- if (length(source)) items(source[[1L]]) else character()
  out <- list()
  for (i in seq_along(lists)) {
    if (!startsWith(ids[[i]], prefix)) next
    id <- substring(ids[[i]], nchar(prefix) + 1L)
    if (!grepl("^case_bucket_.+$", id)) next
    header <- xml2::xml_find_first(lists[[i]], paste0("ancestor::*[", has("card"), "][1]/*[", has("card-header"), "]/span[1]"))
    label <- if (inherits(header, "xml_missing")) id else trimws(xml2::xml_text(header))
    current <- items(lists[[i]])
    out[[length(out) + 1L]] <- list(id = id, type = "bucket", label = label, default = as.list(current),
      options = lapply(unique(c(cohorts, current)), function(x) list(value = x, label = x)),
      min = NULL, max = NULL, step = NULL, multiple = TRUE, placeholder = NULL, group = "Time-course designer")
  }
  out
}

api_button_text <- function(node) {
  parts <- xml2::xml_text(xml2::xml_find_all(node, paste0(".//text()[not(ancestor::bslib-tooltip) and not(ancestor::template)",
    " and not(ancestor::script) and not(ancestor::*[contains(concat(' ',@class,' '),' visually-hidden ')])]")))
  x <- trimws(gsub("\\s+", " ", paste(parts, collapse = " ")))
  if (is.na(x) || !nzchar(x)) NULL else x
}

# An icon-only button (Team's time-course designer: an × beside "Timecourse 1") has no text: name it as a
# sighted user reads it, by its icon's action and the text beside it. Icons Nexo cannot name return NULL.
api_button_icon_label <- function(node) {
  icon <- xml2::xml_attr(xml2::xml_find_first(node, ".//i[@class]"), "class")
  if (is.na(icon) || !grepl("(^|\\s)fa-(times|xmark|trash|trash-can|trash-alt|times-circle|circle-xmark)(\\s|$)", icon)) return(NULL)
  beside <- xml2::xml_find_first(node, "preceding-sibling::*[normalize-space()][1]")
  text <- if (inherits(beside, "xml_missing")) NA_character_ else trimws(gsub("\\s+", " ", xml2::xml_text(beside)))
  if (is.na(text) || !nzchar(text)) "Remove" else paste("Remove", text)
}

api_family_schema_all <- local({
  cache <- new.env(parent = emptyenv())
  function(family) {
    if (exists(family, cache, inherits = FALSE)) return(cache[[family]])
    # results_dashboard_ui(id) constructs NS(id) internally, just like the other families.
    controls <- api_schema_from_doc(team_plot_instance_schema_doc(family))
    if (family != "team_cell") {
      classic <- api_schema_from_doc(team_plot_instance_classic_doc(family))
      ids <- vapply(controls, `[[`, character(1), "id")
      controls <- c(controls, Filter(function(x) !x$id %in% ids, classic))
    }
    cache[[family]] <- controls
    controls
  }
})
# Ids of the controls Team's modules render at run time (renderUI) outside allowedInputs: per group or per
# sample, and the structural grid's "Log2FC Threshold (abs):" (12_structural_grid_module.R gridLog2fcThreshUI).
# FLA's index picker (10_fla_module.R indexPickerUI): one checkbox group per category, sel_<category>. With a family,
# only fla_tab's sel_ ids count (logratio_tab has its own sel_ inputs); without one (the render pool's guard) any
# sel_ id keeps the card on the main process.
# Pilot F1: on a family whose per-group pickers never reach a canvas copy's plot (palette.R api_palette_family_dead:
# QC takes its group colours and shapes from the session), customCol_/customShape_ are not offered; the session
# palette is (palette.R). Without a family (the render pool's guard) they still count.
api_is_computed_id <- function(ids, family = NULL) (grepl("^(customCol|customShape)_.+$", ids) &
  !(exists("api_palette_family_dead", mode = "function") && api_palette_family_dead(family))) | ids %in% c("bqcSamples", "gridLog2fcThresh") |
  (grepl("^sel_.+$", ids) & (is.null(family) || identical(family, "fla_tab"))) |
  grepl("^case_bucket_.+$", ids) # the longitudinal time-course designer's buckets (api_schema_rank_buckets)
api_family_schema <- function(family) {
  sources <- if (family == "team_cell") team_cell_instance_outputs else
    paste0(family, "-", team_plot_instance_families[[family]]$outputs)
  allowed <- unique(unlist(lapply(sources, team_plot_instance_input_ids), use.names = FALSE))
  Filter(function(x) x$id %in% allowed, api_family_schema_all(family))
}

# Team's status notes beside a control: control id -> the module output Team renders the note in, and the option
# the note gates. R/results_dashboard.R output$heat_significance_status writes
# <p class="rd-heat-significance-note" data-allowed="true|false" role="status">text</p> under the "Show" radio, and
# www/team/js/dashboard_significance.js disables the "significant" option when data-allowed="false".
api_control_status_outputs <- list(
  heat_significance = list(output = "heat_significance_status", option = "significant"))
# What Team rendered for that note in the settled session: list(allowed, text, option), or NULL when the card has
# no such output (another family) or it rendered nothing.
api_control_status <- function(s, instanceId, id) {
  spec <- api_control_status_outputs[[id]]
  if (is.null(spec)) return(NULL)
  name <- paste0(instanceId, "-", spec$output)
  if (!name %in% api_rendered_output_names(s, instanceId)) return(NULL)
  value <- tryCatch(api_read(s, s$mock$getOutput(name)), error = function(e) NULL)
  html <- if (is.list(value) && is.character(value$html)) value$html else
    if (is.character(value) && length(value) == 1L) value else NULL
  if (is.null(html) || !nzchar(html)) return(NULL)
  doc <- tryCatch(xml2::read_html(html), error = function(e) NULL)
  if (is.null(doc)) return(NULL)
  node <- xml2::xml_find_first(doc, "//*[@data-allowed]")
  if (inherits(node, "xml_missing")) return(NULL)
  text <- trimws(gsub("\\s+", " ", xml2::xml_text(node)))
  status <- list(allowed = identical(xml2::xml_attr(node, "data-allowed"), "true"))
  status["text"] <- list(if (is.na(text) || !nzchar(text)) NULL else text)
  status$option <- spec$option
  status
}

api_card_schema <- function(s, instanceId) {
  card <- api_card_get(s, instanceId)
  controls <- api_family_schema_all(card$family)
  prefix <- paste0(instanceId, "-")
  for (name in api_rendered_output_names(s, instanceId)) {
    value <- tryCatch(api_read(s, s$mock$getOutput(name)), error = function(e) NULL)
    html <- if (is.list(value) && is.character(value$html)) value$html else
      if (is.character(value) && length(value) == 1L && grepl("<", value, fixed = TRUE)) value else NULL
    if (is.null(html)) next
    doc <- tryCatch(xml2::read_html(html), error = function(e) NULL)
    live <- api_schema_from_doc(doc, prefix)
    ids <- vapply(controls, `[[`, character(1), "id")
    for (control in live) {
      index <- match(control$id, ids)
      if (is.na(index)) controls[[length(controls) + 1L]] <- control else {
        # A renderUI fragment may only describe choices for a static hidden input.
        if (is.null(control$default)) control["default"] <- list(controls[[index]]$default)
        controls[[index]] <- control
      }
    }
  }
  buttons <- Filter(function(x) x$type == "action", controls)
  ids <- vapply(buttons, `[[`, character(1), "id")
  actions <- unique(ids)
  # The same buttons with what the client shows: visible label and the tab they sit in (as controls' group).
  action_controls <- lapply(buttons[!duplicated(ids)], function(x)
    list(id = x$id, label = x$label %||% x$id, tab = x$group))
  # Controls the module builds at run time per group or sample (customCol_<g>, customShape_<g>,
  # bqcSamples, gridLog2fcThresh) are not in allowedInputs: Team's canvas never saves them. Nexo offers them,
  # marked computed, and keeps their values in its own checkpoint member.
  controls <- Filter(function(x) x$id %in% card$allowedInputs || api_is_computed_id(x$id, card$family), controls)
  for (i in seq_along(controls)) if (!controls[[i]]$id %in% card$allowedInputs) controls[[i]]$computed <- TRUE
  # This selector uses server-side selectize, so its choices never appear in renderUI.
  # Mirror results_dashboard_module_server's base() row names using its exact data adapter.
  if (card$family == "results_dashboard") {
    lipids <- api_read(s, make.unique(as.character(rd_value(s$dashboard_data$data_processed)[[1L]])))
    for (i in seq_along(controls)) if (controls[[i]]$id == "violin_lipid")
      controls[[i]]$options <- lapply(lipids, function(x) list(value = x, label = x))
  }
  # Choices the module sends at run time (updateSelectInput, updateCheckboxGroupInput…):
  # the browser would show them, so the Inspector offers them too. A radio's static choices are replaced as well:
  # updateRadioButtons(choices = …) narrows them in the browser (Barchart's Value Mode on a donut,
  # R/modules/5_barchart_module.R:309-321), so the Inspector offers, and validation accepts, only those.
  for (i in seq_along(controls)) if (!length(controls[[i]]$options) || identical(controls[[i]]$type, "radio")) {
    sent <- s$bus$choices[[paste0(prefix, controls[[i]]$id)]]
    if (length(sent$values)) controls[[i]]$options <- unname(Map(function(v, l) list(value = v, label = l),
      sent$values, sent$labels %||% sent$values))
  }
  controls <- api_read(s, lapply(controls, function(control) {
    control["value"] <- list(tryCatch(s$mock$input[[paste0(prefix, control$id)]], error = function(e) NULL))
    control
  }))
  # Team's own status note beside a control (read from its rendered output, never recomputed).
  for (i in seq_along(controls)) {
    status <- api_control_status(s, instanceId, controls[[i]]$id)
    if (!is.null(status)) controls[[i]]$status <- status
  }
  list(controls = unname(controls), actions = unname(as.list(actions)), actionControls = unname(action_controls),
    tabs = team_plot_instance_layout(card$source)$tabs,
    # Pilot F1: this card's group colours follow Team's session palette (palette.R); the Data tab says so.
    sessionPalette = exists("api_palette_session_families", mode = "function") && card$family %in% api_palette_session_families(),
    # b11 F3: the module's configuration file inputs (export.R api_card_upload_controls).
    uploads = if (exists("api_card_upload_controls", mode = "function")) api_card_upload_controls(card$family) else list())
}


# Validate and coerce inspector inputs against the controls of a card's schema
# (what Team's input bindings guarantee in the browser). Unknown keys are the
# caller's business (allowedInputs); here only typed controls are checked.
api_validate_inputs <- function(controls, inputs) {
  by_id <- stats::setNames(controls, vapply(controls, function(c) as.character(c$id), character(1)))
  for (key in names(inputs)) {
    control <- by_id[[key]]; value <- inputs[[key]]
    if (is.null(control) || is.null(value)) next
    type <- control$type %||% "text"
    bad <- function(why) api_abort("api_bad_request", paste0("Invalid value for ", key, ": ", why))
    option_values <- vapply(control$options %||% list(), function(o) as.character(o$value %||% o), character(1))
    if (type %in% c("select", "radio", "tabs")) {
      if (length(value) != 1L) bad("one value expected")
      if (length(option_values) && !as.character(value) %in% option_values) bad("not one of the options")
      inputs[[key]] <- as.character(value)
    } else if (type %in% c("multiselect", "checkboxgroup")) {
      value <- as.character(unlist(value, use.names = FALSE))
      if (length(option_values) && length(value) && !all(value %in% option_values)) bad("not among the options")
      inputs[key] <- list(if (length(value)) value else NULL)
    } else if (type %in% c("number", "range")) {
      value <- suppressWarnings(as.numeric(unlist(value, use.names = FALSE)))
      # A range slider (sliderInput with value = c(lo, hi)) carries two numbers.
      expected <- if (isTRUE(control$multiple) || (identical(type, "range") && length(control$default) == 2L)) 2L else 1L
      if (length(value) != expected || anyNA(value) || any(!is.finite(value))) bad(paste(expected, "finite number(s) expected"))
      if (!is.null(control$min) && any(value < control$min)) bad(paste("below the minimum", control$min))
      if (!is.null(control$max) && any(value > control$max)) bad(paste("above the maximum", control$max))
      inputs[[key]] <- value
    } else if (type == "boolean") {
      if (length(value) != 1L) bad("one value expected")
      if (is.character(value)) {
        if (!tolower(value) %in% c("true", "false", "1", "0", "yes", "no")) bad("expected true or false")
        value <- tolower(value) %in% c("true", "1", "yes")
      } else if (is.logical(value) || is.numeric(value)) {
        if (is.na(value)) bad("expected true or false")
        value <- isTRUE(as.logical(value))
      } else bad("expected true or false")
      inputs[[key]] <- value
    } else if (type == "color") {
      # Team's colourpicker::colourInput accepts #RRGGBB(AA), R colour names ("black") and "transparent".
      if (!is.character(value) || length(value) != 1L ||
          !(grepl("^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$", value) || tolower(value) %in% c("transparent", grDevices::colors())))
        bad("expected #RRGGBB or a colour name")
    } else if (type %in% c("text", "textarea")) {
      if (!is.character(value) || length(value) != 1L) bad("one text value expected")
      # Team's own limit for a canvas plot setting (plot_instances.R: nchar(x) > 100000L).
      if (nchar(value) > 100000L) bad("too long")
    } else if (type == "bucket") {
      # A time-course bucket: item ids in order, each one of the designer's cohorts (empty is allowed, as in Team).
      value <- as.character(unlist(value, use.names = FALSE))
      if (anyNA(value) || (length(value) && !all(value %in% option_values))) bad("not among the designer's cohorts")
      inputs[key] <- list(value)
    } else if (type %in% c("action", "file")) bad("not settable")
  }
  inputs
}
