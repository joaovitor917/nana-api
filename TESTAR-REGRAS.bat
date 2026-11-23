@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0testes"

echo.
echo ==========================================================
echo    NANA - Testes das regras de seguranca do Firestore
echo ==========================================================
echo.
echo  Roda num emulador local, na sua maquina.
echo  Nada toca no banco de verdade e nada e cobrado.
echo.

rem ---------------- Node.js ----------------
where node >nul 2>&1
if errorlevel 1 (
  echo  [FALTA] Node.js nao esta instalado.
  echo.
  echo     Baixe a versao LTS em https://nodejs.org
  echo     Instale clicando em Next ate o fim,
  echo     FECHE esta janela e abra este arquivo de novo.
  echo.
  goto :fim
)
for /f "delims=" %%v in ('node --version') do echo  [ok] Node.js %%v

rem ---------------- Java ----------------
rem O emulador do Firebase roda em Java. Procuro nos lugares conhecidos,
rem sem varrer o disco: varredura e lenta e ja travou este script antes.
set "JAVA_DIR="

where java >nul 2>&1
if not errorlevel 1 set "JAVA_DIR=ja esta no sistema"

rem Pasta onde o Android Studio e o IntelliJ baixam os Java deles
if not defined JAVA_DIR for /d %%P in ("%USERPROFILE%\.jdks\*") do if exist "%%~P\bin\java.exe" set "JAVA_DIR=%%~P"

if not defined JAVA_DIR if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_DIR=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JAVA_DIR if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe" set "JAVA_DIR=%LOCALAPPDATA%\Programs\Android Studio\jbr"
if not defined JAVA_DIR if exist "%ProgramFiles%\Java\jdk-21\bin\java.exe" set "JAVA_DIR=%ProgramFiles%\Java\jdk-21"
if not defined JAVA_DIR if exist "%ProgramFiles%\Eclipse Adoptium\jdk-21\bin\java.exe" set "JAVA_DIR=%ProgramFiles%\Eclipse Adoptium\jdk-21"

if not defined JAVA_DIR (
  echo.
  echo  [FALTA] Java nao encontrado.
  echo.
  echo     Procurei em:
  echo       %USERPROFILE%\.jdks
  echo       %ProgramFiles%\Android\Android Studio\jbr
  echo       %LOCALAPPDATA%\Programs\Android Studio\jbr
  echo       %ProgramFiles%\Java
  echo.
  echo     Para descobrir onde esta o seu: Android Studio, menu Help,
  echo     item About. A ultima linha mostra o caminho do Java.
  echo     Mande esse caminho no chat que eu ajusto o script.
  echo.
  goto :fim
)

if not "!JAVA_DIR!"=="ja esta no sistema" (
  set "JAVA_HOME=!JAVA_DIR!"
  set "PATH=!JAVA_DIR!\bin;!PATH!"
)
echo  [ok] Java: !JAVA_DIR!

rem ---------------- Dependencias ----------------
echo.
echo  ---------------------------------------------------------
echo   Instalando dependencias.
echo   Na primeira vez demora alguns minutos. Pode deixar rodando.
echo  ---------------------------------------------------------
echo.
call npm install
if errorlevel 1 (
  echo.
  echo  [ERRO] A instalacao falhou. Copie o texto acima e mande no chat.
  goto :fim
)

rem ---------------- Testes ----------------
echo.
echo  ---------------------------------------------------------
echo   Rodando os 54 testes.
echo   O emulador e baixado na primeira vez, entao demora um pouco.
echo  ---------------------------------------------------------
echo.
call npm test
set RESULTADO=%errorlevel%

echo.
echo ==========================================================
if "%RESULTADO%"=="0" (
  echo   TUDO CERTO. As regras passaram em todos os testes.
) else (
  echo   ALGUM TESTE FALHOU.
  echo   Role a tela para cima, copie as linhas em vermelho
  echo   e mande no chat para eu corrigir a regra.
)
echo ==========================================================

:fim
echo.
pause
