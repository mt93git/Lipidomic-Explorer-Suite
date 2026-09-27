# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

