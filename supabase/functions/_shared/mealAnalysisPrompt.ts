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
    // Les micros (per_100g) sont désormais stockés dans nutrients_std ; fallback colonnes héritées si présentes
    const s = (f.nutrients_std || {}) as Record<string, number>;
    const g = (key: string, legacy: string) => (s[key] ?? f[legacy] ?? 0);
    ctx += `- ${f.name}: portion=${f.serving_size_g ?? 100}g, Cal=${f.calories_per_100g}kcal/100g, P=${f.proteins_per_100g}g/100g, G=${f.carbs_per_100g}g/100g, L=${f.fats_per_100g}g/100g, Fibres=${g("fiber", "fiber_per_100g")}g/100g, Sucres=${g("sugar", "sugar_per_100g")}g/100g, AGS=${g("saturated_fat", "saturated_fat_per_100g")}g/100g, Omega3=${g("omega3_mg", "omega3_mg_per_100g")}mg/100g, Sodium=${g("sodium_mg", "sodium_mg_per_100g")}mg/100g, Potassium=${g("potassium_mg", "potassium_mg_per_100g")}mg/100g, Magnesium=${g("magnesium_mg", "magnesium_mg_per_100g")}mg/100g, Calcium=${g("calcium_mg", "calcium_mg_per_100g")}mg/100g, VitB=${g("vitamin_b_mg", "vitamin_b_per_100g")}mg/100g, VitC=${g("vitamin_c_mg", "vitamin_c_per_100g")}mg/100g, VitD=${g("vitamin_d_mcg", "vitamin_d_per_100g")}µg/100g, VitE=${g("vitamin_e_mg", "vitamin_e_per_100g")}mg/100g\n`;
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

IMPORTANT - Poids cru vs cuit (source d'erreur majeure) :
Quand l'utilisateur indique un poids par écrit pour un aliment féculent qui absorbe de l'eau à la cuisson (pâtes, riz, semoule, quinoa, lentilles, haricots secs, boulgour, etc.), considère TOUJOURS ce poids comme CRU/SEC par défaut, sauf mention explicite "cuit"/"cuites"/"cooked". Utilise les valeurs nutritionnelles du produit CRU (ex: pâtes crues ≈ 350 kcal/100g, riz cru ≈ 350 kcal/100g) et NON les valeurs cuites (≈ 130-140 kcal/100g). Idem pour les viandes/poissons si l'utilisateur donne un poids texte sans précision : considère-le comme cru. Sur une IMAGE en revanche, tu vois l'aliment cuit dans l'assiette : utilise les valeurs cuites, mais estime le poids visible cuit (ratio cru→cuit ≈ x2.5 pour pâtes/riz).

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
- ${stdListLine}

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
export function buildSystemContent(
  std_nutrients?: CustomNutrientDef[],
  custom_nutrients?: CustomNutrientDef[],
): string {
  return buildSystemPrompt(std_nutrients, custom_nutrients) + buildCustomNutrientsContext(custom_nutrients);
}

/**
 * Variante volontairement compacte pour les modèles exécutés sur l'appareil.
 * Leur fenêtre de contexte est nettement plus petite que celle des modèles cloud :
 * conserver le prompt riche ferait consommer plusieurs milliers de tokens avant
 * même que le modèle puisse commencer sa réponse.
 */
export function buildLocalSystemContent(
  std_nutrients?: CustomNutrientDef[],
  custom_nutrients?: CustomNutrientDef[],
): string {
  const nutrients = [...(std_nutrients ?? []), ...(custom_nutrients ?? [])]
    .filter((n) => n?.key)
    .filter((n, index, all) => all.findIndex((candidate) => candidate.key === n.key) === index);
  const nutrientFields = nutrients.map((n) => `"${n.key}":0`).join(",");

  return `Nutritionniste expert. Reponds uniquement en JSON compact valide: {"meal_name":"","confidence_score":0.8,"items":[{"name":"","estimated_weight_g":0,"calories":0,"proteins":0,"carbs":0,"fats":0${nutrientFields ? `,${nutrientFields}` : ""}}],"total_summary":{"calories":0,"proteins":0,"carbs":0,"fats":0}}. Valeurs pour la portion consommee; tous les nutriments sont obligatoires (0 si inconnu). CRU vs CUIT: un poids indique par TEXTE pour pates/riz/semoule/quinoa/lentilles/legumes secs/viande/poisson est TOUJOURS cru/sec sauf mention explicite "cuit"; utilise les valeurs du produit cru (pates crues ~350 kcal/100g, PAS ~130 cuites). Sur IMAGE, l'aliment est cuit: valeurs cuites, ratio cru->cuit ~x2.5 pour pates/riz. UNITES: si un nombre est donne sans g/kg/ml/cl/L, ajoute unit_count, unit_weight_g (poids d'UNE unite), unit_label, et estimated_weight_g=unit_count*unit_weight_g. Ex: "3 oeufs"->unit_count=3,unit_label="oeuf"; "2 tranches jambon"->2,"tranche"; "1 portion Kiri"->1,"portion"; mais "200g riz"->poids brut cru sans unites. Aliments comptables: oeufs, tranches, portions fromage, biscuits, crepes, saucisses, nuggets, fruits entiers, tomates cerises. GRAISSES: si aspect brillant/frit, ajoute +5 a +10g de lipides. IMAGE: utilise couverts et assiette pour estimer les portions; si ambigu choisis l'option la plus calorique. Ajoute suggested_timestamp ISO si une date/heure est indiquee (ex "hier 22h").`;
}

/** Références personnelles pertinentes, fortement bornées pour le contexte local. */
export function buildLocalCustomFoodsContext(custom_foods?: any[], text?: string): string {
  if (!Array.isArray(custom_foods) || !text?.trim()) return "";
  const normalizedText = text.toLocaleLowerCase();
  const matches = custom_foods.filter((food) => {
    const name = String(food?.name ?? "").trim();
    return name.length >= 2 && normalizedText.includes(name.toLocaleLowerCase());
  });
  if (matches.length === 0) return "";

  const compact = matches.slice(0, 3).map((food) =>
    `${String(food.name).slice(0, 40)}:${Number(food.serving_size_g ?? 100)}g,${Number(food.calories_per_100g ?? 0)}kcal/100g,P${Number(food.proteins_per_100g ?? 0)},G${Number(food.carbs_per_100g ?? 0)},L${Number(food.fats_per_100g ?? 0)}`
  ).join(";");
  return ` Reference perso prioritaire: ${compact.slice(0, 400)}.`;
}

/** Message repas compact et borné pour éviter de dépasser le contexte local. */
export function buildLocalUserPromptText(opts: {
  hasImage: boolean;
  text?: string;
  local_time?: string;
  customFoodsContext?: string;
}): string {
  const description = String(opts.text ?? "").trim().slice(0, 900);
  const time = opts.local_time ? ` Heure locale:${String(opts.local_time).slice(0, 40)}.` : "";
  const refs = String(opts.customFoodsContext ?? "").slice(0, 400);
  return opts.hasImage
    ? `Analyse le repas visible.${description ? ` Indication:${description}.` : ""}${refs}${time}`
    : `Analyse ce repas: ${description}.${refs}${time}`;
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
