import { useState } from "react";
import { canHideWidget, canUseHalfWidth, defaultDashboardLayout, loadDashboardLayout, reorderDashboardLayout, saveDashboardLayout, type DashboardWidgetId, type LayoutSurface, type WidgetLayout } from "@/lib/dashboardLayout";
import { toast } from "@/hooks/use-toast";

// The layout surface is keyed by account so this state never crosses sessions.
export function useDashboardLayout(userId: string, surface: LayoutSurface = "dashboard") {
  const [layout, setLayout] = useState(() => loadDashboardLayout(userId, surface));
  const update = (transform: (current: WidgetLayout[]) => WidgetLayout[]) => {
    const next = transform(layout);
    if (!saveDashboardLayout(userId, next, surface)) {
      toast({ title: "Disposition non enregistrée", description: "Le stockage de cet appareil est indisponible.", variant: "destructive" });
      return;
    }
    setLayout(next);
  };
  return {
    layout,
    move: (active: string, over: string) => update(current => reorderDashboardLayout(current, active, over)),
    toggleHidden: (id: DashboardWidgetId) => update(current => current.map(w => w.id === id && canHideWidget(id) ? { ...w, hidden: !w.hidden } : w)),
    toggleWidth: (id: DashboardWidgetId) => update(current => current.map(w => w.id === id && canUseHalfWidth(id) ? { ...w, half: !w.half } : w)),
    reset: () => update(() => defaultDashboardLayout(surface)),
  };
}