# Run from repository root: Rscript --vanilla tools/reference_contract/compare.R OUTPUT_DIR
source('tools/reference_contract/helpers.R')
args <- commandArgs(TRUE); stopifnot(length(args)==1L)
out <- args[1]; dir.create(out,recursive=TRUE,showWarnings=FALSE)
protected <- normalizePath('docs/proof_artifacts'); dest <- normalizePath(out)
if (dest==protected || startsWith(dest,paste0(protected,'/'))) stop('Never overwrite committed reference artifacts.')
for(p in c('readxl','imputeLCMD','limma','statmod','digest')) if(!requireNamespace(p,quietly=TRUE)) stop('Required dependency: ',p)
stopifnot(file.exists('demo_data/demo_global_lipidomics.xlsx'))
proof <- new.env(parent=globalenv())
for(node in parse('pipeline_math_proof_stacked.R')) {
  if(is.call(node) && identical(node[[1]],as.name('<-')) && is.call(node[[3]]) && identical(node[[3]][[1]],as.name('function'))) eval(node,proof)
}
manifest <- read.csv('tools/reference_contract/guided-source-manifest.csv')
snapshot <- parse('tools/reference_contract/guided_snapshot.R')
for(i in seq_len(nrow(manifest))) {
  actual <- digest::digest(paste(deparse(find_assignment(snapshot,manifest$function_name[i]),width.cutoff=100L),collapse='\n'),algo='sha256',serialize=FALSE)
  stopifnot(identical(actual,manifest$function_sha256[i]))
}
warnings_seen <- character()
withCallingHandlers(proof$execute_audit_proof(output_dir=file.path(out,'regenerated')),warning=function(w) {
  warnings_seen <<- c(warnings_seen,conditionMessage(w)); invokeRestart('muffleWarning')
})
writeLines(warnings_seen,file.path(out,'proof-warnings.txt'))
excel <- readxl::read_excel('demo_data/demo_global_lipidomics.xlsx',sheet=1)
coercions <- lapply(names(excel)[-1],function(n) { z<-excel[[n]]; bad<-!is.na(z)&is.na(suppressWarnings(as.numeric(z))); data.frame(Sample=rep(n,sum(bad)),Lipid_Name=excel[[1]][bad],original_value=as.character(z[bad])) })
write.csv(do.call(rbind,coercions),file.path(out,'raw-text-to-missing.csv'),row.names=FALSE)
rows <- list()
compare <- function(a,b,label,required=TRUE) {
  structure_ok <- identical(dim(a),dim(b)) && identical(dimnames(a),dimnames(b))
  masks_ok <- structure_ok && identical(is.na(a),is.na(b)) && identical(is.infinite(a),is.infinite(b))
  finite <- if(structure_ok) is.finite(a)&is.finite(b) else FALSE
  delta <- if(any(finite)) max(abs(a[finite]-b[finite])) else NA_real_
  scaled <- if(any(finite)) max(abs(a[finite]-b[finite])/pmax(1,abs(a[finite]),abs(b[finite]))) else NA_real_
  pass <- masks_ok && (!any(finite) || scaled <= 1e-10) && isTRUE(all.equal(a,b,tolerance=1e-10,check.attributes=TRUE))
  rows[[length(rows)+1L]] <<- data.frame(check=label,structure_ok,masks_ok,max_absolute_difference=delta,max_scaled_difference=scaled,status=if(pass)'MATCH' else 'DIFFERENCE',required)
  if(required && !pass) stop('Unexpected numerical mismatch: ',label)
  invisible(pass)
}
read_artifact <- function(path) {
  z <- read.csv(path,check.names=FALSE,stringsAsFactors=FALSE)
  ids <- z[[1]]; z <- z[-1]; stopifnot(!anyDuplicated(ids),all(vapply(z,is.numeric,logical(1))))
  m <- as.matrix(z); rownames(m)<-ids;m
}
for(file in list.files('docs/proof_artifacts',pattern='\\.csv$')) {
  compare(read_artifact(file.path('docs/proof_artifacts',file)),read_artifact(file.path(out,'regenerated',file)),paste0('committed_reference/',file))
}
raw <- read_artifact(file.path(out,'regenerated/raw_abundance_before.csv'))
# Reproduce the proof fixture grouping explicitly. This is NOT a validated study design.
groups <- ifelse(grepl('WT|Vehicle|Control|Ctrl',colnames(raw),ignore.case=TRUE),'Control','Treated')
stopifnot(length(unique(groups))==2L)
meta <- data.frame(FullName=colnames(raw),Group=groups)
write.csv(meta,file.path(out,'proof-derived-groups-NOT-study-design.csv'),row.names=FALSE)
f <- list(data=data.frame(Lipid_Name=rownames(raw),raw,check.names=FALSE),metadata=data.frame(FullName=colnames(raw),Group1=groups,Group2='Public demo'))
envs <- list(upstream=preparation_env(fixture=f),guided=preparation_env(guided=TRUE,fixture=f))
proof_log <- proof$normalize_median_log(proof$impute_qrilc_log(proof$transform_log2(proof$detect_zero_and_missing(raw))))
proof_linear <- proof$restitute_linear(proof_log)
compare(proof_linear,read_artifact(file.path(out,'regenerated/transformed_abundance_after.csv')),'proof/repeat_seed_42')
proof_de <- proof$perform_limma_analysis(proof_log,meta,'Group','Control','Treated')
proof_np <- proof$perform_non_parametric_analysis(proof_log,meta,'Group','Control','Treated')
canonical_de <- function(x) {m<-as.matrix(x[,c('log2FC','p_raw','p_adj_bh')]);rownames(m)<-x$Lipid_Name;m}
for(name in names(envs)) {
  e<-envs[[name]]; e$settings$useImputation<-TRUE;e$settings$normalizationMethod<-'median'
  prepared <- e$compute_imputed_matrix(TRUE); m<-as.matrix(prepared[,-1]);rownames(m)<-prepared$Lipid_Name
  compare(proof_linear,m,paste0('proof_vs_',name,'/preparation'))
  # Statistics compared on IDENTICAL proof matrix to isolate formula from preparation.
  contrast<-e$construct_contrast_string('Control','Treated')
  de<-e$perform_limma_analysis(proof_log,meta,'Group',contrast)$results
  np<-e$perform_non_parametric_analysis(proof_log,meta,'Group',contrast)$results
  compare(canonical_de(proof_de),canonical_de(de),paste0('same_matrix/',name,'/limma'))
  compare(canonical_de(proof_np),canonical_de(np),paste0('same_matrix/',name,'/wilcoxon'))
  end_to_end<-e$perform_limma_analysis(log2(m),meta,'Group',contrast)$results
  compare(canonical_de(proof_de),canonical_de(end_to_end),paste0('end_to_end/',name,'/limma'))
  write.csv(prepared,file.path(out,paste0(name,'-prepared.csv')),row.names=FALSE)
  write.csv(end_to_end,file.path(out,paste0(name,'-limma.csv')),row.names=FALSE)
}
# Use the exact nested demonstration annotation functions without running the generator again.
load_assignments('pipeline_math_proof_stacked.R',c('extract_db','extract_sub'),proof)
annot <- data.frame(Lipid_Name=rownames(raw),Subclass=vapply(rownames(raw),proof$extract_sub,character(1)),Total_DB=vapply(rownames(raw),proof$extract_db,numeric(1)))
prod <- new.env(parent=globalenv())
load_assignments('R/global.R',c('class_map','HYPERCLASS_MAP','REVERSE_HYPERCLASS_MAP','classify_chain','clean_lipid_name','parse_lipid_names_bulk'),prod)
load_assignments('R/modules/14_cellular_org_module.R','calculate_cpi',prod)
parsed <- prod$parse_lipid_names_bulk(annot$Lipid_Name)
ann_diff <- data.frame(Lipid_Name=annot$Lipid_Name,proof_subclass=annot$Subclass,app_subclass=parsed$subclass,proof_Total_DB=annot$Total_DB,app_Total_DB=parsed$Total_DB)
ann_diff$subclass_diff <- ann_diff$proof_subclass != ann_diff$app_subclass
ann_diff$db_diff <- is.na(ann_diff$app_Total_DB) | ann_diff$proof_Total_DB != ann_diff$app_Total_DB
write.csv(ann_diff,file.path(out,'annotation-comparison.csv'),row.names=FALSE)
cpi1<-vapply(seq_len(ncol(proof_linear)),function(j) proof$calculate_cpi(proof_linear[,j],annot$Total_DB),numeric(1))
cpi2<-vapply(seq_len(ncol(proof_linear)),function(j) prod$calculate_cpi(proof_linear[,j],annot$Total_DB),numeric(1))
cpi3<-vapply(seq_len(ncol(proof_linear)),function(j) prod$calculate_cpi(proof_linear[,j],parsed$Total_DB),numeric(1))
compare(matrix(cpi1,ncol=1),matrix(cpi2,ncol=1),'same_annotations/CPI_formula')
write.csv(data.frame(Sample=colnames(raw),proof_annotation_CPI=cpi1,production_annotation_CPI=cpi3,difference=cpi3-cpi1),file.path(out,'CPI-annotation-impact.csv'),row.names=FALSE)
# Actual cellular reactive body, with only its I/O replaced. Identical annotations.
prod$shared_data <- list(data_processed=function() data.frame(Lipid_Name=rownames(raw),proof_linear,check.names=FALSE),
  annotationData=function() data.frame(Lipid_Name=annot$Lipid_Name,subclass=annot$Subclass,Total_DB=annot$Total_DB,Has_VLCFA=FALSE),
  grouped_metadata=function() meta,all_metadata=function() NULL)
prod$input<-list(groupingMetadata='Group');prod$level_prefs<-list();prod$`%||%`<-function(x,y) if(is.null(x)) y else x
body <- find_assignment(parse('R/modules/14_cellular_org_module.R'),'computed_metrics')[[3]][[2]]
fun <- eval(call('function',pairlist(),body),prod)
cell <- fun(); cell<-cell[match(colnames(raw),cell$Sample),]
ref_cell<-proof$calculate_organelle_stress_indices(proof_linear,annot)
map<-c(ER_Curvature_PE_PC='er_curvature',ER_Saturation_Symmetric_Log2='er_saturation',Mito_PG_CL_Ratio='mito_pg_cl',FAO_Stress_Permille='mito_fao_stress',Lysosomal_BMP_Percent='lyso_bmp',Golgi_Arrest_Cer_SM='golgi_arrest',M1_Storage_Percent='m1_scaled',M2_Structural_Percent='m2_scaled')
a<-as.matrix(ref_cell[,names(map)]); b<-as.matrix(cell[,unname(map)]);dimnames(b)<-dimnames(a)
compare(a,b,'same_annotations/eight_cellular_indices')
# Additional actual production helpers, with missing-value PQN input.
load_assignments('R/global.R',c('normalize_pqn_linear','normalize_median_log'),prod)
compare(proof$normalize_pqn_linear(proof$detect_zero_and_missing(raw)),prod$normalize_pqn_linear(proof$detect_zero_and_missing(raw)),'same_matrix/PQN')
compare(proof$normalize_median_log(log2(raw)),prod$normalize_median_log(log2(raw)),'same_matrix/median_with_nonfinite')
load_assignments('R/modules/utils_stats.R','auto_route_statistical_method',prod)
routing <- list()
for(scenario in c('public_demo','small_cohort','large_skewed')) {
  mm <- if(scenario=='public_demo') proof_log else if(scenario=='small_cohort') proof_log[,c(1:3,7:9)] else matrix(rep(c(rep(0,19),100),3),nrow=3,byrow=TRUE)
  gg <- if(scenario=='public_demo') meta else data.frame(Group=rep(c('Control','Treated'),each=ncol(mm)/2))
  a_route<-proof$auto_route_statistical_method(mm,gg,'Group');b_route<-prod$auto_route_statistical_method(mm,gg,'Group')
  stopifnot(identical(a_route,b_route));routing[[scenario]]<-data.frame(scenario,proof=a_route,app=b_route,status='MATCH')
}
write.csv(do.call(rbind,routing),file.path(out,'routing-checks.csv'),row.names=FALSE)
# The actual default omics PCA uses log2(x+1), whereas the proof accepts log2(x).
prod$pca_opts<-list(pcaMode='omics',maxPCs=3,mergeReplicates=FALSE)
prod$allParsedMetadata<-function() meta
prod$annotationData<-function() data.frame(Lipid_Name=parsed$Lipid_Name,subclass=parsed$subclass)
load_assignments('R/modules/1_shared_data_module.R','run_pca_calc',prod)
actual_pca<-prod$run_pca_calc(data.frame(Lipid_Name=rownames(raw),proof_linear,check.names=FALSE))
actual_scores<-as.matrix(actual_pca$score_df[,paste0('PC',1:3)]);rownames(actual_scores)<-actual_pca$score_df$FullName
harmonized<-proof$compute_pca(log2(proof_linear+1))$scores[,1:3]
compare(harmonized,actual_scores,'PCA/same_log2_x_plus_1_transformation')
original_scores<-proof$compute_pca(proof_log)$scores[,1:3]
pca_equal<-compare(original_scores,actual_scores,'PCA/log2_x_reference_vs_log2_x_plus_1_app',FALSE)
stopifnot(!pca_equal) # Expected, disclosed transformation difference on this pinned demo.
write.csv(data.frame(Sample=rownames(actual_scores),proof_PC1=original_scores[,1],app_PC1=actual_scores[,1]),file.path(out,'PCA-transformation-impact.csv'),row.names=FALSE)

# Independent arithmetic oracles: identities rather than self-comparison.
stopifnot(abs(proof$calculate_cpi(c(10,20,30,40),c(0,1,2,6)) - (20*.014+30+40*5.4))<1e-12)
stopifnot(identical(proof$detect_zero_and_missing(matrix(c(-1,0,NA,2),2)),matrix(c(NA_real_,NA_real_,NA_real_,2),2)))
z<-matrix(c(1,2,3,4,5,6),nrow=2);stopifnot(isTRUE(all.equal(as.vector(proof$compute_z_score_matrix(z)),as.vector(t(scale(t(z)))))))
# Three independent arithmetic checks above plus class aggregation oracles.
small <- matrix(1:9,nrow=3); cls<-factor(c('A','A','B'))
stopifnot(isTRUE(all.equal(unname(proof$compute_condensed_class_means(small,cls)),rbind(colMeans(small[1:2,]),small[3,]))))
stopifnot(isTRUE(all.equal(unname(proof$compute_condensed_class_sds(small,cls)),rbind(apply(small[1:2,],2,sd),c(0,0,0)))))
qc <- rbind(SYN_QC=c(10,12,14),SYN_CONSTANT=c(5,5,5))
bqc <- proof$calculate_bqc_cov(qc,1:3)
stopifnot(isTRUE(all.equal(bqc$BQC_CoV_Percent,c(100/6,0))),is.null(proof$calculate_bqc_cov(qc,1)))
write.csv(data.frame(check=c('CPI_weighted_sum','zero_negative_to_missing','row_z_scores','class_means','class_SD_singleton_zero','BQC_sample_SD_CV','BQC_one_sample_unavailable'),status='PASS'),file.path(out,'arithmetic-oracles.csv'),row.names=FALSE)
write.csv(do.call(rbind,rows),file.path(out,'comparison-summary.csv'),row.names=FALSE)
writeLines(capture.output(sessionInfo()),file.path(out,'sessionInfo.txt'))
files<-c('pipeline_math_proof_stacked.R','demo_data/demo_global_lipidomics.xlsx',list.files('docs/proof_artifacts',full.names=TRUE),'R/modules/1_shared_data_module.R','R/modules/utils_stats.R','R/modules/14_cellular_org_module.R','R/global.R','tools/reference_contract/guided_snapshot.R')
write.csv(data.frame(file=files,sha256=vapply(files,function(f)digest::digest(file=f,algo='sha256'),character(1))),file.path(out,'source-sha256.csv'),row.names=FALSE)
print(do.call(rbind,rows));cat('Annotation disagreements:',sum(ann_diff$subclass_diff),'subclasses;',sum(ann_diff$db_diff),'double-bond counts.\n')
cat('PASS: required parity and independent arithmetic checks. DIFFERENCE rows are documented findings, not matches.\n')
