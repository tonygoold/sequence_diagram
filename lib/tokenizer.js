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
        if (type === null || type === undefined) {
            throw new TokenizeError('Token type is not defined');
        }
        this.type = type;
        this.value = value;
        this.line = line;
        this.offset = offset;
    }

    static typeName(type) {
        if (type >= Token.minKeyword && type <= Token.maxKeyword) {
            for (const keyword of Token.Keywords) {
                if (type === Token.KeywordMap[keyword]) {
                    return keyword;
                }
            }
            return 'UNKNOWN KEYWORD';
        }
        switch (type) {
            case Token.Type.IDENTIFIER: return 'identifier';
            case Token.Type.OPERATOR: return 'operator';
            case Token.Type.TEXT: return 'text';
            case Token.Type.COLON: return 'colon';
            case Token.Type.COMMA: return 'comma';
            case Token.Type.OP_ARROW_LEFT: return 'arrowleft';
            case Token.Type.OP_ARROW_LEFT_OPEN: return 'arrowleftopen';
            case Token.Type.OP_ARROW_BODY: return 'arrowbody';
            case Token.Type.OP_ARROW_BODY_DOTTED: return 'arrowbodydotted';
            case Token.Type.OP_ARROW_RIGHT: return 'arrowright';
            case Token.Type.OP_ARROW_RIGHT_OPEN: return 'arrowrightopen';
            default: return 'UNKNOWN';
        }
    }
    
    toString() {
        var name = Token.typeName(this.type);
        if (this.value !== undefined && this.value !== null) {
            name += '(' + this.value + ')';
        }
        return name;
    }

    get isArrowRight() {
        switch (this.type) {
        case Token.Type.OP_ARROW_RIGHT:
        case Token.Type.OP_ARROW_RIGHT_OPEN:
            return true;
        default:
            return false;
        }
    }

    get isKeyword() {
        return this.type >= Token.minKeyword && this.type <= Token.maxKeyword;
    }

    get startsMultilineText() {
        switch (this.type) {
            case Token.Type.KW_NOTE: return true;
            default: return false;
        }
    }

    get startsInlineText() {
        switch (this.type) {
            case Token.Type.KW_TITLE: return true;
            default: return false;
        }
    }
}

Token.Keywords = [
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

Token.Type = {
    IDENTIFIER: 1,
    OPERATOR: 2,
    TEXT: 3,
    COLON: 4,
    COMMA: 5,
    KW_TITLE: 100,
    KW_PARTICIPANT: 101,
    KW_AS: 102,
    KW_NOTE: 103,
    KW_OVER: 104,
    KW_LEFT: 105,
    KW_RIGHT: 106,
    KW_OF: 107,
    KW_OPT: 108,
    KW_ALT: 109,
    KW_ELSE: 110,
    KW_END: 111,
    KW_ACTIVATE: 112,
    KW_DEACTIVATE: 113,
    KW_DESTROY: 114,
    OP_ARROW_BODY: 200,
    OP_ARROW_BODY_DOTTED: 201,
    OP_ARROW_LEFT: 210,
    OP_ARROW_LEFT_OPEN: 211,
    OP_ARROW_RIGHT: 220,
    OP_ARROW_RIGHT_OPEN: 221,
    OP_ACTIVATE: 230,
    OP_DEACTIVATE: 231,
    OP_CREATE: 232,
    END_OF_STREAM: 1000,
};
// Keep these in sync with the Token.Type values
Token.minKeyword = Token.Type.KW_TITLE;
Token.maxKeyword = Token.Type.KW_DESTROY;
Token.minOperator = Token.Type.OP_ARROW_BODY;
Token.maxOperator = Token.Type.OP_CREATE;

Token.KeywordMap = {};
for (const keyword of Token.Keywords) {
    Token.KeywordMap[keyword] = Token.Type['KW_' + keyword.toUpperCase()];
}

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
        var checkForActivator = false;
        var tokens = [];
        const len = this._line.length;
        while (this._lineOffset < len) {
            this.skipWhitespace();
            var token;
            if (readInlineText) {
                token = this.readInlineText();
            } else if (checkForActivator) {
                checkForActivator = false;
                token = this.readActivatorOrStatementToken();
            } else {
                token = this.readStatementToken();
            }
            if (token === null) {
                // Stop tokenizing the line on error
                break;
            }

            tokens.push(token);
            if (token.type === Token.Type.COLON) {
                readInlineText = true;
            } else if (token.isArrowRight) {
                checkForActivator = true;
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

    readActivatorOrStatementToken() {
        const offset = this._lineOffset;
        switch (this.peekChar()) {
        case '-':
            this.advanceChar();
            return this.emitToken(Token.Type.OP_DEACTIVATE, '-', offset);
        case '+':
            this.advanceChar();
            return this.emitToken(Token.Type.OP_ACTIVATE, '+', offset);
        default:
            return this.readStatementToken();
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
        const c = this.peekChar();
        switch (c) {
            case '<': return this.readArrowLeft();
            case '-': return this.readArrowBody();
            case '>': return this.readArrowRight();
            case '*': return this.readChar(c, Token.Type.OP_CREATE);
            case ':': return this.readChar(c, Token.Type.COLON);
            case ',': return this.readChar(c, Token.Type.COMMA);
            default: this.fail('Unexpected operator ' + c);
        }
    }

    readArrowLeft() {
        const offset = this._lineOffset;
        if (this.advanceChar() == '<') {
            this.advanceChar();
            return this.emitToken(Token.Type.OP_ARROW_LEFT_OPEN, '<<', offset);
        } else {
            return this.emitToken(Token.Type.OP_ARROW_LEFT, '<', offset);
        }
    }

    readArrowBody() {
        const offset = this._lineOffset;
        if (this.advanceChar() == '-') {
            this.advanceChar();
            return this.emitToken(Token.Type.OP_ARROW_BODY_DOTTED, '--', offset);
        } else {
            return this.emitToken(Token.Type.OP_ARROW_BODY, '-', offset);
        }
    }

    readArrowRight() {
        const offset = this._lineOffset;
        if (this.advanceChar() == '>') {
            this.advanceChar();
            return this.emitToken(Token.Type.OP_ARROW_RIGHT_OPEN, '>>', offset);
        } else {
            return this.emitToken(Token.Type.OP_ARROW_RIGHT, '>', offset);
        }
    }

    readChar(c, type) {
        const offset = this._lineOffset;
        this.advanceChar();
        return this.emitToken(type, c, offset);
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
        const type = Token.KeywordMap[ident] || Token.Type.IDENTIFIER;
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

Tokenizer.OperatorCharRegex = new RegExp('^[<>:,*+-]$');
Tokenizer.IdentStartCharRegex = new RegExp('^[a-zA-Z]$');
Tokenizer.IdentCharRegex = new RegExp('^[a-zA-Z0-9_]$');
Tokenizer.EndRegex = new RegExp('^\\s*end\\b', 'i');

module.exports = {
    Token: Token,
    Tokenizer: Tokenizer,
};
