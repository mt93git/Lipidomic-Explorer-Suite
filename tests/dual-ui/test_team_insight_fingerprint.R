`%||%`<-function(x,y)if(is.null(x)||!length(x))y else x
source('R/frontends/team/scientific_insight_context.R');source('R/frontends/team/scientific_insight.R')
mat<-data.frame(Lipid=c('PC(34:1)','PE(36:2)'),S1=c(1,2),S2=c(NA_real_,0.1))
metadata<-data.frame(Sample=c('S1','S2'),Group=c('A','B'))
ctx<-function(data=mat,revision=1)team_insight_context('results_dashboard-plot_violin',list(),list(data_processed=data,preparation_revision=revision,restore_generation=revision,preparation_state=list(revision=revision)),list(violin_data=data.frame(Lipid='PC(34:1)',Log10_abundance=c(1,2))))
key<-team_insight_persisted_fingerprint(ctx(),metadata)
stopifnot(identical(key,team_insight_persisted_fingerprint(ctx(revision=999),metadata)))
changed<-mat;changed$S1[1]<-2
stopifnot(!identical(key,team_insight_persisted_fingerprint(ctx(changed),metadata)))
changedmeta<-metadata;changedmeta$Group[1]<-'B'
stopifnot(!identical(key,team_insight_persisted_fingerprint(ctx(),changedmeta)))
attr(mat,'presentation_title')<-'Cosmetic title'
stopifnot(identical(key,team_insight_persisted_fingerprint(ctx(),metadata)))
fixture<-tempfile(fileext='.rds');script<-tempfile(fileext='.R');
saveRDS(list(matrix=mat,metadata=metadata),fixture)
writeLines(c('args<-commandArgs(TRUE);setwd(args[1]);`%||%`<-function(x,y)if(is.null(x)||!length(x))y else x',"source('R/frontends/team/scientific_insight_context.R');source('R/frontends/team/scientific_insight.R')",'x<-readRDS(args[2]);ctx<-team_insight_context("results_dashboard-plot_violin",list(),list(data_processed=x$matrix,preparation_revision=7,restore_generation=7,preparation_state=list(revision=7)),list(violin_data=data.frame(Lipid="PC(34:1)",Log10_abundance=c(1,2))))','cat(team_insight_persisted_fingerprint(ctx,x$metadata))'),script)
other<-system2(file.path(R.home('bin'),'Rscript'),c('--vanilla',shQuote(script),shQuote(getwd()),shQuote(fixture)),stdout=TRUE)
unlink(c(fixture,script));stopifnot(identical(key,paste(other,collapse='')))
cat('PASS stable fingerprint after independent R checkpoint process, volatile revision/cosmetic title ignored, actual value/group changes rejected\n')
