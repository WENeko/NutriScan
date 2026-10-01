import React, { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ScanEye, RefreshCw, Upload, Check, Loader2, Trash2, Tags } from "lucide-react";
import {
  isLayaAvailable,
  listLayaModels,
  importLayaModel,
  deleteLayaModel,
  getSelectedLayaModel,
  setSelectedLayaModel,
  getLayaLabels,
  setLayaLabels,
  parseLabelsFile,
} from "@/services/hybrid/layaVision";

/**
 * Carte de gestion du modèle de détection visuelle Laya-Vision (étage 1 du
 * pipeline hybride) : recherche des modèles .onnx/.tflite sur l'appareil,
 * import depuis les fichiers et sélection du modèle actif.
 */
const LayaModelSettings: React.FC = () => {
  const isNative = Capacitor.isNativePlatform();
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(getSelectedLayaModel());
  const [available, setAvailable] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const labelsInput = useRef<HTMLInputElement>(null);
  const [labelsCount, setLabelsCount] = useState(0);

  useEffect(() => {
    setLabelsCount(getLayaLabels(selected)?.length ?? 0);
  }, [selected]);

  const handleLabelsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected) return;
    const labels = parseLabelsFile(await file.text());
    if (labels.length < 2) {
      toast({ title: "Fichier de classes illisible", variant: "destructive" });
      return;
    }
    setLayaLabels(selected, labels);
    setLabelsCount(labels.length);
    toast({ title: "Noms des plats associés", description: `${labels.length} classes pour ${selected}` });
  };

  const scan = useCallback(async () => {
    if (!isNative) return;
    setScanning(true);
    try {
      const found = await listLayaModels();
      setModels(found);
      setAvailable(await isLayaAvailable());
      if (found.length > 0 && !getSelectedLayaModel()) {
        setSelectedLayaModel(found[0]);
        setSelected(found[0]);
      }
    } catch (e: any) {
      toast({ title: "Recherche impossible", description: e?.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [isNative]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importLayaModel();
      toast({ title: "Modèle importé", description: res.model });
      await scan();
    } catch (e: any) {
      if (!/annulé/i.test(e?.message ?? "")) {
        toast({ title: "Import impossible", description: e?.message, variant: "destructive" });
      }
    } finally {
      setImporting(false);
    }
  };

  const handleSelect = (name: string) => {
    setSelectedLayaModel(name);
    setSelected(name);
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`Supprimer le modèle « ${name} » ?`)) return;
    try {
      const res = await deleteLayaModel(name);
      if (selected === name) setSelected(null);
      toast({
        title: "Modèle supprimé",
        description: res.stillInDownloads
          ? "Une copie reste dans vos Téléchargements : supprimez-la aussi pour qu'il disparaisse de la liste."
          : name,
      });
      await scan();
    } catch (e: any) {
      toast({ title: "Suppression impossible", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Card className="bg-card rounded-2xl p-4 shadow-card space-y-3">
      <div className="flex items-center gap-2">
        <ScanEye className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Détection visuelle locale (Laya-Vision)</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Modèle de décision on-device (photo → aliments + pesée estimée en grammes, sans réseau).
        Importez le fichier <span className="font-mono">laya_vision_int8.onnx</span> depuis vos Téléchargements.
      </p>

      {!isNative ? (
        <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2">
          Disponible uniquement dans l'application Android native.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Button onClick={scan} variant="outline" size="sm" disabled={scanning} className="flex-1 h-9 rounded-xl">
              {scanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Rechercher
            </Button>
            <Button onClick={handleImport} size="sm" disabled={importing} className="flex-1 h-9 rounded-xl">
              {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
              Importer un modèle
            </Button>
          </div>

          {models.length === 0 ? (
            <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2">
              Aucun modèle détecté. Importez un fichier <span className="font-mono">.onnx</span> ou{" "}
              <span className="font-mono">.tflite</span>.
            </p>
          ) : (
            <div className="space-y-1.5">
              {models.map((m) => (
                <div key={m} className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleSelect(m)}
                    className={`flex-1 min-w-0 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-left transition-colors ${
                      selected === m ? "bg-accent border border-primary/40" : "bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    <span className="flex-1 truncate font-mono">{m}</span>
                    {selected === m && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    aria-label={`Supprimer ${m}`}
                    onClick={() => handleDelete(m)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-1">
              <input ref={labelsInput} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={handleLabelsFile} />
              <Button onClick={() => labelsInput.current?.click()} variant="outline" size="sm" className="w-full h-9 rounded-xl">
                <Tags className="w-4 h-4 mr-1" />
                Importer la liste des classes (.json)
              </Button>
              <p className="text-[10px] text-muted-foreground">
                {labelsCount > 0
                  ? `${labelsCount} noms de plats exacts associés à ce modèle.`
                  : "Sans fichier, la liste ISIA Food-500 / Food-101 intégrée est utilisée (ordre alphabétique)."}
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            {available
              ? "✅ Détection locale prête — le mode hybride utilisera ce modèle pour les photos."
              : "Le mode hybride photo sera actif dès qu'un modèle sera importé."}
          </p>
        </>
      )}
    </Card>
  );
};

export default LayaModelSettings;
