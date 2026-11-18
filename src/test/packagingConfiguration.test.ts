import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Packaging Configuration', () => {
    test('excludes development and sensitive artifacts while preserving required runtime files', () => {
        const root = path.resolve(__dirname, '..', '..');
        const ignored = new Set(fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#')));
        for (const pattern of ['src/**', 'out/test/**', 'docs/**', '.vscode/**', '.vscode-test/**', '.github/**', '.git/**', 'node_modules/**', 'package-lock.json', '**/*.map', '.env', '.env.*', '**/.env', '**/.env.*', '.npmrc', '*.pem', '*.key', '.codex/**', '.agents/**']) {
            assert.ok(ignored.has(pattern), `Expected packaging exclusion: ${pattern}`);
        }
        for (const runtimeFile of ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'out/extension.js', 'resources/terminal-blueprint.svg']) {
            assert.ok(fs.existsSync(path.join(root, runtimeFile)), `Required runtime file is missing: ${runtimeFile}`);
            assert.ok(!ignored.has(runtimeFile), `Required runtime file must not be excluded: ${runtimeFile}`);
        }
    });
});
