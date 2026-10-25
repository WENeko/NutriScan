/** Broaden catalogue queries only; semantic approval always uses the original name. */
export function cloudFoodSearchName(name: string): string {
  const corrected = name.trim().replace(/\bschupfnudlen\b/gi, "Schupfnudeln");
  const simplified = corrected
    .replace(/(?:[\s,]+)(?:cuits?|cuites?|crus?|crues?|rôtis?|rôties?|grillés?|grillées?|bouillis?|bouillies?|cooked|raw|roasted|grilled|boiled)\s*$/iu, "")
    .trim();
  return simplified || corrected;
}