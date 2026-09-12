/**
 * Pop-up de mise à jour : s'affiche à l'ouverture de l'appli quand une version
 * plus récente est publiée en "latest" sur GitHub.
 */
import { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  UpdateInfo,
  canInstallApk,
  checkForUpdate,
  currentVersionName,
  downloadAndInstall,
  isNativeUpdateSupported,
  openInstallSettings,
  RELEASE_PAGE_URL,
  skipUpdate,
} from "@/services/appUpdate";

const UpdateDialog = () => {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [needsPermission, setNeedsPermission] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Léger différé pour ne pas concurrencer le chargement du tableau de bord
    const timer = setTimeout(async () => {
      const update = await checkForUpdate();
      if (cancelled || !update) return;
      setInfo(update);
      setOpen(true);
      if (isNativeUpdateSupported()) setNeedsPermission(!(await canInstallApk()));
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const later = () => {
    if (info) skipUpdate(info);
    setOpen(false);
  };

  const install = async () => {
    if (!info) return;
    if (!isNativeUpdateSupported() || !info.apkUrl) {
      window.open(RELEASE_PAGE_URL, "_blank");
      return;
    }
    if (!(await canInstallApk())) {
      setNeedsPermission(true);
      await openInstallSettings();
      return;
    }
    setDownloading(true);
    setPercent(0);
    try {
      await downloadAndInstall(info, setPercent);
      toast.success("Téléchargement terminé", {
        description: "Suivez l'écran d'installation d'Android pour finaliser.",
      });
    } catch (e) {
      toast.error("Mise à jour impossible", {
        description: e instanceof Error ? e.message : "Erreur inconnue",
      });
    } finally {
      setDownloading(false);
    }
  };

  if (!info) return null;

  const sizeMb = info.sizeBytes ? (info.sizeBytes / (1024 * 1024)).toFixed(1) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !downloading && setOpen(v)}>
      <DialogContent className="max-w-[92vw] sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Nouvelle version disponible
          </DialogTitle>
          <DialogDescription>
            NutriScan {info.versionName} est disponible (vous utilisez {currentVersionName()})
            {sizeMb ? ` — ${sizeMb} Mo` : ""}.
          </DialogDescription>
        </DialogHeader>

        {info.notes && (
          <p className="text-xs text-muted-foreground whitespace-pre-line max-h-32 overflow-y-auto rounded-xl bg-muted/50 p-3">
            {info.notes.slice(0, 600)}
          </p>
        )}

        {needsPermission && !downloading && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            Android demandera une autorisation unique pour installer les mises à jour depuis NutriScan.
          </p>
        )}

        {downloading && (
          <div className="space-y-2">
            <Progress value={percent} />
            <p className="text-xs text-muted-foreground text-center">Téléchargement… {percent}%</p>
          </div>
        )}

        <DialogFooter className="flex-row gap-2">
          <Button variant="ghost" onClick={later} disabled={downloading} className="flex-1">
            Plus tard
          </Button>
          <Button onClick={install} disabled={downloading} className="flex-1 gap-2">
            {downloading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Mettre à jour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateDialog;
