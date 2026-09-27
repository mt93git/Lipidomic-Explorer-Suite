@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

:: Change directory to the project root directory
cd /d "%~dp0\..\.."

echo ========================================================
echo   Lipidomic Explorer Bootstrap & Launcher (Windows)
echo ========================================================
echo.

call :WRITE_LOG "--- Launcher session started ---"

:: 1. Purge sandboxed renv files first to prevent R startup crashes
del /f /q renv.lock 2>nul
rd /s /q renv 2>nul
call :WRITE_LOG "Purged legacy renv artifacts."

:: 2. Rtools Environment Audit
SET "R_FORCE_BINARY=FALSE"
SET "RTOOLS_FOUND="

:: Check standard directories
FOR %%D IN (C:\rtools44 C:\rtools43 C:\rtools42 C:\rtools40) DO (
    IF EXIST "%%D\usr\bin\make.exe" (
        SET "RTOOLS_FOUND=TRUE"
        call :WRITE_LOG "Detected Rtools compiler toolchain at %%D"
    )
)

:: Check registry for Rtools
IF NOT DEFINED RTOOLS_FOUND (
    FOR /F "tokens=2*" %%A IN ('REG QUERY "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "Rtools" 2^>nul ^| findstr "HKEY"') DO (
        SET "RTOOLS_FOUND=TRUE"
    )
)

IF NOT DEFINED RTOOLS_FOUND (
    call :WRITE_LOG "Rtools compiler toolchain is missing. Enforcing binary-only packages."
    SET "R_FORCE_BINARY=TRUE"
) else (
    call :WRITE_LOG "Rtools compiler toolchain detected. Compiler enabled."
)

:: 3. Auto-Detect R Path via Registry (System and User levels)
:DETECT_R
SET "R_PATH="

:: Try HKCU (User-specific) first (in case it was installed for the current user)
FOR /F "tokens=2*" %%A IN ('REG QUERY "HKCU\Software\R-core\R" /s /v "InstallPath" 2^>nul ^| find "InstallPath"') DO (
    IF EXIST "%%B\bin\x64\Rscript.exe" (
        SET "R_PATH=%%B"
    ) ELSE IF EXIST "%%B\bin\Rscript.exe" (
        SET "R_PATH=%%B"
    )
)

:: Try HKLM (System-wide) if HKCU is empty or invalid
IF "%R_PATH%"=="" (
    FOR /F "tokens=2*" %%A IN ('REG QUERY "HKLM\Software\R-core\R" /s /v "InstallPath" 2^>nul ^| find "InstallPath"') DO (
        IF EXIST "%%B\bin\x64\Rscript.exe" (
            SET "R_PATH=%%B"
        ) ELSE IF EXIST "%%B\bin\Rscript.exe" (
            SET "R_PATH=%%B"
        )
    )
)

:: Common user-level default path checks if registry fails (per-user silent installs default here)
IF "%R_PATH%"=="" (
    FOR /D %%P IN ("%LOCALAPPDATA%\Programs\R\R-*") DO (
        IF EXIST "%%P\bin\x64\Rscript.exe" (
            SET "R_PATH=%%P"
        )
    )
)

:: Common system-level default path checks if registry fails
IF "%R_PATH%"=="" (
    FOR /D %%P IN ("C:\Program Files\R\R-*") DO (
        IF EXIST "%%P\bin\x64\Rscript.exe" (
            SET "R_PATH=%%P"
        )
    )
)

:: Verify detected R version is >= 4.4.0
IF "%R_PATH%"=="" goto :R_CHECK_DONE

SET "RSCRIPT=%R_PATH%\bin\x64\Rscript.exe"
IF NOT EXIST "!RSCRIPT!" (
    SET "RSCRIPT=%R_PATH%\bin\Rscript.exe"
)

"!RSCRIPT!" --vanilla -e "if(getRversion()<'4.4.0')cat('OUTDATED')" > "%TEMP%\r_version_check.txt" 2>nul
SET "R_CHECK="
IF EXIST "%TEMP%\r_version_check.txt" (
    SET /P R_CHECK=<"%TEMP%\r_version_check.txt"
    DEL "%TEMP%\r_version_check.txt" 2>nul
)

IF NOT "!R_CHECK!"=="OUTDATED" goto :R_CHECK_DONE

call :WRITE_LOG "Detected R version is older than 4.4.0: !R_PATH!. Upgrading..."
SET "R_PATH="

:R_CHECK_DONE

IF NOT "%R_PATH%"=="" goto :R_DETECTED

call :WRITE_LOG "R installation not found or outdated (requires R >= 4.4.0)."
echo [INFO] Attempting to download and install R automatically (current user mode)...
echo        This may take a couple of minutes. Please wait...
echo.

call :WRITE_LOG "Downloading R installer..."
REM Run PowerShell to fetch release page using TLS 1.2, extract R-latest link, download, and install silently
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $html = Invoke-WebRequest -Uri 'https://cloud.r-project.org/bin/windows/base/release.html' -UseBasicParsing; if ($html.Content -match 'R-[0-9\.]+-win\.exe') { $url = 'https://cloud.r-project.org/bin/windows/base/' + $Matches[0]; $tempExe = Join-Path $env:TEMP 'R-installer.exe'; Write-Host 'Downloading R from' $url '...'; try { Start-BitsTransfer -Source $url -Destination $tempExe -ErrorAction Stop } catch { Write-Host 'BITS transfer failed. Falling back to Invoke-WebRequest...'; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri $url -OutFile $tempExe }; Write-Host 'Installing R silently...'; Start-Process -FilePath $tempExe -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER' -Wait; Remove-Item -Path $tempExe -Force; Write-Host 'R installed successfully.' } else { Write-Error 'Failed to parse R version from CRAN release page'; exit 1 }"

if !ERRORLEVEL! NEQ 0 (
    call :WRITE_LOG "Automatic R installation failed."
    echo.
    echo [ERROR] Automatic R installation failed.
    echo         Please verify your internet connection or install R manually by visiting:
    echo         https://cloud.r-project.org/bin/windows/base/
    pause
    exit /b 1
)

call :WRITE_LOG "R installation finished. Re-detecting installation path..."
goto :DETECT_R

:R_DETECTED
call :WRITE_LOG "Selected R installation: !R_PATH!"

:: 4. Execute Bootstrap Installer and Launch Shiny App
SET "RSCRIPT=%R_PATH%\bin\x64\Rscript.exe"
IF NOT EXIST "%RSCRIPT%" (
    SET "RSCRIPT=%R_PATH%\bin\Rscript.exe"
)

call :WRITE_LOG "Executing 00_ENVIRONMENT_SETUP.R..."
"%RSCRIPT%" --vanilla "00_ENVIRONMENT_SETUP.R"

if %ERRORLEVEL% NEQ 0 (
    call :WRITE_LOG "Bootstrapping failed with exit code: %ERRORLEVEL%"
    echo.
    echo [ERROR] Bootstrapping failed. Check local install_log.txt for details.
    pause
    exit /b 1
)

call :WRITE_LOG "Launcher session completed successfully."
echo.
echo [INFO] Process complete.
pause
exit /b 0

:WRITE_LOG
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Content -Path 'install_log.txt' -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [LAUNCHER] ' + '%~1'); Write-Host ('[LAUNCHER] ' + '%~1')"
goto :EOF
