import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { openSupportDevelopment, SUPPORT_DEVELOPMENT_URL } from '../support/supportDevelopment';

suite('Support Development', () => {
    test('declares the MIT license, sponsor metadata, and support command', () => {
        const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8')) as {
            license: string; sponsor: { url: string }; contributes: { commands: Array<{ command: string; title: string }> };
        };
        assert.strictEqual(manifest.license, 'MIT');
        assert.strictEqual(manifest.sponsor.url, SUPPORT_DEVELOPMENT_URL);
        assert.ok(manifest.contributes.commands.some((command) => command.command === 'terminal-blueprint.supportDevelopment' && command.title === 'Terminal Blueprint: Support Development'));
        assert.ok(fs.readFileSync(path.resolve(__dirname, '..', '..', 'LICENSE'), 'utf8').startsWith('MIT License'));
        assert.ok(fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'extension.ts'), 'utf8').includes("registerCommand('terminal-blueprint.supportDevelopment'"));
    });

    test('opens only the configured HTTPS support URL', async () => {
        let opened: vscode.Uri | undefined;
        const result = await openSupportDevelopment({ async openExternal(uri) { opened = uri; return true; } }, () => assert.fail('unexpected warning'));
        assert.strictEqual(result, true);
        assert.strictEqual(opened?.toString(), SUPPORT_DEVELOPMENT_URL);
    });

    test('reports failed external opening without terminal, scanner, or storage side effects', async () => {
        const warnings: string[] = [];
        const terminalCount = vscode.window.terminals.length;
        const result = await openSupportDevelopment({ async openExternal() { return false; } }, (message) => warnings.push(message));
        assert.strictEqual(result, false);
        assert.deepStrictEqual(warnings, ['Terminal Blueprint: Unable to open the support link.']);
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
    });

    test('handles an external opener error gracefully', async () => {
        const warnings: string[] = [];
        const result = await openSupportDevelopment({ async openExternal() { throw new Error('browser unavailable'); } }, (message) => warnings.push(message));
        assert.strictEqual(result, false);
        assert.strictEqual(warnings.length, 1);
    });
});
