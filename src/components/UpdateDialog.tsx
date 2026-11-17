import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { installedReleaseNotes, markInstalledVersionSeen, type UpdateInfo } from "@/services/appUpdate";

/** Only installed-version release notes; never interrupts startup with a download offer. */
export default function UpdateDialog() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    let active = true;
    void installedReleaseNotes().then(notes => { if (active) setInfo(notes); });
    return () => { active = false; };
  }, []);
  const close = () => { markInstalledVersionSeen(); setInfo(null); };
  return <Dialog open={!!info} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-w-[92vw] rounded-lg sm:max-w-md">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Quoi de neuf</DialogTitle>
        <DialogDescription>NutriScan {info?.versionName} · Mise à jour installée</DialogDescription></DialogHeader>
      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm text-foreground">{info?.notes}</div>
      <DialogFooter><Button onClick={close}>C’est compris</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
