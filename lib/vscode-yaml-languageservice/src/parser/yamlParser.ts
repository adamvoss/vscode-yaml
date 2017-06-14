'use strict';

import {JSONDocumentConfig, JSONDocument, ASTNode, ErrorCode, BooleanASTNode, NullASTNode, ArrayASTNode, NumberASTNode, ObjectASTNode, PropertyASTNode, StringASTNode} from '../vscode-json-languageservice/src/parser/jsonParser';

import Json = require('jsonc-parser');

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export function parse(text: string, config?: JSONDocumentConfig): JSONDocument {

	let _doc = new JSONDocument(config);
	let _scanner = Json.createScanner(text, false);

	let disallowComments = config && config.disallowComments;
	let ignoreDanglingComma = config && config.ignoreDanglingComma;

	function _scanNext(): Json.SyntaxKind {
		while (true) {
			let token = _scanner.scan();
			switch (token) {
				case Json.SyntaxKind.LineCommentTrivia:
				case Json.SyntaxKind.BlockCommentTrivia:
					if (disallowComments) {
						_error(localize('InvalidCommentTokem', 'Comments are not allowed'), ErrorCode.CommentsNotAllowed);
					}
					break;
				case Json.SyntaxKind.Trivia:
				case Json.SyntaxKind.LineBreakTrivia:
					break;
				default:
					return token;
			}
		}
	}

	function _accept(token: Json.SyntaxKind): boolean {
		if (_scanner.getToken() === token) {
			_scanNext();
			return true;
		}
		return false;
	}

	function _error<T extends ASTNode>(message: string, code: ErrorCode, node: T = null, skipUntilAfter: Json.SyntaxKind[] = [], skipUntil: Json.SyntaxKind[] = []): T {
		if (_doc.errors.length === 0 || _doc.errors[0].location.start !== _scanner.getTokenOffset()) {
			// ignore multiple errors on the same offset
			let start = _scanner.getTokenOffset();
			let end = _scanner.getTokenOffset() + _scanner.getTokenLength();
			if (start === end && start > 0) {
				start--;
				while (start > 0 && /\s/.test(text.charAt(start))) {
					start--;
				}
				end = start + 1;
			}
			_doc.errors.push({ message, location: { start, end }, code });
		}

		if (node) {
			_finalize(node, false);
		}
		if (skipUntilAfter.length + skipUntil.length > 0) {
			let token = _scanner.getToken();
			while (token !== Json.SyntaxKind.EOF) {
				if (skipUntilAfter.indexOf(token) !== -1) {
					_scanNext();
					break;
				} else if (skipUntil.indexOf(token) !== -1) {
					break;
				}
				token = _scanNext();
			}
		}
		return node;
	}

	function _checkScanError(): boolean {
		switch (_scanner.getTokenError()) {
			case Json.ScanError.InvalidUnicode:
				_error(localize('InvalidUnicode', 'Invalid unicode sequence in string'), ErrorCode.InvalidUnicode);
				return true;
			case Json.ScanError.InvalidEscapeCharacter:
				_error(localize('InvalidEscapeCharacter', 'Invalid escape character in string'), ErrorCode.InvalidEscapeCharacter);
				return true;
			case Json.ScanError.UnexpectedEndOfNumber:
				_error(localize('UnexpectedEndOfNumber', 'Unexpected end of number'), ErrorCode.UnexpectedEndOfNumber);
				return true;
			case Json.ScanError.UnexpectedEndOfComment:
				_error(localize('UnexpectedEndOfComment', 'Unexpected end of comment'), ErrorCode.UnexpectedEndOfComment);
				return true;
			case Json.ScanError.UnexpectedEndOfString:
				_error(localize('UnexpectedEndOfString', 'Unexpected end of string'), ErrorCode.UnexpectedEndOfString);
				return true;
			case Json.ScanError.InvalidCharacter:
				_error(localize('InvalidCharacter', 'Invalid characters in string. Control characters must be escaped.'), ErrorCode.InvalidCharacter);
				return true;
		}
		return false;
	}

	function _finalize<T extends ASTNode>(node: T, scanNext: boolean): T {
		node.end = _scanner.getTokenOffset() + _scanner.getTokenLength();

		if (scanNext) {
			_scanNext();
		}

		return node;
	}

	function _parseArray(parent: ASTNode, name: Json.Segment): ArrayASTNode {
		if (_scanner.getToken() !== Json.SyntaxKind.OpenBracketToken) {
			return null;
		}
		let node = new ArrayASTNode(parent, name, _scanner.getTokenOffset());
		_scanNext(); // consume OpenBracketToken

		let count = 0;
		if (node.addItem(_parseValue(node, count++))) {
			while (_accept(Json.SyntaxKind.CommaToken)) {
				if (!node.addItem(_parseValue(node, count++)) && !ignoreDanglingComma) {
					_error(localize('ValueExpected', 'Value expected'), ErrorCode.Undefined);
				}
			}
		}

		if (_scanner.getToken() !== Json.SyntaxKind.CloseBracketToken) {
			return _error(localize('ExpectedCloseBracket', 'Expected comma or closing bracket'), ErrorCode.Undefined, node);
		}

		return _finalize(node, true);
	}

	function _parseProperty(parent: ObjectASTNode, keysSeen: any): PropertyASTNode {

		let key = _parseString(null, null, true);
		if (!key) {
			if (_scanner.getToken() === Json.SyntaxKind.Unknown) {
				// give a more helpful error message
				let value = _scanner.getTokenValue();
				if (value.match(/^['\w]/)) {
					_error(localize('DoubleQuotesExpected', 'Property keys must be doublequoted'), ErrorCode.Undefined);
				}
			}
			return null;
		}
		let node = new PropertyASTNode(parent, key);

		if (keysSeen[key.value]) {
			_doc.warnings.push({ location: { start: node.key.start, end: node.key.end }, message: localize('DuplicateKeyWarning', "Duplicate object key"), code: ErrorCode.Undefined });
		}
		keysSeen[key.value] = true;

		if (_scanner.getToken() === Json.SyntaxKind.ColonToken) {
			node.colonOffset = _scanner.getTokenOffset();
		} else {
			return _error(localize('ColonExpected', 'Colon expected'), ErrorCode.Undefined, node, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
		}

		_scanNext(); // consume ColonToken

		if (!node.setValue(_parseValue(node, key.value))) {
			return _error(localize('ValueExpected', 'Value expected'), ErrorCode.Undefined, node, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
		}
		node.end = node.value.end;
		return node;
	}

	function _parseObject(parent: ASTNode, name: Json.Segment): ObjectASTNode {
		if (_scanner.getToken() !== Json.SyntaxKind.OpenBraceToken) {
			return null;
		}
		let node = new ObjectASTNode(parent, name, _scanner.getTokenOffset());
		_scanNext(); // consume OpenBraceToken

		let keysSeen: any = Object.create(null);
		if (node.addProperty(_parseProperty(node, keysSeen))) {
			while (_accept(Json.SyntaxKind.CommaToken)) {
				if (!node.addProperty(_parseProperty(node, keysSeen)) && !ignoreDanglingComma) {
					_error(localize('PropertyExpected', 'Property expected'), ErrorCode.Undefined);
				}
			}
		}

		if (_scanner.getToken() !== Json.SyntaxKind.CloseBraceToken) {
			return _error(localize('ExpectedCloseBrace', 'Expected comma or closing brace'), ErrorCode.Undefined, node);
		}
		return _finalize(node, true);
	}

	function _parseString(parent: ASTNode, name: Json.Segment, isKey: boolean): StringASTNode {
		if (_scanner.getToken() !== Json.SyntaxKind.StringLiteral) {
			return null;
		}

		let node = new StringASTNode(parent, name, isKey, _scanner.getTokenOffset());
		node.value = _scanner.getTokenValue();

		_checkScanError();

		return _finalize(node, true);
	}

	function _parseNumber(parent: ASTNode, name: Json.Segment): NumberASTNode {
		if (_scanner.getToken() !== Json.SyntaxKind.NumericLiteral) {
			return null;
		}

		let node = new NumberASTNode(parent, name, _scanner.getTokenOffset());
		if (!_checkScanError()) {
			let tokenValue = _scanner.getTokenValue();
			try {
				let numberValue = JSON.parse(tokenValue);
				if (typeof numberValue !== 'number') {
					return _error(localize('InvalidNumberFormat', 'Invalid number format'), ErrorCode.Undefined, node);
				}
				node.value = numberValue;
			} catch (e) {
				return _error(localize('InvalidNumberFormat', 'Invalid number format'), ErrorCode.Undefined, node);
			}
			node.isInteger = tokenValue.indexOf('.') === -1;
		}
		return _finalize(node, true);
	}

	function _parseLiteral(parent: ASTNode, name: Json.Segment): ASTNode {
		let node: ASTNode;
		switch (_scanner.getToken()) {
			case Json.SyntaxKind.NullKeyword:
				node = new NullASTNode(parent, name, _scanner.getTokenOffset());
				break;
			case Json.SyntaxKind.TrueKeyword:
				node = new BooleanASTNode(parent, name, true, _scanner.getTokenOffset());
				break;
			case Json.SyntaxKind.FalseKeyword:
				node = new BooleanASTNode(parent, name, false, _scanner.getTokenOffset());
				break;
			default:
				return null;
		}
		return _finalize(node, true);
	}

	function _parseValue(parent: ASTNode, name: Json.Segment): ASTNode {
		return _parseArray(parent, name) || _parseObject(parent, name) || _parseString(parent, name, false) || _parseNumber(parent, name) || _parseLiteral(parent, name);
	}

	_scanNext();

	_doc.root = _parseValue(null, null);
	if (!_doc.root) {
		_error(localize('Invalid symbol', 'Expected a JSON object, array or literal'), ErrorCode.Undefined);
	} else if (_scanner.getToken() !== Json.SyntaxKind.EOF) {
		_error(localize('End of file expected', 'End of file expected'), ErrorCode.Undefined);
	}
	return _doc;
}