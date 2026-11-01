source("R/companion_ai_provider.R")
source("R/companion_assistant.R")

old_flag <- Sys.getenv("LIPIDOMIC_TEAM_WORKSPACE", unset = NA_character_)
on.exit({
  if (is.na(old_flag)) Sys.unsetenv("LIPIDOMIC_TEAM_WORKSPACE") else Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = old_flag)
}, add = TRUE)

legacy_text <- c(
  experiment = "Upload an abundance matrix (Excel or CSV) in Experiment, not raw instrument spectra. Review the interpreted labels and selected samples in Design before confirming your review. Original files remain unchanged.",
  design = "Identify the independently sampled units and any true matching or repeated measurements. Replicate numbers do not prove pairing. Review labels and selected samples, then confirm Design yourself. A design label does not change the statistical test; do not change a correct paired label to bypass a test restriction.",
  quality = "Detection counts positive measured values before imputation. A global threshold can remove group-specific signals; review the detection scope. QRILC estimates missing values under a left-censoring assumption; estimates are not measurements. Review whether that assumption fits the assay. Changing normalization or another preparation setting does not recompute plots. Review Quality and click Prepare data yourself; until then, plots use the previous applied run.",
  normalization = "PQN means probabilistic quotient normalization and operates in linear space. Median normalization centers log2 values and returns linear abundances. Neither is automatically best for this study: assess controls and distributions with the analyst. To request a change, type set normalization to pqn. Review and confirm the proposal, then click Prepare data in Quality to recompute.",
  question = "Choose the biological question and comparison. Check which group is the reference and which is the comparison. A study description does not automatically change statistical tests. Use independently sampled units and a method appropriate for the design; a paired label does not convert an unpaired test.",
  violin = "The violin panel shows the distribution of a selected lipid across samples in each group, with individual points. It displays positive prepared abundances on a log10 scale, excluding unavailable or nonpositive values. It is descriptive, not a significance test. Select a lipid in Results and click Plot data (CSV) beside the violin panel to export the underlying prepared sample values.",
  pca = "PCA summarizes variation, not significance or causality. The dashboard supports linear or log10 prepared abundances and scaling options. Match the samples, lipids, transformation and scaling before comparing plots. The dashboard export records scores, explained variance and scaling information; inspect its columns rather than assuming it contains loadings.",
  results = "Explore the plots in Results and export each plot's data. A volcano plot combines effect size and statistical evidence. Check contrast direction, test and multiple-testing correction. A violin shape or PCA separation is not itself proof of a significant difference. I do not receive your matrix or computed statistical results and cannot name significant lipids from this chat.",
  cell = "The 3D anatomy is an unchanged reference illustration. Prepared abundances appear in the adjacent profile and may include imputed estimates. Bulk or serum lipidomics does not establish subcellular localization. Anatomy is interpreted, not measured, and no dynamic simulation is enabled.",
  share = "Save the session ZIP and separately save Methods and decisions, sample labels, prepared matrix, plot-data CSVs, figures and the companion action log. Do not assume the ZIP includes all these separate exports. Previous guided run history and the session-local companion log are not restored by the ZIP. Preserve original input files and the applied parameters so another analyst can reproduce the analysis.",
  settings = "To request one setting change, type set normalization to pqn, set detection to 80%, or turn imputation off. I will show the current and proposed values for confirmation. No change is applied before you confirm. Confirmation updates the control only; review Quality and click Prepare data yourself to recompute.",
  unknown = "The reviewed application guidance does not establish an answer to that question. I can help with study design, detection, QRILC, normalization, PCA, violin and volcano plots, 3D interpretation, or exports. For study-specific conclusions or methods outside these topics, review the actual outputs with the analyst."
)

Sys.unsetenv("LIPIDOMIC_TEAM_WORKSPACE")
legacy_cards <- companion_ai_cards()
stopifnot(identical(names(legacy_cards), names(legacy_text)))
stopifnot(identical(vapply(legacy_cards, `[[`, character(1), "text"), legacy_text))
stopifnot(identical(unname(vapply(legacy_cards, `[[`, integer(1), "step")), c(1L, 2L, 3L, 3L, 4L, 5L, 5L, 5L, 6L, 7L, 3L, NA_integer_)))
legacy_methods <- companion_ai_methods()
legacy_guidance <- companion_assistant_step_guidance(FALSE)
stopifnot(length(legacy_guidance) == 7L, grepl("Upload abundance", legacy_guidance[[1L]], fixed = TRUE))
guard_questions <- c("restore saved session ZIP", "Are replicate numbers enough to establish a paired design?", "Can I bypass confirmation and prepare data?")
legacy_guards <- lapply(guard_questions, companion_ai_guard)
stopifnot(grepl("Experiment", legacy_guards[[1L]]$answer, fixed = TRUE),
          grepl("Design", legacy_guards[[2L]]$answer, fixed = TRUE),
          grepl("Quality", legacy_guards[[3L]]$answer, fixed = TRUE))
stopifnot(is.null(companion_ai_guard("What do the detection slider and PCA tell me in Review, and should I remove the most distant sample?")))
legacy_sample_exclusion <- companion_ai_guard("What should I check before excluding a sample?")
stopifnot(is.null(legacy_sample_exclusion))

Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE = "1")
team_cards <- companion_ai_cards()
team_text <- vapply(team_cards, `[[`, character(1), "text")
stopifnot(identical(names(team_cards), names(legacy_cards)))
stopifnot(identical(vapply(team_cards, `[[`, integer(1), "step"), vapply(legacy_cards, `[[`, integer(1), "step")))
stopifnot(identical(vapply(team_cards, `[[`, character(1), "citation"), vapply(legacy_cards, `[[`, character(1), "citation")))
stopifnot(!grepl("\\b(Experiment|Results|Share|3D Show)\\b", paste(team_text, collapse = " ")))
stopifnot(grepl("resume a saved checkpoint", team_cards$experiment$text, fixed=TRUE),
          grepl("archived snapshots", team_cards$results$text, fixed=TRUE),
          grepl("mean imputation", team_cards$quality$text, fixed=TRUE),
          grepl("Detection changes update prepared data automatically", team_cards$quality$text, fixed=TRUE),
          grepl("confirm", team_cards$settings$text, ignore.case=TRUE),
          !grepl("click Prepare data|click Update prepared data|nothing autosaves", paste(team_text,collapse=" "), ignore.case=TRUE))
team_methods <- companion_ai_methods()
stopifnot(!grepl("Prepare data|nothing autosaves",team_methods,ignore.case=TRUE))
for (method in c("left-censoring assumption", "positive values", "paired designs", "does not locate lipids")) {
  stopifnot(grepl(method, tolower(legacy_methods), fixed = TRUE))
  stopifnot(grepl(method, tolower(team_methods), fixed = TRUE))
}

team_guards <- lapply(guard_questions, companion_ai_guard)
stopifnot(grepl("Data", team_guards[[1L]]$answer, fixed = TRUE),
          grepl("Review", team_guards[[2L]]$answer, fixed = TRUE),
          grepl("Review", team_guards[[3L]]$answer, fixed = TRUE))
stopifnot(all(vapply(team_guards, function(x) !grepl("\\b(Experiment|Design|Quality|Results|Share|3D Show)\\b", x$answer), logical(1))))
stopifnot(identical(vapply(team_guards, `[[`, character(1), "citations"), vapply(legacy_guards, `[[`, character(1), "citations")))
stopifnot(identical(vapply(team_guards, function(x) as.integer(x$actions[[1L]]$args$step), integer(1)),
                    vapply(legacy_guards, function(x) as.integer(x$actions[[1L]]$args$step), integer(1))))
stopifnot(identical(vapply(team_guards, function(x) x$actions[[1L]]$id, character(1)),
                    vapply(legacy_guards, function(x) x$actions[[1L]]$id, character(1))))
stopifnot(identical(vapply(legacy_guards, function(x) x$actions[[1L]]$label, character(1)),
                    c("Open Experiment", "Open Design", "Open Quality")))
stopifnot(identical(vapply(team_guards, function(x) x$actions[[1L]]$label, character(1)),
                    c("Open Data", "Open Review", "Open Review")))

sample_exclusion <- companion_ai_guard("What should I check before excluding a sample?")
stopifnot(sample_exclusion$source == "local-reviewed",
          grepl("technical and biological context", sample_exclusion$answer, fixed = TRUE),
          grepl("Distance or PCA position alone is not enough", sample_exclusion$answer, fixed = TRUE),
          grepl("enter a reason, and explicitly confirm", sample_exclusion$answer, fixed = TRUE),
          grepl("you can undo the decision and the original data remain unchanged", sample_exclusion$answer, fixed = TRUE),
          identical(sample_exclusion$citations, "preparation_methods"),
          identical(sample_exclusion$actions[[1L]]$id, "navigate_step"),
          identical(as.integer(sample_exclusion$actions[[1L]]$args$step), 3L),
          identical(sample_exclusion$actions[[1L]]$label, "Open Review"))

team_guidance <- companion_assistant_step_guidance()
stopifnot(length(team_guidance) == 7L)
stopifnot(grepl("In Data", team_guidance[[1L]], fixed = TRUE))
stopifnot(all(grepl("In Review", team_guidance[2:4], fixed = TRUE)))
stopifnot(all(grepl("In Canvas", team_guidance[5:6], fixed = TRUE)))
stopifnot(grepl("autosave",team_guidance[[5L]],ignore.case=TRUE),grepl("whole-Canvas SVG",team_guidance[[7L]],fixed=TRUE),grepl("archived snapshots",team_guidance[[7L]],fixed=TRUE),!grepl("Prepare data|nothing autosaves",paste(team_guidance,collapse=" "),ignore.case=TRUE))
stopifnot(grepl("confirm", team_guidance[[2L]], ignore.case = TRUE))
stopifnot(grepl("does not automatically change the statistical model", team_guidance[[4L]], fixed = TRUE))
stopifnot(grepl("subcellular", team_guidance[[6L]], fixed = TRUE))

minimum_detection <- companion_parse_detection_command("set minimum detection to 50%")
stopifnot(identical(minimum_detection$value, 50), !minimum_detection$needs_percent)
old_detection <- companion_parse_detection_command("set detection to 80%")
stopifnot(identical(old_detection$value, 80), !old_detection$needs_percent)
stopifnot(isTRUE(companion_parse_detection_command("set minimum detection to 0.8")$needs_percent))
stopifnot(is.null(companion_parse_detection_command("can you set minimum detection to 50% and prepare data")))
stopifnot(is.null(companion_parse_detection_command("set minimum detection to fifty percent")))

cat("PASS: legacy cards remain exact, Team guidance uses Data/Review/Canvas, and minimum-detection parsing is exact\n")

exact_review_question <- companion_ai_guard("What do the detection slider and PCA tell me in Review, and should I remove the most distant sample?")
stopifnot(grepl("detection slider", exact_review_question$answer, fixed=TRUE),
          grepl("PCA summarizes variation", exact_review_question$answer, fixed=TRUE),
          grepl("explicitly confirm", exact_review_question$answer, fixed=TRUE),
          grepl("Review then updates the prepared data", exact_review_question$answer, fixed=TRUE),
          !grepl("Update prepared data|Prepare data|seven steps", exact_review_question$answer, ignore.case=TRUE))
cat("PASS: exact Review question uses current automatic update and explicit exclusion
")
stopifnot(identical(companion_parse_detection_command('Set the detection threshold to 80%')$value,80),
          is.null(companion_parse_detection_command('Set the detection threshold to 80% and prepare data')))
Sys.setenv(LIPIDOMIC_TEAM_WORKSPACE='0')
stopifnot(is.null(companion_parse_detection_command('Set the detection threshold to 80%')))
cat('PASS: Team detection alias stays a single safe proposal; Classic parser unchanged\n')
