// Sidebar app logic - full feature set
// Imports lib/ modules for DXF parsing, SVG generation, etc.

import { DxfParser } from '../lib/dxf-parser.js';
import { SvgGenerator } from '../lib/svg-generator.js';
import { DxfWriter } from '../lib/dxf-writer.js';
import { getEntityEndpoints, pointsAreClose, applyOffsetToEntities, entitiesAreDuplicates } from '../lib/geometry-utils.js';
import { maxRectsPack, rectsOverlap, rectContains } from '../lib/packing.js';
import { rotateEntities, computeRotatedBounds } from '../lib/rotation.js';

// ============================================
// State
// ============================================

let importedGroups = [];
let groupIdCounter = 0;
let colorOverrides = new Map();
let selectedElements = new Set();

// Undo/Redo
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;

// Viewport
let viewCenterX = 0, viewCenterY = 0;
let viewZoom = 1;
let baseViewBox = null;
let baseBounds = null;

// Bed/tray
let bedEnabled = false;
let bedWidth = 495.3;
let bedHeight = 279.4;
let autoPlaceMargin = 2;

// Move mode
let moveMode = false;
let selectedGroupId = null;

// Interaction state
let isPanning = false;
let panStartScreenX = 0, panStartScreenY = 0;

let isDragSelecting = false;
let didDragSelect = false;
let dragSelectStartX = 0, dragSelectStartY = 0;
let selectionBoxEl = null;
let dragSelectStartTarget = null;

let isMovingGroup = false;
let didStartMove = false;
let moveLastScreenX = 0, moveLastScreenY = 0;

// Snap
let snapEnabled = true;
let otherGroupEndpoints = [];
let dragGroupEndpoints = [];
const SNAP_TOLERANCE = 5.0;
const CONNECTION_TOLERANCE = 0.5;
let duplicateTolerance = 0.1;
let pendingOverlapRemovals = null;

// Element interaction map
let elementMap = new Map();

// ============================================
// DOM References
// ============================================

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const unitSelect = document.getElementById('unitSelect');
const downloadBtn = document.getElementById('downloadBtn');
const downloadDxfBtn = document.getElementById('downloadDxfBtn');
const sendToGfBtn = document.getElementById('sendToGfBtn');
const removeDuplicatesBtn = document.getElementById('removeDuplicatesBtn');
const removeOverlapsBtn = document.getElementById('removeOverlapsBtn');
const dupToleranceSelect = document.getElementById('dupToleranceSelect');
const status = document.getElementById('status');
const previewContainer = document.getElementById('previewContainer');
const previewArea = document.getElementById('previewArea');
const dimensions = document.getElementById('dimensions');
const colorToolbar = document.getElementById('colorToolbar');
const colorSwatches = document.getElementById('colorSwatches');
const customColor = document.getElementById('customColor');
const selectionInfo = document.getElementById('selectionInfo');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const deleteSelectionBtn = document.getElementById('deleteSelectionBtn');
const fileListItems = document.getElementById('fileListItems');
const clearAllBtn = document.getElementById('clearAllBtn');
const groupSelectedBtn = document.getElementById('groupSelectedBtn');
const moveModeBtn = document.getElementById('moveModeBtn');
const resetViewBtn = document.getElementById('resetViewBtn');
const bedToggleBtn = document.getElementById('bedToggleBtn');
const bedPresetSelect = document.getElementById('bedPresetSelect');
const bedWidthInput = document.getElementById('bedWidthInput');
const bedHeightInput = document.getElementById('bedHeightInput');
const autoPlaceBtn = document.getElementById('autoPlaceBtn');
const autoPlaceMarginInput = document.getElementById('autoPlaceMarginInput');

// ============================================
// Undo/Redo
// ============================================

function saveUndoState() {
    undoStack.push({
        groups: JSON.parse(JSON.stringify(importedGroups)),
        colorOverrides: new Map(colorOverrides),
        groupIdCounter: groupIdCounter
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
    updateUndoRedoButtons();
}

function restoreState(state) {
    importedGroups = state.groups;
    colorOverrides = new Map(state.colorOverrides);
    groupIdCounter = state.groupIdCounter;
    selectedElements.clear();
    selectedGroupId = null;
    clearGroupHighlight();
    rebuildCanvas(true);
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({
        groups: JSON.parse(JSON.stringify(importedGroups)),
        colorOverrides: new Map(colorOverrides),
        groupIdCounter: groupIdCounter
    });
    restoreState(undoStack.pop());
    updateUndoRedoButtons();
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({
        groups: JSON.parse(JSON.stringify(importedGroups)),
        colorOverrides: new Map(colorOverrides),
        groupIdCounter: groupIdCounter
    });
    restoreState(redoStack.pop());
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// ============================================
// Utility Functions
// ============================================

function getElementEndpoints(el) {
    if (el.dataset.closed === 'true') return null;
    const startX = parseFloat(el.dataset.startX);
    const startY = parseFloat(el.dataset.startY);
    const endX = parseFloat(el.dataset.endX);
    const endY = parseFloat(el.dataset.endY);
    if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) return null;
    return { start: { x: startX, y: startY }, end: { x: endX, y: endY } };
}

function findConnectedElements(startElement, allElements) {
    const connected = new Set([startElement]);
    const toProcess = [startElement];

    while (toProcess.length > 0) {
        const current = toProcess.pop();
        const currentEndpoints = getElementEndpoints(current);
        if (!currentEndpoints) continue;

        allElements.forEach(el => {
            if (connected.has(el)) return;
            const elEndpoints = getElementEndpoints(el);
            if (!elEndpoints) return;

            const isConnected =
                pointsAreClose(currentEndpoints.start, elEndpoints.start, CONNECTION_TOLERANCE) ||
                pointsAreClose(currentEndpoints.start, elEndpoints.end, CONNECTION_TOLERANCE) ||
                pointsAreClose(currentEndpoints.end, elEndpoints.start, CONNECTION_TOLERANCE) ||
                pointsAreClose(currentEndpoints.end, elEndpoints.end, CONNECTION_TOLERANCE);

            if (isConnected) {
                connected.add(el);
                toProcess.push(el);
            }
        });
    }

    return connected;
}

function findGroupIdFromElement(el) {
    let current = el;
    while (current && current !== previewArea) {
        if (current.dataset && current.dataset.groupId !== undefined) {
            return parseInt(current.dataset.groupId);
        }
        current = current.parentElement;
    }
    return null;
}

function findGroupById(id) {
    return importedGroups.find(g => g.id === id);
}

function getScale() {
    const unitSetting = unitSelect.value;
    if (unitSetting === 'in') return 25.4;
    if (unitSetting === 'mm') return 1;
    // Auto-detect
    if (importedGroups.length === 0) return 1;
    const gen = new SvgGenerator();
    const bounds = gen.calculateCompositeBounds(importedGroups);
    const maxDim = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    if (maxDim < 1) return 25.4;
    return 1;
}

function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status ' + type;
}

// ============================================
// Group Operations
// ============================================

function groupSelectedFiles(groupIds) {
    if (groupIds.length < 2) return;
    saveUndoState();

    const mergedEntities = [];
    const subGroups = [];
    const newId = groupIdCounter++;
    const newOverrides = new Map();

    for (const gid of groupIds) {
        const group = findGroupById(gid);
        if (!group) continue;

        const startIndex = mergedEntities.length;
        const cloned = JSON.parse(JSON.stringify(group.entities));
        applyOffsetToEntities(cloned, group.offsetX, group.offsetY);

        for (let i = 0; i < cloned.length; i++) {
            const oldKey = `${gid}-${i}`;
            if (colorOverrides.has(oldKey)) {
                newOverrides.set(`${newId}-${startIndex + i}`, colorOverrides.get(oldKey));
                colorOverrides.delete(oldKey);
            }
        }

        mergedEntities.push(...cloned);
        subGroups.push({ filename: group.filename, startIndex, count: cloned.length });
    }

    importedGroups = importedGroups.filter(g => !groupIds.includes(g.id));
    for (const gid of groupIds) {
        for (const [key] of colorOverrides) {
            if (key.startsWith(`${gid}-`)) colorOverrides.delete(key);
        }
    }
    for (const [k, v] of newOverrides) colorOverrides.set(k, v);

    const filenames = subGroups.map(sg => sg.filename);
    importedGroups.push({
        id: newId,
        filename: filenames.join(' + '),
        entities: mergedEntities,
        offsetX: 0,
        offsetY: 0,
        subGroups: subGroups
    });

    rebuildCanvas(false);
    showStatus(`Grouped ${subGroups.length} files into one.`, 'success');
}

function ungroupFile(groupId) {
    const group = findGroupById(groupId);
    if (!group || !group.subGroups) return;
    saveUndoState();

    const restoredGroups = [];

    for (const sg of group.subGroups) {
        const cloned = JSON.parse(JSON.stringify(group.entities.slice(sg.startIndex, sg.startIndex + sg.count)));
        const newId = groupIdCounter++;

        for (let i = 0; i < cloned.length; i++) {
            const oldKey = `${groupId}-${sg.startIndex + i}`;
            if (colorOverrides.has(oldKey)) {
                colorOverrides.set(`${newId}-${i}`, colorOverrides.get(oldKey));
                colorOverrides.delete(oldKey);
            }
        }

        restoredGroups.push({
            id: newId,
            filename: sg.filename,
            entities: cloned,
            offsetX: 0,
            offsetY: 0
        });
    }

    importedGroups = importedGroups.filter(g => g.id !== groupId);
    importedGroups.push(...restoredGroups);

    rebuildCanvas(false);
    showStatus(`Ungrouped into ${restoredGroups.length} files.`, 'success');
}

function updateGroupButton() {
    const checked = document.querySelectorAll('.group-checkbox:checked').length;
    groupSelectedBtn.style.display = checked >= 2 ? '' : 'none';
}

// ============================================
// Auto Place
// ============================================

function autoPlace() {
    if (!bedEnabled) {
        showStatus('Enable bed first to auto-place groups.', 'error');
        return;
    }
    if (importedGroups.length === 0) {
        showStatus('No groups to place.', 'error');
        return;
    }

    saveUndoState();

    const margin = autoPlaceMargin;
    const angles = [0, 45, 90, 135];

    const rects = importedGroups.map((group, gi) => {
        const sizes = [];
        for (const angle of angles) {
            const b = computeRotatedBounds(group.entities, angle, 0, 0);
            const w = (b.maxX - b.minX) + margin * 2;
            const h = (b.maxY - b.minY) + margin * 2;
            sizes.push({ w, h, angle });
        }
        return { sizes, groupIndex: gi };
    });

    const placements = maxRectsPack(bedWidth, bedHeight, rects);

    let placedCount = 0;
    for (let i = 0; i < placements.length; i++) {
        const p = placements[i];
        if (!p) continue;
        placedCount++;
        const group = importedGroups[i];

        if (p.angle !== 0) {
            rotateEntities(group.entities, p.angle);
        }

        const gen = new SvgGenerator();
        const b = gen.calculateBoundsForEntities(group.entities);

        group.offsetX = p.x + margin - b.minX;
        group.offsetY = p.y + margin - b.minY;
    }

    rebuildCanvas(true);

    if (placedCount === importedGroups.length) {
        showStatus(`Auto-placed all ${placedCount} group(s) in bed.`, 'success');
    } else {
        showStatus(`Placed ${placedCount}/${importedGroups.length} group(s). ${importedGroups.length - placedCount} did not fit.`, 'error');
    }
}

// ============================================
// Core Functions
// ============================================

function rebuildCanvas(resetView = true, suppressStatus = false) {
    selectedElements.clear();
    updateSelectionInfo();
    elementMap.clear();

    pendingOverlapRemovals = null;
    removeOverlapsBtn.style.display = 'none';

    if (importedGroups.length === 0) {
        previewContainer.classList.remove('visible');
        downloadBtn.disabled = true;
        downloadDxfBtn.disabled = true;
        sendToGfBtn.disabled = true;
        previewArea.innerHTML = '';
        baseViewBox = null;
        baseBounds = null;
        status.className = 'status';
        return;
    }

    const generator = new SvgGenerator();
    const bounds = generator.calculateCompositeBounds(importedGroups);

    if (bedEnabled) {
        bounds.minX = Math.min(bounds.minX, 0);
        bounds.minY = Math.min(bounds.minY, 0);
        bounds.maxX = Math.max(bounds.maxX, bedWidth);
        bounds.maxY = Math.max(bounds.maxY, bedHeight);
    }

    baseBounds = bounds;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const padding = Math.max(width, height) * 0.02;

    const svgVbX = bounds.minX - padding;
    const svgVbY = -(bounds.maxY + padding);
    const svgVbW = width + padding * 2;
    const svgVbH = height + padding * 2;
    baseViewBox = { x: svgVbX, y: svgVbY, w: svgVbW, h: svgVbH };

    const scale = getScale();
    const svgString = generator.generateCompositeSvg(importedGroups, colorOverrides, scale, false);
    previewArea.innerHTML = svgString;

    if (bedEnabled) {
        const svg = previewArea.querySelector('svg');
        const outerG = svg.querySelector('g');
        const ns = 'http://www.w3.org/2000/svg';
        const rect = document.createElementNS(ns, 'rect');
        rect.setAttribute('x', 0);
        rect.setAttribute('y', 0);
        rect.setAttribute('width', bedWidth);
        rect.setAttribute('height', bedHeight);
        rect.setAttribute('class', 'tray-rect');
        rect.setAttribute('stroke', '#999');
        rect.setAttribute('stroke-dasharray', '8 4');
        rect.setAttribute('stroke-width', '0.5');
        rect.setAttribute('fill', 'none');
        rect.setAttribute('pointer-events', 'none');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        outerG.insertBefore(rect, outerG.firstChild);
    }

    setupSvgInteraction();

    if (resetView) {
        viewCenterX = svgVbX + svgVbW / 2;
        viewCenterY = svgVbY + svgVbH / 2;
        viewZoom = 1;
    }
    updateViewBox();

    updateFileList();
    updateDimensionsDisplay();

    previewContainer.classList.add('visible');
    downloadBtn.disabled = false;
    downloadDxfBtn.disabled = false;
    sendToGfBtn.disabled = false;
    colorToolbar.classList.add('visible');

    if (moveMode && selectedGroupId !== null) {
        showGroupHighlight(selectedGroupId);
    }
    if (moveMode) {
        previewArea.classList.add('move-mode');
    }

    if (!suppressStatus) {
        const totalEntities = importedGroups.reduce((sum, g) => sum + g.entities.length, 0);
        showStatus(`${importedGroups.length} file(s) loaded, ${totalEntities} total entities.`, 'success');
    }
}

function updateViewBox() {
    const svg = previewArea.querySelector('svg');
    if (!svg || !baseViewBox) return;

    const w = baseViewBox.w / viewZoom;
    const h = baseViewBox.h / viewZoom;
    svg.setAttribute('viewBox', `${viewCenterX - w / 2} ${viewCenterY - h / 2} ${w} ${h}`);
}

function updateDimensionsDisplay() {
    if (!baseBounds) return;
    const scale = getScale();
    const width = baseBounds.maxX - baseBounds.minX;
    const height = baseBounds.maxY - baseBounds.minY;
    const finalWidth = (width * scale).toFixed(2);
    const finalHeight = (height * scale).toFixed(2);
    const unitSetting = unitSelect.value;
    let detectedUnit = 'mm';
    if (unitSetting === 'in' || (unitSetting === 'auto' && scale === 25.4)) {
        detectedUnit = 'in→mm';
    }
    dimensions.textContent = `${finalWidth} × ${finalHeight} mm (${detectedUnit})`;
}

function updateFileList() {
    fileListItems.innerHTML = '';
    for (const group of importedGroups) {
        const item = document.createElement('div');
        item.className = 'file-list-item';
        const displayName = group.subGroups ? group.filename : group.filename + '.dxf';
        const ungroupBtn = group.subGroups
            ? `<button class="btn-file-action" data-action="ungroup" data-group-id="${group.id}">Ungroup</button>`
            : '';
        item.innerHTML = `
            <input type="checkbox" class="group-checkbox" data-group-id="${group.id}">
            <span class="filename">${displayName}</span>
            <button class="btn-file-action" data-action="select" data-group-id="${group.id}">Sel</button>
            ${ungroupBtn}
            <button class="btn-remove-file" data-action="remove" data-group-id="${group.id}" title="Remove">&times;</button>
        `;
        fileListItems.appendChild(item);
    }
    updateGroupButton();
}

function setupSvgInteraction() {
    const svgElement = previewArea.querySelector('svg');
    if (!svgElement) return;

    elementMap.clear();

    const geometryElements = svgElement.querySelectorAll('line, circle, ellipse, path, polyline, polygon, rect:not(.group-highlight)');

    geometryElements.forEach(el => {
        if (el.dataset.elementId === undefined) return;
        el.classList.add('selectable');

        const hitArea = el.cloneNode(true);
        hitArea.classList.remove('selectable');
        hitArea.classList.add('hit-area');
        hitArea.removeAttribute('data-element-id');
        hitArea.dataset.forElement = el.dataset.elementId;

        el.parentNode.insertBefore(hitArea, el);
        elementMap.set(hitArea, el);
    });
}

function showGroupHighlight(groupId) {
    clearGroupHighlight();
    const svg = previewArea.querySelector('svg');
    if (!svg) return;

    const groupG = svg.querySelector(`g[data-group-id="${groupId}"]`);
    if (!groupG) return;

    const bbox = groupG.getBBox();
    const pad = 2;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', bbox.x - pad);
    rect.setAttribute('y', bbox.y - pad);
    rect.setAttribute('width', bbox.width + pad * 2);
    rect.setAttribute('height', bbox.height + pad * 2);
    rect.setAttribute('class', 'group-highlight');
    rect.setAttribute('stroke', '#007bff');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '6,4');
    rect.setAttribute('fill', 'none');
    rect.setAttribute('pointer-events', 'none');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');

    groupG.appendChild(rect);
}

function clearGroupHighlight() {
    const svg = previewArea.querySelector('svg');
    if (!svg) return;
    svg.querySelectorAll('.group-highlight').forEach(el => el.remove());
}

// ============================================
// Selection Functions
// ============================================

function selectElement(el, shiftKey) {
    if (shiftKey) {
        if (selectedElements.has(el)) {
            el.classList.remove('selected');
            selectedElements.delete(el);
        } else {
            el.classList.add('selected');
            selectedElements.add(el);
        }
    } else {
        selectedElements.forEach(selected => selected.classList.remove('selected'));
        selectedElements.clear();
        el.classList.add('selected');
        selectedElements.add(el);
    }
    updateSelectionInfo();
}

function selectConnectedChain(el, shiftKey) {
    const svgElement = previewArea.querySelector('svg');
    if (!svgElement) return;
    const allSelectables = Array.from(svgElement.querySelectorAll('.selectable'));
    const connected = findConnectedElements(el, allSelectables);

    if (!shiftKey) {
        selectedElements.forEach(selected => selected.classList.remove('selected'));
        selectedElements.clear();
    }

    connected.forEach(connectedEl => {
        connectedEl.classList.add('selected');
        selectedElements.add(connectedEl);
    });

    updateSelectionInfo();
}

function clearSelection() {
    selectedElements.forEach(el => el.classList.remove('selected'));
    selectedElements.clear();
    updateSelectionInfo();
}

function updateSelectionInfo() {
    const count = selectedElements.size;
    selectionInfo.textContent = count === 0 ? '0 selected' :
        count === 1 ? '1 selected' : `${count} selected`;
}

function applyColorToSelection(color) {
    if (selectedElements.size === 0) return;
    saveUndoState();

    selectedElements.forEach(el => {
        el.setAttribute('stroke', color);
        const groupId = findGroupIdFromElement(el);
        const elementId = el.dataset.elementId;
        if (groupId !== null && elementId !== undefined) {
            colorOverrides.set(`${groupId}-${elementId}`, color);
        }
    });

    updateSelectionInfo();
}

// ============================================
// Snap Functions
// ============================================

function precomputeSnapPoints(dragGroupId) {
    otherGroupEndpoints = [];
    dragGroupEndpoints = [];

    for (const group of importedGroups) {
        if (group.id === dragGroupId) {
            for (const entity of group.entities) {
                const pts = getEntityEndpoints(entity);
                for (const pt of pts) {
                    dragGroupEndpoints.push({ x: pt.x, y: pt.y });
                }
            }
        } else {
            for (const entity of group.entities) {
                const pts = getEntityEndpoints(entity);
                for (const pt of pts) {
                    otherGroupEndpoints.push({
                        x: pt.x + group.offsetX,
                        y: pt.y + group.offsetY
                    });
                }
            }
        }
    }

    if (bedEnabled) {
        const bedPoints = [
            {x: 0, y: 0}, {x: bedWidth, y: 0},
            {x: 0, y: bedHeight}, {x: bedWidth, y: bedHeight},
            {x: bedWidth / 2, y: 0}, {x: bedWidth / 2, y: bedHeight},
            {x: 0, y: bedHeight / 2}, {x: bedWidth, y: bedHeight / 2}
        ];
        otherGroupEndpoints.push(...bedPoints);
    }
}

function findSnapPoint(proposedOffsetX, proposedOffsetY) {
    let bestDist = SNAP_TOLERANCE;
    let snapDelta = null;
    let snapPoint = null;

    for (const dPt of dragGroupEndpoints) {
        const absX = dPt.x + proposedOffsetX;
        const absY = dPt.y + proposedOffsetY;

        for (const oPt of otherGroupEndpoints) {
            const dx = oPt.x - absX;
            const dy = oPt.y - absY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < bestDist) {
                bestDist = dist;
                snapDelta = { x: dx, y: dy };
                snapPoint = { x: oPt.x, y: oPt.y };
            }
        }
    }

    return { snapDelta, snapPoint };
}

function showSnapIndicator(point) {
    clearSnapIndicators();
    const svg = previewArea.querySelector('svg');
    if (!svg) return;
    const outerG = svg.querySelector('g');
    if (!outerG) return;

    const size = 3;
    const ns = 'http://www.w3.org/2000/svg';

    const h = document.createElementNS(ns, 'line');
    h.setAttribute('x1', point.x - size);
    h.setAttribute('y1', point.y);
    h.setAttribute('x2', point.x + size);
    h.setAttribute('y2', point.y);
    h.setAttribute('stroke', '#00cc00');
    h.setAttribute('stroke-width', '2');
    h.setAttribute('class', 'snap-indicator');
    h.setAttribute('vector-effect', 'non-scaling-stroke');

    const v = document.createElementNS(ns, 'line');
    v.setAttribute('x1', point.x);
    v.setAttribute('y1', point.y - size);
    v.setAttribute('x2', point.x);
    v.setAttribute('y2', point.y + size);
    v.setAttribute('stroke', '#00cc00');
    v.setAttribute('stroke-width', '2');
    v.setAttribute('class', 'snap-indicator');
    v.setAttribute('vector-effect', 'non-scaling-stroke');

    outerG.appendChild(h);
    outerG.appendChild(v);
}

function clearSnapIndicators() {
    const svg = previewArea.querySelector('svg');
    if (!svg) return;
    svg.querySelectorAll('.snap-indicator').forEach(el => el.remove());
}

// ============================================
// Action Functions
// ============================================

function handleFiles(files) {
    const validFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.dxf'));
    if (validFiles.length === 0) {
        showStatus('Please select DXF file(s).', 'error');
        return;
    }

    showStatus('Reading files...', 'info');

    const readPromises = validFiles.map(file => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve({ name: file.name, content: e.target.result });
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsText(file);
        });
    });

    Promise.all(readPromises).then(results => {
        const parser = new DxfParser();
        const generator = new SvgGenerator();
        let addedCount = 0;
        let undoSaved = false;

        for (const { name, content } of results) {
            try {
                const parsed = parser.parse(content);
                if (!parsed.entities || parsed.entities.length === 0) continue;

                const filename = name.replace(/\.dxf$/i, '');

                let offsetX = 0, offsetY = 0;
                if (importedGroups.length > 0) {
                    const bounds = generator.calculateCompositeBounds(importedGroups);
                    const newBounds = generator.calculateBoundsForEntities(parsed.entities);
                    offsetX = bounds.maxX + 10 - newBounds.minX;
                }

                if (!undoSaved) {
                    saveUndoState();
                    undoSaved = true;
                }
                importedGroups.push({
                    id: groupIdCounter++,
                    filename: filename,
                    entities: parsed.entities,
                    offsetX: offsetX,
                    offsetY: offsetY
                });
                addedCount++;
            } catch (err) {
                showStatus(`Error parsing ${name}: ${err.message}`, 'error');
            }
        }

        if (addedCount > 0) {
            rebuildCanvas(true);
        }
    }).catch(err => {
        showStatus('Error reading files: ' + err.message, 'error');
    });
}

function deleteSelection() {
    if (selectedElements.size === 0) return;
    saveUndoState();

    const toDelete = new Map();

    selectedElements.forEach(el => {
        const groupId = findGroupIdFromElement(el);
        const elementId = parseInt(el.dataset.elementId);
        if (groupId !== null && !isNaN(elementId)) {
            if (!toDelete.has(groupId)) {
                toDelete.set(groupId, new Set());
            }
            toDelete.get(groupId).add(elementId);
        }
    });

    let deletedCount = 0;

    for (const [groupId, entityIndices] of toDelete) {
        const group = findGroupById(groupId);
        if (!group) continue;

        const sortedIndices = Array.from(entityIndices).sort((a, b) => b - a);
        for (const idx of sortedIndices) {
            group.entities.splice(idx, 1);
            colorOverrides.delete(`${groupId}-${idx}`);
            deletedCount++;
        }

        delete group.subGroups;
    }

    for (const groupId of toDelete.keys()) {
        for (const [key] of colorOverrides) {
            if (key.startsWith(`${groupId}-`)) {
                colorOverrides.delete(key);
            }
        }
    }

    importedGroups = importedGroups.filter(g => g.entities.length > 0);
    rebuildCanvas(false, true);
    showStatus(`Deleted ${deletedCount} element(s).`, 'success');
}

function findOverlaps() {
    if (importedGroups.length === 0) return;

    const totalBefore = importedGroups.reduce((sum, g) => sum + g.entities.length, 0);

    const allEntities = [];
    for (const group of importedGroups) {
        for (let i = 0; i < group.entities.length; i++) {
            allEntities.push({
                entity: group.entities[i],
                groupId: group.id,
                entityIndex: i,
                ox: group.offsetX,
                oy: group.offsetY
            });
        }
    }

    const toRemove = new Set();
    for (let i = 0; i < allEntities.length; i++) {
        if (toRemove.has(i)) continue;
        for (let j = i + 1; j < allEntities.length; j++) {
            if (toRemove.has(j)) continue;
            if (entitiesAreDuplicates(allEntities[i], allEntities[j], duplicateTolerance)) {
                toRemove.add(j);
            }
        }
    }

    if (toRemove.size === 0) {
        showStatus(`No duplicates found at ±${duplicateTolerance} (${totalBefore} entities).`, 'info');
        removeOverlapsBtn.style.display = 'none';
        pendingOverlapRemovals = null;
        return;
    }

    const dupByType = {};
    for (const idx of toRemove) {
        const t = allEntities[idx].entity.type;
        dupByType[t] = (dupByType[t] || 0) + 1;
    }
    const typeBreakdown = Object.entries(dupByType).map(([type, count]) => `${count} ${type}`).join(', ');

    clearSelection();
    const svg = previewArea.querySelector('svg');
    if (svg) {
        for (const idx of toRemove) {
            const entry = allEntities[idx];
            const groupG = svg.querySelector(`g[data-group-id="${entry.groupId}"]`);
            if (!groupG) continue;
            const el = groupG.querySelector(`[data-element-id="${entry.entityIndex}"]`);
            if (el) {
                el.classList.add('selected');
                selectedElements.add(el);
            }
        }
    }
    updateSelectionInfo();

    pendingOverlapRemovals = { allEntities, toRemove, totalBefore };
    removeOverlapsBtn.textContent = `Remove ${toRemove.size}`;
    removeOverlapsBtn.style.display = '';
    showStatus(`Found ${toRemove.size} overlap(s): ${typeBreakdown}. Inspect, then click Remove.`, 'info');
}

function removeOverlaps() {
    if (!pendingOverlapRemovals) return;
    const { allEntities, toRemove, totalBefore } = pendingOverlapRemovals;

    saveUndoState();

    const groupRemovals = new Map();
    for (const idx of toRemove) {
        const entry = allEntities[idx];
        if (!groupRemovals.has(entry.groupId)) {
            groupRemovals.set(entry.groupId, new Set());
        }
        groupRemovals.get(entry.groupId).add(entry.entityIndex);
    }

    let removedCount = 0;
    for (const [groupId, indices] of groupRemovals) {
        const group = findGroupById(groupId);
        if (!group) continue;

        const sortedIndices = Array.from(indices).sort((a, b) => b - a);
        for (const idx of sortedIndices) {
            group.entities.splice(idx, 1);
            removedCount++;
        }

        for (const [key] of colorOverrides) {
            if (key.startsWith(`${groupId}-`)) {
                colorOverrides.delete(key);
            }
        }
    }

    importedGroups = importedGroups.filter(g => g.entities.length > 0);
    const totalAfter = importedGroups.reduce((sum, g) => sum + g.entities.length, 0);

    removeOverlapsBtn.style.display = 'none';
    pendingOverlapRemovals = null;

    rebuildCanvas(false, true);
    showStatus(`Removed ${removedCount} duplicate(s). ${totalBefore} → ${totalAfter} entities.`, 'success');
}

function downloadSvg() {
    if (importedGroups.length === 0) return;
    const generator = new SvgGenerator();
    const scale = getScale();
    const svgString = generator.generateCompositeSvg(importedGroups, colorOverrides, scale, true);

    const filename = importedGroups.length === 1 ? importedGroups[0].filename : 'combined';
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadDxf() {
    if (importedGroups.length === 0) return;
    const writer = new DxfWriter(importedGroups, colorOverrides);
    const dxfString = writer.generate();

    const filename = importedGroups.length === 1 ? importedGroups[0].filename : 'combined';
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.dxf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function sendToGlowforge() {
    if (importedGroups.length === 0) return;
    const generator = new SvgGenerator();
    const scale = getScale();
    const svgString = generator.generateCompositeSvg(importedGroups, colorOverrides, scale, true);
    const filename = (importedGroups.length === 1 ? importedGroups[0].filename : 'combined') + '.svg';

    // Post message to content script
    window.parent.postMessage({
        source: 'dxf-glowforge-sidebar',
        action: 'upload-svg',
        svgString: svgString,
        filename: filename
    }, '*');

    sendToGfBtn.textContent = 'Sending...';
    sendToGfBtn.disabled = true;

    // Reset button after timeout (in case no response)
    setTimeout(() => {
        sendToGfBtn.textContent = 'Send to Glowforge';
        sendToGfBtn.disabled = false;
    }, 5000);
}

// Listen for upload result from content script
window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'dxf-glowforge-content') return;

    if (event.data.action === 'upload-result') {
        sendToGfBtn.textContent = 'Send to Glowforge';
        sendToGfBtn.disabled = false;

        if (event.data.success) {
            showStatus(event.data.message, 'success');
        } else {
            showStatus(event.data.message, 'error');
        }
    }
});

// ============================================
// Event Handlers
// ============================================

function handleWheel(e) {
    e.preventDefault();
    const svg = previewArea.querySelector('svg');
    if (!svg || !baseViewBox) return;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(20, viewZoom * zoomFactor));

    const rect = svg.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;

    const w = baseViewBox.w / viewZoom;
    const h = baseViewBox.h / viewZoom;

    const cursorX = (viewCenterX - w / 2) + fracX * w;
    const cursorY = (viewCenterY - h / 2) + fracY * h;

    const newW = baseViewBox.w / newZoom;
    const newH = baseViewBox.h / newZoom;

    viewCenterX = cursorX + newW * (0.5 - fracX);
    viewCenterY = cursorY + newH * (0.5 - fracY);
    viewZoom = newZoom;

    updateViewBox();
}

function handleMouseDown(e) {
    // Middle button or Ctrl+left → pan
    if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        isPanning = true;
        panStartScreenX = e.clientX;
        panStartScreenY = e.clientY;
        previewArea.classList.add('panning');
        e.preventDefault();
        return;
    }

    if (e.button !== 0) return;

    // Move mode
    if (moveMode) {
        let targetElement = e.target;
        if (targetElement.classList.contains('hit-area')) {
            targetElement = elementMap.get(targetElement) || targetElement;
        }

        const clickedGroupId = findGroupIdFromElement(targetElement);

        if (clickedGroupId !== null) {
            selectedGroupId = clickedGroupId;
            showGroupHighlight(selectedGroupId);
            isMovingGroup = true;
            didStartMove = false;
            moveLastScreenX = e.clientX;
            moveLastScreenY = e.clientY;
            precomputeSnapPoints(selectedGroupId);
        } else {
            selectedGroupId = null;
            clearGroupHighlight();
        }
        e.preventDefault();
        return;
    }

    // Normal selection: start drag-select
    const rect = previewArea.getBoundingClientRect();
    dragSelectStartX = e.clientX - rect.left;
    dragSelectStartY = e.clientY - rect.top;
    dragSelectStartTarget = e.target;
    isDragSelecting = true;
    didDragSelect = false;

    selectionBoxEl = document.createElement('div');
    selectionBoxEl.className = 'selection-box';
    selectionBoxEl.style.left = dragSelectStartX + 'px';
    selectionBoxEl.style.top = dragSelectStartY + 'px';
    selectionBoxEl.style.width = '0px';
    selectionBoxEl.style.height = '0px';
    selectionBoxEl.style.display = 'none';
    previewArea.appendChild(selectionBoxEl);

    e.preventDefault();
}

function handleMouseMove(e) {
    if (isPanning) {
        const svg = previewArea.querySelector('svg');
        if (!svg || !baseViewBox) return;

        const dx = e.clientX - panStartScreenX;
        const dy = e.clientY - panStartScreenY;
        panStartScreenX = e.clientX;
        panStartScreenY = e.clientY;

        const rect = svg.getBoundingClientRect();
        const w = baseViewBox.w / viewZoom;
        const h = baseViewBox.h / viewZoom;

        viewCenterX -= dx * (w / rect.width);
        viewCenterY -= dy * (h / rect.height);
        updateViewBox();
        return;
    }

    if (isMovingGroup) {
        const dx = e.clientX - moveLastScreenX;
        const dy = e.clientY - moveLastScreenY;

        if (!didStartMove && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
            saveUndoState();
            didStartMove = true;
            previewArea.classList.add('dragging-group');
        }

        if (didStartMove) {
            moveLastScreenX = e.clientX;
            moveLastScreenY = e.clientY;

            const svg = previewArea.querySelector('svg');
            if (!svg || !baseViewBox) return;

            const rect = svg.getBoundingClientRect();
            const w = baseViewBox.w / viewZoom;
            const h = baseViewBox.h / viewZoom;

            const dxfDeltaX = dx * (w / rect.width);
            const dxfDeltaY = -(dy * (h / rect.height));

            const group = findGroupById(selectedGroupId);
            if (!group) return;

            group.offsetX += dxfDeltaX;
            group.offsetY += dxfDeltaY;

            if (snapEnabled) {
                const snap = findSnapPoint(group.offsetX, group.offsetY);
                if (snap.snapDelta) {
                    group.offsetX += snap.snapDelta.x;
                    group.offsetY += snap.snapDelta.y;
                    showSnapIndicator(snap.snapPoint);
                } else {
                    clearSnapIndicators();
                }
            }

            const groupG = svg.querySelector(`g[data-group-id="${selectedGroupId}"]`);
            if (groupG) {
                groupG.setAttribute('transform', `translate(${group.offsetX}, ${group.offsetY})`);
            }

            showGroupHighlight(selectedGroupId);
        }
        return;
    }

    if (isDragSelecting && selectionBoxEl) {
        const rect = previewArea.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const width = Math.abs(currentX - dragSelectStartX);
        const height = Math.abs(currentY - dragSelectStartY);

        if (width > 5 && height > 5) {
            didDragSelect = true;
            selectionBoxEl.style.display = 'block';

            const left = Math.min(dragSelectStartX, currentX);
            const top = Math.min(dragSelectStartY, currentY);

            selectionBoxEl.style.left = left + 'px';
            selectionBoxEl.style.top = top + 'px';
            selectionBoxEl.style.width = width + 'px';
            selectionBoxEl.style.height = height + 'px';
        }
    }
}

function handleMouseUp(e) {
    if (isPanning) {
        isPanning = false;
        previewArea.classList.remove('panning');
        return;
    }

    if (isMovingGroup) {
        isMovingGroup = false;
        previewArea.classList.remove('dragging-group');
        clearSnapIndicators();

        if (didStartMove) {
            rebuildCanvas(false);
            if (selectedGroupId !== null) {
                showGroupHighlight(selectedGroupId);
            }
        }
        didStartMove = false;
        return;
    }

    if (isDragSelecting) {
        const svgElement = previewArea.querySelector('svg');

        if (didDragSelect && selectionBoxEl && svgElement) {
            const boxRect = selectionBoxEl.getBoundingClientRect();

            if (!e.shiftKey) {
                selectedElements.forEach(selected => selected.classList.remove('selected'));
                selectedElements.clear();
            }

            const allSelectables = svgElement.querySelectorAll('.selectable');
            allSelectables.forEach(el => {
                const elRect = el.getBoundingClientRect();
                if (elRect.left < boxRect.right &&
                    elRect.right > boxRect.left &&
                    elRect.top < boxRect.bottom &&
                    elRect.bottom > boxRect.top) {
                    el.classList.add('selected');
                    selectedElements.add(el);
                }
            });

            updateSelectionInfo();
        } else if (!didDragSelect) {
            const target = dragSelectStartTarget;

            if (target && target.classList.contains('selectable')) {
                selectElement(target, e.shiftKey);
            } else if (target && target.classList.contains('hit-area')) {
                const el = elementMap.get(target);
                if (el) selectElement(el, e.shiftKey);
            } else {
                if (!e.shiftKey) {
                    clearSelection();
                }
            }
        }

        if (selectionBoxEl) {
            selectionBoxEl.remove();
            selectionBoxEl = null;
        }
        isDragSelecting = false;
        didDragSelect = false;
        dragSelectStartTarget = null;
    }
}

function handleDblClick(e) {
    if (moveMode) return;

    let targetElement = null;
    if (e.target.classList.contains('selectable')) {
        targetElement = e.target;
    } else if (e.target.classList.contains('hit-area')) {
        targetElement = elementMap.get(e.target);
    }

    if (targetElement) {
        e.preventDefault();
        e.stopPropagation();
        selectConnectedChain(targetElement, e.shiftKey);
    }
}

function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
            return;
        }
        if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
            e.preventDefault();
            redo();
            return;
        }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElements.size > 0) {
            e.preventDefault();
            deleteSelection();
        }
    }
}

// ============================================
// Event Listener Setup
// ============================================

// Dropzone
dropzone.addEventListener('click', function(e) {
    if (e.target !== fileInput) {
        fileInput.click();
    }
});

dropzone.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFiles(files);
    }
});

fileInput.addEventListener('change', function(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFiles(files);
    }
    fileInput.value = '';
});

// Controls
downloadBtn.addEventListener('click', downloadSvg);
downloadDxfBtn.addEventListener('click', downloadDxf);
sendToGfBtn.addEventListener('click', sendToGlowforge);
removeDuplicatesBtn.addEventListener('click', findOverlaps);
removeOverlapsBtn.addEventListener('click', removeOverlaps);
dupToleranceSelect.addEventListener('change', function() {
    duplicateTolerance = parseFloat(dupToleranceSelect.value);
});

unitSelect.addEventListener('change', function() {
    if (importedGroups.length > 0) {
        rebuildCanvas(false);
    }
});

// Bed controls
bedToggleBtn.addEventListener('click', function() {
    bedEnabled = !bedEnabled;
    bedToggleBtn.textContent = bedEnabled ? 'Bed: ON' : 'Bed: OFF';
    bedToggleBtn.classList.toggle('active', bedEnabled);
    document.querySelectorAll('.bed-control').forEach(el => {
        el.style.display = bedEnabled ? '' : 'none';
    });
    if (bedEnabled) {
        bedWidthInput.value = bedWidth;
        bedHeightInput.value = bedHeight;
    }
    if (importedGroups.length > 0) {
        rebuildCanvas(true);
    }
});

bedPresetSelect.addEventListener('change', function() {
    if (bedPresetSelect.value === 'glowforge') {
        const unit = unitSelect.value;
        if (unit === 'in') {
            bedWidth = 19.5;
            bedHeight = 11;
        } else {
            bedWidth = 495.3;
            bedHeight = 279.4;
        }
        bedWidthInput.value = bedWidth;
        bedHeightInput.value = bedHeight;
    }
    if (importedGroups.length > 0) {
        rebuildCanvas(true);
    }
});

bedWidthInput.addEventListener('change', function() {
    bedWidth = parseFloat(bedWidthInput.value) || 0;
    bedPresetSelect.value = 'custom';
    if (importedGroups.length > 0) {
        rebuildCanvas(false);
    }
});

bedHeightInput.addEventListener('change', function() {
    bedHeight = parseFloat(bedHeightInput.value) || 0;
    bedPresetSelect.value = 'custom';
    if (importedGroups.length > 0) {
        rebuildCanvas(false);
    }
});

autoPlaceMarginInput.addEventListener('change', function() {
    autoPlaceMargin = parseFloat(autoPlaceMarginInput.value) || 0;
});

autoPlaceBtn.addEventListener('click', autoPlace);

// Undo/Redo buttons
document.getElementById('undoBtn').addEventListener('click', undo);
document.getElementById('redoBtn').addEventListener('click', redo);

// Color toolbar
colorSwatches.addEventListener('click', function(e) {
    const swatch = e.target.closest('.color-swatch');
    if (swatch) {
        applyColorToSelection(swatch.dataset.color);
    }
});

customColor.addEventListener('input', function() {
    if (selectedElements.size > 0) {
        applyColorToSelection(customColor.value);
    }
});

clearSelectionBtn.addEventListener('click', clearSelection);
deleteSelectionBtn.addEventListener('click', deleteSelection);

// File list actions (event delegation)
document.getElementById('fileList').addEventListener('click', function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const groupId = parseInt(btn.dataset.groupId);

    if (action === 'select') {
        const svg = previewArea.querySelector('svg');
        if (!svg) return;
        const groupG = svg.querySelector(`g[data-group-id="${groupId}"]`);
        if (!groupG) return;

        clearSelection();
        groupG.querySelectorAll('.selectable').forEach(el => {
            el.classList.add('selected');
            selectedElements.add(el);
        });
        updateSelectionInfo();
    } else if (action === 'ungroup') {
        ungroupFile(groupId);
    } else if (action === 'remove') {
        saveUndoState();
        importedGroups = importedGroups.filter(g => g.id !== groupId);
        for (const [key] of colorOverrides) {
            if (key.startsWith(`${groupId}-`)) {
                colorOverrides.delete(key);
            }
        }
        rebuildCanvas(true);
    }
});

document.getElementById('fileList').addEventListener('change', function(e) {
    if (e.target.classList.contains('group-checkbox')) {
        updateGroupButton();
    }
});

groupSelectedBtn.addEventListener('click', function() {
    const checked = document.querySelectorAll('.group-checkbox:checked');
    const ids = Array.from(checked).map(cb => parseInt(cb.dataset.groupId));
    groupSelectedFiles(ids);
});

clearAllBtn.addEventListener('click', function() {
    if (importedGroups.length === 0) return;
    saveUndoState();
    importedGroups = [];
    groupIdCounter = 0;
    colorOverrides.clear();
    selectedGroupId = null;
    rebuildCanvas(true);
});

// Move mode
document.getElementById('snapToggleBtn').addEventListener('click', function() {
    snapEnabled = !snapEnabled;
    this.textContent = snapEnabled ? 'Snap: ON' : 'Snap: OFF';
    this.classList.toggle('active', snapEnabled);
});

moveModeBtn.addEventListener('click', function() {
    moveMode = !moveMode;
    moveModeBtn.textContent = moveMode ? 'Move: ON' : 'Move: OFF';
    moveModeBtn.classList.toggle('active', moveMode);

    if (moveMode) {
        clearSelection();
        previewArea.classList.add('move-mode');
    } else {
        selectedGroupId = null;
        clearGroupHighlight();
        previewArea.classList.remove('move-mode');
        previewArea.classList.remove('dragging-group');
    }
});

// Reset view
resetViewBtn.addEventListener('click', function() {
    if (!baseViewBox) return;
    viewCenterX = baseViewBox.x + baseViewBox.w / 2;
    viewCenterY = baseViewBox.y + baseViewBox.h / 2;
    viewZoom = 1;
    updateViewBox();
});

// Viewport: wheel zoom
previewArea.addEventListener('wheel', handleWheel, { passive: false });

// Interaction: mouse events
previewArea.addEventListener('mousedown', handleMouseDown);
previewArea.addEventListener('dblclick', handleDblClick);
document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('keydown', handleKeyDown);

// Prevent context menu on middle-click
previewArea.addEventListener('contextmenu', function(e) {
    if (e.button === 1) e.preventDefault();
});
