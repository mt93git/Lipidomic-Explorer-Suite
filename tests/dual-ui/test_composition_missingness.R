suppressPackageStartupMessages({library(shiny);library(dplyr);library(tidyr);library(tibble);library(ggplot2)})
source('R/utils_vis.R')
source('R/utils_csv_export.R')
`%||%` <- function(x,y) if(is.null(x)) y else x

mat <- matrix(c(1,2,5,4,6,7),nrow=3,dimnames=list(c('PC(34:1)','PC(36:2)','PE(36:2)'),c('S1','S2')))
original <- mat
anno <- data.frame(Lipid_Name=rownames(mat),subclass=c('PC','PC','PE'),hyperclass='GP')
for (builder in list(buildBarPlot,buildDonutPlot)) {
  for (bad in list(NA_real_,NaN,Inf,-Inf)) {
    incomplete <- mat;incomplete[1:2,1] <- bad
    result <- tryCatch(builder(incomplete,'Synthetic',anno),error=identity)
    stopifnot(inherits(result,'shiny.silent.error'),grepl('complete, finite prepared abundances',conditionMessage(result),fixed=TRUE))
  }
  plot <- builder(mat,'Synthetic',anno,class_colors=c(PC='#123456',PE='#654321'))
  stopifnot(inherits(plot,'ggplot'),identical(mat,original))
  # Independent arithmetic oracle: PC totals 1+2 and 4+6; PE totals 5 and 7.
  stopifnot(all(c(3,10,5,7) %in% plot$data$Value))
}

# Execute the actual two download content functions, including their error path.
find_download <- function(node,target) {
  if (!is.call(node) && !is.expression(node) && !is.pairlist(node)) return(NULL)
  if (is.call(node) && identical(node[[1]],as.name('<-')) &&
      is.call(node[[2]]) && identical(node[[2]][[1]],as.name('$')) &&
      identical(node[[2]][[2]],as.name('output')) && identical(node[[2]][[3]],as.name(target))) return(node[[3]])
  for (i in seq_along(node)) {
    result <- tryCatch(find_download(node[[i]],target),error=function(e)NULL)
    if(!is.null(result))return(result)
  }
  NULL
}
ast <- parse('R/modules/5_barchart_module.R')
for (target in c('downloadDonutCSV_Unfiltered','downloadDonutCSV_Filtered')) {
  e <- new.env(parent=globalenv())
  e$shared_data <- list(annotationData=function()anno)
  e$input <- list(barValueMode='Absolute (%)',barGroupMode='Sub-class',barOrientation='sample_x')
  e$is_agg <- function()FALSE
  e$barGroupingMap <- function()NULL
  current <- mat
  e$unfilteredData <- e$filteredBarData <- function()current
  handler <- eval(find_download(ast,target)[['content']],e)
  path <- tempfile(fileext='.csv')
  handler(path)
  complete <- read.csv(path,check.names=FALSE)
  stopifnot(!'Error'%in%names(complete),all(c(3,10,5,7)%in%complete$Value))
  current[1:2,1] <- NA_real_
  handler(path)
  rejected <- read.csv(path,check.names=FALSE)
  stopifnot(identical(names(rejected),'Error'),grepl('complete, finite prepared abundances',rejected$Error,fixed=TRUE),! 'Value'%in%names(rejected))
  unlink(path)
}
cat('PASS: composition plots and both donut CSV handlers reject missing/nonfinite values; complete-data totals and source matrix are unchanged\n')
