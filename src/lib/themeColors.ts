/**
 * Module de personnalisation dynamique des couleurs de l'application.
 * Source unique de vérité : les tokens CSS déclarés dans src/index.css.
 * Les surcharges utilisateur sont stockées en localStorage puis appliquées
 * sur :root (inline) pour chaque mode (clair / sombre).
 */

export type ColorMode = "light" | "dark";

export interface ColorTokenDef {
  /** Nom du token CSS sans les tirets initiaux (ex: "primary"). */
  token: string;
  label: string;
  hint?: string;
}

export interface ColorGroupDef {
  id: string;
  label: string;
  tokens: ColorTokenDef[];
}

export const COLOR_GROUPS: ColorGroupDef[] = [
  {
    id: "base",
    label: "Base",
    tokens: [
      { token: "background", label: "Fond de l'app" },
      { token: "foreground", label: "Texte principal" },
      { token: "muted", label: "Fond atténué", hint: "Pistes de jauges, boutons inactifs" },
      { token: "muted-foreground", label: "Texte atténué" },
      { token: "border", label: "Bordures" },
    ],
  },
  {
    id: "surfaces",
    label: "Surfaces",
    tokens: [
      { token: "card", label: "Cartes" },
      { token: "card-foreground", label: "Texte sur cartes" },
      { token: "popover", label: "Popovers / menus" },
      { token: "popover-foreground", label: "Texte popovers" },
    ],
  },
  {
    id: "brand",
    label: "Marque",
    tokens: [
      { token: "primary", label: "Couleur principale", hint: "Calories, dégradé NutriGreen" },
      { token: "primary-glow", label: "Dégradé (fin)" },
      { token: "primary-foreground", label: "Texte sur principale" },
      { token: "secondary", label: "Couleur secondaire", hint: "Jauge 💪 g/kg" },
      { token: "accent", label: "Accent (fond doux)" },
      { token: "accent-foreground", label: "Texte sur accent" },
    ],
  },
  {
    id: "macros",
    label: "Macros",
    tokens: [
      { token: "macro-protein", label: "Protéines" },
      { token: "macro-carb", label: "Glucides" },
      { token: "macro-fat", label: "Lipides" },
    ],
  },
  {
    id: "state",
    label: "États",
    tokens: [
      { token: "destructive", label: "Erreur / dépassement" },
      { token: "destructive-foreground", label: "Texte sur erreur" },
      { token: "ring", label: "Focus (anneau)" },
    ],
  },
];

export const ALL_TOKENS = COLOR_GROUPS.flatMap((g) => g.tokens.map((t) => t.token));

/** Valeurs par défaut (identiques à src/index.css), format "H S% L%". */
export const DEFAULT_COLORS: Record<ColorMode, Record<string, string>> = {
  light: {
    background: "150 20% 97%",
    foreground: "160 30% 8%",
    muted: "150 15% 92%",
    "muted-foreground": "160 10% 45%",
    border: "150 15% 88%",
    card: "0 0% 100%",
    "card-foreground": "160 30% 8%",
    popover: "0 0% 100%",
    "popover-foreground": "160 30% 8%",
    primary: "160 60% 40%",
    "primary-glow": "160 50% 50%",
    "primary-foreground": "0 0% 100%",
    secondary: "40 90% 55%",
    accent: "160 40% 92%",
    "accent-foreground": "160 50% 25%",
    "macro-protein": "210 70% 55%",
    "macro-carb": "30 95% 55%",
    "macro-fat": "340 65% 55%",
    destructive: "0 72% 55%",
    "destructive-foreground": "0 0% 100%",
    ring: "160 60% 40%",
  },
  dark: {
    background: "160 20% 6%",
    foreground: "150 15% 95%",
    muted: "160 15% 15%",
    "muted-foreground": "150 10% 60%",
    border: "160 15% 18%",
    card: "160 18% 10%",
    "card-foreground": "150 15% 95%",
    popover: "160 18% 10%",
    "popover-foreground": "150 15% 95%",
    primary: "160 55% 45%",
    "primary-glow": "160 50% 55%",
    "primary-foreground": "0 0% 100%",
    secondary: "40 80% 50%",
    accent: "160 30% 18%",
    "accent-foreground": "160 40% 80%",
    "macro-protein": "210 70% 60%",
    "macro-carb": "30 95% 60%",
    "macro-fat": "340 65% 62%",
    destructive: "0 62.8% 45%",
    "destructive-foreground": "210 40% 98%",
    ring: "160 55% 45%",
  },
};

export interface ColorPreset {
  id: string;
  label: string;
  /** Surcharges appliquées aux deux modes (les autres tokens restent par défaut). */
  colors: Partial<Record<ColorMode, Record<string, string>>>;
}

export const COLOR_PRESETS: ColorPreset[] = [
  { id: "nutrigreen", label: "NutriGreen (défaut)", colors: {} },
  {
    id: "ocean",
    label: "Océan",
    colors: {
      light: { primary: "200 80% 42%", "primary-glow": "190 75% 52%", ring: "200 80% 42%", accent: "200 55% 92%", "accent-foreground": "200 60% 25%", secondary: "35 90% 55%", background: "200 25% 97%" },
      dark: { primary: "200 70% 50%", "primary-glow": "190 70% 58%", ring: "200 70% 50%", accent: "200 35% 18%", "accent-foreground": "200 45% 82%", background: "205 25% 7%", card: "205 22% 11%" },
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    colors: {
      light: { primary: "12 80% 52%", "primary-glow": "28 90% 58%", ring: "12 80% 52%", accent: "20 70% 93%", "accent-foreground": "12 60% 28%", secondary: "45 90% 52%", background: "25 30% 97%" },
      dark: { primary: "14 75% 55%", "primary-glow": "30 85% 60%", ring: "14 75% 55%", accent: "16 35% 18%", "accent-foreground": "20 50% 82%", background: "18 20% 7%", card: "18 18% 11%" },
    },
  },
  {
    id: "violet",
    label: "Violet",
    colors: {
      light: { primary: "265 65% 55%", "primary-glow": "285 70% 62%", ring: "265 65% 55%", accent: "265 55% 94%", "accent-foreground": "265 55% 30%", secondary: "45 90% 55%", background: "265 25% 98%" },
      dark: { primary: "265 60% 62%", "primary-glow": "285 65% 68%", ring: "265 60% 62%", accent: "265 30% 20%", "accent-foreground": "265 45% 85%", background: "265 20% 8%", card: "265 18% 12%" },
    },
  },
  {
    id: "mono",
    label: "Graphite",
    colors: {
      light: { primary: "220 10% 25%", "primary-glow": "220 8% 40%", ring: "220 10% 25%", accent: "220 12% 93%", "accent-foreground": "220 12% 25%", secondary: "40 60% 50%", background: "220 12% 97%" },
      dark: { primary: "220 8% 72%", "primary-glow": "220 8% 60%", "primary-foreground": "220 15% 10%", ring: "220 8% 72%", accent: "220 10% 18%", "accent-foreground": "220 10% 85%", background: "220 12% 7%", card: "220 10% 11%" },
    },
  },
];

export type ColorOverrides = Record<ColorMode, Record<string, string>>;

const STORAGE_KEY = "nutriscan-colors";
export const COLORS_CHANGED_EVENT = "nutriscan:colors-changed";

export function emptyOverrides(): ColorOverrides {
  return { light: {}, dark: {} };
}

export function loadColorOverrides(): ColorOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyOverrides();
    const parsed = JSON.parse(raw);
    return {
      light: sanitize(parsed?.light),
      dark: sanitize(parsed?.dark),
    };
  } catch {
    return emptyOverrides();
  }
}

function sanitize(obj: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const token of ALL_TOKENS) {
    const v = obj[token];
    if (typeof v === "string" && /^[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(v.trim())) out[token] = v.trim();
  }
  return out;
}

export function saveColorOverrides(overrides: ColorOverrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent(COLORS_CHANGED_EVENT));
}

/** Valeur effective d'un token pour un mode donné. */
export function effectiveColor(overrides: ColorOverrides, mode: ColorMode, token: string): string {
  return overrides[mode]?.[token] || DEFAULT_COLORS[mode][token] || "0 0% 50%";
}

/** Applique les surcharges du mode courant sur :root (et nettoie les autres). */
export function applyColorOverrides(mode: ColorMode, overrides = loadColorOverrides()) {
  const root = document.documentElement;
  const values = overrides[mode] || {};
  for (const token of ALL_TOKENS) {
    const v = values[token];
    if (v) root.style.setProperty(`--${token}`, v);
    else root.style.removeProperty(`--${token}`);
  }
  // Les variantes claires des macros suivent la teinte choisie.
  for (const [token, base] of [
    ["macro-protein-light", values["macro-protein"]],
    ["macro-carb-light", values["macro-carb"]],
    ["macro-fat-light", values["macro-fat"]],
  ] as const) {
    if (base) {
      const [h, s] = base.split(/\s+/);
      root.style.setProperty(`--${token}`, `${h} ${s} ${mode === "dark" ? "20%" : "92%"}`);
    } else {
      root.style.removeProperty(`--${token}`);
    }
  }
}

/* ---------- Conversions HSL <-> HEX ---------- */

export function hslStringToHex(hsl: string): string {
  const [hRaw, sRaw, lRaw] = hsl.trim().split(/\s+/);
  const h = parseFloat(hRaw) || 0;
  const s = (parseFloat(sRaw) || 0) / 100;
  const l = (parseFloat(lRaw) || 0) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, (v + m) * 255))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hexToHslString(hex: string): string {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return "0 0% 50%";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return `${r1(h)} ${r1(s * 100)}% ${r1(l * 100)}%`;
}

/** Couleurs résolues (hex) pour les widgets natifs — source unique de vérité. */
export function resolveWidgetTheme(mode: ColorMode, overrides = loadColorOverrides()) {
  const c = (token: string) => hslStringToHex(effectiveColor(overrides, mode, token));
  return {
    background: c("card"),
    surface: c("muted"),
    foreground: c("foreground"),
    muted_foreground: c("muted-foreground"),
    primary: c("primary"),
    primary_glow: c("primary-glow"),
    secondary: c("secondary"),
    protein: c("macro-protein"),
    carb: c("macro-carb"),
    fat: c("macro-fat"),
    accent: c("accent"),
    accent_foreground: c("accent-foreground"),
    destructive: c("destructive"),
  };
}
