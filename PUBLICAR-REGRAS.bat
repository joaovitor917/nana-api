@echo off
chcp 65001 >nul
cd /d "%~dp0testes"
echo Publicando regras e indices do Firestore...
echo.
call npx firebase deploy --only firestore
echo.
pause
