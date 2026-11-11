import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/** Files stay in the app cache until the recipient has finished reading them. */
export async function deliverReportFile(blob: Blob, filename: string) {
  if (Capacitor.isNativePlatform()) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1]) : reject(new Error("Fichier illisible"));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const { uri } = await Filesystem.writeFile({ path: `reports/${filename}`, data, directory: Directory.Cache, recursive: true });
    await Share.share({ title: "Bilan NutriScan", files: [uri], dialogTitle: "Enregistrer ou partager le bilan" });
    return;
  }
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Bilan NutriScan" }); return; }
    catch (e) { if ((e as DOMException).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}