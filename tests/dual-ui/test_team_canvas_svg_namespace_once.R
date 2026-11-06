# The saved-SVG validator computes the document namespaces once instead of once
# per element. This compares it against the previous per-element validator
# (copied verbatim below as the oracle) on accepted and rejected figures: the
# same SVGs must pass, and the same SVGs must fail with the same message.
suppressPackageStartupMessages(library(jsonlite))
source('R/frontends/team/canvas_state.R')
# --- Oracle: team_canvas_svg exactly as of 71dc349 ---------------------------
team_canvas_svg_reference <- function(svg) {
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
          team_canvas_png(team_canvas_base64(substring(value, 23L, nchar(value)))); next
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
# ------------------------------------------------------------------------------
outcome <- function(f, svg) tryCatch({ f(svg); "accepted" }, error = function(e) paste("rejected:", conditionMessage(e)))
png <- as.raw(c(137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,rep(0,17)))
png_url <- paste0("data:image/png;base64,", gsub("[\r\n]", "", jsonlite::base64_enc(png)))
svg <- function(body, root = 'xmlns="http://www.w3.org/2000/svg"') paste0('<svg ', root, ' width="10" height="10">', body, '</svg>')
xlink <- 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
many <- paste0('<g class="trace">', paste(sprintf('<path d="M%d,0L%d,10" style="fill:none;stroke:rgb(1,2,3);stroke-width:1"/>', 1:3000, 1:3000), collapse = ''), '</g>')
accepted <- list(
  plain = svg('<rect x="0" y="0" width="5" height="5" fill="#123456"/>'),
  no_namespace = '<svg width="10" height="10"><circle cx="1" cy="1" r="1"/></svg>',
  xlink_local = svg('<defs><clipPath id="c1"><rect width="1" height="1"/></clipPath></defs><use xlink:href="#c1" clip-path="url(#c1)"/>', xlink),
  nested_svg_ns = svg('<g xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></g>'),
  embedded_png = svg(sprintf('<image width="1" height="1" href="%s"/>', png_url)),
  plotly_like = svg(many, xlink))
rejected <- list(
  xml_space_attribute = svg('<text xml:space="preserve" x="1" y="1">a b</text>'),
  foreign_root_ns = svg('<rect width="1" height="1"/>', 'xmlns="http://www.w3.org/2000/svg" xmlns:x="http://example.com/x"'),
  foreign_nested_ns = svg('<g xmlns:x="http://example.com/x"><rect width="1" height="1"/></g>'),
  foreign_deep_ns_after_bad_attr = svg(paste0('<rect width="1" height="1" onload="x()"/><g><g xmlns:evil="http://evil.example/"><rect/></g></g>')),
  foreign_default_ns = '<svg xmlns="http://example.com/other" width="1" height="1"><rect/></svg>',
  html_ns_element = svg('<g><rect xmlns:h="http://www.w3.org/1999/xhtml" width="1" height="1"/></g>'),
  event_handler = svg('<rect onclick="alert(1)" width="1" height="1"/>'),
  script = svg('<script>alert(1)</script>'),
  foreign_object = svg('<foreignObject><div/></foreignObject>'),
  external_href = svg('<image href="https://example.com/a.png" width="1" height="1"/>', xlink),
  external_xlink = svg('<use xlink:href="http://example.com/s.svg#a"/>', xlink),
  external_paint = svg('<rect fill="url(https://example.com/#a)" width="1" height="1"/>'),
  style_expression = svg('<rect style="width:expression(alert(1))"/>'),
  style_property = svg('<rect style="behavior:url(#a)"/>'),
  doctype = paste0('<!DOCTYPE svg>', svg('<rect/>')),
  pi = svg('<?xml-stylesheet href="a.css"?><rect/>'),
  not_svg = '<html xmlns="http://www.w3.org/1999/xhtml"></html>',
  malformed = '<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>',
  bad_png = svg('<image href="data:image/png;base64,AAAA" width="1" height="1"/>'),
  plotly_like_foreign_ns = svg(paste0(many, '<g xmlns:x="http://example.com/x"/>'), xlink))
for (name in names(accepted)) {
  old <- outcome(team_canvas_svg_reference, accepted[[name]]); new <- outcome(team_canvas_svg, accepted[[name]])
  if (!identical(old, "accepted")) stop("Accepted fixture '", name, "' is rejected by the reference: ", old)
  if (!identical(new, old)) stop("Accepted fixture '", name, "' differs: reference=", old, " new=", new)
}
for (name in names(rejected)) {
  old <- outcome(team_canvas_svg_reference, rejected[[name]]); new <- outcome(team_canvas_svg, rejected[[name]])
  if (!startsWith(old, "rejected:")) stop("Rejected fixture '", name, "' is accepted by the reference")
  if (!identical(new, old)) stop("Rejected fixture '", name, "' differs: reference=", old, " new=", new)
}
# Every element still sees the same namespaces: xml_ns(element) is per document.
doc <- xml2::read_xml(accepted$plotly_like)
all_ns <- unique(lapply(xml2::xml_find_all(doc, "//*"), function(e) as.character(xml2::xml_ns(e))))
stopifnot(length(all_ns) == 1L)
old_time <- system.time(team_canvas_svg_reference(accepted$plotly_like))[["elapsed"]]
new_time <- system.time(team_canvas_svg(accepted$plotly_like))[["elapsed"]]
cat(sprintf("PASS: %d accepted and %d rejected SVGs give identical outcomes (3001-element figure: reference %.2f s, new %.2f s)\n",
  length(accepted), length(rejected), old_time, new_time))
