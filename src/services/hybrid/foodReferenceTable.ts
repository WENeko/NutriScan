/**
 * Étage 2 du pipeline hybride : base nutritionnelle embarquée (type CIQUAL).
 *
 * Valeurs POUR 100 g (aliment prêt à consommer, sauf mention « cru »).
 * Macros + les 15 micronutriments standards de NUTRIENTS_STD_LIST.
 * Les clés de micros sont EXACTEMENT celles de `NUTRIENTS_STD_LIST`
 * (voir src/utils/nutrition-logic.ts) : aucune conversion n'est nécessaire.
 *
 * Cette table couvre les aliments génériques les plus fréquents — ceux qu'un
 * catalogue de produits emballés (Open Food Facts) référence mal. La résolution
 * est purement arithmétique : dose = (poids / 100) × valeur_100g. Aucun appel
 * réseau, aucune hallucination possible.
 */

export interface FoodReference {
  /** Identifiant interne. */
  id: string;
  /** Nom affiché (français). */
  name: string;
  /** Mots-clés de correspondance (français + anglais, sans accents, minuscules). */
  aliases: string[];
  /** Poids moyen d'une unité, si l'aliment se compte en unités. */
  unitWeightG?: number;
  /** Libellé de l'unité (ex: "oeuf", "tranche"). */
  unitLabel?: string;
  /** Valeurs pour 100 g. */
  per100: {
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
  } & Partial<Record<string, number>>;
}

/** Fabrique compacte : [cal, prot, carb, fat] + micros optionnels. */
function ref(
  id: string,
  name: string,
  aliases: string[],
  macros: [number, number, number, number],
  micros: Partial<Record<string, number>> = {},
  unit?: { unitWeightG: number; unitLabel: string },
): FoodReference {
  return {
    id,
    name,
    aliases,
    ...(unit ?? {}),
    per100: {
      calories: macros[0],
      proteins: macros[1],
      carbs: macros[2],
      fats: macros[3],
      ...micros,
    },
  };
}

export const FOOD_REFERENCE_TABLE: FoodReference[] = [
  // ── Viandes & volailles ────────────────────────────────────────────────────
  ref("poulet_blanc_grille", "Blanc de poulet grillé", ["poulet", "blanc de poulet", "chicken", "chicken breast", "grilled chicken"],
    [165, 31, 0, 3.6],
    { saturated_fat: 1, sodium_mg: 74, potassium_mg: 256, magnesium_mg: 29, calcium_mg: 15, iron_mg: 1, zinc_mg: 1, vitamin_b12_mcg: 0.3, vitamin_e_mg: 0.3, vitamin_b9_mcg: 4 }),
  ref("boeuf_hache_5", "Bœuf haché 5%", ["boeuf", "steak hache", "beef", "ground beef", "viande hachee"],
    [137, 21, 0, 5],
    { saturated_fat: 2.3, sodium_mg: 66, potassium_mg: 330, magnesium_mg: 22, calcium_mg: 12, iron_mg: 2.6, zinc_mg: 4.8, vitamin_b12_mcg: 2.5, vitamin_b9_mcg: 7 }),
  ref("jambon_blanc", "Jambon blanc", ["jambon", "ham", "tranche de jambon"],
    [107, 18, 1, 3.5],
    { saturated_fat: 1.2, sodium_mg: 1100, potassium_mg: 320, magnesium_mg: 18, calcium_mg: 7, iron_mg: 0.8, zinc_mg: 1.8, vitamin_b12_mcg: 0.6 },
    { unitWeightG: 40, unitLabel: "tranche" }),
  ref("dinde", "Escalope de dinde", ["dinde", "turkey", "escalope de dinde"],
    [135, 29, 0, 1.5],
    { saturated_fat: 0.5, sodium_mg: 60, potassium_mg: 300, magnesium_mg: 27, calcium_mg: 11, iron_mg: 1.1, zinc_mg: 1.7, vitamin_b12_mcg: 0.4 }),

  // ── Poissons & fruits de mer ───────────────────────────────────────────────
  ref("saumon_cuit", "Saumon cuit", ["saumon", "salmon", "pave de saumon"],
    [206, 22, 0, 13],
    { saturated_fat: 3.1, omega3_mg: 2200, sodium_mg: 61, potassium_mg: 384, magnesium_mg: 29, calcium_mg: 15, iron_mg: 0.5, zinc_mg: 0.6, vitamin_d_mcg: 11, vitamin_b12_mcg: 3.2, vitamin_e_mg: 1.1, vitamin_b9_mcg: 26 }),
  ref("thon_naturel", "Thon au naturel", ["thon", "tuna"],
    [116, 26, 0, 1],
    { saturated_fat: 0.3, omega3_mg: 300, sodium_mg: 320, potassium_mg: 240, magnesium_mg: 33, calcium_mg: 11, iron_mg: 1.3, zinc_mg: 0.7, vitamin_d_mcg: 2, vitamin_b12_mcg: 2.2 }),
  ref("cabillaud", "Cabillaud", ["cabillaud", "morue", "cod"],
    [82, 18, 0, 0.7],
    { saturated_fat: 0.1, omega3_mg: 200, sodium_mg: 78, potassium_mg: 413, magnesium_mg: 25, calcium_mg: 16, iron_mg: 0.4, zinc_mg: 0.5, vitamin_d_mcg: 1, vitamin_b12_mcg: 1 }),
  ref("crevette", "Crevette cuite", ["crevette", "crevettes", "shrimp", "gambas"],
    [99, 24, 0, 0.3],
    { sodium_mg: 111, potassium_mg: 259, magnesium_mg: 39, calcium_mg: 70, iron_mg: 0.5, zinc_mg: 1.6, vitamin_b12_mcg: 1.1, vitamin_e_mg: 1.1 },
    { unitWeightG: 8, unitLabel: "crevette" }),

  // ── Œufs & produits laitiers ───────────────────────────────────────────────
  ref("oeuf", "Œuf", ["oeuf", "oeufs", "egg", "eggs"],
    [143, 13, 0.7, 9.5],
    { saturated_fat: 3.1, sodium_mg: 142, potassium_mg: 138, magnesium_mg: 12, calcium_mg: 56, iron_mg: 1.8, zinc_mg: 1.3, vitamin_d_mcg: 2, vitamin_b12_mcg: 1.1, vitamin_e_mg: 1.1, vitamin_b9_mcg: 47 },
    { unitWeightG: 55, unitLabel: "oeuf" }),
  ref("fromage_blanc_0", "Fromage blanc 0%", ["fromage blanc", "skyr", "cottage"],
    [47, 8, 4, 0.2],
    { sugar: 4, sodium_mg: 40, potassium_mg: 150, magnesium_mg: 11, calcium_mg: 110, iron_mg: 0.1, zinc_mg: 0.5, vitamin_b12_mcg: 0.5, vitamin_b9_mcg: 10 }),
  ref("yaourt_nature", "Yaourt nature", ["yaourt", "yogourt", "yogurt"],
    [58, 4, 5, 3],
    { sugar: 5, saturated_fat: 2, sodium_mg: 50, potassium_mg: 155, magnesium_mg: 12, calcium_mg: 120, zinc_mg: 0.6, vitamin_b12_mcg: 0.4, vitamin_b9_mcg: 8 },
    { unitWeightG: 125, unitLabel: "pot" }),
  ref("lait_demi_ecreme", "Lait demi-écrémé", ["lait", "milk"],
    [46, 3.2, 4.8, 1.5],
    { sugar: 4.8, saturated_fat: 1, sodium_mg: 44, potassium_mg: 150, magnesium_mg: 11, calcium_mg: 115, zinc_mg: 0.4, vitamin_d_mcg: 0.1, vitamin_b12_mcg: 0.4, vitamin_b9_mcg: 5 }),
  ref("emmental", "Emmental", ["emmental", "gruyere", "fromage rape", "cheese"],
    [382, 28, 1, 30],
    { saturated_fat: 19, sodium_mg: 320, potassium_mg: 100, magnesium_mg: 35, calcium_mg: 1000, iron_mg: 0.3, zinc_mg: 4, vitamin_b12_mcg: 2.2, vitamin_e_mg: 0.5 }),
  ref("mozzarella", "Mozzarella", ["mozzarella"],
    [253, 18, 2, 19],
    { saturated_fat: 12, sodium_mg: 400, potassium_mg: 90, magnesium_mg: 20, calcium_mg: 500, iron_mg: 0.2, zinc_mg: 2.5, vitamin_b12_mcg: 1.5 }),

  // ── Féculents (crus / secs) ────────────────────────────────────────────────
  ref("pates_crues", "Pâtes crues", ["pates", "pate", "spaghetti", "penne", "pasta", "macaroni"],
    [352, 12, 71, 1.5],
    { fiber: 3, sugar: 2.5, sodium_mg: 6, potassium_mg: 220, magnesium_mg: 50, calcium_mg: 20, iron_mg: 1.3, zinc_mg: 1.2, vitamin_b9_mcg: 18, vitamin_e_mg: 0.4 }),
  ref("riz_cru", "Riz cru", ["riz", "rice", "basmati"],
    [349, 7, 78, 0.9],
    { fiber: 1.4, sodium_mg: 5, potassium_mg: 110, magnesium_mg: 32, calcium_mg: 10, iron_mg: 0.8, zinc_mg: 1.2, vitamin_b9_mcg: 8 }),
  ref("quinoa_cru", "Quinoa cru", ["quinoa"],
    [368, 14, 58, 6],
    { fiber: 7, sodium_mg: 5, potassium_mg: 563, magnesium_mg: 197, calcium_mg: 47, iron_mg: 4.6, zinc_mg: 3.1, vitamin_b9_mcg: 184, vitamin_e_mg: 2.4 }),
  ref("lentilles_crues", "Lentilles crues", ["lentille", "lentilles", "lentils"],
    [336, 24, 49, 1.5],
    { fiber: 11, sodium_mg: 6, potassium_mg: 950, magnesium_mg: 80, calcium_mg: 50, iron_mg: 7.5, zinc_mg: 3.3, vitamin_b9_mcg: 479, vitamin_c_mg: 4 }),
  ref("pomme_de_terre", "Pomme de terre cuite", ["pomme de terre", "pommes de terre", "patate", "potato"],
    [86, 2, 19, 0.1],
    { fiber: 1.8, sodium_mg: 5, potassium_mg: 379, magnesium_mg: 20, calcium_mg: 8, iron_mg: 0.3, zinc_mg: 0.3, vitamin_c_mg: 13, vitamin_b9_mcg: 10 }),
  ref("pain_complet", "Pain complet", ["pain", "pain complet", "bread", "tartine"],
    [247, 9, 41, 3.4],
    { fiber: 6, sugar: 3, saturated_fat: 0.7, sodium_mg: 450, potassium_mg: 250, magnesium_mg: 75, calcium_mg: 50, iron_mg: 2.5, zinc_mg: 1.8, vitamin_b9_mcg: 30, vitamin_e_mg: 0.6 },
    { unitWeightG: 30, unitLabel: "tranche" }),
  ref("flocons_avoine", "Flocons d'avoine", ["avoine", "flocons d'avoine", "oats", "porridge"],
    [370, 13, 60, 7],
    { fiber: 10, sugar: 1, saturated_fat: 1.2, sodium_mg: 5, potassium_mg: 400, magnesium_mg: 177, calcium_mg: 54, iron_mg: 4.7, zinc_mg: 4, vitamin_b9_mcg: 32, vitamin_e_mg: 0.7 }),

  // ── Légumes ────────────────────────────────────────────────────────────────
  ref("epinards", "Épinards cuits", ["epinard", "epinards", "spinach"],
    [23, 3, 1.4, 0.4],
    { fiber: 2.2, sodium_mg: 70, potassium_mg: 466, magnesium_mg: 79, calcium_mg: 136, iron_mg: 3.6, zinc_mg: 0.8, vitamin_c_mg: 10, vitamin_b9_mcg: 146, vitamin_e_mg: 2 }),
  ref("brocoli", "Brocoli cuit", ["brocoli", "broccoli"],
    [35, 2.4, 4, 0.4],
    { fiber: 3.3, sodium_mg: 41, potassium_mg: 293, magnesium_mg: 21, calcium_mg: 40, iron_mg: 0.7, zinc_mg: 0.5, vitamin_c_mg: 65, vitamin_b9_mcg: 108, vitamin_e_mg: 1.5 }),
  ref("haricots_verts", "Haricots verts", ["haricot vert", "haricots verts", "green beans"],
    [31, 1.8, 4, 0.2],
    { fiber: 3, sodium_mg: 6, potassium_mg: 211, magnesium_mg: 25, calcium_mg: 37, iron_mg: 1, zinc_mg: 0.2, vitamin_c_mg: 12, vitamin_b9_mcg: 33 }),
  ref("tomate", "Tomate", ["tomate", "tomates", "tomato"],
    [18, 0.9, 3.9, 0.2],
    { fiber: 1.2, sugar: 2.6, sodium_mg: 5, potassium_mg: 237, magnesium_mg: 11, calcium_mg: 10, iron_mg: 0.3, zinc_mg: 0.2, vitamin_c_mg: 14, vitamin_b9_mcg: 15, vitamin_e_mg: 0.5 },
    { unitWeightG: 120, unitLabel: "tomate" }),
  ref("carotte", "Carotte", ["carotte", "carottes", "carrot"],
    [41, 0.9, 9.6, 0.2],
    { fiber: 2.8, sugar: 4.7, sodium_mg: 69, potassium_mg: 320, magnesium_mg: 12, calcium_mg: 33, iron_mg: 0.3, zinc_mg: 0.2, vitamin_c_mg: 6, vitamin_b9_mcg: 19, vitamin_e_mg: 0.7 }),
  ref("salade_verte", "Salade verte", ["salade", "laitue", "lettuce", "mache", "roquette"],
    [15, 1.4, 1.3, 0.2],
    { fiber: 1.3, sodium_mg: 28, potassium_mg: 194, magnesium_mg: 13, calcium_mg: 36, iron_mg: 0.9, zinc_mg: 0.2, vitamin_c_mg: 9, vitamin_b9_mcg: 38, vitamin_e_mg: 0.3 }),
  ref("courgette", "Courgette", ["courgette", "zucchini"],
    [21, 1.2, 2.5, 0.3],
    { fiber: 1.1, sodium_mg: 8, potassium_mg: 261, magnesium_mg: 18, calcium_mg: 16, iron_mg: 0.4, zinc_mg: 0.3, vitamin_c_mg: 18, vitamin_b9_mcg: 24 }),
  ref("avocat", "Avocat", ["avocat", "avocado"],
    [160, 2, 8.5, 15],
    { fiber: 6.7, saturated_fat: 2.1, sodium_mg: 7, potassium_mg: 485, magnesium_mg: 29, calcium_mg: 12, iron_mg: 0.6, zinc_mg: 0.6, vitamin_c_mg: 10, vitamin_b9_mcg: 81, vitamin_e_mg: 2.1 },
    { unitWeightG: 150, unitLabel: "avocat" }),

  // ── Fruits ─────────────────────────────────────────────────────────────────
  ref("pomme", "Pomme", ["pomme", "apple"],
    [52, 0.3, 14, 0.2],
    { fiber: 2.4, sugar: 10, sodium_mg: 1, potassium_mg: 107, magnesium_mg: 5, calcium_mg: 6, iron_mg: 0.1, zinc_mg: 0.1, vitamin_c_mg: 5, vitamin_b9_mcg: 3, vitamin_e_mg: 0.2 },
    { unitWeightG: 150, unitLabel: "pomme" }),
  ref("banane", "Banane", ["banane", "banana"],
    [89, 1.1, 23, 0.3],
    { fiber: 2.6, sugar: 12, sodium_mg: 1, potassium_mg: 358, magnesium_mg: 27, calcium_mg: 5, iron_mg: 0.3, zinc_mg: 0.2, vitamin_c_mg: 9, vitamin_b9_mcg: 20, vitamin_e_mg: 0.1 },
    { unitWeightG: 120, unitLabel: "banane" }),
  ref("orange", "Orange", ["orange"],
    [47, 0.9, 12, 0.1],
    { fiber: 2.4, sugar: 9, sodium_mg: 0, potassium_mg: 181, magnesium_mg: 10, calcium_mg: 40, iron_mg: 0.1, zinc_mg: 0.1, vitamin_c_mg: 53, vitamin_b9_mcg: 30, vitamin_e_mg: 0.2 },
    { unitWeightG: 180, unitLabel: "orange" }),
  ref("fraise", "Fraise", ["fraise", "fraises", "strawberry"],
    [32, 0.7, 7.7, 0.3],
    { fiber: 2, sugar: 4.9, sodium_mg: 1, potassium_mg: 153, magnesium_mg: 13, calcium_mg: 16, iron_mg: 0.4, zinc_mg: 0.1, vitamin_c_mg: 59, vitamin_b9_mcg: 24, vitamin_e_mg: 0.3 }),

  // ── Matières grasses & divers ──────────────────────────────────────────────
  ref("huile_olive", "Huile d'olive", ["huile", "huile d'olive", "olive oil"],
    [884, 0, 0, 100],
    { saturated_fat: 14, omega3_mg: 760, vitamin_e_mg: 14 }),
  ref("beurre", "Beurre", ["beurre", "butter"],
    [717, 0.9, 0.1, 81],
    { saturated_fat: 51, sodium_mg: 11, potassium_mg: 24, calcium_mg: 24, vitamin_d_mcg: 1.5, vitamin_e_mg: 2.3, vitamin_b12_mcg: 0.2 }),
  ref("amande", "Amandes", ["amande", "amandes", "almond"],
    [579, 21, 22, 50],
    { fiber: 12.5, sugar: 4.4, saturated_fat: 3.8, sodium_mg: 1, potassium_mg: 733, magnesium_mg: 270, calcium_mg: 269, iron_mg: 3.7, zinc_mg: 3.1, vitamin_b9_mcg: 44, vitamin_e_mg: 26 }),
  ref("noix", "Noix", ["noix", "walnut"],
    [654, 15, 14, 65],
    { fiber: 6.7, sugar: 2.6, saturated_fat: 6, omega3_mg: 9080, sodium_mg: 2, potassium_mg: 441, magnesium_mg: 158, calcium_mg: 98, iron_mg: 2.9, zinc_mg: 3.1, vitamin_b9_mcg: 98, vitamin_e_mg: 0.7 }),
  ref("chocolat_noir", "Chocolat noir 70%", ["chocolat", "chocolat noir", "dark chocolate"],
    [598, 7.8, 46, 43],
    { fiber: 11, sugar: 24, saturated_fat: 24, sodium_mg: 20, potassium_mg: 715, magnesium_mg: 228, calcium_mg: 73, iron_mg: 11.9, zinc_mg: 3.3, vitamin_e_mg: 0.6 },
    { unitWeightG: 10, unitLabel: "carre" }),
  ref("riz_cuit", "Riz cuit", ["riz cuit", "cooked rice"],
    [130, 2.7, 28, 0.3],
    { fiber: 0.4, sodium_mg: 1, potassium_mg: 35, magnesium_mg: 12, calcium_mg: 10, iron_mg: 0.2, zinc_mg: 0.5 }),
  ref("pates_cuites", "Pâtes cuites", ["pates cuites", "cooked pasta"],
    [131, 5, 25, 1.1],
    { fiber: 1.8, sodium_mg: 1, potassium_mg: 44, magnesium_mg: 18, calcium_mg: 7, iron_mg: 0.5, zinc_mg: 0.5, vitamin_b9_mcg: 7 }),
];

/** Normalise une chaîne : minuscule, sans accent, sans ponctuation. */
export function normalizeName(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Aliments féculents dont un poids texte est considéré comme CRU par défaut. */
const RAW_BY_DEFAULT = new Set(["pates_crues", "riz_cru", "quinoa_cru", "lentilles_crues"]);

/** Équivalents cuits pour une détection sur photo (l'aliment est vu cuit). */
const COOKED_EQUIVALENT: Record<string, string> = {
  pates_crues: "pates_cuites",
  riz_cru: "riz_cuit",
};

export function isRawByDefault(id: string): boolean {
  return RAW_BY_DEFAULT.has(id);
}

export function cookedEquivalentOf(id: string): FoodReference | null {
  const target = COOKED_EQUIVALENT[id];
  if (!target) return null;
  return FOOD_REFERENCE_TABLE.find((f) => f.id === target) ?? null;
}

/**
 * Recherche déterministe dans la table locale (< 1 ms).
 * Score : correspondance exacte > alias contenu dans la requête > mots communs.
 */
export function findFoodReference(query: string): { food: FoodReference; score: number } | null {
  const q = normalizeName(query);
  if (!q) return null;
  const qWords = new Set(q.split(" ").filter((w) => w.length > 2));

  let best: { food: FoodReference; score: number } | null = null;
  for (const food of FOOD_REFERENCE_TABLE) {
    let score = 0;
    for (const alias of food.aliases) {
      const a = normalizeName(alias);
      if (!a) continue;
      if (a === q) score = Math.max(score, 1);
      else if (q.includes(a)) score = Math.max(score, 0.85 + Math.min(0.1, a.length / 200));
      else if (a.includes(q) && q.length > 3) score = Math.max(score, 0.75);
      else {
        const aWords = a.split(" ").filter((w) => w.length > 2);
        const common = aWords.filter((w) => qWords.has(w)).length;
        if (common > 0) score = Math.max(score, 0.5 + 0.1 * common);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { food, score };
  }
  return best;
}
