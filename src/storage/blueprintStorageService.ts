import * as vscode from 'vscode';
import { TerminalBlueprintStorageDocument } from '../models/terminalBlueprint';
import {
    BlueprintValidationError,
    createEmptyBlueprintStorageDocument,
    validateBlueprintStorageDocument
} from './blueprintValidation';

const storageFileName = 'terminal-blueprints.json';
const temporaryStorageFileName = 'terminal-blueprints.json.tmp';
const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

export interface BlueprintFileSystem {
    createDirectory(uri: vscode.Uri): Thenable<void>;
    readFile(uri: vscode.Uri): Thenable<Uint8Array>;
    writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
    rename(source: vscode.Uri, target: vscode.Uri, options: { overwrite: boolean }): Thenable<void>;
    delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void>;
}

export class BlueprintStorageError extends Error {
    public constructor(message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'BlueprintStorageError';
    }
}

export class BlueprintStorageService {
    private readonly documentUri: vscode.Uri;
    private readonly temporaryDocumentUri: vscode.Uri;
    private writeQueue: Promise<void> = Promise.resolve();

    public constructor(
        globalStorageUri: vscode.Uri,
        private readonly fileSystem: BlueprintFileSystem = vscode.workspace.fs
    ) {
        this.documentUri = vscode.Uri.joinPath(globalStorageUri, storageFileName);
        this.temporaryDocumentUri = vscode.Uri.joinPath(globalStorageUri, temporaryStorageFileName);
    }

    public async load(): Promise<TerminalBlueprintStorageDocument> {
        const contents = await this.readExistingDocument();
        return contents ?? createEmptyBlueprintStorageDocument();
    }

    public save(document: TerminalBlueprintStorageDocument): Promise<void> {
        const operation = this.enqueueWrite(async () => {
            const validatedDocument = validateBlueprintStorageDocument(document);
            // Never overwrite unreadable or malformed existing user data.
            await this.readExistingDocument();
            await this.writeDocument(validatedDocument);
        });
        return operation;
    }

    public update(
        updater: (document: TerminalBlueprintStorageDocument) => TerminalBlueprintStorageDocument
    ): Promise<TerminalBlueprintStorageDocument> {
        return this.enqueueWrite(async () => {
            const currentDocument = await this.readExistingDocument() ?? createEmptyBlueprintStorageDocument();
            const updatedDocument = validateBlueprintStorageDocument(updater(currentDocument));
            await this.writeDocument(updatedDocument);
            return updatedDocument;
        });
    }

    private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
        const queuedOperation = this.writeQueue.then(operation);
        this.writeQueue = queuedOperation.then(() => undefined, () => undefined);
        return queuedOperation;
    }

    private async readExistingDocument(): Promise<TerminalBlueprintStorageDocument | undefined> {
        let contents: Uint8Array;
        try {
            contents = await this.fileSystem.readFile(this.documentUri);
        } catch (error) {
            if (isFileNotFound(error)) {
                return undefined;
            }
            throw new BlueprintStorageError('Unable to read local Terminal Blueprint storage.', error);
        }

        try {
            const parsed: unknown = JSON.parse(textDecoder.decode(contents));
            return validateBlueprintStorageDocument(parsed);
        } catch (error) {
            if (error instanceof BlueprintValidationError) {
                throw new BlueprintStorageError(`Local Terminal Blueprint storage is invalid: ${error.message}`, error);
            }
            throw new BlueprintStorageError('Local Terminal Blueprint storage contains malformed JSON. It was not changed.', error);
        }
    }

    private async writeDocument(document: TerminalBlueprintStorageDocument): Promise<void> {
        const contents = textEncoder.encode(JSON.stringify(document, undefined, 2));
        try {
            await this.fileSystem.createDirectory(this.documentUri.with({ path: this.documentUri.path.replace(/\/[^/]+$/, '') }));
            await this.fileSystem.writeFile(this.temporaryDocumentUri, contents);
            await this.fileSystem.rename(this.temporaryDocumentUri, this.documentUri, { overwrite: true });
        } catch (error) {
            await this.removeTemporaryFile();
            throw new BlueprintStorageError('Unable to save local Terminal Blueprint storage. Existing data was left unchanged when possible.', error);
        }
    }

    private async removeTemporaryFile(): Promise<void> {
        try {
            await this.fileSystem.delete(this.temporaryDocumentUri);
        } catch {
            // Cleanup failure does not change the original storage document.
        }
    }
}

function isFileNotFound(error: unknown): boolean {
    return typeof error === 'object' && error !== null &&
        'code' in error && (error as { code?: unknown }).code === 'FileNotFound';
}
