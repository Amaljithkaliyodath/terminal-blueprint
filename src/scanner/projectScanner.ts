
import * as vscode from 'vscode';

// Structure of the scan result.
export interface ProjectInfo {
    name: string;
    technologies: string[];
}

// Detect technologies in opened workspace folders.
export async function scanProjects(): Promise<ProjectInfo[]> {

    const folders = vscode.workspace.workspaceFolders;

    // No workspace is open.
    if (!folders || folders.length === 0) {
        return [];
    }

    const projects: ProjectInfo[] = [];

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

    // Scan each opened workspace folder.
    for (const folder of folders) {

        const technologies: string[] = [];

        for (const [fileName, technology] of Object.entries(detectionFiles)) {

            const fileUri = vscode.Uri.joinPath(
                folder.uri,
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

        projects.push({
            name: folder.name,
            technologies
        });
    }

    return projects;
}
