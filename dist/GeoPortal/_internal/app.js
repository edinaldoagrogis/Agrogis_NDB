// NDB Holding Agrícola Geoportal JavaScript Core (Dynamic)

document.addEventListener('DOMContentLoaded', () => {
    const isTouchDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 1. Initialize Leaflet Map
    const map = L.map('map', {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true, // Back on: 100x speed for polygons (GPS freeze fixed)
        rotate: isTouchDevice,
        touchRotate: false // Disabled by default, toggled by compass
    }).setView([-17.8, -40.0], 7);
    window.map = map; // Expose globally for modules
    
    // Custom Compass Control (Rotation Toggle)
    const CompassControl = L.Control.extend({
        options: { position: 'bottomright' },
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.style.backgroundColor = 'var(--bg-secondary)';
            container.style.border = '1px solid rgba(255,255,255,0.1)';
            container.style.width = '44px';
            container.style.height = '44px';
            container.style.display = 'flex';
            container.style.justifyContent = 'center';
            container.style.alignItems = 'center';
            container.style.cursor = 'pointer';
            container.style.borderRadius = '12px';
            container.style.marginBottom = '10px';
            container.style.marginRight = '10px';
            container.style.backdropFilter = 'blur(12px)';
            container.id = 'btn-compass-control';
            container.title = 'Habilitar/Desabilitar Rotação Livre';

            const icon = L.DomUtil.create('div', '', container);
            icon.innerHTML = '🧭';
            icon.style.fontSize = '24px';
            icon.style.transition = 'opacity 0.2s';
            icon.style.opacity = '0.5'; // Default locked state (greyed out)
            
            let isUnlocked = false;
            let rafId = null;

            if (typeof map.getBearing === 'function') {
                map.on('rotate', function() {
                    if (rafId) cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(() => {
                        const bearing = map.getBearing();
                        icon.style.transform = `rotate(${bearing}deg) translateZ(0)`;
                    });
                });
            }

            container.onclick = function(e) {
                L.DomEvent.stopPropagation(e);
                isUnlocked = !isUnlocked;
                
                if (isUnlocked) {
                    if (map.touchRotate) map.touchRotate.enable();
                    container.classList.add('is-active-compass');
                    icon.style.opacity = '1';
                    container.style.borderColor = '#e85d04';
                    container.style.boxShadow = '0 0 10px rgba(232,93,4,0.3)';
                } else {
                    if (map.touchRotate) map.touchRotate.disable();
                    if (typeof map.setBearing === 'function') map.setBearing(0);
                    container.classList.remove('is-active-compass');
                    icon.style.opacity = '0.5';
                    container.style.borderColor = 'rgba(255,255,255,0.1)';
                    container.style.boxShadow = 'none';
                }
            };
            return container;
        }
    });
    
    if (isTouchDevice) {
        map.addControl(new CompassControl());
    }
    
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
            container.style.border = '1px solid rgba(255,255,255,0.1)';
            container.style.borderRadius = '12px';
            container.style.backdropFilter = 'blur(12px)';
            container.style.width = '44px';
            container.style.height = '44px';
            container.style.cursor = 'pointer';
            container.style.display = 'flex';
            container.style.justifyContent = 'center';
            container.style.alignItems = 'center';
            container.style.marginBottom = '10px';
            container.style.marginRight = '10px';
            container.title = 'Minha Localização';

            const icon = L.DomUtil.create('span', '', container);
            icon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-main)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>`;

            container.onclick = function(e){
                L.DomEvent.stopPropagation(e);
                
                const compassBtn = document.getElementById('btn-compass-control');
                if (compassBtn && compassBtn.classList.contains('is-active-compass')) {
                    compassBtn.click(); // Desativa a bussola de forma limpa (restaura estilo e reseta rotacao)
                } else if (typeof map.setBearing === 'function') {
                    map.setBearing(0); // Failsafe para alinhar ao Norte
                }
                
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
    const ZOOM_THRESHOLD = 14; // Fazendas (Appears closer)
    const TALHOES_ZOOM_THRESHOLD = 15; // Talhões (Appears closer)
    const EQUIPES_ZOOM_THRESHOLD = isMobile ? 10 : 8; // Equipes
    
    // Dynamic Layer Engine Stores
    const loadedLayers = {}; // Store layer objects for toggling/searching
    window.loadedLayers = loadedLayers; // Expose for modules
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
            
            if (talhoesEnabled && zoom >= TALHOES_ZOOM_THRESHOLD) {
                const bounds = map.getBounds().pad(0.1); // smaller pad for faster checks
                for (const item of layerLabels.TALHOES) {
                    const isVisible = bounds.contains(item.latlng);
                    const hasLayer = item.marker && activeLabelGroups.TALHOES.hasLayer(item.marker);
                    
                    if (isVisible) {
                        if (!item.marker) {
                            // Lazy instantiate marker only when it first enters viewport
                            item.marker = L.marker(item.latlng, {
                                icon: L.divIcon({
                                    className: 'custom-talhao-label-container',
                                    html: item.html,
                                    iconSize: [60, 40],
                                    iconAnchor: [30, 20]
                                }),
                                interactive: false
                            });
                        }
                        if (!hasLayer) activeLabelGroups.TALHOES.addLayer(item.marker);
                    } else if (!isVisible && hasLayer) {
                        activeLabelGroups.TALHOES.removeLayer(item.marker);
                    }
                }
            } else {
                // Only clear if we zoom out or disable
                if (activeLabelGroups.TALHOES.getLayers().length > 0) {
                    activeLabelGroups.TALHOES.clearLayers();
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
    
    const debouncedUpdateLabelVisibility = debounce(updateLabelVisibility, 50);

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



    if (typeof GEOPORTAL_LAYERS !== 'undefined') {
        
        // --- PROCESS EQUIPES VIA LOCALSTORAGE REMOVIDO ---
        
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
            
            // EXCLUI CAMADA DE VARIEDADE (Ignora no carregamento)
            if (layerName.toUpperCase().includes('VARIEDADE')) {
                continue;
            }

            if (isFazenda) baseColor = '#ff9f1c'; 
            if (isTalhao) baseColor = '#2ec4b6'; 
            colorIndex++;

            const styleFunc = function(feature) {
                let featureColor = baseColor;
                if (isTalhao && feature.properties) {
                    const farmName = feature.properties.NOME_FAZ || feature.properties.FAZENDA || feature.properties.nome_faz;
                    if (farmName) {
                        featureColor = getFarmColor(farmName);
                    }
                }
                return {
                    color: isTalhao ? '#b0b0b0' : featureColor,
                    weight: isTalhao ? 0.8 : (isFazenda ? 0 : 1.5),
                    opacity: isFazenda ? 0 : 0.9,
                    fillColor: featureColor,
                    fillOpacity: isTalhao ? 0.85 : (isFazenda ? 0 : 0.2)
                };
            };
            
            // Store styles for search logic
            layerStyles[layerName] = {
                default: styleFunc, // use the function directly
                highlight: { weight: 3.5, opacity: 1, fillOpacity: 1.0 }
            };

            // Create Map Layer
            const mapLayer = L.geoJSON(data, {
                smoothFactor: 0.5, // Balance geometry precision with Canvas rendering constraints

                style: styleFunc,
                pointToLayer: function (feature, latlng) {
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
                    // Popup is now bound dynamically on click so it doesn't interfere with routing clicks
                    if (isFazenda) {
                        if (!window.labeledFazendas) window.labeledFazendas = new Set();
                        if (!window.labeledFazendas.has(title)) {
                            layer.bindTooltip(title, {
                                permanent: true,
                                direction: 'center',
                                className: 'fazenda-transparent-label'
                            });
                            window.labeledFazendas.add(title);
                        }

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
                            // Store data but DEFER L.marker instantiation to massively speed up init
                            layerLabels.TALHOES.push({
                                latlng: layer.getBounds().getCenter(),
                                html: html,
                                marker: null
                            });
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

                            // If we are measuring, ignore the polygon click and let it bubble to the map!
                            if (window.measureActive) {
                                return;
                            }

                            // If we are NOT tracing a route or measuring, open the attribute table popup
                            L.popup({ autoPanPadding: [50, 50] })
                                .setLatLng(e.latlng)
                                .setContent(createPopupContent(title, props))
                                .openOn(map);

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
                                // Abre painel de análise de satélite para o talhão clicado (PC)
                                if (isTalhao && window.openWeedAnalysisPanel) {
                                    window.openWeedAnalysisPanel({ type: 'Feature', geometry: feature.geometry, properties: props }, props);
                                }
                            }
                        }
                    });
                }
            });

            // Add to map by default only if it's Fazenda or Talhao
            const isDefaultActive = isFazenda || isTalhao;
            if (isDefaultActive) {
                mapLayer.addTo(map);
            }
            
            loadedLayers[layerName] = mapLayer;

            // Expand Bounds
            if (mapLayer.getBounds().isValid()) {
                globalBounds.extend(mapLayer.getBounds());
            }

            // Create UI Checkbox
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
    } else {
        console.warn("GEOPORTAL_LAYERS data not found. Please run INICIAR_GEOPORTAL.bat");
        dynamicLayerList.innerHTML = '<li style="color:#e71d36; font-size:12px;">Por favor, execute o arquivo INICIAR_GEOPORTAL.bat</li>';
    }

    // --- CUSTOM LAYERS LOGIC ---
    let myLayers = {
        pontos: null,
        areas: null,
        rotas: null
    };

    function saveCustomFeature(type, geoJsonFeature) {
        const key = `agrogis_custom_${type}`;
        let existing = localStorage.getItem(key);
        let featureCollection = { type: 'FeatureCollection', features: [] };
        if (existing) {
            try { featureCollection = JSON.parse(existing); } catch(e){}
        }
        
        if (!geoJsonFeature.properties.id) {
            geoJsonFeature.properties.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        }
        
        featureCollection.features.push(geoJsonFeature);
        localStorage.setItem(key, JSON.stringify(featureCollection));
        
        // Reload layer
        loadCustomLayer(type, featureCollection);
        renderCustomFeaturesList(type);
    }

    function deleteCustomFeature(type, id) {
        if (!confirm('Deseja realmente excluir este item?')) return;
        const key = `agrogis_custom_${type}`;
        let existing = localStorage.getItem(key);
        if (existing) {
            try { 
                let fc = JSON.parse(existing);
                fc.features = fc.features.filter(f => f.properties.id !== id);
                localStorage.setItem(key, JSON.stringify(fc));
                loadCustomLayer(type, fc);
                renderCustomFeaturesList(type);
            } catch(e){}
        }
    }

    function editCustomFeatureName(type, id, oldName) {
        openNameModal(oldName || '', (newName) => {
            if (!newName) return;
            const key = `agrogis_custom_${type}`;
            let existing = localStorage.getItem(key);
            if (existing) {
                try { 
                    let fc = JSON.parse(existing);
                    let feat = fc.features.find(f => f.properties.id === id);
                    if (feat) {
                        feat.properties.NOME = newName;
                        localStorage.setItem(key, JSON.stringify(fc));
                        loadCustomLayer(type, fc);
                        renderCustomFeaturesList(type);
                    }
                } catch(e){}
            }
        });
    }

    // Context Menu Global para Editar/Excluir
    let activeContextMenu = null;
    function showContextMenu(type, id, name, latlng) {
        if (activeContextMenu) {
            map.removeLayer(activeContextMenu);
        }
        
        const content = document.createElement('div');
        content.className = 'custom-context-menu';
        content.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; font-size: 13px;">${name}</div>
            <button id="ctx-edit-btn" style="width: 100%; text-align: left; background: none; border: none; color: #2ec4b6; padding: 6px; cursor: pointer; font-size: 13px;">✏️ Editar Nome</button>
            <button id="ctx-del-btn" style="width: 100%; text-align: left; background: none; border: none; color: #e71d36; padding: 6px; cursor: pointer; font-size: 13px; margin-top: 4px;">🗑️ Excluir</button>
        `;
        
        const popup = L.popup({
            closeButton: true,
            minWidth: 150,
            className: 'action-context-popup'
        })
        .setLatLng(latlng)
        .setContent(content)
        .openOn(map);
        
        activeContextMenu = popup;
        
        // Wait for DOM
        setTimeout(() => {
            const btnEdit = document.getElementById('ctx-edit-btn');
            const btnDel = document.getElementById('ctx-del-btn');
            if (btnEdit) btnEdit.addEventListener('click', () => {
                map.closePopup(popup);
                editCustomFeatureName(type, id, name);
            });
            if (btnDel) btnDel.addEventListener('click', () => {
                map.closePopup(popup);
                deleteCustomFeature(type, id);
            });
        }, 50);
    }

    function loadCustomLayer(type, featureCollection) {
        if (!featureCollection) {
            const key = `agrogis_custom_${type}`;
            const existing = localStorage.getItem(key);
            if (existing) {
                try { featureCollection = JSON.parse(existing); } catch(e){}
            } else {
                featureCollection = { type: 'FeatureCollection', features: [] };
            }
        }
        
        // Garantir que todos tenham ID
        let updated = false;
        featureCollection.features.forEach(f => {
            if (!f.properties.id) {
                f.properties.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
                updated = true;
            }
        });
        if (updated) {
            localStorage.setItem(`agrogis_custom_${type}`, JSON.stringify(featureCollection));
        }
        
        if (myLayers[type]) {
            myLayers[type].clearLayers();
            myLayers[type].addData(featureCollection);
        } else {
            let options = {
                onEachFeature: (feature, layer) => {
                    if (feature.properties) {
                        // Bind Popup with Action Buttons
                        const baseContent = createPopupContent(feature.properties.NOME || 'Sem Nome', feature.properties);
                        const popupContainer = document.createElement('div');
                        popupContainer.innerHTML = baseContent;
                        
                        const actionsDiv = document.createElement('div');
                        actionsDiv.style.marginTop = '10px';
                        actionsDiv.style.borderTop = '1px solid rgba(255,255,255,0.1)';
                        actionsDiv.style.paddingTop = '8px';
                        actionsDiv.style.display = 'flex';
                        actionsDiv.style.justifyContent = 'space-around';
                        
                        const btnEdit = document.createElement('button');
                        btnEdit.innerHTML = '✏️ Editar';
                        btnEdit.style.cssText = 'background: rgba(46, 196, 182, 0.1); border: 1px solid #2ec4b6; border-radius: 4px; color: #2ec4b6; font-size: 12px; cursor: pointer; padding: 4px 8px; flex-grow: 1; margin-right: 5px;';
                        btnEdit.onclick = () => {
                            map.closePopup();
                            editCustomFeatureName(type, feature.properties.id, feature.properties.NOME || 'Sem Nome');
                        };
                        
                        const btnDel = document.createElement('button');
                        btnDel.innerHTML = '🗑️ Excluir';
                        btnDel.style.cssText = 'background: rgba(231, 29, 54, 0.1); border: 1px solid #e71d36; border-radius: 4px; color: #e71d36; font-size: 12px; cursor: pointer; padding: 4px 8px; flex-grow: 1; margin-left: 5px;';
                        btnDel.onclick = () => {
                            map.closePopup();
                            deleteCustomFeature(type, feature.properties.id);
                        };
                        
                        actionsDiv.appendChild(btnEdit);
                        actionsDiv.appendChild(btnDel);
                        popupContainer.appendChild(actionsDiv);
                        
                        layer.bindPopup(popupContainer, { className: 'custom-popup' });
                        
                        if (feature.properties.NOME) {
                            layer.bindTooltip(feature.properties.NOME, {
                                permanent: false,
                                direction: 'center',
                                className: 'custom-label-tooltip'
                            });
                        }
                    }
                }
            };
            
            if (type === 'pontos') {
                options.pointToLayer = (feature, latlng) => {
                    return L.circleMarker(latlng, {
                        radius: 6,
                        fillColor: '#e71d36',
                        color: '#fff',
                        weight: 2,
                        fillOpacity: 1
                    });
                };
            } else if (type === 'areas') {
                options.style = {
                    color: '#2ec4b6',
                    weight: 2,
                    fillColor: '#2ec4b6',
                    fillOpacity: 0.4
                };
            } else if (type === 'rotas') {
                options.style = {
                    color: '#ff9f1c',
                    weight: 4,
                    dashArray: '5, 10'
                };
            }
            
            myLayers[type] = L.geoJSON(featureCollection, options);
            loadedLayers[type.toUpperCase()] = myLayers[type];
        }
    }

    function initCustomLayers() {
        loadCustomLayer('pontos');
        loadCustomLayer('areas');
        loadCustomLayer('rotas');
        
        const li = document.createElement('li');
        li.className = 'layer-item custom-layers-group';
        li.style.display = 'block';
        li.style.marginTop = '15px';
        li.style.borderTop = '1px solid rgba(255,255,255,0.1)';
        li.style.paddingTop = '15px';
        
        const avenzaIcon = `<div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); display: flex; justify-content: center; align-items: center; margin-right: 12px; flex-shrink: 0;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ec4b6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg></div>`;
        
        li.innerHTML = `
            <div class="layer-main-row" style="cursor: pointer;">
                ${avenzaIcon}
                <div class="layer-text-container" style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; text-align: left;">
                    <div class="layer-name" style="font-size: 14px; font-weight: bold; color: #fff; line-height: 1;">Minhas Camadas</div>
                    <div class="layer-subtitle" style="font-size: 9px; color: rgba(255, 255, 255, 0.4); margin-top: 2px;">Meus desenhos e rotas</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span class="submenu-arrow" style="font-size: 10px; color: rgba(255,255,255,0.5); font-weight: bold; width: 16px; text-align: center;">▼</span>
                </div>
            </div>
            <div class="layer-submenu" style="display: none; margin-top: 10px; margin-left: 35px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; padding-bottom: 5px;">
                ${createSubLayerToggle('pontos', 'Pontos Marcados', '#e71d36')}
                ${createSubLayerToggle('areas', 'Áreas Desenhadas', '#2ec4b6')}
                ${createSubLayerToggle('rotas', 'Rotas Gravadas', '#ff9f1c')}
            </div>
        `;
        
        dynamicLayerList.appendChild(li);
        
        // Render initial lists
        renderCustomFeaturesList('pontos');
        renderCustomFeaturesList('areas');
        renderCustomFeaturesList('rotas');
        
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
        
        ['pontos', 'areas', 'rotas'].forEach(type => {
            const cb = li.querySelector(`#toggle-custom-${type}`);
            if (cb) {
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        map.addLayer(myLayers[type]);
                    } else {
                        map.removeLayer(myLayers[type]);
                    }
                });
            }
            
            const expandBtn = li.querySelector(`#expand-custom-${type}`);
            if (expandBtn) {
                expandBtn.addEventListener('click', () => {
                    const listDiv = li.querySelector(`#list-custom-${type}`);
                    if (listDiv.style.display === 'none') {
                        listDiv.style.display = 'block';
                    } else {
                        listDiv.style.display = 'none';
                    }
                });
            }
        });
    }

    function renderCustomFeaturesList(type) {
        const listDiv = document.getElementById(`list-custom-${type}`);
        if (!listDiv) return; // Might not exist if DOM not ready, but called later
        
        listDiv.innerHTML = '';
        
        const key = `agrogis_custom_${type}`;
        let existing = localStorage.getItem(key);
        if (!existing) return;
        
        try {
            let fc = JSON.parse(existing);
            if (!fc.features || fc.features.length === 0) {
                listDiv.innerHTML = '<div style="font-style: italic; opacity: 0.5;">Nenhuma feição salva.</div>';
                return;
            }
            
            fc.features.forEach(f => {
                const name = f.properties.NOME || 'Sem Nome';
                const id = f.properties.id;
                
                const itemDiv = document.createElement('div');
                itemDiv.style.display = 'flex';
                itemDiv.style.justifyContent = 'space-between';
                itemDiv.style.alignItems = 'center';
                itemDiv.style.padding = '4px 0';
                itemDiv.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                
                itemDiv.innerHTML = `
                    <span style="flex-grow: 1; cursor: pointer; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; color: #a8b8b0;">${name}</span>
                    <div style="display: flex; gap: 6px;">
                        <button class="btn-edit" style="background:none; border:none; color:#2ec4b6; cursor:pointer;" title="Editar Nome">✏️</button>
                        <button class="btn-delete" style="background:none; border:none; color:#e71d36; cursor:pointer;" title="Excluir">🗑️</button>
                    </div>
                `;
                
                // Pan to feature on name click
                const spanName = itemDiv.querySelector('span');
                spanName.addEventListener('click', () => {
                    let mapLayer;
                    myLayers[type].eachLayer(l => {
                        if (l.feature.properties.id === id) mapLayer = l;
                    });
                    if (mapLayer) {
                        if (mapLayer.getBounds) {
                            map.fitBounds(mapLayer.getBounds());
                        } else if (mapLayer.getLatLng) {
                            map.panTo(mapLayer.getLatLng());
                        }
                        mapLayer.openPopup();
                    }
                });
                
                itemDiv.querySelector('.btn-edit').addEventListener('click', () => {
                    editCustomFeatureName(type, id, name);
                });
                itemDiv.querySelector('.btn-delete').addEventListener('click', () => {
                    deleteCustomFeature(type, id);
                });
                
                listDiv.appendChild(itemDiv);
            });
            
        } catch(e){}
    }

    function createSubLayerToggle(id, label, color) {
        return `
            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label class="custom-checkbox" style="font-size: 12px; display: flex; align-items: center; margin: 0; min-width: 30px;">
                        <input type="checkbox" id="toggle-custom-${id}">
                        <span class="checkmark" style="--layer-color: ${color}; width: 16px; height: 16px; min-width: 16px;"></span>
                    </label>
                    <div id="expand-custom-${id}" class="layer-name" style="flex-grow: 1; margin-left: 10px; color: var(--text-main); font-weight: 500; font-size: 12px; cursor: pointer;">
                        ${label}
                    </div>
                </div>
                <div id="list-custom-${id}" style="display: none; padding-left: 26px; margin-top: 8px; font-size: 11px;">
                </div>
            </div>
        `;
    }

    // Inicializar Minhas Camadas
    if (typeof GEOPORTAL_LAYERS !== 'undefined') {
        initCustomLayers();
        updateLabelVisibility(); // Call initial check after layers are loaded
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

    // Handle map selection
    window.clearAllSelections = () => {
        if (window.currentSearchedFarmLayer && window.currentSearchedFarmLayerGroup) {
            window.currentSearchedFarmLayerGroup.resetStyle(window.currentSearchedFarmLayer);
            window.currentSearchedFarmLayer = null;
            window.currentSearchedFarmLayerGroup = null;
        }
    };

    // Clear selection on map click
    map.on('click', window.clearAllSelections);



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
        window.measureActive = false;
        measureFinished = false;
        btnMeasure.style.background = 'rgba(255,255,255,0.05)';
        btnMeasure.style.borderColor = 'rgba(255,255,255,0.1)';
        resultPanel.style.display = 'none';
        map.getContainer().style.cursor = '';
        document.body.classList.remove('hide-equipes', 'disable-map-hover');
        resetMeasure();
    }

    btnMeasure.addEventListener('click', () => {
        if (measureActive) {
            deactivateMeasure();
        } else {
            measureActive = true;
            window.measureActive = true;
            measureFinished = false;
            btnMeasure.style.background = 'rgba(232, 93, 4, 0.2)';
            btnMeasure.style.borderColor = '#e85d04';
            resultPanel.style.display = 'flex';
            map.getContainer().style.cursor = 'crosshair';
            document.body.classList.add('hide-equipes', 'disable-map-hover');
            resetMeasure();
            
            // Auto-close tools panel so user can see map clearly
            document.getElementById('floating-tools-panel').style.display = 'none';
        }
    });

    btnClear.addEventListener('click', resetMeasure);
    const measureClearIcon = document.getElementById('tool-measure-clear-icon');
    if (measureClearIcon) measureClearIcon.addEventListener('click', resetMeasure);
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
        const inputOrig = document.getElementById('route-search-origin');
        if(inputOrig) inputOrig.style.borderColor = mode === 'origin' ? '#e85d04' : 'rgba(255,255,255,0.2)';
        
        const inputDest = document.getElementById('route-search-dest');
        if(inputDest) inputDest.style.borderColor = mode === 'dest' ? '#e85d04' : 'rgba(255,255,255,0.2)';
        
        if (mode) {
            map.getContainer().style.cursor = 'crosshair';
        } else {
            map.getContainer().style.cursor = '';
        }
    }

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
        document.body.classList.remove('hide-equipes');
    }

    btnRoute.addEventListener('click', () => {
        if (routePanel.style.display === 'flex' || routePanel.style.display === 'block') {
            deactivateRoute();
        } else {
            if (typeof deactivateMeasure === 'function') deactivateMeasure();
            
            routePanel.style.display = 'flex';
            btnRoute.style.background = 'rgba(232, 93, 4, 0.2)';
            btnRoute.style.borderColor = '#e85d04';
            map.getContainer().classList.add('route-active');
            document.body.classList.add('hide-equipes');
            
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
    
    function resetRoute() {
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
        
        routeOriginData = null;
        routeDestData = null;
        
        const origInput = document.getElementById('route-search-origin');
        if (origInput) origInput.value = '';
        
        const destInput = document.getElementById('route-search-dest');
        if (destInput) destInput.value = '';
        
        setRouteSelectionMode('origin');
    }
    
    const routeClearIcon = document.getElementById('tool-route-clear-icon');
    if (routeClearIcon) routeClearIcon.addEventListener('click', resetRoute);
    
    // (Route map click to close removed per user request)

    function calculateRoute() {
        if (!routeOriginData || !routeDestData) {
            alert('Por favor, selecione origem e destino clicando no mapa.');
            return;
        }
        
        if (!navigator.onLine) {
            alert("⚠️ Você está offline.\n\nO traçado de rotas por estradas exige internet. \nPara medir distâncias offline, utilize a ferramenta de MEDIÇÃO (ícone de régua).");
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

    let isPopupActive = false;
    map.on('popupopen', () => { isPopupActive = true; });
    map.on('popupclose', () => { 
        setTimeout(() => { isPopupActive = false; }, 100); 
    });

    // Toggle UI visibility on map click
    map.on('click', function() {
        if (window.drawActive || window.measureActive) return; // Prevent hiding UI when drawing/measuring
        if (isPopupActive) return; // Não oculta a UI se o clique for para limpar a seleção/fechar a tabela de atributo
        document.body.classList.toggle('ui-hidden');
    });

    // --- DRAWING TOOL LOGIC ---
    let drawActive = false;
    let drawMode = null; // 'point' | 'area'
    let currentPolygonPoints = [];
    let currentPolygonLine = L.polyline([], {color: '#2ec4b6', weight: 3, dashArray: '5, 10'}).addTo(map);
    let currentPolygonFill = L.polygon([], {color: '#2ec4b6', weight: 2, fillColor: '#2ec4b6', fillOpacity: 0.2}).addTo(map);
    let drawMarkers = L.layerGroup().addTo(map);
    let tempDrawLine = L.polyline([], {color: '#2ec4b6', weight: 3, dashArray: '5, 10', opacity: 0.5}).addTo(map);

    const btnDraw = document.getElementById('tool-draw-btn');
    const drawPanel = document.getElementById('draw-panel');
    const btnDrawPoint = document.getElementById('draw-mode-point');
    const btnDrawArea = document.getElementById('draw-mode-area');
    const btnFinishArea = document.getElementById('draw-finish-area');
    const drawStatus = document.getElementById('draw-status');

    if (drawPanel) {
        new L.Draggable(drawPanel, document.getElementById('draw-drag-handle')).enable();
    }

    function resetDraw() {
        drawActive = false;
        window.drawActive = false;
        drawMode = null;
        currentPolygonPoints = [];
        currentPolygonLine.setLatLngs([]);
        currentPolygonFill.setLatLngs([]);
        tempDrawLine.setLatLngs([]);
        drawMarkers.clearLayers();
        btnDraw.style.background = 'rgba(255,255,255,0.05)';
        btnDraw.style.borderColor = 'rgba(255,255,255,0.1)';
        drawPanel.style.display = 'none';
        btnFinishArea.style.display = 'none';
        drawStatus.style.display = 'none';
        map.getContainer().style.cursor = '';
        btnDrawPoint.style.boxShadow = 'none';
        btnDrawArea.style.boxShadow = 'none';
    }

    btnDraw.addEventListener('click', () => {
        if (drawActive) {
            resetDraw();
        } else {
            resetDraw(); // clear state
            drawActive = true;
            window.drawActive = true;
            btnDraw.style.background = 'rgba(46, 196, 182, 0.2)';
            btnDraw.style.borderColor = '#2ec4b6';
            drawPanel.style.display = 'flex';
            document.getElementById('floating-tools-panel').style.display = 'none';
        }
    });

    document.getElementById('close-draw-btn').addEventListener('click', resetDraw);

    btnDrawPoint.addEventListener('click', () => {
        drawMode = 'point';
        btnDrawPoint.style.boxShadow = '0 0 10px #e71d36';
        btnDrawArea.style.boxShadow = 'none';
        drawStatus.textContent = 'Clique no mapa para marcar o ponto';
        drawStatus.style.display = 'block';
        btnFinishArea.style.display = 'none';
        map.getContainer().style.cursor = 'crosshair';
        currentPolygonPoints = [];
        currentPolygonLine.setLatLngs([]);
        currentPolygonFill.setLatLngs([]);
        tempDrawLine.setLatLngs([]);
        drawMarkers.clearLayers();
    });

    btnDrawArea.addEventListener('click', () => {
        drawMode = 'area';
        btnDrawArea.style.boxShadow = '0 0 10px #2ec4b6';
        btnDrawPoint.style.boxShadow = 'none';
        drawStatus.textContent = 'Clique no mapa para marcar os vértices (mín. 3)';
        drawStatus.style.display = 'block';
        btnFinishArea.style.display = 'block';
        map.getContainer().style.cursor = 'crosshair';
        currentPolygonPoints = [];
        currentPolygonLine.setLatLngs([]);
        currentPolygonFill.setLatLngs([]);
        tempDrawLine.setLatLngs([]);
        drawMarkers.clearLayers();
    });

    map.on('click', (e) => {
        if (!drawActive || !drawMode) return;

        if (drawMode === 'point') {
            // Save Point Mode
            const latlng = e.latlng;
            openNameModal('PontoMarcado', (name) => {
                if (name) {
                    const feature = {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [latlng.lng, latlng.lat] },
                        properties: { NOME: name, TIPO: 'Ponto' }
                    };
                    saveCustomFeature('pontos', feature);
                    alert(`Ponto "${name}" salvo! Verifique "Minhas Camadas".`);
                }
                resetDraw();
            });
        } else if (drawMode === 'area') {
            const latlng = e.latlng;
            currentPolygonPoints.push(latlng);
            
            L.circleMarker(latlng, { radius: 5, fillColor: '#2ec4b6', color: '#000', weight: 1, fillOpacity: 1 }).addTo(drawMarkers);
            
            currentPolygonLine.setLatLngs(currentPolygonPoints);
            if (currentPolygonPoints.length > 2) {
                currentPolygonFill.setLatLngs(currentPolygonPoints);
            }
        }
    });

    map.on('mousemove', (e) => {
        if (!drawActive || drawMode !== 'area' || currentPolygonPoints.length === 0) return;
        tempDrawLine.setLatLngs([...currentPolygonPoints, e.latlng]);
    });

    btnFinishArea.addEventListener('click', () => {
        if (currentPolygonPoints.length < 3) {
            alert('Um polígono precisa de no mínimo 3 pontos!');
            return;
        }
        
        // Add the first point to close the polygon for Turf
        const coords = currentPolygonPoints.map(p => [p.lng, p.lat]);
        coords.push([currentPolygonPoints[0].lng, currentPolygonPoints[0].lat]);
        
        const polygon = turf.polygon([coords]);
        const areaM2 = turf.area(polygon);
        const areaHa = (areaM2 / 10000).toFixed(2);
        
        openNameModal('AreaDesenhada', (name) => {
            if (name) {
                const feature = {
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [coords] },
                    properties: { NOME: name, AREA_HA: areaHa, TIPO: 'Area' }
                };
                saveCustomFeature('areas', feature);
                alert(`Área "${name}" (${areaHa} ha) salva!`);
            }
            resetDraw();
        });
    });

    // --- RECORDING TOOL LOGIC ---
    const btnRecord = document.getElementById('tool-record-btn');
    const recordPanel = document.getElementById('record-panel');
    const btnStartRecord = document.getElementById('record-start-btn');
    const btnSaveRecord = document.getElementById('record-save-btn');
    const indicator = document.getElementById('record-indicator');
    const distRecordEl = document.getElementById('record-distance');
    const timeRecordEl = document.getElementById('record-time');

    if (recordPanel) {
        new L.Draggable(recordPanel, document.getElementById('record-drag-handle')).enable();
    }

    let recordActive = false;
    let isRecording = false;
    let watchId = null;
    let recordPoints = [];
    let recordLine = L.polyline([], {color: '#e71d36', weight: 4}).addTo(map);
    let recordStartTime = null;
    let recordTimerInterval = null;

    function resetRecordUI() {
        recordActive = false;
        isRecording = false;
        if (watchId) navigator.geolocation.clearWatch(watchId);
        clearInterval(recordTimerInterval);
        
        btnRecord.style.background = 'rgba(255,255,255,0.05)';
        btnRecord.style.borderColor = 'rgba(255,255,255,0.1)';
        recordPanel.style.display = 'none';
        
        btnStartRecord.textContent = 'INICIAR';
        btnStartRecord.style.background = 'rgba(231, 29, 54, 0.2)';
        btnSaveRecord.disabled = true;
        btnSaveRecord.style.cursor = 'not-allowed';
        indicator.style.opacity = '0.3';
        
        distRecordEl.textContent = '0.00 km';
        timeRecordEl.textContent = '00:00';
        
        recordPoints = [];
        recordLine.setLatLngs([]);
    }

    btnRecord.addEventListener('click', () => {
        if (recordActive) {
            resetRecordUI();
        } else {
            resetRecordUI();
            recordActive = true;
            btnRecord.style.background = 'rgba(231, 29, 54, 0.2)';
            btnRecord.style.borderColor = '#e71d36';
            recordPanel.style.display = 'flex';
            document.getElementById('floating-tools-panel').style.display = 'none';
        }
    });

    document.getElementById('close-record-btn').addEventListener('click', resetRecordUI);

    btnStartRecord.addEventListener('click', () => {
        if (!isRecording) {
            // Start recording
            if (!navigator.geolocation) {
                alert("Seu navegador/dispositivo não suporta gravação de GPS.");
                return;
            }
            
            isRecording = true;
            btnStartRecord.textContent = 'PAUSAR';
            btnStartRecord.style.background = 'rgba(255, 159, 28, 0.2)'; // Orange
            btnSaveRecord.disabled = false;
            btnSaveRecord.style.cursor = 'pointer';
            
            recordStartTime = Date.now() - (recordPoints.length > 0 ? getElapsedTime() : 0);
            
            if (!recordTimerInterval) {
                recordTimerInterval = setInterval(() => {
                    const diff = Math.floor((Date.now() - recordStartTime) / 1000);
                    const m = Math.floor(diff / 60).toString().padStart(2, '0');
                    const s = (diff % 60).toString().padStart(2, '0');
                    timeRecordEl.textContent = `${m}:${s}`;
                    // Pulse indicator
                    indicator.style.opacity = indicator.style.opacity === '1' ? '0.3' : '1';
                }, 1000);
            }
            
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
                    recordPoints.push(latlng);
                    recordLine.setLatLngs(recordPoints);
                    map.panTo(latlng);
                    
                    // Calc distance
                    if (recordPoints.length > 1) {
                        let d = 0;
                        for (let i = 0; i < recordPoints.length - 1; i++) {
                            d += recordPoints[i].distanceTo(recordPoints[i+1]);
                        }
                        distRecordEl.textContent = (d / 1000).toFixed(2) + ' km';
                    }
                },
                (err) => console.warn(err),
                { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
            );
        } else {
            // Pause recording
            isRecording = false;
            btnStartRecord.textContent = 'RETOMAR';
            btnStartRecord.style.background = 'rgba(46, 196, 182, 0.2)';
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            clearInterval(recordTimerInterval);
            recordTimerInterval = null;
            indicator.style.opacity = '1';
        }
    });
    
    function getElapsedTime() {
        if (!timeRecordEl.textContent) return 0;
        const pts = timeRecordEl.textContent.split(':');
        if (pts.length === 2) {
            return (parseInt(pts[0])*60 + parseInt(pts[1])) * 1000;
        }
        return 0;
    }

    btnSaveRecord.addEventListener('click', () => {
        if (recordPoints.length < 2) {
            alert('A rota é muito curta para ser salva.');
            return;
        }
        // Pause first
        if (isRecording) btnStartRecord.click();
        
        let distanceM = 0;
        for (let i = 0; i < recordPoints.length - 1; i++) {
            distanceM += recordPoints[i].distanceTo(recordPoints[i+1]);
        }
        
        openNameModal('Rota_Gravada', (name) => {
            if (name) {
                const coords = recordPoints.map(p => [p.lng, p.lat]);
                const feature = {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: coords },
                    properties: { NOME: name, DISTANCIA_M: Math.round(distanceM), TEMPO: timeRecordEl.textContent, TIPO: 'Rota' }
                };
                saveCustomFeature('rotas', feature);
                alert(`Rota "${name}" salva com sucesso!`);
            }
            resetRecordUI();
        });
    });

    // --- MODAL UTILS ---
    let pendingModalCallback = null;
    const nameModal = document.getElementById('custom-name-modal');
    const nameInput = document.getElementById('custom-name-input');
    
    function openNameModal(defaultName, callback) {
        pendingModalCallback = callback;
        nameInput.value = defaultName;
        nameModal.style.display = 'flex';
        nameInput.focus();
        nameInput.select();
    }
    
    document.getElementById('custom-name-cancel').addEventListener('click', () => {
        nameModal.style.display = 'none';
        if (pendingModalCallback) pendingModalCallback(null);
    });
    
    document.getElementById('custom-name-confirm').addEventListener('click', () => {
        const val = nameInput.value.trim();
        nameModal.style.display = 'none';
        if (pendingModalCallback) pendingModalCallback(val || 'Sem Nome');
    });

});

// ═══════════════════════════════════════════════════════════════════
//  MÓDULO DE DETECÇÃO DE ERVAS DANINHAS — Satellite Weed Detection
//  Integração com FastAPI backend via Microsoft Planetary Computer
//  v2.0 — Análise por Fazenda + Pesquisa + Botão na Aba Ferramentas
// ═══════════════════════════════════════════════════════════════════
(function() {
    const API_URL = 'http://localhost:8000';

    // Estado
    let selectedFazendaFeatures = [];  // Todos os talhões da fazenda selecionada
    let selectedFazendaName = '';
    let weedResultGeoJSON = null;
    let weedSearchResultGeoJSON = null;
    let weedLayer = null;
    let apiOnline = false;
    let weedToolActive = false;        // Ferramenta ativa via botão Ferramentas

    // Elementos DOM — Painel principal
    const panel        = document.getElementById('weed-analysis-panel');
    const btnClose     = document.getElementById('weed-panel-close');
    const btnAnalyze   = document.getElementById('btn-weed-analyze');
    const talhaoName   = document.getElementById('weed-talhao-name');
    const talhaoInfo   = document.getElementById('weed-talhao-info');
    const fazendaBadge = document.getElementById('weed-fazenda-badge');
    const fazCountEl   = document.getElementById('weed-fazenda-talhoes-count');
    const statusArea   = document.getElementById('weed-status-area');
    const resultArea   = document.getElementById('weed-result-area');
    const resultMsg    = document.getElementById('weed-result-msg');
    const resultStats  = document.getElementById('weed-result-stats');
    const exportBtns   = document.getElementById('weed-export-btns');
    const apiOffline   = document.getElementById('weed-api-offline');
    const statHa       = document.getElementById('weed-stat-ha');
    const statCount    = document.getElementById('weed-stat-count');
    const statDate     = document.getElementById('weed-stat-date');
    const statCloud    = document.getElementById('weed-stat-cloud');
    const btnGeoJSON   = document.getElementById('btn-export-geojson');
    const btnKML       = document.getElementById('btn-export-kml');
    const btnClear     = document.getElementById('btn-clear-weed');
    const toolDot      = document.getElementById('weed-tool-status-dot');
    const toolWeedBtn  = document.getElementById('tool-weed-btn');

    // Elementos DOM — Aba Pesquisa
    const searchInput      = document.getElementById('weed-search-input');
    const searchDatalist   = document.getElementById('weed-fazendas-datalist');
    const btnSearchAnalyze = document.getElementById('btn-weed-search-analyze');
    const searchResultArea = document.getElementById('weed-search-result-area');
    const searchResultMsg  = document.getElementById('weed-search-result-msg');
    const searchResultStats= document.getElementById('weed-search-result-stats');
    const searchStatHa     = document.getElementById('weed-search-stat-ha');
    const searchStatCount  = document.getElementById('weed-search-stat-count');
    const btnSearchGeoJSON = document.getElementById('btn-export-search-geojson');
    const btnSearchKML     = document.getElementById('btn-export-search-kml');
    const searchApiOffline = document.getElementById('weed-search-api-offline');
    const btnSearchClear   = document.getElementById('btn-weed-search-clear');

    // ── Tab Switcher (acessível globalmente para o onclick no HTML) ──
    window.weedSwitchTab = function(tab) {
        const mapContent    = document.getElementById('weed-tab-content-map');
        const searchContent = document.getElementById('weed-tab-content-search');
        const tabMap        = document.getElementById('weed-tab-map');
        const tabSearch     = document.getElementById('weed-tab-search');
        if (tab === 'map') {
            if (mapContent)    mapContent.style.display    = 'block';
            if (searchContent) searchContent.style.display = 'none';
            if (tabMap)    { tabMap.style.background = 'rgba(255,0,0,0.12)'; tabMap.style.borderBottomColor = '#ff1744'; tabMap.style.color = '#ff6666'; }
            if (tabSearch) { tabSearch.style.background = 'none'; tabSearch.style.borderBottomColor = 'transparent'; tabSearch.style.color = 'rgba(255,255,255,0.4)'; }
        } else {
            if (mapContent)    mapContent.style.display    = 'none';
            if (searchContent) searchContent.style.display = 'block';
            if (tabSearch) { tabSearch.style.background = 'rgba(255,0,0,0.12)'; tabSearch.style.borderBottomColor = '#ff1744'; tabSearch.style.color = '#ff6666'; }
            if (tabMap)    { tabMap.style.background = 'none'; tabMap.style.borderBottomColor = 'transparent'; tabMap.style.color = 'rgba(255,255,255,0.4)'; }
            populateFazendaSearch();
        }
    };

    // ── Saúde da API ─────────────────────────────────────────────────
    function checkApiHealth() {
        fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(() => {
                apiOnline = true;
                if (toolDot) { toolDot.style.background = '#2ec4b6'; toolDot.title = 'Servidor online'; }
                if (apiOffline) apiOffline.style.display = 'none';
                if (searchApiOffline) searchApiOffline.style.display = 'none';
                updateAnalyzeButton();
            })
            .catch(() => {
                apiOnline = false;
                if (toolDot) { toolDot.style.background = '#e71d36'; toolDot.title = 'Servidor offline'; }
                if (panel && panel.style.display !== 'none') {
                    if (apiOffline) apiOffline.style.display = 'block';
                    if (searchApiOffline) searchApiOffline.style.display = 'block';
                }
                updateAnalyzeButton();
            });
    }
    setInterval(checkApiHealth, 10000);
    checkApiHealth();

    // ── Botão na aba Ferramentas ──────────────────────────────────────
    if (toolWeedBtn) {
        toolWeedBtn.addEventListener('click', () => {
            weedToolActive = !weedToolActive;
            if (weedToolActive) {
                toolWeedBtn.style.background = 'rgba(255,0,0,0.2)';
                toolWeedBtn.style.borderColor = '#ff1744';
                toolWeedBtn.title = 'Ferramenta ativa — Clique em um talhão para analisar a fazenda';
                // Abrir painel
                if (panel) panel.style.display = 'block';
                document.getElementById('floating-tools-panel').style.display = 'none';
                
                // Ligar servidor via pywebview
                if (window.pywebview && window.pywebview.api) {
                    window.pywebview.api.start_server().then(res => console.log(res));
                }
                
                checkApiHealth();
                // O servidor demora alguns segundos para ligar, re-checar em breve:
                setTimeout(checkApiHealth, 3000);
                setTimeout(checkApiHealth, 6000);
            } else {
                toolWeedBtn.style.background = 'rgba(255,0,0,0.08)';
                toolWeedBtn.style.borderColor = 'rgba(255,0,0,0.3)';
                toolWeedBtn.title = 'Identificar infestação de ervas daninhas por satélite';
                
                // Desligar servidor via pywebview se houver botão para desligar, 
                // mas espera, o botão de fechar painel é quem desativa a ferramenta geralmente,
                // no entanto se clicar no ícone denovo também deve desligar.
                if (window.pywebview && window.pywebview.api) {
                    window.pywebview.api.stop_server().then(res => console.log(res));
                }
            }
        });
    }

    // ── Coletador de features da fazenda a partir do GeoJSON carregado ─
    function getFazendaFeatures(fazendaId) {
        const results = [];
        if (!window.loadedLayers) return results;
        // Função para extrair apenas a parte inteira do ID (ex: "9902,0" -> "9902")
        const cleanId = (id) => String(id || '').split(',')[0].split('.')[0].trim();
        const baseTargetId = cleanId(fazendaId);
        if (!baseTargetId) return results;

        const seenPolys = new Set();
        Object.keys(window.loadedLayers).forEach(layerName => {
            const mapLayer = window.loadedLayers[layerName];
            if (!mapLayer || !mapLayer.eachLayer) return;
            mapLayer.eachLayer(layer => {
                const props = layer.feature && layer.feature.properties;
                if (!props) return;
                const fid = props.FAZENDA || props.DL_FUNDOAGRIC || props['DL FUNDOAGRIC'];
                if (fid && cleanId(fid) === baseTargetId) {
                    // Evitar duplicatas se houver mais de uma camada com os mesmos talhões (ex: Variedades)
                    const uniqueKey = props.TALHAO || props.COD_TALHAO || JSON.stringify(layer.feature.geometry.coordinates?.[0]?.[0] || Math.random());
                    if (!seenPolys.has(uniqueKey)) {
                        seenPolys.add(uniqueKey);
                        results.push(layer.feature);
                    }
                }
            });
        });
        return results;
    }

    function getFazendaFeaturesByName(nomeFaz) {
        let matchedId = null;
        if (!window.loadedLayers) return [];
        const searchName = String(nomeFaz || '').trim().toLowerCase();
        
        // Primeiro, encontrar o ID da fazenda que bate com o nome buscado
        Object.keys(window.loadedLayers).forEach(layerName => {
            if (matchedId) return; // already found
            const mapLayer = window.loadedLayers[layerName];
            if (!mapLayer || !mapLayer.eachLayer) return;
            mapLayer.eachLayer(layer => {
                if (matchedId) return;
                const props = layer.feature && layer.feature.properties;
                if (!props) return;
                
                const nameStr = String(props.NOME_FAZ || props['DL DESCFUNDOA'] || '').trim().toLowerCase();
                const rawId = props.FAZENDA || props.DL_FUNDOAGRIC || props['DL FUNDOAGRIC'];
                const cleanIdStr = String(rawId || '').split(',')[0].split('.')[0].trim().toLowerCase();
                const combinedStr = cleanIdStr ? `${cleanIdStr} - ${nameStr}` : nameStr;
                
                // Tenta combinar nome, string combinada ou ser exatamente igual ao código
                if ((nameStr && (nameStr.includes(searchName) || searchName.includes(nameStr))) ||
                    (combinedStr && (combinedStr.includes(searchName) || searchName.includes(combinedStr))) ||
                    (cleanIdStr && cleanIdStr === searchName)) {
                    matchedId = rawId;
                }
            });
        });

        // Se encontrou o ID, retorna todos os talhões dessa fazenda pelo ID
        if (matchedId) {
            return getFazendaFeatures(matchedId);
        }
        return [];
    }

    // ── Popula o datalist de pesquisa ────────────────────────────────
    function populateFazendaSearch() {
        if (!searchDatalist) return;
        searchDatalist.innerHTML = '';
        const seen = new Set();
        if (!window.loadedLayers) return;
        Object.keys(window.loadedLayers).forEach(layerName => {
            const mapLayer = window.loadedLayers[layerName];
            if (!mapLayer || !mapLayer.eachLayer) return;
            mapLayer.eachLayer(layer => {
                const props = layer.feature && layer.feature.properties;
                if (!props) return;
                const rawName = props.NOME_FAZ || props['DL DESCFUNDOA'];
                const rawId = props.FAZENDA || props.DL_FUNDOAGRIC || props['DL FUNDOAGRIC'];
                
                if (rawName) {
                    const cleanIdStr = String(rawId || '').split(',')[0].split('.')[0].trim();
                    const combinedStr = cleanIdStr ? `${cleanIdStr} - ${rawName}` : rawName;
                    
                    if (!seen.has(combinedStr)) {
                        seen.add(combinedStr);
                        const opt = document.createElement('option');
                        opt.value = combinedStr;
                        searchDatalist.appendChild(opt);
                    }
                }
            });
        });
    }

    // ── Abre o painel ao clicar no talhão ────────────────────────────
    window.openWeedAnalysisPanel = function(feature, props) {
        const codTal  = props.COD_TALHAO || props.TALHAO || '';
        const nomeFaz = props.NOME_FAZ || props['DL DESCFUNDOA'] || 'Fazenda';
        const fazId   = props.FAZENDA || props['DL FUNDOAGRIC'] || '';

        // Quando clica no mapa, analisa APENAS o talhão clicado
        selectedFazendaFeatures = [feature];
        selectedFazendaName = nomeFaz;

        // Atualizar UI
        if (talhaoName) talhaoName.textContent = `Talhão ${codTal} — ${nomeFaz}`;
        if (talhaoInfo) talhaoInfo.textContent = `Fazenda ID: ${fazId} · Apenas este talhão`;
        if (fazendaBadge) {
            fazendaBadge.style.display = 'inline-flex';
            if (fazCountEl) fazCountEl.textContent = '1';
        }

        resetPanel();
        if (panel) panel.style.display = 'block';
        window.weedSwitchTab('map');
        checkApiHealth();
        updateAnalyzeButton();
    };

    function updateAnalyzeButton() {
        if (!btnAnalyze) return;
        const can = selectedFazendaFeatures.length > 0 && apiOnline;
        btnAnalyze.disabled = !can;
        btnAnalyze.style.opacity = can ? '1' : '0.5';
        btnAnalyze.style.cursor = can ? 'pointer' : 'not-allowed';
    }

    function resetPanel() {
        if (statusArea) statusArea.style.display = 'none';
        if (resultArea) resultArea.style.display = 'none';
        if (resultStats) resultStats.style.display = 'none';
        if (exportBtns) exportBtns.style.display = 'none';
        if (apiOffline) apiOffline.style.display = 'none';
        const icon = document.getElementById('weed-btn-icon');
        const text = document.getElementById('weed-btn-text');
        if (icon) icon.textContent = '🔍';
        if (text) text.textContent = 'Identificar Infestação na Fazenda';
        ['step-search','step-download','step-ndvi','step-detect'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.style.color = 'rgba(255,255,255,0.3)'; el.style.fontWeight = 'normal'; const ico = el.querySelector('.step-icon'); if(ico) ico.textContent = {'step-search':'⏳','step-download':'⬇️','step-ndvi':'📊','step-detect':'🔍'}[id] || '⏳'; }
        });
    }

    function activateStep(id) { const el = document.getElementById(id); if(el){el.style.color='#ff9f1c';el.style.fontWeight='600';}}
    function completeStep(id) { const el = document.getElementById(id); if(el){el.style.color='#2ec4b6'; const ic=el.querySelector('.step-icon'); if(ic) ic.textContent='✅';}}

    // ── Cria GeoJSON union da fazenda ─────────────────────────────────
    function buildFazendaUnionGeoJSON(features) {
        // Retorna um GeoJSON GeometryCollection / Feature simples com bbox da fazenda
        if (features.length === 1) return features[0];
        // Cria um Feature com GeometryCollection para enviar à API
        return {
            type: 'Feature',
            properties: features[0].properties || {},
            geometry: {
                type: 'GeometryCollection',
                geometries: features.map(f => f.geometry)
            }
        };
    }

    // ── Análise pelo Mapa ─────────────────────────────────────────────
    async function runAnalysis() {
        if (!selectedFazendaFeatures.length || !apiOnline) return;
        const firstProps = selectedFazendaFeatures[0].properties || {};

        if (statusArea) statusArea.style.display = 'block';
        if (resultArea) resultArea.style.display = 'none';
        if (btnAnalyze) {
            btnAnalyze.disabled = true;
            document.getElementById('weed-btn-icon').textContent = '⏳';
            document.getElementById('weed-btn-text').textContent = `Analisando ${selectedFazendaFeatures.length} talhão(ões)...`;
        }

        activateStep('step-search');
        const t1 = setTimeout(() => { completeStep('step-search'); activateStep('step-download'); }, 2000);
        const t2 = setTimeout(() => { completeStep('step-download'); activateStep('step-ndvi'); }, 7000);
        const t3 = setTimeout(() => { completeStep('step-ndvi'); activateStep('step-detect'); }, 12000);

        try {
            const unionFeature = buildFazendaUnionGeoJSON(selectedFazendaFeatures);
            const payload = {
                geojson: unionFeature,
                cod_talhao: String(firstProps.FAZENDA || ''),
                nome_faz: selectedFazendaName,
                corte: String(firstProps['DL CORTE'] || ''),
                area_ha: selectedFazendaFeatures.reduce((sum, f) => sum + parseFloat(f.properties.TALHAO_ARE || f.properties['DL AREA'] || 0), 0),
                days_back: 20, max_cloud: 20
            };

            const response = await fetch(`${API_URL}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
            completeStep('step-search'); completeStep('step-download'); completeStep('step-ndvi'); completeStep('step-detect');

            if (!response.ok) throw new Error((await response.json()).detail || 'Erro na análise');
            const result = await response.json();

            if (resultArea) resultArea.style.display = 'block';
            if (resultMsg) resultMsg.textContent = result.message;

            if (result.success && result.reboleiras && result.reboleiras.length > 0) {
                weedResultGeoJSON = result.geojson_collection;
                renderWeedLayer(result.geojson_collection);
                if (resultStats) resultStats.style.display = 'block';
                if (statHa)    statHa.textContent    = result.total_infested_ha;
                if (statCount) statCount.textContent = result.reboleiras.length;
                if (statDate)  statDate.textContent  = result.satellite_date || '—';
                if (statCloud) statCloud.textContent = result.cloud_cover ? result.cloud_cover.toFixed(0) : '—';
                if (exportBtns) exportBtns.style.display = 'flex';
            } else {
                weedResultGeoJSON = null;
                if (resultStats) resultStats.style.display = 'none';
                if (exportBtns) exportBtns.style.display = 'none';
            }
        } catch(err) {
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
            if (resultArea) resultArea.style.display = 'block';
            if (resultMsg) { resultMsg.textContent = `❌ ${err.message}`; resultMsg.style.borderLeftColor = '#ff9f1c'; }
        } finally {
            if (btnAnalyze) {
                btnAnalyze.disabled = false;
                document.getElementById('weed-btn-icon').textContent = '🔄';
                document.getElementById('weed-btn-text').textContent = 'Analisar Novamente';
                updateAnalyzeButton();
            }
        }
    }

    // ── Análise pela pesquisa de fazenda ─────────────────────────────
    async function runSearchAnalysis() {
        if (!searchInput || !searchInput.value.trim()) {
            alert('Digite o nome de uma fazenda para analisar.'); return;
        }
        if (!apiOnline) {
            if (searchApiOffline) searchApiOffline.style.display = 'block'; return;
        }

        const nomeBusca = searchInput.value.trim();
        const features = getFazendaFeaturesByName(nomeBusca);

        if (features.length === 0) {
            if (searchResultArea) searchResultArea.style.display = 'block';
            if (searchResultMsg) searchResultMsg.textContent = `❌ Nenhum talhão encontrado para: "${nomeBusca}"`;
            return;
        }

        if (btnSearchAnalyze) {
            btnSearchAnalyze.disabled = true;
            btnSearchAnalyze.textContent = `⏳ Analisando ${features.length} talhão(ões)...`;
        }
        if (searchResultArea) searchResultArea.style.display = 'block';
        if (searchResultMsg) searchResultMsg.textContent = `🛰️ Buscando imagens para "${nomeBusca}" (${features.length} talhões)...`;
        if (searchResultStats) searchResultStats.style.display = 'none';

        try {
            const unionFeature = buildFazendaUnionGeoJSON(features);
            const firstProps = features[0].properties || {};
            const payload = {
                geojson: unionFeature,
                cod_talhao: String(firstProps.FAZENDA || ''),
                nome_faz: nomeBusca,
                corte: String(firstProps['DL CORTE'] || ''),
                area_ha: features.reduce((s, f) => s + parseFloat(f.properties.TALHAO_ARE || 0), 0),
                days_back: 20, max_cloud: 20
            };

            const response = await fetch(`${API_URL}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error((await response.json()).detail || 'Erro');
            const result = await response.json();

            if (searchResultMsg) searchResultMsg.textContent = result.message;

            if (result.success && result.reboleiras && result.reboleiras.length > 0) {
                weedSearchResultGeoJSON = result.geojson_collection;
                renderWeedLayer(result.geojson_collection);
                if (searchResultStats) searchResultStats.style.display = 'block';
                if (searchStatHa) searchStatHa.textContent = result.total_infested_ha;
                if (searchStatCount) searchStatCount.textContent = result.reboleiras.length;
                
                const searchStatDate = document.getElementById('weed-search-stat-date');
                const searchStatCloud = document.getElementById('weed-search-stat-cloud');
                if (searchStatDate) searchStatDate.textContent = result.satellite_date || '—';
                if (searchStatCloud) searchStatCloud.textContent = (result.cloud_cover !== undefined && result.cloud_cover !== null) ? Number(result.cloud_cover).toFixed(0) : '—';
                // Voar para a fazenda
                if (weedLayer && weedLayer.getBounds().isValid()) {
                    window.map.flyToBounds(weedLayer.getBounds(), { padding: [80, 80], duration: 2 });
                }
            } else {
                weedSearchResultGeoJSON = null;
                if (searchResultStats) searchResultStats.style.display = 'none';
            }
        } catch(err) {
            if (searchResultMsg) { searchResultMsg.textContent = `❌ ${err.message}`; }
        } finally {
            if (btnSearchAnalyze) {
                btnSearchAnalyze.disabled = false;
                btnSearchAnalyze.textContent = '🔍 Analisar Esta Fazenda';
            }
        }
    }

    // ── Renderizar e limpar camada ────────────────────────────────────
    function renderWeedLayer(geojsonCollection) {
        if (!window.map) return;
        clearWeedLayer();
        weedLayer = L.geoJSON(geojsonCollection, {
            style: { color: '#D32F2F', weight: 2, fillColor: '#FF0000', fillOpacity: 0.75 },
            onEachFeature: (feature, layer) => {
                const p = feature.properties || {};
                const m2 = p.area_m2 ? p.area_m2.toLocaleString('pt-BR') : '—';
                layer.bindPopup(`
                    <div style="font-family:'Inter',sans-serif; min-width:160px;">
                        <div style="font-weight:700;color:#FF0000;margin-bottom:8px;font-size:13px;">🌿 Foco de Infestação</div>
                        <div style="font-size:12px;display:flex;justify-content:space-between;margin-bottom:4px;"><span>Área:</span><strong>${m2} m²</strong></div>
                        <div style="font-size:12px;display:flex;justify-content:space-between;"><span>Hectares:</span><strong>${p.area_ha || '—'} ha</strong></div>
                    </div>`, { className: 'weed-popup' });
            }
        }).addTo(window.map);
        if (weedLayer.getBounds().isValid()) {
            window.map.flyToBounds(weedLayer.getBounds(), { padding: [60, 60], duration: 1.5 });
        }
        // Permitir limpar clicando no mapa
        window.map.once('click', () => {
            clearWeedLayer();
            weedResultGeoJSON = null;
            weedSearchResultGeoJSON = null;
            resetPanel();
            if (searchResultArea) searchResultArea.style.display = 'none';
        });
    }

    function clearWeedLayer() {
        if (weedLayer && window.map) { window.map.removeLayer(weedLayer); weedLayer = null; }
    }

    // ── Exportadores ──────────────────────────────────────────────────
    function downloadBlob(content, filename, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    function doExportGeoJSON(data, prefix) {
        if (!data) return;
        const name = prefix || selectedFazendaName || 'fazenda';
        downloadBlob(JSON.stringify(data, null, 2), `reboleiras_${name.replace(/[^a-z0-9]/gi,'_')}_${new Date().toISOString().slice(0,10)}.geojson`, 'application/json');
    }

    function doExportKML(data, prefix) {
        if (!data) return;
        const features = data.features || [];
        const placemarks = features.map((f, i) => {
            const area = f.properties.area_m2 || 0;
            const coordStr = geomToKML(f.geometry);
            return `<Placemark><name>Foco ${i+1} (${area.toLocaleString('pt-BR')} m²)</name><Style><LineStyle><color>ff0000ff</color><width>2</width></LineStyle><PolyStyle><color>bf0000ff</color></PolyStyle></Style>${coordStr}</Placemark>`;
        }).join('');
        const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Reboleiras ${prefix}</name>${placemarks}</Document></kml>`;
        downloadBlob(kml, `reboleiras_${(prefix||'').replace(/[^a-z0-9]/gi,'_')}_${new Date().toISOString().slice(0,10)}.kml`, 'application/vnd.google-earth.kml+xml');
    }

    function geomToKML(geometry) {
        if (geometry.type === 'Polygon') {
            const ring = geometry.coordinates[0].map(c=>`${c[0]},${c[1]},0`).join(' ');
            return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
        } else if (geometry.type === 'MultiPolygon') {
            return `<MultiGeometry>${geometry.coordinates.map(poly=>{const r=poly[0].map(c=>`${c[0]},${c[1]},0`).join(' ');return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${r}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;}).join('')}</MultiGeometry>`;
        }
        return '';
    }

    // ── Listeners ─────────────────────────────────────────────────────
    if (btnAnalyze)      btnAnalyze.addEventListener('click', runAnalysis);
    if (searchInput) {
        searchInput.addEventListener('focus', populateFazendaSearch);
        searchInput.addEventListener('click', populateFazendaSearch);
    }
    if (btnClose) {
        btnClose.addEventListener('click', () => { 
            if (panel) panel.style.display = 'none';
            if (window.pywebview && window.pywebview.api) {
                window.pywebview.api.stop_server().then(res => console.log(res));
            }
        });
    }
    if (btnGeoJSON)      btnGeoJSON.addEventListener('click', () => doExportGeoJSON(weedResultGeoJSON, selectedFazendaName));
    if (btnKML)          btnKML.addEventListener('click', () => doExportKML(weedResultGeoJSON, selectedFazendaName));
    if (btnClear)        btnClear.addEventListener('click', () => { clearWeedLayer(); weedResultGeoJSON = null; resetPanel(); });
    if (btnSearchAnalyze) btnSearchAnalyze.addEventListener('click', runSearchAnalysis);
    if (btnSearchGeoJSON) btnSearchGeoJSON.addEventListener('click', () => doExportGeoJSON(weedSearchResultGeoJSON, searchInput?.value));
    if (btnSearchKML)     btnSearchKML.addEventListener('click', () => doExportKML(weedSearchResultGeoJSON, searchInput?.value));
    if (btnSearchClear) {
        btnSearchClear.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (searchResultArea) searchResultArea.style.display = 'none';
            weedSearchResultGeoJSON = null;
            clearWeedLayer();
        });
    }

})();
