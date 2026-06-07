// src/services/geminiAiService.ts
// Couche d'intégration IA : edge functions Lovable (si autorisé) ou fournisseur perso
// (Gemini ou compatible OpenAI) sélectionné par l'utilisateur, avec modèle au choix.
import { NUTRIENTS_STD_LIST } from '@/utils/nutrition-logic';
import { appLogger } from './appLogger';
import { supabase } from '@/integrations/supabase/client';
import { isLovableAiEnabled, getActiveProviderConfig } from '@/lib/aiAccess';

// ============================================================
// SYSTÈME DE CACHE
// ============================================================

interface CacheEntry {
  result: any;
  timestamp: number;
  imageHash: string;
}

class AnalysisCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 50; // Max 50 analyses en cache
  private ttlMs = 24 * 60 * 60 * 1000; // 24h de validité

  private hashImage(imageData: string): string {
    // Hash simple basé sur les 100 premiers caractères
    return imageData.slice(0, 100) + imageData.slice(-50);
  }

  get(imageData: string, text?: string): any | null {
    const key = this.hashImage(imageData) + (text || "");
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Vérifier TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    appLogger.debug("GeminiCache", "Cache hit", { age: Date.now() - entry.timestamp });
    return entry.result;
  }

  set(imageData: string, text: string | undefined, result: any): void {
    // Nettoyer si trop de cache
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    const key = this.hashImage(imageData) + (text || "");
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      imageHash: this.hashImage(imageData)
    });
    
    appLogger.debug("GeminiCache", "Stored in cache", { cacheSize: this.cache.size });
  }

  clear(): void {
    this.cache.clear();
    appLogger.info("GeminiCache", "Cache cleared");
  }
}

const analysisCache = new AnalysisCache();

// ============================================================
// ANALYSE GEMINI AVEC FALLBACK ET CACHE
// ============================================================

/**
 * Analyse une image ou du texte d'un repas avec l'API Gemini.
 * @param input Objet: { image?: string (URL/base64), text?: string, custom_foods?: CustomFood[], local_time?: string, check_nutrient?: string, requestedMicros?: string[] }
 * @returns Réponse IA structurée ({ meal_name, confidence_score, suggested_timestamp?, items: [...] })
 * Chaque item contient: food_name, calories, proteins, carbs, fats, quantity, unit_count?, unit_label?, unit_weight_g?, 
 * PLUS tous les micronutriments de NUTRIENTS_STD_LIST (fiber, sugar, saturated_fat, omega3_mg, sodium_mg, potassium_mg, magnesium_mg, calcium_mg, iron_mg, zinc_mg, vitamin_b_mg, vitamin_b9_mcg, vitamin_b12_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg)
 */
export async function analyzeMealWithGemini({ image, text, custom_foods, custom_nutrients, local_time, check_nutrient, requestedMicros = [], providerOverride }: {
  image?: string;
  text?: string;
  custom_foods?: any[];
  custom_nutrients?: { key: string; label?: string; unit: string }[];
  local_time?: string;
  check_nutrient?: string;
  requestedMicros?: string[];
  /** Force l'usage d'un fournisseur précis (utilisé par le moteur de fallback en cascade). */
  providerOverride?: import("@/lib/aiAccess").ActiveProviderConfig | null;
}): Promise<any> {
  // Vérifier le cache si on a une image (désactivé lorsqu'un fournisseur précis est imposé)
  if (image && !providerOverride) {
    const cached = analysisCache.get(image, text);
    if (cached) {
      appLogger.info("IA", "Analyse servie depuis le cache");
      return cached;
    }
  }

  // ── ROUTAGE IA ──────────────────────────────────────────────
  // Si aucun fournisseur n'est imposé ET que l'utilisateur est autorisé → edge function Lovable.
  if (!providerOverride && isLovableAiEnabled()) {
    appLogger.info("IA", "Analyse via edge function Lovable");
    const { data, error } = await supabase.functions.invoke("analyze-meal", {
      body: { image, text, custom_foods, custom_nutrients, local_time },
    });
    if (error) {
      appLogger.error("IA", "Erreur edge function analyze-meal", error);
      throw new Error(error.message || "Erreur d'analyse IA Lovable");
    }
    if (data?.error) throw new Error(data.error);
    if (image && typeof data === "object") analysisCache.set(image, text, data);
    return data;
  }

  // Sinon → fournisseur d'IA perso (imposé par le moteur, ou sélection par défaut).
  const provider = providerOverride ?? (typeof window !== "undefined" ? getActiveProviderConfig() : null);
  const apiKey = provider?.apiKey || (typeof window !== "undefined" ? import.meta.env.VITE_GEMINI_API_KEY : undefined);
  const apiType = provider?.apiType ?? "gemini";

  if (!apiKey) {
    appLogger.error("IA", "Aucune clé API fournisseur configurée");
    throw new Error("Aucune clé API configurée. Choisissez un fournisseur et entrez votre clé dans Réglages, ou demandez l'accès à l'IA Lovable à un administrateur.");
  }


  // Liste master + custom user
  const defaultMicroKeys = NUTRIENTS_STD_LIST.map(n => n.key);
  const customKeys = (custom_nutrients || []).map(c => c.key).filter(Boolean);
  const microKeysToRequest = requestedMicros.length ? requestedMicros : [...defaultMicroKeys, ...customKeys];

  // Construire la liste des micronutriments pour le prompt
  const microFieldsList = microKeysToRequest.join(", ");
  
  // System prompt ALIGNÉ sur la function Lovable `analyze-meal`
  // (mêmes noms de champs : name, estimated_weight_g, unit_count, unit_weight_g, unit_label)
  const basePrompt = `Tu es un nutritionniste expert. Analyse l'entrée (image ou texte) et estime précisément le poids de chaque ingrédient. Si c'est une image, sois pessimiste sur les graisses cachées (+5-10g de lipides si l'aspect est brillant/frit). Utilise les éléments visuels (couverts, assiette) pour estimer les portions. Si un élément est ambigu, propose l'option la plus calorique par défaut.

IMPORTANT - Extraction temporelle :
Si le texte contient une indication de temps (ex: "hier à 22h", "ce matin"), retourne-la dans "suggested_timestamp" au format ISO 8601.

IMPORTANT - Aliments comptables en unités :
Si l'utilisateur mentionne un nombre SANS unité de poids (g/kg/ml/cl/L), c'est un aliment en unités.
- "2 tranches", "3 oeufs", "1 portion de Kiri", "2 Babybel", "4 biscuits" → unit_count, unit_label, unit_weight_g
- "200g de riz" → poids brut (PAS d'unités)
Si l'aliment se compte en unités : unit_count, unit_weight_g (poids moyen d'UNE unité), unit_label.
estimated_weight_g = unit_count * unit_weight_g.

IMPORTANT - Micronutriments :
Pour chaque aliment, estime les micronutriments suivants (valeurs pour le poids estimé, pas pour 100g) :
${microFieldsList}
Mets 0 si inconnu.

FORMAT JSON STRICT - réponds UNIQUEMENT le JSON, sans markdown :
{
  "meal_name": "string",
  "confidence_score": 0.85,
  "suggested_timestamp": "2025-01-15T22:00:00",
  "items": [
    {
      "name": "string",
      "estimated_weight_g": 150,
      "unit_count": 3,
      "unit_weight_g": 50,
      "unit_label": "portion",
      "calories": 250,
      "proteins": 25,
      "carbs": 2,
      "fats": 15,
      ${microKeysToRequest.map(k => `"${k}": 0`).join(",\n      ")}
    }
  ],
  "total_summary": { "calories": 0, "proteins": 0, "carbs": 0, "fats": 0 }
}`;

  // Gestion du contexte Custom Foods
  let customFoodsContext = "";
  if (custom_foods?.length) {
    customFoodsContext = "\nUTILISE CES DONNÉES DE BIBLIOTHÈQUE EN PRIORITÉ :\n" + custom_foods
      .map(f => `- ${f.name}: Cal=${f.calories_per_100g}, P=${f.proteins_per_100g}, G=${f.carbs_per_100g}, L=${f.fats_per_100g}`)
      .join("\n");
  }

  // Nutriments custom (suivis en plus de la master list)
  let customNutrientsContext = "";
  if (custom_nutrients?.length) {
    customNutrientsContext = "\nNUTRIMENTS CUSTOM à estimer pour CHAQUE item (clé JSON exacte = valeur numérique dans l'unité indiquée, 0 si inconnu) :\n" +
      custom_nutrients.map(c => `- ${c.key} (${c.unit})${c.label ? ` — ${c.label}` : ""}`).join("\n");
  }

  // Détecte le mime type depuis le préfixe data:image/xxx;base64,
  let imageMime = "image/jpeg";
  let cleanImageData: string | null = null;
  if (image) {
    const m = image.match(/^data:(image\/[\w+.-]+);base64,(.*)$/);
    if (m) {
      imageMime = m[1];
      cleanImageData = m[2];
    } else {
      cleanImageData = image;
    }
  }

  // Texte complet du prompt (commun aux deux types d'API)
  const promptText = `${basePrompt}\n\nAnalyse ce repas et extrais les nutriments demandés.${customFoodsContext}${customNutrientsContext}${local_time ? `\nHeure locale: ${local_time}.` : ""}${text ? `\nTexte: "${text}"` : ""}`;

  // Modèle choisi par l'utilisateur (jamais figé dans le code). Repli intelligent
  // selon le fournisseur uniquement si aucun modèle n'a été sélectionné.
  const baseUrl = (provider?.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const chosenModel = provider?.model || fallbackModelFor(baseUrl, apiType);

  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 2000;

  let lastError: Error | null = null;
  let res: Response | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (apiType === "openai") {
        // ── API compatible OpenAI ──────────────────────────────
        const userContent: any[] = [{ type: "text", text: promptText }];
        if (image) userContent.push({ type: "image_url", image_url: { url: image } });
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: chosenModel,
            messages: [{ role: "user", content: userContent }],
          }),
        });
      } else {
        // ── API Gemini (Google) ────────────────────────────────
        type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
        const userParts: GeminiPart[] = [{ text: promptText }];
        if (cleanImageData) userParts.push({ inline_data: { mime_type: imageMime, data: cleanImageData } });
        const url = `${baseUrl}/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: userParts }] }),
        });
      }

      if (res.ok) {
        appLogger.info("IA", `Succès avec ${chosenModel} après ${attempt + 1} tentative(s)`);
        break;
      }

      const errorText = await res.text();
      const retryable = res.status === 429 || res.status === 503 || res.status >= 500;
      if (retryable && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        appLogger.warn("IA", `Erreur ${res.status} sur ${chosenModel}, retry dans ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw new Error(`Erreur IA ${res.status}: ${errorText}`);
    } catch (err: any) {
      lastError = err;
      const isNetwork = err.message?.includes("fetch") || err.message?.includes("network") || err.message?.includes("timeout");
      if (isNetwork && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  if (!res || !res.ok) {
    throw lastError || new Error("Échec de la requête IA");
  }

  const data = await res.json();

  // Extraction du texte selon le type d'API
  const content = (
    apiType === "openai"
      ? data?.choices?.[0]?.message?.content
      : data?.candidates?.[0]?.content?.parts?.[0]?.text
  ) || "{}";
  const trimmed = String(content).trim();

  appLogger.debug("IA", "Réponse reçue", trimmed.substring(0, 200));

  let result: any;
  try {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    result = JSON.parse(jsonMatch ? jsonMatch[0] : trimmed);
  } catch (e) {
    appLogger.error("IA", "Erreur parsing JSON", { error: e, content: trimmed });
    result = trimmed;
  }

  if (image && typeof result === "object") {
    analysisCache.set(image, text, result);
    appLogger.info("IA", `Résultat mis en cache (modèle: ${chosenModel})`);
  }

  return result;
}


// ============================================================
// UTILITAIRES CACHE (exportés pour usage externe)
// ============================================================

export function clearGeminiCache(): void {
  analysisCache.clear();
}

export function getGeminiCacheSize(): number {
  // @ts-ignore - accès privé pour debug
  return analysisCache.cache?.size || 0;
}
