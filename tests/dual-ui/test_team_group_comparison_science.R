suppressPackageStartupMessages({library(shiny);library(dplyr);library(tidyr)})
`%||%` <- function(a,b) if(is.null(a))b else a
source('R/core/hooks.R');source('R/modules/9_logratio_module.R');source('R/frontends/team/hooks/group_comparison.R');source('R/frontends/team/group_comparison.R')
original <- logratio_server
# The module function inside moduleServer() (B: after the logratio_shared_data hook line).
module_call <- Filter(function(x) is.call(x) && identical(x[[1]], as.name('moduleServer')), as.list(body(original)))[[1]]
module_body <- module_call[[3]][[3]]
find_assignment <- function(n) Filter(function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(n)),as.list(module_body))[[1]]
input <- list(selectedBaseline='A',scaleMode='log2fc',groupingMetadata='Group1',comparisonStrategy='Global (Combined Reference)',localStatMethod='parametric',classLabelFormat='short')
mat <- data.frame(Lipid_Name=c('a','b','c'),S1=c(10,30,50),S2=c(12,25,70),S3=c(14,40,30),S4=c(20,20,40),S5=c(25,32,22),S6=c(30,25,15),check.names=FALSE)
meta <- data.frame(FullName=names(mat)[-1],Group1=rep(c('A','B'),each=3))
val <- function(x){force(x);function(...)x}
shared_data <- list(data_processed=val(mat),annotationData=val(data.frame(Lipid_Name=c('a','b','c'),subclass=c('PC','PE','TG'))),all_metadata=val(meta),analysisMode=val('Global Lipidomics'),actual_de_method=val('limma'))
REVERSE_HYPERCLASS_MAP <- list(PC='GP',PE='GP',TG='GL');get_short_class_name <- identity;get_full_class_name <- identity
level_prefs <- list();session <- NULL
guided_local_p_value <- function(reference,comparison,method,session,shared_data,paired=FALSE) if(method=='non_parametric') wilcox.test(reference,comparison,exact=FALSE)$p.value else t.test(reference,comparison,var.equal=TRUE)$p.value
eval(find_assignment('build_db_for_level'))
result <- build_db_for_level('subclass','none');d <- result$plot_db
stopifnot(setequal(d$Feature,c('PC','PE','TG')),all(c('Plot_Value','P_Value','Significance','Is_Baseline') %in% names(d)))
for(f in unique(d$Feature)) {x<-d$Plot_Value[d$Feature==f & d$GroupingVal=='A'];y<-d$Plot_Value[d$Feature==f & d$GroupingVal=='B'];stopifnot(isTRUE(all.equal(unique(d$P_Value[d$Feature==f & d$GroupingVal=='B']),t.test(x,y,var.equal=TRUE)$p.value)))}
input$localStatMethod <- 'non_parametric';w <- build_db_for_level('subclass','none')$plot_db
for(f in unique(w$Feature)){x<-w$Plot_Value[w$Feature==f & w$GroupingVal=='A'];y<-w$Plot_Value[w$Feature==f & w$GroupingVal=='B'];stopifnot(isTRUE(all.equal(unique(w$P_Value[w$Feature==f & w$GroupingVal=='B']),wilcox.test(x,y,exact=FALSE)$p.value)))}
cat('PASS real logratio transformation on fixture: every class; Student and Wilcoxon p-values match base R; unchanged by presentation.\n')
# Global measurement scales remain the original module's transformations.
input$localStatMethod <- 'parametric'
for (mode in c('fc','delta')) {
  input$scaleMode <- mode
  frame <- build_db_for_level('subclass','none')$plot_db
  expected <- if(mode=='fc') frame$Proportion/frame$Baseline_Mean_Prop else frame$Proportion-frame$Baseline_Mean_Prop
  stopifnot(isTRUE(all.equal(frame$Plot_Value,expected,tolerance=1e-12)))
}
# Faceted references are selected on X_Grp within each Facet_Grp, not by
# confusing the baseline label with the combined legend label.
mat <- data.frame(Lipid_Name=c('a','b','c'),S1=c(10,30,50),S2=c(12,25,70),S3=c(20,20,40),S4=c(25,32,22),S5=c(15,30,40),S6=c(13,26,65),S7=c(24,22,38),S8=c(28,30,25),check.names=FALSE)
meta <- data.frame(FullName=names(mat)[-1],Group1=rep(c('F1','F2'),each=4),Group2=rep(rep(c('A','B'),each=2),2))
shared_data$data_processed <- val(mat);shared_data$all_metadata <- val(meta)
input$groupingMetadata <- c('Group1','Group2');input$comparisonStrategy <- 'Faceted (Intra-group Reference)';input$selectedBaseline <- 'A';input$scaleMode <- 'log2fc'
facet <- build_db_for_level('subclass','none')$plot_db
for(f in unique(facet$Feature))for(group in unique(facet$Facet_Grp)) {
  subset <- facet[facet$Feature==f & facet$Facet_Grp==group,];x<-subset$Plot_Value[subset$X_Grp=='A'];y<-subset$Plot_Value[subset$X_Grp=='B'];
  stopifnot(all(subset$Is_Baseline == (subset$X_Grp=='A')),isTRUE(all.equal(unique(subset$P_Value[subset$X_Grp=='B']),t.test(x,y,var.equal=TRUE)$p.value)))
}
cat('PASS fold change, proportion difference and faceted reference tests on same pipeline.\n')
