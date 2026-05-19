Add-Type -AssemblyName System.Drawing

function Convert-Image {
    param (
        [string]$sourcePath,
        [string]$destPath,
        [int]$width,
        [int]$height
    )
    
    write-output "Converting $sourcePath to $destPath ($width x $height)..."
    
    # Load original image
    $srcImg = [System.Drawing.Image]::FromFile($sourcePath)
    
    # Create new bitmap with target size
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Set high quality resize settings
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    # Draw original image onto new bitmap
    $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
    $g.DrawImage($srcImg, $rect)
    
    # Save as PNG
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Dispose resources
    $g.Dispose()
    $bmp.Dispose()
    $srcImg.Dispose()
}

# Determine correct sources (we want to use the larger ones if possible)
$currentDir = Get-Location
$iconSrc = Join-Path $currentDir "public\icon.png"
$logoSrc = Join-Path $currentDir "public\logo.png"

# We will write temporary files first
$iconDest = Join-Path $currentDir "public\icon_fixed.png"
$logoDest = Join-Path $currentDir "public\logo_fixed.png"

# Perform conversion
Convert-Image -sourcePath $iconSrc -destPath $iconDest -width 192 -height 192
Convert-Image -sourcePath $logoSrc -destPath $logoDest -width 512 -height 512

# Replace original files
Remove-Item -Path $iconSrc -Force -ErrorAction SilentlyContinue
Remove-Item -Path $logoSrc -Force -ErrorAction SilentlyContinue

Rename-Item -Path $iconDest -NewName "icon.png"
Rename-Item -Path $logoDest -NewName "logo.png"

write-output "Done converting!"
