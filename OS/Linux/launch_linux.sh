#!/bin/bash

# Change directory to the parent folder (project root) containing this script
cd "$(dirname "$0")/../.."

echo "========================================================"
echo "  Lipidomic Explorer Bootstrap & Launcher (Linux)"
echo "========================================================"
echo

# 1. Purge sandboxed renv files first to prevent R startup crashes
rm -f renv.lock
rm -rf renv

# 2. Cascading Auto-Detect for Rscript
RSCRIPT_PATH=""

if command -v Rscript >/dev/null 2>&1; then
    RSCRIPT_PATH=$(which Rscript)
elif [ -f "/usr/bin/Rscript" ]; then
    RSCRIPT_PATH="/usr/bin/Rscript"
elif [ -f "/usr/local/bin/Rscript" ]; then
    RSCRIPT_PATH="/usr/local/bin/Rscript"
fi

if [ -z "$RSCRIPT_PATH" ]; then
    echo "[ERROR] R installation not found on this Linux system."
    echo "        Please install R using your package manager (e.g., sudo apt install r-base)."
    exit 1
fi

echo "[INFO] Detected Rscript at: $RSCRIPT_PATH"
echo "[INFO] Invoking environment bootstrapping (vanilla mode)..."
echo

# 3. Execute Bootstrap Installer
"$RSCRIPT_PATH" --vanilla "00_ENVIRONMENT_SETUP.R"

if [ $? -ne 0 ]; then
    echo
    echo "[ERROR] Bootstrapping failed. Check local install_log.txt for details."
    read -p "Press Enter to exit..."
    exit 1
fi

echo
echo "[INFO] Process complete."
