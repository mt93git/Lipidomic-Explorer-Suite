# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [12.1.0] - 2026-09-30

### Added
- **Longitudinal Trajectory Analysis Engine** (`11_longitudinal_module.R`):
  - Longitudinal multi-timepoint analysis across patient cohorts and lipid classes.
  - Granular patient pairing filters: "All Dots (Show all samples)", "Paired in Same Timecourse", and "Paired in All Timecourses".
  - Flexible patient layout options: "Single Plot (All on same X)" vs. "Selected Subgroups Grid".
  - Informative hoverable tooltips (`bslib::tooltip`) embedded on all layout, pairing, and filtering controls.
  - Automated multiline tick label formatter (`format_longitudinal_tick_label`) preventing X-axis label collisions between long group names and timepoint codes.
  - Dedicated bottom control bar for timecourse and patient layout parameters.
- **Single-Lipid Targeted Analysis Mode** (`utils_targeted_lipids.R`):
  - Seamless fallback handling when drilling down to individual lipid species across all downstream analytical modules.
  - Interactive analytical notice banner with direct 1-click action to switch between single-lipid view and class filtering in Cohort & Filter.
- **Top Horizontal Toolbar for Structural Violins** (`8_structural_module.R`):
  - Migrated measurement controls (Log2 Abundance vs. Linear Abundance, Baseline Reference, Plot Height) to a prominent horizontal control panel matching Quantitative Violin standards.
  - Dynamic HEX color override engine allowing custom palette mappings per experimental group.
- **Session Persistence Simulation & Validation Suite** (`tests/test_session_roundtrip_simulation.R`):
  - Automated headless test suite simulating complete 4-stage session persistence serialization, archive compression, isolated extraction, and hydration verification.

### Fixed
- **Longitudinal Plot Framing & Resizing**: Eliminated rigid aspect ratio constraints and conflicting inner DOM resizers, ensuring responsive edge-to-edge rendering without vertical or horizontal clipping.
- **Timecourse Cohort Labeling**: Resolved "Unspecified" nomenclature fallback when longitudinal timecourse attributes are active.
- **Heatmap Legend Granularity in Single Lipid Mode**: Prevented excessive legend clutter by locking legend categories to `Lipid Main Class` or `Lipid Category` rather than individual lipid species.
- **Matrix Conversion in Filtered Views**: Resolved `as.matrix` evaluation error (`.data must be a data frame without row names`) across Heatmap, Composition, Volcano, and LSEA tabs.
- **Custom Violin Color Mapping**: Fixed reactive observer binding preventing custom HEX overrides from applying to violin plot aesthetics.

## [12.0.0] - 2026-09-10

### Added
- **Centralized Data Hub Orchestrator** (`1_shared_data_module.R`): Single source of truth for abundance matrices, metadata alignment, and reactive state management.
- **Automated Missing Value Imputation**: Support for left-censored Gaussian Quantile Regression (QRILC) and zero imputation.
- **Automated Statistical Routing Engine**: Dual-gate decision tree measuring skewness across lipidomes with small-sample size guard ($\min(n) < 5$ preserving `limma` empirical Bayes shrinkage).
- **Cellular Organization & Organelle Stress Module**: Real-time evaluation of ER curvature, ER saturation index, Mitochondrial PG/CL ratios, FAO acylcarnitine stress, Lysosomal BMP mass, and Cellular Peroxidation Index (CPI).
- **Lipid Set Enrichment Analysis (LSEA)**: Hypergeometric pathway enrichment across structural and functional lipid sets.
- **Lipid Metabolic Pathway Network**: Interactive 28-class metabolic network with custom coordinate dragging, saturation ratio overlays, and p-value badge integration.
- **Structural Grid & Fatty Acyl Proportions**: Carbon length vs. double bond grid visualizers, and acyl chain proportion stacked barplots with cursor-tracking floating hover legends.
- **Asynchronous 4-Stage Session Persistence**: Comprehensive session state serialization into ZIP archives with DOM input hydration and backwards compatibility mapping.
- **Multi-OS Sandboxed Deployment Suite**: Zero-configuration bootstrapping on macOS (Apple Silicon / Intel), Windows, and Linux with isolated library paths and Posit mirror fallbacks.
- **Interactive WYSIWYG Plot Resizing**: Responsive container sizing (`jqui_resizable()`) with dynamic DPI-calibrated PDF exports.
