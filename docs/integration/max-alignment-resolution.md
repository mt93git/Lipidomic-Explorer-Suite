# Max review alignment — 27 October 2026

This follow-up addresses the four issues listed in the final review packet. Changes remain on the local candidate branch; no PR, main update or team deployment is authorized by this note.

## Empty selection
Classic restores Max's compatibility behavior: an empty widget selection and NULL resolve to all numeric sample columns, before QC treatments. The UI states this behavior explicitly. QC removal/averaging is applied afterward; removing every sample produces an error, never an automatic fallback that restores excluded samples. Team retains explicit-none semantics and its design confirmation gate. Identical resolved selections still feed the same scientific engine. Tests cover both policies, unknown IDs and all-samples-removed behavior.

## Reference annotations and PCA
The standalone proof uses the production parser rather than its single-colon stub; parser loading extracts only pure assignments instead of sourcing the full application. Independent named-lipid oracles protect multi-chain semantics. The reference individual-lipid PCA now accepts linear data, applies log2(pmax(x,0)+1) and the 1e-10 variance cutoff, matching Classic. Reference artifacts are regenerated deliberately where scientific definitions changed; matrix preparation references are not casually replaced.

## Team PCA
The default Team Results PCA uses the canonical Classic transformation, cutoff, centering and unit-variance scaling. Explicit log10/linear and centered-only options remain available and correctly labeled. Tests exercise the production reactive with a rectangular matrix containing zeros, an incomplete lipid and a constant lipid, and check scores/loadings/variance. Class-level NIPALS remains distinct.

## CI
The workflow invokes the complete `tests/dual-ui/run_acceptance.R` runner, not the earlier focused subset. It installs declared Imports/Suggests plus statmod as a test dependency, disables user R profiles and live companion AI, and uploads the complete evidence directory even after a failure. A regression checks dependency parsing without installing anything and full-runner/failure-artifact wiring. Local RTX execution and YAML/static validation are not a claim of a completed hosted GitHub Actions run; that still occurs only after authorized publication.

See the updated review package for the frozen tested revision, exact result counts, logs, and remaining device/host/deployment limits.

## Frozen result

Commit `dfcbba4bace5e924a946e9775d37c2c57d314b2c`: **57 acceptance jobs passed, 0 failed** on isolated RTX R 4.4.3. All 36 declared version comparisons are exact; all 19 reference comparisons are now required and match. Annotation disagreements are zero. Raw/prepared reference matrices are unchanged; CPI/stress artifacts intentionally change to the accepted production parser. The default standalone proof also completes successfully from an isolated minimal copy with explicit metadata. The final package retains before/after reference changes and the complete per-job logs.

The complete runner is configured in CI but has not been executed on GitHub because nothing was pushed and no PR was created. The browser screenshots retained in the package are explicitly historical; this follow-up uses production-reactive/server tests rather than claiming a new exhaustive browser audit.
