# Libreros Lab preparation controls: filtering acts on measured data, before QRILC.
ux_detection_preview <- function(df, samples, threshold=0, drop_absent=TRUE, scope='global', metadata=NULL) {
  stopifnot(is.numeric(threshold),length(threshold)==1L,is.finite(threshold),threshold>=0,threshold<=100)
  stopifnot(length(samples) > 0L)
  m <- as.matrix(df[,samples,drop=FALSE])
  observed <- is.finite(m) & m>0
  keep <- rep(TRUE,nrow(df))
  if(drop_absent) keep <- rowSums(observed)>0
  if(threshold>0) {
    if(scope=='group') {
      if (is.null(metadata) || !all(c('FullName', 'Group1', 'Group2') %in% names(metadata)) ||
          !all(samples %in% metadata$FullName))
        stop('Group-based detection needs confirmed condition and tissue metadata for all selected samples.')
      md <- metadata[match(samples,metadata$FullName),,drop=FALSE]
      groups <- interaction(md$Group1,md$Group2,drop=TRUE)
      fractions <- vapply(split(seq_along(samples),groups),
                          function(j) rowMeans(observed[,j,drop=FALSE]), numeric(nrow(df)))
      keep <- keep & apply(fractions,1,max)>=threshold/100
    } else keep <- keep & rowMeans(observed)>=threshold/100
  }
  list(keep=keep, observed=observed, input=nrow(df), retained=sum(keep),
       excluded=sum(!keep), samples=length(samples), all_absent=sum(rowSums(observed)==0),
       threshold=threshold, scope=scope,
       retained_missing=if (any(keep)) mean(!observed[keep,,drop=FALSE]) else NA_real_)
}

ux_filter_detected <- function(df, samples, threshold=0, drop_absent=TRUE, scope='global', metadata=NULL) {
  preview <- ux_detection_preview(df, samples, threshold, drop_absent, scope, metadata)
  keep <- preview$keep
  observed <- preview$observed
  if(preview$retained<2L) stop('Fewer than two lipids pass the detection filter. Lower the threshold or review the samples.')
  retained <- df[keep,,drop=FALSE]
  # CSV imports are data.frames; filtering leaves non-sequential row names.
  # Lipid_Name is the identifier used by downstream matrix conversion.
  rownames(retained) <- NULL
  list(data=retained, audit=list(input=preview$input,retained=preview$retained,excluded=preview$excluded,
    samples=preview$samples,all_absent=preview$all_absent,threshold=threshold,scope=scope,
    raw_missing=mean(!observed),retained_missing=preview$retained_missing))
}

# Optional saved sensitivity study. Its source data and images are deployment
# assets, never part of the shared scientific backend or a clean install.
ux_comparison_available <- function(study_dir = file.path('www', 'study')) {
  all(file.exists(file.path(study_dir, c('comparison.csv',
    'lps_bones-comparison.png', 'neutrophils-comparison.png'))))
}

ux_comparison_ui <- function() {
  if (!ux_comparison_available()) return(div(class='ux-page-heading',
    span(class='ux-eyebrow','SAVED SENSITIVITY STUDY'),
    h2('Run comparison'),
    p('The saved comparison for the two bone datasets is unavailable in this installation. Your uploaded experiment and analysis tools remain available.')))
  tagList(
    div(class='ux-page-heading',span(class='ux-eyebrow','SAVED SENSITIVITY STUDY · 16 OCT 2026'),
        h2('How much does preparation change the result?'),
        p('Compare the original pipeline with detection filters applied before imputation. These saved runs belong to the two bone datasets; they do not change when you upload a different experiment.')),
    div(class='ux-study-selector',selectInput('ux_study_dataset','Experiment',
        c('LPS · bone tissues · 64 samples'='lps_bones','Bone neutrophils · 16 samples'='neutrophils'))),
    uiOutput('ux_study_metrics'),
    div(class='ux-panel',uiOutput('ux_study_plot')),
    div(class='ux-panel',h3('Preparation scenarios'),DT::DTOutput('ux_study_table')),
    div(class='ux-method-note',h4('Read the comparison'),p('Procrustes similarity is 1 for identical two-dimensional geometry after alignment. Lower values mean a larger change. It is not a biological significance test. The global 80% filter is deliberately strict and can remove tissue-specific lipids; compare it with the group-wise alternative.'),
        p('All runs use the original class PCA: sums of normalized linear abundances, NIPALS, individual samples. The same baseline variance was reproduced before changing any setting.'),
        tags$a(href='https://www.nature.com/articles/s41598-017-19120-0',target='_blank',rel='noopener','Method reference: Wei et al., 2018')))
}

# Preserve the scenario identifiers carried by the saved study. Row order has
# no scientific meaning and must never be used to assign labels.
ux_comparison_table_data <- function(d) {
  required <- c('scenario','retained','excluded','missing_pct','PC1','PC2','procrustes_r')
  stopifnot(is.data.frame(d),all(required %in% names(d)))
  out <- d[,required,drop=FALSE]
  names(out) <- c('Scenario','Retained','Excluded','Missing (%)','PC1 (%)','PC2 (%)','PCA similarity')
  out
}

ux_comparison_server <- function(input,output,session) {
  if (!ux_comparison_available()) return(invisible(FALSE))
  study <- tryCatch(read.csv('www/study/comparison.csv',check.names=FALSE),
    error=function(e) NULL)
  required <- c('dataset','scenario','retained','excluded','missing_pct',
    'PC1','PC2','procrustes_r')
  if (is.null(study) || !all(required %in% names(study))) {
    output$ux_study_metrics <- renderUI(p('Saved comparison data could not be read.'))
    return(invisible(FALSE))
  }
  chosen <- reactive({
    req(input$ux_study_dataset %in% c('lps_bones','neutrophils'))
    study[study$dataset==input$ux_study_dataset,,drop=FALSE]
  })
  output$ux_study_metrics <- renderUI({
    d<-chosen(); b<-d[d$scenario=='baseline',]; f<-d[d$scenario=='global80_qrilc',]
    card <- function(label,value,note) div(class='ux-metric',span(class='ux-eyebrow',label),strong(value),p(note))
    div(class='ux-metrics',card('LIPIDS RETAINED',format(f$retained,big.mark=','),sprintf('From %s in the original run',format(b$retained,big.mark=','))),
      card('MISSING BEFORE IMPUTATION',sprintf('%.1f%%',f$missing_pct),sprintf('Original: %.1f%%',b$missing_pct)),
      card('PCA SIMILARITY',sprintf('%.3f',f$procrustes_r),'Original vs. global 80% + QRILC'))
  })
  output$ux_study_plot <- renderUI({req(input$ux_study_dataset %in% c('lps_bones','neutrophils'));tags$img(class='ux-study-image',src=paste0('study/',input$ux_study_dataset,'-comparison.png'),alt='Four PCA plots comparing original, removal of absent lipids, global detection filter and alternative imputation.')})
  output$ux_study_table <- DT::renderDT({
    d <- ux_comparison_table_data(chosen())
    DT::datatable(d,rownames=FALSE,options=list(dom='t',scrollX=TRUE,pageLength=10)) %>% DT::formatRound(c('Missing (%)','PCA similarity'),3)
  })
}
