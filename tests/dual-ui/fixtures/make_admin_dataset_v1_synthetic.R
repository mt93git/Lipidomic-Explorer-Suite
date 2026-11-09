# Builds tests/dual-ui/fixtures/admin-dataset-v1-synthetic.xlsx: a synthetic dataset v1 workbook
# (docs/admin/admin-wave1-brief.md, "Dataset v1"). No lab data: every name and value is invented.
# Run from the repository root: Rscript tests/dual-ui/fixtures/make_admin_dataset_v1_synthetic.R
stopifnot(requireNamespace("writexl", quietly = TRUE))
set.seed(20261107)
samples <- c("Control_1", "Control_2", "Control_3", "Treated_1", "Treated_2", "Treated_3")
lipids <- c("PC(14:0_16:0)+AcO", "PC(16:0_18:1)+AcO", "PC(18:0_20:4)+AcO", "PE(16:0_18:1)+H",
  "PE(18:0_22:6)+H", "LPC(16:0)+AcO", "LPC(18:1)+AcO", "SM(d18:1/16:0)+H", "SM(d18:1/24:1)+H",
  "CE 18:1 +NH4", "CE 20:4 +NH4", "CE 24:4 +NH4", "Cer(d18:1/16:0)+ H", "Cer(d19:1/20:0)+ H",
  "TAG(52:2)+NH4", "TAG(54:3)+NH4", "DAG(34:1)+NH4", "PI(18:0_20:4)-H", "PS(18:0_18:1)-H",
  "PG(16:0_18:1)-H", "LPE(18:0)+H", "HexCer(d18:1/24:0)+H", "FFA 18:2 -H", "PC(O-34:1)+AcO")
shift <- ifelse(grepl("^Treated", samples), 1.6, 1)
abundance <- data.frame(Lipid = lipids, check.names = FALSE, stringsAsFactors = FALSE)
for (j in seq_along(samples))
  abundance[[samples[[j]]]] <- round(10^runif(length(lipids), 3.2, 8.5) * shift[[j]] * exp(rnorm(length(lipids), 0, 0.15)))
# Missing values (N/A in SCIEX, empty in v1): a few scattered cells, one lipid absent everywhere.
abundance[3, "Control_2"] <- NA; abundance[7, "Treated_1"] <- NA; abundance[11, c("Control_1", "Treated_3")] <- NA
abundance[23, samples] <- NA
abundance[24, c("Control_1", "Control_2", "Control_3", "Treated_1")] <- NA
metadata <- data.frame(FullName = samples,
  Group1Term = rep(c("Control", "Treated"), each = 3), Group2Term = "Plasma",
  ReplicateTerm = as.character(rep(1:3, 2)), PatientTerm = paste0("P", seq_along(samples)),
  TimePointTerm = "", stringsAsFactors = FALSE)
internal <- data.frame(Lipid = c("PC(15:0_18:1(d7))_Ultimate_SPLASH_ONE.IS", "Cer(d18:1/17:0) (IS)"), check.names = FALSE)
for (s in samples) internal[[s]] <- round(10^runif(2, 5, 6))
qc <- data.frame(Lipid = lipids, PooledQC_1 = round(10^runif(length(lipids), 3.2, 8.5)),
  Blank_1 = NA_real_, check.names = FALSE)
provenance <- data.frame(key = c("dataset_format", "dataset_version", "source_txt_sha256", "sciex_os_version",
  "processing_method", "value_type", "filters", "exclusions", "signatures"),
  value = c("1", "1", strrep("0", 64), "synthetic", "synthetic-method", "raw peak area",
    "IS rows removed; duplicate isomer rows removed", "none", "synthetic-signer-a; synthetic-signer-b"),
  stringsAsFactors = FALSE)
out <- file.path("tests", "dual-ui", "fixtures", "admin-dataset-v1-synthetic.xlsx")
writexl::write_xlsx(list(Abundance = abundance, Metadata = metadata, Internal_Standards = internal,
  QC_Injections = qc, Provenance = provenance), out)
cat("wrote", out, "\n")
