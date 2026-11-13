import { jsPDF } from "jspdf";
import { adherence, correlation, reportWeeks, type ReportDay } from "./evolution-report";

export interface ReportPalette {
  paper: string; ink: string; muted: string; accent: string; tint: string; rule: string;
}

/** Paper colors come from the global design tokens, not the current dark/light theme. */
export function reportPalette(): ReportPalette {
  const css = getComputedStyle(document.documentElement);
  const read = (role: string) => css.getPropertyValue(`--report-${role}`).trim();
  return { paper: read("paper"), ink: read("ink"), muted: read("muted"), accent: read("accent"), tint: read("tint"), rule: read("rule") };
}

/** Data-based tables: repeating headers, whole rows and no screenshots or WebView printing. */
export function evolutionPdf(days: ReportDay[], tolerance: number, palette = reportPalette()): Blob {
  const doc = new jsPDF();
  const margin = 15, width = 180, bottom = 276;
  let y = 0;
  const date = (s: string) => s.split("-").reverse().join("/");
  const range = days.length ? `${date(days[0].date)} au ${date(days.at(-1)?.date ?? "")}` : "Aucune donnée";
  doc.setProperties({ title: `NutriScan · Bilan ${range}`, author: "NutriScan", subject: "Nutrition, activité et composition corporelle" });
  const text = (s: string, x: number, top: number, size = 9, bold = false, color = palette.ink, align: "left" | "right" = "left") => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(s, x, top, { align });
  };
  const page = (first = false) => {
    if (!first) doc.addPage();
    doc.setFillColor(palette.accent); doc.rect(0, 0, 210, 3, "F");
    text("NutriScan", margin, 16, 17, true, palette.accent);
    text(range, 195, 16, 9, false, palette.muted, "right");
    doc.setDrawColor(palette.rule); doc.line(margin, 22, 195, 22);
    y = 31;
  };
  const paragraph = (s: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const lines = doc.splitTextToSize(s, width) as string[];
    for (const line of lines) {
      if (y + 4 > bottom) page();
      text(line, margin, y, 8, false, palette.muted); y += 4;
    }
    y += 4;
  };
  const title = (s: string) => {
    if (y + 18 > bottom) page();
    text(s, margin, y, 12, true); y += 8;
  };
  const table = (headers: string[], widths: number[], rows: string[][], right: number[] = []) => {
    const header = () => {
      doc.setFillColor(palette.accent); doc.rect(margin, y, width, 9, "F");
      let x = margin;
      headers.forEach((h, i) => { text(h, x + 2, y + 5.8, 8, true, palette.paper); x += widths[i]; });
      y += 9;
    };
    if (y + 19 > bottom) page();
    header();
    rows.forEach((cells, row) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      const wrapped = cells.map((s, i) => doc.splitTextToSize(s, widths[i] - 4) as string[]);
      const height = Math.max(7.5, Math.max(...wrapped.map(lines => lines.length)) * 4 + 3.5);
      if (y + height > bottom) { page(); header(); }
      if (row % 2 === 0) { doc.setFillColor(palette.tint); doc.rect(margin, y, width, height, "F"); }
      let x = margin;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, j) => text(line, right.includes(i) ? x + widths[i] - 2 : x + 2, y + 5.4 + j * 4, 8, false, palette.ink, right.includes(i) ? "right" : "left"));
        x += widths[i];
      });
      y += height;
      doc.setDrawColor(palette.rule); doc.line(margin, y, 195, y);
    });
    y += 8;
  };
  const n = (v: number | null) => v === null ? "-" : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ");
  const measure = (v: number | null, delta: number | null) => `${n(v)}${delta === null ? "" : `\n(${delta > 0 ? "+" : ""}${n(delta)})`}`;
  const qualified = days.filter(d => d.completed && d.logged && d.iqm !== null && (d.calories ?? 0) > 0);
  const energy = qualified.reduce((s, d) => s + (d.calories ?? 0), 0);
  const average = energy ? qualified.reduce((s, d) => s + (d.iqm ?? 0) * (d.calories ?? 0), 0) / energy : null;
  page(true);
  text("Bilan nutrition & activité", margin, y, 19, true); y += 8;
  text(`Édité le ${new Date().toLocaleString("fr-FR")}`, margin, y, 8, false, palette.muted); y += 10;
  const training = adherence(days, "training", tolerance), rest = adherence(days, "rest", tolerance);
  const metrics = [
    ["IQM moyen pondéré", `${n(average)} / 100`, `${qualified.length} jours exploitables`],
    ["Entraînement prévu", `${n(training.percent)} %`, `${training.conforming} / ${training.count} jours conformes`],
    ["Repos prévu", `${n(rest.percent)} %`, `${rest.conforming} / ${rest.count} jours conformes`],
  ];
  metrics.forEach(([label, value, detail], i) => {
    const x = margin + i * 61;
    doc.setFillColor(palette.tint); doc.rect(x, y, 58, 29, "F");
    text(label, x + 3, y + 6, 8, true, palette.muted);
    text(value, x + 3, y + 15, 17, true, palette.accent);
    text(detail, x + 3, y + 23, 8, false, palette.muted);
  });
  y += 36;
  paragraph(`${days.filter(d => d.completed && d.logged).length} jours renseignés et terminés. Tolérance calorique : +/- ${tolerance} %. Valeurs indisponibles : -. Les jours en cours sont exclus de la synthèse ; les cibles absentes ne sont pas reconstituées.`);
  const weeks = reportWeeks(days);
  title("IQM & variations corporelles");
  table(["Mesure", "Corrélation r", "Semaines appariées"], [70, 50, 60], ([["weight", "Poids"], ["bodyFat", "Masse grasse"], ["muscle", "Masse musculaire"]] as const).map(([key, label]) => {
    const c = correlation(weeks, key);
    return [label, c.r === null ? "Données insuffisantes" : n(c.r), String(c.n)];
  }));
  paragraph("Associations descriptives, sans preuve de causalité ni validation clinique de l’IQM. Profil IQM actuel. IQM hebdomadaire : au moins 3 jours avec IQM calculé ; corrélation : au moins 4 semaines appariées.");
  title("Mesures hebdomadaires");
  table(["Semaine du", "IQM / 100", "Jours", "Poids kg", "MG %", "Muscle kg"], [31, 28, 17, 35, 34, 35], weeks.map(w => [date(w.date), n(w.iqm), String(w.days), measure(w.weightValue, w.weight), measure(w.bodyFatValue, w.bodyFat), measure(w.muscleValue, w.muscle)]), [1, 2, 3, 4, 5]);
  paragraph("Entre parenthèses : variation des mesures réelles. Une semaine sans pesée reste vide ; la comparaison avec la dernière mesure connue peut couvrir plus de 7 jours. La masse grasse varie en points de pourcentage.");
  if (days.length) {
    page(); title("Détail quotidien · nutrition");
    table(["Date", "Type prévu", "kcal / cible", "P / G / L (g)", "IQM", "Couv."], [25, 32, 36, 48, 20, 19], days.map(d => [date(d.date), `${d.type === "training" ? "Entraînement" : "Repos"}${d.exception ? " *" : ""}${d.completed ? "" : "\nEn cours"}`, `${n(d.calories)} / ${n(d.goal)}`, `${n(d.proteins)} / ${n(d.carbs)} / ${n(d.fats)}`, n(d.iqm), `${Math.round(d.coverage * 100)} %`]), [2, 3, 4, 5]);
    paragraph("* Exception confirmée. P : protéines ; G : glucides ; L : lipides. Couv. : couverture du calcul IQM ; un score partiel n’entre pas dans la synthèse.");
    page(); title("Détail quotidien · qualité & activité");
    table(["Date", "Fibres g", "Oméga-3 mg", "Poids kg", "MG %", "Muscle kg", "Séances / min"], [25, 22, 28, 25, 23, 25, 32], days.map(d => [date(d.date), n(d.fiber), n(d.omega3), n(d.weight), n(d.bodyFat), n(d.muscle), `${n(d.sessions)} / ${n(d.minutes)}`]), [1, 2, 3, 4, 5, 6]);
    paragraph("Séances : uniquement les sources approuvées. Valeurs vides si la lecture sportive est indisponible. Les mesures corporelles sont affichées à leur date réelle, sans interpolation.");
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setDrawColor(palette.rule); doc.line(margin, 282, 195, 282);
    text("NutriScan · Associations descriptives, non causales", margin, 288, 7, false, palette.muted);
    text(`Page ${i} sur ${pages}`, 195, 288, 8, false, palette.muted, "right");
  }
  return doc.output("blob");
}