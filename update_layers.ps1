$appDir = $PSScriptRoot
$sourceDir = "C:\Users\EDINALDO\Documents\GEOPORTAL"
$outputFile = "$appDir\layers_data.js"

$jsContent = "const GEOPORTAL_LAYERS = {`n"
$first = $true

# Function to process files in a specific directory
function Process-GeoJsonFiles {
    param([string]$path)
    
    if (Test-Path $path) {
        Get-ChildItem -Path $path -Filter *.geojson | ForEach-Object {
            $content = Get-Content -Raw -Path $_.FullName
            $name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
            
            # Simple check to avoid duplicates if same file exists in multiple places
            if ($script:jsContent -notmatch "`"$name`":") {
                if (-not $script:first) {
                    $script:jsContent += ",`n"
                }
                $script:first = $false
                
                # Assign a distinct color identifier based on hash of name for UI consistency
                $script:jsContent += "  `"$name`": " + $content
            }
        }
    }
}

# Scan the parent directory
Process-GeoJsonFiles -path $sourceDir

# Scan the app directory just in case
Process-GeoJsonFiles -path $appDir

$jsContent += "`n};`n"

# Process Equipes CSV
$csvFile = "$appDir\equipes.csv"
$equipesJs = "const EQUIPES_DATA = [];`n"
if (Test-Path $csvFile) {
    try {
        $csvData = Import-Csv -Path $csvFile -Delimiter ';' -Encoding UTF8
        $json = $csvData | ConvertTo-Json -Depth 10 -Compress
        if ($json -match '^\[') {
            $equipesJs = "const EQUIPES_DATA = $json;`n"
        } elseif ($json) {
            $equipesJs = "const EQUIPES_DATA = [$json];`n"
        }
    } catch {
        Write-Host "Erro ao processar equipes.csv: $_"
    }
}

$jsContent += "`n$equipesJs"

# Save the final JS file
Set-Content -Path $outputFile -Value $jsContent -Encoding UTF8

Write-Host "Atualizando mapa base offline..."
python generate_offline_basemap.py
