class Sequence {
    constructor() {
        this._statements = [];
    }

    get statements() {
        return this._statements;
    }

    addStatement(statement) {
        this._statements.push(statement);
    }
}

class Diagram extends Sequence {
    constructor() {
        super();
        this._participants = {};
        this._aliases = {};
    }

    participant(name) {
        return this._participants[name];
    }

    alias(alias) {
        return this._aliases[alias];
    }

    addParticipant(name, role) {
        if (role === undefined) {
            role = 'entity';
        }
        this._participants[name] = role;
    }

    addAlias(alias, name) {
        this._aliases[alias] = name;
    }
}

class Signal {
    constructor(from) {
        this.from = from;
        this.tail = null;
        this.to = null;
        this.head = null;
        this.dotted = false;
    }
}

class ConditionalBlock extends Sequence {
    constructor(label) {
        super();
        // e.g., "opt", "alt", "else"
        this.label = label;
        this.condition = null;
    }
}

class AltBlock {
    constructor() {
        // Array of ConditionalBlock
        this._conditionals = [];
    }

    get conditionals() {
        return this._conditionals;
    }

    addConditional(block) {
        this._conditionals.push(block);
    }
}

module.exports = {
    Sequence: Sequence,
    Diagram: Diagram,
    Signal: Signal,
    ConditionalBlock: ConditionalBlock,
    AltBlock: AltBlock,
};
