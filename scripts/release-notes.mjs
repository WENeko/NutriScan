import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readVersionFile } from "./version.mjs";

export function prepareReleaseHistory(changelog, previous, version) {
  if (!version || !/^\d{4}\.\d{2}\.\d{2}\.\d{2}$/.test(version.versionName) ||
      Number(version.versionName.replaceAll(".", "")) !== version.versionCode) {
    throw new Error("Version CalVer invalide");
  }
  if (!Array.isArray(previous) || !Array.isArray(changelog.changes)) throw new Error("Historique invalide");
  const ids = new Set();
  for (const entry of previous) {
    if (!Array.isArray(entry.changes) || !Number.isInteger(entry.versionCode) ||
        Number(entry.versionName?.replaceAll(".", "")) !== entry.versionCode || entry.versionCode >= version.versionCode) {
      throw new Error("Historique incompatible avec la version à publier");
    }
    for (const change of entry.changes) ids.add(change.id);
  }
  const newChanges = changelog.changes.filter(change => !ids.has(change.id));
  const unique = new Set();
  for (const change of changelog.changes) {
    if (!change.id || unique.has(change.id) || !Array.isArray(change.sections) || !change.sections.length ||
        change.sections.some(section => !section.title || !Array.isArray(section.items) || !section.items.length || section.items.some(item => typeof item !== "string" || !item.trim()))) {
      throw new Error("Notes de version invalides ou identifiant dupliqué");
    }
    unique.add(change.id);
  }
  return [...previous, { ...version, changes: newChanges }].sort((a, b) => a.versionCode - b.versionCode);
}

export function releaseMarkdown(entry) {
  const sections = entry.changes.flatMap(change => change.sections);
  const notes = sections.map(section => `### ${section.title}\n${section.items.map(item => `- ${item}`).join("\n")}`).join("\n\n");
  return `## NutriScan ${entry.versionName}\n\n${notes || "Aucune nouveauté supplémentaire : nouvelle compilation de la version précédente."}\n\nAPK release signé : installation par-dessus la version existante, sans désinstaller.\n\n<!-- nutriscan-release-history-v1 -->\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const previousPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!previousPath || !outputPath) throw new Error("Usage : release-notes.mjs historique.json notes.md");
  const history = prepareReleaseHistory(
    JSON.parse(readFileSync("src/data/changelog.json", "utf8")),
    JSON.parse(readFileSync(previousPath, "utf8")),
    readVersionFile(),
  );
  writeFileSync("src/data/release-history.json", JSON.stringify(history, null, 2) + "\n");
  const current = history.at(-1);
  if (!current) throw new Error("Notes absentes");
  writeFileSync(outputPath, releaseMarkdown(current));
  console.log(`Notes préparées pour ${current.versionName} ; ${history.length} versions archivées.`);
}