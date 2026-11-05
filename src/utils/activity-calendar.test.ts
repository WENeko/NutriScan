import { describe, it, expect } from "vitest";
import { buildMonthGrid, sessionsByDate } from "./activity-calendar";

const cycling = { enabled: true, multipliers: [1.05, 0.96, 1.05, 0.96, 1.05, 0.96, 0.96], trainingDays: [0, 2, 4] };

describe("activity calendar", () => {
  it("starts the grid on Monday and uses the weekly routine", () => {
    const grid = buildMonthGrid(new Date(2026, 10, 1), new Date(2026, 10, 5), cycling, {}, {}, {}, {});
    expect(grid[0].date).toBe("2026-10-26"); // lundi
    const nov2 = grid.find(d => d.date === "2026-11-02")!; // lundi
    expect(nov2.planned).toBe("training");
    expect(grid.find(d => d.date === "2026-11-03")!.planned).toBe("rest");
  });
  it("a dated exception overrides only that date", () => {
    const grid = buildMonthGrid(new Date(2026, 10, 1), new Date(2026, 10, 5), cycling, { "2026-11-04": "rest", "2026-11-05": "training" }, {}, {}, {});
    expect(grid.find(d => d.date === "2026-11-04")!.planned).toBe("rest");
    expect(grid.find(d => d.date === "2026-11-05")!.planned).toBe("training");
    expect(grid.find(d => d.date === "2026-11-11")!.planned).toBe("training");
  });
  it("counts only sessions from approved sources", () => {
    const s = [
      { source_package: "com.sec.android.app.shealth", start_time: "2026-11-04T17:30:00", end_time: "2026-11-04T18:30:00" },
      { source_package: "com.other", start_time: "2026-11-04T08:00:00", end_time: "2026-11-04T09:00:00" },
    ];
    expect(sessionsByDate(s, ["com.sec.android.app.shealth"])).toEqual({ "2026-11-04": 1 });
  });
});
