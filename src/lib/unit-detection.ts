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

/** Typical unit weights in grams for common foods (used for retroactive detection) */
const TYPICAL_UNIT_WEIGHTS: Record<string, number> = {
  "oeuf": 60, "oeufs": 60, "egg": 60, "eggs": 60,
  "tranche": 30, "tranches": 30, "slice": 30, "slices": 30,
  "toast": 30, "toasts": 30,
  "tartine": 40, "tartines": 40,
  "biscuit": 15, "biscuits": 15, "cookie": 30, "cookies": 30,
  "galette": 50, "galettes": 50,
  "crêpe": 60, "crêpes": 60, "pancake": 60, "pancakes": 60,
  "tomate": 80, "tomates": 80,
  "olive": 5, "olives": 5,
  "amande": 1.2, "amandes": 1.2, "noix": 5, "noisette": 1.5, "noisettes": 1.5,
  "datte": 8, "dattes": 8,
  "abricot": 40, "abricots": 40,
  "radis": 10,
  "crevette": 8, "crevettes": 8, "shrimp": 8,
  "saucisse": 50, "saucisses": 50, "knack": 40, "knacks": 40,
  "boulette": 30, "boulettes": 30,
  "nugget": 20, "nuggets": 20,
  "bonbon": 5, "bonbons": 5,
  "fraise": 12, "fraises": 12, "strawberry": 12,
  "cerise": 8, "cerises": 8,
  "cornichon": 10, "cornichons": 10,
  "carré": 10, "carrés": 10,
  "morceau": 30, "morceaux": 30,
  "cuillère": 15, "cuillères": 15,
  "portion": 100, "portions": 100,
  "pièce": 50, "pièces": 50, "piece": 50, "pieces": 50,
  "unité": 50, "unités": 50, "unit": 50, "units": 50,
};

/** Try to detect unit-based quantity from AI response or item name */
export const parseUnitQuantity = (
  quantityStr: string,
  weightG: number,
  itemName: string
): { unitCount: number; unitWeightG: number; unitLabel: string } | null => {
  // Try from quantity string: "2 tranches", "5 tomates" (but NOT "50g")
  const match = quantityStr?.match(/^(\d+)\s*(?:x\s*)?([a-zA-ZÀ-ÿ].+?)(?:\s*\(.*\))?$/i);
  if (match) {
    const count = parseInt(match[1]);
    const label = match[2].trim().toLowerCase();
    // Require label to be at least 2 chars and match a keyword
    if (count > 0 && label.length >= 2 && UNIT_FOOD_KEYWORDS.some(k => label.includes(k) || (label.length >= 3 && k.includes(label)))) {
      return { unitCount: count, unitWeightG: Math.round(weightG / count), unitLabel: label };
    }
  }

  // Fallback: check item name for unit-countable foods and estimate count from weight
  const nameLower = (itemName || "").toLowerCase();
  const nameMatch = UNIT_FOOD_KEYWORDS.find(k => nameLower.includes(k));
  if (nameMatch && weightG > 0) {
    // First try: if quantity string is a pure number (no "g" suffix)
    if (quantityStr) {
      const qtyMatch = quantityStr.match(/^(\d+)\s*$/);
      if (qtyMatch) {
        const count = parseInt(qtyMatch[1]);
        if (count > 0 && count < 50) {
          return { unitCount: count, unitWeightG: Math.round(weightG / count), unitLabel: nameMatch };
        }
      }
    }
    // Second: estimate unit count from total weight and typical unit weight
    const typicalWeight = TYPICAL_UNIT_WEIGHTS[nameMatch];
    if (typicalWeight && weightG >= typicalWeight * 0.5) {
      const estimatedCount = Math.max(1, Math.round(weightG / typicalWeight));
      const actualUnitWeight = Math.round(weightG / estimatedCount);
      return { unitCount: estimatedCount, unitWeightG: actualUnitWeight, unitLabel: nameMatch };
    }
  }
  return null;
};
