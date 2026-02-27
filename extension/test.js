/**
 * Extension lib module tests
 * Run with: node --experimental-vm-modules extension/test.js
 *
 * Tests the extracted ES modules match original index.html behavior.
 * Uses dynamic import() since Node requires this for ES modules from CJS.
 */

const fs = require('fs');
const path = require('path');

// We need to load ES modules from CJS context
async function main() {
    // Use dynamic import for ES modules
    const { DxfParser } = await import('./lib/dxf-parser.js');
    const { SvgGenerator } = await import('./lib/svg-generator.js');
    const { DxfWriter } = await import('./lib/dxf-writer.js');
    const { getEntityEndpoints, entitiesAreDuplicates } = await import('./lib/geometry-utils.js');

    // Test harness
    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  PASS: ${name}`);
            passed++;
        } catch (err) {
            console.log(`  FAIL: ${name}`);
            console.log(`    Error: ${err.message}`);
            failed++;
        }
    }

    function assert(condition, message) {
        if (!condition) throw new Error(message || 'Assertion failed');
    }

    function assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(`${message || 'Not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }

    function assertApprox(actual, expected, tolerance, message) {
        if (Math.abs(actual - expected) > tolerance) {
            throw new Error(`${message || 'Not approx equal'}: expected ${expected} +/- ${tolerance}, got ${actual}`);
        }
    }

    function makeGroup(id, filename, entities, offsetX = 0, offsetY = 0) {
        return { id, filename, entities, offsetX, offsetY };
    }

    // Test data
    const simpleDxf = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
0.0
20
0.0
11
100.0
21
50.0
0
CIRCLE
8
0
10
50.0
20
25.0
40
10.0
0
ARC
8
0
10
30.0
20
30.0
40
5.0
50
0.0
51
90.0
0
ENDSEC
0
EOF`;

    // ============================================
    console.log('Extension Lib Module Tests\n');

    // --- DxfParser ---
    console.log('--- DxfParser ---');

    test('Parse simple DXF with LINE, CIRCLE, ARC', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        assertEqual(parsed.entities.length, 3, 'Entity count');
        assertEqual(parsed.entities[0].type, 'LINE');
        assertEqual(parsed.entities[1].type, 'CIRCLE');
        assertEqual(parsed.entities[2].type, 'ARC');
    });

    test('LINE entity has correct coordinates', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const line = parsed.entities[0];
        assertApprox(line.start.x, 0, 0.001);
        assertApprox(line.start.y, 0, 0.001);
        assertApprox(line.end.x, 100, 0.001);
        assertApprox(line.end.y, 50, 0.001);
    });

    test('CIRCLE entity has correct center and radius', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const circle = parsed.entities[1];
        assertApprox(circle.center.x, 50, 0.001);
        assertApprox(circle.center.y, 25, 0.001);
        assertApprox(circle.radius, 10, 0.001);
    });

    test('ARC entity has correct angles', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const arc = parsed.entities[2];
        assertApprox(arc.center.x, 30, 0.001);
        assertApprox(arc.startAngle, 0, 0.001);
        assertApprox(arc.endAngle, 90, 0.001);
    });

    // --- DxfParser: testfile2.dxf ---
    const testfile2Path = path.join(__dirname, '..', 'testfile2.dxf');
    if (fs.existsSync(testfile2Path)) {
        console.log('\n--- DxfParser: testfile2.dxf ---');

        let parsed2 = null;

        test('Parse testfile2.dxf without errors', () => {
            const dxfContent = fs.readFileSync(testfile2Path, 'utf8');
            const parser = new DxfParser();
            parsed2 = parser.parse(dxfContent);
            assert(parsed2.entities.length > 0, 'Should have entities');
            console.log(`    Found ${parsed2.entities.length} entities`);
        });

        test('testfile2.dxf has expected entity types', () => {
            assert(parsed2 !== null);
            const types = {};
            for (const e of parsed2.entities) types[e.type] = (types[e.type] || 0) + 1;
            assert(types['CIRCLE'] >= 1, 'Should have at least 1 CIRCLE');
            assert(!types['LWPOLYLINE'], 'Should have no LWPOLYLINE (decomposed)');
            assert(types['SPLINE'] >= 1, 'Should have at least 1 SPLINE');
            assert(types['LINE'] >= 25, 'Should have at least 25 LINE entities');
        });
    }

    // --- DxfParser: testfile3.dxf ---
    const testfile3Path = path.join(__dirname, '..', 'testfile3.dxf');
    if (fs.existsSync(testfile3Path)) {
        console.log('\n--- DxfParser: testfile3.dxf ---');

        let parsed3 = null;

        test('Parse testfile3.dxf decomposes polylines', () => {
            const dxfContent = fs.readFileSync(testfile3Path, 'utf8');
            const parser = new DxfParser();
            parsed3 = parser.parse(dxfContent);
            assertEqual(parsed3.entities.length, 25, 'Should have 25 segments');
        });

        test('testfile3.dxf has 24 LINE + 1 ARC segments', () => {
            assert(parsed3 !== null);
            const types = {};
            for (const e of parsed3.entities) types[e.type] = (types[e.type] || 0) + 1;
            assertEqual(types['LINE'], 24);
            assertEqual(types['ARC'], 1);
        });
    }

    // --- SvgGenerator ---
    console.log('\n--- SvgGenerator ---');

    test('calculateCompositeBounds with single group', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const gen = new SvgGenerator();
        const groups = [makeGroup(0, 'test', parsed.entities)];
        const bounds = gen.calculateCompositeBounds(groups);
        assertApprox(bounds.minX, 0, 0.001, 'minX');
        assertApprox(bounds.minY, 0, 0.001, 'minY');
        assertApprox(bounds.maxX, 100, 0.001, 'maxX');
        assertApprox(bounds.maxY, 50, 0.001, 'maxY');
    });

    test('calculateCompositeBounds with offset group', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const gen = new SvgGenerator();
        const groups = [makeGroup(0, 'test', parsed.entities, 50, 100)];
        const bounds = gen.calculateCompositeBounds(groups);
        assertApprox(bounds.minX, 50, 0.001);
        assertApprox(bounds.minY, 100, 0.001);
        assertApprox(bounds.maxX, 150, 0.001);
        assertApprox(bounds.maxY, 150, 0.001);
    });

    test('generateCompositeSvg export mode has xml declaration', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const gen = new SvgGenerator();
        const groups = [makeGroup(0, 'test', parsed.entities)];
        const svg = gen.generateCompositeSvg(groups, new Map(), 1, true);
        assert(svg.startsWith('<?xml'), 'Should start with xml declaration');
        assert(svg.includes('</svg>'), 'Should have closing svg tag');
        assert(!svg.includes('data-element-id'), 'Export should not have data-element-id');
    });

    test('generateCompositeSvg preview mode has data attributes', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const gen = new SvgGenerator();
        const groups = [makeGroup(0, 'test', parsed.entities)];
        const svg = gen.generateCompositeSvg(groups, new Map(), 1, false);
        assert(!svg.startsWith('<?xml'));
        assert(svg.includes('data-element-id'));
        assert(svg.includes('data-group-id="0"'));
    });

    test('generateCompositeSvg applies color overrides', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const gen = new SvgGenerator();
        const groups = [makeGroup(0, 'test', parsed.entities)];
        const colors = new Map();
        colors.set('0-0', '#FF0000');
        colors.set('0-1', '#0000FF');
        const svg = gen.generateCompositeSvg(groups, colors, 1, true);
        assert(svg.includes('stroke="#FF0000"'));
        assert(svg.includes('stroke="#0000FF"'));
    });

    test('Export SVG has no viewBox padding', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const gen = new SvgGenerator();
        const groups = [makeGroup(0, 'test', parsed.entities)];
        const svg = gen.generateCompositeSvg(groups, new Map(), 1, true);

        const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
        const widthMatch = svg.match(/width="([\d.]+)mm"/);
        const heightMatch = svg.match(/height="([\d.]+)mm"/);

        const vbParts = viewBoxMatch[1].split(' ').map(Number);
        const vbW = vbParts[2];
        const vbH = vbParts[3];
        const physW = parseFloat(widthMatch[1]);
        const physH = parseFloat(heightMatch[1]);

        assertApprox(vbW, physW, 0.001, 'viewBox width should match physical width');
        assertApprox(vbH, physH, 0.001, 'viewBox height should match physical height');
    });

    // --- DxfWriter ---
    console.log('\n--- DxfWriter ---');

    test('DxfWriter generates valid DXF structure', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const groups = [makeGroup(0, 'test', parsed.entities)];
        const writer = new DxfWriter(groups, new Map());
        const dxf = writer.generate();
        assert(dxf.includes('SECTION'));
        assert(dxf.includes('HEADER'));
        assert(dxf.includes('ENTITIES'));
        assert(dxf.includes('ENDSEC'));
        assert(dxf.includes('EOF'));
    });

    test('DxfWriter round-trip preserves entities', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const groups = [makeGroup(0, 'test', parsed.entities)];
        const writer = new DxfWriter(groups, new Map());
        const dxfOut = writer.generate();
        const parsed2 = parser.parse(dxfOut);
        assertEqual(parsed2.entities.length, parsed.entities.length, 'Entity count');
        for (let i = 0; i < parsed.entities.length; i++) {
            assertEqual(parsed2.entities[i].type, parsed.entities[i].type, `Type at ${i}`);
        }
    });

    test('DxfWriter round-trip preserves LINE coordinates', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const groups = [makeGroup(0, 'test', parsed.entities)];
        const writer = new DxfWriter(groups, new Map());
        const parsed2 = parser.parse(writer.generate());
        const orig = parsed.entities[0];
        const rt = parsed2.entities[0];
        assertApprox(rt.start.x, orig.start.x, 0.001);
        assertApprox(rt.end.x, orig.end.x, 0.001);
    });

    test('DxfWriter applies group offset', () => {
        const parser = new DxfParser();
        const parsed = parser.parse(simpleDxf);
        const groups = [makeGroup(0, 'test', parsed.entities, 100, 200)];
        const writer = new DxfWriter(groups, new Map());
        const parsed2 = parser.parse(writer.generate());
        const orig = parsed.entities[0];
        const rt = parsed2.entities[0];
        assertApprox(rt.start.x, orig.start.x + 100, 0.001);
        assertApprox(rt.start.y, orig.start.y + 200, 0.001);
    });

    test('DxfWriter hexToAci maps toolbar colors', () => {
        const writer = new DxfWriter([], new Map());
        assertEqual(writer.hexToAci('#000000'), 7);
        assertEqual(writer.hexToAci('#FF0000'), 1);
        assertEqual(writer.hexToAci('#00FF00'), 3);
        assertEqual(writer.hexToAci('#0000FF'), 5);
    });

    // --- Duplicate Detection ---
    console.log('\n--- Duplicate Detection ---');

    test('Identical LINEs are duplicates', () => {
        const a = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 0, oy: 0 };
        const b = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 0, oy: 0 };
        assert(entitiesAreDuplicates(a, b), 'Should be duplicates');
    });

    test('Reversed LINEs are duplicates', () => {
        const a = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 0, oy: 0 };
        const b = { entity: { type: 'LINE', start: {x:10,y:10}, end: {x:0,y:0} }, ox: 0, oy: 0 };
        assert(entitiesAreDuplicates(a, b));
    });

    test('Different LINEs are not duplicates', () => {
        const a = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 0, oy: 0 };
        const b = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:20,y:20} }, ox: 0, oy: 0 };
        assert(!entitiesAreDuplicates(a, b));
    });

    test('LINEs with matching offsets are duplicates', () => {
        const a = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 5, oy: 5 };
        const b = { entity: { type: 'LINE', start: {x:5,y:5}, end: {x:15,y:15} }, ox: 0, oy: 0 };
        assert(entitiesAreDuplicates(a, b));
    });

    test('entitiesAreDuplicates accepts tolerance parameter', () => {
        const a = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 0, oy: 0 };
        const b = { entity: { type: 'LINE', start: {x:0.05,y:0.05}, end: {x:10.05,y:10.05} }, ox: 0, oy: 0 };
        assert(entitiesAreDuplicates(a, b, 0.1), 'Should match with 0.1 tolerance');
        assert(!entitiesAreDuplicates(a, b, 0.01), 'Should NOT match with 0.01 tolerance');
    });

    // --- getEntityEndpoints ---
    console.log('\n--- getEntityEndpoints ---');

    test('LINE endpoints', () => {
        const pts = getEntityEndpoints({ type: 'LINE', start: {x:1,y:2}, end: {x:3,y:4} });
        assertEqual(pts.length, 2);
        assertApprox(pts[0].x, 1, 0.001);
        assertApprox(pts[1].x, 3, 0.001);
    });

    test('ARC endpoints computed from angles', () => {
        const pts = getEntityEndpoints({ type: 'ARC', center: {x:0,y:0}, radius: 10, startAngle: 0, endAngle: 90 });
        assertEqual(pts.length, 2);
        assertApprox(pts[0].x, 10, 0.001);
        assertApprox(pts[1].x, 0, 0.01);
        assertApprox(pts[1].y, 10, 0.001);
    });

    test('CIRCLE has no endpoints', () => {
        const pts = getEntityEndpoints({ type: 'CIRCLE', center: {x:0,y:0}, radius: 5 });
        assertEqual(pts.length, 0);
    });

    test('SPLINE has endpoints from control points', () => {
        const pts = getEntityEndpoints({
            type: 'SPLINE',
            controlPoints: [{x:0,y:0},{x:5,y:5},{x:10,y:0}]
        });
        assertEqual(pts.length, 2);
        assertApprox(pts[0].x, 0, 0.001);
        assertApprox(pts[1].x, 10, 0.001);
    });

    // --- Summary ---
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    console.log('='.repeat(50));

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
