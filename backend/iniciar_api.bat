@echo off
chcp 65001 > nul
title GeoPortal NDB — Servidor de Análise de Satélite

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║   GeoPortal NDB — Detecção de Ervas Daninhas        ║
echo  ║   Servidor de Análise Sentinel-2                     ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: Verifica se Python está instalado
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Python não encontrado! Instale em: https://www.python.org/downloads/
    echo  Pressione qualquer tecla para sair...
    pause > nul
    exit /b 1
)

echo  [✓] Python encontrado.
echo.

:: Verifica e instala dependências
echo  [→] Verificando dependências...
pip show fastapi > nul 2>&1
if %errorlevel% neq 0 (
    echo  [→] Instalando pacotes necessários (primeira vez, pode levar alguns minutos)...
    pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo  [ERRO] Falha ao instalar dependências.
        echo  Pressione qualquer tecla para sair...
        pause > nul
        exit /b 1
    )
    echo  [✓] Dependências instaladas com sucesso!
) else (
    echo  [✓] Dependências já instaladas.
)

echo.
echo  ════════════════════════════════════════════════════════
echo   Servidor iniciado em: http://localhost:8000
echo   Documentação da API:  http://localhost:8000/docs
echo.
echo   MANTENHA ESTA JANELA ABERTA enquanto usa o WebGIS!
echo   Para parar o servidor, pressione CTRL+C
echo  ════════════════════════════════════════════════════════
echo.

:: Inicia o servidor
python main.py

echo.
echo  Servidor encerrado. Pressione qualquer tecla para fechar.
pause > nul
