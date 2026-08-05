// Source unique de vérité du versioning CalVer de l'application.
// versionName : YYYY.M.PATCH  (ex: 2026.8.5)
// versionCode : YYYYMMDDHH    (entier strictement croissant, ex: 2026080501)
export function computeVersion(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const h = now.getHours();
  const pad = (n) => String(n).padStart(2, "0");
  const versionName = `${y}.${m}.${d}`;
  const versionCode = Number(`${y}${pad(m)}${pad(d)}${pad(h)}`);
  return { versionName, versionCode };
}
