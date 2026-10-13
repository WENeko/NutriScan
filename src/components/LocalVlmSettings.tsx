import React, { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { BrainCircuit, Loader2, Trash2, Upload } from "lucide-react";
import {
  deleteVlmFile, getHybridDetector, importVlmFile, listVlmFiles, setHybridDetector,
  type HybridDetector, type VlmFile,
} from "@/services/hybrid/localVlm";
import { isMicroAiPassEnabled, setMicroAiPassEnabled } from "@/services/hybrid/microCompletion";

const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(2)} Go` : `${Math.round(b / 1e6)} Mo`);

/** Choix du détecteur photo du mode hybride + gestion des fichiers MiniCPM-V (GGUF + mmproj). */
const LocalVlmSettings: React.FC = () => {
  const isNative = Capacitor.isNativePlatform();
  const [detector, setDetector] = useState<HybridDetector>(getHybridDetector());
  const [files, setFiles] = useState<VlmFile[]>([]);
  const [busy, setBusy] = useState<null | "model" | "mmproj">(null);
  const [aiPass, setAiPass] = useState(isMicroAiPassEnabled());

  const refresh = useCallback(async () => {
    if (!isNative) return;
    try { setFiles(await listVlmFiles()); } catch { /* ignoré */ }
  }, [isNative]);
  useEffect(() => { void refresh(); }, [refresh]);

  const choose = (d: HybridDetector) => { setHybridDetector(d); setDetector(d); };

  const doImport = async (kind: "model" | "mmproj") => {
    setBusy(kind);
    try {
      const r = await importVlmFile(kind);
      toast({ title: kind === "model" ? "Modèle importé" : "Projecteur importé", description: `${r.model} — ${fmtSize(r.size)}` });
      await refresh();
    } catch (e: any) {
      if (!/annulé/i.test(e?.message ?? "")) toast({ title: "Import impossible", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const doDelete = async (name: string) => {
    if (!window.confirm(`Supprimer « ${name} » ?`)) return;
    try { await deleteVlmFile(name); await refresh(); } catch (e: any) {
      toast({ title: "Suppression impossible", description: e?.message, variant: "destructive" });
    }
  };

  const hasModel = files.some((f) => f.kind === "model");
  const hasProj = files.some((f) => f.kind === "mmproj");

  return (
    <Card className="bg-card rounded-2xl p-4 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <BrainCircuit className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Détecteur photo du mode hybride</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["laya", "vlm"] as HybridDetector[]).map((d) => (
          <button key={d} onClick={() => choose(d)}
            className={`rounded-lg px-3 py-2 text-xs transition-colors ${detector === d ? "bg-accent border border-primary/40" : "bg-muted/40 hover:bg-muted"}`}>
            {d === "laya" ? "Laya ONNX" : "MiniCPM-V (VLM local)"}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Le détecteur identifie seulement les aliments et leurs grammes. Les nutriments viennent toujours des bases (bibliothèque, CIQUAL, Open Food Facts…).
      </p>

      {detector === "vlm" && (!isNative ? (
        <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2">Disponible uniquement dans l'application Android.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button size="sm" variant={hasModel ? "outline" : "default"} className="flex-1 h-9 rounded-xl" disabled={!!busy} onClick={() => doImport("model")}>
              {busy === "model" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}1. Modèle
            </Button>
            <Button size="sm" variant={hasProj ? "outline" : "default"} className="flex-1 h-9 rounded-xl" disabled={!!busy} onClick={() => doImport("mmproj")}>
              {busy === "mmproj" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}2. Projecteur
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            1 : <span className="font-mono">MiniCPM-V-4_6-Q4_K_M.gguf</span> — 2 : <span className="font-mono">mmproj / F16.gguf</span>. La copie de ~2 Go peut prendre une minute.
          </p>
          {files.map((f) => (
            <div key={f.name} className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-[10px] uppercase text-muted-foreground w-14 shrink-0">{f.kind === "mmproj" ? "Projecteur" : "Modèle"}</span>
              <span className="flex-1 truncate font-mono">{f.name}</span>
              <span className="text-muted-foreground shrink-0">{fmtSize(f.size)}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Supprimer ${f.name}`} onClick={() => doDelete(f.name)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            {hasModel && hasProj ? "✅ VLM prêt pour les photos du mode hybride." : "Importez les deux fichiers pour activer le VLM."}
          </p>
        </div>
      ))}

      <div className="flex items-start justify-between gap-3 pt-2 border-t border-border">
        <div>
          <p className="text-xs font-medium">Compléter les micronutriments manquants par IA</p>
          <p className="text-[10px] text-muted-foreground">
            Après CIQUAL, Open Food Facts, USDA et la base canadienne, l'IA remplit seulement les cases encore vides (valeurs marquées « IA »).
          </p>
        </div>
        <Switch checked={aiPass} onCheckedChange={(v) => { setAiPass(v); setMicroAiPassEnabled(v); }} />
      </div>
    </Card>
  );
};

export default LocalVlmSettings;
