import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { currentVersionName, installedReleaseNotes, markInstalledVersionSeen } from "@/services/appUpdate";
import type { ReleaseNotesEntry } from "@/utils/release-notes";

/** Only installed-version release notes; never interrupts startup with a download offer. */
export default function UpdateDialog() {
  const [notes, setNotes] = useState<ReleaseNotesEntry[]>([]);
  useEffect(() => {
    let active = true;
    void installedReleaseNotes().then(entries => { if (active) setNotes(entries); });
    return () => { active = false; };
  }, []);
  const close = () => { markInstalledVersionSeen(); setNotes([]); };
  return <Dialog open={notes.length > 0} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-w-[92vw] rounded-lg sm:max-w-md">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Quoi de neuf</DialogTitle>
        <DialogDescription>NutriScan {currentVersionName()} · Mise à jour installée</DialogDescription></DialogHeader>
      <div className="max-h-[55dvh] space-y-6 overflow-y-auto break-words text-sm text-foreground">
        {notes.map(entry => <section key={entry.versionCode} className="space-y-3">
          <h3 className="border-b border-border pb-2 font-semibold">Version {entry.versionName}</h3>
          {entry.changes.flatMap(change => change.sections.map((section, index) => <div key={`${change.id}-${index}`} className="space-y-1">
            <h4 className="font-medium">{section.title}</h4>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{section.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
          </div>))}
        </section>)}
      </div>
      <DialogFooter><Button onClick={close}>C’est compris</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
