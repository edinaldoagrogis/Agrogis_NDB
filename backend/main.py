"""
=============================================================
  GeoPortal NDB — Módulo de Detecção de Ervas Daninhas
  Backend FastAPI + Sentinel-2 via Microsoft Planetary Computer
=============================================================
"""

import io
import json
import math
import warnings
import zipfile
import os
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from shapely.geometry import mapping, shape
from shapely.ops import transform

warnings.filterwarnings("ignore")

app = FastAPI(
    title="GeoPortal NDB — Detecção de Infestação",
    description="API de análise de plantas daninhas via Sentinel-2",
    version="1.0.0",
)

# Permite chamadas do frontend (localhost de qualquer porta)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Modelos de dados ────────────────────────────────────────────
class TalhaoRequest(BaseModel):
    geojson: Dict[str, Any]          # Feature GeoJSON do talhão
    cod_talhao: Optional[str] = None
    nome_faz: Optional[str] = None
    corte: Optional[str] = None
    area_ha: Optional[float] = None
    days_back: int = 20              # Dias para busca de imagens
    max_cloud: int = 20              # % máximo de cobertura de nuvens


class Reboleira(BaseModel):
    area_m2: float
    geojson: Dict[str, Any]


class AnalysisResult(BaseModel):
    success: bool
    message: str
    satellite_date: Optional[str] = None
    cloud_cover: Optional[float] = None
    total_infested_ha: Optional[float] = None
    reboleiras: Optional[List[Dict[str, Any]]] = None
    geojson_collection: Optional[Dict[str, Any]] = None


# ─── Utilitários ─────────────────────────────────────────────────
def get_bbox_from_geojson(geojson: Dict) -> List[float]:
    """Retorna [minx, miny, maxx, maxy] de um Feature ou Geometry GeoJSON."""
    if geojson.get("type") == "Feature":
        geom = shape(geojson["geometry"])
    elif geojson.get("type") == "FeatureCollection":
        from shapely.ops import unary_union
        geom = unary_union([shape(f["geometry"]) for f in geojson["features"]])
    else:
        geom = shape(geojson)
    return list(geom.bounds)  # [minx, miny, maxx, maxy]


def geojson_to_shapely(geojson: Dict):
    """Converte Feature ou Geometry GeoJSON para objeto Shapely."""
    if geojson.get("type") == "Feature":
        return shape(geojson["geometry"])
    return shape(geojson)


def area_m2_from_geom_wgs84(geom) -> float:
    """Calcula área aproximada em m² de geometria WGS84 via projeção Mollweide."""
    import pyproj
    from shapely.ops import transform as shp_transform

    wgs84 = pyproj.CRS("EPSG:4326")
    mollweide = pyproj.CRS("+proj=moll +lon_0=0 +datum=WGS84 +units=m +no_defs")
    proj = pyproj.Transformer.from_crs(wgs84, mollweide, always_xy=True).transform
    geom_proj = shp_transform(proj, geom)
    return geom_proj.area


# ─── Busca de imagens Sentinel-2 via STAC ────────────────────────
STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"


def search_sentinel2(bbox: List[float], days_back: int, max_cloud: int):
    """
    Busca imagens Sentinel-2 L2A via Planetary Computer STAC API.
    Retorna o item mais recente dentro do limite de nuvens.
    """
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days_back)
    date_range = f"{start_date.strftime('%Y-%m-%dT%H:%M:%SZ')}/{end_date.strftime('%Y-%m-%dT%H:%M:%SZ')}"

    payload = {
        "collections": ["sentinel-2-l2a"],
        "bbox": bbox,
        "datetime": date_range,
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "sortby": [{"field": "datetime", "direction": "desc"}],
        "limit": 5,
    }

    response = requests.post(f"{STAC_URL}/search", json=payload, timeout=30)
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Erro ao buscar imagens no Planetary Computer: {response.text}",
        )

    data = response.json()
    items = data.get("features", [])

    if not items:
        return None

    return items[0]  # Imagem mais recente


def sign_planetary_computer_url(href: str) -> str:
    """Assina URL do Planetary Computer para acesso aos dados."""
    try:
        response = requests.get(
            "https://planetarycomputer.microsoft.com/api/sas/v1/sign",
            params={"href": href},
            timeout=15,
        )
        if response.status_code == 200:
            return response.json().get("href", href)
    except Exception:
        pass
    return href


def download_band_as_array(href: str, bbox_wgs84: List[float], target_epsg: int = 32724):
    """
    Baixa uma banda específica (recorte via bbox) usando rasterio.
    Retorna (array numpy, transform, crs).
    """
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, reproject

    signed_url = sign_planetary_computer_url(href)

    with rasterio.open(signed_url) as src:
        # Reprojetar bbox WGS84 para CRS da imagem
        import pyproj
        from shapely.geometry import box
        from shapely.ops import transform as shp_transform

        wgs84 = pyproj.CRS("EPSG:4326")
        img_crs = src.crs

        transformer = pyproj.Transformer.from_crs(wgs84, img_crs, always_xy=True)
        minx, miny = transformer.transform(bbox_wgs84[0], bbox_wgs84[1])
        maxx, maxy = transformer.transform(bbox_wgs84[2], bbox_wgs84[3])

        # Calcular janela de leitura
        from rasterio.windows import from_bounds as win_from_bounds
        window = win_from_bounds(minx, miny, maxx, maxy, src.transform)

        # Ler dados com resampling para 10m
        data = src.read(1, window=window, out_shape=(256, 256), resampling=Resampling.bilinear)
        win_transform = src.window_transform(window)

        return data.astype(np.float32), win_transform, src.crs


# ─── Processamento de índices e detecção ─────────────────────────
def compute_ndvi(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Calcula NDVI. Valores de 0 a 10000 (reflectância * 10000)."""
    red = red.astype(np.float32)
    nir = nir.astype(np.float32)
    with np.errstate(divide="ignore", invalid="ignore"):
        ndvi = np.where(
            (nir + red) > 0,
            (nir - red) / (nir + red),
            np.nan,
        )
    return ndvi


def compute_zscore(ndvi: np.ndarray) -> np.ndarray:
    """Calcula Z-Score do NDVI para detectar anomalias de biomassa."""
    valid = ndvi[~np.isnan(ndvi)]
    if len(valid) < 10:
        return np.full_like(ndvi, np.nan)
    mean = np.nanmean(valid)
    std = np.nanstd(valid)
    if std < 0.001:
        return np.full_like(ndvi, 0.0)
    return (ndvi - mean) / std


def vectorize_anomalies(
    zscore: np.ndarray,
    win_transform,
    img_crs,
    talhao_geom,
    threshold: float = 1.8,
    min_area_m2: float = 100.0,
) -> List[Dict]:
    """
    Converte pixels com Z-Score > threshold em polígonos GeoJSON,
    filtrando por área mínima e recortando ao talhão.
    """
    import pyproj
    import rasterio
    from rasterio.features import shapes
    from shapely.geometry import shape as shp_shape
    from shapely.ops import transform as shp_transform
    from shapely.ops import unary_union

    # Máscara binária de anomalias
    mask = (zscore > threshold).astype(np.uint8)

    if mask.sum() == 0:
        return []

    # Vetorizar pixels agrupados
    polys = []
    for geom_dict, value in shapes(mask, mask=(mask > 0), transform=win_transform):
        if value == 1:
            polys.append(shp_shape(geom_dict))

    if not polys:
        return []

    # Transformar do CRS da imagem para WGS84
    src_crs = pyproj.CRS(img_crs)
    wgs84 = pyproj.CRS("EPSG:4326")
    proj_to_wgs = pyproj.Transformer.from_crs(src_crs, wgs84, always_xy=True).transform

    # CRS para cálculo de área real
    mollweide = pyproj.CRS("+proj=moll +lon_0=0 +datum=WGS84 +units=m +no_defs")
    proj_to_moll = pyproj.Transformer.from_crs(wgs84, mollweide, always_xy=True).transform

    result = []
    for poly in polys:
        try:
            # Converter para WGS84
            poly_wgs = shp_transform(proj_to_wgs, poly)

            # Recortar ao talhão
            clipped = poly_wgs.intersection(talhao_geom)
            if clipped.is_empty:
                continue

            # Calcular área real
            clipped_moll = shp_transform(proj_to_moll, clipped)
            area = clipped_moll.area

            if area < min_area_m2:
                continue

            result.append({
                "type": "Feature",
                "properties": {
                    "area_m2": round(area, 1),
                    "area_ha": round(area / 10000, 4),
                },
                "geometry": mapping(clipped),
            })
        except Exception:
            continue

    return result


# ─── Endpoint principal ──────────────────────────────────────────
@app.post("/analyze", response_model=AnalysisResult)
async def analyze_talhao(req: TalhaoRequest):
    """
    Analisa um talhão em busca de infestação de ervas daninhas
    usando imagens Sentinel-2 do Microsoft Planetary Computer.
    """
    try:
        # 1. Extrair geometria
        talhao_geom = geojson_to_shapely(req.geojson)
        bbox = get_bbox_from_geojson(req.geojson)

        # 2. Buscar imagem Sentinel-2
        item = search_sentinel2(bbox, req.days_back, req.max_cloud)

        if item is None:
            # Tentar com mais dias e mais nuvens
            item = search_sentinel2(bbox, req.days_back * 2, 50)
            if item is None:
                return AnalysisResult(
                    success=False,
                    message=(
                        f"Nenhuma imagem Sentinel-2 disponível nos últimos {req.days_back * 2} dias "
                        f"para este talhão. Tente ampliar o intervalo de busca."
                    ),
                )

        satellite_date = item.get("properties", {}).get("datetime", "")[:10]
        cloud_cover = item.get("properties", {}).get("eo:cloud_cover", 0)
        assets = item.get("assets", {})

        # 3. Baixar bandas B04 (Red), B08 (NIR)
        # Tentar nomes alternativos das bandas
        red_key = next((k for k in ["B04", "red", "B4"] if k in assets), None)
        nir_key = next((k for k in ["B08", "nir", "B8"] if k in assets), None)

        if not red_key or not nir_key:
            return AnalysisResult(
                success=False,
                message="Bandas espectrais não encontradas na imagem selecionada.",
            )

        red_href = assets[red_key]["href"]
        nir_href = assets[nir_key]["href"]

        red_arr, transform_, crs_ = download_band_as_array(red_href, bbox)
        nir_arr, _, _ = download_band_as_array(nir_href, bbox)

        # 4. Calcular NDVI
        ndvi = compute_ndvi(red_arr, nir_arr)

        # 5. Calcular Z-Score
        zscore = compute_zscore(ndvi)

        # 6. Vetorizar anomalias
        reboleiras = vectorize_anomalies(
            zscore, transform_, crs_, talhao_geom,
            threshold=1.8, min_area_m2=100.0
        )

        if not reboleiras:
            return AnalysisResult(
                success=True,
                message=(
                    f"✅ Nenhuma infestação significativa detectada no talhão. "
                    f"Imagem de {satellite_date} (cobertura de nuvens: {cloud_cover:.0f}%)."
                ),
                satellite_date=satellite_date,
                cloud_cover=cloud_cover,
                total_infested_ha=0.0,
                reboleiras=[],
                geojson_collection={"type": "FeatureCollection", "features": []},
            )

        total_area_m2 = sum(r["properties"]["area_m2"] for r in reboleiras)
        total_ha = round(total_area_m2 / 10000, 4)

        geojson_collection = {
            "type": "FeatureCollection",
            "name": f"Reboleiras_{req.cod_talhao or 'talhao'}_{satellite_date}",
            "features": reboleiras,
        }

        return AnalysisResult(
            success=True,
            message=f"⚠️ {len(reboleiras)} foco(s) de infestação detectado(s) ({total_ha} ha).",
            satellite_date=satellite_date,
            cloud_cover=cloud_cover,
            total_infested_ha=total_ha,
            reboleiras=reboleiras,
            geojson_collection=geojson_collection,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno na análise: {str(e)}")


@app.get("/health")
async def health_check():
    return {"status": "online", "service": "GeoPortal NDB — Detecção de Infestação"}


# ─── DJI & XAG Endpoints ─────────────────────────────────────────

# TODO: Preencha aqui o e-mail e a senha do robô quando a conta for criada!
DJI_ROBOT_EMAIL = "geoportal.ndb@gmail.com"
DJI_ROBOT_PASSWORD = "AGROGIS_NDB"

@app.get("/api/dji/shared-fields")
async def get_dji_shared_fields():
    if DJI_ROBOT_EMAIL and DJI_ROBOT_PASSWORD:
        try:
            from scraper import DJISmartFarmScraper
            scraper = DJISmartFarmScraper(headless=False) # Para testar visualmente
            return scraper.get_shared_fields(DJI_ROBOT_EMAIL, DJI_ROBOT_PASSWORD)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        # Modo mock se não tiver senha
        return [{"id": "task1", "name": "TESTE 01 - SmartFarm (Simulado)", "area_ha": 16.26, "date": "2026-08-10"}]


class DjiToXagRequest(BaseModel):
    id: str

@app.post("/convert/dji-to-xag")
async def convert_dji_to_xag(req: DjiToXagRequest):
    import geopandas as gpd
    
    # Ler o histórico de GeoJSONs capturados
    geojson_path = "dji_saved_maps.json"
    if not os.path.exists(geojson_path):
        raise HTTPException(status_code=404, detail="Nenhum mapa salvo no sistema.")
        
    with open(geojson_path, "r", encoding="utf-8") as f:
        saved_maps = json.load(f)
        
    # Encontrar o mapa específico pelo ID
    dji_data = next((m for m in saved_maps if m["id"] == req.id), None)
    if not dji_data:
        raise HTTPException(status_code=404, detail="Mapa não encontrado no histórico.")
        
    geojson = dji_data.get('geojson', {})
        
    # Extrair as features do tipo Polygon (Geralmente PlantZone)
    features = [feat for feat in geojson.get('features', []) if feat.get('geometry') and feat['geometry']['type'] == 'Polygon']
    if not features:
        features = geojson.get('features', [])
        
    if not features:
        raise HTTPException(status_code=400, detail="O arquivo interceptado não contém polígonos válidos.")
        
    # Criar o GeoDataFrame
    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
    
    # Forçar geometria 2D (remover Z) para compatibilidade com o formato Shapefile
    try:
        from shapely import force_2d
        gdf['geometry'] = gdf['geometry'].apply(lambda geom: force_2d(geom) if geom else geom)
    except ImportError:
        pass
    
    # Adicionar colunas obrigatórias XAG
    gdf["Rate"] = 10.0
    gdf["Type"] = "Weed"
    gdf["ID"] = req.id
    
    # Write to in-memory ZIP
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        with tempfile.TemporaryDirectory() as tmpdir:
            shp_path = os.path.join(tmpdir, "xag_map.shp")
            gdf.to_file(shp_path, driver="ESRI Shapefile")
            
            # Read files and write to zip
            for ext in [".shp", ".shx", ".dbf", ".prj", ".cpg"]:
                file_path = os.path.join(tmpdir, f"xag_map{ext}")
                if os.path.exists(file_path):
                    zf.write(file_path, arcname=f"xag_map{ext}")
                    
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer, 
        media_type="application/zip", 
        headers={"Content-Disposition": "attachment; filename=xag_map.zip"}
    )



# ─── Inicialização ───────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
