import json
import os
import requests
import concurrent.futures

# CONFIGURATION
GRID_COLS = 5
GRID_ROWS = 5
GEOJSON_FILE = 'TALHOES.geojson'
OUTPUT_DIR = 'offline_images'
OUTPUT_JS = 'offline_images_config.js'
MAX_WORKERS = 3
IMAGE_SIZE = 1200 # Download 1200x1200 images for lighter size and faster download

def get_export_url(min_lon, min_lat, max_lon, max_lat):
    # bboxSR=4326 (input coordinates are lat/lon)
    # imageSR=3857 (output image is Web Mercator to align with Leaflet)
    return f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox={min_lon},{min_lat},{max_lon},{max_lat}&bboxSR=4326&size={IMAGE_SIZE},{IMAGE_SIZE}&imageSR=3857&format=jpg&f=image"

def process_coords(coords, bounds):
    if not coords: return
    if isinstance(coords[0], (float, int)):
        lon, lat = coords[0], coords[1]
        if lon < bounds['min_lon']: bounds['min_lon'] = lon
        if lon > bounds['max_lon']: bounds['max_lon'] = lon
        if lat < bounds['min_lat']: bounds['min_lat'] = lat
        if lat > bounds['max_lat']: bounds['max_lat'] = lat
    else:
        for c in coords:
            process_coords(c, bounds)

def download_image(url, filepath, retries=5):
    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
        return filepath
    
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=45)
            if r.status_code == 200:
                with open(filepath, 'wb') as f:
                    f.write(r.content)
                return filepath
            else:
                print(f"Attempt {attempt+1} failed with status {r.status_code}")
        except Exception as e:
            print(f"Error downloading {url} (Attempt {attempt+1}): {e}")
    return None

def main():
    print("Calculando limites a partir do TALHOES.geojson...")
    with open(GEOJSON_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    bounds = {'min_lon': 180, 'min_lat': 90, 'max_lon': -180, 'max_lat': -90}
    
    for feature in data['features']:
        if feature.get('geometry'):
            process_coords(feature['geometry']['coordinates'], bounds)
            
    # Add a tiny buffer (1%) to the bounds to ensure edge polygons aren't cut off
    lon_buffer = (bounds['max_lon'] - bounds['min_lon']) * 0.01
    lat_buffer = (bounds['max_lat'] - bounds['min_lat']) * 0.01
    min_lon = bounds['min_lon'] - lon_buffer
    max_lon = bounds['max_lon'] + lon_buffer
    min_lat = bounds['min_lat'] - lat_buffer
    max_lat = bounds['max_lat'] + lat_buffer

    print(f"BBox Total: {min_lon}, {min_lat}, {max_lon}, {max_lat}")
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    lon_step = (max_lon - min_lon) / GRID_COLS
    lat_step = (max_lat - min_lat) / GRID_ROWS
    
    tasks = []
    config_items = []
    
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            cell_min_lon = min_lon + (col * lon_step)
            cell_max_lon = cell_min_lon + lon_step
            # Row 0 is the bottom-most row in coordinates, but let's just go bottom to top
            cell_min_lat = min_lat + (row * lat_step)
            cell_max_lat = cell_min_lat + lat_step
            
            # Leaflet bounds format: [[south, west], [north, east]]
            leaflet_bounds = [[cell_min_lat, cell_min_lon], [cell_max_lat, cell_max_lon]]
            
            filename = f"part_{col}_{row}.jpg"
            filepath = os.path.join(OUTPUT_DIR, filename)
            
            url = get_export_url(cell_min_lon, cell_min_lat, cell_max_lon, cell_max_lat)
            
            tasks.append((url, filepath))
            config_items.append({
                "url": f"./{OUTPUT_DIR}/{filename}",
                "bounds": leaflet_bounds
            })
            
    print(f"Baixando {len(tasks)} imagens em grid...")
    downloaded = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(download_image, t[0], t[1]): t for t in tasks}
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res:
                downloaded += 1
                print(f"Baixado {downloaded}/{len(tasks)}: {os.path.basename(res)}")
            else:
                print("Falha no download de uma imagem.")
                
    # Generate config js
    print(f"Salvando {OUTPUT_JS}...")
    js_content = "const OFFLINE_IMAGES_CONFIG = " + json.dumps(config_items, indent=4) + ";\n"
    with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print("Concluído!")

if __name__ == "__main__":
    main()
