export interface ReleaseNotesEntry {
  versionName: string;
  versionCode: number;
  changes: Array<{ id: string; sections: Array<{ title: string; items: string[] }> }>;
}

/** Only installed, not-yet-acknowledged versions; never future releases. */
export function missedReleaseNotes(history: ReleaseNotesEntry[], seen: number, current: number): ReleaseNotesEntry[] {
  if (seen <= 0 || current <= seen) return [];
  return history.filter(entry => entry.versionCode > seen && entry.versionCode <= current && entry.changes.length > 0)
    .sort((a, b) => b.versionCode - a.versionCode);
}