// ═══════════════════════════════════════════════════════════════════
// 🌾 MÓDULO: LINHAS DE PLANTIO (Restituição via Ortomosaico)
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://localhost:8000';
    let plantingSessionId = null;
    let plantingFieldsLayer = null;
    let plantingLinesLayer = null;
    let plantingOrthoOverlay = null;
    let pollingInterval = null;

    // Elementos do DOM
    const btn = document.getElementById('tool-planting-lines-btn');
    const panel = document.getElementById('planting-lines-panel');
    const closeBtn = document.getElementById('planting-panel-close');
    const dropzone = document.getElementById('planting-dropzone');
    const fileInput = document.getElementById('planting-file-input');
    const uploadZone = document.getElementById('planting-upload-zone');
    const uploadProgress = document.getElementById('planting-upload-progress');
    const uploadBar = document.getElementById('planting-upload-bar');
    const uploadPercent = document.getElementById('planting-upload-percent');
    const processingArea = document.getElementById('planting-processing-area');
    const statusText = document.getElementById('planting-status-text');
    const statusDetail = document.getElementById('planting-status-detail');
    const processBar = document.getElementById('planting-process-bar');
    const resultsArea = document.getElementById('planting-results-area');
    const resultFields = document.getElementById('planting-result-fields');
    const resultLines = document.getElementById('planting-result-lines');
    const exportBtn = document.getElementById('planting-export-btn');
    const errorArea = document.getElementById('planting-error-area');
    const errorMsg = document.getElementById('planting-error-msg');
    const retryBtn = document.getElementById('planting-retry-btn');

    if (!btn || !panel) {
        console.error("Erro: Botão ou painel de linhas de plantio não encontrado no DOM.");
        return;
    }

    // Toggle painel
    btn.addEventListener('click', () => {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        
        // Fechar outros painéis, se existirem (ex: análise de ervas daninhas)
        const weedPanel = document.getElementById('weed-analysis-panel');
        if (weedPanel && weedPanel.style.display === 'block') {
            weedPanel.style.display = 'none';
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
    });

    // Drag & Drop
    dropzone.addEventListener('click', () => fileInput.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '#00c864';
        dropzone.style.background = 'rgba(0,200,100,0.1)';
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'rgba(0,200,100,0.3)';
        dropzone.style.background = 'rgba(0,200,100,0.03)';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'rgba(0,200,100,0.3)';
        dropzone.style.background = 'rgba(0,200,100,0.03)';
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFileUpload(e.target.files[0]);
    });

    // Retry
    if (retryBtn) {
        retryBtn.addEventListener('click', resetPanel);
    }

    function resetPanel() {
        if (pollingInterval) clearInterval(pollingInterval);
        plantingSessionId = null;
        uploadZone.style.display = 'block';
        uploadProgress.style.display = 'none';
        processingArea.style.display = 'none';
        resultsArea.style.display = 'none';
        errorArea.style.display = 'none';
        uploadBar.style.width = '0%';
        uploadPercent.textContent = '0%';
        processBar.style.width = '0%';
        clearPlantingLayers();
    }

    function clearPlantingLayers() {
        if (!window.map) return;
        
        if (plantingFieldsLayer && window.map.hasLayer(plantingFieldsLayer)) {
            window.map.removeLayer(plantingFieldsLayer);
        }
        if (plantingLinesLayer && window.map.hasLayer(plantingLinesLayer)) {
            window.map.removeLayer(plantingLinesLayer);
        }
        if (plantingOrthoOverlay && window.map.hasLayer(plantingOrthoOverlay)) {
            window.map.removeLayer(plantingOrthoOverlay);
        }
        plantingFieldsLayer = null;
        plantingLinesLayer = null;
        plantingOrthoOverlay = null;
    }

    // Upload com XHR para barra de progresso real
    function handleFileUpload(file) {
        if (!file.name.toLowerCase().match(/\.(tif|tiff)$/)) {
            alert('Por favor, selecione um arquivo GeoTIFF (.tif ou .tiff)');
            return;
        }

        uploadZone.style.display = 'none';
        uploadProgress.style.display = 'block';
        errorArea.style.display = 'none';

        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/ortho/upload`);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                uploadBar.style.width = pct + '%';
                uploadPercent.textContent = pct + '%';
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    plantingSessionId = data.session_id;
                    uploadProgress.style.display = 'none';

                    // Voar para os limites do ortomosaico no mapa
                    try {
                        if (data.bounds && window.map && typeof window.map.fitBounds === 'function') {
                            const b = data.bounds;
                            window.map.fitBounds([
                                [b.south, b.west],
                                [b.north, b.east]
                            ], { padding: [50, 50] });
                        }
                    } catch(e) {
                        console.warn('Não foi possível dar zoom no mapa:', e);
                    }

                    // Iniciar processamento automaticamente
                    startProcessing();
                } catch(e) {
                    showError('Erro ao processar resposta do servidor: ' + e.message);
                }
            } else {
                try {
                    const err = JSON.parse(xhr.responseText);
                    showError(err.detail || 'Erro no upload');
                } catch(e) {
                    showError('Erro no upload: HTTP ' + xhr.status);
                }
            }
        });

        xhr.addEventListener('error', () => {
            showError('Falha na conexão. Verifique se o servidor está rodando (iniciar_api.bat).');
        });

        xhr.send(formData);
    }

    // Iniciar processamento
    async function startProcessing() {
        processingArea.style.display = 'block';
        statusText.textContent = 'Iniciando processamento...';
        statusDetail.textContent = 'Enviando para o servidor';
        processBar.style.width = '0%';

        const spacing = parseFloat(document.getElementById('planting-spacing').value) || 1.5;
        const gsd = parseFloat(document.getElementById('planting-gsd').value) || 3.0;

        try {
            const resp = await fetch(`${API_URL}/ortho/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: plantingSessionId,
                    row_spacing_m: spacing,
                    gsd_cm: gsd
                })
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                showError(err.detail || 'Erro ao iniciar processamento');
                return;
            }

            // Polling de status
            pollingInterval = setInterval(checkStatus, 2000);
        } catch(e) {
            showError('Falha na conexão com o servidor: ' + e.message);
        }
    }

    async function checkStatus() {
        if (!plantingSessionId) return;

        try {
            const resp = await fetch(`${API_URL}/ortho/status/${plantingSessionId}`);
            if (!resp.ok) return;

            const data = await resp.json();
            
            processBar.style.width = data.progress + '%';
            statusText.textContent = data.msg || 'Processando...';

            // Etapas descritivas
            if (data.progress < 40) {
                statusDetail.textContent = 'Etapa 1/3 — Detectando talhões de cana';
            } else if (data.progress < 85) {
                statusDetail.textContent = 'Etapa 2/3 — Restituindo linhas de plantio';
            } else if (data.progress < 100) {
                statusDetail.textContent = 'Etapa 3/3 — Gerando shapefiles';
            }

            if (data.status === 'done') {
                clearInterval(pollingInterval);
                processingArea.style.display = 'none';
                showResults(data.result);
            }

            if (data.status === 'error') {
                clearInterval(pollingInterval);
                processingArea.style.display = 'none';
                showError(data.error || 'Erro desconhecido no processamento');
            }
        } catch(e) {
            // Ignorar erros transitórios de rede
        }
    }

    function showResults(result) {
        resultsArea.style.display = 'block';
        resultFields.textContent = result.num_fields || 0;
        resultLines.textContent = result.num_lines || 0;

        clearPlantingLayers();

        if (!window.map) return;

        // Renderizar talhões (polígonos) no mapa
        if (result.fields && result.fields.features && result.fields.features.length > 0) {
            plantingFieldsLayer = L.geoJSON(result.fields, {
                style: {
                    color: '#00c864',
                    weight: 2.5,
                    fillColor: '#00c864',
                    fillOpacity: 0.08,
                    dashArray: '6, 4'
                },
                onEachFeature: (feature, layer) => {
                    const props = feature.properties || {};
                    const area = props.area_ha ? parseFloat(props.area_ha).toFixed(2) + ' ha' : '';
                    layer.bindTooltip(`Talhão ${props.id || ''} ${area}`, {
                        permanent: false,
                        direction: 'center',
                        className: 'custom-label-tooltip'
                    });
                }
            }).addTo(window.map);
        }

        // Renderizar linhas de plantio no mapa
        if (result.lines && result.lines.features && result.lines.features.length > 0) {
            plantingLinesLayer = L.geoJSON(result.lines, {
                style: {
                    color: '#ffeb3b',
                    weight: 1.2,
                    opacity: 0.7
                }
            }).addTo(window.map);
        }

        // Zoom para resultados
        try {
            if (plantingFieldsLayer && window.map && typeof window.map.fitBounds === 'function') {
                window.map.fitBounds(plantingFieldsLayer.getBounds(), { padding: [50, 50] });
            }
        } catch(e) { console.warn('Não foi possível dar zoom nos resultados:', e); }
    }

    function showError(msg) {
        uploadProgress.style.display = 'none';
        processingArea.style.display = 'none';
        resultsArea.style.display = 'none';
        errorArea.style.display = 'block';
        errorMsg.textContent = msg;
    }

    // Exportar Shapefile
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (!plantingSessionId) return;

            exportBtn.disabled = true;
            exportBtn.textContent = '⏳ Exportando...';

            try {
                const resp = await fetch(`${API_URL}/ortho/export/${plantingSessionId}`);
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    alert(err.detail || 'Erro ao exportar');
                    exportBtn.disabled = false;
                    exportBtn.innerHTML = '📥 Exportar Shapefiles (.shp)';
                    return;
                }

                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'linhas_plantio_cana.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                exportBtn.innerHTML = '✅ Exportado com sucesso!';
                exportBtn.style.background = 'rgba(0,200,100,0.2)';

                // Ortomosaico já foi deletado pelo servidor
                setTimeout(() => {
                    resetPanel();
                    exportBtn.disabled = false;
                    exportBtn.innerHTML = '📥 Exportar Shapefiles (.shp)';
                    exportBtn.style.background = 'linear-gradient(135deg, #00c864, #00965e)';
                }, 3000);
            } catch(e) {
                alert('Erro na exportação: ' + e.message);
                exportBtn.disabled = false;
                exportBtn.innerHTML = '📥 Exportar Shapefiles (.shp)';
            }
        });
    }
});
