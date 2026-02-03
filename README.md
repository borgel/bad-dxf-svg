# DXF to SVG Converter for Laser Cutting

A single-file webapp that converts DXF files to SVG format optimized for Glowforge and other laser cutters.

## Features

- **Drag & drop upload** - Simply drop a DXF file or click to browse
- **Auto-detect units** - Automatically determines if your file is in mm or inches based on geometry size
- **Manual override** - Force mm or inches if auto-detection isn't right
- **Live preview** - See your converted design before downloading
- **Glowforge-ready output** - SVG formatted with proper stroke/fill attributes for cutting

## Supported DXF Entities

- LINE
- CIRCLE
- ELLIPSE
- ARC
- LWPOLYLINE
- POLYLINE
- SPLINE (interpolated to polyline)

## Not Supported

- TEXT, MTEXT - Convert text to paths/outlines in your CAD software before exporting
- DIMENSION - Remove or explode dimensions before exporting
- HATCH - Pattern fills are not rendered

## Usage

1. Open `index.html` in a web browser
2. Drop your DXF file onto the upload area
3. Adjust units if needed (auto-detect works for most files)
4. Preview the result
5. Click "Download SVG"
6. Import the SVG into Glowforge (or your laser cutter software)

## Hosting on GitHub Pages

1. Push this repo to GitHub
2. Go to Settings > Pages
3. Select "Deploy from a branch"
4. Choose `main` branch and `/ (root)` folder
5. Your converter will be live at `https://<username>.github.io/<repo-name>/`

## Technical Details

- Uses the [dxf](https://www.npmjs.com/package/dxf) library (v5.3.1) loaded from CDN
- Single HTML file with embedded CSS and JavaScript
- No build step required
- Works offline after initial page load (library is cached)

## Unit Auto-Detection Logic

- If max dimension < 1 unit → assumes inches, converts to mm
- If max dimension > 2000 units → assumes mm
- Otherwise → assumes mm (most common for laser cutting)
