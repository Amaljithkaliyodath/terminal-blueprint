
import * as vscode from 'vscode';
import {
    DiscoveredScript,
    PackageManagerDetection,
    scanPackageJson
} from './packageJsonScanner';

// Structure of the scan result.
export interface ProjectInfo {
    name: string;
    technologies: string[];
    packageManager?: PackageManagerDetection;
    scripts: DiscoveredScript[];
}

// Detect technologies in opened workspace folders.
export async function scanProjects(): Promise<ProjectInfo[]> {

    const folders = vscode.workspace.workspaceFolders;

    // No workspace is open.
    if (!folders || folders.length === 0) {
        return [];
    }

    const projects: ProjectInfo[] = [];

    // Scan each opened workspace folder.
    for (const folder of folders) {
        projects.push(await scanProjectFolder(folder.name, folder.uri));
    }

    return projects;
}

export async function scanProjectFolder(
    name: string,
    folderUri: vscode.Uri
): Promise<ProjectInfo> {
    // Files that indicate particular project ecosystems.
    const detectionFiles: Record<string, string> = {
        'package.json': 'Node.js ecosystem',
        'pyproject.toml': 'Python',
        'requirements.txt': 'Python',
        'composer.json': 'PHP',
        'pom.xml': 'Java (Maven)',
        'build.gradle': 'Java / Gradle',
        'build.gradle.kts': 'Java / Kotlin (Gradle)',
        'go.mod': 'Go',
        'Cargo.toml': 'Rust'
    };

    const technologies: string[] = [];

    for (const [fileName, technology] of Object.entries(detectionFiles)) {

        const fileUri = vscode.Uri.joinPath(
            folderUri,
            fileName
        );

        try {

            // Check whether the file exists.
            const stat = await vscode.workspace.fs.stat(fileUri);

            // Only accept regular files.
            if (
                (stat.type & vscode.FileType.File) !== 0 &&
                !technologies.includes(technology)
            ) {
                technologies.push(technology);
            }

        } catch {
            // Missing or inaccessible file.
            // Continue scanning other files.
        }
    }

    const packageJson = await scanPackageJson(folderUri);

    if (packageJson) {
        for (const technology of packageJson.technologies) {
            if (!technologies.includes(technology)) {
                technologies.push(technology);
            }
        }
    }

    return {
        name,
        technologies,
        ...(packageJson?.packageManager
            ? { packageManager: packageJson.packageManager }
            : {}),
        scripts: packageJson?.scripts ?? []
    };
}
