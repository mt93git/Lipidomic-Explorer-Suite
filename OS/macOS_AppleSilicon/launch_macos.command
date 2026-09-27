#!/bin/bash

# Change directory to the parent folder (project root) containing this script
cd "$(dirname "$0")/../.."

echo "[LIPIDOMIC EXPLORER] Bootstrap & Launcher (macOS Apple Silicon)"

# 1. Purge sandboxed renv files first to prevent R startup crashes
rm -f renv.lock
rm -rf renv

# 2. Xcode CLI Environment Audit
export R_FORCE_BINARY="FALSE"

if ! xcode-select -p &> /dev/null; then
    echo "[WARN] Xcode Command Line Tools are missing."
    echo "       Enforcing strict binary-only package installations."
    export R_FORCE_BINARY="TRUE"
    
    # Trigger non-blocking AppleScript dialogue alert
    osascript -e 'display alert "Xcode Command Line Tools missing. Enforcing binary package installations. If package compilation fails, please run \"xcode-select --install\" in terminal."' &
fi

# 3. Cascading Auto-Detect for Rscript
RSCRIPT_PATH=""

if command -v Rscript >/dev/null 2>&1; then
    RSCRIPT_PATH=$(which Rscript)
elif [ -f "/usr/local/bin/Rscript" ]; then
    RSCRIPT_PATH="/usr/local/bin/Rscript"
elif [ -f "/Library/Frameworks/R.framework/Resources/bin/Rscript" ]; then
    RSCRIPT_PATH="/Library/Frameworks/R.framework/Resources/bin/Rscript"
fi

if [ -z "$RSCRIPT_PATH" ]; then
    echo "[ERROR] R installation not found on this macOS system."
    echo "        Opening R download page..."
    
    osascript -e 'display alert "R is missing. Opening the official CRAN download page..."'
    open https://cloud.r-project.org/bin/macosx/
    exit 1
fi

echo "[INFO] Detected Rscript at: $RSCRIPT_PATH"
echo "[INFO] Invoking environment bootstrapping (vanilla mode)..."
echo

# 4. Execute Bootstrap Installer and Capture Log Output
"$RSCRIPT_PATH" --vanilla "00_ENVIRONMENT_SETUP.R"

if [ $? -ne 0 ]; then
    echo
    echo "[ERROR] Bootstrapping failed. Check local install_log.txt for details."
    read -p "Press Enter to exit..."
    exit 1
fi

echo
echo "[INFO] Process complete."
