import * as assert from 'assert';
import { analyzeGoMod } from '../scanner/goScanner';

suite('Go Scanner', () => {
    test('detects a valid Go module declaration', () => {
        assert.deepStrictEqual(
            analyzeGoMod('module example.com/service\n\ngo 1.22').technologies,
            ['Go', 'Go modules']
        );
    });

    test('does not infer Go modules from unrelated text', () => {
        assert.deepStrictEqual(analyzeGoMod('// module example').technologies, []);
    });
});
