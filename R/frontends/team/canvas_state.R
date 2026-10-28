# Optional presentation state. It never authorizes or changes scientific inputs.
team_canvas_limits <- list(nodes = 40L, bytes = 24 * 1024^2, snapshot = 4 * 1024^2)

team_canvas_fail <- function(message = "Invalid figure canvas state.") stop(message, call. = FALSE)
team_canvas_object <- function(value, allowed, required = character()) {
  if (!is.list(value) || (length(value) && (is.null(names(value)) ||
      anyNA(names(value)) || anyDuplicated(names(value)))) ||
      !all(names(value) %in% allowed) || !all(required %in% names(value))) team_canvas_fail()
  if (!length(value)) names(value) <- character()
  value
}
team_canvas_string <- function(value, max_chars, empty = TRUE) {
  if (!is.character(value) || length(value) != 1L || is.na(value) ||
      nchar(value, type = "bytes") > 4 * max_chars || nchar(value) > max_chars ||
      (!empty && !nzchar(value)) || is.na(iconv(value, to = "UTF-8")) ||
      grepl("[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]", value, perl = TRUE)) team_canvas_fail()
  value
}
team_canvas_number <- function(value, low, high) {
  if (!is.numeric(value) || length(value) != 1L || !is.finite(value) || value < low || value > high) team_canvas_fail()
  as.numeric(value)
}
team_canvas_boolean <- function(value) {
  if (!is.logical(value) || length(value) != 1L || is.na(value)) team_canvas_fail()
  value
}
team_canvas_base64 <- function(value) {
  if (!nzchar(value) || nchar(value, type = "bytes") %% 4L != 0L ||
      !grepl("^[A-Za-z0-9+/]*={0,2}$", value)) team_canvas_fail("Invalid saved figure encoding.")
  bytes <- tryCatch(jsonlite::base64_dec(value), error = function(e) NULL)
  if (is.null(bytes) || !identical(gsub("[\r\n]", "", jsonlite::base64_enc(bytes)), value)) team_canvas_fail("Invalid saved figure encoding.")
  bytes
}
team_canvas_png <- function(bytes) {
  signature <- as.raw(c(137, 80, 78, 71, 13, 10, 26, 10))
  if (length(bytes) < 33L || length(bytes) > team_canvas_limits$snapshot ||
      !identical(bytes[seq_len(8L)], signature) ||
      !identical(rawToChar(bytes[13:16]), "IHDR")) team_canvas_fail("Invalid saved PNG figure.")
  invisible(TRUE)
}

team_canvas_svg <- function(svg) {
  if (!is.character(svg) || length(svg) != 1L || is.na(svg) ||
      nchar(svg, type = "bytes") > team_canvas_limits$snapshot ||
      grepl("<!\\s*(DOCTYPE|ENTITY)", svg, ignore.case = TRUE, perl = TRUE))
    team_canvas_fail("Unsafe saved SVG figure.")
  if (!requireNamespace("xml2", quietly = TRUE)) team_canvas_fail("SVG figure validation is unavailable.")
  doc <- tryCatch(xml2::read_xml(charToRaw(enc2utf8(svg)), options = "NONET"), error = function(e) NULL)
  if (is.null(doc) || xml2::xml_name(doc) != "svg" ||
      length(xml2::xml_find_all(doc, "//processing-instruction()"))) team_canvas_fail("Unsafe saved SVG figure.")
  elements <- xml2::xml_find_all(doc, "//*")
  allowed_elements <- c("svg", "g", "defs", "clipPath", "mask", "path", "rect", "circle", "ellipse", "line",
    "polyline", "polygon", "text", "tspan", "title", "desc", "linearGradient", "radialGradient", "stop",
    "pattern", "image", "use", "marker", "symbol")
  allowed_attributes <- c("id", "class", "style", "transform", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy",
    "r", "rx", "ry", "d", "points", "width", "height", "viewBox", "preserveAspectRatio", "version", "fill",
    "fill-opacity", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
    "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "opacity", "font-family",
    "font-size", "font-style", "font-weight", "text-anchor", "dominant-baseline", "alignment-baseline",
    "letter-spacing", "word-spacing", "dx", "dy", "rotate", "textLength", "lengthAdjust", "clip-path", "clipPathUnits",
    "mask", "maskUnits", "maskContentUnits", "marker-start", "marker-mid", "marker-end", "markerWidth", "markerHeight",
    "markerUnits", "orient", "refX", "refY", "patternUnits", "patternContentUnits", "patternTransform", "gradientUnits",
    "gradientTransform", "offset", "stop-color", "stop-opacity", "href", "role", "aria-label", "aria-labelledby",
    "aria-hidden", "color", "display", "visibility", "overflow", "vector-effect", "paint-order", "focusable",
    "pointer-events", "shape-rendering")
  style_properties <- c("fill", "fill-opacity", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-opacity",
    "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "opacity",
    "font-family", "font-size", "font-style", "font-weight", "text-anchor", "dominant-baseline", "alignment-baseline",
    "letter-spacing", "word-spacing", "white-space", "clip-path", "mask", "marker-start", "marker-mid", "marker-end",
    "color", "display", "visibility", "overflow", "vector-effect", "paint-order", "background", "background-color",
    "shape-rendering", "text-rendering", "image-rendering", "pointer-events")
  if (length(elements) > 50000L || any(!xml2::xml_name(elements) %in% allowed_elements)) team_canvas_fail("Unsafe saved SVG figure.")
  for (element in elements) {
    namespaces <- as.character(xml2::xml_ns(element))
    if (any(!namespaces %in% c("http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink", "http://www.w3.org/XML/1998/namespace")))
      team_canvas_fail("Unsafe saved SVG namespace.")
    attributes <- xml2::xml_attrs(element)
    attribute_names <- names(attributes)
    namespace_attributes <- attribute_names == "xmlns" | startsWith(attribute_names, "xmlns:")
    if (any(grepl("^on", attribute_names, ignore.case = TRUE)) ||
        any(!namespace_attributes & !attribute_names %in% allowed_attributes & !grepl("^data-[A-Za-z][A-Za-z0-9_-]*$", attribute_names)))
      team_canvas_fail("Unsafe saved SVG attributes.")
    for (index in seq_along(attributes)) {
      name <- attribute_names[[index]]; value <- attributes[[index]]
      if (namespace_attributes[[index]]) {
        if (!value %in% c("http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink", "http://www.w3.org/XML/1998/namespace"))
          team_canvas_fail("Unsafe saved SVG namespace.")
        next
      }
      if (!startsWith(name, "data-") && (grepl("\\", value, fixed = TRUE) || grepl("/*", value, fixed = TRUE)))
        team_canvas_fail("Unsafe saved SVG attribute encoding.")
      if (name == "href") {
        if (grepl("^#[A-Za-z0-9_.:-]+$", value)) next
        if (xml2::xml_name(element) == "image" && startsWith(value, "data:image/png;base64,")) {
          team_canvas_png(team_canvas_base64(substring(value, 23L))); next
        }
        team_canvas_fail("External references are not allowed in saved SVG figures.")
      }
      if (name == "style") {
        if (grepl("[\\\\@<>]|/\\*|expression\\s*\\(", value, ignore.case = TRUE, perl = TRUE)) team_canvas_fail("Unsafe saved SVG style.")
        declarations <- trimws(strsplit(value, ";", fixed = TRUE)[[1]])
        declarations <- declarations[nzchar(declarations)]
        properties <- tolower(trimws(sub(":.*$", "", declarations)))
        if (any(!grepl(":", declarations, fixed = TRUE)) || any(!properties %in% style_properties)) team_canvas_fail("Unsafe saved SVG style.")
        calls <- regmatches(value, gregexpr("[A-Za-z-]+\\s*\\(", value, perl = TRUE))[[1]]
        if (length(calls) && any(!tolower(trimws(sub("\\($", "", calls))) %in% c("rgb", "rgba", "hsl", "hsla", "url")))
          team_canvas_fail("Unsafe saved SVG style function.")
      }
      # Paint references may point only to a local definition in this same SVG.
      if (grepl("url\\s*\\(", value, ignore.case = TRUE, perl = TRUE)) {
        without_local <- gsub("url\\(\\s*['\"]?#[A-Za-z0-9_.:-]+['\"]?\\s*\\)", "", value, ignore.case = TRUE, perl = TRUE)
        if (grepl("url\\s*\\(", without_local, ignore.case = TRUE, perl = TRUE)) team_canvas_fail("External references are not allowed in saved SVG figures.")
      }
      if (grepl("javascript\\s*:|vbscript\\s*:|https?\\s*:|file\\s*:", value, ignore.case = TRUE, perl = TRUE))
        team_canvas_fail("External references are not allowed in saved SVG figures.")
    }
  }
  invisible(TRUE)
}

team_canvas_image <- function(url) {
  url <- team_canvas_string(url, team_canvas_limits$snapshot, empty = FALSE)
  if (nchar(url, type = "bytes") > team_canvas_limits$snapshot) team_canvas_fail("A saved figure exceeds 4 MiB.")
  if (startsWith(url, "data:image/png;base64,")) {
    team_canvas_png(team_canvas_base64(substring(url, 23L)))
  } else {
    prefix <- "^data:image/svg\\+xml(;charset=utf-8)?(;base64)?,"
    if (!grepl(prefix, url, ignore.case = TRUE, perl = TRUE)) team_canvas_fail("Unsupported saved figure format.")
    header <- regmatches(url, regexpr(prefix, url, ignore.case = TRUE, perl = TRUE))
    payload <- substring(url, nchar(header) + 1L)
    svg <- if (grepl(";base64,", header, fixed = TRUE)) {
      tryCatch(rawToChar(team_canvas_base64(payload)), error = function(e) team_canvas_fail("Invalid saved SVG encoding."))
    } else {
      if (grepl("%(?![0-9A-Fa-f]{2})", payload, perl = TRUE)) team_canvas_fail("Invalid saved SVG encoding.")
      utils::URLdecode(payload)
    }
    team_canvas_svg(svg)
  }
  url
}

team_canvas_validate <- function(state) {
  state <- team_canvas_object(state, c("version", "libraryHidden", "nodes"), c("version", "libraryHidden", "nodes"))
  if (!identical(state$version, "1") && !identical(state$version, 1) && !identical(state$version, 1L)) team_canvas_fail("Unsupported figure canvas version.")
  hidden <- team_canvas_boolean(state$libraryHidden)
  if (!is.list(state$nodes) || !is.null(names(state$nodes)) || length(state$nodes) > team_canvas_limits$nodes) team_canvas_fail("A canvas supports at most 40 figures.")
  ids <- character()
  nodes <- lapply(state$nodes, function(node) {
    node <- team_canvas_object(node, c("id", "label", "x", "y", "width", "height", "visual", "finished"),
      c("id", "label", "x", "y", "width", "height", "visual"))
    id <- team_canvas_string(node$id, 160L, FALSE)
    if (!grepl("^[A-Za-z][A-Za-z0-9_-]{0,159}$", id) || id %in% ids) team_canvas_fail("Invalid or duplicate canvas plot identifier.")
    ids <<- c(ids, id)
    visual <- team_canvas_object(node$visual, c("plotTitle", "xTitle", "yTitle", "fontSize", "fontColor", "markColor", "background"))
    for (key in names(visual)) {
      if (key == "fontSize") visual[[key]] <- team_canvas_number(visual[[key]], 8, 48)
      else if (key %in% c("fontColor", "markColor", "background")) {
        color <- team_canvas_string(visual[[key]], 9L, FALSE)
        if (!grepl("^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$", color)) team_canvas_fail("Invalid canvas color.")
      } else visual[[key]] <- team_canvas_string(visual[[key]], 1000L)
    }
    finished <- node$finished
    if (!is.null(finished)) {
      finished <- team_canvas_object(finished, c("url", "createdAt", "stale", "provenance"), c("url", "createdAt", "stale"))
      finished$url <- team_canvas_image(finished$url)
      finished$createdAt <- team_canvas_string(finished$createdAt, 64L, FALSE)
      if (!grepl("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,9})?Z$", finished$createdAt)) team_canvas_fail("Invalid saved figure date.")
      parsed_date <- strptime(finished$createdAt, "%Y-%m-%dT%H:%M:%OSZ", tz = "UTC")
      if (is.na(parsed_date) || format(parsed_date, "%Y-%m-%dT%H:%M:%S", tz = "UTC") != substring(finished$createdAt, 1L, 19L))
        team_canvas_fail("Invalid saved figure date.")
      finished$stale <- team_canvas_boolean(finished$stale)
      if (!is.null(finished$provenance)) {
        provenance <- finished$provenance
        if (!is.list(provenance) || length(provenance) > 16L || is.null(names(provenance)) ||
            anyDuplicated(names(provenance)) || any(!grepl("^[A-Za-z][A-Za-z0-9_]{0,63}$", names(provenance)))) team_canvas_fail("Invalid saved figure provenance.")
        for (value in provenance) {
          if (is.null(value)) next
          if (is.character(value)) team_canvas_string(value, 1000L)
          else if (is.logical(value)) team_canvas_boolean(value)
          else team_canvas_number(value, -1e15, 1e15)
        }
      }
    }
    list(id = id, label = team_canvas_string(node$label, 512L), x = team_canvas_number(node$x, 0, 1e6),
      y = team_canvas_number(node$y, 0, 1e6), width = team_canvas_number(node$width, 240, 4000),
      height = team_canvas_number(node$height, 220, 4000), visual = visual, finished = finished)
  })
  result <- list(version = "1", libraryHidden = hidden, nodes = unname(nodes))
  if (nchar(team_canvas_json(result), type = "bytes") > team_canvas_limits$bytes) team_canvas_fail("Figure canvas state exceeds 24 MiB.")
  result
}

team_canvas_json <- function(state) jsonlite::toJSON(state, auto_unbox = TRUE, null = "null", digits = NA)
team_canvas_read <- function(path) {
  if (!file.exists(path) || file.info(path)$size > team_canvas_limits$bytes) team_canvas_fail("Figure canvas state exceeds 24 MiB.")
  team_canvas_validate(jsonlite::read_json(path, simplifyVector = FALSE))
}

team_canvas_server <- function(input, output, session, shared_data) {
  current <- shiny::reactiveVal(NULL)
  accepted_token <- shiny::reactiveVal(NULL)
  session$userData$team_canvas_acked_token <- function() shiny::isolate(accepted_token())
  session$userData$team_canvas_export <- function(provenance = NULL) {
    state <- shiny::isolate(current())
    if (is.null(state)) return(NULL)
    team_canvas_validate(state)
  }
  session$userData$team_canvas_import <- function(state = NULL, provenance = NULL) {
    validated <- if (is.null(state)) NULL else team_canvas_validate(state)
    current(validated); accepted_token(NULL)
    # Modules register synchronously; dispatch after that flush so the browser
    # can restore nodes against the newly registered scientific outputs.
    session$onFlushed(function() session$sendCustomMessage("team-canvas-restore", list(state = validated)), once = TRUE)
    invisible(validated)
  }
  shiny::observeEvent(input$team_canvas_state, {
    payload <- input$team_canvas_state
    # Keep a valid correlation token even when the envelope/state is rejected;
    # otherwise the browser cannot associate the negative acknowledgement.
    token <- tryCatch({
      value <- team_canvas_string(payload$token, 160L, FALSE)
      if (!grepl("^[A-Za-z0-9_.:-]+$", value)) team_canvas_fail("Invalid canvas checkpoint token.")
      value
    }, error = function(e) NULL)
    result <- tryCatch({
      payload <- team_canvas_object(payload, c("token", "state"), c("token", "state"))
      if (is.null(token)) team_canvas_fail("Invalid canvas checkpoint token.")
      team_canvas_validate(payload$state)
    }, error = identity)
    if (inherits(result, "error")) {
      accepted_token(NULL)
      session$sendCustomMessage("team-canvas-state-ack", list(token = token, ok = FALSE, message = conditionMessage(result)))
    } else {
      current(result); accepted_token(token)
      session$sendCustomMessage("team-canvas-state-ack", list(token = token, ok = TRUE, message = "Figure canvas saved for this checkpoint."))
    }
  # Authentication can register this handler after the first browser payload
  # already exists. Validate and acknowledge that payload as well as updates.
  }, ignoreInit = FALSE, priority = 100)
  invisible(NULL)
}
