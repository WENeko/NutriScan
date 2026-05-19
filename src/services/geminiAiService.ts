// src/services/geminiAiService.ts
// Couche d'intégration directe avec Google Gemini (sans Lovable)
import { NUTRIENTS_STD_LIST } from '@/utils/nutrition-logic';
import { appLogger } from './appLogger';

// ============================================================
// CONFIGURATION MULTI-MODÈLES
// ============================================================

interface GeminiModel {
  name: string;
  endpoint: string;
  priority: number; // 1 = principal, 2 = fallback
}

const GEMINI_MODELS: GeminiModel[] = [
  { name: "gemini-2.5-flash", endpoint: "v1beta/models/gemini-2.5-flash:generateContent", priority: 1 },
  { name: "gemini-2.5-flash-lite", endpoint: "v1beta/models/gemini-2.5-flash-lite:generateContent", priority: 2 },
  { name: "gemini-1.5-flash", endpoint: "v1beta/models/gemini-1.5-flash:generateContent", priority: 3 },
];

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
export async function analyzeMealWithGemini({ image, text, custom_foods, custom_nutrients, local_time, check_nutrient, requestedMicros = [] }: {
  image?: string;
  text?: string;
  custom_foods?: any[];
  custom_nutrients?: { key: string; label?: string; unit: string }[];
  local_time?: string;
  check_nutrient?: string;
  requestedMicros?: string[];
}): Promise<any> {
  // Priorité : localStorage > .env
  const apiKey = typeof window !== 'undefined'
    ? (localStorage.getItem('user_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY)
    : import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    appLogger.error("Gemini", "Clé API Gemini non configurée");
    throw new Error("Clé API Gemini non configurée (localStorage 'user_gemini_api_key' ou VITE_GEMINI_API_KEY)");
  }

  // Vérifier le cache si on a une image
  if (image) {
    const cached = analysisCache.get(image, text);
    if (cached) {
      appLogger.info("Gemini", "Analyse servie depuis le cache");
      return cached;
    }
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

  // Construction du payload Gemini (format API Google)
  type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
  const userParts: GeminiPart[] = [
    { text: `${basePrompt}\n\nAnalyse ce repas et extrais les nutriments demandés.${customFoodsContext}${customNutrientsContext}${local_time ? `\nHeure locale: ${local_time}.` : ""}${text ? `\nTexte: "${text}"` : ""}` }
  ];

  if (cleanImageData) {
    userParts.push({ inline_data: { mime_type: imageMime, data: cleanImageData }});
  }

  const body = {
    contents: [
      { role: "user", parts: userParts }
    ]
  };

  // ============================================================
  // MULTI-MODÈLES AVEC FALLBACK ET RETRY
  // ============================================================
  
  // Paramètres retry augmentés
  const MAX_RETRIES_PER_MODEL = 3;
  const BASE_DELAY_MS = 2000; // 2s (augmenté)
  
  let lastError: Error | null = null;
  let res: Response | null = null;
  let usedModel = GEMINI_MODELS[0].name;
  
  // Essayer chaque modèle en cascade
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/${model.endpoint}?key=${apiKey}`;
    appLogger.info("Gemini", `Tentative avec modèle ${model.name}`);
    
    // Retry sur ce modèle
    for (let attempt = 0; attempt < MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        
        if (res.ok) {
          usedModel = model.name;
          appLogger.info("Gemini", `Succès avec ${model.name} après ${attempt + 1} tentative(s)`);
          break; // Succès avec ce modèle
        }
        
        const errorText = await res.text();
        const is429 = res.status === 429 || errorText.includes("429") || errorText.includes("quota") || errorText.includes("Resource has been exhausted");
        const is503 = res.status === 503 || errorText.includes("503") || errorText.includes("high demand");
        
        // Si 429 (quota) → passer au modèle suivant immédiatement
        if (is429) {
          appLogger.warn("Gemini", `Erreur 429 (quota) sur ${model.name}, passage au modèle fallback`);
          break; // Sortir du retry pour passer au modèle suivant
        }
        
        // Si 503 ou autre retryable → attendre et retry
        if ((is503 || res.status >= 500) && attempt < MAX_RETRIES_PER_MODEL - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt); // Backoff: 2s, 4s, 8s
          appLogger.warn("Gemini", `Erreur ${res.status} sur ${model.name}, retry ${attempt + 1}/${MAX_RETRIES_PER_MODEL} dans ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Erreur non-retryable
        throw new Error(`Erreur Gemini ${res.status}: ${errorText}`);
        
      } catch (err: any) {
        lastError = err;
        
        const isNetworkError = err.message?.includes("fetch") || err.message?.includes("network") || err.message?.includes("timeout");
        const is429Error = err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("Resource has been exhausted");
        const is503Error = err.message?.includes("503") || err.message?.includes("high demand");
        
        // Si 429 → passer au modèle suivant
        if (is429Error) {
          appLogger.warn("Gemini", `Erreur 429 détectée sur ${model.name}, passage au modèle fallback`);
          break;
        }
        
        // Retry sur erreur réseau/503
        if ((isNetworkError || is503Error) && attempt < MAX_RETRIES_PER_MODEL - 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          appLogger.warn("Gemini", `Erreur réseau/503 sur ${model.name}, retry ${attempt + 1}/${MAX_RETRIES_PER_MODEL} dans ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (model === GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
          // Dernier modèle, dernière tentative
          throw err;
        } else {
          // Passer au modèle suivant
          break;
        }
      }
    }
    
    // Si on a une réponse OK, sortir de la boucle des modèles
    if (res && res.ok) {
      break;
    }
  }
  
  if (!res || !res.ok) {
    throw lastError || new Error("Échec de la requête Gemini après tous les modèles");
  }
  
  const data = await res.json();

  // Gemini always replies as a .candidates[] array
  const content = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}").trim();
  
  // Log de debug
  appLogger.debug("Gemini", "Réponse reçue", content.substring(0, 200));

  // Renvoyer le JSON structuré (parse sinon retourne string brute)
  let result: any;
  try { 
    result = JSON.parse(content); 
  } catch (e) { 
    appLogger.error("Gemini", "Erreur parsing JSON", { error: e, content });
    result = content; 
  }
  
  // Stocker dans le cache si on a une image
  if (image && typeof result === 'object') {
    analysisCache.set(image, text, result);
    appLogger.info("Gemini", `Résultat mis en cache (modèle: ${usedModel})`);
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
