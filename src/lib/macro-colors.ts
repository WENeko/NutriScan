/**
 * Source unique de vérité pour les couleurs macros (P / G / L / kcal).
 * Les valeurs HSL sont définies dans src/index.css (tokens --macro-*).
 * Utilisez ces constantes dans tout composant qui doit colorer un macro.
 */
export const MACRO_COLORS = {
  protein: "hsl(var(--macro-protein))",
  carb: "hsl(var(--macro-carb))",
  fat: "hsl(var(--macro-fat))",
  calorie: "hsl(var(--macro-calorie))",
} as const;

export const MACRO_LABELS = {
  protein: "P",
  carb: "G",
  fat: "L",
} as const;
