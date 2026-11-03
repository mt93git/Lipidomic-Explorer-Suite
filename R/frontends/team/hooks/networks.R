# Team implementation of inference_allowed(allowed, session, shared_data, scope)
# (R/modules/8_structural_module.R networkData/networkPlot, scope "structural";
# R/modules/10_fla_module.R correlation_data/circos_plot_logic/plotCircos, scope
# "fla"). Ported from production's inferential_network_adapter.R: fail closed in
# Team when independent-sample inference is unavailable, so correlation p-values
# never silently use the count of repeated observations as independent sample
# size. The modules show production's empty-plot messages when this is FALSE.
team_network_inference_allowed <- function(allowed, session, shared_data, scope = NULL, ...) {
  isTRUE(allowed) && guided_local_inference_allowed(session, shared_data)
}
lipidomic_hook_register("inference_allowed", team_network_inference_allowed)
