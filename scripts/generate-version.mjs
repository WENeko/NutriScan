#!/usr/bin/env node
// Génère android/version.properties : incrémente le patch du jour (FF).
// Utilisé par la CI AVANT `npm run build` et `./gradlew assembleRelease`.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { computeVersion, versionFilePath } from "./version.mjs";

const { versionName, versionCode, patch } = computeVersion();
const target = versionFilePath();
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `versionName=${versionName}\nversionCode=${versionCode}\n`);
console.log(`[version] ${versionName} (${versionCode}) patch #${patch} -> ${target}`);
