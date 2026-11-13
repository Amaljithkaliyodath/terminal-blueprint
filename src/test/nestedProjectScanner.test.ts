import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    scanWorkspaceFolder,
    scanWorkspaceFolders
} from '../scanner/projectScanner';
import { normalizePathForComparison } from './pathComparison';

suite('Nested Project Scanner', () => {
    test('detects independent projects in common monorepo directories', async () => {
        const workspacePath = await createWorkspaceFixture({
            'frontend/package.json': JSON.stringify({ dependencies: { react: '^19.0.0' } }),
            'backend/requirements.txt': 'fastapi>=0.115',
            'apps/web/package.json': JSON.stringify({ dependencies: { next: '^15.0.0' } }),
            'packages/shared/go.mod': 'module example.com/shared',
            'services/worker/Cargo.toml': '[package]\nname = "worker"'
        });

        try {
            const projects = await scanWorkspaceFolder({
                name: 'workspace',
                uri: vscode.Uri.file(workspacePath)
            });

            assert.deepStrictEqual(
                projects.map((project) => project.relativePath),
                ['.', 'apps/web', 'backend', 'frontend', 'packages/shared', 'services/worker']
            );
            assert.deepStrictEqual(projects[1].technologies, ['Node.js ecosystem', 'Next.js']);
            assert.deepStrictEqual(projects[2].technologies, ['Python', 'pip (requirements.txt)', 'FastAPI']);
            assert.deepStrictEqual(projects[3].technologies, ['Node.js ecosystem', 'React']);
            assert.deepStrictEqual(projects[4].technologies, ['Go', 'Go modules']);
            assert.deepStrictEqual(projects[5].technologies, ['Rust', 'Cargo']);
            assert.strictEqual(
                normalizePathForComparison(projects[1].workingDirectory.fsPath),
                normalizePathForComparison(path.join(workspacePath, 'apps', 'web'))
            );
        } finally {
            await fs.rm(workspacePath, { recursive: true, force: true });
        }
    });

    test('skips generated and virtual-environment directories', async () => {
        const workspacePath = await createWorkspaceFixture({
            'node_modules/hidden/package.json': '{}',
            '.git/hooks/package.json': '{}',
            'dist/output/package.json': '{}',
            '.next/cache/package.json': '{}',
            '.venv/lib/pyproject.toml': '[project]',
            'apps/visible/package.json': '{}'
        });

        try {
            const projects = await scanWorkspaceFolder({
                name: 'workspace',
                uri: vscode.Uri.file(workspacePath)
            });

            assert.deepStrictEqual(
                projects.map((project) => project.relativePath),
                ['.', 'apps/visible']
            );
        } finally {
            await fs.rm(workspacePath, { recursive: true, force: true });
        }
    });

    test('respects the configured scan-depth limit', async () => {
        const workspacePath = await createWorkspaceFixture({
            'one/two/three/four/five/package.json': '{}'
        });

        try {
            const projects = await scanWorkspaceFolder({
                name: 'workspace',
                uri: vscode.Uri.file(workspacePath)
            }, { maxDepth: 4, maxDirectories: 500 });

            assert.deepStrictEqual(
                projects.map((project) => project.relativePath),
                ['.']
            );
        } finally {
            await fs.rm(workspacePath, { recursive: true, force: true });
        }
    });

    test('respects the configured directory traversal limit', async () => {
        const workspacePath = await createWorkspaceFixture({
            'apps/web/package.json': '{}'
        });

        try {
            const projects = await scanWorkspaceFolder({
                name: 'workspace',
                uri: vscode.Uri.file(workspacePath)
            }, { maxDepth: 4, maxDirectories: 1 });

            assert.deepStrictEqual(
                projects.map((project) => project.relativePath),
                ['.']
            );
        } finally {
            await fs.rm(workspacePath, { recursive: true, force: true });
        }
    });

    test('scans multiple workspace roots independently', async () => {
        const firstWorkspacePath = await createWorkspaceFixture({
            'apps/web/package.json': '{}'
        });
        const secondWorkspacePath = await createWorkspaceFixture({
            'services/api/requirements.txt': 'django>=5.0'
        });

        try {
            const projects = await scanWorkspaceFolders([
                { name: 'first', uri: vscode.Uri.file(firstWorkspacePath) },
                { name: 'second', uri: vscode.Uri.file(secondWorkspacePath) }
            ]);

            assert.deepStrictEqual(
                projects.map((project) => `${project.name}:${project.relativePath}`),
                ['first:.', 'web:apps/web', 'second:.', 'api:services/api']
            );
            assert.ok(projects[3].technologies.includes('Django'));
        } finally {
            await Promise.all([
                fs.rm(firstWorkspacePath, { recursive: true, force: true }),
                fs.rm(secondWorkspacePath, { recursive: true, force: true })
            ]);
        }
    });
});

async function createWorkspaceFixture(files: Record<string, string>): Promise<string> {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'terminal-blueprint-'));

    await Promise.all(Object.entries(files).map(async ([relativePath, contents]) => {
        const filePath = path.join(workspacePath, relativePath);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, contents);
    }));

    return workspacePath;
}
