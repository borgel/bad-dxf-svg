/**
 * Test script for DXF to SVG converter
 * Run with: node test.js
 *
 * Classes are extracted from index.html so tests always match the live code.
 */

const fs = require('fs');
const path = require('path');

// ============================================
// Extract classes from index.html (no duplication)
// ============================================

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
    console.error('ERROR: Could not find <script> tag in index.html');
    process.exit(1);
}

const script = scriptMatch[1];
const mainAppMarker = 'let importedGroups';
const classEndIdx = script.indexOf(mainAppMarker);
if (classEndIdx === -1) {
    console.error('ERROR: Could not find class boundary in script');
    process.exit(1);
}

// Build a module that exports the classes and utility functions
const classCode = script.substring(0, classEndIdx);

// Extract utility functions we need
const utilFuncs = [];
const getEndpointsMatch = script.match(/function getEntityEndpoints\(entity\)\s*\{[\s\S]*?\n        \}/);
if (getEndpointsMatch) utilFuncs.push(getEndpointsMatch[0]);

const dupMatch = script.match(/function entitiesAreDuplicates\(a, b\)\s*\{[\s\S]*?\n        \}/);
if (dupMatch) utilFuncs.push(dupMatch[0]);

const moduleCode = classCode + '\n'
    + 'let duplicateTolerance = 0.1;\n'
    + utilFuncs.join('\n') + '\n'
    + 'module.exports = { DxfParser, SvgGenerator, DxfWriter, getEntityEndpoints, entitiesAreDuplicates };\n';

const tmpFile = path.join(__dirname, '.test_classes_tmp.js');
fs.writeFileSync(tmpFile, moduleCode);
const { DxfParser, SvgGenerator, DxfWriter, getEntityEndpoints, entitiesAreDuplicates } = require(tmpFile);
fs.unlinkSync(tmpFile);

// ============================================
// Test Harness
// ============================================

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

// Helper: make a group from entities
function makeGroup(id, filename, entities, offsetX = 0, offsetY = 0) {
    return { id, filename, entities, offsetX, offsetY };
}

// ============================================
// Test Data
// ============================================

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
// Run Tests
// ============================================

console.log('DXF to SVG Converter Tests\n');

// --- DxfParser: Inline DXF ---

console.log('--- DxfParser: inline data ---');

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

// --- DxfParser: testfile1.dxf ---

const testfile1Path = path.join(__dirname, 'testfile1.dxf');
const hasTestfile1 = fs.existsSync(testfile1Path);

if (hasTestfile1) {
    console.log('\n--- DxfParser: testfile1.dxf ---');

    test('Parse testfile1.dxf without errors', () => {
        const dxfContent = fs.readFileSync(testfile1Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        assert(parsed.entities.length > 0, 'Should have entities');
        console.log(`    Found ${parsed.entities.length} entities`);
    });

    test('testfile1.dxf entity types are all valid', () => {
        const dxfContent = fs.readFileSync(testfile1Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        const validTypes = ['LINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE'];
        for (const e of parsed.entities) {
            assert(validTypes.includes(e.type), `Invalid type: ${e.type}`);
        }
    });

    test('testfile1.dxf LINE entities have start/end', () => {
        const dxfContent = fs.readFileSync(testfile1Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        const lines = parsed.entities.filter(e => e.type === 'LINE');
        assert(lines.length > 0, 'Should have LINE entities');
        for (const line of lines) {
            assert(typeof line.start.x === 'number' && isFinite(line.start.x));
            assert(typeof line.end.x === 'number' && isFinite(line.end.x));
        }
    });
} else {
    console.log('\n--- Skipping testfile1.dxf tests (file not found) ---');
}

// --- DxfParser: testfile2.dxf ---

const testfile2Path = path.join(__dirname, 'testfile2.dxf');
const hasTestfile2 = fs.existsSync(testfile2Path);

if (hasTestfile2) {
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
        console.log(`    Entity breakdown: ${JSON.stringify(types)}`);

        assert(types['CIRCLE'] >= 1, 'Should have at least 1 CIRCLE');
        assert(types['LWPOLYLINE'] >= 1, 'Should have at least 1 LWPOLYLINE');
        assert(types['SPLINE'] >= 1, 'Should have at least 1 SPLINE');
        assert(types['LINE'] >= 1, 'Should have at least 1 LINE');
    });

    test('testfile2.dxf CIRCLE is parsed correctly', () => {
        const circles = parsed2.entities.filter(e => e.type === 'CIRCLE');
        assert(circles.length === 1, 'Should have exactly 1 circle');
        assertApprox(circles[0].center.x, 6.176, 0.01, 'Circle center X');
        assertApprox(circles[0].center.y, 457.444, 0.01, 'Circle center Y');
        assertApprox(circles[0].radius, 1.5, 0.01, 'Circle radius');
    });

    test('testfile2.dxf LWPOLYLINE closed flag parsed correctly', () => {
        const polys = parsed2.entities.filter(e => e.type === 'LWPOLYLINE');
        assert(polys.length >= 3, 'Should have at least 3 polylines');
        for (const p of polys) {
            assertEqual(p.closed, true, `Polyline should be closed (has ${p.vertices.length} vertices)`);
            assertEqual(p.vertices.length, 4, 'Should have 4 vertices');
        }
    });

    test('testfile2.dxf SPLINE has control points and knots', () => {
        const splines = parsed2.entities.filter(e => e.type === 'SPLINE');
        assert(splines.length >= 2, 'Should have at least 2 splines');
        for (const s of splines) {
            assertEqual(s.degree, 5, 'Degree should be 5');
            assertEqual(s.controlPoints.length, 10, 'Should have 10 control points');
            assert(s.knots.length > 0, 'Should have knot values');
            assertEqual(s.knots.length, 16, 'Should have 16 knots (n+d+1 = 10+5+1)');
        }
    });

    test('testfile2.dxf LINE entities have finite coordinates', () => {
        const lines = parsed2.entities.filter(e => e.type === 'LINE');
        assert(lines.length >= 10, 'Should have many LINE entities');
        for (const l of lines) {
            assert(isFinite(l.start.x) && isFinite(l.start.y), 'Start must be finite');
            assert(isFinite(l.end.x) && isFinite(l.end.y), 'End must be finite');
        }
        console.log(`    Found ${lines.length} LINE entities`);
    });

    test('testfile2.dxf no null entities', () => {
        for (let i = 0; i < parsed2.entities.length; i++) {
            assert(parsed2.entities[i] !== null, `Entity at index ${i} is null`);
            assert(parsed2.entities[i].type !== undefined, `Entity at index ${i} has no type`);
        }
    });
} else {
    console.log('\n--- Skipping testfile2.dxf tests (file not found) ---');
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

    assertApprox(bounds.minX, 50, 0.001, 'minX shifted');
    assertApprox(bounds.minY, 100, 0.001, 'minY shifted');
    assertApprox(bounds.maxX, 150, 0.001, 'maxX shifted');
    assertApprox(bounds.maxY, 150, 0.001, 'maxY shifted');
});

test('calculateCompositeBounds with multiple groups', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const gen = new SvgGenerator();
    const groups = [
        makeGroup(0, 'a', parsed.entities, 0, 0),
        makeGroup(1, 'b', parsed.entities, 200, 0)
    ];
    const bounds = gen.calculateCompositeBounds(groups);

    assertApprox(bounds.minX, 0, 0.001, 'minX');
    assertApprox(bounds.maxX, 300, 0.001, 'maxX (200 offset + 100 width)');
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
    assert(!svg.includes('data-group-id'), 'Export should not have data-group-id');
});

test('generateCompositeSvg preview mode has data attributes', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const gen = new SvgGenerator();
    const groups = [makeGroup(0, 'test', parsed.entities)];
    const svg = gen.generateCompositeSvg(groups, new Map(), 1, false);

    assert(!svg.startsWith('<?xml'), 'Preview should not have xml declaration');
    assert(svg.includes('data-element-id'), 'Preview should have data-element-id');
    assert(svg.includes('data-group-id="0"'), 'Preview should have data-group-id');
});

test('generateCompositeSvg multi-group has group wrapping', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const gen = new SvgGenerator();
    const groups = [
        makeGroup(0, 'a', [parsed.entities[0]], 0, 0),
        makeGroup(1, 'b', [parsed.entities[1]], 120, 0)
    ];
    const svg = gen.generateCompositeSvg(groups, new Map(), 1, false);

    assert(svg.includes('data-group-id="0"'), 'Has group 0');
    assert(svg.includes('data-group-id="1"'), 'Has group 1');
    assert(svg.includes('translate(120, 0)'), 'Group 1 has offset');
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
    assert(svg.includes('stroke="#FF0000"'), 'First entity should be red');
    assert(svg.includes('stroke="#0000FF"'), 'Second entity should be blue');
});

test('generateCompositeSvg with scale affects dimensions', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const gen = new SvgGenerator();
    const groups = [makeGroup(0, 'test', parsed.entities)];

    const svg1 = gen.generateCompositeSvg(groups, new Map(), 1, true);
    const svg25 = gen.generateCompositeSvg(groups, new Map(), 25.4, true);

    const widthMatch1 = svg1.match(/width="([\d.]+)mm"/);
    const widthMatch25 = svg25.match(/width="([\d.]+)mm"/);

    const w1 = parseFloat(widthMatch1[1]);
    const w25 = parseFloat(widthMatch25[1]);
    assertApprox(w25 / w1, 25.4, 0.01, 'Scaled width should be 25.4x larger');
});

if (hasTestfile2) {
    test('generateCompositeSvg with testfile2.dxf produces valid SVG', () => {
        const dxfContent = fs.readFileSync(testfile2Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        const gen = new SvgGenerator();
        const groups = [makeGroup(0, 'testfile2', parsed.entities)];
        const svg = gen.generateCompositeSvg(groups, new Map(), 1, true);

        assert(svg.includes('<svg'), 'Should have svg element');
        assert(svg.includes('<circle'), 'Should have circle from testfile2');
        assert(svg.includes('<path'), 'Should have paths from polylines/splines');
        assert(svg.includes('<line'), 'Should have line elements');

        // Write output for manual inspection
        fs.writeFileSync(path.join(__dirname, 'testfile2_output.svg'), svg);
        console.log('    Output written to testfile2_output.svg');
    });

    test('generateCompositeSvg with testfile2.dxf has reasonable bounds', () => {
        const dxfContent = fs.readFileSync(testfile2Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        const gen = new SvgGenerator();
        const groups = [makeGroup(0, 'testfile2', parsed.entities)];
        const bounds = gen.calculateCompositeBounds(groups);

        assert(isFinite(bounds.minX) && isFinite(bounds.maxX), 'X bounds should be finite');
        assert(isFinite(bounds.minY) && isFinite(bounds.maxY), 'Y bounds should be finite');
        assert(bounds.maxX > bounds.minX, 'Should have positive width');
        assert(bounds.maxY > bounds.minY, 'Should have positive height');
        console.log(`    Bounds: (${bounds.minX.toFixed(1)}, ${bounds.minY.toFixed(1)}) to (${bounds.maxX.toFixed(1)}, ${bounds.maxY.toFixed(1)})`);
    });
}

// --- DxfWriter ---

console.log('\n--- DxfWriter ---');

test('DxfWriter generates valid DXF structure', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const groups = [makeGroup(0, 'test', parsed.entities)];
    const writer = new DxfWriter(groups, new Map());
    const dxf = writer.generate();

    assert(dxf.includes('SECTION'), 'Should have SECTION');
    assert(dxf.includes('HEADER'), 'Should have HEADER');
    assert(dxf.includes('ENTITIES'), 'Should have ENTITIES');
    assert(dxf.includes('ENDSEC'), 'Should have ENDSEC');
    assert(dxf.includes('EOF'), 'Should have EOF');
});

test('DxfWriter writes all entity types', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const groups = [makeGroup(0, 'test', parsed.entities)];
    const writer = new DxfWriter(groups, new Map());
    const dxf = writer.generate();

    assert(dxf.includes('\nLINE\n'), 'Should have LINE entity');
    assert(dxf.includes('\nCIRCLE\n'), 'Should have CIRCLE entity');
    assert(dxf.includes('\nARC\n'), 'Should have ARC entity');
});

test('DxfWriter round-trip: parse -> write -> parse preserves entities', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const groups = [makeGroup(0, 'test', parsed.entities)];

    const writer = new DxfWriter(groups, new Map());
    const dxfOut = writer.generate();

    const parsed2 = parser.parse(dxfOut);
    assertEqual(parsed2.entities.length, parsed.entities.length, 'Entity count should match');

    for (let i = 0; i < parsed.entities.length; i++) {
        assertEqual(parsed2.entities[i].type, parsed.entities[i].type, `Type mismatch at ${i}`);
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
    assertApprox(rt.start.x, orig.start.x, 0.001, 'start.x');
    assertApprox(rt.start.y, orig.start.y, 0.001, 'start.y');
    assertApprox(rt.end.x, orig.end.x, 0.001, 'end.x');
    assertApprox(rt.end.y, orig.end.y, 0.001, 'end.y');
});

test('DxfWriter round-trip preserves CIRCLE', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const groups = [makeGroup(0, 'test', parsed.entities)];
    const writer = new DxfWriter(groups, new Map());
    const parsed2 = parser.parse(writer.generate());

    const orig = parsed.entities[1];
    const rt = parsed2.entities[1];
    assertApprox(rt.center.x, orig.center.x, 0.001, 'center.x');
    assertApprox(rt.center.y, orig.center.y, 0.001, 'center.y');
    assertApprox(rt.radius, orig.radius, 0.001, 'radius');
});

test('DxfWriter round-trip preserves ARC angles', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const groups = [makeGroup(0, 'test', parsed.entities)];
    const writer = new DxfWriter(groups, new Map());
    const parsed2 = parser.parse(writer.generate());

    const orig = parsed.entities[2];
    const rt = parsed2.entities[2];
    assertApprox(rt.startAngle, orig.startAngle, 0.001, 'startAngle');
    assertApprox(rt.endAngle, orig.endAngle, 0.001, 'endAngle');
});

test('DxfWriter applies group offset to coordinates', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const groups = [makeGroup(0, 'test', parsed.entities, 100, 200)];
    const writer = new DxfWriter(groups, new Map());
    const parsed2 = parser.parse(writer.generate());

    const orig = parsed.entities[0];
    const rt = parsed2.entities[0];
    assertApprox(rt.start.x, orig.start.x + 100, 0.001, 'start.x with offset');
    assertApprox(rt.start.y, orig.start.y + 200, 0.001, 'start.y with offset');
});

test('DxfWriter applies color overrides as ACI', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const groups = [makeGroup(0, 'test', parsed.entities)];
    const colors = new Map();
    colors.set('0-0', '#FF0000');

    const writer = new DxfWriter(groups, colors);
    const dxf = writer.generate();
    // ACI 1 = red; should appear as " 62\n1\n" after the LINE entity
    assert(dxf.includes(' 62\n1\n'), 'Should have ACI color code 1 (red)');
});

test('DxfWriter hexToAci maps all toolbar colors', () => {
    const writer = new DxfWriter([], new Map());
    assertEqual(writer.hexToAci('#000000'), 7, 'Black -> 7');
    assertEqual(writer.hexToAci('#FF0000'), 1, 'Red -> 1');
    assertEqual(writer.hexToAci('#00FF00'), 3, 'Green -> 3');
    assertEqual(writer.hexToAci('#0000FF'), 5, 'Blue -> 5');
    assertEqual(writer.hexToAci('#FF00FF'), 6, 'Magenta -> 6');
    assertEqual(writer.hexToAci('#00FFFF'), 4, 'Cyan -> 4');
    assertEqual(writer.hexToAci('#FFA500'), 30, 'Orange -> 30');
    assertEqual(writer.hexToAci('#800080'), 218, 'Purple -> 218');
});

if (hasTestfile2) {
    test('DxfWriter round-trip with testfile2.dxf', () => {
        const dxfContent = fs.readFileSync(testfile2Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        const groups = [makeGroup(0, 'testfile2', parsed.entities)];

        const writer = new DxfWriter(groups, new Map());
        const dxfOut = writer.generate();

        const parsed2 = parser.parse(dxfOut);
        assertEqual(parsed2.entities.length, parsed.entities.length, 'Entity count');

        for (let i = 0; i < parsed.entities.length; i++) {
            assertEqual(parsed2.entities[i].type, parsed.entities[i].type, `Type at ${i}`);
        }
        console.log(`    Round-tripped ${parsed2.entities.length} entities`);

        // Write for manual inspection
        fs.writeFileSync(path.join(__dirname, 'testfile2_roundtrip.dxf'), dxfOut);
        console.log('    Output written to testfile2_roundtrip.dxf');
    });

    test('DxfWriter round-trip preserves testfile2 CIRCLE', () => {
        const dxfContent = fs.readFileSync(testfile2Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        const groups = [makeGroup(0, 'testfile2', parsed.entities)];
        const writer = new DxfWriter(groups, new Map());
        const parsed2 = parser.parse(writer.generate());

        const origCircle = parsed.entities.find(e => e.type === 'CIRCLE');
        const rtCircle = parsed2.entities.find(e => e.type === 'CIRCLE');
        assertApprox(rtCircle.center.x, origCircle.center.x, 0.001, 'center.x');
        assertApprox(rtCircle.center.y, origCircle.center.y, 0.001, 'center.y');
        assertApprox(rtCircle.radius, origCircle.radius, 0.001, 'radius');
    });

    test('DxfWriter round-trip preserves testfile2 LWPOLYLINE vertices', () => {
        const dxfContent = fs.readFileSync(testfile2Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        const groups = [makeGroup(0, 'testfile2', parsed.entities)];
        const writer = new DxfWriter(groups, new Map());
        const parsed2 = parser.parse(writer.generate());

        const origPolys = parsed.entities.filter(e => e.type === 'LWPOLYLINE');
        const rtPolys = parsed2.entities.filter(e => e.type === 'LWPOLYLINE');
        assertEqual(rtPolys.length, origPolys.length, 'Polyline count');

        for (let p = 0; p < origPolys.length; p++) {
            assertEqual(rtPolys[p].vertices.length, origPolys[p].vertices.length, `Poly ${p} vertex count`);
            assertEqual(rtPolys[p].closed, origPolys[p].closed, `Poly ${p} closed flag`);
            for (let v = 0; v < origPolys[p].vertices.length; v++) {
                assertApprox(rtPolys[p].vertices[v].x, origPolys[p].vertices[v].x, 0.001, `Poly ${p} V${v}.x`);
                assertApprox(rtPolys[p].vertices[v].y, origPolys[p].vertices[v].y, 0.001, `Poly ${p} V${v}.y`);
            }
        }
    });

    test('DxfWriter round-trip preserves testfile2 LINE coords', () => {
        const dxfContent = fs.readFileSync(testfile2Path, 'utf8');
        const parser = new DxfParser();
        const parsed = parser.parse(dxfContent);
        const groups = [makeGroup(0, 'testfile2', parsed.entities)];
        const writer = new DxfWriter(groups, new Map());
        const parsed2 = parser.parse(writer.generate());

        const origLines = parsed.entities.filter(e => e.type === 'LINE');
        const rtLines = parsed2.entities.filter(e => e.type === 'LINE');
        assertEqual(rtLines.length, origLines.length, 'Line count');

        for (let i = 0; i < origLines.length; i++) {
            assertApprox(rtLines[i].start.x, origLines[i].start.x, 0.001, `Line ${i} start.x`);
            assertApprox(rtLines[i].start.y, origLines[i].start.y, 0.001, `Line ${i} start.y`);
            assertApprox(rtLines[i].end.x, origLines[i].end.x, 0.001, `Line ${i} end.x`);
            assertApprox(rtLines[i].end.y, origLines[i].end.y, 0.001, `Line ${i} end.y`);
        }
    });
}

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
    assert(entitiesAreDuplicates(a, b), 'Reversed lines should be duplicates');
});

test('Different LINEs are not duplicates', () => {
    const a = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 0, oy: 0 };
    const b = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:20,y:20} }, ox: 0, oy: 0 };
    assert(!entitiesAreDuplicates(a, b), 'Should not be duplicates');
});

test('LINEs with matching offsets are duplicates', () => {
    const a = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 5, oy: 5 };
    const b = { entity: { type: 'LINE', start: {x:5,y:5}, end: {x:15,y:15} }, ox: 0, oy: 0 };
    assert(entitiesAreDuplicates(a, b), 'Same absolute position should be duplicates');
});

test('Identical CIRCLEs are duplicates', () => {
    const a = { entity: { type: 'CIRCLE', center: {x:5,y:5}, radius: 10 }, ox: 0, oy: 0 };
    const b = { entity: { type: 'CIRCLE', center: {x:5,y:5}, radius: 10 }, ox: 0, oy: 0 };
    assert(entitiesAreDuplicates(a, b), 'Should be duplicates');
});

test('CIRCLEs with different radii are not duplicates', () => {
    const a = { entity: { type: 'CIRCLE', center: {x:5,y:5}, radius: 10 }, ox: 0, oy: 0 };
    const b = { entity: { type: 'CIRCLE', center: {x:5,y:5}, radius: 20 }, ox: 0, oy: 0 };
    assert(!entitiesAreDuplicates(a, b), 'Different radii should not match');
});

test('Different entity types are not duplicates', () => {
    const a = { entity: { type: 'LINE', start: {x:0,y:0}, end: {x:10,y:10} }, ox: 0, oy: 0 };
    const b = { entity: { type: 'CIRCLE', center: {x:5,y:5}, radius: 10 }, ox: 0, oy: 0 };
    assert(!entitiesAreDuplicates(a, b), 'Different types should not match');
});

test('Identical ARCs are duplicates', () => {
    const a = { entity: { type: 'ARC', center: {x:0,y:0}, radius: 5, startAngle: 0, endAngle: 90 }, ox: 0, oy: 0 };
    const b = { entity: { type: 'ARC', center: {x:0,y:0}, radius: 5, startAngle: 0, endAngle: 90 }, ox: 0, oy: 0 };
    assert(entitiesAreDuplicates(a, b), 'Should be duplicates');
});

test('LWPOLYLINE forward match', () => {
    const verts = [{x:0,y:0,bulge:0},{x:10,y:0,bulge:0},{x:10,y:10,bulge:0}];
    const a = { entity: { type: 'LWPOLYLINE', vertices: verts, closed: false }, ox: 0, oy: 0 };
    const b = { entity: { type: 'LWPOLYLINE', vertices: [...verts], closed: false }, ox: 0, oy: 0 };
    assert(entitiesAreDuplicates(a, b), 'Same vertices should be duplicates');
});

test('LWPOLYLINE reverse match', () => {
    const verts = [{x:0,y:0,bulge:0},{x:10,y:0,bulge:0},{x:10,y:10,bulge:0}];
    const reversed = [...verts].reverse();
    const a = { entity: { type: 'LWPOLYLINE', vertices: verts, closed: false }, ox: 0, oy: 0 };
    const b = { entity: { type: 'LWPOLYLINE', vertices: reversed, closed: false }, ox: 0, oy: 0 };
    assert(entitiesAreDuplicates(a, b), 'Reversed vertices should be duplicates');
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
    assertApprox(pts[0].x, 10, 0.001, 'Start at 0 degrees');
    assertApprox(pts[0].y, 0, 0.001);
    assertApprox(pts[1].x, 0, 0.01, 'End at 90 degrees');
    assertApprox(pts[1].y, 10, 0.001);
});

test('Open LWPOLYLINE has endpoints', () => {
    const pts = getEntityEndpoints({
        type: 'LWPOLYLINE',
        vertices: [{x:0,y:0},{x:5,y:5},{x:10,y:0}],
        closed: false
    });
    assertEqual(pts.length, 2);
    assertApprox(pts[0].x, 0, 0.001);
    assertApprox(pts[1].x, 10, 0.001);
});

test('Closed LWPOLYLINE has no endpoints', () => {
    const pts = getEntityEndpoints({
        type: 'LWPOLYLINE',
        vertices: [{x:0,y:0},{x:5,y:5},{x:10,y:0}],
        closed: true
    });
    assertEqual(pts.length, 0);
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

// --- Multi-group Workflow ---

console.log('\n--- Multi-group Workflow ---');

test('Two groups placed side by side', () => {
    const parser = new DxfParser();
    const parsed = parser.parse(simpleDxf);
    const gen = new SvgGenerator();

    const g1 = makeGroup(0, 'a', parsed.entities, 0, 0);
    const g2Bounds = gen.calculateBoundsForEntities(parsed.entities);
    const g1Bounds = gen.calculateCompositeBounds([g1]);
    const offsetX = g1Bounds.maxX + 10 - g2Bounds.minX;

    const g2 = makeGroup(1, 'b', parsed.entities, offsetX, 0);
    const groups = [g1, g2];

    const compositeBounds = gen.calculateCompositeBounds(groups);
    assert(compositeBounds.maxX > g1Bounds.maxX, 'Composite should be wider than single group');

    const svg = gen.generateCompositeSvg(groups, new Map(), 1, false);
    assert(svg.includes('data-group-id="0"'));
    assert(svg.includes('data-group-id="1"'));
});

if (hasTestfile1 && hasTestfile2) {
    test('Import testfile1 + testfile2 as two groups', () => {
        const parser = new DxfParser();
        const gen = new SvgGenerator();

        const parsed1 = parser.parse(fs.readFileSync(testfile1Path, 'utf8'));
        const parsed2 = parser.parse(fs.readFileSync(testfile2Path, 'utf8'));

        const g1 = makeGroup(0, 'testfile1', parsed1.entities, 0, 0);
        const g1Bounds = gen.calculateCompositeBounds([g1]);
        const g2Bounds = gen.calculateBoundsForEntities(parsed2.entities);
        const offsetX = g1Bounds.maxX + 10 - g2Bounds.minX;
        const g2 = makeGroup(1, 'testfile2', parsed2.entities, offsetX, 0);

        const groups = [g1, g2];
        const svg = gen.generateCompositeSvg(groups, new Map(), 1, true);
        assert(svg.includes('<svg'), 'Should produce valid SVG');

        fs.writeFileSync(path.join(__dirname, 'combined_output.svg'), svg);
        console.log('    Output written to combined_output.svg');

        // DXF export of combined
        const writer = new DxfWriter(groups, new Map());
        const dxf = writer.generate();
        const reparsed = parser.parse(dxf);
        assertEqual(reparsed.entities.length, parsed1.entities.length + parsed2.entities.length, 'Combined entity count');

        fs.writeFileSync(path.join(__dirname, 'combined_output.dxf'), dxf);
        console.log('    Output written to combined_output.dxf');
    });
}

// ============================================
// Summary
// ============================================

console.log(`\n${'='.repeat(50)}`);
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
