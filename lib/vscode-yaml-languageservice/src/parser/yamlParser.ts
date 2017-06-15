'use strict';

import { JSONDocumentConfig, JSONDocument, ASTNode, ErrorCode, BooleanASTNode, NullASTNode, ArrayASTNode, NumberASTNode, ObjectASTNode, PropertyASTNode, StringASTNode } from '../vscode-json-languageservice/src/parser/jsonParser';

import Json = require('jsonc-parser');

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import * as Yaml from 'yaml-ast-parser'
import { Kind } from 'yaml-ast-parser'

function recursivelyBuildAst(parent: ASTNode, node: Yaml.YAMLNode): ASTNode {

	switch (node.kind) {
		case Yaml.Kind.MAP: {
			const instance = <Yaml.YamlMap>node;

			// TODO: Change Segment value
			const result = new ObjectASTNode(parent, node.value, node.startPosition, node.endPosition)
			result.addProperty

			// TODO: Could watch for duplicate keys
			for (const mapping of instance.mappings) {
				result.addProperty(<PropertyASTNode>recursivelyBuildAst(result, mapping))
			}

			return result;
		}
		case Yaml.Kind.MAPPING: {
			const instance = <Yaml.YAMLMapping>node;
			const key = instance.key;

			// TODO set name here?
			const keyNode = new StringASTNode(null, key.value, true, key.startPosition, key.endPosition);
			keyNode.value = key.value;

			// TODO: Could watch for duplicate properties
			const result = new PropertyASTNode(parent, keyNode)
			result.end = instance.endPosition
			result.setValue(recursivelyBuildAst(result, instance.value))

			return result;
		}
		case Yaml.Kind.SEQ: {
			const instance = <Yaml.YAMLSequence>node;

			const result = new ArrayASTNode(parent, instance.value, instance.startPosition, instance.endPosition);

			let count = 0;
			for (const item of instance.items) {
				const itemNode = recursivelyBuildAst(result, item);
				itemNode.location = count++;
				result.addItem(itemNode);
			}

			return result;
		}
		case Yaml.Kind.SCALAR: {
			const instance = <Yaml.YAMLScalar>node;

			const type = determineScalarType(instance)

			const name = instance.value;
			const value = instance.value;

			// TODO: Set Segment
			switch (type) {
				case ScalarType.null: {
					return new NullASTNode(parent, name, instance.startPosition, instance.endPosition);
				}
				case ScalarType.bool: {
					return new BooleanASTNode(parent, name, parseYamlBool(value), node.startPosition, node.endPosition)
				}
				case ScalarType.int: {
					const result = new NumberASTNode(parent, name, node.startPosition, node.endPosition);
					result.value = parseYamlInteger(value);
					result.isInteger = true;
					return result;
				}
				case ScalarType.float: {
					const result = new NumberASTNode(parent, name, node.startPosition, node.endPosition);
					result.value = parseYamlFloat(value);
					result.isInteger = false;
					break;
				}
				case ScalarType.string: {
					const result = new StringASTNode(parent, name, false, node.startPosition, node.endPosition);
					result.value = node.value;
					return result;
				}
			}

			break;
		}
		case Yaml.Kind.INCLUDE_REF:
		case Yaml.Kind.ANCHOR_REF: {
			// Issue Warning
			break;
		}
	}


	return undefined;
}

function parseYamlBool(input: String): boolean {
	return true;
}

function parseYamlInteger(input: String): number {
	return 0;
}

function parseYamlFloat(input: String): number {
	return 0;
}

export enum ScalarType {
	null, bool, int, float, string
}

export function determineScalarType(node: Yaml.YAMLScalar): ScalarType {
	if (node === undefined) {
		return ScalarType.null;
	}

	if (node.doubleQuoted || !node.plainScalar || node['singleQuoted']) {
		return ScalarType.string
	}

	const value = node.value;

	if (["null", "Null", "NULL", "~"].indexOf(value) >= 0) {
		return ScalarType.null;
	}

	if (value === null || value === undefined) {
		return ScalarType.null;
	}

	if (["true", "True", "TRUE", "false", "False", "FALSE"].indexOf(value) >= 0) {
		return ScalarType.bool;
	}

	const base10 = /^[-+]?[0-9]+$/
	const base8 = /^0o[0-7]+$/
	const base16 = /^0x[0-9a-fA-F]+$/

	if (base10.test(value) || base8.test(value) || base16.test(value)) {
		return ScalarType.int;
	}

	const float = /^[-+]?(\.[0-9]+|[0-9]+(\.[0-9]*)?)([eE][-+]?[0-9]+)?$/
	const infinity = /^[-+]?(\.inf|\.Inf|\.INF)$/
	if (float.test(value) || infinity.test(value) || [".nan", ".NaN", ".NAN"].indexOf(value) >= 0) {
		return ScalarType.float;
	}

	return ScalarType.string;
}



export function parse(text: string, config?: JSONDocumentConfig): JSONDocument {

	let _doc = new JSONDocument(config);
	// This is documented to return a YAMLNode even though the
	// typing only returns a YAMLDocument
	const yamlDoc = <Yaml.YAMLNode>Yaml.safeLoad(text, {})

	_doc.root = recursivelyBuildAst(null, yamlDoc)

	if (!_doc.root) {
		_doc.errors.push({ message: localize('Invalid symbol', 'Expected a YAML object, array or literal'), code: ErrorCode.Undefined, location: { start: yamlDoc.startPosition, end: yamlDoc.endPosition } });
	}

	const errors = yamlDoc.errors.map(e => {
		return { message: e.message, location: { start: e.mark.position, end: e.mark.position + e.mark.buffer.length }, code: ErrorCode.Undefined }
	})

	errors.forEach(e => _doc.errors.push(e));

	return _doc;
}