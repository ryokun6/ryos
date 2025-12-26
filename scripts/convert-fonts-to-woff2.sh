#!/bin/bash
# Convert TTF/OTF/WOFF fonts to WOFF2 format for better compression

FONTS_DIR="public/fonts"

cd "$(dirname "$0")/.."

echo "Converting fonts to WOFF2..."

# List of fonts to convert (only those used in fonts.css and index.css)
fonts=(
  "ChicagoKare-Regular.woff"
  "SerenityOS-Emoji.ttf"
  "geneva-12.ttf"
  "geneva-9.ttf"
  "AppleGaramond-Light.ttf"
  "monacottf.otf"
  "Jacquard12-Regular.ttf"
  "LucidaGrande.ttf"
  "LucidaGrande-Bold.ttf"
  "VAGRoundedStd-Bold.ttf"
)

for font in "${fonts[@]}"; do
  src="$FONTS_DIR/$font"
  # Get base name without extension
  base="${font%.*}"
  dest="$FONTS_DIR/${base}.woff2"
  
  if [ -f "$src" ]; then
    if [ -f "$dest" ]; then
      echo "  Skipping $font (woff2 already exists)"
    else
      echo "  Converting $font -> ${base}.woff2"
      python3 -c "
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import compress

font = TTFont('$src')
font.flavor = 'woff2'
font.save('$dest')
print(f'    Created: $dest')
"
    fi
  else
    echo "  Warning: $src not found"
  fi
done

echo ""
echo "Comparing file sizes:"
for font in "${fonts[@]}"; do
  src="$FONTS_DIR/$font"
  base="${font%.*}"
  dest="$FONTS_DIR/${base}.woff2"
  
  if [ -f "$src" ] && [ -f "$dest" ]; then
    src_size=$(stat -f%z "$src" 2>/dev/null || stat -c%s "$src" 2>/dev/null)
    dest_size=$(stat -f%z "$dest" 2>/dev/null || stat -c%s "$dest" 2>/dev/null)
    savings=$((src_size - dest_size))
    percent=$((100 - (dest_size * 100 / src_size)))
    echo "  $font: ${src_size} -> ${dest_size} bytes (${percent}% smaller)"
  fi
done

echo ""
echo "Done! Remember to update fonts.css to use .woff2 files."
