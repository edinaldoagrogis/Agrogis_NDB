@echo off
echo ====================================================
echo      CONSTRUINDO EXECUTAVEL DO GEOPORTAL
echo ====================================================
echo.
echo [1/3] Instalando PyInstaller...
pip install pyinstaller

echo.
echo [2/3] Compilando o aplicativo...
:: Clean previous build
if exist "build" rmdir /s /q "build"
if exist "dist\GeoPortal" rmdir /s /q "dist\GeoPortal"

:: Run PyInstaller
:: --noconsole prevents the command prompt from appearing
:: --add-data bundles the frontend files into the executable
pyinstaller --name "GeoPortal" -y ^
    --noconsole ^
    --add-data "index.html;." ^
    --add-data "style.css;." ^
    --add-data "*.js;." ^
    --add-data "*.jpg;." ^
    --add-data "*.png;." ^
    --add-data "*.geojson;." ^
    --hidden-import uvicorn ^
    --hidden-import fastapi ^
    --hidden-import pydantic ^
    --hidden-import shapely ^
    --hidden-import numpy ^
    --hidden-import requests ^
    desktop_app.py

echo.
echo [3/3] Build Concluido!
echo O arquivo GeoPortal.exe se encontra na pasta: dist\GeoPortal\
pause
