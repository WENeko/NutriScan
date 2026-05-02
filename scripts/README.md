# Scripts de Migration et Maintenance

## Problème : Les repas ne s'enregistrent pas dans la BDD personnelle

### Cause racine
Les utilisateurs existent dans la BDD Lovable mais pas dans la BDD personnelle. La table `meals` a une foreign key sur `auth.users(id)` qui empêche l'insertion si l'utilisateur n'existe pas.

### Solutions

#### Option 1 : Désactiver temporairement la FK (rapide, pour test)
```sql
-- Dans la BDD perso, désactiver temporairement la contrainte FK
ALTER TABLE public.meals DROP CONSTRAINT IF EXISTS meals_user_id_fkey;
ALTER TABLE public.meal_items DROP CONSTRAINT IF EXISTS meal_items_user_id_fkey;
```

#### Option 2 : Migration complète (recommandée)

1. **Exécuter la migration SQL** sur la BDD perso :
   ```bash
   # Se connecter à Supabase SQL Editor pour la BDD perso
   # Copier-coller le contenu de:
   # /supabase/migrations/20260502140000_sync_users_and_schema.sql
   ```

2. **Installer les dépendances pour le script** :
   ```bash
   cd scripts
   npm install @supabase/supabase-js dotenv
   ```

3. **Configurer les variables** dans `scripts/.env` :
   ```
   VITE_SUPABASE_URL=https://votre-projet-lovable.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
   VITE_PERSONAL_SUPABASE_URL=https://votre-projet-perso.supabase.co
   VITE_PERSONAL_SUPABASE_ANON_KEY=eyJ...
   ```

4. **Exécuter la migration** :
   ```bash
   node migrate-users.js
   ```

#### Option 3 : Création automatique des utilisateurs (solution long terme)

Modifier l'application pour créer automatiquement l'utilisateur dans la BDD perso lors de la première sauvegarde :

```typescript
// Dans mealPersistenceService.ts, avant d'insérer un meal:
const ensureUserExists = async (userId: string, email: string) => {
  // 1. Vérifier si l'utilisateur existe dans auth.users de la BDD perso
  // 2. Sinon, créer le profil via une edge function avec privilèges admin
};
```

### Vérification post-migration

1. **Vérifier les profils** :
   ```sql
   SELECT count(*) FROM profiles;
   ```

2. **Tester une sauvegarde** :
   - Ouvrir la console navigateur (F12)
   - Saisir un repas et cliquer "Enregistrer"
   - Vérifier les logs `[saveMealWithDualWrite]` et `[MealInput]`

3. **Vérifier dans Supabase** :
   ```sql
   -- Lovable
   SELECT * FROM meals ORDER BY created_at DESC LIMIT 5;
   
   -- Perso
   SELECT * FROM meals ORDER BY created_at DESC LIMIT 5;
   ```

### Logs à surveiller

Dans la console navigateur, chercher :
- `[MealInput] Sauvegarde avec userId:` - Début de la sauvegarde
- `[saveMealWithDualWrite] Démarrage sauvegarde:` - Données reçues
- `[saveMealWithDualWrite] Échec insertion meal sur DB Perso:` - Erreur
- `[MealInput] Repas sauvegardé:` - Succès

### Structure finale des tables (BDD Perso)

Après migration, vos tables doivent avoir :

**meals** :
- id, user_id, meal_name, created_at
- total_calories, total_proteins, total_carbs, total_fats
- total_fiber, total_sodium_mg, total_potassium_mg, ... (tous les micronutriments)
- timestamp, image_url

**meal_items** :
- id, meal_id, user_id, name, quantity
- calories, proteins, carbs, fats
- fiber, sodium_mg, potassium_mg, ... (tous les micronutriments)
- nutrients_std (JSONB pour compatibilité)

**profiles** :
- id, user_id (FK auth.users), email
- goals (JSONB), water_goal_ml, etc.
