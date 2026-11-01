# Execute the actual shared preparation, PCA and differential engines under
# Classic and Team policies on the same explicit CSV inputs and settings.
# Requires SAMPLE_COLUMN and GROUP_COLUMN in the supplied metadata. This test
# does not validate the biological design or claim render/Canvas coverage.
source('R/global.R')
source('R/sample_metadata_import.R')
required <- c('ABUNDANCE_CSV','METADATA_CSV','SAMPLE_COLUMN','GROUP_COLUMN')
args <- Sys.getenv(required); names(args) <- required
if(any(!nzchar(args))) stop(paste('Set:',paste(required,collapse=', ')))
dat <- read.csv(args[['ABUNDANCE_CSV']],check.names=FALSE,stringsAsFactors=FALSE)
md <- read.csv(args[['METADATA_CSV']],check.names=FALSE,stringsAsFactors=FALSE)
stopifnot(names(dat)[1]=='Lipid_Name', all(c(args[['SAMPLE_COLUMN']],args[['GROUP_COLUMN']]) %in% names(md)))
ids <- names(dat)[-1]
stopifnot(length(ids)>=4L,!anyDuplicated(ids),!anyDuplicated(md[[args[['SAMPLE_COLUMN']]]]),
          all(ids %in% md[[args[['SAMPLE_COLUMN']]]]))
md <- md[match(ids,md[[args[['SAMPLE_COLUMN']]]]),,drop=FALSE]
groups <- as.character(md[[args[['GROUP_COLUMN']]]])
stopifnot(!anyNA(groups),all(nzchar(groups)))
counts <- table(groups)
skip_de <- identical(Sys.getenv('SKIP_DIFFERENTIAL'),'1')
subject_col <- Sys.getenv('SUBJECT_COLUMN')
time_col <- Sys.getenv('TIME_COLUMN')
if(!skip_de) {
  if(length(counts)!=2L || any(counts<2L)) stop('Differential comparison requires exactly two groups of at least two samples each')
  if(!nzchar(subject_col) || !subject_col %in% names(md) || anyNA(md[[subject_col]]) ||
     any(!nzchar(as.character(md[[subject_col]]))) || anyDuplicated(md[[subject_col]]))
    stop('Differential comparison requires a documented nonempty unique subject ID per sample; set SUBJECT_COLUMN or SKIP_DIFFERENTIAL=1')
}
ref <- Sys.getenv('REFERENCE_GROUP',unset=names(counts)[1]); cmp <- Sys.getenv('COMPARISON_GROUP',unset=names(counts)[min(2,length(counts))])
if(!skip_de) stopifnot(ref %in% names(counts),cmp %in% names(counts),ref!=cmp)
# The test explicitly supplies the same settings to both real hub instances.
detection_pct <- as.numeric(Sys.getenv('DETECTION_PCT',unset='80'))
drop_undetected <- identical(Sys.getenv('DROP_UNDETECTED',unset='0'),'1')
stopifnot(length(detection_pct)==1L,is.finite(detection_pct),detection_pct>=0,detection_pct<=100)
settings_value <- list(useImputation=TRUE,normalizationMethod='median',imputeZerosPerFile=FALSE,
 imputeRemainingNAtoZero=TRUE,minDetectionPct=detection_pct,dropNonDetected=drop_undetected,detectionScope='global',
 outlierTreatments=list(),outlier_trigger=0,imputationSeed=42L)
md_stage <- md
names(md_stage)[names(md_stage)==args[['SAMPLE_COLUMN']]] <- 'SampleID'
mappings <- c(Group1=args[['GROUP_COLUMN']])
if(nzchar(subject_col)) mappings <- c(mappings,PatientNumber=subject_col)
if(nzchar(time_col)) mappings <- c(mappings,TimePoint=time_col)
stopifnot(all(unname(mappings) %in% names(md_stage)))
res <- list()
for(policy in c('classic','team')) {
  settings <- shiny::reactiveVal(settings_value)
  shiny::testServer(shared_data_server,args=list(external_settings=shiny::reactive(settings()),
      preparation_policy=policy,design_check=function() TRUE,inference_check=function(paired) if(skip_de) isTRUE(paired) else !paired), {
    session$setInputs(files=data.frame(name='input.csv',size=file.info(args[['ABUNDANCE_CSV']])$size,
      type='text/csv',datapath=args[['ABUNDANCE_CSV']]),selectedColumns=ids,useAveragedSubstitution=FALSE)
    session$flushReact(); api <- session$returned
    api$set_external_sample_metadata(stage_metadata_v01(md_stage,ids,mappings),TRUE)
    session$flushReact(); session$setInputs(runAnalysis=1);session$flushReact()
    if(!identical(preparation$state()$status,'ready')) stop(paste(policy,'preparation failed:',preparation$state()$error))
    session$setInputs(deReferenceGroups=ref,deComparisonGroups=cmp,deOrientGroup1=TRUE,
      deOrientGroup2=FALSE,deMethod='limma',pValueType='adjusted',pFilterThreshold=0.05,
      log2fcThreshold=1); session$flushReact()
    output_data <- list(matrix=data_processed_full(),pca=api$pca_results(),de=if(skip_de) NULL else api$de_results(),
                        significant=if(skip_de) NULL else api$significant_lipids(),annotation=api$annotationData())
    stopifnot(!is.null(output_data$pca))
    if(!skip_de) stopifnot(!is.null(output_data$de),nrow(output_data$de)>0L)
    output_data$metadata <- api$all_metadata()
    output_data$class_colors <- api$class_color_map()
    output_data$color_maps <- api$color_maps()
    output_data$de_settings <- api$de_settings()
    output_data$filtered_ids <- api$global_filtered_lipids()
    output_data$targeted <- api$targeted_mode_active()
    output_data$contrast <- api$de_contrast_info()
    output_data$method <- api$actual_de_method()
    res[[policy]] <<- output_data

  })
}
# Execute the real composition module CSV against the actual prepared hub data.
for (policy in c('classic','team')) {
  d <- res[[policy]]
  value <- function(x) { force(x); function(...) x }
  h <- list(data_processed=value(d$matrix), all_metadata=value(d$metadata),
    annotationData=value(d$annotation), global_filtered_lipids=value(d$filtered_ids),
    targeted_mode_active=value(d$targeted), get_restored_input=function(id,default) default,
    class_color_map=value(d$class_colors),species_color_map=value(d$class_colors),origin_color_map=value(d$class_colors))
  comp_csv <- NULL
  shiny::testServer(barchart_server,args=list(shared_data=h,global_color_map=value(d$color_maps)), {
    session$setInputs(repMode='replicate',barValueMode='Absolute (%)',barGroupMode='Sub-class',barOrientation='sample_x',classLabelFormat='short')
    session$flushReact()
    comp_csv <<- read.csv(output$downloadDonutCSV_Unfiltered,check.names=FALSE,stringsAsFactors=FALSE)
    rendered <- output$barPlotUnfiltered
    stopifnot(is.list(rendered),is.character(rendered$src),nzchar(rendered$src))
  })
  if('Error' %in% names(comp_csv)) stop(paste('Composition export error:',comp_csv$Error[1]))
  stopifnot(nrow(comp_csv)>0L,all(c('Slice','Donut','Value','Pct') %in% names(comp_csv)))
  totals <- tapply(comp_csv$Value,comp_csv$Donut,sum)
  shares <- tapply(comp_csv$Pct,comp_csv$Donut,sum)
  input_totals <- colSums(as.matrix(d$matrix[-1]))
  stopifnot(length(totals)==length(input_totals),
    max(abs(sort(totals)-sort(input_totals))/pmax(1,sort(input_totals)))<1e-12,
    max(abs(shares-100))<1e-10)
  res[[policy]]$composition_csv <- comp_csv
}
# Execute the production QC correlation reactive and its CSV content handler.
# Other QC observers are deliberately not mounted in this isolated check.
find_ast <- function(node, predicate) {
  if(predicate(node)) return(node)
  if(is.recursive(node)) for(i in seq_along(node)) {
    found <- tryCatch(find_ast(node[[i]],predicate),error=function(e) NULL)
    if(!is.null(found)) return(found)
  }
  NULL
}
ast <- parse('R/modules/2_qc_boxplot_module.R')
assign_corr <- find_ast(ast,function(x) is.call(x) && identical(x[[1]],as.name('<-')) && identical(x[[2]],as.name('buildSampleCorrMatrix')))
assign_download <- find_ast(ast,function(x) is.call(x) && identical(x[[1]],as.name('<-')) && is.call(x[[2]]) &&
  identical(x[[2]][[1]],as.name('$')) && identical(x[[2]][[2]],as.name('output')) && identical(x[[2]][[3]],as.name('downloadSampleCorrCSV')))
stopifnot(!is.null(assign_corr),!is.null(assign_download))
for(policy in c('classic','team')) {
 d <- res[[policy]]; value <- function(x) { force(x); function(...) x }
 e <- new.env(parent=globalenv())
 e$input <- list(main_tabs='Sample Correlation',mergeReplicatesMode='individual',corrMethod='pearson')
 e$shared_data <- list(data_processed=value(d$matrix),global_filtered_lipids=value(d$filtered_ids),targeted_mode_active=value(d$targeted))
 e$sample_corr_fallback_active <- function(...) NULL
 eval(assign_corr,e)
 handler <- eval(assign_download[[3]][['content']],e)
 path <- tempfile(fileext='.csv'); shiny::isolate(handler(path))
 corr_csv <- read.csv(path,row.names=1,check.names=FALSE); unlink(path)
 m <- as.matrix(d$matrix[d$matrix$Lipid_Name %in% d$filtered_ids,-1,drop=FALSE])
 expected <- cor(m,method='pearson',use='pairwise.complete.obs')
 stopifnot(identical(dim(as.matrix(corr_csv)),dim(expected)),max(abs(as.matrix(corr_csv)-expected))<1e-12)
 res[[policy]]$correlation_csv <- corr_csv
}
# Exercise the production volcano CSV handler against each actual hub result.
if(!skip_de) for (policy in c('classic','team')) {
  d <- res[[policy]]
  value <- function(x) { force(x); function(...) x }
  module_hub <- list(de_results=value(d$de),de_settings=value(d$de_settings),
    global_filtered_lipids=value(d$filtered_ids),targeted_mode_active=value(d$targeted),
    annotationData=value(d$annotation),de_contrast_info=value(d$contrast),actual_de_method=value(d$method))
  volcano_csv <- NULL
  shiny::testServer(volcano_server,args=list(shared_data=module_hub), {
    session$setInputs(alphaWeightLog2FC=1,betaWeightNegLog10P=1,classLabelFormat='short',
      volcanoColorMode='regulation',showLabels=FALSE,labelThreshold=10,useCountInsteadOfPct=TRUE,
      pointSize=4,pointAlpha=0.7,pointStroke=0.2,axisTextSize=16,legendTextSize=16,
      removeGrid=TRUE,showDensity=FALSE,symmetricX=TRUE,compressX=FALSE,compressY=FALSE)
    session$flushReact()
    volcano_csv <<- read.csv(output$downloadTable,check.names=FALSE,stringsAsFactors=FALSE)
    rendered <- output$volcanoPlot
    stopifnot(is.list(rendered),is.character(rendered$src),nzchar(rendered$src))
  })
  stopifnot(!is.null(volcano_csv),nrow(volcano_csv)>0L,
            all(c('Lipid_Name','log2FC','p_raw','p_adj_bh','Regulation') %in% names(volcano_csv)))
  res[[policy]]$volcano_csv <- volcano_csv
}
if(nzchar(Sys.getenv('PRIVATE_HUB_RDS'))) saveRDS(res,Sys.getenv('PRIVATE_HUB_RDS'))
for(key in setdiff(names(res$classic),c("color_maps","class_colors"))) {
  if(!isTRUE(all.equal(res$classic[[key]],res$team[[key]],tolerance=1e-12,check.attributes=TRUE)))
    stop(paste('Classic/Team mismatch:',key))
}
cat(sprintf('PASS: Classic/Team current shared hub: raw=%d x %d prepared=%d x %d PCA samples=%d DE rows=%d; detection=%g%% global, drop undetected=%s, QRILC, median, seed 42\n',
 nrow(dat),length(ids),nrow(res$team$matrix),ncol(res$team$matrix)-1,nrow(res$team$pca$score_df),if(skip_de) 0L else nrow(res$team$de),detection_pct,drop_undetected))
cat(sprintf('QC correlation CSV handler: %d x %d matches independent Pearson and both policies\n',nrow(res$team$correlation_csv),ncol(res$team$correlation_csv)))
cat(sprintf('Current composition module CSV: %d rows identical between policies; bar plot rendered in both\n',nrow(res$team$composition_csv)))
if(!skip_de) cat(sprintf('Current volcano module CSV: %d rows identical between policies; plot rendered in both\n',nrow(res$team$volcano_csv)))
if(skip_de) cat('Differential analysis skipped: repeated/uncertain sample relationships.\n')
cat('The same authorization callback was supplied for comparison; it does not establish study-design validity. Other plot renderers and Canvas were not exercised.\n')
