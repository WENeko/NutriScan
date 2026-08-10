// Source unique de vérité du versioning CalVer de l'application.
// versionName : YYYY.MM.DD.FF (ex: 2026.08.07.01 = 1er build du jour)
// versionCode : YYYYMMDDFF    (FF = numéro de build du jour, 01 -> 99)
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pad = (n) => String(n).padStart(2, "0");

export function versionFilePath() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return resolve(root, "android/version.properties");
}

export function readVersionFile(path = versionFilePath()) {
  try {
    const raw = readFileSync(path, "utf8");
    const get = (key) => raw.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
    const versionName = get("versionName");
    const versionCode = Number(get("versionCode"));
    if (!versionName || !Number.isFinite(versionCode)) return null;
    return { versionName, versionCode };
  } catch {
    return null;
  }
}

// Calcule la version suivante : même jour => FF +1, nouveau jour => FF 01.
// Garantit toujours un versionCode strictement supérieur au précédent.
// Version précédente : priorité à NUTRISCAN_PREV_VERSION_CODE (fourni par la CI
// à partir des tags Git) car android/version.properties versionné dans le repo
// est identique à chaque build et empêcherait FF de s'incrémenter.
export function previousVersion() {
  const env = Number(process.env.NUTRISCAN_PREV_VERSION_CODE);
  const fromFile = readVersionFile();
  if (Number.isFinite(env) && env > 0) {
    const code = String(env);
    const fromEnv = {
      versionCode: env,
      versionName: `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6, 8)}.${code.slice(8)}`,
    };
    if (!fromFile || fromFile.versionCode < env) return fromEnv;
  }
  return fromFile;
}

export function computeVersion(now = new Date(), previous = previousVersion()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const today = `${y}${pad(m)}${pad(d)}`;

  let patch = 1;
  if (previous && String(previous.versionCode).startsWith(today)) {
    const prevPatch = Number(String(previous.versionCode).slice(8)) || 0;
    patch = Math.min(prevPatch + 1, 99);
  }

  let versionCode = Number(`${today}${pad(patch)}`);
  // Filet de sécurité (horloge décalée / date antérieure) : monotonie stricte.
  if (previous && Number.isFinite(previous.versionCode) && versionCode <= previous.versionCode) {
    versionCode = previous.versionCode + 1;
  }

  const code = String(versionCode);
  const versionName = `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6, 8)}.${code.slice(8)}`;

  return { versionName, versionCode, patch };
}
