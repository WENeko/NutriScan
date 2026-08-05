export type VersionInfo = { versionName: string; versionCode: number };
export declare function versionFilePath(): string;
export declare function readVersionFile(path?: string): VersionInfo | null;
export declare function computeVersion(
  now?: Date,
  previous?: VersionInfo | null
): VersionInfo & { patch: number };
