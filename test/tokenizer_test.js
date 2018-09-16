const assert = require('assert');
const stream = require('stream');
const { Tokenizer, Token } = require('../lib');

class StringStream extends stream.Readable {
    constructor(str) {
        super();
        this.str = str;
        this.offset = 0;
    }

    _read(size) {
        const len = this.str.length;
        if (this.offset >= len) {
            this.push(null);
        } else if (this.offset + size >= len) {
            this.push(this.str.substring(this.offset));
            this.offset = len;
        } else {
            this.push(this.str.substring(this.offset, size));
            this.offset += size;
        }
    }
}

function expectError(donefn) {
    return function(err) {
        try {
            assert.notStrictEqual(err, undefined);
            donefn();
        } catch (realerr) {
            donefn(realerr);
        }
    };
}

function tokenize(str, donefn, testfn) {
    var tokens = [];
    const tk = new Tokenizer(new StringStream(str));
    tk.on('token', token => tokens.push(token));
    tk.on('end', () => {
        try {
            assert.ok(tokens.length > 0, 'No tokens found');
            testfn(tokens);
            donefn();
        } catch (err) {
            donefn(err);
        }
    });
    tk.on('error', donefn);
    tk.tokenize();
}

describe('Read tokens', () => {
    describe('identifier', () => {
        const cases = [
            // [ test name, should pass, text to tokenize ]
            [ 'alphabetic', true, 'alpha' ],
            [ 'alphanumeric', true, 'alpha123' ],
            [ 'invalid', false, '123alpha' ],
        ];
        for (const c of cases) {
            it(c[0], (done) => {
                if (c[1] === false) {
                    tokenize(c[2], expectError(done), () => {});
                    return;
                }
                tokenize(c[2], done, (tokens) => {
                    assert.strictEqual(tokens[0].type, Token.Type.IDENTIFIER);
                    assert.strictEqual(tokens[0].value, c[2]);
                });
            });
        }
    });
    describe('keywords', () => {
        const keywords = [
            'title',
            'note',
            'right',
            'left',
            'over',
            'of',
            'participant',
            'as',
            'alt',
            'opt',
            'activate',
            'deactivate',
            'destroy',
        ];
        for (const keyword of keywords) {
            it(keyword, (done) => {
                tokenize(keyword, done, (tokens) => {
                    assert.ok(tokens[0].isKeyword);
                    assert.strictEqual(tokens[0].value, keyword);
                });
            });
        }
    });
    describe('arrow heads', () => {
        it('closed', (done) => {
            tokenize('>', done, (tokens) => {
                assert.strictEqual(tokens[0].type, Token.Type.OP_ARROW_RIGHT);
            });
        });
        it('open', (done) => {
            tokenize('>>', done, (tokens) => {
                assert.strictEqual(tokens[0].type, Token.Type.OP_ARROW_RIGHT_OPEN);
            });
        });
    });
    describe('arrow body', () => {
        it('normal', (done) => {
            tokenize('-', done, (tokens) => {
                assert.strictEqual(tokens[0].type, Token.Type.OP_ARROW_BODY);
            });
        });
        it('dotted', (done) => {
            tokenize('--', done, (tokens) => {
                assert.strictEqual(tokens[0].type, Token.Type.OP_ARROW_BODY_DOTTED);
            });
        });
    });
    describe('arrow tails', () => {
        it('closed', (done) => {
            tokenize('<', done, (tokens) => {
                assert.strictEqual(tokens[0].type, Token.Type.OP_ARROW_LEFT);
            });
        });
        it('open', (done) => {
            tokenize('<<', done, (tokens) => {
                assert.strictEqual(tokens[0].type, Token.Type.OP_ARROW_LEFT_OPEN);
            });
        });
    });
    describe('other operators', () => {
        const cases = [
            [ 'comma', ',', Token.Type.COMMA ],
            [ 'colon', ':', Token.Type.COLON ],
            [ 'create', '*', Token.Type.OP_CREATE ],
        ];
        for (const c of cases) {
            it(c[0], (done) => {
                tokenize(c[1], done, (tokens) => {
                    assert.strictEqual(tokens[0].type, c[2]);
                });
            });
        }
    });
    describe('activators', () => {
        // Activators must be preceded by an arrow head
        const cases = [
            [ 'activate', '>+', Token.Type.OP_ACTIVATE ],
            [ 'deactivate', '>-', Token.Type.OP_DEACTIVATE ],
        ];
        for (const c of cases) {
            it(c[0], (done) => {
                tokenize(c[1], done, (tokens) => {
                    const last = tokens[tokens.length - 1];
                    assert.strictEqual(last.type, c[2]);
                });
            });
        }
    });
    describe('inline text', () => {
        const lines = [
            [ 'Basic text', 'A -> B: This is some text', 'This is some text' ],
            [ 'Whitespace stripping', '  :  Another test', 'Another test' ],
            [ 'Keywords in text', 'test: loop note as opt right', 'loop note as opt right' ],
        ];
        for (const line of lines) {
            it(line[0], (done) => {
                tokenize(line[1], done, (tokens) => {
                    const token = tokens[tokens.length - 1];
                    assert.strictEqual(token.type, Token.Type.TEXT);
                    assert.strictEqual(token.value, line[2]);
                });
            });
        }
    });
});
