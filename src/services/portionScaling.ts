/**
 * Source unique de vérité pour la correction d'échelle optique (distance photo).
 * Utilisée quel que soit le mode d'analyse (cloud, hybride Laya, local, manuel).
 *
 * - calibrated : poids unitaire imposé (œuf, pot, tranche industrielle) → rien ne bouge.
 * - variable   : dénombrable de taille libre (boulettes…) → compte figé, poids unitaire dilaté.
 * - bulk       : masse continue (riz, purée…) → poids total dilaté.
 */
import { findFoodReference } from "./hybrid/foodReferenceTable";

export type UnitKind = "calibrated" | "variable" | "bulk";

export interface ScalableItem {
  name: string;
  quantity: string;
  unitCount?: number;
  unitWeightG?: number;
  isCustom?: boolean;
}

export function classifyUnitKind(item: ScalableItem): UnitKind {
  const ref = findFoodReference(item.name);
  if (ref && ref.score >= 0.75 && ref.food.unitWeightG) {
    return ref.food.unitKind ?? "calibrated";
  }
  if (item.unitCount && item.unitWeightG) {
    // Portion de la bibliothèque perso = poids déclaré par l'utilisateur → calibré.
    return item.isCustom ? "calibrated" : "variable";
  }
  return "bulk";
}

/** Calcule le nouveau poids total et les champs d'unité après correction de distance. */
export function scaleForDistance(
  item: ScalableItem,
  factor: number,
): { newWeight: number; unitCount?: number; unitWeightG?: number } | null {
  const kind = classifyUnitKind(item);
  if (kind === "calibrated") return null;
  if (kind === "variable" && item.unitCount && item.unitWeightG) {
    const unitWeightG = Math.max(1, Math.round(item.unitWeightG * factor));
    return { newWeight: unitWeightG * item.unitCount, unitCount: item.unitCount, unitWeightG };
  }
  const w = item.unitCount && item.unitWeightG
    ? item.unitCount * item.unitWeightG
    : parseFloat(String(item.quantity).replace(",", "."));
  if (!Number.isFinite(w) || w <= 0) return null;
  return { newWeight: Math.max(1, Math.round(w * factor)) };
}
