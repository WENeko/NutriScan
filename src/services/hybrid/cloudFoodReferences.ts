/** Verified USDA SR Legacy snapshots, cloud-only so legacy matching stays unchanged. */
export const CLOUD_FOOD_REFERENCES = [
  {
    id: "usda-sr-167746", name: "Citron cru, sans peau", aliases: ["citron", "lemon", "quartier de citron"],
    // https://fdc.nal.usda.gov/food-details/167746/nutrients
    per100: { calories: 29, proteins: 1.1, carbs: 9.32, fats: 0.3, fiber: 2.8, vitamin_c_mg: 53, vitamin_b9_mcg: 11, potassium_mg: 138, iron_mg: 0.6, sodium_mg: 2 },
  },
  {
    id: "usda-sr-172421", name: "Lentilles cuites, bouillies sans sel", aliases: ["lentilles cuites", "lentils cooked boiled without salt"],
    // https://fdc.nal.usda.gov/food-details/172421/nutrients
    per100: { calories: 116, proteins: 9.02, carbs: 20.13, fats: 0.38, fiber: 7.9, vitamin_b9_mcg: 181, potassium_mg: 369, iron_mg: 3.33, sodium_mg: 2 },
  },
  {
    id: "usda-fdc-2708722", name: "Gnocchis de pommes de terre", aliases: ["gnocchi", "gnocchis", "potato gnocchi", "gnocchi di patate"],
    // https://fdc.nal.usda.gov/food-details/2708722/nutrients
    per100: { calories: 135, proteins: 2.44, carbs: 17.2, fats: 6.33, fiber: 1, sugar: 0.99, saturated_fat: 3.42, sodium_mg: 279, potassium_mg: 139, calcium_mg: 22, iron_mg: 0.83, vitamin_d_mcg: 0.2 },
  },
  {
    id: "usda-sr-168412", name: "Endive crue", aliases: ["endive", "endives", "chicorée", "chicon", "endive crue"],
    // https://fdc.nal.usda.gov/food-details/168412/nutrients
    per100: { calories: 17, proteins: 1.25, carbs: 3.35, fats: 0.2, fiber: 3.1, sugar: 0.25, saturated_fat: 0.05, sodium_mg: 22, potassium_mg: 314, magnesium_mg: 15, calcium_mg: 52, iron_mg: 0.83, zinc_mg: 0.79, vitamin_c_mg: 6.5, vitamin_b9_mcg: 142, vitamin_e_mg: 0.44 },
  },
  {
    // Provisoire : pas de fiche USDA officielle ; valeurs compilées (eatbetter.app),
    // cohérentes avec un bâtonnet de pommes de terre/farine poché puis poêlé.
    id: "prov-schupfnudeln", name: "Schupfnudeln (bâtonnets de pommes de terre)", aliases: ["schupfnudeln", "schupfnudlen", "schupfnudeln cuits", "bâtonnets de pommes de terre"],
    provisional: true,
    per100: { calories: 140, proteins: 4.5, carbs: 28, fats: 1.2, fiber: 2, saturated_fat: 0.2, sodium_mg: 180 },
  },
];
