# The DE reference and comparison follow the grouping: a level saved while the grouping
# was Group1 only (for example "Control") is re-mapped to the one combined level that holds
# the same samples once "Group by Group2" is on ("Control_Unstimulated"), and back. A saved
# level that matches no current level, or several, is refused with a clear message instead
# of limma's "Invalid contrast ... object 'Control' not found". Synthetic data only.
source('R/global.R')
source('R/sample_metadata_import.R')
source('R/frontends/team/server.R')
checks <- character()
check <- function(label, condition) { if (!isTRUE(condition)) stop(paste('FAIL:', label)); checks <<- c(checks, label) }

# The shared data module: the saved reference "A" while Group by Group2 is on.
fixture <- data.frame(Lipid_Name = paste0('PC(', seq(100, 139), ':1)'), check.names = FALSE)
set.seed(7)
for (id in paste0('S', 1:6)) fixture[[id]] <- round(stats::runif(40, 100, 1000), 1)
path <- tempfile(fileext = '.csv'); write.csv(fixture, path, row.names = FALSE)
ids <- names(fixture)[-1]
md <- data.frame(SampleID = ids, Condition = c('A', 'A', 'A', 'B', 'B', 'B'), Class = c('x', 'x', 'x', 'y', 'y', 'y'),
  stringsAsFactors = FALSE)
base <- list(useImputation = FALSE, normalizationMethod = 'none', imputeZerosPerFile = FALSE,
  imputeRemainingNAtoZero = TRUE, minDetectionPct = 0, dropNonDetected = FALSE, detectionScope = 'global',
  outlierTreatments = list(), outlier_trigger = 0, imputationSeed = 42L)
shiny::testServer(shared_data_server, args = list(external_settings = shiny::reactive(base),
  preparation_policy = 'team', design_check = function() TRUE, inference_check = function(paired) !paired), {
  session$setInputs(files = data.frame(name = 'synthetic.csv', size = file.info(path)$size, type = 'text/csv', datapath = path),
    selectedColumns = ids, useAveragedSubstitution = FALSE)
  session$flushReact(); api <- session$returned
  api$set_external_sample_metadata(stage_metadata_v01(md, ids, c(Group1 = 'Condition', Group2 = 'Class')), TRUE)
  session$flushReact(); session$setInputs(runAnalysis = 1); session$flushReact()
  session$setInputs(deReferenceGroups = 'A', deComparisonGroups = 'B_y', deOrientGroup1 = TRUE, deOrientGroup2 = TRUE,
    deMethod = 'limma', pValueType = 'raw', pFilterThreshold = 1, log2fcThreshold = 0)
  session$flushReact()
  out <- tryCatch(allLipidDEOutput(), error = function(e) e)
  if (inherits(out, 'error')) message('DE error: ', conditionMessage(out))
  check('a stale Group1 reference is re-mapped to its combined level', !inherits(out, 'error') && !is.null(out$results))
  session$setInputs(deReferenceGroups = 'A_x', deComparisonGroups = 'B_y'); session$flushReact()
  plain <- allLipidDEOutput()
  check('the re-mapped contrast equals choosing the combined levels by hand',
    isTRUE(all.equal(out$results, plain$results)))
  session$setInputs(deReferenceGroups = 'Missing', deComparisonGroups = 'B_y'); session$flushReact()
  out <- tryCatch(allLipidDEOutput(), error = function(e) e)
  check('an unknown reference is refused with a clear message',
    inherits(out, 'error') && grepl('Reference group "Missing" is not a group of the current grouping', conditionMessage(out), fixed = TRUE) &&
      !grepl('Invalid contrast', conditionMessage(out), fixed = TRUE))
})

# The pure helper.
meta <- data.frame(FullName = paste0('S', 1:6), Group1 = c('Ctl', 'Ctl', 'StimA', 'StimA', 'StimB', 'StimB'),
  Group2 = c('None', 'None', 'Live', 'Live', 'Dead', 'Dead'), stringsAsFactors = FALSE)
meta$Dynamic_DE_Group <- paste(meta$Group1, meta$Group2, sep = '_')
r <- remap_de_groups(c('Ctl'), meta, 'Dynamic_DE_Group')
check('a Group1 level maps to its one combined level', identical(r$groups, 'Ctl_None') && !length(r$unresolved))
r <- remap_de_groups(c('StimA_Live'), meta, 'Dynamic_DE_Group')
check('a valid combined level is kept', identical(r$groups, 'StimA_Live') && !length(r$unresolved))
meta1 <- meta; meta1$Dynamic_DE_Group <- meta1$Group1
r <- remap_de_groups(c('StimB_Dead'), meta1, 'Dynamic_DE_Group')
check('a combined level maps back to its Group1 level when Group2 is off', identical(r$groups, 'StimB') && !length(r$unresolved))
r <- remap_de_groups(c('Nope'), meta, 'Dynamic_DE_Group')
check('an unknown level is unresolved', !length(r$groups) && identical(r$unresolved, 'Nope'))
split <- meta; split$Group2[2] <- 'Other'; split$Dynamic_DE_Group <- paste(split$Group1, split$Group2, sep = '_')
r <- remap_de_groups(c('Ctl'), split, 'Dynamic_DE_Group')
check('a level spread over two combined levels is ambiguous, not pooled', !length(r$groups) && identical(r$unresolved, 'Ctl'))
cat('PASS:', length(checks), 'DE group re-mapping checks\n')
