/**
 * Ordre personnalisé des favoris (par utilisateur), partagé par la section
 * Favoris du tableau de bord et le widget d'écran d'accueil.
 * Clé d'ordre = nom du repas (les favoris sont dédoublonnés par nom).
 */
const key = (userId: string) => `nutriscan:favorite-order:${userId}`;

export function loadFavoriteOrder(userId: string | null | undefined): string[] {
  if (!userId) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveFavoriteOrder(userId: string | null | undefined, order: string[]): void {
  if (!userId) return;
  localStorage.setItem(key(userId), JSON.stringify(order));
}

export const favoriteKey = (m: { meal_name?: string | null; id: string }) => m.meal_name || m.id;

/** Favoris ordonnés : ceux déjà classés d'abord, puis les nouveaux dans leur ordre d'origine. */
export function applyFavoriteOrder<T extends { meal_name?: string | null; id: string }>(meals: T[], order: string[]): T[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  return meals
    .map((m, i) => ({ m, i, r: rank.get(favoriteKey(m)) }))
    .sort((a, b) => {
      if (a.r != null && b.r != null) return a.r - b.r;
      if (a.r != null) return -1;
      if (b.r != null) return 1;
      return a.i - b.i;
    })
    .map((x) => x.m);
}

/** Déplace l'élément `index` de `delta` positions (borné). */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
