suppressPackageStartupMessages({library(shiny);library(ggplot2);library(dplyr)})
source('R/utils_vis.R')
for (case in c('regular','outlier','floor')) {
 x<-switch(case,regular=c(0,0,0,1,2,3,3,4,4,4,5,6),outlier=c(1:11,1000),floor=c(rep(.001,8),1,2,3,4))
 d<-data.frame(Feature='PC test',GroupingVal=factor(rep(c('A','B'),each=12)),Plot_Value=c(x,x+1),Significance='ns',P_Value=1)
 p<-plot_logratio_violin(d,'PC test',c('A'),c(A='#b7b7b7',B='#6e9ac2'))
 b<-ggplot_build(p);v<-b$data[[1]]
 for(panel in unique(v$PANEL)){r<-b$layout$panel_params[[as.integer(panel)]]$y.range;ys<-v$y[v$PANEL==panel];stopifnot(min(ys)>min(r),max(ys)<max(r))}
 stopifnot(identical(p$data$Plot_Value,d$Plot_Value))
 cat('PASS static shared violin',case,': density geometry inside panel, input values unchanged\n')
}
