# Violin distributions (logratio_tab): with no baseline chosen yet, the baseline defaults to
# the analysis reference group (Differential Expression > Reference), not to the
# alphabetically first group. A reference saved as a combined Group1_Group2 level picks the
# violin level holding the same samples. A baseline the user chose is kept. Synthetic data.
suppressPackageStartupMessages({ library(shiny); library(dplyr); library(tidyr) })
`%||%` <- function(a, b) if (is.null(a)) b else a
source('R/core/hooks.R'); source('R/modules/utils_stats.R'); source('R/modules/9_logratio_module.R')
checks <- character()
check <- function(label, condition) { if (!isTRUE(condition)) stop(paste('FAIL:', label)); checks <<- c(checks, label) }

# The module's baseline observer reads the analysis reference (Team and Nexo share it).
src <- paste(deparse(body(logratio_server)), collapse = '\n')
check('the violin baseline observer uses the analysis reference',
  grepl('logratio_default_baseline(', src, fixed = TRUE) && grepl('de_ref_selected', src, fixed = TRUE))

meta <- data.frame(FullName = paste0('S', 1:6), Group1 = c('Alpha', 'Alpha', 'Control', 'Control', 'Zeta', 'Zeta'),
  Group2 = c('Dead', 'Dead', 'Unstim', 'Unstim', 'Live', 'Live'), stringsAsFactors = FALSE)
meta$Violin_Group <- meta$Group1
choices <- sort(unique(meta$Group1))
pick <- function(current, reference) logratio_default_baseline(choices, current, reference, meta, 'Violin_Group')
check('defaults to the analysis reference, not the first group', identical(pick(NULL, 'Control'), 'Control'))
check('a combined Group1_Group2 reference picks its Group1 level', identical(pick(NULL, 'Control_Unstim'), 'Control'))
check('without a reference the first group stays the default', identical(pick(NULL, NULL), 'Alpha'))
check('a reference that is no violin level falls back to the first group', identical(pick(NULL, 'Other'), 'Alpha'))
check('a baseline the user chose is kept', identical(pick('Zeta', 'Control'), 'Zeta'))
check('a stale baseline is replaced by the reference', identical(pick('Gone', 'Control'), 'Control'))
cat('PASS:', length(checks), 'violin default baseline checks\n')
