# Run actual parsed production functions; only Shiny/session I/O is replaced.
# No application startup, file upload, network request, or patient data is used.
suppressPackageStartupMessages({library(shiny); library(dplyr); library(tibble); library(tidyr)})
find_assignment <- function(node, target) {
  if (!is.call(node) && !is.expression(node) && !is.pairlist(node)) return(NULL)
  if (is.call(node) && identical(node[[1]], as.name('<-')) && identical(node[[2]], as.name(target))) return(node)
  for (i in seq_along(node)) {
    found <- tryCatch(find_assignment(node[[i]], target), error=function(e) NULL)
    if (!is.null(found)) return(found)
  }
  NULL
}
load_assignments <- function(path, names, env) {
  ast <- parse(path)
  for (name in names) {
    assignment <- find_assignment(ast, name)
    if (is.null(assignment)) stop('Missing production function: ', name, ' in ', path)
    eval(assignment, env)
  }
}
synthetic_fixture <- function() {
  # Algebraic fixture (not RNG generated): same CSV across R versions.
  i <- seq_len(120); j <- seq_len(12)
  m <- outer(i, j, function(a,b) 2^(8 + a/80 + sin(a*b)/3 + b/90 + ifelse(b>6 & a<=30,0.8,0)))
  m[outer(i,j,function(a,b) (a+3*b) %% 19 == 0)] <- NA_real_
  colnames(m) <- sprintf('S%02d',j)
  list(data=data.frame(Lipid_Name=sprintf('SYNTHETIC_L%03d',i),m,check.names=FALSE),
       metadata=data.frame(FullName=colnames(m), Group1=rep(c('Control','Comparison'),each=6), Group2='Synthetic', stringsAsFactors=FALSE))
}
preparation_env <- function(root='.', guided=FALSE, fixture=synthetic_fixture()) {
  e <- new.env(parent=globalenv())
  if (guided) {
    sys.source(file.path(root,'tests/integration/guided_snapshot.R'),e)
  } else {
    if (file.exists(file.path(root,"R/utils_preparation.R"))) sys.source(file.path(root,"R/utils_preparation.R"),e)
    load_assignments(file.path(root,'R/modules/1_shared_data_module.R'), 'compute_imputed_matrix', e)
    load_assignments(file.path(root,'R/modules/utils_stats.R'),
      c('compute_local_p_val','perform_limma_analysis','perform_non_parametric_analysis','construct_contrast_string'),e)
  }
  e$`%||%` <- function(x,y) if(is.null(x)) y else x
  e$rawData <- function() list(data=fixture$data,file_cols=list(names(fixture$data)[-1]))
  e$allParsedMetadata <- function() fixture$metadata
  e$input <- list(selectedColumns=names(fixture$data)[-1],useAveragedSubstitution=FALSE)
  e$settings <- list(useImputation=FALSE,normalizationMethod='none',imputeZerosPerFile=FALSE,
    imputeRemainingNAtoZero=FALSE,dropNonDetected=FALSE,minDetectionPct=0,
    detectionScope='global',imputationSeed=42,outlierTreatments=list())
  e$get_setting <- function(name,default=NULL) if(is.null(e$settings[[name]])) default else e$settings[[name]]
  e$log_ingestion_event <- function(...) NULL
  e$record <- new.env(parent=emptyenv())
  for (name in c('audit_trace_data','synthetic_sample_ids','preparation_audit','applied_preparation','applied_samples','applied_selected_samples')) {
    e[[name]] <- local({key <- name; function(x) e$record[[key]] <- x})
  }
  e$preparation_settings_snapshot <- function() e$settings
  e
}
