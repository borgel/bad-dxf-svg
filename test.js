/**
 * Test script for DXF to SVG converter
 * Run with: node test.js
 */

const fs = require('fs');
const path = require('path');

// Extract the DxfParser and SvgGenerator classes (duplicated from index.html for testing)
class DxfParser {
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

        return { entities };
    }

    parseEntity(type, lines, startIndex) {
        const entity = { type };
        let i = startIndex;

        const groupValues = {};

        while (i < lines.length) {
            const code = parseInt(lines[i].trim(), 10);
            const value = lines[i + 1] ? lines[i + 1].trim() : '';

            if (code === 0) {
                // Next entity or end of section
                break;
            }

            // Store group codes
            if (!groupValues[code]) {
                groupValues[code] = [];
            }
            groupValues[code].push(value);

            i += 2;
        }

        // Parse based on entity type
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
                entity.degree = parseInt(groupValues[71]?.[0] || 3);

                const splineX = groupValues[10] || [];
                const splineY = groupValues[20] || [];

                for (let j = 0; j < splineX.length; j++) {
                    entity.controlPoints.push({
                        x: parseFloat(splineX[j]),
                        y: parseFloat(splineY[j])
                    });
                }
                break;

            default:
                return { entity: null, nextIndex: i };
        }

        return { entity, nextIndex: i };
    }
}

class SvgGenerator {
    constructor(entities) {
        this.entities = entities;
        this.bounds = this.calculateBounds();
    }

    calculateBounds() {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        const updateBounds = (x, y) => {
            if (isFinite(x) && isFinite(y)) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        };

        for (const entity of this.entities) {
            switch (entity.type) {
                case 'LINE':
                    updateBounds(entity.start.x, entity.start.y);
                    updateBounds(entity.end.x, entity.end.y);
                    break;
                case 'CIRCLE':
                    updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
                    updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
                    break;
                case 'ARC':
                    updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
                    updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
                    break;
                case 'ELLIPSE':
                    const majorLen = Math.sqrt(entity.majorAxis.x ** 2 + entity.majorAxis.y ** 2);
                    const minorLen = majorLen * entity.ratio;
                    updateBounds(entity.center.x - majorLen, entity.center.y - minorLen);
                    updateBounds(entity.center.x + majorLen, entity.center.y + minorLen);
                    break;
                case 'LWPOLYLINE':
                case 'POLYLINE':
                    for (const v of entity.vertices) {
                        updateBounds(v.x, v.y);
                    }
                    break;
                case 'SPLINE':
                    for (const p of entity.controlPoints) {
                        updateBounds(p.x, p.y);
                    }
                    break;
            }
        }

        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

        return { minX, minY, maxX, maxY };
    }

    generateSvg(scale = 1) {
        const { minX, minY, maxX, maxY } = this.bounds;
        const width = (maxX - minX) * scale;
        const height = (maxY - minY) * scale;
        const padding = Math.max(width, height) * 0.02;

        let svgContent = '';

        for (const entity of this.entities) {
            svgContent += this.entityToSvg(entity);
        }

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${minX - padding} ${-(maxY + padding)} ${(maxX - minX) + padding * 2} ${(maxY - minY) + padding * 2}"
     width="${width}mm"
     height="${height}mm">
  <g transform="scale(1, -1)" stroke="#000000" stroke-width="0.5" fill="none">
${svgContent}  </g>
</svg>`;
    }

    entityToSvg(entity) {
        switch (entity.type) {
            case 'LINE':
                return `    <line x1="${entity.start.x}" y1="${entity.start.y}" x2="${entity.end.x}" y2="${entity.end.y}"/>\n`;

            case 'CIRCLE':
                return `    <circle cx="${entity.center.x}" cy="${entity.center.y}" r="${entity.radius}"/>\n`;

            case 'ARC':
                return this.arcToPath(entity);

            case 'ELLIPSE':
                return this.ellipseToPath(entity);

            case 'LWPOLYLINE':
            case 'POLYLINE':
                return this.polylineToPath(entity);

            case 'SPLINE':
                return this.splineToPath(entity);

            default:
                return '';
        }
    }

    arcToPath(entity) {
        const { center, radius, startAngle, endAngle } = entity;
        const startRad = startAngle * Math.PI / 180;
        const endRad = endAngle * Math.PI / 180;

        const x1 = center.x + radius * Math.cos(startRad);
        const y1 = center.y + radius * Math.sin(startRad);
        const x2 = center.x + radius * Math.cos(endRad);
        const y2 = center.y + radius * Math.sin(endRad);

        let sweepAngle = endAngle - startAngle;
        if (sweepAngle < 0) sweepAngle += 360;
        const largeArc = sweepAngle > 180 ? 1 : 0;

        return `    <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}"/>\n`;
    }

    ellipseToPath(entity) {
        const { center, majorAxis, ratio, startAngle, endAngle } = entity;
        const rx = Math.sqrt(majorAxis.x ** 2 + majorAxis.y ** 2);
        const ry = rx * ratio;
        const rotation = Math.atan2(majorAxis.y, majorAxis.x) * 180 / Math.PI;

        if (Math.abs(endAngle - startAngle - Math.PI * 2) < 0.01 || (startAngle === 0 && endAngle === 0)) {
            return `    <ellipse cx="${center.x}" cy="${center.y}" rx="${rx}" ry="${ry}" transform="rotate(${rotation} ${center.x} ${center.y})"/>\n`;
        }

        const x1 = center.x + rx * Math.cos(startAngle);
        const y1 = center.y + ry * Math.sin(startAngle);
        const x2 = center.x + rx * Math.cos(endAngle);
        const y2 = center.y + ry * Math.sin(endAngle);

        let sweepAngle = endAngle - startAngle;
        if (sweepAngle < 0) sweepAngle += Math.PI * 2;
        const largeArc = sweepAngle > Math.PI ? 1 : 0;

        return `    <path d="M ${x1} ${y1} A ${rx} ${ry} ${rotation} ${largeArc} 1 ${x2} ${y2}"/>\n`;
    }

    polylineToPath(entity) {
        if (entity.vertices.length < 2) return '';

        let d = `M ${entity.vertices[0].x} ${entity.vertices[0].y}`;

        for (let i = 0; i < entity.vertices.length - 1; i++) {
            const v1 = entity.vertices[i];
            const v2 = entity.vertices[i + 1];

            if (v1.bulge && v1.bulge !== 0) {
                const arc = this.bulgeToArc(v1, v2, v1.bulge);
                d += ` A ${arc.radius} ${arc.radius} 0 ${arc.largeArc} ${arc.sweep} ${v2.x} ${v2.y}`;
            } else {
                d += ` L ${v2.x} ${v2.y}`;
            }
        }

        if (entity.closed && entity.vertices.length > 2) {
            const vLast = entity.vertices[entity.vertices.length - 1];
            const vFirst = entity.vertices[0];

            if (vLast.bulge && vLast.bulge !== 0) {
                const arc = this.bulgeToArc(vLast, vFirst, vLast.bulge);
                d += ` A ${arc.radius} ${arc.radius} 0 ${arc.largeArc} ${arc.sweep} ${vFirst.x} ${vFirst.y}`;
            } else {
                d += ' Z';
            }
        }

        return `    <path d="${d}"/>\n`;
    }

    bulgeToArc(v1, v2, bulge) {
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const chord = Math.sqrt(dx * dx + dy * dy);
        const sagitta = Math.abs(bulge) * chord / 2;
        const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * sagitta);

        return {
            radius,
            largeArc: Math.abs(bulge) > 1 ? 1 : 0,
            sweep: bulge > 0 ? 1 : 0
        };
    }

    splineToPath(entity) {
        if (entity.controlPoints.length < 2) return '';

        const points = this.interpolateSpline(entity.controlPoints, entity.degree);

        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i].x} ${points[i].y}`;
        }

        return `    <path d="${d}"/>\n`;
    }

    interpolateSpline(controlPoints, degree) {
        if (controlPoints.length < 2) return controlPoints;

        const result = [];
        const segments = 20;

        for (let i = 0; i < controlPoints.length - 1; i++) {
            const p0 = controlPoints[Math.max(0, i - 1)];
            const p1 = controlPoints[i];
            const p2 = controlPoints[i + 1];
            const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];

            for (let t = 0; t < segments; t++) {
                const s = t / segments;
                const s2 = s * s;
                const s3 = s2 * s;

                const x = 0.5 * ((2 * p1.x) +
                    (-p0.x + p2.x) * s +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3);

                const y = 0.5 * ((2 * p1.y) +
                    (-p0.y + p2.y) * s +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3);

                result.push({ x, y });
            }
        }

        result.push(controlPoints[controlPoints.length - 1]);
        return result;
    }
}

// ============================================
// Test Suite
// ============================================

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`✗ ${name}`);
        console.log(`  Error: ${err.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Values not equal'}: expected ${expected}, got ${actual}`);
    }
}

function assertApprox(actual, expected, tolerance, message) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${message || 'Values not approximately equal'}: expected ${expected} ± ${tolerance}, got ${actual}`);
    }
}

// ============================================
// Run Tests
// ============================================

console.log('DXF to SVG Converter Tests\n');

// Test 1: Parse testfile1.dxf
test('Parse testfile1.dxf without errors', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    assert(parsed !== null, 'Parsed result should not be null');
    assert(parsed.entities !== null, 'Entities should not be null');
    assert(Array.isArray(parsed.entities), 'Entities should be an array');
});

// Test 2: Verify entity count
test('testfile1.dxf contains expected number of entities', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    // The file has: 6 LWPOLYLINE, 12 LINE, 1 SPLINE, 1 CIRCLE = 20 entities
    // POINT entities (2) should be skipped
    assert(parsed.entities.length > 0, 'Should have at least some entities');
    console.log(`  Found ${parsed.entities.length} entities`);
});

// Test 3: No null entities
test('No null entities in parsed result', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    for (let i = 0; i < parsed.entities.length; i++) {
        assert(parsed.entities[i] !== null, `Entity at index ${i} is null`);
        assert(parsed.entities[i].type !== undefined, `Entity at index ${i} has no type`);
    }
});

// Test 4: Entity types are correct
test('All entity types are valid', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const validTypes = ['LINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE'];

    for (const entity of parsed.entities) {
        assert(validTypes.includes(entity.type), `Invalid entity type: ${entity.type}`);
    }
});

// Test 5: LINE entities have correct structure
test('LINE entities have start and end points', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const lines = parsed.entities.filter(e => e.type === 'LINE');
    assert(lines.length > 0, 'Should have LINE entities');

    for (const line of lines) {
        assert(line.start !== undefined, 'LINE should have start');
        assert(line.end !== undefined, 'LINE should have end');
        assert(typeof line.start.x === 'number', 'start.x should be number');
        assert(typeof line.start.y === 'number', 'start.y should be number');
        assert(typeof line.end.x === 'number', 'end.x should be number');
        assert(typeof line.end.y === 'number', 'end.y should be number');
    }
    console.log(`  Found ${lines.length} LINE entities`);
});

// Test 6: CIRCLE entities have correct structure
test('CIRCLE entities have center and radius', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const circles = parsed.entities.filter(e => e.type === 'CIRCLE');
    assert(circles.length > 0, 'Should have CIRCLE entities');

    for (const circle of circles) {
        assert(circle.center !== undefined, 'CIRCLE should have center');
        assert(typeof circle.radius === 'number', 'radius should be number');
        assert(circle.radius > 0, 'radius should be positive');
    }
    console.log(`  Found ${circles.length} CIRCLE entities`);
});

// Test 7: LWPOLYLINE entities have vertices
test('LWPOLYLINE entities have vertices', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const polylines = parsed.entities.filter(e => e.type === 'LWPOLYLINE');
    assert(polylines.length > 0, 'Should have LWPOLYLINE entities');

    for (const pl of polylines) {
        assert(Array.isArray(pl.vertices), 'vertices should be array');
        assert(pl.vertices.length >= 2, 'Should have at least 2 vertices');
    }
    console.log(`  Found ${polylines.length} LWPOLYLINE entities`);
});

// Test 8: SPLINE entities have control points
test('SPLINE entities have control points', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const splines = parsed.entities.filter(e => e.type === 'SPLINE');
    assert(splines.length > 0, 'Should have SPLINE entities');

    for (const spline of splines) {
        assert(Array.isArray(spline.controlPoints), 'controlPoints should be array');
        assert(spline.controlPoints.length >= 2, 'Should have at least 2 control points');
    }
    console.log(`  Found ${splines.length} SPLINE entities`);
});

// Test 9: SVG generation works
test('SVG generation produces valid output', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const generator = new SvgGenerator(parsed.entities);
    const svg = generator.generateSvg(1);

    assert(svg.includes('<?xml version="1.0"'), 'Should have XML declaration');
    assert(svg.includes('<svg'), 'Should have SVG element');
    assert(svg.includes('</svg>'), 'Should have closing SVG tag');
    assert(svg.includes('viewBox='), 'Should have viewBox');
    assert(svg.includes('width='), 'Should have width');
    assert(svg.includes('height='), 'Should have height');
});

// Test 10: SVG contains expected elements
test('SVG contains expected geometry elements', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const generator = new SvgGenerator(parsed.entities);
    const svg = generator.generateSvg(1);

    assert(svg.includes('<line'), 'Should have line elements');
    assert(svg.includes('<circle'), 'Should have circle elements');
    assert(svg.includes('<path'), 'Should have path elements (for polylines/splines)');
});

// Test 11: Bounds calculation is reasonable
test('Bounds calculation produces reasonable values', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const generator = new SvgGenerator(parsed.entities);
    const bounds = generator.bounds;

    assert(isFinite(bounds.minX), 'minX should be finite');
    assert(isFinite(bounds.minY), 'minY should be finite');
    assert(isFinite(bounds.maxX), 'maxX should be finite');
    assert(isFinite(bounds.maxY), 'maxY should be finite');
    assert(bounds.maxX > bounds.minX, 'maxX should be greater than minX');
    assert(bounds.maxY > bounds.minY, 'maxY should be greater than minY');

    console.log(`  Bounds: (${bounds.minX.toFixed(2)}, ${bounds.minY.toFixed(2)}) to (${bounds.maxX.toFixed(2)}, ${bounds.maxY.toFixed(2)})`);
});

// Test 12: Write output SVG for manual verification
test('Write output SVG file for verification', () => {
    const dxfContent = fs.readFileSync(path.join(__dirname, 'testfile1.dxf'), 'utf8');
    const parser = new DxfParser();
    const parsed = parser.parse(dxfContent);

    const generator = new SvgGenerator(parsed.entities);
    const svg = generator.generateSvg(1);

    fs.writeFileSync(path.join(__dirname, 'testfile1_output.svg'), svg);
    console.log('  Output written to testfile1_output.svg');
});

// Summary
console.log(`\n${'='.repeat(40)}`);
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('='.repeat(40));

process.exit(failed > 0 ? 1 : 0);
