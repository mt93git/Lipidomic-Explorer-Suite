# Diagnostic Procedures & Troubleshooting History

This document catalogs troubleshooting procedures, known environment quirks, and diagnostic protocols for maintaining and operating **MT_Global_Lipidomic_Explorer**.

---

## 1. Automated Diagnostic Protocol

When diagnosing runtime issues, library mismatches, or system incompatibilities, execute the system diagnostic script:

```bash
Rscript --vanilla 02_DIAGNOSTIC_REPORT.R
```

This generates a structured report verifying:
1. Operating System, Release, and User Architecture.
2. Active `.libPaths()` priority order.
3. Detection of stale compilation locks (`00LOCK`).
4. Installation status and exact disk versions of all critical dependencies.

---

## 2. Common Environment Issues & Solutions

### A. Corporate Firewalls & SSL Handshake Failures
* **Symptom**: `download.file` fails with SSL certificate validation errors during package downloads.
* **Resolution**: The bootstrapper injects `download.file.extra = "-k"` and routes all CRAN package queries through the Posit Package Manager (PPM) endpoint (`https://packagemanager.posit.co/cran/latest`), which provides precompiled binaries.

### B. Bioconductor Repository Restrictions
* **Symptom**: `bioconductor.org` domain is blocked by institutional network filters.
* **Resolution**: Set `options(BioC_mirror = "https://bioconductor.posit.co")` in R before installing Bioconductor packages. This redirects to precompiled binary zip files on Windows without requiring Rtools compiler utilities.

### C. Cloud Storage Write-Locks (OneDrive, iCloud, Google Drive)
* **Symptom**: R package installation or DLL loading errors due to file locking by cloud synchronization engines.
* **Resolution**: All packages are installed into local sandboxed directories outside cloud-synced folders:
  * **macOS**: `~/Library/R/LipidomicExplorer_Library/<R_VER>_<ARCH>`
  * **Windows**: `%LOCALAPPDATA%/LipidomicExplorer_R_Library/<R_VER>`
  * **Linux**: `~/.R/LipidomicExplorer_Library/<R_VER>`

### D. Xcode Command Line Tools Missing (macOS)
* **Symptom**: Source packages fail to compile on clean macOS machines.
* **Resolution**: Launcher scripts check `xcode-select -p`. If missing, `R_FORCE_BINARY="TRUE"` is enforced automatically to ensure only pre-built binary packages from Posit are downloaded.

### E. Stale Package Lockfiles (`00LOCK`)
* **Symptom**: Package installation halts with `ERROR: failed to lock directory ... for modifying`.
* **Resolution**: Run `02_DIAGNOSTIC_REPORT.R` to identify lockfile locations, then manually remove the `00LOCK*` directories from the sandboxed library folder.

---

## 3. Session Deserialization Safeguards

* **`[object Object]` Prevention**: When restoring state from JSON, all widget updates ending with `_json` are explicitly passed through `jsonlite::toJSON()` before being sent to text inputs.
* **Order of Execution**: UI hydration follows a strict 4-stage sequential flush cycle (`session$onFlushed()`) to prevent out-of-order reactive invalidations during session restores.
