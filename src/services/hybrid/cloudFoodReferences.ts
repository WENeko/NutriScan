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
];