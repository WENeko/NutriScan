/**
 * NutriScan Intelligence Engine - v1.0.0
 * Source Unique de Vérité pour la logique nutritionnelle.
 */

export interface NutrientDef {
  key: string;
  label: string;
  unit: string;
  category: string;
  /** true = limite à ne pas dépasser, false (défaut) = minimum à atteindre */
  isLimitDefault?: boolean;
  /** Description générée (bienfaits/impact) pour le tooltip — surtout pour les micros custom */
  description?: string;
}

export const NUTRIENTS_STD_LIST: NutrientDef[] = [
  { key: "fiber", label: "Fibres", unit: "g", category: "macro" },
  { key: "sugar", label: "Sucres", unit: "g", category: "macro", isLimitDefault: true },
  { key: "saturated_fat", label: "AG Sat.", unit: "g", category: "macro", isLimitDefault: true },
  { key: "omega3_mg", label: "Oméga-3", unit: "mg", category: "lipid" },
  { key: "sodium_mg", label: "Sodium", unit: "mg", category: "mineral", isLimitDefault: true },
  { key: "potassium_mg", label: "Potassium", unit: "mg", category: "mineral" },
  { key: "magnesium_mg", label: "Magnésium", unit: "mg", category: "mineral" },
  { key: "calcium_mg", label: "Calcium", unit: "mg", category: "mineral" },
  { key: "iron_mg", label: "Fer", unit: "mg", category: "mineral" },
  { key: "zinc_mg", label: "Zinc", unit: "mg", category: "mineral" },
  { key: "vitamin_c_mg", label: "Vit. C", unit: "mg", category: "vitamin" },
  { key: "vitamin_d_mcg", label: "Vit. D", unit: "µg", category: "vitamin" },
  { key: "vitamin_b9_mcg", label: "Vit. B9", unit: "µg", category: "vitamin" },
  { key: "vitamin_b12_mcg", label: "Vit. B12", unit: "µg", category: "vitamin" },
  { key: "vitamin_e_mg", label: "Vit. E", unit: "mg", category: "vitamin" },
];

// --- MODE EXPERT : overrides utilisateur des objectifs micros standards ---

export interface MicroOverride {
  /** Si défini, remplace la valeur calculée par calculateMicroGoals */
  goal?: number;
  /** Si défini, remplace le flag isLimitDefault de NUTRIENTS_STD_LIST */
  is_limit?: boolean;
}

export type MicroOverrides = Record<string, MicroOverride>;

/** Représentation unifiée d'un objectif micro pour la coloration & l'affichage */
export interface ResolvedMicroGoal {
  key: string;
  label: string;
  unit: string;
  category: NutrientDef['category'];
  /** Objectif final (override > scientifique > custom.goal > 0) */
  goal: number;
  /** Objectif scientifique de référence (avant override) */
  scientificGoal?: number;
  /** true = limite max, false = minimum à atteindre */
  isLimit: boolean;
  isCustom: boolean;
  isOverridden: boolean;
  /** Description (bienfaits/impact) pour le tooltip — surtout pour les micros custom */
  description?: string;
}

// --- TYPES DYNAMIQUES BASÉS SUR NUTRIENTS_STD_LIST ---

// Extrait toutes les clés de la liste maître
type NutrientKey = typeof NUTRIENTS_STD_LIST[number]['key'];

// Type pour un item alimentaire avec tous les micronutriments (optionnels car dépend de l'IA)
export type MicroNutrientFields = {
  [K in NutrientKey]?: number;
};

// Type pour les totaux de micronutriments dans un repas (préfixés par 'total_')
export type MicroTotalFields = {
  [K in NutrientKey as `total_${K}`]?: number;
};

// Helper pour obtenir la liste des clés dynamiquement
export const getNutrientKeys = (): string[] => NUTRIENTS_STD_LIST.map(n => n.key);

/**
 * Master List = liste STD + nutriments CUSTOM de l'utilisateur.
 * Source unique de vérité pour tous les affichages élargis.
 */
export function getMasterList<T extends NutrientDef = NutrientDef>(
  custom: T[] = [],
): NutrientDef[] {
  const stdKeys = new Set(NUTRIENTS_STD_LIST.map((n) => n.key));
  return [
    ...NUTRIENTS_STD_LIST,
    ...custom.filter((c) => c.key && !stdKeys.has(c.key)),
  ];
}

/** Interface interne pour le calcul des objectifs nutritionnels */
export interface NutritionUserProfile {
  age?: number;
  gender?: 'male' | 'female';
  weight?: number;
  totalCaloriesGoal?: number;
  isAthlete?: boolean;
  isSmoker?: boolean;
  isPregnant?: boolean;
  isMenopausal?: boolean;
}

/** Type legacy pour compatibilité avec les anciens composants (Dashboard.tsx) */
export interface UserProfile {
  gender?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  activity_level?: string | null;
  totalCaloriesGoal?: number | null;
  isSmoker?: boolean;
  isPregnant?: boolean;
  isAthlete?: boolean;
  isMenopausal?: boolean;
}

/**
 * Calcule les objectifs de micronutriments personnalisés
 */
export const calculateMicroGoals = (profile: NutritionUserProfile = {}): MicroGoals => {
  // --- FALLBACKS ---
  const age = profile.age ?? 30;
  const gender = profile.gender ?? 'male';
  const weight = profile.weight ?? 75;
  const calories = profile.totalCaloriesGoal ?? 2000;
  const isAthlete = !!profile.isAthlete;
  const isSmoker = !!profile.isSmoker;
  const isPregnant = !!profile.isPregnant;
  const isMenopausal = !!profile.isMenopausal;

  // Initialiser avec toutes les clés à 0
  const goals = {} as MicroGoals;
  NUTRIENTS_STD_LIST.forEach(n => { goals[n.key as keyof MicroGoals] = 0; });

  // --- LOGIQUE DE CALCUL PAR CLÉ ---
  NUTRIENTS_STD_LIST.forEach((n) => {
    let value = 0;

    switch (n.key) {
      // MACROS
      case "fiber":
        value = Math.max(25, (calories / 1000) * 14);
        break;
      case "sugar":
        value = (calories * 0.1) / 4;
        break;
      case "saturated_fat":
        value = (calories * 0.1) / 9;
        break;

      // MINÉRAUX
      case "magnesium_mg":
        value = weight * (isAthlete ? 7.2 : 6);
        break;
      case "potassium_mg":
        value = gender === "male" ? 3500 : 3000;
        break;
      case "calcium_mg":
        // Ménopause / >70 ans / femmes >50 ans → 1200 mg
        value = (isMenopausal || age > 70 || (gender === "female" && age > 50)) ? 1200 : 1000;
        break;
      case "iron_mg":
        // Ménopause : besoins ↘ (8 mg). Grossesse : ↗ (27 mg).
        value = isPregnant ? 27 : (isMenopausal ? 8 : (gender === "female" && age <= 50 ? 16 : 11));
        break;
      case "zinc_mg":
        value = (gender === "male" ? 11 : 8) * (isAthlete ? 1.25 : 1);
        break;
      case "sodium_mg":
        value = isAthlete ? 3000 : 2300;
        break;

      // VITAMINES
      case "vitamin_c_mg":
        value = 110 + (isSmoker ? 35 : 0) + (isAthlete ? 20 : 0);
        break;
      case "vitamin_d_mcg":
        value = age > 70 ? 20 : 15;
        break;
      case "vitamin_b9_mcg":
        value = isPregnant ? 600 : 400;
        break;
      case "vitamin_b12_mcg":
        value = isAthlete ? 5 : 4;
        break;
      case "vitamin_e_mg":
        value = 15 * (isAthlete ? 1.2 : 1) + (isSmoker ? 2 : 0);
        break;

      // LIPIDES
      case "omega3_mg":
        value = isAthlete ? 1000 : 500;
        break;

      default:
        value = 0;
    }

    (goals as any)[n.key] = Math.round(value);
  });

  return goals;
};

// --- COMPATIBILITÉ AVEC MealMicros.tsx ---

// Type legacy pour les composants qui attendent des clés spécifiques
export interface MicroGoals extends Record<string, number> {
  fiber: number;
  sugar: number;
  saturated_fat: number;
  omega3_mg: number;
  sodium_mg: number;
  potassium_mg: number;
  magnesium_mg: number;
  calcium_mg: number;
  iron_mg: number;
  zinc_mg: number;
  vitamin_c_mg: number;
  vitamin_d_mcg: number;
  vitamin_b9_mcg: number;
  vitamin_b12_mcg: number;
  vitamin_e_mg: number;
}

/** Description textuelle des micronutriments pour l'UI */
export function getMicroInfo(key: string, goal: number): string {
  const nutrient = NUTRIENTS_STD_LIST.find(n => n.key === key);
  if (!nutrient) return "";

  const descriptions: Record<string, (g: number, unit: string) => string> = {
    fiber: (g, u) => `Digestion et satiété. Objectif : ${g}${u}/jour.`,
    sugar: (g, u) => `Glucides simples. Limitez à <${g}${u}/jour.`,
    saturated_fat: (g, u) => `Santé cardiovasculaire. Limitez à <${g}${u}/jour.`,
    omega3_mg: (g, u) => `Inflammation et santé cardiaque. ${g}${u}/jour.`,
    sodium_mg: (g, u) => `Équilibre hydrique. <${g}${u}/jour.`,
    potassium_mg: (g, u) => `Équilibre hydrique et muscles. ${g}${u}/jour.`,
    magnesium_mg: (g, u) => `Récupération et santé osseuse. ${g}${u}/jour.`,
    calcium_mg: (g, u) => `Santé osseuse. ${g}${u}/jour.`,
    iron_mg: (g, u) => `Transport d'oxygène. ${g}${u}/jour.`,
    zinc_mg: (g, u) => `Immunité et cicatrisation. ${g}${u}/jour.`,
    vitamin_c_mg: (g, u) => `Antioxydants et immunité. ${g}${u}/jour.`,
    vitamin_d_mcg: (g, u) => `Immunité et hormones. ${g}${u}/jour.`,
    vitamin_b9_mcg: (g, u) => `Métabolisme cellulaire. ${g}${u}/jour.`,
    vitamin_b12_mcg: (g, u) => `Énergie et système nerveux. ${g}${u}/jour.`,
    vitamin_e_mg: (g, u) => `Antioxydants. ${g}${u}/jour.`,
  };

  return descriptions[key]?.(goal, nutrient.unit) ?? `${nutrient.label}. Objectif: ${goal}${nutrient.unit}/jour.`;
}

// --- FONCTIONS DE COMPATIBILITÉ pour les anciens imports ---

/** Convertit un UserProfile legacy vers le format interne NutritionUserProfile */
export function normalizeUserProfile(legacy: UserProfile): NutritionUserProfile {
  const isActive = legacy.activity_level === "active" || legacy.activity_level === "very_active" || legacy.activity_level === "athletic";
  return {
    age: legacy.age ?? 30,
    gender: (legacy.gender === "male" || legacy.gender === "female") ? legacy.gender : "male",
    weight: legacy.weight_kg ?? 75,
    totalCaloriesGoal: legacy.totalCaloriesGoal ?? 2000,
    isAthlete: legacy.isAthlete ?? isActive,
    isSmoker: legacy.isSmoker ?? false,
    isPregnant: legacy.isPregnant ?? false,
    isMenopausal: legacy.isMenopausal ?? false,
  };
}

/** Fonction legacy wrapper pour compatibilité Dashboard.tsx */
export function getPersonalizedMicroGoals(profile: UserProfile = {}): MicroGoals {
  return calculateMicroGoals(normalizeUserProfile(profile));
}

// --- RESOLVER UNIFIÉ : objectifs micros (std + custom) + overrides expert ---

/**
 * Source unique de vérité pour TOUS les consommateurs (Dashboard, Evolution,
 * HealthDetails, MealMicros). Combine :
 *  - liste std + liste custom (via getMasterList)
 *  - valeurs scientifiques (calculateMicroGoals)
 *  - overrides utilisateur (mode expert)
 *  - flag is_limit (override > std isLimitDefault > custom.is_limit > false)
 */
export function resolveMicroGoals(
  profile: UserProfile = {},
  customDefs: Array<NutrientDef & { goal?: number; is_limit?: boolean }> = [],
  overrides: MicroOverrides = {},
): ResolvedMicroGoal[] {
  const scientific = getPersonalizedMicroGoals(profile);
  const stdKeys = new Set(NUTRIENTS_STD_LIST.map((n) => n.key));
  const list = getMasterList(customDefs);

  return list.map<ResolvedMicroGoal>((n) => {
    const isCustom = !stdKeys.has(n.key);
    const ov = overrides[n.key];
    const scientificGoal = isCustom ? undefined : Number((scientific as any)[n.key] ?? 0);
    const customGoal = isCustom
      ? Number((customDefs.find((c) => c.key === n.key) as any)?.goal ?? 0)
      : 0;
    const goal = ov?.goal != null ? Number(ov.goal) : (scientificGoal ?? customGoal);
    const defaultLimit = isCustom
      ? !!(customDefs.find((c) => c.key === n.key) as any)?.is_limit
      : !!n.isLimitDefault;
    const isLimit = ov?.is_limit != null ? !!ov.is_limit : defaultLimit;
    return {
      key: n.key,
      label: n.label,
      unit: n.unit,
      category: n.category,
      goal: Number.isFinite(goal) ? goal : 0,
      scientificGoal,
      isLimit,
      isCustom,
      isOverridden: ov?.goal != null || ov?.is_limit != null,
    };
  });
}

