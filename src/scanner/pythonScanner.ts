import * as vscode from 'vscode';

export interface PythonScanResult {
    technologies: string[];
}

type PythonMetadataFile =
    | 'pyproject.toml'
    | 'requirements.txt'
    | 'Pipfile'
    | 'Pipfile.lock'
    | 'poetry.lock'
    | 'uv.lock'
    | 'manage.py';

const pythonMetadataFiles: readonly PythonMetadataFile[] = [
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'Pipfile.lock',
    'poetry.lock',
    'uv.lock',
    'manage.py'
];

const textDecoder = new TextDecoder('utf-8');

export async function scanPythonProject(
    projectUri: vscode.Uri
): Promise<PythonScanResult | undefined> {
    const metadata = await readPythonMetadata(projectUri);
    return Object.keys(metadata).length === 0
        ? undefined
        : analyzePythonMetadata(metadata);
}

export function analyzePythonMetadata(
    metadata: Readonly<Partial<Record<PythonMetadataFile, string>>>
): PythonScanResult {
    const technologies: string[] = ['Python'];
    const dependencyMetadata = [
        metadata['pyproject.toml'],
        metadata['requirements.txt'],
        metadata.Pipfile,
        metadata['Pipfile.lock'],
        metadata['poetry.lock'],
        metadata['uv.lock']
    ].filter((contents): contents is string => contents !== undefined).join('\n');

    if (metadata['requirements.txt'] !== undefined) {
        technologies.push('pip (requirements.txt)');
    }

    if (metadata.Pipfile !== undefined || metadata['Pipfile.lock'] !== undefined) {
        technologies.push('Pipenv');
    }

    if (metadata['poetry.lock'] !== undefined) {
        technologies.push('Poetry');
    }

    if (metadata['uv.lock'] !== undefined) {
        technologies.push('uv');
    }

    if (
        metadata['manage.py'] !== undefined ||
        hasDependency(dependencyMetadata, 'django')
    ) {
        technologies.push('Django');
    }

    if (hasDependency(dependencyMetadata, 'flask')) {
        technologies.push('Flask');
    }

    if (hasDependency(dependencyMetadata, 'fastapi')) {
        technologies.push('FastAPI');
    }

    return { technologies };
}

async function readPythonMetadata(
    projectUri: vscode.Uri
): Promise<Partial<Record<PythonMetadataFile, string>>> {
    const entries = await Promise.all(
        pythonMetadataFiles.map(async (fileName) => {
            try {
                const contents = await vscode.workspace.fs.readFile(
                    vscode.Uri.joinPath(projectUri, fileName)
                );
                return [fileName, textDecoder.decode(contents)] as const;
            } catch {
                return undefined;
            }
        })
    );

    return Object.fromEntries(
        entries.filter(
            (entry): entry is readonly [PythonMetadataFile, string] => entry !== undefined
        )
    ) as Partial<Record<PythonMetadataFile, string>>;
}

function hasDependency(contents: string, dependency: string): boolean {
    const escapedDependency = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quotedDependency = new RegExp(
        `["']${escapedDependency}(?:[\\s<>=!~;\\[]|["'])`,
        'i'
    );
    const tomlDependency = new RegExp(
        `\\b${escapedDependency}\\s*=`,
        'i'
    );
    const requirementDependency = new RegExp(
        `^\\s*${escapedDependency}(?:[\\s<>=!~;\\[]|$)`,
        'im'
    );

    return quotedDependency.test(contents) ||
        tomlDependency.test(contents) ||
        requirementDependency.test(contents);
}
