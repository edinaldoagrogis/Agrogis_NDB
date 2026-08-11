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
IMAGE_SIZE = 1200
import math

def latlon_to_meters(lat, lon):
    x = lon * 20037508.34 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180)
    y = y * 20037508.34 / 180
    return x, y

def meters_to_latlon(x, y):
    lon = (x / 20037508.34) * 180
    lat = 180 / math.pi * (2 * math.atan(math.exp(y * 20037508.34 / 180 * math.pi / 180 / 20037508.34)) - math.pi / 2) # simplified:
    # Actually simpler:
    y_deg = (y / 20037508.34) * 180
    lat = 180 / math.pi * (2 * math.atan(math.exp(y_deg * math.pi / 180)) - math.pi / 2)
    return lat, lon

def get_export_url(min_x, min_y, max_x, max_y, width, height):
    # Send request completely in Web Mercator (3857) to avoid any reprojection bounding-box distortion by ArcGIS
    return f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox={min_x},{min_y},{max_x},{max_y}&bboxSR=3857&size={width},{height}&imageSR=3857&format=jpg&f=image"

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
    # Convert overall bounding box to Web Mercator
    min_x, min_y = latlon_to_meters(min_lat, min_lon)
    max_x, max_y = latlon_to_meters(max_lat, max_lon)
    
    print(f"BBox Lat/Lon: {min_lon}, {min_lat}, {max_lon}, {max_lat}")
    print(f"BBox Web Mercator: {min_x}, {min_y}, {max_x}, {max_y}")
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Generate 5x5 grid in Web Mercator
    x_step = (max_x - min_x) / GRID_COLS
    y_step = (max_y - min_y) / GRID_ROWS
    
    # Calculate exact pixel dimensions for each cell to prevent ArcGIS from altering the bounding box to fix aspect ratio
    if x_step > y_step:
        img_w = IMAGE_SIZE
        img_h = int(IMAGE_SIZE * (y_step / x_step))
    else:
        img_h = IMAGE_SIZE
        img_w = int(IMAGE_SIZE * (x_step / y_step))
    
    print(f"Cell Size: {x_step}m x {y_step}m")
    print(f"Image Resolution: {img_w}x{img_h} pixels")
    print(f"Baixando {GRID_COLS * GRID_ROWS} imagens em grid...")
    
    config_items = []
    
    tasks = []
    
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            cell_min_x = min_x + (col * x_step)
            cell_max_x = cell_min_x + x_step
            cell_min_y = min_y + (row * y_step)
            cell_max_y = cell_min_y + y_step
            
            # Convert back to lat/lon for Leaflet
            cell_min_lat, cell_min_lon = meters_to_latlon(cell_min_x, cell_min_y)
            cell_max_lat, cell_max_lon = meters_to_latlon(cell_max_x, cell_max_y)
            
            # Leaflet bounds format: [[south, west], [north, east]]
            leaflet_bounds = [[cell_min_lat, cell_min_lon], [cell_max_lat, cell_max_lon]]
            
            filename = f"part_{col}_{row}.jpg"
            filepath = os.path.join(OUTPUT_DIR, filename)
            
            url = get_export_url(cell_min_x, cell_min_y, cell_max_x, cell_max_y, img_w, img_h)
            
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
