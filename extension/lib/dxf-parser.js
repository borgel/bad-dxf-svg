// DXF Parser - extracted from index.html
// Parses DXF file content into entity objects

export class DxfParser {
    parse(dxfString) {
        const lines = dxfString.split(/\r?\n/);
        const entities = [];
        let i = 0;

        // Find ENTITIES section
        while (i < lines.length) {
            if (lines[i].trim() === 'ENTITIES') {
                i++;
                break;
            }
            i++;
        }

        // Parse entities
        while (i < lines.length) {
            const code = parseInt(lines[i].trim(), 10);
            const value = lines[i + 1] ? lines[i + 1].trim() : '';

            if (code === 0) {
                if (value === 'ENDSEC' || value === 'EOF') break;

                const entityType = value;
                i += 2;
                const result = this.parseEntity(entityType, lines, i);
                if (result) {
                    i = result.nextIndex;
                    if (result.entity) {
                        entities.push(result.entity);
                    }
                }
            } else {
                i += 2;
            }
        }

        // Decompose LWPOLYLINE/POLYLINE into individual LINE/ARC segments
        const expanded = [];
        for (const entity of entities) {
            if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
                expanded.push(...this.decomposePolyline(entity));
            } else {
                expanded.push(entity);
            }
        }

        return { entities: expanded };
    }

    parseEntity(type, lines, startIndex) {
        const entity = { type };
        let i = startIndex;

        const groupValues = {};

        while (i < lines.length) {
            const code = parseInt(lines[i].trim(), 10);
            const value = lines[i + 1] ? lines[i + 1].trim() : '';

            if (code === 0) {
                break;
            }

            if (!groupValues[code]) {
                groupValues[code] = [];
            }
            groupValues[code].push(value);

            i += 2;
        }

        switch (type) {
            case 'LINE':
                entity.start = {
                    x: parseFloat(groupValues[10]?.[0] || 0),
                    y: parseFloat(groupValues[20]?.[0] || 0)
                };
                entity.end = {
                    x: parseFloat(groupValues[11]?.[0] || 0),
                    y: parseFloat(groupValues[21]?.[0] || 0)
                };
                break;

            case 'CIRCLE':
                entity.center = {
                    x: parseFloat(groupValues[10]?.[0] || 0),
                    y: parseFloat(groupValues[20]?.[0] || 0)
                };
                entity.radius = parseFloat(groupValues[40]?.[0] || 0);
                break;

            case 'ARC':
                entity.center = {
                    x: parseFloat(groupValues[10]?.[0] || 0),
                    y: parseFloat(groupValues[20]?.[0] || 0)
                };
                entity.radius = parseFloat(groupValues[40]?.[0] || 0);
                entity.startAngle = parseFloat(groupValues[50]?.[0] || 0);
                entity.endAngle = parseFloat(groupValues[51]?.[0] || 0);
                break;

            case 'ELLIPSE':
                entity.center = {
                    x: parseFloat(groupValues[10]?.[0] || 0),
                    y: parseFloat(groupValues[20]?.[0] || 0)
                };
                entity.majorAxis = {
                    x: parseFloat(groupValues[11]?.[0] || 1),
                    y: parseFloat(groupValues[21]?.[0] || 0)
                };
                entity.ratio = parseFloat(groupValues[40]?.[0] || 1);
                entity.startAngle = parseFloat(groupValues[41]?.[0] || 0);
                entity.endAngle = parseFloat(groupValues[42]?.[0] || Math.PI * 2);
                break;

            case 'LWPOLYLINE':
            case 'POLYLINE':
                entity.vertices = [];
                entity.closed = (parseInt(groupValues[70]?.[0] || 0) & 1) === 1;

                if (type === 'LWPOLYLINE') {
                    const xVals = groupValues[10] || [];
                    const yVals = groupValues[20] || [];
                    const bulges = groupValues[42] || [];

                    for (let j = 0; j < xVals.length; j++) {
                        entity.vertices.push({
                            x: parseFloat(xVals[j]),
                            y: parseFloat(yVals[j]),
                            bulge: parseFloat(bulges[j] || 0)
                        });
                    }
                }
                break;

            case 'SPLINE':
                entity.controlPoints = [];
                entity.knots = [];
                entity.degree = parseInt(groupValues[71]?.[0] || 3);

                const splineX = groupValues[10] || [];
                const splineY = groupValues[20] || [];
                const knotValues = groupValues[40] || [];

                for (let j = 0; j < splineX.length; j++) {
                    entity.controlPoints.push({
                        x: parseFloat(splineX[j]),
                        y: parseFloat(splineY[j])
                    });
                }

                for (let j = 0; j < knotValues.length; j++) {
                    entity.knots.push(parseFloat(knotValues[j]));
                }
                break;

            default:
                return { entity: null, nextIndex: i };
        }

        return { entity, nextIndex: i };
    }

    decomposePolyline(entity) {
        const verts = entity.vertices;
        if (verts.length < 2) return [];

        const segments = [];
        const n = verts.length;
        const count = entity.closed ? n : n - 1;

        for (let i = 0; i < count; i++) {
            const v1 = verts[i];
            const v2 = verts[(i + 1) % n];

            // Skip degenerate zero-length segments
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            if (dx === 0 && dy === 0) continue;

            if (v1.bulge && v1.bulge !== 0) {
                segments.push(this.bulgeToArcEntity(v1, v2, v1.bulge));
            } else {
                segments.push({
                    type: 'LINE',
                    start: { x: v1.x, y: v1.y },
                    end: { x: v2.x, y: v2.y }
                });
            }
        }

        return segments;
    }

    bulgeToArcEntity(v1, v2, bulge) {
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const chord = Math.sqrt(dx * dx + dy * dy);
        const sagitta = Math.abs(bulge) * chord / 2;
        const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);

        // Center: offset perpendicular from chord midpoint
        const midX = (v1.x + v2.x) / 2;
        const midY = (v1.y + v2.y) / 2;
        const dist = radius - sagitta;
        // Unit perpendicular: for bulge > 0 (CCW), offset left of chord direction
        const perpX = -dy / chord;
        const perpY = dx / chord;
        const sign = bulge > 0 ? 1 : -1;
        const cx = midX + sign * dist * perpX;
        const cy = midY + sign * dist * perpY;

        // Angles from center to endpoints (in degrees, DXF convention)
        let startAngle = Math.atan2(v1.y - cy, v1.x - cx) * 180 / Math.PI;
        let endAngle = Math.atan2(v2.y - cy, v2.x - cx) * 180 / Math.PI;

        // For negative bulge (CW arc), swap start/end to maintain CCW convention
        if (bulge < 0) {
            const tmp = startAngle;
            startAngle = endAngle;
            endAngle = tmp;
        }

        // Normalize angles to [0, 360)
        if (startAngle < 0) startAngle += 360;
        if (endAngle < 0) endAngle += 360;

        return {
            type: 'ARC',
            center: { x: cx, y: cy },
            radius,
            startAngle,
            endAngle
        };
    }
}
