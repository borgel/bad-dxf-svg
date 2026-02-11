# DXF to SVG Converter for Laser Cutting

A single-file webapp that converts DXF files to SVG format optimized for Glowforge and other laser cutters.

**Try it now:** [borgel.github.io/bad-dxf-svg](https://borgel.github.io/bad-dxf-svg/)

## Features

- **Drag & drop upload** — drop one or more DXF files, or click to browse
- **Multi-file compositing** — combine parts from multiple DXF files into a single layout
- **Auto-detect units** — automatically determines if your file is in mm or inches based on geometry size
- **Manual unit override** — force mm or inches if auto-detection isn't right
- **Live preview** — see your converted design before downloading
- **Move mode** — drag groups to reposition parts in the layout
- **Point-to-point snapping** — groups snap to endpoints of other groups and bed corners/midpoints (toggleable)
- **Bed/tray overlay** — visual guide for your laser cutter bed area with Glowforge preset (19.5″×11″) or custom dimensions
- **Color assignment** — click to select entities, then assign stroke colors for cut/score/engrave layers
- **Duplicate detection** — find overlapping entities and remove them or highlight them in red for review
- **Undo/redo** — Ctrl+Z / Ctrl+Shift+Z for all content changes
- **Dark mode** — automatically matches your system light/dark preference
- **Export to SVG or DXF** — download in either format, with color overrides preserved

## Supported DXF Entities

- LINE
- CIRCLE
- ELLIPSE
- ARC
- LWPOLYLINE
- POLYLINE
- SPLINE (interpolated to polyline)

## Not Supported

- TEXT, MTEXT — convert text to paths/outlines in your CAD software before exporting
- DIMENSION — remove or explode dimensions before exporting
- HATCH — pattern fills are not rendered

## Usage

1. Open [borgel.github.io/bad-dxf-svg](https://borgel.github.io/bad-dxf-svg/) or `index.html` locally
2. Drop your DXF file(s) onto the upload area
3. Adjust units if needed (auto-detect works for most files)
4. Use Move Mode to arrange parts, enable the bed overlay for positioning
5. Assign colors to entities for cut/score/engrave layers
6. Click "Download SVG" or "Download DXF"
7. Import into Glowforge or your laser cutter software

## Technical Details

- Single HTML file with embedded CSS and JavaScript — no external dependencies
- No build step required
- Works entirely in the browser, no server needed
