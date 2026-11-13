import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { scanProjectFolder } from '../scanner/projectScanner';

suite('Project Scanner', () => {
    test('preserves non-Node ecosystem detection while adding package metadata', async () => {
        const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

        try {
            await Promise.all([
                fs.writeFile(path.join(fixturePath, 'requirements.txt'), ''),
                fs.writeFile(path.join(fixturePath, 'composer.json'), '{}'),
                fs.writeFile(path.join(fixturePath, 'pom.xml'), '<project />'),
                fs.writeFile(path.join(fixturePath, 'build.gradle'), ''),
                fs.writeFile(path.join(fixturePath, 'go.mod'), 'module example'),
                fs.writeFile(path.join(fixturePath, 'Cargo.toml'), '[package]'),
                fs.writeFile(path.join(fixturePath, 'package-lock.json'), '{}'),
                fs.writeFile(
                    path.join(fixturePath, 'package.json'),
                    JSON.stringify({
                        dependencies: { next: '^15.0.0', react: '^19.0.0' },
                        devDependencies: { typescript: '^5.0.0' },
                        scripts: { dev: 'next dev' }
                    })
                )
            ]);

            const result = await scanProjectFolder(
                'fixture',
                vscode.Uri.file(fixturePath)
            );

            assert.deepStrictEqual(result.technologies, [
                'Node.js ecosystem',
                'Python',
                'PHP',
                'Java (Maven)',
                'Java / Gradle',
                'Go',
                'Rust',
                'Next.js',
                'React',
                'TypeScript',
                'pip (requirements.txt)',
                'Composer',
                'Maven',
                'Gradle',
                'Go modules',
                'Cargo'
            ]);
            assert.strictEqual(result.packageManager?.name, 'npm');
            assert.deepStrictEqual(result.scripts, [
                { name: 'dev', command: 'next dev' }
            ]);
        } finally {
            await fs.rm(fixturePath, { recursive: true, force: true });
        }
    });

    test('continues the broader scan when package.json is malformed', async () => {
        const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

        try {
            await Promise.all([
                fs.writeFile(path.join(fixturePath, 'package.json'), '{ invalid json'),
                fs.writeFile(path.join(fixturePath, 'go.mod'), 'module example')
            ]);

            const result = await scanProjectFolder(
                'fixture',
                vscode.Uri.file(fixturePath)
            );

            assert.deepStrictEqual(result.technologies, [
                'Node.js ecosystem',
                'Go',
                'Go modules'
            ]);
            assert.deepStrictEqual(result.scripts, []);
            assert.strictEqual(result.packageManager, undefined);
        } finally {
            await fs.rm(fixturePath, { recursive: true, force: true });
        }
    });
});
