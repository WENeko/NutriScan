import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ZoomWindow {
  start: number;
  count: number;
}

const MIN_POINTS = 5;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Fenêtrage partagé (zoom pincement + pan horizontal) sur un axe temporel catégoriel.
 */
export function useChartZoomPan(total: number, defaultCount: number, enabled: boolean) {
  const [win, setWin] = useState<ZoomWindow>({ start: 0, count: defaultCount });

  useEffect(() => {
    const count = clamp(defaultCount, Math.min(MIN_POINTS, total || MIN_POINTS), Math.max(total, MIN_POINTS));
    setWin({ start: Math.max(0, total - count), count });
  }, [total, defaultCount]);

  const normalize = useCallback(
    (w: ZoomWindow): ZoomWindow => {
      if (total <= 0) return { start: 0, count: 0 };
      const count = clamp(Math.round(w.count), Math.min(MIN_POINTS, total), total);
      const start = clamp(Math.round(w.start), 0, total - count);
      return { start, count };
    },
    [total],
  );

  const zoomAt = useCallback(
    (factor: number, anchorFraction: number) => {
      setWin((prev) => {
        const nextCount = clamp(prev.count / factor, Math.min(MIN_POINTS, total), total);
        const anchorIndex = prev.start + prev.count * anchorFraction;
        return normalize({ start: anchorIndex - nextCount * anchorFraction, count: nextCount });
      });
    },
    [normalize, total],
  );

  const panBy = useCallback(
    (deltaIndex: number) => setWin((prev) => normalize({ start: prev.start + deltaIndex, count: prev.count })),
    [normalize],
  );

  const reset = useCallback(() => {
    const count = clamp(defaultCount, Math.min(MIN_POINTS, total || MIN_POINTS), Math.max(total, MIN_POINTS));
    setWin({ start: Math.max(0, total - count), count });
  }, [defaultCount, total]);

  const effective = useMemo<ZoomWindow>(
    () => (enabled ? normalize(win) : { start: 0, count: total }),
    [enabled, normalize, win, total],
  );

  const controller = useMemo(
    () => ({ zoomAt, panBy, enabled, count: effective.count }),
    [zoomAt, panBy, enabled, effective.count],
  );

  return {
    window: effective,
    isZoomed: enabled && total > 0 && effective.count < total,
    reset,
    controller,
  };
}

export type ZoomPanController = ReturnType<typeof useChartZoomPan>["controller"];

interface ZoomPanAreaProps {
  controller: ZoomPanController;
  className?: string;
  children: React.ReactNode;
}

/** Zone capturant pincement (zoom) et glissement horizontal (pan) pour un graphique. */
export const ZoomPanArea: React.FC<ZoomPanAreaProps> = ({ controller, className, children }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const ctrl = useRef(controller);
  ctrl.current = controller;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let pinchDist = 0;
    let lastX = 0;
    let dragging = false;
    let accumulated = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (!ctrl.current.enabled) return;
      if (e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        dragging = false;
      } else if (e.touches.length === 1) {
        lastX = e.touches[0].clientX;
        dragging = true;
        accumulated = 0;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!ctrl.current.enabled) return;
      const rect = el.getBoundingClientRect();
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (pinchDist > 0 && dist > 0) {
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          ctrl.current.zoomAt(dist / pinchDist, clamp(midX / (rect.width || 1), 0, 1));
        }
        pinchDist = dist;
        e.preventDefault();
        return;
      }
      if (dragging && e.touches.length === 1) {
        const x = e.touches[0].clientX;
        const dx = x - lastX;
        lastX = x;
        accumulated += (-dx / (rect.width || 1)) * ctrl.current.count;
        const whole = Math.trunc(accumulated);
        if (whole !== 0) {
          ctrl.current.panBy(whole);
          accumulated -= whole;
          e.preventDefault();
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        dragging = false;
        pinchDist = 0;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!ctrl.current.enabled) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        ctrl.current.zoomAt(Math.exp(-dy * 0.0025), clamp((e.clientX - rect.left) / (rect.width || 1), 0, 1));
        e.preventDefault();
      } else if (Math.abs(e.deltaX) > Math.abs(dy)) {
        ctrl.current.panBy(Math.sign(e.deltaX) * Math.max(1, Math.round(ctrl.current.count / 20)));
        e.preventDefault();
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={controller.enabled ? { touchAction: "pan-y" } : undefined}
    >
      {children}
    </div>
  );
};
