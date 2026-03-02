# DXF to SVG Converter for Laser Cutting

A webapp and Chrome extension that converts DXF files to SVG format optimized for Glowforge and other laser cutters.

**Try it now:** [borgel.github.io/bad-dxf-svg](https://borgel.github.io/bad-dxf-svg/)

## Features

- **Drag & drop upload** — drop one or more DXF files, or click to browse
- **Multi-file compositing** — combine parts from multiple DXF files into a single layout; group, ungroup, and split selections into new groups
- **Auto-detect units** — automatically determines if your file is in mm or inches based on geometry size
- **Manual unit override** — force mm or inches if auto-detection isn't right
- **Live preview** — see your converted design before downloading
- **Move mode** — drag groups to reposition parts in the layout
- **Point-to-point snapping** — groups snap to endpoints of other groups and bed corners/midpoints (toggleable)
- **Bed/tray overlay** — visual guide for your laser cutter bed area with Glowforge preset (19.5″×11″) or custom dimensions
- **Auto-place** — pack groups into the bed area using bin packing with configurable margin
- **Selection** — click to select, double-click for connected chain, drag to box-select, Shift to add; Delete key to remove selected
- **Color assignment** — select entities, then assign stroke colors for cut/score/engrave layers
- **Overlap detection** — two-step workflow: Find Overlaps highlights and selects duplicates for inspection, then Remove deletes them
- **Undo/redo** — Ctrl+Z / Ctrl+Shift+Z for all content changes
- **Dark mode** — automatically matches your system light/dark preference
- **Export to SVG or DXF** — download in either format, with color overrides preserved

## Supported DXF Entities

- LINE
- CIRCLE
- ELLIPSE
- ARC
- LWPOLYLINE (decomposed into LINE and ARC segments)
- POLYLINE (decomposed into LINE and ARC segments)
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

## Chrome Extension

A Chrome extension is included that adds a DXF converter sidebar directly on the Glowforge app page. It is not yet published to the Chrome Web Store, but you can load it manually for local use.

### Installing via Developer Mode

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `extension/` directory from this repository
5. The "DXF to Glowforge" extension icon will appear in your toolbar

### Using the Extension

1. Navigate to [app.glowforge.com](https://app.glowforge.com/)
2. Click the extension icon in the toolbar to open the DXF converter sidebar
3. Drop DXF files into the sidebar, arrange and color parts as usual
4. Use "Send to Glowforge" to upload into the workspace, or download and import manually

## Technical Details

- The webapp is a single HTML file with embedded CSS and JavaScript — no external dependencies
- The Chrome extension shares the same converter core as standalone modules
- No build step required
- Works entirely in the browser, no server needed
