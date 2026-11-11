import { useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { loadEvolutionReport } from "@/services/evolution-report";
import { adherence, correlation, reportCsv, reportWeeks, type ReportDay } from "@/utils/evolution-report";
import { deliverReportFile } from "@/services/report-file";
import { toast } from "@/hooks/use-toast";
import "./EvolutionReport.css";

const display = (n: number | null, digits = 1) =>
  n === null ? "—" : n.toLocaleString("fr", { maximumFractionDigits: digits });

export default function EvolutionReport({ userId }: { userId: string }) {
  const [period, setPeriod] = useState<"7d" | "28d" | "all">("28d");
  const [days, setDays] = useState<ReportDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tolerance, setTolerance] = useState(7.5);
  const [preview, setPreview] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setDays([]);
    loadEvolutionReport(userId, period)
      .then((data) => {
        if (!cancelled) setDays(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, period, retry]);

  const weeks = useMemo(() => reportWeeks(days), [days]);
  const complete = days.filter((d) => d.completed && d.logged);

  // Filtrage assoupli : accepte les jours avec un score IQM et des calories réelles
  const qualified = complete.filter((d) => d.iqm !== null && d.coverage >= 0.999 && (d.calories ?? 0) > 0);
  const energy = qualified.reduce((s, d) => s + (d.calories ?? 0), 0);
  const average = energy
    ? qualified.reduce((s, d) => s + (d.iqm ?? 0) * (d.calories ?? 0), 0) / energy
    : null;

  const range = days.length
    ? `${format(parseISO(days[0].date), "dd/MM/yyyy")} – ${format(parseISO(days[days.length - 1].date), "dd/MM/yyyy")}`
    : "";

  const exportFile = async (pdf: boolean) => {
    setExporting(true);
    try {
      let blob: Blob;
      if (pdf) {
        // Chargement dynamique : jsPDF n'est téléchargé qu'au moment de l'export
        const { evolutionPdf } = await import("@/utils/evolution-pdf");
        blob = evolutionPdf(days, tolerance);
      } else {
        blob = new Blob([reportCsv(days)], { type: "text/csv;charset=utf-8;" });
      }
      await deliverReportFile(blob, `NutriScan-bilan-${days[0]?.date}-${days.at(-1)?.date}.${pdf ? "pdf" : "csv"}`);
    } catch {
      toast({ title: "Export impossible", description: "Le bilan n’a pas pu être enregistré ou partagé. Réessayez.", variant: "destructive" });
    } finally { setExporting(false); }
  };


  const formatDelta = (val: number | null, delta: number | null, unit = "") => {
    if (val === null && delta === null) return "—";
    const valText = val !== null ? `${display(val)}${unit}` : "—";
    const deltaText = delta !== null ? ` (${delta > 0 ? "+" : ""}${display(delta)})` : "";
    return `${valText}${deltaText}`;
  };

  const summary = (
    <div className="space-y-5">
      <header className="border-b pb-4">
        <h2 className="font-display text-lg font-semibold">NutriScan · Bilan nutrition & activité</h2>
        <p className="text-sm text-muted-foreground">{range}</p>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-xs text-muted-foreground">Jours renseignés et terminés</p>
            <b className="text-2xl">{complete.length}</b>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">IQM moyen pondéré</p>
            <b className="text-2xl text-primary">
              {display(average, 0)}
              <span className="text-xs text-muted-foreground"> / 100</span>
            </b>
            <p className="text-xs text-muted-foreground">{qualified.length} jours exploitables</p>
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <h3 className="font-semibold">Respect des objectifs · ±{tolerance} %</h3>
        {(["training", "rest"] as const).map((type) => {
          const result = adherence(days, type, tolerance);
          return (
            <div key={type} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{type === "training" ? "Entraînement prévu" : "Repos prévu"}</span>
                <b>{display(result.percent, 0)} %</b>
              </div>
              <progress
                className="report-progress w-full h-2"
                max={100}
                value={result.percent ?? 0}
                aria-label={type === "training" ? "Adhérence entraînement" : "Adhérence repos"}
              />
              <p className="text-xs text-muted-foreground">
                {result.conforming} / {result.count} jours avec repas et cible enregistrée
              </p>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Aujourd’hui et les jours sans saisie sont exclus. Les objectifs manquants ne sont pas
          reconstitués. Type prévu : routine actuelle et exceptions confirmées, jamais basculé
          automatiquement par une séance.
        </p>
      </section>

      <section className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">IQM & variations corporelles</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              ["weight", "Poids"],
              ["bodyFat", "Masse grasse"],
              ["muscle", "Masse musculaire"],
            ] as const
          ).map(([key, label]) => {
            const result = correlation(weeks, key);
            return (
              <div key={key} className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <b className="text-lg">
                  {result.r === null ? "Données insuffisantes" : `r = ${display(result.r, 2)}`}
                </b>
                <p className="text-xs text-muted-foreground">{result.n} semaines appariées</p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Au moins 3 jours d’IQM à couverture complète et 1 pesée par semaine ; 4 semaines appariées pour une corrélation.
          Après une semaine sans pesée, le delta compare les dernières mesures réelles et peut couvrir plus de 7 jours.
          Association descriptive, pas une preuve de causalité ni une validation clinique de l’IQM. Le
          profil IQM actuel est utilisé.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <caption className="sr-only">Mesures hebdomadaires</caption>
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2">Semaine du</th>
                <th>IQM</th>
                <th>Jours</th>
                <th>Poids (Δ kg)</th>
                <th>Masse grasse (Δ)</th>
                <th>Masse musc. (Δ)</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.date} className="border-b">
                  <td className="py-2">{format(parseISO(w.date), "dd/MM/yyyy")}</td>
                  <td className="text-center">{display(w.iqm, 0)}</td>
                  <td className="text-center">{w.days}</td>
                  <td className="text-center">{formatDelta(w.weightValue, w.weight, " kg")}</td>
                  <td className="text-center">{formatDelta(w.bodyFatValue, w.bodyFat, " %")}</td>
                  <td className="text-center">{formatDelta(w.muscleValue, w.muscle, " kg")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {days.every((d) => d.sessions === null) && (
        <p className="text-xs text-muted-foreground">
          Séances approuvées indisponibles sur cet appareil ou sans autorisation ; les exports laissent ces
          valeurs vides.
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex bg-muted rounded-lg p-1 gap-1" aria-label="Période du bilan">
        {(["7d", "28d", "all"] as const).map((p) => (
          <Button
            key={p}
            variant={p === period ? "secondary" : "ghost"}
            className="flex-1 text-xs"
            aria-pressed={p === period}
            onClick={() => setPeriod(p)}
          >
            {p === "7d" ? "7 jours" : p === "28d" ? "4 semaines" : "Global"}
          </Button>
        ))}
      </div>

      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Chargement du bilan…
        </p>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p>Impossible de charger le bilan.</p>
          <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
            <RefreshCw /> Réessayer
          </Button>
        </div>
      ) : (
        <>
          {!complete.length && (
            <p className="text-sm text-muted-foreground">
              Aucun repas renseigné sur un jour terminé pour cette période.
            </p>
          )}
          <div className="space-y-2 max-w-md">
            <label className="text-xs font-medium">Tolérance calorique : ±{tolerance} %</label>
            <Slider
              aria-label="Tolérance calorique"
              min={2.5}
              max={20}
              step={2.5}
              value={[tolerance]}
              onValueChange={([v]) => setTolerance(v)}
            />
          </div>
          {summary}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" disabled={!days.length || exporting} onClick={() => void exportFile(false)}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" disabled={!days.length} onClick={() => setPreview(true)}>
              <Printer /> Bilan imprimable
            </Button>
            <Button variant="outline" disabled={!days.length || exporting} onClick={() => void exportFile(true)}>
              <Download /> {exporting ? "Export…" : "Exporter PDF"}
            </Button>
          </div>
        </>
      )}

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="report-print-root max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Bilan · {range}</DialogTitle>
          <DialogDescription>
            Nutrition, activité et mesures corporelles enregistrées.
          </DialogDescription>
          {summary}
          <Button className="report-no-print" disabled={exporting} onClick={() => void exportFile(true)}>
            <Download /> {exporting ? "Export…" : "Exporter PDF"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
