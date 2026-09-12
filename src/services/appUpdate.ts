/**
 * Vérificateur de mise à jour : compare la version installée à la dernière
 * release publiée sur GitHub (WENeko/NutriScan) et permet de télécharger puis
 * installer l'APK directement depuis l'appli (Android).
 *
 * Le versioning est CalVer : tag `v2026.09.12.01` -> versionCode 2026091201.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { appLogger } from "@/services/appLogger";

const GITHUB_REPO = "WENeko/NutriScan";
const LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const RELEASE_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const SKIP_KEY = "nutriscan-update-skipped";

interface ApkUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(opts: { url: string; fileName?: string }): Promise<{ installed: boolean }>;
  addListener(
    event: "downloadProgress",
    cb: (data: { percent: number; downloaded: number; total: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const ApkUpdater = registerPlugin<ApkUpdaterPlugin>("ApkUpdater");

export interface UpdateInfo {
  versionName: string;
  versionCode: number;
  apkUrl: string | null;
  notes: string;
  publishedAt: string | null;
  sizeBytes: number | null;
}

/** `v2026.09.12.01` ou `2026.09.12.01` -> 2026091201 */
function versionCodeFromName(name: string): number {
  const digits = name.replace(/^v/i, "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function currentVersionCode(): number {
  const raw = typeof __APP_VERSION_CODE__ === "string" ? __APP_VERSION_CODE__ : "";
  return Number(raw) || 0;
}

export function currentVersionName(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
}

/** Récupère la dernière release publiée, ou null en cas d'échec réseau. */
export async function fetchLatestRelease(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(LATEST_URL, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!res.ok) {
      appLogger.warn("update", `GitHub a répondu ${res.status}`);
      return null;
    }
    const data = await res.json();
    const tag: string = data?.tag_name ?? data?.name ?? "";
    if (!tag) return null;

    const assets: Array<{ name: string; browser_download_url: string; size: number }> =
      Array.isArray(data?.assets) ? data.assets : [];
    const apk =
      assets.find((a) => /\.apk$/i.test(a.name) && !/debug/i.test(a.name)) ??
      assets.find((a) => /\.apk$/i.test(a.name)) ??
      null;

    return {
      versionName: tag.replace(/^v/i, ""),
      versionCode: versionCodeFromName(tag),
      apkUrl: apk?.browser_download_url ?? null,
      notes: typeof data?.body === "string" ? data.body : "",
      publishedAt: data?.published_at ?? null,
      sizeBytes: apk?.size ?? null,
    };
  } catch (e) {
    appLogger.warn("update", `Vérification impossible: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Retourne la mise à jour disponible (plus récente et non ignorée), sinon null. */
export async function checkForUpdate(options?: { ignoreSkipped?: boolean }): Promise<UpdateInfo | null> {
  const latest = await fetchLatestRelease();
  if (!latest) return null;
  if (latest.versionCode <= currentVersionCode()) return null;
  if (!options?.ignoreSkipped && localStorage.getItem(SKIP_KEY) === String(latest.versionCode)) return null;
  return latest;
}

export function skipUpdate(info: UpdateInfo) {
  localStorage.setItem(SKIP_KEY, String(info.versionCode));
}

export function isNativeUpdateSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function canInstallApk(): Promise<boolean> {
  if (!isNativeUpdateSupported()) return false;
  try {
    const { allowed } = await ApkUpdater.canInstall();
    return allowed;
  } catch {
    return false;
  }
}

export async function openInstallSettings(): Promise<void> {
  if (!isNativeUpdateSupported()) return;
  await ApkUpdater.openInstallSettings();
}

/** Télécharge l'APK puis ouvre l'écran d'installation d'Android. */
export async function downloadAndInstall(
  info: UpdateInfo,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (!info.apkUrl) throw new Error("Aucun fichier APK dans cette release");
  if (!isNativeUpdateSupported()) throw new Error("Mise à jour intégrée disponible uniquement sur Android");

  const handle = onProgress
    ? await ApkUpdater.addListener("downloadProgress", ({ percent }) => onProgress(percent))
    : null;
  try {
    await ApkUpdater.downloadAndInstall({
      url: info.apkUrl,
      fileName: `NutriScan-${info.versionName}.apk`,
    });
  } finally {
    await handle?.remove();
  }
}
