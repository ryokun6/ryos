# Tauri Icons

This directory contains the app icons for different platforms.

## Generating Icons

Tauri requires specific icon formats for each platform:
- **macOS**: `icon.icns` (and various PNG sizes)
- **Windows**: `icon.ico`
- **Linux**: Various PNG sizes (32x32, 128x128, 128x128@2x)

To generate all required icon formats from the source `icon.png`:

```bash
bunx tauri icon src-tauri/icons/icon.png
```

This will generate all the required icon files in this directory.

## Manual Generation

If you prefer to generate icons manually:

1. **macOS (.icns)**: Use `iconutil` or online converters
2. **Windows (.ico)**: Use online converters or ImageMagick
3. **Linux PNGs**: Resize the source image to required sizes

The source icon (`icon.png`) should be at least 512x512 pixels for best results.

