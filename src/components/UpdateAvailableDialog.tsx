import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { canInstallApk, checkForUpdate, currentVersionName, downloadAndInstall, isNativeUpdateSupported, openInstallSettings, RELEASE_PAGE_URL, skipUpdate, type UpdateInfo } from "@/services/appUpdate";

/** Sober startup notice: only installed and available versions. */
export default function UpdateAvailableDialog() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => { void checkForUpdate().then(r => { if (active) setInfo(r); }); }, 1500);
    return () => { active = false; clearTimeout(t); };
  }, []);
  const later = () => { if (info) skipUpdate(info); setInfo(null); };
  const install = async () => {
    if (!info) return;
    if (!isNativeUpdateSupported() || !info.apkUrl) { window.open(RELEASE_PAGE_URL, "_blank", "noopener,noreferrer"); setInfo(null); return; }
    try {
      if (!(await canInstallApk())) { await openInstallSettings(); return; }
      setPercent(0);
      await downloadAndInstall(info, setPercent);
      setInfo(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Téléchargement impossible"); }
    finally { setPercent(null); }
  };
  const busy = percent !== null;
  return <Dialog open={!!info} onOpenChange={open => { if (!open && !busy) later(); }}>
    <DialogContent className="max-w-[88vw] rounded-lg sm:max-w-sm">
      <DialogHeader><DialogTitle>Mise à jour disponible</DialogTitle>
        <DialogDescription>Version actuelle {currentVersionName()} · Nouvelle version {info?.versionName}</DialogDescription></DialogHeader>
      {busy && <Progress value={percent ?? 0} />}
      <DialogFooter className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" disabled={busy} onClick={later}>Plus tard</Button>
        <Button className="flex-1" disabled={busy} onClick={() => void install()}>Mettre à jour</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
