document.addEventListener('DOMContentLoaded', () => {
    const btnImport = document.getElementById('btn-import-pdf');
    const fileInput = document.getElementById('pdf-file-input');
    const loadingIndicator = document.getElementById('pdf-loading-indicator');

    const btnView = document.getElementById('btn-view-pdf');

    if (!btnImport || !fileInput) return;

    // Auto-sync global PDF
    async function syncGlobalPdf() {
        try {
            const res = await fetch('./programacao.pdf', { cache: 'no-cache' });
            if (!res.ok) return;
            
            const arrayBuffer = await res.arrayBuffer();
            
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < uint8Array.byteLength; i++) {
                binary += String.fromCharCode(uint8Array[i]);
            }
            const base64 = btoa(binary);
            
            const currentSaved = localStorage.getItem('geoportal_current_pdf');
            if (base64 === currentSaved) {
                return; // Já está sincronizado
            }
            
            console.log("Novidade: PDF Global Encontrado. Sincronizando...");
            
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            const file = new File([blob], "programacao.pdf", { type: 'application/pdf' });
            
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            // Dispara o evento change para o parser fazer o resto
            const event = new Event('change');
            fileInput.dispatchEvent(event);
            
        } catch (e) {
            console.warn("Nenhuma programacao.pdf global encontrada ou erro ao sincronizar.", e);
        }
    }
    syncGlobalPdf();

    // Check if there's a saved PDF
    const savedPdfBase64 = localStorage.getItem('geoportal_current_pdf');
    if (savedPdfBase64 && btnView) {
        btnView.style.display = 'flex';
    }

    if (btnView) {
        btnView.addEventListener('click', () => {
            const base64 = localStorage.getItem('geoportal_current_pdf');
            if (base64) {
                const binStr = atob(base64);
                const len = binStr.length;
                const arr = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    arr[i] = binStr.charCodeAt(i);
                }
                const blob = new Blob([arr], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            }
        });
    }

    btnImport.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Por favor, selecione um arquivo PDF.');
            return;
        }

        loadingIndicator.style.display = 'block';
        btnImport.style.display = 'none';
        if (btnView) btnView.style.display = 'none';

        try {
            // Se estiver no servidor local, tenta enviar o arquivo para salvar e dar git push!
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168')) {
                try {
                    const uploadResponse = await fetch('http://' + window.location.host + '/upload-pdf', {
                        method: 'POST',
                        body: file,
                        headers: {
                            'Content-Type': 'application/pdf'
                        }
                    });
                    const uploadResult = await uploadResponse.json();
                    if (uploadResult.success) {
                        alert('✅ ' + uploadResult.message);
                    } else {
                        alert('❌ Falha na sincronização: ' + uploadResult.error);
                    }
                } catch (e) {
                    console.warn('Servidor local não detectado para sincronização.');
                }
            }

            // Save PDF for viewing later
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = function() {
                const base64 = reader.result.split(',')[1];
                localStorage.setItem('geoportal_current_pdf', base64);
            };

            const arrayBuffer = await file.arrayBuffer();
            
            // Set worker source for PDF.js (required)
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
            
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let extractedData = [];

            // Read all pages
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // Sort items by Y descending (top to bottom), then X ascending (left to right)
                const items = textContent.items.sort((a, b) => {
                    if (Math.abs(b.transform[5] - a.transform[5]) > 5) {
                        return b.transform[5] - a.transform[5];
                    }
                    return a.transform[4] - b.transform[4];
                });

                // Group into lines
                let lines = [];
                let currentLine = [];
                let currentY = null;

                for (const item of items) {
                    if (currentY === null || Math.abs(item.transform[5] - currentY) > 5) {
                        if (currentLine.length > 0) lines.push(currentLine);
                        currentLine = [item.str.trim()];
                        currentY = item.transform[5];
                    } else {
                        currentLine.push(item.str.trim());
                    }
                }
                if (currentLine.length > 0) lines.push(currentLine);

                // Parse lines for Atividade, Fazenda, Equipe
                for (const line of lines) {
                    const cleanLine = line.filter(s => s.length > 0);
                    if (cleanLine.length < 3) continue;

                    let fazendaName = null;
                    let equipeName = null;
                    let atividade = cleanLine[0];

                    for (let i = 0; i < cleanLine.length; i++) {
                        if (cleanLine[i].toUpperCase().startsWith('FAZ.')) {
                            fazendaName = cleanLine[i];
                            // A equipe (Observacao) geralmente é tudo o que aparece à direita da Fazenda
                            if (i + 1 < cleanLine.length) {
                                equipeName = cleanLine.slice(i + 1).join(' ').trim();
                            }
                            break;
                        }
                    }

                    if (fazendaName && equipeName) {
                        extractedData.push({
                            atividade,
                            fazenda: fazendaName,
                            equipe: equipeName
                        });
                    }
                }
            }

            console.log("PDF Extracted Data:", extractedData);

            if (extractedData.length === 0) {
                alert("Nenhuma equipe foi encontrada no PDF. Verifique se o formato está correto.");
            } else {
                // Update map placements
                let countPlaced = 0;
                
                if (GEOPORTAL_LAYERS['TALHOES'] && GEOPORTAL_LAYERS['FAZENDAS']) {
                    
                    // Reset existing data to ONLY keep what's in the PDF
                    window.savedEquipes = {};
                    const normalizeName = (str) => {
                        if (!str) return "";
                        let s = str.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f\uFFFD]/g, "");
                        // Remove everything after underscore
                        s = s.split('_')[0];
                        // Handle dashes (e.g. "9003 - Faz. Canada" or "Canada - 7323")
                        if (s.includes('-')) {
                            let parts = s.split('-');
                            if (/[0-9]/.test(parts[0]) && !/[a-z]{3,}/.test(parts[0])) {
                                s = parts[1] || parts[0];
                            } else {
                                s = parts[0];
                            }
                        }
                        // Remove "faz." and trim
                        s = s.replace(/\bfaz\.\b/g, "").replace(/\bfaz\b/g, "").replace(/\bfazenda\b/g, "").trim();
                        // Aliases for common typos
                        if (s.includes('olho') && s.includes('gua')) s = 'olhodagua';
                        return s;
                    };

                    let newEquipesList = [];

                    // Sort data to prioritize 'Corte Mecanizado' so they get the first Talhões
                    extractedData.sort((a, b) => {
                        const actA = (a.atividade || '').toUpperCase();
                        const actB = (b.atividade || '').toUpperCase();
                        const isCorteA = actA.includes('CORTE');
                        const isCorteB = actB.includes('CORTE');
                        if (isCorteA && !isCorteB) return -1;
                        if (!isCorteA && isCorteB) return 1;
                        return 0;
                    });

                    // Track which talhões have been used per farm to distribute teams
                    const usedTalhoesByFarm = {};

                    extractedData.forEach(data => {
                        const farmNameStr = normalizeName(data.fazenda);
                        
                        if (!usedTalhoesByFarm[farmNameStr]) {
                            usedTalhoesByFarm[farmNameStr] = new Set();
                        }

                        let markerGeometry = null;

                        // Get all Talhões of the farm
                        const farmTalhoes = GEOPORTAL_LAYERS['TALHOES'].features.filter(f => {
                            const props = f.properties || {};
                            const name = normalizeName(props.nome || props.NOME_FAZ || props.FAZENDA || '');
                            return name && (name.includes(farmNameStr) || farmNameStr.includes(name));
                        });

                        if (farmTalhoes.length > 0) {
                            // Sort numerically to ensure correct sequential order (1, 2, 3...)
                            farmTalhoes.sort((a, b) => {
                                const codA = parseInt(a.properties.COD_TALHAO || a.properties.TALHAO || 99999);
                                const codB = parseInt(b.properties.COD_TALHAO || b.properties.TALHAO || 99999);
                                return codA - codB;
                            });
                            
                            // Helper to get a unique ID for the talhão
                            const getTalhaoId = (t) => t.properties.COD_TALHAO || t.properties.TALHAO || t.properties.OBJECTID || t.properties.id || JSON.stringify(t.geometry.coordinates[0][0]);

                            // Find the first available talhão that hasn't been occupied yet
                            let matchedTalhao = farmTalhoes.find(t => !usedTalhoesByFarm[farmNameStr].has(getTalhaoId(t)));
                            
                            // If all talhões are occupied (more teams than talhões), fallback to the first one
                            if (!matchedTalhao) {
                                matchedTalhao = farmTalhoes[0];
                            } else {
                                // Mark as used
                                usedTalhoesByFarm[farmNameStr].add(getTalhaoId(matchedTalhao));
                            }
                            
                            if (matchedTalhao && matchedTalhao.geometry) {
                                // Calculate the true center (bounding box) of the Polygon
                                let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
                                
                                const extractCoords = (arr) => {
                                    if (arr.length >= 2 && typeof arr[0] === 'number') {
                                        minLng = Math.min(minLng, arr[0]);
                                        maxLng = Math.max(maxLng, arr[0]);
                                        minLat = Math.min(minLat, arr[1]);
                                        maxLat = Math.max(maxLat, arr[1]);
                                    } else if (Array.isArray(arr)) {
                                        arr.forEach(extractCoords);
                                    }
                                };
                                
                                extractCoords(matchedTalhao.geometry.coordinates);
                                
                                if (minLng !== Infinity) {
                                    markerGeometry = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
                                }
                            }
                        }

                        // Fallback to Fazenda center
                        if (!markerGeometry) {
                            const matchedFarm = GEOPORTAL_LAYERS['FAZENDAS'].features.find(f => {
                                const props = f.properties || {};
                                const name = normalizeName(props.nome || props.NOME || props.Name || '');
                                // For cases like "olho dagua" vs "olhos dagua"
                                const cleanName = name.replace(/[^a-z]/g, "");
                                const cleanFarmStr = farmNameStr.replace(/[^a-z]/g, "");
                                return cleanName && (cleanName.includes(cleanFarmStr) || cleanFarmStr.includes(cleanName));
                            });
                            
                            if (matchedFarm && matchedFarm.geometry && matchedFarm.geometry.coordinates) {
                                markerGeometry = matchedFarm.geometry.coordinates;
                            }
                        }

                        // Anti-overlap logic: if this exact coordinate is already used, offset it slightly
                        if (markerGeometry) {
                            let collisionOffset = 0;
                            let isOverlapping = true;
                            
                            while (isOverlapping && collisionOffset < 10) {
                                isOverlapping = newEquipesList.some(eq => 
                                    eq.POS &&
                                    Math.abs(eq.POS[0] - markerGeometry[0]) < 0.0001 && 
                                    Math.abs(eq.POS[1] - markerGeometry[1]) < 0.0001
                                );
                                
                                if (isOverlapping) {
                                    // Offset by roughly ~150 meters to spread them out visually
                                    markerGeometry = [
                                        markerGeometry[0] + 0.0015,
                                        markerGeometry[1] + 0.0015
                                    ];
                                    collisionOffset++;
                                }
                            }

                            // Immediately store in savedEquipes to keep state across refreshes
                            window.savedEquipes[data.equipe] = markerGeometry;
                            countPlaced++;
                        }

                        // ALWAYS push to list so they appear in the sidebar, even if no POS was found
                        newEquipesList.push({
                            EQUIPE: data.equipe,
                            ATIVIDADE: data.atividade || 'GERAL',
                            FAZENDA: data.fazenda,
                            POS: markerGeometry
                        });
                    });

                    // Save to local storage
                    localStorage.setItem('geoportal_equipes_placement', JSON.stringify(window.savedEquipes));
                    localStorage.setItem('geoportal_equipes_list', JSON.stringify(newEquipesList));
                    
                    alert(`${countPlaced} equipes importadas e posicionadas com sucesso!\nO mapa será recarregado e mostrará apenas as equipes deste PDF.`);
                    
                    // Reload to reflect all new points
                    location.reload();
                } else {
                    alert("Dados do mapa (Camadas de Talhões e Fazendas) ainda não carregaram completamente. Aguarde uns instantes e tente novamente.");
                }
            }

        } catch (error) {
            console.error("Error parsing PDF:", error);
            alert("Erro ao processar o PDF. Detalhes no console.");
        } finally {
            loadingIndicator.style.display = 'none';
            btnImport.style.display = 'flex';
            fileInput.value = ''; // Reset
        }
    });
});
