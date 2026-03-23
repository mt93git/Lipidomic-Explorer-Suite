# 03_GENERATE_TEMPLATE_DATA.R
# Purpose: Generates a synthetic but fully structurally valid lipidomics dataset.
# Use this script to create a template file that demonstrates the required 
# lipid nomenclature and formatting expected by the Lipidomic Explorer Suite.

if (!requireNamespace("writexl", quietly = TRUE)) {
  install.packages("writexl", repos = "https://cloud.r-project.org")
}

set.seed(42)

# 1. Nomenclature rules perfectly matching the Suite's Regex Engine
lipid_templates <- list(
  "PC" = "PC({c1}_{c2})+AcO",
  "PE" = "PE({c1}_{c2})-H",
  "PE_Ether" = "PE(O-{c1}_{c2})-H",
  "PE_Plasma" = "PE(P-{c1}_{c2})-H",
  "PG" = "PG({c1}_{c2})-H",
  "PS" = "PS({c1}_{c2})-H",
  "PI" = "PI({c1}_{c2})-H",
  "PA" = "PA({c1}_{c2})-H",
  "LPC" = "LPC({c1})+AcO",
  "LPE" = "LPE({c1})-H",
  "LPG" = "LPG({c1})-H",
  "LPI" = "LPI({c1})-H",
  "LPS" = "LPS({c1})-H",
  "LPA" = "LPA({c1})-H",
  "CL" = "CL({c1}_{c2}_{c3}_{c4})-2H",
  "SM" = "SM(d18:1/{c2})+H",
  "Cer" = "Cer(d18:1/{c2})+H",
  "GlcCer" = "GlcCer(d18:1/{c2})+H",
  "LacCer" = "LacCer(d18:1/{c2})+H",
  "CE" = "CE({c1})+NH4",
  "TAG" = "TAG({c1}_{c2}_{c3})+NH4",
  "DAG" = "DAG({c1}_{c2})+NH4",
  "ACar" = "ACar {c1}"
)

# Common dynamic acyl chains
chains <- c("14:0", "16:0", "16:1", "18:0", "18:1", "18:2", "18:3", 
            "20:3", "20:4", "20:5", "22:5", "22:6", "24:0", "24:1")

# 2. Build Structural Examples
message("Generating synthetic lipid geometries...")
lipid_names <- c()
for(cls in names(lipid_templates)) {
  for(i in 1:15) { # Ensure 15 examples minimum per class
    tmpl <- lipid_templates[[cls]]
    name <- tmpl
    for(place in c("{c1}", "{c2}", "{c3}", "{c4}")) {
      name <- gsub(place, sample(chains, 1), name, fixed = TRUE)
    }
    lipid_names <- c(lipid_names, name)
  }
}
lipid_names <- unique(lipid_names)

# 3. Define the minimal Required Column Format (Condition_Population_Replicate)
samples <- c(
  paste0("WT_Control_", 1:3), paste0("WT_Treated_", 1:3),
  paste0("KO_Control_", 1:3), paste0("KO_Treated_", 1:3)
)

df <- data.frame(Lipid_Name = lipid_names)

# 4. Fill matrix with realistic log-normal mass spec noise and biological separation
for(samp in samples) {
  base_signal <- rnorm(length(lipid_names), mean = 15, sd = 2)
  if(grepl("Treated", samp)) base_signal <- base_signal + rnorm(length(lipid_names), mean = 1.2, sd = 0.5)
  if(grepl("KO", samp)) base_signal <- base_signal - rnorm(length(lipid_names), mean = 1.5, sd = 0.5)
  df[[samp]] <- 2^base_signal # Revert to raw linear intensity scale
}

# 5. Export
dir.create("data", showWarnings = FALSE)
output_path <- "data/Synthetic_Template_Lipidomics.xlsx"
writexl::write_xlsx(df, output_path)

message(sprintf("✅ Template generated successfully: %s", output_path))
message(sprintf("   Included %d structurally valid lipids across %d sample columns.", nrow(df), length(samples)))
