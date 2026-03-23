# Lipidomic Explorer Suite

**An R/Shiny Application for Lipidomics Analysis**

## 1. Overview
The **Lipidomic Explorer Suite** is an R/Shiny framework for analyzing and visualizing annotated global lipidomic datasets. The application consolidates data preprocessing, exploratory data analysis, and differential expression into a single graphical interface.

**Key Capabilities:**
* **PCA & Quality Control:** Perform Principal Component Analysis to identify batch effects and outliers. Visualize pre- and post-normalization sample distributions.
* **Composition & Heatmaps:** Generate hierarchical clustering heatmaps, saturation profiles, and class-level bar charts based on lipid chain composition.
* **Differential Expression:** Perform hypothesis testing using an integrated `limma` backend with Benjamini-Hochberg FDR correction. Results are visualized through interactive Volcano plots.

## 2. Application Architecture
The suite is built as a unified Shiny Application using Shiny Modules to separate the UI and Server code. The repository contains:
* **`app.R`**: The main execution script.
* **`R/` Directory**: Contains the core rendering scripts (`ui.R`, `server.R`, `global.R`, `modules/`) and utility functions (`utils_data.R`, `utils_colors.R`, `utils_vis.R`).
* **Regex Parsing Engine**: Automatically extracts structural metadata (Hyperclass, Subclass, Acyl Chain Length, Double Bonds) from standard lipid nomenclatures to allow filtering.

## 3. Installation & Usage

### Prerequisites
Ensure R (v4.0+) and RStudio are installed. The application will attempt to install missing CRAN or Bioconductor packages upon launch.

### Setup & Execution
1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Lipidomic-Explorer-Suite.git
   ```
2. Open the project root (`Lipidomic_Explorer_AppV3_New.Rproj`) in RStudio.
3. **Launch the Application**: We recommend running this dedicated script to install missing dependencies and start the app:
   * **`01_RUN_APP.R`**

### Pipeline Utilities:
* `00_ENVIRONMENT_SETUP.R`: For manual dependency installation.
* `02_DIAGNOSTIC_REPORT.R`: For generating static reports and downstream validation.
* **`03_GENERATE_TEMPLATE_DATA.R`**: Run this script to generate a synthetic `.xlsx` file demonstrating the structural nomenclature required by the engine for all lipid classes.