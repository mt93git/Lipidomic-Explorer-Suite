# Developer Contributing & Architecture Guide

This document outlines the codebase conventions, design patterns, testing standards, and development guidelines for engineers contributing to **Global Lipidomics Explorer**.

---

## 1. Architectural Patterns

### Hub-and-Spoke Reactive Design
* **The Hub** ([`R/modules/1_shared_data_module.R`](../R/modules/1_shared_data_module.R)): Owns raw and processed abundance matrices (`data_processed()`), metadata tables (`all_metadata()`), and annotations.
* **The Spokes** (`2_qc_boxplot_module.R`, `4_heatmap_module.R`, `5_barchart_module.R`, etc.): Read-only subscribers to the Hub's reactives.
* **Downstream Parameter Passing**: If a spoke's controls affect dataset parameters (such as outlier flagging in QC), it must pass configuration reactives back to the Hub via its return list.

### Centralized Aesthetic Store
* Always bind plot fills, lines, and point aesthetics to `shared_data$global_color_map()`.
* Never hardcode hex colors or define custom localized color palettes in individual modules without integrating with the global color store.

### Resizable Canvas Protocol (WYSIWYG)
* Wrap all primary visualization containers in `shinyjqui::jqui_resizable()`.
* PDF download handlers must read the client-side container dimensions and divide pixel counts by 72 DPI to generate exact what-you-see-is-what-you-get vectorized output.

---

## 2. Directory Layout & Key Modules

```
├── 00_ENVIRONMENT_SETUP.R       # Platform router for bootstrapping
├── 01_RUN_APP.R                 # Platform router for Shiny app
├── 02_DIAGNOSTIC_REPORT.R       # Environment audit & diagnostic tool
├── app.R                        # App entry point
├── DESCRIPTION                  # R dependency declarations
├── OS/                          # Platform-specific native launchers
│   ├── Linux/
│   ├── macOS_AppleSilicon/
│   ├── macOS_Intel/
│   └── Windows/
├── R/                           # Core R codebase
│   ├── global.R                 # Global library imports & source calls
│   ├── server.R                 # Main Shiny server function
│   ├── ui.R                     # Main Shiny UI definition
│   ├── utils_*.R                # General helper utilities
│   └── modules/                 # Modular Shiny components (1 to 99)
├── tests/                       # Automated test suites
├── docs/                        # Technical specifications
└── demo_data/                   # Sample datasets for verification
```

---

## 3. Code Quality & Linter Standards

* **R Code Style**: Follow the tidyverse style guide where feasible.
* **Safe Regex**: When parsing complex lipid strings, use standard regex or robust extraction helpers to avoid infinite back-tracking.
* **Linting**: Audited via `.lintr` using `lintr::lint_dir(".")`.

---

## 4. Testing & Verification Requirements

Every Pull Request must pass the full local test suite before merging:

```bash
# 1. AST Syntax Audit across all R files
Rscript --vanilla tests/test_recursive_syntax.R

# 2. Session Persistence Deserializer Test
Rscript --vanilla tests/test_restore_helper.R

# 3. Lipid Metabolic Pathway Logic Test
Rscript --vanilla tests/test_pathway_logic.R

# 4. Statistical & Mathematical Engine Test
Rscript --vanilla tests/test_statistical_engine.R

# 5. Targeted Fallback Simulation Test
Rscript --vanilla tests/test_targeted_fallback_simulation.R
```

---

## 5. Contact & Support

For architectural questions or guidance on developing new modules, please contact the maintainer at `mtricaud.cetri@gmail.com`.
