// Transform utilities: mirror operations
// Operates on entity arrays, creating mirrored copies

/**
 * Mirror entities across an axis through a center point.
 * Returns a deep copy of the entities with mirrored coordinates.
 *
 * @param {Array} entities - Array of DXF entities
 * @param {'horizontal'|'vertical'} axis - Mirror axis
 *   'horizontal' = flip across vertical axis (left/right swap, X changes)
 *   'vertical' = flip across horizontal axis (top/bottom swap, Y changes)
 * @param {{x: number, y: number}} center - Center point for the mirror axis
 * @returns {Array} New array of mirrored entity copies
 */
export function mirrorEntities(entities, axis, center) {
    const mirrored = JSON.parse(JSON.stringify(entities));

    for (const e of mirrored) {
        switch (e.type) {
            case 'LINE':
                e.start = mirrorPoint(e.start, axis, center);
                e.end = mirrorPoint(e.end, axis, center);
                break;

            case 'CIRCLE':
                e.center = mirrorPoint(e.center, axis, center);
                break;

            case 'ARC':
                e.center = mirrorPoint(e.center, axis, center);
                // Mirror angles: reflection reverses arc direction
                if (axis === 'horizontal') {
                    // Reflect across vertical axis: angle -> 180 - angle
                    const newStart = 180 - e.endAngle;
                    const newEnd = 180 - e.startAngle;
                    e.startAngle = normalizeAngle(newStart);
                    e.endAngle = normalizeAngle(newEnd);
                } else {
                    // Reflect across horizontal axis: angle -> -angle (360 - angle)
                    const newStart = -e.endAngle;
                    const newEnd = -e.startAngle;
                    e.startAngle = normalizeAngle(newStart);
                    e.endAngle = normalizeAngle(newEnd);
                }
                break;

            case 'ELLIPSE':
                e.center = mirrorPoint(e.center, axis, center);
                if (axis === 'horizontal') {
                    e.majorAxis.x = -e.majorAxis.x;
                } else {
                    e.majorAxis.y = -e.majorAxis.y;
                }
                // Mirror ellipse parameter angles
                if (e.startAngle !== 0 || e.endAngle !== 0) {
                    const newStart = -e.endAngle;
                    const newEnd = -e.startAngle;
                    e.startAngle = newStart;
                    e.endAngle = newEnd;
                }
                break;

            case 'SPLINE':
                if (e.controlPoints) {
                    e.controlPoints = e.controlPoints.map(p => mirrorPoint(p, axis, center));
                }
                break;

            case 'LWPOLYLINE':
            case 'POLYLINE':
                if (e.vertices) {
                    e.vertices = e.vertices.map(v => {
                        const mp = mirrorPoint(v, axis, center);
                        // Bulge sign flips on mirror (arc direction reverses)
                        return { ...mp, bulge: v.bulge ? -v.bulge : 0 };
                    });
                }
                break;
        }
    }

    return mirrored;
}

function mirrorPoint(point, axis, center) {
    if (axis === 'horizontal') {
        return { x: 2 * center.x - point.x, y: point.y };
    } else {
        return { x: point.x, y: 2 * center.y - point.y };
    }
}

function normalizeAngle(angle) {
    while (angle < 0) angle += 360;
    while (angle >= 360) angle -= 360;
    return angle;
}
