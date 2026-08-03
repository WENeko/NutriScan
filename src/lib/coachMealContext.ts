/**
 * Contexte repas pour le Nutri-Coach.
 *
 * Fournit une « recherche intelligente » côté client : le coach reçoit dans son
 * prompt les repas pertinents de l'utilisateur (détail des aliments + macros),
 * afin de pouvoir répondre à des questions du type
 * « quelle portion du repas de ce midi me faut-il pour compléter mes macros ? ».
 *
 * Stratégie :
 *  1. Aujourd'hui + hier : détail complet (chaque aliment, quantité, macros).
 *  2. 7 derniers jours : totaux journaliers résumés.
 *  3. Recherche par mots-clés de la question sur 60 jours (repas correspondants),
 *     utile quand l'utilisateur évoque un repas plus ancien (« mes pâtes bolo »).
 *
 * Le résultat est borné en taille pour rester compatible avec les modèles à
 * petite fenêtre de contexte (y compris local_intent).
 */
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, subDays } from "date-fns";
import { fr } from "date-fns/locale";

interface MealRow {
  id: string;
  timestamp: string;
  meal_name: string | null;
  total_calories: number | null;
  total_proteins: number | null;
  total_carbs: number | null;
  total_fats: number | null;
}

interface ItemRow {
  meal_id: string;
  name: string;
  quantity: string | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
}

const STOP_WORDS = new Set([
  "quelle","quel","quels","quelles","portion","portions","repas","que","qui","quoi","dont","mon","ma","mes",
  "le","la","les","un","une","des","du","de","au","aux","et","ou","pour","avec","sans","dans","sur","par",
  "je","tu","il","elle","nous","vous","ils","elles","ai","as","a","ont","est","sont","me","moi","te","se",
  "mange","mangé","mangee","mangée","manger","midi","soir","matin","hier","aujourd","aujourdhui","hui",
  "faut","completer","compléter","depasser","dépasser","quota","quotas","macros","macro","calories","lipides",
  "glucides","proteines","protéines","journalier","quotidien","jour","journee","journée","ce","cette","cet",
  "combien","comment","plus","moins","reste","restant","restants","si","fais","donne","dis","peux","dois",
]);

function slot(d: Date): string {
  const h = d.getHours();
  if (h < 10.5) return "petit-déjeuner";
  if (h < 14.5) return "midi";
  if (h < 18) return "collation";
  return "soir";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function keywords(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
    ),
  ).slice(0, 6);
}

function describeMeal(m: MealRow, items: ItemRow[]): string {
  const d = new Date(m.timestamp);
  const head = `• ${format(d, "EEEE dd/MM", { locale: fr })} ${format(d, "HH:mm")} (${slot(d)}) — ${
    m.meal_name || "Repas"
  } : ${num(m.total_calories)} kcal, P ${num(m.total_proteins)}g / G ${num(m.total_carbs)}g / L ${num(m.total_fats)}g`;
  if (items.length === 0) return head;
  const detail = items
    .slice(0, 12)
    .map(
      (it) =>
        `    - ${it.name}${it.quantity ? ` (${it.quantity})` : ""} : ${num(it.calories)} kcal, P ${num(
          it.proteins,
        )}g / G ${num(it.carbs)}g / L ${num(it.fats)}g`,
    )
    .join("\n");
  return `${head}\n${detail}`;
}

/**
 * Construit le bloc de contexte repas à injecter dans le system prompt du coach.
 * @param userId utilisateur courant
 * @param question message de l'utilisateur (pour la recherche par mots-clés)
 * @param maxChars borne de taille du bloc
 */
export async function buildCoachMealContext(
  userId: string,
  question: string,
  maxChars = 3500,
): Promise<string> {
  try {
    const now = new Date();
    const since48h = startOfDay(subDays(now, 1)).toISOString();
    const since7d = startOfDay(subDays(now, 6)).toISOString();
    const since60d = startOfDay(subDays(now, 59)).toISOString();

    const select = "id, timestamp, meal_name, total_calories, total_proteins, total_carbs, total_fats";

    const { data: recent } = await supabase
      .from("meals")
      .select(select)
      .eq("user_id", userId)
      .gte("timestamp", since48h)
      .order("timestamp", { ascending: true });

    const { data: week } = await supabase
      .from("meals")
      .select(select)
      .eq("user_id", userId)
      .gte("timestamp", since7d)
      .order("timestamp", { ascending: true });

    // Recherche par mots-clés (repas plus anciens évoqués dans la question)
    const kws = keywords(question);
    let matched: MealRow[] = [];
    if (kws.length > 0) {
      const orName = kws.map((k) => `meal_name.ilike.%${k}%`).join(",");
      const { data: byName } = await supabase
        .from("meals")
        .select(select)
        .eq("user_id", userId)
        .gte("timestamp", since60d)
        .or(orName)
        .order("timestamp", { ascending: false })
        .limit(5);
      matched = (byName as MealRow[]) ?? [];

      const { data: byItem } = await supabase
        .from("meal_items")
        .select("meal_id, name")
        .or(kws.map((k) => `name.ilike.%${k}%`).join(","))
        .limit(40);
      const ids = Array.from(new Set(((byItem as any[]) ?? []).map((i) => i.meal_id)));
      if (ids.length > 0) {
        const { data: byItemMeals } = await supabase
          .from("meals")
          .select(select)
          .eq("user_id", userId)
          .gte("timestamp", since60d)
          .in("id", ids)
          .order("timestamp", { ascending: false })
          .limit(5);
        matched = [...matched, ...((byItemMeals as MealRow[]) ?? [])];
      }
    }

    const recentRows = (recent as MealRow[]) ?? [];
    const recentIds = new Set(recentRows.map((m) => m.id));
    const matchedUnique = matched
      .filter((m) => !recentIds.has(m.id))
      .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
      .slice(0, 5);

    const detailIds = [...recentRows.map((m) => m.id), ...matchedUnique.map((m) => m.id)];
    const itemsByMeal: Record<string, ItemRow[]> = {};
    if (detailIds.length > 0) {
      const { data: items } = await supabase
        .from("meal_items")
        .select("meal_id, name, quantity, calories, proteins, carbs, fats")
        .in("meal_id", detailIds);
      ((items as ItemRow[]) ?? []).forEach((it) => {
        (itemsByMeal[it.meal_id] ||= []).push(it);
      });
    }

    const lines: string[] = ["JOURNAL ALIMENTAIRE DE L'UTILISATEUR (données réelles) :"];

    const todayKey = format(now, "yyyy-MM-dd");
    const todayMeals = recentRows.filter((m) => format(new Date(m.timestamp), "yyyy-MM-dd") === todayKey);
    const yesterdayMeals = recentRows.filter((m) => format(new Date(m.timestamp), "yyyy-MM-dd") !== todayKey);

    lines.push("", `Aujourd'hui (${format(now, "dd/MM/yyyy")}) :`);
    lines.push(
      todayMeals.length
        ? todayMeals.map((m) => describeMeal(m, itemsByMeal[m.id] ?? [])).join("\n")
        : "• aucun repas enregistré.",
    );

    if (yesterdayMeals.length) {
      lines.push("", "Hier :");
      lines.push(yesterdayMeals.map((m) => describeMeal(m, itemsByMeal[m.id] ?? [])).join("\n"));
    }

    const weekRows = (week as MealRow[]) ?? [];
    if (weekRows.length) {
      const byDay: Record<string, { kcal: number; p: number; c: number; f: number }> = {};
      weekRows.forEach((m) => {
        const k = format(new Date(m.timestamp), "dd/MM");
        const acc = (byDay[k] ||= { kcal: 0, p: 0, c: 0, f: 0 });
        acc.kcal += num(m.total_calories);
        acc.p += num(m.total_proteins);
        acc.c += num(m.total_carbs);
        acc.f += num(m.total_fats);
      });
      lines.push("", "Totaux des 7 derniers jours :");
      lines.push(
        Object.entries(byDay)
          .map(([d, v]) => `• ${d} : ${v.kcal} kcal, P ${v.p}g / G ${v.c}g / L ${v.f}g`)
          .join("\n"),
      );
    }

    if (matchedUnique.length) {
      lines.push("", `Repas plus anciens correspondant à la question (${kws.join(", ")}) :`);
      lines.push(matchedUnique.map((m) => describeMeal(m, itemsByMeal[m.id] ?? [])).join("\n"));
    }

    lines.push(
      "",
      "Utilise ces données réelles pour répondre (portions, restes, ajustements). " +
        "Si la question porte sur un repas précis (ex. « ce midi »), identifie-le par son horodatage ci-dessus " +
        "et raisonne au prorata des grammages/macros de ses aliments. Si l'information manque, dis-le clairement.",
    );

    const block = lines.join("\n");
    return block.length > maxChars ? `${block.slice(0, maxChars)}\n…(contexte tronqué)` : block;
  } catch {
    return "";
  }
}
