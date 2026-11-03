# Exercise the exact Team design policy and local test helper, without changing it.
`%||%` <- function(a,b) if(is.null(a))b else a
source('R/modules/utils_stats.R')
expr <- parse('R/frontends/team/guided_workflow.R')
for(n in c('guide_design_issues','guide_valid_design','guide_allows_inference')) {
  match <- Filter(function(x)is.call(x)&&identical(x[[1]],as.name('<-'))&&identical(x[[2]],as.name(n)),as.list(expr))
  stopifnot(length(match)==1L);eval(match[[1]])
}
x<-c(1,2,3,4);y<-c(2,4,5,7)
hub<-list(inference_allowed=function(paired=FALSE)guide_allows_inference(TRUE,'Donor','paired',character(),paired))
stopifnot(!hub$inference_allowed(FALSE),hub$inference_allowed(TRUE),is.na(guided_local_p_value(x,y,'non_parametric',NULL,hub,FALSE)))
hub$inference_allowed<-function(paired=FALSE)guide_allows_inference(TRUE,'Donor','independent',character(),paired)
stopifnot(hub$inference_allowed(FALSE),isTRUE(all.equal(guided_local_p_value(x,y,'non_parametric',NULL,hub,FALSE),wilcox.test(x,y,exact=FALSE)$p.value)))
hub$inference_allowed<-function(paired=FALSE)guide_allows_inference(FALSE,'Donor','independent',character(),paired)
stopifnot(is.na(guided_local_p_value(x,y,'non_parametric',NULL,hub,FALSE)))
hub$inference_allowed<-function(paired=FALSE)guide_allows_inference(TRUE,'Donor','independent','synthetic',paired)
stopifnot(is.na(guided_local_p_value(x,y,'non_parametric',NULL,hub,FALSE)))
cat('PASS production policy: paired or unconfirmed or synthetic blocks unpaired p; independently confirmed allows exact legacy Wilcoxon. No design authorization was changed.\n')
