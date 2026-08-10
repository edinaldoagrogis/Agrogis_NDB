import json
import math
import requests
import os
import concurrent.futures

# CONFIGURATION
ZOOM_LEVELS = [11, 13, 14, 15]  # Gerar zoom até 15 para alta resolução
GEOJSON_FILE = 'TALHOES.geojson'
OUTPUT_DIR = 'offline_tiles'
OUTPUT_JS = 'offline_tiles_list.js'
MAX_WORKERS = 10

def get_tile_url(x, y, z):
    return f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

def main():
    print("Calculando limites a partir do TALHOES.geojson...")
    with open(GEOJSON_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    all_tiles = set()
    
    for feat in data.get('features', []):
        geom = feat.get('geometry')
        if not geom: continue
        coords = geom.get('coordinates')
        gtype = geom.get('type')
        
        f_min_lon = 180; f_max_lon = -180
        f_min_lat = 90; f_max_lat = -90
        
        def process_coords(c, g):
            nonlocal f_min_lon, f_max_lon, f_min_lat, f_max_lat
            if g == 'Polygon':
                for ring in c:
                    for pt in ring:
                        f_min_lon = min(f_min_lon, pt[0]); f_max_lon = max(f_max_lon, pt[0])
                        f_min_lat = min(f_min_lat, pt[1]); f_max_lat = max(f_max_lat, pt[1])
            elif g == 'MultiPolygon':
                for poly in c:
                    for ring in poly:
                        for pt in ring:
                            f_min_lon = min(f_min_lon, pt[0]); f_max_lon = max(f_max_lon, pt[0])
                            f_min_lat = min(f_min_lat, pt[1]); f_max_lat = max(f_max_lat, pt[1])
                            
        process_coords(coords, gtype)
        
        # Adicionar pequena margem para este talhão
        lon_margin = (f_max_lon - f_min_lon) * 0.10 if f_max_lon > f_min_lon else 0.001
        lat_margin = (f_max_lat - f_min_lat) * 0.10 if f_max_lat > f_min_lat else 0.001
        f_min_lon -= lon_margin; f_max_lon += lon_margin
        f_min_lat -= lat_margin; f_max_lat += lat_margin
        
        for z in ZOOM_LEVELS:
            x_min, y_max = deg2num(f_min_lat, f_min_lon, z)
            x_max, y_min = deg2num(f_max_lat, f_max_lon, z)
            if y_min > y_max:
                y_min, y_max = y_max, y_min
            for x in range(x_min, x_max + 1):
                for y in range(y_min, y_max + 1):
                    all_tiles.add((z, x, y))
                    
    total_tiles = len(all_tiles)
    print(f"Total de fragmentos otimizados a baixar: {total_tiles}")
    
    if total_tiles > 3000:
        print("Muitos tiles! Abortando para segurança.")
        return

    print("Baixando tiles (isso pode demorar um pouco)...")
    
    def download_tile(z, x, y):
        url = get_tile_url(x, y, z)
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        filepath = os.path.join(OUTPUT_DIR, str(z), str(x), f"{y}.jpg")
        
        # Ignorar se já existe
        if os.path.exists(filepath):
            return filepath
            
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                with open(filepath, 'wb') as f:
                    f.write(resp.content)
                return filepath
            else:
                print(f"Failed {z}/{x}/{y}: HTTP {resp.status_code}")
        except Exception as e:
            print(f"Error {z}/{x}/{y}: {e}")
        return None

    tiles_downloaded = 0
    failed_tiles = 0
    saved_paths = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(download_tile, z, x, y): (z, x, y) for z, x, y in all_tiles}
                
        for future in concurrent.futures.as_completed(futures):
            path = future.result()
            tiles_downloaded += 1
            if tiles_downloaded % 50 == 0:
                print(f"Progresso: {tiles_downloaded}/{total_tiles}")
            if path:
                # Add to list using relative path with forward slashes for URLs
                rel_path = path.replace("\\", "/")
                saved_paths.append(rel_path)
            else:
                failed_tiles += 1
                
    print(f"Download concluído. Tiles que falharam: {failed_tiles}")
    
    print(f"Salvando {OUTPUT_JS}...")
    js_content = "const OFFLINE_TILES_LIST = [\n"
    js_content += ",\n".join([f"    './{p}'" for p in saved_paths])
    js_content += "\n];\n"
    with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print("Sucesso!")

if __name__ == "__main__":
    main()
