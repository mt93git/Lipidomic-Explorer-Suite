# Publication export through Team's own Export studio code (generate_export_artifacts,
# team_export_studio_write_bundle) and per-card data through the module's own
# downloadHandler. Nexo never draws or recomputes an exported figure.
api_export_figures <- list(
  list(key = "pca_2d", title = "PCA 2D Score Plot (Quality Check)"),
  list(key = "volcano", title = "Volcano Plot (Differential Lipids)"),
  list(key = "class_abundance", title = "Top Lipid Class Abundance (Bar Chart)"),
  list(key = "heatmap", title = "Lipid Abundance Heatmap (Matrix)"))
api_export_formats <- c("pdf", "svg", "png", "tiff", "csv", "rscript")

api_export_presets <- function() list(
  version = "1",
  presets = unname(lapply(names(EXPORT_JOURNAL_PRESETS), function(key)
    c(list(key = key), EXPORT_JOURNAL_PRESETS[[key]]))),
  figures = api_export_figures,
  formats = api_export_formats,
  fonts = list(list(key = "sans", title = "Arial / Helvetica"), list(key = "serif", title = "Times New Roman"),
    list(key = "mono", title = "Courier")),
  dpi = c(300L, 600L, 1200L),
  limits = list(widthMm = c(40, 250), heightMm = c(40, 250), basePt = c(5, 12)),
  svgAvailable = requireNamespace("svglite", quietly = TRUE))

api_export_number <- function(value, name, lo, hi) {
  value <- suppressWarnings(as.numeric(value))
  if (length(value) != 1L || !is.finite(value) || value < lo || value > hi)
    api_abort("api_bad_request", sprintf("%s must be a number between %s and %s.", name, lo, hi))
  value
}

# Same field names as Team's Export studio inputs; defaults are Team's UI defaults.
api_export_bundle <- function(s, body) {
  api_alive(s)
  key <- body$figureKey %||% "pca_2d"
  if (!is.character(key) || length(key) != 1L || !key %in% vapply(api_export_figures, `[[`, "", "key"))
    api_abort("api_bad_request", "Unknown figureKey.")
  preset <- body$preset %||% "nature"
  if (!is.character(preset) || length(preset) != 1L || !preset %in% names(EXPORT_JOURNAL_PRESETS))
    api_abort("api_bad_request", "Unknown preset.")
  width <- api_export_number(body$widthMm %||% 89, "widthMm", 40, 250)
  height <- api_export_number(body$heightMm %||% 89, "heightMm", 40, 250)
  base_pt <- api_export_number(body$basePt %||% 7.5, "basePt", 5, 12)
  dpi <- api_export_number(body$dpi %||% 600, "dpi", 72, 1200)
  if (!dpi %in% c(300, 600, 1200)) api_abort("api_bad_request", "dpi must be 300, 600 or 1200.")
  font <- body$fontFamily %||% "sans"
  if (!is.character(font) || length(font) != 1L || !font %in% c("sans", "serif", "mono"))
    api_abort("api_bad_request", "fontFamily must be sans, serif or mono.")
  hybrid <- body$hybridMode %||% TRUE
  if (!is.logical(hybrid) || length(hybrid) != 1L || is.na(hybrid)) api_abort("api_bad_request", "hybridMode must be true or false.")
  requested <- unlist(body$formats %||% as.list(api_export_formats), use.names = FALSE)
  if (!is.character(requested) || !length(requested) || !all(requested %in% api_export_formats))
    api_abort("api_bad_request", paste("formats must be a non-empty subset of", paste(api_export_formats, collapse = ", ")))
  formats <- stats::setNames(as.list(api_export_formats %in% requested), api_export_formats)
  # Team: the reproduction script always ships with its CSV.
  formats$csv <- isTRUE(formats$csv) || isTRUE(formats$rscript)
  unavailable <- function(e) api_abort("api_unprocessable",
    if (nzchar(conditionMessage(e))) conditionMessage(e) else "This figure is not available for this session.")
  art <- tryCatch(api_read(s, generate_export_artifacts(figure_key = key, shared_data = s$shared,
      base_pt = base_pt, font_family = font, hybrid_mode = hybrid)),
    shiny.silent.error = unavailable, validation = unavailable)
  file <- tempfile(fileext = ".zip")
  tryCatch(api_read(s, team_export_studio_write_bundle(file = file, art = art, formats = formats,
      width_mm = width, height_mm = height, dpi = dpi, base_pt = base_pt, preset = preset,
      font_family = font, hybrid_mode = hybrid)),
    error = function(e) { unlink(file); if (inherits(e, "session_lost")) stop(e); unavailable(e) })
  on.exit(unlink(file))
  list(bytes = readBin(file, "raw", n = file.info(file)$size),
    name = paste0(art$filename_base, "_Publication_Bundle_", format(Sys.time(), "%Y%m%d_%H%M"), ".zip"))
}

# The module's downloadHandler registered for this card (e.g. dashboard
# plot_violin -> dl_violin). One unambiguous handler or 404.
# A finished legacy dashboard node never rendered live in this session: build its v0 card.
api_card_for_download <- function(s, instanceId) {
  legacy <- regmatches(instanceId, regexec("^tcinstance_v0_(pca|violin|dist|comp|heat)$", instanceId))[[1L]]
  if (length(legacy) && !exists(instanceId, envir = s$cards, inherits = FALSE)) api_dashboard_v0_card(s, legacy[[2L]])
  api_card_get(s, instanceId)
}
# Run a module download handler and return its file (Team's browser would save it).
api_run_download <- function(s, handler, ext) {
  file <- tempfile(fileext = ext); on.exit(unlink(file))
  unavailable <- function(e) api_abort("api_unprocessable",
    if (nzchar(conditionMessage(e))) conditionMessage(e) else "The plot data are unavailable for this session.")
  # Any other failure inside Team's handler (e.g. its BQC PDF with fewer than two replicates) carries its reason as a
  # 422 instead of a bare 500; the API's own conditions (session_lost, api_*) pass through unchanged.
  failed <- function(e) {
    if (inherits(e, "session_lost") || any(startsWith(class(e), "api_"))) stop(e)
    api_abort("api_unprocessable", paste0("Team's module could not make this file: ",
      if (nzchar(conditionMessage(e))) conditionMessage(e) else "it stopped without a reason."))
  }
  name <- tryCatch(api_read(s, { name <- handler$filename(); handler$content(file); name }),
    shiny.silent.error = unavailable, validation = unavailable, error = failed)
  if (!file.exists(file) || !file.info(file)$size) api_abort("api_unprocessable", "The plot produced no data.")
  list(bytes = readBin(file, "raw", n = file.info(file)$size), name = gsub('["\\\\/]', "_", basename(name)))
}
api_card_csv <- function(s, instanceId) {
  card <- api_card_for_download(s, instanceId)
  registry <- s$mock$.__enclos_env__$private$file_generators
  keys <- grep(paste0("(^|-)", instanceId, "-"), registry$keys(), value = TRUE)
  output <- sub("^plot_", "", sub(paste0("^", instanceId, "-"), "", card$nodeId))
  preferred <- keys[endsWith(keys, paste0("-dl_", output))]
  key <- if (length(preferred) == 1L) preferred else if (length(keys) == 1L) keys else NULL
  if (is.null(key)) api_abort("api_not_found", "This plot has no single data download; use the publication export.")
  api_run_download(s, registry$get(key), ".csv")
}

# "More downloads from this analysis": Team's inspector Export tab mirrors the module's
# download buttons that sit with the plot. Nexo lists the buttons of the nearest container
# around the plot (see api_card_downloads), with Team's label (data-export-label,
# aria-label, then the button text). Only ids whose handler this card registered count.
api_download_links <- function(nodes, prefix) {
  out <- list()
  for (i in seq_along(nodes)) {
    node <- nodes[[i]]; id <- xml2::xml_attr(node, "id")
    if (is.na(id) || !startsWith(id, prefix)) next
    label <- xml2::xml_attr(node, "data-export-label")
    if (is.na(label) || !nzchar(label)) label <- xml2::xml_attr(node, "aria-label")
    if (is.na(label) || !nzchar(label)) label <- gsub("\\s+", " ", trimws(xml2::xml_text(node)))
    # The heading the button sits under (Team's h6 above a pair of batch exports); used only to tell apart
    # buttons that share a label (api_qualify_download_labels).
    heading <- xml2::xml_find_first(node, "preceding::*[self::h1 or self::h2 or self::h3 or self::h4 or self::h5 or self::h6][1]")
    section <- if (inherits(heading, "xml_missing")) "" else gsub("\\s+", " ", trimws(xml2::xml_text(heading)))
    out[[length(out) + 1L]] <- list(id = substring(id, nchar(prefix) + 1L), label = if (nzchar(label)) label else "Download",
      section = section)
  }
  out
}
# Downloads of one card that share a label ("Download All PDFs (ZIP)" twice) carry the heading they sit under;
# unique labels are unchanged. The section field is internal and dropped here.
api_qualify_download_labels <- function(links) {
  labels <- vapply(links, function(x) x$label, "")
  shared <- labels %in% labels[duplicated(labels)]
  lapply(seq_along(links), function(i) {
    x <- links[[i]]; section <- if (is.null(x$section)) "" else x$section
    list(id = x$id, label = if (shared[[i]] && nzchar(section)) paste0(x$label, " \u00b7 ", section) else x$label)
  })
}
# The download links that belong to the plot at `anchor`, nearest first. Links inside another
# tab pane (a sibling tab, not the plot's own) belong to other plots and are skipped.
# `carriers` maps the id of a renderUI placeholder to the download links it renders, so a
# block of buttons the module builds on the server counts where its placeholder sits.
# Ownership (Astra review 2026-11-08, chart audits b07 F5 / b06 row 7): a button belongs to the plot(s) in the
# smallest container around it that holds a plot output (Shiny plot/image output, htmlwidget output, `anchor`
# itself, or a node whose id is in `plots`: placeholders that draw a plot, such as a renderUI carrier that renders
# another plot with its buttons or another catalog plot's renderUI wrapper). The card keeps a button only when that
# container also holds its own plot, so the proportions panel's CSV/PDF no longer reach the network card; the walk
# goes on to the module's root, so the violin view's sidebar batch exports reach its card.
api_nearest_download_links <- function(anchor, prefix, carriers = list(), plots = character()) {
  links <- "a[contains(concat(' ',@class,' '),' shiny-download-link ') and @id]"
  xpath <- if (length(carriers)) paste0(".//", links, " | ", paste(sprintf(".//*[@id='%s']", names(carriers)), collapse = " | ")) else paste0(".//", links)
  mine <- xml2::xml_path(xml2::xml_find_all(anchor, "ancestor-or-self::*"))
  same_tab <- function(node) all(xml2::xml_path(xml2::xml_find_all(node,
    "ancestor::*[contains(concat(' ',@class,' '),' tab-pane ')]")) %in% mine)
  has_class <- function(name) sprintf("contains(concat(' ',@class,' '),' %s ')", name)
  plot_xpath <- paste0("//*[", paste(c(has_class("shiny-plot-output"), has_class("shiny-image-output"),
    has_class("html-widget-output"), if (length(plots)) sprintf("@id='%s'", plots)), collapse = " or "), "]")
  plot_paths <- unique(c(xml2::xml_path(anchor), xml2::xml_path(xml2::xml_find_all(anchor, plot_xpath))))
  anchor_path <- xml2::xml_path(anchor)
  within <- function(path, container) identical(path, container) || startsWith(path, paste0(container, "/"))
  owned <- function(node) {
    for (container in rev(xml2::xml_path(xml2::xml_find_all(node, "ancestor-or-self::*")))) {
      if (any(vapply(plot_paths, within, logical(1), container = container)))
        return(within(anchor_path, container))
    }
    FALSE
  }
  out <- list(); seen <- character()
  for (ancestor in rev(xml2::xml_find_all(anchor, "ancestor::*"))) {
    for (node in xml2::xml_find_all(ancestor, xpath)) {
      path <- xml2::xml_path(node)
      if (path %in% seen) next
      seen <- c(seen, path)
      if (!same_tab(node) || !owned(node)) next
      id <- xml2::xml_attr(node, "id")
      out <- c(out, if (!is.null(carriers[[id]])) carriers[[id]] else api_download_links(list(node), prefix))
    }
  }
  out
}
# The catalog sources of a module family (team_plot_instance_source ids).
api_family_plot_sources <- function(family) {
  if (identical(family, "team_cell")) return(team_cell_instance_outputs)
  outputs <- team_plot_instance_families[[family]]$outputs
  if (is.null(outputs)) character() else paste0(family, "-", outputs)
}
api_card_downloads <- function(s, instanceId) {
  card <- api_card_for_download(s, instanceId)
  prefix <- paste0(instanceId, "-")
  resolved <- team_plot_instance_source(card$source)
  wrappers <- team_plot_instance_layout(card$source)$wrappers
  all_links <- "//a[contains(concat(' ',@class,' '),' shiny-download-link ') and @id]"
  rendered <- list()
  for (name in api_rendered_output_names(s, instanceId)) {
    value <- tryCatch(api_read(s, s$mock$getOutput(name)), error = function(e) NULL)
    html <- if (is.list(value) && is.character(value$html)) value$html else
      if (is.character(value) && length(value) == 1L) value else NULL
    if (is.null(html) || !grepl("shiny-download-link", html, fixed = TRUE)) next
    doc <- tryCatch(xml2::read_html(html), error = function(e) NULL)
    if (!is.null(doc)) rendered[[substring(name, nchar(prefix) + 1L)]] <- doc
  }
  listed <- list()
  # 1) Inside the renderUI wrapper that draws the plot: the buttons nearest the plot.
  for (wrapper in intersect(wrappers, names(rendered))) {
    anchor <- xml2::xml_find_first(rendered[[wrapper]], sprintf("//*[@id='%s%s']", prefix, resolved$output))
    if (!inherits(anchor, "xml_missing")) listed <- api_nearest_download_links(anchor, prefix)
    if (length(listed)) break
  }
  # 2) Otherwise the module's static markup around the plot (or its outermost static wrapper).
  if (!length(listed)) {
    doc <- team_plot_instance_schema_doc(resolved$family); sp <- "tcinstance_schema-"
    others <- setdiff(names(rendered), wrappers)
    carriers <- list()
    for (n in others) carriers[[paste0(sp, n)]] <- api_download_links(xml2::xml_find_all(rendered[[n]], all_links), prefix)
    # Where the module's other plots sit (download ownership, api_nearest_download_links): the family's catalog
    # outputs and their renderUI wrappers, and the renderUI carriers that draw a plot beside their buttons.
    plot_xpath <- "//*[contains(concat(' ',@class,' '),' shiny-plot-output ') or contains(concat(' ',@class,' '),' shiny-image-output ') or contains(concat(' ',@class,' '),' html-widget-output ')]"
    plots <- paste0(sp, unique(unlist(lapply(api_family_plot_sources(resolved$family), function(source)
      c(team_plot_instance_source(source)$output, team_plot_instance_layout(source)$wrappers)), use.names = FALSE)))
    plots <- c(plots, paste0(sp, Filter(function(n) length(xml2::xml_find_all(rendered[[n]], plot_xpath)) > 0L, others)))
    for (key in c(resolved$output, wrappers)) {
      hit <- xml2::xml_find_first(doc, sprintf("//*[@id='%s%s']", sp, key))
      if (!inherits(hit, "xml_missing")) { listed <- api_nearest_download_links(hit, sp, carriers, plots); break }
    }
  }
  # 3) The module's configuration downloads (api_config_download_links), wherever its UI puts them.
  listed <- c(listed, api_config_download_links(resolved$family))
  ids <- vapply(listed, `[[`, "", "id")
  listed <- api_qualify_download_labels(listed[!duplicated(ids)])
  registry <- s$mock$.__enclos_env__$private$file_generators
  registered <- vapply(listed, function(x)
    isTRUE(tryCatch(registry$has(s$mock$ns(paste0(prefix, x$id))), error = function(e) FALSE)), logical(1))
  list(downloads = unname(listed[registered]))
}
api_download_type <- function(name) {
  ext <- tolower(tools::file_ext(name))
  types <- c(csv = "text/csv; charset=utf-8", pdf = "application/pdf", zip = "application/zip",
    png = "image/png", svg = "image/svg+xml", tsv = "text/tab-separated-values; charset=utf-8",
    txt = "text/plain; charset=utf-8", json = "application/json", xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  if (ext %in% names(types)) types[[ext]] else "application/octet-stream"
}
api_card_download <- function(s, instanceId, downloadId) {
  if (!is.character(downloadId) || length(downloadId) != 1L || !grepl("^[A-Za-z][A-Za-z0-9_]{0,99}$", downloadId))
    api_abort("api_bad_request", "Unknown download.")
  listed <- api_card_downloads(s, instanceId)$downloads
  if (!downloadId %in% vapply(listed, `[[`, "", "id"))
    api_abort("api_not_found", "This plot has no such download.")
  registry <- s$mock$.__enclos_env__$private$file_generators
  handler <- registry$get(s$mock$ns(paste0(instanceId, "-", downloadId)))
  # The handler names its file; write to a temp file with the same extension.
  name <- tryCatch(api_read(s, handler$filename()), error = function(e) "download")
  ext <- tools::file_ext(name)
  result <- api_run_download(s, handler, if (nzchar(ext)) paste0(".", ext) else "")
  c(result, list(type = api_download_type(result$name)))
}

# Chart audit b11 F3: a module's configuration file pair, e.g. the pathway module's "Download Layout JSON"
# (download_config) and "Upload Layout JSON (.json):" (upload_config, a fileInput), sits in its sidebar, away from
# the plot. Rule: in the module's static UI, a download link or a file input whose id ends in "config" is a
# configuration control of every card of that module (today: pathway_tab download_config and upload_config).
api_config_id <- function(ids) grepl("config$", ids)
api_config_download_links <- function(family) {
  doc <- team_plot_instance_schema_doc(family); sp <- "tcinstance_schema-"
  nodes <- xml2::xml_find_all(doc, "//a[contains(concat(' ',@class,' '),' shiny-download-link ') and @id]")
  Filter(function(x) api_config_id(x$id), api_download_links(nodes, sp))
}
# The configuration file inputs Nexo offers in the Data tab: id, Team's label and accepted types.
api_card_upload_controls <- function(family) {
  doc <- team_plot_instance_schema_doc(family); sp <- "tcinstance_schema-"
  out <- list()
  for (node in xml2::xml_find_all(doc, "//input[@type='file' and @id]")) {
    id <- substring(xml2::xml_attr(node, "id"), nchar(sp) + 1L)
    if (!startsWith(xml2::xml_attr(node, "id"), sp) || !api_config_id(id)) next
    label <- xml2::xml_find_first(doc, sprintf("//label[@for='%s%s']", sp, id))
    label <- if (inherits(label, "xml_missing")) id else gsub("\\s+", " ", trimws(xml2::xml_text(label)))
    accept <- xml2::xml_attr(node, "accept")
    out[[length(out) + 1L]] <- list(id = id, label = if (nzchar(label)) label else id, accept = if (is.na(accept)) "" else accept)
  }
  out
}
# A layout file is small: Nexo keeps it in its checkpoint member (512 KiB of inputs per card).
api_upload_limit <- 256 * 1024
# The uploaded file reaches the module as Shiny's fileInput gives it: a one-row data.frame
# (name, size, type, datapath). Only a .json file (Team's accept) within the limit that parses is passed on;
# a file that does not parse is refused with Team's own message (13_pathway_module.R upload_config observer).
api_card_upload <- function(s, instanceId, inputId, file) {
  api_mutation(s, NULL, NULL, (function() {
  card <- api_card_get(s, instanceId)
  controls <- api_card_upload_controls(card$family)
  if (!is.character(inputId) || length(inputId) != 1L || !inputId %in% vapply(controls, `[[`, "", "id"))
    api_abort("api_bad_request", "This plot has no such file input.")
  name <- file$name; content <- file$content
  if (!is.character(name) || length(name) != 1L || is.na(name) || !nzchar(name) || nchar(name) > 200L ||
      grepl("[[:cntrl:]/\\\\]", name))
    api_abort("api_bad_request", "The file needs a name.")
  if (!grepl("[.]json$", name, ignore.case = TRUE)) api_abort("api_bad_request", "Upload a .json file.")
  if (!is.character(content) || length(content) != 1L || is.na(content))
    api_abort("api_bad_request", "The file is empty.")
  size <- nchar(content, type = "bytes")
  if (size > api_upload_limit) api_abort("api_bad_request", "The file is larger than 256 KiB.")
  # parse_json reads the text only (fromJSON would read a string that names a file or URL); the field access below is
  # the one Team's observer makes first, so a JSON scalar gets Team's own error ("$ operator is invalid ...").
  tryCatch({ loaded <- jsonlite::parse_json(content, simplifyVector = FALSE); loaded$active_classes; invisible() },
    error = function(e) api_abort("api_bad_request", paste("Error loading layout JSON:", conditionMessage(e))))
  dir <- file.path(tempdir(), "nexo-uploads"); dir.create(dir, showWarnings = FALSE, recursive = TRUE)
  path <- tempfile("upload-", tmpdir = dir, fileext = ".json")
  # The module reads the file during the flush; it is removed afterwards, also when the flush fails (small fixes item 5).
  on.exit(unlink(path), add = TRUE)
  writeBin(charToRaw(enc2utf8(content)), path)
  value <- data.frame(name = basename(name), size = size, type = "application/json", datapath = path,
    stringsAsFactors = FALSE)
  api_session_dirty(s)
  # The module's state changes through its own observer: no disk cache for this card (as after a pressed button).
  if (is.null(s$acted)) s$acted <- new.env(parent = emptyenv()); s$acted[[instanceId]] <- TRUE
  do.call(api_inputs, c(list(s), stats::setNames(list(value), paste0(instanceId, "-", inputId))))
  api_flush(s)
  card$inputs <- api_card_current_inputs(s, card)
  card$settled <- s$bus$settled(instanceId)
  s$cards[[instanceId]] <- card
  list(settled = card$settled, inputs = card$inputs, file = list(name = basename(name), size = size))
  })())
}
