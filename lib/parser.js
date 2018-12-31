const { Token } = require('./tokenizer');
const ast = require('./ast');

class ParserError extends Error {
    constructor(msg, token) {
        super(msg);
        this.token = token;
    }
}

class Parser {
    static parseFromStream(stream, completion) {
        var tokens = [];
        stream.on('token', (token) => tokens.push(token));
        stream.on('end', () => completion(new Parser(tokens)));
        stream.on('error', (error) => completion(null));
    }

    constructor(tokens) {
        this._tokens = tokens;
        this._curToken = null;
    }

    get tokenIterator() {
        if (this._tokenIter === undefined) {
            this._tokenIter = this._tokens[Symbol.iterator]();
        }
        return this._tokenIter;
    }

    parse() {
        var diagram = new ast.Diagram();
        const eos = Token.Type.END_OF_STREAM;
        this.advance();
        while (!this.accept(eos)) {
            if (this.accept(Token.Type.KW_TITLE)) {
                this.parseTitle(diagram);
            } else if (this.accept(Token.Type.KW_PARTICIPANT)) {
                this.parseParticipant(diagram);
            } else {
                this.parseStatement(diagram);
            }
        }
        return diagram;
    }

    parseTitle(diagram) {
        this.assert(Token.Type.TEXT);
        diagram.title = this._curToken.value;
        this.advance();
        return true;
    }

    parseParticipant(diagram) {
        this.assert(Token.Type.IDENTIFIER);
        const participant = this._curToken.value;
        diagram.addParticipant(participant);
        this.advance();
        if (this.accept(Token.Type.KW_AS)) {
            this.assert(Token.Type.IDENTIFIER);
            diagram.addAlias(this._curToken.value, participant);
            this.advance();
        }
        return true;
    }

    parseStatement(sequence) {
        if (this.accept(Token.Type.KW_OPT)) {
            const block = new ast.ConditionalBlock('opt');
            this.parseOptBlock(block);
            sequence.addStatement(block);
        } else if (this.accept(Token.Type.KW_ALT)) {
            const block = new ast.AltBlock();
            this.parseAltBlock(block);
            sequence.addStatement(block);
        } else if (this.test(Token.Type.IDENTIFIER)) {
            const signal = new ast.Signal(this.read(Token.Type.IDENTIFIER));
            this.parseSignal(signal);
            sequence.addStatement(signal);
        } else {
            throw new ParserError('Unexpected token in statement');
        }
    }

    parseOptBlock(block) {
        if (this.test(Token.Type.TEXT)) {
            block.condition = this._curToken.value;
            this.advance();
        }
        while (!this.accept(Token.Type.KW_END)) {
            this.parseStatement(block);
        }
    }

    parseAltBlock(group) {
        var block = new ast.ConditionalBlock('alt');
        if (this.test(Token.Type.TEXT)) {
            block.condition = this._curToken.value;
            this.advance();
        }
        while (!this.accept(Token.Type.KW_END)) {
            if (this.accept(Token.Type.KW_ELSE)) {
                group.addConditional(block);
                block = new ast.ConditionalBlock('else');
                if (this.test(Token.Type.TEXT)) {
                    block.condition = this._curToken.value;
                    this.advance();
                }
            }
        }
        group.addConditional(block);
    }

    parseSignal(signal) {
        if (this.accept(Token.Type.OP_ARROW_LEFT)) {
            signal.tail = 'closed';
        } else if (this.accept(Token.Type.OP_ARROW_LEFT_OPEN)) {
            signal.tail = 'open';
        }

        if (this.accept(Token.Type.OP_ARROW_BODY_DOTTED)) {
            signal.dotted = true;
        } else {
            this.expect(Token.Type.OP_ARROW_BODY);
        }

        if (this.accept(Token.Type.OP_ARROW_RIGHT)) {
            signal.head = 'closed';
        } else if (this.accept(Token.Type.OP_ARROW_RIGHT_OPEN)) {
            signal.head = 'open';
        }

        if (!(signal.head || signal.tail)) {
            throw new ParserError('Arrow has neither head nor tail');
        }

        signal.to = this.read(Token.Type.IDENTIFIER);

        if (this.accept(Token.Type.COLON)) {
            signal.message = this.read(Token.Type.TEXT);
        }
    }

    advance() {
        this._curToken = this.tokenIterator.next().value;
        if (!this._curToken) {
            this._curToken = new Token(Token.Type.END_OF_STREAM, null);
        }
    }

    accept(type) {
        if (this.test(type)) {
            this.advance();
            return true;
        }
        return false;
    }

    test(type) {
        if (type === null || type === undefined) {
            throw new ParserError('Attempt to test undefined token');
        }
        return this._curToken !== null && this._curToken.type === type;
    }

    expect(type) {
        this.assert(type);
        this.advance();
    }

    read(type) {
        this.assert(type);
        const value = this._curToken.value;
        this.advance();
        return value;
    }

    assert(type) {
        if (type === null || type === undefined) {
            throw new ParserError('Attempt to assert undefined token');
        }
        if (!this.test(type)) {
            throw new ParserError('Expected ' + Token.typeName(type));
        }
    }
}

module.exports = {
    Parser: Parser,
};
