/** Unit food names — items naturally counted in units */
export const UNIT_FOOD_KEYWORDS = [
  "oeuf", "oeufs", "egg", "eggs",
  "tranche", "tranches", "slice", "slices",
  "portion", "portions",
  "pièce", "pièces", "piece", "pieces",
  "unité", "unités", "unit", "units",
  "biscuit", "biscuits", "cookie", "cookies",
  "toast", "toasts",
  "tartine", "tartines",
  "galette", "galettes",
  "crêpe", "crêpes", "pancake", "pancakes",
  "morceau", "morceaux",
  "cuillère", "cuillères",
  "carré", "carrés",
  "tomate", "tomates",
  "olive", "olives",
  "amande", "amandes", "noix", "noisette", "noisettes",
  "datte", "dattes",
  "abricot", "abricots",
  "radis",
  "crevette", "crevettes", "shrimp",
  "saucisse", "saucisses", "knack", "knacks",
  "boulette", "boulettes",
  "nugget", "nuggets",
  "bonbon", "bonbons",
  "fraise", "fraises", "strawberry",
  "cerise", "cerises",
  "cornichon", "cornichons",
];

/** Try to detect unit-based quantity from AI response or item name */
export const parseUnitQuantity = (
  quantityStr: string,
  weightG: number,
  itemName: string
): { unitCount: number; unitWeightG: number; unitLabel: string } | null => {
  // Try from quantity string: "2 tranches", "5 tomates"
  const match = quantityStr?.match(/^(\d+)\s*(?:x\s*)?(.+?)(?:\s*\(.*\))?$/i);
  if (match) {
    const count = parseInt(match[1]);
    const label = match[2].trim().toLowerCase();
    if (count > 0 && UNIT_FOOD_KEYWORDS.some(k => label.includes(k) || k.includes(label))) {
      return { unitCount: count, unitWeightG: Math.round(weightG / count), unitLabel: label };
    }
  }
  // Fallback: check item name for unit-countable foods
  const nameLower = (itemName || "").toLowerCase();
  const nameMatch = UNIT_FOOD_KEYWORDS.find(k => nameLower.includes(k));
  if (nameMatch) {
    if (quantityStr) {
      const qtyMatch = quantityStr.match(/(\d+)/);
      if (qtyMatch) {
        const count = parseInt(qtyMatch[1]);
        if (count > 0 && count < 50) {
          return { unitCount: count, unitWeightG: Math.round(weightG / count), unitLabel: nameMatch };
        }
      }
    }
  }
  return null;
};
