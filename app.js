// NDB Holding Agrícola Geoportal JavaScript Core (Dynamic)

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Leaflet Map
    const map = L.map('map', {
        zoomControl: true,
        attributionControl: true
    }).setView([-17.8, -40.0], 7);
    
    // Fix map rendering bug on mobile
    setTimeout(() => { map.invalidateSize(); }, 500);

    map.zoomControl.setPosition('bottomright');

    // Custom Locate Control
    const LocateControl = L.Control.extend({
        options: {
            position: 'bottomright'
        },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom-locate');
            container.style.backgroundColor = 'var(--bg-secondary)';
            container.style.backdropFilter = 'blur(12px)';
            container.style.width = '30px';
            container.style.height = '30px';
            container.style.cursor = 'pointer';
            container.style.display = 'flex';
            container.style.justifyContent = 'center';
            container.style.alignItems = 'center';
            container.style.marginTop = '10px';
            container.title = 'Minha Localização';

            const icon = L.DomUtil.create('span', '', container);
            icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-main);"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>`;

            container.onclick = function(e){
                L.DomEvent.stopPropagation(e);
                if (window._agrogis_gpsMarker) {
                    map.flyTo(window._agrogis_gpsMarker.getLatLng(), 16, {duration: 1.5});
                } else {
                    alert("Aguardando sinal do GPS...");
                }
            }
            
            container.onmouseover = function() { container.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; };
            container.onmouseout = function() { container.style.backgroundColor = 'var(--bg-secondary)'; };

            return container;
        }
    });
    map.addControl(new LocateControl());

    // Restrict Attribute Table (Popups) for Visualizer Level
    // Restrict Attribute Table (Popups) for Visualizer Level
    map.on('popupopen', function(e) {
        const savedLevel = localStorage.getItem('agrogis_access_level');
        if (!savedLevel || parseInt(savedLevel) === 1) {
            const source = e.popup._source;
            const props = source && source.feature ? source.feature.properties : null;
            const isEquipe = props && (props.atividade || props.ATIVIDADE || props.equipe || props.EQUIPE);
            
            if (!isEquipe) {
                map.closePopup(e.popup);
            }
        }
    });

    // Toggle labels based on zoom level and user preference
    const isMobile = window.innerWidth <= 768;
    const ZOOM_THRESHOLD = isMobile ? 14 : 12; // Fazendas
    const TALHOES_ZOOM_THRESHOLD = isMobile ? 15 : 14; // Talhões
    const EQUIPES_ZOOM_THRESHOLD = isMobile ? 10 : 8; // Equipes
    
    // Dynamic Layer Engine Stores
    const loadedLayers = {}; // Store layer objects for toggling/searching
    const layerLabels = { TALHOES: [] }; // Store markers for viewport culling
    const activeLabelGroups = { TALHOES: L.layerGroup().addTo(map) };
    const layerStyles = {}; // Store generated styles

    function updateLabelVisibility() {
        // Fazendas logic
        const toggleFazendas = document.getElementById('toggle-labels-fazendas');
        const fazendasEnabled = toggleFazendas ? toggleFazendas.checked : true;
        if (fazendasEnabled && map.getZoom() >= ZOOM_THRESHOLD) {
            document.getElementById('map').classList.add('show-labels');
        } else {
            document.getElementById('map').classList.remove('show-labels');
        }

        // Talhões Viewport logic
        if (activeLabelGroups.TALHOES && layerLabels.TALHOES) {
            const toggleTalhoes = document.getElementById('toggle-labels-talhoes');
            // Allow checking if the talhoes toggle exists and is checked, otherwise default to true if it hasn't been rendered yet
            const talhoesEnabled = toggleTalhoes ? toggleTalhoes.checked : true;
            const zoom = map.getZoom();
            
            activeLabelGroups.TALHOES.clearLayers();
            
            if (talhoesEnabled && zoom >= TALHOES_ZOOM_THRESHOLD) {
                const bounds = map.getBounds().pad(0.2); // slight padding for smooth panning
                for (const marker of layerLabels.TALHOES) {
                    if (bounds.contains(marker.getLatLng())) {
                        activeLabelGroups.TALHOES.addLayer(marker);
                    }
                }
            }
        }

        // Equipes Zoom logic
        if (loadedLayers['EQUIPES']) {
            const zoom = map.getZoom();
            
            // Check if Variedades is active (it hides Equipes)
            let isVariedadesActive = false;
            const allCheckboxes = document.querySelectorAll('#dynamic-layer-list input[type="checkbox"][data-layer]');
            allCheckboxes.forEach(cb => {
                const layerName = cb.getAttribute('data-layer') || '';
                if (layerName.toUpperCase().includes('VARIEDADE') && cb.checked) {
                    isVariedadesActive = true;
                }
            });

            // Check if Equipes checkbox is checked
            let isEquipesChecked = true;
            const equipesCb = document.querySelector('#dynamic-layer-list input[type="checkbox"][data-layer="EQUIPES"]');
            if (equipesCb) {
                isEquipesChecked = equipesCb.checked;
            }

            if (zoom >= EQUIPES_ZOOM_THRESHOLD && isEquipesChecked && !isVariedadesActive) {
                if (!map.hasLayer(loadedLayers['EQUIPES'])) {
                    map.addLayer(loadedLayers['EQUIPES']);
                }
            } else {
                if (map.hasLayer(loadedLayers['EQUIPES'])) {
                    map.removeLayer(loadedLayers['EQUIPES']);
                }
            }
        }
    }
    
    // Debounce function to optimize heavy viewport operations
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    
    const debouncedUpdateLabelVisibility = debounce(updateLabelVisibility, 350);

    map.on('zoomend', debouncedUpdateLabelVisibility);
    map.on('moveend', debouncedUpdateLabelVisibility);

    // 2. Map Base Layers Setup
    const satelliteLayer = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri World Imagery',
        maxZoom: 19
    });

    const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
    });

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    });

    const satelliteGroup = L.layerGroup([satelliteLayer, labelsLayer]).addTo(map);

    // 3. Basemap Selector Toggle Logic
    const satBtn = document.getElementById('basemap-sat');
    const osmBtn = document.getElementById('basemap-osm');

    satBtn.addEventListener('click', () => {
        if (!map.hasLayer(satelliteGroup)) {
            map.removeLayer(osmLayer);
            satelliteGroup.addTo(map);
            satBtn.classList.add('active');
            osmBtn.classList.remove('active');
        }
    });

    osmBtn.addEventListener('click', () => {
        if (!map.hasLayer(osmLayer)) {
            map.removeLayer(satelliteGroup);
            osmLayer.addTo(map);
            osmBtn.classList.add('active');
            satBtn.classList.remove('active');
        }
    });

    // Helper to generate dynamic tabular popups from GeoJSON properties
    function createPopupContent(title, properties) {
        let rows = '';
        for (const [key, value] of Object.entries(properties)) {
            if (value !== null && typeof value !== 'object') {
                rows += `
                    <tr>
                        <td style="font-weight: 600; padding-right: 8px;">${key}</td>
                        <td>${value}</td>
                    </tr>
                `;
            }
        }
        return `
            <div class="popup-title">${title}</div>
            <table class="popup-table">
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    let globalBounds = L.latLngBounds();

    // Define some premium colors for known layers or general rotation
    const colorPalette = ['#ff9f1c', '#2ec4b6', '#e71d36', '#2a9d8f', '#e9c46a', '#f4a261', '#8338ec', '#ff006e'];
    let colorIndex = 0;

    const dynamicLayerList = document.getElementById('dynamic-layer-list');

    // Extended palette for categorizing farms in Talhões
    const extendedPalette = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#808080'];
    const farmColors = {};
    let farmColorIndex = 0;
    function getFarmColor(farmName) {
        if (!farmName) return '#2ec4b6';
        if (!farmColors[farmName]) {
            farmColors[farmName] = extendedPalette[farmColorIndex % extendedPalette.length];
            farmColorIndex++;
        }
        return farmColors[farmName];
    }

    const varietyColors = {};
    let varietyColorIndex = 0;
    function getVarietyColor(varietyName) {
        if (!varietyName) return '#8338ec';
        if (!varietyColors[varietyName]) {
            varietyColors[varietyName] = extendedPalette[varietyColorIndex % extendedPalette.length];
            varietyColorIndex++;
        }
        return varietyColors[varietyName];
    }

    if (typeof GEOPORTAL_LAYERS !== 'undefined') {
        
        // --- PROCESS EQUIPES VIA LOCALSTORAGE ---
        let savedEquipes = {};
        let savedEquipesList = null;

        try {
            const saved = localStorage.getItem('geoportal_equipes_placement');
            if (saved) savedEquipes = JSON.parse(saved);
            
            const savedList = localStorage.getItem('geoportal_equipes_list');
            if (savedList) savedEquipesList = JSON.parse(savedList);
        } catch (e) { console.error(e); }

        window.savedEquipes = savedEquipes; // Make globally accessible for refresh
        window.activeTeamPlacement = null;
        
        let workingEquipesData = savedEquipesList || (typeof EQUIPES_DATA !== 'undefined' ? EQUIPES_DATA : []);
        window.workingEquipesData = workingEquipesData;

        if (workingEquipesData.length > 0) {
            const equipesFeatures = [];
            
            workingEquipesData.forEach(eq => {
                if(!eq.EQUIPE) return;
                
                let act = (eq.ATIVIDADE || '').toUpperCase();
                let isOutros = !act.includes('CORTE MECANIZADO') && !act.includes('DRONE') && !act.includes('LIMPEZA') && !act.includes('CATAÇÃO') && !act.includes('CATACAO') && !act.includes('HERBICIDA');
                
                // As equipes da aba "Outros" não devem aparecer no mapa
                if (isOutros) return;

                const savedPos = savedEquipes[eq.EQUIPE];
                if (savedPos) {
                    equipesFeatures.push({
                        type: "Feature",
                        properties: {
                            nome: eq.EQUIPE,
                            atividade: eq.ATIVIDADE || 'GERAL'
                        },
                        geometry: { type: "Point", coordinates: savedPos }
                    });
                }
            });
            
            // Sempre criamos a camada EQUIPES, mesmo vazia
            GEOPORTAL_LAYERS['EQUIPES'] = {
                type: "FeatureCollection",
                name: "EQUIPES",
                features: equipesFeatures
            };
        }
        // Fim PROCESS EQUIPES
        
        for (const layerName in GEOPORTAL_LAYERS) {
            // Ignorar completamente camadas de Grade de Coordenadas que vieram exportadas no GeoJSON
            const upperName = layerName.toUpperCase();
            const blockwords = ['GRADE', 'COORDENAD', 'GRID', 'MALHA', 'RETICULA', 'QUADRICULA', 'MERIDIANO', 'PARALELO', 'GRATICULE'];
            let shouldBlock = false;
            for (const word of blockwords) {
                if (upperName.includes(word)) {
                    shouldBlock = true;
                    break;
                }
            }
            if (shouldBlock) continue;
            
            const data = GEOPORTAL_LAYERS[layerName];
            
            // Assign base color
            let baseColor = colorPalette[colorIndex % colorPalette.length];
            
            // Identify specific layers
            const isFazenda = layerName.toUpperCase().includes('FAZENDA');
            const isTalhao = layerName.toUpperCase().includes('TALHO');
            const isEquipe = layerName.toUpperCase().includes('EQUIPE');
            const isVariedade = layerName.toUpperCase().includes('VARIEDADE');

            if (isFazenda) baseColor = '#ff9f1c'; 
            if (isTalhao) baseColor = '#2ec4b6'; 
            if (isEquipe) baseColor = '#ff006e';
            if (isVariedade) baseColor = '#8338ec';
            colorIndex++;

            const styleFunc = function(feature) {
                let featureColor = baseColor;
                if (isTalhao && feature.properties) {
                    const farmName = feature.properties.NOME_FAZ || feature.properties.FAZENDA || feature.properties.nome_faz;
                    if (farmName) {
                        featureColor = getFarmColor(farmName);
                    }
                }
                if (isVariedade && feature.properties) {
                    const varName = feature.properties['DL VARIEDADE'] || feature.properties.VARIEDADE || feature.properties.variedade;
                    if (varName) {
                        featureColor = getVarietyColor(varName);
                    }
                }
                return {
                    color: (isTalhao || isVariedade) ? '#d3d3d3' : featureColor,
                    weight: (isTalhao || isVariedade) ? 1.2 : (isFazenda ? 0 : 1.5),
                    opacity: isFazenda ? 0 : 0.9,
                    fillColor: featureColor,
                    fillOpacity: (isTalhao || isVariedade) ? 1.0 : (isFazenda ? 0 : 0.2)
                };
            };
            
            // Store styles for search logic
            layerStyles[layerName] = {
                default: styleFunc, // use the function directly
                highlight: { weight: 3.5, opacity: 1, fillOpacity: 1.0 }
            };

            // Create Map Layer
            const mapLayer = L.geoJSON(data, {
                style: styleFunc,
                pointToLayer: function (feature, latlng) {
                    if (isEquipe) {
                        const atividade = (feature.properties.atividade || '').toUpperCase();
                        
                        // Use Custom 3D Harvester Icon for Corte Mecanizado
                        if (atividade.includes('CORTE')) {
                            const iconUrl = 'colhedora_jd.jpg';
                            return L.marker(latlng, {
                                icon: L.divIcon({
                                    className: 'equipe-marker',
                                    html: `<div class="equipe-icon-container" style="background: transparent; border: none; box-shadow: none;">
                                               <img src="${iconUrl}" style="width: 48px; height: 48px; border-radius: 50%; border: 3px solid #e85d04; box-shadow: 0 6px 12px rgba(232,93,4,0.4); object-fit: contain; background: #fff;">
                                               <div class="equipe-label" style="bottom: -20px; font-size: 11px; background: rgba(0,0,0,0.8); border: 1px solid #e85d04;">${feature.properties.nome}</div>
                                           </div>`,
                                    iconSize: [48, 48],
                                    iconAnchor: [24, 24]
                                })
                            });
                        }

                        let pinColor = '#0077b6'; // Default to GIS Blue (Tratos) for others
                        
                        if (atividade.includes('DRONE') || atividade.includes('LIMPEZA') || atividade.includes('CATAÇÃO') || atividade.includes('CATACAO') || atividade.includes('HERBICIDA')) {
                            pinColor = '#0077b6'; // GIS Blue (Tratos)
                        }

                        const avenzaPinSVG = `
                            <div style="position: relative; width: 32px; height: 42px; left: -16px; top: -42px;">
                                <svg viewBox="0 0 32 42" width="32" height="42" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 3px rgba(0,0,0,0.5));">
                                    <path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 16 26 16 26s16-15.5 16-26C32 7.163 24.837 0 16 0z" fill="${pinColor}" stroke="#ffffff" stroke-width="1.5"/>
                                    <circle cx="16" cy="16" r="6" fill="#ffffff"/>
                                </svg>
                                <div style="position: absolute; top: 44px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.75); color: #fff; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; white-space: nowrap; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 2px 4px rgba(0,0,0,0.5); font-family: 'Inter', Arial, sans-serif;">
                                    ${feature.properties.nome.split(' ')[0]}
                                </div>
                            </div>
                        `;

                        return L.marker(latlng, {
                            icon: L.divIcon({
                                className: 'avenza-marker',
                                html: avenzaPinSVG,
                                iconSize: [0, 0],
                                iconAnchor: [0, 0]
                            })
                        });
                    }
                    return L.circleMarker(latlng, {
                        radius: isFazenda ? 12 : 6,
                        fillColor: baseColor,
                        color: "#ffffff",
                        weight: isFazenda ? 0 : 1,
                        opacity: isFazenda ? 0 : 1,
                        fillOpacity: isFazenda ? 0 : 0.8
                    });
                },
                onEachFeature: (feature, layer) => {
                    const props = feature.properties || {};
                    const title = props.nome || props.NOME || props.Name || props.talhao || props.TALHAO || props.id || props.designacao || 'Elemento';
                    layer.bindPopup(createPopupContent(title, props));
                    
                    if (isFazenda) {
                        layer.bindTooltip(title, {
                            permanent: true,
                            direction: 'center',
                            className: 'fazenda-transparent-label'
                        });

                        // Populate datalist for search
                        const dataList = document.getElementById('fazendas-list');
                        if (dataList && title !== 'Elemento') {
                            const option = document.createElement('option');
                            option.value = title;
                            dataList.appendChild(option);
                        }
                    }

                    if (isTalhao) {
                        const cod = props.COD_TALHAO || props.TALHAO || '';
                        const area = parseFloat(props.TALHAO_ARE || props.AREA_TOTAL || props['DL AREA'] || 0).toFixed(2);
                        const varName = props['DL VARIEDADE'] || props.VARIEDADE || '';
                        
                        if (cod) {
                            const html = `
                                <div class="talhao-complex-label">
                                    <div class="tc-cod">${cod}</div>
                                    <div class="tc-area">${area}</div>
                                    <div class="tc-var">${varName}</div>
                                </div>
                            `;
                            // Only create the marker in memory, don't add to map here to avoid DOM freezing
                            const marker = L.marker(layer.getBounds().getCenter(), {
                                icon: L.divIcon({
                                    className: 'custom-talhao-label-container',
                                    html: html,
                                    iconSize: [60, 40],
                                    iconAnchor: [30, 20]
                                }),
                                interactive: false // Labels shouldn't block map interactions
                            });
                            layerLabels.TALHOES.push(marker);
                        }
                    }

                    layer.on({
                        mouseover: (e) => {
                            if (!isFazenda) {
                                const l = e.target;
                                l.setStyle({
                                    weight: 3.5,
                                    opacity: 1,
                                    fillOpacity: 0.7
                                });
                                l.bringToFront();
                            }
                        },
                        mouseout: (e) => {
                            if (!isFazenda) {
                                mapLayer.resetStyle(e.target);
                            }
                        },
                        click: (e) => {
                            if (window.routeSelectionMode) {
                                const props = layer.feature.properties || {};
                                const title = props.NOME_FAZ || props.FAZENDA || props.nome_faz || props.nome || props.NOME || props.Name || props.TALHAO || 'Local';
                                let lat, lng;
                                if (typeof turf !== 'undefined') {
                                    const centroid = turf.centroid(layer.feature);
                                    lat = centroid.geometry.coordinates[1];
                                    lng = centroid.geometry.coordinates[0];
                                } else {
                                    const center = layer.getBounds().getCenter();
                                    lat = center.lat;
                                    lng = center.lng;
                                }
                                window.setRouteWaypoint(title, lat, lng);
                                L.DomEvent.stopPropagation(e);
                                return;
                            }

                            if (isFazenda) {
                                // Clear previous search/click highlight
                                if (window.currentSearchedFarmLayer && window.currentSearchedFarmLayerGroup) {
                                    window.currentSearchedFarmLayerGroup.resetStyle(window.currentSearchedFarmLayer);
                                }
                                
                                window.currentSearchedFarmLayer = layer;
                                window.currentSearchedFarmLayerGroup = mapLayer;
                                
                                // Highlight the farm polygon
                                layer.setStyle({
                                    weight: 4,
                                    color: '#ffeb3b', // Bright yellow outline
                                    fillOpacity: 0.1
                                });
                                if (layer.bringToFront) {
                                    layer.bringToFront();
                                }

                                // Fly to the farm
                                if (layer.getBounds) {
                                    map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 1.5 });
                                } else if (layer.getLatLng) {
                                    map.flyTo(layer.getLatLng(), 15, { duration: 1.5 });
                                }
                                
                                // Prevent the map's click event from clearing the selection immediately
                                L.DomEvent.stopPropagation(e);
                            } else {
                                // If clicking on a Talhão or Variedade, clear any active selections
                                if (window.clearAllSelections) {
                                    window.clearAllSelections();
                                }
                            }
                        }
                    });
                }
            });

            // Add to map by default only if it's Fazenda, Talhao or Equipe
            const isDefaultActive = isFazenda || isTalhao || isEquipe;
            if (isDefaultActive) {
                mapLayer.addTo(map);
            }
            
            loadedLayers[layerName] = mapLayer;

            // Expand Bounds
            if (mapLayer.getBounds().isValid()) {
                globalBounds.extend(mapLayer.getBounds());
            }

            // Create UI Checkbox
            // Se for Equipe, nós NÃO criamos a aba de checkbox nas Camadas Operacionais, 
            // pois elas já são gerenciadas pela seção 'Programação de Serviço'.
            if (isEquipe) {
                continue;
            }

            const safeId = layerName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
            const checkedAttr = isDefaultActive ? 'checked' : '';
            
            // Add submenu (accordion)
            let extraControls = `
                <div class="layer-submenu" style="display: none; margin-top: 10px; margin-left: 35px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                    <label class="custom-checkbox" style="font-size: 11px; margin-bottom: 8px; display: flex; align-items: center;">
                        <input type="checkbox" id="toggle-labels-${safeId}" checked>
                        <span class="checkmark" style="--layer-color: #f6ea7c; width: 14px; height: 14px; min-width: 14px;"></span>
                        <span class="layer-name" style="margin-left: 8px; color: var(--text-main);">Exibir Rótulos</span>
                    </label>
                    <button class="chart-btn" data-layer-key="${layerName}" data-safe-id="${safeId}" style="background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.1); color: var(--text-main); padding: 6px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px; width: 100%; transition: all 0.2s; justify-content: center;">
                        <span>📊</span> Exibir Gráfico
                    </button>
                    <div id="chart-container-${safeId}" class="inline-chart-container" style="display: none;"></div>
                </div>
            `;

            const li = document.createElement('li');
            li.className = 'layer-item';
            li.style.display = 'block'; // Override default flex to allow vertical stacking
            
            const featureCount = (data.features && data.features.length) || 0;
            const subtitleText = featureCount === 1 ? '1 objeto' : featureCount + ' objetos';
            const avenzaIcon = `<div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(255, 255, 255, 0.03); display: flex; justify-content: center; align-items: center; margin-right: 12px; flex-shrink: 0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${baseColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg></div>`;

            li.innerHTML = `
                <div class="layer-main-row">
                    ${avenzaIcon}
                    <div class="layer-text-container" style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; text-align: left;">
                        <div class="layer-name" style="font-size: 14px; font-weight: 500; color: var(--text-main); line-height: 1; text-transform: capitalize;">${layerName.replace(/_/g, ' ')}</div>
                        <div class="layer-subtitle" style="font-size: 9px; color: rgba(255, 255, 255, 0.25); margin-top: 0px; line-height: 1;">${subtitleText}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <label class="custom-checkbox" style="margin-bottom: 0;" onclick="event.stopPropagation();">
                            <input type="checkbox" id="toggle-${safeId}" ${checkedAttr} data-layer="${layerName}">
                            <span class="checkmark" style="--layer-color: ${baseColor}"></span>
                        </label>
                        <span class="submenu-arrow" style="font-size: 10px; color: rgba(255,255,255,0.3); font-weight: bold; width: 16px; text-align: center;">▼</span>
                    </div>
                </div>
                ${extraControls}
            `;
            dynamicLayerList.appendChild(li);
            
            // Accordion open/close logic for ALL layers
            const mainRow = li.querySelector('.layer-main-row');
            const submenu = li.querySelector('.layer-submenu');
            const arrow = li.querySelector('.submenu-arrow');
            
            mainRow.addEventListener('click', () => {
                if (submenu.style.display === 'none') {
                    submenu.style.display = 'block';
                    arrow.innerHTML = '▲';
                } else {
                    submenu.style.display = 'none';
                    arrow.innerHTML = '▼';
                }
            });

            // Wire label toggle immediately if it is Fazenda (for now)
            if (isFazenda) {
                const labelToggle = document.getElementById(`toggle-labels-${safeId}`);
                if (labelToggle) {
                    labelToggle.addEventListener('change', updateLabelVisibility);
                }
            }

            const styleId = `style-${safeId}`;
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.innerHTML = `
                    #toggle-${safeId}:checked ~ .checkmark { background-color: ${baseColor} !important; border-color: ${baseColor} !important; }
                    #toggle-${safeId}:checked ~ .layer-name { color: #fff !important; }
                `;
                document.head.appendChild(style);
            }
            const checkbox = li.querySelector(`#toggle-${safeId}`);
            checkbox.addEventListener('change', (e) => {
                const targetLayerName = e.target.getAttribute('data-layer');
                const targetLayer = loadedLayers[targetLayerName];
                
                if (e.target.checked) {
                    // Auto-hide other vector layers if this is VARIEDADES
                    if (targetLayerName.toUpperCase().includes('VARIEDADE')) {
                        const allCheckboxes = dynamicLayerList.querySelectorAll('input[type="checkbox"][data-layer]');
                        allCheckboxes.forEach(cb => {
                            const otherLayerName = cb.getAttribute('data-layer');
                            if (otherLayerName !== targetLayerName) {
                                if (cb.checked) {
                                    cb.checked = false;
                                    const otherLayer = loadedLayers[otherLayerName];
                                    if (otherLayer) map.removeLayer(otherLayer);
                                }
                            }
                        });
                        
                        // Hide EQUIPES since it doesn't have a checkbox
                        if (loadedLayers['EQUIPES']) {
                            map.removeLayer(loadedLayers['EQUIPES']);
                        }
                    }
                    map.addLayer(targetLayer);
                } else {
                    map.removeLayer(targetLayer);
                    
                    // Restore EQUIPES when VARIEDADES is unchecked
                    if (targetLayerName.toUpperCase().includes('VARIEDADE')) {
                        if (loadedLayers['EQUIPES']) {
                            // Let updateLabelVisibility handle adding it back if zoom permits
                        }
                    }
                }
                
                // Re-evaluate zoom constraints after any layer toggle
                updateLabelVisibility();
            });
        }

        // Fit map bounds to all loaded layers
        // (Desabilitado a pedido do usuário para iniciar em uma posição macro fixa)
        /*
        if (loadedLayers['FAZENDAS']) {
            const bounds = loadedLayers['FAZENDAS'].getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [30, 30] });
            }
        } else if (globalBounds.isValid()) {
            map.fitBounds(globalBounds, { padding: [50, 50] });
        }
        */
        
        updateLabelVisibility(); // Call initial check after layers are loaded
    } else {
        console.warn("GEOPORTAL_LAYERS data not found. Please run INICIAR_GEOPORTAL.bat");
        dynamicLayerList.innerHTML = '<li style="color:#e71d36; font-size:12px;">Por favor, execute o arquivo INICIAR_GEOPORTAL.bat</li>';
    }

    // Search functionality - Locate Fazenda
    const searchInput = document.getElementById('layer-search');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) return;

        for (const layerName in loadedLayers) {
            // Only search in FAZENDA layer
            if (!layerName.toUpperCase().includes('FAZENDA')) continue;

            const layerGroup = loadedLayers[layerName];

            layerGroup.eachLayer(layer => {
                const props = layer.feature.properties || {};
                const title = props.nome || props.NOME || props.Name || props.talhao || props.TALHAO || props.id || props.designacao || '';
                
                // If user selected an exact match from the datalist
                if (title.toLowerCase() === query) {
                    
                    // Clear previous search highlight
                    if (window.currentSearchedFarmLayer && window.currentSearchedFarmLayerGroup) {
                        window.currentSearchedFarmLayerGroup.resetStyle(window.currentSearchedFarmLayer);
                    }
                    
                    window.currentSearchedFarmLayer = layer;
                    window.currentSearchedFarmLayerGroup = layerGroup;
                    
                    // Highlight the farm polygon
                    layer.setStyle({
                        weight: 4,
                        color: '#ffeb3b', // Bright yellow outline
                        fillOpacity: 0.1
                    });
                    if (layer.bringToFront) {
                        layer.bringToFront();
                    }

                    // Fly to the farm
                    if (layer.getLatLng) {
                        map.flyTo(layer.getLatLng(), 15, { duration: 1.5 });
                    } else if (layer.getBounds) {
                        map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 1.5 });
                    }
                    
                    // Clear search box after short delay for better UX
                    setTimeout(() => {
                        searchInput.value = '';
                        searchInput.blur();
                    }, 2000);
                }
            });
        }
    });

    // Handle inline chart buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.chart-btn');
        if (!btn) return;
        
        try {
            const layerKey = btn.getAttribute('data-layer-key');
            const safeId = btn.getAttribute('data-safe-id');
            const container = document.getElementById(`chart-container-${safeId}`);
            
            if (!container) throw new Error("Container not found");

            // Toggle logic: close if open
            if (container.style.display === 'block') {
                container.style.display = 'none';
                return;
            }

            const layerGroup = loadedLayers[layerKey];
            if (!layerGroup) throw new Error("Layer not found: " + layerKey);

            const isVariedade = layerKey.toUpperCase().includes('VARIEDADE');

            // Aggregate area
            const aggregates = {};
            let totalArea = 0;
            
            layerGroup.eachLayer(layer => {
                const props = layer.feature.properties || {};
                let tipo = props['DL TIPOCONTRA'] || props.TIPOCONTRA || 'NÃO DEFINIDO';
                
                if (isVariedade) {
                    tipo = props['DL VARIEDADE'] || props.VARIEDADE || props.variedade || 'NÃO DEFINIDO';
                }
                
                // Extract area, standardizing the property name
                const area = parseFloat(props.AREA_TOTAL || props['DL AREA'] || props.AREA || 0);
                
                if (!aggregates[tipo]) aggregates[tipo] = 0;
                aggregates[tipo] += area;
                totalArea += area;
            });

            let sortedArr = Object.keys(aggregates).map(k => ({ label: k, area: aggregates[k] }));
            sortedArr.sort((a, b) => b.area - a.area);
            
            let top4Labels = [];
            if (isVariedade && sortedArr.length > 5) {
                const top4 = sortedArr.slice(0, 4);
                top4Labels = top4.map(i => i.label);
                const rest = sortedArr.slice(4);
                let outrasArea = 0;
                rest.forEach(item => outrasArea += item.area);
                top4.push({ label: 'Outras', area: outrasArea });
                sortedArr = top4;
            } else {
                top4Labels = sortedArr.map(i => i.label);
            }

            if (sortedArr.length === 0) throw new Error("No data aggregated");

            // Store top4Labels globally for the highlight logic
            window.currentChartTopLabels = top4Labels;

            // Find maximum area to calculate percentage width of bars
            let maxArea = 0;
            sortedArr.forEach(item => { if(item.area > maxArea) maxArea = item.area; });

            // Generate HTML for the bars
            let chartHTML = '';
            sortedArr.forEach(item => {
                const label = item.label;
                const area = item.area;
                const pct = maxArea > 0 ? (area / maxArea) * 100 : 0;
                const color = isVariedade && label !== 'Outras' ? getVarietyColor(label) : (label === 'Outras' ? '#888' : `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`);
                
                chartHTML += `
                    <div class="inline-chart-row" data-category="${label}" data-layer="${layerKey}" data-chart-color="${color}" title="Clique para selecionar no mapa">
                        <div class="inline-chart-label">${label}</div>
                        <div class="inline-chart-bar-container">
                            <div class="inline-chart-bar-bg">
                                <div class="inline-chart-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
                            </div>
                            <div class="inline-chart-value">${area.toFixed(2)} ha</div>
                        </div>
                    </div>
                `;
            });
            
            // Add total sum at the bottom
            chartHTML += `
                <div class="inline-chart-total">
                    TOTAL: ${totalArea.toFixed(2)} ha
                </div>
            `;
            
            container.innerHTML = chartHTML;
            container.style.display = 'block';

        } catch (err) {
            btn.innerHTML = 'Erro: ' + err.message;
            btn.style.color = '#ff4d4d';
            btn.style.borderColor = '#ff4d4d';
        }
    });

    // Handle map selection from chart bars
    let currentSelectedCategory = null;
    let currentSelectedLayerKey = null;

    window.clearAllSelections = () => {
        if (currentSelectedLayerKey && loadedLayers[currentSelectedLayerKey]) {
            loadedLayers[currentSelectedLayerKey].eachLayer(layer => {
                loadedLayers[currentSelectedLayerKey].resetStyle(layer);
            });
            currentSelectedCategory = null;
            currentSelectedLayerKey = null;
        }
        
        if (window.currentSearchedFarmLayer && window.currentSearchedFarmLayerGroup) {
            window.currentSearchedFarmLayerGroup.resetStyle(window.currentSearchedFarmLayer);
            window.currentSearchedFarmLayer = null;
            window.currentSearchedFarmLayerGroup = null;
        }
    };

    // Clear selection on map click
    map.on('click', window.clearAllSelections);

    document.addEventListener('click', (e) => {
        const row = e.target.closest('.inline-chart-row');
        if (!row) return;

        const category = row.getAttribute('data-category');
        const layerKey = row.getAttribute('data-layer');
        const barColor = row.getAttribute('data-chart-color') || '#ffeb3b';
        const layerGroup = loadedLayers[layerKey];
        if (!layerGroup) return;

        // Reset previous styles
        if (currentSelectedLayerKey && loadedLayers[currentSelectedLayerKey]) {
            loadedLayers[currentSelectedLayerKey].eachLayer(layer => {
                loadedLayers[currentSelectedLayerKey].resetStyle(layer);
            });
        }

        // If clicking the same category, it's a toggle off
        if (currentSelectedCategory === category && currentSelectedLayerKey === layerKey) {
            currentSelectedCategory = null;
            currentSelectedLayerKey = null;
            return;
        }

        currentSelectedCategory = category;
        currentSelectedLayerKey = layerKey;
        
        const isVariedade = layerKey.toUpperCase().includes('VARIEDADE');
        
        const bounds = L.latLngBounds();
        let hasMatches = false;

        layerGroup.eachLayer(layer => {
            const props = layer.feature.properties || {};
            let tipo = props['DL TIPOCONTRA'] || props.TIPOCONTRA || 'NÃO DEFINIDO';
            if (isVariedade) {
                tipo = props['DL VARIEDADE'] || props.VARIEDADE || props.variedade || 'NÃO DEFINIDO';
            }
            
            let isMatch = (tipo === category);
            if (category === 'Outras') {
                isMatch = !window.currentChartTopLabels.includes(tipo);
            }
            
            if (isMatch) {
                // Highlight
                layer.setStyle({
                    weight: 3,
                    color: barColor,
                    fillOpacity: 0.8
                });
                if (layer.bringToFront) {
                    layer.bringToFront();
                }
                
                if (layer.getBounds) {
                    bounds.extend(layer.getBounds());
                    hasMatches = true;
                }
            } else {
                // Dim non-matching
                layer.setStyle({
                    fillOpacity: 0.1,
                    weight: 1,
                    color: '#555'
                });
            }
        });

        if (hasMatches && bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
        }
    });

    // Handle Team Selection (Fly to team only)
    document.addEventListener('click', (e) => {
        const teamItem = e.target.closest('.team-list-item');
        if (teamItem) {
            document.querySelectorAll('.team-list-item').forEach(el => el.classList.remove('active'));
            teamItem.classList.add('active');
            
            const teamName = teamItem.getAttribute('data-team-name');
            
            // Pular para o ícone se já estiver posicionado no mapa
            if (window.savedEquipes && window.savedEquipes[teamName]) {
                const coords = window.savedEquipes[teamName];
                map.flyTo([coords[1], coords[0]], 16, { duration: 1.5 });
            }
        }
    });

    // --- PROGRAMAÇÃO DE SERVIÇO TABS ---
    const progContainer = document.getElementById('programacao-list');
    if (progContainer && window.workingEquipesData && window.workingEquipesData.length > 0) {
        let tratos = [];
        let corte = [];
        let outros = [];

        window.workingEquipesData.forEach(eq => {
            let act = (eq.ATIVIDADE || '').toUpperCase();
            if (act.includes('CORTE MECANIZADO')) {
                corte.push(eq);
            } else if (act.includes('DRONE') || act.includes('LIMPEZA') || act.includes('CATAÇÃO') || act.includes('CATACAO') || act.includes('HERBICIDA')) {
                tratos.push(eq);
            } else {
                outros.push(eq);
            }
        });

        const buildTab = (title, items) => {
            if (items.length === 0) return '';
            
            let iconSvg = '';
            let accColor = '#fff';
            if (title.includes('Corte')) {
                accColor = '#e85d04';
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="8" height="8" rx="1"></rect><path d="M11 12h4l3 3v3h-7"></path><path d="M18 18h1v-6l-3-3h-4V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v2"></path><circle cx="6" cy="18" r="2"></circle><circle cx="15" cy="18" r="2"></circle></svg>`;
            } else if (title.includes('Tratos')) {
                accColor = '#0077b6';
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>`;
            } else {
                accColor = '#8fa89b';
                iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${accColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
            }

            const avenzaIcon = `<div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(255, 255, 255, 0.03); display: flex; justify-content: center; align-items: center; margin-right: 12px; flex-shrink: 0;">${iconSvg}</div>`;
            const subtitleText = items.length === 1 ? '1 equipe' : items.length + ' equipes';

            let html = `
                <div class="accordion-item" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div class="accordion-header layer-main-row" style="padding: 8px 16px; border-bottom: none; display: flex; align-items: center; cursor: pointer; transition: background 0.2s;">
                        ${avenzaIcon}
                        <div class="layer-text-container" style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; text-align: left;">
                            <div class="layer-name" style="font-size: 14px; font-weight: 500; color: var(--text-main); line-height: 1; text-transform: capitalize;">${title}</div>
                            <div class="layer-subtitle" style="font-size: 9px; color: rgba(255, 255, 255, 0.25); margin-top: 0px; line-height: 1;">${subtitleText}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="acc-icon" style="font-size: 10px; color: rgba(255,255,255,0.3); font-weight: bold; width: 16px; text-align: center;">▼</span>
                        </div>
                    </div>
                    <div class="accordion-content" style="display: none; padding: 10px 16px 15px 64px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
            `;
            items.forEach(eq => {
                let showPin = window.savedEquipes[eq.EQUIPE];
                if (title === 'Outros') showPin = false; // Never show pin for Outros
                
                html += `
                    <div class="team-list-item" data-team-name="${eq.EQUIPE}" data-team-atividade="${eq.ATIVIDADE || ''}">
                        <span>${eq.EQUIPE}</span>
                        ${showPin ? '<span class="team-status-placed" style="margin-left:auto; font-size:12px;">📍</span>' : ''}
                    </div>
                `;
            });
            html += `</div></div></div>`;
            return html;
        };

        progContainer.innerHTML = buildTab('Tratos Culturais', tratos) + 
                                  buildTab('Corte Mecanizado', corte) + 
                                  buildTab('Outros', outros);

        // Accordion functionality
        progContainer.querySelectorAll('.accordion-header').forEach(header => {
            header.addEventListener('click', () => {
                const content = header.nextElementSibling;
                const icon = header.querySelector('.acc-icon');
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.innerHTML = '▲';
                    header.style.backgroundColor = 'rgba(255,255,255,0.03)';
                } else {
                    content.style.display = 'none';
                    icon.innerHTML = '▼';
                    header.style.backgroundColor = 'transparent';
                }
            });
        });
    }

    // --- MEASUREMENT TOOL LOGIC ---
    let measureActive = false;
    let measureFinished = false;
    let measurePoints = [];
    let measureLines = L.polyline([], {color: '#ffeb3b', weight: 3, dashArray: '5, 10'}).addTo(map);
    let measurePolygon = L.polygon([], {color: '#ffeb3b', weight: 2, fillColor: '#ffeb3b', fillOpacity: 0.2}).addTo(map);
    let measureMarkers = L.layerGroup().addTo(map);
    let tempLine = L.polyline([], {color: '#ffeb3b', weight: 3, dashArray: '5, 10', opacity: 0.5}).addTo(map);
    
    const btnMeasure = document.getElementById('tool-measure-btn');
    const resultPanel = document.getElementById('measure-result');
    const distEl = document.getElementById('measure-distance');
    const areaEl = document.getElementById('measure-area');
    const btnClear = document.getElementById('tool-measure-clear');

    // Make panel draggable
    if (resultPanel) {
        const dragHandle = document.getElementById('measure-drag-handle');
        const draggable = new L.Draggable(resultPanel, dragHandle);
        draggable.enable();
    }

    function resetMeasure() {
        measurePoints = [];
        measureFinished = false;
        measureLines.setLatLngs([]);
        measurePolygon.setLatLngs([]);
        measureMarkers.clearLayers();
        tempLine.setLatLngs([]);
        distEl.textContent = '0 m';
        areaEl.textContent = '0 ha';
        if (measureActive) {
            map.getContainer().style.cursor = 'crosshair';
        }
    }

    function deactivateMeasure() {
        measureActive = false;
        measureFinished = false;
        btnMeasure.style.background = 'rgba(255,255,255,0.05)';
        btnMeasure.style.borderColor = 'rgba(255,255,255,0.1)';
        resultPanel.style.display = 'none';
        map.getContainer().style.cursor = '';
        resetMeasure();
    }

    btnMeasure.addEventListener('click', () => {
        if (measureActive) {
            deactivateMeasure();
        } else {
            measureActive = true;
            measureFinished = false;
            btnMeasure.style.background = 'rgba(232, 93, 4, 0.2)';
            btnMeasure.style.borderColor = '#e85d04';
            resultPanel.style.display = 'flex';
            map.getContainer().style.cursor = 'crosshair';
            resetMeasure();
            
            // Auto-close tools panel so user can see map clearly
            document.getElementById('floating-tools-panel').style.display = 'none';
        }
    });

    btnClear.addEventListener('click', resetMeasure);
    document.getElementById('close-measure-btn').addEventListener('click', deactivateMeasure);

    function finishMeasurement() {
        measureFinished = true;
        tempLine.setLatLngs([]);
        map.getContainer().style.cursor = '';
    }

    map.on('click', (e) => {
        if (!measureActive) return;

        if (measureFinished) {
            deactivateMeasure();
            return;
        }
        
        const latlng = e.latlng;
        measurePoints.push(latlng);
        
        // Add marker
        const marker = L.circleMarker(latlng, {
            radius: 5,
            fillColor: '#ffeb3b',
            color: '#000',
            weight: 1,
            fillOpacity: 1
        }).addTo(measureMarkers);
        
        // Finalize on marker click
        marker.on('click', (ev) => {
            if (measurePoints.length > 2 && !measureFinished) {
                L.DomEvent.stopPropagation(ev);
                finishMeasurement();
            }
        });

        updateMeasureDisplay();
    });

    map.on('contextmenu', (e) => {
        if (measureActive && !measureFinished && measurePoints.length > 0) {
            finishMeasurement();
        }
    });

    map.on('mousemove', (e) => {
        if (!measureActive || measureFinished || measurePoints.length === 0) return;
        const currentPoints = [...measurePoints, e.latlng];
        tempLine.setLatLngs(currentPoints);
    });

    // Escape to finish
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && measureActive && !measureFinished) {
            finishMeasurement();
        }
    });

    function updateMeasureDisplay() {
        if (measurePoints.length === 0) {
            distEl.textContent = '0 m';
            areaEl.textContent = '0 ha';
            return;
        }

        measureLines.setLatLngs(measurePoints);
        
        if (measurePoints.length > 2) {
            measurePolygon.setLatLngs(measurePoints);
        } else {
            measurePolygon.setLatLngs([]);
        }

        // Calculate Distance
        let distance = 0;
        if (measurePoints.length > 1) {
            for (let i = 0; i < measurePoints.length - 1; i++) {
                distance += measurePoints[i].distanceTo(measurePoints[i+1]);
            }
        }
        
        if (distance > 1000) {
            distEl.textContent = (distance / 1000).toFixed(2) + ' km';
        } else {
            distEl.textContent = distance.toFixed(0) + ' m';
        }

        // Calculate Area using Turf.js
        if (measurePoints.length > 2) {
            const coords = measurePoints.map(p => [p.lng, p.lat]);
            // close the polygon
            coords.push([measurePoints[0].lng, measurePoints[0].lat]);
            
            try {
                if (typeof turf !== 'undefined') {
                    const polygon = turf.polygon([coords]);
                    const areaSqMeters = turf.area(polygon);
                    const areaHectares = areaSqMeters / 10000;
                    areaEl.textContent = areaHectares.toFixed(2) + ' ha';
                }
            } catch (err) {
                areaEl.textContent = 'Erro';
            }
        } else {
            areaEl.textContent = '0 ha';
        }
    }

    // --- GPS REAL-TIME TRACKING LOGIC ---
    let gpsActive = true;
    let gpsMarker = null;
    let gpsCircle = null;
    let hasCenteredInitialGps = false;

    // Start tracking by default without forcing continuous centering
    map.locate({setView: false, watch: true, enableHighAccuracy: true});

    map.on('locationfound', (e) => {
        if (!gpsActive) return;
        const radius = e.accuracy / 2;

        if (!gpsMarker) {
            // Pulsating GPS marker
            gpsMarker = L.circleMarker(e.latlng, {
                radius: 8,
                fillColor: '#2196F3',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8,
                className: 'pulse-marker' // Custom CSS class for pulse if defined
            }).addTo(map);
            
            gpsCircle = L.circle(e.latlng, radius, {
                color: '#2196F3',
                fillColor: '#2196F3',
                fillOpacity: 0.1,
                weight: 1
            }).addTo(map);
        } else {
            gpsMarker.setLatLng(e.latlng);
            gpsCircle.setLatLng(e.latlng);
            gpsCircle.setRadius(radius);
        }
        
        // Export to window for the locate control to easily access
        window._agrogis_gpsMarker = gpsMarker;
        
        // Optionally center map on user continuously
        // map.setView(e.latlng);
    });

    map.on('locationerror', (e) => {
        if (gpsActive) {
            console.warn('Não foi possível acessar a localização do dispositivo: ' + e.message);
        }
    });

    // --- ROUTE TOOL LOGIC ---
    const btnRoute = document.getElementById('tool-route-btn');
    const routePanel = document.getElementById('route-panel');
    const btnRouteOrigin = document.getElementById('route-btn-origin');
    const btnRouteDest = document.getElementById('route-btn-dest');
    let routingControl = null;
    let rotasNdbLayer = null;

    window.routeSelectionMode = null;
    let routeOriginData = null;
    let routeDestData = null;

    function setRouteSelectionMode(mode) {
        window.routeSelectionMode = mode;
        if (btnRouteOrigin) {
            btnRouteOrigin.style.background = mode === 'origin' ? 'rgba(232, 93, 4, 0.4)' : 'rgba(255,255,255,0.1)';
            btnRouteOrigin.style.borderColor = mode === 'origin' ? '#e85d04' : 'rgba(255,255,255,0.2)';
            const input = document.getElementById('route-search-origin');
            if(input) input.style.borderColor = mode === 'origin' ? '#e85d04' : 'rgba(255,255,255,0.2)';
        }
        if (btnRouteDest) {
            btnRouteDest.style.background = mode === 'dest' ? 'rgba(232, 93, 4, 0.4)' : 'rgba(255,255,255,0.1)';
            btnRouteDest.style.borderColor = mode === 'dest' ? '#e85d04' : 'rgba(255,255,255,0.2)';
            const input = document.getElementById('route-search-dest');
            if(input) input.style.borderColor = mode === 'dest' ? '#e85d04' : 'rgba(255,255,255,0.2)';
        }
        if (mode) {
            map.getContainer().style.cursor = 'crosshair';
        } else {
            map.getContainer().style.cursor = '';
        }
    }

    if (btnRouteOrigin) btnRouteOrigin.addEventListener('click', () => setRouteSelectionMode('origin'));
    if (btnRouteDest) btnRouteDest.addEventListener('click', () => setRouteSelectionMode('dest'));

    const btnRouteMyLoc = document.getElementById('route-btn-myloc');
    if (btnRouteMyLoc) {
        btnRouteMyLoc.addEventListener('click', () => {
            if (window._agrogis_gpsMarker) {
                const latlng = window._agrogis_gpsMarker.getLatLng();
                // Set origin mode to properly update state and text
                window.routeSelectionMode = 'origin';
                window.setRouteWaypoint('Minha Localização', latlng.lat, latlng.lng);
            } else {
                alert('Aguarde o GPS encontrar sua localização primeiro.');
            }
        });
    }

    window.setRouteWaypoint = function(title, lat, lng) {
        if (window.routeSelectionMode === 'origin') {
            routeOriginData = {lat, lng};
            const inputOrig = document.getElementById('route-search-origin');
            if (inputOrig) inputOrig.value = title;
            // Switch to waiting for destination automatically
            setRouteSelectionMode('dest');
        } else if (window.routeSelectionMode === 'dest') {
            routeDestData = {lat, lng};
            const inputDest = document.getElementById('route-search-dest');
            if (inputDest) inputDest.value = title;
            // Finish selection and auto calculate
            setRouteSelectionMode(null);
            calculateRoute();
        }
    };

    function handleRouteSearch(e, mode) {
        const query = e.target.value.toLowerCase().trim();
        if (!query) return;

        for (const layerName in loadedLayers) {
            if (!layerName.toUpperCase().includes('FAZENDA')) continue;
            
            const layerGroup = loadedLayers[layerName];
            layerGroup.eachLayer(layer => {
                const props = layer.feature.properties || {};
                const title = props.nome || props.NOME || props.Name || props.talhao || props.TALHAO || props.id || props.designacao || '';
                
                if (title.toLowerCase() === query) {
                    let lat, lng;
                    if (typeof turf !== 'undefined') {
                        const centroid = turf.centroid(layer.feature);
                        lat = centroid.geometry.coordinates[1];
                        lng = centroid.geometry.coordinates[0];
                    } else {
                        const center = layer.getBounds().getCenter();
                        lat = center.lat;
                        lng = center.lng;
                    }
                    window.routeSelectionMode = mode;
                    window.setRouteWaypoint(title, lat, lng);
                }
            });
        }
    }

    const routeSearchOrig = document.getElementById('route-search-origin');
    if (routeSearchOrig) routeSearchOrig.addEventListener('input', (e) => handleRouteSearch(e, 'origin'));
    
    const routeSearchDest = document.getElementById('route-search-dest');
    if (routeSearchDest) routeSearchDest.addEventListener('input', (e) => handleRouteSearch(e, 'dest'));

    if (routePanel) {
        const routeDragHandle = document.getElementById('route-drag-handle');
        const draggableRoute = new L.Draggable(routePanel, routeDragHandle);
        draggableRoute.enable();
    }

    function deactivateRoute() {
        if (routePanel) routePanel.style.display = 'none';
        btnRoute.style.background = 'rgba(255,255,255,0.05)';
        btnRoute.style.borderColor = 'rgba(255,255,255,0.1)';
        setRouteSelectionMode(null);
        if (routingControl) {
            map.removeControl(routingControl);
            routingControl = null;
        }
        if (rotasNdbLayer) {
            map.removeLayer(rotasNdbLayer);
            rotasNdbLayer = null;
        }
        const routeInfo = document.getElementById('route-info');
        if (routeInfo) routeInfo.style.display = 'none';
        map.getContainer().classList.remove('route-active');
    }

    btnRoute.addEventListener('click', () => {
        if (routePanel.style.display === 'flex' || routePanel.style.display === 'block') {
            deactivateRoute();
        } else {
            routePanel.style.display = 'flex';
            btnRoute.style.background = 'rgba(232, 93, 4, 0.2)';
            btnRoute.style.borderColor = '#e85d04';
            document.getElementById('floating-tools-panel').style.display = 'none';
            
            // Auto-start origin selection mode
            routeOriginData = null;
            routeDestData = null;
            const routeInfo = document.getElementById('route-info');
            if (routeInfo) routeInfo.style.display = 'none';
            setRouteSelectionMode('origin');
            
            // Origin selection active
        }
    });

    document.getElementById('close-route-btn').addEventListener('click', deactivateRoute);
    
    // (Route map click to close removed per user request)

    function calculateRoute() {
        if (!routeOriginData || !routeDestData) {
            alert('Por favor, selecione origem e destino clicando no mapa.');
            return;
        }
        
        if (routingControl) {
            map.removeControl(routingControl);
        }
        
        // Check if L.Routing is available (Leaflet Routing Machine)
        if (typeof L.Routing === 'undefined') {
            alert('Erro: Sistema de rotas não está carregado.');
            return;
        }

        const routeInfo = document.getElementById('route-info');
        const distText = document.getElementById('route-distance-text');
        
        if (routeInfo) {
            routeInfo.style.display = 'flex';
            if (distText) distText.textContent = 'Calculando...';
        }

        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(routeOriginData.lat, routeOriginData.lng),
                L.latLng(routeDestData.lat, routeDestData.lng)
            ],
            routeWhileDragging: false,
            language: 'pt-BR',
            show: false, // Hide the default itinerary text box to keep UI clean
            lineOptions: {
                styles: [{color: '#e85d04', opacity: 0.8, weight: 6}]
            }
        }).addTo(map);

        routingControl.on('routesfound', function(e) {
            map.getContainer().classList.add('route-active');
            const routes = e.routes;
            const summary = routes[0].summary;
            if (distText) {
                if (summary.totalDistance > 1000) {
                    distText.textContent = (summary.totalDistance / 1000).toFixed(2) + ' km';
                } else {
                    distText.textContent = Math.round(summary.totalDistance) + ' m';
                }
            }
            
            // Fit map to route bounds to ensure visibility of the whole route
            if (routes && routes[0] && routes[0].coordinates) {
                map.fitBounds(L.latLngBounds(routes[0].coordinates), { padding: [50, 50] });
            }
        });

        routingControl.on('routingerror', function() {
            if (distText) distText.textContent = 'Erro ao calcular';
        });

        // Load ROTAS_NDB to complement the network visually
        if (!rotasNdbLayer) {
            fetch('ROTAS_NDB.geojson')
                .then(res => res.json())
                .then(data => {
                    rotasNdbLayer = L.geoJSON(data, {
                        style: {
                            color: '#ffeb3b', // Distinct yellow for internal roads
                            weight: 4,
                            dashArray: '8, 8',
                            opacity: 0.9
                        }
                    }).addTo(map);
                    rotasNdbLayer.bindTooltip('Rota NDB (Complementar)', {direction: 'top'});
                })
                .catch(err => console.error("Erro ao carregar ROTAS_NDB:", err));
        }
    }

    // GPS is auto-activated above now

});
