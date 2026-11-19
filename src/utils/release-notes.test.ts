import { describe, expect, it } from "vitest";
import { missedReleaseNotes, type ReleaseNotesEntry } from "./release-notes";

const entry = (day: number): ReleaseNotesEntry => ({
  versionName: `2026.11.${day}.01`, versionCode: Number(`202611${day}01`),
  changes: [{ id: `change-${day}`, sections: [{ title: "Nouveautés", items: ["Amélioration"] }] }],
});
const history = [entry(15), entry(16), entry(17), entry(18), entry(19)];

describe("offline cumulative release notes", () => {
  it("includes all three skipped versions, newest first, excluding future and acknowledged ones", () => {
    expect(missedReleaseNotes(history, 2026111501, 2026111801).map(e => e.versionCode))
      .toEqual([2026111801, 2026111701, 2026111601]);
  });
  it("does not show notes on first launch or after acknowledgement", () => {
    expect(missedReleaseNotes(history, 0, 2026111801)).toEqual([]);
    expect(missedReleaseNotes(history, 2026111801, 2026111801)).toEqual([]);
  });
  it("does not repeat features for rebuilds without new changes", () => {
    expect(missedReleaseNotes([{ ...entry(18), changes: [] }], 2026111701, 2026111801)).toEqual([]);
  });
});