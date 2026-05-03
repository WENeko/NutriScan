// src/services/geminiAiService.ts
// Couche d'intégration directe avec Google Gemini (sans Lovable)
import { NUTRIENTS_MASTER_LIST } from '@/utils/nutrition-logic';
import { appLogger } from './appLogger';

/**
 * Analyse une image ou du texte d'un repas avec l'API Gemini.
 * @param input Objet: { image?: string (URL/base64), text?: string, custom_foods?: CustomFood[], local_time?: string, check_nutrient?: string, requestedMicros?: string[] }
 * @returns Réponse IA structurée ({ meal_name, confidence_score, suggested_timestamp?, items: [...] })
 * Chaque item contient: food_name, calories, proteins, carbs, fats, estimated_weight_g, unit_count?, unit_label?, unit_weight_g?, 
 * PLUS tous les micronutriments de NUTRIENTS_MASTER_LIST (fiber, sugar, saturated_fat, omega3_mg, sodium_mg, potassium_mg, magnesium_mg, calcium_mg, iron_mg, zinc_mg, vitamin_b_mg, vitamin_b9_mcg, vitamin_b12_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg)
 */
export async function analyzeMealWithGemini({ image, text, custom_foods, local_time, check_nutrient, requestedMicros = [] }: {
  image?: string;
  text?: string;
  custom_foods?: any[];
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

  // Gemini model et endpoint API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Liste complète des clés de micronutriments par défaut
  const defaultMicroKeys = NUTRIENTS_MASTER_LIST.map(n => n.key);
  const microKeysToRequest = requestedMicros.length ? requestedMicros : defaultMicroKeys;

  // Construire la liste des micronutriments pour le prompt
  const microFieldsList = microKeysToRequest.join(", ");
  
  // System prompt avec instructions EXPLICITES pour le format JSON
  const basePrompt = `Tu es un nutritionniste expert. Analyse l'entrée (image ou texte) et estime précisément le poids de chaque ingrédient.

RÈGLES DE FORMAT JSON STRICT - Chaque item doit avoir ces champs EXACTS:
- food_name: string
- calories: number (total pour la portion)
- proteins: number (grammes)
- carbs: number (grammes)
- fats: number (grammes)
- estimated_weight_g: number (grammes)
- unit_count: number ou null
- unit_label: string ou null
- unit_weight_g: number ou null
- ET tous les micronutriments: ${microFieldsList}

IMPORTANT: Les valeurs de micronutriments sont pour LA PORTION ESTIMÉE, pas pour 100g. Mets 0 si inconnu.

RÈGLES D'ANALYSE:
- Image: +5-10g lipides si aspect brillant/frit
- Portions: utilise couteau/fourchette/assiette comme référence taille
- Ambigu: choisir l'option la plus calorique
- Unités: "2 tranches" → unit_count=2, unit_label="tranche"

FORMAT JSON DE SORTIE:
{"meal_name":"...","confidence_score":0.95,"suggested_timestamp":"2024-...","items":[{"food_name":"...","calories":0,"proteins":0,"carbs":0,"fats":0,"estimated_weight_g":0,"unit_count":null,"unit_label":null,"unit_weight_g":null,${microKeysToRequest.map(k => `"${k}":0`).join(",")}}]}

Réponds UNIQUEMENT le JSON, sans markdown, sans explication.`;

  // Gestion du contexte Custom Foods
  let customFoodsContext = "";
  if (custom_foods?.length) {
    customFoodsContext = "\nUTILISE CES DONNÉES DE BIBLIOTHÈQUE EN PRIORITÉ :\n" + custom_foods
      .map(f => `- ${f.name}: Cal=${f.calories_per_100g}, P=${f.proteins_per_100g}, G=${f.carbs_per_100g}, L=${f.fats_per_100g}`)
      .join("\n");
  }

  // Nettoyer l'image base64 si elle a un préfixe data:image
  const cleanImageData = image ? image.replace(/^data:image\/\w+;base64,/, '') : null;

  // Construction du payload Gemini (format API Google)
  type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };
  const userParts: GeminiPart[] = [
    { text: `${basePrompt}\n\nAnalyse ce repas et extrais les nutriments demandés.${customFoodsContext}${local_time ? `\nHeure locale: ${local_time}.` : ""}${text ? `\nTexte: "${text}"` : ""}` }
  ];
  
  if (cleanImageData) {
    userParts.push({ inline_data: { mime_type: "image/jpeg", data: cleanImageData }});
  }

  const body = {
    contents: [
      { role: "user", parts: userParts }
    ]
  };

  // Retry logic avec backoff exponentiel pour erreurs 503 (serveur surchargé)
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;
  
  let lastError: Error | null = null;
  let res: Response | null = null;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      if (res.ok) {
        break; // Succès, sortir de la boucle
      }
      
      const errorText = await res.text();
      const is503 = res.status === 503 || errorText.includes("503") || errorText.includes("high demand");
      
      if (is503 && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt); // Backoff: 1s, 2s, 4s
        appLogger.warn("Gemini", `Erreur 503, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Erreur non-retryable ou dernier essai
      throw new Error(`Erreur Gemini ${res.status}: ${errorText}`);
      
    } catch (err: any) {
      lastError = err;
      
      // Si c'est une erreur réseau ou timeout, retry
      const isNetworkError = err.message?.includes("fetch") || err.message?.includes("network") || err.message?.includes("timeout");
      const is503Error = err.message?.includes("503") || err.message?.includes("high demand");
      
      if ((isNetworkError || is503Error) && attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        appLogger.warn("Gemini", `Erreur réseau/503, retry ${attempt + 1}/${MAX_RETRIES} dans ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err; // Dernier essai ou erreur non-retryable
      }
    }
  }
  
  if (!res || !res.ok) {
    throw lastError || new Error("Échec de la requête Gemini après retries");
  }
  
  const data = await res.json();

  // Gemini always replies as a .candidates[] array
  const content = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}").trim();
  
  // Log de debug
  appLogger.debug("Gemini", "Réponse reçue", content.substring(0, 200));

  // Renvoyer le JSON structuré (parse sinon retourne string brute)
  try { 
    return JSON.parse(content); 
  } catch (e) { 
    appLogger.error("Gemini", "Erreur parsing JSON", { error: e, content });
    return content; 
  }
}
