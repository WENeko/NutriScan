/**
 * Préférence d'affichage : actions rapides visibles sur la carte repas.
 * Stockée localement (par appareil) et diffusée via un événement custom
 * pour que l'historique se mette à jour immédiatement après changement.
 */
import { useEffect, useState } from "react";

export type MealAction = "duplicate" | "favorite" | "reevaluate" | "edit" | "delete";

export const MEAL_ACTIONS: { value: MealAction; label: string; emoji: string }[] = [
  { value: "duplicate", label: "Dupliquer", emoji: "📋" },
  { value: "favorite", label: "Favoris", emoji: "❤️" },
  { value: "reevaluate", label: "Réévaluer par l'IA", emoji: "🪄" },
  { value: "edit", label: "Éditer", emoji: "✏️" },
  { value: "delete", label: "Supprimer", emoji: "🗑️" },
];

export const MAX_QUICK_ACTIONS = 2;
export const DEFAULT_QUICK_ACTIONS: MealAction[] = ["duplicate"];

const STORAGE_KEY = "nutriscan-meal-quick-actions";
const EVENT = "nutriscan-meal-quick-actions-changed";

const VALID = new Set<string>(MEAL_ACTIONS.map((a) => a.value));

export function readQuickActions(): MealAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_ACTIONS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_ACTIONS;
    return parsed.filter((v): v is MealAction => typeof v === "string" && VALID.has(v)).slice(0, MAX_QUICK_ACTIONS);
  } catch {
    return DEFAULT_QUICK_ACTIONS;
  }
}

export function writeQuickActions(actions: MealAction[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actions.slice(0, MAX_QUICK_ACTIONS)));
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useMealQuickActions(): [MealAction[], (a: MealAction[]) => void] {
  const [actions, setActions] = useState<MealAction[]>(() => readQuickActions());

  useEffect(() => {
    const sync = () => setActions(readQuickActions());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [
    actions,
    (next: MealAction[]) => {
      setActions(next.slice(0, MAX_QUICK_ACTIONS));
      writeQuickActions(next);
    },
  ];
}
