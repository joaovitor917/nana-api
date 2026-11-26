@echo off
chcp 65001 >nul
setlocal
title Carregando conteudos no banco do Nana
cd /d "%~dp0"

set "CHAVE="
for %%f in ("%~dp0chave\*.json") do set "CHAVE=%%~ff"

if not defined CHAVE (
  if not exist "%~dp0chave" mkdir "%~dp0chave"
  echo.
  echo  Falta a chave de administrador do Firebase. E so na primeira vez:
  echo.
  echo   1. Vai abrir o Console do Firebase em "Contas de servico".
  echo   2. Clique em "Gerar nova chave privada" e confirme.
  echo   3. Salve o arquivo .json baixado na pasta "chave" que vai abrir agora.
  echo   4. Rode este arquivo de novo.
  echo.
  echo  ATENCAO: essa chave da acesso total ao banco. Nao mande para ninguem.
  echo  A pasta "chave" nunca vai para o GitHub.
  start "" "https://console.firebase.google.com/project/nana-5e62a/settings/serviceaccounts/adminsdk"
  start "" "%~dp0chave"
  goto fim
)

echo Usando a chave: %CHAVE%
set "GOOGLE_APPLICATION_CREDENTIALS=%CHAVE%"

cd /d "%~dp0admin"
if not exist node_modules (
  echo Instalando o necessario, so na primeira vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto erro
)

echo.
echo === 1/2  Gravando os conteudos ===
node importar-conteudos.js
if errorlevel 1 goto erro

echo.
echo === 2/2  Publicando regras e indice ===
cd /d "%~dp0testes"
call npx firebase deploy --only firestore
if errorlevel 1 goto erro

echo.
echo Pronto! Os conteudos estao no banco, na colecao "conteudos".
goto fim

:erro
echo.
echo *** Algo deu errado. Tire um print desta janela e mande no chat. ***

:fim
echo.
pause
