/**
 * Charge les catégories de micronutriments depuis la BDD
 * (table micronutrient_categories). Source unique de vérité pour les
 * libellés et l'ordre d'affichage.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MicroCategory {
  key: string;
  label: string;
  display_order: number;
}

const FALLBACK: MicroCategory[] = [
  { key: "macro", label: "Macros associés", display_order: 1 },
  { key: "mineral", label: "Minéraux", display_order: 2 },
  { key: "vitamin", label: "Vitamines", display_order: 3 },
  { key: "lipid", label: "Lipides", display_order: 4 },
];

let cache: MicroCategory[] | null = null;

export function useMicroCategories(): {
  categories: MicroCategory[];
  labelOf: (key: string) => string;
  loading: boolean;
} {
  const [categories, setCategories] = useState<MicroCategory[]>(cache || FALLBACK);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("micronutrient_categories" as any)
        .select("key,label,display_order")
        .order("display_order", { ascending: true });
      if (alive && data && Array.isArray(data) && data.length) {
        cache = data as any;
        setCategories(data as any);
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const labelOf = (key: string) =>
    categories.find((c) => c.key === key)?.label ?? key;

  return { categories, labelOf, loading };
}
