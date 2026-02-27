// MaxRects bin packing - extracted from index.html

export function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectContains(outer, inner) {
    return inner.x >= outer.x && inner.y >= outer.y &&
           inner.x + inner.w <= outer.x + outer.w &&
           inner.y + inner.h <= outer.y + outer.h;
}

export function maxRectsPack(binW, binH, rects) {
    // Sort by max area descending (largest first)
    const indices = rects.map((_, i) => i);
    indices.sort((a, b) => {
        const aMax = Math.max(...rects[a].sizes.map(s => s.w * s.h));
        const bMax = Math.max(...rects[b].sizes.map(s => s.w * s.h));
        return bMax - aMax;
    });

    let freeRects = [{ x: 0, y: 0, w: binW, h: binH }];
    const placements = new Array(rects.length).fill(null);

    for (const idx of indices) {
        const rect = rects[idx];
        let bestScore = Infinity;
        let bestX = 0, bestY = 0, bestSizeIdx = -1, bestFreeIdx = -1;

        // BSSF: Best Short Side Fit
        for (let si = 0; si < rect.sizes.length; si++) {
            const s = rect.sizes[si];
            for (let fi = 0; fi < freeRects.length; fi++) {
                const f = freeRects[fi];
                if (s.w <= f.w && s.h <= f.h) {
                    const leftoverShort = Math.min(f.w - s.w, f.h - s.h);
                    if (leftoverShort < bestScore) {
                        bestScore = leftoverShort;
                        bestX = f.x;
                        bestY = f.y;
                        bestSizeIdx = si;
                        bestFreeIdx = fi;
                    }
                }
            }
        }

        if (bestSizeIdx === -1) continue; // doesn't fit

        const chosen = rect.sizes[bestSizeIdx];
        const placed = { x: bestX, y: bestY, w: chosen.w, h: chosen.h, angle: chosen.angle };
        placements[idx] = placed;

        // Split free rectangles
        const newFree = [];
        for (const f of freeRects) {
            if (!rectsOverlap(f, placed)) {
                newFree.push(f);
                continue;
            }
            // Generate up to 4 splits
            if (placed.x > f.x)
                newFree.push({ x: f.x, y: f.y, w: placed.x - f.x, h: f.h });
            if (placed.x + placed.w < f.x + f.w)
                newFree.push({ x: placed.x + placed.w, y: f.y, w: (f.x + f.w) - (placed.x + placed.w), h: f.h });
            if (placed.y > f.y)
                newFree.push({ x: f.x, y: f.y, w: f.w, h: placed.y - f.y });
            if (placed.y + placed.h < f.y + f.h)
                newFree.push({ x: f.x, y: placed.y + placed.h, w: f.w, h: (f.y + f.h) - (placed.y + placed.h) });
        }

        // Prune contained rectangles
        freeRects = [];
        for (let i = 0; i < newFree.length; i++) {
            let contained = false;
            for (let j = 0; j < newFree.length; j++) {
                if (i !== j && rectContains(newFree[j], newFree[i])) {
                    contained = true;
                    break;
                }
            }
            if (!contained) freeRects.push(newFree[i]);
        }
    }

    return placements;
}
