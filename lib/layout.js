const ast = require('./ast');

class LayoutConfig {
    constructor() {
        // Arbitrary values for testing purposes
        this.fontSize = 16.0;
        this.lifelineWidth = 32.0;
        this.lifelineInset = 8.0;
    }
}

class Layout {
    constructor(lifelines, arrows) {
        this.lifelines = lifelines;
        this.arrows = arrows;
    }
}

class LayoutEngine {
    constructor(diagram) {
        this._config = new LayoutConfig();
        this._diagram = diagram;
    }

    layout() {
        this._lifelines = [];
        this._arrows = [];
        this._bodyHeight = 0.0;

        this.layoutSequence(this._diagram);
        return new Layout(this._lifelines, this._arrows);
    }

    layoutSequence(sequence) {
        sequence.statements.forEach(stmt => {
            if (stmt instanceof ast.Signal) {
                this.layoutSignal(stmt);
            }
            // Ignoring other cases for now
        });
    }

    layoutSignal(signal) {
        const fromName = this.dealias(signal.from);
        const from = this.lifeline(fromName);
        const toName = this.dealias(signal.to);
        const to = this.lifeline(toName);

        this.growBy(this.topMarginForSignal(signal));
        const start = this.bodyHeight;

        const startAnchor = new Anchor(from, from.activeBox, start);
        if (signal.deactivating) {
            from.deactivate(start);
        }

        this.growBy(this.heightForSignal(signal));
        const end = this.bodyHeight;

        if (signal.activating) {
            to.activate(end);
        }
        const endAnchor = new Anchor(to, to.activeBox, end);

        this.growBy(this.bottomMarginForSignal(signal));

        const arrow = new Arrow(startAnchor, endAnchor, signal.message);
        if (signal.dotted) {
            arrow.dotted = true;
        }
        this._arrows.push(arrow);
    }

    dealias(id) {
        const alias = this._diagram.alias(id);
        return alias ? alias : id;
    }

    lifeline(id) {
        var lifeline = this._lifelines.find(lf => lf.id === id);
        if (!lifeline) {
            lifeline = new Lifeline(id, this._config);
            this._lifelines.push(lifeline);
        }
        return lifeline;
    }

    growBy(height) {
        if (height === 0.0) {
            return;
        }
        this._lifelines.forEach(lifeline => lifeline.growBy(height));
        this._bodyHeight += height;
    }

    get bodyHeight() {
        return this._bodyHeight;
    }

    // The vertical space above the starting anchor point for the signal
    topMarginForSignal(signal) {
        // Temporary choice for testing purposes
        return this._config.fontSize * 1.25;
    }

    // The difference in height between the starting and ending anchor points
    // for the signal
    heightForSignal(signal) {
        if (signal.from === signal.to) {
            // Temporary choice for testing purposes
            return this._config.fontSize;
        }
        return 0.0;
    }

    // The vertical space below the ending anchor point for the signal
    bottomMarginForSignal(signal) {
        return this._config.fontSize;
    }
}

class Lifeline {
    constructor(id, config) {
        this._id = id;
        this._config = config;
        this._activationBoxes = [];
        this._activeStack = [];
    }

    get id() {
        return this._id;
    }

    get activationBoxes() {
        // TODO: Return a copy
        return this._activationBoxes;
    }

    get activeBox() {
        if (this._activeStack.length > 0) {
            return this._activeStack[this._activeStack.length - 1];
        }
        return null;
    }

    activate(start) {
        var box = new ActivationBox(start, this._config.lifelineWidth);
        const lastBox = this.activeBox;
        if (lastBox) {
            box.inset = lastBox.inset + this._config.lifelineInset;
        }
        this._activationBoxes.push(box);
        this._activeStack.push(box);
    }

    deactivate(height) {
        this._activeStack.pop();
    }

    growBy(height) {
        this._activeStack.forEach(box => box.growBy(height));
    }
}

class Arrow {
    constructor(start, end, label) {
        this.start = start;
        this.end = end;
        this.label = label;
        this.dotted = false;
    }
}

class ActivationBox {
    constructor(start, width) {
        this.start = start;
        this.width = width;
        this.height = 0.0;
        this.inset = 0.0;
    }

    growBy(height) {
        this.height += height;
    }
}

class Anchor {
    constructor(line, box, y) {
        this.line = line;
        this.box = box;
        this.y = y;
    }
}

module.exports = {
    LayoutConfig: LayoutConfig,
    Layout: Layout,
    LayoutEngine: LayoutEngine,
    Lifeline: Lifeline,
    Arrow: Arrow,
    ActivationBox: ActivationBox,
};
