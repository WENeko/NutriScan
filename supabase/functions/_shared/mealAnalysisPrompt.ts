/**
 * SOURCE UNIQUE DE VÉRITÉ du prompt d'analyse de repas.
 *
 * Ce module est volontairement écrit en TypeScript « pur » (aucun import Deno,
 * npm: ou navigateur) afin de pouvoir être importé À LA FOIS :
 *  - par l'edge function `analyze-meal` (IA de l'application, via la passerelle Lovable) ;
 *  - par le client BYOK `src/services/geminiAiService.ts` (clé perso de l'utilisateur).
 *
 * Objectif : garantir que le prompt envoyé à l'IA est STRICTEMENT identique quel
 * que soit le modèle qui réalise l'analyse. On conserve la variante la plus riche
 * pour les micronutriments custom (clés listées explicitement dans l'exemple JSON
 * + consigne « 0 si inconnu », jamais d'omission) car elle remonte plus de valeurs.
 */

export interface CustomNutrientDef {
  key: string;
  label?: string;
  unit: string;
}

/**
 * La liste STANDARD de micronutriments N'EST PLUS codée en dur ici.
 * Elle est fournie par l'appelant (`std_nutrients`) dont la SOURCE UNIQUE DE VÉRITÉ
 * est `NUTRIENTS_STD_LIST` (src/utils/nutrition-logic.ts) côté client, transmise
 * telle quelle à l'edge function via le corps de requête.
 */

/** Contexte « bibliothèque personnelle d'aliments » (prioritaire). */
export function buildCustomFoodsContext(custom_foods?: any[]): string {
  if (!Array.isArray(custom_foods) || custom_foods.length === 0) return "";
  let ctx =
    "\n\nIMPORTANT - L'utilisateur a une bibliothèque personnelle d'aliments. UTILISE CES DONNÉES EN PRIORITÉ quand tu reconnais un de ces aliments :\n";
  for (const f of custom_foods as any[]) {
    ctx += `- ${f.name}: portion=${f.serving_size_g ?? 100}g, Cal=${f.calories_per_100g}kcal/100g, P=${f.proteins_per_100g}g/100g, G=${f.carbs_per_100g}g/100g, L=${f.fats_per_100g}g/100g, Fibres=${f.fiber_per_100g ?? 0}g/100g, Sucres=${f.sugar_per_100g ?? 0}g/100g, AGS=${f.saturated_fat_per_100g ?? 0}g/100g, Omega3=${f.omega3_mg_per_100g ?? 0}mg/100g, Sodium=${f.sodium_mg_per_100g ?? 0}mg/100g, Potassium=${f.potassium_mg_per_100g ?? 0}mg/100g, Magnesium=${f.magnesium_mg_per_100g ?? 0}mg/100g, Calcium=${f.calcium_mg_per_100g ?? 0}mg/100g, VitB=${f.vitamin_b_per_100g ?? 0}mg/100g, VitC=${f.vitamin_c_per_100g ?? 0}mg/100g, VitD=${f.vitamin_d_per_100g ?? 0}µg/100g, VitE=${f.vitamin_e_per_100g ?? 0}mg/100g\n`;
  }
  return ctx;
}

/** Contexte « nutriments custom » (variante riche : 0 si inconnu, jamais d'omission). */
export function buildCustomNutrientsContext(custom_nutrients?: CustomNutrientDef[]): string {
  const list = (custom_nutrients ?? []).filter((c) => c?.key && c?.unit);
  if (list.length === 0) return "";
  return (
    "\n\nNUTRIMENTS CUSTOM à estimer pour CHAQUE item (clé JSON exacte = valeur numérique dans l'unité indiquée, mets 0 si inconnu, n'omets JAMAIS la clé) :\n" +
    list.map((c) => `- ${c.key} (${c.unit}) — ${c.label ?? c.key}`).join("\n")
  );
}

/** Construit le system prompt complet, avec les clés custom intégrées au gabarit JSON. */
export function buildSystemPrompt(
  std_nutrients?: CustomNutrientDef[],
  custom_nutrients?: CustomNutrientDef[],
): string {
  const stdList = (std_nutrients ?? []).filter((c) => c?.key && c?.unit);
  const customKeys = (custom_nutrients ?? []).filter((c) => c?.key && c?.unit).map((c) => c.key);

  const stdMicroLines = stdList.map((c) => `      "${c.key}": 0`);
  const customMicroLines = customKeys.map((k) => `      "${k}": 0`);
  const itemMicroBlock = [...stdMicroLines, ...customMicroLines].join(",\n");

  const stdListLine = stdList.map((c) => `${c.key} (${c.unit})`).join(", ");

  return `Tu es un nutritionniste expert. Analyse l'entrée (image ou texte) et estime précisément le poids de chaque ingrédient. Si c'est une image, sois pessimiste sur les graisses cachées (+5-10g de lipides si l'aspect est brillant/frit). Utilise les éléments visuels (couverts, assiette) pour estimer les portions. Si un élément est ambigu, propose l'option la plus calorique par défaut.

IMPORTANT - Extraction temporelle :
Si le texte contient une indication de temps (ex: "hier à 22h", "ce matin", "lundi midi"), extrais-la et retourne-la dans le champ "suggested_timestamp" au format ISO 8601. Sinon, ne mets pas ce champ.

IMPORTANT - Détection des aliments comptables en unités :
Pour CHAQUE aliment, détermine s'il se consomme/gère naturellement en unités plutôt qu'en poids brut.

RÈGLE PRINCIPALE : Si l'utilisateur mentionne un nombre SANS unité de poids ou volume après (g, kg, ml, cl, L), c'est un indice TRÈS FORT que cet aliment se compte en unités. Exemples :
- "2 tranches de jambon" → unit_count=2, unit_label="tranche" (PAS de poids mentionné = unités)
- "3 oeufs" → unit_count=3, unit_label="oeuf" (PAS de poids mentionné = unités)
- "1 portion de Kiri" → unit_count=1, unit_label="portion" (PAS de poids mentionné = unités)
- "2 fromages triangle" → unit_count=2, unit_label="triangle" (PAS de poids mentionné = unités)
- "2 Babybel" → unit_count=2, unit_label="portion" (PAS de poids mentionné = unités)
- "4 biscuits" → unit_count=4, unit_label="biscuit" (PAS de poids mentionné = unités)
- "200g de riz" → poids brut (unité de poids mentionnée = PAS d'unités)
En résumé : nombre + nom d'aliment SANS g/kg/ml/cl/L = TOUJOURS utiliser unit_count/unit_label/unit_weight_g.

Autres cas où utiliser des unités même sans nombre explicite :
- Oeufs, tranches (jambon, pain de mie, fromage, bacon), portions (fromage type Kiri/Vache qui rit/Babybel/triangle), biscuits, tartines, crêpes, saucisses, nuggets, fruits entiers (pomme, banane, abricot), tomates cerises, olives, crevettes, boulettes, bonbons, etc.

Si l'aliment se compte en unités, remplis ces 3 champs :
- "unit_count": nombre d'unités (entier, ex: 3)
- "unit_weight_g": poids moyen d'UNE unité en grammes (entier, ex: 60)
- "unit_label": libellé court de l'unité (ex: "oeuf", "tranche", "portion")
Le champ "estimated_weight_g" doit être = unit_count * unit_weight_g.
Si l'aliment ne se compte PAS en unités (riz, pâtes, sauce, huile, etc.), ne mets PAS ces champs.

IMPORTANT - Micronutriments :
Pour chaque aliment, estime aussi les micronutriments suivants (valeurs pour le poids estimé, pas pour 100g).
Liste STANDARD (NUTRIENTS_STD_LIST — source unique de vérité côté client) :
- fiber (g), sugar (g), saturated_fat (g), omega3_mg (mg)
- sodium_mg (mg), potassium_mg (mg), magnesium_mg (mg), calcium_mg (mg)
- iron_mg (mg), zinc_mg (mg)
- vitamin_c_mg (mg), vitamin_d_mcg (µg), vitamin_b9_mcg (µg), vitamin_b12_mcg (µg), vitamin_e_mg (mg)

Si l'utilisateur t'a fourni une liste de "custom_nutrients" (clé + label + unité), retourne aussi
ces clés dans chaque item avec la valeur numérique estimée pour le poids estimé. Mets 0 si tu ne peux pas estimer, mais n'omets JAMAIS la clé.

Réponds UNIQUEMENT en JSON strict, sans markdown, sans commentaire :
{
  "meal_name": "string",
  "confidence_score": 0.85,
  "suggested_timestamp": "2025-01-15T22:00:00" (optionnel),
  "items": [
    {
      "name": "string",
      "estimated_weight_g": 150,
      "unit_count": 3 (optionnel),
      "unit_weight_g": 50 (optionnel),
      "unit_label": "portion" (optionnel),
      "calories": 250,
      "proteins": 25,
      "carbs": 2,
      "fats": 15,
${itemMicroBlock}
    }
  ],
  "total_summary": {
    "calories": 250,
    "proteins": 25,
    "carbs": 2,
    "fats": 15
  }
}`;
}

/** Contenu système complet = system prompt + contexte nutriments custom. */
export function buildSystemContent(custom_nutrients?: CustomNutrientDef[]): string {
  return buildSystemPrompt(custom_nutrients) + buildCustomNutrientsContext(custom_nutrients);
}

/** Texte utilisateur (image ou description), incluant le contexte bibliothèque. */
export function buildUserPromptText(opts: {
  hasImage: boolean;
  text?: string;
  local_time?: string;
  customFoodsContext: string;
}): string {
  const { hasImage, text, local_time, customFoodsContext } = opts;
  const timeContext = local_time
    ? `\nL'heure locale actuelle de l'utilisateur est : ${local_time}. Utilise cette référence pour calculer "hier", "ce matin", etc.`
    : "";
  if (hasImage) {
    return `Analyse ce repas et donne-moi les macronutriments et micronutriments de chaque aliment visible.${customFoodsContext}${timeContext}`;
  }
  return `Analyse cette description de repas et donne-moi les macronutriments et micronutriments de chaque aliment mentionné : "${text ?? ""}"${customFoodsContext}${timeContext}`;
}
