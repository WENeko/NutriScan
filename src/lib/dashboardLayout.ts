export const DASHBOARD_WIDGETS = [
  "summary", "input", "budget", "water", "today", "health", "favorites", "history",
] as const;
export type DashboardWidgetId = typeof DASHBOARD_WIDGETS[number];
export interface WidgetLayout { id: DashboardWidgetId; half: boolean; hidden: boolean }
export const canUseHalfWidth = (id: DashboardWidgetId) => id === "budget" || id === "water";
export const canHideWidget = (id: DashboardWidgetId) => id !== "input";
export const defaultDashboardLayout = (): WidgetLayout[] => DASHBOARD_WIDGETS.map(id => ({
  id, half: canUseHalfWidth(id), hidden: false,
}));
export function normalizeDashboardLayout(value: unknown): WidgetLayout[] {
  if (!Array.isArray(value)) return defaultDashboardLayout();
  const result: WidgetLayout[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || !DASHBOARD_WIDGETS.includes(item.id) || result.some(w => w.id === item.id)) continue;
    const id = item.id as DashboardWidgetId;
    result.push({ id, half: canUseHalfWidth(id) && item.half === true, hidden: canHideWidget(id) && item.hidden === true });
  }
  return [...result, ...defaultDashboardLayout().filter(w => !result.some(r => r.id === w.id))];
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
export const dashboardLayoutKey = (userId: string) => `nutriscan:dashboard-layout:v1:${userId}`;
export function loadDashboardLayout(userId: string): WidgetLayout[] {
  try { return normalizeDashboardLayout(JSON.parse(localStorage.getItem(dashboardLayoutKey(userId)) || "null")); }
  catch { return defaultDashboardLayout(); }
}
export function saveDashboardLayout(userId: string, layout: WidgetLayout[]): boolean {
  try { localStorage.setItem(dashboardLayoutKey(userId), JSON.stringify(layout)); return true; }
  catch { return false; }
}