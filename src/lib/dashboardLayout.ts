export const DASHBOARD_WIDGETS = [
  "cycling", "summary", "input", "budget", "water", "today", "health", "favorites", "history",
] as const;
export const EVOLUTION_WIDGETS = ["evo_calories", "evo_macros", "evo_micros", "evo_custom", "evo_body"] as const;
export type LayoutSurface = "dashboard" | "evolution";
export type DashboardWidgetId = typeof DASHBOARD_WIDGETS[number] | typeof EVOLUTION_WIDGETS[number];
const widgetsFor = (surface: LayoutSurface): readonly DashboardWidgetId[] => surface === "evolution" ? EVOLUTION_WIDGETS : DASHBOARD_WIDGETS;
export interface WidgetLayout { id: DashboardWidgetId; half: boolean; hidden: boolean }
export const canUseHalfWidth = (id: DashboardWidgetId) => id === "budget" || id === "water";
export const canHideWidget = (id: DashboardWidgetId) => id !== "input";
export const defaultDashboardLayout = (surface: LayoutSurface = "dashboard"): WidgetLayout[] => widgetsFor(surface).map(id => ({
  id, half: canUseHalfWidth(id), hidden: false,
}));
export function normalizeDashboardLayout(value: unknown, surface: LayoutSurface = "dashboard"): WidgetLayout[] {
  if (!Array.isArray(value)) return defaultDashboardLayout(surface);
  const result: WidgetLayout[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || !widgetsFor(surface).includes(item.id) || result.some(w => w.id === item.id)) continue;
    const id = item.id as DashboardWidgetId;
    result.push({ id, half: canUseHalfWidth(id) && item.half === true, hidden: canHideWidget(id) && item.hidden === true });
  }
  return [...result, ...defaultDashboardLayout(surface).filter(w => !result.some(r => r.id === w.id))];
}
export function reorderDashboardLayout(layout: WidgetLayout[], active: string, over: string): WidgetLayout[] {
  const from = layout.findIndex(w => w.id === active);
  const to = layout.findIndex(w => w.id === over);
  if (from < 0 || to < 0 || from === to) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
export const dashboardLayoutKey = (userId: string, surface: LayoutSurface = "dashboard") => surface === "dashboard" ? `nutriscan:dashboard-layout:v1:${userId}` : `nutriscan:${surface}-layout:v1:${userId}`;
export function loadDashboardLayout(userId: string, surface: LayoutSurface = "dashboard"): WidgetLayout[] {
  try { return normalizeDashboardLayout(JSON.parse(localStorage.getItem(dashboardLayoutKey(userId, surface)) || "null"), surface); }
  catch { return defaultDashboardLayout(surface); }
}
export function saveDashboardLayout(userId: string, layout: WidgetLayout[], surface: LayoutSurface = "dashboard"): boolean {
  try { localStorage.setItem(dashboardLayoutKey(userId, surface), JSON.stringify(layout)); return true; }
  catch { return false; }
}