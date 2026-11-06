import { describe, expect, it } from "vitest";
import { alignBodyTimeline, localDayCoordinate, timelineTicks } from "./evolution-timeline";

describe("shared evolution timeline", () => {
  const days = ["2026-10-22", "2026-10-23", "2026-10-24"].map((key) => ({
    key, time: localDayCoordinate(key), sessionsCount: key === "2026-10-23" ? 1 : 0,
  }));
  const readings = [
    { key: "2026-10-22", weight: 80, bodyFat: null, muscleMass: 60 },
    { key: "2026-10-24", weight: 79, bodyFat: 20, muscleMass: null },
  ];

  it("keeps 23 October at the same coordinate for every metric despite missing measurements", () => {
    const result = alignBodyTimeline(days, readings);
    expect(result.map((day) => day.time)).toEqual(days.map((day) => day.time));
    expect(result[1]).toMatchObject({ key: "2026-10-23", weight: null, bodyFat: null, muscleMass: null });
    expect(result[2]).toMatchObject({ weight: 79, bodyFat: 20, muscleMass: null });
  });

  it("preserves a session on a day without any body reading", () => {
    expect(alignBodyTimeline(days, readings)[1].sessionsCount).toBe(1);
  });

  it("does not carry previous readings into the visible window and preserves measured zeros", () => {
    const result = alignBodyTimeline(days.slice(1), [
      ...readings, { key: "2026-10-23", weight: null, bodyFat: 0, muscleMass: null },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ weight: null, bodyFat: 0 });
  });

  it("uses distinct coordinates for the same displayed date in different years", () => {
    expect(localDayCoordinate("2026-10-23")).toBeGreaterThan(localDayCoordinate("2025-10-23"));
    const date = new Date(localDayCoordinate("2026-10-23"));
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 9, 23, 0]);
  });

  it("uses identical ticks after zooming, including both visible endpoints", () => {
    expect(timelineTicks(days)).toEqual(days.map((day) => day.time));
    expect(timelineTicks(days.slice(1), 2)).toEqual([days[1].time, days[2].time]);
    expect(timelineTicks([days[0]])).toEqual([days[0].time]);
    expect(timelineTicks([])).toEqual([]);
  });
});