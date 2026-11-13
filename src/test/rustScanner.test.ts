import * as assert from 'assert';
import { analyzeCargoToml } from '../scanner/rustScanner';

suite('Rust Scanner', () => {
    test('detects Cargo package and workspace manifests', () => {
        assert.deepStrictEqual(
            analyzeCargoToml('[package]\nname = "example"').technologies,
            ['Rust', 'Cargo']
        );
        assert.deepStrictEqual(
            analyzeCargoToml('[workspace]\nmembers = ["api"]').technologies,
            ['Rust', 'Cargo']
        );
    });

    test('does not infer Cargo from unrelated TOML text', () => {
        assert.deepStrictEqual(analyzeCargoToml('[metadata]').technologies, []);
    });
});
