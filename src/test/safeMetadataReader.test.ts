import * as assert from 'assert';
import * as vscode from 'vscode';
import { hasSafeMetadataFile, MetadataFileSystem, readSafeMetadataFile } from '../scanner/safeMetadataReader';

suite('Safe Metadata Reader', () => {
    test('reads legitimate regular metadata files for every supported scanner', async () => {
        const root = vscode.Uri.parse('memfs:/workspace/project');
        const files = new MetadataFileSystemMock();
        const names = ['package.json', 'go.mod', 'Cargo.toml', 'requirements.txt', 'pyproject.toml', 'composer.json', 'artisan', 'pom.xml', 'build.gradle', 'build.gradle.kts'];
        for (const name of names) { files.add(root, name, vscode.FileType.File, name); }

        for (const name of names) {
            assert.strictEqual(await hasSafeMetadataFile(root, name, files), true);
            assert.strictEqual(new TextDecoder().decode(await readSafeMetadataFile(root, name, files)), name);
        }
    });

    test('rejects symlinked metadata even when FileType.File is also set', async () => {
        const root = vscode.Uri.parse('memfs:/workspace/project');
        const files = new MetadataFileSystemMock();
        for (const name of ['package.json', 'go.mod', 'Cargo.toml', 'requirements.txt', 'composer.json', 'pom.xml', 'build.gradle.kts']) {
            files.add(root, name, vscode.FileType.File | vscode.FileType.SymbolicLink, 'outside metadata');
            assert.strictEqual(await hasSafeMetadataFile(root, name, files), false);
            assert.strictEqual(await readSafeMetadataFile(root, name, files), undefined);
        }
        assert.strictEqual(files.reads, 0);
    });

    test('rejects directories, missing files, invalid names, and filesystem failures without reading', async () => {
        const root = vscode.Uri.parse('memfs:/workspace/project');
        const files = new MetadataFileSystemMock();
        files.add(root, 'package.json', vscode.FileType.Directory, 'not metadata');
        files.failStat.add(vscode.Uri.joinPath(root, 'go.mod').toString());
        files.failRead.add(vscode.Uri.joinPath(root, 'Cargo.toml').toString());
        files.add(root, 'Cargo.toml', vscode.FileType.File, 'metadata');

        assert.strictEqual(await readSafeMetadataFile(root, 'package.json', files), undefined);
        assert.strictEqual(await readSafeMetadataFile(root, 'missing.json', files), undefined);
        assert.strictEqual(await readSafeMetadataFile(root, '../outside.json', files), undefined);
        assert.strictEqual(await readSafeMetadataFile(root, 'go.mod', files), undefined);
        assert.strictEqual(await readSafeMetadataFile(root, 'Cargo.toml', files), undefined);
        assert.strictEqual(files.reads, 1);
    });

    test('does not create terminals or write workspace files while validating metadata', async () => {
        const terminalCount = vscode.window.terminals.length;
        const root = vscode.Uri.parse('memfs:/workspace/project');
        const files = new MetadataFileSystemMock();
        files.add(root, 'package.json', vscode.FileType.File | vscode.FileType.SymbolicLink, '{}');
        await readSafeMetadataFile(root, 'package.json', files);
        assert.strictEqual(vscode.window.terminals.length, terminalCount);
        assert.strictEqual(files.writes, 0);
    });
});

class MetadataFileSystemMock implements MetadataFileSystem {
    public readonly failStat = new Set<string>();
    public readonly failRead = new Set<string>();
    public reads = 0;
    public writes = 0;
    private readonly entries = new Map<string, { type: vscode.FileType; contents: Uint8Array }>();

    public add(root: vscode.Uri, name: string, type: vscode.FileType, contents: string): void {
        this.entries.set(vscode.Uri.joinPath(root, name).toString(), { type, contents: new TextEncoder().encode(contents) });
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        if (this.failStat.has(uri.toString())) { throw new Error('stat failed'); }
        const entry = this.entries.get(uri.toString());
        if (!entry) { throw fileNotFound(); }
        return { type: entry.type, ctime: 0, mtime: 0, size: entry.contents.byteLength };
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        this.reads += 1;
        if (this.failRead.has(uri.toString())) { throw new Error('read failed'); }
        const entry = this.entries.get(uri.toString());
        if (!entry) { throw fileNotFound(); }
        return entry.contents;
    }
}

function fileNotFound(): Error & { code: string } {
    return Object.assign(new Error('File not found'), { code: 'FileNotFound' });
}
