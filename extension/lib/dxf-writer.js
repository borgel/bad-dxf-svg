// DXF Writer - extracted from index.html
// Generates DXF file content from entity groups

export class DxfWriter {
    constructor(groups, colorOverrides) {
        this.groups = groups;
        this.colorOverrides = colorOverrides;
        this.output = '';
    }

    generate() {
        this.writeHeader();
        this.writeEntitiesSection();
        this.output += '  0\nEOF\n';
        return this.output;
    }

    writeCode(code, value) {
        const codeStr = code.toString();
        const padding = codeStr.length >= 3 ? '' : codeStr.length === 2 ? ' ' : '  ';
        this.output += padding + codeStr + '\n' + value + '\n';
    }

    writeHeader() {
        this.writeCode(0, 'SECTION');
        this.writeCode(2, 'HEADER');
        this.writeCode(9, '$ACADVER');
        this.writeCode(1, 'AC1009');
        this.writeCode(9, '$INSUNITS');
        this.writeCode(70, '4');
        this.writeCode(0, 'ENDSEC');
    }

    writeEntitiesSection() {
        this.writeCode(0, 'SECTION');
        this.writeCode(2, 'ENTITIES');

        for (const group of this.groups) {
            for (let i = 0; i < group.entities.length; i++) {
                const entity = group.entities[i];
                const colorKey = `${group.id}-${i}`;
                const color = this.colorOverrides.get(colorKey);
                const aci = color ? this.hexToAci(color) : null;
                this.writeEntity(entity, group.offsetX, group.offsetY, aci);
            }
        }

        this.writeCode(0, 'ENDSEC');
    }

    writeEntity(entity, ox, oy, aci) {
        switch (entity.type) {
            case 'LINE':
                this.writeCode(0, 'LINE');
                this.writeCode(8, '0');
                if (aci !== null) this.writeCode(62, aci);
                this.writeCode(10, (entity.start.x + ox).toFixed(6));
                this.writeCode(20, (entity.start.y + oy).toFixed(6));
                this.writeCode(11, (entity.end.x + ox).toFixed(6));
                this.writeCode(21, (entity.end.y + oy).toFixed(6));
                break;

            case 'CIRCLE':
                this.writeCode(0, 'CIRCLE');
                this.writeCode(8, '0');
                if (aci !== null) this.writeCode(62, aci);
                this.writeCode(10, (entity.center.x + ox).toFixed(6));
                this.writeCode(20, (entity.center.y + oy).toFixed(6));
                this.writeCode(40, entity.radius.toFixed(6));
                break;

            case 'ARC':
                this.writeCode(0, 'ARC');
                this.writeCode(8, '0');
                if (aci !== null) this.writeCode(62, aci);
                this.writeCode(10, (entity.center.x + ox).toFixed(6));
                this.writeCode(20, (entity.center.y + oy).toFixed(6));
                this.writeCode(40, entity.radius.toFixed(6));
                this.writeCode(50, entity.startAngle.toFixed(6));
                this.writeCode(51, entity.endAngle.toFixed(6));
                break;

            case 'ELLIPSE':
                this.writeCode(0, 'ELLIPSE');
                this.writeCode(8, '0');
                if (aci !== null) this.writeCode(62, aci);
                this.writeCode(10, (entity.center.x + ox).toFixed(6));
                this.writeCode(20, (entity.center.y + oy).toFixed(6));
                this.writeCode(30, '0.0');
                this.writeCode(11, entity.majorAxis.x.toFixed(6));
                this.writeCode(21, entity.majorAxis.y.toFixed(6));
                this.writeCode(31, '0.0');
                this.writeCode(40, entity.ratio.toFixed(6));
                this.writeCode(41, entity.startAngle.toFixed(6));
                this.writeCode(42, entity.endAngle.toFixed(6));
                break;

            case 'SPLINE':
                this.writeCode(0, 'SPLINE');
                this.writeCode(8, '0');
                if (aci !== null) this.writeCode(62, aci);
                this.writeCode(70, '8');
                const deg = entity.degree || 3;
                this.writeCode(71, deg);
                const n = entity.controlPoints.length;
                let knots = entity.knots;
                if (!knots || knots.length === 0) {
                    const numKnots = n + deg + 1;
                    knots = [];
                    for (let k = 0; k < numKnots; k++) {
                        if (k <= deg) knots.push(0.0);
                        else if (k >= n) knots.push(1.0);
                        else knots.push((k - deg) / (n - deg));
                    }
                }
                this.writeCode(72, knots.length);
                this.writeCode(73, n);
                for (const k of knots) {
                    this.writeCode(40, k.toFixed(6));
                }
                for (const pt of entity.controlPoints) {
                    this.writeCode(10, (pt.x + ox).toFixed(6));
                    this.writeCode(20, (pt.y + oy).toFixed(6));
                    this.writeCode(30, '0.0');
                }
                break;
        }
    }

    hexToAci(hex) {
        const map = {
            '#000000': 7, '#FF0000': 1, '#00FF00': 3, '#0000FF': 5,
            '#FF00FF': 6, '#00FFFF': 4, '#FFA500': 30, '#800080': 218
        };
        return map[hex.toUpperCase()] || 7;
    }
}
