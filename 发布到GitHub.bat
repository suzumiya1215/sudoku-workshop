@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   Publish "ShuDu GongFang" to GitHub
echo   ---------------------------------
echo   Need a classic PAT with scopes: repo + admin:public_key
echo   Create it at: https://github.com/settings/tokens/new
echo.
set /p TOK=Paste your token and press Enter: 
if "%TOK%"=="" goto empty
python tools\publish-to-github.py --token %TOK% --repo sudoku-workshop
echo.
pause
exit /b

:empty
echo No token entered.
pause
