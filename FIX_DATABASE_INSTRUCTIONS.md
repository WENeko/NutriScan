# 🔧 FIX RAPIDE - Base de données personnelle

## Le problème
Les repas ne s'enregistrent pas dans votre BDD perso car la structure des tables est différente de Lovable.

## La solution (2 minutes)

### Étape 1 : Ouvrir Supabase SQL Editor
1. Allez sur https://supabase.com/dashboard
2. Cliquez sur votre projet **personnel** (pas Lovable)
3. Dans le menu de gauche, cliquez sur **"SQL Editor"**

### Étape 2 : Copier-coller le script
1. Ouvrez le fichier : `/supabase/migrations/FIX_DATABASE_PERSO.sql`
2. Copiez tout le contenu (Ctrl+A, Ctrl+C)
3. Dans SQL Editor, collez le script
4. Cliquez sur **"Run"**

### Étape 3 : Vérifier
Le script affichera :
```
status: Tables modifiées avec succès !
meals_columns: 25+
meal_items_columns: 20+
has_profiles: 1
```

### C'est tout ! 🎉

Votre application peut maintenant :
- ✅ Enregistrer les repas dans les DEUX bases
- ✅ Synchroniser automatiquement les utilisateurs
- ✅ Stocker tous les micronutriments

---

## Si ça ne marche toujours pas

Ouvrez la console navigateur (F12) et cherchez les messages :
- `[DB Sync]` = Synchronisation BDD
- `[MealInput]` = Sauvegarde repas
- `[saveMealWithDualWrite]` = Détails de l'enregistrement

Envoyez-moi les messages d'erreur que vous voyez.

---

## Fichiers modifiés automatiquement

L'application gère maintenant automatiquement :
1. **Création du profil** dans BDD perso si manquant
2. **Vérification de santé** au démarrage
3. **Logging détaillé** pour debug

Les fichiers créés/modifiés :
- ✅ `src/services/databaseSyncService.ts` - Sync auto
- ✅ `src/services/mealPersistenceService.ts` - Adaptation double BDD
- ✅ `src/components/MealInput.tsx` - Intégration sync
- ✅ `supabase/migrations/FIX_DATABASE_PERSO.sql` - Script de fix

---

**Besoin d'aide ?** Copiez-collez les messages de la console (F12) ici.
