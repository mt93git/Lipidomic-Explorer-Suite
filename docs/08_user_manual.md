# MT_Global_Lipidomic_Explorer User Quickstart Manual

Welcome to **MT_Global_Lipidomic_Explorer**! This guide is designed to help clinical and laboratory researchers ingest lipidomics datasets, configure normalization, perform statistical comparisons, and interpret visualization profiles without requiring advanced bioinformatics or programming experience.

---

## 1. Launching the Application

Depending on your operating system, navigate to the project directory and run the launcher:

*   **Windows**: Double-click `OS/Windows/launch_windows.bat`. If R is not installed on your system, this batch script will automatically download and deploy an isolated, user-space R compiler (`v4.4.0`) without requiring administrator permissions.
*   **macOS (Intel/Apple Silicon)**: Run `OS/macOS_Intel/launch_macos.command` or `OS/macOS_AppleSilicon/launch_macos.command`.
*   **Linux**: Run `OS/Linux/launch_linux.sh` from your terminal.

Alternatively, you can open **RStudio**, set your working directory to the application root, and run:
```R
shiny::runApp(".")
```

---

## 2. Ingesting Your Datasets

When the application opens, you will be greeted by the sidebar orchestrator with both **`00. Save & Restore Session`** and **`1. Input & Run Analysis`** expanded by default for immediate session restoration or data ingestion. All clickable controls feature an ergonomic **Modern Soft Squircle** curvature system (`10px–12px`) with distinct color hierarchy (Sunset Tangerine for Session export, Deep Indigo for Data upload, Royal Iris for Metadata mapping, Electric Laser Cobalt for Run Analysis, and Emerald Mint for Download Imputed CSV). The file upload progress bar is calibrated to 16px (2x height) with pill curvature, providing a clean enclosure for the "Upload complete" notification without text clipping.

### Sidebar Parameter Hierarchy & Checkpoints (Paradigm 1)
To ensure immediate readability when navigating dense scientific parameters, the sidebar implements a calibrated 3-tier visual hierarchy:
* **Control Titles (Parameters / Questions)**: Formatted as compact uppercase micro-labels (`11px`, bold `700`, Slate `#475569`) with generous top-clearance (`13px`) establishing clear parent boundaries. Preserved informational tooltip (`'i'`) icons remain reactive and cleanly visible.
* **Child Options (Candidate Answers)**: Grouped options (radio buttons and multi-checkboxes) are indented with an elegant vertical border guide (`border-left: 2px solid #e2e8f0`). Active selections illuminate in Electric Cobalt (`#2563EB`, bold `600`).
* **Standalone Checkpoint Cards**: Single-action checkboxes (e.g. *Condense Rows (Class Average)*, *Preserve matrix*, *Drop 'Misc' lipids*) are housed within soft squircle cards (`9px` radius). Toggling an option illuminates the card in soft cobalt tint (`#EFF6FF`) with border accents, preserving dedicated right-aligned `'i'` tooltip icons.


### Downloading Preprocessed Post-NA Imputed CSV
Directly below **Run Analysis**, researchers can export the fully preprocessed, missing-value-handled dataset via the **`Download Imputed CSV`** button equipped with an informational (`'i'`) methodology tooltip:
* **Informational Tooltip (`'i'`)**: Hovering over or clicking the information icon details the complete 6-stage bioinformatics pipeline applied to the loaded CSV.
* **Underlying Pipeline**: Incorporates the complete 6-phase sequence executed upon clicking *Run Analysis*:
  1. *Sample Filtering & Outlier Treatment*: Applies active sample selection and outlier exclusion/averaging.
  2. *File-Level Zero Imputation & Zero-to-NA Tagging*: Converts non-detects ($\le 0$) to `NA` representing left-censored detection limits.
  3. *Log2 Scale Transformation*: Transposes linear intensities into $log_2$ space.
  4. *QRILC Gaussian Imputation*: Imputes left-censored missing values using Quantile Regression for Left-Censored Data below the limit of detection (LOD).
  5. *Sample-wise Abundance Normalization*: Normalizes sample-level intensity distributions across active cohorts.
  6. *Restitution to Linear Abundance Scale*: Restores abundance values to the linear scale with numerical bounds.
* **Output Format**: A timestamped CSV file (`LipidomicExplorer_Imputed_PostNA_YYYYMMDD_HHMMSS.csv`) containing the `Lipid_Name` column and all active, normalized sample abundance columns ready for downstream biostatistical modeling in R, Python, or GraphPad Prism.


### File Formats Required
You must upload your datasets as Excel files (`.xlsx` / `.XLSX`) containing two sheets (Abundance and Metadata), or as separate CSV files (`.csv` / `.CSV`) via the interactive sidebar upload panel.

1.  **Abundance Sheet**:
    *   The first column must contain unique **Lipid Species Names** (e.g. `PC(16:0/18:1)`, `PE(18:0_20:4)`, `TG(16:0_18:1_18:2)`).
    *   Subsequent columns represent individual samples. Cell values must contain raw intensities or normalized peak areas.
2.  **Metadata Sheet**:
    *   This sheet defines your experimental cohorts. It must contain the following case-insensitive column headers:
        *   `FullName`: Matches sample column headers in the abundance sheet exactly.
        *   `Group1Term`: Primary treatment status (e.g., `Control`, `Treated`).
        *   `Group2Term`: Cohort group (e.g., `WildType`, `Mutant`).
        *   `ReplicateTerm`: Replicate index (e.g., `1`, `2`, `3`).

> [!TIP]
> Use the sample files in the `/demo_data` folder (such as `demo_data/demo_global_lipidomics.xlsx`) to test the dashboard features.

---

## 3. Metadata Ingestion and UI Alignment

The uploader processes datasets in 3 steps:

1.  **File Loading**: Upload your workbook. The app checks that sample names match between the abundance matrix and metadata.
2.  **TimePoint Extraction**: If your sample names contain timepoint details (e.g., `WT_Control_Day3`), you can write a simple regex prefix (like `Day` or `Hr`) to dynamically map time course vectors.
3.  **Group Term Consolidation**: If your raw metadata labels have different names (e.g., `Ctrl_GroupA` and `Control_Rep`), you can map them in the UI table to a single reference term (like `Control`). Click **Confirm Settings** to proceed.

---

## 4. Quality Control, PCA, & Normalization

Once loaded, navigate to the **Quality Control & PCA** tab:
*   **Diagnostic Distribution Boxplots**: View signal distributions across cohorts. If a sample is skewed or shows low intensity, click on the sample name to flag it as an **Outlier**.
*   **Principal Component Analysis (PCA)**: See how samples cluster in 2D or 3D coordinate space. Outliers can be filtered in real-time, which recalculates the PCA scores and loadings instantly. (Note: PCA Loadings plots have their own dedicated main tab next to PCA Score Plots).
*   **Color & Aesthetic Customization (Panel 8)**: Customize colors for sample groups (`Group1`, `Group2`, composite `Group1 & Group2`), lipid main classes, and lipid categories globally. Select a context, adjust color pickers, and click **"Apply Color Changes"** to commit all color updates simultaneously. This draft-and-apply mechanism ensures intermediate color picker clicks do not freeze the browser or cause plot rendering lag across tabs.
*   **Sample Correlation**: Inspect pairwise sample correlation coefficients (Pearson or Spearman) using the interactive heatmap under the "Sample Correlation" top-level tab. Toggle hierarchical sample clustering and adjust label visibility directly from the sidebar.
*   **Normalization Settings**: Select your preferred data scaling:
    *   *Log2 Transformation*: Enabled by default to stabilize variance.
    *   *Missing Value Imputation*: Impute empty cells using zero values or non-parametric algorithms (LCMD).
    *   *Centering*: Align signals using Median Centering or Total Area Normalization.

---

## 5. Differential Expression & Visualization

Navigate to the **Differential Expression** tab to identify significantly altered lipids:
*   **Statistical Engine**: The engine runs in "Automatic" mode by default, measuring skewness across lipids. If skewness is high ($>1.5$), it runs non-parametric Wilcoxon/Kruskal-Wallis tests; otherwise, it runs parametric moderated t-tests (via the `limma` package).
*   **Differential Expression Callout Banner & Inline Setup**:
    Whenever a downstream visualization requires differential expression results that have not yet been configured in the sidebar (such as Volcano Plot, Filtered Heatmap, LSEA, Structural Shifts, Structural Grids, or Filtered Composition), the visualization card displays an interactive empty-state banner titled **`Differential Expression Analysis Not Run`**. This banner provides:
    *   **Inline Synchronized Controls**: Directly select **Mode** (`Direct` vs `Interaction`), **Reference** cohorts, and **Comparison** cohorts right from the banner on the visualization canvas. Changing selections immediately updates the left sidebar dock and triggers differential expression analysis.
    *   **Interactive "Show in menu" Button**: Clicking **`Show in menu`** immediately unfolds the unified left dock, switches to the `[Cohorts & Filters]` tab, opens accordion panel `3. Differential Expression`, positions the scrollbar to bring the opened menu into prime focus, and pulses a glowing animated blue halo highlight to guide user configuration of advanced options (Log2FC, P-values, statistical engine, and paired donor blocking).
*   **Volcano Plot**: Adjust significance thresholds (p-value / FDR) and fold-change boundaries using the slider controls.
*   **Heatmap Tab**: Clusters significantly altered lipids or condensed parent classes. You can customize clustering methods, scaling modes, color palettes, and cell annotations.
    *   **Condense Rows (Class Average)**: Check this box to average individual lipid species into parent lipid classes ($C_{\text{mean}}$).
    *   **Condense Rows (Class Standard Deviation)**: Check this neighboured box to calculate the standard deviation of constituent lipid species within parent classes ($C_{\text{SD}}$) to display intra-class variability across samples. Enabling both checkboxes renders two distinct heatmap cards stacked cleanly on the page.
    *   **Show Numbers**: Unchecked (`FALSE`) by default. Automatically turns ON (`TRUE`) when `Condense Rows (Class Standard Deviation)` is checked (can be manually unchecked). Automatically turns OFF (`FALSE`) when `Condense Rows (Class Standard Deviation)` is unchecked. Displays cell values and renders dynamic journal captions detailing exact formulas across 4 distinct rendering scenarios (Class SD, Class Average, Uncondensed Single Samples, and Uncondensed Merged Groups).
    *   **Inspect Lipids in Violin View (Panel 3 Accordion)**: Renders probability distributions and abundance variations directly inside a dedicated 3rd subtab (**Violin View**) of the Heatmap card container. Includes:
        *   *Selection Scope*: Choose between **Current Heatmap View (Active Lipids)** (uses active heatmap lipids) or **Custom Class / Structural Selection**.
        *   *Lipid Class Filters*: Multi-select dropdown with **All** and **None** quick-selection action buttons to filter by parent classes.
        *   *Structural Quick-Selection Filters*: One-click buttons to isolate **PUFA Species** ($\ge 2$ double bonds), **SCFA** ($\le C5$), **MCFA** ($C6-C12$), and **LCFA** ($>C12$).
        *   *sn-1 / sn-2 Chain Filters*: Dynamically parsed acyl chain dropdown allowing selection of lipids containing specific fatty acid chains (e.g. `18:1`, `20:4`).
        *   *Concise Summary Badge & Untoggled Species List*: Displays a summary badge (`N Lipids Selected`) and places individual species multi-selection behind `Refine Individual Species List` to prevent sidebar scrolling.
        *   *Violin Representation Modes*: Choose between representation modes:
            1. **`Sample Group Distributions with Replicate Dots (Default)`**: Displays group-level distribution curves for each sample group (`Cells`, `PathEColi`, etc.), with all individual sample replicate measurements (`M1`-`M6`) overlaid as jittered points.
            2. **`Subplot Cards: Sample Conditions (Single Lipids on X-Axis)`**: Dedicated cards titled by **Sample Condition** (`ApoptoticJurk_Cells`, `PathEColi_Live`, ...). Single lipid species (`ACar 4:0`, `LPA 2:0`, ...) are listed along the X-axis grouped by class.
            3. **`Subplot Cards: Single Lipid Species (Sample Conditions on X-Axis)`**: Dedicated cards titled by **Single Lipid Species** (`ACar 4:0`, `LPA 2:0`, ...). Sample conditions are listed along the X-axis for direct condition comparison.
            4. **`Subplot Cards: Lipid Classes (Sample Conditions on X-Axis)`**: Dedicated cards titled by **Lipid Class** (`Phosphatidylcholine`, `Phosphatidylethanolamine`, ...). Sample conditions are listed along the X-axis displaying constituent species values.
            5. **`Subplot Cards: Lipid Categories (Sample Conditions on X-Axis)`**: Dedicated cards titled by **Lipid Category** (`Glycerophospholipids`, `Glycerolipids`, `Sphingolipids`, ...). Sample conditions are listed along the X-axis displaying constituent class/species values.
            6. **`Un-Faceted: Lipid Classes on X-Axis (Grouped by Condition)`**: Parent lipid classes along the X-axis (`PC`, `PE`, `TAG`, etc.) with side-by-side dodged violins comparing each condition.
            7. **`Un-Faceted: Lipid Species on X-Axis (Grouped by Class Facets)`**: Single lipid species along the X-axis grouped into class panel facets.
        *   *Natural Structural Sorting Engine*: When lipid species are on the X-axis, species are sorted by natural integer numerical values ($14 < 16 < 18 < 20$, with $2 < 10 < 12$), sorting by sn-1 Carbon Length $\rightarrow$ sn-1 Double Bonds $\rightarrow$ sn-2 Carbon Length $\rightarrow$ sn-2 Double Bonds.
        *   *Loaded Heatmap Order & Drag-and-Drop X-Axis Reordering*: By default, sample groups on the X-axis preserve the exact left-to-right sample column sequence of the loaded dataset and heatmap. Dragging items left-to-right in the horizontal `sortable::rank_list()` re-levels the X-axis sequence dynamically.
        *   *Independent Baseline Reference Group*: A dedicated baseline group selector (`violin_baseline_group`) independent of Menu 3 DE contrasts. Statistical significance lines ($*$, $**$, $***$, $\text{ns}$) are drawn relative to this reference group.
        *   *Elevated Non-Overlapping Horizontal Significance Brackets*: Significance indicators across all violin views (Heatmap Violin View, Violin Plot tab, FLA tab, Structural tab) are drawn as clean, strictly horizontal line segments without end ticks, positioned dynamically above kernel density tops (`max(density(vals)$x)`).
        *   *Apply Colors to Violins Button*: In the Violin Plot tab, click **"Apply Colors to Violins"** (`btn_apply_violin_colors`) to update plot grid fills at once without lag.
        *   *Adaptive Multi-Sheet Excel & Enriched Data Exports*: Data download handlers (`downloadHeatmapCSV`, `downloadFilteredHeatmapCSV`, `download_violin_csv`) adapt dynamically to active views. When condensed or group-averaged modes are active, exports generate multi-sheet `.xlsx` workbooks (`Condensed_Means`, `Condensed_Variances`, `Condensed_SD`) or enriched multi-column CSV files containing `<Group>_Mean`, `<Group>_Variance`, `<Group>_SD`, and `<Group>_SE` metrics.
    *   **Show Statistic Detail**: Click this button in any analysis sidebar to open the **Statistics Console Modal Overlay** directly over your current tab. This presents mathematical parameter estimations, degrees of freedom, clustering metrics, and multiple testing corrections in a high-contrast dark console without redirecting away from your active plot, preserving all zooms, filters, and selections. Includes an instant `Copy Report` button for manuscript methods sections.
    *   **Show Condensed Class Formulas**: When row aggregation ("Condense Rows" Average or SD) is enabled, clicking this action brings up the Statistics modal overlay displaying both the full mathematical log and an interactive, collapsible card showing class formulas ($C_{\text{mean}}$, $C_{\text{SD}}$) and individual lipid species breakdown.

---

## 6. Composition, Pathway, and Biosynthetic Analysis

*   **Composition Profiles**: View class-level and species-level abundance distributions using dynamic barcharts and donut plots to highlight global lipid shifts.
    *   **0. Sample Grouping & Nomenclature**: Positioned at the top of the sidebar accordion, directly matching the Heatmap module architecture:
        *   **Grouping Mode (Single/Merged Samples)**:
            *   *Merged Samples (Group Average)*: Averages replicate samples per experimental cohort, unlocking total class error bars and segment variance metrics (SD or SEM).
            *   *Single Replicates (Group Order)*: Renders each individual sample replicate in the order defined by the experimental grouping and replicate hierarchy.
            *   *Single Replicates (Class Clustered)*: Automatically orders sample replicate columns via unsupervised Ward.D2 hierarchical clustering based on lipid class abundance profiles, highlighting natural compositional clustering between biological replicates.
        *   **Class/Origin Name Format**: Toggle between *Complete Names* (e.g., Phosphatidylcholine, Triacylglycerol) and *Abbreviated Names* (e.g., PC, TAG).
    *   **Universal Left Ribbon Nomenclature Standardization**: Across all analytical modules (Heatmap, Composition, Volcano, LSEA, Structural, Log2 Ratio, FLA, Longitudinal, Structural Grid, Pathway, and Cellular Organization), `'Class/Origin Name Format:'` is positioned prominently at the top of the left sidebar ribbon, providing instantaneous global nomenclature toggling across all plots, dropdowns, legends, and summary tables.
*   **Lipid Set Enrichment Analysis (LSEA)**: Identify functional pathways (e.g., *Phospholipid Biosynthesis*, *Fatty Acid Elongation*) enriched among altered lipids.
*   **Lipid Pathways**: Maps abundance shifts onto a biological metabolic pathway of 28 lipid classes:
    *   *Visual Encodings*: Node circle size is scaled to log2 fold change (Experimental vs Control), and circle color is customizable: (1) **Saturation Change (Z-score)** (default, divergent color scale: red represents increased saturation / less double bonds, blue represents decreased saturation / more double bonds, white represents no change); (2) **Saturation Change (Log2FC)** (divergent scale); (3) **Saturation Ratio (Absolute)** (Plasma scale: brighter represents higher saturation, darker represents lower saturation); (4) **Carbon Length Change (ΔC)**; or (5) **Log2 Fold Change** of class abundance. Node outlines represent the direction of change (red for upregulated, blue for downregulated). Missing classes are displayed as dashed gray circle outlines.
    *   *Significance Overlay*: Toggle a statistical significance overlay next to class node labels showing **Stars** (`*`/`**`/`***`), **P-value**, or **Both**, comparing class abundances using a Welch's t-test with customizable thresholds (e.g. $p < 0.05$) and raw or BH-adjusted (FDR) p-values.
    *   *Avg Carbon Length Change (`ΔC`)*: Node labels dynamically display average carbon length delta changes (e.g., `ΔC: -0.77`). Hover tooltips display raw linear abundances, ratios, raw/adjusted p-values, average carbon lengths, and saturation ratios, Z-scores, and Log2FC values.
    *   *Comparison Selection*: The pathway map requires an active comparison contrast configured globally under Panel 3 (Differential Expression). A warning message is displayed if none is selected.
    *   *Interactive Layout Editor*: Customize the layout via presets (Default 18, All 28, Scratch), manually adjust node coordinates, add/remove edges, and overlay an alignment grid. In **3. Node Visibility**, checking **"Show only classes present in dataset"** filters the class list to show only those classes that have detected lipid species in the active dataset.
    *   *Config Import/Export*: Save custom coordinate edits as a `.json` file to restore layouts in future sessions.
    *   *Summary Table*: Output metrics (fold changes, saturation ratios, raw/comp abundances, carbon length averages and delta change, raw and adjusted p-values) are displayed in a searchable and downloadable CSV data table.
*   **Structural Grid Visualizer**: Maps lipid fatty acid chain profiles by Carbon Chain Length (X-axis) and Double Bond Count (Y-axis):
    *   **Comparison Validation Guard**: If no active comparison contrast has been configured in Panel 3, all grid views will display a wrapped warning message ("Please select comparison groups in 3. Differential Expression main left sidebar") to prevent empty panel clipping.
    *   **Sizing and Significance Defaults**: All grid plots support customizable significance overlays (Stars or Numeric P-Values) with a default star size of `10.0` (adjustable up to `15` via sidebar sliders).
    *   **Single Class View**: Select an individual lipid class to inspect its specific structural distribution via a **Heatmap Grid** (mean Log2FC per cell) or a **Dotplot Grid** (mean Log2FC size and significance stars).
    *   **All Classes View**: Compare all lipid classes together on a unified grid:
        *   *Merged Classes Grid*: Displays all species in the dataset as dots colored by their corresponding class colors.
        *   *Filtered All Classes (Differential Expression)*: Visualizes multi-class differential expression across the active comparison condition. Dots are colored by class *border contours*, while the circle *size*, *fill color*, and *transparency (alpha)* are dynamically mapped to either Carbon Length L2FC or Double Bond L2FC according to sidebar settings (defaulting to color = double bond L2FC, size = carbon length L2FC).
*   **Structural Analysis (Violin Plots)**: Visualizes structural trait distributions (Total Carbons, Total Unsaturation, sn-1/sn-2 Length and Double Bonds) across reference and comparison cohorts:
    *   **Cohort Color Synchronization**: Violin fills automatically synchronize with active differential expression cohorts from the app's global color mapping across all metadata factors (`Group1`, `Group2`, `TimePoint`).
    *   **Active Contrast X-Axis Labels**: Discrete X-axis ticks dynamically display active cohort names (e.g. `Enriched in Ref (WT)` vs `Enriched in Comp (Ctns)`).
    *   **Elevated Horizontal Significance Brackets**: Features density-aware significance brackets and p-value/star overlays.
*   **Main Class & Acyl Chain Proportions**: Provides horizontal stacked barplots breaking down fatty acyl chain compositions (14:0 to 24:1 + Other) across metadata cohorts or individual samples:
    *   **Default Multi-Class Layout**: Defaults to **Stacked Vertically (Per-Class Barplots)** (`stacked`), separating each selected lipid class into its own dedicated facet barplot for immediate cross-class structural comparisons.
    *   **Default Group By (Y-Axis)**: Defaults to **Patient / Sample replicate** (`FullName`), visualizing individual sample profiles along the Y-axis.
    *   **Strict Class Filtering**: Dynamically filters lipids strictly matching the user's selected classes or subclass linkages, preventing unselected classes from appearing in the proportion breakdowns.
    *   **Determined Colors with Fragmented Continuity**: Employs high-contrast, non-gradient colors across all standard biological fatty acyl chains (`14:0` to `24:1`), with crisp white segment dividing lines (`color = "white", linewidth = 0.3`) between adjacent stacked slices to ensure adjacent unsaturation states are immediately distinguishable without gradient smearing.
    *   **RStudio Console Diagnostic Audit for 'Other'**: Automatically logs a structured audit to the RStudio console whenever observations are pooled into `"Other"`, identifying the active classes, position breakdown mode, unique chain names, and contributing lipid species.
    *   **Interactive Canvas Resizing**: Supports seamless vertical and 2D drag-and-drop plot resizing via bottom pill splitter and corner handles without image clipping.

---

## 7. Saving and Restoring Sessions

To save your progress:
1.  Click the **Export Session** button in the header bar.
2.  The application will package your active inputs, metadata mappings, customized color schemes, and copies of your raw spreadsheets into a compressed `.zip` file.
3.  To resume, launch the app in a clean session, navigate to **Import Session**, upload the `.zip` archive, and the dashboard will restore your entire state.

---

## 8. Cellular Organization & Subcellular Stress

The **Cellular Organization** panel computes and visualizes organelle-specific stress indicators, lipid peroxidation vulnerability (CPI), and immune cell polarization trajectories.

### Grouping, Layout, and Visualization Options
*   **Primary Grouping**: Select one or more metadata columns (`Group1`, `Group2`, `TimePoint`) to define the comparison hierarchy. Tags can be rearranged via drag-and-drop.
*   **Comparison Strategy**:
    *   *Faceted (Intra-group Reference)*: Facets the plots by the leading grouping variables and places the final grouping variable on the X-axis, with violins colored distinctly across cohorts.
    *   *Global (Combined Reference)*: Compares all combination groups across a single baseline.
*   **Bounded Advanced Aesthetics & Ordering**: Bounded strictly under the plot canvas (avoiding protrusion under the left options sidebar). Includes:
    *   *Factor Level Ordering*: Drag-and-drop sequencer to customize group level order from left to right.
    *   *Custom Plot Colors*: Select any active grouping dimension (including `Combined_Grouping`) to override violin fill colors with live color pickers.
*   **Color Synchronization**: Point and violin coloring across all stress profile and CPI plots is automatically synchronized with the global hex color maps from PCA and barcharts for consistency.

### A. Subcellular Stress Profiles
*   **ER Curvature Stress**: PE/PC ratio. Since conical PE (phosphatidylethanolamine) alters membrane curvature compared to cylindrical PC (phosphatidylcholine), high ratios indicate curvature pressure on the ER.
*   **ER Saturation Score**: Symmetric log2 ratio of Saturated PC / Unsaturated PC. Positive values reflect saturated chain accumulation (inducing membrane rigidification), while negative values reflect desaturated chains (unsaturation).
*   **Mitochondrial PG/CL Ratio**: PG/CL ratio. Maturation of PG into CL is essential for inner membrane potential; elevated ratios suggest blocks in cardiolipin remodeling.
*   **FAO Acylcarnitine Stress**: Accumulation of acylcarnitines indicating fatty acid oxidation stalling (expressed as permille of total lipids).
*   **Lysosomal BMP Mass**: BMP/LBPA abundance indicating degradative endolysosomal capacity (percentage of total lipids).
*   **Peroxisomal Dysfunction**: VLCFA-to-ether lipid ratio. Suggests peroxisomal transport/oxidase failure (buildup of very long-chain fatty acids relative to ether lipids).
*   **Golgi Secretory Arrest**: Cer/SM ratio. Elevated ratio indicates block of conversion of ceramides to sphingomyelins.

### B. Ferroptosis & Peroxidation (CPI)
*   **Cellular Peroxidation Index (CPI)**: Computes weighted susceptibility of membrane lipids containing bis-allylic carbons:
    $$\text{CPI} = 0.014 \times \% \text{mono} + 1.0 \times \% \text{di} + 2.0 \times \% \text{tri} + 3.2 \times \% \text{tetra} + 4.0 \times \% \text{penta} + 5.4 \times \% \text{hexa}$$
*   Higher scores indicate higher concentration of bis-allylic carbons (specifically in arachidonoyl/adrenoyl tails), reflecting extreme susceptibility to GPX4-inhibitor-induced ferroptotic rupture.

### C. M1/M2 Phenotypic State Diagram
*   Maps transitions between neutral lipid storage (M1-like) and membrane structural/ether complexity (M2-like) as percentages of total lipids:
    *   **M1 Storage Index (%)**: sum of TGs, DGs, CEs as a percentage of total lipids.
    *   **M2 Structural Index (%)**: sum of ether lipids (PE_P, PE_E, PC_P, PC_E), sphingomyelins, and ceramides as a percentage of total lipids.
*   Samples are plotted in four quadrants: Top-Left (M1 Storage), Bottom-Right (M2 Structural), Top-Right (Hypertrophic), and Bottom-Left (Undifferentiated).
*   **PCA-Style Multi-Variable Coloring & Shaping Controls**:
    *   *Color Samples By*: Checkbox group supporting single or composite cohort coloring (`Group1`, `Group2`, `TimePoint`, `PatientNumber`). Palettes synchronize automatically with `global_color_map` and PCA Score Plot.
    *   *Override Sample Colors*: Optional toggle revealing live color pickers for custom group hex codes.
    *   *Shape Samples By*: Toggle different geometric shapes (`Circle`, `Square`, `Triangle`, `Diamond`, `Plus`, `Cross`, `Star`) mapped to metadata factors, with shape synchronization across the app.
    *   *Configurable Sample Labels*: When *Show Sample Labels* is checked, select combinations of `Group1`, `Group2`, `Replicate`, `TimePoint`, and `PatientNumber` to construct clear annotations using `ggrepel`.

### D. WYSIWYG Downloads & Stats Integration
*   **Resizable Containers**: All plots are wrapped in `jqui_resizable()`.
*   **WYSIWYG PDFs**: Clicking the **PDF** buttons downloads plots using the exact dimensions observed in the browser (rescaled by dividing pixels by 72 DPI).
*   **Show Statistic Detail**: Calculates organelle stress indices and formats a mathematical report displayed directly in the closable **Statistics Console Modal Overlay** on top of the active cellular organization view.

---

## 9. Longitudinal Trajectories & Temporal Dynamics

The **Longitudinal** module models dynamic temporal profiles across sequential timepoints, tracking alterations across lipid categories, main classes, functional indices, and individual species.

### 4-Tier Nomenclature Architecture
The module strictly adheres to the platform-standard 4-tier lipid hierarchy:
*   **Lipid Categories (Tier 1)**: Visualizes trajectories for primary lipid categories (Glycerophospholipids, Sphingolipids, Glycerolipids, Sterol Lipids, Fatty Acyls).
*   **Lipid Main Classes (Tier 2)**: Tracks 21 parent classes (PC, PE, PI, PS, Cer, SM, TAG, DAG, etc.) across timepoints.
*   **Functional Indices**: Tracks functional indicators such as unsaturation indices, chain length averages, and organelle stress metrics.
*   **Structural Features & All Metrics**: Evaluates carbon length, double bond distributions, and comprehensive individual lipid timecourses.

### Trajectory Controls & Pairing
*   **Timecourse Designer**: Define sequential timepoint series (e.g. Day 0 $\rightarrow$ Day 3 $\rightarrow$ Day 7).
*   **Cohort & Patient Faceting**: Switch between single-cohort views and comparative multi-cohort grids.
*   **Complete-Case Pairing**: Applies strict paired calculus for timepoint transitions, calculating paired differences ($d_i = Y_{i,t2} - Y_{i,t1}$) with parametric (Paired Student's $t$-test) or non-parametric (Wilcoxon Signed-Rank) testing.

---

## 10. Differential Expression Guidance & Interactive Triggers

Across downstream comparative analysis modules (Volcano Plot, LSEA, Structural Ensembles, Heatmap, Barchart, and Metabolic Pathways), when differential expression has not yet been executed:
*   **Inline Differential Expression Setup Banner**: An alert card appears providing direct inline selection of comparison **Mode** (`Direct` / `Interaction`), **Reference** cohorts, and **Comparison** cohorts, synchronized with the left dock.
*   **Interactive "Show in menu" Button**: Labeled **`Show in menu`**, clicking this button immediately unfolds the main left dock if collapsed, activates the `[Cohorts & Filters]` tab, automatically expands accordion panel **"3. Differential Expression"**, smoothly scrolls to bring the opened menu into prime focus, and emits a glowing visual pulse highlight on the accordion header and selectors to guide comprehensive parameter adjustment.

---

## 11. Main Class Linkage & Acyl Chain Relative Composition

Under the **Structural** module, the **Main Class & Acyl Chain Proportions** sub-tab analyzes the distribution of individual fatty acyl chains across experimental cohorts and lipid main classes.
*   **Proportion & Composition Parameters (Bottom UI)**:
    *   **Grouping Level**: Select between **Lipid Main Class** (classes like PC, PE, PI, PS, or subclass linkages like Diacyl, Ether-O, Plasmalogen-P) and **Lipid Category** (LIPID MAPS categories: Glycerophospholipids `GP`, Sphingolipids `SP`, Glycerolipids `GL`, Sterol Lipids `ST`, Fatty Acyls `FA`). Dynamic selection supports batch `+ Add All` and `Clear Selection`.
    *   **Value Mode**: Choose among 4 standardized calculation methods:
        *   `Absolute (intensity)`: Cumulative raw linear abundance intensity summed across acyl chains.
        *   `Absolute (%)`: Relative percentage composition ($0 - 100\%$) of acyl chains within each class/sample.
        *   `Normalized (intensity)`: Standardized abundance where each lipid species is scaled across cohort samples to sum to 1 before acyl summation.
        *   `Normalized (%)`: Relative percentage composition computed on standardized intensities.
    *   **Replicate Error Bars**: Check `Show Error Bars` to visualize replicate dispersion across samples within cohort groups:
        *   `Error Bar Type`: Choose between **Total Bar** (single cumulative error bar at the end of the stacked bar representing total class abundance variance) and **Individual Segments** (error bars positioned at cumulative segment boundaries representing variance per individual acyl chain).
        *   `Statistical Mode Choice`: Select between **Standard Deviation (SD)** (sample dispersion) and **Standard Error of the Mean (SEM)** ($SD / \sqrt{N}$).
    *   **Acyl Chain Position Breakdown**: Option to display Both Merged, Sn-1 Position Only, Sn-2 Position Only, or Side-by-Side Comparison (Sn-1 vs Sn-2).
    *   **Multi-Class Layout**: Choose between Merged (single combined barplot) and Stacked Vertically (individual per-class facets).
    *   **Color Customization & Overrides**: Accordion panel allowing real-time color picking and overriding for individual acyl chains with Apply and Reset buttons.
*   **Interactive Cursor-Tracking Hover Legend**: Hovering over any slice or segment in the stacked proportion chart displays a real-time floating legend card directly at the cursor:
    *   **Color Swatch & Chain Name**: Instant visual identification of the hovered acyl chain (e.g., `16:0`, `18:1`, `20:4`, or `Other`) with its exact determined color badge.
    *   **Relative Proportion & Value**: High-contrast readout of relative composition percentage (e.g., `28.4% relative composition`) or mean abundance, including variance bounds ($\pm \text{SD}$ or $\pm \text{SEM}$) when error bars are enabled.
    *   **Contextual Metadata**: Sample replicate / cohort group, lipid subclass/class, sn position (`sn-1` or `sn-2` in side-by-side mode), and mean linear abundance intensity.
    *   **Intelligent Boundary Positioning**: Automatically flips leftward when the cursor approaches the right container boundary, avoiding overflow.
*   **Full-Width Responsive Interface**: The barplot automatically occupies 100% of the available interface width from initial render and across all tab switches.
*   **Dual Drag & Drop Resizing Handles**:
    *   **Bottom Splitter Bar (`.ui-resizable-s`)**: Drag vertically to expand or contract plot height. Features a central pill grip that highlights in blue on hover.
    *   **Corner Drag Anchor (`.ui-resizable-se`)**: Positioned at the bottom-right corner with a high-contrast chevron grip (`scale(1.2)` on hover in Electric Cobalt) for bidirectional free-form resizing.
*   **Adaptive Auto-Scaling**: Stacked multi-class displays automatically scale vertically (`320px` per class, minimum `650px`) while seamlessly respecting manual drag adjustments.




