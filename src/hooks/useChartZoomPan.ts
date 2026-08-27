import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ZoomWindow {
  start: number;
  count: number;
}

const MIN_POINTS = 5;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Fenêtrage (zoom pincement + pan horizontal) sur un axe temporel catégoriel.
 * Le zoom est partagé entre tous les graphiques de la page.
 */
export function useChartZoomPan(total: number, defaultCount: number, enabled: boolean) {
  const [win, setWin] = useState<ZoomWindow>({ start: 0, count: defaultCount });

  // Recalage lorsque les données ou la période changent
  useEffect(() => {
    const count = clamp(defaultCount, MIN_POINTS, Math.max(total, MIN_POINTS));
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
    (deltaIndex: number) => {
      setWin((prev) => normalize({ start: prev.start + deltaIndex, count: prev.count }));
    },
    [normalize],
  );

  const reset = useCallback(() => {
    const count = clamp(defaultCount, MIN_POINTS, Math.max(total, MIN_POINTS));
    setWin({ start: Math.max(0, total - count), count });
  }, [defaultCount, total]);

  const effective = useMemo(() => (enabled ? normalize(win) : { start: 0, count: total }), [enabled, normalize, win, total]);

  const isZoomed = enabled && effective.count < total;

  /** Attache les gestes (pinch + drag) sur un conteneur */
  const bindRef = useCallback(
    (el: HTMLDivElement | null) => {
      gestureTargetRef.current = el;
    },
    [],
  );

  const gestureTargetRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ zoomAt, panBy, count: effective.count, enabled });
  stateRef.current = { zoomAt, panBy, count: effective.count, enabled };

  useEffect(() => {
    const el = gestureTargetRef.current;
    if (!el) return;

    let pinchDist = 0;
    let lastX = 0;
    let dragging = false;
    let accumulated = 0;

    const width = () => el.getBoundingClientRect().width || 1;

    const onTouchStart = (e: TouchEvent) => {
      if (!stateRef.current.enabled) return;
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
      if (!stateRef.current.enabled) return;
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (pinchDist > 0 && dist > 0) {
          const rect = el.getBoundingClientRect();
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const anchor = clamp(midX / rect.width, 0, 1);
          stateRef.current.zoomAt(dist / pinchDist, anchor);
        }
        pinchDist = dist;
        e.preventDefault();
        return;
      }
      if (dragging && e.touches.length === 1) {
        const x = e.touches[0].clientX;
        const dx = x - lastX;
        lastX = x;
        accumulated += (-dx / width()) * stateRef.current.count;
        const whole = Math.trunc(accumulated);
        if (whole !== 0) {
          stateRef.current.panBy(whole);
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
      if (!stateRef.current.enabled) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const anchor = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        stateRef.current.zoomAt(Math.exp(-dy * 0.0025), anchor);
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
  }, [enabled]);

  return { window: effective, isZoomed, reset, bindRef };
}
