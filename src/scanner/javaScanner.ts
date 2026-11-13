import * as vscode from 'vscode';

export interface JavaScanResult {
    technologies: string[];
}

export interface JavaMetadata {
    pomXml?: string;
    buildGradle?: string;
    buildGradleKts?: string;
}

const textDecoder = new TextDecoder('utf-8');

export async function scanJavaProject(projectUri: vscode.Uri): Promise<JavaScanResult | undefined> {
    const [pomXml, buildGradle, buildGradleKts] = await Promise.all([
        readTextFile(vscode.Uri.joinPath(projectUri, 'pom.xml')),
        readTextFile(vscode.Uri.joinPath(projectUri, 'build.gradle')),
        readTextFile(vscode.Uri.joinPath(projectUri, 'build.gradle.kts'))
    ]);
    const metadata = { pomXml, buildGradle, buildGradleKts };

    return Object.values(metadata).every((contents) => contents === undefined)
        ? undefined
        : analyzeJavaMetadata(metadata);
}

export function analyzeJavaMetadata(metadata: JavaMetadata): JavaScanResult {
    const technologies: string[] = [];
    const gradleFiles = [metadata.buildGradle, metadata.buildGradleKts]
        .filter((contents): contents is string => contents !== undefined);
    const allMetadata = [metadata.pomXml, ...gradleFiles].join('\n');

    if (metadata.pomXml !== undefined) {
        technologies.push('Maven');
    }

    if (gradleFiles.length > 0) {
        technologies.push('Gradle');
    }

    if (hasJavaIndicator(metadata.pomXml) || gradleFiles.some(hasJavaGradlePlugin)) {
        technologies.push('Java');
    }

    if (gradleFiles.some(hasKotlinGradlePlugin)) {
        technologies.push('Kotlin');
    }

    if (hasSpringBootIndicator(allMetadata)) {
        technologies.push('Spring Boot');
    }

    return { technologies };
}

function hasJavaIndicator(pomXml: string | undefined): boolean {
    return pomXml !== undefined && /maven-compiler-plugin|maven\.compiler\.(source|target)|<source>\d+/i.test(pomXml);
}

function hasJavaGradlePlugin(contents: string): boolean {
    return /id\s*\(?\s*['"]java['"]|apply\s+plugin:\s*['"]java['"]/i.test(contents);
}

function hasKotlinGradlePlugin(contents: string): boolean {
    return /org\.jetbrains\.kotlin|kotlin\s*\(/i.test(contents);
}

function hasSpringBootIndicator(contents: string): boolean {
    return /spring-boot|org\.springframework\.boot/i.test(contents);
}

async function readTextFile(uri: vscode.Uri): Promise<string | undefined> {
    try {
        return textDecoder.decode(await vscode.workspace.fs.readFile(uri));
    } catch {
        return undefined;
    }
}
