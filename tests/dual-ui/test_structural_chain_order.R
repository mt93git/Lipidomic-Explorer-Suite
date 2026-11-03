source('R/modules/8_structural_module.R')
chains <- c('Other','18:1','Unknown','d18:1','16:0','O-18:0','P-16:1','t18:2','m18:0','bad:chain','18:1','18:bad')
warnings <- character()
result <- withCallingHandlers(structural_order_acyl_chains(chains),warning=function(w){warnings <<- c(warnings,conditionMessage(w));invokeRestart('muffleWarning')})
stopifnot(!length(warnings),identical(result,c('16:0','P-16:1','O-18:0','m18:0','18:1','d18:1','t18:2','Unknown','bad:chain','18:bad','Other')),
  setequal(result,unique(chains)),identical(structural_order_acyl_chains(c('18:1','16:0','18:0','16:1')),c('16:0','16:1','18:0','18:1')),
  identical(structural_order_acyl_chains(character()),character()),identical(structural_order_acyl_chains('Other'),'Other'))
# Factor conversion used by the plot retains every original, non-missing category.
stopifnot(!anyNA(factor(chains,levels=result)))
cat('PASS: structural chain labels preserved and ordered without coercion warnings\n')
