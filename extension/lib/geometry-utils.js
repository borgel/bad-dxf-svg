// Geometry utilities - extracted from index.html

export function getEntityEndpoints(entity) {
    switch (entity.type) {
        case 'LINE':
            return [
                { x: entity.start.x, y: entity.start.y },
                { x: entity.end.x, y: entity.end.y }
            ];
        case 'ARC': {
            const startRad = entity.startAngle * Math.PI / 180;
            const endRad = entity.endAngle * Math.PI / 180;
            return [
                { x: entity.center.x + entity.radius * Math.cos(startRad), y: entity.center.y + entity.radius * Math.sin(startRad) },
                { x: entity.center.x + entity.radius * Math.cos(endRad), y: entity.center.y + entity.radius * Math.sin(endRad) }
            ];
        }
        case 'SPLINE':
            if (entity.controlPoints.length < 2) return [];
            return [
                { x: entity.controlPoints[0].x, y: entity.controlPoints[0].y },
                { x: entity.controlPoints[entity.controlPoints.length - 1].x, y: entity.controlPoints[entity.controlPoints.length - 1].y }
            ];
        default:
            return [];
    }
}

export function pointsAreClose(p1, p2, tolerance) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) <= tolerance;
}

export function applyOffsetToEntities(entities, dx, dy) {
    for (const e of entities) {
        switch (e.type) {
            case 'LINE':
                e.start.x += dx; e.start.y += dy;
                e.end.x += dx; e.end.y += dy;
                break;
            case 'CIRCLE':
            case 'ARC':
                e.center.x += dx; e.center.y += dy;
                break;
            case 'ELLIPSE':
                e.center.x += dx; e.center.y += dy;
                break;
            case 'SPLINE':
                if (e.controlPoints) {
                    for (const p of e.controlPoints) { p.x += dx; p.y += dy; }
                }
                break;
        }
    }
}

// Refactored: tolerance is a parameter instead of module-level variable
export function entitiesAreDuplicates(a, b, tolerance = 0.1) {
    const e1 = a.entity, e2 = b.entity;
    const ox1 = a.ox, oy1 = a.oy, ox2 = b.ox, oy2 = b.oy;

    if (e1.type !== e2.type) return false;
    const TOL = tolerance;

    function ptEq(x1, y1, x2, y2) {
        return Math.abs(x1 - x2) < TOL && Math.abs(y1 - y2) < TOL;
    }

    function valEq(a, b) {
        return Math.abs(a - b) < TOL;
    }

    switch (e1.type) {
        case 'LINE':
            return (ptEq(e1.start.x + ox1, e1.start.y + oy1, e2.start.x + ox2, e2.start.y + oy2) &&
                    ptEq(e1.end.x + ox1, e1.end.y + oy1, e2.end.x + ox2, e2.end.y + oy2)) ||
                   (ptEq(e1.start.x + ox1, e1.start.y + oy1, e2.end.x + ox2, e2.end.y + oy2) &&
                    ptEq(e1.end.x + ox1, e1.end.y + oy1, e2.start.x + ox2, e2.start.y + oy2));

        case 'CIRCLE':
            return ptEq(e1.center.x + ox1, e1.center.y + oy1, e2.center.x + ox2, e2.center.y + oy2) &&
                   valEq(e1.radius, e2.radius);

        case 'ARC':
            return ptEq(e1.center.x + ox1, e1.center.y + oy1, e2.center.x + ox2, e2.center.y + oy2) &&
                   valEq(e1.radius, e2.radius) &&
                   valEq(e1.startAngle, e2.startAngle) &&
                   valEq(e1.endAngle, e2.endAngle);

        case 'ELLIPSE':
            return ptEq(e1.center.x + ox1, e1.center.y + oy1, e2.center.x + ox2, e2.center.y + oy2) &&
                   ptEq(e1.majorAxis.x, e1.majorAxis.y, e2.majorAxis.x, e2.majorAxis.y) &&
                   valEq(e1.ratio, e2.ratio) &&
                   valEq(e1.startAngle, e2.startAngle) &&
                   valEq(e1.endAngle, e2.endAngle);

        case 'SPLINE': {
            if (e1.controlPoints.length !== e2.controlPoints.length) return false;
            const m = e1.controlPoints.length;
            let fwd = true;
            for (let i = 0; i < m; i++) {
                if (!ptEq(e1.controlPoints[i].x + ox1, e1.controlPoints[i].y + oy1,
                           e2.controlPoints[i].x + ox2, e2.controlPoints[i].y + oy2)) {
                    fwd = false;
                    break;
                }
            }
            return fwd;
        }

        default:
            return false;
    }
}
