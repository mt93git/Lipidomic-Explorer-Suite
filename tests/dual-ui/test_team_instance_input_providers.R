# A copy computes the renderUI outputs that create the controls its plot reads.
# Longitudinal plots req() a selector built by a renderUI in a hidden tab of the
# off-screen copy; without it the copy waited forever.
# Run with: Rscript --vanilla tests/dual-ui/test_team_instance_input_providers.R
suppressMessages(source('R/frontends/team/plot_instances.R'))
expect <- c('longitudinal_tab-macroclass_plot'='macroclass_selector_ui','longitudinal_tab-subclass_plot'='subclass_selector_ui',
            'longitudinal_tab-index_plot'='index_selector_ui','longitudinal_tab-struct_plot'='struct_selector_ui')
for (s in names(expect)) {
  got <- team_plot_instance_input_providers(s)
  if (!expect[[s]] %in% got) stop(s,' does not compute ',expect[[s]],' (got: ',paste(got,collapse=','),')')
}
# The plot's own output is never listed; a plot that reads no renderUI-built control lists none.
if (length(team_plot_instance_input_providers('volcano_tab-volcanoPlot'))) stop('volcano lists providers')
# create() and park() use the providers next to the layout wrappers.
src <- paste(readLines('R/frontends/team/plot_instances.R'),collapse='\n')
if (lengths(regmatches(src,gregexpr('team_plot_instance_input_providers\\((value|entry)\\$source\\)',src)))<2L) stop('create/park do not use the providers')
cat('PASS copies compute the renderUI outputs that build the controls their plot reads (longitudinal selectors)\n')
