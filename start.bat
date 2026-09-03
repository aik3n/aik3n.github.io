@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js no esta instalado o no esta en PATH.
  echo Instala Node.js LTS desde https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Registry npm usado para esta prueba:
echo https://registry.npmjs.org/
echo.

if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install --registry=https://registry.npmjs.org/
  if errorlevel 1 (
    echo.
    echo No se pudieron instalar las dependencias.
    echo.
    echo Comprueba con:
    echo   npm config get registry
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Arrancando ZeMobida...
echo Cuando aparezca Local, abre esa direccion en el navegador.
echo.
call npm run dev
