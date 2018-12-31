const assert = require('assert');
const stream = require('stream');
const { Parser, Token, ast } = require('../lib');

function makesig(from, to, dotted, head, tail) {
    const signal = new ast.Signal(from);
    signal.to = to;
    signal.dotted = dotted;
    if (head) {
        signal.head = head;
    }
    if (tail) {
        signal.tail = tail;
    }
    return signal;
}

describe('Basic parsing', () => {
    it('can parse empty diagram', () => {
        const parser = new Parser([]);
        assert.doesNotThrow(() => parser.parse());
    });
});
describe('Parser declarations', () => {
    it('title', () => {
        const title = 'some text';
        const parser = new Parser([
            new Token(Token.Type.KW_TITLE),
            new Token(Token.Type.TEXT, title),
        ]);
        const diagram = parser.parse();
        assert.strictEqual(diagram.title, title);
    });
    it('participant', () => {
        const name = 'actor name';
        const parser = new Parser([
            new Token(Token.Type.KW_PARTICIPANT),
            new Token(Token.Type.IDENTIFIER, name),
        ]);
        const diagram = parser.parse();
        assert.notEqual(diagram.participant(name), null);
    });
    it('participant with alias', () => {
        const name = 'actor name';
        const alias = 'alternate name';
        const parser = new Parser([
            new Token(Token.Type.KW_PARTICIPANT),
            new Token(Token.Type.IDENTIFIER, name),
            new Token(Token.Type.KW_AS),
            new Token(Token.Type.IDENTIFIER, alias),
        ]);
        const diagram = parser.parse();
        assert.strictEqual(diagram.alias(alias), name);
    });
});
describe('Parser signal arrows', () => {
    const pa = 'participant A';
    const pb = 'participant B';
    const cases = [
        [ 'normal ->', makesig(pa, pb, false, 'closed', null) ],
        [ 'dotted -->', makesig(pa, pb, true, 'closed', null) ],
        [ 'open head ->>', makesig(pa, pb, false, 'open', null) ],
        [ 'tail <-', makesig(pa, pb, false, null, 'closed') ],
        [ 'open tail <<-', makesig(pa, pb, false, null, 'open') ],
        [ 'bidi <->', makesig(pa, pb, false, 'closed', 'closed') ],
        [ 'dotted bidi <-->', makesig(pa, pb, true, 'closed', 'closed') ],
        [ 'open bidi <<->>', makesig(pa, pb, false, 'open', 'open') ],
    ];
    for (const c of cases) {
        it(c[0], () => {
            const signal = c[1];
            var tokens = [ new Token(Token.Type.IDENTIFIER, pa) ];
            if (signal.tail === 'closed') {
                tokens.push(new Token(Token.Type.OP_ARROW_LEFT));
            } else if (signal.tail === 'open') {
                tokens.push(new Token(Token.Type.OP_ARROW_LEFT_OPEN));
            }
            if (signal.dotted) {
                tokens.push(new Token(Token.Type.OP_ARROW_BODY_DOTTED));
            } else {
                tokens.push(new Token(Token.Type.OP_ARROW_BODY));
            }
            if (signal.head === 'closed') {
                tokens.push(new Token(Token.Type.OP_ARROW_RIGHT));
            } else if (signal.head === 'open') {
                tokens.push(new Token(Token.Type.OP_ARROW_RIGHT_OPEN));
            }
            tokens.push(new Token(Token.Type.IDENTIFIER, pb));

            const parser = new Parser(tokens);
            const statements = parser.parse().statements;
            assert.deepEqual(statements, [ signal ]);
        });
    }
});
describe('Parser signal messages', () => {
    it('signal with message', () => {
        const pa = 'participant A';
        const pb = 'participant B';
        const tokens = [
            new Token(Token.Type.IDENTIFIER, pa),
            new Token(Token.Type.OP_ARROW_BODY),
            new Token(Token.Type.OP_ARROW_RIGHT),
            new Token(Token.Type.IDENTIFIER, pb),
            new Token(Token.Type.COLON),
            new Token(Token.Type.TEXT, 'Message'),
        ];
        const parser = new Parser(tokens);
        const statements = parser.parse().statements;
        assert.ok(statements.length > 0, 'No statements parsed');
        const signal = statements[0];
        assert.strictEqual(signal.from, pa);
        assert.strictEqual(signal.to, pb);
        assert.strictEqual(signal.message, 'Message');
    });
});
describe('Parser sequences', () => {
    it('multiple statements', () => {
        const pa = 'participant A';
        const pb = 'participant B';
        const tokens = [
            new Token(Token.Type.IDENTIFIER, pa),
            new Token(Token.Type.OP_ARROW_BODY),
            new Token(Token.Type.OP_ARROW_RIGHT),
            new Token(Token.Type.IDENTIFIER, pb),
            new Token(Token.Type.COLON),
            new Token(Token.Type.TEXT, 'Message from A to B'),
            new Token(Token.Type.IDENTIFIER, pb),
            new Token(Token.Type.OP_ARROW_BODY_DOTTED),
            new Token(Token.Type.OP_ARROW_RIGHT),
            new Token(Token.Type.IDENTIFIER, pa),
            new Token(Token.Type.COLON),
            new Token(Token.Type.TEXT, 'Return from B to A'),
        ];
        const parser = new Parser(tokens);
        const statements = parser.parse().statements;
        assert.strictEqual(statements.length, 2);
    });
});
describe('Parser conditionals', () => {
    it('opt', () => {
        const tokens = [
            new Token(Token.Type.KW_OPT),
            new Token(Token.Type.KW_END),
        ];
        const parser = new Parser(tokens);
        const statements = parser.parse().statements;
        assert.ok(statements.length > 0, 'No statements parsed');
        const block = statements[0];
        assert.strictEqual(block.label, 'opt');
        assert.strictEqual(block.condition, null);
        assert.strictEqual(block.statements.length, 0);
    });
    it('opt with condition', () => {
        const condition = 'the condition';
        const tokens = [
            new Token(Token.Type.KW_OPT),
            new Token(Token.Type.TEXT, condition),
            new Token(Token.Type.KW_END),
        ];
        const parser = new Parser(tokens);
        const statements = parser.parse().statements;
        assert.ok(statements.length > 0, 'No statements parsed');
        const block = statements[0];
        assert.strictEqual(block.label, 'opt');
        assert.strictEqual(block.condition, condition);
        assert.strictEqual(block.statements.length, 0);
    });
    it('opt body', () => {
        const signal = makesig('A', 'B', false, 'closed', null);
        const tokens = [
            new Token(Token.Type.KW_OPT),
            new Token(Token.Type.IDENTIFIER, signal.from),
            new Token(Token.Type.OP_ARROW_BODY),
            new Token(Token.Type.OP_ARROW_RIGHT),
            new Token(Token.Type.IDENTIFIER, signal.to),
            new Token(Token.Type.KW_END),
        ];
        const parser = new Parser(tokens);
        const statements = parser.parse().statements;
        assert.ok(statements.length > 0, 'No statements parsed');
        const block = statements[0];
        assert.deepEqual(block.statements, [ signal ]);
    });
    it('alt', () => {
        const tokens = [
            new Token(Token.Type.KW_ALT),
            new Token(Token.Type.KW_END),
        ];
        const parser = new Parser(tokens);
        const statements = parser.parse().statements;
        assert.ok(statements.length > 0, 'No statements parsed');
        const altBlock = statements[0];
        assert.strictEqual(altBlock.conditionals.length, 1);
        const block = altBlock.conditionals[0];
        assert.strictEqual(block.label, 'alt');
        assert.strictEqual(block.statements.length, 0);
    });
    it('alt with condition', () => {
        const condition = 'the condition';
        const tokens = [
            new Token(Token.Type.KW_ALT),
            new Token(Token.Type.TEXT, condition),
            new Token(Token.Type.KW_END),
        ];
        const parser = new Parser(tokens);
        const statements = parser.parse().statements;
        assert.ok(statements.length > 0, 'No statements parsed');
        const altBlock = statements[0];
        assert.strictEqual(altBlock.conditionals.length, 1);
        const block = altBlock.conditionals[0];
        assert.strictEqual(block.label, 'alt');
        assert.strictEqual(block.condition, condition);
        assert.strictEqual(block.statements.length, 0);
    });
    it('alt-else', () => {
        const tokens = [
            new Token(Token.Type.KW_ALT),
            new Token(Token.Type.KW_ELSE),
            new Token(Token.Type.KW_END),
        ];
        const parser = new Parser(tokens);
        const statements = parser.parse().statements;
        assert.ok(statements.length > 0, 'No statements parsed');
        const altBlock = statements[0];
        assert.strictEqual(altBlock.conditionals.length, 2);
        const elseBlock = altBlock.conditionals[1];
        assert.strictEqual(elseBlock.label, 'else');
        assert.strictEqual(elseBlock.statements.length, 0);
    });
});
