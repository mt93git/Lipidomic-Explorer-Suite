# Script: generate_test_data.R
# Purpose: Generates a valid .xlsx dataset to test the Lipidomic Explorer Suite.
# It creates "fake" lipids that strictly adhere to the parser's nomenclature.

# Check for required packages
if (!require("writexl")) install.packages("writexl")
library(writexl)

set.seed(42) # For reproducibility

# --- 1. Define Nomenclature Rules (Based on your Parser) ---
# We define templates matching your app's Regex logic
lipid_templates <- list(
  "PC" = "PC({c1}_{c2})+AcO",
  "PE" = "PE({c1}_{c2})-H",
  "PE_O" = "PE(O-{c1}_{c2})-H",
  "PE_P" = "PE(P-{c1}_{c2})-H",
  "PG" = "PG({c1}_{c2})-H",
  "PS" = "PS({c1}_{c2})-H",
  "PI" = "PI({c1}_{c2})-H",
  "PA" = "PA({c1}_{c2})-H",
  "LPC" = "LPC({c1})+AcO",
  "LPE" = "LPE({c1})-H",
  "LPG" = "LPG({c1})-H",
  "LPI" = "LPI({c1})-H",
  "LPS" = "LPS({c1})-H",
  "CL" = "CL({c1}_{c2}_{c3}_{c4})-2H", # Simplified for demo
  "SM" = "SM(d18:1/{c2})+H",
  "Cer" = "Cer(d18:1/{c2})+H",
  "GlcCer" = "GlcCer(d18:1/{c2})+H",
  "LacCer" = "LacCer(d18:1/{c2})+H",
  "CE" = "CE({c1})+NH4",
  "TAG" = "TAG({c1}_{c2}_{c3})+NH4",
  "DAG" = "DAG({c1}_{c2})+NH4",
  "ACar" = "ACar {c1}"
)

# Common fatty acid chains for randomization
chains <- c("14:0", "16:0", "16:1", "18:0", "18:1", "18:2", "18:3", "20:3", "20:4", "20:5", "22:6", "24:0", "24:1")

# --- 2. Generate Synthetic Lipids ---
generate_lipids <- function(n_lipids = 300) {
  lipid_names <- c()
  
  for(i in 1:n_lipids) {
    # Pick a random class
    cls <- sample(names(lipid_templates), 1)
    tmpl <- lipid_templates[[cls]]
    
    # Fill chains
    c1 <- sample(chains, 1)
    c2 <- sample(chains, 1)
    c3 <- sample(chains, 1)
    c4 <- sample(chains, 1)
    
    # Replace placeholders
    name <- gsub("\\{c1\\}", c1, tmpl)
    name <- gsub("\\{c2\\}", c2, name)
    name <- gsub("\\{c3\\}", c3, name)
    name <- gsub("\\{c4\\}", c4, name)
    
    lipid_names <- c(lipid_names, name)
  }
  return(unique(lipid_names))
}

lipids <- generate_lipids(400) # Generate ~400 lipids

# --- 3. Generate Quantitative Data (Log-Normal Distribution) ---
# Structure: 2 Conditions (WT, KO), 2 Populations (Base, Stim), 3 Replicates
# Naming Convention: Condition_Population_Replicate (e.g., WT_Base_1)

samples <- c(
  paste0("WT_Base_", 1:3),
  paste0("WT_Stim_", 1:3),
  paste0("KO_Base_", 1:3),
  paste0("KO_Stim_", 1:3)
)

# Create DataFrame
df <- data.frame(Lipid_Name = lipids)

# Simulate biological signal
for(samp in samples) {
  # Base intensity + random noise
  # We add artificial separation between groups for the PCA demo
  noise <- rnorm(length(lipids), mean = 15, sd = 2) 
  
  if(grepl("Stim", samp)) noise <- noise + rnorm(length(lipids), mean = 1, sd = 0.5) # Shift Stim
  if(grepl("KO", samp)) noise <- noise - rnorm(length(lipids), mean = 1, sd = 0.5)   # Shift KO
  
  df[[samp]] <- 2^noise # Convert back to linear scale (simulating raw area counts)
}

# --- 4. Save to Disk ---
dir.create("data", showWarnings = FALSE)
output_path <- "data/test_lipidomics.xlsx"
write_xlsx(df, output_path)

message(paste0("✅ Success! Dummy dataset created at: ", output_path))
message("   Contains ", length(lipids), " lipids and ", length(samples), " samples.")