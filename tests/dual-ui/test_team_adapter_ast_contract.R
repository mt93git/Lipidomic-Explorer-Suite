# No runtime, package installation or private data: strict future-AST contracts.
source('R/frontends/team/inferential_network_adapter.R')
source('R/frontends/team/qc_3d_labels_adapter.R')
rejects<-function(expr)stopifnot(inherits(try(expr,silent=TRUE),'try-error'))
network<-function(){networkData<-reactive({NULL});output$networkPlot<-renderPlot({NULL})}
fla<-function(){correlation_data<-reactive({NULL});circos_plot_logic<-reactive({NULL});output$plotCircos<-renderPlot({NULL})}
qc<-function(){buildPCA3D_plotly<-reactive({plot_ly(textfont=list(color='#000000',size=12))});buildLoad3D_plotly<-reactive({plot_ly(textfont=list(color='#000000',size=12))})}
replace_call<-function(fn,target,replacement){walk<-function(x){if(identical(x,target))return(replacement);if(is.recursive(x))for(i in seq_along(x))if(!is.null(x[[i]]))x[[i]]<-walk(x[[i]]);x};body(fn)<-walk(body(fn));fn}
# Named height before the true expression must never become the guarded body.
mutant<-replace_call(network,quote(renderPlot({NULL})),quote(renderPlot(height={400},expr={NULL})))
rejects(team_inferential_network_adapter(mutant,'structural'))
mutant<-replace_call(network,quote(reactive({NULL})),quote(reactive(height={400},expr={NULL})))
rejects(team_inferential_network_adapter(mutant,'structural'))
mutant<-replace_call(fla,quote(reactive({NULL})),quote(reactive(123)))
rejects(team_inferential_network_adapter(mutant,'fla'))
# Explicit expr= in the first position is supported.
valid<-replace_call(network,quote(renderPlot({NULL})),quote(renderPlot(expr={NULL},height=400)))
stopifnot(is.function(team_inferential_network_adapter(valid,'structural')))
mutant<-replace_call(qc,quote(reactive({plot_ly(textfont=list(color='#000000',size=12))})),quote(reactive(height={400},expr={plot_ly(textfont=list(color='#000000',size=12))})))
rejects(team_qc_3d_labels_adapter(mutant))
mutant<-replace_call(qc,quote(plot_ly(textfont=list(color='#000000',size=12))),quote({plot_ly(textfont=list(color='#000000',size=12));add_trace(textfont=list(color='#000000',size=12))}))
rejects(team_qc_3d_labels_adapter(mutant))
mutant<-replace_call(qc,quote(plot_ly(textfont=list(color='#000000',size=12))),quote(plot_ly(data=add_trace(textfont=list(color='#000000',size=12)),textfont=list(color='#000000',size=12))))
rejects(team_qc_3d_labels_adapter(mutant))
# Verify unchanged original bodies and real checked-in definitions still match.
e<-new.env(parent=globalenv());for(file in c('R/modules/2_qc_boxplot_module.R','R/modules/8_structural_module.R','R/modules/10_fla_module.R'))sys.source(file,e)
for(pair in list(list(e$structural_server,'structural'),list(e$fla_server,'fla'))){old<-serialize(body(pair[[1]]),NULL);adapted<-team_inferential_network_adapter(pair[[1]],pair[[2]]);stopifnot(identical(old,serialize(body(pair[[1]]),NULL)),length(deparse(body(adapted)))>0)}
old<-serialize(body(e$qc_boxplot_server),NULL);adapted<-team_qc_3d_labels_adapter(e$qc_boxplot_server);stopifnot(identical(old,serialize(body(e$qc_boxplot_server),NULL)))
cat('PASS: named-height/non-expression/extra-textfont drift rejected; first expr= accepted; actual current module structures match; Classic bodies unchanged\n')
