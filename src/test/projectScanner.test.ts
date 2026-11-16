import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { scanProjectFolder } from '../scanner/projectScanner';
import { generateCommandSuggestions } from '../suggestions/commandSuggestionEngine';
import { normalizePathForComparison } from './pathComparison';

suite('Project Scanner', () => {
    test('preserves non-Node ecosystem detection while adding package metadata', async () => {
        const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

        try {
            await Promise.all([
                fs.writeFile(path.join(fixturePath, 'requirements.txt'), ''),
                fs.writeFile(path.join(fixturePath, 'composer.json'), '{}'),
                fs.writeFile(path.join(fixturePath, 'pom.xml'), '<project><modelVersion>4.0.0</modelVersion></project>'),
                fs.writeFile(path.join(fixturePath, 'build.gradle'), ''),
                fs.writeFile(path.join(fixturePath, 'go.mod'), 'module example'),
                fs.writeFile(path.join(fixturePath, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"'),
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
                'Next.js',
                'React',
                'TypeScript',
                'Python',
                'pip (requirements.txt)',
                'PHP',
                'Composer',
                'Maven',
                'Gradle',
                'Go',
                'Go modules',
                'Rust',
                'Cargo'
            ]);
            assert.strictEqual(result.packageManager?.name, 'npm');
            assert.strictEqual(result.relativePath, '.');
            assert.strictEqual(
                normalizePathForComparison(result.workingDirectory.fsPath),
                normalizePathForComparison(fixturePath)
            );
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

    test('does not claim languages from empty or invalid metadata', async () => {
        const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

        try {
            await Promise.all([
                fs.writeFile(path.join(fixturePath, 'pom.xml'), '<project />'),
                fs.writeFile(path.join(fixturePath, 'build.gradle'), ''),
                fs.writeFile(path.join(fixturePath, 'build.gradle.kts'), ''),
                fs.writeFile(path.join(fixturePath, 'go.mod'), '// not a module'),
                fs.writeFile(path.join(fixturePath, 'Cargo.toml'), '[metadata]')
            ]);

            const result = await scanProjectFolder(
                'fixture',
                vscode.Uri.file(fixturePath)
            );

            assert.deepStrictEqual(result.technologies, ['Gradle']);
            assert.ok(!result.technologies.includes('Java'));
            assert.ok(!result.technologies.includes('Kotlin'));
            assert.ok(!result.technologies.includes('Go'));
            assert.ok(!result.technologies.includes('Rust'));
        } finally {
            await fs.rm(fixturePath, { recursive: true, force: true });
        }
    });

    test('reports verified Java and Kotlin metadata', async () => {
        const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

        try {
            await Promise.all([
                fs.writeFile(
                    path.join(fixturePath, 'pom.xml'),
                    '<project><modelVersion>4.0.0</modelVersion><plugin>maven-compiler-plugin</plugin><artifactId>spring-boot-starter-web</artifactId></project>'
                ),
                fs.writeFile(
                    path.join(fixturePath, 'build.gradle.kts'),
                    'plugins { kotlin("jvm"); id("org.springframework.boot") }'
                )
            ]);

            const result = await scanProjectFolder(
                'fixture',
                vscode.Uri.file(fixturePath)
            );

            assert.deepStrictEqual(result.technologies, [
                'Maven',
                'Gradle',
                'Java',
                'Kotlin',
                'Spring Boot'
            ]);
        } finally {
            await fs.rm(fixturePath, { recursive: true, force: true });
        }
    });

    test('does not generate Maven or Cargo commands from invalid manifests', async () => {
        const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

        try {
            await Promise.all([
                fs.writeFile(path.join(fixturePath, 'pom.xml'), '<project />'),
                fs.writeFile(path.join(fixturePath, 'Cargo.toml'), '[package]\nname = "fixture"')
            ]);

            const project = await scanProjectFolder('fixture', vscode.Uri.file(fixturePath));
            const suggestions = generateCommandSuggestions([project]);

            assert.deepStrictEqual(project.technologies, []);
            assert.deepStrictEqual(suggestions.suggestions, []);
        } finally {
            await fs.rm(fixturePath, { recursive: true, force: true });
        }
    });

    test('generates Maven and Cargo commands from verified manifests', async () => {
        const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

        try {
            await Promise.all([
                fs.writeFile(path.join(fixturePath, 'pom.xml'), '<project><modelVersion>4.0.0</modelVersion></project>'),
                fs.writeFile(path.join(fixturePath, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"')
            ]);

            const project = await scanProjectFolder('fixture', vscode.Uri.file(fixturePath));
            const commands = generateCommandSuggestions([project]).suggestions.map((suggestion) => suggestion.command);

            assert.deepStrictEqual(commands, ['mvn test', 'mvn package', 'cargo test', 'cargo build']);
        } finally {
            await fs.rm(fixturePath, { recursive: true, force: true });
        }
    });

    test('preserves verified Composer scripts and Django manage.py metadata', async () => {
        const fixturePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

        try {
            await Promise.all([
                fs.writeFile(
                    path.join(fixturePath, 'composer.json'),
                    JSON.stringify({ scripts: { test: 'phpunit' } })
                ),
                fs.writeFile(path.join(fixturePath, 'manage.py'), '')
            ]);

            const result = await scanProjectFolder(
                'fixture',
                vscode.Uri.file(fixturePath)
            );

            assert.deepStrictEqual(result.composerScripts, [
                { name: 'test', command: 'phpunit' }
            ]);
            assert.strictEqual(result.hasDjangoManagePy, true);
        } finally {
            await fs.rm(fixturePath, { recursive: true, force: true });
        }
    });
});
