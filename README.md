# Lipidomic Explorer Suite (v25.6)

**A Modular R/Shiny Toolkit for High-Throughput Lipidomics Analysis**

## 1. Overview
The **Lipidomic Explorer Suite** is a modular computational framework designed to streamline the analysis of annotated global lipidomic datasets. Unlike monolithic platforms, this suite adopts a focused strategy: **one independent application per distinct analytical purpose**. This allows researchers to deploy lightweight, task-specific interfaces for critical stages of the pipeline, ranging from Quality Control (QC) to Differential Expression (DE) and deep-dive visualization.

**Key Capabilities:**
* **Normalization:** Implements Probabilistic Quotient Normalization (PQN) to account for biological sample dilution effects.
* **Imputation:** Utilizes QRILC (Quantile Regression Imputation of Left-Censored data) for handling missing values inherent to mass spectrometry.
* **Statistical Rigor:** Integrated `limma` backend for robust differential expression analysis.

## 2. The Modules

### 🧬 Module 1: PCA & Quality Control (`app_01_pca_qc.R`)
* **Function:** Unsupervised dimensionality reduction to identify batch effects and outliers.
* **Features:** 2D/3D PCA visualization (Plotly), Loading plots to identify driver lipids, and pre/post-normalization boxplots.

### 📊 Module 2: Composition & Heatmaps (`app_02_heatmap_composition.R`)
* **Function:** Deep-dive visualization of lipid signatures and granular chain composition.
* **Features:** Hierarchical clustering heatmaps, saturation profiling, and class-level composition bar charts.

### 🌋 Module 3: Differential Expression (`app_03_volcano_de.R`)
* **Function:** Hypothesis testing and global regulation visualization.
* **Features:** Interactive Volcano Plots with dynamic labeling, fold-change thresholds, and Benjamini-Hochberg FDR correction.

## 3. Automated Lipid Parsing Engine
A core feature of the suite is its regex-based parsing engine. The system ingests raw annotated lipid names and dynamically extracts structural metadata (Hyperclass, Subclass, Acyl Chain Length, Saturation/Double Bonds) to enable granular filtering.

**Supported Lipid Classes:**
The parser currently supports the following nomenclatures detected by our standard methods, designed to be extensible for future lipid classes:

* **Glycerophospholipids:**
    * *Phosphatidylcholines:* PC (e.g., `PC(16:0_18:1)+AcO`)
    * *Phosphatidylethanolamines:* PE, including Plasmalogens (e.g., `PE(P-16:1_18:0)+H`) and Ethers (`PE(O-...)`)
    * *Phosphatidylserines:* PS (e.g., `PS(18:0_18:1)-H`)
    * *Phosphatidylglycerols:* PG (e.g., `PG(18:1_18:2)-H`)
    * *Phosphatidylinositols:* PI (e.g., `PI(16:0_18:1)-H`)
    * *Phosphatidic Acids:* PA (e.g., `PA(14:0_14:0)-H`)
    * *Cardiolipins:* CL (e.g., `CL(72:5_18:2)-2H`)
    * *Lyso-forms:* LPC, LPE, LPS, LPG, LPI, LPA
* **Sphingolipids:**
    * *Sphingomyelins:* SM (e.g., `SM(d18:1/24:1)+H`)
    * *Ceramides:* Cer (e.g., `Cer(d18:1/24:0)+H`)
    * *Hexosylceramides:* GlcCer, LacCer
* **Neutral Lipids & Acylcarnitines:**
    * *Tri/Diacylglycerols:* TAG, DAG (e.g., `TAG(40:0_FA14:0)+NH4`)
    * *Cholesteryl Esters:* CE (e.g., `CE(18:1)+NH4`)
    * *Acylcarnitines:* ACar (e.g., `ACar 18:3`)

## 4. Data Reproducibility & Synthetic Generation
To demonstrate the suite's capabilities without compromising patient privacy or utilizing proprietary datasets, this repository includes a **Synthetic Data Generator** (`generate_test_data.R`).

* **The Engine:** This script procedurally generates a valid `.xlsx` dataset (`data/test_lipidomics.xlsx`) that strictly adheres to the complex nomenclature rules defined in the Parsing Engine.
* **The Signal:** It simulates realistic LC-MS intensity distributions (log-normal) and introduces controlled biological variance (WT vs. KO) to allow users to verify the PCA and Differential Expression logic immediately.
* **Usage:** The `test_lipidomics.xlsx` file is pre-generated in the `data/` folder for immediate testing.

## 5. Installation & Usage

### Prerequisites
Ensure R (v4.0+) and RStudio are installed.

### Setup
1. Clone the repository:
   ```bash
   git clone [https://github.com/YOUR_USERNAME/Lipidomic-Explorer-Suite.git](https://github.com/YOUR_USERNAME/Lipidomic-Explorer-Suite.git)