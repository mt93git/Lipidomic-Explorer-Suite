# Application guidance (Classic)

<!-- Reviewed guidance for this interface. It describes how the application works; it says nothing about any particular study. -->

## Workflow steps

### Step 1 of 7
<!-- audience: classic -->
<!-- tags: step-1 -->
Upload abundance files or restore a session ZIP. Original files stay unchanged.

### Step 2 of 7
<!-- audience: classic -->
<!-- tags: step-2 -->
Review sample labels, selected samples and independent or matched design. Only you can confirm the design review.

### Step 3 of 7
<!-- audience: classic -->
<!-- tags: step-3 -->
Review detection, missing values and normalization. Prepare data only after reviewing these choices; previous plots keep the applied run until then.

### Step 4 of 7
<!-- audience: classic -->
<!-- tags: step-4 -->
Choose the biological question. A study description does not automatically change the statistical model.

### Step 5 of 7
<!-- audience: classic -->
<!-- tags: step-5 -->
Explore PCA, class profiles, volcano and violin plots. Hover over points and export the CSV behind each plot.

### Step 6 of 7
<!-- audience: classic -->
<!-- tags: step-6 -->
Select a lipid and measurement to inspect prepared abundances. Anatomy is interpreted reference biology; bulk signals do not establish subcellular lipid locations. No dynamic simulation is enabled.

### Step 7 of 7
<!-- audience: classic -->
<!-- tags: step-7 -->
Export results, methods and decisions, sample labels and a session ZIP. Also save the companion action log; it is session-local.

## Topics

### Loading data
<!-- audience: classic -->
<!-- tags: topic-experiment -->
Upload an abundance matrix (Excel or CSV) in Experiment, not raw instrument spectra. Review the interpreted labels and selected samples in Design before confirming your review. Original files remain unchanged.

### Study design
<!-- audience: classic -->
<!-- tags: topic-design -->
Identify the independently sampled units and any true matching or repeated measurements. Replicate numbers do not prove pairing. Review labels and selected samples, then confirm Design yourself. A design label does not change the statistical test; do not change a correct paired label to bypass a test restriction.

### Detection and missing values
<!-- audience: classic -->
<!-- tags: topic-quality -->
Detection counts positive measured values before imputation. A global threshold can remove group-specific signals; review the detection scope. QRILC estimates missing values under a left-censoring assumption; estimates are not measurements. Review whether that assumption fits the assay. Changing normalization or another preparation setting does not recompute plots. Review Quality and click Prepare data yourself; until then, plots use the previous applied run.

### Normalization
<!-- audience: classic -->
<!-- tags: topic-normalization -->
PQN means probabilistic quotient normalization and operates in linear space. Median normalization centers log2 values and returns linear abundances. Neither is automatically best for this study: assess controls and distributions with the analyst. To request a change, type set normalization to pqn. Review and confirm the proposal, then click Prepare data in Quality to recompute.

### Biological question
<!-- audience: classic -->
<!-- tags: topic-question -->
Choose the biological question and comparison. Check which group is the reference and which is the comparison. A study description does not automatically change statistical tests. Use independently sampled units and a method appropriate for the design; a paired label does not convert an unpaired test.

### Violin plots
<!-- audience: classic -->
<!-- tags: topic-violin -->
The violin panel shows the distribution of a selected lipid across samples in each group, with individual points. It displays positive prepared abundances on a log10 scale, excluding unavailable or nonpositive values. It is descriptive, not a significance test. Select a lipid in Results and click Plot data (CSV) beside the violin panel to export the underlying prepared sample values.

### PCA
<!-- audience: classic -->
<!-- tags: topic-pca -->
PCA summarizes variation, not significance or causality. The dashboard supports linear or log10 prepared abundances and scaling options. Match the samples, lipids, transformation and scaling before comparing plots. The dashboard export records scores, explained variance and scaling information; inspect its columns rather than assuming it contains loadings.

### Results and plots
<!-- audience: classic -->
<!-- tags: topic-results -->
Explore the plots in Results and export each plot's data. A volcano plot combines effect size and statistical evidence. Check contrast direction, test and multiple-testing correction. A violin shape or PCA separation is not itself proof of a significant difference. I do not receive your matrix or computed statistical results and cannot name significant lipids from this chat.

### 3D cell reference
<!-- audience: classic -->
<!-- tags: topic-cell -->
The 3D anatomy is an unchanged reference illustration. Prepared abundances appear in the adjacent profile and may include imputed estimates. Bulk or serum lipidomics does not establish subcellular localization. Anatomy is interpreted, not measured, and no dynamic simulation is enabled.

### Saving and exporting
<!-- audience: classic -->
<!-- tags: topic-share -->
Save the session ZIP and separately save Methods and decisions, sample labels, prepared matrix, plot-data CSVs, figures and the companion action log. Do not assume the ZIP includes all these separate exports. Previous guided run history and the session-local companion log are not restored by the ZIP. Preserve original input files and the applied parameters so another analyst can reproduce the analysis.

### Requesting a setting change
<!-- audience: classic -->
<!-- tags: topic-settings -->
To request one setting change, type set normalization to pqn, set detection to 80%, or turn imputation off. I will show the current and proposed values for confirmation. No change is applied before you confirm. Confirmation updates the control only; review Quality and click Prepare data yourself to recompute.

## Methods notes

### Workflow
<!-- audience: classic -->
Lipidomic Explorer methods: step numbers: 1 Experiment (upload abundance files or restore saved ZIP; originals unchanged; after restoring review and confirm Design again), 2 Design (review labels and independently sampled units; replicate numbers do not establish pairing; select samples then manually confirm the review), 3 Quality (filter, impute, normalize, Prepare data), 4 My question, 5 Results (plots), 6 3D Show, 7 Share (save the session ZIP plus separate Methods and decisions, sample labels, prepared matrix, plot-data CSVs, plots, and companion action log; do not assume the ZIP contains every result; the log is session-local and previous run history is not restored). Step4 study-description text does not automatically change statistical tests.

### Preparation methods
<!-- audience: classic -->
Median normalization centers log2 values then returns linear abundances; PQN operates in linear space. Detection counts positive values. Changing controls does not recompute; user must Prepare data.

### Preparation methods
<!-- audience: classic -->
QRILC estimates low-abundance missing values under a left-censoring assumption; estimates are not measurements.

### Results methods
<!-- audience: classic -->
Dashboard violin plots use positive prepared abundances on a log10 display scale; they are descriptive, not automatically a test. Choose a lipid in Results and use Plot data (CSV) beside the violin panel to export its underlying sample values. PCA summarizes variation, not significance. No sample matrix or statistical results are available to this chat: never invent lipid names, p-values, counts or study-specific results, and do not ask users to paste confidential data; direct them to the results and exported tables instead.

### Results methods
<!-- audience: classic -->
Volcano interpretation depends on the stated contrast direction, test and correction; this workflow does not convert paired designs into paired tests.

### 3D provenance
<!-- audience: classic -->
The 3D cell combines measured processed abundance with interpreted reference anatomy; bulk or serum lipidomics does not locate lipids inside a cell.

