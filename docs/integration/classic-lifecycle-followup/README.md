# Classic restoration and QC lifecycle follow-up

This isolated candidate addresses Max's remaining Block A lifecycle/caption corrections on top of `d06b14abe767127842fbe7da3ba23871350c1cf2`. It is not the final zero-Team-assets extraction of Block A: Team files inherited from the existing combined candidate remain in the base tree. This diff adds no Team assets. No PR is created or updated, no merge is performed, and no running app is deployed.

## Resulting behavior

- Classic retains archived input values during restoration. After restoration, each lazily accessed archived key hydrates once. The ledger observes the corresponding client input: an exact value, its first arrival, or a change from the pre-render value releases the seed. This also supports controls that intersect unavailable choices or normalize their values. Re-rendering then uses the caller's current/default value instead of resurrecting the archive. Ordered selections retain their sequence. Seeds survive repeated renders before a corresponding client response, even for callers with a fixed default; live and intentional empty selections then win. The acknowledgement ledger is session-local, non-reactive and reset for each restore generation. Unopened tabs retain their keys until first access. Team retains its existing restoration/review behavior.
- Fresh Classic uploads, removal/reset of uploaded workbooks, and restore-stage failures discard stale archived control seeds. A rejected ZIP does not advance Classic restore generation or reactivate seeds from a prior archive. Re-running QC preserves unopened lazy tabs.
- Quality Check → Plot Controls → **1. Data processing and PCA** contains a Classic-only preparation notice and **Run Analysis / Re-run Pipeline** action when preparation is pending. It reports applied normalization, imputation and detection independently from draft controls. The action invokes the same shared callback as Pipeline; it does not create another preparation engine or change authorization gates.
- Classic's preparation summary names **Re-run Pipeline**. QC/PCA captions describe the applied preparation and no longer reference Team's methods record. Team captions remain unchanged.

## Review focus

1. Restore a ZIP automatically in Classic with Violin/Composition tabs unopened. Open each, change feature/display settings, revisit and trigger a re-render. Archived choices should hydrate once, then stop overriding live choices.
2. In QC, change normalization, imputation or minimum detection. The notice should distinguish pending controls from the applied run. Use the local rerun action; confirm preparation revision changes once and ZIP/publication export is available again after success.
3. Restore again, replace a workbook and test an invalid archive. Previous archived widget seeds must not leak across those operations.
4. Confirm Team still requires its study-design review and explicit preparation; Classic-only QC actions must not appear there.

## Reproduction

No dependencies are installed by these tests. Use the project's existing complete R environment, including variancePartition, and disable automatic installs:

```sh
LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL=1 Rscript --vanilla tests/dual-ui/test_classic_restored_input_reader.R
LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL=1 Rscript --vanilla tests/dual-ui/test_classic_block_a_lifecycle.R
LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL=1 Rscript --vanilla tests/dual-ui/test_classic_qc_quick_apply.R
LIPIDOMIC_DISABLE_DEPENDENCY_INSTALL=1 Rscript --vanilla tests/dual-ui/run_acceptance.R /absolute/path/to/pinned-baseline /absolute/path/to/new-evidence-directory
```

The ZIP tests use the repository's synthetic abundance/metadata fixtures and actual export/import handlers. The QC test instantiates both actual modules and their settings bridge, activates `qc-applyClassicPreparation`, and checks one shared run plus the applied settings. It is a server integration test, not a claim of interactive browser/RStudio verification.

Evidence and the independent Opus review are recorded separately at the exact product revision. Historical CI logs do not constitute CI validation of this candidate. The requested A/B consolidation, asset licensing/cleanup and study-specific shortcuts belong to subsequent work.
