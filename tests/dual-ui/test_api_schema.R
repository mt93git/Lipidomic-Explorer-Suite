if (!requireNamespace("xml2", quietly = TRUE)) { cat("SKIP test_api_schema: package xml2 not installed\n"); quit(status = 0) }
for (pkg in c("jsonlite")) if (!requireNamespace(pkg, quietly = TRUE)) stop("Missing test dependency: ", pkg)
Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1", LIPIDOMIC_ALLOW_DEPENDENCY_INSTALL = "0")
Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
suppressPackageStartupMessages(source("R/global.R"))
source("frontends/nexo-api/requirements.R"); api_skip_unless_team_ready("test_api_schema")
source("frontends/nexo-api/engine.R")
fixture <- "tests/dual-ui/fixtures/classic-seed7-synthetic.zip"
local({
  ids <- function(controls) vapply(controls, `[[`, character(1), "id")
  get <- function(controls, id) controls[[match(id, ids(controls))]]
  qc <- api_family_schema("qc_pca_tab")
  allowed <- unique(unlist(lapply(paste0("qc_pca_tab-", team_plot_instance_families$qc_pca_tab$outputs),
    team_plot_instance_input_ids), use.names = FALSE))
  mode <- get(qc, "pcaMode")
  stopifnot(length(qc) >= 10L, !anyDuplicated(ids(qc)), all(ids(qc) %in% allowed),
    mode$type %in% c("select", "radio"), length(mode$options) > 0L,
    any(vapply(qc, function(x) x$type %in% c("number", "range") && !is.null(x$min) && !is.null(x$max), logical(1))),
    any(vapply(qc, function(x) x$type == "boolean", logical(1))))
  cat("PASS schema family qc\n")
  dashboard <- api_family_schema("results_dashboard")
  stopifnot(all(c("color_by", "pca_transform", "pca_scale", "top_n", "violin_lipid") %in% ids(dashboard)))
  for (entry in api_catalog()) stopifnot(all(ids(entry$inputs) %in% entry$allowedInputs))
  cat("PASS schema family dashboard\n")
  flag <- list(list(id = "flag", type = "boolean"))
  stopifnot(identical(api_validate_inputs(flag, list(flag = "false"))$flag, FALSE),
    identical(api_validate_inputs(flag, list(flag = TRUE))$flag, TRUE),
    inherits(tryCatch(api_validate_inputs(flag, list(flag = "maybe")), error = identity), "api_bad_request"))
  cat("PASS schema boolean strict\n")
  s <- api_session_for_checkpoint(fixture)
  on.exit(api_session_close(s))
  violin <- api_card_create(s, "results_dashboard-plot_violin")
  schema <- api_card_schema(s, violin$instanceId)
  lipid <- get(schema$controls, "violin_lipid")
  color <- get(schema$controls, "color_by")
  stopifnot(length(lipid$options) == 12L,
    "Group1" %in% vapply(color$options, `[[`, character(1), "value"),
    !is.null(lipid$value), !is.null(color$value),
    identical(lipid$value, api_read(s, s$mock$input[[paste0(violin$instanceId, "-violin_lipid")]])))
  api_card_update(s, violin$instanceId, list(top_n = 10))
  stopifnot(identical(get(api_card_schema(s, violin$instanceId)$controls, "top_n")$value, 10),
    identical(get(api_family_schema("results_dashboard"), "top_n")$default, 30))
  cat("PASS schema card violin\n")
  card <- api_card_create(s, "qc_pca_tab-pca2dPlot")
  schema <- api_card_schema(s, card$instanceId)
  # Outside allowedInputs only the controls the module builds per group/sample, marked computed
  # (test_api_computed_controls.R).
  extra <- Filter(function(x) !x$id %in% card$allowedInputs, schema$controls)
  stopifnot(length(schema$controls) > 0L, all(api_is_computed_id(ids(extra))),
    all(vapply(extra, function(x) isTRUE(x$computed), logical(1))),
    all(nzchar(vapply(schema$controls, `[[`, character(1), "type"))),
    identical(schema$tabs, team_plot_instance_layout(card$source)$tabs))
  cat("PASS schema card qc\n")
  # H8: Team's dashboard selection bars (text inputs holding "__ALL__", "__EVERY__" or a JSON array) carry their
  # choices, the defaults "__ALL__" stands for, and the token Team writes for "all"; a JSON array is accepted.
  heat <- api_card_create(s, "results_dashboard-plot_heat")
  bars <- Filter(function(x) identical(x$type, "text") && length(x$options) > 0L, api_card_schema(s, heat$instanceId)$controls)
  stopifnot(length(bars) >= 1L)
  for (bar in bars) {
    values <- vapply(bar$options, `[[`, character(1), "value")
    stopifnot(bar$allToken %in% c("__ALL__", "__EVERY__"), is.null(bar$defaultChoices) || all(unlist(bar$defaultChoices) %in% values),
      identical(bar$allToken == "__EVERY__", !is.null(bar$defaultChoices)))
  }
  bar <- bars[[1]]; one <- as.character(jsonlite::toJSON(vapply(bar$options, `[[`, character(1), "value")[1]))
  stopifnot(identical(api_validate_inputs(bars, stats::setNames(list(one), bar$id))[[bar$id]], one))
  api_card_update(s, heat$instanceId, stats::setNames(list(one), bar$id))
  stopifnot(identical(api_read(s, s$mock$input[[paste0(heat$instanceId, "-", bar$id)]]), one))
  cat(sprintf("PASS schema selection bars %d (%s) carry defaults and the all-token; a JSON array is accepted\n",
    length(bars), paste(vapply(bars, `[[`, character(1), "id"), collapse = ", ")))
})
