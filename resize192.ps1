Add-Type -AssemblyName System.Drawing
$orig = [System.Drawing.Image]::FromFile('c:\Users\EDINALDO\Documents\GEOPORTAL_NDB_002\app_icon_512.png')
$bmp = New-Object System.Drawing.Bitmap(192, 192)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($orig, 0, 0, 192, 192)
$bmp.Save('c:\Users\EDINALDO\Documents\GEOPORTAL_NDB_002\app_icon_192.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$orig.Dispose()
