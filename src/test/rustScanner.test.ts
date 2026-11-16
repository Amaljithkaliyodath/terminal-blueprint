import * as assert from 'assert';
import { analyzeCargoToml } from '../scanner/rustScanner';

suite('Rust Scanner', () => {
    test('detects Cargo package and workspace manifests', () => {
        assert.deepStrictEqual(
            analyzeCargoToml('[package]\nname = "example"\nversion = "0.1.0"').technologies,
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

    test('rejects incomplete and malformed Cargo manifests', () => {
        for (const manifest of ['[package]', '[package]\nname = "example"', '[workspace]', '[workspace]\nmembers = []']) {
            assert.deepStrictEqual(analyzeCargoToml(manifest).technologies, []);
        }
    });
});
