import { describe, expect, it } from "vitest";
import { analyzeMealCloudHybrid, cloudItemToQuery } from "./cloudHybridService";

/**
 * Règles métier du mode hybride cloud :
 *  1. Les nutriments du modèle cloud sont IGNORÉS — seuls noms/masses/unités
 *     alimentent le résolveur déterministe.
 *  2. Les cinq champs de portion (name, estimated_weight_g, unit_count,
 *     unit_weight_g, unit_label) sont conservés jusqu'au résolveur.
 *  3. Les listes de micronutriments (standard + personnalisés) restent
 *     dynamiques : un nutriment custom de la bibliothèque est résolu.
 */

const LIBRARY = [
  {
    name: "Poulet rôti",
    calories_per_100g: 165,
    proteins_per_100g: 31,
    carbs_per_100g: 0,
    fats_per_100g: 3.6,
    nutrients_std: { iron_mg: 1 },
    nutrients_custom: { creatine_mg: 400 },
  },
];

const CUSTOM_NUTRIENTS = [{ key: "creatine_mg", label: "Créatine", unit: "mg" }];

function cloudDetection() {
  return {
    meal_name: "Poulet rôti",
    confidence_score: 92,
    items: [
      {
        food_name: "poulet rôti",
        estimated_weight_g: 200,
        unit_count: 2,
        unit_weight_g: 100,
        unit_label: "escalope",
        // Valeurs hallucinées du modèle : ne doivent JAMAIS ressortir.
        calories: 9999,
        proteins: 999,
      },
    ],
  };
}

describe("cloudItemToQuery", () => {
  it("conserve les cinq champs de portion", () => {
    const q = cloudItemToQuery(cloudDetection().items[0], 0.92);
    expect(q).toMatchObject({
      name: "poulet rôti",
      weightG: 200,
      unitCount: 2,
      unitWeightG: 100,
      unitLabel: "escalope",
    });
  });

  it("rejette un item sans nom", () => {
    expect(cloudItemToQuery({ estimated_weight_g: 50 })).toBeNull();
  });
});

describe("analyzeMealCloudHybrid", () => {
  it("ignore les nutriments du cloud et résout via la bibliothèque", async () => {
    const res = await analyzeMealCloudHybrid(
      { text: "poulet rôti", custom_foods: LIBRARY, custom_nutrients: CUSTOM_NUTRIENTS },
      async () => cloudDetection(),
      "Test Cloud",
    );
    const item = res.items[0];
    // 165 kcal/100 g × 200 g = 330 — pas 9999.
    expect(item.calories).toBe(330);
    expect(item.proteins).toBe(62);
    expect(item.source).toBe("library");
    // Portions conservées.
    expect(item.estimated_weight_g).toBe(200);
    expect(item.unit_count).toBe(2);
    expect(item.unit_weight_g).toBe(100);
    expect(item.unit_label).toBe("escalope");
    // Micro standard de la bibliothèque (1 mg/100 g × 200 g).
    expect(item.iron_mg).toBe(2);
    // Micro personnalisé dynamique (400 mg/100 g × 200 g).
    expect(item.creatine_mg).toBe(800);
    // Totaux recalculés depuis les items résolus.
    expect(res.total_summary.calories).toBe(330);
    expect(res.pipeline.detector).toBe("Test Cloud");
  });

  it("échoue si le cloud ne détecte rien", async () => {
    await expect(
      analyzeMealCloudHybrid({ text: "???" }, async () => ({ items: [] }), "Test Cloud"),
    ).rejects.toThrow();
  });
});
