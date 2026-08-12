import os
import json
import math
import logging
import zipfile
import numpy as np
import rasterio
from rasterio.windows import Window, from_bounds
from rasterio.transform import xy, rowcol
import cv2
import geopandas as gpd
from shapely.geometry import Polygon, LineString, mapping, shape
from skimage.morphology import skeletonize

logger = logging.getLogger(__name__)

class OrthoProcessor:
    """
    Processador de ortomosaicos para detecção de talhões e linhas de plantio.
    """
    def __init__(self, filepath, row_spacing_m=1.5, gsd_cm=3.0):
        """
        Inicializa o processador.
        
        Args:
            filepath (str): Caminho para o arquivo GeoTIFF.
            row_spacing_m (float): Espaçamento entre as linhas de plantio em metros.
            gsd_cm (float): Ground Sample Distance em centímetros por pixel.
        """
        self.filepath = filepath
        self.row_spacing_m = row_spacing_m
        self.gsd_cm = gsd_cm
        
        # Calcular espaçamento em pixels:
        # Ex: 1.5m / (3.0cm / 100) = 1.5 / 0.03 = 50 pixels
        self.row_spacing_px = int(self.row_spacing_m / (self.gsd_cm / 100.0))
        logger.info(f"Espaçamento de linhas calculado: {self.row_spacing_px} pixels")

    def detect_fields(self) -> dict:
        """
        Detecta os limites dos talhões usando o índice de vegetação ExG e limiarização.
        Processa uma versão de baixa resolução da imagem por questões de desempenho.
        Retorna um GeoJSON FeatureCollection com os polígonos.
        """
        logger.info(f"Iniciando detecção de talhões no arquivo {self.filepath}")
        
        with rasterio.open(self.filepath) as src:
            # Definir fator de decimação para downsampling (ex: 8x menor)
            decimation_factor = 8
            out_width = int(src.width / decimation_factor)
            out_height = int(src.height / decimation_factor)
            out_shape = (src.count, out_height, out_width)
            
            # Lendo a imagem decimada
            data = src.read(
                out_shape=out_shape,
                resampling=rasterio.enums.Resampling.bilinear
            )
            
            # Ajustar a transformação afim para os pixels downsampled
            # transform.scale multiplica a largura e altura do pixel pelo fator
            transform = src.transform * src.transform.scale(
                (src.width / out_width),
                (src.height / out_height)
            )

        # Converter para float32 e extrair bandas assumindo ordem RGB padrão
        # rasterio geralmente lê R=1, G=2, B=3 (índices 0, 1, 2)
        r = data[0].astype(np.float32)
        g = data[1].astype(np.float32)
        b = data[2].astype(np.float32)
        
        # Máscara de no-data (geralmente preto absoluto ou branco absoluto)
        mask_nodata = ((r == 0) & (g == 0) & (b == 0)) | ((r == 255) & (g == 255) & (b == 255))
        
        # Calcular Índice ExG (Excess Green) = 2*G - R - B
        exg = 2 * g - r - b
        exg[mask_nodata] = 0
        
        # Normalizar para 0-255 para o OpenCV
        exg_min = exg.min()
        exg_max = exg.max()
        if exg_max > exg_min:
            exg_norm = ((exg - exg_min) / (exg_max - exg_min) * 255).astype(np.uint8)
        else:
            exg_norm = np.zeros_like(exg, dtype=np.uint8)
            
        # Aplicar limiarização de Otsu para criar a máscara binária
        _, binary = cv2.threshold(exg_norm, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        binary[mask_nodata] = 0
        
        # Operações morfológicas para consolidar áreas do talhão
        # Fechamento (Close) para juntar áreas próximas
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (50, 50))
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close)
        
        # Abertura (Open) para remover ruídos isolados
        kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open)
        
        # Encontrar contornos
        contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        features = []
        for i, cnt in enumerate(contours):
            # Simplificar o contorno usando algoritmo de Douglas-Peucker
            epsilon = 0.005 * cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, epsilon, True)
            
            # Ignorar polígonos inválidos
            if len(approx) < 3:
                continue
                
            # Converter coordenadas do pixel para coordenadas geográficas
            geo_coords = []
            for pt in approx:
                px, py = pt[0][0], pt[0][1]
                # rasterio.transform.xy recebe linha (y), coluna (x) e retorna x, y
                gx, gy = xy(transform, py, px)
                geo_coords.append((gx, gy))
                
            # Fechar o anel do polígono
            geo_coords.append(geo_coords[0])
            
            poly = Polygon(geo_coords)
            
            # Área aproximada em metros quadrados
            # O CRS projetado tem unidades em metros.
            area_m2 = poly.area
            area_ha = area_m2 / 10000.0
            
            # Filtrar áreas menores que 5000 m² (meio hectare)
            if area_m2 < 5000:
                continue
                
            features.append({
                "type": "Feature",
                "geometry": mapping(poly),
                "properties": {
                    "id": i,
                    "area_ha": round(area_ha, 2)
                }
            })
            
        logger.info(f"{len(features)} talhões detectados.")
        
        return {
            "type": "FeatureCollection",
            "features": features
        }

    def detect_planting_lines(self, field_polygons_geojson: dict) -> dict:
        """
        Detecta linhas de plantio baseando-se nos contornos dos talhões, 
        lendo o raster apenas onde for necessário para poupar memória.
        Retorna um GeoJSON FeatureCollection de LineStrings.
        """
        logger.info("Iniciando detecção de linhas de plantio...")
        features = field_polygons_geojson.get("features", [])
        
        all_lines_features = []
        
        with rasterio.open(self.filepath) as src:
            transform = src.transform
            
            for feature in features:
                poly = shape(feature["geometry"])
                
                # Obter o bounding box (bounds) geográfico do talhão
                minx, miny, maxx, maxy = poly.bounds
                
                # Converter bounds para window (janela do pixel) na imagem original
                window = from_bounds(minx, miny, maxx, maxy, transform)
                
                # Arredondar para usar inteiros nas dimensões da janela
                col_off = max(0, int(math.floor(window.col_off)))
                row_off = max(0, int(math.floor(window.row_off)))
                width = min(src.width - col_off, int(math.ceil(window.width)))
                height = min(src.height - row_off, int(math.ceil(window.height)))
                
                if width <= 0 or height <= 0:
                    continue
                    
                window = Window(col_off, row_off, width, height)
                
                # Transformação para a janela atual (top-left local)
                win_transform = src.window_transform(window)
                
                # Ler a porção da imagem correspondente ao bounding box do polígono
                # Lendo RGB
                data = src.read(window=window)
                if data.shape[0] >= 3:
                    # Converter RGB para tons de cinza
                    r, g, b = data[0], data[1], data[2]
                    gray = (0.2989 * r + 0.5870 * g + 0.1140 * b).astype(np.uint8)
                else:
                    gray = data[0].astype(np.uint8)
                    
                # Aplicar CLAHE para melhoria de contraste
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                gray_clahe = clahe.apply(gray)
                
                # Filtros Gabor para detectar features lineares (texturas direcionais)
                gabor_responses = []
                for theta in range(0, 180, 15):
                    theta_rad = np.radians(theta)
                    # Kernel Gabor
                    # Parâmetros ajustáveis conforme a necessidade
                    kernel = cv2.getGaborKernel((21, 21), 5.0, theta_rad, 10.0, 0.5, 0, ktype=cv2.CV_32F)
                    filtered = cv2.filter2D(gray_clahe, cv2.CV_8UC3, kernel)
                    gabor_responses.append(filtered)
                    
                # Maximizar a resposta do Gabor ao longo de todas as direções
                max_gabor = np.max(gabor_responses, axis=0)
                
                # Limiarização na resposta dos filtros Gabor
                _, binary_lines = cv2.threshold(max_gabor, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                
                # Converter para escala 0-1 bool para aplicar skeletonize
                binary_bool = binary_lines > 0
                
                # Skeletonize afina as linhas grossas em 1 pixel de espessura
                skeleton = skeletonize(binary_bool)
                skeleton_uint8 = (skeleton * 255).astype(np.uint8)
                
                # Transformada de Hough para encontrar segmentos de linha reta
                # maxLineGap controla junção das quebras na linha
                minLineLength = self.row_spacing_px * 3
                maxLineGap = self.row_spacing_px * 1
                
                lines = cv2.HoughLinesP(
                    skeleton_uint8,
                    rho=1,
                    theta=np.pi/180,
                    threshold=50,
                    minLineLength=minLineLength,
                    maxLineGap=maxLineGap
                )
                
                if lines is None:
                    continue
                    
                # Agrupamento (clustering) e união (merge) simples de linhas próximas pode ser feito aqui
                # (Para manter simplicidade, vamos exportar as linhas brutas encontradas)
                
                for line_arr in lines:
                    x1, y1, x2, y2 = line_arr[0]
                    
                    # Coordenadas geográficas
                    gx1, gy1 = xy(win_transform, y1, x1)
                    gx2, gy2 = xy(win_transform, y2, x2)
                    
                    linestring = LineString([(gx1, gy1), (gx2, gy2)])
                    
                    # Interseção com o talhão (clipping)
                    # Retém apenas a parte da linha que cai dentro do polígono exato do talhão
                    intersection = poly.intersection(linestring)
                    
                    if intersection.is_empty:
                        continue
                        
                    # Tratar casos onde a interseção possa resultar em MultiLineString
                    if intersection.geom_type == 'LineString':
                        parts = [intersection]
                    elif intersection.geom_type == 'MultiLineString':
                        parts = list(intersection.geoms)
                    else:
                        continue
                        
                    for part in parts:
                        all_lines_features.append({
                            "type": "Feature",
                            "geometry": mapping(part),
                            "properties": {
                                "field_id": feature.get("properties", {}).get("id", -1)
                            }
                        })
                        
        logger.info(f"{len(all_lines_features)} segmentos de linha encontrados.")
        
        return {
            "type": "FeatureCollection",
            "features": all_lines_features
        }

    def export_shapefiles(self, fields_geojson: dict, lines_geojson: dict, output_dir: str) -> str:
        """
        Exporta os GeoJSONs gerados para arquivos shapefile, zipa-os e retorna o caminho para o ZIP.
        Preserva o CRS original do arquivo GeoTIFF.
        """
        logger.info(f"Exportando shapefiles para o diretório {output_dir}")
        os.makedirs(output_dir, exist_ok=True)
        
        # Recuperar CRS original do raster
        with rasterio.open(self.filepath) as src:
            raster_crs = src.crs

        # Preparar caminhos temporários para .shp
        fields_shp = os.path.join(output_dir, "talhoes.shp")
        lines_shp = os.path.join(output_dir, "linhas_plantio.shp")
        
        # Exportar talhões se houver features
        if fields_geojson.get("features"):
            gdf_fields = gpd.GeoDataFrame.from_features(fields_geojson, crs=raster_crs)
            gdf_fields.to_file(fields_shp, driver="ESRI Shapefile")
            
        # Exportar linhas se houver features
        if lines_geojson.get("features"):
            gdf_lines = gpd.GeoDataFrame.from_features(lines_geojson, crs=raster_crs)
            gdf_lines.to_file(lines_shp, driver="ESRI Shapefile")
            
        # Criar o arquivo ZIP contendo todas as extensões criadas
        zip_path = os.path.join(output_dir, "resultado_processamento.zip")
        
        valid_extensions = {".shp", ".shx", ".dbf", ".prj", ".cpg"}
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, _, files in os.walk(output_dir):
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext in valid_extensions:
                        file_path = os.path.join(root, file)
                        # Adiciona no zip somente o nome do arquivo (sem o caminho completo)
                        zipf.write(file_path, arcname=file)
                        
        logger.info(f"Shapefiles exportados com sucesso para {zip_path}")
        return zip_path

    def cleanup(self):
        """
        Remove o arquivo de ortomosaico e limpa recursos persistidos se necessário.
        """
        try:
            if os.path.exists(self.filepath):
                os.remove(self.filepath)
                logger.info(f"Arquivo removido com sucesso: {self.filepath}")
        except Exception as e:
            logger.error(f"Erro ao remover arquivo {self.filepath}: {e}")

    def get_bounds(self) -> dict:
        """
        Obtém os limites (bounding box) geográficos da imagem.
        Retorna dicionário com west, south, east, north.
        """
        with rasterio.open(self.filepath) as src:
            bounds = src.bounds
            return {
                "west": bounds.left,
                "south": bounds.bottom,
                "east": bounds.right,
                "north": bounds.top
            }

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    logger.info("Executando módulo em modo autônomo para testes.")
    # Exemplo de teste da classe caso seja chamado via script
    # ortho = OrthoProcessor("caminho/para/imagem.tif")
    # fields = ortho.detect_fields()
    # lines = ortho.detect_planting_lines(fields)
    # zip_path = ortho.export_shapefiles(fields, lines, "caminho/de/saida")
    # ortho.cleanup()
