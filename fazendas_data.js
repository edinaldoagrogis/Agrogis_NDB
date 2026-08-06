// Coloque os dados do GeoJSON diretamente aqui se as requisições AJAX falharem.
const fazendasGeoJSON = {
  "type": "FeatureCollection",
  "name": "FAZENDAS",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },
  "features": [
    { "type": "Feature", "properties": { "Name": "5878 - NOVO BALÃO" }, "geometry": { "type": "Point", "coordinates": [ -39.9762985627993, -18.253259570046499, 0.0 ] } },
    { "type": "Feature", "properties": { "Name": "7935 - Faz. Santa Rita" }, "geometry": { "type": "Point", "coordinates": [ -40.254094134081598, -18.086407648021702, 0.0 ] } },
    { "type": "Feature", "properties": { "Name": "9003 - Faz. Olhos d'água" }, "geometry": { "type": "Point", "coordinates": [ -40.312847022664201, -17.965755594192899, 0.0 ] } },
    { "type": "Feature", "properties": { "Name": "9013 - Faz. Planalto" }, "geometry": { "type": "Point", "coordinates": [ -40.239095514395999, -17.9713962791675, 0.0 ] } },
    { "type": "Feature", "properties": { "Name": "9014 - Faz. Retirada da Lacuna" }, "geometry": { "type": "Point", "coordinates": [ -40.223954236867698, -17.940514329589, 0.0 ] } }
  ]
};
