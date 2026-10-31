# Production annotation reference regression.
# This is an independent semantic oracle: a sphingolipid with two chains must
# retain both the sphingoid-base and N-acyl double bonds.
find_assignment <- function(node, target) {
  if (!is.call(node) && !is.expression(node) && !is.pairlist(node)) return(NULL)
  if (is.call(node) && identical(node[[1]], as.name('<-')) && identical(node[[2]], as.name(target))) return(node)
  for (i in seq_along(node)) {
    found <- tryCatch(find_assignment(node[[i]], target), error = function(e) NULL)
    if (!is.null(found)) return(found)
  }
  NULL
}
load_production_parser <- function() {
  env <- new.env(parent = globalenv())
  ast <- parse('R/global.R')
  for (name in c('class_map','HYPERCLASS_MAP','REVERSE_HYPERCLASS_MAP',
                 'classify_chain','clean_lipid_name','parse_lipid_names_bulk')) {
    assignment <- find_assignment(ast, name)
    stopifnot(!is.null(assignment))
    eval(assignment, env)
  }
  env
}
parser <- load_production_parser()
parsed <- parser$parse_lipid_names_bulk(c('Cer(d18:1/18:1)+H', 'PC(16:0/18:1)'))
cer <- parsed[parsed$Lipid_Name == 'Cer(d18:1/18:1)+H', , drop = FALSE]
stopifnot(nrow(cer) == 1L, identical(cer$subclass[[1]], 'SP_Cer'),
          isTRUE(all.equal(as.numeric(cer$Total_DB[[1]]), 2)))
pc <- parsed[parsed$Lipid_Name == 'PC(16:0/18:1)', , drop = FALSE]
stopifnot(nrow(pc) == 1L, identical(pc$subclass[[1]], 'GP_PC'),
          isTRUE(all.equal(as.numeric(pc$Total_DB[[1]]), 1)))
cat('PASS: production parser preserves Cer(d18:1/18:1) as SP_Cer with Total_DB=2\n')

# Validate the actual explicit design reader, including reordered IDs and invalid designs.
e <- new.env(parent=globalenv())
eval(find_assignment(parse('pipeline_math_proof_stacked.R'),'read_reference_metadata'),e)
f <- tempfile(fileext='.csv')
md <- data.frame(FullName=c('01','02','03','04'),Group1=c('Control','Control','Treatment','Treatment'))
write.csv(md,f,row.names=FALSE)
stopifnot(identical(e$read_reference_metadata(rev(md$FullName),f)$FullName,rev(md$FullName)))
for (bad in list(transform(md,FullName=c('01','01','03','04')),transform(md,Group1=c('','Control','','Control')),md[-1,],rbind(md,md[1,]))) {
 write.csv(bad,f,row.names=FALSE)
 stopifnot(inherits(try(e$read_reference_metadata(md$FullName,f),silent=TRUE),'try-error'))
}
unlink(f)
cat('PASS: explicit reference metadata validates IDs, order and complete design without filename inference\n')
