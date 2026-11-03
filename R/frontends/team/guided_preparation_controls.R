guided_preparation_controls <- function(id) {
  ns <- NS(id)
  tagList(
    h3('1. Keep sufficiently detected lipids'),
    checkboxInput(ns('dropNonDetected'),'Exclude entirely undetected lipids before imputation',TRUE),
    sliderInput(ns('minDetectionPct'),'Minimum detection (%)',min=0,max=100,value=0,step=5),
    selectInput(ns('detectionScope'),'Where must a lipid be detected?',c('Across selected samples'='global','In at least one condition × tissue group'='group')),
    uiOutput(ns('detectionPreview')),
    helpText('Only positive measured values count as detected. At 0%, the separate “Exclude entirely undetected lipids” option still removes lipids absent from every selected sample. A global threshold may remove tissue-specific signals.'),
    h3('2. Handle missing measurements'),
    checkboxInput(ns('useImputation'),'Estimate missing values with QRILC',TRUE),
    helpText('QRILC assumes left-censored missingness. If that assumption is unsupported, review an alternative with your analyst. Turning imputation off retains missing values; some analysis tools require complete data.'),
    numericInput(ns('imputationSeed'),'Imputation seed',42,min=0,max=2147483647,step=1),
    h3('3. Make samples comparable'),
    selectInput(ns('normalizationMethod'),'Normalization method',c('Median (log scale)'='median','PQN (linear scale)'='pqn','None'='none'),selected='median'),
    helpText('Changing preparation keeps the previous result visible until you run again.')
  )
}

guided_advanced_controls <- function(id) {
  ns <- NS(id)
  tags$details(tags$summary('Advanced preparation and PCA options'),
      checkboxInput(ns('imputeZerosPerFile'),'For each file, set entirely missing lipids to zero',TRUE),
      checkboxInput(ns('imputeRemainingNAtoZero'),'Replace remaining missing values with zero',FALSE),
      checkboxInput(ns('dropMisc'),"Drop unclassified 'Misc' lipids",TRUE),
      radioButtons(ns('pcaMode'),'PCA analysis level',choices=c('Individual lipids'='omics','Aggregated classes'='class'),selected='class'),
      conditionalPanel("input.pcaMode == 'omics'",ns=ns,p('Individual-lipid PCA may take longer. Loading labels are initially disabled for readability.')),
      numericInput(ns('maxPCs'),'Maximum principal components',3,min=2,step=1))
}
