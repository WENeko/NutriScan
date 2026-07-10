// src/services/geminiAiService.ts
// Couche d'intégration IA : edge functions Lovable (si autorisé) ou fournisseur perso
// (Gemini ou compatible OpenAI) sélectionné par l'utilisateur, avec modèle au choix.
import { appLogger } from './appLogger';
import { supabase } from '@/integrations/supabase/client';
import { isLovableAiEnabled, getActiveProviderConfig, isLocalApiType } from '@/lib/aiAccess';
import { runLocalIntentChat } from '@/services/localAiBridge';
import { fallbackModelFor } from '@/lib/providerCatalog';
// SOURCE UNIQUE DE VÉRITÉ du prompt — partagée avec l'edge function `analyze-meal`.
import {
  buildSystemContent,
  buildCustomFoodsContext,
  buildLocalSystemContent,
  buildLocalCustomFoodsContext,
  buildLocalUserPromptText,
  buildUserPromptText,
} from '../../supabase/functions/_shared/mealAnalysisPrompt';
// SOURCE UNIQUE DE VÉRITÉ de la liste des micros standard (JSON métier).
import { NUTRIENTS_STD_LIST } from '@/utils/nutrition-logic';

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
      body: { image, text, custom_foods, custom_nutrients, std_nutrients: NUTRIENTS_STD_LIST, local_time },
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

  // Les modèles locaux (sur l'appareil, HTTP ou Intent natif) ne nécessitent pas de clé API.
  if (!apiKey && !isLocalApiType(apiType)) {
    appLogger.error("IA", "Aucune clé API fournisseur configurée");
    throw new Error("Aucune clé API configurée. Choisissez un fournisseur et entrez votre clé dans Réglages, ou demandez l'accès à l'IA Lovable à un administrateur.");
  }


  // ── PROMPT : SOURCE UNIQUE DE VÉRITÉ (identique à l'edge function `analyze-meal`)
  // quel que soit le fournisseur / modèle utilisé pour l'analyse.
  const systemContent = buildSystemContent(NUTRIENTS_STD_LIST, custom_nutrients);
  const customFoodsContext = buildCustomFoodsContext(custom_foods);

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

  // Message utilisateur identique à l'edge function (image ou description).
  const promptText = buildUserPromptText({ hasImage: !!image, text, local_time, customFoodsContext });

  // Modèle choisi par l'utilisateur (jamais figé dans le code). Repli intelligent
  // selon le fournisseur uniquement si aucun modèle n'a été sélectionné.
  const baseUrl = (provider?.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const chosenModel = provider?.model || fallbackModelFor(baseUrl, apiType);

  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 2000;

  let lastError: Error | null = null;
  let res: Response | null = null;
  // Réponse texte directe d'une IA locale native (Intent Android), si applicable.
  let intentContent: string | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (apiType === "local_intent") {
        // ── IA locale NATIVE via Intent Android (ex: Google AI Edge Gallery) ──
        const localSystemContent = buildLocalSystemContent(NUTRIENTS_STD_LIST, custom_nutrients);
        const localFoodsContext = buildLocalCustomFoodsContext(custom_foods, text);
        const localPromptText = buildLocalUserPromptText({
          hasImage: !!image,
          text,
          local_time,
          customFoodsContext: localFoodsContext,
        });
        appLogger.debug("IA", "Prompt local compact préparé", {
          systemChars: localSystemContent.length,
          promptChars: localPromptText.length,
        });
        intentContent = await runLocalIntentChat({
          system: localSystemContent,
          prompt: localPromptText,
          image,
          model: chosenModel,
        });
        appLogger.info("IA", `Succès (Intent natif) avec ${chosenModel}`);
        break;
      } else if (apiType === "openai" || apiType === "local") {
        // ── API compatible OpenAI (inclut les modèles locaux HTTP) ──
        const userContent: any[] = [{ type: "text", text: promptText }];
        if (image) userContent.push({ type: "image_url", image_url: { url: image } });
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: chosenModel,
            messages: [
              { role: "system", content: systemContent },
              { role: "user", content: userContent },
            ],
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
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemContent }] },
            contents: [{ role: "user", parts: userParts }],
          }),
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

  // Extraction du texte selon le type d'API
  let content: string;
  if (intentContent !== null) {
    content = intentContent || "{}";
  } else {
    if (!res || !res.ok) {
      throw lastError || new Error("Échec de la requête IA");
    }
    const data = await res.json();
    content = (
      apiType === "openai" || apiType === "local"
        ? data?.choices?.[0]?.message?.content
        : data?.candidates?.[0]?.content?.parts?.[0]?.text
    ) || "{}";
  }
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
