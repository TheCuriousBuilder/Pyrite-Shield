Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$outputDir = "C:\Users\anirv\Desktop\Projects\Extensions\PyriteShield\icons"

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  # Background: Pyrite gold circle
  $bgBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(184, 134, 11))
  $g.FillEllipse($bgBrush, 0, 0, $size - 1, $size - 1)

  # Dark navy cross
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(26, 26, 46), [Math]::Max(1, $size / 8))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $centerX = $size / 2
  $centerY = $size / 2
  $crossLen = $size * 0.55

  # Vertical line
  $g.DrawLine($pen, $centerX, $centerY - $crossLen/2, $centerX, $centerY + $crossLen/2)
  # Horizontal line
  $g.DrawLine($pen, $centerX - $crossLen/2, $centerY, $centerX + $crossLen/2, $centerY)

  # Dark navy inner circle
  $innerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(26, 26, 46))
  $innerR = $size * 0.2
  $g.FillEllipse($innerBrush, $centerX - $innerR, $centerY - $innerR, $innerR * 2, $innerR * 2)

  $outputPath = Join-Path $outputDir "icon-$size.png"
  $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose()
  $bmp.Dispose()
  Write-Host "Created: $outputPath"
}

Write-Host "`n✅ Pyrite Shield icons regenerated with gold theme!"
