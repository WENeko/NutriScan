/**
 * Catalogue des fournisseurs d'IA connus (métadonnées d'interface).
 *
 * La liste des fournisseurs réellement disponibles vient de la base (table
 * `ai_providers`, gérée par l'admin). Ce catalogue enrichit chaque fournisseur
 * connu (matché par l'hôte de son `base_url`) avec :
 *  - un libellé d'affichage et une icône,
 *  - un ordre de popularité (les plus populaires en haut),
 *  - une regex de validation du format de clé (coche verte),
 *  - un modèle "placeholder" intelligent (jamais figé comme valeur forcée),
 *  - un guide d'obtention de clé (URL + étapes + gratuité).
 *
 * AUCUN modèle n'est figé dans le code : le placeholder n'est utilisé que pour
 * suggérer une saisie quand la liste dynamique n'a pas pu être récupérée.
 */
import type { ApiType } from "@/lib/aiAccess";

export interface ProviderGuideStep {
  text: string;
}

export interface ProviderCatalogEntry {
  /** Identifiant interne du catalogue. */
  key: string;
  /** Libellé affiché (peut différer du nom DB). */
  label: string;
  /** Icône (emoji) affichée dans la carte. */
  icon: string;
  /** Type d'API attendu (cohérence visuelle). */
  apiType: ApiType;
  /** Ordre de popularité (plus petit = plus haut). */
  popularity: number;
  /** Regex de validation du format de la clé. */
  keyRegex: RegExp;
  /** Exemple de format de clé (placeholder du champ). */
  keyPlaceholder: string;
  /** Modèle suggéré quand la liste dynamique est indisponible. */
  modelPlaceholder: string;
  /** Guide d'obtention de clé. */
  guide: {
    url: string;
    free: boolean;
    steps: string[];
  };
}

/** Catalogue par hôte (clé = hostname normalisé du base_url). */
const CATALOG_BY_HOST: Record<string, ProviderCatalogEntry> = {
  "generativelanguage.googleapis.com": {
    key: "google",
    label: "Google AI Studio",
    icon: "✨",
    apiType: "gemini",
    popularity: 1,
    keyRegex: /^AIza[0-9A-Za-z\-_]{30,}$/,
    keyPlaceholder: "AIza…",
    modelPlaceholder: "gemini-flash-latest",
    guide: {
      url: "https://aistudio.google.com/app/apikey",
      free: true,
      steps: [
        "Ouvrez Google AI Studio (lien ci-dessous).",
        "Connectez-vous avec votre compte Google.",
        "Cliquez sur « Create API key », puis copiez la clé (elle commence par AIza).",
      ],
    },
  },
  "api.groq.com": {
    key: "groq",
    label: "Groq",
    icon: "⚡",
    apiType: "openai",
    popularity: 2,
    keyRegex: /^gsk_[0-9A-Za-z]{20,}$/,
    keyPlaceholder: "gsk_…",
    modelPlaceholder: "llama-3.3-70b-versatile",
    guide: {
      url: "https://console.groq.com/keys",
      free: true,
      steps: [
        "Ouvrez la console Groq (lien ci-dessous).",
        "Connectez-vous puis allez dans « API Keys ».",
        "Cliquez sur « Create API Key » et copiez la clé (elle commence par gsk_).",
      ],
    },
  },
  "openrouter.ai": {
    key: "openrouter",
    label: "OpenRouter",
    icon: "🧭",
    apiType: "openai",
    popularity: 3,
    keyRegex: /^sk-or-[0-9A-Za-z\-_]{20,}$/,
    keyPlaceholder: "sk-or-…",
    modelPlaceholder: "meta-llama/llama-3.3-70b-instruct",
    guide: {
      url: "https://openrouter.ai/keys",
      free: true,
      steps: [
        "Ouvrez OpenRouter (lien ci-dessous).",
        "Connectez-vous puis ouvrez la page « Keys ».",
        "Cliquez sur « Create Key » et copiez la clé (elle commence par sk-or-).",
      ],
    },
  },
  "models.github.ai": {
    key: "github",
    label: "GitHub Models",
    icon: "🐙",
    apiType: "openai",
    popularity: 4,
    keyRegex: /^(gh[ps]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,})$/,
    keyPlaceholder: "ghp_… ou github_pat_…",
    modelPlaceholder: "openai/gpt-4o-mini",
    guide: {
      url: "https://github.com/settings/tokens",
      free: true,
      steps: [
        "Ouvrez les paramètres de jetons GitHub (lien ci-dessous).",
        "Générez un « Fine-grained token » avec la permission « Models ».",
        "Copiez le jeton (il commence par ghp_ ou github_pat_).",
      ],
    },
  },
  "models.inference.ai.azure.com": {
    key: "github",
    label: "GitHub Models",
    icon: "🐙",
    apiType: "openai",
    popularity: 4,
    keyRegex: /^(gh[ps]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{30,})$/,
    keyPlaceholder: "ghp_… ou github_pat_…",
    modelPlaceholder: "gpt-4o-mini",
    guide: {
      url: "https://github.com/settings/tokens",
      free: true,
      steps: [
        "Ouvrez les paramètres de jetons GitHub (lien ci-dessous).",
        "Générez un « Fine-grained token » (ou classique) sans permission particulière.",
        "Copiez le jeton (il commence par ghp_ ou github_pat_).",
      ],
    },
  },
};

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.toLowerCase();
  } catch {
    return baseUrl
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .toLowerCase();
  }
}

/** Retourne les métadonnées catalogue d'un fournisseur (par son base_url), ou null. */
export function getCatalogEntry(baseUrl: string): ProviderCatalogEntry | null {
  return CATALOG_BY_HOST[hostOf(baseUrl)] ?? null;
}

/** Ordre de popularité (fournisseurs connus en premier, puis le reste). */
export function popularityOf(baseUrl: string): number {
  return getCatalogEntry(baseUrl)?.popularity ?? 999;
}

/**
 * Modèle de repli intelligent selon le fournisseur (jamais forcé : utilisé
 * uniquement quand l'utilisateur n'a pas sélectionné de modèle).
 */
export function fallbackModelFor(baseUrl: string, apiType: ApiType): string {
  const entry = getCatalogEntry(baseUrl);
  if (entry) return entry.modelPlaceholder;
  if (apiType === "local" || apiType === "local_intent") return "gemma-3-4b-it";
  return apiType === "openai" ? "gpt-4o-mini" : "gemini-flash-latest";
}

/** Valide le format d'une clé pour un fournisseur connu. true si pas de regex (inconnu). */
export function isKeyFormatValid(baseUrl: string, key: string): boolean {
  const entry = getCatalogEntry(baseUrl);
  if (!entry) return key.trim().length > 0;
  return entry.keyRegex.test(key.trim());
}
