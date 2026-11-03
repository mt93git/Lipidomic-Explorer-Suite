# Class totals (cell_class_plot): the legend must not sit in paper coordinates under the plot,
# where it covered the x-axis title at every card size, and the y axis names the classes.
src <- paste(readLines('R/frontends/team/cell_show.R', warn=FALSE), collapse='\n')
m <- regmatches(src, regexpr('output\\$cell_class_plot<-[^\n]*', src))
stopifnot(length(m) == 1L,
  !grepl('orientation="h",y=-', m, fixed=TRUE),
  grepl('yaxis=list(title="Lipid class"', m, fixed=TRUE),
  !grepl('Click a class to explore', m, fixed=TRUE),
  grepl('Click to explore this class', m, fixed=TRUE),
  grepl('event_register("plotly_click")', m, fixed=TRUE))
cat('PASS class totals legend clears the x title; y axis names the lipid classes; click hint in hover\n')
