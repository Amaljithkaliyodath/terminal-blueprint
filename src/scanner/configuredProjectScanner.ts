import { createScanLimits, TerminalBlueprintSettings } from '../config/terminalBlueprintConfiguration';
import { ProjectInfo, ScanLimits, scanProjects } from './projectScanner';

export type ProjectScanner = (limits?: ScanLimits) => Promise<ProjectInfo[]>;

export function scanProjectsWithSettings(
    readSettings: () => TerminalBlueprintSettings,
    scanner: ProjectScanner = scanProjects
): Promise<ProjectInfo[]> {
    return scanner(createScanLimits(readSettings()));
}
