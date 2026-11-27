import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZoomPanArea } from "./useChartZoomPan";

afterEach(cleanup);

function setup() {
  const panBy = vi.fn();
  const zoomAt = vi.fn();
  const { container } = render(
    <ZoomPanArea controller={{ enabled: true, count: 30, panBy, zoomAt }}>graph</ZoomPanArea>,
  );
  const area = container.firstElementChild;
  if (!area) throw new Error("Missing chart area");
  vi.spyOn(area, "getBoundingClientRect").mockReturnValue({ width: 300, left: 0 } as DOMRect);
  return { area, panBy, zoomAt };
}

describe("chart touch gestures on extended periods", () => {
  it("keeps the timeline still throughout vertical scrolling, including horizontal drift", () => {
    const { area, panBy } = setup();
    fireEvent.touchStart(area, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(area, { touches: [{ clientX: 112, clientY: 160 }] });
    fireEvent.touchMove(area, { touches: [{ clientX: 150, clientY: 200 }] });
    expect(panBy).not.toHaveBeenCalled();
  });

  it("still pans horizontally", () => {
    const { area, panBy } = setup();
    fireEvent.touchStart(area, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(area, { touches: [{ clientX: 130, clientY: 102 }] });
    expect(panBy).toHaveBeenCalledWith(-3);
  });

  it("still zooms with a two-finger pinch", () => {
    const { area, zoomAt } = setup();
    fireEvent.touchStart(area, { touches: [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(area, { touches: [{ clientX: 50, clientY: 100 }, { clientX: 250, clientY: 100 }] });
    expect(zoomAt).toHaveBeenCalledWith(2, 0.5);
  });
});