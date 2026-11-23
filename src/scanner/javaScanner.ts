import * as vscode from 'vscode';
import { readSafeMetadataFile } from './safeMetadataReader';

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
        readTextFile(projectUri, 'pom.xml'),
        readTextFile(projectUri, 'build.gradle'),
        readTextFile(projectUri, 'build.gradle.kts')
    ]);
    const metadata = { pomXml, buildGradle, buildGradleKts };

    return Object.values(metadata).every((contents) => contents === undefined)
        ? undefined
        : analyzeJavaMetadata(metadata);
}

export function analyzeJavaMetadata(metadata: JavaMetadata): JavaScanResult {
    const technologies: string[] = [];
    const gradleFiles = [metadata.buildGradle, metadata.buildGradleKts]
        .filter((contents): contents is string => contents !== undefined)
        .filter(isVerifiedGradleBuild);
    const allMetadata = [metadata.pomXml, ...gradleFiles].join('\n');

    if (isValidMavenPom(metadata.pomXml)) {
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

function isValidMavenPom(pomXml: string | undefined): boolean {
    if (!pomXml) {
        return false;
    }

    const document = pomXml.trim();
    const rootMatch = document.match(/^<project(?:\s[^>]*)?>/);

    if (!rootMatch || !document.endsWith('</project>')) {
        return false;
    }

    // This is deliberately a structural check, not XML evaluation. A Maven 3 POM
    // requires a project root and model version; accepting only this conventional,
    // closed form avoids suggesting Maven commands for empty or unrelated XML.
    return /<modelVersion>\s*4\.0\.0\s*<\/modelVersion>/.test(document) &&
        hasBalancedProjectTags(document);
}

function hasBalancedProjectTags(document: string): boolean {
    const tags = document.match(/<\/?project(?:\s[^>]*)?>/g);
    return tags?.length === 2 &&
        tags[0].startsWith('<project') &&
        tags[1] === '</project>';
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

/**
 * Gradle does not offer a safe, dependency-free manifest parser. Accept only a
 * deliberately small set of static build-script constructs, rather than using
 * marker-file presence as evidence. This rejects blank, comment-only,
 * unrelated, and structurally incomplete files without evaluating the script.
 */
function isVerifiedGradleBuild(contents: string): boolean {
    const source = stripGradleComments(contents).trim();
    if (!source || !hasBalancedBraces(source)) {
        return false;
    }

    return /\bplugins\s*\{|\b(?:repositories|dependencies|configurations)\s*\{|\b(?:tasks|task)\s*(?:\{|\.)|\bapply\s+plugin\s*:|\bapply\s*\(\s*plugin\s*=/i.test(source);
}

function stripGradleComments(contents: string): string {
    return contents
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function hasBalancedBraces(contents: string): boolean {
    let depth = 0;
    for (const character of contents) {
        if (character === '{') { depth += 1; }
        if (character === '}') {
            depth -= 1;
            if (depth < 0) { return false; }
        }
    }
    return depth === 0;
}

async function readTextFile(projectUri: vscode.Uri, fileName: string): Promise<string | undefined> {
    try {
        const contents = await readSafeMetadataFile(projectUri, fileName);
        return contents ? textDecoder.decode(contents) : undefined;
    } catch {
        return undefined;
    }
}
