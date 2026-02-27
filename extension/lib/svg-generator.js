// SVG Generator - extracted from index.html
// Generates SVG markup from entity groups

export class SvgGenerator {
    calculateBoundsForEntities(entities, offsetX = 0, offsetY = 0) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        const updateBounds = (x, y) => {
            x += offsetX;
            y += offsetY;
            if (isFinite(x) && isFinite(y)) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        };

        for (const entity of entities) {
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
                case 'ELLIPSE': {
                    const majorLen = Math.sqrt(entity.majorAxis.x ** 2 + entity.majorAxis.y ** 2);
                    const minorLen = majorLen * entity.ratio;
                    updateBounds(entity.center.x - majorLen, entity.center.y - minorLen);
                    updateBounds(entity.center.x + majorLen, entity.center.y + minorLen);
                    break;
                }
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

    calculateCompositeBounds(groups) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const group of groups) {
            const b = this.calculateBoundsForEntities(group.entities, group.offsetX, group.offsetY);
            if (isFinite(b.minX)) {
                minX = Math.min(minX, b.minX);
                minY = Math.min(minY, b.minY);
                maxX = Math.max(maxX, b.maxX);
                maxY = Math.max(maxY, b.maxY);
            }
        }

        if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }
        return { minX, minY, maxX, maxY };
    }

    generateCompositeSvg(groups, colorOverrides, scale = 1, forExport = false) {
        const bounds = this.calculateCompositeBounds(groups);
        const { minX, minY, maxX, maxY } = bounds;
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = forExport ? 0 : Math.max(width, height) * 0.02;

        let groupsContent = '';
        for (const group of groups) {
            const content = this.generateGroupContent(group, colorOverrides, forExport);
            if (forExport) {
                groupsContent += `    <g transform="translate(${group.offsetX}, ${group.offsetY})">\n${content}    </g>\n`;
            } else {
                groupsContent += `    <g data-group-id="${group.id}" transform="translate(${group.offsetX}, ${group.offsetY})">\n${content}    </g>\n`;
            }
        }

        const vbX = minX - padding;
        const vbY = -(maxY + padding);
        const vbW = width + padding * 2;
        const vbH = height + padding * 2;

        const xmlDecl = forExport ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '';
        const sizeAttrs = forExport
            ? `width="${(width * scale).toFixed(2)}mm" height="${(height * scale).toFixed(2)}mm"`
            : '';

        return `${xmlDecl}<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
     ${sizeAttrs}>
  <g transform="scale(1, -1)" stroke="${forExport ? '#000000' : 'currentColor'}" stroke-width="0.5" fill="none">
${groupsContent}  </g>
</svg>`;
    }

    generateGroupContent(group, colorOverrides, forExport) {
        let content = '';
        for (let i = 0; i < group.entities.length; i++) {
            content += this.entityToSvg(group.entities[i], group.id, i, colorOverrides, forExport);
        }
        return content;
    }

    entityToSvg(entity, groupId, entityIndex, colorOverrides, forExport) {
        let extraAttrs = '';
        const colorKey = `${groupId}-${entityIndex}`;
        if (colorOverrides && colorOverrides.has(colorKey)) {
            extraAttrs += ` stroke="${colorOverrides.get(colorKey)}"`;
        }
        if (!forExport) {
            extraAttrs += ` data-element-id="${entityIndex}"`;
        }

        switch (entity.type) {
            case 'LINE':
                return this.lineToSvg(entity, extraAttrs, forExport);
            case 'CIRCLE':
                return this.circleToSvg(entity, extraAttrs, forExport);
            case 'ARC':
                return this.arcToSvg(entity, extraAttrs, forExport);
            case 'ELLIPSE':
                return this.ellipseToSvg(entity, extraAttrs, forExport);
            case 'SPLINE':
                return this.splineToSvg(entity, extraAttrs, forExport);
            default:
                return '';
        }
    }

    lineToSvg(entity, extraAttrs, forExport) {
        const ep = forExport ? '' : ` data-start-x="${entity.start.x}" data-start-y="${entity.start.y}" data-end-x="${entity.end.x}" data-end-y="${entity.end.y}"`;
        return `      <line x1="${entity.start.x}" y1="${entity.start.y}" x2="${entity.end.x}" y2="${entity.end.y}"${ep}${extraAttrs}/>\n`;
    }

    circleToSvg(entity, extraAttrs, forExport) {
        const ep = forExport ? '' : ' data-closed="true"';
        return `      <circle cx="${entity.center.x}" cy="${entity.center.y}" r="${entity.radius}"${ep}${extraAttrs}/>\n`;
    }

    arcToSvg(entity, extraAttrs, forExport) {
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

        const ep = forExport ? '' : ` data-start-x="${x1}" data-start-y="${y1}" data-end-x="${x2}" data-end-y="${y2}"`;
        return `      <path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}"${ep}${extraAttrs}/>\n`;
    }

    ellipseToSvg(entity, extraAttrs, forExport) {
        const { center, majorAxis, ratio, startAngle, endAngle } = entity;
        const rx = Math.sqrt(majorAxis.x ** 2 + majorAxis.y ** 2);
        const ry = rx * ratio;
        const rotation = Math.atan2(majorAxis.y, majorAxis.x) * 180 / Math.PI;

        if (Math.abs(endAngle - startAngle - Math.PI * 2) < 0.01 || (startAngle === 0 && endAngle === 0)) {
            const ep = forExport ? '' : ' data-closed="true"';
            return `      <ellipse cx="${center.x}" cy="${center.y}" rx="${rx}" ry="${ry}" transform="rotate(${rotation} ${center.x} ${center.y})"${ep}${extraAttrs}/>\n`;
        }

        const x1 = center.x + rx * Math.cos(startAngle);
        const y1 = center.y + ry * Math.sin(startAngle);
        const x2 = center.x + rx * Math.cos(endAngle);
        const y2 = center.y + ry * Math.sin(endAngle);

        let sweepAngle = endAngle - startAngle;
        if (sweepAngle < 0) sweepAngle += Math.PI * 2;
        const largeArc = sweepAngle > Math.PI ? 1 : 0;

        const ep = forExport ? '' : ` data-start-x="${x1}" data-start-y="${y1}" data-end-x="${x2}" data-end-y="${y2}"`;
        return `      <path d="M ${x1} ${y1} A ${rx} ${ry} ${rotation} ${largeArc} 1 ${x2} ${y2}"${ep}${extraAttrs}/>\n`;
    }

    splineToSvg(entity, extraAttrs, forExport) {
        if (entity.controlPoints.length < 2) return '';

        const points = this.interpolateSpline(entity.controlPoints, entity.degree);

        const startX = points[0].x;
        const startY = points[0].y;
        const endX = points[points.length - 1].x;
        const endY = points[points.length - 1].y;

        let d = `M ${startX} ${startY}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i].x} ${points[i].y}`;
        }

        const ep = forExport ? '' : ` data-start-x="${startX}" data-start-y="${startY}" data-end-x="${endX}" data-end-y="${endY}"`;
        return `      <path d="${d}"${ep}${extraAttrs}/>\n`;
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
