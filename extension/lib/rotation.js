// Entity rotation utilities - extracted from index.html
import { SvgGenerator } from './svg-generator.js';

export function rotateEntities(entities, angleDeg) {
    if (angleDeg === 0) return;
    const angleRad = angleDeg * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    // Calculate local bbox center
    const gen = new SvgGenerator();
    const bounds = gen.calculateBoundsForEntities(entities);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    function rotPt(x, y) {
        return {
            x: cx + (x - cx) * cos + (y - cy) * sin,
            y: cy - (x - cx) * sin + (y - cy) * cos
        };
    }

    for (const e of entities) {
        switch (e.type) {
            case 'LINE': {
                const s = rotPt(e.start.x, e.start.y);
                const en = rotPt(e.end.x, e.end.y);
                e.start.x = s.x; e.start.y = s.y;
                e.end.x = en.x; e.end.y = en.y;
                break;
            }
            case 'CIRCLE': {
                const c = rotPt(e.center.x, e.center.y);
                e.center.x = c.x; e.center.y = c.y;
                break;
            }
            case 'ARC': {
                const c = rotPt(e.center.x, e.center.y);
                e.center.x = c.x; e.center.y = c.y;
                e.startAngle -= angleDeg;
                e.endAngle -= angleDeg;
                break;
            }
            case 'ELLIPSE': {
                const c = rotPt(e.center.x, e.center.y);
                e.center.x = c.x; e.center.y = c.y;
                const oldMaX = e.majorAxis.x, oldMaY = e.majorAxis.y;
                e.majorAxis.x = oldMaX * cos + oldMaY * sin;
                e.majorAxis.y = -oldMaX * sin + oldMaY * cos;
                e.startAngle -= angleRad;
                e.endAngle -= angleRad;
                break;
            }
            case 'LWPOLYLINE':
            case 'POLYLINE':
                for (const v of e.vertices) {
                    const r = rotPt(v.x, v.y);
                    v.x = r.x; v.y = r.y;
                }
                break;
            case 'SPLINE':
                for (const p of e.controlPoints) {
                    const r = rotPt(p.x, p.y);
                    p.x = r.x; p.y = r.y;
                }
                break;
        }
    }
}

export function computeRotatedBounds(entities, angleDeg, offsetX, offsetY) {
    if (angleDeg === 0) {
        const gen = new SvgGenerator();
        return gen.calculateBoundsForEntities(entities, offsetX, offsetY);
    }
    const angleRad = angleDeg * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const gen = new SvgGenerator();
    const bounds = gen.calculateBoundsForEntities(entities);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;

    function rotPt(x, y) {
        return {
            x: cx + (x - cx) * cos + (y - cy) * sin,
            y: cy - (x - cx) * sin + (y - cy) * cos
        };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function update(x, y) {
        x += offsetX; y += offsetY;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    for (const e of entities) {
        switch (e.type) {
            case 'LINE': {
                const s = rotPt(e.start.x, e.start.y);
                const en = rotPt(e.end.x, e.end.y);
                update(s.x, s.y); update(en.x, en.y);
                break;
            }
            case 'CIRCLE': {
                const c = rotPt(e.center.x, e.center.y);
                update(c.x - e.radius, c.y - e.radius);
                update(c.x + e.radius, c.y + e.radius);
                break;
            }
            case 'ARC': {
                const c = rotPt(e.center.x, e.center.y);
                update(c.x - e.radius, c.y - e.radius);
                update(c.x + e.radius, c.y + e.radius);
                break;
            }
            case 'ELLIPSE': {
                const c = rotPt(e.center.x, e.center.y);
                const majorLen = Math.sqrt(e.majorAxis.x ** 2 + e.majorAxis.y ** 2);
                const minorLen = majorLen * e.ratio;
                const maxDim = Math.max(majorLen, minorLen);
                update(c.x - maxDim, c.y - maxDim);
                update(c.x + maxDim, c.y + maxDim);
                break;
            }
            case 'LWPOLYLINE':
            case 'POLYLINE':
                for (const v of e.vertices) {
                    const r = rotPt(v.x, v.y);
                    update(r.x, r.y);
                }
                break;
            case 'SPLINE':
                for (const p of e.controlPoints) {
                    const r = rotPt(p.x, p.y);
                    update(r.x, r.y);
                }
                break;
        }
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
}
