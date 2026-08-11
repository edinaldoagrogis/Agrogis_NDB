Add-Type -AssemblyName System.Drawing
$orig = [System.Drawing.Image]::FromFile('c:\Users\EDINALDO\Documents\GEOPORTAL_NDB_002\app_icon.png')
$bmp = New-Object System.Drawing.Bitmap(512, 512)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$ratioX = 512 / $orig.Width
$ratioY = 512 / $orig.Height
if ($ratioX -lt $ratioY) { $ratio = $ratioX } else { $ratio = $ratioY }
$newW = [int]($orig.Width * $ratio)
$newH = [int]($orig.Height * $ratio)
$posX = [int]((512 - $newW) / 2)
$posY = [int]((512 - $newH) / 2)
$g.DrawImage($orig, $posX, $posY, $newW, $newH)
$bmp.Save('c:\Users\EDINALDO\Documents\GEOPORTAL_NDB_002\app_icon_512.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$orig.Dispose()
