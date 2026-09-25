@echo off
rem Double-click to open the OTRI Scoring Lab in your browser. Close this window to stop it.
title OTRI Scoring Lab
cd /d "%~dp0.."
where python >nul 2>nul
if %errorlevel%==0 (python -m scoring_lab serve %*) else (py -3 -m scoring_lab serve %*)
if errorlevel 1 pause
