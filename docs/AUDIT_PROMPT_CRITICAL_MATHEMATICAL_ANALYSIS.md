# Expert Reviewer Prompt: Critical Mathematical & Biostatistical Audit of Global Lipidomics Explorer

> **Instructions for the User**:
> Copy and paste the prompt below into an LLM session (with Claude 3.5 Sonnet, GPT-4o, or Gemini 1.5 Pro) or submit it directly to an external biostatistician, peer reviewer, or methodological auditor along with the companion files:
> 1. Stacked Pipeline Script: [`pipeline_math_proof_stacked.R`](../pipeline_math_proof_stacked.R)
> 2. Raw Matrix (Before): [`docs/proof_artifacts/raw_abundance_before.csv`](proof_artifacts/raw_abundance_before.csv)
> 3. Transformed Matrix (After): [`docs/proof_artifacts/transformed_abundance_after.csv`](proof_artifacts/transformed_abundance_after.csv)
> 4. Transformation Audit Summary: [`docs/proof_artifacts/transformation_audit_summary.csv`](proof_artifacts/transformation_audit_summary.csv)
> 5. Differential Expression Audit: [`docs/proof_artifacts/differential_expression_audit_results.csv`](proof_artifacts/differential_expression_audit_results.csv)
> 6. Organelle Stress & CPI Audit: [`docs/proof_artifacts/organelle_stress_and_cpi_audit.csv`](proof_artifacts/organelle_stress_and_cpi_audit.csv)

---

```markdown
### SYSTEM ROLE & OBJECTIVE
You are acting as an elite Principal Biostatistician, Omics Methodologist, and Peer Reviewer specializing in high-throughput mass spectrometry, lipidomics, and statistical inference.

You have been commissioned to conduct an adversarial, rigorous, and exhaustive mathematical and biostatistical audit of the computational engine powering **Global Lipidomics Explorer (v12.0)**.

Your objective is to critically evaluate:
1. The mathematical validity and theoretical soundness of all statistical algorithms and transformations implemented in `pipeline_math_proof_stacked.R`.
2. The conformity of the bioinformatics pipeline with peer-reviewed literature standards.
3. The empirical behavior of the data transformation by comparing the raw input matrix (`raw_abundance_before.csv`) with the preprocessed matrix (`transformed_abundance_after.csv`) and the audit summary (`transformation_audit_summary.csv`).

---

### REFERENCE LITERATURE BENCHMARKS
Evaluate the codebase and transformations specifically against the following canonical literature:
1. **Left-Censored Missingness & Imputation (QRILC)**:
   - Lazar, C., et al. (2016). "Accounting for the Multiple Natures of Missing Values in Label-Free Quantitative Proteomics/Lipidomics." *Journal of Proteome Research*, 15(4), 1116-1125.
   - Karpievitch, Y. V., et al. (2012). "Normalization and missing value imputation for label-free LC-MS analysis." *Bioinformatics*, 28(20), 2642-2644.
2. **Empirical Bayes Variance Moderation**:
   - Smyth, G. K. (2004). "Linear models and empirical bayes methods for assessing differential expression in microarray experiments." *Statistical Applications in Genetics and Molecular Biology*, 3(1), Article 3.
3. **Multiple Testing Correction & FDR**:
   - Benjamini, Y., & Hochberg, Y. (1995). "Controlling the false discovery rate: a practical and powerful approach to multiple testing." *Journal of the Royal Statistical Society: Series B*, 57(1), 289-300.
4. **Sample-Wise Normalization**:
   - Dieterle, F., et al. (2006). "Probabilistic Quotient Normalization as Robust Method to Account for Dilution of Complex Biological Mixtures." *Analytical Chemistry*, 78(13), 4281-4290.
5. **Lipid Peroxidation & Ferroptotic Kinetics (CPI)**:
   - Kagan, V. E., et al. (2017). "Oxidized arachidonic and adrenic PEs navigate cells to ferroptosis." *Nature Chemical Biology*, 13(1), 81-90.
   - Dixon, S. J., et al. (2012). "Ferroptosis: an iron-dependent form of nonapoptotic cell death." *Cell*, 149(5), 1060-1072.
6. **Organelle Stress & Membrane Curvature Stoichiometry**:
   - Ecker, J., et al. (2012). "Induction of endoplasmic reticulum stress by saturated fatty acids." *Journal of Biological Chemistry*, 287(17), 13575-13588.
   - Volmer, D. A., et al. (2014). "Mass spectrometry of lipid classes and biochemical ratios." *Analytical and Bioanalytical Chemistry*.

---

### KEY METHODOLOGICAL PILLARS TO SCRUTINIZE

#### 1. The 6-Stage Preprocessing Pipeline
Inspect Section 1 & Section 2 of `pipeline_math_proof_stacked.R`:
* **Stage 1 (Zero-to-NA)**: Non-detects and values <= 0 are converted to `NA`. Is treating non-detects as left-censored (MNAR: Missing Not At Random) mathematically justified over Missing At Random (MAR)?
* **Stage 2 (Log2 Transform)**: Intensities are mapped to log2 space ($y = \log_2(x)$). Does this stabilize variance across the dynamic range?
* **Stage 3 (QRILC Imputation)**: Missing values are imputed using Quantile Regression for Left-Censored Data (`imputeLCMD::impute.QRILC`).
  - Does QRILC properly preserve the lower tail without artificially deflating variance or inflating false positives?
  - Does global imputation introduce data leakage across comparison groups?
* **Stage 4 (Median Normalization)**: Sample medians are aligned to the grand median ($y_{\text{norm}} = y - (m_j - M)$). Is this additive adjustment in log2 space mathematically equivalent to multiplicative scaling in linear space?
* **Stage 5 (Restitution to Linear Scale)**: Transformed data is converted back via $2^y$. Does restitution preserve finite biological bounds?

#### 2. Dual-Gate Auto-Routing Differential Expression Engine
Inspect Section 3 of `pipeline_math_proof_stacked.R`:
* **Gate 1: Small-Sample Size Guard ($\min(n_{\text{cohort}}) < 5$)**:
  - The engine forces parametric moderated linear modeling (`limma`) when any cohort has $n < 5$.
  - *Proof Check*: Prove whether the theoretical minimum possible two-tailed Wilcoxon rank-sum p-value for $n_1=3, n_2=3$ is indeed $p_{\min} = 2 / \binom{6}{3} = 0.10$. Demonstrate why applying Benjamini-Hochberg adjustment to rank tests with $n=3$ mathematically guarantees zero statistical discovery ($p_{\text{adj}} < 0.05$).
  - Evaluate whether `limma`'s Empirical Bayes variance shrinkage ($s_0^2, d_0$) adequately restores statistical discovery power in small sample cohorts.
* **Gate 2: Skewness Gate**:
  - The engine computes the Fisher-Pearson moment coefficient of skewness:
    $$\text{Skewness}_i = \frac{\frac{1}{N}\sum_{j=1}^N (y_{ij} - \mu_i)^3}{\sigma_i^3}$$
  - If $\text{Mean Absolute Skewness} > 1.5$ AND $n \ge 5$, it routes to non-parametric tests. Is $1.5$ an appropriate cutoff for lipidomics data?

#### 3. Mathematical Formulations for Cellular Stress & Visualizations
Inspect Section 4 of `pipeline_math_proof_stacked.R`:
* **Cellular Peroxidation Index (CPI)**:
  $$\text{CPI} = 0.014 \times \% \text{mono} + 1.0 \times \% \text{di} + 2.0 \times \% \text{tri} + 3.2 \times \% \text{tetra} + 4.0 \times \% \text{penta} + 5.4 \times \% \text{hexa}$$
  - Verify whether these weight coefficients ($0.014, 1.0, 2.0, 3.2, 4.0, 5.4$) accurately match the kinetic propagation rate constants of hydrogen atom abstraction by peroxyl radicals across mono-, di-, tri-, tetra-, penta-, and hexa-enoic acyl chains.
* **ER Saturation Score**:
  $$\text{Score} = \log_2\left(\frac{\text{SFA-PC} + 1\text{e-}9}{\text{UFA-PC} + 1\text{e-}9}\right)$$
  - Is this symmetric ratio around 0 statistically and biophysically sound for reporting membrane rigidification vs fluidization?
* **Condensed Heatmap Formulas**:
  - Class SD ($C_{\text{SD}}$) vs Class Mean ($C_{\text{mean}}$) vs Z-score ($Z = \frac{y - \mu}{\sigma}$). Do these aggregations introduce Simpson's Paradox or obscure intra-class diversity?

#### 4. Empirical Inspection of the Transformed Data Matrix
Compare `raw_abundance_before.csv` with `transformed_abundance_after.csv` and inspect `transformation_audit_summary.csv`:
* Are the sample medians in `transformed_abundance_after.csv` perfectly equalized?
* Were all 8,442 missing non-detects imputed into plausible lower-quantile ranges without creating negative intensities or NaN/Inf values?
* Is there any sign of batch artifacts, distribution truncation, or numerical instability?

---

### REQUIRED AUDIT REPORT STRUCTURE
Please provide your review in the following formal structure:

1. **Executive Verdict**: (Approved / Conditionally Approved / Methodological Revision Required).
2. **Mathematical Proof Verification**:
   - Formal mathematical derivation of the $n < 5$ non-parametric power collapse under Benjamini-Hochberg.
   - Verification of the Empirical Bayes moderation equations and degrees of freedom.
   - Verification of the CPI rate-weighting coefficients.
3. **Pipeline & Data Transformation Audit**:
   - Assessment of QRILC left-censoring versus alternative imputation models (e.g. k-NN, MissForest, MinProb).
   - Evaluation of median normalization vs PQN in high-density lipidomes.
   - Empirical validation of `raw_abundance_before.csv` vs `transformed_abundance_after.csv`.
4. **Potential Blind Spots & Edge Cases**:
   - Identify any conditions under which these mathematical routines could produce biased estimators, inflated FDR, or numeric overflow.
5. **Concrete Methodological Recommendations**:
   - Specific, prioritized enhancements to strengthen the mathematical rigor for publication in high-impact journals (e.g., *Nature Methods*, *Bioinformatics*, *Cell Metabolism*).
```
