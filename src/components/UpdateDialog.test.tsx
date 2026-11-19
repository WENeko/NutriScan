import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import UpdateDialog from "./UpdateDialog";

vi.mock("@/data/release-history.json", () => ({ default: [16, 17, 18].map(day => ({
  versionName: `2026.11.${day}.01`, versionCode: Number(`202611${day}01`),
  changes: [{ id: String(day), sections: [{ title: "Amélioration", items: [`Nouveauté ${day}`] }] }],
})) }));
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it("acknowledging the installed update prevents repeat announcements on reopening", async () => {
  vi.stubGlobal("__APP_VERSION_CODE__", "2026111801");
  vi.stubGlobal("__APP_VERSION__", "2026.11.18.01");
  localStorage.setItem("nutriscan-update-seen-version", "2026111501");
  const first = render(<UpdateDialog />);
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "C’est compris" }));
  expect(localStorage.getItem("nutriscan-update-seen-version")).toBe("2026111801");
  first.unmount();
  await act(async () => { render(<UpdateDialog />); });
  expect(screen.queryByRole("dialog")).toBeNull();
});