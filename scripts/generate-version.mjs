#!/usr/bin/env node
// Génère android/version.properties à partir du CalVer courant.
// Utilisé par la CI avant `./gradlew assembleRelease`.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { computeVersion } from "./version.mjs";

const { versionName, versionCode } = computeVersion();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "android/version.properties");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `versionName=${versionName}\nversionCode=${versionCode}\n`);
console.log(`[version] ${versionName} (${versionCode}) -> ${target}`);
