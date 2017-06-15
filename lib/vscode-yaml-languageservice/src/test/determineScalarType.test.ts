import assert = require('assert');
import { determineScalarType as sut, ScalarType } from '../parser/yamlParser'

import * as Yaml from 'yaml-ast-parser'

suite('determineScalarType', () => {

    function determineScalarType(scalar) {
        return sut(<Yaml.YAMLScalar>scalar)
    }

    function safeLoad(input) {
        return Yaml.safeLoad(input, {})
    }

    let _test = test;

    // http://www.yaml.org/spec/1.2/spec.html#id2805071
    suite('Plain Tag Resolution', () => {

        function test(name, type, acceptable) {
            _test(name, function () {
                for (const word of acceptable) {
                    assert.strictEqual(determineScalarType(safeLoad(word)), type, word)
                }
            })
        };

        test('boolean', ScalarType.bool, ["true", "True", "TRUE", "false", "False", "FALSE"])

        test("null", ScalarType.null, ["null", "Null", "NULL", "~", ""])

        test("integer", ScalarType.int, ["0", "0o7", "0x3A", "-19"])

        test("float", ScalarType.float, ["0.", "-0.0", ".5", "+12e03", "-2E+05"])

        test("float-infinity", ScalarType.float, [".inf", "-.Inf", "+.INF"])

        test("float-NaN", ScalarType.float, [".nan", ".NaN", ".NAN"])

        test("string-like names", ScalarType.string, ["'true'", "TrUe", "nULl", "''", "'0'", '"1"', '" .5"', ".inF", ".nAn"])
    })

    suite('Flow style', () => {
        test('still recognizes types', function () {
            const node = <Yaml.YAMLSequence>safeLoad(`[ null,
  true,
  0,
  0.,
  .inf,
  .nan,
  "-123\n345"
]`)
            assert.deepStrictEqual(node.items.map(n => determineScalarType(n)), [ScalarType.null, ScalarType.bool, ScalarType.int, ScalarType.float, ScalarType.float, ScalarType.float, ScalarType.string])
        })
    })

    suite('Block styles', () => {
        var variations = ['>', '|', '>8', '|+1', '>-', '>+', '|-', '|+']

        test('are always strings', function () {
            for (const variant of variations) {
                assert.deepEqual(determineScalarType(safeLoad(variant + "\n 123")), ScalarType.string);
            }
        })
    })
}
)