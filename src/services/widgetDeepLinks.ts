import { App } from "@capacitor/app";

/**
 * Gestion des deep links des widgets : nutriscan://...
 *  - nutriscan://scan?source=camera
 *  - nutriscan://scan?source=gallery
 *  - nutriscan://quicklog?meal_id=<uuid>
 *  - nutriscan://dashboard
 */

export type WidgetIntent =
  | { type: "scan"; source: "camera" | "gallery" }
  | { type: "quicklog"; mealId: string }
  | { type: "dashboard" };

export const WIDGET_INTENT_EVENT = "nutriscan:widget-intent";

/** Intent reçu avant que l'UI ne soit prête (cold start). */
let pendingIntent: WidgetIntent | null = null;

export function parseWidgetUrl(url: string): WidgetIntent | null {
  try {
    if (!url.startsWith("nutriscan://")) return null;
    const u = new URL(url);
    const host = u.host || u.pathname.replace(/\//g, "");
    if (host === "scan") {
      const source = u.searchParams.get("source") === "gallery" ? "gallery" : "camera";
      return { type: "scan", source };
    }
    if (host === "quicklog") {
      const mealId = u.searchParams.get("meal_id");
      return mealId ? { type: "quicklog", mealId } : null;
    }
    if (host === "dashboard" || host === "journal") return { type: "dashboard" };
    return null;
  } catch {
    return null;
  }
}

function emit(intent: WidgetIntent) {
  pendingIntent = intent;
  window.dispatchEvent(new CustomEvent(WIDGET_INTENT_EVENT, { detail: intent }));
}

/** Consomme l'intent en attente (utilisé au montage du Dashboard). */
export function consumePendingIntent(): WidgetIntent | null {
  const i = pendingIntent;
  pendingIntent = null;
  return i;
}

export function clearPendingIntent() {
  pendingIntent = null;
}

let initialized = false;

export async function initWidgetDeepLinks() {
  if (initialized) return;
  initialized = true;

  try {
    const launch = await App.getLaunchUrl();
    const intent = launch?.url ? parseWidgetUrl(launch.url) : null;
    if (intent) emit(intent);
  } catch {
    /* web */
  }

  try {
    await App.addListener("appUrlOpen", (data: any) => {
      const intent = data?.url ? parseWidgetUrl(data.url) : null;
      if (intent) emit(intent);
    });
  } catch {
    /* web */
  }

  // Support web/PWA : ?widget=scan&source=camera
  const params = new URLSearchParams(window.location.search);
  const widget = params.get("widget");
  if (widget) {
    const fake = `nutriscan://${widget}?${params.toString()}`;
    const intent = parseWidgetUrl(fake);
    if (intent) emit(intent);
  }
}
