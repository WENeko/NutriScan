# Enrichir le prompt local on-device

## Objectif
Réintégrer dans le prompt local (modèles `.litertlm`/`.task` exécutés sur l'appareil) les consignes retirées lors de la compaction, en restant sous la fenêtre de contexte de 4096 tokens (partagée entre l'entrée ET la réponse JSON). Le prompt cloud reste inchangé.

## Contexte / contrainte
- `maxNumTokens` = 4096 (entrée + sortie).
- Le system prompt local actuel fait ~281 tokens. La réponse JSON (repas multi-items avec ~16 micronutriments chacun) peut consommer 1 500–2 500 tokens.
- Budget réaliste pour enrichir le system prompt local : viser ~450–600 tokens max (contre 281 aujourd'hui), afin de garder une marge confortable pour la réponse. On réintègre donc l'essentiel, en formulation compacte, sans recopier tout le prompt cloud verbatim.

## Modifications

### `supabase/functions/_shared/mealAnalysisPrompt.ts` → `buildLocalSystemContent()`
Réintégrer, en formulation compacte (pas de longues listes verbeuses) :

1. **Détection d'unités — exemples clés** : ajouter une poignée d'exemples courts pour ancrer la règle, ex. `"3 oeufs"->unit_count=3,unit_label="oeuf"; "2 tranches jambon"->2,"tranche"; "200g riz"->poids brut`. Ajouter une mini-liste d'aliments comptables condensée : `oeufs, tranches, portions fromage, biscuits, crepes, saucisses, nuggets, fruits entiers, tomates cerises`.

2. **Graisses cachées chiffrées** : remplacer « si frit estime plutôt haut » par la consigne précise `si aspect brillant/frit, ajoute +5 a +10g de lipides`.

3. **Indices visuels (image)** : ajouter `sur photo, utilise couverts et assiette pour estimer les portions; si ambigu choisis l'option la plus calorique`.

Garder : format JSON compact, tous les nutriments obligatoires (0 si inconnu), `suggested_timestamp` ISO, `total_summary`.

### Bornage du texte utilisateur — `buildLocalUserPromptText()`
- Relever la troncature de la description utilisateur de **500 → ~900 caractères** (marge disponible avec 4096 tokens), pour ne plus couper les descriptions de repas longs.
- Relever le contexte références perso de 240 → ~400 caractères.

### Références perso — `buildLocalCustomFoodsContext()`
- Passer de **2 → 3** aliments correspondants max, et la troncature du bloc compact de 220 → ~400 caractères.

## Vérification
- Estimer le nombre de tokens du nouveau system prompt local via un petit script `bun`/node (approx. 4 chars/token) pour confirmer qu'il reste ≤ ~600 tokens.
- Confirmer que le budget total (system + user + réponse) reste sous 4096 avec une marge (viser system+user ≤ ~1200 tokens).
- Vérifier que le typecheck passe.

## Hors périmètre
- Aucun changement au prompt cloud (`buildSystemContent` / `buildUserPromptText`).
- Aucun changement au moteur natif Kotlin (`maxNumTokens` reste à 4096).
