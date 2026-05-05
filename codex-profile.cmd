@echo off
if not defined CP_PROFILES_DIR set "CP_PROFILES_DIR=%~dp0profiles"
node "%~dp0bin\codex-profile.js" %*
