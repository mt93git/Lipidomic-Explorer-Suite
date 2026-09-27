# Contributing to Global Lipidomics Explorer

Thank you for your interest in contributing to the **Global Lipidomics Explorer**! We welcome contributions from researchers, bioinformaticians, and software engineers to enhance features, improve performance, and expand multi-omics compatibility.

---

## 1. Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to `mtricaud.cetri@gmail.com`.

---

## 2. Getting Started

1. **Fork the Repository** on GitHub:
   `https://github.com/Farese-Walther-Lab/Global_Lipidomics_Explorer`
2. **Clone your fork locally**:
   ```bash
   git clone https://github.com/<your-username>/Global_Lipidomics_Explorer.git
   cd Global_Lipidomics_Explorer
   ```
3. **Bootstrap the Environment**:
   Launch R or RStudio and source the setup script to configure your local sandboxed library:
   ```R
   source("00_ENVIRONMENT_SETUP.R")
   ```

---

## 3. Development Guidelines & Architecture

For comprehensive developer specifications, please read [docs/06_developer_contributing_guide.md](docs/06_developer_contributing_guide.md).

Key architectural conventions:
* **Centralized Data Hub**: All reactive data streams originate in `R/modules/1_shared_data_module.R`. Downstream modules are read-only spokes.
* **Global Color Store**: All visual elements must bind to `shared_data$global_color_map()` to maintain aesthetic synchronization across tabs.
* **WYSIWYG Resizability**: All visual canvas elements must support interactive resize handles (`jqui_resizable()`).

---

## 4. Verification & Testing Protocol

Before submitting a Pull Request, verify that all local test suites pass cleanly:

1. **AST Syntax Audit**:
   ```bash
   Rscript --vanilla tests/test_recursive_syntax.R
   ```
2. **Session Persistence Roundtrip**:
   ```bash
   Rscript --vanilla tests/test_restore_helper.R
   ```
3. **Pathway Metabolic Logic**:
   ```bash
   Rscript --vanilla tests/test_pathway_logic.R
   ```
4. **Statistical & Mathematical Engine**:
   ```bash
   Rscript --vanilla tests/test_statistical_engine.R
   ```
5. **Targeted Fallback Simulation**:
   ```bash
   Rscript --vanilla tests/test_targeted_fallback_simulation.R
   ```

---

## 5. Submitting Pull Requests

1. Create a feature branch (`git checkout -b feature/my-new-feature`).
2. Commit your changes with clear, descriptive commit messages.
3. Push to your branch (`git push origin feature/my-new-feature`).
4. Open a Pull Request on GitHub against the `main` branch.
5. Complete the checklist provided in the pull request template.

For questions or assistance with contributions, please contact the maintainers at `mtricaud.cetri@gmail.com`.
