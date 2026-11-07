source('tests/integration/helpers.R')
e <- preparation_env()
# Missing observations at different positions previously paired different donors.
a <- c(1,NA,4,8,10,13); b <- c(3,5,NA,9,14,14)
keep <- complete.cases(a,b)
for (method in c('limma','non_parametric')) {
  oracle <- if(method=='limma') t.test(a[keep],b[keep],paired=TRUE)$p.value else
    wilcox.test(a[keep],b[keep],paired=TRUE,exact=FALSE)$p.value
  stopifnot(isTRUE(all.equal(e$compute_local_p_val(a,b,method,TRUE),oracle,tolerance=1e-12)))
  stopifnot(is.na(e$compute_local_p_val(a,b[-1],method,TRUE)))
  stopifnot(is.na(e$compute_local_p_val(c(NA,1),c(2,3),method,TRUE)))
  # Independent and complete paired observations retain their previous semantics.
  independent <- if(method=='limma') t.test(na.omit(a),na.omit(b),var.equal=TRUE)$p.value else
    wilcox.test(na.omit(a),na.omit(b),exact=FALSE)$p.value
  stopifnot(isTRUE(all.equal(e$compute_local_p_val(a,b,method,FALSE),independent)))
  stopifnot(isTRUE(all.equal(e$compute_local_p_val(a[keep],b[keep],method,TRUE),oracle)))
}
# Exercise the real preparation function, not a duplicate of its treatment logic.
e$input$useAveragedSubstitution <- TRUE
e$settings$outlierTreatments <- list(S02='remove')
x <- e$compute_imputed_matrix(TRUE)
stopifnot(!'S02' %in% names(x),ncol(x)==12L)
# Explicit average and unchecked substitution are still available.
e$settings$outlierTreatments <- list(S02='average')
x <- e$compute_imputed_matrix(TRUE)
stopifnot('S02' %in% names(x),isTRUE(all.equal(x$S02,rowMeans(x[,c('S01','S03','S04','S05','S06')],na.rm=TRUE))))
e$settings$outlierTreatments <- list(); e$input$selectedColumns <- setdiff(names(e$rawData()$data)[-1],'S02')
stopifnot('S02' %in% names(e$compute_imputed_matrix(TRUE)))
e$input$useAveragedSubstitution <- FALSE
stopifnot(!'S02' %in% names(e$compute_imputed_matrix(TRUE)))
e$input$selectedColumns <- names(e$rawData()$data)[-1]; e$settings$outlierTreatments <- list(S02='remove')
stopifnot('S02' %in% names(e$compute_imputed_matrix(FALSE)))
e$settings$outlierTreatments <- list(S02='keep')
stopifnot('S02' %in% names(e$compute_imputed_matrix(TRUE)))
cat('PASS: paired missingness, unequal lengths, independent tests, explicit removal, averaging, undo and pre-QC view\n')
