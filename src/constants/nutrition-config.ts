export interface NutrientDef {
  key: string;
  label: string;
  unit: string;
  category: 'mineral' | 'vitamin' | 'macro' | 'lipid';
  isExpert?: boolean; // Pour ton futur mode expert
}

export const NUTRIENTS_MASTER_LIST: NutrientDef[] = [
  { key: "fiber", label: "Fibres", unit: "g", category: "macro" },
  { key: "sugar", label: "Sucres", unit: "g", category: "macro" },
  { key: "saturated_fat", label: "AG Sat.", unit: "g", category: "lipid" },
  { key: "omega3_mg", label: "Oméga-3", unit: "mg", category: "lipid" },
  { key: "sodium_mg", label: "Sodium", unit: "mg", category: "mineral" },
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
