import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const ReportDownload = registerPlugin<{
  save(options: { uri: string; filename: string; mimeType: string }): Promise<{ saved: boolean; location?: string }>;
}>("ReportDownload");

async function cacheReport(blob: Blob, filename: string) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1]) : reject(new Error("Fichier illisible"));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return Filesystem.writeFile({ path: `reports/${filename}`, data, directory: Directory.Cache, recursive: true });
}

/** Browser branch executes synchronously, while the click still has user activation. */
export async function deliverReportFile(blob: Blob, filename: string) {
  if (Capacitor.getPlatform() === "android") {
    const { uri } = await cacheReport(blob, filename);
    return ReportDownload.save({ uri, filename, mimeType: blob.type.split(";")[0] });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { saved: true };
}

export function canShareReportFiles() {
  return Capacitor.isNativePlatform() || !!navigator.canShare?.({
    files: [new File([""], "bilan.pdf", { type: "application/pdf" })],
  });
}

/** Sharing is explicit and never a silent fallback for a download. */
export async function shareReportFile(blob: Blob, filename: string) {
  try {
    if (Capacitor.isNativePlatform()) {
      const { uri } = await cacheReport(blob, filename);
      await Share.share({ title: "Bilan NutriScan", files: [uri], dialogTitle: "Partager le bilan" });
    } else {
      const file = new File([blob], filename, { type: blob.type });
      if (!navigator.canShare?.({ files: [file] })) throw new Error("Partage indisponible");
      await navigator.share({ files: [file], title: "Bilan NutriScan" });
    }
  } catch (e) {
    if ((e as DOMException).name !== "AbortError") throw e;
  }
}