source("R/global.R")

# Execute the batch ZIP generator defined inside the production module with a
# deterministic plot database. This exercises its real PDF and ZIP writers.
assigned_function <- function(node, name) {
  if (is.call(node) && identical(node[[1L]], as.name("<-")) &&
      identical(node[[2L]], as.name(name))) return(node[[3L]])
  if (!is.call(node) && !is.expression(node) && !is.list(node)) return(NULL)
  for (i in seq_along(node)) {
    found <- tryCatch(assigned_function(node[[i]], name), error = function(e) NULL)
    if (!is.null(found)) return(found)
  }
  NULL
}
generator_ast <- assigned_function(body(logratio_server), "generate_zip_for_level")
stopifnot(is.call(generator_ast), identical(generator_ast[[1L]], as.name("function")))

scope <- new.env(parent = environment(logratio_server))
scope$input <- list(groupingMetadata = "Group1", comparisonStrategy = "Faceted (Intra-group Reference)",
                    color_target_var = "Group1", shortYAxis = TRUE, scaleMode = "log2fc",
                    showBaseline = FALSE, sigDisplayType = "star", additiveFiltering = "advanced")
scope$seen_filters <- list()
scope$build_db_for_level <- function(level, add_filter = "none") {
  scope$seen_filters[[length(scope$seen_filters) + 1L]] <- c(level, add_filter)
  list(plot_db = data.frame(Feature = "PC", Group1 = "A", GroupingVal = "A",
                            Significance = "ns"), baseline_grp = "A")
}
scope$applied_violin_colors <- function() c(A = "#123456")
scope$global_color_map <- function() list(Group1 = c(A = "#123456"))
scope$shared_data <- list(color_maps = scope$global_color_map)
scope$plot_logratio_violin <- function(...) {
  ggplot2::ggplot(data.frame(x = 1, y = 1), ggplot2::aes(x, y)) + ggplot2::geom_point()
}
generate_zip <- eval(generator_ast, envir = scope)
scope$generate_zip_for_level <- generate_zip
download_content <- function(node, output_name) {
  if (is.call(node) && identical(node[[1L]], as.name("<-")) &&
      is.call(node[[2L]]) && identical(node[[2L]][[1L]], as.name("$")) &&
      identical(node[[2L]][[3L]], as.name(output_name)) &&
      is.call(node[[3L]]) && identical(node[[3L]][[1L]], as.name("downloadHandler"))) {
    return(as.list(node[[3L]])$content)
  }
  if (!is.call(node) && !is.expression(node) && !is.list(node)) return(NULL)
  for (i in seq_along(node)) {
    found <- tryCatch(download_content(node[[i]], output_name), error = function(e) NULL)
    if (!is.null(found)) return(found)
  }
  NULL
}
staging_dirs <- function() {
  dirs <- list.dirs(tempdir(), recursive = FALSE, full.names = TRUE)
  dirs[startsWith(basename(dirs), "zipdir")]
}

cwd <- getwd()
before <- staging_dirs()
out <- tempfile(fileext = ".zip")
generate_zip(out, "macro")
entries <- utils::unzip(out, list = TRUE)$Name
stopifnot(file.exists(out), length(entries) == 1L,
          grepl("_PC_Sig_fake[.]pdf$", entries[[1L]]),
          identical(getwd(), cwd), !length(setdiff(staging_dirs(), before)))

# Execute the actual registered download content callbacks. They must accept
# the third UI argument and pass the selected additive filter into the builder.
for (pair in list(c("downloadAllMacroZip", "macro"),
                  c("downloadAllSubclassZip", "subclass"))) {
  content_ast <- download_content(body(logratio_server), pair[[1L]])
  stopifnot(is.call(content_ast))
  content <- eval(content_ast, envir = scope)
  handler_zip <- tempfile(fileext = ".zip")
  content(handler_zip)
  stopifnot(file.exists(handler_zip),
            length(utils::unzip(handler_zip, list = TRUE)$Name) == 1L,
            identical(tail(scope$seen_filters, 1L)[[1L]], c(pair[[2L]], "advanced")),
            identical(getwd(), cwd), !length(setdiff(staging_dirs(), before)))
  unlink(handler_zip)
}

bad_destination <- file.path(tempfile("absent-zip-parent-"), "plots.zip")
failure <- try(generate_zip(bad_destination, "macro"), silent = TRUE)
stopifnot(inherits(failure, "try-error"), identical(getwd(), cwd),
          !length(setdiff(staging_dirs(), before)))
unlink(out)
cat("PASS: actual macro/subclass ZIP callbacks preserve additive filter, and ZIP failure leaves cwd/staging clean\n")
