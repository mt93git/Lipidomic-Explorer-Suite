# Application guidance (Team)

<!-- Reviewed guidance for this interface. It describes how the application works; it says nothing about any particular study. -->

## Workflow steps

### Step 1 of 7
<!-- audience: team -->
<!-- tags: step-1 -->
In Data, upload an abundance matrix or restore a saved session ZIP. Resume a private project checkpoint here when available; original input files remain unchanged.

### Step 2 of 7
<!-- audience: team -->
<!-- tags: step-2 -->
In Review, inspect sample labels, selected samples and independent or matched design. Only you can confirm the design review.

### Step 3 of 7
<!-- audience: team -->
<!-- tags: step-3 -->
In Review, inspect detection, missing values and normalization. Detection changes update prepared data automatically; confirm any proposed AI change before it applies and review other pending settings.

### Step 4 of 7
<!-- audience: team -->
<!-- tags: step-4 -->
In Review, choose the biological question and comparison. A study description does not automatically change the statistical model.

### Step 5 of 7
<!-- audience: team -->
<!-- tags: step-5 -->
In Canvas, explore PCA, class profiles, volcano and violin plots. Workspace changes autosave when the private project is available. Save & export offers named checkpoints, whole-Canvas SVG and per-plot downloads; CSV is available when the source provides it.

### Step 6 of 7
<!-- audience: team -->
<!-- tags: step-6 -->
In Canvas, use the 3D cell as an illustrative reference view. Prepared abundance may include imputed estimates; bulk signals do not establish subcellular locations. No dynamic simulation is enabled.

### Step 7 of 7
<!-- audience: team -->
<!-- tags: step-7 -->
In Save & export, create named checkpoints and download a whole-Canvas SVG or available per-plot exports. Workspace changes autosave when the private project is available; resume a checkpoint from Data. Finished figures are archived snapshots and may differ from current live data; Edit regenerates the current plot. After resuming, review the restored data and settings. Preserve methods, decisions and source files separately.

## Topics

### Loading data
<!-- audience: team -->
<!-- tags: topic-experiment -->
In Data, upload an abundance matrix or resume a saved checkpoint. Review the interpreted sample labels and design in Review. Original input files remain unchanged.

### Study design
<!-- audience: team -->
<!-- tags: topic-design -->
In Review, identify the independently sampled units and any true matching or repeated measurements. Replicate numbers do not prove pairing. Review labels and selected samples, then confirm the design review yourself. A design label does not change the statistical test; do not change a correct paired label to bypass a test restriction.

### Detection and missing values
<!-- audience: team -->
<!-- tags: topic-quality -->
In Review, detection counts positive measured values before imputation; a global threshold can remove group-specific signals. QRILC estimates missing values under a left-censoring assumption, while mean imputation replaces missing values with a mean and can reduce apparent variability. Both produce estimates, not measurements. A high missing-value percentage makes patterns less certain and may make plots sensitive to the imputation method; assess missingness and assay controls before drawing conclusions. Detection changes update prepared data automatically. Other pending settings are shown for review and confirmation before applying them.

### Normalization
<!-- audience: team -->
<!-- tags: topic-normalization -->
PQN operates in linear space; median normalization centers log2 values and returns linear abundances. Neither is automatically best: assess controls and distributions with the analyst. To request a change, ask for one setting and review and confirm the proposal; Review will show any other pending changes that need confirmation.

### Biological question
<!-- audience: team -->
<!-- tags: topic-question -->
In Review, choose the biological question and comparison. Check which group is the reference and which is the comparison. A study description does not automatically change statistical tests. Use independently sampled units and a method appropriate for the design; a paired label does not convert an unpaired test.

### Violin plots
<!-- audience: team -->
<!-- tags: topic-violin -->
In Canvas, explore the violin plot for the distribution of a selected lipid across samples in each group, with individual points. It displays positive prepared abundances on a log10 scale, excluding unavailable or nonpositive values. It is descriptive, not a significance test. Use the plot's existing data download when available; CSV is not provided by every analysis.

### PCA
<!-- audience: team -->
<!-- tags: topic-pca -->
In Canvas, explore PCA as a summary of variation, not significance or causality. The dashboard supports linear or log10 prepared abundances and scaling options. Match the samples, lipids, transformation and scaling before comparing plots. Plot downloads are per plot, and CSV is available only when the source analysis provides it; inspect the exported columns rather than assuming it contains loadings.

### Results and plots
<!-- audience: team -->
<!-- tags: topic-results -->
Canvas arranges available plots; appearance edits do not change analysis data. Finished figures are archived snapshots and may differ from current live data. Edit regenerates the current plot. Private checkpoints save the workspace when available. Plot downloads are per plot, and CSV is available where provided. PCA and violin shapes are descriptive, not proof of significance; review the actual differential results, test and correction.

### 3D cell reference
<!-- audience: team -->
<!-- tags: topic-cell -->
The 3D cell reference view is available from Canvas. Its anatomy is an unchanged illustration; prepared abundances appear in the adjacent profile and may include imputed estimates. Bulk or serum lipidomics does not establish subcellular localization. Anatomy is interpreted, not measured, and no dynamic simulation is enabled.

### Saving and exporting
<!-- audience: team -->
<!-- tags: topic-share -->
Private checkpoints retain the workspace and finished figures; use Save & export for a named checkpoint and available downloads. After resuming, review the restored data and settings. Finished figures are snapshots and may differ from current live data. Preserve original files, methods and available plot data separately.

### Requesting a setting change
<!-- audience: team -->
<!-- tags: topic-settings -->
Request one setting change at a time. I will show the current and proposed values; no setting changes before you confirm. Detection updates prepared data automatically. Review any other pending changes and confirm them before applying.

## Methods notes

### Workflow
<!-- audience: team -->
Team has Data, Review and Canvas. Data uploads or resumes a checkpoint. Review updates prepared data after detection changes and confirmed sample decisions; other pending changes require review and confirmation. Canvas contains plots and figures. Private checkpoints retain workspace state when available.

### Preparation methods
<!-- audience: team -->
Median normalization centers log2 values then returns linear abundances; PQN operates in linear space. Detection counts positive values. QRILC estimates missing values under a left-censoring assumption; estimates are not measurements.

### Results methods
<!-- audience: team -->
Canvas plots and archived figure snapshots can differ from current live data. Edit regenerates the current plot. PCA summarizes variation, not significance. Volcano interpretation depends on contrast, test and correction; this workflow does not convert paired designs into paired tests. Do not invent study-specific results.

### 3D provenance
<!-- audience: team -->
The 3D cell is an illustrative reference view; bulk lipidomics does not locate lipids inside a cell.

