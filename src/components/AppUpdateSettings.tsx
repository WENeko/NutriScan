import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { toast } from "sonner";
import { canInstallApk, currentVersionCode, currentVersionName, downloadAndInstall, fetchLatestRelease, isNativeUpdateSupported, openInstallSettings, RELEASE_PAGE_URL, type UpdateInfo } from "@/services/appUpdate";

export default function AppUpdateSettings() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => { let active = true; void fetchLatestRelease().then(r => { if (active && r && r.versionCode > currentVersionCode()) setInfo(r); }); return () => { active = false; }; }, []);
  const check = async () => {
    setBusy(true);
    try {
      const r = await fetchLatestRelease();
      setInfo(r && r.versionCode > currentVersionCode() ? r : null);
      setStatus(!r ? "Vérification impossible. Réessayez." : r.versionCode > currentVersionCode() ? "" : "Votre version est à jour.");
    } finally { setBusy(false); }
  };
  const install = async () => {
    if (!info) return;
    if (!isNativeUpdateSupported()) { window.open(RELEASE_PAGE_URL, "_blank", "noopener,noreferrer"); return; }
    setBusy(true);
    try {
      if (!(await canInstallApk())) { await openInstallSettings(); setStatus("Autorisez l’installation, puis touchez à nouveau Mettre à jour."); return; }
      setPercent(0);
      await downloadAndInstall(info, setPercent);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Téléchargement impossible"); }
    finally { setBusy(false); setPercent(null); }
  };
  return <section className="space-y-3 border-b border-border py-5">
    <h2 className="font-display text-base font-semibold">Mises à jour</h2>
    <p className="text-sm text-muted-foreground">Version {currentVersionName()}</p>
    {info && <p className="text-sm text-primary">Nouvelle version · {info.versionName}</p>}
    {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
    {percent !== null && <><Progress value={percent} /><p className="text-xs">Téléchargement… {percent}%</p></>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void check()}><RefreshCw />Vérifier les mises à jour</Button>
      {info && <Button disabled={busy} onClick={() => void install()}><Download />Mettre à jour</Button>}</div>
  </section>;
}