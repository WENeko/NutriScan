import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/**
 * Service de synchronisation des données partagées avec les widgets d'écran d'accueil.
 * - Android : SharedPreferences (fichier "NutriScanWidget")
 * - iOS     : App Group (group.com.nutriscan.app) via Capacitor Preferences
 */

export const WIDGET_GROUP = "NutriScanWidget";
export const WIDGET_DATA_KEY = "widget_data";

export interface WidgetDailySummary {
  calories_consumed: number;
  calories_target: number;
  protein_consumed: number;
  protein_target: number;
  carbs_consumed: number;
  carbs_target: number;
  fat_consumed: number;
  fat_target: number;
}

export interface WidgetFavoriteMeal {
  id: string;
  name: string;
  calories: number;
  icon: string;
}

/** Couleurs résolues (hex) — source unique de vérité = tokens CSS de l'app. */
export type WidgetTheme = Record<string, string>;

/** Contexte permettant au widget natif d'appeler l'API en arrière-plan. */
export interface WidgetAuth {
  api_url: string;
  anon_key: string;
  access_token: string;
  /** Permet au natif de renouveler le jeton sans ouvrir l'application. */
  refresh_token?: string;
  /** Timestamp UNIX (secondes) d'expiration du jeton d'accès. */
  expires_at?: number;
}


export interface WidgetPayload {
  daily_summary: WidgetDailySummary;
  favorite_meals: WidgetFavoriteMeal[];
  theme?: WidgetTheme;
  auth?: WidgetAuth;
  updated_at: string;
}

const FALLBACK_ICONS = ["🍽️", "🥗", "🍎", "🥤"];

/** Devine une icône simple à partir du nom du repas. */
export function guessMealIcon(name: string | null | undefined, index = 0): string {
  const n = (name || "").toLowerCase();
  const rules: [RegExp, string][] = [
    [/shake|prot[ée]in|whey|smoothie|boisson|caf[ée]/, "🥤"],
    [/pomme|fruit|banane|orange|poire/, "🍎"],
    [/salade|l[ée]gume|brocoli|verdure/, "🥗"],
    [/poulet|viande|boeuf|steak|dinde/, "🍗"],
    [/poisson|saumon|thon|crevette/, "🐟"],
    [/p[âa]tes|riz|pizza|pain|sandwich|burger/, "🍝"],
    [/oeuf|omelette/, "🍳"],
    [/yaourt|fromage|lait/, "🧀"],
    [/gateau|dessert|chocolat|glace/, "🍰"],
  ];
  for (const [re, icon] of rules) if (re.test(n)) return icon;
  return FALLBACK_ICONS[index % FALLBACK_ICONS.length];
}

let configured = false;
async function ensureConfigured() {
  if (configured) return;
  await Preferences.configure({ group: WIDGET_GROUP });
  configured = true;
}

/** Écrit les données partagées et demande le rafraîchissement des widgets natifs. */
export async function syncWidgetData(payload: Omit<WidgetPayload, "updated_at">): Promise<void> {
  const data: WidgetPayload = { ...payload, updated_at: new Date().toISOString() };
  const value = JSON.stringify(data);
  try {
    if (Capacitor.isNativePlatform()) {
      await ensureConfigured();
      await Preferences.set({ key: WIDGET_DATA_KEY, value });
      await refreshNativeWidgets();
    } else {
      // Web / preview : on garde une copie locale pour le debug.
      localStorage.setItem(`${WIDGET_GROUP}:${WIDGET_DATA_KEY}`, value);
    }
  } catch (e) {
    console.warn("[widgetSync] échec de la synchronisation:", e);
  }
}

/** Lit les dernières données partagées (debug / tests). */
export async function readWidgetData(): Promise<WidgetPayload | null> {
  try {
    let raw: string | null = null;
    if (Capacitor.isNativePlatform()) {
      await ensureConfigured();
      raw = (await Preferences.get({ key: WIDGET_DATA_KEY })).value;
    } else {
      raw = localStorage.getItem(`${WIDGET_GROUP}:${WIDGET_DATA_KEY}`);
    }
    return raw ? (JSON.parse(raw) as WidgetPayload) : null;
  } catch {
    return null;
  }
}

/**
 * Notifie la couche native qu'il faut redessiner les widgets.
 * Android : broadcast custom capté par les AppWidgetProviders.
 * iOS : WidgetCenter.reloadAllTimelines déclenché côté natif.
 */
async function refreshNativeWidgets(): Promise<void> {
  try {
    const plugin = (window as any)?.Capacitor?.Plugins?.NutriScanWidgets;
    if (plugin?.refresh) await plugin.refresh();
  } catch {
    /* plugin natif optionnel */
  }
}
