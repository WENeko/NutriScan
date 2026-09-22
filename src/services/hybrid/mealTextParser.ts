/**
 * Étage 1 (variante TEXTE) du pipeline hybride.
 *
 * Remplace le modèle de vision Laya lorsque l'utilisateur SAISIT son repas :
 * un parseur déterministe extrait, en moins d'une milliseconde et sans IA,
 * la liste des aliments avec leur quantité (poids, volume ou nombre d'unités).
 *
 * Exemples gérés :
 *   "150g de saumon, 200 g de riz et 2 oeufs"
 *   "3 tranches de jambon + une pomme"
 *   "bol de flocons d'avoine 60g avec 200ml de lait"
 *
 * Ce qui n'est pas quantifié reçoit une portion par défaut issue de la table de
 * référence (poids d'unité) ou 100 g, et est marqué `assumed: true` pour que
 * l'étage 3 (micro-LLM local) puisse affiner si l'utilisateur le souhaite.
 */
import { findFoodReference, normalizeName } from "./foodReferenceTable";

export interface ParsedFoodMention {
  /** Texte de l'aliment tel que saisi (nettoyé). */
  name: string;
  /** Poids en grammes (déjà multiplié par le nombre d'unités si applicable). */
  weightG: number;
  /** Nombre d'unités, si l'utilisateur a donné un nombre sans unité de poids. */
  unitCount?: number;
  /** Poids moyen d'une unité. */
  unitWeightG?: number;
  /** Libellé de l'unité. */
  unitLabel?: string;
  /** true si le poids a été supposé (aucune quantité explicite). */
  assumed: boolean;
}

/** Nombres écrits en lettres, fréquents dans une saisie rapide. */
const WORD_NUMBERS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
  sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, demi: 0.5,
};

/** Mots à ignorer en tête d'aliment. */
const STOP_WORDS = new Set([
  "de", "du", "des", "d", "la", "le", "les", "l", "au", "aux", "avec", "et",
  "plus", "un", "une", "petit", "petite", "grand", "grande", "environ",
  "portion", "portions", "assiette", "bol", "verre", "cuillere", "cuilleres",
]);

/** Sépare la saisie en segments (virgules, « et », « + », retours ligne). */
function splitSegments(text: string): string[] {
  return text
    .split(/\n|,|;|\+|\bet\b|\bavec\b|\bainsi que\b/gi)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/** Retire les mots vides en tête/queue d'un nom d'aliment. */
function cleanFoodName(raw: string): string {
  const words = normalizeName(raw).split(" ").filter(Boolean);
  while (words.length && STOP_WORDS.has(words[0])) words.shift();
  while (words.length && STOP_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

/**
 * Analyse un segment : quantité + aliment.
 * Accepte le point ET la virgule décimale (ex: "1,5 kg").
 */
function parseSegment(segment: string): ParsedFoodMention | null {
  const seg = segment.trim();
  if (!seg) return null;

  // 1) Quantité avec unité de poids / volume : "150g", "1,5 kg", "200 ml", "20 cl"
  const weightMatch = seg.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|grammes?|mg|ml|cl|l|litres?)\b/i);
  if (weightMatch) {
    const value = parseFloat(weightMatch[1].replace(",", "."));
    const unit = weightMatch[2].toLowerCase();
    let grams = value;
    if (/^(kg|kilo)/.test(unit)) grams = value * 1000;
    else if (unit === "mg") grams = value / 1000;
    else if (unit === "cl") grams = value * 10;
    else if (unit === "l" || unit.startsWith("litre")) grams = value * 1000;
    // ml et g → 1:1 (densité ≈ 1 pour les liquides alimentaires courants)
    const name = cleanFoodName(seg.replace(weightMatch[0], " "));
    if (!name) return null;
    return { name, weightG: Math.round(grams), assumed: false };
  }

  // 2) Quantité en unités : "3 oeufs", "deux tranches de jambon"
  const countMatch = seg.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s+(.+)/);
  const wordMatch = !countMatch
    ? seg.match(new RegExp(`(?:^|\\s)(${Object.keys(WORD_NUMBERS).join("|")})\\s+(.+)`, "i"))
    : null;

  if (countMatch || wordMatch) {
    const countRaw = countMatch ? countMatch[1] : (wordMatch as RegExpMatchArray)[1];
    const rest = countMatch ? countMatch[2] : (wordMatch as RegExpMatchArray)[2];
    const count = countMatch
      ? parseFloat(countRaw.replace(",", "."))
      : WORD_NUMBERS[countRaw.toLowerCase()] ?? 1;
    const name = cleanFoodName(rest);
    if (!name) return null;
    const match = findFoodReference(name);
    const unitWeightG = match?.food.unitWeightG ?? 100;
    const unitLabel = match?.food.unitLabel ?? "portion";
    return {
      name,
      weightG: Math.round(count * unitWeightG),
      unitCount: count,
      unitWeightG,
      unitLabel,
      assumed: !match?.food.unitWeightG,
    };
  }

  // 3) Aucune quantité : portion par défaut
  const name = cleanFoodName(seg);
  if (!name || name.length < 3) return null;
  const match = findFoodReference(name);
  const unitWeightG = match?.food.unitWeightG;
  if (unitWeightG) {
    return {
      name,
      weightG: unitWeightG,
      unitCount: 1,
      unitWeightG,
      unitLabel: match?.food.unitLabel ?? "portion",
      assumed: true,
    };
  }
  return { name, weightG: 100, assumed: true };
}

/** Extrait la liste des aliments mentionnés dans une saisie libre. */
export function parseMealText(text: string): ParsedFoodMention[] {
  const out: ParsedFoodMention[] = [];
  for (const segment of splitSegments(text || "")) {
    const parsed = parseSegment(segment);
    if (parsed) out.push(parsed);
  }
  // Fusionne les doublons exacts
  const merged = new Map<string, ParsedFoodMention>();
  for (const m of out) {
    const existing = merged.get(m.name);
    if (existing) {
      existing.weightG += m.weightG;
      if (existing.unitCount && m.unitCount) existing.unitCount += m.unitCount;
    } else {
      merged.set(m.name, { ...m });
    }
  }
  return Array.from(merged.values());
}

/** Détecte une indication temporelle simple ("hier à 22h", "ce matin"). */
export function extractSuggestedTimestamp(text: string, now = new Date()): string | undefined {
  const t = normalizeName(text);
  if (!t) return undefined;
  const d = new Date(now);
  let touched = false;

  if (/\bhier\b/.test(t)) {
    d.setDate(d.getDate() - 1);
    touched = true;
  }
  const hour = t.match(/\b(\d{1,2})\s*(?:h|heures?)\s*(\d{2})?\b/);
  if (hour) {
    d.setHours(Math.min(23, parseInt(hour[1], 10)), hour[2] ? parseInt(hour[2], 10) : 0, 0, 0);
    touched = true;
  } else if (/\bce matin\b|\bmatin\b/.test(t)) {
    d.setHours(8, 0, 0, 0);
    touched = true;
  } else if (/\bmidi\b/.test(t)) {
    d.setHours(12, 30, 0, 0);
    touched = true;
  } else if (/\bce soir\b|\bsoir\b/.test(t)) {
    d.setHours(20, 0, 0, 0);
    touched = true;
  }

  if (!touched) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
