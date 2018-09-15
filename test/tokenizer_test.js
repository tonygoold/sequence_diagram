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
                    assert.ok(tokens.length > 0, 'No tokens found');
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
                    assert.ok(tokens.length > 0, 'No tokens found');
                    assert.strictEqual(tokens[0].type, Token.Type.KEYWORD);
                    assert.strictEqual(tokens[0].value, keyword);
                });
            });
        }
    });
    describe('operators', () => {
        const operators = [
            '->',
            '-->',
            '->>',
            '-->>',
            '<->',
            '<-->',
            '+',
            '-',
            '*',
            ':',
        ];
        for (const operator of operators) {
            it(operator, (done) => {
                tokenize(operator, done, (tokens) => {
                    assert.ok(tokens.length > 0, 'No tokens found');
                    assert.strictEqual(tokens[0].type, Token.Type.OPERATOR);
                    assert.strictEqual(tokens[0].value, operator);
                });
            });
        }
    });
});
