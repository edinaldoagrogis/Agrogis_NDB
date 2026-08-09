@echo off
echo ====================================================
echo      INICIANDO GEOPORTAL - NDB HOLDING AGRICOLA
echo ====================================================
echo.
echo Processando novas camadas (arquivos .geojson)...
echo.

powershell.exe -ExecutionPolicy Bypass -File "%~dp0update_layers.ps1"

echo.
echo Abrindo o portal no Desktop App Nativo...
python "%~dp0desktop_app.py"
