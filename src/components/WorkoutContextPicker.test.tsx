import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkoutContextPicker from "./WorkoutContextPicker";

vi.mock("@/hooks/useWorkoutSuggestion", () => ({ useWorkoutSuggestion: () => "post_workout" }));
afterEach(cleanup);
describe("confirmed workout context", () => {
  it("never applies a detected session without user confirmation", () => {
    const onChange = vi.fn();
    render(<WorkoutContextPicker userId="test" timestamp="2026-10-30T18:00:00Z" value="none" onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(onChange).toHaveBeenCalledWith("post_workout");
  });
  it("lets the user explicitly choose Standard instead of a detected workout", () => {
    const onChange = vi.fn();
    render(<WorkoutContextPicker userId="test" timestamp="2026-10-30T18:00:00Z" value="post_workout" onChange={onChange} allowSuggestion={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Standard" }));
    expect(onChange).toHaveBeenCalledWith("none");
  });
});