const EventEmitter = require('events');
const readline = require('readline');

/*
 * See http://plantuml.com/sequence-diagram for general syntax. Not all syntax
 * is supported.
 */

class TokenizeError extends Error {
    constructor(msg, line, lineNumber, offset) {
        super(msg);
        this.msg = msg;
        this.line = line;
        this.lineNumber = lineNumber;
        this.offset = offset;
    }

    toString() {
        var str = 'Error on line ' + this.lineNumber + ': ' + this.msg + '\n';
        str += this.line + '\n';
        for (var i = 0; i < this.offset; ++i) {
            str += ' ';
        }
        str += '^';
        return str;
    }
}

class Token {
    constructor(type, value, line, offset) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.offset = offset;
    }
    
    toString() {
        var name;
        switch (this.type) {
        case Token.Type.KEYWORD:
            name = 'keyword'; break;
        case Token.Type.IDENTIFIER:
            name = 'identifier'; break;
        case Token.Type.OPERATOR:
            name = 'operator'; break;
        case Token.Type.TEXT:
            name = 'text'; break;
        default:
            name = 'UNKNOWN'; break;
        }
        return name + '(' + this.value + ')';
    }

    get startsMultilineText() {
        return this.type == Token.Type.KEYWORD && this.value == 'note';
    }

    get startsInlineText() {
        return this.type == Token.Type.KEYWORD && this.value == 'title';
    }
}

Token.Type = {
    KEYWORD: 1,
    IDENTIFIER: 2,
    OPERATOR: 3,
    TEXT: 4,
};

class Tokenizer extends EventEmitter {
    static isWhitespaceChar(c) {
        return c == ' ' || c == '\t';
    }

    static isOperatorChar(c) {
        return c !== null && Tokenizer.OperatorCharRegex.test(c);
    }

    static isIdentifierStartChar(c) {
        return c !== null && Tokenizer.IdentStartCharRegex.test(c);
    }

    static isIdentifierChar(c) {
        return c !== null && Tokenizer.IdentCharRegex.test(c);
    }

    constructor(stream) {
        super();
        this._input = readline.createInterface({
            input: stream,
            crlfDelay: Infinity
        });
        this._line = null;
        this._lineNumber = 0;
        this._lineOffset = 0;
        this._context = Tokenizer.Context.NORMAL;
    }

    tokenize() {
        this._input
        .on('line', (line) => this.tokenizeLine(line))
        .on('close', () => this.close());
    }

    tokenizeLine(line) {
        this._line = line;
        ++this._lineNumber;
        this._lineOffset = 0;

        switch (this._context) {
        case Tokenizer.Context.NORMAL:
            this.tokenizeStatement();
            break;
        case Tokenizer.Context.MULTILINE_TEXT:
            this.readMultilineText();
            break;
        default:
            return;
        }

        // Stop reading after the first invalid line
        if (this._context == Tokenizer.Context.ERROR) {
            this._input.close();
        }
    }

    close() {
        if (this._context != Tokenizer.Context.ERROR) {
            this._context = Tokenizer.Context.DONE;
            this.emit('end');
        }
        this.emit('close');
    }

    tokenizeStatement() {
        var readInlineText = false;
        var tokens = [];
        const len = this._line.length;
        while (this._lineOffset < len) {
            this.skipWhitespace();
            var token;
            if (readInlineText) {
                token = this.readInlineText();
            } else {
                token = this.readStatementToken();
            }
            if (token === null) {
                // Stop tokenizing the line on error
                break;
            }

            tokens.push(token);
            if (token.type == Token.Type.OPERATOR && token.value == ':') {
                readInlineText = true;
            }
        }
        // Check for tokens that can start multiline text
        if (tokens.length > 0 && tokens[0].startsMultilineText) {
            // Switch tokenizer context unless already read inline text
            if (!readInlineText) {
                this._context = Tokenizer.Context.MULTILINE_TEXT;
            }
        }
        return tokens;
    }

    readStatementToken() {
        const c = this.peekChar();
        if (c === null) {
            return null;
        } else if (Tokenizer.isOperatorChar(c)) {
            return this.readOperator();
        } else if (Tokenizer.isIdentifierStartChar(c)) {
            return this.readIdentifier();
        } else {
            return this.fail('Unexpected character');
        }
    }

    readInlineText() {
        const offset = this._lineOffset;
        this._lineOffset = this._line.length;
        const text = this._line.substring(offset);
        return this.emitToken(Token.Type.TEXT, text, offset);
    }

    readMultilineText() {
        // Check for the multiline text terminator
        if (Tokenizer.EndRegex.test(this._line)) {
            this._context = Tokenizer.Context.NORMAL;
            return this.tokenizeStatement();
        }
        return this.emitToken(Token.Type.TEXT, this._line, 0);
    }

    readOperator() {
        const offset = this._lineOffset;
        const test = Tokenizer.isOperatorChar;
        var op = '';
        for (var c = this.peekChar(); test(c); c = this.advanceChar()) {
            op += c;
        }
        return this.emitToken(Token.Type.OPERATOR, op, offset);
    }

    readIdentifier() {
        const offset = this._lineOffset;
        var ident = '';
        var c = this.peekChar();
        if (!Tokenizer.isIdentifierStartChar(c)) {
            return this.fail('Internal error, expected identifier start char in readIdentifier');
        }
        const test = Tokenizer.isIdentifierChar;
        for (/* c is already set */; test(c); c = this.advanceChar()) {
            ident += c;
        }
        const isKeyword = Tokenizer.Keywords.indexOf(ident) >= 0;
        const type = isKeyword ? Token.Type.KEYWORD : Token.Type.IDENTIFIER;
        return this.emitToken(type, ident, offset);
    }

    emitToken(type, value, offset) {
        const token = new Token(type, value, this._lineNumber, offset);
        this.emit('token', token);
        return token;
    }
    
    peekChar() {
        if (this._lineOffset < this._line.length) {
            return this._line.charAt(this._lineOffset);
        }
        return null;
    }

    advanceChar() {
        if (this._lineOffset < this._line.length) {
            ++this._lineOffset;
            return this.peekChar();
        }
        return null;
    }

    skipWhitespace() {
        const len = this._line.length;
        while (this._lineOffset < len) {
            const c = this._line.charAt(this._lineOffset);
            if (!Tokenizer.isWhitespaceChar(c)) {
                break;
            }
            ++this._lineOffset;
        }
    }

    fail(msg) {
        const err = new TokenizeError(msg, this._line, this._lineNumber,
            this._lineOffset);
        this._context = Tokenizer.Context.ERROR;
        this.emit('error', err);
        return null;
    }
}

Tokenizer.Context = {
    NORMAL: 1,
    MULTILINE_TEXT: 2,
    DONE: 3,
    ERROR: 4,
};

Tokenizer.Keywords = [
    'title',
    'participant',
    'as',
    'note',
    'over',
    'left',
    'right',
    'of',
    'opt',
    'alt',
    'else',
    'end',
    'activate',
    'deactivate',
    'destroy',
];

Tokenizer.OperatorCharRegex = new RegExp('^[<>:*+-]$');
Tokenizer.IdentStartCharRegex = new RegExp('^[a-zA-Z]$');
Tokenizer.IdentCharRegex = new RegExp('^[a-zA-Z0-9_]$');
Tokenizer.EndRegex = new RegExp('^\\s*end\\b', 'i');

module.exports = {
    Token: Token,
    Tokenizer: Tokenizer,
};
