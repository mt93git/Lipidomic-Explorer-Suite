source('R/frontends/team/group_comparison.R')
source('R/modules/9_logratio_module.R')
original_body <- body(logratio_server)
adapted <- team_group_comparison_adapter(logratio_server)
stopifnot(identical(body(logratio_server), original_body))
inner_original <- original_body[[2]][[3]][[3]]
inner_adapted <- body(adapted)[[2]][[3]][[3]]
stopifnot(length(inner_adapted) == length(inner_original) + 1L,
          identical(as.list(inner_adapted)[seq_along(as.list(inner_original))], as.list(inner_original)))
failed <- tryCatch({team_group_comparison_adapter(function() NULL); FALSE}, error = function(e) TRUE)
stopifnot(failed)
cat('Team adapter preserves original module and fails closed on shape mismatch.\n')
# Production's reverse class map is a list, not a named atomic vector.
map <- list(GP_PC='GP',SP_SM='SP')
anno <- data.frame(subclass=c('GP_PC','SP_SM','unmapped'))
classes <- team_group_comparison_families(anno,'subclass','full',map,identity,identity)
stopifnot(identical(classes,list(GP_PC='Glycerophospholipids',SP_SM='Sphingolipids')),
          identical(team_group_comparison_families(anno,'macro','full',map,identity,identity),list()))
cat('Team family map handles actual list structure and unknown subclasses.\n')
settings <- list(baseline='Healthy',grouping=c('Group1','Group2'),comparison='Global (Combined Reference)')
token <- team_group_comparison_confirmation_token(settings)
stopifnot(is.character(token),nchar(token)==64L,
          identical(team_group_comparison_confirmation_token(settings),token),
          !identical(team_group_comparison_confirmation_token(modifyList(settings,list(baseline='Other'))),token),
          !identical(team_group_comparison_confirmation_token(modifyList(settings,list(comparison='Faceted (Intra-group Reference)'))),token),
          is.null(team_group_comparison_confirmation_token(modifyList(settings,list(baseline=c('A','B'))))),
          identical(team_group_comparison_palette_context(settings$grouping,settings$comparison),'Group1 & Group2'),
          identical(team_group_comparison_palette_context(settings$grouping,'Faceted (Intra-group Reference)'),'Group2'),
          identical(team_group_comparison_palette_context('Group1',settings$comparison),'Group1'))
cat('Explicit baseline token and combined/faceted palette contexts PASS.\n')
