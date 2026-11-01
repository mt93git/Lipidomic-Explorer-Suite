# Private prepared Paula hub: compare legacy and Team adapter computations using
# identical explicit settings. Only aggregate parity metrics are written.
source('R/global.R');source('R/modules/9_logratio_module.R');source(Sys.getenv('GROUP_COMPARISON_ADAPTER', 'R/frontends/team/group_comparison.R'))
p <- Sys.getenv('PRIVATE_HUB_RDS');out <- Sys.getenv('GROUP_COMPARISON_QA_CSV');stopifnot(nzchar(p),nzchar(out))
hub <- readRDS(p)$team
stopifnot(ncol(hub$matrix)>2L,is.data.frame(hub$metadata),is.data.frame(hub$annotation))
value<-function(x){force(x);function(...)x}
# The seed contains no global DE. This controlled diagnostic permits local
# unpaired tests; it is not a claim of study-design authorization or diagnosis.
h <- list(data_processed=value(hub$matrix),annotationData=value(hub$annotation),all_metadata=value(hub$metadata),analysisMode=value('Global Lipidomics'),actual_de_method=value('limma'),inference_allowed=function(paired=FALSE)!paired)
find_assignment <- function(f,name) {inner<-body(f)[[2]][[3]][[3]];matches<-Filter(function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(name)),as.list(inner));stopifnot(length(matches)==1L);matches[[1]]}
legacy <- logratio_server; adapted <- team_group_comparison_adapter(legacy)
groups <- sort(unique(as.character(stats::na.omit(hub$metadata$Group1))));groups<-groups[nzchar(groups)];stopifnot(length(groups)>=2L)
families <- team_group_comparison_families(hub$annotation,'subclass','full',REVERSE_HYPERCLASS_MAP,get_full_class_name,get_short_class_name)
stopifnot(length(families)>0L, all(unlist(families,use.names=FALSE) %in% c('Glycerophospholipids','Sphingolipids','Glycerolipids','Sterol Lipids','Fatty Acyls')))
cat('PASS actual annotation family mapping:',length(families),'mapped labels\n')
summary <- list()
for(method in c('parametric','non_parametric'))for(scale in c('log2fc','fc','delta')) {
  input <- list(selectedBaseline=groups[1],scaleMode=scale,groupingMetadata='Group1',comparisonStrategy='Global (Combined Reference)',localStatMethod=method,classLabelFormat='full')
  run <- function(fn){e<-new.env(parent=globalenv());e$input<-input;e$shared_data<-h;e$level_prefs<-list();e$session<-NULL;eval(find_assignment(fn,'build_db_for_level'),e);shiny::isolate(e$build_db_for_level('subclass','none'))}
  a<-run(legacy);b<-run(adapted);stopifnot(identical(a,b));da<-a$plot_db;db<-b$plot_db
  numerical<-c('Plot_Value','P_Value');errors<-vapply(numerical,function(k){x<-da[[k]];y<-db[[k]];valid<-is.finite(x)&is.finite(y);if(any(valid))max(abs(x[valid]-y[valid]))else 0},numeric(1))
  stopifnot(all(errors==0),identical(is.na(da$P_Value),is.na(db$P_Value)))
  reference_errors <- numeric()
  for(feature in unique(da$Feature))for(group in setdiff(as.character(unique(da$GroupingVal)),groups[1])) {
    subset <- da[da$Feature==feature,,drop=FALSE]
    x <- subset$Plot_Value[subset$GroupingVal==groups[1]];y <- subset$Plot_Value[subset$GroupingVal==group]
    observed <- unique(subset$P_Value[subset$GroupingVal==group]);observed <- observed[is.finite(observed)]
    if(!length(observed))next
    expected <- if(method=='parametric') stats::t.test(x,y,var.equal=TRUE)$p.value else stats::wilcox.test(x,y,exact=FALSE)$p.value
    reference_errors <- c(reference_errors,abs(observed[1]-expected))
  }
  reference_error <- if(length(reference_errors))max(reference_errors) else NA_real_
  stopifnot(is.finite(reference_error),reference_error < 1e-12)
  summary[[length(summary)+1L]]<-data.frame(test=if(method=='parametric')'Student equal variance' else 'Wilcoxon rank-sum',adjustment='none',scale=scale,n_samples=length(unique(da$Sample)),n_classes=length(unique(da$Feature)),n_groups=length(unique(da$GroupingVal)),n_rows_with_finite_p=sum(is.finite(da$P_Value)),n_tested_comparisons=length(reference_errors),max_abs_value_error=errors[1],max_abs_p_error=errors[2],max_abs_base_r_p_error=reference_error,row.names=NULL)
}
write.csv(do.call(rbind,summary),out,row.names=FALSE)
counts<-table(hub$metadata$Group1);cat('Group sample counts:',paste(names(counts),as.integer(counts),sep='=',collapse=', '),'\n')
cat('PASS actual Paula prepared data: exact legacy/Team processed_db equality; Student and Wilcoxon, three scales, unadjusted; aggregate CSV written.\n')
# Reproduce the saved paired design policy conservatively: even if the review
# were confirmed and there were no synthetic IDs, the current local tests are
# unpaired and the Team gate rejects them. This is an isolated calculation; it
# does not read or alter the live session's approval state.
guided_expr <- parse('R/guided_workflow.R')
for(n in c('guide_design_issues','guide_valid_design','guide_allows_inference')) {matches<-Filter(function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(n)),as.list(guided_expr));stopifnot(length(matches)==1L);eval(matches[[1]])}
h$inference_allowed <- function(paired=FALSE) guide_allows_inference(TRUE,'Donor','paired',character(),paired)
stopifnot(!h$inference_allowed(FALSE))
blocked <- run(adapted)$plot_db
stopifnot(nrow(blocked)>0L,all(is.na(blocked$P_Value)))
cat('PASS actual Paula data with controlled saved-paired policy: all local unpaired p-values unavailable; no live design or authorization changed.\n')
