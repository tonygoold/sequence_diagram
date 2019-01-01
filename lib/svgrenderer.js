const layout = require('./layout');

class SVGRenderer {
    constructor(layout) {
        this._layout = layout;
        this._lifelineOffsets = {};
    }

    render() {
        // First pass: Determine horizontal positions of lifelines
        const minLifelineSpacing = 60.0;
        var offset = 30.0;
        var diagramHeight = 0.0;
        this._layout.lifelines.forEach(lifeline => {
            this._lifelineOffsets[lifeline.id] = offset;
            offset += minLifelineSpacing;
            lifeline.activationBoxes.forEach(box => {
                if (box.start + box.height > diagramHeight) {
                    diagramHeight = box.start + box.height;
                }
            });
        });
        diagramHeight += 30.0;

        var output = '<?xml version="1.0" encoding="UTF-8"?>'
            + "\n"
            + '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" stroke="black" fill="white">'
            + "\n";
        // Place activation boxes
        this._layout.lifelines.forEach(lifeline => {
            const midline = this._lifelineOffsets[lifeline.id];
            // TODO: Draw the midline from start to end
            output += '<line x1="' + midline + '" y1="' + 0.0 + '" x2="' + midline + '" y2="' + diagramHeight + '" stroke-dasharray="4,4"/>' + "\n";
            lifeline.activationBoxes.forEach(box => {
                const x = midline - (box.width * 0.5) + box.inset;
                const y = box.start;
                const w = box.width;
                const h = box.height;
                output += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>' + "\n";
            });
        });
        // Place the arrows
        this._layout.arrows.forEach(arrow => {
            var x1 = this._lifelineOffsets[arrow.start.line.id];
            var x2 = this._lifelineOffsets[arrow.end.line.id];
            const isLeft = x1 > x2;
            const isSelf = x1 == x2;
            if (arrow.start.box) {
                x1 += arrow.start.box.inset + arrow.start.box.width * (isLeft ? -0.5 : 0.5);
            }
            if (arrow.end.box) {
                x2 += arrow.end.box.inset + arrow.end.box.width * ((isLeft || isSelf) ? 0.5 : -0.5);
            }
            output += '<line x1="' + x1 + '" y1="' + arrow.start.y + '" x2="' + x2 + '" y2="' + arrow.end.y + '"';
            if (arrow.dotted) {
                output += ' stroke-dasharray="2,2"';
            }
            output += '/>' + "\n";
            // TODO: Add label
        });
        output += "</svg>\n";
        return output;
    }
}

function renderLayout(layout) {
    return new SVGRenderer(layout).render();
}

module.exports = {
    render: renderLayout,
};
