# Two-block consolidation (local review candidates)

Block A targets integration/libreros-guided-workflow. It contains the shared preparation, metadata, archive, CSV and statistical utilities, Classic adapters, compatibility fixes and CI/test runner. No Team frontend or www/team assets are included. Classic is the default; selecting Team without Block B fails with an actionable error.

Block B targets the Block A candidate. It adds R/frontends/team and www/team only for presentation, plus presentation tests and documentation. Both interfaces instantiate the same shared_data_server and scientific modules. Team confirmation and inference gates remain in the shared contract; the frontend does not implement a second scientific pipeline.

Private study shortcuts and the obsolete saved bone sensitivity-study panel have been removed, not migrated into a hidden default. Metadata labels remain exactly as supplied. Optional server workbooks still require LIPIDOMIC_LOCAL_WORKBOOK_DIR and stay confined to that directory. The prototype guided_shared files, their obsolete test, duplicate cell assets and unused duplicate Classic logos are removed from the consolidated additions.

Tests run separately on A and A+B. Both compare against the same pinned scientific baseline and proof artifacts. These candidates do not deploy, migrate a database, create PRs, or close superseded PRs. The repository's main and existing PR #5 remain untouched. Max's interactive RStudio acceptance precedes any future release decision.
