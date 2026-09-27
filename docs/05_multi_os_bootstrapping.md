# Automated Package Bootstrapping and Library Path Isolation

This document describes the environment setup routing, isolated library paths, and mirror configurations that enable zero-configuration deployments.

---

## 1. Bootstrapping Strategy

To ensure zero-configuration deployment across clean Windows, macOS, and Linux environments without requiring administrator privileges, the app uses an automated bootstrapping script ([00_ENVIRONMENT_SETUP.R](../00_ENVIRONMENT_SETUP.R)).

### Working Directory Auto-Resolution
To handle working directory issues when launching scripts from subfolders, the loader resolves the parent project directory using `sys.frame(1)$ofile` or RStudio's API context, automatically setting it as the active working directory.

---

## 2. Isolated Library Path Configuration

To prevent conflicts with pre-existing system-wide packages and bypass cloud-synchronization write-locks (e.g., OneDrive or iCloud file write-locks during active R processes), the bootstrapper creates isolated sandbox library directories:
*   **Windows**: `%LOCALAPPDATA%/LipidomicExplorer_R_Library/<R_VERSION>`
*   **macOS**: `~/Library/R/LipidomicExplorer_Library/<R_VERSION>_<ARCHITECTURE>` (e.g., `_arm64` or `_x86_64`)
*   **Linux**: `~/.R/LipidomicExplorer_Library/<R_VERSION>`

At startup, the bootstrapper runs:
```R
.libPaths(c(sandbox_path, .Library))
```
This forces the sandboxed directory to take precedence, isolating package management entirely within the application space.

---

## 3. Disk-Level Version Auditing

Standard package checks (e.g., `system.file()`) only confirm package existence. To prevent runtime failures caused by outdated sandboxed dependencies, a custom validator (`is_package_installed()`) parses package DESCRIPTION files directly from disk without loading their namespaces into memory. Outdated dependencies are flagged and upgraded automatically.

---

## 4. Corporate Network Handling (Windows & Corporate Proxies)

Corporate proxies and firewall rules frequently restrict access to standard R repositories or block compilation commands when compiler utilities (like Rtools) are missing. The loader addresses this using:

### A. Posit Package Manager (PPM) for CRAN
*   **URL**: `https://packagemanager.posit.co/cran/latest`
*   **Purpose**: Serves as the primary CRAN repository. This endpoint is widely whitelisted in corporate environments and serves precompiled binary packages, skipping local compilation phases.

### B. Posit Bioconductor File Mirror
*   **URL**: `https://bioconductor.posit.co`
*   **Configuration**: `options(BioC_mirror = "https://bioconductor.posit.co")`
*   **Purpose**: Redirects Bioconductor package installations away from the blocked `bioconductor.org` domain. Unlike Posit Package Manager, which serves Bioconductor packages as source-only on Windows, the direct Posit file mirror hosts precompiled Windows binary `.zip` packages, enabling compilation-free installations of specialized packages (e.g. `variancePartition`, `BiocParallel`) when Rtools is not installed.

### C. Insecure SSL/TLS Fallback
*   If an SSL handshake failure occurs behind corporate proxies, the installer injects curl parameters (`download.file.extra = "-k"`) to bypass certificate validation.

---

## 5. Multi-OS Launcher Scripts

Native wrapper launchers reside in the `OS/` subdirectory:
*   **Windows (`OS/Windows/`)**:
    *   `launch_windows.bat`: Spawns a silent PowerShell installer pipeline if no local R runtime is detected (or if R version is `< 4.4.0`). It downloads and deploys R inside local app storage (`%LOCALAPPDATA%/Programs/R`) without triggering UAC administrator prompts.
*   **macOS Intel (`OS/macOS_Intel/`)**:
    *   `launch_macos.command`: Checks for Xcode Command Line Tools and toggles `R_FORCE_BINARY="TRUE"` if missing to bypass source package compilation failures.
*   **macOS Apple Silicon (`OS/macOS_AppleSilicon/`)**:
    *   `launch_macos.command`: Setup wrapper aligned for Apple Silicon ARM64 native builds.
*   **Linux (`OS/Linux/`)**:
    *   `launch_linux.sh`: Headless shell script launcher.
