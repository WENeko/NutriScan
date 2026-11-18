import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkoutAutoClassification from "./WorkoutAutoClassification";
const mocks = vi.hoisted(() => ({ updates: vi.fn(), meals: [
  { id: "first", timestamp: "2026-11-17T17:00:00Z", meal_name: "First", peri_workout: "none", workout_context_locked: false },
  { id: "second", timestamp: "2026-11-17T17:00:00Z", meal_name: "Second", peri_workout: "none", workout_context_locked: false },
] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./WorkoutContextPicker", () => ({ WORKOUT_LABELS: { pre_workout: "Pré-effort" } }));
vi.mock("@/services/training-days", () => ({ readSessionsInRange: async () => [{ source_package: "approved", start_time: "2026-11-17T18:00:00Z", end_time: "2026-11-17T19:00:00Z" }] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let updating = false;
  const result = () => ({ data: updating ? [{ id: "saved" }] : mocks.meals, error: null });
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "gte", "lte", "order", "range"]) query[method] = () => query;
  query.update = (values: unknown) => { updating = true; mocks.updates(values); return query; };
  query.single = async () => ({ data: { sport_preset: "hypertrophy", workout_windows: { preMin: 90, postMin: 120 }, sport_allowed_sources: ["approved"] }, error: null });
  query.then = (resolve: (value: unknown) => void) => Promise.resolve(table === "profiles" ? null : result()).then(resolve);
  return query;
} } }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
describe("saved meal countdown", () => {
  it("gives each queued meal five seconds and persists cancellation", async () => {
    vi.useFakeTimers();
    render(<WorkoutAutoClassification userId="test" />);
    await act(flush);
    expect(mocks.updates).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(5000); await flush(); });
    expect(mocks.updates).toHaveBeenCalledTimes(1);
    expect(mocks.updates).toHaveBeenLastCalledWith({ peri_workout: "pre_workout" });
    await act(async () => { vi.advanceTimersByTime(4000); await flush(); });
    expect(mocks.updates).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Annuler" })); await flush(); });
    expect(mocks.updates).toHaveBeenLastCalledWith({ workout_context_locked: true });
  });
});