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
