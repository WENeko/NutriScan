// src/services/geminiAiService.ts
// Couche d'intégration directe avec Google Gemini (sans Lovable)
import { NUTRIENTS_MASTER_LIST } from '@/utils/nutrition-logic';

/**
 * Analyse une image ou du texte d'un repas avec l'API Gemini.
 * @param input Objet: { image?: string (URL/base64), text?: string, custom_foods?: CustomFood[], local_time?: string, check_nutrient?: string, requestedMicros?: string[] }
 * @returns Réponse IA structurée ({ meal_name, confidence_score, suggested_timestamp?, items: [...] })
 * Chaque item contient: food_name, calories, proteins, carbs, fats, estimated_weight_g, unit_count?, unit_label?, unit_weight_g?, 
 * PLUS les micronutriments demandés (fiber, sugar, sodium_mg, potassium_mg, magnesium_mg, calcium_mg, iron_mg, zinc_mg, vitamin_c_mg, vitamin_d_mcg, vitamin_b9_mcg, vitamin_b12_mcg, vitamin_e_mg, omega3_mg)
 */
export async function analyzeMealWithGemini({ image, text, custom_foods, local_time, check_nutrient, requestedMicros = [] }: {
  image?: string;
  text?: string;
  custom_foods?: any[];
  local_time?: string;
  check_nutrient?: string;
  requestedMicros?: string[];
}): Promise<any> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY non configurée");

  // Gemini model et endpoint API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Liste complète des clés de micronutriments par défaut
  const defaultMicroKeys = NUTRIENTS_MASTER_LIST.map(n => n.key);
  const microKeysToRequest = requestedMicros.length ? requestedMicros : defaultMicroKeys;

  // System prompt avec instructions claires pour les micronutriments
  const basePrompt = `Tu es un nutritionniste expert. Analyse l'entrée (image ou texte) et estime précisément le poids de chaque ingrédient. Si c'est une image, sois pessimiste sur les graisses cachées (+5-10g de lipides si l'aspect est brillant/frit). Utilise les éléments visuels (couverts, assiette) pour estimer les portions. Si un élément est ambigu, propose l'option la plus calorique par défaut.\nIMPORTANT - Extraction temporelle : Si le texte contient une indication de temps (ex: \'hier à 22h\'), retourne-la dans le champ \'suggested_timestamp\' au format ISO 8601.\nIMPORTANT - Détection des aliments comptables en unités : Pour CHAQUE aliment, détermine s'il se consomme/gère naturellement en unités plutôt qu'en poids brut.\nRÈGLE PRINCIPALE : Si l'utilisateur mentionne un nombre SANS unité de poids ou volume après (g, kg, ml, cl, L), c'est un indice TRÈS FORT que cet aliment se compte en unités (ex: \'2 tranches de jambon\' → unit_count=2, unit_label=\'tranche\').\nSi l'aliment compte en unités, remplis: unit_count (entier), unit_weight_g (entier), unit_label (ex: 'oeuf'). estimated_weight_g = unit_count * unit_weight_g.\nIMPORTANT - MICRONUTRIMENTS À EXTRAIRE (valeurs pour LA PORTION ESTIMÉE, pas pour 100g) : ${microKeysToRequest.join(", ")}. Si tu ne connais pas la valeur pour une clé, mets 0. Ne crée pas d'autres clés.\nRéponds UNIQUEMENT en JSON strict, sans markdown, format : { meal_name, confidence_score, suggested_timestamp (optionnel), items: [...] }`;

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

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erreur Gemini: ${await res.text()}`);
  const data = await res.json();

  // Gemini always replies as a .candidates[] array
  const content = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}").trim();

  // Renvoyer le JSON structuré (parse sinon retourne string brute)
  try { return JSON.parse(content); } catch { return content; }
}
