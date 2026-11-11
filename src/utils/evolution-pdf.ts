import { jsPDF } from "jspdf";
import { adherence, correlation, reportWeeks, type ReportDay } from "./evolution-report";

/** Text-based paginated PDF: never screenshot or clip the report. */
export function evolutionPdf(days: ReportDay[], tolerance: number): Blob {
  const doc = new jsPDF();
  let y = 18;
  const line = (text: string, size = 10) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 178) as string[];
    for (const row of lines) {
      if (y > 275) { doc.addPage(); y = 18; }
      doc.text(row, 16, y); y += size * 0.5 + 2;
    }
  };
  const n = (v: number | null) => v === null ? "-" : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const measure = (value: number | null, delta: number | null) => `${n(value)}${delta === null ? "" : ` (delta ${delta > 0 ? "+" : ""}${n(delta)})`}`;
  line("NutriScan - Bilan nutrition et activité", 16);
  line(`${days[0]?.date ?? ""} au ${days.at(-1)?.date ?? ""}`);
  line("Données enregistrées ; valeurs indisponibles : -");
  line(`Respect des objectifs : tolérance +/- ${tolerance} %`, 12);
  for (const type of ["training", "rest"] as const) {
    const a = adherence(days, type, tolerance);
    line(`${type === "training" ? "Entraînement prévu" : "Repos prévu"} : ${n(a.percent)} % (${a.conforming}/${a.count} jours)`);
  }
  const weeks = reportWeeks(days);
  line("IQM et variations corporelles", 12);
  for (const [key, title] of [["weight", "Poids"], ["bodyFat", "Masse grasse"], ["muscle", "Masse musculaire"]] as const) {
    const c = correlation(weeks, key);
    line(`${title} : r = ${n(c.r)} ; ${c.n} semaines appariées`);
  }
  line("Association descriptive, pas une causalité. IQM hebdomadaire : au moins 3 jours à couverture complète. Les deltas comparent des mesures réelles ; après une semaine sans pesée, l'intervalle peut dépasser 7 jours.");
  for (const w of weeks) {
    line(`Semaine du ${w.date} - IQM ${n(w.iqm)}/100 (${w.days} jours)`, 11);
    line(`Poids kg : ${measure(w.weightValue, w.weight)} | MG % : ${measure(w.bodyFatValue, w.bodyFat)} | Muscle kg : ${measure(w.muscleValue, w.muscle)}`);
  }
  line("Détail quotidien", 12);
  for (const d of days) {
    line(`${d.date} - ${d.type === "training" ? "Entraînement" : "Repos"}${d.exception ? " (exception)" : ""}${d.completed ? "" : " (en cours)"}`);
    line(`Cible ${n(d.goal)} kcal ; consommé ${n(d.calories)} kcal ; P ${n(d.proteins)} g, G ${n(d.carbs)} g, L ${n(d.fats)} g`);
    line(`IQM ${n(d.iqm)} ; couverture ${Math.round(d.coverage * 100)} % ; fibres ${n(d.fiber)} g ; oméga-3 ${n(d.omega3)} mg`);
    line(`Poids ${n(d.weight)} kg ; MG ${n(d.bodyFat)} % ; muscle ${n(d.muscle)} kg ; séances ${n(d.sessions)} ; durée ${n(d.minutes)} min`);
  }
  return doc.output("blob");
}