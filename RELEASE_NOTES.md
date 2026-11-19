# Nouveautés des APK

Les textes sont rédigés dans `src/data/changelog.json`. Pour chaque livraison, ajouter un bloc avec un **nouvel identifiant stable** et des sections de nouveautés/corrections. Ne pas réutiliser un identifiant déjà publié pour une nouvelle correction : il sert à éviter les répétitions lors d’une recompilation.

Le lancement **manuel** du workflow Android :
1. Calcule la véritable version CalVer du nouvel APK.
2. Récupère `release-history.json` de la dernière release GitHub.
3. Associe les blocs encore inédits à la nouvelle version.
4. Embarque l’historique complet dans l’application et publie cet historique avec les APK.
5. Renseigne automatiquement la description GitHub avec les nouveautés de cette version.

Après installation, « Quoi de neuf » affiche hors ligne toutes les entrées plus récentes que la dernière version acquittée, jusqu’à la version installée, de la plus récente à la plus ancienne. Fermer la fenêtre ou choisir « C’est compris » acquitte la version installée. Une première installation ne présente pas d’historique de mise à jour.

**Initialisation :** les anciennes releases ne possèdent pas encore d’archive structurée. Le premier APK utilisant ce mécanisme présente donc un récapitulatif initial des améliorations présentes, sans inventer leurs anciens numéros de publication. Le cumul précis commence avec cet APK. Ne pas supprimer l’asset `release-history.json` des releases suivantes ; une erreur de récupération arrête le workflow plutôt que de perdre l’historique.

Vérifications ciblées :
```sh
node --test scripts/tests/release-notes.test.mjs
bunx vitest run src/utils/release-notes.test.ts src/services/appUpdate.test.ts src/components/UpdateDialog.test.tsx
python3 scripts/tests/test_android_workflow.py
```